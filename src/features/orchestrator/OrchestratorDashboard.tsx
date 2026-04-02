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

import { memo, useEffect, useState, useCallback, useRef } from 'react';
import { Cpu, Clock, CheckCircle2, Loader2, Users, Activity, DollarSign, TrendingUp, Calendar } from 'lucide-react';
import { useAgents, useOrchestratorStats } from './useOrchestrator';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TaskDetailPanel } from './TaskDetailPanel';
import { ActiveAgentsPanel } from './ActiveAgentsPanel';
import { DollarSign as DollarSignIcon } from 'lucide-react';
import { useServerEvents } from '../../hooks/useServerEvents';
import { TimelineView } from '../timeline';
import { SupervisorPanel } from './SupervisorPanel';
import { StalledTaskBanner, type StalledTaskData } from './StalledTaskBanner';

export type TimeRangeOption = 'today-local' | '24h-rolling' | '48h-rolling' | '72h-rolling' | '7d-rolling' | '14d-rolling' | '30d-rolling' | 'today-utc';

export const TIME_RANGE_OPTIONS: { value: TimeRangeOption; label: string; description: string }[] = [
  { value: 'today-local', label: 'Today (Local)', description: 'Since 12:00 AM local time' },
  { value: 'today-utc', label: 'Today (UTC)', description: 'Since 12:00 AM UTC' },
  { value: '24h-rolling', label: 'Last 24 Hours', description: 'Rolling 24-hour window' },
  { value: '48h-rolling', label: 'Last 48 Hours', description: 'Rolling 48-hour window' },
  { value: '72h-rolling', label: 'Last 72 Hours', description: 'Rolling 72-hour window' },
  { value: '7d-rolling', label: 'Last 7 Days', description: 'Rolling 7-day window' },
  { value: '14d-rolling', label: 'Last 14 Days', description: 'Rolling 14-day window' },
  { value: '30d-rolling', label: 'Last 30 Days', description: 'Rolling 30-day window' },
];

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

