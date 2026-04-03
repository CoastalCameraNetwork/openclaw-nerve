# Turbo Patterns Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate 5 key patterns from tobihagemann/turbo into Nerve's agent orchestration system.

**Architecture:** Layered skill composition with standard interfaces, self-improvement routing, audit pipeline, finalize workflow, and pluggable agent registry.

**Tech Stack:** TypeScript, Hono routes, React hooks, SSE events, Zod schemas, file-based persistence.

---

## File Structure

### New Files to Create

**Server-side (Backend):**

1. `server/services/session-learning-extractor.ts` - Extract lessons from sessions
2. `server/services/audit-pipeline.ts` - Multi-agent audit orchestration
3. `server/services/polish-code.ts` - Iterative code quality loop
4. `server/services/finalize-workflow.ts` - Post-implementation QA pipeline
5. `server/lib/improvement-backlog.ts` - `.nerve/improvements.md` management
6. `server/routes/audit.ts` - Audit API endpoints
7. `server/routes/learning.ts` - Learning extraction endpoints

**Frontend (UI):**

8. `src/features/audit/AuditDashboard.tsx` - Audit results visualization
9. `src/features/audit/AuditReport.tsx` - Detailed findings report
10. `src/features/learning/LearningExtractor.tsx` - Session learning review UI
11. `src/features/improvements/ImprovementBacklog.tsx` - Improvement backlog UI

**Configuration:**

12. `server/lib/turbo-config.ts` - Turbo pattern configuration
13. `.nerve/README.md` - Nerve improvements directory documentation

### Files to Modify

14. `server/lib/agent-registry.ts` - Add pluggable agent interface, swap support
15. `server/routes/orchestrator.ts` - Add finalize, polish endpoints
16. `src/features/orchestrator/OrchestratorDashboard.tsx` - Add audit button, learning extractor
17. `src/features/memory/MemoryEditor.tsx` - Integrate learning routing
18. `src/components/TopBar.tsx` - Add audit quick-access button (optional)

---

## Task 1: Improvement Backlog Foundation

**Files:**
- Create: `server/lib/improvement-backlog.ts`
- Create: `.nerve/README.md`
- Test: `server/lib/improvement-backlog.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// server/lib/improvement-backlog.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ImprovementBacklog, type Improvement } from './improvement-backlog';

vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(() => JSON.stringify({ improvements: [] })),
}));

describe('ImprovementBacklog', () => {
  let backlog: ImprovementBacklog;

  beforeEach(() => {
    backlog = new ImprovementBacklog('/tmp/.nerve');
  });

  it('should create a new improvement entry', async () => {
    const improvement: Improvement = {
      id: 'test-1',
      summary: 'Add unit tests for auth module',
      location: 'server/routes/auth.ts',
      type: 'testing',
      priority: 'medium',
      createdAt: Date.now(),
      source: 'session-learning',
    };

    await backlog.add(improvement);
    expect(backlog.getAll()).toHaveLength(1);
  });

  it('should mark improvement as completed', async () => {
    const improvement: Improvement = {
      id: 'test-2',
      summary: 'Refactor rate limiter',
      location: 'server/middleware/rate-limit.ts',
      type: 'refactoring',
      priority: 'high',
      createdAt: Date.now(),
      source: 'code-review',
    };

    await backlog.add(improvement);
    await backlog.complete('test-2');
    expect(backlog.get('test-2')?.status).toBe('completed');
  });

  it('should validate improvements before adding', async () => {
    const invalidImprovement = {
      id: 'test-3',
      summary: '', // Empty summary should fail
      location: 'test.ts',
      type: 'testing',
      priority: 'medium',
      createdAt: Date.now(),
      source: 'test',
    };

    await expect(backlog.add(invalidImprovement as any)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /ccn-github/openclaw-nerve && npm test -- server/lib/improvement-backlog.test.ts --run
```

Expected: FAIL - Module not found

- [ ] **Step 3: Write minimal implementation**

