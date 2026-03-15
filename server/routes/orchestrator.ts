/**
 * Orchestrator API Routes
 *
 * POST /api/orchestrator/start     - Create a new orchestrated task
 * GET  /api/orchestrator/status/:id - Get task status with agent details
 * GET  /api/orchestrator/agents    - List available specialist agents
 * POST /api/orchestrator/route     - Preview routing for a task (dry-run)
 * POST /api/orchestrator/cancel/:id - Cancel a running task
 *
 * These endpoints integrate with the Nerve kanban system.
 * Tasks created here should also be created in the kanban store.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { rateLimitGeneral } from '../middleware/rate-limit.js';
import {
  startTask,
  getTaskStatus,
  listSpecialistAgents,
  previewRouting,
  cancelTask,
  executeTask,
} from '../services/orchestrator-service.js';
import { getKanbanStore, type TaskActor } from '../lib/kanban-store.js';
import { invokeGatewayTool } from '../lib/gateway-client.js';

const app = new Hono();

/** Parse gateway tool response */
function parseGatewayResponse(result: unknown): Record<string, unknown> {
  if (result && typeof result === 'object') {
    const r = result as Record<string, unknown>;
    const content = r.content as Array<Record<string, unknown>> | undefined;
    if (content?.[0]?.text && typeof content[0].text === 'string') {
      try {
        return JSON.parse(content[0].text);
      } catch {
        // fall through
      }
    }
    if (r.details && typeof r.details === 'object') {
      return r.details as Record<string, unknown>;
    }
    return r;
  }
  return {};
}

// ── Zod schemas ──────────────────────────────────────────────────────

const gateModeSchema = z.enum(['audit-only', 'gate-on-write', 'gate-on-deploy']);
const prioritySchema = z.enum(['critical', 'high', 'normal', 'low']);
const columnSchema = z.enum(['backlog', 'todo', 'in-progress', 'review', 'done', 'cancelled']);
const sequenceSchema = z.enum(['single', 'sequential', 'parallel']);

const startTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
  gate_mode: gateModeSchema.optional().default('audit-only'),
  priority: prioritySchema.optional().default('normal'),
  status: z.enum(['backlog', 'todo']).optional().default('todo'),
  execute_immediately: z.boolean().optional().default(false),
});

const routePreviewSchema = z.object({
  description: z.string().min(1).max(5000),
});

// ── Routes ────────────────────────────────────────────────────────────

/**
 * POST /api/orchestrator/start
 * Create a new orchestrated task.
 */
app.post('/api/orchestrator/start', rateLimitGeneral, async (c) => {
  try {
    const body = await c.req.json();
    const parsed = startTaskSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.flatten() }, 400);
    }

    const { title, description, gate_mode, priority, status, execute_immediately } = parsed.data;

    // Create the orchestrator task
    const task = await startTask({
      title,
      description,
      gate_mode,
      priority,
      column: status as 'todo' | 'backlog',
    });

    // Also create in kanban store with agent labels
    const agentLabels = task.agents.map(a => `agent:${a}`);
    const store = getKanbanStore();
    const kanbanTask = await store.createTask({
      title,
      description,
      status: status as 'todo' | 'backlog',
      priority: priority as 'normal',
      createdBy: 'operator' as TaskActor,
      labels: ['orchestrated', ...agentLabels],
    });

    // If execute_immediately, spawn agent sessions
    if (execute_immediately) {
      try {
        await executeTask(kanbanTask.id, description, task.agents, task.sequence);
        await store.executeTask(kanbanTask.id, {}, 'operator');
      } catch (execError) {
        console.error('Failed to execute task immediately:', execError);
        // Continue anyway - task is created, can be executed manually
      }
    }

    return c.json({
      success: true,
      task_id: kanbanTask.id,
      kanban_id: kanbanTask.id,
      orchestrator_id: task.task_id,
      title: task.title,
      agents: task.agents,
      sequence: task.sequence,
      gate_mode: task.gate_mode,
      routing: task.routing,
      status: execute_immediately ? 'in-progress' : status,
      created_at: task.created_at,
    }, 201);
  } catch (error) {
    console.error('Failed to start orchestrator task:', error);
    return c.json({ error: 'Failed to start task' }, 500);
  }
});

