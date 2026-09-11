import { Router, Request, Response } from 'express';
import { getPrismaClient } from '../prisma';

const router = Router();
const prisma = getPrismaClient();

// Helper function to check if client is the no-op proxy
function isNoopProxy(client: any): boolean {
  if (!client || !client.auditLog) return true;
  try {
    const createFunc = client.auditLog.create.toString();
    return createFunc.includes('const method=String(prop)');
  } catch (e) {
    return true;
  }
}

// GET /api/audit - list audit log entries
router.get('/', async (req: Request, res: Response) => {
  try {
    if (isNoopProxy(prisma)) {
      return res.json([]);
    }

    const where: any = {};

    // Optional filtering by entityId
    if (req.query.entityId) {
      where.entityId = req.query.entityId as string;
    }

    // Optional filtering by entityType
    if (req.query.entityType) {
      where.entityType = req.query.entityType as string;
    }

    // Limit results (default to 50)
    const limit = parseInt(req.query.limit as string) || 50;

    const auditLogs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    res.json(auditLogs);
  } catch (error) {
    console.error('Error fetching audit log:', error);
    res.status(500).json({ message: 'Failed to fetch audit log' });
  }
});

export default router;
