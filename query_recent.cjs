const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:password@76.13.151.30:5434/alm_auth_db?schema=public' });
(async () => {
  await client.connect();
  // Recent tasks (last 30 days) not DONE, any agent
  const recent = await client.query(
    `SELECT id, title, status, priority, epic, "assignedAgentId", "ownerId", "createdAt" 
     FROM tasks WHERE status != 'DONE' ORDER BY "createdAt" DESC LIMIT 30`);
  console.log('=== Recent non-DONE tasks (prod) ===');
  for (const r of recent.rows) {
    console.log(`[${r.status}] [${r.priority}] ${r.title} | agent=${r.assignedAgentId||'-'} | owner=${r.ownerId} | created=${r.createdAt}`);
  }
  // Any task mentioning uidev subagent or this session
  const mine = await client.query(
    `SELECT id, title, status, "assignedAgentId", "ownerId" FROM tasks 
     WHERE "assignedAgentId" LIKE '%uidev%' OR "ownerId" LIKE '%uidev%' OR title ILIKE '%subagent%'`);
  console.log('\n=== tasks referencing uidev/subagent ===');
  console.log(JSON.stringify(mine.rows, null, 2));
  await client.end();
})().catch(e=>{console.error('ERR',e.message);process.exit(1);});
