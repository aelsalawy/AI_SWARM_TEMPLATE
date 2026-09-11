/**
 * P2-Swarm-02: Handoff Protocol — Structured Context Transfer
 *
 * Defines structured handoff templates for agent-to-agent task transitions.
 * When tasks get reassigned, this module generates the proper context payload.
 */

import { db, firebaseReady } from '../firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

// ---------------------------------------------------------------------------
// Handoff Types
// ---------------------------------------------------------------------------

export type HandoffType =
  | 'dev-to-qa'
  | 'qa-to-cto'
  | 'cto-to-dev'
  | 'architect-to-dev'
  | 'dev-to-dev'
  | 'qa-to-dev'
  | 'dev-to-architect';

export interface HandoffContext {
  handoffType: HandoffType;
  taskId: string;
  fromAgent: string;
  toAgent: string;
  timestamp: any;
  context: Record<string, any>;
  acknowledged: boolean;
  acknowledgedAt?: any;
}

// ---------------------------------------------------------------------------
// Handoff Templates
// ---------------------------------------------------------------------------

interface HandoffTemplate {
  type: HandoffType;
  fromRole: string;
  toRole: string;
  requiredFields: string[];
  generate: (task: any, fromAgent: any, extra?: any) => Record<string, any>;
}

const TEMPLATES: HandoffTemplate[] = [
  {
    type: 'dev-to-qa',
    fromRole: 'Dev',
    toRole: 'QA-Ops',
    requiredFields: ['filesChanged', 'howToTest', 'edgeCases', 'notTested'],
    generate: (task, fromAgent, extra) => ({
      summary: `Implementation complete for: ${task.title || task.id}`,
      filesChanged: extra?.filesChanged || [],
      howToTest: extra?.howToTest || 'Verify task acceptance criteria pass',
      edgeCases: extra?.edgeCases || [],
      notTested: extra?.notTested || 'Unit tests only — no integration testing done',
      implementationNotes: extra?.implementationNotes || '',
      relatedBugs: extra?.relatedBugs || [],
      environmentRequirements: extra?.environmentRequirements || 'Standard dev environment',
    }),
  },
  {
    type: 'qa-to-cto',
    fromRole: 'QA-Ops',
    toRole: 'CTO',
    requiredFields: ['passFailMatrix', 'testedItems', 'skippedItems'],
    generate: (task, fromAgent, extra) => ({
      summary: `QA Report for: ${task.title || task.id}`,
      passFailMatrix: extra?.passFailMatrix || {},
      testedItems: extra?.testedItems || [],
      skippedItems: extra?.skippedItems || [],
      environmentDetails: extra?.environmentDetails || 'Standard test environment',
      performanceNotes: extra?.performanceNotes || '',
      riskAssessment: extra?.riskAssessment || 'Medium',
      recommendation: extra?.recommendation || 'Proceed with deployment',
    }),
  },
  {
    type: 'cto-to-dev',
    fromRole: 'CTO',
    toRole: 'Dev',
    requiredFields: ['spec', 'acceptanceCriteria'],
    generate: (task, fromAgent, extra) => ({
      summary: `Task assignment: ${task.title || task.id}`,
      spec: extra?.spec || task.description || '',
      acceptanceCriteria: extra?.acceptanceCriteria || [],
      constraints: extra?.constraints || [],
      linkedADRs: extra?.linkedADRs || [],
      priority: task.priority || 'Medium',
      deadline: extra?.deadline || 'Not specified',
      relatedTasks: extra?.relatedTasks || [],
      outOfScope: extra?.outOfScope || [],
    }),
  },
  {
    type: 'architect-to-dev',
    fromRole: 'SW Architect',
    toRole: 'Dev',
    requiredFields: ['approvedDesign', 'techDecisions'],
    generate: (task, fromAgent, extra) => ({
      summary: `Approved design for: ${task.title || task.id}`,
      approvedDesign: extra?.approvedDesign || '',
      techDecisions: extra?.techDecisions || [],
      constraints: extra?.constraints || [],
      apiChanges: extra?.apiChanges || [],
      databaseChanges: extra?.databaseChanges || [],
      dependencies: extra?.dependencies || [],
      risks: extra?.risks || [],
    }),
  },
  {
    type: 'dev-to-dev',
    fromRole: 'Dev',
    toRole: 'Dev',
    requiredFields: ['currentProgress', 'nextSteps'],
    generate: (task, fromAgent, extra) => ({
      summary: `Task handoff: ${task.title || task.id}`,
      currentProgress: extra?.currentProgress || 'Work in progress',
      nextSteps: extra?.nextSteps || [],
      filesInProgress: extra?.filesInProgress || [],
      blockers: extra?.blockers || [],
      notes: extra?.notes || '',
      completedItems: extra?.completedItems || [],
    }),
  },
  {
    type: 'qa-to-dev',
    fromRole: 'QA-Ops',
    toRole: 'Dev',
    requiredFields: ['bugReport', 'reproduction'],
    generate: (task, fromAgent, extra) => ({
      summary: `Bug report for: ${task.title || task.id}`,
      bugReport: extra?.bugReport || '',
      reproduction: extra?.reproduction || [],
      severity: extra?.severity || 'Medium',
      environment: extra?.environment || 'Standard test environment',
      screenshots: extra?.screenshots || [],
      logs: extra?.logs || [],
      suggestedFix: extra?.suggestedFix || '',
    }),
  },
  {
    type: 'dev-to-architect',
    fromRole: 'Dev',
    toRole: 'SW Architect',
    requiredFields: ['implementationSummary'],
    generate: (task, fromAgent, extra) => ({
      summary: `Implementation ready for review: ${task.title || task.id}`,
      implementationSummary: extra?.implementationSummary || '',
      designDeviations: extra?.designDeviations || [],
      performanceConsiderations: extra?.performanceConsiderations || [],
      technicalDebt: extra?.technicalDebt || [],
      codeLocation: extra?.codeLocation || '',
    }),
  },
];

