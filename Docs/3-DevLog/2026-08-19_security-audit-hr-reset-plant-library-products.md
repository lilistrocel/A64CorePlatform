# DevLog — super_admin Audit, HR Reset, Plant Library Product Extension

**Date:** 2026-08-14 → 2026-08-19 (one continuous session)
**Session type:** Investigation → security fixes → feature design → 4-stage implementation
**Focus areas:** Cloudflare Access, authorization audit, CodeMap coverage, HR data reset,
Plant Library product extension, CI cost
**Status:** ✅ Complete — PRs #6, #7, #8, #9 all merged to `main`
**Deployment:** `noobai`, container prefix `a64coreplatform-`

**Session objective (as asked):** diagnose a cloudflared access problem, then
check whether users were obtaining `super_admin` without approval. That expanded
into a CodeMap audit, an HR data reset, and the full Plant Library product
extension.

---

## 1. What We Accomplished

### 1.1 Cloudflared — diagnosed, not a bug

The tunnel was healthy (4 days up, all 4 edge connections registered, zero
errors). Origin answered `http://localhost/api/health` in 5ms.

`https://dev.a20core.com/api/health` returned **302 to
`noobcity.cloudflareaccess.com`**, served by Cloudflare itself. A **Cloudflare
Access application fronts the entire hostname, `/api/*` included**, so anyone
outside the Access policy is bounced, and non-browser API clients get HTML 302s
instead of JSON. That policy lives in the Zero Trust dashboard, not on this box.

Corrected mid-investigation: `CF_ACCESS_ENABLED` is **true**, set in
`platform_settings._id="deployment"` — not in `.env` and not in the (empty)
`deployment_settings` collection, which is where it was first looked for.

### 1.2 super_admin audit — no bug, but no audit trail

Three parallel agents (backend code, frontend, live-DB forensics) concluded:
**there was no privilege-escalation path.** Registration hardcodes `role: USER`;
JWTs are never trusted for role (every request re-reads from the DB);
`can_change_role` caps `admin` at moderator/user/guest; `UserUpdate` has no
`role` field.

Every `super_admin` grant was made by an existing `super_admin`. The reason they
*looked* unapproved: **role changes were completely unaudited** — both write
paths did a bare `update_one` plus a `logger.info`, and `admin_audit_log` held
zero user/role actions. There is no approval concept in the schema at all.

One account (`khaledmusic229@gmail.com`, JIT-provisioned then promoted 8 minutes
later) was surfaced for confirmation; the user confirmed it as their own grant.

### 1.3 Security fixes → PR #6 (merged)

- Shared `write_user_audit_log`, wired into all 5 role/activation write paths.
- `seed_admin()` no longer silently re-promotes whatever account holds the
  publicly-documented `ADMIN_EMAIL` when the super_admin count hits zero.
- `CF_ACCESS_DEFAULT_ROLE` gets `UserRole` enum validation on the runtime PATCH
  path, not just at startup.
- `guard_target_not_super_admin` on activate/deactivate.
- Frontend: real route-level role gating on `/admin/users`, `/admin/tenant-setup`
  and `/ai` — all three previously had **no** role check, only a hidden nav link.

### 1.4 CodeMap audit → PR #6

The maps were accurate about what they covered, but **six backend modules
(~118 Python files) had zero representation**: `purchasing`, `mushroom_manager`,
`protocols`, `ai_assistant`, `attachments`, ops-side `finance`.

Root cause: `task_manager.py`'s invalidation table referenced task IDs
(`map_purchasing_module`, `map_mushroom_module`, …) that **`setup.py` never
defined**. Editing those modules marked nothing dirty, and the mapper reported a
confident "26/26 completed" because no task was ever asked to look there.
`setup.py` also had `MONGO_URL` hard-coded to an unauthenticated URI, so it could
not seed this deployment at all. 26 → 33 task definitions; every
`FILE_TO_TASK_MAP` id now resolves.

### 1.5 HR data reset

At the user's request, wiped `employees` (179), `employee_contracts` (178),
`payroll_entries` (179), `payroll_runs` (1). Records contained real PII
(`emiratesId`, Arabic names, salaries, emergency contacts), so this was
confirmed explicitly before deleting and a `mongodump` was taken first:
`/home/noobcity/backups/hr-wipe-2026-08-19/`.

Deletes used explicit `organizationId: {$in: [...]}` filters, never `{}`.
Documents were deleted rather than collections dropped, so all indexes survive.
Nothing outside the HR module references `employeeId` — verified by grep — so
the wipe was self-contained.

### 1.6 Plant Library product extension — PRs #7 and #9 (merged)

