/**
 * Agent Status Service
 *
 * Tracks real-time agent availability and activity.
 */

import { invokeGatewayTool } from '../lib/gateway-client.js';

export interface AgentStatus {
  name: string;
  displayName: string;
  status: 'available' | 'busy' | 'unavailable';
  activeTasks: number;
  currentTaskIds: string[];
  queueDepth: number;
  completedToday: number;
  avgCompletionTimeMs: number;
  lastSeenAt: number;
  error?: string;
}

const SPECIALIST_AGENTS = [
  { name: 'mgmt-agent', displayName: 'Management Agent' },
  { name: 'k8s-agent', displayName: 'Kubernetes Agent' },
  { name: 'frontend-agent', displayName: 'Frontend Agent' },
  { name: 'backend-agent', displayName: 'Backend Agent' },
  { name: 'test-agent', displayName: 'Testing Agent' },
  { name: 'security-agent', displayName: 'Security Agent' },
  { name: 'devops-agent', displayName: 'DevOps Agent' },
  { name: 'docs-agent', displayName: 'Documentation Agent' },
  { name: 'refactor-agent', displayName: 'Refactoring Agent' },
  { name: 'review-agent', displayName: 'Code Review Agent' },
  { name: 'fix-agent', displayName: 'Bug Fix Agent' },
  { name: 'deploy-agent', displayName: 'Deployment Agent' },
];

const agentStatusCache = new Map<string, AgentStatus>();
let lastFetchTime = 0;
const CACHE_TTL_MS = 10000; // 10 seconds

/**
 * Parse gateway response to extract agent sessions.
 */
function parseAgentSessions(result: unknown): Record<string, string[]> {
  if (!result || typeof result !== 'object') return {};

  const r = result as Record<string, unknown>;
  const content = r.content as Array<Record<string, unknown>> | undefined;

  let sessions: Array<Record<string, unknown>> = [];

  if (content?.[0]?.text && typeof content[0].text === 'string') {
    try {
      const parsed = JSON.parse(content[0].text);
      sessions = [
        ...((parsed.active ?? []) as Array<Record<string, unknown>>),
        ...((parsed.recent ?? []) as Array<Record<string, unknown>>),
      ];
    } catch {
      // Fall through
    }
  }

  if (sessions.length === 0) {
    sessions = [
      ...((r.active ?? []) as Array<Record<string, unknown>>),
      ...((r.recent ?? []) as Array<Record<string, unknown>>),
    ];
  }

  // Group by agent label
  const agentTasks = new Map<string, string[]>();
  for (const session of sessions) {
    const label = String(session.label ?? '');
    const sessionKey = String(session.sessionKey ?? '');
    const status = String(session.status ?? 'unknown');

    // Extract agent name from label (e.g., "orch-mgmt-agent-..." -> "mgmt-agent")
    const match = label.match(/orch-([a-z]+-agent)-/);
    if (match) {
      const agentName = match[1];
      const tasks = agentTasks.get(agentName) ?? [];
      if (status === 'running') {
        tasks.push(sessionKey);
      }
      agentTasks.set(agentName, tasks);
    }
  }

  return Object.fromEntries(agentTasks);
}

/**
 * Get status for all agents.
 */
export async function getAllAgentStatuses(): Promise<AgentStatus[]> {
  const now = Date.now();

  // Return cached if still valid
  if (now - lastFetchTime < CACHE_TTL_MS && agentStatusCache.size > 0) {
    return Array.from(agentStatusCache.values());
  }

  try {
    const result = await invokeGatewayTool('subagents', {
      action: 'list',
      recentMinutes: 60,
    }, 10000);

    const activeTasks = parseAgentSessions(result);

    // Update status for all known agents
    for (const agent of SPECIALIST_AGENTS) {
      const tasks = activeTasks[agent.name] ?? [];
      const status: AgentStatus = {
        name: agent.name,
        displayName: agent.displayName,
        status: tasks.length > 0 ? 'busy' : 'available',
        activeTasks: tasks.length,
        currentTaskIds: tasks,
        queueDepth: 0,
        completedToday: 0,
        avgCompletionTimeMs: 0,
        lastSeenAt: now,
      };
      agentStatusCache.set(agent.name, status);
    }

    lastFetchTime = now;
  } catch (err) {
    console.error('[agent-status] Failed to fetch agent status:', err);
    // Return cached status with unavailable flag
    for (const agent of SPECIALIST_AGENTS) {
      const cached = agentStatusCache.get(agent.name);
      if (cached) {
        agentStatusCache.set(agent.name, {
          ...cached,
          status: 'unavailable',
          error: err instanceof Error ? err.message : 'Gateway unavailable',
        });
      }
    }
  }

  return Array.from(agentStatusCache.values());
}

/**
 * Get status for a single agent.
 */
export async function getAgentStatus(agentName: string): Promise<AgentStatus | undefined> {
  const statuses = await getAllAgentStatuses();
  return statuses.find((s) => s.name === agentName);
}

/**
 * Clear the agent status cache.
 */
export function clearAgentStatusCache(): void {
  agentStatusCache.clear();
  lastFetchTime = 0;
}
