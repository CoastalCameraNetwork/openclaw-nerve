# Dev Squad Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adapt 7 features from The Dev Squad into Nerve: Plan-First Workflow, Multi-Agent Chains, Structured Agent Signals, Supervisor Dashboard, Stall Detection, Security Approval Gates, and Pixel Art Agent Visualization.

**Architecture:** Features built as layered enhancements to existing orchestrator/kanban infrastructure. Core services extended with new endpoints, UI components added to orchestrator tab, SSE events broadcast for real-time updates.

**Tech Stack:** React 19, TypeScript, Hono 4, SSE events, existing kanban store, gateway-client for agent execution.

---

## Feature Overview

| Feature | Priority | Effort | Dependencies |
|---------|----------|--------|--------------|
| 1. Structured Agent Signals | P0 | Low | None |
| 2. Supervisor Dashboard | P0 | Medium | Feature 1 |
| 3. Turn-Based Stall Detection | P1 | Medium | Feature 1 |
| 4. Plan-First Workflow | P0 | High | None |
| 5. Multi-Agent Chains | P1 | High | Feature 1, 4 |
| 6. Security Approval Gates | P1 | Medium | Feature 3 |
| 7. Pixel Art Visualization | P2 | High | Feature 2 |

---

### Task 1: Structured Agent Signals - Types and Interfaces

**Files:**
- Create: `server/services/agent-signals.ts`
- Create: `server/services/agent-signals.test.ts`
- Test: `server/services/agent-signals.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// server/services/agent-signals.test.ts
import { describe, it, expect } from 'vitest';
import { parseAgentSignal, AgentSignalType } from './agent-signals.js';

describe('parseAgentSignal', () => {
  it('extracts status signal from agent output', () => {
    const output = '{"signal":"status","phase":"researching","detail":"Searching documentation"}';
    const result = parseAgentSignal(output);
    expect(result).toEqual({
      type: 'status',
      phase: 'researching',
      detail: 'Searching documentation',
    });
  });

  it('returns null for non-signal output', () => {
    const output = 'I am writing the implementation now';
    const result = parseAgentSignal(output);
    expect(result).toBeNull();
  });

  it('extracts blocker signal', () => {
    const output = '{"signal":"blocker","reason":"Need API key","suggestion":"Add to .env"}';
    const result = parseAgentSignal(output);
    expect(result?.type).toBe('blocker');
    expect(result?.reason).toBe('Need API key');
  });

  it('extracts handoff signal', () => {
    const output = '{"signal":"handoff","nextAgent":"tester","summary":"Code complete","files":["src/index.ts"]}';
    const result = parseAgentSignal(output);
    expect(result?.type).toBe('handoff');
    expect(result?.nextAgent).toBe('tester');
  });

  it('extracts quality-gate signal', () => {
    const output = '{"signal":"quality-gate","passed":false,"issues":["Missing validation"]}';
    const result = parseAgentSignal(output);
    expect(result?.type).toBe('quality-gate');
    expect(result?.passed).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --run server/services/agent-signals.test.ts
```
Expected: FAIL with "Cannot find module './agent-signals.js'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// server/services/agent-signals.ts
/**
 * Structured Agent Signals
 *
 * Parse JSON signals from agent output for:
 * - Status updates (phase tracking)
 * - Blocker detection (needs human input)
 * - Handoffs (sequential agent transitions)
 * - Quality gates (pass/fail with issues)
 */

export interface BaseSignal {
  signal: string;
  taskId?: string;
  timestamp?: number;
}

export interface StatusSignal extends BaseSignal {
  signal: 'status';
  phase: 'researching' | 'planning' | 'coding' | 'testing' | 'reviewing';
  detail: string;
}

export interface BlockerSignal extends BaseSignal {
  signal: 'blocker';
  reason: string;
  suggestion?: string;
  requiresHumanInput?: boolean;
}

export interface HandoffSignal extends BaseSignal {
  signal: 'handoff';
  nextAgent: string;
  summary: string;
  files?: string[];
  recommendations?: string[];
}

export interface QualityGateSignal extends BaseSignal {
  signal: 'quality-gate';
  passed: boolean;
  issues?: string[];
  criticalIssues?: string[];
}

export interface CompletionSignal extends BaseSignal {
  signal: 'complete';
  summary: string;
  filesChanged: string[];
}

export type AgentSignal =
  | StatusSignal
  | BlockerSignal
  | HandoffSignal
  | QualityGateSignal
  | CompletionSignal;

export const AgentSignalType = {
  STATUS: 'status',
  BLOCKER: 'blocker',
  HANDOFF: 'handoff',
  QUALITY_GATE: 'quality-gate',
  COMPLETE: 'complete',
} as const;

/**
 * Parse agent output for structured signals.
 * Looks for JSON objects with "signal" field.
 */
export function parseAgentSignal(output: string): AgentSignal | null {
  try {
    // Try to find JSON object in output
    const jsonMatch = output.match(/\{[^}]*"signal"[^}]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.signal || typeof parsed.signal !== 'string') return null;

    // Validate required fields per signal type
    switch (parsed.signal) {
      case 'status':
        if (!parsed.phase) return null;
        return parsed as StatusSignal;
      case 'blocker':
        if (!parsed.reason) return null;
        return parsed as BlockerSignal;
      case 'handoff':
        if (!parsed.nextAgent) return null;
        return parsed as HandoffSignal;
      case 'quality-gate':
        if (typeof parsed.passed !== 'boolean') return null;
        return parsed as QualityGateSignal;
      case 'complete':
        if (!parsed.summary) return null;
        return parsed as CompletionSignal;
      default:
        return null;
    }
  } catch {
    return null;
  }
}

/**
 * Extract all signals from agent output (supports multiple signals).
 */
export function extractAllSignals(output: string): AgentSignal[] {
  const signals: AgentSignal[] = [];
  const jsonObjects = output.match(/\{[^}]*"signal"[^}]*\}/g) || [];

  for (const jsonStr of jsonObjects) {
    try {
      const parsed = JSON.parse(jsonStr);
      const signal = parseAgentSignal(JSON.stringify(parsed));
      if (signal) signals.push(signal);
    } catch {
      // Skip invalid JSON
    }
  }

  return signals;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- --run server/services/agent-signals.test.ts
```
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add server/services/agent-signals.ts server/services/agent-signals.test.ts
git commit -m "feat(signals): Add structured agent signal parsing

- Parse JSON signals for status, blocker, handoff, quality-gate, complete
- extractAllSignals() for multiple signals in output
- Type-safe signal interfaces
"
```

---

### Task 2: Structured Agent Signals - SSE Broadcast Integration

**Files:**
- Modify: `server/services/orchestrator-service.ts:40-60`
- Modify: `server/routes/events.ts`
- Test: `server/services/orchestrator-service.test.ts`

- [ ] **Step 1: Add signal broadcast to agent execution**

```typescript
// server/services/orchestrator-service.ts - Add after line ~25 (imports)
import { parseAgentSignal, extractAllSignals } from './agent-signals.js';
import { broadcast } from '../routes/events.js';

// Add new interface after AgentHandoff interface (~line 62)
export interface SignalCheckpoint {
  timestamp: string;
  agent: string;
  signal: string;
  phase?: string;
  detail?: string;
  data?: Record<string, unknown>;
}

// In executeTask function, after agent invocation (~line 200+), add:
// Parse and broadcast signals from agent output
const signals = extractAllSignals(result.output || '');
for (const signal of signals) {
  const checkpoint: SignalCheckpoint = {
    timestamp: new Date().toISOString(),
    agent: agentName,
    signal: signal.signal,
    phase: 'phase' in signal ? signal.phase : undefined,
    detail: 'detail' in signal ? signal.detail : undefined,
    data: signal as Record<string, unknown>,
  };

  // Broadcast to SSE subscribers
  broadcast('agent.signal', {
    taskId,
    checkpoint,
  });

  // Handle blocker signals specially
  if (signal.signal === 'blocker') {
    broadcast('task.blocked', {
      taskId,
      agent: agentName,
      reason: signal.reason,
      suggestion: signal.suggestion,
      requiresHumanInput: signal.requiresHumanInput,
    });
  }
}
```

- [ ] **Step 2: Add agent.signal event type to SSE**

```typescript
// server/routes/events.ts - Update comment ~line 7
/**
 * Event types:
 * - memory.changed  — Memory file was modified
 * - tokens.updated  — Token usage changed
 * - status.changed  — Gateway status changed
 * - ping            — Keep-alive (every 30s)
 * - agent.signal    — Structured agent signal (status, blocker, handoff)
 * - task.blocked    — Task blocked, needs input
 */
```

- [ ] **Step 3: Commit**

```bash
git add server/services/orchestrator-service.ts server/routes/events.ts
git commit -m "feat(signals): Broadcast agent signals via SSE

- Parse signals during agent execution
- Broadcast agent.signal for all signals
- Broadcast task.blocked for blocker signals
- Add SignalCheckpoint type
"
```

---

### Task 3: Structured Agent Signals - Frontend Hook

**Files:**
- Create: `src/features/orchestrator/useAgentSignals.ts`
- Test: N/A (React hook - test via component)

- [ ] **Step 1: Write the hook**

