# OpenClaw Orchestrator + Nerve Integration Plan

## Overview

Integrate the standalone OpenClaw Orchestrator into Nerve's existing kanban system to provide:
- Web-based task dashboard
- Visual agent interaction tracking
- Kanban workflow (backlog → todo → in-progress → review → done)
- Proposal/approval system for gated actions

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Nerve Web UI                           │
│  - Kanban board with task columns                          │
│  - Agent activity feed                                     │
│  - Task details with subagent timeline                     │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   Nerve Server (Port 3080)                  │
│  /api/kanban/*        - Existing task management            │
│  /api/orchestrator/*  - New orchestrator endpoints          │
│    - POST /start      - Create task, route to agents        │
│    - GET  /status/:id - Get task + agent status             │
│    - GET  /agents     - List available specialist agents    │
│    - POST /route      - Preview routing for a task          │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              OpenClaw Gateway (subagents API)               │
│  - Spawns specialist agents via sessions_spawn             │
│  - Returns session status/history                          │
└─────────────────────────────────────────────────────────────┘
```

## Specialist Agents

| Agent | Domain | Triggers |
|-------|--------|----------|
| `k8s-agent` | Kubernetes, LKE, deployments, PVCs | k8s, kubernetes, pod, deployment, namespace, pvc |
| `mgmt-agent` | MGMT platform (Fastify/React/Drizzle) | mgmt, management, console, dashboard |
| `wordpress-agent` | 6 WordPress sites, plugins, themes | wordpress, wp-, plugin, theme, php |
| `streaming-agent` | Wowza, RTMP/HLS, nginx-rtmp | stream, wowza, hls, rtmp, broadcast |
| `hls-recorder-agent` | HLS recording, FFmpeg, DVR | record, recording, dvr, archive |
| `splash-scripts-agent` | Video automation, YouTube, social | splash, video, youtube, social |
| `database-agent` | MariaDB, Drizzle, migrations | database, db, mariadb, mysql, migration, schema |
| `storage-agent` | NFS, PVCs, backups, S3 | storage, nfs, backup, restore, volume, s3 |
| `cdn-agent` | BunnyCDN, Cloudflare, cache | cdn, bunny, cloudflare, cache, purge |
| `cicd-agent` | GitHub Actions, Docker, pipelines | ci/cd, github actions, workflow, docker, deploy |
| `security-reviewer` | Pre-merge security audits | security, audit, vulnerability, review, pr |

## Routing Logic

1. **Rules-based matching** (first) - Pattern match task description
2. **LLM fallback** (second) - Query n8n memory for similar tasks
3. **Heuristic fallback** (third) - Keyword-based agent selection

## Task Workflow

```
1. User creates task via Nerve UI or CLI
   └─→ POST /api/orchestrator/start { title, description, gate_mode }

2. Orchestrator routes to specialist agents
   └─→ Router selects agents based on task description

3. Kanban task created in "todo" column
   └─→ Task metadata includes: agents[], sequence, gate_mode

4. User or auto-policy executes task
   └─→ POST /api/kanban/tasks/:id/execute
   └─→ Task moves to "in-progress"
   └─→ Gateway spawns subagent session(s)

5. Agent(s) run, report progress via session history
   └─→ Nerve polls session status every 5s
   └─→ Agent log updates in real-time

6. Agent completes, task moves to "review"
   └─→ Result parsed for kanban markers
   └─→ Proposals created if needed

7. User reviews and approves/rejects
   └─→ POST /api/kanban/tasks/:id/approve → "done"
   └─→ POST /api/kanban/tasks/:id/reject → "todo"
```

## File Structure

```
/root/nerve/
├── server/
│   ├── routes/
│   │   ├── orchestrator.ts    # New: Orchestrator API routes
│   │   └── kanban.ts          # Existing: Kanban API (updated)
│   ├── services/
│   │   └── orchestrator-service.ts  # New: Routing + agent execution
│   └── lib/
│       └── agent-registry.ts        # New: Specialist agent definitions
├── skills/
│   └── orchestrator/
│       └── SKILL.md                 # New: Nerve skill for orchestrator
├── src/
│   ├── components/
│   │   └── kanban/
│   │       ├── AgentTimeline.tsx    # New: Agent activity timeline
│   │       └── TaskAgentPanel.tsx   # New: Agent selection preview
│   └── pages/
│       └── KanbanBoard.tsx          # Existing: Updated with orchestrator
└── docs/
    └── ORCHESTRATOR_INTEGRATION.md  # This file
```

## API Endpoints

### POST /api/orchestrator/start
Create a new orchestrated task.

**Request:**
```json
{
  "title": "Deploy mgmt to staging",
  "description": "Deploy the mgmt platform to staging environment with latest changes",
  "gate_mode": "gate-on-deploy",
  "priority": "high",
  "column": "todo"
}
```

**Response:**
```json
{
  "task_id": "kb-20260314-143000-abc123",
  "title": "Deploy mgmt to staging",
  "status": "todo",
  "agents": ["k8s-agent", "mgmt-agent", "cicd-agent"],
  "sequence": "sequential",
  "gate_mode": "gate-on-deploy",
  "routing": {
    "rule_id": "deploy-mgmt",
    "fallback_used": false
  }
}
```

### GET /api/orchestrator/status/:task_id
Get task status with agent details.

**Response:**
```json
{
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
      "session_key": "sess-def456",
      "output": null
    }
  ],
  "checkpoints": [
    { "timestamp": "2026-03-14T14:30:00Z", "event": "task_created" },
    { "timestamp": "2026-03-14T14:30:05Z", "event": "agent_dispatched", "agent": "k8s-agent" },
    { "timestamp": "2026-03-14T14:32:00Z", "event": "agent_complete", "agent": "k8s-agent" }
  ]
}
```

### GET /api/orchestrator/agents
List available specialist agents.

**Response:**
```json
{
  "agents": [
    { "name": "k8s-agent", "domain": "Kubernetes", "keywords": ["k8s", "kubernetes", "pod"] },
    { "name": "mgmt-agent", "domain": "MGMT Platform", "keywords": ["mgmt", "management"] },
    ...
  ]
}
```

### POST /api/orchestrator/route
Preview routing for a task (dry-run).

**Request:**
```json
{
  "description": "Update WordPress plugin for site performance"
}
```

**Response:**
```json
{
  "agents": ["wordpress-agent"],
  "sequence": "single",
  "gate_mode": "audit-only",
  "rule_id": "wordpress-plugin",
  "fallback_used": false
}
```

## Migration from Standalone Orchestrator

Existing tasks in `/ccn-github/openclaw-orchestrator/memory/orchestrator.db` can be imported:

```bash
# Export existing tasks
cd /ccn-github/openclaw-orchestrator
python3 scripts/export-tasks.py > tasks.json

# Import into Nerve
curl -X POST http://localhost:3080/api/orchestrator/import \
  -H "Authorization: Bearer $NERVE_TOKEN" \
  -H "Content-Type: application/json" \
  -d @tasks.json
```

## Next Steps

1. [ ] Create `server/routes/orchestrator.ts` with API endpoints
2. [ ] Create `server/services/orchestrator-service.ts` with routing logic
3. [ ] Create `server/lib/agent-registry.ts` with agent definitions
4. [ ] Create `skills/orchestrator/SKILL.md` for Nerve skill
5. [ ] Update `src/components/kanban/` with agent timeline UI
6. [ ] Add "New Orchestrated Task" button to KanbanBoard.tsx
7. [ ] Test integration with existing CCN repos
8. [ ] Migrate existing orchestrator tasks (optional)

## Benefits

- **Single source of truth**: All tasks in Nerve's kanban store
- **Visual tracking**: See agent interactions in real-time
- **Unified workflow**: Same approval/review flow for all tasks
- **Extensible**: Easy to add new specialist agents
- **Audit trail**: Full history in Nerve's agent log + kanban proposals
