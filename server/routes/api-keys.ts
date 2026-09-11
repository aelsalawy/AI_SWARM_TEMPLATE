import { Router, Request, Response } from 'express';
import { randomBytes, createHash } from 'crypto';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getPrismaClient } from '../prisma';

/**
 * P3-4: API Key Management.
 *
 * Admins (super_admin) can generate and revoke API keys used to authenticate
 * machine-to-machine calls (agents, CI, external tools).
 *
 * Keys are stored server-side in a JSON file (data/api-keys.json) to avoid
 * requiring a Prisma schema migration on the live database. Each key is
 * displayed in full only once at creation time; only its masked form + hash
 * is stored afterward.
 */

const router = Router();
const prisma = getPrismaClient();

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', '..', 'data');
const KEYS_FILE = join(DATA_DIR, 'api-keys.json');

interface ApiKeyRecord {
  id: string;
  name: string;
  prefix: string;
  hash: string;          // sha256 of the full key
  createdAt: string;
  lastUsedAt?: string | null;
  revoked: boolean;
  revokedAt?: string | null;
  createdBy: string;
}

let keyStore: ApiKeyRecord[] | null = null;

async function ensureFile(): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.access(KEYS_FILE);
  } catch {
    await fs.writeFile(KEYS_FILE, JSON.stringify([], null, 2));
  }
}

async function loadKeys(): Promise<ApiKeyRecord[]> {
  await ensureFile();
  if (keyStore) return keyStore;
  const raw = await fs.readFile(KEYS_FILE, 'utf-8');
  try {
    keyStore = JSON.parse(raw || '[]') as ApiKeyRecord[];
  } catch {
    keyStore = [];
  }
  return keyStore;
}

async function persistKeys(keys: ApiKeyRecord[]): Promise<void> {
  keyStore = keys;
  await fs.writeFile(KEYS_FILE, JSON.stringify(keys, null, 2));
}

// Mask a key for display: "sk_live_••••abcd"
function maskKey(prefix: string): string {
  return `${prefix}••••••••`;
}

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

// Auth guard: super_admin only.
async function requireAdmin(req: Request, res: Response): Promise<boolean> {
  const user = (req as any).user;
  if (!user?.userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return false;
  }
  try {
    const dbUser = await prisma.user?.findUnique?.({ where: { id: user.userId } });
    if (!dbUser || dbUser.role !== 'super_admin') {
      res.status(403).json({ message: 'Forbidden: Admin access required' });
      return false;
    }
    return true;
  } catch {
    res.status(503).json({ message: 'Database unavailable for role check' });
    return false;
  }
}

// GET /api/api-keys — list keys (masked), admin only
router.get('/', async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  const keys = await loadKeys();
  res.json(keys.map((k) => ({
    id: k.id,
    name: k.name,
    prefix: k.prefix,
    // Return only masked for display in the UI.
    masked: maskKey(k.prefix),
    createdAt: k.createdAt,
    lastUsedAt: k.lastUsedAt || null,
    revoked: k.revoked,
    revokedAt: k.revokedAt || null,
    createdBy: k.createdBy,
  })));
});

// POST /api/api-keys — generate a new key, admin only
router.post('/', async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  const name = (req.body?.name || '').toString().trim();
  if (!name) {
    return res.status(400).json({ message: 'name is required' });
  }

  const keys = await loadKeys();

  // sk_live_ + 32 random bytes → 43-char key.
  const secret = `sk_live_${randomBytes(32).toString('base64url')}`;
  const id = `key_${randomBytes(6).toString('hex')}`;
  const prefix = secret.slice(0, 12);

  const record: ApiKeyRecord = {
    id,
    name,
    prefix,
    hash: hashKey(secret),
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
    revoked: false,
    revokedAt: null,
    createdBy: (req as any).user?.userId || 'unknown',
  };

  await persistKeys([record, ...keys]);

  // Audit log
  try {
    await prisma.auditLog?.create?.({
      data: {
        action: 'create',
        entityType: 'api_key',
        entityId: id,
        userId: (req as any).user?.userId,
        changes: { name } as any,
      },
    });
  } catch (_) {}

  // Return full secret ONCE.
  res.status(201).json({ ...record, masked: maskKey(prefix), key: secret });
});

// POST /api/api-keys/:id/revoke — revoke an existing key
router.post('/:id/revoke', async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  const keys = await loadKeys();
  const idx = keys.findIndex((k) => k.id === req.params.id);
  if (idx === -1) return res.status(404).json({ message: 'API key not found' });

  keys[idx] = { ...keys[idx], revoked: true, revokedAt: new Date().toISOString() };
  await persistKeys(keys);

  try {
    await prisma.auditLog?.create?.({
      data: {
        action: 'delete',
        entityType: 'api_key',
        entityId: req.params.id,
        userId: (req as any).user?.userId,
        changes: { revoked: true } as any,
      },
    });
  } catch (_) {}

  res.json({ ...keys[idx], masked: maskKey(keys[idx].prefix) });
});

// DELETE /api/api-keys/:id — remove a key entirely
router.delete('/:id', async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  const keys = await loadKeys();
  const remaining = keys.filter((k) => k.id !== req.params.id);
  if (remaining.length === keys.length) {
    return res.status(404).json({ message: 'API key not found' });
  }
  await persistKeys(remaining);
  res.json({ success: true });
});

export default router;
