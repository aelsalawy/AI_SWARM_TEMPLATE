import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { verifyRequestAuth } from '../local-auth';

const router = Router();

// Apply auth middleware to all routes
router.use(async (req, res, next) => {
  console.log('[Users] Router middleware - Request:', req.method, req.url);
  console.log('[Users] req.user:', (req as any).user);
  console.log('[Users] req.isAgent:', (req as any).isAgent);

  // First check if global middleware already authenticated (JWT or agent key)
  if ((req as any).user) {
    console.log('[Users] Global middleware authenticated user:', (req as any).user.userId);
    
    // Agent key auth is not allowed for user management
    if ((req as any).isAgent) {
      console.log('[Users] Rejected: Agent key auth not allowed');
      return res.status(403).json({ message: 'Forbidden: Agent key not allowed for user management' });
    }
    
    // JWT auth - verify role is super_admin
    const user = await prisma.user.findUnique({
      where: { id: (req as any).user.userId },
    });
    
    console.log('[Users] Fetched user for role check:', user?.email, 'role:', user?.role);
    
    if (!user || user.role !== 'super_admin') {
      console.log('[Users] Rejected: Not super_admin', user ? `role=${user.role}` : 'user not found');
      return res.status(403).json({ message: 'Forbidden: Admin access required' });
    }
    
    console.log('[Users] Auth verified, proceeding to handler');
    return next();
  }
  
  console.log('[Users] No req.user, trying direct JWT verification');
  
  // Fallback: verify JWT directly (in case global middleware was bypassed)
  const decoded = await verifyRequestAuth(req);
  if (!decoded) {
    console.log('[Users] Rejected: JWT verification failed');
    return res.status(401).json({ message: 'Unauthorized' });
  }
  
  // Only super_admin can manage users
  const user = await prisma.user.findUnique({
    where: { id: decoded.userId },
  });
  
  if (!user || user.role !== 'super_admin') {
    console.log('[Users] Rejected: Not super_admin (fallback)', user ? `role=${user.role}` : 'user not found');
    return res.status(403).json({ message: 'Forbidden: Admin access required' });
  }
  
  (req as any).user = decoded;
  console.log('[Users] JWT verified, proceeding to handler');
  next();
});

/**
 * GET /api/users
 * List users. Optional `deletedAt` query param:
 *   - (default)  exclude soft-deleted users
 *   - `only`     return ONLY soft-deleted users
 *   - `all`      return all users including soft-deleted
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    // Prevent caching
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const { deletedAt } = req.query;

    // Build where clause based on filter
    let where: any = {};
    if (deletedAt === 'only') {
      where.deletedAt = { not: null };
    } else if (deletedAt === 'all') {
      // no filter — return everyone
    } else {
      where.deletedAt = null;  // default: exclude soft-deleted
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        forcePasswordChange: true,
        deletedAt: true,
        createdAt: true,
        lastLogin: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Failed to fetch users' });
  }
});

/**
 * POST /api/users/:id/restore
 * Restore a soft-deleted user — ATOMIC operation.
 * Clears deletedAt, resets status to 'active', and revokes all refresh tokens
 * in a single transaction (no partial-restore state).
 *
 * NOTE: Must be defined BEFORE the /:id routes so Express doesn't match
 * "restore" as an :id parameter.
 */
router.post('/:id/restore', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, deletedAt: true, email: true },
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!user.deletedAt) {
      return res.status(400).json({ message: 'User is not deleted — nothing to restore' });
    }

    const result = await prisma.$transaction(async (tx: any) => {
      const restored = await tx.user.update({
        where: { id },
        data: {
          deletedAt: null,
          status: 'active',
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          status: true,
          deletedAt: true,
          createdAt: true,
          lastLogin: true,
        },
      });

      const revoked = await tx.refreshToken.updateMany({
        where: { userId: id, isRevoked: false },
        data: { isRevoked: true },
      });

      console.log(`[Users] Restored user ${id}, revoked ${revoked.count} tokens`);
      return restored;
    });

    res.json(result);
  } catch (error: any) {
    console.error('Error restoring user:', error);
    res.status(500).json({ message: 'Failed to restore user', error: error.message });
  }
});

