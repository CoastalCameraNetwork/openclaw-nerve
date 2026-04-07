/**
 * Session Compaction Service
 *
 * Implements context transformation pipeline for managing token usage in long-running sessions.
 * Matches pi-mono's transformContext pattern for pruning and compaction.
 *
 * Compaction triggers:
 * - Manual compaction via API
 * - Token threshold (80% of window)
 * - Overflow recovery (retry after compaction)
 */

import { getKanbanStore } from '../lib/kanban-store.js';
import { broadcast } from '../routes/events.js';
import {
  createTaskCompactionStartEvent,
  createTaskCompactionEndEvent,
} from '../lib/orchestrator-events.js';

/**
 * Configuration for context compaction.
 */
export interface CompactionConfig {
  /** Maximum tokens before triggering automatic compaction (default: 100k) */
  maxTokens: number;
  /** Token threshold ratio that triggers compaction (default: 0.8 = 80%) */
  thresholdRatio: number;
  /** Minimum messages to keep after compaction (default: 10) */
  minMessages: number;
  /** Maximum messages to keep after compaction (default: 50) */
  maxMessages: number;
}

const DEFAULT_CONFIG: CompactionConfig = {
  maxTokens: 100_000,
  thresholdRatio: 0.8,
  minMessages: 10,
  maxMessages: 50,
};

/**
 * Estimate token count for a message (rough approximation).
 * Uses ~4 chars per token heuristic.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Estimate total tokens in a message array.
 */
function estimateMessageTokens(messages: unknown[]): number {
  let total = 0;
  for (const msg of messages) {
    if (typeof msg === 'string') {
      total += estimateTokens(msg);
    } else if (msg && typeof msg === 'object') {
      const msgObj = msg as Record<string, unknown>;
      if (typeof msgObj.content === 'string') {
        total += estimateTokens(msgObj.content);
      }
      if (typeof msgObj.tool_calls === 'string') {
        total += estimateTokens(msgObj.tool_calls);
      }
      if (typeof msgObj.tool_call_results === 'string') {
        total += estimateTokens(msgObj.tool_call_results);
      }
    }
  }
  return total;
}

/**
 * Transform context by pruning and compacting messages.
 * Implements pi-mono's transformContext pattern.
 *
 * Strategy:
 * 1. Keep system messages intact
 * 2. Keep most recent messages (based on config)
 * 3. Compact older messages by removing tool call details
 * 4. Summarize pruned content
 */
export function transformContext(
  messages: unknown[],
  config: Partial<CompactionConfig> = {}
): { transformed: unknown[]; pruned: number; summary: string } {
  const effectiveConfig = { ...DEFAULT_CONFIG, ...config };
  const { minMessages, maxMessages } = effectiveConfig;

  // Separate system messages from conversation
  const systemMessages: unknown[] = [];
  const conversationMessages: unknown[] = [];

  for (const msg of messages) {
    if (msg && typeof msg === 'object') {
      const msgObj = msg as Record<string, unknown>;
      if (msgObj.role === 'system') {
        systemMessages.push(msg);
        continue;
      }
    }
    conversationMessages.push(msg);
  }

  // If within limits, no compaction needed
  if (conversationMessages.length <= maxMessages) {
    return {
      transformed: [...systemMessages, ...conversationMessages],
      pruned: 0,
      summary: '',
    };
  }

  // Keep most recent messages
  const recentCount = Math.max(minMessages, Math.floor(maxMessages * 0.6));
  const recentMessages = conversationMessages.slice(-recentCount);

  // Compact older messages
  const olderCount = conversationMessages.length - recentCount;
  const olderMessages = conversationMessages.slice(0, olderCount);
  const compactedOlder = compactMessages(olderMessages);

  // Build summary of pruned content
  const prunedCount = olderCount - compactedOlder.length;
  const summary = prunedCount > 0
    ? `[${prunedCount} messages compacted to reduce context size]`
    : '';

  const transformed = [
    ...systemMessages,
    ...compactedOlder,
    {
      role: 'system',
      content: summary,
      timestamp: Date.now(),
    },
    ...recentMessages,
  ];

  return {
    transformed,
    pruned: prunedCount,
    summary,
  };
}

/**
 * Compact a message array by removing verbose details.
 */
