/**
 * GoalsDashboard - Main goals view showing all goals with progress
 */

import { useState, useCallback } from 'react';
import { Target, Plus, Filter, Search, AlertCircle, X } from 'lucide-react';
import { useGoals, useDeleteGoal, useUpdateGoal } from './useGoals';
import type { GoalWithProgress } from './useGoals';
import { GoalCard } from './GoalCard';
import { CreateGoalDialog } from './CreateGoalDialog';

interface GoalsDashboardProps {
  onGoalClick?: (goal: GoalWithProgress) => void;
}

type StatusFilter = 'all' | 'active' | 'completed' | 'archived';

export function GoalsDashboard({ onGoalClick }: GoalsDashboardProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const { goals, loading, error, reload } = useGoals(
    statusFilter === 'all' ? undefined : statusFilter
  );
  const { deleteGoal } = useDeleteGoal();
  const { updateGoal } = useUpdateGoal();

  const handleArchive = useCallback(async (goal: GoalWithProgress) => {
    try {
      setActionError(null);
      await updateGoal(goal.id, {
        status: 'archived',
        version: goal.version,
      });
      reload();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to archive goal';
      console.error('Failed to archive goal:', err);
      setActionError(message);
    }
  }, [updateGoal, reload]);

  const handleDelete = useCallback(async (goal: GoalWithProgress) => {
    if (!confirm(`Are you sure you want to delete "${goal.title}"?`)) return;

    try {
      setActionError(null);
      await deleteGoal(goal.id);
      reload();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete goal';
      console.error('Failed to delete goal:', err);
      setActionError(message);
    }
  }, [deleteGoal, reload]);

  const handleEdit = useCallback((goal: GoalWithProgress) => {
    // TODO: Implement edit dialog
    console.log('Edit goal:', goal);
  }, []);

  const filteredGoals = goals.filter((goal) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      goal.title.toLowerCase().includes(query) ||
      (goal.description && goal.description.toLowerCase().includes(query))
    );
  });

  const stats = {
    total: goals.length,
    active: goals.filter((g) => g.status === 'active').length,
    completed: goals.filter((g) => g.status === 'completed').length,
    archived: goals.filter((g) => g.status === 'archived').length,
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Target className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Goals</h1>
            <p className="text-sm text-muted-foreground">
              Track outcomes, not just tasks
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowCreateDialog(true)}
          className="px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 font-medium transition-colors inline-flex items-center gap-2"
        >
          <Plus size={18} />
          New Goal
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="p-4 rounded-lg border bg-card">
          <div className="text-2xl font-bold">{stats.total}</div>
          <div className="text-sm text-muted-foreground">Total Goals</div>
        </div>
        <div className="p-4 rounded-lg border bg-card">
          <div className="text-2xl font-bold text-blue-400">{stats.active}</div>
          <div className="text-sm text-muted-foreground">Active</div>
        </div>
        <div className="p-4 rounded-lg border bg-card">
          <div className="text-2xl font-bold text-green-400">{stats.completed}</div>
          <div className="text-sm text-muted-foreground">Completed</div>
        </div>
        <div className="p-4 rounded-lg border bg-card">
          <div className="text-2xl font-bold text-gray-400">{stats.archived}</div>
          <div className="text-sm text-muted-foreground">Archived</div>
        </div>
      </div>

      {/* Action Error Display */}
      {actionError && (
        <div className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2 flex items-center gap-1.5">
          <AlertCircle size={12} />
          {actionError}
          <button
            onClick={() => setActionError(null)}
            className="ml-auto text-muted-foreground hover:text-foreground"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search goals..."
            className="w-full pl-9 pr-3 py-2 rounded-md border border-input bg-transparent text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-muted-foreground" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="px-3 py-2 rounded-md border border-input bg-transparent text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none"
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      </div>

      {/* Goals Grid */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">
          Loading goals...
        </div>
      ) : error ? (
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400">
          {error}
        </div>
      ) : filteredGoals.length === 0 ? (
        <div className="text-center py-12">
          <Target className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">
            {searchQuery
              ? 'No goals match your search'
              : statusFilter !== 'all'
              ? `No ${statusFilter} goals`
              : 'No goals yet. Create your first goal to get started!'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredGoals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              onClick={onGoalClick}
              onEdit={handleEdit}
              onArchive={handleArchive}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Create Goal Dialog */}
      {showCreateDialog && (
        <CreateGoalDialog
          onOpenChange={setShowCreateDialog}
          onSuccess={() => {
            reload();
            setShowCreateDialog(false);
          }}
        />
      )}
    </div>
  );
}
