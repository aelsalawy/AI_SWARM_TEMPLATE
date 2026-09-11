import { Router, Request, Response } from 'express';
import { getPrismaClient } from '../prisma';
import { eventBus } from '../event-bus';
import { dispatchAssignment, cancelAssignment } from '../services/agent-dispatch';
import type { Task, Agent } from '@/lib/types';

const router = Router();
const prisma = getPrismaClient();

// R2-9: normalize incoming tag arrays (trim, drop empties, dedupe case-insensitive, max 12 x 40 chars)
const normalizeTagsInput = (tags: unknown): string[] => {
  if (!Array.isArray(tags)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) {
    if (typeof t !== 'string') continue;
    const trimmed = t.trim().slice(0, 40);
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(trimmed);
    if (out.length >= 12) break;
  }
  return out;
};

// Normalize status labels to Prisma TaskStatus enum values
// (frontend uses 'To Do' / 'In Progress' labels; enum is TODO / IN_PROGRESS / REVIEW / DONE)
const TASK_STATUS_MAP: Record<string, string> = {
  'to do': 'TODO', 'todo': 'TODO',
  'in progress': 'IN_PROGRESS', 'in_progress': 'IN_PROGRESS',
  'review': 'REVIEW',
  'done': 'DONE',
};
function normalizeTaskStatus(status: string): string {
  return TASK_STATUS_MAP[status.toLowerCase()] || status.toUpperCase().replace(' ', '_');
}

// Demo data for when Prisma is not connected
const demoTasks: any[] = [];

// Helper function to check if client is the no-op proxy
function isNoopProxy(client: any): boolean {
  if (!client || !client.task) return true;
  
  // Check if task.create is the no-op proxy function
  try {
    const createFunc = client.task.create.toString();
    return createFunc.includes('const method=String(prop)');
  } catch (e) {
    return true;
  }
}

// GET /api/tasks - list all tasks with optional filters
router.get('/', async (req: Request, res: Response) => {
  try {
    // Check if Prisma is available and not a no-op proxy
    if (isNoopProxy(prisma)) {
      return res.json(demoTasks);
    }

    // Build Prisma query based on filters
    const where: any = {};

    // Apply filters
    if (req.query.status) {
      where.status = normalizeTaskStatus(req.query.status as string);
    }
    if (req.query.assignedAgentId) {
      where.assignedAgentId = req.query.assignedAgentId as string;
    }
    if (req.query.epic) {
      where.epic = req.query.epic as string;
    }
    if (req.query.projectId) {
      where.projectId = req.query.projectId as string;
    }
    if (req.query.sprintId) {
      const sprintId = req.query.sprintId as string;
      // S1 sprint filter: tasks may store either the sprint id (modern) or the
      // sprint name (legacy rows written before id-based FK validation existed,
      // e.g. sprintId='Sprint2' instead of the cuid). Resolve once and accept
      // both so filtering by a sprint actually filters. (ALM bug cmttqsxit000lkclcm8uyduju)
      let sprintName: string | null = null;
      try {
        const sprint = await prisma.sprint.findUnique({ where: { id: sprintId }, select: { name: true } });
        sprintName = sprint?.name ?? null;
      } catch (e) {
        sprintName = null;
      }
      // Column-level match: rows store either the sprint cuid (modern) or the
      // sprint NAME as a raw column value (legacy). A relation-join
      // ({sprint:{name}}) can never match name-stored rows (it joins on
      // sprint.id = task.sprintId), so match the column against both the
      // cuid and the resolved name. (ALM bug cmttqsxit000lkclcm8uyduju)
      where.OR = [{ sprintId }, ...(sprintName && sprintName !== sprintId ? [{ sprintId: sprintName }] : [])];
    }
    if (req.query.release) {
      where.release = req.query.release as string;
    }

    const tasks = await prisma.task.findMany({
      where,
      include: {
        history: true,
        requirements: true,
        sprint: true
      }
    });

    // Convert to the expected format
    const formattedTasks = tasks.map(task => ({
      id: task.id,
      ...task,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      history: task.history || [],
      requirementIds: task.requirements?.map(r => r.id) || [],
      testCaseIds: [] // Not in current schema, keeping for compatibility
    }));

    res.json(formattedTasks);
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ message: 'Failed to fetch tasks' });
  }
});

