import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, Settings, HelpCircle, Search, LogOut, User, FolderKanban, ChevronDown } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { useToast } from './Toast';
import SearchResults, { type SearchHit } from './SearchResults';
import { searchNav } from '../lib/search-nav';
import { useProject } from '../lib/ProjectContext';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../lib/api-client';

interface TopBarProps {
  title: string;
  setActiveTab: (tab: string) => void;
  onDeployClick: () => void;
  onLogout: () => void;
}

export default function TopBar({ title, setActiveTab, onDeployClick, onLogout }: TopBarProps) {
  const { info } = useToast();
  const { projects, projectId, setProjectId } = useProject();
  const { isAuthenticated } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [user, setUser] = useState<{id: string, email: string, role: string, displayName?: string, avatar?: string} | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showProjectMenu, setShowProjectMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const projectMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      try {
        setUser(JSON.parse(userData));
      } catch (error) {
        console.error('Failed to parse user data:', error);
      }
    }
  }, []);

  // R2-7: live unread notification count for the bell badge
  const fetchUnreadCount = useCallback(async () => {
    try {
      const page = await apiClient.notifications.list({ unread: true, limit: 1 });
      setUnreadCount(page.unreadCount || 0);
    } catch (err) {
      // silent
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchUnreadCount();
      const interval = setInterval(fetchUnreadCount, 60000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, fetchUnreadCount]);

  // Close menu on outside click (for user menu only)
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
      if (projectMenuRef.current && !projectMenuRef.current.contains(e.target as Node)) {
        setShowProjectMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSignOut = () => {
    setShowUserMenu(false);
    onLogout();
    info('Signed out successfully');
  };

  const handleSearchNavigate = (hit: SearchHit) => {
    if (hit.type === 'task') {
      setActiveTab('tasks');
      searchNav.emit({ type: 'task', id: hit.id });
    } else if (hit.type === 'run') {
      setActiveTab('test-center');
      searchNav.emit({ type: 'run', id: hit.id });
    }
    setSearchQuery('');
    setShowSearch(false);
  };

  const handleSearchClose = () => {
    setShowSearch(false);
    setSearchQuery('');
  };

  return (
    <header id="top-bar" className="sticky top-0 z-50 flex justify-between items-center w-full px-8 h-16 bg-white/80 backdrop-blur-md border-b border-slate-200">
      <div className="flex items-center gap-4">
        <h2 id="page-title" className="font-display text-xl font-bold text-slate-900 tracking-tight">{title}</h2>
        <div className="h-4 w-[1px] bg-slate-300 hidden md:block"></div>
        <nav className="hidden md:flex gap-6 text-slate-500 text-sm font-medium">
          <a
            href="https://docs.swarmbuzz.online"
            target="_blank"
            rel="noreferrer"
            className="hover:text-slate-900 transition-colors"
          >
            Docs
          </a>
          <a
            href="https://alm.swarmbuzz.online/api/health"
            target="_blank"
            rel="noreferrer"
            className="hover:text-slate-900 transition-colors"
          >
            API
          </a>
          <a 
            href="mailto:support@swarm-orchestrator.io" 
            className="hover:text-slate-900 transition-colors"
          >
            Support
          </a>
        </nav>
      </div>

      <div className="flex items-center gap-6">
        {/* Project Switcher */}
        <div className="relative" ref={projectMenuRef}>
          <button
            onClick={() => setShowProjectMenu(!showProjectMenu)}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm hover:bg-slate-100 transition-colors"
          >
            <FolderKanban className="w-4 h-4 text-slate-500" />
            <span className="font-medium text-slate-700">
              {projectId ? projects.find(p => p.id === projectId)?.name : 'All Projects'}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>
          {showProjectMenu && (
            <div className="absolute right-0 top-12 w-72 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden z-[200]">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Projects</p>
              </div>
              <div className="max-h-64 overflow-auto">
                {projects.map((project) => (
                  <button
                    key={project.id}
                    onClick={() => {
                      setProjectId(project.id);
                      setShowProjectMenu(false);
                    }}
                    className="w-full px-4 py-2.5 text-sm text-left hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-b-0"
                  >
                    <div className="flex items-center justify-between">
                      <span className={cn(
                        "font-medium",
                        project.id === projectId ? "text-blue-600" : "text-slate-700"
                      )}>
                        {project.name}
                      </span>
                      {project.id === projectId && (
                        <FolderKanban className="w-4 h-4 text-blue-600" />
                      )}
                    </div>
                    <p className="text-xs text-slate-500 truncate mt-0.5">
                      {project.description || 'No description'}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Search */}
        <div className="relative hidden lg:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input 
            id="global-search"
            type="text" 
            placeholder="Search system resources..." 
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (!showSearch && e.target.value.trim()) setShowSearch(true);
            }}
            onFocus={() => {
              if (searchQuery.trim()) setShowSearch(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') handleSearchClose();
            }}
            className="pl-10 pr-4 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm" 
          />
          {/* Search Results Dropdown */}
          {showSearch && (
            <SearchResults
              searchQuery={searchQuery}
              onNavigate={handleSearchNavigate}
              onClose={handleSearchClose}
            />
          )}
        </div>
        
        <div className="flex items-center gap-4 text-slate-500">
          <button 
            title="Notifications"
            className="p-1 hover:text-slate-900 transition-colors relative group"
            onClick={() => setActiveTab('notifications')}
          >
            <Bell className="w-5 h-5" />
            <span className="absolute top-0 right-0 min-w-[16px] h-4 px-1 bg-red-500 text-white rounded-full text-[9px] font-bold leading-4 text-center border-2 border-white">
              {unreadCount > 0 ? (unreadCount > 99 ? '99+' : unreadCount) : '0'}
            </span>
          </button>
          <button 
            title="System Settings"
            className="p-1 hover:text-slate-900 transition-colors"
            onClick={() => setActiveTab('admin')}
          >
            <Settings className="w-5 h-5" />
          </button>
          <button 
            title="Help Center"
            className="p-1 hover:text-slate-900 transition-colors"
            onClick={() => window.open('https://github.com/aelsalawy/Ai_SWARM_ALM', '_blank')}
          >
            <HelpCircle className="w-5 h-5" />
          </button>
        </div>

        <button
          id="btn-deploy"
          onClick={onDeployClick}
          className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-semibold hover:bg-slate-800 transition-all shadow-sm active:scale-95"
        >
          Deploy Swarm
        </button>

        {/* User Avatar with Dropdown */}
        <div className="relative" ref={menuRef}>
          <button 
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <img 
              id="user-avatar"
              src={user?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.id || 'Felix'}`} 
              alt="User Profile" 
              className="w-8 h-8 rounded-full border border-slate-200 bg-slate-50"
            />
          </button>

          {showUserMenu && (
            <div className="absolute right-0 top-12 w-64 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden z-[200]">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
                <p className="text-sm font-bold text-slate-900 truncate">{user?.displayName || 'User'}</p>
                <p className="text-xs text-slate-500 truncate">{user?.email || ''}</p>
              </div>
              <div className="py-1">
                <button 
                  onClick={() => { setShowUserMenu(false); setActiveTab('admin'); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <User className="w-4 h-4 text-slate-400" />
                  Profile Settings
                </button>
                <button 
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
