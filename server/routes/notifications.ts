import { Router, Request, Response } from 'express';
import { getPrismaClient } from '../prisma';

const router = Router();
const prisma = getPrismaClient();

// Valid notification types (must match NotificationType enum in schema.prisma)
const VALID_TYPES = ['info', 'warning', 'success', 'error'];

// Helper function to check if client is the no-op proxy
function isNoopProxy(client: any): boolean {
  if (!client || !client.notification) return true;

  // Check if notification.create is the no-op proxy function
  try {
    const createFunc = client.notification.create.toString();
    return createFunc.includes('const method=String(prop)');
  } catch (e) {
    return true;
  }
}

// Resolve the current identity (user id or agent id) for inbox scoping
function getIdentity(req: Request): string {
  return (req as any).user?.uid || (req as any).agentId || 'system';
}

// Auth middleware — defense in depth. The global /api middleware already
// authenticates JWT or agent-key for non-public paths, but this guarantees
// no handler runs without an attached identity.
router.use((req: Request, res: Response, next) => {
  if (!(req as any).user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  next();
});

/**
 * GET /api/notifications
 * List the current user's notifications (newest first).
 * Query params:
 *   - unread=true   only unread notifications
 *   - limit         page size (default 50, max 100)
 *   - offset        skip count (default 0)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    if (isNoopProxy(prisma)) {
      return res.json({ notifications: [], total: 0, unreadCount: 0, limit: 50, offset: 0 });
    }

    const userId = getIdentity(req);
    const unreadOnly = req.query.unread === 'true';
    const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 50, 1), 100);
    const offset = Math.max(parseInt(req.query.offset as string, 10) || 0, 0);

    const where: any = { userId };
    if (unreadOnly) where.read = false;

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { userId, read: false } }),
    ]);

    res.json({ notifications, total, unreadCount, limit, offset });
  } catch (error: any) {
    console.error('[Notifications] Error listing notifications:', error);
    res.status(500).json({ message: 'Failed to fetch notifications', error: error.message });
  }
});

/**
 * PATCH /api/notifications/read-all
 * Mark ALL of the current user's notifications as read.
 * NOTE: Must be defined BEFORE /:id so Express doesn't match "read-all" as an :id.
 */
router.patch('/read-all', async (req: Request, res: Response) => {
  try {
    if (isNoopProxy(prisma)) {
      return res.json({ updated: 0 });
    }

    const userId = getIdentity(req);
    const result = await prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });

    console.log(`[Notifications] Marked ${result.count} notifications as read for ${userId}`);
    res.json({ updated: result.count });
  } catch (error: any) {
    console.error('[Notifications] Error marking all as read:', error);
    res.status(500).json({ message: 'Failed to mark notifications as read', error: error.message });
  }
});

/**
 * POST /api/notifications
 * Create a notification. Admin (JWT) or agent-key auth required.
 * Body: { userId, title, message, type?, actionUrl? }
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    if (isNoopProxy(prisma)) {
      return res.status(503).json({ message: 'Database unavailable' });
    }

    const isAgent = Boolean((req as any).isAgent);

    // JWT users must be admin or super_admin; agent-key auth is always allowed
    if (!isAgent) {
      const callerId = (req as any).user?.userId;
      const caller = await prisma.user.findUnique({
        where: { id: callerId },
        select: { id: true, role: true, deletedAt: true },
      });
      if (!caller || caller.deletedAt || !['super_admin', 'admin'].includes(caller.role)) {
        return res.status(403).json({ message: 'Forbidden: Admin access required' });
      }
    }

    const { userId, title, message, type, actionUrl } = req.body || {};

    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ message: 'userId (recipient) is required' });
    }
    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ message: 'title is required' });
    }
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ message: 'message is required' });
    }
    if (type !== undefined && !VALID_TYPES.includes(type)) {
      return res.status(400).json({ message: `type must be one of: ${VALID_TYPES.join(', ')}` });
    }

    // Validate recipient exists (FK would catch it too, but fail with a clear message)
    const recipient = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, deletedAt: true },
    });
    if (!recipient || recipient.deletedAt) {
      return res.status(404).json({ message: 'Recipient user not found' });
    }

    const notification = await prisma.notification.create({
      data: {
        userId,
        type: type || 'info',
        title: title.trim(),
        message: message.trim(),
        actionUrl: actionUrl || null,
      },
    });

    console.log(`[Notifications] Created notification ${notification.id} for user ${userId}`);
    res.status(201).json(notification);
  } catch (error: any) {
    console.error('[Notifications] Error creating notification:', error);
    res.status(500).json({ message: 'Failed to create notification', error: error.message });
  }
});

/**
 * PATCH /api/notifications/:id
 * Mark a single notification as read (owner only).
 */
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    if (isNoopProxy(prisma)) {
      return res.status(503).json({ message: 'Database unavailable' });
    }

    const userId = getIdentity(req);
    const { id } = req.params;

    const existing = await prisma.notification.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    const updated = await prisma.notification.update({
      where: { id },
      data: { read: true },
    });

    res.json(updated);
  } catch (error: any) {
    console.error('[Notifications] Error marking notification as read:', error);
    res.status(500).json({ message: 'Failed to update notification', error: error.message });
  }
});

/**
 * DELETE /api/notifications/:id
 * Delete a single notification (owner only).
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    if (isNoopProxy(prisma)) {
      return res.status(503).json({ message: 'Database unavailable' });
    }

    const userId = getIdentity(req);
    const { id } = req.params;

    const existing = await prisma.notification.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    await prisma.notification.delete({ where: { id } });

    console.log(`[Notifications] Deleted notification ${id} for user ${userId}`);
    res.status(204).send();
  } catch (error: any) {
    console.error('[Notifications] Error deleting notification:', error);
    res.status(500).json({ message: 'Failed to delete notification', error: error.message });
  }
});

export default router;