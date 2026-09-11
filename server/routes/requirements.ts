import { Router, Request, Response } from 'express';
import { getPrismaClient } from '../prisma';

const router = Router();
const prisma = getPrismaClient();

// UI-only fields that must never reach Prisma create/update data (no DB columns).
// Spreading req.body with these keys makes the payload match neither the checked
// (CreateInput) nor unchecked (UncheckedCreateInput) variant → validation error.
const REQ_UI_ONLY_FIELDS = ['createdBy', 'type', 'changedBy', 'id', 'createdAt', 'updatedAt', 'sprint', 'project', 'task', 'tasks', 'bugs'] as const;
function stripUiOnly(body: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!body) return {};
  const out = { ...body };
  for (const f of REQ_UI_ONLY_FIELDS) delete out[f];
  return out;
}

// Demo data for when Prisma is not connected
const demoRequirements: any[] = [];

// Helper function to check if client is the no-op proxy
function isNoopProxy(client: any): boolean {
  if (!client || !client.requirement) return true;

  // Check if requirement.create is the no-op proxy function
  try {
    const createFunc = client.requirement.create.toString();
    // Check for both possible no-op proxy signatures
    return createFunc.includes('const method=String(prop)') ||
           createFunc.includes('Database unavailable') ||
           createFunc.includes('Prisma not initialized');
  } catch (e) {
    return true;
  }
}

