/**
 * TaskDetailPanel — Detailed view of a single orchestrator task.
 * Shows execution timeline, agent outputs, audit log, PR status, and live agent chat.
 */

import { useState, useEffect, useCallback } from 'react';
import { X, Clock, CheckCircle2, AlertCircle, FileText, GitPullRequest, User, Play, Square, Loader2, Edit2, Save, MessageSquare } from 'lucide-react';
import { AGENT_AVATARS } from './OrchestratorDashboard';
import { TaskChatPanel } from './TaskChatPanel';
import { useTaskActions } from './useOrchestrator';
import { DependencyPanel } from '../dependencies/DependencyPanel';
import { DependencyPicker } from '../dependencies/DependencyPicker';
import { useDependencies } from '../dependencies/useDependencies';
import { BudgetPanel } from '../budgets';
import { PlanPanel } from '../plans';

interface TaskHistory {
  task: {
    id: string;
    title: string;
    description: string;
    status: string;
    priority: string;
    labels: string[];
    createdAt: number;
    updatedAt: number;
    assignee?: string;
    version?: number;
  };
  agents: Array<{
    name: string;
    status: string;
    output?: string;
    error?: string;
    completedAt?: number;
    sessionKey?: string;
  }>;
  auditLog: Array<{
    ts: number;
    action: string;
    actor?: string;
    detail?: string;
  }>;
  pr?: {
    number: number;
    url: string;
    branch: string;
    status: 'open' | 'closed' | 'merged' | 'draft';
    reviewComments?: number;
    reviewPassed?: boolean;
    criticalIssues?: number;
    highIssues?: number;
  } | null;
}

interface TaskDetailPanelProps {
  taskId: string;
  onClose: () => void;
}

type TaskStatus = 'todo' | 'in-progress' | 'review' | 'done' | 'cancelled';
type TaskPriority = 'critical' | 'high' | 'normal' | 'low';

interface UpdateTaskPayload {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  labels?: string[];
  assignee?: string | null;
  version: number;
}

