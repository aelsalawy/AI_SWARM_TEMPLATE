import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Bot, Zap, Wifi, WifiOff, Clock, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import apiClient from '../lib/api-client';
import { useAuth } from '../contexts/AuthContext';
import type { Agent } from '../lib/types';

export default function AgentStatusPanel() {
  const { isAuthenticated } = useAuth();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const onlineCount = agents.filter(a => a.status === 'online' || a.status === 'busy').length;
  const offlineCount = agents.filter(a => a.status === 'offline').length;
  const idleCount = agents.filter(a => a.status === 'idle').length;

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
      className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6"
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

      {/* Agent List */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <h3 className="font-display font-bold text-slate-900">Agent Swarm</h3>
          <button
            onClick={fetchAgents}
            className="p-2 hover:bg-slate-200 rounded-lg text-slate-400 transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {agents.length === 0 ? (
          <div className="p-12 text-center">
            <Bot className="w-12 h-12 text-slate-200 mx-auto mb-4" />
            <p className="text-sm text-slate-500 font-medium">No agents configured yet</p>
            <p className="text-xs text-slate-400 mt-1">Agents will appear here once they connect to the swarm</p>
          </div>
        ) : (
          <div className="max-h-[500px] overflow-y-auto divide-y divide-slate-100">
            {agents.map((agent) => (
              <div
                key={agent.id}
                className="px-6 py-4 flex items-center gap-4 hover:bg-slate-50 transition-colors"
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
                    <span>{agent.completionRate ? `${Math.round((agent.completionRate as number) * 100)}%` : 'N/A'}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Bot className="w-3.5 h-3.5 text-blue-500" />
                    <span>{(agent.activeTasks as number) || 0} active</span>
                  </div>
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
    </motion.div>
  );
}
