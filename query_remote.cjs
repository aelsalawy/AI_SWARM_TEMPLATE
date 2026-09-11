const { Client } = require('pg');
const myId = 'agent:uidev:subagent:1125577e-6cf5-49a1-aade-a5e0567c0a67';
const client = new Client({ connectionString: 'postgresql://postgres:password@76.13.151.30:5434/alm_auth_db?schema=public' });
(async () => {
  await client.connect();
  const cols = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name='tasks'");
  console.log('tasks columns:', cols.rows.map(r=>r.column_name).join(', '));
  const byAgent = await client.query('SELECT * FROM tasks WHERE "assignedAgentId" = $1', [myId]);
  console.log('\n=== assigned to my subagent ID ===');
  console.log(JSON.stringify(byAgent.rows, null, 2));
  const byOwner = await client.query('SELECT * FROM tasks WHERE "ownerId" = $1', [myId]);
  console.log('\n=== ownerId = my subagent ID ===');
  console.log(JSON.stringify(byOwner.rows, null, 2));
  const uidevOpen = await client.query('SELECT id, title, status, priority, epic, "projectId" FROM tasks WHERE "assignedAgentId" = $1 AND status != $2', ['agent:uidev','DONE']);
  console.log('\n=== open tasks for agent:uidev ===');
  console.log(JSON.stringify(uidevOpen.rows, null, 2));
  await client.end();
})().catch(e=>{console.error('ERR',e.message);process.exit(1);});
