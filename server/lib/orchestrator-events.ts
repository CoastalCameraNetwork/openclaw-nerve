/**
 * Orchestrator Event Schema
 *
 * Standardized event types for task lifecycle tracking, matching pi-mono agent-loop patterns.
 * All events flow through the SSE broadcaster in server/routes/events.ts
 */

// ============================================================================
// Event Types
// ============================================================================

/** Base interface for all orchestrator events */
export interface BaseOrchestratorEvent {
  type: string;
  timestamp: number;
}

/** Task lifecycle events */
export interface TaskStartEvent extends BaseOrchestratorEvent {
  type: 'task.start';
  taskId: string;
  title: string;
  description?: string;
  agents: string[];
  gateMode: 'audit-only' | 'gate-on-write' | 'gate-on-deploy';
}

export interface TaskEndEvent extends BaseOrchestratorEvent {
  type: 'task.end';
  taskId: string;
  status: 'completed' | 'failed' | 'cancelled';
  error?: string;
  duration: number;
}

/** Agent lifecycle events */
export interface AgentStartEvent extends BaseOrchestratorEvent {
  type: 'agent.start';
  taskId: string;
  agentName: string;
  sessionKey: string;
  model?: string;
  thinking?: 'off' | 'low' | 'medium' | 'high';
}

export interface AgentEndEvent extends BaseOrchestratorEvent {
  type: 'agent.end';
  taskId: string;
  agentName: string;
  success: boolean;
  output?: string;
  error?: string;
  duration: number;
}

/** Turn-based execution events (one LLM call + tool executions = one turn) */
export interface AgentTurnStartEvent extends BaseOrchestratorEvent {
  type: 'agent.turn.start';
  taskId: string;
  agentName: string;
  turnNumber: number;
}

export interface AgentTurnEndEvent extends BaseOrchestratorEvent {
  type: 'agent.turn.end';
  taskId: string;
  agentName: string;
  turnNumber: number;
  toolCalls: number;
  hasMoreTurns: boolean;
}

/** Tool execution events */
export interface ToolExecutionStartEvent extends BaseOrchestratorEvent {
  type: 'tool.execution.start';
  taskId: string;
  agentName: string;
  toolName: string;
  toolCallId: string;
  args: unknown;
}

export interface ToolExecutionEndEvent extends BaseOrchestratorEvent {
  type: 'tool.execution.end';
  taskId: string;
  agentName: string;
  toolName: string;
  toolCallId: string;
  result: unknown;
  isError: boolean;
  duration: number;
}

/** Steering and follow-up queue events */
export interface TaskSteeringEvent extends BaseOrchestratorEvent {
  type: 'task.steering';
  taskId: string;
  message: string;
  source: 'user' | 'system' | 'extension';
}

export interface TaskFollowUpEvent extends BaseOrchestratorEvent {
  type: 'task.followup';
  taskId: string;
  message: string;
  source: 'user' | 'system' | 'extension';
}

/** Compaction events */
export interface TaskCompactionStartEvent extends BaseOrchestratorEvent {
  type: 'task.compaction.start';
  taskId: string;
  reason: 'manual' | 'threshold' | 'overflow';
  entriesBefore: number;
  estimatedTokens: number;
}

export interface TaskCompactionEndEvent extends BaseOrchestratorEvent {
  type: 'task.compaction.end';
  taskId: string;
  reason: 'manual' | 'threshold' | 'overflow';
  entriesAfter: number;
  success: boolean;
  error?: string;
}

// ============================================================================
// Union Type
// ============================================================================

export type OrchestratorEvent =
  | TaskStartEvent
  | TaskEndEvent
  | AgentStartEvent
  | AgentEndEvent
  | AgentTurnStartEvent
  | AgentTurnEndEvent
  | ToolExecutionStartEvent
  | ToolExecutionEndEvent
  | TaskSteeringEvent
  | TaskFollowUpEvent
  | TaskCompactionStartEvent
  | TaskCompactionEndEvent;

// ============================================================================
// Event Type Constants (for runtime checking)
// ============================================================================

