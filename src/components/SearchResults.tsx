import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { 
  Search, X, ListTodo, BugIcon, ClipboardCheck, 
  Bot, FolderKanban, Loader2, ArrowRight
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../lib/api-client';
import type { Task, Bug, Requirement, Agent, Project } from '../lib/types';

export interface SearchHit {
  type: 'task' | 'bug' | 'requirement' | 'agent' | 'project';
  id: string;
  title: string;
  subtitle?: string;
  status?: string;
  data: any;
}

interface SearchResultsProps {
  onNavigate: (hit: any) => void;
  onClose: () => void;
  searchQuery: string;
}



const TYPE_ICONS: Record<string, typeof ListTodo> = {
  task: ListTodo,
  bug: BugIcon,
  requirement: ClipboardCheck,
  agent: Bot,
  project: FolderKanban,
};

const TYPE_COLORS: Record<string, string> = {
  task: 'bg-blue-100 text-blue-600',
  bug: 'bg-red-100 text-red-600',
  requirement: 'bg-amber-100 text-amber-600',
  agent: 'bg-green-100 text-green-600',
  project: 'bg-purple-100 text-purple-600',
};

export default function SearchResults({ onNavigate, onClose, searchQuery }: SearchResultsProps) {
  const { isAuthenticated } = useAuth();
  const [results, setResults] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isAuthenticated || !searchQuery.trim()) {
      setResults([]);
      return;
    }

    let mounted = true;
    const q = searchQuery.toLowerCase().trim();

    const search = async () => {
      setLoading(true);
      const hits: SearchHit[] = [];

      try {
        // Search tasks
        const tasks = await apiClient.tasks.list();
        if (!mounted) return;
        tasks.forEach(t => {
          if ((t.title || '').toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q)) {
            hits.push({ type: 'task', id: t.id, title: t.title || 'Untitled', subtitle: t.status, status: t.status, data: t });
          }
        });

        // Search bugs
        const bugs = await apiClient.bugs.list();
        if (!mounted) return;
        bugs.forEach(b => {
          if ((b.title || '').toLowerCase().includes(q) || (b.description || '').toLowerCase().includes(q)) {
            hits.push({ type: 'bug', id: b.id, title: b.title || 'Untitled', subtitle: b.status, status: b.status, data: b });
          }
        });

        // Search requirements
        const reqs = await apiClient.requirements.list();
        if (!mounted) return;
        reqs.forEach(r => {
          if ((r.title || '').toLowerCase().includes(q)) {
            hits.push({ type: 'requirement', id: r.id, title: r.title || 'Untitled', subtitle: r.status, status: r.status, data: r });
          }
        });

        // Search agents
        const agents = await apiClient.agents.list();
        if (!mounted) return;
        agents.forEach(a => {
          if ((a.name || '').toLowerCase().includes(q) || (a.role || '').toLowerCase().includes(q)) {
            hits.push({ type: 'agent', id: a.id, title: a.name || 'Unnamed', subtitle: a.role, status: a.status, data: a });
          }
        });

        // Search projects
        const projects = await apiClient.projects.list();
        if (!mounted) return;
        projects.forEach(p => {
          if ((p.name || '').toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q)) {
            hits.push({ type: 'project', id: p.id!, title: p.name || 'Unnamed', subtitle: p.status, status: p.status, data: p });
          }
        });
      } catch (err) {
        console.error('Search error:', err);
      }

      if (!mounted) return;
      setResults(hits);
      setSelectedIndex(0);
      setLoading(false);
    };

    const debounce = setTimeout(search, 200);
    return () => {
      mounted = false;
      clearTimeout(debounce);
    };
  }, [isAuthenticated, searchQuery]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      e.preventDefault();
      onNavigate(results[selectedIndex]);
    } else if (e.key === 'Escape') {
      onClose();
    }
  }, [results, selectedIndex, onNavigate, onClose]);

  if (!isAuthenticated) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden z-50"
      onKeyDown={handleKeyDown}
    >
      {/* Results count */}
      <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
          {loading ? 'Searching...' : `${results.length} result${results.length !== 1 ? 's' : ''}`}
        </span>
        <button onClick={onClose} className="p-1 text-slate-300 hover:text-slate-600 transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Results */}
      <div className="max-h-[400px] overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
          </div>
        ) : results.length === 0 ? (
          <div className="py-8 text-center">
            <Search className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-xs text-slate-400">No results found</p>
          </div>
        ) : (
          results.map((hit, index) => {
            const Icon = TYPE_ICONS[hit.type];
            const colorClass = TYPE_COLORS[hit.type];

            return (
              <button
                key={`${hit.type}-${hit.id}`}
                onClick={() => onNavigate(hit)}
                className={cn(
                  "w-full px-4 py-3 flex items-center gap-3 text-left transition-colors",
                  index === selectedIndex ? 'bg-blue-50' : 'hover:bg-slate-50'
                )}
              >
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
                  colorClass
                )}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">{hit.title}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {hit.type} · {hit.subtitle || hit.status || '—'}
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
              </button>
            );
          })
        )}
      </div>
    </motion.div>
  );
}
