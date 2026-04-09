/**
 * Gateway Session Poller
 *
 * Polls OpenClaw Gateway for completed session output and persists it to task metadata.
 * This is an alternative to webhook-based capture when gateway cannot be modified.
 *
 * Usage:
 * 1. After task execution, call pollAndPersistSessionOutput(taskId)
 * 2. Service finds gateway sessions matching task's run sessionKey
 * 3. Fetches session history and extracts assistant output
 * 4. Persists output to task.metadata.agentOutput
 */

import { getKanbanStore } from '../lib/kanban-store.js';
import { invokeGatewayTool } from '../lib/gateway-client.js';

interface GatewaySession {
  key: string;
  label?: string;
  status: string;
  startedAt: number;
  endedAt?: number;
  sessionId: string;
  model?: string;
  totalTokens?: number;
  estimatedCostUsd?: number;
}

interface GatewaySessionHistory {
  sessionKey: string;
  messages: Array<{
    role: string;
    content: Array<{ type: string; text: string }> | string;
    timestamp: number;
  }>;
  truncated: boolean;
}

/**
 * Extract text content from a message's content array
 */
function extractMessageContent(content: Array<{ type: string; text: string }> | string): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('\n');
  }
  return '';
}

/**
 * List all sessions from the gateway
 */
async function listGatewaySessions(): Promise<GatewaySession[]> {
  try {
    const result = await invokeGatewayTool('sessions_list', {}, 10000);
    console.log('[session-poller] sessions_list raw result type:', typeof result);

    // Gateway returns: { content: [{ type: 'text', text: '{"count": 8, "sessions": [...]}' }] }
    const resultObj = result as { content?: Array<{ type: string; text: string }> };
    if (!resultObj.content || !Array.isArray(resultObj.content) || resultObj.content.length === 0) {
      console.log('[session-poller] No content in gateway response');
      return [];
    }

    const textContent = resultObj.content[0]?.text;
    if (!textContent) {
      console.log('[session-poller] No text in content[0]');
      return [];
    }

    // Parse the JSON string inside the text field
    const parsed = JSON.parse(textContent) as { sessions?: GatewaySession[] };
    console.log('[session-poller] Parsed sessions count:', parsed.sessions?.length || 0);
    return parsed.sessions || [];
  } catch (error) {
    console.error('[session-poller] Failed to list gateway sessions:', error);
    return [];
  }
}

/**
 * Get session history from the gateway
 */
async function getSessionHistory(sessionKey: string): Promise<GatewaySessionHistory | null> {
  try {
    const result = await invokeGatewayTool(
      'sessions_history',
      { sessionKey },
      15000
    );

    // Gateway returns: { content: [{ type: 'text', text: '{"sessionKey": "...", "messages": [...]}' }] }
    const resultObj = result as { content?: Array<{ type: string; text: string }> };
    if (!resultObj.content || !Array.isArray(resultObj.content) || resultObj.content.length === 0) {
      console.log(`[session-poller] No content in history response for ${sessionKey}`);
      return null;
    }

    const textContent = resultObj.content[0]?.text;
    if (!textContent) {
      console.log(`[session-poller] No text in history content[0] for ${sessionKey}`);
      return null;
    }

    // Parse the JSON string
    const parsed = JSON.parse(textContent) as GatewaySessionHistory;
    return parsed || null;
  } catch (error) {
    console.error(`[session-poller] Failed to get history for ${sessionKey}:`, error);
    return null;
  }
}

/**
 * Extract agent output from session history
 * Returns the last assistant message content
 */
function extractAgentOutput(history: GatewaySessionHistory | null): string {
  if (!history) return '';

  // Find the last assistant message
  const messages = history.messages || [];
  const assistantMessages = messages.filter((msg) => msg.role === 'assistant');
  if (assistantMessages.length === 0) return '';

  const lastMessage = assistantMessages[assistantMessages.length - 1];
  return extractMessageContent(lastMessage.content);
}

/**
 * Find gateway sessions that match a task's run session key
 */
function findMatchingSessions(
  sessions: GatewaySession[],
  taskRunSessionKey: string
): GatewaySession[] {
  return sessions.filter((session) => {
    // Match by label (which contains the kanban session key)
    if (session.label === taskRunSessionKey) return true;

    // Match by child session (for subagents)
    if (session.key.includes(taskRunSessionKey)) return true;

    return false;
  });
}

/**
 * Poll gateway for session output and persist to task metadata
 * Uses retry logic to wait for agents to complete (up to 5 minutes)
 *
 * @param taskId - The kanban task ID
 * @param agentName - Optional agent name filter (e.g., 'coding-agent')
 * @returns Object with success status and captured output info
 */
