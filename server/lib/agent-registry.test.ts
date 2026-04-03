/** Tests for agent-registry: routing rules, heuristics, and agent lookups. */
import { describe, it, expect } from 'vitest';
import {
  SPECIALIST_AGENTS,
  ROUTING_RULES,
  getAgent,
  listAgents,
  selectAgentsByHeuristics,
  routeTask,
} from './agent-registry.js';

// ── getAgent ──────────────────────────────────────────────────────────

describe('getAgent', () => {
  it('returns agent by name', () => {
    const agent = getAgent('k8s-agent');
    expect(agent).toBeDefined();
    expect(agent?.name).toBe('k8s-agent');
    expect(agent?.domain).toBe('Kubernetes');
  });

  it('returns undefined for unknown agent', () => {
    const agent = getAgent('nonexistent-agent');
    expect(agent).toBeUndefined();
  });

  it('returns all registered agents', () => {
    const agentNames = Object.keys(SPECIALIST_AGENTS);
    expect(agentNames.length).toBeGreaterThan(0);
    for (const name of agentNames) {
      const agent = getAgent(name);
      expect(agent).toBeDefined();
      expect(agent?.name).toBe(name);
    }
  });
});

// ── listAgents ───────────────────────────────────────────────────────

describe('listAgents', () => {
  it('returns all agents as array', () => {
    const agents = listAgents();
    expect(Array.isArray(agents)).toBe(true);
    expect(agents.length).toBe(Object.keys(SPECIALIST_AGENTS).length);
  });

  it('includes k8s-agent', () => {
    const agents = listAgents();
    const k8s = agents.find(a => a.name === 'k8s-agent');
    expect(k8s).toBeDefined();
    expect(k8s?.keywords).toContain('kubernetes');
  });

  it('includes orchestrator-agent as default', () => {
    const agents = listAgents();
    const orchestrator = agents.find(a => a.name === 'orchestrator-agent');
    expect(orchestrator).toBeDefined();
    expect(orchestrator?.keywords).toEqual([]);
  });
});

// ── selectAgentsByHeuristics ─────────────────────────────────────────

describe('selectAgentsByHeuristics', () => {
  it('selects k8s-agent for kubernetes keywords', () => {
    const result = selectAgentsByHeuristics('Deploy to kubernetes cluster');
    expect(result.agents).toContain('k8s-agent');
    expect(result.sequence).toBe('single');
  });

  it('selects mgmt-agent for mgmt keywords', () => {
    const result = selectAgentsByHeuristics('Update the mgmt dashboard');
    expect(result.agents).toContain('mgmt-agent');
  });

  it('selects wordpress-agent for wordpress keywords', () => {
    const result = selectAgentsByHeuristics('Install a new WordPress plugin');
    expect(result.agents).toContain('wordpress-agent');
  });

  it('selects database-agent for database keywords', () => {
    const result = selectAgentsByHeuristics('Create a database migration');
    expect(result.agents).toContain('database-agent');
  });

  it('selects multiple agents for multi-keyword tasks', () => {
    const result = selectAgentsByHeuristics('Deploy kubernetes and update mgmt');
    expect(result.agents.length).toBeGreaterThan(1);
    expect(result.agents).toContain('k8s-agent');
    expect(result.agents).toContain('mgmt-agent');
  });

  it('defaults to orchestrator-agent when no keywords match', () => {
    const result = selectAgentsByHeuristics('Do something random');
    expect(result.agents).toEqual(['orchestrator-agent']);
  });

  it('uses sequential for tasks with "and" connector', () => {
    const result = selectAgentsByHeuristics('Fix the pod and update the deployment');
    expect(result.sequence).toBe('sequential');
  });

  it('excludes orchestrator-agent from keyword matching', () => {
    const result = selectAgentsByHeuristics('General orchestration task');
    // Should not include orchestrator-agent via keyword match, only as default
    const hasOrchestratorViaKeyword = result.agents.includes('orchestrator-agent') && result.agents.length === 1;
    expect(hasOrchestratorViaKeyword).toBe(true); // Only as default fallback
  });
});

