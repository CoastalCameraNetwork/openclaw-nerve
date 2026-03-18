# Sprint 3: Dashboard & Visibility

Depends on Sprint 2 (agent output capture must work for dashboard data).

---

## Task 3.1: Wire time-range selector and add token charts to orchestrator dashboard

**Priority:** High
**Risk:** Medium
**Files:**
- `src/features/orchestrator/OrchestratorDashboard.tsx`
- `src/features/orchestrator/useOrchestrator.ts`
- `server/routes/orchestrator.ts`
- `server/routes/tokens.ts`

### Context

The orchestrator dashboard has a time range selector (`TimeRangeOption` with values like `today-local`, `24h-rolling`, `7d-rolling`) but it doesn't filter anything. The stats cards show placeholder data. The token usage section shows raw numbers but no charts.

The `recharts` library is already in the dependency tree (`package-lock.json` has it). The `TokenUsage` widget in `src/features/dashboard/TokenUsage.tsx` shows how token data is currently displayed.

### What to do

#### 1. Add a time-bucketed token stats endpoint

Add to `server/routes/orchestrator.ts` or `server/routes/tokens.ts`:

```typescript
/**
 * GET /api/orchestrator/stats?range=24h-rolling
 * Returns time-bucketed statistics for the orchestrator dashboard.
 */
app.get('/api/orchestrator/stats', rateLimitGeneral, async (c) => {
  const range = c.req.query('range') || 'today-local';
  const store = getKanbanStore();

  // Calculate time window
  const now = Date.now();
  let since: number;
  switch (range) {
    case 'today-local':
      since = new Date().setHours(0, 0, 0, 0);
      break;
    case 'today-utc':
      since = new Date(new Date().toISOString().split('T')[0]).getTime();
      break;
    case '24h-rolling': since = now - 24 * 60 * 60 * 1000; break;
    case '48h-rolling': since = now - 48 * 60 * 60 * 1000; break;
    case '72h-rolling': since = now - 72 * 60 * 60 * 1000; break;
    case '7d-rolling': since = now - 7 * 24 * 60 * 60 * 1000; break;
    case '14d-rolling': since = now - 14 * 24 * 60 * 60 * 1000; break;
    case '30d-rolling': since = now - 30 * 24 * 60 * 60 * 1000; break;
    default: since = new Date().setHours(0, 0, 0, 0);
  }

  // Get all tasks and filter by time
  const allTasks = await store.listTasks({ limit: 200 });
  const tasksInRange = allTasks.items.filter(t => t.createdAt >= since);

  // Build stats
  const stats = {
    range,
    since: new Date(since).toISOString(),
    activeAgents: 0,
    completedInPeriod: tasksInRange.filter(t => t.status === 'done').length,
    totalTasks: tasksInRange.length,
    failedTasks: tasksInRange.filter(t => t.status === 'cancelled').length,
    inProgress: tasksInRange.filter(t => t.status === 'in-progress').length,
    inReview: tasksInRange.filter(t => t.status === 'review').length,
    // Time-bucketed data for charts (bucket by hour for <72h, by day for longer)
    buckets: buildTimeBuckets(tasksInRange, since, now, range),
    // Agent frequency
    agentUsage: buildAgentUsage(tasksInRange),
  };

  return c.json(stats);
});

function buildTimeBuckets(
  tasks: any[],
  since: number,
  now: number,
  range: string
): Array<{ time: string; created: number; completed: number }> {
  const useHourly = ['today-local', 'today-utc', '24h-rolling', '48h-rolling', '72h-rolling'].includes(range);
  const bucketMs = useHourly ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const buckets: Array<{ time: string; created: number; completed: number }> = [];

  for (let t = since; t < now; t += bucketMs) {
    const bucketEnd = t + bucketMs;
    const label = useHourly
      ? new Date(t).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })
      : new Date(t).toLocaleDateString('en', { month: 'short', day: 'numeric' });
    buckets.push({
      time: label,
      created: tasks.filter(task => task.createdAt >= t && task.createdAt < bucketEnd).length,
      completed: tasks.filter(task =>
        task.status === 'done' && task.updatedAt >= t && task.updatedAt < bucketEnd
      ).length,
    });
  }

  return buckets;
}

function buildAgentUsage(tasks: any[]): Array<{ agent: string; count: number }> {
  const counts: Record<string, number> = {};
  for (const task of tasks) {
    const agentLabels = task.labels?.filter((l: string) => l.startsWith('agent:')) || [];
    for (const label of agentLabels) {
      const agent = label.replace('agent:', '');
      counts[agent] = (counts[agent] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .map(([agent, count]) => ({ agent, count }))
    .sort((a, b) => b.count - a.count);
}
```

