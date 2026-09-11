# Architecture Decision Record (ADR) - Workflow Rule Engine

**Date:** 2026-05-14
**Decider:** Khaled (SW Architect)
**Status:** PROPOSED — awaiting review

## Context

The Autonomous Swarm requires workflow automation to handle:
- Task state transitions (To Do → In Progress → Done)
- Multi-step task dependencies
- Conditional branching based on task outcomes
- Automated escalations for blocked or failed tasks
- Quality gates and approval workflows

Current system has no workflow automation - manual state transitions only.

## Decision

**Use rule-based workflow engine with event-driven triggers.**

```
┌─────────────────────────────────────────────────────────────────┐
│                    Workflow Rule Engine                        │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                 Rule Registry                            │  │
│  │                                                          │  │
│  │  • Task state change rules                              │  │
│  │  • Escalation conditions                                │  │
│  │  • Quality gate criteria                                │  │
│  │  • Approval workflows                                   │  │
│  └─────────────────────────────────────────────────────────┘  │
│          │                                                     │
│          ▼                                                     │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                Rule Executor                             │  │
│  │                                                          │  │
│  │  1. Parse event context                                 │  │
│  │  2. Evaluate matching rules                             │  │
│  │  3. Execute rule actions                                │  │
│  │  4. Handle rule chaining                               │  │
│  └─────────────────────────────────────────────────────────┘  │
│          │                                                     │
│          ▼                                                     │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                Action System                             │  │
│  │                                                          │  │
│  │  • Task state updates                                   │  │
│  │  • Agent assignment                                     │  │
│  │  • Notifications & alerts                               │  │
│  │  • Subtask creation                                     │  │
│  └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Rationale

| Factor | Rule-Based Engine | State Machine | Custom Code |
|--------|-------------------|---------------|--------------|
| **Flexibility** | High (rules can change without code) | Medium (state changes require code) | None (hardcoded logic) |
| **Maintenance** | Easy (JSON/YAML rules) | Hard (code changes needed) | Very hard (complex logic) |
| **Transparency** | High (rules visible in config) | Medium (state diagram only) | Low (code inspection) |
| **Performance** | Good (rule caching) | Excellent (direct state transitions) | Variable (depends on implementation) |
| **Extensibility** | Excellent (add rules anytime) | Good (new states possible) | Poor (requires refactoring) |
| **Debugging** | Excellent (rule tracing) | Good (state history) | Difficult (code analysis) |

## Implementation Details

### Rule Schema

```typescript
interface WorkflowRule {
  id: string;                              // Unique rule identifier
  name: string;                            // Human-readable name
  description: string;                     // What the rule does
  enabled: boolean;                        // Rule active status
  priority: number;                        // Execution order (lower = higher priority)
  
  // Trigger conditions
  trigger: {
    eventType: string;                      // Event type to listen for
    conditions: RuleCondition[];           // All conditions must match
  };
  
  // Actions to execute
  actions: RuleAction[];
  
  // Rule chaining and flow control
  flow: {
    continueOnSuccess: boolean;            // Continue to next rule
    stopOnFailure: boolean;                // Stop execution if action fails
    maxRetries: number;                    // Retry attempts for actions
  };
}

interface RuleCondition {
  field: string;                           // Task field to check (e.g., 'status', 'priority')
  operator: 'equals' | 'not_equals' | 'contains' | 'gt' | 'lt' | 'in' | 'not_in';
  value: any;                             // Value to compare against
}

interface RuleAction {
  type: 'update_task' | 'assign_agent' | 'create_subtask' | 'notify' | 'escalate' | 'wait';
  params: Record<string, any>;             // Action-specific parameters
  delay?: number;                         // Milliseconds to delay before execution
}
```

### Rule Registry Storage

```typescript
// Rule documents stored in Firestore
const rulesCollection = 'workflow_rules';

