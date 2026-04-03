/**
 * AuditDashboard Component
 *
 * Displays audit reports from the Turbo audit pipeline.
 * Shows findings by severity, agent breakdown, and allows drilling into details.
 *
 * Features:
 * - Real-time audit report viewing
 * - Severity-filtered findings list
 * - Agent contribution breakdown
 * - Export to markdown
 */

import { useState, useCallback, useEffect } from 'react';
import { Shield, AlertTriangle, AlertCircle, Info, CheckCircle, Loader2, RefreshCw, Download } from 'lucide-react';

interface AuditFinding {
  severity: 'critical' | 'important' | 'suggestion' | 'nit';
  category: 'security' | 'performance' | 'correctness' | 'maintainability' | 'testing' | 'style';
  title: string;
  description: string;
  location?: { line?: number; column?: number };
  suggestion?: string;
}

interface AuditResult {
  agent: string;
  filePath: string;
  findings: AuditFinding[];
  summary: string;
  duration: number;
}

interface AuditReport {
  report_id: string;
  file_path: string;
  completed_at: number;
  results: AuditResult[];
  totalFindings: {
    critical: number;
    important: number;
    suggestions: number;
    nits: number;
  };
  improvements: Array<{
    id: string;
    summary: string;
    priority: 'critical' | 'high' | 'normal' | 'low';
  }>;
}

interface AuditDashboardProps {
  reportId?: string;  // If provided, load specific report
  autoRefresh?: boolean;  // Auto-refresh every 30s
  onFindingsChange?: (findings: AuditFinding[]) => void;
}

const SEVERITY_CONFIG: Record<AuditFinding['severity'], { icon: React.ComponentType<{ className?: string }>; color: string; label: string }> = {
  critical: { icon: AlertCircle, color: 'text-red-600 dark:text-red-400', label: 'Critical' },
  important: { icon: AlertTriangle, color: 'text-orange-600 dark:text-orange-400', label: 'Important' },
  suggestion: { icon: Info, color: 'text-blue-600 dark:text-blue-400', label: 'Suggestion' },
  nit: { icon: Shield, color: 'text-gray-500 dark:text-gray-400', label: 'Nit' },
};

const CATEGORY_COLORS: Record<AuditFinding['category'], string> = {
  security: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20',
  performance: 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20',
  correctness: 'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20',
  maintainability: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20',
  testing: 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20',
  style: 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/20',
};

