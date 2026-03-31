/**
 * BatchActionBar - Floating action bar for batch operations
 */

import { useState, useCallback } from 'react';
import { X, Check, XCircle, FolderOpen, Tag, Trash2, Loader2 } from 'lucide-react';

interface BatchActionBarProps {
  selectedCount: number;
  selectedIds: string[];
  onClear: () => void;
  onActionComplete?: () => void;
}

type BatchAction = 'approve' | 'reject' | 'move' | 'add_labels' | 'delete';

export function BatchActionBar({ selectedCount, selectedIds, onClear, onActionComplete }: BatchActionBarProps) {
  const [action, setAction] = useState<BatchAction | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moveStatus, setMoveStatus] = useState<string>('done');
  const [labelsInput, setLabelsInput] = useState('');
  const [rejectReason, setRejectReason] = useState('');

  const executeAction = useCallback(async (actionType: BatchAction, payload?: Record<string, unknown>) => {
    try {
      setLoading(true);
      setError(null);
      setAction(actionType);

      const res = await fetch('/api/kanban/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          taskIds: selectedIds,
          action: actionType,
          payload,
        }),
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.details || 'Batch action failed');
      }

      onActionComplete?.();
      onClear();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Batch action failed');
    } finally {
      setLoading(false);
      setAction(null);
    }
  }, [selectedIds, onActionComplete, onClear]);

  const handleApprove = () => executeAction('approve');
  const handleDelete = () => {
    if (confirm(`Are you sure you want to delete ${selectedCount} task(s)?`)) {
      executeAction('delete');
    }
  };

  const handleMove = () => {
    executeAction('move', { status: moveStatus });
  };

  const handleAddLabels = () => {
    const labels = labelsInput.split(',').map((l) => l.trim()).filter(Boolean);
    if (labels.length === 0) return;
    executeAction('add_labels', { labels });
  };

  const handleReject = () => {
    if (!rejectReason.trim()) {
      setError('Please provide a rejection reason');
      return;
    }
    executeAction('reject', { reason: rejectReason });
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-card border shadow-lg rounded-lg px-4 py-3 flex items-center gap-4">
      <span className="text-sm font-medium">
        {selectedCount} task{selectedCount !== 1 ? 's' : ''} selected
      </span>

      <div className="h-6 w-px bg-border" />

      {/* Approve */}
      <button
        onClick={handleApprove}
        disabled={loading}
        className="text-xs px-3 py-1.5 rounded-md bg-green-600 hover:bg-green-500 text-white font-medium transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
      >
        {action === 'approve' && loading ? (
          <Loader2 size={12} className="animate-spin" />
        ) : (
          <Check size={12} />
        )}
        Approve
      </button>

      {/* Move */}
      <div className="flex items-center gap-2">
        <select
          value={moveStatus}
          onChange={(e) => setMoveStatus(e.target.value)}
          disabled={loading}
          className="text-xs px-2 py-1.5 rounded-md border border-input bg-transparent focus:outline-none disabled:opacity-50"
        >
          <option value="todo">todo</option>
          <option value="in-progress">in-progress</option>
          <option value="review">review</option>
          <option value="done">done</option>
          <option value="cancelled">cancelled</option>
        </select>
        <button
          onClick={handleMove}
          disabled={loading}
          className="text-xs px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          {action === 'move' && loading ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <FolderOpen size={12} />
          )}
          Move
        </button>
      </div>

      {/* Add Labels */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={labelsInput}
          onChange={(e) => setLabelsInput(e.target.value)}
          placeholder="labels"
          disabled={loading}
          className="text-xs px-2 py-1.5 rounded-md border border-input bg-transparent focus:outline-none w-32 disabled:opacity-50"
        />
        <button
          onClick={handleAddLabels}
          disabled={loading}
          className="text-xs px-3 py-1.5 rounded-md bg-purple-600 hover:bg-purple-500 text-white font-medium transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          {action === 'add_labels' && loading ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Tag size={12} />
          )}
          Add
        </button>
      </div>

      {/* Reject */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          placeholder="Reason..."
          disabled={loading}
          className="text-xs px-2 py-1.5 rounded-md border border-input bg-transparent focus:outline-none w-40 disabled:opacity-50"
        />
        <button
          onClick={handleReject}
          disabled={loading}
          className="text-xs px-3 py-1.5 rounded-md bg-amber-600 hover:bg-amber-500 text-white font-medium transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          {action === 'reject' && loading ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <XCircle size={12} />
          )}
          Reject
        </button>
      </div>

      {/* Delete */}
      <button
        onClick={handleDelete}
        disabled={loading}
        className="text-xs px-3 py-1.5 rounded-md bg-red-600 hover:bg-red-500 text-white font-medium transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
      >
        {action === 'delete' && loading ? (
          <Loader2 size={12} className="animate-spin" />
        ) : (
          <Trash2 size={12} />
        )}
        Delete
      </button>

      <div className="h-6 w-px bg-border" />

      {/* Error */}
      {error && (
        <span className="text-xs text-destructive">{error}</span>
      )}

      {/* Clear */}
      <button
        onClick={onClear}
        disabled={loading}
        className="p-1.5 rounded-md hover:bg-muted transition-colors disabled:opacity-50"
        title="Clear selection"
      >
        <X size={16} className="text-muted-foreground" />
      </button>
    </div>
  );
}