// Example document structure
{
  id: 'task-completion-approval',
  name: 'Task Completion Requires Approval',
  description: 'High-priority tasks need manager approval before marking as Done',
  enabled: true,
  priority: 10,
  
  trigger: {
    eventType: 'task.updated',
    conditions: [
      {
        field: 'status',
        operator: 'equals',
        value: 'Done'
      },
      {
        field: 'priority',
        operator: 'in',
        value: ['High', 'Urgent']
      }
    ]
  },
  
  actions: [
    {
      type: 'notify',
      params: {
        message: 'Task requires approval before completion',
        recipients: ['manager@example.com'],
        channel: 'email'
      }
    }
  ],
  
  flow: {
    continueOnSuccess: false,
    stopOnFailure: true,
    maxRetries: 3
  }
}
```

### Rule Executor

```typescript
class WorkflowEngine {
  private rules: Map<string, WorkflowRule> = new Map();
  private cache: Map<string, WorkflowRule[]> = new Map();
  
  async loadRules(): Promise<void> {
    // Load rules from Firestore and cache by trigger event type
    const rulesSnapshot = await firestore.collection('workflow_rules').get();
    
    this.rules.clear();
    this.cache.clear();
    
    rulesSnapshot.docs.forEach(doc => {
      const rule = doc.data() as WorkflowRule;
      this.rules.set(rule.id, rule);
      
      // Cache rules by event type for efficient lookup
      if (!this.cache.has(rule.trigger.eventType)) {
        this.cache.set(rule.trigger.eventType, []);
      }
      this.cache.get(rule.trigger.eventType)!.push(rule);
    });
  }
  
  async processEvent(event: Event): Promise<void> {
    const eventType = event.type;
    const relevantRules = this.cache.get(eventType) || [];
    
    // Sort rules by priority (ascending order)
    const sortedRules = relevantRules.sort((a, b) => a.priority - b.priority);
    
    for (const rule of sortedRules) {
      if (!rule.enabled) continue;
      
      // Check if rule conditions are met
      if (await this.evaluateConditions(rule, event)) {
        await this.executeRule(rule, event);
        
        // Stop execution if rule says to stop on success
        if (!rule.flow.continueOnSuccess) {
          break;
        }
      }
    }
  }
  
  private async evaluateConditions(rule: WorkflowRule, event: Event): Promise<boolean> {
    for (const condition of rule.trigger.conditions) {
      const fieldValue = this.getFieldValue(event, condition.field);
      const matches = this.evaluateCondition(fieldValue, condition.operator, condition.value);
      
      if (!matches) {
        return false; // All conditions must match
      }
    }
    return true;
  }
  
