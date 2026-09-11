const { Client } = require('pg');
const myId = 'agent:uidev:subagent:1125577e-6cf5-49a1-aade-a5e0567c0a67';

async function run(url, label) {
  const client = new Client({ connectionString: url });
  try {
    await client.connect();
    console.log(`\n########## ${label} ##########`);
    const byAgent = await client.query(
      'SELECT id, title, status, priority, epic, "projectId" FROM "Task" WHERE "assignedAgentId" = $1', [myId]);
    console.log('=== assigned to my subagent ID ===');
    console.log(JSON.stringify(byAgent.rows, null, 2));

    const byOwner = await client.query(
      'SELECT id, title, status, priority, epic, "projectId" FROM "Task" WHERE "ownerId" = $1', [myId]);
    console.log('=== ownerId = my subagent ID ===');
    console.log(JSON.stringify(byOwner.rows, null, 2));

    const uidevOpen = await client.query(
      'SELECT id, title, status, priority, epic, "projectId" FROM "Task" WHERE "assignedAgentId" = $1 AND status != $2',
      ['agent:uidev', 'DONE']);
    console.log('=== open tasks for agent:uidev ===');
    console.log(JSON.stringify(uidevOpen.rows, null, 2));
  } catch (e) {
    console.error(`ERR ${label}:`, e.message);
  } finally {
    await client.end();
  }
}

(async () => {
  await run('postgresql://postgres:password@76.13.151.30:5434/alm_auth_db?schema=public', 'REMOTE alm_auth_db');
  await run('postgresql://postgres@127.0.0.1:55432/ai_swarm_alm?schema=public', 'LOCAL ai_swarm_alm');
})();
