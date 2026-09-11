require('dotenv').config({ path: './.env' });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
(async () => {
  const res = await pool.query(`SELECT id, title, priority, epic, status FROM "tasks" WHERE "projectId" = $1 AND (title ILIKE $2 OR title ILIKE $3 OR title ILIKE $4 OR title ILIKE $5) ORDER BY title`, ['pL8ZIF7gJssSQgQgYcjN', '%P3-1%','%P3-2%','%P3-3%','%P3-4%']);
  console.log('=== P3 UI tasks ===');
  for (const row of res.rows) console.log(JSON.stringify(row));
  await pool.end();
})();
