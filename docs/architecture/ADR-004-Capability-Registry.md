# Architecture Decision Record (ADR) - Capability Registry

**Date:** 2026-05-14
**Decider:** Khaled (SW Architect)
**Status:** PROPOSED — awaiting review

## Context

The Autonomous Swarm requires a comprehensive capability registry to:
- Track agent skills, specializations, and limitations
- Manage workload distribution and capacity planning
- Support intelligent task assignment algorithms
- Enable skill gap identification and training recommendations
- Handle rate limiting and performance tracking
- Support team optimization and role balancing

Current system has basic agent information but lacks comprehensive capability tracking.

## Decision

**Use centralized capability registry with JSON schema validation and real-time updates.**

```
┌─────────────────────────────────────────────────────────────────┐
│                   Capability Registry                          │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                Schema Engine                            │  │
│  │                                                          │  │
│  │  • JSON Schema Validation                               │  │
│  │  • Type Checking                                        │  │
│  │  • Relationship Validation                              │  │
│  └─────────────────────────────────────────────────────────┘  │
│          │                                                     │
│          ▼                                                     │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                Core Registry                            │  │
│  │                                                          │  │
│  │  • Agent Profiles                                       │  │
│  │  • Skill Definitions                                    │  │
│  │  • Workload Metrics                                     │  │
│  │  • Performance History                                  │  │
│  └─────────────────────────────────────────────────────────┘  │
│          │                                                     │
│          ▼                                                     │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                Query Engine                             │  │
│  │                                                          │  │
│  │  • Skill Matching                                      │  │
│  │  • Capacity Analysis                                    │  │
│  │  • Performance Analytics                                │  │
│  │  • Team Composition Optimization                        │  │
│  └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Rationale

| Factor | Centralized Registry | Distributed Registry | Static Configuration |
|--------|---------------------|---------------------|---------------------|
| **Consistency** | High (single source of truth) | Medium (eventual sync) | Low (manual updates) |
| **Performance** | Good (optimized queries) | Variable (network dependent) | Excellent (local cache) |
| **Scalability** | High (indexed storage) | High (distributed) | Low (file-based) |
| **Real-time Updates** | Excellent (live updates) | Good (with sync) | None (static) |
| **Schema Validation** | Strong (JSON Schema) | Medium (custom validation) | Weak (basic checks) |
| **Maintainability** | Easy (centralized management) | Medium (distributed coordination) | Hard (manual updates) |

## Implementation Details

### Core Schema Design

```typescript
// capability-registry-schema.json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Agent Capability Registry",
  "description": "Comprehensive schema for tracking agent capabilities and workload",
  
  "definitions": {
    "Skill": {
      "type": "object",
      "required": ["id", "name", "category", "proficiencyLevel"],
      "properties": {
        "id": {
          "type": "string",
          "pattern": "^[a-z][a-z0-9-]*$"
        },
        "name": {
          "type": "string",
          "minLength": 2,
          "maxLength": 50
        },
        "category": {
          "type": "string",
          "enum": ["programming", "testing", "architecture", "devops", "documentation", "management", "design", "data"]
        },
        "proficiencyLevel": {
          "type": "string",
          "enum": ["beginner", "intermediate", "advanced", "expert"]
        },
        "description": {
          "type": "string",
          "maxLength": 200
        },
        "relatedSkills": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "learningPath": {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      }
    },
    
    "Agent": {
      "type": "object",
      "required": ["id", "name", "status", "skills", "maxConcurrentTasks"],
      "properties": {
        "id": {
          "type": "string",
          "pattern": "^agent:[a-zA-Z0-9-]+$"
        },
        "name": {
          "type": "string",
          "minLength": 2,
          "maxLength": 50
        },
        "emoji": {
          "type": "string",
          "maxLength": 10
        },
        "status": {
          "type": "string",
          "enum": ["online", "offline", "busy", "maintenance"]
        },
        "role": {
          "type": "string",
          "enum": ["senior-dev", "dev", "ui-expert", "ui-dev", "qa", "devops", "architect", "manager"]
        },
        "skills": {
          "type": "array",
          "items": {
            "$ref": "#/definitions/Skill"
          }
        },
        "specialties": {
          "type": "array",
          "items": {
            "type": "string",
            "enum": ["performance", "security", "scalability", "mobile", "web", "cloud", "ai", "database", "frontend", "backend"]
          }
        },
        "maxConcurrentTasks": {
          "type": "integer",
          "minimum": 1,
          "maximum": 10,
          "default": 3
        },
        "preferredTaskTypes": {
          "type": "array",
          "items": {
            "type": "string",
            "enum": ["bugfix", "feature", "refactor", "documentation", "testing", "architecture", "devops", "research"]
          }
        },
        "workload": {
          "type": "object",
          "required": ["activeTasks", "recentCompletionRate"],
          "properties": {
            "activeTasks": {
              "type": "integer",
              "minimum": 0,
              "maximum": 10
            },
            "recentCompletionRate": {
              "type": "number",
              "minimum": 0,
              "maximum": 1,
              "description": "Success rate over last 24h (0-1)"
            },
            "averageTaskDuration": {
              "type": "number",
              "minimum": 0,
              "description": "Average time to complete tasks in minutes"
            },
            "totalTasksCompleted": {
              "type": "integer",
              "minimum": 0
            },
            "totalTasksFailed": {
              "type": "integer",
              "minimum": 0
            },
            "lastTaskCompleted": {
              "type": ["string", "null"],
              "format": "date-time"
            },
            "currentStreak": {
              "type": "integer",
              "minimum": 0,
              "description": "Consecutive successful task completions"
            }
          }
        },
        "rateLimit": {
          "type": "object",
          "required": ["requestsPerMinute", "modelType"],
          "properties": {
            "modelType": {
              "type": "string",
              "enum": ["nemotron-120b:free", "qwen3-coder:free", "glm-4.5-flash", "glm-4.7-flash"]
            },
            "requestsPerMinute": {
              "type": "integer",
              "minimum": 0,
              "maximum": 100
            },
            "dailyLimit": {
              "type": "integer",
              "minimum": 0
            },
            "lastReset": {
              "type": "string",
              "format": "date-time"
            },
            "usageHistory": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "timestamp": {
                    "type": "string",
                    "format": "date-time"
                  },
                  "requests": {
                    "type": "integer",
                    "minimum": 0
                  }
                }
              }
            }
          }
        },
        "preferences": {
          "type": "object",
          "properties": {
            "workHours": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "dayOfWeek": {
                    "type": "string",
                    "enum": ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
                  },
                  "startTime": {
                    "type": "string",
                    "format": "time"
                  },
                  "endTime": {
                    "type": "string",
                    "format": "time"
                  }
                }
              }
            },
            "timezone": {
              "type": "string",
              "description": "IANA timezone identifier"
            },
            "communicationPreferences": {
              "type": "object",
              "properties": {
                "notificationChannel": {
                  "type": "string",
                  "enum": ["slack", "email", "telegram", "none"]
                },
                "notificationFrequency": {
                  "type": "string",
                  "enum": ["immediate", "hourly", "daily", "none"]
                }
              }
            }
          }
        },
        "performance": {
          "type": "object",
          "properties": {
            "averageResponseTime": {
              "type": "number",
              "minimum": 0,
              "description": "Average response time in seconds"
            },
            "successRate": {
              "type": "number",
              "minimum": 0,
              "maximum": 1,
              "description": "Overall success rate (0-1)"
            },
            "qualityScore": {
              "type": "number",
              "minimum": 0,
              "maximum": 1,
              "description": "Code quality score (0-1)"
            },
            "productivityScore": {
              "type": "number",
              "minimum": 0,
              "maximum": 1,
              "description": "Tasks completed per hour"
            }
          }
        },
        "availability": {
          "type": "object",
          "properties": {
            "nextAvailableTime": {
              "type": ["string", "null"],
              "format": "date-time"
            },
            "currentCapacity": {
              "type": "number",
              "minimum": 0,
              "maximum": 1,
              "description": "Current capacity utilization (0-1)"
            },
            "capacityTrend": {
              "type": "string",
              "enum": ["increasing", "stable", "decreasing"]
            }
          }
        }
      }
    }
  },
  
  "type": "object",
  "required": ["agents", "skills", "metadata"],
  "properties": {
    "agents": {
      "type": "object",
      "additionalProperties": {
        "$ref": "#/definitions/Agent"
      }
    },
    "skills": {
      "type": "object",
      "additionalProperties": {
        "$ref": "#/definitions/Skill"
      }
    },
    "metadata": {
      "type": "object",
      "required": ["lastUpdated", "version"],
      "properties": {
        "lastUpdated": {
          "type": "string",
          "format": "date-time"
        },
        "version": {
          "type": "string",
          "pattern": "^[0-9]+\\.[0-9]+\\.[0-9]+$"
        },
        "totalAgents": {
          "type": "integer",
          "minimum": 0
        },
        "totalSkills": {
          "type": "integer",
          "minimum": 0
        },
        "systemHealth": {
          "type": "object",
          "properties": {
            "lastSync": {
              "type": "string",
              "format": "date-time"
            },
            "validationErrors": {
              "type": "integer",
              "minimum": 0
            }
          }
        }
      }
    }
  }
}
```

### Registry Implementation

```typescript
class CapabilityRegistry {
  private agents: Map<string, Agent> = new Map();
  private skills: Map<string, Skill> = new Map();
  private schemaValidator: any;
  
