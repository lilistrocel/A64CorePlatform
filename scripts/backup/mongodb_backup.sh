#!/bin/bash
#
# MongoDB Backup Script for A64 Core Platform
# Performs compressed backup with retention policy
#
# Environment Variables Required:
#   MONGO_HOST - MongoDB hostname (default: mongodb)
#   MONGO_PORT - MongoDB port (default: 27017)
#   MONGO_DB - Database name (default: a64core_db)
#   MONGO_USER - MongoDB user (optional, for auth)
#   MONGO_PASSWORD - MongoDB password (optional, for auth)
#   MONGO_AUTH_DB - Authentication database (default: admin)
#
# Retention Policy:
#   BACKUP_RETENTION_DAILY - Keep last N daily backups (default: 7)
#   BACKUP_RETENTION_WEEKLY - Keep last N weekly backups/Sunday (default: 4)
#   BACKUP_RETENTION_MONTHLY - Keep last N monthly backups/1st of month (default: 3)
#

set -euo pipefail

# Configuration
MONGO_HOST="${MONGO_HOST:-mongodb}"
MONGO_PORT="${MONGO_PORT:-27017}"
MONGO_DB="${MONGO_DB:-a64core_db}"
MONGO_USER="${MONGO_USER:-}"
MONGO_PASSWORD="${MONGO_PASSWORD:-}"
MONGO_AUTH_DB="${MONGO_AUTH_DB:-admin}"

BACKUP_DIR="${BACKUP_DIR:-/backups/mongodb}"
LOG_FILE="${LOG_FILE:-/var/log/backup/mongodb_backup.log}"
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
BACKUP_PATH="${BACKUP_DIR}/${TIMESTAMP}"

# Encryption settings
BACKUP_ENCRYPTION_KEY="${BACKUP_ENCRYPTION_KEY:-}"
ENCRYPT_BACKUPS="${ENCRYPT_BACKUPS:-false}"

# Retention settings
RETENTION_DAILY="${BACKUP_RETENTION_DAILY:-7}"
RETENTION_WEEKLY="${BACKUP_RETENTION_WEEKLY:-4}"
RETENTION_MONTHLY="${BACKUP_RETENTION_MONTHLY:-3}"

# Functions
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "${LOG_FILE}"
}

error() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $*" | tee -a "${LOG_FILE}" >&2
}

# Ensure directories exist
mkdir -p "${BACKUP_DIR}"
mkdir -p "$(dirname "${LOG_FILE}")"

log "=== MongoDB Backup Started ==="
log "Database: ${MONGO_DB}"
log "Backup Path: ${BACKUP_PATH}"
log "Encryption: ${ENCRYPT_BACKUPS}"
log "Retention Policy: Daily=${RETENTION_DAILY}, Weekly=${RETENTION_WEEKLY}, Monthly=${RETENTION_MONTHLY}"

# Validate encryption config
if [[ "${ENCRYPT_BACKUPS}" == "true" ]]; then
    if [[ -z "${BACKUP_ENCRYPTION_KEY}" ]]; then
        error "ENCRYPT_BACKUPS=true but BACKUP_ENCRYPTION_KEY is not set!"
        exit 1
    fi
    if ! command -v openssl &> /dev/null; then
        error "openssl is required for backup encryption but not found"
        exit 1
    fi
    log "Backup encryption enabled (AES-256-CBC)"
fi

# Build mongodump command
MONGODUMP_CMD="mongodump --host=${MONGO_HOST} --port=${MONGO_PORT} --db=${MONGO_DB} --gzip --out=${BACKUP_PATH}"

if [[ -n "${MONGO_USER}" && -n "${MONGO_PASSWORD}" ]]; then
    MONGODUMP_CMD="${MONGODUMP_CMD} --username=${MONGO_USER} --password=${MONGO_PASSWORD} --authenticationDatabase=${MONGO_AUTH_DB}"
    log "Using authentication (user: ${MONGO_USER})"
fi

