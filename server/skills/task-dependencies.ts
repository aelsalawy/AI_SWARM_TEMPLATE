/**
 * P2-Swarm-05: Task Dependency Resolution — Block Until Prerequisites Met
 *
 * Checks task prerequisites before allowing a task to start.
 * Tasks with unmet dependencies are blocked from transitioning to "In Progress".
 */

import { db, firebaseReady } from '../firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Dependency {
  id?: string;
  taskId: string;           // The task that has the dependency
  dependsOnTaskId: string;  // The task that must be completed first
  type: 'blocks' | 'related' | 'requires';
  status: 'pending' | 'met' | 'failed';
  createdAt?: any;
}

export interface DependencyCheckResult {
  canStart: boolean;
  unmetDependencies: Array<{
    taskId: string;
    taskTitle: string;
    taskStatus: string;
    dependencyType: string;
  }>;
  metDependencies: Array<{
    taskId: string;
    taskTitle: string;
  }>;
}

// ---------------------------------------------------------------------------
// Dependency Functions
// ---------------------------------------------------------------------------

/**
 * Add a dependency between two tasks
 */
export async function addDependency(
  taskId: string,
  dependsOnTaskId: string,
  type: Dependency['type'] = 'blocks'
): Promise<Dependency | null> {
  if (!firebaseReady || !db) return null;

  try {
    // Validate both tasks exist
    const [taskDoc, dependsOnDoc] = await Promise.all([
      db.collection('tasks').doc(taskId).get(),
      db.collection('tasks').doc(dependsOnTaskId).get(),
    ]);

    if (!taskDoc.exists) {
      console.error(`[Dependencies] Task ${taskId} not found`);
      return null;
    }
    if (!dependsOnDoc.exists) {
      console.error(`[Dependencies] Dependency task ${dependsOnTaskId} not found`);
      return null;
    }

    // Check for circular dependency
    const hasCircular = await checkCircularDependency(taskId, dependsOnTaskId);
    if (hasCircular) {
      console.error(`[Dependencies] Circular dependency detected: ${taskId} ↔ ${dependsOnTaskId}`);
      return null;
    }

    const dependency: Dependency = {
      taskId,
      dependsOnTaskId,
      type,
      status: 'pending',
      createdAt: Timestamp.now(),
    };

    const docRef = await db.collection('task_dependencies').add(dependency);

    // Update both tasks with dependency info
    await db.collection('tasks').doc(taskId).update({
      dependencies: [...((taskDoc.data() as any)?.dependencies || []), dependsOnTaskId],
      updatedAt: Timestamp.now(),
    });

    await db.collection('tasks').doc(dependsOnTaskId).update({
      blockingTasks: [...((dependsOnDoc.data() as any)?.blockingTasks || []), taskId],
      updatedAt: Timestamp.now(),
    });

    console.log(`[Dependencies] Added: ${taskId} depends on ${dependsOnTaskId} (${type})`);
    return { ...dependency, id: docRef.id };
  } catch (error) {
    console.error('[Dependencies] Error adding dependency:', error);
    return null;
  }
}

/**
 * Remove a dependency between tasks
 */
export async function removeDependency(taskId: string, dependsOnTaskId: string): Promise<boolean> {
  if (!firebaseReady || !db) return false;

  try {
    // Find and delete the dependency record
    const snapshot = await db.collection('task_dependencies')
      .where('taskId', '==', taskId)
      .where('dependsOnTaskId', '==', dependsOnTaskId)
      .get();

    if (snapshot.empty) return false;

    const batch = db.batch();
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();

    // Update task dependency arrays
    const taskDoc = await db.collection('tasks').doc(taskId).get();
    if (taskDoc.exists) {
      const currentDeps = ((taskDoc.data() as any)?.dependencies || []) as string[];
      await db.collection('tasks').doc(taskId).update({
        dependencies: currentDeps.filter(d => d !== dependsOnTaskId),
        updatedAt: Timestamp.now(),
      });
    }

    const dependsOnDoc = await db.collection('tasks').doc(dependsOnTaskId).get();
    if (dependsOnDoc.exists) {
      const currentBlocking = ((dependsOnDoc.data() as any)?.blockingTasks || []) as string[];
      await db.collection('tasks').doc(dependsOnTaskId).update({
        blockingTasks: currentBlocking.filter(b => b !== taskId),
        updatedAt: Timestamp.now(),
      });
    }

    console.log(`[Dependencies] Removed: ${taskId} no longer depends on ${dependsOnTaskId}`);
    return true;
  } catch (error) {
    console.error('[Dependencies] Error removing dependency:', error);
    return false;
  }
}

