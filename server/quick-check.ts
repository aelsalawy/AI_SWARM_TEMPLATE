import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read .env file manually
const envPath = join(__dirname, '.env');
const envContent = readFileSync(envPath, 'utf-8');

const DATABASE_URL = envContent.match(/DATABASE_URL="(.+)"/)?.[1];

console.log('🔗 DATABASE_URL:', DATABASE_URL);

import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({ connectionString: DATABASE_URL });

async function checkProjects() {
  try {
    await pool.connect();
    console.log('✅ Connected to PostgreSQL');

    // Check all tables
    const tables = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_type = 'BASE TABLE'
        AND table_schema = 'public'
      ORDER BY table_name;
    `);

    console.log('\n📊 Tables in public schema:');
    tables.rows.forEach(row => console.log(`  - ${row.table_name}`));

    // Check projects table specifically
    const projectsExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'projects'
      );
    `);

    console.log(`\n🔍 'projects' table exists: ${projectsExists.rows[0].exists}`);

    if (projectsExists.rows[0].exists) {
      const count = await pool.query('SELECT COUNT(*) as count FROM projects');
      console.log(`📊 Total projects: ${count.rows[0].count}`);

      const projects = await pool.query(`
        SELECT id, name, "ownerId", status, "createdAt"
        FROM projects
        ORDER BY "createdAt" DESC
        LIMIT 10
      `);

      console.log('\n🔍 Recent projects:');
      if (projects.rows.length === 0) {
        console.log('  ⚠️  No projects found!');
      } else {
        projects.rows.forEach(row => {
          console.log(`  - ${row.name} (id: ${row.id})`);
          console.log(`    Owner: ${row.ownerId}`);
          console.log(`    Status: ${row.status}`);
          console.log(`    Created: ${row.createdAt}\n`);
        });

        // Get unique ownerIds
        const ownerIds = await pool.query(`
          SELECT "ownerId", COUNT(*) as count
          FROM projects
          GROUP BY "ownerId"
        `);

        console.log('👥 Projects by ownerId:');
        ownerIds.rows.forEach(row => {
          console.log(`  ${row.ownerId}: ${row.count} projects`);
        });
      }
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

checkProjects();