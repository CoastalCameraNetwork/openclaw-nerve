# Sprint 1: Reliability & Foundations

All tasks in this sprint are independent — they can be done in any order or in parallel.

---

## Task 1.1: Fix hardcoded working directory in PR review

**Priority:** Critical
**Risk:** Low
**Files:**
- `server/services/pr-review.ts`

### Context

`fixPRIssues()` has a hardcoded working directory path:

```typescript
Working directory: ${process.cwd()}/../ccn-github/mgmt
```

This breaks for any project that isn't `mgmt`. The function already receives `projectType` as a parameter, and the calling code in `server/routes/orchestrator.ts` already detects the project using `detectProject()`, but the local path from the detected project is never passed through.

### What to do

1. Change the `fixPRIssues` function signature to accept the full `ProjectInfo` object (or at least `localPath`) instead of just `projectType`:

```typescript
// BEFORE
export async function fixPRIssues(
  taskId: string,
  prNumber: number,
  report: PRReviewReport,
  projectType?: string
): Promise<{ success: boolean; commits: number; message: string }>

// AFTER
export async function fixPRIssues(
  taskId: string,
  prNumber: number,
  report: PRReviewReport,
  projectType?: string,
  projectLocalPath?: string
): Promise<{ success: boolean; commits: number; message: string }>
```

2. Replace the hardcoded path in the fix prompt:

```typescript
// BEFORE
Working directory: ${process.cwd()}/../ccn-github/mgmt

// AFTER
Working directory: ${projectLocalPath || process.cwd()}
```

3. Update the caller in `server/routes/orchestrator.ts` (the `/api/orchestrator/task/:id/fix` route) to pass `project?.localPath`:

```typescript
const fixResult = await fixPRIssues(
  taskId,
  task.pr.number,
  report,
  project?.type,
  project?.localPath  // ADD THIS
);
```

4. Do the same for `rerunPRReview` — it also receives `projectType` but should get `localPath` too to pass to `runAutomatedPRReview`.

### Acceptance criteria

- [ ] No hardcoded `/ccn-github/mgmt` path remains in `pr-review.ts`
- [ ] Working directory is derived from project registry detection
- [ ] Falls back to `process.cwd()` when no project is detected
- [ ] `npm run build:server` compiles without errors
- [ ] TypeScript types match at all call sites

---

## Task 1.2: Fix optimistic commit count in fixPRIssues

**Priority:** High
**Risk:** Low
**Files:**
- `server/services/pr-review.ts`

### Context

`fixPRIssues()` spawns an agent session and immediately returns `{ success: true, commits: 1 }` before the agent has done anything. The agent runs asynchronously — the 1 is a lie.

### What to do

Change the return value to reflect reality:

```typescript
// BEFORE
return {
  success: true,
  commits: 1, // Agent will commit
  message: `Agent ${agentName} is fixing ${allIssues.length} issues`,
};

// AFTER
return {
  success: true,
  commits: 0, // Agent spawned but hasn't committed yet
  message: `Agent ${agentName} spawned to fix ${allIssues.length} issues. Check task status for progress.`,
  sessionLabel: `pr-${prNumber}-fix`,
};
```

Update the return type to include the optional `sessionLabel`:

```typescript
Promise<{ success: boolean; commits: number; message: string; sessionLabel?: string }>
```

Update the route handler in `server/routes/orchestrator.ts` (`/api/orchestrator/task/:id/fix`) to return the session label so the UI can track it:

```typescript
return c.json({
  success: true,
  message: fixResult.message,
  commits: fixResult.commits,
  sessionLabel: fixResult.sessionLabel,
  status: 'fixing',
});
```

### Acceptance criteria

- [ ] `commits` field is `0` when returning from `fixPRIssues`
- [ ] Response includes `sessionLabel` for status tracking
- [ ] `npm run build:server` compiles without errors

---

## Task 1.3: Add structured error codes to orchestrator API

**Priority:** High
**Risk:** Low
**Files:**
- `server/routes/orchestrator.ts`

### Context

All error responses are `{ error: 'Failed to ...' }` with no structured codes. The UI can't distinguish between "task not found" and "gateway timeout" and "agent spawn failure".

### What to do

1. Create an error code enum at the top of the file (or in a shared types file):