/**
 * GET /api/users/:id
 * Get a specific user (exclude soft-deleted)
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Prevent caching
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const user = await prisma.user.findFirst({
      where: {
        id,
        deletedAt: null,  // Exclude soft-deleted users
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        forcePasswordChange: true,
        permissions: true,
        createdAt: true,
        lastLogin: true,
      },
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ message: 'Failed to fetch user' });
  }
});

/**
 * POST /api/users
 * Create a new user
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { email, password, firstName, lastName, role, permissions } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }

    // Hash password (reuse hashPassword from local-auth)
    const { hashPassword } = await import('../local-auth');
    const passwordHash = await hashPassword(password);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName: firstName || '',
        lastName: lastName || '',
        role: role || 'cashier',
        permissions: permissions || [],
        status: 'active',
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        permissions: true,
        createdAt: true,
      },
    });

    res.status(201).json(user);
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ message: 'Failed to create user' });
  }
});

/**
 * PATCH /api/users/:id
 * Update a user
 */
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Don't allow password update through this endpoint (use reset password flow)
    delete updates.password;
    delete updates.passwordHash;

    // Don't allow updating own role (security)
    const currentUser = (req as any).user;
    if (currentUser.userId === id && updates.role) {
      return res.status(400).json({ message: 'Cannot modify your own role' });
    }

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id },
    });

    if (!existingUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // If updating email, check for duplicates
    if (updates.email && updates.email !== existingUser.email) {
      const duplicateUser = await prisma.user.findUnique({
        where: { email: updates.email },
      });

      if (duplicateUser) {
        return res.status(400).json({ message: 'Email already in use' });
      }
    }

    // Update user
    const user = await prisma.user.update({
      where: { id },
      data: updates,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        permissions: true,
        updatedAt: true,
      },
    });

    res.json(user);
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ message: 'Failed to update user' });
  }
});

/**
 * DELETE /api/users/:id
 * Delete a user (soft delete)
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Don't allow deleting own account
    const currentUser = (req as any).user;
    if (currentUser.userId === id) {
      return res.status(400).json({ message: 'Cannot delete your own account' });
    }

    // Check if user exists
    const existingUser = await prisma.user.findFirst({
      where: {
        id,
        deletedAt: null,  // Only allow deleting non-deleted users
      },
    });

    if (!existingUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Soft delete by setting deletedAt
    console.log('[Users] Deleting user:', id, 'Current deletedAt:', existingUser.deletedAt);
    
    const result = await prisma.user.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    
    // Kill all active sessions: revoke every refresh token owned by this user.
    // Existing access tokens expire naturally within 15 min (JWT_EXPIRES_IN).
    const revoked = await prisma.refreshToken.updateMany({
      where: { userId: id, isRevoked: false },
      data: { isRevoked: true },
    });
    console.log('[Users] Revoked', revoked.count, 'refresh tokens for deleted user:', id);
    
    console.log('[Users] User soft-deleted successfully:', id, 'New deletedAt:', result.deletedAt);
    
    // Verify the delete worked by fetching the user again
    const verifyUser = await prisma.user.findUnique({
      where: { id },
      select: { id: true, deletedAt: true, email: true },
    });
    
    if (!verifyUser || !verifyUser.deletedAt) {
      throw new Error(`Failed to verify soft-delete for user ${id}`);
    }
    
    console.log('[Users] Verified deletion for user:', id, 'deletedAt:', verifyUser.deletedAt);
    res.status(204).send();
  } catch (error: any) {
    console.error('Error deleting user:', error);
    console.error('Error details:', error.message, error.code);
    res.status(500).json({ message: 'Failed to delete user', error: error.message });
  }
});

/**
 * POST /api/users/:id/reset-password
 * Admin-initiated password reset: sets a temporary password and marks forcePasswordChange.
 * Also generates a reset token that can be used for self-service reset.
 */
