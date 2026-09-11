# SP-004 Architecture Review

**Reviewer:** Khaled 📐 (SW Architect Agent)
**Date:** 2026-05-07
**Sprint:** SP-004 (Hardening)
**QA Score:** 8.4/10 (up from 7.5 in SP-002)
**Status:** COMPLETE

---

## Executive Summary

SP-004 was a hardening sprint that directly targeted the architectural debt identified in SP-002. The results are tangible: TypeScript strict mode is clean, the alm-bridge ghost is exorcised, validation ordering follows correct HTTP semantics, CORS is production-ready, and a root ErrorBoundary protects the app. The codebase is materially healthier.

Of the 7 priority items from the SP-002 review (3 Must Fix + 4 Should Fix), **5 are resolved**. The remaining 2 are either already silently fixed (search runs scoping) or deferred (doc/code heartbeat mismatch). The new BugsView feature introduces fresh architectural debt — a status case mismatch bug and pattern inconsistencies — that SP-005 must address.

**Verdict:** Hardening pass. Architectural debt reduced significantly but not eliminated. One functional bug introduced (case mismatch).

---

## 1. SP-002 Review Recommendations — Full Status Tracker

### Must Fix Items (from SP-002)

| # | Issue | SP-002 Severity | SP-004 Status | Evidence |
|---|-------|----------------|---------------|----------|
| 1 | `runs` vs `test_runs` collection split | HIGH | ✅ FIXED | `server/routes/test-runs.ts` now uses `db.collection('runs')` (line 26, 41). Client and server unified on `runs`. |
| 2 | No auth middleware on API routes | HIGH | ✅ FIXED | `server/index.ts` has `verifyFirebaseToken` middleware on all `/api/*` routes except `/health`. Demo mode skips gracefully. Token extracted from `Authorization: Bearer` or `X-Firebase-Token` header. |
| 3 | Dashboard uses alm-bridge (ADR-001 violation) | HIGH | ✅ FIXED | `Dashboard.tsx` imports exclusively from `firestore-helpers.ts`: `getTestRunsByDay`, `getTasksCount`, `getAgentsStatus`, `getTestRunStats`. Zero alm-bridge references anywhere in the codebase. |

### Should Fix Items (from SP-002)

| # | Issue | SP-002 Severity | SP-004 Status | Evidence |
|---|-------|----------------|---------------|----------|
| 4 | Search runs query not user-scoped | MEDIUM | ✅ FIXED | `SearchResults.tsx` line 100: `where('ownerId', '==', user.uid)` on the runs query. Both tasks and runs are now user-scoped. |
| 5 | Agent integration doc heartbeat mismatch | MEDIUM | ⏸ DEFERRED | Documentation vs code discrepancy remains. Low impact — agents use the actual PATCH endpoint. |
| 6 | No input validation on API routes | MEDIUM | ✅ FIXED | All mutating routes validate input (400) before checking Firebase readiness (503). Verified in tasks, test-runs, requirements, agents. |
| 7 | Task history array unbounded growth | MEDIUM | ✅ FIXED | `tasks.ts` PATCH: `updatedHistory.slice(-50)` caps history at 50 entries. |

### Track Items (from SP-002)

| # | Issue | SP-004 Status |
|---|-------|---------------|
| 8 | Complete ADR-003 helpers | ✅ `getTestRunStats()` now implemented and consumed by Dashboard |
| 9 | Error reporting (Sentry) | Not addressed — acceptable for internal tool |
| 10 | Search server-side filtering | Not addressed — acceptable at current scale |
| 11 | Rate limiting | Not addressed — acceptable for internal tool |
| 12 | Tighten CORS | ✅ FIXED |

**Summary: 9 of 12 SP-002 items resolved.** This is strong closure.

---

## 2. alm-bridge Elimination — Complete ✅

`alm-bridge.ts` is deleted. `grep -r "alm-bridge"` across the entire project returns zero matches. No orphan imports, no dead references.

Dashboard now exclusively uses `firestore-helpers.ts`:
```typescript
import { getTestRunsByDay, getTasksCount, getAgentsStatus, getTestRunStats, type ChartDataPoint } from '../lib/firestore-helpers';
```

All four helpers are consumed. ADR-001 is now fully honored. ADR-003 (shared helpers) is substantially complete.

---

## 3. CORS Configuration — Production Ready ✅

