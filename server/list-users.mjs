import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('../generated/prisma/index.js');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const [action, email] = process.argv.slice(2);
const users = await prisma.user.findMany({
  select: { id: true, email: true, role: true, deletedAt: true, lastLogin: true },
  orderBy: { deletedAt: 'asc' },
});

if (action === 'list') {
  console.log('ALL USERS IN DB:', users.length);
  for (const u of users) {
    console.log(
      (u.deletedAt ? 'DELETED ' : 'ACTIVE  '),
      u.email.padEnd(42),
      u.role.padEnd(12),
      u.deletedAt ? 'deletedAt=' + u.deletedAt.toISOString() : 'lastLogin=' + (u.lastLogin ? u.lastLogin.toISOString() : 'never')
    );
  }
} else if (action === 'restore' && email) {
  const r = await prisma.user.update({ where: { email }, data: { deletedAt: null } });
  console.log('RESTORED:', r.email);
} else if (action === 'purge' && email) {
  await prisma.user.delete({ where: { email } });
  console.log('PURGED (hard delete):', email);
} else {
  console.log('Usage: node list-users.mjs [list|restore <email>|purge <email>]');
}
await pool.end();
process.exit(0);
