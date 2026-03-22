/**
 * ActiveAgentsPanel Component
 * 
 * Shows all currently running agent sessions across all orchestrated tasks.
 * Provides real-time visibility into what agents are doing.
 */

import { memo, useEffect, useState } from 'react';
import { Cpu, Clock, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

interface ActiveSession {
  sessionKey: string;
  label: string;
  status: 'running' | 'done' | 'error' | 'failed';
  createdAt?: number;
  error?: string;
  output?: string;
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

export const ActiveAgentsPanel = memo(function ActiveAgentsPanel({ onSessionClick }: { onSessionClick?: (taskId: string) => void }) {
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [elapsed, setElapsed] = useState<Record<string, number>>({});

  // Poll for active sessions
  useEffect(() => {
    const fetchSessions = async () => {
      try {
        // This would call a new API endpoint to get all active sessions
        // For now, we'll use a placeholder
        const response = await fetch('/api/orchestrator/sessions', {
          credentials: 'include',
        });
        
        if (response.ok) {
          const data = await response.json();
          setSessions(data.sessions || []);
        }
      } catch (err) {
        console.error('Failed to fetch active sessions:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchSessions();
    const interval = setInterval(fetchSessions, 5000);
    return () => clearInterval(interval);
  }, []);

  // Update elapsed time for running sessions
  useEffect(() => {
    const updateElapsed = () => {
      const now = Date.now();
      const newElapsed: Record<string, number> = {};
      
      sessions.forEach(session => {
        if (session.status === 'running' && session.createdAt) {
          newElapsed[session.sessionKey] = now - session.createdAt;
        }
      });
      
      setElapsed(newElapsed);
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [sessions]);

  // Extract task ID from label (format: orch-{taskId}-{agentName})
  function extractTaskId(label: string): string {
    const parts = label.split('-');
    if (parts.length >= 4 && parts[0] === 'orch') {
      // Task ID is parts[1] through parts[length-2] (excluding agent name at end)
      return parts.slice(1, parts.length - 1).join('-');
    }
    return '';
  }

  // Extract agent name from label (format: orch-{taskId}-{agentName})
  function extractAgentName(label: string): string {
    const parts = label.split('-');
    if (parts.length >= 3 && parts[0] === 'orch') {
      return parts.slice(2).join('-');
    }
    return 'unknown-agent';
  }

  if (loading) {
    return (
      <div className="p-4 text-center text-muted-foreground text-sm">
        <Loader2 size={16} className="animate-spin mx-auto mb-2" />
        Loading active agents...
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="p-4 text-center text-muted-foreground text-sm">
        <Cpu size={24} className="mx-auto mb-2 opacity-50" />
        No active agent sessions
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <h3 className="text-xs font-semibold uppercase tracking-wide flex items-center gap-2">
          <Cpu size={14} className="text-primary" />
          Active Agents ({sessions.length})
        </h3>
      </div>

      <div className="space-y-2 px-3 pb-3 max-h-[400px] overflow-y-auto">
        {sessions.map((session) => {
          const agentName = extractAgentName(session.label);
          const icon = AGENT_ICONS[agentName] || '🤖';
          const elapsedMs = elapsed[session.sessionKey] || 0;

          return (
            <div
              key={session.sessionKey}
              onClick={() => {
                const taskId = extractTaskId(session.label);
                if (taskId && onSessionClick) {
                  onSessionClick(taskId);
                }
              }}
              className={`p-3 rounded-lg border transition-colors cursor-pointer hover:border-primary/50 ${
                session.status === 'running'
                  ? 'bg-cyan-500/10 border-cyan-500/30'
                  : session.status === 'done'
                  ? 'bg-green-500/10 border-green-500/30'
                  : 'bg-red-500/10 border-red-500/30'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="text-lg shrink-0">{icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">
                        {agentName}
                      </span>
                      {session.status === 'running' && (
                        <span className="inline-flex items-center gap-1 text-xs text-cyan-400">
                          <Loader2 size={10} className="animate-spin" />
                          Running
                        </span>
                      )}
                      {session.status === 'done' && (
                        <span className="inline-flex items-center gap-1 text-xs text-green-400">
                          <CheckCircle2 size={10} />
                          Done
                        </span>
                      )}
                      {session.status === 'error' && (
                        <span className="inline-flex items-center gap-1 text-xs text-red-400">
                          <XCircle size={10} />
                          Error
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {session.label}
                    </div>
                  </div>
                </div>

                {elapsedMs > 0 && (
                  <span className="text-xs text-muted-foreground shrink-0 flex items-center gap-1">
                    <Clock size={10} />
                    {formatElapsed(elapsedMs)}
                  </span>
                )}
              </div>

              {session.error && (
                <div className="mt-2 text-xs text-red-400 bg-red-500/10 rounded p-2">
                  {session.error}
                </div>
              )}

              {session.output && (
                <div className="mt-2 text-xs text-muted-foreground bg-muted/50 rounded p-2 line-clamp-2">
                  {session.output.substring(0, 200)}
                  {session.output.length > 200 && '...'}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});
