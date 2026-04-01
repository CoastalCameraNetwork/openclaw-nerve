/**
 * AgentAvailabilityDashboard - Real-time agent status dashboard
 */

import { useState, useCallback } from 'react';
import { RefreshCw, Users } from 'lucide-react';
import { useAgentStatus } from './useAgentStatus';
import { AgentCard } from './AgentCard';

interface AgentAvailabilityDashboardProps {
  onAgentClick?: (agentName: string) => void;
}

export function AgentAvailabilityDashboard({ onAgentClick }: AgentAvailabilityDashboardProps) {
  const { agents, loading, error, refresh } = useAgentStatus(30000); // Refresh every 30 seconds
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
    total: agents.length,
    available: agents.filter((a) => a.status === 'available').length,
    busy: agents.filter((a) => a.status === 'busy').length,
    unavailable: agents.filter((a) => a.status === 'unavailable').length,
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Users className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Agent Availability</h1>
            <p className="text-sm text-muted-foreground">
              Real-time status of specialist agents
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
      <div className="grid grid-cols-4 gap-4">
        <div className="p-4 rounded-lg border bg-card">
          <div className="text-2xl font-bold">{stats.total}</div>
          <div className="text-sm text-muted-foreground">Total Agents</div>
        </div>
        <div className="p-4 rounded-lg border bg-card">
          <div className="text-2xl font-bold text-green-400">{stats.available}</div>
          <div className="text-sm text-muted-foreground">Available</div>
        </div>
        <div className="p-4 rounded-lg border bg-card">
          <div className="text-2xl font-bold text-yellow-400">{stats.busy}</div>
          <div className="text-sm text-muted-foreground">Busy</div>
        </div>
        <div className="p-4 rounded-lg border bg-card">
          <div className="text-2xl font-bold text-red-400">{stats.unavailable}</div>
          <div className="text-sm text-muted-foreground">Unavailable</div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive">
          {error}
        </div>
      )}

      {/* Agent Grid */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">
          Loading agent status...
        </div>
      ) : agents.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No agents available
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {agents.map((agent) => (
            <AgentCard
              key={agent.name}
              agent={agent}
              onClick={() => onAgentClick?.(agent.name)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
