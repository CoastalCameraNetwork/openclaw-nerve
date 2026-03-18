/**
 * Automated PR Review Service (using GitHub CLI)
 * 
 * Uses gh CLI to fetch PR details, diff, and run reviews efficiently.
 * No duplicate agent sessions - single review with full context.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export interface ReviewResult {
  passed: boolean;
  reviewer: string;
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
 * Fetch PR details using gh CLI
 */
async function getPRDetails(prNumber: number): Promise<any> {
  const { stdout } = await execAsync(
    `gh pr view ${prNumber} --json number,title,body,headRefName,baseRefName,files,commits,url`
  );
  return JSON.parse(stdout);
}

/**
 * Fetch PR diff using gh CLI
 */
async function getPRDiff(prNumber: number): Promise<string> {
  const { stdout } = await execAsync(`gh pr diff ${prNumber}`);
  return stdout;
}

/**
 * Run automated PR review using gh CLI
 */
export async function runAutomatedPRReview(
  taskId: string,
  prNumber: number,
  projectType?: string
): Promise<PRReviewReport> {
  const reviews: ReviewResult[] = [];
  
  try {
    // Fetch PR details and diff using gh CLI
    const prDetails = await getPRDetails(prNumber);
    const prDiff = await getPRDiff(prNumber);
    
    // Create review context
    const reviewContext = {
      prNumber,
      title: prDetails.title,
      branch: prDetails.headRefName,
      baseBranch: prDetails.baseRefName,
      files: prDetails.files || [],
      diff: prDiff,
    };
    
    // 1. Security Review (using gh CLI + security-reviewer agent ONCE)
    const securityReview = await runSecurityReview(reviewContext);
    reviews.push(securityReview);
    
    // 2. CI/CD Review (using gh CLI to check runs)
    const cicdReview = await runCICDReview(prNumber);
    reviews.push(cicdReview);
    
    // 3. Code Quality Review (if applicable)
    if (projectType === 'mgmt' || projectType === 'repo') {
      const codeReview = await runCodeQualityReview(reviewContext);
      reviews.push(codeReview);
    }
    
    // Compile report
    const criticalIssues = reviews.reduce((sum, r) => 
      sum + r.issues.filter(i => i.severity === 'critical').length, 0);
    const highIssues = reviews.reduce((sum, r) => 
      sum + r.issues.filter(i => i.severity === 'high').length, 0);
    const mediumIssues = reviews.reduce((sum, r) => 
      sum + r.issues.filter(i => i.severity === 'medium').length, 0);
    const lowIssues = reviews.reduce((sum, r) => 
      sum + r.issues.filter(i => i.severity === 'low').length, 0);
    
    const passed = criticalIssues === 0 && highIssues === 0 && mediumIssues === 0;
    
    const recommendations: string[] = [];
    if (criticalIssues > 0) {
      recommendations.push(`⚠️ CRITICAL: ${criticalIssues} critical issues must be fixed`);
    }
    if (highIssues > 0) {
      recommendations.push(`⚠️ HIGH: ${highIssues} high-priority issues should be fixed`);
    }
    if (mediumIssues > 0) {
      recommendations.push(`ℹ️ MEDIUM: ${mediumIssues} medium-priority issues recommended to fix`);
    }
    if (passed) {
      recommendations.push('ℹ️ Low priority issues only - ready for human review');
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
  } catch (error) {
    console.error('PR review failed:', error);
    return {
      taskId,
      prNumber,
      reviews: [{
        passed: false,
        reviewer: 'system',
        summary: 'Review failed to complete',
        issues: [{
          severity: 'critical',
          description: `Review error: ${(error as Error).message}`,
        }],
        timestamp: Date.now(),
      }],
      passed: false,
      criticalIssues: 1,
      highIssues: 0,
      mediumIssues: 0,
      lowIssues: 0,
      recommendations: ['Fix the review error and retry'],
      timestamp: Date.now(),
    };
  }
}

/**
 * Security review using gh CLI + single agent session
 */
async function runSecurityReview(context: any): Promise<ReviewResult> {
  try {
    // Use gh CLI to check for security issues in files
    const securityPrompt = `Review this PR for security issues:

PR #${context.prNumber}: ${context.title}
Branch: ${context.branch} → ${context.baseBranch}

Files changed: ${context.files?.map((f: any) => f.path).join(', ') || 'N/A'}

Look for:
1. Hardcoded secrets/credentials
2. SQL injection patterns
3. XSS vulnerabilities
4. Auth/security bypasses
5. Insecure dependencies

PR Diff:
${context.diff?.substring(0, 5000) || 'N/A'}`;

    // Single agent session for security review
    const { invokeGatewayTool } = await import('../lib/gateway-client.js');
    const result = await invokeGatewayTool('sessions_spawn', {
      task: securityPrompt,
      label: `pr-${context.prNumber}-security`,
      runtime: 'subagent',
      mode: 'run',
      thinking: 'high',
      cleanup: 'keep',
    }) as any;
    
    const output = result?.content?.[0]?.text || JSON.stringify(result);
    
    return {
      passed: !output.toLowerCase().includes('critical') && !output.toLowerCase().includes('vulnerability'),
      reviewer: 'security-reviewer',
      summary: 'Security audit completed via gh CLI',
      issues: parseReviewIssues(output),
      timestamp: Date.now(),
    };
  } catch (error) {
    return {
      passed: false,
      reviewer: 'security-reviewer',
      summary: 'Security review failed',
      issues: [{
        severity: 'high',
        description: `Security review error: ${(error as Error).message}`,
      }],
      timestamp: Date.now(),
    };
  }
}

/**
 * CI/CD review using gh CLI to check workflow runs
 */
async function runCICDReview(prNumber: number): Promise<ReviewResult> {
  try {
    // Use gh CLI to check CI runs
    const { stdout } = await execAsync(
      `gh run list --pr ${prNumber} --limit 5 --json status,conclusion,name --jq '.'`
    );
    const runs = JSON.parse(stdout || '[]');
    
    const failedRuns = runs.filter((r: any) => r.conclusion === 'failure');
    const pendingRuns = runs.filter((r: any) => r.status === 'in_progress' || r.status === 'queued');
    
    const issues = [];
    if (failedRuns.length > 0) {
      issues.push({
        severity: 'high' as const,
        description: `CI checks failed: ${failedRuns.map((r: any) => r.name).join(', ')}`,
      });
    }
    if (pendingRuns.length > 0) {
      issues.push({
        severity: 'medium' as const,
        description: `CI checks still running: ${pendingRuns.map((r: any) => r.name).join(', ')}`,
      });
    }
    
    return {
      passed: failedRuns.length === 0,
      reviewer: 'cicd-agent',
      summary: `CI/CD check: ${runs.length} runs, ${failedRuns.length} failed`,
      issues,
      timestamp: Date.now(),
    };
  } catch (error) {
    return {
      passed: false,
      reviewer: 'cicd-agent',
      summary: 'CI/CD review failed',
      issues: [{
        severity: 'medium',
        description: `CI check error: ${(error as Error).message}`,
      }],
      timestamp: Date.now(),
    };
  }
}

/**
 * Code quality review using gh CLI + single agent session
 */
async function runCodeQualityReview(context: any): Promise<ReviewResult> {
  try {
    const qualityPrompt = `Review this PR for code quality:

PR #${context.prNumber}: ${context.title}

Files: ${context.files?.map((f: any) => f.path).join(', ')}

Look for:
1. Code style issues
2. Missing tests
3. Poor error handling
4. Code duplication
5. Performance issues

Diff:
${context.diff?.substring(0, 5000) || 'N/A'}`;

    const { invokeGatewayTool } = await import('../lib/gateway-client.js');
    const result = await invokeGatewayTool('sessions_spawn', {
      task: qualityPrompt,
      label: `pr-${context.prNumber}-quality`,
      runtime: 'subagent',
      mode: 'run',
      thinking: 'medium',
      cleanup: 'keep',
    }) as any;
    
    const output = result?.content?.[0]?.text || JSON.stringify(result);
    
    return {
      passed: !output.toLowerCase().includes('major issue'),
      reviewer: 'mgmt-agent',
      summary: 'Code quality review completed via gh CLI',
      issues: parseReviewIssues(output),
      timestamp: Date.now(),
    };
  } catch (error) {
    return {
      passed: false,
      reviewer: 'mgmt-agent',
      summary: 'Code quality review failed',
      issues: [{
        severity: 'medium',
        description: `Quality review error: ${(error as Error).message}`,
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
  const lines = output.split('\n');
  
  for (const line of lines) {
    if (line.toLowerCase().includes('critical') || line.toLowerCase().includes('vulnerability')) {
      issues.push({ severity: 'critical', description: line.trim() });
    } else if (line.toLowerCase().includes('high') || line.toLowerCase().includes('major')) {
      issues.push({ severity: 'high', description: line.trim() });
    } else if (line.toLowerCase().includes('medium') || line.toLowerCase().includes('minor')) {
      issues.push({ severity: 'medium', description: line.trim() });
    } else if (line.toLowerCase().includes('low') || line.toLowerCase().includes('suggestion')) {
      issues.push({ severity: 'low', description: line.trim() });
    }
  }
  
  return issues;
}

/**
 * Post review comments to PR using gh CLI
 */
export async function postReviewCommentsToPR(
  prNumber: number,
  report: PRReviewReport
): Promise<void> {
  try {
    const comment = `## Automated PR Review Report

**Status:** ${report.passed ? '✅ PASSED' : '❌ FAILED'}

### Summary
- Critical Issues: ${report.criticalIssues}
- High Issues: ${report.highIssues}
- Medium Issues: ${report.mediumIssues}
- Low Issues: ${report.lowIssues}

### Reviews
${report.reviews.map(r => `- **${r.reviewer}**: ${r.summary}`).join('\n')}

### Recommendations
${report.recommendations.map(r => `- ${r}`).join('\n')}

---
*Generated by OpenClaw PR Review Bot*`;

    await execAsync(`gh pr comment ${prNumber} --body '${comment.replace(/'/g, "'\\''")}'`);
    console.log(`Posted review comment to PR #${prNumber}`);
  } catch (error) {
    console.error('Failed to post PR comment:', error);
  }
}

/**
 * Fix PR issues using appropriate agent based on issue type
 */
export async function fixPRIssues(
  taskId: string,
  prNumber: number,
  report: PRReviewReport,
  projectType?: string,
  projectLocalPath?: string
): Promise<{ success: boolean; commits: number; message: string; sessionLabel?: string }> {
  try {
    // Get PR details
    const prDetails = await getPRDetails(prNumber);
    const prDiff = await getPRDiff(prNumber);
    
    // Determine which agent should fix based on issues
    const criticalIssues = report.reviews.flatMap(r => r.issues.filter(i => i.severity === 'critical'));
    const highIssues = report.reviews.flatMap(r => r.issues.filter(i => i.severity === 'high'));
    const allIssues = [...criticalIssues, ...highIssues];
    
    if (allIssues.length === 0) {
      return { success: true, commits: 0, message: 'No issues to fix' };
    }
    
    // Build fix prompt
    const fixPrompt = `Fix the following issues in PR #${prNumber}:

PR: ${prDetails.title}
Branch: ${prDetails.headRefName}
Files: ${prDetails.files?.map((f: any) => f.path).join(', ')}

Issues to fix:
${allIssues.map((issue, i) => `${i + 1}. [${issue.severity.toUpperCase()}] ${issue.description}
   ${issue.file ? `File: ${issue.file}` : ''}
   ${issue.suggestion ? `Suggestion: ${issue.suggestion}` : ''}`).join('\n\n')}

PR Diff:
${prDiff.substring(0, 10000)}

Instructions:
1. Review each issue carefully
2. Fix the code to address the issues
3. Test your fixes if possible
4. Commit changes with clear message
5. Push to the PR branch

Working directory: ${projectLocalPath || process.cwd()}`;

    // Spawn appropriate agent based on issue type
    const agentName = criticalIssues.some(i =>
      i.description.toLowerCase().includes('security') ||
      i.description.toLowerCase().includes('vulnerability')
    ) ? 'security-reviewer' :
    projectType === 'mgmt' ? 'mgmt-agent' : 'orchestrator-agent';

    const { invokeGatewayTool } = await import('../lib/gateway-client.js');
    const result = await invokeGatewayTool('sessions_spawn', {
      task: fixPrompt,
      label: `pr-${prNumber}-fix`,
      runtime: 'subagent',
      mode: 'session', // Persistent session for iterative fixes
      thinking: 'high',
      cleanup: 'keep',
    }) as any;

    return {
      success: true,
      commits: 0, // Agent spawned but hasn't committed yet
      message: `Agent ${agentName} spawned to fix ${allIssues.length} issues. Check task status for progress.`,
      sessionLabel: `pr-${prNumber}-fix`,
    };
  } catch (error) {
    return {
      success: false,
      commits: 0,
      message: `Fix failed: ${(error as Error).message}`,
    };
  }
}

/**
 * Re-run PR review after fixes
 */
export async function rerunPRReview(
  taskId: string,
  prNumber: number,
  projectType?: string,
  projectLocalPath?: string
): Promise<PRReviewReport> {
  // Wait a moment for commits to process
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Run review again
  return await runAutomatedPRReview(taskId, prNumber, projectType);
}

/**
 * AGENT PR REVIEW WORKFLOW
 * 
 * All review agents (security-reviewer, mgmt-agent, cicd-agent) follow
 * the same automated fix loop:
 * 
 * 1. REVIEW - Analyze PR for issues in their domain
 * 2. REPORT - Categorize issues (critical/high/medium/low)
 * 3. FIX - Agent fixes issues, commits, pushes
 * 4. RE-REVIEW - Same agent verifies fixes
 * 5. PASS - Only when ALL issues resolved
 * 
 * This ensures consistent quality across all review types.
 */