Each mother (the crop, e.g. "Capsicum") now carries a `products[]` picklist —
name, unit (`kg` only today), category (`sellable`/`process`/`waste`). A harvest
is recorded as N product lines in one submission, each routed by category.

| Stage | Shipped in |
|---|---|
| 1 — `PlantProduct` model, 4 CRUD endpoints, 3 indexes | PR #7 |
| 2 — shared `ProductsEditor`, create-modal placement, sellable invariant + dialogue | PR #7 |
| 3 — multi-line submission, per-category routing, batch lookup, `processing_inventory` | PR #9 |
| 4 — multi-line harvest modal, batch lookup UI, retired old waste path | PR #9 |

Seeding migration gave all 59 existing mothers a sellable product named after
themselves, so the harvest picklist is never empty.

### 1.7 CI cost → PR #8 (merged)

The `Ops-only Docker stack — PR/PO/GR/AP smoke` job ran on **every** PR for ~25
minutes while testing nothing at the browser level:
`npx playwright test tests/ops-only-smoke || true` — that suite has never existed
in the repo, and `|| true` swallowed the error. The curl fallback was unreachable
because `playwright.config.ts` *is* present.

Removed the job; **kept `import-boundary-lint`** in the same file, which runs in
~5s and is the guard CLAUDE.md relies on. Deleting the workflow wholesale — the
obvious move — would have silently removed it.

---

## 2. Bugs Discovered

### 🔴 Cross-tenant read leak — `plant_data_enhanced` (FIXED, PR #9)
`plant_data_enhanced_repository.py` had **zero** `organizationId` references in
its read or write path, while sibling `plant_mothers` has always filtered by org.
Any authenticated user could read and search every other organization's variety
data via variety search, the active-plants dropdown, and variety create. Same
family as T-918, different layer: missing query filter, not missing cache key.
Impact here was junk-only (2 of ~58 records had no org; only one org exists), but
it would have been exploitable the moment a second org existed.

### 🔴 Role changes unaudited (FIXED, PR #6)
`user_service.py:395` and `admin.py:373` wrote roles with no audit entry.
`admin_audit_log` had zero user/role actions; container log retention covers only
a few days, so historical grants are unrecoverable.

### 🟠 `seed_admin()` promoted on boot (FIXED, PR #6)
If zero super_admins existed, it promoted whatever account held `ADMIN_EMAIL`
(`admin@a64platform.com`, published in CLAUDE.md) with no approver and no audit.
Dormant here, but registration is open and that address was unregistered — it
could have been claimed and left to wait.

