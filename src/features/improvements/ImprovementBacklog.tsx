/**
 * ImprovementBacklog UI Component
 *
 * Displays improvement proposals from audit findings and session learnings.
 * Shows prioritized backlog items with status tracking and promotion workflow.
 *
 * Features:
 * - Priority-filtered improvements list
 * - Status tracking (backlog, in-progress, completed)
 * - Promote improvements to kanban tasks
 * - Export to markdown
 */

import { useState, useCallback, useEffect } from 'react';
import { Lightbulb, ArrowUpCircle, Clock, AlertCircle, Loader2, Download, Trash2 } from 'lucide-react';

interface Improvement {
  id: string;
  summary: string;
  description: string;
  priority: 'critical' | 'high' | 'normal' | 'low';
  source: 'audit' | 'learning' | 'manual';
  relatedFindings?: string[];
  status: 'backlog' | 'in-progress' | 'completed';
  createdAt: number;
  tags?: string[];
}

interface ImprovementBacklogProps {
  projectId?: string;
  onPromoteToTask?: (improvement: Improvement) => void;
  autoRefresh?: boolean;
}

const PRIORITY_CONFIG: Record<Improvement['priority'], { icon: React.ComponentType<{ className?: string }>; color: string; label: string }> = {
  critical: { icon: AlertCircle, color: 'text-red-600 dark:text-red-400', label: 'Critical' },
  high: { icon: ArrowUpCircle, color: 'text-orange-600 dark:text-orange-400', label: 'High' },
  normal: { icon: Clock, color: 'text-blue-600 dark:text-blue-400', label: 'Normal' },
  low: { icon: Lightbulb, color: 'text-gray-500 dark:text-gray-400', label: 'Low' },
};

