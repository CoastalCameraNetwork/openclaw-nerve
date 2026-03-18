---
name: orchestrator
description: OpenClaw Orchestrator integration for Nerve. Coordinate CCN specialist agents via the kanban board with hybrid routing, agent execution, and audit trails.
---

# OpenClaw Orchestrator Skill for Nerve

This skill integrates the OpenClaw Orchestrator with Nerve's kanban system, enabling visual task tracking and multi-agent coordination for CCN infrastructure work.

## Overview

The orchestrator routes tasks to specialist agents based on task description, then executes them via the OpenClaw Gateway. Tasks appear on the Nerve kanban board with full visibility into agent interactions.

## Specialist Agents

| Agent | Domain | Triggers |
|-------|--------|----------|
| `k8s-agent` | Kubernetes | k8s, kubernetes, pod, deployment, namespace, pvc |
| `mgmt-agent` | MGMT Platform | mgmt, management, console, dashboard |
| `wordpress-agent` | WordPress | wordpress, wp-, plugin, theme, php |
| `streaming-agent` | Streaming | stream, wowza, hls, rtmp, broadcast |
| `hls-recorder-agent` | HLS Recording | record, recording, dvr, archive, ffmpeg |
| `splash-scripts-agent` | Video Automation | splash, video, youtube, social |
| `database-agent` | Database | database, db, mariadb, mysql, migration, schema |
| `storage-agent` | Storage | storage, nfs, backup, restore, volume, s3 |
| `cdn-agent` | CDN | cdn, bunny, cloudflare, cache, purge |
| `cicd-agent` | CI/CD | ci/cd, github actions, workflow, docker, deploy |
| `security-reviewer` | Security | security, audit, vulnerability, review, pr |

## API Endpoints

All endpoints are under `/api/orchestrator/` on the Nerve server.

### POST /api/orchestrator/start

Create a new orchestrated task.

**Request:**
```json
{
  "title": "Deploy mgmt to staging",
  "description": "Deploy the mgmt platform to staging environment with latest changes",
  "gate_mode": "gate-on-deploy",
  "priority": "high",
  "execute_immediately": false,
  "maxCostUSD": 0.50
}
```

**Response:**
```json
{
  "success": true,
  "task_id": "kb-20260314-143000-abc123",
  "orchestrator_id": "orch-1710446400-abc123",
  "title": "Deploy mgmt to staging",
  "agents": ["k8s-agent", "mgmt-agent", "cicd-agent"],
  "sequence": "sequential",
  "gate_mode": "gate-on-deploy",
  "routing": {
    "rule_id": "deploy-mgmt",
    "fallback_used": false
  },
  "status": "todo"
}
```

**Optional `maxCostUSD`:** Set a budget limit. When cumulative agent cost exceeds this amount, agents are paused and a proposal alert is created for human review.

### GET /api/orchestrator/status/:id

Get task status with agent session details.

**Response:**
```json
{
  "success": true,
  "task_id": "kb-20260314-143000-abc123",
  "status": "in-progress",
  "column": "in-progress",
  "agents": [
    {
      "name": "k8s-agent",
      "status": "completed",
      "session_key": "sess-abc123",
      "output": "Deployment created successfully"
    },
    {
      "name": "mgmt-agent",
      "status": "running",
      "session_key": "sess-def456"
    }
  ],
  "checkpoints": [
    { "timestamp": "2026-03-14T14:30:00Z", "event": "task_created" },
    { "timestamp": "2026-03-14T14:30:05Z", "event": "agent_dispatched", "agent": "k8s-agent" }
  ]
}
```

### GET /api/orchestrator/agents

List all available specialist agents.

**Response:**
```json
{
  "success": true,
  "agents": [
    {
      "name": "k8s-agent",
      "domain": "Kubernetes",
      "description": "Kubernetes deployments, LKE, PVCs, namespaces, CronJobs",
      "keywords": ["k8s", "kubernetes", "pod", "deployment"]
    },
    ...
  ]
}
```

### POST /api/orchestrator/route

Preview routing for a task (dry-run, no task created). Returns selected agents and recommended model based on task complexity.

**Request:**
```json
{
  "description": "Update WordPress plugin for site performance"
}
```

**Response:**
```json
{
  "success": true,
  "agents": ["wordpress-agent"],
  "sequence": "single",
  "gate_mode": "audit-only",
  "rule_id": "wordpress-plugin",
  "fallback_used": false,
  "model": "glm-4.5",
  "agent_details": [
    {
      "name": "wordpress-agent",
      "domain": "WordPress",
      "description": "WordPress sites, plugins, themes"
    }
  ]
}
```

