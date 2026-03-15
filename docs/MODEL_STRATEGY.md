# Model Strategy for Specialist Agents

Based on comprehensive analysis from [Clarifai's model comparison](https://www.clarifai.com/blog/kimi-k2-vs-qwen-3-vs-glm-4.5).

## Model Overview

| Model | Best For | Context | Cost (in/out) | Tool Success |
|-------|----------|---------|---------------|--------------|
| **GLM 4.5** | Tool integration, debugging, efficiency | 128K | $0.11 / $0.28 | 90.6% |
| **Qwen 3.5 Plus** | Large codebases, complex reasoning | 256K | $0.35-0.60 / $1.50 | ~85% |
| **Kimi K2** | Agentic multi-step, transparency | 130K-256K | $0.15 / $2.50 | ~85% |

## Agent Model Assignments

### GLM 4.5 Agents (Tool-Heavy, Cost-Sensitive)

These agents make many tool calls and benefit from GLM's 90.6% tool success rate:

| Agent | Why GLM 4.5 |
|-------|-------------|
| `k8s-agent` | kubectl, helm, K8s API calls |
| `wordpress-agent` | Plugin/theme operations, WP-CLI |
| `streaming-agent` | Wowza API, stream debugging |
| `hls-recorder-agent` | FFmpeg tool integration |
| `splash-scripts-agent` | YouTube/Social APIs, cron jobs |
| `storage-agent` | rsync, s3cmd, NFS operations |
| `cdn-agent` | BunnyCDN/Cloudflare API calls |
| `orchestrator-agent` | General tasks, cost-effective |

**Cost savings:** ~60-80% vs Qwen for high-volume tool agents

### Qwen 3.5 Plus Agents (Complex Reasoning, Large Context)

These agents need deep reasoning or work with large codebases:

| Agent | Why Qwen 3.5 Plus |
|-------|-------------------|
| `mgmt-agent` | Full-stack codebase (Fastify + React + Drizzle) |
| `database-agent` | Schema reasoning, migration planning |
| `cicd-agent` | Complex pipeline logic, multi-file workflows |
| `security-reviewer` | Deep security analysis, large context for code review |

**Benefits:** Better at understanding complex relationships, larger context windows

## Thinking Levels

| Level | When to Use | Agents |
|-------|-------------|--------|
| `high` | Complex reasoning, planning, analysis | database-agent, security-reviewer |
| `medium` | Standard tasks, moderate complexity | k8s, mgmt, streaming, hls-recorder, storage, cicd, orchestrator |
| `low` | Simple tasks, quick operations | wordpress, splash-scripts, cdn |

## Cost Optimization

### Monthly Cost Estimates (1M tokens/day)

| Agent Type | Model | Daily Cost | Monthly Cost |
|------------|-------|------------|--------------|
| Tool-heavy (GLM) | glm-4.5 | $0.39 | $11.70 |
| Reasoning (Qwen) | qwen3.5-plus | $0.95 | $28.50 |

**Total estimated monthly cost:** ~$100-150 for moderate usage
**vs all-Qwen deployment:** ~$250-350/month
**Savings:** 50-60%

## When to Override

Agents can override the default model per-task:

```typescript
// In agent code
const result = await invokeGatewayTool('sessions_spawn', {
  task: prompt,
  model: 'qwen3.5-plus', // Override for this task
  thinking: 'high',
});
```

### Override Scenarios

- **Escalate to Qwen** when GLM struggles with complex reasoning
- **Escalate to Kimi K2** when transparency/reasoning_content is needed
- **Downgrade to GLM** for simple follow-up tasks to save costs

## Monitoring

Track model performance via:
1. Tool call success rate per agent
2. Task completion time
3. User satisfaction/approval rates
4. Cost per completed task

Adjust assignments quarterly based on actual performance data.

## References

- [Kimi K2 vs Qwen 3 vs GLM 4.5 Comparison](https://www.clarifai.com/blog/kimi-k2-vs-qwen-3-vs-glm-4.5)
- [GLM 4.5 Documentation](https://github.com/THUDM/GLM-4.5)
- [Qwen 3 Coder Documentation](https://github.com/QwenLM/Qwen3-Coder)
- [Kimi K2 Documentation](https://github.com/MoonshotAI/Kimi-K2)
