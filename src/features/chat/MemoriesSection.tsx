import { Brain, ChevronRight } from 'lucide-react';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Card, CardContent } from '@/components/ui/card';

interface MemoriesSectionProps {
  memories: string;
  isCollapsed: boolean;
  onToggle: () => void;
}

/** Collapsible section showing memories referenced in a message. */
export function MemoriesSection({ memories, isCollapsed, onToggle }: MemoriesSectionProps) {
  return (
    <div className="w-full mx-4 my-1 max-w-[calc(100%-2rem)]">
      <Collapsible open={!isCollapsed} onOpenChange={onToggle}>
        <Card className="py-0 gap-0 rounded-lg border-border/50 bg-card/40 shadow-none overflow-hidden border-l-[3px] border-l-purple-500/60">
          <CollapsibleTrigger className="w-full flex items-center gap-2 px-3 py-1.5 text-left cursor-pointer hover:bg-foreground/[0.03] transition-colors">
            <ChevronRight size={12} className={`text-muted-foreground shrink-0 transition-transform duration-200 ${!isCollapsed ? 'rotate-90' : ''}`} />
            <Brain size={11} className="text-purple-400/70 shrink-0" />
            <span className="text-[10px] font-mono text-muted-foreground truncate flex-1">relevant memories</span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="px-3 py-2 border-t border-border/30 bg-background/30">
              <div className="text-[11px] font-mono text-muted-foreground/80 whitespace-pre-wrap max-h-[200px] overflow-y-auto">
                {memories}
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
}
