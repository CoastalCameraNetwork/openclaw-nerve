# Sprint 4: Polish & Advanced Features

**Status:** COMPLETE ✓

All 4 tasks completed. Model routing intelligently selects between `glm-4.5` (cost-efficient, tool-heavy) and `qwen3.5-plus` (deep reasoning, complex tasks) based on:
- Rule-level overrides for known task types
- Complexity analysis (description length, keywords, multi-agent, domain)
- Agent defaults as fallback

**Test coverage:** 24/24 orchestrator tests passing, 36/36 agent-registry tests passing.

---

Lower priority items. Can be done in any order.

---

## Task 4.1: Dynamic model routing based on task complexity

**Status:** COMPLETE
**Priority:** Medium
**Risk:** Medium
**Files:**
- `server/lib/agent-registry.ts`
- `server/services/orchestrator-service.ts`

### Context

The agent registry hardcodes model assignments:
- `k8s-agent` → `glm-4.5`
- `mgmt-agent` → `qwen3.5-plus`
- `security-reviewer` → `qwen3.5-plus`

This is fine for most cases but doesn't account for task complexity. A simple "restart pod X" doesn't need the same model as "refactor the entire auth module."

### What to do

#### 1. Add complexity heuristics

Create a complexity scorer in `agent-registry.ts`:

```typescript
type TaskComplexity = 'low' | 'medium' | 'high';

interface ModelTier {
  low: string;
  medium: string;
  high: string;
}

// Default model tiers — agents can override
const DEFAULT_MODEL_TIERS: ModelTier = {
  low: 'glm-4.5',       // Cheap, good at tools
  medium: 'qwen3.5-plus', // Balanced
  high: 'qwen3.5-plus',   // Or a higher-context model when available
};

export function estimateComplexity(description: string): TaskComplexity {
  const lower = description.toLowerCase();
  const wordCount = description.split(/\s+/).length;

  // High complexity signals
  const highSignals = [
    'refactor', 'migrate', 'redesign', 'architect', 'overhaul',
    'security audit', 'vulnerability', 'performance optimization',
    'multiple files', 'across all', 'entire codebase',
  ];
  if (highSignals.some(s => lower.includes(s)) || wordCount > 100) {
    return 'high';
  }

  // Low complexity signals
  const lowSignals = [
    'restart', 'reboot', 'check status', 'list', 'show',
    'update version', 'bump', 'simple fix', 'typo',
    'add comment', 'update readme',
  ];
  if (lowSignals.some(s => lower.includes(s)) && wordCount < 30) {
    return 'low';
  }

  return 'medium';
}
```

#### 2. Add model tiers to agent definitions

Extend the `SpecialistAgent` interface:

```typescript
export interface SpecialistAgent {
  name: string;
  domain: string;
  description: string;
  keywords: string[];
  model?: string;           // Default model (existing)
  modelTiers?: ModelTier;   // Optional per-agent overrides
  thinking?: 'off' | 'low' | 'medium' | 'high';
}
```

Update agents that benefit from tiering:

```typescript
'k8s-agent': {
  // ...existing fields
  model: 'glm-4.5',
  modelTiers: {
    low: 'glm-4.5',
    medium: 'glm-4.5',
    high: 'qwen3.5-plus', // Complex k8s work needs more reasoning
  },
},
```

#### 3. Use complexity in task execution

In `spawnAgentSession()`:

```typescript
// Resolve model based on complexity
const complexity = estimateComplexity(prompt);
const resolvedModel = agent.modelTiers?.[complexity] || agent.model;

const spawnArgs: Record<string, unknown> = {
  task: fullPrompt,
  label: shortLabel,
  runtime: 'subagent',
  mode: 'session',
  thinking: complexity === 'high' ? 'high' : agent.thinking ?? 'medium',
  cleanup: 'keep',
};

if (resolvedModel) {
  spawnArgs.model = resolvedModel;
}
```

#### 4. Include complexity in routing preview

Update the `/api/orchestrator/route` response to include estimated complexity:

```typescript
return c.json({
  success: true,
  agents: routing.agents,
  sequence: routing.sequence,
  gate_mode: routing.gate_mode,
  complexity: estimateComplexity(description), // NEW
  // ...
});
```

### Acceptance criteria

- [ ] Complexity estimation function works for various descriptions
- [ ] Simple tasks use cheaper models
- [ ] Complex tasks use higher-context models
- [ ] Route preview shows estimated complexity
- [ ] Agent model tiers are optional (backward compatible)
- [ ] `npm run build:server` compiles without errors

