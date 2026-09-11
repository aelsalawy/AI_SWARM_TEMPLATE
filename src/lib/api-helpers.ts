/**
 * API Helpers — Replaces Firestore Helpers with REST API calls
 * Provides the same interface but uses the new PostgreSQL backend
 */

import { apiClient } from './api-client';
// ---------------------------------------------------------------------------
// Shared result types (moved from deleted firestore-helpers.ts)
// ---------------------------------------------------------------------------

export interface ChartDataPoint {
  name: string;
  success: number;
  fail: number;
  [key: string]: unknown;
}

export interface TasksCountResult {
  total: number;
  byStatus: Record<string, number>;
  [key: string]: unknown;
}

export interface AgentsStatusResult {
  online: number;
  total: number;
  [key: string]: unknown;
}

export interface TestRunStatsResult {
  passRate: number;
  avgDuration: number;
  [key: string]: unknown;
}

export interface ActivityLogResult {
  id: string;
  title?: string;
  action: string;
  description?: string;
  timestamp?: any;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build an array of the last `n` day labels (Mon, Tue, …) ending *today*.
 */
function lastNDayLabels(n: number): string[] {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const labels: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    labels.push(days[d.getDay()]);
  }
  return labels;
}

/**
 * Return midnight-UTC boundaries for the last `n` days.
 * `boundaries[0]` = start of oldest day, `boundaries[n]` = end of today.
 */
