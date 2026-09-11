import { useMemo, useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/src/lib/utils';
import {
  TrendingDown, Gauge, BarChart3, FileText, RefreshCw,
  CalendarRange, Target, CheckCircle2
} from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, BarChart, Bar, ReferenceLine, Cell
} from 'recharts';
import apiClient from '../lib/api-client';
import { useProject } from '../lib/ProjectContext';
import { useRealtime } from '../lib/useRealtime';
import type { Sprint, Task } from '../lib/types';

const DONE = 'Done';
const DAY_MS = 86400000;

interface BurndownPoint {
  day: string;
  label: string;
  ideal: number;
  actual: number;
}

interface VelocityItem {
  sprint: string;
  completed: number;
  total: number;
}

function truncate(str: string, n: number): string {
  return str.length > n ? str.slice(0, n - 1) + '…' : str;
}

// Match tasks that belong to a sprint by their sprintId assignment. Accepts both
// the modern id-stored convention (task.sprintId === sprint.id) and legacy
// rows that store the sprint *name* in sprintId (e.g. 'Sprint2'). This mirrors
// the server-side sprint filter fix in GET /tasks (commit 0e318eb); using a
// createdAt window instead ignored the actual sprint assignment and reported
// wrong burndown/velocity figures.
function tasksInSprint(tasks: Task[], sprint: Sprint): Task[] {
  return tasks.filter((task) => {
    if (task.projectId !== sprint.projectId) return false;
    return task.sprintId === sprint.id || task.sprintId === sprint.name;
  });
}

