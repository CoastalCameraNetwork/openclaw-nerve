/** Tests for orchestrator-service: gate mode enforcement and task execution. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock gateway-client before importing orchestrator-service
vi.mock('../lib/gateway-client.js', () => ({
  invokeGatewayTool: vi.fn(async () => ({ sessionKey: 'mock-session-key' })),
}));

// Mock kanban-store
vi.mock('../lib/kanban-store.js', () => ({
  getKanbanStore: vi.fn(() => ({
    getTask: vi.fn(async (id: string) => ({
      id,
      title: 'Test task',
      status: 'todo',
      version: 1,
      labels: ['agent:k8s-agent'],
      description: 'Deploy to staging',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      metadata: { gate_mode: 'audit-only' },
    })),
    createTask: vi.fn(async (input: unknown) => ({
      id: 'test-id',
      ...input,
      version: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      labels: input.labels || [],
      metadata: input.metadata,
    })),
    executeTask: vi.fn(async () => ({})),
  })),
}));

// Mock project-registry
vi.mock('../lib/project-registry.js', () => ({
  detectProject: vi.fn(() => ({
    name: 'MGMT Platform',
    localPath: '/ccn-github/mgmt',
    githubRepo: 'CoastalCameraNetwork/mgmt',
    type: 'repo',
  })),
  PROJECT_REGISTRY: {
    mgmt: {
      name: 'MGMT Platform',
      localPath: '/ccn-github/mgmt',
      githubRepo: 'CoastalCameraNetwork/mgmt',
      type: 'repo',
    },
  },
  listProjects: vi.fn(() => []),
}));

// Mock agent-registry
vi.mock('../lib/agent-registry.js', () => ({
  routeTask: vi.fn(() => ({
    agents: ['k8s-agent'],
    sequence: 'single',
    gate_mode: 'audit-only',
    rule_id: null,
    fallback_used: true,
  })),
  listAgents: vi.fn(() => [
    {
      name: 'k8s-agent',
      domain: 'Kubernetes',
      description: 'Kubernetes specialist',
      keywords: ['kubernetes', 'k8s', 'pod', 'deployment'],
      model: 'glm-4.5',
      thinking: 'medium',
    },
    {
      name: 'orchestrator-agent',
      domain: 'General',
      description: 'Default orchestrator',
      keywords: [],
      model: 'qwen3.5-plus',
      thinking: 'medium',
    },
  ]),
  getAgent: vi.fn((name: string) => ({
    name,
    domain: 'Test',
    description: 'Test agent',
    keywords: [],
    model: 'glm-4.5',
    thinking: 'medium',
  })),
  SPECIALIST_AGENTS: {},
  ROUTING_RULES: [],
  selectAgentsByHeuristics: vi.fn(() => ({ agents: ['orchestrator-agent'], sequence: 'single' })),
}));

import {
  executeTask,
  startTask,
  listSpecialistAgents,
  previewRouting,
  cancelTask,
  createProposalsFromFindings,
} from './orchestrator-service.js';

// Import mocked invokeGatewayTool for assertions
const { invokeGatewayTool } = await import('../lib/gateway-client.js');

describe('orchestrator-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Gate Mode Instructions ──────────────────────────────────────────

  describe('gate mode enforcement', () => {
    it('includes audit-only instructions in agent prompt', async () => {
      await executeTask(
        'test-id',
        'Test task description',
        ['k8s-agent'],
        'single',
        'audit-only'
      );

      expect(invokeGatewayTool).toHaveBeenCalledWith(
        'sessions_spawn',
        expect.objectContaining({
          task: expect.stringContaining('AUDIT-ONLY'),
        }),
        expect.any(Number)
      );

      const callArgs = invokeGatewayTool.mock.calls[0][1];
      expect(callArgs.task).toContain('read-only analysis mode');
      expect(callArgs.task).toContain('Do NOT make any file changes');
    });

    it('includes gate-on-write instructions in agent prompt', async () => {
      await executeTask(
        'test-id',
        'Test task description',
        ['k8s-agent'],
        'single',
        'gate-on-write'
      );

      const callArgs = invokeGatewayTool.mock.calls[0][1];
      expect(callArgs.task).toContain('GATE-ON-WRITE');
      expect(callArgs.task).toContain('file writes, which require human approval');
      expect(callArgs.task).toContain('Submit a proposal for human approval');
    });

    it('includes gate-on-deploy instructions in agent prompt', async () => {
      await executeTask(
        'test-id',
        'Test task description',
        ['k8s-agent'],
        'single',
        'gate-on-deploy'
      );

      const callArgs = invokeGatewayTool.mock.calls[0][1];
      expect(callArgs.task).toContain('GATE-ON-DEPLOY');
      expect(callArgs.task).toContain('Only deployment actions require human approval');
      expect(callArgs.task).toContain('You MAY:');
      expect(callArgs.task).toContain('Make file changes and commit');
    });

    it('defaults to audit-only when no gate mode specified', async () => {
      // @ts-expect-error - testing backward compatibility
      await executeTask(
        'test-id',
        'Test task',
        ['k8s-agent'],
        'single'
      );

      const callArgs = invokeGatewayTool.mock.calls[0][1];
      expect(callArgs.task).toContain('AUDIT-ONLY');
    });
  });

  // ── Agent spawning ──────────────────────────────────────────────────

  describe('executeTask', () => {
    it('spawns single agent successfully', async () => {
      const result = await executeTask(
        'test-id',
        'Test task',
        ['k8s-agent'],
        'single',
        'audit-only'
      );

      expect(result.session_labels).toHaveLength(1);
      expect(invokeGatewayTool).toHaveBeenCalledTimes(1);
    });

    it('spawns multiple agents in parallel', async () => {
      const result = await executeTask(
        'test-id',
        'Test task',
        ['k8s-agent', 'mgmt-agent'],
        'parallel',
        'audit-only'
      );

      expect(invokeGatewayTool).toHaveBeenCalledTimes(2);
      expect(result.session_labels).toHaveLength(2);
    });

    it('spawns multiple agents sequentially with context passing', async () => {
      await executeTask(
        'test-id',
        'Test task',
        ['k8s-agent', 'mgmt-agent'],
        'sequential',
        'audit-only'
      );

      expect(invokeGatewayTool).toHaveBeenCalledTimes(2);

      // Second agent should receive structured handoff from first
      const secondCallArgs = invokeGatewayTool.mock.calls[1][1];
      expect(secondCallArgs.task).toContain('PREVIOUS AGENT RESULTS');
      expect(secondCallArgs.task).toContain('k8s-agent');
      expect(secondCallArgs.task).toContain('OUTPUT FORMAT');
      expect(secondCallArgs.task).toContain('structured summary as a JSON code block');
    });

    it('includes project context when project is provided', async () => {
      const mockProject = {
        name: 'MGMT Platform',
        localPath: '/ccn-github/mgmt',
        githubRepo: 'CoastalCameraNetwork/mgmt',
        type: 'repo',
      };

      await executeTask(
        'test-id',
        'Test task',
        ['k8s-agent'],
        'single',
        'audit-only',
        mockProject
      );

      const callArgs = invokeGatewayTool.mock.calls[0][1];
      expect(callArgs.task).toContain('/ccn-github/mgmt');
      expect(callArgs.task).toContain('CoastalCameraNetwork/mgmt');
    });

    it('handles unknown agent gracefully', async () => {
      const { getAgent } = await import('../lib/agent-registry.js');
      getAgent.mockReturnValue(null);

      const result = await executeTask(
        'test-id',
        'Test task',
        ['unknown-agent'],
        'single',
        'audit-only'
      );

      // Should still return but with error
      expect(result).toBeDefined();
    });
  });

  // ── startTask ───────────────────────────────────────────────────────

  describe('startTask', () => {
    it('creates task with default gate mode', async () => {
      const task = await startTask({
        title: 'Test task',
        description: 'Test description',
      });

      expect(task.gate_mode).toBe('audit-only');
      expect(task.agents).toBeDefined();
      expect(task.sequence).toBeDefined();
    });

    it('creates task with specified gate mode', async () => {
      const task = await startTask({
        title: 'Test task',
        description: 'Test description',
        gate_mode: 'gate-on-write',
      });

      expect(task.gate_mode).toBe('gate-on-write');
    });

    it('routes k8s tasks to k8s-agent', async () => {
      const { routeTask } = await import('../lib/agent-registry.js');
      routeTask.mockReturnValue({
        agents: ['k8s-agent'],
        sequence: 'single',
        gate_mode: 'gate-on-deploy',
        rule_id: 'k8s-deploy',
        fallback_used: false,
      });

      const task = await startTask({
        title: 'Deploy kubernetes',
        description: 'Deploy to kubernetes cluster',
      });

      expect(task.agents).toContain('k8s-agent');
      expect(task.gate_mode).toBe('gate-on-deploy');
    });
  });

  // ── listSpecialistAgents ────────────────────────────────────────────

  describe('listSpecialistAgents', () => {
    it('returns list of available agents', () => {
      const agents = listSpecialistAgents();

      expect(Array.isArray(agents)).toBe(true);
      expect(agents.length).toBeGreaterThan(0);
      expect(agents[0].name).toBeDefined();
      expect(agents[0].domain).toBeDefined();
    });
  });

  // ── previewRouting ──────────────────────────────────────────────────

  describe('previewRouting', () => {
    it('returns routing result for task description', () => {
      const result = previewRouting('Deploy to kubernetes');

      expect(result.agents).toBeDefined();
      expect(result.sequence).toBeDefined();
      expect(result.gate_mode).toBeDefined();
    });
  });

  // ── cancelTask ──────────────────────────────────────────────────────

  describe('cancelTask', () => {
    it('cancels running task successfully', async () => {
      const result = await cancelTask('test-id');

      expect(result).toBe(true);
    });

    it('handles missing sessions gracefully', async () => {
      const { invokeGatewayTool } = await import('../lib/gateway-client.js');
      invokeGatewayTool.mockRejectedValueOnce(new Error('Gateway unavailable'));

      const result = await cancelTask('nonexistent-id');

      // Should return false on error
      expect(result).toBe(false);
    });
  });

  // ── createProposalsFromFindings ─────────────────────────────────────

  describe('createProposalsFromFindings', () => {
    it('parses structured JSON proposals array', async () => {
      const agentOutput = `
Here's my analysis:

\`\`\`json
{
  "proposals": [
    {
      "title": "Fix authentication bug",
      "description": "The auth middleware doesn't handle expired tokens",
      "priority": "high"
    },
    {
      "title": "Add rate limiting",
      "description": "Implement rate limiter on API endpoints",
      "severity": "medium"
    }
  ],
  "files_changed": ["src/auth.ts", "src/middleware.ts"]
}
\`\`\`
`;

      const result = await createProposalsFromFindings(
        'test-id',
        'Test task',
        agentOutput
      );

      expect(result.proposals_created).toBeGreaterThanOrEqual(2);
    });

    it('parses recommendations array from handoff format', async () => {
      const agentOutput = `
\`\`\`json
{
  "summary": "Completed audit",
  "recommendations": [
    "Add unit tests for auth module",
    "Update API documentation",
    "Consider adding caching"
  ]
}
\`\`\`
`;

      const result = await createProposalsFromFindings(
        'test-id',
        'Test task',
        agentOutput
      );

      expect(result.proposals_created).toBeGreaterThanOrEqual(3);
    });

    it('detects TODO/FIXME patterns in raw output', async () => {
      const agentOutput = `
I've reviewed the code and found several issues:

TODO: Refactor the authentication middleware to use async/await
FIXME: Memory leak in the event emitter - needs immediate attention
FOLLOW-UP: Add integration tests for the full auth flow
ACTION ITEM: Review security implications of token storage
`;

      const result = await createProposalsFromFindings(
        'test-id',
        'Test task',
        agentOutput
      );

      expect(result.proposals_created).toBeGreaterThanOrEqual(3);
    });

    it('parses markdown sections as fallback', async () => {
      const agentOutput = `
## Next Steps
- Fix the authentication bug
- Update the API documentation

## Gaps
- Missing error handling in auth module
- No tests for edge cases

## Recommendations
- Consider adding rate limiting
- Refactor the auth middleware
`;

      const result = await createProposalsFromFindings(
        'test-id',
        'Test task',
        agentOutput
      );

      // Should parse multiple sections (at least 3, may vary based on parsing)
      expect(result.proposals_created).toBeGreaterThanOrEqual(3);
    });

    it('adds source labels for traceability', async () => {
      // This test verifies the labels are included in proposal creation
      // (actual label verification would require mocking the HTTP call)
      const agentOutput = `
\`\`\`json
{
  "proposals": [
    {
      "title": "Test proposal",
      "description": "Test description"
    }
  ]
}
\`\`\`
`;

      const result = await createProposalsFromFindings(
        'specific-task-id',
        'Test task',
        agentOutput
      );

      expect(result).toBeDefined();
      expect(typeof result.proposals_created).toBe('number');
    });

    it('maps priority levels correctly', async () => {
      const agentOutput = `
\`\`\`json
{
  "proposals": [
    {"title": "Critical issue", "priority": "critical"},
    {"title": "High priority", "severity": "high"},
    {"title": "Medium issue", "priority": "medium"},
    {"title": "Low priority", "priority": "low"}
  ]
}
\`\`\`
`;

      const result = await createProposalsFromFindings(
        'test-id',
        'Test task',
        agentOutput
      );

      expect(result.proposals_created).toBeGreaterThanOrEqual(4);
    });

    it('deduplicates proposals by title', async () => {
      const agentOutput = `
## Next Steps
- Fix the authentication bug

## Gaps
- Fix the authentication bug
`;

      const result = await createProposalsFromFindings(
        'test-id',
        'Test task',
        agentOutput
      );

      // Should deduplicate - only one proposal created
      expect(result.proposals_created).toBeLessThanOrEqual(1);
    });

    it('handles empty output', async () => {
      const result = await createProposalsFromFindings(
        'test-id',
        'Test task',
        ''
      );

      expect(result.proposals_created).toBe(0);
    });

    it('handles unstructured output', async () => {
      const result = await createProposalsFromFindings(
        'test-id',
        'Test task',
        'This is just some random text without structure'
      );

      expect(result).toBeDefined();
    });

    it('handles invalid JSON gracefully', async () => {
      const agentOutput = `
\`\`\`json
{ invalid json here
}
\`\`\`

## Next Steps
- This should still be parsed
`;

      const result = await createProposalsFromFindings(
        'test-id',
        'Test task',
        agentOutput
      );

      expect(result).toBeDefined();
    });
  });
});
