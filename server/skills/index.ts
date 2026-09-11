/**
 * Swarm Skills — Barrel export
 *
 * All P2-Swarm skill modules for the ALM server.
 */

export {
  checkScope,
  scopeGuardMiddleware,
  getAllRoleBoundaries,
  getScopeViolations,
  resolveRole,
  type ScopeCheckResult,
  type RoleBoundary,
} from './scope-guard';

export {
  createHandoff,
  acknowledgeHandoff,
  getTaskHandoffs,
  getHandoffTemplates,
  determineHandoffType,
  type HandoffContext,
  type HandoffType,
} from './handoff-protocol';

export {
  buildSprintContext,
  formatSprintContext,
  type SprintContext,
} from './sprint-context';

export {
  checkGate,
  gateEnforcementMiddleware,
  getGateRules,
  getGateViolations,
  type GateRule,
  type GateCheckResult,
} from './workflow-gates';

export {
  addDependency,
  removeDependency,
  checkDependencies,
  getTaskDependencies,
  getBlockingTasks,
  dependencyCheckMiddleware,
  type Dependency,
  type DependencyCheckResult,
} from './task-dependencies';

export {
  storeMemory,
  getMemory,
  getAgentMemories,
  deleteMemory,
  getMemorySummary,
  formatMemoriesForContext,
  batchStoreMemories,
  type AgentMemory,
  type AgentMemorySummary,
} from './agent-memory';
