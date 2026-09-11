require('dotenv').config({ path: './.env' });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  try {
    const res = await pool.query(
      `SELECT id, title, priority, epic, status, "assignedAgentId" FROM "tasks" WHERE "projectId" = $1 AND status <> $2 ORDER BY priority DESC`,
      ['pL8ZIF7gJssSQgQgYcjN', 'DONE']
    );
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (e) {
    console.error('Error:', e);
  } finally {
    await pool.end();
  }
})();
