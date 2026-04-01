/**
 * KanbanFilters - Advanced filter bar for kanban board
 */

import { useState, useCallback, useMemo } from 'react';
import { Filter, X, ChevronDown, ChevronUp, Calendar } from 'lucide-react';
import { useKanbanFilters, type KanbanFilters as FilterState } from './useKanbanFilters';

interface KanbanFiltersProps {
  userId: string;
  agents?: string[];
  projects?: string[];
  labels?: string[];
  onFiltersChange?: (filters: FilterState) => void;
}

export function KanbanFilters({ userId, agents = [], projects = [], labels = [], onFiltersChange }: KanbanFiltersProps) {
  const { filters, setAgents, setProjects, setLabels, setDateRange, setSearch, clearAll, clearFilter, hasActiveFilters } = useKanbanFilters(userId);
  const [expanded, setExpanded] = useState(false);

  // Multi-select state
  const [agentOpen, setAgentOpen] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
  const [labelOpen, setLabelOpen] = useState(false);

  // Date inputs
  const [startDate, setStartDate] = useState(filters.createdAfter ? new Date(filters.createdAfter).toISOString().split('T')[0] : '');
  const [endDate, setEndDate] = useState(filters.createdBefore ? new Date(filters.createdBefore).toISOString().split('T')[0] : '');
  const [searchQuery, setSearchQuery] = useState(filters.search ?? '');

  // Notify parent of filter changes
  useMemo(() => {
    onFiltersChange?.(filters);
  }, [filters, onFiltersChange]);

  const toggleAgent = useCallback((agent: string) => {
    const current = filters.agents ?? [];
    const next = current.includes(agent)
      ? current.filter((a) => a !== agent)
      : [...current, agent];
    setAgents(next.length > 0 ? next : undefined);
  }, [filters.agents, setAgents]);

  const toggleProject = useCallback((project: string) => {
    const current = filters.projects ?? [];
    const next = current.includes(project)
      ? current.filter((p) => p !== project)
      : [...current, project];
    setProjects(next.length > 0 ? next : undefined);
  }, [filters.projects, setProjects]);

  const toggleLabel = useCallback((label: string) => {
    const current = filters.labels ?? [];
    const next = current.includes(label)
      ? current.filter((l) => l !== label)
      : [...current, label];
    setLabels(next.length > 0 ? next : undefined);
  }, [filters.labels, setLabels]);

  const handleDateChange = useCallback(() => {
    const start = startDate ? new Date(startDate).getTime() : undefined;
    const end = endDate ? new Date(endDate).getTime() : undefined;
    setDateRange(start, end);
  }, [startDate, endDate, setDateRange]);

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    setSearch(value || undefined);
  }, [setSearch]);

  const activeFilterCount = (filters.agents?.length ?? 0) + (filters.projects?.length ?? 0) + (filters.labels?.length ?? 0) + (filters.search ? 1 : 0) + (filters.createdAfter || filters.createdBefore ? 1 : 0);

  return (
    <div className="border-b bg-card">
      {/* Filter Bar Header */}
      <div className="p-3 flex items-center gap-3">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-input hover:bg-muted transition-colors text-sm"
        >
          <Filter size={16} className="text-muted-foreground" />
          <span>Filters</span>
          {activeFilterCount > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground">
              {activeFilterCount}
            </span>
          )}
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {hasActiveFilters && (
          <button
            onClick={clearAll}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Clear all
          </button>
        )}

        {/* Active Filter Chips */}
        <div className="flex-1 flex items-center gap-2 flex-wrap">
          {filters.search && (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-muted">
              Search: {filters.search}
              <button onClick={() => clearFilter('search')} className="hover:text-destructive">
                <X size={12} />
              </button>
            </span>
          )}
          {filters.agents?.map((agent) => (
            <span key={agent} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-blue-500/20 text-blue-400">
              Agent: {agent}
              <button onClick={() => toggleAgent(agent)} className="hover:text-destructive">
                <X size={12} />
              </button>
            </span>
          ))}
          {filters.projects?.map((project) => (
            <span key={project} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-green-500/20 text-green-400">
              Project: {project}
              <button onClick={() => toggleProject(project)} className="hover:text-destructive">
                <X size={12} />
              </button>
            </span>
          ))}
          {filters.labels?.map((label) => (
            <span key={label} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-purple-500/20 text-purple-400">
              {label}
              <button onClick={() => toggleLabel(label)} className="hover:text-destructive">
                <X size={12} />
              </button>
            </span>
          ))}
          {(filters.createdAfter || filters.createdBefore) && (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-amber-500/20 text-amber-400">
              <Calendar size={12} />
              {filters.createdAfter ? new Date(filters.createdAfter).toLocaleDateString() : '...'} - {filters.createdBefore ? new Date(filters.createdBefore).toLocaleDateString() : '...'}
              <button onClick={() => { setStartDate(''); setEndDate(''); setDateRange(undefined, undefined); }} className="hover:text-destructive">
                <X size={12} />
              </button>
            </span>
          )}
        </div>
      </div>

      {/* Expanded Filter Panel */}
      {expanded && (
        <div className="p-4 pt-0 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Search */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Search</label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Title or description..."
              className="w-full px-3 py-2 rounded-md border border-input bg-transparent text-sm"
            />
          </div>

          {/* Agents */}
          <div className="relative">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Agents</label>
            <button
              onClick={() => setAgentOpen(!agentOpen)}
              className="w-full px-3 py-2 rounded-md border border-input bg-transparent text-sm text-left flex items-center justify-between"
            >
              <span>{filters.agents?.length ? `${filters.agents.length} selected` : 'Select agents'}</span>
              <ChevronDown size={14} className={`transition-transform ${agentOpen ? 'rotate-180' : ''}`} />
            </button>
            {agentOpen && (
              <div className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto rounded-md border bg-card shadow-lg">
                {agents.map((agent) => (
                  <button
                    key={agent}
                    onClick={() => toggleAgent(agent)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-muted ${filters.agents?.includes(agent) ? 'bg-muted' : ''}`}
                  >
                    {agent}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Projects */}
          <div className="relative">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Projects</label>
            <button
              onClick={() => setProjectOpen(!projectOpen)}
              className="w-full px-3 py-2 rounded-md border border-input bg-transparent text-sm text-left flex items-center justify-between"
            >
              <span>{filters.projects?.length ? `${filters.projects.length} selected` : 'Select projects'}</span>
              <ChevronDown size={14} className={`transition-transform ${projectOpen ? 'rotate-180' : ''}`} />
            </button>
            {projectOpen && (
              <div className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto rounded-md border bg-card shadow-lg">
                {projects.map((project) => (
                  <button
                    key={project}
                    onClick={() => toggleProject(project)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-muted ${filters.projects?.includes(project) ? 'bg-muted' : ''}`}
                  >
                    {project}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Labels */}
          <div className="relative">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Labels</label>
            <button
              onClick={() => setLabelOpen(!labelOpen)}
              className="w-full px-3 py-2 rounded-md border border-input bg-transparent text-sm text-left flex items-center justify-between"
            >
              <span>{filters.labels?.length ? `${filters.labels.length} selected` : 'Select labels'}</span>
              <ChevronDown size={14} className={`transition-transform ${labelOpen ? 'rotate-180' : ''}`} />
            </button>
            {labelOpen && (
              <div className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto rounded-md border bg-card shadow-lg">
                {labels.map((label) => (
                  <button
                    key={label}
                    onClick={() => toggleLabel(label)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-muted ${filters.labels?.includes(label) ? 'bg-muted' : ''}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Date Range */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Date Range</label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                onBlur={handleDateChange}
                className="flex-1 px-2 py-2 rounded-md border border-input bg-transparent text-sm"
              />
              <span className="text-muted-foreground">-</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                onBlur={handleDateChange}
                className="flex-1 px-2 py-2 rounded-md border border-input bg-transparent text-sm"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
