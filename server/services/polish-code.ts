/**
 * Polish Code Service
 *
 * Iterative polish loop for code quality:
 * 1. Format (Prettier)
 * 2. Lint (ESLint)
 * 3. Test (Vitest)
 * 4. Simplify (code-simplifier agent)
 * 5. Review (code-reviewer agent)
 *
 * Returns detailed results for each step
 */

import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';

export const PolishStepResultSchema = z.object({
  step: z.string(),
  success: z.boolean(),
  output: z.string(),
  errors: z.array(z.string()),
  duration: z.number(),
});

export type PolishStepResult = z.infer<typeof PolishStepResultSchema>;

export const PolishReportSchema = z.object({
  filePath: z.string(),
  startedAt: z.number(),
  completedAt: z.number(),
  steps: z.array(PolishStepResultSchema),
  overall: z.enum(['success', 'partial', 'failed']),
  suggestions: z.array(z.string()),
});

export type PolishReport = z.infer<typeof PolishReport>;

export interface PolishOptions {
  filePath: string;
  run_format?: boolean;
  run_lint?: boolean;
  run_test?: boolean;
  run_simplify?: boolean;
  run_review?: boolean;
}

interface ExecResult {
  success: boolean;
  partial: boolean;
  stdout: string;
  stderr: string;
}

/**
 * Execute a command and return the result
 * Exported for testing purposes
 */
export async function executeCommand(command: string, cwd: string): Promise<ExecResult> {
  const { exec } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execAsync = promisify(exec);

  try {
    const { stdout, stderr } = await execAsync(command, { cwd });
    return { success: true, partial: false, stdout, stderr };
  } catch (error: any) {
    return {
      success: false,
      partial: true,
      stdout: error.stdout || '',
      stderr: error.stderr || error.message || '',
    };
  }
}

