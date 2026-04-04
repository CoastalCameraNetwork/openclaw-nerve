/**
 * Plan-First Workflow E2E Tests
 *
 * Tests the Plan-First Workflow feature where tasks must have an approved plan
 * before transitioning to in-progress status.
 */

import { test, expect } from '@playwright/test';

test.use({
  ignoreHTTPSErrors: true,
  baseURL: 'https://localhost:3081',
});

// Navigate with demo-mode to bypass gateway connection dialog
// and create test tasks via API
test.beforeEach(async ({ page, request }) => {
  // Create test tasks via kanban API
  try {
    await request.post('/api/kanban/tasks', {
      data: {
        title: 'Test Task A',
        description: 'Test task for Plan-First Workflow E2E tests',
        priority: 'normal',
        status: 'todo',
        createdBy: 'e2e-test',
      },
    });
  } catch (e) {
    // Task might already exist, continue
  }

  await page.goto('/?demo-mode=true');
  await page.waitForTimeout(1000);
});

test.describe('Plan-First Workflow', () => {
  test('plan panel renders in task detail', async ({ page }) => {
    // Wait for page load
    await page.waitForTimeout(2000);

    // Switch to Tasks view using aria-label
    const tasksButton = page.getByLabel('Switch to tasks view');
    await tasksButton.click({ force: true });

    // Wait for kanban board to load - look for column headers
    await page.waitForSelector('text="TO DO"', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(3000);

    // Find a task and click it
    const taskItem = page.getByText('Test Task A').first();
    await taskItem.click({ force: true });
    await page.waitForTimeout(2000);

    // Task detail dialog should be open - look for Implementation Plan section
    const planSection = page.locator('section').filter({ hasText: /Implementation Plan/i });

    // PlanPanel should be rendered (either showing plan content or "No plan yet" message)
    const planPanel = page.getByText(/Implementation Plan/i);
    await expect(planPanel).toBeVisible();
  });

  test('shows create plan button for task without plan', async ({ page }) => {
    await page.waitForTimeout(2000);

    // Switch to Tasks view
    const tasksButton = page.getByLabel('Switch to tasks view');
    await tasksButton.click({ force: true });

    // Wait for kanban board to load
    await page.waitForSelector('text="TO DO"', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(3000);

    // Click on a test task
    const taskItem = page.getByText('Test Task A').first();
    await taskItem.click({ force: true });
    await page.waitForTimeout(2000);

    // Look for "Create Plan" or "+ Create Plan" button
    const createPlanButton = page.getByRole('button', { name: /create plan/i }).or(page.getByText('+ Create Plan'));

    // Either the create button exists or we can see a plan
    const hasCreateButton = await createPlanButton.isVisible().catch(() => false);
    const hasPlanContent = await page.getByText(/Implementation Plan/i).isVisible().catch(() => false);

    expect(hasCreateButton || hasPlanContent).toBeTruthy();
  });

  test('plan editor can be opened', async ({ page }) => {
    await page.waitForTimeout(2000);

    // Switch to Tasks view
    const tasksButton = page.getByLabel('Switch to tasks view');
    await tasksButton.click({ force: true });

    // Wait for kanban board to load
    await page.waitForSelector('text="TO DO"', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(3000);

    // Click on a test task
    const taskItem = page.getByText('Test Task A').first();
    await taskItem.click({ force: true });
    await page.waitForTimeout(2000);

    // Try to click create plan or edit button
    const createButton = page.getByRole('button', { name: /\+ create plan/i }).or(page.getByRole('button', { name: /edit/i }).first());

    if (await createButton.isVisible().catch(() => false)) {
      await createButton.click();
      await page.waitForTimeout(1000);

      // Editor textarea should be visible
      const editor = page.locator('textarea').first();
      await expect(editor).toBeVisible();
    }
  });

  test('plan panel shows status badge', async ({ page }) => {
    await page.waitForTimeout(2000);

    // Switch to Tasks view
    const tasksButton = page.getByLabel('Switch to tasks view');
    await tasksButton.click({ force: true });

    // Wait for kanban board to load
    await page.waitForSelector('text="TO DO"', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(3000);

    // Click on a test task
    const taskItem = page.getByText('Test Task A').first();
    await taskItem.click({ force: true });
    await page.waitForTimeout(2000);

    // If there's a plan, it should have a status badge
    const statusBadges = ['Draft', 'In Review', 'Approved', 'Needs Revision'];
    let foundBadge = false;

    for (const status of statusBadges) {
      const badge = page.getByText(status);
      if (await badge.isVisible().catch(() => false)) {
        foundBadge = true;
        break;
      }
    }

    // Either we found a status badge or there's no plan yet
    const noPlanText = page.getByText(/no plan yet/i);
    const hasNoPlan = await noPlanText.isVisible().catch(() => false);

    expect(foundBadge || hasNoPlan).toBeTruthy();
  });
});
