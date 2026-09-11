/**
 * Run the agent_chats migration directly against PostgreSQL
 */
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env') });
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '.env') });

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: dbUrl });

  try {
    const migrationPath = join(__dirname, '..', 'prisma', 'migrations', '20260710220000_agent_chats', 'migration.sql');
    const sql = readFileSync(migrationPath, 'utf-8');
    
    console.log('Running migration: agent_chats table...');
    await pool.query(sql);
    console.log('✅ Migration completed successfully');
    
    // Verify
    const result = await pool.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_name = 'agent_chats'
    `);
    if (result.rows.length > 0) {
      console.log('✅ agent_chats table exists');
    } else {
      console.log('❌ agent_chats table not found');
    }
  } catch (err: any) {
    console.error('Migration error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
