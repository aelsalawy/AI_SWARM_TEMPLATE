/**
 * P2-Swarm-03: Sprint Context — Auto-inject Focus & Priorities
 *
 * Reads current sprint state from ALM and generates a bounded context
 * for agents, including priorities, assignments, out-of-scope, and dependencies.
 */

import { db, firebaseReady } from '../firebase-admin';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SprintContext {
  sprint: {
    id: string;
    name: string;
    goal: string;
    status: string;
    startDate?: any;
    endDate?: any;
  } | null;
  focus: string[];
  priorities: Array<{
    taskId: string;
    title: string;
    priority: string;
    status: string;
    assignedTo: string;
  }>;
  activeAssignments: Array<{
    agentId: string;
    agentName: string;
    agentRole: string;
    taskId: string;
    taskTitle: string;
    taskStatus: string;
  }>;
  outOfScope: string[];
  dependencies: Array<{
    taskId: string;
    title: string;
    blockedBy: string;
    status: string;
  }>;
  relevantADRs: string[];
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Sprint Context Builder
// ---------------------------------------------------------------------------

/**
 * Build sprint context for a given project and optionally a specific agent
 */
export async function buildSprintContext(
  projectId: string,
  agentId?: string
): Promise<SprintContext> {
  const emptyContext: SprintContext = {
    sprint: null,
    focus: [],
    priorities: [],
    activeAssignments: [],
    outOfScope: [],
    dependencies: [],
    relevantADRs: [],
    generatedAt: new Date().toISOString(),
  };

  if (!firebaseReady || !db) return emptyContext;

  try {
    // 1. Get active sprint
    const sprintSnapshot = await db.collection('sprints')
      .where('projectId', '==', projectId)
      .where('status', '==', 'Active')
      .limit(1)
      .get();

    let sprint: SprintContext['sprint'] = null;
    if (!sprintSnapshot.empty) {
      const sprintDoc = sprintSnapshot.docs[0];
      sprint = {
        id: sprintDoc.id,
        name: sprintDoc.data().name,
        goal: sprintDoc.data().goal,
        status: sprintDoc.data().status,
        startDate: sprintDoc.data().startDate,
        endDate: sprintDoc.data().endDate,
      };
    }

    // 2. Get tasks for this project, ordered by priority
    const tasksSnapshot = await db.collection('tasks')
      .where('projectId', '==', projectId)
      .get();

    const tasks = tasksSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // 3. Build priorities list (sorted: Urgent > High > Medium > Low)
    const priorityOrder: Record<string, number> = {
      'Urgent': 0,
      'High': 1,
      'Medium': 2,
      'Low': 3,
    };

    const priorities = tasks
      .filter(t => (t as any).status !== 'Done')
      .sort((a, b) => {
        const pa = priorityOrder[(a as any).priority] ?? 4;
        const pb = priorityOrder[(b as any).priority] ?? 4;
        return pa - pb;
      })
      .slice(0, 20) // Top 20
      .map(t => ({
        taskId: (t as any).id,
        title: (t as any).title || 'Untitled',
        priority: (t as any).priority || 'Medium',
        status: (t as any).status || 'To Do',
        assignedTo: (t as any).assignedAgentId || (t as any).assigneeId || 'Unassigned',
      }));

    // 4. Build active assignments
    const activeTasks = tasks.filter(t => {
      const status = (t as any).status;
      return status === 'In Progress' || status === 'Review';
    });

    const activeAssignments = [];
    for (const task of activeTasks) {
      const agentIdForTask = (task as any).assignedAgentId || (task as any).assigneeId;
      let agentName = 'Unknown';
      let agentRole = 'Unknown';

      if (agentIdForTask) {
        try {
          const agentDoc = await db.collection('agents').doc(agentIdForTask).get();
          if (agentDoc.exists) {
            agentName = (agentDoc.data() as any)?.name || agentIdForTask;
            agentRole = (agentDoc.data() as any)?.role || 'Unknown';
          }
        } catch (_) {}
      }

      activeAssignments.push({
        agentId: agentIdForTask || 'unassigned',
        agentName,
        agentRole,
        taskId: (task as any).id,
        taskTitle: (task as any).title || 'Untitled',
        taskStatus: (task as any).status,
      });
    }

    // 5. Determine out-of-scope items
    const doneTaskTitles = tasks
      .filter(t => (t as any).status === 'Done')
      .map(t => (t as any).title || 'Untitled')
      .slice(0, 10);

    const outOfScope: string[] = [
      ...doneTaskTitles.map(t => `✅ Completed: ${t}`),
      'No scope changes mid-sprint without CTO approval',
      'No architecture changes without Architect review',
    ];

    // 6. Find dependencies and blocked items
    const dependencies = tasks
      .filter(t => {
        const deps = (t as any).dependencies || (t as any).blockedBy;
          return deps && (Array.isArray(deps) ? deps.length > 0 : !!deps);
        })
      .map(t => ({
        taskId: (t as any).id,
        title: (t as any).title || 'Untitled',
        blockedBy: (t as any).dependencies || (t as any).blockedBy || '',
        status: (t as any).status || 'To Do',
      }));

    // 7. Collect relevant ADRs (if any exist)
    let relevantADRs: string[] = [];
    try {
      const adrSnapshot = await db.collection('adrs')
        .where('projectId', '==', projectId)
        .where('status', '==', 'accepted')
        .limit(10)
        .get();
      relevantADRs = adrSnapshot.docs.map(doc => {
        const data = doc.data();
        return `ADR-${data.id || doc.id}: ${data.title || data.name || 'Untitled'}`;
      });
    } catch (_) {
      // ADRs collection may not exist
    }

    // 8. Build focus areas from priority tasks
    const focus = [...new Set(
      tasks
        .filter(t => (t as any).status !== 'Done' && (t as any).priority === 'Urgent')
        .map(t => (t as any).epic || (t as any).title || 'General')
    )].slice(0, 5);

    // If agent-specific, filter to their tasks
    let filteredPriorities = priorities;
    let filteredAssignments = activeAssignments;

    if (agentId) {
      // Show agent's tasks first, then other high-priority items
      filteredPriorities = [
        ...priorities.filter(p => p.assignedTo === agentId),
        ...priorities.filter(p => p.assignedTo !== agentId),
      ].slice(0, 15);

      // Show all assignments so agent knows what others are doing
    }

    return {
      sprint,
      focus,
      priorities: filteredPriorities,
      activeAssignments: filteredAssignments,
      outOfScope,
      dependencies,
      relevantADRs,
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[SprintContext] Error building context:', error);
    return emptyContext;
  }
}

/**
 * Generate a formatted text summary for agent injection
 */
export function formatSprintContext(context: SprintContext): string {
  const lines: string[] = ['## Sprint Context'];

  if (context.sprint) {
    lines.push(`**Sprint:** ${context.sprint.name} (${context.sprint.status})`);
    lines.push(`**Goal:** ${context.sprint.goal}`);
  } else {
    lines.push('**No active sprint**');
  }

  if (context.focus.length > 0) {
    lines.push('\n### Focus Areas');
    context.focus.forEach(f => lines.push(`- ${f}`));
  }

  if (context.priorities.length > 0) {
    lines.push('\n### Priority Tasks');
    context.priorities.forEach(p => {
      lines.push(`- [${p.priority}] ${p.title} — ${p.status} → ${p.assignedTo}`);
    });
  }

  if (context.activeAssignments.length > 0) {
    lines.push('\n### Active Assignments (who is working on what)');
    context.activeAssignments.forEach(a => {
      lines.push(`- ${a.agentName} (${a.agentRole}): ${a.taskTitle} [${a.taskStatus}]`);
    });
  }

  if (context.dependencies.length > 0) {
    lines.push('\n### Dependencies & Blocked Items');
    context.dependencies.forEach(d => {
      lines.push(`- ⚠️ ${d.title} — blocked by: ${d.blockedBy}`);
    });
  }

  if (context.outOfScope.length > 0) {
    lines.push('\n### Out of Scope');
    context.outOfScope.forEach(o => lines.push(`- ${o}`));
  }

  if (context.relevantADRs.length > 0) {
    lines.push('\n### Relevant ADRs');
    context.relevantADRs.forEach(a => lines.push(`- ${a}`));
  }

  lines.push(`\n_Generated: ${context.generatedAt}_`);
  return lines.join('\n');
}
