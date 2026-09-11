# Architecture Decision Record (ADR) - Dispatcher Matching Algorithm

**Date:** 2026-05-14
**Decider:** Khaled (SW Architect)
**Status:** PROPOSED — awaiting review

## Context

The Work Dispatcher must intelligently assign tasks to agents based on:
- Agent skills and capabilities
- Current workload and availability
- Task complexity and priority
- Agent preferences and specializations
- Rate limiting constraints (OpenRouter free tier: 20 RPM per model)

Current system has manual assignment - no automated matching.

## Decision

**Use weighted scoring algorithm with priority-based assignment.**

```
┌─────────────────────────────────────────────────────────────────┐
│                    Work Dispatcher                             │
│                                                                 │
│  ┌─────────────────────┐           ┌─────────────────────┐     │
│  │   Task Queue       │           │   Agent Registry     │     │
│  │                    │           │                     │     │
│  │  • Unassigned tasks │           │  • Available agents  │     │
│  │  • Priority sorted  │           │  • Skill scores      │     │
│  │  • Deadline aware   │◄─────────►│  • Workload metrics  │     │
│  └─────────────────────┘           └─────────────────────┘     │
│          │                                                     │
│          ▼                                                     │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                 Matching Engine                         │    │
│  │                                                         │    │
│  │  1. Filter eligible agents                             │    │
│  │  2. Calculate scores for each candidate                │    │
│  │  3. Select highest scoring agent                       │    │
│  │  4. Apply rate limiting checks                         │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

## Rationale

| Factor | Weighted Scoring | Round Robin | Random Assignment |
|--------|------------------|-------------|-------------------|
| **Optimization** | Optimal for workload | Fair but not optimal | No optimization |
| **Complexity** | Medium (scoring logic) | Low (simple rotation) | Very low (random) |
| **Flexibility** | Highly configurable | Limited | None |
| **Quality** | High (best agent selected) | Medium (fair distribution) | Variable |
| **Rate Limit Handling** | Built-in awareness | Requires manual tracking | Poor |
| **Scalability** | Scales with task volume | Scales well | Scales well |

## Implementation Details

### Scoring Function

```typescript
interface AgentScore {
  agentId: string;
  score: number;
  factors: {
    skillMatch: number;      // 0-1
    workload: number;        // 0-1 (inverse - less is better)
    priority: number;        // 0-1
    preference: number;     // 0-1
    rateLimit: number;      // 0-1 (penalty if approaching limit)
  };
}

class TaskMatcher {
  async findBestAgent(task: Task, availableAgents: Agent[]): Promise<AgentScore> {
    // 1. Filter agents by basic eligibility
    const eligibleAgents = this.filterEligibleAgents(task, availableAgents);
    
    // 2. Calculate scores for each candidate
    const scoredAgents = await Promise.all(
      eligibleAgents.map(agent => this.calculateScore(task, agent))
    );
    
    // 3. Sort by score and return best
    return scoredAgents.sort((a, b) => b.score - a.score)[0];
  }
  
  private filterEligibleAgents(task: Task, agents: Agent[]): Agent[] {
    return agents.filter(agent => {
      // Basic eligibility criteria
      if (agent.status !== 'online') return false;
      if (agent.currentTaskId) return false;
      
      // Check if agent has required skills
      if (task.requiredSkills && task.requiredSkills.length > 0) {
        const hasRequiredSkills = task.requiredSkills.every(skill => 
          agent.skills?.includes(skill)
        );
        if (!hasRequiredSkills) return false;
      }
      
      // Check rate limits (OpenRouter 20 RPM per model)
      const usage = this.getAgentUsage(agent);
      if (usage.recentRequests >= 18) return false; // Leave buffer
      
      return true;
    });
  }
  
