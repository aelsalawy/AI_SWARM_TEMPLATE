import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { db } from './firebase-admin';

dotenv.config();

// Normalization Maps to match PostgreSQL Enums (schema.prisma)
const statusMaps: Record<string, Record<string, string>> = {
  TaskStatus: {
    'TODO': 'TODO',
    'IN_PROGRESS': 'IN_PROGRESS',
    'In Progress': 'IN_PROGRESS',
    'REVIEW': 'REVIEW',
    'Review': 'REVIEW',
    'DONE': 'DONE',
    'Done': 'DONE',
    'Completed': 'DONE',
  },
  BugStatus: {
    'Open': 'Open',
    'In_Progress': 'In_Progress',
    'In Progress': 'In_Progress',
    'Resolved': 'Resolved',
    'Closed': 'Closed',
    'Done': 'Closed',
    'OPEN': 'Open',
  },
  RequirementStatus: {
    'Pending': 'Pending',
    'Verified': 'Verified',
    'Approved': 'Verified',
    'Done': 'Verified',
  },
  RunStatus: {
    'Passed': 'Passed',
    'Failed': 'Failed',
    'Skipped': 'Skipped',
    'Pending': 'Pending',
  },
  ProjectStatus: {
    'Active': 'Active',
    'Archived': 'Archived',
  },
  AgentStatus: {
    'online': 'online',
    'offline': 'offline',
    'busy': 'busy',
    'idle': 'idle',
  }
};

const priorityMaps: Record<string, Record<string, string>> = {
  TaskPriority: {
    'Low': 'Low',
    'low': 'Low',
    'Medium': 'Medium',
    'medium': 'Medium',
    'High': 'High',
    'high': 'High',
    'Urgent': 'Urgent',
    'urgent': 'Urgent',
    'Critical': 'Urgent',
    'critical': 'Urgent',
  },
  BugPriority: {
    'Low': 'Low',
    'low': 'Low',
    'Medium': 'Medium',
    'medium': 'Medium',
    'High': 'High',
    'high': 'High',
    'Critical': 'Critical',
    'critical': 'Critical',
  }
};

function normalizeValue(type: string, value: any): string {
  if (!value) return '';
  const strValue = String(value);
  
  // Try status maps
  if (statusMaps[type] && statusMaps[type][strValue]) return statusMaps[type][strValue];
  
  // Try priority maps
  if (priorityMaps[type] && priorityMaps[type][strValue]) return priorityMaps[type][strValue];
  
  // Fallback: Standardize common patterns
  if (type === 'TaskStatus') return strValue.toUpperCase().replace(' ', '_');
  
  return strValue;
}

async function runMigration() {
  try {
    console.log('🚀 Starting Final Data Migration with Full Normalization: Firebase -> PostgreSQL');
    
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const generatedClientDir = join(__dirname, '..', 'generated', 'prisma', '.prisma', 'client');
    const indexPath = join(generatedClientDir, 'index.js');
    
    const { PrismaClient } = await import(indexPath);
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) throw new Error('DATABASE_URL not set');
    
    // Try to use the pg adapter to solve the "engine type client" error
    let adapter: any = undefined;
    try {
      const { PrismaPg } = await import('@prisma/adapter-pg');
      const { Pool } = await import('pg');
      const pool = new Pool({ connectionString: dbUrl });
      adapter = new PrismaPg(pool);
      console.log('📦 Using pg adapter for migration');
    } catch (e) {
      console.warn('⚠️  PG Adapter not available, attempting direct connect');
    }

    const prisma = adapter 
      ? new PrismaClient({ adapter, log: ['error'] }) 
      : new PrismaClient({ log: ['error'] });
      
    await prisma.$connect();
    console.log('✅ Connected to PostgreSQL');

    let totalMigrated = 0;

    const collections = [
      { 
        name: 'projects', 
        model: prisma.project, 
        map: (d: any) => ({
          name: d.name || 'Unnamed Project',
          description: d.description || '',
          status: normalizeValue('ProjectStatus', d.status) || 'Active',
          ownerId: d.ownerId || 'system',
          createdAt: d.createdAt?.toDate ? d.createdAt.toDate() : new Date(),
          updatedAt: d.updatedAt?.toDate ? d.updatedAt.toDate() : new Date(),
        })
      },
      { 
        name: 'agents', 
        model: prisma.agent, 
        map: (d: any) => ({
          name: d.name || 'Unknown Agent',
          emoji: d.emoji || '',
          role: d.role || '',
          status: normalizeValue('AgentStatus', d.status) || 'offline',
          ownerId: d.ownerId || 'system',
          activeTasks: d.activeTasks || 0,
          completionRate: d.completionRate || 0,
          skills: Array.isArray(d.skills) ? d.skills : [],
          createdAt: d.createdAt?.toDate ? d.createdAt.toDate() : new Date(),
          updatedAt: d.updatedAt?.toDate ? d.updatedAt.toDate() : new Date(),
        })
      },
      { 
        name: 'tasks', 
        model: prisma.task, 
        map: (d: any) => ({
          title: d.title || 'Untitled Task',
          description: d.description || '',
          status: normalizeValue('TaskStatus', d.status) || 'TODO',
          priority: normalizeValue('TaskPriority', d.priority) || 'Medium',
          epic: d.epic || null,
          assignedAgentId: d.assignedAgentId || null,
          projectId: d.projectId || null,
          ownerId: d.ownerId || 'system',
          createdById: d.createdById || null,
          createdAt: d.createdAt?.toDate ? d.createdAt.toDate() : new Date(),
          updatedAt: d.updatedAt?.toDate ? d.updatedAt.toDate() : new Date(),
        })
      },
      { 
        name: 'bugs', 
        model: prisma.bug, 
        map: (d: any) => ({
          title: d.title || 'Untitled Bug',
          description: d.description || '',
          priority: normalizeValue('BugPriority', d.priority) || 'Medium',
          status: normalizeValue('BugStatus', d.status) || 'Open',
          assignedAgentId: d.assignedAgentId || null,
          projectId: d.projectId || null,
          ownerId: d.ownerId || 'system',
          createdAt: d.createdAt?.toDate ? d.createdAt.toDate() : new Date(),
          updatedAt: d.updatedAt?.toDate ? d.updatedAt.toDate() : new Date(),
        })
      },
      { 
        name: 'requirements', 
        model: prisma.requirement, 
        map: (d: any) => ({
          title: d.title || 'Untitled Requirement',
          status: normalizeValue('RequirementStatus', d.status) || 'Pending',
          taskId: d.taskId || null,
          ownerId: d.ownerId || 'system',
          createdAt: d.createdAt?.toDate ? d.createdAt.toDate() : new Date(),
          updatedAt: d.updatedAt?.toDate ? d.updatedAt.toDate() : new Date(),
        })
      },
      { 
        name: 'test_runs', 
        model: prisma.testRun, 
        map: (d: any) => ({
          name: d.name || 'Untitled Run',
          runId: d.runId || null,
          group: d.group || null,
          status: normalizeValue('RunStatus', d.status) || 'Pending',
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
        })
      },
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

    console.log(`✅ Migration complete. Total records migrated: ${totalMigrated}`);
  } catch (error) {
    console.error('Fatal migration error:', error);
  } finally {
    process.exit(0);
  }
}

runMigration();
