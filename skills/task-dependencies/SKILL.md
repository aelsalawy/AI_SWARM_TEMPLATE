# Task Dependency Resolution Skill

Check prerequisites before starting work on tasks with dependencies.

## How It Works

Tasks can have dependencies — other tasks that must be completed first. The ALM enforces this by blocking transitions to "In Progress" when dependencies are unmet.

## API Usage

### Add a dependency:
```bash
curl -X POST http://127.0.0.1:3001/api/skills/dependencies/add \
  -H 'Content-Type: application/json' \
  -H 'X-Agent-Key: YOUR_KEY' \
  -H 'X-Agent-ID: YOUR_ID' \
  -d '{"taskId":"TASK_ID","dependsOnTaskId":"PREREQUISITE_TASK_ID","type":"blocks"}'
```

### Check if a task's dependencies are met:
```bash
GET /api/skills/dependencies/check/TASK_ID
```

Response:
```json
{
  "canStart": true,
  "unmetDependencies": [],
  "metDependencies": [{"taskId": "abc123", "taskTitle": "Setup database"}]
}
```

### View dependencies for a task:
```bash
GET /api/skills/dependencies/task/TASK_ID
```

### View what tasks a task is blocking:
```bash
GET /api/skills/dependencies/blocking/TASK_ID
```

### Remove a dependency:
```bash
curl -X POST http://127.0.0.1:3001/api/skills/dependencies/remove \
  -H 'Content-Type: application/json' \
  -d '{"taskId":"TASK_ID","dependsOnTaskId":"DEP_TASK_ID"}'
```

## Dependency Types

- `blocks` — Task cannot start until dependency is Done (most common)
- `related` — Tasks are related but either can start independently
- `requires` — Task requires output/artifact from dependency

## Guidelines

1. **Before claiming a task**, check its dependencies with `/check/TASK_ID`
2. **If dependencies are unmet**, don't start — pick another task
3. **When creating tasks**, specify dependencies if the work depends on other tasks
4. **Circular dependencies are prevented** — the system will reject them
5. **When you complete a task**, check `/blocking/YOUR_TASK_ID` to see if you're unblocking others
