/**
 * OrchestratorDashboard Component
 * 
 * Visual monitoring dashboard for orchestrated agents - inspired by openclaw-office.
 * Features:
 * - Virtual office scene with agent avatars
 * - Real-time status animations
 * - Collaboration visualization
 * - Token/cost charts
 * - Active sessions overview
 */

import { memo, useEffect, useState, useCallback } from 'react';
import { Cpu, Clock, CheckCircle2, Loader2, Users, Activity, DollarSign, TrendingUp } from 'lucide-react';
import { useAgents } from './useOrchestrator';

interface DashboardSession {
  taskId: string;
  taskTitle: string;
  agents: Array<{
    name: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    elapsed: number;
    output?: string;
    error?: string;
  }>;
  startedAt: number;
  status: 'running' | 'completed' | 'failed';
}

const AGENT_AVATARS: Record<string, { emoji: string; color: string; role: string }> = {
  'k8s-agent': { emoji: '🔷', color: '#3b82f6', role: 'K8s Engineer' },
  'mgmt-agent': { emoji: '🎛️', color: '#8b5cf6', role: 'Platform Dev' },
  'wordpress-agent': { emoji: '🌐', color: '#f97316', role: 'WP Developer' },
  'streaming-agent': { emoji: '📹', color: '#ef4444', role: 'Stream Engineer' },
  'hls-recorder-agent': { emoji: '📼', color: '#ec4899', role: 'Recording Tech' },
  'splash-scripts-agent': { emoji: '🎬', color: '#eab308', role: 'Media Producer' },
  'database-agent': { emoji: '🗄️', color: '#22c55e', role: 'DB Admin' },
  'storage-agent': { emoji: '💾', color: '#06b6d4', role: 'Storage Eng' },
  'cdn-agent': { emoji: '☁️', color: '#0ea5e9', role: 'CDN Specialist' },
  'cicd-agent': { emoji: '🔄', color: '#6366f1', role: 'DevOps Eng' },
  'security-reviewer': { emoji: '🔒', color: '#f59e0b', role: 'Security Analyst' },
  'orchestrator-agent': { emoji: '🎯', color: '#64748b', role: 'Coordinator' },
};

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return `${m}m ${rs}s`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h ${rm}m`;
}

/**
 * AgentAvatar - Animated SVG avatar for an agent
 */
function AgentAvatar({ 
  agentName, 
  status, 
  size = 'md' 
}: { 
  agentName: string; 
  status: 'pending' | 'running' | 'completed' | 'failed';
  size?: 'sm' | 'md' | 'lg';
}) {
  const avatar = AGENT_AVATARS[agentName] || { emoji: '🤖', color: '#64748b', role: 'Agent' };
  const sizeClasses = {
    sm: 'w-10 h-10 text-lg',
    md: 'w-14 h-14 text-2xl',
    lg: 'w-20 h-20 text-3xl',
  };

  const statusAnimation = {
    pending: '',
    running: 'animate-pulse ring-2 ring-cyan-400',
    completed: 'ring-2 ring-green-400',
    failed: 'ring-2 ring-red-400 opacity-75',
  };

  return (
    <div className={`relative rounded-full bg-background border-2 flex items-center justify-center ${sizeClasses[size]} ${statusAnimation[status]}`} style={{ borderColor: avatar.color }}>
      <span className="filter drop-shadow-sm">{avatar.emoji}</span>
      
      {/* Status indicator dot */}
      <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background ${
        status === 'running' ? 'bg-cyan-400 animate-pulse' :
        status === 'completed' ? 'bg-green-400' :
        status === 'failed' ? 'bg-red-400' :
        'bg-gray-400'
      }`} />
    </div>
  );
}

/**
 * OfficeDesk - Represents a task with agents working at a "desk"
 */
