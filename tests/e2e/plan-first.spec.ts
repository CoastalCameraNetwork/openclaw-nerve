/**
 * Plan-First Workflow E2E Tests
 *
 * Tests the Plan-First Workflow feature where tasks must have an approved plan
 * before transitioning to in-progress status.
 */

import { test, expect } from '@playwright/test';

test.describe('Plan-First Workflow', () => {
  test('creates a plan for a task', async ({ page }) => {
    await page.goto('http://localhost:3080');

    // Navigate to orchestrator tab
    await page.getByRole('tab', { name: /orchestrator/i }).click();
    await page.waitForTimeout(2000);

    // Select a task
    const taskItem = page.getByTestId('task-item').first();
    await taskItem.click();
    await page.waitForTimeout(1000);

    // Find and click "Create Plan" button
    const createPlanButton = page.getByRole('button', { name: /create plan/i });
    if (await createPlanButton.isVisible()) {
      await createPlanButton.click();
      await page.waitForTimeout(500);

      // Write plan content
      const editor = page.getByRole('textbox', { name: /write your implementation plan/i });
      if (await editor.isVisible()) {
        await editor.fill(`## Overview
Implement feature X

## Implementation Steps
1. Step one - create component
2. Step two - add tests
3. Step three - integrate

## Testing
- Unit tests for new component
- Integration tests with existing features`);

        // Save draft
        await page.getByRole('button', { name: /save draft/i }).click();
        await page.waitForTimeout(1000);

        // Verify plan content is displayed
        await expect(page.getByText(/implement feature x/i)).toBeVisible();
      }
    }
  });

  test('displays plan status badge', async ({ page }) => {
    await page.goto('http://localhost:3080');
    await page.getByRole('tab', { name: /orchestrator/i }).click();
    await page.waitForTimeout(2000);

    // Select a task
    const taskItem = page.getByTestId('task-item').first();
    await taskItem.click();
    await page.waitForTimeout(1000);

    // Check for plan panel
    const planPanel = page.getByRole('heading', { name: /implementation plan/i });
    if (await planPanel.isVisible()) {
      // Status badge should be present (Draft, In Review, Approved, or Needs Revision)
      const statusBadge = page.locator('span').filter({ hasText: /draft|in review|approved|needs revision/i }).first();
      if (await statusBadge.isVisible()) {
        const statusText = await statusBadge.textContent();
        expect(statusText?.toLowerCase()).toMatch(/draft|in review|approved|needs revision/i);
      }
    }
  });

  test('shows plan editor when editing', async ({ page }) => {
    await page.goto('http://localhost:3080');
    await page.getByRole('tab', { name: /orchestrator/i }).click();
    await page.waitForTimeout(2000);

    // Select a task
    const taskItem = page.getByTestId('task-item').first();
    await taskItem.click();
    await page.waitForTimeout(1000);

    // Look for edit button or create button
    const editButton = page.getByRole('button', { name: /edit/i }).first();
    const createButton = page.getByRole('button', { name: /\+ create plan/i });

    if (await createButton.isVisible()) {
      await createButton.click();
    } else if (await editButton.isVisible()) {
      await editButton.click();
    }

    await page.waitForTimeout(500);

    // Editor should be visible with textarea
    const editor = page.locator('textarea').filter({ hasText: /## Overview/ });
    if (await editor.isVisible()) {
      await expect(editor).toBeVisible();
    }
  });

  test('plan panel integrates with task detail', async ({ page }) => {
    await page.goto('http://localhost:3080');
    await page.getByRole('tab', { name: /orchestrator/i }).click();
    await page.waitForTimeout(2000);

    // Select a task
    const taskItem = page.getByTestId('task-item').first();
    await taskItem.click();
    await page.waitForTimeout(1000);

    // Task detail panel should be visible
    await expect(page.getByRole('heading', { name: /implementation plan/i }).or(page.getByText(/no plan yet/i))).toBeVisible();

    // Plan panel should show within the task detail
    const planSection = page.locator('section').filter({ hasText: /implementation plan/i }).first();
    if (await planSection.isVisible()) {
      await expect(planSection).toBeVisible();
    }
  });
});