function lastNDayBoundaries(n: number): Date[] {
  const boundaries: Date[] = [];
  const now = new Date();
  for (let i = n; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    boundaries.push(d);
  }
  return boundaries;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Query the `test_runs` collection and group results by day for the last `days` days.
 * Status "Passed" → success, "Failed"/"Skipped" → fail.
 */
export async function getTestRunsByDay(
  days: number = 7
): Promise<ChartDataPoint[]> {
  const boundaries = lastNDayBoundaries(days);
  const labels = lastNDayLabels(days);

  // Calculate the start date for the query window
  const startDate = boundaries[0];

  // Fetch test runs from API
  const testRuns = await apiClient.testRuns.list();

  // Filter runs created after the start of the window
  const filteredRuns = testRuns.filter(run => {
    const runDate = new Date((run.createdAt || run.timestamp) as string | number);
    return runDate >= startDate;
  });

  // Initialise buckets
  const buckets: ChartDataPoint[] = labels.map((name) => ({
    name,
    success: 0,
    fail: 0,
  }));

  filteredRuns.forEach((run) => {
    const runDate = new Date((run.createdAt || run.timestamp) as string | number);

    // Find which day bucket this falls into
    for (let i = 0; i < days; i++) {
      if (runDate >= boundaries[i] && runDate < boundaries[i + 1]) {
        if (run.status === 'Passed') {
          buckets[i].success++;
        } else if (run.status === 'Failed' || run.status === 'Skipped') {
          buckets[i].fail++;
        }
        break;
      }
    }
  });

  return buckets;
}

/**
 * Count tasks, optionally scoped to a user (ownerId).
 */
export async function getTasksCount(
  userId?: string
): Promise<TasksCountResult> {
  const tasks = await apiClient.tasks.list();
  
  // Client-side filter by userId if provided
  const scoped = userId
    ? tasks.filter((task: any) => task.ownerId === userId)
    : tasks;
  
  const byStatus: Record<string, number> = {};
  
  scoped.forEach((task: any) => {
    const status = task.status || 'Unknown';
    byStatus[status] = (byStatus[status] || 0) + 1;
  });

  return {
    total: scoped.length,
    byStatus,
  };
}

/**
 * Get agent online/total counts from the `agents` collection.
 */
export async function getAgentsStatus(
): Promise<AgentsStatusResult> {
  const agents = await apiClient.agents.list();
  let online = 0;
  
  agents.forEach((agent) => {
    const status = agent.status;
    if (status === 'online' || status === 'busy') {
      online++;
    }
  });
  
  return { online, total: agents.length };
}

/**
 * Fetch all agents from the `agents` collection.
 * Returns raw document data with id attached.
 */
export async function getAgents(
): Promise<import('./types').Agent[]> {
  return apiClient.agents.list();
}

/**
 * Fetch all tasks from the `tasks` collection, optionally scoped to a user.
 */
export async function getTasks(
  userId?: string
): Promise<import('./types').Task[]> {
  const tasks = await apiClient.tasks.list();
  if (!userId) return tasks;
  return tasks.filter((t: any) => t.ownerId === userId);
}

/**
 * Fetch all test runs from the `test_runs` collection, optionally scoped to a user.
 */
export async function getTestRuns(
  userId?: string
): Promise<import('./types').TestRun[]> {
  const allRuns = await apiClient.testRuns.list();
  if (!userId) return allRuns;
  return allRuns.filter((r: any) => r.ownerId === userId);
}

export async function getBugTrendData(
  weeks: number = 4
): Promise<any[]> {
  try {
    // Get boundaries for the last N weeks
    const boundaries: Date[] = [];
    const now = new Date();
    for (let i = weeks * 7; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      boundaries.push(d);
    }

    // Get week labels
    const weekLabels: string[] = [];
    const weekNames = ['W1', 'W2', 'W3', 'W4'];
    for (let i = 0; i < weeks; i++) {
      weekLabels.push(weekNames[i % weekNames.length]);
    }

    // Fetch bugs from API
    const bugs = await apiClient.bugs.list();

    // Filter bugs created in the time window
    const startDate = boundaries[0];
    const filteredBugs = bugs.filter(bug => {
      const createdAt = new Date(bug.createdAt as string | number);
      return createdAt >= startDate;
    });

    // Initialize buckets
    const buckets = weekLabels.map((name) => ({
      name,
      created: 0,
      resolved: 0,
    }));

    // Count bugs by week
    filteredBugs.forEach((bug) => {
      const createdAt = new Date(bug.createdAt as string | number);
      const status = bug.status || 'Open';

      // Find which week bucket this falls into
      for (let i = 0; i < weeks; i++) {
        if (createdAt >= boundaries[i] && createdAt < boundaries[i + 1]) {
          if (status === 'Open' || status === 'In Progress') {
            buckets[i].created++;
          } else if (status === 'Resolved' || status === 'Closed') {
            buckets[i].resolved++;
          }
          break;
        }
      }
    });

    return buckets;
  } catch (err) {
    console.error('Failed to load bug trend:', err);
    return [];
  }
}

export async function getSprintProgressData(
): Promise<any[]> {
  try {
    const sprints = await apiClient.sprints.list();
    const activeSprints = sprints.filter(sprint => 
      sprint.status === 'Planning' || sprint.status === 'Active'
    );

    const sprintData = await Promise.all(activeSprints.map(async (sprint) => {
      const allTasks = await apiClient.tasks.list();
      const tasks = allTasks.filter((t: any) => t.sprintId === sprint.id);
      const totalTasks = tasks.length;
      const completedTasks = tasks.filter(task => 
        task.status === 'Done' || task.status === 'Completed'
      ).length;
      
      return {
        name: sprint.name || `Sprint ${sprint.id?.substring(0, 8) ?? 'unknown'}`,
        total: totalTasks,
        completed: completedTasks,
        progress: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
      };
    }));

    return sprintData;
  } catch (err) {
    console.error('Failed to load sprint progress:', err);
    return [];
  }
}

/**
 * Get aggregated test run statistics: pass rate and average duration.
 * Queries the `test_runs` collection and computes metrics from documents
 * that have a `status` and `duration` field.
 */
export async function getTestRunStats(
): Promise<TestRunStatsResult> {
  const testRuns = await apiClient.testRuns.list();

  let passed = 0;
  let totalDuration = 0;
  let count = 0;

  testRuns.forEach((run) => {
    if (run.status === 'Passed' || run.status === 'passed') {
      passed++;
    }
    if (typeof run.duration === 'number') {
      totalDuration += run.duration;
      count++;
    }
  });

  const total = testRuns.length || 1; // avoid division by zero
  return {
    passRate: total > 0 ? Math.round((passed / total) * 1000) / 10 : 0, // e.g. 85.5
    avgDuration: count > 0 ? Math.round((totalDuration / count) * 10) / 10 : 0,
  };
}

export async function getRecentActivity(
  maxEntries: number = 5
): Promise<ActivityLogResult[]> {
  const auditLogs = await apiClient.auditLogs.list();
  
  // Sort by timestamp descending
  const sortedLogs = auditLogs.sort((a, b) => {
    const dateA = new Date((a.timestamp || a.createdAt) as string | number | Date).getTime();
    const dateB = new Date((b.timestamp || b.createdAt) as string | number | Date).getTime();
    return dateB - dateA;
  });

  return sortedLogs.slice(0, maxEntries).map(log => ({
    ...log,
    id: log.id,
    title: String(log.title ?? log.action ?? ''),
    action: log.action,
    description: log.description,
    timestamp: log.timestamp || log.createdAt,
  }));
}

export async function getOpenBugs(): Promise<number> {
  const bugs = await apiClient.bugs.list({ status: 'Open' });
  return bugs.length;
}

export async function getActiveSprints(): Promise<number> {
  const sprints = await apiClient.sprints.list();
  return sprints.filter(sprint => 
    sprint.status === 'Planning' || sprint.status === 'Active'
  ).length;
}
