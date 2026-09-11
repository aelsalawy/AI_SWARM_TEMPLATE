import React from 'react';
import { X, Bot, Bug, FileText, Edit2, Save, Loader2, MessageSquare, History, Link2, Settings, Plus, Trash2, Paperclip, Download, Upload } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import type { Task, Bug as BugType, Requirement, TaskComment, BugComment, TaskHistory, BugHistory } from '../lib/types';
import apiClient from '../lib/api-client';
import AgentChatPanel from './AgentChatPanel';
import DispatchChip from './DispatchChip';

export type DetailItemType = 'task' | 'bug' | 'requirement';

export interface DetailItem {
  type: DetailItemType;
  data: Task | BugType | Requirement;
}

interface DetailPanelProps {
  item: DetailItem | null;
  onClose: () => void;
  onEditComplete?: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  'To Do': 'bg-slate-100 text-slate-700',
  'TODO': 'bg-slate-100 text-slate-700',
  'In Progress': 'bg-blue-100 text-blue-700',
  'IN_PROGRESS': 'bg-blue-100 text-blue-700',
  'Review': 'bg-amber-100 text-amber-700',
  'REVIEW': 'bg-amber-100 text-amber-700',
  'Done': 'bg-green-100 text-green-700',
  'DONE': 'bg-green-100 text-green-700',
  'Open': 'bg-red-100 text-red-700',
  'In_Progress': 'bg-blue-100 text-blue-700',
  'Resolved': 'bg-green-100 text-green-700',
  'Closed': 'bg-slate-100 text-slate-500',
  'Pending': 'bg-amber-100 text-amber-700',
  'Verified': 'bg-green-100 text-green-700',
};

const PRIORITY_COLORS: Record<string, string> = {
  'Low': 'bg-slate-50 text-slate-500',
  'Medium': 'bg-blue-50 text-blue-600',
  'High': 'bg-amber-50 text-amber-600',
  'Urgent': 'bg-red-50 text-red-600',
  'Critical': 'bg-red-50 text-red-600',
};

const TYPE_ICONS: Record<DetailItemType, React.ReactNode> = {
  task: <Bot className="w-5 h-5 text-blue-600" />,
  bug: <Bug className="w-5 h-5 text-red-500" />,
  requirement: <FileText className="w-5 h-5 text-blue-600" />,
};

const TYPE_LABELS: Record<DetailItemType, string> = {
  task: 'Task',
  bug: 'Bug',
  requirement: 'Requirement',
};

const FIELD_COLORS: Record<string, string> = {
  status: 'text-blue-600 bg-blue-50',
  priority: 'text-amber-600 bg-amber-50',
  assignedAgentId: 'text-purple-600 bg-purple-50',
  title: 'text-slate-600 bg-slate-50',
  description: 'text-slate-600 bg-slate-50',
  created: 'text-green-600 bg-green-50',
};

type TabId = 'overview' | 'comments' | 'history' | 'traceability';

const ALL_TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <FileText className="w-3.5 h-3.5" /> },
  { id: 'comments', label: 'Comments', icon: <MessageSquare className="w-3.5 h-3.5" /> },
  { id: 'history', label: 'History', icon: <History className="w-3.5 h-3.5" /> },
  { id: 'traceability', label: 'Traceability', icon: <Link2 className="w-3.5 h-3.5" /> },
];

function normalizeStatus(status?: string): string {
  if (!status) return 'Unknown';
  switch (status) {
    case 'TODO': return 'To Do';
    case 'IN_PROGRESS': return 'In Progress';
    case 'In_Progress': return 'In Progress';
    case 'REVIEW': return 'Review';
    case 'DONE': return 'Done';
    default: return status;
  }
}

// Load panel preferences from localStorage
function loadPrefs(): { tabs: TabId[]; width: number } {
  try {
    const raw = localStorage.getItem('detailPanelPrefs');
    if (raw) {
      const prefs = JSON.parse(raw);
      return {
        tabs: prefs.tabs?.length ? prefs.tabs : ALL_TABS.map(t => t.id),
        width: prefs.width || 384,
      };
    }
  } catch {}
  return { tabs: ALL_TABS.map(t => t.id), width: 384 };
}

function savePrefs(prefs: { tabs: TabId[]; width: number }) {
  try {
    localStorage.setItem('detailPanelPrefs', JSON.stringify(prefs));
  } catch {}
}

