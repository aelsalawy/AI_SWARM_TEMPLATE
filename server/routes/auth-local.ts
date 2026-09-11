import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import {
  loginUser,
  registerUser,
  refreshAccessToken,
  revokeRefreshToken,
  verifyAccessToken,
  hashPassword,
} from '../local-auth';

const router = Router();

/**
 * POST /api/auth/login
 * Login with email and password
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const ipAddress = req.ip || req.socket.remoteAddress || 'Unknown';
    const userAgent = req.headers['user-agent'];

    const result = await loginUser(email, password, ipAddress, userAgent);

    // Check if user must change password
    const dbUser = await prisma.user.findUnique({ where: { email }, select: { forcePasswordChange: true } });
    res.json({
      ...result,
      forcePasswordChange: dbUser?.forcePasswordChange ?? false,
    });
  } catch (error) {
    console.error('Login error:', error);
    const message = error instanceof Error ? error.message : 'Login failed';
    res.status(401).json({ message });
  }
});

/**
 * POST /api/auth/register
 * Register a new user
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, firstName, lastName, role } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }

    const result = await registerUser({ email, password, firstName, lastName, role });

    res.status(201).json(result);
  } catch (error) {
    console.error('Register error:', error);
    const message = error instanceof Error ? error.message : 'Registration failed';
    res.status(400).json({ message });
  }
});

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 */
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ message: 'Refresh token is required' });
    }

    const result = await refreshAccessToken(refreshToken);

    res.json(result);
  } catch (error) {
    console.error('Refresh token error:', error);
    const message = error instanceof Error ? error.message : 'Token refresh failed';
    res.status(401).json({ message });
  }
});

/**
 * POST /api/auth/logout
 * Revoke refresh token (logout)
 * Idempotent: always returns 200 even if token is already revoked
 */
router.post('/logout', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      // No token provided — still return success (client may already be logged out)
      return res.json({ message: 'Logged out successfully' });
    }

    await revokeRefreshToken(refreshToken);

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    // Always return 200 for logout — the client should clear local state regardless
    res.json({ message: 'Logged out successfully' });
  }
});

/**
 * GET /api/auth/me
 * Get current authenticated user
 */
router.get('/me', async (req: Request, res: Response) => {
  const authHeader = req.headers['authorization'];
  const xAccessToken = req.headers['x-access-token'] as string;

  let token: string | null = null;
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else if (xAccessToken) {
    token = xAccessToken;
  }

  if (!token) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  const decoded = verifyAccessToken(token);
  if (!decoded) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        status: true,
        authProvider: true,
        deletedAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Never serve profile data for soft-deleted accounts
    if ((user as any).deletedAt) {
      return res.status(401).json({ message: 'Account is deactivated' });
    }

    // Check if user is suspended
    if (user.status === 'suspended') {
      return res.status(403).json({ message: 'Account suspended' });
    }

    res.json({
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      status: user.status,
      authProvider: user.authProvider,
      forcePasswordChange: (user as any).forcePasswordChange ?? false,
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Failed to get user' });
  }
});

/**
 * POST /api/auth/reset-password
 * Self-service password reset using a valid reset token.
 */
router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ message: 'Token and new password are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }

    const user = await prisma.user.findFirst({
      where: {
        resetToken: token,
        resetTokenExpiry: { gte: new Date() },
        deletedAt: null,
      },
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }

    if (user.status === 'suspended') {
      return res.status(403).json({ message: 'Cannot reset password for a suspended account' });
    }

    const passwordHash = await hashPassword(newPassword);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        resetToken: null,
        resetTokenExpiry: null,
        forcePasswordChange: false,
      },
    });

    // Revoke all refresh tokens to force re-login
    await prisma.refreshToken.updateMany({
      where: { userId: user.id, isRevoked: false },
      data: { isRevoked: true },
    });

    console.log(`[Auth] Password reset completed for user: ${user.email}`);
    res.json({ message: 'Password has been reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Failed to reset password' });
  }
});

export default router;