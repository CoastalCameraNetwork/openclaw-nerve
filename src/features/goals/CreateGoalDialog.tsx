/**
 * CreateGoalDialog - Dialog for creating a new goal
 */

import { useState } from 'react';
import { X, Loader2, Target } from 'lucide-react';
import { useCreateGoal } from './useGoals';

interface CreateGoalDialogProps {
  onOpenChange: (open: boolean) => void;
  onSuccess?: (goalId: string) => void;
}

export function CreateGoalDialog({ onOpenChange, onSuccess }: CreateGoalDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [targetDate, setTargetDate] = useState('');

  const { createGoal, loading, error } = useCreateGoal();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!title.trim()) {
      setSubmitError('Title is required');
      return;
    }

    try {
      const params: {
        title: string;
        description?: string;
        targetDate?: number;
      } = {
        title: title.trim(),
        description: description.trim() || undefined,
      };

      if (targetDate) {
        params.targetDate = new Date(targetDate).getTime();
      }

      const goal = await createGoal(params);
      onSuccess?.(goal.id);
      onOpenChange(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to create goal');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg border bg-background p-6 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Create New Goal</h2>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Launch Mobile App"
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the outcome you want to achieve..."
              rows={3}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Target Date
            </label>
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none"
            />
          </div>

          {submitError && (
            <div className="p-2 rounded bg-red-500/10 border border-red-500/30 text-xs text-red-400">
              {submitError}
            </div>
          )}

          {error && (
            <div className="p-2 rounded bg-red-500/10 border border-red-500/30 text-xs text-red-400">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={loading}
              className="px-3 py-1.5 text-sm rounded-md border border-input bg-transparent hover:bg-muted transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !title.trim()}
              className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              Create Goal
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
