#!/usr/bin/env bash
#
# A64 Core Platform — full server deploy script
#
# Bootstraps a fresh host: validates prereqs → clones (or pulls) the repo →
# initialises .env from template → brings the stack up → initialises MongoDB
# replica set → optionally restores from a backup → installs daily backup &
# watchdog cron → smoke-tests the public endpoint.
#
# Usage:
#   bash scripts/deploy/deploy.sh                          # interactive defaults
#   REPO_DIR=/srv/a64core bash scripts/deploy/deploy.sh   # override target dir
#   RESTORE_FROM=/path/to/backup-dir bash scripts/deploy/deploy.sh   # also restore
#   SKIP_CRON=1 bash scripts/deploy/deploy.sh             # don't install cron
#   DEPLOY_PROFILE=finance bash scripts/deploy/deploy.sh  # include finance overlay
#   DRY_RUN=1 bash scripts/deploy/deploy.sh               # print actions, no changes
#
# Idempotent: safe to re-run. Won't overwrite an existing .env, won't wipe
# existing volumes. Pass FORCE_ENV=1 to overwrite .env from template.
#
# Exit codes: 0=ok · 1=prereq missing · 2=stack failed · 3=user abort

set -euo pipefail

# ---------- configuration --------------------------------------------------

REPO_URL="${REPO_URL:-https://github.com/lilistrocel/A64CorePlatform.git}"
REPO_DIR="${REPO_DIR:-${HOME}/Code/A64CorePlatform}"
BRANCH="${BRANCH:-main}"
DEPLOY_PROFILE="${DEPLOY_PROFILE:-}"        # set to "finance" to include the finance overlay
RESTORE_FROM="${RESTORE_FROM:-}"            # path to a backup dir or .archive.gz to restore on boot
SKIP_CRON="${SKIP_CRON:-0}"                 # set to 1 to skip backup + watchdog cron install
FORCE_ENV="${FORCE_ENV:-0}"                 # set to 1 to overwrite an existing .env
DRY_RUN="${DRY_RUN:-0}"
PUBLIC_HEALTH_URL="${PUBLIC_HEALTH_URL:-http://localhost/api/health}"

# ---------- helpers --------------------------------------------------------

C_OK='\033[0;32m'; C_WARN='\033[0;33m'; C_ERR='\033[0;31m'; C_DIM='\033[0;90m'; C_RST='\033[0m'
log()  { echo -e "${C_DIM}[$(date +%H:%M:%S)]${C_RST} $*"; }
ok()   { echo -e "${C_OK}✓${C_RST} $*"; }
warn() { echo -e "${C_WARN}!${C_RST} $*"; }
err()  { echo -e "${C_ERR}✘${C_RST} $*" >&2; }
run()  { if [ "${DRY_RUN}" = "1" ]; then echo "  [dry] $*"; else eval "$@"; fi; }

# ---------- 1. prerequisites -----------------------------------------------

log "Step 1/9: checking prerequisites"

MISSING=0
for cmd in docker git curl python3; do
    if ! command -v "${cmd}" >/dev/null; then
        err "missing: ${cmd}"
        MISSING=1
    else
        ok "${cmd}: $(command -v ${cmd})"
    fi
done

# Docker Compose v2 is `docker compose` (not docker-compose). Verify.
if ! docker compose version >/dev/null 2>&1; then
    err "docker compose v2 missing — install Docker Engine 20.10+ with the compose plugin"
    MISSING=1
fi

# 20.10+ check
DOCKER_VER=$(docker version --format '{{.Server.Version}}' 2>/dev/null || echo 0)
ok "docker version: ${DOCKER_VER}"

if [ "${MISSING}" = "1" ]; then
    err "fix prereqs and re-run"
    exit 1
fi

# ---------- 2. clone or update repo ----------------------------------------

log "Step 2/9: source code at ${REPO_DIR}"

