/**
 * Prisma Client — ALM Database (alm_auth_db)
 * ADR-003: Dedicated database for ALM app (auth + domain tables).
 * Uses pg adapter for connection pooling.
 * Falls back to no-op proxy when PostgreSQL is unavailable.
 *
 * Uses dynamic import() for ESM compatibility (tsx runs as ESM).
 */

import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

// Use custom-generated Prisma client (workaround for root-owned node_modules)
const __dirname = dirname(fileURLToPath(import.meta.url));
const generatedClientDir = join(__dirname, '..', 'generated', 'prisma');

let _prismaClient: any = null;
let _initError: string | null = null;
let _initPromise: Promise<any> | null = null;

async function createPrismaClient(): Promise<any> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    _initError = 'DATABASE_URL not set';
    console.warn('⚠️  DATABASE_URL not set — Prisma data routes will return empty results');
    return null;
  }

  try {
    // Dynamic import from custom-generated client location
    const indexPath = join(generatedClientDir, 'index.js');
    const { PrismaClient } = await import(indexPath);

    // Force use of pg adapter for connection pooling
    let adapter: any = undefined;
    try {
      const { PrismaPg } = await import('@prisma/adapter-pg');
      const { Pool } = await import('pg');
      const pool = new Pool({
        connectionString: dbUrl,
        connectionTimeoutMillis: 3000,
        max: 5,
      });
      adapter = new PrismaPg(pool);
      console.log('✅ Using pg adapter for connection pooling');
    } catch (err: any) {
      throw new Error(`pg adapter required: ${err.message}`);
    }

    if (!adapter) {
      throw new Error('pg adapter initialization failed');
    }

    const client = new PrismaClient({ adapter, log: ['warn', 'error'] });
    console.log('✅ ALM PrismaClient initialized → alm_auth_db');
    return client;
  } catch (err: any) {
    _initError = err.message;
    console.warn(`⚠️  ALM PrismaClient initialization failed: ${err.message}`);
    console.warn('   Data routes will return empty results. Health/auth routes unaffected.');
    return null;
  }
}

function createNoopProxy(): any {
  const noopModel = new Proxy({}, {
    get(_target, prop) {
      if (prop === 'then') return undefined;
      return (..._args: any[]) => {
        const method = String(prop);
        if (method === 'findUnique' || method === 'findFirst') {
          return Promise.resolve(null);
        }
        if (method === 'count') return Promise.resolve(0);
        if (method === 'create' || method === 'update' || method === 'delete' || method === 'upsert') {
          return Promise.reject(new Error(`Database unavailable: ${_initError || 'Prisma not initialized'}`));
        }
        return Promise.resolve([]);
      };
    },
  });

  return new Proxy({}, {
    get(_target, prop) {
      if (prop === '$connect') return () => Promise.resolve();
      if (prop === '$disconnect') return () => Promise.resolve();
      if (prop === '$transaction') return (fn: Function) => fn(createNoopProxy());
      if (prop === '$on' || prop === '$use') return () => {};
      if (typeof prop === 'string' && !prop.startsWith('$') && !prop.startsWith('_')) {
        return noopModel;
      }
      return undefined;
    },
  });
}

export function getPrismaClient(): any {
  if (!_prismaClient && !_initPromise) {
    _initPromise = createPrismaClient().then(client => {
      _prismaClient = client;
      return client;
    });
  }
  if (_prismaClient) return _prismaClient;
  if (_initPromise) {
    // If initialization is in progress, return a proxy that waits for initialization
    const noopProxy = createNoopProxy();
    return new Proxy(noopProxy, {
      get(target, prop) {
        // For any property access, check if the client is now initialized
        if (_prismaClient) {
          return _prismaClient[prop];
        }
        // If not initialized yet, wait a bit and try again
        if (typeof _initPromise.then === 'function') {
          _initPromise.then(() => {
            // Client is now initialized, but we can't change the proxy
            // This is a limitation of the current approach
          });
        }
        return target[prop];
      }
    });
  }
  return createNoopProxy();
}

export const prisma = getPrismaClient();
export default prisma;
