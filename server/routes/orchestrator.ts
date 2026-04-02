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
import { detectProject } from '../lib/project-registry.js';
import {
  startTask,
  getTaskStatus,
  listSpecialistAgents,
  previewRouting,
  cancelTask,
  executeTask,
} from '../services/orchestrator-service.js';
import { getKanbanStore, type TaskActor, type KanbanTask, type AuditEntry } from '../lib/kanban-store.js';
import { invokeGatewayTool } from '../lib/gateway-client.js';
import { getSessionTokenUsage } from './tokens.js';
import { getRecentSessions, getSessionsForTask } from '../services/session-fs-reader.js';

const app = new Hono();

// Error codes for structured error responses
const ErrorCode = {
  TASK_NOT_FOUND: 'TASK_NOT_FOUND',
  PR_NOT_FOUND: 'PR_NOT_FOUND',
  NO_AGENTS: 'NO_AGENTS',
  NO_PROJECT: 'NO_PROJECT',
  GATEWAY_ERROR: 'GATEWAY_ERROR',
  AGENT_SPAWN_FAILED: 'AGENT_SPAWN_FAILED',
  REVIEW_REQUIRED: 'REVIEW_REQUIRED',
  INVALID_REQUEST: 'INVALID_REQUEST',
  DUPLICATE_EXECUTION: 'DUPLICATE_EXECUTION',
  VERSION_CONFLICT: 'VERSION_CONFLICT',
  NO_REVIEW_REPORT: 'NO_REVIEW_REPORT',
} as const;

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
  maxCostUSD: z.number().positive().optional(),
  labels: z.array(z.string()).optional(),
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
      return c.json({ error: 'Invalid request', code: ErrorCode.INVALID_REQUEST, details: parsed.error.flatten() }, 400);
    }

    const { title, description, gate_mode, priority, status, execute_immediately, maxCostUSD, labels } = parsed.data;

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
    const allLabels = ['orchestrated', ...agentLabels, ...(labels || [])];
    const store = getKanbanStore();
    const kanbanTask = await store.createTask({
      title,
      description,
      status: status as 'todo' | 'backlog',
      priority: priority as 'normal',
      createdBy: 'operator' as TaskActor,
      labels: allLabels,
      metadata: {
        gate_mode: task.gate_mode,
        sequence: task.sequence,
        orchestrator_id: task.task_id,
        routing: task.routing,
        maxCostUSD: maxCostUSD || undefined,
      },
    });

    // If execute_immediately, spawn agent sessions
    if (execute_immediately) {
      try {
        // Detect project from description/labels
        const project = detectProject(description, allLabels);
        await executeTask(kanbanTask.id, description, task.title, task.agents, task.sequence, task.gate_mode, project ?? undefined, task.routing.model);
        await store.executeTask(kanbanTask.id, {}, 'operator');
      } catch (execError) {
        console.error('Failed to execute task immediately:', execError);
        // Continue anyway - task is created, can be executed manually
      }
    }

    // Store project info in metadata for later execution
    const project = detectProject(description, allLabels);
    if (project) {
      await store.updateTask(kanbanTask.id, kanbanTask.version, {
        metadata: {
          ...kanbanTask.metadata,
          projectPath: project.localPath,
          projectName: project.name,
        },
      });
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
    return c.json({ error: 'Failed to start task', code: ErrorCode.GATEWAY_ERROR }, 500);
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
      return c.json({ error: 'Task not found', code: ErrorCode.TASK_NOT_FOUND }, 404);
    }

    return c.json({
      success: true,
      ...status,
    });
  } catch (error) {
    console.error('Failed to get task status:', error);
    return c.json({ error: 'Failed to get task status', code: ErrorCode.GATEWAY_ERROR }, 500);
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
    return c.json({ error: 'Failed to list agents', code: ErrorCode.GATEWAY_ERROR }, 500);
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
      return c.json({ error: 'Invalid request', code: ErrorCode.INVALID_REQUEST, details: parsed.error.flatten() }, 400);
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
      model: routing.model, // Recommended model based on complexity
      agent_details: agentDetails,
    });
  } catch (error) {
    console.error('Failed to preview routing:', error);
    return c.json({ error: 'Failed to preview routing', code: ErrorCode.GATEWAY_ERROR }, 500);
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
      return c.json({ error: 'Failed to cancel task', code: ErrorCode.GATEWAY_ERROR }, 500);
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
    return c.json({ error: 'Failed to cancel task', code: ErrorCode.GATEWAY_ERROR }, 500);
  }
});

/**
 * POST /api/orchestrator/complete/:id
 * Mark a task as complete and create proposals from findings.
 * Called when agent sessions finish to auto-generate follow-up tasks.
 * Uses stored agent output from metadata (reliable), polls gateway as fallback.
 */
