# Sprint Plan — Post-QA Fixes
**Date:** 2026-05-06
**Sprint:** SP-001 (QA Remediation)
**Owner:** Khaled 📐 (SW Architect) — reviews & assigns
**Status:** READY FOR EXECUTION

---

## Execution Order

Tasks are ordered by dependency chain. Each phase must pass review before the next starts.

---

## PHASE 1 — Critical Blockers (Khaled + Dev Team)

### TASK-1.1: Fix Task Detail EDIT Button
- **Priority:** P0 — Blocks task lifecycle
- **File:** `src/components/TasksView.tsx` (right pane detail view)
- **Issue:** Edit button exists but has no `onClick` handler
- **Spec:**
  - Clicking EDIT should toggle the detail view into edit mode
  - Fields become editable: title, description, status, priority, epic, assignedAgentId
  - Add SAVE and CANCEL buttons that appear in edit mode
  - SAVE writes to Firestore: `updateDoc(doc(db, 'tasks', taskId), {...updatedData, updatedAt: serverTimestamp()})`
  - CANCEL reverts to read-only mode
  - Add edit mode state: `const [isEditing, setIsEditing] = useState(false)`
- **Assigned:** Dev 💻
- **Review:** Khaled 📐

### TASK-1.2: Fix Task Detail EXECUTE Button
- **Priority:** P0 — Blocks core workflow
- **File:** `src/components/TasksView.tsx`
- **Issue:** Execute button exists but has no handler
- **Spec:**
  - Clicking EXECUTE should update task status to `'In Progress'`
  - Write to Firestore: `updateDoc(doc(db, 'tasks', taskId), { status: 'In Progress', updatedAt: serverTimestamp() })`
  - Show a brief confirmation toast/indicator
  - Button should only appear when task status is `'To Do'`
  - When task is already `'In Progress'`, show a COMPLETE button instead (sets to `'Done'`)
  - When task is `'Review'`, show an APPROVE button (sets to `'Done'`)
- **Assigned:** Dev 💻
- **Review:** Khaled 📐

### TASK-1.3: Fix Deploy Swarm Button
- **Priority:** P0 — Most prominent CTA in the app
- **File:** `src/components/TopBar.tsx`
- **Issue:** "Deploy Swarm" button does nothing
- **Spec:**
  - Option A (Quick): Wire to a confirmation modal that shows swarm status summary then triggers `npm run dev:full` or equivalent
  - Option B (Proper): Create a deploy flow:
    1. Click → open DeployModal component
    2. Modal shows: agent status summary (online/offline/busy counts), pending tasks count, recent test pass rate
    3. Confirm button triggers a Firestore write to a `deployments` collection
    4. Shows success/failure state
  - If Option A chosen, at minimum: alert → confirmation → navigates to Admin page
- **Architecture Decision:** Khaled to decide A vs B
- **Implementation:** Senior Dev 🔧
- **Review:** Khaled 📐

### TASK-1.4: GitHub Workspace — Remove or Stub Properly
- **Priority:** P0 — Entire page is fake
- **File:** `src/components/GitHubWorkspace.tsx`
- **Decision Required:** Khaled to choose:
  - **Option A:** Remove from sidebar nav entirely. Add back when webhooks are ready (per ADR-002 Phase 2)
  - **Option B:** Keep but replace with a "Coming Soon" placeholder that reads from Firestore `repos` collection. Empty state when no repos. Remove all hardcoded mock data.
- **Recommendation from CTO:** Option A — remove nav item, keep file. Ship working features first.
- **Implementation:** UI Dev 🖥️
- **Review:** Khaled 📐

---

## PHASE 2 — High Priority Fixes

### TASK-2.1: Fix TestCenter FAB — Wrong Modal
- **Priority:** P1 — Wrong UX
- **Files:** `src/App.tsx`, new file `src/components/CreateTestModal.tsx`
- **Issue:** FAB on Test Center page opens CreateTaskModal instead of a test creation modal
- **Spec:**
  - Create `CreateTestModal.tsx` with fields:
    - Test Name (text input)
    - Agent Group (select: populated from agents in Firestore)
    - Test Type (select: Unit, Integration, E2E, Stress)
    - Priority (select: Low, Medium, High, Urgent)
    - Description (textarea)
  - On submit: write to Firestore `test_runs` collection with status `'pending'`
  - Update `App.tsx`: when `activeTab === 'test-center'`, FAB opens CreateTestModal instead of CreateTaskModal
  - Add new state: `isTestModalOpen` alongside existing `isTaskModalOpen`
- **Assigned:** UI Dev 🖥️
- **Review:** Khaled 📐

