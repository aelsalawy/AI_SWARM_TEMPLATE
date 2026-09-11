import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import Dashboard from './components/Dashboard';
import AgentCardsView from './components/AgentCardsView';
import AgentView from './components/AgentView';
import TasksView from './components/TasksView';
import RequirementsView from './components/RequirementsView';
import TestCenter from './components/TestCenter';
import ProjectsView from './components/ProjectsView';
import BugsView from './components/BugsView';
import GitHubWorkspace from './components/GitHubWorkspace';
import AdminPage from './components/AdminPage';
import SprintAnalytics from './components/SprintAnalytics';
import ActivityFeed from './components/ActivityFeed';
import NotificationsInbox from './components/NotificationsInbox';
import CreateTaskModal from './components/CreateTaskModal';
import CreateBugModal from './components/CreateBugModal';
import CreateRequirementModal from './components/CreateRequirementModal';
import CreateTestModal from './components/CreateTestModal';
import DeployModal from './components/DeployModal';
import LoginPage from './components/LoginPage';
import ErrorBoundary from './components/ErrorBoundary';
import GoogleCallback from './pages/GoogleCallback';
import { ProjectProvider } from './lib/ProjectContext';
import { ToastProvider } from './components/Toast';
import { AnimatePresence, motion } from 'motion/react';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AuthProvider, useAuth } from './contexts/AuthContext';

function AppContent() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isBugModalOpen, setIsBugModalOpen] = useState(false);
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [isRequirementModalOpen, setIsRequirementModalOpen] = useState(false);
  const [isDeployModalOpen, setIsDeployModalOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const { isAuthenticated, isLoading, user, logout } = useAuth();

  // Listen for URL changes
  useEffect(() => {
    const handlePopState = () => setCurrentPath(window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Check for Google OAuth callback path
  if (currentPath === '/auth/google/callback') {
    return <GoogleCallback />;
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <ErrorBoundary name="Dashboard"><ProtectedRoute><Dashboard key="dashboard" /></ProtectedRoute></ErrorBoundary>;
      case 'agents':
        return <ErrorBoundary name="Agents"><AgentView key="agents" /></ErrorBoundary>;
      case 'tasks':
        return <ErrorBoundary name="Tasks"><TasksView key="tasks" /></ErrorBoundary>;
      case 'requirements':
        return <ErrorBoundary name="Requirements"><RequirementsView key="requirements" /></ErrorBoundary>;
      case 'test-center':
        return <ErrorBoundary name="Test Center"><TestCenter key="test-center" /></ErrorBoundary>;
      case 'projects':
        return <ErrorBoundary name="Projects"><ProjectsView key="projects" /></ErrorBoundary>;
      case 'bugs':
        return <ErrorBoundary name="Bugs"><BugsView key="bugs" /></ErrorBoundary>;
      case 'activity':
        return <ErrorBoundary name="Activity"><ActivityFeed key="activity" /></ErrorBoundary>;
      case 'notifications':
        return <ErrorBoundary name="Notifications"><NotificationsInbox key="notifications" /></ErrorBoundary>;
      case 'analytics':
        return <ErrorBoundary name="Sprint Analytics"><ProtectedRoute requiredRole="super_admin"><SprintAnalytics key="analytics" /></ProtectedRoute></ErrorBoundary>;
      case 'github':
        return <ErrorBoundary name="GitHub"><GitHubWorkspace key="github" /></ErrorBoundary>;
      case 'admin':
        return <ErrorBoundary name="Admin"><ProtectedRoute requiredRole="super_admin"><AdminPage key="admin" /></ProtectedRoute></ErrorBoundary>;
      default:
        return <ErrorBoundary name="Dashboard"><Dashboard key="dashboard" /></ErrorBoundary>;
    }
  };

  const getPageTitle = () => {
    switch (activeTab) {
      case 'dashboard': return 'Dashboard';
      case 'agents': return 'Agent Management';
      case 'agent-status': return 'Agent Status';
      case 'tasks': return 'Tasks';
      case 'requirements': return 'Requirements';
      case 'test-center': return 'Test Center';
      case 'projects': return 'Projects';
      case 'bugs': return 'Bugs & Issues';
      case 'activity': return 'Activity Feed';
      case 'notifications': return 'Notifications';
      case 'analytics': return 'Sprint Analytics';
      case 'github': return 'GitHub Workspace';
      case 'admin': return 'Admin Settings';
      default: return 'Swarm Orchestrator';
    }
  };

  // Show loading while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-slate-300 border-t-slate-900 rounded-full animate-spin"></div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Initializing...</p>
        </div>
      </div>
    );
  }

  // Show login page if not authenticated
  if (!isAuthenticated) {
    return (
      <ErrorBoundary name="App">
        <LoginPage />
      </ErrorBoundary>
    );
  }

  const handleLogout = async () => {
    await logout();
  };

  return (
    <ErrorBoundary name="App">
    <ProjectProvider>
    <ToastProvider>
    <div id="app-root" className="min-h-screen bg-background">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        mobileOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
      />

      <CreateTaskModal isOpen={isTaskModalOpen} onClose={() => setIsTaskModalOpen(false)} />
      <CreateBugModal isOpen={isBugModalOpen} onClose={() => setIsBugModalOpen(false)} />
      <CreateRequirementModal isOpen={isRequirementModalOpen} onClose={() => setIsRequirementModalOpen(false)} />
      <CreateTestModal isOpen={isTestModalOpen} onClose={() => setIsTestModalOpen(false)} />
      <DeployModal isOpen={isDeployModalOpen} onClose={() => setIsDeployModalOpen(false)} />

      {/* Main content area: ml-64 on desktop, full-width on mobile with top padding for mobile header */}
      <div className="lg:ml-64 pt-14 lg:pt-0 flex flex-col h-screen relative overflow-hidden">
        <TopBar
          title={getPageTitle()}
          setActiveTab={setActiveTab}
          onDeployClick={() => setIsDeployModalOpen(true)}
          onLogout={handleLogout}
        />

        <main id="main-content" className="flex-1 relative overflow-hidden">
          {renderContent()}
        </main>

        {/* Floating Action Button for Tasks & Test Center */}
        <AnimatePresence>
          {(activeTab === 'tasks' || activeTab === 'test-center' || activeTab === 'requirements' || activeTab === 'bugs') && (
            <motion.button
              id="fab-add-task"
              onClick={() => {
                if (activeTab === 'test-center') setIsTestModalOpen(true);
                else if (activeTab === 'requirements') setIsRequirementModalOpen(true);
                else if (activeTab === 'bugs') setIsBugModalOpen(true);
                else setIsTaskModalOpen(true);
              }}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="fixed bottom-8 right-8 w-14 h-14 bg-slate-900 text-white rounded-full shadow-2xl flex items-center justify-center z-[100] group"
            >
              <motion.span
                className="material-symbols-outlined text-[28px]"
                animate={{ rotate: [0, 0, 90, 90, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              >
                {activeTab === 'test-center' ? 'science' : activeTab === 'requirements' ? 'description' : activeTab === 'bugs' ? 'bug_report' : 'add_task'}
              </motion.span>
              <div className="absolute right-16 px-3 py-1.5 bg-slate-900 text-white text-xs font-bold rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                {activeTab === 'test-center' ? 'Create New Test' : activeTab === 'requirements' ? 'Create New Requirement' : activeTab === 'bugs' ? 'Report New Bug' : 'Create New Task'}
              </div>
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
    </ToastProvider>
    </ProjectProvider>
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}