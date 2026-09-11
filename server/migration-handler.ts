import { Request, Response } from 'express';
import { db } from './firebase-admin';
import { prisma } from './prisma';

export async function migrateFirebaseToPg(req: Request, res: Response) {
  try {
    console.log('🚀 Starting Data Migration: Firebase -> PostgreSQL');
    let totalMigrated = 0;

    const collections = [
      { name: 'projects', model: prisma.project, map: (d: any) => ({
        name: d.name || 'Unnamed Project',
        description: d.description || '',
        status: d.status || 'Active',
        ownerId: d.ownerId || 'system',
        createdAt: d.createdAt?.toDate ? d.createdAt.toDate() : new Date(),
        updatedAt: d.updatedAt?.toDate ? d.updatedAt.toDate() : new Date(),
      })},
      { name: 'agents', model: prisma.agent, map: (d: any) => ({
        name: d.name || 'Unknown Agent',
        emoji: d.emoji || '',
        role: d.role || '',
        status: d.status || 'offline',
        ownerId: d.ownerId || 'system',
        activeTasks: d.activeTasks || 0,
        completionRate: d.completionRate || 0,
        skills: d.skills || [],
        createdAt: d.createdAt?.toDate ? d.createdAt.toDate() : new Date(),
        updatedAt: d.updatedAt?.toDate ? d.updatedAt.toDate() : new Date(),
      })},
      { name: 'tasks', model: prisma.task, map: (d: any) => ({
        title: d.title || 'Untitled Task',
        description: d.description || '',
        status: d.status || 'TODO',
        priority: d.priority || 'Medium',
        epic: d.epic || null,
        assignedAgentId: d.assignedAgentId || null,
        projectId: d.projectId || null,
        ownerId: d.ownerId || 'system',
        createdById: d.createdById || null,
        createdAt: d.createdAt?.toDate ? d.createdAt.toDate() : new Date(),
        updatedAt: d.updatedAt?.toDate ? d.updatedAt.toDate() : new Date(),
      })},
      { name: 'bugs', model: prisma.bug, map: (d: any) => ({
        title: d.title || 'Untitled Bug',
        description: d.description || '',
        priority: d.priority || 'Medium',
        status: d.status || 'Open',
        assignedAgentId: d.assignedAgentId || null,
        projectId: d.projectId || null,
        ownerId: d.ownerId || 'system',
        createdAt: d.createdAt?.toDate ? d.createdAt.toDate() : new Date(),
        updatedAt: d.updatedAt?.toDate ? d.updatedAt.toDate() : new Date(),
      })},
      { name: 'requirements', model: prisma.requirement, map: (d: any) => ({
        title: d.title || 'Untitled Requirement',
        status: d.status || 'Pending',
        taskId: d.taskId || null,
        ownerId: d.ownerId || 'system',
        createdAt: d.createdAt?.toDate ? d.createdAt.toDate() : new Date(),
        updatedAt: d.updatedAt?.toDate ? d.updatedAt.toDate() : new Date(),
      })},
      { name: 'test_runs', model: prisma.testRun, map: (d: any) => ({
        name: d.name || 'Untitled Run',
        runId: d.runId || null,
        group: d.group || null,
        status: d.status || 'Pending',
        duration: d.duration || null,
        color: d.color || null,
        agentGroup: d.agentGroup || null,
        testType: d.testType || null,
        priority: d.priority || null,
        description: d.description || null,
        ownerId: d.ownerId || 'system',
        projectId: d.projectId || null,
        createdById: d.createdById || null,
        createdAt: d.createdAt?.toDate ? d.createdAt.toDate() : new Date(),
        updatedAt: d.updatedAt?.toDate ? d.updatedAt.toDate() : new Date(),
      })},
    ];

    for (const col of collections) {
      console.log(`Migrating ${col.name}...`);
      const snapshot = await db.collection(col.name).get();
      for (const doc of snapshot.docs) {
        try {
          await col.model.upsert({
            where: { id: doc.id },
            update: col.map(doc.data()),
            create: { id: doc.id, ...col.map(doc.data()) },
          });
          totalMigrated++;
        } catch (e) {
          console.error(`❌ Failed to migrate ${col.name} doc ${doc.id}:`, e);
        }
      }
    }

    res.json({ status: 'success', totalMigrated });
  } catch (error) {
    console.error('Fatal migration error:', error);
    res.status(500).json({ status: 'error', message: String(error) });
  }
}