---

## Task 4.2: Add per-routing-rule model overrides

**Status:** COMPLETE
**Priority:** Low
**Risk:** Low
**Files:**
- `server/lib/agent-registry.ts`

### Context

Routing rules match task patterns to agent sets but don't override models. A deployment rule might want to force a specific model regardless of the default agent model.

### What to do

Add an optional `modelOverride` field to `RoutingRule`:

```typescript
export interface RoutingRule {
  id: string;
  pattern: RegExp;
  agents: string[];
  sequence: 'single' | 'sequential' | 'parallel';
  gate_mode: 'audit-only' | 'gate-on-write' | 'gate-on-deploy';
  description?: string;
  modelOverride?: string;    // Force all agents in this rule to use this model
  thinkingOverride?: 'off' | 'low' | 'medium' | 'high'; // Force thinking level
}
```

When a routing rule matches, the `routeTask()` function should include the overrides:

```typescript
export function routeTask(description: string): RoutingResult & {
  modelOverride?: string;
  thinkingOverride?: string;
} {
  // ... existing matching logic
  if (matchedRule) {
    return {
      agents: matchedRule.agents,
      sequence: matchedRule.sequence,
      gate_mode: matchedRule.gate_mode,
      rule_id: matchedRule.id,
      fallback_used: false,
      modelOverride: matchedRule.modelOverride,
      thinkingOverride: matchedRule.thinkingOverride,
    };
  }
  // ... fallback logic
}
```

Then in `executeTask()`, apply the override when spawning agents.

### Acceptance criteria

- [ ] Routing rules support optional model and thinking overrides
- [ ] Overrides are applied when spawning agent sessions
- [ ] Existing rules without overrides still work (backward compatible)
- [ ] `npm run build:server` compiles without errors

---

## Task 4.3: Sync documentation with actual behavior

**Status:** COMPLETE
**Priority:** Medium
**Risk:** Low
**Files:**
- `docs/PR_WORKFLOW.md`
- `docs/AGENT_PR_WORKFLOW.md`
- `skills/orchestrator/SKILL.md`
- `CHANGELOG.md`

### Context

Several docs describe features that are partially implemented or have evolved since being written:
- `PR_WORKFLOW.md` describes a review/fix/re-review loop that works but has the hardcoded path bug (fixed in Sprint 1)
- `AGENT_PR_WORKFLOW.md` describes agent fix loops that depend on the gate mode enforcement (added in Sprint 1)
- `skills/orchestrator/SKILL.md` doesn't mention webhooks, structured handoff, or cost budgets (added in Sprint 2-3)

### What to do

#### 1. Update `skills/orchestrator/SKILL.md`

Add sections for:
- Webhook-based completion (`POST /api/orchestrator/webhook/session-complete`)
- Task history endpoint (`GET /api/orchestrator/task/:id/history`)
- Stats endpoint (`GET /api/orchestrator/stats?range=...`)
- Cost budgets (`maxCostUSD` in task creation)
- Structured handoff format (JSON output format agents should use)
- Gate mode enforcement details

#### 2. Update `docs/PR_WORKFLOW.md`

- Note that working directory is now auto-detected from project registry
- Document the fix/review/re-review cycle with correct API endpoints
- Add error code documentation

#### 3. Update `docs/AGENT_PR_WORKFLOW.md`

- Document how gate modes affect agent behavior
- Update the fix loop description to match the actual implementation
- Add structured output format documentation

#### 4. Update `CHANGELOG.md`

Add an `[Unreleased]` section documenting all Sprint 1-4 changes. Follow the existing changelog format:

```markdown
## [Unreleased]

### Added
- Webhook-based task completion (replaces polling)
- Structured agent handoff for sequential execution
- Orchestrator dashboard with time-series charts (recharts)
- Task detail panel with execution history and audit log
- Per-agent token/cost breakdown
- Cost budgets per task with auto-pause
- Dynamic model routing based on task complexity
- Structured error codes for all orchestrator API responses
- Unit tests for agent-registry and project-registry

### Fixed
- PR review working directory no longer hardcoded to `/ccn-github/mgmt`
- `fixPRIssues` returns honest commit count instead of optimistic `1`
- Gate modes now enforced in agent prompts (previously ignored)
- Recovery generation counter bumped on WebSocket reconnect
- Agent output preserved in task metadata (survives session expiry)
```

