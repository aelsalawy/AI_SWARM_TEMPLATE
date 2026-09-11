import { Router, Request, Response } from 'express';
import { getPrismaClient } from '../prisma';
import { dispatchAssignment, cancelAssignment } from '../services/agent-dispatch';

const router = Router();
const prisma = getPrismaClient();

// Helper function to check if client is the no-op proxy
function isNoopProxy(client: any): boolean {
  if (!client || !client.agent) return true;
  try {
    const createFunc = client.agent.create.toString();
    return createFunc.includes('const method=String(prop)');
  } catch (e) {
    return true;
  }
}

// GET /api/agents - list all agents with status (includes email via raw SQL)
router.get('/', async (_req: Request, res: Response) => {
  try {
    if (isNoopProxy(prisma)) {
      return res.json([]);
    }

    // Use raw SQL to ensure email field is always included
    let agents: any[];
    try {
      agents = await prisma.$queryRawUnsafe(`
        SELECT id, name, email, emoji, role, status, "ownerId", "activeTasks",
               "completionRate", skills, model, tags, "createdAt", "updatedAt"
        FROM agents
        ORDER BY "createdAt" DESC
      `);
    } catch (rawErr) {
      // Fallback to Prisma client if raw SQL fails
      agents = await prisma.agent.findMany({
        orderBy: { createdAt: 'desc' }
      });
    }

    res.json(agents);
  } catch (error) {
    console.error('Error fetching agents:', error);
    res.status(500).json({ message: 'Failed to fetch agents' });
  }
});

// GET /api/agents/workload - workload summary for the dashboard
// NOTE: must be registered before GET /:id so "workload" is not treated as an id.
router.get('/workload', async (_req: Request, res: Response) => {
  try {
    if (isNoopProxy(prisma)) {
      return res.json({
        demoMode: true,
        agents: [],
        summary: {
          totalAgents: 0,
          statusBreakdown: { online: 0, busy: 0, idle: 0, offline: 0 },
          totalActiveTasks: 0,
          unassignedActiveTasks: 0,
        },
      });
    }

    const agents = await prisma.agent.findMany({ orderBy: { createdAt: 'desc' } });

    // Task counts per agent, broken down by task status
    const groupRows: any[] = await prisma.task.groupBy({
      by: ['assignedAgentId', 'status'],
      _count: { _all: true },
      where: { assignedAgentId: { not: null } },
    });

    // Open (non-DONE) tasks currently assigned = active assignments
    const openTasks = await prisma.task.findMany({
      where: { assignedAgentId: { not: null }, status: { not: 'DONE' } },
      select: { id: true, title: true, status: true, priority: true, assignedAgentId: true },
    });

    const countsByAgent = new Map<string, Record<string, number>>();
    for (const row of groupRows) {
      const agentId = row.assignedAgentId as string;
      if (!agentId) continue;
      if (!countsByAgent.has(agentId)) countsByAgent.set(agentId, {});
      countsByAgent.get(agentId)![row.status] = row._count._all;
    }

    const openByAgent = new Map<string, any[]>();
    for (const t of openTasks) {
      if (!t.assignedAgentId) continue;
      if (!openByAgent.has(t.assignedAgentId)) openByAgent.set(t.assignedAgentId, []);
      openByAgent.get(t.assignedAgentId)!.push({ id: t.id, title: t.title, status: t.status, priority: t.priority });
    }

    const statusBreakdown: Record<string, number> = { online: 0, busy: 0, idle: 0, offline: 0 };
    const workloadAgents = agents.map((a: any) => {
      const taskCounts = countsByAgent.get(a.id) || {};
      const totalTasks = Object.values(taskCounts).reduce((sum: number, n) => sum + (n as number), 0);
      if (statusBreakdown[a.status] !== undefined) statusBreakdown[a.status] += 1;
      const assignments = openByAgent.get(a.id) || [];
      return {
        id: a.id,
        name: a.name,
        role: a.role,
        emoji: a.emoji,
        status: a.status,
        currentTaskId: a.currentTaskId || (assignments[0]?.id ?? null),
        lastHeartbeat: a.lastHeartbeat,
        activeTasks: assignments.length,
        totalTasks,
        taskCounts,
        currentAssignments: assignments,
      };
    });

    const unassignedActiveTasks = await prisma.task.count({
      where: { assignedAgentId: null, status: { not: 'DONE' } },
    });

    res.json({
      agents: workloadAgents,
      summary: {
        totalAgents: agents.length,
        statusBreakdown,
        totalActiveTasks: openTasks.length,
        unassignedActiveTasks,
      },
    });
  } catch (error) {
    console.error('Error computing agent workload:', error);
    res.status(500).json({ message: 'Failed to compute agent workload' });
  }
});

