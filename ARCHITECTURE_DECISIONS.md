# Architecture Decision Records — AI_SWARM_ALM

**Date:** 2026-05-06
**Decider:** Khaled (SW Architect)
**Status:** APPROVED — Dev team proceeds with these decisions

---

## ADR-001: Unified Data Layer — Direct Firestore SDK

### Context
The current codebase has a **dual data architecture**:
- Some components (TasksView, TestCenter, AdminPage) call Firestore directly via client SDK
- Other components (Dashboard) call `alm-bridge.ts` → Express API → Firestore
- Express API has no auth filtering — returns ALL tasks regardless of user
- Firestore client queries properly filter by `ownerId == user.uid`

This creates inconsistent security, duplicate code paths, and confusion for developers.

### Decision

**Use direct Firestore SDK everywhere on the client side.** Express API is reserved exclusively for server-to-server and agent-to-ALM communication.

```
┌─────────────────────────────────────────────────┐
│                  React Client                    │
│                                                  │
│  All components → Firestore SDK (with Auth)      │
│  Security rules enforce per-user data access      │
└──────────────────────┬───────────────────────────┘
                       │
          ┌────────────┴────────────┐
          │      Firestore          │
          └────────────┬────────────┘
                       │
          ┌────────────┴────────────┐
          │   Express API (port 3001)│
          │   Agent/Server use ONLY  │
          │   No client-facing calls │
          └─────────────────────────┘
```

### Rationale

| Factor | Direct Firestore | Express API |
|--------|-----------------|-------------|
| Auth granularity | Per-user via security rules | Requires custom middleware (missing) |
| Real-time updates | Built-in `onSnapshot` | Needs WebSockets/SSE |
| Code simplicity | One SDK, one pattern | Two patterns to maintain |
| Offline support | Built-in | None |
| Current state | Already used by 3/5 components | Used by Dashboard only |
| Agent/external access | N/A (agents need REST) | This is its proper role |

### Action Items
1. **Dashboard.tsx**: Remove `alm-bridge.ts` imports. Replace with direct Firestore queries (matching TasksView pattern)
2. **alm-bridge.ts**: Keep the file but rename/relocate to `server/alm-api-client.ts` — it becomes the API reference for external consumers (agents, scripts)
3. **Express routes**: Keep all routes. They serve agents and server-side tools, not the React client
4. **New Firestore helper**: Create `src/lib/firestore-helpers.ts` — shared query functions for all components to avoid duplication

### Consequences
- ✅ Single data access pattern for all React components
- ✅ Auth enforcement via Firestore security rules (not developer discipline)
- ✅ Real-time subscriptions work everywhere
- ✅ Express API has a clear, focused purpose
- ⚠️ Dashboard rewrite required (alm-bridge calls → Firestore direct)
- ⚠️ Firestore security rules must be properly configured and tested

---

## ADR-002: GitHub Workspace — Firestore + Webhooks (Phased)

### Context
The GitHub Workspace page (`GitHubWorkspace.tsx`) is entirely static — hardcoded repos, PRs, stats, and a non-functional Connect button. Three options were presented:

- **A)** Wire to GitHub API directly (requires OAuth, token management)
- **B)** Connect to Firestore `repos` collection, seed from GitHub webhooks
- **C)** Remove page until ready to implement

### Decision

**Implement Option B (Firestore + Webhooks) in two phases.** The page stays, but is clearly marked as "Coming Soon" until Phase 1 is wired.

### Rationale

- **Option A rejected**: OAuth flow in a React SPA adds significant complexity. Token storage, refresh, scope management — this is a feature unto itself, not a quick wiring job. Also creates a hard dependency on a single developer's GitHub account.
- **Option B selected**: Firestore as intermediary gives us:
  - Decoupling — agents write repo data to Firestore, UI reads it
  - No OAuth needed in the SPA — data is in our DB
  - Webhooks push data in; agents can also write programmatically
  - Consistent with ADR-001 (everything reads from Firestore)
  - Future-proof: can swap GitHub for GitLab/Bitbucket without touching the UI
- **Option C rejected**: Removing the page loses the UI investment. Better to keep it with a clear status indicator.

### Implementation Phases

**Phase 1 — Data Foundation (with Phase 2 of execution plan):**
1. Create Firestore collections: `repos`, `pullRequests`, `deployments`
2. Build `GitHubWorkspace.tsx` to read from Firestore (replacing all hardcoded data)
3. Show empty states with "No repositories connected" messaging
4. Add manual seed script (`server/seed-github.ts`) for development/testing

