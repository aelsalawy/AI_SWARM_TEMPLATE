import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { Activity, RefreshCw, AlertCircle, FileText, Bug, CheckCircle2, Clock, Bot, FolderKanban, FlaskConical } from 'lucide-react';
import apiClient from '../lib/api-client';
import { useAuth } from '../contexts/AuthContext';
import { useRealtime } from '../lib/useRealtime';
import type { AuditLog } from '../lib/types';

const ACTION_ICONS: Record<string, React.ReactNode> = {
  'CREATE': <FileText className="w-4 h-4" />,
  'UPDATE': <CheckCircle2 className="w-4 h-4" />,
  'DELETE': <AlertCircle className="w-4 h-4" />,
  'RESULT': <FlaskConical className="w-4 h-4" />,
};

const ACTION_COLORS: Record<string, string> = {
  'CREATE': 'bg-green-100 text-green-600',
  'UPDATE': 'bg-blue-100 text-blue-600',
  'DELETE': 'bg-red-100 text-red-600',
  'RESULT': 'bg-purple-100 text-purple-600',
};

const ENTITY_ICONS: Record<string, React.ReactNode> = {
  'task': <FileText className="w-3 h-3" />,
  'bug': <Bug className="w-3 h-3" />,
  'project': <FolderKanban className="w-3 h-3" />,
  'test_run': <FlaskConical className="w-3 h-3" />,
  'agent': <Bot className="w-3 h-3" />,
  'requirement': <FileText className="w-3 h-3" />,
};

function formatTimeAgo(dateStr: string | Date): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export default function ActivityFeed() {
  const { isAuthenticated } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      setError(null);
      const list = await apiClient.auditLogs.list();
      // Sort by most recent first
      const sorted = list.sort((a, b) => {
        const dateA = new Date(a.createdAt as string).getTime();
        const dateB = new Date(b.createdAt as string).getTime();
        return dateB - dateA;
      });
      setLogs(sorted);
    } catch (err) {
      console.error('Failed to fetch activity logs:', err);
      setError('Failed to load activity feed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchLogs();
    } else {
      setLoading(false);
    }
  }, [isAuthenticated]);

  // P3-1: Live updates via SSE — map incoming event bus events to feed entries.
  useRealtime('*', (event) => {
    setLive(true);
    if (!event?.type) return;
    const [entityRaw] = event.type.split('.');
    const [actionWord] = event.type.split('.').slice(1);
    const entry: AuditLog = {
      id: event.id || `rt-${Date.now()}`,
      action: (actionWord || 'UPDATE').toUpperCase(),
      entityType: entityRaw || 'unknown',
      entityId: event.payload?.id || '',
      userId: event.payload?.updatedBy || event.payload?.ownerId || '',
      changes: event.payload ? { live: event.payload, via: 'realtime' } : null,
      createdAt: event.timestamp || new Date().toISOString(),
    };
    setLogs((prev) => [entry, ...prev].slice(0, 100));
  });

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Loading Activity...</p>
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
            onClick={fetchLogs}
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
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-slate-700" />
            <h3 className="font-display font-bold text-slate-900">
              Activity Feed ({logs.length})
            </h3>
            {/* P3-1 live connection indicator */}
            <span
              className={cn(
                'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider',
                live
                  ? 'bg-green-100 text-green-700'
                  : 'bg-slate-100 text-slate-500'
              )}
              title={live ? 'Live SSE stream connected' : 'Live stream inactive'}
            >
              <span className={cn('w-1.5 h-1.5 rounded-full', live ? 'bg-green-500 animate-pulse' : 'bg-slate-400')} />
              {live ? 'Live' : 'Polling'}
            </span>
          </div>
          <button
            onClick={fetchLogs}
            className="p-2 hover:bg-slate-200 rounded-lg text-slate-400 transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {logs.length === 0 ? (
          <div className="p-12 text-center">
            <Activity className="w-12 h-12 text-slate-200 mx-auto mb-4" />
            <p className="text-sm text-slate-500 font-medium">No activity yet</p>
            <p className="text-xs text-slate-400 mt-1">Activity will appear here as you use the system</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {logs.map((log) => {
              const action = log.action || 'UNKNOWN';
              const entityType = log.entityType || 'unknown';
              const actionIcon = ACTION_ICONS[action] || <Clock className="w-4 h-4" />;
              const actionColor = ACTION_COLORS[action] || 'bg-slate-100 text-slate-500';
              const entityIcon = ENTITY_ICONS[entityType] || <FileText className="w-3 h-3" />;

              return (
                <div
                  key={log.id}
                  className="px-6 py-4 flex items-start gap-4 hover:bg-slate-50 transition-colors"
                >
                  {/* Action Icon */}
                  <div className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5',
                    actionColor.split(' ')[0]
                  )}>
                    <span className={actionColor.split(' ')[1]}>
                      {actionIcon}
                    </span>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900">
                        {action}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-slate-400">
                        {entityIcon}
                        {entityType.replace('_', ' ')}
                      </span>
                    </div>
                    {log.changes && (
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">
                        {typeof log.changes === 'string'
                          ? log.changes
                          : JSON.stringify(log.changes).substring(0, 100)}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[10px] text-slate-400">
                        {formatTimeAgo(log.createdAt as string)}
                      </span>
                      {log.userId && (
                        <span className="text-[10px] text-slate-400">
                          by {log.userId.substring(0, 8)}...
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Entity ID */}
                  <span className="text-[10px] text-slate-300 font-mono flex-shrink-0 mt-1">
                    {log.entityId?.substring(0, 8)}...
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}