/**
 * GET /api/orchestrator/status/:id
 * Get task status with agent details.
 */
app.get('/api/orchestrator/status/:id', rateLimitGeneral, async (c) => {
  try {
    const taskId = c.req.param('id');
    const status = await getTaskStatus(taskId);

    if (!status) {
      return c.json({ error: 'Task not found' }, 404);
    }

    return c.json({
      success: true,
      ...status,
    });
  } catch (error) {
    console.error('Failed to get task status:', error);
    return c.json({ error: 'Failed to get task status' }, 500);
  }
});

/**
 * GET /api/orchestrator/agents
 * List available specialist agents.
 */
app.get('/api/orchestrator/agents', rateLimitGeneral, async (c) => {
  try {
    const agents = listSpecialistAgents();
    return c.json({
      success: true,
      agents,
    });
  } catch (error) {
    console.error('Failed to list agents:', error);
    return c.json({ error: 'Failed to list agents' }, 500);
  }
});

/**
 * POST /api/orchestrator/route
 * Preview routing for a task description (dry-run).
 */
app.post('/api/orchestrator/route', rateLimitGeneral, async (c) => {
  try {
    const body = await c.req.json();
    const parsed = routePreviewSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.flatten() }, 400);
    }

    const routing = previewRouting(parsed.data.description);

    // Get agent details
    const agentDetails = routing.agents
      .map((name) => listSpecialistAgents().find((a) => a.name === name))
      .filter(Boolean);

    return c.json({
      success: true,
      agents: routing.agents,
      sequence: routing.sequence,
      gate_mode: routing.gate_mode,
      rule_id: routing.rule_id,
      fallback_used: routing.fallback_used,
      agent_details: agentDetails,
    });
  } catch (error) {
    console.error('Failed to preview routing:', error);
    return c.json({ error: 'Failed to preview routing' }, 500);
  }
});

/**
 * POST /api/orchestrator/cancel/:id
 * Cancel a running task.
 */
app.post('/api/orchestrator/cancel/:id', rateLimitGeneral, async (c) => {
  try {
    const taskId = c.req.param('id');
    const success = await cancelTask(taskId);

    if (!success) {
      return c.json({ error: 'Failed to cancel task' }, 500);
    }

    // Update kanban status
    const store = getKanbanStore();
    try {
      const task = await store.getTask(taskId);
      if (task && task.status === 'in-progress') {
        await store.updateTask(taskId, task.version, {
          status: 'cancelled',
        });
      }
    } catch {
      // Kanban update is best-effort
    }

    return c.json({
      success: true,
      task_id: taskId,
      status: 'cancelled',
    });
  } catch (error) {
    console.error('Failed to cancel task:', error);
    return c.json({ error: 'Failed to cancel task' }, 500);
  }
});

/**
 * POST /api/orchestrator/complete/:id
 * Mark a task as complete and create proposals from findings.
 * Called when agent sessions finish to auto-generate follow-up tasks.
 */
