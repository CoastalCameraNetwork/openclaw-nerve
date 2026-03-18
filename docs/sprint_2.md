# Sprint 2: Orchestrator Core Improvements

Tasks in this sprint depend on Sprint 1 being complete. Do them in order.

---

## Task 2.1: Replace polling with event-driven task completion

**Priority:** Critical
**Risk:** Medium
**Files:**
- `server/routes/orchestrator.ts`
- `server/routes/events.ts` (for broadcast)
- `server/services/orchestrator-service.ts`
- `src/features/orchestrator/useOrchestrator.ts`

### Context

`getTaskStatus()` polls the gateway's subagent list with a 30-minute window. Problems:
- Long-running tasks (>30min) fall off the list
- Short tasks may complete between polls
- Polling wastes resources
- Status is stale by the time the UI gets it

The codebase already has an SSE event system (`server/routes/events.ts` with `broadcast(event, data)`) and the frontend subscribes to gateway events via `GatewayContext`. We need to use this infrastructure.

### What to do

#### 1. Add a session completion webhook endpoint

Add to `server/routes/orchestrator.ts`:

```typescript
/**
 * POST /api/orchestrator/webhook/session-complete
 * Called when a gateway session completes. Updates task status and stores output.
 * Can be called by a cron/watcher or by the gateway itself.
 */
app.post('/api/orchestrator/webhook/session-complete', rateLimitGeneral, async (c) => {
  try {
    const body = await c.req.json();
    const { sessionLabel, sessionKey, status, output, error } = body;

    // Parse task ID from session label (format: orch-{taskId}-{agentName})
    const match = sessionLabel?.match(/^orch-(.+?)-([^-]+)$/);
    if (!match) {
      return c.json({ error: 'Not an orchestrator session' }, 400);
    }

    const [, taskId, agentName] = match;
    const store = getKanbanStore();
    const task = await store.getTask(taskId).catch(() => null);

    if (!task) {
      return c.json({ error: 'Task not found', code: 'TASK_NOT_FOUND' }, 404);
    }

    // Store agent output in task metadata
    const agentOutput = (task.metadata?.agentOutput || {}) as Record<string, unknown>;
    agentOutput[agentName] = {
      sessionKey,
      status: status || 'done',
      output: typeof output === 'string' ? output.substring(0, 10000) : undefined,
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

    if (allComplete) {
      // Move task to review
      if (task.status === 'in-progress') {
        const updatedTask = await store.getTask(taskId); // re-fetch for latest version
        await store.updateTask(taskId, updatedTask!.version, {
          status: 'review',
        });
      }

      // Broadcast completion event
      const { broadcast } = await import('./events.js');
      broadcast('orchestrator.task_complete', {
        taskId,
        title: task.title,
        agents: Object.entries(agentOutput).map(([name, data]: [string, any]) => ({
          name,
          status: data.status,
          hasOutput: !!data.output,
        })),
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
    return c.json({ error: 'Webhook processing failed', code: 'GATEWAY_ERROR' }, 500);
  }
});
```

#### 2. Add a session polling watcher as a fallback

Create `server/services/session-watcher.ts`:

```typescript
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

      // Store the output via the webhook logic
      // (Call the same endpoint internally, or inline the logic)
      console.log(`[session-watcher] Detected completion: ${label}`);
      // ... invoke the webhook handler or inline the update logic
    }
  } catch {
    // Silent — watcher is best-effort
  }
}
```

#### 3. Wire the watcher into server startup

In the server entry point (wherever the Hono app is created and started), add:

```typescript
import { startSessionWatcher } from './services/session-watcher.js';
// After server starts listening:
startSessionWatcher();
```

#### 4. Frontend: Subscribe to orchestrator events

In `src/features/orchestrator/useOrchestrator.ts`, listen for the `orchestrator.task_complete` SSE event to update the UI without polling:

```typescript
// In useTaskStatus or similar hook
useEffect(() => {
  const unsubscribe = subscribe((event) => {
    if (event.type === 'orchestrator.task_complete' && event.payload?.taskId === taskId) {
      // Refresh task status
      refetch();
    }
  });
  return unsubscribe;
}, [taskId, subscribe, refetch]);
```

### Acceptance criteria

