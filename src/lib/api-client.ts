/**
 * API Client — REST API wrapper for PostgreSQL backend
 * Replaces Firestore SDK calls with HTTP requests to Express server
 */

import type { Task, Agent, Bug, BugComment, TaskComment, TaskHistory, BugHistory, Project, Sprint, Release, TestRun, Requirement, AuditLog, AgentSkill, AgentChat, User, AppNotification, NotificationsPage, SkillSummary, AgentSuggestion, Dispatch } from './types';

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3001') + '/api';

// Token management
const getAccessToken = async (): Promise<string | null> => {
  return localStorage.getItem('accessToken');
};

const getRefreshToken = (): string | null => {
  return localStorage.getItem('refreshToken');
};

const setTokens = (accessToken: string, refreshToken: string) => {
  localStorage.setItem('accessToken', accessToken);
  localStorage.setItem('refreshToken', refreshToken);
};

const clearTokens = () => {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
};

// Token refresh helper using local auth endpoint
const refreshAccessToken = async (): Promise<string> => {
  if (typeof window === 'undefined') {
    throw new Error('Cannot refresh token on server');
  }
  
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    throw new Error('No refresh token available');
  }
  
  try {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      throw new Error('Failed to refresh token');
    }

    const data = await response.json();
    localStorage.setItem('accessToken', data.accessToken);
    return data.accessToken;
  } catch (error) {
    throw new Error('Failed to refresh token: ' + (error instanceof Error ? error.message : String(error)));
  }
};

// Authenticated fetch wrapper with auto-refresh
const apiFetch = async (path: string, options: RequestInit = {}): Promise<Response> => {
  let accessToken = await getAccessToken();
  
  // If no token and not an auth endpoint, throw error instead of redirecting
  // to avoid infinite loops when Firebase Auth state is still initializing
  if (!accessToken && !path.startsWith('/auth/')) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {}),
      ...options.headers,
    },
  });

  // Handle 401 Unauthorized - try to refresh token and retry once
  if (response.status === 401) {
    try {
      const newAccessToken = await refreshAccessToken();
      
      return await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${newAccessToken}`,
          ...options.headers,
        },
      });
    } catch (refreshError) {
      // Refresh failed - clear tokens
      clearTokens();
      throw new Error('Session expired. Please login again.');
    }
  }

  return response;
};

const apiJson = async <T = any>(path: string, options: RequestInit = {}): Promise<T> => {
  const response = await apiFetch(path, options);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(errorData.message || `API Error ${response.status}`);
  }
  return response.json();
};

// Auth API
const AuthAPI = {
  login: async (email: string, password: string): Promise<{
    accessToken: string;
    refreshToken: string;
    user: any;
  }> => {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Login failed' }));
      throw new Error(errorData.message || 'Login failed');
    }

    const data = await response.json();
    setTokens(data.accessToken, data.refreshToken);
    return data;
  },

  logout: async (): Promise<void> => {
    try {
      const refreshToken = getRefreshToken();
      if (refreshToken) {
        // Use AbortController to timeout after 5 seconds
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        try {
          await fetch(`${API_BASE}/auth/logout`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ refreshToken }),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeoutId);
        }
      }
    } catch (error) {
      console.error('Logout API call failed:', error);
    }
    clearTokens();
  },

  refreshToken: refreshAccessToken,

  getCurrentUser: async (): Promise<any> => {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      return null;
    }

    try {
      const response = await fetch(`${API_BASE}/auth/me`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        return null;
      }

      const user = await response.json();
      // Store user data in localStorage for offline access
      localStorage.setItem('user', JSON.stringify(user));
      return user;
    } catch (error) {
      console.error('Failed to get current user:', error);
      // Fallback to localStorage
      const userData = localStorage.getItem('user');
      if (!userData) {
        return null;
      }
      return JSON.parse(userData);
    }
  },
};

// Tasks API
const TasksAPI = {
  list: async (filters: {
    status?: string;
    assignedAgentId?: string;
    epic?: string;
    projectId?: string;
    priority?: string;
    sprintId?: string;
    release?: string;
    search?: string;
  } = {}): Promise<Task[]> => {
    const query = new URLSearchParams();
    if (filters.status) query.append('status', filters.status);
    if (filters.assignedAgentId) query.append('assignedAgentId', filters.assignedAgentId);
    if (filters.epic) query.append('epic', filters.epic);
    if (filters.projectId) query.append('projectId', filters.projectId);
    if (filters.priority) query.append('priority', filters.priority);
    if (filters.sprintId) query.append('sprintId', filters.sprintId);
    if (filters.release) query.append('release', filters.release);
    if (filters.search) query.append('search', filters.search);

    return apiJson(`/tasks${query.size ? '?' + query.toString() : ''}`);
  },

  get: async (id: string): Promise<Task> => {
    return apiJson(`/tasks/${id}`);
  },

  create: async (taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<Task> => {
    return apiJson('/tasks', {
      method: 'POST',
      body: JSON.stringify(taskData),
    });
  },

  update: async (id: string, updates: Partial<Task>): Promise<Task> => {
    return apiJson(`/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  delete: async (id: string): Promise<void> => {
    const response = await apiFetch(`/tasks/${id}`, { method: 'DELETE' });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(errorData.message || `API Error ${response.status}`);
    }
  },

  claim: async (id: string): Promise<Task> => {
    return apiJson(`/tasks/${id}/claim`, { method: 'POST' });
  },

  release: async (id: string): Promise<Task> => {
    return apiJson(`/tasks/${id}/release`, { method: 'POST' });
  },

  getComments: async (taskId: string): Promise<TaskComment[]> => {
    return apiJson(`/tasks/${taskId}/comments`);
  },

  addComment: async (taskId: string, comment: { text: string; authorId: string; authorName: string; authorEmoji?: string }): Promise<TaskComment> => {
    return apiJson(`/tasks/${taskId}/comments`, {
      method: 'POST',
      body: JSON.stringify(comment),
    });
  },

  getHistory: async (taskId: string): Promise<TaskHistory[]> => {
    return apiJson(`/tasks/${taskId}/history`);
  },

  getRequirements: async (taskId: string): Promise<Requirement[]> => {
    return apiJson(`/tasks/${taskId}/requirements`);
  },

  // T11: dispatch state (Agent Dispatch v1) — task 7 endpoint
  // T13 review fix (2026-09-09): GET /tasks/:id/dispatch returns the BARE AgentDispatch
  // row (dispatch-views.ts res.json(row)), not a { dispatch } envelope. Wrap it here so
  // DispatchChip's contract holds. 404 (no row) throws → caller degrades to hidden chip.
  getDispatch: async (taskId: string): Promise<{ dispatch: Dispatch | null }> => {
    const row = await apiJson<Dispatch>(`/tasks/${taskId}/dispatch`);
    return { dispatch: row && row.pmState ? row : null };
  },
};

