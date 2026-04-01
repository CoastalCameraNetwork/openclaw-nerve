/**
 * Model Routing API Routes
 *
 * GET /api/orchestrator/models/status - Get all model statuses
 * POST /api/orchestrator/models/routing - Get routing decision for a task
 * POST /api/orchestrator/models/refresh - Refresh model status cache
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { rateLimitGeneral } from '../middleware/rate-limit.js';
import {
  getAllModelStatuses,
  routeTask,
  clearModelStatusCache,
  analyzeComplexity,
} from '../lib/model-routing-service.js';

const app = new Hono();

// GET /api/orchestrator/models/status
app.get('/models/status', rateLimitGeneral, async (c) => {
  try {
    const statuses = await getAllModelStatuses();
    return c.json({ models: statuses });
  } catch (err) {
    console.error('[models/status] Error:', err);
    return c.json({
      error: 'internal_error',
      details: err instanceof Error ? err.message : 'Failed to fetch model status',
    }, 500);
  }
});

// POST /api/orchestrator/models/routing
const routingSchema = z.object({
  description: z.string().min(1).max(10000),
  complexity: z.enum(['low', 'medium', 'high']).optional(),
  manualModel: z.string().optional(),
});

app.post('/models/routing', rateLimitGeneral, async (c) => {
  let body: unknown = {};
  try {
    const text = await c.req.text();
    if (text) body = JSON.parse(text);
  } catch {
    return c.json({ error: 'validation_error', details: 'Invalid JSON body' }, 400);
  }

  const parsed = routingSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({
      error: 'validation_error',
      details: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    }, 400);
  }

  try {
    const { description, complexity, manualModel } = parsed.data;
    const complexityAnalysis = analyzeComplexity(description);
    const decision = await routeTask(description, complexity, manualModel);

    return c.json({
      decision,
      analyzedComplexity: complexityAnalysis,
    });
  } catch (err) {
    console.error('[models/routing] Error:', err);
    return c.json({
      error: 'internal_error',
      details: err instanceof Error ? err.message : 'Failed to route task',
    }, 500);
  }
});

// POST /api/orchestrator/models/refresh
app.post('/models/refresh', rateLimitGeneral, async (c) => {
  try {
    clearModelStatusCache();
    const statuses = await getAllModelStatuses();
    return c.json({ models: statuses, refreshed: true });
  } catch (err) {
    console.error('[models/refresh] Error:', err);
    return c.json({
      error: 'internal_error',
      details: err instanceof Error ? err.message : 'Failed to refresh model status',
    }, 500);
  }
});

export default app;
