/**
 * DependencyPanel - Shows upstream and downstream dependencies for a task
 */

import { useCallback, useEffect, useState } from 'react';
import { Link2, Link2Off, AlertCircle } from 'lucide-react';
import { useDependencies } from './useDependencies';

interface DependencyPanelProps {
  taskId: string;
  onOpenPicker?: () => void;
}

export function DependencyPanel({ taskId, onOpenPicker }: DependencyPanelProps) {
  const { data, loading, error, loadDependencies, removeDependency } = useDependencies(taskId);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    loadDependencies();
  }, [loadDependencies]);

  const handleRemove = useCallback(async (dependsOnId: string) => {
    try {
      setActionError(null);
      await removeDependency(dependsOnId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to remove dependency';
      setActionError(message);
      console.error('Failed to remove dependency:', err);
    }
  }, [removeDependency]);

  if (loading) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        Loading dependencies...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-destructive bg-destructive/10 rounded-md">
        {error}
      </div>
    );
  }

  const hasUpstream = data?.graph.upstream && data.graph.upstream.length > 0;
  const hasDownstream = data?.graph.downstream && data.graph.downstream.length > 0;

  if (!hasUpstream && !hasDownstream) {
    return (
      <div className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground mb-3">
          <Link2 className="h-4 w-4" />
          <span className="text-sm font-medium">Dependencies</span>
        </div>
        <p className="text-sm text-muted-foreground">
          No dependencies configured.
        </p>
        {onOpenPicker && (
          <button
            onClick={onOpenPicker}
            className="mt-3 text-xs text-primary hover:underline"
          >
            + Add dependency
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Link2 className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Dependencies</span>
      </div>

      {/* Action Error */}
      {actionError && (
        <div className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-2 py-1.5 flex items-center gap-1">
          <AlertCircle size={12} />
          {actionError}
        </div>
      )}

      {/* Upstream (Blocking) Tasks */}
      {hasUpstream && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-2">
            Blocked by (must complete first)
          </h4>
          <ul className="space-y-1.5">
            {data.graph.upstream.map((upstream) => (
              <li
                key={upstream.taskId}
                className="flex items-center justify-between text-sm p-2 rounded-md bg-muted/50"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${
                      upstream.status === 'done'
                        ? 'bg-green-500'
                        : upstream.status === 'in-progress'
                        ? 'bg-yellow-500'
                        : 'bg-gray-400'
                    }`}
                  />
                  <span>{upstream.title}</span>
                  <span className="text-xs text-muted-foreground">({upstream.taskId})</span>
                </div>
                {onOpenPicker && (
                  <button
                    onClick={() => handleRemove(upstream.taskId)}
                    className="text-muted-foreground hover:text-destructive"
                    title="Remove dependency"
                  >
                    <Link2Off className="h-3 w-3" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Downstream (Blocked By This) Tasks */}
      {hasDownstream && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-2">
            Blocks (waiting on this task)
          </h4>
          <ul className="space-y-1.5">
            {data.graph.downstream.map((downstream) => (
              <li
                key={downstream.taskId}
                className="flex items-center gap-2 text-sm p-2 rounded-md bg-muted/50"
              >
                <span
                  className={`inline-block w-2 h-2 rounded-full ${
                    downstream.status === 'done'
                      ? 'bg-green-500'
                      : downstream.status === 'in-progress'
                      ? 'bg-yellow-500'
                      : 'bg-gray-400'
                  }`}
                />
                <span>{downstream.title}</span>
                <span className="text-xs text-muted-foreground">({downstream.taskId})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {onOpenPicker && (
        <button
          onClick={onOpenPicker}
          className="mt-2 text-xs text-primary hover:underline"
        >
          + Add dependency
        </button>
      )}
    </div>
  );
}
