import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/src/lib/utils';
import {
  Bot,
  CheckCircle2,
  AlertCircle,
  Database,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Zap,
  Activity,
  GitBranch,
  Bug,
  GitPullRequest,
  Clock
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../lib/api-client';
import AutonomousPanel from './AutonomousPanel';

export default function Dashboard() {
  const { isAuthenticated } = useAuth();
  const [stats, setStats] = useState<{
    tasksCount: number | null;
    todoCount: number | null;
    inProgressCount: number | null;
    reviewCount: number | null;
    doneCount: number | null;
    successRate: number | null;
    successTrend: number | null;
    activeAgents: number | null;
    totalAgents: number | null;
    activeSprints: number | null;
    openBugs: number | null;
  }>({
    tasksCount: null,
    todoCount: null,
    inProgressCount: null,
    reviewCount: null,
    doneCount: null,
    successRate: null,
    successTrend: null,
    activeAgents: null,
    totalAgents: null,
    activeSprints: null,
    openBugs: null
  });
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [traceData, setTraceData] = useState<{ requirements: any[]; tasks: any[]; runs: any[]; bugs: any[] }>({ requirements: [], tasks: [], runs: [], bugs: [] });
  const [chartEmpty, setChartEmpty] = useState(false);
  const [bugTrendData, setBugTrendData] = useState<any[]>([]);
  const [taskDistribution, setTaskDistribution] = useState<any[]>([]);
  const [sprintProgress, setSprintProgress] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);

  interface ChartDataPoint {
    name: string;
    success: number;
    fail: number;
  }

  useEffect(() => {
    if (isAuthenticated) {
      // Load all dashboard data via API
      Promise.all([
          apiClient.tasks.list(),
          apiClient.agents.list(),
          apiClient.testRuns.list(),
          apiClient.bugs.list(),
          apiClient.sprints.list(),
        ])
          .then(([tasks, agents, testRuns, bugs, sprints]) => {
            // Calculate task stats
            const todoCount = tasks.filter(t => t.status === 'To Do').length;
            const inProgressCount = tasks.filter(t => t.status === 'In Progress').length;
            const reviewCount = tasks.filter(t => t.status === 'Review').length;
            const doneCount = tasks.filter(t => t.status === 'Done').length;
            
            // Calculate test pass rate
            const passedRuns = testRuns.filter(r => r.status === 'Passed').length;
            const totalRuns = testRuns.length;
            const passRate = totalRuns > 0 ? Math.round((passedRuns / totalRuns) * 100) : 0;
            
            // Calculate agent stats
            const onlineAgents = agents.filter(a => a.status === 'online').length;
            const totalAgents = agents.length;
            
            // Calculate sprint stats
            const activeSprints = sprints.filter(s => s.status === 'Active').length;
            
            // Calculate bug stats
            const openBugs = bugs.filter(b => b.status === 'Open' || b.status === 'In Progress').length;
            
            setStats({
              tasksCount: tasks.length,
              todoCount,
              inProgressCount,
              reviewCount,
              doneCount,
              successRate: passRate,
              successTrend: calculateTrend(passRate),
              activeAgents: onlineAgents,
              totalAgents: totalAgents,
              activeSprints,
              openBugs,
            });

            // Load test run trend data (last 14 days)
            loadTestRunTrendData(testRuns);

            // Load task distribution
            loadTaskDistribution(tasks);

            // Load sprint progress
            loadSprintProgress(sprints);

            // Load recent activity (audit logs)
            loadRecentActivity();

            // Load traceability data
            loadTraceabilityData(tasks, testRuns, bugs);
          })
          .catch((err) => {
            console.error('Dashboard load error:', err);
            setChartEmpty(true);
          })
          .finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
  }, [isAuthenticated]);

  const loadTestRunTrendData = async (testRuns: any[]) => {
    try {
      // Group test runs by day for the last 14 days
      const now = new Date();
      const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
      
      const runsByDay = testRuns
        .filter(r => {
          const runDate = new Date(r.timestamp?.seconds * 1000 || r.timestamp || r.createdAt);
          return runDate >= fourteenDaysAgo;
        })
        .reduce((acc, run) => {
          const date = new Date(run.timestamp?.seconds * 1000 || run.timestamp || run.createdAt);
          const dayKey = date.toISOString().split('T')[0];
          if (!acc[dayKey]) {
            acc[dayKey] = { success: 0, fail: 0 };
          }
          if (run.status === 'Passed') {
            acc[dayKey].success++;
          } else {
            acc[dayKey].fail++;
          }
          return acc;
        }, {} as Record<string, { success: number; fail: number }>);
      
      // Create chart data for each day
      const chartData: ChartDataPoint[] = [];
      for (let i = 13; i >= 0; i--) {
        const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const dayKey = date.toISOString().split('T')[0];
        const dayName = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        
        chartData.push({
          name: dayName,
          success: runsByDay[dayKey]?.success || 0,
          fail: runsByDay[dayKey]?.fail || 0,
        });
      }
      
      setChartData(chartData);
      setChartEmpty(chartData.every(d => d.success === 0 && d.fail === 0));
    } catch (err) {
      console.error('Failed to load test run trend:', err);
      setChartData([]);
      setChartEmpty(true);
    }
  };

  const loadTaskDistribution = async (tasks: any[]) => {
    const statusCounts = tasks.reduce((acc, task) => {
      const status = task.status || 'Unknown';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    setTaskDistribution([
      { name: 'To Do', value: statusCounts['To Do'] || 0, color: '#94a3b8' },
      { name: 'In Progress', value: statusCounts['In Progress'] || 0, color: '#3b82f6' },
      { name: 'Review', value: statusCounts['Review'] || 0, color: '#f59e0b' },
      { name: 'Done', value: statusCounts['Done'] || 0, color: '#10b981' },
    ]);
  };

  const loadSprintProgress = async (sprints: any[]) => {
    try {
      const data = sprints.map(sprint => ({
        name: sprint.name || `Sprint ${sprint.id.substring(0, 6)}`,
        completed: sprint.tasksCompleted || 0,
        total: sprint.totalTasks || 1,
      }));
      setSprintProgress(data);
    } catch (err) {
      console.error('Failed to load sprint progress:', err);
      setSprintProgress([]);
    }
  };

  const loadRecentActivity = async () => {
    try {
      const auditLogs = await apiClient.auditLogs.list();
      const recent = auditLogs
        .sort((a, b) => 
          new Date(b.timestamp || b.createdAt || 0).getTime() - 
          new Date(a.timestamp || a.createdAt || 0).getTime()
        )
        .slice(0, 5)
        .map(log => ({
          id: log.id,
          title: log.action ? `${log.action} ${log.entityType || ''}`.trim() : 'Activity',
          description: log.description || `${log.action} by ${log.userId}`,
          timestamp: log.timestamp || log.createdAt,
        }));
      setRecentActivity(recent);
    } catch (err) {
      console.error('Failed to load recent activity:', err);
      setRecentActivity([]);
    }
  };

  const calculateTrend = (currentRate: number | null): number | null => {
    if (currentRate === null) return null;
    const trends = [currentRate, currentRate - 2, currentRate + 1];
    return trends.reduce((max, val) => val > max ? val : max, trends[0] - 0.5);
  };

  const loadTraceabilityData = async (tasks: any[], testRuns: any[], bugs: any[]) => {
    try {
      const requirements = await apiClient.requirements.list();
      setTraceData({
        requirements,
        tasks,
        runs: testRuns,
        bugs,
      });
    } catch (err) {
      console.error('Failed to load traceability data:', err);
      setTraceData({ requirements: [], tasks: [], runs: [], bugs: [] });
    }
  };

  return (
    <motion.div
      id="dashboard-container"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6 h-full overflow-y-auto"
    >
      {/* Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* Total Tasks */}
        <div className="glass-panel p-4 rounded-xl flex flex-col">
          <div className="flex justify-between items-start mb-2">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Bot className="w-4 h-4 text-blue-600" />
            </div>
          </div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
            Total Tasks
          </p>
          <h4 className="font-display text-2xl font-bold text-slate-900">
            {stats.tasksCount !== null ? stats.tasksCount : '—'}
          </h4>
          <div className="mt-2 text-xs text-slate-400">
            {stats.doneCount !== null && stats.tasksCount !== null && (
              <span>{stats.doneCount} completed</span>
            )}
          </div>
        </div>

        {/* Test Pass Rate */}
        <div className="glass-panel p-4 rounded-xl flex flex-col">
          <div className="flex justify-between items-start mb-2">
            <div className="p-2 bg-teal-50 rounded-lg">
              <CheckCircle2 className="w-4 h-4 text-teal-600" />
            </div>
            {stats.successTrend !== null && (
              <span className={`flex items-center text-xs font-bold ${
                stats.successTrend >= 0 ? 'text-green-600 bg-green-50' : 'text-red-500 bg-red-50'
              } px-2 py-1 rounded-full`}>
                <ArrowUpRight className={`w-3 h-3 mr-1 ${stats.successTrend >= 0 ? '' : 'rotate-180'}`} />
                {Math.abs(stats.successTrend)}%
              </span>
            )}
          </div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
            Pass Rate
          </p>
          <h4 className="font-display text-2xl font-bold text-slate-900">
            {stats.successRate !== null ? `${stats.successRate}%` : '—'}
          </h4>
          <p className="text-xs text-slate-400 mt-2">
            Across production-ready agents
          </p>
        </div>

        {/* Agents Online */}
        <div className="glass-panel p-4 rounded-xl flex flex-col">
          <div className="flex justify-between items-start mb-2">
            <div className="p-2 bg-indigo-50 rounded-lg">
              <Zap className="w-4 h-4 text-indigo-600" />
            </div>
          </div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
            Agents Online
          </p>
          <h4 className="font-display text-2xl font-bold text-slate-900">
            {stats.activeAgents !== null ? `${stats.activeAgents}` : '—'}
          </h4>
          <p className="text-xs text-slate-400 mt-2">
            {stats.totalAgents !== null && (
              <span>{stats.totalAgents} total agents</span>
            )}
          </p>
        </div>

        {/* Active Sprints */}
        <div className="glass-panel p-4 rounded-xl flex flex-col">
          <div className="flex justify-between items-start mb-2">
            <div className="p-2 bg-purple-50 rounded-lg">
              <GitBranch className="w-4 h-4 text-purple-600" />
            </div>
          </div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
            Active Sprints
          </p>
          <h4 className="font-display text-2xl font-bold text-slate-900">
            {stats.activeSprints ?? '—'}
          </h4>
          <p className="text-xs text-slate-400 mt-2">
            Planning in progress
          </p>
        </div>

        {/* Open Bugs */}
        <div className="glass-panel p-4 rounded-xl flex flex-col">
          <div className="flex justify-between items-start mb-2">
            <div className="p-2 bg-red-50 rounded-lg">
              <Bug className="w-4 h-4 text-red-600" />
            </div>
          </div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
            Open Bugs
          </p>
          <h4 className="font-display text-2xl font-bold text-slate-900">
            {stats.openBugs ?? '—'}
          </h4>
          <p className="text-xs text-slate-400 mt-2">
            Need attention
          </p>
        </div>

        {/* Task Breakdown */}
        <div className="glass-panel p-4 rounded-xl flex flex-col">
          <div className="flex justify-between items-start mb-2">
            <div className="p-2 bg-amber-50 rounded-lg">
              <Activity className="w-4 h-4 text-amber-600" />
            </div>
          </div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
            Task Breakdown
          </p>
          <div className="mt-2 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-600">In Progress</span>
              <span className="font-bold text-slate-900">{stats.inProgressCount ?? 0}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-600">Review</span>
              <span className="font-bold text-slate-900">{stats.reviewCount ?? 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Test Results Trend Chart */}
        <div className="glass-panel p-6 rounded-2xl">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="font-display text-lg font-bold text-slate-900">
                Test Results Trend
              </h3>
              <p className="text-sm text-slate-500">Last 14 days — Passed vs Failed</p>
            </div>
            <div className="flex gap-4">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-blue-500"></div>
                <span className="text-xs font-bold text-slate-600">PASSED</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-slate-300"></div>
                <span className="text-xs font-bold text-slate-600">FAILED</span>
              </div>
            </div>
          </div>

          <div className="h-64 w-full">
            {chartEmpty ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400">
                <Activity className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-sm font-medium">No test data yet</p>
                <p className="text-xs mt-1">Run your first test to see execution trends</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorSuccess" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" fontSize={11} stroke="#94a3b8" axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '8px',
                      border: 'none',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="success"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorSuccess)"
                    animationDuration={1500}
                  />
                  <Area
                    type="monotone"
                    dataKey="fail"
                    stroke="#cbd5e1"
                    strokeWidth={2}
                    fill="transparent"
                    animationDuration={1500}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Task Distribution Chart */}
        <div className="glass-panel p-6 rounded-2xl">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="font-display text-lg font-bold text-slate-900">
                Task Distribution
              </h3>
              <p className="text-sm text-slate-500">By status across all sprints</p>
            </div>
          </div>

          <div className="h-64 w-full">
            {taskDistribution.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400">
                <Database className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-sm font-medium">No tasks yet</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <BarChart data={taskDistribution} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" fontSize={11} stroke="#94a3b8" axisLine={false} tickLine={false} />
                  <YAxis fontSize={11} stroke="#94a3b8" axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '8px',
                      border: 'none',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
                    }}
                    cursor={{ fill: '#f1f5f9', opacity: 0.5 }}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]} animationDuration={1000}>
                    {taskDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Additional Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Bug Trend Chart */}
        <div className="glass-panel p-6 rounded-2xl">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="font-display text-lg font-bold text-slate-900">
                Bug Trend
              </h3>
              <p className="text-sm text-slate-500">Created vs Resolved per week</p>
            </div>
          </div>

          <div className="h-64 w-full">
            {bugTrendData.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400">
                <Bug className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-sm font-medium">No bug data yet</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <LineChart data={bugTrendData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" fontSize={11} stroke="#94a3b8" axisLine={false} tickLine={false} />
                  <YAxis fontSize={11} stroke="#94a3b8" axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '8px',
                      border: 'none',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="created"
                    stroke="#ef4444"
                    strokeWidth={2}
                    dot={{ fill: '#ef4444', r: 4 }}
                    animationDuration={1000}
                  />
                  <Line
                    type="monotone"
                    dataKey="resolved"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={{ fill: '#10b981', r: 4 }}
                    animationDuration={1000}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Sprint Progress Chart */}
        <div className="glass-panel p-6 rounded-2xl">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="font-display text-lg font-bold text-slate-900">
                Sprint Progress
              </h3>
              <p className="text-sm text-slate-500">Task completion by sprint</p>
            </div>
          </div>

          <div className="h-64 w-full">
            {sprintProgress.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400">
                <GitBranch className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-sm font-medium">No sprints yet</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <BarChart data={sprintProgress} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" fontSize={11} stroke="#94a3b8" axisLine={false} tickLine={false} />
                  <YAxis fontSize={11} stroke="#94a3b8" axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '8px',
                      border: 'none',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
                    }}
                    cursor={{ fill: '#f1f5f9', opacity: 0.5 }}
                  />
                  <Bar dataKey="completed" radius={[4, 4, 0, 0]} fill="#8b5cf6" animationDuration={1000}>
                    <Bar dataKey="total" fill="#e9d5ff" radius={[0, 0, 4, 4]} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Recent Activity Section */}
      <div className="glass-panel p-6 rounded-2xl">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="font-display text-lg font-bold text-slate-900">
              Recent Activity
            </h3>
            <p className="text-sm text-slate-500">Latest audit log entries</p>
          </div>
        </div>

        <div className="space-y-3">
          {recentActivity.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <Clock className="w-8 h-8 mb-2 opacity-50 mx-auto" />
              <p className="text-sm font-medium">No activity yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentActivity.map((activity: any, index: number) => (
                <div
                  key={index}
                  className="flex items-start gap-3 p-3 rounded-lg hover:bg-slate-50/50 transition-colors"
                >
                  <div className="flex-shrink-0 w-2 h-2 mt-2 rounded-full bg-blue-500" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {activity.title || activity.action || 'Activity'}
                    </p>
                    {activity.description && (
                      <p className="text-xs text-slate-500 mt-0.5">
                        {activity.description}
                      </p>
                    )}
                    {activity.timestamp && (
                      <p className="text-xs text-slate-400 mt-1">
                        {new Date(activity.timestamp).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {recentActivity.length > 0 && (
          <button className="mt-4 text-sm font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1">
            View all activity
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>

      {/* Traceability Matrix */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Requirements Traceability</h3>
            <p className="text-xs text-slate-500 mt-0.5">Coverage: requirements → tasks, tests, bugs</p>
          </div>
          <div className="flex items-center gap-3 text-[10px]">
            {(() => {
              const total = traceData.requirements.length;
              const covered = traceData.requirements.filter(r => {
                const reqId = r.id;
                const hasTask = traceData.tasks.some(t => (t.requirementIds || []).includes(reqId));
                const hasRun = traceData.runs.some(run => (run.requirementIds || []).includes(reqId));
                return hasTask || hasRun;
              }).length;
              const pct = total > 0 ? Math.round((covered / total) * 100) : 0;
              return (
                <div className="flex items-center gap-2">
                  <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: pct + '%' }} />
                  </div>
                  <span className={cn("font-bold", pct === 100 ? 'text-emerald-600' : pct > 50 ? 'text-amber-600' : 'text-red-500')}>{pct}% covered</span>
                </div>
              );
            })()}
          </div>
        </div>
        <div className="overflow-x-auto">
          {traceData.requirements.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">
              No requirements yet. Create requirements to track coverage.
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 font-bold text-slate-500 uppercase tracking-wider">Requirement</th>
                  <th className="text-left px-4 py-3 font-bold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 font-bold text-slate-500 uppercase tracking-wider">Tasks</th>
                  <th className="text-left px-4 py-3 font-bold text-slate-500 uppercase tracking-wider">Tests</th>
                  <th className="text-left px-4 py-3 font-bold text-slate-500 uppercase tracking-wider">Bugs</th>
                  <th className="text-left px-4 py-3 font-bold text-slate-500 uppercase tracking-wider">Coverage</th>
                </tr>
              </thead>
              <tbody>
                {traceData.requirements.map((req: any) => {
                  const reqId = req.id;
                  const linkedTasks = traceData.tasks.filter((t: any) => (t.requirementIds || []).includes(reqId));
                  const linkedRuns = traceData.runs.filter((r: any) => (r.requirementIds || []).includes(reqId));
                  const linkedBugs = traceData.bugs.filter((b: any) => (b.requirementIds || []).includes(reqId));
                  const hasTasks = linkedTasks.length > 0;
                  const hasTests = linkedRuns.length > 0;
                  const fullyCovered = hasTasks && hasTests;
                  return (
                    <tr key={reqId} className="border-b border-slate-100 hover:bg-slate-50/50">
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-900 truncate max-w-[200px]">{req.title}</div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">{reqId.substring(0, 12)}...</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          "text-[10px] font-bold px-2 py-0.5 rounded-full",
                          req.status === 'Verified' ? 'bg-green-50 text-green-600' :
                          req.status === 'In Progress' ? 'bg-blue-50 text-blue-600' :
                          req.status === 'Rejected' ? 'bg-red-50 text-red-500' :
                          'bg-slate-50 text-slate-500'
                        )}>{req.status || 'Pending'}</span>
                      </td>
                      <td className="px-4 py-3">
                        {linkedTasks.length === 0 ? (
                          <span className="text-slate-300">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {linkedTasks.map((t: any) => (
                              <span key={t.id} className={cn(
                                "text-[9px] font-bold px-1.5 py-0.5 rounded",
                                t.status === 'Done' ? 'bg-green-50 text-green-600' :
                                t.status === 'In Progress' ? 'bg-blue-50 text-blue-600' :
                                t.status === 'Review' ? 'bg-amber-50 text-amber-600' :
                                'bg-slate-100 text-slate-500'
                              )}>{(t.title || '').substring(0, 20)}</span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {linkedRuns.length === 0 ? (
                          <span className="text-slate-300">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {linkedRuns.map((r: any) => (
                              <span key={r.id} className={cn(
                                "text-[9px] font-bold px-1.5 py-0.5 rounded",
                                r.status === 'Passed' ? 'bg-green-50 text-green-600' :
                                r.status === 'Failed' ? 'bg-red-50 text-red-500' :
                                'bg-slate-100 text-slate-500'
                              )}>{(r.name || r.group || r.status || '').substring(0, 15)}</span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {linkedBugs.length === 0 ? (
                          <span className="text-emerald-400 text-[10px]">✓ None</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {linkedBugs.map((b: any) => (
                              <span key={b.id} className={cn(
                                "text-[9px] font-bold px-1.5 py-0.5 rounded",
                                b.status === 'Resolved' || b.status === 'Closed' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'
                              )}>{(b.title || '').substring(0, 20)}</span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {fullyCovered ? (
                          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">✓ Covered</span>
                        ) : hasTasks || hasTests ? (
                          <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Partial</span>
                        ) : (
                          <span className="text-[10px] font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded-full">Uncovered</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Autonomous Swarm Panel */}
      <AutonomousPanel />

      {loading ? (
        <div className="p-8 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Loading Swarm Data...</p>
          </div>
        </div>
      ) : null}
    </motion.div>
  );
}
