# AI_SWARM_ALM — Codebase Analysis & Roadmap

**Analyzed by:** Newey 🏗️ (CTO Agent)
**Date:** 2026-05-05
**Commit:** `d0b07b8` (feat: Initialize Swarm Orchestrator project)

---

## 1. CURRENT STATE — What We Have

### Stack
- **Frontend:** React 19 + Vite 6 + TypeScript + Tailwind CSS 4
- **Backend:** Firebase (Firestore) — client-side only, no server
- **Auth:** Firebase Google OAuth (popup)
- **AI:** Google Gemini API (via `@google/genai`) — imported but not used yet
- **UI Libraries:** Recharts, motion, lucide-react, @hello-pangea/dnd

### Modules (6 components)

| Component | What It Does | Status |
|-----------|-------------|--------|
| **Dashboard** | Stats cards, test execution trend chart (hardcoded data), health metrics | 🟡 Mock data only |
| **TasksView** | List + Kanban views for tasks, master-detail layout, Firestore CRUD | 🟢 Functional |
| **TasksBoard** | Drag-and-drop Kanban board (To Do → In Progress → Review → Done) | 🟢 Functional |
| **CreateTaskModal** | Task creation form (title, desc, priority, epic, status) → Firestore | 🟢 Functional |
| **TestCenter** | Test run history table + fake live log terminal | 🟡 Mock data |
| **GitHubWorkspace** | Repo list + PR table — all hardcoded | 🔴 Static mockup |
| **AdminPage** | Google auth, seed/clear DB, user invite, operation log | 🟢 Functional |
| **Sidebar + TopBar** | Navigation shell | 🟢 Functional |

### Firestore Schema

```
tasks/{taskId}
├── ownerId: string (auth UID)
├── title: string
├── description: string
├── status: "To Do" | "In Progress" | "Review" | "Done"
├── priority: "Low" | "Medium" | "High" | "Urgent"
├── epic: string
├── agents: string[] (currently stores avatar URLs — unused)
├── createdAt: Timestamp
└── updatedAt: Timestamp

runs/{runId}
├── runId: string
├── group: string
├── duration: string
├── status: "Passed" | "Failed" | "Skipped"
├── color: string
└── createdAt: Timestamp

users/{uid}
├── email: string
├── displayName: string
├── role: "Admin" | "Agent"
└── lastLive: Timestamp
```

---

## 2. GAPS — What's Missing for Real Swarm ALM

### Critical Gaps

| # | Gap | Impact | Priority |
|---|-----|--------|----------|
| G1 | **No agent-level tracking** — tasks don't track which agent created/owns/is working on them | Can't trace agent work | P0 |
| G2 | **No requirements traceability** — no REQ→TASK→TEST linkage | No ALM compliance | P0 |
| G3 | **No API/backend** — everything is client-side Firestore | No agent-to-ALM integration | P0 |
| G4 | **No real-time agent health** — Dashboard uses hardcoded data | No swarm visibility | P1 |
| G5 | **GitHub integration is a mockup** — no real API calls | No code traceability | P1 |
| G6 | **Test Center is simulated** — no real test execution | No QA traceability | P1 |
| G7 | **No role-based access** — any authenticated user sees everything | Multi-agent auth gap | P2 |
| G8 | **No audit trail** — no history of task state changes | No compliance | P2 |

### Schema Gaps

- Tasks need: `assignedAgent`, `createdBy`, `requirements[]`, `testResults[]`, `comments[]`, `history[]`
- No `requirements` collection
- No `test_cases` collection (separate from test runs)
- No `agents` collection (agent registry)
- No `deployments` collection
- No `audit_log` collection

---

## 3. ARCHITECTURE — Proposed Swarm ALM

### System Design

```
┌─────────────────────────────────────────────────┐
│                  React Frontend                  │
│  (Dashboard / Tasks / Test Center / GitHub)      │
└──────────────┬──────────────────┬────────────────┘
               │                  │
        ┌──────▼──────┐   ┌──────▼──────┐
        │  REST API    │   │  WebSocket  │
        │  (Express)   │   │  (Real-time)│
        └──────┬──────┘   └──────┬──────┘
               │                  │
        ┌──────▼──────────────────▼──────┐
        │         Firestore DB            │
        │  tasks / requirements / tests   │
        │  agents / deployments / audit   │
        └────────────────────────────────┘
               ▲
        ┌──────┴──────┐
        │  Agent SDK  │
        │  (OpenClaw  │
        │   Sessions) │
        └─────────────┘
```

### Agent → ALM Integration

Each agent in the swarm interacts with ALM through:

1. **Task Assignment** — CTO/PM creates tasks, assigns to agents
2. **Status Updates** — agents report progress via API
3. **Test Results** — QA agents submit test execution results
4. **Code Links** — Dev agents link PRs/commits to tasks
5. **Audit Trail** — all state changes logged automatically

### Proposed Firestore Collections

