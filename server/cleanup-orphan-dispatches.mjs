// One-off: purge orphaned agentDispatch rows (itemId points at a deleted task/bug).
// These are unreachable rows left over from pre-1d69936 E2E cleanups (no cascade then).
// They also falsely trigger the in-flight cap (E7). Only orphans are removed.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('../generated/prisma/index.js');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const dispatches = await prisma.agentDispatch.findMany({ select: { id: true, itemType: true, itemId: true, agentId: true, pmState: true, wakeState: true, createdAt: true } });
const taskIds = new Set((await prisma.task.findMany({ select: { id: true } })).map(t => t.id));
const bugIds = new Set((await prisma.bug.findMany({ select: { id: true } })).map(b => b.id));

const orphans = dispatches.filter(d => d.itemType === 'task' ? !taskIds.has(d.itemId) : d.itemType === 'bug' ? !bugIds.has(d.itemId) : false);
console.log(`total dispatch rows: ${dispatches.length}, orphans: ${orphans.length}`);
const byAgent = {};
for (const o of orphans) byAgent[o.agentId] = (byAgent[o.agentId] || 0) + 1;
console.log('orphans by agent:', JSON.stringify(byAgent));

// open (cap-counting) orphans vs terminal ones
const openOrphans = orphans.filter(o => o.pmState === 'pending' || o.wakeState === 'pending' || o.wakeState === 'sent' || o.wakeState === 'notified');
console.log(`open orphans (cap-counting): ${openOrphans.length}`);
for (const o of openOrphans.slice(0, 10)) console.log(`  ${o.id} ${o.itemType}/${o.itemId.slice(0,12)}… agent=${o.agentId} pm=${o.pmState} wake=${o.wakeState}`);

if (process.argv[2] === '--purge' && orphans.length) {
  const r = await prisma.agentDispatch.deleteMany({ where: { id: { in: orphans.map(o => o.id) } } });
  console.log(`purged ${r.count} orphan dispatch rows`);
}

await pool.end();
process.exit(0);