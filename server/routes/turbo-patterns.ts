/**
 * Turbo Patterns API Routes
 *
 * POST /api/turbo/audit        - Run multi-agent audit pipeline on code
 * POST /api/turbo/polish      - Run iterative polish loop (format, lint, test, simplify, review)
 * POST /api/turbo/finalize    - Run post-implementation workflow (polish + learnings + changelog + validate)
 * POST /api/turbo/extract-learnings - Extract learnings from session messages
 * GET  /api/turbo/audit/:id   - Get audit report by ID
 * GET  /api/turbo/polish/:id  - Get polish report by ID
 * GET  /api/turbo/finalize/:id - Get finalize report by ID
 *
 * These endpoints implement the Turbo skill patterns for code quality and continuous improvement.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { rateLimitGeneral } from '../middleware/rate-limit.js';
import { getAuditPipeline } from '../services/audit-pipeline.js';
import { getPolishCodeService } from '../services/polish-code.js';
import { getFinalizeWorkflowService } from '../services/finalize-workflow.js';
import { getSessionLearningExtractor } from '../services/session-learning-extractor.js';
import fs from 'node:fs/promises';
import path from 'node:path';

const app = new Hono();

// Error codes for structured error responses
const ErrorCode = {
  INVALID_REQUEST: 'INVALID_REQUEST',
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  AUDIT_NOT_FOUND: 'AUDIT_NOT_FOUND',
  POLISH_NOT_FOUND: 'POLISH_NOT_FOUND',
  FINALIZE_NOT_FOUND: 'FINALIZE_NOT_FOUND',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  GATEWAY_ERROR: 'GATEWAY_ERROR',
} as const;

// ── Zod schemas ──────────────────────────────────────────────────────

const auditSchema = z.object({
  filePath: z.string().min(1),
  projectPath: z.string().optional(),
  runSecurity: z.boolean().optional().default(true),
  runPerformance: z.boolean().optional().default(true),
  runArchitecture: z.boolean().optional().default(true),
  runTesting: z.boolean().optional().default(true),
});

const polishSchema = z.object({
  filePath: z.string().min(1),
  projectPath: z.string().optional(),
  runFormat: z.boolean().optional().default(true),
  runLint: z.boolean().optional().default(true),
  runTest: z.boolean().optional().default(true),
  runSimplify: z.boolean().optional().default(false),
  runReview: z.boolean().optional().default(false),
});

const finalizeSchema = z.object({
  taskId: z.string().optional(),
  filePaths: z.array(z.string()).optional(),
  extractLearnings: z.boolean().optional().default(true),
  updateChangelog: z.boolean().optional().default(true),
  runTests: z.boolean().optional().default(true),
  commitChanges: z.boolean().optional().default(false),
  commitMessage: z.string().optional(),
});

const extractLearningsSchema = z.object({
  sessionId: z.string().optional(),
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant', 'system']),
      content: z.string(),
      timestamp: z.number().optional(),
    })
  ).optional(),
});

// In-memory report storage (in production, use database or filesystem)
const auditReports = new Map<string, any>();
const polishReports = new Map<string, any>();
const finalizeReports = new Map<string, any>();

/**
 * Generate unique report ID
 */
function generateReportId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ── Routes ────────────────────────────────────────────────────────────

/**
 * POST /api/turbo/audit
 * Run multi-agent audit pipeline on code file.
 */
app.post('/api/turbo/audit', rateLimitGeneral, async (c) => {
  try {
    const body = await c.req.json();
    const parsed = auditSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: 'Invalid request', code: ErrorCode.INVALID_REQUEST, details: parsed.error.flatten() }, 400);
    }

    const { filePath, projectPath, runSecurity, runPerformance, runArchitecture, runTesting } = parsed.data;

    // Read file content for audit
    const fullFilePath = projectPath ? path.join(projectPath, filePath) : filePath;
    let content = '';
    try {
      content = await fs.readFile(fullFilePath, 'utf-8');
    } catch (error) {
      // File might not exist yet (new file), use empty content
      content = '// New file - no content yet';
    }

    const auditService = getAuditPipeline();

    const report = await auditService.audit({
      filePath,
      content,
      changeType: 'modification',
    });

    // Store report for retrieval
    const reportId = generateReportId('audit');
    auditReports.set(reportId, report);

    return c.json({
      success: true,
      report_id: reportId,
      file_path: report.filePath,
      started_at: report.completedAt,
      completed_at: report.completedAt,
      agents: report.results.map(r => r.agent),
      findings: report.results.flatMap(r => r.findings),
      severity_counts: {
        critical: report.totalFindings.critical,
        important: report.totalFindings.important,
        suggestion: report.totalFindings.suggestions,
      },
      suggestions: report.results.flatMap(r => r.findings.map(f => f.suggestion).filter(Boolean) as string[]),
      improvements: report.improvements,
    }, 201);
  } catch (error) {
    console.error('Failed to run audit:', error);
    return c.json({ error: 'Failed to run audit', code: ErrorCode.GATEWAY_ERROR }, 500);
  }
});

