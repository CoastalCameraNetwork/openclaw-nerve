/**
 * SupervisorPanel - Manager-style summary of team activity
 * Shows what the team is doing, what's blocked, and recommended actions
 */

import { memo } from 'react';
import { AlertTriangle, TrendingUp } from 'lucide-react';
import { useAgentSignals } from './useAgentSignals';

interface SupervisorPanelProps {
  taskId?: string;
}

export const SupervisorPanel = memo(function SupervisorPanel({ taskId }: SupervisorPanelProps) {
  const { blockedTasks, allBlockedTasks, currentPhases, signals } = useAgentSignals(taskId);

  const blockedCount = allBlockedTasks.size;

  const lastSignal = signals.length > 0 ? signals[signals.length - 1] : null;

  const getRecommendedAction = (): string | null => {
    if (blockedTasks) {
      return blockedTasks.requiresHumanInput
        ? `Action needed: ${blockedTasks.reason}`
        : `Agent ${blockedTasks.agent} is blocked: ${blockedTasks.reason}`;
    }
    if (lastSignal?.signal === 'handoff') {
      return `Waiting for ${lastSignal.data?.nextAgent} to start`;
    }
    return null;
  };

  const recommendedAction = getRecommendedAction();

  return (
    <div className="p-4 bg-card rounded-lg border border-border">
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <span className="text-lg">🎯</span>
        Supervisor Update
      </h3>

      {/* Blocked Tasks Alert */}
      {blockedCount > 0 && (
        <div className="mb-4 p-3 bg-destructive/10 border border-destructive/30 rounded-md">
          <div className="flex items-center gap-2 text-destructive text-sm font-medium">
            <AlertTriangle size={14} />
            {blockedCount} Blocked Task{blockedCount !== 1 ? 's' : ''}
          </div>
          {blockedTasks && (
            <div className="mt-2 text-xs text-destructive">
              <strong>{blockedTasks.agent}:</strong> {blockedTasks.reason}
              {blockedTasks.suggestion && (
                <div className="mt-1 text-xs text-muted-foreground">
                  💡 {blockedTasks.suggestion}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Current Activity */}
      <div className="mb-4">
        <div className="text-xs text-muted-foreground mb-1">Current Activity</div>
        {currentPhases.size > 0 ? (
          <ul className="space-y-1">
            {Array.from(currentPhases.entries()).map(([agent, phase]) => (
              <li key={agent} className="text-xs flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                <span className="font-medium">{agent}</span>
                <span className="text-muted-foreground">→ {phase}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-xs text-muted-foreground">No active agents</div>
        )}
      </div>

      {/* Last Signal */}
      {lastSignal && (
        <div className="mb-4 pt-3 border-t">
          <div className="text-xs text-muted-foreground mb-1">Latest Signal</div>
          <div className="text-xs">
            <span className="font-mono bg-muted px-1.5 py-0.5 rounded">
              {lastSignal.signal}
            </span>
            {lastSignal.detail && (
              <span className="ml-2 text-muted-foreground">{lastSignal.detail}</span>
            )}
          </div>
        </div>
      )}

      {/* Recommended Action */}
      {recommendedAction && (
        <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-md">
          <div className="flex items-start gap-2">
            <TrendingUp size={14} className="text-blue-400 mt-0.5" />
            <div className="text-xs text-blue-200">
              <span className="font-medium">Recommended:</span> {recommendedAction}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
