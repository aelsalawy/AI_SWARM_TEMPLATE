// Verify bug_attachments table + FK + migration record
import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const url = readFileSync(join(__dirname, '..', '.env'), 'utf8').match(/DATABASE_URL="([^"]+)"/)?.[1];
const pool = new Pool({ connectionString: url });

async function main() {
  const r = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='bug_attachments' ORDER BY ordinal_position");
  console.log('columns:', r.rows.map((c: any) => `${c.column_name}:${c.data_type}`).join(', '));
  const fks = await pool.query("SELECT conname, confdeltype FROM pg_constraint WHERE conrelid='bug_attachments'::regclass AND contype='f'");
  console.log('FK:', fks.rows.map((f: any) => `${f.conname} (onDelete:${f.confdeltype})`));
  const migs = await pool.query("SELECT migration_name FROM _prisma_migrations WHERE migration_name LIKE '%bug_attachments%'");
  console.log('migration recorded:', migs.rows.map((m: any) => m.migration_name));
}

main()
  .then(() => pool.end())
  .catch((e) => { console.error('❌', e.message); pool.end(); process.exit(1); });