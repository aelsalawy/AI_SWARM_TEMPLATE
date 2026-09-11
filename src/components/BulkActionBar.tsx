import React from 'react';
import { Trash2, X, Loader2, CheckCircle2 } from 'lucide-react';
import { cn } from '@/src/lib/utils';

interface BulkActionBarProps {
  selectedCount: number;
  onSelectAll: () => void;
  allSelected: boolean;
  onDelete: () => void;
  statusOptions?: { value: string; label: string }[];
  onStatusChange?: (status: string) => void;
  onClear: () => void;
  isProcessing?: boolean;
}

export default function BulkActionBar({
  selectedCount,
  onSelectAll,
  allSelected,
  onDelete,
  statusOptions,
  onStatusChange,
  onClear,
  isProcessing = false,
}: BulkActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-blue-50 border-b border-blue-100 shrink-0">
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={onSelectAll}
          className="w-3.5 h-3.5 rounded border-slate-300"
        />
        <span className="text-xs font-semibold text-slate-700">
          {selectedCount} selected
        </span>
      </label>

      <div className="flex-1" />

      {isProcessing && (
        <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
      )}

      {/* Mass status update */}
      {statusOptions && statusOptions.length > 0 && onStatusChange && (
        <select
          value=""
          onChange={(e) => { if (e.target.value) onStatusChange(e.target.value); }}
          disabled={isProcessing}
          className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50"
          defaultValue=""
        >
          <option value="" disabled>Set status...</option>
          {statusOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      )}

      {/* Delete button */}
      <button
        onClick={onDelete}
        disabled={isProcessing}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
          'bg-red-600 text-white hover:bg-red-700 disabled:opacity-50'
        )}
      >
        <Trash2 className="w-3.5 h-3.5" />
        Delete
      </button>

      {/* Clear selection */}
      <button
        onClick={onClear}
        disabled={isProcessing}
        className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-400 transition-colors"
        title="Clear selection"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
