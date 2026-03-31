/**
 * Goals API Routes
 *
 * CRUD endpoints for managing goals.
 * Goals allow users to group tasks under outcome-oriented headers.
 *
 * GET    /api/orchestrator/goals          - List all goals
 * POST   /api/orchestrator/goals          - Create new goal
 * GET    /api/orchestrator/goals/:id      - Get single goal with progress
 * PUT    /api/orchestrator/goals/:id      - Update goal
 * DELETE /api/orchestrator/goals/:id      - Delete goal
 * POST   /api/orchestrator/goals/:id/tasks     - Add task to goal
 * DELETE /api/orchestrator/goals/:id/tasks/:id - Remove task from goal
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { rateLimitGeneral } from '../middleware/rate-limit.js';
import { getKanbanStore } from '../lib/kanban-store.js';
import { broadcast } from './events.js';

const app = new Hono();

// Goals storage file
const GOALS_FILE = process.env.NERVE_DATA_DIR
  ? `${process.env.NERVE_DATA_DIR}/goals.json`
  : './data/goals.json';

interface Goal {
  id: string;
  title: string;
  description?: string;
  createdAt: number;
  taskIds: string[];
  targetDate?: number;
  status: 'active' | 'completed' | 'archived';
  version: number;
}

interface GoalsStore {
  goals: Goal[];
  meta: {
    schemaVersion: number;
    updatedAt: number;
  };
}

// In-memory cache with file persistence
let goalsCache: GoalsStore | null = null;
let goalsLoadPromise: Promise<GoalsStore> | null = null;

async function loadGoals(): Promise<GoalsStore> {
  if (goalsCache) return goalsCache;
  if (goalsLoadPromise) return goalsLoadPromise;

  goalsLoadPromise = (async () => {
    const fs = await import('fs');
    const path = await import('path');

    try {
      // Ensure directory exists
      const dir = path.dirname(GOALS_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Load or create store
      if (fs.existsSync(GOALS_FILE)) {
        const content = fs.readFileSync(GOALS_FILE, 'utf-8');
        goalsCache = JSON.parse(content);
      } else {
        goalsCache = {
          goals: [],
          meta: {
            schemaVersion: 1,
            updatedAt: Date.now(),
          },
        };
        await saveGoals(goalsCache);
      }

      return goalsCache!;
    } catch (error) {
      console.error('Failed to load goals:', error);
      // Re-throw to let endpoint return 500 - don't silently fallback
      throw error;
    } finally {
      goalsLoadPromise = null;
    }
  })();

  return goalsLoadPromise;
}

async function saveGoals(store: GoalsStore): Promise<void> {
  const fs = await import('fs');
  try {
    store.meta.updatedAt = Date.now();
    fs.writeFileSync(GOALS_FILE, JSON.stringify(store, null, 2), 'utf-8');
    goalsCache = store;
  } catch (error) {
    console.error('Failed to save goals:', error);
    throw new Error(`Failed to persist goals: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

function generateId(): string {
  return `goal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Calculate progress for a goal
 */
async function calculateGoalProgress(goal: Goal): Promise<{
  completedTasks: number;
  totalTasks: number;
  progressPercent: number;
  blockedTasks: number;
  failedTasks: number;
}> {
  if (goal.taskIds.length === 0) {
    return {
      completedTasks: 0,
      totalTasks: 0,
      progressPercent: 0,
      blockedTasks: 0,
      failedTasks: 0,
    };
  }

  const store = getKanbanStore();
  let completed = 0;
  let blocked = 0;
  let failed = 0;

  for (const taskId of goal.taskIds) {
    try {
      const task = await store.getTask(taskId);
      if (task) {
        if (task.status === 'done') {
          completed++;
        } else if (task.labels?.includes('blocked')) {
          blocked++;
        }
      } else {
        // Task not found - count as failed
        failed++;
      }
    } catch (err) {
      console.error(`Failed to load task ${taskId}:`, err);
      failed++;
    }
  }

  const total = goal.taskIds.length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return {
    completedTasks: completed,
    totalTasks: total,
    progressPercent: percent,
    blockedTasks: blocked,
    failedTasks: failed,
  };
}

/**
 * Enrich goal with progress data
 */
async function enrichGoal(goal: Goal): Promise<typeof goal & {
  completedTasks: number;
  totalTasks: number;
  progressPercent: number;
  blockedTasks: number;
  failedTasks: number;
}> {
  const progress = await calculateGoalProgress(goal);
  return {
    ...goal,
    ...progress,
  };
}

// List all goals
app.get('/goals', rateLimitGeneral, async (c) => {
  try {
    const statusFilter = c.req.query('status') as 'active' | 'completed' | 'archived' | undefined;
    const store = await loadGoals();

    let goals = store.goals;
    if (statusFilter) {
      goals = goals.filter((g) => g.status === statusFilter);
    }

    const enriched = await Promise.all(goals.map(enrichGoal));
    return c.json({ goals: enriched });
  } catch (error) {
    console.error('Failed to list goals:', error);
    return c.json({ error: 'Failed to load goals' }, 500);
  }
});

// Get single goal
app.get('/goals/:id', rateLimitGeneral, async (c) => {
  try {
    const store = await loadGoals();
    const goal = store.goals.find((g) => g.id === c.req.param('id'));

    if (!goal) {
      return c.json({ error: 'Goal not found' }, 404);
    }

    const enriched = await enrichGoal(goal);
    return c.json(enriched);
  } catch (error) {
    console.error('Failed to get goal:', error);
    return c.json({ error: 'Failed to load goal' }, 500);
  }
});

