/**
 * Dependency Service
 *
 * Handles task dependency validation and enforcement.
 * - Cycle detection using DFS
 * - Execution eligibility checks
 * - Dependency graph retrieval
 */

import { getKanbanStore } from '../lib/kanban-store.js';

/**
 * Check if adding a dependency would create a cycle.
 * Uses DFS to detect cycles in the dependency graph.
 */
export async function wouldCreateCycle(
  taskId: string,
  dependsOnId: string
): Promise<{ wouldCycle: boolean; cyclePath?: string[] }> {
  if (taskId === dependsOnId) {
    return { wouldCycle: true, cyclePath: [taskId] };
  }

  const store = getKanbanStore();
  const visited = new Set<string>();
  const path: string[] = [dependsOnId];

  async function dfs(currentId: string): Promise<boolean> {
    if (currentId === taskId) {
      return true;
    }

    if (visited.has(currentId)) {
      return false;
    }

    visited.add(currentId);
    const task = await store.getTask(currentId);

    if (!task?.dependencies) {
      return false;
    }

    for (const blockedBy of task.dependencies.blocked_by) {
      path.push(blockedBy);
      if (await dfs(blockedBy)) {
        return true;
      }
      path.pop();
    }

    return false;
  }

  const hasCycle = await dfs(dependsOnId);
  return { wouldCycle: hasCycle, cyclePath: hasCycle ? path : undefined };
}

/**
 * Check if a task can be executed (all dependencies are done).
 */
export async function canExecuteTask(taskId: string): Promise<{
  canExecute: boolean;
  blockedBy?: string[];
}> {
  const store = getKanbanStore();
  const task = await store.getTask(taskId);

  if (!task?.dependencies?.blocked_by || task.dependencies.blocked_by.length === 0) {
    return { canExecute: true };
  }

  const blockingTasks: string[] = [];

  for (const blockingTaskId of task.dependencies.blocked_by) {
    const blockingTask = await store.getTask(blockingTaskId);
    if (!blockingTask || blockingTask.status !== 'done') {
      blockingTasks.push(blockingTaskId);
    }
  }

  if (blockingTasks.length > 0) {
    return { canExecute: false, blockedBy: blockingTasks };
  }

  return { canExecute: true };
}

/**
 * Get full dependency graph for a task.
 */
export async function getDependencyGraph(taskId: string): Promise<{
  upstream: Array<{ id: string; title: string; status: string }>;
  downstream: Array<{ id: string; title: string; status: string }>;
}> {
  const store = getKanbanStore();
  const task = await store.getTask(taskId);

  if (!task?.dependencies) {
    return { upstream: [], downstream: [] };
  }

  const upstream: Array<{ id: string; title: string; status: string }> = [];
  const downstream: Array<{ id: string; title: string; status: string }> = [];

  // Get upstream (blocked_by)
  for (const upstreamId of task.dependencies.blocked_by) {
    const upstreamTask = await store.getTask(upstreamId);
    if (upstreamTask) {
      upstream.push({
        id: upstreamTask.id,
        title: upstreamTask.title,
        status: upstreamTask.status,
      });
    }
  }

  // Get downstream (blocks)
  for (const downstreamId of task.dependencies.blocks) {
    const downstreamTask = await store.getTask(downstreamId);
    if (downstreamTask) {
      downstream.push({
        id: downstreamTask.id,
        title: downstreamTask.title,
        status: downstreamTask.status,
      });
    }
  }

  return { upstream, downstream };
}
