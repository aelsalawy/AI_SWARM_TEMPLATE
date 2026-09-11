# Architecture Decision Record (ADR) - Error Recovery & Escalation

**Date:** 2026-05-14
**Decider:** Khaled (SW Architect)
**Status:** PROPOSED — awaiting review

## Context

The Autonomous Swarm requires robust error handling to manage:
- API rate limiting and service interruptions
- Task execution failures and timeouts
- Agent unavailability and crashes
- System-level errors and data corruption
- Recovery from partial failures
- Human escalation for critical issues
- Service continuity during disruptions

Current system has basic error handling with no recovery or escalation mechanisms.

## Decision

**Implement hierarchical error recovery with automated retry chains and human escalation.**

```
┌─────────────────────────────────────────────────────────────────┐
│                Error Recovery & Escalation                     │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                Error Detection                          │  │
│  │                                                          │  │
│  │  • API Failure Detection                                │  │
│  │  • Timeout Monitoring                                   │  │
│  │  • Health Check Failures                                │  │
│  │  • Anomaly Detection                                     │  │
│  └─────────────────────────────────────────────────────────┘  │
│          │                                                     │
│          ▼                                                     │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                Error Categorization                    │  │
│  │                                                          │  │
│  │  • Transient Errors (retry eligible)                   │  │
│  │  • Permanent Errors (task failure)                      │  │
│  │  • System Errors (escalate required)                   │  │
│  │  • Configuration Errors (manual fix needed)             │  │
│  └─────────────────────────────────────────────────────────┘  │
│          │                                                     │
│          ▼                                                     │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                Recovery Engine                         │  │
│  │                                                          │  │
│  │  • Retry Policies                                       │  │
│  │  • Fallback Chains                                      │  │
│  │  • Task Reassignment                                    │  │
│  │  • Circuit Breakers                                     │  │
│  └─────────────────────────────────────────────────────────┘  │
│          │                                                     │
│          ▼                                                     │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                Escalation System                        │  │
│  │                                                          │  │
│  │  • Tier 1: Automated Recovery                           │  │
│  │  • Tier 2: Agent Swapping                               │  │
│  │  • Tier 3: Manager Notification                         │  │
│  │  • Tier 4: Human Intervention                           │  │
│  └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Rationale

| Factor | Hierarchical Recovery | Simple Retry | Manual Intervention |
|--------|----------------------|--------------|---------------------|
| **Automation Level** | High (automated recovery) | Medium (basic retry) | Low (manual handling) |
| **Recovery Speed** | Fast (automated escalation) | Slow (retry delays) | Very slow (human response) |
| **Reliability** | High (multiple recovery paths) | Medium (single retry) | Variable (human dependent) |
| **Scalability** | Excellent (automated scaling) | Good (linear retry) | Poor (manual scaling) |
| **Traceability** | Excellent (full error tracking) | Medium (retry logs) | Good (manual logs) |
| **Business Impact** | Minimal (transparent recovery) | Medium (delays) | High (manual intervention) |

## Implementation Details

### Error Classification System

```typescript
// Error classification and handling
enum ErrorSeverity {
  LOW = 'low',           // Non-critical, can be retried
  MEDIUM = 'medium',     // Affects task completion
  HIGH = 'high',         // Affects multiple tasks
  CRITICAL = 'critical' // System-wide failure
}

enum ErrorType {
  // API and Network Errors
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  NETWORK_ERROR = 'network_error',
  TIMEOUT = 'timeout',
  SERVICE_UNAVAILABLE = 'service_unavailable',
  
  // Task Execution Errors
  TASK_FAILURE = 'task_failure',
  EXECUTION_TIMEOUT = 'execution_timeout',
  MEMORY_LIMIT_EXCEEDED = 'memory_limit_exceeded',
  OUTPUT_TRUNCATION = 'output_truncation',
  
  // Agent Errors
  AGENT_UNAVAILABLE = 'agent_unavailable',
  AGENT_CRASH = 'agent_crash',
  AGENT_TIMEOUT = 'agent_timeout',
  
  // System Errors
  DATABASE_ERROR = 'database_error',
  VALIDATION_ERROR = 'validation_error',
  CONFIGURATION_ERROR = 'configuration_error',
  PERMISSION_ERROR = 'permission_error',
  
  // Business Logic Errors
  SKILL_MISMATCH = 'skill_mismatch',
  WORKLOAD_EXCEEDED = 'workload_exceeded',
  QUALITY_GATE_FAILED = 'quality_gate_failed'
}