```
agents/{agentId}
├── name, role, model, provider
├── status: "active" | "idle" | "offline"
├── currentTaskId, completedTaskCount
└── lastHeartbeat

tasks/{taskId} (enhanced)
├── ... existing fields ...
├── assignedAgentId: string
├── createdBy: "agent:cto" | "user:ahmed"
├── requirementIds: string[]
├── testCaseIds: string[]
├── deploymentIds: string[]
├── comments: { author, text, timestamp }[]
└── history: { from, to, changedBy, timestamp }[]

requirements/{reqId}
├── title, description
├── priority, category (functional/non-functional)
├── status: "Draft" | "Approved" | "Implemented" | "Verified"
├── taskId (linked task)
├── source: "agent:pm" | "user:ahmed"
└── traceability: { testCaseIds, deploymentIds }

test_cases/{tcId}
├── title, steps, expectedResults
├── requirementId (traces back)
├── type: "unit" | "integration" | "e2e" | "manual"
├── priority, automationStatus

test_runs/{runId} (enhanced)
├── ... existing fields ...
├── testCaseId
├── agentId (which agent executed)
├── environment, logsUrl
├── actualResults, passFail
└── duration: number (ms, not string)

deployments/{deployId}
├── version, environment
├── taskIds, requirementIds
├── status, deployedBy (agent or user)
└── timestamp

audit_log/{logId}
├── action: "task.created" | "task.status_changed" | ...
├── actor: "agent:cto" | "user:ahmed"
├── resource: "tasks/abc123"
├── delta: { field, oldValue, newValue }
└── timestamp
```

---

## 4. IMPLEMENTATION PLAN

### Phase 1: Foundation (Week 1)
**Goal:** Make ALM usable for real task tracking with agent integration

| Task | Agent | Details |
|------|-------|---------|
| 1.1 Add Express API server | Senior Dev | REST endpoints for CRUD on tasks, requirements |
| 1.2 Enhance task schema | Senior Dev | Add assignedAgentId, history[], comments[] |
| 1.3 Add agents collection | Dev | Registry with health status |
| 1.4 Add requirements collection | Dev | CRUD + traceability to tasks |
| 1.5 Real agent health on Dashboard | UI Dev | Replace hardcoded data with Firestore queries |
| 1.6 Task → Agent assignment UI | UI Dev | Dropdown to assign agent to task |
| 1.7 OpenClaw → ALM bridge | DevOps | Agent sessions can create/update tasks via API |

### Phase 2: Traceability (Week 2)
**Goal:** Full REQ → TASK → TEST → DEPLOY traceability

| Task | Agent | Details |
|------|-------|---------|
| 2.1 Requirements module | Senior Dev | Create/edit/approve requirements |
| 2.2 Test cases module | QA-Ops | Link test cases to requirements |
| 2.3 Test execution real integration | QA-Ops | Replace mock TestCenter with real data |
| 2.4 Traceability matrix view | UI Dev | REQ ↔ TASK ↔ TEST cross-reference UI |
| 2.5 Audit logging | Dev | Auto-log all state changes |
| 2.6 History timeline on tasks | UI Dev | Visual changelog per task |

### Phase 3: GitHub Integration (Week 3)
**Goal:** Real GitHub API integration for code traceability

| Task | Agent | Details |
|------|-------|---------|
| 3.1 GitHub API backend | Senior Dev | OAuth + REST proxy for repos, PRs, commits |
| 3.2 PR ↔ Task linking | Dev | Auto-link PRs to tasks via mentions |
| 3.3 Commit ↔ Task tracking | Dev | Parse commit messages for task IDs |
| 3.4 GitHub Workspace real UI | UI Dev | Replace mockup with live data |
| 3.5 CI status integration | DevOps | Pull CI pass/fail into task view |

### Phase 4: Advanced (Week 4)
**Goal:** Intelligence and automation

| Task | Agent | Details |
|------|-------|---------|
| 4.1 AI task suggestions | Docs Agent | Gemini-powered task breakdown suggestions |
| 4.2 Auto-assignment | PM Agent | AI-powered agent-to-task matching |
| 4.3 Cost tracking integration | CFO | Pull API costs into dashboard |
| 4.4 Deployment tracking | Deploy-Ops | Deployment pipeline linked to tasks |
| 4.5 Notifications | Assistant | Telegram alerts on task state changes |
| 4.6 Reports & metrics | Docs Agent | Generate sprint/project reports |

---

## 5. IMMEDIATE NEXT STEPS

1. **Set up production build** on VPS (port 8080, served by Vite preview or Express)
2. **Add Express backend** for API endpoints
3. **Enhance Firestore schema** with new collections
4. **Create agent registry** — seed with our 16 agents
5. **Wire Dashboard** to real data

---

*Document generated by Newey 🏗️ — CTO Agent*
*Repo: https://github.com/aelsalawy/AI_SWARM_ALM*
