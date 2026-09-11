# SP-002 Architecture Review

**Reviewer:** Khaled 📐 (SW Architect Agent)
**Date:** 2026-05-07
**Status:** COMPLETE
**QA Score:** 7.5/10

---

## Executive Summary

SP-002 delivers solid functional value — dead metrics replaced, chart wired to Firestore, test run drill-down, global search, error boundaries, mobile responsive, and a comprehensive agent integration design doc. The backend is production-ready in structure.

**However**, there are two architectural violations from SP-001 ADRs and several code quality issues that need attention before SP-003.

**Verdict:** Functional pass. Architectural debt carried forward.

---

## 1. ADR Alignment Check

### ADR-001 (Direct Firestore SDK for Client) — ⚠️ PARTIALLY VIOLATED

**Problem:** `Dashboard.tsx` still imports and calls `alm-bridge.ts`:

```typescript
import { fetchAgents, fetchTasks, fetchTestRuns, fetchHealth } from '../lib/alm-bridge';
```

The Dashboard fetches tasks, agents, test runs, and health stats through the Express API bridge — exactly what ADR-001 explicitly said to remove. Only the chart (`getTestRunsByDay`) uses the new shared Firestore helper.

**Impact:** The three bottom stat cards (Avg Runtime, Agents Online, Tasks Completed) and the two top stat cards all go through the server API instead of direct Firestore. This means:
- No real-time updates for dashboard stats (bridge is REST, not onSnapshot)
- Inconsistent data access patterns — TasksView uses Firestore direct, Dashboard uses bridge
- Dual data architecture persists — the core problem ADR-001 was meant to solve

**Fix:** Replace all `alm-bridge` calls in Dashboard with `firestore-helpers.ts` functions. The helpers already exist for agents status and task counts. Add a `getTestRunStats()` helper and use it.

**Severity:** HIGH — this is an explicit ADR violation

### ADR-002 (GitHub Workspace via Firestore) — ✅ No Change (Phase 2-3)
Not in SP-002 scope. Correctly deferred.

### ADR-003 (Shared Firestore Helpers) — ✅ IMPLEMENTED
`firestore-helpers.ts` created with:
- `getTestRunsByDay()` — chart data aggregation
- `getTasksCount()` — task counting by status
- `getAgentsStatus()` — agent online/total

**However**, only `getTestRunsByDay` is actually used (by Dashboard chart). `getTasksCount` and `getAgentsStatus` are defined but not consumed anywhere — Dashboard still uses `alm-bridge` for those queries. This is dead code waiting to be wired.

**Severity:** MEDIUM — helpers exist but the migration is incomplete

### SP-001 Decisions — ✅ All Honored
- DECISION-SP1-1 (Deploy Swarm → Option A): Implemented
- DECISION-SP1-2 (GitHub removed from nav): Implemented
- DECISION-SP1-3 (Dashboard stats → real metrics): Partially — stats show real data but via bridge, not Firestore helpers

---

## 2. firestore-helpers.ts Review

**Overall:** Well-structured. Clean API surface, good types, proper JSDoc.

**Strengths:**
- Correct use of Firestore `Timestamp` handling (`toDate()` fallback for both Timestamp and Date)
- Good date bucketing logic for chart aggregation
- Clean separation of concerns — pure data functions, no React coupling
- Accepts `db` as parameter rather than importing — testable

**Issues:**

| Issue | Severity | Detail |
|-------|----------|--------|
| No error boundary | LOW | Helpers throw on Firestore errors; callers must catch. Acceptable but worth noting. |
| No caching | LOW | Each Dashboard load hits Firestore. For low-traffic internal tool, fine. Add memoization later if needed. |
| `getTasksCount` without userId fetches ALL tasks | MEDIUM | When `userId` is omitted, it queries the entire `tasks` collection. Client-side this should always be scoped. Consider making `userId` required, or defaulting to current user. |
| Missing helpers from ADR-003 spec | LOW | ADR-003 listed `getTaskById`, `getRequirements`, `getRepos`, `subscribeToTasks`, `subscribeToTestRuns` — none implemented yet. Not a blocker for SP-002, but the gap should be tracked. |