interface ErrorContext {
  error: Error;
  taskId?: string;
  agentId?: string;
  timestamp: Timestamp;
  severity: ErrorSeverity;
  type: ErrorType;
  retryCount: number;
  lastRetryTime?: Timestamp;
  originalError?: Error;
  escalationPath: ErrorEscalationPath;
}

interface ErrorEscalationPath {
  tier: number;
  autoRecovered: boolean;
  fallbackAttempted: boolean;
  humanInterventionRequired: boolean;
  escalationTimestamps: Timestamp[];
}
```

### Retry Policy Engine

```typescript
class RetryPolicy {
  policies: Map<ErrorType, RetryPolicyConfig> = new Map();
  
  constructor() {
    this.initializePolicies();
  }
  
  private initializePolicies(): void {
    // Rate limiting errors
    this.policies.set(ErrorType.RATE_LIMIT_EXCEEDED, {
      maxRetries: 5,
      baseDelayMs: 1000,
      maxDelayMs: 30000,
      backoffMultiplier: 2,
      jitter: true,
      shouldRetry: (error) => error.retryCount < 5
    });
    
    // Network errors
    this.policies.set(ErrorType.NETWORK_ERROR, {
      maxRetries: 3,
      baseDelayMs: 2000,
      maxDelayMs: 10000,
      backoffMultiplier: 1.5,
      jitter: true,
      shouldRetry: (error) => error.retryCount < 3
    });
    
    // Timeout errors
    this.policies.set(ErrorType.TIMEOUT, {
      maxRetries: 2,
      baseDelayMs: 5000,
      maxDelayMs: 20000,
      backoffMultiplier: 2,
      jitter: true,
      shouldRetry: (error) => error.retryCount < 2
    });
    
    // Task failures
    this.policies.set(ErrorType.TASK_FAILURE, {
      maxRetries: 1,
      baseDelayMs: 1000,
      maxDelayMs: 5000,
      backoffMultiplier: 1,
      jitter: false,
      shouldRetry: (error) => error.retryCount < 1
    });
  }
  
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    errorType: ErrorType,
    context: Partial<ErrorContext>
  ): Promise<T> {
    let retryCount = 0;
    let lastError: Error;
    
    while (retryCount <= this.policies.get(errorType)!.maxRetries) {
      try {
        const result = await operation();
        return result;
      } catch (error) {
        lastError = error as Error;
        retryCount++;
        
        if (retryCount > this.policies.get(errorType)!.maxRetries) {
          break;
        }
        
        const delay = this.calculateDelay(errorType, retryCount);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    // Max retries exceeded
    throw new Error(`Operation failed after ${retryCount} retries: ${lastError?.message}`);
  }
  
  private calculateDelay(errorType: ErrorType, retryCount: number): number {
    const policy = this.policies.get(errorType)!;
    let delay = policy.baseDelayMs * Math.pow(policy.backoffMultiplier, retryCount - 1);
    
    // Cap at maximum delay
    delay = Math.min(delay, policy.maxDelayMs);
    
    // Add jitter if configured
    if (policy.jitter) {
      delay = delay * (0.8 + Math.random() * 0.4); // 80-120% of calculated delay
    }
    
    return delay;
  }
}
```

### Error Recovery Engine

```typescript
class ErrorRecoveryEngine {
  private retryPolicy: RetryPolicy;
  private fallbackChains: Map<ErrorType, FallbackChain[]>;
  private circuitBreakers: Map<string, CircuitBreaker>;
  
  constructor() {
    this.retryPolicy = new RetryPolicy();
    this.initializeFallbackChains();
    this.initializeCircuitBreakers();
  }
  
  async handleTaskError(errorContext: ErrorContext): Promise<RecoveryResult> {
    const { error, taskId, agentId, type, severity } = errorContext;
    
    // Log the error
    await this.logError(errorContext);
    
    // Determine recovery strategy based on error type and severity
    let recoveryResult: RecoveryResult;
    
    switch (severity) {
      case ErrorSeverity.LOW:
        recoveryResult = await this.handleLowSeverityError(errorContext);
        break;
        
      case ErrorSeverity.MEDIUM:
        recoveryResult = await this.handleMediumSeverityError(errorContext);
        break;
        
      case ErrorSeverity.HIGH:
        recoveryResult = await this.handleHighSeverityError(errorContext);
        break;
        
      case ErrorSeverity.CRITICAL:
        recoveryResult = await this.handleCriticalError(errorContext);
        break;
        
      default:
        recoveryResult = { success: false, escalated: true, message: 'Unknown error severity' };
    }
    
    // Update error context with recovery result
    errorContext.escalationPath.escalationTimestamps.push(Timestamp.now());
    
    return recoveryResult;
  }
  
  private async handleLowSeverityError(errorContext: ErrorContext): Promise<RecoveryResult> {
    // Attempt automated recovery
    const fallbackChain = this.findFallbackChain(errorContext.type);
    if (fallbackChain) {
      const result = await this.executeFallbackChain(fallbackChain, errorContext);
      if (result.success) {
        return result;
      }
    }
    
    // Retry with exponential backoff
    try {
      const operation = this.createRetryOperation(errorContext);
      const result = await this.retryPolicy.executeWithRetry(
        operation,
        errorContext.type,
        errorContext
      );
      
      return { success: true, message: 'Successfully recovered after retry' };
    } catch (retryError) {
      return { 
        success: false, 
        escalated: false, 
        message: 'Retry failed after max attempts'
      };
    }
  }
  
  private async handleMediumSeverityError(errorContext: ErrorContext): Promise<RecoveryResult> {
    // For medium severity, try agent reassignment first
    if (errorContext.agentId && errorContext.taskId) {
      const reassignmentResult = await this.reassignTask(errorContext.taskId, errorContext.agentId);
      if (reassignmentResult.success) {
        return {
          success: true,
          message: 'Task reassigned to different agent',
          agentId: reassignmentResult.newAgentId
        };
      }
    }
    
    // Then try fallback chains
    const fallbackChain = this.findFallbackChain(errorContext.type);
    if (fallbackChain) {
      const result = await this.executeFallbackChain(fallbackChain, errorContext);
      if (result.success) {
        return result;
      }
    }
    
    // If all else fails, escalate
    return await this.escalateError(errorContext);
  }
  
  private async handleHighSeverityError(errorContext: ErrorContext): Promise<RecoveryResult> {
    // High severity errors require immediate escalation
    const escalationResult = await this.escalateError(errorContext);
    
    // Also attempt system-level recovery
    await this.attemptSystemRecovery(errorContext);
    
    return escalationResult;
  }
  
  private async handleCriticalError(errorContext: ErrorContext): Promise<RecoveryResult> {
    // Critical errors require immediate human intervention
    await this.sendCriticalAlert(errorContext);
    
    // Attempt emergency system recovery
    await this.emergencySystemRecovery(errorContext);
    
    return {
      success: false,
      escalated: true,
      message: 'Critical error - human intervention required',
      immediateAction: true
    };
  }
  
  private async reassignTask(taskId: string, failedAgentId: string): Promise<{ success: boolean; newAgentId?: string }> {
    // Get available agents (excluding the failed one)
    const availableAgents = await this.getAvailableAgents(failedAgentId);
    
    if (availableAgents.length === 0) {
      return { success: false };
    }
    
    // Select best alternative agent
    const newAgent = this.selectBestAlternativeAgent(availableAgents, failedAgentId);
    
    // Reassign task
    await this.updateTaskAssignment(taskId, newAgent.id);
    
    // Update capability registry
    await this.updateAgentWorkload(failedAgentId, -1);
    await this.updateAgentWorkload(newAgent.id, 1);
    
    return { success: true, newAgentId: newAgent.id };
  }
  
  private async executeFallbackChain(fallbackChain: FallbackChain, errorContext: ErrorContext): Promise<RecoveryResult> {
    for (const fallback of fallbackChain.steps) {
      try {
        const result = await fallback.execute(errorContext);
        if (result.success) {
          return { 
            success: true, 
            message: `Recovered using fallback: ${fallback.name}`,
            data: result.data 
          };
        }
      } catch (fallbackError) {
        console.warn(`Fallback step ${fallback.name} failed:`, fallbackError);
        continue;
      }
    }
    
    return { success: false, message: 'All fallback steps failed' };
  }
  
  private async escalateError(errorContext: ErrorContext): Promise<RecoveryResult> {
    // Update error context
    errorContext.escalationPath.humanInterventionRequired = true;
    errorContext.escalationPath.tier = Math.min(errorContext.escalationPath.tier + 1, 4);
    
    // Send escalation notification
    await this.sendEscalationNotification(errorContext);
    
    // Update task status
    if (errorContext.taskId) {
      await this.updateTaskStatus(errorContext.taskId, 'Escalated');
    }
    
    return {
      success: false,
      escalated: true,
      message: 'Error escalated to human operators',
      escalationTier: errorContext.escalationPath.tier
    };
  }
  
  // Helper methods
  private async logError(errorContext: ErrorContext): Promise<void> {
    await firestore.collection('error_logs').add({
      ...errorContext,
      resolved: false,
      recoveryAttempted: false
    });
  }
  
  private findFallbackChain(errorType: ErrorType): FallbackChain | null {
    return this.fallbackChains.get(errorType)?.[0] || null;
  }
  
  private getAvailableAgents(excludeAgentId: string): Promise<Agent[]> {
    // Implementation to get available agents excluding the specified one
    return firestore.collection('agents')
      .where('status', '==', 'online')
      .where('id', '!=', excludeAgentId)
      .where('workload.activeTasks', '<', firestore.FieldValue.arrayUnion())
      .get()
      .then(snapshot => snapshot.docs.map(doc => doc.data() as Agent));
  }
  
  private selectBestAlternativeAgent(availableAgents: Agent[], failedAgentId: string): Agent {
    // Select agent with similar skills but lower workload
    return availableAgents.reduce((best, current) => {
      const bestScore = this.calculateAgentScore(best, failedAgentId);
      const currentScore = this.calculateAgentScore(current, failedAgentId);
      return currentScore > bestScore ? current : best;
    });
  }
  
  private calculateAgentScore(agent: Agent, failedAgentId: string): number {
    // Calculate score based on skill match and workload
    const failedAgent = this.getAgentById(failedAgentId);
    if (!failedAgent) return 0;
    
    const skillMatch = this.calculateSkillOverlap(agent.skills, failedAgent.skills);
    const workloadScore = 1 - (agent.workload.activeTasks / agent.maxConcurrentTasks);
    
    return skillMatch * 0.6 + workloadScore * 0.4;
  }
  
  private calculateSkillOverlap(agent1Skills: Skill[], agent2Skills: Skill[]): number {
    if (agent2Skills.length === 0) return 1;
    
    const overlap = agent1Skills.filter(skill1 => 
      agent2Skills.some(skill2 => skill1.id === skill2.id)
    ).length;
    
    return overlap / agent2Skills.length;
  }
  
  private async sendCriticalAlert(errorContext: ErrorContext): Promise<void> {
    // Send immediate alert to all operators
    await this.notificationService.send({
      channel: 'slack',
      recipients: ['admin@example.com', 'operations@example.com'],
      message: `🚨 CRITICAL ERROR: ${errorContext.type} in task ${errorContext.taskId}`,
      priority: 'critical'
    });
  }
  
  private async sendEscalationNotification(errorContext: ErrorContext): Promise<void> {
    const escalationLevel = errorContext.escalationPath.tier;
    const message = this.generateEscalationMessage(errorContext, escalationLevel);
    
    await this.notificationService.send({
      channel: 'slack',
      recipients: this.getEscalationRecipients(escalationLevel),
      message,
      priority: 'high'
    });
  }
  
  private generateEscalationMessage(errorContext: ErrorContext, tier: number): string {
    const agentInfo = errorContext.agentId ? `Agent: ${errorContext.agentId}` : 'Unknown agent';
    const taskInfo = errorContext.taskId ? `Task: ${errorContext.taskId}` : 'Unknown task';
    
    return `📢 Escalation Tier ${tier}: ${errorContext.type}
${agentInfo}
${taskInfo}
Error: ${errorContext.error.message}`;
  }
  
  private getEscalationRecipients(tier: number): string[] {
    const tierRecipients = {
      1: ['dev-team@example.com'],
      2: ['tech-lead@example.com'],
      3: ['manager@example.com'],
      4: ['operations@example.com', 'admin@example.com']
    };
    
    return tierRecipients[tier as keyof typeof tierRecipients] || [];
  }
  
  // Circuit breaker management
  private initializeCircuitBreakers(): void {
    this.circuitBreakers.set('openrouter-api', new CircuitBreaker({
      threshold: 5,
      timeoutMs: 30000,
      halfOpenTimeoutMs: 60000
    }));
    
    this.circuitBreakers.set('firestore-db', new CircuitBreaker({
      threshold: 3,
      timeoutMs: 15000,
      halfOpenTimeoutMs: 30000
    }));
  }
  
  private async attemptSystemRecovery(errorContext: ErrorContext): Promise<void> {
    // Implement system-wide recovery measures
    console.log('Attempting system recovery for:', errorContext.type);
    
    // Reset circuit breakers
    this.circuitBreakers.forEach(breaker => breaker.reset());
    
    // Clear caches and reload configurations
    await this.reloadConfigurations();
    
    // Restart necessary services
    await this.restartServices(errorContext);
  }
  
  private async emergencySystemRecovery(errorContext: ErrorContext): Promise<void> {
    // Emergency measures for critical failures
    console.log('Emergency system recovery initiated');
    
    // Fallback to basic mode
    await this.switchToBasicMode();
    
    // Notify all users of system degradation
    await this.notifySystemDegradation();
  }
}
```

### Fallback Chain Definition

```typescript
interface FallbackStep {
  name: string;
  execute: (errorContext: ErrorContext) => Promise<{ success: boolean; data?: any }>;
}

interface FallbackChain {
  steps: FallbackStep[];
  timeoutMs: number;
}

// Example fallback chains
const fallbackChains: Map<ErrorType, FallbackChain[]> = new Map();

// Rate limiting fallback
fallbackChains.set(ErrorType.RATE_LIMIT_EXCEEDED, [
  {
    steps: [
      {
        name: 'switch_to_fallback_model',
        execute: async (context) => {
          // Switch to a different model with higher rate limits
          const fallbackModel = this.findFallbackModel(context.agentId);
          if (fallbackModel) {
            await this.switchAgentModel(context.agentId, fallbackModel);
            return { success: true };
          }
          return { success: false };
        }
      },
      {
        name: 'increase_timeout',
        execute: async (context) => {
          // Temporarily increase task timeout
          await this.updateTaskTimeout(context.taskId, 300000); // 5 minutes
          return { success: true };
        }
      }
    ],
    timeoutMs: 10000
  }
]);

// Task failure fallback
fallbackChains.set(ErrorType.TASK_FAILURE, [
  {
    steps: [
      {
        name: 'break_into_subtasks',
        execute: async (context) => {
          // Break complex task into simpler subtasks
          const subtasks = await this.decomposeTask(context.taskId);
          if (subtasks.length > 0) {
            await this.createSubtasks(subtasks);
            return { success: true };
          }
          return { success: false };
        }
      },
      {
        name: 'use_simpler_approach',
        execute: async (context) => {
          // Switch to a simpler approach for the task
          await this.updateTaskApproach(context.taskId, 'simplified');
          return { success: true };
        }
      }
    ],
    timeoutMs: 15000
  }
]);
```

### Monitoring and Alerting

```typescript
class ErrorMonitoringService {
  private errorMetrics: Map<string, ErrorMetrics> = new Map();
  private alertThresholds: AlertThresholds;
  
  constructor() {
    this.initializeAlertThresholds();
  }
  
  async trackError(errorContext: ErrorContext): Promise<void> {
    const key = `${errorContext.type}_${errorContext.severity}`;
    const metrics = this.errorMetrics.get(key) || this.createErrorMetrics(key);
    
    metrics.totalErrors++;
    metrics.lastError = Timestamp.now();
    
    if (errorContext.retryCount > 0) {
      metrics.recoveryAttempts++;
    }
    
    if (errorContext.escalationPath.humanInterventionRequired) {
      metrics.escalations++;
    }
    
    this.errorMetrics.set(key, metrics);
    
    // Check for alert conditions
    this.checkAlertConditions(metrics);
  }
  
  async generateErrorReport(): Promise<ErrorReport> {
    const report: ErrorReport = {
      period: '24h',
      totalErrors: 0,
      errorBreakdown: {},
      recoveryRate: 0,
      escalationRate: 0,
      topErrorTypes: [],
      systemHealth: 'healthy'
    };
    
    // Calculate summary metrics
    let totalRecoverable = 0;
    let totalEscalated = 0;
    
    for (const [key, metrics] of this.errorMetrics) {
      report.totalErrors += metrics.totalErrors;
      report.errorBreakdown[key] = metrics;
      
      if (metrics.recoveryAttempts > 0) {
        totalRecoverable++;
      }
      
      if (metrics.escalations > 0) {
        totalEscalated++;
      }
    }
    
    // Calculate rates
    const totalTracked = this.errorMetrics.size;
    report.recoveryRate = totalRecoverable / totalTracked;
    report.escalationRate = totalEscalated / totalTracked;
    
    // Identify top error types
    report.topErrorTypes = Array.from(this.errorMetrics.entries())
      .sort((a, b) => b[1].totalErrors - a[1].totalErrors)
      .slice(0, 5)
      .map(([key, metrics]) => ({ type: key, count: metrics.totalErrors }));
    
    // Determine system health
    if (report.escalationRate > 0.3) {
      report.systemHealth = 'critical';
    } else if (report.escalationRate > 0.1) {
      report.systemHealth = 'warning';
    } else {
      report.systemHealth = 'healthy';
    }
    
    return report;
  }
  
  private checkAlertConditions(metrics: ErrorMetrics): void {
    const threshold = this.alertThresholds[metrics.severity];
    
    if (metrics.totalErrors >= threshold.errorCount) {
      this.sendAlert(metrics);
    }
    
    if (metrics.recoveryRate < threshold.successRate) {
      this.sendRecoveryAlert(metrics);
    }
  }
  
  private sendAlert(metrics: ErrorMetrics): void {
    const alert = {
      type: 'error_spike',
      severity: metrics.severity,
      message: `Error spike detected: ${metrics.totalErrors} errors in last hour`,
      metrics
    };
    
    this.notificationService.send({
      channel: 'slack',
      recipients: ['operations@example.com'],
      message: `🚨 Error Alert: ${alert.message}`,
      priority: 'high'
    });
  }
  
  private initializeAlertThresholds(): void {
    this.alertThresholds = {
      low: { errorCount: 10, successRate: 0.8 },
      medium: { errorCount: 5, successRate: 0.7 },
      high: { errorCount: 3, successRate: 0.6 },
      critical: { errorCount: 1, successRate: 0.5 }
    };
  }
}
```

## Usage Examples

### Error Handling Integration

```typescript
// Connect error recovery to task processing
const errorRecovery = new ErrorRecoveryEngine();

async function processTask(task: Task): Promise<void> {
  try {
    const result = await executeAgentTask(task);
    await updateTaskStatus(task.id, 'Done');
    return result;
  } catch (error) {
    const errorContext: ErrorContext = {
      error: error as Error,
      taskId: task.id,
      agentId: task.assignedAgentId,
      timestamp: Timestamp.now(),
      severity: determineErrorSeverity(error),
      type: categorizeError(error),
      retryCount: 0,
      escalationPath: {
        tier: 1,
        autoRecovered: false,
        fallbackAttempted: false,
        humanInterventionRequired: false,
        escalationTimestamps: []
      }
    };
    
    const recoveryResult = await errorRecovery.handleTaskError(errorContext);
    
    if (recoveryResult.escalated) {
      await markTaskAsEscalated(task.id);
    }
    
    throw error; // Re-throw if recovery failed
  }
}
```

### Circuit Breaker Usage

```typescript
const circuitBreaker = new CircuitBreaker({
  threshold: 5,
  timeoutMs: 30000,
  halfOpenTimeoutMs: 60000
});

async function makeApiCall(url: string, data: any): Promise<any> {
  return circuitBreaker.execute(async () => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    if (!response.ok) {
      throw new Error(`API call failed: ${response.statusText}`);
    }
    
    return response.json();
  });
}
```

## Monitoring Dashboard

### Key Metrics to Track
- Error rates by type and severity
- Recovery success rates
- Escalation frequency
- Average resolution time
- System availability
- Error prevention effectiveness

### Alert Types
- Error rate thresholds
- Recovery failure alerts
- Escalation notifications
- System health warnings
- Performance degradation alerts

## Alternative Approaches Considered

### 1. Simple Retry with Logging
```typescript
async function simpleRetry(operation: () => Promise<any>, maxRetries: number = 3): Promise<any> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      console.log(`Attempt ${i + 1} failed:`, error);
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}
```

**Rejected because:**
- No intelligent retry strategies
- No error categorization
- No escalation mechanisms
- Poor scalability for complex scenarios

### 2. Manual Error Handling
```typescript
// Manual try-catch blocks everywhere
async function manualTaskProcessing(task: Task) {
  try {
    await agent.execute(task);
  } catch (error) {
    await logError(error);
    await notifyAdmin(error);
    await markTaskAsFailed(task.id);
  }
}
```

**Rejected because:**
- Inconsistent error handling across codebase
- No centralized recovery logic
- Poor maintainability
- High operational overhead

### 3. External Error Management Service
```typescript
// Third-party error management
const errorService = new ExternalErrorManagementService({
  apiKey: '...',
  projectId: '...'
});
```

**Rejected because:**
- Additional service dependency
- Cost implications
- Integration complexity
- Limited control over recovery logic

The hierarchical error recovery system provides comprehensive error handling with intelligent recovery strategies, automatic escalation, and minimal human intervention while maintaining system reliability and transparency.