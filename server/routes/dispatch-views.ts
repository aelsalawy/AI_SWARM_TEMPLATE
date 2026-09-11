/**
 * dispatch-views.ts — GET dispatch state endpoints (T7).
 *
 * GET /api/tasks/:id/dispatch
 * GET /api/bugs/:id/dispatch
 *
 * Returns the most recent AgentDispatch row for the item (or 404 if none).
 * Used by the QA skeleton (e2e/dispatch.e2e.mjs) to assert dispatch state.
 *
 * Kept in a separate router file so we don't edit seniordev's dispatches.ts
 * (POST /api/dispatches). Mounted in server/index.ts alongside it.
 */

import { Router, Request, Response } from 'express';
import { getPrismaClient } from '../prisma';
import { isNoopProxy } from '../services/agent-dispatch';

const router = Router();
const prisma = getPrismaClient();

async function getDispatchForItem(itemType: string, itemId: string, res: Response): Promise<void> {
  try {
    if (isNoopProxy(prisma)) {
      res.status(503).json({ error: 'Database unavailable' });
      return;
    }
    const row = await prisma.agentDispatch.findFirst({
      where: { itemType, itemId },
      orderBy: { updatedAt: 'desc' },
    });
    if (!row) {
      res.status(404).json({ error: `No dispatch row for ${itemType}/${itemId}` });
      return;
    }
    res.status(200).json(row);
  } catch (e: any) {
    console.error('[dispatch-views] GET error:', e?.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}

router.get('/tasks/:id/dispatch', async (req: Request, res: Response) => {
  await getDispatchForItem('task', req.params.id, res);
});

router.get('/bugs/:id/dispatch', async (req: Request, res: Response) => {
  await getDispatchForItem('bug', req.params.id, res);
});

export default router;