export function TaskDetailPanel({ taskId, onClose }: TaskDetailPanelProps) {
  const [history, setHistory] = useState<TaskHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [expandedAudit, setExpandedAudit] = useState<number | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editStatus, setEditStatus] = useState<TaskStatus>('todo');
  const [editPriority, setEditPriority] = useState<TaskPriority>('normal');
  const [editLabels, setEditLabels] = useState('');
  const [editAssignee, setEditAssignee] = useState('');
  const [editVersion, setEditVersion] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  // Dependency management
  const [showDependencyPicker, setShowDependencyPicker] = useState(false);
  const [allTasks, setAllTasks] = useState<Array<{ id: string; title: string; status: string }>>([]);
  const { data: dependencyData, addDependency } = useDependencies(taskId);

  // Load all tasks for dependency picker
  const loadAllTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/kanban/tasks?limit=1000', {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setAllTasks(data.tasks?.items || []);
      }
    } catch (err) {
      console.error('Failed to load tasks for dependency picker:', err);
    }
  }, []);

  const handleAddDependency = useCallback(async (dependsOnId: string) => {
    await addDependency(dependsOnId);
    setShowDependencyPicker(false);
  }, [addDependency]);

  // Task action handlers
  const { runReview, fixIssues, rerunReview, approveTask, rejectTask, isLoading } = useTaskActions();
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch(`/api/orchestrator/task/${taskId}/history`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
        // Initialize edit fields
        setEditTitle(data.task.title);
        setEditDescription(data.task.description || '');
        setEditStatus(data.task.status as TaskStatus);
        setEditPriority(data.task.priority as TaskPriority);
        setEditLabels(data.task.labels.join(', '));
        setEditAssignee(data.task.assignee || '');
        setEditVersion(data.task.version || 0);
      } else {
        setError(`Failed to load task: ${res.status}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load task history';
      setError(message);
      console.error('Failed to fetch task history:', err);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleClose = useCallback(() => {
    if (dirty && !window.confirm('You have unsaved changes. Discard?')) return;
    onClose();
  }, [dirty, onClose]);

  // Close on Escape key
  useEffect(() => {
    if (!history) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [history, handleClose]);

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleString('en', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleSave = useCallback(async () => {
    if (!history || saving) return;
    setSaving(true);
    setError(null);
    try {
      const labels = editLabels
        .split(',')
        .map(l => l.trim())
        .filter(Boolean);

      const payload: UpdateTaskPayload = {
        title: editTitle.trim(),
        description: editDescription.trim() || null,
        status: editStatus,
        priority: editPriority,
        labels,
        assignee: editAssignee.trim() || null,
        version: editVersion,
      };

      const res = await fetch(`/api/kanban/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (res.status === 409 && errData.error === 'version_conflict') {
          // Refresh fields with latest server state
          const latest = errData.latest;
          if (latest) {
            setEditTitle(latest.title);
            setEditDescription(latest.description || '');
            setEditStatus(latest.status);
            setEditPriority(latest.priority);
            setEditLabels(latest.labels.join(', '));
            setEditAssignee(latest.assignee || '');
            setEditVersion(latest.version);
            setError('Task was modified elsewhere. Fields refreshed -- review and save again.');
          }
        } else {
          throw new Error(errData.error || 'Save failed');
        }
      } else {
        const result = await res.json();
        // Update local history with saved data
        setHistory(prev => prev ? { ...prev, task: { ...prev.task, ...result.task } } : null);
        setEditVersion(result.task.version);
        setDirty(false);
        setEditMode(false);
        // Refresh history to get latest state
        await fetchHistory();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [history, saving, editTitle, editDescription, editStatus, editPriority, editLabels, editAssignee, editVersion, taskId, fetchHistory]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'done':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'in-progress':
        return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30';
      case 'review':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      case 'cancelled':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'todo':
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical':
        return 'bg-red-500 text-white';
      case 'high':
        return 'bg-amber-500 text-white';
      case 'normal':
        return 'bg-gray-500 text-white';
      case 'low':
        return 'bg-blue-500 text-white';
      default:
        return 'bg-gray-500 text-white';
    }
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'create':
        return <FileText size={14} className="text-blue-400" />;
      case 'update':
        return <Clock size={14} className="text-amber-400" />;
      case 'execute':
        return <Play size={14} className="text-green-400" />;
      case 'complete_run':
        return <CheckCircle2 size={14} className="text-green-400" />;
      case 'abort':
        return <Square size={14} className="text-red-400" />;
      case 'approve':
        return <CheckCircle2 size={14} className="text-cyan-400" />;
      case 'reject':
        return <AlertCircle size={14} className="text-red-400" />;
      default:
        return <Clock size={14} className="text-gray-400" />;
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-card rounded-xl border p-6 flex items-center gap-3">
          <Loader2 size={24} className="animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Loading task history...</span>
        </div>
      </div>
    );
  }

  if (!history) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-card rounded-xl border p-6 max-w-md">
          <p className="text-sm text-muted-foreground">Task not found.</p>
          <button
            onClick={onClose}
            className="mt-4 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={handleClose}>
      <div
        className="w-full max-w-2xl h-full bg-card border-l shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 z-10 p-4 border-b bg-card flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {editMode ? (
              <input
                type="text"
                value={editTitle}
                onChange={(e) => { setEditTitle(e.target.value); setDirty(true); }}
                className="w-full text-base font-semibold bg-transparent border-b border-input focus:border-ring focus:outline-none"
                maxLength={500}
              />
            ) : (
              <h2 className="text-base font-semibold truncate">{history.task.title}</h2>
            )}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {editMode ? (
                <>
                  <select
                    value={editStatus}
                    onChange={(e) => { setEditStatus(e.target.value as TaskStatus); setDirty(true); }}
                    className="text-[10px] px-2 py-0.5 rounded-full font-medium border bg-transparent focus:outline-none cursor-pointer"
                  >
                    <option value="todo">todo</option>
                    <option value="in-progress">in-progress</option>
                    <option value="review">review</option>
                    <option value="done">done</option>
                    <option value="cancelled">cancelled</option>
                  </select>
                  <select
                    value={editPriority}
                    onChange={(e) => { setEditPriority(e.target.value as TaskPriority); setDirty(true); }}
                    className={`text-[10px] px-2 py-0.5 rounded-full font-medium border bg-transparent focus:outline-none cursor-pointer ${getPriorityColor(editPriority)}`}
                  >
                    <option value="critical">critical</option>
                    <option value="high">high</option>
                    <option value="normal">normal</option>
                    <option value="low">low</option>
                  </select>
                </>
              ) : (
                <>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${getStatusColor(history.task.status)}`}>
                    {history.task.status}
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${getPriorityColor(history.task.priority)}`}>
                    {history.task.priority}
                  </span>
                </>
              )}
              {history.task.assignee && (
                <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
                  <User size={10} />
                  {history.task.assignee}
                </span>
              )}
              {history.pr && (
                <a
                  href={history.pr.url || `#pr-${history.pr.number}`}
                  className="text-[10px] text-cyan-400 hover:underline inline-flex items-center gap-1"
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                >
                  <GitPullRequest size={10} />
                  PR #{history.pr.number}
                </a>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!editMode ? (
              <button
                onClick={() => setEditMode(true)}
                className="p-1.5 rounded-md hover:bg-muted transition-colors"
                title="Edit task"
              >
                <Edit2 size={16} className="text-muted-foreground" />
              </button>
            ) : (
              <>
                <button
                  onClick={handleSave}
                  disabled={saving || !dirty}
                  className="p-1.5 rounded-md bg-green-600 hover:bg-green-500 transition-colors disabled:opacity-50"
                  title="Save changes"
                >
                  <Save size={16} className={`text-white ${saving ? 'animate-spin' : ''}`} />
                </button>
                <button
                  onClick={() => { setEditMode(false); fetchHistory(); setDirty(false); }}
                  className="p-1.5 rounded-md hover:bg-muted transition-colors"
                  title="Cancel"
                >
                  <X size={16} className="text-muted-foreground" />
                </button>
              </>
            )}
            <button
              onClick={handleClose}
              className="p-1.5 rounded-md hover:bg-muted transition-colors shrink-0"
              title="Close"
            >
              <X size={18} className="text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Content - Scrollable area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {error && (
            <div className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2 flex items-center gap-1.5">
              <AlertCircle size={12} />
              {error}
            </div>
          )}

          {/* Description */}
          <section>
            <h3 className="text-sm font-semibold mb-2">Description</h3>
            {editMode ? (
              <textarea
                value={editDescription}
                onChange={(e) => { setEditDescription(e.target.value); setDirty(true); }}
                placeholder="Task description (markdown supported)..."
                rows={8}
                className="w-full min-h-[180px] rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none resize-y"
              />
            ) : (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {history.task.description || 'No description'}
              </p>
            )}
          </section>

          {/* Labels */}
          <section>
            <h3 className="text-sm font-semibold mb-2">Labels</h3>
            {editMode ? (
              <input
                type="text"
                value={editLabels}
                onChange={(e) => { setEditLabels(e.target.value); setDirty(true); }}
                placeholder="Comma-separated labels (e.g., bug, urgent)"
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none"
              />
            ) : history.task.labels && history.task.labels.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {history.task.labels.map((label, idx) => (
                  <span
                    key={idx}
                    className="text-[10px] px-2 py-0.5 rounded-md bg-muted text-muted-foreground"
                  >
                    {label}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No labels</p>
            )}
          </section>

          {/* Assignee */}
          <section>
            <h3 className="text-sm font-semibold mb-2">Assignee</h3>
            {editMode ? (
              <input
                type="text"
                value={editAssignee}
                onChange={(e) => { setEditAssignee(e.target.value); setDirty(true); }}
                placeholder="operator"
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none"
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                {history.task.assignee || 'Unassigned'}
              </p>
            )}
          </section>

          {/* Dependencies */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">Dependencies</h3>
              <button
                onClick={() => { loadAllTasks(); setShowDependencyPicker(true); }}
                className="text-xs text-primary hover:underline"
              >
                + Add
              </button>
            </div>
            <DependencyPanel
              taskId={taskId}
              onOpenPicker={() => { loadAllTasks(); setShowDependencyPicker(true); }}
            />
          </section>

          {/* Budget */}
          <section>
            <BudgetPanel taskId={taskId} />
          </section>

          {/* Plan-First Workflow */}
          <section>
            <PlanPanel taskId={taskId} canEdit={true} canReview={false} />
          </section>

          {/* Live Agent Chat */}
          <section>
            <h3 className="text-sm font-semibold mb-3 inline-flex items-center gap-2">
              <MessageSquare size={16} />
              Live Agent Chat
            </h3>
            <TaskChatPanel taskId={taskId} />
          </section>

          {/* Agent Execution */}
          {history.agents && history.agents.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold mb-3">Agent Execution</h3>
              <div className="space-y-2">
                {history.agents.map((agent, idx) => {
                  const avatar = AGENT_AVATARS[agent.name] || { emoji: '🤖', color: '#64748b', role: 'Agent' };
                  const isExpanded = expandedAgent === agent.name;

                  return (
                    <div
                      key={idx}
                      className="border rounded-lg overflow-hidden"
                    >
                      <button
                        onClick={() => setExpandedAgent(isExpanded ? null : agent.name)}
                        className="w-full p-3 flex items-center gap-3 hover:bg-muted/50 transition-colors text-left"
                      >
                        <span className="text-xl">{avatar.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium">{agent.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {agent.completedAt ? formatTime(agent.completedAt) : 'Running...'}
                          </div>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${getStatusColor(agent.status)}`}>
                          {agent.status}
                        </span>
                      </button>

                      {isExpanded && (
                        <div className="px-3 pb-3 border-t pt-3 space-y-3">
                          {agent.output ? (
                            <div>
                              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                                Output
                              </div>
                              <div className="text-xs bg-muted/50 rounded p-2 border font-mono whitespace-pre-wrap max-h-[300px] overflow-y-auto">
                                {agent.output}
                              </div>
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">No output captured</p>
                          )}

                          {agent.error && (
                            <div className="p-2 rounded bg-red-500/10 border border-red-500/30">
                              <div className="text-[10px] font-semibold text-red-400 uppercase tracking-wide mb-1">
                                Error
                              </div>
                              <div className="text-xs text-red-400 font-mono">{agent.error}</div>
                            </div>
                          )}

                          {agent.sessionKey && (
                            <div className="text-[10px] text-muted-foreground">
                              Session: <code className="bg-muted px-1.5 py-0.5 rounded">{agent.sessionKey}</code>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Audit Log Timeline */}
          {history.auditLog && history.auditLog.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold mb-3">Execution Timeline</h3>
              <div className="space-y-0 relative">
                {/* Timeline line */}
                <div className="absolute left-2 top-2 bottom-2 w-px bg-muted" />

                {history.auditLog
                  .slice()
                  .reverse()
                  .map((entry, idx) => {
                    const isExpanded = expandedAudit === idx;
                    return (
                      <div key={idx} className="relative pl-8 py-2">
                        {/* Timeline dot */}
                        <div className="absolute left-0 top-3 w-4 h-4 rounded-full bg-card border-2 border-primary flex items-center justify-center z-10">
                          {getActionIcon(entry.action)}
                        </div>

                        <button
                          onClick={() => setExpandedAudit(isExpanded ? null : idx)}
                          className="w-full text-left hover:bg-muted/30 rounded p-2 -ml-2 transition-colors"
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-medium">{entry.action}</span>
                            <span className="text-[10px] text-muted-foreground">
                              {formatTime(entry.ts)}
                            </span>
                            {entry.actor && (
                              <span className="text-[10px] text-muted-foreground">
                                by {entry.actor}
                              </span>
                            )}
                          </div>
                          {entry.detail && !isExpanded && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                              {entry.detail}
                            </p>
                          )}
                        </button>

                        {isExpanded && entry.detail && (
                          <div className="ml-4 mt-2 p-2 bg-muted/50 rounded border text-xs text-muted-foreground">
                            {entry.detail}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </section>
          )}

          {/* PR Status */}
          {history.pr && (
            <section>
              <h3 className="text-sm font-semibold mb-3">Pull Request</h3>
              <div className="p-3 border rounded-lg bg-muted/30 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <GitPullRequest size={16} className="text-cyan-400" />
                  <span className="text-sm font-medium">
                    PR #{history.pr.number}
                  </span>
                  {history.pr.status && (
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${
                      history.pr.status === 'merged' ? 'bg-green-500/20 text-green-400 border-green-500/30' :
                      history.pr.status === 'closed' ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                      history.pr.status === 'draft' ? 'bg-gray-500/20 text-gray-400 border-gray-500/30' :
                      'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
                    }`}>
                      {history.pr.status}
                    </span>
                  )}
                </div>

                {history.pr.branch && (
                  <div className="text-xs text-muted-foreground">
                    Branch: <code className="bg-muted px-1.5 py-0.5 rounded">{history.pr.branch}</code>
                  </div>
                )}

                {history.pr.url && (
                  <a
                    href={history.pr.url}
                    className="text-xs text-cyan-400 hover:underline inline-flex items-center gap-1"
                    target="_blank"
                    rel="noreferrer"
                  >
                    View on GitHub →
                  </a>
                )}

                {/* Review Status */}
                {(history.pr.reviewPassed !== undefined || history.pr.criticalIssues !== undefined || history.pr.highIssues !== undefined) && (
                  <div className="pt-2 border-t">
                    <div className="text-xs font-semibold mb-1">Review Status</div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {history.pr.reviewPassed !== undefined && (
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                          history.pr.reviewPassed
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-red-500/20 text-red-400'
                        }`}>
                          {history.pr.reviewPassed ? '✓ PASSED' : '✗ FAILED'}
                        </span>
                      )}
                      {history.pr.criticalIssues !== undefined && history.pr.criticalIssues > 0 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500 text-white">
                          {history.pr.criticalIssues} critical
                        </span>
                      )}
                      {history.pr.highIssues !== undefined && history.pr.highIssues > 0 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500 text-white">
                          {history.pr.highIssues} high
                        </span>
                      )}
                      {history.pr.reviewComments !== undefined && history.pr.reviewComments > 0 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                          {history.pr.reviewComments} comments
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Next Action - Workflow Buttons */}
          <section className="pt-4 border-t">
            <h3 className="text-sm font-semibold mb-3">Next Action</h3>
            <div className="space-y-3">
              {/* Action message */}
              {actionMessage && (
                <div className="p-2 rounded bg-muted/50 border text-xs text-muted-foreground">
                  {actionMessage}
                </div>
              )}

              {/* In-progress actions */}
              {history.task.status === 'in-progress' && (
                <div className="p-3 border rounded-lg bg-muted/30">
                  <p className="text-xs text-muted-foreground mb-2">Task is currently being executed by agents</p>
                  <button
                    onClick={async () => {
                      try {
                        const res = await fetch(`/api/orchestrator/cancel/${taskId}`, {
                          method: 'POST',
                          credentials: 'include',
                        });
                        if (res.ok) {
                          setActionMessage('Task cancelled');
                          fetchHistory();
                        } else {
                          const data = await res.json();
                          setActionMessage(`Failed to cancel: ${data.error || 'Unknown error'}`);
                        }
                      } catch (err) {
                        console.error('Failed to cancel task:', err);
                        setActionMessage(`Failed to cancel: ${err instanceof Error ? err.message : 'Unknown error'}`);
                      }
                    }}
                    disabled={isLoading(taskId, 'review')}
                    className="text-xs px-3 py-1.5 rounded-md bg-red-600 hover:bg-red-500 text-white font-medium transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
                  >
                    {isLoading(taskId, 'review') ? <Loader2 size={12} className="animate-spin" /> : <Square size={12} />}
                    Abort Execution
                  </button>
                </div>
              )}

              {/* Review actions */}
              {history.task.status === 'review' && history.pr && !history.pr.reviewPassed && (
                <div className="p-3 border rounded-lg bg-muted/30 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    {history.pr.reviewPassed === false
                      ? 'Review found issues that need to be fixed'
                      : 'Task is ready for automated review'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={async () => {
                        try {
                          const result = await runReview(taskId);
                          setActionMessage(result.message || 'Review started');
                          fetchHistory();
                        } catch (err) {
                          console.error('Review failed:', err);
                          setActionMessage(err instanceof Error ? err.message : 'Review failed');
                        }
                      }}
                      disabled={isLoading(taskId, 'review')}
                      className="text-xs px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
                    >
                      {isLoading(taskId, 'review') ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
                      Run Automated Review
                    </button>
                    {history.pr.reviewPassed === false && (
                      <button
                        onClick={async () => {
                          try {
                            const result = await fixIssues(taskId);
                            setActionMessage(result.message || 'Fix agent started');
                            fetchHistory();
                          } catch (err) {
                            console.error('Fix failed:', err);
                            setActionMessage(err instanceof Error ? err.message : 'Fix failed');
                          }
                        }}
                        disabled={isLoading(taskId, 'fix')}
                        className="text-xs px-3 py-1.5 rounded-md bg-amber-600 hover:bg-amber-500 text-white font-medium transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
                      >
                        {isLoading(taskId, 'fix') ? <Loader2 size={12} className="animate-spin" /> : <Edit2 size={12} />}
                        Fix Issues
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Rerun review after fixes */}
              {history.task.status === 'review' && history.pr && history.pr.reviewPassed === false && (
                <div className="p-3 border rounded-lg bg-muted/30">
                  <p className="text-xs text-muted-foreground mb-2">Issues were found. After fixing, rerun review</p>
                  <button
                    onClick={async () => {
                      try {
                        const result = await rerunReview(taskId);
                        setActionMessage(result.message || 'Re-review started');
                        fetchHistory();
                      } catch (err) {
                        console.error('Re-review failed:', err);
                        setActionMessage(err instanceof Error ? err.message : 'Re-review failed');
                      }
                    }}
                    disabled={isLoading(taskId, 'rerun')}
                    className="text-xs px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
                  >
                    {isLoading(taskId, 'rerun') ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
                    Rerun Review
                  </button>
                </div>
              )}

              {/* Approval actions */}
              {history.task.status === 'review' && history.pr && history.pr.reviewPassed === true && (
                <div className="p-3 border rounded-lg bg-muted/30 space-y-2">
                  <p className="text-xs text-muted-foreground">Review passed. Ready for merge approval</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={async () => {
                        try {
                          const result = await approveTask(taskId);
                          setActionMessage(result.message || 'Task approved for merge');
                          fetchHistory();
                        } catch (err) {
                          console.error('Approval failed:', err);
                          setActionMessage(err instanceof Error ? err.message : 'Approval failed');
                        }
                      }}
                      disabled={isLoading(taskId, 'approve')}
                      className="text-xs px-3 py-1.5 rounded-md bg-green-600 hover:bg-green-500 text-white font-medium transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
                    >
                      {isLoading(taskId, 'approve') ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                      Approve & Merge
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          const result = await rejectTask(taskId);
                          setActionMessage(result.message || 'Task rejected');
                          fetchHistory();
                        } catch (err) {
                          console.error('Rejection failed:', err);
                          setActionMessage(err instanceof Error ? err.message : 'Rejection failed');
                        }
                      }}
                      disabled={isLoading(taskId, 'reject')}
                      className="text-xs px-3 py-1.5 rounded-md bg-red-600 hover:bg-red-500 text-white font-medium transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
                    >
                      {isLoading(taskId, 'reject') ? <Loader2 size={12} className="animate-spin" /> : <AlertCircle size={12} />}
                      Reject
                    </button>
                  </div>
                </div>
              )}

              {/* Done state */}
              {history.task.status === 'done' && history.pr && (
                <div className="p-3 border rounded-lg bg-muted/30">
                  <p className="text-xs text-muted-foreground mb-2">Task completed and merged</p>
                  {history.pr.url && (
                    <a
                      href={history.pr.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-cyan-400 hover:underline inline-flex items-center gap-1"
                    >
                      <GitPullRequest size={12} />
                      View Merged PR
                    </a>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Timestamps */}
          <section className="pt-4 border-t">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Created: {formatTime(history.task.createdAt)}</span>
              <span>Updated: {formatTime(history.task.updatedAt)}</span>
            </div>
          </section>
        </div>

        {/* Sticky Bottom Action Bar */}
        <div className="shrink-0 border-t border-border bg-background/90 backdrop-blur-sm px-4 py-3 flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            {dirty ? <span className="text-amber-400">Unsaved changes</span> : 'No changes'}
          </div>
          <div className="flex items-center gap-2">
            {editMode ? (
              <>
                <button
                  onClick={() => { setEditMode(false); fetchHistory(); setDirty(false); }}
                  disabled={saving}
                  className="px-3 py-1.5 text-xs rounded-md border border-input bg-transparent hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !dirty}
                  className="px-3 py-1.5 text-xs rounded-md bg-green-600 hover:bg-green-500 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                >
                  {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                  Save Changes
                </button>
              </>
            ) : (
              <button
                onClick={() => setEditMode(true)}
                className="px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 font-medium transition-colors inline-flex items-center gap-1.5"
              >
                <Edit2 size={12} />
                Edit Task
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Dependency Picker Modal */}
      {showDependencyPicker && (
        <DependencyPicker
          taskId={taskId}
          allTasks={allTasks}
          existingDependencies={dependencyData?.dependencies?.blocked_by ?? []}
          onOpenChange={setShowDependencyPicker}
          onSelect={handleAddDependency}
        />
      )}
    </div>
  );
}
