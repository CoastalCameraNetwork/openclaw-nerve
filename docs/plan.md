# Nerve Feature Fix & Gap Fill — Master Plan

**Project:** openclaw-nerve (Nerve UI)
**Model:** qwen3.5-plus via OpenClaw
**Planning:** Claude Opus
**Date:** 2026-03-17
**Current version:** 1.4.8

---

## How to use these files

Each sprint has its own markdown with numbered tasks. Tasks are ordered by dependency — do them in order within each sprint. Each task includes:

- **Context**: Why this matters
- **Files to modify**: Exact paths
- **What to do**: Step-by-step instructions with code patterns
- **Acceptance criteria**: How to verify the fix
- **Patterns to follow**: Existing code in the repo that shows the right approach

Start with `SPRINT-1.md` (reliability). Each task is designed to be a single focused PR.

---

## Architecture quick reference

```
nerve/
├── src/                        # Frontend (React 19 + TypeScript + Vite 7)
│   ├── features/               # Feature modules (co-located)
│   │   ├── orchestrator/       # Dashboard, agent timeline, task creation
│   │   ├── kanban/             # Task board, drag-drop, proposals
│   │   ├── chat/               # Chat panel, messages, streaming
│   │   ├── dashboard/          # Token usage widget
│   │   └── ...
│   ├── contexts/               # React contexts (Chat, Session, Gateway, Settings)
│   ├── hooks/                  # Shared hooks
│   └── lib/                    # Utilities
├── server/                     # Backend (Hono 4 on Node.js)
│   ├── routes/                 # API route handlers
│   │   ├── orchestrator.ts     # /api/orchestrator/* endpoints
│   │   ├── kanban.ts           # /api/kanban/* endpoints
│   │   ├── tokens.ts           # /api/tokens endpoint
│   │   └── ...
│   ├── services/               # Business logic
│   │   ├── orchestrator-service.ts  # Task routing, agent execution
│   │   └── pr-review.ts        # PR review and fix workflow
│   └── lib/                    # Server utilities
│       ├── agent-registry.ts   # Agent definitions, routing rules
│       ├── project-registry.ts # Project path/repo mappings
│       ├── kanban-store.ts     # Kanban persistence (JSON file + mutex)
│       ├── gateway-client.ts   # OpenClaw gateway RPC
│       └── usage-tracker.ts    # Persistent token tracking
├── skills/                     # Agent skill definitions
│   ├── orchestrator/SKILL.md
│   └── nerve-kanban/SKILL.md
└── docs/                       # Documentation
```

## Key patterns in the codebase

- **Zod validation** on all API request bodies (server-side)
- **Hono** for HTTP routing (not Express)
- **Vitest** for testing (not Jest)
- **CAS versioning** on kanban tasks (optimistic concurrency)
- **Gateway RPC** via `invokeGatewayTool(toolName, args, timeout)`
- **SSE broadcast** via `broadcast(event, data)` from `server/routes/events.ts`
- **TypeScript strict mode** everywhere
- **ESM imports** with `.js` extensions in server code

## Sprint overview

| Sprint | Focus | Tasks | Risk |
|--------|-------|-------|------|
| 1 | Reliability & foundations | 6 tasks | Low — bug fixes, tests |
| 2 | Orchestrator core | 4 tasks | Medium — new features |
| 3 | Dashboard & visibility | 4 tasks | Medium — frontend + API |
| 4 | Polish & advanced | 4 tasks | Low — nice-to-haves |

## Dependencies between sprints

- Sprint 2 task "structured handoff" depends on Sprint 1 "error handling"
- Sprint 3 "dashboard charts" depends on Sprint 2 "agent output capture"
- Sprint 4 "multi-model routing" depends on Sprint 2 "webhook completions"

Everything in Sprint 1 is independent and can be parallelized.
