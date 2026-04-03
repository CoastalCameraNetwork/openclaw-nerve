/**
 * Audit Pipeline Service
 *
 * Multi-agent parallel code analysis inspired by Turbo's audit skill.
 * Routes code to specialist agents based on change type:
 * - Security review for auth/authz changes
 * - Performance review for database/loop patterns
 * - Architecture review for new modules
 * - Testing review for test files
 *
 * Runs audits in parallel and aggregates results
 */

import { z } from 'zod';
import { invokeGatewayTool } from '../lib/gateway-client';
import type { Improvement } from './improvement-backlog';

export const AuditRequestSchema = z.object({
  filePath: z.string(),
  content: z.string(),
  changeType: z.enum(['new-file', 'modification', 'deletion']),
  diff: z.string().optional(),
  context: z.object({
    prNumber: z.number().optional(),
    branch: z.string().optional(),
    author: z.string().optional(),
  }).optional(),
});

export type AuditRequest = z.infer<typeof AuditRequestSchema>;

export const AuditFindingSchema = z.object({
  severity: z.enum(['critical', 'important', 'suggestion', 'nit']),
  category: z.enum(['security', 'performance', 'correctness', 'maintainability', 'testing', 'style']),
  title: z.string(),
  description: z.string(),
  location: z.object({
    line: z.number().optional(),
    column: z.number().optional(),
  }).optional(),
  suggestion: z.string().optional(),
});

export type AuditFinding = z.infer<typeof AuditFindingSchema>;

export const AuditResultSchema = z.object({
  filePath: z.string(),
  agent: z.string(),
  findings: z.array(AuditFindingSchema),
  summary: z.string(),
  duration: z.number(),
});

export type AuditResult = z.infer<typeof AuditResultSchema>;

export interface AuditReport {
  requestId: string;
  filePath: string;
  completedAt: number;
  results: AuditResult[];
  totalFindings: {
    critical: number;
    important: number;
    suggestions: number;
    nits: number;
  };
  improvements: Improvement[];
}

// Agent routing rules
interface AuditAgent {
  name: string;
  patterns: RegExp[];
  prompt: string;
  modelOverride?: string;
}

const AUDIT_AGENTS: AuditAgent[] = [
  {
    name: 'security-auditor',
    patterns: [
      /auth/i,
      /password/i,
      /token/i,
      /secret/i,
      /credential/i,
      /permission/i,
      /role/i,
      /middleware/i,
    ],
    prompt: `You are a security specialist reviewing code for vulnerabilities.
Focus on:
- Authentication/authorization flaws
- Input validation issues
- SQL injection, XSS, CSRF vulnerabilities
- Secret exposure in logs or responses
- Insecure defaults

Report findings with severity levels and specific fixes.`,
    modelOverride: 'qwen3.5-plus',
  },
  {
    name: 'performance-auditor',
    patterns: [
      /loop/i,
      /database/i,
      /query/i,
      /fetch/i,
      /api/i,
      /cache/i,
      /stream/i,
    ],
    prompt: `You are a performance specialist reviewing code for efficiency.
Focus on:
- N+1 query patterns
- Missing caching opportunities
- Inefficient loops or algorithms
- Memory leaks
- Blocking operations
- Unnecessary re-renders (frontend)

Report findings with concrete optimization suggestions.`,
  },
  {
    name: 'architecture-auditor',
    patterns: [
      /service/i,
      /controller/i,
      /route/i,
      /module/i,
      /component/i,
      /provider/i,
    ],
    prompt: `You are an architecture specialist reviewing code structure.
Focus on:
- Separation of concerns
- Single responsibility principle
- Coupling and cohesion
- Dependency injection
- Interface design
- Scalability considerations

Report architectural concerns and refactoring suggestions.`,
  },
  {
    name: 'testing-auditor',
    patterns: [
      /\.test\./i,
      /\.spec\./i,
      /test/i,
      /mock/i,
      /assert/i,
    ],
    prompt: `You are a testing specialist reviewing test code.
Focus on:
- Test coverage gaps
- Missing edge cases
- Brittle tests (too coupled to implementation)
- Missing assertions
- Test data management
- Integration vs unit test balance

Report gaps and quality improvements.`,
  },
];

export class AuditPipeline {
  /**
   * Analyze code and determine which audit agents to invoke
   */
  async audit(request: AuditRequest): Promise<AuditReport> {
    const requestId = `audit-${Date.now()}`;
    const startTime = Date.now();

    // Determine relevant agents based on file path and content
    const relevantAgents = this.selectAgents(request);

    // Run audits in parallel
    const auditPromises = relevantAgents.map(agent => this.runAgentAudit(agent, request));
    const results = await Promise.all(auditPromises);

    // Aggregate findings
    const report: AuditReport = {
      requestId,
      filePath: request.filePath,
      completedAt: Date.now(),
      results,
      totalFindings: {
        critical: 0,
        important: 0,
        suggestions: 0,
        nits: 0,
      },
      improvements: [],
    };

    // Count findings by severity
    for (const result of results) {
      for (const finding of result.findings) {
        switch (finding.severity) {
          case 'critical':
            report.totalFindings.critical++;
            break;
          case 'important':
            report.totalFindings.important++;
            break;
          case 'suggestion':
            report.totalFindings.suggestions++;
            break;
          case 'nit':
            report.totalFindings.nits++;
            break;
        }

        // Convert critical/important findings to improvements
        if (finding.severity === 'critical' || finding.severity === 'important') {
          report.improvements.push({
            id: `improvement-${requestId}-${finding.title.slice(0, 20)}`,
            summary: `[${finding.category}] ${finding.title}`,
            location: request.filePath,
            type: this.findingToImprovementType(finding.category),
            priority: finding.severity === 'critical' ? 'critical' : 'high',
            createdAt: Date.now(),
            source: 'audit',
            status: 'pending',
            context: finding.description,
          });
        }
      }
    }

    return report;
  }