```typescript
// src/features/orchestrator/useAgentSignals.ts
/**
 * Agent Signals Hook
 *
 * Subscribe to agent signal SSE events and maintain
 * real-time signal state per task.
 */

import { useState, useCallback, useEffect } from 'react';
import { useServerEvents } from '../../hooks/useServerEvents';

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

  const handleSignal = useCallback((data: { taskId: string; checkpoint: SignalCheckpoint }) => {
    if (taskId && data.taskId !== taskId) return;

    setSignals(prev => [...prev.slice(-49), data.checkpoint]); // Keep last 50

    // Update phase tracking
    if (data.checkpoint.phase) {
      setCurrentPhases(prev => new Map(prev).set(data.checkpoint.agent, data.checkpoint.phase!));
    }
  }, [taskId]);

  const handleBlocked = useCallback((data: { taskId: string } & BlockedTask) => {
    setBlockedTasks(prev => new Map(prev).set(data.taskId, {
      ...data,
      blockedAt: Date.now(),
    }));
  }, []);

  const { subscribe } = useServerEvents();

  useEffect(() => {
    const unsubscribe = subscribe((event) => {
      if (event.type === 'agent.signal') {
        handleSignal(event.data as { taskId: string; checkpoint: SignalCheckpoint });
      }
      if (event.type === 'task.blocked') {
        handleBlocked(event.data as { taskId: string } & BlockedTask);
      }
    });
    return unsubscribe;
  }, [subscribe, handleSignal, handleBlocked]);

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
```

- [ ] **Step 2: Commit**

```bash
git add src/features/orchestrator/useAgentSignals.ts
git commit -m "feat(signals): Add useAgentSignals hook

- Subscribe to agent.signal and task.blocked SSE events
- Track signal history per task (last 50)
- Track current phase per agent
- Track blocked tasks
"
```

---

### Task 4: Supervisor Dashboard - Enhanced Status Panel

**Files:**
- Modify: `src/features/orchestrator/OrchestratorDashboard.tsx`
- Create: `src/features/orchestrator/SupervisorPanel.tsx`

- [ ] **Step 1: Create SupervisorPanel component**

```typescript
// src/features/orchestrator/SupervisorPanel.tsx
/**
 * SupervisorPanel - Manager-style summary of team activity
 * Shows what the team is doing, what's blocked, and recommended actions
 */

import { memo, useMemo } from 'react';
import { AlertTriangle, CheckCircle, Clock, TrendingUp } from 'lucide-react';
import { useAgentSignals, type BlockedTask } from './useAgentSignals';
import { useOrchestrator } from './useOrchestrator';

interface SupervisorPanelProps {
  taskId?: string;
}

export const SupervisorPanel = memo(function SupervisorPanel({ taskId }: SupervisorPanelProps) {
  const { blockedTasks, allBlockedTasks, currentPhases, signals } = useAgentSignals(taskId);
  const { tasks, loading } = useOrchestrator();

  const activeTasks = useMemo(() =>
    tasks.filter(t => t.run?.status === 'running'),
    [tasks]
  );

  const blockedCount = allBlockedTasks.size;

  const lastSignal = signals.length > 0 ? signals[signals.length - 1] : null;

  const getRecommendedAction = (): string | null => {
    if (blockedTasks) {
      return blockedTasks.requiresHumanInput
        ? `Action needed: ${blockedTasks.reason}`
        : `Agent ${blockedTasks.agent} is blocked: ${blockedTasks.reason}`;
    }
    if (lastSignal?.signal === 'handoff') {
      return `Waiting for ${lastSignal.data?.nextAgent} to start`;
    }
    if (activeTasks.length > 3) {
      return 'Multiple tasks running - consider waiting for completion';
    }
    return null;
  };

  const recommendedAction = getRecommendedAction();

  return (
    <div className="p-4 bg-card rounded-lg border border-border">
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <span className="text-lg">🎯</span>
        Supervisor Update
      </h3>

      {/* Active Tasks Summary */}
      <div className="mb-4">
        <div className="text-xs text-muted-foreground mb-1">Active Tasks</div>
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold">{activeTasks.length}</span>
          <Clock size={14} className="text-muted-foreground" />
        </div>
      </div>

      {/* Blocked Tasks Alert */}
      {blockedCount > 0 && (
        <div className="mb-4 p-3 bg-destructive/10 border border-destructive/30 rounded-md">
          <div className="flex items-center gap-2 text-destructive text-sm font-medium">
            <AlertTriangle size={14} />
            {blockedCount} Blocked Task{blockedCount !== 1 ? 's' : ''}
          </div>
          {blockedTasks && (
            <div className="mt-2 text-xs text-destructive">
              <strong>{blockedTasks.agent}:</strong> {blockedTasks.reason}
              {blockedTasks.suggestion && (
                <div className="mt-1 text-muted-foreground">
                  💡 {blockedTasks.suggestion}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Current Activity */}
      <div className="mb-4">
        <div className="text-xs text-muted-foreground mb-1">Current Activity</div>
        {currentPhases.size > 0 ? (
          <ul className="space-y-1">
            {Array.from(currentPhases.entries()).map(([agent, phase]) => (
              <li key={agent} className="text-xs flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                <span className="font-medium">{agent}</span>
                <span className="text-muted-foreground">→ {phase}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-xs text-muted-foreground">No active agents</div>
        )}
      </div>

      {/* Last Signal */}
      {lastSignal && (
        <div className="mb-4 pt-3 border-t">
          <div className="text-xs text-muted-foreground mb-1">Latest Signal</div>
          <div className="text-xs">
            <span className="font-mono bg-muted px-1.5 py-0.5 rounded">
              {lastSignal.signal}
            </span>
            {lastSignal.detail && (
              <span className="ml-2 text-muted-foreground">{lastSignal.detail}</span>
            )}
          </div>
        </div>
      )}

      {/* Recommended Action */}
      {recommendedAction && (
        <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-md">
          <div className="flex items-start gap-2">
            <TrendingUp size={14} className="text-blue-400 mt-0.5" />
            <div className="text-xs text-blue-200">
              <span className="font-medium">Recommended:</span> {recommendedAction}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
```

- [ ] **Step 2: Integrate into OrchestratorDashboard**

```typescript
// src/features/orchestrator/OrchestratorDashboard.tsx
// Add import after line 21
import { SupervisorPanel } from './SupervisorPanel';

// Add to component render (~line 200+), before existing panels:
<div className="grid gap-4 mb-6">
  <SupervisorPanel taskId={selectedTaskId} />
</div>
```

- [ ] **Step 3: Commit**

```bash
git add src/features/orchestrator/SupervisorPanel.tsx src/features/orchestrator/OrchestratorDashboard.tsx
git commit -m "feat(dashboard): Add Supervisor Panel

- Manager-style summary of team activity
- Shows active tasks count, blocked alerts, current phases
- Recommended actions based on signals
- Integrates into OrchestratorDashboard
"
```

---

### Task 5: Turn-Based Stall Detection - Service Layer

**Files:**
- Create: `server/services/stall-detection.ts`
- Create: `server/services/stall-detection.test.ts`
- Modify: `server/services/session-watcher.ts`

- [ ] **Step 1: Write failing test**

```typescript
// server/services/stall-detection.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkForStalledTasks, STALL_THRESHOLD_MS } from './stall-detection.js';

const mockStore = {
  getTask: vi.fn(),
  updateTask: vi.fn(),
  listTasks: vi.fn(),
};

vi.mock('../lib/kanban-store.js', () => ({
  getKanbanStore: () => mockStore,
}));

describe('stall-detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('detects stalled running task', async () => {
    const stalledTime = Date.now() - (STALL_THRESHOLD_MS + 10000);
    mockStore.listTasks.mockResolvedValue({
      items: [{
        id: 'task-1',
        status: 'in-progress',
        run: {
          status: 'running',
          startedAt: stalledTime,
          sessionKey: 'kb-task-1-123',
        },
        updatedAt: stalledTime,
        version: 1,
      }],
    });

    mockStore.getTask.mockResolvedValue({
      id: 'task-1',
      status: 'in-progress',
      run: { status: 'running', startedAt: stalledTime, sessionKey: 'kb-task-1-123' },
      updatedAt: stalledTime,
      version: 1,
    });

    const result = await checkForStalledTasks();
    expect(result.stalledTasks.length).toBeGreaterThan(0);
    expect(result.stalledTasks[0].taskId).toBe('task-1');
  });

  it('does not flag recent activity as stalled', async () => {
    const recentTime = Date.now() - 60000; // 1 minute ago
    mockStore.listTasks.mockResolvedValue({
      items: [{
        id: 'task-2',
        status: 'in-progress',
        run: { status: 'running', startedAt: recentTime, sessionKey: 'kb-task-2-456' },
        updatedAt: recentTime,
        version: 1,
      }],
    });

    const result = await checkForStalledTasks();
    expect(result.stalledTasks.length).toBe(0);
  });
});
```

- [ ] **Step 2: Implement stall detection service**

