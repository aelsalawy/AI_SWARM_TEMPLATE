import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Bot, Zap, Wifi, WifiOff, Clock, CheckCircle2, AlertCircle, RefreshCw, PanelRight, PanelRightClose, LayoutGrid, List, Edit2, Save, X, Loader2, MessageSquare } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import apiClient from '../lib/api-client';
import { useAuth } from '../contexts/AuthContext';
import type { Agent } from '../lib/types';
import DetailPanel, { type DetailItem } from './DetailPanel';
import ChatPanel from './ChatPanel';

// Extend Agent type to include task count
interface AgentWithTaskCount extends Agent {
  taskCount?: number;
  lastActivity?: string;
  liveness?: 'live' | 'stale' | 'offline';
}

export default function AgentCardsView() {
  const { isAuthenticated } = useAuth();
  const [agents, setAgents] = useState<AgentWithTaskCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');
  const [selectedAgent, setSelectedAgent] = useState<AgentWithTaskCount | null>(null);
  const [showDetailPanel, setShowDetailPanel] = useState(false);
  const [chatAgent, setChatAgent] = useState<AgentWithTaskCount | null>(null);
  const [showChatPanel, setShowChatPanel] = useState(false);

  const fetchAgents = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Fetch agents
      const [agentList, livenessReport] = await Promise.all([
        apiClient.agents.list(),
        apiClient.agents.liveness().catch(() => null),
      ]);
      const livenessMap = new Map<string, 'live' | 'stale' | 'offline' | undefined>();
      livenessReport?.agents?.forEach((a) => livenessMap.set(a.id, a.liveness));
      
      // Fetch task counts for each agent
      const agentsWithCounts = await Promise.all(
        agentList.map(async (agent) => {
          try {
            // Get task count for this agent
            const tasks = await apiClient.tasks.list({ assignedAgentId: agent.id });
            const taskCount = tasks.length;
            
            // Get last activity (most recent task update)
            let lastActivity = 'Never';
            if (taskCount > 0) {
              const recentTasks = tasks.sort((a, b) => 
                new Date(b.updatedAt || b.createdAt || 0).getTime() - 
                new Date(a.updatedAt || a.createdAt || 0).getTime()
              );
              const lastTask = recentTasks[0];
              lastActivity = lastTask.updatedAt 
                ? new Date(lastTask.updatedAt).toLocaleString()
                : new Date(lastTask.createdAt || 0).toLocaleString();
            }
            
            return {
              ...agent,
              taskCount,
              lastActivity,
              liveness: livenessMap.get(agent.id),
            };
          } catch (err) {
            console.error(`Failed to fetch tasks for agent ${agent.id}:`, err);
            return {
              ...agent,
              taskCount: 0,
              lastActivity: 'Unknown',
              liveness: livenessMap.get(agent.id),
            };
          }
        })
      );
      
      // Sort agents: Active first, then by name
      const sortedAgents = [...agentsWithCounts].sort((a, b) => {
        // Active statuses come first
        const aActive = a.status === 'online' || a.status === 'busy';
        const bActive = b.status === 'online' || b.status === 'busy';
        
        if (aActive && !bActive) return -1;
        if (!aActive && bActive) return 1;
        
        // Then sort by name
        return (a.name || '').localeCompare(b.name || '');
      });
      
      setAgents(sortedAgents);
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

  // R2-6: liveness status dot (green=live, amber=stale, grey=offline)
  const livenessDot = (agent: AgentWithTaskCount) => {
    const map = {
      live: { bg: 'bg-green-500', title: 'Live', ringColor: 'ring-green-300' },
      stale: { bg: 'bg-amber-400', title: 'Stale (no heartbeat >15min)', ringColor: 'ring-amber-200' },
      offline: { bg: 'bg-slate-300', title: 'Offline (no heartbeat)', ringColor: 'ring-slate-200' },
    };
    const cfg = map[agent.liveness || 'offline'];
    return (
      <span
        title={cfg.title}
        className={cn('inline-block w-2.5 h-2.5 rounded-full ring-2', cfg.bg, cfg.ringColor)}
      />
    );
  };

  const handleAgentClick = (agent: AgentWithTaskCount) => {
    setSelectedAgent(agent);
    setShowDetailPanel(true);
  };

  const handleChatClick = (e: React.MouseEvent, agent: AgentWithTaskCount) => {
    e.stopPropagation(); // Don't trigger card click
    setChatAgent(agent);
    setShowChatPanel(true);
  };

  const onlineCount = agents.filter(a => a.status === 'online' || a.status === 'busy').length;
  const offlineCount = agents.filter(a => a.status === 'offline').length;
  const idleCount = agents.filter(a => a.status === 'idle').length;

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

      {/* Agent Cards Grid */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <h3 className="font-display font-bold text-slate-900">Agent Swarm</h3>
          <div className="flex items-center gap-2">
            {/* View Mode Toggle */}
            <div className="flex items-center bg-slate-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode('cards')}
                className={cn(
                  'p-1.5 rounded-md transition-all',
                  viewMode === 'cards' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'
                )}
                title="Card View"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={cn(
                  'p-1.5 rounded-md transition-all',
                  viewMode === 'list' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'
                )}
                title="List View"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
            
            <button
              onClick={fetchAgents}
              className="p-2 hover:bg-slate-200 rounded-lg text-slate-400 transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            
            {/* Detail Panel Toggle */}
            <button
              onClick={() => setShowDetailPanel(!showDetailPanel)}
              className={cn(
                'p-2 rounded-lg transition-colors',
                showDetailPanel ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              )}
              title={showDetailPanel ? 'Hide Detail Panel' : 'Show Detail Panel'}
            >
              {showDetailPanel ? <PanelRightClose className="w-4 h-4" /> : <PanelRight className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {agents.length === 0 ? (
          <div className="p-12 text-center">
            <Bot className="w-12 h-12 text-slate-200 mx-auto mb-4" />
            <p className="text-sm text-slate-500 font-medium">No agents configured yet</p>
            <p className="text-xs text-slate-400 mt-1">Agents will appear here once they connect to the swarm</p>
          </div>
        ) : viewMode === 'cards' ? (
          <div className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {agents.map((agent) => (
                <div
                  key={agent.id}
                  className="bg-white border border-slate-100 rounded-xl p-5 hover:shadow-md transition-all cursor-pointer"
                  onClick={() => handleAgentClick(agent)}
                >
                  {/* Header with emoji and status */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-xl">
                        {agent.emoji || '🤖'}
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 truncate max-w-[150px]">
                          {agent.name || 'Unnamed Agent'}
                        </h4>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={cn(
                            'text-[10px] font-bold px-2 py-0.5 rounded-full border',
                            getStatusColor(agent.status)
                          )}>
                            {agent.status || 'offline'}
                          </span>
                          {getStatusIcon(agent.status)}
                          {livenessDot(agent)}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={(e) => handleChatClick(e, agent)}
                      className="p-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                      title={`Chat with ${agent.name || 'agent'}`}
                    >
                      <MessageSquare className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Agent Details */}
                  <div className="space-y-3 text-xs">
                    <div className="flex items-center gap-2 text-slate-500">
                      <Bot className="w-3.5 h-3.5 text-blue-500" />
                      <span className="font-medium text-slate-600">Model:</span>
                      <span>{agent.role || 'General Purpose'}</span>
                    </div>

                    <div className="flex items-center gap-2 text-slate-500">
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                      <span className="font-medium text-slate-600">Tasks:</span>
                      <span className="font-bold text-slate-900">{agent.taskCount || 0}</span>
                    </div>

                    <div className="flex items-center gap-2 text-slate-500">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span className="font-medium text-slate-600">Last Activity:</span>
                      <span className="truncate max-w-[120px]">{agent.lastActivity || 'Never'}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {agents.map((agent) => (
              <div
                key={agent.id}
                className="px-6 py-4 flex items-center gap-4 hover:bg-slate-50 transition-colors cursor-pointer"
                onClick={() => handleAgentClick(agent)}
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
                </div>

                {/* Stats */}
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  <div className="flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                    <span>{agent.taskCount || 0} tasks</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span className="truncate max-w-[80px]">{agent.lastActivity || 'Never'}</span>
                  </div>
                </div>

                {/* Status Indicator */}
                <div className="flex items-center gap-1.5">
                  {getStatusIcon(agent.status)}
                  {livenessDot(agent)}
                </div>

                {/* Chat Button */}
                <button
                  onClick={(e) => handleChatClick(e, agent)}
                  className="p-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                  title={`Chat with ${agent.name || 'agent'}`}
                >
                  <MessageSquare className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Detail Panel */}
      {showDetailPanel && selectedAgent && (
        <div className="w-96 flex-shrink-0 border-l border-slate-200 bg-white overflow-hidden h-full">
          <AgentDetailPanel
            agent={selectedAgent}
            onClose={() => setSelectedAgent(null)}
            onEditComplete={fetchAgents}
          />
        </div>
      )}

      {/* Chat Panel */}
      {chatAgent && (
        <ChatPanel
          agent={chatAgent}
          isOpen={showChatPanel}
          onClose={() => {
            setShowChatPanel(false);
            setChatAgent(null);
          }}
        />
      )}
    </motion.div>
  );
}

// Custom Detail Panel for Agents
function AgentDetailPanel({ agent, onClose, onEditComplete }: {
  agent: AgentWithTaskCount;
  onClose: () => void;
  onEditComplete: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editData, setEditData] = useState<Partial<AgentWithTaskCount>>({});

  useEffect(() => {
    setEditData({ ...agent });
  }, [agent]);

  const handleSave = async () => {
    try {
      setIsSaving(true);
      await apiClient.agents.update(agent.id, {
        name: editData.name,
        emoji: editData.emoji,
        role: editData.role,
        status: editData.status,
      });
      setIsEditing(false);
      onEditComplete();
    } catch (error) {
      console.error('Failed to save agent:', error);
      alert('Failed to save changes. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setEditData({ ...agent });
    setIsEditing(false);
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-blue-600" />
          <h3 className="font-display font-bold text-slate-900 text-sm">
            Agent Details
          </h3>
        </div>
        <div className="flex items-center gap-1">
          {!isEditing ? (
            <button
              onClick={() => setIsEditing(true)}
              className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-400 transition-colors"
              title="Edit"
            >
              <Edit2 className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={isSaving}
              className={cn(
                'p-1.5 rounded-lg transition-colors',
                isSaving ? 'text-slate-300 cursor-not-allowed' : 'hover:bg-green-100 text-green-600'
              )}
              title="Save"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            </button>
          )}
          {isEditing && (
            <button
              onClick={handleCancel}
              className="p-1.5 hover:bg-red-100 rounded-lg text-red-600 transition-colors"
              title="Cancel"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-400 transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-5 space-y-6">
          {/* Avatar and Name */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-2xl">
              {isEditing ? (
                <input
                  type="text"
                  value={editData.emoji || ''}
                  onChange={(e) => setEditData({ ...editData, emoji: e.target.value })}
                  className="w-full text-center bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  placeholder="🤖"
                  maxLength={2}
                />
              ) : (
                agent.emoji || '🤖'
              )}
            </div>
            <div>
              {isEditing ? (
                <input
                  type="text"
                  value={editData.name || ''}
                  onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                  className="text-xl font-bold text-slate-900 bg-transparent border-b border-slate-200 focus:outline-none focus:border-blue-500"
                  placeholder="Agent name..."
                />
              ) : (
                <h2 className="text-xl font-bold text-slate-900">{agent.name || 'Unnamed Agent'}</h2>
              )}
              <div className="flex items-center gap-2 mt-1">
                <span className={cn(
                  'text-[10px] font-bold px-2 py-0.5 rounded-full border',
                  getStatusColor(agent.status)
                )}>
                  {agent.status || 'offline'}
                </span>
                {getStatusIcon(agent.status)}
              </div>
            </div>
          </div>

          {/* Status */}
          {isEditing && (
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">
                Status
              </label>
              <select
                value={editData.status || ''}
                onChange={(e) => setEditData({ ...editData, status: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="online">Online</option>
                <option value="busy">Busy</option>
                <option value="idle">Idle</option>
                <option value="offline">Offline</option>
              </select>
            </div>
          )}

          {/* Role/Model */}
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">
              Model/Role
            </label>
            {isEditing ? (
              <input
                type="text"
                value={editData.role || ''}
                onChange={(e) => setEditData({ ...editData, role: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder="Model/Role..."
              />
            ) : (
              <p className="text-sm text-slate-600">{agent.role || 'General Purpose Agent'}</p>
            )}
          </div>

          {/* Task Count */}
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">
              Assigned Tasks
            </label>
            <p className="text-sm text-slate-600 font-bold">{agent.taskCount || 0}</p>
          </div>

          {/* Last Activity */}
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">
              Last Activity
            </label>
            <p className="text-sm text-slate-600">{agent.lastActivity || 'Never'}</p>
          </div>

          {/* Agent ID */}
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">
              Agent ID
            </label>
            <p className="text-xs font-mono text-slate-500 break-all">{agent.id}</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 shrink-0">
        <p className="text-[10px] text-slate-400 text-center">
          Agent ID: {agent.id}
        </p>
      </div>
    </div>
  );
}