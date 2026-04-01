/**
 * ModelStatusDashboard - Real-time model status and routing
 */

import { useState, useCallback } from 'react';
import { RefreshCw, Cpu, DollarSign, Clock, Activity } from 'lucide-react';
import { useModelStatus } from './useModelStatus';

interface ModelStatusDashboardProps {
  onModelSelect?: (model: string) => void;
}

export function ModelStatusDashboard({ onModelSelect }: ModelStatusDashboardProps) {
  const { models, loading, error, refresh } = useModelStatus(30000);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const stats = {
    total: models.length,
    available: models.filter((m) => m.available).length,
    avgCost: models.length > 0
      ? models.reduce((sum, m) => sum + m.costPerToken, 0) / models.length
      : 0,
  };

  const formatCost = (cost: number) => `$${(cost * 1000000).toFixed(2)}/1M tokens`;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Cpu className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Model Routing</h1>
            <p className="text-sm text-muted-foreground">
              Dynamic model selection and status
            </p>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing || loading}
          className="px-4 py-2 rounded-md border border-input hover:bg-muted font-medium transition-colors inline-flex items-center gap-2 disabled:opacity-50"
        >
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 rounded-lg border bg-card">
          <div className="text-2xl font-bold">{stats.total}</div>
          <div className="text-sm text-muted-foreground">Total Models</div>
        </div>
        <div className="p-4 rounded-lg border bg-card">
          <div className="text-2xl font-bold text-green-400">{stats.available}</div>
          <div className="text-sm text-muted-foreground">Available</div>
        </div>
        <div className="p-4 rounded-lg border bg-card">
          <div className="text-2xl font-bold text-blue-400">
            {formatCost(stats.avgCost)}
          </div>
          <div className="text-sm text-muted-foreground">Avg Cost</div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive">
          {error}
        </div>
      )}

      {/* Model Grid */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">
          Loading model status...
        </div>
      ) : models.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No models configured
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {models.map((model) => (
            <div
              key={model.model}
              onClick={() => onModelSelect?.(model.model)}
              className={`p-4 rounded-lg border cursor-pointer transition-shadow hover:shadow-md ${
                model.available
                  ? 'bg-green-500/10 border-green-500/30'
                  : 'bg-red-500/10 border-red-500/30'
              }`}
            >
              <div className="flex items-center gap-2 mb-3">
                <div
                  className={`w-3 h-3 rounded-full ${
                    model.available ? 'bg-green-500 animate-pulse' : 'bg-red-500'
                  }`}
                />
                <h3 className="font-semibold text-sm">{model.model}</h3>
              </div>

              <div className="space-y-2 text-xs text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1">
                    <DollarSign size={12} />
                    Cost
                  </span>
                  <span className="font-medium text-foreground">
                    {formatCost(model.costPerToken)}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1">
                    <Activity size={12} />
                    Queue
                  </span>
                  <span className="font-medium text-foreground">
                    {model.queueDepth} tasks
                  </span>
                </div>

                {model.avgLatencyMs > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1">
                      <Clock size={12} />
                      Latency
                    </span>
                    <span className="font-medium text-foreground">
                      {model.avgLatencyMs}ms
                    </span>
                  </div>
                )}
              </div>

              {!model.available && (
                <div className="mt-3 text-xs text-destructive">
                  Currently unavailable
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
