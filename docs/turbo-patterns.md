# Turbo Patterns

Turbo patterns are composable, multi-agent workflows for automated code quality improvement. They combine specialist agents into pipelines that audit, polish, and finalize code changes.

## Overview

Turbo patterns provide three main workflows:

| Pattern | Purpose | Agents Involved |
|---------|---------|-----------------|
| **Audit** | Multi-agent code review | security-reviewer, performance-reviewer, architecture-reviewer, testing-reviewer |
| **Polish** | Iterative code refinement | format, lint, test, simplify |
| **Finalize** | Post-implementation QA | polish + learning extraction + changelog update |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Turbo Pattern Pipeline                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │   Audit     │───▶│   Polish    │───▶│  Finalize   │         │
│  │  (Review)   │    │ (Refine)    │    │ (Complete)  │         │
│  └─────────────┘    └─────────────┘    └─────────────┘         │
│         │                  │                  │                 │
│         ▼                  ▼                  ▼                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │  Findings   │    │  Pass/Fail  │    │  Learnings  │         │
│  │  Severity   │    │  Reports    │    │  Improvements│        │
│  │  Categories │    │  Suggestions│    │  Changelog  │         │
│  └─────────────┘    └─────────────┘    └─────────────┘         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## API Reference

### Audit

Run a multi-agent code audit on a file.

**Endpoint:** `POST /api/turbo/audit`

**Request Body:**
```json
{
  "filePath": "src/features/chat/ChatPanel.tsx",
  "projectPath": "/optional/project/path",
  "runSecurity": true,
  "runPerformance": true,
  "runArchitecture": true,
  "runTesting": true
}
```

**Response:**
```json
{
  "report_id": "audit_1234567890",
  "file_path": "src/features/chat/ChatPanel.tsx",
  "completed_at": 1712160000000,
  "results": [
    {
      "agent": "security-reviewer",
      "filePath": "src/features/chat/ChatPanel.tsx",
      "findings": [
        {
          "severity": "critical",
          "category": "security",
          "title": "Potential XSS vulnerability",
          "description": "User input rendered without sanitization",
          "suggestion": "Use DOMPurify.sanitize() before rendering"
        }
      ],
      "summary": "Security review found 1 critical issue",
      "duration": 4500
    }
  ],
  "totalFindings": {
    "critical": 1,
    "important": 2,
    "suggestions": 5,
    "nits": 3
  },
  "improvements": [
    {
      "id": "imp_001",
      "summary": "Add input sanitization",
      "priority": "critical"
    }
  ]
}
```

### Polish

Run iterative polish loop (format → lint → test → simplify).

**Endpoint:** `POST /api/turbo/polish`

**Request Body:**
```json
{
  "filePath": "src/features/chat/ChatPanel.tsx",
  "projectPath": "/optional/project/path",
  "runFormat": true,
  "runLint": true,
  "runTest": true,
  "runSimplify": false,
  "runReview": false
}
```

**Response:**
```json
{
  "report_id": "polish_1234567890",
  "file_path": "src/features/chat/ChatPanel.tsx",
  "steps": [
    {
      "step": "format",
      "success": true,
      "output": "Formatted with Prettier",
      "errors": []
    },
    {
      "step": "lint",
      "success": true,
      "output": "ESLint passed",
      "errors": []
    },
    {
      "step": "test",
      "success": true,
      "output": "All tests passed",
      "errors": []
    }
  ],
  "overall": "success",
  "suggestions": ["Consider extracting this logic into a custom hook"]
}
```

### Finalize

Complete post-implementation workflow.

**Endpoint:** `POST /api/turbo/finalize`

**Request Body:**
```json
{
  "taskId": "task_123",
  "filePaths": ["src/features/chat/ChatPanel.tsx"],
  "extractLearnings": true,
  "updateChangelog": true,
  "runTests": true
}
```

**Response:**
```json
{
  "report_id": "finalize_1234567890",
  "task_id": "task_123",
  "phases": [
    {
      "name": "polish",
      "success": true,
      "output": "Code polished successfully",
      "errors": []
    },
    {
      "name": "extract-learnings",
      "success": true,
      "output": "Extracted 3 learnings",
      "errors": []
    },
    {
      "name": "update-changelog",
      "success": true,
      "output": "CHANGELOG.md updated",
      "errors": []
    },
    {
      "name": "validate",
      "success": true,
      "output": "All validations passed",
      "errors": []
    }
  ],
  "overall": "success",
  "learnings_extracted": 3,
  "improvements_created": 2,
  "changelog_updated": true
}
```

### Extract Learnings

Extract learnings from a session conversation.

**Endpoint:** `POST /api/turbo/extract-learnings`

**Request Body:**
```json
{
  "sessionId": "session_123"
}
```

**Response:**
```json
{
  "learnings": [
    {
      "type": "correction",
      "content": "Always use useCallback for event handlers passed to children",
      "confidence": 0.95,
      "tags": ["react", "performance"]
    },
    {
      "type": "guidance",
      "content": "Prefer explicit type annotations on context values",
      "confidence": 0.9,
      "tags": ["typescript"]
    }
  ],
  "routed": [
    {
      "learning": { ... },
      "destination": "SKILL",
      "reasoning": "Generalizable React pattern"
    }
  ]
}
```

