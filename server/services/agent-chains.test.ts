import { describe, it, expect } from 'vitest';
import { getChain, listChains, getNextStep, isAgentInChain, PREDEFINED_CHAINS } from './agent-chains.js';

describe('agent-chains', () => {
  describe('getChain', () => {
    it('returns full-build chain', () => {
      const chain = getChain('full-build');
      expect(chain).toBeTruthy();
      expect(chain?.name).toBe('Full Build');
      expect(chain?.steps.length).toBeGreaterThan(0);
    });

    it('returns quick-fix chain', () => {
      const chain = getChain('quick-fix');
      expect(chain).toBeTruthy();
      expect(chain?.name).toBe('Quick Fix');
      expect(chain?.steps.length).toBe(2);
    });

    it('returns security-audit chain', () => {
      const chain = getChain('security-audit');
      expect(chain).toBeTruthy();
      expect(chain?.name).toBe('Security Audit');
    });

    it('returns null for unknown chain', () => {
      const chain = getChain('unknown-chain');
      expect(chain).toBeNull();
    });
  });

  describe('listChains', () => {
    it('returns all predefined chains', () => {
      const chains = listChains();
      expect(chains.length).toBe(Object.keys(PREDEFINED_CHAINS).length);
      expect(chains.map(c => c.id)).toEqual(expect.arrayContaining([
        'full-build',
        'quick-fix',
        'security-audit',
      ]));
    });
  });

  describe('getNextStep', () => {
    it('returns first step when no current agent', () => {
      const chain = getChain('quick-fix');
      const step = getNextStep(chain!);
      expect(step).toBeTruthy();
      expect(step?.agent).toBe('orchestrator-agent');
    });

    it('returns next step in chain', () => {
      const chain = getChain('quick-fix');
      const step = getNextStep(chain!, 'orchestrator-agent');
      expect(step).toBeTruthy();
      expect(step?.agent).toBe('security-reviewer');
    });

    it('returns null at end of chain', () => {
      const chain = getChain('quick-fix');
      const step = getNextStep(chain!, 'security-reviewer');
      expect(step).toBeNull();
    });

    it('returns null for unknown agent', () => {
      const chain = getChain('quick-fix');
      const step = getNextStep(chain!, 'unknown-agent');
      expect(step).toBeNull();
    });
  });

  describe('isAgentInChain', () => {
    it('returns true for agent in chain', () => {
      const chain = getChain('quick-fix');
      expect(isAgentInChain(chain!, 'orchestrator-agent')).toBe(true);
    });

    it('returns false for agent not in chain', () => {
      const chain = getChain('quick-fix');
      expect(isAgentInChain(chain!, 'planner')).toBe(false);
    });
  });
});
