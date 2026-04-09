/**
 * GitHub PR Service
 * 
 * Handles automatic branch creation, commits, and PR management for tasks.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs';
import * as path from 'node:path';

const execAsync = promisify(exec);

export interface PRInfo {
  number: number;
  url: string;
  branch: string;
  status: 'open' | 'closed' | 'merged' | 'draft';
  reviewComments?: number;
  commits?: number;
  createdAt?: number;
  updatedAt?: number;
}

/**
 * Get GitHub token from environment or config
 */
function getGitHubToken(): string {
  return process.env.GITHUB_TOKEN || '';
}

/**
 * Get GitHub owner/repo from environment
 */
function getGitHubRepo(): { owner: string; repo: string } {
  const repo = process.env.GITHUB_REPO || 'CoastalCameraNetwork/mgmt';
  const [owner, repoName] = repo.split('/');
  return { owner, repo: repoName };
}

/**
 * Create a branch for a task
 */
export async function createBranch(taskId: string, taskTitle: string, workingDir: string): Promise<string> {
  const branchName = `task/${taskId}-${Date.now()}`;
  
  await execAsync(`git checkout -b ${branchName}`, { cwd: workingDir });
  
  return branchName;
}

/**
 * Commit all changes in working directory
 */
export async function commitChanges(workingDir: string, message: string): Promise<void> {
  await execAsync('git add -A', { cwd: workingDir });

  // Check if there are any changes to commit
  const { stdout: status } = await execAsync('git status --porcelain', { cwd: workingDir });
  if (!status.trim()) {
    console.log('[git] No changes to commit, skipping commit');
    return;
  }

  await execAsync(`git commit -m "${message.replace(/"/g, '\\"')}"`, { cwd: workingDir });
}

/**
 * Push branch to GitHub
 */
export async function pushBranch(branchName: string, workingDir: string): Promise<void> {
  // Fetch latest main to ensure we're up to date before pushing
  await execAsync('git fetch origin main', { cwd: workingDir });
  await execAsync(`git push -u origin ${branchName}`, { cwd: workingDir });
}

/**
 * Create a PR via GitHub API
 */
export async function createPR(
  title: string,
  body: string,
  branch: string,
  baseBranch: string = 'main'
): Promise<PRInfo> {
  const token = getGitHubToken();
  const { owner, repo } = getGitHubRepo();
  
  if (!token) {
    throw new Error('GITHUB_TOKEN not set');
  }
  
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      title,
      body,
      head: branch,
      base: baseBranch,
      draft: false,
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create PR: ${response.status} ${error}`);
  }
  
  const data = await response.json() as any;
  
  return {
    number: data.number,
    url: data.html_url,
    branch,
    status: 'open' as const,
    reviewComments: 0,
    commits: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/**
 * Get PR status and review comments
 */
export async function getPRStatus(prNumber: number): Promise<PRInfo> {
  const token = getGitHubToken();
  const { owner, repo } = getGitHubRepo();
  
  if (!token) {
    throw new Error('GITHUB_TOKEN not set');
  }
  
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to get PR status: ${response.status}`);
  }
  
  const data = await response.json() as any;
  
  // Get review comments count
  const commentsResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/comments`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
    },
  });
  
  let reviewComments = 0;
  if (commentsResponse.ok) {
    const comments = await commentsResponse.json() as any[];
    reviewComments = Array.isArray(comments) ? comments.length : 0;
  }
  
  return {
    number: data.number,
    url: data.html_url,
    branch: data.head.ref,
    status: data.merged_at ? 'merged' as const : data.closed_at ? 'closed' as const : data.draft ? 'draft' as const : 'open' as const,
    reviewComments,
    commits: data.commits,
    createdAt: new Date(data.created_at).getTime(),
    updatedAt: new Date(data.updated_at).getTime(),
  };
}

/**
 * Get PR review comments for agent to fix
 */
export async function getPRComments(prNumber: number): Promise<Array<{
  id: number;
  body: string;
  path: string;
  line?: number;
  createdAt: string;
}>> {
  const token = getGitHubToken();
  const { owner, repo } = getGitHubRepo();
  
  if (!token) {
    return [];
  }
  
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/comments`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
    },
  });
  
  if (!response.ok) {
    return [];
  }
  
  const comments = await response.json() as any[];
  return comments.map((c: any) => ({
    id: c.id,
    body: c.body,
    path: c.path,
    line: c.line,
    createdAt: c.created_at,
  }));
}

/**
 * Merge a PR
 */
