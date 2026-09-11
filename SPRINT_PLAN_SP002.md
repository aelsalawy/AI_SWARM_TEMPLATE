# Sprint SP-002 — Remaining Issues & System Completion
**Date:** 2026-05-06
**Status:** READY FOR PLANNING
**Predecessor:** SP-001 (7.6/10 system health)

---

## System Score: 7.6 → Target: 9.0+

---

## PHASE 1 — UX Polish (All Placeholders Gone)

### SP2-1.1: Toast Notification System
- **Priority:** P2
- **Files:** New `src/components/Toast.tsx`, update all components with `alert()` calls
- **Spec:**
  - Create a toast provider/context: success (green), warning (amber), info (blue), error (red)
  - Auto-dismiss after 4 seconds
  - Stack from top-right
  - Replace ALL remaining `alert()` calls:
    - Sidebar: Security button → "Security scan active. No breaches detected."
    - TopBar: Notifications bell → "No new notifications"
  - For buttons with no feature: show "Coming soon" info toast
- **Assigned:** UI Dev 🖥️

### SP2-1.2: Fix TopBar Help Link
- **Priority:** P2
- **File:** `src/components/TopBar.tsx`
- **Issue:** Links to `google-gemini/generative-ai-js` — unrelated to project
- **Fix:** Change to `https://github.com/aelsalawy/AI_SWARM_ALM` (project README)
- **Assigned:** Dev 💻

### SP2-1.3: Dashboard — Replace Dead Metrics Cards
- **Priority:** P2
- **File:** `src/components/Dashboard.tsx`
- **Issue:** Resource Load (82%) and Token Usage (2.4M/5M) cards always show "—" — no data source
- **Options:**
  - **A)** Replace with real metrics: "Agents Online" bar (X/16) and "Tasks Completed" bar
  - **B)** Keep but add a note "Requires backend metrics endpoint"
- **Decision:** Khaled to choose
- **Implementation:** Dev 💻

### SP2-1.4: Dashboard Chart — Wire to Firestore
- **Priority:** P2
- **Files:** `src/components/Dashboard.tsx`, `src/lib/firestore-helpers.ts` (new)
- **Spec:**
  - Create shared Firestore helpers module
  - Query `runs` collection, group by createdAt day (last 7 days)
  - Count Passed vs Failed per day → populate chart
  - Show empty chart state when no data
- **Assigned:** Senior Dev 🔧

### SP2-1.5: TasksView — Filter & Sort Buttons
- **Priority:** P2
- **File:** `src/components/TasksView.tsx`
- **Spec:**
  - Filter button: toggle dropdown with status checkboxes (To Do, In Progress, Review, Done)
  - Sort button: toggle dropdown with options (Priority, Created Date, Status)
  - Apply filters/sorts to `filteredTasks` array
- **Assigned:** UI Dev 🖥️

---

## PHASE 2 — Functional Gaps

### SP2-2.1: Test Run Detail View
- **Priority:** P1
- **File:** `src/components/TestCenter.tsx`
- **Issue:** Table rows are clickable (cursor-pointer) but no onClick handler
- **Spec:**
  - Click a test run row → expand inline or show side panel with:
    - Full run details (group, duration, status, timestamp)
    - Linked task (if any)
    - Agent that executed
  - Or: navigate to a dedicated run detail view
- **Assigned:** Dev 💻

### SP2-2.2: Test Run Filter & Export
- **Priority:** P2
- **File:** `src/components/TestCenter.tsx`
- **Spec:**
  - Filter button: filter by status (Passed/Failed/Skipped), group, date range
  - Download button: export visible runs as CSV
  - "View All Run History": load more than 20 runs (pagination or infinite scroll)
- **Assigned:** UI Dev 🖥️

### SP2-2.3: Task Requirements from Firestore
- **Priority:** P3
- **File:** `src/components/TasksView.tsx`
- **Issue:** Requirements section shows hardcoded REQ-01/REQ-02
- **Fix:** Query Firestore `requirements` collection, filter by task ID, show real data or "No requirements linked"
- **Assigned:** Dev 💻

### SP2-2.4: Global Search
- **Priority:** P3
- **File:** `src/components/TopBar.tsx` + new `src/components/SearchResults.tsx`
- **Spec:**
  - Search input queries Firestore across tasks and test runs
  - Show dropdown results with typeahead
  - Click result → navigate to that item
  - Search by task title, test group, agent name
