/**
 * Plan Management Hook
 *
 * React hook for managing task plans via /api/plans/* endpoints.
 * Supports draft, in-review, approved, and rejected plan states.
 */

import { useState, useCallback } from 'react';

export type PlanStatus = 'draft' | 'in-review' | 'approved' | 'rejected';

export interface ReviewerQuestion {
  question: string;
  answer?: string;
  resolved: boolean;
}

export interface TaskPlan {
  status: PlanStatus;
  content?: string;
  reviewerQuestions?: ReviewerQuestion[];
  submittedAt?: number;
  approvedAt?: number;
  rejectedAt?: number;
  rejectionReason?: string;
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

export function useTaskPlan(taskId: string | null) {
  const [plan, setPlan] = useState<TaskPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPlan = useCallback(async () => {
    if (!taskId) {
      setPlan(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await fetchWithAuth(`/api/plans/${taskId}`);
      setPlan(data.plan);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load plan');
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  const updatePlan = useCallback(async (content: string): Promise<void> => {
    if (!taskId) throw new Error('No task ID');

    await fetchWithAuth(`/api/plans/${taskId}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    });

    await loadPlan();
  }, [taskId, loadPlan]);

  const submitPlan = useCallback(async (): Promise<void> => {
    if (!taskId) throw new Error('No task ID');

    await fetchWithAuth(`/api/plans/${taskId}/submit`, {
      method: 'POST',
    });

    await loadPlan();
  }, [taskId, loadPlan]);

  const approvePlan = useCallback(async (): Promise<void> => {
    if (!taskId) throw new Error('No task ID');

    await fetchWithAuth(`/api/plans/${taskId}/approve`, {
      method: 'POST',
    });

    await loadPlan();
  }, [taskId, loadPlan]);

  const rejectPlan = useCallback(async (reason: string, questions?: string[]): Promise<void> => {
    if (!taskId) throw new Error('No task ID');

    await fetchWithAuth(`/api/plans/${taskId}/reject`, {
      method: 'POST',
      body: JSON.stringify({
        reason,
        questions: questions?.map(q => ({ question: q })),
      }),
    });

    await loadPlan();
  }, [taskId, loadPlan]);

  const deletePlan = useCallback(async (): Promise<void> => {
    if (!taskId) throw new Error('No task ID');

    await fetchWithAuth(`/api/plans/${taskId}`, {
      method: 'DELETE',
    });

    await loadPlan();
  }, [taskId, loadPlan]);

  const answerQuestion = useCallback(async (questionIndex: number, answer: string): Promise<void> => {
    // Track locally for now - backend will need new endpoint for standalone answer submission
    setPlan((prev) => {
      if (!prev) return null;
      const updatedQuestions = [...(prev.reviewerQuestions || [])];
      if (updatedQuestions[questionIndex]) {
        updatedQuestions[questionIndex] = {
          ...updatedQuestions[questionIndex],
          answer,
          resolved: true,
        };
      }
      return { ...prev, reviewerQuestions: updatedQuestions };
    });
  }, []);

  return {
    plan,
    loading,
    error,
    loadPlan,
    updatePlan,
    submitPlan,
    approvePlan,
    rejectPlan,
    deletePlan,
    answerQuestion,
  };
}