export async function pollAndPersistSessionOutput(
  taskId: string,
  agentName?: string
): Promise<{
  success: boolean;
  capturedCount: number;
  error?: string;
  agents?: Array<{ name: string; outputLength: number; status: string }>;
}> {
  const MAX_RETRIES = 30; // 30 retries * 10 seconds = 5 minutes max wait
  const RETRY_DELAY_MS = 10000; // 10 seconds between retries

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const store = getKanbanStore();
      const task = await store.getTask(taskId);

      if (!task) {
        return { success: false, capturedCount: 0, error: 'Task not found' };
      }

      // Get all gateway sessions
      const allSessions = await listGatewaySessions();

      // DEBUG: Log session info (only on first and last attempt to reduce noise)
      if (attempt === 1 || attempt === MAX_RETRIES) {
        console.log(`[session-poller] Attempt ${attempt}/${MAX_RETRIES} for task ${taskId}`);
        console.log('[session-poller] Gateway sessions count:', allSessions.length);
        console.log('[session-poller] Gateway sessions labels:', allSessions.map(s => s.label).filter(Boolean));
      }

      // Find sessions matching this task by label pattern
      // Orchestrator spawns agents with labels like: orch-{taskId}-{agentName}
      // Example: orch-create-tasks-for-implementatio-streaming-agent
      const matchingSessions = allSessions.filter((session) => {
        if (!session.label) return false;

        // Match orchestrator pattern: orch-{taskId}-*
        if (session.label.startsWith(`orch-${taskId}-`)) return true;

        // Match kanban pattern: kb-{taskId}-*
        if (session.label.startsWith(`kb-${taskId}-`)) return true;

        // Match by session key contains task ID
        if (session.key.includes(taskId)) return true;

        return false;
      });

      console.log('[session-poller] Matching sessions:', matchingSessions.length);

      if (matchingSessions.length === 0) {
        // No sessions yet - wait and retry
        if (attempt < MAX_RETRIES) {
          console.log(`[session-poller] No sessions found, waiting ${RETRY_DELAY_MS}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
          continue;
        }
        return {
          success: false,
          capturedCount: 0,
          error: 'No matching gateway sessions found after max retries',
        };
      }

      // Check if any matching sessions are completed
      const completedSessions = matchingSessions.filter(s => s.status === 'done');
      console.log('[session-poller] Completed sessions:', completedSessions.length);

      if (completedSessions.length === 0) {
        // Sessions exist but none completed yet - wait and retry
        if (attempt < MAX_RETRIES) {
          const pendingStatuses = matchingSessions.map(s => `${s.label}:${s.status}`).join(', ');
          console.log(`[session-poller] Sessions still running (${pendingStatuses}), waiting ${RETRY_DELAY_MS}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
          continue;
        }
        return {
          success: false,
          capturedCount: 0,
          error: 'Sessions found but none completed after max retries',
        };
      }

      // Capture output from completed sessions
      const agentOutput: Record<
        string,
        {
          status: 'completed' | 'failed' | 'running';
          output: string;
          sessionKey: string;
          completedAt: number;
          tokens?: { total?: number; cost?: number };
        }
      > = {};

      const capturedAgents: Array<{ name: string; outputLength: number; status: string }> = [];

      for (const session of completedSessions) {
        // Get session history
        const history = await getSessionHistory(session.key);
        if (!history) continue;

        // Extract agent output
        const output = extractAgentOutput(history);
        if (!output) continue;

        // Extract agent name from session key or label
        let agentNameFromKey = session.key.split(':')[1] || 'unknown-agent';
        // Try to get agent name from label if it follows orch-{taskId}-{agentName} pattern
        if (session.label && session.label.startsWith(`orch-${taskId}-`)) {
          agentNameFromKey = session.label.replace(`orch-${taskId}-`, '');
        }

        agentOutput[agentNameFromKey] = {
          status: 'completed',
          output,
          sessionKey: session.key,
          completedAt: session.endedAt || Date.now(),
          tokens: {
            total: session.totalTokens,
            cost: session.estimatedCostUsd,
          },
        };

        capturedAgents.push({
          name: agentNameFromKey,
          outputLength: output.length,
          status: session.status,
        });
      }

      if (Object.keys(agentOutput).length === 0) {
        // Sessions completed but no output extracted - might need more time or different parsing
        if (attempt < MAX_RETRIES) {
          console.log(`[session-poller] No output extracted yet, waiting ${RETRY_DELAY_MS}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
          continue;
        }
        return {
          success: false,
          capturedCount: 0,
          error: 'Sessions completed but no output could be extracted',
        };
      }

      // Persist to task metadata with retry on version conflict
      let persisted = false;
      let retryCount = 0;
      const MAX_PERSIST_RETRIES = 5;

      while (!persisted && retryCount < MAX_PERSIST_RETRIES) {
        try {
          const existingAgentOutput = (task.metadata?.agentOutput || {}) as Record<string, unknown>;
          const updatedAgentOutput = {
            ...existingAgentOutput,
            ...agentOutput,
          };

          await store.updateTask(taskId, task.version, {
            metadata: {
              ...task.metadata,
              agentOutput: updatedAgentOutput,
            },
          });
          persisted = true;
        } catch (updateError: any) {
          if (updateError.message?.includes('version_conflict') && retryCount < MAX_PERSIST_RETRIES - 1) {
            retryCount++;
            console.log(`[session-poller] Version conflict, refetching task (retry ${retryCount}/${MAX_PERSIST_RETRIES})...`);
            // Refetch task with new version
            const freshTask = await store.getTask(taskId);
            if (freshTask) {
              task.version = freshTask.version;
              task.metadata = freshTask.metadata;
              await new Promise(resolve => setTimeout(resolve, 500)); // Brief delay before retry
            } else {
              throw new Error('Task not found on retry');
            }
          } else {
            throw updateError;
          }
        }
      }

      if (!persisted) {
        return {
          success: false,
          capturedCount: Object.keys(agentOutput).length,
          error: 'Failed to persist output after multiple version conflict retries',
        };
      }

      console.log(
        `[session-poller] Captured output for ${capturedAgents.length} agents on task ${taskId}`
      );

      // For gate-on-write mode, trigger git workflow after capturing output
      const gateMode = (task.metadata as any)?.gate_mode;
      if (gateMode === 'gate-on-write' || gateMode === 'gate-on-deploy') {
        console.log(`[session-poller] Gate mode is ${gateMode}, running git workflow...`);
        const worktreePath = (task.metadata as any)?.worktreePath;
        if (worktreePath) {
          try {
            const { completeGitWorkflow } = await import('./github-pr.js');
            const prInfo = await completeGitWorkflow(taskId, task.title, task.description || '', worktreePath);
            console.log(`[session-poller] Created PR #${prInfo.number} for task ${taskId}`);

            // Update task with PR info
            const freshTask = await store.getTask(taskId);
            if (freshTask) {
              await store.updateTask(taskId, freshTask.version, {
                pr: {
                  number: prInfo.number,
                  url: prInfo.url,
                  branch: prInfo.branch,
                  status: prInfo.status,
                },
                status: 'review',
              });
            }

            // Cleanup worktree
            const { cleanupWorktree } = await import('./github-pr.js');
            await cleanupWorktree(worktreePath);
            console.log(`[session-poller] Cleaned up worktree for task ${taskId}`);
          } catch (gitError) {
            console.error(`[session-poller] Git workflow failed for ${taskId}:`, gitError);
            // Don't fail the poll - agent output was captured successfully
          }
        } else {
          console.log(`[session-poller] No worktree path found for task ${taskId}`);
        }
      }

      return {
        success: true,
        capturedCount: Object.keys(agentOutput).length,
        agents: capturedAgents,
      };
    } catch (error) {
      console.error(`[session-poller] Attempt ${attempt} failed:`, error);
      if (attempt >= MAX_RETRIES) {
        return {
          success: false,
          capturedCount: 0,
          error: error instanceof Error ? error.message : String(error),
        };
      }
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }

  // Should not reach here, but just in case
  return {
    success: false,
    capturedCount: 0,
    error: 'Max retries exceeded',
  };
}

