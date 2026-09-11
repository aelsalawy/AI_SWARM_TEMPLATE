// Create Agent Dispatch v1 task cards in ALM (Newey, Task card dispatch)
// Usage: node create-dispatch-tasks.mjs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
require('dotenv').config();
const API = 'http://127.0.0.1:3001';
const KEY = process.env.AGENT_API_KEY;
const PROJECT_ID = 'pL8ZIF7gJssSQgQgYcjN';
const EPIC = 'Agent Dispatch v1';
const DOC = 'docs/agent-trigger-assessment.md';

const D = (s) => s.trim();
const tasks = [
{ title: 'T0: Gateway REST spawn spike (verify OpenClaw spawn route from ALM server)', priority: 'Urgent', assignedAgentId: 'agent:seniordev', owner: 'agent:cto',
  description: D(`
GOAL: Verify the OpenClaw Gateway HTTP API route the ALM bridge will call to spawn an agent session, before tasks 4/6 hardcode it.
STEPS: From inside the Docker host, enumerate the gateway API (openclaw --help; check docs at /app/docs, especially gateway HTTP endpoints for sessions_spawn / message send). Identify the exact REST route + auth (Bearer token) equivalent to CLI 'openclaw agent --agent <id> -m <text>'. Prove it end-to-end with a harmless spawn to agent:assistant that posts to its ALM inbox. Document the verified request shape in ${DOC} §8 (add subsection 8.9 Spike Result).
ACCEPTANCE: (1) exact route + token source documented; (2) one successful live spawn executed; (3) if REST route unavailable, document CLI shell-out stopgap design (command, args, stdout parsing) instead.
REF: ${DOC} §8.7 task 0, §6.1 R5. Note: work under AI_SWARM_ALM only. Update your ALM task status as you go.`) },
{ title: 'T1: SECURITY — rotate leaked legacy AGENT_API_KEY + delete agent-trigger stub & dead UI', assignedAgentId: 'agent:cto', owner: 'agent:cto',
  description: D(`
GOAL: Kill the leaked shared key blast radius (9 files + git history) — do regardless of dispatch mode.
STEPS: (1) Generate new AGENT_API_KEY, update server/.env (single rotation point, index.ts break-glass reads env). (2) Scrub hardcoded key from: seed-alm.js, 4 root docs, .env.new, any other occurrence (grep e5b1beed across repo). (3) Delete server/routes/agent-trigger.ts + its mount + dead frontend trigger UI. (4) Restart server, verify agent-key auth still works (per-agent ak- keys) + health. (5) Report git-history purge question to Ahmed (repo distribution unknown).
ACCEPTANCE: grep finds zero occurrences of old key outside .env; server healthy; per-agent keys unaffected.
REF: ${DOC} §6.1 R1, §8.7 task 1.`) },
{ title: 'T2: Prisma migration — AgentDispatch table (+6 PM columns)', assignedAgentId: 'agent:dev', owner: 'agent:cto',
  description: D(`
GOAL: Add the AgentDispatch table + PM columns per doc §8.2/§8.4.
SCHEMA: AgentDispatch { id, agentId, itemType (task|bug|requirement), itemId, pmState, pmSessionId, pmNotifiedAt, pmActedAt, pmNudges, wakeState, wakeAttempts, gatewaySessionId, initiatedBy, createdAt, updatedAt } + @@unique([agentId, itemType, itemId]) storm guard.
STEPS: Edit prisma/schema.prisma, create migration, apply (npx prisma migrate dev), regenerate client. Coordinate with seniordev (task 4 codes against these columns).
ACCEPTANCE: migration applied to local DB; prisma client regenerated; unique constraint verified.
REF: ${DOC} §8.2, §8.4, §8.7 task 2. Read the doc first.`) },
{ title: 'T3: G6 parity W4–W6 wiring via helper (pm mode → PM review rows)', assignedAgentId: 'agent:dev', owner: 'agent:cto',
  description: D(`
GOAL: Wire the dispatch helper at the remaining assignment sites W4–W6 (bugs PATCH agent-assign, bugs POST-create with assignee, agents.ts POST /:id/assign/:taskId) using the helper from task 4.
NOTE: helper contract defined by seniordev in task 4 (server/services/agent-dispatch.ts). If helper not merged yet, code against its documented contract (§8.2) and coordinate via ALM task comments.
ACCEPTANCE: all 6 assignment sites W1–W6 route through the helper; pm mode → [ASSIGNMENT-REVIEW] row to PM inbox, never direct assignee spawn.
REF: ${DOC} §8.2, §8.7 task 3. Depends: task 4 helper contract (can stub-verify), task 2 migration for row writes.`) },
{ title: 'T4: Helper + bridge two-phase (notifyPM / executeSpawn, DISPATCH_MODE branch)', assignedAgentId: 'agent:seniordev', owner: 'agent:cto',
  description: D(`
GOAL: Build server/services/agent-dispatch.ts — the centralized two-phase dispatcher.
CONTENT: (1) notifyPM(): upsert AgentDispatch row (pmState=awaiting) + [ASSIGNMENT-REVIEW] row in PM inbox + bridge wake to PM session. (2) executeSpawn(): called via POST /api/dispatches (task 6) or direct mode — assignee work order spawn per §8.6 template (server-generated, delimiter-wrapped untrusted block, key referenced never inline) + [ASSIGNMENT] row to assignee + gateway spawn call (route from T0 spike). (3) DISPATCH_MODE=pm|direct branch. (4) Allowlists TRIGGER_ENABLED_AGENTS / DISPATCHER_AGENT_IDS, rate caps, TODO-only + idempotent upsert guards as shared validation fn (reuse in task 6).
ACCEPTANCE: unit-testable pure validation fn; helper compiles; contract documented in code header for dev (tasks 3/5).
REF: ${DOC} §8.2, §8.5, §8.6, §8.7 task 4. Depends: task 2 schema (code against it), T0 route.`) },
{ title: 'T5: Wire W1–W3 (+ DISPATCH_MODE branch; remove bugs console stub bugs.ts:350)', assignedAgentId: 'agent:dev', owner: 'agent:cto',
  description: D(`
GOAL: Wire helper at W1–W3 (tasks PATCH assign, tasks POST-create w/ assignee, bugs PATCH) replacing the console.log stub; add DISPATCH_MODE branch (pm mode → notifyPM only; direct mode → legacy auto-dispatch path).
ACCEPTANCE: assignment in any mode produces correct rows/wakes; no direct spawn in pm mode; console stub gone.
REF: ${DOC} §8.2, §8.7 task 5. Depends: tasks 3, 4.`) },
{ title: 'T6: POST /api/dispatches — PM spawn endpoint (E1–E7 validation chain)', assignedAgentId: 'agent:seniordev', owner: 'agent:cto',
  description: D(`
GOAL: New endpoint the PM calls to spawn an assignee — PM NEVER gets raw gateway access.
VALIDATION CHAIN E1–E7: (E1) agent-key authn; (E2) caller in DISPATCHER_AGENT_IDS; (E3) item exists AND assignedAgentId == target agentId; (E4) target in TRIGGER_ENABLED_AGENTS; (E5) item status TODO-only; (E6) idempotent upsert (unique agentId+itemType+itemId — double-POST returns same dispatch, no second spawn); (E7) rate caps (PM_DISPATCH_PER_MINUTE). Response shape per §8.7; all rejections 403 with reason.
ACCEPTANCE: E2E-ready; out-of-policy requests deterministic 403; every accepted call recorded in AgentDispatch (initiatedBy=pm).
REF: ${DOC} §8.3, §8.7 task 6. Depends: task 4 shared validation, task 2.`) },
{ title: 'T7: Dispatch sweeper — 4 passes + auto-resolution + GET dispatch endpoints', assignedAgentId: 'agent:dev', owner: 'agent:cto',
  description: D(`
GOAL: Sweeper service (60s interval): S1 PM wake retry (pending wake ≤5 attempts), S2 PM no-act (PM_NO_ACT_MINUTES → nudge ×PM_NUDGE_MAX → escalate [PM-NO-ACT] to ESCALATION_AGENT_ID inbox), S3 assignee wake retry, S4 no-claim (dispatched + not claimed in 30 min → [DISPATCH-STUCK] + mark). Auto-resolution: PM self-claim of a review row (status≠TODO via agent-key PATCH) auto-resolves pmState.
ENDPOINTS: GET /api/tasks/:id/dispatch + GET /api/bugs/:id/dispatch (dispatch history for detail panels).
ACCEPTANCE: each pass covered by E2E cases (task 12); stuck states visible via GET endpoints.
REF: ${DOC} §8.4, §8.7 task 7. Depends: task 2.`) },
{ title: 'T8: Bugs PATCH agent scoping parity (mirror tasks.ts:299-326)', assignedAgentId: 'agent:dev', owner: 'agent:cto',
  description: D(`
GOAL: bugs.ts PATCH has no agent scoping — agents could reassign bugs (spawn-loop risk R7). Mirror tasks.ts agent scoping: for isAgent callers whitelist status/comments fields; reject assignment-field changes (assignedAgentId etc.).
ACCEPTANCE: agent PATCH changing assignee → 403; status/comment updates still work; parity with tasks.ts behavior.
REF: ${DOC} §6.1 R7, §8.7 task 8.`) },
{ title: 'T9: Env vars — dispatch configuration', assignedAgentId: 'agent:dev', owner: 'agent:cto',
  description: D(`
GOAL: Add + document env vars: DISPATCH_MODE=pm, DISPATCHER_AGENT_IDS=agent:pm, TRIGGER_ENABLED_AGENTS=agent:seniordev,agent:dev, PM_NO_ACT_MINUTES=15, PM_NUDGE_MAX=2, PM_DISPATCH_PER_MINUTE=10, ESCALATION_AGENT_ID=agent:cto (plus §5 task 8 base vars: gateway token, ALM_BASE_URL). Update .env + .env.example + any config docs.
ACCEPTANCE: server boots with defaults; config centralized in one module (server/services/config.ts or similar), not scattered literals.
REF: ${DOC} §8.7 task 9, §5 task 8.`) },
{ title: 'T10: OpenClaw provisioning — pilot keys + PM workspace protocol (Newey)', assignedAgentId: 'agent:cto', owner: 'agent:cto',
  description: D(`
GOAL: Provision the OpenClaw side. DONE 2026-09-08: ALM-side ak- keys provisioned for agent:dev, agent:seniordev, agent:uidev, agent:qaanalyst, agent:pm (dispatch-v1-pilot). REMAINING: (1) deliver keys to agent workspaces (BOOTSTRAP/AGENTS notes or env), (2) PM workspace: ALM_BASE_URL env, review protocol doc (criteria: check assignment validity/priority, then POST /api/dispatches with agent key; Critical=immediate; final inbox re-check before acting), (3) ESCALATION wiring so [PM-NO-ACT] reaches Newey inbox.
OWNER: Newey (me) — in progress.
REF: ${DOC} §8.7 task 10.`) },
{ title: 'T11: Frontend — dispatch chip with PM states (awaiting-PM / nudged / escalated)', assignedAgentId: 'agent:uidev', owner: 'agent:cto',
  description: D(`
GOAL: Task/bug detail views show dispatch state: chip component reading GET /api/tasks/:id/dispatch (task 7). States: none / awaiting-PM / nudged / escalated / spawned / claimed / stuck. Keep design consistent with existing detail panel (w-96 panel, no animations regression — see MEMORY lessons).
ACCEPTANCE: chip renders all states; API errors degrade gracefully (no chip); no layout regression in split view.
REF: ${DOC} §8.4, §8.7 task 11. Depends: task 7 GET endpoints (can build against documented shape). Build must pass: npm run build in AI_SWARM_ALM.`) },
{ title: 'T12: E2E suite — dispatch pipeline (prior cases + PM flow, +5 cases)', assignedAgentId: 'agent:qaanalyst', owner: 'agent:cto',
  description: D(`
GOAL: E2E the whole pipeline AFTER tasks 2-9 land. Cases: prior §5 suite + (1) PM happy path: assign → PM review row → POST /api/dispatches → assignee spawn → claim → done; (2) no-act → nudge ×2 → escalation row; (3) PM double-POST idempotent (one spawn); (4) out-of-policy 403s (unassigned item, non-allowlisted target, non-TODO, non-dispatcher caller); (5) self-claim auto-resolves review; (6) toggle DISPATCH_MODE=direct works; (7) bulk-assign 20 → ONE PM session, 20 spawns, rate cap respected.
DELIVERABLE: e2e/dispatch.e2e.mjs (mirror existing E2E patterns) + test report.
REF: ${DOC} §8.7 task 12. PREP NOW: draft the E2E plan + stub cases; execute when implementation lands. Coordinate via ALM comments.`) },
{ title: 'T13: Code review + merge — Agent Dispatch v1', assignedAgentId: 'agent:swarch', owner: 'agent:cto',
  description: D(`
GOAL: Review all task 2-12 PRs/commits against the design doc; check validation chain E1-E7 completeness, injection template compliance, no direct-spawn path in pm mode; approve merge or request changes.
REF: ${DOC} §8.7 task 13. AFTER implementation tasks land.`) },
];

const created = [];
for (const t of tasks) {
  const body = {
    title: t.title,
    description: t.description,
    priority: t.priority || 'High',
    epic: EPIC,
    assignedAgentId: t.assignedAgentId,
    projectId: PROJECT_ID,
    ownerId: process.env.DEFAULT_OWNER_ID || undefined,
    tags: ['dispatch-v1'],
  };
  const res = await fetch(`${API}/api/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Agent-Key': KEY },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok) { created.push(data); console.log('OK  ', data.id, '|', t.title.slice(0, 70)); }
  else console.error('FAIL', res.status, '|', t.title.slice(0, 70), '|', JSON.stringify(data).slice(0, 200));
}
console.log(`\nCreated ${created.length}/${tasks.length}`);