/**
 * Check if a task can start (all dependencies met)
 */
export async function checkDependencies(taskId: string): Promise<DependencyCheckResult> {
  const result: DependencyCheckResult = {
    canStart: true,
    unmetDependencies: [],
    metDependencies: [],
  };

  if (!firebaseReady || !db) return result;

  try {
    // Get all dependencies for this task
    const snapshot = await db.collection('task_dependencies')
      .where('taskId', '==', taskId)
      .get();

    if (snapshot.empty) return result; // No dependencies

    for (const doc of snapshot.docs) {
      const dep = doc.data() as Dependency;
      const depTaskDoc = await db.collection('tasks').doc(dep.dependsOnTaskId).get();

      if (!depTaskDoc.exists) {
        result.unmetDependencies.push({
          taskId: dep.dependsOnTaskId,
          taskTitle: 'Deleted/Unknown task',
          taskStatus: 'Unknown',
          dependencyType: dep.type,
        });
        continue;
      }

      const depTask = depTaskDoc.data();
      const depStatus = (depTask as any)?.status;

      if (depStatus === 'Done') {
        result.metDependencies.push({
          taskId: dep.dependsOnTaskId,
          taskTitle: (depTask as any)?.title || 'Untitled',
        });

        // Update dependency status
        await db.collection('task_dependencies').doc(doc.id).update({ status: 'met' });
      } else {
        result.unmetDependencies.push({
          taskId: dep.dependsOnTaskId,
          taskTitle: (depTask as any)?.title || 'Untitled',
          taskStatus: depStatus || 'Unknown',
          dependencyType: dep.type,
        });
        result.canStart = false;
      }
    }

    return result;
  } catch (error) {
    console.error('[Dependencies] Error checking dependencies:', error);
    return { canStart: false, unmetDependencies: [], metDependencies: [] };
  }
}

/**
 * Check for circular dependencies (BFS)
 */
async function checkCircularDependency(taskId: string, newDependsOnId: string): Promise<boolean> {
  if (!firebaseReady || !db) return false;

  // If newDependsOnId already depends (directly or transitively) on taskId, adding this would create a cycle
  const visited = new Set<string>();
  const queue = [newDependsOnId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === taskId) return true; // Cycle detected
    if (visited.has(current)) continue;
    visited.add(current);

    try {
      const snapshot = await db.collection('task_dependencies')
        .where('taskId', '==', current)
        .get();

      for (const doc of snapshot.docs) {
        const dep = doc.data() as Dependency;
        queue.push(dep.dependsOnTaskId);
      }
    } catch (_) {
      break;
    }

    // Safety limit
    if (visited.size > 100) break;
  }

  return false;
}

/**
 * Get all dependencies for a task
 */
export async function getTaskDependencies(taskId: string): Promise<Dependency[]> {
  if (!firebaseReady || !db) return [];

  try {
    const snapshot = await db.collection('task_dependencies')
      .where('taskId', '==', taskId)
      .get();

    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Dependency));
  } catch (error) {
    console.error('[Dependencies] Error getting dependencies:', error);
    return [];
  }
}

/**
 * Get all tasks blocked by a given task
 */
export async function getBlockingTasks(taskId: string): Promise<Dependency[]> {
  if (!firebaseReady || !db) return [];

  try {
    const snapshot = await db.collection('task_dependencies')
      .where('dependsOnTaskId', '==', taskId)
      .get();

    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Dependency));
  } catch (error) {
    console.error('[Dependencies] Error getting blocking tasks:', error);
    return [];
  }
}

/**
 * Dependency check middleware — blocks task start when dependencies are unmet
 */
export function dependencyCheckMiddleware() {
  return async (req: any, res: any, next: any) => {
    // Only enforce when transitioning to "In Progress"
    if (req.method !== 'POST' || !req.path?.endsWith('/claim')) {
      if (req.method !== 'PATCH' || req.body?.status !== 'In Progress') {
        return next();
      }
    }

    const taskId = req.params?.id;
    if (!taskId || !firebaseReady || !db) return next();

    try {
      const depCheck = await checkDependencies(taskId);

      if (!depCheck.canStart) {
        return res.status(423).json({
          message: `Task has unmet dependencies`,
          unmetDependencies: depCheck.unmetDependencies,
        });
      }

      next();
    } catch (error) {
      console.error('[Dependencies] Middleware error:', error);
      next(); // Fail open
    }
  };
}
