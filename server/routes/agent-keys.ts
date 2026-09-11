import { Router, Request, Response } from 'express';
import { getPrismaClient } from '../prisma';
import { issueAgentKey, listAgentKeys, rotateAgentKey, revokeAgentKey } from '../lib/agent-keys';

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

// GET /api/agents/me - agent self-introspection
router.get('/me', async (req: Request, res: Response) => {
  // Only agent-key callers allowed (JWT callers get 401 from middleware)
  if (!(req as any).isAgent) {
    return res.status(401).json({ message: 'Agent key authentication required' });
  }

  try {
    if (isNoopProxy(prisma)) {
      return res.status(503).json({ message: 'Database not available' });
    }

    const agentId = (req as any).user?.uid;
    if (!agentId) {
      return res.status(401).json({ message: 'Unable to determine agent identity' });
    }

    // Get agent info
    const agent = await prisma.agent.findUnique({ where: { id: agentId } });
    if (!agent) {
      return res.status(404).json({ message: 'Agent not found' });
    }

    // Count unread chats (where agent is the recipient and role='user')
    const unreadChats = await prisma.agentChat.count({
      where: {
        agentId,
        userId: { not: agentId }, // Messages from others (not self)
        role: 'user'
      }
    });

    // Count open assigned tasks
    const assignedOpenTasks = await prisma.task.count({
      where: {
        assignedAgentId: agentId,
        status: { notIn: ['DONE'] }
      }
    });

    // Last heartbeat from agent record
    const lastHeartbeat = agent.lastHeartbeat;

    return res.json({
      agentId,
      unreadChats,
      assignedOpenTasks,
      lastHeartbeat
    });
  } catch (error) {
    console.error('[agent-keys/me] Error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/agents/:agentId/keys - create key (super_admin only)
router.post('/:agentId/keys', async (req: Request, res: Response) => {
  // Super admin check - JWT callers only
  const user = (req as any).user;
  if (!user || user.role !== 'super_admin') {
    return res.status(403).json({ message: 'Super admin access required' });
  }

  // Reject agent-key callers
  if ((req as any).isAgent) {
    return res.status(401).json({ message: 'Agent key authentication not permitted for this endpoint' });
  }

  try {
    const { agentId } = req.params;
    const { name } = req.body;

    if (!agentId) {
      return res.status(400).json({ message: 'agentId is required' });
    }

    const result = await issueAgentKey(agentId, name);
    return res.status(201).json(result);
  } catch (error: any) {
    console.error('[agent-keys/create] Error:', error.message);
    if (error.message.includes('Agent not found')) {
      return res.status(404).json({ message: error.message });
    }
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/agents/:agentId/keys - list keys (super_admin only)
router.get('/:agentId/keys', async (req: Request, res: Response) => {
  // Super admin check - JWT callers only
  const user = (req as any).user;
  if (!user || user.role !== 'super_admin') {
    return res.status(403).json({ message: 'Super admin access required' });
  }

  // Reject agent-key callers
  if ((req as any).isAgent) {
    return res.status(401).json({ message: 'Agent key authentication not permitted for this endpoint' });
  }

  try {
    const { agentId } = req.params;
    const keys = await listAgentKeys(agentId);
    return res.json(keys);
  } catch (error) {
    console.error('[agent-keys/list] Error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/agents/keys/:keyId/rotate - rotate key (super_admin only)
router.post('/keys/:keyId/rotate', async (req: Request, res: Response) => {
  // Super admin check - JWT callers only
  const user = (req as any).user;
  if (!user || user.role !== 'super_admin') {
    return res.status(403).json({ message: 'Super admin access required' });
  }

  // Reject agent-key callers
  if ((req as any).isAgent) {
    return res.status(401).json({ message: 'Agent key authentication not permitted for this endpoint' });
  }

  try {
    const { keyId } = req.params;
    const result = await rotateAgentKey(keyId);
    return res.json(result);
  } catch (error: any) {
    console.error('[agent-keys/rotate] Error:', error.message);
    if (error.message.includes('Key not found') || error.message.includes('Cannot rotate')) {
      return res.status(400).json({ message: error.message });
    }
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /api/agents/keys/:keyId - revoke key (super_admin only)
router.delete('/keys/:keyId', async (req: Request, res: Response) => {
  // Super admin check - JWT callers only
  const user = (req as any).user;
  if (!user || user.role !== 'super_admin') {
    return res.status(403).json({ message: 'Super admin access required' });
  }

  // Reject agent-key callers
  if ((req as any).isAgent) {
    return res.status(401).json({ message: 'Agent key authentication not permitted for this endpoint' });
  }

  try {
    const { keyId } = req.params;
    await revokeAgentKey(keyId);
    return res.status(204).send();
  } catch (error) {
    console.error('[agent-keys/revoke] Error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;