```typescript
// server/services/stall-detection.ts
/**
 * Stall Detection Service
 *
 * Detects tasks that have been running without activity for too long.
 * Used for auto-recovery and user notifications.
 */

import { getKanbanStore } from '../lib/kanban-store.js';
import { broadcast } from '../routes/events.js';

export const STALL_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
export const MAX_AUTO_RESUMES = 2;

export interface StalledTask {
  taskId: string;
  title: string;
  agent?: string;
  runningSince: number;
  lastActivity: number;
  stallDuration: number;
  sessionKey: string;
}

export interface StallCheckResult {
  stalledTasks: StalledTask[];
  checkedAt: string;
}

export async function checkForStalledTasks(): Promise<StallCheckResult> {
  const store = getKanbanStore();
  const now = Date.now();
  const stalledTasks: StalledTask[] = [];

  try {
    const allTasks = await store.listTasks({ limit: 1000 });

    for (const task of allTasks.items) {
      // Only check running tasks
      if (task.run?.status !== 'running') continue;

      const lastActivity = task.updatedAt || task.run.startedAt;
      const stallDuration = now - lastActivity;

      if (stallDuration > STALL_THRESHOLD_MS) {
        const metadata = task.metadata as Record<string, unknown> || {};
        const autoResumeCount = (metadata.stallResumes as number) || 0;

        stalledTasks.push({
          taskId: task.id,
          title: task.title,
          agent: task.assignee?.replace('agent:', '') || 'unknown',
          runningSince: task.run.startedAt,
          lastActivity,
          stallDuration,
          sessionKey: task.run.sessionKey,
        });

        // Auto-resume if under limit
        if (autoResumeCount < MAX_AUTO_RESUMES) {
          await attemptAutoResume(task.id, task.run.sessionKey, autoResumeCount);
        } else {
          // Flag for human intervention
          broadcast('task.stalled', {
            taskId: task.id,
            title: task.title,
            stallDuration,
            autoResumesExhausted: true,
          });
        }
      }
    }

    return {
      stalledTasks,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[stall-detection] Error checking for stalled tasks:', error);
    return { stalledTasks: [], checkedAt: new Date().toISOString() };
  }
}

async function attemptAutoResume(
  taskId: string,
  sessionKey: string,
  autoResumeCount: number
): Promise<void> {
  try {
    // Invoke gateway to resume stalled session
    const { invokeGatewayTool } = await import('../lib/gateway-client.js');

    await invokeGatewayTool('sessions_resume', {
      sessionKey,
      prompt: 'Continue from where you left off. If you encountered an error, explain it and propose next steps.',
    }, 30000);

    // Update metadata
    const store = getKanbanStore();
    const task = await store.getTask(taskId);
    if (task) {
      const metadata = {
        ...(task.metadata as Record<string, unknown> || {}),
        stallResumes: autoResumeCount + 1,
        lastStallResumeAt: Date.now(),
      };
      await store.updateTask(taskId, task.version, { metadata } as never, 'system' as never);
    }

    broadcast('task.stall-resumed', {
      taskId,
      sessionKey,
      attemptNumber: autoResumeCount + 1,
    });
  } catch (error) {
    console.error(`[stall-detection] Auto-resume failed for ${taskId}:`, error);
    broadcast('task.stall-resume-failed', {
      taskId,
      sessionKey,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
```

- [ ] **Step 3: Integrate with session-watcher polling**

```typescript
// server/services/session-watcher.ts - Add import after line 12
import { checkForStalledTasks } from './stall-detection.js';

// Modify pollSessions function, add at end of function (~line 110):
// Check for stalled tasks periodically (every 5th poll = ~25 seconds)
if (pollCount % 5 === 0) {
  const stallResult = await checkForStalledTasks();
  if (stallResult.stalledTasks.length > 0) {
    console.log(`[session-watcher] Detected ${stallResult.stalledTasks.length} stalled tasks`);
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add server/services/stall-detection.ts server/services/stall-detection.test.ts server/services/session-watcher.ts
git commit -m "feat(stall): Add stall detection and auto-resume

- checkForStalledTasks() detects inactive running tasks
- Auto-resume up to 2 times per task
- Broadcast task.stalled and task.stall-resumed events
- Integrate with session-watcher polling
"
```

---

### Task 6: Turn-Based Stall Detection - Frontend UI

**Files:**
- Create: `src/features/orchestrator/StalledTaskBanner.tsx`
- Modify: `src/features/orchestrator/OrchestratorDashboard.tsx`

- [ ] **Step 1: Create StalledTaskBanner component**

```typescript
// src/features/orchestrator/StalledTaskBanner.tsx
/**
 * StalledTaskBanner - Shows when a task is detected as stalled
 */

import { memo, useState, useCallback } from 'react';
import { AlertTriangle, RefreshCw, X } from 'lucide-react';

export interface StalledTaskData {
  taskId: string;
  title: string;
  stallDuration: number;
  autoResumesExhausted: boolean;
}

interface StalledTaskBannerProps {
  task: StalledTaskData;
  onResume: () => void;
  onDismiss: () => void;
}

export const StalledTaskBanner = memo(function StalledTaskBanner({
  task,
  onResume,
  onDismiss,
}: StalledTaskBannerProps) {
  const [loading, setLoading] = useState(false);

  const handleResume = useCallback(async () => {
    setLoading(true);
    try {
      await onResume();
    } finally {
      setLoading(false);
    }
  }, [onResume]);

  const formatDuration = (ms: number): string => {
    const minutes = Math.floor(ms / 60000);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  };

  return (
    <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg mb-4">
      <div className="flex items-start gap-3">
        <AlertTriangle size={20} className="text-amber-400 mt-0.5" />
        <div className="flex-1">
          <h4 className="text-sm font-semibold text-amber-200 mb-1">
            Task Stalled: {task.title}
          </h4>
          <p className="text-xs text-amber-100/70 mb-3">
            No activity for {formatDuration(task.stallDuration)}
            {task.autoResumesExhausted && (
              <span className="block mt-1 text-amber-300">
                Auto-resume attempts exhausted - manual intervention needed
              </span>
            )}
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleResume}
              disabled={loading}
              className="text-xs px-3 py-1.5 rounded-md bg-amber-600 hover:bg-amber-500 text-white font-medium transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              {loading ? 'Resuming...' : 'Resume Task'}
            </button>
            <button
              onClick={onDismiss}
              className="text-xs px-3 py-1.5 rounded-md border border-amber-500/30 hover:bg-amber-500/20 transition-colors"
            >
              <X size={12} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});
```

- [ ] **Step 2: Integrate into dashboard with SSE listener**

```typescript
// src/features/orchestrator/OrchestratorDashboard.tsx
// Add import
import { StalledTaskBanner, type StalledTaskData } from './StalledTaskBanner';

// Add state in component (~line 100)
const [stalledTasks, setStalledTasks] = useState<Map<string, StalledTaskData>>(new Map());

// Add SSE handler (~line 150, inside useEffect with subscribe)
if (event.type === 'task.stalled') {
  const data = event.data as StalledTaskData;
  setStalledTasks(prev => new Map(prev).set(data.taskId, data));
}
if (event.type === 'task.stall-resumed') {
  const data = event.data as { taskId: string };
  setStalledTasks(prev => {
    const next = new Map(prev);
    next.delete(data.taskId);
    return next;
  });
}

// Add resume handler
const handleResumeTask = useCallback(async (taskId: string) => {
  await fetch(`/api/orchestrator/tasks/${taskId}/resume`, {
    method: 'POST',
    credentials: 'include',
  });
}, []);

// Render in component (~line 250)
{Array.from(stalledTasks.values()).map(task => (
  <StalledTaskBanner
    key={task.taskId}
    task={task}
    onResume={() => handleResumeTask(task.taskId)}
    onDismiss={() => setStalledTasks(prev => {
      const next = new Map(prev);
      next.delete(task.taskId);
      return next;
    })}
  />
))}
```

- [ ] **Step 3: Add resume endpoint**

```typescript
// server/routes/orchestrator.ts - Add new endpoint
app.post('/api/orchestrator/tasks/:id/resume', rateLimitGeneral, async (c) => {
  const id = c.req.param('id');
  const store = getKanbanStore();

  try {
    const task = await store.getTask(id);
    if (!task || !task.run?.sessionKey) {
      return c.json({ error: 'Task not found or not running', code: ErrorCode.TASK_NOT_FOUND }, 404);
    }

    const { invokeGatewayTool } = await import('../lib/gateway-client.js');
    await invokeGatewayTool('sessions_resume', {
      sessionKey: task.run.sessionKey,
      prompt: 'Continue from where you left off.',
    }, 30000);

    return c.json({ success: true, taskId: id });
  } catch (error) {
    console.error('Resume task failed:', error);
    return c.json({ error: 'Failed to resume task', code: ErrorCode.GATEWAY_ERROR }, 500);
  }
});
```

- [ ] **Step 4: Commit**

```bash
git add src/features/orchestrator/StalledTaskBanner.tsx src/features/orchestrator/OrchestratorDashboard.tsx server/routes/orchestrator.ts
git commit -m "feat(stall): Add stalled task UI and resume endpoint

- StalledTaskBanner component with resume/dismiss actions
- SSE listener for task.stalled events
- POST /api/orchestrator/tasks/:id/resume endpoint
"
```

---

### Task 7: Plan-First Workflow - Task Status and Types