// GET /api/tasks/:id - get single task with history
router.get('/:id', async (req: Request, res: Response) => {
  try {
    if (isNoopProxy(prisma)) {
      return res.status(404).json({ message: 'Task not found (demo mode)' });
    }

    const task = await prisma.task.findUnique({
      where: { id: req.params.id },
      include: {
        history: true,
        requirements: true,
        sprint: true
      }
    });

    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    const formattedTask = {
      id: task.id,
      ...task,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      history: task.history || [],
      requirementIds: task.requirements?.map(r => r.id) || [],
      testCaseIds: [] // Not in current schema, keeping for compatibility
    };

    res.json(formattedTask);
  } catch (error) {
    console.error('Error fetching task:', error);
    res.status(500).json({ message: 'Failed to fetch task' });
  }
});

// POST /api/tasks - create task
router.post('/', async (req: Request, res: Response) => {
  // Input validation (before Prisma check so 400 works in demo mode)
  const { title, status } = req.body;
  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ message: 'Field "title" is required and must be a non-empty string.' });
  }
  if (status !== undefined && typeof status !== 'string') {
    return res.status(400).json({ message: 'Field "status" must be a string if provided.' });
  }

  try {
    if (isNoopProxy(prisma)) {
      return res.status(503).json({ message: 'Database not connected. Cannot create tasks in demo mode.' });
    }

    // Validate FK references before write — otherwise Prisma throws and client gets an opaque 500
    if (req.body.assignedAgentId) {
      const agent = await prisma.agent.findUnique({ where: { id: req.body.assignedAgentId } });
      if (!agent) {
        return res.status(400).json({ message: `assignedAgentId "${req.body.assignedAgentId}" does not exist.` });
      }
    }
    if (req.body.projectId) {
      const project = await prisma.project.findUnique({ where: { id: req.body.projectId } });
      if (!project) {
        return res.status(400).json({ message: `projectId "${req.body.projectId}" does not exist.` });
      }
    }
    if (req.body.sprintId) {
      const sprint = await prisma.sprint.findUnique({ where: { id: req.body.sprintId } });
      if (!sprint) {
        return res.status(400).json({ message: `sprintId "${req.body.sprintId}" does not exist.` });
      }
    }

    const taskData = {
      ...req.body,
      ...(req.body.status ? { status: normalizeTaskStatus(req.body.status) } : {}),
      ownerId: req.body.ownerId || process.env.DEFAULT_OWNER_ID || undefined,
      projectId: req.body.projectId || process.env.DEFAULT_PROJECT_ID || undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
      history: [],
      comments: [],
      requirementIds: req.body.requirementIds || [],
      testCaseIds: req.body.testCaseIds || [],
      tags: normalizeTagsInput(req.body.tags)
    };
    // Remove undefined fields so Prisma doesn't store null
    Object.keys(taskData).forEach(key => taskData[key] === undefined && delete taskData[key]);

    // Create the task
    const createdTask = await prisma.task.create({
      data: {
        title: taskData.title,
        description: taskData.description,
        status: taskData.status || 'TODO',
        priority: taskData.priority || 'Medium',
        epic: taskData.epic,
        assignedAgentId: taskData.assignedAgentId,
        projectId: taskData.projectId,
        ownerId: taskData.ownerId,
        createdById: taskData.createdBy,
        createdAt: taskData.createdAt,
        updatedAt: taskData.updatedAt,
        tags: taskData.tags,
        sprintId: taskData.sprintId,
        release: typeof taskData.release === 'string' ? taskData.release.trim().slice(0, 40) || undefined : undefined,
      }
    });

    // Create initial history entry
    if (createdTask) {
      await prisma.taskHistory.create({
        data: {
          taskId: createdTask.id,
          field: 'created',
          fromValue: null,
          toValue: 'TODO',
          changedBy: req.body.createdBy || 'system',
          createdAt: new Date()
        }
      });
    }

    // W2 dispatch: route assignment through the centralized helper (G6 parity).
    // pm mode → [ASSIGNMENT-REVIEW] row to PM inbox; direct mode → assignee spawn.
    if (taskData.assignedAgentId) {
      try {
        await dispatchAssignment({
          agentId: taskData.assignedAgentId,
          itemType: 'task',
          itemId: createdTask.id,
          itemTitle: createdTask.title,
        });
      } catch (e) {
        console.warn('[tasks] POST-create dispatch failed (non-fatal):', e);
      }
    }

    // Emit task.created event
    try {
      const taskWithId = { id: createdTask.id, ...taskData };
      eventBus.emitTaskCreated(taskWithId as Task, createdTask.id);
    } catch (e) {
      console.warn('[EventBus] Failed to emit task.created:', e);
    }

    // Create audit log entry
    await prisma.auditLog.create({
      data: {
        action: 'CREATE',
        entityType: 'task',
        entityId: createdTask.id,
        changes: taskData,
        userId: (req as any).user?.uid || req.body.createdBy || 'system'
      }
    });

    const responseTask = {
      id: createdTask.id,
      ...taskData,
      history: [{
        field: 'created',
        from: null,
        to: 'TODO',
        changedBy: req.body.createdBy || 'system',
        timestamp: new Date()
      }],
      requirementIds: taskData.requirementIds || [],
      testCaseIds: taskData.testCaseIds || []
    };

    res.status(201).json(responseTask);
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ message: 'Failed to create task' });
  }
});