export const AGENT_AVATARS: Record<string, { emoji: string; color: string; role: string }> = {
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
function OfficeDesk({ session, onTaskClick }: { session: DashboardSession; onTaskClick: (taskId: string) => void }) {
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
    <div
      className="relative p-4 rounded-xl border bg-card hover:shadow-lg transition-all duration-300 group cursor-pointer"
      onClick={() => onTaskClick(session.taskId)}
    >
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
  const [timeRange, setTimeRange] = useState<TimeRangeOption>('today-local');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const sessionsRef = useRef<typeof sessions>(sessions);
  const [stalledTasks, setStalledTasks] = useState<Map<string, StalledTaskData>>(new Map());

  // Use the new stats hook
  const { stats: orchestratorStats, loading: statsLoading } = useOrchestratorStats(timeRange);

  const [usage, setUsage] = useState({
    totalInput: 0,
    totalOutput: 0,
    totalCost: 0,
    loading: true,
  });

  const { agents: allAgents } = useAgents();

  // Calculate time window based on selected range
  const getTimeWindow = useCallback((): { start: number; end: number; label: string } => {
    const now = Date.now();
    let start: number;
    let label: string;

    switch (timeRange) {
      case 'today-local': {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        start = today.getTime();
        label = 'Today (Local)';
        break;
      }
      case 'today-utc': {
        const todayUTC = new Date();
        todayUTC.setUTCHours(0, 0, 0, 0);
        start = todayUTC.getTime();
        label = 'Today (UTC)';
        break;
      }
      case '24h-rolling': {
        start = now - (24 * 60 * 60 * 1000);
        label = 'Last 24 Hours';
        break;
      }
      case '48h-rolling': {
        start = now - (48 * 60 * 60 * 1000);
        label = 'Last 48 Hours';
        break;
      }
      case '72h-rolling': {
        start = now - (72 * 60 * 60 * 1000);
        label = 'Last 72 Hours';
        break;
      }
      case '7d-rolling': {
        start = now - (7 * 24 * 60 * 60 * 1000);
        label = 'Last 7 Days';
        break;
      }
      case '14d-rolling': {
        start = now - (14 * 24 * 60 * 60 * 1000);
        label = 'Last 14 Days';
        break;
      }
      case '30d-rolling': {
        start = now - (30 * 24 * 60 * 60 * 1000);
        label = 'Last 30 Days';
        break;
      }
    }

    return { start, end: now, label };
  }, [timeRange]);

  // Fetch token usage and cost data
  const fetchUsage = useCallback(async () => {
    try {
      const response = await fetch('/api/tokens', { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setUsage({
          totalInput: data.totalInput || data.persistent?.totalInput || 0,
          totalOutput: data.totalOutput || data.persistent?.totalOutput || 0,
          totalCost: data.totalCost || data.persistent?.totalCost || 0,
          loading: false,
        });
      }
    } catch (err) {
      console.error('Failed to fetch usage:', err);
      setUsage(prev => ({ ...prev, loading: false }));
    }
  }, []);

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

        // Get active sessions - tasks with agent labels that are not done/cancelled
        // Shows tasks that are in-progress, review, or have active runs
        const orchestratedTasks = allTasks.filter((t: any) => {
          const hasAgents = t.labels?.some((l: string) => l.startsWith('agent:'));
          const isActive = !['done', 'cancelled'].includes(t.status);
          return hasAgents && isActive;
        });

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

            // Determine status based on session status (Gateway is source of truth)
            let status: 'pending' | 'running' | 'completed' | 'failed' = 'pending';
            if (session) {
              // Gateway session exists - use its status
              status = session.status === 'running' ? 'running' :
                       session.status === 'done' ? 'completed' :
                       session.status === 'error' ? 'failed' : 'pending';
            } else if (task.run?.status === 'done') {
              status = 'completed';
            } else if (task.run?.status === 'error') {
              status = 'failed';
            } else if (task.run?.status === 'running') {
              status = 'running';
            } else if (task.status === 'in-progress') {
              // Task is in-progress but no active session - agents finished
              status = 'completed';
            }

            return {
              name: agentName,
              status,
              elapsed: session?.createdAt ? Date.now() - session.createdAt : Date.now() - (task.run?.startedAt || Date.now()),
              output: session?.output || task.run?.output,
              error: session?.error || task.run?.error,
            };
          });

          const startedAt = task.run?.startedAt || Date.now();

          return {
            taskId: task.id,
            taskTitle: task.title,
            agents: agents.length > 0 ? agents : [{
              name: 'orchestrator-agent',
              status: 'pending' as const,
              elapsed: 0,
              output: undefined,
            }],
            startedAt,
            status: 'running' as const,
          };
        });

        setSessions(dashboardSessions);
      }
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
    fetchUsage();
    const interval = setInterval(fetchSessions, 3000);
    const usageInterval = setInterval(fetchUsage, 10000); // Update usage every 10s
    return () => {
      clearInterval(interval);
      clearInterval(usageInterval);
    };
  }, [fetchSessions, fetchUsage]);

  // Keep sessions ref updated for SSE callback
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  // Subscribe to SSE events for auto-refresh on task completion
  useServerEvents(
    useCallback((event) => {
      if (event.event === 'orchestrator.task_complete') {
        // Task completed - refresh sessions
        fetchSessions();
      }
      if (event.event === 'task.stalled') {
        const data = event.data as StalledTaskData;
        setStalledTasks(prev => new Map(prev).set(data.taskId, data));
      }
      if (event.event === 'task.stall-resumed') {
        const data = event.data as { taskId: string };
        setStalledTasks(prev => {
          const next = new Map(prev);
          next.delete(data.taskId);
          return next;
        });
      }
    }, [fetchSessions]),
    { enabled: true }
  );

  const handleResumeTask = useCallback(async (taskId: string) => {
    await fetch(`/api/orchestrator/tasks/${taskId}/resume`, {
      method: 'POST',
      credentials: 'include',
    });
  }, []);

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
      {/* Stalled Task Banners */}
      {Array.from(stalledTasks.values()).map(task => (
        <StalledTaskBanner
          key={task.taskId}
          task={task}
          onResume={() => handleResumeTask(task.taskId)}
          onDismiss={() => setStalledTasks(prev => {
            const next = new Map(prev);
            next.delete(task.taskId);
            return next;
          })}
        />
      ))}

      {/* Active Agents Panel - Shows all running sessions with output */}
      <div className="bg-card border border-border rounded-lg shadow-sm">
        <ActiveAgentsPanel onSessionClick={(taskId) => setSelectedTaskId(taskId)} />
      </div>

      {/* Supervisor Panel - Manager-style summary with signals */}
      <SupervisorPanel taskId={selectedTaskId || undefined} />

      {/* Task Detail Panel */}
      {selectedTaskId && (
        <TaskDetailPanel
          taskId={selectedTaskId}
          onClose={() => setSelectedTaskId(null)}
        />
      )}

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
        
        {/* Time Range Selector */}
        <div className="flex items-center gap-2">
          <Calendar size={14} className="text-muted-foreground" />
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as TimeRangeOption)}
            className="h-8 px-2 text-xs bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
            title="Select time range for statistics"
          >
            {TIME_RANGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={Users}
          label="Active Agents"
          value={orchestratorStats?.activeAgents ?? 0}
          color="#06b6d4"
        />
        <StatCard
          icon={CheckCircle2}
          label={`Completed (${getTimeWindow().label})`}
          value={orchestratorStats?.completedInPeriod ?? 0}
          color="#22c55e"
        />
        <StatCard
          icon={Activity}
          label="Active Tasks"
          value={orchestratorStats?.inProgress ?? 0}
          color="#8b5cf6"
        />
        <StatCard
          icon={Clock}
          label="In Review"
          value={orchestratorStats?.inReview ?? 0}
          color="#f59e0b"
        />
      </div>

      {/* Token Usage & Cost */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 rounded-xl border bg-card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp size={16} className="text-green-400" />
              Token Usage
            </h3>
            {usage.loading && <Loader2 size={14} className="animate-spin text-muted-foreground" />}
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Input tokens</span>
              <span className="font-mono">{usage.loading ? '...' : usage.totalInput.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Output tokens</span>
              <span className="font-mono">{usage.loading ? '...' : usage.totalOutput.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Total</span>
              <span className="font-mono font-semibold">{usage.loading ? '...' : (usage.totalInput + usage.totalOutput).toLocaleString()}</span>
            </div>
            <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-green-400 to-cyan-400"
                style={{ width: usage.loading ? '0%' : '100%' }}
              />
            </div>
          </div>
        </div>

        <div className="p-4 rounded-xl border bg-card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <DollarSign size={16} className="text-amber-400" />
              Estimated Cost
            </h3>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Model usage</span>
              <span className="font-mono">{usage.loading ? '...' : `$${usage.totalCost.toFixed(3)}`}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Tool calls</span>
              <span className="font-mono">$0.000</span>
            </div>
            <div className="flex items-center justify-between text-xs pt-2 border-t">
              <span className="text-muted-foreground">Total</span>
              <span className="font-mono font-semibold text-green-400">
                {usage.loading ? '...' : `$${usage.totalCost.toFixed(3)}`}
              </span>
            </div>
            <div className="text-[10px] text-muted-foreground mt-2">
              * Based on actual API usage from Gateway
            </div>
          </div>
        </div>
      </div>

      {/* Activity Chart */}
      <div className="p-4 rounded-xl border bg-card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Activity size={16} className="text-cyan-400" />
            Task Activity ({getTimeWindow().label})
          </h3>
          {statsLoading && <Loader2 size={14} className="animate-spin text-muted-foreground" />}
        </div>
        <div className="h-64">
          {orchestratorStats?.buckets && orchestratorStats.buckets.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={orchestratorStats.buckets}>
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 12 }}
                  interval="preserveStartEnd"
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                  labelStyle={{ color: 'hsl(var(--foreground))' }}
                />
                <Legend />
                <Bar name="Created" dataKey="created" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                <Bar name="Completed" dataKey="completed" fill="#22c55e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              No activity data available
            </div>
          )}
        </div>
      </div>

      {/* Per-Agent Cost Breakdown */}
      <div className="p-4 rounded-xl border bg-card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <DollarSignIcon size={16} className="text-amber-400" />
            Per-Agent Cost Breakdown ({getTimeWindow().label})
          </h3>
          {statsLoading && <Loader2 size={14} className="animate-spin text-muted-foreground" />}
        </div>
        <div className="h-48">
          {orchestratorStats?.agentCosts && orchestratorStats.agentCosts.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={orchestratorStats.agentCosts}>
                <XAxis
                  dataKey="agent"
                  tick={{ fontSize: 10 }}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  tickFormatter={(value) => `$${value.toFixed(2)}`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                  labelStyle={{ color: 'hsl(var(--foreground))' }}
                  formatter={(value: number | undefined, name: string | undefined) => {
                    const v = value || 0;
                    const n = name || '';
                    if (n === 'cost') return [`$${v.toFixed(4)}`, 'Cost'];
                    if (n === 'inputTokens') return [v.toLocaleString(), 'Input Tokens'];
                    if (n === 'outputTokens') return [v.toLocaleString(), 'Output Tokens'];
                    return [String(v), n];
                  }}
                />
                <Legend />
                <Bar name="cost" dataKey="cost" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              No agent cost data available
            </div>
          )}
        </div>
      </div>

      {/* Timeline View */}
      <div className="rounded-xl border bg-card">
        <TimelineView defaultDays={30} />
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
              <OfficeDesk
                key={session.taskId}
                session={session}
                onTaskClick={setSelectedTaskId}
              />
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
