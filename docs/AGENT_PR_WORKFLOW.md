# Agent PR Review & Fix Workflow

## All Agents Follow Same Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    ANY REVIEW AGENT                         │
│  (security-reviewer, mgmt-agent, cicd-agent, etc.)         │
└─────────────────────────────────────────────────────────────┘
                            │
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 1. REVIEW PR                                                │
│    → Fetch PR via gh CLI                                    │
│    → Analyze code/diff                                      │
│    → Identify issues                                        │
└─────────────────────────────────────────────────────────────┘
                            │
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. REPORT ISSUES                                            │
│    → Critical (BLOCKER)                                     │
│    → High (BLOCKER)                                         │
│    → Medium (BLOCKER)                                       │
│    → Low (SUGGESTION)                                       │
└─────────────────────────────────────────────────────────────┘
                            │
                    ┌───────┴───────┐
                    │  Any Issues?  │
                    └───────┬───────┘
                            │
              ┌─────────────┴─────────────┐
              │                           │
           YES │                        NO │
              ↓                           ↓
┌─────────────────────────┐   ┌─────────────────────────┐
│ 3. FIX ISSUES           │   │ 3. PASS REVIEW          │
│    → Agent fixes code   │   │    → Report: PASSED     │
│    → Commit changes     │   │    → Next agent reviews │
│    → Push to PR         │   └─────────────────────────┘
└───────────┬─────────────┘
            │
            ↓
┌─────────────────────────┐
│ 4. RE-REVIEW            │
│    → Same agent reviews │
│    → If pass → Next     │
│    → If fail → Fix again│
└─────────────────────────┘
```

## Agent Responsibilities

### security-reviewer
**Reviews:**
- Authentication/authorization issues
- SQL injection vulnerabilities
- XSS vulnerabilities
- Sensitive data exposure
- Insecure dependencies
- Security misconfigurations

**Fix Loop:**
```
Review → Find security issues → Fix → Re-review → Repeat until clean
```

### mgmt-agent (Code Quality)
**Reviews:**
- Code organization and structure
- Design patterns and best practices
- Maintainability
- Readability
- Documentation
- Error handling
- Type safety

**Fix Loop:**
```
Review → Find quality issues → Fix → Re-review → Repeat until clean
```

### cicd-agent
**Reviews:**
- Build failures
- Test failures
- Linting errors
- Code style issues
- Missing tests
- Performance regressions

**Fix Loop:**
```
Review → Find CI/CD issues → Fix → Re-run CI → Repeat until green
```

## Unified Workflow

ALL agents follow the same pattern:

1. **REVIEW** - Analyze PR for issues in their domain
2. **REPORT** - Categorize issues by severity
3. **FIX** - Fix issues (if any found)
4. **RE-REVIEW** - Verify fixes
5. **PASS** - Only when ALL issues resolved

## Benefits

✅ **Consistent Process** - All agents use same workflow
✅ **No Premature Pass** - Issues must be fixed before passing
✅ **Automated Fixes** - Agents fix their own findings
✅ **Audit Trail** - Each review/fix cycle logged
✅ **Quality Gate** - Human review only when ALL agents pass

## Example: Security Review Flow

```
security-reviewer starts review
         │
         ↓
   Finds SQL injection in auth.ts (CRITICAL)
         │
         ↓
   Reports: "CRITICAL: SQL injection vulnerability"
         │
         ↓
   Fix Issues triggered
         │
         ↓
   security-reviewer fixes SQL injection
         │
         ↓
   Commits: "Fix SQL injection in auth.ts"
         │
         ↓
   Pushes to PR branch
         │
         ↓
   Re-runs security review
         │
         ↓
   No issues found → PASS
         │
         ↓
   Next agent (cicd-agent) reviews
```

## Configuration

All agents use:
- `gh` CLI for PR access
- Same severity levels
- Same fix/review loop
- Same commit/push workflow
- Same re-review trigger
