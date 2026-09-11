import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read .env file manually
const envPath = join(__dirname, '.env');
const envContent = readFileSync(envPath, 'utf-8');

const DATABASE_URL = envContent.match(/DATABASE_URL="(.+)"/)?.[1];
const DEFAULT_OWNER_ID = envContent.match(/DEFAULT_OWNER_ID=(.+)/)?.[1];

console.log('🔗 DATABASE_URL:', DATABASE_URL);
console.log('🔑 DEFAULT_OWNER_ID:', DEFAULT_OWNER_ID);

// Use pg directly to check tables
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({ connectionString: DATABASE_URL });

async function checkTables() {
  try {
    await pool.connect();
    console.log('✅ Connected to PostgreSQL');

    // Check all tables in the database
    const tablesQuery = `
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_type = 'BASE TABLE'
        AND table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY table_schema, table_name;
    `;
    const tables = await pool.query(tablesQuery);

    console.log('\n📊 Tables in database:');
    if (tables.rows.length === 0) {
      console.log('  ⚠️  No tables found!');
    } else {
      for (const row of tables.rows) {
        console.log(`  ${row.table_schema}.${row.table_name}`);
      }
    }

    // Check specifically for projects table
    const projectExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'projects'
      );
    `);
    console.log('\n🔍 Projects table exists in public schema:', projectExists.rows[0].exists);

    // Check all schemas
    const schemasQuery = `
      SELECT schema_name
      FROM information_schema.schemata
      WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
      ORDER BY schema_name;
    `;
    const schemas = await pool.query(schemasQuery);

    console.log('\n📋 Custom schemas:');
    for (const row of schemas.rows) {
      console.log(`  ${row.schema_name}`);
    }

    // If projects exists, check its data
    if (projectExists.rows[0].exists) {
      const countResult = await pool.query('SELECT COUNT(*) as count FROM projects');
      console.log(`\n📊 Total projects: ${countResult.rows[0].count}`);

      const projects = await pool.query('SELECT id, name, owner_id, created_at FROM projects LIMIT 5');
      console.log('\n🔍 Sample projects:');
      for (const row of projects.rows) {
        console.log(`  ID: ${row.id}`);
        console.log(`  Name: ${row.name}`);
        console.log(`  Owner: ${row.owner_id}`);
        console.log(`  Created: ${row.created_at}`);
        console.log('');
      }

      // Check ownerIds
      const ownerIds = await pool.query(`
        SELECT owner_id, COUNT(*) as count
        FROM projects
        GROUP BY owner_id
      `);
      console.log('👥 Projects by ownerId:');
      for (const row of ownerIds.rows) {
        console.log(`  ${row.owner_id}: ${row.count} projects`);
      }

      // Check DEFAULT_OWNER_ID match
      const defaultOwnerCount = await pool.query(
        'SELECT COUNT(*) as count FROM projects WHERE owner_id = $1',
        [DEFAULT_OWNER_ID]
      );
      console.log(`\n📊 Projects for default owner (${DEFAULT_OWNER_ID}): ${defaultOwnerCount.rows[0].count}`);

      if (defaultOwnerCount.rows[0].count === 0 && ownerIds.rows.length > 0) {
        console.log('\n⚠️  MISMATCH DETECTED!');
        console.log('Projects exist, but none match DEFAULT_OWNER_ID.');
        console.log('This is why the projects filter is empty in the UI.');
      }
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

checkTables();