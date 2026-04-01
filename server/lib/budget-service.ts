/**
 * Budget Service
 *
 * Manages task and goal budgets with enforcement.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createMutex } from './mutex.js';

export interface TaskBudget {
  id: string;
  taskId?: string;
  goalId?: string;
  maxCostUSD: number;
  softLimitPercent: number; // Warn at this % (default: 80)
  action: 'pause' | 'notify'; // What happens when exceeded
  createdAt: number;
  createdBy: string;
}

export interface BudgetAlert {
  budgetId: string;
  taskId?: string;
  goalId?: string;
  currentCost: number;
  limit: number;
  percentUsed: number;
  triggeredAt: number;
  action: 'warning' | 'paused';
}

export interface BudgetSpending {
  budget: TaskBudget;
  currentCost: number;
  percentUsed: number;
  status: 'under' | 'warning' | 'exceeded';
}

interface BudgetStore {
  budgets: TaskBudget[];
  alerts: BudgetAlert[];
}

const BUDGET_FILE = path.join(os.homedir(), '.nerve', 'budgets.json');
const withLock = createMutex();

async function readStore(): Promise<BudgetStore> {
  try {
    const data = await fs.promises.readFile(BUDGET_FILE, 'utf-8');
    return JSON.parse(data) as BudgetStore;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { budgets: [], alerts: [] };
    }
    throw err;
  }
}

async function writeStore(store: BudgetStore): Promise<void> {
  const dir = path.dirname(BUDGET_FILE);
  await fs.promises.mkdir(dir, { recursive: true });
  const tmp = BUDGET_FILE + '.tmp';
  await fs.promises.writeFile(tmp, JSON.stringify(store, null, 2));
  await fs.promises.rename(tmp, BUDGET_FILE);
}

/**
 * List all budgets with optional filters.
 */
export async function listBudgets(filters?: { taskId?: string; goalId?: string }): Promise<TaskBudget[]> {
  return withLock(async () => {
    const store = await readStore();
    let budgets = store.budgets;

    if (filters?.taskId) {
      budgets = budgets.filter((b) => b.taskId === filters.taskId);
    }
    if (filters?.goalId) {
      budgets = budgets.filter((b) => b.goalId === filters.goalId);
    }

    return budgets;
  });
}

/**
 * Get a single budget by ID.
 */
export async function getBudget(id: string): Promise<TaskBudget | undefined> {
  return withLock(async () => {
    const store = await readStore();
    return store.budgets.find((b) => b.id === id);
  });
}

/**
 * Create a new budget.
 */
export async function createBudget(
  budget: Omit<TaskBudget, 'id' | 'createdAt'>,
  // createdBy is passed for API compatibility but budget stores its own value
): Promise<TaskBudget> {
  return withLock(async () => {
    const store = await readStore();

    const newBudget: TaskBudget = {
      ...budget,
      id: `budget-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now(),
    };

    store.budgets.push(newBudget);
    await writeStore(store);
    return newBudget;
  });
}

/**
 * Update an existing budget.
 */
export async function updateBudget(
  id: string,
  patch: Partial<TaskBudget>,
): Promise<TaskBudget | undefined> {
  return withLock(async () => {
    const store = await readStore();
    const idx = store.budgets.findIndex((b) => b.id === id);

    if (idx === -1) return undefined;

    store.budgets[idx] = { ...store.budgets[idx], ...patch };
    await writeStore(store);
    return store.budgets[idx];
  });
}

/**
 * Delete a budget.
 */
export async function deleteBudget(id: string): Promise<boolean> {
  return withLock(async () => {
    const store = await readStore();
    const idx = store.budgets.findIndex((b) => b.id === id);

    if (idx === -1) return false;

    store.budgets.splice(idx, 1);
    await writeStore(store);
    return true;
  });
}

/**
 * Check budget and return spending status.
 * Returns null if no budget is set for the task/goal.
 */
export async function checkBudgetSpending(
  taskId: string | undefined,
  goalId: string | undefined,
  currentCost: number,
): Promise<BudgetSpending | null> {
  const budgets = await listBudgets({ taskId, goalId });
  if (budgets.length === 0) return null;

  const budget = budgets[0]; // Use first matching budget
  const percentUsed = (currentCost / budget.maxCostUSD) * 100;

  let status: 'under' | 'warning' | 'exceeded' = 'under';
  if (percentUsed >= 100) {
    status = 'exceeded';
  } else if (percentUsed >= budget.softLimitPercent) {
    status = 'warning';
  }

  return {
    budget,
    currentCost,
    percentUsed,
    status,
  };
}

/**
 * Record a budget alert.
 */
export async function recordAlert(alert: BudgetAlert): Promise<void> {
  return withLock(async () => {
    const store = await readStore();
    store.alerts.push(alert);
    // Keep only last 100 alerts
    if (store.alerts.length > 100) {
      store.alerts = store.alerts.slice(-100);
    }
    await writeStore(store);
  });
}

/**
 * Get recent alerts.
 */
export async function getRecentAlerts(limit = 20): Promise<BudgetAlert[]> {
  const store = await readStore();
  return store.alerts.slice(-limit);
}

/**
 * Check if budget allows continuation (not exceeded or pause action).
 */
export function canContinue(spending: BudgetSpending | null): boolean {
  if (!spending) return true;
  if (spending.percentUsed < 100) return true;
  if (spending.budget.action === 'notify') return true;
  return false; // pause action and exceeded
}
