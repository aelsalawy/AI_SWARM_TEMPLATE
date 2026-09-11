/**
 * dispatch-sweeper.ts — 4-pass dispatch sweeper (T7).
 *
 * Design contract: docs/agent-trigger-assessment.md §8.4.
 *
 * Runs on a setInterval (default 60s; QA injects DISPATCH_TEST_SWEEP_INTERVAL_MS).
 * Guarded to a single instance via a module-level `started` flag so multiple
 * imports / hot reloads never spawn duplicate intervals.
 *
 * Passes:
 *   S1  PM wake retry   — pmState='pending' (PM wake not confirmed): re-wake the
 *                         PM every sweep, ≤5 attempts → pmState='failed' +
 *                         [PM-UNREACHABLE] → ESCALATION_AGENT_ID inbox.
 *   S2  PM no-act       — pmState='notified' + item still TODO/Open + age >
 *                         PM_NO_ACT_MS: nudge the PM (pmNudges++, ≤ PM_NUDGE_MAX)
 *                         via a PM inbox row; exhausted → pmState='stuck' +
 *                         [PM-NO-ACT] → ESCALATION_AGENT_ID inbox.
 *   S3  Assignee wake   — wakeState='pending' (assignee spawn not confirmed):
 *                         re-wake the assignee, ≤5 attempts → wakeState='failed'.
 *   S4  No-claim        — wakeState='sent' + spawnedAt older than 30 min + item
 *                         still TODO/Open: [DISPATCH-STUCK] → assignee inbox +
 *                         wakeState='stuck'.
 *
 * Auto-resolution: any row whose item has moved out of TODO/Open (agent
 * self-claim, human status edit, unassignment) while a PM review is pending
 * (pmState pending/notified) is set to pmState='cancelled' so no zombie review
 * lingers and nudge timers stop.
 *
 * The interval is NOT started from any route file. server/index.ts must call
 * `startDispatchSweeper()` once at boot (see the one-line comment there).
 */

import { getPrismaClient } from '../prisma';
import {
  dispatchConfig,
  fetchItem,
  isDispatchableStatus,
  isNoopProxy,
  spawnAgent,
  writeInbox,
} from './agent-dispatch';

const prisma = getPrismaClient();

const SWEEP_INTERVAL_MS = dispatchConfig.sweepIntervalMs;
const PM_NO_ACT_MS = dispatchConfig.pmNoActMs;
const PM_NUDGE_MAX = dispatchConfig.pmNudgeMaxEffective;
const PM_AGENT_ID = dispatchConfig.pmAgentId;
const ESCALATION_AGENT_ID = dispatchConfig.escalationAgentId;
const MAX_WAKE_ATTEMPTS = 5;
const NO_CLAIM_MS = 30 * 60 * 1000; // S4: 30 min without a claim

// FIX (T12 live finding, 2026-09-09): a CLI wake can stay in flight for up to
// GATEWAY_SPAWN_TIMEOUT_SEC+30s. Re-waking a row whose wake hasn't resolved yet
// double-spawns the target agent. Gate S1/S3 retries on the row's updatedAt.
const SPAWN_IN_FLIGHT_MS = dispatchConfig.gatewaySpawnTimeoutSec * 1000 + 5000;
function wakeInFlight(row: { updatedAt: Date | string | null }): boolean {
  if (!row.updatedAt) return false;
  return Date.now() - new Date(row.updatedAt).getTime() < SPAWN_IN_FLIGHT_MS;
}

let started = false;
let timer: NodeJS.Timeout | null = null;
// FIX (T13 #6): re-entrancy guard. setInterval(60s) + `void sweep()` with no in-flight
// guard allowed overlapping sweeps on stale snapshots → double re-wake / double-nudge.
let sweeping = false;

/** True if the item is still in a dispatchable (TODO/Open) state. */
async function itemStillDispatchable(itemType: string, itemId: string): Promise<boolean> {
  const item = await fetchItem(itemType as any, itemId);
  if (!item) return false;
  return isDispatchableStatus(itemType as any, item.status);
}

