# Phase 1 Tasks — Foundation

## Workstream A: Express API Server + Schema (Critical Path)
**Owner:** Senior Dev 🔧
**Depends on:** Nothing

### Task 1.1: Express API Server
Create `server/index.ts` — an Express API server that:
- Runs on port 3001
- Connects to Firestore using admin credentials (firebase-admin)
- Exposes REST endpoints:

```
Tasks:
  GET    /api/tasks              — list all tasks (with optional filters: status, assignedAgentId, epic)
  GET    /api/tasks/:id          — get single task with history
  POST   /api/tasks              — create task (auto-logs to audit)
  PATCH  /api/tasks/:id          — update task (auto-logs changes to history[] and audit_log)
  DELETE /api/tasks/:id          — delete task (audit log)

Requirements:
  GET    /api/requirements       — list requirements
  POST   /api/requirements       — create requirement
  PATCH  /api/requirements/:id   — update requirement

Agents:
  GET    /api/agents             — list all agents with status
  GET    /api/agents/:id         — get agent detail
  PATCH  /api/agents/:id         — update agent (heartbeat, status)

Test Runs:
  POST   /api/test-runs          — submit test run result
  GET    /api/test-runs          — list test runs

Audit:
  GET    /api/audit              — list audit log entries

Health:
  GET    /api/health             — returns { status: "ok", agents: N, tasks: N }
```

### Task 1.2: Enhanced Task Schema
Update Firestore task documents to include:
```
assignedAgentId: string | null
createdBy: string (e.g. "agent:cto" or "user:ahmed")
requirementIds: string[]
testCaseIds: string[]
comments: { id, author, text, timestamp }[]
history: { from, to, field, changedBy, timestamp }[]
```

### Task 1.3: Agent Registry Collection
Create seed script `server/seed-agents.ts` that populates `agents` collection with our 16 agents:
```
id, name, emoji, role, model, provider, status, workspace, completedTaskCount, currentTaskId, lastHeartbeat
```

### Files to create:
- `server/index.ts` — Express app
- `server/firebase-admin.ts` — Firestore admin init
- `server/routes/tasks.ts` — task routes
- `server/routes/requirements.ts` — requirement routes  
- `server/routes/agents.ts` — agent routes
- `server/routes/test-runs.ts` — test run routes
- `server/routes/audit.ts` — audit routes
- `server/seed-agents.ts` — seed script
- `server/tsconfig.json` — server TS config

---

## Workstream B: Frontend Enhancement
**Owner:** Dev 💻
**Depends on:** Workstream A (partially — can start with mock API)

### Task 1.5: Dashboard — Real Agent Health
Replace hardcoded Dashboard data with:
- Fetch `/api/agents` for active agent count
- Fetch `/api/tasks` for task stats (total, in progress, by status)
- Fetch `/api/test-runs` for recent pass/fail rates
- Show real token usage if available
- Show real avg runtime from test runs

### Task 1.6: Task → Agent Assignment
- Add agent dropdown to CreateTaskModal (fetch from `/api/agents`)
- Show assigned agent avatar+name on task cards (list + board)
- Add filter by assigned agent in TasksView

### Files to modify:
- `src/components/Dashboard.tsx` — real data
- `src/components/CreateTaskModal.tsx` — agent dropdown
- `src/components/TasksView.tsx` — agent filter + agent display
- `src/components/TasksBoard.tsx` — agent display on cards

---

## Workstream C: Agent Seed Data + API Bridge
**Owner:** DevOps ⚙️
**Depends on:** Workstream A

### Task 1.7: OpenClaw → ALM Bridge
Create a utility that allows agents to:
- Create tasks in ALM via API call
- Update task status
- Submit test results
- Log audit entries

This is a shared module agents can import or a set of curl/fetch helpers.

### Files to create:
- `src/lib/alm-bridge.ts` — client-side API helper functions
