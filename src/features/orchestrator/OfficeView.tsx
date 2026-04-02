/**
 * Office View - Pixel Art Agent Dashboard
 *
 * Visual representation of agents working in an office environment.
 * Each agent has a desk with their pixel art avatar.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PixelArtAvatar } from './PixelArtAvatar';
import type { AgentType } from './PixelArtAvatar';
import { useAgentSignals, type SignalCheckpoint } from './useAgentSignals';

export interface OfficeViewProps {
  showGrid?: boolean;
  animated?: boolean;
}

interface DeskPosition {
  row: number;
  col: number;
}

interface AgentDesk {
  agentId: string;
  agentType: AgentType;
  status: 'idle' | 'working' | 'blocked' | 'offline';
  currentTask?: string;
  position: DeskPosition;
  signal?: {
    type: 'thinking' | 'coding' | 'waiting' | 'error';
    message?: string;
  };
}

interface ActiveAgent {
  agentId: string;
  status?: string;
  currentTaskId?: string;
}

const SIGNAL_ICONS: Record<string, string> = {
  thinking: '🤔',
  coding: '💻',
  waiting: '⏳',
  error: '⚠️',
};

const SIGNAL_COLORS: Record<string, string> = {
  thinking: 'text-purple-500',
  coding: 'text-green-500',
  waiting: 'text-yellow-500',
  error: 'text-red-500',
};

/**
 * Map agent IDs to desk positions in a grid.
 */
function assignDeskPositions(agentIds: string[]): Map<string, DeskPosition> {
  const positions = new Map<string, DeskPosition>();
  const cols = 4; // 4 desks per row

  agentIds.forEach((id, index) => {
    const row = Math.floor(index / cols);
    const col = index % cols;
    positions.set(id, { row, col });
  });

  return positions;
}

/**
 * Determine agent type from agent ID or metadata.
 */
function inferAgentType(agentId: string): AgentType {
  const lower = agentId.toLowerCase();
  if (lower.includes('security')) return 'security-reviewer';
  if (lower.includes('planner')) return 'planner';
  if (lower.includes('coder') || lower.includes('dev')) return 'coder';
  if (lower.includes('tester') || lower.includes('qa')) return 'tester';
  if (lower.includes('orchestrator')) return 'orchestrator-agent';
  return 'custom';
}

/**
 * Convert agent status to display status.
 */
function convertStatus(rawStatus?: string): 'idle' | 'working' | 'blocked' | 'offline' {
  if (!rawStatus) return 'offline';
  switch (rawStatus) {
    case 'running':
    case 'thinking':
    case 'coding':
    case 'executing':
      return 'working';
    case 'blocked':
    case 'error':
      return 'blocked';
    case 'idle':
    case 'waiting':
      return 'idle';
    default:
      return 'idle';
  }
}

/**
 * Fetch active agents from the orchestrator API.
 */
async function fetchActiveAgents(): Promise<Record<string, ActiveAgent>> {
  try {
    const res = await fetch('/api/orchestrator/agents/active', {
      credentials: 'include',
    });
    if (!res.ok) return {};
    const data = await res.json();
    return data.agents || {};
  } catch {
    return {};
  }
}

export function OfficeView({ showGrid = true, animated = true }: OfficeViewProps) {
  const [activeAgents, setActiveAgents] = useState<Record<string, ActiveAgent>>({});
  const { signals } = useAgentSignals();

  // Poll active agents
  const loadAgents = useCallback(async () => {
    const agents = await fetchActiveAgents();
    setActiveAgents(agents);
  }, []);

  useEffect(() => {
    loadAgents();
    const interval = setInterval(loadAgents, 5000); // Poll every 5 seconds
    return () => clearInterval(interval);
  }, [loadAgents]);

  const desks: AgentDesk[] = useMemo(() => {
    const agentIds = Object.keys(activeAgents);
    if (agentIds.length === 0) return [];

    const positions = assignDeskPositions(agentIds);

    return agentIds.map((agentId): AgentDesk => {
      const agent = activeAgents[agentId];

      // Find signal for this agent
      const agentSignal = signals.find(
        (s: SignalCheckpoint) => s.agent === agentId
      );

      return {
        agentId,
        agentType: inferAgentType(agentId),
        status: convertStatus(agent.status),
        currentTask: agent.currentTaskId,
        position: positions.get(agentId) || { row: 0, col: 0 },
        signal: agentSignal
          ? {
              type: (agentSignal.signal as 'thinking' | 'coding' | 'waiting' | 'error') || 'waiting',
              message: agentSignal.detail,
            }
          : undefined,
      };
    });
  }, [activeAgents, signals]);

  const gridSize = useMemo(() => {
    const maxRow = Math.max(0, ...desks.map(d => d.position.row));
    const maxCol = Math.max(0, ...desks.map(d => d.position.col));
    return { rows: maxRow + 1, cols: Math.max(maxCol + 1, 4) };
  }, [desks]);

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Agent Office</span>
          <span className="text-sm font-normal text-muted-foreground">
            {desks.length} agent{desks.length !== 1 ? 's' : ''} active
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div
          className="relative p-4 bg-slate-50 dark:bg-slate-900 rounded-lg"
          style={{
            minHeight: gridSize.rows * 120 + 20,
            backgroundImage: showGrid
              ? 'linear-gradient(to right, #e2e8f0 1px, transparent 1px), linear-gradient(to bottom, #e2e8f0 1px, transparent 1px)'
              : 'none',
            backgroundSize: '25% 120px',
          }}
        >
          {desks.map((desk) => (
            <AgentDeskView
              key={desk.agentId}
              desk={desk}
              animated={animated}
            />
          ))}

          {desks.length === 0 && (
            <div className="text-center text-muted-foreground py-12">
              No active agents. Start a task to see agents at work.
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-emerald-500" />
            <span>Idle</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse" />
            <span>Working</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <span>Blocked</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-slate-500" />
            <span>Offline</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface AgentDeskViewProps {
  desk: AgentDesk;
  animated: boolean;
}

function AgentDeskView({ desk, animated }: AgentDeskViewProps) {
  return (
    <div
      className="absolute transition-all duration-300"
      style={{
        top: `${desk.position.row * 120 + 20}px`,
        left: `${desk.position.col * 25}%`,
        width: '25%',
        height: '100px',
      }}
    >
      {/* Desk */}
      <div className="relative h-full p-2">
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-md p-3 h-full border-2 border-slate-200 dark:border-slate-700">
          {/* Agent avatar */}
          <div className="flex items-center gap-2 mb-2">
            <PixelArtAvatar
              agentType={desk.agentType}
              status={desk.status}
              size="md"
              animated={animated}
            />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium truncate">
                {desk.agentType.replace(/-/g, ' ')}
              </div>
              {desk.currentTask && (
                <div className="text-xs text-muted-foreground truncate">
                  Task: {desk.currentTask.slice(0, 8)}...
                </div>
              )}
            </div>
          </div>

          {/* Signal bubble */}
          {desk.signal && (
            <div className={`text-xs ${SIGNAL_COLORS[desk.signal.type]} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
              <span className="mr-1">{SIGNAL_ICONS[desk.signal.type]}</span>
              <span className="line-clamp-2">{desk.signal.message}</span>
            </div>
          )}

          {/* Status indicator at bottom */}
          <div className="mt-2 flex justify-between items-center">
            <span className="text-xs px-2 py-1 rounded-full bg-muted">
              {desk.status}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
