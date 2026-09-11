# Agent Integration Design Document

**Document ID:** SP2-3.2  
**Status:** Draft  
**Author:** Senior Dev Agent  
**Date:** 2026-05-07  
**Version:** 1.0.0

---

## 1. Overview

This document specifies how OpenClaw swarm agents integrate with the AI Swarm ALM (Application Lifecycle Management) platform. The ALM serves as the central coordination plane for task assignment, test execution, and agent health monitoring.

### 1.1 Architecture Summary

```
┌──────────────────────────────────────────────────────┐
│                    ALM Platform                       │
│                                                       │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │ Express API  │  │  Firestore   │  │ React UI    │ │
│  │ (Port 3001)  │◄─►│  (Database)  │◄─►│ (Port 3000) │ │
│  └──────┬───────┘  └──────┬───────┘  └─────────────┘ │
│         │                  │                           │
└─────────┼──────────────────┼───────────────────────────┘
          │                  │
          │    ┌─────────────┘
          │    │
    ┌─────▼────▼─────┐
    │  OpenClaw Agent │
    │  Swarm          │
    │                 │
    │  ┌───────────┐  │
    │  │ CTO Agent │  │
    │  └─────┬─────┘  │
    │        │        │
    │  ┌─────▼─────┐  │
    │  │ SW Arch   │  │
    │  │ Agent     │  │
    │  └─────┬─────┘  │
    │        │        │
    │  ┌─────▼─────┐  │
    │  │ Dev Agents│  │
    │  │ (N×)      │  │
    │  └───────────┘  │
    └─────────────────┘
```

### 1.2 Integration Principles

1. **RESTful API-first** — All agent interactions use the Express backend API
2. **User-scoped data** — Agents operate within their owner's data scope
3. **Idempotent operations** — Retry-safe endpoints for unreliable networks
4. **Heartbeat-driven health** — Agents report status periodically
5. **Eventual consistency** — Firestore listeners for real-time UI updates

---

## 2. Agent Heartbeat

### 2.1 Purpose

Agents report their operational status to the ALM so the system can:
- Display agent availability in the dashboard
- Route tasks to available agents
- Detect stalled or offline agents

### 2.2 Firestore Collection: `agents`

| Field               | Type       | Description                                    |
|----------------------|------------|------------------------------------------------|
| `id`                 | string     | Agent unique identifier (doc ID)               |
| `name`               | string     | Human-readable agent name                      |
| `emoji`              | string     | Display emoji                                  |
| `role`               | string     | Agent role (e.g., "Dev Agent", "QA Agent")     |
| `model`              | string     | AI model identifier                            |
| `provider`           | string     | Model provider (e.g., "openai", "google")      |
| `status`             | enum       | `"online"` \| `"offline"` \| `"busy"`          |
| `workspace`          | string     | Workspace path or identifier                   |
| `completedTaskCount` | number     | Lifetime completed tasks count                 |
| `currentTaskId`      | string\|null | ID of currently assigned task                |
| `lastHeartbeat`      | timestamp  | Last heartbeat timestamp                       |
| `ownerId`            | string     | Owning user's Firebase Auth UID               |

### 2.3 Heartbeat Flow

```
Agent                          ALM API                  Firestore
  │                               │                        │
  │  POST /api/agents/:id/beat    │                        │
  │  { status, currentTaskId }    │                        │
  │──────────────────────────────►│                        │
  │                               │  updateDoc(agents/:id) │
  │                               │───────────────────────►│
  │                               │        200 OK          │
  │◄──────────────────────────────│                        │
  │                               │                        │
  │  (every 60 seconds)          │                        │
```

### 2.4 API Endpoint

**`POST /api/agents/:id/heartbeat`**

```json
// Request
{
  "status": "online | offline | busy",
  "currentTaskId": "task-id-or-null",
  "metadata": {
    "model": "gpt-4o",
    "provider": "openai",
    "uptime": 3600
  }
}

// Response 200
{
  "success": true,
  "data": {
    "id": "agent-001",
    "status": "online",
    "lastHeartbeat": "2026-05-07T00:00:00.000Z"
  }
}
```

### 2.5 Staleness Detection

- If `lastHeartbeat` is older than **3 minutes**, the ALM UI should render the agent as "stale" (yellow indicator).
- If older than **10 minutes**, the agent is considered `offline` and the system may auto-release any assigned task back to the backlog.

---

## 3. Task Assignment

### 3.1 Purpose

Tasks flow from the ALM to agents. The assignment lifecycle covers creation, claiming, execution, and completion.

### 3.2 Firestore Collection: `tasks`

