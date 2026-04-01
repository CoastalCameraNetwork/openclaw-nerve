/**
 * Model Status hook
 *
 * React hook for fetching model routing status.
 */

import { useState, useCallback, useEffect } from 'react';

export interface ModelStatus {
  model: string;
  available: boolean;
  queueDepth: number;
  costPerToken: number;
  avgLatencyMs: number;
  lastUpdated: number;
}

export interface RoutingDecision {
  selectedModel: string;
  reason: 'cost' | 'availability' | 'complexity' | 'manual';
  alternatives: Array<{ model: string; cost: number; available: boolean }>;
}

export interface RoutingRequest {
  description: string;
  complexity?: 'low' | 'medium' | 'high';
  manualModel?: string;
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

export function useModelStatus(refreshInterval?: number) {
  const [models, setModels] = useState<ModelStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadModels = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchWithAuth('/api/orchestrator/models/status');
      setModels(data.models || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load model status');
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      await fetchWithAuth('/api/orchestrator/models/refresh', { method: 'POST' });
      await loadModels();
    } catch (err) {
      console.error('Failed to refresh model status:', err);
    }
  }, [loadModels]);

  const getRouting = useCallback(async (request: RoutingRequest): Promise<RoutingDecision> => {
    const data = await fetchWithAuth('/api/orchestrator/models/routing', {
      method: 'POST',
      body: JSON.stringify(request),
    });
    return data.decision;
  }, []);

  useEffect(() => {
    loadModels();

    if (refreshInterval) {
      const id = setInterval(loadModels, refreshInterval);
      return () => clearInterval(id);
    }
  }, [loadModels, refreshInterval]);

  return { models, loading, error, loadModels, refresh, getRouting };
}
