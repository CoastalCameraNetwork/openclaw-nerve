/**
 * Orchestrator Sync Service
 * 
 * Syncs Gateway session state back to Kanban tasks.
 * When agent sessions complete, automatically move tasks to 'review'.
 */

import { getKanbanStore } from '../lib/kanban-store.js';
import { invokeGatewayTool } from '../lib/gateway-client.js';

/**
 * Parse gateway tool response
 */
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

/**
 * Sync Gateway sessions to Kanban tasks.
 * When sessions are done/error, move tasks to review.
 */
export async function syncSessionsToKanban(): Promise<{ synced: number; errors: number }> {
  try {
    // Get all Gateway sessions
    const sessionsResult = await invokeGatewayTool('subagents', {
      action: 'list',
      recentMinutes: 60,
    }, 10000);

    const parsed = parseGatewayResponse(sessionsResult);
    const sessions = ((parsed.active ?? []) as Array<Record<string, unknown>>)
      .concat((parsed.recent ?? []) as Array<Record<string, unknown>>);

    // Get all Kanban tasks
    const store = getKanbanStore();
    const taskResult = await store.listTasks({ limit: 200 });
    const allTasks = taskResult.items;
    
    let synced = 0;
    let errors = 0;

    // Find sessions that are done/error but tasks still in-progress
    for (const session of sessions) {
      const label = String(session.label ?? '');
      const sessionStatus = String(session.status ?? '');

      // Only process completed/failed sessions
      if (!['done', 'error', 'failed'].includes(sessionStatus)) {
        continue;
      }

      // Extract task ID from label (format: orch-{taskId}-{agentName})
      const match = label.match(/^orch-(.+?)-([^ -]+)$/);
      if (!match) {
        continue;
      }

      const taskId = match[1];
      
      // Find the Kanban task
      const task = allTasks.find((t: any) => t.id === taskId);
      if (!task) {
        continue;
      }

      // Skip if already in review/done
      if (['review', 'done', 'cancelled'].includes(task.status)) {
        continue;
      }

      // Update task to review
      try {
        await store.updateTask(taskId, task.version, {
          status: 'review',
        });
        synced++;
        console.log(`[orchestrator-sync] Task ${taskId} moved to review (session: ${label})`);
      } catch (err) {
        console.error(`[orchestrator-sync] Failed to update task ${taskId}:`, err);
        errors++;
      }
    }

    return { synced, errors };
  } catch (err) {
    console.error('[orchestrator-sync] Sync failed:', err);
    return { synced: 0, errors: 1 };
  }
}

/**
 * Start background sync loop.
 * Runs every 10 seconds to check for completed sessions.
 */
export function startSyncLoop(intervalMs = 10000): () => void {
  console.log('[orchestrator-sync] Starting sync loop (interval: %dms)', intervalMs);
  
  const timer = setInterval(async () => {
    const result = await syncSessionsToKanban();
    if (result.synced > 0 || result.errors > 0) {
      console.log('[orchestrator-sync] Sync complete: %d synced, %d errors', result.synced, result.errors);
    }
  }, intervalMs);

  // Return stop function
  return () => {
    clearInterval(timer);
    console.log('[orchestrator-sync] Sync loop stopped');
  };
}