router.post('/:id/reset-password', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { temporaryPassword, generateResetToken } = req.body;

    const user = await prisma.user.findFirst({
      where: { id, deletedAt: null },
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.status === 'suspended') {
      return res.status(400).json({ message: 'Cannot reset password for a suspended account — activate it first' });
    }

    const { hashPassword: hp } = await import('../local-auth');
    const updateData: any = {
      forcePasswordChange: true,
      loginAttempts: 0,
      lockedUntil: null,
    };

    // Set temporary password if provided
    if (temporaryPassword) {
      if (temporaryPassword.length < 8) {
        return res.status(400).json({ message: 'Temporary password must be at least 8 characters' });
      }
      updateData.passwordHash = await hp(temporaryPassword);
    }

    // Generate reset token
    if (generateResetToken !== false) {
      const crypto = await import('crypto');
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      updateData.resetToken = resetToken;
      updateData.resetTokenExpiry = resetTokenExpiry;
    }

    const updated = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        forcePasswordChange: true,
        resetToken: generateResetToken !== false ? true : undefined,
        resetTokenExpiry: true,
      },
    });

    // Revoke all refresh tokens to force re-login
    await prisma.refreshToken.updateMany({
      where: { userId: id, isRevoked: false },
      data: { isRevoked: true },
    });

    console.log(`[Users] Admin password reset for user ${id}`);
    res.json({
      ...updated,
      resetToken: generateResetToken !== false ? updateData.resetToken : undefined,
    });
  } catch (error: any) {
    console.error('Error resetting user password:', error);
    res.status(500).json({ message: 'Failed to reset password', error: error.message });
  }
});

/**
 * POST /api/users/:id/suspend
 * Suspend a user account — blocks login and revokes all refresh tokens.
 * The user's existing access tokens expire naturally (JWT TTL).
 */
router.post('/:id/suspend', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Cannot suspend yourself
    const currentUser = (req as any).user;
    if (currentUser.userId === id) {
      return res.status(400).json({ message: 'Cannot suspend your own account' });
    }

    const user = await prisma.user.findFirst({
      where: { id, deletedAt: null },
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.status === 'suspended') {
      return res.status(400).json({ message: 'User is already suspended' });
    }

    // Suspend and revoke all refresh tokens in a transaction
    const result = await prisma.$transaction(async (tx: any) => {
      const updated = await tx.user.update({
        where: { id },
        data: { status: 'suspended' },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          status: true,
          updatedAt: true,
        },
      });

      const revoked = await tx.refreshToken.updateMany({
        where: { userId: id, isRevoked: false },
        data: { isRevoked: true },
      });

      console.log(`[Users] Suspended user ${id}, revoked ${revoked.count} refresh tokens`);
      return updated;
    });

    res.json(result);
  } catch (error: any) {
    console.error('Error suspending user:', error);
    res.status(500).json({ message: 'Failed to suspend user', error: error.message });
  }
});

/**
 * POST /api/users/:id/activate
 * Reactivate a suspended user account.
 */
router.post('/:id/activate', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findFirst({
      where: { id, deletedAt: null },
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.status !== 'suspended' && user.status !== 'inactive') {
      return res.status(400).json({ message: `User is already ${user.status}` });
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { status: 'active' },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        updatedAt: true,
      },
    });

    console.log(`[Users] Activated user ${id}`);
    res.json(updated);
  } catch (error: any) {
    console.error('Error activating user:', error);
    res.status(500).json({ message: 'Failed to activate user', error: error.message });
  }
});

/**
 * POST /api/users/:id/force-logout
 * Force-logout a user by revoking all their refresh tokens.
 * Their current access token expires naturally (JWT TTL ~15 min).
 */
router.post('/:id/force-logout', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findFirst({
      where: { id, deletedAt: null },
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const result = await prisma.refreshToken.updateMany({
      where: { userId: id, isRevoked: false },
      data: { isRevoked: true },
    });

    console.log(`[Users] Force-logout user ${id}, revoked ${result.count} refresh tokens`);
    res.json({
      message: `Force-logout successful for ${user.email}`,
      tokensRevoked: result.count,
    });
  } catch (error: any) {
    console.error('Error force-logout:', error);
    res.status(500).json({ message: 'Failed to force-logout user', error: error.message });
  }
});

export default router;