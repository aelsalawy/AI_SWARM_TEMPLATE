# Sprint Context Skill — Auto-inject Focus & Priorities

Load this skill at session start to understand what to focus on.

## How to Load

At session start, fetch the current sprint context:

```bash
# Get structured JSON context
curl http://127.0.0.1:3001/api/skills/sprint-context/PROJECT_ID \
  -H 'X-Agent-Key: YOUR_KEY' \
  -H 'X-Agent-ID: YOUR_ID'

# Get formatted text context (for prompt injection)
curl http://127.0.0.1:3001/api/skills/sprint-context/PROJECT_ID/formatted \
  -H 'X-Agent-Key: YOUR_KEY' \
  -H 'X-Agent-ID: YOUR_ID'

# Get context filtered for your tasks
curl http://127.0.0.1:3001/api/skills/sprint-context/PROJECT_ID?agentId=YOUR_ID \
  -H 'X-Agent-Key: YOUR_KEY' \
  -H 'X-Agent-ID: YOUR_ID'
```

## What You Get

The sprint context includes:

1. **Sprint Info** — Current sprint name, goal, status, dates
2. **Focus Areas** — Top priority epics/categories for this sprint
3. **Priority Tasks** — Ordered task list (Urgent → Low) with status and assignee
4. **Active Assignments** — Who is working on what right now (avoid duplication!)
5. **Out of Scope** — What's NOT in this sprint (don't touch it)
6. **Dependencies** — Blocked items and their blockers
7. **Relevant ADRs** — Architecture decisions that apply

## How to Use

1. **Check before claiming tasks** — Look at the priority list, claim from the top
2. **Avoid duplication** — Check active assignments before starting work
3. **Respect out-of-scope** — Don't work on items marked as out of scope
4. **Be aware of dependencies** — Check if your tasks are blocked before starting
5. **Reference ADRs** — Follow established architecture decisions

## Guidelines

- If no active sprint exists, focus on the highest priority unassigned tasks
- If your assigned tasks are blocked, help with other high-priority items
- Don't start work that's out of scope without CTO approval
- Check this context periodically (every few hours) as it updates with new information
