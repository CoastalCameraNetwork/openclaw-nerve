/**
 * Multi-Agent Chains
 *
 * Define sequential agent handoffs for complex tasks.
 * Each chain specifies agents in order with handoff context.
 */

import { SPECIALIST_AGENTS } from '../lib/agent-registry.js';

export interface ChainStep {
  agent: string;
  prompt?: string;
  model?: string;
  thinking?: 'off' | 'low' | 'medium' | 'high';
  timeoutMs?: number;
}

export interface AgentChain {
  id: string;
  name: string;
  description: string;
  steps: ChainStep[];
  gate_mode: 'audit-only' | 'gate-on-write' | 'gate-on-deploy';
}

/**
 * Predefined agent chains for common workflows.
 */
export const PREDEFINED_CHAINS: Record<string, AgentChain> = {
  'full-build': {
    id: 'full-build',
    name: 'Full Build',
    description: 'Plan → Review → Code → Test workflow',
    steps: [
      {
        agent: 'orchestrator-agent',
        prompt: 'Create a complete implementation plan for this task.',
        thinking: 'high',
        timeoutMs: 600000,
      },
      {
        agent: 'security-reviewer',
        prompt: 'Review the implementation plan for security issues and gaps.',
        thinking: 'high',
        timeoutMs: 300000,
      },
      {
        agent: 'orchestrator-agent',
        prompt: 'Implement the approved plan exactly as specified.',
        thinking: 'medium',
        timeoutMs: 600000,
      },
      {
        agent: 'security-reviewer',
        prompt: 'Test the implementation and verify all requirements are met.',
        thinking: 'medium',
        timeoutMs: 300000,
      },
    ],
    gate_mode: 'gate-on-write',
  },
  'quick-fix': {
    id: 'quick-fix',
    name: 'Quick Fix',
    description: 'Code → Review workflow for simple changes',
    steps: [
      {
        agent: 'orchestrator-agent',
        prompt: 'Implement this fix quickly and efficiently.',
        thinking: 'low',
        timeoutMs: 300000,
      },
      {
        agent: 'security-reviewer',
        prompt: 'Review the changes for correctness and safety.',
        thinking: 'medium',
        timeoutMs: 180000,
      },
    ],
    gate_mode: 'audit-only',
  },
  'security-audit': {
    id: 'security-audit',
    name: 'Security Audit',
    description: 'Review → Fix workflow for security issues',
    steps: [
      {
        agent: 'security-reviewer',
        prompt: 'Audit this code for security vulnerabilities. List all issues found.',
        thinking: 'high',
        timeoutMs: 300000,
      },
      {
        agent: 'orchestrator-agent',
        prompt: 'Fix all identified security vulnerabilities.',
        thinking: 'high',
        timeoutMs: 600000,
      },
    ],
    gate_mode: 'gate-on-deploy',
  },
};

/**
 * Get a chain by ID.
 */
export function getChain(chainId: string): AgentChain | null {
  return PREDEFINED_CHAINS[chainId] || null;
}

/**
 * List all available chains.
 */
export function listChains(): AgentChain[] {
  return Object.values(PREDEFINED_CHAINS);
}

/**
 * Get the next agent in a chain based on current step.
 */
export function getNextStep(chain: AgentChain, currentAgent?: string): ChainStep | null {
  if (!currentAgent) {
    return chain.steps[0] || null;
  }

  const currentIndex = chain.steps.findIndex(step => step.agent === currentAgent);
  if (currentIndex === -1 || currentIndex >= chain.steps.length - 1) {
    return null; // Chain complete or unknown agent
  }

  return chain.steps[currentIndex + 1];
}

/**
 * Check if an agent is part of a chain.
 */
export function isAgentInChain(chain: AgentChain, agent: string): boolean {
  return chain.steps.some(step => step.agent === agent);
}
