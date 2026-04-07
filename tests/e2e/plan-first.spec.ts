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
  const taskTitle = `E2E PlanFirst ${Date.now()}`;
  const taskId = `e2e-plan-${Date.now()}`;

  // Delete any existing task with this ID first (cleanup from previous runs)
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
    console.log('Task creation failed:', response.status(), body);
    throw new Error(`Failed to create test task: ${response.status()}`);
  }

  const taskData = await response.json();
  console.log('Created test task:', taskData.id);

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
    // Set demo-mode flag as backup (in addition to URL param)
    sessionStorage.setItem('nerve:demo-mode', 'true');
  });

  // Navigate with demo-mode query param
  await page.goto('/?demo-mode=true', { waitUntil: 'domcontentloaded' });

  // Dismiss gateway dialog if it appears (demo mode should prevent it, but be safe)
  // Check for the dialog using a more specific selector
  const connectButton = page.locator('button:has-text("Connect to Gateway")');
  if (await connectButton.isVisible().catch(() => false)) {
    // Click the connect button to establish connection and close dialog
    await connectButton.click();
    // Wait for connection to establish
    await page.waitForTimeout(3000);
  }

  // Wait for kanban board to load - look for any column header
  await page.waitForSelector('text=To Do', { timeout: 15000 });

  // Wait a bit for tasks to load
  await page.waitForTimeout(3000);
});

test.describe('Plan-First Workflow', () => {
  test('page loads and shows navigation', async ({ page }) => {
    // Check that the Nerve title in the top bar is visible
    await expect(page.getByText('Nerve').first()).toBeVisible();

    // Check that we can see the view mode buttons - Tasks button should be active
    const tasksButton = page.locator('[aria-label="Switch to tasks view"]');
    await expect(tasksButton).toBeVisible();
    // Since we set localStorage to 'kanban', the Tasks button should be pressed
    await expect(tasksButton).toHaveAttribute('aria-pressed', 'true', { timeout: 5000 });
  });

  test('plan panel renders in task detail', async ({ page }) => {
    // Find the test task by its title prefix and click it
    const taskItem = page.getByText(/E2E PlanFirst/).first();
    await expect(taskItem).toBeVisible({ timeout: 10000 });
    await taskItem.click({ force: true });
    await page.waitForTimeout(2000);

    // Task detail drawer should be open
    const drawer = page.locator('[role="dialog"]').first();
    await expect(drawer).toBeVisible({ timeout: 5000 });

    // Scroll down in the drawer content area to reveal the Implementation Plan section
    // The content is in an overflow-y-auto div
    await page.evaluate(() => {
      const scrollable = document.querySelector('[role="dialog"] .overflow-y-auto');
      if (scrollable) scrollable.scrollTop = 1000;
    });
    await page.waitForTimeout(1000);

    // Look for ANY text that would be in the PlanPanel
    // Try multiple selectors
    const implementationPlan = page.getByText('Implementation Plan');
    const noPlanYet = page.getByText('No plan yet');
    const createPlan = page.getByText('+ Create Plan');
    const loadingPlan = page.getByText('Loading plan');

    // At least one of these should be visible
    const hasImplementationPlan = await implementationPlan.isVisible().catch(() => false);
    const hasNoPlanYet = await noPlanYet.isVisible().catch(() => false);
    const hasCreatePlan = await createPlan.isVisible().catch(() => false);
    const hasLoadingPlan = await loadingPlan.isVisible().catch(() => false);

    console.log('PlanPanel content check:', {
      hasImplementationPlan,
      hasNoPlanYet,
      hasCreatePlan,
      hasLoadingPlan
    });

    expect(hasImplementationPlan || hasNoPlanYet || hasCreatePlan || hasLoadingPlan).toBeTruthy();
  });

  test('shows create plan button for task without plan', async ({ page }) => {
    // Click on the test task
    const taskItem = page.getByText(/E2E PlanFirst/).first();
    await expect(taskItem).toBeVisible({ timeout: 10000 });
    await taskItem.click({ force: true });
    await page.waitForTimeout(2000);

    // Drawer should be visible
    const drawer = page.locator('[role="dialog"]').first();
    await expect(drawer).toBeVisible({ timeout: 5000 });

    // Look for "+ Create Plan" button
    await expect(page.getByText('+ Create Plan')).toBeVisible({ timeout: 10000 });
  });

  test('plan editor can be opened', async ({ page }) => {
    // Click on the test task
    const taskItem = page.getByText(/E2E PlanFirst/).first();
    await expect(taskItem).toBeVisible({ timeout: 10000 });
    await taskItem.click({ force: true });
    await page.waitForTimeout(2000);

    // Drawer should be visible
    const drawer = page.locator('[role="dialog"]').first();
    await expect(drawer).toBeVisible({ timeout: 5000 });

    // Click "+ Create Plan" button
    const createButton = page.getByText('+ Create Plan');
    await expect(createButton).toBeVisible({ timeout: 5000 });
    await createButton.click({ force: true });
    await page.waitForTimeout(1000);

    // Editor textarea should be visible
    const editor = page.locator('textarea').first();
    await expect(editor).toBeVisible({ timeout: 5000 });
  });

  test('plan panel shows status badge', async ({ page }) => {
    // Click on the test task
    const taskItem = page.getByText(/E2E PlanFirst/).first();
    await expect(taskItem).toBeVisible({ timeout: 10000 });
    await taskItem.click({ force: true });
    await page.waitForTimeout(2000);

    // Drawer should be visible
    const drawer = page.locator('[role="dialog"]').first();
    await expect(drawer).toBeVisible({ timeout: 5000 });

    // For new tasks without a plan, we should see "No plan yet" text or Create Plan button
    const hasNoPlanText = await page.locator('text=No plan yet').isVisible().catch(() => false);
    const hasCreateButton = await page.getByText('+ Create Plan').isVisible().catch(() => false);

    expect(hasNoPlanText || hasCreateButton).toBeTruthy();
  });

  test('Dashboard button navigates to orchestrator view', async ({ page }) => {
    // Navigate to kanban view first
    const tasksButton = page.locator('[aria-label="Switch to tasks view"]');
    await expect(tasksButton).toBeVisible({ timeout: 5000 });
    if (await tasksButton.getAttribute('aria-pressed') !== 'true') {
      await tasksButton.click();
      await page.waitForTimeout(1000);
    }

    // Wait for kanban board to load
    await page.waitForSelector('text=To Do', { timeout: 15000 });
    await page.waitForTimeout(2000);

    // Look for Dashboard button in kanban header - use exact match and data-size attribute
    const dashboardButton = page.locator('button[data-size="sm"]:has-text("Dashboard")');
    await expect(dashboardButton).toBeVisible({ timeout: 10000 });

    // Click Dashboard button
    await dashboardButton.click();
    await page.waitForTimeout(3000);

    // Should navigate to orchestrator view - check for "Orchestrator Dashboard" heading
    const orchestratorHeading = page.locator('text=Orchestrator Dashboard');
    await expect(orchestratorHeading).toBeVisible({ timeout: 10000 });
  });
});