| Field             | Type          | Description                                      |
|-------------------|---------------|--------------------------------------------------|
| `id`              | string        | Task unique identifier (doc ID)                  |
| `title`           | string        | Task title                                       |
| `description`     | string        | Detailed description                             |
| `priority`        | enum          | `"Low"` \| `"Medium"` \| `"High"` \| `"Urgent"`  |
| `status`          | enum          | `"To Do"` \| `"In Progress"` \| `"Review"` \| `"Done"` |
| `epic`            | string        | Epic/grouping label                              |
| `assignedAgentId` | string\|null  | Agent currently assigned                         |
| `createdBy`       | string        | User who created the task                        |
| `ownerId`         | string        | Owning user's Firebase Auth UID                 |
| `createdAt`       | timestamp     | Creation time                                    |
| `updatedAt`       | timestamp     | Last modification time                           |

### 3.3 Task Lifecycle

```
                ┌──────────┐
                │  To Do   │ ◄── Created by user or CTO agent
                └────┬─────┘
                     │ Agent claims (PATCH /api/tasks/:id)
                     ▼
                ┌──────────┐
                │In Progress│ ◄── Agent executes work
                └────┬─────┘
                     │ Agent completes (PATCH /api/tasks/:id)
                     ▼
                ┌──────────┐
                │  Review  │ ◄── CTO/SW Arch reviews
                └────┬─────┘
                     │ Approve
                     ▼
                ┌──────────┐
                │   Done   │
                └──────────┘
```

### 3.4 Assignment Flow

```
CTO Agent              ALM API               Firestore          Dev Agent
   │                      │                      │                  │
   │ POST /api/tasks      │                      │                  │
   │ { title, desc, ... } │                      │                  │
   │─────────────────────►│                      │                  │
   │                      │ addDoc(tasks)        │                  │
   │                      │─────────────────────►│                  │
   │                      │     201 Created      │                  │
   │◄─────────────────────│                      │                  │
   │                      │                      │                  │
   │                      │  (Dev agent polls or  │                  │
   │                      │   Firestore listener) │                  │
   │                      │                      │──── onSnapshot ──►│
   │                      │                      │                  │
   │                      │                      │  Agent claims:   │
   │                      │ PATCH /api/tasks/:id │                  │
   │                      │◄─────────────────────────────────────────│
   │                      │ updateDoc(tasks/:id) │                  │
   │                      │─────────────────────►│                  │
   │                      │     200 OK           │                  │
   │                      │──────────────────────────────────────────►│
```

### 3.5 API Endpoints

**`GET /api/tasks`** — List tasks (with optional filters)

```
Query params:
  ?status=To Do
  ?assignedAgentId=agent-001
  ?epic=Core
  ?ownerId=uid (server-enforced scoping)
```

**`POST /api/tasks`** — Create a new task

```json
// Request
{
  "title": "Implement user auth module",
  "description": "Add JWT-based authentication...",
  "priority": "High",
  "status": "To Do",
  "epic": "Auth",
  "assignedAgentId": null,
  "createdBy": "cto-agent",
  "ownerId": "user-uid"
}
```

**`PATCH /api/tasks/:id`** — Update a task (claim, transition status, edit)

```json
// Agent claiming a task
{
  "status": "In Progress",
  "assignedAgentId": "agent-001"
}

// Agent completing
{
  "status": "Review",
  "updatedAt": "serverTimestamp"
}
```

**`GET /api/tasks/:id`** — Get single task details

---

## 4. Test Run Reporting

### 4.1 Purpose

Agents (primarily QA/test agents) submit test execution results to the ALM for tracking, reporting, and audit.

### 4.2 Firestore Collection: `runs`

| Field       | Type          | Description                                    |
|-------------|---------------|------------------------------------------------|
| `id`        | string        | Run unique identifier (doc ID)                 |
| `runId`     | string        | Human-readable run number (e.g., "4521")       |
| `group`     | string        | Agent group / test suite name                  |
| `duration`  | string        | Human-readable duration (e.g., "3m 42s")       |
| `status`    | enum          | `"Passed"` \| `"Failed"` \| `"Skipped"`        |
| `color`     | string        | UI color hint: `"blue"` \| `"purple"` \| `"amber"` |
| `createdAt` | timestamp     | When the run was created/started               |
| `ownerId`   | string        | Owning user's Firebase Auth UID               |
| `agentId`   | string        | Agent that executed the run                    |
| `taskId`    | string\|null  | Associated task                                |
| `artifacts` | array         | Links to logs, screenshots, trace files        |

### 4.3 Test Run Submission Flow

```
QA Agent                ALM API               Firestore
   │                      │                      │
   │ POST /api/test-runs  │                      │
   │ {                    │                      │
   │   taskId, agentId,   │                      │
   │   status, duration   │                      │
   │ }                    │                      │
   │─────────────────────►│                      │
   │                      │ addDoc(runs)         │
   │                      │─────────────────────►│
   │                      │                      │
   │                      │ Also update task:    │
   │                      │ PATCH /api/tasks/:id │
   │                      │ { status: "Review" } │
   │                      │─────────────────────►│
   │                      │     201 Created      │
   │◄─────────────────────│                      │
```

