#!/usr/bin/env bash
#
# A64Core watchdog — runs every 5 min via cron.
# If a64coreplatform-nginx-1 is not "Up healthy", brings the stack up.
# Also ensures cross-project finance/mysql containers are reachable from a64core network.
#
# Exits fast (under 1s) when everything is healthy — safe to run frequently.

set -euo pipefail

REPO=/home/noobcity/Code/A64CorePlatform
LOGFILE=${HOME}/Documents/Backups/.watchdog.log
LOCKFILE=/tmp/a64core-watchdog.lock
MIN_HEAL_INTERVAL=240   # don't try to heal more than once per 4 min (prevents storms)
HEAL_MARKER=/tmp/a64core-watchdog.last-heal

log() {
    echo "[$(date -u +"%Y-%m-%d %H:%M:%S UTC")] $*" >> "${LOGFILE}"
}

# Single-instance guard
exec 9>"${LOCKFILE}"
if ! flock -n 9; then
    exit 0   # another watchdog is mid-recovery; skip silently
fi

# Quick path: nginx healthy → done, do nothing.
NGINX_STATUS=$(docker ps --filter "name=^a64coreplatform-nginx-1$" --format '{{.Status}}' 2>/dev/null | head -1)
if [[ "${NGINX_STATUS}" == Up*healthy* ]]; then
    # Bonus check: even if nginx is fine, look for Vite transform errors
    # in user-portal logs (last 2 min) → those mean the page is blank for users.
    if docker ps --format '{{.Names}}' | grep -q "^a64coreplatform-user-portal-1$"; then
        VITE_ERR=$(docker logs --since 2m a64coreplatform-user-portal-1 2>&1 | \
            grep -E "vite\] Internal server error|TransformError|has already been declared|Cannot find module" | \
            tail -1)
        if [ -n "$VITE_ERR" ]; then
            MARKER=/tmp/a64core-watchdog.last-vite-warn
            # Only warn once per occurrence (within 10 min)
            if [ ! -f "$MARKER" ] || [ $(( $(date +%s) - $(stat -c '%Y' "$MARKER") )) -gt 600 ]; then
                touch "$MARKER"
                log "VITE ERROR DETECTED — front-end is broken (page will be blank for users):"
                log "  ${VITE_ERR:0:300}"
                log "  Fix the TS/JS error in working tree, then docker restart a64coreplatform-user-portal-1"
            fi
        fi
    fi
    exit 0
fi

# Skip if we tried to heal very recently
if [ -f "${HEAL_MARKER}" ]; then
    LAST=$(stat -c '%Y' "${HEAL_MARKER}")
    NOW=$(date +%s)
    if [ $((NOW - LAST)) -lt "${MIN_HEAL_INTERVAL}" ]; then
        log "skip — last heal $((NOW - LAST))s ago (<${MIN_HEAL_INTERVAL}s throttle)"
        exit 0
    fi
fi
touch "${HEAL_MARKER}"

log "heal start — nginx status: '${NGINX_STATUS:-<absent>}'"

cd "${REPO}"
docker compose up -d >> "${LOGFILE}" 2>&1 || log "  warn — compose up returned non-zero"

# Re-bridge cross-project containers (a64-finance + a64-mysql). Idempotent: error if already connected, ignored.
for c in a64-finance a64-mysql; do
    if docker ps --format '{{.Names}}' | grep -q "^${c}$"; then
        docker network connect --alias "${c#a64-}" a64coreplatform_a64core-network "${c}" 2>/dev/null && \
            log "  bridged ${c} → a64coreplatform_a64core-network" || true
    fi
done

# Wait for nginx to settle, report final state.
sleep 8
FINAL=$(docker ps --filter "name=^a64coreplatform-nginx-1$" --format '{{.Status}}' 2>/dev/null | head -1)
log "heal done — final nginx status: '${FINAL:-<still absent>}'"