/**
 * GET /api/turbo/audit/:id
 * Get audit report by ID.
 */
app.get('/api/turbo/audit/:id', rateLimitGeneral, async (c) => {
  try {
    const reportId = c.req.param('id');
    const report = auditReports.get(reportId);

    if (!report) {
      return c.json({ error: 'Audit report not found', code: ErrorCode.AUDIT_NOT_FOUND }, 404);
    }

    return c.json({
      success: true,
      ...report,
    });
  } catch (error) {
    console.error('Failed to get audit report:', error);
    return c.json({ error: 'Failed to get audit report', code: ErrorCode.GATEWAY_ERROR }, 500);
  }
});

/**
 * POST /api/turbo/polish
 * Run iterative polish loop on code file.
 */
app.post('/api/turbo/polish', rateLimitGeneral, async (c) => {
  try {
    const body = await c.req.json();
    const parsed = polishSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: 'Invalid request', code: ErrorCode.INVALID_REQUEST, details: parsed.error.flatten() }, 400);
    }

    const { filePath, projectPath, runFormat, runLint, runTest, runSimplify, runReview } = parsed.data;

    const polishService = getPolishCodeService();

    const report = await polishService.polish({
      filePath,
      run_format: runFormat,
      run_lint: runLint,
      run_test: runTest,
      run_simplify: runSimplify,
      run_review: runReview,
    });

    // Store report for retrieval
    const reportId = generateReportId('polish');
    polishReports.set(reportId, report);

    return c.json({
      success: true,
      report_id: reportId,
      file_path: report.filePath,
      started_at: report.startedAt,
      completed_at: report.completedAt,
      steps: report.steps,
      overall: report.overall,
      suggestions: report.suggestions,
    }, 201);
  } catch (error) {
    console.error('Failed to run polish:', error);
    return c.json({ error: 'Failed to run polish', code: ErrorCode.GATEWAY_ERROR }, 500);
  }
});

/**
 * GET /api/turbo/polish/:id
 * Get polish report by ID.
 */
app.get('/api/turbo/polish/:id', rateLimitGeneral, async (c) => {
  try {
    const reportId = c.req.param('id');
    const report = polishReports.get(reportId);

    if (!report) {
      return c.json({ error: 'Polish report not found', code: ErrorCode.POLISH_NOT_FOUND }, 404);
    }

    return c.json({
      success: true,
      ...report,
    });
  } catch (error) {
    console.error('Failed to get polish report:', error);
    return c.json({ error: 'Failed to get polish report', code: ErrorCode.GATEWAY_ERROR }, 500);
  }
});

/**
 * POST /api/turbo/finalize
 * Run post-implementation finalize workflow.
 */
app.post('/api/turbo/finalize', rateLimitGeneral, async (c) => {
  try {
    const body = await c.req.json();
    const parsed = finalizeSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: 'Invalid request', code: ErrorCode.INVALID_REQUEST, details: parsed.error.flatten() }, 400);
    }

    const { taskId, filePaths, extractLearnings, updateChangelog, runTests, commitChanges, commitMessage } = parsed.data;

    const finalizeService = getFinalizeWorkflowService();

    const report = await finalizeService.finalize({
      taskId,
      filePaths,
      extractLearnings,
      updateChangelog,
      runTests,
      commitChanges,
      commitMessage,
    });

    // Store report for retrieval
    const reportId = generateReportId('finalize');
    finalizeReports.set(reportId, report);

    return c.json({
      success: true,
      report_id: reportId,
      task_id: report.taskId,
      started_at: report.startedAt,
      completed_at: report.completedAt,
      phases: report.phases,
      overall: report.overall,
      learnings_extracted: report.learningsExtracted,
      improvements_created: report.improvementsCreated,
      changelog_updated: report.changelogUpdated,
    }, 201);
  } catch (error) {
    console.error('Failed to run finalize:', error);
    return c.json({ error: 'Failed to run finalize', code: ErrorCode.GATEWAY_ERROR }, 500);
  }
});

