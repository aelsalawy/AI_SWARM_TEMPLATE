import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const envPath = join(__dirname, '..', '.env');
const envContent = readFileSync(envPath, 'utf-8');

const DATABASE_URL = envContent.match(/DATABASE_URL="(.+)"/)?.[1];
const DEFAULT_OWNER_ID = envContent.match(/DEFAULT_OWNER_ID=(.+)/)?.[1];

console.log('🔗 DATABASE_URL:', DATABASE_URL);
console.log('🔑 DEFAULT_OWNER_ID:', DEFAULT_OWNER_ID);

import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({ connectionString: DATABASE_URL });

async function check() {
  try {
    await pool.connect();
    console.log('✅ Connected to PostgreSQL\n');

    // List all schemas
    const schemas = await pool.query(`
      SELECT schema_name
      FROM information_schema.schemata
      WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
      ORDER BY schema_name;
    `);

    console.log('📋 Schemas:');
    schemas.rows.forEach(r => console.log(`  ${r.schema_name}`));
    console.log('');

    // List all tables in all schemas
    const tables = await pool.query(`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_type = 'BASE TABLE'
        AND table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY table_schema, table_name;
    `);

    console.log('📊 Tables:');
    tables.rows.forEach(r => console.log(`  ${r.table_schema}.${r.table_name}`));
    console.log('');

    // Check for projects table in any schema
    const projectTables = tables.rows.filter(r => 
      r.table_name.toLowerCase() === 'projects'
    );

    if (projectTables.length === 0) {
      console.log('❌ No "projects" table found in any schema!');
    } else {
      console.log(`✅ Found "projects" in ${projectTables.length} schema(s):`);
      projectTables.forEach(r => console.log(`  ${r.table_schema}.${r.table_name}`));
      console.log('');

      // Check the first one for data
      const schema = projectTables[0].table_schema;
      const count = await pool.query(`SELECT COUNT(*) as count FROM "${schema}".projects`);
      console.log(`📊 Total projects in ${schema}.projects: ${count.rows[0].count}`);

      if (count.rows[0].count > 0) {
        const sample = await pool.query(`
          SELECT * FROM "${schema}".projects 
          LIMIT 3
        `);
        console.log('\n🔍 Sample projects:');
        sample.rows.forEach(r => {
          console.log(JSON.stringify(r, null, 2));
        });

        // Get distinct ownerIds
        const owners = await pool.query(`
          SELECT DISTINCT "ownerId" 
          FROM "${schema}".projects
        `);
        console.log('\n👥 OwnerIds in projects:');
        owners.rows.forEach(r => console.log(`  ${r.ownerId}`));

        // Check match with DEFAULT_OWNER_ID
        const matches = await pool.query(`
          SELECT COUNT(*) as count FROM "${schema}".projects 
          WHERE "ownerId" = $1
        `, [DEFAULT_OWNER_ID]);
        console.log(`\n📊 Projects matching DEFAULT_OWNER_ID: ${matches.rows[0].count}`);

        if (matches.rows[0].count === 0 && owners.rows.length > 0) {
          console.log('\n⚠️ MISMATCH: DEFAULT_OWNER_ID does not match any project owner!');
          console.log('   DEFAULT_OWNER_ID:', DEFAULT_OWNER_ID);
          console.log('   Available ownerIds:');
          owners.rows.forEach(r => console.log(`     - ${r.ownerId}`));
        }
      }
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

check();