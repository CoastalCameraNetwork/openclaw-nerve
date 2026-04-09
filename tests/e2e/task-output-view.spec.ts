import { test, expect } from '@playwright/test';

test.use({
  baseURL: 'http://localhost:3080',
  screenshot: 'only-on-failure',
  trace: 'retain-on-failure',
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem('nerve:gateway:url', 'ws://127.0.0.1:18789/ws');
    sessionStorage.setItem('nerve:gateway:token', 'test-token');
    sessionStorage.setItem('nerve:connectionState', 'connected');
    sessionStorage.setItem('nerve:demo-mode', 'true');
  });
  await page.goto('/?demo-mode=true', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
});

test.describe('Task Output Viewing', () => {
  test('kanban board loads with tasks', async ({ page }) => {
    // Navigate to kanban via Tasks button
    const tasksButton = page.locator('[aria-label*="tasks" i], button:has-text("Tasks")').first();
    await expect(tasksButton).toBeVisible({ timeout: 10000 });
    await tasksButton.click();
    await page.waitForTimeout(3000);

    // Take screenshot for debugging
    await page.screenshot({ path: 'test-results/kanban-board.png' });

    // Check page has task cards
    const bodyContent = await page.content();
    expect(bodyContent.length).toBeGreaterThan(5000);
    console.log('Page content length:', bodyContent.length);
  });

  test('task detail drawer opens and shows agent output section', async ({ page }) => {
    // Navigate to kanban
    const tasksButton = page.locator('[aria-label*="tasks" i], button:has-text("Tasks")').first();
    await tasksButton.click();
    await page.waitForTimeout(3000);

    // Find task card for create-tasks-for-implementatio
    const taskCard = page.locator('button, [role="button"]').filter({ hasText: /create tasks for implementation/i }).first();

    if (await taskCard.isVisible().catch(() => false)) {
      await taskCard.click();
      await page.waitForTimeout(2000);

      // Take screenshot of drawer
      await page.screenshot({ path: 'test-results/task-drawer.png' });

      // Check for agent output section - should have "Agent Output" heading
      const agentOutputHeading = page.locator('h4:has-text("Agent Output")');
      await expect(agentOutputHeading).toBeVisible({ timeout: 5000 });

      // Check for any agent name in the output (agent names vary based on execution)
      // Look for any font-semibold text within the agent output cards
      const agentNameElement = page.locator('h4:has-text("Agent Output") + div .font-semibold').first();
      await expect(agentNameElement).toBeVisible({ timeout: 5000 });

      // Check for actual output content (look for any substantial text block)
      const outputContent = page.locator('h4:has-text("Agent Output") + div div:has-text("Done")').first();
      await expect(outputContent).toBeVisible({ timeout: 5000 });

      console.log('Agent output section verified successfully');
    } else {
      console.log('Task card not found');
      await page.screenshot({ path: 'test-results/kanban-no-task.png' });
      throw new Error('Task card for "create tasks for implementation" not found');
    }
  });

  test('API returns task data with agent output in metadata', async ({ page }) => {
    const taskId = 'create-tasks-for-implementatio';

    const resp = await page.request.get(`http://localhost:3080/api/orchestrator/task/${taskId}/history`);
    expect(resp.ok()).toBeTruthy();

    const data = await resp.json();
    console.log('API Response:', JSON.stringify(data, null, 2).substring(0, 1000));

    expect(data.task).toBeDefined();
    expect(data.task.id).toBe(taskId);

    // Verify agent output exists in metadata
    expect(data.task.metadata).toBeDefined();
    expect(data.task.metadata?.agentOutput).toBeDefined();

    // Verify at least one agent output exists (agent name may vary based on execution)
    const agentNames = Object.keys(data.task.metadata?.agentOutput || {});
    expect(agentNames.length).toBeGreaterThan(0);

    // Verify output content exists for captured agents
    const firstAgent = agentNames[0];
    const agentOutput = data.task.metadata?.agentOutput[firstAgent]?.output;
    expect(agentOutput).toBeTruthy();
    expect(agentOutput.length).toBeGreaterThan(50);
  });
});
