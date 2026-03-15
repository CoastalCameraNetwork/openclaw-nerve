# Orchestrator Learnings

*Track patterns specific to the Nerve+OpenClaw orchestrator system*

## Agent Routing Patterns

### Successful Combinations
*Log agent combinations that work well together*

| Task Type | Agents | Sequence | Notes |
|-----------|--------|----------|-------|
| Security audit | security-reviewer | single | Always assigns correctly |
| CDN operations | cdn-agent | single | Fast, reliable |
| Wowza/Streaming | streaming-agent, hls-recorder-agent | parallel | Both needed for full context |

### Failed Combinations
*Log agent assignments that didn't work*

| Task Type | Assigned | Should Be | Lesson |
|-----------|----------|-----------|--------|
| | | | |

## Task Type Patterns

### High Success Rate
- Security audits → security-reviewer
- CDN operations → cdn-agent
- WordPress plugins → wordpress-agent

### Needs Improvement
- Complex multi-agent tasks → routing sometimes misses agents
- Cross-domain tasks → may need manual review

## User Preferences

### Gate Modes
- Default: audit-only (trusted tasks)
- Deployments: gate-on-deploy (requires approval)
- Code changes: audit-only with review

### Notification Style
- Prefer dashboard monitoring over messages
- Check proposals inbox regularly

## Model Assignments (from MODEL_STRATEGY.md)

### GLM 4.5 Agents (Tool-Heavy)
- k8s-agent, wordpress-agent, streaming-agent
- hls-recorder-agent, splash-scripts-agent
- storage-agent, cdn-agent, orchestrator-agent

### Qwen 3.5 Plus Agents (Complex Reasoning)
- mgmt-agent, database-agent, cicd-agent, security-reviewer

## To Learn Over Time
- [ ] Which tasks typically need follow-up proposals
- [ ] Optimal polling intervals for different task types
- [ ] Best time ranges for dashboard monitoring
- [ ] Common task patterns that should auto-route