app.post('/api/orchestrator/complete/:id', rateLimitGeneral, async (c) => {
  try {
    const taskId = c.req.param('id');
    const store = getKanbanStore();

    // Get task from kanban
    const task = await store.getTask(taskId);
    if (!task) {
      return c.json({ error: 'Task not found', code: ErrorCode.TASK_NOT_FOUND }, 404);
    }

    // Use stored agent output from metadata (primary source)
    const agentOutput = (task.metadata?.agentOutput || {}) as Record<string, any>;
    let combinedOutput = '';
    for (const [agentName, data] of Object.entries(agentOutput)) {
      if (data.output) {
        combinedOutput += `\n\n### ${agentName} Output:\n${data.output}`;
      }
    }

    // Fall back to polling only if metadata is empty
    if (!combinedOutput) {
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

      // Collect all agent output from live sessions
      for (const session of taskSessions) {
        if (session.output && typeof session.output === 'string') {
          combinedOutput += `\n\n### ${String(session.label ?? 'Agent')} Output:\n${session.output}`;
        }
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
    return c.json({ error: 'Failed to complete task', code: ErrorCode.GATEWAY_ERROR }, 500);
  }
});

/**
 * POST /api/orchestrator/webhook/session-complete
 * Webhook endpoint for OpenClaw Gateway to notify when a session completes.
 * Broadcasts orchestrator.task_complete SSE event to connected clients.
 * Also checks cost budget and pauses agents if exceeded.
 */
app.post('/api/orchestrator/webhook/session-complete', rateLimitGeneral, async (c) => {
  try {
    const body = await c.req.json();
    const { sessionKey, label, output, error, status, tokens } = body;

    if (!sessionKey) {
      return c.json({ error: 'sessionKey is required', code: ErrorCode.INVALID_REQUEST }, 400);
    }

    // Extract task ID from label (format: orch-{taskId}-{agentName})
    // Task IDs have format: orch-<timestamp>-<random> (3 hyphen-separated parts)
    // Agent names are appended after (e.g., k8s-agent, mgmt-agent)
    // Example: orch-orch-1710446400-abc123-k8s-agent -> task ID: orch-1710446400-abc123
    const labelStr = String(label || '');
    let taskId: string | null = null;
    if (labelStr.startsWith('orch-')) {
      const withoutPrefix = labelStr.slice(5); // Remove leading 'orch-'
      const parts = withoutPrefix.split('-');
      // Task ID is first 3 parts: [orch, timestamp, random]
      if (parts.length >= 3) {
        taskId = parts.slice(0, 3).join('-');
      }
    }

    if (!taskId) {
      return c.json({ error: 'Could not extract task ID from label', code: ErrorCode.INVALID_REQUEST }, 400);
    }

    // Get task and check budget
    const store = getKanbanStore();
    const task = await store.getTask(taskId);

    // Extract agent name from label (format: orch-{taskId}-{agentName})
    const agentName = labelStr.includes('-') ? (labelStr.split('-').pop() || 'unknown') : 'unknown';

    // Persist session output to task metadata.agentOutput
    // This ensures agent output is available even after sessions complete
    if (task) {
      try {
        const existingAgentOutput = (task.metadata?.agentOutput || {}) as Record<string, any>;
        const agentKey: string = agentName; // Ensure string type for computed property
        const sessionStatus: 'running' | 'completed' | 'failed' = (status === 'failed' ? 'failed' : status === 'running' ? 'running' : 'completed');
        const updatedAgentOutput = {
          ...existingAgentOutput,
          [agentKey]: {
            status: sessionStatus,
            output: output as string | undefined,
            error: error as string | undefined,
            sessionKey: sessionKey,
            completedAt: Date.now(),
            tokens: tokens || undefined,
          },
        };

        // Update task metadata with agent output
        // We need to use updateTask with CAS version check
        const updatedTask = await store.updateTask(taskId, task.version, {
          metadata: {
            ...task.metadata,
            agentOutput: updatedAgentOutput,
          },
        });

        console.log(`[orchestrator] Persisted agent output for ${agentName} on task ${taskId}`);
      } catch (persistErr) {
        // Version conflict is OK - output will be fetched from gateway on-demand
        console.warn(`[orchestrator] Failed to persist agent output (version conflict or other):`, persistErr);
      }
    }

    if (task && task.metadata?.maxCostUSD) {
      const budgetLimit = task.metadata.maxCostUSD as number;

      // Calculate current total cost from agent output
      const agentOutput = (task.metadata?.agentOutput || {}) as Record<string, any>;
      const currentCost = Object.values(agentOutput).reduce((sum, data: any) => {
        return sum + (data.tokens?.cost || 0);
      }, 0);

      // Add the new session's cost if provided
      const newCost = currentCost + (tokens?.cost || 0);

      // Check if budget is exceeded
      if (newCost >= budgetLimit) {
        console.log(`Budget exceeded for task ${taskId}: $${newCost.toFixed(4)} >= $${budgetLimit}`);

        // Create a proposal alerting the operator
        await store.createProposal({
          type: 'create',
          payload: {
            title: `Budget exceeded for: ${task.title}`,
            description: `Task cost $${newCost.toFixed(4)} exceeds budget of $${budgetLimit.toFixed(4)}. Agents have been paused.`,
            labels: ['budget-alert', `source:${taskId}`],
            priority: 'high' as const,
          },
          proposedBy: 'agent:orchestrator',
        });

        // Move task to review for human decision
        await store.updateTask(taskId, task.version, { status: 'review' });
      }
    }

    // Broadcast task completion event
    const { broadcast } = await import('../routes/events.js');
    broadcast('orchestrator.task_complete', {
      task_id: taskId,
      session_key: sessionKey,
      label: labelStr,
      status: status || 'done',
      output: output as string | undefined,
      error: error as string | undefined,
      tokens: tokens as any,
      completed_at: Date.now(),
    });

    return c.json({
      success: true,
      task_id: taskId,
      session_key: sessionKey,
      event_broadcast: 'orchestrator.task_complete',
    });
  } catch (error) {
    console.error('Failed to process session-complete webhook:', error);
    return c.json({ error: 'Failed to process webhook', code: ErrorCode.GATEWAY_ERROR }, 500);
  }
});

/**
 * GET /api/orchestrator/sessions
 * Get all active agent sessions.
 * Primary source: task metadata.agentOutput (captured by webhook handler)
 * Secondary: filesystem scanning for sessions not captured
 */
app.get('/api/orchestrator/sessions', rateLimitGeneral, async (c) => {
  try {
    // Get all tasks from kanban to extract sessions from metadata
    const readRaw = async () => {
      const fs = await import('fs');
      const dataDir = '/root/nerve/server-dist/data/kanban';
      const filePath = `${dataDir}/tasks.json`;
      const raw = await fs.promises.readFile(filePath, 'utf-8');
      return JSON.parse(raw) as { tasks: Array<any> };
    };
    const data = await readRaw();

    const sessions: Array<{
      sessionKey: string;
      label: string;
      status: 'running' | 'completed' | 'failed';
      output?: string;
      error?: string;
      createdAt?: number;
      updatedAt?: number;
      taskId: string;
      agentName: string;
      source: 'metadata' | 'filesystem';
    }> = [];

    // Extract sessions from task metadata (most reliable source)
    for (const task of data.tasks || []) {
      const agentOutput = task.metadata?.agentOutput || {};
      for (const [agentName, agentData] of Object.entries(agentOutput)) {
        const d = agentData as { output?: string; error?: string; sessionKey?: string; completedAt?: number; status?: string };
        sessions.push({
          sessionKey: d.sessionKey || `orch-${task.id}-${agentName}`,
          label: `orch-${task.id}-${agentName}`,
          status: (d.status as 'running' | 'completed' | 'failed') || 'completed',
          output: d.output,
          error: d.error,
          createdAt: d.completedAt,
          updatedAt: d.completedAt,
          taskId: task.id,
          agentName: agentName as string,
          source: 'metadata' as const,
        });
      }
    }

    // Also include sessions from filesystem (fallback)
    const fsSessions = await getRecentSessions(60);
    const metadataKeys = new Set(sessions.map(s => s.sessionKey));

    for (const s of fsSessions) {
      if (metadataKeys.has(s.sessionKey)) continue;

      sessions.push({
        sessionKey: s.sessionKey,
        label: s.label || `orch-${s.taskId || 'unknown'}-${s.agentName}`,
        status: s.status,
        output: s.output,
        error: s.error,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        taskId: s.taskId || 'unknown',
        agentName: s.agentName,
        source: 'filesystem' as const,
      });
    }

    // Sort by updatedAt descending
    sessions.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    return c.json({
      success: true,
      sessions,
    });
  } catch (error) {
    console.error('Failed to get active sessions:', error);
    return c.json({
      success: true,
      sessions: [],
      error: error instanceof Error ? error.message : 'Failed to fetch sessions',
    });
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
      return c.json({ error: 'Task not found', code: ErrorCode.TASK_NOT_FOUND }, 404);
    }

    // Check if task has agent labels (orchestrated tasks have agent:* labels)
    const agentLabels = task.labels?.filter((l: string) => l.startsWith('agent:')) || [];
    if (agentLabels.length === 0) {
      return c.json({ error: 'Task has no agent assignments', code: ErrorCode.NO_AGENTS }, 400);
    }

    // Extract agent names from labels
    const agents = agentLabels.map((l: string) => l.replace('agent:', ''));
    const sequence = agents.length > 1 ? 'sequential' : 'single';

    // Extract gate_mode from metadata (default to audit-only)
    const gateMode = (task.metadata as any)?.gate_mode ?? 'audit-only';

    // Detect project from task description/labels
    const project = detectProject(task.description || task.title, task.labels || []);

    // Extract model from routing metadata (if available)
    const model = (task.metadata as any)?.routing?.model;

    // Spawn agent sessions
    const result = await executeTask(
      taskId,
      task.description || task.title,
      task.title,
      agents,
      sequence,
      gateMode,
      project,
      model
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
    return c.json({ error: 'Failed to execute task', code: ErrorCode.GATEWAY_ERROR }, 500);
  }
});


/**
 * GET /api/orchestrator/projects
 * List all available projects/repos.
 */
app.get('/api/orchestrator/projects', rateLimitGeneral, async (c) => {
  try {
    const { listProjects } = await import('../lib/project-registry.js');
    const projects = listProjects();
    return c.json({ success: true, projects });
  } catch (error) {
    console.error('Failed to list projects:', error);
    return c.json({ error: 'Failed to list projects', code: ErrorCode.GATEWAY_ERROR }, 500);
  }
});

/**
 * GET /api/orchestrator/task/:id/sessions
 * Get all sessions (including expired) for a specific task.
 * Primary source is task metadata.agentOutput (captured by webhook handler).
 * Falls back to filesystem scanning for sessions not captured.
 */
app.get('/api/orchestrator/task/:id/sessions', rateLimitGeneral, async (c) => {
  try {
    const taskId = c.req.param('id');
    const store = getKanbanStore();
    const task = await store.getTask(taskId);

    if (!task) {
      return c.json({ error: 'Task not found', code: ErrorCode.TASK_NOT_FOUND }, 404);
    }

    // Primary: Get captured agent output from task metadata (from webhook handler)
    const agentOutput = (task as any).metadata?.agentOutput || {};

    const sessions: Array<{
      sessionKey: string;
      label: string;
      status: 'running' | 'completed' | 'failed';
      output?: string;
      error?: string;
      createdAt?: number;
      updatedAt?: number;
      source: 'filesystem' | 'metadata';
    }> = [];

    // Add sessions from metadata
    for (const [agentName, data] of Object.entries(agentOutput)) {
      const typedData = data as { output?: string; error?: string; sessionKey?: string; completedAt?: number; status?: string };
      const sessionKey = typedData.sessionKey || `orch-${taskId}-${agentName}`;
      sessions.push({
        sessionKey,
        label: `orch-${taskId}-${agentName}`,
        status: (typedData.status as 'running' | 'completed' | 'failed') || 'completed',
        output: typedData.output,
        error: typedData.error,
        createdAt: typedData.completedAt,
        updatedAt: typedData.completedAt,
        source: 'metadata' as 'filesystem' | 'metadata',
      });
    }

    // Secondary: Get sessions from filesystem (fallback for sessions not captured by webhook)
    const fsSessions = await getSessionsForTask(taskId);
    const metadataSessionKeys = new Set(sessions.map(s => s.sessionKey));

    for (const s of fsSessions) {
      // Skip if we already have this session from metadata
      if (metadataSessionKeys.has(s.sessionKey)) {
        continue;
      }

      sessions.push({
        sessionKey: s.sessionKey,
        label: s.label || `orch-${taskId}-${s.agentName}`,
        status: s.status,
        output: s.output,
        error: s.error,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        source: 'filesystem' as 'filesystem' | 'metadata',
      });
    }

    return c.json({
      success: true,
      task: { id: task.id, title: task.title, status: task.status },
      sessions,
    });
  } catch (error) {
    console.error('Failed to get task sessions:', error);
    return c.json({ error: 'Failed to get task sessions', code: ErrorCode.GATEWAY_ERROR }, 500);
  }
});


export default app;

/**
 * POST /api/orchestrator/task/:id/pr
 * Create a PR for a task (commits changes and opens PR)
 */
app.post('/api/orchestrator/task/:id/pr', rateLimitGeneral, async (c) => {
  try {
    const taskId = c.req.param('id');
    const store = getKanbanStore();
    const task = await store.getTask(taskId);

    if (!task) {
      return c.json({ error: 'Task not found', code: ErrorCode.TASK_NOT_FOUND }, 404);
    }

    // Detect project for working directory
    const { detectProject } = await import('../lib/project-registry.js');
    const project = detectProject(task.description || task.title, task.labels || []);

    if (!project) {
      return c.json({ error: 'Cannot create PR: No project detected. Add project:label to task.', code: ErrorCode.NO_PROJECT }, 400);
    }

    // Complete Git workflow
    const { completeGitWorkflow } = await import('../services/github-pr.js');
    const pr = await completeGitWorkflow(
      taskId,
      task.title,
      task.description || '',
      project.localPath
    );

    // Update task with PR info
    const updatedTask = await store.updateTask(taskId, task.version, {
      pr: pr as any,
      status: 'review',
    });

    return c.json({ success: true, pr, task: updatedTask });
  } catch (error) {
    console.error('Failed to create PR:', error);
    return c.json({ error: 'Failed to create PR', code: ErrorCode.GATEWAY_ERROR, details: (error as Error).message }, 500);
  }
});

/**
 * GET /api/orchestrator/pr/:number
 * Get PR status and comments
 */
app.get('/api/orchestrator/pr/:number', rateLimitGeneral, async (c) => {
  try {
    const prNumber = parseInt(c.req.param('number'));
    const { getPRStatus, getPRComments } = await import('../services/github-pr.js');
    
    const [pr, comments] = await Promise.all([
      getPRStatus(prNumber),
      getPRComments(prNumber),
    ]);
    
    return c.json({ success: true, pr, comments });
  } catch (error) {
    console.error('Failed to get PR status:', error);
    return c.json({ error: 'Failed to get PR status', code: ErrorCode.GATEWAY_ERROR }, 500);
  }
});

/**
 * POST /api/orchestrator/pr/:number/merge
 * Merge a PR
 */
app.post('/api/orchestrator/pr/:number/merge', rateLimitGeneral, async (c) => {
  try {
    const prNumber = parseInt(c.req.param('number'));
    const { mergePR } = await import('../services/github-pr.js');
    
    await mergePR(prNumber);
    
    return c.json({ success: true, message: 'PR merged successfully' });
  } catch (error) {
    console.error('Failed to merge PR:', error);
    return c.json({ error: 'Failed to merge PR', code: ErrorCode.GATEWAY_ERROR }, 500);
  }
});

/**
 * POST /api/orchestrator/task/:id/review
 * Run automated PR review using specialist agents
 */
app.post('/api/orchestrator/task/:id/review', rateLimitGeneral, async (c) => {
  try {
    const taskId = c.req.param('id');
    const store = getKanbanStore();
    const task = await store.getTask(taskId);

    if (!task) {
      return c.json({ error: 'Task not found', code: ErrorCode.TASK_NOT_FOUND }, 404);
    }

    if (!task.pr) {
      return c.json({ error: 'Task has no PR', code: ErrorCode.PR_NOT_FOUND }, 400);
    }

    // Detect project type
    const { detectProject } = await import('../lib/project-registry.js');
    const project = detectProject(task.description || task.title, task.labels || []);

    // Run automated review
    const { runAutomatedPRReview } = await import('../services/pr-review.js');
    const report = await runAutomatedPRReview(
      taskId,
      task.pr.number,
      project?.type
    );

    // Post comments to PR
    const { postReviewCommentsToPR } = await import('../services/pr-review.js');
    await postReviewCommentsToPR(task.pr.number, report);

    // If review passed, move to REVIEW status
    // If failed, keep in in-progress for fixes
    if (report.passed) {
      await store.updateTask(taskId, task.version, {
        status: 'review',
      });
    }

    return c.json({ success: true, report, taskStatus: report.passed ? 'review' : 'in-progress' });
  } catch (error) {
    console.error('Failed to run PR review:', error);
    return c.json({ error: 'Failed to run PR review', code: ErrorCode.GATEWAY_ERROR }, 500);
  }
});

/**
 * GET /api/orchestrator/task/:id/review
 * Get latest PR review report
 */
app.get('/api/orchestrator/task/:id/review', rateLimitGeneral, async (c) => {
  // Would retrieve stored review report from task metadata
  // For now, return placeholder
  return c.json({ success: true, message: 'Review endpoint ready' });
});

/**
 * GET /api/orchestrator/stats?range=24h-rolling
 * Returns time-bucketed statistics for the orchestrator dashboard.
 */
app.get('/api/orchestrator/stats', rateLimitGeneral, async (c) => {
  try {
    const range = c.req.query('range') || 'today-local';
    const store = getKanbanStore();

    // Calculate time window
    const now = Date.now();
    let since: number;
    switch (range) {
      case 'today-local':
        since = new Date().setHours(0, 0, 0, 0);
        break;
      case 'today-utc':
        since = new Date(new Date().toISOString().split('T')[0]).getTime();
        break;
      case '24h-rolling': since = now - 24 * 60 * 60 * 1000; break;
      case '48h-rolling': since = now - 48 * 60 * 60 * 1000; break;
      case '72h-rolling': since = now - 72 * 60 * 60 * 1000; break;
      case '7d-rolling': since = now - 7 * 24 * 60 * 60 * 1000; break;
      case '14d-rolling': since = now - 14 * 24 * 60 * 60 * 1000; break;
      case '30d-rolling': since = now - 30 * 24 * 60 * 60 * 1000; break;
      default: since = new Date().setHours(0, 0, 0, 0);
    }

    // Get all tasks and filter by time
    const allTasks = await store.listTasks({ limit: 200 });
    const tasksInRange = allTasks.items.filter(t => t.createdAt >= since);

    // Build stats
    const stats: {
      range: string;
      since: string;
      activeAgents: number;
      completedInPeriod: number;
      totalTasks: number;
      failedTasks: number;
      inProgress: number;
      inReview: number;
      buckets: Array<{ time: string; created: number; completed: number }>;
      agentUsage: Array<{ agent: string; count: number }>;
      agentCosts: Array<{ agent: string; inputTokens: number; outputTokens: number; cost: number }>;
    } = {
      range,
      since: new Date(since).toISOString(),
      activeAgents: 0,
      completedInPeriod: tasksInRange.filter(t => t.status === 'done').length,
      totalTasks: tasksInRange.length,
      failedTasks: tasksInRange.filter(t => t.status === 'cancelled').length,
      inProgress: tasksInRange.filter(t => t.status === 'in-progress').length,
      inReview: tasksInRange.filter(t => t.status === 'review').length,
      // Time-bucketed data for charts (bucket by hour for <72h, by day for longer)
      buckets: buildTimeBuckets(tasksInRange, since, now, range),
      // Agent frequency
      agentUsage: buildAgentUsage(tasksInRange),
      // Per-agent token/cost breakdown
      agentCosts: await buildAgentCosts(tasksInRange),
    };

    return c.json(stats);
  } catch (error) {
    console.error('Failed to get orchestrator stats:', error);
    return c.json({ error: 'Failed to get stats', code: ErrorCode.GATEWAY_ERROR }, 500);
  }
});

function buildTimeBuckets(
  tasks: KanbanTask[],
  since: number,
  now: number,
  range: string
): Array<{ time: string; created: number; completed: number }> {
  const useHourly = ['today-local', 'today-utc', '24h-rolling', '48h-rolling', '72h-rolling'].includes(range);
  const bucketMs = useHourly ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const buckets: Array<{ time: string; created: number; completed: number }> = [];

  for (let t = since; t < now; t += bucketMs) {
    const bucketEnd = t + bucketMs;
    const label = useHourly
      ? new Date(t).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })
      : new Date(t).toLocaleDateString('en', { month: 'short', day: 'numeric' });
    buckets.push({
      time: label,
      created: tasks.filter(task => task.createdAt >= t && task.createdAt < bucketEnd).length,
      completed: tasks.filter(task =>
        task.status === 'done' && task.updatedAt >= t && task.updatedAt < bucketEnd
      ).length,
    });
  }

  return buckets;
}

