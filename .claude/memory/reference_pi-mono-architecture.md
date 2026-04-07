---
name: pi-mono agent-loop architecture reference
description: Architecture analysis of pi-mono's agent-loop pattern and comparison with OpenClaw orchestrator
type: reference
---

See `docs/architecture/pi-mono-analysis.md` for full analysis.

Key patterns from pi-mono worth considering:
1. Event-driven agent loop with standardized schema (agent_start, turn_start, tool_execution_*, turn_end, agent_end)
2. Steering queue (interrupt while tools running) + follow-up queue (after work completes)
3. Tool hooks: beforeToolCall (can block), afterToolCall (can modify results)
4. Context transformation pipeline: transformContext() for pruning/compaction, convertToLlm() for format conversion
5. Session tree with in-place branching via JSONL + parentId

pi-mono philosophy: keep core minimal, delegate to extensions
OpenClaw philosophy: bake opinionated workflows into core (Plan-First, multi-agent, gates)

Both valid - we can adopt specific patterns without wholesale restructuring.
