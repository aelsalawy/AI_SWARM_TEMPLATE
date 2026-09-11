import { Router, Request, Response } from 'express';
import { getPrismaClient } from '../prisma';

const router = Router();
const prisma = getPrismaClient();

// Validate input
function validateProject(data: any): string | null {
  if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
    return 'name is required';
  }
  return null;
}

// Helper function to check if client is the no-op proxy
function isNoopProxy(client: any): boolean {
  if (!client || !client.project) return true;
  try {
    const createFunc = client.project.create.toString();
    return createFunc.includes('const method=String(prop)');
  } catch (e) {
    return true;
  }
}

// GET /api/projects
router.get('/', async (req: Request, res: Response) => {
  try {
    if (isNoopProxy(prisma)) {
      return res.json([]);
    }

    const where: any = {};

    // Only filter by ownerId if explicitly provided in query params
    // Otherwise return all projects (client-side filtering by user.uid)
    if (req.query.ownerId) {
      where.ownerId = req.query.ownerId as string;
    }
    if (req.query.status) {
      where.status = req.query.status as string;
    }

    const projects = await prisma.project.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    });

    res.json(projects);
  } catch (error) {
    console.error('Error listing projects:', error);
    res.status(500).json({ message: 'Failed to list projects' });
  }
});

// GET /api/projects/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    if (isNoopProxy(prisma)) {
      return res.status(503).json({ message: 'Database not connected. Running in demo mode.' });
    }

    const project = await prisma.project.findUnique({
      where: { id: req.params.id }
    });

    if (!project) return res.status(404).json({ message: 'Project not found' });
    res.json(project);
  } catch (error) {
    console.error('Error getting project:', error);
    res.status(500).json({ message: 'Failed to get project' });
  }
});

// POST /api/projects
router.post('/', async (req: Request, res: Response) => {
  const error = validateProject(req.body);
  if (error) return res.status(400).json({ message: error });

  try {
    if (isNoopProxy(prisma)) {
      return res.status(503).json({ message: 'Database not connected. Running in demo mode.' });
    }

    const projectData = {
      name: req.body.name.trim(),
      description: req.body.description || '',
      status: req.body.status || 'Active',
      ownerId: req.body.ownerId || (req as any).user?.uid || '',
    };

    const project = await prisma.project.create({
      data: projectData
    });

    // Audit log (if Prisma audit log table exists)
    try {
      const userId = (req as any).user?.uid || req.body.createdBy || 'system';
      await prisma.auditLog.create({
        data: {
          action: 'create',
          entityType: 'project',
          entityId: project.id,
          userId,
          changes: { name: projectData.name } as any,
        }
      });
    } catch (auditError) {
      // Audit log is optional - ignore errors
    }

    res.status(201).json(project);
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ message: 'Failed to create project' });
  }
});

// PATCH /api/projects/:id
router.patch('/:id', async (req: Request, res: Response) => {
  if (!req.body || Object.keys(req.body).length === 0) {
    return res.status(400).json({ message: 'Request body is required' });
  }

  try {
    if (isNoopProxy(prisma)) {
      return res.status(503).json({ message: 'Database not connected. Running in demo mode.' });
    }

    const existing = await prisma.project.findUnique({
      where: { id: req.params.id }
    });

    if (!existing) return res.status(404).json({ message: 'Project not found' });

    const project = await prisma.project.update({
      where: { id: req.params.id },
      data: req.body
    });

    // Audit log
    try {
      const userId = (req as any).user?.uid || req.body.createdBy || 'system';
      await prisma.auditLog.create({
        data: {
          action: 'update',
          entityType: 'project',
          entityId: req.params.id,
          userId,
          changes: req.body as any,
        }
      });
    } catch (auditError) {
      // Audit log is optional - ignore errors
    }

    res.json(project);
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).json({ message: 'Failed to update project' });
  }
});

// DELETE /api/projects/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    if (isNoopProxy(prisma)) {
      return res.status(503).json({ message: 'Database not connected. Running in demo mode.' });
    }

    const existing = await prisma.project.findUnique({
      where: { id: req.params.id }
    });

    if (!existing) return res.status(404).json({ message: 'Project not found' });

    await prisma.project.delete({
      where: { id: req.params.id }
    });

    // Audit log
    try {
      const userId = (req as any).user?.uid || 'system';
      await prisma.auditLog.create({
        data: {
          action: 'delete',
          entityType: 'project',
          entityId: req.params.id,
          userId,
          changes: null as any,
        }
      });
    } catch (auditError) {
      // Audit log is optional - ignore errors
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({ message: 'Failed to delete project' });
  }
});

export default router;