  /**
   * Select relevant audit agents based on file content and path
   */
  private selectAgents(request: AuditRequest): AuditAgent[] {
    const relevantAgents: AuditAgent[] = [];

    for (const agent of AUDIT_AGENTS) {
      const score = agent.patterns.reduce((acc, pattern) => {
        if (pattern.test(request.filePath) || pattern.test(request.content)) {
          return acc + 1;
        }
        return acc;
      }, 0);

      // Include agents with at least one pattern match
      if (score > 0) {
        relevantAgents.push(agent);
      }
    }

    // Always include at least one agent
    if (relevantAgents.length === 0) {
      relevantAgents.push(AUDIT_AGENTS[2]); // architecture-auditor as default
    }

    return relevantAgents;
  }

  /**
   * Run audit with a specific agent
   */
  private async runAgentAudit(agent: AuditAgent, request: AuditRequest): Promise<AuditResult> {
    const startAgentTime = Date.now();

    const prompt = `${agent.prompt}

## File: ${request.filePath}
## Change Type: ${request.changeType}

${request.diff ? `## Diff:\n${request.diff}` : ''}

## Code:
\`\`\`
${request.content}
\`\`\`

Return findings as JSON array with this structure:
[
  {
    "severity": "critical|important|suggestion|nit",
    "category": "security|performance|correctness|maintainability|testing|style",
    "title": "Brief title",
    "description": "Detailed description of the issue",
    "location": { "line": 123 },
    "suggestion": "How to fix"
  }
]

If no findings, return empty array [].`;

    try {
      const result = await invokeGatewayTool(
        'sessions_spawn',
        {
          task: prompt,
          label: `audit-${agent.name}-${request.filePath.slice(-30)}`,
          runtime: 'run',
          mode: 'run',
          thinking: 'low',
          cleanup: 'keep',
        },
        60000 // 60 second timeout
      );

      const findings = this.parseAgentResponse(result.output);

      return {
        filePath: request.filePath,
        agent: agent.name,
        findings,
        summary: `Found ${findings.length} issues`,
        duration: Date.now() - startAgentTime,
      };
    } catch (error) {
      console.error(`[AuditPipeline] Agent ${agent.name} failed:`, error);
      return {
        filePath: request.filePath,
        agent: agent.name,
        findings: [],
        summary: `Audit failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        duration: Date.now() - startAgentTime,
      };
    }
  }

  /**
   * Parse agent response into structured findings
   */
  private parseAgentResponse(output: string): AuditFinding[] {
    try {
      // Try to extract JSON from output
      const jsonMatch = output.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const findings = JSON.parse(jsonMatch[0]);
        return findings.filter((f: any) =>
          f.severity && f.category && f.title && f.description
        );
      }
    } catch (error) {
      console.error('[AuditPipeline] Failed to parse agent response:', error);
    }

    // Fallback: return empty findings
    return [];
  }

  /**
   * Map finding category to improvement type
   */
  private findingToImprovementType(category: string): Improvement['type'] {
    const mapping: Record<string, Improvement['type']> = {
      security: 'bug-fix',
      performance: 'performance',
      correctness: 'bug-fix',
      maintainability: 'refactoring',
      testing: 'testing',
      style: 'documentation',
    };
    return mapping[category] || 'other';
  }

  /**
   * Generate markdown report from audit results
   */
  async exportToMarkdown(report: AuditReport): Promise<string> {
    let md = `# Audit Report: ${report.filePath}\n\n`;
    md += `*Generated: ${new Date(report.completedAt).toISOString()}*\n\n`;

    // Summary
    md += `## Summary\n\n`;
    md += `- **Critical:** ${report.totalFindings.critical}\n`;
    md += `- **Important:** ${report.totalFindings.important}\n`;
    md += `- **Suggestions:** ${report.totalFindings.suggestions}\n`;
    md += `- **Nits:** ${report.totalFindings.nits}\n\n`;

    // Findings by agent
    for (const result of report.results) {
      md += `## ${result.agent}\n\n`;
      md += `*${result.summary} (${result.duration}ms)*\n\n`;

      if (result.findings.length === 0) {
        md += '*No findings*\n\n';
        continue;
      }

      // Group by severity
      const bySeverity = result.findings.reduce((acc, f) => {
        acc[f.severity] = acc[f.severity] || [];
        acc[f.severity].push(f);
        return acc;
      }, {} as Record<string, AuditFinding[]>);

      for (const [severity, findings] of Object.entries(bySeverity)) {
        md += `### ${severity.charAt(0).toUpperCase() + severity.slice(1)}\n\n`;
        for (const finding of findings) {
          md += `#### ${finding.title}\n\n`;
          md += `- **Category:** ${finding.category}\n`;
          md += `- **Description:** ${finding.description}\n`;
          if (finding.location?.line) md += `- **Line:** ${finding.location.line}\n`;
          if (finding.suggestion) md += `- **Suggestion:** ${finding.suggestion}\n`;
          md += '\n';
        }
      }
      md += '---\n\n';
    }

    // Improvement backlog items
    if (report.improvements.length > 0) {
      md += `## Created Improvements\n\n`;
      for (const imp of report.improvements) {
        md += `- [${imp.priority.toUpperCase()}] ${imp.summary}\n`;
      }
      md += '\n';
    }

    return md;
  }
}

// Singleton
let pipelineInstance: AuditPipeline | null = null;

export function getAuditPipeline(): AuditPipeline {
  if (!pipelineInstance) {
    pipelineInstance = new AuditPipeline();
  }
  return pipelineInstance;
}
