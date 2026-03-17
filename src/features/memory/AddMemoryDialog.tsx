/**
 * AddMemoryDialog — Modal for adding a new memory.
 *
 * Allows entering memory text and selecting a section in MEMORY.md.
 * The section selector is a combo box: pick an existing section or type a new one.
 */

import { useState, useRef, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ChevronDown } from 'lucide-react';

interface AddMemoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (text: string, section: string) => Promise<boolean>;
  sections?: string[];
  isLoading?: boolean;
}

/** Dialog for creating a new agent memory entry. */
export function AddMemoryDialog({ open, onOpenChange, onAdd, sections = [], isLoading }: AddMemoryDialogProps) {
  const [text, setText] = useState('');
  const [section, setSection] = useState('');
  const [sectionDropdownOpen, setSectionDropdownOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter sections based on input
  const filteredSections = section.trim()
    ? sections.filter((s) => s.toLowerCase().includes(section.toLowerCase()))
    : sections;

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setSectionDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || submitting) return;

    setSubmitting(true);
    const success = await onAdd(text.trim(), section.trim() || 'General');
    setSubmitting(false);

    if (success) {
      setText('');
      setSection('');
      onOpenChange(false);
    }
  };

  const handleClose = () => {
    if (!submitting) {
      setText('');
      setSection('');
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="text-primary font-mono text-sm tracking-wider uppercase">
            Add Memory
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-xs">
            Store a new memory in MEMORY.md under a section heading.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Section selector (combo box) */}
          <div className="space-y-2">
            <label className="text-[11px] text-muted-foreground uppercase tracking-wider">
              Section
            </label>
            <div className="relative" ref={dropdownRef}>
              <div className="relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={section}
                  onChange={(e) => {
                    setSection(e.target.value);
                    setSectionDropdownOpen(true);
                  }}
                  onFocus={() => setSectionDropdownOpen(true)}
                  placeholder="General"
                  className="w-full bg-background border border-border px-3 py-2 pr-8 text-[13px] font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 transition-colors"
                  disabled={submitting}
                  autoComplete="off"
                  role="combobox"
                  aria-expanded={sectionDropdownOpen}
                  aria-label="Memory section"
                />
                <button
                  type="button"
                  onClick={() => {
                    setSectionDropdownOpen(!sectionDropdownOpen);
                    inputRef.current?.focus();
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  <ChevronDown size={14} className={`transition-transform ${sectionDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
              </div>

              {/* Dropdown list */}
              {sectionDropdownOpen && filteredSections.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-card border border-border shadow-lg max-h-40 overflow-y-auto">
                  {filteredSections.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setSection(s);
                        setSectionDropdownOpen(false);
                      }}
                      className={`
                        w-full text-left px-3 py-1.5 text-[12px] font-mono hover:bg-primary/10 hover:text-primary transition-colors
                        ${section === s ? 'bg-primary/10 text-primary' : 'text-foreground'}
                      `}
                    >
                      {s}
                    </button>
                  ))}
                  {section.trim() && !sections.some((s) => s.toLowerCase() === section.trim().toLowerCase()) && (
                    <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-t border-border">
                      New section: <span className="text-primary font-medium">{section.trim()}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Text input */}
          <div className="space-y-2">
            <label className="text-[11px] text-muted-foreground uppercase tracking-wider">
              Memory Text
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Enter the memory to store..."
              className="w-full bg-background border border-border px-3 py-2 text-[13px] font-mono text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:border-primary/50 transition-colors"
              rows={3}
              autoFocus
              disabled={submitting}
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={submitting}
              className="font-mono text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!text.trim() || submitting || isLoading}
              className="font-mono text-xs bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {submitting ? 'Storing...' : 'Store Memory'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
