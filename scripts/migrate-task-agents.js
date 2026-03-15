#!/usr/bin/env node

/**
 * Migration script to assign agents to existing tasks without agent labels.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);
const NERVE_URL = 'http://localhost:3080';

function routeTask(description) {
  const text = (description || '').toLowerCase();
  
  const rules = [
    // Most specific rules first
    { pattern: /bunnycdn|bunny.*cdn|pull.?zone/i, agents: ['cdn-agent'] },
    { pattern: /cdn.*cname|cname.*automation/i, agents: ['cdn-agent'] },
    { pattern: /wowza.*crud|stream.*crud|wowza.*stream/i, agents: ['streaming-agent', 'hls-recorder-agent'] },
    { pattern: /target.*video|video.*integration/i, agents: ['mgmt-agent'] },
    { pattern: /alert.*system|alerting/i, agents: ['mgmt-agent', 'cicd-agent'] },
    { pattern: /health.*monitor|page.*health|monitoring.*system/i, agents: ['mgmt-agent', 'wordpress-agent'] },
    { pattern: /wordpress.*page|page.*template|template.*generator/i, agents: ['wordpress-agent'] },
    { pattern: /wordpress.*plugin|wp-.*plugin/i, agents: ['wordpress-agent'] },
    { pattern: /wp-(ccn|hdbc|njbc|nybc|tsv|nysea)/i, agents: ['wordpress-agent', 'cicd-agent'] },
    { pattern: /deploy.*mgmt|mgmt.*deploy/i, agents: ['k8s-agent', 'mgmt-agent', 'cicd-agent'] },
    { pattern: /k8s|kubernetes|namespace|pvc|cronjob/i, agents: ['k8s-agent'] },
    { pattern: /wowza|stream.*offline|hls.*issue|rtmp/i, agents: ['streaming-agent', 'hls-recorder-agent'] },
    { pattern: /database.*migration|mariadb|schema.*change/i, agents: ['database-agent', 'mgmt-agent'] },
    { pattern: /security.*audit|pr.*review|vulnerability/i, agents: ['security-reviewer'] },
    { pattern: /cdn.*purge|purge.*cache|cloudflare.*cache/i, agents: ['cdn-agent'] },
    { pattern: /cdn|cloudflare|cache|dns/i, agents: ['cdn-agent'] },
    { pattern: /backup.*create|restore.*backup|nfs/i, agents: ['storage-agent'] },
    { pattern: /splash.*video|youtube.*upload|social.*post/i, agents: ['splash-scripts-agent'] },
    { pattern: /github.*action|docker.*build|ci.*cd|pipeline/i, agents: ['cicd-agent'] },
    { pattern: /wordpress|wp-|plugin|theme/i, agents: ['wordpress-agent'] },
  ];
  
  for (const rule of rules) {
    if (rule.pattern.test(text)) {
      return { agents: rule.agents, sequence: rule.agents.length > 1 ? 'sequential' : 'single' };
    }
  }
  
  return { agents: ['orchestrator-agent'], sequence: 'single' };
}

async function fetchTasks() {
  const { stdout } = await execAsync(`curl -s "${NERVE_URL}/api/kanban/tasks?limit=200"`);
  const data = JSON.parse(stdout);
  return data.tasks || data.items || [];
}

async function updateTask(id, version, labels) {
  const labelsJson = JSON.stringify(labels);
  const { stdout } = await execAsync(
    `curl -s -X PATCH "${NERVE_URL}/api/kanban/tasks/${id}" ` +
    `-H "Content-Type: application/json" ` +
    `-d '{"version": ${version}, "labels": ${labelsJson}}'`
  );
  try {
    return JSON.parse(stdout);
  } catch {
    return { error: stdout.substring(0, 100) };
  }
}

async function main() {
  console.log('=== Task Agent Migration ===\n');
  
  const tasks = await fetchTasks();
  const tasksToFix = tasks.filter(t => {
    const labels = t.labels || [];
    const hasAgents = labels.some(l => l.startsWith('agent:'));
    return !hasAgents && !['done', 'cancelled'].includes(t.status);
  });
  
  console.log(`Found ${tasksToFix.length} tasks without agent assignments\n`);
  
  let success = 0;
  let failed = 0;
  
  for (const task of tasksToFix) {
    const description = task.description || task.title || '';
    const routing = routeTask(description);
    
    const existingLabels = task.labels || [];
    const newLabels = [...existingLabels, ...routing.agents.map(a => `agent:${a}`)];
    
    const result = await updateTask(task.id, task.version, newLabels);
    
    if (result.id || result.version) {
      console.log(`✓ ${task.id}`);
      console.log(`  Title: ${task.title}`);
      console.log(`  Agents: ${routing.agents.join(', ')}`);
      console.log();
      success++;
    } else {
      console.log(`✗ ${task.id}: ${result.error || 'Unknown error'}`);
      console.log();
      failed++;
    }
  }
  
  console.log('=== Summary ===');
  console.log(`Success: ${success}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${success + failed}`);
}

main().catch(console.error);
