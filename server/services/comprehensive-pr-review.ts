/**
 * Comprehensive PR Review Service
 *
 * Combines multiple review types for automated quality gating:
 * 1. PR Diff Analysis - like Claude plugin code review
 * 2. Code Quality Review - patterns, best practices, maintainability
 * 3. Security Review - OWASP, auth, injection, secrets
 * 4. Implementation Completeness - did it actually solve the task?
 * 5. Confidence Scoring - build trust for removing human gate
 *
 * Goal: Eventually remove human gating when confidence is high enough.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const execAsync = promisify(exec);

// ============================================================================
// Types
// ============================================================================

export interface ReviewIssue {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'nit';
  category: 'security' | 'quality' | 'correctness' | 'performance' | 'style' | 'testing';
  title: string;
  description: string;
  file?: string;
  line?: number;
  codeSnippet?: string;
  suggestion?: string;
  cweId?: string;  // For security issues (Common Weakness Enumeration)
}

export interface ReviewCategory {
  name: string;
  passed: boolean;
  score: number;  // 0-100
  issues: ReviewIssue[];
  summary: string;
}

export interface PRReviewReport {
  taskId: string;
  prNumber?: number;
  taskDescription?: string;

  // Overall results
  passed: boolean;
  overallScore: number;  // 0-100
  confidenceLevel: 'low' | 'medium' | 'high' | 'very-high';

  // Category breakdowns
  securityReview: ReviewCategory;
  qualityReview: ReviewCategory;
  diffReview: ReviewCategory;
  completenessReview: ReviewCategory;

  // Issue counts
  criticalIssues: number;
  highIssues: number;
  mediumIssues: number;
  lowIssues: number;

  // Implementation tracking
  filesChanged: string[];
  linesAdded: number;
  linesRemoved: number;
  todosAdded: number;
  todosFixed: number;

  // Recommendations
  recommendations: string[];
  blockingIssues: string[];

  // Metadata
  timestamp: number;
  duration: number;
}

export interface ReviewContext {
  prNumber?: number;
  title: string;
  description?: string;
  branch?: string;
  baseBranch?: string;
  files?: Array<{ path: string; additions: number; deletions: number }>;
  diff?: string;
  taskDescription?: string;
  projectType?: string;
  projectPath?: string;
}

// ============================================================================
// Configuration - Tune these thresholds to build trust
// ============================================================================

const CONFIDENCE_THRESHOLDS = {
  PASSING_SCORE: 80,           // Overall score needed to pass
  HIGH_CONFIDENCE: 90,         // Score for "high" confidence
  VERY_HIGH_CONFIDENCE: 95,    // Score for "very-high" confidence
  ZERO_TOLERANCE_CATEGORIES: ['security'],  // Categories with zero-tolerance for critical
};

const SCORING_WEIGHTS = {
  security: 0.35,     // Security is most important
  quality: 0.25,      // Code quality
  diff: 0.20,         // Clean diff
  completeness: 0.20, // Actually solves the task
};

// ============================================================================
// Main Review Function
// ============================================================================

export async function runComprehensivePRReview(
  taskId: string,
  context: ReviewContext
): Promise<PRReviewReport> {
  const startTime = Date.now();
  const issues: ReviewIssue[] = [];

  try {
    // Fetch PR diff if we have a PR number
    if (context.prNumber) {
      context = await enrichContextWithPRData(context);
    }

    // Run all review categories
    const [securityReview, qualityReview, diffReview, completenessReview] = await Promise.all([
      runSecurityReview(context),
      runCodeQualityReview(context),
      runDiffAnalysis(context),
      runCompletenessCheck(context),
    ]);

    // Collect all issues
    const allIssues = [
      ...securityReview.issues,
      ...qualityReview.issues,
      ...diffReview.issues,
      ...completenessReview.issues,
    ];

    // Count by severity
    const criticalIssues = allIssues.filter(i => i.severity === 'critical').length;
    const highIssues = allIssues.filter(i => i.severity === 'high').length;
    const mediumIssues = allIssues.filter(i => i.severity === 'medium').length;
    const lowIssues = allIssues.filter(i => i.severity === 'low').length;

    // Calculate overall score
    const overallScore = calculateOverallScore(
      securityReview,
      qualityReview,
      diffReview,
      completenessReview
    );

    // Determine pass/fail
    const hasZeroToleranceViolation = CONFIDENCE_THRESHOLDS.ZERO_TOLERANCE_CATEGORIES.some(
      cat => {
        const review = getReviewByCategory(cat, { securityReview, qualityReview, diffReview, completenessReview });
        return review?.issues.some(i => i.severity === 'critical');
      }
    );

    const passed = overallScore >= CONFIDENCE_THRESHOLDS.PASSING_SCORE &&
                   !hasZeroToleranceViolation &&
                   criticalIssues === 0;

    // Determine confidence level
    const confidenceLevel = determineConfidenceLevel(overallScore, criticalIssues, highIssues);

    // Generate recommendations
    const recommendations = generateRecommendations(
      { securityReview, qualityReview, diffReview, completenessReview },
      passed,
      confidenceLevel
    );

    // Identify blocking issues
    const blockingIssues = generateBlockingIssues(allIssues);

    return {
      taskId,
      prNumber: context.prNumber,
      taskDescription: context.taskDescription,
      passed,
      overallScore: Math.round(overallScore),
      confidenceLevel,
      securityReview,
      qualityReview,
      diffReview,
      completenessReview,
      criticalIssues,
      highIssues,
      mediumIssues,
      lowIssues,
      filesChanged: context.files?.map(f => f.path) || [],
      linesAdded: context.files?.reduce((sum, f) => sum + f.additions, 0) || 0,
      linesRemoved: context.files?.reduce((sum, f) => sum + f.deletions, 0) || 0,
      todosAdded: countTODOs(context.diff || '', 'added'),
      todosFixed: countTODOs(context.diff || '', 'fixed'),
      recommendations,
      blockingIssues,
      timestamp: Date.now(),
      duration: Date.now() - startTime,
    };
  } catch (error) {
    console.error('Comprehensive PR review failed:', error);
    return createErrorReport(taskId, error as Error, startTime);
  }
}

// ============================================================================
// Security Review
// ============================================================================

async function runSecurityReview(context: ReviewContext): Promise<ReviewCategory> {
  const issues: ReviewIssue[] = [];
  const diff = context.diff || '';

  // Static analysis patterns for security issues
  const securityChecks = [
    {
      name: 'Hardcoded Secrets',
      pattern: /(?:(?:api[_-]?key|secret[_-]?key|password|passwd|pwd|token|auth[_-]?token|access[_-]?token|private[_-]?key|certificate)\s*[=:]\s*['"][^'"]{8,}['"])/gi,
      severity: 'critical' as const,
      cweId: 'CWE-798',
      suggestion: 'Use environment variables or a secrets manager',
    },
    {
      name: 'SQL Injection Risk',
      pattern: /(?:(?:execute|query|raw)\s*\(\s*['`"][^'`]*(?:\$\{|\+|%[sd])[^'`]*['`"])/gi,
      severity: 'critical' as const,
      cweId: 'CWE-89',
      suggestion: 'Use parameterized queries or ORM methods',
    },
    {
      name: 'XSS Risk - Unescaped Output',
      pattern: /(?:innerHTML\s*=|document\.write\s*\(|dangerouslySetInnerHTML)/gi,
      severity: 'high' as const,
      cweId: 'CWE-79',
      suggestion: 'Use textContent or escape HTML entities',
    },
    {
      name: 'Command Injection',
      pattern: /(?:exec\s*\(|spawn\s*\(|execSync|execFileSync|child_process\.exec)/gi,
      severity: 'high' as const,
      cweId: 'CWE-78',
      suggestion: 'Avoid shell execution or sanitize inputs strictly',
    },
    {
      name: 'Insecure Random',
      pattern: /(?:Math\.random\(\)|crypto\.randomBytes\s*\(\s*\d+\s*\))[^a-z_]?/gi,
      severity: 'medium' as const,
      cweId: 'CWE-330',
      suggestion: 'Use crypto.randomBytes() for security-sensitive randomness',
    },
    {
      name: 'Eval Usage',
      pattern: /(?:eval\s*\(|new\s+Function\s*\()/gi,
      severity: 'critical' as const,
      cweId: 'CWE-95',
      suggestion: 'Never use eval() - refactor to safe alternatives',
    },
    {
      name: 'Path Traversal',
      pattern: /(?:fs\.(?:readFile|writeFile|appendFile|exists)\s*\([^)]*\+[^)]*\))/gi,
      severity: 'high' as const,
      cweId: 'CWE-22',
      suggestion: 'Sanitize file paths and use path.resolve()',
    },
    {
      name: 'Disabled Security Features',
      pattern: /(?:NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0|verify\s*[:=]\s*false)/gi,
      severity: 'critical' as const,
      cweId: 'CWE-295',
      suggestion: 'Never disable TLS verification in production',
    },
  ];

  // Run pattern checks
  for (const check of securityChecks) {
    const matches = diff.match(check.pattern);
    if (matches && matches.length > 0) {
      issues.push({
        severity: check.severity,
        category: 'security',
        title: check.name,
        description: `Found ${matches.length} instance(s) of potential ${check.name.toLowerCase()}`,
        suggestion: check.suggestion,
        cweId: check.cweId,
      });
    }
  }

  // Check for auth changes that need extra scrutiny
  const authPattern = /(?:auth|login|logout|session|token|jwt|oauth|sso)/gi;
  if (authPattern.test(diff) && authPattern.test(context.title + ' ' + (context.description || ''))) {
    // Auth-related changes need manual review flag
    issues.push({
      severity: 'medium',
      category: 'security',
      title: 'Authentication Code Modified',
      description: 'This PR modifies authentication-related code',
      suggestion: 'Consider additional manual security review for auth changes',
    });
  }

  // Calculate score
  const score = calculateCategoryScore(issues);
  const passed = issues.filter(i => i.severity === 'critical').length === 0;

  return {
    name: 'Security Review',
    passed,
    score,
    issues,
    summary: generateSummary('security', issues, score),
  };
}

// ============================================================================
// Code Quality Review
// ============================================================================

async function runCodeQualityReview(context: ReviewContext): Promise<ReviewCategory> {
  const issues: ReviewIssue[] = [];
  const diff = context.diff || '';

  // Code quality patterns
  const qualityChecks = [
    {
      name: 'Console Logs in Production',
      pattern: /console\.(log|info|debug|warn)\s*\(/gi,
      severity: 'low' as const,
      category: 'quality' as const,
      suggestion: 'Remove console logs or use a logging library',
    },
    {
      name: 'Long Functions',
      pattern: /(?:function|=>)\s*[^{]*\{[^}]{500,}\}/gs,
      severity: 'medium' as const,
      category: 'quality' as const,
      suggestion: 'Consider breaking into smaller functions',
    },
    {
      name: 'Deep Nesting',
      pattern: /(?:\{[^}]*\{[^}]*\{[^}]*\{[^}]*\{)/g,
      severity: 'medium' as const,
      category: 'quality' as const,
      suggestion: 'Reduce nesting depth - use early returns or extract functions',
    },
    {
      name: 'Magic Numbers',
      pattern: /(?<![a-zA-Z_$])(?:\d{4,}|[3-9]\d{2})(?![a-zA-Z_$\d])/g,
      severity: 'low' as const,
      category: 'quality' as const,
      suggestion: 'Extract magic numbers to named constants',
    },
    {
      name: 'Empty Catch Blocks',
      pattern: /catch\s*\(\s*\w*\s*\)\s*\{\s*\}/gi,
      severity: 'high' as const,
      category: 'correctness' as const,
      suggestion: 'Handle or log errors, never swallow silently',
    },
    {
      name: 'FIXME Comments',
      pattern: /\/\/\s*FIXME/gi,
      severity: 'medium' as const,
      category: 'quality' as const,
      suggestion: 'Address FIXME comments before merging',
    },
    {
      name: 'Hack Comments',
      pattern: /\/\/\s*HACK/gi,
      severity: 'low' as const,
      category: 'quality' as const,
      suggestion: 'Document workaround properly or find better solution',
    },
  ];

  // Run quality checks
  for (const check of qualityChecks) {
    const matches = diff.match(check.pattern);
    if (matches && matches.length > 0) {
      issues.push({
        severity: check.severity,
        category: check.category,
        title: check.name,
        description: `Found ${matches.length} instance(s)`,
        suggestion: check.suggestion,
      });
    }
  }

  // Check for test files
  const hasTestFiles = context.files?.some(f =>
    f.path.includes('.test.') ||
    f.path.includes('.spec.') ||
    f.path.includes('__tests__')
  );

  const hasSourceFiles = context.files?.some(f =>
    /\.(ts|tsx|js|jsx)$/.test(f.path) &&
    !f.path.includes('.test.') &&
    !f.path.includes('__tests__')
  );

  if (hasSourceFiles && !hasTestFiles) {
    issues.push({
      severity: 'medium',
      category: 'testing',
      title: 'No Tests Added',
      description: 'Source code changes without corresponding tests',
      suggestion: 'Add unit/integration tests for new functionality',
    });
  }

  // Check for type safety (TypeScript)
  const hasTypeScript = context.files?.some(f => /\.(ts|tsx)$/.test(f.path));
  if (hasTypeScript) {
    const anyPattern = /:\s*any\b/gi;
    const anyMatches = diff.match(anyPattern);
    if (anyMatches && anyMatches.length > 0) {
      issues.push({
        severity: 'medium',
        category: 'quality',
        title: 'Avoid `any` Type',
        description: `Found ${anyMatches.length} usage(s) of 'any' type`,
        suggestion: 'Use proper TypeScript types or interfaces',
      });
    }
  }

  const score = calculateCategoryScore(issues);
  const passed = issues.filter(i => i.severity === 'high' || i.severity === 'critical').length === 0;

  return {
    name: 'Code Quality Review',
    passed,
    score,
    issues,
    summary: generateSummary('quality', issues, score),
  };
}

// ============================================================================
// Diff Analysis
// ============================================================================

async function runDiffAnalysis(context: ReviewContext): Promise<ReviewCategory> {
  const issues: ReviewIssue[] = [];
  const diff = context.diff || '';

  // Analyze diff quality
  const lines = diff.split('\n');
  const additions = lines.filter(l => l.startsWith('+') && !l.startsWith('+++')).length;
  const deletions = lines.filter(l => l.startsWith('-') && !l.startsWith('---')).length;
  const totalChanged = additions + deletions;

  // Large PRs are harder to review
  if (totalChanged > 500) {
    issues.push({
      severity: 'medium',
      category: 'style',
      title: 'Large PR',
      description: `PR contains ${totalChanged} changed lines`,
      suggestion: 'Consider splitting into smaller, focused PRs',
    });
  }

  // Too many files
  const fileCount = context.files?.length || 0;
  if (fileCount > 15) {
    issues.push({
      severity: 'medium',
      category: 'style',
      title: 'Many Files Changed',
      description: `${fileCount} files modified`,
      suggestion: 'Consider splitting into multiple PRs by concern',
    });
  }

  // Check for commented-out code
  const commentedCode = diff.match(/(?:\/\/|\/\*|\*)\s*(?:TODO|FIXME|XXX|HACK|removed|old|original)/gi);
  if (commentedCode && commentedCode.length > 0) {
    issues.push({
      severity: 'low',
      category: 'style',
      title: 'Commented Code',
      description: 'Found commented code blocks',
      suggestion: 'Remove commented code - use version control instead',
    });
  }

  // Check for whitespace-only changes
  const whitespaceOnly = diff.match(/^\+\s+$/gm);
  if (whitespaceOnly && whitespaceOnly.length > 5) {
    issues.push({
      severity: 'nit',
      category: 'style',
      title: 'Whitespace Changes',
      description: 'Many whitespace-only additions',
      suggestion: 'Ensure whitespace changes are intentional',
    });
  }

  // Check for proper commit structure hints
  const hasMeaningfulMessages = /(?:fix|feat|add|remove|update|refactor|improve|clean|simplify)/i.test(diff);
  if (!hasMeaningfulMessages && totalChanged > 50) {
    issues.push({
      severity: 'low',
      category: 'style',
      title: 'Commit Message',
      description: 'Large changes without clear commit indicators',
      suggestion: 'Use conventional commits (fix:, feat:, refactor:, etc.)',
    });
  }

  const score = calculateCategoryScore(issues);
  const passed = issues.filter(i => i.severity === 'critical' || i.severity === 'high').length === 0;

  return {
    name: 'Diff Analysis',
    passed,
    score,
    issues,
    summary: generateSummary('diff', issues, score),
  };
}

// ============================================================================
// Implementation Completeness Check
// ============================================================================

async function runCompletenessCheck(context: ReviewContext): Promise<ReviewCategory> {
  const issues: ReviewIssue[] = [];
  const taskDescription = context.taskDescription || '';
  const diff = context.diff || '';

  if (!taskDescription) {
    return {
      name: 'Implementation Completeness',
      passed: true,
      score: 100,
      issues: [],
      summary: 'No task description provided - completeness check skipped',
    };
  }

  // Extract key requirements from task description
  const requirements = extractRequirements(taskDescription);

  // Check if requirements are addressed in diff
  for (const req of requirements) {
    const reqPattern = new RegExp(req, 'gi');
    const foundInDiff = reqPattern.test(diff) || reqPattern.test(context.title || '');

    if (!foundInDiff) {
      issues.push({
        severity: 'high',
        category: 'correctness',
        title: 'Missing Requirement',
        description: `Requirement "${req.substring(0, 50)}${req.length > 50 ? '...' : ''}" not found in changes`,
        suggestion: 'Ensure all task requirements are implemented',
      });
    }
  }

  // Check for TODOs that suggest incomplete work
  const todosInDiff = diff.match(/\/\/\s*(?:TODO|FIXME|XXX)\s*[:.]*(.+)/gi);
  if (todosInDiff && todosInDiff.length > 2) {
    issues.push({
      severity: 'medium',
      category: 'correctness',
      title: 'Multiple TODOs Added',
      description: `${todosInDiff.length} TODO comments suggest incomplete implementation`,
      suggestion: 'Complete TODO items or create follow-up tasks',
    });
  }

  // Check if files were deleted that might be important
  const deletionsOnly = diff.match(/^\-[\-\-]{3}\s+.*/gm);
  if (deletionsOnly && deletionsOnly.length > 3) {
    issues.push({
      severity: 'medium',
      category: 'correctness',
      title: 'Files Deleted',
      description: `${deletionsOnly.length} file deletions detected`,
      suggestion: 'Verify deletions are intentional and not breaking changes',
    });
  }

  const score = calculateCategoryScore(issues);
  const passed = issues.filter(i => i.severity === 'critical' || i.severity === 'high').length === 0;

  return {
    name: 'Implementation Completeness',
    passed,
    score,
    issues,
    summary: generateSummary('completeness', issues, score),
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

async function enrichContextWithPRData(context: ReviewContext): Promise<ReviewContext> {
  try {
    const { stdout } = await execAsync(
      `gh pr view ${context.prNumber} --json number,title,body,headRefName,baseRefName,files,commits,url`
    );
    const prData = JSON.parse(stdout);

    const { stdout: diffStdout } = await execAsync(`gh pr diff ${context.prNumber}`);

    return {
      ...context,
      title: prData.title,
      description: prData.body,
      branch: prData.headRefName,
      baseBranch: prData.baseBranch,
      files: prData.files || [],
      diff: diffStdout,
    };
  } catch (error) {
    console.error('Failed to fetch PR data:', error);
    return context;
  }
}

function calculateCategoryScore(issues: ReviewIssue[]): number {
  const severityPenalties = {
    critical: 40,
    high: 25,
    medium: 12,
    low: 5,
    nit: 2,
  };

  let totalPenalty = 0;
  for (const issue of issues) {
    totalPenalty += severityPenalties[issue.severity];
  }

  return Math.max(0, 100 - totalPenalty);
}

function calculateOverallScore(
  security: ReviewCategory,
  quality: ReviewCategory,
  diff: ReviewCategory,
  completeness: ReviewCategory
): number {
  return (
    security.score * SCORING_WEIGHTS.security +
    quality.score * SCORING_WEIGHTS.quality +
    diff.score * SCORING_WEIGHTS.diff +
    completeness.score * SCORING_WEIGHTS.completeness
  );
}

function determineConfidenceLevel(
  overallScore: number,
  criticalIssues: number,
  highIssues: number
): 'low' | 'medium' | 'high' | 'very-high' {
  if (criticalIssues > 0) return 'low';
  if (overallScore >= CONFIDENCE_THRESHOLDS.VERY_HIGH_CONFIDENCE && highIssues === 0) return 'very-high';
  if (overallScore >= CONFIDENCE_THRESHOLDS.HIGH_CONFIDENCE) return 'high';
  if (overallScore >= CONFIDENCE_THRESHOLDS.PASSING_SCORE) return 'medium';
  return 'low';
}

function extractRequirements(description: string): string[] {
  // Extract bullet points, numbered lists, and sentences with action verbs
  const patterns = [
    /(?:^|\n)\s*[-*•]\s*(.+)/g,
    /(?:^|\n)\s*\d+[\.)]\s*(.+)/g,
    /(?:implement|add|create|build|fix|update|change|remove|delete)\s+([^.,\n]+)/gi,
  ];

  const requirements = new Set<string>();
  for (const pattern of patterns) {
    const matches = description.match(pattern);
    if (matches) {
      for (const match of matches) {
        const cleaned = match.replace(/^[-*•\d.)\s]+/, '').trim();
        if (cleaned.length > 10 && cleaned.length < 200) {
          requirements.add(cleaned);
        }
      }
    }
  }

  return Array.from(requirements).slice(0, 10); // Limit to top 10 requirements
}