  private async calculateScore(task: Task, agent: Agent): Promise<AgentScore> {
    const factors = await Promise.all([
      this.calculateSkillMatch(task, agent),
      this.calculateWorkloadScore(agent),
      this.calculatePriorityScore(task, agent),
      this.calculatePreferenceScore(task, agent),
      this.calculateRateLimitScore(agent)
    ]);
    
    const weights = {
      skillMatch: 0.4,    // 40% - most important
      workload: 0.25,     // 25% - balance load
      priority: 0.15,     // 15% - urgent tasks to capable agents
      preference: 0.15,   // 15% - agent preferences
      rateLimit: 0.05     // 5% - avoid rate limiting
    };
    
    const score = Object.keys(weights).reduce((total, key, index) => {
      return total + (weights[key as keyof typeof weights] * factors[index]);
    }, 0);
    
    return {
      agentId: agent.id,
      score,
      factors: {
        skillMatch: factors[0],
        workload: factors[1], 
        priority: factors[2],
        preference: factors[3],
        rateLimit: factors[4]
      }
    };
  }
  
  private async calculateSkillMatch(task: Task, agent: Agent): Promise<number> {
    if (!task.requiredSkills || task.requiredSkills.length === 0) {
      return 1.0; // No skill requirements = perfect match
    }
    
    const agentSkills = agent.skills || [];
    const matchedSkills = task.requiredSkills.filter(skill => 
      agentSkills.includes(skill)
    );
    
    return matchedSkills.length / task.requiredSkills.length;
  }
  
  private calculateWorkloadScore(agent: Agent): Promise<number> {
    // Prefer agents with fewer active tasks
    const activeTasks = (agent.workload?.activeTasks || 0);
    const maxConcurrent = agent.maxConcurrentTasks || 3;
    
    // Score inversely with workload (0 = maxed out, 1 = no load)
    return Math.max(0, 1 - (activeTasks / maxConcurrent));
  }
  
  private calculatePriorityScore(task: Task, agent: Agent): Promise<number> {
    if (task.priority === 'Urgent' && agent.specialties?.includes('emergency')) {
      return 1.0;
    }
    if (task.priority === 'High' && agent.specialties?.includes('critical')) {
      return 0.8;
    }
    return 0.5; // Default for non-priority matching
  }
  
  private calculatePreferenceScore(task: Task, agent: Agent): Promise<number> {
    if (!agent.preferredTaskTypes) return 0.5;
    
    const isPreferred = agent.preferredTaskTypes.includes(task.type || 'general');
    return isPreferred ? 1.0 : 0.3;
  }
  
  private calculateRateLimitScore(agent: Agent): Promise<number> {
    const usage = this.getAgentUsage(agent);
    const recentRate = usage.recentRequests / 20; // 20 RPM limit
    
    // Penalize agents approaching rate limits
    if (recentRate >= 0.9) return 0.1;   // 90%+ = severe penalty
    if (recentRate >= 0.7) return 0.3;   // 70%+ = moderate penalty
    if (recentRate >= 0.5) return 0.7;   // 50%+ = minor penalty
    return 1.0;                           // < 50% = no penalty
  }
  
  private getAgentUsage(agent: Agent): { recentRequests: number } {
    // Track API calls per agent over rolling time window
    // Implementation would use Firestore collection for metrics
    return { recentRequests: 0 }; // Placeholder
  }
}
```

### Agent Capability Schema Extension

```typescript
interface Agent {
  id: string;
  name: string;
  status: 'online' | 'offline' | 'busy';
  
  // Existing fields
  role?: string;
  emoji?: string;
  
  // New capability fields
  skills: string[];                              // ['typescript', 'testing', 'architecture']
  maxConcurrentTasks: number;                    // Default: 3
  preferredTaskTypes: string[];                 // ['bugfix', 'feature', 'refactor']
  specialties: string[];                        // ['emergency', 'performance', 'security']
  workload: {
    activeTasks: number;                         // Current active task count
    recentCompletionRate: number;                // Success rate over last 24h
    averageTaskDuration: number;                 // Average time to complete tasks
  };
  
  // Rate limiting tracking
  rateLimit: {
    requestsPerMinute: number;                   // Current RPM
    lastReset: Timestamp;                       // Last tracking reset
  };
}
```

### Task Schema Extension

```typescript
interface Task {
  // Existing fields
  id: string;
  title: string;
  status: TaskStatus;
  
