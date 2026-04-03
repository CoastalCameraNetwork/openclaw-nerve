/**
 * Improvement Backlog - Track out-of-scope improvements from sessions
 *
 * Similar to Turbo's .turbo/improvements.md
 * Stores improvements in .nerve/improvements.json (gitignored)
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

export const ImprovementSchema = z.object({
  id: z.string(),
  summary: z.string().min(1, 'Summary is required'),
  location: z.string().optional(),
  type: z.enum(['refactoring', 'testing', 'performance', 'documentation', 'feature', 'bug-fix', 'other']),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  createdAt: z.number(),
  completedAt: z.number().optional(),
  source: z.enum(['session-learning', 'code-review', 'audit', 'manual']),
  status: z.enum(['pending', 'in-progress', 'completed', 'rejected']).default('pending'),
  context: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export type Improvement = z.infer<typeof ImprovementSchema>;

interface BacklogStore {
  improvements: Improvement[];
  meta: {
    schemaVersion: number;
    updatedAt: number;
  };
}

export class ImprovementBacklog {
  private readonly backlogFile: string;
  private cache: BacklogStore | null = null;

  constructor(dataDir: string = process.env.NERVE_DATA_DIR || './.nerve') {
    this.backlogFile = path.join(dataDir, 'improvements.json');
  }

  async init(): Promise<void> {
    const dir = path.dirname(this.backlogFile);
    await fs.mkdir(dir, { recursive: true });

    try {
      await fs.access(this.backlogFile);
      const content = await fs.readFile(this.backlogFile, 'utf-8');
      this.cache = JSON.parse(content);
    } catch {
      this.cache = {
        improvements: [],
        meta: { schemaVersion: 1, updatedAt: Date.now() },
      };
      await this.save();
    }
  }

  private async save(): Promise<void> {
    if (!this.cache) throw new Error('Backlog not initialized');
    this.cache.meta.updatedAt = Date.now();
    await fs.writeFile(this.backlogFile, JSON.stringify(this.cache, null, 2), 'utf-8');
  }

  async add(improvement: Improvement): Promise<void> {
    await this.init();
    if (!this.cache) throw new Error('Backlog not initialized');

    // Validate
    ImprovementSchema.parse(improvement);

    // Check for duplicates
    const exists = this.cache.improvements.some(i => i.id === improvement.id);
    if (exists) {
      throw new Error(`Improvement ${improvement.id} already exists`);
    }

    this.cache.improvements.push(improvement);
    await this.save();
  }

  get(id: string): Improvement | undefined {
    return this.cache?.improvements.find(i => i.id === id);
  }

  getAll(status?: Improvement['status']): Improvement[] {
    const improvements = this.cache?.improvements || [];
    if (!status) return [...improvements];
    return improvements.filter(i => i.status === status);
  }

  async complete(id: string): Promise<void> {
    await this.init();
    if (!this.cache) throw new Error('Backlog not initialized');

    const improvement = this.cache.improvements.find(i => i.id === id);
    if (!improvement) {
      throw new Error(`Improvement ${id} not found`);
    }

    improvement.status = 'completed';
    improvement.completedAt = Date.now();
    await this.save();
  }

  async update(id: string, updates: Partial<Improvement>): Promise<void> {
    await this.init();
    if (!this.cache) throw new Error('Backlog not initialized');

    const improvement = this.cache.improvements.find(i => i.id === id);
    if (!improvement) {
      throw new Error(`Improvement ${id} not found`);
    }

    Object.assign(improvement, updates);
    await this.save();
  }

  async remove(id: string): Promise<void> {
    await this.init();
    if (!this.cache) throw new Error('Backlog not initialized');

    const index = this.cache.improvements.findIndex(i => i.id === id);
    if (index === -1) {
      throw new Error(`Improvement ${id} not found`);
    }

    this.cache.improvements.splice(index, 1);
    await this.save();
  }

  async exportToMarkdown(): Promise<string> {
    await this.init();
    if (!this.cache) throw new Error('Backlog not initialized');

    let md = '# Nerve Improvement Backlog\n\n';
    md += `*Generated: ${new Date().toISOString()}*\n\n`;

    // Summary
    const pending = this.cache.improvements.filter(i => i.status === 'pending').length;
    const inProgress = this.cache.improvements.filter(i => i.status === 'in-progress').length;
    const completed = this.cache.improvements.filter(i => i.status === 'completed').length;
    md += `## Summary\n\n- **Pending:** ${pending}\n- **In Progress:** ${inProgress}\n- **Completed:** ${completed}\n\n`;

    // Pending improvements
    const pendingItems = this.cache.improvements.filter(i => i.status === 'pending' || i.status === 'in-progress');
    if (pendingItems.length > 0) {
      md += '## Pending Improvements\n\n';
      for (const item of pendingItems) {
        md += `### ${item.summary}\n\n`;
        md += `- **Type:** ${item.type}\n`;
        md += `- **Priority:** ${item.priority}\n`;
        md += `- **Status:** ${item.status}\n`;
        if (item.location) md += `- **Location:** ${item.location}\n`;
        if (item.context) md += `- **Context:** ${item.context}\n`;
        if (item.tags && item.tags.length > 0) md += `- **Tags:** ${item.tags.join(', ')}\n`;
        md += '\n---\n\n';
      }
    }

    // Completed improvements
    const completedItems = this.cache.improvements.filter(i => i.status === 'completed');
    if (completedItems.length > 0) {
      md += '## Completed Improvements\n\n';
      for (const item of completedItems) {
        md += `### ${item.summary}\n\n`;
        md += `- **Completed:** ${item.completedAt ? new Date(item.completedAt).toISOString() : 'N/A'}\n`;
        md += '\n---\n\n';
      }
    }

    return md;
  }
}

// Singleton instance
let backlogInstance: ImprovementBacklog | null = null;

export function getImprovementBacklog(): ImprovementBacklog {
  if (!backlogInstance) {
    backlogInstance = new ImprovementBacklog();
  }
  return backlogInstance;
}