// ─── Comments Section ───
function AttachmentsSection({ itemId }: { itemId: string }) {
  const [attachments, setAttachments] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const fetchAttachments = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const list = await apiClient.bugs.getAttachments(itemId);
      setAttachments(Array.isArray(list) ? list : []);
    } catch (e: any) {
      console.error('Failed to fetch attachments:', e);
      setError('Failed to load attachments');
    } finally {
      setLoading(false);
    }
  }, [itemId]);

  React.useEffect(() => {
    fetchAttachments();
  }, [fetchAttachments]);

  const handleUpload = async (file: File) => {
    if (uploading) return;
    // API accepts images only, ~5MB cap on base64 payload
    const ALLOWED = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
    if (!ALLOWED.includes(file.type)) {
      setError('Only images (png, jpg, gif, webp) can be attached');
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setError('File too large (max ~4MB)');
      return;
    }
    try {
      setUploading(true);
      setError(null);
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await apiClient.bugs.addAttachment(itemId, {
        data: base64,
        filename: file.name,
        mimeType: file.type,
        uploadedBy: 'user',
      });
      await fetchAttachments();
    } catch (e: any) {
      console.error('Upload failed:', e);
      setError(e?.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDownload = async (att: any) => {
    try {
      const full = await (apiClient.bugs as any).getAttachment?.(itemId, att.id)
        ?? await fetch(`/api/bugs/${itemId}/attachments/${att.id}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
        }).then(r => r.json());
      const data: string | undefined = full?.data;
      if (!data) throw new Error('No data');
      const a = document.createElement('a');
      a.href = `data:${att.mimeType};base64,${data}`;
      a.download = att.filename;
      a.click();
    } catch (e) {
      console.error('Download failed:', e);
      setError('Download failed');
    }
  };

  const handleDelete = async (att: any) => {
    try {
      await apiClient.bugs.deleteAttachment(itemId, att.id);
      await fetchAttachments();
    } catch (e: any) {
      console.error('Delete failed:', e);
      setError(e?.message || 'Delete failed');
    }
  };

  const formatSize = (n?: number) => {
    if (!n && n !== 0) return '';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <div className="px-5 py-3">
      {error && (
        <div className="mb-2 px-2 py-1 rounded bg-red-50 text-red-600 text-[10px]">{error}</div>
      )}
      {loading ? (
        <div className="flex items-center justify-center py-3">
          <Loader2 className="w-4 h-4 animate-spin text-slate-300" />
        </div>
      ) : (
        <>
          {attachments.length === 0 ? (
            <p className="text-xs text-slate-400 mb-2">No attachments yet.</p>
          ) : (
            <div className="space-y-1.5 mb-2">
              {attachments.map(att => (
                <div key={att.id} className="flex items-center gap-2 p-1.5 rounded-lg bg-slate-50 group">
                  <Paperclip className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-slate-700 truncate">{att.filename}</p>
                    <p className="text-[10px] text-slate-400">{formatSize(att.size)}</p>
                  </div>
                  <button
                    onClick={() => handleDownload(att)}
                    className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-blue-600 transition-colors"
                    title="Download"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(att)}
                    className="p-1 rounded hover:bg-red-100 text-slate-400 hover:text-red-600 transition-colors"
                    title="Remove"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-slate-300 text-xs text-slate-500 hover:border-blue-400 hover:text-blue-600 transition-colors disabled:opacity-50"
          >
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {uploading ? 'Uploading...' : 'Attach image (png, jpg, gif, webp)'}
          </button>
        </>
      )}
    </div>
  );
}

function CommentsSection({ itemId, itemType }: { itemId: string; itemType: DetailItemType }) {
  const [comments, setComments] = React.useState<(TaskComment | BugComment)[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [newComment, setNewComment] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  const fetchComments = React.useCallback(async () => {
    try {
      setLoading(true);
      const result = itemType === 'task'
        ? await apiClient.tasks.getComments(itemId)
        : await apiClient.bugs.getComments?.(itemId) ?? [];
      // Normalize: API returns 'text' for bug comments, 'body' internally
      setComments((result as any[]).map(c => ({ ...c, body: c.body || c.text || '' })));
    } catch (e) {
      console.error('Failed to fetch comments:', e);
    } finally {
      setLoading(false);
    }
  }, [itemId, itemType]);

  React.useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const handleAdd = async () => {
    if (!newComment.trim()) return;
    try {
      setSubmitting(true);
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      const commentData = {
        text: newComment.trim(),
        authorId: user.uid || user.id || 'user',
        authorName: user.displayName || user.email || 'User',
        authorEmoji: '👤',
      };
      let created;
      if (itemType === 'task') {
        created = await apiClient.tasks.addComment(itemId, commentData);
      } else {
        created = await apiClient.bugs.addComment(itemId, commentData);
      }
      setComments(prev => [...prev, { ...created, body: (created as any).body || (created as any).text || newComment.trim() }]);
      setNewComment('');
    } catch (e) {
      console.error('Failed to add comment:', e);
      alert('Failed to add comment');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>;
  }

  return (
    <div className="flex flex-col">
      <div className="space-y-3 p-3">
        {comments.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-4">No comments yet</p>
        ) : (
          comments.map(c => (
            <div key={c.id} className="bg-slate-50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-sm">{c.authorEmoji || '👤'}</span>
                <span className="text-xs font-semibold text-slate-700">{c.authorName || 'Unknown'}</span>
                {(c as any).createdAt && (
                  <span className="text-[10px] text-slate-400 ml-auto">
                    {new Date((c as any).createdAt).toLocaleString()}
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                {c.body || (c as any).text || ''}
              </p>
            </div>
          ))
        )}
      </div>
      <div className="border-t border-slate-100 p-3 shrink-0">
        <div className="flex gap-2">
          <textarea
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
            placeholder="Write a comment..."
            className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
            rows={2}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAdd(); }}
          />
          <button
            onClick={handleAdd}
            disabled={!newComment.trim() || submitting}
            className={cn(
              'px-3 py-2 rounded-lg text-sm font-medium transition-colors shrink-0',
              newComment.trim() && !submitting
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            )}
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── History Section ───
function HistorySection({ itemId, itemType }: { itemId: string; itemType: DetailItemType }) {
  const [history, setHistory] = React.useState<(TaskHistory | BugHistory)[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    async function fetchHistory() {
      try {
        setLoading(true);
        const result = itemType === 'task'
          ? await apiClient.tasks.getHistory(itemId)
          : await apiClient.bugs.getHistory?.(itemId) ?? [];
        setHistory(result as any[]);
      } catch (e) {
        console.error('Failed to fetch history:', e);
      } finally {
        setLoading(false);
      }
    }
    fetchHistory();
  }, [itemId, itemType]);

  if (loading) {
    return <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>;
  }

  if (history.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-8">No history recorded</p>;
  }

  return (
    <div className="p-3 space-y-2 overflow-y-auto">
      {history.map((h: any) => (
        <div key={h.id} className="flex items-start gap-3 pb-3 border-b border-slate-50 last:border-0">
          <div className={cn('w-2 h-2 rounded-full mt-1.5 shrink-0', FIELD_COLORS[h.field]?.split(' ')[1] || 'bg-slate-200')} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded', FIELD_COLORS[h.field] || 'bg-slate-50 text-slate-500')}>
                {h.field}
              </span>
              <span className="text-xs text-slate-400">
                {h.fromValue || '∅'} → {h.toValue || '∅'}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] text-slate-400">by {h.changedBy}</span>
              {h.createdAt && (
                <span className="text-[10px] text-slate-300">
                  {new Date(h.createdAt).toLocaleString()}
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Traceability Section ───
function TraceabilitySection({ item }: { item: DetailItem }) {
  const [linkedTasks, setLinkedTasks] = React.useState<any[]>([]);
  const [linkedBugs, setLinkedBugs] = React.useState<any[]>([]);
  const [linkedReqs, setLinkedReqs] = React.useState<any[]>([]);
  const [allTasks, setAllTasks] = React.useState<any[]>([]);
  const [allBugs, setAllBugs] = React.useState<any[]>([]);
  const [allReqs, setAllReqs] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showLinkMenu, setShowLinkMenu] = React.useState<'task' | 'bug' | 'req' | null>(null);

  const fetchLinked = React.useCallback(async () => {
    try {
      setLoading(true);
      const id = item.data.id;

      if (item.type === 'task') {
        const [reqs, tasks] = await Promise.all([
          apiClient.tasks.getRequirements(id).catch(() => []),
          Promise.resolve([]),
        ]);
        setLinkedReqs(reqs as any[]);
      } else if (item.type === 'bug') {
        const reqs = await apiClient.bugs.getRequirements?.(id).catch(() => []);
        setLinkedReqs(reqs as any[]);
      } else if (item.type === 'requirement') {
        const [tasks, bugs] = await Promise.all([
          apiClient.requirements.getTasks(id).catch(() => []),
          apiClient.requirements.getBugs(id).catch(() => []),
        ]);
        setLinkedTasks(tasks as any[]);
        setLinkedBugs(bugs as any[]);
      }
    } catch (e) {
      console.error('Failed to fetch traceability:', e);
    } finally {
      setLoading(false);
    }
  }, [item]);

  React.useEffect(() => {
    fetchLinked();
  }, [fetchLinked]);

  // Fetch all items for linking dropdowns
  React.useEffect(() => {
    async function fetchAll() {
      try {
        const [tasks, bugs, reqs] = await Promise.all([
          apiClient.tasks.list().catch(() => []),
          apiClient.bugs.list().catch(() => []),
          apiClient.requirements.list().catch(() => []),
        ]);
        setAllTasks(tasks as any[]);
        setAllBugs(bugs as any[]);
        setAllReqs(reqs as any[]);
      } catch (e) {
        console.error('Failed to fetch items for linking:', e);
      }
    }
    fetchAll();
  }, []);

  const handleLink = async (type: 'task' | 'bug', targetId: string) => {
    try {
      if (item.type !== 'requirement') return;
      if (type === 'task') {
        await apiClient.requirements.linkTask(item.data.id, targetId);
      } else {
        await apiClient.requirements.linkBug(item.data.id, targetId);
      }
      setShowLinkMenu(null);
      fetchLinked();
    } catch (e) {
      alert('Failed to link. They might already be linked.');
    }
  };

  const handleUnlink = async (type: 'task' | 'bug', targetId: string) => {
    try {
      if (item.type !== 'requirement') return;
      if (type === 'task') {
        await apiClient.requirements.unlinkTask(item.data.id, targetId);
      } else {
        await apiClient.requirements.unlinkBug(item.data.id, targetId);
      }
      fetchLinked();
    } catch (e) {
      alert('Failed to unlink.');
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>;
  }

  const id = item.data.id;

  return (
    <div className="p-3 space-y-4 overflow-y-auto">
      {/* For Requirements: show linked Tasks and Bugs */}
      {item.type === 'requirement' && (
        <>
          {/* Linked Tasks */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Linked Tasks</h4>
              <button
                onClick={() => setShowLinkMenu(showLinkMenu === 'task' ? null : 'task')}
                className="p-1 hover:bg-slate-100 rounded text-slate-400"
                title="Link task"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
            {showLinkMenu === 'task' && (
              <select
                onChange={e => { if (e.target.value) handleLink('task', e.target.value); }}
                value=""
                className="w-full mb-2 px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="">Select a task to link...</option>
                {allTasks.filter(t => !linkedTasks.some(lt => lt.id === t.id)).map(t => (
                  <option key={t.id} value={t.id}>{t.title || 'Untitled'}</option>
                ))}
              </select>
            )}
            {linkedTasks.length === 0 ? (
              <p className="text-xs text-slate-400 py-2">No tasks linked</p>
            ) : (
              <div className="space-y-1">
                {linkedTasks.map(t => (
                  <div key={t.id} className="flex items-center gap-2 bg-slate-50 rounded-lg px-2.5 py-2">
                    <Bot className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    <span className="text-xs text-slate-700 truncate flex-1">{t.title}</span>
                    <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full', STATUS_COLORS[normalizeStatus(t.status)] || 'bg-slate-100')}>
                      {normalizeStatus(t.status)}
                    </span>
                    <button
                      onClick={() => handleUnlink('task', t.id)}
                      className="p-0.5 hover:bg-red-100 rounded text-red-400"
                      title="Unlink"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Linked Bugs */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Linked Bugs</h4>
              <button
                onClick={() => setShowLinkMenu(showLinkMenu === 'bug' ? null : 'bug')}
                className="p-1 hover:bg-slate-100 rounded text-slate-400"
                title="Link bug"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
            {showLinkMenu === 'bug' && (
              <select
                onChange={e => { if (e.target.value) handleLink('bug', e.target.value); }}
                value=""
                className="w-full mb-2 px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="">Select a bug to link...</option>
                {allBugs.filter(b => !linkedBugs.some(lb => lb.id === b.id)).map(b => (
                  <option key={b.id} value={b.id}>{b.title || 'Untitled'}</option>
                ))}
              </select>
            )}
            {linkedBugs.length === 0 ? (
              <p className="text-xs text-slate-400 py-2">No bugs linked</p>
            ) : (
              <div className="space-y-1">
                {linkedBugs.map(b => (
                  <div key={b.id} className="flex items-center gap-2 bg-slate-50 rounded-lg px-2.5 py-2">
                    <Bug className="w-3.5 h-3.5 text-red-400 shrink-0" />
                    <span className="text-xs text-slate-700 truncate flex-1">{b.title}</span>
                    <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full', STATUS_COLORS[b.status] || 'bg-slate-100')}>
                      {b.status}
                    </span>
                    <button
                      onClick={() => handleUnlink('bug', b.id)}
                      className="p-0.5 hover:bg-red-100 rounded text-red-400"
                      title="Unlink"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* For Tasks: show linked Requirements */}
      {item.type === 'task' && (
        <div>
          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Linked Requirements</h4>
          {linkedReqs.length === 0 ? (
            <p className="text-xs text-slate-400 py-2">No requirements linked. Link from the requirement side.</p>
          ) : (
            <div className="space-y-1">
              {linkedReqs.map(r => (
                <div key={r.id} className="flex items-center gap-2 bg-slate-50 rounded-lg px-2.5 py-2">
                  <FileText className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                  <span className="text-xs text-slate-700 truncate flex-1">{r.title}</span>
                  <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full', STATUS_COLORS[r.status] || 'bg-slate-100')}>
                    {r.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* For Bugs: show linked Requirements */}
      {item.type === 'bug' && (
        <div>
          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Linked Requirements</h4>
          {linkedReqs.length === 0 ? (
            <p className="text-xs text-slate-400 py-2">No requirements linked. Link from the requirement side.</p>
          ) : (
            <div className="space-y-1">
              {linkedReqs.map(r => (
                <div key={r.id} className="flex items-center gap-2 bg-slate-50 rounded-lg px-2.5 py-2">
                  <FileText className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                  <span className="text-xs text-slate-700 truncate flex-1">{r.title}</span>
                  <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full', STATUS_COLORS[r.status] || 'bg-slate-100')}>
                    {r.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main DetailPanel ───
// R2-9: skills editing — comma string ⇄ tags array helpers
const parseSkillsInput = (v: any): string[] => {
  if (Array.isArray(v)) return v.map((t: any) => String(t).trim()).filter(Boolean);
  return String(v || '').split(',').map(t => t.trim()).filter(Boolean);
};
const skillsStringFromData = (data: any): string =>
  Array.isArray(data?.tags) ? (data.tags as string[]).join(', ') : '';

export default function DetailPanel({ item, onClose, onEditComplete }: DetailPanelProps) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [editData, setEditData] = React.useState<any>({});
  const [activeTab, setActiveTab] = React.useState<TabId>('overview');
  const [prefs, setPrefs] = React.useState(loadPrefs());
  const [showSettings, setShowSettings] = React.useState(false);
  const [resizing, setResizing] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [agents, setAgents] = React.useState<any[]>([]);
  const [sprints, setSprints] = React.useState<any[]>([]);
  const [releases, setReleases] = React.useState<any[]>([]);
  const [releaseCustom, setReleaseCustom] = React.useState(false);
  const [showChatFor, setShowChatFor] = React.useState<string | null>(null);
  const [chatPrefill, setChatPrefill] = React.useState<string>('');
  const settingsRef = React.useRef<HTMLDivElement>(null);

  // Fetch agents + sprints so the edit modal can reassign bugs/tasks to an agent
  React.useEffect(() => {
    if (!isEditing) return;
    let cancelled = false;
    apiClient.agents.list()
      .then(list => { if (!cancelled) setAgents(list); })
      .catch(() => {/* silently ignore — dropdown stays empty */});
    return () => { cancelled = true; };
  }, [isEditing]);

  // Fetch sprints for display + edit (cheap; also powers Sprint meta row)
  React.useEffect(() => {
    let cancelled = false;
    apiClient.sprints.list()
      .then(list => { if (!cancelled) setSprints(list); })
      .catch(() => {/* silently ignore — sprint dropdown stays empty */});
    return () => { cancelled = true; };
  }, []);

  // Fetch releases for the release dropdown (scoped to the item's project when available)
  React.useEffect(() => {
    let cancelled = false;
    const projectId = (item?.data as any)?.projectId;
    apiClient.releases.list(projectId || undefined)
      .then(list => { if (!cancelled) setReleases(list); })
      .catch(() => {/* silently ignore — release dropdown stays empty */});
    return () => { cancelled = true; };
  }, [item?.data?.id]);

  // Drop out of custom-release entry mode when edit mode closes
  React.useEffect(() => {
    if (!isEditing) setReleaseCustom(false);
  }, [isEditing]);

  // Close settings dropdown on click outside
  React.useEffect(() => {
    if (!showSettings) return;
    const handleClick = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettings(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showSettings]);

  React.useEffect(() => {
    if (item) {
      setEditData({ ...item.data });
      setActiveTab('overview');
    }
  }, [item]);

  // Resizing logic
  React.useEffect(() => {
    if (!resizing) return;
    const handleMove = (e: MouseEvent) => {
      const newWidth = window.innerWidth - e.clientX;
      const clamped = Math.max(320, Math.min(600, newWidth));
      setPrefs(prev => {
        const updated = { ...prev, width: clamped };
        savePrefs(updated);
        return updated;
      });
    };
    const handleUp = () => setResizing(false);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [resizing]);

  if (!item) return null;

  const handleSave = async () => {
    if (!item?.data?.id) return;

    try {
      setIsSaving(true);

      if (item.type === 'task') {
        await apiClient.tasks.update(item.data.id, {
          title: editData.title,
          description: editData.description,
          status: editData.status,
          priority: editData.priority,
          assignedAgentId: editData.assignedAgentId || null,
          sprintId: editData.sprintId || null,
          release: editData.release?.trim() ? editData.release.trim() : null,
          tags: parseSkillsInput(editData.skills !== undefined ? editData.skills : skillsStringFromData(editData)),
        });
      } else if (item.type === 'bug') {
        await apiClient.bugs.update(item.data.id, {
          title: editData.title,
          description: editData.description,
          status: editData.status,
          priority: editData.priority,
          assignedAgentId: editData.assignedAgentId || null,
          sprintId: editData.sprintId || null,
          release: editData.release?.trim() ? editData.release.trim() : null,
          tags: parseSkillsInput(editData.skills !== undefined ? editData.skills : skillsStringFromData(editData)),
        });
      } else if (item.type === 'requirement') {
        await apiClient.requirements.update(item.data.id, {
          title: editData.title,
          description: editData.description,
          status: editData.status,
          sprintId: editData.sprintId || null,
          release: editData.release?.trim() ? editData.release.trim() : null,
        });
      }

      setIsEditing(false);
      onEditComplete?.();
    } catch (error) {
      console.error('Failed to save:', error);
      alert('Failed to save changes. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setEditData({ ...item.data });
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (!item?.data?.id) return;
    try {
      setIsDeleting(true);
      if (item.type === 'task') {
        await apiClient.tasks.delete(item.data.id);
      } else if (item.type === 'bug') {
        await apiClient.bugs.delete(item.data.id);
      } else if (item.type === 'requirement') {
        await apiClient.requirements.delete(item.data.id);
      }
      onEditComplete?.();
      onClose();
    } catch (error) {
      console.error('Failed to delete:', error);
      alert('Failed to delete. You may not have permission.');
    } finally {
      setIsDeleting(false);
      setConfirmDelete(false);
    }
  };

  const getStatusOptions = () => {
    if (item.type === 'task') {
      return ['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'];
    } else if (item.type === 'bug') {
      return ['Open', 'In_Progress', 'Resolved', 'Closed'];
    } else if (item.type === 'requirement') {
      return ['Pending', 'Verified'];
    }
    return [];
  };

  const getPriorityOptions = () => {
    return ['Low', 'Medium', 'High', 'Urgent'];
  };

  const toggleTab = (tabId: TabId) => {
    setPrefs(prev => {
      const has = prev.tabs.includes(tabId);
      const tabs = has ? prev.tabs.filter(t => t !== tabId) : [...prev.tabs, tabId];
      const updated = { ...prev, tabs };
      savePrefs(updated);
      return updated;
    });
  };

  const visibleTabs = ALL_TABS.filter(t => prefs.tabs.includes(t.id));

  return (
    <div className="h-full flex flex-col bg-white" style={{ width: prefs.width }}>
      {/* Resize handle */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400/30 transition-colors z-10"
        onMouseDown={() => setResizing(true)}
      />

      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
        <div className="flex items-center gap-2">
          {TYPE_ICONS[item.type]}
          <h3 className="font-display font-bold text-slate-900 text-sm">
            {TYPE_LABELS[item.type]} Details
          </h3>
        </div>
        <div className="flex items-center gap-1">
          {/* Settings dropdown */}
          <div className="relative" ref={settingsRef}>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-400 transition-colors"
              title="Panel settings"
            >
              <Settings className="w-4 h-4" />
            </button>
            {showSettings && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg py-2 w-44 z-20">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-3 py-1">Show Sections</p>
                {ALL_TABS.map(tab => (
                  <label key={tab.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={prefs.tabs.includes(tab.id)}
                      onChange={() => toggleTab(tab.id)}
                      className="w-3.5 h-3.5 rounded border-slate-300"
                    />
                    <span className="text-xs text-slate-600">{tab.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {!isEditing ? (
            <button
              onClick={() => { setIsEditing(true); }}
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
          {/* Delete button with confirmation */}
          {!isEditing && !confirmDelete && (
            <button
              onClick={() => setConfirmDelete(true)}
              className="p-1.5 hover:bg-red-100 rounded-lg text-red-500 transition-colors"
              title="Delete"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          {confirmDelete && (
            <div className="flex items-center gap-1">
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-colors',
                  isDeleting ? 'bg-slate-100 text-slate-300' : 'bg-red-600 text-white hover:bg-red-700'
                )}
                title="Confirm delete"
              >
                {isDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-2 py-1 rounded-lg text-[10px] font-medium text-slate-500 hover:bg-slate-100 transition-colors"
                title="Cancel delete"
              >
                Cancel
              </button>
            </div>
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

      {/* Content — all visible sections stacked in one scrollable view */}
      <div className="flex-1 overflow-y-auto">
        {prefs.tabs.includes('overview') && (
          <div className="p-5 space-y-4">
            {/* Title */}
            <div>
              {isEditing ? (
                <input
                  type="text"
                  value={editData.title || ''}
                  onChange={e => setEditData({ ...editData, title: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-lg font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  placeholder="Title..."
                />
              ) : (
                <h2 className="text-lg font-bold text-slate-900 leading-snug">
                  {(item.data as any).title || 'Untitled'}
                </h2>
              )}
            </div>

            {/* Status & Priority badges */}
            {!isEditing && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn(
                  'text-[10px] font-bold px-2.5 py-1 rounded-full border',
                  STATUS_COLORS[normalizeStatus((item.data as any).status)] || 'bg-slate-50 text-slate-500 border-slate-200'
                )}>
                  {normalizeStatus((item.data as any).status)}
                </span>
                {(item.data as any).priority && (
                  <span className={cn(
                    'text-[10px] font-bold px-2.5 py-1 rounded-full',
                    PRIORITY_COLORS[(item.data as any).priority] || 'bg-slate-50 text-slate-500'
                  )}>
                    {(item.data as any).priority}
                  </span>
                )}
                {(item.data as any).assignedAgentId && (
                  <button
                    onClick={() => {
                      setChatPrefill(`${(item.data as any).title}: ${(item.data as any).description}`);
                      setShowChatFor(item.data.id);
                    }}
                    className="text-[10px] font-bold px-2.5 py-1 rounded-full border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                  >
                    Start task
                  </button>
                )}
                {(item.type === 'task' || item.type === 'bug') && (
                  <DispatchChip
                    itemType={item.type}
                    itemId={item.data.id}
                    itemStatus={(item.data as any).status}
                  />
                )}
                {showChatFor === item.data.id && (item.data as any).assignedAgentId && (
                  <AgentChatPanel
                    agentId={(item.data as any).assignedAgentId}
                    prefill={chatPrefill}
                    onClose={() => setShowChatFor(null)}
                  />
                )}
              </div>
            )}

            {/* Status & Priority Selects */}
            {isEditing && (
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">
                    Status
                  </label>
                  <select
                    value={editData.status || ''}
                    onChange={e => setEditData({ ...editData, status: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    {getStatusOptions().map(status => (
                      <option key={status} value={status}>{normalizeStatus(status)}</option>
                    ))}
                  </select>
                </div>

                {(item.type === 'task' || item.type === 'bug') && (
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">
                      Priority
                    </label>
                    <select
                      value={editData.priority || 'Medium'}
                      onChange={e => setEditData({ ...editData, priority: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    >
                      {getPriorityOptions().map(priority => (
                        <option key={priority} value={priority}>{priority}</option>
                      ))}
                    </select>
                  </div>
                )}

                {(item.type === 'task' || item.type === 'bug') && (
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">
                      Assigned Agent
                    </label>
                    <select
                      value={editData.assignedAgentId || ''}
                      onChange={e => setEditData({ ...editData, assignedAgentId: e.target.value || null })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    >
                      <option value="">Unassigned</option>
                      {agents.map(agent => (
                        <option key={agent.id} value={agent.id}>
                          {agent.emoji || '🤖'} {agent.name || agent.id} ({agent.role || 'agent'})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {(item.type === 'task' || item.type === 'bug') && (
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">
                      Skills
                    </label>
                    <input
                      value={editData.skills ?? skillsStringFromData(editData)}
                      onChange={e => setEditData({ ...editData, skills: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      placeholder="e.g. prisma, react, qa"
                    />
                  </div>
                )}

                {(item.type === 'task' || item.type === 'bug' || item.type === 'requirement') && (
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">
                      Sprint
                    </label>
                    <select
                      value={editData.sprintId || ''}
                      onChange={e => setEditData({ ...editData, sprintId: e.target.value || null })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    >
                      <option value="">No sprint</option>
                      {sprints.map((s: any) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {(item.type === 'task' || item.type === 'bug' || item.type === 'requirement') && (
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">
                      Release
                    </label>
                    {releaseCustom ? (
                      <div className="flex gap-2">
                        <input
                          value={editData.release || ''}
                          onChange={e => setEditData({ ...editData, release: e.target.value })}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                          placeholder="e.g. R1.2"
                          autoFocus
                        />
                        <button type="button" onClick={() => { setReleaseCustom(false); setEditData({ ...editData, release: '' }); }} className="px-3 border border-slate-200 rounded-lg text-slate-400 hover:bg-slate-50 text-sm" title="Back to dropdown">✕</button>
                      </div>
                    ) : (
                      <select
                        value={editData.release || '__none__'}
                        onChange={e => {
                          const v = e.target.value;
                          if (v === '__custom__') { setReleaseCustom(true); setEditData({ ...editData, release: '' }); }
                          else setEditData({ ...editData, release: v === '__none__' ? '' : v });
                        }}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      >
                        <option value="__none__">No release</option>
                        {Array.from(new Set([...releases.map((r: any) => r.name), ...(editData.release ? [editData.release] : [])])).map(name => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                        <option value="__custom__">+ Custom…</option>
                      </select>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Description */}
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">
                Description
              </label>
              {isEditing ? (
                <textarea
                  value={editData.description || ''}
                  onChange={e => setEditData({ ...editData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500/20 min-h-[120px] resize-y"
                  placeholder="Description..."
                  rows={6}
                />
              ) : (
                <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                  {(item.data as any).description || 'No description'}
                </p>
              )}
            </div>

            {/* Meta info */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">ID</span>
                <span className="font-mono text-slate-600">{item.data.id?.substring(0, 12)}...</span>
              </div>
              {item.type === 'task' && (item.data as Task).epic && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Epic</span>
                  <span className="font-medium text-slate-600">{(item.data as Task).epic}</span>
                </div>
              )}
              {(item.data as any).assignedAgentId && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Assigned Agent</span>
                  <span className="font-mono text-slate-600">{(item.data as any).assignedAgentId?.substring(0, 8)}...</span>
                </div>
              )}
              {(item.data as any).sprintId && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Sprint</span>
                  <span className="font-medium text-slate-600">{(item.data as any).sprint?.name || sprints.find((s: any) => s.id === (item.data as any).sprintId)?.name || (item.data as any).sprintId?.substring(0, 8) + '...'}</span>
                </div>
              )}
              {(item.data as any).release && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Release</span>
                  <span className="font-medium text-slate-600">{(item.data as any).release}</span>
                </div>
              )}
              {(item.data as any).createdAt && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Created</span>
                  <span className="text-slate-600">{new Date((item.data as any).createdAt).toLocaleDateString()}</span>
                </div>
              )}
              {(item.data as any).updatedAt && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Updated</span>
                  <span className="text-slate-600">{new Date((item.data as any).updatedAt).toLocaleDateString()}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {prefs.tabs.includes('comments') && (
          <div className="border-t border-slate-100">
            <div className="px-5 py-2 bg-slate-50 sticky top-0 z-10">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5" /> Comments
              </h4>
            </div>
            <CommentsSection itemId={item.data.id} itemType={item.type} />
          </div>
        )}

        {item.type === 'bug' && prefs.tabs.includes('comments') && (
          <div className="border-t border-slate-100">
            <div className="px-5 py-2 bg-slate-50 sticky top-0 z-10">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <Paperclip className="w-3.5 h-3.5" /> Attachments
              </h4>
            </div>
            <AttachmentsSection itemId={item.data.id} />
          </div>
        )}

        {prefs.tabs.includes('history') && (
          <div className="border-t border-slate-100">
            <div className="px-5 py-2 bg-slate-50 sticky top-0 z-10">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <History className="w-3.5 h-3.5" /> History
              </h4>
            </div>
            <HistorySection itemId={item.data.id} itemType={item.type} />
          </div>
        )}

        {prefs.tabs.includes('traceability') && (
          <div className="border-t border-slate-100">
            <div className="px-5 py-2 bg-slate-50 sticky top-0 z-10">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <Link2 className="w-3.5 h-3.5" /> Traceability
              </h4>
            </div>
            <TraceabilitySection item={item} />
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 shrink-0">
        <p className="text-[10px] text-slate-400 text-center">
          {TYPE_LABELS[item.type]} ID: {item.data.id}
        </p>
      </div>
    </div>
  );
}
