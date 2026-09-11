import React, { useState, useEffect } from 'react';
import { cn } from '@/src/lib/utils';
import { 
  ClipboardCheck, Plus,
  CheckCircle2, Clock, Trash2, Link, PanelRight, PanelRightClose
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useProject } from '../lib/ProjectContext';
import apiClient from '../lib/api-client';
import type { Requirement } from '../lib/types';
import DetailPanel, { type DetailItem } from './DetailPanel';
import BulkActionBar from './BulkActionBar';
import { FilterBar, applyFilterChips, sprintChipMatcher, type FilterFieldDef } from './FilterBar';

// (STATUS_OPTIONS moved into FilterBar field config)

const STATUS_COLORS: Record<string, string> = {
  'Pending': 'bg-amber-100 text-amber-700 border-amber-200',
  'Verified': 'bg-green-100 text-green-700 border-green-200',
};

export default function RequirementsView() {
  const { isAuthenticated } = useAuth();
  const { projectId } = useProject();
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [sprints, setSprints] = useState<any[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [selectedItem, setSelectedItem] = useState<DetailItem | null>(null);
  const [showDetailPanel, setShowDetailPanel] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkProcessing, setBulkProcessing] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      setRequirements([]);
      setLoading(false);
      return;
    }

    let mounted = true;

    const fetchRequirements = async () => {
      try {
        // Fetch all requirements without server-side filtering
        const data = await apiClient.requirements.list();
        if (!mounted) return;
        setRequirements(data);
        setError(null);
      } catch (err) {
        if (!mounted) return;
        console.error('Failed to fetch requirements:', err);
        setError(err instanceof Error ? err.message : 'Failed to load requirements');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchRequirements();
    return () => { mounted = false; };
  }, [isAuthenticated]);

  // Load sprints for filter options
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    apiClient.sprints.list(projectId || undefined)
      .then(list => { if (!cancelled) setSprints(list); })
      .catch(() => {/* silently ignore — sprint filter stays empty */});
    return () => { cancelled = true; };
  }, [isAuthenticated, projectId]);

  const releaseSuggestions = React.useMemo(
    () => Array.from(new Set(requirements.map(r => r.release).filter(Boolean))) as string[],
    [requirements]
  );

  const reqFilterFields: FilterFieldDef[] = React.useMemo(() => [
    { key: 'sprintId', label: 'Sprint', type: 'select', options: sprints.map((s: any) => ({ value: s.id, label: s.name })) },
    { key: 'release', label: 'Release', type: 'text', suggestions: releaseSuggestions, placeholder: 'e.g. R1.2' },
    { key: 'status', label: 'Status', type: 'select', options: [
      { value: 'Pending', label: 'Pending' },
      { value: 'Verified', label: 'Verified' }
    ] }
  ], [sprints, releaseSuggestions]);

  const filteredRequirements = applyFilterChips(requirements
    .filter(r => {
      // Client-side project filtering
      if (projectId && r.projectId !== projectId) return false;
      return true;
    })
    .filter(r => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (r.title || '').toLowerCase().includes(q) ||
             (r.description || '').toLowerCase().includes(q);
    }), activeFilters, sprintChipMatcher(sprints));

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    try {
      const req = await apiClient.requirements.create({
        title: newTitle.trim(),
        status: 'Pending',
        ownerId: '',
      });
      setRequirements(prev => [req, ...prev]);
      setNewTitle('');
      setShowCreateForm(false);
    } catch (err) {
      console.error('Failed to create requirement:', err);
    }
  };

  const handleToggleStatus = async (reqId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'Pending' ? 'Verified' : 'Pending';
    try {
      await apiClient.requirements.update(reqId, { status: newStatus });
      setRequirements(prev => prev.map(r => r.id === reqId ? { ...r, status: newStatus } : r));
    } catch (err) {
      console.error('Failed to update requirement:', err);
    }
  };

  const handleDelete = async (reqId: string) => {
    if (!confirm('Delete this requirement? This cannot be undone.')) return;
    try {
      await apiClient.requirements.delete(reqId);
      setRequirements(prev => prev.filter(r => r.id !== reqId));
    } catch (err) {
      console.error('Failed to delete requirement:', err);
    }
  };

  const handleRequirementClick = (requirement: Requirement) => {
    setSelectedItem({ type: 'requirement', data: requirement });
    setShowDetailPanel(true);
  };

  const handleEditComplete = () => {
    // Refresh requirements if needed
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
    if (selectedIds.size === filteredRequirements.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredRequirements.map(r => r.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Delete ${selectedIds.size} requirement(s)? This cannot be undone.`)) return;
    try {
      setBulkProcessing(true);
      await Promise.all([...selectedIds].map(id => apiClient.requirements.delete(id)));
      setSelectedIds(new Set());
      const data = await apiClient.requirements.list();
      setRequirements(data);
    } catch (err) {
      console.error('Bulk delete failed:', err);
      alert('Some requirements could not be deleted.');
    } finally {
      setBulkProcessing(false);
    }
  };

  const handleBulkStatusChange = async (status: string) => {
    try {
      setBulkProcessing(true);
      await Promise.all([...selectedIds].map(id => apiClient.requirements.update(id, { status })));
      setSelectedIds(new Set());
      const data = await apiClient.requirements.list();
      setRequirements(data);
    } catch (err) {
      console.error('Bulk status update failed:', err);
      alert('Some requirements could not be updated.');
    } finally {
      setBulkProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Loading Requirements...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex overflow-hidden">
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto">
          {/* Header with Stats */}
          <div className="flex items-center justify-between shrink-0">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Requirements</h2>
              <p className="text-sm text-slate-500 mt-1">
                {filteredRequirements.filter(r => r.status === 'Pending').length} pending, {filteredRequirements.filter(r => r.status === 'Verified').length} verified
              </p>
            </div>
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-semibold hover:bg-slate-800 transition-all flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Requirement
            </button>
          </div>

          {/* Create Form */}
          {showCreateForm && (
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm shrink-0">
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                placeholder="Enter requirement title..."
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 mb-3"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    setShowCreateForm(false);
                    setNewTitle('');
                  }}
                  className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  Create
                </button>
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="flex items-start gap-3 shrink-0">
            <div className="flex-1 min-w-0">
              <FilterBar
                fields={reqFilterFields}
                active={activeFilters}
                onChange={setActiveFilters}
                search={searchQuery}
                onSearchChange={setSearchQuery}
                searchPlaceholder="Search requirements..."
              />
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

          {/* Requirements List */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm flex-1 flex flex-col min-h-0">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
              <h3 className="font-display font-bold text-slate-900">
                {filteredRequirements.length} {filteredRequirements.length === 1 ? 'Requirement' : 'Requirements'}
              </h3>
              {filteredRequirements.length > 0 && (
                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-500">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === filteredRequirements.length && filteredRequirements.length > 0}
                    onChange={toggleSelectAll}
                    className="w-3.5 h-3.5 rounded border-slate-300"
                  />
                  Select All
                </label>
              )}
            </div>

            {/* Bulk Actions Bar */}
            {filteredRequirements.length > 0 && (
              <BulkActionBar
                selectedCount={selectedIds.size}
                onSelectAll={toggleSelectAll}
                allSelected={selectedIds.size === filteredRequirements.length && filteredRequirements.length > 0}
                onDelete={handleBulkDelete}
                statusOptions={[
                  { value: 'Pending', label: 'Pending' },
                  { value: 'Verified', label: 'Verified' },
                ]}
                onStatusChange={handleBulkStatusChange}
                onClear={() => setSelectedIds(new Set())}
                isProcessing={bulkProcessing}
              />
            )}

            {filteredRequirements.length === 0 ? (
              <div className="p-12 text-center">
                <ClipboardCheck className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                <p className="text-sm text-slate-500 font-medium">No requirements found</p>
                <p className="text-xs text-slate-400 mt-1">
                  {searchQuery || Object.keys(activeFilters).length ? 'Try adjusting filters' : 'Create your first requirement to get started'}
                </p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto">
                {filteredRequirements.map((req) => (
                  <div
                    key={req.id}
                    className="px-6 py-4 flex items-center gap-4 hover:bg-slate-50 transition-colors group border-b border-slate-100 last:border-b-0"
                  >
                    {/* Checkbox */}
                    <input
                      type="checkbox"
                      checked={selectedIds.has(req.id)}
                      onChange={() => toggleSelect(req.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-3.5 h-3.5 rounded border-slate-300 shrink-0"
                    />

                    {/* Status Toggle */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleStatus(req.id, req.status);
                      }}
                      className={cn(
                        'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors',
                        STATUS_COLORS[req.status]?.split(' ')[0] || 'bg-slate-100'
                      )}
                      title={`Mark as ${req.status === 'Pending' ? 'Verified' : 'Pending'}`}
                    >
                      {req.status === 'Verified' ? (
                        <CheckCircle2 className={cn('w-4 h-4', STATUS_COLORS[req.status]?.split(' ')[1])} />
                      ) : (
                        <Clock className={cn('w-4 h-4', STATUS_COLORS[req.status]?.split(' ')[1])} />
                      )}
                    </button>

                    {/* Requirement Info */}
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleRequirementClick(req)}>
                      <h4 className="text-sm font-bold text-slate-900 truncate">
                        {req.title || 'Untitled Requirement'}
                      </h4>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className={cn(
                          'text-[10px] font-bold px-2 py-0.5 rounded-full border',
                          STATUS_COLORS[req.status] || 'bg-slate-50 text-slate-500 border-slate-200'
                        )}>
                          {req.status}
                        </span>
                        {req.taskId && (
                          <span className="text-[10px] text-slate-400 flex items-center gap-1">
                            <Link className="w-3 h-3" />
                            Linked to task
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(req.id);
                      }}
                      className="p-2 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
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