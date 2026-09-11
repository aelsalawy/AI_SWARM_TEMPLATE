# Handoff Protocol Skill — Structured Context Transfer

When a task transitions between agents, use this protocol to ensure nothing is lost.

## When to Use

- When you're releasing a task (POST `/api/tasks/:id/release`)
- When a task is being reassigned to a different agent
- Before acknowledging a newly assigned task that was previously worked on

## Creating a Handoff

When handing off work, use the ALM API:

```bash
curl -X POST http://127.0.0.1:3001/api/skills/handoff/create \
  -H 'Content-Type: application/json' \
  -H 'X-Agent-Key: YOUR_KEY' \
  -H 'X-Agent-ID: YOUR_ID' \
  -d '{
    "taskId": "TASK_ID",
    "fromAgentId": "YOUR_AGENT_ID",
    "toAgentId": "RECEIVING_AGENT_ID",
    "context": {
      "filesChanged": ["path/to/file.ts"],
      "howToTest": "Steps to verify...",
      "edgeCases": ["Edge case 1"],
      "notTested": "What was NOT tested",
      "implementationNotes": "Key decisions made"
    }
  }'
```

## Handoff Templates by Transition Type

### Dev → QA (`dev-to-qa`)
```json
{
  "filesChanged": ["list of modified files"],
  "howToTest": "step-by-step testing instructions",
  "edgeCases": ["known edge cases"],
  "notTested": "what was NOT covered in testing",
  "implementationNotes": "key decisions or gotchas",
  "relatedBugs": ["any related bug IDs"],
  "environmentRequirements": "any special setup needed"
}
```

### QA → CTO (`qa-to-cto`)
```json
{
  "passFailMatrix": {"criteria1": "pass", "criteria2": "fail"},
  "testedItems": ["what was tested"],
  "skippedItems": ["what was skipped and why"],
  "environmentDetails": "test environment info",
  "performanceNotes": "any performance observations",
  "riskAssessment": "Low/Medium/High",
  "recommendation": "Proceed/Needs fixes/Blocked"
}
```

### CTO → Dev (`cto-to-dev`)
```json
{
  "spec": "full specification",
  "acceptanceCriteria": ["list of criteria"],
  "constraints": ["technical constraints"],
  "linkedADRs": ["ADR references"],
  "priority": "High",
  "deadline": "target completion",
  "relatedTasks": ["related task IDs"],
  "outOfScope": ["what NOT to do"]
}
```

### Architect → Dev (`architect-to-dev`)
```json
{
  "approvedDesign": "design document or reference",
  "techDecisions": ["key technical decisions"],
  "constraints": ["implementation constraints"],
  "apiChanges": ["API changes required"],
  "databaseChanges": ["DB changes required"],
  "dependencies": ["external dependencies"],
  "risks": ["identified risks"]
}
```

### Dev → Dev (`dev-to-dev`)
```json
{
  "currentProgress": "what's been done so far",
  "nextSteps": ["remaining work"],
  "filesInProgress": ["files being worked on"],
  "blockers": ["any blockers"],
  "notes": "additional context",
  "completedItems": ["what's finished"]
}
```

## Acknowledging a Handoff

When receiving a task that was handed off:

```bash
curl -X POST http://127.0.0.1:3001/api/skills/handoff/HANDOFF_ID/acknowledge \
  -H 'X-Agent-Key: YOUR_KEY' \
  -H 'X-Agent-ID: YOUR_ID'
```

**Important:** ACK the handoff BEFORE starting work. This confirms you've read and understood the context.

## Checking Handoff History

```bash
GET /api/skills/handoff/task/TASK_ID
```
