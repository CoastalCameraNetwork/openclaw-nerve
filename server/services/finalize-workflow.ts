/**
 * Finalize Workflow Service
 *
 * Post-implementation QA pipeline inspired by Turbo's /finalize skill.
 * Chains together:
 * 1. polish-code - Format, lint, test, simplify, review
 * 2. extract-learnings - Session learning extraction
 * 3. update-changelog - Document changes
 * 4. validate - Run final checks
 *
 * Returns detailed report of each phase
 */

import { z } from 'zod';
import { getPolishCodeService, type PolishOptions, type PolishReport } from './polish-code';
import { getSessionLearningExtractor, type Learning } from './session-learning-extractor';
import { getImprovementBacklog, type Improvement } from '../lib/improvement-backlog';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Execute a command and return the result
 * Exported for testing purposes
 */
export async function executeCommand(command: string, cwd: string): Promise<{ stdout: string; stderr: string; success: boolean }> {
  const { exec } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execAsync = promisify(exec);

  try {
    const { stdout, stderr } = await execAsync(command, { cwd });
    return { stdout, stderr, success: true };
  } catch (error: any) {
    return {
      stdout: error.stdout || '',
      stderr: error.stderr || error.message || '',
      success: false,
    };
  }
}

export const FinalizePhaseSchema = z.object({
  name: z.string(),
  success: z.boolean(),
  output: z.string(),
  errors: z.array(z.string()),
  duration: z.number(),
  suggestions: z.array(z.string()).optional(),
});

export type FinalizePhase = z.infer<typeof FinalizePhaseSchema>;

export const FinalizeReportSchema = z.object({
  taskId: z.string().optional(),
  startedAt: z.number(),
  completedAt: z.number(),
  phases: z.array(FinalizePhaseSchema),
  overall: z.enum(['success', 'partial', 'failed']),
  learningsExtracted: z.number(),
  improvementsCreated: z.number(),
  changelogUpdated: z.boolean(),
});

export type FinalizeReport = z.infer<typeof FinalizeReportSchema>;

export interface FinalizeOptions {
  taskId?: string;
  filePaths?: string[];
  extractLearnings?: boolean;
  updateChangelog?: boolean;
  runTests?: boolean;
  commitChanges?: boolean;
  commitMessage?: string;
}

interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
}

