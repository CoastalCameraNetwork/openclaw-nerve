/**
 * PlanPanel - Display and manage task plan
 *
 * Features:
 * - View plan status and content
 * - Create/edit draft plans
 * - Submit for review
 * - Approve/reject plans (supervisor role)
 * - Answer reviewer questions (for rejected plans)
 */

import { useState, useCallback } from 'react';
import { FileText, Edit2, Send, CheckCircle, XCircle, RotateCcw, MessageSquare } from 'lucide-react';
import { useTaskPlan, type PlanStatus } from './useTaskPlan';
import { PlanEditor } from './PlanEditor';
import { PlanReviewActions } from './PlanReviewActions';

interface PlanPanelProps {
  taskId: string;
  canEdit?: boolean;  // Can edit plan content
  canReview?: boolean;  // Can approve/reject (supervisor role)
}

export function PlanPanel({ taskId, canEdit = false, canReview = false }: PlanPanelProps) {
  const { plan, loading, error, updatePlan, submitPlan, approvePlan, rejectPlan, deletePlan } = useTaskPlan(taskId);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectQuestions, setRejectQuestions] = useState<string[]>([]);

  // Initialize edit content when entering edit mode
  const startEditing = useCallback(() => {
    setEditContent(plan?.content || '');
    setIsEditing(true);
  }, [plan?.content]);

  const saveEdit = useCallback(async () => {
    await updatePlan(editContent);
    setIsEditing(false);
  }, [editContent, updatePlan]);

  const handleSubmit = useCallback(async () => {
    await submitPlan();
  }, [submitPlan]);

  const handleApprove = useCallback(async () => {
    await approvePlan();
  }, [approvePlan]);

  const handleReject = useCallback(async () => {
    await rejectPlan(rejectReason, rejectQuestions);
    setShowRejectDialog(false);
    setRejectReason('');
    setRejectQuestions([]);
  }, [rejectReason, rejectQuestions, rejectPlan]);

  const handleDelete = useCallback(async () => {
    if (confirm('Delete this plan? This cannot be undone.')) {
      await deletePlan();
    }
  }, [deletePlan]);

  const getStatusBadge = (status: PlanStatus) => {
    switch (status) {
      case 'draft':
        return <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">Draft</span>;
      case 'in-review':
        return <span className="px-2 py-0.5 text-xs rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300">In Review</span>;
      case 'approved':
        return <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 inline-flex items-center gap-1"><CheckCircle size={12} /> Approved</span>;
      case 'rejected':
        return <span className="px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 inline-flex items-center gap-1"><XCircle size={12} /> Needs Revision</span>;
    }
  };

  if (loading) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        Loading plan...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-destructive bg-destructive/10 rounded-md">
        {error}
      </div>
    );
  }

  // No plan exists - show create button
  if (!plan) {
    return (
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold inline-flex items-center gap-2">
            <FileText size={16} />
            Implementation Plan
          </h3>
          {canEdit && (
            <button onClick={startEditing} className="text-xs text-primary hover:underline">
              + Create Plan
            </button>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          No plan yet. Create an implementation plan before starting work.
        </p>
        {isEditing && (
          <PlanEditor
            content={editContent}
            onChange={setEditContent}
            onSave={saveEdit}
            onCancel={() => setIsEditing(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold inline-flex items-center gap-2">
          <FileText size={16} />
          Implementation Plan
        </h3>
        <div className="flex items-center gap-2">
          {getStatusBadge(plan.status)}
          {canEdit && plan.status === 'draft' && !isEditing && (
            <button onClick={startEditing} className="text-muted-foreground hover:text-foreground">
              <Edit2 size={14} />
            </button>
          )}
          {plan.status === 'approved' && canReview && (
            <button onClick={handleDelete} className="text-muted-foreground hover:text-destructive" title="Reset plan">
              <RotateCcw size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Plan Content or Editor */}
      {isEditing ? (
        <PlanEditor
          content={editContent}
          onChange={setEditContent}
          onSave={saveEdit}
          onCancel={() => setIsEditing(false)}
        />
      ) : plan.content ? (
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <pre className="whitespace-pre-wrap text-sm font-mono bg-muted/50 p-3 rounded-md">
            {plan.content}
          </pre>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No plan content</p>
      )}

      {/* Action Buttons by Status */}
      <div className="flex items-center gap-2 pt-2 border-t">
        {plan.status === 'draft' && canEdit && (
          <>
            <button
              onClick={handleSubmit}
              className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1"
            >
              <Send size={12} /> Submit for Review
            </button>
            <button
              onClick={handleDelete}
              className="text-xs px-3 py-1.5 rounded-md border border-input hover:bg-muted"
            >
              Delete
            </button>
          </>
        )}

        {plan.status === 'in-review' && canReview && (
          <PlanReviewActions
            onApprove={handleApprove}
            onReject={() => setShowRejectDialog(true)}
          />
        )}

        {plan.status === 'rejected' && canEdit && (
          <>
            <button
              onClick={startEditing}
              className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1"
            >
              <Edit2 size={12} /> Revise Plan
            </button>
            {plan.rejectionReason && (
              <div className="text-xs text-muted-foreground ml-2">
                Reason: {plan.rejectionReason}
              </div>
            )}
          </>
        )}

        {plan.status === 'approved' && (
          <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
            <CheckCircle size={12} className="text-green-500" />
            Plan approved - work can proceed
          </div>
        )}
      </div>

      {/* Reviewer Questions (for rejected plans) */}
      {plan.reviewerQuestions && plan.reviewerQuestions.length > 0 && (
        <div className="border-t pt-3">
          <h4 className="text-xs font-medium text-muted-foreground mb-2 inline-flex items-center gap-1">
            <MessageSquare size={12} />
            Reviewer Questions
          </h4>
          <ul className="space-y-2">
            {plan.reviewerQuestions.map((q, idx) => (
              <li key={idx} className="text-sm p-2 rounded-md bg-muted/50">
                <div className="font-medium">{q.question}</div>
                {q.answer && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Answer: {q.answer}
                  </div>
                )}
                {q.resolved ? (
                  <span className="text-xs text-green-600 inline-flex items-center gap-1 mt-1">
                    <CheckCircle size={10} /> Answered
                  </span>
                ) : (
                  <span className="text-xs text-yellow-600 mt-1 block">Needs answer</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Reject Dialog */}
      {showRejectDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg shadow-lg w-full max-w-md p-6 space-y-4 border border-border">
            <h3 className="text-lg font-semibold">Reject Plan</h3>
            <div>
              <label className="text-sm font-medium mb-1 block">Rejection Reason</label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-input bg-transparent text-sm"
                rows={3}
                placeholder="Explain what needs to be revised..."
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Questions for Author (optional)</label>
              <div className="space-y-2">
                {rejectQuestions.map((q, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      value={q}
                      onChange={(e) => {
                        const updated = [...rejectQuestions];
                        updated[idx] = e.target.value;
                        setRejectQuestions(updated);
                      }}
                      className="flex-1 px-2 py-1 rounded-md border border-input bg-transparent text-sm"
                      placeholder="Question..."
                    />
                    <button
                      onClick={() => setRejectQuestions(rejectQuestions.filter((_, i) => i !== idx))}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <XCircle size={14} />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => setRejectQuestions([...rejectQuestions, ''])}
                  className="text-xs text-primary hover:underline"
                >
                  + Add Question
                </button>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowRejectDialog(false)}
                className="text-xs px-3 py-1.5 rounded-md border border-input hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={!rejectReason.trim()}
                className="text-xs px-3 py-1.5 rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
              >
                Reject Plan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