**Missing from spec but needed:** A `getTestRunStats()` helper that returns pass rate and average duration — Dashboard currently computes this client-side from `alm-bridge` data.

---

## 3. AGENT_INTEGRATION_DESIGN.md Review

**Overall:** This is the strongest deliverable in SP-002. Comprehensive, well-structured, and actionable.

**Strengths:**
- Complete data flow diagrams (§6) — ASCII art is clear and unambiguous
- API endpoint reference (§7) — every route documented with method, path, purpose, auth
- Error handling strategy (§8) — retry policies, error classification, heartbeat failure recovery, conflict resolution
- Staleness detection thresholds (3 min stale, 10 min offline) — concrete and defensible
- Idempotency key recommendation for test run submission — shows operational maturity
- Agent integration checklist (§9) — clear onboarding steps

**Issues:**

| Issue | Severity | Detail |
|-------|----------|--------|
| Heartbeat endpoint mismatch | MEDIUM | §2.4 defines `POST /api/agents/:id/heartbeat` as a new endpoint. But the actual `server/routes/agents.ts` implements `PATCH /api/agents/:id` for the same purpose. The doc and code diverge. Pick one. |
| Collection name inconsistency | HIGH | Doc consistently uses `runs` (§4.2). The backend `server/routes/test-runs.ts` writes to `test_runs`. The client Firestore queries in `SearchResults.tsx` query `runs`. This is a **data split bug** — test runs created by agents via the API go to `test_runs`, while the client reads from `runs`. They're different collections. |
| Security rules overly broad | MEDIUM | §5.1 shows `match /{collection}/{docId=**}` with owner check. This wildcard blocks granular per-collection rules. Fine for MVP, but won't scale. |
| No auth middleware on routes | HIGH | `server/index.ts` has no Firebase Auth verification middleware. Any request to the API routes is unauthenticated. The doc says "Firebase" auth (§7) but there's no `verifyIdToken` anywhere. The API is wide open. |
| Audit log not in collection map | LOW | §5 lists 5 collections but `audit_log` (used by `tasks.ts` route) isn't listed. |
| Agent claiming race condition | LOW | §8.5 mentions 409 on double-claim, but the `PATCH /api/tasks/:id` route has no transaction or concurrency guard. First-write-wins silently. |

**The `runs` vs `test_runs` collection bug is the most critical finding.** This means agent-submitted test runs (via the API) and client-created test runs (via direct Firestore from TestCenter) go to different collections. The dashboard chart and search won't see agent-submitted runs, and the API `/test-runs` endpoint won't see client-created runs.

---

## 4. Global Search Event Bus Review (`search-nav.ts`)

**Implementation:** Clean, minimal. 31 lines. Pub/sub with typed payloads.

**Strengths:**
- Correct unsubscribe pattern (returns cleanup function)
- Simple and dependency-free
- Type-safe payload interface

**Concerns:**

| Concern | Severity | Detail |
|---------|----------|--------|
| No event deduplication | LOW | If two components emit the same nav event, both fire. Not a real problem at current scale. |
| Module-level listener array | LOW | `listeners` is a module-scoped mutable array. Works for SPA, but if the module were hot-reloaded, listeners would leak. Acceptable for Vite dev server. |
| Search query fetches too much | MEDIUM | `SearchResults.tsx` fetches up to 50 tasks and 50 runs, then filters client-side with `String.includes()`. This is an N+1 pattern — the Firestore query itself doesn't filter by search term. For 50 docs, acceptable. At scale, this needs a search index (Algolia, Typesense, or Firestore `array-contains` on trigrams). |
| Runs query not user-scoped | MEDIUM | `SearchResults.tsx` queries `runs` collection without `where('ownerId', '==', user.uid)`. Tasks are scoped, runs are not. Data leak. |

