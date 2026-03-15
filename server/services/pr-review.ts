/**
 * Automated PR Review Service
 * 
 * Uses specialist agents to automatically review PRs before human review.
 * Runs security, CI/CD, and domain-specific checks.
 */

import { invokeGatewayTool } from '../lib/gateway-client.js';
import { getPRComments } from './github-pr.js';

export interface ReviewResult {
  passed: boolean;
  agent: string;
  summary: string;
  issues: Array<{
    severity: 'critical' | 'high' | 'medium' | 'low';
    description: string;
    file?: string;
    line?: number;
    suggestion?: string;
  }>;
  timestamp: number;
}

export interface PRReviewReport {
  taskId: string;
  prNumber: number;
  reviews: ReviewResult[];
  passed: boolean;
  criticalIssues: number;
  highIssues: number;
  mediumIssues: number;
  lowIssues: number;
  recommendations: string[];
  timestamp: number;
}

/**
 * Run automated PR review using specialist agents
 */
export async function runAutomatedPRReview(
  taskId: string,
  prNumber: number,
  projectType?: string
): Promise<PRReviewReport> {
  const reviews: ReviewResult[] = [];
  
  // 1. Security Review (ALWAYS)
  const securityReview = await runSecurityReview(taskId, prNumber);
  reviews.push(securityReview);
  
  // 2. CI/CD Review (ALWAYS)
  const cicdReview = await runCICDReview(taskId, prNumber);
  reviews.push(cicdReview);
  
  // 3. Domain-specific reviews
  if (projectType === 'mgmt' || projectType === 'repo') {
    const codeReview = await runCodeQualityReview(taskId, prNumber);
    reviews.push(codeReview);
  }
  
  if (projectType === 'mgmt' || projectType === 'database') {
    const dbReview = await runDatabaseReview(taskId, prNumber);
    reviews.push(dbReview);
  }
  
  // Compile report
  const criticalIssues = reviews.reduce((sum, r) => sum + r.issues.filter(i => i.severity === 'critical').length, 0);
  const highIssues = reviews.reduce((sum, r) => sum + r.issues.filter(i => i.severity === 'high').length, 0);
  const mediumIssues = reviews.reduce((sum, r) => sum + r.issues.filter(i => i.severity === 'medium').length, 0);
  const lowIssues = reviews.reduce((sum, r) => sum + r.issues.filter(i => i.severity === 'low').length, 0);
  
  const passed = criticalIssues === 0 && highIssues === 0;
  
  const recommendations: string[] = [];
  if (criticalIssues > 0) {
    recommendations.push(`⚠️ CRITICAL: ${criticalIssues} critical security or quality issues must be fixed before merge`);
  }
  if (highIssues > 0) {
    recommendations.push(`⚠️ HIGH: ${highIssues} high-priority issues should be fixed before merge`);
  }
  if (mediumIssues > 0) {
    recommendations.push(`ℹ️ MEDIUM: ${mediumIssues} medium-priority issues recommended to fix`);
  }
  if (passed) {
    recommendations.push('✅ All automated checks passed - ready for human review');
  }
  
  return {
    taskId,
    prNumber,
    reviews,
    passed,
    criticalIssues,
    highIssues,
    mediumIssues,
    lowIssues,
    recommendations,
    timestamp: Date.now(),
  };
}

/**
 * Security review using security-reviewer agent
 */
async function runSecurityReview(taskId: string, prNumber: number): Promise<ReviewResult> {
  const prompt = `You are reviewing PR #${prNumber} for security vulnerabilities.

Review the PR for:
1. Authentication/authorization issues
2. SQL injection vulnerabilities
3. XSS vulnerabilities
4. Sensitive data exposure
5. Insecure dependencies
6. Security misconfigurations

Be thorough and critical. Security is the top priority.`;

  try {
    const result = await invokeGatewayTool('sessions_spawn', {
      task: prompt,
      label: `pr-review-${prNumber}-security`,
      runtime: 'subagent',
      mode: 'run',
      thinking: 'high',
      cleanup: 'keep',
    }) as any;
    
    // Parse the agent's response
    const output = result?.content?.[0]?.text || JSON.stringify(result);
    
    return {
      passed: !output.toLowerCase().includes('critical') && !output.toLowerCase().includes('vulnerability'),
      agent: 'security-reviewer',
      summary: 'Security audit completed',
      issues: parseReviewIssues(output),
      timestamp: Date.now(),
    };
  } catch (error) {
    console.error('Security review failed:', error);
    return {
      passed: false,
      agent: 'security-reviewer',
      summary: 'Security review failed to complete',
      issues: [{
        severity: 'critical',
        description: 'Security review could not be completed',
      }],
      timestamp: Date.now(),
    };
  }
}

/**
 * CI/CD review using cicd-agent
 */
