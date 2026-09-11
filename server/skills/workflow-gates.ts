/**
 * P2-Swarm-04: Workflow Gate Enforcement
 *
 * Blocks unauthorized state transitions on tasks.
 * E.g., a Dev can't mark their own task as Done without review.
 * State transitions must pass through defined gates.
 */

import { db, firebaseReady } from '../firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { resolveRole } from './scope-guard';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GateRule {
  id: string;
  name: string;
  description: string;
  fromStatus: string;
  toStatus: string;
  allowedRoles: string[];
  requiresReview?: boolean;
  additionalConditions?: string[];
}

export interface GateCheckResult {
  allowed: boolean;
  reason?: string;
  requiresReview?: boolean;
  gateId?: string;
}

// ---------------------------------------------------------------------------
// Gate Rules
// ---------------------------------------------------------------------------

const GATE_RULES: GateRule[] = [
  {
    id: 'gate-to-in-progress',
    name: 'Start Work Gate',
    description: 'Any agent can start a task assigned to them',
    fromStatus: 'To Do',
    toStatus: 'In Progress',
    allowedRoles: ['Dev', 'Senior Dev', 'QA-Ops', 'UI Developer', 'Deploy-Ops', 'Docs Agent'],
  },
  {
    id: 'gate-to-review',
    name: 'Request Review Gate',
    description: 'Dev can request review, but task needs reviewer',
    fromStatus: 'In Progress',
    toStatus: 'Review',
    allowedRoles: ['Dev', 'Senior Dev', 'UI Developer'],
    requiresReview: true,
    additionalConditions: ['Task must have assigned reviewer or auto-assign to Architect'],
  },
  {
    id: 'gate-review-to-done',
    name: 'Review to Done Gate',
    description: 'Only reviewer (Architect/Senior Dev/CTO) can approve task as Done',
    fromStatus: 'Review',
    toStatus: 'Done',
    allowedRoles: ['SW Architect', 'Senior Dev', 'CTO'],
    additionalConditions: ['Reviewer must not be the task implementer'],
  },
  {
    id: 'gate-dev-no-direct-done',
    name: 'No Direct Done Gate',
    description: 'Dev cannot mark own task as Done — must go through Review',
    fromStatus: 'In Progress',
    toStatus: 'Done',
    allowedRoles: ['SW Architect', 'Senior Dev', 'CTO'], // Only reviewers
    additionalConditions: ['Agent must not be the task assignee'],
  },
  {
    id: 'gate-back-to-todo',
    name: 'Return to Backlog Gate',
    description: 'CTO or Architect can send tasks back to To Do',
    fromStatus: 'In Progress',
    toStatus: 'To Do',
    allowedRoles: ['CTO', 'SW Architect'],
  },
  {
    id: 'gate-review-reject',
    name: 'Review Reject Gate',
    description: 'Reviewer can reject back to In Progress',
    fromStatus: 'Review',
    toStatus: 'In Progress',
    allowedRoles: ['SW Architect', 'Senior Dev', 'CTO'],
  },
  {
    id: 'gate-blocked',
    name: 'Block Task Gate',
    description: 'Any agent can block a task they are working on',
    fromStatus: 'In Progress',
    toStatus: 'Blocked',
    allowedRoles: ['Dev', 'Senior Dev', 'QA-Ops', 'UI Developer', 'Deploy-Ops'],
  },
  {
    id: 'gate-unblock',
    name: 'Unblock Task Gate',
    description: 'CTO or Architect can unblock tasks',
    fromStatus: 'Blocked',
    toStatus: 'In Progress',
    allowedRoles: ['CTO', 'SW Architect', 'Senior Dev'],
  },
];

// ---------------------------------------------------------------------------
// Gate Enforcement
// ---------------------------------------------------------------------------

/**
 * Check if a state transition is allowed for a given agent role
 */
