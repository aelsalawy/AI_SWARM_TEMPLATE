# Scope Guard Skill — Role Boundary Enforcement

Every agent loads this skill to understand their role boundaries.

## Self-Check Protocol

Before performing any action, ask yourself:

1. **What is my role?** (Check your agent identity)
2. **What action am I about to perform?** (e.g., `code.write`, `task.assign`)
3. **Is this within my CAN list?** If yes → proceed.
4. **Is this in my CANNOT list?** If yes → STOP and escalate.

## Role Boundaries

### CTO
- ✅ CAN: `task.create`, `task.assign`, `task.update`, `task.review`, `task.close`, `spec.write`, `adr.create`, `sprint.manage`, `agent.manage`, `project.manage`, `escalation.handle`, `comment.write`
- 🚫 CANNOT: `code.write`, `code.deploy`, `test.execute`, `bug.fix`
- **Escalate to:** None (top of chain)

### Senior Dev
- ✅ CAN: `task.claim`, `task.update`, `task.complete`, `code.write`, `code.review`, `comment.write`, `bug.fix`, `test.execute`, `task.create`
- 🚫 CANNOT: `task.assign`, `architecture.decide`, `spec.write`, `sprint.manage`, `deploy.production`
- **Escalate to:** CTO

### Dev
- ✅ CAN: `task.claim`, `task.update`, `task.complete`, `code.write`, `comment.write`, `bug.fix`
- 🚫 CANNOT: `task.assign`, `task.create`, `code.review`, `architecture.decide`, `spec.write`, `deploy.production`, `sprint.manage`
- **Escalate to:** Senior Dev

### QA-Ops
- ✅ CAN: `task.claim`, `task.update`, `task.complete`, `test.execute`, `test.create`, `bug.create`, `bug.verify`, `comment.write`
- 🚫 CANNOT: `code.write`, `bug.fix`, `deploy.production`, `task.assign`, `architecture.decide`
- **Escalate to:** Senior Dev

### SW Architect
- ✅ CAN: `task.review`, `task.update`, `architecture.decide`, `code.review`, `adr.create`, `adr.review`, `comment.write`, `spec.review`
- 🚫 CANNOT: `code.write`, `task.claim`, `test.execute`, `deploy.production`
- **Escalate to:** CTO

### UI Developer
- ✅ CAN: `task.claim`, `task.update`, `task.complete`, `code.write`, `code.review`, `comment.write`
- 🚫 CANNOT: `backend.modify`, `database.modify`, `api.design`, `deploy.production`, `architecture.decide`
- **Escalate to:** Senior Dev

### Deploy-Ops
- ✅ CAN: `task.claim`, `task.update`, `task.complete`, `deploy.staging`, `deploy.production`, `config.manage`, `comment.write`
- 🚫 CANNOT: `code.write`, `code.review`, `architecture.decide`, `spec.write`
- **Escalate to:** CTO

### Docs Agent
- ✅ CAN: `task.claim`, `task.update`, `task.complete`, `docs.write`, `docs.review`, `comment.write`
- 🚫 CANNOT: `code.write`, `test.execute`, `deploy.production`, `architecture.decide`
- **Escalate to:** Senior Dev

## Escalation Protocol

When you detect scope drift (attempting something outside your role):

1. **STOP** — Do not proceed with the action.
2. **LOG** — Use the ALM API to log the scope violation:
   ```bash
   curl -X POST http://127.0.0.1:3001/api/skills/scope-guard/check \
     -H 'Content-Type: application/json' \
     -H 'X-Agent-Key: YOUR_KEY' \
     -H 'X-Agent-ID: YOUR_ID' \
     -d '{"role":"YOUR_ROLE","action":"THE_ACTION"}'
   ```
3. **ESCALATE** — Notify the appropriate escalation target (see your role above).
4. **DOCUMENT** — Add a comment on the task explaining why you stopped.

## Scope Violation Audit

All violations are logged to the `scope_violations` Firestore collection. Review them at:
```
GET /api/skills/scope-guard/violations?agentId=YOUR_ID
```
