/**
 * Dependency API Routes
 *
 * POST /api/dependencies/:taskId/add      - Add a dependency
 * POST /api/dependencies/:taskId/remove/:dependsOnId - Remove a dependency
 * GET  /api/dependencies/:taskId          - Get dependency graph
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { rateLimitGeneral } from '../middleware/rate-limit.js';
import { getKanbanStore } from '../lib/kanban-store.js';
import { wouldCreateCycle, canExecuteTask, getDependencyGraph } from '../services/dependency-service.js';

const app = new Hono();

const ErrorCode = {
  TASK_NOT_FOUND: 'TASK_NOT_FOUND',
  DEPENDENCY_NOT_MET: 'DEPENDENCY_NOT_MET',
  CIRCULAR_DEPENDENCY: 'CIRCULAR_DEPENDENCY',
  INVALID_REQUEST: 'INVALID_REQUEST',
} as const;

// POST /api/dependencies/:taskId/add
app.post('/api/dependencies/:taskId/add', rateLimitGeneral, async (c) => {
  try {
    const taskId = c.req.param('taskId');
    const body = await c.req.json();
    const schema = z.object({ dependsOn: z.string() });
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return c.json({
        error: 'Invalid request',
        code: ErrorCode.INVALID_REQUEST,
        details: parsed.error.flatten(),
      }, 400);
    }

    const { dependsOn } = parsed.data;

    const store = getKanbanStore();
    const task = await store.getTask(taskId);
    const dependencyTask = await store.getTask(dependsOn);

    if (!task) {
      return c.json({ error: 'Task not found', code: ErrorCode.TASK_NOT_FOUND }, 404);
    }
    if (!dependencyTask) {
      return c.json({ error: 'Dependency task not found', code: ErrorCode.TASK_NOT_FOUND }, 404);
    }

    // Check for circular dependency
    const cycleResult = await wouldCreateCycle(taskId, dependsOn);
    if (cycleResult.wouldCycle) {
      return c.json({
        error: `Adding this dependency would create a cycle: ${cycleResult.cyclePath?.join(' → ')}`,
        code: ErrorCode.CIRCULAR_DEPENDENCY,
      }, 400);
    }

    // Update both tasks
    await store.updateTask(taskId, task.version, {
      dependencies: {
        blocked_by: [...(task.dependencies?.blocked_by || []), dependsOn],
        blocks: task.dependencies?.blocks || [],
      },
    } as any);

    await store.updateTask(dependsOn, dependencyTask.version, {
      dependencies: {
        blocked_by: dependencyTask.dependencies?.blocked_by || [],
        blocks: [...(dependencyTask.dependencies?.blocks || []), taskId],
      },
    } as any);

    return c.json({ success: true, taskId, dependsOn });
  } catch (error) {
    console.error('Add dependency failed:', error);
    return c.json({ error: 'Failed to add dependency', code: ErrorCode.INVALID_REQUEST }, 500);
  }
});

// POST /api/dependencies/:taskId/remove/:dependsOnId
app.post('/api/dependencies/:taskId/remove/:dependsOnId', rateLimitGeneral, async (c) => {
  try {
    const taskId = c.req.param('taskId');
    const dependsOnId = c.req.param('dependsOnId');

    const store = getKanbanStore();
    const task = await store.getTask(taskId);
    const dependencyTask = await store.getTask(dependsOnId);

    if (!task || !dependencyTask) {
      return c.json({ error: 'Task not found', code: ErrorCode.TASK_NOT_FOUND }, 404);
    }

    // Remove from both tasks
    await store.updateTask(taskId, task.version, {
      dependencies: {
        blocked_by: (task.dependencies?.blocked_by || []).filter((id) => id !== dependsOnId),
        blocks: task.dependencies?.blocks || [],
      },
    } as any);

    await store.updateTask(dependsOnId, dependencyTask.version, {
      dependencies: {
        blocked_by: dependencyTask.dependencies?.blocked_by || [],
        blocks: (dependencyTask.dependencies?.blocks || []).filter((id) => id !== taskId),
      },
    } as any);

    return c.json({ success: true });
  } catch (error) {
    console.error('Remove dependency failed:', error);
    return c.json({ error: 'Failed to remove dependency', code: ErrorCode.INVALID_REQUEST }, 500);
  }
});

// GET /api/dependencies/:taskId
app.get('/api/dependencies/:taskId', rateLimitGeneral, async (c) => {
  try {
    const taskId = c.req.param('taskId');
    const graph = await getDependencyGraph(taskId);
    return c.json(graph);
  } catch (error) {
    console.error('Get dependency graph failed:', error);
    return c.json({ error: 'Failed to get dependencies', code: ErrorCode.TASK_NOT_FOUND }, 500);
  }
});

export default app;
