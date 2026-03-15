---
name: nerve-proposals
description: "Create kanban proposals in Nerve when you find gaps, next steps, or recommendations. Use during audits, code reviews, or any work that identifies follow-up tasks."
metadata:
  {
    "openclaw":
      {
        "emoji": "📋",
        "requires": { "bins": ["curl"] },
      },
  }
---

# Nerve Proposals Tool

Create kanban proposals from agent findings. Use this tool when you identify gaps, next steps, or recommendations during your work.

## When to Use

Call this tool when you discover:
- **Missing features** that should be implemented
- **Security gaps** that need addressing  
- **Performance improvements** that would help
- **Follow-up tasks** that are out of scope for current work
- **Technical debt** that should be tracked

## Tool Invocation

Use `exec` to call the Nerve API:

```bash
curl -X POST http://localhost:3080/api/kanban/proposals \
  -H "Content-Type: application/json" \
  -d '{
    "type": "create",
    "payload": {
      "title": "Your proposal title",
      "description": "Detailed description...",
      "priority": "high",
      "column": "backlog"
    },
    "sourceSessionKey": "agent:your-agent-id",
    "proposedBy": "agent:your-agent-id"
  }'
```

## Examples

### Example 1: Security Gap Found

```bash
curl -X POST http://localhost:3080/api/kanban/proposals \
  -H "Content-Type: application/json" \
  -d '{
    "type": "create",
    "payload": {
      "title": "Implement rate limiting on auth endpoints",
      "description": "During security audit of mgmt auth, found no rate limiting on /api/auth/login. This allows brute force attacks.\n\n**Recommendation:**\n- Add rate limiting (max 5 attempts per IP per minute)\n- Implement account lockout after 10 failed attempts\n- Add CAPTCHA after 3 failures\n\n**Impact:** Critical security vulnerability",
      "priority": "high",
      "column": "backlog"
    },
    "sourceSessionKey": "agent:security-reviewer",
    "proposedBy": "agent:security-reviewer"
  }'
```

### Example 2: Missing Feature

```bash
curl -X POST http://localhost:3080/api/kanban/proposals \
  -H "Content-Type: application/json" \
  -d '{
    "type": "create",
    "payload": {
      "title": "Add Wowza stream CRUD API endpoints",
      "description": "MGMT platform lacks stream management. Derek manually configures streams in Wowza UI (60-90 min process).\n\n**Required endpoints:**\n- POST /api/wowza/streams - Create stream\n- GET /api/wowza/streams - List all streams  \n- PUT /api/wowza/streams/:id - Update stream config\n- DELETE /api/wowza/streams/:id - Delete stream\n\n**Impact:** Would reduce onboarding from 90 min to <5 min",
      "priority": "high",
      "column": "backlog"
    },
    "sourceSessionKey": "agent:mgmt-agent",
    "proposedBy": "agent:mgmt-agent"
  }'
```

### Example 3: Technical Debt

```bash
curl -X POST http://localhost:3080/api/kanban/proposals \
  -H "Content-Type: application/json" \
  -d '{
    "type": "create",
    "payload": {
      "title": "Add unit tests for auth middleware",
      "description": "Auth middleware has no test coverage. Found during code review.\n\n**Test cases needed:**\n- Valid token validation\n- Expired token rejection\n- Malformed token handling\n- Rate limiting behavior\n\n**Estimated effort:** 4-6 hours",
      "priority": "normal",
      "column": "backlog"
    },
    "sourceSessionKey": "agent:security-reviewer",
    "proposedBy": "agent:security-reviewer"
  }'
```

## Priority Guidelines

- **high**: Security issues, blocking bugs, critical missing features
- **normal**: Important improvements, nice-to-have features, tech debt
- **low**: Nice-to-have, future enhancements, low-impact improvements

## Best Practices

1. **Be specific** - Include exact endpoints, files, or components
2. **Explain impact** - Why does this matter? What's the cost of not doing it?
3. **Include context** - Link to related work or findings
4. **Actionable** - Clear enough that another agent can pick it up
5. **One proposal per gap** - Don't bundle multiple unrelated items

## Response Format

Success response:
```json
{
  "id": "uuid-here",
  "type": "create",
  "payload": {
    "title": "Your proposal title",
    "priority": "high"
  },
  "proposedBy": "agent:your-agent-id",
  "status": "pending"
}
```

Error response:
```json
{
  "error": "validation_error",
  "details": "title: Required field missing"
}
```

## Viewing Proposals

Proposals appear in the Nerve Kanban "Proposals" inbox. Humans can:
- **Approve** - Converts to a kanban task
- **Reject** - Discards the proposal

Access the Kanban board at: http://localhost:3080
