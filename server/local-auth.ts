import { prisma } from './prisma';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const BCRYPT_COST = 12; // Cost factor ≥ 12 as required

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';
const JWT_EXPIRES_IN = '15m'; // Access token: 15 minutes
const REFRESH_TOKEN_EXPIRES_DAYS = 7; // Refresh token: 7 days

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    role: string;
    firstName?: string;
    lastName?: string;
  };
}

/**
 * Hash a password using bcrypt with cost factor ≥ 12
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

/**
 * Verify a password against a bcrypt hash.
 * Supports both bcrypt hashes and legacy PBKDF2 hashes for migration.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  // bcrypt hashes start with $2a$, $2b$, or $2y$
  if (storedHash.startsWith('$2')) {
    return bcrypt.compare(password, storedHash);
  }

  // Legacy PBKDF2 format: salt:hash
  const crypto = await import('crypto');
  const [salt, hash] = storedHash.split(':');
  if (!salt || !hash) return false;
  const verifyHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return hash === verifyHash;
}

/**
 * Generate a JWT access token
 */
export function generateAccessToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Generate a secure random refresh token
 */
export function generateRefreshToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 64; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

/**
 * Generate both access and refresh tokens for a user
 */
export async function generateTokens(userId: string): Promise<{ accessToken: string; refreshToken: string }> {
  // Get user details
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user || user.deletedAt) {
    throw new Error('User not found');
  }

  if (user.status === 'suspended') {
    throw new Error('Account suspended');
  }

  // Generate tokens
  const accessToken = generateAccessToken({
    userId: user.id,
    email: user.email,
    role: user.role,
  });

  const refreshToken = generateRefreshToken();

  // Store refresh token in database
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      token: refreshToken,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000),
    },
  });

  return { accessToken, refreshToken };
}

/**
 * Verify and decode a JWT access token
 */
export function verifyAccessToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch {
    return null;
  }
}

/**
 * Register a new user
 */
export async function registerUser(data: {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  role?: string;
}): Promise<AuthTokens> {
  // Check if user exists
  const existingUser = await prisma.user.findUnique({
    where: { email: data.email },
  });

  if (existingUser) {
    throw new Error('User already exists');
  }

  // Hash password
  const passwordHash = await hashPassword(data.password);

  // Create user
  const user = await prisma.user.create({
    data: {
      email: data.email,
      passwordHash,
      firstName: data.firstName || '',
      lastName: data.lastName || '',
      role: (data.role as any) || 'manager',
    },
  });

  // Generate tokens
  const accessToken = generateAccessToken({
    userId: user.id,
    email: user.email,
    role: user.role,
  });

  const refreshToken = generateRefreshToken();

  // Store refresh token in database
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      token: refreshToken,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000),
    },
  });

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
    },
  };
}

/**
 * Login a user
 */
export async function loginUser(email: string, password: string, ipAddress?: string, userAgent?: string): Promise<AuthTokens> {
  // Find user
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user || user.deletedAt) {
    // Soft-deleted users must not be able to log in.
    // Same error as unknown user to avoid leaking account existence.
    throw new Error('Invalid credentials');
  }

  if (user.status === 'suspended') {
    throw new Error('Account suspended. Contact an administrator.');
  }

  // Check if account is locked
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new Error('Account temporarily locked due to too many failed attempts');
  }

  // Verify password
  const isValid = await verifyPassword(password, user.passwordHash);

  if (!isValid) {
    // Increment login attempts
    const attempts = (user.loginAttempts || 0) + 1;
    const lockedUntil = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null; // Lock for 15 minutes after 5 failed attempts

    await prisma.user.update({
      where: { id: user.id },
      data: {
        loginAttempts: attempts,
        lockedUntil,
      },
    });

    throw new Error('Invalid credentials');
  }

  // Reset login attempts and update last login
  await prisma.user.update({
    where: { id: user.id },
    data: {
      loginAttempts: 0,
      lockedUntil: null,
      lastLogin: new Date(),
    },
  });

  // Log login history
  if (ipAddress) {
    await prisma.loginHistory.create({
      data: {
        userId: user.id,
        ip: ipAddress,
        device: userAgent || 'Unknown',
        userAgent: userAgent || 'Unknown',
      },
    });
  }

  // Generate tokens
  const accessToken = generateAccessToken({
    userId: user.id,
    email: user.email,
    role: user.role,
  });

  const refreshToken = generateRefreshToken();

  // Store refresh token in database
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      token: refreshToken,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000),
    },
  });

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
    },
  };
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string }> {
  // Find refresh token in database
  const tokenRecord = await prisma.refreshToken.findUnique({
    where: { token: refreshToken },
  });

  if (!tokenRecord) {
    throw new Error('Invalid refresh token');
  }

  // Check if token is revoked or expired
  if (tokenRecord.isRevoked || tokenRecord.expiresAt < new Date()) {
    throw new Error('Refresh token expired or revoked');
  }

  // Look up the user separately (no relation on RefreshToken model)
  const user = await prisma.user.findUnique({
    where: { id: tokenRecord.userId },
  });

  if (!user || user.deletedAt) {
    // Soft-deleted user: revoke the token so it can't be reused
    await prisma.refreshToken.update({
      where: { token: refreshToken },
      data: { isRevoked: true },
    }).catch(() => {});
    throw new Error('User not found');
  }

  if (user.status === 'suspended') {
    // Suspended user: revoke the refresh token to force re-authentication
    await prisma.refreshToken.update({
      where: { token: refreshToken },
      data: { isRevoked: true },
    }).catch(() => {});
    throw new Error('Account suspended');
  }

  // Generate new access token
  const accessToken = generateAccessToken({
    userId: user.id,
    email: user.email,
    role: user.role,
  });

  return { accessToken };
}

/**
 * Revoke a refresh token (logout)
 * Idempotent: succeeds even if token doesn't exist or is already revoked
 */
export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  try {
    await prisma.refreshToken.update({
      where: { token: refreshToken },
      data: { isRevoked: true },
    });
  } catch (error: any) {
    // P2025 = record not found — token may already be revoked/expired, which is fine for logout
    if (error?.code === 'P2025') {
      console.log('[Auth] Refresh token not found during revoke (already revoked or expired):', refreshToken.substring(0, 8) + '...');
      return;
    }
    throw error;
  }
}

/**
 * Verify request authentication
 */
export async function verifyRequestAuth(req: any): Promise<JWTPayload | null> {
  // Check Authorization header
  const authHeader = req.headers['authorization'];
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const decoded = verifyAccessToken(token);
    if (decoded) return decoded;
  }

  // Check X-Access-Token header
  const accessToken = req.headers['x-access-token'] as string;
  if (accessToken) {
    const decoded = verifyAccessToken(accessToken);
    if (decoded) return decoded;
  }

  return null;
}