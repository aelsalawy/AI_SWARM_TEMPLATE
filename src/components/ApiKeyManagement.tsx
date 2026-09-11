import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/src/lib/utils';
import {
  Key, Plus, Copy, Trash2, Ban, RefreshCw,
  CheckCircle2, ShieldCheck, Clock, CopyCheck
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../lib/api-client';

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
  key?: string;
}

function formatTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleString();
  } catch {
    return '—';
  }
}

export default function ApiKeyManagement() {
  const { isAuthenticated } = useAuth();
  const [keys, setKeys] = useState<ApiKeySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [revealedKey, setRevealedKey] = useState<{ id: string; name: string; key: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.apiKeys.list();
      setKeys(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load API keys');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) load();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const created = await apiClient.apiKeys.create(name.trim());
      setRevealedKey({ id: created.id, name: created.name, key: created.key || '' });
      setName('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create API key');
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm('Revoke this API key? Any clients using it will immediately lose access.')) return;
    try {
      await apiClient.apiKeys.revoke(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke API key');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Permanently delete this API key? This cannot be undone.')) return;
    try {
      await apiClient.apiKeys.delete(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete API key');
    }
  };

  const handleCopyKey = async () => {
    if (!revealedKey?.key) return;
    try {
      await navigator.clipboard.writeText(revealedKey.key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Failed to copy — clipboard not available');
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center p-8">
          <ShieldCheck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">Admin access required to manage API keys</p>
        </div>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="h-full overflow-y-auto">
      <div className="p-4 sm:p-8 max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">API Keys</h1>
            <p className="text-sm text-slate-500 mt-1">Manage machine-to-machine access tokens</p>
          </div>
          <button onClick={load} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors" title="Refresh">
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>

        {/* Info banner */}
        <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-bold text-blue-900">API keys authenticate agents, CI, and external integrations.</p>
            <p className="text-xs text-blue-700 mt-1">
              Store the key securely. It is shown in full only once — at creation time. Treat it like a password.
            </p>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="px-4 py-3 bg-red-50 border border-red-100 rounded-lg flex items-center justify-between">
            <p className="text-xs text-red-600 font-medium">{error}</p>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">✕</button>
          </div>
        )}

        {/* Create form */}
        <form onSubmit={handleCreate} className="p-6 border border-slate-100 rounded-xl bg-white flex flex-col sm:flex-row gap-3 items-end">
          <div className="flex-1 w-full">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Key name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. CI deploy agent"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <button
            type="submit"
            disabled={creating || !name.trim()}
            className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-semibold hover:bg-slate-800 transition-all disabled:opacity-50 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            {creating ? 'Generating…' : 'Generate Key'}
          </button>
        </form>

        {/* Revealed key modal */}
        {revealedKey && (
          <div className="fixed inset-0 z-[300] bg-black/40 flex items-center justify-center p-4" onClick={() => setRevealedKey(null)}>
            <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="w-6 h-6 text-green-600" />
                <h3 className="text-lg font-bold text-slate-900">Key generated</h3>
              </div>
              <p className="text-xs text-slate-500 mb-4">
                Copy this key now — you won't be able to see it again. Name: <span className="font-bold text-slate-700">{revealedKey.name}</span>
              </p>
              <div className="relative">
                <code className="block w-full px-3 py-3 bg-slate-900 text-green-300 text-xs font-mono rounded-lg break-all pr-12">{revealedKey.key}</code>
                <button
                  onClick={handleCopyKey}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white transition-colors"
                  title="Copy secret"
                >
                  {copied ? <CopyCheck className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              {copied && <p className="text-xs text-green-600 mt-2">Copied to clipboard ✓</p>}
              <button
                onClick={() => setRevealedKey(null)}
                className="mt-5 w-full px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-semibold hover:bg-slate-800 transition-all"
              >
                Done
              </button>
            </div>
          </div>
        )}

        {/* Keys list */}
        {loading ? (
          <div className="py-16 flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
              <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Loading keys…</p>
            </div>
          </div>
        ) : keys.length === 0 ? (
          <div className="py-16 text-center border border-slate-100 rounded-xl bg-white">
            <Key className="w-14 h-14 text-slate-200 mx-auto mb-4" />
            <p className="text-sm text-slate-500 font-medium">No API keys yet</p>
            <p className="text-xs text-slate-400 mt-1">Generate your first key to authenticate integrations.</p>
          </div>
        ) : (
          <div className="border border-slate-100 rounded-xl bg-white divide-y divide-slate-100">
            {keys.map((key) => (
              <div key={key.id} className={cn('px-5 py-4 flex items-center gap-4', key.revoked && 'opacity-60')}>
                <div className={cn(
                  'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
                  key.revoked ? 'bg-slate-100 text-slate-400' : 'bg-amber-100 text-amber-600'
                )}>
                  <Key className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900 truncate">{key.name}</p>
                    {key.revoked && (
                      <span className="px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 text-[10px] font-bold uppercase tracking-wider">Revoked</span>
                    )}
                  </div>
                  <code className="text-xs text-slate-500 font-mono">{key.masked}</code>
                  <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Created {formatTime(key.createdAt)}
                    {key.lastUsedAt && ` · Last used ${formatTime(key.lastUsedAt)}`}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {!key.revoked && (
                    <button
                      onClick={() => handleRevoke(key.id)}
                      className="p-2 rounded-lg text-amber-600 hover:bg-amber-50 transition-colors"
                      title="Revoke"
                    >
                      <Ban className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(key.id)}
                    className="p-2 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
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