### Get Learnings

List all stored learnings.

**Endpoint:** `GET /api/turbo/learnings`

**Response:**
```json
{
  "entries": [
    {
      "id": "learn_001",
      "content": "Always use useCallback for event handlers",
      "source": "session-learning",
      "tags": ["react", "performance"],
      "createdAt": 1712160000000
    }
  ]
}
```

### Get Improvements

List all improvement proposals.

**Endpoint:** `GET /api/turbo/improvements`

**Response:**
```json
{
  "improvements": [
    {
      "id": "imp_001",
      "summary": "Add input sanitization",
      "description": "User input should be sanitized before rendering to prevent XSS",
      "priority": "critical",
      "source": "audit",
      "status": "backlog",
      "createdAt": 1712160000000,
      "tags": ["security", "xss"]
    }
  ]
}
```

## Severity Levels

Audit findings are categorized by severity:

| Severity | Color | Action Required |
|----------|-------|-----------------|
| `critical` | Red | Must fix before merge - security vulnerabilities, data loss risks |
| `important` | Orange | Should fix - correctness issues, performance problems |
| `suggestion` | Blue | Nice to have - maintainability improvements |
| `nit` | Gray | Optional - style preferences, minor improvements |

## Learning Types

Extracted learnings are classified by type:

| Type | Description | Example |
|------|-------------|---------|
| `correction` | Fixing a mistake | "Use useMemo to prevent infinite re-renders" |
| `guidance` | General best practice | "Always validate API inputs with Zod" |
| `skill-knowledge` | Pattern for skill creation | "Kubernetes deployments need resource limits" |
| `preference` | Team/coding preference | "Prefer const over function declarations" |
| `discovery` | New insight about codebase | "The auth middleware runs before rate limiting" |

## Learning Destinations

Learnings are routed to appropriate destinations:

| Destination | Description |
|-------------|-------------|
| `SKILL` | Becomes a new skill or updates existing skill |
| `CLAUDE_MD` | Added to CLAUDE.md project instructions |
| `AUTO_MEMORY` | Stored in auto-memory system |
| `IMPROVEMENT_BACKLOG` | Becomes a tracked improvement item |

## Frontend Integration

### TurboPatternsPanel

Quick action panel for running workflows:

```tsx
import { TurboPatternsPanel } from './features/orchestrator/TurboPatternsPanel';

function TaskDetail() {
  return (
    <TurboPatternsPanel
      taskId={selectedTaskId}
      filePath={selectedFile}
      onAuditComplete={(reportId) => console.log('Audit:', reportId)}
      onPolishComplete={(reportId) => console.log('Polish:', reportId)}
      onFinalizeComplete={(reportId) => console.log('Finalize:', reportId)}
    />
  );
}
```

### AuditDashboard

Display audit findings with filters:

```tsx
import { AuditDashboard } from './features/audit/AuditDashboard';

function AuditView() {
  return (
    <AuditDashboard
      reportId={reportId}
      autoRefresh={true}
      onFindingsChange={(findings) => setFindings(findings)}
    />
  );
}
```

### LearningExtractor

Display extracted learnings:

```tsx
import { LearningExtractor } from './features/learning/LearningExtractor';

function LearningView() {
  return (
    <LearningExtractor
      sessionId={sessionId}
      autoExtract={true}
      onLearningsExtracted={(learnings) => console.log(learnings)}
    />
  );
}
```

### ImprovementBacklog

Track and promote improvements:

```tsx
import { ImprovementBacklog } from './features/improvements/ImprovementBacklog';

function ImprovementsView() {
  return (
    <ImprovementBacklog
      projectId={projectId}
      onPromoteToTask={(improvement) => createTask(improvement)}
    />
  );
}
```

## Testing

Run Turbo pattern tests:

```bash
# Run all Turbo pattern tests
npm test -- --run server/routes/turbo-patterns.test.ts server/services/finalize-workflow.test.ts server/services/polish-code.test.ts

# Run with coverage
npm run test:coverage -- --include="server/routes/turbo-patterns.test.ts"
```

## Troubleshooting

### Audit fails with "Cannot read file"
- Ensure `filePath` is relative to project root or absolute
- Check `projectPath` if using relative paths

### Polish loop runs infinitely
- The polish service has a max iteration limit (default: 5)
- If formatting/linting conflict, check `.prettierrc` and `.eslintrc` compatibility

### Learnings not extracting
- Ensure session has sufficient conversation history
- Learning extraction requires Claude-generated responses

## Best Practices

1. **Run Audit Early** - Audit before starting implementation to identify potential issues
2. **Polish Incrementally** - Run polish after each logical change, not just at the end
3. **Finalize Completes Tasks** - Always run finalize when a task is marked done
4. **Review Learnings** - Periodically review extracted learnings for accuracy
5. **Promote Improvements** - Convert high-priority improvements to tasks promptly
