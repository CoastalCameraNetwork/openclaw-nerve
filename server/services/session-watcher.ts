/**
 * Session Watcher Service
 *
 * Polls OpenClaw Gateway for completed agent sessions and broadcasts
 * orchestrator.task_complete SSE events as a fallback mechanism when
 * webhooks are not available.
 *
 * This provides redundancy for the webhook-based completion notification.
 */

import { invokeGatewayTool } from '../lib/gateway-client.js';
import { broadcast } from '../routes/events.js';

interface SessionInfo {
  sessionKey: string;
  label: string;
  status: string;
  output?: string;
  error?: string;
}

interface WatcherState {
  intervalMs: number;
  timer: ReturnType<typeof setTimeout> | null;
  running: boolean;
  knownSessions: Set<string>;
}

const state: WatcherState = {
  intervalMs: 5000, // Poll every 5 seconds
  timer: null,
  running: false,
  knownSessions: new Set<string>(),
};

/**
 * Parse gateway response to extract session list.
 */
function parseSessions(result: unknown): SessionInfo[] {
  if (!result || typeof result !== 'object') return [];

  const r = result as Record<string, unknown>;
  const content = r.content as Array<Record<string, unknown>> | undefined;

  let sessions: Array<Record<string, unknown>> = [];

  // Try to parse JSON from content
  if (content?.[0]?.text && typeof content[0].text === 'string') {
    try {
      const parsed = JSON.parse(content[0].text);
      sessions = [
        ...((parsed.active ?? []) as Array<Record<string, unknown>>),
        ...((parsed.recent ?? []) as Array<Record<string, unknown>>),
      ];
    } catch {
      // Fall through to direct access
    }
  }

  // Direct access
  if (sessions.length === 0) {
    sessions = [
      ...((r.active ?? []) as Array<Record<string, unknown>>),
      ...((r.recent ?? []) as Array<Record<string, unknown>>),
    ];
  }

  return sessions
    .filter((s) => {
      const label = String(s.label ?? '');
      return label.startsWith('orch-'); // Only orchestrator sessions
    })
    .map((s) => ({
      sessionKey: String(s.sessionKey ?? ''),
      label: String(s.label ?? ''),
      status: String(s.status ?? 'unknown'),
      output: s.output as string | undefined,
      error: s.error as string | undefined,
    }));
}

/**
 * Poll gateway for session status and detect completions.
 */
async function pollSessions(): Promise<void> {
  try {
    const result = await invokeGatewayTool('subagents', {
      action: 'list',
      recentMinutes: 30,
    }, 10000);

    const sessions = parseSessions(result);

    for (const session of sessions) {
      // Skip if already known (we only care about new completions)
      if (state.knownSessions.has(session.sessionKey)) {
        continue;
      }

      // Only broadcast if session is complete (done/error/failed)
      if (['done', 'error', 'failed'].includes(session.status)) {
        // Extract task ID from label
        const taskId = session.label.startsWith('orch-')
          ? session.label.split('-')[1]
          : null;

        if (taskId) {
          console.log(`[session-watcher] Session completed: ${session.label} (status: ${session.status})`);

          broadcast('orchestrator.task_complete', {
            task_id: taskId,
            session_key: session.sessionKey,
            label: session.label,
            status: session.status,
            output: session.output,
            error: session.error,
            completed_at: Date.now(),
            source: 'watcher', // Indicate this came from polling vs webhook
          });
        }

        // Mark as known to avoid duplicate broadcasts
        state.knownSessions.add(session.sessionKey);

        // Cleanup old sessions from the set (keep last 100)
        if (state.knownSessions.size > 100) {
          const toRemove = Array.from(state.knownSessions).slice(0, state.knownSessions.size - 100);
          toRemove.forEach((k) => state.knownSessions.delete(k));
        }
      }
    }
  } catch (error) {
    console.error('[session-watcher] Poll failed:', error);
  }
}

/**
 * Start the session watcher polling loop.
 */
export function startSessionWatcher(intervalMs?: number): void {
  if (state.running) {
    console.log('[session-watcher] Already running');
    return;
  }

  if (intervalMs) {
    state.intervalMs = intervalMs;
  }

  state.running = true;
  console.log(`[session-watcher] Starting polling every ${state.intervalMs}ms`);

  // Initial poll
  pollSessions();

  // Set up recurring poll
  state.timer = setTimeout(async function pollLoop() {
    if (!state.running) return;

    await pollSessions();
    state.timer = setTimeout(pollLoop, state.intervalMs);
  }, state.intervalMs);
}

/**
 * Stop the session watcher.
 */
export function stopSessionWatcher(): void {
  state.running = false;
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
  state.knownSessions.clear();
  console.log('[session-watcher] Stopped');
}

/**
 * Get watcher status (for debugging).
 */
export function getWatcherStatus(): { running: boolean; knownSessions: number } {
  return {
    running: state.running,
    knownSessions: state.knownSessions.size,
  };
}
