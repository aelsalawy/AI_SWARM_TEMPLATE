import React, { useState, useEffect } from 'react';
import { cn } from '@/src/lib/utils';
import { Bug, AlertCircle, CheckCircle2, Clock, ArrowUpCircle, RefreshCw, PanelRight, PanelRightClose, LayoutGrid, List } from 'lucide-react';
import apiClient from '../lib/api-client';
import { useAuth } from '../contexts/AuthContext';
import { useProject } from '../lib/ProjectContext';
import type { Bug as BugType, Agent } from '../lib/types';
import DetailPanel, { type DetailItem } from './DetailPanel';
import BulkActionBar from './BulkActionBar';
import BugsBoard from './BugsBoard';
import { FilterBar, applyFilterChips, sprintChipMatcher, type FilterFieldDef } from './FilterBar';

const STATUS_COLORS: Record<string, string> = {
  'Open': 'bg-red-100 text-red-700 border-red-200',
  'In Progress': 'bg-blue-100 text-blue-700 border-blue-200',
  'In_Progress': 'bg-blue-100 text-blue-700 border-blue-200',
  'Resolved': 'bg-green-100 text-green-700 border-green-200',
  'Closed': 'bg-slate-100 text-slate-500 border-slate-200',
};

const PRIORITY_COLORS: Record<string, string> = {
  'Low': 'bg-slate-50 text-slate-500',
  'Medium': 'bg-blue-50 text-blue-600',
  'High': 'bg-amber-50 text-amber-600',
  'Critical': 'bg-red-50 text-red-600',
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  'Open': <AlertCircle className="w-4 h-4" />,
  'In Progress': <ArrowUpCircle className="w-4 h-4" />,
  'In_Progress': <ArrowUpCircle className="w-4 h-4" />,
  'Resolved': <CheckCircle2 className="w-4 h-4" />,
  'Closed': <Clock className="w-4 h-4" />,
};