// GET /api/agents/telemetry/summary - last 24h request counts + avg latency per agent (R2-8)
// NOTE: registered before GET /:id so "telemetry" is not treated as an id.
router.get('/telemetry/summary', async (_req: Request, res: Response) => {
  try {
    if (isNoopProxy(prisma)) {
      return res.json({ windowHours: 24, agents: [] });
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000); // last 24h

    const rows: any[] = await prisma.agentTelemetry.groupBy({
      by: ['agentId'],
      _count: { _all: true },
      _avg: { latencyMs: true },
      where: { createdAt: { gte: since } },
    });

    // Attach agent names for a friendlier report.
    const agentIds = rows.map((r: any) => r.agentId);
    let nameMap: Record<string, string> = {};
    if (agentIds.length > 0) {
      const agents = await prisma.agent.findMany({
        where: { id: { in: agentIds } },
        select: { id: true, name: true },
      });
      nameMap = Object.fromEntries((agents as any[]).map((a) => [a.id, a.name]));
    }

    res.json({
      windowHours: 24,
      windowStart: since.toISOString(),
      agents: rows.map((r: any) => ({
        agentId: r.agentId,
        name: nameMap[r.agentId] || null,
        requestCount: r._count._all,
        avgLatencyMs: r._avg.latencyMs !== null ? Math.round(r._avg.latencyMs) : 0,
      })),
    });
  } catch (error) {
    console.error('Error computing telemetry summary:', error);
    res.status(500).json({ message: 'Failed to compute telemetry summary' });
  }
});

// GET /api/agents/liveness - agent liveness report
// Each agent's last-seen timestamp (lastHeartbeat) with computed status:
//   live    -> lastHeartbeat within 15 minutes
//   stale   -> lastHeartbeat present but older than 15 minutes
//   offline -> no lastHeartbeat recorded
// NOTE: registered before GET /:id so "liveness" is not treated as an id.
router.get('/liveness', async (_req: Request, res: Response) => {
  const STALE_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes
  try {
    if (isNoopProxy(prisma)) {
      return res.json({ thresholdMs: STALE_THRESHOLD_MS, agents: [] });
    }

    const agents: any[] = await prisma.agent.findMany({
      select: {
        id: true,
        name: true,
        emoji: true,
        role: true,
        status: true,
        lastHeartbeat: true,
      },
    });

    const now = Date.now();
    const agentsReport = agents.map((a: any) => {
      let status: 'live' | 'stale' | 'offline' = 'offline';
      let lastSeenAt: string | null = null;
      if (a.lastHeartbeat) {
        lastSeenAt = new Date(a.lastHeartbeat).toISOString();
        const ageMs = now - new Date(a.lastHeartbeat).getTime();
        status = ageMs <= STALE_THRESHOLD_MS ? 'live' : 'stale';
      }
      return {
        id: a.id,
        name: a.name,
        emoji: a.emoji,
        role: a.role,
        status: a.status,
        liveness: status,
        lastSeenAt,
      };
    });

    res.json({
      thresholdMs: STALE_THRESHOLD_MS,
      generatedAt: new Date().toISOString(),
      agents: agentsReport,
    });
  } catch (error) {
    console.error('Error computing agent liveness:', error);
    res.status(500).json({ message: 'Failed to compute agent liveness' });
  }
});

// GET /api/agents/:id - get agent detail
router.get('/:id', async (req: Request, res: Response) => {
  try {
    if (isNoopProxy(prisma)) {
      return res.status(404).json({ message: 'Agent not found (demo mode)' });
    }

    const agent = await prisma.agent.findUnique({
      where: { id: req.params.id }
    });

    if (!agent) {
      return res.status(404).json({ message: 'Agent not found' });
    }

    res.json(agent);
  } catch (error) {
    console.error('Error fetching agent:', error);
    res.status(500).json({ message: 'Failed to fetch agent' });
  }
});