function generateSummary(category: string, issues: ReviewIssue[], score: number): string {
  const status = score >= 80 ? '✓ Passed' : score >= 60 ? '⚠ Needs attention' : '✗ Failed';
  const issueCount = issues.length;

  if (issueCount === 0) {
    return `${status} (${score}/100) - No issues found`;
  }

  const critical = issues.filter(i => i.severity === 'critical').length;
  const high = issues.filter(i => i.severity === 'high').length;

  return `${status} (${score}/100) - ${issueCount} issue(s): ${critical} critical, ${high} high`;
}

function generateRecommendations(
  reviews: { securityReview: ReviewCategory; qualityReview: ReviewCategory; diffReview: ReviewCategory; completenessReview: ReviewCategory },
  passed: boolean,
  confidenceLevel: string
): string[] {
  const recommendations: string[] = [];

  if (!passed) {
    if (reviews.securityReview.issues.some(i => i.severity === 'critical')) {
      recommendations.push('🛑 BLOCKER: Critical security issues must be fixed before merge');
    }
    recommendations.push('⚠️ Address all high-priority issues before proceeding');
  }

  if (confidenceLevel === 'very-high') {
    recommendations.push('✅ High confidence - safe to merge without additional review');
  } else if (confidenceLevel === 'high') {
    recommendations.push('✓ Good confidence - light human review recommended');
  } else if (confidenceLevel === 'medium') {
    recommendations.push('⚠ Moderate confidence - human review required');
  } else {
    recommendations.push('🔍 Low confidence - thorough review required');
  }

  if (reviews.completenessReview.issues.some(i => i.category === 'correctness')) {
    recommendations.push('📋 Verify all task requirements are implemented');
  }

  if (reviews.diffReview.issues.some(i => i.title.includes('Large PR'))) {
    recommendations.push('✂️ Consider splitting into smaller PRs');
  }

  return recommendations;
}