- **Assigned:** Senior Dev 🔧

---

## PHASE 3 — System Integration

### SP2-3.1: Backend Server Deployment
- **Priority:** P1
- **Issue:** Express API (port 3001) never runs. Needed for agent-to-ALM communication.
- **Prerequisite:** Firebase Admin credentials in `.env`
- **Tasks:**
  1. Ahmed to get service account key from Firebase Console
  2. Add to `server/.env`
  3. Start server: `npm run server`
  4. Verify health endpoint: `curl localhost:3001/api/health`
  5. Seed agents: `npx tsx server/seed-agents.ts`
- **Assigned:** Dev 💻 (config) + Ahmed (credentials)

### SP2-3.2: Agent Heartbeat → ALM
- **Priority:** P2
- **Issue:** Swarm agents don't report status to ALM
- **Spec:**
  - Each agent periodically POSTs to `/api/agents/:id` with `{ status: 'online'|'busy'|'offline' }`
  - Dashboard reads from `agents` collection
  - Agent cards show real-time status
- **Dependency:** SP2-3.1 (backend running)
- **Assigned:** Khaled 📐 (design) → Senior Dev 🔧 (implementation)

### SP2-3.3: Agent Task Assignment Integration
- **Priority:** P2
- **Issue:** Tasks assigned to agents but agents don't see them
- **Spec:**
  - When a task is assigned, write to agent's `currentTaskId` in Firestore
  - Agent reads its current task on startup
  - Task status changes propagate to agent via Firestore listener
- **Dependency:** SP2-3.1
- **Assigned:** Senior Dev 🔧

### SP2-3.4: GitHub Workspace — Phase 1 Implementation
- **Priority:** P3
- **Per ADR-002:** Wire to Firestore `repos` collection
- **Spec:**
  - Read from `repos` and `pullRequests` collections in Firestore
  - Replace all hardcoded data with Firestore queries
  - Show empty states when no repos connected
  - Add seed script for development
  - Re-add to sidebar nav when ready
- **Assigned:** Senior Dev 🔧 + UI Dev 🖥️

---

## PHASE 4 — Hardening

### SP2-4.1: Error Boundaries
- Wrap each page in React Error Boundary
- Show fallback UI instead of white screen on crash
- **Assigned:** Dev 💻

### SP2-4.2: Mobile Responsive
- Sidebar → hamburger menu on mobile
- TopBar → simplified layout on small screens
- Tables → card layout on mobile
- **Assigned:** UI Dev 🖥️

### SP2-4.3: Role-Based Access Control
- Admin: full access (seed, clear, manage users)
- Agent: read tasks, update assigned tasks
- Viewer: read-only dashboard
- Store role in Firestore `users` collection
- **Assigned:** Khaled 📐 (design) → Senior Dev 🔧

---

## Team Assignments Summary

| Agent | Phase 1 | Phase 2 | Phase 3 | Phase 4 |
|-------|---------|---------|---------|---------|
| **Khaled 📐** | Decide SP2-1.3 | — | Design SP2-3.2 | Design SP2-4.3 |
| **Senior Dev 🔧** | SP2-1.4 (chart) | SP2-2.4 (search) | SP2-3.2, 3.3, 3.4 | SP2-4.3 |
| **Dev 💻** | SP2-1.2 (help), SP2-1.3 (metrics) | SP2-2.1 (run detail), SP2-2.3 (reqs) | SP2-3.1 (backend) | SP2-4.1 (errors) |
| **UI Dev 🖥️** | SP2-1.1 (toast), SP2-1.5 (filters) | SP2-2.2 (test export) | SP2-3.4 (github) | SP2-4.2 (mobile) |

## Gates

| Gate | Criteria | Approver |
|------|----------|----------|
| Phase 1 → 2 | Zero `alert()` calls, all placeholders replaced | Khaled |
| Phase 2 → 3 | All interactive elements functional | Ahmed |
| Phase 3 → 4 | Backend running, agents reporting | Ahmed + Khaled |
| Complete | 9.0+ system health score | Ahmed |

## What Ahmed Needs to Provide

1. **Firebase service account key** — blocks SP2-3.1 (everything in Phase 3)
   - Firebase Console → Project Settings → Service Accounts → Generate New Private Key
2. **Decision on GitHub Workspace** — keep as Phase 3 or defer to later sprint?
3. **Priority call** — Phase 1 (polish) or Phase 3 (backend integration) first?