// PATCH /api/tasks/:id - update task
router.patch('/:id', async (req: Request, res: Response) => {
  // Input validation (before Prisma check so 400 works in demo mode)
  if (!req.body || Object.keys(req.body).length === 0) {
    return res.status(400).json({ message: 'Request body must contain at least one field to update.' });
  }

  // NEW: Agent scoping - agents can only touch tasks assigned to them
  const isAgentCaller = (req as any).isAgent === true;
  if (isAgentCaller) {
    const callerAgentId = (req as any).user?.uid;
    if (!callerAgentId) {
      return res.status(401).json({ message: 'Unable to determine agent identity' });
    }
    
    // Check if task is assigned to this agent
    const taskToCheck = await prisma.task.findUnique({
      where: { id: req.params.id }
    });
    
    if (!taskToCheck) {
      return res.status(404).json({ message: 'Task not found' });
    }
    
    if (taskToCheck.assignedAgentId !== callerAgentId) {
      return res.status(403).json({ message: 'Forbidden: agents can only update tasks assigned to them' });
    }
    
    // Agents can only transition to IN_PROGRESS or DONE (accept UI labels via map)
    if (req.body.status && !['IN_PROGRESS', 'DONE'].includes(normalizeTaskStatus(req.body.status))) {
      return res.status(403).json({ message: 'Forbidden: agents can only transition tasks to IN_PROGRESS or DONE' });
    }
  }

  try {
    if (isNoopProxy(prisma)) {
      return res.status(503).json({ message: 'Database not connected. Cannot update tasks in demo mode.' });
    }

    // Get current task data
    const currentTask = await prisma.task.findUnique({
      where: { id: req.params.id },
      include: { history: true }
    });

    if (!currentTask) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // Validate FK references before write — otherwise Prisma throws and client gets an opaque 500
    if (req.body.assignedAgentId) {
      const agent = await prisma.agent.findUnique({ where: { id: req.body.assignedAgentId } });
      if (!agent) {
        return res.status(400).json({ message: `assignedAgentId "${req.body.assignedAgentId}" does not exist.` });
      }
    }
    if (req.body.projectId) {
      const project = await prisma.project.findUnique({ where: { id: req.body.projectId } });
      if (!project) {
        return res.status(400).json({ message: `projectId "${req.body.projectId}" does not exist.` });
      }
    }
    if (req.body.sprintId) {
      const sprint = await prisma.sprint.findUnique({ where: { id: req.body.sprintId } });
      if (!sprint) {
        return res.status(400).json({ message: `sprintId "${req.body.sprintId}" does not exist.` });
      }
    }

    const updateData = {
      ...req.body,
      ...(req.body.status ? { status: normalizeTaskStatus(req.body.status) } : {}),
      ...(req.body.tags !== undefined ? { tags: normalizeTagsInput(req.body.tags) } : {}),
      ...(req.body.release !== undefined ? { release: typeof req.body.release === 'string' ? req.body.release.trim().slice(0, 40) || null : null } : {}),
      updatedAt: new Date()
    };

    // Create a lightweight history entry
    const changedFields = Object.keys(req.body).filter(k => k !== 'changedBy');
    const historyEntry = {
      field: changedFields[0] || 'unknown',
      fromValue: currentTask.status || '',
      toValue: updateData.status || '',
      changedBy: req.body.changedBy || 'system',
      createdAt: new Date()
    };

    // Update task with new data
    const updatedTask = await prisma.task.update({
      where: { id: req.params.id },
      data: updateData
    });

    // Update history separately
    await prisma.taskHistory.create({
      data: {
        ...historyEntry,
        task: { connect: { id: req.params.id } }
      }
    });

    // Create audit log entry
    await prisma.auditLog.create({
      data: {
        action: 'UPDATE',
        entityType: 'task',
        entityId: req.params.id,
        changes: updateData,
        userId: req.body.changedBy || 'system'
      }
    });

    // W1 dispatch: route the assignment through the centralized helper (G6 parity).
    // pm mode → [ASSIGNMENT-REVIEW] row to PM inbox; direct mode → assignee spawn.
    if (req.body.assignedAgentId && req.body.assignedAgentId !== currentTask.assignedAgentId) {
      try {
        await dispatchAssignment({
          agentId: req.body.assignedAgentId,
          itemType: 'task',
          itemId: req.params.id,
          itemTitle: updateData.title || currentTask.title,
        });
      } catch (e) {
        console.warn('[tasks] PATCH assign dispatch failed (non-fatal):', e);
      }
    }

    // W3 unassignment: if the task previously had an assignee and it is being removed
    // (set to null) or reassigned to a different agent, cancel the old dispatch row
    // (pmState/wakeState → cancelled) so no stale review/spawn lingers.
    if (currentTask.assignedAgentId && req.body.assignedAgentId !== currentTask.assignedAgentId) {
      try {
        await cancelAssignment({
          agentId: currentTask.assignedAgentId,
          itemType: 'task',
          itemId: req.params.id,
        });
      } catch (e) {
        console.warn('[tasks] PATCH unassign cancel failed (non-fatal):', e);
      }
    }

    const updatedDoc = await prisma.task.findUnique({
      where: { id: req.params.id },
      include: {
        history: true,
        requirements: true,
        sprint: true
      }
    });

    if (!updatedDoc) {
      return res.status(404).json({ message: 'Task not found after update' });
    }

    const updatedData = {
      id: updatedDoc.id,
      ...updatedDoc,
      createdAt: updatedDoc.createdAt,
      updatedAt: updatedDoc.updatedAt,
      history: updatedDoc.history || [],
      requirementIds: updatedDoc.requirements?.map(r => r.id) || [],
      testCaseIds: [] // Not in current schema, keeping for compatibility
    } as Task;

    // Emit task.updated event
    try {
      const prevStatus = currentTask.status;
      const newStatus = req.body.status;
      if (newStatus === 'Done' && prevStatus !== 'Done') {
        eventBus.emitTaskCompleted(updatedData, updatedDoc.id);
      } else {
        eventBus.emitTaskUpdated(updatedData, currentTask as Partial<Task>, updatedDoc.id);
      }
    } catch (e) {
      console.warn('[EventBus] Failed to emit task event:', e);
    }

    res.json(updatedData);
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ message: 'Failed to update task' });
  }
});

