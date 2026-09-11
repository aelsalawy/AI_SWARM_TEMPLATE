// One-off: apply bug_attachments table migration + record it in _prisma_migrations
import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(__dirname, '..', 'prisma', 'migrations', '20260907090000_add_bug_attachments', 'migration.sql'), 'utf8');
// .env is the source of truth in this container (process.env.DATABASE_URL is empty outside server runtime)
const envUrl = readFileSync(join(__dirname, '..', '.env'), 'utf8').match(/DATABASE_URL="([^"]+)"/)?.[1];
const dbUrl = process.env.DATABASE_URL || envUrl;
if (!dbUrl) throw new Error('No DATABASE_URL (env or .env)');
const pool = new Pool({ connectionString: dbUrl });
async function main() {
  // Idempotent: skip if table already exists
  const exists = await pool.query(`SELECT to_regclass('public.bug_attachments') AS t`);
  if (exists.rows[0].t) {
    console.log('ℹ️  bug_attachments already exists — skipping CREATE');
  } else {
    await pool.query(sql);
    console.log('✅ bug_attachments table created');
  }

  // Record migration so future `prisma migrate deploy` skips it
  const migName = '20260907090000_add_bug_attachments';
  const recorded = await pool.query(`SELECT 1 FROM _prisma_migrations WHERE migration_name = $1`, [migName]);
  if (recorded.rowCount === 0) {
    await pool.query(
      `INSERT INTO _prisma_migrations (id, checksum, started_at, finished_at, migration_name, logs, applied_steps_count)
       VALUES ($1, $2, NOW(), NOW(), $3, 'applied manually via apply-bug-attachments-migration.ts (deploy blocked by 20260906 drift)', 1)`,
      [randomUUID(), 'manual', migName]
    );
    console.log('✅ recorded in _prisma_migrations');
  } else {
    console.log('ℹ️  already recorded');
  }
}

main()
  .then(() => pool.end())
  .catch((e) => { console.error('❌', e.message); pool.end(); process.exit(1); });