app.post('/api/orchestrator/complete/:id', rateLimitGeneral, async (c) => {
  try {
    const taskId = c.req.param('id');
    const store = getKanbanStore();
    
    // Get task from kanban
    const task = await store.getTask(taskId);
    if (!task) {
      return c.json({ error: 'Task not found' }, 404);
    }
    
    // Get agent output from sessions
    const sessionsResult = await invokeGatewayTool('subagents', {
      action: 'list',
      recentMinutes: 60,
    });
    
    const parsed = parseGatewayResponse(sessionsResult);
    const sessions = ((parsed.active ?? []) as Array<Record<string, unknown>>)
      .concat((parsed.recent ?? []) as Array<Record<string, unknown>>);
    
    // Find sessions for this task
    const taskSessions = sessions.filter((s: Record<string, unknown>) => {
      const label = String(s.label ?? '');
      return label.startsWith(`orch-${taskId}-`);
    });
    
    // Collect all agent output
    let combinedOutput = '';
    for (const session of taskSessions) {
      if (session.output && typeof session.output === 'string') {
        combinedOutput += `\n\n### ${String(session.label ?? 'Agent')} Output:\n${session.output}`;
      }
    }
    
    // Create proposals from findings
    const { createProposalsFromFindings } = await import('../services/orchestrator-service.js');
    const result = await createProposalsFromFindings(
      taskId,
      task.title,
      combinedOutput || task.description || ''
    );
    
    // Update task status to review
    if (task.status === 'in-progress') {
      await store.updateTask(taskId, task.version, {
        status: 'review',
      });
    }
    
    return c.json({
      success: true,
      task_id: taskId,
      status: 'review',
      proposals_created: result.proposals_created,
    });
  } catch (error) {
    console.error('Failed to complete task:', error);
    return c.json({ error: 'Failed to complete task' }, 500);
  }
});

/**
 * GET /api/orchestrator/sessions
 * Get all active agent sessions.
 */
app.get('/api/orchestrator/sessions', rateLimitGeneral, async (c) => {
  try {
    // Get recent subagent sessions from gateway
    const sessionsResult = await invokeGatewayTool('subagents', {
      action: 'list',
      recentMinutes: 30,
    });

    const parsed = parseGatewayResponse(sessionsResult);
    const active = (parsed.active ?? []) as Array<Record<string, unknown>>;
    const recent = (parsed.recent ?? []) as Array<Record<string, unknown>>;
    const allSessions = [...active, ...recent];

    // Filter for orchestrator sessions (labels starting with 'orch-')
    const orchestratorSessions = allSessions
      .filter((s) => {
        const label = String(s.label ?? '');
        return label.startsWith('orch-');
      })
      .map((s) => ({
        sessionKey: s.sessionKey as string,
        label: String(s.label ?? ''),
        status: (s.status as string) || 'unknown',
        createdAt: s.createdAt as number | undefined,
        error: s.error as string | undefined,
        output: s.output as string | undefined,
      }));

    return c.json({
      success: true,
      sessions: orchestratorSessions,
    });
  } catch (error) {
    console.error('Failed to get active sessions:', error);
    return c.json({ error: 'Failed to get sessions' }, 500);
  }
});

/**
 * POST /api/orchestrator/execute/:id
 * Execute a kanban task (spawn agent sessions).
 * This is called when a user clicks "Execute" on a kanban task.
 */
app.post('/api/orchestrator/execute/:id', rateLimitGeneral, async (c) => {
  try {
    const taskId = c.req.param('id');
    const store = getKanbanStore();

    // Get task from kanban
    const task = await store.getTask(taskId);
    if (!task) {
      return c.json({ error: 'Task not found' }, 404);
    }

    // Check if task has agent labels (orchestrated tasks have agent:* labels)
    const agentLabels = task.labels?.filter((l: string) => l.startsWith('agent:')) || [];
    if (agentLabels.length === 0) {
      return c.json({ error: 'Task has no agent assignments' }, 400);
    }

    // Extract agent names from labels
    const agents = agentLabels.map((l: string) => l.replace('agent:', ''));
    const sequence = agents.length > 1 ? 'sequential' : 'single';

    // Spawn agent sessions
    const result = await executeTask(
      taskId,
      task.description || task.title,
      agents,
      sequence
    );

    // Move task to in-progress
    await store.executeTask(taskId, {}, 'operator');

    return c.json({
      success: true,
      task_id: taskId,
      status: 'in-progress',
      session_labels: result.session_labels,
      agents: agents,
    });
  } catch (error) {
    console.error('Failed to execute task:', error);
    return c.json({ error: 'Failed to execute task' }, 500);
  }
});

export default app;