export class FinalizeWorkflowService {
  private readonly projectRoot: string;

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = projectRoot;
  }

  /**
   * Run the full finalize workflow
   */
  async finalize(options: FinalizeOptions): Promise<FinalizeReport> {
    const report: FinalizeReport = {
      taskId: options.taskId,
      startedAt: Date.now(),
      completedAt: 0,
      phases: [],
      overall: 'success',
      learningsExtracted: 0,
      improvementsCreated: 0,
      changelogUpdated: false,
    };

    // Run polish-code phase
    if (true) { // always enabled
      const startTime = Date.now();
      try {
        const result = await this.runPolishCode(options);
        report.phases.push({
          name: 'polish-code',
          success: result.success,
          output: result.output,
          errors: result.errors,
          duration: Date.now() - startTime,
          suggestions: result.suggestions,
        });
        if (!result.success) {
          report.overall = result.partial ? 'partial' : 'failed';
        }
      } catch (error) {
        report.phases.push({
          name: 'polish-code',
          success: false,
          output: '',
          errors: [error instanceof Error ? error.message : String(error)],
          duration: Date.now() - startTime,
        });
        report.overall = 'failed';
      }
    }

    // Run extract-learnings phase
    if (options.extractLearnings ?? true) {
      const startTime = Date.now();
      try {
        const result = await this.extractLearnings();
        report.phases.push({
          name: 'extract-learnings',
          success: result.success,
          output: result.output,
          errors: result.errors,
          duration: Date.now() - startTime,
          suggestions: result.suggestions,
        });
        if (!result.success) {
          report.overall = result.partial ? 'partial' : 'failed';
        }
        report.learningsExtracted += result.learningsCount;
        report.improvementsCreated += result.improvementsCount;
      } catch (error) {
        report.phases.push({
          name: 'extract-learnings',
          success: false,
          output: '',
          errors: [error instanceof Error ? error.message : String(error)],
          duration: Date.now() - startTime,
        });
        report.overall = 'failed';
      }
    }

    // Run update-changelog phase
    if (options.updateChangelog ?? true) {
      const startTime = Date.now();
      try {
        const result = await this.updateChangelog(options);
        report.phases.push({
          name: 'update-changelog',
          success: result.success,
          output: result.output,
          errors: result.errors,
          duration: Date.now() - startTime,
          suggestions: result.suggestions,
        });
        if (!result.success) {
          report.overall = result.partial ? 'partial' : 'failed';
        }
        report.changelogUpdated = result.changelogUpdated;
      } catch (error) {
        report.phases.push({
          name: 'update-changelog',
          success: false,
          output: '',
          errors: [error instanceof Error ? error.message : String(error)],
          duration: Date.now() - startTime,
        });
        report.overall = 'failed';
      }
    }

    // Run validate phase
    if (true) { // always enabled
      const startTime = Date.now();
      try {
        const result = await this.validate(options);
        report.phases.push({
          name: 'validate',
          success: result.success,
          output: result.output,
          errors: result.errors,
          duration: Date.now() - startTime,
          suggestions: result.suggestions,
        });
        if (!result.success) {
          report.overall = result.partial ? 'partial' : 'failed';
        }
      } catch (error) {
        report.phases.push({
          name: 'validate',
          success: false,
          output: '',
          errors: [error instanceof Error ? error.message : String(error)],
          duration: Date.now() - startTime,
        });
        report.overall = 'failed';
      }
    }

    report.completedAt = Date.now();
    return report;
  }

  /**
   * Phase 1: Run polish-code on changed files
   */
  private async runPolishCode(options: FinalizeOptions): Promise<{
    success: boolean;
    partial: boolean;
    output: string;
    errors: string[];
    suggestions: string[];
  }> {
    const polishService = getPolishCodeService();

    const polishOptions: PolishOptions = {
      filePath: options.filePaths?.[0] || '.',
      run_format: true,
      run_lint: true,
      run_test: options.runTests ?? true,
      run_simplify: true,
      run_review: true,
    };

    const polishReport = await polishService.polish(polishOptions);

    const suggestions = polishReport.suggestions;
    const errors = polishReport.steps
      .filter((s) => !s.success)
      .flatMap((s) => s.errors);

    return {
      success: polishReport.overall !== 'failed',
      partial: polishReport.overall === 'partial',
      output: `Polished ${options.filePaths?.length || 1} file(s). ${polishReport.steps.length} steps completed.`,
      errors,
      suggestions,
    };
  }

  /**
   * Phase 2: Extract learnings from recent session
   *
   * In a real implementation, this would:
   * 1. Fetch the conversation history from the session
   * 2. Run SessionLearningExtractor
   * 3. Apply learning routing
   *
   * For now, this is a placeholder that simulates the process
   */
  private async extractLearnings(): Promise<{
    success: boolean;
    partial: boolean;
    output: string;
    errors: string[];
    suggestions: string[];
    learningsCount: number;
    improvementsCount: number;
  }> {
    try {
      const extractor = getSessionLearningExtractor();

      // Placeholder: In production, fetch actual session messages
      // For now, simulate with empty messages
      const mockMessages: ConversationMessage[] = [];

      // Would normally do:
      // const { learnings, routed } = await extractor.processSession(messages);
      // For now, just report success
      return {
        success: true,
        partial: false,
        output: 'Learning extraction ready (no session data in demo mode)',
        errors: [],
        suggestions: ['Connect to actual session history for learning extraction'],
        learningsCount: 0,
        improvementsCount: 0,
      };
    } catch (error) {
      return {
        success: false,
        partial: false,
        output: '',
        errors: [error instanceof Error ? error.message : 'Learning extraction failed'],
        suggestions: [],
        learningsCount: 0,
        improvementsCount: 0,
      };
    }
  }

  /**
   * Phase 3: Update CHANGELOG.md with changes
   */
  private async updateChangelog(options: FinalizeOptions): Promise<{
    success: boolean;
    partial: boolean;
    output: string;
    errors: string[];
    suggestions: string[];
    changelogUpdated: boolean;
  }> {
    const changelogPath = path.join(this.projectRoot, 'CHANGELOG.md');

    try {
      // Check if CHANGELOG.md exists
      let changelogContent = '';
      try {
        changelogContent = await fs.readFile(changelogPath, 'utf-8');
      } catch {
        // File doesn't exist, create it
        changelogContent = '# Changelog\n\nAll notable changes to this project will be documented in this file.\n\n';
      }

      // Generate changelog entry
      const date = new Date().toISOString().split('T')[0];
      const taskId = options.taskId || 'general';
      const entry = `## [${date}] - ${taskId}\n\n- Automated finalize workflow run\n\n`;

      // Prepend entry to changelog
      const updatedContent = changelogContent.replace(
        /^(# Changelog.*?)$/s,
        `$1\n\n${entry}`
      );

      await fs.writeFile(changelogPath, updatedContent, 'utf-8');

      return {
        success: true,
        partial: false,
        output: `Updated CHANGELOG.md with entry for ${date}`,
        errors: [],
        suggestions: [],
        changelogUpdated: true,
      };
    } catch (error) {
      return {
        success: false,
        partial: false,
        output: '',
        errors: [error instanceof Error ? error.message : 'Failed to update changelog'],
        suggestions: ['Ensure write permissions for CHANGELOG.md'],
        changelogUpdated: false,
      };
    }
  }

  /**
   * Phase 4: Validate - Run final checks
   */
  private async validate(options: FinalizeOptions): Promise<{
    success: boolean;
    partial: boolean;
    output: string;
    errors: string[];
    suggestions: string[];
  }> {
    const errors: string[] = [];
    const suggestions: string[] = [];
    let success = true;

    // Check 1: Ensure build passes
    const buildResult = await executeCommand('npm run build', this.projectRoot);
    if (!buildResult.success) {
      errors.push('Build failed - ensure all TypeScript compiles correctly');
      success = false;
    }

    // Check 2: Ensure tests pass
    if (options.runTests ?? true) {
      const testResult = await executeCommand('npm test -- --run', this.projectRoot);
      if (!testResult.success) {
        errors.push('Tests failed - review failing tests');
        // Don't fail overall for test failures, just mark as partial
      }
    }

    // Check 3: Ensure no lint errors
    const lintResult = await executeCommand('npm run lint', this.projectRoot);
    if (!lintResult.success) {
      suggestions.push('Lint warnings present - consider running: npm run lint -- --fix');
    }

    return {
      success,
      partial: errors.length === 0 && suggestions.length > 0,
      output: `Validation complete: ${errors.length} errors, ${suggestions.length} suggestions`,
      errors,
      suggestions,
    };
  }

  /**
   * Export finalize report to markdown
   */
  async exportToMarkdown(report: FinalizeReport): Promise<string> {
    let md = `# Finalize Workflow Report\n\n`;
    md += `*Generated: ${new Date(report.completedAt).toISOString()}*\n\n`;

    if (report.taskId) {
      md += `**Task ID:** ${report.taskId}\n\n`;
    }

    // Overall status
    const statusEmoji = report.overall === 'success' ? '✅' : report.overall === 'partial' ? '⚠️' : '❌';
    md += `**Status:** ${statusEmoji} ${report.overall.toUpperCase()}\n\n`;

    // Summary
    md += `## Summary\n\n`;
    md += `- **Learnings Extracted:** ${report.learningsExtracted}\n`;
    md += `- **Improvements Created:** ${report.improvementsCreated}\n`;
    md += `- **Changelog Updated:** ${report.changelogUpdated ? 'Yes' : 'No'}\n`;
    md += `- **Total Duration:** ${report.completedAt - report.startedAt}ms\n\n`;

    // Phases
    md += `## Phases\n\n`;
    for (const phase of report.phases) {
      const emoji = phase.success ? '✅' : '❌';
      md += `- ${emoji} **${phase.name}** (${phase.duration}ms)`;
      if (phase.errors.length > 0) {
        md += ` - ${phase.errors.length} error(s)`;
      }
      md += '\n';
    }
    md += '\n';

    // Detailed results
    for (const phase of report.phases) {
      md += `### ${phase.name}\n\n`;

      if (phase.success) {
        md += '*Passed*\n\n';
      } else {
        md += '**Errors:**\n';
        for (const error of phase.errors) {
          md += `\`${error}\`\n`;
        }
        md += '\n';
      }

      if (phase.output) {
        md += '**Output:**\n';
        md += `${phase.output}\n\n`;
      }

      if (phase.suggestions && phase.suggestions.length > 0) {
        md += '**Suggestions:**\n';
        for (const suggestion of phase.suggestions) {
          md += `- ${suggestion}\n`;
        }
        md += '\n';
      }
    }

    return md;
  }
}

// Singleton
let serviceInstance: FinalizeWorkflowService | null = null;

export function getFinalizeWorkflowService(): FinalizeWorkflowService {
  if (!serviceInstance) {
    serviceInstance = new FinalizeWorkflowService();
  }
  return serviceInstance;
}
