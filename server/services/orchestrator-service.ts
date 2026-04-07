/**
 * Orchestrator Service
 *
 * Handles task routing, agent execution, and status tracking.
 * Integrates with OpenClaw for subagent management.
 */

import { getKanbanStore } from '../lib/kanban-store.js';
import {
  routeTask,
  listAgents,
  getAgent,
  type SpecialistAgent,
} from '../lib/agent-registry.js';
import type { ProjectInfo } from '../lib/project-registry.js';
import { invokeGatewayTool } from '../lib/gateway-client.js';
import {
  createWorktree,
  cleanupWorktree,
  completeGitWorkflow,
  type PRInfo,
} from './github-pr.js';
import { runAutomatedPRReview, type PRReviewReport } from './pr-review.js';
import { canExecuteTask } from './dependency-service.js';
import { parseAgentSignal, extractAllSignals } from './agent-signals.js';
import { broadcast } from '../routes/events.js';
import type { AgentChain } from './agent-chains.js';

export interface OrchestratorTask {
  task_id: string;
  title: string;
  description: string;
  agents: string[];
  sequence: 'single' | 'sequential' | 'parallel';
  gate_mode: 'audit-only' | 'gate-on-write' | 'gate-on-deploy';
  routing: {
    rule_id: string | null;
    fallback_used: boolean;
    model?: string; // Recommended model based on complexity
  };
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  created_at: string;
}

/**
 * Tool execution hook configuration for orchestrator tasks.
 * Allows intercepting and modifying tool execution at the orchestrator level.
 */
export interface TaskExecutionHooks {
  /**
   * Called before a tool is executed. Can block execution by returning { block: true, reason: string }.
   * Note: This hooks into orchestrator-level tool calls, not individual LLM tool calls within agent sessions.
   * For fine-grained tool interception, use OpenClaw's gateway-level hooks.
   */
  beforeToolCall?: (params: {
    taskId: string;
    agentName: string;
    toolName: string;
    args: unknown;
  }) => Promise<{ block: boolean; reason?: string } | undefined>;

  /**
   * Called after a tool completes execution. Can modify the result.
   */
  afterToolCall?: (params: {
    taskId: string;
    agentName: string;
    toolName: string;
    result: unknown;
    isError: boolean;
  }) => Promise<{ result?: unknown; isError?: boolean } | undefined>;
}

export interface AgentExecutionResult {
  agent_name: string;
  success: boolean;
  output: string;
  error: string;
  task_id: string;
}

/**
 * Structured handoff data passed between sequential agents.
 * Provides parsed, actionable context instead of truncated raw text.
 */
export interface AgentHandoff {
  agent: string;
  status: 'completed' | 'failed';
  summary: string;
  filesChanged: string[];
  recommendations: string[];
  errors: string[];
  rawOutput?: string; // truncated for context window management
}

export interface SignalCheckpoint {
  timestamp: string;
  agent: string;
  signal: string;
  phase?: string;
  detail?: string;
  data?: Record<string, unknown>;
}

export interface TaskStatus {
  task_id: string;
  status: string;
  column: string;
  agents: Array<{
    name: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    session_key?: string;
    output?: string;
    error?: string;
  }>;
  checkpoints: Array<{
    timestamp: string;
    event: string;
    agent?: string;
    details?: Record<string, unknown>;
  }>;
  run?: {
    sessionKey: string;
    status: 'running' | 'done' | 'error' | 'aborted';
    startedAt: number;
    endedAt?: number;
    error?: string;
  };
}

/**
 * Start a new orchestrated task.
 * Creates a kanban task and routes to appropriate agents.
 */
