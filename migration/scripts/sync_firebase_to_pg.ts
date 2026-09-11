import * as admin from 'firebase-admin';
import pkg from '../../generated/prisma/index.js';
const { PrismaClient } = pkg;
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const prisma = new PrismaClient();

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault()
  });
}

const db = admin.firestore();

async function migrateCollection(collectionName: string, prismaModel: any, mapFn: (doc: any) => any) {
  console.log(`🚀 Migrating collection: ${collectionName}...`);
  const snapshot = await db.collection(collectionName).get();
  
  let count = 0;
  for (const doc of snapshot.docs) {
    const data = doc.data();
    const id = doc.id;
    
    try {
      await prismaModel.upsert({
        where: { id: id },
        update: mapFn(data, id),
        create: mapFn(data, id),
      });
      count++;
    } catch (e) {
      console.error(`❌ Error migrating ${collectionName} doc ${id}:`, e);
    }
  }
  console.log(`✅ Migrated ${count} documents from ${collectionName}`);
}

async function runMigration() {
  try {
    console.log('--- Starting Firebase to PostgreSQL Migration ---');

    // 1. Projects
    await migrateCollection('projects', prisma.project, (data, id) => ({
      id,
      name: data.name || 'Unnamed Project',
      description: data.description || '',
      status: data.status || 'Active',
      ownerId: data.ownerId || 'system',
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
      updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(),
    }));

    // 2. Agents
    await migrateCollection('agents', prisma.agent, (data, id) => ({
      id,
      name: data.name || 'Unknown Agent',
      emoji: data.emoji || '',
      role: data.role || '',
      status: data.status || 'offline',
      ownerId: data.ownerId || 'system',
      activeTasks: data.activeTasks || 0,
      completionRate: data.completionRate || 0,
      skills: data.skills || [],
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
      updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(),
    }));

    // 3. Tasks
    await migrateCollection('tasks', prisma.task, (data, id) => ({
      id,
      title: data.title || 'Untitled Task',
      description: data.description || '',
      status: data.status || 'TODO',
      priority: data.priority || 'Medium',
      epic: data.epic || null,
      assignedAgentId: data.assignedAgentId || null,
      projectId: data.projectId || null,
      ownerId: data.ownerId || 'system',
      createdById: data.createdById || null,
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
      updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(),
    }));

    // 4. Bugs
    await migrateCollection('bugs', prisma.bug, (data, id) => ({
      id,
      title: data.title || 'Untitled Bug',
      description: data.description || '',
      priority: data.priority || 'Medium',
      status: data.status || 'Open',
      assignedAgentId: data.assignedAgentId || null,
      projectId: data.projectId || null,
      ownerId: data.ownerId || 'system',
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
      updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(),
    }));

    // 5. Requirements
    await migrateCollection('requirements', prisma.requirement, (data, id) => ({
      id,
      title: data.title || 'Untitled Requirement',
      status: data.status || 'Pending',
      taskId: data.taskId || null,
      ownerId: data.ownerId || 'system',
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
      updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(),
    }));

    // 6. Test Runs
    await migrateCollection('test_runs', prisma.testRun, (data, id) => ({
      id,
      name: data.name || 'Untitled Run',
      runId: data.runId || null,
      group: data.group || null,
      status: data.status || 'Pending',
      duration: data.duration || null,
      color: data.color || null,
      agentGroup: data.agentGroup || null,
      testType: data.testType || null,
      priority: data.priority || null,
      description: data.description || null,
      ownerId: data.ownerId || 'system',
      projectId: data.projectId || null,
      createdById: data.createdById || null,
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
      updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(),
    }));

    console.log('--- Migration Completed Successfully ---');
  } catch (error) {
    console.error('❌ Fatal Migration Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

runMigration();
