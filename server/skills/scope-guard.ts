/**
 * P2-Swarm-01: Scope Guard — Role Boundary Enforcement
 *
 * Middleware that checks whether an agent is allowed to perform an action
 * on a task based on their role. Enforces CAN/CANNOT boundaries and logs
 * scope violations.
 */

import { db, firebaseReady } from '../firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

// ---------------------------------------------------------------------------
// Role definitions with explicit CAN/CANNOT boundaries
// ---------------------------------------------------------------------------

export interface RoleBoundary {
  role: string;
  can: string[];
  cannot: string[];
  escalateTo?: string;
}

const ROLE_BOUNDARIES: RoleBoundary[] = [
  {
    role: 'CTO',
    can: [
      'task.create',
      'task.assign',
      'task.update',
      'task.review',
      'task.close',
      'spec.write',
      'adr.create',
      'sprint.manage',
      'agent.manage',
      'project.manage',
      'escalation.handle',
      'comment.write',
    ],
    cannot: [
      'code.write',
      'code.deploy',
      'test.execute',
      'bug.fix',
    ],
    escalateTo: undefined, // CTO is top of chain
  },
  {
    role: 'Senior Dev',
    can: [
      'task.claim',
      'task.update',
      'task.complete',
      'code.write',
      'code.review',
      'comment.write',
      'bug.fix',
      'test.execute',
      'task.create',
    ],
    cannot: [
      'task.assign',      // Only CTO/PM can assign
      'architecture.decide',
      'spec.write',
      'sprint.manage',
      'deploy.production',
    ],
    escalateTo: 'CTO',
  },
  {
    role: 'Dev',
    can: [
      'task.claim',
      'task.update',
      'task.complete',
      'code.write',
      'comment.write',
      'bug.fix',
    ],
    cannot: [
      'task.assign',
      'task.create',       // Dev can't create tasks
      'code.review',       // Senior Dev reviews
      'architecture.decide',
      'spec.write',
      'deploy.production',
      'sprint.manage',
    ],
    escalateTo: 'Senior Dev',
  },
  {
    role: 'QA-Ops',
    can: [
      'task.claim',
      'task.update',
      'task.complete',
      'test.execute',
      'test.create',
      'bug.create',
      'bug.verify',
      'comment.write',
    ],
    cannot: [
      'code.write',
      'bug.fix',
      'deploy.production',
      'task.assign',
      'architecture.decide',
    ],
    escalateTo: 'Senior Dev',
  },
  {
    role: 'SW Architect',
    can: [
      'task.review',
      'task.update',
      'architecture.decide',
      'code.review',
      'adr.create',
      'adr.review',
      'comment.write',
      'spec.review',
    ],
    cannot: [
      'code.write',        // Architect advises, doesn't implement
      'task.claim',        // Can't claim implementation tasks
      'test.execute',
      'deploy.production',
    ],
    escalateTo: 'CTO',
  },
  {
    role: 'UI Developer',
    can: [
      'task.claim',
      'task.update',
      'task.complete',
      'code.write',        // Frontend only
      'code.review',       // UI code reviews
      'comment.write',
    ],
    cannot: [
      'backend.modify',
      'database.modify',
      'api.design',
      'deploy.production',
      'architecture.decide',
    ],
    escalateTo: 'Senior Dev',
  },
  {
    role: 'Deploy-Ops',
    can: [
      'task.claim',
      'task.update',
      'task.complete',
      'deploy.staging',
      'deploy.production',
      'config.manage',
      'comment.write',
    ],
    cannot: [
      'code.write',
      'code.review',
      'architecture.decide',
      'spec.write',
    ],
    escalateTo: 'CTO',
  },
  {
    role: 'Docs Agent',
    can: [
      'task.claim',
      'task.update',
      'task.complete',
      'docs.write',
      'docs.review',
      'comment.write',
    ],
    cannot: [
      'code.write',
      'test.execute',
      'deploy.production',
      'architecture.decide',
    ],
    escalateTo: 'Senior Dev',
  },
];

// Map of role aliases to canonical role names
const ROLE_ALIASES: Record<string, string> = {
  'cto': 'CTO',
  'senior dev': 'Senior Dev',
  'seniordev': 'Senior Dev',
  'dev': 'Dev',
  'developer': 'Dev',
  'qa-ops': 'QA-Ops',
  'qa': 'QA-Ops',
  'qa analyst': 'QA-Ops',
  'sw architect': 'SW Architect',
  'architect': 'SW Architect',
  'swarch': 'SW Architect',
  'ui developer': 'UI Developer',
  'ui dev': 'UI Developer',
  'ui/ux expert': 'UI Developer',
  'ux dev': 'UI Developer',
  'deploy-ops': 'Deploy-Ops',
  'devops': 'Deploy-Ops',
  'docs agent': 'Docs Agent',
  'security agent': 'Deploy-Ops', // Security-related deployments
};

