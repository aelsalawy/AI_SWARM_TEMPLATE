import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import {
  Bell, CheckCheck, Info, AlertTriangle, CheckCircle2, XCircle,
  RefreshCw, Inbox, Trash2, Loader2
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import apiClient from '../lib/api-client';
import { useAuth } from '../contexts/AuthContext';
import { timeAgo } from '../lib/timeUtils';
import type { AppNotification } from '../lib/types';

const TYPE_ICONS: Record<string, React.ReactNode> = {
  info: <Info className="w-4 h-4" />,
  warning: <AlertTriangle className="w-4 h-4" />,
  success: <CheckCircle2 className="w-4 h-4" />,
  error: <XCircle className="w-4 h-4" />,
};

const TYPE_COLORS: Record<string, string> = {
  info: 'bg-blue-50 text-blue-600 border-blue-200',
  warning: 'bg-amber-50 text-amber-600 border-amber-200',
  success: 'bg-green-50 text-green-600 border-green-200',
  error: 'bg-red-50 text-red-600 border-red-200',
};

type Filter = 'all' | 'unread';

export default function NotificationsInbox() {
  const { isAuthenticated } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('unread');
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const fetchNotifications = useCallback(async (f: Filter = filter) => {
    try {
      setLoading(true);
      setError(null);
      const page = await apiClient.notifications.list({ unread: f === 'unread', limit: 100 });
      setNotifications(page.notifications);
      setUnreadCount(page.unreadCount);
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
      setError('Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchNotifications();
    } else {
      setLoading(false);
    }
  }, [isAuthenticated, filter, fetchNotifications]);

  const handleMarkRead = async (id: string) => {
    setMarkingId(id);
    try {
      const updated = await apiClient.notifications.markRead(id);
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, read: updated.read ?? true } : n))
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark read:', err);
      alert('Failed to mark notification as read');
    } finally {
      setMarkingId(null);
    }
  };

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    try {
      const res = await apiClient.notifications.markAllRead();
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
      if (res.updated === 0) {
        // nothing to do, but stay on current view
      }
    } catch (err) {
      console.error('Failed to mark all read:', err);
      alert('Failed to mark all as read');
    } finally {
      setMarkingAll(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiClient.notifications.remove(id);
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch (err) {
      console.error('Failed to delete notification:', err);
      alert('Failed to delete notification');
    }
  };

  const visible = filter === 'unread' ? notifications.filter(n => !n.read) : notifications;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="p-4 sm:p-8 max-w-5xl mx-auto space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 rounded-lg">
            <Bell className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="font-display text-xl font-bold text-slate-900">Notifications Inbox</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {unreadCount} unread · {notifications.length} loaded
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Filter toggle */}
          <div className="flex bg-slate-100 rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-bold transition-colors',
                filter === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              )}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setFilter('unread')}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-bold transition-colors flex items-center gap-1.5',
                filter === 'unread' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              )}
            >
              Unread
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.5 bg-red-500 text-white rounded-full text-[9px] leading-none">
                  {unreadCount}
                </span>
              )}
            </button>
          </div>

          <button
            type="button"
            onClick={() => fetchNotifications()}
            className="p-2 hover:bg-slate-200 rounded-lg text-slate-400 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          </button>

          <button
            type="button"
            onClick={handleMarkAllRead}
            disabled={markingAll || unreadCount === 0}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 transition-all disabled:opacity-40"
          >
            {markingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCheck className="w-3.5 h-3.5" />}
            Mark All Read
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Inbox className="w-4 h-4 text-slate-400" />
            <h4 className="font-display font-bold text-slate-900 text-sm">
              {filter === 'unread' ? 'Unread' : 'All'} Notifications
            </h4>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              newest first
            </span>
          </div>
          {visible.length > 0 && (
            <span className="text-[10px] font-bold text-slate-400 uppercase">
              {visible.length} item{visible.length === 1 ? '' : 's'}
            </span>
          )}
        </div>

        {loading && notifications.length === 0 ? (
          <div className="p-12 flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Loading...</p>
          </div>
        ) : error ? (
          <div className="p-12 text-center">
            <XCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
            <p className="text-sm text-red-600">{error}</p>
            <button
              onClick={() => fetchNotifications()}
              className="mt-4 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-semibold hover:bg-slate-800 transition-all"
            >
              Retry
            </button>
          </div>
        ) : visible.length === 0 ? (
          <div className="p-12 text-center">
            <Bell className="w-12 h-12 text-slate-200 mx-auto mb-4" />
            <p className="text-sm text-slate-500 font-medium">No {filter === 'unread' ? 'unread' : ''} notifications</p>
            <p className="text-xs text-slate-400 mt-1">
              {filter === 'unread' ? 'You are all caught up! 🎉' : 'Nothing here yet.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {visible.map((n) => (
              <div
                key={n.id}
                className={cn(
                  'px-6 py-4 flex items-start gap-4 hover:bg-slate-50 transition-colors group',
                  !n.read && 'bg-blue-50/40'
                )}
              >
                {/* Type icon */}
                <div className={cn(
                  'p-2 rounded-lg border flex-shrink-0',
                  TYPE_COLORS[n.type as string] || TYPE_COLORS.info
                )}>
                  {TYPE_ICONS[n.type as string] || TYPE_ICONS.info}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h5 className={cn(
                      'text-sm truncate',
                      n.read ? 'font-medium text-slate-600' : 'font-bold text-slate-900'
                    )}>
                      {n.title}
                    </h5>
                    {!n.read && (
                      <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0" title="Unread" />
                    )}
                  </div>
                  {n.message && (
                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{n.message}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase">
                      {timeAgo(n.createdAt)}
                    </span>
                    {n.actionUrl && (
                      <a
                        href={n.actionUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] font-bold text-blue-600 hover:underline"
                      >
                        Open link
                      </a>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  {!n.read && (
                    <button
                      onClick={() => handleMarkRead(n.id)}
                      disabled={markingId === n.id}
                      className="p-1.5 hover:bg-blue-100 rounded-lg text-slate-400 hover:text-blue-600 transition-colors"
                      title="Mark as read"
                    >
                      {markingId === n.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCheck className="w-3.5 h-3.5" />}
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(n.id)}
                    className="p-1.5 hover:bg-red-100 rounded-lg text-slate-400 hover:text-red-600 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