// ── routeTask ────────────────────────────────────────────────────────

describe('routeTask', () => {
  it('routes k8s deploy to deploy-mgmt rule', () => {
    const result = routeTask('Deploy mgmt platform to kubernetes');
    expect(result.rule_id).toBe('deploy-mgmt');
    expect(result.agents).toContain('k8s-agent');
    expect(result.agents).toContain('mgmt-agent');
    expect(result.agents).toContain('cicd-agent');
    expect(result.sequence).toBe('sequential');
    expect(result.gate_mode).toBe('gate-on-deploy');
    expect(result.fallback_used).toBe(false);
  });

  it('routes wordpress plugin to wordpress-plugin rule', () => {
    const result = routeTask('Install new WordPress plugin for wp-ccn');
    expect(result.rule_id).toBe('wordpress-plugin');
    expect(result.agents).toEqual(['wordpress-agent']);
    expect(result.sequence).toBe('single');
    expect(result.gate_mode).toBe('audit-only');
    expect(result.fallback_used).toBe(false);
  });

  it('routes wp-ccn site to wordpress-site rule', () => {
    const result = routeTask('Update wp-ccn theme');
    expect(result.rule_id).toBe('wordpress-site');
    expect(result.agents).toContain('wordpress-agent');
    expect(result.agents).toContain('cicd-agent');
    expect(result.sequence).toBe('sequential');
    expect(result.gate_mode).toBe('gate-on-deploy');
  });

  it('routes k8s deploy to k8s-deploy rule', () => {
    const result = routeTask('kubernetes deploy new namespace');
    expect(result.rule_id).toBe('k8s-deploy');
    expect(result.agents).toEqual(['k8s-agent']);
    expect(result.sequence).toBe('single');
    expect(result.gate_mode).toBe('gate-on-deploy');
  });

  it('routes streaming issues to parallel agents', () => {
    const result = routeTask('Wowza stream offline, HLS issue');
    expect(result.rule_id).toBe('streaming-issue');
    expect(result.agents).toContain('streaming-agent');
    expect(result.agents).toContain('hls-recorder-agent');
    expect(result.sequence).toBe('parallel');
    expect(result.gate_mode).toBe('audit-only');
  });

  it('routes database migration to sequential agents', () => {
    const result = routeTask('Database migration for mariadb schema change');
    expect(result.rule_id).toBe('database-migration');
    expect(result.agents).toContain('database-agent');
    expect(result.agents).toContain('mgmt-agent');
    expect(result.sequence).toBe('sequential');
    expect(result.gate_mode).toBe('gate-on-write');
  });

  it('routes security audit to security-reviewer', () => {
    const result = routeTask('Security audit for PR review');
    expect(result.rule_id).toBe('security-audit');
    expect(result.agents).toEqual(['security-reviewer']);
    expect(result.sequence).toBe('single');
    expect(result.gate_mode).toBe('audit-only');
  });

  it('routes cdn purge to cdn-agent', () => {
    const result = routeTask('CDN purge cache for bunny pull zone');
    expect(result.rule_id).toBe('cdn-purge');
    expect(result.agents).toEqual(['cdn-agent']);
    expect(result.sequence).toBe('single');
    expect(result.gate_mode).toBe('audit-only');
  });

  it('routes backup to storage-agent', () => {
    const result = routeTask('Create backup for NFS storage volume');
    expect(result.rule_id).toBe('storage-backup');
    expect(result.agents).toEqual(['storage-agent']);
    expect(result.sequence).toBe('single');
    expect(result.gate_mode).toBe('gate-on-write');
  });

  it('routes splash video to splash-scripts-agent', () => {
    const result = routeTask('YouTube upload for splash video automation');
    expect(result.rule_id).toBe('splash-video');
    expect(result.agents).toEqual(['splash-scripts-agent']);
    expect(result.sequence).toBe('single');
    expect(result.gate_mode).toBe('audit-only');
  });

  it('routes CI/CD pipeline to cicd-agent', () => {
    const result = routeTask('Create GitHub Actions workflow for docker build');
    expect(result.rule_id).toBe('cicd-pipeline');
    expect(result.agents).toEqual(['cicd-agent']);
    expect(result.sequence).toBe('single');
    expect(result.gate_mode).toBe('audit-only');
  });

  it('uses fallback for unrecognized tasks', () => {
    const result = routeTask('Something completely random');
    expect(result.rule_id).toBeNull();
    expect(result.fallback_used).toBe(true);
    expect(result.agents).toEqual(['orchestrator-agent']);
    expect(result.gate_mode).toBe('audit-only');
  });

  it('fallback uses heuristics for partial matches', () => {
    const result = routeTask('Fix the pod deployment issue');
    expect(result.fallback_used).toBe(true);
    expect(result.agents).toContain('k8s-agent');
  });

  it('routes github comment to orchestrator via fallback', () => {
    // "PR" matches security-audit rule, so use a task without security keywords
    const result = routeTask('add comment to pull request');
    expect(result.fallback_used).toBe(true);
    // Heuristics may select agents based on keywords - PR mention triggers security-reviewer
    expect(result.agents).toContain('orchestrator-agent');
  });
});