async function runCICDReview(taskId: string, prNumber: number): Promise<ReviewResult> {
  const prompt = `You are reviewing PR #${prNumber} for CI/CD and code quality.

Review the PR for:
1. Build failures
2. Test failures
3. Linting errors
4. Code style issues
5. Missing tests
6. Performance regressions
7. Breaking changes

Check if all CI checks pass and code quality standards are met.`;

  try {
    const result = await invokeGatewayTool('sessions_spawn', {
      task: prompt,
      label: `pr-review-${prNumber}-cicd`,
      runtime: 'subagent',
      mode: 'run',
      thinking: 'medium',
      cleanup: 'keep',
    }) as any;
    
    const output = result?.content?.[0]?.text || JSON.stringify(result);
    
    return {
      passed: !output.toLowerCase().includes('fail') && !output.toLowerCase().includes('error'),
      agent: 'cicd-agent',
      summary: 'CI/CD review completed',
      issues: parseReviewIssues(output),
      timestamp: Date.now(),
    };
  } catch (error) {
    console.error('CI/CD review failed:', error);
    return {
      passed: false,
      agent: 'cicd-agent',
      summary: 'CI/CD review failed to complete',
      issues: [{
        severity: 'high',
        description: 'CI/CD review could not be completed',
      }],
      timestamp: Date.now(),
    };
  }
}

/**
 * Code quality review using mgmt-agent
 */
async function runCodeQualityReview(taskId: string, prNumber: number): Promise<ReviewResult> {
  const prompt = `You are reviewing PR #${prNumber} for code quality and architecture.

Review the PR for:
1. Code organization and structure
2. Design patterns and best practices
3. Maintainability
4. Readability
5. Documentation
6. Error handling
7. Type safety (if TypeScript)

Provide constructive feedback on code quality.`;

  try {
    const result = await invokeGatewayTool('sessions_spawn', {
      task: prompt,
      label: `pr-review-${prNumber}-quality`,
      runtime: 'subagent',
      mode: 'run',
      thinking: 'medium',
      cleanup: 'keep',
    }) as any;
    
    const output = result?.content?.[0]?.text || JSON.stringify(result);
    
    return {
      passed: !output.toLowerCase().includes('major issue') && !output.toLowerCase().includes('refactor'),
      agent: 'mgmt-agent',
      summary: 'Code quality review completed',
      issues: parseReviewIssues(output),
      timestamp: Date.now(),
    };
  } catch (error) {
    console.error('Code quality review failed:', error);
    return {
      passed: false,
      agent: 'mgmt-agent',
      summary: 'Code quality review failed to complete',
      issues: [{
        severity: 'medium',
        description: 'Code quality review could not be completed',
      }],
      timestamp: Date.now(),
    };
  }
}

/**
 * Database review using database-agent
 */
async function runDatabaseReview(taskId: string, prNumber: number): Promise<ReviewResult> {
  const prompt = `You are reviewing PR #${prNumber} for database changes.

Review the PR for:
1. Migration safety (backward compatible)
2. Data loss risks
3. Performance impact (indexes, queries)
4. Schema design issues
5. SQL injection risks
6. Transaction safety

Ensure database changes are safe and performant.`;

  try {
    const result = await invokeGatewayTool('sessions_spawn', {
      task: prompt,
      label: `pr-review-${prNumber}-db`,
      runtime: 'subagent',
      mode: 'run',
      thinking: 'high',
      cleanup: 'keep',
    }) as any;
    
    const output = result?.content?.[0]?.text || JSON.stringify(result);
    
    return {
      passed: !output.toLowerCase().includes('data loss') && !output.toLowerCase().includes('breaking'),
      agent: 'database-agent',
      summary: 'Database review completed',
      issues: parseReviewIssues(output),
      timestamp: Date.now(),
    };
  } catch (error) {
    console.error('Database review failed:', error);
    return {
      passed: false,
      agent: 'database-agent',
      summary: 'Database review failed to complete',
      issues: [{
        severity: 'high',
        description: 'Database review could not be completed',
      }],
      timestamp: Date.now(),
    };
  }
}

/**
 * Parse review output into structured issues
 */
function parseReviewIssues(output: string): ReviewResult['issues'] {
  const issues: ReviewResult['issues'] = [];
  
  // Simple parsing - look for issue patterns
  const lines = output.split('\n');
  for (const line of lines) {
    if (line.toLowerCase().includes('critical') || line.toLowerCase().includes('vulnerability')) {
      issues.push({
        severity: 'critical',
        description: line.trim(),
      });
    } else if (line.toLowerCase().includes('high') || line.toLowerCase().includes('major')) {
      issues.push({
        severity: 'high',
        description: line.trim(),
      });
    } else if (line.toLowerCase().includes('medium') || line.toLowerCase().includes('minor')) {
      issues.push({
        severity: 'medium',
        description: line.trim(),
      });
    } else if (line.toLowerCase().includes('low') || line.toLowerCase().includes('suggestion')) {
      issues.push({
        severity: 'low',
        description: line.trim(),
      });
    }
  }
  
  return issues;
}

/**
 * Post review comments to PR as GitHub comments
 */
export async function postReviewCommentsToPR(
  prNumber: number,
  report: PRReviewReport
): Promise<void> {
  // This would use GitHub API to post comments
  // For now, just log the report
  console.log('PR Review Report:', JSON.stringify(report, null, 2));
}
