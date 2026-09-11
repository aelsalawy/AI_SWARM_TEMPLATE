# QA Audit Tasks — AI_SWARM_ALM

**Date:** 2026-05-06
**Source:** CTO QA Audit (Newey)
**Status:** ARCHITECTURE APPROVED — Decisions recorded in ARCHITECTURE_DECISIONS.md. Dev team clear to execute.

---

## P0 — System Won't Start (Blockers)

### P0-1: Firebase Admin SDK Missing Credentials
- **File:** `server/.env`
- **Issue:** Only has `FIREBASE_PROJECT_ID` and `PORT`. Missing `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY`
- **Impact:** Backend server crashes on startup
- **Fix:** Download service account key from Firebase Console → add `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY` to `.env`
- **Assigned:** Dev 💻

### P0-2: Express Backend Server Never Starts
- **File:** `package.json`
- **Issue:** No npm script to run `server/index.ts`
- **Impact:** All API calls from `alm-bridge.ts` to `localhost:3001` return null — Dashboard, Agents, Requirements, Test Runs, Audit all broken
- **Fix:**
  1. Add `"server": "npx tsx server/index.ts"` to package.json scripts
  2. Add `"dev:full": "concurrently \"npm run dev\" \"npm run server\""` (install concurrently)
  3. Test: `npm run dev:full` starts both Vite (3000) and Express (3001)
- **Assigned:** Dev 💻

### P0-3: Agents Not Seeded in Firestore
- **File:** `server/seed-agents.ts`
- **Issue:** Seed script exists with 16 agents but never run
- **Impact:** Agent dropdowns empty, Dashboard agent count = 0
- **Fix:** Run `npx tsx server/seed-agents.ts` after P0-1 is fixed
- **Assigned:** Dev 💻

---

## P1 — Core Features Broken

### P1-1: CreateTaskModal Agent Loading Missing
- **File:** `src/components/CreateTaskModal.tsx`
- **Issue:** No `useEffect` to fetch agents — dropdown always empty
- **Fix:** Add `useEffect` calling `fetchAgents()` from alm-bridge, populate agent `<select>`
- **Assigned:** UI Developer 🖥️

### P1-2: CreateTaskModal assignedAgentId Not Synced
- **File:** `src/components/CreateTaskModal.tsx`
- **Issue:** `selectedAgentId` state is set but never written to `formData.assignedAgentId`
- **Fix:** Sync selectedAgentId into formData before submit
- **Assigned:** UI Developer 🖥️

### P1-3: Dual Data Architecture Inconsistency ✅ DECIDED
- **Issue:** Some components use direct Firestore SDK (TasksView, TestCenter, AdminPage), others use alm-bridge API (Dashboard). Express API has no auth — returns ALL tasks. TasksView queries by `ownerId == user.uid`
- **Decision (ADR-001):** Use **direct Firestore SDK everywhere** on the client side. Express API is for server-to-server / agent-to-ALM communication only.
- **Implementation:**
  1. Create `src/lib/firestore-helpers.ts` — shared query utilities (ADR-003)
  2. Migrate Dashboard.tsx from alm-bridge imports → Firestore direct calls
  3. Keep `alm-bridge.ts` as reference for external API consumers (rename to `server/alm-api-client.ts`)
  4. Express routes stay — they serve agents, not the React client
- **Assigned:** Senior Dev 🔧 (Implementation)

### P1-4: No deleteTask in alm-bridge.ts
- **File:** `src/lib/alm-bridge.ts`
- **Issue:** Express DELETE route exists but no client function
- **Fix:** Add `deleteTask(id)` function. Add delete button to TasksView detail pane.
- **Assigned:** Dev 💻

---

## P2 — Static/Mock Data Needs Wiring

