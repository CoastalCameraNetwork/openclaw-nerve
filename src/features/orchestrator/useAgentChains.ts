/**
 * Agent Chains Hook
 *
 * Manage agent chain selection and execution.
 */

import { useState, useCallback } from 'react';

export interface AgentChain {
  id: string;
  name: string;
  description: string;
  steps: Array<{
    agent: string;
    prompt?: string;
    thinking?: 'off' | 'low' | 'medium' | 'high';
    timeoutMs?: number;
  }>;
  gate_mode: 'audit-only' | 'gate-on-write' | 'gate-on-deploy';
}

export interface UseAgentChainsResult {
  chains: AgentChain[];
  loading: boolean;
  error: string | null;
  startChain: (taskId: string, chainId: string) => Promise<void>;
  loadChains: () => Promise<void>;
}

export function useAgentChains(): UseAgentChainsResult {
  const [chains, setChains] = useState<AgentChain[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadChains = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/orchestrator/chains', {
        credentials: 'include',
      });

      if (res.ok) {
        const data = await res.json();
        setChains(data.chains || []);
      } else {
        throw new Error('Failed to load chains');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load chains');
    } finally {
      setLoading(false);
    }
  }, []);

  const startChain = useCallback(async (taskId: string, chainId: string) => {
    const res = await fetch(`/api/orchestrator/tasks/${taskId}/start-chain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ chainId }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to start chain');
    }
  }, []);

  return {
    chains,
    loading,
    error,
    startChain,
    loadChains,
  };
}
