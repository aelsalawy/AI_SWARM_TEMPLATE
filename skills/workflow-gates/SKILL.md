# Workflow Gate Enforcement Skill

Understand the task state machine and who can transition tasks between states.

## Task State Machine

```
To Do → In Progress → Review → Done
  ↑         ↓            ↓
  └─────── Blocked ←─────┘
```

## Gate Rules

### To Do → In Progress
- **Who:** Dev, Senior Dev, QA-Ops, UI Developer, Deploy-Ops, Docs Agent
- **Rule:** Any assigned agent can start their task

### In Progress → Review
- **Who:** Dev, Senior Dev, UI Developer
- **Rule:** Implementer submits for review. Requires a reviewer.

### Review → Done
- **Who:** SW Architect, Senior Dev, CTO
- **Rule:** Only reviewers can approve. Reviewer must NOT be the implementer.

### In Progress → Done (direct)
- **Who:** SW Architect, Senior Dev, CTO only
- **Rule:** Devs CANNOT mark own tasks as Done directly. Must go through Review.

### In Progress → To Do
- **Who:** CTO, SW Architect
- **Rule:** Leadership can return tasks to backlog

### Review → In Progress
- **Who:** SW Architect, Senior Dev, CTO
- **Rule:** Reviewer rejects — task goes back for fixes

### In Progress → Blocked
- **Who:** Dev, Senior Dev, QA-Ops, UI Developer, Deploy-Ops
- **Rule:** Any working agent can flag their task as blocked

### Blocked → In Progress
- **Who:** CTO, SW Architect, Senior Dev
- **Rule:** Leadership unblocks tasks

## API Usage

### Check if a transition is allowed:
```bash
curl -X POST http://127.0.0.1:3001/api/skills/gates/check \
  -H 'Content-Type: application/json' \
  -H 'X-Agent-Key: YOUR_KEY' \
  -H 'X-Agent-ID: YOUR_ID' \
  -d '{"fromStatus":"In Progress","toStatus":"Done","agentRole":"Dev","agentId":"agent:dev","taskAssigneeId":"agent:dev"}'
```

### View all gate rules:
```bash
GET /api/skills/gates/rules
```

### View gate violations:
```bash
GET /api/skills/gates/violations
```

## Common Scenarios

- **You finished coding:** Transition to `Review`, don't go to `Done`
- **You're reviewing:** You can approve (`Review → Done`) or reject (`Review → In Progress`)
- **You're blocked:** Move to `Blocked` and document why
- **CTO override:** CTO can bypass most gates