function buildAgentUsage(tasks: KanbanTask[]): Array<{ agent: string; count: number }> {
  const counts: Record<string, number> = {};
  for (const task of tasks) {
    const agentLabels = task.labels?.filter((l: string) => l.startsWith('agent:')) || [];
    for (const label of agentLabels) {
      const agent = label.replace('agent:', '');
      counts[agent] = (counts[agent] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .map(([agent, count]) => ({ agent, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Build per-agent token/cost breakdown from task metadata.
 */
async function buildAgentCosts(tasks: KanbanTask[]): Promise<Array<{ agent: string; inputTokens: number; outputTokens: number; cost: number }>> {
  const agentStats: Record<string, { inputTokens: number; outputTokens: number; cost: number }> = {};

  for (const task of tasks) {
    const agentOutput = (task.metadata?.agentOutput || {}) as Record<string, any>;
    for (const [agentName, data] of Object.entries(agentOutput)) {
      if (!agentStats[agentName]) {
        agentStats[agentName] = { inputTokens: 0, outputTokens: 0, cost: 0 };
      }

      // If tokens were stored in metadata, use them
      if (data.tokens) {
        agentStats[agentName].inputTokens += data.tokens.input || 0;
        agentStats[agentName].outputTokens += data.tokens.output || 0;
        agentStats[agentName].cost += data.tokens.cost || 0;
      }
    }
  }

  return Object.entries(agentStats)
    .map(([agent, stats]) => ({
      agent,
      inputTokens: stats.inputTokens,
      outputTokens: stats.outputTokens,
      cost: Math.round(stats.cost * 10000) / 10000,
    }))
    .sort((a, b) => b.cost - a.cost);
}

/**
 * GET /api/orchestrator/task/:id/history
 * Returns execution history including audit log, agent outputs, and state transitions.
 */
app.get('/api/orchestrator/task/:id/history', rateLimitGeneral, async (c) => {
  try {
    const taskId = c.req.param('id');
    const store = getKanbanStore();
    const task = await store.getTask(taskId);

    if (!task) {
      return c.json({ error: 'Task not found', code: ErrorCode.TASK_NOT_FOUND }, 404);
    }

    // Get audit entries for this task
    const auditLog = await store.getAuditLog(taskId);

    // Get stored agent output
    const agentOutput = (task.metadata?.agentOutput || {}) as Record<string, any>;

    // Build agent list with token usage
    const agents = await Promise.all(
      Object.entries(agentOutput).map(async ([name, data]: [string, any]) => {
        // Try to get token usage from session transcript
        const sessionLabel = `orch-${taskId}-${name}`;
        const tokenUsage = await getSessionTokenUsage(sessionLabel);

        return {
          name,
          status: data.status,
          output: data.output?.substring(0, 5000),
          error: data.error,
          completedAt: data.completedAt,
          sessionKey: data.sessionKey,
          tokens: tokenUsage || undefined,
        };
      })
    );

    return c.json({
      task: {
        id: task.id,
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        labels: task.labels,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        assignee: task.assignee,
      },
      agents,
      auditLog: auditLog || [],
      pr: task.pr || null,
    });
  } catch (error) {
    console.error('Failed to get task history:', error);
    return c.json({ error: 'Failed to get task history', code: ErrorCode.GATEWAY_ERROR }, 500);
  }
});

/**
 * POST /api/orchestrator/task/:id/fix
 * Fix PR issues and re-run review
 */
app.post('/api/orchestrator/task/:id/fix', rateLimitGeneral, async (c) => {
  try {
    const taskId = c.req.param('id');
    const store = getKanbanStore();
    const task = await store.getTask(taskId);
    
    if (!task || !task.pr) {
      return c.json({ error: 'Task or PR not found', code: ErrorCode.TASK_NOT_FOUND }, 404);
    }
    
    // Get latest review report (would be stored in task metadata)
    const report = (task as any).lastReviewReport;
    if (!report) {
      return c.json({ error: 'No review report found. Run review first.', code: ErrorCode.NO_REVIEW_REPORT }, 400);
    }
    
    // Detect project type
    const { detectProject } = await import('../lib/project-registry.js');
    const project = detectProject(task.description || task.title, task.labels || []);
    
    // Fix issues
    const { fixPRIssues } = await import('../services/pr-review.js');
    const fixResult = await fixPRIssues(
      taskId,
      task.pr.number,
      report,
      project?.type,
      project?.localPath
    );
    
    if (!fixResult.success) {
      return c.json({ error: fixResult.message, code: ErrorCode.GATEWAY_ERROR }, 500);
    }
    
    // Task stays in in-progress while fixing
    return c.json({
      success: true,
      message: fixResult.message,
      commits: fixResult.commits,
      sessionLabel: fixResult.sessionLabel,
      status: 'fixing',
    });
  } catch (error) {
    console.error('Failed to fix PR issues:', error);
    return c.json({ error: 'Failed to fix PR issues', code: ErrorCode.GATEWAY_ERROR }, 500);
  }
});

/**
 * POST /api/orchestrator/task/:id/rerun-review
 * Re-run PR review after fixes
 */
app.post('/api/orchestrator/task/:id/rerun-review', rateLimitGeneral, async (c) => {
  try {
    const taskId = c.req.param('id');
    const store = getKanbanStore();
    const task = await store.getTask(taskId);
    
    if (!task || !task.pr) {
      return c.json({ error: 'Task or PR not found', code: ErrorCode.TASK_NOT_FOUND }, 404);
    }
    
    // Detect project type
    const { detectProject } = await import('../lib/project-registry.js');
    const project = detectProject(task.description || task.title, task.labels || []);
    
    // Re-run review
    const { rerunPRReview } = await import('../services/pr-review.js');
    const report = await rerunPRReview(
      taskId,
      task.pr.number,
      project?.type,
      project?.localPath
    );
    
    // Save report to task metadata
    const updatedTask = await store.updateTask(taskId, task.version, {
      pr: {
        ...task.pr,
        reviewComments: report.criticalIssues + report.highIssues,
      },
    } as any);
    
    // If passed, move to review; otherwise stay in in-progress
    const newStatus = report.passed ? 'review' : 'in-progress';
    
    return c.json({
      success: true,
      report,
      taskStatus: newStatus,
    });
  } catch (error) {
    console.error('Failed to re-run review:', error);
    return c.json({ error: 'Failed to re-run review', code: ErrorCode.GATEWAY_ERROR }, 500);
  }
});

/**
 * POST /api/orchestrator/dedup
 * Detect and merge duplicate tasks.
 * Returns list of merged groups and remaining tasks.
 * Excludes cancelled tasks and tasks prefixed with [DUPLICATE].
 */
app.post('/api/orchestrator/dedup', rateLimitGeneral, async (c) => {
  try {
    const store = getKanbanStore();
    const allTasks = await store.listTasks({ limit: 500 });

    // Filter out cancelled and already-marked duplicates
    const activeTasks = allTasks.items.filter(
      t => t.status !== 'cancelled' && !t.title.startsWith('[DUPLICATE]')
    );

    // Group tasks by normalized title
    const groups: Record<string, KanbanTask[]> = {};
    for (const task of activeTasks) {
      const normalized = normalizeTitle(task.title);
      if (!groups[normalized]) {
        groups[normalized] = [];
      }
      groups[normalized].push(task);
    }

    // Find duplicates (groups with more than one task)
    const duplicates = Object.entries(groups)
      .filter(([_, tasks]) => tasks.length > 1)
      .map(([normalized, tasks]) => ({
        normalized,
        tasks: tasks.map(t => ({ id: t.id, title: t.title, status: t.status, createdAt: t.createdAt })),
        count: tasks.length,
      }));

    return c.json({
      success: true,
      total_tasks: allTasks.items.length,
      active_tasks: activeTasks.length,
      duplicate_groups: duplicates.length,
      duplicates,
    });
  } catch (error) {
    console.error('Failed to detect duplicates:', error);
    return c.json({ error: 'Failed to detect duplicates', code: ErrorCode.GATEWAY_ERROR }, 500);
  }
});

/**
 * POST /api/orchestrator/dedup/merge
 * Merge duplicate tasks into a single task.
 * Keeps the oldest task, archives newer ones by prepending [DUPLICATE] to title.
 */
app.post('/api/orchestrator/dedup/merge', rateLimitGeneral, async (c) => {
  try {
    const { normalizedTitle } = await c.req.json();
    if (!normalizedTitle) {
      return c.json({ error: 'normalizedTitle is required', code: ErrorCode.INVALID_REQUEST }, 400);
    }

    const store = getKanbanStore();
    const allTasks = await store.listTasks({ limit: 500 });

    // Find tasks matching this normalized title
    const matchingTasks = allTasks.items.filter(
      t => normalizeTitle(t.title) === normalizedTitle
    );

    if (matchingTasks.length < 2) {
      return c.json({ error: 'No duplicates found for this title', code: ErrorCode.TASK_NOT_FOUND }, 404);
    }

    // Sort by createdAt - keep the oldest
    matchingTasks.sort((a, b) => a.createdAt - b.createdAt);
    const keeper = matchingTasks[0];
    const duplicates = matchingTasks.slice(1);

    // Archive duplicates
    const archived: string[] = [];
    for (const dup of duplicates) {
      try {
        await store.updateTask(dup.id, dup.version, {
          title: `[DUPLICATE] ${dup.title}`,
          status: 'cancelled' as const,
        });
        archived.push(dup.id);
      } catch (err) {
        console.error(`Failed to archive task ${dup.id}:`, err);
      }
    }

    return c.json({
      success: true,
      kept: { id: keeper.id, title: keeper.title },
      archived,
      archived_count: archived.length,
    });
  } catch (error) {
    console.error('Failed to merge duplicates:', error);
    return c.json({ error: 'Failed to merge duplicates', code: ErrorCode.GATEWAY_ERROR }, 500);
  }
});

/**
 * POST /api/orchestrator/dedup/proposals
 * Detect duplicate pending proposals.
 */
app.post('/api/orchestrator/dedup/proposals', rateLimitGeneral, async (c) => {
  try {
    const store = getKanbanStore();
    const allProposals = await store.listProposals('pending');

    // Group proposals by normalized title
    const groups: Record<string, typeof allProposals> = {};
    for (const proposal of allProposals) {
      const normalized = normalizeTitle(proposal.payload.title as string);
      if (!groups[normalized]) {
        groups[normalized] = [];
      }
      groups[normalized].push(proposal);
    }

    // Find duplicates (groups with more than one proposal)
    const duplicates = Object.entries(groups)
      .filter(([_, proposals]) => proposals.length > 1)
      .map(([normalized, proposals]) => ({
        normalized,
        proposals: proposals.map(p => ({
          id: p.id,
          title: p.payload.title as string,
          proposedAt: p.proposedAt,
          status: p.status,
        })),
        count: proposals.length,
      }));

    return c.json({
      success: true,
      total_proposals: allProposals.length,
      duplicate_groups: duplicates.length,
      duplicates,
    });
  } catch (error) {
    console.error('Failed to detect duplicate proposals:', error);
    return c.json({ error: 'Failed to detect duplicate proposals', code: ErrorCode.GATEWAY_ERROR }, 500);
  }
});

/**
 * POST /api/orchestrator/dedup/proposals/cleanup
 * Remove duplicate pending proposals, keeping only the oldest for each title.
 */
app.post('/api/orchestrator/dedup/proposals/cleanup', rateLimitGeneral, async (c) => {
  try {
    const store = getKanbanStore();
    const allProposals = await store.listProposals('pending');

    // Group proposals by normalized title
    const groups: Record<string, typeof allProposals> = {};
    for (const proposal of allProposals) {
      const normalized = normalizeTitle(proposal.payload.title as string);
      if (!groups[normalized]) {
        groups[normalized] = [];
      }
      groups[normalized].push(proposal);
    }

    // Find duplicates and remove all but the oldest
    const removed: string[] = [];
    for (const [normalized, proposals] of Object.entries(groups)) {
      if (proposals.length > 1) {
        // Sort by proposedAt - keep the oldest
        proposals.sort((a, b) => a.proposedAt - b.proposedAt);
        const toRemove = proposals.slice(1);

        for (const proposal of toRemove) {
          try {
            // Reject the duplicate proposal
            await store.rejectProposal(proposal.id, 'Duplicate removed by cleanup', 'operator');
            removed.push(proposal.id);
          } catch (err) {
            console.error(`Failed to remove proposal ${proposal.id}:`, err);
          }
        }
      }
    }

    return c.json({
      success: true,
      removed_count: removed.length,
      removed,
    });
  } catch (error) {
    console.error('Failed to cleanup duplicate proposals:', error);
    return c.json({ error: 'Failed to cleanup duplicate proposals', code: ErrorCode.GATEWAY_ERROR }, 500);
  }
});

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// POST /api/orchestrator/tasks/:id/resume
app.post('/api/orchestrator/tasks/:id/resume', rateLimitGeneral, async (c) => {
  const id = c.req.param('id');
  const store = getKanbanStore();

  try {
    const task = await store.getTask(id);
    if (!task || !task.run?.sessionKey) {
      return c.json({ error: 'Task not found or not running', code: ErrorCode.TASK_NOT_FOUND }, 404);
    }

    await invokeGatewayTool('sessions_resume', {
      sessionKey: task.run.sessionKey,
      prompt: 'Continue from where you left off.',
    }, 30000);

    // Broadcast stall-resumed event
    const { broadcast } = await import('../routes/events.js');
    broadcast('task.stall-resumed', {
      taskId: id,
      resumedAt: Date.now(),
    });

    return c.json({ success: true, taskId: id });
  } catch (error) {
    console.error('Resume task failed:', error);
    return c.json({ error: 'Failed to resume task', code: ErrorCode.GATEWAY_ERROR }, 500);
  }
});