```typescript
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
} as const;
```

2. Update each error response to include a `code` field. Go through every `c.json({ error: ... })` call in the file. Examples:

```typescript
// Task not found
return c.json({ error: 'Task not found', code: ErrorCode.TASK_NOT_FOUND }, 404);

// No agents assigned
return c.json({ error: 'Task has no agent assignments', code: ErrorCode.NO_AGENTS }, 400);

// No project detected
return c.json({ error: 'Cannot create PR: No project detected', code: ErrorCode.NO_PROJECT }, 400);

// Gateway/spawn failures (in catch blocks)
return c.json({
  error: `Failed to execute task: ${(error as Error).message}`,
  code: ErrorCode.GATEWAY_ERROR,
}, 500);
```

3. Pattern to follow — look at how `server/routes/kanban.ts` handles `VersionConflictError`:

```typescript
if (error instanceof VersionConflictError) {
  return c.json({
    error: 'version_conflict',
    serverVersion: error.serverVersion,
    latest: error.latest,
  }, 409);
}
```

### Acceptance criteria

- [ ] Every `c.json({ error: ... })` in `orchestrator.ts` includes a `code` field
- [ ] HTTP status codes are correct (404 for not found, 400 for bad request, 500 for server errors)
- [ ] Error messages include relevant context (task ID, agent name, etc.)
- [ ] `npm run build:server` compiles without errors

---

## Task 1.4: Add unit tests for agent-registry and project-registry

**Priority:** High
**Risk:** Low
**Files to create:**
- `server/lib/agent-registry.test.ts`
- `server/lib/project-registry.test.ts`

**Pattern to follow:**
- `server/lib/kanban-store.test.ts`

### Context

`routeTask()`, `detectProject()`, `listAgents()`, and `getAgent()` have zero test coverage. These are pure functions that are easy to test.

### What to do

#### agent-registry.test.ts

```typescript
import { describe, it, expect } from 'vitest';
import { routeTask, listAgents, getAgent } from './agent-registry.js';

describe('agent-registry', () => {
  describe('listAgents', () => {
    it('returns all registered agents', () => {
      const agents = listAgents();
      expect(agents.length).toBeGreaterThan(0);
      // Verify known agents exist
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

    it('matches streaming tasks to parallel agents', () => {
      const result = routeTask('Wowza stream is offline, check HLS');
      expect(result.agents.length).toBeGreaterThanOrEqual(1);
      // Streaming + HLS tasks may route to parallel
      if (result.agents.length > 1) {
        expect(result.sequence).toBe('parallel');
      }
    });
  });
});
```

#### project-registry.test.ts

```typescript
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
      expect(project!.localPath).toBe('/ccn-github/mgmt');
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
      // Label says mgmt but description says wordpress
      const project = detectProject('wordpress plugin update', ['project:mgmt']);
      expect(project!.name).toBe('MGMT Platform');
    });
  });
});
```

### Run the tests

```bash
npm test -- --run server/lib/agent-registry.test.ts server/lib/project-registry.test.ts
```

### Acceptance criteria

- [ ] Both test files exist and run with `npm test -- --run`
- [ ] All tests pass
- [ ] Coverage of routing rules, fallback behavior, and project detection
- [ ] Tests follow the Vitest + co-located pattern used in the codebase

---

## Task 1.5: Enforce gate mode in task execution

**Priority:** Critical
**Risk:** Medium
**Files:**
- `server/services/orchestrator-service.ts`
- `server/lib/kanban-store.ts` (for proposal creation)

### Context

The orchestrator defines three gate modes (`audit-only`, `gate-on-write`, `gate-on-deploy`) and stores them in task metadata. However, `executeTask()` always spawns agents in the same way regardless of gate mode. The agents run with no restrictions.

For `gate-on-write` and `gate-on-deploy`, the system should instruct agents to use proposals for destructive actions.

### What to do

1. In `executeTask()`, modify the prompt sent to agents based on the gate mode. Add gate mode instructions to the task prompt:

```typescript
function buildGateInstructions(gateMode: string): string {
  switch (gateMode) {
    case 'gate-on-write':
      return `\n\n**GATE MODE: gate-on-write**
