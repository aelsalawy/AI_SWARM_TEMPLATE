const { Client } = require('pg');
async function run(url, label) {
  const client = new Client({ connectionString: url });
  try {
    await client.connect();
    console.log(`\n########## ${label} ##########`);
    const tables = await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public'");
    console.log('TABLES:', tables.rows.map(r=>r.tablename).join(', '));
    const cols = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name='Task'");
    console.log('Task columns:', cols.rows.map(r=>r.column_name).join(', '));
  } catch (e) { console.error(`ERR ${label}:`, e.message); }
  finally { await client.end(); }
}
(async () => {
  await run('postgresql://postgres:password@76.13.151.30:5434/alm_auth_db?schema=public', 'REMOTE alm_auth_db');
  await run('postgresql://postgres@127.0.0.1:55432/ai_swarm_alm?schema=public', 'LOCAL ai_swarm_alm');
})();