  constructor() {
    // Initialize JSON Schema validator
    this.schemaValidator = Ajv();
  }
  
  async loadRegistry(): Promise<void> {
    // Load registry from Firestore
    const agentsSnapshot = await firestore.collection('agents').get();
    const skillsSnapshot = await firestore.collection('skills').get();
    
    // Clear existing data
    this.agents.clear();
    this.skills.clear();
    
    // Load agents
    agentsSnapshot.docs.forEach(doc => {
      const agent = doc.data() as Agent;
      this.agents.set(agent.id, agent);
    });
    
    // Load skills
    skillsSnapshot.docs.forEach(doc => {
      const skill = doc.data() as Skill;
      this.skills.set(skill.id, skill);
    });
  }
  
  async saveRegistry(): Promise<void> {
    // Validate registry against schema
    const registryData = this.getRegistryData();
    if (!this.schemaValidator.validate(capabilityRegistrySchema, registryData)) {
      throw new Error(`Schema validation failed: ${JSON.stringify(this.schemaValidator.errors)}`);
    }
    
    // Save agents
    const batch = firestore.batch();
    for (const [id, agent] of this.agents) {
      const agentRef = firestore.collection('agents').doc(id);
      batch.set(agentRef, agent);
    }
    
    // Save skills
    for (const [id, skill] of this.skills) {
      const skillRef = firestore.collection('skills').doc(id);
      batch.set(skillRef, skill);
    }
    
    await batch.commit();
  }
  
