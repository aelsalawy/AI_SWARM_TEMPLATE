import React from 'react';
import { motion } from 'motion/react';
import { 
  GitBranch, 
  GitPullRequest, 
  Code2, 
  Clock, 
  ExternalLink, 
  CheckCircle,
  AlertCircle,
  ShieldCheck,
  MoreVertical
} from 'lucide-react';
import { cn } from '@/src/lib/utils';

const repos = [
  { name: 'swarm-core-engine', url: 'github.com/swarm-os/core', branch: 'main', active: true, time: '2m ago' },
  { name: 'agent-protocols-v3', url: 'github.com/swarm-os/protocols', branch: 'staging', active: false, time: '4h ago' },
  { name: 'swarm-cli-tool', url: 'github.com/swarm-os/cli', branch: 'main', active: true, time: '1d ago' },
];

const prs = [
  { 
    title: 'Refactor Agent Handlers #442', 
    author: 'alex_k', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alex',
    status: 'Passed', insight: 'Safe', time: '4h ago' 
  },
  { 
    title: 'Experimental: Peer Swarm Sync #438', 
    author: 'm_chen', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Chen',
    status: 'Pending', insight: 'Risk Detected', time: '1d ago' 
  },
  { 
    title: 'Hotfix: Kernel Panic on Boot #445', 
    author: 'system', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sys',
    status: 'Failed', insight: 'Auto-Fixing...', time: '2h ago' 
  }
];

export default function GitHubWorkspace() {
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="p-8 max-w-7xl mx-auto space-y-8"
    >
      <div className="grid grid-cols-12 gap-8">
        {/* Left Column: Repos */}
        <div className="col-span-12 lg:col-span-4 space-y-8">
          <section className="glass-panel rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-bold text-slate-900">Connected Repositories</h3>
              <button className="text-blue-600 text-[10px] font-bold uppercase hover:underline">Connect</button>
            </div>
            <div className="divide-y divide-slate-50">
              {repos.map((repo) => (
                <div key={repo.name} className="p-4 hover:bg-slate-50 transition-colors cursor-pointer group">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                        <Code2 className="w-4 h-4 text-slate-500" />
                      </div>
                      <div>
                        <p className="font-bold text-slate-900 text-sm tracking-tight">{repo.name}</p>
                        <p className="text-[10px] text-slate-400">{repo.url}</p>
                      </div>
                    </div>
                    <div className={cn("w-2 h-2 rounded-full", repo.active ? "bg-teal-400 shadow-[0_0_8px_#2dd4bf]" : "bg-slate-200")}></div>
                  </div>
                  <div className="flex items-center gap-4 text-[10px] font-mono font-medium text-slate-400">
                    <span className="flex items-center gap-1"><GitBranch className="w-3 h-3" /> {repo.branch}</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {repo.time}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="glass-panel rounded-2xl overflow-hidden p-6 bg-slate-900 text-white relative">
            <h4 className="font-display font-bold text-lg mb-2">Swarm Deployment Monitor</h4>
            <p className="text-slate-400 text-xs leading-relaxed mb-6">
              Real-time integration between repository events and swarm node health. Currently monitoring 48 active agents.
            </p>
            <div className="flex justify-center gap-4 py-4 opacity-50">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="w-10 h-10 rounded-full border border-slate-700 flex items-center justify-center">
                  <div className={cn("w-2 h-2 rounded-full", i % 2 === 0 ? "bg-blue-500 shadow-[0_0_8px_#3b82f6]" : "bg-teal-400 shadow-[0_0_8px_#2dd4bf]")}></div>
                </div>
              ))}
            </div>
            <button className="w-full py-2 bg-white/10 hover:bg-white/20 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors backdrop-blur-sm">
              Launch Visualizer
            </button>
          </section>
        </div>

        {/* Right Column: PRs */}
        <div className="col-span-12 lg:col-span-8 space-y-6">
          <div className="grid grid-cols-3 gap-6">
            <div className="glass-panel p-4 rounded-xl border-l-4 border-l-blue-600">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Open PRs</p>
              <h2 className="text-2xl font-display font-bold text-slate-900">12</h2>
            </div>
            <div className="glass-panel p-4 rounded-xl border-l-4 border-l-teal-600">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">CI Pass Rate</p>
              <h2 className="text-2xl font-display font-bold text-slate-900">94.2%</h2>
            </div>
            <div className="glass-panel p-4 rounded-xl border-l-4 border-l-indigo-600">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Swarm Approvals</p>
              <h2 className="text-2xl font-display font-bold text-slate-900">8</h2>
            </div>
          </div>

          <section className="glass-panel rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-white/50">
              <div className="flex gap-4">
                <h3 className="font-bold text-slate-900">Active Pull Requests</h3>
                <div className="flex gap-2">
                  <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-600 text-[9px] font-bold uppercase">Mine (3)</span>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50/50 border-b border-slate-100">
                  <tr>
                    <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pull Request</th>
                    <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">CI Status</th>
                    <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Insight</th>
                    <th className="px-6 py-4"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {prs.map((pr) => (
                    <tr key={pr.title} className="hover:bg-slate-50/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <GitPullRequest className={cn("w-4 h-4", pr.status === 'Passed' ? "text-green-500" : pr.status === 'Failed' ? "text-red-500" : "text-amber-500")} />
                          <div>
                            <p className="text-sm font-bold text-slate-900 tracking-tight">{pr.title}</p>
                            <p className="text-[10px] text-slate-400">opened {pr.time} by <span className="text-slate-600 font-medium">{pr.author}</span></p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className={cn("w-2 h-2 rounded-full", pr.status === 'Passed' ? "bg-green-500" : pr.status === 'Failed' ? "bg-red-500" : "bg-amber-500")}></div>
                          <span className="text-xs font-medium text-slate-600">{pr.status}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider",
                          pr.insight === 'Safe' ? "bg-green-50 text-green-600" : 
                          pr.insight === 'Risk Detected' ? "bg-red-50 text-red-500" : "bg-blue-50 text-blue-600"
                        )}>{pr.insight}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button className="text-slate-300 hover:text-slate-600 transition-colors"><MoreVertical className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t border-slate-100 flex justify-center">
              <button className="text-slate-400 text-[10px] font-bold hover:text-slate-900 transition-colors uppercase tracking-widest flex items-center gap-2">
                View All Pull Requests
              </button>
            </div>
          </section>
        </div>
      </div>
    </motion.div>
  );
}
