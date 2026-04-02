/**
 * Security Approval Queue
 *
 * Queue for dangerous commands awaiting human approval.
 */

import { EventEmitter } from 'node:events';
import { broadcast } from '../routes/events.js';

export interface PendingApproval {
  id: string;
  taskId: string;
  agent: string;
  command: string;
  description: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  createdAt: number;
  expiresAt: number;
}

export interface ApprovalResult {
  approved: boolean;
  modifiedCommand?: string;
  reason?: string;
}

const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

class ApprovalQueue extends EventEmitter {
  private pending = new Map<string, PendingApproval>();
  private responses = new Map<string, ApprovalResult>();

  add(approval: PendingApproval): void {
    this.pending.set(approval.id, approval);
    broadcast('approval.requested', approval);

    // Auto-expire
    setTimeout(() => {
      if (this.pending.has(approval.id)) {
        this.deny(approval.id, 'Timeout');
      }
    }, APPROVAL_TIMEOUT_MS);
  }

  async waitForResponse(id: string): Promise<ApprovalResult> {
    return new Promise((resolve) => {
      const check = () => {
        const response = this.responses.get(id);
        if (response) {
          this.responses.delete(id);
          resolve(response);
        } else {
          setTimeout(check, 500);
        }
      };
      check();
    });
  }

  approve(id: string, modifiedCommand?: string): void {
    const approval = this.pending.get(id);
    if (!approval) return;

    this.responses.set(id, { approved: true, modifiedCommand });
    this.pending.delete(id);
    broadcast('approval.granted', { id, taskId: approval.taskId });
  }

  deny(id: string, reason: string): void {
    const approval = this.pending.get(id);
    if (!approval) return;

    this.responses.set(id, { approved: false, reason });
    this.pending.delete(id);
    broadcast('approval.denied', { id, taskId: approval.taskId, reason });
  }

  getPending(taskId?: string): PendingApproval[] {
    const all = Array.from(this.pending.values());
    if (!taskId) return all;
    return all.filter(a => a.taskId === taskId);
  }
}

export const approvalQueue = new ApprovalQueue();

/**
 * Check if command requires approval.
 */
export function requiresApproval(command: string): boolean {
  const dangerous = [
    /^rm\s+(-rf?|--recursive)\s/i,
    /^curl.*\|\s*(ba)?sh/i,
    /^wget.*\|\s*(ba)?sh/i,
    /^chmod\s+777/i,
    /^chown\s/i,
    /^sudo\s/i,
    /^dd\s/i,
    /^mkfs/i,
  ];
  return dangerous.some(pattern => pattern.test(command));
}

/**
 * Assess risk level of command.
 */
export function assessRisk(command: string): 'low' | 'medium' | 'high' | 'critical' {
  if (/^rm\s+(-rf?|--recursive)\s+\/|^mkfs|^dd\s/i.test(command)) {
    return 'critical';
  }
  if (/^sudo|^chmod\s+777|^chown\s/i.test(command)) {
    return 'high';
  }
  if (/^curl.*\|\s*(ba)?sh|^wget.*\|\s*(ba)?sh/i.test(command)) {
    return 'high';
  }
  if (/^rm\s+/i.test(command)) {
    return 'medium';
  }
  return 'low';
}