// GET /api/requirements - list all requirements
router.get('/', async (req: Request, res: Response) => {
  console.error('=== REQUIREMENTS ROUTE CALLED ===');
  console.error('=== REQUIREMENTS ROUTE CALLED ===');
  console.log('[Requirements] Route handler called');
  console.log('[Requirements] Query params:', JSON.stringify(req.query));
  try {
    // Check if Prisma is available and not a no-op proxy
    if (isNoopProxy(prisma)) {
      console.log('[Requirements] Prisma not available, returning demo data');
      return res.json(demoRequirements);
    }

    // Build Prisma query based on filters - with defensive checks
    const where: any = {};
    const query = req.query || {}; // Defensive: ensure query exists

    // Apply filters
    if (query.status) {
      where.status = query.status as string;
    }
    if (query.ownerId) {
      where.ownerId = query.ownerId as string;
    }
    if (query.projectId) {
      where.projectId = query.projectId as string;
    }
    if (query.sprintId) {
      where.sprintId = query.sprintId as string;
    }
    if (query.release) {
      where.release = query.release as string;
    }

    console.log('[Requirements] Query where clause:', JSON.stringify(where, null, 2));
    
    // First try without include to isolate the issue
    console.log('[Requirements] About to run query without include...');
    const requirements = await prisma.requirement.findMany({
      where,
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        taskId: true,
        ownerId: true,
        projectId: true,
        sprintId: true,
        release: true,
        createdAt: true,
        updatedAt: true
      }
    });
    console.log('[Requirements] Query successful, found:', requirements.length, 'requirements');

    // Convert to the expected format
    const formattedRequirements = requirements.map(req => ({
      id: req.id,
      title: req.title,
      description: req.description,
      status: req.status,
      taskId: req.taskId,
      ownerId: req.ownerId,
      projectId: req.projectId,
      sprintId: req.sprintId,
      release: req.release,
      createdAt: req.createdAt,
      updatedAt: req.updatedAt
    }));

    res.json(formattedRequirements);
  } catch (error: any) {
    console.error('[Requirements] Error fetching requirements:', error);
    console.error('[Requirements] Error message:', error.message);
    console.error('[Requirements] Error code:', error.code);
    console.error('[Requirements] Error meta:', JSON.stringify(error.meta, null, 2));
    res.status(500).json({ message: 'Failed to fetch requirements', error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// POST /api/requirements - create requirement
router.post('/', async (req: Request, res: Response) => {
  // Input validation (before Prisma check so 400 works in demo mode)
  const { title, description } = req.body;
  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ message: 'Field "title" is required and must be a non-empty string.' });
  }
  if (description !== undefined && typeof description !== 'string') {
    return res.status(400).json({ message: 'Field "description" must be a string if provided.' });
  }
  
  try {
    // Check if Prisma is actually initialized by trying to access a property
    const isActuallyNoop = !prisma.requirement || prisma.requirement.create.toString().includes('const method=String(prop)');
    
    if (isActuallyNoop) {
      // Try to get the Prisma client again in case it's initialized now
      const freshPrisma = getPrismaClient();
      const isStillNoop = !freshPrisma.requirement || freshPrisma.requirement.create.toString().includes('const method=String(prop)');
      
      if (isStillNoop) {
        return res.status(503).json({ message: 'Database not connected. Cannot create requirements in demo mode.' });
      }
      // Use the fresh Prisma client
      if (req.body.sprintId) {
        const sprint = await prisma.sprint.findUnique({ where: { id: req.body.sprintId } });
        if (!sprint) {
          return res.status(400).json({ message: `sprintId "${req.body.sprintId}" does not exist.` });
        }
      }
      const requirementData = {
        ...stripUiOnly(req.body),
        title: title.trim(),
        description: description?.trim() || null,
        ownerId: req.body.ownerId || process.env.DEFAULT_OWNER_ID || undefined,
        projectId: req.body.projectId || process.env.DEFAULT_PROJECT_ID || undefined,
        status: req.body.status || 'Pending',
        taskId: req.body.taskId || null,
        release: typeof req.body.release === 'string' ? req.body.release.trim().slice(0, 40) || undefined : undefined,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      // Remove undefined fields so Prisma doesn't store null
      Object.keys(requirementData).forEach(key => requirementData[key] === undefined && delete requirementData[key]);

      const createdRequirement = await freshPrisma.requirement.create({
        data: requirementData
      });

      res.status(201).json({
        id: createdRequirement.id,
        ...requirementData
      });
    } else {
      // Use the original Prisma client
      const requirementData = {
        ...stripUiOnly(req.body),
        title: title.trim(),
        description: description?.trim() || null,
        ownerId: req.body.ownerId || process.env.DEFAULT_OWNER_ID || undefined,
        projectId: req.body.projectId || process.env.DEFAULT_PROJECT_ID || undefined,
        status: req.body.status || 'Pending',
        taskId: req.body.taskId || null,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      // Remove undefined fields so Prisma doesn't store null
      Object.keys(requirementData).forEach(key => requirementData[key] === undefined && delete requirementData[key]);

      const createdRequirement = await prisma.requirement.create({
        data: requirementData
      });

      res.status(201).json({
        id: createdRequirement.id,
        ...requirementData
      });
    }
  } catch (error) {
    console.error('Error creating requirement:', error);
    res.status(500).json({ message: 'Failed to create requirement' });
  }
});

// PATCH /api/requirements/:id - update requirement
router.patch('/:id', async (req: Request, res: Response) => {
  // Input validation (before Prisma check so 400 works in demo mode)
  if (!req.body || Object.keys(req.body).length === 0) {
    return res.status(400).json({ message: 'Request body must contain at least one field to update.' });
  }

  try {
    if (isNoopProxy(prisma)) {
      return res.status(503).json({ message: 'Database not connected. Cannot update requirements in demo mode.' });
    }

    // Get current requirement data
    const currentRequirement = await prisma.requirement.findUnique({
      where: { id: req.params.id }
    });

    if (!currentRequirement) {
      return res.status(404).json({ message: 'Requirement not found' });
    }

    if (req.body.sprintId) {
      const sprint = await prisma.sprint.findUnique({ where: { id: req.body.sprintId } });
      if (!sprint) {
        return res.status(400).json({ message: `sprintId "${req.body.sprintId}" does not exist.` });
      }
    }

    const updateData = {
      ...stripUiOnly(req.body),
      ...(req.body.release !== undefined ? { release: typeof req.body.release === 'string' ? req.body.release.trim().slice(0, 40) || null : null } : {}),
      updatedAt: new Date()
    };

    const updatedRequirement = await prisma.requirement.update({
      where: { id: req.params.id },
      data: updateData
    });

    res.json({
      id: updatedRequirement.id,
      ...updatedRequirement
    });
  } catch (error) {
    console.error('Error updating requirement:', error);
    res.status(500).json({ message: 'Failed to update requirement' });
  }
});

// GET /api/requirements/:id/tasks - list linked tasks
router.get('/:id/tasks', async (req: Request, res: Response) => {
  try {
    if (isNoopProxy(prisma)) {
      return res.json([]);
    }

    const requirement = await prisma.requirement.findUnique({
      where: { id: req.params.id }
    });

    if (!requirement) {
      return res.status(404).json({ message: 'Requirement not found' });
    }

    // Get tasks via the old taskId field (direct link)
    const directTask = requirement.taskId ? await prisma.task.findUnique({
      where: { id: requirement.taskId }
    }) : null;

    // Get tasks via the many-to-many table
    const linkedTasks = await prisma.requirementTask.findMany({
      where: { requirementId: req.params.id },
      include: { task: true }
    });

    const allTasks = [
      ...(directTask ? [{ id: directTask.id, title: directTask.title, status: directTask.status, priority: directTask.priority, linkType: 'direct' }] : []),
      ...linkedTasks.map(lt => ({ id: lt.task.id, title: lt.task.title, status: lt.task.status, priority: lt.task.priority, linkType: 'm2m' }))
    ];

    // Deduplicate by id
    const seen = new Set();
    const unique = allTasks.filter(t => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });

    res.json(unique);
  } catch (error) {
    console.error('Error fetching requirement tasks:', error);
    res.status(500).json({ message: 'Failed to fetch tasks' });
  }
});

// POST /api/requirements/:id/tasks - link a task to a requirement
router.post('/:id/tasks', async (req: Request, res: Response) => {
  const { taskId } = req.body;
  if (!taskId || typeof taskId !== 'string') {
    return res.status(400).json({ message: 'Field "taskId" is required.' });
  }

  try {
    if (isNoopProxy(prisma)) {
      return res.status(503).json({ message: 'Database not connected.' });
    }

    const requirement = await prisma.requirement.findUnique({
      where: { id: req.params.id }
    });
    if (!requirement) {
      return res.status(404).json({ message: 'Requirement not found' });
    }

    const task = await prisma.task.findUnique({
      where: { id: taskId }
    });
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    const link = await prisma.requirementTask.create({
      data: {
        requirementId: req.params.id,
        taskId
      }
    });

    await prisma.auditLog.create({
      data: {
        action: 'LINK_TASK',
        entityType: 'requirement',
        entityId: req.params.id,
        changes: { taskId },
        userId: req.body.changedBy || 'system'
      }
    });

    res.status(201).json(link);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(409).json({ message: 'Task is already linked to this requirement.' });
    }
    console.error('Error linking task:', error);
    res.status(500).json({ message: 'Failed to link task' });
  }
});

// DELETE /api/requirements/:id/tasks/:taskId - unlink a task
router.delete('/:id/tasks/:taskId', async (req: Request, res: Response) => {
  try {
    if (isNoopProxy(prisma)) {
      return res.status(503).json({ message: 'Database not connected.' });
    }

    const link = await prisma.requirementTask.findFirst({
      where: { requirementId: req.params.id, taskId: req.params.taskId }
    });

    if (!link) {
      return res.status(404).json({ message: 'Link not found' });
    }

    await prisma.requirementTask.delete({
      where: { id: link.id }
    });

    await prisma.auditLog.create({
      data: {
        action: 'UNLINK_TASK',
        entityType: 'requirement',
        entityId: req.params.id,
        changes: { taskId: req.params.taskId },
        userId: 'system'
      }
    });

    res.status(204).send();
  } catch (error) {
    console.error('Error unlinking task:', error);
    res.status(500).json({ message: 'Failed to unlink task' });
  }
});

// GET /api/requirements/:id/bugs - list linked bugs
router.get('/:id/bugs', async (req: Request, res: Response) => {
  try {
    if (isNoopProxy(prisma)) {
      return res.json([]);
    }

    const requirement = await prisma.requirement.findUnique({
      where: { id: req.params.id }
    });

    if (!requirement) {
      return res.status(404).json({ message: 'Requirement not found' });
    }

    const linkedBugs = await prisma.requirementBug.findMany({
      where: { requirementId: req.params.id },
      include: { bug: true }
    });

    const result = linkedBugs.map(lb => ({
      id: lb.bug.id,
      title: lb.bug.title,
      status: lb.bug.status,
      priority: lb.bug.priority,
      linkType: 'm2m'
    }));

    res.json(result);
  } catch (error) {
    console.error('Error fetching requirement bugs:', error);
    res.status(500).json({ message: 'Failed to fetch bugs' });
  }
});

// POST /api/requirements/:id/bugs - link a bug to a requirement
router.post('/:id/bugs', async (req: Request, res: Response) => {
  const { bugId } = req.body;
  if (!bugId || typeof bugId !== 'string') {
    return res.status(400).json({ message: 'Field "bugId" is required.' });
  }

  try {
    if (isNoopProxy(prisma)) {
      return res.status(503).json({ message: 'Database not connected.' });
    }

    const requirement = await prisma.requirement.findUnique({
      where: { id: req.params.id }
    });
    if (!requirement) {
      return res.status(404).json({ message: 'Requirement not found' });
    }

    const bug = await prisma.bug.findUnique({
      where: { id: bugId }
    });
    if (!bug) {
      return res.status(404).json({ message: 'Bug not found' });
    }

    const link = await prisma.requirementBug.create({
      data: {
        requirementId: req.params.id,
        bugId
      }
    });

    await prisma.auditLog.create({
      data: {
        action: 'LINK_BUG',
        entityType: 'requirement',
        entityId: req.params.id,
        changes: { bugId },
        userId: req.body.changedBy || 'system'
      }
    });

    res.status(201).json(link);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(409).json({ message: 'Bug is already linked to this requirement.' });
    }
    console.error('Error linking bug:', error);
    res.status(500).json({ message: 'Failed to link bug' });
  }
});

// DELETE /api/requirements/:id/bugs/:bugId - unlink a bug
router.delete('/:id/bugs/:bugId', async (req: Request, res: Response) => {
  try {
    if (isNoopProxy(prisma)) {
      return res.status(503).json({ message: 'Database not connected.' });
    }

    const link = await prisma.requirementBug.findFirst({
      where: { requirementId: req.params.id, bugId: req.params.bugId }
    });

    if (!link) {
      return res.status(404).json({ message: 'Link not found' });
    }

    await prisma.requirementBug.delete({
      where: { id: link.id }
    });

    await prisma.auditLog.create({
      data: {
        action: 'UNLINK_BUG',
        entityType: 'requirement',
        entityId: req.params.id,
        changes: { bugId: req.params.bugId },
        userId: 'system'
      }
    });

    res.status(204).send();
  } catch (error) {
    console.error('Error unlinking bug:', error);
    res.status(500).json({ message: 'Failed to unlink bug' });
  }
});

export default router;