/**
 * Poll all in-progress or review tasks for session output
 * Called periodically or after task execution
 */
export async function pollAllActiveTasks(): Promise<{
  totalPolled: number;
  captured: number;
  errors: number;
}> {
  try {
    const store = getKanbanStore();

    // Get all tasks (limited to recent ones)
    const tasksResponse = await fetch('http://localhost:3080/api/kanban/tasks?limit=100', {
      credentials: 'include',
    });

    if (!tasksResponse.ok) {
      throw new Error('Failed to fetch tasks');
    }

    const tasksData = await tasksResponse.json() as { items?: unknown[]; tasks?: unknown[] };
    const tasks = (tasksData.items || tasksData.tasks || []) as Array<{
      id: string;
      status: string;
      run?: { sessionKey: string };
      metadata?: { agentOutput?: Record<string, unknown> };
    }>;

    let totalPolled = 0;
    let captured = 0;
    let errors = 0;

    for (const task of tasks) {
      // Only poll tasks that have runs but might be missing output
      if (task.run?.sessionKey && (!task.metadata?.agentOutput || Object.keys(task.metadata.agentOutput).length === 0)) {
        if (['in-progress', 'review'].includes(task.status)) {
          totalPolled++;
          const result = await pollAndPersistSessionOutput(task.id);
          if (result.success) {
            captured++;
          } else {
            errors++;
          }
        }
      }
    }

    return { totalPolled, captured, errors };
  } catch (error) {
    console.error('[session-poller] Failed to poll all tasks:', error);
    return { totalPolled: 0, captured: 0, errors: 1 };
  }
}
// trigger reload Wed Apr  8 11:15:55 AM PDT 2026