// POST /api/agents - create agent
router.post('/', async (req: Request, res: Response) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ message: 'Field "name" is required and must be a non-empty string.' });
  }

  try {
    if (isNoopProxy(prisma)) {
      return res.status(503).json({ message: 'Database not connected. Cannot create agents in demo mode.' });
    }

    const agentData = {
      name: name.trim(),
      emoji: req.body.emoji || null,
      role: req.body.role || null,
      status: req.body.status || 'offline',
      ownerId: req.body.ownerId || process.env.DEFAULT_OWNER_ID || '',
      activeTasks: req.body.activeTasks || 0,
      completionRate: req.body.completionRate || 0,
      skills: req.body.skills || [],
      model: req.body.model || null,
      tags: Array.isArray(req.body.tags) ? req.body.tags : [],
    };

    const createdAgent = await prisma.agent.create({
      data: agentData
    });

    res.status(201).json(createdAgent);
  } catch (error) {
    console.error('Error creating agent:', error);
    res.status(500).json({ message: 'Failed to create agent' });
  }
});

// PATCH /api/agents/:id - update agent (heartbeat, status)
router.patch('/:id', async (req: Request, res: Response) => {
  if (!req.body || Object.keys(req.body).length === 0) {
    return res.status(400).json({ message: 'Request body must contain at least one field to update.' });
  }

  try {
    if (isNoopProxy(prisma)) {
      return res.status(503).json({ message: 'Database not connected. Cannot update agents in demo mode.' });
    }

    const existing = await prisma.agent.findUnique({
      where: { id: req.params.id }
    });

    if (!existing) {
      return res.status(404).json({ message: 'Agent not found' });
    }

    const updateData = {
      ...req.body,
      updatedAt: new Date()
    };

    const updatedAgent = await prisma.agent.update({
      where: { id: req.params.id },
      data: updateData
    });

    res.json(updatedAgent);
  } catch (error) {
    console.error('Error updating agent:', error);
    res.status(500).json({ message: 'Failed to update agent' });
  }
});

// PATCH /api/agents/:id/status - update agent status (online/idle/busy/offline)
router.patch('/:id/status', async (req: Request, res: Response) => {
  const { status } = req.body || {};
  const validStatuses = ['online', 'idle', 'busy', 'offline'];

  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({ message: `Field "status" is required and must be one of: ${validStatuses.join(', ')}.` });
  }

  try {
    if (isNoopProxy(prisma)) {
      return res.status(503).json({ message: 'Database not connected. Cannot update agent status in demo mode.' });
    }

    const existing = await prisma.agent.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ message: 'Agent not found' });
    }

    const updatedAgent = await prisma.agent.update({
      where: { id: req.params.id },
      data: {
        status,
        lastHeartbeat: new Date(),
        updatedAt: new Date(),
      },
    });

    res.json({ success: true, data: updatedAgent });
  } catch (error) {
    console.error('Error updating agent status:', error);
    res.status(500).json({ message: 'Failed to update agent status' });
  }
});

// POST /api/agents/:id/heartbeat - agent heartbeat (R2-6)
// Stamps agent.lastHeartbeat (drives liveness) and updates status.
// Agent-key auth (x-agent-key + x-agent-id) is enforced by the global /api middleware;
// when the authenticated identity is an agent, it may only report its own heartbeat.
router.post('/:id/heartbeat', async (req: Request, res: Response) => {
  const { status, currentTaskId, metadata } = req.body || {};

  if (!status || !['online', 'offline', 'busy'].includes(status)) {
    return res.status(400).json({ message: 'Field "status" is required and must be "online", "offline", or "busy".' });
  }

  try {
    if (isNoopProxy(prisma)) {
      return res.status(503).json({ message: 'Database not connected. Cannot process heartbeat in demo mode.' });
    }

    const agentId = req.params.id;

    // Agent-key auth: if the caller is an agent, require it to be reporting for itself.
    const isAgentCaller = (req as any).isAgent === true;
    if (isAgentCaller) {
      const callerId = (req as any).user?.agentId || (req as any).user?.uid || (req as any).user?.userId;
      if (callerId && callerId !== agentId && callerId !== `agent:${agentId}`) {
        return res.status(403).json({ message: 'Forbidden: agent may only report its own heartbeat.' });
      }
    }

    const existing = await prisma.agent.findUnique({
      where: { id: agentId }
    });

    if (!existing) {
      return res.status(404).json({ message: 'Agent not found' });
    }

    const now = new Date();
    const updateData: Record<string, any> = {
      status,
      lastHeartbeat: now,
      updatedAt: now,
    };

    if (currentTaskId !== undefined) {
      updateData.currentTaskId = currentTaskId || null;
    }

    if (metadata !== undefined) {
      updateData.metadata = metadata;
    }

    const updatedAgent = await prisma.agent.update({
      where: { id: agentId },
      data: updateData
    });

    res.json({
      success: true,
      lastHeartbeat: now,
      data: updatedAgent
    });
  } catch (error) {
    console.error('Error processing heartbeat:', error);
    res.status(500).json({ message: 'Failed to process heartbeat' });
  }
});

