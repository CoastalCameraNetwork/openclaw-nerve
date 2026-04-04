/**
 * Multi-Agent Chains API Routes
 *
 * HTTP endpoints for managing and executing agent chains.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { rateLimitGeneral } from '../middleware/rate-limit.js';
import { listChains, getChain } from '../services/agent-chains.js';
import { executeChain } from '../services/orchestrator-service.js';

const app = new Hono();

// GET /api/chains - List all available chains
app.get('/api/chains', rateLimitGeneral, async (c) => {
  const chains = listChains();
  return c.json({ chains });
});

// GET /api/chains/:id - Get chain details
app.get('/api/chains/:id', rateLimitGeneral, async (c) => {
  const chainId = c.req.param('id');
  const chain = getChain(chainId);

  if (!chain) {
    return c.json({ error: 'Chain not found' }, 404);
  }

  return c.json({ chain });
});

// POST /api/chains/:id/execute - Execute chain on a task
const executeChainSchema = z.object({
  taskId: z.string().min(1),
});

app.post('/api/chains/:id/execute', rateLimitGeneral, async (c) => {
  const chainId = c.req.param('id');
  const body = await c.req.json();
  const parsed = executeChainSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({
      error: 'Invalid request',
      details: parsed.error.flatten(),
    }, 400);
  }

  const { taskId } = parsed.data;

  // Verify chain exists
  const chain = getChain(chainId);
  if (!chain) {
    return c.json({ error: 'Chain not found' }, 404);
  }

  // Execute the chain
  const result = await executeChain(taskId, chainId);

  if (!result.success) {
    return c.json({
      error: 'Chain execution failed',
      reason: result.error,
    }, 500);
  }

  return c.json({
    success: true,
    message: `Chain "${chain.name}" started for task ${taskId}`,
  });
});

export default app;