### 4.4 API Endpoints

**`GET /api/test-runs`** — List test runs

```
Query params:
  ?taskId=task-001
  ?agentId=agent-001
  ?status=Failed
```

**`POST /api/test-runs`** — Submit a new test run

```json
{
  "taskId": "task-001",
  "agentId": "agent-qa-001",
  "status": "Passed",
  "duration": 180,
  "group": "Auth-Service-V2",
  "artifacts": [
    { "type": "log", "url": "gs://bucket/logs/001.log" },
    { "type": "screenshot", "url": "gs://bucket/shots/001.png" }
  ]
}
```

**`GET /api/test-runs/:id`** — Get single test run

---

## 5. Firestore Collections Summary

| Collection      | Primary Key | Owner Scope  | Real-time Listener |
|-----------------|-------------|--------------|--------------------|
| `tasks`         | Auto-ID     | `ownerId`    | ✅ onSnapshot      |
| `runs`          | Auto-ID     | `ownerId`    | ✅ onSnapshot      |
| `agents`        | Configured  | `ownerId`    | ✅ onSnapshot      |
| `requirements`  | Auto-ID     | `ownerId`    | ✅ onSnapshot      |
| `audit`         | Auto-ID     | `ownerId`    | ❌ On-demand       |

### 5.1 Security Rules Pattern

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only access their own data
    match /{collection}/{docId=**} {
      allow read, write: if request.auth != null
        && resource.data.ownerId == request.auth.uid;
      allow create: if request.auth != null
        && request.resource.data.ownerId == request.auth.uid;
    }
  }
}
```

---

## 6. Data Flow Diagrams

### 6.1 End-to-End Task Execution

```
User (Ahmed)
    │
    │ 1. Create task via UI
    ▼
React UI ──POST /api/tasks──► Express API ──addDoc──► Firestore (tasks/)
    │                                                      │
    │                                              2. onSnapshot fires
    │                                                      │
    │                              ┌───────────────────────┘
    │                              │
    ▼                              ▼
Dashboard updates              Agent dashboard sees new task
    │                              │
    │                         3. Agent claims task
    │                              │
    │                         PATCH /api/tasks/:id
    │                         { status: "In Progress",
    │                           assignedAgentId: "dev-001" }
    │                              │
    │                              ▼
    │                         Firestore (tasks/:id updated)
    │                              │
    │                         4. Agent executes work
    │                            (code, tests, etc.)
    │                              │
    │                         5. Agent submits results
    │                              │
    │                         POST /api/test-runs
    │                         { taskId, status: "Passed" }
    │                              │
    │                              ▼
    │                         Firestore (runs/ created)
    │                              │
    │                         6. Agent marks task Review
    │                         PATCH /api/tasks/:id
    │                         { status: "Review" }
    │                              │
    ▼                              ▼
UI shows task in Review        CTO Agent notified
    │                              │
    │ 7. CTO approves           │
    │──────────────────────────────│
    │ PATCH /api/tasks/:id         │
    │ { status: "Done" }           │
    │                              │
    ▼                              ▼
Task complete                  Audit log entry created
```

### 6.2 Agent Heartbeat Data Flow

```
Agent Process
    │
    │ Every 60s:
    │ POST /api/agents/:id/heartbeat
    │ { status, currentTaskId, metadata }
    │
    ▼
Express API
    │
    │ updateDoc(agents/:id, {
    │   status,
    │   currentTaskId,
    │   lastHeartbeat: serverTimestamp()
    │ })
    │
    ▼
Firestore (agents/:id)
    │
    │ onSnapshot
    │
    ▼
React UI — Agent status cards update in real-time
```

### 6.3 Search Navigation Flow (SP2-2.4)

```
User types in TopBar search
    │
    │ (debounced 300ms)
    ▼
SearchResults component
    │
    │ Firestore queries (parallel):
    │   - tasks WHERE ownerId == uid (filter by title locally)
    │   - runs ORDER BY createdAt DESC (filter by group locally)
    │
    ▼
Dropdown shows matching results
    │
    │ User clicks result
    ▼
searchNav.emit({ type: 'task'|'run', id })
    │
    ├──► setActiveTab('tasks') or setActiveTab('test-center')
    │
    └──► TasksView / TestCenter receives event via subscription
         └──► Selects / expands the matched item