```typescript
const isProduction = process.env.NODE_ENV === 'production';
const productionOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
  : [];
```

**Behavior:**
- **Development:** All origins allowed
- **Production:** Only `ALLOWED_ORIGINS` env var entries permitted
- **No origin (curl, server-to-server):** Always allowed
- **Unmatched production origin:** Returns CORS error
- **Missing `ALLOWED_ORIGINS` in production:** Fail-safe — no origins allowed

This is correct and well-implemented. The comma-separated parsing with `trim()` and `filter(Boolean)` handles edge cases well.

**Minor note:** CORS allows `PUT` method but no server routes use `PUT`. Only `PATCH` is used. Consider removing `PUT` from allowed methods to reduce surface area. Cosmetic, not a security concern.

---

## 4. Validation Ordering — Correct HTTP Semantics ✅

All write handlers follow:

```
1. Parse and validate input → 400 Bad Request
2. Check Firebase readiness → 503 Service Unavailable
3. Execute Firestore operation → 500 on failure
```

Verified in every mutating route handler:

| Route File | Handler | Validates Before Firebase? |
|------------|---------|---------------------------|
| `tasks.ts` | `POST /` | ✅ title required, status type check |
| `tasks.ts` | `PATCH /:id` | ✅ non-empty body check |
| `test-runs.ts` | `POST /` | ✅ taskId + status required |
| `requirements.ts` | `POST /` | ✅ title required, description type check |
| `requirements.ts` | `PATCH /:id` | ✅ non-empty body check |
| `agents.ts` | `PATCH /:id` | ✅ non-empty body check |

This means bad input gets a 400 even in demo mode (no Firebase). Correct.

---

## 5. Root ErrorBoundary — Correct ✅

Two-level boundary strategy in `App.tsx`:

```
<ErrorBoundary name="App">          ← root: catches Sidebar, TopBar, ToastProvider crashes
  <ToastProvider>
    <div>
      ...main layout...
      <main>
        <ErrorBoundary name="Dashboard">  ← per-page: isolates page crashes
          <Dashboard />
        </ErrorBoundary>
        <ErrorBoundary name="Tasks">
          <TasksView />
        </ErrorBoundary>
        <ErrorBoundary name="Test Center">
          <TestCenter />
        </ErrorBoundary>
        <ErrorBoundary name="Bugs">
          <BugsView />
        </ErrorBoundary>
        ...
      </main>
    </div>
  </ToastProvider>
</ErrorBoundary>
```

Login path also wrapped: `<ErrorBoundary name="App"><LoginPage /></ErrorBoundary>`

This is textbook React error boundary architecture. Per-page isolation prevents cascade failures. Root boundary catches layout-level crashes.

---

## 6. TypeScript Strict Mode — Clean ✅

`tsc --noEmit` exits 0 with zero errors. Confirmed independently. Previously had 18+ errors.

Key typing improvements visible:
- Server routes: `import { Timestamp, type Query } from 'firebase-admin/firestore'`
- `firestore-helpers.ts`: proper interfaces (`ChartDataPoint`, `TasksCountResult`, `AgentsStatusResult`, `TestRunStatsResult`)
- Components: typed state (`useState<Set<string>>`, `useState<BugItem[]>`)
- BugsView: typed union types for status and priority options

**Remaining `any` types:** Several components still use `any[]` for tasks, agents, and runs data. Not a correctness issue, but tracked for future type strengthening.

---

## 7. BugsView.tsx — Architecture Review

### Pattern Consistency Matrix

| Aspect | TasksView | TestCenter | BugsView | Verdict |
|--------|-----------|------------|----------|---------|
| Data source | Direct Firestore | Direct Firestore | Direct Firestore | ✅ ADR-001 |
| User scoping | `ownerId` | `ownerId` | `ownerId` | ✅ Consistent |
| Real-time | `onSnapshot` | `onSnapshot` | `onSnapshot` | ✅ Consistent |
| Auth pattern | `onAuthStateChanged` | `onAuthStateChanged` | `onAuthStateChanged` | ✅ Consistent |
| Status filters | `Set<string>` toggle | `Set<RunStatus>` toggle | `Set<BugStatus>` toggle | ✅ Consistent |
| Sort dropdown | priority/created/status | N/A | priority/created/status | ✅ Consistent |
| Error handling | `handleFirestoreError` | `console.error` | `handleFirestoreError` | ✅ Better than TestCenter |
| Create modal | External component | External component | **Inline** | ⚠️ Inconsistent |
| FAB button | Via App.tsx | Via App.tsx | **Component-local** | ⚠️ Inconsistent |
| Server route | Yes (`tasks.ts`) | Yes (`test-runs.ts`) | **None** | ⚠️ Missing |

