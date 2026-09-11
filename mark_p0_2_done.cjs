require('dotenv').config({ path: './.env' });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  const taskId = 'cmstcr7rs0003m3lcrkpuyl7w';
  console.log(`Updating task ${taskId} to DONE...`);
  try {
    await pool.query('UPDATE "tasks" SET status = $1 WHERE id = $2', ['DONE', taskId]);
    console.log('✅ Task marked as DONE');
  } catch (e) {
    console.error('❌ Failed to update task:', e);
  } finally {
    await pool.end();
  }
})();
