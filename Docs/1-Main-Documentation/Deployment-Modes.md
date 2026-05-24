# Deployment Modes — A64 Core Platform

**Last updated:** 2026-05-24 (Wave 0 — T-059)
**Status:** Active

A64 supports two first-class deployment shapes. Pick the one that matches
the tenant's licence / hardware. The choice is made at `docker compose`
launch time; the same git artifacts power both modes.

| Mode | Containers | Use case |
|---|---|---|
| **Ops-only** | `mongo` · `redis` · `api` · `nginx` · `user-portal` | Self-hosting customers without finance, free-tier tenants, dev sandboxes |
| **Full stack** | Ops-only **+** `mysql` · `finance` · `finance_consumer` | Paid tenants that get the full PR → PO → GR → AP → mark-as-paid → JE chain |

---

## 1. Ops-only mode

```bash
docker compose -f docker-compose.yml up -d
```

What works:
- Login / users / orgs / divisions / industries / dashboard
- Operations dashboard, farm manager, mushroom module, inventory, sales,
  logistics, marketing, HR, CRM
- Full purchasing chain (PR → PO → GR → AP) — tax codes and cost
  centres degrade to **free-text** inputs (no validation against a
  finance master list)
- All AI features, attachments, tooling

What's hidden:
- Finance sidebar group (Chart of Accounts, Journal Entries, AP Aging,
  Vendor Sub-Ledger, etc.)
- `/finance/*` routes — 404 in the SPA via `<FinanceGate>`
- Cost-centre column on Goods Receipts and AP Invoices
- `/api/v1/finance/*` — nginx returns **503** with
  `{"detail":"Finance module not available","module":"finance"}`

What the backend does:
- `GET /api/v1/system/capabilities` reports `finance.enabled=true,
  finance.reachable=false` (capability gate driven by the per-tenant
  flag — see §3)
- `OutboxWriter.publish()` is a no-op for tenants whose
  `modules.financeEnabled` is false → no events accumulate in the
  `finance_outbox` collection waiting for a consumer that doesn't exist

## 2. Full-stack mode

```bash
docker compose -f docker-compose.yml -f docker-compose.finance.yml --profile finance up -d
docker compose -f docker-compose.yml -f docker-compose.finance.yml --profile finance \
  exec finance alembic upgrade head
```

Adds the finance service (port 8001, MySQL-backed), the outbox consumer
worker, and a `mysql` instance. Nginx routes `/api/v1/finance/*` to the
finance container; the capability endpoint reports
`finance.reachable=true` (with the live version).

The first time a tenant on a full-stack deployment is created, run the
Wave 0 migration to set `modules.financeEnabled=true` on every existing
org:

```bash
docker compose exec api python scripts/migrations/wave0_add_finance_flag.py
```

## 3. Per-tenant flag

`organizations.modules.financeEnabled` is the authoritative on/off
switch for a single tenant. Even in full-stack mode an operator can
disable finance for one tenant (e.g. an ops-only tier customer that
shares the deployment with paid tiers).

Toggle it via:

- **Admin UI:** Settings → Tenant Modules → "Enable Finance module"
  (super_admin only; writes an `admin_audit_log` entry; invalidates
  the Redis cache so the toggle takes effect within milliseconds).
- **API:** `PATCH /api/v1/organizations/{orgId}/modules` with body
  `{"financeEnabled": true|false}` (super_admin JWT).
- **Direct MongoDB:** `db.organizations.updateOne({organizationId:
  "<id>"}, {$set: {"modules.financeEnabled": false}})` — useful for
  scripted rollouts. The Redis cache (60s TTL) will catch up
  automatically.

## 4. Capability discovery

```
GET /api/v1/system/capabilities
Authorization: Bearer <JWT>

200 OK
{
  "tenantId": "<orgId>",
  "modules": {
    "finance": {
      "enabled": true,        // per-tenant flag
      "reachable": true,      // health-ping result (cached 60s)
      "version": "0.1.0"      // finance service version when reachable
    }
  },
  "checkedAt": "2026-05-24T08:00:00Z"
}
```

The same payload is also folded into `GET /api/v1/auth/me` so the
frontend gets it on login without a second round-trip:

```json
{
  "userId": "...",
  "email": "...",
  ...
  "capabilities": { "tenantId": "...", "modules": {...}, "checkedAt": "..." }
}
```

## 5. Free-text fallback contract

When the finance module is off (operator flag) or unreachable (health
ping fails), purchasing forms degrade like this:

| Field | Off | Unreachable | Normal |
|---|---|---|---|
| Tax code (PR/PO/AP) | Free-text `<input>` | Free-text + amber banner | `<select>` from finance master list |
| Cost centre (PR/PO) | Free-text `<input>` | Free-text + amber banner | `<select>` from finance master list |
| Cost centre column (GR/AP) | Hidden | Visible + amber banner | Visible |

Values entered as free-text are persisted as **plain strings**. There
is intentionally no enum constraint (e.g. S/Z/E/N) — when the tenant
later turns finance on, an operator runs a clean-up migration to map
free-text codes to finance-managed ones. Out of scope for Wave 0.

## 6. Common failure modes

| Symptom | Cause | Fix |
|---|---|---|
| Sidebar shows Finance group but every page errors | Finance flag on, container missing | Either deploy finance container or set `modules.financeEnabled=false` |
| `/api/v1/finance/*` returns 502 instead of 503 | nginx didn't pick up Wave 0 config | `docker compose restart nginx` |
| Finance events piling up in `finance_outbox` | Per-tenant flag stale in Redis after manual MongoDB edit | Wait 60s for TTL, or `docker compose exec redis redis-cli DEL "org:<orgId>:financeEnabled"` |
| Toggle in UI doesn't appear | User is not `super_admin` | Only super_admins see the Tenant Modules card |

## 7. CI coverage

- `.github/workflows/ops-only-smoke.yml` boots the ops-only stack and
  verifies the PR/PO/GR/AP chain works without finance, and that
  `/api/v1/finance/*` returns 503.
- `scripts/ci/check_finance_imports.sh` blocks `from services.finance`
  in `src/` — prevents accidental coupling.

## 8. See also

- `Docs/2-Working-Progress/Wave-0-Design.md` — full design rationale
- `Docs/Backlog/BACKLOG.md` — T-059 acceptance criteria
- `scripts/migrations/wave0_add_finance_flag.py` — one-shot migration