export function checkGate(
  fromStatus: string,
  toStatus: string,
  agentRole: string,
  agentId?: string,
  taskAssigneeId?: string
): GateCheckResult {
  const canonicalRole = resolveRole(agentRole);

  // Find matching gate rule
  const rule = GATE_RULES.find(
    r => r.fromStatus === fromStatus && r.toStatus === toStatus
  );

  if (!rule) {
    // No gate rule — check if this is even a valid transition
    // Allow unknown transitions for roles with broad permissions
    const broadRoles = ['CTO'];
    if (broadRoles.includes(canonicalRole)) {
      return { allowed: true, reason: 'CTO has broad override permissions' };
    }
    return {
      allowed: false,
      reason: `No gate rule for transition: ${fromStatus} → ${toStatus}. Transition may not be allowed.`,
    };
  }

  // Check if agent's role is allowed
  if (!rule.allowedRoles.includes(canonicalRole)) {
    return {
      allowed: false,
      reason: `Role "${canonicalRole}" is not allowed to transition from "${fromStatus}" to "${toStatus}". Allowed roles: ${rule.allowedRoles.join(', ')}`,
      gateId: rule.id,
    };
  }

  // Special check: Dev can't mark own task as Done
  if (agentId && taskAssigneeId && agentId === taskAssigneeId) {
    if (toStatus === 'Done' && fromStatus !== 'Review') {
      const implementerRoles = ['Dev', 'UI Developer'];
      if (implementerRoles.includes(canonicalRole)) {
        return {
          allowed: false,
          reason: `Implementer (${canonicalRole}) cannot mark their own task as Done. Must go through Review.`,
          gateId: 'gate-dev-no-direct-done',
        };
      }
    }
  }

  return {
    allowed: true,
    requiresReview: rule.requiresReview,
    gateId: rule.id,
  };
}

/**
 * Express middleware for gate enforcement on task PATCH requests
 */
export function gateEnforcementMiddleware() {
  return async (req: any, res: any, next: any) => {
    // Only enforce on PATCH with status change
    if (req.method !== 'PATCH' || !req.body?.status) {
      return next();
    }

    const agentId = req.headers['x-agent-id'] as string | undefined;
    const taskId = req.params?.id;

    if (!agentId || !firebaseReady || !db) {
      return next(); // Browser/demo mode — skip gate
    }

    try {
      // Get current task state
      const taskDoc = await db.collection('tasks').doc(taskId).get();
      if (!taskDoc.exists) {
        return next(); // Task not found — let the route handler deal with it
      }

      const currentTask = taskDoc.data();
      const fromStatus = currentTask?.status;
      const toStatus = req.body.status;

      // Skip if no status change
      if (fromStatus === toStatus) {
        return next();
      }

      // Get agent role
      const agentDoc = await db.collection('agents').doc(agentId).get();
      const agentRole = agentDoc.exists ? (agentDoc.data() as any)?.role : 'Unknown';

      // Check gate
      const result = checkGate(
        fromStatus,
        toStatus,
        agentRole,
        agentId,
        currentTask?.assignedAgentId || currentTask?.assigneeId
      );

      if (!result.allowed) {
        // Log gate violation
        await logGateViolation(agentId, agentRole, taskId, fromStatus, toStatus, result.reason || 'Gate denied');

        return res.status(403).json({
          message: `Gate denied: ${result.reason}`,
          gate: result.gateId,
          fromStatus,
          toStatus,
        });
      }

      // Attach gate info to request
      req.gateCheck = result;
      next();
    } catch (error) {
      console.error('[GateEnforcement] Error during gate check:', error);
      next(); // Fail open
    }
  };
}

/**
 * Log gate violations
 */
async function logGateViolation(
  agentId: string,
  agentRole: string,
  taskId: string,
  fromStatus: string,
  toStatus: string,
  reason: string
): Promise<void> {
  if (!firebaseReady || !db) return;

  try {
    await db.collection('gate_violations').add({
      agentId,
      agentRole,
      taskId,
      fromStatus,
      toStatus,
      reason,
      timestamp: Timestamp.now(),
      reviewed: false,
    });
    console.log(`[GateEnforcement] Violation: ${agentId} (${agentRole}) tried ${fromStatus}→${toStatus} on ${taskId}`);
  } catch (error) {
    console.error('[GateEnforcement] Failed to log violation:', error);
  }
}

/**
 * Get all gate rules (for API exposure)
 */
export function getGateRules(): GateRule[] {
  return GATE_RULES;
}

/**
 * Get gate violations
 */
export async function getGateViolations(agentId?: string): Promise<any[]> {
  if (!firebaseReady || !db) return [];

  try {
    let query = db.collection('gate_violations').orderBy('timestamp', 'desc');

    if (agentId) {
      query = query.where('agentId', '==', agentId);
    }

    const snapshot = await query.limit(50).get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('[GateEnforcement] Error fetching violations:', error);
    return [];
  }
}