**Files:**
- Modify: `server/lib/kanban-store.ts`
- Modify: `src/features/kanban/types.ts`

- [ ] **Step 1: Add planning status**

```typescript
// server/lib/kanban-store.ts - Update BUILT_IN_STATUSES (~line 63)
export const BUILT_IN_STATUSES = ['backlog', 'planning', 'todo', 'in-progress', 'review', 'done', 'cancelled'] as const;
```

- [ ] **Step 2: Add plan metadata to KanbanTask**

```typescript
// server/lib/kanban-store.ts - Add to KanbanTask interface (~line 137)
  // Plan-First Workflow
  plan?: {
    status: 'draft' | 'in-review' | 'approved' | 'rejected';
    content?: string; // Full plan.md content
    reviewerQuestions?: Array<{
      question: string;
      answer?: string;
      resolved: boolean;
    }>;
    approvedAt?: number;
    rejectedAt?: number;
    rejectionReason?: string;
  };
```

- [ ] **Step 3: Update frontend types**

```typescript
// src/features/kanban/types.ts - Add after TaskStatus type
export interface TaskPlan {
  status: 'draft' | 'in-review' | 'approved' | 'rejected';
  content?: string;
  reviewerQuestions?: Array<{
    question: string;
    answer?: string;
    resolved: boolean;
  }>;
  approvedAt?: number;
  rejectedAt?: number;
  rejectionReason?: string;
}

// Add to KanbanTask interface
export interface KanbanTask {
  // ... existing fields
  plan?: TaskPlan;
}
```

- [ ] **Step 4: Commit**

```bash
git add server/lib/kanban-store.ts src/features/kanban/types.ts
git commit -m "feat(plan): Add planning status and plan metadata

- Add 'planning' status between backlog and todo
- Add TaskPlan interface with draft/review/approve states
- Store plan content and reviewer questions
"
```

---

### Task 8: Plan-First Workflow - Plan Storage API

**Files:**
- Create: `server/routes/plans.ts`
- Modify: `server/app.ts`

- [ ] **Step 1: Write plan routes**

```typescript
// server/routes/plans.ts
/**
 * Plan Management API Routes
 *
 * GET    /api/plans/:taskId          - Get task plan
 * PUT    /api/plans/:taskId          - Create/update plan (draft)
 * POST   /api/plans/:taskId/submit   - Submit plan for review
 * POST   /api/plans/:taskId/approve  - Approve plan (plan reviewer)
 * POST   /api/plans/:taskId/reject   - Reject plan with questions
 * DELETE /api/plans/:taskId          - Delete plan
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { rateLimitGeneral } from '../middleware/rate-limit.js';
import { getKanbanStore } from '../lib/kanban-store.js';

const app = new Hono();

const ErrorCode = {
  TASK_NOT_FOUND: 'TASK_NOT_FOUND',
  PLAN_NOT_FOUND: 'PLAN_NOT_FOUND',
  INVALID_STATE: 'INVALID_STATE',
  VERSION_CONFLICT: 'VERSION_CONFLICT',
} as const;

// GET /api/plans/:taskId
app.get('/api/plans/:taskId', rateLimitGeneral, async (c) => {
  const taskId = c.req.param('taskId');
  const store = getKanbanStore();

  const task = await store.getTask(taskId);
  if (!task) {
    return c.json({ error: 'Task not found', code: ErrorCode.TASK_NOT_FOUND }, 404);
  }

  return c.json({
    taskId,
    plan: task.plan || null,
  });
});

// PUT /api/plans/:taskId - Create/update draft plan
const updatePlanSchema = z.object({
  content: z.string().min(1),
});

app.put('/api/plans/:taskId', rateLimitGeneral, async (c) => {
  const taskId = c.req.param('taskId');
  const store = getKanbanStore();
  const task = await store.getTask(taskId);

  if (!task) {
    return c.json({ error: 'Task not found', code: ErrorCode.TASK_NOT_FOUND }, 404);
  }

  let body: unknown = {};
  try {
    const text = await c.req.text();
    if (text) body = JSON.parse(text);
  } catch {
    return c.json({ error: 'Invalid JSON', code: ErrorCode.INVALID_STATE }, 400);
  }

  const parsed = updatePlanSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid request', details: parsed.error.flatten(), code: ErrorCode.INVALID_STATE }, 400);
  }

  // Can only update draft plans
  if (task.plan?.status === 'approved' || task.plan?.status === 'in-review') {
    return c.json({ error: 'Plan is locked', code: ErrorCode.INVALID_STATE }, 403);
  }

  await store.updateTask(taskId, task.version, {
    plan: {
      ...task.plan,
      status: 'draft' as const,
      content: parsed.data.content,
      updatedAt: Date.now(),
    },
  } as never);

  return c.json({ success: true, taskId, status: 'draft' });
});

// POST /api/plans/:taskId/submit - Submit for review
app.post('/api/plans/:taskId/submit', rateLimitGeneral, async (c) => {
  const taskId = c.req.param('taskId');
  const store = getKanbanStore();
  const task = await store.getTask(taskId);

  if (!task) {
    return c.json({ error: 'Task not found', code: ErrorCode.TASK_NOT_FOUND }, 404);
  }

  if (!task.plan?.content) {
    return c.json({ error: 'No plan content', code: ErrorCode.PLAN_NOT_FOUND }, 400);
  }

  await store.updateTask(taskId, task.version, {
    plan: {
      ...task.plan,
      status: 'in-review' as const,
      submittedAt: Date.now(),
    },
  } as never);

  // Broadcast for reviewer notification
  const { broadcast } = await import('./events.js');
  broadcast('plan.submitted', { taskId, title: task.title });

  return c.json({ success: true, taskId, status: 'in-review' });
});

// POST /api/plans/:taskId/approve - Approve plan
app.post('/api/plans/:taskId/approve', rateLimitGeneral, async (c) => {
  const taskId = c.req.param('taskId');
  const store = getKanbanStore();
  const task = await store.getTask(taskId);

  if (!task) {
    return c.json({ error: 'Task not found', code: ErrorCode.TASK_NOT_FOUND }, 404);
  }

  if (task.plan?.status !== 'in-review') {
    return c.json({ error: 'Plan not in review', code: ErrorCode.INVALID_STATE }, 400);
  }

  await store.updateTask(taskId, task.version, {
    plan: {
      ...task.plan,
      status: 'approved' as const,
      approvedAt: Date.now(),
    },
    // Auto-move task to todo when plan approved
    status: 'todo' as never,
  } as never);

  const { broadcast } = await import('./events.js');
  broadcast('plan.approved', { taskId, title: task.title });

  return c.json({ success: true, taskId, status: 'approved' });
});

// POST /api/plans/:taskId/reject - Reject with questions
const rejectSchema = z.object({
  questions: z.array(z.object({
    question: z.string().min(1),
  })),
});

app.post('/api/plans/:taskId/reject', rateLimitGeneral, async (c) => {
  const taskId = c.req.param('taskId');
  const store = getKanbanStore();
  const task = await store.getTask(taskId);

  if (!task) {
    return c.json({ error: 'Task not found', code: ErrorCode.TASK_NOT_FOUND }, 404);
  }

  let body: unknown = {};
  try {
    const text = await c.req.text();
    if (text) body = JSON.parse(text);
  } catch {
    return c.json({ error: 'Invalid JSON', code: ErrorCode.INVALID_STATE }, 400);
  }

  const parsed = rejectSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid request', code: ErrorCode.INVALID_STATE }, 400);
  }

  await store.updateTask(taskId, task.version, {
    plan: {
      ...task.plan,
      status: 'rejected' as const,
      rejectedAt: Date.now(),
      reviewerQuestions: parsed.data.questions.map(q => ({
        question: q.question,
        resolved: false,
      })),
    },
  } as never);

  const { broadcast } = await import('./events.js');
  broadcast('plan.rejected', { taskId, title: task.title, questionCount: parsed.data.questions.length });

  return c.json({ success: true, taskId, status: 'rejected' });
});

// DELETE /api/plans/:taskId
app.delete('/api/plans/:taskId', rateLimitGeneral, async (c) => {
  const taskId = c.req.param('taskId');
  const store = getKanbanStore();
  const task = await store.getTask(taskId);

  if (!task) {
    return c.json({ error: 'Task not found', code: ErrorCode.TASK_NOT_FOUND }, 404);
  }

  await store.updateTask(taskId, task.version, {
    plan: undefined,
  } as never);

  return c.json({ success: true });
});

export default app;
```

- [ ] **Step 2: Register routes in app.ts**

```typescript
// server/app.ts - Add import after line 54
import plansRoutes from './routes/plans.js';

// Add to routes array (~line 130)
const routes = [
  // ... existing routes
  plansRoutes,
];
```

- [ ] **Step 3: Commit**

```bash
git add server/routes/plans.ts server/app.ts
git commit -m "feat(plan): Add plan management API endpoints

- GET/PUT/POST/DELETE /api/plans/:taskId
- Submit, approve, reject flows
- Lock approved plans
- Broadcast SSE events for state changes
"
```

---

### Task 9: Plan-First Workflow - Plan Editor Component

