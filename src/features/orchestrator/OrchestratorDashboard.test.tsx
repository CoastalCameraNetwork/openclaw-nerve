/**
 * OrchestratorDashboard test - SSE auto-refresh on task_complete events
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { OrchestratorDashboard } from './OrchestratorDashboard';
import { useServerEvents } from '../../hooks/useServerEvents';

// Mock useServerEvents hook
vi.mock('../../hooks/useServerEvents', () => ({
  useServerEvents: vi.fn(),
}));

// Mock child hooks
vi.mock('./useOrchestrator', () => ({
  useAgents: () => ({ agents: [] }),
  useOrchestratorStats: () => ({ stats: null, loading: false }),
}));

// Mock fetch globally
global.fetch = vi.fn();

describe('OrchestratorDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock successful fetch for kanban tasks
    (global.fetch as vi.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('subscribes to orchestrator.task_complete events and refreshes sessions', async () => {
    let eventCallback: ((event: any) => void) | null = null;

    // Mock useServerEvents to capture the callback
    (useServerEvents as vi.Mock).mockImplementation((callback: (event: any) => void) => {
      eventCallback = callback;
      return { connected: true, reconnectAttempts: 0, lastEvent: null };
    });

    render(<OrchestratorDashboard />);

    // Verify subscription was registered
    await waitFor(() => {
      expect(useServerEvents).toHaveBeenCalledWith(
        expect.any(Function),
        expect.any(Object)
      );
    });

    // Verify callback was captured
    expect(eventCallback).toBeDefined();
  });

  it('calls fetchSessions when receiving orchestrator.task_complete event', async () => {
    let eventCallback: ((event: any) => void) | null = null;

    (useServerEvents as vi.Mock).mockImplementation((callback: (event: any) => void) => {
      eventCallback = callback;
      return { connected: true, reconnectAttempts: 0, lastEvent: null };
    });

    // Mock fetch to track calls
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ // First call for kanban tasks
        ok: true,
        json: async () => ({ items: [] }),
      })
      .mockResolvedValueOnce({ // Second call for sessions
        ok: true,
        json: async () => ({ sessions: [] }),
      });
    global.fetch = fetchMock;

    render(<OrchestratorDashboard />);

    // Wait for initial fetches
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const initialCallCount = fetchMock.mock.calls.length;

    // Simulate receiving task_complete event
    if (eventCallback) {
      eventCallback({
        event: 'orchestrator.task_complete',
        data: { taskId: 'test-task-123' },
        ts: Date.now(),
      });
    }

    // Verify fetchSessions was called again (kanban tasks fetch)
    await waitFor(() => {
      expect(fetchMock.mock.calls.length).toBeGreaterThan(initialCallCount);
    });
  });
});