// ---------------------------------------------------------------------------
// Scope Guard
// ---------------------------------------------------------------------------

export interface ScopeCheckResult {
  allowed: boolean;
  role: string;
  action: string;
  reason?: string;
  escalateTo?: string;
}

/**
 * Resolve a role string to its canonical form
 */
export function resolveRole(role: string | undefined): string {
  if (!role) return 'Dev';
  const canonical = ROLE_ALIASES[role.toLowerCase()] || ROLE_ALIASES[role] || role;
  return canonical;
}

/**
 * Get the boundary definition for a role
 */
export function getRoleBoundary(role: string): RoleBoundary {
  const canonical = resolveRole(role);
  return ROLE_BOUNDARIES.find(b => b.role === canonical) || ROLE_BOUNDARIES.find(b => b.role === 'Dev')!;
}

/**
 * Check if an agent with a given role is allowed to perform an action
 */
export function checkScope(agentRole: string, action: string): ScopeCheckResult {
  const boundary = getRoleBoundary(agentRole);

  // Check explicit CAN list
  if (boundary.can.includes(action)) {
    return { allowed: true, role: boundary.role, action };
  }

  // Check explicit CANNOT list
  if (boundary.cannot.includes(action)) {
    return {
      allowed: false,
      role: boundary.role,
      action,
      reason: `Role "${boundary.role}" cannot perform "${action}"`,
      escalateTo: boundary.escalateTo,
    };
  }

  // Action not in either list — allow by default (explicit allowlist for known actions)
  return { allowed: true, role: boundary.role, action };
}

/**
 * Express middleware for scope checking on task modifications
 * Uses X-Agent-ID header to determine agent role
 */
export function scopeGuardMiddleware(action: string) {
  return async (req: any, res: any, next: any) => {
    const agentId = req.headers['x-agent-id'] as string | undefined;

    if (!agentId || !firebaseReady || !db) {
      // If no agent identity or no DB, skip scope check (browser users, demo mode)
      return next();
    }

    try {
      // Look up agent role from Firestore
      const agentDoc = await db.collection('agents').doc(agentId).get();
      if (!agentDoc.exists) {
        return next(); // Unknown agent, allow through
      }

      const agentRole = (agentDoc.data() as any)?.role;
      if (!agentRole) {
        return next(); // No role defined, allow
      }

      const result = checkScope(agentRole, action);

      if (!result.allowed) {
        // Log scope violation
        await logScopeViolation(agentId, agentRole, action, result.reason || 'Scope violation');

        return res.status(403).json({
          message: `Scope violation: ${result.reason}`,
          role: result.role,
          action: result.action,
          escalateTo: result.escalateTo,
        });
      }

      // Attach scope info to request for downstream use
      req.scopeCheck = result;
      next();
    } catch (error) {
      console.error('[ScopeGuard] Error during scope check:', error);
      next(); // Fail open — don't block on errors
    }
  };
}

/**
 * Log a scope violation to Firestore
 */
async function logScopeViolation(
  agentId: string,
  agentRole: string,
  action: string,
  reason: string
): Promise<void> {
  if (!firebaseReady || !db) return;

  try {
    await db.collection('scope_violations').add({
      agentId,
      agentRole,
      action,
      reason,
      timestamp: Timestamp.now(),
      reviewed: false,
    });
    console.log(`[ScopeGuard] Violation logged: ${agentId} (${agentRole}) attempted ${action}`);
  } catch (error) {
    console.error('[ScopeGuard] Failed to log violation:', error);
  }
}

/**
 * Get all role boundaries (for API exposure)
 */
export function getAllRoleBoundaries(): RoleBoundary[] {
  return ROLE_BOUNDARIES;
}

/**
 * Get scope violations for a specific agent
 */
export async function getScopeViolations(agentId?: string): Promise<any[]> {
  if (!firebaseReady || !db) return [];

  try {
    let query = db.collection('scope_violations').orderBy('timestamp', 'desc');

    if (agentId) {
      query = query.where('agentId', '==', agentId);
    }

    const snapshot = await query.limit(50).get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('[ScopeGuard] Error fetching violations:', error);
    return [];
  }
}