**Model Selection:**
The `model` field contains the recommended model based on:
1. **Rule override** — Matching routing rules can force a specific model
2. **Complexity analysis** — Tasks are scored on description length, keywords, multi-agent requirements, and domain type
   - `qwen3.5-plus`: Complex tasks (security audits, migrations, multi-agent deployments, long descriptions)
   - `glm-4.5`: Simple tasks (API calls, routine operations, short descriptions)
3. **Agent default** — Falls back to the agent's configured model

### POST /api/orchestrator/cancel/:id

Cancel a running task and kill associated agent sessions.

**Response:**
```json
{
  "success": true,
  "task_id": "kb-20260314-143000-abc123",
  "status": "cancelled"
}
```

### POST /api/orchestrator/execute/:id

Execute a kanban task (spawn agent sessions). Called when user clicks "Execute" on a task.

**Response:**
```json
{
  "success": true,
  "task_id": "kb-20260314-143000-abc123",
  "status": "in-progress",
  "session_labels": ["orch-kb-abc123-k8s-agent", "orch-kb-abc123-mgmt-agent"],
  "agents": ["k8s-agent", "mgmt-agent"]
}
```

### POST /api/orchestrator/webhook/session-complete

Webhook endpoint called by OpenClaw Gateway when a session completes. Captures agent output, token usage, and broadcasts SSE events.

**Request:**
```json
{
  "session_key": "orch-kb-abc123-k8s-agent",
  "status": "done",
  "output": "...",
  "tokens": {
    "input": 1000,
    "output": 500,
    "cost": 0.003
  }
}
```

**Behavior:**
- Stores agent output in task metadata
- Captures token usage for cost tracking
- Broadcasts `orchestrator.task_complete` SSE event for real-time UI updates
- Triggers next agent in sequential mode
- Moves task to "review" column when all agents complete

### GET /api/orchestrator/task/:id/history

Returns execution history including audit log, agent outputs, and state transitions.

**Response:**
```json
{
  "task": {
    "id": "kb-20260314-143000-abc123",
    "title": "Deploy mgmt to staging",
    "status": "in-progress",
    "priority": "high",
    "labels": ["agent:k8s-agent", "agent:mgmt-agent"],
    "createdAt": 1710446400000,
    "updatedAt": 1710446500000
  },
  "agents": [
    {
      "name": "k8s-agent",
      "status": "completed",
      "output": "Deployment created successfully",
      "tokens": {
        "input": 1000,
        "output": 500,
        "cost": 0.003
      },
      "completedAt": 1710446450000
    }
  ],
  "auditLog": [
    {
      "ts": 1710446400000,
      "action": "created",
      "actor": "operator"
    },
    {
      "ts": 1710446410000,
      "action": "executed",
      "actor": "orchestrator"
    }
  ],
  "pr": null
}
```

### GET /api/orchestrator/stats

Returns time-bucketed statistics for the orchestrator dashboard.

**Query Parameters:**
- `range`: Time range (`today-local`, `24h-rolling`, `7d-rolling`, etc.)

**Response:**
```json
{
  "range": "24h-rolling",
  "since": "2026-03-16T23:00:00Z",
  "activeAgents": 5,
  "completedInPeriod": 12,
  "totalTasks": 15,
  "failedTasks": 1,
  "inProgress": 2,
  "inReview": 1,
  "buckets": [
    { "time": "00:00", "created": 2, "completed": 1 },
    { "time": "01:00", "created": 1, "completed": 2 }
  ],
  "agentUsage": [
    { "agent": "k8s-agent", "count": 8 },
    { "agent": "mgmt-agent", "count": 5 }
  ],
  "agentCosts": [
    {
      "agent": "k8s-agent",
      "inputTokens": 5000,
      "outputTokens": 2500,
      "cost": 0.015
    }
  ]
}
```

## Usage Examples

### Via Nerve UI

1. Open Nerve dashboard at `http://192.168.4.44:3080`
2. Navigate to Kanban board
3. Click "New Orchestrated Task"
4. Enter task title and description
5. Preview routing to see which agents will be selected
6. Choose gate mode (audit-only, gate-on-write, gate-on-deploy)
7. Click "Create Task"
8. Task appears in "Todo" column
9. Click "Execute" to start agent sessions
10. Watch agent progress in real-time
11. Review results and approve/reject

### Via API

