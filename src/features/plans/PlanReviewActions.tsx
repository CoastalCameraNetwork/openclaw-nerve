/**
 * PlanReviewActions - Approve/Reject buttons for supervisors
 */

import { CheckCircle, XCircle } from 'lucide-react';

interface PlanReviewActionsProps {
  onApprove: () => void;
  onReject: () => void;
}

export function PlanReviewActions({ onApprove, onReject }: PlanReviewActionsProps) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onApprove}
        className="text-xs px-3 py-1.5 rounded-md bg-green-600 text-white hover:bg-green-700 inline-flex items-center gap-1"
      >
        <CheckCircle size={12} /> Approve
      </button>
      <button
        onClick={onReject}
        className="text-xs px-3 py-1.5 rounded-md bg-red-600 text-white hover:bg-red-700 inline-flex items-center gap-1"
      >
        <XCircle size={12} /> Reject
      </button>
    </div>
  );
}