### Acceptance criteria

- [ ] All docs reflect actual implemented behavior
- [ ] New endpoints and features are documented
- [ ] CHANGELOG has unreleased section with all changes
- [ ] No references to deprecated or removed behavior

---

## Task 4.4: Add orchestrator integration tests

**Status:** COMPLETE
**Priority:** Medium
**Risk:** Low
**Files:**
- `server/routes/orchestrator.test.ts`
- `server/services/orchestrator-service.test.ts`

**Pattern to follow:**
- `server/routes/memories.test.ts` (route testing pattern)
- `server/lib/kanban-store.test.ts` (service testing pattern)

### Context

The orchestrator routes and service have zero test coverage. After Sprint 1-3, there's a lot more logic to test.

### What to do

#### 1. Create route tests

Follow the pattern in `server/routes/memories.test.ts` which uses `vi.doMock()` for dependency injection:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';

describe('orchestrator routes', () => {
  let app: Hono;

  beforeEach(async () => {
    vi.resetModules();

    // Mock dependencies
    vi.doMock('../lib/kanban-store.js', () => ({
      getKanbanStore: () => ({
        getTask: vi.fn(async (id: string) => ({
          id, title: 'Test task', status: 'todo',
          version: 1, labels: ['agent:k8s-agent'],
          description: 'Deploy to staging',
          createdAt: Date.now(), updatedAt: Date.now(),
        })),
        updateTask: vi.fn(async () => ({})),
        listTasks: vi.fn(async () => ({ items: [], total: 0, hasMore: false })),
        createTask: vi.fn(async (input: any) => ({
          id: 'test-id', ...input, version: 1,
          createdAt: Date.now(), updatedAt: Date.now(),
        })),
        executeTask: vi.fn(async () => ({})),
      }),
    }));

    vi.doMock('../middleware/rate-limit.js', () => ({
      rateLimitGeneral: vi.fn((_c: unknown, next: () => Promise<void>) => next()),
    }));

    vi.doMock('../lib/gateway-client.js', () => ({
      invokeGatewayTool: vi.fn(async () => ({ active: [], recent: [] })),
    }));

    vi.doMock('./events.js', () => ({
      broadcast: vi.fn(),
    }));

    const mod = await import('./orchestrator.js');
    app = new Hono();
    app.route('/', mod.default);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/orchestrator/agents', () => {
    it('returns list of agents', async () => {
      const res = await app.request('/api/orchestrator/agents');
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.agents)).toBe(true);
      expect(json.agents.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/orchestrator/route', () => {
    it('routes k8s tasks correctly', async () => {
      const res = await app.request('/api/orchestrator/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: 'Deploy kubernetes namespace' }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.agents).toContain('k8s-agent');
    });
  });

  describe('GET /api/orchestrator/status/:id', () => {
    it('returns 404 for missing task', async () => {
      // Override mock to return null
      // ... test 404 handling
    });
  });

  describe('POST /api/orchestrator/execute/:id', () => {
    it('rejects task with no agent labels', async () => {
      // Override mock to return task without agent labels
      // ... test 400 response with NO_AGENTS code
    });
  });

  // Add more tests for:
  // - webhook/session-complete
  // - task/:id/history
  // - task/:id/review
  // - task/:id/fix
  // - stats endpoint
  // - error code consistency
});
```

#### 2. Create service tests

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('orchestrator-service', () => {
  describe('startTask', () => {
    it('creates task with routed agents', async () => {
      // Test that startTask returns correct agents for known patterns
    });

    it('uses fallback agent for unknown tasks', async () => {
      // Test fallback routing
    });
  });

  describe('estimateComplexity', () => {
    it('rates simple tasks as low', () => {
      // Test complexity estimation
    });

    it('rates refactoring tasks as high', () => {
      // Test high complexity signals
    });
  });

  // Mock gateway calls for execution tests
  describe('executeTask', () => {
    it('spawns agents in parallel for parallel sequence', async () => {
      // Mock invokeGatewayTool and verify parallel calls
    });
  });
});
```

### Acceptance criteria

- [ ] Route tests cover all orchestrator endpoints
- [ ] Service tests cover task creation, routing, and complexity
- [ ] Tests mock gateway calls (don't require running gateway)
- [ ] All tests pass with `npm test -- --run`
- [ ] Error codes are verified in tests
- [ ] Coverage improves meaningfully for orchestrator code