export default function SprintAnalytics() {
  const { projectId } = useProject();
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, t] = await Promise.all([
        apiClient.sprints.list(projectId || undefined),
        apiClient.tasks.list(),
      ]);
      // Only consider tasks that belong to a sprint's project.
      const projectTasks = projectId ? t.filter((task) => task.projectId === projectId) : t;
      setSprints(s);
      setTasks(projectTasks);
      if (s.length && !selectedId) setSelectedId(s[0].id || '');
    } catch (err) {
      console.error('Failed to load sprint analytics:', err);
      setError(err instanceof Error ? err.message : 'Failed to load sprint data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (projectId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // P3-1: refresh analytics live when task activity streams in.
  useRealtime('task.*', () => { load(); });

  const selected = sprints.find((s) => s.id === selectedId) || null;

  const sprintTasks = useMemo(() => {
    if (!selected) return [];
    return tasksInSprint(tasks, selected);
  }, [tasks, selected]);

  const doneCount = useMemo(
    () => sprintTasks.filter((t) => (t.status || '').toLowerCase() === DONE.toLowerCase()).length,
    [sprintTasks]
  );

  // ---- Burndown: ideal line interpolated across the sprint span ----
  const burndownData = useMemo<BurndownPoint[]>(() => {
    if (!selected?.startDate || !selected?.endDate) return [];
    const start = new Date(selected.startDate as any).getTime();
    const end = new Date(selected.endDate as any).getTime();
    const totalDays = Math.max(1, Math.round((end - start) / DAY_MS));
    const totalWork = sprintTasks.length;

    const doneAtMap: Record<string, number> = {};
    sprintTasks.forEach((task) => {
      // Use updatedAt as a proxy for when it was completed, clamped to sprint end.
      const ts = new Date(task.updatedAt as any).getTime();
      const dayIndex = Math.floor((ts - start) / DAY_MS);
      if (dayIndex >= 0 && dayIndex <= totalDays) {
        doneAtMap[dayIndex] = (doneAtMap[dayIndex] || 0) + 1;
      }
    });

    const points: BurndownPoint[] = [];
    let remaining = totalWork;
    let cumulativeDone = 0;
    for (let d = 0; d <= totalDays; d++) {
      cumulativeDone += doneAtMap[d] || 0;
      remaining = Math.max(0, totalWork - cumulativeDone);
      const idealRemaining = totalWork * (1 - d / totalDays);
      const label = new Date(start + d * DAY_MS).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      points.push({
        day: String(d),
        label,
        ideal: Math.round(idealRemaining * 10) / 10,
        actual: remaining,
      });
    }
    return points;
  }, [sprintTasks, selected]);

  // ---- Velocity: completed tasks per recent sprint (incl. this one) ----
  const velocityData = useMemo<VelocityItem[]>(() => {
    const recent = sprints.slice(0, 6).reverse(); // oldest first for the axis
    return recent.map((s) => {
      const inWindow = tasksInSprint(tasks, s);
      const completed = inWindow.filter(
        (t) => (t.status || '').toLowerCase() === DONE.toLowerCase()
      ).length;
      return { sprint: truncate(s.name, 12), completed, total: inWindow.length };
    });
  }, [sprints, tasks]);

  const avgVelocity = useMemo(() => {
    if (!velocityData.length) return 0;
    const totals = velocityData.map((v) => v.completed);
    return Math.round((totals.reduce((a, b) => a + b, 0) / velocityData.length) * 10) / 10;
  }, [velocityData]);

  const progressPct = sprintTasks.length
    ? Math.round((doneCount / sprintTasks.length) * 100)
    : 0;

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Loading Analytics…</p>
        </div>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="h-full overflow-y-auto">
      <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Sprint Analytics</h1>
            <p className="text-sm text-slate-500 mt-1">Burndown & velocity</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              {sprints.length === 0 && <option value="">No sprints</option>}
              {sprints.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <button
              onClick={load}
              className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>
        </div>

        {error && (
          <div className="px-4 py-3 bg-red-50 border border-red-100 rounded-lg flex items-center justify-between">
            <p className="text-xs text-red-600 font-medium">{error}</p>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">✕</button>
          </div>
        )}

        {sprints.length === 0 ? (
          <div className="py-20 text-center">
            <BarChart3 className="w-14 h-14 text-slate-200 mx-auto mb-4" />
            <p className="text-sm text-slate-500 font-medium">No sprints for this project yet</p>
            <p className="text-xs text-slate-400 mt-1">Create a sprint to view burndown & velocity charts</p>
          </div>
        ) : (
          <>
            {/* KPI cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Sprint Tasks', value: sprintTasks.length, icon: FileText, color: 'bg-blue-100 text-blue-600' },
                { label: 'Completed', value: doneCount, icon: CheckCircle2, color: 'bg-green-100 text-green-600' },
                { label: 'Progress', value: `${progressPct}%`, icon: Target, color: 'bg-purple-100 text-purple-600' },
                { label: 'Avg Velocity', value: `${avgVelocity}/sprint`, icon: Gauge, color: 'bg-amber-100 text-amber-600' },
              ].map((k) => (
                <div key={k.label} className="p-4 border border-slate-100 rounded-xl bg-white">
                  <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center mb-2', k.color)}>
                    <k.icon className="w-4 h-4" />
                  </div>
                  <p className="text-2xl font-bold text-slate-900">{loading ? '…' : k.value}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">{k.label}</p>
                </div>
              ))}
            </div>

            {/* Burndown chart */}
            <div className="p-6 border border-slate-100 rounded-xl bg-white">
              <div className="flex items-center gap-2 mb-4">
                <TrendingDown className="w-5 h-5 text-slate-500" />
                <h2 className="text-base font-bold text-slate-900">Burndown — {selected?.name}</h2>
              </div>
              {burndownData.length > 1 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={burndownData} margin={{ top: 8, right: 16, left: -8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="ideal" name="Ideal" stroke="#94a3b8" strokeDasharray="6 3" dot={false} strokeWidth={2} />
                    <Line type="monotone" dataKey="actual" name="Remaining" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 3 }} />
                    <ReferenceLine label="Start" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="py-16 text-center">
                  <CalendarRange className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                  <p className="text-sm text-slate-500">Set start & end dates on this sprint to render a burndown.</p>
                </div>
              )}
            </div>

            {/* Velocity chart */}
            <div className="p-6 border border-slate-100 rounded-xl bg-white">
              <div className="flex items-center gap-2 mb-4">
                <Gauge className="w-5 h-5 text-slate-500" />
                <h2 className="text-base font-bold text-slate-900">Velocity (completed per sprint)</h2>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={velocityData} margin={{ top: 8, right: 16, left: -8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="sprint" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="completed" name="Completed" radius={[6, 6, 0, 0]}>
                    {velocityData.map((entry, i) => (
                      <Cell key={i} fill={entry.completed > 0 ? '#10b981' : '#e2e8f0'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}