function generateBlockingIssues(issues: ReviewIssue[]): string[] {
  return issues
    .filter(i => i.severity === 'critical' || i.severity === 'high')
    .map(i => `[${i.severity.toUpperCase()}] ${i.title}: ${i.description}`);
}

function countTODOs(diff: string, type: 'added' | 'fixed'): number {
  if (type === 'added') {
    const addedLines = diff.split('\n').filter(l => l.startsWith('+'));
    return addedLines.filter(l => /\/\/\s*(TODO|FIXME|XXX|HACK)/i.test(l)).length;
  } else {
    // Count removed TODOs (lines starting with -)
    const removedLines = diff.split('\n').filter(l => l.startsWith('-'));
    return removedLines.filter(l => /\/\/\s*(TODO|FIXME|XXX|HACK)/i.test(l)).length;
  }
}

function getReviewByCategory(
  category: string,
  reviews: { securityReview: ReviewCategory; qualityReview: ReviewCategory; diffReview: ReviewCategory; completenessReview: ReviewCategory }
): ReviewCategory | undefined {
  const map: Record<string, ReviewCategory> = {
    security: reviews.securityReview,
    quality: reviews.qualityReview,
    diff: reviews.diffReview,
    completeness: reviews.completenessReview,
  };
  return map[category];
}

function createErrorReport(taskId: string, error: Error, startTime: number): PRReviewReport {
  return {
    taskId,
    passed: false,
    overallScore: 0,
    confidenceLevel: 'low',
    securityReview: { name: 'Security Review', passed: false, score: 0, issues: [], summary: 'Review failed' },
    qualityReview: { name: 'Code Quality Review', passed: false, score: 0, issues: [], summary: 'Review failed' },
    diffReview: { name: 'Diff Analysis', passed: false, score: 0, issues: [], summary: 'Review failed' },
    completenessReview: { name: 'Implementation Completeness', passed: false, score: 0, issues: [], summary: 'Review failed' },
    criticalIssues: 1,
    highIssues: 0,
    mediumIssues: 0,
    lowIssues: 0,
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    todosAdded: 0,
    todosFixed: 0,
    recommendations: ['Fix review error and retry'],
    blockingIssues: [`Review error: ${error.message}`],
    timestamp: Date.now(),
    duration: Date.now() - startTime,
  };
}

// ============================================================================
// Export convenience functions
// ============================================================================

export {
  runAutomatedPRReview,
  postReviewCommentsToPR,
  fixPRIssues,
  rerunPRReview,
} from './pr-review.js';