- [ ] Webhook endpoint accepts session completion notifications
- [ ] Agent output is stored in task metadata persistently
- [ ] All-agents-complete detection moves task to review automatically
- [ ] SSE event broadcast notifies the frontend
- [ ] Polling watcher runs as a fallback
- [ ] `npm run build && npm run build:server` compiles without errors

---

## Task 2.2: Structured agent handoff for sequential execution

**Priority:** High
**Risk:** Medium
**Files:**
- `server/services/orchestrator-service.ts`

### Context

Sequential agent execution passes raw output as a truncated string:

```typescript
context += `\n\n${agentName} completed: ${result.output.substring(0, 1000)}`;
```

This loses structure, truncates important data, and gives the next agent no reliable way to parse what the previous one did.

### What to do

#### 1. Define a handoff interface

Add to `server/services/orchestrator-service.ts` (or a new `server/lib/types.ts`):

```typescript
export interface AgentHandoff {
  agent: string;
  status: 'completed' | 'failed';
  summary: string;
  filesChanged: string[];
  recommendations: string[];
  errors: string[];
  rawOutput?: string; // truncated for context window management
}
```

#### 2. Add handoff instructions to agent prompts

When spawning a sequential agent, instruct it to output structured JSON at the end:

```typescript
const handoffInstruction = `

**OUTPUT FORMAT:** At the end of your work, output a structured summary as a JSON code block:
\`\`\`json
{
  "summary": "Brief description of what you did",
  "files_changed": ["path/to/file1.ts", "path/to/file2.ts"],
  "recommendations": ["Follow-up action 1", "Follow-up action 2"],
  "errors": ["Any issues encountered"]
}
\`\`\`
This will be passed to the next agent in the pipeline.`;
```

Add this to the prompt in `executeTask()` when `sequence === 'sequential'`.

#### 3. Parse handoff from previous agent output

Create a parser function:

```typescript
function parseAgentHandoff(agentName: string, output: string): AgentHandoff {
  const handoff: AgentHandoff = {
    agent: agentName,
    status: 'completed',
    summary: '',
    filesChanged: [],
    recommendations: [],
    errors: [],
    rawOutput: output?.substring(0, 2000),
  };

  // Try to extract structured JSON from the output
  const jsonMatch = output?.match(/```json\s*\n([\s\S]*?)\n```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      handoff.summary = parsed.summary || '';
      handoff.filesChanged = parsed.files_changed || [];
      handoff.recommendations = parsed.recommendations || [];
      handoff.errors = parsed.errors || [];
    } catch {
      // JSON parse failed — use raw output as summary
      handoff.summary = output?.substring(0, 500) || 'No output captured';
    }
  } else {
    handoff.summary = output?.substring(0, 500) || 'No output captured';
  }

  return handoff;
}
```

#### 4. Use handoff in sequential execution

Update the sequential execution loop in `executeTask()`:

```typescript
if (sequence === 'sequential' || sequence === 'single') {
  const handoffs: AgentHandoff[] = [];

  for (const agentName of agents) {
    const label = `orch-${taskId}-${agentName}`;

    // Build context from previous handoffs
    let previousContext = '';
    if (handoffs.length > 0) {
      previousContext = '\n\n**PREVIOUS AGENT RESULTS:**\n' +
        handoffs.map(h => `### ${h.agent} (${h.status})
Summary: ${h.summary}
Files changed: ${h.filesChanged.join(', ') || 'none'}
${h.recommendations.length ? 'Recommendations: ' + h.recommendations.join('; ') : ''}
${h.errors.length ? 'Errors: ' + h.errors.join('; ') : ''}`
        ).join('\n\n');
    }

    const prompt = `${taskDescription}${previousContext}${handoffInstruction}${projectContext}${gateInstructions}`;
    const result = await spawnAgentSession(agentName, prompt, label, project?.localPath);

    if (result.session_key) {
      sessionLabels.push(label);
      // Parse handoff for next agent
      if (result.output) {
        handoffs.push(parseAgentHandoff(agentName, result.output));
      }
    }
  }
}
```

### Acceptance criteria

- [ ] Sequential agents receive structured context from predecessors
- [ ] Agent prompts include handoff output format instructions
- [ ] Parser handles both structured JSON and raw text fallback
- [ ] Handoff data includes files_changed, summary, recommendations
- [ ] Existing parallel execution is unaffected
- [ ] `npm run build:server` compiles without errors

---

## Task 2.3: Reliable agent output capture

**Priority:** High
**Risk:** Medium
**Files:**
- `server/services/orchestrator-service.ts`
- `server/routes/orchestrator.ts`
- `server/lib/kanban-store.ts` (types only)

### Context

The `/complete/:id` endpoint tries to collect output by polling the gateway's subagent list up to 60 minutes back. If sessions have expired from the list, output is lost permanently. Task 2.1 introduced the webhook that stores output in metadata — this task ensures all code paths use stored metadata instead of live polling.

### What to do

#### 1. Update `getTaskStatus()` to prefer stored metadata

In `orchestrator-service.ts`, modify `getTaskStatus()`:

```typescript
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