// Create goal
const createGoalSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  taskIds: z.array(z.string()).optional().default([]),
  targetDate: z.number().optional(),
});

app.post('/goals', rateLimitGeneral, async (c) => {
  try {
    const body = await c.req.json();
    const parsed = createGoalSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({
        error: 'Invalid request',
        details: parsed.error.flatten()
      }, 400);
    }

    const store = await loadGoals();

    const goal: Goal = {
      id: generateId(),
      title: parsed.data.title,
      description: parsed.data.description,
      taskIds: parsed.data.taskIds || [],
      targetDate: parsed.data.targetDate,
      createdAt: Date.now(),
      status: 'active',
      version: 1,
    };

    store.goals.push(goal);
    await saveGoals(store);

    broadcast('goals.created', { goalId: goal.id, title: goal.title });

    const enriched = await enrichGoal(goal);
    return c.json(enriched, 201);
  } catch (error) {
    console.error('Failed to create goal:', error);
    return c.json({ error: 'Failed to create goal' }, 500);
  }
});

// Update goal
const updateGoalSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  taskIds: z.array(z.string()).optional(),
  targetDate: z.number().nullable().optional(),
  status: z.enum(['active', 'completed', 'archived']).optional(),
  version: z.number(),
});

app.put('/goals/:id', rateLimitGeneral, async (c) => {
  try {
    const body = await c.req.json();
    const parsed = updateGoalSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({
        error: 'Invalid request',
        details: parsed.error.flatten()
      }, 400);
    }

    const store = await loadGoals();
    const goalIndex = store.goals.findIndex((g) => g.id === c.req.param('id'));

    if (goalIndex === -1) {
      return c.json({ error: 'Goal not found' }, 404);
    }

    const goal = store.goals[goalIndex];

    // Version check (CAS)
    if (parsed.data.version !== goal.version) {
      return c.json({
        error: 'Version conflict',
        currentVersion: goal.version
      }, 409);
    }

    // Apply updates
    if (parsed.data.title !== undefined) goal.title = parsed.data.title;
    if (parsed.data.description !== undefined) goal.description = parsed.data.description ?? undefined;
    if (parsed.data.taskIds !== undefined) goal.taskIds = parsed.data.taskIds;
    if (parsed.data.targetDate !== undefined) goal.targetDate = parsed.data.targetDate ?? undefined;
    if (parsed.data.status !== undefined) goal.status = parsed.data.status;

    goal.version++;

    store.goals[goalIndex] = goal;
    await saveGoals(store);

    broadcast('goals.updated', { goalId: goal.id });

    const enriched = await enrichGoal(goal);
    return c.json(enriched);
  } catch (error) {
    console.error('Failed to update goal:', error);
    return c.json({ error: 'Failed to update goal' }, 500);
  }
});

// Delete goal
app.delete('/goals/:id', rateLimitGeneral, async (c) => {
  try {
    const store = await loadGoals();
    const goalIndex = store.goals.findIndex((g) => g.id === c.req.param('id'));

    if (goalIndex === -1) {
      return c.json({ error: 'Goal not found' }, 404);
    }

    store.goals.splice(goalIndex, 1);
    await saveGoals(store);

    broadcast('goals.deleted', { goalId: c.req.param('id') });

    return c.json({ success: true });
  } catch (error) {
    console.error('Failed to delete goal:', error);
    return c.json({ error: 'Failed to delete goal' }, 500);
  }
});

// Add task to goal
const addTaskSchema = z.object({
  taskId: z.string(),
});

app.post('/goals/:id/tasks', rateLimitGeneral, async (c) => {
  try {
    const body = await c.req.json();
    const parsed = addTaskSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({
        error: 'Invalid request',
        details: parsed.error.flatten()
      }, 400);
    }

    const store = await loadGoals();
    const goalIndex = store.goals.findIndex((g) => g.id === c.req.param('id'));

    if (goalIndex === -1) {
      return c.json({ error: 'Goal not found' }, 404);
    }

    const goal = store.goals[goalIndex];

    // Verify task exists
    const kanbanStore = getKanbanStore();
    const task = await kanbanStore.getTask(parsed.data.taskId);
    if (!task) {
      return c.json({ error: 'Task not found' }, 404);
    }

    // Add task if not already present
    if (!goal.taskIds.includes(parsed.data.taskId)) {
      goal.taskIds.push(parsed.data.taskId);
      goal.version++;
      store.goals[goalIndex] = goal;
      await saveGoals(store);
    }

    broadcast('goals.updated', { goalId: goal.id });

    const enriched = await enrichGoal(goal);
    return c.json(enriched);
  } catch (error) {
    console.error('Failed to add task to goal:', error);
    return c.json({ error: 'Failed to add task to goal' }, 500);
  }
});

// Remove task from goal
app.delete('/goals/:id/tasks/:taskId', rateLimitGeneral, async (c) => {
  try {
    const store = await loadGoals();
    const goalIndex = store.goals.findIndex((g) => g.id === c.req.param('id'));

    if (goalIndex === -1) {
      return c.json({ error: 'Goal not found' }, 404);
    }

    const goal = store.goals[goalIndex];
    const taskIndex = goal.taskIds.indexOf(c.req.param('taskId'));

    if (taskIndex !== -1) {
      goal.taskIds.splice(taskIndex, 1);
      goal.version++;
      store.goals[goalIndex] = goal;
      await saveGoals(store);
    }

    broadcast('goals.updated', { goalId: goal.id });

    const enriched = await enrichGoal(goal);
    return c.json(enriched);
  } catch (error) {
    console.error('Failed to remove task from goal:', error);
    return c.json({ error: 'Failed to remove task from goal' }, 500);
  }
});

export default app;
