/**
 * Agent Status API Routes
 *
 * GET /api/orchestrator/agents/status - Get all agent statuses
 * GET /api/orchestrator/agents/status/:name - Get single agent status
 * POST /api/orchestrator/agents/refresh - Refresh agent status cache
 */

import { Hono } from 'hono';
import { rateLimitGeneral } from '../middleware/rate-limit.js';
import { getAllAgentStatuses, getAgentStatus, clearAgentStatusCache } from '../services/agent-status-service.js';

const app = new Hono();

// GET /api/orchestrator/agents/status
app.get('/agents/status', rateLimitGeneral, async (c) => {
  try {
    const statuses = await getAllAgentStatuses();
    return c.json({ agents: statuses });
  } catch (err) {
    console.error('[agents/status] Error:', err);
    return c.json({
      error: 'internal_error',
      details: err instanceof Error ? err.message : 'Failed to fetch agent status',
    }, 500);
  }
});

// GET /api/orchestrator/agents/status/:name
app.get('/agents/status/:name', rateLimitGeneral, async (c) => {
  const name = c.req.param('name');

  try {
    const status = await getAgentStatus(name);
    if (!status) {
      return c.json({ error: 'not_found', details: `Agent not found: ${name}` }, 404);
    }
    return c.json(status);
  } catch (err) {
    console.error('[agents/status/:name] Error:', err);
    return c.json({
      error: 'internal_error',
      details: err instanceof Error ? err.message : 'Failed to fetch agent status',
    }, 500);
  }
});

// POST /api/orchestrator/agents/refresh
app.post('/agents/refresh', rateLimitGeneral, async (c) => {
  try {
    clearAgentStatusCache();
    const statuses = await getAllAgentStatuses();
    return c.json({ agents: statuses, refreshed: true });
  } catch (err) {
    console.error('[agents/refresh] Error:', err);
    return c.json({
      error: 'internal_error',
      details: err instanceof Error ? err.message : 'Failed to refresh agent status',
    }, 500);
  }
});

export default app;