// POST /api/tasks/:id/claim - agent claims a task
router.post('/:id/claim', async (req: Request, res: Response) => {
  const { agentId } = req.body;

  if (!agentId || typeof agentId !== 'string') {
    return res.status(400).json({ message: 'Field "agentId" is required and must be a string.' });
  }

  // FIX (T13 #5): an agent-key caller must only be able to claim FOR ITSELF — never
  // spoof a different assignee. Bind body.agentId to the authenticated caller's uid
  // (parity with the PATCH scoping at tasks.ts ~299-326).
  const isAgentCaller = (req as any).isAgent === true;
  if (isAgentCaller) {
    const callerAgentId = (req as any).user?.uid;
    if (!callerAgentId) {
      return res.status(401).json({ message: 'Unable to determine agent identity' });
    }
    if (agentId !== callerAgentId) {
      return res.status(403).json({ message: 'Forbidden: agents can only claim tasks for themselves' });
    }
  }

  try {
    if (isNoopProxy(prisma)) {
      return res.status(503).json({ message: 'Database not connected. Cannot claim tasks in demo mode.' });
    }

    const task = await prisma.task.findUnique({
      where: { id: req.params.id },
      include: { history: true }
    });

    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // FIX (T13 #5): make the check-then-act 409 an ATOMIC conditional update. The old
    // read-then-update let two agents race past the "already assigned" check and both
    // claim. updateMany only transitions rows that are unassigned or already this agent's.
    const claim = await prisma.task.updateMany({
      where: {
        id: req.params.id,
        OR: [{ assignedAgentId: null }, { assignedAgentId: agentId }],
      },
      data: {
        assignedAgentId: agentId,
        status: 'IN_PROGRESS',
        updatedAt: new Date(),
      },
    });
    if (claim.count === 0) {
      return res.status(409).json({ message: 'Task is already assigned to another agent' });
    }

    const updatedTask = await prisma.task.findUnique({ where: { id: req.params.id } });
    if (!updatedTask) {
      return res.status(404).json({ message: 'Task not found after claim' });
    }

    // Add history entry
    await prisma.taskHistory.create({
      data: {
        taskId: req.params.id,
        field: 'status',
        fromValue: 'TODO',
        toValue: 'IN_PROGRESS',
        changedBy: agentId,
        createdAt: new Date()
      }
    });

    // FIX (T13 C5, ALM bug cmttteqlx00cfkclcke192s92): a self-claim must cancel any
    // pending PM-review AgentDispatch row for this item so the sweeper stops chasing it
    // (S1 re-wake / S2 nudge would otherwise keep firing on a now-claimed item). Terminal
    // state per the PmState field: pmState='cancelled' + wakeState='cancelled'.
    try {
      await prisma.agentDispatch.updateMany({
        where: {
          itemType: 'task',
          itemId: req.params.id,
          pmState: { in: ['pending', 'notified'] },
        },
        data: { pmState: 'cancelled', wakeState: 'cancelled', updatedAt: new Date() },
      });
    } catch (e) {
      console.warn('[tasks] claim cancel dispatch row failed (non-fatal):', e);
    }

    const claimedData = {
      id: updatedTask.id,
      ...updatedTask,
      createdAt: updatedTask.createdAt,
      updatedAt: updatedTask.updatedAt,
      history: [...(task.history || []), {
        field: 'status',
        from: 'TODO',
        to: 'IN_PROGRESS',
        changedBy: agentId,
        timestamp: new Date()
      }],
      requirementIds: [],
      testCaseIds: []
    } as Task;

    // Emit task.claimed event
    try {
      eventBus.emitTaskClaimed(claimedData, agentId, req.params.id);
    } catch (e) {
      console.warn('[EventBus] Failed to emit task.claimed:', e);
    }

    res.json(claimedData);
  } catch (error: any) {
    if (error.message === 'NOT_FOUND') {
      return res.status(404).json({ message: 'Task not found' });
    }
    if (error.message === 'ALREADY_ASSIGNED') {
      return res.status(409).json({ message: 'Task is already assigned to another agent' });
    }
    console.error('Error claiming task:', error);
    res.status(500).json({ message: 'Failed to claim task' });
  }
});

