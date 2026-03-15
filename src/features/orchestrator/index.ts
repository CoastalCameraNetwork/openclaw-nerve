/**
 * OpenClaw Orchestrator Feature
 * 
 * Provides UI components for creating and monitoring orchestrated tasks
 * that are automatically routed to specialist agents.
 */

export { useAgents, useRoutingPreview, useCreateTask, useTaskStatus, useExecuteTask, useCancelTask } from './useOrchestrator';
export type { 
  SpecialistAgent, 
  RoutingPreview, 
  OrchestratorTask, 
  TaskStatus, 
  CreateTaskParams 
} from './useOrchestrator';

export { AgentBadges, AgentStatusBadge } from './AgentBadges';
export { AgentTimeline } from './AgentTimeline';
export { CreateOrchestratedTaskDialog } from './CreateOrchestratedTaskDialog';