// Agents API
const AgentsAPI = {
  list: async (statusFilter?: string): Promise<Agent[]> => {
    const query = statusFilter ? `?status=${statusFilter}` : '';
    return apiJson(`/agents${query}`);
  },

  // R2-6: agent liveness report (live/stale/offline per agent, 15min threshold)
  liveness: async (): Promise<{ thresholdMs: number; generatedAt: string; agents: Array<{ id: string; liveness: 'live' | 'stale' | 'offline'; lastSeenAt: string | null }> }> => {
    return apiJson('/agents/liveness');
  },

  get: async (id: string): Promise<Agent> => {
    return apiJson(`/agents/${id}`);
  },

  create: async (agentData: Omit<Agent, 'id' | 'createdAt' | 'updatedAt'>): Promise<Agent> => {
    return apiJson('/agents', {
      method: 'POST',
      body: JSON.stringify(agentData),
    });
  },

  update: async (id: string, updates: Partial<Agent>): Promise<Agent> => {
    return apiJson(`/agents/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  delete: async (id: string): Promise<void> => {
    const response = await apiFetch(`/agents/${id}`, { method: 'DELETE' });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(errorData.message || `API Error ${response.status}`);
    }
  },

  chats: async (agentId: string): Promise<AgentChat[]> => {
    return apiJson(`/agents/${agentId}/chats`);
  },

  sendChat: async (agentId: string, message: string): Promise<AgentChat> => {
    return apiJson(`/agents/${agentId}/chats`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
  },
};

// Bugs API
const BugsAPI = {
  list: async (filters: {
    status?: string;
    priority?: string;
    assignedAgentId?: string;
    projectId?: string;
    ownerId?: string;
    sprintId?: string;
    release?: string;
    search?: string;
  } = {}): Promise<Bug[]> => {
    const query = new URLSearchParams();
    if (filters.status) query.append('status', filters.status);
    if (filters.priority) query.append('priority', filters.priority);
    if (filters.assignedAgentId) query.append('assignedAgentId', filters.assignedAgentId);
    if (filters.projectId) query.append('projectId', filters.projectId);
    if (filters.ownerId) query.append('ownerId', filters.ownerId);
    if (filters.sprintId) query.append('sprintId', filters.sprintId);
    if (filters.release) query.append('release', filters.release);
    if (filters.search) query.append('search', filters.search);

    return apiJson(`/bugs${query.size ? '?' + query.toString() : ''}`);
  },

  get: async (id: string): Promise<Bug> => {
    return apiJson(`/bugs/${id}`);
  },

  create: async (bugData: Omit<Bug, 'id' | 'createdAt' | 'updatedAt'>): Promise<Bug> => {
    return apiJson('/bugs', {
      method: 'POST',
      body: JSON.stringify(bugData),
    });
  },

  update: async (id: string, updates: Partial<Bug>): Promise<Bug> => {
    return apiJson(`/bugs/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  delete: async (id: string): Promise<void> => {
    const response = await apiFetch(`/bugs/${id}`, { method: 'DELETE' });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(errorData.message || `API Error ${response.status}`);
    }
  },

  getComments: async (bugId: string): Promise<BugComment[]> => {
    return apiJson(`/bugs/${bugId}/comments`);
  },

  addComment: async (bugId: string, comment: { text: string; authorId: string; authorName: string; authorEmoji?: string }): Promise<BugComment> => {
    return apiJson(`/bugs/${bugId}/comments`, {
      method: 'POST',
      body: JSON.stringify(comment),
    });
  },

  addAttachment: async (bugId: string, attachment: { data: string; filename: string; mimeType: string; uploadedBy: string }): Promise<any> => {
    return apiJson(`/bugs/${bugId}/attachments`, {
      method: 'POST',
      body: JSON.stringify(attachment),
    });
  },

  getAttachments: async (bugId: string): Promise<any[]> => {
    return apiJson(`/bugs/${bugId}/attachments`);
  },

  deleteAttachment: async (bugId: string, attachmentId: string): Promise<void> => {
    const response = await apiFetch(`/bugs/${bugId}/attachments/${attachmentId}`, { method: 'DELETE' });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(errorData.message || `API Error ${response.status}`);
    }
  },

  getHistory: async (bugId: string): Promise<BugHistory[]> => {
    return apiJson(`/bugs/${bugId}/history`);
  },

  getRequirements: async (bugId: string): Promise<Requirement[]> => {
    return apiJson(`/bugs/${bugId}/requirements`);
  },

  // T11: dispatch state (Agent Dispatch v1) — task 7 endpoint
  // Same bare-row adapter as TasksAPI.getDispatch (T13 review fix).
  getDispatch: async (bugId: string): Promise<{ dispatch: Dispatch | null }> => {
    const row = await apiJson<Dispatch>(`/bugs/${bugId}/dispatch`);
    return { dispatch: row && row.pmState ? row : null };
  },
};

