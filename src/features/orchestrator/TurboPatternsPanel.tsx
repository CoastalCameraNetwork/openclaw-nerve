/**
 * TurboPatternsPanel Component
 *
 * Provides quick actions for running Turbo pattern workflows:
 * - Audit: Multi-agent code review
 * - Polish: Format, lint, test, simplify, review
 * - Finalize: Post-implementation QA workflow
 *
 * Integrates with the new /api/turbo/* endpoints
 */

import { useState, useCallback } from 'react';
import { Shield, Sparkles, PackageCheck, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';

interface TurboPatternsPanelProps {
  taskId?: string;
  filePath?: string;
  onAuditComplete?: (reportId: string) => void;
  onPolishComplete?: (reportId: string) => void;
  onFinalizeComplete?: (reportId: string) => void;
}

interface AuditReport {
  report_id: string;
  file_path: string;
  agents: string[];
  findings: Array<{
    severity: 'critical' | 'important' | 'suggestion' | 'nit';
    category: string;
    title: string;
    description: string;
  }>;
  severity_counts: {
    critical: number;
    important: number;
    suggestion: number;
  };
}

interface PolishReport {
  report_id: string;
  file_path: string;
  steps: Array<{
    step: string;
    success: boolean;
    output: string;
    errors: string[];
  }>;
  overall: 'success' | 'partial' | 'failed';
  suggestions: string[];
}

interface FinalizeReport {
  report_id: string;
  task_id?: string;
  phases: Array<{
    name: string;
    success: boolean;
    output: string;
    errors: string[];
  }>;
  overall: 'success' | 'partial' | 'failed';
  learnings_extracted: number;
  improvements_created: number;
  changelog_updated: boolean;
}

type WorkflowStatus = 'idle' | 'running' | 'completed' | 'failed';

interface WorkflowState {
  status: WorkflowStatus;
  error?: string;
  report?: AuditReport | PolishReport | FinalizeReport;
}

export function TurboPatternsPanel({
  taskId,
  filePath,
  onAuditComplete,
  onPolishComplete,
  onFinalizeComplete,
}: TurboPatternsPanelProps) {
  const [auditState, setAuditState] = useState<WorkflowState>({ status: 'idle' });
  const [polishState, setPolishState] = useState<WorkflowState>({ status: 'idle' });
  const [finalizeState, setFinalizeState] = useState<WorkflowState>({ status: 'idle' });

  const runAudit = useCallback(async () => {
    if (!filePath) {
      setAuditState({ status: 'failed', error: 'No file path provided' });
      return;
    }

    setAuditState({ status: 'running' });
    try {
      const response = await fetch('/api/turbo/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          filePath,
          runSecurity: true,
          runPerformance: true,
          runArchitecture: true,
          runTesting: true,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Audit failed');
      }

      const data: AuditReport = await response.json();
      setAuditState({ status: 'completed', report: data });
      onAuditComplete?.(data.report_id);
    } catch (error) {
      setAuditState({
        status: 'failed',
        error: error instanceof Error ? error.message : 'Audit failed'
      });
    }
  }, [filePath, onAuditComplete]);

  const runPolish = useCallback(async () => {
    if (!filePath) {
      setPolishState({ status: 'failed', error: 'No file path provided' });
      return;
    }

    setPolishState({ status: 'running' });
    try {
      const response = await fetch('/api/turbo/polish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          filePath,
          runFormat: true,
          runLint: true,
          runTest: true,
          runSimplify: false,
          runReview: false,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Polish failed');
      }

      const data: PolishReport = await response.json();
      setPolishState({ status: 'completed', report: data });
      onPolishComplete?.(data.report_id);
    } catch (error) {
      setPolishState({
        status: 'failed',
        error: error instanceof Error ? error.message : 'Polish failed'
      });
    }
  }, [filePath, onPolishComplete]);

  const runFinalize = useCallback(async () => {
    setFinalizeState({ status: 'running' });
    try {
      const response = await fetch('/api/turbo/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          taskId: taskId || undefined,
          filePaths: filePath ? [filePath] : undefined,
          extractLearnings: true,
          updateChangelog: true,
          runTests: true,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Finalize failed');
      }

      const data: FinalizeReport = await response.json();
      setFinalizeState({ status: 'completed', report: data });
      onFinalizeComplete?.(data.report_id);
    } catch (error) {
      setFinalizeState({
        status: 'failed',
        error: error instanceof Error ? error.message : 'Finalize failed'
      });
    }
  }, [taskId, filePath, onFinalizeComplete]);

  const resetState = useCallback((workflow: 'audit' | 'polish' | 'finalize') => {
    if (workflow === 'audit') setAuditState({ status: 'idle' });
    if (workflow === 'polish') setPolishState({ status: 'idle' });
    if (workflow === 'finalize') setFinalizeState({ status: 'idle' });
  }, []);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 space-y-4">
      <div className="flex items-center gap-2 border-b border-gray-200 dark:border-gray-700 pb-2">
        <Sparkles className="w-5 h-5 text-purple-500" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Turbo Workflows
        </h3>
      </div>

      {/* Audit Workflow */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-500" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Multi-Agent Audit
            </span>
          </div>
          <button
            onClick={runAudit}
            disabled={auditState.status === 'running' || !filePath}
            className="px-3 py-1 text-xs font-medium rounded-md bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {auditState.status === 'running' ? 'Running...' : 'Run Audit'}
          </button>
        </div>

        {auditState.status === 'running' && (
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            Running multi-agent code audit...
          </div>
        )}

        {auditState.status === 'completed' && auditState.report && (
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-md p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300">
              <CheckCircle className="w-4 h-4" />
              Audit complete - {(auditState.report as AuditReport).findings.length} findings
            </div>
            <div className="flex gap-3 text-xs">
              <span className="text-red-600 dark:text-red-400">
                Critical: {(auditState.report as AuditReport).severity_counts.critical}
              </span>
              <span className="text-orange-600 dark:text-orange-400">
                Important: {(auditState.report as AuditReport).severity_counts.important}
              </span>
              <span className="text-gray-600 dark:text-gray-400">
                Suggestions: {(auditState.report as AuditReport).severity_counts.suggestion}
              </span>
            </div>
            <button
              onClick={() => resetState('audit')}
              className="text-xs text-blue-600 hover:underline dark:text-blue-400"
            >
              Run another audit
            </button>
          </div>
        )}

        {auditState.status === 'failed' && (
          <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
            <AlertCircle className="w-4 h-4" />
            {auditState.error}
          </div>
        )}
      </div>

      {/* Polish Workflow */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PackageCheck className="w-4 h-4 text-green-500" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Polish Code
            </span>
          </div>
          <button
            onClick={runPolish}
            disabled={polishState.status === 'running' || !filePath}
            className="px-3 py-1 text-xs font-medium rounded-md bg-green-50 hover:bg-green-100 dark:bg-green-900/30 dark:hover:bg-green-900/50 text-green-700 dark:text-green-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {polishState.status === 'running' ? 'Running...' : 'Run Polish'}
          </button>
        </div>

        {polishState.status === 'running' && (
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            Running polish loop (format, lint, test)...
          </div>
        )}

        {polishState.status === 'completed' && polishState.report && (
          <div className="bg-green-50 dark:bg-green-900/20 rounded-md p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-300">
              <CheckCircle className="w-4 h-4" />
              Polish complete - {(polishState.report as PolishReport).overall.toUpperCase()}
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400">
              {(polishState.report as PolishReport).steps.length} steps completed
              {(polishState.report as PolishReport).suggestions.length > 0 && (
                <span className="ml-2">
                  • {(polishState.report as PolishReport).suggestions.length} suggestions
                </span>
              )}
            </div>
            <button
              onClick={() => resetState('polish')}
              className="text-xs text-green-600 hover:underline dark:text-green-400"
            >
              Run another polish
            </button>
          </div>
        )}

        {polishState.status === 'failed' && (
          <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
            <AlertCircle className="w-4 h-4" />
            {polishState.error}
          </div>
        )}
      </div>

      {/* Finalize Workflow */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-500" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Finalize Task
            </span>
          </div>
          <button
            onClick={runFinalize}
            disabled={finalizeState.status === 'running'}
            className="px-3 py-1 text-xs font-medium rounded-md bg-purple-50 hover:bg-purple-100 dark:bg-purple-900/30 dark:hover:bg-purple-900/50 text-purple-700 dark:text-purple-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {finalizeState.status === 'running' ? 'Running...' : 'Run Finalize'}
          </button>
        </div>

        {finalizeState.status === 'running' && (
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            Running finalize workflow...
          </div>
        )}

        {finalizeState.status === 'completed' && finalizeState.report && (
          <div className="bg-purple-50 dark:bg-purple-900/20 rounded-md p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm text-purple-700 dark:text-purple-300">
              <CheckCircle className="w-4 h-4" />
              Finalize complete - {(finalizeState.report as FinalizeReport).overall.toUpperCase()}
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="text-gray-600 dark:text-gray-400">
                Learnings: {(finalizeState.report as FinalizeReport).learnings_extracted}
              </div>
              <div className="text-gray-600 dark:text-gray-400">
                Improvements: {(finalizeState.report as FinalizeReport).improvements_created}
              </div>
              <div className="text-gray-600 dark:text-gray-400">
                Changelog: {(finalizeState.report as FinalizeReport).changelog_updated ? 'Updated' : 'Skipped'}
              </div>
            </div>
            <button
              onClick={() => resetState('finalize')}
              className="text-xs text-purple-600 hover:underline dark:text-purple-400"
            >
              Run another finalize
            </button>
          </div>
        )}

        {finalizeState.status === 'failed' && (
          <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
            <AlertCircle className="w-4 h-4" />
            {finalizeState.error}
          </div>
        )}
      </div>
    </div>
  );
}