if [ ! -d "${REPO_DIR}/.git" ]; then
    run "git clone --branch ${BRANCH} ${REPO_URL} ${REPO_DIR}"
    ok "cloned into ${REPO_DIR}"
else
    run "cd ${REPO_DIR} && git fetch origin ${BRANCH} && git checkout ${BRANCH} && git pull --ff-only"
    ok "updated ${REPO_DIR} to latest ${BRANCH}"
fi

cd "${REPO_DIR}"

# Activate versioned git hooks (pre-commit dup-identifier guard)
run "git config core.hooksPath .githooks"
ok "git hooks activated (.githooks/)"

# ---------- 3. environment file --------------------------------------------

log "Step 3/9: .env configuration"

if [ -f .env ] && [ "${FORCE_ENV}" != "1" ]; then
    warn ".env already exists — keeping it (pass FORCE_ENV=1 to overwrite)"
else
    if [ ! -f .env.example ]; then
        err ".env.example missing — cannot bootstrap config"
        exit 1
    fi
    run "cp .env.example .env"
    ok ".env created from .env.example"

    cat <<EOF

  ${C_WARN}!${C_RST} Edit ${REPO_DIR}/.env and set at minimum:
      - SECRET_KEY               (auth signing key — python3 -c 'import secrets; print(secrets.token_hex(32))')
      - ADMIN_PASSWORD           (initial super_admin login)
      - MONGO_APP_PASSWORD       (db user password)
      - REDIS_PASSWORD           (cache auth)
      - ANTHROPIC_API_KEY        (AI assistant — from console.anthropic.com)
      - WEATHERBIT_API_KEY       (weather data — from weatherbit.io)

  Then re-run this script.
EOF

    if [ "${DRY_RUN}" = "0" ]; then
        read -p "  Open editor on .env now? [y/N] " -n 1 -r REPLY
        echo ""
        if [[ "${REPLY}" =~ ^[Yy]$ ]]; then
            "${EDITOR:-nano}" .env
        else
            warn "exiting — edit .env and re-run"
            exit 3
        fi
    fi
fi

# ---------- 4. data directory & bind mount ---------------------------------

log "Step 4/9: data dirs"

run "mkdir -p data/mongodb data/sensehub_images logs/mongodb logs/nginx logs/api"
ok "data + log directories ready"

# ---------- 5. bring stack up ---------------------------------------------

log "Step 5/9: docker compose up"

COMPOSE_ARGS=( "-f" "docker-compose.yml" )
if [ -n "${DEPLOY_PROFILE}" ]; then
    COMPOSE_ARGS+=( "-f" "docker-compose.${DEPLOY_PROFILE}.yml" "--profile" "${DEPLOY_PROFILE}" )
fi

run "docker compose ${COMPOSE_ARGS[*]} pull"
run "docker compose ${COMPOSE_ARGS[*]} up -d"

ok "containers started — waiting up to 90s for mongodb to become healthy"
DEADLINE=$(( $(date +%s) + 90 ))
while [ $(date +%s) -lt ${DEADLINE} ]; do
    STATUS=$(docker ps --filter "name=a64coreplatform-mongodb-1" --format '{{.Status}}' 2>/dev/null || true)
    [[ "${STATUS}" == *healthy* ]] && break
    sleep 3
done

if [[ "${STATUS}" != *healthy* ]]; then
    err "mongodb did not become healthy in 90s — check 'docker logs a64coreplatform-mongodb-1'"
    exit 2
fi
ok "mongodb healthy"

# ---------- 6. initialise replica set (idempotent) -------------------------

log "Step 6/9: mongodb replica set init"

RS_STATUS=$(docker exec a64coreplatform-mongodb-1 mongosh --quiet --eval "rs.status().ok" 2>/dev/null || echo 0)
if [ "${RS_STATUS}" = "1" ]; then
    ok "replica set rs0 already initialised"