// ---------------------------------------------------------------------------
// Handoff Functions
// ---------------------------------------------------------------------------

/**
 * Determine handoff type based on from/to roles
 */
export function determineHandoffType(fromRole: string, toRole: string): HandoffType {
  const from = (fromRole || '').toLowerCase();
  const to = (toRole || '').toLowerCase();

  // Normalize roles
  const isDev = (r: string) => ['dev', 'senior dev', 'developer', 'seniordev'].includes(r);
  const isQA = (r: string) => ['qa-ops', 'qa', 'qa analyst'].includes(r);
  const isCTO = (r: string) => ['cto'].includes(r);
  const isArchitect = (r: string) => ['sw architect', 'architect', 'swarch'].includes(r);

  if (isDev(from) && isQA(to)) return 'dev-to-qa';
  if (isQA(from) && isCTO(to)) return 'qa-to-cto';
  if (isCTO(from) && isDev(to)) return 'cto-to-dev';
  if (isArchitect(from) && isDev(to)) return 'architect-to-dev';
  if (isDev(from) && isDev(to)) return 'dev-to-dev';
  if (isQA(from) && isDev(to)) return 'qa-to-dev';
  if (isDev(from) && isArchitect(to)) return 'dev-to-architect';

  return 'dev-to-dev'; // Default fallback
}

/**
 * Create a handoff context for a task transition
 */