**Files:**
- Create: `src/features/planning/PlanEditor.tsx`
- Create: `src/features/planning/usePlan.ts`

- [ ] **Step 1: Write usePlan hook**

```typescript
// src/features/planning/usePlan.ts
/**
 * Plan Hook
 *
 * Manage plan CRUD operations and state.
 */

import { useState, useCallback, useEffect } from 'react';
import type { TaskPlan } from '../kanban/types';

export interface UsePlanResult {
  plan: TaskPlan | null;
  loading: boolean;
  error: string | null;
  savePlan: (content: string) => Promise<void>;
  submitForReview: () => Promise<void>;
  approvePlan: () => Promise<void>;
  rejectPlan: (questions: string[]) => Promise<void>;
  deletePlan: () => Promise<void>;
  loadPlan: () => Promise<void>;
}

export function usePlan(taskId: string | null): UsePlanResult {
  const [plan, setPlan] = useState<TaskPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPlan = useCallback(async () => {
    if (!taskId) return;

    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/plans/${taskId}`, {
        credentials: 'include',
      });

      if (res.ok) {
        const data = await res.json();
        setPlan(data.plan);
      } else if (res.status === 404) {
        setPlan(null);
      } else {
        throw new Error('Failed to load plan');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load plan');
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    loadPlan();
  }, [loadPlan]);

  const savePlan = useCallback(async (content: string) => {
    if (!taskId) throw new Error('No task ID');

    const res = await fetch(`/api/plans/${taskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ content }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to save plan');
    }

    await loadPlan();
  }, [taskId, loadPlan]);

  const submitForReview = useCallback(async () => {
    if (!taskId) throw new Error('No task ID');

    const res = await fetch(`/api/plans/${taskId}/submit`, {
      method: 'POST',
      credentials: 'include',
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to submit plan');
    }

    await loadPlan();
  }, [taskId, loadPlan]);

  const approvePlan = useCallback(async () => {
    if (!taskId) throw new Error('No task ID');

    const res = await fetch(`/api/plans/${taskId}/approve`, {
      method: 'POST',
      credentials: 'include',
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to approve plan');
    }

    await loadPlan();
  }, [taskId, loadPlan]);

  const rejectPlan = useCallback(async (questions: string[]) => {
    if (!taskId) throw new Error('No task ID');

    const res = await fetch(`/api/plans/${taskId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ questions: questions.map(q => ({ question: q })) }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to reject plan');
    }

    await loadPlan();
  }, [taskId, loadPlan]);

  const deletePlan = useCallback(async () => {
    if (!taskId) throw new Error('No task ID');

    const res = await fetch(`/api/plans/${taskId}`, {
      method: 'DELETE',
      credentials: 'include',
    });

    if (!res.ok) {
      throw new Error('Failed to delete plan');
    }

    setPlan(null);
  }, [taskId]);

  return {
    plan,
    loading,
    error,
    savePlan,
    submitForReview,
    approvePlan,
    rejectPlan,
    deletePlan,
    loadPlan,
  };
}
```

- [ ] **Step 2: Create PlanEditor component**

```typescript
// src/features/planning/PlanEditor.tsx
/**
 * PlanEditor - Edit, submit, and manage task implementation plan
 */

import { memo, useState, useCallback } from 'react';
import { FileText, Send, Check, X, MessageSquare } from 'lucide-react';
import { usePlan } from './usePlan';

interface PlanEditorProps {
  taskId: string;
  onClose: () => void;
}

