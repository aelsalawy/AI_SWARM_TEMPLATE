import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Bot, Zap, Wifi, WifiOff, Clock, CheckCircle2, AlertCircle,
  RefreshCw, Plus, Edit2, Trash2, X, Save,
  Gauge, Activity, ShieldCheck, Sparkles, UserCheck, Loader2
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import apiClient from '../lib/api-client';
import { useAuth } from '../contexts/AuthContext';
import type { Agent, Task } from '../lib/types';

export default function AgentView() {
  const { isAuthenticated } = useAuth();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state for add/edit
  const [formData, setFormData] = useState({
    name: '',
    emoji: '',
    role: '',
    status: 'offline',
    model: '',
    skillsInput: '',
    capabilitiesInput: ''
  });

  // R2-5: common model/alias suggestions for the datalist
  const MODEL_ALIASES = [
    'glm-4.7',
    'glm-5.3:cloud',
    'deepseek-v4-pro',
    'nemotron-3-super',
    'minimax-m3',
    'devstral-2:123b-cloud',
  ];

  // R2-5: chip-style tag helpers
  const parseTags = (input: string): string[] =>
    input.split(',').map(t => t.trim()).filter(Boolean);

  const resetForm = () =>
    setFormData({ name: '', emoji: '', role: '', status: 'offline', model: '', skillsInput: '', capabilitiesInput: '' });

  // P2-2: Workload dashboard + auto-assignment state
  const [tasks, setTasks] = useState<Task[]>([]);
  const [autoAssigning, setAutoAssigning] = useState(false);
  const [autoAssignResult, setAutoAssignResult] = useState<string | null>(null);
  const [showAutoAssign, setShowAutoAssign] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');

  // Fetch tasks for auto-assignment
  const fetchTasks = async () => {
    try {
      const list = await apiClient.tasks.list();
      setTasks(list);
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchTasks();
    }
  }, [isAuthenticated]);

  // ---- P2-2: Workload metrics ----
  const workload = useMemo(() => {
    const loaded = agents.filter(a => (a.activeTasks as number) > 0 || a.status === 'busy');
    const idle = agents.filter(a => !((a.activeTasks as number) > 0) && a.status !== 'busy');
    const totalThroughput = agents.reduce((sum, a) => sum + ((a as any).throughput as number || 0), 0);
    const avgCompletion = agents.length > 0
      ? Math.round(agents.reduce((sum, a) => sum + ((a.completionRate as number) || 0), 0) / agents.length * 100)
      : 0;
    const reliable = agents.filter(a => ((a as any).reliability as number || 0) >= 0.9).length;
    return { loaded, idle, totalThroughput, avgCompletion, reliable };
  }, [agents]);

  // Auto-assign: pick least-loaded agent matching required skills
  const runAutoAssign = async () => {
    if (!selectedTaskId) {
      setAutoAssignResult('Please select a task to assign.');
      return;
    }
    setAutoAssigning(true);
    setAutoAssignResult(null);
    try {
      const task = tasks.find(t => t.id === selectedTaskId);
      if (!task) {
        setAutoAssignResult('Task not found.');
        return;
      }
      // Required skills from task (or empty)
      const requiredSkills: string[] = (task as any).skills || [];
      // Candidates: agents whose skills overlap required skills (or all if none required)
      let candidates = agents.filter(a => {
        if (requiredSkills.length === 0) return true;
        const agentSkills: string[] = (a as any).skills || [];
        return requiredSkills.some(s => agentSkills.includes(s));
      });
      if (candidates.length === 0) candidates = agents; // fallback to any agent
      // Sort by least loaded (activeTasks asc, then status idle first)
      candidates.sort((a, b) => {
        const aLoad = (a.activeTasks as number) || 0;
        const bLoad = (b.activeTasks as number) || 0;
        if (aLoad !== bLoad) return aLoad - bLoad;
        const aIdle = a.status === 'idle' || a.status === 'online' ? 0 : 1;
        const bIdle = b.status === 'idle' || b.status === 'online' ? 0 : 1;
        return aIdle - bIdle;
      });
      const chosen = candidates[0];
      if (!chosen) {
        setAutoAssignResult('No agents available to assign.');
        return;
      }
      // Assign the task to the chosen agent
      await apiClient.tasks.update(selectedTaskId, { assignedAgentId: chosen.id });
      // Increment the agent's active task count
      await apiClient.agents.update(chosen.id, {
        activeTasks: ((chosen.activeTasks as number) || 0) + 1,
        status: 'busy',
      });
      setAutoAssignResult(`Assigned "${task.title || task.id}" to ${chosen.emoji || '🤖'} ${chosen.name || chosen.id} (${(chosen.activeTasks as number) || 0} active → ${((chosen.activeTasks as number) || 0) + 1}).`);
      await fetchAgents();
      await fetchTasks();
    } catch (err) {
      console.error('Auto-assign failed:', err);
      setAutoAssignResult('Auto-assignment failed. See console.');
    } finally {
      setAutoAssigning(false);
    }
  };

  const fetchAgents = async () => {
    try {
      setLoading(true);
      setError(null);
      const list = await apiClient.agents.list();
      setAgents(list);
    } catch (err) {
      console.error('Failed to fetch agents:', err);
      setError('Failed to load agents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchAgents();
    } else {
      setLoading(false);
    }
  }, [isAuthenticated]);

  const handleAddAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      // R2-5: fold capabilities into tags, store model alias + skills + capabilities
      // in the backend-accepted `skills` array (backend whitelist has no model/tags field).
      const skills = buildAgentTags();
      await apiClient.agents.create({
        name: formData.name,
        emoji: formData.emoji || '🤖',
        role: formData.role,
        status: 'offline',
        activeTasks: 0,
        completionRate: 0,
        skills,
        model: formData.model || undefined,
        tags: skills
      });
      setShowAddModal(false);
      resetForm();
      await fetchAgents();
    } catch (err) {
      console.error('Failed to add agent:', err);
      alert('Failed to add agent');
    } finally {
      setSaving(false);
    }
  };

  // R2-5: build the tags list persisted to the `skills` field
  // model alias is prefixed (model:<alias>), then skills tags, then capabilities.
  const buildAgentTags = (): string[] => {
    const tags: string[] = [];
    if (formData.model.trim()) tags.push(`model:${formData.model.trim()}`);
    tags.push(...parseTags(formData.skillsInput));
    // capabilities fold INTO tags (no separate field)
    tags.push(...parseTags(formData.capabilitiesInput));
    return [...new Set(tags)];
  };

  const handleEditAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAgent) return;
    setSaving(true);
    try {
      await apiClient.agents.update(editingAgent.id, {
        name: formData.name,
        emoji: formData.emoji || editingAgent.emoji,
        role: formData.role,
        skills: buildAgentTags()
      });
      setEditingAgent(null);
      resetForm();
      await fetchAgents();
    } catch (err) {
      console.error('Failed to update agent:', err);
      alert('Failed to update agent');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAgent = async (id: string, name: string) => {
    if (!confirm(`Delete agent "${name}"? This action cannot be undone.`)) return;
    try {
      await apiClient.agents.delete(id);
      await fetchAgents();
    } catch (err) {
      console.error('Failed to delete agent:', err);
      alert('Failed to delete agent');
    }
  };

  const openEditModal = (agent: Agent) => {
    setEditingAgent(agent);
    // R2-5: unpack persisted tags — model:xxx prefix → model alias, rest → skills/capabilities
    const tags: string[] = Array.isArray((agent as any).skills) ? ((agent as any).skills as string[]) : [];
    const modelTag = tags.find(t => t.startsWith('model:'));
    const restTags = tags.filter(t => !t.startsWith('model:'));
    setFormData({
      name: agent.name || '',
      emoji: agent.emoji || '',
      role: agent.role || '',
      status: agent.status || 'offline',
      model: modelTag ? modelTag.slice('model:'.length) : ((agent as any).model as string) || '',
      skillsInput: restTags.join(', '),
      capabilitiesInput: ''
    });
  };

  const onlineCount = agents.filter(a => a.status === 'online' || a.status === 'busy').length;
  const offlineCount = agents.filter(a => a.status === 'offline').length;

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'online': return <Wifi className="w-4 h-4 text-green-500" />;
      case 'busy': return <Zap className="w-4 h-4 text-amber-500" />;
      case 'idle': return <Clock className="w-4 h-4 text-slate-400" />;
      default: return <WifiOff className="w-4 h-4 text-slate-300" />;
    }
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'online': return 'bg-green-100 text-green-700 border-green-200';
      case 'busy': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'idle': return 'bg-slate-100 text-slate-600 border-slate-200';
      default: return 'bg-slate-50 text-slate-400 border-slate-200';
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Loading Agents...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <AlertCircle className="w-10 h-10 text-red-400" />
          <p className="text-sm text-red-600">{error}</p>
          <button
            onClick={fetchAgents}
            className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-semibold hover:bg-slate-800 transition-all flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6 h-full overflow-y-auto"
    >
      {/* Header Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-panel p-4 rounded-xl flex flex-col">
          <div className="flex justify-between items-start mb-2">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Bot className="w-4 h-4 text-blue-600" />
            </div>
          </div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Total Agents</p>
          <h4 className="font-display text-2xl font-bold text-slate-900">{agents.length}</h4>
        </div>

        <div className="glass-panel p-4 rounded-xl flex flex-col">
          <div className="flex justify-between items-start mb-2">
            <div className="p-2 bg-green-50 rounded-lg">
              <Wifi className="w-4 h-4 text-green-600" />
            </div>
          </div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Online</p>
          <h4 className="font-display text-2xl font-bold text-green-600">{onlineCount}</h4>
        </div>

        <div className="glass-panel p-4 rounded-xl flex flex-col">
          <div className="flex justify-between items-start mb-2">
            <div className="p-2 bg-amber-50 rounded-lg">
              <Zap className="w-4 h-4 text-amber-600" />
            </div>
          </div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Busy</p>
          <h4 className="font-display text-2xl font-bold text-amber-600">
            {agents.filter(a => a.status === 'busy').length}
          </h4>
        </div>

        <div className="glass-panel p-4 rounded-xl flex flex-col">
          <div className="flex justify-between items-start mb-2">
            <div className="p-2 bg-slate-100 rounded-lg">
              <WifiOff className="w-4 h-4 text-slate-500" />
            </div>
          </div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Offline</p>
          <h4 className="font-display text-2xl font-bold text-slate-400">{offlineCount}</h4>
        </div>
      </div>

      {/* P2-2: Workload Dashboard */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-panel p-4 rounded-xl flex flex-col border border-slate-200 bg-white shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <div className="p-2 bg-amber-50 rounded-lg">
              <Gauge className="w-4 h-4 text-amber-600" />
            </div>
          </div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Loaded</p>
          <h4 className="font-display text-2xl font-bold text-amber-600">{workload.loaded.length}</h4>
          <p className="text-[10px] text-slate-400 mt-1">agents with active tasks</p>
        </div>

        <div className="glass-panel p-4 rounded-xl flex flex-col border border-slate-200 bg-white shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <div className="p-2 bg-green-50 rounded-lg">
              <Activity className="w-4 h-4 text-green-600" />
            </div>
          </div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Idle</p>
          <h4 className="font-display text-2xl font-bold text-green-600">{workload.idle.length}</h4>
          <p className="text-[10px] text-slate-400 mt-1">available for work</p>
        </div>

        <div className="glass-panel p-4 rounded-xl flex flex-col border border-slate-200 bg-white shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <div className="p-2 bg-blue-50 rounded-lg">
              <CheckCircle2 className="w-4 h-4 text-blue-600" />
            </div>
          </div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Avg Completion</p>
          <h4 className="font-display text-2xl font-bold text-blue-600">{workload.avgCompletion}%</h4>
          <p className="text-[10px] text-slate-400 mt-1">across all agents</p>
        </div>

        <div className="glass-panel p-4 rounded-xl flex flex-col border border-slate-200 bg-white shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <div className="p-2 bg-indigo-50 rounded-lg">
              <ShieldCheck className="w-4 h-4 text-indigo-600" />
            </div>
          </div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Reliable</p>
          <h4 className="font-display text-2xl font-bold text-indigo-600">{workload.reliable}/{agents.length}</h4>
          <p className="text-[10px] text-slate-400 mt-1">reliability ≥ 90%</p>
        </div>
      </div>

      {/* P2-2: Auto-Assignment Panel */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-600" />
            <h3 className="font-display font-bold text-slate-900">Auto-Assignment</h3>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">least-loaded · skill-matched</span>
          </div>
          <button
            onClick={() => setShowAutoAssign(prev => !prev)}
            className="text-xs font-bold text-purple-600 hover:text-purple-800 transition-colors"
          >
            {showAutoAssign ? 'Hide' : 'Assign Task'}
          </button>
        </div>
        {showAutoAssign && (
          <div className="p-6">
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
              <div className="flex-1 w-full">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Select Task to Assign
                </label>
                <select
                  value={selectedTaskId}
                  onChange={(e) => setSelectedTaskId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                >
                  <option value="">— Choose a task —</option>
                  {tasks
                    .filter(t => t.status !== 'Done')
                    .map(t => (
                      <option key={t.id} value={t.id}>
                        {t.title || t.id} {t.assignedAgentId ? '(assigned)' : '(unassigned)'}
                      </option>
                    ))}
                </select>
              </div>
              <button
                onClick={runAutoAssign}
                disabled={autoAssigning}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-xs font-bold hover:bg-purple-700 transition-all disabled:opacity-50"
              >
                {autoAssigning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserCheck className="w-3.5 h-3.5" />}
                {autoAssigning ? 'Assigning...' : 'Auto-Assign'}
              </button>
            </div>
            {autoAssignResult && (
              <div className="mt-4 px-4 py-3 bg-purple-50 border border-purple-200 rounded-lg text-xs font-medium text-purple-800">
                {autoAssignResult}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Agent List */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <h3 className="font-display font-bold text-slate-900">Agent Swarm</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchAgents}
              className="p-2 hover:bg-slate-200 rounded-lg text-slate-400 transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 transition-all flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Agent
            </button>
          </div>
        </div>

        {agents.length === 0 ? (
          <div className="p-12 text-center">
            <Bot className="w-12 h-12 text-slate-200 mx-auto mb-4" />
            <p className="text-sm text-slate-500 font-medium">No agents configured yet</p>
            <p className="text-xs text-slate-400 mt-1">Click "Add Agent" to create your first agent</p>
          </div>
        ) : (
          <div className="max-h-[500px] overflow-y-auto divide-y divide-slate-100">
            {agents.map((agent) => (
              <div
                key={agent.id}
                className="px-6 py-4 flex items-center gap-4 hover:bg-slate-50 transition-colors group"
              >
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-lg flex-shrink-0">
                  {agent.emoji || '🤖'}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-slate-900 truncate">
                      {agent.name || 'Unnamed Agent'}
                    </h4>
                    <span className={cn(
                      'text-[10px] font-bold px-2 py-0.5 rounded-full border',
                      getStatusColor(agent.status)
                    )}>
                      {agent.status || 'offline'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {agent.role || 'No role assigned'}
                  </p>
                  {/* R2-5: model + skills tags summary */}
                  {(() => {
                    const tags: string[] = Array.isArray((agent as any).skills) ? ((agent as any).skills as string[]) : [];
                    const modelTag = tags.find(t => t.startsWith('model:'));
                    const rest = tags.filter(t => !t.startsWith('model:')).slice(0, 4);
                    return (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {modelTag && (
                          <span className="px-1.5 py-0.5 bg-slate-900 text-white rounded text-[9px] font-mono font-semibold">
                            {modelTag}
                          </span>
                        )}
                        {rest.map(t => (
                          <span key={t} className="px-1.5 py-0.5 bg-slate-50 text-slate-500 border border-slate-200 rounded text-[9px] font-semibold">
                            {t}
                          </span>
                        ))}
                        {tags.length > 4 && (
                          <span className="text-[9px] text-slate-400 font-semibold">+{tags.length - 4}</span>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Stats */}
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  <div className="flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                    <span>{agent.completionRate ? `${Math.round((agent.completionRate as number) * 100)}%` : 'N/A'}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Bot className="w-3.5 h-3.5 text-blue-500" />
                    <span>{(agent.activeTasks as number) || 0} active</span>
                  </div>
                  {/* P2-2: Workload bar */}
                  <div className="hidden md:flex items-center gap-1.5">
                    <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          ((agent.activeTasks as number) || 0) >= 3 ? "bg-red-500" : ((agent.activeTasks as number) || 0) >= 1 ? "bg-amber-500" : "bg-green-500"
                        )}
                        style={{ width: `${Math.min(((agent.activeTasks as number) || 0) * 25, 100)}%` }}
                      />
                    </div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase">
                      {((agent.activeTasks as number) || 0) >= 3 ? 'loaded' : ((agent.activeTasks as number) || 0) >= 1 ? 'busy' : 'idle'}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => openEditModal(agent)}
                    className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
                    title="Edit Agent"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteAgent(agent.id, agent.name)}
                    className="p-1.5 hover:bg-red-100 rounded-lg text-slate-400 hover:text-red-600 transition-colors"
                    title="Delete Agent"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Status Indicator */}
                <div className="flex items-center gap-1.5">
                  {getStatusIcon(agent.status)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Agent Modal */}
      <AnimatePresence>
        {(showAddModal || editingAgent) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => {
                setShowAddModal(false);
                setEditingAgent(null);
                resetForm();
              }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-display font-bold text-lg text-slate-900">
                  {editingAgent ? 'Edit Agent' : 'Add New Agent'}
                </h3>
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingAgent(null);
                    resetForm();
                  }}
                  className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={editingAgent ? handleEditAgent : handleAddAgent} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Agent Name
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., Senior Dev"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Emoji
                  </label>
                  <input
                    type="text"
                    value={formData.emoji}
                    onChange={(e) => setFormData({ ...formData, emoji: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., 🔧"
                    maxLength={2}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Role
                  </label>
                  <input
                    type="text"
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., Senior Backend Developer"
                    required
                  />
                </div>

                {/* R2-5: model/alias selector with datalist suggestions */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Model / Alias
                  </label>
                  <input
                    type="text"
                    list="agent-model-aliases"
                    value={formData.model}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., glm-4.7"
                  />
                  <datalist id="agent-model-aliases">
                    {MODEL_ALIASES.map(alias => (
                      <option key={alias} value={alias}>{alias}</option>
                    ))}
                  </datalist>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {MODEL_ALIASES.map(alias => (
                      <button
                        key={alias}
                        type="button"
                        onClick={() => setFormData({ ...formData, model: alias })}
                        className={cn(
                          'px-2 py-1 rounded-full border text-[10px] font-bold transition-colors',
                          formData.model === alias
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-slate-500 border-slate-200 hover:border-blue-400 hover:text-blue-600'
                        )}
                      >
                        {alias}
                      </button>
                    ))}
                  </div>
                </div>

                {/* R2-5: skills tags input (comma-separated chip input) */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Skills Tags
                  </label>
                  <input
                    type="text"
                    value={formData.skillsInput}
                    onChange={(e) => setFormData({ ...formData, skillsInput: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., TypeScript, React, Node"
                  />
                  {parseTags(formData.skillsInput).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {parseTags(formData.skillsInput).map(tag => (
                        <span key={tag} className="px-2 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-[10px] font-bold">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* R2-5: capabilities — folded into tags (no separate field) */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Capabilities <span className="text-slate-400 normal-case font-medium">(folded into tags)</span>
                  </label>
                  <input
                    type="text"
                    value={formData.capabilitiesInput}
                    onChange={(e) => setFormData({ ...formData, capabilitiesInput: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., code-review, deploy, monitoring"
                  />
                  {parseTags(formData.capabilitiesInput).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {parseTags(formData.capabilitiesInput).map(tag => (
                        <span key={tag} className="px-2 py-1 bg-violet-50 text-violet-700 border border-violet-200 rounded-full text-[10px] font-bold">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddModal(false);
                      setEditingAgent(null);
                      resetForm();
                    }}
                    className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-semibold hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {saving ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        {editingAgent ? 'Update Agent' : 'Create Agent'}
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}