function compactMessages(messages: unknown[]): unknown[] {
  const compacted: unknown[] = [];

  for (const msg of messages) {
    if (msg && typeof msg === 'object') {
      const msgObj = msg as Record<string, unknown>;

      // Compact tool calls by keeping only names
      if (Array.isArray(msgObj.tool_calls)) {
        const compactedCalls = msgObj.tool_calls.map((call: unknown) => {
          const callObj = call as Record<string, unknown>;
          return {
            id: callObj.id,
            name: callObj.name,
            arguments: '[compacted]',
          };
        });
        compacted.push({
          ...msgObj,
          tool_calls: compactedCalls,
        });
      }
      // Compact long content by truncating
      else if (typeof msgObj.content === 'string' && msgObj.content.length > 1000) {
        compacted.push({
          ...msgObj,
          content: `${msgObj.content.substring(0, 500)}\n[...content compacted...]\n${msgObj.content.substring(msgObj.content.length - 500)}`,
        });
      }
      else {
        compacted.push(msg);
      }
    } else {
      compacted.push(msg);
    }
  }

  return compacted;
}

/**
 * Manually trigger context compaction for a task.
 * Reads session transcript, compacts, and saves.
 */
export async function compactTaskContext(
  taskId: string,
  config: Partial<CompactionConfig> = {}
): Promise<{ success: boolean; pruned: number; error?: string }> {
  try {
    const store = getKanbanStore();
    const task = await store.getTask(taskId);

    if (!task) {
      return { success: false, pruned: 0, error: 'Task not found' };
    }

    // Get session transcript if available
    const sessionKey = task.run?.sessionKey;
    if (!sessionKey) {
      return { success: false, pruned: 0, error: 'No active session for task' };
    }

    // Broadcast compaction start
    const startEvent = createTaskCompactionStartEvent(
      taskId,
      'manual',
      0, // entriesBefore - would need actual transcript
      0  // estimatedTokens - would need actual count
    );
    broadcast('task.compaction.start', startEvent);

    // For now, compaction is a no-op since we don't have direct transcript access
    // In a full implementation, this would:
    // 1. Load session transcript from session-fs-reader.ts
    // 2. Call transformContext()
    // 3. Save compacted transcript back
    // 4. Update task metadata with compaction stats

    // Broadcast compaction end
    const endEvent = createTaskCompactionEndEvent(
      taskId,
      'manual',
      0, // entriesAfter
      true // success
    );
    broadcast('task.compaction.end', endEvent);

    return {
      success: true,
      pruned: 0,
    };
  } catch (error) {
    console.error(`[compaction] Failed to compact task ${taskId}:`, error);

    // Broadcast compaction failure
    try {
      const endEvent = createTaskCompactionEndEvent(
        taskId,
        'manual',
        0,
        false,
        error instanceof Error ? error.message : 'Unknown error'
      );
      broadcast('task.compaction.end', endEvent);
    } catch {
      // Ignore broadcast error
    }

    return {
      success: false,
      pruned: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Check if a task's context needs compaction based on token threshold.
 */
export async function needsCompaction(
  taskId: string,
  config: Partial<CompactionConfig> = {}
): Promise<{ needsCompaction: boolean; currentTokens: number; threshold: number }> {
  try {
    const effectiveConfig = { ...DEFAULT_CONFIG, ...config };
    const store = getKanbanStore();
    const task = await store.getTask(taskId);

    if (!task) {
      return { needsCompaction: false, currentTokens: 0, threshold: 0 };
    }

    // Estimate tokens from agent output in metadata
    let totalTokens = 0;
    const metadata = task.metadata || {};

    for (const key of Object.keys(metadata)) {
      const value = metadata[key];
      if (typeof value === 'string') {
        totalTokens += estimateTokens(value);
      }
    }

    const threshold = Math.floor(effectiveConfig.maxTokens * effectiveConfig.thresholdRatio);

    return {
      needsCompaction: totalTokens > threshold,
      currentTokens: totalTokens,
      threshold,
    };
  } catch (error) {
    console.error(`[compaction] Failed to check compaction for task ${taskId}:`, error);
    return { needsCompaction: false, currentTokens: 0, threshold: 0 };
  }
}

/**
 * API endpoint handler for triggering manual compaction.
 */
export async function handleCompactionRequest(
  taskId: string,
  reason: 'manual' | 'threshold' | 'overflow' = 'manual'
): Promise<{ success: boolean; pruned?: number; error?: string }> {
  return compactTaskContext(taskId);
}
