/**
 * Budgets hook
 *
 * React hook for managing task/goal budgets.
 */

import { useState, useCallback } from 'react';

export interface TaskBudget {
  id: string;
  taskId?: string;
  goalId?: string;
  maxCostUSD: number;
  softLimitPercent: number;
  action: 'pause' | 'notify';
  createdAt: number;
  createdBy: string;
}

export interface BudgetSpending {
  budget: TaskBudget;
  currentCost: number;
  percentUsed: number;
  status: 'under' | 'warning' | 'exceeded';
}

export interface BudgetAlert {
  budgetId: string;
  taskId?: string;
  goalId?: string;
  currentCost: number;
  limit: number;
  percentUsed: number;
  triggeredAt: number;
  action: 'warning' | 'paused';
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

export function useBudgets(taskId?: string, goalId?: string) {
  const [budgets, setBudgets] = useState<TaskBudget[]>([]);
  const [spending, setSpending] = useState<BudgetSpending | null>(null);
  const [alerts, setAlerts] = useState<BudgetAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadBudgets = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (taskId) params.set('taskId', taskId);
      if (goalId) params.set('goalId', goalId);
      const data = await fetchWithAuth(`/api/orchestrator/budgets?${params}`);
      setBudgets(data.budgets || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load budgets');
    } finally {
      setLoading(false);
    }
  }, [taskId, goalId]);

  const loadStatus = useCallback(async (currentCost: number) => {
    try {
      const params = new URLSearchParams();
      if (taskId) params.set('taskId', taskId);
      if (goalId) params.set('goalId', goalId);
      params.set('currentCost', String(currentCost));
      const data = await fetchWithAuth(`/api/orchestrator/budgets/status?${params}`);
      setSpending(data.spending);
      setAlerts(data.alerts || []);
    } catch (err) {
      console.error('Failed to load budget status:', err);
    }
  }, [taskId, goalId]);

  const createBudget = useCallback(async (params: {
    maxCostUSD: number;
    softLimitPercent?: number;
    action?: 'pause' | 'notify';
  }): Promise<TaskBudget> => {
    const data = await fetchWithAuth('/api/orchestrator/budgets', {
      method: 'POST',
      body: JSON.stringify({
        taskId,
        goalId,
        ...params,
      }),
    });
    await loadBudgets();
    return data;
  }, [taskId, goalId, loadBudgets]);

  const updateBudget = useCallback(async (id: string, params: {
    maxCostUSD?: number;
    softLimitPercent?: number;
    action?: 'pause' | 'notify';
  }): Promise<TaskBudget> => {
    const data = await fetchWithAuth(`/api/orchestrator/budgets/${id}`, {
      method: 'PUT',
      body: JSON.stringify(params),
    });
    await loadBudgets();
    return data;
  }, [loadBudgets]);

  const deleteBudget = useCallback(async (id: string): Promise<void> => {
    await fetchWithAuth(`/api/orchestrator/budgets/${id}`, {
      method: 'DELETE',
    });
    await loadBudgets();
  }, [loadBudgets]);

  return {
    budgets,
    spending,
    alerts,
    loading,
    error,
    loadBudgets,
    loadStatus,
    createBudget,
    updateBudget,
    deleteBudget,
  };
}