/**
 * GET /api/turbo/finalize/:id
 * Get finalize report by ID.
 */
app.get('/api/turbo/finalize/:id', rateLimitGeneral, async (c) => {
  try {
    const reportId = c.req.param('id');
    const report = finalizeReports.get(reportId);

    if (!report) {
      return c.json({ error: 'Finalize report not found', code: ErrorCode.FINALIZE_NOT_FOUND }, 404);
    }

    return c.json({
      success: true,
      ...report,
    });
  } catch (error) {
    console.error('Failed to get finalize report:', error);
    return c.json({ error: 'Failed to get finalize report', code: ErrorCode.GATEWAY_ERROR }, 500);
  }
});

/**
 * POST /api/turbo/extract-learnings
 * Extract learnings from session messages.
 */
app.post('/api/turbo/extract-learnings', rateLimitGeneral, async (c) => {
  try {
    const body = await c.req.json();
    const parsed = extractLearningsSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: 'Invalid request', code: ErrorCode.INVALID_REQUEST, details: parsed.error.flatten() }, 400);
    }

    const { sessionId, messages } = parsed.data;

    // If sessionId provided but no messages, fetch from session (future implementation)
    // For now, require messages in request
    if (!messages || messages.length === 0) {
      return c.json({
        success: true,
        learnings: [],
        routed: [],
        message: 'No messages provided - connect to session history for actual extraction',
      });
    }

    const extractor = getSessionLearningExtractor();
    const result = await extractor.processSession(messages);

    return c.json({
      success: true,
      learnings: result.learnings,
      routed: result.routed,
    }, 201);
  } catch (error) {
    console.error('Failed to extract learnings:', error);
    return c.json({ error: 'Failed to extract learnings', code: ErrorCode.GATEWAY_ERROR }, 500);
  }
});

/**
 * GET /api/turbo/learnings
 * Get all stored learnings from memory store.
 */
app.get('/api/turbo/learnings', rateLimitGeneral, async (c) => {
  try {
    const { getMemoryStore } = await import('../lib/memory-store.js');
    const memoryStore = getMemoryStore();
    const entries = await memoryStore.getEntries();

    return c.json({
      success: true,
      entries,
    });
  } catch (error) {
    console.error('Failed to get learnings:', error);
    return c.json({ error: 'Failed to get learnings', code: ErrorCode.GATEWAY_ERROR }, 500);
  }
});

/**
 * GET /api/turbo/improvements
 * Get all improvements from backlog.
 */
app.get('/api/turbo/improvements', rateLimitGeneral, async (c) => {
  try {
    const { getImprovementBacklog } = await import('../lib/improvement-backlog.js');
    const backlog = getImprovementBacklog();
    const improvements = await backlog.getAll();

    return c.json({
      success: true,
      improvements,
    });
  } catch (error) {
    console.error('Failed to get improvements:', error);
    return c.json({ error: 'Failed to get improvements', code: ErrorCode.GATEWAY_ERROR }, 500);
  }
});

/**
 * POST /api/turbo/improvements
 * Add improvement to backlog.
 */
app.post('/api/turbo/improvements', rateLimitGeneral, async (c) => {
  try {
    const body = await c.req.json();
    const { getImprovementBacklog } = await import('../lib/improvement-backlog.js');
    const backlog = getImprovementBacklog();

    const improvement = await backlog.add(body);

    return c.json({
      success: true,
      improvement,
    }, 201);
  } catch (error) {
    console.error('Failed to add improvement:', error);
    return c.json({ error: 'Failed to add improvement', code: ErrorCode.GATEWAY_ERROR }, 500);
  }
});

export default app;
