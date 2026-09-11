/**
 * dispatches.ts — POST /api/dispatches (PM spawn endpoint).
 *
 * Design contract: docs/agent-trigger-assessment.md §8.3 (Option E, chosen).
 *
 * The PM agent instructs the server to spawn an assignee via this endpoint,
 * authenticated with its provisioned agent key (x-agent-key + x-agent-id).
 * The server — never the PM — performs the spawn, so the gateway token never
 * leaves server/.env and every guard rail is deterministic code (§8.5).
 *
 * Validation chain (E1–E7), all server-side, in order:
 *   E1 authn  — agent key verified (existing middleware, upstream)
 *   E2 authz  — caller ∈ DISPATCHER_AGENT_IDS
 *   E3 target — agentId (optional) must equal item's current assignee
 *   E4 allow  — target ∈ TRIGGER_ENABLED_AGENTS
 *   E5 status — item TODO/Open
 *   E6 idem   — unique (agentId,itemType,itemId) upsert; already sent → 409
 *   E7 rate   — per-dispatcher token bucket (PM_DISPATCH_PER_MINUTE)
 *
 * Response: { dispatchId, state, sessionId? }
 */

import { Router, Request, Response } from 'express';
import {
  validateDispatch,
  executeSpawn,
  fetchItem,
  isNoopProxy,
  DISPATCHER_AGENT_IDS,
  AssigneeInFlightCapError,
  type ItemType,
} from '../services/agent-dispatch';
import { getPrismaClient } from '../prisma';

const router = Router();
const prisma = getPrismaClient();

const VALID_ITEM_TYPES: ItemType[] = ['task', 'bug', 'requirement'];

router.post('/', async (req: Request, res: Response) => {
  try {
    // E1 — authn: must be an agent-key caller (verified upstream).
    const isAgent = (req as any).isAgent === true;
    const callerAgentId = (req as any).user?.uid || (req as any).user?.agentId;
    if (!isAgent || !callerAgentId) {
      return res.status(401).json({ error: 'Agent key authentication required' });
    }

    // FIX (T13 #10): run E2 authz BEFORE any item probing. Previously the endpoint
    // resolved the assignee (fetchItem → 404/409 disclosures) before E2, leaking
    // item existence/state to non-dispatchers. validateDispatch re-checks E2 too, but
    // this early gate prevents the disclosure and short-circuits unauthorized callers.
    if (DISPATCHER_AGENT_IDS.size > 0 && !DISPATCHER_AGENT_IDS.has(callerAgentId)) {
      return res.status(403).json({ error: 'Caller is not an authorized dispatcher' });
    }

    // Parse + validate the structured body (§8.6: structured IDs only, no free-form note).
    const { itemType, itemId, agentId } = req.body || {};
    if (!itemType || !itemId) {
      return res.status(400).json({ error: 'itemType and itemId are required' });
    }
    if (!VALID_ITEM_TYPES.includes(itemType)) {
      return res.status(400).json({ error: `itemType must be one of: ${VALID_ITEM_TYPES.join(', ')}` });
    }
    if (typeof itemId !== 'string' || itemId.trim().length === 0) {
      return res.status(400).json({ error: 'itemId must be a non-empty string' });
    }

    // Resolve the target agent: explicit agentId, else the item's current assignee (E3).
    let targetAgentId = typeof agentId === 'string' && agentId.trim() ? agentId.trim() : null;
    if (!targetAgentId) {
      const item = await fetchItem(itemType as ItemType, itemId);
      if (!item) {
        return res.status(404).json({ error: `Item not found: ${itemType}/${itemId}` });
      }
      targetAgentId = item.assignedAgentId;
      if (!targetAgentId) {
        return res.status(409).json({ error: 'Item has no assignee; cannot dispatch' });
      }
    }

    const target = { agentId: targetAgentId, itemType: itemType as ItemType, itemId };

    // E2–E7 validation chain.
    const result = await validateDispatch(callerAgentId, target, { enforceRate: true });
    if (!result.ok) {
      return res.status(result.status).json({ error: result.reason });
    }

    // Execute the spawn (phase 2).
    const row = await executeSpawn(target, result.dispatch);

    if (isNoopProxy(prisma)) {
      return res.status(503).json({ error: 'Database unavailable' });
    }

    return res.status(200).json({
      dispatchId: row?.id ?? null,
      state: row?.wakeState ?? 'pending',
      sessionId: row?.gatewaySessionId ?? null,
    });
  } catch (e: any) {
    // FIX (cmttrn1pq002ukclcmy7j1ryz): map the per-assignee in-flight cap to 429.
    if (e instanceof AssigneeInFlightCapError) {
      return res.status(429).json({ error: e.message });
    }
    console.error('[dispatches] POST error:', e?.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