```

---

## 7. API Endpoints Reference

| Method  | Endpoint                       | Purpose                    | Auth    |
|---------|--------------------------------|----------------------------|---------|
| GET     | `/api/health`                  | System health check        | None    |
| GET     | `/api/tasks`                   | List tasks                 | Firebase|
| POST    | `/api/tasks`                   | Create task                | Firebase|
| GET     | `/api/tasks/:id`               | Get task                   | Firebase|
| PATCH   | `/api/tasks/:id`               | Update task                | Firebase|
| GET     | `/api/agents`                  | List agents                | Firebase|
| GET     | `/api/agents/:id`              | Get agent                  | Firebase|
| POST    | `/api/agents/:id/heartbeat`    | Agent heartbeat            | Firebase|
| GET     | `/api/test-runs`               | List test runs             | Firebase|
| POST    | `/api/test-runs`               | Submit test run            | Firebase|
| GET     | `/api/test-runs/:id`           | Get test run               | Firebase|
| GET     | `/api/requirements`            | List requirements          | Firebase|
| POST    | `/api/requirements`            | Create requirement         | Firebase|
| GET     | `/api/audit`                   | Audit log                  | Firebase|

> **Note:** The heartbeat endpoint (`POST /api/agents/:id/heartbeat`) is a new endpoint to be implemented. Current agents use `GET /api/agents` only.

---

## 8. Error Handling and Retry Strategies

### 8.1 Agent-Side Retry Strategy

Agents should implement exponential backoff with jitter for all API calls:

```
Retry Policy:
  - Max retries: 3
  - Initial delay: 1 second
  - Backoff multiplier: 2
  - Max delay: 30 seconds
  - Jitter: ±20% of delay

  Attempt 1: immediate
  Attempt 2: 1-1.2s delay
  Attempt 3: 2-2.4s delay
  Attempt 4: 4-4.8s delay (if maxRetries > 3)
```

### 8.2 Error Classification

| Error Type           | HTTP Status | Agent Action                               |
|----------------------|-------------|--------------------------------------------|
| Transient network    | 502, 503    | Retry with backoff                         |
| Rate limited         | 429         | Honor `Retry-After` header, then retry     |
| Auth failure         | 401         | Re-authenticate, then retry once            |
| Forbidden            | 403         | Log error, alert CTO agent, stop retrying   |
| Not found            | 404         | Log warning, skip (resource deleted)        |
| Validation error     | 422         | Log error details, alert CTO, stop retrying  |
| Server error         | 500         | Retry with backoff, alert if persistent      |
| Timeout              | N/A         | Retry with backoff                          |

### 8.3 Heartbeat Failure

If an agent cannot reach the heartbeat endpoint after all retries:

1. **Log locally** — Buffer heartbeat data with timestamp
2. **Continue work** — Don't block task execution on heartbeat failure
3. **Batch recovery** — On reconnection, send a single heartbeat with latest state
4. **Alert** — If heartbeats fail for >5 minutes, the agent should signal the CTO agent

### 8.4 Task Operation Failure

| Operation          | Failure Handling                                    |
|--------------------|-----------------------------------------------------|
| Task claim         | Retry 3x. If still failing, skip and try next task. |
| Task update        | Retry 3x. Cache update locally, sync on reconnect.  |
| Test run submit    | Retry 3x. Buffer results locally, batch submit.     |
| Requirements check | Retry 2x. Use cached data if available.             |

### 8.5 Data Conflict Resolution

- **Firestore optimistic concurrency**: Use `updatedAt` timestamps; last-write-wins with audit trail.
- **Task claiming race condition**: First agent to successfully `PATCH` the task with `assignedAgentId` wins. Subsequent agents get a 409 or see the task already claimed.
- **Idempotency keys**: For test run submissions, agents should include a client-generated `idempotencyKey` to prevent duplicate submissions on retry.

---

## 9. Agent Integration Checklist

For each new agent joining the swarm:

- [ ] Register agent document in `agents` collection with `ownerId`
- [ ] Implement heartbeat loop (60s interval)
- [ ] Implement task claim flow (watch `tasks` where `status == "To Do"`)
- [ ] Implement task completion flow (PATCH status transitions)
- [ ] Implement test run submission (POST to `/api/test-runs`)
- [ ] Configure retry policy with exponential backoff
- [ ] Set up local error buffering for offline resilience
- [ ] Register with CTO agent for health monitoring

---

## 10. Future Considerations

1. **WebSocket channel** — Replace polling with Firestore real-time listeners or WebSockets for lower latency
2. **Agent capabilities registry** — Allow agents to declare capabilities (e.g., "typescript", "testing") for smarter task routing
3. **Batch operations** — Support bulk task creation and status updates
4. **Agent-to-agent messaging** — Direct communication channel for coordination
5. **Artifact storage** — Formalize test artifacts (logs, screenshots) in Cloud Storage with signed URLs
6. **SLA tracking** — Monitor agent response times and task completion deadlines

---

*End of document*
