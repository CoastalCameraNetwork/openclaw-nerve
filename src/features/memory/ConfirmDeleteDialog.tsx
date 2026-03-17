/**
 * ConfirmDeleteDialog — Confirmation dialog for deleting a memory.
 *
 * Shows the memory text and requires explicit confirmation before deletion.
 * For sections/daily entries, fetches and displays the full markdown content.
 */

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Loader2 } from 'lucide-react';

interface ConfirmDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memoryText: string;
  memoryType?: 'section' | 'item' | 'daily';
  memoryDate?: string;
  itemsToDelete?: string[];
  onConfirm: () => Promise<void>;
  isLoading?: boolean;
}

/** Confirmation dialog shown before deleting a memory entry. */
export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  memoryText,
  memoryType,
  memoryDate,
  itemsToDelete = [],
  onConfirm,
  isLoading,
}: ConfirmDeleteDialogProps) {
  const isSection = memoryType === 'section';
  const isDaily = memoryType === 'daily';
  const hasItems = itemsToDelete.length > 0;
  
  // State for fetched markdown content
  const [markdownContent, setMarkdownContent] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(false);

  // Fetch section content when dialog opens for section/daily
  useEffect(() => {
    if (!open || (!isSection && !isDaily) || !memoryText) {
      setMarkdownContent(null);
      return;
    }

    const fetchContent = async () => {
      setContentLoading(true);
      try {
        const params = new URLSearchParams({ title: memoryText });
        if (memoryDate) {
          params.set('date', memoryDate);
        }
        
        const res = await fetch(`/api/memories/section?${params}`);
        const data = await res.json();
        
        if (data.ok && data.content) {
          setMarkdownContent(data.content);
        } else {
          setMarkdownContent(null);
        }
      } catch {
        setMarkdownContent(null);
      } finally {
        setContentLoading(false);
      }
    };

    fetchContent();
  }, [open, isSection, isDaily, memoryText, memoryDate]);

  const handleConfirm = async () => {
    await onConfirm();
    onOpenChange(false);
  };

  const handleCancel = () => {
    if (!isLoading) {
      onOpenChange(false);
    }
  };

  // Truncate long memory text for display
  const displayText = memoryText.length > 100 
    ? memoryText.slice(0, 100) + '...' 
    : memoryText;

  return (
    <Dialog open={open} onOpenChange={handleCancel}>
      <DialogContent className="bg-card border-border max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-red font-mono text-sm tracking-wider uppercase flex items-center gap-2">
            <AlertTriangle size={16} />
            {isSection ? 'Delete Section' : isDaily ? 'Delete Daily Entry' : 'Delete Memory'}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-xs">
            {isSection || isDaily
              ? 'This will delete the entire section and all content underneath it.'
              : 'This action cannot be undone. The memory will be permanently removed.'}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-3">
          <div className="bg-background border border-border/60 px-3 py-2">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">
              {isSection ? 'Section to delete:' : isDaily ? `Daily entry (${memoryDate}):` : 'Memory to delete:'}
            </p>
            <p className="text-[12px] text-foreground font-mono">
              {isSection ? `§ ${displayText}` : isDaily ? `📅 ${displayText}` : displayText}
            </p>
          </div>
          
          {/* Show markdown content for sections/daily entries */}
          {(isSection || isDaily) && (
            <div className="bg-red/5 border border-red/20 px-3 py-2 max-h-60 overflow-y-auto">
              <p className="text-[10px] text-red uppercase tracking-wider mb-2 sticky top-0 bg-red/5 pb-1">
                Content to be deleted:
              </p>
              
              {contentLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground text-[11px] py-2">
                  <Loader2 size={12} className="animate-spin" />
                  Loading content...
                </div>
              ) : markdownContent ? (
                <pre className="text-[11px] text-muted-foreground font-mono whitespace-pre-wrap break-words">
                  {markdownContent}
                </pre>
              ) : hasItems ? (
                <ul className="space-y-1">
                  {itemsToDelete.map((item, i) => (
                    <li key={i} className="text-[11px] text-muted-foreground font-mono flex items-start gap-1.5">
                      <span className="text-red/60 shrink-0">›</span>
                      <span className="break-words">{item.length > 80 ? item.slice(0, 80) + '...' : item}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[11px] text-muted-foreground italic">
                  No content found
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={isLoading}
            className="font-mono text-xs"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={isLoading || contentLoading}
            className="font-mono text-xs bg-red text-foreground hover:bg-red/90"
          >
            {isLoading ? 'Deleting...' : (isSection ? 'Delete Section' : isDaily ? 'Delete Entry' : 'Delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