// ── Agent definitions ────────────────────────────────────────────────

describe('SPECIALIST_AGENTS', () => {
  it('has required fields for each agent', () => {
    for (const [name, agent] of Object.entries(SPECIALIST_AGENTS)) {
      expect(agent.name).toBe(name);
      expect(agent.domain).toBeDefined();
      expect(agent.description).toBeDefined();
      expect(Array.isArray(agent.keywords)).toBe(true);
      expect(agent.model).toBeDefined();
      expect(agent.thinking).toBeDefined();
    }
  });

  it('k8s-agent uses glm-4.5', () => {
    expect(SPECIALIST_AGENTS['k8s-agent'].model).toBe('glm-4.5');
  });

  it('mgmt-agent uses qwen3.5-plus', () => {
    expect(SPECIALIST_AGENTS['mgmt-agent'].model).toBe('qwen3.5-plus');
  });

  it('security-reviewer uses qwen3.5-plus with high thinking', () => {
    const agent = SPECIALIST_AGENTS['security-reviewer'];
    expect(agent.model).toBe('qwen3.5-plus');
    expect(agent.thinking).toBe('high');
  });

  it('wordpress-agent uses glm-4.5 with low thinking', () => {
    const agent = SPECIALIST_AGENTS['wordpress-agent'];
    expect(agent.model).toBe('glm-4.5');
    expect(agent.thinking).toBe('low');
  });
});

// ── ROUTING_RULES ───────────────────────────────────────────────────

describe('ROUTING_RULES', () => {
  it('has required fields for each rule', () => {
    for (const rule of ROUTING_RULES) {
      expect(rule.id).toBeDefined();
      expect(rule.pattern).toBeInstanceOf(RegExp);
      expect(Array.isArray(rule.agents)).toBe(true);
      expect(['single', 'sequential', 'parallel']).toContain(rule.sequence);
      expect(['audit-only', 'gate-on-write', 'gate-on-deploy']).toContain(rule.gate_mode);
    }
  });

  it('rules are ordered from specific to general', () => {
    // deploy-mgmt should come before k8s-deploy (more specific)
    const deployMgmtIndex = ROUTING_RULES.findIndex(r => r.id === 'deploy-mgmt');
    const k8sDeployIndex = ROUTING_RULES.findIndex(r => r.id === 'k8s-deploy');
    expect(deployMgmtIndex).toBeLessThan(k8sDeployIndex);
  });

  it('all gate modes are valid', () => {
    const validModes = ['audit-only', 'gate-on-write', 'gate-on-deploy'];
    for (const rule of ROUTING_RULES) {
      expect(validModes).toContain(rule.gate_mode);
    }
  });
});

