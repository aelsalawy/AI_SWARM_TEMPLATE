// ALM status query utility (CTO ops) — read-only DB inspection for tasks/bugs.
// Usage: node query-status.mjs [tasks|bugs|all|dispatches] [--open]
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('../generated/prisma/index.js');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const what = process.argv[2] || 'all';
const onlyOpen = process.argv.includes('--open');

if (what === 'tasks' || what === 'all') {
  const tasks = await prisma.task.findMany({
    where: onlyOpen ? { status: { in: ['TODO', 'IN_PROGRESS', 'REVIEW'] } } : {},
    select: { id: true, title: true, status: true, priority: true, assignedAgentId: true },
    orderBy: { createdAt: 'desc' },
  });
  console.log(`=== TASKS${onlyOpen ? ' (open)' : ''}: ${tasks.length} ===`);
  for (const t of tasks) console.log(`${t.status.padEnd(12)} ${t.priority ?? '-'.padEnd(6)} ${t.id} ${t.assignedAgentId ?? '-'} | ${t.title}`);
}
if (what === 'bugs' || what === 'all') {
  const bugs = await prisma.bug.findMany({
    where: onlyOpen ? { status: { in: ['Open', 'In_Progress'] } } : {},
    select: { id: true, title: true, status: true, priority: true, assignedAgentId: true },
    orderBy: { createdAt: 'desc' },
  });
  console.log(`=== BUGS${onlyOpen ? ' (open)' : ''}: ${bugs.length} ===`);
  for (const b of bugs) console.log(`${b.status.padEnd(12)} ${b.priority ?? '-'.padEnd(8)} ${b.id} ${b.assignedAgentId ?? '-'} | ${b.title}`);
}
if (what === 'dispatches') {
  const rows = await prisma.agentDispatch.findMany({
    select: { id: true, agentId: true, itemType: true, itemId: true, pmState: true, wakeState: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  console.log(`=== DISPATCH ROWS: ${rows.length} ===`);
  for (const d of rows) console.log(`${d.createdAt?.toISOString?.()} ${d.agentId} ${d.itemType}/${d.itemId} pm=${d.pmState} wake=${d.wakeState}`);
}

await pool.end();
process.exit(0);