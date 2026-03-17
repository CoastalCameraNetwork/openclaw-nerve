import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Command as CommandIcon, Search } from 'lucide-react';
import { Dialog, DialogPortal } from '@/components/ui/dialog';
import { filterCommands } from './commands';
import type { Command } from './types';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  commands: Command[];
}

const CATEGORY_LABELS: Record<string, string> = {
  actions: 'ACTIONS',
  navigation: 'NAVIGATION',
  settings: 'SETTINGS',
  appearance: 'APPEARANCE',
  voice: 'VOICE',
};

/** Cmd+K command palette overlay with fuzzy search. */
export function CommandPalette({ open, onClose, commands }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [usingKeyboard, setUsingKeyboard] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const lastMousePos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const filtered = useMemo(() => filterCommands(commands, query), [commands, query]);

  // Reset state and focus when opened
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional reset on open transition
      setQuery('');
      setSelectedIndex(0);
      const id = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(id);
    }
  }, [open]);

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current;
    const selected = list?.querySelector('[data-selected="true"]') as HTMLElement;
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const executeCommand = useCallback((cmd: Command) => {
    onClose();
    // Small delay to let dialog close animation start
    setTimeout(() => cmd.action(), 50);
  }, [onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setUsingKeyboard(true);
        setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setUsingKeyboard(true);
        setSelectedIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filtered[selectedIndex]) {
          executeCommand(filtered[selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  }, [filtered, selectedIndex, executeCommand, onClose]);

  // Only update selection on mouse move if the mouse actually moved (not just keyboard scroll)
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const { clientX, clientY } = e;
    if (lastMousePos.current.x === clientX && lastMousePos.current.y === clientY) return;
    lastMousePos.current = { x: clientX, y: clientY };
    setUsingKeyboard(false);
  }, []);

  // Group commands by category with flat index mapping
  const { groupedCommands, flatIndexMap } = useMemo(() => {
    const groups: Record<string, Command[]> = {};
    const indexMap = new Map<string, number>();
    let idx = 0;
    for (const cmd of filtered) {
      const cat = cmd.category || 'actions';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(cmd);
      indexMap.set(cmd.id, idx++);
    }
    return { groupedCommands: groups, flatIndexMap: indexMap };
  }, [filtered]);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()} modal={false}>
      <DialogPortal>
        <div className="fixed inset-0 z-50 bg-black/30" onClick={onClose} />
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] pointer-events-none">
          <div 
            className="w-full max-w-md bg-card border border-border shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150 pointer-events-auto"
            onKeyDown={handleKeyDown}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search input */}
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border bg-background">
              <Search size={14} className="text-muted-foreground shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedIndex(0);
                }}
                placeholder="Type a command..."
                className="flex-1 bg-transparent text-foreground text-[13px] outline-none font-mono placeholder:text-muted-foreground"
              />
              <kbd className="hidden sm:inline text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 font-mono">
                esc
              </kbd>
            </div>

            {/* Command list */}
            <div ref={listRef} className="max-h-[300px] overflow-y-auto overscroll-contain py-1" onMouseMove={handleMouseMove}>
              {filtered.length === 0 ? (
                <div className="px-3 py-6 text-center text-[12px] text-muted-foreground">
                  No commands found
                </div>
              ) : (
                Object.entries(groupedCommands).map(([category, cmds]) => (
                  <div key={category}>
                    <div className="px-3 py-1.5 text-[9px] font-bold tracking-[1.5px] uppercase text-muted-foreground">
                      {CATEGORY_LABELS[category] || category}
                    </div>
                    {cmds.map((cmd) => {
                      const idx = flatIndexMap.get(cmd.id) ?? -1;
                      const isSelected = idx === selectedIndex;
                      return (
                        <button
                          key={cmd.id}
                          data-selected={isSelected}
                          onClick={() => executeCommand(cmd)}
                          onMouseEnter={() => { if (!usingKeyboard) setSelectedIndex(idx); }}
                          className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                            isSelected 
                              ? 'bg-primary/10 text-primary' 
                              : 'text-foreground hover:bg-foreground/[0.03]'
                          }`}
                        >
                          {cmd.icon || <CommandIcon size={14} className="text-muted-foreground" />}
                          <span className="flex-1 text-[13px] font-mono">{cmd.label}</span>
                          {cmd.shortcut && (
                            <kbd className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 font-mono">
                              {cmd.shortcut}
                            </kbd>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            {/* Footer hint */}
            <div className="px-3 py-2 border-t border-border bg-background text-[10px] text-muted-foreground flex items-center gap-4">
              <span className="flex items-center gap-1">
                <kbd className="bg-muted px-1 py-0.5">↑↓</kbd> navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="bg-muted px-1 py-0.5">↵</kbd> select
              </span>
              <span className="flex items-center gap-1">
                <kbd className="bg-muted px-1 py-0.5">esc</kbd> close
              </span>
            </div>
          </div>
        </div>
      </DialogPortal>
    </Dialog>
  );
}