  private async executeRule(rule: WorkflowRule, event: Event): Promise<void> {
    let retryCount = 0;
    let lastError: Error | null = null;
    
    while (retryCount < rule.flow.maxRetries) {
      try {
        // Execute each action in sequence
        for (const action of rule.actions) {
          if (action.delay) {
            await new Promise(resolve => setTimeout(resolve, action.delay));
          }
          
          await this.executeAction(action, event);
        }
        
        // Rule executed successfully
        return;
        
      } catch (error) {
        lastError = error as Error;
        retryCount++;
        
        if (retryCount >= rule.flow.maxRetries) {
          // Max retries exceeded - escalate or log
          await this.handleRuleFailure(rule, event, error);
          if (rule.flow.stopOnFailure) {
            throw lastError;
          }
        } else {
          // Exponential backoff before retry
          const delay = Math.pow(2, retryCount) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
  }
  
  private async executeAction(action: RuleAction, event: Event): Promise<void> {
    switch (action.type) {
      case 'update_task':
        await this.updateTask(action.params, event);
        break;
        
      case 'assign_agent':
        await this.assignAgent(action.params, event);
        break;
        
      case 'create_subtask':
        await this.createSubtask(action.params, event);
        break;
        
      case 'notify':
        await this.sendNotification(action.params, event);
        break;
        
      case 'escalate':
        await this.escalateTask(action.params, event);
        break;
        
      case 'wait':
        await this.waitCondition(action.params, event);
        break;
        
      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }
  
  // Action implementations
  private async updateTask(params: any, event: Event): Promise<void> {
    const { taskId, updates } = params;
    await firestore.collection('tasks').doc(taskId).update(updates);
  }
  
  private async assignAgent(params: any, event: Event): Promise<void> {
    const { taskId, agentId, reason } = params;
    await firestore.collection('tasks').doc(taskId).update({
      assignedAgentId: agentId,
      assignmentReason: reason,
      status: 'In Progress'
    });
  }
  
  private async createSubtask(params: any, event: Event): Promise<void> {
    const { parentId, title, description, dueDate } = params;
    const subtask: Task = {
      id: generateId(),
      title,
      description: description || `Subtask of ${event.payload.title}`,
      parentId,
      status: 'To Do',
      createdAt: Timestamp.now(),
      dueDate: dueDate || Timestamp.now()
    };
    await firestore.collection('tasks').add(subtask);
  }
  
  private async sendNotification(params: any, event: Event): Promise<void> {
    const { message, recipients, channel } = params;
    // Implement notification service integration
    await notificationService.send({
      channel,
      recipients,
      message: `${message}\n\nEvent: ${event.type}\nTask: ${event.payload.title}`
    });
  }
  
  private async escalateTask(params: any, event: Event): Promise<void> {
    const { taskId, reason, level } = params;
    await firestore.collection('tasks').doc(taskId).update({
      escalated: true,
      escalationLevel: level,
      escalationReason: reason,
      status: 'Escalated'
    });
    
    // Send escalation alert
    await this.sendNotification({
      message: `Task escalated: ${reason}`,
      recipients: ['admin@example.com'],
      channel: 'slack'
    }, event);
  }
  
  private async waitCondition(params: any, event: Event): Promise<void> {
    const { field, operator, value, timeout } = params;
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const currentValue = this.getFieldValue(event, field);
      if (this.evaluateCondition(currentValue, operator, value)) {
        return; // Condition met
      }
      await new Promise(resolve => setTimeout(resolve, 1000)); // Check every second
    }
    
    throw new Error(`Wait condition timed out after ${timeout}ms`);
  }
  
  private handleRuleFailure(rule: WorkflowRule, event: Event, error: Error): Promise<void> {
    console.error(`Rule ${rule.id} failed:`, error);
    
    // Log rule failure for debugging
    return firestore.collection('workflow_failures').add({
      ruleId: rule.id,
      event: event,
      error: error.message,
      timestamp: Timestamp.now()
    });
  }
}
```

### Event Integration

```typescript
// Connect workflow engine to event bus
const workflowEngine = new WorkflowEngine();

// Load rules on startup
await workflowEngine.loadRules();

// Listen to task events
onTaskCreated(async (event) => {
  await workflowEngine.processEvent(event);
});

onTaskUpdated(async (event) => {
  await workflowEngine.processEvent(event);
});

// Schedule rule refresh every 5 minutes
setInterval(() => {
  workflowEngine.loadRules();
}, 5 * 60 * 1000);
```

## Example Workflow Rules

### Rule 1: Task Completion Approval

```json
{
  "id": "completion-approval",
  "name": "High Priority Task Completion",
  "description": "Requires approval for high-priority task completions",
  "enabled": true,
  "priority": 10,
  
  "trigger": {
    "eventType": "task.updated",
    "conditions": [
      {
        "field": "status",
        "operator": "equals",
        "value": "Done"
      },
      {
        "field": "priority",
        "operator": "in",
        "value": ["High", "Urgent"]
      }
    ]
  },
  
  "actions": [
    {
      "type": "update_task",
      "params": {
        "taskId": "{{event.payload.id}}",
        "updates": {
          "status": "Pending Approval",
          "approvalRequired": true
        }
      }
    },
    {
      "type": "notify",
      "params": {
        "message": "Task requires approval before completion",
        "recipients": ["manager@example.com"],
        "channel": "email"
      }
    }
  ],
  
  "flow": {
    "continueOnSuccess": false,
    "stopOnFailure": true,
    "maxRetries": 3
  }
}
```

### Rule 2: Automated Task Escalation

```json
{
  "id": "task-escalation",
  "name": "Blocked Task Escalation",
  "description": "Escalate tasks that remain blocked for extended periods",
  "enabled": true,
  "priority": 20,
  
  "trigger": {
    "eventType": "task.updated",
    "conditions": [
      {
        "field": "status",
        "operator": "equals",
        "value": "Blocked"
      },
      {
        "field": "blockedSince",
        "operator": "gt",
        "value": 86400000 // 24 hours in milliseconds
      }
    ]
  },
  
  "actions": [
    {
      "type": "escalate",
      "params": {
        "taskId": "{{event.payload.id}}",
        "reason": "Task blocked for 24+ hours",
        "level": "high"
      }
    }
  ],
  
  "flow": {
    "continueOnSuccess": false,
    "stopOnFailure": false,
    "maxRetries": 1
  }
}
```

### Rule 3: Subtask Creation for Complex Tasks

```json
{
  "id": "subtask-creation",
  "name": "Complex Task Decomposition",
  "description": "Create subtasks for complex, multi-step tasks",
  "enabled": true,
  "priority": 15,
  
  "trigger": {
    "eventType": "task.created",
    "conditions": [
      {
        "field": "complexity",
        "operator": "equals",
        "value": "high"
      }
    ]
  },
  
  "actions": [
    {
      "type": "create_subtask",
      "params": {
        "parentId": "{{event.payload.id}}",
        "title": "Initial research and analysis",
        "description": "Research requirements and create initial design",
        "dueDate": "{{event.payload.dueDate}}"
      }
    },
    {
      "type": "create_subtask",
      "params": {
        "parentId": "{{event.payload.id}}",
        "title": "Implementation",
        "description": "Code implementation and unit testing",
        "dueDate": "{{event.payload.dueDate}}"
      }
    },
    {
      "type": "create_subtask",
      "params": {
        "parentId": "{{event.payload.id}}",
        "title": "Review and QA",
        "description": "Code review, testing, and quality assurance",
        "dueDate": "{{event.payload.dueDate}}"
      }
    }
  ],
  
  "flow": {
    "continueOnSuccess": true,
    "stopOnFailure": false,
    "maxRetries": 2
  }
}
```

## Monitoring and Observability

### Metrics to Track
- Rule execution count and success rate
- Average rule execution time
- Common rule failure patterns
- Event processing volume
- Rule cache hit ratio

### Monitoring Dashboard
- Real-time rule execution status
- Rule performance analytics
- Failure rate by rule type
- Event processing bottlenecks

### Error Handling
- Rule execution failure logging
- Automatic rule retry with backoff
- Fallback to manual intervention for critical failures
- Rule health status monitoring

## Alternative Approaches Considered

### 1. State Machine Workflow
```typescript
// Predefined state transitions
class TaskStateMachine {
  transition(task: Task, newState: string): void {
    const allowedTransitions = this.getStateTransitions(task.status);
    if (!allowedTransitions.includes(newState)) {
      throw new Error(`Invalid transition: ${task.status} → ${newState}`);
    }
    task.status = newState;
  }
}
```

**Rejected because:**
- Limited flexibility for complex workflows
- Hard to modify state transitions without code changes
- No support for conditional logic within transitions
- Poor scalability for business rule changes

### 2. BPMN Engine
```typescript
// Business Process Model and Notation
const workflow = new BPMNWorkflow('process-definition.bpmn');
await workflow.start({ taskId: '123' });
```

**Rejected because:**
- Overhead of BPMN standard and tooling
- Complex for simple use cases
- Steep learning curve for team members
- Limited integration with existing event system

### 3. Rule Engine with External Dependencies
```typescript
// Drools or similar external rule engine
const ksession = kieServices.newKieSession('ksession-rules');
ksession.insert(event);
ksession.fireAllRules();
```

**Rejected because:**
- Additional infrastructure complexity
- Deployment and operational overhead
- Performance concerns with external service calls
- Debugging challenges across systems

The rule-based approach provides the best balance of flexibility, maintainability, and operational simplicity for the current use case.