# Perform backup
log "Starting mongodump..."
if ${MONGODUMP_CMD} >> "${LOG_FILE}" 2>&1; then
    log "Backup completed successfully"

    # Get backup size
    BACKUP_SIZE=$(du -sh "${BACKUP_PATH}" | cut -f1)
    log "Backup size: ${BACKUP_SIZE}"

    # Encrypt backup if enabled
    if [[ "${ENCRYPT_BACKUPS}" == "true" ]]; then
        log "Encrypting backup..."
        ARCHIVE_FILE="${BACKUP_DIR}/${TIMESTAMP}.tar.gz"
        ENCRYPTED_FILE="${BACKUP_DIR}/${TIMESTAMP}.tar.gz.enc"

        # Create tarball of the backup directory
        tar -czf "${ARCHIVE_FILE}" -C "${BACKUP_DIR}" "${TIMESTAMP}"

        # Encrypt with AES-256-CBC using PBKDF2 key derivation
        openssl enc -aes-256-cbc -salt -pbkdf2 -iter 100000 \
            -in "${ARCHIVE_FILE}" \
            -out "${ENCRYPTED_FILE}" \
            -pass env:BACKUP_ENCRYPTION_KEY

        # Remove unencrypted files
        rm -f "${ARCHIVE_FILE}"
        rm -rf "${BACKUP_PATH}"

        # Recreate backup path as a marker directory for retention tracking
        mkdir -p "${BACKUP_PATH}"
        mv "${ENCRYPTED_FILE}" "${BACKUP_PATH}/backup.enc"

        ENCRYPTED_SIZE=$(du -sh "${BACKUP_PATH}/backup.enc" | cut -f1)
        log "Backup encrypted successfully (${ENCRYPTED_SIZE})"
    fi

    # Tag backup type for retention
    CURRENT_DATE=$(date +"%Y-%m-%d")
    DAY_OF_WEEK=$(date +"%u")  # 1=Monday, 7=Sunday
    DAY_OF_MONTH=$(date +"%d")

    # Create type marker files
    if [[ "${DAY_OF_MONTH}" == "01" ]]; then
        touch "${BACKUP_PATH}/.monthly"
        log "Tagged as monthly backup"
    elif [[ "${DAY_OF_WEEK}" == "7" ]]; then
        touch "${BACKUP_PATH}/.weekly"
        log "Tagged as weekly backup"
    else
        touch "${BACKUP_PATH}/.daily"
        log "Tagged as daily backup"
    fi
else
    error "Backup failed! Check log for details: ${LOG_FILE}"
    exit 1
fi

# Retention cleanup
log "=== Applying Retention Policy ==="

# Clean up daily backups (keep last N)
log "Cleaning daily backups (keep last ${RETENTION_DAILY})..."
find "${BACKUP_DIR}" -type f -name ".daily" | sort -r | tail -n +$((RETENTION_DAILY + 1)) | while read -r marker; do
    BACKUP_TO_DELETE=$(dirname "${marker}")
    log "Removing old daily backup: ${BACKUP_TO_DELETE}"
    rm -rf "${BACKUP_TO_DELETE}"
done

# Clean up weekly backups (keep last N)
log "Cleaning weekly backups (keep last ${RETENTION_WEEKLY})..."
find "${BACKUP_DIR}" -type f -name ".weekly" | sort -r | tail -n +$((RETENTION_WEEKLY + 1)) | while read -r marker; do
    BACKUP_TO_DELETE=$(dirname "${marker}")
    log "Removing old weekly backup: ${BACKUP_TO_DELETE}"
    rm -rf "${BACKUP_TO_DELETE}"
done

# Clean up monthly backups (keep last N)
log "Cleaning monthly backups (keep last ${RETENTION_MONTHLY})..."
find "${BACKUP_DIR}" -type f -name ".monthly" | sort -r | tail -n +$((RETENTION_MONTHLY + 1)) | while read -r marker; do
    BACKUP_TO_DELETE=$(dirname "${marker}")
    log "Removing old monthly backup: ${BACKUP_TO_DELETE}"
    rm -rf "${BACKUP_TO_DELETE}"
done

# Summary
TOTAL_BACKUPS=$(find "${BACKUP_DIR}" -maxdepth 1 -type d | wc -l)
TOTAL_SIZE=$(du -sh "${BACKUP_DIR}" | cut -f1)
log "=== Backup Summary ==="
log "Total backups: $((TOTAL_BACKUPS - 1))"  # Subtract 1 for the backup dir itself
log "Total storage used: ${TOTAL_SIZE}"
log "=== MongoDB Backup Completed ==="

exit 0
