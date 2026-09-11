# R2-3: Closed-Loop Agent Contract v1 (Async Steering)

**Status:** APPROVED spec — implementation task for almdev
**Owner:** CTO (Newey) · **Loop core:** almdev · **Date:** 2026-09-07
**Scope rule (Khaled verdict, incorporated):** v1 = async steering only. Live gateway chat = v2, out of scope. YAGNI discipline applies.

---

## 0. Goal

Close the loop: orchestrator assigns work → agent discovers it, claims it, executes, reports → orchestrator reviews and closes. v1 uses **polling + the existing chat inbox**; no push, no streaming, no new task statuses.

## 1. Current state (verified facts, 2026-09-07)

| # | Fact | Location |
|---|------|----------|
| F1 | Single shared `AGENT_API_KEY` from env; `x-agent-key` header equality check only | `server/index.ts:76,98-110`, `server/.env:5` |
| F2 | Agent identity is **self-asserted** via `x-agent-id` header (any keyholder impersonates any agent) | `server/index.ts:102-108` |
| F3 | `req.isAgent=true`, `req.user.uid` = header value or `'agent:system'` | `server/index.ts:103-107` |
| F4 | Chats GET filters `where: { agentId, userId }` — agent-key callers query by `userId=agentId` and get **empty results** | `server/routes/agent-chats.ts:31-37` |
| F5 | Chats POST hardcodes `role: 'user'` — agent replies impossible | `server/routes/agent-chats.ts` (create call) |
| F6 | Heartbeat self-report enforcement EXISTS (good pattern to copy) | `server/routes/agents.ts:382-390` |
| F7 | Tasks PATCH has **no agent scoping** — any authenticated caller can modify any task | `server/routes/tasks.ts` (no isAgent branch) |
| F8 | Assignment auto-trigger is a **stub** (console.log only) | `server/routes/tasks.ts:329-333` |
| F9 | `eventBus.emitTaskCompleted` exists on →Done transitions | `server/routes/tasks.ts:~360` |
| F10 | `AgentChat` model: `{id, agentId, userId, message, role, createdAt}` `@@map agent_chats`; `role` is a free string | `prisma/schema.prisma:388` |
| F11 | Agent model has NO key fields; no key table exists | `prisma/schema.prisma:152-172` |
| F12 | Telemetry middleware writes rows when `x-agent-id` header present or `isAgent` — already loop-compatible | `server/telemetry.ts:20-23` |
| F13 | Notifications route already branches on `isAgent` | `server/routes/notifications.ts:114-117` |

## 2. Gaps closed by v1

- **G1** Per-agent keys (no more shared secret as primary identity)
- **G2** Verified agent identity (key ↔ agent binding, hashed at rest, constant-time compare)
- **G3** Agents can reply (`role: 'agent'`) and only in their own inbox
- **G4** Agents can read their own inbox
- **G5** Agents can only touch tasks assigned to them
- **G6** Assignment produces a durable inbox message (the "dispatch" step of the loop)

## 3. Task-level state machine (async)

```
                 assignment (PATCH assignedAgentId)
  TODO ─────────────────────────────────────────────► ASSIGNED
                                                        │
                          agent poll (GET own chats)    │ [ASSIGNMENT] msg in inbox
                                                        ▼
                                    claim: POST heartbeat {currentTaskId}
                                           + PATCH status IN_PROGRESS
                                                        │
                          work + progress chat posts    │
                                                        ▼
                              completion: chat post + PATCH status DONE
                                                        │
                          orchestrator reviews inbox    │
                              ┌──── accept ─────────────┤
                              ▼                         ▼ reject (PATCH TODO
                           CLOSED                    + steering chat msg) ─► loop
```

