/**
 * Plan-First Workflow E2E Tests
 *
 * Tests the Plan-First Workflow feature where tasks must have an approved plan
 * before transitioning to in-progress status.
 */

import { test, expect } from '@playwright/test';

test.use({
  baseURL: 'http://localhost:3080',
  screenshot: 'only-on-failure',
  trace: 'retain-on-failure',
});

// Navigate with demo-mode to bypass gateway connection dialog
// and create test tasks via API
test.beforeEach(async ({ page, request }) => {
  // Use unique task title per run to avoid conflicts
  const taskTitle = `E2E Test Task ${Date.now()}`;
  const taskId = `e2e-${Date.now()}`;

  // Delete any existing task with similar ID first (cleanup from previous runs)
  await request.delete(`/api/kanban/tasks/${taskId}`).catch(() => {});

  // Create a test task for E2E tests
  const response = await request.post('/api/kanban/tasks', {
    data: {
      id: taskId,
      title: taskTitle,
      description: 'Test task for Plan-First Workflow E2E tests',
      priority: 'normal',
      status: 'todo',
      createdBy: 'agent:e2e-test',
    },
  });

  if (!response.ok()) {
    const body = await response.json().catch(() => ({}));
    console.log('Task creation status:', response.status(), body);
  }

  // Clear localStorage and sessionStorage to ensure clean state
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    // Set sessionStorage to simulate a connected state
    sessionStorage.setItem('nerve:gateway:url', 'ws://127.0.0.1:18789/ws');
    sessionStorage.setItem('nerve:gateway:token', 'test-token');
    sessionStorage.setItem('nerve:connectionState', 'connected');
    // Set viewMode to kanban so the board loads immediately
    localStorage.setItem('nerve:viewMode', 'kanban');
  });

  // Navigate with demo-mode query param and wait for page to be fully interactive
  await page.goto('/?demo-mode=true', { waitUntil: 'domcontentloaded' });

  // Wait for dialog to close (demo-mode should prevent it from opening)
  const dialog = page.locator('[role="dialog"]').first();
  if (await dialog.isVisible({ timeout: 5000 }).catch(() => true)) {
    // Dialog is visible - try to dismiss it
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);
  }

  // Wait for kanban to fetch initial data + one auto-refresh cycle
  await page.waitForTimeout(6000);
});

test.describe('Plan-First Workflow', () => {
  test('page loads and shows navigation', async ({ page }) => {
    await page.waitForTimeout(3000);

    // Check that the Nerve title in the top bar is visible (more specific selector)
    await expect(page.getByText('Nerve').first()).toBeVisible();

    // Check that we can see the view mode buttons - Tasks button should be active
    const tasksButton = page.locator('[aria-label="Switch to tasks view"]');
    await expect(tasksButton).toBeVisible();
    // Since we set localStorage to 'kanban', the Tasks button should be pressed
    await expect(tasksButton).toHaveAttribute('aria-pressed', 'true', { timeout: 5000 });
  });

  test('plan panel renders in task detail', async ({ page }) => {
    // Wait for page to fully load
    await page.waitForTimeout(3000);

    // Kanban board should already be loaded due to localStorage setting in beforeEach
    // Wait for kanban board to load - look for column headers
    await page.waitForSelector('text=/TODO|TO DO/i', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(5000);

    // Find the E2E test task and click it - use regex to match timestamped title
    const taskItem = page.getByText(/E2E Test Task/).first();
    await expect(taskItem).toBeVisible({ timeout: 10000 });
    await taskItem.click({ force: true });
    await page.waitForTimeout(3000);

    // Task detail drawer should be open - look for the drawer
    const drawer = page.locator('[role="dialog"]').first();
    await expect(drawer).toBeVisible({ timeout: 5000 });

    // Look for Implementation Plan section or "No plan yet" text
    // PlanPanel shows "Implementation Plan" header and "No plan yet" message for new tasks
    await page.waitForSelector('text=/Implementation Plan/i', { timeout: 10000 });
  });

  test('shows create plan button for task without plan', async ({ page }) => {
    await page.waitForTimeout(3000);

    // Wait for kanban board to load - look for any column header
    await page.waitForSelector('text=/TODO|TO DO|BACKLOG/i', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(5000);

    // Click on the E2E test task - use regex
    const taskItem = page.getByText(/E2E Test Task/).first();
    await expect(taskItem).toBeVisible({ timeout: 10000 });
    await taskItem.click({ force: true });
    await page.waitForTimeout(3000);

    // Drawer should be visible
    const drawer = page.locator('[role="dialog"]').first();
    await expect(drawer).toBeVisible({ timeout: 5000 });

    // Look for "Create Plan" or "+ Create Plan" button
    await page.waitForSelector('text=/Create Plan/i', { timeout: 10000 });
  });

  test('plan editor can be opened', async ({ page }) => {
    await page.waitForTimeout(3000);

    // Wait for kanban board to load
    await page.waitForSelector('text=/TODO|TO DO|BACKLOG/i', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(5000);

    // Click on the E2E test task - use regex
    const taskItem = page.getByText(/E2E Test Task/).first();
    await expect(taskItem).toBeVisible({ timeout: 10000 });
    await taskItem.click({ force: true });
    await page.waitForTimeout(3000);

    // Drawer should be visible
    const drawer = page.locator('[role="dialog"]').first();
    await expect(drawer).toBeVisible({ timeout: 5000 });

    // Look for "Create Plan" button and click it
    const createButton = page.getByText(/Create Plan/i).or(page.getByRole('button', { name: /create plan/i }));
    await expect(createButton).toBeVisible({ timeout: 5000 });
    await createButton.click({ force: true });
    await page.waitForTimeout(1000);

    // Editor textarea should be visible
    const editor = page.locator('textarea').first();
    await expect(editor).toBeVisible({ timeout: 5000 });
  });

  test('plan panel shows status badge', async ({ page }) => {
    await page.waitForTimeout(3000);

    // Wait for kanban board to load
    await page.waitForSelector('text=/TODO|TO DO|BACKLOG/i', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(5000);

    // Click on the E2E test task - use regex
    const taskItem = page.getByText(/E2E Test Task/).first();
    await expect(taskItem).toBeVisible({ timeout: 10000 });
    await taskItem.click({ force: true });
    await page.waitForTimeout(3000);

    // Drawer should be visible
    const drawer = page.locator('[role="dialog"]').first();
    await expect(drawer).toBeVisible({ timeout: 5000 });

    // For new tasks without a plan, we should see "No plan yet" text or Create Plan button
    const hasNoPlanText = await page.locator('text=No plan yet').isVisible().catch(() => false);
    const hasCreateButton = await page.getByText(/Create Plan/i).isVisible().catch(() => false);

    expect(hasNoPlanText || hasCreateButton).toBeTruthy();
  });
});
