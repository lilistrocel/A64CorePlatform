#!/usr/bin/env bash
#
# Safe wrapper around `docker compose down` for A64Core.
# Always takes an ad-hoc backup BEFORE stopping the stack.
# Refuses to pass through -v (volume deletion) without an explicit --i-know.
#
# Usage:
#   a64core-down.sh             # backup + docker compose down
#   a64core-down.sh --no-backup # skip backup (NOT recommended)
#   a64core-down.sh -v --i-know # also remove volumes (DESTROYS data)

set -euo pipefail

REPO=/home/noobcity/Code/A64CorePlatform
SKIP_BACKUP=0
PASS_THROUGH=()
DELETE_VOLUMES=0
CONFIRM_VOLUME_DELETE=0

for arg in "$@"; do
    case "$arg" in
        --no-backup) SKIP_BACKUP=1 ;;
        --i-know)    CONFIRM_VOLUME_DELETE=1 ;;
        -v|--volumes) DELETE_VOLUMES=1; PASS_THROUGH+=("$arg") ;;
        *)           PASS_THROUGH+=("$arg") ;;
    esac
done

if [ "${DELETE_VOLUMES}" = "1" ] && [ "${CONFIRM_VOLUME_DELETE}" = "0" ]; then
    echo "ERROR: -v/--volumes will DESTROY MongoDB data. Pass --i-know to confirm."
    exit 2
fi

if [ "${SKIP_BACKUP}" = "0" ]; then
    echo "[a64core-down] Taking ad-hoc backup before shutdown…"
    /home/noobcity/bin/a64core-backup.sh adhoc
else
    echo "[a64core-down] Backup skipped (--no-backup)."
fi

echo "[a64core-down] Running: docker compose down ${PASS_THROUGH[*]:-}"
cd "$REPO"
docker compose down "${PASS_THROUGH[@]}"
