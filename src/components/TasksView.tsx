import React, { useState, useEffect } from 'react';
import { cn } from '@/src/lib/utils';
import { 
  Bot, Plus, RefreshCw, 
  LayoutGrid, List, PanelRight, PanelRightClose
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useProject } from '../lib/ProjectContext';
import apiClient from '../lib/api-client';
import type { Task, Agent } from '../lib/types';
import TasksBoard from './TasksBoard';
import DetailPanel, { type DetailItem } from './DetailPanel';
import BulkActionBar from './BulkActionBar';
import { FilterBar, applyFilterChips, sprintChipMatcher, type FilterFieldDef } from './FilterBar';

const STATUS_COLORS: Record<string, string> = {
  'TODO': 'bg-slate-100 text-slate-700',
  'IN_PROGRESS': 'bg-blue-100 text-blue-700',
  'REVIEW': 'bg-amber-100 text-amber-700',
  'DONE': 'bg-green-100 text-green-700',
};

const PRIORITY_COLORS: Record<string, string> = {
  'Low': 'bg-slate-50 text-slate-500',
  'Medium': 'bg-blue-50 text-blue-600',
  'High': 'bg-amber-50 text-amber-600',
  'Urgent': 'bg-red-50 text-red-600',
};

export default function TasksView() {
  const { isAuthenticated } = useAuth();
  const { projectId } = useProject();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('kanban');
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [sprints, setSprints] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<DetailItem | null>(null);
  const [showDetailPanel, setShowDetailPanel] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkProcessing, setBulkProcessing] = useState(false);

  const fetchTasks = async () => {
    try {
      setLoading(true);
      setError(null);
      const filters: any = {};
      if (projectId) filters.projectId = projectId;
      const list = await apiClient.tasks.list(filters);
      setTasks(list);
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
      setError('Failed to load tasks');
    } finally {
      setLoading(false);
    }
  };

  // Load agents for the assigned-agent filter and avatar/name display
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    apiClient.agents.list()
      .then(list => { if (!cancelled) setAgents(list); })
      .catch(() => {/* silently ignore — filter stays empty */});
    apiClient.sprints.list(projectId || undefined)
      .then(list => { if (!cancelled) setSprints(list); })
      .catch(() => {/* silently ignore — sprint filter stays empty */});
    return () => { cancelled = true; };
  }, [isAuthenticated, projectId]);

  // Build a lookup map from agent id -> agent for avatar/name resolution
  const agentById = React.useMemo(() => {
    const map = new Map<string, Agent>();
    agents.forEach(a => { if (a.id) map.set(a.id, a); });
    return map;
  }, [agents]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchTasks();
    } else {
      setLoading(false);
    }
  }, [isAuthenticated, projectId]);

  const handleTaskClick = (task: Task) => {
    setSelectedItem({ type: 'task', data: task });
    setShowDetailPanel(true);
  };

  const handleEditComplete = () => {
    fetchTasks();
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleDetailPanel = () => {
    setShowDetailPanel(prev => !prev);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredTasks.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredTasks.map(t => t.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Delete ${selectedIds.size} task(s)? This cannot be undone.`)) return;
    try {
      setBulkProcessing(true);
      await Promise.all([...selectedIds].map(id => apiClient.tasks.delete(id)));
      setSelectedIds(new Set());
      await fetchTasks();
    } catch (err) {
      console.error('Bulk delete failed:', err);
      alert('Some tasks could not be deleted.');
    } finally {
      setBulkProcessing(false);
    }
  };

  const handleBulkStatusChange = async (status: string) => {
    try {
      setBulkProcessing(true);
      await Promise.all([...selectedIds].map(id => apiClient.tasks.update(id, { status })));
      setSelectedIds(new Set());
      await fetchTasks();
    } catch (err) {
      console.error('Bulk status update failed:', err);
      alert('Some tasks could not be updated.');
    } finally {
      setBulkProcessing(false);
    }
  };

  const releaseSuggestions = React.useMemo(
    () => Array.from(new Set(tasks.map(t => t.release).filter(Boolean))) as string[],
    [tasks]
  );

  const taskFilterFields: FilterFieldDef[] = React.useMemo(() => [
    { key: 'assignedAgentId', label: 'Agent', type: 'select', options: agents.filter(a => a.id).map(a => ({ value: a.id as string, label: (a.name as string) || (a.id as string) })) },
    { key: 'sprintId', label: 'Sprint', type: 'select', options: sprints.map((s: any) => ({ value: s.id, label: s.name })) },
    { key: 'release', label: 'Release', type: 'text', suggestions: releaseSuggestions, placeholder: 'e.g. R1.2' },
    { key: 'status', label: 'Status', type: 'select', options: [
      { value: 'TODO', label: 'To Do' },
      { value: 'IN_PROGRESS', label: 'In Progress' },
      { value: 'REVIEW', label: 'Review' },
      { value: 'DONE', label: 'Done' }
    ] },
    { key: 'priority', label: 'Priority', type: 'select', options: [
      { value: 'Low', label: 'Low' },
      { value: 'Medium', label: 'Medium' },
      { value: 'High', label: 'High' },
      { value: 'Urgent', label: 'Urgent' }
    ] }
  ], [agents, sprints, releaseSuggestions]);

  const filteredTasks = applyFilterChips(tasks.filter(task => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (task.title || '').toLowerCase().includes(q) || 
             (task.description || '').toLowerCase().includes(q);
    }
    return true;
  }), activeFilters, sprintChipMatcher(sprints));

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Loading Tasks...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <p className="text-sm text-red-600">{error}</p>
          <button
            onClick={fetchTasks}
            className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-semibold hover:bg-slate-800 transition-all"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex overflow-hidden">
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto">
          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 shrink-0">
            <div className="glass-panel p-3 rounded-xl flex flex-col">
              <div className="flex justify-between items-start mb-2">
                <div className="p-2 bg-slate-100 rounded-lg">
                  <Bot className="w-4 h-4 text-slate-600" />
                </div>
              </div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Total</p>
              <h4 className="font-display text-xl font-bold text-slate-900">{tasks.length}</h4>
            </div>

            <div className="glass-panel p-3 rounded-xl flex flex-col">
              <div className="flex justify-between items-start mb-2">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <div className="w-4 h-4 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
                </div>
              </div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">In Progress</p>
              <h4 className="font-display text-xl font-bold text-blue-600">{tasks.filter(t => t.status === 'IN_PROGRESS').length}</h4>
            </div>

            <div className="glass-panel p-3 rounded-xl flex flex-col">
              <div className="flex justify-between items-start mb-2">
                <div className="p-2 bg-amber-50 rounded-lg">
                  <div className="w-4 h-4 rounded-full border-2 border-amber-600 border-t-transparent animate-spin" />
                </div>
              </div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Review</p>
              <h4 className="font-display text-xl font-bold text-amber-600">{tasks.filter(t => t.status === 'REVIEW').length}</h4>
            </div>

            <div className="glass-panel p-3 rounded-xl flex flex-col">
              <div className="flex justify-between items-start mb-2">
                <div className="p-2 bg-green-50 rounded-lg">
                  <div className="w-4 h-4 rounded-full border-2 border-green-600 border-t-transparent animate-spin" />
                </div>
              </div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Done</p>
              <h4 className="font-display text-xl font-bold text-green-600">{tasks.filter(t => t.status === 'DONE').length}</h4>
            </div>
          </div>

          {/* Header with Search, View Toggle, Filters */}
          <div className="flex items-start gap-3 shrink-0">
            <div className="flex-1 min-w-0">
              <FilterBar
                fields={taskFilterFields}
                active={activeFilters}
                onChange={setActiveFilters}
                search={searchQuery}
                onSearchChange={setSearchQuery}
                searchPlaceholder="Search tasks..."
              />
            </div>

            <button
              onClick={fetchTasks}
              className="p-2 hover:bg-slate-200 rounded-lg text-slate-400 transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            {/* View Mode Toggle */}
            <div className="flex items-center bg-slate-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode('list')}
                className={cn(
                  'p-1.5 rounded-md transition-all',
                  viewMode === 'list' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'
                )}
                title="List View"
              >
                <List className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('kanban')}
                className={cn(
                  'p-1.5 rounded-md transition-all',
                  viewMode === 'kanban' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'
                )}
                title="Kanban View"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>

            {/* Detail Panel Toggle */}
            <button
              onClick={toggleDetailPanel}
              className={cn(
                'p-2 rounded-lg transition-colors cursor-pointer',
                showDetailPanel ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              )}
              title={showDetailPanel ? 'Hide Detail Panel' : 'Show Detail Panel'}
              type="button"
            >
              {showDetailPanel ? <PanelRightClose className="w-4 h-4" /> : <PanelRight className="w-4 h-4" />}
            </button>
          </div>

          {/* Task List / Kanban Board */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm flex-1 flex flex-col min-h-0">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
              <h3 className="font-display font-bold text-slate-900">
                Tasks ({filteredTasks.length})
              </h3>
              {viewMode === 'list' && filteredTasks.length > 0 && (
                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-500">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === filteredTasks.length && filteredTasks.length > 0}
                    onChange={toggleSelectAll}
                    className="w-3.5 h-3.5 rounded border-slate-300"
                  />
                  Select All
                </label>
              )}
            </div>

            {/* Bulk Actions Bar */}
            {viewMode === 'list' && (
              <BulkActionBar
                selectedCount={selectedIds.size}
                onSelectAll={toggleSelectAll}
                allSelected={selectedIds.size === filteredTasks.length && filteredTasks.length > 0}
                onDelete={handleBulkDelete}
                statusOptions={[
                  { value: 'TODO', label: 'To Do' },
                  { value: 'IN_PROGRESS', label: 'In Progress' },
                  { value: 'REVIEW', label: 'Review' },
                  { value: 'DONE', label: 'Done' },
                ]}
                onStatusChange={handleBulkStatusChange}
                onClear={() => setSelectedIds(new Set())}
                isProcessing={bulkProcessing}
              />
            )}

            {/* Kanban View */}
            {viewMode === 'kanban' && (
              <div className="flex-1 overflow-hidden min-h-0">
                <TasksBoard tasks={filteredTasks} onTaskClick={handleTaskClick} onStatusUpdate={fetchTasks} />
              </div>
            )}

            {/* List View */}
            {viewMode === 'list' && (
              <div className="flex-1 overflow-y-auto">
                {filteredTasks.length === 0 ? (
                  <div className="p-12 text-center">
                    <Bot className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                    <p className="text-sm text-slate-500 font-medium">No tasks found</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {searchQuery || Object.keys(activeFilters).length ? 'Try adjusting filters' : 'Create your first task to get started'}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {filteredTasks.map((task) => (
                      <div
                        key={task.id}
                        className="px-6 py-4 flex items-center gap-4 hover:bg-slate-50 transition-colors"
                      >
                        {/* Checkbox */}
                        <input
                          type="checkbox"
                          checked={selectedIds.has(task.id)}
                          onChange={() => toggleSelect(task.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-3.5 h-3.5 rounded border-slate-300 shrink-0"
                        />

                        {/* Status Badge */}
                        <span
                          onClick={() => handleTaskClick(task)}
                          className={cn(
                            'text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 cursor-pointer',
                            STATUS_COLORS[task.status] || 'bg-slate-50 text-slate-500 border-slate-200'
                          )}
                        >
                          {task.status === 'TODO' ? 'To Do' : task.status === 'IN_PROGRESS' ? 'In Progress' : task.status}
                        </span>

                        {/* Task Info */}
                        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleTaskClick(task)}>
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-bold text-slate-900 truncate">
                              {task.title || 'Untitled Task'}
                            </h4>
                            <span className={cn(
                              'text-[10px] font-bold px-2 py-0.5 rounded-full',
                              PRIORITY_COLORS[task.priority as string] || 'bg-slate-50 text-slate-500'
                            )}>
                              {task.priority || 'Medium'}
                            </span>
                          </div>
                          {task.description && (
                            <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">
                              {task.description}
                            </p>
                          )}
                          {task.epic && (
                            <span className="text-[10px] text-slate-400 font-medium">
                              {task.epic}
                            </span>
                          )}
                        </div>

                        {/* Assigned Agent */}
                        <div className="text-xs text-slate-400 flex items-center gap-1 shrink-0" onClick={() => handleTaskClick(task)}>
                          <Bot className="w-3.5 h-3.5" />
                          <span>{task.assignedAgentId ? 'Assigned' : 'Unassigned'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Persistent Detail Panel - Fixed Width, No Animation */}
      {showDetailPanel && (
        <div className="w-96 flex-shrink-0 border-l border-slate-200 bg-white overflow-hidden h-full">
          <DetailPanel
            item={selectedItem}
            onClose={() => setSelectedItem(null)}
            onEditComplete={handleEditComplete}
          />
        </div>
      )}
    </div>
  );
}