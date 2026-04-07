/**
 * Plan Management API Routes
 *
 * GET    /api/plans/:taskId          - Get task plan
 * PUT    /api/plans/:taskId          - Create/update plan (draft)
 * POST   /api/plans/:taskId/submit   - Submit plan for review
 * POST   /api/plans/:taskId/approve  - Approve plan (plan reviewer)
 * POST   /api/plans/:taskId/reject   - Reject plan with questions
 * DELETE /api/plans/:taskId          - Delete plan
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { rateLimitGeneral } from '../middleware/rate-limit.js';
import { getKanbanStore, TaskNotFoundError } from '../lib/kanban-store.js';

const app = new Hono();

const ErrorCode = {
  TASK_NOT_FOUND: 'TASK_NOT_FOUND',
  PLAN_NOT_FOUND: 'PLAN_NOT_FOUND',
  INVALID_STATE: 'INVALID_STATE',
  VERSION_CONFLICT: 'VERSION_CONFLICT',
} as const;

// GET /api/plans/:taskId
app.get('/api/plans/:taskId', rateLimitGeneral, async (c) => {
  const taskId = c.req.param('taskId');
  const store = getKanbanStore();

  try {
    const task = await store.getTask(taskId);
    return c.json({
      taskId,
      plan: task.plan || null,
    });
  } catch (err) {
    if (err instanceof TaskNotFoundError) {
      return c.json({ error: 'Task not found', code: ErrorCode.TASK_NOT_FOUND }, 404);
    }
    throw err;
  }
});

// PUT /api/plans/:taskId - Create/update draft plan
const updatePlanSchema = z.object({
  content: z.string().min(1),
});

app.put('/api/plans/:taskId', rateLimitGeneral, async (c) => {
  const taskId = c.req.param('taskId');
  const store = getKanbanStore();

  let task;
  try {
    task = await store.getTask(taskId);
  } catch (err) {
    if (err instanceof TaskNotFoundError) {
      return c.json({ error: 'Task not found', code: ErrorCode.TASK_NOT_FOUND }, 404);
    }
    throw err;
  }

  let body: unknown = {};
  try {
    const text = await c.req.text();
    if (text) body = JSON.parse(text);
  } catch {
    return c.json({ error: 'Invalid JSON', code: ErrorCode.INVALID_STATE }, 400);
  }

  const parsed = updatePlanSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid request', details: parsed.error.flatten(), code: ErrorCode.INVALID_STATE }, 400);
  }

  // Can only update draft plans
  if (task.plan?.status === 'approved' || task.plan?.status === 'in-review') {
    return c.json({ error: 'Plan is locked', code: ErrorCode.INVALID_STATE }, 403);
  }

  await store.updateTask(taskId, task.version, {
    plan: {
      ...task.plan,
      status: 'draft' as const,
      content: parsed.data.content,
    },
  } as never);

  return c.json({ success: true, taskId, status: 'draft' });
});

// POST /api/plans/:taskId/submit - Submit for review
app.post('/api/plans/:taskId/submit', rateLimitGeneral, async (c) => {
  const taskId = c.req.param('taskId');
  const store = getKanbanStore();

  let task;
  try {
    task = await store.getTask(taskId);
  } catch (err) {
    if (err instanceof TaskNotFoundError) {
      return c.json({ error: 'Task not found', code: ErrorCode.TASK_NOT_FOUND }, 404);
    }
    throw err;
  }

  if (!task.plan?.content) {
    return c.json({ error: 'Plan has no content', code: ErrorCode.INVALID_STATE }, 400);
  }

  if (task.plan.status !== 'draft') {
    return c.json({ error: 'Plan must be in draft status to submit', code: ErrorCode.INVALID_STATE }, 400);
  }

  await store.updateTask(taskId, task.version, {
    plan: {
      ...task.plan,
      status: 'in-review' as const,
      submittedAt: Date.now(),
    },
  } as never);

  return c.json({ success: true, taskId, status: 'in-review' });
});

// POST /api/plans/:taskId/approve - Approve plan
app.post('/api/plans/:taskId/approve', rateLimitGeneral, async (c) => {
  const taskId = c.req.param('taskId');
  const store = getKanbanStore();

  let task;
  try {
    task = await store.getTask(taskId);
  } catch (err) {
    if (err instanceof TaskNotFoundError) {
      return c.json({ error: 'Task not found', code: ErrorCode.TASK_NOT_FOUND }, 404);
    }
    throw err;
  }

  if (!task.plan || task.plan.status !== 'in-review') {
    return c.json({ error: 'Plan must be in review to approve', code: ErrorCode.INVALID_STATE }, 400);
  }

  await store.updateTask(taskId, task.version, {
    plan: {
      ...task.plan,
      status: 'approved' as const,
      approvedAt: Date.now(),
    },
  } as never);

  return c.json({ success: true, taskId, status: 'approved' });
});

// POST /api/plans/:taskId/reject - Reject plan with questions
const rejectPlanSchema = z.object({
  reason: z.string().min(1),
  questions: z.array(z.object({
    question: z.string().min(1),
  })).optional(),
});

app.post('/api/plans/:taskId/reject', rateLimitGeneral, async (c) => {
  const taskId = c.req.param('taskId');
  const store = getKanbanStore();

  let task;
  try {
    task = await store.getTask(taskId);
  } catch (err) {
    if (err instanceof TaskNotFoundError) {
      return c.json({ error: 'Task not found', code: ErrorCode.TASK_NOT_FOUND }, 404);
    }
    throw err;
  }

  if (!task.plan || task.plan.status !== 'in-review') {
    return c.json({ error: 'Plan must be in review to reject', code: ErrorCode.INVALID_STATE }, 400);
  }

  let body: unknown = {};
  try {
    const text = await c.req.text();
    if (text) body = JSON.parse(text);
  } catch {
    return c.json({ error: 'Invalid JSON', code: ErrorCode.INVALID_STATE }, 400);
  }

  const parsed = rejectPlanSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid request', details: parsed.error.flatten(), code: ErrorCode.INVALID_STATE }, 400);
  }

  const { reason, questions } = parsed.data;

  await store.updateTask(taskId, task.version, {
    plan: {
      ...task.plan,
      status: 'rejected' as const,
      rejectedAt: Date.now(),
      rejectionReason: reason,
      reviewerQuestions: questions?.map(q => ({
        ...q,
        resolved: false,
      })),
    },
  } as never);

  return c.json({ success: true, taskId, status: 'rejected' });
});

// DELETE /api/plans/:taskId - Delete plan
app.delete('/api/plans/:taskId', rateLimitGeneral, async (c) => {
  const taskId = c.req.param('taskId');
  const store = getKanbanStore();

  let task;
  try {
    task = await store.getTask(taskId);
  } catch (err) {
    if (err instanceof TaskNotFoundError) {
      return c.json({ error: 'Task not found', code: ErrorCode.TASK_NOT_FOUND }, 404);
    }
    throw err;
  }

  if (!task.plan) {
    return c.json({ error: 'Plan not found', code: ErrorCode.PLAN_NOT_FOUND }, 404);
  }

  await store.updateTask(taskId, task.version, {
    plan: undefined,
  } as never);

  return c.json({ success: true, taskId });
});

export default app;
