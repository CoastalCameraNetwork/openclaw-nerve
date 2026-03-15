import { useState, useCallback, useEffect, useRef } from 'react';
import type { KanbanTask } from './types';
import { useKanban } from './hooks/useKanban';
import { useProposals } from './hooks/useProposals';
import { KanbanHeader } from './KanbanHeader';
import { KanbanBoard } from './KanbanBoard';
import { CreateTaskDialog } from './CreateTaskDialog';
import { CreateOrchestratedTaskDialog } from '../orchestrator/CreateOrchestratedTaskDialog';
import { TaskDetailDrawer } from './TaskDetailDrawer';

interface KanbanPanelProps {
  /** If set, auto-open the drawer for this task ID on mount. */
  initialTaskId?: string | null;
  /** Called after the initial task drawer has been opened (to clear the ID). */
  onInitialTaskConsumed?: () => void;
}

/**
 * Main Kanban panel — replaces the placeholder from Wave 1.
 * Full board with header, columns, create dialog, and detail drawer.
 */
export function KanbanPanel({ initialTaskId, onInitialTaskConsumed }: KanbanPanelProps = {}) {
  const {
    tasks,
    loading,
    error,
    filters,
    setFilters,
    fetchTasks,
    createTask,
    updateTask,
    deleteTask,
    reorderTask,
    tasksByStatus,
    statusCounts,
    executeTask,
    approveTask,
    rejectTask,
    abortTask,
  } = useKanban();

  const {
    proposals,
    pendingCount: pendingProposalCount,
    approveProposal,
    rejectProposal,
  } = useProposals();

  const [createOpen, setCreateOpen] = useState(false);
  const [orchestratorOpen, setOrchestratorOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<KanbanTask | null>(null);
  const consumedRef = useRef<string | null>(null);

  // Auto-open drawer for initialTaskId
  useEffect(() => {
    if (!initialTaskId || initialTaskId === consumedRef.current) return;
    const match = tasks.find((t) => t.id === initialTaskId);
    if (match) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional one-time sync from prop
      setSelectedTask(match);
      consumedRef.current = initialTaskId;
      onInitialTaskConsumed?.();
    }
  }, [initialTaskId, tasks, onInitialTaskConsumed]);

  /* ── Card click → open drawer ── */
  const handleCardClick = useCallback((task: KanbanTask) => {
    setSelectedTask(task);
  }, []);

  /* ── Close drawer ── */
  const handleCloseDrawer = useCallback(() => {
    setSelectedTask(null);
  }, []);

  /* ── Create handler ── */
  const handleCreate = useCallback(async (payload: Parameters<typeof createTask>[0]) => {
    await createTask(payload);
  }, [createTask]);

  /* ── Update handler (refreshes selected task) ── */
  const handleUpdate = useCallback(async (...args: Parameters<typeof updateTask>) => {
    const updated = await updateTask(...args);
    setSelectedTask(updated);
    return updated;
  }, [updateTask]);

  /* ── Delete handler ── */
  const handleDelete = useCallback(async (id: string) => {
    await deleteTask(id);
  }, [deleteTask]);

  /* ── Open create dialog ── */
  const openCreateDialog = useCallback(() => {
    setCreateOpen(true);
  }, []);

  /* ── Open orchestrator create dialog ── */
  const openOrchestratorDialog = useCallback(() => {
    setOrchestratorOpen(true);
  }, []);

  /* ── Handle orchestrator task success ── */
  const handleOrchestratorSuccess = useCallback((taskId: string) => {
    // Refresh tasks to show the new one
    fetchTasks();
    // Optionally open the task detail drawer
    const newTask = tasks.find(t => t.id === taskId);
    if (newTask) {
      setSelectedTask(newTask);
    }
  }, [fetchTasks, tasks]);

  /* ── Open orchestrator dashboard ── */
  const openDashboard = useCallback(() => {
    // Dispatch custom event to switch view mode
    window.dispatchEvent(new CustomEvent('nerve:setViewMode', { detail: 'orchestrator' }));
  }, []);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background">
      {/* Header with search, filters, stats, + New Task */}
      <KanbanHeader
        filters={filters}
        onFiltersChange={setFilters}
        statusCounts={statusCounts}
        onCreateTask={openCreateDialog}
        onCreateOrchestratedTask={openOrchestratorDialog}
        onOpenDashboard={openDashboard}
        proposals={proposals}
        pendingProposalCount={pendingProposalCount}
        onApproveProposal={async (id) => { await approveProposal(id); await fetchTasks(); }}
        onRejectProposal={async (id) => { await rejectProposal(id); }}
      />

      {/* Board body */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden px-4 pb-4">
        <KanbanBoard
          tasksByStatus={tasksByStatus}
          onCardClick={handleCardClick}
          loading={loading}
          error={error}
          onRetry={() => fetchTasks()}
          hasAnyTasks={tasks.length > 0}
          onCreateTask={openCreateDialog}
          reorderTask={reorderTask}
        />
      </div>

      {/* Create Task Modal */}
      <CreateTaskDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreate={handleCreate}
      />

      {/* Create Orchestrated Task Modal */}
      <CreateOrchestratedTaskDialog
        open={orchestratorOpen}
        onOpenChange={setOrchestratorOpen}
        onSuccess={handleOrchestratorSuccess}
      />

      {/* Task Detail Drawer */}
      <TaskDetailDrawer
        task={selectedTask}
        onClose={handleCloseDrawer}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
        onExecute={executeTask}
        onApprove={approveTask}
        onReject={rejectTask}
        onAbort={abortTask}
      />
    </div>
  );
}
