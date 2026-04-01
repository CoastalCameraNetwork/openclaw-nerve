/**
 * Agent Status hook
 *
 * React hook for fetching agent availability status.
 */

import { useState, useCallback, useEffect } from 'react';

export interface AgentStatus {
  name: string;
  displayName: string;
  status: 'available' | 'busy' | 'unavailable';
  activeTasks: number;
  currentTaskIds: string[];
  queueDepth: number;
  completedToday: number;
  avgCompletionTimeMs: number;
  lastSeenAt: number;
  error?: string;
}

export interface AgentStatusResponse {
  agents: AgentStatus[];
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

export function useAgentStatus(refreshInterval?: number) {
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAgents = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchWithAuth('/api/orchestrator/agents/status');
      setAgents(data.agents || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load agent status');
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      await fetchWithAuth('/api/orchestrator/agents/refresh', { method: 'POST' });
      await loadAgents();
    } catch (err) {
      console.error('Failed to refresh agent status:', err);
    }
  }, [loadAgents]);

  useEffect(() => {
    loadAgents();

    if (refreshInterval) {
      const id = setInterval(loadAgents, refreshInterval);
      return () => clearInterval(id);
    }
  }, [loadAgents, refreshInterval]);

  return { agents, loading, error, loadAgents, refresh };
}
