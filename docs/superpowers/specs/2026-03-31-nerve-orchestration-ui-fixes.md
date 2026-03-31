# Nerve Orchestration & UI Fixes — Design Specification

> **Spec Date:** 2026-03-31
> **Author:** AI Assistant
> **Status:** Approved for Implementation
> **Related:** Sprint 1-4 plans, CLAUDE.md, ARCHITECTURE.md

---

## Executive Summary

This spec addresses critical reliability gaps in Nerve's orchestration system and UI limitations that prevent users from accomplishing real work goals. The fixes fall into three categories:

1. **Foundation Reliability** — Fix known bugs that cause incorrect behavior
2. **Event-Driven Architecture** — Replace polling with webhook-based completion
3. **Goal-Oriented UI** — Restructure dashboard around outcomes, not just activity

---

## Problem Statement

Current state prevents goal accomplishment because:

- **Orchestration lies about state**: Optimistic commit counts, stale polling data, lost agent output after session expiry
- **UI shows activity, not outcomes**: Virtual office is visually creative but lacks action buttons, workflow guidance, and goal tracking
- **No event-driven completion**: Still polling every 5s for task completion; agent output lost if sessions expire before poll captures them
- **Workflow knowledge required**: Users must know the PR review → fix → re-review flow; no wizards guide them

---

## Goals

### Primary Goals

1. **Reliable state**: UI always reflects reality (commits, task status, agent output)
2. **Event-driven**: Zero polling for task completion; webhook notifies on agent completion
3. **Actionable UI**: Every task state has clear "next action" buttons visible
4. **Goal tracking**: Users can group tasks under outcome-oriented headers

### Non-Goals (Future Phases)

- Redesign the virtual office metaphor (keep avatars, add action layer)
- Add new specialist agents (focus on reliability, not expansion)
- Real-time collaborative editing (out of scope)
- Mobile app (web-only for now)

---

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────────┐
│  Frontend (React 19 + TypeScript + Vite 7)                      │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │ GoalsDashboard  │  │ TaskDetailPanel │  │ ActionWizard    │  │
│  │ (new)           │  │ (enhanced)      │  │ (new)           │  │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  │
│           │                     │                     │          │
│  ┌────────┴─────────────────────┴─────────────────────┴────────┐ │
│  │              useOrchestrator hooks (enhanced)               │ │
│  │  - SSE subscription to orchestrator.task_complete           │ │
│  │  - Action handlers (review, fix, approve, reject)           │ │
│  └─────────────────────────┬───────────────────────────────────┘ │
└─────────────────────────────┼─────────────────────────────────────┘
                              │ REST + SSE