export function AuditDashboard({ reportId, autoRefresh = false, onFindingsChange }: AuditDashboardProps) {
  const [report, setReport] = useState<AuditReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSeverity, setSelectedSeverity] = useState<AuditFinding['severity'] | 'all'>('all');
  const [selectedCategory, setSelectedCategory] = useState<AuditFinding['category'] | 'all'>('all');
  const [expandedFinding, setExpandedFinding] = useState<string | null>(null);

  const fetchReport = useCallback(async () => {
    if (!reportId) return;

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/turbo/audit/${reportId}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to load audit report');
      }

      const data: AuditReport = await response.json();
      setReport(data);
      onFindingsChange?.(data.results.flatMap(r => r.findings));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [reportId, onFindingsChange]);

  useEffect(() => {
    if (reportId) {
      fetchReport();
    }
  }, [reportId, fetchReport]);

  useEffect(() => {
    if (autoRefresh && reportId) {
      const interval = setInterval(fetchReport, 30000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, reportId, fetchReport]);

  const filteredFindings = report?.results.flatMap(r => r.findings).filter(f => {
    if (selectedSeverity !== 'all' && f.severity !== selectedSeverity) return false;
    if (selectedCategory !== 'all' && f.category !== selectedCategory) return false;
    return true;
  }) || [];

  const exportToMarkdown = useCallback(() => {
    if (!report) return;

    let md = `# Audit Report: ${report.file_path}\n\n`;
    md += `*Generated: ${new Date(report.completed_at).toISOString()}*\n\n`;
    md += `## Summary\n\n`;
    md += `- **Critical:** ${report.totalFindings.critical}\n`;
    md += `- **Important:** ${report.totalFindings.important}\n`;
    md += `- **Suggestions:** ${report.totalFindings.suggestions}\n`;
    md += `- **Nits:** ${report.totalFindings.nits}\n\n`;

    for (const result of report.results) {
      md += `## ${result.agent}\n\n`;
      md += `${result.summary}\n\n`;

      for (const finding of result.findings) {
        md += `### ${finding.title}\n\n`;
        md += `**Severity:** ${finding.severity} | **Category:** ${finding.category}\n\n`;
        md += `${finding.description}\n\n`;
        if (finding.suggestion) {
          md += `**Suggestion:** ${finding.suggestion}\n\n`;
        }
      }
    }

    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-${report.file_path.replace(/\//g, '-')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [report]);

  if (!reportId) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 text-center">
        <Shield className="w-12 h-12 text-gray-400 mx-auto mb-3" />
        <p className="text-gray-600 dark:text-gray-400">No audit report selected</p>
        <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">Run an audit to see findings</p>
      </div>
    );
  }

  if (loading && !report) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          <span className="ml-3 text-gray-600 dark:text-gray-400">Loading audit report...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
          <AlertCircle className="w-5 h-5" />
          <span>{error}</span>
        </div>
        <button
          onClick={fetchReport}
          className="mt-3 flex items-center gap-2 text-sm text-blue-600 hover:underline dark:text-blue-400"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 pb-4">
        <div className="flex items-center gap-3">
          <Shield className="w-6 h-6 text-blue-500" />
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Audit Report
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">{report?.file_path}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchReport}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={exportToMarkdown}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            title="Export to Markdown"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-red-600 dark:text-red-400">
            {report?.totalFindings.critical || 0}
          </div>
          <div className="text-xs text-red-700 dark:text-red-300 mt-1">Critical</div>
        </div>
        <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
            {report?.totalFindings.important || 0}
          </div>
          <div className="text-xs text-orange-700 dark:text-orange-300 mt-1">Important</div>
        </div>
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {report?.totalFindings.suggestions || 0}
          </div>
          <div className="text-xs text-blue-700 dark:text-blue-300 mt-1">Suggestions</div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-900/20 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-gray-600 dark:text-gray-400">
            {report?.totalFindings.nits || 0}
          </div>
          <div className="text-xs text-gray-700 dark:text-gray-300 mt-1">Nits</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600 dark:text-gray-400">Severity:</span>
          {(['all', 'critical', 'important', 'suggestion', 'nit'] as const).map(sev => (
            <button
              key={sev}
              onClick={() => setSelectedSeverity(sev)}
              className={`px-2 py-1 text-xs rounded-md transition-colors ${
                selectedSeverity === sev
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                  : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200'
              }`}
            >
              {sev.charAt(0).toUpperCase() + sev.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600 dark:text-gray-400">Category:</span>
          {(['all', 'security', 'performance', 'correctness', 'maintainability', 'testing', 'style'] as const).map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-2 py-1 text-xs rounded-md transition-colors ${
                selectedCategory === cat
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                  : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200'
              }`}
            >
              {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Findings List */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Findings ({filteredFindings.length})
        </h4>
        {filteredFindings.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-500" />
            No findings match your filters
          </div>
        ) : (
          filteredFindings.map((finding, idx) => {
            const key = `${finding.category}-${finding.title}-${idx}`;
            const isExpanded = expandedFinding === key;
            const SeverityIcon = SEVERITY_CONFIG[finding.severity].icon;

            return (
              <div
                key={key}
                className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
              >
                <button
                  onClick={() => setExpandedFinding(isExpanded ? null : key)}
                  className="w-full flex items-center gap-3 p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  <SeverityIcon className={`w-5 h-5 flex-shrink-0 ${SEVERITY_CONFIG[finding.severity].color}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {finding.title}
                      </span>
                      <span className={`px-2 py-0.5 text-xs rounded-full ${CATEGORY_COLORS[finding.category]}`}>
                        {finding.category}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                      {finding.description}
                    </p>
                  </div>
                </button>
                {isExpanded && (
                  <div className="border-t border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-900/50 space-y-3">
                    <div>
                      <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</h5>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{finding.description}</p>
                    </div>
                    {finding.location && (
                      <div>
                        <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Location</h5>
                        <p className="text-sm text-gray-600 dark:text-gray-400 font-mono">
                          Line {finding.location.line || 'N/A'}
                          {finding.location.column && `, Column ${finding.location.column}`}
                        </p>
                      </div>
                    )}
                    {finding.suggestion && (
                      <div>
                        <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Suggestion</h5>
                        <p className="text-sm text-gray-600 dark:text-gray-400">{finding.suggestion}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
