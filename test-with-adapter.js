import dotenv from 'dotenv';
dotenv.config();

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const generatedClientDir = join(__dirname, 'generated', 'prisma', '.prisma', 'client');

async function testWithAdapter() {
  try {
    console.log('Testing with adapter...');
    console.log('Generated client dir:', generatedClientDir);
    
    const indexPath = join(generatedClientDir, 'index.js');
    console.log('Index path:', indexPath);
    
    const { PrismaClient } = await import(indexPath);
    console.log('PrismaClient imported:', typeof PrismaClient);
    
    const dbUrl = process.env.DATABASE_URL;
    console.log('DATABASE_URL:', dbUrl);
    
    // Try to use the pg adapter
    try {
      const { PrismaPg } = await import('@prisma/adapter-pg');
      const { Pool } = await import('pg');
      const pool = new Pool({
        connectionString: dbUrl,
        connectionTimeoutMillis: 3000,
        max: 5,
      });
      const adapter = new PrismaPg(pool);
      
      const client = new PrismaClient({ adapter, log: ['warn', 'error'] });
      console.log('Prisma client created with adapter:', typeof client);
      
      // Test the client
      await client.$connect();
      console.log('Client connected successfully');
      
      const requirements = await client.requirement.findMany();
      console.log('Found requirements:', requirements.length);
      
      await client.$disconnect();
    } catch (adapterError) {
      console.error('Adapter failed, trying without adapter:', adapterError.message);
      
      // Try without adapter
      const client = new PrismaClient({ log: ['warn', 'error'] });
      console.log('Prisma client created without adapter:', typeof client);
      
      // Test the client
      await client.$connect();
      console.log('Client connected successfully');
      
      const requirements = await client.requirement.findMany();
      console.log('Found requirements:', requirements.length);
      
      await client.$disconnect();
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

testWithAdapter();