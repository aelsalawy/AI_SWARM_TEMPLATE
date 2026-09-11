import { useId, useState } from 'react';
import { Filter, Plus, X } from 'lucide-react';

export interface FilterFieldDef {
  key: string;
  label: string;
  type: 'select' | 'text';
  options?: { value: string; label: string }[];
  suggestions?: string[];
  placeholder?: string;
}

interface FilterBarProps {
  fields: FilterFieldDef[];
  active: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  search: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder?: string;
  accent?: 'blue' | 'red';
}

/**
 * Structured AND-filter bar: free-text search + chip filters (Field = Value).
 * Chips are AND-combined. Add a filter via field/value selects; remove via ×.
 */
export function FilterBar({
  fields,
  active,
  onChange,
  search,
  onSearchChange,
  searchPlaceholder = 'Search...',
  accent = 'blue'
}: FilterBarProps) {
  const [fieldKey, setFieldKey] = useState('');
  const [value, setValue] = useState('');
  const datalistId = useId();

  const available = fields.filter(f => !(f.key in active));
  const selectedField = available.find(f => f.key === fieldKey) || null;
  const ring = accent === 'red' ? 'focus:ring-red-500/20' : 'focus:ring-blue-500/20';

  const addFilter = () => {
    if (!selectedField || !value.trim()) return;
    onChange({ ...active, [selectedField.key]: value.trim() });
    setValue('');
    setFieldKey('');
  };

  const removeFilter = (key: string) => {
    const next = { ...active };
    delete next[key];
    onChange(next);
  };

  const valueLabel = (f: FilterFieldDef, v: string) =>
    f.options?.find(o => o.value === v)?.label ?? v;

  const activeDefs = Object.keys(active)
    .map(key => fields.find(f => f.key === key))
    .filter((f): f is FilterFieldDef => Boolean(f));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {/* Field select */}
        <select
          value={fieldKey}
          onChange={(e) => { setFieldKey(e.target.value); setValue(''); }}
          className="text-sm bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 focus:outline-none focus:ring-2"
          title="Filter field"
        >
          <option value="">Filter by...</option>
          {available.map(f => (
            <option key={f.key} value={f.key}>{f.label}</option>
          ))}
        </select>

        {/* Value select/input for chosen field */}
        {selectedField?.type === 'select' && (
          <select
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="text-sm bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 focus:outline-none focus:ring-2"
            title="Value"
          >
            <option value="">Value...</option>
            {selectedField.options?.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        )}
        {selectedField?.type === 'text' && (
          <>
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addFilter(); }}
              list={datalistId}
              placeholder={selectedField.placeholder || 'Value...'}
              className={`text-sm bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 focus:outline-none focus:ring-2 ${ring}`}
            />
            <datalist id={datalistId}>
              {(selectedField.suggestions || []).map(s => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </>
        )}

        {/* Add chip */}
        <button
          onClick={addFilter}
          disabled={!selectedField || !value.trim()}
          className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title="Add filter (AND)"
        >
          <Plus className="w-4 h-4" />
        </button>

        <div className="flex-1" />

        {/* Free-text search */}
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className={`w-56 text-sm bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 focus:outline-none focus:ring-2 ${ring}`}
        />
      </div>

      {activeDefs.length > 0 && (
        <div className="flex items-center flex-wrap gap-2">
          {activeDefs.map((f, idx) => (
            <span key={f.key} className="inline-flex items-center gap-1.5 bg-slate-100 border border-slate-200 rounded-full pl-3 pr-1.5 py-1 text-xs text-slate-700">
              {idx > 0 && <span className="text-slate-400 font-medium mr-1">AND</span>}
              <span className="font-medium">{f.label}</span>
              <span className="text-slate-400">=</span>
              <span>{valueLabel(f, active[f.key])}</span>
              <button
                onClick={() => removeFilter(f.key)}
                className="p-0.5 rounded-full hover:bg-slate-300 text-slate-500 transition-colors"
                title={`Remove ${f.label} filter`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** AND-combine chip filters over an already-search-filtered list. Optional per-key matchers override the strict equality default. */
export type ChipMatchers<T> = Partial<Record<string, (item: T, chip: string) => boolean>>;

export function applyFilterChips<T extends Record<string, unknown>>(items: T[], active: Record<string, string>, matchers?: ChipMatchers<T>): T[] {
  const keys = Object.keys(active);
  if (!keys.length) return items;
  return items.filter(it => keys.every(k => {
    const m = matchers?.[k];
    return m ? m(it, active[k]) : String(it[k] ?? '') === active[k];
  }));
}

/** Sprint chips: match rows whose sprintId column stores either the sprint id
 *  (modern) or the sprint NAME (legacy rows, e.g. 'Sprint2'). Mirrors the
 *  server GET /tasks sprint filter (cf7b302) and SprintAnalytics tasksInSprint.
 *  (ALM bug cmtsxqyid000np5lcw4wje0xo follow-up) */
export function sprintChipMatcher<T extends Record<string, unknown>>(sprints: Array<{ id?: unknown; name?: unknown }>): ChipMatchers<T> {
  return {
    sprintId: (it, chip) => {
      const v = String(it.sprintId ?? '');
      if (v === chip) return true;
      const s = sprints.find(sp => String(sp.id ?? '') === chip);
      return !!s && s.name != null && v === String(s.name);
    },
  };
}