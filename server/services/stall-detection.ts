/**
 * Stall Detection Service
 *
 * Detects tasks that have been running without activity for too long.
 * Used for auto-recovery and user notifications.
 */

import { getKanbanStore } from '../lib/kanban-store.js';
import { broadcast } from '../routes/events.js';

export const STALL_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
export const MAX_AUTO_RESUMES = 2;

export interface StalledTask {
  taskId: string;
  title: string;
  agent?: string;
  runningSince: number;
  lastActivity: number;
  stallDuration: number;
  sessionKey: string;
}

export interface StallCheckResult {
  stalledTasks: StalledTask[];
  checkedAt: string;
}

export async function checkForStalledTasks(): Promise<StallCheckResult> {
  const store = getKanbanStore();
  const now = Date.now();
  const stalledTasks: StalledTask[] = [];

  try {
    const allTasks = await store.listTasks({ limit: 1000 });

    for (const task of allTasks.items) {
      // Only check running tasks
      if (task.run?.status !== 'running') continue;

      const lastActivity = task.updatedAt || task.run.startedAt;
      const stallDuration = now - lastActivity;

      if (stallDuration > STALL_THRESHOLD_MS) {
        const metadata = (task.metadata as Record<string, unknown>) || {};
        const autoResumeCount = (metadata.stallResumes as number) || 0;

        stalledTasks.push({
          taskId: task.id,
          title: task.title,
          agent: task.assignee?.replace('agent:', '') || 'unknown',
          runningSince: task.run.startedAt,
          lastActivity,
          stallDuration,
          sessionKey: task.run.sessionKey,
        });

        // Auto-resume if under limit
        if (autoResumeCount < MAX_AUTO_RESUMES) {
          await attemptAutoResume(task.id, task.run.sessionKey, autoResumeCount);
        } else {
          // Flag for human intervention
          broadcast('task.stalled', {
            taskId: task.id,
            title: task.title,
            stallDuration,
            autoResumesExhausted: true,
          });
        }
      }
    }

    return {
      stalledTasks,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[stall-detection] Error checking for stalled tasks:', error);
    return { stalledTasks: [], checkedAt: new Date().toISOString() };
  }
}

async function attemptAutoResume(
  taskId: string,
  sessionKey: string,
  autoResumeCount: number
): Promise<void> {
  try {
    // Invoke gateway to resume stalled session
    const { invokeGatewayTool } = await import('../lib/gateway-client.js');

    await invokeGatewayTool('sessions_resume', {
      sessionKey,
      prompt: 'Continue from where you left off. If you encountered an error, explain it and propose next steps.',
    }, 30000);

    // Update metadata
    const store = getKanbanStore();
    const task = await store.getTask(taskId);
    if (task) {
      const metadata = {
        ...(task.metadata as Record<string, unknown> || {}),
        stallResumes: autoResumeCount + 1,
        lastStallResumeAt: Date.now(),
      };
      await store.updateTask(taskId, task.version, { metadata } as never, 'system' as never);
    }

    console.log(`[stall-detection] Auto-resumed task ${taskId} (attempt ${autoResumeCount + 1})`);
  } catch (error) {
    console.error(`[stall-detection] Failed to auto-resume task ${taskId}:`, error);
  }
}