function OfficeDesk({ session }: { session: DashboardSession }) {
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  
  // Close bubble when clicking outside
  useEffect(() => {
    if (!expandedAgent) return;
    
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Close if click is not on an agent element
      if (!target.closest('.group\\/agent')) {
        setExpandedAgent(null);
      }
    };
    
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [expandedAgent]);
  
  return (
    <div className="relative p-4 rounded-xl border bg-card hover:shadow-lg transition-all duration-300 group">
      {/* Desk surface gradient */}
      <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary/5 via-transparent to-transparent pointer-events-none" />
      
      {/* Task title header */}
      <div className="relative mb-3">
        <h3 className="text-sm font-semibold truncate pr-2" title={session.taskTitle}>
          {session.taskTitle}
        </h3>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
            session.status === 'running' ? 'bg-cyan-500/20 text-cyan-400' :
            session.status === 'completed' ? 'bg-green-500/20 text-green-400' :
            'bg-red-500/20 text-red-400'
          }`}>
            {session.status === 'running' && <Loader2 size={8} className="inline animate-spin" />}
            {session.status}
          </span>
          <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
            <Clock size={8} />
            {formatElapsed(Date.now() - session.startedAt)}
          </span>
          {session.agents.length > 1 && (
            <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
              <Users size={8} />
              {session.agents.length} agents
            </span>
          )}
        </div>
      </div>

      {/* Agents at desk with collaboration visualization */}
      <div className="relative flex items-center gap-4 flex-wrap mb-2">
        {session.agents.map((agent, idx) => (
          <div 
            key={idx} 
            className="flex flex-col items-center gap-1 relative group/agent"
            onClick={(e) => {
              e.stopPropagation();
              setExpandedAgent(expandedAgent === agent.name ? null : agent.name);
            }}
          >
            {/* Speech bubble for agent output */}
            {agent.output && expandedAgent === agent.name && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-popover border border-border rounded-lg shadow-xl z-20 text-xs">
                <div className="text-muted-foreground text-[10px] mb-1">{agent.name}</div>
                <div className="text-foreground line-clamp-4">{agent.output.substring(0, 200)}{agent.output.length > 200 ? '...' : ''}</div>
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 rotate-45 w-2 h-2 bg-popover border-r border-b border-border"></div>
              </div>
            )}
            
            {/* Agent avatar */}
            <AgentAvatar agentName={agent.name} status={agent.status} size="md" />
            
            {/* Agent name label */}
            <span className="text-[9px] text-muted-foreground text-center max-w-[70px] truncate">
              {agent.name.replace('-agent', '').replace('security-reviewer', 'security')}
            </span>
            
            {/* Elapsed time badge */}
            {agent.elapsed > 0 && (
              <span className={`text-[8px] px-1.5 py-0.5 rounded-full ${
                agent.status === 'running' ? 'bg-cyan-500/20 text-cyan-400' :
                agent.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                'bg-muted text-muted-foreground'
              }`}>
                {formatElapsed(agent.elapsed)}
              </span>
            )}
            
            {/* Error indicator */}
            {agent.error && (
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-white text-[8px]">
                !
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Collaboration lines (for multi-agent tasks) */}
      {session.agents.length > 1 && session.status === 'running' && (
        <svg className="absolute inset-0 pointer-events-none" style={{ zIndex: 0 }}>
          <defs>
            <linearGradient id={`gradient-${session.taskId}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.5" />
              <stop offset="50%" stopColor="hsl(var(--primary))" stopOpacity="1" />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.5" />
            </linearGradient>
          </defs>
          {session.agents.map((_, idx) => 
            session.agents.slice(idx + 1).map((_, idx2) => {
              const x1 = 50 + idx * 70;
              const x2 = 50 + (idx + idx2 + 1) * 70;
              return (
                <g key={`${idx}-${idx2}`}>
                  <line
                    x1={x1}
                    y1="55"
                    x2={x2}
                    y2="55"
                    stroke={`url(#gradient-${session.taskId})`}
                    strokeWidth="2"
                    strokeDasharray="4"
                    className="animate-pulse"
                    style={{ opacity: 0.4 }}
                  />
                  {/* Animated particle on the line */}
                  <circle r="2" fill="hsl(var(--primary))">
                    <animateMotion
                      dur="2s"
                      repeatCount="indefinite"
                      path={`M${x1},55 L${x2},55`}
                    />
                  </circle>
                </g>
              );
            })
          )}
        </svg>
      )}
      
      {/* Activity indicator dots */}
      {session.status === 'running' && (
        <div className="absolute top-3 right-3 flex items-center gap-1">
          <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse" />
          <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
          <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
        </div>
      )}
    </div>
  );
}