// ---------------------------------------------------------------------------
// S1 — PM wake retry
// ---------------------------------------------------------------------------
async function passS1(): Promise<void> {
  if (isNoopProxy(prisma)) return;
  const rows = await prisma.agentDispatch.findMany({ where: { pmState: 'pending' } });
  for (const row of rows) {
    try {
      // Auto-resolve: if the item is no longer TODO/Open, cancel the review.
      // FIX (T13 #7): CAS — only cancel if still pmState='pending' (don't clobber a
      // concurrent PM-act 'done').
      if (!(await itemStillDispatchable(row.itemType, row.itemId))) {
        await prisma.agentDispatch.updateMany({
          where: { id: row.id, pmState: 'pending' },
          data: { pmState: 'cancelled' },
        });
        continue;
      }
      // Spawn may still be in flight — never re-wake concurrently (T12 fix).
      if (wakeInFlight(row)) continue;
      if (row.wakeAttempts >= MAX_WAKE_ATTEMPTS) {
        // Exhausted → failed + escalate. FIX (T13 #7): CAS on pmState='pending'.
        await prisma.agentDispatch.updateMany({
          where: { id: row.id, pmState: 'pending' },
          data: { pmState: 'failed' },
        });
        await writeInbox(
          ESCALATION_AGENT_ID,
          `[PM-UNREACHABLE] PM wake failed after ${MAX_WAKE_ATTEMPTS} attempts. ` +
            `itemType=${row.itemType} itemId=${row.itemId} assignee=${row.agentId}. ` +
            `Recovery: flip DISPATCH_MODE, or v1.1 POST /api/dispatches/:id/retry.`
        );
        continue;
      }
      // Re-wake the PM.
      const { sessionId, error } = await spawnAgent(PM_AGENT_ID, `[ASSIGNMENT-REVIEW] ${row.itemType} ${row.itemId} (retry ${row.wakeAttempts + 1})`);
      // FIX (T13 #7): CAS — only transition if still pmState='pending'.
      await prisma.agentDispatch.updateMany({
        where: { id: row.id, pmState: 'pending' },
        data: sessionId
          ? { pmState: 'notified', pmSessionId: sessionId, pmNotifiedAt: new Date(), wakeAttempts: 0 }
          : { wakeAttempts: { increment: 1 }, lastWakeError: error || 'PM wake retry failed' },
      });
    } catch (e: any) {
      console.warn('[dispatch-sweeper] S1 error:', e?.message);
    }
  }
}

// ---------------------------------------------------------------------------
// S2 — PM no-act → nudge → escalate
// ---------------------------------------------------------------------------
async function passS2(): Promise<void> {
  if (isNoopProxy(prisma)) return;
  const rows = await prisma.agentDispatch.findMany({ where: { pmState: 'notified' } });
  for (const row of rows) {
    try {
      // Auto-resolve: item moved out of TODO/Open → cancel the review.
      // FIX (T13 #7): CAS on pmState='notified'.
      if (!(await itemStillDispatchable(row.itemType, row.itemId))) {
        await prisma.agentDispatch.updateMany({
          where: { id: row.id, pmState: 'notified' },
          data: { pmState: 'cancelled' },
        });
        continue;
      }
      const notifiedAt = row.pmNotifiedAt ? new Date(row.pmNotifiedAt).getTime() : Date.now();
      if (Date.now() - notifiedAt < PM_NO_ACT_MS) continue; // not yet due

      if (row.pmNudges >= PM_NUDGE_MAX) {
        // Nudges exhausted → stuck + escalate. FIX (T13 #7): CAS on pmState='notified'.
        await prisma.agentDispatch.updateMany({
          where: { id: row.id, pmState: 'notified' },
          data: { pmState: 'stuck' },
        });
        await writeInbox(
          ESCALATION_AGENT_ID,
          `[PM-NO-ACT] PM did not act on ${row.itemType} ${row.itemId} (assignee=${row.agentId}) after ${row.pmNudges} nudges. ` +
            `Recovery: flip DISPATCH_MODE, or v1.1 POST /api/dispatches/:id/retry.`
        );
        continue;
      }

      // Nudge the PM via an inbox row + re-wake.
      const nudge = row.pmNudges + 1;
      await writeInbox(PM_AGENT_ID, `[PM-NUDGE ${nudge}/${PM_NUDGE_MAX}] Review ${row.itemType} ${row.itemId} (assignee=${row.agentId}) — still pending.`);
      const { sessionId, error } = await spawnAgent(PM_AGENT_ID, `[PM-NUDGE ${nudge}/${PM_NUDGE_MAX}] ${row.itemType} ${row.itemId}`);
      // FIX (T13 #7): CAS on pmState='notified'. FIX (T13 #8): ALWAYS refresh
      // pmNotifiedAt on a nudge attempt (success OR failure) so a failed nudge wake
      // does not burn nudges 1/min — it respects the full no-act window instead.
      await prisma.agentDispatch.updateMany({
        where: { id: row.id, pmState: 'notified' },
        data: sessionId
          ? { pmNudges: nudge, pmNotifiedAt: new Date(), pmSessionId: sessionId }
          : { pmNudges: nudge, pmNotifiedAt: new Date(), lastWakeError: error || 'PM nudge wake failed' },
      });
    } catch (e: any) {
      console.warn('[dispatch-sweeper] S2 error:', e?.message);
    }
  }
}

