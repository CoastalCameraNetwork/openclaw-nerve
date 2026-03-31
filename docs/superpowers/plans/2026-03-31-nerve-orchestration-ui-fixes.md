# Nerve Orchestration & UI Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix orchestration reliability issues, implement event-driven completion, and build actionable UI for goal accomplishment

**Architecture:** Three-phase approach: (1) Foundation reliability fixes, (2) Event-driven architecture, (3) Goal-oriented UI

**Tech Stack:** React 19, TypeScript, Hono 4, Node.js 22, Recharts, SSE for real-time events

---

## Phase 1: Foundation Reliability (Sprint 1 Tasks)

### Task 1.1: Fix hardcoded working directory in PR review

**Files:**
- Modify: `server/services/pr-review.ts:19-25`
- Modify: `server/routes/orchestrator.ts:350-370`
- Test: `server/services/pr-review.test.ts` (create)

- [ ] **Step 1: Write test for dynamic working directory**

```typescript
// server/services/pr-review.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fixPRIssues } from './pr-review.js';

vi.doMock('../lib/gateway-client.js', () => ({
  invokeGatewayTool: vi.fn(async () => ({ content: [{ text: '{}' }] })),
}));

describe('fixPRIssues', () => {
  it('uses provided localPath instead of hardcoded mgmt path', async () => {
    const { invokeGatewayTool } = await import('../lib/gateway-client.js');

    await fixPRIssues('task123', 42, {
      passed: true,
      criticalIssues: 0,
      highIssues: 0,
      mediumIssues: 0,
      lowIssues: 0,
    }, 'mgmt', '/custom/path/to/project');

    const spawnCall = (invokeGatewayTool as any).mock.calls[0];
    const prompt = spawnCall[1].task;

    expect(prompt).toContain('/custom/path/to/project');
    expect(prompt).not.toContain('/ccn-github/mgmt');
  });

  it('falls back to cwd when no localPath provided', async () => {
    const { invokeGatewayTool } = await import('../lib/gateway-client.js');

    await fixPRIssues('task123', 42, {
      passed: true,
      criticalIssues: 0,
      highIssues: 0,
      mediumIssues: 0,
      lowIssues: 0,
    });

    const spawnCall = (invokeGatewayTool as any).mock.calls[0];
    const prompt = spawnCall[1].task;

    expect(prompt).toContain(process.cwd());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --run server/services/pr-review.test.ts
```
Expected: FAIL with "expected prompt to contain..."

- [ ] **Step 3: Update fixPRIssues signature**

```typescript
// server/services/pr-review.ts:19-25
export async function fixPRIssues(
  taskId: string,
  prNumber: number,
  report: PRReviewReport,
  projectType?: string,
  projectLocalPath?: string  // ADD THIS PARAMETER
): Promise<{ success: boolean; commits: number; message: string; sessionLabel?: string }> {
  // ... existing code
}
```

- [ ] **Step 4: Replace hardcoded path in prompt**

```typescript
// server/services/pr-review.ts:~150 (in the fix prompt)
const fixPrompt = `...existing prompt...

Working directory: ${projectLocalPath || process.cwd()}

...rest of prompt...`;
```

- [ ] **Step 5: Update caller in orchestrator.ts**

```typescript
// server/routes/orchestrator.ts:~360 (in /api/orchestrator/task/:id/fix)
const fixResult = await fixPRIssues(
  taskId,
  task.pr.number,
  report,
  project?.type,
  project?.localPath  // ADD THIS
);
```

- [ ] **Step 6: Run test to verify it passes**

```bash
npm test -- --run server/services/pr-review.test.ts
```
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add server/services/pr-review.ts server/services/pr-review.test.ts server/routes/orchestrator.ts
git commit -m "fix(orchestrator): use dynamic working directory in PR review

- Replace hardcoded /ccn-github/mgmt path with project localPath
- Fall back to cwd when no project detected
- Fixes PR review for all projects, not just mgmt"
```

---

### Task 1.2: Fix optimistic commit count in fixPRIssues

**Files:**
- Modify: `server/services/pr-review.ts:180-200`
- Modify: `server/routes/orchestrator.ts:370-390`

- [ ] **Step 1: Write test for honest commit count**

```typescript
// Add to server/services/pr-review.test.ts