#### 2. Add a stats fetch hook

In `src/features/orchestrator/useOrchestrator.ts`, add:

```typescript
export function useOrchestratorStats(timeRange: TimeRangeOption) {
  const [stats, setStats] = useState<OrchestratorStats | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/orchestrator/stats?range=${timeRange}`);
      if (res.ok) {
        setStats(await res.json());
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [timeRange]);

  useEffect(() => {
    fetchStats();
    const iv = setInterval(fetchStats, 60_000); // refresh every minute
    return () => clearInterval(iv);
  }, [fetchStats]);

  return { stats, loading, refetch: fetchStats };
}

interface OrchestratorStats {
  range: string;
  since: string;
  activeAgents: number;
  completedInPeriod: number;
  totalTasks: number;
  failedTasks: number;
  inProgress: number;
  inReview: number;
  buckets: Array<{ time: string; created: number; completed: number }>;
  agentUsage: Array<{ agent: string; count: number }>;
}
```

#### 3. Add recharts to the dashboard

In `OrchestratorDashboard.tsx`, replace the static stats with live data and add a task activity chart:

```typescript
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

// Inside the component:
const { stats, loading: statsLoading } = useOrchestratorStats(timeRange);

// Replace the hardcoded StatCard values with:
// stats.activeAgents, stats.completedInPeriod, stats.totalTasks, etc.

// Add a chart section:
{stats?.buckets && stats.buckets.length > 0 && (
  <div className="p-4 rounded-xl border bg-card">
    <h3 className="text-sm font-semibold mb-3">Task activity</h3>
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={stats.buckets}>
        <XAxis dataKey="time" tick={{ fontSize: 11 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
        <Tooltip />
        <Bar dataKey="created" fill="var(--color-text-info)" name="Created" />
        <Bar dataKey="completed" fill="var(--color-text-success)" name="Completed" />
      </BarChart>
    </ResponsiveContainer>
  </div>
)}
```

### Acceptance criteria

- [ ] Time range selector filters dashboard stats
- [ ] Stats endpoint returns time-bucketed data
- [ ] Bar chart renders task activity over time using recharts
- [ ] Agent usage breakdown is displayed
- [ ] Dashboard auto-refreshes every 60 seconds
- [ ] `npm run build` compiles without errors

---

## Task 3.2: Task detail panel with execution history

**Status:** ✅ COMPLETE

**Priority:** High
**Risk:** Medium
**Files to create:**
- `src/features/orchestrator/TaskDetailPanel.tsx`

**Files to modify:**
- `src/features/orchestrator/OrchestratorDashboard.tsx`
- `server/routes/orchestrator.ts`

### Context

When you click a task in the dashboard, there's no detailed view showing the execution timeline, agent outputs, review history, and state transitions. The kanban store has an audit log (`AuditEntry` with `ts`, `action`, `taskId`, `actor`, `detail`) but it's not exposed to the UI.

### What to do

#### 1. Add an audit log endpoint

In `server/routes/orchestrator.ts`:

```typescript
/**
 * GET /api/orchestrator/task/:id/history
 * Returns execution history including audit log, agent outputs, and state transitions.
 */
app.get('/api/orchestrator/task/:id/history', rateLimitGeneral, async (c) => {
  try {
    const taskId = c.req.param('id');
    const store = getKanbanStore();
    const task = await store.getTask(taskId);

    if (!task) {
      return c.json({ error: 'Task not found', code: 'TASK_NOT_FOUND' }, 404);
    }

    // Get audit entries for this task
    const auditLog = await store.getAuditLog(taskId);

    // Get stored agent output
    const agentOutput = (task.metadata?.agentOutput || {}) as Record<string, any>;

    return c.json({
      task: {
        id: task.id,
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        labels: task.labels,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        assignee: task.assignee,
      },
      agents: Object.entries(agentOutput).map(([name, data]: [string, any]) => ({
        name,
        status: data.status,
        output: data.output?.substring(0, 5000), // Truncate for response size
        error: data.error,
        completedAt: data.completedAt,
        sessionKey: data.sessionKey,
      })),
      auditLog: auditLog || [],
      pr: task.pr || null,
    });
  } catch (error) {
    console.error('Failed to get task history:', error);
    return c.json({ error: 'Failed to get task history', code: 'GATEWAY_ERROR' }, 500);
  }
});
```

**Note:** Check if `getAuditLog(taskId)` exists on the `KanbanStore` class. If not, you'll need to add a method that reads the audit file and filters by taskId. The store already writes to an audit path (`this.auditPath`), so read it and filter:

```typescript
async getAuditLog(taskId?: string): Promise<AuditEntry[]> {
  try {
    const data = await fs.readFile(this.auditPath, 'utf8');
    const entries: AuditEntry[] = data
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line));
    return taskId
      ? entries.filter(e => e.taskId === taskId)
      : entries;
  } catch {
    return [];
  }
}
```

#### 2. Create the TaskDetailPanel component

Create `src/features/orchestrator/TaskDetailPanel.tsx`:

```typescript
/**
 * TaskDetailPanel — Detailed view of a single orchestrator task.
 * Shows execution timeline, agent outputs, audit log, and PR status.
 */