export async function createHandoff(
  taskId: string,
  fromAgentId: string,
  toAgentId: string,
  extraContext?: Record<string, any>
): Promise<HandoffContext | null> {
  if (!firebaseReady || !db) return null;

  try {
    // Fetch task and agent data
    const [taskDoc, fromAgentDoc, toAgentDoc] = await Promise.all([
      db.collection('tasks').doc(taskId).get(),
      db.collection('agents').doc(fromAgentId).get(),
      db.collection('agents').doc(toAgentId).get(),
    ]);

    if (!taskDoc.exists) {
      console.error('[Handoff] Task not found:', taskId);
      return null;
    }

    const task = { id: taskDoc.id, ...taskDoc.data() };
    const fromAgent = fromAgentDoc.exists ? { id: fromAgentDoc.id, ...fromAgentDoc.data() } : {};
    const toAgent = toAgentDoc.exists ? { id: toAgentDoc.id, ...toAgentDoc.data() } : {};

    const fromRole = (fromAgent as any)?.role || 'Dev';
    const toRole = (toAgent as any)?.role || 'Dev';

    const handoffType = determineHandoffType(fromRole, toRole);
    const template = TEMPLATES.find(t => t.type === handoffType) || TEMPLATES.find(t => t.type === 'dev-to-dev')!;

    const context = template.generate(task, fromAgent, extraContext);

    const handoff: HandoffContext = {
      handoffType,
      taskId,
      fromAgent: fromAgentId,
      toAgent: toAgentId,
      timestamp: Timestamp.now(),
      context,
      acknowledged: false,
    };

    // Store handoff in Firestore
    const handoffRef = await db.collection('handoffs').add(handoff);

    // Add handoff comment to the task
    const handoffComment = {
      author: fromAgentId,
      authorRole: fromRole,
      text: `[HANDOFF ${handoffType}]\n${JSON.stringify(context, null, 2)}`,
      type: 'handoff',
      handoffId: handoffRef.id,
      createdAt: Timestamp.now(),
    };

    await db.collection('tasks').doc(taskId).update({
      comments: [...(task.comments || []), handoffComment],
      handoff: {
        id: handoffRef.id,
        type: handoffType,
        fromAgent: fromAgentId,
        toAgent: toAgentId,
        acknowledged: false,
      },
      updatedAt: Timestamp.now(),
    });

    console.log(`[Handoff] Created ${handoffType} handoff for task ${taskId}: ${handoffRef.id}`);
    return { ...handoff, id: handoffRef.id };
  } catch (error) {
    console.error('[Handoff] Error creating handoff:', error);
    return null;
  }
}

/**
 * Acknowledge a handoff
 */
export async function acknowledgeHandoff(handoffId: string, agentId: string): Promise<boolean> {
  if (!firebaseReady || !db) return false;

  try {
    const handoffRef = db.collection('handoffs').doc(handoffId);
    const handoffDoc = await handoffRef.get();

    if (!handoffDoc.exists) return false;

    const handoff = handoffDoc.data() as HandoffContext;
    if (handoff.toAgent !== agentId) return false;

    await handoffRef.update({
      acknowledged: true,
      acknowledgedAt: Timestamp.now(),
    });

    // Update task handoff status
    const taskId = handoff.taskId;
    const taskDoc = await db.collection('tasks').doc(taskId).get();
    if (taskDoc.exists) {
      const taskData = taskDoc.data();
      const taskHandoff = (taskData as any)?.handoff;
      if (taskHandoff && taskHandoff.id === handoffId) {
        await db.collection('tasks').doc(taskId).update({
          'handoff.acknowledged': true,
          'handoff.acknowledgedAt': Timestamp.now(),
        });
      }
    }

    console.log(`[Handoff] Acknowledged by ${agentId} for handoff ${handoffId}`);
    return true;
  } catch (error) {
    console.error('[Handoff] Error acknowledging handoff:', error);
    return false;
  }
}

/**
 * Get handoff history for a task
 */
export async function getTaskHandoffs(taskId: string): Promise<any[]> {
  if (!firebaseReady || !db) return [];

  try {
    const snapshot = await db.collection('handoffs')
      .where('taskId', '==', taskId)
      .orderBy('timestamp', 'desc')
      .get();

    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('[Handoff] Error fetching handoffs:', error);
    return [];
  }
}

/**
 * Get all handoff templates (for API exposure)
 */
export function getHandoffTemplates(): HandoffTemplate[] {
  return TEMPLATES;
}
