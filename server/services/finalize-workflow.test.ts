/**
 * Finalize Workflow Service Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FinalizeWorkflowService, getFinalizeWorkflowService } from './finalize-workflow';
import fs from 'node:fs/promises';
import path from 'node:path';

// Mock executeCommand at the module level by mocking child_process
vi.mock('node:child_process', async () => {
  const actual = await vi.importActual('node:child_process');
  return {
    ...actual,
  };
});

// Mock polish-code service
vi.mock('./polish-code', () => ({
  getPolishCodeService: vi.fn(() => ({
    polish: vi.fn().mockResolvedValue({
      overall: 'success',
      steps: [{ step: 'format', success: true, errors: [], duration: 100 }],
      suggestions: [],
    }),
  })),
}));

// Mock session-learning-extractor
vi.mock('./session-learning-extractor', () => ({
  getSessionLearningExtractor: vi.fn(() => ({
    processSession: vi.fn().mockResolvedValue({ learnings: [], routed: [] }),
  })),
}));

// Mock improvement-backlog
vi.mock('../lib/improvement-backlog', () => ({
  getImprovementBacklog: vi.fn(() => ({
    add: vi.fn().mockResolvedValue(undefined),
  })),
}));

describe('FinalizeWorkflowService', () => {
  let service: FinalizeWorkflowService;
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join('/tmp', `finalize-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
    service = new FinalizeWorkflowService(testDir);
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('finalize', () => {
    it('should run all enabled phases', async () => {
      const report = await service.finalize({
        taskId: 'test-123',
        filePaths: ['src/utils.ts'],
        extractLearnings: true,
        updateChangelog: true,
        runTests: true,
      });

      expect(report.taskId).toBe('test-123');
      expect(report.phases.length).toBeGreaterThan(0);
      expect(report.phases.map(p => p.name)).toContain('polish-code');
    });

    it('should skip disabled phases', async () => {
      const report = await service.finalize({
        taskId: 'test-456',
        extractLearnings: false,
        updateChangelog: false,
      });

      expect(report.phases.some(p => p.name === 'extract-learnings')).toBe(false);
      expect(report.phases.some(p => p.name === 'update-changelog')).toBe(false);
    });

    it('should track learnings extracted', async () => {
      const report = await service.finalize({
        taskId: 'test-789',
        extractLearnings: true,
      });

      expect(report.learningsExtracted).toBeGreaterThanOrEqual(0);
    });

    it('should track changelog update status', async () => {
      const report = await service.finalize({
        taskId: 'test-changelog',
        updateChangelog: true,
      });

      // Changelog should be attempted
      expect(report.changelogUpdated).toBe(true);
    });
  });

  describe('updateChangelog', () => {
    it('should create CHANGELOG.md if it does not exist', async () => {
      const changelogPath = path.join(testDir, 'CHANGELOG.md');

      // Ensure it doesn't exist
      try {
        await fs.access(changelogPath);
        await fs.unlink(changelogPath);
      } catch {
        // Expected - file doesn't exist
      }

      const result = await (service as any).updateChangelog({});

      expect(result.success).toBe(true);
      expect(result.changelogUpdated).toBe(true);

      // Verify file was created
      const content = await fs.readFile(changelogPath, 'utf-8');
      expect(content).toContain('# Changelog');
    });

    it('should append to existing CHANGELOG.md', async () => {
      const changelogPath = path.join(testDir, 'CHANGELOG.md');
      const initialContent = '# Changelog\n\nSome existing entry\n';
      await fs.writeFile(changelogPath, initialContent, 'utf-8');

      const result = await (service as any).updateChangelog({
        taskId: 'test-append',
      });

      expect(result.success).toBe(true);

      const content = await fs.readFile(changelogPath, 'utf-8');
      expect(content).toContain('Some existing entry');
      expect(content).toContain('test-append');
    });
  });

  describe('exportToMarkdown', () => {
    it('should generate markdown report', async () => {
      const report = {
        taskId: 'test-123',
        startedAt: Date.now() - 1000,
        completedAt: Date.now(),
        phases: [
          { name: 'polish-code', success: true, output: 'Formatted', errors: [], duration: 100 },
          { name: 'extract-learnings', success: true, output: 'Extracted', errors: [], duration: 200 },
        ],
        overall: 'success' as const,
        learningsExtracted: 3,
        improvementsCreated: 1,
        changelogUpdated: true,
      };

      const md = await service.exportToMarkdown(report);

      expect(md).toContain('# Finalize Workflow Report');
      expect(md).toContain('**Task ID:** test-123');
      expect(md).toContain('## Summary');
      expect(md).toContain('## Phases');
    });

    it('should show correct status emoji', async () => {
      const successReport = {
        taskId: 'test',
        startedAt: Date.now() - 1000,
        completedAt: Date.now(),
        phases: [],
        overall: 'success' as const,
        learningsExtracted: 0,
        improvementsCreated: 0,
        changelogUpdated: false,
      };

      const failedReport = {
        taskId: 'test',
        startedAt: Date.now() - 1000,
        completedAt: Date.now(),
        phases: [],
        overall: 'failed' as const,
        learningsExtracted: 0,
        improvementsCreated: 0,
        changelogUpdated: false,
      };

      const successMd = await service.exportToMarkdown(successReport);
      const failedMd = await service.exportToMarkdown(failedReport);

      expect(successMd).toContain('✅');
      expect(failedMd).toContain('❌');
    });

    it('should include duration', async () => {
      const report = {
        taskId: 'test',
        startedAt: Date.now() - 5000,
        completedAt: Date.now(),
        phases: [],
        overall: 'success' as const,
        learningsExtracted: 0,
        improvementsCreated: 0,
        changelogUpdated: false,
      };

      const md = await service.exportToMarkdown(report);

      expect(md).toContain('Duration');
    });
  });

  describe('getFinalizeWorkflowService (singleton)', () => {
    it('should return the same instance', () => {
      const instance1 = getFinalizeWorkflowService();
      const instance2 = getFinalizeWorkflowService();

      expect(instance1).toBe(instance2);
    });
  });
});
