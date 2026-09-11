// One-off: purge leftover [E2E]/[qa-probe] test bugs incl. FK children (API delete blocked on stale server; cascade fix not yet live)
import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const url = readFileSync(join(__dirname, '..', '.env'), 'utf8').match(/DATABASE_URL="([^"]+)"/)?.[1];
const pool = new Pool({ connectionString: url });

const TARGETS = [
  'cmtqxvk6a0079iilco2kz72u3', // [E2E-TEST]
  'cmtqxzlcy008ciilcn1oh22f3', // [E2E-V2] lifecycle + delete verification
];

async function main() {
  for (const id of TARGETS) {
    const bug = await pool.query('SELECT id, title FROM bugs WHERE id = $1', [id]);
    if (bug.rowCount === 0) { console.log(`- ${id}: not found (already gone)`); continue; }
    const title = bug.rows[0].title;
    if (!/^\[(E2E|qa-probe)/i.test(title)) { console.log(`⚠️ ${id}: title "${title}" is not a test artifact — SKIPPING`); continue; }
    const h = await pool.query('DELETE FROM bug_history WHERE "bugId" = $1', [id]);
    const c = await pool.query('DELETE FROM bug_comments WHERE "bugId" = $1', [id]);
    const a = await pool.query('DELETE FROM bug_attachments WHERE "bugId" = $1', [id]);
    const rb = await pool.query('DELETE FROM requirement_bugs WHERE "bugId" = $1', [id]);
    const trb = await pool.query('DELETE FROM test_run_bugs WHERE "bugId" = $1', [id]);
    const d = await pool.query('DELETE FROM bugs WHERE id = $1', [id]);
    console.log(`✅ ${id} "${title}" deleted (history:${h.rowCount} comments:${c.rowCount} attachments:${a.rowCount} reqlinks:${rb.rowCount} runlinks:${trb.rowCount})`);
  }
  const left = await pool.query("SELECT count(*)::int AS n FROM bugs WHERE title LIKE '[E2E%' OR title LIKE '[qa-probe%'");
  console.log(`remaining test bugs: ${left.rows[0].n}`);
}

main()
  .then(() => pool.end())
  .catch((e) => { console.error('❌', e.message); pool.end(); process.exit(1); });