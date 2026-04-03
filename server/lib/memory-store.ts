/**
 * Memory Store - Auto-discovered knowledge storage
 *
 * Stores API quirks, domain knowledge, and discovered patterns
 * Similar to Turbo's auto-memory skill
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

export const MemoryEntrySchema = z.object({
  topic: z.string(),
  content: z.string(),
  source: z.enum(['session-learning', 'code-review', 'manual', 'discovery']),
  createdAt: z.number(),
  tags: z.array(z.string()).optional(),
});

export type MemoryEntry = z.infer<typeof MemoryEntrySchema>;

interface MemoryStore {
  entries: MemoryEntry[];
  meta: {
    schemaVersion: number;
    updatedAt: number;
  };
}

export class MemoryStoreClass {
  private readonly memoryFile: string;
  private cache: MemoryStore | null = null;

  constructor(dataDir: string = process.env.NERVE_DATA_DIR || './.nerve') {
    this.memoryFile = path.join(dataDir, 'auto-memory.json');
  }

  async init(): Promise<void> {
    const dir = path.dirname(this.memoryFile);
    await fs.mkdir(dir, { recursive: true });

    try {
      await fs.access(this.memoryFile);
      const content = await fs.readFile(this.memoryFile, 'utf-8');
      this.cache = JSON.parse(content);
    } catch {
      this.cache = {
        entries: [],
        meta: { schemaVersion: 1, updatedAt: Date.now() },
      };
      await this.save();
    }
  }

  private async save(): Promise<void> {
    if (!this.cache) throw new Error('Memory store not initialized');
    this.cache.meta.updatedAt = Date.now();
    await fs.writeFile(this.memoryFile, JSON.stringify(this.cache, null, 2), 'utf-8');
  }

  async addEntry(entry: MemoryEntry): Promise<void> {
    await this.init();
    if (!this.cache) throw new Error('Memory store not initialized');

    MemoryEntrySchema.parse(entry);
    this.cache.entries.push(entry);
    await this.save();
  }

  getEntries(topic?: string): MemoryEntry[] {
    const entries = this.cache?.entries || [];
    if (!topic) return [...entries];
    return entries.filter(e => e.topic === topic);
  }

  search(query: string): MemoryEntry[] {
    const entries = this.cache?.entries || [];
    const lowerQuery = query.toLowerCase();
    return entries.filter(
      e =>
        e.topic.toLowerCase().includes(lowerQuery) ||
        e.content.toLowerCase().includes(lowerQuery)
    );
  }

  async removeEntry(topic: string, contentSubstring?: string): Promise<void> {
    await this.init();
    if (!this.cache) throw new Error('Memory store not initialized');

    const index = this.cache.entries.findIndex(
      e => e.topic === topic && (!contentSubstring || e.content.includes(contentSubstring))
    );

    if (index === -1) {
      throw new Error(`Memory entry not found`);
    }

    this.cache.entries.splice(index, 1);
    await this.save();
  }

  async exportToMarkdown(): Promise<string> {
    await this.init();
    if (!this.cache) throw new Error('Memory store not initialized');

    let md = '# Nerve Auto-Memory\n\n';
    md += `*Generated: ${new Date().toISOString()}*\n\n`;
    md += `**Total Entries:** ${this.cache.entries.length}\n\n`;

    // Group by topic
    const byTopic = new Map<string, MemoryEntry[]>();
    for (const entry of this.cache.entries) {
      const existing = byTopic.get(entry.topic) || [];
      existing.push(entry);
      byTopic.set(entry.topic, existing);
    }

    for (const [topic, entries] of entries(byTopic)) {
      md += `## ${topic}\n\n`;
      for (const entry of entries) {
        md += `- ${entry.content}\n`;
        md += `  - *Source:* ${entry.source} (${new Date(entry.createdAt).toISOString()})\n`;
        if (entry.tags && entry.tags.length > 0) {
          md += `  - *Tags:* ${entry.tags.join(', ')}\n`;
        }
      }
      md += '\n';
    }

    return md;
  }
}

// Singleton instance
let memoryStoreInstance: MemoryStoreClass | null = null;

export function getMemoryStore(): MemoryStoreClass {
  if (!memoryStoreInstance) {
    memoryStoreInstance = new MemoryStoreClass();
  }
  return memoryStoreInstance;
}
