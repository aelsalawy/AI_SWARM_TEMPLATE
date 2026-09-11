// Provision per-agent ALM keys for dispatch pilot (Task 10, Newey)
// Usage: node provision-agent-keys.mjs <agentId> [...more]
// Revokes any existing active key for the agent, issues a fresh ak- key, prints plaintext ONCE.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('../generated/prisma/index.js');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const crypto = require('crypto');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const agents = process.argv.slice(2);
if (!agents.length) { console.error('usage: node provision-agent-keys.mjs <agentId...>'); process.exit(1); }

for (const agentId of agents) {
  const existing = await prisma.agentKey.findMany({ where: { agentId, revokedAt: null } });
  for (const k of existing) {
    await prisma.agentKey.update({ where: { id: k.id }, data: { revokedAt: new Date() } });
    console.error(`REVOKED existing key ${k.id} (${k.name || 'unnamed'}) for ${agentId}`);
  }
  const plaintext = `ak-${crypto.randomBytes(16).toString('hex')}`;
  const keyHash = crypto.createHash('sha256').update(plaintext).digest('hex');
  await prisma.agentKey.create({ data: { agentId, name: 'dispatch-v1-pilot', keyHash } });
  console.log(`${agentId}\t${plaintext}`);
}
await pool.end();
process.exit(0);