```typescript
// server/lib/improvement-backlog.ts
/**
 * Improvement Backlog - Track out-of-scope improvements from sessions
 *
 * Similar to Turbo's .turbo/improvements.md
 * Stores improvements in .nerve/improvements.md (gitignored)
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

    if (await fs.access(this.backlogFile).then(() => true).catch(() => false)) {
      const content = await fs.readFile(this.backlogFile, 'utf-8');
      this.cache = JSON.parse(content);
    } else {
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

    this.cache!.improvements.push(improvement);
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
    const completed = this.cache.improvements.filter(i => i.status === 'completed').length;
    md += `## Summary\n\n- **Pending:** ${pending}\n- **Completed:** ${completed}\n\n`;

    // Pending improvements
    const pendingItems = this.cache.improvements.filter(i => i.status === 'pending');
    if (pendingItems.length > 0) {
      md += '## Pending Improvements\n\n';
      for (const item of pendingItems) {
        md += `### ${item.summary}\n\n`;
        md += `- **Type:** ${item.type}\n`;
        md += `- **Priority:** ${item.priority}\n`;
        if (item.location) md += `- **Location:** ${item.location}\n`;
        if (item.context) md += `- **Context:** ${item.context}\n`;
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /ccn-github/openclaw-nerve && npm test -- server/lib/improvement-backlog.test.ts --run
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/lib/improvement-backlog.ts server/lib/improvement-backlog.test.ts
git commit -m "feat(oracle): add improvement backlog system for tracking session learnings"
```

---

## Task 2: Session Learning Extractor Service

**Files:**
- Create: `server/services/session-learning-extractor.ts`
- Create: `server/services/session-learning-extractor.test.ts`
- Modify: `server/lib/memory-store.ts` (add routing destinations)

- [ ] **Step 1: Write the failing test**

```typescript
// server/services/session-learning-extractor.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionLearningExtractor, type LearningDestination } from './session-learning-extractor';

vi.mock('../lib/memory-store', () => ({
  getMemoryStore: vi.fn(() => ({
    addEntry: vi.fn(),
  })),
}));

vi.mock('../lib/improvement-backlog', () => ({
  getImprovementBacklog: vi.fn(() => ({
    add: vi.fn(),
  })),
}));

describe('SessionLearningExtractor', () => {
  let extractor: SessionLearningExtractor;

  beforeEach(() => {
    extractor = new SessionLearningExtractor();
  });

  it('should detect corrections from conversation', () => {
    const conversation = [
      { role: 'user', content: 'No, not like that - use async/await instead of .then()' },
      { role: 'assistant', content: 'You are right, let me fix that.' },
    ];

    const lessons = extractor.extract(conversation);
    expect(lessons).toHaveLength(1);
    expect(lessons[0].type).toBe('correction');
    expect(lessons[0].content).toContain('async/await');
  });

  it('should route skill corrections to skill destination', () => {
    const lesson = {
      type: 'correction' as const,
      content: 'The /review-code skill should check for null before accessing properties',
      skillInvolved: 'security-reviewer',
    };

    const destination = extractor.routeLesson(lesson);
    expect(destination).toBe('SKILL');
    expect(destination.skillName).toBe('security-reviewer');
  });

  it('should route project conventions to CLAUDE.md', () => {
    const lesson = {
      type: 'preference' as const,
      content: 'Always use kebab-case for file names in server/routes/',
      skillInvolved: null,
    };

    const destination = extractor.routeLesson(lesson);
    expect(destination).toBe('CLAUDE_MD');
  });

  it('should route discovered knowledge to auto memory', () => {
    const lesson = {
      type: 'discovery' as const,
      content: 'The gateway API returns 429 when rate limited, not 400',
      skillInvolved: null,
    };

    const destination = extractor.routeLesson(lesson);
    expect(destination).toBe('AUTO_MEMORY');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /ccn-github/openclaw-nerve && npm test -- server/services/session-learning-extractor.test.ts --run
```

Expected: FAIL - Module not found

- [ ] **Step 3: Write minimal implementation**

```typescript
// server/services/session-learning-extractor.ts
/**
 * Session Learning Extractor
 *
 * Extracts durable lessons from conversation and routes to appropriate destination:
 * - SKILL: Corrections to skill behavior
 * - CLAUDE_MD: Project conventions and decisions
 * - AUTO_MEMORY: Discovered knowledge, API quirks
 * - IMPROVEMENT_BACKLOG: Out-of-scope improvements
 *
 * Inspired by Turbo's /self-improve skill
 */

import { z } from 'zod';
import { getMemoryStore } from '../lib/memory-store';
import { getImprovementBacklog, type Improvement } from '../lib/improvement-backlog';

export type LearningType =
  | 'correction'      // User interrupted/corrected
  | 'repeated-guidance' // Instruction given multiple times
  | 'skill-knowledge' // Domain expertise needed repeatedly
  | 'workflow'        // Successful multi-step procedure
  | 'preference'      // Formatting, naming, style choices
  | 'failure-mode'    // What failed, what worked
  | 'domain-knowledge' // Facts Claude didn't know
  | 'reviewer-feedback' // Human PR review corrections

export type LearningDestination =
  | { type: 'SKILL'; skillName: string }
  | { type: 'CLAUDE_MD'; section: string }
  | { type: 'AUTO_MEMORY'; topic: string }
  | { type: 'IMPROVEMENT_BACKLOG'; improvement: Improvement };

export const LearningSchema = z.object({
  type: z.enum(['correction', 'repeated-guidance', 'skill-knowledge', 'workflow', 'preference', 'failure-mode', 'domain-knowledge', 'reviewer-feedback']),
  content: z.string(),
  skillInvolved: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1),
  conversationContext: z.string().optional(),
});

export type Learning = z.infer<typeof LearningSchema>;

interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
}

export class SessionLearningExtractor {
  private correctionPatterns = [
    /no,?\s+(not|don't|do not)/i,
    /actually,?\s+/i,
    /stop/i,
    /not like that/i,
    /that's wrong/i,
    /incorrect/i,
    /should (be|have|do)/i,
  ];

  private repeatedGuidancePatterns = [
    /always\s+/i,
    /never\s+/i,
    /make sure to/i,
    /remember to/i,
    /don't forget to/i,
  ];

  extract(messages: ConversationMessage[]): Learning[] {
    const learnings: Learning[] = [];

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.role !== 'user') continue;

      const content = msg.content;

      // Detect corrections
      if (this.correctionPatterns.some(p => p.test(content))) {
        const prevAssistant = messages[i - 1]?.role === 'assistant' ? messages[i - 1].content : '';
        learnings.push({
          type: 'correction',
          content,
          confidence: 0.9,
          conversationContext: prevAssistant.slice(0, 200),
        });
      }

      // Detect repeated guidance
      if (this.repeatedGuidancePatterns.some(p => p.test(content))) {
        learnings.push({
          type: 'repeated-guidance',
          content,
          confidence: 0.7,
        });
      }
    }

    // Detect skill-shaped knowledge from patterns
    const skillLearnings = this.extractSkillKnowledge(messages);
    learnings.push(...skillLearnings);

    // Deduplicate similar learnings
    return this.deduplicate(learnings);
  }

  private extractSkillKnowledge(messages: ConversationMessage[]): Learning[] {
    // Look for patterns where Claude asked for clarification and received domain-specific info
    const learnings: Learning[] = [];

    for (let i = 0; i < messages.length - 1; i++) {
      if (messages[i].role === 'assistant' && messages[i].content.includes('?')) {
        const userResponse = messages[i + 1];
        if (userResponse?.role === 'user' && userResponse.content.length > 50) {
          // Likely answered a question with domain knowledge
          learnings.push({
            type: 'skill-knowledge',
            content: userResponse.content.slice(0, 500),
            confidence: 0.6,
          });
        }
      }
    }

    return learnings;
  }

  private deduplicate(learnings: Learning[]): Learning[] {
    const seen = new Set<string>();
    return learnings.filter(l => {
      const key = `${l.type}:${l.content.slice(0, 50)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  routeLesson(learning: Learning): LearningDestination {
    // Skill-first rule: corrections about skills go to the skill
    if (learning.type === 'correction' && learning.skillInvolved) {
      return { type: 'SKILL', skillName: learning.skillInvolved };
    }

    // Workflow learnings often become skills
    if (learning.type === 'workflow') {
      return { type: 'SKILL', skillName: 'workflow-' + Date.now() };
    }

    // Preferences and conventions go to CLAUDE.md
    if (learning.type === 'preference' || learning.type === 'repeated-guidance') {
      return { type: 'CLAUDE_MD', section: 'Conventions' };
    }

    // Domain knowledge without skill home goes to auto memory
    if (learning.type === 'domain-knowledge' || learning.type === 'skill-knowledge') {
      return { type: 'AUTO_MEMORY', topic: 'discovered-knowledge' };
    }

    // Failure modes with actionable fixes
    if (learning.type === 'failure-mode') {
      const improvement: Improvement = {
        id: `improvement-${Date.now()}`,
        summary: learning.content.slice(0, 100),
        type: 'bug-fix',
        priority: 'medium',
        createdAt: Date.now(),
        source: 'session-learning',
        status: 'pending',
        context: learning.content,
      };
      return { type: 'IMPROVEMENT_BACKLOG', improvement };
    }

    // Default to auto memory
    return { type: 'AUTO_MEMORY', topic: 'general' };
  }

  async applyLearning(learning: Learning): Promise<void> {
    const destination = this.routeLesson(learning);

    switch (destination.type) {
      case 'SKILL':
        // TODO: Update skill file
        console.log(`[Learning] Routing to skill: ${destination.skillName}`);
        break;
      case 'CLAUDE_MD':
        // TODO: Append to CLAUDE.md
        console.log(`[Learning] Adding to CLAUDE.md section: ${destination.section}`);
        break;
      case 'AUTO_MEMORY':
        const memoryStore = getMemoryStore();
        await memoryStore.addEntry({
          topic: destination.topic,
          content: learning.content,
          source: 'session-learning',
          createdAt: Date.now(),
        });
        break;
      case 'IMPROVEMENT_BACKLOG':
        const backlog = getImprovementBacklog();
        await backlog.add(destination.improvement);
        break;
    }
  }
}

// Singleton
let extractorInstance: SessionLearningExtractor | null = null;

export function getSessionLearningExtractor(): SessionLearningExtractor {
  if (!extractorInstance) {
    extractorInstance = new SessionLearningExtractor();
  }
  return extractorInstance;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /ccn-github/openclaw-nerve && npm test -- server/services/session-learning-extractor.test.ts --run
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/services/session-learning-extractor.ts server/services/session-learning-extractor.test.ts
git commit -m "feat(learning): add session learning extractor with routing logic"
```

---

## Task 3: Audit Pipeline Service

**Files:**
- Create: `server/services/audit-pipeline.ts`
- Create: `server/services/audit-pipeline.test.ts`
- Create: `server/routes/audit.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// server/services/audit-pipeline.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditPipeline, type AuditScope, type AuditFinding } from './audit-pipeline';

vi.mock('../lib/agent-registry', () => ({
  SPECIALIST_AGENTS: {
    'security-reviewer': { name: 'security-reviewer', domain: 'Security' },
    'quality-reviewer': { name: 'quality-reviewer', domain: 'Quality' },
  },
}));

describe('AuditPipeline', () => {
  let pipeline: AuditPipeline;

  beforeEach(() => {
    pipeline = new AuditPipeline();
  });

  it('should fan out to multiple audit agents in parallel', async () => {
    const scope: AuditScope = {
      paths: ['server/routes/*.ts'],
      exclude: ['node_modules', 'dist'],
    };

    const results = await pipeline.run(scope);

    expect(results.findings).toBeDefined();
    expect(results.categories).toContain('security');
    expect(results.categories).toContain('quality');
  });

  it('should evaluate findings with confidence scoring', async () => {
    const findings: AuditFinding[] = [
      {
        category: 'security',
        severity: 'high',
        location: 'server/routes/auth.ts:45',
        description: 'Potential SQL injection',
        confidence: 0.8,
      },
    ];

    const evaluated = await pipeline.evaluateFindings(findings);
    expect(evaluated).toHaveLength(1);
    expect(evaluated[0].priority).toBeDefined();
  });

  it('should generate markdown report', async () => {
    const scope: AuditScope = { paths: ['src/**/*.ts'] };
    const results = await pipeline.run(scope);

    const report = await pipeline.generateMarkdownReport(results);
    expect(report).toContain('# Audit Report');
    expect(report).toContain('## Dashboard');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /ccn-github/openclaw-nerve && npm test -- server/services/audit-pipeline.test.ts --run
```

Expected: FAIL - Module not found

- [ ] **Step 3: Write implementation**

```typescript
// server/services/audit-pipeline.ts
/**
 * Audit Pipeline - Project-wide health audit
 *
 * Fans out to analysis agents in parallel, evaluates findings,
 * produces unified report at .nerve/audit.md
 *
 * Inspired by Turbo's /audit skill
 */

import { z } from 'zod';
import Glob from 'glob';
import path from 'node:path';
import fs from 'node:fs/promises';
import { getImprovementBacklog, type Improvement } from '../lib/improvement-backlog';
import { invokeGatewayTool } from '../lib/gateway-client';

export interface AuditScope {
  paths: string[];
  exclude?: string[];
  threatModel?: string;
}

export interface AuditFinding {
  category: 'correctness' | 'security' | 'quality' | 'test-coverage' | 'dependencies' | 'tooling' | 'dead-code';
  severity: 'critical' | 'high' | 'medium' | 'low';
  location: string;
  description: string;
  confidence: number;
  suggestion?: string;
  agent: string;
}

export interface AuditResult {
  scope: AuditScope;
  findings: AuditFinding[];
  evaluatedFindings: Array<AuditFinding & { priority: 'P0' | 'P1' | 'P2' | 'P3' }>;
  categories: string[];
  threatModelPresent: boolean;
  generatedAt: number;
}

export class AuditPipeline {
  private readonly auditAgents = [
    { name: 'security-reviewer', category: 'security' as const },
    { name: 'quality-reviewer', category: 'quality' as const },
    // Add more: correctness, test-coverage, dependencies, tooling, dead-code
  ];

  async run(scope: AuditScope): Promise<AuditResult> {
    // Step 1: Glob for source files
    const files = await this.globFiles(scope);

    // Step 2: Check for threat model
    const threatModelPresent = await this.checkThreatModel();

    // Step 3: Fan out to audit agents in parallel
    const agentPromises = this.auditAgents.map(agent =>
      this.runAuditAgent(agent.name, files)
    );

    const agentResults = await Promise.all(agentPromises);

    // Step 4: Combine findings
    const allFindings: AuditFinding[] = agentResults.flatMap(r => r.findings);

    return {
      scope,
      findings: allFindings,
      evaluatedFindings: [], // Populated by evaluateFindings
      categories: [...new Set(allFindings.map(f => f.category))],
      threatModelPresent,
      generatedAt: Date.now(),
    };
  }

  private async globFiles(scope: AuditScope): Promise<string[]> {
    const files: string[] = [];
    const exclude = scope.exclude || ['node_modules', 'dist', 'build', 'vendor'];

    for (const pattern of scope.paths) {
      const matched = await new Promise<string[]>((resolve, reject) => {
        Glob(pattern, { nodir: true }, (err, matches) => {
          if (err) reject(err);
          else resolve(matches);
        });
      });

      // Filter excluded
      const filtered = matched.filter(f =>
        !exclude.some(ex => f.includes(ex))
      );

      files.push(...filtered);
    }

    return files;
  }

  private async checkThreatModel(): Promise<boolean> {
    const threatModelPath = path.join(
      process.env.NERVE_DATA_DIR || './.nerve',
      'threat-model.md'
    );
    try {
      await fs.access(threatModelPath);
      return true;
    } catch {
      return false;
    }
  }

  private async runAuditAgent(
    agentName: string,
    files: string[]
  ): Promise<{ findings: AuditFinding[] }> {
    try {
      // Spawn audit agent via gateway
      const result = await invokeGatewayTool('sessions_spawn', {
        task: `Audit these files for ${agentName} issues: ${files.slice(0, 10).join(', ')}...`,
        label: `audit-${agentName}-${Date.now()}`,
        runtime: 'subagent',
        mode: 'run',
        thinking: 'high',
        cleanup: 'keep',
      }, 60000);

      // Parse agent output into findings
      const findings = this.parseAgentFindings(result, agentName);
      return { findings };
    } catch (error) {
      console.error(`Audit agent ${agentName} failed:`, error);
      return { findings: [] };
    }
  }

  private parseAgentFindings(output: unknown, agentName: string): AuditFinding[] {
    // Parse structured output from agent
    // For now, return empty - would parse markdown/json from agent output
    return [];
  }

  async evaluateFindings(findings: AuditFinding[]): Promise<Array<AuditFinding & { priority: 'P0' | 'P1' | 'P2' | 'P3' }>> {
    return findings.map(finding => ({
      ...finding,
      priority: this.mapSeverityToPriority(finding.severity),
    }));
  }

  private mapSeverityToPriority(severity: string): 'P0' | 'P1' | 'P2' | 'P3' {
    switch (severity) {
      case 'critical': return 'P0';
      case 'high': return 'P1';
      case 'medium': return 'P2';
      case 'low': return 'P3';
      default: return 'P3';
    }
  }

  async generateMarkdownReport(result: AuditResult): Promise<string> {
    let md = '# Audit Report\n\n';
    md += `**Date:** ${new Date(result.generatedAt).toISOString()}\n`;
    md += `**Scope:** ${result.scope.paths.join(', ')}\n\n`;

    // Dashboard
    md += '## Dashboard\n\n';
    md += '| Category | Health | Findings | Critical |\n';
    md += '|---|---|---|---|\n';

    for (const category of result.categories) {
      const catFindings = result.findings.filter(f => f.category === category);
      const critical = catFindings.filter(f => f.severity === 'critical').length;
      const health = critical > 0 ? 'Fail' : catFindings.filter(f => f.severity === 'high').length > 0 ? 'Warn' : 'Pass';

      md += `| ${category} | ${health} | ${catFindings.length} | ${critical} |\n`;
    }

    md += '\n### Health Thresholds\n\n';
    md += '- **Pass** - zero P0/P1 findings\n';
    md += '- **Warn** - P1 findings present but no P0\n';
    md += '- **Fail** - P0 findings present\n\n';

    // Detailed findings
    md += '## Detailed Findings\n\n';
    for (const category of result.categories) {
      md += `### ${category}\n\n`;
      const catFindings = result.findings.filter(f => f.category === category);
      for (const finding of catFindings) {
        md += `- **[${finding.severity.toUpperCase()}]** ${finding.description}\n`;
        md += `  - Location: ${finding.location}\n`;
        if (finding.suggestion) md += `  - Suggestion: ${finding.suggestion}\n`;
      }
      md += '\n';
    }

    return md;
  }

  async saveReport(result: AuditResult): Promise<string> {
    const dataDir = process.env.NERVE_DATA_DIR || './.nerve';
    await fs.mkdir(dataDir, { recursive: true });

    const md = await this.generateMarkdownReport(result);
    const reportPath = path.join(dataDir, 'audit.md');
    await fs.writeFile(reportPath, md, 'utf-8');

    return reportPath;
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
```

- [ ] **Step 4: Commit**

```bash
git add server/services/audit-pipeline.ts server/services/audit-pipeline.test.ts server/routes/audit.ts
git commit -m "feat(audit): add project-wide audit pipeline with parallel agent execution"
```

---

## Task 4: Polish Code Service

**Files:**
- Create: `server/services/polish-code.ts`
- Test: `server/services/polish-code.test.ts`

- [ ] **Step 1-5: Follow same TDD pattern as above**

Implementation outline:

```typescript
// server/services/polish-code.ts
/**
 * Polish Code - Iterative quality improvement loop
 *
 * Stage → format → lint → test → simplify → review → evaluate → apply → smoke test → repeat
 *
 * Inspired by Turbo's /polish-code skill
 */

export class PolishCodeService {
  async run(): Promise<PolishResult> {
    const iterations: string[] = [];

    do {
      await this.stage();
      await this.format();
      await this.lint();
      await this.test();
      const review = await this.review();
      const changes = await this.applyReview(review);
      iterations.push(changes);
    } while (iterations.length < 3); // Max 3 iterations

    return { iterations, success: true };
  }

  private async stage(): Promise<void> { /* ... */ }
  private async format(): Promise<void> { /* ... */ }
  private async lint(): Promise<void> { /* ... */ }
  private async test(): Promise<void> { /* ... */ }
  private async review(): Promise<ReviewResult> { /* ... */ }
  private async applyReview(review: ReviewResult): Promise<string> { /* ... */ }
}
```

---

## Task 5: Finalize Workflow Service

**Files:**
- Create: `server/services/finalize-workflow.ts`
- Test: `server/services/finalize-workflow.test.ts`

- [ ] **Step 1-5: Follow same TDD pattern**

Implementation outline:

```typescript
// server/services/finalize-workflow.ts
/**
 * Finalize Workflow - Post-implementation QA pipeline
 *
 * polish-code → update-changelog → self-improve → commit → PR
 *
 * Inspired by Turbo's /finalize skill
 */

export class FinalizeWorkflow {
  async run(options: FinalizeOptions): Promise<FinalizeResult> {
    const phases = [
      { name: 'polish-code', fn: () => this.runPolishCode() },
      { name: 'update-changelog', fn: () => this.updateChangelog() },
      { name: 'self-improve', fn: () => this.extractLearnings() },
      { name: 'commit', fn: () => this.commitChanges() },
      { name: 'push', fn: () => this.pushChanges() },
    ];

    const results = [];
    for (const phase of phases) {
      const result = await phase.fn();
      results.push({ name: phase.name, result });
    }

    return { phases: results, success: true };
  }
}
```

---

## Task 6: Pluggable Agent Registry

**Files:**
- Modify: `server/lib/agent-registry.ts`

- [ ] **Step: Add pluggable interface**

```typescript
// Add to server/lib/agent-registry.ts

export interface AgentConfig {
  id: string;
  type: AgentType;
  model?: string;
  skills: string[];
  swapWith?: string; // Allow replacement
  custom?: boolean; // Is this a custom/user-defined agent?
}

export function defineAgentRegistry(
  registry: Record<string, AgentConfig>
): Record<string, AgentConfig> {
  return registry;
}

// Example usage:
export const CUSTOM_AGENTS = defineAgentRegistry({
  'custom-security-agent': {
    id: 'custom-security-agent',
    type: 'reviewer',
    skills: ['security-audit', 'threat-model'],
    swapWith: 'security-reviewer',
  },
});
```

---

## Task 7: Frontend Audit Dashboard

**Files:**
- Create: `src/features/audit/AuditDashboard.tsx`
- Create: `src/features/audit/AuditReport.tsx`
- Test: `src/features/audit/AuditDashboard.test.tsx`

---

## Task 8: Frontend Learning Extractor UI

**Files:**
- Create: `src/features/learning/LearningExtractor.tsx`
- Create: `src/features/improvements/ImprovementBacklog.tsx`

---

## Task 9: Integration and Wiring

**Files:**
- Modify: `server/routes/orchestrator.ts`
- Modify: `server/app.ts`
- Modify: `src/features/orchestrator/OrchestratorDashboard.tsx`

---

## Task 10: Documentation

**Files:**
- Create: `.nerve/README.md`
- Create: `docs/turbo-patterns.md`

---

## Testing Strategy

- Unit tests for each service
- Integration tests for pipelines
- E2E tests via Playwright for UI components

## Command Reference

```bash
# Run audit
POST /api/orchestrator/audit { "scope": { "paths": ["server/**/*.ts"] } }

# Run finalize
POST /api/orchestrator/finalize { "taskId": "task-123" }

# Extract learnings
POST /api/orchestrator/extract-learnings { "sessionId": "session-456" }

# View improvements
GET /api/orchestrator/improvements
```

---

## Success Criteria

1. ✅ Improvement backlog stores and retrieves improvements
2. ✅ Learning extractor routes to correct destinations
3. ✅ Audit pipeline runs agents in parallel and produces report
4. ✅ Polish code loop improves code quality iteratively
5. ✅ Finalize workflow completes all phases
6. ✅ Agent registry supports pluggable agents
7. ✅ UI components display audit results and improvements
