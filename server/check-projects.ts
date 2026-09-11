import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

// Read .env file manually to avoid dotenv ESM issues
const envPath = join(__dirname, '.env');
const envContent = readFileSync(envPath, 'utf-8');

const DATABASE_URL = envContent.match(/DATABASE_URL="(.+)"/)?.[1];
const DEFAULT_OWNER_ID = envContent.match(/DEFAULT_OWNER_ID=(.+)/)?.[1];

console.log('🔗 DATABASE_URL:', DATABASE_URL);
console.log('🔑 DEFAULT_OWNER_ID:', DEFAULT_OWNER_ID);

const { PrismaClient } = require('../generated/prisma/index.js');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: DATABASE_URL });
const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({ adapter });

async function checkProjects() {
  try {
    await prisma.$connect();
    console.log('✅ Connected to PostgreSQL');

    // Get total project count
    const totalProjects = await prisma.project.count();
    console.log(`\n📊 Total projects in PostgreSQL: ${totalProjects}`);

    if (totalProjects === 0) {
      console.log('⚠️  No projects found in PostgreSQL!');
      console.log('💡 This explains why the projects filter is empty.');
      console.log('💡 If the UI requires a project selection, tasks won\'t appear.');
      return;
    }

    // Get all distinct ownerIds
    const ownerIds = await prisma.project.groupBy({
      by: ['ownerId'],
      _count: { ownerId: true }
    });

    console.log('\n👥 Projects by ownerId:');
    for (const owner of ownerIds) {
      console.log(`  ${owner.ownerId}: ${owner._count.ownerId} projects`);
    }

    // Show sample projects
    const sampleProjects = await prisma.project.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' }
    });

    console.log('\n🔍 Sample projects:');
    for (const project of sampleProjects) {
      console.log(`  ID: ${project.id}`);
      console.log(`  Name: ${project.name}`);
      console.log(`  Owner: ${project.ownerId}`);
      console.log(`  Created: ${project.createdAt}`);
      console.log('');
    }

    // Check DEFAULT_OWNER_ID
    const projectsForDefaultOwner = await prisma.project.count({
      where: { ownerId: DEFAULT_OWNER_ID }
    });

    console.log(`📊 Projects for default owner (${DEFAULT_OWNER_ID}): ${projectsForDefaultOwner}`);

    if (projectsForDefaultOwner === 0 && totalProjects > 0) {
      console.log('\n⚠️  OWNERID MISMATCH DETECTED!');
      console.log('Projects exist, but none match DEFAULT_OWNER_ID.');
      console.log('This is why the projects filter is empty in the UI.');
      console.log('\n💡 SOLUTION: Update projects to use the correct ownerId.');
      console.log('\n🔍 What ownerId should we use?');
      console.log('Options:');
      for (const owner of ownerIds) {
        console.log(`  - ${owner.ownerId} (${owner._count.ownerId} projects)`);
      }
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkProjects();