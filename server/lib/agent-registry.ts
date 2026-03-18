/**
 * Agent Registry - Specialist agent definitions for CCN orchestrator
 *
 * Defines available specialist agents, their domains, and routing keywords.
 */

export interface SpecialistAgent {
  name: string;
  domain: string;
  description: string;
  keywords: string[];
  model?: string; // Optional model override (bailian/qwen3.5-plus, glm-4.5, etc.)
  thinking?: 'off' | 'low' | 'medium' | 'high';
}

export interface RoutingRule {
  id: string;
  pattern: RegExp;
  agents: string[];
  sequence: 'single' | 'sequential' | 'parallel';
  gate_mode: 'audit-only' | 'gate-on-write' | 'gate-on-deploy';
  description?: string;
  model_override?: string; // Optional model for all agents in this rule (e.g., 'qwen3.5-plus' for complex tasks)
}

/**
 * Registry of all specialist agents available in the CCN ecosystem.
 * 
 * Model assignments based on https://www.clarifai.com/blog/kimi-k2-vs-qwen-3-vs-glm-4.5
 * - GLM 4.5: Best for tool integration (90.6% success), debugging, efficiency ($0.11/$0.28)
 * - Qwen 3 Coder: Best for large codebases (256K-1M context), polyglot ($0.35-0.60/$1.50)
 * - Kimi K2: Best for agentic multi-step tasks, transparency (130K-256K context, $0.15/$2.50)
 */
export const SPECIALIST_AGENTS: Record<string, SpecialistAgent> = {
  'k8s-agent': {
    name: 'k8s-agent',
    domain: 'Kubernetes',
    description: 'Kubernetes deployments, LKE, PVCs, namespaces, CronJobs',
    keywords: ['k8s', 'kubernetes', 'pod', 'deployment', 'namespace', 'pvc', 'cronjob', 'lke', 'helm'],
    model: 'glm-4.5', // Tool-heavy (kubectl, helm, k8s API), efficiency focused
    thinking: 'medium',
  },
  'mgmt-agent': {
    name: 'mgmt-agent',
    domain: 'MGMT Platform',
    description: 'MGMT management platform (Fastify, React, Drizzle ORM)',
    keywords: ['mgmt', 'management', 'console', 'dashboard', 'admin', 'fastify', 'drizzle'],
    model: 'qwen3.5-plus', // Full-stack codebase work, moderate context needed
    thinking: 'medium',
  },
  'wordpress-agent': {
    name: 'wordpress-agent',
    domain: 'WordPress',
    description: 'WordPress sites (wp-ccn, wp-hdbc, wp-njbc, wp-nybc, wp-tsv), plugins, themes',
    keywords: ['wordpress', 'wp-', 'plugin', 'theme', 'php', 'gutenberg', 'shortcode'],
    model: 'glm-4.5', // Plugin/theme work is tool-heavy, cost-sensitive
    thinking: 'low',
  },
  'streaming-agent': {
    name: 'streaming-agent',
    domain: 'Streaming',
    description: 'Wowza Streaming Engine, RTMP/HLS, nginx-rtmp, broadcast',
    keywords: ['stream', 'wowza', 'hls', 'rtmp', 'broadcast', 'obs', 'nginx-rtmp'],
    model: 'glm-4.5', // Debugging + tool integration (Wowza API, ffmpeg)
    thinking: 'medium',
  },
  'hls-recorder-agent': {
    name: 'hls-recorder-agent',
    domain: 'HLS Recording',
    description: 'HLS/DVR recording, FFmpeg, archives',
    keywords: ['record', 'recording', 'dvr', 'archive', 'ffmpeg', 'hls-record'],
    model: 'glm-4.5', // FFmpeg is tool-heavy, GLM excels at tool calls
    thinking: 'medium',
  },
  'splash-scripts-agent': {
    name: 'splash-scripts-agent',
    domain: 'Video Automation',
    description: 'YouTube automation, social media, splash videos, cron jobs',
    keywords: ['splash', 'video', 'youtube', 'social', 'facebook', 'instagram', 'cron'],
    model: 'glm-4.5', // API integrations, cron jobs, cost-sensitive
    thinking: 'low',
  },
  'database-agent': {
    name: 'database-agent',
    domain: 'Database',
    description: 'MariaDB, MySQL, Drizzle migrations, schemas, queries',
    keywords: ['database', 'db', 'mariadb', 'mysql', 'migration', 'schema', 'query', 'drizzle'],
    model: 'qwen3.5-plus', // Complex schema reasoning, migration planning
    thinking: 'high',
  },
  'storage-agent': {
    name: 'storage-agent',
    domain: 'Storage',
    description: 'NFS, backups, PVCs, S3, volume management',
    keywords: ['storage', 'nfs', 'backup', 'restore', 'volume', 's3', 'pvc', 'upload'],
    model: 'glm-4.5', // Tool integration (rsync, s3cmd, nfs), efficiency
    thinking: 'medium',
  },
  'cdn-agent': {
    name: 'cdn-agent',
    domain: 'CDN',
    description: 'Bunny CDN, Cloudflare, cache purging, DNS',
    keywords: ['cdn', 'bunny', 'cloudflare', 'cache', 'purge', 'dns', 'pull-zone'],
    model: 'glm-4.5', // API calls for cache purge, DNS changes
    thinking: 'low',
  },
  'cicd-agent': {
    name: 'cicd-agent',
    domain: 'CI/CD',
    description: 'GitHub Actions, Docker builds, pipelines, deployments',
    keywords: ['ci/cd', 'github actions', 'workflow', 'docker', 'build', 'pipeline', 'deploy', 'action'],
    model: 'qwen3.5-plus', // Complex pipeline logic, multi-file workflows
    thinking: 'medium',
  },
  'security-reviewer': {
    name: 'security-reviewer',
    domain: 'Security',
    description: 'Security audits, vulnerability scans, PR reviews',
    keywords: ['security', 'audit', 'vulnerability', 'review', 'pr', 'scan', 'cve'],
    model: 'qwen3.5-plus', // Deep reasoning for security analysis, large context for code review
    thinking: 'high',
  },
  'orchestrator-agent': {
    name: 'orchestrator-agent',
    domain: 'General',
    description: 'Default orchestrator for unrecognized tasks',
    keywords: [],
    model: 'glm-4.5', // Cost-effective for general tasks, good tool integration
    thinking: 'medium',
  },
};

/**
 * Routing rules - pattern-based agent selection.
 * Rules are evaluated in order; first match wins.
 *
 * model_override: Force a specific model for this rule type (bypasses complexity analysis)
 */
export const ROUTING_RULES: RoutingRule[] = [
  {
    id: 'deploy-mgmt',
    pattern: /deploy.*mgmt|mgmt.*deploy|build.*mgmt|mgmt.*build/i,
    agents: ['k8s-agent', 'mgmt-agent', 'cicd-agent'],
    sequence: 'sequential',
    gate_mode: 'gate-on-deploy',
    description: 'MGMT platform deployment',
    // Multi-agent sequential deployment is complex
    model_override: 'qwen3.5-plus',
  },
  {
    id: 'wordpress-plugin',
    pattern: /wordpress.*plugin|wp-.*plugin|plugin.*wordpress|update.*plugin/i,
    agents: ['wordpress-agent'],
    sequence: 'single',
    gate_mode: 'audit-only',
    description: 'WordPress plugin operations',
    // Simple plugin updates are routine
    model_override: 'glm-4.5',
  },
  {
    id: 'wordpress-site',
    pattern: /wp-(ccn|hdbc|njbc|nybc|tsv|nysea)/i,
    agents: ['wordpress-agent', 'cicd-agent'],
    sequence: 'sequential',
    gate_mode: 'gate-on-deploy',
    description: 'WordPress site operations',
    // Multi-agent site work with deployment
    model_override: 'qwen3.5-plus',
  },
  {
    id: 'k8s-deploy',
    pattern: /k8s|kubernetes.*deploy|namespace|pvc.*create|cronjob/i,
    agents: ['k8s-agent'],
    sequence: 'single',
    gate_mode: 'gate-on-deploy',
    description: 'Kubernetes operations',
    // K8s ops are tool-heavy, glm-4.5 excels here
    model_override: 'glm-4.5',
  },
  {
    id: 'streaming-issue',
    pattern: /wowza|stream.*offline|hls.*issue|rtmp/i,
    agents: ['streaming-agent', 'hls-recorder-agent'],
    sequence: 'parallel',
    gate_mode: 'audit-only',
    description: 'Streaming infrastructure issues',
    // Debugging streaming issues benefits from deeper reasoning
    model_override: 'qwen3.5-plus',
  },
  {
    id: 'database-migration',
    pattern: /database.*migration|mariadb.*migration|schema.*change|drizzle.*migrate/i,
    agents: ['database-agent', 'mgmt-agent'],
    sequence: 'sequential',
    gate_mode: 'gate-on-write',
    description: 'Database migrations',
    // Migrations are high-risk, need careful reasoning
    model_override: 'qwen3.5-plus',
  },
  {
    id: 'security-audit',
    pattern: /security.*audit|pr.*review|vulnerability.*scan|security.*review/i,
    agents: ['security-reviewer'],
    sequence: 'single',
    gate_mode: 'audit-only',
    description: 'Security audits and PR reviews',
    // Security analysis requires deep reasoning
    model_override: 'qwen3.5-plus',
  },
  {
    id: 'cdn-purge',
    pattern: /cdn.*purge|purge.*cache|bunny.*purge|cloudflare.*cache/i,
    agents: ['cdn-agent'],
    sequence: 'single',
    gate_mode: 'audit-only',
    description: 'CDN cache purging',
    // Simple API call, cost-efficient model
    model_override: 'glm-4.5',
  },
  {
    id: 'storage-backup',
    pattern: /backup.*create|restore.*backup|nfs.*config|storage.*volume/i,
    agents: ['storage-agent'],
    sequence: 'single',
    gate_mode: 'gate-on-write',
    description: 'Storage and backup operations',
    // Tool-heavy (rsync, s3cmd), glm-4.5 excels
    model_override: 'glm-4.5',
  },
  {
    id: 'splash-video',
    pattern: /splash.*video|youtube.*upload|social.*post|video.*automation/i,
    agents: ['splash-scripts-agent'],
    sequence: 'single',
    gate_mode: 'audit-only',
    description: 'Video automation and social media',
    // API integration work, cost-sensitive
    model_override: 'glm-4.5',
  },
  {
    id: 'cicd-pipeline',
    pattern: /github.*action|docker.*build|ci.*cd|pipeline.*create|workflow/i,
    agents: ['cicd-agent'],
    sequence: 'single',
    gate_mode: 'audit-only',
    description: 'CI/CD pipeline operations',
    // Complex workflow logic
    model_override: 'qwen3.5-plus',
  },
];

/**
 * Get an agent by name.
 */
export function getAgent(name: string): SpecialistAgent | undefined {
  return SPECIALIST_AGENTS[name];
}

/**
 * List all available agents.
 */
export function listAgents(): SpecialistAgent[] {
  return Object.values(SPECIALIST_AGENTS);
}

/**
 * Heuristic-based agent selection when no rules match.
 * Uses keyword matching to select agents.
 */
export function selectAgentsByHeuristics(description: string): {
  agents: string[];
  sequence: 'single' | 'sequential' | 'parallel';
} {
  const descLower = description.toLowerCase();
  const selectedAgents: string[] = [];

  // Multi-agent detection
  let sequence: 'single' | 'sequential' | 'parallel' = 'single';
  if (/\b(and|then|also|multiple|all)\b/i.test(description)) {
    sequence = 'sequential';
  }

  // Check each agent's keywords
  for (const [agentName, agent] of Object.entries(SPECIALIST_AGENTS)) {
    if (agentName === 'orchestrator-agent') continue; // Skip default

    if (agent.keywords.some(kw => descLower.includes(kw))) {
      selectedAgents.push(agentName);
    }
  }

  // Default to orchestrator-agent if no matches
  if (selectedAgents.length === 0) {
    selectedAgents.push('orchestrator-agent');
  }

  return { agents: selectedAgents, sequence };
}

/**
 * Analyze task complexity to determine appropriate model.
 *
 * Factors considered:
 * - Description length (longer = more complex)
 * - Complex task keywords (architecture, refactor, migrate, design, etc.)
 * - Multiple domains/agents required
 * - Security or database work (inherently complex)
 */
