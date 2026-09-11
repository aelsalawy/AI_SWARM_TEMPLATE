import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Plus, Bot } from 'lucide-react';
import apiClient from '../lib/api-client';
import { useAuth } from '../contexts/AuthContext';
import { useProject } from '../lib/ProjectContext';
import { useToast } from './Toast';
import type { Agent } from '../lib/types';

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CreateTaskModal({ isOpen, onClose }: CreateTaskModalProps) {
  const { user } = useAuth();
  const { projectId } = useProject();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [sprints, setSprints] = useState<any[]>([]);
  const [releases, setReleases] = useState<any[]>([]);
  const [releaseCustom, setReleaseCustom] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    priority: 'Medium',
    status: 'To Do',
    epic: '',
    sprintId: '' as string,
    release: '' as string,
    assignedAgentId: null as string | null
  });

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
    apiClient.releases.list(projectId || undefined)
      .then(list => {
        if (!cancelled) setReleases(list);
      })
      .catch(() => {/* silently ignore — dropdown stays empty */});
    return () => { cancelled = true; };
  }, [isOpen, projectId]);

  // Drop out of custom-release entry mode whenever the modal closes
  useEffect(() => {
    if (!isOpen) setReleaseCustom(false);
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    try {
      const task = await apiClient.tasks.create({
        title: formData.title,
        description: formData.description,
        priority: formData.priority,
        status: formData.status,
        epic: formData.epic,
        sprintId: formData.sprintId || undefined,
        release: formData.release?.trim() ? formData.release.trim() : undefined,
        assignedAgentId: selectedAgentId || undefined,
        createdBy: 'user:web',
        ownerId: user?.id || 'unknown',
      } as any);

      // Auto-trigger the assigned agent if one was selected
      if (task.assignedAgentId) {
        try {
          const triggerResult = await apiClient.agentTrigger.triggerAgent({
            agentId: task.assignedAgentId,
            taskType: 'task',
            itemId: task.id,
            title: task.title,
            description: task.description || 'No description',
            priority: task.priority || 'Medium',
          });
          
          if (triggerResult.success) {
            toast.success(`Task deployed and agent triggered! ${triggerResult.message}`);
          } else {
            toast.success('Task created (agent trigger failed)', {
              detail: triggerResult.message || 'Agent may need manual assignment'
            });
          }
        } catch (triggerError) {
          console.error('Failed to trigger agent:', triggerError);
          toast.success('Task created (agent trigger failed)', {
            detail: 'You can trigger the agent manually from the task details'
          });
        }
      } else {
        toast.success('Task created successfully');
      }

      onClose();
      setSelectedAgentId(null);
      setFormData({ title: '', description: '', priority: 'Medium', status: 'To Do', epic: '', sprintId: '', release: '', assignedAgentId: null });
    } catch (error: any) {
      console.error('Error creating task:', error);
      toast.error(error.message || 'Failed to create task. Please try again.');
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
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-blue-600" />
                <h3 className="font-display font-bold text-slate-900">Create Swarm Task</h3>
              </div>
              <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-lg text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Objective Title</label>
                <input 
                  required
                  value={formData.title}
                  onChange={e => setFormData({...formData, title: e.target.value})}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none" 
                  placeholder="e.g. Implement distributed consensus..."
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Context & Instruction</label>
                <textarea 
                  value={formData.description}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                  rows={3}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none resize-none" 
                  placeholder="Describe the technical requirements for the agents..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Strategic Epic</label>
                  <input 
                    value={formData.epic}
                    onChange={e => setFormData({...formData, epic: e.target.value})}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none" 
                    placeholder="e.g. Swarm V3 Core"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Priority Level</label>
                  <select 
                    value={formData.priority}
                    onChange={e => setFormData({...formData, priority: e.target.value})}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none appearance-none"
                  >
                    <option>Low</option>
                    <option>Medium</option>
                    <option>High</option>
                    <option>Urgent</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Assign Agent</label>
                  <select 
                    value={selectedAgentId || ''}
                    onChange={(e) => setSelectedAgentId(e.target.value || null)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none appearance-none"
                  >
                    <option value="">No assignment</option>
                    {agents.map(agent => (
                      <option key={agent.id} value={agent.id}>
                        {agent.emoji} {agent.name} ({agent.role})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Sprint</label>
                  <select 
                    value={formData.sprintId}
                    onChange={e => setFormData({...formData, sprintId: e.target.value})}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none appearance-none"
                  >
                    <option value="">No sprint</option>
                    {sprints.map((s: any) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Release</label>
                  {releaseCustom ? (
                    <div className="flex gap-2">
                      <input
                        value={formData.release}
                        onChange={e => setFormData({...formData, release: e.target.value})}
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
                        placeholder="e.g. R1.2"
                        autoFocus
                      />
                      <button type="button" onClick={() => { setReleaseCustom(false); setFormData({...formData, release: ''}); }} className="px-3 border border-slate-200 rounded-xl text-slate-400 hover:bg-slate-50 text-sm" title="Back to dropdown">✕</button>
                    </div>
                  ) : (
                    <select
                      value={formData.release || '__none__'}
                      onChange={e => {
                        const v = e.target.value;
                        if (v === '__custom__') { setReleaseCustom(true); setFormData({...formData, release: ''}); }
                        else setFormData({...formData, release: v === '__none__' ? '' : v});
                      }}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
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
                  {loading ? 'Initializing...' : (
                    <>
                      <Plus className="w-4 h-4" />
                      Deploy Task
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
