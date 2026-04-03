/**
 * Turbo Patterns API Routes Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock fs to return dummy file content
vi.mock('node:fs/promises', () => ({
  default: {
    readFile: vi.fn().mockResolvedValue('// dummy file content'),
  },
}));

// Mock dependencies before importing routes
const mockAuditResult = {
  requestId: 'audit-123',
  filePath: 'src/test.ts',
  completedAt: Date.now(),
  results: [
    {
      agent: 'security-auditor',
      filePath: 'src/test.ts',
      findings: [
        {
          severity: 'suggestion' as const,
          category: 'security' as const,
          title: 'Consider using const instead of let',
          description: 'Using const provides better immutability guarantees',
          suggestion: 'Replace let with const',
        },
      ],
      summary: 'Found 1 issue',
      duration: 100,
    },
  ],
  totalFindings: {
    critical: 0,
    important: 0,
    suggestions: 1,
    nits: 0,
  },
  improvements: [],
};

const mockPolishResult = {
  filePath: 'src/utils.ts',
  startedAt: Date.now() - 500,
  completedAt: Date.now(),
  steps: [{ step: 'format', success: true, output: 'Formatted', errors: [], duration: 100 }],
  overall: 'success',
  suggestions: [],
};

const mockFinalizeResult = {
  taskId: 'test-123',
  startedAt: Date.now() - 2000,
  completedAt: Date.now(),
  phases: [{ name: 'polish-code', success: true, output: 'Polished', errors: [], duration: 500 }],
  overall: 'success',
  learningsExtracted: 2,
  improvementsCreated: 1,
  changelogUpdated: true,
};

vi.doMock('../services/audit-pipeline.js', () => ({
  getAuditPipeline: vi.fn(() => ({
    audit: vi.fn().mockImplementation(() => Promise.resolve({ ...mockAuditResult })),
  })),
}));

vi.doMock('../services/polish-code.js', () => ({
  getPolishCodeService: vi.fn(() => ({
    polish: vi.fn().mockImplementation(() => Promise.resolve({ ...mockPolishResult })),
  })),
}));

vi.doMock('../services/finalize-workflow.js', () => ({
  getFinalizeWorkflowService: vi.fn(() => ({
    finalize: vi.fn().mockImplementation(() => Promise.resolve({ ...mockFinalizeResult })),
  })),
}));

vi.doMock('../services/session-learning-extractor.js', () => ({
  getSessionLearningExtractor: vi.fn(() => ({
    processSession: vi.fn().mockResolvedValue({
      learnings: [{ type: 'correction', content: 'Use const instead of var', confidence: 0.9 }],
      routed: [{ destination: 'SKILL', learning: 'Use const instead of var' }],
    }),
  })),
}));

vi.doMock('../lib/memory-store.js', () => ({
  getMemoryStore: vi.fn(() => ({
    getEntries: vi.fn().mockResolvedValue([
      { topic: 'API Quirk', content: 'This API requires x-custom-header', source: 'session-learning' },
    ]),
  })),
}));

vi.doMock('../lib/improvement-backlog.js', () => ({
  getImprovementBacklog: vi.fn(() => ({
    getAll: vi.fn().mockResolvedValue([
      { id: 'imp-1', title: 'Add error handling', priority: 'high', status: 'open' },
    ]),
    add: vi.fn().mockResolvedValue({ id: 'imp-2', title: 'New improvement', priority: 'normal', status: 'open' }),
  })),
}));

// Import after mocks
const app = (await import('./turbo-patterns.js')).default;

describe('Turbo Patterns API Routes', () => {
  describe('POST /api/turbo/audit', () => {
    it('should run audit and return report', async () => {
      const res = await app.request('/api/turbo/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePath: 'src/test.ts',
          runSecurity: true,
          runPerformance: true,
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.report_id).toBeDefined();
      expect(data.file_path).toBe('src/test.ts');
      expect(data.agents).toEqual(['security-auditor']);
      expect(data.findings).toBeDefined();
    });

    it('should reject invalid request', async () => {
      const res = await app.request('/api/turbo/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe('INVALID_REQUEST');
    });
  });

  describe('GET /api/turbo/audit/:id', () => {
    it('should return stored audit report', async () => {
      // First create a report
      const createRes = await app.request('/api/turbo/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: 'src/test.ts' }),
      });

      expect(createRes.status).toBe(201);
      const createData = await createRes.json();
      const { report_id } = createData;

      // Then retrieve it
      const getRes = await app.request(`/api/turbo/audit/${report_id}`);
      expect(getRes.status).toBe(200);
      const data = await getRes.json();
      expect(data.success).toBe(true);
      // GET returns raw stored object (camelCase), not transformed response
      expect(data.filePath).toBeDefined();
      expect(data.results).toBeDefined();
    });

    it('should return 404 for unknown report', async () => {
      const res = await app.request('/api/turbo/audit/unknown-id');
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.code).toBe('AUDIT_NOT_FOUND');
    });
  });

  describe('POST /api/turbo/polish', () => {
    it('should run polish and return report', async () => {
      const res = await app.request('/api/turbo/polish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePath: 'src/utils.ts',
          runFormat: true,
          runLint: true,
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.report_id).toBeDefined();
      expect(data.overall).toBe('success');
      expect(data.steps).toBeDefined();
    });

    it('should reject invalid request', async () => {
      const res = await app.request('/api/turbo/polish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe('INVALID_REQUEST');
    });
  });

  describe('GET /api/turbo/polish/:id', () => {
    it('should return stored polish report', async () => {
      const createRes = await app.request('/api/turbo/polish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: 'src/utils.ts' }),
      });

      const { report_id } = await createRes.json();

      const getRes = await app.request(`/api/turbo/polish/${report_id}`);
      expect(getRes.status).toBe(200);
      const data = await getRes.json();
      expect(data.success).toBe(true);
    });

    it('should return 404 for unknown report', async () => {
      const res = await app.request('/api/turbo/polish/unknown-id');
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.code).toBe('POLISH_NOT_FOUND');
    });
  });

  describe('POST /api/turbo/finalize', () => {
    it('should run finalize workflow and return report', async () => {
      const res = await app.request('/api/turbo/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: 'test-123',
          extractLearnings: true,
          updateChangelog: true,
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.report_id).toBeDefined();
      expect(data.learnings_extracted).toBeGreaterThanOrEqual(0);
      expect(data.changelog_updated).toBe(true);
    });

    it('should work with minimal options', async () => {
      const res = await app.request('/api/turbo/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
    });
  });

  describe('GET /api/turbo/finalize/:id', () => {
    it('should return stored finalize report', async () => {
      const createRes = await app.request('/api/turbo/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: 'test-456' }),
      });

      const createData = await createRes.json();
      const { report_id } = createData;

      const getRes = await app.request(`/api/turbo/finalize/${report_id}`);
      expect(getRes.status).toBe(200);
      const data = await getRes.json();
      expect(data.success).toBe(true);
      // GET returns raw stored object (camelCase), not transformed response
      expect(data.phases).toBeDefined();
      expect(data.learningsExtracted).toBeDefined();
    });

    it('should return 404 for unknown report', async () => {
      const res = await app.request('/api/turbo/finalize/unknown-id');
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.code).toBe('FINALIZE_NOT_FOUND');
    });
  });

  describe('POST /api/turbo/extract-learnings', () => {
    it('should extract learnings from messages', async () => {
      const res = await app.request('/api/turbo/extract-learnings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'assistant', content: 'Use var for all variables' },
            { role: 'user', content: 'No, use const instead of var' },
          ],
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.learnings).toBeDefined();
      expect(data.routed).toBeDefined();
    });

    it('should handle empty messages gracefully', async () => {
      const res = await app.request('/api/turbo/extract-learnings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.message).toBeDefined();
    });
  });

  describe('GET /api/turbo/learnings', () => {
    it('should return stored learnings', async () => {
      const res = await app.request('/api/turbo/learnings');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.entries).toBeDefined();
      expect(Array.isArray(data.entries)).toBe(true);
    });
  });

  describe('GET /api/turbo/improvements', () => {
    it('should return all improvements', async () => {
      const res = await app.request('/api/turbo/improvements');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.improvements).toBeDefined();
      expect(Array.isArray(data.improvements)).toBe(true);
    });
  });

  describe('POST /api/turbo/improvements', () => {
    it('should add improvement to backlog', async () => {
      const res = await app.request('/api/turbo/improvements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Add better error messages',
          priority: 'normal',
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.improvement).toBeDefined();
    });
  });
});