```bash
# Create a task
curl -X POST http://localhost:3080/api/orchestrator/start \
  -H "Authorization: Bearer $NERVE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Security review of mgmt auth",
    "description": "Audit mgmt platform authentication and API endpoints for vulnerabilities",
    "gate_mode": "audit-only",
    "priority": "high"
  }'

# Check status
curl http://localhost:3080/api/orchestrator/status/kb-20260314-143000-abc123 \
  -H "Authorization: Bearer $NERVE_TOKEN"

# Preview routing
curl -X POST http://localhost:3080/api/orchestrator/route \
  -H "Authorization: Bearer $NERVE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Update WordPress plugin for site performance"
  }'
```

## Routing Logic

Tasks are routed using a hybrid approach:

1. **Rules-based matching** (first) - Pattern match against `ROUTING_RULES` in `agent-registry.ts`
2. **Heuristic fallback** (second) - Keyword matching against agent keyword lists

### Example Routing Rules

| Pattern | Agents | Sequence | Gate Mode |
|---------|--------|----------|-----------|
| `deploy.*mgmt` | k8s-agent, mgmt-agent, cicd-agent | sequential | gate-on-deploy |
| `wordpress.*plugin` | wordpress-agent | single | audit-only |
| `k8s\|kubernetes.*deploy` | k8s-agent | single | gate-on-deploy |
| `wowza\|stream.*offline` | streaming-agent, hls-recorder-agent | parallel | audit-only |
| `security.*audit` | security-reviewer | single | audit-only |

## Gate Modes

- **audit-only**: Auto-execute all actions, log everything (default)
- **gate-on-write**: Require approval before file writes via kanban proposals
- **gate-on-deploy**: Require approval before deployments via kanban proposals

Gate mode instructions are injected into agent prompts via `buildGateInstructions()` in `orchestrator-service.ts`. Each mode provides clear operational constraints:

| Mode | Agent Capabilities |
|------|-------------------|
| audit-only | Read-only analysis, no file changes |
| gate-on-write | Full execution except file writes require approval |
| gate-on-deploy | Full development, deployment requires approval |

## Task Workflow

```
1. Create task → "Todo" column
2. Execute task → "In-Progress" column, agent sessions spawn
3. Agents run → Real-time status updates via SSE events
4. Agents complete → Webhook captures output, task → "Review" column
5. User reviews → Approve (→ "Done") or Reject (→ "Todo")
```

### Real-time Updates

The orchestrator broadcasts real-time events via Server-Sent Events (SSE):

- **Session Watcher**: Polls Gateway every 5 seconds for session status
- **Webhook**: Gateway calls `/api/orchestrator/webhook/session-complete` on session end
- **SSE Event**: `orchestrator.task_complete` broadcast triggers dashboard auto-refresh

Frontend components subscribe via `useServerEvents()` hook for live updates.

### Structured Agent Handoff

For sequential agent execution, output is parsed into structured handoff data:

```typescript
interface AgentHandoff {
  agent: string;
  status: 'completed' | 'failed';
  summary: string;           // AI-generated summary of work done
  filesChanged: string[];    // List of modified files
  recommendations: string[]; // Suggestions for next agent
  errors: string[];          // Any errors encountered
  rawOutput?: string;        // Truncated raw output for context
}
```

The `parseAgentHandoff()` function extracts JSON blocks from agent output, enabling efficient context passing between sequential agents without token bloat.

## Integration with Kanban

Orchestrated tasks are stored in the same kanban store as regular tasks, with additional metadata:

```typescript
{
  id: "kb-20260314-143000-abc123",
  title: "Deploy mgmt to staging",
  description: "...",
  column: "todo",
  metadata: {
    type: "orchestrated",
    agents: ["k8s-agent", "mgmt-agent", "cicd-agent"],
    sequence: "sequential",
    gate_mode: "gate-on-deploy",
    routing: {
      rule_id: "deploy-mgmt",
      fallback_used: false
    }
  }
}
```

## Files

- `server/routes/orchestrator.ts` - API route handlers
- `server/services/orchestrator-service.ts` - Business logic, agent execution
- `server/lib/agent-registry.ts` - Agent definitions and routing rules
- `skills/orchestrator/SKILL.md` - This documentation

## Troubleshooting

### Task not executing
- Check that task is in "todo" or "in-progress" column
- Verify Gateway token is valid in Nerve `.env`
- Check Nerve server logs for agent spawn errors

### Agents not selected correctly
- Review task description for clearer keywords
- Use `/api/orchestrator/route` to preview routing
- Add custom routing rules in `agent-registry.ts`

### Session not appearing in status
- Sessions may take a few seconds to register
- Check Gateway subagent list directly: `subagents action=list`
- Verify session label matches pattern `orch-{taskId}-{agentName}`