  // Agent management
  async addAgent(agent: Agent): Promise<void> {
    // Validate agent schema
    if (!this.schemaValidator.validate({ definitions: { Agent }, type: 'object' }, agent)) {
      throw new Error(`Invalid agent schema: ${JSON.stringify(this.schemaValidator.errors)}`);
    }
    
    this.agents.set(agent.id, agent);
    await this.saveAgent(agent);
  }
  
  async updateAgent(agentId: string, updates: Partial<Agent>): Promise<void> {
    const existing = this.agents.get(agentId);
    if (!existing) {
      throw new Error(`Agent ${agentId} not found`);
    }
    
    const updated = { ...existing, ...updates };
    this.agents.set(agentId, updated);
    await this.saveAgent(updated);
  }
  
  async removeAgent(agentId: string): Promise<void> {
    this.agents.delete(agentId);
    await firestore.collection('agents').doc(agentId).delete();
  }
  
  async getAgent(agentId: string): Promise<Agent | null> {
    return this.agents.get(agentId) || null;
  }
  
  async findAgentsBySkill(skillId: string): Promise<Agent[]> {
    return Array.from(this.agents.values()).filter(agent => 
      agent.skills.some(skill => skill.id === skillId)
    );
  }
  
  async findAgentsByRole(role: string): Promise<Agent[]> {
    return Array.from(this.agents.values()).filter(agent => agent.role === role);
  }
  