**Severity:** The runs query scoping is a security concern — any authenticated user can see all runs in the system.

---

## 5. Error Boundary Isolation Review

**Implementation:** Solid. Each page route wrapped in its own `<ErrorBoundary>`:

```tsx
case 'dashboard': return <ErrorBoundary name="Dashboard"><Dashboard /></ErrorBoundary>;
case 'tasks':     return <ErrorBoundary name="Tasks"><TasksView /></ErrorBoundary>;
// ... etc
```

**Strengths:**
- Correct — a crash in TestCenter won't take down Dashboard
- Named boundaries for debugging (the `name` prop shows in error message)
- Retry button resets state properly
- Error stack shown in development-friendly format
- `componentDidCatch` logs to console with component stack

**Concerns:**

| Concern | Severity | Detail |
|---------|----------|--------|
| No error reporting | LOW | Errors only go to `console.error`. No Sentry, no logging service. Acceptable for internal tool. |
| No state preservation on retry | LOW | `handleRetry` resets `hasError` to false, which re-renders children from scratch. User loses any in-flight state. Acceptable for a retry button. |
| No global fallback | LOW | If App itself crashes (outside ErrorBoundary), the whole app goes white. Consider a root-level boundary with a "reload the page" message. |

**Verdict:** Good implementation. No changes needed for SP-002.

---

## 6. Mobile Responsive Patterns Review

**Sidebar:**
- Proper mobile pattern: hamburger menu → slide-in overlay with backdrop
- `AnimatePresence` for smooth enter/exit transitions
- Outside-click-to-close behavior
- Fixed mobile header bar with z-index management (z-[70])
- Desktop sidebar hidden on mobile, shown at `lg` breakpoint

**TasksView:**
- Master-detail pattern with responsive toggle: on mobile, list OR detail (not both)
- `showDetail` state controls visibility with `hidden lg:flex` / `hidden lg:block`
- Back button for mobile navigation
- Responsive padding: `p-4 sm:p-8`

**TestCenter:**
- Responsive header with `hidden sm:inline` for button text truncation
- Grid layout adapts with `grid-cols-2 md:grid-cols-4` in expanded rows
- Responsive padding: `px-4 sm:px-6`

**Dashboard:**
- Uses `grid-cols-12` with `col-span-12 lg:col-span-8` / `col-span-12 lg:col-span-4`
- Bottom stats: `grid-cols-1 md:grid-cols-3`

**Concerns:**

| Concern | Severity | Detail |
|---------|----------|--------|
| TestCenter live logs hardcoded | LOW | The "Live Logs" panel has hardcoded fake log entries. Not a responsive issue, but it's dead UI. Should show real data or be hidden. |
| FAB button on mobile | LOW | Floating Action Button at `bottom-8 right-8` may overlap with expanded test run detail on small screens. |
| TopBar not reviewed | INFO | Would need to check TopBar responsive behavior, but not flagged as a concern. |

**Architectural consistency:** All components follow the same Tailwind responsive pattern (`sm:`, `md:`, `lg:` breakpoints). Consistent use of `cn()` utility for conditional classes. No inline style hacks (except the percentage-width progress bars, which are appropriate).

**Verdict:** Mobile responsive implementation is solid and consistent.

---

## 7. Backend Server Structure Review

**Structure:**
```
server/
├── index.ts           # Express app, CORS, routes, error handling
├── firebase-admin.ts  # Firebase Admin SDK initialization with demo mode
├── .env               # Server environment variables
├── seed-agents.ts     # Agent seeding script
└── routes/
    ├── agents.ts      # Agent CRUD + heartbeat (PATCH)
    ├── audit.ts       # Audit log queries
    ├── requirements.ts # Requirements CRUD
    ├── tasks.ts       # Task CRUD with history tracking + audit
    └── test-runs.ts   # Test run submission + listing
```

