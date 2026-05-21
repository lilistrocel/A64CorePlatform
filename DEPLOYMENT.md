# A64 Core Platform — Deployment Guide

End-to-end guide for deploying the platform on a fresh server, migrating from
an existing host, or re-deploying after an incident. The automated path takes
~10 minutes including data restore.

---

## Contents

1. [Architecture overview](#architecture-overview)
2. [Server requirements](#server-requirements)
3. [Automated deploy (recommended)](#automated-deploy-recommended)
4. [Manual deploy](#manual-deploy)
5. [Environment configuration](#environment-configuration)
6. [Cloudflare Tunnel (public access)](#cloudflare-tunnel-public-access)
7. [Operations: backup, restore, watchdog](#operations-backup-restore-watchdog)
8. [Multi-instance hosting](#multi-instance-hosting)
9. [Updating an existing deployment](#updating-an-existing-deployment)
10. [Troubleshooting](#troubleshooting)
11. [Rollback](#rollback)

---

## Architecture overview

The platform is a Docker Compose stack. Core services:

| Service | Container | Host port | Purpose |
|---|---|---|---|
| **api** | `a64coreplatform-api-1` | 8000 | FastAPI backend, REST `/api/v1/*` |
| **user-portal** | `a64coreplatform-user-portal-1` | 5173 | Vite/React dev server (or built bundle in prod) |
| **mongodb** | `a64coreplatform-mongodb-1` | 27017 | Primary data store (replica set `rs0`) |
| **redis** | `a64coreplatform-redis-1` | 6379 | Cache, rate limiting, sessions |
| **nginx** | `a64coreplatform-nginx-1` | 80 / 443 | Reverse proxy fronting api + user-portal |
| **adminer** | `a64coreplatform-adminer-1` | 8080 | DB admin UI (optional in prod) |
| **cron** | `a64coreplatform-cron-1` | — | Scheduled jobs (outbox reconciler, etc.) |
| **registry** | `a64coreplatform-registry-1` | 5050 | Local Docker registry for module images |
| **iot-simulator** | `a64coreplatform-iot-simulator-1` | 8090 | Mock SenseHub MCP for dev (optional in prod) |

Optional overlays (compose profiles):

| Overlay | File | Profile flag | Adds |
|---|---|---|---|
| **finance** | `docker-compose.finance.yml` | `--profile finance` | `a64-mysql`, `a64-finance` (FastAPI), `a64-finance-consumer` (outbox bridge) |

Persistent state lives in:

- **MongoDB**: bind-mounted at `./data/mongodb` (host visible, survives compose project rename)
- **MongoDB config**: named volume `mongodb_config`
- **Redis**: named volume `redis_data` (ephemeral cache; safe to lose)
- **Registry**: named volume `registry_data`
- **Camera snapshots**: bind-mounted at `./data/sensehub_images`

---

## Server requirements

| Resource | Minimum | Recommended |
|---|---|---|
| CPU | 2 cores | 4 cores |
| RAM | 4 GB | 8 GB |
| Disk | 20 GB | 50 GB (data grows ~50 MB/day) |
| OS | Ubuntu 22.04+ / Debian 12+ / any Linux with Docker | Ubuntu 24.04 LTS |
| Docker | 20.10+ with Compose plugin v2 | latest stable |
| Network | outbound HTTPS to docker.io, github.com, anthropic.com, weatherbit.io | + Tailscale if integrating with on-prem SenseHub |

API keys to obtain before deploy:

- **Anthropic API key** — https://console.anthropic.com/settings/keys (for the AI assistant)
- **WeatherBit API key** — https://weatherbit.io (for agricultural weather context)
- **ElevenLabs API key** — only if voice features are enabled (currently disabled)

---

## Automated deploy (recommended)

One-shot deploy on a fresh host:

```bash
# 1. install Docker (Ubuntu example)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker

# 2. clone + run
git clone https://github.com/lilistrocel/A64CorePlatform.git ~/Code/A64CorePlatform
cd ~/Code/A64CorePlatform
bash scripts/deploy/deploy.sh
```

The script will:

1. Verify Docker + git + curl + python3 are present
2. Clone / update the repo
3. Copy `.env.example` to `.env` and open your editor (set keys + passwords)
4. Create data + log directories
5. `docker compose pull && up -d`
6. Wait up to 90s for MongoDB to become healthy
7. Initialise the single-node replica set `rs0` (required for the finance outbox)
8. Optionally restore data from a backup archive
9. Install `~/bin/a64core-*` ops scripts + cron (daily backup + 5-min watchdog)
10. Smoke-test `http://localhost/api/health`

### Environment variables you can pass

```bash
REPO_DIR=/srv/a64core           # install elsewhere
BRANCH=staging                  # deploy a different branch
DEPLOY_PROFILE=finance          # include the finance overlay
RESTORE_FROM=/path/to/backup    # restore on first boot
SKIP_CRON=1                     # don't install cron (manage externally)
FORCE_ENV=1                     # overwrite existing .env from template
DRY_RUN=1                       # print actions, change nothing
```

### Migrating from another host

On the **source** host, take a backup:

```bash
~/bin/a64core-backup.sh   # writes to ~/Documents/Backups/YYYY-MM-DD/
```

Transfer the backup directory to the new host (`scp -r`, `rsync`, USB, etc.):

```bash
scp -r ~/Documents/Backups/2026-05-21 newhost:~/restore-bundle
```

On the **target**, run the deploy with `RESTORE_FROM` pointed at the bundle:

```bash
RESTORE_FROM=~/restore-bundle bash scripts/deploy/deploy.sh
```

The script will restore `a64core_db` from the archive (`--drop` semantics) after MongoDB comes up.

---

## Manual deploy

For when you need granular control or the automated script doesn't fit. Each step matches one stage of `scripts/deploy/deploy.sh`.

```bash
# 1. clone + checkout
git clone https://github.com/lilistrocel/A64CorePlatform.git
cd A64CorePlatform
git config core.hooksPath .githooks   # activate the pre-commit hook

# 2. environment
cp .env.example .env
$EDITOR .env   # fill in secrets (see "Environment configuration" below)

# 3. data dirs
mkdir -p data/mongodb data/sensehub_images logs/{mongodb,nginx,api}

# 4. bring stack up
docker compose pull
docker compose up -d
# optional: with finance overlay
# docker compose -f docker-compose.yml -f docker-compose.finance.yml --profile finance up -d

# 5. wait for mongodb healthy
docker compose ps mongodb

# 6. initialise replica set (idempotent — error if already initiated is fine)
docker exec a64coreplatform-mongodb-1 mongosh --quiet --eval \
  'rs.initiate({_id:"rs0", members:[{_id:0, host:"mongodb:27017"}]})'

# 7. (optional) restore data
docker exec -i a64coreplatform-mongodb-1 mongorestore --archive --gzip --drop \
  < /path/to/a64core_db.archive.gz

# 8. install ops scripts + cron
mkdir -p ~/bin
for s in backup restore down watchdog; do
    cp scripts/ops/${s}.sh ~/bin/a64core-${s}.sh
    chmod +x ~/bin/a64core-${s}.sh
done
( crontab -l 2>/dev/null
  echo "0 3 * * * $HOME/bin/a64core-backup.sh > /dev/null 2>&1"
  echo "*/5 * * * * $HOME/bin/a64core-watchdog.sh"
) | crontab -

# 9. smoke test
curl -i http://localhost/api/health
```

---

## Environment configuration

`.env` is read at container startup. **Edit it before bringing the stack up, or recreate containers after changes** (`docker compose up -d --force-recreate api`). `docker restart` does NOT re-read `.env`.

Required keys:

| Variable | Purpose | How to generate |
|---|---|---|
| `SECRET_KEY` | JWT / session signing | `python3 -c "import secrets; print(secrets.token_hex(32))"` |
| `ADMIN_EMAIL` | Initial super_admin login (created on first start) | your email |
| `ADMIN_PASSWORD` | Initial super_admin password | strong, store in password manager |
| `MONGO_APP_USER` / `MONGO_APP_PASSWORD` | MongoDB app user | set both to non-default in prod |
| `REDIS_PASSWORD` | Redis auth | random 32+ chars |
| `MONGODB_DB_NAME` | Database name | `a64core_db` (default) — only change for multi-tenancy |
| `ANTHROPIC_API_KEY` | AI assistant | https://console.anthropic.com/settings/keys |
| `WEATHERBIT_API_KEY` | Weather data for AI context | https://weatherbit.io |

Optional / module-specific:

| Variable | Purpose |
|---|---|
| `CLAUDE_MODEL` | Override the default model (`claude-sonnet-4-6`) |
| `AI_ASSISTANT_HISTORY_LIMIT` | How many conversations to retain per user (default 3) |
| `FINANCE_OUTBOX_ENABLED` | Set `true` after deploying the finance overlay |
| `FINANCE_INGESTION_SECRET` | Shared secret between main API and finance service |
| `UVICORN_WORKERS` | Worker count (default 4) |

> Never commit `.env` — it's gitignored. Back it up out-of-band (the daily backup includes a copy under `env/.env`).

---

## Cloudflare Tunnel (public access)

If exposing the platform publicly, prefer a Cloudflare Tunnel over opening ports.

```bash
# 1. install cloudflared (Ubuntu/Debian)
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb \
    -o cloudflared.deb
sudo dpkg -i cloudflared.deb

# 2. login (opens browser, picks a zone)
cloudflared tunnel login

# 3. create the tunnel
cloudflared tunnel create a64core

# 4. configure ~/.cloudflared/config.yml
cat > ~/.cloudflared/config.yml <<EOF
tunnel: a64core
credentials-file: $HOME/.cloudflared/$(cloudflared tunnel list -o json | jq -r '.[0].id').json
protocol: quic

ingress:
  - hostname: yourdomain.com
    service: http://localhost:80
    originRequest:
      connectTimeout: 10s
      keepAliveTimeout: 90s
  - hostname: www.yourdomain.com
    service: http://localhost:80
  - service: http_status:404
EOF

# 5. point your DNS at the tunnel
cloudflared tunnel route dns a64core yourdomain.com
cloudflared tunnel route dns a64core www.yourdomain.com

# 6. install as a systemd service
sudo cloudflared service install
sudo systemctl enable --now cloudflared
sudo systemctl status cloudflared
```

The tunnel's origin (`http://localhost:80`) is the nginx container, which fronts both the API (`/api/*`) and the user portal (everything else).

---

## Operations: backup, restore, watchdog

These ship with the deploy and live in `~/bin/` after installation.

### Daily backup

`~/bin/a64core-backup.sh` runs nightly at 03:00 UTC via cron. Output:

```
~/Documents/Backups/YYYY-MM-DD/
  a64core_db.archive.gz       # mongodump --archive --gzip
  esgagro-all-dbs.archive.gz  # if the esgagro stack is also running
  env/.env                    # secrets (back this up out-of-band too)
  git-state.txt               # branch / HEAD / recent commits
  MANIFEST.sha256             # integrity checksums
```

14-day retention by default. Override: `RETENTION_DAYS=30 a64core-backup.sh`.

### Restore

```bash
~/bin/a64core-restore.sh                           # auto-picks the latest backup
~/bin/a64core-restore.sh ~/Documents/Backups/2026-05-19   # specific dir
~/bin/a64core-restore.sh path/to/a64core_db.archive.gz    # specific archive
~/bin/a64core-restore.sh --yes                     # skip confirmation prompt
```

Verifies the SHA-256 checksum against the manifest, drops + restores, then recreates the api container so it picks up fresh DB handles.

### Watchdog

`~/bin/a64core-watchdog.sh` runs every 5 minutes via cron. Checks:

1. `a64coreplatform-nginx-1` is `Up healthy` — if not, `docker compose up -d`
2. `a64-finance` / `a64-mysql` are bridged to the a64core network (handles the cross-project setup automatically)
3. User-portal logs for Vite Internal Server Errors — flags them in `~/Documents/Backups/.watchdog.log`

Max downtime under any external shutdown: ~5 minutes.

### Safe shutdown

```bash
~/bin/a64core-down.sh             # takes an ad-hoc backup, then docker compose down
~/bin/a64core-down.sh --no-backup # skip the backup (not recommended)
```

Refuses `-v` (volume removal) without `--i-know` — guards against accidental data loss.

---

## Multi-instance hosting

This server can host multiple isolated A64Core instances (e.g., `a64core.com` + `esgagro.a20core.com`) sharing the same machine. See `instances/instance-manager.sh` for the per-instance bootstrap. Key principles:

- Each instance has its own `.env` and host port range (the manager increments base ports per instance).
- Both fronted by a single `cloudflared` config with hostname → origin port mapping.
- Cross-project containers (e.g., shared MySQL) need their docker network bridged — the watchdog handles this automatically.

---

## Updating an existing deployment

Routine update:

```bash
cd ~/Code/A64CorePlatform

# 1. take a snapshot first
~/bin/a64core-backup.sh

# 2. pull latest
git pull --ff-only

# 3. rebuild + roll
docker compose build api
docker compose up -d --force-recreate api

# 4. tail logs while it warms up
docker compose logs -f --since 1m api

# 5. smoke test
curl http://localhost/api/health
```

For changes that affect the frontend bundle, also recreate `user-portal`.

For changes that touch `.env` (new variables, value rotations), always `--force-recreate` the api — `docker restart` does NOT re-read `.env`.

---

## Troubleshooting

### Site returns 502 (Cloudflare Bad Gateway)

The origin behind the tunnel is down. Check:

```bash
docker ps --filter "name=a64coreplatform-nginx-1"
curl -i http://localhost
```

If nginx is missing or crashlooping, `docker compose up -d` to recover. The watchdog catches this within 5 min automatically.

### Page loads but is blank

Vite is failing to transform a TS/TSX file. Symptom in `~/Documents/Backups/.watchdog.log`:

```
VITE ERROR DETECTED — front-end is broken
  [vite] Internal server error: ... Identifier 'X' has already been declared
```

Fix the source file, then:

```bash
docker restart a64coreplatform-user-portal-1
```

The pre-commit hook in `.githooks/pre-commit` blocks the most common cause (duplicate top-level identifiers) — activate it with `git config core.hooksPath .githooks` on every clone.

### `host not found in upstream "finance:8001"`

The `a64-finance` container is on a different docker network than nginx. Run:

```bash
docker network connect --alias finance a64coreplatform_a64core-network a64-finance
docker network connect --alias mysql   a64coreplatform_a64core-network a64-mysql
```

Or just wait — the watchdog re-bridges automatically on each recovery cycle.

### MongoDB won't initiate replica set

Most common cause: replica set already initiated but you're running the command twice. Confirm:

```bash
docker exec a64coreplatform-mongodb-1 mongosh --quiet --eval 'rs.status().ok'
```

If `1`, you're done. If you genuinely need to re-init (data wipe), stop the stack, `rm -rf data/mongodb/*`, restart, then re-init.

### "AI assistant is not configured"

The `ANTHROPIC_API_KEY` is missing, invalid, or the api container has stale env. Check:

```bash
docker exec a64coreplatform-api-1 printenv ANTHROPIC_API_KEY | head -c 15
docker exec a64coreplatform-api-1 python3 -c \
  "import asyncio, os; from anthropic import AsyncAnthropic; \
   asyncio.run(AsyncAnthropic(api_key=os.environ['ANTHROPIC_API_KEY']).messages.create(model='claude-sonnet-4-6', max_tokens=5, messages=[{'role':'user','content':'hi'}]))"
```

If the key is unset or invalid, fix `.env` and **`docker compose up -d --force-recreate api`** (not `docker restart`).

---

## Rollback

If a deploy goes sideways:

```bash
# 1. take a fresh snapshot of the broken state (for forensics)
~/bin/a64core-backup.sh adhoc

# 2. roll the code back to a known-good commit
cd ~/Code/A64CorePlatform
git log --oneline -10
git checkout <good-sha>

# 3. restore data from before the bad deploy
~/bin/a64core-restore.sh ~/Documents/Backups/<earlier-date>

# 4. recreate
docker compose up -d --force-recreate
```

`docker compose down` (no `-v`) is safe — the MongoDB bind mount at `./data/mongodb` is on the host filesystem, not in a Docker volume that could be reaped.

---

## Footnotes

- Daily backups are sized ~35 MB compressed (snapshot of ~400 MB live DB). 14 days × 35 MB = ~0.5 GB.
- The pre-commit hook + watchdog were added in response to the 2026-05-20 incidents where (a) the cloudflared tunnel went down because cross-stack network bridging was lost, and (b) Vite crashed silently from a duplicate `PurchaseOrdersPage` identifier in `App.tsx`. See `.githooks/README.md` and `~/Documents/Backups/.watchdog.log` for details.
- The `data/mongodb/` bind mount was migrated from the named volume `a64coreplatform_mongodb_data` on 2026-05-19 to insulate the database from compose-project-name changes. The old named volume is kept as a one-shot rollback option until manually pruned.
