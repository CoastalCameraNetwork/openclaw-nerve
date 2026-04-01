/**
 * Dependency Service Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { wouldCreateCycle, canExecuteTask, getDependencyGraph } from './dependency-service.js';

// Mock store factory
function createMockStore(tasks: Record<string, any>) {
  return {
    getTask: vi.fn((id: string) => Promise.resolve(tasks[id] || null)),
  };
}

vi.mock('../lib/kanban-store.js', () => ({
  getKanbanStore: vi.fn(),
}));

describe('dependency-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('wouldCreateCycle', () => {
    it('returns false for simple dependency (no cycle)', async () => {
      const { getKanbanStore } = await import('../lib/kanban-store.js');
      const mockStore = createMockStore({
        task2: { id: 'task2', status: 'todo', dependencies: { blocked_by: [], blocks: [] } },
        task1: { id: 'task1', status: 'todo', dependencies: { blocked_by: [], blocks: [] } },
      });
      (getKanbanStore as any).mockReturnValue(mockStore);

      const result = await wouldCreateCycle('task1', 'task2');
      expect(result.wouldCycle).toBe(false);
    });

    it('returns true for direct circular dependency', async () => {
      const { getKanbanStore } = await import('../lib/kanban-store.js');
      // task1 depends on task2, task2 depends on task1
      const mockStore = createMockStore({
        task2: { id: 'task2', status: 'todo', dependencies: { blocked_by: ['task1'], blocks: [] } },
        task1: { id: 'task1', status: 'todo', dependencies: { blocked_by: [], blocks: ['task2'] } },
      });
      (getKanbanStore as any).mockReturnValue(mockStore);

      const result = await wouldCreateCycle('task1', 'task2');
      expect(result.wouldCycle).toBe(true);
      expect(result.cyclePath).toContain('task1');
    });

    it('returns true for indirect circular dependency', async () => {
      const { getKanbanStore } = await import('../lib/kanban-store.js');
      // task1 -> task2 -> task3 -> task1 (cycle)
      const mockStore = createMockStore({
        task2: { id: 'task2', status: 'todo', dependencies: { blocked_by: ['task3'], blocks: [] } },
        task3: { id: 'task3', status: 'todo', dependencies: { blocked_by: ['task1'], blocks: [] } },
        task1: { id: 'task1', status: 'todo', dependencies: { blocked_by: [], blocks: [] } },
      });
      (getKanbanStore as any).mockReturnValue(mockStore);

      const result = await wouldCreateCycle('task1', 'task2');
      expect(result.wouldCycle).toBe(true);
      expect(result.cyclePath).toEqual(['task2', 'task3', 'task1']);
    });

    it('returns false when dependency chain has no cycle', async () => {
      const { getKanbanStore } = await import('../lib/kanban-store.js');
      // task1 -> task2 -> task3 (no cycle)
      const mockStore = createMockStore({
        task2: { id: 'task2', status: 'todo', dependencies: { blocked_by: ['task3'], blocks: [] } },
        task3: { id: 'task3', status: 'todo', dependencies: { blocked_by: [], blocks: [] } },
        task1: { id: 'task1', status: 'todo', dependencies: { blocked_by: [], blocks: [] } },
      });
      (getKanbanStore as any).mockReturnValue(mockStore);

      const result = await wouldCreateCycle('task1', 'task2');
      expect(result.wouldCycle).toBe(false);
    });
  });

  describe('canExecuteTask', () => {
    it('returns true when no dependencies', async () => {
      const { getKanbanStore } = await import('../lib/kanban-store.js');
      const mockStore = createMockStore({
        task1: { id: 'task1', status: 'todo', dependencies: { blocked_by: [], blocks: [] } },
      });
      (getKanbanStore as any).mockReturnValue(mockStore);

      const result = await canExecuteTask('task1');
      expect(result.canExecute).toBe(true);
    });

    it('returns false when blocking task is not done', async () => {
      const { getKanbanStore } = await import('../lib/kanban-store.js');
      const mockStore = createMockStore({
        task1: { id: 'task1', status: 'todo', dependencies: { blocked_by: ['task2'], blocks: [] } },
        task2: { id: 'task2', status: 'in-progress', dependencies: { blocked_by: [], blocks: ['task1'] } },
      });
      (getKanbanStore as any).mockReturnValue(mockStore);

      const result = await canExecuteTask('task1');
      expect(result.canExecute).toBe(false);
      expect(result.blockedBy).toContain('task2');
    });

    it('returns false when blocking task is in todo', async () => {
      const { getKanbanStore } = await import('../lib/kanban-store.js');
      const mockStore = createMockStore({
        task1: { id: 'task1', status: 'todo', dependencies: { blocked_by: ['task2'], blocks: [] } },
        task2: { id: 'task2', status: 'todo', dependencies: { blocked_by: [], blocks: ['task1'] } },
      });
      (getKanbanStore as any).mockReturnValue(mockStore);

      const result = await canExecuteTask('task1');
      expect(result.canExecute).toBe(false);
      expect(result.blockedBy).toContain('task2');
    });

    it('returns true when all blocking tasks are done', async () => {
      const { getKanbanStore } = await import('../lib/kanban-store.js');
      const mockStore = createMockStore({
        task1: { id: 'task1', status: 'todo', dependencies: { blocked_by: ['task2', 'task3'], blocks: [] } },
        task2: { id: 'task2', status: 'done', dependencies: { blocked_by: [], blocks: ['task1'] } },
        task3: { id: 'task3', status: 'done', dependencies: { blocked_by: [], blocks: ['task1'] } },
      });
      (getKanbanStore as any).mockReturnValue(mockStore);

      const result = await canExecuteTask('task1');
      expect(result.canExecute).toBe(true);
    });

    it('returns false if blocking task not found', async () => {
      const { getKanbanStore } = await import('../lib/kanban-store.js');
      const mockStore = createMockStore({
        task1: { id: 'task1', status: 'todo', dependencies: { blocked_by: ['nonexistent'], blocks: [] } },
      });
      (getKanbanStore as any).mockReturnValue(mockStore);

      const result = await canExecuteTask('task1');
      expect(result.canExecute).toBe(false);
      expect(result.blockedBy).toContain('nonexistent');
    });
  });

  describe('getDependencyGraph', () => {
    it('returns empty arrays when no dependencies', async () => {
      const { getKanbanStore } = await import('../lib/kanban-store.js');
      const mockStore = createMockStore({
        task1: { id: 'task1', status: 'todo', dependencies: { blocked_by: [], blocks: [] } },
      });
      (getKanbanStore as any).mockReturnValue(mockStore);

      const result = await getDependencyGraph('task1');
      expect(result.upstream).toEqual([]);
      expect(result.downstream).toEqual([]);
    });

    it('returns upstream and downstream tasks', async () => {
      const { getKanbanStore } = await import('../lib/kanban-store.js');
      const mockStore = createMockStore({
        task1: { id: 'task1', status: 'todo', dependencies: { blocked_by: ['task2'], blocks: ['task3'] } },
        task2: { id: 'task2', status: 'done', title: 'Upstream Task', dependencies: { blocked_by: [], blocks: [] } },
        task3: { id: 'task3', status: 'todo', title: 'Downstream Task', dependencies: { blocked_by: [], blocks: [] } },
      });
      (getKanbanStore as any).mockReturnValue(mockStore);

      const result = await getDependencyGraph('task1');
      expect(result.upstream).toEqual([{ id: 'task2', title: 'Upstream Task', status: 'done' }]);
      expect(result.downstream).toEqual([{ id: 'task3', title: 'Downstream Task', status: 'todo' }]);
    });

    it('handles missing dependency tasks gracefully', async () => {
      const { getKanbanStore } = await import('../lib/kanban-store.js');
      const mockStore = createMockStore({
        task1: { id: 'task1', status: 'todo', dependencies: { blocked_by: ['nonexistent'], blocks: [] } },
      });
      (getKanbanStore as any).mockReturnValue(mockStore);

      const result = await getDependencyGraph('task1');
      expect(result.upstream).toEqual([]);
      expect(result.downstream).toEqual([]);
    });
  });
});