// POST /api/tasks/:id/release - agent releases a task
router.post('/:id/release', async (req: Request, res: Response) => {
  const { agentId } = req.body;

  if (!agentId || typeof agentId !== 'string') {
    return res.status(400).json({ message: 'Field "agentId" is required and must be a string.' });
  }

  try {
    if (isNoopProxy(prisma)) {
      return res.status(503).json({ message: 'Database not connected. Cannot release tasks in demo mode.' });
    }

    const task = await prisma.task.findUnique({
      where: { id: req.params.id },
      include: { history: true }
    });

    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    const updatedTask = await prisma.task.update({
      where: { id: req.params.id },
      data: {
        assignedAgentId: null,
        status: 'TODO',
        updatedAt: new Date()
      }
    });

    // Add history entry
    await prisma.taskHistory.create({
      data: {
        taskId: req.params.id,
        field: 'status',
        fromValue: 'IN_PROGRESS',
        toValue: 'TODO',
        changedBy: agentId,
        createdAt: new Date()
      }
    });

    const releasedData = {
      id: updatedTask.id,
      ...updatedTask,
      createdAt: updatedTask.createdAt,
      updatedAt: updatedTask.updatedAt,
      history: [...(task.history || []), {
        field: 'status',
        from: 'IN_PROGRESS',
        to: 'TODO',
        changedBy: agentId,
        timestamp: new Date()
      }],
      requirementIds: [],
      testCaseIds: []
    } as Task;

    // Emit task.updated event (back to To Do)
    try {
      eventBus.emitTaskUpdated(releasedData, { status: 'In Progress' }, req.params.id);
    } catch (e) {
      console.warn('[EventBus] Failed to emit task.updated:', e);
    }

    res.json(releasedData);
  } catch (error) {
    console.error('Error releasing task:', error);
    res.status(500).json({ message: 'Failed to release task' });
  }
});