  // New assignment-related fields
  requiredSkills: string[];                     // ['typescript', 'testing']
  complexity: 'low' | 'medium' | 'high';      // Task complexity level
  estimatedDuration: number;                    // Minutes estimated
  type: 'bugfix' | 'feature' | 'refactor' | 'documentation' | 'testing';
  priority: 'Low' | 'Medium' | 'High' | 'Urgent';
  
  // Assignment tracking
  assignmentScore?: number;                     // Score when assigned
  assignmentReason?: string;                   // Why this agent was chosen
  assignmentTimestamp?: Timestamp;              // When assigned
}
```

### Assignment Flow

```typescript
async function dispatchTask(task: Task): Promise<void> {
  // 1. Get available agents
  const availableAgents = await getAvailableAgents();
  
  // 2. Find best match using scoring algorithm
  const bestMatch = await matcher.findBestAgent(task, availableAgents);
  
  if (!bestMatch) {
    // No eligible agents - queue for later
    await queueTaskForLater(task);
    return;
  }
  
  // 3. Apply rate limiting check
  if (bestMatch.factors.rateLimit < 0.3) {
    // Agent approaching rate limits - defer assignment
    await queueTaskForLater(task);
    return;
  }
  
  // 4. Assign task to agent
  await assignTaskToAgent(task, bestMatch.agentId, {
    score: bestMatch.score,
    factors: bestMatch.factors,
    reason: `Score: ${bestMatch.score.toFixed(2)} | Skills: ${bestMatch.factors.skillMatch.toFixed(2)} | Load: ${bestMatch.factors.workload.toFixed(2)}`
  });
  
  // 5. Update agent workload
  await updateAgentWorkload(bestMatch.agentId, task.id);
}
```

## Usage Examples

### Simple Task Assignment

```typescript
// Example: Assigning a TypeScript bugfix task
const task: Task = {
  id: 'task-123',
  title: 'Fix login validation bug',
  type: 'bugfix',
  requiredSkills: ['typescript', 'testing'],
  priority: 'High',
  complexity: 'medium'
};

const assignment = await matcher.findBestAgent(task, availableAgents);
console.log(`Selected agent ${assignment.agentId} with score ${assignment.score}`);
```

### Handling Rate Limiting

```typescript
// Rate limiting logic integrated into scoring
if (agent.rateLimit.requestsPerMinute >= 18) {
  // Severely penalize agents at rate limit
  score *= 0.1;
}
```

## Monitoring and Optimization

### Metrics to Track
- Assignment success rate
- Average score improvement
- Task completion time by agent
- Rate limit avoidance effectiveness
- Skill utilization patterns

### Optimization Opportunities
- Dynamic weight adjustment based on historical performance
- Learning from successful vs. failed assignments
- Skill gap identification and training recommendations
- Peak load prediction and proactive assignment

## Alternative Approaches Considered

### 1. Round Robin Assignment
```typescript
// Simple rotation through available agents
const nextAgent = availableAgents[currentIndex % availableAgents.length];
currentIndex++;
```

**Rejected because:**
- Ignores skill mismatches
- Doesn't balance workload effectively
- No awareness of task priorities
- Poor handling of rate limiting

### 2. Greedy Skill Matching
```typescript
// Only match on exact skills, ignore other factors
const perfectMatches = agents.filter(agent => 
  task.requiredSkills.every(skill => agent.skills.includes(skill))
);
```

**Rejected because:**
- Overlooks workload balance
- No preference for agent specializations
- Ignores rate limiting constraints
- Suboptimal for complex scenarios

### 3. Machine Learning Model
```typescript
// ML-based assignment using historical data
const assignment = mlModel.predictBestAgent(task, agents);
```

**Rejected because:**
- Overkill for current requirements
- Requires extensive training data
- Hard to debug and explain decisions
- Higher computational overhead

The weighted scoring approach provides the best balance of optimization, transparency, and operational simplicity for the current use case.