**Phase 2 — Live Integration (Phase 3+):**
1. Set up GitHub webhook endpoint in Express API
2. Webhook writes push/PR/deployment events to Firestore
3. Connect button triggers OAuth flow to install webhook on user's repos
4. Real-time updates via Firestore `onSnapshot`

### Consequences
- ✅ UI component preserved and useful immediately (reads from seeded data)
- ✅ No OAuth complexity in Phase 1
- ✅ Consistent with unified Firestore architecture (ADR-001)
- ✅ Agent swarm can write repo data directly to Firestore
- ⚠️ Phase 1 won't have live GitHub data (acceptable — use seed data)
- ⚠️ Phase 2 requires webhook infrastructure and GitHub App setup

---

## ADR-003: Shared Firestore Helpers

### Context
Multiple components (TasksView, Dashboard, TestCenter, AdminPage) will all query Firestore directly. Without shared utilities, query logic gets duplicated.

### Decision

Create `src/lib/firestore-helpers.ts` with shared query functions:

```typescript
// Core helpers all components use:
- getTasks(filters?)          // with optional status/agent/date filters
- getTaskById(id)             // single task with sub-collections
- getAgents()                 // all agents (cached)
- getTestRuns(filters?)       // test runs with aggregation
- getRequirements(taskId?)    // requirements, optionally filtered by task
- getRepos()                  // repos for GitHub Workspace
- subscribeToTasks(callback)  // real-time subscription
- subscribeToTestRuns(callback)
```

### Rationale
- DRY — one source of truth for Firestore queries
- Consistent error handling and loading states
- Easier to add caching, optimistic updates, or retry logic in one place
- Clean migration path if we ever swap Firestore for something else

---

## Summary for Dev Team

| ADR | Decision | Who Implements | When |
|-----|----------|---------------|------|
| ADR-001 | Direct Firestore SDK for all client components | Senior Dev | Phase 2 |
| ADR-002 | GitHub Workspace reads from Firestore; webhooks later | UI Dev (Phase 1) + Senior Dev (Phase 2) | Phase 2-3 |
| ADR-003 | Shared firestore-helpers.ts utility module | Senior Dev | Phase 2 (first) |

**Execution order within Phase 2:**
1. Create `firestore-helpers.ts` (ADR-003)
2. Migrate Dashboard from alm-bridge to Firestore (ADR-001)
3. Wire GitHubWorkspace to Firestore collections (ADR-002 Phase 1)
4. Verify all components use consistent data layer

---

## Sprint SP-001 Architecture Decisions

**Date:** 2026-05-06
**Decider:** Newey (CTO)
**Status:** APPROVED — Khaled assigns, dev team executes

---

### DECISION-SP1-1: Deploy Swarm — Option A (Quick Alert + Nav)

**Context:** TASK-1.3 requires wiring the "Deploy Swarm" button in `TopBar.tsx`. Option A is a quick confirmation → navigate to Admin. Option B is a full DeployModal with Firestore `deployments` collection, agent status summary, and confirmation flow.

**Decision: Option A.**

**Rationale:**

| Factor | Option A (Quick) | Option B (Full Modal) |
|--------|-----------------|----------------------|
| Effort | ~1 hour | ~4-6 hours |
| Value now | Unblocks the CTA, clear user feedback | Premature — no real deployment infrastructure |
| Deployments collection | Not needed yet — we have no deploy backend to write to | Creates an empty collection with no writer |
| Agent status summary | Dashboard already shows this | Useful but redundant at this stage |
| Risk | Low — simple handler | Medium — new component, new collection, new queries |

The `deployments` collection (Option B) is dead code until we have an actual deployment backend. Building a modal that reads agent counts from Firestore is valuable UX, but it's Phase 2 work. Right now the app has 4 P0 blockers and multiple fake pages. Ship working features first, polish later.

**Spec for Option A:**
1. Click "Deploy Swarm" → `window.confirm('Deploy swarm? This will navigate to the Admin panel.')`
2. On confirm → navigate to Admin tab (`setActiveTab('admin')`)
3. On cancel → do nothing
4. Show a toast: "Swarm deployment initiated" (leverages TASK-3.1 toast system when ready)

---

### DECISION-SP1-2: GitHub Workspace — Option A (Remove from Nav, Keep File)

**Context:** TASK-1.4. The entire GitHubWorkspace page is hardcoded fake data. Per ADR-002, it's planned for Phase 2-3 with Firestore integration.

**Decision: Option A — remove from sidebar nav, keep the file.**

**Rationale:**

