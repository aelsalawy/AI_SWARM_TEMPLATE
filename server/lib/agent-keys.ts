import { Request, Response, NextFunction } from 'express';
import { getPrismaClient } from '../prisma';
import crypto from 'crypto';

const prisma = getPrismaClient();

/**
 * Generate a new agent key in the format "ak-<32 hex chars>"
 */
export function generateAgentKey(): string {
  const randomBytes = crypto.randomBytes(16);
  return `ak-${randomBytes.toString('hex')}`;
}

/**
 * Hash a plaintext key using SHA-256 for storage
 */
export function hashAgentKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * Constant-time comparison to prevent timing attacks
 */
export function constantTimeEqual(a: string, b: string): boolean {
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Middleware to verify agent key authentication
 * Updates lastUsedAt fire-and-forget
 */
export async function verifyAgentKeyAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Skip if not an agent key auth attempt
  const agentKey = req.headers['x-agent-key'] as string | undefined;
  const agentIdHeader = req.headers['x-agent-id'] as string | undefined;

  if (!agentKey || !agentIdHeader) {
    return next(); // Let other auth methods handle it
  }

  // Validate agentId format
  if (!agentIdHeader.startsWith('agent:')) {
    return res.status(401).json({ message: 'Invalid agent ID format' });
  }

  // Identity = FULL agent id ('agent:<name>') — keys are stored under full ids,
  // and downstream checks (task scoping, heartbeat self-report) compare against
  // full ids. No prefix stripping.
  const agentId = agentIdHeader;

  try {
    // Look up the key by agentId first (more efficient)
    const keyRecord = await prisma.agentKey.findFirst({
      where: {
        agentId,
        revokedAt: null
      }
    });

    if (!keyRecord) {
      return res.status(401).json({ message: 'Invalid agent key' });
    }

    // Constant-time compare the hashes
    const keyHash = hashAgentKey(agentKey);
    if (!constantTimeEqual(keyHash, keyRecord.keyHash)) {
      return res.status(401).json({ message: 'Invalid agent key' });
    }

    // Update lastUsedAt (fire-and-forget)
    prisma.agentKey.update({
      where: { id: keyRecord.id },
      data: { lastUsedAt: new Date() }
    }).catch(console.error);

    // Bind identity
    (req as any).user = {
      uid: agentId,
      agentId: agentId,
      agent: true,
    };
    (req as any).isAgent = true;

    return next();
  } catch (error) {
    console.error('[agent-key-auth] Error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Issue a new agent key (super_admin only)
 */
export async function issueAgentKey(
  agentId: string,
  name?: string
): Promise<{ id: string; key: string; createdAt: Date }> {
  // Check if agent exists
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) {
    throw new Error(`Agent not found: ${agentId}`);
  }

  // Generate key and hash
  const plaintextKey = generateAgentKey();
  const keyHash = hashAgentKey(plaintextKey);

  // Store in database
  const keyRecord = await prisma.agentKey.create({
    data: {
      agentId,
      name,
      keyHash,
    }
  });

  return {
    id: keyRecord.id,
    key: plaintextKey,
    createdAt: keyRecord.createdAt
  };
}

/**
 * List agent keys (super_admin only)
 */
export async function listAgentKeys(agentId: string) {
  return await prisma.agentKey.findMany({
    where: { agentId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      createdAt: true,
      lastUsedAt: true,
      revokedAt: true,
    }
  });
}

/**
 * Rotate an agent key (super_admin only)
 */
export async function rotateAgentKey(
  keyId: string
): Promise<{ id: string; key: string; createdAt: Date }> {
  // Get existing key
  const existingKey = await prisma.agentKey.findUnique({ where: { id: keyId } });
  if (!existingKey) {
    throw new Error(`Key not found: ${keyId}`);
  }

  if (existingKey.revokedAt !== null) {
    throw new Error(`Cannot rotate revoked key: ${keyId}`);
  }

  // Revoke old key
  await prisma.agentKey.update({
    where: { id: keyId },
    data: { revokedAt: new Date() }
  });

  // Issue new key for same agent
  return await issueAgentKey(existingKey.agentId, existingKey.name);
}

/**
 * Revoke an agent key (super_admin only)
 */
export async function revokeAgentKey(keyId: string): Promise<void> {
  await prisma.agentKey.update({
    where: { id: keyId },
    data: { revokedAt: new Date() }
  });
}