#!/usr/bin/env bash
#
# A64Core MongoDB restore — restores the a64core_db archive into the running
# a64coreplatform-mongodb-1 container, with --drop semantics.
#
# Usage:
#   a64core-restore.sh                                 # auto-pick latest daily backup
#   a64core-restore.sh ~/Documents/Backups/2026-05-19  # specific dir
#   a64core-restore.sh path/to/a64core_db.archive.gz   # specific archive
#   a64core-restore.sh ... --yes                       # skip confirmation
#
# Exit codes: 0 = success, 1 = restore failed, 2 = bad args, 3 = aborted by user.

set -euo pipefail

BACKUP_ROOT="${HOME}/Documents/Backups"
A64_MONGO_CONTAINER="a64coreplatform-mongodb-1"
A64_DB="a64core_db"
API_CONTAINER="a64coreplatform-api-1"
AUTO_YES=0

ARG="${1:-}"
[ "${2:-}" = "--yes" ] && AUTO_YES=1
[ "${ARG}" = "--yes" ] && { AUTO_YES=1; ARG=""; }

# Resolve archive path
if [ -z "${ARG}" ]; then
    LATEST=$(find "${BACKUP_ROOT}" -maxdepth 1 -type d -name "20*-*-*" 2>/dev/null | sort | tail -1)
    [ -z "${LATEST}" ] && { echo "No backups found in ${BACKUP_ROOT}"; exit 2; }
    ARCHIVE="${LATEST}/a64core_db.archive.gz"
elif [ -f "${ARG}" ]; then
    ARCHIVE="${ARG}"
elif [ -d "${ARG}" ]; then
    ARCHIVE="${ARG}/a64core_db.archive.gz"
else
    echo "ERROR: '${ARG}' is not a file or directory"
    exit 2
fi

[ ! -f "${ARCHIVE}" ] && { echo "ERROR: archive not found: ${ARCHIVE}"; exit 2; }

# Verify checksum if manifest is present
MANIFEST="$(dirname "${ARCHIVE}")/MANIFEST.sha256"
if [ -f "${MANIFEST}" ]; then
    echo "Verifying checksum…"
    (cd "$(dirname "${ARCHIVE}")" && sha256sum -c MANIFEST.sha256 --ignore-missing 2>&1 | grep "a64core_db.archive.gz")
fi

SIZE=$(stat -c '%s' "${ARCHIVE}")
echo ""
echo "Restore plan:"
echo "  Archive:  ${ARCHIVE}"
echo "  Size:     $((SIZE / 1024 / 1024)) MB"
echo "  Target:   ${A64_MONGO_CONTAINER} → ${A64_DB} (with --drop)"
echo "  Warning:  This wipes existing a64core_db collections before restore."
echo ""

if [ "${AUTO_YES}" = "0" ]; then
    read -p "Proceed? [y/N] " -n 1 -r REPLY
    echo ""
    [[ ! "${REPLY}" =~ ^[Yy]$ ]] && { echo "Aborted."; exit 3; }
fi

# Run restore
docker exec -i "${A64_MONGO_CONTAINER}" mongorestore --archive --gzip --drop < "${ARCHIVE}"

echo ""
echo "Counts after restore:"
docker exec "${A64_MONGO_CONTAINER}" mongosh --quiet "${A64_DB}" --eval "
['blocks','plantings','plant_data_enhanced','farms','users','divisions','block_harvests','sales_orders'].forEach(c => print('  ' + c + ': ' + db[c].countDocuments()))
"

# Recreate api so Pydantic settings rebuild fresh DB handles (some pooled connections cache db names)
if docker ps --format '{{.Names}}' | grep -q "^${API_CONTAINER}$"; then
    echo ""
    echo "Recreating ${API_CONTAINER}…"
    docker compose -f /home/noobcity/Code/A64CorePlatform/docker-compose.yml up -d --force-recreate api > /dev/null 2>&1 || \
      docker restart "${API_CONTAINER}" > /dev/null
fi

echo ""
echo "Done."
