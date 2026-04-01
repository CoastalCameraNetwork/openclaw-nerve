/**
 * AgentCard - Displays single agent status
 */

import type { AgentStatus } from './useAgentStatus';
import { Activity, Clock, XCircle } from 'lucide-react';

interface AgentCardProps {
  agent: AgentStatus;
  onClick?: () => void;
}

export function AgentCard({ agent, onClick }: AgentCardProps) {
  const statusColor =
    agent.status === 'available'
      ? 'bg-green-500'
      : agent.status === 'busy'
      ? 'bg-yellow-500'
      : 'bg-red-500';

  const statusBg =
    agent.status === 'available'
      ? 'bg-green-500/10 border-green-500/30'
      : agent.status === 'busy'
      ? 'bg-yellow-500/10 border-yellow-500/30'
      : 'bg-red-500/10 border-red-500/30';

  return (
    <div
      onClick={onClick}
      className={`p-4 rounded-lg border ${statusBg} cursor-pointer hover:shadow-md transition-shadow`}
    >
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-3 h-3 rounded-full ${statusColor} animate-pulse`} />
        <h3 className="font-semibold text-sm">{agent.displayName}</h3>
      </div>

      <div className="space-y-2 text-xs text-muted-foreground">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1">
            <Activity size={12} />
            Status
          </span>
          <span className="capitalize font-medium text-foreground">
            {agent.status}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1">
            <Clock size={12} />
            Active Tasks
          </span>
          <span className="font-medium text-foreground">
            {agent.activeTasks}
          </span>
        </div>

        {agent.error && (
          <div className="flex items-center gap-1 text-destructive">
            <XCircle size={12} />
            <span className="truncate">{agent.error}</span>
          </div>
        )}
      </div>

      {agent.activeTasks > 0 && (
        <div className="mt-3 pt-3 border-t text-xs">
          <div className="text-muted-foreground mb-1">Current tasks:</div>
          <div className="space-y-1">
            {agent.currentTaskIds.slice(0, 3).map((id) => (
              <div key={id} className="text-xs text-foreground font-mono truncate">
                {id}
              </div>
            ))}
            {agent.currentTaskIds.length > 3 && (
              <div className="text-muted-foreground">
                +{agent.currentTaskIds.length - 3} more
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
