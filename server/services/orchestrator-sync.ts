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
 * Also handles orphaned tasks (sessions gone but tasks still in-progress).
 */
export async function syncSessionsToKanban(): Promise<{ synced: number; errors: number; orphaned: number }> {
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
    let orphaned = 0;

    // Track which tasks have active sessions
    const tasksWithSessions = new Set<string>();

    // Process completed/failed sessions
    for (const session of sessions) {
      const label = String(session.label ?? '');
      const sessionStatus = String(session.status ?? '');
      const output = String(session.output ?? '');
      const error = String(session.error ?? '');

      // Extract task ID from label (format: orch-{taskId}-{agentName})
      const match = label.match(/^orch-(.+?)-([^ -]+)$/);
      if (!match) {
        continue;
      }

      const taskId = match[1];
      const agentName = match[2];
      tasksWithSessions.add(taskId);

      // Only process completed/failed sessions
      if (!['done', 'error', 'failed'].includes(sessionStatus)) {
        continue;
      }
      
      // Find the Kanban task
      const task = allTasks.find((t: any) => t.id === taskId);
      if (!task) {
        continue;
      }

      // Skip if already in review/done
      if (['review', 'done', 'cancelled'].includes(task.status)) {
        continue;
      }

      // Update task to review AND save agent output
      try {
        const updates: any = { status: 'review' };
        
        // Save agent output to task metadata before session expires
        if (output || error) {
          const existingMeta = (task as any).metadata || {};
          const agentOutput = existingMeta.agentOutput || {};
          agentOutput[agentName] = {
            output: output || null,
            error: error || null,
            capturedAt: Date.now(),
            sessionStatus: sessionStatus,
          };
          updates.metadata = { ...existingMeta, agentOutput };
        }
        
        await store.updateTask(taskId, task.version, updates);
        synced++;
        console.log(`[orchestrator-sync] Task ${taskId} moved to review (session: ${label}, output captured)`);
      } catch (err) {
        console.error(`[orchestrator-sync] Failed to update task ${taskId}:`, err);
        errors++;
      }
    }

    // Find orphaned tasks: in-progress but no active session
    for (const task of allTasks) {
      if (task.status === 'in-progress' && !tasksWithSessions.has(task.id)) {
        // Task is in-progress but no session exists - agents finished or failed
        try {
          await store.updateTask(task.id, task.version, {
            status: 'review',
          });
          orphaned++;
          console.log(`[orchestrator-sync] Orphaned task ${task.id} moved to review (no session found)`);
        } catch (err) {
          console.error(`[orchestrator-sync] Failed to update orphaned task ${task.id}:`, err);
          errors++;
        }
      }
    }

    return { synced, errors, orphaned };
  } catch (err) {
    console.error('[orchestrator-sync] Sync failed:', err);
    return { synced: 0, errors: 1, orphaned: 0 };
  }
}

/**
 * Start background sync loop.
 * Runs immediately on startup, then every interval to check for completed sessions.
 */
export function startSyncLoop(intervalMs = 10000): () => void {
  console.log('[orchestrator-sync] Starting sync loop (interval: %dms)', intervalMs);
  
  // Run immediately on startup
  syncSessionsToKanban().then(result => {
    if (result.synced > 0 || result.errors > 0 || result.orphaned > 0) {
      console.log('[orchestrator-sync] Initial sync complete: %d synced, %d orphaned, %d errors', 
        result.synced, result.orphaned, result.errors);
    } else {
      console.log('[orchestrator-sync] Initial sync complete (no changes needed)');
    }
  });
  
  // Then run periodically
  const timer = setInterval(async () => {
    const result = await syncSessionsToKanban();
    if (result.synced > 0 || result.errors > 0 || result.orphaned > 0) {
      console.log('[orchestrator-sync] Periodic sync: %d synced, %d orphaned, %d errors', 
        result.synced, result.orphaned, result.errors);
    }
  }, intervalMs);

  // Return stop function
  return () => {
    clearInterval(timer);
    console.log('[orchestrator-sync] Sync loop stopped');
  };
}
