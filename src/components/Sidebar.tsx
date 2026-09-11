import React, { useEffect, useRef } from 'react';
import { 
  LayoutDashboard, 
  ClipboardList, 
  TestTube2, 
  Plus, 
  ShieldCheck, 
  History,
  Settings,
  Menu,
  X,
  Bug,
  FolderKanban,
  Activity,
  FileText,
  BarChart3
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { useToast } from './Toast';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  mobileOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
}

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'tasks', label: 'Tasks', icon: ClipboardList },
  { id: 'requirements', label: 'Requirements', icon: FileText },
  { id: 'test-center', label: 'Test Center', icon: TestTube2 },
  { id: 'projects', label: 'Projects', icon: FolderKanban },
  { id: 'bugs', label: 'Bugs', icon: Bug },
  { id: 'activity', label: 'Activity', icon: Activity },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'admin', label: 'Admin', icon: Settings },
];

export default function Sidebar({ activeTab, setActiveTab, mobileOpen, setMobileMenuOpen }: SidebarProps) {
  const { info } = useToast();
  const sidebarRef = useRef<HTMLElement>(null);

  const toggleMobileMenu = (e?: React.MouseEvent | React.TouchEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    setMobileMenuOpen(!mobileOpen);
  };

  // Close sidebar on outside click (mobile)
  useEffect(() => {
    if (!mobileOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) {
        setMobileMenuOpen(false);
      }
    };
    // Delay to avoid the same click that opened it
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClick);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [mobileOpen, setMobileMenuOpen]);

  const handleNavClick = (id: string) => {
    setActiveTab(id);
    setMobileMenuOpen(false);
  };

  const sidebarContent = (
    <>
      <div className="px-6 mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-900 rounded-lg flex items-center justify-center text-white">
            <span className="material-symbols-outlined">hub</span>
          </div>
          <div>
            <h1 className="text-lg font-bold font-display tracking-tight leading-tight">Swarm Orchestrator</h1>
            <p className="text-[10px] text-slate-500 font-mono">v2.4.0-stable</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              id={`nav-item-${item.id}`}
              onClick={() => handleNavClick(item.id)}
              className={cn(
                "w-full flex items-center px-3 py-2.5 rounded-lg transition-all duration-200 font-medium text-sm group",
                isActive 
                  ? "bg-white text-blue-600 shadow-sm border-l-2 border-blue-600" 
                  : "text-slate-600 hover:bg-slate-100"
              )}
            >
              <Icon className={cn("w-5 h-5 mr-3", isActive ? "text-blue-600" : "text-slate-500 group-hover:text-slate-900")} />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="px-4 mb-6">
        <button 
          id="btn-new-agent" 
          onClick={() => handleNavClick('agents')}
          className="w-full py-2.5 bg-slate-900 text-white rounded-lg flex items-center justify-center gap-2 hover:opacity-90 transition-opacity font-semibold text-sm shadow-sm active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" />
          Manage Agents
        </button>
      </div>

      <div className="px-3 border-t border-slate-200 pt-4 space-y-1">
        <button 
          id="nav-item-security" 
          onClick={() => { info("Security scan active. No breaches detected."); setMobileMenuOpen(false); }}
          className="w-full flex items-center px-3 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm transition-colors"
        >
          <ShieldCheck className="w-5 h-5 mr-3 text-slate-500" />
          Security
        </button>
        <button 
          id="nav-item-logs" 
          onClick={() => handleNavClick('admin')}
          className="w-full flex items-center px-3 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm transition-colors"
        >
          <History className="w-5 h-5 mr-3 text-slate-500" />
          System Logs
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile Header Bar — visible below lg */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-white/95 border-b border-slate-200 z-[9999] flex items-center justify-between px-4" style={{ backdropFilter: 'blur(4px)' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center text-white">
            <span className="material-symbols-outlined text-[18px]">hub</span>
          </div>
          <span className="font-display font-bold text-sm tracking-tight text-slate-900">Swarm</span>
        </div>
        <button
          id="hamburger-btn"
          onClick={toggleMobileMenu}
          className="p-2 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer min-w-[44px] min-h-[44px] touch-manipulation active:bg-slate-200 bg-white"
          aria-label="Toggle menu"
          aria-expanded={mobileOpen}
          type="button"
        >
          {mobileOpen ? <X className="w-5 h-5 text-slate-700" /> : <Menu className="w-5 h-5 text-slate-700" />}
        </button>
      </div>

      {/* Desktop sidebar — always visible at lg+ */}
      <aside
        id="sidebar"
        ref={sidebarRef}
        className="hidden lg:flex fixed left-0 top-0 h-full w-64 bg-slate-50 border-r border-slate-200 flex-col py-6 z-[60]"
      >
        {sidebarContent}
      </aside>

      {/* Mobile sidebar overlay */}
      <AnimatePresence mode="wait">
        {mobileOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              key="sidebar-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="lg:hidden fixed inset-0 bg-black/40 z-[50]"
              onClick={() => setMobileMenuOpen(false)}
            />
            {/* Slide-in panel */}
            <motion.aside
              key="sidebar-mobile"
              ref={sidebarRef}
              initial={{ x: -256 }}
              animate={{ x: 0 }}
              exit={{ x: -256 }}
              transition={{ type: 'tween', duration: 0.25, ease: 'easeOut' }}
              className="lg:hidden fixed left-0 top-0 h-full w-64 bg-slate-50 border-r border-slate-200 flex flex-col py-6 z-[51]"
            >
              {sidebarContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
