/**
 * AgentBadges Component
 * 
 * Displays agent assignment badges for orchestrated tasks.
 */

import { memo } from 'react';
import { Users, GitMerge } from 'lucide-react';

interface AgentBadgesProps {
  agents: string[];
  sequence?: 'single' | 'sequential' | 'parallel';
  compact?: boolean;
}

const AGENT_ICONS: Record<string, string> = {
  'k8s-agent': '🔷',
  'mgmt-agent': '🎛️',
  'wordpress-agent': '🌐',
  'streaming-agent': '📹',
  'hls-recorder-agent': '📼',
  'splash-scripts-agent': '🎬',
  'database-agent': '🗄️',
  'storage-agent': '💾',
  'cdn-agent': '☁️',
  'cicd-agent': '🔄',
  'security-reviewer': '🔒',
  'orchestrator-agent': '🎯',
};

const AGENT_COLORS: Record<string, string> = {
  'k8s-agent': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'mgmt-agent': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  'wordpress-agent': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  'streaming-agent': 'bg-red-500/20 text-red-400 border-red-500/30',
  'hls-recorder-agent': 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  'splash-scripts-agent': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  'database-agent': 'bg-green-500/20 text-green-400 border-green-500/30',
  'storage-agent': 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  'cdn-agent': 'bg-sky-500/20 text-sky-400 border-sky-500/30',
  'cicd-agent': 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  'security-reviewer': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  'orchestrator-agent': 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

function getAgentShortName(agentName: string): string {
  return agentName.replace('-agent', '').replace('security-reviewer', 'security');
}

export const AgentBadges = memo(function AgentBadges({ 
  agents, 
  sequence = 'single',
  compact = false 
}: AgentBadgesProps) {
  if (!agents || agents.length === 0) {
    return null;
  }

  const displayCount = compact ? 2 : 4;
  const visibleAgents = agents.slice(0, displayCount);
  const remainingCount = agents.length - displayCount;

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {/* Sequence indicator */}
      {sequence !== 'single' && (
        <span 
          className="text-[9px] text-muted-foreground mr-1"
          title={sequence === 'sequential' ? 'Sequential execution' : 'Parallel execution'}
        >
          {sequence === 'sequential' ? <GitMerge size={10} /> : <Users size={10} />}
        </span>
      )}
      
      {/* Agent badges */}
      {visibleAgents.map((agentName) => {
        const shortName = getAgentShortName(agentName);
        const icon = AGENT_ICONS[agentName] || '🤖';
        const colorClass = AGENT_COLORS[agentName] || 'bg-gray-500/20 text-gray-400 border-gray-500/30';
        
        return (
          <span
            key={agentName}
            className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium border ${colorClass}`}
            title={agentName}
          >
            <span className="text-[8px]">{icon}</span>
            {!compact && <span>{shortName}</span>}
          </span>
        );
      })}
      
      {/* Overflow indicator */}
      {remainingCount > 0 && (
        <span className="text-[9px] text-muted-foreground px-1">
          +{remainingCount}
        </span>
      )}
    </div>
  );
});

/**
 * AgentStatusBadge Component
 * 
 * Shows execution status for a single agent.
 */

interface AgentStatusBadgeProps {
  agentName: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  compact?: boolean;
}

export const AgentStatusBadge = memo(function AgentStatusBadge({ 
  agentName, 
  status,
  compact = false 
}: AgentStatusBadgeProps) {
  const icon = AGENT_ICONS[agentName] || '🤖';
  const colorClass = AGENT_COLORS[agentName] || 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  
  const statusStyles = {
    pending: 'opacity-50',
    running: 'animate-pulse ring-2 ring-cyan-400/50',
    completed: 'ring-2 ring-green-400/50',
    failed: 'ring-2 ring-red-400/50 opacity-75',
  };

  return (
    <div 
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] font-medium ${colorClass} ${statusStyles[status]}`}
      title={`${agentName}: ${status}`}
    >
      <span className="text-[9px]">{icon}</span>
      {!compact && (
        <>
          <span className="truncate max-w-[80px]">{getAgentShortName(agentName)}</span>
          <span className={`text-[8px] ${
            status === 'running' ? 'text-cyan-400' :
            status === 'completed' ? 'text-green-400' :
            status === 'failed' ? 'text-red-400' :
            'text-muted-foreground'
          }`}>
            {status}
          </span>
        </>
      )}
    </div>
  );
});