import { useState, useEffect, useCallback } from 'react';
import { Clock, CheckCircle2, AlertCircle, FileText, GitPullRequest, User } from 'lucide-react';

interface TaskHistory {
  task: {
    id: string;
    title: string;
    description: string;
    status: string;
    priority: string;
    labels: string[];
    createdAt: number;
    updatedAt: number;
  };
  agents: Array<{
    name: string;
    status: string;
    output?: string;
    error?: string;
    completedAt?: number;
  }>;
  auditLog: Array<{
    ts: number;
    action: string;
    actor?: string;
    detail?: string;
  }>;
  pr?: {
    number: number;
    url?: string;
    reviewComments?: number;
  } | null;
}

interface TaskDetailPanelProps {
  taskId: string;
  onClose: () => void;
}

export function TaskDetailPanel({ taskId, onClose }: TaskDetailPanelProps) {
  const [history, setHistory] = useState<TaskHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/orchestrator/task/${taskId}/history`);
      if (res.ok) {
        setHistory(await res.json());
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [taskId]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  if (loading) {
    return <div className="p-4 text-sm text-muted-foreground">Loading task history...</div>;
  }

  if (!history) {
    return <div className="p-4 text-sm text-muted-foreground">Task not found.</div>;
  }

  // ... render task details, agent outputs, audit timeline
  // Follow patterns from AgentTimeline.tsx for styling
}
```

The component should display:
- Task header (title, status badge, priority, labels)
- Agent execution cards (expandable, showing output when clicked)
- Audit log timeline (chronological, with icons per action type)
- PR status section (if task has a PR)

Follow the styling patterns in `AgentTimeline.tsx` and `KanbanQuickView.tsx`.

#### 3. Wire it into the dashboard

In `OrchestratorDashboard.tsx`, add a state for the selected task and render the panel:

```typescript
const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

// In the sessions/tasks list, make items clickable:
onClick={() => setSelectedTaskId(session.taskId)}

// Render the detail panel (as a drawer or overlay):
{selectedTaskId && (
  <TaskDetailPanel
    taskId={selectedTaskId}
    onClose={() => setSelectedTaskId(null)}
  />
)}
```

### Acceptance criteria

- [x] `/api/orchestrator/task/:id/history` returns task, agents, audit log
- [x] `getAuditLog(taskId)` method works on kanban store
- [x] Task detail panel renders when clicking a task
- [x] Agent outputs are expandable/collapsible
- [x] Audit log shows chronological timeline of state changes
- [x] `npm run build && npm run build:server` compiles (pre-existing App.tsx error unrelated)

---

## Task 3.3: Per-agent token breakdown

**Status:** ✅ COMPLETE

**Priority:** Medium
**Risk:** Low
**Files:**
- `server/routes/tokens.ts`
- `src/features/orchestrator/OrchestratorDashboard.tsx`

### Context

Token tracking in `server/routes/tokens.ts` aggregates by provider (openai, anthropic, etc.) but the orchestrator dashboard needs per-agent-per-task breakdown to understand cost distribution across agents.

### What to do

#### 1. Add agent cost tracking to task metadata

When the session watcher (Task 2.1) captures session completion, include token usage from the session transcript. The session `.jsonl` files contain cost entries — scan them for the agent's session.

Add a helper in `server/routes/tokens.ts`:

```typescript
/**
 * Get token usage for a specific session label by scanning its JSONL transcript.
 */
export async function getSessionTokenUsage(sessionLabel: string): Promise<{
  inputTokens: number;
  outputTokens: number;
  cost: number;
} | null> {
  // Session transcripts are in config.sessionsDir
  // Find the file matching the session label
  // Parse JSONL lines for cost/token entries
  // Return aggregated totals
  // Follow the same scanning pattern as scanSessionCosts()
}
```

#### 2. Store per-agent costs in task metadata

When capturing agent output in the webhook (Task 2.1), also capture tokens:

```typescript
agentOutput[agentName] = {
  ...existingData,
  tokens: {
    input: tokenUsage?.inputTokens || 0,
    output: tokenUsage?.outputTokens || 0,
    cost: tokenUsage?.cost || 0,
  },
};
```

#### 3. Expose in the stats endpoint

Add an `agentCosts` field to the `/api/orchestrator/stats` response:

```typescript
agentCosts: expectedAgents.map(agent => ({
  agent,
  inputTokens: storedOutput[agent]?.tokens?.input || 0,
  outputTokens: storedOutput[agent]?.tokens?.output || 0,
  cost: storedOutput[agent]?.tokens?.cost || 0,
}))
```

#### 4. Display in the dashboard

Add a simple cost breakdown table or chart showing cost per agent. Can use the same `BarChart` from recharts.

### Acceptance criteria

- [x] Per-agent token usage is captured and stored
- [x] Stats endpoint returns agent cost breakdown
- [x] Dashboard displays per-agent cost visualization
- [x] `npm run build && npm run build:server` compiles (pre-existing App.tsx error unrelated)

---

## Task 3.4: Cost budgets per task

**Status:** ✅ COMPLETE

**Priority:** Low
**Risk:** Low
**Files:**
- `server/services/orchestrator-service.ts`
- `server/routes/orchestrator.ts`
- `src/features/orchestrator/CreateOrchestratedTaskDialog.tsx`

### Context

There's no way to limit how much an orchestrated task can spend. An agent with `thinking: 'high'` on a large codebase could burn through significant tokens.

### What to do

#### 1. Add `maxCostUSD` field to task creation

In the Zod schema for `/api/orchestrator/start`:

```typescript
maxCostUSD: z.number().positive().optional(), // e.g. 0.50
```

Store it in the kanban task's metadata.

#### 2. Check cost budget during execution

In the session watcher (or webhook), after updating agent costs, check if cumulative cost exceeds the budget:

```typescript
const totalCost = Object.values(agentOutput)
  .reduce((sum, a: any) => sum + (a.tokens?.cost || 0), 0);

if (task.metadata?.maxCostUSD && totalCost >= task.metadata.maxCostUSD) {
  // Create a proposal alerting the operator
  await store.createProposal({
    type: 'create',
    payload: {
      title: `Budget exceeded for: ${task.title}`,
      description: `Task cost $${totalCost.toFixed(3)} exceeds budget of $${task.metadata.maxCostUSD}. Agents have been paused.`,
      labels: ['budget-alert', `source:${taskId}`],
      priority: 'high',
    },
    proposedBy: 'agent:orchestrator',
    reason: 'Cost budget exceeded',
  });

  // Cancel running agents
  await cancelTask(taskId);
  // Move task to review for human decision
  await store.updateTask(taskId, task.version, { status: 'review' });
}
```

#### 3. Add budget field to the create task dialog

In `CreateOrchestratedTaskDialog.tsx`, add an optional budget input field.

### Acceptance criteria

- [x] Task creation accepts optional `maxCostUSD`
- [x] Running tasks are paused when budget is exceeded
- [x] Operator is notified via kanban proposal
- [x] Budget field appears in the create task dialog
- [x] `npm run build && npm run build:server` compiles