else
    run 'docker exec a64coreplatform-mongodb-1 mongosh --quiet --eval "rs.initiate({_id:\"rs0\", members:[{_id:0, host:\"mongodb:27017\"}]})"'
    sleep 4
    ok "rs0 initiated (single-node replica set for transactional outbox)"
fi

# ---------- 7. optional: restore from backup -------------------------------

if [ -n "${RESTORE_FROM}" ]; then
    log "Step 7/9: restore from ${RESTORE_FROM}"

    if [ -d "${RESTORE_FROM}" ]; then
        ARCHIVE="${RESTORE_FROM}/a64core_db.archive.gz"
    else
        ARCHIVE="${RESTORE_FROM}"
    fi

    if [ ! -f "${ARCHIVE}" ]; then
        err "archive not found: ${ARCHIVE}"
        exit 2
    fi

    log "  restoring ${ARCHIVE} ($(du -h "${ARCHIVE}" | awk '{print $1}'))"
    run "docker exec -i a64coreplatform-mongodb-1 mongorestore --archive --gzip --drop < ${ARCHIVE}"
    ok "database restored"
else
    log "Step 7/9: no RESTORE_FROM set — skipping data restore"
fi

# ---------- 8. install cron (backup + watchdog) ---------------------------

if [ "${SKIP_CRON}" = "1" ]; then
    log "Step 8/9: SKIP_CRON=1 — skipping cron install"
else
    log "Step 8/9: installing daily backup + 5-min watchdog cron"
    mkdir -p "${HOME}/bin"
    for s in backup restore down watchdog; do
        run "cp ${REPO_DIR}/scripts/ops/${s}.sh ${HOME}/bin/a64core-${s}.sh"
        run "chmod +x ${HOME}/bin/a64core-${s}.sh"
    done
    ok "ops scripts installed to ${HOME}/bin/"

    if [ "${DRY_RUN}" = "0" ]; then
        ( crontab -l 2>/dev/null | grep -vE "a64core-(backup|watchdog)\.sh"
          echo "0 3 * * * ${HOME}/bin/a64core-backup.sh > /dev/null 2>&1"
          echo "*/5 * * * * ${HOME}/bin/a64core-watchdog.sh"
        ) | crontab -
        ok "cron installed (daily backup 03:00 UTC + watchdog every 5 min)"
    else
        echo "  [dry] crontab entries: daily backup 03:00 + watchdog */5 min"
    fi
fi

# ---------- 9. smoke test ---------------------------------------------------

log "Step 9/9: smoke test"

sleep 8
HEALTH=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "${PUBLIC_HEALTH_URL}" 2>/dev/null || echo 000)
if [ "${HEALTH}" = "200" ]; then
    ok "API health check: HTTP ${HEALTH} via ${PUBLIC_HEALTH_URL}"
else
    warn "API health check returned HTTP ${HEALTH} — check 'docker compose logs api'"
fi

cat <<EOF

────────────────────────────────────────────────────────────
${C_OK}Deployment complete.${C_RST}

  Repo:       ${REPO_DIR}
  Branch:     ${BRANCH}
  Compose:    ${COMPOSE_ARGS[*]}
  API health: ${PUBLIC_HEALTH_URL} → HTTP ${HEALTH}

  Useful commands:
    docker compose ps                              # check running services
    docker compose logs -f api                     # tail backend
    ${HOME}/bin/a64core-backup.sh                  # manual backup
    ${HOME}/bin/a64core-restore.sh                 # restore latest
    ${HOME}/bin/a64core-down.sh                    # safe shutdown (auto-backup)

  Next steps:
    1. Log in via the user portal — admin email from your .env
    2. Configure Cloudflare Tunnel / reverse proxy if exposing to the internet
    3. (Optional) deploy finance overlay:  DEPLOY_PROFILE=finance bash scripts/deploy/deploy.sh
────────────────────────────────────────────────────────────
EOF