  async findAvailableAgents(): Promise<Agent[]> {
    return Array.from(this.agents.values()).filter(agent => 
      agent.status === 'online' && 
      agent.workload.activeTasks < agent.maxConcurrentTasks
    );
  }
  
  // Skill management
  async addSkill(skill: Skill): Promise<void> {
    // Validate skill schema
    if (!this.schemaValidator.validate({ definitions: { Skill }, type: 'object' }, skill)) {
      throw new Error(`Invalid skill schema: ${JSON.stringify(this.schemaValidator.errors)}`);
    }
    
    this.skills.set(skill.id, skill);
    await this.saveSkill(skill);
  }
  
  async updateSkill(skillId: string, updates: Partial<Skill>): Promise<void> {
    const existing = this.skills.get(skillId);
    if (!existing) {
      throw new Error(`Skill ${skillId} not found`);
    }
    
    const updated = { ...existing, ...updates };
    this.skills.set(skillId, updated);
    await this.saveSkill(updated);
  }
  
  // Workload management
  async updateWorkload(agentId: string, workloadUpdate: Partial<Agent['workload']>): Promise<void> {
    const agent = await this.getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }
    
    const updatedWorkload = {
      ...agent.workload,
      ...workloadUpdate,
      lastUpdated: Timestamp.now()
    };
    
    await this.updateAgent(agentId, { workload: updatedWorkload });
  }
  
  async updateRateLimit(agentId: string, modelType: string, usage: number): Promise<void> {
    const agent = await this.getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }
    
    const rateLimit = agent.rateLimit || { modelType, requestsPerMinute: 0 };
    rateLimit.requestsPerMinute = usage;
    rateLimit.lastReset = Timestamp.now();
    
    // Add to usage history
    if (!rateLimit.usageHistory) {
      rateLimit.usageHistory = [];
    }
    rateLimit.usageHistory.push({
      timestamp: Timestamp.now(),
      requests: usage
    });
    
    // Keep only last 24 hours of history
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    rateLimit.usageHistory = rateLimit.usageHistory.filter(
      entry => entry.timestamp.toDate() > oneDayAgo
    );
    
    await this.updateAgent(agentId, { rateLimit });
  }
  
  // Analytics and reporting
  async getSkillDistribution(): Promise<{ [skillId: string]: number }> {
    const distribution: { [skillId: string]: number } = {};
    
    for (const agent of this.agents.values()) {
      for (const skill of agent.skills) {
        distribution[skill.id] = (distribution[skill.id] || 0) + 1;
      }
    }
    
    return distribution;
  }
  
  async getTeamComposition(): Promise<{ [role: string]: number }> {
    const composition: { [role: string]: number } = {};
    
    for (const agent of this.agents.values()) {
      composition[agent.role] = (composition[agent.role] || 0) + 1;
    }
    
    return composition;
  }
  
  async getCapacityUtilization(): Promise<{ [agentId: string]: number }> {
    const utilization: { [agentId: string]: number } = {};
    
    for (const [agentId, agent] of this.agents) {
      utilization[agentId] = agent.workload.activeTasks / agent.maxConcurrentTasks;
    }
    
    return utilization;
  }
  
  // Private helper methods
  private async saveAgent(agent: Agent): Promise<void> {
    await firestore.collection('agents').doc(agent.id).set(agent);
  }
  
  private async saveSkill(skill: Skill): Promise<void> {
    await firestore.collection('skills').doc(skill.id).set(skill);
  }
  
  private getRegistryData(): any {
    return {
      agents: Object.fromEntries(this.agents),
      skills: Object.fromEntries(this.skills),
      metadata: {
        lastUpdated: Timestamp.now(),
        version: "1.0.0",
        totalAgents: this.agents.size,
        totalSkills: this.skills.size
      }
    };
  }
}
```

### Integration with Other Systems

```typescript
// Connect capability registry to other systems
const capabilityRegistry = new CapabilityRegistry();