export default function BugsView() {
  const { isAuthenticated } = useAuth();
  const { projectId } = useProject();
  const [bugs, setBugs] = useState<BugType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [sprints, setSprints] = useState<any[]>([]);
  const [selectedItem, setSelectedItem] = useState<DetailItem | null>(null);
  const [showDetailPanel, setShowDetailPanel] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkProcessing, setBulkProcessing] = useState(false);

  const fetchBugs = async () => {
    try {
      setLoading(true);
      setError(null);
      const filters: any = {};
      if (projectId) filters.projectId = projectId;
      const list = await apiClient.bugs.list(filters);
      setBugs(list);
    } catch (err) {
      console.error('Failed to fetch bugs:', err);
      setError('Failed to load bugs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchBugs();
    } else {
      setLoading(false);
    }
  }, [isAuthenticated, projectId]);

  // Load agents + sprints for filter options
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    apiClient.agents.list()
      .then(list => { if (!cancelled) setAgents(list); })
      .catch(() => {/* silently ignore — agent filter stays empty */});
    apiClient.sprints.list(projectId || undefined)
      .then(list => { if (!cancelled) setSprints(list); })
      .catch(() => {/* silently ignore — sprint filter stays empty */});
    return () => { cancelled = true; };
  }, [isAuthenticated, projectId]);

  const openCount = bugs.filter(b => b.status === 'Open').length;
  const inProgressCount = bugs.filter(b => b.status === 'In Progress' || b.status === 'In_Progress').length;
  const resolvedCount = bugs.filter(b => b.status === 'Resolved').length;
  const closedCount = bugs.filter(b => b.status === 'Closed').length;

  const normalizeStatus = (status?: string): string => {
    if (!status) return 'Open';
    if (status === 'In_Progress') return 'In Progress';
    return status;
  };

  const handleBugClick = (bug: BugType) => {
    setSelectedItem({ type: 'bug', data: bug });
    setShowDetailPanel(true);
  };

  const handleEditComplete = () => {
    fetchBugs();
  };

  const handleStatusUpdate = () => {
    fetchBugs();
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredBugs.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredBugs.map(b => b.id)));
    }
  };

  // Normalize status for comparison (backend uses In_Progress, dropdown uses "In Progress")
  // (status normalization helper removed — filter chips now use DB enum values directly)

  const releaseSuggestions = React.useMemo(
    () => Array.from(new Set(bugs.map(b => b.release).filter(Boolean))) as string[],
    [bugs]
  );

  const bugFilterFields: FilterFieldDef[] = React.useMemo(() => [
    { key: 'assignedAgentId', label: 'Agent', type: 'select', options: agents.filter(a => a.id).map(a => ({ value: a.id as string, label: (a.name as string) || (a.id as string) })) },
    { key: 'sprintId', label: 'Sprint', type: 'select', options: sprints.map((s: any) => ({ value: s.id, label: s.name })) },
    { key: 'release', label: 'Release', type: 'text', suggestions: releaseSuggestions, placeholder: 'e.g. R1.2' },
    { key: 'status', label: 'Status', type: 'select', options: [
      { value: 'Open', label: 'Open' },
      { value: 'In_Progress', label: 'In Progress' },
      { value: 'Resolved', label: 'Resolved' },
      { value: 'Closed', label: 'Closed' }
    ] },
    { key: 'priority', label: 'Priority', type: 'select', options: [
      { value: 'Low', label: 'Low' },
      { value: 'Medium', label: 'Medium' },
      { value: 'High', label: 'High' },
      { value: 'Critical', label: 'Critical' }
    ] }
  ], [agents, sprints, releaseSuggestions]);

  const filteredBugs = applyFilterChips(bugs.filter(bug => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (bug.title || '').toLowerCase().includes(q) ||
             (bug.description || '').toLowerCase().includes(q);
    }
    return true;
  }), activeFilters, sprintChipMatcher(sprints));

  const handleBulkDelete = async () => {
    if (!confirm(`Delete ${selectedIds.size} bug(s)? This cannot be undone.`)) return;
    try {
      setBulkProcessing(true);
      await Promise.all([...selectedIds].map(id => apiClient.bugs.delete(id)));
      setSelectedIds(new Set());
      await fetchBugs();
    } catch (err) {
      console.error('Bulk delete failed:', err);
      alert('Some bugs could not be deleted.');
    } finally {
      setBulkProcessing(false);
    }
  };

  const handleBulkStatusChange = async (status: string) => {
    try {
      setBulkProcessing(true);
      await Promise.all([...selectedIds].map(id => apiClient.bugs.update(id, { status })));
      setSelectedIds(new Set());
      await fetchBugs();
    } catch (err) {
      console.error('Bulk status update failed:', err);
      alert('Some bugs could not be updated.');
    } finally {
      setBulkProcessing(false);
    }
  };

  const toggleDetailPanel = () => {
    setShowDetailPanel(prev => !prev);
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Loading Bugs...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <AlertCircle className="w-10 h-10 text-red-400" />
          <p className="text-sm text-red-600">{error}</p>
          <button
            onClick={fetchBugs}
            className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-semibold hover:bg-slate-800 transition-all flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
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
                <div className="p-2 bg-red-50 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-red-600" />
                </div>
              </div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Open</p>
              <h4 className="font-display text-xl font-bold text-red-600">{openCount}</h4>
            </div>

            <div className="glass-panel p-3 rounded-xl flex flex-col">
              <div className="flex justify-between items-start mb-2">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <ArrowUpCircle className="w-4 h-4 text-blue-600" />
                </div>
              </div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">In Progress</p>
              <h4 className="font-display text-xl font-bold text-blue-600">{inProgressCount}</h4>
            </div>

            <div className="glass-panel p-3 rounded-xl flex flex-col">
              <div className="flex justify-between items-start mb-2">
                <div className="p-2 bg-green-50 rounded-lg">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                </div>
              </div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Resolved</p>
              <h4 className="font-display text-xl font-bold text-green-600">{resolvedCount}</h4>
            </div>

            <div className="glass-panel p-3 rounded-xl flex flex-col">
              <div className="flex justify-between items-start mb-2">
                <div className="p-2 bg-slate-100 rounded-lg">
                  <Clock className="w-4 h-4 text-slate-600" />
                </div>
              </div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Closed</p>
              <h4 className="font-display text-xl font-bold text-slate-600">{closedCount}</h4>
            </div>
          </div>

          {/* Header with Filter & Toggle */}
          <div className="flex items-start gap-3 shrink-0">
            <div className="flex-1 min-w-0">
              <FilterBar
                fields={bugFilterFields}
                active={activeFilters}
                onChange={setActiveFilters}
                search={searchQuery}
                onSearchChange={setSearchQuery}
                searchPlaceholder="Search bugs..."
                accent="red"
              />
            </div>

            <button
              onClick={fetchBugs}
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

          {/* Bug List / Kanban Board */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm flex-1 flex flex-col min-h-0">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
              <h3 className="font-display font-bold text-slate-900">
                Bugs & Issues ({filteredBugs.length})
              </h3>
              {viewMode === 'list' && filteredBugs.length > 0 && (
                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-500">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === filteredBugs.length && filteredBugs.length > 0}
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
                allSelected={selectedIds.size === filteredBugs.length && filteredBugs.length > 0}
                onDelete={handleBulkDelete}
                statusOptions={[
                  { value: 'Open', label: 'Open' },
                  { value: 'In_Progress', label: 'In Progress' },
                  { value: 'Resolved', label: 'Resolved' },
                  { value: 'Closed', label: 'Closed' },
                ]}
                onStatusChange={handleBulkStatusChange}
                onClear={() => setSelectedIds(new Set())}
                isProcessing={bulkProcessing}
              />
            )}

            {/* Kanban View */}
            {viewMode === 'kanban' && (
              <div className="flex-1 overflow-hidden min-h-0">
                <BugsBoard bugs={filteredBugs} onBugClick={handleBugClick} onStatusUpdate={handleStatusUpdate} />
              </div>
            )}

            {/* List View */}
            {viewMode === 'list' && (
              <div className="flex-1 overflow-y-auto">
                {filteredBugs.length === 0 ? (
                  <div className="p-12 text-center">
                    <Bug className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                    <p className="text-sm text-slate-500 font-medium">No bugs found</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {searchQuery || Object.keys(activeFilters).length ? 'Try adjusting filters' : 'No issues reported yet'}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {filteredBugs.map((bug) => {
                      const status = normalizeStatus(bug.status);
                      return (
                        <div
                          key={bug.id}
                          className="px-6 py-4 flex items-center gap-4 hover:bg-slate-50 transition-colors"
                        >
                          {/* Checkbox */}
                          <input
                            type="checkbox"
                            checked={selectedIds.has(bug.id)}
                            onChange={() => toggleSelect(bug.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-3.5 h-3.5 rounded border-slate-300 shrink-0"
                          />

                          {/* Status Icon */}
                          <div
                            onClick={() => handleBugClick(bug)}
                            className={cn(
                              'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 cursor-pointer',
                              STATUS_COLORS[status]?.split(' ')[0] || 'bg-slate-100'
                            )}
                          >
                            <span className={STATUS_COLORS[status]?.split(' ')[1] || 'text-slate-500'}>
                              {STATUS_ICONS[status]}
                            </span>
                          </div>

                          {/* Bug Info */}
                          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleBugClick(bug)}>
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-bold text-slate-900 truncate">
                                {bug.title || 'Untitled Bug'}
                              </h4>
                              <span className={cn(
                                'text-[10px] font-bold px-2 py-0.5 rounded-full',
                                PRIORITY_COLORS[bug.priority as string] || 'bg-slate-50 text-slate-500'
                              )}>
                                {bug.priority || 'Medium'}
                              </span>
                            </div>
                            {bug.description && (
                              <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">
                                {bug.description}
                              </p>
                            )}
                          </div>

                          {/* Status Badge */}
                          <span
                            onClick={() => handleBugClick(bug)}
                            className={cn(
                              'text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 cursor-pointer',
                              STATUS_COLORS[status] || 'bg-slate-50 text-slate-500 border-slate-200'
                            )}
                          >
                            {status}
                          </span>
                        </div>
                      );
                    })}
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