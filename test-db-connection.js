import { Pool } from 'pg';

async function testDbConnection() {
  const dbUrl = 'postgresql://postgres:password@76.13.151.30:5434/alm_auth_db?schema=public';
  
  try {
    console.log('Testing database connection...');
    const pool = new Pool({
      connectionString: dbUrl,
      connectionTimeoutMillis: 3000,
      max: 5,
    });
    
    const client = await pool.connect();
    const result = await client.query('SELECT 1');
    console.log('Database connection successful:', result.rows[0]);
    await client.release();
    await pool.end();
  } catch (error) {
    console.error('Database connection failed:', error);
  }
}

testDbConnection();