export class PolishCodeService {
  private readonly projectRoot: string;

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = projectRoot;
  }

  /**
   * Run full polish loop on a file
   */
  async polish(options: PolishOptions): Promise<PolishReport> {
    const report: PolishReport = {
      filePath: options.filePath,
      startedAt: Date.now(),
      completedAt: 0,
      steps: [],
      overall: 'success',
      suggestions: [],
    };

    const steps = [
      { name: 'format', enabled: options.run_format ?? true, run: () => this.runFormat(options.filePath) },
      { name: 'lint', enabled: options.run_lint ?? true, run: () => this.runLint(options.filePath) },
      { name: 'test', enabled: options.run_test ?? true, run: () => this.runTests(options.filePath) },
      { name: 'simplify', enabled: options.run_simplify ?? false, run: () => this.runSimplify(options.filePath) },
      { name: 'review', enabled: options.run_review ?? false, run: () => this.runReview(options.filePath) },
    ];

    for (const step of steps) {
      if (!step.enabled) continue;

      const startTime = Date.now();
      try {
        const result = await step.run();
        report.steps.push({
          step: step.name,
          success: result.success,
          output: result.output,
          errors: result.errors,
          duration: Date.now() - startTime,
        });

        if (!result.success) {
          report.overall = result.partial ? 'partial' : 'failed';
          report.suggestions.push(...result.suggestions);
        }
      } catch (error) {
        report.steps.push({
          step: step.name,
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
   * Run Prettier formatting
   */
  async runFormat(filePath: string): Promise<{ success: boolean; partial: boolean; output: string; errors: string[]; suggestions: string[] }> {
    const result = await executeCommand(`npx prettier --write "${filePath}"`, this.projectRoot);

    if (result.success) {
      return {
        success: true,
        partial: false,
        output: result.stdout || result.stderr || 'Formatted successfully',
        errors: [],
        suggestions: [],
      };
    }

    return {
      success: false,
      partial: false,
      output: result.stdout,
      errors: [result.stderr || 'Format failed'],
      suggestions: ['Check for syntax errors in the file'],
    };
  }

  /**
   * Run ESLint
   */
  async runLint(filePath: string): Promise<{ success: boolean; partial: boolean; output: string; errors: string[]; suggestions: string[] }> {
    const result = await executeCommand(`npx eslint "${filePath}" --fix`, this.projectRoot);

    const suggestions: string[] = [];
    const errors: string[] = [];

    if (result.stdout) {
      const lines = result.stdout.split('\n');
      for (const line of lines) {
        if (line.includes(' error ')) {
          errors.push(line.trim());
        } else if (line.includes(' warning ')) {
          suggestions.push(line.trim());
        }
      }
    }

    if (result.stderr && !result.success) {
      errors.push(result.stderr);
    }

    return {
      success: errors.length === 0,
      partial: true,
      output: result.stdout || result.stderr || 'No lint errors',
      errors,
      suggestions: [...suggestions, errors.length > 0 ? 'Run: npx eslint --fix to auto-fix issues' : ''].filter(Boolean),
    };
  }

  /**
   * Run tests related to the file
   */
  async runTests(filePath: string): Promise<{ success: boolean; partial: boolean; output: string; errors: string[]; suggestions: string[] }> {
    const testPath = this.deriveTestPath(filePath);
    const result = await executeCommand(`npm test -- "${testPath}" --run`, this.projectRoot);

    if (result.success) {
      return {
        success: true,
        partial: false,
        output: result.stdout || result.stderr || 'Tests passed',
        errors: [],
        suggestions: [],
      };
    }

    const testExists = await this.fileExists(testPath);
    const suggestions: string[] = [];

    if (!testExists) {
      suggestions.push('Consider adding tests for this file');
    } else {
      suggestions.push('Fix failing tests or update test expectations');
    }

    return {
      success: false,
      partial: true,
      output: result.stdout || '',
      errors: [result.stderr].filter(Boolean),
      suggestions,
    };
  }

  /**
   * Run code simplification (static analysis)
   */
  async runSimplify(filePath: string): Promise<{ success: boolean; partial: boolean; output: string; errors: string[]; suggestions: string[] }> {
    const content = await fs.readFile(filePath, 'utf-8');
    const suggestions: string[] = [];

    // Check for long functions
    const lines = content.split('\n');
    const functionMatches = content.matchAll(/(async\s+)?function\s+\w+\s*\([^)]*\)\s*\{/g);
    for (const match of functionMatches) {
      const startIndex = match.index ?? 0;
      const remainingContent = content.slice(startIndex);
      let braceCount = 1; // Start at 1 because we're already at the opening brace
      let i = 0;
      for (let j = match[0].length; j < remainingContent.length; j++) {
        if (remainingContent[j] === '{') braceCount++;
        if (remainingContent[j] === '}') braceCount--;
        if (braceCount === 0) {
          i = j + 1;
          break;
        }
      }
      const functionLength = remainingContent.slice(0, i).split('\n').length;
      if (functionLength > 50) {
        const lineNumber = lines.slice(0, startIndex).length + 1;
        suggestions.push(`Function at line ${lineNumber} is ${functionLength} lines - consider breaking it up`);
      }
    }

    // Check for deep nesting
    const maxIndentation = lines.reduce((max, line) => {
      const match = line.match(/^(\s*)/);
      const indent = match ? match[1].length : 0;
      return Math.max(max, indent);
    }, 0);

    if (maxIndentation > 16) {
      suggestions.push('Deep nesting detected (more than 4 levels) - consider flattening logic');
    }

    return {
      success: true,
      partial: suggestions.length > 0,
      output: suggestions.length > 0 ? 'Complexity detected' : 'Code looks clean',
      errors: [],
      suggestions,
    };
  }

  /**
   * Run code review (static analysis)
   */
  async runReview(filePath: string): Promise<{ success: boolean; partial: boolean; output: string; errors: string[]; suggestions: string[] }> {
    const content = await fs.readFile(filePath, 'utf-8');
    const suggestions: string[] = [];

    // Check for TODOs
    const todos = content.match(/\/\/\s*(TODO|FIXME|XXX|HACK)/gi);
    if (todos) {
      suggestions.push(`${todos.length} TODO/FIXME comment(s) found - consider addressing them`);
    }

    // Check for console statements
    const consoleLogs = content.match(/console\.(log|error|warn|debug)/g);
    if (consoleLogs) {
      suggestions.push(`${consoleLogs.length} console statement(s) found - remove before production`);
    }

    // Check for magic numbers
    const magicNumbers = content.match(/\b\d{2,}\b/g);
    if (magicNumbers && magicNumbers.length > 0) {
      suggestions.push('Magic numbers detected - consider extracting to named constants');
    }

    // Check for any type
    if (content.includes(': any') || content.includes(':any')) {
      suggestions.push('Avoid using "any" type - use unknown with type guards instead');
    }

    return {
      success: true,
      partial: suggestions.length > 0,
      output: suggestions.length > 0 ? 'Review suggestions' : 'No obvious issues',
      errors: [],
      suggestions,
    };
  }

  /**
   * Derive test file path from source file
   */
  deriveTestPath(sourcePath: string): string {
    const relativePath = path.isAbsolute(sourcePath)
      ? path.relative(this.projectRoot, sourcePath)
      : sourcePath;

    const ext = path.extname(relativePath);
    const base = relativePath.slice(0, -ext.length);
    return `${base}.test${ext}`;
  }

  /**
   * Check if file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Export polish report to markdown
   */
  async exportToMarkdown(report: PolishReport): Promise<string> {
    let md = `# Polish Report: ${path.basename(report.filePath)}\n\n`;
    md += `*Generated: ${new Date(report.completedAt).toISOString()}*\n\n`;

    const statusEmoji = report.overall === 'success' ? '✅' : report.overall === 'partial' ? '⚠️' : '❌';
    md += `**Status:** ${statusEmoji} ${report.overall.toUpperCase()}\n\n`;

    md += `## Steps\n\n`;
    for (const step of report.steps) {
      const emoji = step.success ? '✅' : '❌';
      md += `- ${emoji} **${step.step}** (${step.duration}ms)`;
      if (step.errors.length > 0) {
        md += ` - ${step.errors.length} error(s)`;
      }
      md += '\n';
    }
    md += '\n';

    for (const step of report.steps) {
      md += `### ${step.step.charAt(0).toUpperCase() + step.step.slice(1)}\n\n`;

      if (step.success) {
        md += '*Passed*\n\n';
      } else {
        md += '**Errors:**\n';
        for (const error of step.errors) {
          md += `\`${error}\`\n`;
        }
        md += '\n';
      }

      if (step.output && step.output !== 'Passed') {
        md += '**Output:**\n';
        md += `\`\`\`\n${step.output}\n\`\`\`\n\n`;
      }
    }

    if (report.suggestions.length > 0) {
      md += `## Suggestions\n\n`;
      for (const suggestion of report.suggestions) {
        md += `- ${suggestion}\n`;
      }
      md += '\n';
    }

    return md;
  }
}

// Singleton
let serviceInstance: PolishCodeService | null = null;

export function getPolishCodeService(): PolishCodeService {
  if (!serviceInstance) {
    serviceInstance = new PolishCodeService();
  }
  return serviceInstance;
}
