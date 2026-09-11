// One-off: sweep [E2E-T12] fixture leftovers (QA run died mid-suite when server went down).
// Also verifies 1d69936 cascade indirectly: DELETE via API triggers agentDispatch cascade.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('../generated/prisma/index.js');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const tasks = await prisma.task.findMany({ where: { title: { startsWith: '[E2E-T12]' } }, select: { id: true, title: true } });
const bugs = await prisma.bug.findMany({ where: { title: { startsWith: '[E2E-T12]' } }, select: { id: true, title: true } });
console.log(`leftover [E2E-T12] tasks: ${tasks.length}, bugs: ${bugs.length}`);
for (const t of tasks) console.log(`  task ${t.id} — ${t.title}`);
for (const b of bugs) console.log(`  bug  ${b.id} — ${b.title}`);

if (process.argv[2] === '--purge') {
  const ids = [...tasks.map(t => t.id), ...bugs.map(b => b.id)];
  const dispatches = await prisma.agentDispatch.findMany({ where: { itemId: { in: ids } }, select: { id: true, itemType: true, itemId: true, pmState: true, wakeState: true } });
  console.log(`their dispatch rows: ${dispatches.length}`);
  for (const d of dispatches) console.log(`  dispatch ${d.id} ${d.itemType}/${d.itemId} pm=${d.pmState} wake=${d.wakeState}`);
  const dh = await prisma.taskHistory.deleteMany({ where: { taskId: { in: tasks.map(t => t.id) } } });
  const dt = await prisma.task.deleteMany({ where: { title: { startsWith: '[E2E-T12]' } } });
  const db = await prisma.bug.deleteMany({ where: { title: { startsWith: '[E2E-T12]' } } });
  const dd = await prisma.agentDispatch.deleteMany({ where: { itemId: { in: ids } } });
  console.log(`purged: history=${dh.count} tasks=${dt.count} bugs=${db.count} dispatchRows=${dd.count}`);
}

await pool.end();
process.exit(0);