export const OrchestratorEventType = {
  TASK_START: 'task.start',
  TASK_END: 'task.end',
  AGENT_START: 'agent.start',
  AGENT_END: 'agent.end',
  AGENT_TURN_START: 'agent.turn.start',
  AGENT_TURN_END: 'agent.turn.end',
  TOOL_EXECUTION_START: 'tool.execution.start',
  TOOL_EXECUTION_END: 'tool.execution.end',
  TASK_STEERING: 'task.steering',
  TASK_FOLLOWUP: 'task.followup',
  TASK_COMPACTION_START: 'task.compaction.start',
  TASK_COMPACTION_END: 'task.compaction.end',
} as const;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a task start event
 */
export function createTaskStartEvent(
  taskId: string,
  title: string,
  agents: string[],
  gateMode: 'audit-only' | 'gate-on-write' | 'gate-on-deploy',
  description?: string
): TaskStartEvent {
  return {
    type: 'task.start',
    timestamp: Date.now(),
    taskId,
    title,
    description,
    agents,
    gateMode,
  };
}

/**
 * Create a task end event
 */
export function createTaskEndEvent(
  taskId: string,
  status: 'completed' | 'failed' | 'cancelled',
  duration: number,
  error?: string
): TaskEndEvent {
  return {
    type: 'task.end',
    timestamp: Date.now(),
    taskId,
    status,
    error,
    duration,
  };
}

/**
 * Create an agent start event
 */
export function createAgentStartEvent(
  taskId: string,
  agentName: string,
  sessionKey: string,
  model?: string,
  thinking?: 'off' | 'low' | 'medium' | 'high'
): AgentStartEvent {
  return {
    type: 'agent.start',
    timestamp: Date.now(),
    taskId,
    agentName,
    sessionKey,
    model,
    thinking,
  };
}

/**
 * Create an agent end event
 */
export function createAgentEndEvent(
  taskId: string,
  agentName: string,
  success: boolean,
  duration: number,
  output?: string,
  error?: string
): AgentEndEvent {
  return {
    type: 'agent.end',
    timestamp: Date.now(),
    taskId,
    agentName,
    success,
    output,
    error,
    duration,
  };
}

/**
 * Create a tool execution start event
 */
export function createToolExecutionStartEvent(
  taskId: string,
  agentName: string,
  toolName: string,
  toolCallId: string,
  args: unknown
): ToolExecutionStartEvent {
  return {
    type: 'tool.execution.start',
    timestamp: Date.now(),
    taskId,
    agentName,
    toolName,
    toolCallId,
    args,
  };
}

/**
 * Create a tool execution end event
 */
export function createToolExecutionEndEvent(
  taskId: string,
  agentName: string,
  toolName: string,
  toolCallId: string,
  result: unknown,
  isError: boolean,
  duration: number
): ToolExecutionEndEvent {
  return {
    type: 'tool.execution.end',
    timestamp: Date.now(),
    taskId,
    agentName,
    toolName,
    toolCallId,
    result,
    isError,
    duration,
  };
}

/**
 * Create a steering event
 */
export function createSteeringEvent(
  taskId: string,
  message: string,
  source: 'user' | 'system' | 'extension' = 'user'
): TaskSteeringEvent {
  return {
    type: 'task.steering',
    timestamp: Date.now(),
    taskId,
    message,
    source,
  };
}

/**
 * Create a follow-up event
 */
export function createFollowUpEvent(
  taskId: string,
  message: string,
  source: 'user' | 'system' | 'extension' = 'user'
): TaskFollowUpEvent {
  return {
    type: 'task.followup',
    timestamp: Date.now(),
    taskId,
    message,
    source,
  };
}

/**
 * Create a compaction start event
 */
export function createTaskCompactionStartEvent(
  taskId: string,
  reason: 'manual' | 'threshold' | 'overflow',
  entriesBefore: number,
  estimatedTokens: number
): TaskCompactionStartEvent {
  return {
    type: 'task.compaction.start',
    timestamp: Date.now(),
    taskId,
    reason,
    entriesBefore,
    estimatedTokens,
  };
}

/**
 * Create a compaction end event
 */
export function createTaskCompactionEndEvent(
  taskId: string,
  reason: 'manual' | 'threshold' | 'overflow',
  entriesAfter: number,
  success: boolean,
  error?: string
): TaskCompactionEndEvent {
  return {
    type: 'task.compaction.end',
    timestamp: Date.now(),
    taskId,
    reason,
    entriesAfter,
    success,
    error,
  };
}
