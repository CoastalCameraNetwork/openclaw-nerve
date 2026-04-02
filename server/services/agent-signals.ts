/**
 * Structured Agent Signals
 *
 * Parse JSON signals from agent output for:
 * - Status updates (phase tracking)
 * - Blocker detection (needs human input)
 * - Handoffs (sequential agent transitions)
 * - Quality gates (pass/fail with issues)
 * - Completion notifications
 */

export interface BaseSignal {
  signal: string;
  taskId?: string;
  timestamp?: number;
}

export interface StatusSignal extends BaseSignal {
  signal: 'status';
  phase: 'researching' | 'planning' | 'coding' | 'testing' | 'reviewing';
  detail: string;
}

export interface BlockerSignal extends BaseSignal {
  signal: 'blocker';
  reason: string;
  suggestion?: string;
  requiresHumanInput?: boolean;
}

export interface HandoffSignal extends BaseSignal {
  signal: 'handoff';
  nextAgent: string;
  summary: string;
  files?: string[];
  recommendations?: string[];
}

export interface QualityGateSignal extends BaseSignal {
  signal: 'quality-gate';
  passed: boolean;
  issues?: string[];
  criticalIssues?: string[];
}

export interface CompletionSignal extends BaseSignal {
  signal: 'complete';
  summary: string;
  filesChanged: string[];
}

export type AgentSignal =
  | StatusSignal
  | BlockerSignal
  | HandoffSignal
  | QualityGateSignal
  | CompletionSignal;

export const AgentSignalType = {
  STATUS: 'status',
  BLOCKER: 'blocker',
  HANDOFF: 'handoff',
  QUALITY_GATE: 'quality-gate',
  COMPLETE: 'complete',
} as const;

/**
 * Parse agent output for structured signals.
 * Looks for JSON objects with "signal" field.
 * Returns null if no valid signal found.
 */
export function parseAgentSignal(output: string): AgentSignal | null {
  try {
    // Try to find JSON object in output that contains "signal" field
    const jsonMatch = output.match(/\{[^}]*"signal"[^}]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.signal || typeof parsed.signal !== 'string') return null;

    // Validate required fields per signal type
    switch (parsed.signal) {
      case 'status':
        if (!parsed.phase) return null;
        return { ...parsed, type: 'status' } as StatusSignal;
      case 'blocker':
        if (!parsed.reason) return null;
        return { ...parsed, type: 'blocker' } as BlockerSignal;
      case 'handoff':
        if (!parsed.nextAgent) return null;
        return { ...parsed, type: 'handoff' } as HandoffSignal;
      case 'quality-gate':
        if (typeof parsed.passed !== 'boolean') return null;
        return { ...parsed, type: 'quality-gate' } as QualityGateSignal;
      case 'complete':
        if (!Array.isArray(parsed.filesChanged)) return null;
        return { ...parsed, type: 'complete' } as CompletionSignal;
      default:
        return null;
    }
  } catch {
    return null;
  }
}

/**
 * Check if output contains a signal of a specific type.
 */
export function hasSignalType(output: string, signalType: string): boolean {
  const signal = parseAgentSignal(output);
  return signal?.signal === signalType;
}

/**
 * Extract signal type from output.
 */
export function getSignalType(output: string): string | null {
  const signal = parseAgentSignal(output);
  return signal?.signal ?? null;
}
