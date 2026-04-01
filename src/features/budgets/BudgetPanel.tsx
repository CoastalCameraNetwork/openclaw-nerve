/**
 * BudgetPanel - Display and manage task/goal budget
 */

import { useState, useCallback } from 'react';
import { DollarSign, AlertTriangle, PauseCircle } from 'lucide-react';
import { useBudgets } from './useBudgets';

interface BudgetPanelProps {
  taskId?: string;
  goalId?: string;
}

export function BudgetPanel({ taskId, goalId }: BudgetPanelProps) {
  const { budgets, spending, alerts, loadBudgets, createBudget, deleteBudget } = useBudgets(taskId, goalId);
  const [showCreate, setShowCreate] = useState(false);
  const [maxCost, setMaxCost] = useState('');
  const [action, setAction] = useState<'pause' | 'notify'>('pause');

  const handleCreate = useCallback(async () => {
    const value = parseFloat(maxCost);
    if (isNaN(value) || value <= 0) return;

    await createBudget({
      maxCostUSD: value,
      softLimitPercent: 80,
      action,
    });
    setShowCreate(false);
    setMaxCost('');
  }, [maxCost, action, createBudget]);

  const statusColor = spending?.status === 'exceeded'
    ? 'text-red-400'
    : spending?.status === 'warning'
    ? 'text-yellow-400'
    : 'text-green-400';

  const barColor = spending?.status === 'exceeded'
    ? 'bg-red-500'
    : spending?.status === 'warning'
    ? 'bg-yellow-500'
    : 'bg-green-500';

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold inline-flex items-center gap-2">
          <DollarSign size={16} />
          Budget
        </h3>
        {!budgets.length && !showCreate && (
          <button
            onClick={() => { setShowCreate(true); loadBudgets(); }}
            className="text-xs text-primary hover:underline"
          >
            + Set Budget
          </button>
        )}
      </div>

      {/* Create Budget Form */}
      {showCreate && (
        <div className="p-3 border rounded-md space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={maxCost}
              onChange={(e) => setMaxCost(e.target.value)}
              placeholder="Max cost (USD)"
              className="flex-1 px-2 py-1 rounded-md border border-input bg-transparent text-sm"
              step="0.01"
              min="0"
            />
            <select
              value={action}
              onChange={(e) => setAction(e.target.value as 'pause' | 'notify')}
              className="px-2 py-1 rounded-md border border-input bg-transparent text-sm"
            >
              <option value="pause">Pause at limit</option>
              <option value="notify">Notify at limit</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              className="text-xs px-3 py-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Save
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="text-xs px-3 py-1 rounded-md border border-input hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Budget Display */}
      {budgets.length > 0 && spending && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Spent</span>
            <span className={`font-medium ${statusColor}`}>
              ${spending.currentCost.toFixed(2)} / ${spending.budget.maxCostUSD.toFixed(2)}
            </span>
          </div>

          {/* Progress Bar */}
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full ${barColor} transition-all`}
              style={{ width: `${Math.min(spending.percentUsed, 100)}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {spending.percentUsed.toFixed(1)}% used
            </span>
            {spending.status === 'warning' && (
              <span className="text-yellow-400 inline-flex items-center gap-1">
                <AlertTriangle size={12} />
                Approaching limit
              </span>
            )}
            {spending.status === 'exceeded' && (
              <span className="text-red-400 inline-flex items-center gap-1">
                <PauseCircle size={12} />
                {spending.budget.action === 'pause' ? 'Paused' : 'Exceeded'}
              </span>
            )}
          </div>

          {/* Delete Button */}
          <button
            onClick={() => {
              if (confirm('Delete this budget?')) {
                deleteBudget(budgets[0].id);
              }
            }}
            className="text-xs text-destructive hover:underline"
          >
            Remove Budget
          </button>
        </div>
      )}

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="pt-3 border-t space-y-1">
          <div className="text-xs font-medium text-muted-foreground">Recent Alerts</div>
          {alerts.slice(-3).map((alert, idx) => (
            <div key={idx} className="text-xs text-destructive flex items-center gap-1">
              <AlertTriangle size={10} />
              {alert.action === 'paused' ? 'Budget exceeded - paused' : 'Budget warning'}
              <span className="text-muted-foreground">
                ({new Date(alert.triggeredAt).toLocaleTimeString()})
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
