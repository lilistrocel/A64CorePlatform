#!/bin/bash
#
# MongoDB Restore Script for A64 Core Platform
# Restores database from compressed backup
#
# Environment Variables Required:
#   MONGO_HOST - MongoDB hostname (default: mongodb)
#   MONGO_PORT - MongoDB port (default: 27017)
#   MONGO_DB - Database name (default: a64core_db)
#   MONGO_USER - MongoDB user (optional, for auth)
#   MONGO_PASSWORD - MongoDB password (optional, for auth)
#   MONGO_AUTH_DB - Authentication database (default: admin)
#   BACKUP_ENCRYPTION_KEY - Decryption key (required if backup is encrypted)
#
# Usage:
#   ./mongodb_restore.sh /backups/mongodb/2025-11-01_14-30-00
#   ./mongodb_restore.sh /backups/mongodb/2025-11-01_14-30-00 --yes  # Skip confirmation
#

set -euo pipefail

# Configuration
MONGO_HOST="${MONGO_HOST:-mongodb}"
MONGO_PORT="${MONGO_PORT:-27017}"
MONGO_DB="${MONGO_DB:-a64core_db}"
MONGO_USER="${MONGO_USER:-}"
MONGO_PASSWORD="${MONGO_PASSWORD:-}"
MONGO_AUTH_DB="${MONGO_AUTH_DB:-admin}"

LOG_FILE="${LOG_FILE:-/var/log/backup/mongodb_restore.log}"

# Functions
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "${LOG_FILE}"
}

error() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $*" | tee -a "${LOG_FILE}" >&2
}

usage() {
    cat << EOF
Usage: $0 <backup_path> [--yes]

Arguments:
  backup_path    Path to backup directory (e.g., /backups/mongodb/2025-11-01_14-30-00)
  --yes          Skip confirmation prompt (use with caution)

Environment Variables:
  MONGO_HOST     MongoDB hostname (default: mongodb)
  MONGO_PORT     MongoDB port (default: 27017)
  MONGO_DB       Database name (default: a64core_db)
  MONGO_USER     MongoDB user (optional)
  MONGO_PASSWORD MongoDB password (optional)
  MONGO_AUTH_DB  Authentication database (default: admin)

Example:
  $0 /backups/mongodb/2025-11-01_14-30-00
  $0 /backups/mongodb/2025-11-01_14-30-00 --yes

EOF
    exit 1
}

# Parse arguments
if [[ $# -lt 1 ]]; then
    error "Missing backup path argument"
    usage
fi

BACKUP_PATH="$1"
SKIP_CONFIRMATION="${2:-}"

# Ensure log directory exists
mkdir -p "$(dirname "${LOG_FILE}")"

log "=== MongoDB Restore Started ==="
log "Database: ${MONGO_DB}"
log "Backup Path: ${BACKUP_PATH}"

# Validate backup path
if [[ ! -d "${BACKUP_PATH}" ]]; then
    error "Backup directory does not exist: ${BACKUP_PATH}"
    exit 1
fi

# Check if backup is encrypted
ENCRYPTED_FILE="${BACKUP_PATH}/backup.enc"
IS_ENCRYPTED=false
RESTORE_PATH="${BACKUP_PATH}"

if [[ -f "${ENCRYPTED_FILE}" ]]; then
    IS_ENCRYPTED=true
    log "Encrypted backup detected"

    BACKUP_ENCRYPTION_KEY="${BACKUP_ENCRYPTION_KEY:-}"
    if [[ -z "${BACKUP_ENCRYPTION_KEY}" ]]; then
        error "Backup is encrypted but BACKUP_ENCRYPTION_KEY is not set!"
        exit 1
    fi

    # Decrypt to temporary directory
    TEMP_DIR=$(mktemp -d)
    TEMP_ARCHIVE="${TEMP_DIR}/backup.tar.gz"
    trap 'rm -rf "${TEMP_DIR}"' EXIT

    log "Decrypting backup..."
    if openssl enc -aes-256-cbc -d -salt -pbkdf2 -iter 100000 \
        -in "${ENCRYPTED_FILE}" \
        -out "${TEMP_ARCHIVE}" \
        -pass env:BACKUP_ENCRYPTION_KEY 2>>"${LOG_FILE}"; then
        log "Decryption successful"
    else
        error "Decryption failed! Wrong key or corrupted backup."
        exit 1
    fi

    # Extract tarball
    log "Extracting decrypted backup..."
    tar -xzf "${TEMP_ARCHIVE}" -C "${TEMP_DIR}"
    rm -f "${TEMP_ARCHIVE}"

    # Find the extracted backup directory (named by timestamp)
    EXTRACTED_DIR=$(find "${TEMP_DIR}" -maxdepth 1 -mindepth 1 -type d | head -1)
    if [[ -z "${EXTRACTED_DIR}" ]]; then
        error "Could not find extracted backup directory"
        exit 1
    fi
    RESTORE_PATH="${EXTRACTED_DIR}"
    log "Restore path: ${RESTORE_PATH}"
fi

# Check if backup contains the database directory
DB_BACKUP_PATH="${RESTORE_PATH}/${MONGO_DB}"
if [[ ! -d "${DB_BACKUP_PATH}" ]]; then
    error "Database backup not found in: ${DB_BACKUP_PATH}"
    error "Expected structure: ${RESTORE_PATH}/${MONGO_DB}/"
    exit 1
fi

# Validate backup contains .gz files
GZ_COUNT=$(find "${DB_BACKUP_PATH}" -name "*.bson.gz" | wc -l)
if [[ "${GZ_COUNT}" -eq 0 ]]; then
    error "No .bson.gz files found in backup directory"
    error "This may not be a valid mongodump backup"
    exit 1
fi

log "Found ${GZ_COUNT} collection backup files"
if [[ "${IS_ENCRYPTED}" == "true" ]]; then
    log "Backup was encrypted (decrypted to temp directory)"
fi

# Get backup metadata
if [[ -f "${BACKUP_PATH}/.daily" ]]; then
    BACKUP_TYPE="daily"
elif [[ -f "${BACKUP_PATH}/.weekly" ]]; then
    BACKUP_TYPE="weekly"
elif [[ -f "${BACKUP_PATH}/.monthly" ]]; then
    BACKUP_TYPE="monthly"
else
    BACKUP_TYPE="unknown"
fi

BACKUP_SIZE=$(du -sh "${BACKUP_PATH}" | cut -f1)
BACKUP_DATE=$(basename "${BACKUP_PATH}")

log "Backup Info:"
log "  Type: ${BACKUP_TYPE}"
log "  Date: ${BACKUP_DATE}"
log "  Size: ${BACKUP_SIZE}"
log "  Collections: ${GZ_COUNT}"

# Confirmation prompt
if [[ "${SKIP_CONFIRMATION}" != "--yes" ]]; then
    echo ""
    echo "⚠️  WARNING: This will REPLACE all data in database '${MONGO_DB}' ⚠️"
    echo ""
    echo "Target: ${MONGO_HOST}:${MONGO_PORT}/${MONGO_DB}"
    echo "Backup: ${BACKUP_PATH}"
    echo ""
    read -p "Are you sure you want to proceed? (yes/no): " -r
    echo ""

    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        log "Restore cancelled by user"
        echo "Restore cancelled."
        exit 0
    fi
fi

log "User confirmed restore operation"

# Build mongorestore command
MONGORESTORE_CMD="mongorestore --host=${MONGO_HOST} --port=${MONGO_PORT} --db=${MONGO_DB} --gzip --drop"

if [[ -n "${MONGO_USER}" && -n "${MONGO_PASSWORD}" ]]; then
    MONGORESTORE_CMD="${MONGORESTORE_CMD} --username=${MONGO_USER} --password=${MONGO_PASSWORD} --authenticationDatabase=${MONGO_AUTH_DB}"
    log "Using authentication (user: ${MONGO_USER})"
fi

# Add the database backup path
MONGORESTORE_CMD="${MONGORESTORE_CMD} ${DB_BACKUP_PATH}"

# Perform restore
log "Starting mongorestore..."
log "Command: mongorestore --host=${MONGO_HOST} --port=${MONGO_PORT} --db=${MONGO_DB} --gzip --drop [auth_params] ${DB_BACKUP_PATH}"

if ${MONGORESTORE_CMD} >> "${LOG_FILE}" 2>&1; then
    log "Restore completed successfully"

    # Verify restore
    log "Verifying restore..."

    # Build mongo connection string for verification
    MONGO_CONN="mongodb://"
    if [[ -n "${MONGO_USER}" && -n "${MONGO_PASSWORD}" ]]; then
        MONGO_CONN="${MONGO_CONN}${MONGO_USER}:${MONGO_PASSWORD}@"
    fi
    MONGO_CONN="${MONGO_CONN}${MONGO_HOST}:${MONGO_PORT}/${MONGO_DB}"
    if [[ -n "${MONGO_USER}" && -n "${MONGO_PASSWORD}" ]]; then
        MONGO_CONN="${MONGO_CONN}?authSource=${MONGO_AUTH_DB}"
    fi

    # Count collections (using mongosh)
    COLLECTION_COUNT=$(mongosh "${MONGO_CONN}" --quiet --eval "db.getCollectionNames().length" 2>/dev/null || echo "0")
    log "Collections in database: ${COLLECTION_COUNT}"

    log "=== MongoDB Restore Completed Successfully ==="
    echo ""
    echo "✅ Restore completed successfully!"
    echo "   Database: ${MONGO_DB}"
    echo "   Collections: ${COLLECTION_COUNT}"
    echo "   Log: ${LOG_FILE}"
    echo ""

    exit 0
else
    error "Restore failed! Check log for details: ${LOG_FILE}"
    echo ""
    echo "❌ Restore failed! Check log: ${LOG_FILE}"
    echo ""
    exit 1
fi