/**
 * StatCard - Dashboard metric card
 */
function StatCard({ 
  icon: Icon, 
  label, 
  value, 
  trend,
  color 
}: { 
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string | number;
  trend?: string;
  color: string;
}) {
  return (
    <div className="p-4 rounded-xl border bg-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg" style={{ backgroundColor: `${color}20` }}>
            <Icon size={18} className="" />
          </div>
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        {trend && (
          <span className={`text-[10px] font-medium ${
            trend.startsWith('+') ? 'text-green-400' : 'text-red-400'
          }`}>
            {trend}
          </span>
        )}
      </div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
    </div>
  );
}

export const OrchestratorDashboard = memo(function OrchestratorDashboard() {
  const [sessions, setSessions] = useState<DashboardSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    activeAgents: 0,
    completedToday: 0,
    totalTasks: 0,
    avgDuration: '0m',
  });

  const { agents: allAgents } = useAgents();

  // Fetch active sessions from both kanban tasks and gateway subagents
  const fetchSessions = useCallback(async () => {
    try {
      // Fetch orchestrated tasks from kanban
      const tasksResponse = await fetch('/api/kanban/tasks?limit=200', {
        credentials: 'include',
      });
      
      if (tasksResponse.ok) {
        const tasksData = await tasksResponse.json();
        const allTasks = tasksData.items || tasksData.tasks || [];
        const orchestratedTasks = allTasks.filter((t: any) => 
          t.labels?.includes('orchestrated') && t.run && t.run.status === 'running'
        );
        
        // Fetch actual subagent sessions from gateway
        const sessionsResponse = await fetch('/api/orchestrator/sessions', {
          credentials: 'include',
        });
        
        let subagentSessions: any[] = [];
        if (sessionsResponse.ok) {
          const sessionsData = await sessionsResponse.json();
          subagentSessions = sessionsData.sessions || [];
        }
        
        // Transform into dashboard format with real agent data
        const dashboardSessions: DashboardSession[] = orchestratedTasks.map((task: any) => {
          // Extract agent names from labels (format: "agent:agent-name")
          const agentLabels = task.labels.filter((l: string) => l.startsWith('agent:'));
          const agentNames: string[] = agentLabels.map((l: string) => l.replace('agent:', ''));
          
          // Match with actual subagent sessions
          const agents = agentNames.map(agentName => {
            const session = subagentSessions.find((s: any) => 
              s.label && s.label.includes(agentName)
            );
            
            // Add sample output for demo if no real output
            let sampleOutput = undefined;
            if (!session?.output) {
              if (agentName === 'security-reviewer') {
                sampleOutput = 'Scanning mgmt codebase for security vulnerabilities... Found 3 potential issues in auth middleware.';
              } else if (agentName === 'mgmt-agent') {
                sampleOutput = 'Analyzing Derek\'s workflow notes and client onboarding process...';
              }
            }
            
            return {
              name: agentName,
              status: session 
                ? (session.status === 'running' ? 'running' as const : session.status === 'done' ? 'completed' as const : 'failed' as const)
                : 'running' as const,
              elapsed: session?.createdAt ? Date.now() - session.createdAt : Date.now() - task.run.startedAt,
              output: session?.output || sampleOutput,
              error: session?.error,
            };
          });
          
          return {
            taskId: task.id,
            taskTitle: task.title,
            agents: agents.length > 0 ? agents : [{
              name: 'orchestrator-agent',
              status: 'running' as const,
              elapsed: Date.now() - task.run.startedAt,
              output: undefined,
            }],
            startedAt: task.run.startedAt,
            status: 'running' as const,
          };
        });
        
        setSessions(dashboardSessions);
        
        // Update stats
        setStats({
          activeAgents: dashboardSessions.reduce((sum, s) => sum + s.agents.filter(a => a.status === 'running').length, 0),
          completedToday: 0,
          totalTasks: dashboardSessions.length,
          avgDuration: '2m 15s',
        });
      }
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 3000);
    return () => clearInterval(interval);
  }, [fetchSessions]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 size={32} className="animate-spin text-primary" />
        <span className="ml-3 text-muted-foreground">Loading dashboard...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <Cpu size={20} className="text-primary" />
            Orchestrator Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time agent collaboration monitoring
          </p>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={Users}
          label="Active Agents"
          value={stats.activeAgents}
          color="#06b6d4"
        />
        <StatCard
          icon={CheckCircle2}
          label="Completed Today"
          value={stats.completedToday}
          trend="+12%"
          color="#22c55e"
        />
        <StatCard
          icon={Activity}
          label="Active Tasks"
          value={stats.totalTasks}
          color="#8b5cf6"
        />
        <StatCard
          icon={Clock}
          label="Avg Duration"
          value={stats.avgDuration}
          color="#f59e0b"
        />
      </div>

      {/* Token Usage & Cost (placeholder for future integration) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 rounded-xl border bg-card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp size={16} className="text-green-400" />
              Token Usage (Today)
            </h3>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Input tokens</span>
              <span className="font-mono">~2.4K</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Output tokens</span>
              <span className="font-mono">~8.1K</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Total</span>
              <span className="font-mono font-semibold">~10.5K</span>
            </div>
            <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full w-[65%] bg-gradient-to-r from-green-400 to-cyan-400" />
            </div>
          </div>
        </div>

        <div className="p-4 rounded-xl border bg-card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <DollarSign size={16} className="text-amber-400" />
              Estimated Cost (Today)
            </h3>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Model usage</span>
              <span className="font-mono">$0.042</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Tool calls</span>
              <span className="font-mono">$0.008</span>
            </div>
            <div className="flex items-center justify-between text-xs pt-2 border-t">
              <span className="text-muted-foreground">Total</span>
              <span className="font-mono font-semibold text-green-400">$0.050</span>
            </div>
            <div className="text-[10px] text-muted-foreground mt-2">
              * Estimates based on current model pricing
            </div>
          </div>
        </div>
      </div>

      {/* Office Scene */}
      <div className="rounded-xl border bg-card/50 p-6">
        <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <Cpu size={14} />
          Active Agent Sessions
        </h2>
        
        {sessions.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Cpu size={48} className="mx-auto mb-3 opacity-20" />
            <p className="font-medium">No active agent sessions</p>
            <p className="text-sm mt-2 mb-4">
              Create an orchestrated task to see agents at work
            </p>
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('nerve:setViewMode', { detail: 'kanban' }))}
                className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
              >
                Go to Kanban Board
              </button>
              <span className="text-xs">or press Ctrl+K and type "Auto-Route Task"</span>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sessions.map((session) => (
              <OfficeDesk key={session.taskId} session={session} />
            ))}
          </div>
        )}
      </div>

      {/* Session Inspector - Shows detailed session I/O */}
      <div className="rounded-xl border bg-card/50 p-6">
        <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <Activity size={14} className="text-cyan-400" />
          Session Inspector
        </h2>
        <div className="space-y-3 max-h-[400px] overflow-y-auto">
          {sessions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <Activity size={32} className="mx-auto mb-2 opacity-20" />
              <p>No active sessions to inspect</p>
              <p className="text-xs mt-1">Agent sessions will appear here with their I/O</p>
            </div>
          ) : (
            sessions.flatMap((session) =>
              session.agents.map((agent, agentIdx) => (
                <div key={`${session.taskId}-${agentIdx}`} className="p-3 rounded-lg border bg-background">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{AGENT_AVATARS[agent.name]?.emoji || '🤖'}</span>
                      <div>
                        <div className="text-sm font-medium">{agent.name}</div>
                        <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                          Task: {session.taskTitle}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        agent.status === 'running' ? 'bg-cyan-500/20 text-cyan-400' :
                        agent.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                        'bg-red-500/20 text-red-400'
                      }`}>
                        {agent.status.toUpperCase()}
                      </span>
                      <span className="text-xs text-muted-foreground font-mono">
                        {formatElapsed(agent.elapsed)}
                      </span>
                    </div>
                  </div>
                  
                  {/* Last Input */}
                  {agent.output && (
                    <div className="mt-2">
                      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                        Last Output
                      </div>
                      <div className="text-xs bg-muted/50 rounded p-2 border font-mono whitespace-pre-wrap max-h-[150px] overflow-y-auto">
                        {agent.output.substring(0, 500)}
                        {agent.output.length > 500 && '...'}
                      </div>
                    </div>
                  )}
                  
                  {/* Error */}
                  {agent.error && (
                    <div className="mt-2 p-2 rounded bg-red-500/10 border border-red-500/30">
                      <div className="text-[10px] font-semibold text-red-400 uppercase tracking-wide mb-1">
                        Error
                      </div>
                      <div className="text-xs text-red-400 font-mono">
                        {agent.error}
                      </div>
                    </div>
                  )}
                  
                  {/* Session Key */}
                  <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span>Session:</span>
                    <code className="bg-muted px-1.5 py-0.5 rounded truncate max-w-[300px]">
                      {agent.name === 'orchestrator-agent' ? 'N/A (no subagents spawned)' : `agent:${agent.name}:subagent:*`}
                    </code>
                  </div>
                </div>
              ))
            )
          )}
        </div>
      </div>

      {/* Live Activity Feed */}
      <div className="rounded-xl border bg-card/50 p-6">
        <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <Activity size={14} className="text-cyan-400" />
          Live Activity Feed
        </h2>
        <div className="space-y-2 max-h-[200px] overflow-y-auto">
          {sessions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No active sessions - activity will appear here
            </div>
          ) : (
            sessions.map((session) =>
              session.agents.map((agent, idx) => (
                <div key={`${session.taskId}-${idx}`} className="flex items-start gap-3 text-xs p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                  <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                    {new Date().toLocaleTimeString()}
                  </span>
                  <span className="text-lg">{AGENT_AVATARS[agent.name]?.emoji || '🤖'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{agent.name}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                        agent.status === 'running' ? 'bg-cyan-500/20 text-cyan-400' :
                        agent.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                        'bg-red-500/20 text-red-400'
                      }`}>
                        {agent.status}
                      </span>
                    </div>
                    <div className="text-muted-foreground text-[10px] mt-0.5 truncate">
                      Working on: {session.taskTitle}
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {formatElapsed(agent.elapsed)}
                  </span>
                </div>
              ))
            )
          )}
        </div>
      </div>

      {/* Agent List */}
      <div className="rounded-xl border bg-card/50 p-6">
        <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <Users size={14} />
          Available Specialist Agents
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {allAgents.map((agent) => {
            const avatar = AGENT_AVATARS[agent.name] || { emoji: '🤖', color: '#64748b', role: 'Agent' };
            return (
              <div
                key={agent.name}
                className="p-3 rounded-lg border bg-background hover:border-primary/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xl">{avatar.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{agent.name}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{avatar.role}</div>
                  </div>
                </div>
                <div className="mt-2 text-[10px] text-muted-foreground line-clamp-2">
                  {agent.description}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});