┌─────────────────────────────┼─────────────────────────────────────┐
│  Backend (Hono 4 + Node.js 22+)                                   │
│  ┌────────┴───────────────────────────────────────────────────┐  │
│  │ /api/orchestrator/* routes (enhanced)                      │  │
│  │ - POST /webhook/session-complete (NEW)                     │  │
│  │ - GET  /task/:id/history (enhanced with cost data)         │  │
│  │ - POST /task/:id/review (existing, add error codes)        │  │
│  │ - POST /task/:id/fix (existing, fix bugs)                  │  │
│  └─────────────────────────┬───────────────────────────────────┘  │
│                            │                                       │
│  ┌─────────────────────────┴───────────────────────────────────┐  │
│  │ orchestrator-service.ts (enhanced)                          │  │
│  │ - executeTask() with fixed gate enforcement                 │  │
│  │ - session-watcher.ts (NEW, fallback polling)                │  │
│  │ - createProposalsFromFindings() (implement parsing)         │  │
│  └─────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────┘
```

### Data Flow

**Task Creation → Execution → Completion:**

```
1. User creates task via CreateOrchestratedTaskDialog
   ↓
2. Backend creates kanban task + routes to agents
   ↓
3. executeTask() spawns agents with gate instructions
   ↓
4. Agents work → gateway session completes
   ↓
5. [NEW] Gateway webhook OR session-watcher detects completion
   ↓
6. Backend stores agent output in task.metadata.agentOutput
   ↓
7. Backend broadcasts SSE: orchestrator.task_complete
   ↓
8. Frontend receives event → refreshes UI → shows "Review" button
```

**PR Review → Fix → Re-review:**

```
1. Task in "review" status (agents done, PR created)
   ↓
2. User clicks "Run Automated Review" button
   ↓
3. Backend spawns security-reviewer + cicd-agent + mgmt-agent
   ↓
4. Review report stored in task.metadata.prReview
   ↓
5. If issues found: show "Fix Issues" button
   ↓
6. User clicks "Fix Issues" → spawns fix agent
   ↓
7. Agent commits fixes → re-trigger review (auto or manual)
   ↓
8. Loop until review passes → show "Ready for Merge"
```

---

## Components

### Frontend Components

#### 1. GoalsDashboard (NEW)

**File:** `src/features/goals/GoalsDashboard.tsx`

**Purpose:** Top-level view showing outcome-oriented goals (not just task list)

**Features:**
- Goal cards with progress bars (tasks completed / total tasks)
- Blocked task indicators
- Cost tracking per goal
- Create/edit/delete goals

**Data Structure:**
```typescript
interface Goal {
  id: string;
  title: string;
  description?: string;
  createdAt: number;
  taskIds: string[];  // References to kanban tasks
  targetDate?: number;
  status: 'active' | 'completed' | 'archived';
}
```

#### 2. TaskDetailPanel (ENHANCED)

**File:** `src/features/orchestrator/TaskDetailPanel.tsx`

**New Features:**
- Prominent "Next Action" section based on task state
- Action buttons: Run Review, Fix Issues, Approve, Reject, Abort
- Agent output tabs with expand/collapse
- Cost breakdown per agent
- PR status with direct link

**State-Based Actions:**
| Task State | Next Actions |
|------------|-------------|
| in-progress | [Abort], [View Agent Output] |
| review (has issues) | [Fix Issues], [View Review Report] |
| review (passed) | [Approve & Merge], [Reject] |
| done | [View PR], [Reopen] |

#### 3. ActionWizard (NEW)

**File:** `src/features/wizards/ActionWizard.tsx`

**Purpose:** Guide users through common workflows

**Wizards:**
- **Create Feature**: What → Which Project → Gate Mode → Budget → Preview → Execute
- **Review PR**: Show diff → Show review report → Choose fix approach → Execute
- **Deploy**: Select task → Review changes → Select environment → Confirm → Deploy

#### 4. useOrchestrator Hook (ENHANCED)

**File:** `src/features/orchestrator/useOrchestrator.ts`

**New Functions:**
```typescript
// Subscribe to task completion events
useEffect(() => {
  const unsubscribe = subscribe((event) => {
    if (event.type === 'orchestrator.task_complete') {
      refetchTask(event.payload.taskId);
    }
  });
  return unsubscribe;
}, []);

// Action handlers
const runReview = useCallback(async (taskId: string) => { ... });
const fixIssues = useCallback(async (taskId: string) => { ... });
const approveTask = useCallback(async (taskId: string) => { ... });
const rejectTask = useCallback(async (taskId: string) => { ... });
```

### Backend Components

#### 1. Webhook Endpoint (NEW)

**File:** `server/routes/orchestrator.ts`

**Route:** `POST /api/orchestrator/webhook/session-complete`

**Request:**
```json
{
  "sessionLabel": "orch-task123-k8s-agent",
  "sessionKey": "abc123",
  "status": "done",
  "output": "...agent output...",
  "error": null
}
```

**Response:**
```json
{
  "success": true,
  "taskId": "task123",
  "agent": "k8s-agent",
  "allComplete": false
}
```

**Logic:**
1. Parse task ID from session label (`orch-{taskId}-{agentName}`)
2. Store agent output in `task.metadata.agentOutput`
3. Check if all agents for task are complete
4. If yes: move task to "review", broadcast SSE event

#### 2. Session Watcher (NEW)

**File:** `server/services/session-watcher.ts`

**Purpose:** Fallback polling for environments where webhook isn't called

**Behavior:**
- Polls gateway subagents list every 30s
- Looks for completed sessions with `orch-*` labels
- Calls same completion logic as webhook

#### 3. Orchestrator Service (ENHANCED)

**File:** `server/services/orchestrator-service.ts`

**Fixes:**
- `executeTask()` now properly enforces gate modes
- `getTaskStatus()` reads from stored metadata first, live sessions second
- `createProposalsFromFindings()` implements JSON + TODO pattern parsing

**Functions to Fix:**
```typescript
// BEFORE: Returns optimistic { commits: 1 }
export async function fixPRIssues(...) {
  return { success: true, commits: 1, message: '...' };
}

// AFTER: Returns honest { commits: 0, sessionLabel }
export async function fixPRIssues(...) {
  return {
    success: true,
    commits: 0,
    message: 'Agent spawned...',
    sessionLabel: `pr-${prNumber}-fix`
  };
}
```

#### 4. Error Codes (ENHANCED)

**File:** `server/routes/orchestrator.ts`

**All error responses include `code` field:**
```typescript
return c.json({
  error: 'Task not found',
  code: 'TASK_NOT_FOUND'
}, 404);
```

**Error Codes:**
- `TASK_NOT_FOUND`
- `PR_NOT_FOUND`
- `NO_AGENTS`
- `NO_PROJECT`
- `GATEWAY_ERROR`
- `AGENT_SPAWN_FAILED`
- `REVIEW_REQUIRED`
- `INVALID_REQUEST`
- `DUPLICATE_EXECUTION`
- `VERSION_CONFLICT`

---

## Data Models

### Task Metadata Extensions

```typescript
interface OrchestratorTaskMetadata {
  // Existing fields
  gate_mode?: 'audit-only' | 'gate-on-write' | 'gate-on-deploy';
  sequence?: 'single' | 'sequential' | 'parallel';
  orchestrator_id?: string;
  routing?: { /* routing result */ };
  maxCostUSD?: number;

  // NEW: Agent output persistence
  agentOutput?: Record<string, {
    sessionKey?: string;
    status: 'done' | 'error';
    output?: string;  // capped at 10KB
    error?: string;
    completedAt?: number;
    tokens?: { input: number; output: number; cost: number };
  }>;

  // NEW: PR review data
  prReview?: {
    passed: boolean;
    criticalIssues: number;
    highIssues: number;
    mediumIssues: number;
    lowIssues: number;
    report?: string;
    reviewedAt?: number;
  };
}
```

### Goals Storage

```typescript
// Stored in: ${NERVE_DATA_DIR}/goals.json
interface GoalsStore {
  goals: Goal[];
  meta: {
    schemaVersion: number;
    updatedAt: number;
  };
}
```

---

## API Endpoints

### New Endpoints

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/orchestrator/webhook/session-complete` | Session completion webhook |
| GET | `/api/orchestrator/goals` | List all goals |
| POST | `/api/orchestrator/goals` | Create new goal |
| PUT | `/api/orchestrator/goals/:id` | Update goal |
| DELETE | `/api/orchestrator/goals/:id` | Delete goal |
| POST | `/api/orchestrator/task/:id/review` | Run automated PR review |
| POST | `/api/orchestrator/task/:id/fix` | Fix PR issues |
| POST | `/api/orchestrator/task/:id/approve` | Approve task for merge |
| POST | `/api/orchestrator/task/:id/reject` | Reject task |