You MUST NOT directly write, create, or modify files. Instead, describe the changes you would make and their rationale. Your output will be reviewed before any changes are applied.
If you need to make file changes, output them as a structured proposal in this format:
\`\`\`json
{"proposals": [{"type": "file_write", "path": "path/to/file", "description": "what and why", "diff_summary": "brief diff"}]}
\`\`\``;

    case 'gate-on-deploy':
      return `\n\n**GATE MODE: gate-on-deploy**
You may read files and make code changes freely. However, you MUST NOT execute any deployment commands (kubectl apply, docker push, git push, npm publish, service restarts, etc.).
If deployment is needed, output a deployment proposal:
\`\`\`json
{"proposals": [{"type": "deploy", "target": "service/environment", "commands": ["cmd1", "cmd2"], "description": "what this deploys"}]}
\`\`\``;

    default: // audit-only
      return ''; // No restrictions
  }
}
```

2. Use it when building the prompt in `executeTask()`:

```typescript
const gateInstructions = buildGateInstructions(gateMode || 'audit-only');
const fullPrompt = workingDir
  ? `**WORKING DIRECTORY:** ${workingDir}\n...${prompt}${gateInstructions}`
  : `${prompt}${gateInstructions}`;
```

3. The `executeTask` function needs to receive the gate mode. Update its signature:

```typescript
export async function executeTask(
  taskId: string,
  taskDescription: string,
  agents: string[],
  sequence: 'single' | 'sequential' | 'parallel',
  project?: ProjectInfo | null,
  gateMode?: 'audit-only' | 'gate-on-write' | 'gate-on-deploy'
): Promise<{ session_labels: string[] }>
```

4. Update the caller in `server/routes/orchestrator.ts` (`/api/orchestrator/execute/:id`) to pass the gate mode from the task's labels or metadata:

```typescript
// Extract gate mode from task labels
const gateLabel = task.labels?.find((l: string) => l.startsWith('gate:'));
const gateMode = gateLabel ? gateLabel.replace('gate:', '') : 'audit-only';

const result = await executeTask(
  taskId,
  task.description || task.title,
  agents,
  sequence,
  project,
  gateMode as 'audit-only' | 'gate-on-write' | 'gate-on-deploy'
);
```

### Acceptance criteria

- [ ] Gate mode instructions are included in agent prompts
- [ ] `audit-only` adds no restrictions (backward compatible)
- [ ] `gate-on-write` tells agents to propose file changes
- [ ] `gate-on-deploy` tells agents to propose deployments
- [ ] Gate mode is passed from task metadata to execution
- [ ] `npm run build:server` compiles without errors

---

## Task 1.6: Fix recovery generation tracking on reconnect

**Priority:** Medium
**Risk:** Low
**Files:**
- `src/hooks/useChatRecovery.ts`

### Context

The `recoveryGenerationRef` counter prevents stale recovery results from overwriting fresh data. It's bumped when a session switches or a `chat_final` is applied. However, it's NOT bumped on WebSocket reconnect. This means a recovery initiated before a disconnect could complete after reconnect and overwrite newer data.

PR #87 fixed stale `onclose` handlers, but the recovery guard has the same class of bug.

### What to do

1. The hook needs access to the connection state or a reconnect signal. Add a `bumpGeneration` function to the hook's return value:

```typescript
const bumpGeneration = useCallback(() => {
  recoveryGenerationRef.current += 1;
}, []);

return useMemo(() => ({
  // ... existing returns
  bumpGeneration,
}), [/* ... existing deps, bumpGeneration */]);
```

2. In `ChatContext.tsx`, call `bumpGeneration()` when the gateway reconnects. Look for where `connectionState` changes to `'connected'` — there should be an effect that fires on reconnect:

```typescript
// In the reconnect handling section of ChatContext
useEffect(() => {
  if (connectionState === 'connected') {
    recovery.bumpGeneration();
  }
}, [connectionState, recovery]);
```

3. Alternatively, if the hook already watches `wasGeneratingAtDisconnectRef`, you can bump the generation when that ref transitions from true to false on reconnect.

### Acceptance criteria

- [ ] Recovery generation counter increments on reconnect
- [ ] Stale recovery results (initiated before disconnect) are discarded
- [ ] Normal recovery after reconnect still works
- [ ] `npm run build` compiles without errors
- [ ] No new ESLint warnings
