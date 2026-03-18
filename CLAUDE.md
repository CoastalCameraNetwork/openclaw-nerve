# CLAUDE.md

Project instructions for AI coding assistants working on Nerve.

## What is Nerve?

Nerve is the web UI and backend server for [OpenClaw](https://github.com/openclaw/openclaw), an AI agent gateway. It provides a chat interface, voice I/O, a kanban task board, multi-agent orchestration, file browsing, and monitoring — all connected to a running OpenClaw gateway that manages AI model sessions.

## Tech stack

- **Frontend:** React 19, TypeScript, Tailwind CSS 4, shadcn/ui, Vite 7
- **Backend:** Hono 4 on Node.js 22+, TypeScript (ESM)
- **Testing:** Vitest, @testing-library/react
- **Linting:** ESLint 9 (flat config), TypeScript-ESLint, React Hooks
- **Build:** Vite for frontend, tsc for server (project references)

## Quick commands

```bash
npm run dev              # Frontend dev server (Vite HMR, port 3080)
npm run dev:server       # Backend dev server (watch mode, port 3081)
npm run build            # Build frontend
npm run build:server     # Build backend
npm run prod             # Build everything + start
npm run lint             # ESLint
npm test -- --run        # Run all tests once
npm run test:coverage    # Tests with coverage report
npm run setup            # Interactive .env configuration wizard
```

## Project structure

```
nerve/
├── src/                          # Frontend
│   ├── features/                 # Feature modules (self-contained)
│   │   ├── chat/                 # Chat panel, messages, streaming, operations/
│   │   ├── voice/                # Push-to-talk, wake word, audio
│   │   ├── tts/                  # Text-to-speech playback and config
│   │   ├── sessions/             # Session list, tree, spawn dialog
│   │   ├── kanban/               # Drag-drop task board, proposals
│   │   ├── orchestrator/         # Agent dashboard, timeline, task creation
│   │   ├── workspace/            # Tabbed panel: memory, crons, skills
│   │   ├── file-browser/         # File tree, tabbed editor
│   │   ├── dashboard/            # Token usage, limits
│   │   ├── settings/             # Settings drawer
│   │   ├── command-palette/      # ⌘K palette
│   │   ├── markdown/             # Markdown renderer
│   │   ├── charts/               # Inline chart extraction
│   │   ├── memory/               # Memory editor
│   │   ├── activity/             # Agent/event logs
│   │   ├── auth/                 # Login, session
│   │   └── connect/              # Gateway connect dialog
│   ├── components/               # Shared UI (ui/ primitives, skeletons/)
│   ├── contexts/                 # ChatContext, SessionContext, GatewayContext, SettingsContext
│   ├── hooks/                    # Shared hooks (WebSocket, SSE, keyboard, etc.)
│   ├── lib/                      # Utilities (formatting, themes, sanitize, constants)
│   ├── types.ts                  # Shared type definitions
│   └── test/                     # Test setup
├── server/                       # Backend
│   ├── routes/                   # Hono route handlers (thin — delegate to services/)
│   ├── services/                 # Business logic (TTS, orchestrator, PR review, Whisper)
│   ├── lib/                      # Utilities (config, gateway-client, kanban-store, mutex, etc.)
│   ├── middleware/               # Auth, rate limiting, security headers, caching
│   ├── app.ts                    # Hono app assembly — all routes mounted here
│   ├── index.ts                  # Server entry point (HTTP/HTTPS, WS proxy, watchers)
│   └── types.ts                  # Server type definitions
├── skills/                       # Agent skill definitions (orchestrator, nerve-kanban)
├── scripts/                      # Setup wizard, installers
├── docs/                         # Documentation
├── config/                       # TypeScript configs for server build
├── vitest.config.ts
├── eslint.config.js
└── vite.config.ts
```

## Architecture

```
Browser ─── Nerve (:3080) ─── OpenClaw Gateway (:18789)
  │            │
  ├─ WS ──────┤  proxied to gateway
  ├─ SSE ─────┤  file watchers, real-time events
  └─ REST ────┘  files, memories, TTS, models, kanban, orchestrator
```

Nerve proxies WebSocket traffic to the OpenClaw gateway and adds its own REST layer for file management, TTS, token tracking, kanban, and orchestration.

## Coding conventions

### TypeScript

- Strict mode everywhere. No `any` — use `unknown` with type narrowing.
- Explicit types on all public interfaces, context values, and hook returns.
- Zod validation on all POST/PUT request bodies (server-side).
- Discriminated unions for message types (via `type` field).

### Server-side (Hono)

- **ESM with `.js` extensions** — all imports must use `.js` even for `.ts` files:
  ```typescript
  import { config } from '../lib/config.js';       // correct
  import { config } from '../lib/config';           // WRONG — fails at runtime
  ```
- Routes export a Hono sub-app, mounted in `server/app.ts`.
- All routes use `rateLimitGeneral` middleware (or a specific limiter).
- Gateway calls go through `invokeGatewayTool()` from `server/lib/gateway-client.js`.
- File I/O that does read-modify-write must use `createMutex()` for atomicity.
- Expensive fetches use `createCachedFetch` for deduplication + TTL cache.
- SSE broadcasts via `broadcast(event, data)` from `server/routes/events.js`.

### Frontend (React)

- Functional components only.
- `useCallback` on all callbacks passed to children or used in dependency arrays.
- `useMemo` on all derived values passed to children.
- Context value always wrapped in `useMemo` with explicit type annotation.
- Ref-based state access in callbacks that shouldn't re-register (e.g., `currentSessionRef`).
- Heavy components lazy-loaded with `React.lazy` + `Suspense` + `PanelErrorBoundary`.
- Pure business logic extracted into `operations/` directories (e.g., `features/chat/operations/`), keeping contexts thin.
- Cross-feature communication goes through context providers, not direct imports.
- `@/` import alias maps to `src/`.

### Naming

- Components: `PascalCase.tsx` (e.g., `ChatPanel.tsx`)
- Hooks: `camelCase.ts` (e.g., `useWebSocket.ts`)
- Utils/services: `camelCase.ts` or `kebab-case.ts` (e.g., `helpers.ts`, `kanban-store.ts`)
- Feature directories: `kebab-case` (e.g., `command-palette/`)
- Contexts: `<Name>Context` with `<Name>Provider` and `use<Name>` hook, co-located in one file
- Types: PascalCase, no `I` prefix

### Commit conventions

[Conventional Commits](https://www.conventionalcommits.org/):
```
<type>(<scope>): <short description>
```
Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`, `ci`
Scopes: `chat`, `tts`, `voice`, `server`, `sessions`, `workspace`, `kanban`, `orchestrator`, etc.

## Key patterns

### Context provider

```tsx
const MyContext = createContext<MyContextValue | null>(null);

export function MyProvider({ children }: { children: ReactNode }) {
  const value = useMemo<MyContextValue>(() => ({ /* ... */ }), [/* deps */]);
  return <MyContext.Provider value={value}>{children}</MyContext.Provider>;
}

export function useMyContext() {
  const ctx = useContext(MyContext);
  if (!ctx) throw new Error('useMyContext must be used within MyProvider');
  return ctx;
}
```

### Hono route

```typescript
import { Hono } from 'hono';
import { z } from 'zod';
import { rateLimitGeneral } from '../middleware/rate-limit.js';

const app = new Hono();

const mySchema = z.object({
  title: z.string().min(1),
  priority: z.enum(['critical', 'high', 'normal', 'low']).default('normal'),
});

app.post('/api/my-thing', rateLimitGeneral, async (c) => {
  const body = await c.req.json();
  const parsed = mySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid request', details: parsed.error.flatten() }, 400);
  }
  // ... business logic
  return c.json({ success: true }, 201);
});

export default app;
```

### Gateway RPC

```typescript
import { invokeGatewayTool } from '../lib/gateway-client.js';

// Spawn a sub-agent
const result = await invokeGatewayTool('sessions_spawn', {
  task: 'Do something',
  label: 'my-task-label',     // max 50 chars
  runtime: 'subagent',
  mode: 'session',             // 'session' = persistent, 'run' = one-shot
  thinking: 'medium',          // 'off' | 'low' | 'medium' | 'high'
  cleanup: 'keep',
}, 30000);                     // timeout in ms
```

### Kanban store

```typescript
const store = getKanbanStore();
const task = await store.createTask({ title, description, status, priority, createdBy, labels });
const updated = await store.updateTask(taskId, version, { title: 'New' }); // CAS — pass version
await store.executeTask(taskId, {}, 'operator');  // todo → in-progress
```
All updates require the current `version` number — mismatches throw `VersionConflictError` (409).

### Mutex-protected file writes

```typescript
import { createMutex } from '../lib/mutex.js';
const withLock = createMutex();

await withLock(async () => {
  const data = await readJSON(path);
  data.push(newEntry);
  await writeJSON(path, data);
});
```

### SSE event subscription (frontend)

```typescript
const { subscribe } = useGateway();

useEffect(() => {
  const unsubscribe = subscribe((event) => {
    if (event.type === 'kanban.updated') refetch();
  });
  return unsubscribe;
}, [subscribe, refetch]);
```

## Testing

Tests are co-located: `foo.ts` → `foo.test.ts` in the same directory.

- Component tests: `@testing-library/react`
- Logic/util tests: plain Vitest
- Route tests: use `vi.doMock()` to mock dependencies, create a Hono app, call `app.request()`
- Pattern reference: `server/lib/kanban-store.test.ts`, `server/routes/memories.test.ts`, `server/routes/events.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies before importing the module under test
vi.doMock('../lib/config.js', () => ({ config: { auth: false, port: 3000 } }));
vi.doMock('../middleware/rate-limit.js', () => ({
  rateLimitGeneral: vi.fn((_c: unknown, next: () => Promise<void>) => next()),
}));
```

## Infrastructure context

### Agent orchestration

Nerve's orchestrator routes tasks to specialist agents defined in `server/lib/agent-registry.ts`. Each agent has a domain, keywords for routing, an optional model override, and a thinking level. Tasks flow through the kanban board: `todo` → `in-progress` (agents run) → `review` → `done`.

Agent models:
- `glm-4.5` — tool-heavy work, cost-efficient
- `qwen3.5-plus` — full-stack code, security review, deep reasoning

### Project registry

`server/lib/project-registry.ts` maps project slugs to local paths and GitHub repos. Used by the orchestrator to tell agents which directory to work in. Projects: mgmt, wp-ccn, wp-hdbc, wp-njbc, wp-nybc, wp-tsv, kubernetes, hls-recorder, splash-scripts, nerve, orchestrator, docs.

### Gate modes

- `audit-only` — agents run freely, everything logged (default)
- `gate-on-write` — file writes require human approval via kanban proposals
- `gate-on-deploy` — deployments require human approval

## What not to do

- Don't use `any`. Use `unknown` + type narrowing.
- Don't use `React.memo` broadly. Use `useMemo`/`useCallback` for stable references.
- Don't import across features directly. Use context providers.
- Don't use `localStorage` in the frontend. Use `sessionStorage` for credentials.
- Don't forget `.js` extensions in server imports.
- Don't skip Zod validation on API endpoints.
- Don't skip rate limiting middleware on public routes.
- Don't use `WidthType.PERCENTAGE` in docx tables (breaks Google Docs).
- Don't put business logic in route handlers. Extract to `services/` or `lib/`.
- Don't create timers/subscriptions without cleanup functions in `useEffect`.

## PR checklist

- [ ] `npm run lint` passes
- [ ] `npm run build && npm run build:server` succeeds
- [ ] `npm test -- --run` passes
- [ ] New features include tests
- [ ] All POST/PUT bodies validated with Zod
- [ ] Rate limiting on new endpoints
- [ ] No `any`, no `@ts-ignore`
- [ ] New state in contexts is `useMemo`/`useCallback`-wrapped
- [ ] Heavy components lazy-loaded if not needed at initial render
- [ ] ESLint annotations with justification when intentionally breaking rules
