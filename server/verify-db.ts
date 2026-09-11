import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

import { createRequire } from 'module';

// Read .env
const envPath = join(__dirname, '..', '.env');
const envContent = readFileSync(envPath, 'utf-8');
const DATABASE_URL = envContent.match(/DATABASE_URL="(.+)"/)?.[1];
const DEFAULT_OWNER_ID = envContent.match(/DEFAULT_OWNER_ID=(.+)/)?.[1];

console.log('🔗 DATABASE_URL:', DATABASE_URL);
console.log('🔑 DEFAULT_OWNER_ID:', DEFAULT_OWNER_ID);

const { Pool } = require('pg');
const pool = new Pool({ connectionString: DATABASE_URL });

async function check() {
  try {
    await pool.connect();
    console.log('✅ Connected to PostgreSQL\n');

    // Current database
    const db = await pool.query('SELECT current_database();');
    console.log('📊 Current database:', db.rows[0].current_database);
    console.log('');

    // List all tables
    const tables = await pool.query(`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

    console.log('📊 Tables in public schema:');
    if (tables.rows.length === 0) {
      console.log('  ⚠️  No tables found!');
      console.log('');
      console.log('💡 This means:');
      console.log('   1. The database is empty, OR');
      console.log('   2. DATABASE_URL points to the wrong database');
      console.log('');
      console.log('🔍 What to check in Adminer:');
      console.log('   - What database are you connected to?');
      console.log('   - Does it match "alm_db" from DATABASE_URL?');
    } else {
      tables.rows.forEach(r => console.log(`  ${r.table_name}`));
    }
    console.log('');

    // Check for projects table
    const projectExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'projects'
      );
    `);
    console.log(`🔍 'projects' table exists: ${projectExists.rows[0].exists}`);

    if (projectExists.rows[0].exists) {
      const count = await pool.query('SELECT COUNT(*) as count FROM projects');
      console.log(`📊 Total projects: ${count.rows[0].count}`);

      if (count.rows[0].count > 0) {
        const sample = await pool.query(`
          SELECT id, name, "ownerId", status, "createdAt"
          FROM projects
          ORDER BY "createdAt" DESC
          LIMIT 5
        `);
        console.log('\n🔍 Sample projects:');
        sample.rows.forEach(r => {
          console.log(`  - ${r.name} (id: ${r.id})`);
          console.log(`    Owner: ${r.ownerId}`);
          console.log(`    Status: ${r.status}`);
        });

        const owners = await pool.query(`SELECT DISTINCT "ownerId" FROM projects`);
        console.log('\n👥 OwnerIds:', owners.rows.map(r => r.ownerId).join(', '));
        console.log('   DEFAULT_OWNER_ID:', DEFAULT_OWNER_ID);
      }
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

check();