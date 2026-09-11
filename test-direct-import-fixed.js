import dotenv from 'dotenv';
dotenv.config();

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const generatedClientDir = join(__dirname, 'generated', 'prisma', '.prisma', 'client');

async function testDirectImport() {
  try {
    console.log('Testing direct import...');
    console.log('Generated client dir:', generatedClientDir);
    
    const indexPath = join(generatedClientDir, 'index.js');
    console.log('Index path:', indexPath);
    
    const { PrismaClient } = await import(indexPath);
    console.log('PrismaClient imported:', typeof PrismaClient);
    
    const dbUrl = process.env.DATABASE_URL;
    console.log('DATABASE_URL:', dbUrl);
    
    const client = new PrismaClient({ datasourceUrl: dbUrl, log: ['warn', 'error'] });
    console.log('Prisma client created:', typeof client);
    
    // Test the client
    await client.$connect();
    console.log('Client connected successfully');
    
    const requirements = await client.requirement.findMany();
    console.log('Found requirements:', requirements.length);
    
    await client.$disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

testDirectImport();