import React, { useMemo, memo } from 'react';
import { ChevronRight } from 'lucide-react';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Card, CardContent } from '@/components/ui/card';
import { sanitizeHtml } from '@/lib/sanitize';
import { decodeHtmlEntities } from '@/lib/formatting';
import { escapeRegex } from '@/lib/constants';
import { DiffView } from './DiffView';
import { FileContentView } from './FileContentView';
import { extractEditBlocks, extractWriteBlocks } from './edit-blocks';
import type { ChatMsg } from './types';

interface ToolCallBlockProps {
  msg: ChatMsg;
  index: number;
  isCollapsed: boolean;
  onToggleCollapse: (idx: number) => void;
  searchQuery?: string;
}

// Highlight search terms in text
function highlightText(text: string, query?: string): React.ReactNode {
  if (!query?.trim()) return text;
  
  const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
  const parts = text.split(regex);
  
  // split() with a capture group alternates: non-match, match, non-match, ...
  // Odd indices are always the captured matches
  return parts.map((part, i) => 
    i % 2 === 1 ? (
      <mark key={i} className="search-highlight">{part}</mark>
    ) : part
  );
}

function ToolCallBlockInner({ msg, index, isCollapsed, onToggleCollapse, searchQuery }: ToolCallBlockProps) {
  const timeStr = msg.timestamp.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  // Use html (description from describeToolUse) for preview, fall back to rawText
  const htmlText = msg.html.replace(/<[^>]*>/g, '').trim();
  const toolPreview = decodeHtmlEntities(htmlText || (msg.rawText.slice(0, 80).replace(/\n/g, ' ') + (msg.rawText.length > 80 ? '…' : '')));
  // Tool message rawText contains the full tool call JSON, extract directly from it
  const editBlocks = useMemo(() => extractEditBlocks(msg.rawText), [msg.rawText]);
  const writeBlocks = useMemo(() => extractWriteBlocks(msg.rawText), [msg.rawText]);
  const sanitizedHtml = useMemo(() => sanitizeHtml(msg.html), [msg.html]);

  return (
    <div className="msg msg-tool relative max-w-full break-words mx-4 my-1.5">
      <Collapsible open={!isCollapsed} onOpenChange={() => onToggleCollapse(index)}>
        <Card className="py-0 gap-0 rounded-lg border-border/40 bg-card/60 shadow-none overflow-hidden border-l-[3px] border-l-primary/60">
          <CollapsibleTrigger className="w-full flex items-center gap-2 px-3 py-2 text-left cursor-pointer hover:bg-foreground/[0.03] transition-colors">
            <ChevronRight size={14} className={`text-muted-foreground shrink-0 transition-transform duration-200 ${!isCollapsed ? 'rotate-90' : ''}`} />
            <span className="text-[9px] uppercase font-bold tracking-widest px-1.5 py-0.5 rounded-sm bg-muted-foreground/20 text-muted-foreground shrink-0">SYSTEM</span>
            <span className="text-[11px] font-mono text-muted-foreground truncate flex-1">{highlightText(toolPreview, searchQuery)}</span>
            <span className="text-muted-foreground text-[10px] shrink-0">{timeStr}</span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="px-3 py-2 border-t border-border/30 bg-background/50">
              {editBlocks.length > 0 ? (
                <div className="space-y-2">
                  {editBlocks.map((block, i) => (
                    <DiffView key={i} oldText={block.oldText} newText={block.newText} filePath={block.filePath} />
                  ))}
                </div>
              ) : writeBlocks.length > 0 ? (
                <div className="space-y-2">
                  {writeBlocks.map((block, i) => (
                    <FileContentView key={i} content={block.content} filePath={block.filePath} />
                  ))}
                </div>
              ) : (
                <div
                  className="msg-body whitespace-pre-wrap text-[12px] font-mono opacity-85 max-h-[300px] overflow-y-auto"
                  dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
                />
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
}

/**
 * Memoized ToolCallBlock — skips re-render when content/state are unchanged.
 * Tool call blocks often contain expensive syntax-highlighted diffs,
 * so avoiding unnecessary re-renders is important for scroll performance.
 */
export const ToolCallBlock = memo(ToolCallBlockInner, (prev, next) => {
  if (prev.msg.rawText !== next.msg.rawText) return false;
  if (prev.msg.html !== next.msg.html) return false;
  if (prev.isCollapsed !== next.isCollapsed) return false;
  if (prev.searchQuery !== next.searchQuery) return false;
  return true;
});
