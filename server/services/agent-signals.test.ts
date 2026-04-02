import { describe, it, expect } from 'vitest';
import { parseAgentSignal, AgentSignalType } from './agent-signals.js';

describe('parseAgentSignal', () => {
  it('extracts status signal from agent output', () => {
    const output = '{"signal":"status","phase":"researching","detail":"Searching documentation"}';
    const result = parseAgentSignal(output);
    expect(result).toEqual({
      signal: 'status',
      type: 'status',
      phase: 'researching',
      detail: 'Searching documentation',
    });
  });

  it('returns null for non-signal output', () => {
    const output = 'I am writing the implementation now';
    const result = parseAgentSignal(output);
    expect(result).toBeNull();
  });

  it('extracts blocker signal', () => {
    const output = '{"signal":"blocker","reason":"Need API key","suggestion":"Add to .env"}';
    const result = parseAgentSignal(output);
    expect(result?.signal).toBe('blocker');
    expect(result?.reason).toBe('Need API key');
  });

  it('extracts handoff signal', () => {
    const output = '{"signal":"handoff","nextAgent":"tester","summary":"Code complete","files":["src/index.ts"]}';
    const result = parseAgentSignal(output);
    expect(result?.signal).toBe('handoff');
    expect(result?.nextAgent).toBe('tester');
  });

  it('extracts quality-gate signal', () => {
    const output = '{"signal":"quality-gate","passed":false,"issues":["Missing validation"]}';
    const result = parseAgentSignal(output);
    expect(result?.signal).toBe('quality-gate');
    expect(result?.passed).toBe(false);
  });

  it('extracts complete signal', () => {
    const output = '{"signal":"complete","summary":"Task done","filesChanged":["src/a.ts","src/b.ts"]}';
    const result = parseAgentSignal(output);
    expect(result?.signal).toBe('complete');
    expect(result?.filesChanged).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('handles output with surrounding text', () => {
    const output = 'Okay, let me analyze this. {"signal":"status","phase":"planning","detail":"Reviewing requirements"} I will start now.';
    const result = parseAgentSignal(output);
    expect(result?.signal).toBe('status');
    expect(result?.phase).toBe('planning');
  });

  it('returns null for invalid JSON', () => {
    const output = '{"signal":"status", invalid json}';
    const result = parseAgentSignal(output);
    expect(result).toBeNull();
  });

  it('returns null for JSON without signal field', () => {
    const output = '{"type":"message","content":"hello"}';
    const result = parseAgentSignal(output);
    expect(result).toBeNull();
  });
});

describe('AgentSignalType', () => {
  it('has correct signal type constants', () => {
    expect(AgentSignalType.STATUS).toBe('status');
    expect(AgentSignalType.BLOCKER).toBe('blocker');
    expect(AgentSignalType.HANDOFF).toBe('handoff');
    expect(AgentSignalType.QUALITY_GATE).toBe('quality-gate');
    expect(AgentSignalType.COMPLETE).toBe('complete');
  });
});