export const PlanEditor = memo(function PlanEditor({ taskId, onClose }: PlanEditorProps) {
  const { plan, loading, error, savePlan, submitForReview, approvePlan, rejectPlan } = usePlan(taskId);
  const [content, setContent] = useState(plan?.content || '');
  const [questionInput, setQuestionInput] = useState('');
  const [rejectionQuestions, setRejectionQuestions] = useState<string[]>([]);
  const [showRejectForm, setShowRejectForm] = useState(false);

  const handleSave = useCallback(async () => {
    await savePlan(content);
  }, [savePlan, content]);

  const handleSubmit = useCallback(async () => {
    await submitForReview();
  }, [submitForReview]);

  const handleApprove = useCallback(async () => {
    await approvePlan();
    onClose();
  }, [approvePlan, onClose]);

  const handleAddQuestion = useCallback(() => {
    if (questionInput.trim()) {
      setRejectionQuestions(prev => [...prev, questionInput.trim()]);
      setQuestionInput('');
    }
  }, [questionInput]);

  const handleReject = useCallback(async () => {
    if (rejectionQuestions.length === 0) return;
    await rejectPlan(rejectionQuestions);
    onClose();
  }, [rejectPlan, rejectionQuestions]);

  const isLocked = plan?.status === 'approved';
  const isInReview = plan?.status === 'in-review';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-lg w-full max-w-4xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <FileText size={20} />
            Implementation Plan
            {plan && (
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                plan.status === 'approved' ? 'bg-green-600' :
                plan.status === 'in-review' ? 'bg-yellow-600' :
                plan.status === 'rejected' ? 'bg-red-600' :
                'bg-blue-600'
              }`}>
                {plan.status}
              </span>
            )}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded">
            <X size={20} />
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="p-3 text-sm text-destructive bg-destructive/10 border-b">
            {error}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {isLocked ? (
            // Locked approved plan - read only
            <div className="flex-1 overflow-auto p-4">
              <pre className="text-sm whitespace-pre-wrap font-mono text-muted-foreground">
                {plan?.content}
              </pre>
            </div>
          ) : (
            // Editable textarea
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              disabled={loading || isInReview}
              className="flex-1 p-4 font-mono text-sm bg-transparent outline-none resize-none"
              placeholder="Write the implementation plan with complete code for every file..."
            />
          )}
        </div>

        {/* Reviewer Questions (if rejected) */}
        {plan?.status === 'rejected' && plan.reviewerQuestions && (
          <div className="p-4 border-t bg-yellow-500/10">
            <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
              <MessageSquare size={14} />
              Reviewer Questions ({plan.reviewerQuestions.filter(q => !q.resolved).length} open)
            </h4>
            <ul className="space-y-1 max-h-32 overflow-auto">
              {plan.reviewerQuestions.map((q, i) => (
                <li key={i} className={`text-xs ${q.resolved ? 'line-through text-muted-foreground' : 'text-yellow-200'}`}>
                  • {q.question}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Actions */}
        <div className="p-4 border-t flex items-center gap-2">
          {plan?.status === 'draft' && (
            <>
              <button
                onClick={handleSave}
                disabled={loading}
                className="text-xs px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors disabled:opacity-50"
              >
                Save Draft
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading || !content.trim()}
                className="text-xs px-3 py-1.5 rounded-md bg-green-600 hover:bg-green-500 text-white font-medium transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                <Send size={12} />
                Submit for Review
              </button>
            </>
          )}

          {plan?.status === 'in-review' && (
            <>
              <button
                onClick={handleApprove}
                disabled={loading}
                className="text-xs px-3 py-1.5 rounded-md bg-green-600 hover:bg-green-500 text-white font-medium transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                <Check size={12} />
                Approve Plan
              </button>
              <button
                onClick={() => setShowRejectForm(true)}
                disabled={loading}
                className="text-xs px-3 py-1.5 rounded-md bg-red-600 hover:bg-red-500 text-white font-medium transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                <X size={12} />
                Request Changes
              </button>
            </>
          )}

          {showRejectForm && (
            <div className="flex gap-2 ml-auto">
              <input
                type="text"
                value={questionInput}
                onChange={(e) => setQuestionInput(e.target.value)}
                placeholder="Add a question..."
                className="text-xs px-2 py-1.5 rounded-md border border-input bg-transparent flex-1"
                onKeyPress={(e) => e.key === 'Enter' && handleAddQuestion()}
              />
              <button
                onClick={handleAddQuestion}
                className="text-xs px-2 py-1.5 rounded-md bg-muted hover:bg-muted/80"
              >
                Add
              </button>
              <button
                onClick={handleReject}
                disabled={rejectionQuestions.length === 0}
                className="text-xs px-3 py-1.5 rounded-md bg-red-600 hover:bg-red-500 text-white font-medium disabled:opacity-50"
              >
                Submit
              </button>
            </div>
          )}

          {!isLocked && !showRejectForm && (
            <button
              onClick={onClose}
              className="ml-auto text-xs px-3 py-1.5 rounded-md border border-input hover:bg-muted"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
});
```

- [ ] **Step 3: Commit**

```bash
git add src/features/planning/usePlan.ts src/features/planning/PlanEditor.tsx
git commit -m "feat(plan): Add PlanEditor component and usePlan hook

- Full plan editor with save/submit/approve/reject flows
- Read-only view for approved plans
- Reviewer questions for rejected plans
- Status badges and action buttons
"
```

---

### Task 10: Multi-Agent Chains - Chain Configuration

**Files:**
- Create: `server/services/agent-chains.ts`
- Create: `server/services/agent-chains.test.ts`

- [ ] **Step 1: Write chain types and configuration**

```typescript
// server/services/agent-chains.ts
/**
 * Multi-Agent Chains
 *
 * Define sequential agent handoffs for complex tasks.
 * Each chain specifies agents in order with handoff context.
 */

import { SPECIALIST_AGENTS } from '../lib/agent-registry.js';

export interface ChainStep {
  agent: string;
  prompt: string;
  model?: string;
  thinking?: 'off' | 'low' | 'medium' | 'high';
  timeoutMs?: number;
}

export interface AgentChain {
  id: string;
  name: string;
  description: string;
  steps: ChainStep[];
  gate_mode: 'audit-only' | 'gate-on-write' | 'gate-on-deploy';
}

/**
 * Predefined agent chains for common workflows.
 */
export const PREDEFINED_CHAINS: Record<string, AgentChain> = {
  'full-build': {
    id: 'full-build',
    name: 'Full Build',
    description: 'Plan → Review → Code → Test workflow',
    steps: [
      {
        agent: 'orchestrator-agent',
        prompt: 'Create a complete implementation plan for this task. Include: 1) Research relevant documentation, 2) Design the solution architecture, 3) Write complete code for every file with no placeholders.',
        thinking: 'high',
        timeoutMs: 600000,
      },
      {
        agent: 'security-reviewer',
        prompt: 'Review the implementation plan. Check for: 1) Security vulnerabilities, 2) Missing error handling, 3) Architectural issues. Provide specific questions for any gaps found.',
        thinking: 'high',
        timeoutMs: 300000,
      },
      {
        agent: 'orchestrator-agent',
        prompt: 'Implement the approved plan exactly as specified. Create all files, install dependencies, and ensure the code compiles/runs.',
        thinking: 'medium',
        timeoutMs: 600000,
      },
      {
        agent: 'security-reviewer',
        prompt: 'Test the implementation against the plan. Run tests if available. Report any issues that need fixing.',
        thinking: 'high',
        timeoutMs: 300000,
      },
    ],
    gate_mode: 'gate-on-write',
  },
  'quick-fix': {
    id: 'quick-fix',
    name: 'Quick Fix',
    description: 'Single agent with review',
    steps: [
      {
        agent: 'orchestrator-agent',
        prompt: 'Implement this fix. Keep changes minimal and focused.',
        thinking: 'low',
        timeoutMs: 300000,
      },
      {
        agent: 'security-reviewer',
        prompt: 'Quick review of the changes. Check for obvious issues.',
        thinking: 'medium',
        timeoutMs: 120000,
      },
    ],
    gate_mode: 'audit-only',
  },
  'security-audit': {
    id: 'security-audit',
    name: 'Security Audit',
    description: 'Deep security review with fixes',
    steps: [
      {
        agent: 'security-reviewer',
        prompt: 'Perform a comprehensive security audit. Identify all vulnerabilities, rate severity, and propose fixes.',
        thinking: 'high',
        timeoutMs: 600000,
      },
      {
        agent: 'orchestrator-agent',
        prompt: 'Implement all critical and high severity fixes from the audit.',
        thinking: 'high',
        timeoutMs: 600000,
      },
    ],
    gate_mode: 'gate-on-write',
  },
};

/**
 * Get chain by ID.
 */
export function getChain(chainId: string): AgentChain | undefined {
  return PREDEFINED_CHAINS[chainId];
}

/**
 * List all available chains.
 */
export function listChains(): AgentChain[] {
  return Object.values(PREDEFINED_CHAINS);
}

/**
 * Get the next step in a chain.
 */
export function getNextStep(
  chain: AgentChain,
  currentAgent: string
): ChainStep | null {
  const currentIndex = chain.steps.findIndex(s => s.agent === currentAgent);
  if (currentIndex === -1 || currentIndex >= chain.steps.length - 1) {
    return null;
  }
  return chain.steps[currentIndex + 1];
}

/**
 * Get the first step in a chain.
 */
export function getFirstStep(chain: AgentChain): ChainStep {
  return chain.steps[0];
}

/**
 * Build handoff context from previous agent output.
 */
export function buildHandoffContext(
  previousAgent: string,
  previousOutput: string,
  chain: AgentChain
): string {
  return `## Context from ${previousAgent}

${previousOutput.slice(0, 4000)}${previousOutput.length > 4000 ? '...' : ''}

---

Proceed with your part of the workflow. The above is the work completed by the previous agent.
`;
}
```

- [ ] **Step 2: Write tests**

```typescript
// server/services/agent-chains.test.ts
import { describe, it, expect } from 'vitest';
import { getChain, getNextStep, getFirstStep, buildHandoffContext } from './agent-chains.js';

describe('agent-chains', () => {
  it('gets chain by ID', () => {
    const chain = getChain('full-build');
    expect(chain).toBeDefined();
    expect(chain?.name).toBe('Full Build');
  });

  it('gets first step', () => {
    const chain = getChain('full-build')!;
    const step = getFirstStep(chain);
    expect(step.agent).toBe('orchestrator-agent');
  });

  it('gets next step in chain', () => {
    const chain = getChain('full-build')!;
    const next = getNextStep(chain, 'orchestrator-agent');
    expect(next?.agent).toBe('security-reviewer');
  });

  it('returns null for last step', () => {
    const chain = getChain('full-build')!;
    const next = getNextStep(chain, 'security-reviewer');
    expect(next).toBeNull();
  });

  it('builds handoff context', () => {
    const chain = getChain('quick-fix')!;
    const context = buildHandoffContext('coder', 'Code output here', chain);
    expect(context).toContain('## Context from coder');
    expect(context).toContain('Code output here');
  });
});
```

- [ ] **Step 3: Commit**

```bash
git add server/services/agent-chains.ts server/services/agent-chains.test.ts
git commit -m "feat(chains): Add multi-agent chain configuration

- PREDEFINED_CHAINS for full-build, quick-fix, security-audit
- ChainStep and AgentChain types
- getNextStep() for handoff navigation
- buildHandoffContext() for context passing
"
```

---

### Task 11: Multi-Agent Chains - Execution Engine

**Files:**
- Modify: `server/services/orchestrator-service.ts`
- Create: `server/routes/chains.ts`

- [ ] **Step 1: Add chain execution to orchestrator service**

```typescript
// server/services/orchestrator-service.ts - Add new function
/**
 * Execute a task using an agent chain.
 */
export async function executeChain(
  taskId: string,
  chainId: string
): Promise<{ success: boolean; error?: string }> {
  const chain = getChain(chainId);
  if (!chain) {
    return { success: false, error: `Unknown chain: ${chainId}` };
  }

  const store = getKanbanStore();
  const task = await store.getTask(taskId);
  if (!task) {
    return { success: false, error: 'Task not found' };
  }

  try {
    // Store chain state in metadata
    await store.updateTask(taskId, task.version, {
      metadata: {
        ...(task.metadata as Record<string, unknown> || {}),
        chainId,
        chainStep: 0,
        chainStatus: 'running',
      },
    } as never);

    // Start first step
    await executeChainStep(taskId, chain, 0);
    return { success: true };
  } catch (error) {
    console.error('Chain execution failed:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Chain failed' };
  }
}

/**
 * Execute a single step in the chain.
 */
async function executeChainStep(
  taskId: string,
  chain: AgentChain,
  stepIndex: number
): Promise<void> {
  const step = chain.steps[stepIndex];
  if (!step) return;

  const store = getKanbanStore();
  const task = await store.getTask(taskId);
  if (!task) return;

  // Build prompt with handoff context if not first step
  let prompt = step.prompt;
  if (stepIndex > 0) {
    const previousAgent = chain.steps[stepIndex - 1].agent;
    const previousOutput = (task.metadata as Record<string, unknown>)?.[`${previousAgent}Output`] as string || '';
    prompt = buildHandoffContext(previousAgent, previousOutput, chain) + '\n\n' + step.prompt;
  }

  // Execute agent
  const { invokeGatewayTool } = await import('../lib/gateway-client.js');
  const result = await invokeGatewayTool('sessions_spawn', {
    task: prompt,
    label: `chain-${chain.id}-step${stepIndex}`,
    runtime: 'subagent',
    mode: 'session',
    thinking: step.thinking || 'medium',
    cleanup: 'keep',
    model: step.model,
  }, step.timeoutMs || 300000);

  // Store output for next handoff
  const output = parseGatewayResponse(result).output as string || '';
  await store.updateTask(taskId, task.version, {
    metadata: {
      ...(task.metadata as Record<string, unknown> || {}),
      chainStep: stepIndex,
      [`${step.agent}Output`]: output,
    },
  } as never);

  // Check if more steps
  const nextStep = getNextStep(chain, step.agent);
  if (nextStep) {
    // Queue next step
    setTimeout(() => executeChainStep(taskId, chain, stepIndex + 1), 2000);
  } else {
    // Chain complete
    await store.updateTask(taskId, task.version, {
      metadata: {
        ...(task.metadata as Record<string, unknown> || {}),
        chainStatus: 'complete',
        chainCompletedAt: Date.now(),
      },
    } as never);

    const { broadcast } = await import('../routes/events.js');
    broadcast('chain.complete', { taskId, chainId: chain.id });
  }
}
```

- [ ] **Step 2: Add chain start endpoint**

```typescript
// server/routes/chains.ts
/**
 * Agent Chain Execution API
 *
 * POST /api/chains/start - Start chain execution for a task
 * GET  /api/chains/status/:taskId - Get chain execution status
 * POST /api/chains/:taskId/next - Manually advance to next step
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { rateLimitGeneral } from '../middleware/rate-limit.js';
import { getKanbanStore } from '../lib/kanban-store.js';
import { getChain, listChains } from '../services/agent-chains.js';
import { executeChain } from '../services/orchestrator-service.js';

const app = new Hono();

// GET /api/chains - List available chains
app.get('/api/chains', rateLimitGeneral, async (c) => {
  const chains = listChains();
  return c.json({ chains });
});

// POST /api/chains/start - Start chain execution
const startChainSchema = z.object({
  taskId: z.string(),
  chainId: z.string(),
});

app.post('/api/chains/start', rateLimitGeneral, async (c) => {
  let body: unknown = {};
  try {
    const text = await c.req.text();
    if (text) body = JSON.parse(text);
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  const parsed = startChainSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid request', details: parsed.error.flatten() }, 400);
  }

  const result = await executeChain(parsed.data.taskId, parsed.data.chainId);
  if (!result.success) {
    return c.json({ error: result.error }, 500);
  }

  return c.json({ success: true, taskId: parsed.data.taskId, chainId: parsed.data.chainId });
});

// GET /api/chains/status/:taskId - Get chain status
app.get('/api/chains/status/:taskId', rateLimitGeneral, async (c) => {
  const taskId = c.req.param('taskId');
  const store = getKanbanStore();
  const task = await store.getTask(taskId);

  if (!task) {
    return c.json({ error: 'Task not found' }, 404);
  }

  const metadata = task.metadata as Record<string, unknown> || {};
  return c.json({
    taskId,
    chainId: metadata.chainId || null,
    chainStep: metadata.chainStep || 0,
    chainStatus: metadata.chainStatus || 'not-started',
    chainCompletedAt: metadata.chainCompletedAt || null,
  });
});

export default app;
```

- [ ] **Step 3: Commit**

```bash
git add server/services/agent-chains.ts server/routes/chains.ts
git commit -m "feat(chains): Add chain execution engine

- executeChain() and executeChainStep() functions
- POST /api/chains/start endpoint
- GET /api/chains/status/:taskId endpoint
- Automatic handoff between agents
- Store outputs in task metadata
"
```

---

### Task 12: Security Approval Gates - Command Interception

**Files:**
- Create: `server/services/approval-queue.ts`
- Modify: `server/routes/orchestrator.ts`

- [ ] **Step 1: Create approval queue service**

```typescript
// server/services/approval-queue.ts
/**
 * Security Approval Queue
 *
 * Queue for dangerous commands awaiting human approval.
 */

import { EventEmitter } from 'node:events';
import { getKanbanStore } from '../lib/kanban-store.js';
import { broadcast } from '../routes/events.js';

export interface PendingApproval {
  id: string;
  taskId: string;
  agent: string;
  command: string;
  description: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  createdAt: number;
  expiresAt: number;
}

export interface ApprovalResult {
  approved: boolean;
  modifiedCommand?: string;
  reason?: string;
}

const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

class ApprovalQueue extends EventEmitter {
  private pending = new Map<string, PendingApproval>();
  private responses = new Map<string, ApprovalResult>();

  add(approval: PendingApproval): void {
    this.pending.set(approval.id, approval);
    broadcast('approval.requested', approval);

    // Auto-expire
    setTimeout(() => {
      if (this.pending.has(approval.id)) {
        this.deny(approval.id, 'Timeout');
      }
    }, APPROVAL_TIMEOUT_MS);
  }

  async waitForResponse(id: string): Promise<ApprovalResult> {
    return new Promise((resolve) => {
      const check = () => {
        const response = this.responses.get(id);
        if (response) {
          this.responses.delete(id);
          resolve(response);
        } else {
          setTimeout(check, 500);
        }
      };
      check();
    });
  }

  approve(id: string, modifiedCommand?: string): void {
    const approval = this.pending.get(id);
    if (!approval) return;

    this.responses.set(id, { approved: true, modifiedCommand });
    this.pending.delete(id);
    broadcast('approval.granted', { id, taskId: approval.taskId });
  }

  deny(id: string, reason: string): void {
    const approval = this.pending.get(id);
    if (!approval) return;

    this.responses.set(id, { approved: false, reason });
    this.pending.delete(id);
    broadcast('approval.denied', { id, taskId: approval.taskId, reason });
  }

  getPending(taskId?: string): PendingApproval[] {
    const all = Array.from(this.pending.values());
    if (!taskId) return all;
    return all.filter(a => a.taskId === taskId);
  }
}

export const approvalQueue = new ApprovalQueue();

/**
 * Check if command requires approval.
 */
export function requiresApproval(command: string): boolean {
  const dangerous = [
    /^rm\s+(-rf?|--recursive)\s/i,
    /^curl.*\|\s*(ba)?sh/i,
    /^wget.*\|\s*(ba)?sh/i,
    /^chmod\s+777/i,
    /^chown\s/i,
    /^sudo\s/i,
    /^dd\s/i,
    /^mkfs/i,
    /^:forkbomb/i, // Test pattern
  ];
  return dangerous.some(pattern => pattern.test(command));
}

/**
 * Assess risk level of command.
 */
export function assessRisk(command: string): 'low' | 'medium' | 'high' | 'critical' {
  if (/^rm\s+(-rf?|--recursive)\s+\/|^mkfs|^dd\s/i.test(command)) {
    return 'critical';
  }
  if (/^sudo|^chmod\s+777|^chown\s/i.test(command)) {
    return 'high';
  }
  if (/^curl.*\|\s*(ba)?sh|^wget.*\|\s*(ba)?sh/i.test(command)) {
    return 'high';
  }
  if (/^rm\s+/i.test(command)) {
    return 'medium';
  }
  return 'low';
}
```

- [ ] **Step 2: Add approval endpoints**

```typescript
// server/routes/orchestrator.ts - Add endpoints
// GET /api/orchestrator/approvals - List pending approvals
app.get('/api/orchestrator/approvals', rateLimitGeneral, async (c) => {
  const { approvalQueue } = await import('../services/approval-queue.js');
  const pending = approvalQueue.getPending();
  return c.json({ approvals: pending });
});

// POST /api/orchestrator/approvals/:id/approve
app.post('/api/orchestrator/approvals/:id/approve', rateLimitGeneral, async (c) => {
  const id = c.req.param('id');
  let body: unknown = {};
  try {
    const text = await c.req.text();
    if (text) body = JSON.parse(text);
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  const { modifiedCommand } = body as { modifiedCommand?: string };
  const { approvalQueue } = await import('../services/approval-queue.js');
  approvalQueue.approve(id, modifiedCommand);

  return c.json({ success: true });
});

// POST /api/orchestrator/approvals/:id/deny
app.post('/api/orchestrator/approvals/:id/deny', rateLimitGeneral, async (c) => {
  const id = c.req.param('id');
  let body: unknown = {};
  try {
    const text = await c.req.text();
    if (text) body = JSON.parse(text);
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  const { reason } = body as { reason?: string };
  const { approvalQueue } = await import('../services/approval-queue.js');
  approvalQueue.deny(id, reason || 'Denied by user');

  return c.json({ success: true });
});
```

- [ ] **Step 3: Commit**

```bash
git add server/services/approval-queue.ts server/routes/orchestrator.ts
git commit -m "feat(approvals): Add security approval queue

- PendingApproval interface and approvalQueue
- requiresApproval() and assessRisk() functions
- GET /api/orchestrator/approvals endpoint
- POST approve/deny endpoints
- Auto-expire after 5 minutes
"
```

---

### Task 13: Security Approval Gates - UI Component

**Files:**
- Create: `src/features/orchestrator/ApprovalDialog.tsx`
- Modify: `src/features/orchestrator/OrchestratorDashboard.tsx`

- [ ] **Step 1: Create ApprovalDialog component**

```typescript
// src/features/orchestrator/ApprovalDialog.tsx
/**
 * ApprovalDialog - Request approval for dangerous commands
 */

import { memo, useState, useCallback } from 'react';
import { Shield, Check, X, AlertTriangle } from 'lucide-react';

export interface PendingApproval {
  id: string;
  taskId: string;
  agent: string;
  command: string;
  description: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  createdAt: number;
}

interface ApprovalDialogProps {
  approval: PendingApproval;
  onApprove: (id: string, modifiedCommand?: string) => void;
  onDeny: (id: string, reason: string) => void;
}

const RISK_COLORS = {
  low: 'bg-green-600',
  medium: 'bg-yellow-600',
  high: 'bg-orange-600',
  critical: 'bg-red-600',
};

export const ApprovalDialog = memo(function ApprovalDialog({
  approval,
  onApprove,
  onDeny,
}: ApprovalDialogProps) {
  const [denyReason, setDenyReason] = useState('');
  const [showDenyForm, setShowDenyForm] = useState(false);

  const handleApprove = useCallback(() => {
    onApprove(approval.id);
  }, [approval.id, onApprove]);

  const handleDeny = useCallback(() => {
    if (denyReason.trim()) {
      onDeny(approval.id, denyReason);
    }
  }, [approval.id, denyReason, onDeny]);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-lg w-full max-w-2xl border border-border">
        {/* Header */}
        <div className="p-4 border-b flex items-center gap-3">
          <Shield size={24} className="text-amber-400" />
          <h3 className="text-lg font-semibold">Command Approval Required</h3>
          <span className={`ml-auto text-xs px-2 py-1 rounded-full text-white ${RISK_COLORS[approval.riskLevel]}`}>
            {approval.riskLevel.toUpperCase()}
          </span>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          <div>
            <div className="text-xs text-muted-foreground mb-1">Agent</div>
            <div className="text-sm font-medium">{approval.agent}</div>
          </div>

          <div>
            <div className="text-xs text-muted-foreground mb-1">Description</div>
            <div className="text-sm">{approval.description}</div>
          </div>

          <div>
            <div className="text-xs text-muted-foreground mb-1">Command</div>
            <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto font-mono">
              {approval.command}
            </pre>
          </div>

          {showDenyForm && (
            <div>
              <div className="text-xs text-muted-foreground mb-1">Denial Reason</div>
              <input
                type="text"
                value={denyReason}
                onChange={(e) => setDenyReason(e.target.value)}
                placeholder="Why is this command being denied?"
                className="w-full px-3 py-2 rounded-md border border-input bg-transparent text-sm"
                autoFocus
              />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-4 border-t flex items-center gap-2">
          {!showDenyForm ? (
            <>
              <button
                onClick={handleApprove}
                className="text-xs px-4 py-2 rounded-md bg-green-600 hover:bg-green-500 text-white font-medium transition-colors inline-flex items-center gap-1.5"
              >
                <Check size={12} />
                Approve
              </button>
              <button
                onClick={() => setShowDenyForm(true)}
                className="text-xs px-4 py-2 rounded-md bg-red-600 hover:bg-red-500 text-white font-medium transition-colors inline-flex items-center gap-1.5"
              >
                <X size={12} />
                Deny
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleDeny}
                disabled={!denyReason.trim()}
                className="text-xs px-4 py-2 rounded-md bg-red-600 hover:bg-red-500 text-white font-medium disabled:opacity-50"
              >
                Submit Denial
              </button>
              <button
                onClick={() => {
                  setShowDenyForm(false);
                  setDenyReason('');
                }}
                className="text-xs px-4 py-2 rounded-md border border-input hover:bg-muted"
              >
                Cancel
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
});
```

- [ ] **Step 2: Commit**

```bash
git add src/features/orchestrator/ApprovalDialog.tsx
git commit -m "feat(approvals): Add ApprovalDialog component

- Show dangerous command approval requests
- Risk level badges
- Approve/Deny actions with reason input
- Full screen modal overlay
"
```

---

### Task 14: Pixel Art Visualization - Agent Office Scene

**Files:**
- Create: `src/features/orchestrator/AgentOffice.tsx`
- Create: `src/features/orchestrator/AgentAvatar.tsx`
- Modify: `src/features/orchestrator/OrchestratorDashboard.tsx`

- [ ] **Step 1: Create AgentAvatar component**

```typescript
// src/features/orchestrator/AgentAvatar.tsx
/**
 * AgentAvatar - Pixel art style agent avatar with status animations
 */

import { memo } from 'react';
import { AGENT_AVATARS } from './OrchestratorDashboard';

interface AgentAvatarProps {
  agentName: string;
  status: 'idle' | 'working' | 'blocked' | 'complete';
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export const AgentAvatar = memo(function AgentAvatar({
  agentName,
  status,
  size = 'md',
  showLabel = true,
}: AgentAvatarProps) {
  const avatar = AGENT_AVATARS[agentName] || { emoji: '🤖', color: '#64748b', role: 'Agent' };

  const sizeClasses = {
    sm: 'w-12 h-12',
    md: 'w-16 h-16',
    lg: 'w-24 h-24',
  };

  const statusClasses = {
    idle: '',
    working: 'animate-pulse ring-2 ring-cyan-400',
    blocked: 'ring-2 ring-amber-400 animate-bounce',
    complete: 'ring-2 ring-green-400',
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`${sizeClasses[size]} ${statusClasses[status]} rounded-lg flex items-center justify-center transition-all`}
        style={{ backgroundColor: `${avatar.color}20`, borderColor: avatar.color }}
      >
        <span className="text-2xl" style={{ fontSize: size === 'lg' ? '2rem' : size === 'md' ? '1.5rem' : '1rem' }}>
          {avatar.emoji}
        </span>
      </div>
      {showLabel && (
        <span className="text-xs text-muted-foreground font-medium">
          {agentName.replace('-agent', '').replace(/^./, c => c.toUpperCase())}
        </span>
      )}
    </div>
  );
});
```

- [ ] **Step 2: Create AgentOffice component**

```typescript
// src/features/orchestrator/AgentOffice.tsx
/**
 * AgentOffice - Pixel art office visualization with agents at desks
 */

import { memo } from 'react';
import { AgentAvatar } from './AgentAvatar';

interface AgentStatus {
  name: string;
  status: 'idle' | 'working' | 'blocked' | 'complete';
  currentTask?: string;
}

interface AgentOfficeProps {
  agents: AgentStatus[];
}

export const AgentOffice = memo(function AgentOffice({ agents }: AgentOfficeProps) {
  return (
    <div className="p-6 bg-gradient-to-b from-slate-900 to-slate-800 rounded-lg border border-border">
      <h3 className="text-sm font-semibold mb-4 text-slate-300">Agent Office</h3>

      {/* Office grid - 3x2 layout */}
      <div className="grid grid-cols-3 gap-4">
        {agents.map(agent => (
          <div
            key={agent.name}
            className="flex flex-col items-center p-4 rounded-lg bg-slate-800/50 border border-slate-700"
          >
            <AgentAvatar
              agentName={agent.name}
              status={agent.status}
              size="lg"
            />
            {agent.currentTask && (
              <span className="text-xs text-slate-400 mt-2 text-center line-clamp-2">
                {agent.currentTask}
              </span>
            )}
          </div>
        ))}

        {/* Empty desks */}
        {Array.from({ length: Math.max(0, 6 - agents.length) }).map((_, i) => (
          <div
            key={`empty-${i}`}
            className="flex flex-col items-center p-4 rounded-lg bg-slate-800/30 border border-dashed border-slate-700"
          >
            <div className="w-24 h-24 flex items-center justify-center text-slate-600">
              <span className="text-4xl">🪑</span>
            </div>
            <span className="text-xs text-slate-500 mt-2">Empty Desk</span>
          </div>
        ))}
      </div>

      {/* Status legend */}
      <div className="mt-4 flex items-center gap-4 text-xs text-slate-400">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-cyan-400/20 ring-2 ring-cyan-400" />
          Working
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-amber-400/20 ring-2 ring-amber-400" />
          Blocked
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-green-400/20 ring-2 ring-green-400" />
          Complete
        </div>
      </div>
    </div>
  );
});
```

- [ ] **Step 3: Integrate into dashboard**

```typescript
// src/features/orchestrator/OrchestratorDashboard.tsx
// Add import
import { AgentOffice } from './AgentOffice';

// In component, prepare agent statuses for visualization
const agentStatuses = useMemo(() => {
  const statusMap = new Map<string, { status: 'idle' | 'working' | 'blocked' | 'complete'; currentTask?: string }>();

  for (const task of tasks) {
    if (task.run?.status === 'running') {
      const agentName = task.assignee?.replace('agent:', '') || 'orchestrator-agent';
      statusMap.set(agentName, {
        status: 'working',
        currentTask: task.title,
      });
    }
  }

  // Add all known agents as idle
  const allAgents = Object.keys(AGENT_AVATARS);
  return allAgents.map(name => ({
    name,
    ...statusMap.get(name) || { status: 'idle' as const },
  }));
}, [tasks]);

// Render in component
<div className="grid gap-6 mb-6">
  <AgentOffice agents={agentStatuses} />
</div>
```

- [ ] **Step 4: Commit**

```bash
git add src/features/orchestrator/AgentAvatar.tsx src/features/orchestrator/AgentOffice.tsx src/features/orchestrator/OrchestratorDashboard.tsx
git commit -m "feat(visual): Add Pixel Art Agent Office

- AgentAvatar component with status animations
- AgentOffice 3x2 grid visualization
- Status legend (working/blocked/complete)
- Empty desk placeholders
- Integrates into dashboard
"
```

---

## Summary

This plan implements 7 features from The Dev Squad:

1. **Structured Agent Signals** (Tasks 1-3) - JSON signal parsing, SSE broadcast, frontend hook
2. **Supervisor Dashboard** (Task 4) - Manager-style summary panel
3. **Stall Detection** (Tasks 5-6) - Auto-detect and recover stalled tasks
4. **Plan-First Workflow** (Tasks 7-9) - Planning phase with review/approve flow
5. **Multi-Agent Chains** (Tasks 10-11) - Sequential agent handoffs
6. **Security Approval Gates** (Tasks 12-13) - Dangerous command approvals
7. **Pixel Art Visualization** (Task 14) - Agent office scene

**Total: 14 tasks, ~50 commits**

Each task produces working, testable software. Tasks can be executed in order (dependencies noted) or in parallel where independent.
