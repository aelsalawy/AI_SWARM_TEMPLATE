import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { FolderKanban, CheckCircle2, Clock, Archive, RefreshCw, AlertCircle, ArrowRight } from 'lucide-react';
import apiClient from '../lib/api-client';
import { useAuth } from '../contexts/AuthContext';
import type { Project } from '../lib/types';

const STATUS_COLORS: Record<string, string> = {
  'Active': 'bg-green-100 text-green-700 border-green-200',
  'Archived': 'bg-slate-100 text-slate-500 border-slate-200',
};

export default function ProjectsView() {
  const { isAuthenticated } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      setError(null);
      const list = await apiClient.projects.list();
      setProjects(list);
    } catch (err) {
      console.error('Failed to fetch projects:', err);
      setError('Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchProjects();
    } else {
      setLoading(false);
    }
  }, [isAuthenticated]);

  const activeCount = projects.filter(p => p.status === 'Active').length;
  const archivedCount = projects.filter(p => p.status === 'Archived').length;

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Loading Projects...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <AlertCircle className="w-10 h-10 text-red-400" />
          <p className="text-sm text-red-600">{error}</p>
          <button
            onClick={fetchProjects}
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
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6"
    >
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="glass-panel p-4 rounded-xl flex flex-col">
          <div className="flex justify-between items-start mb-2">
            <div className="p-2 bg-blue-50 rounded-lg">
              <FolderKanban className="w-4 h-4 text-blue-600" />
            </div>
          </div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Total Projects</p>
          <h4 className="font-display text-2xl font-bold text-slate-900">{projects.length}</h4>
        </div>

        <div className="glass-panel p-4 rounded-xl flex flex-col">
          <div className="flex justify-between items-start mb-2">
            <div className="p-2 bg-green-50 rounded-lg">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
            </div>
          </div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Active</p>
          <h4 className="font-display text-2xl font-bold text-green-600">{activeCount}</h4>
        </div>

        <div className="glass-panel p-4 rounded-xl flex flex-col">
          <div className="flex justify-between items-start mb-2">
            <div className="p-2 bg-slate-100 rounded-lg">
              <Archive className="w-4 h-4 text-slate-500" />
            </div>
          </div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Archived</p>
          <h4 className="font-display text-2xl font-bold text-slate-400">{archivedCount}</h4>
        </div>
      </div>

      {/* Projects Grid */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <h3 className="font-display font-bold text-slate-900">
            Projects ({projects.length})
          </h3>
          <button
            onClick={fetchProjects}
            className="p-2 hover:bg-slate-200 rounded-lg text-slate-400 transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {projects.length === 0 ? (
          <div className="p-12 text-center">
            <FolderKanban className="w-12 h-12 text-slate-200 mx-auto mb-4" />
            <p className="text-sm text-slate-500 font-medium">No projects yet</p>
            <p className="text-xs text-slate-400 mt-1">Create a project to organize your swarm tasks</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
            {projects.map((project) => (
              <div
                key={project.id}
                className="bg-slate-50 rounded-xl border border-slate-200 p-5 hover:border-blue-300 hover:shadow-md transition-all group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                    <FolderKanban className="w-5 h-5 text-blue-600" />
                  </div>
                  <span className={cn(
                    'text-[10px] font-bold px-2 py-0.5 rounded-full border',
                    STATUS_COLORS[project.status || 'Active'] || 'bg-slate-50 text-slate-500 border-slate-200'
                  )}>
                    {project.status || 'Active'}
                  </span>
                </div>

                <h4 className="text-sm font-bold text-slate-900 mb-1">
                  {project.name || 'Unnamed Project'}
                </h4>
                {project.description && (
                  <p className="text-xs text-slate-500 line-clamp-2 mb-3">
                    {project.description}
                  </p>
                )}

                <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-200">
                  <span className="text-[10px] text-slate-400">
                    Created {project.createdAt ? new Date(project.createdAt as string).toLocaleDateString() : 'N/A'}
                  </span>
                  <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