#### 2. Update the `/complete/:id` endpoint to use stored data

In `server/routes/orchestrator.ts`, the complete endpoint should read from metadata instead of polling:

```typescript
app.post('/api/orchestrator/complete/:id', rateLimitGeneral, async (c) => {
  try {
    const taskId = c.req.param('id');
    const store = getKanbanStore();
    const task = await store.getTask(taskId);
    if (!task) {
      return c.json({ error: 'Task not found', code: 'TASK_NOT_FOUND' }, 404);
    }

    // Use stored agent output from metadata
    const agentOutput = (task.metadata?.agentOutput || {}) as Record<string, any>;
    let combinedOutput = '';
    for (const [agentName, data] of Object.entries(agentOutput)) {
      if (data.output) {
        combinedOutput += `\n\n### ${agentName} Output:\n${data.output}`;
      }
    }

    // Fall back to polling only if metadata is empty
    if (!combinedOutput) {
      // ... existing polling logic as fallback ...
    }

    // Create proposals from findings
    const { createProposalsFromFindings } = await import('../services/orchestrator-service.js');
    const result = await createProposalsFromFindings(
      taskId,
      task.title,
      combinedOutput || task.description || ''
    );

    // Update task status to review
    if (task.status === 'in-progress') {
      await store.updateTask(taskId, task.version, { status: 'review' });
    }

    return c.json({
      success: true,
      task_id: taskId,
      status: 'review',
      proposals_created: result.proposals_created,
    });
  } catch (error) {
    console.error('Failed to complete task:', error);
    return c.json({ error: 'Failed to complete task', code: 'GATEWAY_ERROR' }, 500);
  }
});
```

### Acceptance criteria

- [ ] `getTaskStatus()` reads from stored metadata first, live sessions second
- [ ] Completed agent output survives gateway session expiry
- [ ] `/complete/:id` endpoint uses stored data, polls as fallback only
- [ ] Agent output is capped at 10KB per agent to prevent metadata bloat
- [ ] `npm run build:server` compiles without errors

---

## Task 2.4: Proposal parsing from structured agent output

**Priority:** Medium
**Risk:** Medium
**Files:**
- `server/services/orchestrator-service.ts`

### Context

`createProposalsFromFindings()` is imported in the routes but the parsing logic is minimal. With structured handoff data (Task 2.2), we can reliably extract proposals from agent output.

### What to do

#### 1. Implement or improve `createProposalsFromFindings()`

```typescript
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
            proposedBy: `agent:orchestrator`,
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
              proposedBy: `agent:orchestrator`,
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
        proposedBy: `agent:orchestrator`,
        reason: `Auto-detected from task: ${taskTitle}`,
      });
      created++;
    }
  }

  return { proposals_created: created };
}
```

#### 2. Verify the proposal creation API matches the store interface

Check `server/lib/kanban-store.ts` for the `createProposal` method signature and adjust the payload format accordingly. The kanban skill docs show:

```typescript
// POST /api/kanban/proposals
{
  type: 'create',
  payload: { title, description, labels, priority },
  proposedBy: 'agent:name',
  reason: 'string'
}
```

Make sure the fields match.

### Acceptance criteria

- [ ] Structured JSON proposals from agent output are parsed and created
- [ ] Recommendations are converted to proposals
- [ ] TODO/FIXME patterns are detected as proposals
- [ ] Each proposal has a `source:{taskId}` label for traceability
- [ ] Proposal priority maps from agent severity levels
- [ ] `npm run build:server` compiles without errors
