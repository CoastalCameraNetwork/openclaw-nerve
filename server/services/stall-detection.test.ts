import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkForStalledTasks, STALL_THRESHOLD_MS } from './stall-detection.js';

const mockStore = {
  getTask: vi.fn(),
  updateTask: vi.fn(),
  listTasks: vi.fn(),
};

vi.mock('../lib/kanban-store.js', () => ({
  getKanbanStore: () => mockStore,
}));

describe('stall-detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('detects stalled running task', async () => {
    const stalledTime = Date.now() - (STALL_THRESHOLD_MS + 10000);
    mockStore.listTasks.mockResolvedValue({
      items: [{
        id: 'task-1',
        title: 'Stalled Task',
        status: 'in-progress',
        run: {
          status: 'running',
          startedAt: stalledTime,
          sessionKey: 'kb-task-1-123',
        },
        updatedAt: stalledTime,
        version: 1,
      }],
    });

    mockStore.getTask.mockResolvedValue({
      id: 'task-1',
      title: 'Stalled Task',
      status: 'in-progress',
      run: { status: 'running', startedAt: stalledTime, sessionKey: 'kb-task-1-123' },
      updatedAt: stalledTime,
      version: 1,
    });

    const result = await checkForStalledTasks();
    expect(result.stalledTasks.length).toBeGreaterThan(0);
    expect(result.stalledTasks[0].taskId).toBe('task-1');
  });

  it('does not flag recent activity as stalled', async () => {
    const recentTime = Date.now() - 60000; // 1 minute ago
    mockStore.listTasks.mockResolvedValue({
      items: [{
        id: 'task-2',
        title: 'Active Task',
        status: 'in-progress',
        run: { status: 'running', startedAt: recentTime, sessionKey: 'kb-task-2-456' },
        updatedAt: recentTime,
        version: 1,
      }],
    });

    const result = await checkForStalledTasks();
    expect(result.stalledTasks.length).toBe(0);
  });

  it('returns empty list when no tasks are running', async () => {
    mockStore.listTasks.mockResolvedValue({
      items: [
        { id: 'task-3', status: 'todo', run: null },
        { id: 'task-4', status: 'done', run: null },
      ],
    });

    const result = await checkForStalledTasks();
    expect(result.stalledTasks.length).toBe(0);
  });
});
