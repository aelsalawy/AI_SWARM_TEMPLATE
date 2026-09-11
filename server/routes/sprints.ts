import { Router, Request, Response } from 'express';
import { getPrismaClient } from '../prisma';

const router = Router();
const prisma = getPrismaClient();

// Helper function to check if client is the no-op proxy
function isNoopProxy(client: any): boolean {
  if (!client || !client.sprint) return true;
  try {
    const createFunc = client.sprint.create.toString();
    return createFunc.includes('const method=String(prop)');
  } catch (e) {
    return true;
  }
}

// Validate input
function validateSprint(data: any): string | null {
  if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
    return 'name is required';
  }
  if (!data.projectId || typeof data.projectId !== 'string') {
    return 'projectId is required';
  }
  return null;
}

// GET /api/sprints
router.get('/', async (req: Request, res: Response) => {
  try {
    if (isNoopProxy(prisma)) {
      return res.json([]);
    }

    const where: any = {};

    if (req.query.projectId) {
      where.projectId = req.query.projectId as string;
    }
    if (req.query.status) {
      where.status = req.query.status as string;
    }
    if (req.query.ownerId) {
      where.ownerId = req.query.ownerId as string;
    }

    const sprints = await prisma.sprint.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    });

    res.json(sprints);
  } catch (error) {
    console.error('Error listing sprints:', error);
    res.status(500).json({ message: 'Failed to list sprints' });
  }
});

// GET /api/sprints/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    if (isNoopProxy(prisma)) {
      return res.status(503).json({ message: 'Database not connected. Running in demo mode.' });
    }

    const sprint = await prisma.sprint.findUnique({
      where: { id: req.params.id }
    });

    if (!sprint) return res.status(404).json({ message: 'Sprint not found' });

    res.json(sprint);
  } catch (error) {
    console.error('Error getting sprint:', error);
    res.status(500).json({ message: 'Failed to get sprint' });
  }
});

// POST /api/sprints
router.post('/', async (req: Request, res: Response) => {
  const error = validateSprint(req.body);
  if (error) return res.status(400).json({ message: error });

  try {
    if (isNoopProxy(prisma)) {
      return res.status(503).json({ message: 'Database not connected. Running in demo mode.' });
    }

    const sprintData = {
      name: req.body.name.trim(),
      projectId: req.body.projectId,
      goal: req.body.goal || '',
      status: req.body.status || 'Planning',
      startDate: req.body.startDate ? new Date(req.body.startDate) : null,
      endDate: req.body.endDate ? new Date(req.body.endDate) : null,
      ownerId: req.body.ownerId || (req as any).user?.uid || '',
    };

    const sprint = await prisma.sprint.create({
      data: sprintData
    });

    // Audit log
    try {
      const userId = (req as any).user?.uid || req.body.createdBy || 'system';
      await prisma.auditLog.create({
        data: {
          action: 'create',
          entityType: 'sprint',
          entityId: sprint.id,
          userId,
          changes: { name: sprintData.name, projectId: sprintData.projectId } as any,
        }
      });
    } catch (_) {}

    res.status(201).json(sprint);
  } catch (error) {
    console.error('Error creating sprint:', error);
    res.status(500).json({ message: 'Failed to create sprint' });
  }
});

// PATCH /api/sprints/:id
router.patch('/:id', async (req: Request, res: Response) => {
  if (!req.body || Object.keys(req.body).length === 0) {
    return res.status(400).json({ message: 'Request body is required' });
  }

  try {
    if (isNoopProxy(prisma)) {
      return res.status(503).json({ message: 'Database not connected. Running in demo mode.' });
    }

    const existing = await prisma.sprint.findUnique({
      where: { id: req.params.id }
    });

    if (!existing) return res.status(404).json({ message: 'Sprint not found' });

    const updateData = {
      ...req.body,
      updatedAt: new Date()
    };

    const sprint = await prisma.sprint.update({
      where: { id: req.params.id },
      data: updateData
    });

    // Audit log
    try {
      const userId = (req as any).user?.uid || req.body.createdBy || 'system';
      await prisma.auditLog.create({
        data: {
          action: 'update',
          entityType: 'sprint',
          entityId: req.params.id,
          userId,
          changes: updateData as any,
        }
      });
    } catch (_) {}

    res.json(sprint);
  } catch (error) {
    console.error('Error updating sprint:', error);
    res.status(500).json({ message: 'Failed to update sprint' });
  }
});

// DELETE /api/sprints/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    if (isNoopProxy(prisma)) {
      return res.status(503).json({ message: 'Database not connected. Running in demo mode.' });
    }

    const existing = await prisma.sprint.findUnique({
      where: { id: req.params.id }
    });

    if (!existing) return res.status(404).json({ message: 'Sprint not found' });

    await prisma.sprint.delete({
      where: { id: req.params.id }
    });

    // Audit log
    try {
      const userId = (req as any).user?.uid || 'system';
      await prisma.auditLog.create({
        data: {
          action: 'delete',
          entityType: 'sprint',
          entityId: req.params.id,
          userId,
          changes: null as any,
        }
      });
    } catch (_) {}

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting sprint:', error);
    res.status(500).json({ message: 'Failed to delete sprint' });
  }
});

export default router;
