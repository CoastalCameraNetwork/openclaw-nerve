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
  | 'correction'
  | 'repeated-guidance'
  | 'skill-knowledge'
  | 'workflow'
  | 'preference'
  | 'failure-mode'
  | 'domain-knowledge'
  | 'reviewer-feedback';

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
    /should\s+/i,
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
    const learnings: Learning[] = [];

    for (let i = 0; i < messages.length - 1; i++) {
      if (messages[i].role === 'assistant' && messages[i].content.includes('?')) {
        const userResponse = messages[i + 1];
        if (userResponse?.role === 'user' && userResponse.content.length > 50) {
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
        console.log(`[Learning] Routing to skill: ${destination.skillName}`);
        // TODO: Update skill file when skill editing is implemented
        break;
      case 'CLAUDE_MD':
        console.log(`[Learning] Adding to CLAUDE.md section: ${destination.section}`);
        // TODO: Append to CLAUDE.md
        break;
      case 'AUTO_MEMORY': {
        try {
          const memoryStore = getMemoryStore();
          await memoryStore.addEntry({
            topic: destination.topic,
            content: learning.content,
            source: 'session-learning',
            createdAt: Date.now(),
          });
        } catch (error) {
          console.error('[Learning] Failed to add to memory:', error);
        }
        break;
      }
      case 'IMPROVEMENT_BACKLOG': {
        try {
          const backlog = getImprovementBacklog();
          await backlog.add(destination.improvement);
        } catch (error) {
          console.error('[Learning] Failed to add to backlog:', error);
        }
        break;
      }
    }
  }

  async processSession(messages: ConversationMessage[]): Promise<{
    learnings: Learning[];
    routed: Array<{ learning: Learning; destination: LearningDestination }>;
  }> {
    const learnings = this.extract(messages);
    const routed = learnings.map(learning => ({
      learning,
      destination: this.routeLesson(learning),
    }));

    // Apply each learning
    for (const { learning } of routed) {
      await this.applyLearning(learning);
    }

    return { learnings, routed };
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
