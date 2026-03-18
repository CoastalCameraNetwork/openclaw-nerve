# Nerve Codebase Quick Reference

Use this as a cheat sheet when implementing tasks. It covers imports, patterns, and gotchas specific to this codebase.

---

## Server-side imports

All server imports use `.js` extensions (ESM):

```typescript
// Correct
import { getKanbanStore } from '../lib/kanban-store.js';
import { invokeGatewayTool } from '../lib/gateway-client.js';
import { detectProject } from '../lib/project-registry.js';
import { routeTask, listAgents, getAgent } from '../lib/agent-registry.js';
import { rateLimitGeneral } from '../middleware/rate-limit.js';
import { config } from '../lib/config.js';
import { broadcast } from './events.js';

// Wrong (will fail at runtime)
import { getKanbanStore } from '../lib/kanban-store';
```

## Hono route patterns

```typescript
import { Hono } from 'hono';
const app = new Hono();

// GET with query params
app.get('/api/something', rateLimitGeneral, async (c) => {
  const param = c.req.query('param');
  return c.json({ data: 'value' });
});

// POST with JSON body
app.post('/api/something', rateLimitGeneral, async (c) => {
  const body = await c.req.json();
  // Validate with Zod
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid request', details: parsed.error.flatten() }, 400);
  }
  return c.json({ success: true }, 201);
});

// URL params
app.get('/api/thing/:id', async (c) => {
  const id = c.req.param('id');
});

export default app;
```

## Zod validation

```typescript
import { z } from 'zod';

const mySchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  priority: z.enum(['critical', 'high', 'normal', 'low']).optional().default('normal'),
  maxCostUSD: z.number().positive().optional(),
});
```

## Kanban store operations

```typescript
const store = getKanbanStore();

// CRUD
const task = await store.createTask({ title, description, status, priority, createdBy, labels });
const task = await store.getTask(taskId);
const updated = await store.updateTask(taskId, version, { title: 'New title' });
await store.deleteTask(taskId, version);

// Query
const { items, total, hasMore } = await store.listTasks({ status: ['todo'], limit: 50 });

// Workflow
await store.executeTask(taskId, metadata, actor); // todo → in-progress
await store.approveTask(taskId, version, actor);  // review → done
await store.rejectTask(taskId, version, actor);   // review → todo
await store.abortTask(taskId, version, actor);    // in-progress → todo

// Proposals
await store.createProposal({ type, payload, proposedBy, reason });
await store.approveProposal(proposalId);
await store.rejectProposal(proposalId);

// Config
const config = await store.getConfig();
await store.updateConfig({ reviewRequired: false });

// Versioning — ALWAYS pass version for updates
// Throws VersionConflictError if stale
```

## Gateway RPC

```typescript
import { invokeGatewayTool } from '../lib/gateway-client.js';

// Spawn a sub-agent
const result = await invokeGatewayTool('sessions_spawn', {
  task: 'prompt text',
  label: 'session-label',
  runtime: 'subagent',
  mode: 'session',      // 'session' = persistent, 'run' = one-shot
  thinking: 'medium',   // 'off' | 'low' | 'medium' | 'high'
  cleanup: 'keep',
  model: 'qwen3.5-plus', // optional model override
}, 30000); // timeout in ms

// List sub-agents
const result = await invokeGatewayTool('subagents', {
  action: 'list',
  recentMinutes: 30,
}, 10000);

// Parse the response
const parsed = result as Record<string, unknown>;
const active = (parsed.active ?? []) as Array<Record<string, unknown>>;
const recent = (parsed.recent ?? []) as Array<Record<string, unknown>>;
```

## SSE broadcast

```typescript
import { broadcast } from './events.js';

// Broadcast to all connected clients
broadcast('orchestrator.task_complete', {
  taskId: 'abc123',
  title: 'Deploy to staging',
});

// Event types already in use:
// 'kanban.updated', 'memory.updated', 'file.changed',
// 'tokens.updated', 'status.changed'
```

## Test patterns (Vitest)

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Co-locate tests: file.ts → file.test.ts (same directory)

// Mocking modules (for route tests)
vi.doMock('../lib/config.js', () => ({
  config: { auth: false, port: 3000 },
}));
vi.doMock('../middleware/rate-limit.js', () => ({
  rateLimitGeneral: vi.fn((_c: unknown, next: () => Promise<void>) => next()),
}));

// Run tests
// npm test -- --run                    # all tests, single run
// npm test -- --run server/lib/*.test  # specific pattern
// npm run test:coverage                # with coverage
```

## Frontend patterns

### Hooks

```typescript
// Always memoize callbacks
const doThing = useCallback(async () => {
  // ...
}, [dep1, dep2]);

// Always memoize derived values
const filtered = useMemo(() => items.filter(x => x.active), [items]);
```

### Fetching data

```typescript
// Pattern used throughout the codebase
const [data, setData] = useState<DataType | null>(null);
const [loading, setLoading] = useState(false);

const fetchData = useCallback(async () => {
  setLoading(true);
  try {
    const res = await fetch('/api/endpoint');
    if (res.ok) {
      setData(await res.json());
    }
  } catch { /* silent */ }
  finally { setLoading(false); }
}, []);

useEffect(() => {
  fetchData();
}, [fetchData]);
```

### Subscribing to SSE events (via GatewayContext)

```typescript
import { useGateway } from '@/contexts/GatewayContext';

const { subscribe } = useGateway();

useEffect(() => {
  const unsubscribe = subscribe((event) => {
    if (event.type === 'kanban.updated') {
      refetch();
    }
  });
  return unsubscribe;
}, [subscribe, refetch]);
```

## Build commands

```bash
npm run build            # frontend (Vite)
npm run build:server     # backend (TypeScript)
npm run prod             # both builds + start
npm run dev              # frontend dev server (Vite HMR, port 3080)
npm run dev:server       # backend dev server (watch mode, port 3081)
npm run lint             # ESLint
npm test -- --run        # Vitest, single run
npm run test:coverage    # Vitest with coverage
```

## File naming conventions

- Components: `PascalCase.tsx` (e.g., `TaskDetailPanel.tsx`)
- Hooks: `camelCase.ts` (e.g., `useOrchestrator.ts`)
- Utils/services: `camelCase.ts` (e.g., `orchestrator-service.ts`, `helpers.ts`)
- Tests: same name + `.test.ts` (e.g., `kanban-store.test.ts`)
- Types: inline or in `types.ts` per feature directory

## Gotchas

1. **Always use `.js` extension** in server-side imports (ESM requirement)
2. **CAS versioning** — kanban updates need the current `version` number or you get 409
3. **Gateway timeouts** — default is 8s, spawning agents needs 30s, some operations need 60s
4. **Session labels** — max 50 chars, gateway truncates silently
5. **Metadata field** — kanban tasks have a generic `metadata` object for extensibility. Cast as needed: `task.metadata as any`
6. **Rate limiting** — apply `rateLimitGeneral` to all public endpoints
7. **No `any`** — use `unknown` with type narrowing. Existing code has some `any` but new code should avoid it
8. **React memo patterns** — don't use `React.memo` broadly; use `useMemo`/`useCallback` for stable references
9. **Lazy loading** — heavy components use `React.lazy` + `Suspense` + `PanelErrorBoundary`
10. **ESLint** — must pass before PR. Run `npm run lint` and fix all issues
