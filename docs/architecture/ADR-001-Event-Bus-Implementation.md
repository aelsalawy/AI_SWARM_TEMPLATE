# Architecture Decision Record (ADR) - Event Bus Implementation

**Date:** 2026-05-14
**Decider:** Khaled (SW Architect)
**Status:** PROPOSED — awaiting review

## Context

The Autonomous Swarm requires an event bus to decouple components and enable real-time communication between:
- Task state changes
- Agent availability updates  
- Work completion events
- Error conditions and escalations

Current ALM system has no event infrastructure - components poll Firestore directly.

## Decision

**Use Firestore triggers as the event bus.**

```
┌─────────────────────────────────────────────────────────────────┐
│                         Event Bus                              │
│                                                                 │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐       │
│   │   Tasks     │    │   Agents    │    │  Projects   │       │
│   │ Collection  │◄──►│ Collection  │◄──►│ Collection  │       │
│   └─────────────┘    └─────────────┘    └─────────────┘       │
│         │                   │                   │            │
│         ▼                   ▼                   ▼            │
│   ┌─────────────────────────────────────────────────────┐      │
│   │              Firestore Triggers                     │      │
│   │  • onDocumentCreate(task)                          │      │
│   │  • onDocumentUpdate(task)                          │      │
│   │  • onDocumentUpdate(agent)                         │      │
│   └─────────────────────────────────────────────────────┘      │
│                   │          │          │                     │
│          ┌────────┴──────────┼─────────┴──────────┐          │
│          │                   │                   │          │
│    ┌─────▼─────┐    ┌────────▼─────────┐   ┌──────▼──────┐   │
│    │Work       │    │Workflow         │   │Capability   │   │
│    │Dispatcher │    │Engine           │   │Registry     │   │
│    └───────────┘    └─────────────────┘   └────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Rationale

| Factor | Firestore Triggers | In-Process Events | Message Queue |
|--------|-------------------|------------------|---------------|
| **Infrastructure** | Zero new services | Zero new services | Redis/RabbitMQ required |
| **Consistency** | ACID transactions | Eventual consistency | Eventual consistency |
| **Cost** | Free (within limits) | Free | Additional service cost |
| **Complexity** | Low (Firestore native) | Medium (custom code) | High (queue mgmt) |
| **Latency** | Real-time (sub-second) | Millisecond | 10-100ms typically |
| **Scalability** | Firestore limits apply | Single-process bounded | Highly scalable |
| **Debugging** | Built-in logs + monitoring | Custom logging | Queue-specific tooling |

## Implementation Details

### Trigger Configuration

```typescript
// server/triggers/task-events.ts
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';

export const onTaskCreated = onDocumentCreated('tasks/{taskId}', (event) => {
  const task = event.data.data();
  logger.info(`Task created: ${event.params.taskId}`, { task });
  
  // Emit task.created event
  return dispatchEvent('task.created', { task, taskId: event.params.taskId });
});

export const onTaskUpdated = onDocumentUpdated('tasks/{taskId}', (event) => {
  const task = event.data.data();
  const previousData = event.data.data();
  
  logger.info(`Task updated: ${event.params.taskId}`, { 
    task, 
    changes: getChanges(previousData, task) 
  });
  
  // Emit task.updated event
  return dispatchEvent('task.updated', { 
    task, 
    previousData, 
    taskId: event.params.taskId 
  });
});
```

### Event Schema

```typescript
interface Event<T = any> {
  type: string;           // e.g., 'task.created', 'agent.online'
  payload: T;            // Event-specific data
  timestamp: Timestamp;  // Firestore timestamp
  source: string;       // Collection name (e.g., 'tasks', 'agents')
  id: string;           // Document ID
}
```

### Event Types

```typescript
// Task events
'task.created'       // New task created
'task.updated'       // Task fields changed  
'task.claimed'       // Agent claimed task
'task.completed'     // Task marked as Done
'task.failed'        // Task failed and needs retry

// Agent events  
'agent.online'       // Agent came online
'agent.offline'      // Agent went offline
'agent.busy'         // Agent working on task
'agent.idle'         // Agent available for work

// System events
'workflow.completed' // Workflow finished successfully
'workflow.failed'    // Workflow failed
'error.escalated'   // Error escalated to human
```

## Alternatives Considered

### 1. In-Process Event Emitter
```typescript
// Custom event bus in-memory
class EventBus {
  private events: Map<string, Function[]> = new Map();
  
  on(event: string, handler: Function) { /* ... */ }
  emit(event: string, data: any) { /* ... */ }
}
```

**Rejected because:** 
- Loses events when service restarts
- No persistence for debugging
- Limited to single process

### 2. Redis Pub/Sub
```typescript
// Redis-based event bus
redis.publish('task.created', JSON.stringify(event));
redis.subscribe('task.created', (message) => { /* ... */ });
```

**Rejected because:**
- Adds infrastructure dependency
- Additional operational complexity
- Cost for Redis service
- Eventual consistency concerns

## Usage Examples

### Work Dispatcher Listening to Task Events

```typescript
// server/dispatcher/listener.ts
import { onTaskCreated } from '../triggers/task-events';

// Listen for new tasks to dispatch
onTaskCreated((event) => {
  const task = event.data.data();
  
  // Only dispatch unassigned tasks
  if (!task.assignedAgentId && task.status === 'To Do') {
    dispatcher.dispatchWork(task);
  }
});
```

### Workflow Engine Listening for Task Completion

```typescript
// server/workflow/listener.ts
import { onTaskUpdated } from '../triggers/task-events';

// Listen for task completions to trigger workflows
onTaskUpdated((event) => {
  const task = event.data.data();
  
  if (task.status === 'Done' && event.data.previousData().status !== 'Done') {
    workflowEngine.triggerCompletionWorkflow(task);
  }
});
```

## Monitoring and Observability

### Event Tracking
- Use Firestore logging for trigger execution
- Track event processing success/failure
- Monitor event latency and volume

### Error Handling
- Retry failed events with exponential backoff
- Dead-letter queue for unrecoverable failures
- Alerting on excessive event processing failures

## Future Considerations

- If event volume exceeds Firestore limits, consider sharding
- For cross-service events, implement bridge functions
- Add event schema validation as complexity grows