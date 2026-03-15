#!/bin/bash
# PR Review Workflow Script
# Automates the complete PR review and fix cycle

set -e

NERVE_URL="http://localhost:3080"
TASK_ID="$1"

if [ -z "$TASK_ID" ]; then
    echo "Usage: $0 <task-id>"
    echo "Example: $0 cdn-cname-automation"
    exit 1
fi

echo "============================================"
echo "  PR Review Workflow for: $TASK_ID"
echo "============================================"
echo ""

# Step 1: Check task status
echo "📋 Step 1: Checking task status..."
TASK=$(curl -s "$NERVE_URL/api/kanban/tasks/$TASK_ID")
STATUS=$(echo $TASK | python3 -c "import sys,json; print(json.load(sys.stdin).get('status', 'unknown'))" 2>/dev/null || echo "error")
echo "   Task status: $STATUS"

if [ "$STATUS" == "error" ]; then
    echo "   ❌ Task not found"
    exit 1
fi

# Check if task has PR
HAS_PR=$(echo $TASK | python3 -c "import sys,json; print('yes' if json.load(sys.stdin).get('pr') else 'no')" 2>/dev/null || echo "no")
if [ "$HAS_PR" == "no" ]; then
    echo ""
    echo "📝 Step 2: Creating PR..."
    PR_RESULT=$(curl -s -X POST "$NERVE_URL/api/orchestrator/task/$TASK_ID/pr")
    echo "$PR_RESULT" | python3 -m json.tool 2>/dev/null || echo "$PR_RESULT"
    
    PR_NUMBER=$(echo $PR_RESULT | python3 -c "import sys,json; print(json.load(sys.stdin).get('pr', {}).get('number', 'unknown'))" 2>/dev/null || echo "unknown")
    if [ "$PR_NUMBER" != "unknown" ]; then
        echo "   ✅ PR #$PR_NUMBER created"
    else
        echo "   ❌ Failed to create PR"
        exit 1
    fi
else
    PR_NUMBER=$(echo $TASK | python3 -c "import sys,json; print(json.load(sys.stdin).get('pr', {}).get('number', 'unknown'))" 2>/dev/null || echo "unknown")
    echo "   ✓ Task already has PR #$PR_NUMBER"
fi

echo ""
echo "🔍 Step 3: Running automated PR review..."
REVIEW_RESULT=$(curl -s -X POST "$NERVE_URL/api/orchestrator/task/$TASK_ID/review")
echo "$REVIEW_RESULT" | python3 -m json.tool 2>/dev/null || echo "$REVIEW_RESULT"

# Parse review result
PASSED=$(echo $REVIEW_RESULT | python3 -c "import sys,json; print(json.load(sys.stdin).get('report', {}).get('passed', False))" 2>/dev/null || echo "false")
CRITICAL=$(echo $REVIEW_RESULT | python3 -c "import sys,json; print(json.load(sys.stdin).get('report', {}).get('criticalIssues', 0))" 2>/dev/null || echo "0")
HIGH=$(echo $REVIEW_RESULT | python3 -c "import sys,json; print(json.load(sys.stdin).get('report', {}).get('highIssues', 0))" 2>/dev/null || echo "0")

echo ""
if [ "$PASSED" == "True" ]; then
    echo "✅ Automated review PASSED"
    echo "   Task moved to REVIEW (ready for human review)"
    echo ""
    echo "   Next steps:"
    echo "   1. Review PR on GitHub: https://github.com/CoastalCameraNetwork/mgmt/pull/$PR_NUMBER"
    echo "   2. Add any additional comments"
    echo "   3. Merge if satisfied"
    echo "   4. Click 'Complete Task' in Nerve UI"
else
    echo "❌ Automated review FAILED"
    echo "   Critical issues: $CRITICAL"
    echo "   High issues: $HIGH"
    echo ""
    echo "   Agent will now fix issues..."
    echo ""
    
    # Step 4: Agent fixes issues
    echo "🔧 Step 4: Agent fixing PR comments..."
    FIX_RESULT=$(curl -s -X POST "$NERVE_URL/api/orchestrator/execute/$TASK_ID")
    echo "$FIX_RESULT" | python3 -m json.tool 2>/dev/null || echo "$FIX_RESULT"
    
    echo ""
    echo "   Agent is working on fixes..."
    echo "   Wait for agent to complete, then re-run this script to re-review"
fi

echo ""
echo "============================================"
