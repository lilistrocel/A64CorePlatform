# Wave 0 — Architectural Hygiene: Finance as Opt-In Add-On

**Status:** Design — awaiting approval before implementation
**Owner:** TBD
**Estimated effort:** 4–7 days (backend + frontend in parallel)
**Backlog task:** T-059
**Authored:** 2026-05-24
**Roadmap context:** Wave 0 of the 9-wave finance build-out. Establishes the
ops-vs-finance boundary every subsequent wave depends on.

---

## 1. Goal

Make "operations app runs without the finance module" a first-class supported
deployment mode — not an accident. Concretely:

- An A64 deployment that contains only the operations stack (`backend`, `mongo`,
  `redis`, `nginx`, `user-portal`) must serve the full PR → PO → GR → AP →
  mark-as-paid flow without errors, broken pages, or empty dropdowns that crash.
- A multi-tenant deployment with both modules installed must allow per-tenant
  enable/disable of the finance UI, controlled by an organisation-level flag.

## 2. Non-goals

- No new finance features. Wave 0 is purely about the boundary.
- No code removal from finance service. Finance keeps everything it has.
- No changes to outbox event contracts.
- Not building tenant pricing-tier logic; the capability flag exists, but how
  it's set on signup is a Wave 9 concern.

## 3. Architectural Decision

**Runtime capability check, per-tenant, with structurally separable
docker-compose.** Confirmed 2026-05-24.

The decision was made between two alternatives:
- **Deploy-time toggle** — two build artifacts, finance tree-shaken at compile
  time. Rejected: forces rebuilds for tier upgrades, hurts dev experience, and
  A64 already has finance as a separate container so deploy-time gating buys
  little.
- **Runtime capability check** — single artifact, decision made at boot via a
  `/capabilities` endpoint. Chosen for flexibility, per-tenant licensing
  support, single artifact, single CI pipeline.

One concession to the deploy-time camp: docker-compose stays *structurally
separable* so self-hosting customers can skip the finance container at the
infra level if they want.

## 4. The Capability Endpoint

### Shape

```
GET /api/v1/system/capabilities
Authorization: Bearer <JWT>

200 OK
{
  "tenantId": "<orgId>",
  "modules": {
    "finance": {
      "enabled": true,              // operator decision (per-tenant flag)
      "reachable": true,            // health-ping result (cached 60s)
      "version": "1.7.0"            // when reachable; null otherwise
    }
  },
  "checkedAt": "2026-05-24T08:00:00Z"
}
```

### Semantics

- `enabled=false` → frontend **never** shows finance UI even if the service is
  reachable. Lets operators run staged migrations and prevents accidental
  exposure during onboarding.
- `enabled=true && reachable=false` → frontend shows finance entries but
  decorates them with an amber "Finance service is starting up / unreachable"
  banner. Routes still navigate (the user sees a "Loading…" state) instead of
  blanking out.
- `enabled=true && reachable=true` → normal operation.

### Where it lives

- **Endpoint:** new `src/api/v1/system.py` module on the operations backend.
- **Auth:** requires a valid JWT (so we know which tenant). No additional role
  gate — every authenticated user is allowed to know what modules they have.
- **Tenant resolution:** `orgId` from JWT → `organizations` collection lookup
  → `financeEnabled` field.
- **Reachability check:** ops backend pings `GET <finance>/api/v1/system/health`
  with 1s timeout, caches result in Redis for 60s under key
  `system:finance:reachable`. Cached result is per-deployment, not per-tenant
  (finance up/down is global).

### Bootstrap optimisation

Optionally fold capabilities into the existing `/api/v1/auth/me` response so
the frontend gets them on login without a second round trip. The standalone
endpoint stays for explicit refresh.

## 5. Per-tenant Flag Storage

### Schema change

Add to `organizations` collection (MongoDB):

```js
{
  // ...existing fields
  "modules": {
    "financeEnabled": true   // boolean, default true for existing tenants
  }
}
```

### Migration

One-shot script `scripts/migrations/wave0_add_finance_flag.py`:
- For every existing org missing `modules.financeEnabled`, set it to `true`.
- Idempotent (skip orgs that already have the field).
- Run at deploy time before the backend rolls.

### Default for new tenants

New orgs default to `financeEnabled: true`. A future Wave 9 task may key this
off pricing tier; for now operators flip manually post-signup if a tenant
should be ops-only.

## 6. Admin UX

A super_admin (or organisation owner) can toggle the flag from
**Tenant Settings → Modules** in the user portal:

