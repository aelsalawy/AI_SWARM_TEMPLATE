import { Router, Request, Response } from 'express';
import { getPrismaClient } from '../prisma';

const router = Router();
const prisma = getPrismaClient();

// Helper function to check if client is the no-op proxy
function isNoopProxy(client: any): boolean {
  if (!client || !client.release) return true;
  try {
    const createFunc = client.release.create.toString();
    return createFunc.includes('const method=String(prop)');
  } catch (e) {
    return true;
  }
}

// GET /api/releases?projectId=  (no projectId → all)
router.get('/', async (req: Request, res: Response) => {
  try {
    if (isNoopProxy(prisma)) {
      return res.json([]);
    }

    const where: any = {};
    if (req.query.projectId) {
      where.projectId = req.query.projectId as string;
    }

    const releases = await prisma.release.findMany({
      where,
      orderBy: { name: 'asc' }
    });

    res.json(releases);
  } catch (error) {
    console.error('Error listing releases:', error);
    res.status(500).json({ message: 'Failed to list releases' });
  }
});

// POST /api/releases  { projectId?, name }
router.post('/', async (req: Request, res: Response) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (!name) {
    return res.status(400).json({ message: 'name is required' });
  }
  if (name.length > 40) {
    return res.status(400).json({ message: 'name must be 40 characters or fewer' });
  }

  const projectId = req.body?.projectId ? String(req.body.projectId) : null;

  try {
    if (isNoopProxy(prisma)) {
      return res.status(503).json({ message: 'Database not connected. Running in demo mode.' });
    }

    // Validate projectId FK if provided
    if (projectId) {
      const project = await prisma.project.findUnique({ where: { id: projectId } });
      if (!project) {
        return res.status(400).json({ message: 'Invalid projectId' });
      }
    }

    // Duplicate check (unique on [projectId, name])
    const existing = await prisma.release.findFirst({
      where: { projectId, name }
    });
    if (existing) {
      return res.status(409).json({ message: 'Release already exists for this project' });
    }

    const release = await prisma.release.create({
      data: { projectId, name }
    });

    res.status(201).json(release);
  } catch (error: any) {
    // Prisma unique constraint violation → 409
    if (error?.code === 'P2002') {
      return res.status(409).json({ message: 'Release already exists for this project' });
    }
    console.error('Error creating release:', error);
    res.status(500).json({ message: 'Failed to create release' });
  }
});

// DELETE /api/releases/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    if (isNoopProxy(prisma)) {
      return res.status(503).json({ message: 'Database not connected. Running in demo mode.' });
    }

    const existing = await prisma.release.findUnique({
      where: { id: req.params.id }
    });

    if (!existing) return res.status(404).json({ message: 'Release not found' });

    await prisma.release.delete({
      where: { id: req.params.id }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting release:', error);
    res.status(500).json({ message: 'Failed to delete release' });
  }
});

export default router;
