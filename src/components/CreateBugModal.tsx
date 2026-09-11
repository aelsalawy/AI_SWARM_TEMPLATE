import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, X, Bug, Bot, ImagePlus } from 'lucide-react';
import { apiClient } from '../lib/api-client';
import { useProject } from '../lib/ProjectContext';
import { useToast } from './Toast';
import { useAuth } from '../contexts/AuthContext';
import type { Agent } from '../lib/types';

const STATUS_OPTIONS = ['Open', 'In Progress', 'Resolved', 'Closed'] as const;
const PRIORITY_OPTIONS = ['Low', 'Medium', 'High', 'Critical'] as const;

interface CreateBugModalProps {
  isOpen: boolean;
  onClose: () => void;
  agents?: any[];
}

export default function CreateBugModal({ isOpen, onClose, agents: agentsProp }: CreateBugModalProps) {
  const { projects, projectId } = useProject();
  const { user } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [sprints, setSprints] = useState<any[]>([]);
  const [releases, setReleases] = useState<any[]>([]);
  const [releaseCustom, setReleaseCustom] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    priority: 'Medium' as string,
    status: 'Open' as string,
    sprintId: '' as string,
    release: '' as string,
    assignedAgentId: '',
    skills: '',
    projectId: projectId || '',
  });
  const [attachments, setAttachments] = useState<{ preview: string; data: string; filename: string; mimeType: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch agents + sprints when modal opens so the dropdowns are populated
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    apiClient.agents.list()
      .then(list => {
        if (!cancelled) setAgents(list);
      })
      .catch(() => {/* silently ignore — dropdown stays empty */});
    apiClient.sprints.list(projectId || undefined)
      .then(list => {
        if (!cancelled) setSprints(list);
      })
      .catch(() => {/* silently ignore — dropdown stays empty */});
    apiClient.releases.list(formData.projectId || undefined)
      .then(list => {
        if (!cancelled) setReleases(list);
      })
      .catch(() => {/* silently ignore — dropdown stays empty */});
    if (!isOpen) setReleaseCustom(false);
    return () => { cancelled = true; };
  }, [isOpen, formData.projectId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    try {
      // 1. Create the Bug via API (Local DB)
      const { skills: skillsRaw, ...bugFields } = formData;
      const tags = skillsRaw.split(',').map(s => s.trim()).filter(Boolean);
      const bug = await apiClient.bugs.create({
        ...bugFields,
        tags,
        ownerId: user?.id || 'unknown',
      });

      // 2. Upload attachments via API
      for (const att of attachments) {
        try {
          await apiClient.bugs.addAttachment(bug.id, {
            data: att.data,
            filename: att.filename,
            mimeType: att.mimeType,
            uploadedBy: user?.id || 'unknown',
          });
        } catch (attErr) {
          console.error('Failed to upload attachment:', attErr);
        }
      }

      // 3. Auto-trigger the assigned agent if one was selected
      if (bug.assignedAgentId) {
        try {
          const triggerResult = await apiClient.agentTrigger.triggerAgent({
            agentId: bug.assignedAgentId,
            taskType: 'bug',
            itemId: bug.id,
            title: bug.title,
            description: bug.description || 'No description',
            priority: bug.priority || 'Medium',
          });
          
          if (triggerResult.success) {
            toast.success(`Agent assigned and triggered! ${triggerResult.message}`);
          } else {
            toast.success('Bug created (agent trigger failed)', {
              detail: triggerResult.message || 'Agent may need manual assignment'
            });
          }
        } catch (triggerError) {
          console.error('Failed to trigger agent:', triggerError);
          toast.success('Bug created (agent trigger failed)', {
            detail: 'You can trigger the agent manually from the bug details'
          });
        }
      } else {
        toast.success('Bug reported successfully');
      }

      onClose();
      setFormData({ title: '', description: '', priority: 'Medium', status: 'Open', sprintId: '', release: '', assignedAgentId: '', skills: '', projectId: projectId || '' });
      setAttachments([]);
    } catch (error: any) {
      console.error('Failed to create bug:', error);
      toast.error(error.message || 'Failed to create bug');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-200"
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div className="flex items-center gap-2">
                <Bug className="w-5 h-5 text-red-500" />
                <h3 className="font-display font-bold text-slate-900">Report Bug</h3>
              </div>
              <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-lg text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Title */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Title</label>
                <input
                  required
                  value={formData.title}
                  onChange={e => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
                  placeholder="Bug title..."
                />
              </div>

              {/* Description */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none resize-none"
                  placeholder="Steps to reproduce, expected vs actual behavior..."
                />
              </div>

              {/* Priority + Status */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Priority</label>
                  <select
                    value={formData.priority}
                    onChange={e => setFormData({ ...formData, priority: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none appearance-none"
                  >
                    {PRIORITY_OPTIONS.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Status</label>
                  <select
                    value={formData.status}
                    onChange={e => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none appearance-none"
                  >
                    {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              {/* Project Selector */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Project</label>
                <select
                  value={formData.projectId}
                  onChange={e => { setReleaseCustom(false); setFormData({ ...formData, projectId: e.target.value, sprintId: '', release: '' }); }}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none appearance-none"
                >
                  <option value="">No Project</option>
                  {projects.map(project => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Skills (comma-separated tags) */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Skills</label>
                <input
                  value={formData.skills}
                  onChange={e => setFormData({ ...formData, skills: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
                  placeholder="e.g. prisma, react, qa — helps route assignment"
                />
              </div>

              {/* Assigned Agent - Made more visible */}
              <div className="space-y-2 bg-blue-50 p-4 rounded-xl border border-blue-100">
                <label className="flex items-center gap-2 text-xs font-bold text-blue-700 uppercase tracking-widest">
                  <Bot className="w-3.5 h-3.5" />
                  Assigned Agent
                </label>
                <select
                  value={formData.assignedAgentId}
                  onChange={e => setFormData({ ...formData, assignedAgentId: e.target.value })}
                  className="w-full px-4 py-3 bg-white border border-blue-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none appearance-none font-medium"
                >
                  <option value="">Unassigned</option>
                  {agents.map(agent => (
                    <option key={agent.id} value={agent.id}>
                      {agent.emoji} {agent.name} ({agent.role})
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-blue-600">Select an agent to auto-trigger when bug is created</p>
              </div>

              {/* Sprint + Release */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Sprint</label>
                  <select
                    value={formData.sprintId}
                    onChange={e => setFormData({ ...formData, sprintId: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
                  >
                    <option value="">No sprint</option>
                    {sprints.map((s: any) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Release</label>
                  {releaseCustom ? (
                    <div className="flex gap-2">
                      <input
                        value={formData.release}
                        onChange={e => setFormData({ ...formData, release: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
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
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
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

              {/* Image Attachments */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Screenshots</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  multiple
                  className="hidden"
                  onChange={e => {
                    const files = e.target.files;
                    if (!files) return;
                    Array.from(files).forEach(file => {
                      if (file.size > 5 * 1024 * 1024) return; // skip >5MB
                      const reader = new FileReader();
                      reader.onload = () => {
                        const result = reader.result as string;
                        const base64 = result.split(',')[1] || result;
                        setAttachments(prev => [...prev, {
                          preview: result,
                          data: base64,
                          filename: file.name,
                          mimeType: file.type,
                        }]);
                      };
                      reader.readAsDataURL(file);
                    });
                    e.target.value = '';
                  }}
                />
                <div className="flex flex-wrap gap-2">
                  {attachments.map((att, idx) => (
                    <div key={idx} className="relative group w-20 h-20 rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
                      <img src={att.preview} alt={att.filename} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))}
                        className="absolute top-0.5 right-0.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-20 h-20 rounded-lg border-2 border-dashed border-slate-200 flex flex-col items-center justify-center gap-1 hover:border-blue-400 hover:bg-blue-50/30 transition-colors"
                  >
                    <ImagePlus className="w-5 h-5 text-slate-400" />
                    <span className="text-[8px] text-slate-400 font-bold">ADD</span>
                  </button>
                </div>
              </div>

              {/* Actions */}
              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-slate-800 transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loading ? 'Submitting...' : (
                    <>
                      <Plus className="w-4 h-4" />
                      Create Bug
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