### Enhanced Endpoints

| Endpoint | Enhancement |
|----------|-------------|
| GET `/api/orchestrator/status/:id` | Returns stored agent output, not just live sessions |
| GET `/api/orchestrator/task/:id/history` | Includes cost breakdown, PR review data |

---

## SSE Events

### New Event: `orchestrator.task_complete`

**Payload:**
```json
{
  "type": "orchestrator.task_complete",
  "payload": {
    "taskId": "task123",
    "title": "Deploy to staging",
    "completedAgents": ["k8s-agent", "cicd-agent"],
    "hasOutput": true,
    "hasProposals": false
  }
}
```

**Frontend Handling:**
```typescript
useEffect(() => {
  const unsubscribe = subscribe((event) => {
    if (event.type === 'orchestrator.task_complete') {
      // Refresh task list
      refetchTasks();
      // Show notification
      showToast(`Task "${event.payload.title}" completed`);
    }
  });
  return unsubscribe;
}, [subscribe]);
```

---

## Error Handling

### Structured Error Responses

All API errors return:
```json
{
  "error": "Human-readable message",
  "code": "ERROR_CODE_CONSTANT",
  "context": {
    "taskId": "task123",  // When relevant
    "agentName": "k8s-agent"  // When relevant
  }
}
```

### Frontend Error Handling

```typescript
try {
  await runReview(taskId);
} catch (err) {
  if (err.code === 'PR_NOT_FOUND') {
    showError('No PR associated with this task');
  } else if (err.code === 'NO_AGENTS') {
    showError('Task has no agent assignments');
  } else {
    showError(`Review failed: ${err.message}`);
  }
}
```

---

## Testing Strategy

### Backend Tests

**Pattern:** Follow `server/lib/kanban-store.test.ts` and `server/routes/memories.test.ts`

**Test Files to Create:**
- `server/routes/orchestrator.test.ts` — Route handlers, error codes
- `server/services/orchestrator-service.test.ts` — executeTask, proposal parsing
- `server/services/session-watcher.test.ts` — Polling logic

