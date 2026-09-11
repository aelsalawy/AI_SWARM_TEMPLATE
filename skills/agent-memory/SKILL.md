# Per-Agent Persistent Memory Skill

Store and retrieve learnings, preferences, and project knowledge that persists across sessions.

## Why Use This

You wake up fresh each session. This memory system lets you:
- Remember patterns you've learned about this project
- Store preferences (e.g., "this project uses ESM, not CommonJS")
- Record error patterns to avoid repeating
- Build project-specific knowledge over time

## API Usage

### Store a memory:
```bash
curl -X POST http://127.0.0.1:3001/api/skills/memory/store \
  -H 'Content-Type: application/json' \
  -H 'X-Agent-Key: YOUR_KEY' \
  -H 'X-Agent-ID: YOUR_ID' \
  -d '{
    "agentId": "YOUR_AGENT_ID",
    "category": "learning",
    "key": "project-uses-esm",
    "value": "This project uses ESM modules. Use import/export, not require.",
    "tags": ["typescript", "modules"],
    "projectId": "PROJECT_ID"
  }'
```

### Get all your memories:
```bash
GET /api/skills/memory/YOUR_AGENT_ID
GET /api/skills/memory/YOUR_AGENT_ID?category=learning
GET /api/skills/memory/YOUR_AGENT_ID?projectId=PROJECT_ID&limit=20
```

### Get a specific memory:
```bash
# First fetch all, then find by key/category
GET /api/skills/memory/YOUR_AGENT_ID?category=learning
```

### Get your memory summary:
```bash
GET /api/skills/memory/YOUR_AGENT_ID/summary
```

### Get formatted context for injection:
```bash
GET /api/skills/memory/YOUR_AGENT_ID/formatted
```

### Delete a memory:
```bash
DELETE /api/skills/memory/MEMORY_ID
```

## Memory Categories

| Category | Purpose | Examples |
|----------|---------|----------|
| `learning` | Things you discovered | "Database uses composite keys", "Tests must be run sequentially" |
| `preference` | Your preferences | "I prefer TDD approach", "Use descriptive variable names" |
| `context` | Session context | "Sprint 3 is about auth", "Current tech lead is Alonso" |
| `error_pattern` | Mistakes to avoid | "Don't forget to handle null in API responses", "Always check Firestore index" |
| `project_knowledge` | Project-specific info | "Auth middleware is in src/middleware/auth.ts", "Deploy uses GitHub Actions" |

## Best Practices

1. **Store at session end** — Before your session ends, save key learnings
2. **Load at session start** — Fetch your memories to bootstrap context
3. **Tag well** — Use descriptive tags for easy retrieval
4. **Update, don't duplicate** — Same key/category overwrites the previous value
5. **Keep it concise** — Values should be brief and actionable
6. **Share project knowledge** — Project-scoped memories help other agents too
