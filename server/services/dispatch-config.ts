/**
 * dispatch-config.ts — centralized dispatch configuration (T9).
 *
 * Single source of truth for every env-driven dispatch setting. Both
 * agent-dispatch.ts (helper) and dispatch-sweeper.ts (T7) read from here so
 * the env surface is documented in exactly one place.
 *
 * Design contract: docs/agent-trigger-assessment.md §8.7 task 9.
 *
 * Required env vars (documented in server/.env.example):
 *   DISPATCH_MODE            'pm' (default) | 'direct'
 *   DISPATCHER_AGENT_IDS     comma-separated PM/dispatcher agent ids (default 'agent:pm')
 *   TRIGGER_ENABLED_AGENTS   comma-separated assignee allowlist (default 'agent:seniordev,agent:dev')
 *   PM_NO_ACT_MINUTES        minutes before PM no-act nudge (default 15)
 *   PM_NUDGE_MAX             max PM nudges before escalation (default 2)
 *   PM_DISPATCH_PER_MINUTE   per-dispatcher rate cap (default 10)
 *   ESCALATION_AGENT_ID      escalation inbox target (default 'agent:cto')
 *   PM_AGENT_ID              PM agent id (default 'agent:pm')
 *   ALM_BASE_URL             base URL for agent-facing API links (default 'http://127.0.0.1:3001')
 *   OPENCLAW_GATEWAY_URL     gateway base URL (spawn bridge; optional in CLI-stopgap mode)
 *   OPENCLAW_GATEWAY_TOKEN   gateway bearer token (optional in CLI-stopgap mode)
 *   GATEWAY_SPAWN_TIMEOUT_SEC  spawn timeout (default 60)
 *   ASSIGNEE_IN_FLIGHT_CAP   per-assignee in-flight cap (default 3)
 *
 * Sweeper test overrides (honored by dispatch-sweeper.ts; QA skeleton uses these):
 *   DISPATCH_TEST_SWEEP_INTERVAL_MS  default 60000 (production 60s)
 *   DISPATCH_TEST_PM_NO_ACT_MS       default 15*60*1000 (production 15m)
 *   DISPATCH_TEST_PM_NUDGE_MAX       default 2
 */

function parseList(raw: string | undefined, fallback: string): Set<string> {
  const src = raw && raw.trim().length > 0 ? raw : fallback;
  return new Set(
    src
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

function parseNum(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const dispatchConfig = {
  /** 'pm' (PM-mediated, default) | 'direct' (legacy auto-dispatch fallback). */
  mode: (process.env.DISPATCH_MODE || 'pm').toLowerCase(),

  /** PM/dispatcher agent ids allowed to call POST /api/dispatches (E2). */
  dispatcherAgentIds: parseList(process.env.DISPATCHER_AGENT_IDS, 'agent:pm'),

  /** Assignee allowlist — only these agents may be spawned (E4). */
  triggerEnabledAgents: parseList(process.env.TRIGGER_ENABLED_AGENTS, 'agent:seniordev,agent:dev'),

  /** PM agent id (review inbox + wake target). */
  pmAgentId: process.env.PM_AGENT_ID || 'agent:pm',

  /** Minutes before a notified-but-inactive PM gets its first nudge (S2). */
  pmNoActMinutes: parseNum(process.env.PM_NO_ACT_MINUTES, 15),

  /** Max PM nudges before escalation (S2). */
  pmNudgeMax: parseNum(process.env.PM_NUDGE_MAX, 2),

  /** Per-dispatcher spawn rate cap (E7). */
  pmDispatchPerMinute: parseNum(process.env.PM_DISPATCH_PER_MINUTE, 10),

  /** Escalation inbox target for S1/S2 (PM-unreachable / PM-no-act). */
  escalationAgentId: process.env.ESCALATION_AGENT_ID || 'agent:cto',

  /** Base URL used in agent-facing API links inside payloads. */
  almBaseUrl: process.env.ALM_BASE_URL || process.env.API_BASE_URL || 'http://127.0.0.1:3001',

  /** Gateway bridge config (used by the CLI-stopgap spawn; token optional). */
  gatewayUrl: process.env.OPENCLAW_GATEWAY_URL || '',
  gatewayToken: process.env.OPENCLAW_GATEWAY_TOKEN || '',

  /** Spawn timeout in seconds (CLI stopgap). */
  gatewaySpawnTimeoutSec: parseNum(process.env.GATEWAY_SPAWN_TIMEOUT_SEC, 60),

  /** Per-assignee in-flight cap. */
  assigneeInFlightCap: parseNum(process.env.ASSIGNEE_IN_FLIGHT_CAP, 3),

  // --- Sweeper (T7) ---
  /** Sweeper interval in ms (production 60s; QA injects a short value). */
  sweepIntervalMs: parseNum(process.env.DISPATCH_TEST_SWEEP_INTERVAL_MS, 60000),

  /** PM no-act threshold in ms (production 15m; QA injects a short value).
   *  FIX (T13 #3): chain pmNoActMinutes*60000 so PM_NO_ACT_MINUTES is actually read
   *  (it was dead config before — only the hardcoded 15-min fallback was used). */
  pmNoActMs: parseNum(
    process.env.DISPATCH_TEST_PM_NO_ACT_MS,
    parseNum(process.env.PM_NO_ACT_MINUTES, 15) * 60 * 1000
  ),

  /** Max PM nudges (QA override; falls back to pmNudgeMax). */
  pmNudgeMaxEffective: parseNum(process.env.DISPATCH_TEST_PM_NUDGE_MAX, parseNum(process.env.PM_NUDGE_MAX, 2)),
};

export type DispatchConfig = typeof dispatchConfig;