### Frontend Tests

**Pattern:** Follow `src/features/orchestrator/OrchestratorDashboard.test.tsx`

**Test Files to Create:**
- `src/features/goals/GoalsDashboard.test.tsx` — Goal CRUD
- `src/features/orchestrator/TaskDetailPanel.test.tsx` — Action buttons
- `src/features/wizards/ActionWizard.test.tsx` — Wizard flows

### Integration Tests

**Flows to Test:**
1. Create task → Execute → Complete → Review → Fix → Re-review → Done
2. Webhook completion → SSE broadcast → UI refresh
3. Gate mode enforcement → Agent respects restrictions

---

## Migration Path

### No Breaking Changes

- Existing kanban tasks continue to work
- Webhook is additive (polling remains as fallback)
- Goals are opt-in (existing task list still available)

### Data Migration

```typescript
// In server startup, run once:
async function migrateTaskMetadata() {
  const store = getKanbanStore();
  const allTasks = await store.listTasks({ limit: 1000 });

  for (const task of allTasks.items) {
    // Backfill agentOutput from any existing fields
    if (!task.metadata?.agentOutput && task.result) {
      task.metadata = {
        ...task.metadata,
        agentOutput: {
          'migrated': {
            output: task.result,
            status: 'done',
            completedAt: task.updatedAt,
          }
        }
      };
      await store.updateTask(task.id, task.version, {
        metadata: task.metadata
      });
    }
  }
}
```

---

## Success Criteria

### Reliability

- [ ] `fixPRIssues()` returns `commits: 0` (honest state)
- [ ] All error responses include `code` field
- [ ] Agent output survives session expiry (stored in metadata)
- [ ] Gate mode instructions included in agent prompts

### Event-Driven

- [ ] Webhook endpoint accepts session completion
- [ ] SSE broadcast on task completion
- [ ] Frontend subscribes and refreshes without polling
- [ ] Session watcher runs as fallback

### Actionable UI

- [ ] Every task state shows "Next Action" buttons
- [ ] Run Review / Fix Issues / Approve / Reject buttons work
- [ ] Task detail panel shows agent output with expand/collapse
- [ ] Cost breakdown per agent visible

### Goal Tracking

- [ ] Goals can be created, edited, deleted
- [ ] Tasks can be assigned to goals
- [ ] Goal progress bars show completion %
- [ ] Blocked tasks identified

---

## Dependencies

### External

- OpenClaw Gateway (existing dependency)
- No new external libraries required

### Internal

- Kanban store (existing)
- Agent registry (existing)
- SSE event system (existing)
- PR review service (existing)

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-------------|
| Webhook not called by gateway | Medium | Session watcher fallback polling |
| Goals add complexity | Low | Opt-in feature, tasks still visible without goals |
| Breaking existing orchestration | High | Extensive test coverage, backward-compatible changes |
| Agent output bloats metadata | Medium | Cap at 10KB per agent, truncate in storage |

---

## Future Enhancements

**Phase 2 (After this spec):**
- Dependency tracking between tasks (`blocked_by`, `blocks`)
- Batch operations (multi-select, bulk approve)
- Advanced filtering (by agent, project, date range)
- Timeline view with milestones

**Phase 3:**
- Cost budgets with auto-pause
- Dynamic model routing based on real-time cost
- Agent availability dashboard

---

## Appendix: File Inventory

### Files to Create

```
src/features/goals/
  - GoalsDashboard.tsx
  - GoalCard.tsx
  - CreateGoalDialog.tsx
  - useGoals.ts

src/features/wizards/
  - ActionWizard.tsx
  - CreateFeatureWizard.tsx
  - ReviewPRWizard.tsx

server/services/
  - session-watcher.ts

server/routes/
  - goals.ts (NEW route file)

server/test/
  - orchestrator.test.ts
  - session-watcher.test.ts

src/test/
  - GoalsDashboard.test.tsx
  - ActionWizard.test.tsx
```

### Files to Modify

```
src/features/orchestrator/
  - TaskDetailPanel.tsx (add action buttons)
  - useOrchestrator.ts (add SSE subscription, action handlers)
  - CreateOrchestratedTaskDialog.tsx (add budget field)

server/routes/orchestrator.ts
  - Add webhook endpoint
  - Add error codes to all responses
  - Fix fixPRIssues() return value

server/services/orchestrator-service.ts
  - Fix executeTask() gate enforcement
  - Implement createProposalsFromFindings()
  - Fix getTaskStatus() to use stored metadata
```

---

*End of Spec*
