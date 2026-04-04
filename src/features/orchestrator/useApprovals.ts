/**
 * useApprovals Hook
 *
 * Manage security approvals for dangerous commands.
 */

import { useState, useCallback, useEffect } from 'react';
import type { PendingApproval } from '../orchestrator/ApprovalDialog';

export function useApprovals() {
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchApprovals = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/orchestrator/approvals');
      if (!res.ok) throw new Error('Failed to fetch approvals');
      const data = await res.json();
      setApprovals(data.approvals || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch approvals');
    } finally {
      setLoading(false);
    }
  }, []);

  const approve = useCallback(async (id: string, modifiedCommand?: string) => {
    try {
      const res = await fetch(`/api/orchestrator/approvals/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modifiedCommand }),
      });
      if (!res.ok) throw new Error('Failed to approve');
      setApprovals(prev => prev.filter(a => a.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve');
      throw err;
    }
  }, []);

  const deny = useCallback(async (id: string, reason: string) => {
    try {
      const res = await fetch(`/api/orchestrator/approvals/${id}/deny`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) throw new Error('Failed to deny');
      setApprovals(prev => prev.filter(a => a.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to deny');
      throw err;
    }
  }, []);

  // Poll for new approvals every 5 seconds
  useEffect(() => {
    fetchApprovals();
    const interval = setInterval(fetchApprovals, 5000);
    return () => clearInterval(interval);
  }, [fetchApprovals]);

  return {
    approvals,
    loading,
    error,
    fetchApprovals,
    approve,
    deny,
  };
}
