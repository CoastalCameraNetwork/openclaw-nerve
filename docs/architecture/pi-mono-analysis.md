# pi-mono Architecture Analysis

## Overview

Analyzed [badlogic/pi-mono](https://github.com/badlogic/pi-mono) to understand the "agent-loop" architecture the user referenced. This is a monorepo containing tools for building AI agents and managing LLM deployments.

## Key Packages

| Package | Description |
|---------|-------------|
| `@mariozechner/pi-ai` | Unified multi-provider LLM API (OpenAI, Anthropic, Google, etc.) |
| `@mariozechner/pi-agent-core` | Agent runtime with tool calling and state management |
| `@mariozechner/pi-coding-agent` | Interactive coding agent CLI |
| `@mariozechner/pi-tui` | Terminal UI library with differential rendering |
| `@mariozechner/pi-web-ui` | Web components for AI chat interfaces |

## Agent Loop Architecture

The core agent execution is in `packages/agent/src/agent-loop.ts`. Key concepts:

### Event-Driven Agent Loop

```
agent_start
├── turn_start
│   ├── message_start (user)
│   ├── message_end (user)
│   ├── message_start (assistant)
│   ├── message_update (streaming chunks)
│   ├── message_end (assistant)
│   ├── tool_execution_start
│   ├── tool_execution_update (optional progress)
│   ├── tool_execution_end
│   └── turn_end
└── agent_end
```

**Key insight**: The loop processes messages in "turns" - one LLM call + tool executions = one turn. Multiple turns happen in a single agent run.

### Steering and Follow-up Queues

```typescript
// Steering: interrupt while tools are running
agent.steer({ role: "user", content: "Do this instead" });

// Follow-up: queue for after current work completes
agent.followUp({ role: "user", content: "Also do this" });
```

- **Steering messages** are injected before the next assistant response
- **Follow-up messages** are checked only when agent would otherwise stop
- Both modes configurable: `"one-at-a-time"` or `"all"`

### Tool Execution Hooks

```typescript
beforeToolCall: async ({ toolCall, args, context }) => {
  if (toolCall.name === "bash") {
    return { block: true, reason: "bash is disabled" };
  }
}

afterToolCall: async ({ toolCall, result, isError, context }) => {
  if (!isError) {
    return { details: { ...result.details, audited: true } };
  }
}
```

### Context Transformation Pipeline

```
AgentMessage[] → transformContext() → AgentMessage[] → convertToLlm() → Message[] → LLM
                    (optional)                           (required)
```

- `transformContext`: Prune old messages, inject external context, compaction
- `convertToLlm`: Filter out UI-only messages, convert custom types to LLM format

### Parallel vs Sequential Tool Execution

```typescript
toolExecution: "parallel" | "sequential"
```

- **Parallel** (default): Preflight sequentially, execute concurrently
- **Sequential**: Execute one by one in order

## Comparison with OpenClaw Nerve

### Similarities

| Feature | pi-mono | OpenClaw Nerve |
|---------|---------|----------------|
| Agent execution | `agentLoop()` | `executeTask()` in orchestrator-service |
| Tool hooks | `beforeToolCall`, `afterToolCall` | Agent signals extraction |
| Event streaming | EventSink pattern | SSE broadcast via `events.js` |
| Session tree | JSONL with parentId | Session files in filesystem |
| Compaction | Built-in with overflow recovery | Not yet implemented |

### Differences

| Aspect | pi-mono | OpenClaw Nerve |
|--------|---------|----------------|
| Architecture | Single agent, multiple tools | Multi-agent orchestration |
| Sub-agents | "No built-in sub-agents" (by design) | Core feature via OpenClaw gateway |
| Plan mode | "No plan mode" (use extensions) | Plan-First workflow built-in |
| State management | `Agent.state` mutable ref | Kanban store + task metadata |
| Gate modes | Extension-based | Built-in: audit-only, gate-on-write, gate-on-deploy |
| UI | Terminal-first (TUI) | Web-first (React) |

## What We Can Learn/Adopt

### 1. Event Schema Standardization

pi-mono has a well-defined event schema that flows through the agent lifecycle. Our SSE events are more ad-hoc.

**Recommendation**: Standardize our event types to match a similar schema:
```typescript
type OrchestratorEvent =
  | { type: 'task_start'; taskId: string }
  | { type: 'agent_start'; taskId: string; agentName: string }
  | { type: 'agent_turn_start'; taskId: string }
  | { type: 'tool_execution_start'; toolName: string; args: unknown }
  | { type: 'tool_execution_end'; result: unknown; isError: boolean }
  | { type: 'agent_turn_end'; output: string }
  | { type: 'agent_end'; taskId: string; success: boolean }
  | { type: 'task_end'; taskId: string; status: string };
```

### 2. Steering/Follow-up Pattern for Long-Running Tasks

Our agents can run for hours. Currently no way to interrupt or add follow-up work without cancelling.

**Recommendation**: Add steering queue to task execution:
```typescript
interface TaskExecutionContext {
  steeringQueue: AgentMessage[];
  followUpQueue: AgentMessage[];
}

// Check for interrupts between turns
if (context.steeringQueue.length > 0) {
  const steering = context.steeringQueue.shift();
  await injectSteeringMessage(taskId, steering);
}
```

### 3. Hook-Based Tool Interception

Our `beforeToolCall`/`afterToolCall` pattern in comprehensive-pr-review is similar but not integrated into the core execution path.

**Recommendation**: Make hooks part of the orchestrator execution context:
```typescript
interface OrchestratorConfig {
  beforeToolCall?: (params: { task, agent, toolName, args }) => Promise<BlockingResult>;
  afterToolCall?: (params: { task, agent, toolName, result }) => Promise<ResultModification>;
}
```

### 4. Context Transformation Pipeline

Our agents don't have message compaction. Long sessions will eventually hit context limits.

**Recommendation**: Add `transformContext` hook for:
- Message pruning (keep last N turns)
- Auto-compaction on overflow
- External context injection (file watching, etc.)

### 5. Session Tree with In-Place Branching

pi-mono stores sessions as JSONL with `id` and `parentId`, enabling branching without new files.

**Recommendation**: Our session files already support this via sessionKey naming. Add explicit tree navigation:
```typescript
// Navigate to any point in session history and continue
POST /api/sessions/:sessionId/branch-from/:messageId
```

## What pi-mono Explicitly Avoids (and why)

From their README:

> **No sub-agents.** There's many ways to do this. Spawn pi instances via tmux, or build your own with extensions.

> **No plan mode.** Write plans to files, or build it with extensions, or install a package.

> **No permission popups.** Run in a container, or build your own confirmation flow.

Their philosophy: **keep core minimal, delegate complexity to extensions**.

OpenClaw Nerve has the opposite philosophy: **bake workflows into the core** (Plan-First, multi-agent orchestration, gate modes).

Both are valid - pi-mono optimizes for extensibility, we optimize for opinionated workflows.

## Key Takeaway

The "agent-loop" pattern is essentially a state machine with:
1. **Event emission** at each state transition
2. **Hooks** for interception (beforeToolCall, afterToolCall)
3. **Queues** for async interrupts (steering, follow-up)
4. **Context transformation** for managing token limits

We don't need to adopt pi-mono wholesale, but these patterns could improve our orchestrator's flexibility and observability.