// ---------------------------------------------------------------------------
// S3 — Assignee wake retry
// ---------------------------------------------------------------------------
async function passS3(): Promise<void> {
  if (isNoopProxy(prisma)) return;
  const rows = await prisma.agentDispatch.findMany({ where: { wakeState: 'pending' } });
  for (const row of rows) {
    try {
      // Only retry assignee wakes once the PM phase is done/skipped (not pending review).
      if (row.pmState === 'pending' || row.pmState === 'notified') continue;
      // Spawn may still be in flight — never re-wake concurrently (T12 fix).
      if (wakeInFlight(row)) continue;
      if (row.wakeAttempts >= MAX_WAKE_ATTEMPTS) {
        // FIX (T13 #7): CAS on wakeState='pending'.
        await prisma.agentDispatch.updateMany({
          where: { id: row.id, wakeState: 'pending' },
          data: { wakeState: 'failed' },
        });
        continue;
      }
      const { sessionId, error } = await spawnAgent(row.agentId, `[ASSIGNMENT] ${row.itemType} ${row.itemId} (retry ${row.wakeAttempts + 1})`);
      // FIX (T13 #7): CAS on wakeState='pending'.
      await prisma.agentDispatch.updateMany({
        where: { id: row.id, wakeState: 'pending' },
        data: sessionId
          ? { wakeState: 'sent', gatewaySessionId: sessionId, spawnedAt: new Date(), wakeAttempts: 0 }
          : { wakeAttempts: { increment: 1 }, lastWakeError: error || 'assignee wake retry failed' },
      });
    } catch (e: any) {
      console.warn('[dispatch-sweeper] S3 error:', e?.message);
    }
  }
}

// ---------------------------------------------------------------------------
// S4 — No-claim → stuck
// ---------------------------------------------------------------------------
async function passS4(): Promise<void> {
  if (isNoopProxy(prisma)) return;
  const rows = await prisma.agentDispatch.findMany({ where: { wakeState: 'sent' } });
  for (const row of rows) {
    try {
      if (!row.spawnedAt) continue;
      const spawnedAt = new Date(row.spawnedAt).getTime();
      if (Date.now() - spawnedAt < NO_CLAIM_MS) continue; // not yet due

      // If the item is no longer TODO/Open, the assignee claimed it — nothing to do.
      if (!(await itemStillDispatchable(row.itemType, row.itemId))) continue;

      await prisma.agentDispatch.updateMany({
        // FIX (T13 #7): CAS on wakeState='sent' so a concurrent PM-act 'done' is not clobbered.
        where: { id: row.id, wakeState: 'sent' },
        data: { wakeState: 'stuck' },
      });
      await writeInbox(
        row.agentId,
        `[DISPATCH-STUCK] ${row.itemType} ${row.itemId} was spawned but not claimed within 30 min. ` +
          `Re-claim via PATCH status IN_PROGRESS, or report a blocker.`
      );
    } catch (e: any) {
      console.warn('[dispatch-sweeper] S4 error:', e?.message);
    }
  }
}

// ---------------------------------------------------------------------------
// Sweep + start
// ---------------------------------------------------------------------------

async function sweep(): Promise<void> {
  // FIX (T13 #6): skip if a previous sweep is still in flight; reset in finally.
  if (sweeping) return;
  sweeping = true;
  try {
    await passS1();
    await passS2();
    await passS3();
    await passS4();
  } catch (e: any) {
    console.warn('[dispatch-sweeper] sweep error:', e?.message);
  } finally {
    sweeping = false;
  }
}

/**
 * Start the sweeper interval. Guarded to a single instance. Call this ONCE from
 * server/index.ts at boot (do NOT start it from any route file).
 */
export function startDispatchSweeper(): void {
  if (started) return;
  started = true;
  timer = setInterval(() => {
    void sweep();
  }, SWEEP_INTERVAL_MS);
  // Run once immediately so state converges quickly after boot.
  void sweep();
  console.log(`[dispatch-sweeper] started (interval=${SWEEP_INTERVAL_MS}ms, pmNoAct=${PM_NO_ACT_MS}ms, pmNudgeMax=${PM_NUDGE_MAX})`);
}

/** Stop the sweeper (used by tests / shutdown). */
export function stopDispatchSweeper(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  started = false;
}