**Strengths:**
- Demo mode fallback — server runs without Firebase credentials. Returns empty arrays or 503 for writes. Smart for development.
- Health check endpoint with Firebase connectivity reporting
- Task routes include automatic audit log creation on CUD operations
- History tracking in task updates (stores `from`/`to`/`field`/`changedBy`)
- CORS configured for both localhost and production domains
- Clean route separation — one file per domain

**Issues:**

| Issue | Severity | Detail |
|-------|----------|--------|
| No auth middleware | HIGH | Zero authentication on any route. Anyone who can reach port 3001 can read/write all data. The agent integration doc specifies "Firebase" auth but no `verifyIdToken` middleware exists. |
| No input validation | MEDIUM | Routes spread `req.body` directly into Firestore documents (`...req.body`). No schema validation. Malicious or malformed payloads go straight to the database. |
| `test_runs` vs `runs` collection name | HIGH | API routes write to `test_runs`; client code reads from `runs`. Collection name mismatch means data written by agents via API is invisible to the React client. |
| No rate limiting | LOW | No rate limiting on any endpoint. Acceptable for internal tool, but the agent heartbeat (60s interval × N agents) could be a concern at scale. |
| History array unbounded growth | MEDIUM | Task PATCH appends to `history` array without size limit. Long-lived tasks with many updates will bloat the document. Consider capping at 50 entries or moving history to a sub-collection. |
| CORS allows all origins | LOW | The CORS callback returns `callback(null, true)` for all origins. The `allowedOrigins` list is effectively unused. Comment says "restrict in production" — do that. |

---

## Summary: Issues by Priority

### Must Fix (before SP-003)

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| 1 | **`runs` vs `test_runs` collection split** | `server/routes/test-runs.ts` vs client Firestore queries | Agent API writes invisible to client; client writes invisible to API |
| 2 | **No auth middleware on API routes** | `server/index.ts` | API is wide open — anyone can CRUD all data |
| 3 | **Dashboard still uses alm-bridge** (ADR-001 violation) | `Dashboard.tsx` lines 1-2 imports | Dual data architecture persists; no real-time dashboard updates |

### Should Fix (technical debt)

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| 4 | Search runs query not user-scoped | `SearchResults.tsx` runs query | Data leak — users see other users' runs |
| 5 | `AGENT_INTEGRATION_DESIGN.md` heartbeat endpoint mismatch | §2.4 vs `agents.ts` route | Doc doesn't match implementation |
| 6 | No input validation on API routes | All `server/routes/*.ts` | Malformed data goes to Firestore |
| 7 | Task history array unbounded growth | `server/routes/tasks.ts` PATCH | Document bloat over time |

### Track (future sprints)

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| 8 | Complete ADR-003 helpers (`getTaskById`, `subscribeTo*`, etc.) | `firestore-helpers.ts` | Helpers defined but not all implemented |
| 9 | Add error reporting (Sentry or similar) | `ErrorBoundary.tsx` | Errors only in console |
| 10 | Search needs server-side filtering at scale | `SearchResults.tsx` | Client-side filtering won't scale past ~100 docs |
| 11 | Rate limiting on API routes | `server/index.ts` | No protection against burst requests |
| 12 | Tighten CORS for production | `server/index.ts` | Currently allows all origins |

---

## Architectural Recommendations for SP-003

1. **Collection name unification** — Decide on `runs` (client convention) or `test_runs` (server convention). Standardize everywhere. My recommendation: use `runs` — it's what the client code and `firestore-helpers.ts` expect.

2. **Auth middleware** — Add Firebase Admin `verifyIdToken` middleware to Express. Apply to all routes except `/api/health`. This is prerequisite for any agent integration.

3. **Complete ADR-001 migration** — Remove all `alm-bridge.ts` imports from Dashboard. Wire to `firestore-helpers.ts`. The helpers already exist.

4. **Input validation** — Add a lightweight validation layer (Zod schemas or manual checks) to API routes before writing to Firestore.

5. **Add missing Firestore helpers** — Implement `getTestRunStats()`, `getTaskById()`, subscription helpers from ADR-003 spec.

---

*End of review.*
