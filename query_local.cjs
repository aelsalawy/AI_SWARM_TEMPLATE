const { Client } = require('pg');
const myId = 'agent:uidev:subagent:1125577e-6cf5-49a1-aade-a5e0567c0a67';
const client = new Client({ connectionString: 'postgresql://postgres@127.0.0.1:55432/ai_swarm_alm?schema=public' });
(async () => {
  await client.connect();
  const byAgent = await client.query('SELECT id, title, status, priority, "assignedAgentId", "createdBy" FROM "Task" WHERE "assignedAgentId" = $1', [myId]);
  console.log('=== LOCAL assigned to my subagent ID ===');
  console.log(JSON.stringify(byAgent.rows, null, 2));
  const byCreated = await client.query('SELECT id, title, status, priority, "assignedAgentId", "createdBy" FROM "Task" WHERE "createdBy" = $1', [myId]);
  console.log('\n=== LOCAL createdBy = my subagent ID ===');
  console.log(JSON.stringify(byCreated.rows, null, 2));
  const uidevOpen = await client.query('SELECT id, title, status, priority, "assignedAgentId" FROM "Task" WHERE "assignedAgentId" = $1 AND status != $2', ['agent:uidev','DONE']);
  console.log('\n=== LOCAL open tasks for agent:uidev ===');
  console.log(JSON.stringify(uidevOpen.rows, null, 2));
  await client.end();
})().catch(e=>{console.error('ERR',e.message);process.exit(1);});
