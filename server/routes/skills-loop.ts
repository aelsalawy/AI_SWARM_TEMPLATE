/**
 * Skills API Route — Exposes swarm skill endpoints
 *
 * /api/skills/scope-guard/...  — Role boundary checks
 * /api/skills/handoff/...      — Handoff protocol
 * /api/skills/sprint-context/... — Sprint context injection
 * /api/skills/gates/...        — Workflow gate enforcement
 * /api/skills/dependencies/... — Task dependency resolution
 * /api/skills/memory/...       — Per-agent persistent memory
 */

import { Router, Request, Response } from 'express';
import {
  getAllRoleBoundaries,
  getScopeViolations,
  checkScope,
} from '../skills/scope-guard';
import {
  createHandoff,
  acknowledgeHandoff,
  getTaskHandoffs,
  getHandoffTemplates,
} from '../skills/handoff-protocol';
import {
  buildSprintContext,
  formatSprintContext,
} from '../skills/sprint-context';
import {
  getGateRules,
  getGateViolations,
  checkGate,
} from '../skills/workflow-gates';
import {
  addDependency,
  removeDependency,
  checkDependencies,
  getTaskDependencies,
  getBlockingTasks,
} from '../skills/task-dependencies';
import {
  storeMemory,
  getMemory,
  getAgentMemories,
  deleteMemory,
  getMemorySummary,
  formatMemoriesForContext,
} from '../skills/agent-memory';

const router = Router();

// ---------------------------------------------------------------------------
// Scope Guard endpoints
// ---------------------------------------------------------------------------

router.get('/scope-guard/boundaries', (_req: Request, res: Response) => {
  res.json(getAllRoleBoundaries());
});

router.get('/scope-guard/violations', async (req: Request, res: Response) => {
  const agentId = req.query.agentId as string | undefined;
  const violations = await getScopeViolations(agentId);
  res.json(violations);
});

router.post('/scope-guard/check', (req: Request, res: Response) => {
  const { role, action } = req.body;
  if (!role || !action) {
    return res.status(400).json({ message: 'role and action are required' });
  }
  const result = checkScope(role, action);
  res.json(result);
});

// ---------------------------------------------------------------------------
// Handoff Protocol endpoints
// ---------------------------------------------------------------------------

router.get('/handoff/templates', (_req: Request, res: Response) => {
  res.json(getHandoffTemplates());
});

router.get('/handoff/task/:taskId', async (req: Request, res: Response) => {
  const handoffs = await getTaskHandoffs(req.params.taskId);
  res.json(handoffs);
});

router.post('/handoff/create', async (req: Request, res: Response) => {
  const { taskId, fromAgentId, toAgentId, context } = req.body;
  if (!taskId || !fromAgentId || !toAgentId) {
    return res.status(400).json({ message: 'taskId, fromAgentId, and toAgentId are required' });
  }
  const handoff = await createHandoff(taskId, fromAgentId, toAgentId, context);
  if (!handoff) {
    return res.status(500).json({ message: 'Failed to create handoff' });
  }
  res.status(201).json(handoff);
});

router.post('/handoff/:handoffId/acknowledge', async (req: Request, res: Response) => {
  const agentId = (req as any).user?.uid || req.headers['x-agent-id'] as string;
  if (!agentId) {
    return res.status(400).json({ message: 'Agent identity required' });
  }
  const success = await acknowledgeHandoff(req.params.handoffId, agentId);
  if (!success) {
    return res.status(400).json({ message: 'Failed to acknowledge handoff' });
  }
  res.json({ acknowledged: true });
});

// ---------------------------------------------------------------------------
// Sprint Context endpoints
// ---------------------------------------------------------------------------

router.get('/sprint-context/:projectId', async (req: Request, res: Response) => {
  const agentId = req.query.agentId as string | undefined;
  const context = await buildSprintContext(req.params.projectId, agentId);
  res.json(context);
});

