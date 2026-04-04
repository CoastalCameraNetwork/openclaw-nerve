/**
 * ApprovalDialog - Request approval for dangerous commands
 */

import { memo, useState, useCallback } from 'react';
import { Shield, Check, X, AlertTriangle } from 'lucide-react';

export interface PendingApproval {
  id: string;
  taskId: string;
  agent: string;
  command: string;
  description: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  createdAt: number;
}

interface ApprovalDialogProps {
  approval: PendingApproval;
  onApprove: (id: string, modifiedCommand?: string) => void;
  onDeny: (id: string, reason: string) => void;
  onClose: () => void;
}

const RISK_COLORS = {
  low: 'bg-green-600',
  medium: 'bg-yellow-600',
  high: 'bg-orange-600',
  critical: 'bg-red-600',
};

const RISK_LABELS = {
  low: 'Low Risk',
  medium: 'Medium Risk',
  high: 'High Risk',
  critical: 'Critical Risk',
};

export const ApprovalDialog = memo(function ApprovalDialog({
  approval,
  onApprove,
  onDeny,
  onClose,
}: ApprovalDialogProps) {
  const [denyReason, setDenyReason] = useState('');
  const [showDenyForm, setShowDenyForm] = useState(false);
  const [modifiedCommand, setModifiedCommand] = useState('');
  const [showModify, setShowModify] = useState(false);

  const handleApprove = useCallback(() => {
    onApprove(approval.id, modifiedCommand || undefined);
  }, [approval.id, modifiedCommand, onApprove]);

  const handleDeny = useCallback(() => {
    if (denyReason.trim()) {
      onDeny(approval.id, denyReason);
    }
  }, [approval.id, denyReason, onDeny]);

  const riskColor = RISK_COLORS[approval.riskLevel];
  const riskLabel = RISK_LABELS[approval.riskLevel];

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-2xl border border-border overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/50">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${riskColor}`}>
              <Shield size={20} className="text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Security Approval Required</h3>
              <p className="text-xs text-muted-foreground">
                {riskLabel} - Agent {approval.agent}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Description */}
          <div>
            <p className="text-sm text-muted-foreground mb-2">{approval.description}</p>
          </div>

          {/* Command Preview */}
          <div className="p-4 bg-muted rounded-lg border border-border">
            <div className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wider">
              Command to Execute
            </div>
            <pre className="text-xs font-mono bg-background p-3 rounded overflow-x-auto text-foreground">
              {approval.command}
            </pre>
          </div>

          {/* Risk Indicator */}
          <div className="flex items-center gap-2 text-sm">
            <AlertTriangle size={16} className={riskColor.replace('bg-', 'text-')} />
            <span className="font-medium">Risk Level:</span>
            <span className={`px-2 py-0.5 rounded text-xs font-semibold text-white ${riskColor}`}>
              {riskLabel}
            </span>
          </div>

          {/* Modify Command */}
          {showModify && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Modified Command (optional)</label>
              <textarea
                value={modifiedCommand}
                onChange={(e) => setModifiedCommand(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm font-mono"
                rows={3}
                placeholder="Enter a safer version of the command..."
              />
            </div>
          )}

          {/* Deny Reason Form */}
          {showDenyForm && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Reason for Denial</label>
              <textarea
                value={denyReason}
                onChange={(e) => setDenyReason(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
                rows={3}
                placeholder="Explain why this command should not be executed..."
              />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border bg-muted/30">
          {!showDenyForm && !showModify && (
            <>
              <button
                onClick={() => setShowModify(true)}
                className="text-xs px-4 py-2 rounded-md border border-input hover:bg-muted transition-colors"
              >
                Modify Command
              </button>
              <button
                onClick={() => setShowDenyForm(true)}
                className="text-xs px-4 py-2 rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
              >
                Deny
              </button>
              <button
                onClick={handleApprove}
                className="text-xs px-4 py-2 rounded-md bg-green-600 text-white hover:bg-green-700 transition-colors inline-flex items-center gap-1"
              >
                <Check size={14} /> Approve
              </button>
            </>
          )}

          {showModify && (
            <>
              <button
                onClick={() => {
                  setShowModify(false);
                  setModifiedCommand('');
                }}
                className="text-xs px-4 py-2 rounded-md border border-input hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleApprove}
                className="text-xs px-4 py-2 rounded-md bg-green-600 text-white hover:bg-green-700 transition-colors inline-flex items-center gap-1"
              >
                <Check size={14} /> Approve Modified
              </button>
            </>
          )}

          {showDenyForm && (
            <>
              <button
                onClick={() => {
                  setShowDenyForm(false);
                  setDenyReason('');
                }}
                className="text-xs px-4 py-2 rounded-md border border-input hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeny}
                disabled={!denyReason.trim()}
                className="text-xs px-4 py-2 rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 transition-colors"
              >
                Submit Denial
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
});
