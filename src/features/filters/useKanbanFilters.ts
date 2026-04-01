/**
 * Kanban Filters hook
 *
 * React hook for managing kanban filter state with localStorage persistence.
 */

import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY_PREFIX = 'nerve-kanban-filters-';

export interface KanbanFilters {
  agents?: string[];
  projects?: string[];
  labels?: string[];
  createdAfter?: number;
  createdBefore?: number;
  search?: string;
}

function getStorageKey(userId: string): string {
  return `${STORAGE_KEY_PREFIX}${userId}`;
}

function loadFilters(userId: string): KanbanFilters {
  try {
    const stored = sessionStorage.getItem(getStorageKey(userId));
    if (stored) {
      return JSON.parse(stored) as KanbanFilters;
    }
  } catch (err) {
    console.error('Failed to load kanban filters:', err);
  }
  return {};
}

function saveFilters(userId: string, filters: KanbanFilters): void {
  try {
    sessionStorage.setItem(getStorageKey(userId), JSON.stringify(filters));
  } catch (err) {
    console.error('Failed to save kanban filters:', err);
  }
}

export function useKanbanFilters(userId: string) {
  const [filters, setFilters] = useState<KanbanFilters>(() => loadFilters(userId));

  useEffect(() => {
    saveFilters(userId, filters);
  }, [filters, userId]);

  const setAgents = useCallback((agents: string[] | undefined) => {
    setFilters((prev) => ({ ...prev, agents }));
  }, []);

  const setProjects = useCallback((projects: string[] | undefined) => {
    setFilters((prev) => ({ ...prev, projects }));
  }, []);

  const setLabels = useCallback((labels: string[] | undefined) => {
    setFilters((prev) => ({ ...prev, labels }));
  }, []);

  const setDateRange = useCallback((start: number | undefined, end: number | undefined) => {
    setFilters((prev) => ({
      ...prev,
      createdAfter: start,
      createdBefore: end,
    }));
  }, []);

  const setSearch = useCallback((search: string | undefined) => {
    setFilters((prev) => ({ ...prev, search }));
  }, []);

  const clearAll = useCallback(() => {
    setFilters({});
  }, []);

  const clearFilter = useCallback((key: keyof KanbanFilters) => {
    setFilters((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const hasActiveFilters = Object.keys(filters).length > 0;

  return {
    filters,
    setAgents,
    setProjects,
    setLabels,
    setDateRange,
    setSearch,
    clearAll,
    clearFilter,
    hasActiveFilters,
  };
}
