/**
 * Timeline hook
 *
 * Fetches task timeline data for visualization.
 */

import { useState, useCallback } from 'react';

export interface TimelineData {
  dates: string[];
  created: number[];
  completed: number[];
  cumulative: {
    created: number[];
    completed: number[];
  };
}

export function useTimeline() {
  const [data, setData] = useState<TimelineData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTimeline = useCallback(async (days = 30) => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/kanban/timeline?days=${days}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const timeline = await response.json();
      setData(timeline);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load timeline data');
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    data,
    loading,
    error,
    loadTimeline,
  };
}