export async function startTask(params: {
  title: string;
  description: string;
  gate_mode?: 'audit-only' | 'gate-on-write' | 'gate-on-deploy';
  priority?: 'critical' | 'high' | 'normal' | 'low';
  column?: 'backlog' | 'todo';
}): Promise<OrchestratorTask> {
  const { title, description, gate_mode } = params;

  // Route the task to agents
  const routing = routeTask(description);

  // Use explicit gate_mode if provided, otherwise use routing result's gate_mode
  const effectiveGateMode = gate_mode ?? routing.gate_mode;

  // Generate task ID
  const taskId = `orch-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

  // Create the task
  const task: OrchestratorTask = {
    task_id: taskId,
    title,
    description,
    agents: routing.agents,
    sequence: routing.sequence,
    gate_mode: effectiveGateMode,
    routing: {
      rule_id: routing.rule_id,
      fallback_used: routing.fallback_used,
      model: routing.model,
    },
    status: 'queued',
    created_at: new Date().toISOString(),
  };

  return task;
}

/**
 * Instruction appended to sequential agent prompts requiring structured JSON output.
 */
const HANDOFF_INSTRUCTION = `

**OUTPUT FORMAT:** At the end of your work, output a structured summary as a JSON code block:
\`\`\`json
{
  "summary": "Brief description of what you did",
  "files_changed": ["path/to/file1.ts", "path/to/file2.ts"],
  "recommendations": ["Follow-up action 1", "Follow-up action 2"],
  "errors": ["Any issues encountered"]
}
\`\`\`
This will be passed to the next agent in the pipeline.`;

/**
 * Parse agent output into structured handoff data.
 * Extracts JSON block if present, falls back to raw text summary.
 */
function parseAgentHandoff(agentName: string, output: string): AgentHandoff {
  const handoff: AgentHandoff = {
    agent: agentName,
    status: 'completed',
    summary: '',
    filesChanged: [],
    recommendations: [],
    errors: [],
    rawOutput: output?.substring(0, 2000),
  };

  // Try to extract structured JSON from the output
  const jsonMatch = output?.match(/```json\\s*\\n([\\s\\S]*?)\\n```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      handoff.summary = parsed.summary || '';
      handoff.filesChanged = parsed.files_changed || [];
      handoff.recommendations = parsed.recommendations || [];
      handoff.errors = parsed.errors || [];
    } catch {
      // JSON parse failed — use raw output as summary
      handoff.summary = output?.substring(0, 500) || 'No output captured';
    }
  } else {
    handoff.summary = output?.substring(0, 500) || 'No output captured';
  }

  return handoff;
}

/**
 * Build gate mode-specific instructions for agent prompts.
 * Controls what actions the agent is allowed to take.
 */
function buildGateInstructions(gateMode: 'audit-only' | 'gate-on-write' | 'gate-on-deploy'): string {
  switch (gateMode) {
    case 'audit-only':
      return `**OPERATING MODE: AUDIT-ONLY**

You are in read-only analysis mode. Your responsibilities:
- Analyze the codebase and identify issues
- Provide recommendations and suggestions
- Do NOT make any file changes, commits, or deployments
- Do NOT run commands that modify state (no git commit, no npm install, no file writes)
- Output a detailed report with your findings and suggested next steps

This is a non-destructive review task.`;

    case 'gate-on-write':
      return `**OPERATING MODE: GATE-ON-WRITE**

You have full execution capabilities EXCEPT for file writes, which require human approval.

For file modifications:
1. Identify the files that need to be changed
2. Write the proposed changes
3. Submit a proposal for human approval before committing
4. Wait for approval before proceeding with git commit

You MAY:
- Run analysis tools, linters, type checks
- Execute read-only commands (git status, git diff, grep, etc.)
- Create proposals for file changes

You MUST NOT:
- Commit changes without proposal approval
- Push to remote without explicit approval
`;

    case 'gate-on-deploy':
      return `**OPERATING MODE: GATE-ON-DEPLOY**

You have full execution capabilities for development work. Only deployment actions require human approval.

You MAY:
- Make file changes and commit them
- Run tests, linters, builds
- Create branches and push commits
- Refactor code, fix bugs, implement features

You MUST get approval before:
- Deploying to any environment (staging, production)
- Running migration scripts in production
- Modifying production infrastructure
- Executing irreversible operations

For deployment actions:
1. Prepare the deployment plan
2. Submit a proposal describing what will be deployed and why
3. Wait for human approval before executing
`;

    default:
      return '';
  }
}

/**
 * Execute a task by spawning agent sessions via OpenClaw Gateway.
 * Called when a kanban task is moved to "in-progress" or executed.
 *
 * Full workflow:
 * 1. Create git worktree for isolated execution
 * 2. Spawn agent(s) to work in the worktree
 * 3. After agents complete: commit, push, create PR
 * 4. Run automated PR review
 * 5. Store PR info in task metadata
 */
