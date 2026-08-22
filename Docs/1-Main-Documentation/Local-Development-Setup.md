# Local Development Setup

Getting a fresh machine from clone to a working stack.

**Verified against `main` on 2026-08-20.** `README.md`'s Quick Start is stale —
see [What the README gets wrong](#what-the-readme-gets-wrong) at the end. Follow
this document instead.

> This covers a **development machine**. For server deployment see
> `DEPLOYMENT.md`; for which container prefix / public URL a given box uses, see
> `Deployment-Identity.md` and run `scripts/preflight.sh`.

---

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Docker Engine | 20.10+ | With Compose and git, the only hard requirements |
| Docker Compose | v2 | The `docker compose` plugin, not `docker-compose` |
| Python | 3.11 | Host-side only — running migrations or pytest outside the container |
| Node | 20 | Host-side only — running Vite outside Docker |

First build takes 5–15 minutes (four images build from source, plus a full
frontend workspace install). 8 GB RAM is comfortable, 4 GB is tight.

Note: a host-side `pip install -r requirements.txt` fails on `mysqlclient`
unless you have `default-libmysqlclient-dev`, `pkg-config` and a compiler. The
main API never uses MySQL — see [MySQL](#mysql-is-not-part-of-the-main-api).

---

## What git does not give you

Both are gitignored deliberately.

| File | How to get it |
|---|---|
| `.env` | Copy `.env.example` (82 variables; almost all defaults work locally) |
| `.credentials/vertex-ai-service-account.json` | Copy from another machine, or mint a new one in Google Cloud |

**No API key is required.** Vertex AI, Anthropic and WeatherBit clients are all
built lazily. Without them the stack boots and works normally; only AI Hub,
Farm AI, AI Analytics and the weather widgets fail, at request time.

---

## The sequence

### 1. Clone and enable the hooks

```bash
git clone https://github.com/lilistrocel/A64CorePlatform.git
cd A64CorePlatform
git config core.hooksPath .githooks
```

### 2. Create this machine's CLAUDE.md

`CLAUDE.md` is machine-local and untracked — each box keeps its own, because
hostname, container prefix, public URL and whether the box holds real data all
differ per machine.

```bash
cp CLAUDE.template.md CLAUDE.md
# then fill in the "THIS MACHINE" section
```

### 3. Write your `.env`

```bash
cp .env.example .env
```

Set these:

- **`ADMIN_EMAIL` / `ADMIN_PASSWORD`** — the only way into a fresh install. If
  either is empty, `seed_admin` skips entirely and there is no login at all.
  Compose defaults them to the publicly documented
  `admin@a64platform.com` / `SuperAdmin123!`, so leaving them unset "works" but
  gives you a known password.
- **`COMPOSE_PROJECT_NAME=a64coreplatform`** — not present in `.env.example`,
  add it. Compose otherwise derives the project name from the directory, so a
  clone into `~/dev/a64` produces `a64-api-1` and every copy-pasteable command
  in the docs silently stops matching. `scripts/deploy/deploy.sh` hardcodes
  `a64coreplatform-mongodb-1` in four places and would fail outright.

> **Do not generate a `SECRET_KEY`, despite what `DEPLOYMENT.md` says.**
> `docker-compose.yml` never passes `SECRET_KEY` to the api service — verify
> with `docker exec <prefix>-api-1 sh -c 'echo $SECRET_KEY'` and you get an
> empty value — so the API uses its built-in default in development. But
> `docker-compose.finance.yml` *does* read it. Setting one gives finance a
> different key from the API, and finance then rejects every JWT. It matters
> only in production, where `docker-compose.prod.yml` passes it and a startup
> validator requires it.

Leave `PUBLIC_BASE_URL` empty unless you need to print genetics labels. It is
the host stamped into label QR codes; on a laptop it must be a LAN IP a phone
camera can reach, never `localhost`. See `Deployment-Identity.md` — getting it
wrong means reprinting physical labels, not editing config.

Leave all `CF_ACCESS_*` at their defaults. Setting `CF_ACCESS_ENABLED=true`
without a team domain and AUD makes the API refuse to boot.

### 4. Create the bind-mounted directories

Docker creates these root-owned if you don't, which causes permission friction
later.

```bash
mkdir -p data/mongodb data/sensehub_images data/attachments \
         logs/mongodb logs/nginx logs/api logs/cron \
         config nginx/conf.d nginx/ssl .credentials
```

### 5. Start the stack

```bash
docker compose up -d
docker compose ps mongodb    # wait for healthy
```

### 6. Initiate the replica set — REQUIRED

**This is the step `README.md` omits, and skipping it is why an install that
looks successful can be completely dead.** MongoDB runs with `--replSet rs0`
(`docker-compose.yml`) and the API connects with `?replicaSet=rs0`. Until this
runs, `MongoDBManager.connect()` times out, `startup_event` swallows the error,
and the API serves HTTP while every database call fails and no admin is seeded.

```bash
docker exec <prefix>-mongodb-1 mongosh --quiet --eval \
  'rs.initiate({_id:"rs0", members:[{_id:0, host:"mongodb:27017"}]})'
```

### 7. Restart the API so it seeds

```bash
docker compose restart api
```

The API container has **no `--reload`** (`Dockerfile` runs plain uvicorn), so
this is also how you pick up any Python change — and it must happen
*immediately before you verify*, or a stale process serves old code while the
files on disk look correct.

---

## Confirming it works

> **Do not trust the container health status.** `src/api/health.py` returns
> HTTP 200 with `"status": "degraded"` when the database is down, and the
> container healthcheck only asserts the status code — so the container reports
> **healthy on a completely dead database**. Read the body.

```bash
curl -s http://localhost/api/health
# want: {"status":"healthy","database":"connected","redis":"connected"}
```

Then:

- `docker compose logs api | grep seed_admin` — expect the default organization,
  division and super_admin to have been created
- Log in at `http://localhost/` with your `ADMIN_EMAIL` / `ADMIN_PASSWORD`
- Swagger at `http://localhost/api/docs`, Adminer at `http://localhost:8080`
- `GET /api/v1/finance/*` returning **503** is correct in ops-only mode

### Re-running the bootstrap

`seed_admin` is deliberately one-shot: it gates on whether *any* organization
exists. Once one does, a missing super_admin is **not** auto-created or
auto-promoted — it logs a warning and returns, because `ADMIN_EMAIL` is a
documented public value and registration is open, which made auto-promotion a
privilege-escalation path.

So deleting just the user document will not re-trigger it. You must clear
`organizations` too.

---

## Things that will bite

### The plant library starts empty, and that blocks planting

Creating a virtual block raises `404 Plant data not found` until the library has
entries (`virtual_block_service.py`). The repo ships
`data/starter-data/plants/uae-popular-plants-enhanced.json` (20 plants), but its
importer is broken two ways: it `docker exec`s a container name
(`a64core-mongodb-dev`) that exists under no current compose file, and it writes
NDJSON to a **host** path then passes it to `mongoimport --file`, which resolves
it **inside** the container.

Use the CSV round-trip in the UI instead — `GET .../template/csv` then
`POST .../import/csv` — or fix the importer with `docker cp`.

### Ports that commonly collide

| Port | Service | Risk |
|---|---|---|
| 8080 | Adminer | Very high |
| 5173 | Vite | High — any other Vite project |
| 27017 | MongoDB | High — a local Mongo install |
| 6379 | Redis | High |
| 80 / 443 | nginx | Medium |
| 8000 | api | Medium |

All are `${VAR:-default}`, so override in `.env`. Or skip the extras:
`docker compose up -d api mongodb redis nginx user-portal`.

### `.env` changes need `--force-recreate`

`docker restart` does not re-read `.env`.

### Redis healthcheck hardcodes the password

Changing `REDIS_PASSWORD` makes the container report unhealthy forever while
working normally — the healthcheck passes `-a redispassword` literally.

### MySQL is not part of the main API

`.env.example` still carries `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`,
`MYSQL_PASSWORD`, `MYSQL_DB_NAME`. Nothing in `src/` reads them. MySQL exists
only behind the optional finance overlay, configured by `FINANCE_MYSQL_*`.

---

## Working on the code

| Task | What to run |
|---|---|
| Typecheck frontend | From `frontend/user-portal/`: `npx tsc -b`. **Not** `--noEmit` — the tsconfig is a project-references stub, so it checks nothing and reports success. Expect ~234 pre-existing errors; that is the baseline, not a regression. |
| Format Python | `black==26.5.1`. `requirements.txt` pins 25.1.0 but CI installs 26.5.1 and it is the one **blocking** lint gate — the wrong version produces diffs CI rejects. |
| Run backend tests | `/app/tests` is not bind-mounted: `docker exec <prefix>-api-1 sh -c 'rm -rf /app/tests'` then `docker cp tests <prefix>-api-1:/app/tests`. A restart wipes it. |
| Query the database | `mongosh` exists only inside the container: `docker exec <prefix>-mongodb-1 mongosh --quiet mongodb://localhost:27017/a64core_db --eval '...'` |

---

## Optional: the finance stack

Ops-only is the default and covers the full PR→PO→GR→AP flow. Finance adds host
ports 8001 and 3307, and uses **fixed** container names (`a64-mysql`,
`a64-finance`, `a64-finance-consumer`) that do not take the compose prefix — two
clones on one machine will collide.

```bash
docker compose -f docker-compose.yml -f docker-compose.finance.yml \
  --profile finance up -d
docker compose -f docker-compose.yml -f docker-compose.finance.yml \
  --profile finance exec finance alembic upgrade head
docker compose exec api python scripts/migrations/wave0_add_finance_flag.py
```

Run the migration via `docker compose exec api` so it picks up the container's
`MONGODB_URL`; on the host it would hit `mongodb://localhost:27017` without the
replicaSet parameter.

See `Deployment-Modes.md` for what the flag gates.

---

## Migrations on a fresh install

**Ops-only: none.** Everything under `scripts/migrations/` is a historical
backfill for data a fresh install does not have. Indexes are created
automatically on every connect.

**Full stack: two, in order** — `alembic upgrade head` inside the finance
container, then `wave0_add_finance_flag.py`.

Do **not** run `scripts/setup_organization.py` or `scripts/setup_org.js`. They
create a second organization and stamp its id onto hardcoded emails that do not
exist on a fresh database. They are superseded by `seed_admin`, and running one
breaks its first-boot gate.

---

## Before you clone: tracked PII

`OldData/` is listed in `.gitignore`, but 50 files under it were committed
before that rule existed — gitignore does not apply retroactively. That includes
`OldData/HR File - Emirates ID Staff.csv` and `.xlsx`: real staff Emirates ID
numbers, in the git history, present in every clone.

Cloning to a new machine copies them there too. Removing it properly means
rewriting history (`git filter-repo`) and force-pushing, which affects everyone
holding a clone.

---

## What the README gets wrong

Listed so nobody follows it by accident. Verified against the files on
2026-08-20.

| README claim | Reality |
|---|---|
| Quick Start: clone → `cp .env` → `docker-compose up -d` → done | Omits `rs.initiate`. Produces an install whose API can never reach MongoDB. `rs.initiate` appears zero times in the file. |
| "Development with Docker (**Hot Reload**)… changes to Python files will automatically reload" | False. `Dockerfile` runs plain uvicorn with no `--reload`. Actively harmful — it is what makes people verify a fix against a stale process. |
| "Dual-database architecture (MongoDB and **MySQL**)", MySQL 8.0 listed as a prerequisite | The main API has zero MySQL code. There is no `mysql` service in `docker-compose.yml`. |
| Adminer section: "MySQL Connection — Server: `mysql`" | No such service exists. |
| `docker exec -it a64core-mongodb-dev` / `a64core-mysql-dev` | Neither container has existed under any current compose file. |
| "FastAPI 0.109.0" | `requirements.txt` pins `fastapi==0.128.0`. |
| v1 endpoints "to be implemented" | ~120 collections and a dozen live plugin modules. |

Accurate and worth reading: `Deployment-Modes.md`, `Deployment-Identity.md`,
`scripts/preflight.sh`, and `.env.example`'s own inline comments.