describe('fixPRIssues return value', () => {
  it('returns commits: 0 when agent spawned but not completed', async () => {
    const result = await fixPRIssues('task123', 42, {
      passed: true,
      criticalIssues: 0,
      highIssues: 0,
      mediumIssues: 0,
      lowIssues: 0,
    });

    expect(result.commits).toBe(0);
    expect(result.sessionLabel).toBeDefined();
    expect(result.message).toContain('spawned');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --run server/services/pr-review.test.ts
```
Expected: FAIL with "expected 1 to be 0"

- [ ] **Step 3: Fix return value in fixPRIssues**

```typescript
// server/services/pr-review.ts:~195 (return statement)
// BEFORE:
return {
  success: true,
  commits: 1, // Agent will commit
  message: `Agent ${agentName} is fixing ${allIssues.length} issues`,
};

// AFTER:
return {
  success: true,
  commits: 0, // Agent spawned but hasn't committed yet
  message: `Agent ${agentName} spawned to fix ${allIssues.length} issues. Check task status for progress.`,
  sessionLabel: `pr-${prNumber}-fix`,
};
```

- [ ] **Step 4: Update route handler to return session label**

```typescript
// server/routes/orchestrator.ts:~380 (in /api/orchestrator/task/:id/fix response)
return c.json({
  success: true,
  message: fixResult.message,
  commits: fixResult.commits,
  sessionLabel: fixResult.sessionLabel,  // ADD THIS
  status: 'fixing',
});
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npm test -- --run server/services/pr-review.test.ts
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/services/pr-review.ts server/routes/orchestrator.ts
git commit -m "fix(orchestrator): return honest commit count from fixPRIssues

- Return commits: 0 when agent spawned (not optimistic 1)
- Include sessionLabel for status tracking
- Message reflects actual state (spawned vs completed)"
```

---

### Task 1.3: Add structured error codes to orchestrator API

**Files:**
- Modify: `server/routes/orchestrator.ts:34-46` (add ErrorCode enum)
- Modify: All `c.json({ error: ... })` calls in file

- [ ] **Step 1: Add ErrorCode enum at top of file**

```typescript
// server/routes/orchestrator.ts:34-46 (after imports)
const ErrorCode = {
  TASK_NOT_FOUND: 'TASK_NOT_FOUND',
  PR_NOT_FOUND: 'PR_NOT_FOUND',
  NO_AGENTS: 'NO_AGENTS',
  NO_PROJECT: 'NO_PROJECT',
  GATEWAY_ERROR: 'GATEWAY_ERROR',
  AGENT_SPAWN_FAILED: 'AGENT_SPAWN_FAILED',
  REVIEW_REQUIRED: 'REVIEW_REQUIRED',
  INVALID_REQUEST: 'INVALID_REQUEST',
  DUPLICATE_EXECUTION: 'DUPLICATE_EXECUTION',
  VERSION_CONFLICT: 'VERSION_CONFLICT',
  NO_REVIEW_REPORT: 'NO_REVIEW_REPORT',
} as const;
```

- [ ] **Step 2: Update task not found error**

```typescript
// server/routes/orchestrator.ts:~174 (GET /api/orchestrator/status/:id)
// BEFORE:
return c.json({ error: 'Task not found' }, 404);

// AFTER:
return c.json({ error: 'Task not found', code: ErrorCode.TASK_NOT_FOUND }, 404);
```

- [ ] **Step 3: Update no agents error**

```typescript
// server/routes/orchestrator.ts:~250 (POST /api/orchestrator/execute/:id)
// Find the check for missing agent labels and update:
if (!agentLabels || agentLabels.length === 0) {
  return c.json({
    error: 'Task has no agent assignments',
    code: ErrorCode.NO_AGENTS
  }, 400);
}
```

- [ ] **Step 4: Update no project error**

```typescript
// server/routes/orchestrator.ts:~320 (POST /api/orchestrator/task/:id/review)
// BEFORE:
return c.json({ error: 'Cannot create PR: No project detected' }, 400);

// AFTER:
return c.json({
  error: 'Cannot create PR: No project detected',
  code: ErrorCode.NO_PROJECT
}, 400);
```

- [ ] **Step 5: Update gateway/spawn error catch blocks**

```typescript
// server/routes/orchestrator.ts:~183 (catch block in GET /status/:id)
// BEFORE:
} catch (error) {
  console.error('Failed to get task status:', error);
  return c.json({ error: 'Failed to get task status' }, 500);
}

// AFTER:
} catch (error) {
  console.error('Failed to get task status:', error);
  return c.json({
    error: `Failed to get task status: ${(error as Error).message}`,
    code: ErrorCode.GATEWAY_ERROR
  }, 500);
}
```

- [ ] **Step 6: Repeat for all remaining error responses**

Search for all `c.json({ error:` patterns and add code field. Use grep:
```bash
grep -n "c.json({ error:" server/routes/orchestrator.ts
```

- [ ] **Step 7: Run lint and build**

```bash
npm run lint
npm run build:server
```

- [ ] **Step 8: Commit**

```bash
git add server/routes/orchestrator.ts
git commit -m "feat(orchestrator): add structured error codes to API responses

- Add ErrorCode enum with all error types
- Include code field in all error responses
- Enable frontend to distinguish error types programmatically
- Add context (taskId, agentName) to error responses where relevant"
```

---

### Task 1.4: Add unit tests for agent-registry and project-registry

**Files:**
- Create: `server/lib/agent-registry.test.ts`
- Create: `server/lib/project-registry.test.ts`

- [ ] **Step 1: Create agent-registry.test.ts**

```typescript
// server/lib/agent-registry.test.ts
import { describe, it, expect } from 'vitest';
import { routeTask, listAgents, getAgent, analyzeComplexity } from './agent-registry.js';

describe('agent-registry', () => {
  describe('listAgents', () => {
    it('returns all registered agents', () => {
      const agents = listAgents();
      expect(agents.length).toBeGreaterThan(0);
      const names = agents.map(a => a.name);
      expect(names).toContain('k8s-agent');
      expect(names).toContain('mgmt-agent');
      expect(names).toContain('security-reviewer');
    });

    it('each agent has required fields', () => {
      for (const agent of listAgents()) {
        expect(agent.name).toBeTruthy();
        expect(agent.domain).toBeTruthy();
        expect(agent.description).toBeTruthy();
        expect(Array.isArray(agent.keywords)).toBe(true);
      }
    });
  });

  describe('getAgent', () => {
    it('returns agent by name', () => {
      const agent = getAgent('k8s-agent');
      expect(agent).toBeDefined();
      expect(agent!.domain).toBe('Kubernetes');
    });

    it('returns undefined for unknown agent', () => {
      expect(getAgent('nonexistent-agent')).toBeUndefined();
    });
  });

  describe('routeTask', () => {
    it('routes k8s tasks to k8s-agent', () => {
      const result = routeTask('Deploy the kubernetes namespace for staging');
      expect(result.agents).toContain('k8s-agent');
    });

    it('routes mgmt deploy to sequential multi-agent', () => {
      const result = routeTask('Deploy mgmt platform to staging');
      expect(result.agents.length).toBeGreaterThan(1);
      expect(result.sequence).toBe('sequential');
      expect(result.gate_mode).toBe('gate-on-deploy');
    });

    it('routes wordpress tasks to wordpress-agent', () => {
      const result = routeTask('Update the WordPress plugin on wp-ccn');
      expect(result.agents).toContain('wordpress-agent');
    });

    it('routes security audit to security-reviewer', () => {
      const result = routeTask('Run a security audit on the mgmt auth endpoints');
      expect(result.agents).toContain('security-reviewer');
    });

    it('falls back to orchestrator-agent for unknown tasks', () => {
      const result = routeTask('Do something completely unrecognizable');
      expect(result.agents).toContain('orchestrator-agent');
      expect(result.fallback_used).toBe(true);
    });

    it('returns rule_id when matched by pattern', () => {
      const result = routeTask('Deploy mgmt to production');
      expect(result.rule_id).toBeTruthy();
    });
  });

  describe('analyzeComplexity', () => {
    it('rates simple tasks as simple', () => {
      const complexity = analyzeComplexity('Restart pod nginx', ['k8s-agent']);
      expect(complexity).toBe('simple');
    });

    it('rates refactoring tasks as complex', () => {
      const complexity = analyzeComplexity('Refactor the entire auth module to use OAuth2', ['mgmt-agent']);
      expect(complexity).toBe('complex');
    });

    it('rates security tasks as complex', () => {
      const complexity = analyzeComplexity('Run security audit', ['security-reviewer']);
      expect(complexity).toBe('complex');
    });

    it('rates multi-agent tasks as complex', () => {
      const complexity = analyzeComplexity('Deploy and configure the platform', ['k8s-agent', 'mgmt-agent', 'cicd-agent']);
      expect(complexity).toBe('complex');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

```bash
npm test -- --run server/lib/agent-registry.test.ts
```

- [ ] **Step 3: Create project-registry.test.ts**

```typescript
// server/lib/project-registry.test.ts
import { describe, it, expect } from 'vitest';
import { detectProject, listProjects } from './project-registry.js';

describe('project-registry', () => {
  describe('listProjects', () => {
    it('returns all registered projects', () => {
      const projects = listProjects();
      expect(projects.length).toBeGreaterThan(0);
      const names = projects.map(p => p.name);
      expect(names).toContain('MGMT Platform');
      expect(names).toContain('Nerve');
    });
  });

  describe('detectProject', () => {
    it('detects project from description keywords', () => {
      const project = detectProject('Fix a bug in the mgmt dashboard');
      expect(project).not.toBeNull();
      expect(project!.name).toBe('MGMT Platform');
    });

    it('detects project from explicit label', () => {
      const project = detectProject('Some task', ['project:mgmt']);
      expect(project).not.toBeNull();
      expect(project!.name).toBe('MGMT Platform');
    });

    it('detects project from repo: label', () => {
      const project = detectProject('Some task', ['repo:wp-ccn']);
      expect(project).not.toBeNull();
      expect(project!.type).toBe('wordpress');
    });

    it('detects wordpress sites by slug', () => {
      const project = detectProject('Update wp-hdbc theme');
      expect(project).not.toBeNull();
      expect(project!.name).toBe('WP HDBC');
    });

    it('detects nerve project', () => {
      const project = detectProject('Fix bug in openclaw-nerve');
      expect(project).not.toBeNull();
      expect(project!.name).toBe('Nerve');
    });

    it('detects kubernetes project', () => {
      const project = detectProject('Update kubernetes manifests');
      expect(project).not.toBeNull();
      expect(project!.type).toBe('kubernetes');
    });

    it('returns null for unrecognized description', () => {
      const project = detectProject('Buy groceries');
      expect(project).toBeNull();
    });

    it('labels take priority over description', () => {
      const project = detectProject('wordpress plugin update', ['project:mgmt']);
      expect(project!.name).toBe('MGMT Platform');
    });
  });
});
```

- [ ] **Step 4: Run tests**

```bash
npm test -- --run server/lib/project-registry.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add server/lib/agent-registry.test.ts server/lib/project-registry.test.ts
git commit -m "test(server): add unit tests for agent-registry and project-registry

- Test all routing rules and fallback behavior
- Test complexity analysis for simple/complex tasks
- Test project detection from keywords, labels, repo slugs
- Verify required fields on agent definitions"
```

---

### Task 1.5: Enforce gate mode in task execution

**Files:**
- Modify: `server/services/orchestrator-service.ts:186-247` (buildGateInstructions)
- Modify: `server/services/orchestrator-service.ts:260-350` (executeTask signature)

- [ ] **Step 1: Write test for gate mode instructions**

```typescript
// server/services/orchestrator-service.test.ts (create this file)
import { describe, it, expect } from 'vitest';
import { buildGateInstructions } from './orchestrator-service.js';

describe('buildGateInstructions', () => {
  it('returns audit-only instructions with no restrictions', () => {
    const instructions = buildGateInstructions('audit-only');
    expect(instructions).toContain('AUDIT-ONLY');
    expect(instructions).toContain('read-only');
    expect(instructions).not.toContain('MUST NOT');
  });

  it('returns gate-on-write instructions with file write restrictions', () => {
    const instructions = buildGateInstructions('gate-on-write');
    expect(instructions).toContain('GATE-ON-WRITE');
    expect(instructions).toContain('MUST NOT directly write');
    expect(instructions).toContain('proposal');
  });

  it('returns gate-on-deploy instructions with deployment restrictions', () => {
    const instructions = buildGateInstructions('gate-on-deploy');
    expect(instructions).toContain('GATE-ON-DEPLOY');
    expect(instructions).toContain('MUST get approval before');
    expect(instructions).toContain('deploy');
  });
});
```

- [ ] **Step 2: Export buildGateInstructions function**

```typescript
// server/services/orchestrator-service.ts:186
// Add export keyword:
export function buildGateInstructions(gateMode: 'audit-only' | 'gate-on-write' | 'gate-on-deploy'): string {
  // ... existing code
}
```

- [ ] **Step 3: Run test to verify it passes**

```bash
npm test -- --run server/services/orchestrator-service.test.ts
```

- [ ] **Step 4: Update executeTask signature**

```typescript
// server/services/orchestrator-service.ts:260
export async function executeTask(
  taskId: string,
  taskDescription: string,
  taskTitle: string,
  agents: string[],
  sequence: 'single' | 'sequential' | 'parallel',
  gateMode?: 'audit-only' | 'gate-on-write' | 'gate-on-deploy',  // Already exists
  project?: ProjectInfo | null,
  model?: string
): Promise<{ session_labels: string[]; pr?: PRInfo; review?: PRReviewReport }> {
```

- [ ] **Step 5: Verify gate instructions are included in prompt**

```typescript
// server/services/orchestrator-service.ts:300 (parallel) and 340 (sequential)
// Already exists, verify this code includes gateInstructions:
const prompt = `${taskDescription}${projectContext}\n\n${gateInstructions}`;
```

- [ ] **Step 6: Verify caller passes gate mode**

```typescript
// server/routes/orchestrator.ts:~137 (POST /api/orchestrator/start)
// Verify this line passes gate_mode:
await executeTask(kanbanTask.id, description, task.title, task.agents, task.sequence, task.gate_mode, null, task.routing.model);
```

- [ ] **Step 7: Commit**

```bash
git add server/services/orchestrator-service.ts server/services/orchestrator-service.test.ts
git commit -m "feat(orchestrator): enforce gate modes in agent prompts

- Export buildGateInstructions for testing
- Include gate mode restrictions in all agent prompts
- audit-only: read-only analysis
- gate-on-write: require proposal approval for file changes
- gate-on-deploy: require approval for deployments"
```

---

### Task 1.6: Fix recovery generation tracking on reconnect

**Files:**
- Modify: `src/hooks/useChatRecovery.ts`
- Modify: `src/contexts/ChatContext.tsx`

- [ ] **Step 1: Add bumpGeneration function to hook**

```typescript
// src/hooks/useChatRecovery.ts:~50 (in return statement)
const bumpGeneration = useCallback(() => {
  recoveryGenerationRef.current += 1;
}, []);

return useMemo(() => ({
  // ... existing returns
  bumpGeneration,
}), [/* ... existing deps, bumpGeneration */]);
```

- [ ] **Step 2: Call bumpGeneration on reconnect in ChatContext**

```typescript
// src/contexts/ChatContext.tsx:~150 (find the connectionState useEffect)
useEffect(() => {
  if (connectionState === 'connected') {
    // Check if this is a reconnect (wasGeneratingAtDisconnectRef was true)
    if (wasGeneratingAtDisconnectRef.current) {
      recovery.bumpGeneration();
      wasGeneratingAtDisconnectRef.current = false;
    }
  }
}, [connectionState, recovery]);
```

- [ ] **Step 3: Run build**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useChatRecovery.ts src/contexts/ChatContext.tsx
git commit -m "fix(chat): bump recovery generation on WebSocket reconnect

- Add bumpGeneration() function to useChatRecovery return value
- Call bumpGeneration when reconnecting to discard stale recovery results
- Prevents recovery initiated before disconnect from overwriting fresh data"
```

---

## Phase 2: Event-Driven Architecture (Sprint 2 Tasks)

### Task 2.1: Add webhook endpoint for session completion

**Files:**
- Create: `server/routes/orchestrator.ts` (add webhook endpoint at line ~220)
- Create: `server/services/session-watcher.ts` (new file)
- Modify: `src/features/orchestrator/useOrchestrator.ts` (add SSE subscription)

- [ ] **Step 1: Create webhook endpoint**

```typescript
// server/routes/orchestrator.ts:~220 (after existing routes)

/**
 * POST /api/orchestrator/webhook/session-complete
 * Called when a gateway session completes. Updates task status and stores output.
 */
app.post('/api/orchestrator/webhook/session-complete', rateLimitGeneral, async (c) => {
  try {
    const body = await c.req.json();
    const bodySchema = z.object({
      sessionLabel: z.string(),
      sessionKey: z.string().optional(),
      status: z.enum(['done', 'error', 'failed']),
      output: z.string().optional(),
      error: z.string().optional(),
    });

    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return c.json({
        error: 'Invalid request',
        code: ErrorCode.INVALID_REQUEST,
        details: parsed.error.flatten()
      }, 400);
    }

    const { sessionLabel, sessionKey, status, output, error } = parsed.data;

    // Parse task ID from session label (format: orch-{taskId}-{agentName})
    const match = sessionLabel.match(/^orch-(.+?)-([^-]+)$/);
    if (!match) {
      return c.json({ error: 'Not an orchestrator session', code: ErrorCode.INVALID_REQUEST }, 400);
    }

    const [, taskId, agentName] = match;
    const store = getKanbanStore();
    const task = await store.getTask(taskId).catch(() => null);

    if (!task) {
      return c.json({ error: 'Task not found', code: ErrorCode.TASK_NOT_FOUND }, 404);
    }

    // Store agent output in task metadata (cap at 10KB)
    const agentOutput = (task.metadata?.agentOutput as Record<string, any> || {});
    agentOutput[agentName] = {
      sessionKey,
      status: status || 'done',
      output: output?.substring(0, 10000),
      error: error || undefined,
      completedAt: Date.now(),
    };

    await store.updateTask(taskId, task.version, {
      metadata: {
        ...task.metadata,
        agentOutput,
      },
    } as any);

    // Check if ALL agents for this task are complete
    const agentLabels = task.labels?.filter((l: string) => l.startsWith('agent:')) || [];
    const expectedAgents = agentLabels.map((l: string) => l.replace('agent:', ''));
    const completedAgents = Object.keys(agentOutput);
    const allComplete = expectedAgents.every((a: string) => completedAgents.includes(a));

    if (allComplete && task.status === 'in-progress') {
      // Move task to review
      const updatedTask = await store.getTask(taskId);
      await store.updateTask(taskId, updatedTask!.version, {
        status: 'review',
      });

      // Broadcast completion event
      const { broadcast } = await import('./events.js');
      broadcast('orchestrator.task_complete', {
        taskId,
        title: task.title,
        completedAgents,
        hasOutput: !!output,
      });
    }

    return c.json({
      success: true,
      taskId,
      agent: agentName,
      allComplete,
    });
  } catch (error) {
    console.error('Webhook session-complete failed:', error);
    return c.json({ error: 'Webhook processing failed', code: ErrorCode.GATEWAY_ERROR }, 500);
  }
});
```

- [ ] **Step 2: Create session-watcher.ts**

```typescript
// server/services/session-watcher.ts
/**
 * Session Watcher — polls gateway for orchestrator session completions.
 * Fallback for cases where webhook isn't called.
 * Runs every 30 seconds, checks sessions labeled orch-*.
 */

import { invokeGatewayTool } from '../lib/gateway-client.js';
import { getKanbanStore } from '../lib/kanban-store.js';

const POLL_INTERVAL = 30_000; // 30 seconds
let watcherInterval: ReturnType<typeof setInterval> | null = null;

export function startSessionWatcher() {
  if (watcherInterval) return;
  watcherInterval = setInterval(checkSessions, POLL_INTERVAL);
  console.log('[session-watcher] Started, polling every 30s');
}

export function stopSessionWatcher() {
  if (watcherInterval) {
    clearInterval(watcherInterval);
    watcherInterval = null;
  }
}

async function checkSessions() {
  try {
    const result = await invokeGatewayTool('subagents', {
      action: 'list',
      recentMinutes: 10,
    }, 10000);

    const parsed = result as Record<string, unknown>;
    const recent = ((parsed.recent ?? []) as Array<Record<string, unknown>>);

    // Find completed orchestrator sessions
    const completed = recent.filter((s) => {
      const label = String(s.label ?? '');
      const status = String(s.status ?? '');
      return label.startsWith('orch-') && (status === 'done' || status === 'error');
    });

    if (completed.length === 0) return;

    const store = getKanbanStore();

    for (const session of completed) {
      const label = String(session.label ?? '');
      const match = label.match(/^orch-(.+?)-([^-]+)$/);
      if (!match) continue;

      const [, taskId, agentName] = match;
      const task = await store.getTask(taskId).catch(() => null);
      if (!task || task.status !== 'in-progress') continue;

      // Check if this agent's output is already stored
      const existing = (task.metadata?.agentOutput as Record<string, unknown>) || {};
      if (existing[agentName]) continue;

      // Fetch session history to get output
      try {
        const historyResult = await invokeGatewayTool('sessions_history', {
          sessionKey: session.sessionKey,
        }, 10000);

        const historyParsed = historyResult as Record<string, unknown>;
        const messages = (historyParsed.messages as Array<{ role: string; content: string }>) || [];
        const lastMessage = messages[messages.length - 1];
        const output = lastMessage?.content || '';

        // Store output (same logic as webhook)
        const agentOutput = (task.metadata?.agentOutput as Record<string, any> || {});
        agentOutput[agentName] = {
          sessionKey: session.sessionKey as string,
          status: session.status === 'error' ? 'error' : 'done',
          output: output.substring(0, 10000),
          completedAt: Date.now(),
        };

        await store.updateTask(taskId, task.version, {
          metadata: {
            ...task.metadata,
            agentOutput,
          },
        } as any);

        console.log(`[session-watcher] Stored output for task ${taskId} agent ${agentName}`);

        // Check if all complete
        const agentLabels = task.labels?.filter((l: string) => l.startsWith('agent:')) || [];
        const expectedAgents = agentLabels.map((l: string) => l.replace('agent:', ''));
        const completedAgents = Object.keys(agentOutput);
        const allComplete = expectedAgents.every((a: string) => completedAgents.includes(a));

        if (allComplete && task.status === 'in-progress') {
          const updatedTask = await store.getTask(taskId);
          await store.updateTask(taskId, updatedTask!.version, {
            status: 'review',
          });

          const { broadcast } = await import('../routes/events.js');
          broadcast('orchestrator.task_complete', {
            taskId,
            title: task.title,
            completedAgents,
          });
        }
      } catch (err) {
        console.error(`[session-watcher] Failed to fetch history for ${label}:`, err);
      }
    }
  } catch (err) {
    // Silent — watcher is best-effort
    console.error('[session-watcher] Polling error:', err);
  }
}
```

- [ ] **Step 3: Wire watcher into server startup**

```typescript
// server/index.ts:~100 (after server starts listening)
import { startSessionWatcher } from './services/session-watcher.js';

// After app.listen():
startSessionWatcher();
console.log('[server] Session watcher started');
```

- [ ] **Step 4: Add SSE subscription to frontend hook**

```typescript
// src/features/orchestrator/useOrchestrator.ts:~150 (in useTaskStatus or similar)
import { useGateway } from '@/contexts/GatewayContext';

// Inside the hook:
const { subscribe } = useGateway();

useEffect(() => {
  const unsubscribe = subscribe((event) => {
    if (event.type === 'orchestrator.task_complete' && event.payload?.taskId === taskId) {
      refetch();
    }
  });
  return unsubscribe;
}, [taskId, subscribe, refetch]);
```

- [ ] **Step 5: Run build**

```bash
npm run build:server
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add server/routes/orchestrator.ts server/services/session-watcher.ts server/index.ts src/features/orchestrator/useOrchestrator.ts
git commit -m "feat(orchestrator): add webhook endpoint for session completion

- POST /api/orchestrator/webhook/session-complete handles gateway notifications
- Store agent output in task.metadata.agentOutput (10KB cap)
- Auto-detect all-agents-complete and move task to review
- Broadcast orchestrator.task_complete SSE event
- Session watcher polls every 30s as fallback"
```

---

### Task 2.2: Implement structured agent handoff parsing

**Files:**
- Modify: `server/services/orchestrator-service.ts:151-180` (parseAgentHandoff)
- Test: `server/services/orchestrator-service.test.ts`

- [ ] **Step 1: Write test for handoff parsing**

```typescript
// Add to server/services/orchestrator-service.test.ts
import { parseAgentHandoff } from './orchestrator-service.js';

describe('parseAgentHandoff', () => {
  it('parses structured JSON handoff', () => {
    const output = `
I've completed the deployment configuration.

\`\`\`json
{
  "summary": "Updated deployment YAML for staging",
  "files_changed": ["k8s/staging/deployment.yaml"],
  "recommendations": ["Update resource limits", "Add health checks"],
  "errors": []
}
\`\`\`
`;

    const handoff = parseAgentHandoff('k8s-agent', output);

    expect(handoff.summary).toBe('Updated deployment YAML for staging');
    expect(handoff.filesChanged).toEqual(['k8s/staging/deployment.yaml']);
    expect(handoff.recommendations).toEqual(['Update resource limits', 'Add health checks']);
    expect(handoff.errors).toEqual([]);
  });

  it('falls back to raw text when no JSON', () => {
    const output = 'I fixed the bug by updating the auth middleware.';

    const handoff = parseAgentHandoff('mgmt-agent', output);

    expect(handoff.summary).toContain('I fixed the bug');
    expect(handoff.filesChanged).toEqual([]);
  });

  it('caps raw output at 2000 chars', () => {
    const output = 'x'.repeat(5000);

    const handoff = parseAgentHandoff('test-agent', output);

    expect(handoff.rawOutput?.length).toBe(2000);
  });
});
```

- [ ] **Step 2: Export parseAgentHandoff function**

```typescript
// server/services/orchestrator-service.ts:151
export function parseAgentHandoff(agentName: string, output: string): AgentHandoff {
  // ... existing code
}
```

- [ ] **Step 3: Fix JSON regex pattern**

```typescript
// server/services/orchestrator-service.ts:163
// BEFORE (double-escaped, wrong):
const jsonMatch = output?.match(/```json\\s*\\n([\\s\\S]*?)\\n```/);

// AFTER (correct regex):
const jsonMatch = output?.match(/```json\s*\n([\s\S]*?)\n```/);
```

- [ ] **Step 4: Run test**

```bash
npm test -- --run server/services/orchestrator-service.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add server/services/orchestrator-service.ts server/services/orchestrator-service.test.ts
git commit -m "fix(orchestrator): correct JSON regex in parseAgentHandoff

- Fix double-escaped regex pattern
- Export parseAgentHandoff for testing
- Add tests for structured JSON and fallback cases
- Cap raw output at 2000 chars for context management"
```

---

### Task 2.3: Update getTaskStatus to use stored metadata

**Files:**
- Modify: `server/services/orchestrator-service.ts:387-458` (getTaskStatus function)

- [ ] **Step 1: Write test for stored metadata priority**

```typescript
// Add to server/services/orchestrator-service.test.ts
import { getTaskStatus } from './orchestrator-service.js';
import { getKanbanStore } from '../lib/kanban-store.js';

vi.doMock('../lib/kanban-store.js', () => ({
  getKanbanStore: vi.fn(),
}));

vi.doMock('../lib/gateway-client.js', () => ({
  invokeGatewayTool: vi.fn(),
}));

describe('getTaskStatus', () => {
  it('reads from stored metadata first, live sessions second', async () => {
    const mockStore = {
      getTask: vi.fn(async (id: string) => ({
        id,
        title: 'Test',
        status: 'in-progress',
        labels: ['agent:k8s-agent'],
        metadata: {
          agentOutput: {
            'k8s-agent': {
              status: 'done',
              output: 'Stored output',
              sessionKey: 'stored-123',
            }
          }
        }
      })),
    };
    (getKanbanStore as any).mockReturnValue(mockStore);

    const status = await getTaskStatus('task123');

    expect(status?.agents[0].status).toBe('completed');
    expect(status?.agents[0].output).toBe('Stored output');
  });

  it('falls back to live sessions when no stored output', async () => {
    const mockStore = {
      getTask: vi.fn(async (id: string) => ({
        id,
        title: 'Test',
        status: 'in-progress',
        labels: ['agent:k8s-agent'],
        metadata: { agentOutput: {} }
      })),
    };
    (getKanbanStore as any).mockReturnValue(mockStore);

    const { invokeGatewayTool } = await import('../lib/gateway-client.js');
    (invokeGatewayTool as any).mockResolvedValue({
      active: [],
      recent: [{ label: 'orch-task123-k8s-agent', status: 'running', sessionKey: 'live-123' }]
    });

    const status = await getTaskStatus('task123');

    expect(status?.agents[0].status).toBe('running');
    expect(status?.agents[0].session_key).toBe('live-123');
  });
});
```

- [ ] **Step 2: Update getTaskStatus implementation**

```typescript
// server/services/orchestrator-service.ts:387
export async function getTaskStatus(taskId: string): Promise<TaskStatus | null> {
  const store = getKanbanStore();
  const task = await store.getTask(taskId).catch(() => null);
  if (!task) return null;

  // Get stored agent output from metadata (reliable, persistent)
  const storedOutput = (task.metadata?.agentOutput || {}) as Record<string, any>;

  // Also check live sessions for running agents
  let liveSessions: Array<Record<string, unknown>> = [];
  try {
    const result = await invokeGatewayTool('subagents', {
      action: 'list',
      recentMinutes: 30,
    }, 10000);
    const parsed = result as Record<string, unknown>;
    liveSessions = [
      ...((parsed.active ?? []) as Array<Record<string, unknown>>),
      ...((parsed.recent ?? []) as Array<Record<string, unknown>>),
    ].filter((s) => String(s.label ?? '').startsWith(`orch-${taskId}-`));
  } catch {
    // Gateway unavailable — rely on stored data only
  }

  // Merge: live session data takes priority for running agents,
  // stored metadata takes priority for completed agents
  const agentLabels = task.labels?.filter((l: string) => l.startsWith('agent:')) || [];
  const expectedAgents = agentLabels.map((l: string) => l.replace('agent:', ''));

  const agents = expectedAgents.map((agentName: string) => {
    // Check stored output first
    const stored = storedOutput[agentName];
    if (stored && (stored.status === 'done' || stored.status === 'completed' || stored.status === 'error')) {
      return {
        name: agentName,
        status: stored.status === 'error' ? 'failed' as const : 'completed' as const,
        session_key: stored.sessionKey,
        output: stored.output,
        error: stored.error,
      };
    }

    // Check live sessions
    const live = liveSessions.find((s) =>
      String(s.label ?? '').endsWith(`-${agentName}`)
    );
    if (live) {
      return {
        name: agentName,
        status: mapSessionStatus(String(live.status ?? '')),
        session_key: live.sessionKey as string | undefined,
        output: live.output as string | undefined,
        error: live.error as string | undefined,
      };
    }

    // Not found anywhere — pending or lost
    return {
      name: agentName,
      status: 'pending' as const,
    };
  });

  return {
    task_id: taskId,
    status: task.status,
    column: task.status,
    agents,
    checkpoints: [],
    run: task.run,
  };
}
```

- [ ] **Step 3: Add mapSessionStatus helper if not exists**

```typescript
// Add near top of file with other helpers
function mapSessionStatus(gatewayStatus: string): 'pending' | 'running' | 'completed' | 'failed' {
  switch (gatewayStatus) {
    case 'done':
    case 'completed':
      return 'completed';
    case 'error':
    case 'failed':
      return 'failed';
    case 'running':
    case 'active':
      return 'running';
    default:
      return 'pending';
  }
}
```

- [ ] **Step 4: Run test**

```bash
npm test -- --run server/services/orchestrator-service.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add server/services/orchestrator-service.ts
git commit -m "feat(orchestrator): getTaskStatus reads stored metadata first

- Completed agent output from task.metadata.agentOutput (persistent)
- Live sessions checked as fallback for running agents
- Survives gateway session expiry
- Gracefully handles gateway unavailability"
```

---

### Task 2.4: Implement createProposalsFromFindings

**Files:**
- Modify: `server/services/orchestrator-service.ts` (add function at end)
- Modify: `server/routes/orchestrator.ts:466-512` (update /complete/:id endpoint)

- [ ] **Step 1: Write test for proposal parsing**

```typescript
// Add to server/services/orchestrator-service.test.ts
import { createProposalsFromFindings } from './orchestrator-service.js';
import { getKanbanStore } from '../lib/kanban-store.js';

vi.doMock('../lib/kanban-store.js', () => ({
  getKanbanStore: vi.fn(() => ({
    createProposal: vi.fn(async () => ({ id: 'prop-123' })),
  })),
}));

describe('createProposalsFromFindings', () => {
  it('parses structured JSON proposals', async () => {
    const output = `
Here are the follow-up tasks:

\`\`\`json
{
  "proposals": [
    {
      "title": "Add rate limiting",
      "description": "Implement rate limiting on auth endpoints",
      "severity": "high"
    }
  ]
}
\`\`\`
`;

    const result = await createProposalsFromFindings('task123', 'Test Task', output);

    expect(result.proposals_created).toBeGreaterThan(0);
  });

  it('detects TODO/FIXME patterns', async () => {
    const output = `
Completed the refactoring.

TODO: Update the tests to match new structure
FIXME: Handle edge case in validation
`;

    const result = await createProposalsFromFindings('task123', 'Test Task', output);

    expect(result.proposals_created).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Implement createProposalsFromFindings**

```typescript
// server/services/orchestrator-service.ts: Add at end of file
export async function createProposalsFromFindings(
  taskId: string,
  taskTitle: string,
  combinedOutput: string
): Promise<{ proposals_created: number }> {
  const store = getKanbanStore();
  let created = 0;

  // Strategy 1: Parse structured JSON proposals from agent output
  const jsonBlocks = combinedOutput.matchAll(/```json\s*\n([\s\S]*?)\n```/g);
  for (const match of jsonBlocks) {
    try {
      const parsed = JSON.parse(match[1]);

      // Handle proposals array
      if (Array.isArray(parsed.proposals)) {
        for (const proposal of parsed.proposals) {
          await store.createProposal({
            type: 'create',
            payload: {
              title: proposal.description || proposal.title || `Follow-up from ${taskTitle}`,
              description: JSON.stringify(proposal, null, 2),
              labels: ['auto-generated', `source:${taskId}`],
              priority: proposal.severity === 'critical' ? 'critical' :
                       proposal.severity === 'high' ? 'high' : 'normal',
            },
            proposedBy: 'agent:orchestrator',
            reason: `Generated from task: ${taskTitle}`,
          });
          created++;
        }
      }

      // Handle recommendations array
      if (Array.isArray(parsed.recommendations)) {
        for (const rec of parsed.recommendations) {
          if (typeof rec === 'string' && rec.length > 10) {
            await store.createProposal({
              type: 'create',
              payload: {
                title: rec.substring(0, 100),
                description: `Recommendation from ${taskTitle}:\n\n${rec}`,
                labels: ['recommendation', `source:${taskId}`],
                priority: 'normal',
              },
              proposedBy: 'agent:orchestrator',
              reason: `Recommendation from task: ${taskTitle}`,
            });
            created++;
          }
        }
      }
    } catch {
      // JSON parse failed — skip this block
    }
  }

  // Strategy 2: Look for TODO/FIXME patterns in raw output
  const todoPattern = /(?:TODO|FIXME|FOLLOW-UP|ACTION ITEM)[:\s]+(.+?)(?:\n|$)/gi;
  let todoMatch;
  while ((todoMatch = todoPattern.exec(combinedOutput)) !== null) {
    const item = todoMatch[1].trim();
    if (item.length > 5 && item.length < 200) {
      await store.createProposal({
        type: 'create',
        payload: {
          title: item.substring(0, 100),
          description: `Auto-detected from agent output in task: ${taskTitle}\n\nFull item: ${item}`,
          labels: ['auto-detected', `source:${taskId}`],
          priority: 'normal',
        },
        proposedBy: 'agent:orchestrator',
        reason: `Auto-detected from task: ${taskTitle}`,
      });
      created++;
    }
  }

  return { proposals_created: created };
}
```

- [ ] **Step 3: Run test**

```bash
npm test -- --run server/services/orchestrator-service.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add server/services/orchestrator-service.ts
git commit -m "feat(orchestrator): implement createProposalsFromFindings

- Parse JSON proposals from agent output
- Detect TODO/FIXME patterns as auto-proposals
- Convert recommendations to proposals
- Label with source:taskId for traceability"
```

---

## Phase 3: Goal-Oriented UI

### Task 3.1: Create Goals Dashboard component

**Files:**
- Create: `src/features/goals/GoalsDashboard.tsx`
- Create: `src/features/goals/GoalCard.tsx`
- Create: `src/features/goals/useGoals.ts`
- Create: `src/features/goals/CreateGoalDialog.tsx`

- [ ] **Step 1: Create useGoals hook**

```typescript
// src/features/goals/useGoals.ts
import { useState, useCallback, useEffect } from 'react';

const API_BASE = '/api/orchestrator';

export interface Goal {
  id: string;
  title: string;
  description?: string;
  createdAt: number;
  taskIds: string[];
  targetDate?: number;
  status: 'active' | 'completed' | 'archived';
}

export function useGoals() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchGoals = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/goals`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setGoals(data.goals || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch goals');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  return { goals, loading, error, reload: fetchGoals };
}
```

- [ ] **Step 2: Create GoalCard component**

```typescript
// src/features/goals/GoalCard.tsx
import { memo } from 'react';
import { Target, CheckCircle2, Clock, AlertCircle } from 'lucide-react';

interface GoalCardProps {
  goal: {
    id: string;
    title: string;
    description?: string;
    taskIds: string[];
    completedTaskCount: number;
    targetDate?: number;
    status: 'active' | 'completed' | 'archived';
  };
  onClick: () => void;
}

export const GoalCard = memo(function GoalCard({ goal, onClick }: GoalCardProps) {
  const progress = goal.taskIds.length > 0
    ? Math.round((goal.completedTaskCount / goal.taskIds.length) * 100)
    : 0;

  const isCompleted = progress === 100;
  const isOverdue = goal.targetDate && goal.targetDate < Date.now() && !isCompleted;

  return (
    <div
      className="p-4 rounded-xl border bg-card hover:shadow-lg transition-all cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <Target size={20} className={isCompleted ? 'text-green-400' : 'text-primary'} />
          <h3 className="font-semibold">{goal.title}</h3>
        </div>
        {isCompleted && <CheckCircle2 size={20} className="text-green-400" />}
      </div>

      {goal.description && (
        <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{goal.description}</p>
      )}

      {/* Progress bar */}
      <div className="mb-2">
        <div className="flex justify-between text-xs mb-1">
          <span>{goal.completedTaskCount}/{goal.taskIds.length} tasks</span>
          <span>{progress}%</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full transition-all ${isCompleted ? 'bg-green-400' : 'bg-primary'}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        {isOverdue && (
          <span className="flex items-center gap-1 text-red-400">
            <AlertCircle size={12} />
            Overdue
          </span>
        )}
        {goal.targetDate && (
          <span className="flex items-center gap-1">
            <Clock size={12} />
            {new Date(goal.targetDate).toLocaleDateString()}
          </span>
        )}
      </div>
    </div>
  );
});
```

- [ ] **Step 3: Create GoalsDashboard component**

```typescript
// src/features/goals/GoalsDashboard.tsx
import { useState, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { useGoals } from './useGoals';
import { GoalCard } from './GoalCard';
import { CreateGoalDialog } from './CreateGoalDialog';
import { Button } from '@/components/ui/button';

export function GoalsDashboard() {
  const { goals, loading, error, reload } = useGoals();
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleGoalClick = useCallback((goalId: string) => {
    // Navigate to goal detail view (future enhancement)
    console.log('Goal clicked:', goalId);
  }, []);

  if (loading) {
    return <div className="p-4 text-sm text-muted-foreground">Loading goals...</div>;
  }

  if (error) {
    return <div className="p-4 text-sm text-red-400">Error: {error}</div>;
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Goals</h2>
        <Button onClick={() => setDialogOpen(true)} size="sm">
          <Plus size={16} className="mr-1" />
          New Goal
        </Button>
      </div>

      {goals.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No goals yet. Create one to track your objectives.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {goals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              onClick={() => handleGoalClick(goal.id)}
            />
          ))}
        </div>
      )}

      <CreateGoalDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={reload}
      />
    </div>
  );
}
```

- [ ] **Step 4: Create CreateGoalDialog component**

```typescript
// src/features/goals/CreateGoalDialog.tsx
import { useState, useCallback, useEffect, useRef } from 'react';
import { Target } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface CreateGoalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function CreateGoalDialog({ open, onOpenChange, onSuccess }: CreateGoalDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setTitle('');
      setDescription('');
      setTargetDate('');
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => titleRef.current?.focus(), 120);
      return () => clearTimeout(t);
    }
  }, [open]);

  const handleCreate = useCallback(async () => {
    if (!title.trim() || loading) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/orchestrator/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          targetDate: targetDate ? new Date(targetDate).getTime() : undefined,
        }),
      });

      if (!res.ok) throw new Error('Failed to create goal');

      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create goal');
    } finally {
      setLoading(false);
    }
  }, [title, description, targetDate, loading, onOpenChange, onSuccess]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target size={20} className="text-primary" />
            Create Goal
          </DialogTitle>
          <DialogDescription>
            Define an outcome you want to achieve. Tasks will be grouped under this goal.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label htmlFor="goal-title" className="text-sm font-medium">Title</label>
            <Input
              id="goal-title"
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Deploy MVP to Production"
              maxLength={200}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="goal-description" className="text-sm font-medium">Description</label>
            <textarea
              id="goal-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full min-h-[80px] px-3 py-2 text-sm bg-background border border-input rounded-md focus:outline-none resize-none"
              placeholder="Describe the desired outcome..."
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="goal-date" className="text-sm font-medium">Target Date (optional)</label>
            <Input
              id="goal-date"
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
            />
          </div>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={loading || !title.trim()}>
            {loading ? 'Creating...' : 'Create Goal'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/features/goals/
git commit -m "feat(ui): add Goals Dashboard components

- GoalsDashboard shows all goals in grid layout
- GoalCard displays progress, task count, due date
- CreateGoalDialog for new goal creation
- useGoals hook for API interaction
- Progress bars show completion percentage"
```

---

### Task 3.2: Add action buttons to TaskDetailPanel

**Files:**
- Modify: `src/features/orchestrator/TaskDetailPanel.tsx`

- [ ] **Step 1: Add action handlers to hook**

```typescript
// src/features/orchestrator/useOrchestrator.ts: Add these functions

export function useTaskActions() {
  const { reload: reloadTasks } = useTasks(); // Assuming this exists

  const runReview = useCallback(async (taskId: string) => {
    const res = await fetch(`/api/orchestrator/task/${taskId}/review`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Review failed');
    return res.json();
  }, []);

  const fixIssues = useCallback(async (taskId: string) => {
    const res = await fetch(`/api/orchestrator/task/${taskId}/fix`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Fix failed');
    return res.json();
  }, []);

  const approveTask = useCallback(async (taskId: string) => {
    const res = await fetch(`/api/orchestrator/task/${taskId}/approve`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Approve failed');
    return res.json();
  }, []);

  const rejectTask = useCallback(async (taskId: string) => {
    const res = await fetch(`/api/orchestrator/task/${taskId}/reject`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Reject failed');
    return res.json();
  }, []);

  return { runReview, fixIssues, approveTask, rejectTask };
}
```

- [ ] **Step 2: Add Next Action section to TaskDetailPanel**

```typescript
// src/features/orchestrator/TaskDetailPanel.tsx: Add imports
import { Play, CheckCircle, XCircle, StopCircle, FileText } from 'lucide-react';
import { useTaskActions } from './useOrchestrator';

// Inside component, add actions hook:
const { runReview, fixIssues, approveTask, rejectTask } = useTaskActions();
const [actionLoading, setActionLoading] = useState<string | null>(null);

// Add action handler:
const handleAction = useCallback(async (action: 'review' | 'fix' | 'approve' | 'reject') => {
  setActionLoading(action);
  try {
    switch (action) {
      case 'review':
        await runReview(taskId);
        break;
      case 'fix':
        await fixIssues(taskId);
        break;
      case 'approve':
        await approveTask(taskId);
        break;
      case 'reject':
        await rejectTask(taskId);
        break;
    }
    await fetchHistory(); // Refresh
  } catch (err) {
    setError(err instanceof Error ? err.message : `${action} failed`);
  } finally {
    setActionLoading(null);
  }
}, [taskId, runReview, fixIssues, approveTask, rejectTask, fetchHistory]);

// Add Next Action section in render (after task header):
{history?.task.status === 'review' && (
  <div className="p-4 rounded-xl border bg-card mb-4">
    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
      <FileText size={16} />
      Next Action
    </h3>
    <div className="flex gap-2">
      <Button
        onClick={() => handleAction('review')}
        disabled={actionLoading === 'review'}
        size="sm"
      >
        {actionLoading === 'review' ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
        Run Automated Review
      </Button>
      {history?.pr?.reviewPassed === false && (
        <Button
          onClick={() => handleAction('fix')}
          disabled={actionLoading === 'fix'}
          variant="outline"
          size="sm"
        >
          Fix Issues
        </Button>
      )}
    </div>
    {history?.pr?.reviewComments !== undefined && (
      <p className="text-xs text-muted-foreground mt-2">
        {history.pr.reviewComments} review comments found
      </p>
    )}
  </div>
)}
```

- [ ] **Step 3: Run build**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/features/orchestrator/TaskDetailPanel.tsx src/features/orchestrator/useOrchestrator.ts
git commit -m "feat(ui): add action buttons to TaskDetailPanel

- Next Action section shows context-aware buttons
- Run Automated Review button for review status tasks
- Fix Issues button when review fails
- Approve/Reject buttons for task completion
- Loading states during action execution"
```

---

### Task 3.3: Create backend goals API

**Files:**
- Create: `server/routes/goals.ts`

- [ ] **Step 1: Create goals route**

```typescript
// server/routes/goals.ts
/**
 * Goals API Routes
 *
 * GET  /api/orchestrator/goals      - List all goals
 * POST /api/orchestrator/goals      - Create new goal
 * PUT  /api/orchestrator/goals/:id  - Update goal
 * DELETE /api/orchestrator/goals/:id - Delete goal
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { rateLimitGeneral } from '../middleware/rate-limit.js';
import { getKanbanStore } from '../lib/kanban-store.js';

const app = new Hono();

// Simple file-based goals store (can be enhanced later)
const GOALS_FILE = `${process.env.NERVE_DATA_DIR || '~/.nerve'}/goals.json`;

interface Goal {
  id: string;
  title: string;
  description?: string;
  createdAt: number;
  taskIds: string[];
  targetDate?: number;
  status: 'active' | 'completed' | 'archived';
}

async function readGoals(): Promise<Goal[]> {
  try {
    const fs = await import('node:fs/promises');
    const data = await fs.readFile(GOALS_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function writeGoals(goals: Goal[]): Promise<void> {
  const fs = await import('node:fs/promises');
  await fs.writeFile(GOALS_FILE, JSON.stringify(goals, null, 2));
}

/**
 * GET /api/orchestrator/goals
 */
app.get('/goals', rateLimitGeneral, async (c) => {
  try {
    const goals = await readGoals();

    // Enrich with task completion status
    const store = getKanbanStore();
    const allTasks = await store.listTasks({ limit: 1000 });

    const enrichedGoals = goals.map(goal => {
      const tasks = allTasks.items.filter(t => goal.taskIds.includes(t.id));
      const completedTaskCount = tasks.filter(t => t.status === 'done').length;

      return {
        ...goal,
        completedTaskCount,
        totalTaskCount: tasks.length,
      };
    });

    return c.json({ goals: enrichedGoals });
  } catch (error) {
    console.error('Failed to fetch goals:', error);
    return c.json({ error: 'Failed to fetch goals' }, 500);
  }
});

/**
 * POST /api/orchestrator/goals
 */
app.post('/goals', rateLimitGeneral, async (c) => {
  try {
    const body = await c.req.json();
    const schema = z.object({
      title: z.string().min(1).max(200),
      description: z.string().optional(),
      targetDate: z.number().optional(),
    });

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.flatten() }, 400);
    }

    const goals = await readGoals();
    const newGoal: Goal = {
      id: `goal-${Date.now()}`,
      title: parsed.data.title,
      description: parsed.data.description,
      createdAt: Date.now(),
      taskIds: [],
      targetDate: parsed.data.targetDate,
      status: 'active',
    };

    goals.push(newGoal);
    await writeGoals(goals);

    return c.json({ goal: newGoal }, 201);
  } catch (error) {
    console.error('Failed to create goal:', error);
    return c.json({ error: 'Failed to create goal' }, 500);
  }
});

/**
 * PUT /api/orchestrator/goals/:id
 */
app.put('/goals/:id', rateLimitGeneral, async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const goals = await readGoals();

    const goalIndex = goals.findIndex(g => g.id === id);
    if (goalIndex === -1) {
      return c.json({ error: 'Goal not found' }, 404);
    }

    goals[goalIndex] = {
      ...goals[goalIndex],
      ...body,
      id, // Preserve ID
    };

    await writeGoals(goals);

    return c.json({ goal: goals[goalIndex] });
  } catch (error) {
    console.error('Failed to update goal:', error);
    return c.json({ error: 'Failed to update goal' }, 500);
  }
});

/**
 * DELETE /api/orchestrator/goals/:id
 */
app.delete('/goals/:id', rateLimitGeneral, async (c) => {
  try {
    const id = c.req.param('id');
    const goals = await readGoals();

    const filtered = goals.filter(g => g.id !== id);
    if (filtered.length === goals.length) {
      return c.json({ error: 'Goal not found' }, 404);
    }

    await writeGoals(filtered);

    return c.json({ success: true });
  } catch (error) {
    console.error('Failed to delete goal:', error);
    return c.json({ error: 'Failed to delete goal' }, 500);
  }
});

export default app;
```

- [ ] **Step 2: Mount goals route in app.ts**

```typescript
// server/app.ts: Add import and mount
import goalsRoutes from './routes/goals.js';

// In app creation:
app.route('/api/orchestrator', goalsRoutes);
```

- [ ] **Step 3: Run build**

```bash
npm run build:server
```

- [ ] **Step 4: Commit**

```bash
git add server/routes/goals.ts server/app.ts
git commit -m "feat(server): add goals API endpoints

- GET /api/orchestrator/goals - list all goals with task counts
- POST /api/orchestrator/goals - create new goal
- PUT /api/orchestrator/goals/:id - update goal
- DELETE /api/orchestrator/goals/:id - delete goal
- File-based persistence in NERVE_DATA_DIR"
```

---

## Summary Checklist

**Phase 1: Foundation Reliability**
- [ ] Task 1.1: Fix hardcoded working directory
- [ ] Task 1.2: Fix optimistic commit count
- [ ] Task 1.3: Add structured error codes
- [ ] Task 1.4: Add registry unit tests
- [ ] Task 1.5: Enforce gate modes
- [ ] Task 1.6: Fix recovery tracking

**Phase 2: Event-Driven Architecture**
- [ ] Task 2.1: Add webhook endpoint + session watcher
- [ ] Task 2.2: Implement handoff parsing
- [ ] Task 2.3: Update getTaskStatus for stored metadata
- [ ] Task 2.4: Implement proposal parsing

**Phase 3: Goal-Oriented UI**
- [ ] Task 3.1: Create Goals Dashboard
- [ ] Task 3.2: Add action buttons to TaskDetailPanel
- [ ] Task 3.3: Create goals API

---

*End of Plan*