// Projects API
const ProjectsAPI = {
  list: async (): Promise<Project[]> => {
    return apiJson('/projects');
  },

  get: async (id: string): Promise<Project> => {
    return apiJson(`/projects/${id}`);
  },

  create: async (projectData: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<Project> => {
    return apiJson('/projects', {
      method: 'POST',
      body: JSON.stringify(projectData),
    });
  },

  update: async (id: string, updates: Partial<Project>): Promise<Project> => {
    return apiJson(`/projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  delete: async (id: string): Promise<void> => {
    const response = await apiFetch(`/projects/${id}`, { method: 'DELETE' });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(errorData.message || `API Error ${response.status}`);
    }
  },
};

// Sprints API
const SprintsAPI = {
  list: async (projectId?: string): Promise<Sprint[]> => {
    const query = projectId ? `?projectId=${projectId}` : '';
    return apiJson(`/sprints${query}`);
  },

  get: async (id: string): Promise<Sprint> => {
    return apiJson(`/sprints/${id}`);
  },

  create: async (sprintData: Omit<Sprint, 'id' | 'createdAt' | 'updatedAt'>): Promise<Sprint> => {
    return apiJson('/sprints', {
      method: 'POST',
      body: JSON.stringify(sprintData),
    });
  },

  update: async (id: string, updates: Partial<Sprint>): Promise<Sprint> => {
    return apiJson(`/sprints/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  delete: async (id: string): Promise<void> => {
    const response = await apiFetch(`/sprints/${id}`, { method: 'DELETE' });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(errorData.message || `API Error ${response.status}`);
    }
  },
};

// Releases API
const ReleasesAPI = {
  list: async (projectId?: string): Promise<Release[]> => {
    const query = projectId ? `?projectId=${projectId}` : '';
    return apiJson(`/releases${query}`);
  },

  create: async (data: { projectId?: string | null; name: string }): Promise<Release> => {
    return apiJson('/releases', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  remove: async (id: string): Promise<void> => {
    const response = await apiFetch(`/releases/${id}`, { method: 'DELETE' });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(errorData.message || `API Error ${response.status}`);
    }
  },
};

// Test Runs API
const TestRunsAPI = {
  list: async (): Promise<TestRun[]> => {
    return apiJson('/test-runs');
  },

  get: async (id: string): Promise<TestRun> => {
    return apiJson(`/test-runs/${id}`);
  },

  create: async (testRunData: Omit<TestRun, 'id' | 'createdAt' | 'updatedAt'>): Promise<TestRun> => {
    return apiJson('/test-runs', {
      method: 'POST',
      body: JSON.stringify(testRunData),
    });
  },

  update: async (id: string, updates: Partial<TestRun>): Promise<TestRun> => {
    return apiJson(`/test-runs/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  delete: async (id: string): Promise<void> => {
    const response = await apiFetch(`/test-runs/${id}`, { method: 'DELETE' });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(errorData.message || `API Error ${response.status}`);
    }
  },
};

// Requirements API
const RequirementsAPI = {
  list: async (filters?: { taskId?: string; projectId?: string; status?: string; ownerId?: string; sprintId?: string; release?: string }): Promise<Requirement[]> => {
    const params = new URLSearchParams();
    if (filters?.taskId) params.append('taskId', filters.taskId);
    if (filters?.projectId) params.append('projectId', filters.projectId);
    if (filters?.status) params.append('status', filters.status);
    if (filters?.ownerId) params.append('ownerId', filters.ownerId);
    if (filters?.sprintId) params.append('sprintId', filters.sprintId);
    if (filters?.release) params.append('release', filters.release);
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiJson(`/requirements${query}`);
  },

  get: async (id: string): Promise<Requirement> => {
    return apiJson(`/requirements/${id}`);
  },

  create: async (requirementData: Omit<Requirement, 'id' | 'createdAt' | 'updatedAt'>): Promise<Requirement> => {
    return apiJson('/requirements', {
      method: 'POST',
      body: JSON.stringify(requirementData),
    });
  },

  update: async (id: string, updates: Partial<Requirement>): Promise<Requirement> => {
    return apiJson(`/requirements/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  delete: async (id: string): Promise<void> => {
    const response = await apiFetch(`/requirements/${id}`, { method: 'DELETE' });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(errorData.message || `API Error ${response.status}`);
    }
  },

  getTasks: async (requirementId: string): Promise<Task[]> => {
    return apiJson(`/requirements/${requirementId}/tasks`);
  },

  linkTask: async (requirementId: string, taskId: string): Promise<any> => {
    return apiJson(`/requirements/${requirementId}/tasks`, {
      method: 'POST',
      body: JSON.stringify({ taskId }),
    });
  },

  unlinkTask: async (requirementId: string, taskId: string): Promise<void> => {
    const response = await apiFetch(`/requirements/${requirementId}/tasks/${taskId}`, { method: 'DELETE' });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(errorData.message || `API Error ${response.status}`);
    }
  },

  getBugs: async (requirementId: string): Promise<Bug[]> => {
    return apiJson(`/requirements/${requirementId}/bugs`);
  },

  linkBug: async (requirementId: string, bugId: string): Promise<any> => {
    return apiJson(`/requirements/${requirementId}/bugs`, {
      method: 'POST',
      body: JSON.stringify({ bugId }),
    });
  },

  unlinkBug: async (requirementId: string, bugId: string): Promise<void> => {
    const response = await apiFetch(`/requirements/${requirementId}/bugs/${bugId}`, { method: 'DELETE' });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(errorData.message || `API Error ${response.status}`);
    }
  },
};

// Audit Log API
const AuditLogAPI = {
  list: async (entityType?: string, entityId?: string): Promise<AuditLog[]> => {
    const query = new URLSearchParams();
    if (entityType) query.append('entityType', entityType);
    if (entityId) query.append('entityId', entityId);

    return apiJson(`/audit${query.size ? '?' + query.toString() : ''}`);
  },
};

// Skills API — R2-9: skill-registry aggregate + weighted agent suggestions
const SkillsAPI = {
  list: async (): Promise<SkillSummary[]> => {
    return apiJson('/skills');
  },

  suggest: async (skills: string[], includeAll?: boolean): Promise<AgentSuggestion[]> => {
    return apiJson('/skills/suggest', {
      method: 'POST',
      body: JSON.stringify({ skills, includeAll: includeAll ?? false }),
    });
  },
};

// Agent Trigger API
const AgentTriggerAPI = {
  listAgents: async (): Promise<any[]> => {
    return apiJson('/agent-trigger/agents');
  },

  triggerAgent: async (params: {
    agentId: string;
    taskType: 'task' | 'bug' | 'requirement';
    itemId: string;
    title?: string;
    description?: string;
    priority?: string;
  }): Promise<any> => {
    return apiJson('/agent-trigger/trigger', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },
};

// Users API
const UsersAPI = {
  list: async (deletedAt?: 'only' | 'all'): Promise<User[]> => {
    const query = deletedAt ? `?deletedAt=${deletedAt}` : '';
    return apiJson(`/users${query}`);
  },

  get: async (id: string): Promise<User> => {
    return apiJson(`/users/${id}`);
  },

  restore: async (id: string): Promise<User> => {
    return apiJson(`/users/${id}/restore`, { method: 'POST' });
  },

  create: async (userData: {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
    role?: string;
    permissions?: string[];
  }): Promise<User> => {
    return apiJson('/users', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  },

  update: async (id: string, updates: Partial<User>): Promise<User> => {
    return apiJson(`/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  delete: async (id: string): Promise<void> => {
    const response = await apiFetch(`/users/${id}`, { method: 'DELETE' });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(errorData.message || `API Error ${response.status}`);
    }
  },
};

// Agent Chats API
const AgentChatsAPI = {
  list: async (agentId: string, limit?: number): Promise<AgentChat[]> => {
    const query = limit ? `?limit=${limit}` : '';
    return apiJson(`/agents/${agentId}/chats${query}`);
  },

  send: async (agentId: string, message: string): Promise<AgentChat> => {
    return apiJson(`/agents/${agentId}/chats`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
  },
};

// API Keys API (P3-4)
interface ApiKeySummary {
  id: string;
  name: string;
  prefix: string;
  masked: string;
  createdAt: string;
  lastUsedAt?: string | null;
  revoked: boolean;
  revokedAt?: string | null;
  createdBy: string;
  key?: string; // full secret, only present in create response
}

const ApiKeysAPI = {
  list: async (): Promise<ApiKeySummary[]> => apiJson('/api-keys'),
  create: async (name: string): Promise<ApiKeySummary> =>
    apiJson('/api-keys', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  revoke: async (id: string): Promise<ApiKeySummary> =>
    apiJson(`/api-keys/${id}/revoke`, { method: 'POST' }),
  delete: async (id: string): Promise<void> => {
    const response = await apiFetch(`/api-keys/${id}`, { method: 'DELETE' });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(errorData.message || `API Error ${response.status}`);
    }
  },
};

// Notifications API (R2-7)
const NotificationsAPI = {
  // List current user's notifications. unread=true → unread only.
  list: async (params: { unread?: boolean; limit?: number; offset?: number } = {}): Promise<NotificationsPage> => {
    const query = new URLSearchParams();
    if (params.unread) query.append('unread', 'true');
    if (params.limit) query.append('limit', String(params.limit));
    if (params.offset) query.append('offset', String(params.offset));
    const qs = query.toString();
    return apiJson(`/notifications${qs ? '?' + qs : ''}`);
  },

  // Mark a single notification as read (owner only).
  markRead: async (id: string): Promise<AppNotification> => {
    return apiJson(`/notifications/${id}`, { method: 'PATCH' });
  },

  // Mark ALL of the current user's notifications as read.
  markAllRead: async (): Promise<{ updated: number }> => {
    return apiJson('/notifications/read-all', { method: 'PATCH' });
  },

  // Delete a single notification (owner only).
  remove: async (id: string): Promise<void> => {
    const response = await apiFetch(`/notifications/${id}`, { method: 'DELETE' });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(errorData.message || `API Error ${response.status}`);
    }
  },
};

// Export all APIs
export const apiClient = {
  auth: AuthAPI,
  users: UsersAPI,
  tasks: TasksAPI,
  agents: AgentsAPI,
  bugs: BugsAPI,
  projects: ProjectsAPI,
  sprints: SprintsAPI,
  releases: ReleasesAPI,
  testRuns: TestRunsAPI,
  requirements: RequirementsAPI,
  auditLogs: AuditLogAPI,
  skills: SkillsAPI,
  agentTrigger: AgentTriggerAPI,
  agentChats: AgentChatsAPI,
  apiKeys: ApiKeysAPI,
  notifications: NotificationsAPI,
};

export default apiClient;