- Checkbox: "Enable Finance module"
- Note explaining what becomes available when on, what disappears when off
- Confirmation modal on disable: "X finance-only routes will be hidden for
  all users in this tenant. Posted journal entries are preserved but not
  visible. Proceed?"
- Audit-logged write (existing `audit_log` collection).

## 7. Frontend Integration

### `useCapabilities()` hook

```ts
// hooks/useCapabilities.ts
export function useCapabilities() {
  return useQuery({
    queryKey: ['system', 'capabilities'],
    queryFn: getCapabilities,
    staleTime: 60_000,           // capabilities rarely change
    refetchOnWindowFocus: false,
  });
}
```

### Route gating

```ts
// In App.tsx route definitions
const { data: caps } = useCapabilities();
const financeOn = caps?.modules.finance.enabled ?? false;

{financeOn && <Route path="/finance/*" element={<FinanceRoutes />} />}
```

### Sidebar gating

Finance section entries (Journal Entries, AP Aging, Posting Setup, Cost
Centres, Tax Codes, etc.) only render when `financeOn` is true.

### Graceful degradation in ops UI

Today's purchasing forms call finance endpoints directly for tax codes,
cost centres, item finance mappings, etc. Wave 0 fixes:

1. **When `financeEnabled=false`:** these fields become free-text inputs (or
   are hidden entirely). Lines persist `taxCode` and `costCenterId` as
   typed strings; no validation against a finance master list.
2. **When `financeEnabled=true && reachable=false`:** dropdowns show
   "Finance service unreachable — try refreshing" and accept manual entry as
   a fallback.

### Audit checklist (which UI components need touching)

| Component | Finance dependency | Wave 0 fix |
|---|---|---|
| `PurchaseRequestFormPage` | Tax codes, cost centres, item mappings | Conditional dropdowns; free-text fallback |
| `PurchaseOrderFormPage` | Same | Same |
| `GoodsReceiptFormPage` | Cost centre display | Hide column when off |
| `APInvoiceFormPage` | Tax codes, cost centre display | Conditional |
| Sidebar navigation | All `/finance/*` entries | Gate behind `financeOn` |
| Dashboard cards (finance KPIs) | Trial balance, AP aging | Hide / replace with ops KPIs |

## 8. Backend Integration

### Outbox writer must respect the per-tenant flag

Today `OutboxWriter.publish()` unconditionally writes every event to
`finance_outbox`. For tenants with `modules.financeEnabled=false`, those
events will queue forever — the finance consumer is either not deployed (in
the ops-only deploy mode) or is deployed but never processes them.

**Fix:** at the top of `OutboxWriter.publish()`, look up the org's
`modules.financeEnabled` flag (cache in Redis with a short TTL, e.g., 60s,
to avoid a Mongo read per event). When `false`, return a sentinel event ID
without writing. Document the behaviour in the function docstring and the
contracts module.

Edge case: a tenant that flips from `false → true` mid-stream. Pre-flip
events are not replayable from the outbox. This is acceptable — until
finance is enabled, no postings exist anyway, so there's nothing to
"replay against". The first event after enable becomes the start of the
tenant's finance history.

This change lives alongside T-059.1 (backend).

### Audit: ops backend should not import finance code

Add a CI lint that fails the build if any file under `src/` (other than
`src/api/v1/system.py`) imports from `services/finance/`. Today's codebase
already respects this — Wave 0 enforces it.

### Ops endpoints that proxy finance data

A few ops endpoints currently fan out to finance (cost-centre dropdown is
proxied through nginx today, served directly by finance). When finance is off:

- Routes that *only* exist on finance (e.g., `/api/v1/finance/cost-centers`)
  return 404 at nginx (because the finance container isn't running) or 503
  (if finance is enabled-but-unreachable). Frontend handles both.
- No "compatibility proxy" in ops backend — finance routes stay finance-only.

### Health check on finance

The capability endpoint hits `<finance_url>/api/v1/system/health`. Wave 0
adds this lightweight endpoint to finance if it doesn't already exist:

```python
@router.get("/system/health", tags=["System"])
async def health() -> dict:
    return {"status": "ok", "service": "finance", "version": settings.VERSION}
```

## 9. Deployment Structure

### docker-compose split

- `docker-compose.yml` → ops core only: `mongo`, `redis`, `backend`, `nginx`,
  `user-portal`
- `docker-compose.finance.yml` → adds `finance`, `finance_consumer`, `mysql`
- `docker-compose.prod.yml` → unchanged (production overrides)

To run ops-only:
```bash
docker compose -f docker-compose.yml up -d
```

To run full stack:
```bash
docker compose -f docker-compose.yml -f docker-compose.finance.yml up -d
```

### Nginx config

`nginx/nginx.dev.conf` and `nginx/nginx.prod.conf` currently route
`/api/v1/finance/*` and `/api/v1/payments/*` to the finance service. Wave 0
makes those upstreams conditional:

- If finance container isn't reachable at nginx-resolve time, those locations
  return 503 with a JSON body `{"detail": "Finance module not enabled"}`.
- Use nginx `upstream` blocks with `max_fails=1 fail_timeout=10s` so brief
  outages don't permanently break the route.

## 10. CI

New job: `ops-only-smoke`. Boots `mongo + redis + backend + nginx +
user-portal` (no `finance`, no `mysql`, no consumer). Runs a Playwright smoke
test covering:

1. Login as admin
2. Create PR with 1 line (free-text tax code, no cost centre)
3. Convert to PO, assign vendor
4. Receive against PO (full quantity)
5. Create AP invoice from GR
6. Assert no JS console errors, no failed network requests, no broken routes

Existing full-stack `e2e` job continues to cover finance flows.

## 11. Acceptance Criteria

- [ ] `GET /api/v1/system/capabilities` returns the documented shape
- [ ] Migration script flips on `financeEnabled: true` for all existing orgs
- [ ] Toggling `financeEnabled: false` in MongoDB and refreshing the user
      portal hides every finance sidebar entry and 404s every `/finance/*`
      route
- [ ] Ops-only docker-compose boots cleanly; PR/PO/GR/AP flow works end-to-end
- [ ] Tax-code and cost-centre dropdowns degrade to free-text when finance is
      unreachable (no console errors)
- [ ] CI lint blocks new `from services.finance import …` lines in `src/`
- [ ] `ops-only-smoke` CI job passes
- [ ] Tenant Settings admin UI exposes the toggle; super_admin only; audit
      logged
- [ ] Documentation: `Docs/1-Main-Documentation/Deployment-Modes.md` describes
      both deploy modes with examples

## 12. Out of Scope (deferred to later waves)

- Pricing-tier-driven default for `financeEnabled` (Wave 9)
- Compatibility shim that lets ops-only customers later "upgrade" their JE
  history (no JE history exists in ops-only — non-issue)
- Multiple finance backends / replaceable finance providers
- Cost-centre / tax-code free-text validation (intentional — ops-only doesn't
  validate against a finance master list)
- WHT / e-invoicing / advanced tax configuration (Wave 9)

## 13. Open Questions for Approver

1. **Default for tenant in Tenant Settings UI** — show toggle to org owners or
   gate to super_admin only? Current draft: super_admin only.
2. **Audit-log entry shape for the toggle event** — fits existing schema?
3. **Free-text fallback for tax code in ops-only mode** — accept any string,
   or constrain to a small enum (S/Z/E/N) so a later finance-enable migration
   doesn't break? Current draft: accept any string, document the migration
   path.
4. **Nginx behaviour when finance enabled but container missing** — return 503
   immediately, or 502 (default upstream-missing behaviour)? 503 is more
   honest; needs a small `error_page` directive.

## 14. Backlog Tasks

This design produces backlog task **T-059 — Wave 0: Finance as Opt-In Add-On**
with sub-items:

- T-059.1 Backend: `/api/v1/system/capabilities` endpoint + per-tenant flag +
  migration script + outbox writer gate (skip event emission when tenant has
  `modules.financeEnabled=false`)
- T-059.2 Backend: finance `/system/health` endpoint + Redis-cached
  reachability check on ops side
- T-059.3 Frontend: `useCapabilities` hook + route/sidebar gating + graceful
  degradation in purchasing forms
- T-059.4 Frontend: Tenant Settings admin UI for the toggle
- T-059.5 DevOps: docker-compose split + nginx conditional upstreams
- T-059.6 CI: `ops-only-smoke` Playwright job + import-boundary lint
- T-059.7 Docs: `Deployment-Modes.md` + update `CLAUDE.md` modules section

---

## 15. After Wave 0

This unblocks the entire 9-wave roadmap. The boundary established here is the
contract every subsequent wave must honour. Next up after Wave 0 ships:
**Wave 2 — Financial Statements** (BS, P&L, Cash Flow) — see
`Wave-2-Design.md` (to be authored).
