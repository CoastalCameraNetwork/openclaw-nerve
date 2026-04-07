/**
 * Audit Pipeline Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuditPipeline, getAuditPipeline, type AuditRequest } from './audit-pipeline';
import { invokeGatewayTool } from '../lib/gateway-client.js';

// Mock gateway client
vi.mock('../lib/gateway-client', () => ({
  invokeGatewayTool: vi.fn().mockResolvedValue({ output: '[]' }),
}));

describe('AuditPipeline', () => {
  let pipeline: AuditPipeline;

  beforeEach(() => {
    pipeline = new AuditPipeline();
    vi.clearAllMocks();
  });

  describe('audit', () => {
    it('should run audits with relevant agents', async () => {
      const request: AuditRequest = {
        filePath: 'server/routes/auth.ts',
        content: 'export const authMiddleware = async (req, res) => {}',
        changeType: 'modification',
      };

      const report = await pipeline.audit(request);

      expect(report.requestId).toBeDefined();
      expect(report.filePath).toBe(request.filePath);
      expect(report.results).toBeInstanceOf(Array);
      expect(report.totalFindings).toBeDefined();
    });

    it('should select security auditor for auth files', async () => {
      const request: AuditRequest = {
        filePath: 'server/routes/auth.ts',
        content: 'function verifyToken(token) {}',
        changeType: 'new-file',
      };

      await pipeline.audit(request);

      expect(invokeGatewayTool).toHaveBeenCalled();
      const calls = vi.mocked(invokeGatewayTool).mock.calls;
      const agentNames = calls.map(c => c[1]?.label).join(',');
      expect(agentNames).toContain('security');
    });

    it('should select testing auditor for test files', async () => {
      const request: AuditRequest = {
        filePath: 'src/components/Button.test.tsx',
        content: 'describe("Button", () => { it("renders", () => {}) })',
        changeType: 'modification',
      };

      await pipeline.audit(request);

      const calls = vi.mocked(invokeGatewayTool).mock.calls;
      const agentNames = calls.map(c => c[1]?.label).join(',');
      expect(agentNames).toContain('testing');
    });

    it('should count findings by severity', async () => {
      vi.mocked(invokeGatewayTool).mockResolvedValue({
        output: JSON.stringify([
          {
            severity: 'critical',
            category: 'security',
            title: 'Hardcoded secret',
            description: 'Secret key is hardcoded',
            suggestion: 'Use environment variable',
          },
          {
            severity: 'suggestion',
            category: 'style',
            title: 'Naming convention',
            description: 'Variable naming inconsistent',
          },
        ]),
      });

      const request: AuditRequest = {
        filePath: 'server/lib/crypto.ts',
        content: 'const SECRET = "hardcoded"',
        changeType: 'new-file',
      };

      const report = await pipeline.audit(request);

      expect(report.totalFindings.critical).toBe(1);
      expect(report.totalFindings.suggestions).toBe(1);
    });

    it('should create improvements for critical/important findings', async () => {
      vi.mocked(invokeGatewayTool).mockResolvedValue({
        output: JSON.stringify([
          {
            severity: 'critical',
            category: 'security',
            title: 'SQL injection vulnerability',
            description: 'User input directly concatenated into query',
            suggestion: 'Use parameterized queries',
          },
        ]),
      });

      const request: AuditRequest = {
        filePath: 'server/routes/users.ts',
        content: 'db.query("SELECT * FROM users WHERE id = " + userId)',
        changeType: 'modification',
      };

      const report = await pipeline.audit(request);

      // Multiple agents may match, so we expect at least 1 improvement
      expect(report.improvements.length).toBeGreaterThanOrEqual(1);
      // Find the SQL injection improvement
      const sqlInjectionImprovement = report.improvements.find(i => i.summary.includes('SQL injection'));
      expect(sqlInjectionImprovement).toBeDefined();
      expect(sqlInjectionImprovement?.priority).toBe('critical');
      expect(sqlInjectionImprovement?.type).toBe('bug-fix');
    });

    it('should handle agent errors gracefully', async () => {
      vi.mocked(invokeGatewayTool).mockRejectedValue(new Error('Gateway timeout'));

      const request: AuditRequest = {
        filePath: 'server/routes/api.ts',
        content: 'export const handler = () => {}',
        changeType: 'modification',
      };

      const report = await pipeline.audit(request);

      expect(report.results).toBeDefined();
      expect(report.results.some(r => r.summary.includes('failed'))).toBe(true);
    });

    it('should handle invalid JSON responses', async () => {
      vi.mocked(invokeGatewayTool).mockResolvedValue({
        output: 'Invalid response without JSON',
      });

      const request: AuditRequest = {
        filePath: 'server/routes/api.ts',
        content: 'export const handler = () => {}',
        changeType: 'modification',
      };

      const report = await pipeline.audit(request);

      expect(report.results.every(r => r.findings.length === 0)).toBe(true);
    });

    it('should always include at least one agent', async () => {
      const request: AuditRequest = {
        filePath: 'random.file.xyz',
        content: 'Some random content without matching patterns',
        changeType: 'new-file',
      };

      const report = await pipeline.audit(request);

      expect(report.results.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('exportToMarkdown', () => {
    it('should generate markdown report', async () => {
      const report = {
        requestId: 'test-123',
        filePath: 'server/routes/auth.ts',
        completedAt: Date.now(),
        results: [
          {
            agent: 'security-auditor',
            filePath: 'server/routes/auth.ts',
            findings: [
              {
                severity: 'critical',
                category: 'security',
                title: 'Weak password validation',
                description: 'Password requirements are too weak',
                suggestion: 'Require special characters and minimum 8 chars',
              },
            ],
            summary: 'Found 1 issue',
            duration: 1500,
          },
        ],
        totalFindings: {
          critical: 1,
          important: 0,
          suggestions: 0,
          nits: 0,
        },
        improvements: [],
      };

      const md = await pipeline.exportToMarkdown(report);

      expect(md).toContain('# Audit Report: server/routes/auth.ts');
      expect(md).toContain('## Summary');
      expect(md).toContain('**Critical:** 1');
      expect(md).toContain('## security-auditor');
      expect(md).toContain('Weak password validation');
    });

    it('should group findings by severity', async () => {
      const report = {
        requestId: 'test-456',
        filePath: 'src/utils.ts',
        completedAt: Date.now(),
        results: [
          {
            agent: 'performance-auditor',
            filePath: 'src/utils.ts',
            findings: [
              {
                severity: 'important',
                category: 'performance',
                title: 'Inefficient loop',
                description: 'O(n²) complexity',
              },
              {
                severity: 'nit',
                category: 'style',
                title: 'Missing semicolon',
                description: 'Line 5',
              },
            ],
            summary: 'Found 2 issues',
            duration: 1000,
          },
        ],
        totalFindings: {
          critical: 0,
          important: 1,
          suggestions: 0,
          nits: 1,
        },
        improvements: [],
      };

      const md = await pipeline.exportToMarkdown(report);

      expect(md).toContain('### Important');
      expect(md).toContain('### Nit');
    });
  });

  describe('getAuditPipeline (singleton)', () => {
    it('should return the same instance', () => {
      const instance1 = getAuditPipeline();
      const instance2 = getAuditPipeline();

      expect(instance1).toBe(instance2);
    });
  });
});
