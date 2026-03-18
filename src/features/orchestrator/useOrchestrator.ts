/**
 * Orchestrator API hooks
 *
 * React hooks for interacting with the OpenClaw Orchestrator API.
 */

import { useState, useCallback, useEffect } from 'react';

const API_BASE = '/api/orchestrator';

export interface SpecialistAgent {
  name: string;
  domain: string;
  description: string;
  keywords: string[];
  thinking?: 'off' | 'low' | 'medium' | 'high';
}

export interface RoutingPreview {
  agents: string[];
  sequence: 'single' | 'sequential' | 'parallel';
  gate_mode: 'audit-only' | 'gate-on-write' | 'gate-on-deploy';
  rule_id: string | null;
  fallback_used: boolean;
  agent_details?: SpecialistAgent[];
}

export interface OrchestratorTask {
  task_id: string;
  kanban_id: string;
  orchestrator_id: string;
  title: string;
  agents: string[];
  sequence: 'single' | 'sequential' | 'parallel';
  gate_mode: 'audit-only' | 'gate-on-write' | 'gate-on-deploy';
  routing: {
    rule_id: string | null;
    fallback_used: boolean;
  };
  status: string;
  created_at: string;
}

export interface TaskStatus {
  task_id: string;
  status: string;
  column: string;
  agents: Array<{
    name: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    session_key?: string;
    output?: string;
    error?: string;
  }>;
  checkpoints: Array<{
    timestamp: string;
    event: string;
    agent?: string;
    details?: Record<string, unknown>;
  }>;
  run?: {
    sessionKey: string;
    status: 'running' | 'done' | 'error' | 'aborted';
    startedAt: number;
    endedAt?: number;
    error?: string;
  };
}

export interface CreateTaskParams {
  title: string;
  description: string;
  gate_mode?: 'audit-only' | 'gate-on-write' | 'gate-on-deploy';
  priority?: 'critical' | 'high' | 'normal' | 'low';
  status?: 'backlog' | 'todo';
  execute_immediately?: boolean;
  maxCostUSD?: number;
}

async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const response = await fetch(url, { 
    ...options, 
    headers,
    credentials: 'include', // Include session cookies for auth
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }
  
  return response.json();
}

/**
 * Hook to list all specialist agents.
 */
export function useAgents() {
  const [agents, setAgents] = useState<SpecialistAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAgents = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchWithAuth(`${API_BASE}/agents`);
      setAgents(data.agents || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load agents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  return { agents, loading, error, reload: loadAgents };
}

/**
 * Hook to preview routing for a task description.
 */
export function useRoutingPreview() {
  const [preview, setPreview] = useState<RoutingPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewRouting = useCallback(async (description: string) => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchWithAuth(`${API_BASE}/route`, {
        method: 'POST',
        body: JSON.stringify({ description }),
      });
      setPreview(data);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to preview routing';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const clearPreview = useCallback(() => {
    setPreview(null);
    setError(null);
  }, []);

  return { preview, loading, error, previewRouting, clearPreview };
}

/**
 * Hook to create a new orchestrated task.
 */
export function useCreateTask() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createTask = useCallback(async (params: CreateTaskParams): Promise<OrchestratorTask> => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchWithAuth(`${API_BASE}/start`, {
        method: 'POST',
        body: JSON.stringify(params),
      });
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create task';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { createTask, loading, error };
}

/**
 * Hook to get task status with agent details.
 */
export function useTaskStatus(taskId: string | null, pollInterval = 3000) {
  const [status, setStatus] = useState<TaskStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    if (!taskId) {
      setStatus(null);
      setLoading(false);
      return;
    }

    try {
      const data = await fetchWithAuth(`${API_BASE}/status/${taskId}`);
      setStatus(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load task status');
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    loadStatus();
    
    if (!taskId) return;
    
    // Poll for updates if task is in-progress
    const interval = setInterval(() => {
      loadStatus();
    }, pollInterval);

    return () => clearInterval(interval);
  }, [taskId, pollInterval, loadStatus]);

  return { status, loading, error, reload: loadStatus };
}

/**
 * Hook to execute a task (spawn agent sessions).
 */
export function useExecuteTask() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const executeTask = useCallback(async (taskId: string) => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchWithAuth(`${API_BASE}/execute/${taskId}`, {
        method: 'POST',
      });
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to execute task';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { executeTask, loading, error };
}

/**
 * Hook to cancel a running task.
 */
export function useCancelTask() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancelTask = useCallback(async (taskId: string) => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchWithAuth(`${API_BASE}/cancel/${taskId}`, {
        method: 'POST',
      });
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to cancel task';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { cancelTask, loading, error };
}

/**
 * Hook to get task sessions (including captured output from expired sessions)
 */
export function useTaskSessions(taskId: string | null, pollInterval = 3000) {
  const [sessions, setSessions] = useState<Array<{
    label: string;
    status: string;
    output?: string;
    error?: string;
    capturedAt?: number;
    source: 'gateway' | 'captured';
  }>>([]);
  const [loading, setLoading] = useState(true);

  const loadSessions = useCallback(async () => {
    if (!taskId) {
      setSessions([]);
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`/api/orchestrator/task/${taskId}/sessions`, {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setSessions(data.sessions || []);
      }
    } catch (err) {
      console.error('Failed to load task sessions:', err);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    loadSessions();
    const interval = setInterval(loadSessions, pollInterval);
    return () => clearInterval(interval);
  }, [taskId, pollInterval, loadSessions]);

  return { sessions, loading, reload: loadSessions };
}

/**
 * Time-bucketed statistics for the orchestrator dashboard
 */
export interface OrchestratorStats {
  range: string;
  since: string;
  activeAgents: number;
  completedInPeriod: number;
  totalTasks: number;
  failedTasks: number;
  inProgress: number;
  inReview: number;
  buckets: Array<{
    time: string;
    created: number;
    completed: number;
  }>;
  agentUsage: Array<{
    agent: string;
    count: number;
  }>;
  agentCosts: Array<{
    agent: string;
    inputTokens: number;
    outputTokens: number;
    cost: number;
  }>;
}

/**
 * Hook to fetch orchestrator statistics with time-range support
 */
export function useOrchestratorStats(timeRange: string) {
  const [stats, setStats] = useState<OrchestratorStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/orchestrator/stats?range=${timeRange}`, {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load stats';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [timeRange]);

  useEffect(() => {
    loadStats();
  }, [timeRange, loadStats]);

  return { stats, loading, error, reload: loadStats };
}
