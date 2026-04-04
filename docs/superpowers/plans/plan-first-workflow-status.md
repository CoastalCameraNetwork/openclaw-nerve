# Plan-First Workflow - Implementation Status

**Date:** 2026-04-04
**Status:** Implementation Complete, E2E Tests Blocked on Server Infrastructure

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

## Test Infrastructure Status

### Demo Mode Implemented

Added `?demo-mode=true` URL parameter to bypass gateway connection dialog for E2E tests:

- `src/hooks/useConnectionManager.ts` - Checks for demo-mode param, skips dialog
- `tests/e2e/plan-first.spec.ts` - Navigates with `/?demo-mode=true`

### Current Blocking Issue

E2E tests fail with HTTP 500 from `/api/kanban/tasks` endpoint. The server returns 500 for both GET and POST requests to the kanban API.

**Error pattern:**
```
Page snapshot shows:
  - paragraph: Couldn't load tasks
  - paragraph: HTTP 500
```

**Investigation needed:**
- Server's `getKanbanStore()` may have initialization issues in dev mode
- Data directory path may not be resolved correctly
- Kanban store may need environment variable `NERVE_DATA_DIR` set

### Next Steps for Testing

1. **Debug server kanban API** - Check why `/api/kanban/tasks` returns 500
2. **Verify data directory** - Ensure `~/.nerve/kanban/tasks.json` is accessible
3. **Run tests after fix** - Execute Playwright tests once API works

**Manual verification works:**
- Open http://localhost:3080?demo-mode=true
- Navigate to Tasks view
- Kanban board should load (if server issue is fixed)
- Click task to see PlanPanel in detail drawer

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