export function analyzeComplexity(description: string, agents: string[]): 'simple' | 'complex' {
  const descLower = description.toLowerCase();

  // Factor 1: Description length
  // Short descriptions (< 50 chars) tend to be simple tasks
  const isLongDescription = description.length > 100;

  // Factor 2: Complex task keywords
  const complexKeywords = [
    'architecture', 'refactor', 'migrate', 'migration', 'design',
    'optimize', 'performance', 'scalability', 'restructure',
    'implement', 'build', 'create', 'end-to-end', 'full-stack',
    'security', 'audit', 'vulnerability', 'penetration',
    'complex', 'advanced', 'multi-step', 'pipeline',
    'analyze', 'investigate', 'debug', 'troubleshoot',
  ];
  const hasComplexKeywords = complexKeywords.some(kw => descLower.includes(kw));

  // Factor 3: Multiple agents required (indicates multi-domain work)
  const isMultiAgent = agents.length > 1;

  // Factor 4: Inherently complex domains
  const complexDomains = ['security-reviewer', 'database-agent', 'cicd-agent'];
  const hasComplexDomain = agents.some(a => complexDomains.includes(a));

  // Complex if: 2+ factors OR any single strong signal
  let complexityScore = 0;
  if (isLongDescription) complexityScore++;
  if (hasComplexKeywords) complexityScore++;
  if (isMultiAgent) complexityScore++;
  if (hasComplexDomain) complexityScore++;

  // Security/audit always complex
  if (agents.includes('security-reviewer')) return 'complex';

  // Database migrations always complex
  if (agents.includes('database-agent') && descLower.includes('migration')) return 'complex';

  // Multiple agents with long description = complex
  if (isMultiAgent && isLongDescription) return 'complex';

  // 2+ complexity signals = complex
  if (complexityScore >= 2) return 'complex';

  return 'simple';
}

/**
 * Get the appropriate model for a task based on complexity and agent config.
 *
 * Priority:
 * 1. Rule-level model_override (if set)
 * 2. Complexity-based selection (qwen3.5-plus for complex, glm-4.5 for simple)
 * 3. Agent-level model (fallback)
 */
export function selectModel(
  description: string,
  agents: string[],
  ruleModelOverride?: string,
  agentModels?: Array<string | undefined>
): string | undefined {
  // Priority 1: Rule-level override
  if (ruleModelOverride) {
    return ruleModelOverride;
  }

  // Priority 2: Complexity-based selection
  const complexity = analyzeComplexity(description, agents);
  if (complexity === 'complex') {
    return 'qwen3.5-plus';
  }

  // For simple tasks, use glm-4.5 if all agents have it as default
  const allGlm = agentModels?.every(m => m === 'glm-4.5') ?? false;
  if (allGlm) {
    return 'glm-4.5';
  }

  // Priority 3: Fall back to first agent's model
  return agentModels?.find(m => m !== undefined);
}

/**
 * Route a task description to agents using rules or heuristics.
 * Returns selected agents along with recommended model based on complexity.
 */
export function routeTask(description: string): {
  agents: string[];
  sequence: 'single' | 'sequential' | 'parallel';
  gate_mode: 'audit-only' | 'gate-on-write' | 'gate-on-deploy';
  rule_id: string | null;
  fallback_used: boolean;
  model?: string; // Recommended model based on complexity and rule override
} {
  // Try rules first
  for (const rule of ROUTING_RULES) {
    if (rule.pattern.test(description)) {
      // Get agent models for this rule
      const agentModels = rule.agents.map(a => SPECIALIST_AGENTS[a]?.model);

      // Select model based on rule override or complexity
      const model = selectModel(description, rule.agents, rule.model_override, agentModels);

      return {
        agents: rule.agents,
        sequence: rule.sequence,
        gate_mode: rule.gate_mode,
        rule_id: rule.id,
        fallback_used: false,
        model,
      };
    }
  }

  // Fallback to heuristics
  const { agents, sequence } = selectAgentsByHeuristics(description);
  const agentModels = agents.map(a => SPECIALIST_AGENTS[a]?.model);
  const model = selectModel(description, agents, undefined, agentModels);

  return {
    agents,
    sequence,
    gate_mode: 'audit-only',
    rule_id: null,
    fallback_used: true,
    model,
  };
}