export async function executeTask(
  taskId: string,
  taskDescription: string,
  taskTitle: string, // Added title for PR creation
  agents: string[],
  sequence: 'single' | 'sequential' | 'parallel',
  gateMode?: 'audit-only' | 'gate-on-write' | 'gate-on-deploy',
  project?: ProjectInfo | null,
  model?: string // Optional model override from routing
): Promise<{ session_labels: string[]; pr?: PRInfo; review?: PRReviewReport }> {
  const sessionLabels: string[] = [];
  let worktreePath: string | undefined;
  let prInfo: PRInfo | undefined;
  let reviewReport: PRReviewReport | undefined;

  // Check dependencies before execution
  const depCheck = await canExecuteTask(taskId);
  if (!depCheck.canExecute) {
    throw new Error(`DEPENDENCY_NOT_MET: Cannot execute task ${taskId} - blocked by: ${depCheck.blockedBy?.join(', ')}`);
  }

  // Default to audit-only if not specified (backward compatibility)
  const effectiveGateMode = gateMode ?? 'audit-only';

  // Build gate instructions based on mode
  const gateInstructions = buildGateInstructions(effectiveGateMode);

  // Build context with project info if available
  const projectContext = project
    ? `\n\n**Working Directory:** ${project.localPath}\n**GitHub Repo:** ${project.githubRepo || 'N/A'}\n**Project:** ${project.name}`
    : '';

  try {
    // Phase 1: Create worktree for isolated execution (skip for audit-only mode)
    if (effectiveGateMode !== 'audit-only' && project) {
      // Use 'main' as default branch - projects don't specify branch in registry
      const baseBranch = 'main';
      worktreePath = await createWorktree(taskId, taskTitle, baseBranch);
      console.log(`[orchestrator] Created worktree at ${worktreePath} for task ${taskId}`);
    }

    // Phase 2: Spawn agents
    if (sequence === 'parallel') {
      // Spawn all agents in parallel
      const promises = agents.map(async (agentName) => {
        const label = `orch-${taskId}-${agentName}`;
        const prompt = `${taskDescription}${projectContext}\n\n${gateInstructions}`;
        // Pass worktree path if available
        const targetDir = worktreePath || project?.localPath;
        const result = await spawnAgentSession(agentName, prompt, label, targetDir, model);
        if (result.session_key) {
          sessionLabels.push(label);
          // Parse and broadcast signals from agent output
          if (result.output) {
            broadcastAgentSignals(taskId, agentName, result.output);
          }
        }
        return result;
      });

      await Promise.all(promises);
    } else {
      // Spawn agents sequentially with structured handoff
      const handoffs: AgentHandoff[] = [];

      for (const agentName of agents) {
        const label = `orch-${taskId}-${agentName}`;

        // Build context from previous handoffs
        let previousContext = '';
        if (handoffs.length > 0) {
          previousContext = '\n\n**PREVIOUS AGENT RESULTS:**\n' +
            handoffs.map(h => `### ${h.agent} (${h.status})
Summary: ${h.summary}
Files changed: ${h.filesChanged.join(', ') || 'none'}
${h.recommendations.length ? 'Recommendations: ' + h.recommendations.join('; ') : ''}
${h.errors.length ? 'Errors: ' + h.errors.join('; ') : ''}`
            ).join('\n\n');
        }

        // Build prompt with handoff instruction for sequential agents
        const basePrompt = previousContext
          ? `${taskDescription}${previousContext}`
          : taskDescription;

        // Add handoff instruction only for sequential (not single)
        const handoffPrompt = sequence === 'sequential'
          ? `${basePrompt}${HANDOFF_INSTRUCTION}`
          : basePrompt;

        const fullPrompt = `${handoffPrompt}${projectContext}\n\n${gateInstructions}`;

        // Pass worktree path if available
        const targetDir = worktreePath || project?.localPath;
        const result = await spawnAgentSession(agentName, fullPrompt, label, targetDir, model);
        if (result.session_key) {
          sessionLabels.push(label);
          // Parse and broadcast signals from agent output
          if (result.output) {
            broadcastAgentSignals(taskId, agentName, result.output);
            handoffs.push(parseAgentHandoff(agentName, result.output));
          }
        }
      }
    }

    // Phase 3: After agents complete - create branch, commit, push, PR (skip for audit-only)
    if (worktreePath && effectiveGateMode !== 'audit-only') {
      console.log(`[orchestrator] Running git workflow for task ${taskId}...`);

      prInfo = await completeGitWorkflow(taskId, taskTitle, taskDescription, worktreePath);
      console.log(`[orchestrator] Created PR #${prInfo.number} for task ${taskId}`);

      // Phase 4: Run automated PR review
      console.log(`[orchestrator] Running PR review for PR #${prInfo.number}...`);
      reviewReport = await runAutomatedPRReview(taskId, prInfo.number, project?.type);

      // Phase 5: Store PR info and review in task metadata
      const store = getKanbanStore();
      const task = await store.getTask(taskId).catch(() => null);

      if (task) {
        // Update task with PR info and review status
        await store.updateTask(taskId, task.version, {
          pr: {
            number: prInfo.number,
            url: prInfo.url,
            branch: prInfo.branch,
            status: prInfo.status,
            reviewComments: reviewReport.criticalIssues + reviewReport.highIssues + reviewReport.mediumIssues + reviewReport.lowIssues,
            reviewPassed: reviewReport.passed,
            criticalIssues: reviewReport.criticalIssues,
            highIssues: reviewReport.highIssues,
          },
          metadata: {
            ...task.metadata,
            prReview: reviewReport,
          },
        });
        console.log(`[orchestrator] Stored PR info in task ${taskId}`);
      }

      // Phase 6: Cleanup worktree
      await cleanupWorktree(worktreePath);
      console.log(`[orchestrator] Cleaned up worktree for task ${taskId}`);
    }

    return {
      session_labels: sessionLabels,
      pr: prInfo,
      review: reviewReport,
    };
  } catch (error) {
    console.error(`[orchestrator] Error executing task ${taskId}:`, error);

    // Cleanup worktree on error
    if (worktreePath) {
      try {
        await cleanupWorktree(worktreePath);
      } catch (cleanupError) {
        console.error(`[orchestrator] Failed to cleanup worktree on error:`, cleanupError);
      }
    }

    throw error;
  }
}

