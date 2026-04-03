/**
 * PlanEditor - Inline markdown editor for plan content
 */

import { useCallback } from 'react';
import { Save, X } from 'lucide-react';

interface PlanEditorProps {
  content: string;
  onChange: (content: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

export function PlanEditor({ content, onChange, onSave, onCancel }: PlanEditorProps) {
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      onSave();
    }
  }, [onSave]);

  return (
    <div className="space-y-2" onKeyDown={handleKeyDown}>
      <div className="text-xs text-muted-foreground">
        Write your implementation plan in markdown. Include:
        <ul className="list-disc list-inside mt-1">
          <li>Overview of the change</li>
          <li>Files to modify</li>
          <li>Step-by-step approach</li>
          <li>Testing strategy</li>
        </ul>
      </div>
      <textarea
        value={content}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-64 px-3 py-2 rounded-md border border-input bg-transparent text-sm font-mono"
        placeholder="## Overview&#10;&#10;## Implementation Steps&#10;&#10;## Testing&#10;"
      />
      <div className="flex gap-2">
        <button
          onClick={onSave}
          className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1"
        >
          <Save size={12} /> Save Draft
        </button>
        <button
          onClick={onCancel}
          className="text-xs px-3 py-1.5 rounded-md border border-input hover:bg-muted inline-flex items-center gap-1"
        >
          <X size={12} /> Cancel
        </button>
      </div>
    </div>
  );
}
