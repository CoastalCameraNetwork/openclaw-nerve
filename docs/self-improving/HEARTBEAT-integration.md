# Heartbeat Integration for Self-Improving + Orchestrator

## Add to HEARTBEAT.md

```markdown
## Self-Improving Review (2x daily)

- Review corrections.md for new orchestrator patterns
- Check if any task failures should be logged
- Update orchestrator-learnings.md with successful routing patterns
- Promote frequently-used agent combinations to HOT memory
```

## Heartbeat State Tracking

Update `heartbeat-state.md` with orchestrator-specific markers:

```markdown
last_orchestrator_review: never
tasks_completed_since_review: 0
routing_changes_identified: 0
```

## What to Log Automatically

### After Each Orchestrator Task
1. Task completed successfully? → Log pattern if notable
2. Task failed or needed retry? → Log to corrections.md
3. Agent assignment wrong? → Log correct assignment
4. User approved/rejected? → Log preference

### Weekly Review
- Count tasks by agent
- Identify most successful agent combinations
- Archive old/unused patterns
- Update model assignments if needed

## Queries for Heartbeat

When heartbeat runs, check:

1. "What orchestrator tasks completed since last review?"
2. "Any repeated routing mistakes?"
3. "Which agent combinations worked best?"
4. "Should any patterns be promoted to HOT memory?"
