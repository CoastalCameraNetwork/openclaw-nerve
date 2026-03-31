# Nerve Future Enhancements — Design Specification

> **Spec Date:** 2026-04-01
> **Author:** AI Assistant
> **Status:** Approved for Implementation
> **Related:** Sprint 1-4 plans, CLAUDE.md, ARCHITECTURE.md, 2026-03-31-nerve-orchestration-ui-fixes.md

---

## Executive Summary

This spec defines 8 feature enhancements to complete Nerve's orchestration and UI capabilities:

1. **Dependency Tracking** — Task relationships with enforcement
2. **Batch Operations** — Multi-select and bulk actions
3. **Advanced Filtering** — Agent, project, date, label filters (saved per-user)
4. **Timeline View** — Visual milestone timeline using Recharts
5. **Cost Budgets** — Task and goal budgets with auto-pause
6. **Dynamic Model Routing** — Automatic model selection with manual override
7. **Agent Availability Dashboard** — Real-time agent status with routing integration
8. **Wizards** — Step-by-step workflows for Create, Review, Deploy

---

## Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Frontend Additions                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │ DependencyGraph │  │ TimelineView    │  │ AgentAvailability│ │
│  │ Panel           │  │ (Recharts)      │  │ Dashboard       │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
│  ┌─────────────────┐  ┌─────────────────┐                       │
│  │ BatchSelect     │  │ Wizards          │                       │
│  │ (checkboxes)    │  │ Create/Review/Deploy│                    │
│  └─────────────────┘  └─────────────────┘                       │
│  ┌─────────────────┐                                            │
│  │ AdvancedFilters │                                            │
│  │ (multi-select)  │                                            │
│  └─────────────────┘                                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ REST + SSE
┌─────────────────────────────┼─────────────────────────────────────┐
│  Backend Additions                                                 │
│  ┌─────────────────────────┴───────────────────────────────────┐  │
│  │ /api/dependencies/* (NEW) - Task relationship management    │  │
│  │ /api/budgets/* (NEW) - Budget CRUD + enforcement            │  │
│  │ /api/agents/status (NEW) - Real-time availability           │  │
│  │ /api/models/status (NEW) - Model routing status             │  │
│  │ Enhanced: /api/kanban/tasks - Multi-select, filtering       │  │
│  └─────────────────────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ Dependency enforcement in kanban-store.ts                   │  │
│  │ Budget enforcement in orchestrator-service.ts               │  │
│  │ Agent tracking in session-watcher.ts                        │  │
│  │ Model routing in agent-registry.ts                          │  │
│  └─────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────┘
```

---

## Feature 1: Dependency Tracking

### Purpose
Prevent tasks from starting before dependencies complete. Model real-world workflow constraints.

### Data Model
```typescript
interface KanbanTask {
  // Existing fields...
  dependencies?: {
    blocked_by: string[];  // Task IDs that must complete first
    blocks: string[];      // Task IDs this task blocks
  };
}
```

### API Endpoints
| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/kanban/task/:id/dependency` | Add dependency |
| DELETE | `/api/kanban/task/:id/dependency/:depId` | Remove dependency |
| GET | `/api/kanban/task/:id/dependencies` | Get dependency graph |

### Enforcement
- **Column transitions**: Reject moving to `in-progress` if any `blocked_by` task is not `done`
- **Execution**: Reject `executeTask` if dependencies not met
- **Error code**: `DEPENDENCY_NOT_MET` with list of blocking tasks

### UI Components
- `DependencyPanel.tsx` — Shows upstream (blocking) and downstream (blocked by this) tasks
- `DependencyGraph.tsx` — Visual node+edge graph using react-flow or similar
- `DependencyPicker.tsx` — Dialog to select tasks to add as dependencies
- Visual indicator (chain icon) on task cards with unmet dependencies

---

## Feature 2: Batch Operations

### Purpose
Allow users to select multiple tasks and perform bulk actions.

### UI
- Checkbox on each task card (kanban + goals dashboard)
- "Select All" checkbox per column
- Floating action bar when items selected:
  - Count: "X tasks selected"
  - Actions: Approve, Reject, Move to..., Add Labels, Delete

### API
```typescript
POST /api/kanban/bulk
{
  "taskIds": ["task1", "task2", "task3"],
  "action": "approve" | "reject" | "move" | "add_labels" | "delete",
  "payload": {
    // Action-specific data
    "status": "done",  // for move
    "labels": ["urgent"],  // for add_labels
    "reason": "Security issues",  // for reject
    "merge": true  // for approve
  }
}
```

### Response
```typescript
{
  "results": [
    { "taskId": "task1", "success": true, "error": null },
    { "taskId": "task2", "success": false, "error": "DEPENDENCY_NOT_MET", "blockedBy": ["task5"] },
    { "taskId": "task3", "success": true, "error": null }
  ],
  "summary": { "succeeded": 2, "skipped": 1, "failed": 0 }
}
```

### Behavior
- **Blocked tasks**: Skipped with explanation, not failed
- **Partial success**: Some tasks may succeed while others skipped
- **Retry**: User can retry skipped tasks after dependencies resolve

---

## Feature 3: Advanced Filtering

### Purpose
Find tasks quickly across large kanban boards.

### Filter Types
| Filter | UI | Options |
|--------|-----|---------|
| Agent | Multi-select dropdown | All specialist agents |
| Project | Multi-select dropdown | All registered projects |
| Date Range | Date picker | Created/Updated between X and Y |
| Labels | Multi-select chips | All labels in system |
| Search | Text input | Title/description (existing) |
| Status | Column (existing) | todo, in-progress, review, done |

### API
```
GET /api/kanban/tasks?
  agents=k8s-agent,mgmt-agent
  &project=mgmt,nerve
  &created_after=2026-03-01
  &created_before=2026-03-31
  &labels=bug,urgent
  &search=deploy
```

### Persistence
- Save filter state to localStorage per user
- Key: `nerve-kanban-filters-{userId}`
- Restore on page reload

### UI
- Filter bar above kanban columns
- Collapsible to save space
- Active filter chips showing current selections
- "Clear all filters" button

---

## Feature 4: Timeline View

### Purpose
Visual milestone timeline showing task completion over time.

### UI
- New "Timeline" tab in Kanban board
- Horizontal timeline using Recharts:
  - **X-axis**: Time (configurable: days/weeks/months)
  - **Y-axis**: Tasks grouped by project or goal
  - **Bars**: Task duration (created → in-progress → done)
  - **Milestones**: Diamond markers for goal target dates
  - **Color coding**: By project, agent, or status

### Features
- Zoom levels: Day, Week, Month
- Filter by project, agent, goal
- Hover tooltip with task details
- Click bar to open TaskDetailPanel

### Data Source
- `createdAt`, `updatedAt` from task metadata
- Audit log for state transition timestamps
- Goal target dates for milestone markers

### Component
- `TimelineView.tsx` — Custom Recharts-based timeline
- Uses `ComposedChart`, `Bar`, `ReferenceLine` for milestones

---

## Feature 5: Cost Budgets

### Purpose
Set spending limits on tasks and goals with automatic enforcement.

### Data Models
```typescript
interface TaskBudget {
  id: string;
  taskId?: string;      // Individual task budget
  goalId?: string;      // Goal-level aggregate budget
  maxCostUSD: number;
  softLimitPercent: number;  // Warn at this % (default: 80)
  action: 'pause' | 'notify';  // What happens when exceeded
  createdAt: number;
  createdBy: string;
}

interface BudgetAlert {
  budgetId: string;
  taskId?: string;
  goalId?: string;
  currentCost: number;
  limit: number;
  percentUsed: number;
  triggeredAt: number;
  action: 'warning' | 'paused';
}
```

### API Endpoints
| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/orchestrator/budgets` | List budgets |
| POST | `/api/orchestrator/budgets` | Create budget |
| PUT | `/api/orchestrator/budgets/:id` | Update budget |
| DELETE | `/api/orchestrator/budgets/:id` | Delete budget |
| GET | `/api/orchestrator/budgets/status` | Current spending status |

### Enforcement
- Check before spawning each agent session
- At soft limit (80%): Show warning in UI
- At hard limit (100%):
  - `pause`: Move task to review, create proposal alert
  - `notify`: Send notification but continue

### UI
- Budget settings in CreateTaskDialog and CreateGoalDialog
- Budget tab in TaskDetailPanel and Goal detail
- Progress bar: Spent vs. Budget
- Per-agent cost breakdown
- Budget alerts panel

---

## Feature 6: Dynamic Model Routing

### Purpose
Optimize cost by routing tasks to different AI models based on real-time factors.

### Current State
- Static `thinking` levels per agent in `agent-registry.ts`
- Some agents use `glm-4.5` (cheap), others `qwen3.5-plus` (expensive)

### Enhancement
```typescript
interface ModelStatus {
  model: string;
  available: boolean;
  queueDepth: number;
  costPerToken: number;
  avgLatencyMs: number;
  lastUpdated: number;
}

interface RoutingDecision {
  selectedModel: string;
  reason: 'cost' | 'availability' | 'complexity' | 'manual';
  alternatives: Array<{ model: string; cost: number; available: boolean }>;
}
```

### API Endpoints
| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/orchestrator/models/status` | Get real-time model status |
| PUT | `/api/orchestrator/models/routing` | Configure routing rules |
| POST | `/api/orchestrator/models/refresh` | Refresh model status |

### Routing Logic
1. Check task complexity (existing `analyzeComplexity()`)
2. Filter unavailable models
3. Select cheapest available model for complexity tier
4. Allow manual override per task

### UI
- Model status dashboard (in Agents tab)
- Routing rules configuration
- Manual model selector dropdown (overrides automatic)

---

## Feature 7: Agent Availability Dashboard

### Purpose
See which agents are busy, idle, or unavailable in real-time.

### Data Model
```typescript
interface AgentStatus {
  name: string;
  displayName: string;
  status: 'available' | 'busy' | 'unavailable';
  activeTasks: number;
  currentTaskIds: string[];
  queueDepth: number;
  completedToday: number;
  avgCompletionTimeMs: number;
  lastSeenAt: number;
  error?: string;  // If unavailable, why
}
```

### API Endpoint
```
GET /api/orchestrator/agents/status
```

Returns array of `AgentStatus` for all 12 specialist agents.

### SSE Event
```typescript
{
  type: 'orchestrator.agent_status_changed',
  payload: AgentStatus
}
```

### UI
- New "Agents" tab in orchestrator panel
- Grid of agent cards showing:
  - Status indicator: 🟢 Available, 🟡 Busy, 🔴 Unavailable
  - Current task count
  - Queue depth
  - Completion stats
- Click agent to see current tasks

### Routing Integration
- Skip unavailable agents in `routeTask()`
- Fall back to next available agent
- If all agents unavailable: queue task, notify user

---

## Feature 8: Wizards

### Purpose
Guide users through complex workflows step-by-step.

### Wizard 1: Create Feature

**Steps:**
1. **What** — Text input for task description
2. **Project** — Dropdown to select project
3. **Gate Mode** — audit-only | gate-on-write | gate-on-deploy (with explanations)
4. **Budget** — Optional maxCostUSD input
5. **Preview** — Show routing preview + estimated cost
6. **Execute** — Create task and optionally execute immediately

### Wizard 2: Review PR

**Steps:**
1. **Show Diff** — Inline diff viewer of all PR changes
2. **Review Report** — Security findings, code quality, test coverage
3. **Fix Approach** — Auto-fix all | Critical only | Manual review
4. **Execute** — Spawn fix agent with selected scope

### Wizard 3: Deploy

**Steps:**
1. **Select Task** — From completed/review-passed tasks
2. **Review Changes** — Summary of what will be deployed
3. **Environment** — Staging | Production
4. **Confirm** — Final confirmation with risk warning
5. **Deploy** — Execute deployment

### Wizard Framework
```typescript
interface WizardStep {
  id: string;
  title: string;
  description?: string;
  component: React.ComponentType<WizardStepProps>;
  validate: (data: WizardData) => WizardValidationError | null;
}

interface WizardConfig {
  id: string;
  title: string;
  steps: WizardStep[];
  onComplete: (data: WizardData) => Promise<void>;
}
```

### UI Pattern
- Modal dialog with progress indicator
- Back / Next / Cancel buttons
- Validation before advancing
- State persisted to sessionStorage (resume after close)
- Keep existing direct actions as alternative

---

## Error Handling

### New Error Codes
```typescript
const ErrorCode = {
  // Existing codes...
  DEPENDENCY_NOT_MET: 'DEPENDENCY_NOT_MET',
  BUDGET_EXCEEDED: 'BUDGET_EXCEEDED',
  AGENT_UNAVAILABLE: 'AGENT_UNAVAILABLE',
  MODEL_UNAVAILABLE: 'MODEL_UNAVAILABLE',
  INVALID_WIZARD_STATE: 'INVALID_WIZARD_STATE',
} as const;
```

### Error Responses
All errors include:
```json
{
  "error": "Human-readable message",
  "code": "ERROR_CODE",
  "context": {
    "taskId": "...",
    "blockingTasks": ["task1", "task2"],
    "currentCost": 5.00,
    "budgetLimit": 4.00
  }
}
```

---

## Testing Strategy

### Unit Tests
- Dependency validation logic
- Budget calculation and enforcement
- Agent availability detection
- Model routing decisions

### Integration Tests
- Batch operation with mixed success/skip
- Wizard end-to-end flows
- Filter persistence and restoration

### Component Tests
- Dependency graph rendering
- Timeline view with various data
- Agent status dashboard
- Wizard step navigation

---

## Migration Path

### Backward Compatible
- All existing APIs continue to work
- Dependencies optional (default: empty arrays)
- Budgets opt-in per task/goal
- Wizards optional (direct actions remain)

### Data Migration
```typescript
// On first startup after deploy:
async function migrateDependencies() {
  const store = getKanbanStore();
  const allTasks = await store.listTasks({ limit: 1000 });

  for (const task of allTasks.items) {
    if (!task.dependencies) {
      await store.updateTask(task.id, task.version, {
        dependencies: { blocked_by: [], blocks: [] }
      });
    }
  }
}
```

---

## Success Criteria

### Dependency Tracking
- [ ] Can add/remove dependencies via UI
- [ ] Cannot move task to in-progress if blocked
- [ ] Dependency graph renders correctly
- [ ] Blocking indicator visible on task cards

### Batch Operations
- [ ] Can select multiple tasks with checkboxes
- [ ] Bulk actions execute on selected tasks
- [ ] Skipped tasks reported with reason
- [ ] Retry works after dependencies resolved

### Advanced Filtering
- [ ] All filter types work (agent, project, date, labels)
- [ ] Filters persist across page reload
- [ ] Filter state visible in URL or localStorage
- [ ] Clear all filters works

### Timeline View
- [ ] Tasks render as bars on timeline
- [ ] Zoom levels (day/week/month) work
- [ ] Click opens task detail
- [ ] Goal milestones shown

### Cost Budgets
- [ ] Can set task and goal budgets
- [ ] Warning at soft limit (80%)
- [ ] Auto-pause at hard limit
- [ ] Budget status visible in UI

### Dynamic Model Routing
- [ ] Model status updates in real-time
- [ ] Automatic routing selects cheapest available
- [ ] Manual override works
- [ ] Unavailable models skipped

### Agent Availability
- [ ] All 12 agents shown with status
- [ ] Status updates via SSE
- [ ] Unavailable agents skipped in routing
- [ ] Click shows agent details

### Wizards
- [ ] All 3 wizards complete their flows
- [ ] State persists across close/reopen
- [ ] Validation prevents invalid advances
- [ ] Direct actions still available as alternative

---

## Dependencies

### External
- OpenClaw Gateway (existing)
- No new external libraries required (using Recharts which is already installed)

### Internal
- Kanban store (existing, enhanced)
- Agent registry (existing, enhanced)
- SSE event system (existing, enhanced)
- Budget enforcement (existing, enhanced)

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Dependency cycles | High | Detect and reject cycles on add |
| Batch ops too slow | Medium | Process in parallel, show progress |
| Filters confuse users | Low | Clear UI, tooltips, easy reset |
| Timeline performance | Medium | Virtual scrolling for large datasets |
| Budget race conditions | Medium | Mutex-protected budget checks |
| Model status stale | Low | Refresh every 30s, fallback to cached |
| Wizards add complexity | Low | Keep optional, document well |

---

## Future Enhancements (After This Spec)

- Notification preferences (email, Slack, etc.)
- Recurring tasks (cron-based task creation)
- Task templates (pre-configured task types)
- Advanced analytics (cost trends, agent performance)
- Mobile-responsive UI

---

## File Inventory

### Files to Create
```
src/features/dependencies/
  - DependencyPanel.tsx
  - DependencyGraph.tsx
  - DependencyPicker.tsx
  - useDependencies.ts

src/features/batch/
  - BatchActionBar.tsx
  - useBatchSelection.ts

src/features/filters/
  - KanbanFilters.tsx
  - FilterBar.tsx
  - useKanbanFilters.ts

src/features/timeline/
  - TimelineView.tsx
  - TimelineBar.tsx
  - useTimelineData.ts

src/features/budgets/
  - BudgetPanel.tsx
  - BudgetProgress.tsx
  - CreateBudgetDialog.tsx
  - useBudgets.ts

src/features/models/
  - ModelStatusDashboard.tsx
  - ModelRoutingConfig.tsx
  - useModelStatus.ts

src/features/agents/
  - AgentAvailabilityDashboard.tsx
  - AgentCard.tsx
  - useAgentStatus.ts

src/features/wizards/
  - WizardModal.tsx
  - CreateFeatureWizard.tsx
  - ReviewPRWizard.tsx
  - DeployWizard.tsx
  - useWizard.ts

server/routes/
  - dependencies.ts
  - budgets.ts
  - agents.ts
  - models.ts

server/services/
  - dependency-service.ts
  - budget-service.ts
  - agent-status-service.ts
  - model-routing-service.ts

server/test/
  - dependencies.test.ts
  - budgets.test.ts
  - batch-operations.test.ts
```

### Files to Modify
```
server/lib/kanban-store.ts
  - Add dependencies field to tasks
  - Add dependency validation
  - Add batch operation support
  - Add filter parameters to listTasks()

server/lib/agent-registry.ts
  - Add model status tracking
  - Add availability-aware routing
  - Add model routing logic

server/services/session-watcher.ts
  - Track agent activity
  - Update agent status on session events

server/services/orchestrator-service.ts
  - Budget enforcement enhancements
  - Model routing integration

server/routes/orchestrator.ts
  - Add budget endpoints
  - Add model status endpoints
  - Add agent status endpoint

server/app.ts
  - Mount new route files

src/features/kanban/
  - KanbanBoard.tsx — Add batch selection, filters
  - TaskCard.tsx — Add dependency indicator, checkbox

src/features/orchestrator/
  - OrchestratorDashboard.tsx — Add Agents tab, Timeline tab
  - TaskDetailPanel.tsx — Add dependency panel, budget panel

src/features/goals/
  - GoalsDashboard.tsx — Add batch selection
  - GoalCard.tsx — Add budget display

src/contexts/
  - GatewayContext.tsx — Add model/agent status events
```

---

*End of Spec*