const STATUS_CONFIG: Record<Improvement['status'], { color: string; label: string }> = {
  backlog: { color: 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/20', label: 'Backlog' },
  'in-progress': { color: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20', label: 'In Progress' },
  completed: { color: 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20', label: 'Completed' },
};

export function ImprovementBacklog({
  projectId,
  onPromoteToTask,
  autoRefresh = false,
}: ImprovementBacklogProps) {
  const [improvements, setImprovements] = useState<Improvement[]>([]);
  const [_projectId] = useState(projectId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPriority, setSelectedPriority] = useState<Improvement['priority'] | 'all'>('all');
  const [selectedStatus, setSelectedStatus] = useState<Improvement['status'] | 'all'>('all');
  const [expandedImprovement, setExpandedImprovement] = useState<string | null>(null);

  const fetchImprovements = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/turbo/improvements', {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch improvements');
      }

      const data: { improvements: Improvement[] } = await response.json();
      setImprovements(data.improvements || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  const promoteImprovement = useCallback(async (improvement: Improvement) => {
    try {
      const response = await fetch('/api/kanban/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: improvement.summary,
          description: improvement.description,
          priority: improvement.priority,
          labels: ['improvement', improvement.source],
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create task');
      }

      // Update local state
      setImprovements(prev =>
        prev.map(imp =>
          imp.id === improvement.id ? { ...imp, status: 'in-progress' as const } : imp
        )
      );

      onPromoteToTask?.(improvement);
    } catch (err) {
      console.error('Failed to promote improvement:', err);
    }
  }, [onPromoteToTask]);

  const deleteImprovement = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/turbo/improvements/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to delete improvement');
      }

      setImprovements(prev => prev.filter(imp => imp.id !== id));
    } catch (err) {
      console.error('Failed to delete improvement:', err);
    }
  }, []);

  const exportToMarkdown = useCallback(() => {
    let md = `# Improvement Backlog\n\n`;
    md += `*Generated: ${new Date().toISOString()}*\n\n`;

    const byPriority = {
      critical: improvements.filter(i => i.priority === 'critical'),
      high: improvements.filter(i => i.priority === 'high'),
      normal: improvements.filter(i => i.priority === 'normal'),
      low: improvements.filter(i => i.priority === 'low'),
    };

    for (const [priority, items] of Object.entries(byPriority)) {
      if (items.length > 0) {
        md += `## ${priority.charAt(0).toUpperCase() + priority.slice(1)} Priority\n\n`;
        for (const imp of items) {
          md += `### ${imp.summary}\n\n`;
          md += `**Status:** ${imp.status} | **Source:** ${imp.source}\n\n`;
          md += `${imp.description}\n\n`;
          if (imp.tags && imp.tags.length > 0) {
            md += `**Tags:** ${imp.tags.join(', ')}\n\n`;
          }
        }
      }
    }

    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `improvement-backlog-${new Date().toISOString().split('T')[0]}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [improvements]);

  useEffect(() => {
    fetchImprovements();
  }, [fetchImprovements]);

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(fetchImprovements, 30000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, fetchImprovements]);

  const filteredImprovements = improvements.filter(imp => {
    if (selectedPriority !== 'all' && imp.priority !== selectedPriority) return false;
    if (selectedStatus !== 'all' && imp.status !== selectedStatus) return false;
    return true;
  });

  const priorityCounts = {
    critical: improvements.filter(i => i.priority === 'critical').length,
    high: improvements.filter(i => i.priority === 'high').length,
    normal: improvements.filter(i => i.priority === 'normal').length,
    low: improvements.filter(i => i.priority === 'low').length,
  };

  const statusCounts = {
    backlog: improvements.filter(i => i.status === 'backlog').length,
    'in-progress': improvements.filter(i => i.status === 'in-progress').length,
    completed: improvements.filter(i => i.status === 'completed').length,
  };

  if (loading && improvements.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
          <span className="ml-3 text-gray-600 dark:text-gray-400">Loading improvements...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 pb-4">
        <div className="flex items-center gap-3">
          <Lightbulb className="w-6 h-6 text-orange-500" />
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Improvement Backlog
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {improvements.length} improvements
              {` (${statusCounts.backlog} backlog, ${statusCounts['in-progress']} in progress, ${statusCounts.completed} completed)`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchImprovements}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            title="Refresh"
          >
            <Loader2 className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
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

      {/* Priority Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-red-600 dark:text-red-400">
            {priorityCounts.critical}
          </div>
          <div className="text-xs text-red-700 dark:text-red-300 mt-1">Critical</div>
        </div>
        <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
            {priorityCounts.high}
          </div>
          <div className="text-xs text-orange-700 dark:text-orange-300 mt-1">High</div>
        </div>
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {priorityCounts.normal}
          </div>
          <div className="text-xs text-blue-700 dark:text-blue-300 mt-1">Normal</div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-900/20 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-gray-600 dark:text-gray-400">
            {priorityCounts.low}
          </div>
          <div className="text-xs text-gray-700 dark:text-gray-300 mt-1">Low</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600 dark:text-gray-400">Priority:</span>
          {(['all', 'critical', 'high', 'normal', 'low'] as const).map(pri => (
            <button
              key={pri}
              onClick={() => setSelectedPriority(pri)}
              className={`px-2 py-1 text-xs rounded-md transition-colors ${
                selectedPriority === pri
                  ? 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300'
                  : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200'
              }`}
            >
              {pri.charAt(0).toUpperCase() + pri.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600 dark:text-gray-400">Status:</span>
          {(['all', 'backlog', 'in-progress', 'completed'] as const).map(status => (
            <button
              key={status}
              onClick={() => setSelectedStatus(status)}
              className={`px-2 py-1 text-xs rounded-md transition-colors ${
                selectedStatus === status
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                  : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200'
              }`}
            >
              {status === 'in-progress' ? 'In Progress' : status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-md">
          <AlertCircle className="w-5 h-5" />
          <span>{error}</span>
        </div>
      )}

      {/* Improvements List */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Improvements ({filteredImprovements.length})
        </h4>
        {filteredImprovements.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <Lightbulb className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No improvements found</p>
            <p className="text-sm mt-1">Run an audit to generate improvement proposals</p>
          </div>
        ) : (
          filteredImprovements.map((improvement) => {
            const key = improvement.id;
            const isExpanded = expandedImprovement === key;
            const PriorityIcon = PRIORITY_CONFIG[improvement.priority].icon;
            const statusConfig = STATUS_CONFIG[improvement.status];

            return (
              <div
                key={key}
                className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
              >
                <button
                  onClick={() => setExpandedImprovement(isExpanded ? null : key)}
                  className="w-full flex items-center gap-3 p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  <PriorityIcon className={`w-5 h-5 flex-shrink-0 ${PRIORITY_CONFIG[improvement.priority].color}`} />
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {improvement.summary}
                      </span>
                      <span className={`px-2 py-0.5 text-xs rounded-full ${statusConfig.color}`}>
                        {statusConfig.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      <span>Source: {improvement.source}</span>
                      {improvement.tags && improvement.tags.length > 0 && (
                        <span>• Tags: {improvement.tags.join(', ')}</span>
                      )}
                    </div>
                  </div>
                </button>
                {isExpanded && (
                  <div className="border-t border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-900/50 space-y-3">
                    <div>
                      <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</h5>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{improvement.description}</p>
                    </div>
                    {improvement.relatedFindings && improvement.relatedFindings.length > 0 && (
                      <div>
                        <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Related Findings</h5>
                        <div className="flex gap-1 flex-wrap">
                          {improvement.relatedFindings.map((finding, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-0.5 text-xs rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                            >
                              {finding}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-2 pt-2">
                      {improvement.status === 'backlog' && (
                        <button
                          onClick={() => promoteImprovement(improvement)}
                          className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 transition-colors"
                        >
                          <ArrowUpCircle className="w-3 h-3" />
                          Promote to Task
                        </button>
                      )}
                      <button
                        onClick={() => deleteImprovement(improvement.id)}
                        className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md bg-red-50 hover:bg-red-100 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-700 dark:text-red-300 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                        Delete
                      </button>
                    </div>
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
