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

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not found in .env');
  process.exit(1);
}

console.log('🔗 DATABASE_URL:', DATABASE_URL);

const { PrismaClient } = require('../generated/prisma/index.js');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: DATABASE_URL });
const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({ adapter });

async function checkPostgresTasks() {
  try {
    await prisma.$connect();
    console.log('✅ Connected to PostgreSQL');

    // Get total task count
    const totalTasks = await prisma.task.count();
    console.log(`\n📊 Total tasks in PostgreSQL: ${totalTasks}`);

    if (totalTasks === 0) {
      console.log('⚠️  No tasks found in PostgreSQL!');
      console.log('Tasks may not have been migrated from Firebase yet.');
      return;
    }

    // Get all distinct ownerIds
    const ownerIds = await prisma.task.groupBy({
      by: ['ownerId'],
      _count: { ownerId: true }
    });

    console.log('\n👥 Tasks by ownerId:');
    for (const owner of ownerIds) {
      console.log(`  ${owner.ownerId}: ${owner._count.ownerId} tasks`);
    }

    // Get status distribution
    const statusCounts = await prisma.task.groupBy({
      by: ['status'],
      _count: { status: true }
    });

    console.log('\n📋 Tasks by status:');
    for (const status of statusCounts) {
      console.log(`  ${status.status}: ${status._count.status} tasks`);
    }

    // Show a sample task
    const sampleTask = await prisma.task.findFirst({
      orderBy: { createdAt: 'desc' }
    });

    if (sampleTask) {
      console.log('\n🔍 Sample task (most recent):');
      console.log(`  ID: ${sampleTask.id}`);
      console.log(`  Title: ${sampleTask.title}`);
      console.log(`  Status: ${sampleTask.status}`);
      console.log(`  Owner: ${sampleTask.ownerId}`);
      console.log(`  Created: ${sampleTask.createdAt}`);
    }

    // Check DEFAULT_OWNER_ID
    const defaultOwnerId = envContent.match(/DEFAULT_OWNER_ID=(.+)/)?.[1];
    console.log(`\n🔑 DEFAULT_OWNER_ID from .env: ${defaultOwnerId}`);

    const tasksForDefaultOwner = await prisma.task.count({
      where: { ownerId: defaultOwnerId }
    });

    console.log(`📊 Tasks for default owner: ${tasksForDefaultOwner}`);

    if (tasksForDefaultOwner === 0 && totalTasks > 0) {
      console.log('\n⚠️  MISMATCH DETECTED!');
      console.log('Tasks exist in PostgreSQL, but none match DEFAULT_OWNER_ID.');
      console.log('This is why the UI shows no data - the frontend is filtering by ownerId.');
      console.log('\n💡 SOLUTION: Either:');
      console.log('  1. Update tasks to use the correct ownerId');
      console.log('  2. Update DEFAULT_OWNER_ID to match an existing ownerId');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkPostgresTasks();