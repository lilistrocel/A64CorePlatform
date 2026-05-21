#!/usr/bin/env bash
#
# A64Core daily MongoDB backup
# Dumps a64core_db (and esgagro_db as bonus) to ~/Documents/Backups/YYYY-MM-DD/
# Keeps last 14 days, prunes older.
#
# Usage:
#   a64core-backup.sh                   # daily run (default 14-day retention)
#   a64core-backup.sh adhoc             # writes to a -adhoc-HHMMSS subdir, no pruning
#   RETENTION_DAYS=30 a64core-backup.sh # custom retention
#
# Exit codes: 0 = success, 1 = backup failed, 2 = dependencies missing.

set -euo pipefail

LABEL="${1:-daily}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
BACKUP_ROOT="${HOME}/Documents/Backups"
LOG_FILE="${HOME}/Documents/Backups/.backup.log"

A64_MONGO_CONTAINER="a64coreplatform-mongodb-1"
A64_DB="a64core_db"
ESG_MONGO_CONTAINER="esgagro-mongodb-1"
ESG_USER="a64core_app"
ESG_PASSWORD="changeme_in_production"
ESG_AUTH_DB="esgagro_db"

DATE_TODAY=$(date -u +"%Y-%m-%d")
TIME_NOW=$(date -u +"%H%M%S")

if [ "$LABEL" = "adhoc" ]; then
    BACKUP_DIR="${BACKUP_ROOT}/${DATE_TODAY}-adhoc-${TIME_NOW}"
else
    BACKUP_DIR="${BACKUP_ROOT}/${DATE_TODAY}"
fi

log() {
    echo "[$(date -u +"%Y-%m-%d %H:%M:%S UTC")] $*" | tee -a "${LOG_FILE}"
}

mkdir -p "${BACKUP_DIR}"

# Sanity: docker available
if ! command -v docker &> /dev/null; then
    log "ERROR: docker CLI not found"
    exit 2
fi

# Sanity: a64core mongo running
if ! docker ps --format '{{.Names}}' | grep -q "^${A64_MONGO_CONTAINER}$"; then
    log "ERROR: container ${A64_MONGO_CONTAINER} not running"
    exit 2
fi

log "Backup starting label=${LABEL} dest=${BACKUP_DIR}"

# 1. a64core_db (no auth in current setup)
A64_OUT="${BACKUP_DIR}/a64core_db.archive.gz"
if docker exec "${A64_MONGO_CONTAINER}" mongodump --db="${A64_DB}" --archive --gzip > "${A64_OUT}" 2>"${BACKUP_DIR}/.a64core.log"; then
    SIZE=$(stat -c '%s' "${A64_OUT}")
    log "  ok  ${A64_DB}: ${SIZE} bytes"
else
    log "ERROR: a64core mongodump failed (see ${BACKUP_DIR}/.a64core.log)"
    exit 1
fi

# 2. esgagro_db (auth required) — best-effort, don't fail if container is down
ESG_OUT="${BACKUP_DIR}/esgagro_db.archive.gz"
if docker ps --format '{{.Names}}' | grep -q "^${ESG_MONGO_CONTAINER}$"; then
    if docker exec "${ESG_MONGO_CONTAINER}" mongodump \
            --username="${ESG_USER}" --password="${ESG_PASSWORD}" \
            --authenticationDatabase="${ESG_AUTH_DB}" \
            --archive --gzip > "${ESG_OUT}" 2>"${BACKUP_DIR}/.esgagro.log"; then
        SIZE=$(stat -c '%s' "${ESG_OUT}")
        log "  ok  esgagro: ${SIZE} bytes"
    else
        log "  warn esgagro mongodump failed (best-effort, continuing)"
    fi
else
    log "  skip esgagro container not running"
fi

# 3. Copy env files (root + esgagro instance) — small, useful for redeploy
mkdir -p "${BACKUP_DIR}/env"
[ -f /home/noobcity/Code/A64CorePlatform/.env ] && cp /home/noobcity/Code/A64CorePlatform/.env "${BACKUP_DIR}/env/.env"
[ -f /home/noobcity/Code/A64CorePlatform/instances/esgagro/.env ] && cp /home/noobcity/Code/A64CorePlatform/instances/esgagro/.env "${BACKUP_DIR}/env/.env.esgagro"

# 4. Git state snapshot
{
    echo "Branch:  $(cd /home/noobcity/Code/A64CorePlatform && git branch --show-current 2>/dev/null)"
    echo "HEAD:    $(cd /home/noobcity/Code/A64CorePlatform && git rev-parse HEAD 2>/dev/null)"
    echo "Remote:  $(cd /home/noobcity/Code/A64CorePlatform && git config --get remote.origin.url 2>/dev/null)"
    echo ""
    cd /home/noobcity/Code/A64CorePlatform && git log --oneline -5 2>/dev/null
} > "${BACKUP_DIR}/git-state.txt" 2>/dev/null || true

# 5. Manifest with checksums
(cd "${BACKUP_DIR}" && sha256sum *.gz env/* git-state.txt 2>/dev/null > MANIFEST.sha256) || true

# 6. Prune old backups (daily only)
if [ "$LABEL" = "daily" ] && [ "${RETENTION_DAYS}" -gt 0 ]; then
    PRUNED=0
    find "${BACKUP_ROOT}" -maxdepth 1 -type d -name "20*-*-*" -mtime "+${RETENTION_DAYS}" | while read -r OLD; do
        log "  prune ${OLD}"
        rm -rf "${OLD}"
        PRUNED=$((PRUNED + 1))
    done
fi

TOTAL_SIZE=$(du -sh "${BACKUP_DIR}" | awk '{print $1}')
log "Backup done size=${TOTAL_SIZE} dir=${BACKUP_DIR}"
