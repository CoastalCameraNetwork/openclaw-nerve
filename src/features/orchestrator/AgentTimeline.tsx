/**
 * AgentTimeline Component
 * 
 * Visual timeline showing agent execution progress for orchestrated tasks.
 */

import { memo, useEffect, useState } from 'react';
import { Play, CheckCircle2, XCircle, Clock, Cpu, AlertCircle } from 'lucide-react';
import type { TaskStatus as TaskStatusType } from './useOrchestrator';

interface AgentTimelineProps {
  taskStatus: TaskStatusType | null;
  loading?: boolean;
}

interface TimelineEvent {
  timestamp: string;
  agent?: string;
  event: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  output?: string;
  error?: string;
}

const AGENT_ICONS: Record<string, string> = {
  'k8s-agent': '🔷',
  'mgmt-agent': '🎛️',
  'wordpress-agent': '🌐',
  'streaming-agent': '📹',
  'hls-recorder-agent': '📼',
  'splash-scripts-agent': '🎬',
  'database-agent': '🗄️',
  'storage-agent': '💾',
  'cdn-agent': '☁️',
  'cicd-agent': '🔄',
  'security-reviewer': '🔒',
  'orchestrator-agent': '🎯',
};

function formatTime(timestamp: string | number): string {
  const date = typeof timestamp === 'number' ? new Date(timestamp) : new Date(timestamp);
  return date.toLocaleTimeString(undefined, { 
    hour: '2-digit', 
    minute: '2-digit',
    second: '2-digit'
  });
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${seconds}s`;
}

export const AgentTimeline = memo(function AgentTimeline({ 
  taskStatus,
  loading = false 
}: AgentTimelineProps) {
  const [elapsedTime, setElapsedTime] = useState(0);

  // Update elapsed time for running tasks
  useEffect(() => {
    if (!taskStatus?.run?.startedAt || taskStatus.run.status !== 'running') {
      setElapsedTime(0);
      return;
    }

    const updateElapsed = () => {
      setElapsedTime(Date.now() - taskStatus.run!.startedAt);
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [taskStatus?.run?.startedAt, taskStatus?.run?.status]);

  if (loading) {
    return (
      <div className="space-y-2 p-4">
        <div className="h-4 bg-muted rounded animate-pulse w-32" />
        <div className="h-3 bg-muted rounded animate-pulse w-full" />
        <div className="h-3 bg-muted rounded animate-pulse w-2/3" />
      </div>
    );
  }

  if (!taskStatus) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        No task status available
      </div>
    );
  }

  const { agents, run, checkpoints } = taskStatus;

  // Build timeline from agents and checkpoints
  const timelineEvents: TimelineEvent[] = [];

  // Add agent events
  agents.forEach((agent) => {
    const event: TimelineEvent = {
      timestamp: new Date().toISOString(),
      agent: agent.name,
      event: `Agent ${agent.name}`,
      status: agent.status,
      output: agent.output,
      error: agent.error,
    };
    timelineEvents.push(event);
  });

  // Add checkpoints
  checkpoints.forEach((checkpoint) => {
    timelineEvents.push({
      timestamp: checkpoint.timestamp,
      agent: checkpoint.agent,
      event: checkpoint.event,
      status: 'completed',
      ...checkpoint.details,
    });
  });

  // Sort by timestamp
  timelineEvents.sort((a, b) => 
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const isRunning = run?.status === 'running';
  const isCompleted = run?.status === 'done';
  const isError = run?.status === 'error' || run?.status === 'aborted';

  return (
    <div className="space-y-4">
      {/* Header with overall status */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Cpu size={16} className="text-primary" />
          Agent Execution Timeline
        </h3>
        
        {isRunning && (
          <span className="inline-flex items-center gap-1 text-xs text-cyan-400">
            <Clock size={12} className="animate-pulse" />
            {formatDuration(elapsedTime)}
          </span>
        )}
        
        {isCompleted && (
          <span className="inline-flex items-center gap-1 text-xs text-green-400">
            <CheckCircle2 size={12} />
            Completed
          </span>
        )}
        
        {isError && (
          <span className="inline-flex items-center gap-1 text-xs text-red-400">
            <AlertCircle size={12} />
            {run?.error || 'Error'}
          </span>
        )}
      </div>

      {/* Agent status overview */}
      {agents.length > 0 && (
        <div className="grid grid-cols-1 gap-2">
          {agents.map((agent) => (
            <div
              key={agent.name}
              className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                agent.status === 'running' 
                  ? 'bg-cyan-500/10 border-cyan-500/30' 
                  : agent.status === 'completed'
                  ? 'bg-green-500/10 border-green-500/30'
                  : agent.status === 'failed'
                  ? 'bg-red-500/10 border-red-500/30'
                  : 'bg-muted/50 border-border'
              }`}
            >
              {/* Status indicator */}
              <div className="shrink-0">
                {agent.status === 'running' && (
                  <Clock size={16} className="text-cyan-400 animate-pulse" />
                )}
                {agent.status === 'completed' && (
                  <CheckCircle2 size={16} className="text-green-400" />
                )}
                {agent.status === 'failed' && (
                  <XCircle size={16} className="text-red-400" />
                )}
                {agent.status === 'pending' && (
                  <Play size={16} className="text-muted-foreground" />
                )}
              </div>

              {/* Agent info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {AGENT_ICONS[agent.name] || '🤖'} {agent.name}
                  </span>
                  {agent.session_key && (
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {agent.session_key.substring(0, 20)}...
                    </span>
                  )}
                </div>
                
                {agent.output && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {agent.output.substring(0, 200)}
                    {agent.output.length > 200 && '...'}
                  </p>
                )}
                
                {agent.error && (
                  <p className="text-xs text-red-400 mt-1">
                    {agent.error}
                  </p>
                )}
              </div>

              {/* Duration (if completed) */}
              {agent.status === 'completed' && (
                <span className="text-xs text-muted-foreground shrink-0">
                  Done
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Timeline events */}
      {timelineEvents.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Activity Log
          </h4>
          <div className="space-y-1">
            {timelineEvents.map((event, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2 text-xs"
              >
                <span className="text-[10px] text-muted-foreground font-mono shrink-0 mt-0.5">
                  {formatTime(event.timestamp)}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {event.agent && (
                      <span className="text-[10px]">
                        {AGENT_ICONS[event.agent] || '🤖'}
                      </span>
                    )}
                    <span className={`font-medium ${
                      event.status === 'failed' ? 'text-red-400' :
                      event.status === 'running' ? 'text-cyan-400' :
                      'text-foreground'
                    }`}>
                      {event.event}
                    </span>
                  </div>
                  {event.output && (
                    <p className="text-muted-foreground mt-0.5 line-clamp-1">
                      {event.output}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No agents message */}
      {agents.length === 0 && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          <Play size={24} className="mx-auto mb-2 opacity-50" />
          <p>Task ready to execute</p>
          <p className="text-xs mt-1">Agents will be spawned when you click Execute</p>
        </div>
      )}
    </div>
  );
});
