import { Router, Request, Response } from 'express';
import { getPrismaClient } from '../prisma';

const router = Router();
const prisma = getPrismaClient();

// Helper function to check if client is the no-op proxy
function isNoopProxy(client: any): boolean {
  if (!client || !client.deployment) return true;

  try {
    const createFunc = client.deployment.create.toString();
    return createFunc.includes('const method=String(prop)') ||
           createFunc.includes('Database unavailable') ||
           createFunc.includes('Prisma not initialized');
  } catch (e) {
    return true;
  }
}

// GET /api/deployments - list all deployments
router.get('/', async (req: Request, res: Response) => {
  try {
    // Check if Prisma is available and not a no-op proxy
    if (isNoopProxy(prisma)) {
      return res.json([]);
    }

    // Build Prisma query based on filters
    const where: any = {};

    // Apply filters
    if (req.query.status) {
      where.status = req.query.status as string;
    }
    if (req.query.triggeredBy) {
      where.triggeredBy = req.query.triggeredBy as string;
    }
    if (req.query.projectId) {
      where.projectId = req.query.projectId as string;
    }

    const deployments = await prisma.deployment.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    });

    res.json(deployments);
  } catch (error) {
    console.error('Error fetching deployments:', error);
    res.status(500).json({ message: 'Failed to fetch deployments' });
  }
});

// POST /api/deployments - create deployment
router.post('/', async (req: Request, res: Response) => {
  const { status, triggeredBy, summary, projectId } = req.body;

  if (!triggeredBy) {
    return res.status(400).json({ message: 'Field "triggeredBy" is required.' });
  }

  try {
    // Check if Prisma is actually initialized
    const isActuallyNoop = !prisma.deployment ||
      prisma.deployment.create.toString().includes('const method=String(prop)');

    if (isActuallyNoop) {
      return res.status(503).json({ message: 'Database not connected. Cannot create deployments in demo mode.' });
    }

    const deploymentData = {
      status: status || 'triggered',
      triggeredBy,
      summary: summary || {},
      projectId: projectId || null,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const createdDeployment = await prisma.deployment.create({
      data: deploymentData
    });

    res.status(201).json(createdDeployment);
  } catch (error) {
    console.error('[Deployments] Error creating deployment:', error);
    console.error('[Deployments] Request body:', JSON.stringify(req.body, null, 2));
    console.error('[Deployments] Error details:', error instanceof Error ? error.message : 'Unknown error');
    console.error('[Deployments] Error stack:', error instanceof Error ? error.stack : 'No stack');
    res.status(500).json({ message: 'Failed to create deployment', error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// GET /api/deployments/:id - get specific deployment
router.get('/:id', async (req: Request, res: Response) => {
  try {
    if (isNoopProxy(prisma)) {
      return res.status(404).json({ message: 'Deployment not found' });
    }

    const deployment = await prisma.deployment.findUnique({
      where: { id: req.params.id }
    });

    if (!deployment) {
      return res.status(404).json({ message: 'Deployment not found' });
    }

    res.json(deployment);
  } catch (error) {
    console.error('Error fetching deployment:', error);
    res.status(500).json({ message: 'Failed to fetch deployment' });
  }
});

// PATCH /api/deployments/:id - update deployment status
router.patch('/:id', async (req: Request, res: Response) => {
  const { status, summary } = req.body;

  if (!status && !summary) {
    return res.status(400).json({ message: 'Request body must contain at least one field to update.' });
  }

  try {
    if (isNoopProxy(prisma)) {
      return res.status(503).json({ message: 'Database not connected. Cannot update deployments.' });
    }

    const currentDeployment = await prisma.deployment.findUnique({
      where: { id: req.params.id }
    });

    if (!currentDeployment) {
      return res.status(404).json({ message: 'Deployment not found' });
    }

    const updateData: any = {
      updatedAt: new Date()
    };

    if (status) updateData.status = status;
    if (summary) updateData.summary = summary;

    const updatedDeployment = await prisma.deployment.update({
      where: { id: req.params.id },
      data: updateData
    });

    res.json(updatedDeployment);
  } catch (error) {
    console.error('Error updating deployment:', error);
    res.status(500).json({ message: 'Failed to update deployment' });
  }
});

export default router;