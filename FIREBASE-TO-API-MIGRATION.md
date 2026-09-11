# ALM Firebase-to-API Migration Task

**Created:** 2026-06-27
**Status:** Open
**Priority:** High
**Assigned To:** Dev Agent

## Summary

The ALM system has been migrated from Firebase Auth to Local Auth (PostgreSQL + JWT), but several components still have Firebase dependencies and are showing as stubs or returning empty data.

## Components Requiring Migration

1. **Agents view** (AgentStatusPanel.tsx) - Firebase stub
2. **Tasks view** (TasksView.tsx) - Firebase stub
3. **Requirements view** (RequirementsView.tsx) - Firebase stub
4. **Projects view** (ProjectsView.tsx) - Firebase stub
5. **Bugs view** (BugsView.tsx) - Firebase stub
6. **Activity feed** (ActivityFeed.tsx) - Firebase stub
7. **Test Center** - Returns empty data due to auth middleware blocking API calls

## Known Issues

- `/api/test-runs` endpoint requires auth but TestCenter cannot call it successfully
- Auth middleware ordering issue: test-runs route mounted before middleware but still gets blocked
- Test runs do not have a Prisma model yet
- Server crashes periodically (needs pm2 or systemd for auto-restart)

## Tasks

1. **Create TestRun Prisma model**
   - Add model to schema: `id`, `name`, `status`, `group`, `duration`, `color`, `projectId`, `ownerId`, `createdAt`, `updatedAt`
   - Run `npx prisma generate` and `npx prisma db push`

2. **Implement test-runs API endpoints**
   - GET /api/test-runs - list with filters
   - POST /api/test-runs - create
   - PATCH /api/test-runs/:id - update
   - DELETE /api/test-runs/:id - delete
   - Use Prisma for database operations

3. **Fix auth middleware ordering**
   - Either mount test-runs before auth middleware properly
   - Or add /api/test-runs to public paths with correct path matching
   - Ensure API client sends auth tokens correctly

4. **Migrate stub components**
   - Replace Firebase SDK calls with api-client calls
   - Remove Firebase imports from components
   - Test each component end-to-end

5. **Remove Firebase SDK dependencies**
   - Remove firebase-admin from server
   - Remove firebase-client from frontend
   - Clean up unused imports

6. **Test end-to-end**
   - Test login flow
   - Test each component loads and displays data
   - Test CRUD operations work correctly

## Environment

- Backend: `./server/`
- Frontend: `./src/`
- Database: `postgresql://postgres:password@76.13.151.30:5434/alm_auth_db?schema=public`
- Production URL: https://alm.swarmbuzz.online/
- Agent API Key: e5b1beed-[REDACTED-T1][REVOKED-2026-09-08]

## Backend API Endpoints (Already Implemented)

- `/api/agents` - GET, POST, PATCH, DELETE
- `/api/tasks` - GET, POST, PATCH, DELETE
- `/api/requirements` - GET, POST, PATCH, DELETE
- `/api/projects` - GET, POST, PATCH, DELETE
- `/api/bugs` - GET, POST, PATCH, DELETE
- `/api/test-runs` - Currently returns empty/501 (needs implementation)

## References

- MIGRATION-STATUS.md - Detailed migration documentation
- server/index.ts - Auth middleware implementation
- server/routes/ - API route implementations
- src/lib/api-client.ts - Frontend API client
- src/components/ - Component files to migrate