/**
 * Spawn a single agent session using the Gateway sessions_spawn tool.
 * Uses subagent runtime with run mode for one-shot execution.
 *
 * Note: sessions_spawn doesn't support cwd parameter, so working directory
 * must be included in the prompt itself.
 */
async function spawnAgentSession(
  agentName: string,
  prompt: string,
  label: string,
  workingDir?: string,
  model?: string // Optional model override from routing
): Promise<{ session_key?: string; output?: string; error?: string }> {
  try {
    const agent = getAgent(agentName);
    if (!agent) {
      return { error: `Unknown agent: ${agentName}` };
    }

    // Truncate label for Gateway (max 50 chars)
    const shortLabel = label.substring(0, 50);

    // Build thinking level from agent config
    const thinking = agent.thinking ?? 'medium';

    // Build model: routing override takes priority, then agent default, then undefined
    const effectiveModel = model ?? agent.model ?? undefined;
    
    // Include working directory in the PROMPT (sessions_spawn doesn't support cwd)
    const fullPrompt = workingDir
      ? `**WORKING DIRECTORY:** ${workingDir}\n\nIMPORTANT: All file operations, git commands, and code changes must be performed in the directory above. Do NOT work in any other directory.\n\n${prompt}`
      : prompt;
    
    // Use sessions_spawn tool via gateway
    // Use 'session' mode for persistent interactive work (not 'run' which expires)
    const spawnArgs: Record<string, unknown> = {
      task: fullPrompt,
      label: shortLabel,
      runtime: 'subagent',
      mode: 'session', // Persistent session (doesn't expire after "completion")
      thinking: thinking,
      cleanup: 'keep', // Keep session for later inspection
    };
    
    // Add model override if specified
    if (effectiveModel) {
      spawnArgs.model = effectiveModel;
    }
    
    const result = await invokeGatewayTool('sessions_spawn', spawnArgs, 30000); // 30 second timeout for spawn
    
    // Extract session key from result
    const sessionKey = (result as Record<string, unknown>)?.sessionKey as string | undefined;
    
    return {
      session_key: sessionKey || `agent:${agentName}:subagent:${Date.now()}`,
      output: `Sub-agent ${agentName} spawned successfully`,
    };
  } catch (error) {
    console.error(`Failed to spawn agent ${agentName}:`, error);
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Get task status including agent session states.
 * Prefers stored metadata from kanban (reliable, persistent) over live gateway polling.
 */
export async function getTaskStatus(taskId: string): Promise<TaskStatus | null> {
  try {
    // Get task from kanban store first
    const store = getKanbanStore();
    const task = await store.getTask(taskId).catch(() => null);

    if (!task) {
      return null;
    }

    // Get stored agent output from metadata (reliable, persistent)
    const storedOutput = (task.metadata?.agentOutput || {}) as Record<string, unknown>;

    // Also check live sessions for running agents
    let liveSessions: Array<Record<string, unknown>> = [];
    try {
      const result = await invokeGatewayTool('subagents', {
        action: 'list',
        recentMinutes: 30,
      }, 10000);
      const parsed = result as Record<string, unknown>;
      liveSessions = [
        ...((parsed.active ?? []) as Array<Record<string, unknown>>),
        ...((parsed.recent ?? []) as Array<Record<string, unknown>>),
      ].filter((s) => String(s.label ?? '').startsWith(`orch-${taskId}-`));
    } catch {
      // Gateway unavailable — rely on stored data only
    }

    // Get expected agents from task labels
    const agentLabels = task.labels?.filter((l: string) => l.startsWith('agent:')) || [];
    const expectedAgents = agentLabels.map((l: string) => l.replace('agent:', ''));

    // Build agent status: stored metadata for completed, live for running
    const agents = expectedAgents.map((agentName: string) => {
      // Check stored output first
      const stored = storedOutput[agentName] as Record<string, unknown> | undefined;
      if (stored && (stored.status === 'done' || stored.status === 'completed' || stored.status === 'error')) {
        return {
          name: agentName,
          status: stored.status === 'error' ? 'failed' as const : 'completed' as const,
          session_key: stored.sessionKey as string | undefined,
          output: stored.output as string | undefined,
          error: stored.error as string | undefined,
        };
      }

      // Check live sessions for running agents
      const live = liveSessions.find((s) =>
        String(s.label ?? '').endsWith(`-${agentName}`)
      );
      if (live) {
        return {
          name: agentName,
          status: mapSessionStatus(String(live.status ?? '')),
          session_key: live.sessionKey as string | undefined,
          output: live.output as string | undefined,
          error: live.error as string | undefined,
        };
      }

      // Not found anywhere — pending or lost
      return {
        name: agentName,
        status: 'pending' as const,
      };
    });

    return {
      task_id: taskId,
      status: task.status,
      column: task.status,
      agents,
      checkpoints: [],
      run: task.run,
    };
  } catch (error) {
    console.error(`Failed to get task status for ${taskId}:`, error);
    return null;
  }
}

/**
 * Map gateway session status to agent status.
 */
function mapSessionStatus(sessionStatus: string): 'pending' | 'running' | 'completed' | 'failed' {
  switch (sessionStatus) {
    case 'running':
      return 'running';
    case 'done':
      return 'completed';
    case 'error':
    case 'failed':
      return 'failed';
    default:
      return 'pending';
  }
}

/**
 * List all available specialist agents.
 */
export function listSpecialistAgents(): SpecialistAgent[] {
  return listAgents();
}

/**
 * Preview routing for a task description (dry-run).
 */
export function previewRouting(description: string) {
  return routeTask(description);
}

/**
 * Cancel a running task by killing associated agent sessions.
 */
export async function cancelTask(taskId: string): Promise<boolean> {
  try {
    // Get recent sessions via gateway tool
    const result = await invokeGatewayTool('subagents', {
      action: 'list',
      recentMinutes: 30,
    }, 10000);

    const parsed = result as Record<string, unknown>;
    const sessions = (parsed.active as Array<Record<string, unknown>>) || [];

    // Find sessions for this task
    const taskSessions = sessions.filter((s) => {
      const label = String(s.label ?? '');
      return label.startsWith(`orch-${taskId}-`);
    });

    // Kill each session using process tool
    for (const session of taskSessions) {
      const sessionKey = session.sessionKey as string | undefined;
      if (sessionKey) {
        try {
          await invokeGatewayTool('process', {
            action: 'kill',
            sessionId: sessionKey,
          }, 5000);
        } catch {
          // Ignore kill errors
        }
      }
    }

    return true;
  } catch (error) {
    console.error(`Failed to cancel task ${taskId}:`, error);
    return false;
  }
}

/**
 * Normalize a title for comparison (lowercase, remove punctuation, collapse spaces).
 */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if a title is similar to any existing task titles.
 * Uses normalized comparison - considers titles matching if normalized forms are equal.
 */
function isDuplicateTitle(newTitle: string, existingTitles: string[]): boolean {
  const normalized = normalizeTitle(newTitle);
  return existingTitles.some(existing => normalizeTitle(existing) === normalized);
}

/**
 * Parse agent output for next steps, gaps, and recommendations.
 * Creates kanban proposals from structured findings.
 *
 * Strategies:
 * 1. Parse structured JSON proposals/recommendations arrays
 * 2. Handle handoff-format recommendations from AgentHandoff
 * 3. Detect TODO/FIXME/FOLLOW-UP patterns in raw output
 * 4. Fall back to markdown section parsing
 *
 * Deduplication:
 * - Checks against existing tasks to avoid creating duplicates
 * - Deduplicates within the current batch
 */
export async function createProposalsFromFindings(
  taskId: string,
  taskTitle: string,
  agentOutput: string
): Promise<{ proposals_created: number }> {
  const proposals: Array<{
    title: string;
    description: string;
    priority: 'high' | 'normal' | 'low';
    labels?: string[];
  }> = [];

  // Get existing task titles AND pending proposals for deduplication
  const store = getKanbanStore();
  const [existingTasks, existingProposals] = await Promise.all([
    store.listTasks({ limit: 500 }),
    store.listProposals('pending'),
  ]);
  const existingTitles = existingTasks.items.map(t => t.title);
  // Also check pending proposals to avoid creating duplicate proposals
  const pendingProposalTitles = existingProposals.map(p => p.payload.title as string);

  // Strategy 1: Parse structured JSON blocks
  const jsonBlocks = agentOutput.matchAll(/```json\s*\n([\s\S]*?)\n```/g);
  for (const match of jsonBlocks) {
    try {
      const parsed = JSON.parse(match[1]);

      // Handle proposals array
      if (Array.isArray(parsed.proposals)) {
        for (const p of parsed.proposals) {
          if (p.title || p.description) {
            proposals.push({
              title: (p.title || 'Follow-up task').substring(0, 200),
              description: `${p.description || ''}\n\n*Source: ${taskTitle}*`.substring(0, 5000),
              priority: mapPriority(p.priority || p.severity),
              labels: [`source:${taskId}`],
            });
          }
        }
      }

      // Handle recommendations array
      if (Array.isArray(parsed.recommendations)) {
        for (const rec of parsed.recommendations) {
          const recText = typeof rec === 'string' ? rec : JSON.stringify(rec);
          proposals.push({
            title: recText.substring(0, 200),
            description: `Recommendation from ${taskTitle}\n\nDetails: ${recText}`,
            priority: 'low',
            labels: [`source:${taskId}`],
          });
        }
      }

      // Handle files_changed as follow-up tasks (review/testing)
      if (Array.isArray(parsed.files_changed) && parsed.files_changed.length > 0) {
        proposals.push({
          title: `Review changes in ${parsed.files_changed.length} file(s)`,
          description: `Files modified:\n${parsed.files_changed.join('\n')}\n\n*From task: ${taskTitle}*`,
          priority: 'normal',
          labels: [`source:${taskId}`],
        });
      }
    } catch {
      // Invalid JSON in this block, skip to next
    }
  }

  // Strategy 2: TODO/FIXME/FOLLOW-UP pattern detection (inline patterns, not section headers)
  const todoPattern = /(?:TODO|FIXME|FOLLOW-UP|ACTION ITEM)[:\s]+(.+?)(?:\n|$)/gi;
  let todoMatch;
  while ((todoMatch = todoPattern.exec(agentOutput)) !== null) {
    const todoText = todoMatch[1].trim();
    if (todoText.length > 0 && todoText.length < 500) {
      const isHigh = /FIXME|BUG|CRITICAL|URGENT/i.test(todoMatch[0]);
      proposals.push({
        title: todoText.substring(0, 200),
        description: `Identified in ${taskTitle}\n\nRaw: ${todoMatch[0]}`,
        priority: isHigh ? 'high' : 'normal',
        labels: [`source:${taskId}`, 'pattern-detected'],
      });
    }
  }

  // Strategy 3: Markdown section parsing (fallback if no JSON found)
  if (proposals.length === 0) {
    const lines = agentOutput.split('\n');
    let currentSection: 'next_steps' | 'gaps' | 'recommendations' | null = null;
    let buffer: string[] = [];

    for (const line of lines) {
      const lowerLine = line.toLowerCase();
      const trimmedLine = line.trim();

      // Detect section headers - only markdown headers (##, ###)
      const isHeader = trimmedLine.startsWith('##') || trimmedLine.startsWith('###');

      if (isHeader) {
        if (lowerLine.includes('next step')) {
          currentSection = 'next_steps';
          buffer = [];
          continue;
        }
        if (lowerLine.includes('gap')) {
          currentSection = 'gaps';
          buffer = [];
          continue;
        }
        if (lowerLine.includes('recommendation')) {
          currentSection = 'recommendations';
          buffer = [];
          continue;
        }
      }

      // Collect bullet points
      if (currentSection && (line.trim().startsWith('-') || line.trim().startsWith('*') || /^\d+\./.test(line.trim()))) {
        buffer.push(line.trim().replace(/^[-*]\s*|^\d+\.\s*/, ''));
      } else if (buffer.length > 0 && line.trim() === '') {
        // End of bullet list - create proposal
        const title = buffer[0] || 'Follow-up task';
        const description = buffer.join('\n') + `\n\n*Identified during: ${taskTitle}*`;

        proposals.push({
          title: title.substring(0, 200),
          description: description.substring(0, 5000),
          priority: currentSection === 'gaps' ? 'high' : currentSection === 'next_steps' ? 'normal' : 'low',
          labels: [`source:${taskId}`],
        });
        buffer = [];
      }
    }

    // Process any remaining buffer
    if (buffer.length > 0) {
      const title = buffer[0] || 'Follow-up task';
      const description = buffer.join('\n') + `\n\n*Identified during: ${taskTitle}*`;
      proposals.push({
        title: title.substring(0, 200),
        description: description.substring(0, 5000),
        priority: 'normal',
        labels: [`source:${taskId}`],
      });
    }
  }

  // Deduplicate proposals by title (within batch)
  const seenInBatch = new Set<string>();
  const uniqueProposals = proposals.filter(p => {
    const key = p.title.toLowerCase().trim();
    if (seenInBatch.has(key)) return false;
    seenInBatch.add(key);
    return true;
  });

  // Deduplicate against existing tasks AND pending proposals
  const dedupedProposals = uniqueProposals.filter(p => {
    if (isDuplicateTitle(p.title, existingTitles)) {
      console.log(`Skipping duplicate proposal: "${p.title}" (task already exists)`);
      return false;
    }
    if (isDuplicateTitle(p.title, pendingProposalTitles)) {
      console.log(`Skipping duplicate proposal: "${p.title}" (pending proposal already exists)`);
      return false;
    }
    return true;
  });

  // Create proposals via kanban API
  let created = 0;
  for (const proposal of dedupedProposals) {
    try {
      const { exec } = await import('node:child_process');
      const execAsync = (await import('node:util')).promisify(exec);

      const curlCmd = `curl -s -X POST http://localhost:3080/api/kanban/proposals \
        -H "Content-Type: application/json" \
        -d '${JSON.stringify({
          type: 'create',
          payload: {
            title: proposal.title,
            description: proposal.description,
            priority: proposal.priority,
            column: 'backlog',
            labels: proposal.labels || [`source:${taskId}`],
          },
          sourceSessionKey: `orch-${taskId}`,
          proposedBy: 'agent:orchestrator-agent',
        })}'`;

      await execAsync(curlCmd);
      created++;
    } catch (error) {
      console.error(`Failed to create proposal: ${proposal.title}`, error);
    }
  }

  return { proposals_created: created };
}

/**
 * Map agent severity/priority strings to kanban priority levels.
 */
function mapPriority(severity: string | number | undefined): 'high' | 'normal' | 'low' {
  if (severity === undefined || severity === null) return 'normal';

  const str = String(severity).toLowerCase();
  if (['critical', 'urgent', 'high', 'p0', 'p1', 'severity:high'].some(s => str.includes(s))) {
    return 'high';
  }
  if (['medium', 'med', 'p2', 'normal', 'standard'].some(s => str.includes(s))) {
    return 'normal';
  }
  return 'low';
}

/**
 * Parse agent output for signals and broadcast to SSE subscribers.
 */
function broadcastAgentSignals(taskId: string, agentName: string, output: string): void {
  const signals = extractAllSignals(output);

  for (const signal of signals) {
    const checkpoint: SignalCheckpoint = {
      timestamp: new Date().toISOString(),
      agent: agentName,
      signal: signal.signal,
      phase: 'phase' in signal ? signal.phase : undefined,
      detail: 'detail' in signal ? signal.detail : undefined,
      data: signal as unknown as Record<string, unknown>,
    };

    // Broadcast to SSE subscribers
    broadcast('agent.signal', {
      taskId,
      checkpoint,
    });

    // Handle blocker signals specially
    if (signal.signal === 'blocker') {
      broadcast('task.blocked', {
        taskId,
        agent: agentName,
        reason: signal.reason,
        suggestion: signal.suggestion,
        requiresHumanInput: signal.requiresHumanInput,
      });
    }
  }
}

/**
 * Build handoff context from previous agent output for chain transitions.
 * Provides structured summary for the next agent in sequence.
 */
function buildHandoffContext(previousAgent: string, previousOutput: string, chainName: string): string {
  // Extract key information from previous agent output
  const context = {
    previousAgent,
    chainName,
    summary: previousOutput.substring(0, 2000), // Truncate for context window
  };

  return `## Context from Previous Agent: ${previousAgent}

This task is part of the "${chainName}" multi-agent workflow.

### Previous Agent Output Summary:
${context.summary}

### Your Role:
Continue the workflow based on the work completed by the previous agent.
Build upon their findings and recommendations.`;
}

/**
 * Execute a task using an agent chain.
 * Chains enable sequential multi-agent workflows with automatic handoffs.
 */
export async function executeChain(
  taskId: string,
  chainId: string
): Promise<{ success: boolean; error?: string }> {
  const { getChain, getNextStep } = await import('./agent-chains.js');
  const chain = getChain(chainId);

  if (!chain) {
    return { success: false, error: `Unknown chain: ${chainId}` };
  }

  const store = getKanbanStore();
  const task = await store.getTask(taskId);

  if (!task) {
    return { success: false, error: 'Task not found' };
  }

  try {
    // Store chain state in metadata
    const newVersion = task.version + 1;
    await store.updateTask(taskId, task.version, {
      version: newVersion,
      metadata: {
        ...(task.metadata as Record<string, unknown> || {}),
        chainId,
        chainStep: 0,
        chainStatus: 'running',
      },
    } as never);

    // Start first step
    await executeChainStep(taskId, chain, 0);
    return { success: true };
  } catch (error) {
    console.error('Chain execution failed:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Chain failed' };
  }
}

/**
 * Execute a single step in the chain and schedule the next step.
 */
async function executeChainStep(
  taskId: string,
  chain: AgentChain,
  stepIndex: number
): Promise<void> {
  const { getNextStep } = await import('./agent-chains.js');
  const step = chain.steps[stepIndex];

  if (!step) {
    // Chain complete
    const store = getKanbanStore();
    const task = await store.getTask(taskId);
    if (task) {
      await store.updateTask(taskId, task.version, {
        metadata: {
          ...(task.metadata as Record<string, unknown> || {}),
          chainStatus: 'complete',
          chainCompletedAt: Date.now(),
        },
      } as never);
    }
    broadcast('chain.complete', { taskId, chainId: chain.id });
    return;
  }

  const store = getKanbanStore();
  const task = await store.getTask(taskId);
  if (!task) return;

  // Build prompt with handoff context if not first step
  let prompt = step.prompt || `Continue work on this task as part of the "${chain.name}" workflow.`;

  if (stepIndex > 0) {
    const previousStep = chain.steps[stepIndex - 1];
    const previousOutput = (task.metadata as Record<string, unknown>)?.[`${previousStep.agent}Output`] as string || '';
    prompt = buildHandoffContext(previousStep.agent, previousOutput, chain.name) + '\n\n' + prompt;
  }

  // Execute agent via gateway
  const result = await invokeGatewayTool('sessions_spawn', {
    task: prompt,
    label: `chain-${chain.id}-${step.agent}`,
    runtime: 'subagent',
    mode: 'session',
    thinking: step.thinking || 'medium',
    cleanup: 'keep',
  }, step.timeoutMs || 300000);

  // Parse response - cast to known session_spawn result shape
  const resultTyped = result as { status?: string; output?: string | Record<string, unknown>; error?: string } | undefined;
  const output = resultTyped?.output ? String(typeof resultTyped.output === 'string' ? resultTyped.output : JSON.stringify(resultTyped.output)) : '';
  const success = resultTyped?.status === 'done' || !resultTyped?.error;

  // Store output for next handoff
  const currentTask = await store.getTask(taskId);
  if (currentTask) {
    await store.updateTask(taskId, currentTask.version, {
      metadata: {
        ...(currentTask.metadata as Record<string, unknown> || {}),
        chainStep: stepIndex,
        currentAgent: step.agent,
        [`${step.agent}Output`]: output,
        [`${step.agent}Success`]: success,
      },
    } as never);
  }

  // Broadcast progress
  broadcast('chain.step', {
    taskId,
    chainId: chain.id,
    stepIndex,
    agent: step.agent,
    success,
  });

  // Schedule next step with delay
  const nextStep = getNextStep(chain, step.agent);
  if (nextStep) {
    setTimeout(() => executeChainStep(taskId, chain, stepIndex + 1), 2000);
  }
}
