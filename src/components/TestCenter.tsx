import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'motion/react';
import { 
  History, 
  Download, 
  Filter, 
  Terminal, 
  ChevronRight, 
  Timer, 
  Cpu, 
  CircleCheck,
  Play,
  RefreshCw,
  X,
  Trash2,
  CalendarRange,
  TrendingUp,
  Target,
  Layers
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { searchNav } from '../lib/search-nav';
import apiClient from '../lib/api-client';
import { useProject } from '../lib/ProjectContext';
import type { TestRun, Sprint } from '../lib/types';

// Status filter options
const STATUS_FILTERS = ['Passed', 'Failed', 'Skipped', 'Pending'] as const;
type RunStatus = typeof STATUS_FILTERS[number];

/** Resolve a Firestore-like createdAt into a Date, or null. */
function resolveDate(v: unknown): Date | null {
  if (!v) return null;
  if (typeof (v as any).toDate === 'function') return (v as any).toDate();
  if (v instanceof Date) return v;
  return null;
}

export default function TestCenter() {
  const { isAuthenticated, user } = useAuth();
  const { projectId } = useProject();
  const [runs, setRuns] = useState<TestRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [showAllRuns, setShowAllRuns] = useState(false);
  const [activeFilters, setActiveFilters] = useState<Set<RunStatus>>(
    new Set(STATUS_FILTERS)
  );

  // Sprint-based test plans (P1-6)
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [expandedSprintId, setExpandedSprintId] = useState<string | null>(null);
  const [trendView, setTrendView] = useState<'sprint' | 'day'>('sprint');

  // Subscribe to search navigation events
  useEffect(() => {
    const unsub = searchNav.subscribe((payload) => {
      if (payload.type === 'run') {
        setExpandedRunId(payload.id);
      }
    });
    return () => unsub();
  }, []);

  // Load requirements, bugs & agents for linking
  const [allRequirements, setAllRequirements] = useState<any[]>([]);
  const [allBugs, setAllBugs] = useState<any[]>([]);
  const [allAgents, setAllAgents] = useState<any[]>([]);

  useEffect(() => {
    if (isAuthenticated) {
      apiClient.requirements.list().then(setAllRequirements).catch(() => {});
      apiClient.bugs.list().then(setAllBugs).catch(() => {});
      apiClient.agents.list().then(setAllAgents).catch(() => {});
      apiClient.sprints.list(projectId || undefined).then(setSprints).catch(() => {});
    } else {
      setAllRequirements([]);
      setAllBugs([]);
      setAllAgents([]);
      setSprints([]);
    }
  }, [isAuthenticated, projectId]);

  const [editingRunLinks, setEditingRunLinks] = useState<string | null>(null);

  const updateRunLink = async (runId: string, field: string, value: string) => {
    const update: Record<string, any> = { [field]: value };
    if (field === 'requirementId') update.requirementIds = value ? [value] : [];
    if (field === 'bugId') update.bugIds = value ? [value] : [];
    if (field === 'assignedAgentId') {
      const agent = allAgents.find(a => a.id === value);
      update.group = agent ? agent.name : '';
    }
    try {
      await apiClient.testRuns.update(runId, update);
    } catch (err) {
      console.error('Failed to update link:', err);
    }
  };

  const deleteRun = async (runId: string) => {
    if (!confirm('Delete this test run? This cannot be undone.')) return;
    try {
      await apiClient.testRuns.delete(runId);
      if (expandedRunId === runId) setExpandedRunId(null);
    } catch (err) {
      console.error('Failed to delete run:', err);
    }
  };

  // Toggle a status filter on/off
  const toggleFilter = useCallback((status: RunStatus) => {
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(status)) {
        // Don't allow deselecting all filters — if this is the last one, skip
        if (next.size === 1) return prev;
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  }, []);

  // Filtered runs based on active filters, project filter, and show-all toggle
  // Using IIFE (not useMemo) to ensure projectId changes always trigger re-computation
  const filteredRuns = (() => {
    let byProject = runs;
    if (projectId) {
      byProject = runs.filter(run => !run.projectId || run.projectId === projectId);
    }
    const byStatus = byProject.filter(run => activeFilters.has(run.status as RunStatus));
    return showAllRuns ? byStatus : byStatus.slice(0, 10);
  })();

  // ---- P1-6: Pass-rate trend computation ----
  // Group runs by sprint (via sprintId field if present, else by date bucket)
  const passRateTrend = useMemo(() => {
    const buckets: { label: string; total: number; passed: number; failed: number; skipped: number }[] = [];
    const bucketMap = new Map<string, typeof buckets[number]>();

    const addToBucket = (label: string, run: TestRun) => {
      let b = bucketMap.get(label);
      if (!b) {
        b = { label, total: 0, passed: 0, failed: 0, skipped: 0 };
        bucketMap.set(label, b);
        buckets.push(b);
      }
      b.total += 1;
      if (run.status === 'Passed') b.passed += 1;
      else if (run.status === 'Failed') b.failed += 1;
      else b.skipped += 1;
    };

    if (trendView === 'sprint') {
      // Bucket by sprint name when a run references a sprint, else 'Unplanned'
      const sprintById = new Map(sprints.map(s => [s.id, s.name]));
      for (const run of runs) {
        if (projectId && run.projectId && run.projectId !== projectId) continue;
        const sprintId = (run as any).sprintId as string | undefined;
        const label = sprintId && sprintById.get(sprintId) ? sprintById.get(sprintId)! : 'Unplanned';
        addToBucket(label, run);
      }
    } else {
      // Bucket by calendar day
      for (const run of runs) {
        if (projectId && run.projectId && run.projectId !== projectId) continue;
        const ts = resolveDate(run.createdAt);
        const label = ts ? ts.toISOString().slice(0, 10) : 'Unknown';
        addToBucket(label, run);
      }
      // Sort chronologically
      buckets.sort((a, b) => a.label.localeCompare(b.label));
    }

    return buckets.map(b => ({
      ...b,
      passRate: b.total > 0 ? Math.round((b.passed / b.total) * 100) : 0,
    }));
  }, [runs, sprints, projectId, trendView]);

  // Overall pass rate across the current project's runs
  const overallPassRate = useMemo(() => {
    const relevant = runs.filter(r => !projectId || !r.projectId || r.projectId === projectId);
    const passed = relevant.filter(r => r.status === 'Passed').length;
    return relevant.length > 0 ? Math.round((passed / relevant.length) * 100) : 0;
  }, [runs, projectId]);

  // Test plans per sprint: map each sprint to its runs
  const sprintPlans = useMemo(() => {
    return sprints.map(sprint => {
      const sprintRuns = runs.filter(r =>
        (r as any).sprintId === sprint.id ||
        (!(r as any).sprintId && !projectId)
      );
      const passed = sprintRuns.filter(r => r.status === 'Passed').length;
      const failed = sprintRuns.filter(r => r.status === 'Failed').length;
      const skipped = sprintRuns.filter(r => r.status === 'Skipped' || r.status === 'Pending').length;
      return {
        sprint,
        runs: sprintRuns,
        passed,
        failed,
        skipped,
        total: sprintRuns.length,
        passRate: sprintRuns.length > 0 ? Math.round((passed / sprintRuns.length) * 100) : 0,
      };
    });
  }, [sprints, runs, projectId]);

  // Parse duration string like "5m 30s" to milliseconds
  const parseDurationToMs = (dur: string | undefined): number => {
    if (!dur) return 0;
    let ms = 0;
    const minMatch = dur.match(/(\d+)m/);
    const secMatch = dur.match(/(\d+)s/);
    if (minMatch) ms += parseInt(minMatch[1], 10) * 60 * 1000;
    if (secMatch) ms += parseInt(secMatch[1], 10) * 1000;
    return ms;
  };

  // CSV Export handler
  const exportCSV = useCallback(() => {
    const rows = filteredRuns;
    if (rows.length === 0) return;

    const header = 'Run ID,Test Type,Agent Group,Status,Duration (ms),Timestamp,Description';
    const csvRows = rows.map(run => {
      const runId = run.runId || '';
      const testType = 'Swarm Integration';
      const group = run.group || '';
      const status = run.status || '';
      const durationMs = parseDurationToMs(run.duration);
      let timestamp = '';
      const ts = resolveDate(run.createdAt);
      if (ts) {
        timestamp = ts.toISOString();
      } else if (run.createdAt) {
        timestamp = new Date(run.createdAt as Date).toISOString();
      }
      const description = `Automated test run for ${group} — ${
        status === 'Passed' ? 'all assertions passed' : 
        status === 'Failed' ? 'one or more assertions failed' : 
        'run was skipped'
      }`;

      // Escape fields containing commas
      const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
      return [runId, testType, escape(group), status, durationMs, timestamp, escape(description)].join(',');
    });

    const csv = [header, ...csvRows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const today = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `test-runs-${today}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [filteredRuns]);

  const initiateRun = async () => {
    setCreating(true);
    try {
      const groups = ['Neural-Swarm-B', 'Core-Orchestrator', 'Edge-Relay-Node', 'Auth-Service-V2'];
      const allStatuses = ['Passed', 'Failed', 'Skipped'];
      const allColors: Record<string, string> = { Passed: 'blue', Failed: 'purple', Skipped: 'amber' };
      const groupIdx = Math.floor(Math.random() * groups.length);
      const statusIdx = Math.floor(Math.random() * allStatuses.length);
      const status = allStatuses[statusIdx];
      
      if (!user) return;
      await apiClient.testRuns.create({
        runId: Math.floor(Math.random() * 9000 + 1000).toString(),
        group: groups[groupIdx],
        duration: `${Math.floor(Math.random() * 10 + 1)}m ${Math.floor(Math.random() * 60)}s`,
        status,
        color: allColors[status],
        projectId: projectId || '',
        ownerId: user.id,
        createdBy: 'user:web',
      });
    } catch (err) {
      console.error(err);
    } finally {
      setCreating(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    
    if (isMounted && isAuthenticated && user) {
      apiClient.testRuns.list().then((runsData) => {
        if (!isMounted) return;
        // Filter by owner manually since apiClient might not support it
        const filtered = runsData.filter(r => r.ownerId === user.id);
          setRuns(filtered);
          setLoading(false);
        }).catch((error) => {
          if (!isMounted) return;
          console.error('Runs query error:', error);
          setLoading(false);
        });
        // Poll every 10 seconds for new data
        const interval = setInterval(() => {
          if (!isMounted) return;
          apiClient.testRuns.list().then((runsData) => {
            if (!isMounted) return;
            const filtered = runsData.filter(r => r.ownerId === user.id);
            setRuns(filtered);
          }).catch(() => {});
        }, 10000);
        return () => clearInterval(interval);
      } else if (isMounted) {
        setRuns([]);
        setLoading(false);
      }

    return () => {
      isMounted = false;
    };
  }, [isAuthenticated, user]);

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="h-full overflow-y-auto"
    >
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      {/* P1-6: Pass-Rate Trends + Test Plans per Sprint */}
      <div className="grid grid-cols-12 gap-6">
        {/* Pass-Rate Trend Chart */}
        <div className="col-span-12 lg:col-span-7 glass-panel rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-sm">
          <div className="px-4 sm:px-6 py-4 border-b border-slate-100 flex flex-wrap justify-between items-center gap-3 bg-white">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-600" />
              <h4 className="font-display text-base font-bold text-slate-900 uppercase tracking-tight">Pass-Rate Trends</h4>
            </div>
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
              <button
                onClick={() => setTrendView('sprint')}
                className={cn(
                  "px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all",
                  trendView === 'sprint' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                <span className="flex items-center gap-1"><CalendarRange className="w-3 h-3" /> Sprint</span>
              </button>
              <button
                onClick={() => setTrendView('day')}
                className={cn(
                  "px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all",
                  trendView === 'day' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                <span className="flex items-center gap-1"><Layers className="w-3 h-3" /> Day</span>
              </button>
            </div>
          </div>
          <div className="p-4 sm:p-6">
            {/* Overall pass rate summary */}
            <div className="flex items-center gap-4 mb-5">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-green-600" />
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Overall Pass Rate</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-24 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      overallPassRate >= 80 ? "bg-green-500" : overallPassRate >= 50 ? "bg-amber-500" : "bg-red-500"
                    )}
                    style={{ width: `${overallPassRate}%` }}
                  />
                </div>
                <span className="text-sm font-bold text-slate-900">{overallPassRate}%</span>
              </div>
            </div>

            {passRateTrend.length === 0 ? (
              <div className="py-10 text-center">
                <TrendingUp className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                <p className="text-sm text-slate-400 italic">No test runs yet to compute pass-rate trends.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {passRateTrend.map((b, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-28 flex-shrink-0 text-right">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider truncate block">{b.label}</span>
                    </div>
                    <div className="flex-1 h-5 bg-slate-50 rounded-md overflow-hidden flex">
                      <div
                        className="h-full bg-green-500 transition-all duration-500"
                        style={{ width: `${b.passRate}%` }}
                        title={`${b.passRate}% passed`}
                      />
                      <div
                        className="h-full bg-red-400 transition-all duration-500"
                        style={{ width: `${b.total > 0 ? (b.failed / b.total) * 100 : 0}%` }}
                        title={`${b.failed} failed`}
                      />
                    </div>
                    <div className="w-24 flex-shrink-0 text-left">
                      <span className="text-[10px] font-bold text-slate-600">{b.passRate}%</span>
                      <span className="text-[9px] text-slate-400 ml-1">({b.passed}/{b.total})</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Test Plans per Sprint */}
        <div className="col-span-12 lg:col-span-5 glass-panel rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-sm">
          <div className="px-4 sm:px-6 py-4 border-b border-slate-100 flex items-center gap-2 bg-white">
            <CalendarRange className="w-4 h-4 text-indigo-600" />
            <h4 className="font-display text-base font-bold text-slate-900 uppercase tracking-tight">Test Plans per Sprint</h4>
          </div>
          <div className="p-4 sm:p-6 max-h-[320px] overflow-y-auto">
            {sprintPlans.length === 0 ? (
              <div className="py-8 text-center">
                <CalendarRange className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                <p className="text-sm text-slate-400 italic">No sprints defined for this project yet.</p>
                <p className="text-xs text-slate-300 mt-1">Create a sprint to organize test plans.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {sprintPlans.map(({ sprint, total, passed, failed, skipped, passRate }) => (
                  <div key={sprint.id} className="border border-slate-100 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setExpandedSprintId(expandedSprintId === sprint.id ? null : sprint.id!)}
                      className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <ChevronRight className={cn("w-4 h-4 text-slate-400 transition-transform", expandedSprintId === sprint.id && "rotate-90")} />
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-900 truncate">{sprint.name}</p>
                          <p className="text-[10px] text-slate-400">{sprint.status} · {total} runs</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={cn(
                          "px-2 py-0.5 text-[10px] font-bold rounded-full",
                          passRate >= 80 ? "bg-green-100 text-green-700" : passRate >= 50 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-600"
                        )}>
                          {passRate}%
                        </span>
                      </div>
                    </button>
                    {expandedSprintId === sprint.id && (
                      <div className="px-4 pb-3 pt-1 border-t border-slate-50">
                        <div className="flex gap-3 text-[10px] font-bold mb-2">
                          <span className="text-green-600">{passed} passed</span>
                          <span className="text-red-500">{failed} failed</span>
                          <span className="text-amber-500">{skipped} skipped</span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden flex">
                          <div className="h-full bg-green-500" style={{ width: `${total > 0 ? (passed / total) * 100 : 0}%` }} />
                          <div className="h-full bg-red-400" style={{ width: `${total > 0 ? (failed / total) * 100 : 0}%` }} />
                          <div className="h-full bg-amber-300" style={{ width: `${total > 0 ? (skipped / total) * 100 : 0}%` }} />
                        </div>
                        {sprint.goal && (
                          <p className="text-[10px] text-slate-400 mt-2 italic">Goal: {sprint.goal}</p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Test Run History */}
        <div className="col-span-12 lg:col-span-12 glass-panel rounded-2xl overflow-hidden flex flex-col min-h-[500px] border border-slate-200 bg-white shadow-sm">
          <div className="px-4 sm:px-6 py-4 border-b border-slate-100 flex flex-wrap justify-between items-center gap-3 bg-white">
            <h4 className="font-display text-base font-bold text-slate-900 uppercase tracking-tight">Execution History</h4>
            <div className="flex gap-2 sm:gap-4 items-center">
              <button 
                onClick={initiateRun}
                disabled={creating}
                className="flex items-center gap-2 px-3 sm:px-4 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800 disabled:opacity-50 transition-all"
              >
                {creating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">INITIATE SWARM TEST</span>
                <span className="sm:hidden">RUN TEST</span>
              </button>
              <div className="flex gap-2">
                <button className="p-1.5 text-slate-400 hover:text-slate-900 transition-colors"><Filter className="w-4 h-4" /></button>
                <button 
                  onClick={exportCSV}
                  disabled={filteredRuns.length === 0}
                  className="p-1.5 text-slate-400 hover:text-slate-900 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Export CSV"
                >
                  <Download className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Status filter bar */}
          <div className="px-4 sm:px-6 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2 bg-slate-50/30">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mr-1">Filters:</span>
            {STATUS_FILTERS.map(status => {
              const isActive = activeFilters.has(status);
              return (
                <button
                  key={status}
                  onClick={() => toggleFilter(status)}
                  className={cn(
                    "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all duration-150 border",
                    isActive
                      ? status === 'Passed'
                        ? "bg-green-100 text-green-700 border-green-300 shadow-sm"
                        : status === 'Failed'
                        ? "bg-red-100 text-red-600 border-red-300 shadow-sm"
                        : status === 'Pending'
                        ? "bg-amber-100 text-amber-700 border-amber-300 shadow-sm"
                        : "bg-slate-200 text-slate-700 border-slate-300 shadow-sm"
                      : "bg-slate-50 text-slate-300 border-slate-200 hover:border-slate-300"
                  )}
                >
                  {status}
                </button>
              );
            })}
            {activeFilters.size < STATUS_FILTERS.length && (
              <button
                onClick={() => setActiveFilters(new Set(STATUS_FILTERS))}
                className="ml-2 flex items-center gap-1 text-[10px] font-bold text-blue-500 hover:text-blue-700 transition-colors"
              >
                <X className="w-3 h-3" />
                Clear
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Run ID</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Agent Group</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Duration</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50/50">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td colSpan={5} className="px-6 py-4">
                        <div className="h-4 bg-slate-100 rounded w-full"></div>
                      </td>
                    </tr>
                  ))
                ) : runs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-400 text-sm italic">
                      No orchestration runs recorded yet.
                    </td>
                  </tr>
                ) : filteredRuns.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-400 text-sm italic">
                      No test runs match the selected filters.
                    </td>
                  </tr>
                ) : (
                  filteredRuns.map((run) => (
                    <React.Fragment key={run.id}>
                    <tr 
                      className={cn(
                        "hover:bg-slate-50/50 transition-colors cursor-pointer group",
                        expandedRunId === run.id && "bg-blue-50/30"
                      )}
                      onClick={() => setExpandedRunId(expandedRunId === run.id ? null : run.id)}
                    >
                      <td className="px-6 py-4 font-mono text-[11px] font-bold text-slate-900">#{run.runId}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className={cn("w-2 h-2 rounded-full", run.color === 'blue' ? 'bg-blue-500' : run.color === 'purple' ? 'bg-purple-500' : 'bg-amber-500')}></div>
                          <span className="text-slate-600 text-xs font-bold">{run.group}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-400 text-[10px] font-bold">{run.duration}</td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "px-2 py-0.5 text-[9px] font-bold rounded uppercase tracking-wider",
                          run.status === 'Passed' ? "bg-green-100 text-green-700" : 
                          run.status === 'Failed' ? "bg-red-100 text-red-600" :
                          run.status === 'Pending' ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"
                        )}>
                          {run.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <ChevronRight className={cn(
                          "w-4 h-4 transition-all duration-200",
                          expandedRunId === run.id ? "text-blue-600 rotate-90" : "text-slate-300 group-hover:text-blue-600"
                        )} />
                      </td>
                    </tr>
                    {/* Expanded detail row */}
                    {expandedRunId === run.id && (
                      <tr>
                        <td colSpan={5} className="px-0 py-0 bg-slate-50/60">
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                            className="px-8 py-5"
                          >
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                              <div>
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Run ID</p>
                                <p className="font-mono text-sm font-bold text-slate-900">#{run.runId}</p>
                              </div>
                              <div>
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Agent Group</p>
                                <div className="flex items-center gap-2">
                                  <div className={cn("w-2 h-2 rounded-full", run.color === 'blue' ? 'bg-blue-500' : run.color === 'purple' ? 'bg-purple-500' : 'bg-amber-500')}></div>
                                  <p className="text-sm font-bold text-slate-700">{run.group}</p>
                                </div>
                              </div>
                              <div>
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Duration</p>
                                <div className="flex items-center gap-1.5">
                                  <Timer className="w-3.5 h-3.5 text-slate-400" />
                                  <p className="text-sm font-bold text-slate-700">{run.duration || '—'}</p>
                                </div>
                              </div>
                              <div>
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Status</p>
                                <span className={cn(
                                  "px-2.5 py-1 text-[10px] font-bold rounded uppercase tracking-wider",
                                  run.status === 'Passed' ? "bg-green-100 text-green-700" : 
                                  run.status === 'Failed' ? "bg-red-100 text-red-600" :
                                  run.status === 'Pending' ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"
                                )}>
                                  {run.status}
                                </span>
                                <div className="flex gap-1 mt-2">
                                  {['Passed', 'Failed', 'Skipped', 'Pending']
                                    .filter(s => s !== run.status)
                                    .map(s => (
                                      <button
                                        key={s}
                                        onClick={async () => {
                                          try {
                                            await apiClient.testRuns.update(run.id, {
                                              status: s,
                                            });
                                          } catch (err) {
                                            console.error('Failed to update status:', err);
                                          }
                                        }}
                                        className={cn(
                                          "px-2 py-0.5 text-[9px] font-bold rounded border transition-all",
                                          s === 'Passed' ? "border-green-300 text-green-600 hover:bg-green-50" :
                                          s === 'Failed' ? "border-red-300 text-red-600 hover:bg-red-50" :
                                          s === 'Pending' ? "border-amber-300 text-amber-600 hover:bg-amber-50" :
                                          "border-slate-300 text-slate-500 hover:bg-slate-50"
                                        )}
                                      >
                                        → {s}
                                      </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                              <div>
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Timestamp</p>
                                <p className="text-sm text-slate-700">
                                  {(() => {
                                    const ts = resolveDate(run.createdAt);
                                    return ts
                                      ? ts.toLocaleString()
                                      : run.createdAt
                                        ? new Date(run.createdAt as Date).toLocaleString()
                                        : '—';
                                  })()}
                                </p>
                              </div>
                              <div>
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Test Type</p>
                                <p className="text-sm text-slate-700">Swarm Integration</p>
                              </div>
                              <div>
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Description</p>
                                <p className="text-sm text-slate-700">
                                  Automated test run for <span className="font-bold">{run.group}</span> — {run.status === 'Passed' ? 'all assertions passed.' : run.status === 'Failed' ? 'one or more assertions failed.' : run.status === 'Pending' ? 'awaiting execution.' : 'run was skipped.'}
                                </p>
                              </div>
                            </div>
                            {/* Linked Bug, Requirement & Agent Assignment */}
                            <div className="mt-4 pt-4 border-t border-slate-200 grid grid-cols-2 md:grid-cols-3 gap-4">
                              <div>
                                <div className="flex items-center justify-between mb-1">
                                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Linked Bug</p>
                                  <button
                                    onClick={() => setEditingRunLinks(editingRunLinks === run.id ? null : run.id)}
                                    className="text-[9px] font-bold text-blue-600 hover:text-blue-800"
                                  >{editingRunLinks === run.id ? 'Done' : 'Edit'}</button>
                                </div>
                                {editingRunLinks === run.id ? (
                                  <select
                                    value={(run as any).bugId || ''}
                                    onChange={e => updateRunLink(run.id, 'bugId', e.target.value)}
                                    className="w-full px-2 py-1 border border-slate-200 rounded-lg text-xs"
                                  >
                                    <option value="">None</option>
                                    {allBugs.map(b => <option key={b.id} value={b.id}>{b.title} ({b.status})</option>)}
                                  </select>
                                ) : (run as any).bugId ? (
                                  <span className="text-xs font-medium text-slate-700">{(() => {
                                    const b = allBugs.find(x => x.id === (run as any).bugId);
                                    return b ? `${b.title} (${b.status})` : (run as any).bugId;
                                  })()}</span>
                                ) : (
                                  <span className="text-xs text-slate-400 italic">None</span>
                                )}
                              </div>
                              <div>
                                <div className="flex items-center justify-between mb-1">
                                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Linked Requirement</p>
                                  {editingRunLinks !== run.id && (
                                    <button
                                      onClick={() => setEditingRunLinks(run.id)}
                                      className="text-[9px] font-bold text-blue-600 hover:text-blue-800"
                                    >Edit</button>
                                  )}
                                </div>
                                {editingRunLinks === run.id ? (
                                  <select
                                    value={(run as any).requirementId || ''}
                                    onChange={e => updateRunLink(run.id, 'requirementId', e.target.value)}
                                    className="w-full px-2 py-1 border border-slate-200 rounded-lg text-xs"
                                  >
                                    <option value="">None</option>
                                    {allRequirements.map(r => <option key={r.id} value={r.id}>{r.title} ({r.status || 'Pending'})</option>)}
                                  </select>
                                ) : (run as any).requirementId ? (
                                  <span className="text-xs font-medium text-slate-700">{(() => {
                                    const r = allRequirements.find(x => x.id === (run as any).requirementId);
                                    return r ? `${r.title} (${r.status || 'Pending'})` : (run as any).requirementId;
                                  })()}</span>
                                ) : (
                                  <span className="text-xs text-slate-400 italic">None</span>
                                )}
                              </div>
                              <div>
                                <div className="flex items-center justify-between mb-1">
                                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Assigned Agent</p>
                                  {editingRunLinks !== run.id && (
                                    <button
                                      onClick={() => setEditingRunLinks(run.id)}
                                      className="text-[9px] font-bold text-blue-600 hover:text-blue-800"
                                    >Edit</button>
                                  )}
                                </div>
                                {editingRunLinks === run.id ? (
                                  <select
                                    value={(run as any).assignedAgentId || ''}
                                    onChange={e => updateRunLink(run.id, 'assignedAgentId', e.target.value)}
                                    className="w-full px-2 py-1 border border-slate-200 rounded-lg text-xs"
                                  >
                                    <option value="">Unassigned</option>
                                    {allAgents.map(a => <option key={a.id} value={a.id}>{a.emoji} {a.name} — {a.role}</option>)}
                                  </select>
                                ) : (run as any).assignedAgentId ? (
                                  <span className="text-xs font-medium text-slate-700">{(() => {
                                    const a = allAgents.find(x => x.id === (run as any).assignedAgentId);
                                    return a ? `${a.emoji} ${a.name}` : (run as any).assignedAgentId;
                                  })()}</span>
                                ) : (
                                  <span className="text-xs text-slate-400 italic">Unassigned</span>
                                )}
                              </div>
                            </div>
                            {/* Delete button */}
                            <div className="mt-4 pt-4 border-t border-slate-200 flex justify-end">
                              <button
                                onClick={(e) => { e.stopPropagation(); deleteRun(run.id); }}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 rounded-lg border border-red-200 transition-all"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                Delete Run
                              </button>
                            </div>
                          </motion.div>
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-auto px-4 sm:px-6 py-4 bg-slate-50/30 border-t border-slate-100 flex justify-center">
            <button 
              onClick={() => setShowAllRuns(prev => !prev)}
              className="text-blue-600 text-xs font-bold hover:underline"
            >
              {showAllRuns ? 'Show Recent Runs' : 'View All Run History'}
            </button>
          </div>
        </div>

        {/* Live Logs */}
        <div className="col-span-12 lg:col-span-5 flex flex-col h-[500px]">
          <div className="flex-1 glass-panel rounded-2xl overflow-hidden flex flex-col bg-slate-950 border-slate-800">
            <div className="px-4 py-3 bg-slate-900/50 border-b border-slate-800 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-blue-400" />
                <span className="text-[11px] font-mono font-bold text-slate-300 tracking-wider">live_execution_log.sh</span>
              </div>
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/20"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500/20"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-green-500/20"></div>
              </div>
            </div>
            <div className="flex-1 p-4 font-mono text-[11px] text-slate-400 overflow-y-auto space-y-1.5 no-scrollbar flex flex-col items-center justify-center text-center">
              <Terminal className="w-8 h-8 text-slate-600 mb-3" />
              <p className="text-slate-500 text-xs">No logs available</p>
              <p className="text-slate-600 text-[10px] mt-1 max-w-xs">
                Live logs will be connected when agent integration is active.
                Real-time execution output will appear here.
              </p>
            </div>
            <div className="p-3 bg-slate-900/50 border-t border-slate-800 flex gap-2">
              <input 
                type="text" 
                placeholder="Search logs..." 
                disabled
                className="flex-1 bg-slate-950 border border-slate-800 text-[11px] font-mono rounded-lg px-3 py-1.5 text-slate-300 focus:outline-none focus:border-blue-500/50 opacity-50 cursor-not-allowed" 
              />
              <button 
                disabled
                className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider opacity-50 cursor-not-allowed"
              >
                Wrap
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
    </motion.div>
  );
}
