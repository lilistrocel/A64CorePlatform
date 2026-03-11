#!/bin/bash
# Codebase Mapper - Incremental Re-run Script
# Detects code changes since last mapping run and re-seeds only affected tasks.
#
# Usage:
#   bash scripts/codebase_mapper/rerun.sh                # compare against HEAD~1
#   bash scripts/codebase_mapper/rerun.sh --since HEAD~5 # compare against 5 commits ago
#   bash scripts/codebase_mapper/rerun.sh --since v1.2.0 # compare against a tag
#
# After running, spawn mapping agents (same process as initial run) to process re-queued tasks.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Parse arguments
SINCE="${2:-HEAD~1}"
if [[ "$1" == "--since" ]]; then
    SINCE="$2"
fi

echo "=========================================="
echo "  Codebase Mapper - Incremental Re-run"
echo "=========================================="
echo "  Comparing: ${SINCE}..HEAD"
echo ""

# Get changed files
cd "$PROJECT_ROOT"
CHANGED_FILES=$(git diff --name-only "$SINCE" HEAD 2>/dev/null || git diff --name-only HEAD 2>/dev/null)

if [[ -z "$CHANGED_FILES" ]]; then
    echo "No changed files detected since ${SINCE}."
    echo "Nothing to re-seed."
    exit 0
fi

echo "Changed files:"
echo "$CHANGED_FILES" | sed 's/^/  /'
echo ""

# Call task_manager.py to re-seed affected tasks
python3 scripts/codebase_mapper/task_manager.py reseed --changed-files "$CHANGED_FILES"

echo ""
echo "Next steps:"
echo "  1. Review re-queued tasks above"
echo "  2. Spawn mapping agents to process them (same as initial run)"
echo "  3. After agents complete: python3 scripts/codebase_mapper/map_generator.py all"
echo "  4. Check progress: python3 scripts/codebase_mapper/task_manager.py stats"
echo "=========================================="