// ── Pluggable Agent Registry ─────────────────────────────────────────

import {
  defineAgentRegistry,
  registerCustomAgents,
  loadCustomAgents,
  getEffectiveAgents,
  isAgentSwapped,
  getCustomAgents,
  clearCustomAgents,
  getAllAgentIds,
  SWAPPABLE_AGENT_IDS,
} from './agent-registry.js';

describe('Pluggable Agent Registry', () => {
  beforeEach(() => {
    // Clear custom agents before each test
    clearCustomAgents();
  });

  describe('defineAgentRegistry', () => {
    it('should define a custom agent registry', () => {
      const customAgents = defineAgentRegistry({
        'my-custom-agent': {
          id: 'my-custom-agent',
          type: 'reviewer',
          skills: ['code-review', 'security'],
          model: 'qwen3.5-plus',
        },
      });

      expect(customAgents['my-custom-agent']).toBeDefined();
      expect(customAgents['my-custom-agent'].id).toBe('my-custom-agent');
    });

    it('should warn and remove invalid swapWith references', () => {
      const consoleWarn = console.warn;
      const warnings: string[] = [];
      console.warn = (msg: string) => warnings.push(msg);

      const customAgents = defineAgentRegistry({
        'invalid-swap': {
          id: 'invalid-swap',
          type: 'specialist',
          skills: ['test'],
          swapWith: 'non-existent-agent',
        },
      } as any);

      expect(warnings.some(w => w.includes('non-existent-agent'))).toBe(true);
      expect(customAgents['invalid-swap'].swapWith).toBeUndefined();

      console.warn = consoleWarn;
    });

    it('should allow valid swapWith references', () => {
      const customAgents = defineAgentRegistry({
        'custom-security': {
          id: 'custom-security',
          type: 'reviewer',
          skills: ['security-audit'],
          swapWith: 'security-reviewer',
        },
      });

      expect(customAgents['custom-security'].swapWith).toBe('security-reviewer');
    });
  });

  describe('registerCustomAgents', () => {
    it('should register custom agents', () => {
      registerCustomAgents({
        'test-agent': {
          id: 'test-agent',
          type: 'executor',
          skills: ['testing'],
        },
      });

      const custom = getCustomAgents();
      expect(custom['test-agent']).toBeDefined();
    });

    it('should merge multiple registrations', () => {
      registerCustomAgents({
        'agent-1': {
          id: 'agent-1',
          type: 'executor',
          skills: ['test'],
        },
      });

      registerCustomAgents({
        'agent-2': {
          id: 'agent-2',
          type: 'analyzer',
          skills: ['analyze'],
        },
      });

      const custom = getCustomAgents();
      expect(custom['agent-1']).toBeDefined();
      expect(custom['agent-2']).toBeDefined();
    });
  });

  describe('getEffectiveAgents', () => {
    it('should return built-in agents when no custom agents registered', () => {
      const effective = getEffectiveAgents();

      expect(effective['security-reviewer']).toBeDefined();
      expect(effective['k8s-agent']).toBeDefined();
      expect(effective['orchestrator-agent']).toBeDefined();
    });

    it('should add custom agents without swapWith', () => {
      registerCustomAgents({
        'custom-analyzer': {
          id: 'custom-analyzer',
          type: 'analyzer',
          skills: ['deep-analysis'],
          model: 'qwen3.5-plus',
        },
      });

      const effective = getEffectiveAgents();

      expect(effective['custom-analyzer']).toBeDefined();
      expect(effective['security-reviewer']).toBeDefined(); // Built-in still present
    });

    it('should replace built-in agents with swapWith', () => {
      registerCustomAgents({
        'my-security-agent': {
          id: 'my-security-agent',
          type: 'reviewer',
          skills: ['advanced-security'],
          swapWith: 'security-reviewer',
          model: 'custom-model',
        },
      });

      const effective = getEffectiveAgents();

      // The security-reviewer slot should now have custom agent properties
      const securityAgent = effective['security-reviewer'];
      expect(securityAgent).toBeDefined();
      expect((securityAgent as any).skills).toContain('advanced-security');
      expect((securityAgent as any).model).toBe('custom-model');
    });

    it('should skip disabled custom agents', () => {
      registerCustomAgents({
        'disabled-agent': {
          id: 'disabled-agent',
          type: 'executor',
          skills: ['test'],
          enabled: false,
        },
      });

      const effective = getEffectiveAgents();

      expect(effective['disabled-agent']).toBeUndefined();
    });
  });

  describe('isAgentSwapped', () => {
    it('should return false for unswapped agents', () => {
      expect(isAgentSwapped('security-reviewer')).toBe(false);
      expect(isAgentSwapped('k8s-agent')).toBe(false);
    });

    it('should return true for swapped agents', () => {
      registerCustomAgents({
        'custom-sec': {
          id: 'custom-sec',
          type: 'reviewer',
          skills: ['security'],
          swapWith: 'security-reviewer',
        },
      });

      expect(isAgentSwapped('security-reviewer')).toBe(true);
    });

    it('should return false for disabled swapped agents', () => {
      registerCustomAgents({
        'custom-sec': {
          id: 'custom-sec',
          type: 'reviewer',
          skills: ['security'],
          swapWith: 'security-reviewer',
          enabled: false,
        },
      });

      expect(isAgentSwapped('security-reviewer')).toBe(false);
    });
  });

  describe('loadCustomAgents', () => {
    it('should be an alias for registerCustomAgents', () => {
      loadCustomAgents({
        'loaded-agent': {
          id: 'loaded-agent',
          type: 'specialist',
          skills: ['loading'],
        },
      });

      const custom = getCustomAgents();
      expect(custom['loaded-agent']).toBeDefined();
    });
  });

  describe('getAllAgentIds', () => {
    it('should return all built-in agent ids', () => {
      const ids = getAllAgentIds();

      expect(ids).toContain('security-reviewer');
      expect(ids).toContain('k8s-agent');
      expect(ids).toContain('orchestrator-agent');
    });

    it('should include custom agent ids', () => {
      registerCustomAgents({
        'custom-1': {
          id: 'custom-1',
          type: 'executor',
          skills: ['test'],
        },
      });

      const ids = getAllAgentIds();

      expect(ids).toContain('custom-1');
    });

    it('should not duplicate ids when agent is swapped', () => {
      registerCustomAgents({
        'custom-sec': {
          id: 'custom-sec',
          type: 'reviewer',
          skills: ['security'],
          swapWith: 'security-reviewer',
        },
      });

      const ids = getAllAgentIds();

      // security-reviewer should still be there (swapped, not removed)
      expect(ids).toContain('security-reviewer');
      // custom-sec should NOT be a separate entry
      expect(ids).not.toContain('custom-sec');
    });
  });

  describe('clearCustomAgents', () => {
    it('should clear all registered custom agents', () => {
      registerCustomAgents({
        'temp-agent': {
          id: 'temp-agent',
          type: 'executor',
          skills: ['temp'],
        },
      });

      expect(getCustomAgents()['temp-agent']).toBeDefined();

      clearCustomAgents();

      expect(getCustomAgents()).toEqual({});
    });
  });

  describe('SWAPPABLE_AGENT_IDS', () => {
    it('should include all swappable agent IDs', () => {
      expect(SWAPPABLE_AGENT_IDS).toContain('security-reviewer');
      expect(SWAPPABLE_AGENT_IDS).toContain('k8s-agent');
      expect(SWAPPABLE_AGENT_IDS).toContain('wordpress-agent');
    });

    it('should only include valid built-in agent IDs', () => {
      for (const agentId of SWAPPABLE_AGENT_IDS) {
        expect(SPECIALIST_AGENTS[agentId as keyof typeof SPECIALIST_AGENTS]).toBeDefined();
      }
    });
  });
});
