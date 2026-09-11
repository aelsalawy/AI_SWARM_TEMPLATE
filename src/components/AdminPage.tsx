import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { 
  Shield, Users, Database, Activity, 
  RefreshCw, AlertTriangle, CheckCircle2,
  Server, Wifi, HardDrive, ClipboardCheck,
  UserPlus, Trash2, Edit, Mail, Key, User, Undo2,
  Lock, Calendar, ShieldAlert
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../lib/api-client';
import { useProject } from '../lib/ProjectContext';
import ApiKeyManagement from './ApiKeyManagement';
import type { Agent, Task, Bug, Project, User as UserType, Sprint, Release } from '../lib/types';

export default function AdminPage() {
  const { isAuthenticated, user: currentUser } = useAuth();
  const [stats, setStats] = useState({
    agents: 0,
    tasks: 0,
    bugs: 0,
    projects: 0,
    requirements: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [dbStatus, setDbStatus] = useState<'checking' | 'connected' | 'error'>('checking');
  const [users, setUsers] = useState<UserType[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userFilter, setUserFilter] = useState<'active' | 'deleted'>('active');
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [activeSection, setActiveSection] = useState<'overview' | 'users' | 'api-keys' | 'sprints-releases'>('overview');

  useEffect(() => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }

    let mounted = true;

    const loadStats = async () => {
      try {
        const [agents, tasks, bugs, projects, requirements] = await Promise.all([
          apiClient.agents.list(),
          apiClient.tasks.list(),
          apiClient.bugs.list(),
          apiClient.projects.list(),
          apiClient.requirements.list(),
        ]);

        if (!mounted) return;

        setStats({
          agents: agents.length,
          tasks: tasks.length,
          bugs: bugs.length,
          projects: projects.length,
          requirements: requirements.length,
        });
        setDbStatus('connected');
        setError(null);
      } catch (err) {
        if (!mounted) return;
        console.error('Failed to load admin stats:', err);
        setError(err instanceof Error ? err.message : 'Failed to load stats');
        setDbStatus('error');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    const loadUsers = async () => {
      setUsersLoading(true);
      try {
        const usersData = userFilter === 'deleted'
          ? await apiClient.users.list('only')
          : await apiClient.users.list();
        if (!mounted) return;
        setUsers(usersData);
      } catch (err) {
        if (!mounted) return;
        console.error('Failed to load users:', err);
      } finally {
        if (mounted) setUsersLoading(false);
      }
    };

    loadStats();
    loadUsers();
    return () => { mounted = false; };
  }, [isAuthenticated, userFilter]);

  const handleAddUser = async (userData: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    role: string;
  }) => {
    try {
      await apiClient.users.create(userData);
      setShowAddUserModal(false);
      // Reload users
      const usersData = await apiClient.users.list();
      setUsers(usersData);
    } catch (err) {
      console.error('Failed to add user:', err);
      setError(err instanceof Error ? err.message : 'Failed to add user');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user?')) return;
    try {
      await apiClient.users.delete(userId);
      // Reload users
      const usersData = await apiClient.users.list();
      setUsers(usersData);
      setSuccessMessage('User deleted successfully');
      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error('Failed to delete user:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete user');
    }
  };

  const handleRestoreUser = async (userId: string) => {
    if (!confirm('Restore this user? They will need to log in again.')) return;
    try {
      await apiClient.users.restore(userId);
      // Reload users (deleted filter will now exclude the restored user)
      const usersData = userFilter === 'deleted'
        ? await apiClient.users.list('only')
        : await apiClient.users.list();
      setUsers(usersData);
      setSuccessMessage('User restored successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error('Failed to restore user:', err);
      setError(err instanceof Error ? err.message : 'Failed to restore user');
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center p-8">
          <Shield className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">Sign in to access admin panel</p>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="h-full overflow-y-auto"
    >
      <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Admin Panel</h1>
            <p className="text-sm text-slate-500 mt-1">System overview and management</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveSection('overview')}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                activeSection === 'overview'
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-600 hover:bg-slate-50"
              )}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveSection('users')}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                activeSection === 'users'
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-600 hover:bg-slate-50"
              )}
            >
              Users
            </button>
            <button
              onClick={() => setActiveSection('sprints-releases')}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                activeSection === 'sprints-releases'
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-600 hover:bg-slate-50"
              )}
            >
              Sprints &amp; Releases
            </button>
            <button
              onClick={() => setActiveSection('api-keys')}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                activeSection === 'api-keys'
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-600 hover:bg-slate-50"
              )}
            >
              API Keys
            </button>
          </div>
        </div>

        {/* Database status */}
        <div className={cn(
          "p-4 border rounded-xl flex items-center gap-3",
          dbStatus === 'connected' ? 'bg-green-50 border-green-200' :
          dbStatus === 'error' ? 'bg-red-50 border-red-200' :
          'bg-slate-50 border-slate-200'
        )}>
          {dbStatus === 'checking' ? (
            <RefreshCw className="w-5 h-5 text-slate-400 animate-spin" />
          ) : dbStatus === 'connected' ? (
            <CheckCircle2 className="w-5 h-5 text-green-600" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-red-600" />
          )}
          <div>
            <p className="text-sm font-bold text-slate-900">
              Database: {dbStatus === 'connected' ? 'Connected' : dbStatus === 'error' ? 'Error' : 'Checking...'}
            </p>
            <p className="text-xs text-slate-500">
              PostgreSQL via Prisma · Local Auth (JWT)
            </p>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="px-4 py-3 bg-red-50 border border-red-100 rounded-lg flex items-center justify-between">
            <p className="text-xs text-red-600 font-medium">{error}</p>
            <button
              onClick={() => setError(null)}
              className="text-red-400 hover:text-red-600"
            >
              ✕
            </button>
          </div>
        )}

        {/* Success banner */}
        {successMessage && (
          <div className="px-4 py-3 bg-green-50 border border-green-100 rounded-lg flex items-center justify-between">
            <p className="text-xs text-green-600 font-medium">{successMessage}</p>
            <button
              onClick={() => setSuccessMessage(null)}
              className="text-green-400 hover:text-green-600"
            >
              ✕
            </button>
          </div>
        )}

        {/* Overview Section */}
        {activeSection === 'overview' && (
          <>
            {/* Stats grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {[
                { label: 'Agents', value: stats.agents, icon: Users, color: 'bg-green-100 text-green-600' },
                { label: 'Tasks', value: stats.tasks, icon: Activity, color: 'bg-blue-100 text-blue-600' },
                { label: 'Bugs', value: stats.bugs, icon: AlertTriangle, color: 'bg-red-100 text-red-600' },
                { label: 'Projects', value: stats.projects, icon: Server, color: 'bg-purple-100 text-purple-600' },
                { label: 'Requirements', value: stats.requirements, icon: ClipboardCheck, color: 'bg-amber-100 text-amber-600' },
              ].map(stat => (
                <div key={stat.label} className="p-4 border border-slate-100 rounded-xl bg-white">
                  <div className="flex items-center gap-2 mb-2">
                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", stat.color)}>
                      <stat.icon className="w-4 h-4" />
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-slate-900">
                    {loading ? '...' : stat.value}
                  </p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>

            {/* System info */}
            <div className="p-6 border border-slate-100 rounded-xl bg-white">
              <h2 className="text-base font-bold text-slate-900 mb-4">System Information</h2>
              <div className="space-y-3">
                <div className="flex items-center justify-between py-2 border-b border-slate-50">
                  <span className="text-sm text-slate-600">Authentication</span>
                  <span className="text-sm font-bold text-green-600">Local Auth (JWT)</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-slate-50">
                  <span className="text-sm text-slate-600">Database</span>
                  <span className="text-sm font-bold text-slate-900">PostgreSQL</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-slate-50">
                  <span className="text-sm text-slate-600">ORM</span>
                  <span className="text-sm font-bold text-slate-900">Prisma</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-slate-50">
                  <span className="text-sm text-slate-600">API</span>
                  <span className="text-sm font-bold text-slate-900">Express REST</span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-slate-600">Auth Provider</span>
                  <span className="text-sm font-bold text-slate-900">JWT + PostgreSQL</span>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Users Section */}
        {activeSection === 'users' && (
          <>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900">User Management</h2>
                <p className="text-sm text-slate-500 mt-1">Manage system users and permissions</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
                  <button
                    onClick={() => setUserFilter('active')}
                    className={cn(
                      "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                      userFilter === 'active'
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                    )}
                  >
                    Active
                  </button>
                  <button
                    onClick={() => setUserFilter('deleted')}
                    className={cn(
                      "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                      userFilter === 'deleted'
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                    )}
                  >
                    Deleted
                  </button>
                </div>
                <button
                  onClick={() => setShowAddUserModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors"
                >
                  <UserPlus className="w-4 h-4" />
                  Add User
                </button>
              </div>
            </div>

            {/* Users list */}
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-6 py-3 text-xs font-bold text-slate-600 uppercase tracking-wider">User</th>
                    <th className="text-left px-6 py-3 text-xs font-bold text-slate-600 uppercase tracking-wider">Role</th>
                    <th className="text-left px-6 py-3 text-xs font-bold text-slate-600 uppercase tracking-wider">Status</th>
                    <th className="text-left px-6 py-3 text-xs font-bold text-slate-600 uppercase tracking-wider">Last Login</th>
                    <th className="text-right px-6 py-3 text-xs font-bold text-slate-600 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {usersLoading ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center">
                        <div className="flex items-center justify-center">
                          <RefreshCw className="w-5 h-5 text-slate-400 animate-spin" />
                        </div>
                      </td>
                    </tr>
                  ) : users.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-sm text-slate-500">
                        No users found
                      </td>
                    </tr>
                  ) : (
                    users.map((user) => (
                      <tr key={user.id} className={cn(
                        "border-b border-slate-100 last:border-0 hover:bg-slate-50",
                        user.deletedAt && "opacity-60"
                      )}>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center">
                              <User className="w-5 h-5 text-slate-600" />
                            </div>
                            <div>
                              <p className="font-medium text-slate-900">
                                {user.firstName} {user.lastName}
                              </p>
                              <p className="text-sm text-slate-500">{user.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={cn(
                            "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
                            user.role === 'super_admin' ? "bg-purple-100 text-purple-800" :
                            user.role === 'admin' ? "bg-blue-100 text-blue-800" :
                            user.role === 'manager' ? "bg-green-100 text-green-800" :
                            "bg-slate-100 text-slate-800"
                          )}>
                            {user.role.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={cn(
                            "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
                            user.status === 'active' ? "bg-green-100 text-green-800" :
                            user.status === 'inactive' ? "bg-slate-100 text-slate-800" :
                            "bg-red-100 text-red-800"
                          )}>
                            {user.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-500">
                          {user.lastLogin ? new Date(user.lastLogin as any).toLocaleDateString() : 'Never'}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {user.deletedAt ? (
                            <button
                              onClick={() => handleRestoreUser(user.id)}
                              className="p-2 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                              title="Restore user"
                            >
                              <Undo2 className="w-4 h-4" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleDeleteUser(user.id)}
                              disabled={user.id === currentUser?.id}
                              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Delete user"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* API Keys Section */}
        {activeSection === 'api-keys' && (
          <ApiKeyManagement />
        )}

        {/* Sprints & Releases Section */}
        {activeSection === 'sprints-releases' && (
          <SprintsReleasesSection />
        )}

        {/* Add User Modal */}
        {showAddUserModal && (
          <AddUserModal
            isOpen={showAddUserModal}
            onClose={() => setShowAddUserModal(false)}
            onAddUser={handleAddUser}
          />
        )}
      </div>
    </motion.div>
  );
}

function AddUserModal({ isOpen, onClose, onAddUser }: {
  isOpen: boolean;
  onClose: () => void;
  onAddUser: (userData: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    role: string;
  }) => Promise<void>;
}) {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
    role: 'cashier',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      await onAddUser({
        email: formData.email,
        password: formData.password,
        firstName: formData.firstName,
        lastName: formData.lastName,
        role: formData.role,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add user');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md"
      >
        <div className="p-6 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-900">Add New User</h3>
          <p className="text-sm text-slate-500 mt-1">Create a new system user</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">First Name</label>
              <input
                type="text"
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">Last Name</label>
              <input
                type="text"
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">Role</label>
            <select
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="cashier">Cashier</option>
              <option value="developer">Developer</option>
              <option value="admin">Admin</option>
              <option value="manager">Manager</option>
              <option value="super_admin">Super Admin</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">Confirm Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="password"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>
          </div>

          {error && (
            <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              {loading ? 'Adding...' : 'Add User'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function SprintsReleasesSection() {
  const { projects, projectId: currentProjectId } = useProject();
  const [selectedProjectId, setSelectedProjectId] = useState<string>(currentProjectId || '');
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New sprint form
  const [newSprintName, setNewSprintName] = useState('');
  const [newSprintGoal, setNewSprintGoal] = useState('');
  const [newSprintStatus, setNewSprintStatus] = useState<'Planning' | 'Active' | 'Completed' | 'Cancelled'>('Planning');
  const [sprintCreating, setSprintCreating] = useState(false);

  // New release form
  const [newReleaseName, setNewReleaseName] = useState('');
  const [releaseCreating, setReleaseCreating] = useState(false);

  // Sync selected project when context changes
  useEffect(() => {
    if (!selectedProjectId && currentProjectId) {
      setSelectedProjectId(currentProjectId);
    }
  }, [currentProjectId, selectedProjectId]);

  const loadData = async (projectId: string) => {
    setLoading(true);
    setError(null);
    try {
      const [sprintList, releaseList] = await Promise.all([
        apiClient.sprints.list(projectId || undefined),
        apiClient.releases.list(projectId || undefined),
      ]);
      setSprints(sprintList);
      setReleases(releaseList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedProjectId) {
      loadData(selectedProjectId);
    } else {
      setSprints([]);
      setReleases([]);
    }
  }, [selectedProjectId]);

  const handleCreateSprint = async () => {
    if (!selectedProjectId || !newSprintName.trim()) return;
    setSprintCreating(true);
    setError(null);
    try {
      await apiClient.sprints.create({
        name: newSprintName.trim(),
        projectId: selectedProjectId,
        goal: newSprintGoal.trim(),
        status: newSprintStatus,
        ownerId: 'user:web',
      } as any);
      setNewSprintName('');
      setNewSprintGoal('');
      setNewSprintStatus('Planning');
      await loadData(selectedProjectId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create sprint');
    } finally {
      setSprintCreating(false);
    }
  };

  const handleDeleteSprint = async (id: string) => {
    if (!confirm('Delete this sprint?')) return;
    try {
      await apiClient.sprints.delete(id);
      await loadData(selectedProjectId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete sprint');
    }
  };

  const handleCreateRelease = async () => {
    if (!selectedProjectId || !newReleaseName.trim()) return;
    setReleaseCreating(true);
    setError(null);
    try {
      await apiClient.releases.create({
        projectId: selectedProjectId,
        name: newReleaseName.trim(),
      });
      setNewReleaseName('');
      await loadData(selectedProjectId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create release');
    } finally {
      setReleaseCreating(false);
    }
  };

  const handleDeleteRelease = async (id: string) => {
    if (!confirm('Delete this release?')) return;
    try {
      await apiClient.releases.remove(id);
      await loadData(selectedProjectId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete release');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Sprints &amp; Releases</h2>
          <p className="text-sm text-slate-500 mt-1">Manage sprints and release registry per project</p>
        </div>
        <select
          value={selectedProjectId}
          onChange={(e) => setSelectedProjectId(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
        >
          <option value="">Select a project…</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {error && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {!selectedProjectId ? (
        <div className="p-8 text-center text-sm text-slate-500 border border-slate-200 rounded-xl bg-white">
          Select a project to manage its sprints and releases.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Sprints */}
          <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-900">Sprints</h3>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex gap-2">
                <input
                  value={newSprintName}
                  onChange={(e) => setNewSprintName(e.target.value)}
                  placeholder="Sprint name"
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
                <select
                  value={newSprintStatus}
                  onChange={(e) => setNewSprintStatus(e.target.value as any)}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
                >
                  <option value="Planning">Planning</option>
                  <option value="Active">Active</option>
                  <option value="Completed">Completed</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>
              <input
                value={newSprintGoal}
                onChange={(e) => setNewSprintGoal(e.target.value)}
                placeholder="Goal (optional)"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
              <button
                onClick={handleCreateSprint}
                disabled={sprintCreating || !newSprintName.trim()}
                className="w-full px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-bold hover:bg-slate-800 disabled:opacity-50"
              >
                {sprintCreating ? 'Creating…' : 'Add Sprint'}
              </button>

              <div className="space-y-2 pt-2">
                {loading ? (
                  <div className="flex items-center justify-center py-4">
                    <RefreshCw className="w-5 h-5 text-slate-400 animate-spin" />
                  </div>
                ) : sprints.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-4">No sprints yet</p>
                ) : (
                  sprints.map((s) => (
                    <div key={s.id} className="flex items-center justify-between px-3 py-2 border border-slate-100 rounded-lg">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{s.name}</p>
                        <p className="text-xs text-slate-500">{s.status}</p>
                      </div>
                      <button
                        onClick={() => handleDeleteSprint(s.id!)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                        title="Delete sprint"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Releases */}
          <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-900">Releases</h3>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex gap-2">
                <input
                  value={newReleaseName}
                  onChange={(e) => setNewReleaseName(e.target.value)}
                  placeholder="Release name (e.g. R1.2)"
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
                <button
                  onClick={handleCreateRelease}
                  disabled={releaseCreating || !newReleaseName.trim()}
                  className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-bold hover:bg-slate-800 disabled:opacity-50"
                >
                  {releaseCreating ? 'Adding…' : 'Add'}
                </button>
              </div>

              <div className="space-y-2 pt-2">
                {loading ? (
                  <div className="flex items-center justify-center py-4">
                    <RefreshCw className="w-5 h-5 text-slate-400 animate-spin" />
                  </div>
                ) : releases.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-4">No releases yet</p>
                ) : (
                  releases.map((r) => (
                    <div key={r.id} className="flex items-center justify-between px-3 py-2 border border-slate-100 rounded-lg">
                      <p className="text-sm font-medium text-slate-900">{r.name}</p>
                      <button
                        onClick={() => handleDeleteRelease(r.id!)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                        title="Delete release"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}