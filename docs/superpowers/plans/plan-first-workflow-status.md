# Plan-First Workflow - Implementation Status

**Date:** 2026-04-03
**Status:** Implementation Complete, E2E Tests Blocked

---

## Summary

The Plan-First Workflow UI has been fully implemented. The feature enforces that tasks must have an approved implementation plan before transitioning to `in-progress` status.

---

## Implementation Complete

### Files Created/Modified

| File | Status | Purpose |
|------|--------|---------|
| `src/features/plans/useTaskPlan.ts` | ✅ Complete | React hook for plan API interaction |
| `src/features/plans/PlanPanel.tsx` | ✅ Complete | Main panel component |
| `src/features/plans/PlanEditor.tsx` | ✅ Complete | Inline markdown editor |
| `src/features/plans/PlanReviewActions.tsx` | ✅ Complete | Approve/reject buttons |
| `src/features/plans/index.ts` | ✅ Complete | Barrel export |
| `src/features/orchestrator/TaskDetailPanel.tsx` | ✅ Modified | Integrated PlanPanel |
| `tests/e2e/plan-first.spec.ts` | ✅ Created | Playwright test suite |

### Features Implemented

- ✅ View plan status (Draft, In Review, Approved, Needs Revision)
- ✅ Create and edit draft plans with markdown editor
- ✅ Submit plans for review
- ✅ Approve/reject plans (supervisor role)
- ✅ Reject dialog with reason and questions
- ✅ Answer tracking for reviewer questions
- ✅ PlanPanel integrated into task detail drawer

### Build Status

```bash
npm run build          # ✅ Passes
npm run build:server   # ✅ Passes
npm run lint           # ✅ Passes
```

---

## Test Infrastructure Gap

### Problem

E2E Playwright tests cannot complete because:

1. **Gateway Dialog Blocking**: The app requires a connection to an OpenClaw gateway at `ws://127.0.0.1:18789`
2. **No Dismiss Option**: The ConnectDialog has no close button - it only closes on successful connection
3. **Tests Run Without Gateway**: Playwright tests execute against the dev server without a running gateway

### Error Pattern

```
Error: locator.click: Test timeout of 60000ms exceeded.
Call log:
  - waiting for getByText('Test Task A').first()
```

Page snapshot shows:
- ConnectDialog overlay present
- Chat view active (not Tasks view)
- All interactions blocked by dialog

### Attempts Made

1. Pressing Escape key (dialog ignores it)
2. Clicking "Connect to Gateway" button (connection fails, dialog stays open)
3. Clicking outside dialog (no effect)
4. Force-clicking through overlay (doesn't bypass dialog z-index)

### Solutions to Implement

#### Option A: Mock Gateway Fixture (Recommended)

Add a test fixture that starts the existing mock gateway before Playwright tests:

```typescript
// tests/e2e/fixtures.ts
import { MockGateway } from '../../src/test/mock-gateway';

let mockGateway: MockGateway;

export async function setupMockGateway() {
  mockGateway = new MockGateway({ port: 18789, requireToken: 'test-token' });
  await mockGateway.listen();
  return mockGateway;
}

export async function teardownMockGateway() {
  await mockGateway?.close();
}
```

#### Option B: Demo Mode URL Parameter

Add a bypass for testing environments:

```typescript
// src/hooks/useConnectionManager.ts
const DEMO_MODE = new URLSearchParams(window.location.search).get('demo-mode') === 'true';
const [dialogOpen, setDialogOpen] = useState(!DEMO_MODE);
```

Then tests can navigate with `?demo-mode=true` to bypass the dialog.

#### Option C: Component Tests

Convert E2E tests to @testing-library/react component tests that mock the gateway connection context.

---

## Next Steps

1. **Implement test infrastructure** (choose Option A, B, or C above)
2. **Run Playwright tests** to verify UI functionality
3. **Manual verification** via browser at `http://localhost:3080?demo-mode=true`

---

## API Reference

Backend endpoints (already implemented in `server/routes/plans.ts`):

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/plans/:taskId` | GET | Get task plan |
| `/api/plans/:taskId` | PUT | Create/update draft plan |
| `/api/plans/:taskId/submit` | POST | Submit for review |
| `/api/plans/:taskId/approve` | POST | Approve plan |
| `/api/plans/:taskId/reject` | POST | Reject with questions |
| `/api/plans/:taskId` | DELETE | Delete plan |

---

## Related

- Backend enforcement: `server/routes/kanban.ts:538-546` (prevents in-progress without approved plan)
- Original plan: `/root/.claude/plans/scalable-rolling-rocket.md`
- Test file: `tests/e2e/plan-first.spec.ts`