// DELETE /api/tasks/:id - delete task
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    if (isNoopProxy(prisma)) {
      return res.status(503).json({ message: 'Database not connected. Cannot delete tasks in demo mode.' });
    }

    const task = await prisma.task.findUnique({
      where: { id: req.params.id }
    });

    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // Delete related records first (no cascade in schema)
    await prisma.taskHistory.deleteMany({ where: { taskId: req.params.id } });
    await prisma.taskComment.deleteMany({ where: { taskId: req.params.id } });
    await prisma.requirementTask.deleteMany({ where: { taskId: req.params.id } });
    // FIX (cmttteqyj00cjkclc8txq1qkq): cascade AgentDispatch rows for this task so
    // deleting a task does not leave orphaned dispatch rows (which would otherwise
    // keep the sweeper re-waking a dead item). itemType matches agent-dispatch.ts
    // (fetchItem/dispatchAssignment use 'task'). We do NOT clean the assignee's
    // inbox [ASSIGNMENT] messages here — the sweeper handles orphaned rows.
    await prisma.agentDispatch.deleteMany({ where: { itemType: 'task', itemId: req.params.id } });

    // Delete the task
    await prisma.task.delete({
      where: { id: req.params.id }
    });

    // Create audit log entry
    await prisma.auditLog.create({
      data: {
        action: 'DELETE',
        entityType: 'task',
        entityId: req.params.id,
        changes: task,
        userId: 'system'
      }
    });

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ message: 'Failed to delete task' });
  }
});

