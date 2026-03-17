# Automated PR Review & Fix Workflow

## Complete Workflow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. AGENT EXECUTES TASK                                      │
│    → Works on code                                          │
│    → Creates PR                                             │
│    → Task → REVIEW                                          │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. AUTOMATED PR REVIEW                                      │
│    → Click "Run Automated Review" button                    │
│    → security-reviewer checks security                      │
│    → cicd-agent checks CI/CD (gh run list)                  │
│    → mgmt-agent checks code quality                         │
│    → Report generated                                       │
└─────────────────────────────────────────────────────────────┘
                            ↓
                    ┌───────────────┐
                    │ Issues Found? │
                    └───────┬───────┘
                            │
              ┌─────────────┴─────────────┐
              │                           │
           YES │                        NO │
              ↓                           ↓
┌─────────────────────────┐   ┌─────────────────────────┐
│ 3a. FIX ISSUES          │   │ 3b. READY FOR HUMAN     │
│    → Click "Fix Issues" │   │    → Human reviews PR   │
│    → Agent fixes code   │   │    → Merge if approved  │
│    → Commits & pushes   │   │    → Task → DONE        │
│    → Task → IN-PROGRESS │   └─────────────────────────┘
└───────────┬─────────────┘
            │
            ↓
┌─────────────────────────┐
│ 4. RE-RUN REVIEW        │
│    → Auto or manual     │
│    → Back to Step 2     │
└─────────────────────────┘
```

## API Endpoints

### Run Automated Review
```bash
POST /api/orchestrator/task/:id/review
```

Spawns agents to review PR using gh CLI:
- security-reviewer (security issues)
- cicd-agent (CI/CD checks via `gh run list`)
- mgmt-agent (code quality)

### Fix Issues
```bash
POST /api/orchestrator/task/:id/fix
```

Spawns appropriate agent to fix reported issues:
- Reads PR diff via `gh pr diff`
- Fixes code issues
- Commits and pushes to PR branch
- Task stays in-progress

### Re-run Review
```bash
POST /api/orchestrator/task/:id/rerun-review
```

Re-runs automated review after fixes:
- Waits for commits to process
- Runs all checks again
- If passed → Task → REVIEW
- If failed → Task → IN-PROGRESS (continue fixing)

## Benefits

✅ **No duplicate agents** - Single session per review type
✅ **Uses gh CLI** - Authenticated, efficient, real data
✅ **Iterative fixes** - Auto-fix loop until clean
✅ **Human review last** - Only after all automated checks pass
✅ **Full audit trail** - All reviews and fixes logged

## Configuration

Requires:
- `gh` CLI installed and authenticated
- `GITHUB_TOKEN` in environment
- Agent access to project directory
