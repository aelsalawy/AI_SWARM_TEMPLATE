import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Rocket, Bot, CheckCircle2, AlertCircle, Loader2, ListChecks, FlaskConical } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../lib/api-client';

interface DeployModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SwarmSummary {
  agentsOnline: number;
  agentsTotal: number;
  tasksPending: number;
  tasksInProgress: number;
  tasksDone: number;
  testPassRate: number;
  totalTests: number;
}

type DeployState = 'loading' | 'ready' | 'deploying' | 'success' | 'error';

export default function DeployModal({ isOpen, onClose }: DeployModalProps) {
  const [summary, setSummary] = useState<SwarmSummary>({
    agentsOnline: 0,
    agentsTotal: 0,
    tasksPending: 0,
    tasksInProgress: 0,
    tasksDone: 0,
    testPassRate: 0,
    totalTests: 0,
  });
  const [state, setState] = useState<DeployState>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [deployResult, setDeployResult] = useState<{
    tasksTriggered: number;
    agentsInvolved: string[];
    deploymentId?: string;
  } | null>(null);
  const { user } = useAuth();

  // Fetch swarm data when modal opens
  useEffect(() => {
    if (!isOpen) {
      setState('loading');
      return;
    }

    let cancelled = false;

    async function loadSummary() {
      try {
        const userId = user?.uid;
        const [agents, allTasks, allTestRuns] = await Promise.all([
          apiClient.agents.list(),
          apiClient.tasks.list(),
          apiClient.testRuns.list(),
        ]);

        if (cancelled) return;

        // Filter by owner client-side
        let tasks = allTasks;
        let testRuns = allTestRuns;
        if (userId) {
          tasks = allTasks.filter((t: any) => t.ownerId === userId);
          testRuns = allTestRuns.filter((r: any) => r.ownerId === userId);
        }

        const agentsOnline = agents.filter(
          (a: any) => a.status === 'online' || a.status === 'busy'
        ).length;

        const tasksPending = tasks.filter((t: any) => t.status === 'To Do').length;
        const tasksInProgress = tasks.filter((t: any) => t.status === 'In Progress').length;
        const tasksDone = tasks.filter((t: any) => t.status === 'Done').length;

        const totalTests = testRuns.length;
        const passedTests = testRuns.filter((t: any) => t.status === 'Passed').length;
        const testPassRate = totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 0;

        setSummary({
          agentsOnline,
          agentsTotal: agents.length,
          tasksPending,
          tasksInProgress,
          tasksDone,
          testPassRate,
          totalTests,
        });
        setState('ready');
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load swarm summary:', err);
          setErrorMsg('Failed to load swarm status. Check your connection.');
          setState('error');
        }
      }
    }

    loadSummary();
    return () => { cancelled = true; };
  }, [isOpen]);

  const handleDeploy = async () => {
    if (!user) {
      setErrorMsg('You must be logged in to deploy.');
      setState('error');
      return;
    }

    setState('deploying');
    setDeployResult(null);

    try {
      // 1. Trigger the agents for pending tasks
      const agentsList = await apiClient.agentTrigger.listAgents();
      const allTasks = await apiClient.tasks.list();
      const pendingTasks = allTasks.filter((t: any) => t.status === 'To Do' || t.status === 'TODO');
      
      const agentsInvolved = new Set<string>();
      const triggerPromises = pendingTasks.map(async (task: any) => {
        const agentId = task.assignedAgentId || agentsList[0]?.id;
        if (agentId) {
          agentsInvolved.add(agentId.replace('agent:', ''));
        }
        try {
          const result = await apiClient.agentTrigger.triggerAgent({
            agentId,
            taskType: 'task',
            itemId: task.id,
            title: task.title,
            description: task.description,
            priority: task.priority
          });
          return { task, result, error: null };
        } catch (error) {
          return { task, result: null, error };
        }
      });
      
      const triggerResults = await Promise.all(triggerPromises);
      const successCount = triggerResults.filter(r => r.result?.success).length;
      const errorCount = triggerResults.filter(r => r.error || !r.result?.success).length;

      // 2. Create deployment record
      const userId = user?.id || user?.uid;
      if (!userId) {
        setErrorMsg('User ID not found. Please log in again.');
        setState('error');
        return;
      }

      const deploymentsApi = {
        create: async (data: any) => {
          const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3001') + '/api';
          const accessToken = localStorage.getItem('accessToken');
          const response = await fetch(`${API_BASE}/deployments`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {}),
            },
            body: JSON.stringify(data),
          });
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const errorMessage = errorData.message || `HTTP ${response.status}`;
            throw new Error(errorMessage);
          }
          return response.json();
        }
      };

      const deployment = await deploymentsApi.create({
        status: 'triggered',
        triggeredBy: userId,
        summary: {
          agentsOnline: summary.agentsOnline,
          agentsTotal: summary.agentsTotal,
          tasksPending: summary.tasksPending,
          tasksInProgress: summary.tasksInProgress,
          tasksDone: summary.tasksDone,
          testPassRate: summary.testPassRate,
          totalTests: summary.totalTests,
          triggeredTasks: pendingTasks.length,
          successCount,
          errorCount,
          agentsInvolved: Array.from(agentsInvolved),
        },
      });

      // Store result for display
      setDeployResult({
        tasksTriggered: pendingTasks.length,
        agentsInvolved: Array.from(agentsInvolved),
        deploymentId: deployment.id,
      });
      
      setState('success');
    } catch (err) {
      console.error('Deploy failed:', err);
      setErrorMsg(err instanceof Error ? err.message : 'Deploy write failed.');
      setState('error');
    }
  };

  const handleClose = () => {
    onClose();
    // Reset state after close animation
    setTimeout(() => {
      setState('loading');
      setErrorMsg('');
      setDeployResult(null);
    }, 300);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-200"
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div className="flex items-center gap-2">
                <Rocket className="w-5 h-5 text-slate-900" />
                <h3 className="font-display font-bold text-slate-900">
                  Deploy Swarm
                </h3>
              </div>
              <button
                onClick={handleClose}
                className="p-1 hover:bg-slate-200 rounded-lg text-slate-400 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-5">
              {state === 'loading' && (
                <div className="flex flex-col items-center gap-4 py-8">
                  <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
                  <p className="text-sm text-slate-500 font-medium">
                    Loading swarm status...
                  </p>
                </div>
              )}

              {state === 'error' && (
                <div className="flex flex-col items-center gap-4 py-8">
                  <AlertCircle className="w-8 h-8 text-red-400" />
                  <p className="text-sm text-red-600 font-medium text-center">
                    {errorMsg || 'Something went wrong.'}
                  </p>
                </div>
              )}

              {state === 'success' && (
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="flex flex-col items-center gap-4 py-8"
                >
                  <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center">
                    <CheckCircle2 className="w-10 h-10 text-green-600" />
                  </div>
                  <div className="text-center px-4">
                    <p className="text-lg font-bold text-slate-900">
                      Deployment Triggered
                    </p>
                    <p className="text-sm text-slate-500 mt-1">
                      {deployResult?.tasksTriggered === 0 
                        ? 'No pending tasks found.'
                        : `Triggered ${deployResult?.tasksTriggered} pending task${deployResult?.tasksTriggered === 1 ? '' : 's'}`
                      }
                    </p>
                    {deployResult && deployResult.tasksTriggered > 0 && (
                      <div className="mt-4 space-y-2">
                        {deployResult.agentsInvolved.length > 0 && (
                          <div className="text-xs text-slate-600 bg-slate-50 px-3 py-2 rounded-lg">
                            <span className="font-semibold">Agents involved:</span> {deployResult.agentsInvolved.join(', ')}
                          </div>
                        )}
                        <div className="text-[10px] text-slate-400">
                          Monitor progress in the dashboard.
                        </div>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={handleClose}
                    className="mt-2 px-6 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-slate-800 transition-all shadow-lg"
                  >
                    Done
                  </button>
                </motion.div>
              )}

              {(state === 'ready' || state === 'deploying') && (
                <>
                  {/* Swarm Summary */}
                  <div className="space-y-3">
                    {/* Agents */}
                    <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <div className="p-2 bg-blue-50 rounded-lg">
                        <Bot className="w-4 h-4 text-blue-600" />
                      </div>
                      <div className="flex-1">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          Agents
                        </p>
                        <p className="text-sm font-bold text-slate-900">
                          {summary.agentsOnline} online /{' '}
                          {summary.agentsTotal} total
                        </p>
                      </div>
                      <div
                        className={`w-2.5 h-2.5 rounded-full ${
                          summary.agentsOnline > 0
                            ? 'bg-green-500'
                            : 'bg-slate-300'
                        }`}
                      />
                    </div>

                    {/* Tasks */}
                    <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <div className="p-2 bg-indigo-50 rounded-lg">
                        <ListChecks className="w-4 h-4 text-indigo-600" />
                      </div>
                      <div className="flex-1">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          Tasks
                        </p>
                        <p className="text-sm font-bold text-slate-900">
                          {summary.tasksPending} pending ·{' '}
                          {summary.tasksInProgress} in progress ·{' '}
                          {summary.tasksDone} done
                        </p>
                      </div>
                    </div>

                    {/* Test Pass Rate */}
                    <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <div className="p-2 bg-teal-50 rounded-lg">
                        <FlaskConical className="w-4 h-4 text-teal-600" />
                      </div>
                      <div className="flex-1">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          Test Pass Rate
                        </p>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-slate-900">
                            {summary.testPassRate}%
                          </p>
                          <span className="text-[10px] text-slate-400">
                            ({summary.totalTests} runs)
                          </span>
                        </div>
                      </div>
                      {/* Mini progress bar */}
                      <div className="w-16 bg-slate-200 h-1.5 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{
                            width: `${summary.testPassRate}%`,
                          }}
                          transition={{ duration: 0.6, ease: 'easeOut' }}
                          className={`h-full rounded-full ${
                            summary.testPassRate >= 80
                              ? 'bg-green-500'
                              : summary.testPassRate >= 50
                              ? 'bg-amber-500'
                              : 'bg-red-500'
                          }`}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-2 flex gap-3">
                    <button
                      type="button"
                      onClick={handleClose}
                      disabled={state === 'deploying'}
                      className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-all disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleDeploy}
                      disabled={state === 'deploying'}
                      className="flex-1 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-slate-800 transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {state === 'deploying' ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Deploying...
                        </>
                      ) : (
                        <>
                          <Rocket className="w-4 h-4" />
                          Confirm Deploy
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
