/**
 * Session Learning Extractor Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SessionLearningExtractor, type Learning, type LearningDestination } from './session-learning-extractor';
import { getImprovementBacklog } from '../lib/improvement-backlog';
import { getMemoryStore } from '../lib/memory-store';

// Mock dependencies
vi.mock('../lib/improvement-backlog', () => ({
  getImprovementBacklog: vi.fn(() => ({
    add: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('../lib/memory-store', () => ({
  getMemoryStore: vi.fn(() => ({
    addEntry: vi.fn().mockResolvedValue(undefined),
  })),
}));

describe('SessionLearningExtractor', () => {
  let extractor: SessionLearningExtractor;

  beforeEach(() => {
    extractor = new SessionLearningExtractor();
  });

  describe('extract', () => {
    it('should detect correction patterns', () => {
      const messages = [
        { role: 'assistant' as const, content: 'I will use the default config.' },
        { role: 'user' as const, content: 'No, not like that. Use the custom config instead.' },
      ];

      const learnings = extractor.extract(messages);

      expect(learnings).toHaveLength(1);
      expect(learnings[0].type).toBe('correction');
      expect(learnings[0].content).toContain('No, not like that');
      expect(learnings[0].confidence).toBe(0.9);
    });

    it('should detect "stop" corrections', () => {
      const messages = [
        { role: 'assistant' as const, content: 'Starting the process...' },
        { role: 'user' as const, content: 'Stop, that will break things.' },
      ];

      const learnings = extractor.extract(messages);

      expect(learnings).toHaveLength(1);
      expect(learnings[0].type).toBe('correction');
    });

    it('should detect "should" corrections', () => {
      const messages = [
        { role: 'assistant' as const, content: 'Using console.log for debugging.' },
        { role: 'user' as const, content: 'You should use proper logging instead.' },
      ];

      const learnings = extractor.extract(messages);

      expect(learnings).toHaveLength(1);
      expect(learnings[0].type).toBe('correction');
    });

    it('should detect repeated guidance patterns', () => {
      const messages = [
        { role: 'user' as const, content: 'Always validate user input before processing.' },
      ];

      const learnings = extractor.extract(messages);

      expect(learnings).toHaveLength(1);
      expect(learnings[0].type).toBe('repeated-guidance');
      expect(learnings[0].confidence).toBe(0.7);
    });

    it('should detect "never" patterns', () => {
      const messages = [
        { role: 'user' as const, content: 'Never commit .env files to git.' },
      ];

      const learnings = extractor.extract(messages);

      expect(learnings).toHaveLength(1);
      expect(learnings[0].type).toBe('repeated-guidance');
    });

    it('should extract skill-knowledge from Q&A patterns', () => {
      const messages = [
        { role: 'assistant' as const, content: 'How should I handle authentication?' },
        {
          role: 'user' as const,
          content: 'We use JWT tokens stored in httpOnly cookies. The token expires after 24 hours and must be refreshed using the refresh endpoint.',
        },
      ];

      const learnings = extractor.extract(messages);

      const skillLearning = learnings.find(l => l.type === 'skill-knowledge');
      expect(skillLearning).toBeDefined();
      expect(skillLearning?.content).toContain('JWT tokens');
    });

    it('should deduplicate similar learnings', () => {
      const messages = [
        { role: 'assistant' as const, content: 'Using default settings.' },
        { role: 'user' as const, content: 'No, use custom settings.' },
        { role: 'user' as const, content: 'No, use custom settings.' },
      ];

      const learnings = extractor.extract(messages);

      expect(learnings.length).toBeLessThan(3);
    });

    it('should skip non-user messages', () => {
      const messages = [
        { role: 'system' as const, content: 'System initialized.' },
        { role: 'assistant' as const, content: 'Hello!' },
      ];

      const learnings = extractor.extract(messages);

      expect(learnings).toHaveLength(0);
    });
  });

  describe('routeLesson', () => {
    it('should route corrections with skillInvolved to SKILL', () => {
      const learning: Learning = {
        type: 'correction',
        content: 'This approach is wrong for the auth module.',
        skillInvolved: 'auth-module',
        confidence: 0.9,
      };

      const destination = extractor.routeLesson(learning);

      expect(destination.type).toBe('SKILL');
      expect((destination as any).skillName).toBe('auth-module');
    });

    it('should route workflow learnings to SKILL', () => {
      const learning: Learning = {
        type: 'workflow',
        content: 'Always run tests before committing.',
        confidence: 0.8,
      };

      const destination = extractor.routeLesson(learning);

      expect(destination.type).toBe('SKILL');
    });

    it('should route preference learnings to CLAUDE_MD', () => {
      const learning: Learning = {
        type: 'preference',
        content: 'We prefer tabs over spaces.',
        confidence: 0.7,
      };

      const destination = extractor.routeLesson(learning);

      expect(destination.type).toBe('CLAUDE_MD');
      expect((destination as any).section).toBe('Conventions');
    });

    it('should route repeated-guidance to CLAUDE_MD', () => {
      const learning: Learning = {
        type: 'repeated-guidance',
        content: 'Always write tests first.',
        confidence: 0.7,
      };

      const destination = extractor.routeLesson(learning);

      expect(destination.type).toBe('CLAUDE_MD');
    });

    it('should route domain-knowledge to AUTO_MEMORY', () => {
      const learning: Learning = {
        type: 'domain-knowledge',
        content: 'The API uses pagination with limit and offset.',
        confidence: 0.6,
      };

      const destination = extractor.routeLesson(learning);

      expect(destination.type).toBe('AUTO_MEMORY');
      expect((destination as any).topic).toBe('discovered-knowledge');
    });

    it('should route failure-mode to IMPROVEMENT_BACKLOG', () => {
      const learning: Learning = {
        type: 'failure-mode',
        content: 'The auth middleware crashes when the token is malformed.',
        confidence: 0.8,
      };

      const destination = extractor.routeLesson(learning);

      expect(destination.type).toBe('IMPROVEMENT_BACKLOG');
      expect((destination as any).improvement).toBeDefined();
      expect((destination as any).improvement.type).toBe('bug-fix');
    });

    it('should default to AUTO_MEMORY for unknown types', () => {
      const learning: Learning = {
        type: 'correction',
        content: 'Generic correction without skill.',
        confidence: 0.5,
      };

      const destination = extractor.routeLesson(learning);

      expect(destination.type).toBe('AUTO_MEMORY');
    });
  });

  describe('applyLearning', () => {
    it('should add domain-knowledge to memory store', async () => {
      const learning: Learning = {
        type: 'domain-knowledge',
        content: 'API uses rate limiting of 100 requests per minute.',
        confidence: 0.7,
      };

      await extractor.applyLearning(learning);

      expect(getMemoryStore).toHaveBeenCalled();
    });

    it('should add failure-mode to improvement backlog', async () => {
      const learning: Learning = {
        type: 'failure-mode',
        content: 'Session timeout is too short at 5 minutes.',
        confidence: 0.8,
      };

      await extractor.applyLearning(learning);

      expect(getImprovementBacklog).toHaveBeenCalled();
    });
  });

  describe('processSession', () => {
    it('should extract and route all learnings from a session', async () => {
      const messages = [
        { role: 'assistant' as const, content: 'Using default config.' },
        { role: 'user' as const, content: 'No, use the production config.' },
        { role: 'user' as const, content: 'Always test in staging first.' },
      ];

      const result = await extractor.processSession(messages);

      expect(result.learnings.length).toBeGreaterThan(0);
      expect(result.routed).toHaveLength(result.learnings.length);
      expect(result.routed.every(r => r.destination !== undefined)).toBe(true);
    });

    it('should handle empty message array', async () => {
      const result = await extractor.processSession([]);

      expect(result.learnings).toHaveLength(0);
      expect(result.routed).toHaveLength(0);
    });
  });
});
