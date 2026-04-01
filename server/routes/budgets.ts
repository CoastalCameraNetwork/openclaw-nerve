/**
 * Budget API Routes
 *
 * GET /api/orchestrator/budgets - List budgets
 * POST /api/orchestrator/budgets - Create budget
 * PUT /api/orchestrator/budgets/:id - Update budget
 * DELETE /api/orchestrator/budgets/:id - Delete budget
 * GET /api/orchestrator/budgets/status - Current spending status
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { rateLimitGeneral } from '../middleware/rate-limit.js';
import {
  listBudgets,
  createBudget,
  updateBudget,
  deleteBudget,
  checkBudgetSpending,
  getRecentAlerts,
} from '../lib/budget-service.js';

const app = new Hono();

// GET /api/orchestrator/budgets
app.get('/budgets', rateLimitGeneral, async (c) => {
  const taskId = c.req.query('taskId');
  const goalId = c.req.query('goalId');

  try {
    const budgets = await listBudgets({ taskId, goalId });
    return c.json({ budgets });
  } catch (err) {
    console.error('[budgets] Error:', err);
    return c.json({
      error: 'internal_error',
      details: err instanceof Error ? err.message : 'Failed to list budgets',
    }, 500);
  }
});

// GET /api/orchestrator/budgets/status
app.get('/budgets/status', rateLimitGeneral, async (c) => {
  const taskId = c.req.query('taskId') || undefined;
  const goalId = c.req.query('goalId') || undefined;
  const currentCost = Number(c.req.query('currentCost') || '0');

  try {
    const spending = await checkBudgetSpending(taskId, goalId, currentCost);
    const alerts = await getRecentAlerts();
    return c.json({ spending, alerts });
  } catch (err) {
    console.error('[budgets/status] Error:', err);
    return c.json({
      error: 'internal_error',
      details: err instanceof Error ? err.message : 'Failed to get budget status',
    }, 500);
  }
});

// POST /api/orchestrator/budgets
const createBudgetSchema = z.object({
  taskId: z.string().optional(),
  goalId: z.string().optional(),
  maxCostUSD: z.number().positive(),
  softLimitPercent: z.number().min(1).max(100).default(80),
  action: z.enum(['pause', 'notify']).default('pause'),
});

app.post('/budgets', rateLimitGeneral, async (c) => {
  let body: unknown = {};
  try {
    const text = await c.req.text();
    if (text) body = JSON.parse(text);
  } catch {
    return c.json({ error: 'validation_error', details: 'Invalid JSON body' }, 400);
  }

  const parsed = createBudgetSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({
      error: 'validation_error',
      details: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    }, 400);
  }

  try {
    const { taskId, goalId, maxCostUSD, softLimitPercent, action } = parsed.data;

    if (!taskId && !goalId) {
      return c.json({
        error: 'validation_error',
        details: 'Either taskId or goalId is required',
      }, 400);
    }

    const budget = await createBudget({ taskId, goalId, maxCostUSD, softLimitPercent, action, createdBy: 'operator' });
    return c.json(budget, 201);
  } catch (err) {
    console.error('[budgets POST] Error:', err);
    return c.json({
      error: 'internal_error',
      details: err instanceof Error ? err.message : 'Failed to create budget',
    }, 500);
  }
});

// PUT /api/orchestrator/budgets/:id
const updateBudgetSchema = z.object({
  maxCostUSD: z.number().positive().optional(),
  softLimitPercent: z.number().min(1).max(100).optional(),
  action: z.enum(['pause', 'notify']).optional(),
});

app.put('/budgets/:id', rateLimitGeneral, async (c) => {
  const id = c.req.param('id');

  let body: unknown = {};
  try {
    const text = await c.req.text();
    if (text) body = JSON.parse(text);
  } catch {
    return c.json({ error: 'validation_error', details: 'Invalid JSON body' }, 400);
  }

  const parsed = updateBudgetSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({
      error: 'validation_error',
      details: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    }, 400);
  }

  try {
    const budget = await updateBudget(id, parsed.data);
    if (!budget) {
      return c.json({ error: 'not_found', details: 'Budget not found' }, 404);
    }
    return c.json(budget);
  } catch (err) {
    console.error('[budgets PUT] Error:', err);
    return c.json({
      error: 'internal_error',
      details: err instanceof Error ? err.message : 'Failed to update budget',
    }, 500);
  }
});

// DELETE /api/orchestrator/budgets/:id
app.delete('/budgets/:id', rateLimitGeneral, async (c) => {
  const id = c.req.param('id');

  try {
    const deleted = await deleteBudget(id);
    if (!deleted) {
      return c.json({ error: 'not_found', details: 'Budget not found' }, 404);
    }
    return c.json({ success: true });
  } catch (err) {
    console.error('[budgets DELETE] Error:', err);
    return c.json({
      error: 'internal_error',
      details: err instanceof Error ? err.message : 'Failed to delete budget',
    }, 500);
  }
});

export default app;
