/**
 * CreateOrchestratedTaskDialog Component
 * 
 * Extended task creation dialog with orchestrator features:
 * - Live routing preview
 * - Agent selection display
 * - Gate mode selection
 * - Execute immediately option
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { Loader2, Cpu, GitMerge, Users, Shield, FileText, Wand2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useCreateTask, useRoutingPreview } from './useOrchestrator';
import { AgentBadges } from './AgentBadges';

interface CreateOrchestratedTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (taskId: string) => void;
}

const GATE_MODES = [
  { value: 'audit-only', label: 'Audit Only', description: 'Auto-execute, log all actions', icon: FileText },
  { value: 'gate-on-write', label: 'Gate on Write', description: 'Approve file writes', icon: Shield },
  { value: 'gate-on-deploy', label: 'Gate on Deploy', description: 'Approve deployments', icon: Shield },
] as const;

const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
] as const;

export function CreateOrchestratedTaskDialog({
  open,
  onOpenChange,
  onSuccess
}: CreateOrchestratedTaskDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'critical' | 'high' | 'normal' | 'low'>('normal');
  const [gateMode, setGateMode] = useState<'audit-only' | 'gate-on-write' | 'gate-on-deploy'>('audit-only');
  const [executeImmediately, setExecuteImmediately] = useState(false);
  const [maxCostUSD, setMaxCostUSD] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  
  const titleRef = useRef<HTMLInputElement>(null);
  
  // Orchestrator hooks
  const { createTask, loading: creating } = useCreateTask();
  const { preview, loading: previewing, previewRouting, clearPreview } = useRoutingPreview();

  // Reset form on close
  useEffect(() => {
    if (!open) {
      setTitle('');
      setDescription('');
      setPriority('normal');
      setGateMode('audit-only');
      setExecuteImmediately(false);
      setMaxCostUSD('');
      setError(null);
      clearPreview();
    }
  }, [open, clearPreview]);

  // Focus title on open
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => titleRef.current?.focus(), 120);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Preview routing when description changes (debounced)
  useEffect(() => {
    if (!description.trim()) {
      clearPreview();
      return;
    }

    const timer = setTimeout(() => {
      previewRouting(description);
    }, 500);

    return () => clearTimeout(timer);
  }, [description, previewRouting, clearPreview]);

  const trimmedTitle = title.trim();
  const isValid = trimmedTitle.length > 0 && trimmedTitle.length <= 200;

  const handleSubmit = useCallback(async () => {
    if (!isValid || creating) return;

    setError(null);
    try {
      const result = await createTask({
        title: trimmedTitle,
        description: description.trim(),
        priority,
        gate_mode: gateMode,
        status: 'todo',
        execute_immediately: executeImmediately,
        maxCostUSD: maxCostUSD ? parseFloat(maxCostUSD) : undefined,
      });

      onOpenChange(false);
      onSuccess?.(result.task_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create task. Try again.");
    }
  }, [isValid, creating, trimmedTitle, description, priority, gateMode, executeImmediately, maxCostUSD, createTask, onOpenChange, onSuccess]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && document.activeElement?.tagName !== 'TEXTAREA') {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cpu size={20} className="text-primary" />
            Create Orchestrated Task
          </DialogTitle>
          <DialogDescription>
            Create a task that will be automatically routed to specialist agents.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Title */}
          <div className="space-y-2">
            <label htmlFor="title" className="text-sm font-medium">Title</label>
            <Input
              id="title"
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g., Deploy mgmt to staging"
              maxLength={200}
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <label htmlFor="description" className="text-sm font-medium">Description</label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full min-h-[100px] px-3 py-2 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent resize-none"
              placeholder="Describe what needs to be done. The orchestrator will automatically select the right agents."
              onKeyDown={handleKeyDown}
            />
          </div>

          {/* Routing Preview */}
          {description.trim() && (
            <div className="rounded-lg border bg-muted/50 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Wand2 size={14} className="text-primary" />
                  Agent Routing Preview
                </div>
                {previewing && (
                  <Loader2 size={14} className="animate-spin text-muted-foreground" />
                )}
              </div>

              {preview && (
                <>
                  <div className="flex items-center gap-2 flex-wrap">
                    <AgentBadges 
                      agents={preview.agents} 
                      sequence={preview.sequence}
                      compact={false}
                    />
                  </div>
                  
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      {preview.sequence === 'sequential' ? (
                        <GitMerge size={12} />
                      ) : preview.sequence === 'parallel' ? (
                        <Users size={12} />
                      ) : (
                        <Cpu size={12} />
                      )}
                      {preview.sequence === 'single' ? 'Single agent' : 
                       preview.sequence === 'sequential' ? 'Sequential' : 'Parallel'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Shield size={12} />
                      {preview.gate_mode.replace('-', ' ')}
                    </span>
                    {preview.rule_id && (
                      <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded bg-secondary text-secondary-foreground">
                        Rule: {preview.rule_id}
                      </span>
                    )}
                    {preview.fallback_used && (
                      <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded border border-border">
                        Heuristic fallback
                      </span>
                    )}
                  </div>

                  {preview.agent_details && preview.agent_details.length > 0 && (
                    <div className="text-xs text-muted-foreground pt-1 border-t">
                      {preview.agent_details.map((agent) => (
                        <div key={agent.name} className="mt-1">
                          <span className="font-medium">{agent.name}:</span> {agent.description}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {!preview && !previewing && (
                <p className="text-xs text-muted-foreground">
                  Type a description to see which agents will be selected
                </p>
              )}
            </div>
          )}

          {/* Priority and Gate Mode */}
          <div className="grid grid-cols-2 gap-4">
            {/* Priority */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as typeof priority)}
                className="w-full h-9 px-3 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>

            {/* Gate Mode */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Gate Mode</label>
              <select
                value={gateMode}
                onChange={(e) => setGateMode(e.target.value as typeof gateMode)}
                className="w-full h-9 px-3 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {GATE_MODES.map((mode) => (
                  <option key={mode.value} value={mode.value}>{mode.label}</option>
                ))}
              </select>
              <p className="text-[10px] text-muted-foreground">
                {GATE_MODES.find(m => m.value === gateMode)?.description}
              </p>
            </div>
          </div>

          {/* Max Cost Budget */}
          <div className="space-y-2">
            <label htmlFor="maxCost" className="text-sm font-medium">Max Cost (USD)</label>
            <Input
              id="maxCost"
              type="number"
              value={maxCostUSD}
              onChange={(e) => setMaxCostUSD(e.target.value)}
              placeholder="e.g., 0.50"
              step="0.01"
              min="0"
              className="w-full"
            />
            <p className="text-[10px] text-muted-foreground">
              Optional budget limit. Agents will pause when this cost is exceeded.
            </p>
          </div>

          {/* Execute Immediately */}
          <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
            <div className="space-y-0.5">
              <label className="text-sm font-medium">Execute Immediately</label>
              <p className="text-xs text-muted-foreground">
                Start agent execution right after creation
              </p>
            </div>
            <Switch
              checked={executeImmediately}
              onCheckedChange={setExecuteImmediately}
            />
          </div>

          {/* Error message */}
          {error && (
            <div className="p-3 rounded-md bg-red-500/10 border border-red-500/30 text-sm text-red-400">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={!isValid || creating}
            className="gap-2"
          >
            {creating && <Loader2 size={16} className="animate-spin" />}
            {executeImmediately ? 'Create & Execute' : 'Create Task'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
