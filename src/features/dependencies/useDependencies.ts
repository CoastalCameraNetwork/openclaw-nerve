/**
 * Dependencies API hook
 *
 * React hook for managing task dependencies.
 */

import { useState, useCallback } from 'react';

const API_BASE = '/api/kanban/tasks';

export interface DependencyGraph {
  upstream: { taskId: string; title: string; status: string }[];
  downstream: { taskId: string; title: string; status: string }[];
}

export interface TaskDependencies {
  blocked_by: string[];
  blocks: string[];
}

export interface DependencyData {
  taskId: string;
  dependencies: TaskDependencies;
  graph: DependencyGraph;
}

export interface AddDependencyResult {
  task: { id: string; dependencies: TaskDependencies };
  dependsOn: { id: string; dependencies: TaskDependencies };
}

export interface RemoveDependencyResult {
  task: { id: string; dependencies: TaskDependencies };
  dependsOn: { id: string; dependencies: TaskDependencies };
}

async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Hook to manage dependencies for a single task
 */
export function useDependencies(taskId: string | null) {
  const [data, setData] = useState<DependencyData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDependencies = useCallback(async () => {
    if (!taskId) {
      setData(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const result = await fetchWithAuth(`${API_BASE}/${taskId}/dependencies`);
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dependencies');
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  const addDependency = useCallback(async (dependsOnId: string): Promise<AddDependencyResult> => {
    if (!taskId) {
      throw new Error('No task ID specified');
    }

    try {
      setLoading(true);
      setError(null);
      const result = await fetchWithAuth(`${API_BASE}/${taskId}/dependency`, {
        method: 'POST',
        body: JSON.stringify({ dependsOnId }),
      });
      setData((prev) =>
        prev
          ? {
              ...prev,
              dependencies: result.task.dependencies,
              graph: {
                upstream: [...prev.graph.upstream, { taskId: dependsOnId, title: '', status: '' }],
                downstream: prev.graph.downstream,
              },
            }
          : null
      );
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add dependency';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  const removeDependency = useCallback(async (dependsOnId: string): Promise<RemoveDependencyResult> => {
    if (!taskId) {
      throw new Error('No task ID specified');
    }

    try {
      setLoading(true);
      setError(null);
      const result = await fetchWithAuth(`${API_BASE}/${taskId}/dependency/${dependsOnId}`, {
        method: 'DELETE',
      });
      setData((prev) =>
        prev
          ? {
              ...prev,
              dependencies: result.task.dependencies,
              graph: {
                upstream: prev.graph.upstream.filter((u) => u.taskId !== dependsOnId),
                downstream: prev.graph.downstream,
              },
            }
          : null
      );
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to remove dependency';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  return {
    data,
    loading,
    error,
    loadDependencies,
    addDependency,
    removeDependency,
  };
}