// Initialize registry on startup
await capabilityRegistry.loadRegistry();

// Update agent workload when tasks are assigned
onTaskUpdated(async (event) => {
  const task = event.data.data();
  const agentId = task.assignedAgentId;
  
  if (agentId) {
    const activeTasks = await getActiveTasksForAgent(agentId);
    await capabilityRegistry.updateWorkload(agentId, { 
      activeTasks,
      lastTaskCompleted: task.status === 'Done' ? Timestamp.now() : null
    });
  }
});

// Update rate limits when API calls are made
afterApiCall(async (agentId, modelType, success) => {
  const agent = await capabilityRegistry.getAgent(agentId);
  if (!agent) return;
  
  const currentUsage = agent.rateLimit?.requestsPerMinute || 0;
  const newUsage = success ? currentUsage + 1 : currentUsage;
  
  await capabilityRegistry.updateRateLimit(agentId, modelType, newUsage);
});

// Periodic capacity analysis
setInterval(async () => {
  const utilization = await capabilityRegistry.getCapacityUtilization();
  const overutilized = Object.entries(utilization)
    .filter(([_, usage]) => usage > 0.9);
  
  if (overutilized.length > 0) {
    console.warn('High capacity utilization detected:', overutilized);
    // Could trigger rebalancing or alerting here
  }
}, 5 * 60 * 1000); // Check every 5 minutes
```

## Monitoring and Analytics

### Real-time Metrics
- Agent availability by role
- Skill distribution across the team
- Capacity utilization rates
- Rate limit usage patterns
- Performance trends over time

### Health Checks
- Registry synchronization status
- Schema validation results
- Data consistency checks
- Performance metrics for registry operations

### Alerting System
- Low capacity warnings
- Rate limit approaching thresholds
- Skill gap notifications
- Performance degradation alerts

## Alternative Approaches Considered

### 1. Simple Agent Configuration
```json
{
  "agents": [
    {
      "id": "agent:seniordev",
      "skills": ["typescript", "architecture"],
      "maxTasks": 3
    }
  ]
}
```

**Rejected because:**
- Limited to basic skill tracking
- No workload or performance metrics
- No schema validation
- Poor scalability for complex requirements

### 2. External Service Registry
```typescript
// Service Discovery pattern
const registry = new ServiceRegistry({
  host: 'capability-registry.example.com',
  port: 8080
});
```

**Rejected because:**
- Additional infrastructure dependency
- Network latency concerns
- Operational complexity
- Cost for external service

### 3. Distributed Capability Tracking
```typescript
// Agent self-reporting
class AgentCapabilityReporter {
  async reportCapabilities() {
    // Each agent reports its own capabilities
    const capabilities = await self.analyzeCapabilities();
    await registry.updateCapabilities(self.id, capabilities);
  }
}
```

**Rejected because:**
- Risk of inconsistent reporting
- No central validation
- Difficult to detect anomalies
- Limited historical tracking

The centralized capability registry provides the best balance of comprehensive tracking, real-time updates, and operational efficiency for the autonomous swarm system.