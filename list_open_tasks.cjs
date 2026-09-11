require('dotenv').config({ path: './.env' });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  const q = `SELECT id, title, priority, epic, status FROM "tasks" WHERE "projectId" = $1 AND status <> $2 ORDER BY "priority" DESC`;
  const values = ['pL8ZIF7gJssSQgQgYcjN', 'DONE'];
  const res = await pool.query(q, values);
  console.log('=== Open tasks for AI_SWARM_ALM ===');
  for (const row of res.rows) {
    console.log(`ID=${row.id} | Title=${row.title} | Priority=${row.priority} | Epic=${row.epic} | Status=${row.status}`);
  }
  await pool.end();
})();
