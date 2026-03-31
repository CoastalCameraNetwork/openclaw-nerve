/**
 * Goals API hooks
 *
 * React hooks for interacting with the Goals API.
 */

import { useState, useCallback, useEffect } from 'react';

const API_BASE = '/api/orchestrator/goals';

export interface Goal {
  id: string;
  title: string;
  description?: string;
  createdAt: number;
  taskIds: string[];
  targetDate?: number;
  status: 'active' | 'completed' | 'archived';
  version: number;
}

export interface GoalWithProgress extends Goal {
  completedTasks: number;
  totalTasks: number;
  progressPercent: number;
  blockedTasks: number;
  failedTasks: number;
}

export interface CreateGoalParams {
  title: string;
  description?: string;
  taskIds?: string[];
  targetDate?: number;
}

export interface UpdateGoalParams {
  title?: string;
  description?: string | null;
  taskIds?: string[];
  targetDate?: number | null;
  status?: 'active' | 'completed' | 'archived';
  version: number;
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
 * Hook to list all goals with optional status filter
 */
export function useGoals(statusFilter?: 'active' | 'completed' | 'archived') {
  const [goals, setGoals] = useState<GoalWithProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadGoals = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const url = statusFilter ? `${API_BASE}?status=${statusFilter}` : API_BASE;
      const data = await fetchWithAuth(url);
      setGoals(data.goals || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load goals');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadGoals();
  }, [loadGoals]);

  return { goals, loading, error, reload: loadGoals };
}

/**
 * Hook to get a single goal by ID
 */
export function useGoal(goalId: string | null) {
  const [goal, setGoal] = useState<GoalWithProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadGoal = useCallback(async () => {
    if (!goalId) {
      setGoal(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await fetchWithAuth(`${API_BASE}/${goalId}`);
      setGoal(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load goal');
    } finally {
      setLoading(false);
    }
  }, [goalId]);

  useEffect(() => {
    loadGoal();
  }, [goalId]);

  return { goal, loading, error, reload: loadGoal };
}

/**
 * Hook to create a new goal
 */
export function useCreateGoal() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createGoal = useCallback(async (params: CreateGoalParams): Promise<Goal> => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchWithAuth(API_BASE, {
        method: 'POST',
        body: JSON.stringify(params),
      });
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create goal';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { createGoal, loading, error };
}

/**
 * Hook to update an existing goal
 */
export function useUpdateGoal() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateGoal = useCallback(async (goalId: string, params: UpdateGoalParams): Promise<Goal> => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchWithAuth(`${API_BASE}/${goalId}`, {
        method: 'PUT',
        body: JSON.stringify(params),
      });
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update goal';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { updateGoal, loading, error };
}

/**
 * Hook to delete a goal
 */
export function useDeleteGoal() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deleteGoal = useCallback(async (goalId: string): Promise<void> => {
    try {
      setLoading(true);
      setError(null);
      await fetchWithAuth(`${API_BASE}/${goalId}`, {
        method: 'DELETE',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete goal';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { deleteGoal, loading, error };
}

/**
 * Hook to add a task to a goal
 */
export function useAddTaskToGoal() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addTask = useCallback(async (goalId: string, taskId: string): Promise<Goal> => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchWithAuth(`${API_BASE}/${goalId}/tasks`, {
        method: 'POST',
        body: JSON.stringify({ taskId }),
      });
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add task to goal';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { addTask, loading, error };
}

/**
 * Hook to remove a task from a goal
 */
export function useRemoveTaskFromGoal() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const removeTask = useCallback(async (goalId: string, taskId: string): Promise<Goal> => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchWithAuth(`${API_BASE}/${goalId}/tasks/${taskId}`, {
        method: 'DELETE',
      });
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to remove task from goal';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { removeTask, loading, error };
}