export async function mergePR(prNumber: number, commitTitle?: string): Promise<void> {
  const token = getGitHubToken();
  const { owner, repo } = getGitHubRepo();
  
  if (!token) {
    throw new Error('GITHUB_TOKEN not set');
  }
  
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/merge`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
    },
    body: JSON.stringify({
      commit_title: commitTitle || `Merge PR #${prNumber}`,
      merge_method: 'squash',
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to merge PR: ${response.status} ${error}`);
  }
}

/**
 * Close a PR
 */
export async function closePR(prNumber: number): Promise<void> {
  const token = getGitHubToken();
  const { owner, repo } = getGitHubRepo();
  
  if (!token) {
    throw new Error('GITHUB_TOKEN not set');
  }
  
  await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
    },
    body: JSON.stringify({
      state: 'closed',
    }),
  });
}

/**
 * Complete Git workflow for a task:
 * 1. Commit changes (worktree already on correct branch)
 * 2. Push branch
 * 3. Create PR
 */
export async function completeGitWorkflow(
  taskId: string,
  taskTitle: string,
  taskDescription: string,
  workingDir: string
): Promise<PRInfo> {
  // Get the current branch name from the worktree
  const { stdout: branch } = await execAsync('git branch --show-current', { cwd: workingDir });
  const branchName = branch.trim();

  console.log(`[git] Working directory ${workingDir} is on branch ${branchName}`);

  // Commit changes
  await commitChanges(workingDir, `${taskTitle}\n\nTask: ${taskId}\n${taskDescription?.substring(0, 200) || ''}`);

  // Push branch
  await pushBranch(branchName, workingDir);

  // Create PR
  const pr = await createPR(
    taskTitle,
    `**Task:** ${taskId}\n\n${taskDescription || 'No description'}`,
    branchName
  );

  return pr;
}

/**
 * Create a git worktree for isolated task execution.
 * Worktrees are created under /tmp/nerve-worktrees/task-{taskId}-{timestamp}
 *
 * IMPORTANT: Fetches latest origin/main before creating worktree to ensure
 * the task branches from the most recent main, avoiding conflicts with
 * recently merged PRs.
 *
 * @param taskId - Unique task identifier
 * @param taskTitle - Task title for reference
 * @param baseBranch - Base branch to checkout (default: 'main')
 * @param repoPath - Optional repository path (defaults to current working directory's repo)
 * @returns Path to the created worktree
 */
export async function createWorktree(
  taskId: string,
  taskTitle: string,
  baseBranch: string = 'main',
  repoPath?: string // Optional repository path (defaults to current working directory's repo)
): Promise<string> {
  const worktreesDir = '/tmp/nerve-worktrees';
  const timestamp = Date.now();
  const worktreePath = path.join(worktreesDir, `task-${taskId}-${timestamp}`);

  try {
    // Create worktrees directory if it doesn't exist
    await fs.promises.mkdir(worktreesDir, { recursive: true });

    // Get the repository root - use provided repoPath or detect from current directory
    const repoRootPath = repoPath || (await execAsync('git rev-parse --show-toplevel')).stdout.trim();

    // CRITICAL: Fetch latest origin/main to avoid branching from stale main
    console.log(`[git] Fetching latest origin/${baseBranch} before creating worktree...`);
    await execAsync(`git fetch origin ${baseBranch}`, { cwd: repoRootPath });

    // Create the worktree, checking out the base branch
    // Using -b to create a new branch for this task
    const branchName = `task/${taskId}`;
    await execAsync(`git worktree add -b ${branchName} "${worktreePath}" origin/${baseBranch}`, {
      cwd: repoRootPath,
    });

    console.log(`Created worktree at ${worktreePath} for task ${taskId} on branch ${branchName} (from origin/${baseBranch})`);
    return worktreePath;
  } catch (error) {
    console.error(`Failed to create worktree for task ${taskId}:`, error);
    throw new Error(`Worktree creation failed: ${(error as Error).message}`);
  }
}

/**
 * Clean up a git worktree after branch is pushed.
 * Removes the worktree directory and unregisters it from git.
 *
 * @param worktreePath - Path to the worktree to clean up
 */
export async function cleanupWorktree(worktreePath: string): Promise<void> {
  try {
    // Get the repository root
    const { stdout: repoRoot } = await execAsync('git rev-parse --show-toplevel');
    const repoRootPath = repoRoot.trim();

    // Remove the worktree (git worktree remove also cleans up the directory)
    await execAsync(`git worktree remove "${worktreePath}"`, {
      cwd: repoRootPath,
    });

    console.log(`Cleaned up worktree at ${worktreePath}`);
  } catch (error) {
    // If git worktree remove fails, try to remove the directory directly
    try {
      await fs.promises.rm(worktreePath, { recursive: true, force: true });
      console.log(`Force removed worktree directory at ${worktreePath}`);
    } catch (rmError) {
      console.error(`Failed to cleanup worktree at ${worktreePath}:`, rmError);
    }
  }
}

/**
 * Check for potential migration number conflicts in the mgmt repo.
 * Scans existing migrations and returns warnings if new migrations would conflict.
 *
 * @param worktreePath - Path to the worktree to check
 * @param projectPath - Path to the project root (mgmt repo)
 * @returns Array of warning messages, empty if no conflicts
 */
export async function checkMigrationConflicts(
  worktreePath: string,
  projectPath: string
): Promise<string[]> {
  const warnings: string[] = [];

  try {
    // Find all existing migration files in the project
    const migrationsGlob = await execAsync(
      `find "${projectPath}" -path '*/db/migrations/*.sql' -type f 2>/dev/null || echo ""`,
      { cwd: worktreePath }
    );

    const migrationFiles = migrationsGlob.stdout
      .split('\n')
      .filter((f) => f.trim() && f.endsWith('.sql'));

    // Extract migration numbers (e.g., 0008 from 0008_migration_name.sql)
    const migrationNumbers = new Set<string>();
    for (const file of migrationFiles) {
      const basename = path.basename(file);
      const match = basename.match(/^(\d{4})_/);
      if (match) {
        migrationNumbers.add(match[1]);
      }
    }

    console.log(`[git] Found ${migrationNumbers.size} existing migrations: ${Array.from(migrationNumbers).sort().join(', ')}`);

    // Check for uncommitted new migration files in the worktree
    const { stdout: uncommittedMigrations } = await execAsync(
      'git status --porcelain -- "*.sql" 2>/dev/null || echo ""',
      { cwd: worktreePath }
    );

    const newMigrations = uncommittedMigrations
      .split('\n')
      .filter((line) => {
        // Lines starting with '?' are untracked, 'A' or 'M' are staged/modified
        const status = line.substring(0, 2).trim();
        return (status === '?' || status === 'A' || status === 'M') &&
               line.includes('migration') &&
               line.endsWith('.sql');
      });

    for (const migrationLine of newMigrations) {
      // Extract filename from git status output (format: "?? path/to/file.sql")
      const filePath = migrationLine.substring(2).trim();
      const basename = path.basename(filePath);
      const match = basename.match(/^(\d{4})_/);

      if (match) {
        const num = match[1];
        if (migrationNumbers.has(num)) {
          warnings.push(
            `MIGRATION CONFLICT: Migration ${basename} uses number ${num} which already exists. ` +
            `Consider renumbering to ${String(parseInt(num) + 1).padStart(4, '0')}_*`
          );
        }
      }
    }

    if (warnings.length > 0) {
      console.warn('[git] Migration conflict warnings:', warnings);
    }
  } catch (error) {
    console.error('[git] Failed to check migration conflicts:', error);
  }

  return warnings;
}

/**
 * Check if new routes are properly registered in the Fastify server.
 * Scans for new route files and verifies they're imported in server.ts.
 *
 * @param worktreePath - Path to the worktree to check
 * @param projectPath - Path to the project root
 * @returns Array of warning messages, empty if all routes registered
 */
export async function checkRouteRegistration(
  worktreePath: string,
  projectPath: string
): Promise<string[]> {
  const warnings: string[] = [];

  try {
    // Read server.ts to find existing route imports
    const serverPath = path.join(projectPath, 'server', 'server.ts');
    const serverContent = await fs.promises.readFile(serverPath, 'utf-8');

    // Find all route imports (patterns like: import ... from './routes/xxx')
    const routeImportRegex = /import\s+.*?\s+from\s+['"]\.\/routes\/([^'"]+)['"]/g;
    const registeredRoutes = new Set<string>();
    let match;

    while ((match = routeImportRegex.exec(serverContent)) !== null) {
      registeredRoutes.add(match[1]);
    }

    console.log(`[git] Found ${registeredRoutes.size} registered routes: ${Array.from(registeredRoutes).join(', ')}`);

    // Find new route files in the worktree
    const { stdout: routeFiles } = await execAsync(
      'find server/routes -name "*.ts" -type f 2>/dev/null | grep -v ".test.ts" | grep -v ".d.ts" || echo ""',
      { cwd: worktreePath }
    );

    const routeFileList = routeFiles
      .split('\n')
      .filter((f) => f.trim());

    for (const routeFile of routeFileList) {
      const basename = path.basename(routeFile, '.ts');
      if (basename === 'server' || basename === 'index') {
        continue; // Skip server.ts and index files
      }

      if (!registeredRoutes.has(basename)) {
        // Check if it's a known built-in route that doesn't need registration
        const builtinRoutes = ['app', 'index', 'types', 'health'];
        if (!builtinRoutes.includes(basename)) {
          warnings.push(
            `ROUTE NOT REGISTERED: ${basename}.ts exists but is not imported in server.ts. ` +
            `Add: import { ${basename}Routes } from './routes/${basename}'; app.register(${basename}Routes);`
          );
        }
      }
    }

    if (warnings.length > 0) {
      console.warn('[git] Route registration warnings:', warnings);
    }
  } catch (error) {
    console.error('[git] Failed to check route registration:', error);
  }

  return warnings;
}
