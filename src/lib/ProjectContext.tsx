import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { apiClient } from '../lib/api-client';
import type { Project } from '../lib/types';

interface ProjectContextType {
  projectId: string | null;
  setProjectId: (id: string | null) => void;
  projects: Project[];
  loading: boolean;
  error: string | null;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projectId, setProjectIdState] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  // Load selected project from localStorage
  useEffect(() => {
    const savedProjectId = localStorage.getItem('selectedProjectId');
    if (savedProjectId) {
      setProjectIdState(savedProjectId);
    }
  }, []);

  // Fetch user's projects from the API server
  useEffect(() => {
    let cancelled = false;

    const fetchProjects = async () => {
      if (!user) {
        if (!cancelled) {
          setProjects([]);
          setLoading(false);
          setError(null);
        }
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const projectsData = await apiClient.projects.list();
        if (cancelled) return;

        setProjects(projectsData);

        // If no project selected (and none stored in localStorage), select the first active project
        const saved = localStorage.getItem('selectedProjectId');
        if (!saved) {
          const currentProjectId = localStorage.getItem('selectedProjectId');
          if (!currentProjectId && projectsData.length > 0) {
            const activeProject = projectsData.find(p => p.status === 'Active');
            if (activeProject && activeProject.id) {
              setProjectIdState(activeProject.id);
              localStorage.setItem('selectedProjectId', activeProject.id);
            }
          }
        }

        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to fetch projects:', err);
        setError(err instanceof Error ? err.message : 'Failed to load projects');
        setLoading(false);
      }
    };

    fetchProjects();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const setProjectId = (id: string | null) => {
    setProjectIdState(id);
    if (id) {
      localStorage.setItem('selectedProjectId', id);
    } else {
      localStorage.removeItem('selectedProjectId');
    }
  };

  return (
    <ProjectContext.Provider
      value={{
        projectId,
        setProjectId,
        projects,
        loading,
        error
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const context = useContext(ProjectContext);
  if (context === undefined) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
}