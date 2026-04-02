/**
 * Agent Signals Hook
 *
 * Subscribe to agent signal SSE events and maintain
 * real-time signal state per task.
 */

import { useState, useCallback, useRef } from 'react';
import { useServerEvents, type ServerEvent } from '../../hooks/useServerEvents';

export interface SignalCheckpoint {
  timestamp: string;
  agent: string;
  signal: string;
  phase?: string;
  detail?: string;
  data?: Record<string, unknown>;
}

export interface BlockedTask {
  taskId: string;
  agent: string;
  reason: string;
  suggestion?: string;
  requiresHumanInput?: boolean;
  blockedAt: number;
}

export function useAgentSignals(taskId?: string) {
  const [signals, setSignals] = useState<SignalCheckpoint[]>([]);
  const [blockedTasks, setBlockedTasks] = useState<Map<string, BlockedTask>>(new Map());
  const [currentPhases, setCurrentPhases] = useState<Map<string, string>>(new Map());

  const taskIdRef = useRef(taskId);
  taskIdRef.current = taskId;

  const handleSignal = useCallback((data: { taskId: string; checkpoint: SignalCheckpoint }) => {
    if (taskIdRef.current && data.taskId !== taskIdRef.current) return;

    setSignals(prev => [...prev.slice(-49), data.checkpoint]); // Keep last 50

    // Update phase tracking
    if (data.checkpoint.phase) {
      setCurrentPhases(prev => new Map(prev).set(data.checkpoint.agent, data.checkpoint.phase!));
    }
  }, []);

  const handleBlocked = useCallback((data: { taskId: string } & BlockedTask) => {
    setBlockedTasks(prev => new Map(prev).set(data.taskId, {
      ...data,
      blockedAt: Date.now(),
    }));
  }, []);

  useServerEvents((event: ServerEvent) => {
    if (event.event === 'agent.signal') {
      handleSignal(event.data as { taskId: string; checkpoint: SignalCheckpoint });
    }
    if (event.event === 'task.blocked') {
      handleBlocked(event.data as { taskId: string } & BlockedTask);
    }
  });

  const clearBlocked = useCallback((taskId: string) => {
    setBlockedTasks(prev => {
      const next = new Map(prev);
      next.delete(taskId);
      return next;
    });
  }, []);

  return {
    signals,
    blockedTasks: taskId ? blockedTasks.get(taskId) : null,
    allBlockedTasks: blockedTasks,
    currentPhases,
    clearBlocked,
  };
}