### TASK-2.2: Fix TestCenter Firestore Listener Leak
- **Priority:** P1 — Memory leak
- **File:** `src/components/TestCenter.tsx`
- **Issue:** `onSnapshot` listener inside `onAuthStateChanged` callback is not properly cleaned up. The inner `unsubRuns` is returned but `onAuthStateChanged` doesn't propagate it.
- **Fix:**
  ```typescript
  useEffect(() => {
    let unsubRuns: (() => void) | null = null;
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      // Clean up previous listener
      if (unsubRuns) unsubRuns();
      
      if (user) {
        const q = query(collection(db, 'runs'), orderBy('createdAt', 'desc'), limit(20));
        unsubRuns = onSnapshot(q, (snapshot) => {
          setRuns(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
          setLoading(false);
        }, () => setLoading(false));
      } else {
        setRuns([]);
        setLoading(false);
      }
    });
    return () => {
      unsubAuth();
      if (unsubRuns) unsubRuns();
    };
  }, []);
  ```
- **Assigned:** Dev 💻
- **Review:** Khaled 📐

### TASK-2.3: Dashboard Chart — Connect to Real Data
- **Priority:** P2
- **Files:** `src/components/Dashboard.tsx`, `src/lib/firestore-helpers.ts` (new)
- **Issue:** AreaChart uses hardcoded 7-day data array
- **Spec:**
  1. Create `src/lib/firestore-helpers.ts` (per ADR-003)
  2. Add function: `getTestRunsByDay(days: number)` — queries `runs` collection, groups by day, returns `{name, success, fail}[]`
  3. Replace hardcoded `data` array with state populated from Firestore
  4. Show "No data yet" state if no test runs exist
  5. Keep chart rendering even with empty data (empty chart, not blank space)
- **Assigned:** Senior Dev 🔧
- **Review:** Khaled 📐

### TASK-2.4: Dashboard Stats — Resource Load & Token Usage
- **Priority:** P2
- **File:** `src/components/Dashboard.tsx`
- **Issue:** "Resource Load 82%" and "Token Usage 2.4M/5M" are hardcoded
- **Options:**
  - **A)** Remove these cards entirely — we don't have real infrastructure metrics
  - **B)** Replace with metrics we DO have: "Agents Online" and "Test Pass Rate" progress bars
  - **C)** Wire to actual system metrics (requires backend endpoint)
- **Decision:** Khaled to choose
- **Implementation:** Dev 💻
- **Review:** Khaled 📐

---

## PHASE 3 — Placeholder Cleanup

### TASK-3.1: Replace alert() Placeholders with Toast Notifications
- **Priority:** P3
- **Files:** Multiple components
- **Issue:** 30 buttons use `alert()` or do nothing
- **Spec:**
  - Create a simple toast notification system: `src/components/Toast.tsx`
  - Replace all `alert()` calls with toast notifications
  - For buttons that genuinely don't have a feature yet: show toast "Coming soon" instead of alert
  - List of items to fix:
    - TopBar: Notifications bell → show "No new notifications" toast
    - Sidebar: Security → show "Security scan active" toast
    - TasksView: Filter button → toggle filter panel
    - TasksView: Sort button → toggle sort options
    - TestCenter: Filter → toggle filter panel
    - TestCenter: Download → export test runs as CSV
    - TestCenter: Wrap button → toggle log line wrapping
    - TestCenter: "View All Run History" → navigate or expand table
    - GitHubWorkspace: All buttons (if kept)
- **Assigned:** UI Dev 🖥️
- **Review:** Senior Dev 🔧

### TASK-3.2: Add Task Detail Requirements from Firestore
- **Priority:** P3
- **File:** `src/components/TasksView.tsx`
- **Issue:** Requirements section always shows same 2 hardcoded requirements
- **Spec:**
  - Query Firestore `requirements` collection
  - Filter by task ID if linked
  - If no requirements, show "No requirements linked" empty state
- **Assigned:** Dev 💻
- **Review:** Khaled 📐

---

## Team Assignments

| Agent | Phase 1 | Phase 2 | Phase 3 |
|-------|---------|---------|---------|
| **Khaled 📐** | Review all, decide TASK-1.3, TASK-1.4, TASK-2.4 | Review all | Review |
| **Senior Dev 🔧** | TASK-1.3 (Deploy Swarm) | TASK-2.3 (Dashboard chart) | Review TASK-3.1 |
| **Dev 💻** | TASK-1.1 (Edit), TASK-1.2 (Execute) | TASK-2.2 (Listener leak), TASK-2.4 (Stats) | TASK-3.2 (Requirements) |
| **UI Dev 🖥️** | TASK-1.4 (GitHub page) | TASK-2.1 (Test FAB) | TASK-3.1 (Toast system) |

## Gates

| Gate | Criteria | Approver |
|------|----------|----------|
| Phase 1 → Phase 2 | All 4 blockers fixed, builds clean, tested in browser | Ahmed + Khaled |
| Phase 2 → Phase 3 | High issues resolved, no regressions | Khaled |
| Phase 3 Complete | Zero `alert()` calls, zero hardcoded data | Khaled → Ahmed sign-off |

## Definition of Done
- [ ] `npm run build` passes with zero errors
- [ ] No `alert()` calls remain in production code
- [ ] All buttons have real handlers or "Coming soon" toast
- [ ] Task lifecycle works end-to-end: Create → Execute → Review → Done
- [ ] Test creation works from Test Center FAB
- [ ] Dashboard shows real data (or clear empty states)
- [ ] No Firestore listener leaks
- [ ] QA re-test passes 90%+ working rate
