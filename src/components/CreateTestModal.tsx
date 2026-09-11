import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Plus, TestTube2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../lib/api-client';
import type { Agent, Requirement, Bug } from '../lib/types';
import { useProject } from '../lib/ProjectContext';

interface CreateTestModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const TEST_TYPES = ['Unit', 'Integration', 'E2E', 'Stress'] as const;
const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'] as const;

export default function CreateTestModal({ isOpen, onClose }: CreateTestModalProps) {
  const { projectId } = useProject();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [bugs, setBugs] = useState<Bug[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    agentGroup: '',
    testType: 'Unit' as string,
    priority: 'Medium' as string,
    description: '',
    requirementId: '' as string,
    bugId: '' as string,
    assignedAgentId: '' as string,
  });

  // Fetch agents, requirements, bugs
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    if (!user) return;

    const userId = user?.id || user?.uid || 'unknown';
    apiClient.agents.list().then(list => { if (!cancelled) setAgents(list); }).catch(() => {});
    apiClient.requirements.list().then(list => { if (!cancelled) setRequirements(list.filter(r => r.ownerId === userId)); }).catch(() => {});
    apiClient.bugs.list().then(list => { if (!cancelled) setBugs(list.filter(b => b.ownerId === userId)); }).catch(() => {});

    return () => { cancelled = true; };
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    try {
      const numericRunId = Math.floor(Math.random() * 9000 + 1000).toString();
      const userId = user?.id || user?.uid || 'unknown';
      
      const testData: Record<string, any> = {
        runId: numericRunId,
        name: formData.name,
        group: formData.agentGroup || 'Unassigned',
        testType: formData.testType,
        priority: formData.priority,
        description: formData.description,
        status: 'Pending',
        duration: '0m 0s',
        color: 'blue',
        projectId: projectId || '',
        ownerId: userId,
        createdBy: 'user:web',
      };

      if (formData.requirementId) {
        testData.requirementId = formData.requirementId;
        testData.requirementIds = [formData.requirementId];
      }
      if (formData.bugId) {
        testData.bugId = formData.bugId;
        testData.bugIds = [formData.bugId];
      }
      if (formData.assignedAgentId) {
        testData.assignedAgentId = formData.assignedAgentId;
      }
      
      await apiClient.testRuns.create(testData);
      onClose();
      setFormData({ name: '', agentGroup: '', testType: 'Unit', priority: 'Medium', description: '', requirementId: '', bugId: '', assignedAgentId: '' });
    } catch (error) {
      console.error('Failed to create test run:', error);
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
            className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-200 max-h-[90vh] flex flex-col"
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 flex-shrink-0">
              <div className="flex items-center gap-2">
                <TestTube2 className="w-5 h-5 text-blue-600" />
                <h3 className="font-display font-bold text-slate-900">Create Test Run</h3>
              </div>
              <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-lg text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
              {/* Test Name */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Test Name</label>
                <input
                  required
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
                  placeholder="e.g. Auth service load test..."
                />
              </div>

              {/* Agent Group + Test Type */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Assign Agent</label>
                  <select
                    value={formData.assignedAgentId}
                    onChange={e => {
                      const agent = agents.find(a => a.id === e.target.value);
                      setFormData({ ...formData, assignedAgentId: e.target.value, agentGroup: agent ? agent.name : '' });
                    }}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none appearance-none"
                  >
                    <option value="">Select agent...</option>
                    {agents.map(agent => (
                      <option key={agent.id} value={agent.id}>
                        {agent.emoji} {agent.name} ({agent.role})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Test Type</label>
                  <select
                    value={formData.testType}
                    onChange={e => setFormData({ ...formData, testType: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none appearance-none"
                  >
                    {TEST_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              {/* Priority */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Priority</label>
                <select
                  value={formData.priority}
                  onChange={e => setFormData({ ...formData, priority: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none appearance-none"
                >
                  {PRIORITIES.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>

              {/* Description */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none resize-none"
                  placeholder="Describe the test scenario and expected outcomes..."
                />
              </div>

              {/* Linked Requirement */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Linked Requirement</label>
                <select
                  value={formData.requirementId}
                  onChange={e => setFormData({ ...formData, requirementId: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none appearance-none"
                >
                  <option value="">No requirement linked</option>
                  {requirements.map(req => (
                    <option key={req.id} value={req.id}>{req.title} ({req.status || 'Pending'})</option>
                  ))}
                </select>
              </div>

              {/* Linked Bug */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Linked Bug</label>
                <select
                  value={formData.bugId}
                  onChange={e => setFormData({ ...formData, bugId: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none appearance-none"
                >
                  <option value="">No bug linked</option>
                  {bugs.map(bug => (
                    <option key={bug.id} value={bug.id}>{bug.title} ({bug.status})</option>
                  ))}
                </select>
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
                      Create Test
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
