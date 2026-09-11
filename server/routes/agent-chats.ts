import { Router, Request, Response } from 'express';
import { getPrismaClient } from '../prisma';

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

// GET /api/agents/:agentId/chats - list current user's chat transcript for an agent
router.get('/:agentId/chats', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId || (req as any).user?.uid;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { agentId } = req.params;
    if (isNoopProxy(prisma)) {
      return res.json([]);
    }

    const agent = await prisma.agent.findUnique({ where: { id: agentId } });
    if (!agent) {
      return res.status(400).json({ error: 'Unknown agentId' });
    }

    // NEW BRANCH: Agent-key callers get scoped to own agentId without userId filter
    const isAgentCaller = (req as any).isAgent === true;
    let chats;

    if (isAgentCaller) {
      // Agent can only read their own inbox
      const callerAgentId = (req as any).user?.uid;
      if (callerAgentId !== agentId) {
        return res.status(403).json({ error: 'Forbidden: agents can only read their own inbox' });
      }
      // Scope to own agentId only (no userId filter)
      chats = await prisma.agentChat.findMany({
        where: { agentId },
        orderBy: { createdAt: 'asc' },
        take: 200,
      });
    } else {
      // Existing behavior for user/JWT callers
      chats = await prisma.agentChat.findMany({
        where: { agentId, userId },
        orderBy: { createdAt: 'asc' },
        take: 200,
      });
    }

    return res.json(chats);
  } catch (e: any) {
    console.error('[agent-chats] GET error:', e?.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/agents/:agentId/chats - send a user message to an agent
router.post('/:agentId/chats', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId || (req as any).user?.uid;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { agentId } = req.params;
    if (isNoopProxy(prisma)) {
      return res.status(500).json({ error: 'Database unavailable' });
    }

    const agent = await prisma.agent.findUnique({ where: { id: agentId } });
    if (!agent) {
      return res.status(400).json({ error: 'Unknown agentId' });
    }

    const rawMessage = req.body?.message;
    if (typeof rawMessage !== 'string' || rawMessage.trim().length === 0) {
      return res.status(400).json({ error: 'message is required' });
    }

    // NEW BRANCH: Agent callers post as role='agent' with agentId enforcement
    const isAgentCaller = (req as any).isAgent === true;
    let role = 'user';
    let finalUserId = userId;

    if (isAgentCaller) {
      // Agent can only post as themselves
      const callerAgentId = (req as any).user?.uid;
      if (callerAgentId !== agentId) {
        return res.status(403).json({ error: 'Forbidden: agents can only post to their own inbox' });
      }
      role = 'agent';
      finalUserId = callerAgentId; // Override with verified identity
    } else {
      // Existing behavior for user/JWT callers
      role = 'user';
    }

    const record = await prisma.agentChat.create({
      data: {
        agentId,
        userId: finalUserId,
        message: rawMessage.trim(),
        role,
      },
    });

    return res.status(201).json(record);
  } catch (e: any) {
    console.error('[agent-chats] POST error:', e?.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