- Per ADR-002, the GitHub page has a clear Phase 2 implementation plan already approved
- Showing a fake page to users erodes trust in the product
- A "Coming Soon" page (Option B) is acceptable for external demos, but this is an internal tool — we don't need to advertise unready features
- Option A is zero effort — remove one nav item, done
- The file stays in the codebase with no risk; it gets wired in Phase 2 per ADR-002

**Spec:**
1. Remove the GitHub Workspace entry from sidebar navigation in `App.tsx`
2. Do NOT delete `GitHubWorkspace.tsx` — it's needed for Phase 2
3. No Firestore reads needed — nothing changes in the data layer

---

### DECISION-SP1-3: Dashboard Stats — Option B (Replace with Real Metrics)

**Context:** TASK-2.4. "Resource Load 82%" and "Token Usage 2.4M/5M" are hardcoded. Three options: remove, replace with real metrics we have, or wire to backend.

**Decision: Option B — replace with metrics we already have in Firestore.**

**Rationale:**

| Factor | Option A (Remove) | Option B (Real metrics) | Option C (Backend) |
|--------|------------------|------------------------|--------------------|
| Effort | Minimal | ~2 hours | Requires new endpoint |
| User value | Dashboard feels empty | Actionable, real data | Best but premature |
| Data available | N/A | agents collection + runs collection | Not built yet |
| Consistency | Loses dashboard density | Matches ADR-001 pattern | Needs Express API work |

We already have an `agents` collection (with status: online/offline/busy) and a `runs` collection (with pass/fail results). Option B gives us:

- **"Agents Online" card**: Query `agents` collection → count where `status == 'online'` / total agents → progress bar
- **"Test Pass Rate" card**: Query `runs` collection → count `status == 'passed'` / total → progress bar

Both are single Firestore queries consistent with ADR-001 (direct Firestore SDK) and ADR-003 (use `firestore-helpers.ts`).

Option C is the right long-term answer, but it requires building a `/metrics` endpoint and possibly a metrics collection. That's Phase 3+ work. Ship what we have now.

**Spec:**
1. Replace "Resource Load" card → "Agents Online" — query agents collection, show `{online}/{total}` with progress bar
2. Replace "Token Usage" card → "Test Pass Rate" — query runs collection, show `{passed}/{total}%` with progress bar
3. Use `firestore-helpers.ts` (ADR-003) for both queries
4. Show "—" or "No data" for empty states

---

### TASK-1.1 & TASK-1.2 Architectural Review

**Status: No blockers. Specs are clean. Proceed as written.**

**TASK-1.1 (Edit Button):**
- State management with `useState(false)` for edit mode is correct for this scope
- `updateDoc` with `serverTimestamp()` is the right pattern — consistent with Firestore conventions
- SAVE/CANCEL toggle is standard — no architectural concern
- **Note:** When edit mode is active, consider disabling the EXECUTE/COMPLETE buttons to avoid conflicting status writes. Add this as a dev note.

**TASK-1.2 (Execute Button):**
- Status transition logic (To Do → In Progress → Done, Review → Done) is sound
- Firestore write pattern is correct
- **One concern:** The spec says "show a brief confirmation toast/indicator" but TASK-3.1 (toast system) is Phase 3. **Recommendation:** Use a simple inline `<span className="text-green-500">✓ Updated</span>` that fades after 2 seconds for now. The toast system in Phase 3 will replace this. Don't block on Phase 3 work.
- **Status transition guard:** The spec correctly limits which buttons appear for each status. Ensure the Firestore write also validates status transitions server-side (Firestore security rules) to prevent race conditions. Flag this for future hardening — not a blocker for Phase 1.

**Summary:** Both tasks are well-scoped, dependency-free, and can start immediately. Dev 💻 should execute TASK-1.1 and TASK-1.2 in parallel.

---

## Updated ADR Summary

| ADR | Decision | Who Implements | When |
|-----|----------|---------------|------|
| ADR-001 | Direct Firestore SDK for all client components | Senior Dev | Phase 2 |
| ADR-002 | GitHub Workspace reads from Firestore; webhooks later | UI Dev (Phase 1) + Senior Dev (Phase 2) | Phase 2-3 |
| ADR-003 | Shared firestore-helpers.ts utility module | Senior Dev | Phase 2 (first) |
| DECISION-SP1-1 | Deploy Swarm → Option A (quick alert + nav) | Senior Dev 🔧 | Phase 1 |
| DECISION-SP1-2 | GitHub Workspace → Option A (remove nav, keep file) | UI Dev 🖥️ | Phase 1 |
| DECISION-SP1-3 | Dashboard Stats → Option B (real metrics from Firestore) | Dev 💻 | Phase 2 |