router.get('/sprint-context/:projectId/formatted', async (req: Request, res: Response) => {
  const agentId = req.query.agentId as string | undefined;
  const context = await buildSprintContext(req.params.projectId, agentId);
  res.type('text/plain').send(formatSprintContext(context));
});

// ---------------------------------------------------------------------------
// Workflow Gates endpoints
// ---------------------------------------------------------------------------

router.get('/gates/rules', (_req: Request, res: Response) => {
  res.json(getGateRules());
});

router.get('/gates/violations', async (req: Request, res: Response) => {
  const agentId = req.query.agentId as string | undefined;
  const violations = await getGateViolations(agentId);
  res.json(violations);
});

router.post('/gates/check', (req: Request, res: Response) => {
  const { fromStatus, toStatus, agentRole, agentId, taskAssigneeId } = req.body;
  if (!fromStatus || !toStatus || !agentRole) {
    return res.status(400).json({ message: 'fromStatus, toStatus, and agentRole are required' });
  }
  const result = checkGate(fromStatus, toStatus, agentRole, agentId, taskAssigneeId);
  res.json(result);
});

// ---------------------------------------------------------------------------
// Task Dependencies endpoints
// ---------------------------------------------------------------------------

router.get('/dependencies/task/:taskId', async (req: Request, res: Response) => {
  const deps = await getTaskDependencies(req.params.taskId);
  res.json(deps);
});

router.get('/dependencies/blocking/:taskId', async (req: Request, res: Response) => {
  const blocking = await getBlockingTasks(req.params.taskId);
  res.json(blocking);
});

router.get('/dependencies/check/:taskId', async (req: Request, res: Response) => {
  const result = await checkDependencies(req.params.taskId);
  res.json(result);
});

router.post('/dependencies/add', async (req: Request, res: Response) => {
  const { taskId, dependsOnTaskId, type } = req.body;
  if (!taskId || !dependsOnTaskId) {
    return res.status(400).json({ message: 'taskId and dependsOnTaskId are required' });
  }
  const dep = await addDependency(taskId, dependsOnTaskId, type || 'blocks');
  if (!dep) {
    return res.status(500).json({ message: 'Failed to add dependency' });
  }
  res.status(201).json(dep);
});

router.post('/dependencies/remove', async (req: Request, res: Response) => {
  const { taskId, dependsOnTaskId } = req.body;
  if (!taskId || !dependsOnTaskId) {
    return res.status(400).json({ message: 'taskId and dependsOnTaskId are required' });
  }
  const success = await removeDependency(taskId, dependsOnTaskId);
  res.json({ success });
});

// ---------------------------------------------------------------------------
// Agent Memory endpoints
// ---------------------------------------------------------------------------

router.post('/memory/store', async (req: Request, res: Response) => {
  const { agentId, category, key, value, tags, projectId } = req.body;
  if (!agentId || !category || !key || !value) {
    return res.status(400).json({ message: 'agentId, category, key, and value are required' });
  }
  const memory = await storeMemory(agentId, category, key, value, tags, projectId);
  if (!memory) {
    return res.status(500).json({ message: 'Failed to store memory' });
  }
  res.status(201).json(memory);
});

router.get('/memory/:agentId', async (req: Request, res: Response) => {
  const options: any = {};
  if (req.query.category) options.category = req.query.category as string;
  if (req.query.projectId) options.projectId = req.query.projectId as string;
  if (req.query.limit) options.limit = parseInt(req.query.limit as string, 10);

  const memories = await getAgentMemories(req.params.agentId, options);
  res.json(memories);
});

router.get('/memory/:agentId/summary', async (req: Request, res: Response) => {
  const summary = await getMemorySummary(req.params.agentId);
  res.json(summary);
});

router.get('/memory/:agentId/formatted', async (req: Request, res: Response) => {
  const memories = await getAgentMemories(req.params.agentId, { limit: 30 });
  res.type('text/plain').send(formatMemoriesForContext(memories));
});

router.delete('/memory/:memoryId', async (req: Request, res: Response) => {
  const success = await deleteMemory(req.params.memoryId);
  res.json({ success });
});

export default router;