// POST /api/agents/:id/assign/:taskId - assign a task to an agent
// Sets agent status to "busy", stamps agent.currentTaskId, and sets task.assignedAgentId.
router.post('/:id/assign/:taskId', async (req: Request, res: Response) => {
  try {
    if (isNoopProxy(prisma)) {
      return res.status(503).json({ message: 'Database not connected. Cannot assign tasks in demo mode.' });
    }

    const agent = await prisma.agent.findUnique({ where: { id: req.params.id } });
    if (!agent) {
      return res.status(404).json({ message: 'Agent not found' });
    }

    const task = await prisma.task.findUnique({ where: { id: req.params.taskId } });
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    const [updatedTask, updatedAgent] = await prisma.$transaction([
      prisma.task.update({
        where: { id: task.id },
        data: { assignedAgentId: agent.id, updatedAt: new Date() },
      }),
      prisma.agent.update({
        where: { id: agent.id },
        data: {
          status: 'busy',
          currentTaskId: task.id,
          lastHeartbeat: new Date(),
          updatedAt: new Date(),
        },
      }),
    ]);

    // W4 dispatch: route the assignment through the centralized helper (G6 parity).
    // pm mode → [ASSIGNMENT-REVIEW] row to PM inbox; direct mode → assignee spawn.
    try {
      await dispatchAssignment({
        agentId: agent.id,
        itemType: 'task',
        itemId: task.id,
        itemTitle: task.title,
      });
    } catch (e) {
      console.warn('[agents] assign dispatch failed (non-fatal):', e);
    }

    res.json({ success: true, data: { task: updatedTask, agent: updatedAgent } });
  } catch (error) {
    console.error('Error assigning task to agent:', error);
    res.status(500).json({ message: 'Failed to assign task to agent' });
  }
});

// POST /api/agents/:id/unassign/:taskId - unassign a task from an agent
// Clears task.assignedAgentId; if it was the agent's current task, clears currentTaskId and sets status to "idle".
router.post('/:id/unassign/:taskId', async (req: Request, res: Response) => {
  try {
    if (isNoopProxy(prisma)) {
      return res.status(503).json({ message: 'Database not connected. Cannot unassign tasks in demo mode.' });
    }

    const agent = await prisma.agent.findUnique({ where: { id: req.params.id } });
    if (!agent) {
      return res.status(404).json({ message: 'Agent not found' });
    }

    const task = await prisma.task.findUnique({ where: { id: req.params.taskId } });
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    if (task.assignedAgentId && task.assignedAgentId !== agent.id) {
      return res.status(409).json({ message: 'Task is assigned to a different agent' });
    }

    const [updatedTask, updatedAgent] = await prisma.$transaction([
      prisma.task.update({
        where: { id: task.id },
        data: { assignedAgentId: null, updatedAt: new Date() },
      }),
      prisma.agent.update({
        where: { id: agent.id },
        data: {
          status: 'idle',
          currentTaskId: agent.currentTaskId === task.id ? null : agent.currentTaskId,
          lastHeartbeat: new Date(),
          updatedAt: new Date(),
        },
      }),
    ]);

    // Unassignment: cancel the dispatch row (pmState/wakeState → cancelled) so no
    // stale review/spawn lingers for this (agent, task) pair.
    try {
      await cancelAssignment({
        agentId: agent.id,
        itemType: 'task',
        itemId: task.id,
      });
    } catch (e) {
      console.warn('[agents] unassign cancel failed (non-fatal):', e);
    }

    res.json({ success: true, data: { task: updatedTask, agent: updatedAgent } });
  } catch (error) {
    console.error('Error unassigning task from agent:', error);
    res.status(500).json({ message: 'Failed to unassign task from agent' });
  }
});

// DELETE /api/agents/:id - delete agent
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    if (isNoopProxy(prisma)) {
      return res.status(503).json({ message: 'Database not connected. Cannot delete agents in demo mode.' });
    }

    const existing = await prisma.agent.findUnique({
      where: { id: req.params.id }
    });

    if (!existing) {
      return res.status(404).json({ message: 'Agent not found' });
    }

    await prisma.agent.delete({
      where: { id: req.params.id }
    });

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting agent:', error);
    res.status(500).json({ message: 'Failed to delete agent' });
  }
});

export default router;
