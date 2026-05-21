#!/bin/bash
#
# Finance Outbox Reconciliation Sweeper
#
# Runs the Python reconciler script that detects and back-fills any missing
# outbox rows in finance_outbox for docs whose status is a finance-relevant
# terminal state (PR: Approved, Closed; PO: Open, Sent, Cancelled).
#
# Exits 0 on success or when FINANCE_OUTBOX_ENABLED is falsy (no-op).
# Exits 1 if the Python process reports processing errors.
#
# This script is invoked by crond inside the cron container.
# The script itself is idempotent — concurrent runs produce at most one
# outbox row per (docId, status) pair via deterministic event IDs.
#

log() {
    echo "[$(date +'%Y-%m-%dT%H:%M:%SZ')] $1"
}

log "=== Starting Finance Outbox Reconciliation Sweep ==="

# The Python interpreter added to the cron image via Dockerfile.
PYTHON="${PYTHON_BIN:-python3}"

# PYTHONPATH is set in docker-compose so src/ and contracts/ are importable.
# Explicit fallback to /app if the env var is absent (shouldn't happen in Docker).
export PYTHONPATH="${PYTHONPATH:-/app/src:/app}"

"$PYTHON" /app/cron/scripts/outbox_reconciler.py
EXIT_CODE=$?

if [ "$EXIT_CODE" -eq 0 ]; then
    log "=== Sweep completed successfully ==="
else
    log "=== Sweep finished with errors (exit code $EXIT_CODE) ==="
fi

exit "$EXIT_CODE"
