import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, FileText } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../lib/api-client';
import { useProject } from '../lib/ProjectContext';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function CreateRequirementModal({ isOpen, onClose }: Props) {
  const { projectId } = useProject();
  const { user } = useAuth();
  const [sprints, setSprints] = useState<any[]>([]);
  const [releases, setReleases] = useState<any[]>([]);
  const [releaseCustom, setReleaseCustom] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    priority: 'Medium',
    status: 'Pending',
    type: 'Functional',
    sprintId: '' as string,
    release: '' as string
  });
  const [loading, setLoading] = useState(false);

  // Fetch sprints when modal opens so the sprint dropdown is populated
  React.useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    apiClient.sprints.list(projectId || undefined)
      .then(list => { if (!cancelled) setSprints(list); })
      .catch(() => {/* silently ignore — dropdown stays empty */});
    apiClient.releases.list(projectId || undefined)
      .then(list => { if (!cancelled) setReleases(list); })
      .catch(() => {/* silently ignore — dropdown stays empty */});
    return () => { cancelled = true; };
  }, [isOpen, projectId]);

  // Drop out of custom-release entry mode whenever the modal closes
  React.useEffect(() => {
    if (!isOpen) setReleaseCustom(false);
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) return;
    if (!user) return;

    setLoading(true);
    try {
      // Strip UI-only fields not in DB schema (type has no column — would 500 in Prisma)
      const { type: _type, ...reqData } = formData;
      await apiClient.requirements.create({
        ...reqData,
        release: formData.release?.trim() ? formData.release.trim() : undefined,
        ownerId: user?.id || 'unknown',
        projectId: projectId || null,
        createdBy: 'user:web',
      });
      setFormData({ title: '', description: '', priority: 'Medium', status: 'Pending', type: 'Functional', sprintId: '', release: '' });
      onClose();
    } catch (err) {
      console.error('Failed to create requirement:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-[200]"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 z-[201] flex items-center justify-center p-4"
          >
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between p-5 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-600" />
                  <h2 className="text-lg font-bold text-slate-900">New Requirement</h2>
                </div>
                <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg">
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-5 space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Title *</label>
                  <input
                    value={formData.title}
                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                    className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 outline-none"
                    placeholder="Requirement title"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                    className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm min-h-[80px] focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 outline-none"
                    placeholder="Detailed requirement description"
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Priority</label>
                    <select
                      value={formData.priority}
                      onChange={e => setFormData({ ...formData, priority: e.target.value })}
                      className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    >
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                      <option value="Urgent">Urgent</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Status</label>
                    <select
                      value={formData.status}
                      onChange={e => setFormData({ ...formData, status: e.target.value })}
                      className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    >
                      <option value="Pending">Pending</option>
                      {/* NOTE: RequirementStatus enum is {Pending, Verified} only —
                          'In Progress' is NOT a valid value and would cause a Prisma 500. */}
                      <option value="Verified">Verified</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Type</label>
                    <select
                      value={formData.type}
                      onChange={e => setFormData({ ...formData, type: e.target.value })}
                      className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    >
                      <option value="Functional">Functional</option>
                      <option value="Non-Functional">Non-Functional</option>
                      <option value="Constraint">Constraint</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Sprint</label>
                    <select
                      value={formData.sprintId}
                      onChange={e => setFormData({ ...formData, sprintId: e.target.value })}
                      className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    >
                      <option value="">No sprint</option>
                      {sprints.map((s: any) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Release</label>
                    {releaseCustom ? (
                      <div className="flex gap-2 mt-1">
                        <input
                          value={formData.release}
                          onChange={e => setFormData({ ...formData, release: e.target.value })}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                          placeholder="e.g. R1.2"
                          autoFocus
                        />
                        <button type="button" onClick={() => { setReleaseCustom(false); setFormData({ ...formData, release: '' }); }} className="px-3 border border-slate-200 rounded-lg text-slate-400 hover:bg-slate-50 text-sm" title="Back to dropdown">✕</button>
                      </div>
                    ) : (
                      <select
                        value={formData.release || '__none__'}
                        onChange={e => {
                          const v = e.target.value;
                          if (v === '__custom__') { setReleaseCustom(true); setFormData({ ...formData, release: '' }); }
                          else setFormData({ ...formData, release: v === '__none__' ? '' : v });
                        }}
                        className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm"
                      >
                        <option value="__none__">No release</option>
                        {Array.from(new Set([...releases.map((r: any) => r.name), ...(formData.release ? [formData.release] : [])])).map(name => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                        <option value="__custom__">+ Custom…</option>
                      </select>
                    )}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading || !formData.title.trim()}
                    className="px-4 py-2 text-sm font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {loading ? 'Creating...' : 'Create Requirement'}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
