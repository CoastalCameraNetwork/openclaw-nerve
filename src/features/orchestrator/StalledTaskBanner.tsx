/**
 * StalledTaskBanner - Shows when a task is detected as stalled
 */

import { memo, useState, useCallback } from 'react';
import { AlertTriangle, RefreshCw, X } from 'lucide-react';

export interface StalledTaskData {
  taskId: string;
  title: string;
  stallDuration: number;
  autoResumesExhausted: boolean;
}

interface StalledTaskBannerProps {
  task: StalledTaskData;
  onResume: () => void;
  onDismiss: () => void;
}

export const StalledTaskBanner = memo(function StalledTaskBanner({
  task,
  onResume,
  onDismiss,
}: StalledTaskBannerProps) {
  const [loading, setLoading] = useState(false);

  const handleResume = useCallback(async () => {
    setLoading(true);
    try {
      await onResume();
    } finally {
      setLoading(false);
    }
  }, [onResume]);

  const formatDuration = (ms: number): string => {
    const minutes = Math.floor(ms / 60000);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  };

  return (
    <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg mb-4">
      <div className="flex items-start gap-3">
        <AlertTriangle size={20} className="text-amber-400 mt-0.5" />
        <div className="flex-1">
          <h4 className="text-sm font-semibold text-amber-200 mb-1">
            Task Stalled: {task.title}
          </h4>
          <p className="text-xs text-amber-100/70 mb-3">
            No activity for {formatDuration(task.stallDuration)}
            {task.autoResumesExhausted && (
              <span className="block mt-1 text-amber-300">
                Auto-resume attempts exhausted - manual intervention needed
              </span>
            )}
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleResume}
              disabled={loading}
              className="text-xs px-3 py-1.5 rounded-md bg-amber-600 hover:bg-amber-500 text-white font-medium transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              {loading ? 'Resuming...' : 'Resume Task'}
            </button>
            <button
              onClick={onDismiss}
              className="text-xs px-3 py-1.5 rounded-md border border-amber-500/30 hover:bg-amber-500/20 transition-colors"
            >
              <X size={12} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});