// GET /api/tasks/:id/comments - list comments for a task
router.get('/:id/comments', async (req: Request, res: Response) => {
  try {
    if (isNoopProxy(prisma)) {
      return res.json([]);
    }

    const task = await prisma.task.findUnique({
      where: { id: req.params.id }
    });

    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    const comments = await prisma.taskComment.findMany({
      where: { taskId: req.params.id },
      orderBy: { createdAt: 'asc' }
    });

    const formattedComments = comments.map(comment => ({
      id: comment.id,
      text: comment.body,
      authorId: comment.authorId,
      authorName: comment.authorName,
      authorEmoji: comment.authorEmoji,
      createdAt: comment.createdAt
    }));

    res.json(formattedComments);
  } catch (error) {
    console.error('Error fetching task comments:', error);
    res.status(500).json({ message: 'Failed to fetch comments' });
  }
});

// POST /api/tasks/:id/comments - add a comment to a task
router.post('/:id/comments', async (req: Request, res: Response) => {
  const { text, authorId, authorName, authorEmoji } = req.body;
  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ message: 'Field "text" is required and must be a non-empty string.' });
  }
  if (!authorId || typeof authorId !== 'string') {
    return res.status(400).json({ message: 'Field "authorId" is required and must be a string.' });
  }
  if (!authorName || typeof authorName !== 'string') {
    return res.status(400).json({ message: 'Field "authorName" is required and must be a string.' });
  }

  try {
    if (isNoopProxy(prisma)) {
      return res.status(503).json({ message: 'Database not connected. Cannot add comments in demo mode.' });
    }

    const task = await prisma.task.findUnique({
      where: { id: req.params.id }
    });

    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    const commentData = {
      body: text.trim(),
      authorId,
      authorName,
      authorEmoji: authorEmoji || null,
      taskId: req.params.id,
      createdAt: new Date()
    };

    const createdComment = await prisma.taskComment.create({
      data: commentData
    });

    await prisma.auditLog.create({
      data: {
        action: 'CREATE_COMMENT',
        entityType: 'task_comment',
        entityId: createdComment.id,
        changes: commentData,
        userId: authorId
      }
    });

    res.status(201).json({
      id: createdComment.id,
      text: createdComment.body,
      authorId: createdComment.authorId,
      authorName: createdComment.authorName,
      authorEmoji: createdComment.authorEmoji,
      createdAt: createdComment.createdAt
    });
  } catch (error) {
    console.error('Error adding task comment:', error);
    res.status(500).json({ message: 'Failed to add comment' });
  }
});

// GET /api/tasks/:id/history - list history entries for a task
router.get('/:id/history', async (req: Request, res: Response) => {
  try {
    if (isNoopProxy(prisma)) {
      return res.json([]);
    }

    const task = await prisma.task.findUnique({
      where: { id: req.params.id }
    });

    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    const history = await prisma.taskHistory.findMany({
      where: { taskId: req.params.id },
      orderBy: { createdAt: 'desc' }
    });

    res.json(history);
  } catch (error) {
    console.error('Error fetching task history:', error);
    res.status(500).json({ message: 'Failed to fetch history' });
  }
});

// GET /api/tasks/:id/requirements - list linked requirements for a task
router.get('/:id/requirements', async (req: Request, res: Response) => {
  try {
    if (isNoopProxy(prisma)) {
      return res.json([]);
    }

    const task = await prisma.task.findUnique({
      where: { id: req.params.id }
    });

    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // Get requirements via the old taskId field
    const directReqs = await prisma.requirement.findMany({
      where: { taskId: req.params.id }
    });

    // Get requirements via the many-to-many table
    const linkedReqs = await prisma.requirementTask.findMany({
      where: { taskId: req.params.id },
      include: { requirement: true }
    });

    const allReqs = [
      ...directReqs.map(r => ({ id: r.id, title: r.title, status: r.status, linkType: 'direct' })),
      ...linkedReqs.map(lt => ({ id: lt.requirement.id, title: lt.requirement.title, status: lt.requirement.status, linkType: 'm2m' }))
    ];

    // Deduplicate by id
    const seen = new Set();
    const unique = allReqs.filter(r => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });

    res.json(unique);
  } catch (error) {
    console.error('Error fetching task requirements:', error);
    res.status(500).json({ message: 'Failed to fetch requirements' });
  }
});

export default router;