### Strengths
- **Well-typed**: `BugItem` interface with union types for status/priority
- **Owner-scoped query**: `where('ownerId', '==', user.uid)` — no data leaks
- **Filter UX**: Status pill toggles match TestCenter's pattern exactly
- **Empty states**: Proper handling for "no bugs" and "no matching filters" scenarios
- **Firestore error handling**: Uses shared `handleFirestoreError` (better than TestCenter's raw `console.error`)

### Concerns

**C1. CreateBugModal is inline — not a separate file** (LOW)
BugsView.tsx bundles both the list view and the create modal (~300 + ~120 lines). TasksView delegates to `CreateTaskModal.tsx`, TestCenter to `CreateTestModal.tsx`. File-per-component is the established convention.
→ **Extract to `CreateBugModal.tsx`**

**C2. FAB is component-local, not coordinated with App.tsx** (LOW)
Tasks and TestCenter get their FAB from App.tsx's state machine. BugsView has its own red FAB (always visible, never toggled). Works but diverges from the pattern.
→ **Either extend App.tsx FAB or document the intentional divergence**

**C3. No bugs server route** (MEDIUM)
All other entities have server routes with audit logging. Bugs write directly from the client. This means:
- No server-side audit trail for bug creates
- No server-side validation for bug writes
- Bugs bypass the auth middleware (they use client Firebase Auth, which is fine, but it's asymmetrical)

This is actually acceptable from a Firebase security perspective (Firestore Rules should gate access). But if the project requires server-side audit trail consistency across all entities, bugs needs a route.
→ **Add `server/routes/bugs.ts` with POST/PATCH + audit logging**

**C4. No bug editing capability** (MEDIUM)
TasksView has a master-detail panel with inline editing and status transitions (EXECUTE → COMPLETE → APPROVE). BugsView is create-only — no way to change status, priority, or description after creation. Users can create bugs but never resolve them through the UI.
→ **Add status transition UI (Open → In Progress → Resolved → Closed) at minimum**

**C5. `fabVisible` state is always true** (TRIVIAL)
`const [fabVisible, setFabVisible] = useState(true)` is declared but never toggled. Dead state.
→ **Remove or wire to a hide-on-scroll behavior**

---

## 8. TasksView statusFilters Fix ✅

```typescript
const [statusFilters, setStatusFilters] = useState<Set<string>>(
  new Set(['To Do', 'In Progress', 'Review', 'Done'])
);
```

Properly declared, properly typed, properly used in the filter computation at line 141:
```typescript
result = result.filter(t => statusFilters.has(t.status));
```

The SP-003 crash (state not properly declared) is resolved. Filter UI with checkboxes works correctly. Cannot deselect all (guard clause in toggle logic). Good.

---

## 9. TestCenter — View All Toggle + Pending Filter + Owner Scoping ✅

**View All Toggle:**
```typescript
const [showAllRuns, setShowAllRuns] = useState(false);
const filteredRuns = useMemo(() => {
  const byStatus = runs.filter(run => activeFilters.has(run.status as RunStatus));
  return showAllRuns ? byStatus : byStatus.slice(0, 10);
}, [runs, activeFilters, showAllRuns]);
```
Default shows 10, toggle shows all. Filter-aware. Correct.

**Pending Filter:**
```typescript
const STATUS_FILTERS = ['Passed', 'Failed', 'Skipped', 'Pending'] as const;
```
Pending is included. Filter pills render correctly.

**Owner Scoping:**
```typescript
query(collection(db, 'runs'), where('ownerId', '==', user.uid), orderBy('createdAt', 'desc'), limit(100))
```
Properly scoped to authenticated user. No data leaks.

---

## 10. 🐛 BUG: `'pending'` vs `'Pending'` Case Mismatch — HIGH

`CreateTestModal.tsx` line 51 writes status as lowercase:
```typescript
status: 'pending',
```

`TestCenter.tsx` STATUS_FILTERS expects capitalized:
```typescript
const STATUS_FILTERS = ['Passed', 'Failed', 'Skipped', 'Pending'] as const;
```

Since `activeFilters.has(run.status)` is case-sensitive, newly created tests with `status: 'pending'` will **not** appear when only the 'Pending' filter is active. They'll be invisible in the filtered view.

**This is a functional bug.** Standardize casing. Recommended fix: change CreateTestModal to write `'Pending'` to match the filter constants.

---

## 11. firestore-helpers.ts — New Helpers Review

`getTestRunStats()` is now implemented:
```typescript
export async function getTestRunStats(db: Firestore): Promise<TestRunStatsResult> {
  // ...computes passRate and avgDuration from 'runs' collection
}
```

This was called out as missing in SP-002. Now implemented and consumed by Dashboard for stat cards.

Other helpers added: `getTasks()`, `getTestRuns()` — basic fetch helpers for full collection queries.

**`getTasksCount()` without userId** still queries all tasks when `userId` is omitted. Previously flagged in SP-002. Acceptable for internal tool but worth making `userId` required in the future.

---

## 12. Outstanding Architectural Debt Summary

### Carried Forward (Unresolved)

| # | Issue | Severity | Sprint Origin |
|---|-------|----------|---------------|
| A | Agent integration doc heartbeat endpoint mismatch | LOW | SP-002 |
| B | No rate limiting on API routes | LOW | SP-002 |
| C | No error reporting service (Sentry) | LOW | SP-002 |
| D | Client-side search filtering won't scale | LOW | SP-002 |
| E | Some `any` types in component state | LOW | SP-004 |

### New Debt from SP-004

| # | Issue | Severity | Detail |
|---|-------|----------|--------|
| F | **`'pending'` vs `'Pending'` case mismatch** | **HIGH** | Functional bug — new tests invisible in Pending filter |
| G | BugsView CreateBugModal inline | LOW | File-per-component convention broken |
| H | BugsView FAB not coordinated with App.tsx | LOW | Works but inconsistent |
| I | No bugs server route (no audit trail) | MEDIUM | Asymmetry with tasks/requirements |
| J | No bug editing — create-only | MEDIUM | Users can't resolve bugs through UI |
| K | `fabVisible` dead state in BugsView | TRIVIAL | Always `true`, never toggled |
| L | Bundle size (1.39MB index.js) | LOW | No code splitting — QA flagged |

---

## 13. Recommendations for SP-005

### Must Fix

1. **Fix `'pending'` vs `'Pending'` case mismatch** in CreateTestModal.tsx — change to write `'Pending'` (capitalized) to match STATUS_FILTERS. Consider standardizing all Firestore status values to a project-wide casing convention.

2. **Add bug editing capability** — At minimum, status transitions (Open → In Progress → Resolved → Closed). TasksView's inline edit pattern is the reference implementation.

### Should Fix

3. **Extract `CreateBugModal`** to its own file (`src/components/CreateBugModal.tsx`) for convention consistency.

4. **Add `server/routes/bugs.ts`** with POST and PATCH endpoints that include audit log entries, matching the `tasks.ts` pattern. This ensures audit trail consistency across all entities.

5. **Remove dead `fabVisible` state** from BugsView or wire it to a hide-on-scroll behavior.

### Track

6. Extend App.tsx FAB pattern to include Bugs tab, or document the divergence as intentional.
7. Remove `PUT` from CORS allowed methods (unused by any route).
8. Add code splitting (React.lazy + Suspense) to reduce initial bundle size.
9. Gradually replace `any` types in component state with proper interfaces.

---

## Score Justification

| Category | Score | Rationale |
|----------|-------|-----------|
| ADR Compliance | 9/10 | ADR-001 fully honored (alm-bridge eliminated). ADR-003 helpers maturing. |
| Code Quality | 8/10 | Strict mode clean, validation correct, good types. Case mismatch bug docks a point. |
| Architecture Consistency | 7/10 | BugsView diverges from patterns (inline modal, separate FAB, no server route, no edit). |
| Production Readiness | 9/10 | CORS production-ready, auth middleware working, ErrorBoundary correct, collection names unified. |
| Technical Debt Reduction | 9/10 | 9 of 12 SP-002 items resolved. New debt is bounded and well-characterized. |
| **Overall** | **8.4/10** | Strong hardening sprint. One real bug to fix. BugsView is a solid first pass that needs maturing. |

**Score progression: 4.5 → 7.6 → 7.5 → 8.4** — consistent upward trajectory.

---

*End of SP-004 Architecture Review. Khaled 📐*
