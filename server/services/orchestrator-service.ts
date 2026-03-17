/**
 * Orchestrator Service
 *
 * Handles task routing, agent execution, and status tracking.
 * Integrates with OpenClaw for subagent management.
 */

import { getKanbanStore, type KanbanTask } from '../lib/kanban-store.js';
import {
  routeTask,
  listAgents,
  getAgent,
  type SpecialistAgent,
} from '../lib/agent-registry.js';
import { detectProject, type ProjectInfo } from '../lib/project-registry.js';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { invokeGatewayTool } from '../lib/gateway-client.js';

const execAsync = promisify(exec);

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
  };
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  created_at: string;
}

export interface AgentExecutionResult {
  agent_name: string;
  success: boolean;
  output: string;
  error: string;
  task_id: string;
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
  const { title, description, gate_mode = 'audit-only', priority = 'normal', column = 'todo' } = params;

  // Route the task to agents
  const routing = routeTask(description);

  // Generate task ID
  const taskId = `orch-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

  // Create the task
  const task: OrchestratorTask = {
    task_id: taskId,
    title,
    description,
    agents: routing.agents,
    sequence: routing.sequence,
    gate_mode,
    routing: {
      rule_id: routing.rule_id,
      fallback_used: routing.fallback_used,
    },
    status: 'queued',
    created_at: new Date().toISOString(),
  };

  return task;
}

/**
 * Execute a task by spawning agent sessions via OpenClaw Gateway.
 * Called when a kanban task is moved to "in-progress" or executed.
 */
export async function executeTask(
  taskId: string,
  taskDescription: string,
  agents: string[],
  sequence: 'single' | 'sequential' | 'parallel',
  project?: ProjectInfo | null
): Promise<{ session_labels: string[] }> {
  const sessionLabels: string[] = [];
  
  // Build context with project info if available
  const projectContext = project 
    ? `\n\n**Working Directory:** ${project.localPath}\n**GitHub Repo:** ${project.githubRepo || 'N/A'}\n**Project:** ${project.name}`
    : '';

  if (sequence === 'parallel') {
    // Spawn all agents in parallel
    const promises = agents.map(async (agentName) => {
      const label = `orch-${taskId}-${agentName}`;
      const prompt = `${taskDescription}${projectContext}`;
      const result = await spawnAgentSession(agentName, prompt, label, project?.localPath);
      if (result.session_key) {
        sessionLabels.push(label);
      }
      return result;
    });

    await Promise.all(promises);
  } else {
    // Spawn agents sequentially
    let context = '';
    for (const agentName of agents) {
      const label = `orch-${taskId}-${agentName}`;
      const prompt = context
        ? `${taskDescription}\n\nPrevious context: ${context}`
        : taskDescription;

      const result = await spawnAgentSession(agentName, prompt, label);
      if (result.session_key) {
        sessionLabels.push(label);
        // Capture output for next agent
        if (result.output) {
          context += `\n\n${agentName} completed: ${result.output.substring(0, 1000)}`;
        }
      }
    }
  }

  return { session_labels: sessionLabels };
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
  workingDir?: string
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
    
    // Build model from agent config (falls back to gateway default)
    const model = agent.model ?? undefined;
    
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
    if (model) {
      spawnArgs.model = model;
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
 */
export async function getTaskStatus(taskId: string): Promise<TaskStatus | null> {
  try {
    // Get recent subagent sessions via gateway tool
    const result = await invokeGatewayTool('subagents', {
      action: 'list',
      recentMinutes: 30,
    }, 10000);

    let sessions: Array<Record<string, unknown>> = [];
    const parsed = result as Record<string, unknown>;
    sessions = ((parsed.active as Array<Record<string, unknown>>) || []).concat(
      (parsed.recent as Array<Record<string, unknown>>) || []
    );

    // Find sessions for this task
    const taskSessions = sessions.filter((s) => {
      const label = String(s.label ?? '');
      return label.startsWith(`orch-${taskId}-`);
    });

    // Build agent status
    const agents = taskSessions.map((session) => {
      const label = String(session.label ?? '');
      const agentName = label.replace(`orch-${taskId}-`, '');
      const status = session.status as string;

      return {
        name: agentName,
        status: mapSessionStatus(status),
        session_key: session.sessionKey as string | undefined,
        output: session.output as string | undefined,
        error: session.error as string | undefined,
      };
    });

    // Get task from kanban store
    const store = getKanbanStore();
    const task = await store.getTask(taskId).catch(() => null);

    if (!task) {
      return null;
    }

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
 * Parse agent output for next steps, gaps, and recommendations.
 * Creates kanban proposals from structured findings.
 */
export async function createProposalsFromFindings(
  taskId: string,
  taskTitle: string,
  agentOutput: string
): Promise<{ proposals_created: number }> {
  const proposals: Array<{ title: string; description: string; priority: 'high' | 'normal' | 'low' }> = [];
  
  // Parse output for common patterns
  const lines = agentOutput.split('\n');
  let currentSection: 'next_steps' | 'gaps' | 'recommendations' | null = null;
  let buffer: string[] = [];
  
  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    
    // Detect section headers
    if (lowerLine.includes('next step') || lowerLine.includes('next steps')) {
      currentSection = 'next_steps';
      buffer = [];
      continue;
    }
    if (lowerLine.includes('gap') || lowerLine.includes('missing')) {
      currentSection = 'gaps';
      buffer = [];
      continue;
    }
    if (lowerLine.includes('recommendation') || lowerLine.includes('recommend')) {
      currentSection = 'recommendations';
      buffer = [];
      continue;
    }
    
    // Collect bullet points (lines starting with - or * or numbered)
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
    });
  }
  
  // Create proposals via kanban API
  let created = 0;
  for (const proposal of proposals) {
    try {
      const { exec } = await import('node:child_process');
      const execAsync = (await import('node:util')).promisify(exec);
      
      // Use curl to create proposal (simpler than importing full HTTP client)
      const curlCmd = `curl -s -X POST http://localhost:3080/api/kanban/proposals \
        -H "Content-Type: application/json" \
        -d '${JSON.stringify({
          type: 'create',
          payload: {
            title: proposal.title,
            description: proposal.description,
            priority: proposal.priority,
            column: 'backlog',
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