### 🟠 React Query `refetchOnMount: false` (FIXED, PR #9)
The global default contradicted its own comment ("Don't refetch when component
remounts **if data is still fresh**" — that describes `true`). `false` suppresses
refetch even for **invalidated** data, so `invalidateQueries()` on an inactive
query marked it stale without refetching, and mount then suppressed it. A record
created on page A showed stale on page B until `gcTime` evicted it 5 minutes
later. **Not plant-library-specific** — it would have broken any cross-page
feature. Surfaced by a concrete report: a newly added product missing from the
harvest dropdown.

### 🟠 Harvest inventory recorded the variety name (FIXED, PR #9)
`harvest_service.py` wrote `inventory_harvest.plantName` from
`block.targetCropName` (the *variety*) instead of the product. Fixed in the
shared `_add_to_inventory`, so it corrects the **existing** single-harvest path
too, not only the new batch path.

### 🟡 Archive dropped the product ref (FIXED, PR #9)
`archive_repository.py` built `BlockArchive` without copying
`productMotherId`/`productName` despite the model carrying both. Latent only
because no archive had been created since the mother/variety migration.

### 🟡 `productMotherId` was write-only (ADDRESSED, PR #9)
Stamped at planting, cleared on empty, updated by `cascade_rename` — and read by
nothing. No aggregation grouped by it. The "product" harvest/inventory/sales were
supposed to roll up to was not rolled up to by anything.

---

## 3. The Design Decision That Matters Most (§3.1)

`block_harvests` is the **sellable ledger**. 48 backend references sum its
`quantityKg` — block analytics, farm analytics, three `harvest_repository`
aggregations, the `farms.py` rollup, and the **finance P&L**
(`pnl_service.py:394`). None filter by category, because until now every row was
sellable by construction.

The first design draft routed everything through `block_harvests` with a category
column and filtered downstream. **The user rejected it** — asking why waste should
live there at all when `inventory_waste` already models harvest waste with
`sourceType: 'harvest'` and `sourceBlockId`.

That was the better call, and it changed the shape of the whole feature. Routing
by destination makes the guarantee **structural**: every `block_harvests` row is
sellable, legacy and new alike, so yield stays "sum all rows" and **zero of the
48 consumers changed**. Filtering would have required touching all 48 including
finance, plus a rule that legacy null-category rows still count.

**Do not "simplify" this later into one harvest ledger.** It would inflate yield
and the P&L silently — no error, just numbers that grow. The guard is mechanical:
the test suite asserts a mixed 3-line batch produces exactly **one**
`block_harvests` row.

---

## 4. What We Need To Do Next

1. **T-924 (Ready)** — batch **editing**. Lookup ships read-only; design §7 framed
   it as the route to correcting a mixed submission, and no edit/delete endpoint
   exists.
2. **Regenerate CodeMaps** — new endpoints plus the `processing_inventory`
   collection are structural. Blockers: `rerun.sh` diffs `HEAD~1..HEAD` (commit
   first), the mapper needs `MONGO_URL` **with credentials**, and the graph lives
   in the **production** `a64core_db`.
3. **Run the mapper task seeding from PR #6** — 7 tasks defined, never executed,
   so those six modules are still unmapped. Verify with:
   `db.mapper_nodes.countDocuments({file_path:/^src\/modules\/(purchasing|mushroom_manager|protocols|ai_assistant|attachments|finance)\//})`
   — currently `0`.
4. **Version drift** — `main.py` reads `1.17.0` while CHANGELOG history runs
   through `1.20.0`, with five pending `[Unreleased]` entries. Four
   change-guardian passes have deferred this; it is a release-manager decision
   and it keeps accumulating.
5. **Design §11 leftovers** — `sales_order_lines` still carries free-text
   `cropName` (13,281 rows, 63 distinct values, no product reference; see T-500);
   the dead `products` collection (0 rows, zero frontend) is a fourth claimant on
   the word "product"; legacy `plant_data` collection + routes are unused.
6. **Cloudflare Access policy** — the original complaint. Add affected users in
   the Zero Trust dashboard, or add a bypass for `/api/*` if non-browser clients
   need reach (weigh carefully — it exposes the API with only app JWT in front).

---

## 5. Important Context for Next Session

- **A checkout here IS a deployment.** One worktree; the containers bind-mount
  `src/` and `frontend/user-portal/src` directly. Switching branches changes what
  `dev.a20core.com` serves. Uncommitted changes travel across checkouts, so
  `git checkout main` does not "hide" work in progress. Use `git worktree` when
  you need another branch's code without disturbing the deployment — that's how
  PR #6's lint failure was reproduced.
- **Code is branch-scoped; data is not.** The seeded products, the HR wipe and the
  waste migration are in production data regardless of branch. Git protects
  neither. **Rule adopted this session:** any migration writing to production gets
  either a documented reverse or a dump taken first.
- **The product seeding migration has no reverse.** The HR wipe and waste
  migration both have backups.
- Test baselines: backend `tests/unit` **883 passed, 1 skipped, 2 failed** (the 2
  are pre-existing `test_outbox_reconciler` MagicMock-await bugs — do not "fix").
  Frontend `npx tsc -b` **234 errors / 129 TS6133** — that is the baseline, not a
  regression. Use `tsc -b`; `--noEmit` is a no-op here.
- CI enforces `black==26.5.1` over `src/`. A formatting miss turns Python Lint red.
- Backups: `/home/noobcity/backups/hr-wipe-2026-08-19/` (PII — delete when no
  longer needed), `/home/noobcity/backups/waste-migration-2026-08-19/`.

---

## 6. Files Modified

All merged. See PRs #6 (security + codemapper), #7 (Plant Library Stages 1+2),
#8 (CI), #9 (Stages 3+4 + React Query fix) for full file lists.

Backlog: **T-919/920/921** (PR #6), **T-922** (Stages 1+2), **T-923** (Stages 3+4)
all archived. **T-924** filed Ready.

> Note: task ids on the Plant Library branch were renumbered to **T-922/T-923**
> before merge — PR #6 had independently claimed T-919/920/921, and both branches
> targeted `main`. Parallel branches numbering their own backlog entries will keep
> colliding; worth checking before filing.

---

## 7. Session Metrics

- **PRs merged:** 4 (#6, #7, #8, #9)
- **Specialist agents dispatched:** 14 (backend, frontend, general-purpose,
  change-guardian)
- **Bugs found:** 7 — 2 security (1 live cross-tenant leak), 5 correctness
- **Production data operations:** 3 (HR wipe, product seeding ×59, waste
  migration ×1) — all backed up or idempotent, all verified after the fact
- **CI time saved:** ~25 min per PR
- **Key achievement:** the routing decision in §3 — a user challenge to the first
  design draft removed the need to touch 48 consumers including the finance P&L,
  and made the invariant structural rather than enforced by discipline.
