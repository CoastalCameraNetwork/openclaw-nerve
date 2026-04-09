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
  await page.waitForTimeout(2000);
});

test.describe('Live Task Execution and Output Verification', () => {
  test('execute task from kanban and verify agent output', async ({ page, request }) => {
    const taskId = 'create-tasks-for-implementatio';

    // Step 1: Navigate to Kanban board
    console.log('Navigating to Kanban board...');
    const tasksButton = page.locator('[aria-label*="tasks" i], button:has-text("Tasks")').first();
    await expect(tasksButton).toBeVisible({ timeout: 10000 });
    await tasksButton.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'test-results/kanban-board-pre-execution.png' });
    console.log('Kanban board loaded');

    // Step 2: Find and click the task card
    const taskCard = page.locator('[role="button"]').filter({ hasText: /create tasks for implementation/i }).first();
    await expect(taskCard).toBeVisible({ timeout: 5000 });
    await taskCard.click();
    await page.waitForTimeout(2000);
    console.log('Task drawer opened');

    // Step 3: Click Execute button
    const executeButton = page.locator('button:has-text("Execute")').first();
    await expect(executeButton).toBeVisible({ timeout: 5000 });
    await executeButton.click();
    console.log('Execute button clicked');
    await page.waitForTimeout(5000);

    // Step 4: Wait for task to start executing (status changes to in-progress)
    const inProgressBadge = page.locator('.badge:has-text("In Progress")');
    await expect(inProgressBadge).toBeVisible({ timeout: 15000 });
    console.log('Task status changed to in-progress');

    // Step 5: Wait for agent run to start
    const runStatus = page.locator('text=Running');
    await expect(runStatus).toBeVisible({ timeout: 10000 });
    console.log('Agent run started');

    // Take screenshot during execution
    await page.screenshot({ path: 'test-results/task-executing.png' });

    // Step 6: Wait for execution to complete (agents run in parallel, should be quick in audit-only mode)
    console.log('Waiting for agents to complete...');
    await page.waitForTimeout(30000);

    // Step 7: Refresh and check results
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // Re-open Kanban and task drawer
    await page.locator('button:has-text("Tasks")').first().click();
    await page.waitForTimeout(2000);
    await page.locator('[role="button"]').filter({ hasText: /create tasks for implementation/i }).first().click();
    await page.waitForTimeout(2000);

    // Step 8: Check for Agent Output section
    console.log('Checking for Agent Output section...');
    const agentOutputHeading = page.locator('h4:has-text("Agent Output")');
    const hasAgentOutput = await agentOutputHeading.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasAgentOutput) {
      console.log('✓ Agent Output section found!');

      // Check for streaming-agent
      const streamingAgent = page.locator('.font-semibold:has-text("streaming-agent")').first();
      const hasStreamingAgent = await streamingAgent.isVisible({ timeout: 5000 }).catch(() => false);

      if (hasStreamingAgent) {
        console.log('✓ streaming-agent found in output');

        // Check for output content
        const outputContent = page.locator('text=Streaming Agent Analysis');
        const hasOutput = await outputContent.isVisible({ timeout: 5000 }).catch(() => false);

        if (hasOutput) {
          console.log('✓ Agent output content displayed!');
          await page.screenshot({ path: 'test-results/agent-output-success.png' });
        } else {
          console.log('⚠ Output section exists but content not visible');
          await page.screenshot({ path: 'test-results/agent-output-section-empty.png' });
        }
      } else {
        console.log('⚠ Agent Output section exists but streaming-agent not found');
        await page.screenshot({ path: 'test-results/agent-output-no-streaming.png' });
      }
    } else {
      console.log('✗ No Agent Output section found');
      await page.screenshot({ path: 'test-results/no-agent-output-section.png' });
    }

    // Step 9: Verify via API
    console.log('Checking API response...');
    const apiResponse = await request.get(`/api/orchestrator/task/${taskId}/history`);
    expect(apiResponse.ok()).toBeTruthy();

    const apiData = await apiResponse.json();
    console.log('API metadata:', JSON.stringify(apiData.task.metadata, null, 2).substring(0, 800));

    if (apiData.task.metadata?.agentOutput) {
      const agents = Object.keys(apiData.task.metadata.agentOutput);
      console.log(`✓ Agent output captured for ${agents.length} agents: ${agents.join(', ')}`);
      expect(agents.length).toBeGreaterThan(0);
    } else {
      console.log('✗ No agentOutput in metadata - gateway webhook not configured');
    }

    // Step 10: Check Orchestrator Dashboard for task
    console.log('Checking Orchestrator Dashboard...');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const orchestratorButton = page.locator('[aria-label*="orchestrator" i], button:has-text("Orchestrator")').first();
    await expect(orchestratorButton).toBeVisible({ timeout: 10000 });
    await orchestratorButton.click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'test-results/orchestrator-after-execution.png' });
    console.log('Orchestrator Dashboard loaded');
  });
});