- **Claim** = heartbeat with `currentTaskId` + task PATCH `IN_PROGRESS` (two calls, agent runtime's job).
- **Blocked** = chat post describing blocker; task stays `IN_PROGRESS`; orchestrator intervenes. No new status.
- **Review** = orchestrator reads agent's final chat post; accept = close/no-op, reject = `TODO` + steering message.
- No schema change to `TaskStatus`. YAGNI.

## 4. New endpoints

| Method/Path | Auth | Behavior |
|---|---|---|
| `POST /api/agents/:agentId/keys` | super_admin (JWT) | Create key. Body `{name?: string}`. Returns plaintext **once**: `{id, key: "ak-...", createdAt}`. Stores SHA-256 hash only. |
| `GET /api/agents/:agentId/keys` | super_admin | List `{id, name, createdAt, lastUsedAt, revokedAt}` (never the hash/plaintext). |
| `POST /api/agents/keys/:keyId/rotate` | super_admin | Revoke old + issue replacement (plaintext once). |
| `DELETE /api/agents/keys/:keyId` | super_admin | Soft-revoke (`revokedAt=now`). Revoked keys fail auth immediately. |
| `GET /api/agents/me` | isAgent | Self-introspection: `{agentId, unreadChats, assignedOpenTasks, lastHeartbeat}` — agent runtime boot convenience. |

## 5. Auth contract (v1)

- Headers: `x-agent-id: "agent:<name>"` + `x-agent-key: "ak-..."`.
- Middleware: lookup hash → `crypto.timingSafeEqual` → `revokedAt === null` → bind identity: the key's stored `agentId` MUST equal `x-agent-id` (else **401**). Attach `req.user = {uid: agentId, agent: true}`, `req.isAgent = true`. Update `lastUsedAt` fire-and-forget.
- **Break-glass**: legacy shared `AGENT_API_KEY` remains accepted (uid from header, `agent:system` fallback) and is explicitly flagged for removal in v2. All agent-scoped checks below apply to key-auth callers equally.

## 6. Behavior matrix (endpoint changes)

| Endpoint | User (JWT) | Agent (key) |
|---|---|---|
| `GET /:agentId/chats` | existing: `{agentId, userId}` filter | **NEW branch**: caller must have `agentId === req.user.uid`; NO userId filter (F4 fix) |
| `POST /:agentId/chats` | existing: `role:'user'`, any agent target | **NEW**: `role:'agent'`, requires `agentId === req.user.uid` (403 otherwise) |
| `POST /:agentId/heartbeat` | existing | existing self-report rule (F6) |
| `PATCH /api/tasks/:id` | unrestricted (existing) | **NEW**: only tasks where `assignedAgentId === caller` (403 otherwise); allowed status transitions: `IN_PROGRESS`, `DONE` only |
| `GET /api/agents/me` | 401 | full |

Assignment dispatch (G6): in `tasks.ts` where the auto-trigger stub sits (F8), replace with: `prisma.agentChat.create({agentId, userId: 'system', role: 'user', message: "[ASSIGNMENT] Task <id>: <title> — claim with heartbeat currentTaskId, complete with status DONE"})`. Same for unassignment (`[UNASSIGNMENT]`).

## 7. Data model (almdev adds to schema; CTO applies migration)

```prisma
model AgentKey {
  id         String    @id @default(cuid())
  agentId    String
  name       String?
  keyHash    String    @unique
  createdAt  DateTime  @default(now())
  lastUsedAt DateTime?
  revokedAt  DateTime?

  @@index([agentId])
  @@map("agent_keys")
}
```

Migration SQL (CTO applies; agent must include exact content in report):
```sql
CREATE TABLE "agent_keys" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "name" TEXT,
    "keyHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "agent_keys_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "agent_keys_keyHash_key" ON "agent_keys"("keyHash");
CREATE INDEX "agent_keys_agentId_idx" ON "agent_keys"("agentId");
```

## 8. Acceptance criteria (E2E, run by CTO after deploy)

1. Issue key → plaintext returned once; DB holds only hash.
2. Agent with valid `x-agent-id`+`x-agent-key` → `GET /me` 200.
3. Agent reads own inbox → 200, its messages (incl. `[ASSIGNMENT]`).
4. Agent posts reply → 201, DB `role='agent'`.
5. Agent posts to another agent's inbox → 403.
6. Wrong key for claimed identity → 401; revoked key → 401.
7. Agent PATCHes unassigned task → 403; assigned task `IN_PROGRESS`→`DONE` → 200.
8. Assignment change → inbox message appears.
9. Telemetry row written on agent-key request (F12).

## 9. Explicit non-goals (v1)

- Live/streaming gateway chat (v2)
- Push delivery to agents (v1 = poll at cycle start)
- New task statuses (IN_REVIEW etc.)
- Key TTL/expiry (revoke suffices)
- UI key-management panel (follows after API proves out; uidev later)