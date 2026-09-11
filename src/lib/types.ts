/**
 * Shared TypeScript interfaces for the AI Swarm ALM app.
 *
 * These types model the API document shapes used across
 * components and the api-client module.
 */

// Use Date instead of Firebase Timestamp for migration

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

export type UserRole = 'super_admin' | 'manager' | 'admin' | 'cashier' | 'developer';
export type AccountStatus = 'active' | 'inactive' | 'suspended';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  status: AccountStatus;
  permissions: string[];
  createdAt: Date | unknown;
  updatedAt?: Date | unknown;
  lastLogin?: Date | unknown;
  deletedAt?: Date | unknown | null;
}

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

export interface Agent {
  id: string;
  name?: string;
  emoji?: string;
  role?: string;
  status?: string;
  ownerId?: string;
  skills?: string[];
  // R2-5: model alias + tag list (frontend-typed). Backend whitelist has no
  // dedicated model/tags fields, so these are persisted folded into `skills`.
  model?: string;
  tags?: string[];
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Task
// ---------------------------------------------------------------------------

export type TaskPriority = 'Low' | 'Medium' | 'High' | 'Urgent';
export type TaskStatus = 'To Do' | 'In Progress' | 'Review' | 'Done';

export interface Task {
  id: string;
  title?: string;
  description?: string;
  status?: TaskStatus | string;
  priority?: TaskPriority | string;
  epic?: string;
  assignedAgentId?: string | null;
  ownerId?: string;
  createdBy?: string;
  agents?: string[];
  projectId?: string;
  sprintId?: string | null;
  release?: string | null;
  createdAt?: Date | unknown;
  updatedAt?: Date | unknown;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Bug
// ---------------------------------------------------------------------------

export type BugStatus = 'Open' | 'In Progress' | 'Resolved' | 'Closed';
export type BugPriority = 'Low' | 'Medium' | 'High' | 'Critical';

export interface Bug {
  id: string;
  title?: string;
  description?: string;
  priority?: BugPriority | string;
  status?: BugStatus | string;
  assignedAgentId?: string;
  ownerId?: string;
  projectId?: string;
  sprintId?: string | null;
  release?: string | null;
  createdAt?: Date | unknown;
  updatedAt?: Date | unknown;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Comment (stored as subcollection: bugs/{bugId}/comments)
// ---------------------------------------------------------------------------

export interface BugComment {
  id: string;
  body: string;
  authorId?: string;
  authorName?: string;
  authorEmoji?: string;
  createdAt?: Date | unknown;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Task Comment (stored in task_comments table)
// ---------------------------------------------------------------------------

export interface TaskComment {
  id: string;
  body: string;
  authorId?: string;
  authorName?: string;
  authorEmoji?: string;
  createdAt?: Date | unknown;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Task History
// ---------------------------------------------------------------------------

export interface TaskHistory {
  id: string;
  taskId: string;
  field: string;
  fromValue?: string | null;
  toValue?: string | null;
  changedBy: string;
  createdAt?: Date | unknown;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Bug History
// ---------------------------------------------------------------------------

export interface BugHistory {
  id: string;
  bugId: string;
  field: string;
  fromValue?: string | null;
  toValue?: string | null;
  changedBy: string;
  createdAt?: Date | unknown;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// TestRun
// ---------------------------------------------------------------------------

export type RunStatus = 'Passed' | 'Failed' | 'Skipped' | 'Pending';

export interface TestRun {
  id: string;
  runId?: string;
  group?: string;
  duration?: string;
  status?: RunStatus | string;
  color?: string;
  name?: string;
  agentGroup?: string;
  testType?: string;
  priority?: string;
  description?: string;
  ownerId?: string;
  createdBy?: string;
  projectId?: string;
  createdAt?: Date | unknown;
  updatedAt?: Date | unknown;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Requirement
// ---------------------------------------------------------------------------

export type RequirementStatus = 'Pending' | 'Verified' | string;

export interface Requirement {
  id: string;
  title?: string;
  description?: string;
  status?: RequirementStatus;
  taskId?: string;
  ownerId?: string;
  sprintId?: string | null;
  release?: string | null;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Traceability Links
// ---------------------------------------------------------------------------

export interface RequirementTaskLink {
  id: string;
  requirementId: string;
  taskId: string;
  [key: string]: unknown;
}

export interface RequirementBugLink {
  id: string;
  requirementId: string;
  bugId: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

// Legacy Firebase-era user shape — kept for reference; do not use in new code.
// (Renamed from `User`: duplicate interface names merge and break typing.)
export interface LegacyUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  role?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------

export interface Project {
  id?: string;
  name: string;
  description: string;
  status: 'Active' | 'Archived';
  ownerId: string;
  members?: string[];
  createdAt?: Date | unknown;
  updatedAt?: Date | unknown;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Sprint
// ---------------------------------------------------------------------------

export interface Sprint {
  id?: string;
  name: string;
  projectId: string;
  goal: string;
  status: 'Planning' | 'Active' | 'Completed' | 'Cancelled';
  startDate?: Date | unknown;
  endDate?: Date | unknown;
  createdBy?: string;
  ownerId: string;
  createdAt?: Date | unknown;
  updatedAt?: Date | unknown;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Release
// ---------------------------------------------------------------------------

export interface Release {
  id?: string;
  projectId?: string | null;
  name: string;
  createdAt?: Date | unknown;
  updatedAt?: Date | unknown;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// AuditLog
// ---------------------------------------------------------------------------

export interface AuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  changes?: unknown;
  userId?: string;
  createdAt?: Date | unknown;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Skills (R2-9: skill registry + weighted suggestions)
// ---------------------------------------------------------------------------

export interface SkillSummary {
  name: string;
  agentCount: number;
}

export interface AgentSuggestion {
  agentId: string;
  name: string;
  model: string;
  score: number;
  matchedSkills: string[];
  activeTasks: number;
}

// ---------------------------------------------------------------------------
// AgentSkill
// ---------------------------------------------------------------------------

export interface AgentSkill {
  id: string;
  name: string;
  description?: string;
  category?: string;
  agentId?: string;
  createdAt?: Date | unknown;
  updatedAt?: Date | unknown;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// AgentChat
// ---------------------------------------------------------------------------

export interface AgentChat {
  id: string;
  agentId: string;
  userId: string;
  message: string;
  role: 'user' | 'agent';
  createdAt?: Date | unknown;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Notification (R2-7)
// ---------------------------------------------------------------------------

export type NotificationType = 'info' | 'warning' | 'success' | 'error';

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type?: NotificationType | string;
  actionUrl?: string | null;
  read?: boolean;
  createdAt?: Date | unknown;
  [key: string]: unknown;
}

export interface NotificationsPage {
  notifications: AppNotification[];
  total: number;
  unreadCount: number;
  limit: number;
  offset: number;
}

// ---------------------------------------------------------------------------
// Agent Dispatch (T11 — Agent Dispatch v1)
// ---------------------------------------------------------------------------

export type PmState = 'skipped' | 'pending' | 'notified' | 'failed' | 'stuck' | 'done' | 'cancelled';
export type WakeState = 'pending' | 'sent' | 'failed' | 'stuck' | 'cancelled';

export interface Dispatch {
  pmState: PmState;
  wakeState: WakeState;
  gatewaySessionId?: string | null;
  initiatedBy?: string | null;
  pmNotifiedAt?: string | null;
  pmActedAt?: string | null;
  pmNudges?: number;
  createdAt?: string | null;
  updatedAt?: string | null;
  [key: string]: unknown;
}