### P2-1: GitHub Workspace is Completely Static ✅ DECIDED
- **File:** `src/components/GitHubWorkspace.tsx`
- **Issue:** All repos, PRs, stats are hardcoded. No API integration. Connect button does nothing.
- **Decision (ADR-002):** Implement **Option B — Firestore + Webhooks** in two phases.
  - **Phase 1 (now):** Create Firestore collections (`repos`, `pullRequests`, `deployments`). Wire component to read from Firestore. Show empty states. Add seed script for dev data.
  - **Phase 2 (later):** GitHub webhook endpoint in Express. OAuth for Connect button. Real-time updates.
- **Rationale:** Avoids OAuth complexity. Consistent with Firestore-first architecture. Agent swarm can write repo data directly. UI preserved.
- **Assigned:** UI Developer 🖥️ (Phase 1 wiring) → Senior Dev 🔧 (Phase 2 webhooks)

### P2-2: Test Center Logs are Fake
- **File:** `src/components/TestCenter.tsx`
- **Issue:** "Live Execution Log" terminal is hardcoded text. Search/Wrap buttons do nothing.
- **Fix:** Either connect to real agent execution logs via Firestore, or clearly mark as "Sample Output" and disable interactivity
- **Assigned:** UI Developer 🖥️

### P2-3: Test Center Creates Predetermined Results
- **File:** `src/components/TestCenter.tsx`
- **Issue:** `initiateRun()` uses `statuses[idx]` where idx is random but maps to fixed group → predictable results
- **Fix:** Randomize status independently from group selection
- **Assigned:** Dev 💻

### P2-4: Dashboard Chart is Static
- **File:** `src/components/Dashboard.tsx`
- **Issue:** AreaChart uses hardcoded `data` array. Stats like "Resource Load 82%", "Token Usage 2.4M/5M" are hardcoded.
- **Fix:** Pull actual test run data from Firestore, aggregate by day for chart
- **Assigned:** UI Developer 🖥️

### P2-5: Task Detail Requirements are Hardcoded
- **File:** `src/components/TasksView.tsx`
- **Issue:** Always shows same 2 fake requirements regardless of task selected
- **Fix:** Load requirements from Firestore `requirements` collection, filter by task
- **Assigned:** Dev 💻

---

## P3 — Cleanup

### P3-1: Remove TasksView.tsx.bak
- Delete `src/components/TasksView.tsx.bak`

### P3-2: Add React Error Boundaries
- Wrap each page component in error boundary to prevent full app crash

### P3-3: Loading State Defaults on Dashboard
- Dashboard shows hardcoded stats (94.8% pass rate) before data loads — misleading
- Show "—" or "Loading..." until real data arrives

---

## Execution Plan

### Phase 1 — Get System Running (P0)
1. Dev 💻: Fix .env credentials → Add server script → Seed agents
2. Khaled 📐: Verify architecture, approve data layer approach
3. **Gate:** System boots, all API endpoints respond, agents visible

### Phase 2 — Fix Core Features (P1)
1. ~~Khaled 📐: Decide on unified data architecture~~ ✅ DONE — see ARCHITECTURE_DECISIONS.md (ADR-001/002/003)
2. Senior Dev 🔧: Create `src/lib/firestore-helpers.ts` (ADR-003) — shared Firestore query utilities
3. Senior Dev 🔧: Migrate Dashboard.tsx from alm-bridge → Firestore direct (ADR-001)
4. Senior Dev 🔧: Wire GitHubWorkspace.tsx to Firestore collections (ADR-002 Phase 1)
5. UI Developer 🖥️: Fix CreateTaskModal (P1-1, P1-2), add delete task (P1-4)
6. **Gate:** Can create, view, edit, delete tasks with real data. All pages use Firestore directly.

### Phase 3 — Wire Real Data (P2)
1. Dashboard chart connected to real test data (P2-4)
2. Test Center uses real logs (P2-2, P2-3)
3. GitHub Workspace — seed dev data, show real Firestore reads (ADR-002 Phase 1)
4. Task detail requirements from Firestore (P2-5)
5. **Gate:** All pages show real data, no hardcoded values

### Phase 4 — Polish (P3)
1. Cleanup dead code
2. Error boundaries
3. Loading states
