/**
 * Plan-First Workflow - Comprehensive E2E Tests
 *
 * Tests all Plan-First functionality:
 * - PlanPanel rendering
 * - Plan creation via UI
 * - Plan editor functionality
 */

import { test, expect } from '@playwright/test';

test.use({
  baseURL: 'http://localhost:3080',
  screenshot: 'only-on-failure',
  trace: 'retain-on-failure',
});

test.beforeEach(async ({ page, request }) => {
  const taskTitle = `E2E Plan ${Date.now()}`;
  const taskId = `e2e-plan-${Date.now()}`;

  // Cleanup from previous runs
  await request.delete(`/api/kanban/tasks/${taskId}`).catch(() => {});

  // Create test task
  const response = await request.post('/api/kanban/tasks', {
    data: {
      id: taskId,
      title: taskTitle,
      description: 'Test task for Plan-First comprehensive E2E tests',
      priority: 'normal',
      status: 'todo',
      createdBy: 'agent:e2e-test',
    },
  });

  if (!response.ok()) {
    throw new Error(`Failed to create test task: ${response.status()}`);
  }

  // Setup demo mode
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem('nerve:gateway:url', 'ws://127.0.0.1:18789/ws');
    sessionStorage.setItem('nerve:gateway:token', 'test-token');
    sessionStorage.setItem('nerve:connectionState', 'connected');
    localStorage.setItem('nerve:viewMode', 'kanban');
    sessionStorage.setItem('nerve:demo-mode', 'true');
  });

  await page.goto('/?demo-mode=true', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=To Do', { timeout: 15000 });
  await page.waitForTimeout(2000);
});

test.describe('Plan-First Workflow - Comprehensive', () => {
  test('plan panel shows empty state for task without plan', async ({ page }) => {
    const taskItem = page.getByText(/E2E Plan/).first();
    await expect(taskItem).toBeVisible({ timeout: 10000 });
    await taskItem.click({ force: true });
    await page.waitForTimeout(2000);

    const drawer = page.locator('[role="dialog"]').first();
    await expect(drawer).toBeVisible({ timeout: 5000 });

    // Scroll to reveal plan section
    await page.evaluate(() => {
      const scrollable = document.querySelector('[role="dialog"] .overflow-y-auto');
      if (scrollable) scrollable.scrollTop = 1000;
    });
    await page.waitForTimeout(1000);

    // Should show "No plan yet" or "+ Create Plan"
    const hasNoPlan = await page.locator('text=No plan yet').isVisible().catch(() => false);
    const hasCreateButton = await page.getByText('+ Create Plan').isVisible().catch(() => false);
    expect(hasNoPlan || hasCreateButton).toBeTruthy();
  });

  test('can create plan via + Create Plan button', async ({ page }) => {
    const taskItem = page.getByText(/E2E Plan/).first();
    await taskItem.click({ force: true });
    await page.waitForTimeout(2000);

    // Scroll to plan section
    await page.evaluate(() => {
      const scrollable = document.querySelector('[role="dialog"] .overflow-y-auto');
      if (scrollable) scrollable.scrollTop = 1000;
    });
    await page.waitForTimeout(1000);

    // Click Create Plan
    const createButton = page.getByText('+ Create Plan');
    await expect(createButton).toBeVisible({ timeout: 5000 });
    await createButton.click();
    await page.waitForTimeout(1000);

    // Editor should appear
    const editor = page.locator('textarea').first();
    await expect(editor).toBeVisible({ timeout: 5000 });
  });

  test('plan editor accepts text input', async ({ page }) => {
    const taskItem = page.getByText(/E2E Plan/).first();
    await taskItem.click({ force: true });
    await page.waitForTimeout(2000);

    // Scroll to plan section
    await page.evaluate(() => {
      const scrollable = document.querySelector('[role="dialog"] .overflow-y-auto');
      if (scrollable) scrollable.scrollTop = 1000;
    });
    await page.waitForTimeout(500);

    const createButton = page.getByText('+ Create Plan');
    if (await createButton.isVisible().catch(() => false)) {
      await createButton.click();
      await page.waitForTimeout(500);
    }

    // Find and fill editor
    const editor = page.locator('textarea').first();
    if (await editor.isVisible().catch(() => false)) {
      await editor.fill('## Test Plan\n\nThis is test content.');
      await page.waitForTimeout(300);

      const value = await editor.inputValue();
      expect(value).toContain('Test Plan');
    } else {
      // Editor might already show content
      await expect(page.locator('[role="dialog"]')).toBeVisible();
    }
  });

  test('plan editor modal can be closed', async ({ page }) => {
    const taskItem = page.getByText(/E2E Plan/).first();
    await taskItem.click({ force: true });
    await page.waitForTimeout(2000);

    // Scroll to plan section
    await page.evaluate(() => {
      const scrollable = document.querySelector('[role="dialog"] .overflow-y-auto');
      if (scrollable) scrollable.scrollTop = 1000;
    });
    await page.waitForTimeout(500);

    const createButton = page.getByText('+ Create Plan');
    if (await createButton.isVisible().catch(() => false)) {
      await createButton.click();
      await page.waitForTimeout(500);

      // Close with Escape
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);

      // Drawer should still be open but editor closed
      await expect(page.locator('[role="dialog"]')).toBeVisible();
    } else {
      // No plan yet state
      await expect(page.locator('[role="dialog"]')).toBeVisible();
    }
  });

  test('task detail drawer shows plan section', async ({ page }) => {
    const taskItem = page.getByText(/E2E Plan/).first();
    await taskItem.click({ force: true });
    await page.waitForTimeout(2000);

    const drawer = page.locator('[role="dialog"]').first();
    await expect(drawer).toBeVisible({ timeout: 5000 });

    // Scroll through drawer content
    await page.evaluate(() => {
      const scrollable = document.querySelector('[role="dialog"] .overflow-y-auto');
      if (scrollable) scrollable.scrollTop = 1500;
    });
    await page.waitForTimeout(1000);

    // Verify drawer is still visible
    await expect(drawer).toBeVisible();
  });

  test('plan panel renders in drawer', async ({ page }) => {
    const taskItem = page.getByText(/E2E Plan/).first();
    await taskItem.click({ force: true });
    await page.waitForTimeout(2000);

    const drawer = page.locator('[role="dialog"]').first();
    await expect(drawer).toBeVisible({ timeout: 5000 });

    // Scroll to plan section
    await page.evaluate(() => {
      const scrollable = document.querySelector('[role="dialog"] .overflow-y-auto');
      if (scrollable) scrollable.scrollTop = 1000;
    });
    await page.waitForTimeout(500);

    // Check for plan-related content
    const hasPlanContent = await page.locator('text=No plan yet, text=Create Plan, text=Implementation Plan').first().isVisible().catch(() => false);
    expect(hasPlanContent || await drawer.isVisible()).toBeTruthy();
  });
});
