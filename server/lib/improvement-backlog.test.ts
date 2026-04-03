/**
 * Improvement Backlog Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ImprovementBacklog, type Improvement } from './improvement-backlog';

// Mock fs module
vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual('node:fs/promises');
  return {
    ...(actual as object),
    default: {
      ...(actual as object),
    },
    mkdir: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    access: vi.fn(),
  };
});

describe('ImprovementBacklog', () => {
  let backlog: ImprovementBacklog;
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join('/tmp', `nerve-test-${Date.now()}`);
    backlog = new ImprovementBacklog(testDir);

    // Create test directory
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('init', () => {
    it('should create backlog file if it does not exist', async () => {
      await backlog.init();

      const backlogFile = path.join(testDir, 'improvements.json');
      await expect(fs.access(backlogFile)).resolves.not.toThrow();
    });

    it('should load existing backlog file', async () => {
      const backlogFile = path.join(testDir, 'improvements.json');
      const initialData = {
        improvements: [{ id: 'test-1', summary: 'Test', type: 'testing' as const, priority: 'low' as const, createdAt: Date.now(), source: 'manual' as const, status: 'pending' as const }],
        meta: { schemaVersion: 1, updatedAt: Date.now() },
      };
      await fs.writeFile(backlogFile, JSON.stringify(initialData), 'utf-8');

      const newBacklog = new ImprovementBacklog(testDir);
      await newBacklog.init();

      expect(newBacklog.getAll()).toHaveLength(1);
    });
  });

  describe('add', () => {
    it('should add a valid improvement', async () => {
      const improvement: Improvement = {
        id: 'test-1',
        summary: 'Add unit tests for auth module',
        location: 'server/routes/auth.ts',
        type: 'testing',
        priority: 'medium',
        createdAt: Date.now(),
        source: 'session-learning',
        status: 'pending',
      };

      await backlog.add(improvement);
      expect(backlog.getAll()).toHaveLength(1);
      expect(backlog.get('test-1')).toBeDefined();
    });

    it('should reject duplicate improvement IDs', async () => {
      const improvement: Improvement = {
        id: 'test-dup',
        summary: 'Test improvement',
        type: 'testing',
        priority: 'low',
        createdAt: Date.now(),
        source: 'manual',
      };

      await backlog.add(improvement);

      await expect(backlog.add(improvement)).rejects.toThrow('already exists');
    });

    it('should reject improvements with empty summary', async () => {
      const invalidImprovement = {
        id: 'test-invalid',
        summary: '',
        type: 'testing' as const,
        priority: 'low' as const,
        createdAt: Date.now(),
        source: 'manual' as const,
      };

      await expect(backlog.add(invalidImprovement)).rejects.toThrow();
    });
  });

  describe('get', () => {
    it('should get improvement by ID', async () => {
      const improvement: Improvement = {
        id: 'test-get',
        summary: 'Get test',
        type: 'feature',
        priority: 'high',
        createdAt: Date.now(),
        source: 'manual',
      };

      await backlog.add(improvement);

      const retrieved = backlog.get('test-get');
      expect(retrieved).toBeDefined();
      expect(retrieved?.summary).toBe('Get test');
    });

    it('should return undefined for non-existent ID', async () => {
      const result = backlog.get('non-existent');
      expect(result).toBeUndefined();
    });
  });

  describe('getAll', () => {
    it('should return all improvements', async () => {
      await backlog.add({
        id: 'test-1',
        summary: 'First',
        type: 'testing',
        priority: 'low',
        createdAt: Date.now(),
        source: 'manual',
      });
      await backlog.add({
        id: 'test-2',
        summary: 'Second',
        type: 'refactoring',
        priority: 'medium',
        createdAt: Date.now(),
        source: 'manual',
      });

      expect(backlog.getAll()).toHaveLength(2);
    });

    it('should filter by status', async () => {
      await backlog.add({
        id: 'test-pending',
        summary: 'Pending',
        type: 'testing',
        priority: 'low',
        createdAt: Date.now(),
        source: 'manual',
        status: 'pending',
      });
      await backlog.add({
        id: 'test-completed',
        summary: 'Completed',
        type: 'testing',
        priority: 'low',
        createdAt: Date.now(),
        source: 'manual',
        status: 'completed',
      });

      expect(backlog.getAll('pending')).toHaveLength(1);
      expect(backlog.getAll('completed')).toHaveLength(1);
    });
  });

  describe('complete', () => {
    it('should mark improvement as completed', async () => {
      const improvement: Improvement = {
        id: 'test-complete',
        summary: 'Complete test',
        type: 'bug-fix',
        priority: 'high',
        createdAt: Date.now(),
        source: 'code-review',
      };

      await backlog.add(improvement);
      await backlog.complete('test-complete');

      const updated = backlog.get('test-complete');
      expect(updated?.status).toBe('completed');
      expect(updated?.completedAt).toBeDefined();
    });

    it('should throw for non-existent improvement', async () => {
      await expect(backlog.complete('non-existent')).rejects.toThrow('not found');
    });
  });

  describe('update', () => {
    it('should update improvement fields', async () => {
      const improvement: Improvement = {
        id: 'test-update',
        summary: 'Update test',
        type: 'feature',
        priority: 'medium',
        createdAt: Date.now(),
        source: 'manual',
      };

      await backlog.add(improvement);
      await backlog.update('test-update', { priority: 'high', tags: ['urgent'] });

      const updated = backlog.get('test-update');
      expect(updated?.priority).toBe('high');
      expect(updated?.tags).toEqual(['urgent']);
    });

    it('should throw for non-existent improvement', async () => {
      await expect(backlog.update('non-existent', { summary: 'New' })).rejects.toThrow('not found');
    });
  });

  describe('remove', () => {
    it('should remove improvement', async () => {
      const improvement: Improvement = {
        id: 'test-remove',
        summary: 'Remove test',
        type: 'other',
        priority: 'low',
        createdAt: Date.now(),
        source: 'manual',
      };

      await backlog.add(improvement);
      await backlog.remove('test-remove');

      expect(backlog.get('test-remove')).toBeUndefined();
    });

    it('should throw for non-existent improvement', async () => {
      await expect(backlog.remove('non-existent')).rejects.toThrow('not found');
    });
  });

  describe('exportToMarkdown', () => {
    it('should generate markdown report', async () => {
      await backlog.add({
        id: 'test-md',
        summary: 'Markdown test',
        type: 'documentation',
        priority: 'medium',
        createdAt: Date.now(),
        source: 'manual',
      });

      const md = await backlog.exportToMarkdown();

      expect(md).toContain('# Nerve Improvement Backlog');
      expect(md).toContain('## Summary');
      expect(md).toContain('Markdown test');
    });

    it('should include completed items in separate section', async () => {
      await backlog.add({
        id: 'test-completed',
        summary: 'Completed item',
        type: 'feature',
        priority: 'high',
        createdAt: Date.now(),
        source: 'manual',
        status: 'completed',
      });

      const md = await backlog.exportToMarkdown();

      expect(md).toContain('## Completed Improvements');
      expect(md).toContain('Completed item');
    });
  });
});
