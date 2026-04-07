/**
 * ReviewResultsPanel - Displays comprehensive PR review results with confidence scores
 */

import { useCallback, useEffect, useState } from 'react';
import { Shield, Code, GitPullRequest, CheckSquare, AlertCircle, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

export interface ReviewIssue {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'nit';
  category: 'security' | 'quality' | 'correctness' | 'performance' | 'style' | 'testing';
  title: string;
  description: string;
  file?: string;
  line?: number;
  codeSnippet?: string;
  suggestion?: string;
  cweId?: string;
}

export interface ReviewCategory {
  name: string;
  passed: boolean;
  score: number;
  issues: ReviewIssue[];
  summary: string;
}

export interface PRReviewReport {
  taskId: string;
  prNumber?: number;
  taskDescription?: string;
  passed: boolean;
  overallScore: number;
  confidenceLevel: 'low' | 'medium' | 'high' | 'very-high';
  securityReview: ReviewCategory;
  qualityReview: ReviewCategory;
  diffReview: ReviewCategory;
  completenessReview: ReviewCategory;
  criticalIssues: number;
  highIssues: number;
  mediumIssues: number;
  lowIssues: number;
  filesChanged: string[];
  linesAdded: number;
  linesRemoved: number;
  todosAdded: number;
  todosFixed: number;
  recommendations: string[];
  blockingIssues: string[];
  timestamp: number;
  duration: number;
}

interface ReviewResultsPanelProps {
  taskId: string;
  onLoadReport?: (report: PRReviewReport | null) => void;
}

export function ReviewResultsPanel({ taskId, onLoadReport }: ReviewResultsPanelProps) {
  const [report, setReport] = useState<PRReviewReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/orchestrator/task/${taskId}/review`, {
        credentials: 'include',
      });

      if (res.ok) {
        const data = await res.json();
        setReport(data.report);
        onLoadReport?.(data.report);
      } else if (res.status === 404) {
        setReport(null);
        onLoadReport?.(null);
      } else {
        const errData = await res.json().catch(() => ({}));
        setError(errData.error || `HTTP ${res.status}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load review report');
    } finally {
      setLoading(false);
    }
  }, [taskId, onLoadReport]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-400 bg-red-500/20 border-red-500/30';
      case 'high': return 'text-amber-400 bg-amber-500/20 border-amber-500/30';
      case 'medium': return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30';
      case 'low': return 'text-blue-400 bg-blue-500/20 border-blue-500/30';
      case 'nit': return 'text-gray-400 bg-gray-500/20 border-gray-500/30';
      default: return 'text-gray-400';
    }
  };

  const getConfidenceColor = (level: string) => {
    switch (level) {
      case 'very-high': return 'text-green-400';
      case 'high': return 'text-cyan-400';
      case 'medium': return 'text-yellow-400';
      case 'low': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-400';
    if (score >= 70) return 'text-yellow-400';
    if (score >= 50) return 'text-amber-400';
    return 'text-red-400';
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'Security Review': return <Shield size={16} />;
      case 'Code Quality Review': return <Code size={16} />;
      case 'Diff Analysis': return <GitPullRequest size={16} />;
      case 'Implementation Completeness': return <CheckSquare size={16} />;
      default: return <AlertCircle size={16} />;
    }
  };

  if (loading) {
    return (
      <div className="p-4 flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 size={16} className="animate-spin" />
        <span className="text-xs">Loading review report...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 border rounded-lg bg-red-500/10 border-red-500/30">
        <div className="flex items-center gap-2 text-red-400 text-xs">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
        <button
          onClick={fetchReport}
          className="mt-2 text-xs px-2 py-1 rounded bg-red-500/20 hover:bg-red-500/30 text-red-400"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="p-4 border rounded-lg bg-muted/30 text-center">
        <p className="text-xs text-muted-foreground">No review report yet</p>
        <p className="text-[10px] text-muted-foreground mt-1">Run automated review to generate a report</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Overall Summary */}
      <div className={`p-4 rounded-lg border ${report.passed ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {report.passed ? (
              <CheckCircle2 size={20} className="text-green-400" />
            ) : (
              <XCircle size={20} className="text-red-400" />
            )}
            <span className="text-sm font-semibold">
              {report.passed ? 'Review Passed' : 'Review Failed'}
            </span>
          </div>
          <div className={`text-sm font-bold ${getScoreColor(report.overallScore)}`}>
            Score: {report.overallScore}/100
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-muted-foreground">Confidence:</span>{' '}
            <span className={`font-medium ${getConfidenceColor(report.confidenceLevel)}`}>
              {report.confidenceLevel.replace('-', ' ').toUpperCase()}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Files:</span>{' '}
            <span className="font-medium">{report.filesChanged.length}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Lines:</span>{' '}
            <span className="font-medium">+{report.linesAdded} -{report.linesRemoved}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Duration:</span>{' '}
            <span className="font-medium">{(report.duration / 1000).toFixed(1)}s</span>
          </div>
        </div>
      </div>

      {/* Category Breakdown */}
      <div className="space-y-3">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Category Breakdown</h4>

        {(['securityReview', 'qualityReview', 'diffReview', 'completenessReview'] as const).map((key) => {
          const category = report[key];
          return (
            <div key={key} className="p-3 border rounded-lg bg-muted/30">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {getCategoryIcon(category.name)}
                  <span className="text-xs font-medium">{category.name}</span>
                </div>
                <div className={`text-xs font-bold ${getScoreColor(category.score)}`}>
                  {category.score}/100
                </div>
              </div>

              <div className="text-xs text-muted-foreground mb-2">{category.summary}</div>

              {category.issues.length > 0 && (
                <div className="space-y-1.5">
                  {category.issues.slice(0, 5).map((issue, idx) => (
                    <div
                      key={idx}
                      className={`text-[10px] p-2 rounded border ${getSeverityColor(issue.severity)}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium">{issue.title}</span>
                        {issue.cweId && (
                          <span className="opacity-75">[{issue.cweId}]</span>
                        )}
                      </div>
                      <div className="opacity-80 mt-1">{issue.description}</div>
                      {issue.suggestion && (
                        <div className="opacity-75 mt-1 italic">→ {issue.suggestion}</div>
                      )}
                    </div>
                  ))}
                  {category.issues.length > 5 && (
                    <div className="text-[10px] text-muted-foreground text-center pt-1">
                      +{category.issues.length - 5} more issues
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Blocking Issues */}
      {report.blockingIssues.length > 0 && (
        <div className="p-3 border rounded-lg bg-red-500/10 border-red-500/30">
          <h4 className="text-xs font-semibold text-red-400 mb-2 flex items-center gap-1">
            <AlertCircle size={12} />
            Blocking Issues
          </h4>
          <div className="space-y-1">
            {report.blockingIssues.map((issue, idx) => (
              <div key={idx} className="text-[10px] text-red-300">
                • {issue}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {report.recommendations.length > 0 && (
        <div className="p-3 border rounded-lg bg-blue-500/10 border-blue-500/30">
          <h4 className="text-xs font-semibold text-blue-400 mb-2">Recommendations</h4>
          <div className="space-y-1">
            {report.recommendations.map((rec, idx) => (
              <div key={idx} className="text-[10px] text-blue-300 flex items-start gap-1">
                <span className="mt-0.5">•</span>
                <span>{rec}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Issue Stats */}
      <div className="grid grid-cols-4 gap-2 text-xs">
        {report.criticalIssues > 0 && (
          <div className="p-2 rounded bg-red-500/20 border border-red-500/30 text-center">
            <div className="text-red-400 font-bold">{report.criticalIssues}</div>
            <div className="text-red-300 text-[10px]">Critical</div>
          </div>
        )}
        {report.highIssues > 0 && (
          <div className="p-2 rounded bg-amber-500/20 border border-amber-500/30 text-center">
            <div className="text-amber-400 font-bold">{report.highIssues}</div>
            <div className="text-amber-300 text-[10px]">High</div>
          </div>
        )}
        {report.mediumIssues > 0 && (
          <div className="p-2 rounded bg-yellow-500/20 border border-yellow-500/30 text-center">
            <div className="text-yellow-400 font-bold">{report.mediumIssues}</div>
            <div className="text-yellow-300 text-[10px]">Medium</div>
          </div>
        )}
        {report.lowIssues > 0 && (
          <div className="p-2 rounded bg-blue-500/20 border border-blue-500/30 text-center">
            <div className="text-blue-400 font-bold">{report.lowIssues}</div>
            <div className="text-blue-300 text-[10px]">Low</div>
          </div>
        )}
        {report.criticalIssues === 0 && report.highIssues === 0 && report.mediumIssues === 0 && report.lowIssues === 0 && (
          <div className="col-span-4 p-2 rounded bg-green-500/20 border border-green-500/30 text-center text-green-400 text-xs">
            No issues found
          </div>
        )}
      </div>
    </div>
  );
}
