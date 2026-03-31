/**
 * GoalCard - Displays a single goal with progress
 */

import { Target, Calendar, CheckCircle2, Circle, AlertCircle, Archive, Trash2, Edit2 } from 'lucide-react';
import type { GoalWithProgress } from './useGoals';

interface GoalCardProps {
  goal: GoalWithProgress;
  onEdit?: (goal: GoalWithProgress) => void;
  onArchive?: (goal: GoalWithProgress) => void;
  onDelete?: (goal: GoalWithProgress) => void;
  onClick?: (goal: GoalWithProgress) => void;
}

export function GoalCard({ goal, onEdit, onArchive, onDelete, onClick }: GoalCardProps) {
  const isCompleted = goal.status === 'completed';
  const isArchived = goal.status === 'archived';
  const isBlocked = goal.blockedTasks > 0;

  const formatDate = (ts?: number) => {
    if (!ts) return '';
    return new Date(ts).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getStatusColor = () => {
    if (isCompleted) return 'bg-green-500/20 text-green-400 border-green-500/30';
    if (isArchived) return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    if (isBlocked) return 'bg-red-500/20 text-red-400 border-red-500/30';
    return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
  };

  const getStatusLabel = () => {
    if (isCompleted) return 'Completed';
    if (isArchived) return 'Archived';
    if (isBlocked) return 'Blocked';
    return 'Active';
  };

  const getStatusIcon = () => {
    if (isCompleted) return <CheckCircle2 size={14} />;
    if (isArchived) return <Archive size={14} />;
    if (isBlocked) return <AlertCircle size={14} />;
    return <Circle size={14} />;
  };

  return (
    <div
      onClick={() => onClick?.(goal)}
      className={`rounded-lg border p-4 transition-colors cursor-pointer hover:bg-muted/50 ${
        isCompleted ? 'opacity-75' : ''
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Target className={`h-5 w-5 shrink-0 ${isCompleted ? 'text-green-400' : 'text-primary'}`} />
          <h3 className="font-semibold truncate">{goal.title}</h3>
        </div>
        <div className="flex items-center gap-1">
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border inline-flex items-center gap-1 ${getStatusColor()}`}>
            {getStatusIcon()}
            {getStatusLabel()}
          </span>
          {onEdit && (
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(goal); }}
              className="p-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Edit2 size={14} />
            </button>
          )}
          {onArchive && !isArchived && !isCompleted && (
            <button
              onClick={(e) => { e.stopPropagation(); onArchive(goal); }}
              className="p-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Archive size={14} />
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(goal); }}
              className="p-1 text-muted-foreground hover:text-red-400 transition-colors"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Description */}
      {goal.description && (
        <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
          {goal.description}
        </p>
      )}

      {/* Progress Bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-muted-foreground">Progress</span>
          <span className="font-medium">
            {goal.completedTasks}/{goal.totalTasks} tasks
          </span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${
              isCompleted
                ? 'bg-green-500'
                : isBlocked
                ? 'bg-red-500'
                : 'bg-primary'
            }`}
            style={{ width: `${goal.progressPercent}%` }}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <Calendar size={12} />
          <span>{formatDate(goal.createdAt)}</span>
        </div>
        {goal.targetDate && (
          <div className="flex items-center gap-1">
            <span>Target:</span>
            <span className={new Date(goal.targetDate).getTime() < Date.now() && !isCompleted ? 'text-red-400 font-medium' : ''}>
              {formatDate(goal.targetDate)}
            </span>
          </div>
        )}
        {goal.blockedTasks > 0 && (
          <div className="flex items-center gap-1 text-red-400">
            <AlertCircle size={12} />
            <span>{goal.blockedTasks} blocked</span>
          </div>
        )}
      </div>
    </div>
  );
}
