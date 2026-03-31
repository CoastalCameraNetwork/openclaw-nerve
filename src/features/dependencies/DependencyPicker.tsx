/**
 * DependencyPicker - Dialog to select a task to add as a dependency
 */

import { useState, useCallback, useMemo } from 'react';
import { X, Search } from 'lucide-react';

interface TaskOption {
  id: string;
  title: string;
  status: string;
}

interface DependencyPickerProps {
  taskId: string;
  allTasks: TaskOption[];
  existingDependencies: string[];
  onOpenChange: (open: boolean) => void;
  onSelect: (dependsOnId: string) => Promise<void>;
}

export function DependencyPicker({
  taskId,
  allTasks,
  existingDependencies,
  onOpenChange,
  onSelect,
}: DependencyPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableTasks = useMemo(() => {
    return allTasks.filter(
      (task) =>
        task.id !== taskId && // Exclude self
        !existingDependencies.includes(task.id) // Exclude already added
    );
  }, [taskId, allTasks, existingDependencies]);

  const filteredTasks = useMemo(() => {
    if (!searchQuery.trim()) return availableTasks;
    const query = searchQuery.toLowerCase();
    return availableTasks.filter(
      (task) =>
        task.title.toLowerCase().includes(query) ||
        task.id.toLowerCase().includes(query)
    );
  }, [availableTasks, searchQuery]);

  const handleSelect = useCallback(async (task: TaskOption) => {
    try {
      setLoading(true);
      setError(null);
      await onSelect(task.id);
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add dependency';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [onSelect, onOpenChange]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card rounded-lg shadow-lg w-full max-w-md max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-semibold">Add Dependency</h3>
          <button
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tasks..."
              className="w-full pl-9 pr-3 py-2 rounded-md border border-input bg-transparent text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none"
              autoFocus
            />
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-4 mt-3 text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-2 py-1.5">
            {error}
          </div>
        )}

        {/* Task List */}
        <div className="flex-1 overflow-y-auto p-2">
          {filteredTasks.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {availableTasks.length === 0
                ? 'No available tasks to add as dependencies'
                : 'No tasks match your search'}
            </div>
          ) : (
            <ul className="space-y-1">
              {filteredTasks.map((task) => (
                <li key={task.id}>
                  <button
                    onClick={() => handleSelect(task)}
                    disabled={loading}
                    className="w-full text-left p-3 rounded-md hover:bg-muted disabled:opacity-50 transition-colors"
                  >
                    <div className="font-medium text-sm">{task.title}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {task.id} • {task.status}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
