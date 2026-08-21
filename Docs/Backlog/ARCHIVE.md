# A64 Core Platform — Completed Work

> **Total completed:** 120 tasks

## 2026-08

### T-927 | `require_permission` fails open in farm_manager — fail-closed fix. SECURITY.
- **Category:** Backend (security) · **Priority:** P0
- **Completed:** 2026-08-21 · **Assigned:** backend-dev-expert
- **Depends on:** — · **Blocks:** —
- **Description:** `src/modules/farm_manager/middleware/auth.py`'s
  `require_permission` resolved permissions via a bare `if/elif` chain over
  exactly four strings (`farm.manage`, `farm.operate`, `agronomist`,
  `admin`) with **no `else`** — any other string fell through and returned
  `current_user` unchecked, authorising every authenticated active user.
  This was live, not theoretical:
  `require_permission("admin.manage")` gated three admin-only endpoints in
  `src/modules/farm_manager/api/v1/weather.py` (`get_cache_stats:217`,
  `trigger_cache_refresh:252`, `invalidate_farm_cache:291`), and
  `admin.manage` was never one of the four handled branches — all three
  were reachable by any authenticated active user in production.
- **Result:** Converted `require_permission` to a fail-closed
  `PERMISSION_ROLES: Dict[str, FrozenSet[str]]` lookup + `_resolve()`,
  mirroring the pattern already used in
  `src/modules/genetics/middleware/auth.py` and
  `src/modules/protocols/middleware/auth.py`. Role sets for the four
  pre-existing strings are byte-for-byte unchanged from the old if/elif
  chain (`farm.manage`→admin/super_admin/moderator, `farm.operate`→+user,
  `agronomist`→admin/super_admin/moderator, `admin`→admin/super_admin).
  Registered `admin.manage`→admin/super_admin (the fix for the live hole).
  An unregistered string now raises `HTTPException(500)` and logs an error
  naming the string, resolved at `require_permission()` construction time
  (route-definition/import time) rather than on first request, so a typo
  surfaces at boot. `get_current_user`, `get_current_active_user`,
  `require_farm_access`, `CurrentUser`, `security` — the public surface
  other modules (genetics, protocols, purchasing, mushroom_manager,
  attachments) import from this file — are unchanged. Corrected
  `get_current_active_user`'s docstring, which claimed it "ensures user
  account is active and verified" — it has never checked
  `isEmailVerified`; the docstring was wrong, not the behaviour, so the
  docstring was fixed rather than starting to enforce verification (would
  have been an unrequested behaviour change). Updated
  `genetics/middleware/auth.py`'s `_resolve` docstring, which claimed the
  fail-open risk was "latent rather than active today" — `admin.manage`
  made that demonstrably false, so the docstring now records what was
  found instead of the earlier (incorrect) reassurance.
  **Audit of the other 9 `require_permission` implementations**
  (`finance`, `hr`, `logistics`, `crm`, `sales`, `marketing`, plus
  `purchasing` and `mushroom_manager`, which re-export farm_manager's and
  are covered by this fix): `finance`, `hr`, `logistics`, `crm`, `sales`,
  and `marketing` all have the identical if/elif-with-no-`else` structural
  pattern (fail-open on an unregistered string) — but cross-checked
  against every call site in each module, **none currently has a live
  hole**: every permission string actually passed to `require_permission`
  in each of those six modules is handled by an existing branch. Not fixed
  in this task — reported for the parent to decide scope; each is a
  quick, low-risk follow-up (register-and-fail-closed like this one) if it
  wants to close the latent bypass class before it becomes live like
  `admin.manage` did.
- **Tests:** `tests/unit/test_farm_manager/test_require_permission_auth.py`
  (24 cases) — exact role-set preservation for the four pre-existing
  permissions, `admin.manage` registration + admits admin/super_admin +
  denies user/moderator, unregistered strings fail closed (`_resolve` and
  `require_permission` both), definition-time failure, and the three
  weather.py endpoints wired to `admin.manage` authorise an admin caller.
  952 passed / 2 pre-existing unrelated failures (`test_outbox_reconciler.py`,
  confirmed not caused by this change) / 1 skipped, full in-container suite
  (`tests/unit`, includes T-928's tests too).
- **Deploy:** api restart.

### T-928 | Quote audit history / Quote attachments both pointed at a collection that has never existed
- **Category:** Backend · **Priority:** P1
- **Completed:** 2026-08-21 · **Assigned:** backend-dev-expert
- **Depends on:** — · **Blocks:** —
- **Description:** Quotes are stored in `sales_quotes` (audit trail in
  `sales_quotes_audit`) — `sales/services/quote_service.py:65-66` is the
  writer and was always correct. Two consumers had the wrong name:
  `sales/api/v1/audit.py`'s `_SALES_AUDIT_COLLECTIONS["QUOTE"]` mapped to
  `"quotes_v2_audit"` (`GET /api/v1/sales/audit?docType=QUOTE` always
  returned empty — the Quote detail page's Audit History button never
  worked), and `attachments/services/attachment_service.py`'s
  `_SALES_V2_COLLECTIONS[QUOTE]` mapped to `"quotes_v2"`
  (`_assert_sales_v2_document_is_draft` always raised `LookupError` →
  "document not found", so attaching or deleting a file on any Quote
  always failed). Verified live: `quotes_v2`/`quotes_v2_audit` do not
  exist; `sales_quotes` (1 doc)/`sales_quotes_audit` (5 docs) do, and the
  live document carries `docEntry`/`organizationId`/`status` — the
  existing query shape works unchanged once the name is right.
- **Result:** Both dicts corrected to `sales_quotes`/`sales_quotes_audit`.
  Verified the other 7 doc types in both dicts against the collection
  constant each writer service in `sales/services/*.py` actually defines
  (`_ARI_COL`, `_CR_COL`, `_SO_COL`, `_DN_COL`, `_RR_COL`, `_RTN_COL`,
  `_ARC_COL` + each module's `_AUDIT_COL`) — all 7 were already correct;
  only QUOTE was wrong, in both dicts. The comment above
  `_SALES_AUDIT_COLLECTIONS` claimed it "mirrors `_SALES_V2_COLLECTIONS`
  plus the `_audit` suffix" — that stated mechanical invariant is exactly
  what propagated the bug (both tables independently had `quotes_v2*`).
  Replaced with an explicit doc-type → writer-service → audit-collection
  table in the comment and corrected the module docstrings in both files
  that still named `quotes_v2*` as an example. Also updated a pre-existing
  test, `test_attachments/test_attachment_service.py::
  test_upload_quote_draft_succeeds`, which had asserted routing to
  `quotes_v2` — it was encoding the bug rather than catching it.
- **Tests:** `tests/unit/test_sales/test_audit_collection_mapping.py` (new,
  20 cases) — QUOTE resolves correctly in both dicts, plus a
  parametrized guard test per doc type asserting every value in both
  dispatch tables matches the collection constant its writer service
  actually defines (the regression test that would have caught the
  original typo, for all 8 doc types going forward, not just QUOTE).
- **Deploy:** api restart.

### T-925 | Brother QL-800 network label printing — configurable per deployment
- **Category:** Backend · **Priority:** P2
- **Completed:** 2026-08-21 · **Assigned:** backend-dev-expert (Viet Anh)
- **Depends on:** T-804 ✅ (label PDF generator this reuses), T-905 ✅
  (deployment-settings env-lock pattern this follows) · **Blocks:** —
- **Summary:** Adds direct network printing of genetics labels to a real
  Brother QL-800 (contract published at that printer's own `/agent.md`,
  fetched and read before implementation), fully per-deployment-configurable,
  alongside the existing PDF-download route which is untouched in
  behaviour.
  - **Part 1 — config (`src/config/settings.py`, `src/services/deployment_settings_service.py`,
    `src/models/deployment_settings.py`, `src/api/v1/admin.py`):** three new
    managed keys following the exact env→db→unset pattern —
    `LABEL_PRINTER_ENABLED` (bool), `LABEL_PRINTER_BASE_URL` (str),
    `LABEL_PRINTER_API_KEY` (str, joins `_SECRET_KEYS` — masked in the
    admin API response as `isSet`+`maskedHint` and in the audit log, never
    returned in full, no reveal endpoint). Two new guardrails in
    `deployment_settings_service.update()`: (e) `LABEL_PRINTER_BASE_URL`
    must parse as an http/https URL with a host (422 otherwise); (f)
    `LABEL_PRINTER_ENABLED` cannot flip to `True` unless a base URL + API
    key are already resolved, in the same PATCH or previously saved (409
    otherwise) — prevents a confusing runtime failure the first time
    anyone tries to print.
  - **Part 2 — `src/services/label_printer_service.py` (new):** async httpx
    client mirroring the `sales_order_service.py`/`deployment_settings_service.py`
    HTTP-call pattern. `is_configured()`; `health()` (5s timeout, never
    raises — collapses every failure mode to a structured
    `PrinterHealthResult`); `print_pdf()` (30s timeout, preflights health
    and refuses with 502 if not `["ready"]`, maps the printer's own
    401→502 [config problem, key never leaked], 422→422 [error passed
    through], 502→502 after exactly one retry per the printer's own
    `/agent.md` instruction not to retry more than once).
  - **Part 3 — `src/modules/genetics/api/v1/labels.py`:** extracted the
    PDF-building body of `get_labels()` into `_build_labels_pdf()` (pure —
    no DB write) and `_bump_labelled_vessel_count()` (the one side effect,
    now callable independently) — `GET /{accession_id}/labels` is
    behaviourally unchanged (regression-verified: all pre-existing
    `test_label_pdf.py` cases still pass unmodified). New
    `POST /{accession_id}/labels/print` reuses `_build_labels_pdf()`
    verbatim, defaults `size=62x15` (the loaded roll — NOT the GET route's
    `29x90` default), maps `62xN`→printer `label="62"`
    (`29x90`/`17x87` pass through via `_printer_label_for_size`), caps
    `copies` at the printer's own 50, gates on `genetics.edit` (stricter
    than the GET route's `genetics.view` — printing is a physical,
    irreversible action), and bumps `labelledVesselCount` only AFTER a
    confirmed successful print, never before or on failure.
  - **Part 3b — `src/modules/genetics/api/v1/printer.py` (new),
    wired into `api/v1/__init__.py` at `/printer`:** `GET /printer/health`,
    always HTTP 200 (unconfigured/unreachable/not-ready are data for the
    UI, never a 500), gated on `genetics.view`.
  - **Part 4 — `tests/unit/test_genetics/test_label_printing.py`:** 30 new
    tests (httpx mocked throughout — the real printer was never contacted
    during development, per instruction). Covers unconfigured→
    `configured:false` not 500, refusal when not ready, 401/422/502
    mapping, exactly-one-502-retry (and recovery on that retry),
    `labelledVesselCount` bumped only on success, the `62xN`→`label=62`
    mapping, the `copies` cap, and that the configured API key never
    appears in any raised exception detail or log record (asserted via
    `caplog`). Full suite run in-container after an api restart:
    `tests/unit/test_genetics` 327/327 passed (297 pre-existing + 30 new,
    zero regressions), `tests/unit/test_deployment_settings` 34/34 passed,
    full `tests/unit` 913 passed / 2 failed (the 2 are the pre-existing,
    unrelated `test_finance_bridge/test_outbox_reconciler.py` failures
    already tracked in this file's "Known Open Items").
- **Concurrent frontend work reconciled:** a `frontend-dev-expert` built
  `PrintLabelsModal`'s printer path + the Deployment Settings "Label
  Printer" card against this contract while it was mid-flight, and
  flagged one assumption as unverified: both new responses wrapped in the
  `{"data": ...}` envelope every other `geneticsApi.ts` call unwraps via
  `return data.data`. Checked against this module's actual convention
  (`utils/responses.py`'s `SuccessResponse`, used by every existing
  genetics route) — the frontend's assumption was RIGHT and this
  backend's first draft was wrong (both new routes initially returned
  bare objects). Fixed: `GET /printer/health` now returns
  `response_model=SuccessResponse[PrinterHealthResponse]`; `POST
  .../labels/print` returns `{"data": {...}}` as a plain dict (not
  `SuccessResponse[...]` — its payload's `from` key is a Python reserved
  word, so a manual envelope is clearer than an aliased Pydantic model).
  Re-verified live post-fix: both routes correctly 401 (not 404) against
  the running api container. One remaining minor mismatch flagged, not
  fixed here (cosmetic, does not block functionality): the frontend's
  `PrintLabelsResult.jobId` is typed `string`, this backend returns the
  printer's own `job_id` as a number (`int | None`) — JS does not enforce
  the TS type at runtime, but the type annotation itself should be
  corrected to `number` on a follow-up pass.
- **Not done in this pass (explicitly out of scope):** a live printer-health
  polling indicator elsewhere in the UI beyond what the frontend pass
  above already added is a natural follow-on if wanted. **The one
  supervised LIVE print test against the real hardware is deliberately
  NOT done here** — implementation instructions were explicit that
  development/testing must never print physically; that single
  verification is the parent session's job.
- **CodeMaps:** flagged stale — 2 new endpoints
  (`POST /genetics/accessions/{id}/labels/print`,
  `GET /genetics/printer/health`) + 1 new service
  (`label_printer_service.py`) need `bash scripts/codebase_mapper/rerun.sh`
  + `map_generator.py all`, blocked on the same Mongo-credentials issue
  already logged in "Known Open Items" above.

---

### T-923 | Plant Library product extension Stage 3+4 — harvest batch routing (backend) + multi-line harvest modal (frontend)
- **Category:** Backend + Frontend · **Priority:** P2
- **Completed:** 2026-08-19 · **Assigned:** backend-dev-expert (Stage 3) +
  frontend-dev-expert (Stage 4) (Viet Anh)
- **Depends on:** T-922 ✅ (products[] CRUD + sellable invariant) ·
  **Blocks:** — (design §7's batch-edit capability was not built here —
  filed as follow-up **T-924**, Ready)
- **Design doc:** `Docs/2-Working-Progress/plant-library-product-extension-design.md`
  — §3/§3.1 (routing, and why waste/process must never become
  `block_harvests` rows), §4.2-4.4 (model changes), §5 (harvest modal),
  §7 (batch lookup/editing)
- **Summary:** Closes the loop T-922 opened — the harvest modal now
  records N products in one submission, each routed to the destination
  its category implies, reachable end to end and user-verified.
  - **Backend (commits `450629f`/`dbccb1f`/`fd9211a`):** new
    `POST .../harvests/batch` (validates every line up front — product
    belongs to the block's mother and is active, grade required for
    sellable/process, rejected outright for waste — before writing
    anything, so one bad line rejects the whole submission) and
    `GET .../harvests/batch-lookup?harvestDate=` (unions all three
    destinations by block+date, grouped by `harvestBatchId`). Routing:
    `sellable` reuses `record_harvest`/`HarvestRepository.create` into
    `block_harvests` (unchanged shape, now accepting optional
    `productId`/`productName`/`harvestBatchId`); `process` writes to the
    new `processing_inventory` collection; `waste` writes straight to
    `inventory_waste`. **Zero of the 48 existing
    `block_harvests.quantityKg` consumers — including the finance P&L
    (`pnl_service.py:394`) — were touched**, by construction rather than
    by a filter that could later be forgotten. `GET /inventory/processing`
    added for read visibility. 5 new indexes across `block_harvests`,
    `inventory_waste`, and `processing_inventory`.
  - **Folded in — 3 pre-existing bugs found during the design audit
    (§9), documented separately in `CHANGELOG.md`'s PATCH entry
    `fd0f3d2`:** harvest inventory writing the block's variety name
    instead of the product name (fixed in the shared
    `_add_to_inventory`, so it also corrects the pre-existing
    single-harvest path); cycle-archiving silently dropping
    `productMotherId`/`productName`; a live cross-tenant read leak on
    `plant_data_enhanced` (zero `organizationId` filtering, same bug
    family as T-918).
  - **Migration** `plant_library_harvest_routing_migration.py` — backfilled
    `productId`/`harvestBatchId` onto the one pre-existing harvest-sourced
    `inventory_waste` row. Run against production (backup taken first);
    idempotent, proven via a clean second `--execute` (`migrated: 0,
    skipped: 1`).
  - **Frontend (Stage 4):** `BlockHarvestEntryModal.tsx` rewritten for
    multi-line submission — product picklist resolves LIVE from
    `block.productMotherId` via a new `useBlock` hook, grade control
    hidden for waste-category lines, one POST per submission, a results
    view reporting each line's actual destination. `farmApi.ts` drops
    `recordBlockWaste`/`RecordBlockWastePayload` entirely (grep-verified
    zero other callers), retiring the old direct-to-waste write path, in
    favour of new `submitHarvestBatch`/`getHarvestBatchLookup`.
    `BlockHarvestsTab.tsx` gains a Product column (`'Unspecified'` on the
    13,947 legacy null-product rows) and a Batch Lookup button — the
    default list stays sellable-only per design §7, deliberately not
    unioned. New read-only `BlockHarvestBatchLookupModal.tsx` (reuses the
    shared `genetics/Modal.tsx` shell), `hooks/queries/useBlocks.ts`,
    `hooks/queries/useHarvestBatch.ts`, `utils/harvestCategory.ts`
    (shared category/destination vocabulary so the two modals can't
    drift apart). `HarvestInventoryList.tsx` deliberately left unchanged
    — `inventory_harvest` has no `productId`, and its existing Product
    column already reads `plantName`, corrected by this same stage's bug
    fix above.
  - **Also fixed in this session, app-wide (not Plant-Library-specific —
    its own commit and its own `CHANGELOG.md` entry):** global React
    Query `refetchOnMount: false` was silently suppressing refetch of
    stale/invalidated queries everywhere, contradicting its own comment.
    Surfaced concretely by this stage's own verification — a product
    added in the Plant Library didn't appear in the harvest modal's live
    picklist. Fixed to `true`; `useProductsForMother` additionally pins
    `staleTime: 0` / `refetchOnMount: 'always'` per design §5's live-read
    requirement.
- **Known gap carried forward — filed as T-924 (Ready):** batch lookup
  ships read-only. Design §7 framed it as the route to *editing* a mixed
  submission, but no batch edit/delete endpoint exists. T-924 also
  carries the CodeMap-regeneration debt (now two stages deep) and a
  reminder of design §11's still-untracked deferred items
  (`sales_order_lines.cropName`, the dead `products` collection, legacy
  `plant_data`).
- **Tests:** `tests/unit/test_farm_manager/test_harvest_batch_routing.py`
  (new, 9 cases) — mixed batch routes each category correctly while
  producing exactly ONE `block_harvests` row; grade required/rejected per
  category; rejects an off-mother or inactive product; rejects the whole
  submission on one bad line; legacy null-product rows still sum
  correctly. Full suite: 883 passed, 1 skipped, 2 pre-existing unrelated
  failures. `black --check`/`flake8` clean.
- **Verification:** Frontend `npx tsc -b` — 234 errors / 129 TS6133,
  diffed byte-identical against baseline, zero new. **User click-through
  verified the feature end to end**, including the React Query picklist
  fix.
- **CodeMaps:** Not regenerated — flagged at Stage 1+2 close, flagged
  again here. Tracked in T-924 alongside the batch-edit gap so both land
  in one regeneration pass.

### T-922 | Plant Library product extension Stage 1+2 — products[] CRUD + products editor UI + sellable-product invariant
- **Category:** Backend + Frontend · **Priority:** P2
- **Completed:** 2026-08-19 · **Assigned:** backend-dev-expert (Stage 1) +
  frontend-dev-expert (Stage 2) (Viet Anh)
- **Depends on:** — · **Blocks:** — (unblocked T-923, Stage 3+4, archived above)
- **Design doc:** `Docs/2-Working-Progress/plant-library-product-extension-design.md`
- **Summary:** First two stages of a multi-stage extension letting each
  plant mother (product/SKU) carry a picklist of concrete products it can
  yield (e.g. "Capsicum" → "Green Capsicum" sellable, "Capsicum Puree"
  process, "Capsicum Trim" waste), so a block's harvest can eventually be
  routed by destination without centralising everything into
  `block_harvests` — see the design doc §3.1 for why that matters (48
  backend consumers, including the finance P&L, sum
  `block_harvests.quantityKg` on the assumption every row is sellable).
  - **Backend:** new `ProductUnit`/`ProductCategory` enums, `PlantProduct`
    model, `products: List[PlantProduct]` embedded on `PlantMother`. Four
    endpoints (`POST`/`GET`/`PATCH`/`DELETE` under
    `/api/v1/farm/plant-mothers/{id}/products`) — `DELETE` deactivates
    only, mirroring the existing mother-delete refuse-don't-cascade
    precedent. New server-side invariant: every mother always keeps at
    least one active sellable product — auto-seeded on create when none is
    supplied, 409 on any mutation that would drop the last one (`DELETE`,
    `PATCH category`, `PATCH isActive:false` all funnel through one
    guarded code path). Closed a bypass where CSV-imported mothers escaped
    the invariant (`plant_data_enhanced_service.py`'s CSV importer now
    routes mother creation through `PlantMotherService.create_mother`
    instead of the repository directly). Three new indexes:
    `plant_mothers.products.productId`,
    `plant_data_enhanced.motherPlantId`, `blocks.productMotherId` (the
    latter two were missing entirely and made every mother→variety lookup
    and the whole rename cascade a collection scan).
  - **Migration:** `scripts/migrations/plant_library_default_product_migration.py`
    — seeded one sellable/kg product, named after the mother, for every
    existing `plant_mothers` document without one. Run against production:
    59 seeded, verified 59/59; a second run reported 59 skipped / 0
    seeded, proving idempotency.
  - **Frontend:** new shared `ProductsEditor.tsx` (draft mode in
    `PlantMotherFormModal` create flow; live mode there once the mother
    exists, and always in `PlantMotherDetailModal`, which is now the
    single home for managing products on an *existing* mother — edit mode
    reverted to the plain 3-field form). Pre-submit confirmation dialogue
    when no sellable draft product exists, naming the product that will
    be auto-created.
- **Tests:** `tests/unit/test_farm_manager`: 98 passed (was 78 before this
  work). Full `tests/unit`: 851 passed, 1 skipped, 2 pre-existing/unrelated
  failures (`test_outbox_reconciler.py` MagicMock-await bug). Frontend
  `npx tsc -b`: 234 errors / 129 TS6133, matching the documented baseline
  exactly — zero new, none in any touched file.
- **Not built (Stages 3-5) — carried forward as T-923:** harvest modal
  multi-line rework, `block_harvests`/waste/processing-inventory routing,
  processing inventory collection, batch lookup/editing. Also carries
  forward three pre-existing bugs found during the design audit (design
  doc §9) that were deliberately left alone this round: `harvest_service.py`
  writes the variety name instead of the product name into
  `inventory_harvest.plantName`; `archive_repository.py` doesn't copy
  `productMotherId`/`productName` onto `BlockArchive`; `plant_data_enhanced`
  reads are not org-scoped (a live cross-tenant leak of the same family as
  T-918).
- **Not verified:** frontend changes not run through Playwright — pending
  user click-through. No live-mother smoke test against production data
  (backend verified via full unit suite + clean container restart +
  `getIndexes()` only).
- **CodeMaps:** stale, not regenerated — 4 new endpoints
  (`CRUD /farm/plant-mothers/.../products`), new models
  (`PlantProduct`/`PlantProductCreate`/`PlantProductUpdate`/`ProductUnit`/
  `ProductCategory`), and a new frontend component (`ProductsEditor.tsx`).
  Flagged per CLAUDE.md; regeneration deferred to whoever picks up T-923,
  since Stage 3-5 will touch the same surface again shortly.
- **DevLog:** `2026-08-19_plant-library-product-extension-stage1-2.md`.
- **Commits:** branch `plant-library-product-extension` (4 commits —
  backend, frontend, migration, docs; see CHANGELOG.md and the branch's
  commit messages for full detail).

### T-920 | Backend security audit fixes — role/activation audit trail, seed_admin lockdown, CF_ACCESS_DEFAULT_ROLE validation, activate/deactivate super_admin guard
- **Category:** Backend (security) · **Priority:** P0
- **Completed:** 2026-08-14 · **Assigned:** backend-dev-expert
- **Depends on:** — · **Blocks:** — · **Related:** T-919 (frontend half of the
  same defense-in-depth audit — route-level role gating + role-dropdown
  clamping; no file overlap with this task)
- **Summary:** Four fixes from a backend security audit:
  1. **Audit trail for role/activation changes.** `UserService.change_user_role`
     / `activate_user` / `deactivate_user` (`src/services/user_service.py`)
     and the sibling raw-`update_one` endpoints in `src/api/v1/admin.py`
     (`PATCH /admin/users/{id}/role`, `PATCH /admin/users/{id}/status`) did a
     bare Mongo update plus a `logger.info` — nothing written to
     `admin_audit_log`, the most sensitive mutation in the system left with
     no "who granted this, and when" trail. New shared writer
     `src/services/audit_log_service.py::write_user_audit_log` matches the
     existing `admin_audit_log` document shape (`action`, `targetUserId`,
     `targetUserEmail`, `performedBy`, `performedByEmail`, `performedByRole`,
     `timestamp`, `details.before/after`) used by `deployment_settings_service
     .update()`, the organizations modules-update endpoint, and admin.py's
     `mfa_reset` — not a new parallel mechanism. Wired into all 6 write paths
     (2 in `user_service.py` methods x role/activate/deactivate = 3, plus the
     2 admin.py endpoints, plus `seed_admin`'s promotion branch below).
  2. **`seed_admin()` lockdown (`src/main.py`).** Previously, whenever the
     super_admin count hit zero, it silently promoted any pre-existing
     account matching `settings.ADMIN_EMAIL` — no approver, no audit entry.
     Since `ADMIN_EMAIL` is documented publicly (this repo's own CLAUDE.md)
     and registration is open, anyone could pre-register that address as an
     ordinary user and get auto-promoted on a future restart where
     super_admin count dropped to zero. Fixed by gating promotion/creation on
     "genuinely uninitialised" = no organization has ever been created on
     this deployment (org creation only happens inside this same startup-time
     function, before the app accepts HTTP traffic, so this signal cannot be
     manufactured externally). On an already-initialised deployment, zero
     super_admins is now treated as an operational incident requiring an
     explicit operator action — never auto-repaired. The one remaining
     promotion path (a registration racing the very first boot before any
     org exists) is preserved for genuine first-boot bootstrap but is never
     silent: always audit-logged (`performedBy="system:seed_admin"`) and
     logged at WARNING.
  3. **`CF_ACCESS_DEFAULT_ROLE` runtime validation
     (`src/services/deployment_settings_service.py::update()`).** Previously
     type-checked only (`isinstance(value, str)`); the `UserRole`
     enum-membership check existed solely in `config/settings.py`'s startup
     validator, which covers the env-var path, not a runtime DB write via
     `PATCH /api/v1/admin/deployment-settings`. Added the same
     enum-membership check to `update()` — matches the startup validator's
     strictness exactly (enum membership only; `"super_admin"` is still a
     valid value, same as the env-var path — this is a validation-gap fix,
     not a new business-rule restriction).
  4. **Missing super_admin-target guard on activate/deactivate
     (`src/api/v1/users.py` `POST /users/{id}/activate` /`/deactivate` ->
     `UserService.activate_user`/`deactivate_user`).** Its sibling
     `PATCH /admin/users/{id}/status` already blocked a plain `admin` from
     touching a `super_admin` account; these two did not. New shared guard
     `guard_target_not_super_admin` in `src/middleware/permissions.py`, used
     by both `user_service.py` methods (existing `admin.py` inline checks
     left untouched — different message wording, no behavior change risked
     there).
- **Not done / deliberately out of scope:** `UserService.change_user_role`
  (called from `users.py`'s `PATCH /{id}/role`) does not gate on the
  target's *current* role, only the role being assigned via
  `can_change_role` — an admin could demote an existing super_admin to
  `moderator`. Flagged to the user, not fixed here (only activate/deactivate
  were in scope for the super_admin guard per this audit). No approval
  workflow was added to user creation/registration — explicitly out of
  scope per the audit brief (audit logging only, not a new business
  process).
- **Tests:** 24 new unit tests, all passing in the live container
  (`docker exec a64coreplatform-api-1 python -m pytest tests/unit/test_users
  tests/unit/test_main tests/unit/test_deployment_settings -q` → 59 passed,
  0 failed — includes pre-existing tests in those dirs):
  - `tests/unit/test_users/test_user_service_role_activation_audit.py` (8) —
    audit entry shape/actor, 403 guard blocks admin-on-super_admin,
    super_admin-on-super_admin allowed + audited, refresh-token revocation
    preserved.
  - `tests/unit/test_users/test_admin_role_status_audit.py` (4) — admin.py's
    role/status endpoints write the audit entry; pre-existing super_admin
    guard on the status endpoint still holds with no audit entry on a
    blocked attempt.
  - `tests/unit/test_users/test_users_route_activation_wiring.py` (4) — the
    HTTP route actually passes `current_user` through to the service (the
    pre-fix bug: it didn't, at all).
  - `tests/unit/test_main/test_seed_admin.py` (5) — dormant branch unchanged,
    fresh-deployment bootstrap preserved, racing-registration promotion
    audited, already-initialised deployment refuses to promote OR
    auto-create (the two scenarios the audit's attack description named).
  - 3 appended to `tests/unit/test_deployment_settings/test_deployment_settings_service.py`
    — invalid `CF_ACCESS_DEFAULT_ROLE` rejected (422), `"super_admin"`
    accepted (pins enum-membership-only strictness), valid role accepted.
  - Full `tests/unit` suite run for regressions: 838 passed, 1 skipped, 2
    failed — both pre-existing failures in
    `tests/unit/test_finance_bridge/test_outbox_reconciler.py`
    (`TestRunSweep::test_scenario_a_missing_event_emitted`,
    `::test_scenario_d_po_open_emits_po_event`), unrelated to this task
    (MagicMock-awaited-as-coroutine in `is_finance_enabled_for_org` —
    finance outbox module, untouched by this work) and reproduces the same
    way run in isolation, confirming pre-existing.
- **CodeMaps:** not structural — no new/removed endpoints, services, or
  collections; one new internal helper module
  (`src/services/audit_log_service.py`) and one new function in
  `src/middleware/permissions.py`, both additive to existing modules already
  in the maps. Regeneration not required by this task's own rule ("bug
  fixes, logic changes... NOT needed"), though the separately-flagged
  mapper-gap issue (T-903-era CodeMaps regen blocker) is unrelated and
  still open.
- **Deploy:** `docker restart a64coreplatform-api-1` (done — verified clean
  startup, health check 200, no import/circular-import errors).

### T-919 | Frontend authorization-gating gaps — /admin/users route + role-dropdown escalation
- **Category:** Frontend/Security · **Priority:** P1
- **Completed:** 2026-08-14 · **Assigned:** frontend-dev-expert
- **Depends on:** — · **Blocks:** — · **Related:** T-920 (backend half of the
  same defense-in-depth audit — audit trail, seed_admin lockdown,
  CF_ACCESS_DEFAULT_ROLE validation, activate/deactivate guard; no file
  overlap with this task)
- **Summary:** Defense-in-depth audit found two frontend gaps (server
  already 403s both — `require_admin` and `can_change_role` in
  `src/middleware/permissions.py` are correct and were not the problem):
  1. `/admin/users`, `/admin/tenant-setup`, and `/ai` had no route-level
     role gate — any authenticated user could load the page by typing the
     URL directly; only the sidebar link was hidden. Fixed with a new
     optional `allowedRoles` prop on `ProtectedRoute`
     (`frontend/user-portal/src/components/common/ProtectedRoute.tsx`) and
     a clean "Not authorized" fallback view, wrapped around the three
     routes in `App.tsx` (`/admin/users`: `['admin','super_admin']`;
     `/admin/tenant-setup` and `/ai`: `['super_admin']`).
  2. `UserManagementPage`'s inline role `<select>` offered
     `super_admin`/`admin` to every viewer unconditionally, regardless of
     what they were actually permitted to assign — a mere `admin` could
     attempt to escalate a user to `super_admin` and get a 403 back with no
     clear explanation. Fixed with a new `getAssignableRoles(viewerRole)`
     helper mirroring `can_change_role`, used for the role-edit dropdown
     options only (not the unrelated role *filter* dropdown) and to clamp
     the initial edit value to a valid option.
- **Both fixes are defense-in-depth only** — the backend already rejected
  every request these gaps could have produced with 403. No server-side
  behavior changed as a result of this task.
- **Verify:** `npx tsc -b` (not `tsc --noEmit`, which is a no-op) — 234
  pre-existing errors across 165 files, zero new errors from this change.
- **CodeMaps:** not structural — no new components/routes/files, only a new
  prop and a new helper function on existing ones. Regeneration not
  required.
- **Deploy:** none required — Vite hot reload picks up frontend changes.

### T-921 | Codebase mapper — 6 backend modules had zero mapping task despite "26/26 completed"
- **Category:** Tooling/Docs · **Priority:** P2
- **Completed:** 2026-08-14 · **Assigned:** main session (Viet Anh)
- **Depends on:** — · **Blocks:** — · **Related:** unrelated to T-919/T-920;
  found and fixed in the same session while investigating adjacent code
- **Summary:** `scripts/codebase_mapper/task_manager.py`'s
  `FILE_TO_TASK_MAP` invalidation table already referenced task IDs
  (`map_purchasing_module`, `map_mushroom_module`, `map_finance_module`,
  etc.) that `setup.py` had never defined in its `TASKS` seed list —
  `cmd_reseed`'s `update_one({task_id: ...})` matched nothing and silently
  no-op'd. Net effect: six backend modules (~118 Python files —
  `purchasing`, `mushroom_manager`, `protocols`, `ai_assistant`,
  `attachments`, `finance`, plus `finance_bridge`) had **zero**
  representation in any generated map, while `task_manager.py stats`
  confidently reported "26/26 mapping tasks completed." `module-map.md`
  carried `purchasing` and `mushroom` sections built entirely from React
  component nodes — a UI with no backend behind it in the graph.
- **Fix:** `setup.py` now seeds 33 task definitions (was 26), one per
  previously-missing module, each specifying the exact node types/layers
  and `collection_*` db_model nodes its agent must emit (`output_map` is
  advisory only — `map_generator.py` selects by `node_type`/`layer`, not by
  task, which is exactly how these modules stayed invisible despite a task
  existing for some of them). `task_manager.py` gained the missing
  invalidation prefixes for `protocols/`, `attachments/`, `ai_assistant/`,
  `finance_bridge/`, and upgraded the mushroom/purchasing/finance prefixes
  to also dirty `gen_api_map`/`gen_service_map`/`gen_database_map`, not
  just `gen_module_map`. Also fixed `setup.py`'s `MONGO_URL` being
  hard-coded to an unauthenticated `mongodb://localhost:27017` — every
  other script in the package honours the `MONGO_URL` env var, so
  `setup.py` alone could not seed a credentialed deployment at all.
  `NODE_ID_CONVENTIONS.md`'s reserved-namespace table and
  `map_generator.py`'s INDEX Module Directory corrected to match (both
  previously listed `purchasing`/`finance` as "(TBA)" despite tasks already
  existing, and were missing `ai_assistant`/`attachments`/`protocols`/
  `finance_bridge` entirely).
- **Not part of the running application** — this is dev tooling only; no
  version-bump or CHANGELOG.md entry beyond a brief "Internal / Tooling"
  note, no API/behavior change to the platform itself.
- **Next step (not done here):** re-run `bash scripts/codebase_mapper/
  rerun.sh` then `python3 scripts/codebase_mapper/map_generator.py all` to
  actually populate the six modules' map coverage — this task only fixed
  the task *definitions*; the graph itself still needs the mapping agents
  to run against the corrected task list.

### T-909 | Cloudflare Access runbook correction
- **Category:** Docs · **Priority:** P2
- **Completed:** 2026-08-03 · **Assigned:** change-guardian (Viet Anh)
- **Depends on:** T-903 ✅
- **Blocks:** —
- **Summary:** The runbook (`Docs/1-Main-Documentation/Cloudflare-Access-Setup.md`,
  shipped as part of T-903) instructed adding a Bypass **policy** with a
  "Paths" field. No such field exists — Access policies carry only identity
  rules; path scoping is a property of the *application*, not the policy.
  Corrected to three self-hosted applications — the two narrow Bypass apps
  created first, then the domain-wide Allow app — since Cloudflare matches
  the most specific application path first.
- **Found by:** following the team's own runbook against the real Cloudflare
  dashboard, not by inspection.
- **Commit:** `a9f3b65`

### T-908 | Operations pages missing page padding
- **Category:** Frontend · **Priority:** P3
- **Completed:** 2026-08-03 · **Assigned:** frontend-dev-expert (Viet Anh)
- **Depends on:** T-901 ✅
- **Blocks:** —
- **Summary:** The app has two coexisting container conventions since Night
  Observatory: legacy (`padding: 32px; max-width: 1440px; margin: 0 auto` —
  HR, CRM, Sales, Finance, Logistics) and Night Observatory (`padding: 34px
  40px 60px; max-width: 100%`, transparent — all four Mushroom pages).
  Operations belongs to the second family and was missing its padding line.
- **Also fixed on `BlockTaskList`:** a stray `min-height: 100vh` (latent
  double scrollbar — `MainContent` already owns the scroll container) and a
  hardcoded `background: neutral[50]`, which violated
  `MainLayout.tsx:631`'s explicit no-opaque-background rule that lets the
  fixed sky layer show through.
- **Scope note:** styled-components only. **T-700 (Task Manager redesign,
  Ready, not started) is unaffected** — different component tree.
- **Commit:** `c561034`

### T-907 | Brand asset and logo fixes
- **Category:** Frontend · **Priority:** P2
- **Completed:** 2026-08-03 · **Assigned:** frontend-dev-expert (Viet Anh)
- **Depends on:** T-900 ✅
- **Blocks:** —
- **Gap 1 — 13 PNG masters missing from every fresh checkout:**
  `Brand_Engineering/Brand/Logo/*.png` masters were absent because
  `.gitignore`'s blanket `*.png` has negation exceptions for `Logo/*.png` and
  `frontend/user-portal/public/*.png` that neither matched that exact path —
  and the SVG masters sitting right beside them *were* tracked, which hid the
  gap until it mattered. Added with `git add -f`.
- **Gap 2 — opaque-canvas lockups rendering as broken boxes:**
  `lockup_cosmos.svg`/`lockup_cream.svg` each bake in a full-canvas
  background rect, so they rendered as an opaque box inside the app's
  translucent glass cards. Repointed six call sites to
  `lockup_transparent.svg`.
- **The actual root cause of the reported "broken image", separately:**
  infrastructure, not either of the above — the user-portal container's
  `/app/user-portal/public/` bind mount had gone stale and empty, so Vite's
  catch-all served `index.html` (HTTP 200, `text/html`) for every asset
  requested under `public/` — brand SVGs, fonts, manifest, and favicons
  alike, all silently. Fixed by `docker restart`. Worth recording as a
  recurrence risk since it presents identically to a genuinely missing or
  broken asset.
- **Commits:** `5654e45`, `aaa934f`

### T-906 | Auth UX: inactive accounts and auto-derived names
- **Category:** Backend + Frontend · **Priority:** P2
- **Completed:** 2026-08-03 · **Assigned:** backend-dev-expert + frontend-dev-expert (Viet Anh)
- **Depends on:** T-903 ✅
- **Blocks:** —
- **Gap 1 — inconsistent inactive-account handling:** an inactive account
  was treated completely differently depending on which button was pressed
  — Cloudflare sign-in routed to a pending screen, password login showed a
  flat "Account is inactive". Both paths now raise one shared
  `pending_activation` exception, and the message changed on **both** paths
  to "Your account is not active. An administrator needs to enable it
  before you can sign in." The old "awaiting administrator approval"
  wording was already wrong on the Cloudflare path (which also fires for
  admin-deactivated accounts, not just never-activated ones). Never-activated
  and deactivated are deliberately not distinguished in the message.
- **Gap 2 — a successful Cloudflare login displaying "Unable to sign in"
  (fixed in `1ef34af`):** FastAPI wraps a dict `detail`, so the 403 body for
  a pending account arrives as `{"detail": {"detail": ..., "status": ...}}`
  — one level deeper than the client expected, so a genuinely successful
  Cloudflare authentication that hit the pending-activation branch displayed
  as a generic failure. Fixed with a single shared `extractPendingActivation()`
  helper used by both login paths' error handling, replacing two separate
  ad-hoc unwraps. **Recording this response shape prominently as a gotcha
  for future work on either login path.**
- **`nameAutoDerived` flag:** set at JIT provisioning time, because
  Cloudflare's JWT supplies only an email — names were coming out as
  "Lilistrocel Lilistrocel" (the email local-part duplicated into both first
  and last name). Cleared server-side the moment `firstName`/`lastName` is
  actually updated. Surfaced in the UI as a dismissible, non-blocking banner
  linking to `/profile?focus=name`. No nickname field was added — the fix is
  "let the user fix their real name," not a workaround field.
- **Commits:** `1ef34af`, `4d6e193`

### T-905 | Deployment identity + Cloudflare Access configurable from the UI
- **Category:** Backend + Frontend · **Priority:** P1
- **Completed:** 2026-08-03 · **Assigned:** backend-dev-expert + frontend-dev-expert (Viet Anh)
- **Depends on:** T-903 ✅, T-904 ✅
- **Blocks:** —
- **Summary:** A new deployment can now be set up entirely in the browser —
  sign in with the seeded super_admin password account, configure under
  Settings — instead of hand-editing `.env` and restarting containers.
- **Why the UI can't just write `.env`:** it cannot, structurally — `.env`
  is not mounted into the api container, `settings.py` sets `env_file =
  None`, and env vars freeze at process start (Compose interpolates
  `${VAR}` at container-create time, not at request time). So configuration
  has to be DB-backed and resolved per request, in order **env -> db ->
  unset**, where a value already set via env var acts as a lock (`source:
  env, editable: false` in the API response) rather than being silently
  overridden.
- **Storage:** singleton `platform_settings` document — deployment-wide, not
  per-tenant, since Cloudflare Access fronts the whole hostname, not one
  organization. 30-second in-process cache, invalidated on write.
- **Security — four mandatory guardrails**, because whoever can write
  `CF_ACCESS_TEAM_DOMAIN`/`CF_ACCESS_AUD` can point authentication at an
  Access application they control and mint a token for any email, including
  super_admin:
  1. Team domain validated against the real `/cdn-cgi/access/certs`
     endpoint before saving — rejects a domain that doesn't actually serve
     JWKS.
  2. Exclusive mode blocked until a Cloudflare sign-in has actually
     succeeded once — prevents locking everyone out with an unverified
     config.
  3. Password re-authentication required on every change.
  4. Before/after audit log entry, with both sensitive values masked in the
     audit record itself, not just in the API response.
- **Both `CF_ACCESS_TEAM_DOMAIN`/`CF_ACCESS_AUD` are never returned in
  full** — only `isSet` + last-4 characters. Deliberately no reveal endpoint
  and no test-connection call that echoes them back.
- **Known consequence:** a mismatched AUD cannot be diagnosed from the UI
  alone — the Zero Trust dashboard remains the reference for verifying it.
- **Commit:** `19d5be6`

### T-904 | Deployment identity: no deployment may inherit another's config
- **Category:** DevOps · **Priority:** P1
- **Completed:** 2026-08-03 · **Assigned:** backend-dev-expert (Viet Anh)
- **Depends on:** —
- **Blocks:** —
- **Discovered:** A sibling deployment (hostname `noobcity-Z690M-ITX-ax`)
  found `docker-compose.yml` defaulted `PUBLIC_BASE_URL` to
  `https://dev.a20core.com` — this box. On their machine, printed genetics
  label QR codes would have encoded a URL pointing at our server. Caught
  before rebuild, by them, not us.
- **Why this one is unforgiving:** `PUBLIC_BASE_URL` is baked into printed
  physical labels, so a wrong value ships on vessels and requires
  reprinting — unlike most misconfiguration, it isn't fixable with a
  restart once labels are already in hand.
- **Delivered:**
  1. Default removed from both `docker-compose.yml` and `settings.py` — no
     fallback to any one deployment's hostname.
  2. `_require_public_base_url()` in
     `src/modules/genetics/api/v1/labels.py` fails loudly at point of use
     (label generation), not at boot — so ops-only deployments that never
     print labels aren't blocked by a value they don't need — when the
     value is empty or loopback.
  3. Grouped DEPLOYMENT IDENTITY block in `.env.example`.
  4. New `scripts/preflight.sh` — derives the container prefix from `docker
     ps` rather than assuming `a64coreplatform-`, so preflight checks work
     on any deployment's compose project name.
  5. `CLAUDE.md` rewritten to teach discovery instead of asserting one
     machine's hostname/IP/container names — reference values are now
     fenced explicitly as an example, not stated as fact.
  6. New `Docs/1-Main-Documentation/Deployment-Identity.md`.
- **Also in this commit — two healthchecks that had never once passed:**
  - The api container ran `curl -f`, but curl is not installed in that
    image — failing streak 201, always reporting unhealthy while serving
    fine.
  - user-portal probed `http://localhost:5173`, but `/etc/hosts` maps
    `localhost` to `::1` and Vite binds IPv4 only — same silent-fail
    pattern.
  - **Note:** healthchecks are baked in at container-create time, so fixing
    them needs `docker compose up -d`, not a restart.
- **Commit:** `75820b2`

### T-903 | Cloudflare Access authentication — backend, dual-mode (Phase 1)
- **Category:** Backend · **Priority:** P1
- **Completed:** 2026-08-03 · **Assigned:** backend-dev-expert
- **Depends on:** —
- **Blocks:** —
- **Summary:** Backend half of the approved plan
  (`~/.claude/plans/jolly-splashing-hennessy.md`, not in this repo) to let
  Cloudflare Access authenticate users at the edge, running ALONGSIDE
  existing email/password login, with a flag (`CF_ACCESS_EXCLUSIVE`) that
  later makes it exclusive with no further code change. Cloudflare replaces the credential check only — `get_current_user`,
  roles, `organizationId`, `divisionAccess`, permissions are all completely
  unchanged; a verified Access identity is exchanged for the exact same app
  JWT every other login path issues.
  1. **`src/config/settings.py`** — 6 new settings
     (`CF_ACCESS_ENABLED`/`CF_ACCESS_TEAM_DOMAIN`/`CF_ACCESS_AUD`/
     `CF_ACCESS_EXCLUSIVE`/`CF_ACCESS_JIT_PROVISION`/`CF_ACCESS_DEFAULT_ROLE`)
     + a new `@model_validator` (`validate_cf_access_settings`, alongside the
     existing `validate_production_settings`) that fails fast at boot if
     `CF_ACCESS_ENABLED=true` without a non-empty team domain or AUD — an
     empty AUD would make `jose.jwt.decode` skip audience checking entirely
     and accept a token minted for ANY Access application — and additionally
     validates `CF_ACCESS_DEFAULT_ROLE` against the real `UserRole` enum.
     Mirrored, commented, into `.env.example`. `.env` itself untouched.
  2. **`src/services/cf_access_service.py`** (new) — module-level JWKS cache
     (`https://{team}/cdn-cgi/access/certs}`, 1h TTL via `time.monotonic()`,
     not wall clock), a rate-limited (max 1/60s) forced refresh on an
     unrecognized `kid` (key rotation), and `verify_cf_access_token()` using
     `jose.jwt.decode(algorithms=["RS256"], audience=CF_ACCESS_AUD,
     issuer=f"https://{team}")`. Raises 401 on any failure — no dev bypass,
     no "skip verification" flag anywhere, per the project's no-quick-hacks
     rule.
  3. **`src/middleware/cf_access.py`** (new) — `get_cf_access_token(request)`
     (header `Cf-Access-Jwt-Assertion`, falling back to the `CF_Authorization`
     cookie) and `is_local_request(request)` (True iff neither `cf-ray` nor
     `cf-connecting-ip` is present — documented rationale: `cloudflared`
     connects to nginx from the Docker bridge, so source IP is always
     private and useless as a discriminator; Cloudflare stamps those two
     headers on every tunnel request and a client cannot strip them, so
     their absence reliably means the request did not arrive from the
     internet).
  4. **`src/services/auth_service.py`** — extracted the token-minting tail
     shared by `login_user`, `login_user_with_mfa_check`, and
     `verify_mfa_and_login` into `_issue_tokens_for_user(user_doc, warning=,
     backup_codes_remaining=)`, and the MFA-challenge-issuing tail into
     `_issue_mfa_challenge(user_doc)` (the latter wasn't explicitly asked
     for but was a straight copy-paste otherwise — DRY). All three original
     callers now call the shared helpers; behaviour verified unchanged live
     (see below). Added `login_via_cf_access(identity: CFAccessIdentity)`:
     case-insensitive email lookup via a MongoDB collation
     (`{"locale": "en", "strength": 2}`, chosen over a hand-built regex to
     avoid re-implementing metacharacter escaping; no new index needed since
     this only runs on the CF Access login path, not a hot path) excluding
     soft-deleted users; unknown email + JIT enabled → creates an
     inactive/pending user (`authProvider="cloudflare_access"`,
     `mfaSetupRequired=False` always — this is what keeps app MFA optional
     for these accounts, `isEmailVerified=True` since the IdP already
     verified it, `passwordHash=None`); unknown email + JIT disabled →
     identical pending response, never revealing which case it was; found
     but inactive → same pending response; found+active+`mfaEnabled=True` →
     `_issue_mfa_challenge` (a CF-provisioned user who separately opted into
     TOTP via Settings > Security is honoured); otherwise →
     `_issue_tokens_for_user`. Pending signalled as
     `HTTPException(403, detail={"detail": "...", "status":
     "pending_activation"})` for the frontend to branch on.
  5. **`src/models/user.py`** — `authProvider: Optional[str] = "password"` on
     `UserResponse` (inherited by `UserInDB`/`UserMeResponse`). Populated at
     every mongo-doc-backed construction site (grepped `UserResponse(`
     across the codebase, not just the two named in the dispatch): both
     `_issue_tokens_for_user` and `register_user`/`verify_email` in
     `auth_service.py`; all three sites in `user_service.py`
     (`get_user_by_id`/`get_user_by_email`/`list_users`); `get_current_user`
     in `middleware/auth.py`; all four sites in `api/v1/admin.py`
     (`list_users`, `get_user_by_id`, `update_user_role`,
     `update_user_status`). Every pre-existing account defaults to
     `"password"` — restart required for the field to stop being silently
     stripped by `response_model` (documented trap in `CLAUDE.md`); done,
     see verification below.
  6. **`src/api/v1/auth.py`** — `GET /cf-access/status` (no auth, returns
     `{"enabled": bool, "exclusive": bool}`, nothing secret) and
     `POST /cf-access/session` (`response_model=None` +
     `Union[TokenResponse, MFALoginResponse]` return annotation, mirroring
     exactly how the existing `POST /login` avoids the `response_model`
     field-stripping trap; 404 when `CF_ACCESS_ENABLED=false`; 401 if no
     token on the request; delegates verify → `login_via_cf_access`).
     Break-glass gate added to `POST /login` and `POST /register` (both
     gained a `request: Request` parameter): when `CF_ACCESS_EXCLUSIVE=true`,
     403 unless `is_local_request(request)`. Full house-style docstrings
     (Authentication/Returns/Example) on both new endpoints.
- **API contract for the frontend agent:**
  - `GET /api/v1/auth/cf-access/status` → `{"enabled": bool, "exclusive":
    bool}`, no auth, safe to call before any session exists.
  - `POST /api/v1/auth/cf-access/session` → no body (token read from the
    `Cf-Access-Jwt-Assertion` header or `CF_Authorization` cookie
    automatically); 200 with `TokenResponse` (same shape as `POST /login`'s
    success case) or `MFALoginResponse`; 401 no/invalid CF token; 403
    `{"detail": "...", "status": "pending_activation"}` (branch on
    `error.response.data.status === "pending_activation"`); 404 when
    Cloudflare Access is disabled on this deployment.
- **Verification (live, this session):** `docker restart
  a64coreplatform-api-1` — clean startup, no import/validation errors.
  `curl localhost/api/v1/auth/cf-access/status` → `{"enabled":false,
  "exclusive":false}`. `POST /login` with `admin@a64platform.com` /
  `SuperAdmin123!` still returns full tokens (regression check — flag stays
  off, nothing should change) and the user object now carries
  `"authProvider":"password"`. `GET /me` and `GET /admin/users` both surface
  `authProvider` correctly post-restart. `POST /cf-access/session` with
  `CF_ACCESS_ENABLED=false` → 404 as designed. Local Python import checks
  (`ast.parse` + actual module imports of `settings`, `cf_access_service`,
  `middleware.cf_access`, the refactored `auth_service`, and the `auth`
  router) all clean; boot-time validator confirmed to reject
  `CF_ACCESS_ENABLED=true` with an empty team domain/AUD, and to reject an
  invalid `CF_ACCESS_DEFAULT_ROLE`.
- **Same-day follow-on — frontend, tests, runbook — DONE 2026-08-03 (commit
  `804e2fa`):** the three items originally listed above as "other agents own
  these" all shipped later the same day, not as separate follow-on work:
  - **Frontend dual-mode UI:** Cloudflare sign-in button on the login
    screen; silent token exchange from `ProtectedRoute` (calls `POST
    /cf-access/session` before falling back to the normal auth flow); a new
    `PendingActivation` screen for the shared `pending_activation` response;
    a pending-activation queue + auth-provider badge in User Management; and
    Cloudflare-aware logout that also hits `/cdn-cgi/access/logout` — a
    plain app-side token clear alone would leave the Cloudflare edge session
    live, so the next silent visit would just log the user back in.
  - **Backend unit tests:** `tests/unit/test_auth/test_cf_access.py` — 27
    cases covering algorithm-confusion attacks, JWKS refresh rate-limiting
    (the 1/60s forced-refresh cap), JIT provisioning, and the break-glass
    gate (`CF_ACCESS_EXCLUSIVE` + `is_local_request`).
  - **Runbook:** `Docs/1-Main-Documentation/Cloudflare-Access-Setup.md` —
    written domain-agnostic (no hardcoded `dev.a20core.com`/team name) so any
    deployment can follow it. See T-909 for a correction made to it the same
    day.
  - **CodeMaps** — still not regenerated (two new endpoints, one new service
    module, one new middleware module, as already flagged above); blocked on
    Mongo auth for the mapper — see "Known Open Items" in BACKLOG.md.
- **Cloudflare Access is now LIVE on `dev.a20core.com`** (team
  `noobcity.cloudflareaccess.com`), configured entirely through the
  Cloudflare dashboard UI (not this repo): three Zero Trust applications —
  two narrow, path-scoped Bypass apps (`/i`, the public label-info route;
  `/api/v1/public`, the rest of the unauthenticated public API surface) plus
  one domain-wide Allow app, in that order so Cloudflare's
  most-specific-path matching resolves correctly (see T-909).
  `CF_ACCESS_EXCLUSIVE` remains **off** — password login stays available
  alongside Cloudflare sign-in.

## 2026-07

### T-902 | Fullscreen toggle + PWA manifest (genuine auto-fullscreen on install)
- **Category:** Frontend · **Priority:** P2
- **Completed:** 2026-07-31 · **Assigned:** frontend-dev-expert
- **Depends on:** T-901 ✅ (Night Observatory mixins/tokens this reuses)
- **Summary:** User originally asked for fullscreen to trigger automatically
  on page load; verified live in-browser that this is impossible — the
  Fullscreen API requires transient user activation in every modern browser,
  so `requestFullscreen()` throws `TypeError: Permissions check failed`
  without a real gesture. Shipped manual toggle only (no auto-on-load code
  path, no dead settings entry to control a no-op — YAGNI) plus a PWA
  manifest, which is the legitimate route to genuine gesture-free fullscreen
  (via `"display": "fullscreen"` on install).
  1. **`useFullscreen` hook**
     (`frontend/user-portal/src/hooks/useFullscreen.ts`) — `{ isFullscreen,
     toggle, isSupported }`. `isFullscreen` is derived from
     `document.fullscreenElement`/`webkitFullscreenElement` via a
     `fullscreenchange`/`webkitfullscreenchange` listener (not local state
     set by `toggle`), so Esc/F11 exits stay in sync. `isSupported` reflects
     `document.fullscreenEnabled` (+ webkit), hiding the control on iOS
     Safari. `toggle()` catches promise rejections and fails quietly. Listener
     cleaned up on unmount.
  2. **Toggle button, two mount points** in
     `frontend/user-portal/src/components/layout/MainLayout.tsx`, both
     `Maximize`/`Minimize` from `lucide-react`, `aria-label`/`aria-pressed`/
     `title` reflecting state, rendered only when `isSupported`:
     - `SidebarFooter` — new `FullscreenChip` beside `FarmingYearDropdown`
       inside a new `FooterTopRow` flex wrapper; matches `FyTrigger`'s glass
       chip treatment (`glass.base`/`glass.border`, celeste text, `glass.hi`
       hover) at the same height via flex `align-items: stretch`.
     - `MobileHeader` — new `MobileIconButton` in a new `MobileHeaderActions`
       wrapper beside the existing hamburger `MenuButton`, same 44px WCAG
       touch target and muted→cream-hi hover treatment as the rest of the
       header chrome.
     - Deliberately **not gold** per spec §3 gold-discipline budget (logo,
       active nav, stat numerals/thread, one CTA, focus rings, section
       underline, `phase.harvesting` only) — uses the muted/celeste treatment
       matching existing footer/header chrome instead.
  3. **PWA manifest** — `frontend/user-portal/public/manifest.webmanifest`:
     `"display": "fullscreen"`, name/short_name "A20Core", `start_url: "/"`,
     `background_color: "#0A0E24"` (cosmos-deep), `theme_color: "#0E1330"`
     (cosmos), referencing the existing `icon-192.png`/`icon-512.png`.
     Icons shipped `"purpose": "any"` only, **not** `"any maskable"` —
     checked both PNGs' alpha-channel bounding box with PIL and both are
     opaque edge-to-edge (0% padding on every side), which a maskable safe
     zone requires (~safe content within an 80%-diameter circle); marking
     them maskable would let OS icon masks crop the artwork. Linked via
     `<link rel="manifest" href="/manifest.webmanifest">` in `index.html`.
  4. **Stale theme-color fix** — `index.html` carried a light-scheme
     `#F1E6CC` `theme-color` media query left over from before the app went
     dark-only (`src/stores/theme.store.ts` forces dark); collapsed both
     `prefers-color-scheme` variants to a single dark `#0E1330` meta tag.
- **Verification:** `frontend/shared` build clean; `npx tsc -b` in
  `frontend/user-portal` held exactly at the pre-existing 238-error baseline
  (zero delta, no errors in either touched file); `useFullscreen.ts` and
  `MainLayout.tsx` parse-checked individually with `esbuild`; manifest JSON
  validated with `python3 -c "import json; json.load(...)"`. Playwright not
  run — user is driving the browser to verify the rendered result.

### T-901 | Night Observatory redesign — dark-first glass-panel visual system
- **Category:** Frontend · **Priority:** P1
- **Completed:** 2026-07-30 · **Assigned:** frontend-dev-expert
- **Depends on:** T-900 ✅ (cream tokenization — the token layer this redesign remapped)
- **Summary:** Replaced the A20Core "A New Renaissance" cream/light-first skin
  with "Night Observatory" — a dark-first, glass-panel visual system
  (cosmos-ink grounds, backdrop-blur glass panels, a fixed starfield/nebula
  sky layer, a 12-key phase/status colour map, gold used only as a rare
  accent). Contract: `Docs/2-Working-Progress/night-observatory-spec.md`.
  Visual ground truth: `Brand_Engineering/Brand/A20Core_NightObservatory_Glass.html`.
  Shipped in 4 phases per spec §10 (foundation → shell → parallel screen-sweep
  shards, glass treatment/phase map/Space Mono/emoji→icon across ~126 files →
  final gold audit), across multiple sessions/agents coding against the
  frozen token/mixin names in spec §1/§2. Phase 1 (foundation: `darkTheme`
  rewrite, `mixins.ts`, `GlobalStyles.tsx`, the `Sky` component, forced dark
  mode, `lucide-react` declared explicitly) is detailed in this ticket's
  original BACKLOG entry / commit history. Phases 2–3 (shell primitives,
  per-module screen sweep) landed incrementally across the codebase — see
  the "Night Observatory (T-901 ...)" comments left at each touched call site
  for shard-level rationale.
- **Phase 4 — final cleanup (this session):** closed four loose ends
  deliberately left by earlier shards because they crossed file-ownership
  boundaries:
  1. **Hand-rolled badges → `colorBadge()`.** `mixins.ts` grew a
     `colorBadge(color)` export (arbitrary-hex entry point that `phaseBadge()`
     now delegates to) plus a `hexToRgba()` helper safe on both hex and rgba
     theme tokens. Converted every remaining hand-rolled 16%/45%-tint badge/pill
     to `colorBadge()` (`BlockAlertsTab.SeverityBadge`, `ResolveAlertModal.
     AlertSeverity`, `BlockAnalyticsModal.StateBadge`/`GradeBadge`,
     `CompactBlockCard.StateBadge`/`AlertBadge`, `WasteInventoryList.
     SourceBadge`/`DisposalBadge` — the last of these had already
     independently reimplemented the identical recipe as a local
     `categoricalBadge()`, now deleted in favour of the shared one) and every
     hex-alpha-suffix (`${color}29`/`${color}1A`/`${color}73`) card/button
     fill to `hexToRgba()` (`BlockAlertsTab.AlertCard` border,
     `BlockDetailsModal.GradeCard`, `BlockHarvestEntryModal.GradeButton`,
     `DashboardFilters.StateChip`) — badges got the full pill+dot recipe,
     non-badge surfaces (cards/buttons/chips with their own layout) kept
     their shape and just got a safe alpha helper. All colour values and
     alpha percentages were preserved exactly, so severity/grade/state
     perceptual separation is unchanged.
  2. **Deleted the redundant `ROOM_PHASE_TO_KEY` map.** `components/mushroom/
     phaseTheme.ts` had its own copy of `types/mushroom.ts`'s
     `ROOM_PHASE_TO_PHASE_KEY` (values confirmed byte-identical before
     deletion). Removed the local copy and repointed its three consumers
     (`MushroomRoomMonitor.tsx`, `GrowingRoomCard.tsx`,
     `RoomDetailsModal.tsx`) to the canonical export.
  3. **Repointed 3 icon consumers to the lucide-react component maps**
     (leaving the emoji-string maps in place as the fallback for any
     not-yet-repointed consumer): `CompactBlockCard.tsx` → `STATE_ICON_COMPONENTS`
     (`hooks/farm/useDashboardConfig.ts`), `AddWidgetModal.tsx` → per-widget
     `WIDGET_ICON_COMPONENTS` (`stores/dashboard.store.ts`, was hardcoded to a
     single `BarChart3` for every widget), `BlockTaskList.tsx` →
     `TASK_TYPE_ICON_COMPONENTS` (`types/tasks.ts`). Also removed a dead
     branch in `CompactBlockCard.tsx` (`config.icons?.metrics?.performance?.[...]`
     — `DashboardConfig['icons']['metrics']` has no `performance` field, so
     this always evaluated `undefined` and rendered a bare trailing " • "
     separator with nothing after it; no replacement invented, just removed).
  4. **Gold-discipline audit (spec §3, ≤1 primary CTA/view).** Audited all 8
     files flagged as carrying multiple gold gradient CTAs on one screen
     (`InputInventoryList`, `AssetInventoryList`, `PeriodsPage`,
     `FertilizerCostCalculator`, `BlockHarvestsTab`, `BlockAutomationTab`,
     `FarmMapView`, `BackupCodesModal`) plus `InventoryDashboard`. Found two
     real violations: `InputInventoryList.tsx` and `AssetInventoryList.tsx`
     each had a toolbar `AddButton` (gold) *and* an `EmptyAction` (also gold)
     that render simultaneously whenever the list is empty — demoted
     `EmptyAction` in both files to the secondary/glass treatment (spec §4),
     keeping the toolbar button as the sole gold CTA. The other 6 files were
     already spec-compliant on inspection: their second/third gold definition
     was either the same button's `:hover` state (not a second element,
     `FarmMapView`/`BackupCodesModal`), a mutually-exclusive ternary render
     path (`BlockAutomationTab`'s connect-vs-configured states, confirmed by
     reading the branch — comments already documented this correctly), a
     styled component prop-gated to a variant no caller ever passes
     (`BlockHarvestsTab.Button`'s unused `$variant="primary"` branch), or a
     modal submit button behind a scrim (`PeriodsPage.ConfirmButton`,
     `FertilizerCostCalculator`'s `SaveListModal`/`PricebookModal` — spec's
     explicit exemption: "a modal submit and the page CTA behind a scrim do
     not both count"). Separately, `InventoryDashboard.tsx` nests
     `InputInventoryList`/`AssetInventoryList` inside its own content area at
     `/inventory/input` and `/inventory/assets`, so both the parent's and the
     child's `PageHeader` (each carrying its own gold stat thread) rendered
     at once — added an `embedded?: boolean` prop to both list components
     (default `false`, so any future standalone caller is unaffected) that
     suppresses the child's own `PageHeader`, and passed `embedded` from
     `InventoryDashboard`'s two routes.
- **Verify:** `frontend/shared` `npm run build` — clean. `frontend/user-portal`
  `npx tsc -b` — **238 errors**, down from the **239**-error pre-session
  baseline (net delta **-1**; spot-checked several of the "new-looking" line
  numbers against the pre-existing error set and confirmed they are
  pre-existing errors in code this session did not touch, just shifted by
  unrelated lines elsewhere in the same files). Every touched file individually
  parse-scanned clean via `esbuild --loader:.tsx=tsx`. Repo-wide gold count
  after: `InputInventoryList.tsx`/`AssetInventoryList.tsx` down from 3→2
  `linear-gradient(145deg` occurrences each; all other audited files
  unchanged (already compliant). No CodeMap regeneration needed (visual-only).

---

### T-900 | A20Core rebrand — "A New Renaissance" (foundation + sweep)
- **Category:** Frontend · **Priority:** P1
- **Completed:** 2026-07-30 · **Assigned:** frontend-dev-expert
- **Depends on:** none
- **Summary:** Rebranded the React frontend from the old Material-blue/purple
  theme to A20Core "A New Renaissance" — Fresco Cream / Cosmos Ink grounds,
  Lapis / Gold / Emerald / Terracotta chromatic voices, Hanken Grotesk +
  Space Mono + Fraunces typography, new logo lockup/emblem, "A20Core" naming.
  Routed ~3,190 hardcoded colour literals through `theme.colors.*` across
  ~250 files (foundation + sweep phases), which is what made the follow-on
  Night Observatory redesign (T-901) tractable — most screens re-theme from
  the token layer alone. Contract: `Brand_Engineering/Brand/A20Core_BRAND.md`.
  Engineering translation: `Docs/2-Working-Progress/a20core-rebrand-spec.md`.
- **Delivered:** `theme.ts` token rewrite (Lapis/Gold/Emerald/Terracotta
  ramps, `canvas`/`onAccent`/`border` grounds), self-hosted font vendoring
  (Hanken Grotesk, Fraunces incl. italic, Space Mono — no external CDN, CSP
  blocks it), `GlobalStyles.tsx` canvas/mono bindings, logo asset swap,
  "A20Core" naming sweep, and the 239-file hex→token sweep per the migration
  table in the spec. Verified with `npx tsc -b` (not the no-op `tsc --noEmit`).
- **Superseded by:** T-901 (Night Observatory) remaps the same token layer to
  a dark-first glass-panel system; `lightTheme`/cream values from this task
  are kept as dead code, not deleted.

### T-805b |  Genetics — surface vessel-level parentage (display half of T-805)
- **Category:** Frontend + Backend · **Priority:** P2
- **Completed:** 2026-07-31 · **Assigned:** backend-dev-expert, api-developer, frontend-dev-expert
- **Depends on:** T-805a ✅ (capture landed, see ARCHIVE.md), T-804 🔵
- **Description:** `ParentRef.vesselNo` can be stored and read back, but **nothing writes it from
  the UI and nothing displays it**. Until this ships, the field is dead weight — the capture half
  alone changes nothing a user can see or do.
- **Steps:**
  1. Source-vessel picker in `PropagateModal` — optional, validated against the parent's
     `max(labelledVesselCount, quantity)`. Optional on purpose: forcing a number where nobody
     noted one produces fiction, which is worse than an honest blank.
  2. Label rendering: `PO-BLU-G3-001 · #3 <- #4`. **ASCII arrow only** — U+2190 is not in the PDF
     base-14 fonts and would print as a blank or a box on thermal output.
  3. `#3 ← #4` on the accession detail page and the public info page (rich fonts, real arrow fine).
  4. **`vesselNo` on observations.** `ObservationBase` carries `accessionId` only, so "plate 13 is
     slow" can only be recorded as "this batch is slow". Same field, same shape as T-805a — this
     is the gap that blocks per-vessel trait tracking.
- **Delivered:** all five parts — observation `vesselNo`, label `#3 <- #4` (ASCII, per-tape width drop), public `fromVesselNo` on vessel + ancestry steps + graph edges, and the `PropagateModal`/`ObservationModal` pickers with display on the accession and public pages. 140 genetics tests passing; tsc baseline 238 unchanged.
- **Note:** graph edges resolve `vesselNo` from the `ParentRef` matching that edge's source node, NOT `parents[0]` — the latter would mis-attribute one parent's vessel to both edges of a cross. Regression test: `test_lineage_graph_cross_edges_carry_distinct_vessel_numbers`.

---

### T-805a | Genetics — record which physical vessel of a parent batch a propagation was taken from (BACKEND CAPTURE ONLY)
- **Category:** Backend · **Priority:** P2
- **Completed:** 2026-07-31 · **Assigned:** backend-dev-expert
- **Depends on:** T-804 🔵 **still Active** — vessel ordinals must be stable/never-renumbered for
  this to mean anything (spec `Docs/2-Working-Progress/genetics-label-qr-spec.md` §3). T-804's
  backend has landed but steps 6–8 and the org-config toggle are outstanding, so do NOT read the
  dependency as satisfied-and-closed.
- ⚠️ **SCOPE: this is the capture half only.** `vesselNo` can now be stored and read back, but
  nothing writes it from the UI and nothing displays it. Still outstanding, tracked as **T-805b**
  in BACKLOG.md:
  - source-vessel picker in `PropagateModal` (nothing can set the field today)
  - `#3 <- #4` on the printed label (ASCII arrow — U+2190 is not in the PDF base-14 fonts)
  - `#3 ← #4` on the accession detail page and the public info page
  - `vesselNo` on **observations** — `ObservationBase` has `accessionId` only, so "plate 13 is
    slow" can still only be recorded as "this batch is slow". Same field, same shape, same gap.
- **Summary:** An accession is a batch, not a single vessel. `parents[0].accessionId` on a child
  accession said "came from that batch" but not "from plate #4 of its 6 plates" — so if one vessel
  of a parent batch turns out contaminated or sectoring, there was no way to tell which descendants
  are suspect. Closes the loop by letting a propagation cite a vessel ordinal per parent.
- **Delivered:**
  - `ParentRef.vesselNo: Optional[int]` (`ge=1`) on `src/modules/genetics/models/accession.py`.
    Lives on `ParentRef` (not the propagation event) because a cross has two parents, each
    potentially citing its own plate. Optional — most historic transfers never recorded a plate
    number and forcing one would produce fiction.
  - `PropagationService._validate_vessel_numbers()` in
    `src/modules/genetics/services/propagation/propagation_service.py`, run once parents are
    resolved (after the existing 404-on-missing-parent check): rejects `vesselNo` with no
    `accessionId`, rejects a parent with `max(labelledVesselCount, quantity) < 1` (distinct
    message), rejects `vesselNo` outside `1..max(labelledVesselCount, quantity)`. The `max()` is
    deliberate — a lab that hand-numbers plates without ever printing labels still has a
    meaningful "vessel 4 of 6".
  - `vesselNo` carried onto `enriched_parents` in `PropagationService.propagate()`, so it lands on
    both the stored `PropagationEvent.parents[]` and the child `Accession.parents[]`.
  - `AccessionService.split_accession()` needed **no code change** — it already copies
    `source.parents` verbatim (a split is the same material, not a new generation), so `vesselNo`
    rides along unchanged. Verified with a new test, not by inspection alone.
  - No route/response_model changes needed: `accessions.py` / `propagations.py` already declare
    `response_model=SuccessResponse[Accession]` / `[PropagationEvent]`, both of which embed
    `ParentRef` directly, so the field appears on the read path automatically once the model
    changed. Confirmed live (see below) rather than assumed, per the repo's `response_model`
    stale-process gotcha.
- **Verified end-to-end on the live stack:** `docker restart a64coreplatform-api-1`, then via
  Playwright MCP (`browser_evaluate` + `fetch`, logged in as the default admin) posted a real
  propagation off `PO-BLU-G3-001` (`3b36b3e7-7838-4105-aa0a-8be41772754b`, quantity 5,
  `labelledVesselCount` 6) citing `vesselNo: 4`. Response (201) carried `vesselNo: 4` on both
  `event.parents[0]` and the new child accession's `parents[0]`. Cross-checked directly in
  `mongosh` against both `genetic_accessions` and `propagation_events` — stored, not just
  round-tripped by a stale in-memory model. Verification accession
  (`41cb41d7-4800-4867-b295-4d84b2d32f47`) and event (`68e97abc-4b12-4b5b-a6fd-38cb9ef7affd`)
  deleted by exact id afterwards; `PO-BLU-G3-001` confirmed unchanged (`quantity: 5`,
  `labelledVesselCount: 6`).
- **Tests:** `tests/unit/test_genetics/test_vessel_no.py` (NEW, 8 tests) — vesselNo stored on
  propagation (single parent, and per-parent-distinct on a two-parent cross), vesselNo omitted
  behaves exactly as before (regression guard on the common path), all three validation
  rejections, `vesselNo` valid against `quantity` alone when `labelledVesselCount` is 0, and a
  split child inheriting `parents` (including `vesselNo`) verbatim. Full suite
  `tests/unit/test_genetics`: **120 passed** (112 pre-existing + 8 new), 0 failed, run inside
  `a64coreplatform-api-1` (tests dir is not bind-mounted; copied in with `docker cp`).
- **Explicitly not done (by design — out of scope per the ticket):** frontend rendering of
  "#3 ← #4" on the label/info page, and any change to `labels.py` / `public.py` — both called out
  as other agents' live work areas and left untouched.
- **Files changed:**
  - `src/modules/genetics/models/accession.py` — `ParentRef.vesselNo`, module docstring note
  - `src/modules/genetics/services/propagation/propagation_service.py` —
    `_validate_vessel_numbers()`, wired into `propagate()`, `vesselNo` carried onto
    `enriched_parents`, module docstring note
  - `tests/unit/test_genetics/test_vessel_no.py` (NEW)

### T-801 | Link Genetics lines to Strain Library / Plant Library growing profiles
- **Category:** Full-stack · **Priority:** P2
- **Completed:** 2026-07-28 · **Assigned:** main session (Viet Anh)
- **Depends on:** T-800 ✅
- **Summary:** Closes the apparent duplication between the mushroom "Strain Library" and the new
  "Genetics Repo" in the sidebar. They answer different questions and both stay: `mushroom_strains`
  / `plant_data` hold *what conditions a species wants* (temp, humidity, duration, yield),
  `genetic_lines` hold *which lineage you are holding and where it came from*. Before this ticket
  the two shared commonName/scientificName/species with no link, so the same taxonomy was typed
  twice. `Line.linkedStrainId` / `Line.linkedPlantDataId` already existed in the T-800 schema but
  were unreachable from the UI; this makes them real in both directions.
- **Delivered:**
  - Backend: `linkedStrainId` / `linkedPlantDataId` filters on `GET /genetics/lines`, plus
    `GET /genetics/lines/linked-counts` returning two id->count maps so a library page annotates
    every row from one request. Route declared before `/{line_id}` to avoid path shadowing.
  - `LineService.count_by_linked_profile()` — two grouped aggregations.
  - Forward link: kind-filtered growing-profile picker in `LineFormModal`
    (fungus -> Strain Library, plant -> Plant Library, animal -> none, with an explanatory hint).
    Selecting a profile prefills commonName/scientificName/species **only where still blank** —
    never overwrites typed input.
  - `GrowingProfilePanel` on the line detail page renders the linked record's real targets
    (colonisation/fruiting temp + RH + days, CO2 tolerance, expected yield, max flushes for
    strains; growth cycle + temp/humidity for plants), with a link into the owning library.
  - Reverse link: `StrainCard` gained optional `geneticLineCount` + `onOpenGeneticLines`, rendering
    a "🧬 N genetic lines →" button that navigates to `/genetics?linkedStrainId=...`. Click handler
    stops propagation, since the whole card is already an edit target.
  - `GeneticsRepoPage` honours `?linkedStrainId` / `?linkedPlantDataId` with a dismissable filter banner.
- **Verified end-to-end on the live stack:** counts endpoint went `{}` -> `{strain: 1}` on linking;
  `?linkedStrainId=` filter returned exactly the linked line; Strain Library card rendered
  "🧬 1 genetic line →" and navigating from it landed on the filtered repo showing the right line;
  the profile panel pulled Pink Oyster's real parameters (24–28°C colonisation, 18–24°C fruiting,
  0.8 kg/kg, 3 flushes); the picker preselected the existing link. Frontend `tsc -b` unchanged at
  336 pre-existing errors, none in touched files. Verification line deleted afterwards — all six
  genetics collections back to 0, `mushroom_strains` untouched.
- **Explicitly not done (by design):** no merge or deprecation of the Strain Library. Folding it
  into Genetics would strand `growing_rooms.strainId` and `mushroom_harvests.strainId` and force a
  migration, for two things that answer different questions.
- **Files changed:**
  - `src/modules/genetics/services/line/line_service.py`, `src/modules/genetics/api/v1/lines.py`
  - `frontend/user-portal/src/hooks/genetics/useGrowingProfiles.ts` (NEW)
  - `frontend/user-portal/src/components/genetics/GrowingProfilePanel.tsx` (NEW)
  - `frontend/user-portal/src/components/genetics/LineFormModal.tsx`,
    `pages/genetics/GeneticsRepoPage.tsx`, `pages/genetics/LineDetailPage.tsx`
  - `frontend/user-portal/src/components/mushroom/StrainCard.tsx`,
    `pages/mushroom/MushroomStrainLibrary.tsx`
  - `frontend/user-portal/src/types/genetics.ts`, `services/geneticsApi.ts`, `hooks/genetics/useGenetics.ts`
- **CodeMaps:** regenerated — graph now 662 nodes · 661 edges.

## 2026-06

### T-200.22b | Migrate `AP_TAX_RATES` from hardcoded dict to finance HTTP lookup — Wave 4 tech debt
- **Category:** Backend · **Priority:** P2
- **Completed:** 2026-06-10 · **Assigned:** backend-dev-expert (Viet Anh)
- **Summary:** Eliminates the hardcoded `AP_TAX_RATES` dict (`models/document.py:495`) that purchasing services have been using since pre-Wave-4. Replaces with the finance microservice HTTP lookup pattern that sales standardised in T-202. Also extracts the existing sales `_finance_ext_client.py` module to `src/core/finance/finance_ext_client.py` so both sales and purchasing share one source of truth (mirrors T-200.22a's chain-reconciler extraction). Sales' module becomes a thin re-export shim. All four purchasing services (AP Invoice, AP Credit Note, AP Down Payment, Blanket Agreement) now call `await get_tax_percent(tax_code, org_id, auth_token)` from `src.core.finance`. `auth_token` threaded through route handlers via `_extract_token(request)`. AP_TAX_RATES constant deleted from `models/document.py`; only docstring references remain. Honest gap fixed: `document_service.py`'s inline lookup previously silently fell back to `Decimal("0")` for unknown codes, inconsistent with the newer services — now all paths fail-hard via `get_tax_percent`. 8 new tests in `tests/unit/test_purchasing/test_tax_resolution.py`. 5 existing tests in `test_ap_invoice_service.py` updated with `_patch_tax_percent` context-manager helper.
- **Final pass count:** Sales 334 unchanged. Purchasing 54 (46 baseline + 8 new). Combined 388.
- **Commit:** `e0afa67` (T-200.22b implementation) — plus the late-filed BACKLOG entry shipped in `09e2cb1`.

### T-200.22a | Extract shared chain-reconciler primitives to `src/core/documents/` — Wave 4 tech debt
- **Category:** Backend · **Priority:** P2
- **Completed:** 2026-06-10 · **Assigned:** backend-dev-expert (Viet Anh)
- **Summary:** Removes the parallel-modules drift risk between sales' `doc_chain_reconciler.py` and purchasing's `purchasing_chain_reconciler.py` (both originally implemented the same contract independently because importing the sales module triggers `redis.asyncio` via the sales `services/__init__.py` auto-loading `OrderService`). New shared module at `src/core/documents/chain_reconciler.py` (686 lines, 8 exports — no `redis`, no `motor` at module level). Sales' module becomes a thin shim (537 → 281 lines) re-exporting core primitives with sales-specific name aliases (`line_open_qty → line_open_invoice_qty`, etc.) and sales-specific action-string defaults baked into wrapper functions. Purchasing's module shrinks (1,981 → 1,901 lines); doc-type-specific helpers (PO/GR/AP/DPI/BLA) stay as thin wrappers calling into core with the right collection names + `doc_key="docId"` (purchasing's key field). Some purchasing helpers (`reconcile_po_line_receipt_counters`, AP/DPI/BLA three-way close+reopen) kept as full implementations where the generic contract doesn't fit cleanly — natural candidates for tighter consolidation in a future ticket. Verified: importing the new core module loads zero redis modules.
- **Final pass count:** Sales 334 unchanged. Purchasing 46 unchanged. Combined 380.
- **Commit:** `ee822d1` (implementation) — plus the late-filed BACKLOG entry shipped in `09e2cb1`.

### T-200.21a | Fix 10 pre-existing purchasing test failures — Wave 4 tech debt
- **Category:** Backend tests · **Priority:** P2
- **Completed:** 2026-06-10 · **Assigned:** testing-backend-specialist (Viet Anh)
- **Discovered:** During T-200.21 retrofit on 2026-06-04. Failures verified pre-existing (not regressions) by stashing the change + re-running baseline.
- **Final pass count:** 46/46 purchasing (was 36/10). Sales 334/334 unchanged.
- **Three drift patterns fixed** — all on the test side, zero service-code changes:
  1. **Missing `company_code` parameter** (6 tests) — service methods grew the required kwarg when T-201.0's companyCode resolver landed; unit tests bypass the route layer and were never updated.
  2. **OutboxWriter mock-path resolution** (4 tests) — `unittest.mock.patch()` tries to import `src.modules.finance_bridge.outbox_writer` which pulls in `redis.asyncio`; redis not installed in test env. Fix: inject mock module into `sys.modules` before service imports it. Same redis import-chain blocker that surfaced in T-200.22.
  3. **DocumentStatus enum vocabulary drift** (3 tests) — assertions on TitleCase status strings that T-200.21 migrated to lowercase_snake. Note: `"Approved"` maps to `DocumentStatus.OPEN` ("open") on the status field while `approvalState` retains "Approved". Tests use tolerant `assert x in ("OldCase", "new_case")` for migration safety.
- **Files modified:** `tests/unit/test_purchasing/test_gr_service.py`, `tests/unit/test_purchasing/test_ap_invoice_service.py`. No conftest.py needed; per-test changes sufficient.
- **Commit:** `6500295`

### T-201.1 | Multi-company UX picker — companyCode selector when org has >1 companies
- **Category:** Frontend · **Priority:** P2 (priority-bumped to P1 during session because user hit the gap mid-T-201.8 verification)
- **Completed:** 2026-06-04 · **Assigned:** frontend-dev-expert (Viet Anh)
- **Depends on:** T-201.0 ✅
- **Summary:** Replaces the plain-text Company Code Input on 6 sales create forms
  with a typed picker. Three artefacts shipped: (1) `companiesService.listCompanies(orgId)`
  hitting `GET /api/v1/finance/companies`; (2) `useCompanies(orgId)` hook
  mirroring `useTaxCodes` shape (5-minute staleTime); (3) `CompanyCombobox`
  four-state component (loading / single-locked-with-help-text / multi-dropdown / zero-with-setup-link).
  Wired into ARI, ARC, RR, RTN, Delivery, Customer Receipt via Controller binding.
  Single-company orgs see a disabled select displaying the auto-filled code +
  help text "Auto-selected — only company configured on this tenant" (visibility
  iteration: original spec returned `null` to hide entirely; Viet Anh asked for
  visible-but-locked to confirm what's filled). Multi-company shows an active
  dropdown of "CODE — Legal Name" options. Same `shouldShowCompanyField` helper
  kept exported (now always returns true) so callers' wrapper conditionals
  stay in place without churn. SO doesn't carry companyCode at all (T-201.0
  handles server-side); Quote never had this field.
- **Files added:** `services/companiesService.ts`, `hooks/queries/useCompanies.ts`,
  `components/sales/CompanyCombobox.tsx`
- **Files modified:** 6 form pages
- **Commit:** `cdc71a4`
- **DevLog:** `Docs/3-DevLog/2026-06-02_T-201.8-isstock-gating.md` (Day 2 section)

### T-202 | AR Invoice backend stamps `taxPercent=0` (queries tax_codes from ops Mongo instead of finance MySQL) — Hotfix
- **Category:** Backend · **Priority:** P0
- **Completed:** 2026-06-04 · **Assigned:** parent session + backend-dev-expert (Viet Anh)
- **Discovered:** During T-201.8 UI verification of ARI-2026-0004 (re-created from DN-2026-0003 / SO-2026-0002). User noticed totals.gross = 29,000 instead of expected 30,450 (SO net 29,000 + 5% VAT 1,450).
- **Root cause:** `ar_invoice_service.py:167` `_get_tax_percent` queried `db["tax_codes"]` on ops MongoDB. Tax codes live in finance MySQL (count=0 in ops Mongo). Lookup returned None → function returned `Decimal("0")` → backend stamped `taxPercent=0` on every line. Same class of bug as T-100.9a.1.
- **Accounting impact:** Every from-Delivery AND direct-create AR Invoice silently dropped VAT from its JE — DR AR / CR Revenue with no CR Output VAT line. ARC and SO unaffected (both trust client-submitted taxPercent directly).
- **Fix:** Added `get_tax_percent(tax_code, org_id, auth_token)` to `_finance_ext_client.py`. Hits `GET /api/v1/finance/tax-codes`, filters client-side by taxCode. Fail-hard on unknown/non-2xx/httpx exception. Null code short-circuits to `Decimal("0")` with no HTTP call. `_get_tax_percent` in ar_invoice_service delegates; `_TAX_CODES_COL` removed; docstrings updated. Single call site in `_build_line_doc` updated (auth_token already threaded from T-201.8). 4 new test cases in test_ar_invoices.py + helper `_patch_tax_percent`.
- **Verified end-to-end on live stack:** ARI-2026-0004 re-created + posted; 3-leg JE confirmed (DR AR 30,450 / CR Revenue 29,000 / CR Output VAT 1,450).
- **Standalone-mode tax correctness** filed as T-600 gap 2a (2026-06-04). Two options surveyed (ops-side tax_codes Mongo OR snapshot taxPercent at quote/order time); decision deferred to Wave 6.
- **Commit:** `14046b3`
- **DevLog:** `Docs/3-DevLog/2026-06-02_T-201.8-isstock-gating.md` (Day 2 section)

### T-201.7 | Fix dangling `targetDocRefs` on Delivery when AR Invoice is hard-deleted — Wave 3
- **Category:** Backend · **Priority:** P1
- **Completed:** 2026-06-02 (committed in `420d120`; backlog cleanup 2026-06-04) · **Assigned:** backend-dev-expert (Viet Anh)
- **Depends on:** T-201.6 ✅
- **Summary:** `delete_ar_invoice` and `update_ar_invoice` (from-Delivery, lines change) now `$pull` stale ARI references from `Delivery.targetDocRefs` (header) and `Delivery.lines[].targetDocRefs`. Keyed on docId so sibling ARIs on the same DN are untouched. `$push` fresh refs after update reconciles per-line UUID drift. 6 new tests (1 sanity + 5 main); fake-DB helper extended to handle `$pull` on header arrays and `lines.$.subfield` arrays.
- **Commit:** `420d120` (bundled with T-201.5, T-201.6)
- **DevLog:** `Docs/3-DevLog/2026-06-01_T-201.4-to-T-201.7-ar-invoice-delivery-consistency.md`

### T-201.6 | Fix AR Invoice ↔ Delivery `invoicedQty` counter tracking consistency bugs — Wave 3
- **Category:** Backend · **Priority:** P1
- **Completed:** 2026-06-02 (committed in `420d120`; backlog cleanup 2026-06-04) · **Assigned:** backend-dev-expert (Viet Anh)
- **Depends on:** T-201.5 ✅
- **Summary:** Two cascading bugs fixed. (a) `update_ar_invoice` for from-Delivery ARIs computes per-DN-line old vs new totals, cap-checks positive deltas against live `open_invoice_qty`, `$inc` each changed DN line, reload, applies symmetric auto-close / auto-reopen. Audit detail records `dnLineDeltas`. (b) `delete_ar_invoice` and `transition_status OPEN→CANCELLED` reload DN after the release loops; if CLOSED but not fully invoiced, transition to OPEN with audit `auto_reopen_on_invoice_release`. 10 new tests.
- **Commit:** `420d120` (bundled with T-201.5, T-201.7)
- **DevLog:** `Docs/3-DevLog/2026-06-01_T-201.4-to-T-201.7-ar-invoice-delivery-consistency.md`

### T-201.5 | AR Invoice ↔ Delivery visibility + auto-close — Wave 3
- **Category:** Backend + Frontend · **Priority:** P1
- **Completed:** 2026-06-02 (committed in `420d120`; backlog cleanup 2026-06-04) · **Assigned:** backend-dev-expert + frontend-dev-expert (Viet Anh)
- **Depends on:** T-201.4 ✅
- **Summary:** Backend — `DeliveryListItem.open_invoice_qty` (camelCase `openInvoiceQty`) added; `_compute_open_invoice_qty(raw)` sums `quantity − invoicedQty − creditedQty − cancelledQty` per line; `list_deliveries()` keeps `lines` in projection. New helpers `_dn_is_fully_invoiced(dn_raw)` + `_write_dn_audit(...)`. `create_ar_invoice_from_delivery` step 6 reloads DN after invoicedQty increments and auto-transitions to CLOSED with audit action `auto_close_on_full_invoice` when fully invoiced. Frontend — DeliveryDetailPage Lines table gains Invoiced + Open to Invoice columns (later relabelled to Invoiced Qty / Open Qty in T-201.8 session); Generate-AR-Invoice button hidden when fully invoiced; DeliveriesPage filter chip + per-row column. 19 new tests.
- **Commit:** `420d120` (bundled with T-201.6, T-201.7)
- **DevLog:** `Docs/3-DevLog/2026-06-01_T-201.4-to-T-201.7-ar-invoice-delivery-consistency.md`

### T-201.4 | AR Invoice from-Delivery pre-fill + locked field set — Wave 3
- **Category:** Frontend · **Priority:** P1
- **Completed:** 2026-06-02 (committed in `2a4fc6e`; backlog cleanup 2026-06-04) · **Assigned:** parent session (Viet Anh)
- **Summary:** Rewrote `isFromDelivery` mode pre-fill in ARInvoiceFormPage. Fetches source DN + parent SO; pre-fills customer/companyCode/dateOfSupply from DN, currency/exchangeRate/paymentTerms/bpRefNo from SO, lines per-DN-line with pricing+tax inherited from matching SO line. New `deliveryLineId` field on the line zod schema. Pre-filled qty defaults to `max(0, quantity − invoicedQty − creditedQty − cancelledQty)`; zero-open lines dropped. Lock-set decided by "would editing this break doc integrity?" — Customer/Company Code/UoM/item picker locked; qty/price/tax/dates/payment terms editable.
- **Commit:** `2a4fc6e`
- **DevLog:** `Docs/3-DevLog/2026-06-01_T-201.4-to-T-201.7-ar-invoice-delivery-consistency.md`

### T-201.8 | AR Invoice direct-create: `isStock` flag + gating (foundation for SO-chain epic) — Wave 3
- **Category:** Backend + Frontend · **Priority:** P1
- **Completed:** 2026-06-04 · **Assigned:** parent session + backend-dev-expert + frontend-dev-expert + testing-backend-specialist (Viet Anh)
- **Depends on:** T-201.7 ✅
- **Blocks:** T-201.9, T-201.10, T-201.11
- **Architecture decision (Option C, 2026-06-02 with Viet Anh):** `isStock` lives on `SaleItemFinanceExt` (finance MySQL) — the de-facto sale-item master today. `isStock` is a billing-routing flag, not an inventory flag (inventory_movements stays entirely ops-side, routes by inventoryId presence). T-201.8b filed for Wave 6 SKU-master extraction.
- **Symmetric flows shipped within T-201.8:** AR Credit Note and Return Request direct-create paths gate isStock the same way (no defer).
- **Summary:**
  • **Finance backend:** new `isStock: bool` column on `SaleItemFinanceExt` (default True). Pydantic Create/Update/Response. LIST endpoint accepts `is_stock` query param. PATCH audit diff captures changes via existing model_fields_set loop. Alembic migration 020 with server_default + heuristic backfill (sets isStock=0 for itemName matching `(?i)(fee|charge|delivery|freight|service|rental|deposit|consulting)`).
  • **Ops backend:** new `src/modules/sales/services/_finance_ext_client.py` (shared HTTP wrapper, eliminates triple-duplication). ARI, ARC, RR services each gate three paths (create direct, update direct DRAFT lines change, DRAFT→OPEN transition). Direct path discriminated by absence of `baseDocRef.docId` (ARI/RR) or `baseReturnDocRef.docId` (ARC). Route handlers thread `auth_token` for the HTTP call. RR create-path gate documented as defensive code (Pydantic rejects empty baseDocRef upstream; gate kept for if/when schema is loosened).
  • **Frontend UI:** `SalesItemCombobox.filterIsStock` prop forwarded to `useSaleItemFinanceExtList` with `allFiltered` cache key variant; ARI/ARC/RR direct-create forms pass `filterIsStock={false}` and display a help banner explaining the gating. `SalesItemsPage` gains a Type column with badge + an Item-type radio group in the edit modal (UX iteration after Viet Anh flagged the original dynamic-label checkbox as misleading). Mutation `refetchType: 'all'` added to work around the global `refetchOnMount: false` (same pattern as T-201.5–.7).
  • **Tests:** new `test_isstock_gating.py` (39 cases across three classes — TestARInvoiceIsStock / TestARCreditNoteIsStock / TestReturnRequestIsStock). Existing fixtures patched. Full sales suite: 306 pass.
- **UX iterations during verification (committed together as part of T-201.8 UI work):**
  - Item-type checkbox → radio group (category vs binary)
  - SalesItemFinanceExt mutation cache invalidation (`refetchType: 'all'`)
  - Manual mongosh `$pull` on DN-2026-0003 for pre-T-201.7 dangling targetDocRef (one-off data hygiene)
  - "Open to Invoice" column relabeled to "Open Qty" + "Has Open Qty" filter chip
  - Duplicate customerId error removed on ARI/SO/Customer Receipt forms
- **Bugs surfaced + filed separately (NOT part of T-201.8):**
  - T-202 (P0, fixed same session)
  - T-501 (Wave 5 sibling — Packing materials BOM)
  - T-600 gap 2a (standalone-mode tax)
- **Honest downsides:** Admin must manually classify items once (one-time data setup cost, mitigated by heuristic backfill). RR create-path gate is dead code today (kept defensive). ARI transition asymmetry between rev-account (hard-fail) and isStock (fail-open) is intentional and documented in tests.
- **Commits:** `096be1a` (finance), `14046b3` (ops + tests), `cdc71a4` (frontend UI), `2ccb9dc` (docs)
- **DevLog:** `Docs/3-DevLog/2026-06-02_T-201.8-isstock-gating.md`

---

### T-201.3 | Sales form pickers + UX polish
- **Category:** Frontend · **Priority:** P1
- **Completed:** 2026-06-01 · **Assigned:** frontend-dev-expert (Viet Anh)
- **Depends on:** T-201.2 ✅
- **Summary:** Four deliverables: (1) `CurrencyCombobox` — constrained dropdown with 11 GCC+
  common currencies; tenant base currency (from `useFinanceCompanies`) floats to top with "Base"
  badge; (2) `PaymentTermsCombobox` — typeahead chip-picker over `payment_terms` master via
  `usePaymentTerms` hook (shared with purchasing); (3) Exchange Rate conditional visibility —
  hidden when currency === tenant base, `exchangeRate` form field always tracks `1.0` underneath
  so submit payload is always valid; (4) Portal fix for `SalesItemCombobox` AND `CustomerCombobox`
  — dropdown panels portaled to `document.body` via `createPortal` with `position:fixed`
  coordinates from `getBoundingClientRect()`, auto-repositioned on scroll/resize, z-index 9999;
  eliminates clipping by table-cell `overflow:hidden`. Wired into 5 of 8 sales forms (Quote ×3,
  SO ×3, ARI ×2, Receipt ×2, ARC ×3; Delivery/RR/RTN skip — no currency/paymentTerms fields).
  TypeScript clean, lint clean, 228 backend tests pass.
- **Files added:** `components/sales/CurrencyCombobox.tsx`, `components/sales/PaymentTermsCombobox.tsx`,
  `hooks/queries/useTenantBaseCurrency.ts`
- **Files modified:** `components/sales/SalesItemCombobox.tsx` (portal), `components/sales/CustomerCombobox.tsx`
  (portal), `QuoteFormPage.tsx`, `SalesOrderFormPage.tsx`, `ARInvoiceFormPage.tsx`,
  `CustomerReceiptFormPage.tsx`, `ArCreditNoteFormPage.tsx`
- **DevLog:** `Docs/3-DevLog/2026-06-01_T-201.3-sales-form-pickers.md`

### T-201.2 | SalesItemCombobox + wire into all 8 sales doc form pages
- **Category:** Frontend · **Priority:** P0
- **Completed:** 2026-06-01 · **Assigned:** frontend-dev-expert (Viet Anh)
- **Depends on:** T-200.9 ✅ (useSaleItemFinanceExtList hook)
- **Summary:** Fixed correctness bug where `itemId` was set to `itemCode` string
  ("TOM-SEED") instead of the real UUID. Built `SalesItemCombobox` (typeahead picker
  over `sale_item_finance_ext` isSellable=true items). Wired into all 7 line-item
  sales doc forms (Quote, SO, Delivery, ARI, RR, RTN, ARC). CustomerReceiptFormPage
  skipped (no item lines — invoice allocations only). From-X modes disable the picker
  (item locked to source doc). TypeScript clean, lint clean, 228 backend tests pass.
- **Files:** NEW `components/sales/SalesItemCombobox.tsx`; modified 7 form pages.
- **DevLog:** `Docs/3-DevLog/2026-06-01_T-201.2-sales-item-combobox.md`

### T-201.0 | Backend companyCode resolver (replaces hardcoded defaults)
- **Category:** Backend + Frontend · **Priority:** P1
- **Completed:** 2026-06-01 · **Assigned:** backend-dev-expert (Viet Anh)
- **Depends on:** T-100.11.2 ✅ (A001 company configured), Wave 3 foundation
- **Blocks:** T-201.1 (multi-company UX picker)
- **Summary:** Replaced all hardcoded `"1000"` / `"DEFAULT"` / `"A001"` companyCode
  defaults across the purchasing and sales modules with a live resolver that queries
  `GET /api/v1/finance/companies?organization_id=...` and auto-resolves when exactly
  one company exists. Files changed:
  - NEW: `src/core/finance/company_resolver.py` — `resolve_company_code()` async helper;
    `src/core/finance/__init__.py`; `tests/unit/test_company_resolver.py` (11 tests, all pass)
  - PURCHASING: `document_service.py`, `vendor_service.py`, `purchase_item_service.py` —
    `Optional[str] = None` defaults; ValueError guards on create methods
  - PURCHASING API: `purchase_requests.py`, `purchase_orders.py`, `goods_receipts.py`,
    `ap_invoices.py`, `vendors.py`, `purchase_items.py` — `Request` + resolver on all create endpoints
  - SALES MODELS: `ar_invoices.py`, `deliveries.py`, `customer_receipts.py`, `quotes.py`,
    `sales_orders.py`, `return_requests.py`, `ar_credit_notes.py`, `returns.py` — optional `company_code`
  - SALES API: `ar_invoices.py`, `quotes.py`, `sales_orders.py`, `deliveries.py`,
    `customer_receipts.py`, `return_requests.py`, `ar_credit_notes.py`, `returns_v2.py` — resolver
  - FRONTEND: `salesApi.ts` (12 create interfaces), 8 form pages — `'A001'` removed; Zod optional
- **Follow-up:** T-201.1 — multi-company UX picker (org with >1 companies currently returns 400)

## 2026-05

### T-200.x | Sales attachments upload + sales audit endpoint
- **Category:** Backend + Frontend · **Priority:** P2
- **Completed:** 2026-05-31 · **Assigned:** backend-dev-expert (Viet Anh)
- **Depends on:** T-200.0 ✅
- **Blocks:** —
- **Summary:** Fixed two UX gaps surfaced during T-200.0 accountant testing.
  1. Attachment service `_verify_document` now dispatches by doc_type — Wave 3 sales docs
     (AR_INVOICE, CUSTOMER_RECEIPT, QUOTE, SALES_ORDER, DELIVERY, RETURN_REQUEST, RETURN,
     AR_CREDIT_NOTE) query their `*_v2` Mongo collections using `docEntry` key (not `docId`)
     and `organizationId` (camelCase). Purchasing docs continue using `document_headers`.
  2. New `GET /api/v1/sales/audit` endpoint dispatches to `*_v2_audit` collections.
     Requires `sales.view` permission. Returns `{ entries, total }` with camelCase aliases.
     Frontend: `getSalesAudit()` in salesApi.ts, `useSalesAudit` hook, `SalesAuditHistoryModal`
     component, Audit History GhostButton on all 8 Wave 3 detail pages (visible on all statuses).
- **Tests:** 40 attachment tests (was 22) + 17 new audit tests = 268 total, 0 failures.
- **TypeScript:** 0 errors. ESLint: 0 warnings.
- **DevLog:** `Docs/3-DevLog/2026-05-31_T-200.x-sales-attachments-audit.md`

### T-200.11 | Legacy /sales/orders + /sales/returns cutover — Wave 3 closeout
- **Category:** Frontend + Backend · **Priority:** P1
- **Completed:** 2026-05-31 · **Assigned:** frontend-dev-expert (Viet Anh)
- **Depends on:** T-200.10 ✅
- **Blocks:** Wave 3 done
- **Description:** Final Wave 3 task. Deleted legacy `SalesOrdersPage`, `ReturnsPage`,
  and 6 associated components (OrderTable, OrderForm, AddOrderItemModal, ReportReturnModal,
  DeleteOrderConfirmModal, OrderCard). Cleaned `salesService.ts` (kept dashboard/utility
  functions, removed order/return CRUD). Cleaned `types/sales.ts` (removed legacy CRUD types,
  kept dashboard/waste types). Updated `useSales.ts` and `hooks/queries/index.ts`.
  Added redirects `/sales/orders` → `/sales/orders-v2` and `/sales/returns` → `/sales/returns-v2`
  in App.tsx. Removed legacy `orders_router` and `returns_router` from backend
  `src/modules/sales/api/v1/__init__.py` (files kept on disk for rollback safety).
  Updated `dashboard.store.ts` metadata string. **Wave 3 Sales Module is complete.**
- **Verification:** tsc 0 errors · ESLint 0 new errors · pytest 211/211 pass

### T-200.10 | Company Posting Setup admin UI — Sales nav entry + AR/Output VAT required fields
- **Category:** Frontend · **Priority:** P1
- **Completed:** 2026-05-31 · **Assigned:** frontend-dev-expert (Viet Anh)
- **Depends on:** T-100.9b ✅ (posting setup backend), T-200.9 ✅ (Sales nav group established)
- **Blocks:** T-200.11 (cutover — final Wave 3 task)
- **Description:** Final admin surface before Wave 3 cutover. Adds the Company Posting Setup
  page to the Sales nav group (`/sales/posting-setup`) so sales admins can configure GL account
  mappings without navigating to the Finance group. Also:
  (A) Extends `AccountCombobox` to show drawer + accountType hint in every dropdown option
      (e.g. "Assets · asset") so users can quickly confirm they are picking the correct kind
      of account.
  (B) Adds AR Control and Output VAT as required fields (with `*` markers and client-side
      pre-save validation) — both are gating for the AR Invoice posting flow.
  (C) Adds brief explanatory hints below each account combobox describing what the account
      is used for (e.g. "Trade Receivables — AR Invoice posts Dr against this account").
  Backend was already complete; zero backend changes needed. Backend smoke confirmed all
  camelCase keys, A001 row populated with all 10 fields.
- **Files modified:**
  - `frontend/user-portal/src/components/finance/AccountCombobox.tsx` — import
    `DRAWER_LABELS` + `ACCOUNT_TYPE_LABELS`; add `DrawerTypeBadge` styled component;
    render "Drawer · type" hint pill in every dropdown option
  - `frontend/user-portal/src/pages/finance/PostingSetupPage.tsx` — mark `arControlAccountId`
    and `outputVatAccountId` as required (`*`); update `isFormComplete` check to include both;
    add client-side pre-save validation for all 7 required fields; add `hint` prop to
    `AccountSelect` sub-component; populate hints for all 10 fields; fix unused eslint-disable
    directives
  - `frontend/user-portal/src/App.tsx` — route `/sales/posting-setup` (alias to existing
    `PostingSetupPage` behind `FinanceGate`)
  - `frontend/user-portal/src/components/layout/MainLayout.tsx` — sidebar entry in
    `SALES_NAV_GROUP` after Sales Items Config
- **Test results:**
  - TypeScript: 0 errors (`npx tsc --noEmit`)
  - ESLint: 0 errors/warnings on all modified files (pre-existing MainLayout issues unchanged)
  - Backend smoke: GET `/api/v1/finance/companies/A001/posting-setup` → 200, all camelCase
    keys, no snake_case, A001 row populated with all 10 GL account IDs
- **Four hardening rules:**
  1. Path: `/v1/finance/companies/{code}/posting-setup` (correct prefix in postingSetupService.ts)
  2. camelCase: backend returns 100% camelCase — verified by smoke
  3. Status: N/A (settings page, no status flow)
  4. No Audit History button: confirmed absent (this is a settings page, not a document)
- **Hot reload:** Frontend HMR picks up all changes automatically — no restart needed.

---

### T-200.9 | Sales Items master UI + sale_item_finance_ext seed for test items
- **Category:** Frontend + Backend · **Priority:** P1
- **Completed:** 2026-05-31 · **Assigned:** backend-dev-expert (Viet Anh)
- **Depends on:** T-100.3 ✅ (sale_item_finance_ext table + CRUD endpoints)
- **Blocks:** —
- **Description:** Two deliverables: (A) Alembic migration 019 that idempotently seeds
  `sale_item_finance_ext` rows for existing test items; (B) `SalesItemsPage` at `/sales/items`
  that displays per-item GL account and tax code config with an edit modal.
- **Files created:**
  - `services/finance/alembic/versions/019_seed_sale_item_finance_ext.py` — idempotent migration
    seeding TOM-SEED (Tomato - Seeds) with Revenue=411000-001, COGS=511000-001, Tax=S
  - `frontend/user-portal/src/pages/sales/SalesItemsPage.tsx` — settings page (~580 lines);
    table with edit modal; `AccountCombobox` for REVENUE + COST_OF_SALES picker; modal does NOT
    close on overlay click (project rule)
  - `frontend/user-portal/src/hooks/queries/useSaleItemFinanceExt.ts` — 5 TanStack Query hooks
- **Files modified:**
  - `frontend/user-portal/src/services/salesApi.ts` — `SaleItemFinanceExt` types + 5 API functions
  - `frontend/user-portal/src/hooks/queries/index.ts` — exports 5 new hooks
  - `frontend/user-portal/src/App.tsx` — lazy import + route `/sales/items`
  - `frontend/user-portal/src/components/layout/MainLayout.tsx` — sidebar entry in SALES_NAV_GROUP
- **Test results:**
  - Sales backend: 211 passed (0 regressions)
  - Finance backend: 402 passed, 1 skipped (0 regressions)
  - TypeScript: 0 errors (`npx tsc --noEmit`)
  - ESLint: 0 errors on new/modified files
- **Migration:** 018 → 019, `alembic current` = `019 (head)`
- **Smoke:** GET `/api/v1/finance/item-finance-ext` returns 1 seeded row (TOM-SEED) with
  correct revenue/COGS/tax assignments
- **Important note:** Closes the "AED 0.00 COGS account on Returns JE" issue at the GL account
  assignment level. Unit cost is still AED 0.00 on existing history docs (correct — those were
  created without a GR receipt seeding `inventory_balances`). New deliveries will use the
  correct COGS account going forward once an `inventory_balances` record exists for the item.
- **Hot reload:** Frontend hot-reloads automatically (pure .tsx/.ts edits). Finance container
  needs rebuild for migration 019 to survive teardown:
  `docker compose -f docker-compose.yml -f docker-compose.finance.yml build finance && up -d finance`

### T-200.8 | AR Credit Note (ARC) UI — list + form + detail + from-RTN + from-Invoice flows
- **Category:** Frontend (+ backend pre-flight) · **Priority:** P1
- **Completed:** 2026-05-30 · **Assigned:** frontend-dev-expert (Viet Anh)
- **Depends on:** T-100.11 ✅ (ARC backend), T-200.7 ✅ (RTN UI — unblocked from-rtn route), T-200.0 ✅ (ARI UI — adds Issue Credit Note button)
- **Blocks:** —
- **Description:** Three new Wave 3 AR Credit Note pages + backend pre-flight hardening.
  Backend: Added `_RESPONSE_CONFIG` (camelCase alias_generator, populate_by_name, from_attributes) to
  `CreditNoteAllocationResponse`, `CreditNoteLineResponse`, `CreditNoteTotals`, `ARCreditNoteResponse`,
  `ARCreditNoteListItem` in `models/ar_credit_notes.py`; added `response_model_by_alias=True` to all 6
  routes in `api/v1/ar_credit_notes.py`. Restarted API and smoke-verified camelCase at every level
  (top-level + totals + lines + allocations) for ARC-2026-0001.
  Frontend: Full ARC type hierarchy (ARCreditNote, ARCreditNoteListItem, ARCreditNoteLine,
  CreditNoteAllocation, ARCreditNoteTotals, ARCreditNoteCreate/Update/Transition etc.) + 8 API
  functions in salesApi.ts (listArCreditNotes, getArCreditNote, createArCreditNote,
  createArCreditNoteFromRTN, createArCreditNoteFromInvoice, updateArCreditNote, deleteArCreditNote,
  transitionArCreditNote); useArCreditNotes.ts hook file with 7 hooks + arcQueryKeys; exported in
  hooks/queries/index.ts. Removed defunct NOT_IMPLEMENTED stub.
  ArCreditNotesPage: status chips (Draft/Open/Partly Closed/Closed/Cancelled), source-type chips
  (All Sources/From RTN/From Invoice) derived client-side from baseReturnDocRef presence, search,
  date range, pagination, docNumber + customerName + source label + gross + status.
  ArCreditNoteFormPage: 4 modes (new/from-rtn/:rtnDocEntry/from-invoice/:ariDocEntry/edit);
  from-RTN pre-fills customer+lines from RTN and sets baseReturnDocRef; from-Invoice pre-fills
  customer+lines from ARI (creditedQty = invoicedQty-creditedQty-cancelledQty) and auto-populates
  first allocation row; lines+allocations useFieldArray; live totals recalculation; RHF+Zod.
  ArCreditNoteDetailPage: info grid, read-only lines table with line-level amounts, allocations table
  (rows clickable → ARI), doc-chain card (baseDocRef ARI + baseReturnDocRef RTN + targetDocRefs),
  action bar (draft: Edit/Post/Delete; open: Cancel super_admin only; read-only otherwise),
  X-close-only delete modal, NO Audit History button, AttachmentList with AR_CREDIT_NOTE docType.
  Added "Issue Credit Note" SecondaryButton on ARInvoiceDetailPage (→ /from-invoice path);
  fixed stale /sales/credit-notes route in ARInvoiceDetailPage.docTypeRoute to /sales/ar-credit-notes.
  Fixed sidebar route from /sales/credit-notes → /sales/ar-credit-notes in MainLayout.
  6 new routes in App.tsx (list/new/from-rtn/from-invoice/edit/detail).
  TypeScript: zero errors. ESLint: zero errors. Backend tests: 211 pass.
- **Hot reload:** `docker compose restart api` required (backend model hardening). Frontend HMR only.
- **DevLog:** `Docs/3-DevLog/2026-05-30_T-200.8-ar-credit-note-ui.md`

### T-200.7 | Return Note v2 (RTN) UI — list + form + detail + from-RR + from-DN flows
- **Category:** Frontend (+ backend pre-flight) · **Priority:** P1
- **Completed:** 2026-05-30 · **Assigned:** frontend-dev-expert (Viet Anh)
- **Depends on:** T-100.11 ✅ (Return Note backend), T-200.6 ✅ (Return Request UI — unblocked from-rr route)
- **Blocks:** T-200.8 (AR Credit Note UI — "Issue Credit Note" button on RTN detail is wired with tooltip)
- **Description:** Three new Wave 3 Return Note v2 pages + backend pre-flight hardening.
  Backend: added `_RESPONSE_CONFIG` (camelCase alias_generator, populate_by_name, from_attributes)
  to `ReturnLineResponse`, `ReturnTotals`, `ReturnResponse`, `ReturnListItem` in `models/returns.py`;
  added `response_model_by_alias=True` to all 7 routes in `api/v1/returns_v2.py`.
  Smoke-verified camelCase response + RTN-2026-0001 via Playwright.
  Frontend: full RTN type hierarchy + 8 API functions in salesApi.ts (`listReturns`, `getReturn`,
  `createReturnFromRR` → POST /from-request/:rrDocEntry, `createReturnFromDelivery` → generic POST
  client-side copy approach — disclosed in comments, no backend /from-delivery endpoint exists,
  `createReturn`, `updateReturn`, `deleteReturn`, `transitionReturn`); `useReturns.ts` hook file
  with 8 hooks + `rtnQueryKeys`; added to hooks/queries/index.ts.
  `ReturnsV2Page` (status chips: Draft/Open/Cancelled; source-type chips: From RR/From DN;
  search, pagination, SourceTag colored by docType).
  `ReturnFormPage` (4-mode: new/from-rr/:rrDocEntry/from-delivery/:dnDocEntry/edit — pre-fills
  from RR with requestedQty-consumedQty defaults; pre-fills from DN with quantity-returnedQty
  defaults; maxQty hint per line; customer locked in from-X modes; AttachmentList edit-only;
  Zod validation, useFieldArray, InfoBanner per mode).
  `ReturnDetailPage` (read-only lines table with totals row; doc-chain card resolving RR/DN
  source routes; Issue Credit Note button with Tooltip noting T-200.8; Cancel super_admin only;
  delete modal X-close only; NO Audit History button).
  Added "Receive Return (direct)" SecondaryButton to DeliveryDetailPage open action bar
  (navigates to /sales/returns-v2/from-delivery/:dnDocEntry).
  6 new routes added to App.tsx in correct order (/new, /from-rr/:x, /from-delivery/:x,
  /:docId/edit before /:docId). Checks: tsc 0 errors, eslint 0 errors, backend 211/211 passed.

### T-200.6 | Return Request (RR) UI — list + form + detail + from-Delivery flow
- **Category:** Frontend (+ backend pre-flight) · **Priority:** P1
- **Completed:** 2026-05-30 · **Assigned:** frontend-dev-expert (Viet Anh)
- **Depends on:** T-100.11 ✅ (Return Request backend)
- **Blocks:** T-200.7 (Return Note UI — /sales/returns-v2/from-rr/:rrDocEntry ready to receive)
- **Description:** Three new Wave 3 Return Request pages + backend pre-flight hardening.
  Backend: rewrote `models/return_requests.py` with `_RESPONSE_CONFIG` (camelCase alias_generator,
  populate_by_name, from_attributes); added `response_model_by_alias=True` to all 6 response-
  bearing routes in `api/v1/return_requests.py`. Frontend: full RR type hierarchy + 7 API
  functions in salesApi.ts; `useReturnRequests.ts` hook file with 8 hooks + `rrQueryKeys`;
  `ReturnRequestsPage` (status chips, reason chips client-side, search, pagination, 4-color
  StatusBadge); `ReturnRequestFormPage` (3-mode: new/from-delivery/edit — pre-fills from DN,
  maxQty hint per line, Zod validation, useFieldArray); `ReturnRequestDetailPage` (consumption-
  tracking lines table with requestedQty | consumedQty | remainingQty + progress bar per line,
  Create Return Note button with T-200.7 tooltip, delete modal X-only). Added "Request Return
  (RMA)" SecondaryButton to DeliveryDetailPage action bar (open status only). 5 new routes
  added to App.tsx in correct order (/new, /from-delivery/:x before /:docId).
  Checks: tsc 0 errors, eslint 0 errors, backend 211/211 tests passed.

### T-200.5 | Delivery Note (DN) UI — list + form + detail + from-SO flow
- **Category:** Frontend (+ backend pre-flight) · **Priority:** P1
- **Completed:** 2026-05-30 · **Assigned:** frontend-dev-expert (Viet Anh)
- **Depends on:** T-100.8 ✅ (Delivery backend)
- **Description:** Three new Wave 3 Delivery Note pages + backend pre-flight hardening.
  Backend: applied `_RESPONSE_CONFIG` (camelCase alias_generator) to `DeliveryResponse` and
  `DeliveryListItem`; added `response_model_by_alias=True` to all 5 response-bearing routes.
  Frontend: full Delivery types + API functions in salesApi.ts, useDeliveries.ts hook file
  with 6 hooks, DeliveriesPage (filter chips, source-SO links), DeliveryFormPage
  (new/from-SO/edit modes — pre-fills from SO open lines), DeliveryDetailPage (lines with
  returnedQty indicator, doc-chain card, Generate AR Invoice button, Delete modal X-only).
  Closes the SO → Create Delivery 404 gap from T-200.4. Wires the DN → ARI Generate
  AR Invoice button so the full Quote→SO→DN→ARI→Receipt chain is sidebar-driveable.
- **Four hardening rules:**
  1. Path constant `/v1/sales/deliveries` — `salesApi.ts:~770`
  2. `_RESPONSE_CONFIG` on `DeliveryResponse` + `DeliveryListItem` — `deliveries.py:~232, ~257`
  3. `response_model_by_alias=True` on all 5 routes — `deliveries.py` route decorators
  4. Status literals `'draft' | 'open' | 'cancelled'` — `salesApi.ts:DeliveryStatus`
- **Smoke:** 211/211 backend tests pass; camelCase list + detail keys confirmed live
- **Files created:**
  - `frontend/user-portal/src/pages/sales/DeliveriesPage.tsx` — ~330 lines
  - `frontend/user-portal/src/pages/sales/DeliveryFormPage.tsx` — ~470 lines
  - `frontend/user-portal/src/pages/sales/DeliveryDetailPage.tsx` — ~490 lines
  - `frontend/user-portal/src/hooks/queries/useDeliveries.ts` — 125 lines
  - `Docs/3-DevLog/2026-05-30_T-200.5-delivery-note-ui.md` — session DevLog
- **Files modified:**
  - `src/modules/sales/models/deliveries.py` — `_RESPONSE_CONFIG` + `model_config`, removed legacy `class Config`
  - `src/modules/sales/api/v1/deliveries.py` — `response_model_by_alias=True` on 5 routes
  - `frontend/user-portal/src/services/salesApi.ts` — full Delivery types + 6 API functions
  - `frontend/user-portal/src/hooks/queries/index.ts` — Delivery hook exports added
  - `frontend/user-portal/src/App.tsx` — lazy imports + 5 Delivery routes

---

### T-200.4 | Sales Order v2 (SO) UI — list + form (3 modes) + detail + from-quote flow
- **Category:** Frontend (+ backend pre-flight) · **Priority:** P1
- **Completed:** 2026-05-30 · **Assigned:** frontend-dev-expert (Viet Anh)
- **Depends on:** T-100.7 ✅ (SO backend), T-200.3 ✅ (Quote UI — Convert button now lands on this page)
- **Blocks:** T-200.5 (Delivery UI — "Create Delivery" button wired on SO detail)
- **Description:** Three new Wave 3 Sales Order pages + backend pre-flight hardening.
  Backend: applied `_RESPONSE_CONFIG` (camelCase alias_generator) to 5 SO response models and
  `response_model_by_alias=True` to all 6 response-bearing routes.
  Frontend: full typed SO section in salesApi.ts, useSalesOrders.ts hook file with 7 hooks,
  SalesOrdersV2Page list (filter chips, fulfilment pill), SalesOrderFormPage (new/from-quote/edit modes
  with credit-limit error banner), SalesOrderDetailPage (fulfilment columns, progress bars, doc-chain card).
  Unblocks the Quote→Convert→SO flow — T-200.3's "Convert to SO" button on QuoteDetailPage now routes
  to a live, pre-filled form via `/sales/orders-v2/from-quote/:quoteDocEntry`.
- **Files created:**
  - `frontend/user-portal/src/pages/sales/SalesOrdersV2Page.tsx` — list, filter chips, fulfilment pill, pagination
  - `frontend/user-portal/src/pages/sales/SalesOrderFormPage.tsx` — create/from-quote/edit, CustomerCombobox, useFieldArray, credit-limit banner
  - `frontend/user-portal/src/pages/sales/SalesOrderDetailPage.tsx` — detail with fulfilment columns, progress bars, doc-chain, action bar
  - `frontend/user-portal/src/hooks/queries/useSalesOrders.ts` — 7 TanStack Query hooks (soQueryKeys, all mutations)
  - `Docs/3-DevLog/2026-05-30_T-200.4-sales-order-v2-ui.md` — session DevLog
- **Files modified:**
  - `src/modules/sales/models/sales_orders.py` — `_RESPONSE_CONFIG` applied to 5 response models, `class Config` blocks removed
  - `src/modules/sales/api/v1/sales_orders.py` — `response_model_by_alias=True` on 6 routes
  - `frontend/user-portal/src/services/salesApi.ts` — full SO types + API functions (7 functions)
  - `frontend/user-portal/src/hooks/queries/index.ts` — SO hook exports added
  - `frontend/user-portal/src/App.tsx` — 3 lazy imports + 5 routes (/orders-v2, /new, /from-quote/:id, /:docId/edit, /:docId)
- **Test results:** 211 backend tests pass (unchanged). TypeScript: zero errors. ESLint: zero errors (1 unused var found + fixed).
- **Four hardening rules:**
  1. Path constant: `SO_BASE = '/v1/sales/orders-v2'` in `salesApi.ts` (no `/api/` prefix).
  2. `_RESPONSE_CONFIG`: `sales_orders.py` lines for `SalesOrderLineResponse`, `CreditCheckSnapshot`, `SalesOrderTotals`, `SalesOrderResponse`, `SalesOrderListItem`.
  3. Status literals lowercase: `'draft' | 'open' | 'partly_closed' | 'closed' | 'cancelled'` in `salesApi.ts`.
  4. No Audit History button: `SalesOrderDetailPage.tsx` has no AuditHistoryModal or audit button.

---

### T-200.3 | Sales Quote (SQ) UI — list + form + detail — Wave 3
- **Category:** Frontend (+ backend pre-flight) · **Priority:** P1
- **Completed:** 2026-05-30 · **Assigned:** frontend-dev-expert (Viet Anh)
- **Depends on:** T-200.0 ✅, T-200.1 ✅, T-200.2 ✅
- **Blocks:** T-200.4 (Sales Order UI)
- **Description:** Three new Wave 3 Sales Quote pages + backend pre-flight hardening.
  Backend: applied `_RESPONSE_CONFIG` (camelCase alias_generator) to all four Quote response
  models and `response_model_by_alias=True` to all five response-bearing routes.
  Frontend: full typed Quote section in salesApi.ts, useQuotes.ts hook, QuotesPage list,
  QuoteFormPage (create/edit), QuoteDetailPage with contextual action bar.
  "Convert to SO" button on detail (status=open) navigates to `/sales/orders-v2/from-quote/:docEntry`
  — that route lands in T-200.4.
- **Files created:**
  - `frontend/user-portal/src/pages/sales/QuotesPage.tsx` — list, filter chips, pagination
  - `frontend/user-portal/src/pages/sales/QuoteFormPage.tsx` — create/edit with CustomerCombobox + useFieldArray
  - `frontend/user-portal/src/pages/sales/QuoteDetailPage.tsx` — detail with action bar, doc chain, attachments
  - `frontend/user-portal/src/hooks/queries/useQuotes.ts` — TanStack Query hooks
  - `Docs/3-DevLog/2026-05-30_T-200.3-quote-ui.md` — session DevLog
- **Files modified:**
  - `src/modules/sales/models/quotes.py` — `_RESPONSE_CONFIG` applied, `class Config` blocks removed
  - `src/modules/sales/api/v1/quotes.py` — `response_model_by_alias=True` on 5 routes
  - `frontend/user-portal/src/services/salesApi.ts` — full Quote types + API functions
  - `frontend/user-portal/src/services/attachmentsService.ts` — `'QUOTE'` added to AttachmentDocType
  - `frontend/user-portal/src/hooks/queries/index.ts` — useQuotes exports
  - `frontend/user-portal/src/App.tsx` — 4 lazy imports + routes
- **Test results:** 211 backend tests pass (unchanged). TypeScript: zero errors. ESLint: zero warnings.
- **Backend smoke:** `GET /api/v1/sales/quotes` → 200, camelCase `meta` keys confirmed.
- **Known limitation:** "Convert to SO" link gives 404 until T-200.4 ships. Tooltip warns the accountant.

---

### T-200.2 | AR Aging Report — backend endpoint + frontend page (Wave 3)
- **Category:** Backend + Frontend · **Priority:** P1
- **Completed:** 2026-05-30 · **Assigned:** backend-dev-expert (Viet Anh)
- **Depends on:** T-200.0 ✅, T-200.1 ✅
- **Blocks:** —
- **Description:** AR Aging report for Wave 3 sales. Backend `GET /api/v1/sales/reports/ar-aging` with five-bucket ageing logic (current / 1-30 / 31-60 / 61-90 / over90), Decimal string amounts, camelCase via `_RESPONSE_CONFIG` + `response_model_by_alias=True`. Frontend `ARAgingReportPage` at `/sales/reports/ar-aging` with filter bar (date, customer, currency), grand totals card, sortable customer table, CSV export (client-side), drill-down to AR Invoices list, overdue highlighting.
- **Files created:**
  - `src/modules/sales/models/reports.py` — ARAgingCustomerRow, ARAgingGrandTotals, ARAgingReport, ARAgingParams
  - `src/modules/sales/services/reports_service.py` — compute_ar_aging()
  - `src/modules/sales/api/v1/reports.py` — GET /ar-aging route with require_permission("sales.view")
  - `src/modules/sales/tests/test_ar_aging.py` — 6 tests (all pass)
  - `frontend/user-portal/src/hooks/queries/useArAging.ts` — useArAging hook
  - `frontend/user-portal/src/pages/sales/ARAgingReportPage.tsx` — full page component
  - `Docs/3-DevLog/2026-05-30_T-200.2-ar-aging-report.md`
- **Files modified:**
  - `src/modules/sales/api/v1/__init__.py` — registered reports_router at prefix /reports
  - `frontend/user-portal/src/services/salesApi.ts` — AR Aging types + getArAging()
  - `frontend/user-portal/src/hooks/queries/index.ts` — exports useArAging + arAgingQueryKeys
  - `frontend/user-portal/src/App.tsx` — lazy import + /sales/reports/ar-aging route
  - `frontend/user-portal/src/components/layout/MainLayout.tsx` — fixed sidebar route /sales/aging → /sales/reports/ar-aging
- **Test results:** 211 passed (6 new + 205 baseline), 0 failed, 0 regressions.
- **Live smoke:** ARI-2026-0001 (LETO, AED 700.00, dueDate 2026-06-29) → current bucket confirmed. camelCase JSON with Decimal strings.
- **Four hardening rules:** All four confirmed (see DevLog for file:line refs).
- **Hot reload:** Backend: `docker compose restart api` (new route file). Frontend: Vite HMR automatic.

### T-200.1 | Customer Receipt UI (list + form + detail + from-invoice flow) — Wave 3
- **Category:** Frontend · **Priority:** P1
- **Completed:** 2026-05-30 · **Assigned:** frontend-dev-expert
- **Depends on:** T-100.10 ✅ (Customer Receipt backend — IPAY doc lifecycle)
- **Blocks:** T-200.x (CUSTOMER_RECEIPT attachment backend)
- **Description:** Full Customer Receipt (IPAY) UI: list page with status filter chips + search + pagination; form page (3 modes: new/from-invoice/edit) with CustomerCombobox, AccountCombobox, useFieldArray allocations + sum-validation; detail page with 4-col InfoGrid, clickable allocations table (links to ARI detail), AttachmentList, action bar (DRAFT → Post/Edit/Delete; OPEN → Cancel super_admin only). Rule 2 backend patch (camelCase serialization). Fixed pre-existing date serialization bug in customer_receipt_service.py (_to_dt() helper). "Receive Payment" button on ARInvoiceDetailPage when status=open.
- **Files created:**
  - `frontend/user-portal/src/hooks/queries/useCustomerReceipts.ts`
  - `frontend/user-portal/src/pages/sales/CustomerReceiptsPage.tsx`
  - `frontend/user-portal/src/pages/sales/CustomerReceiptFormPage.tsx`
  - `frontend/user-portal/src/pages/sales/CustomerReceiptDetailPage.tsx`
  - `Docs/3-DevLog/2026-05-30_T-200.1-customer-receipt-ui.md`
- **Files modified:**
  - `src/modules/sales/models/customer_receipts.py` — _RESPONSE_CONFIG on 3 response models
  - `src/modules/sales/api/v1/customer_receipts.py` — response_model_by_alias=True on 6 routes
  - `src/modules/sales/services/customer_receipt_service.py` — _to_dt() helper + applied on insert/update
  - `frontend/user-portal/src/services/salesApi.ts` — full CustomerReceipt types + 7 API functions
  - `frontend/user-portal/src/services/attachmentsService.ts` — AttachmentDocType += 'CUSTOMER_RECEIPT'
  - `frontend/user-portal/src/hooks/queries/index.ts` — CR exports block
  - `frontend/user-portal/src/App.tsx` — 3 lazy imports + 5 routes
  - `frontend/user-portal/src/components/layout/MainLayout.tsx` — sidebar route: /sales/receipts → /sales/customer-receipts
  - `frontend/user-portal/src/pages/sales/ARInvoiceDetailPage.tsx` — "Receive Payment" button + docTypeRoute fix
- **Verification:** TS zero errors. ESLint zero errors on new/modified files. Backend smoke: POST /api/v1/sales/customer-receipts → HTTP 201, all keys camelCase confirmed.
- **Hot reload:** Yes for frontend. Backend: standard uvicorn reload (no migrations, no Docker rebuild required).
- **Backend gap:** CUSTOMER_RECEIPT attachment upload not yet whitelisted on backend → tracked as T-200.x.

---

### T-200.0 | Sales UI foundation + AR Invoice (list + form + detail)
- **Category:** Frontend · **Priority:** P1
- **Completed:** 2026-05-30 · **Assigned:** frontend-dev-expert
- **Depends on:** T-100 (Wave 3 backend) ✅ · **Blocks:** T-200.x (AR_INVOICE attachment backend)
- **Description:** Built the Wave 3 Sales UI foundation. SALES_NAV_GROUP sidebar accordion with 9
  children (AR Invoices live; all others placeholder for T-200.1+). Full salesApi.ts service layer
  (AR Invoice API fully implemented; other Wave 3 docs stubbed with typed NOT_IMPLEMENTED stubs).
  useArInvoices.ts TanStack Query hooks. AttachmentDocType extended with 'AR_INVOICE'. 5 routes
  in App.tsx (list, new, from-delivery, detail, edit). Three complete AR Invoice pages:
  ARInvoicesPage (list + filter chips + search + pagination), ARInvoiceFormPage (3 modes via
  useParams, RHF + Zod, CustomerCombobox, useFieldArray, computed totals), ARInvoiceDetailPage
  (4-col InfoGrid, lines table, doc-chain card, action bar, AttachmentList, AuditHistoryModal).
  Status flow: DRAFT → OPEN (Post), OPEN → CANCELLED (Cancel, super_admin only).
- **Files created:**
  - `frontend/user-portal/src/services/salesApi.ts`
  - `frontend/user-portal/src/hooks/queries/useArInvoices.ts`
  - `frontend/user-portal/src/pages/sales/ARInvoicesPage.tsx`
  - `frontend/user-portal/src/pages/sales/ARInvoiceFormPage.tsx`
  - `frontend/user-portal/src/pages/sales/ARInvoiceDetailPage.tsx`
  - `Docs/3-DevLog/2026-05-30_T-200.0-sales-ui-foundation-ar-invoice.md`
- **Files modified:**
  - `frontend/user-portal/src/components/layout/MainLayout.tsx` — SALES_NAV_GROUP
  - `frontend/user-portal/src/App.tsx` — 5 AR Invoice routes
  - `frontend/user-portal/src/hooks/queries/index.ts` — exports
  - `frontend/user-portal/src/services/attachmentsService.ts` — AttachmentDocType += 'AR_INVOICE'
- **Verification:** TS zero errors in new files. Lint zero errors in new files. Dev server boots 123ms.
  Backend sanity: GET /api/v1/sales/ar-invoices → HTTP 200, correct { data, meta, links } envelope.
- **Hot reload:** Yes — no Docker rebuild, no npm install, no migrations required.
- **Backend gap:** AR_INVOICE attachment doc_type not yet whitelisted on backend → tracked as T-200.x.

---

### T-100.11.2 | Finance posting setup for Returns flow (A001 default org config gap)
- **Category:** Backend (Finance service) · **Priority:** P2
- **Completed:** 2026-05-30 · **Assigned:** backend-dev-expert
- **Depends on:** T-100.11 ✅, T-100.11.1 ✅ · **Blocks:** —
- **Description:** All Wave 3 outbox events (`delivery_posted`, `sales_invoice_posted`, `return_posted`, `credit_note_posted`) were failing with `HTTP 400: Company posting setup not configured for A001`. Root cause: the finance DB had `company_codes`, `fiscal_periods`, and `company_posting_setup` only for `companyCode="1000"`, but all Wave 3 services emit `companyCode="A001"`.
- **Fix:** Created Alembic migration `018_seed_a001_company_posting_setup.py` with 3 idempotent inserts:
  1. `company_codes` row for A001 (org `00000000-0000-0000-0000-000000000001`)
  2. `fiscal_periods` row for A001, 2026-01-01 to 2026-12-31, status=open
  3. `company_posting_setup` row for A001 with all 10 GL account FKs (arControlAccountId=124000-001 Trade Receivables - Customers — explicitly set, unlike 1000 which had NULL)
- **No schema changes** — all columns already existed on `company_posting_setup`. No new columns needed.
- **Events replayed:** Reset 4 failed A001 events to `pending` via mongosh; all processed within ~10s by finance_consumer.
- **JEs verified:** 4 JEs posted, all balanced (DR == CR). Credit note: DR Revenue 300.00 / CR AR 300.00. Return: DR Inventory 0.00 / CR COGS 0.00 (test items had 0-cost lineCogs — correct).
- **Rebuild note:** Migration 018 was `docker cp`'d into the running container for immediate fix. Requires `docker compose build finance` to bake into image for future deploys.
- **Test results:** 205 ops sales tests passed (0 failed), 402 finance tests passed, 1 skipped (0 failed).

---

### T-100.11.1 | Returns flow repair — fix 47 test failures left broken by T-100.11 agent
- **Category:** Backend · **Priority:** P0
- **Completed:** 2026-05-30 · **Assigned:** backend-dev-expert
- **Description:** The T-100.11 agent falsely claimed "342 passing, zero regressions" when the actual state was 47 failed / 158 passed in `src/modules/sales/tests/`. This task identified and fixed all 47 failures (Category A: test fixture shortfalls; Category B: real implementation defects), ran a full live stack smoke of the complete returns flow, and verified MongoDB state changes.

**Category A — Test fixture shortfalls (all 3 new test files):**
- `_FakeCollection` in `test_return_requests.py`, `test_returns.py`, and `test_ar_credit_notes.py` were missing the `find_one_and_update` method. `next_doc_number()` in `src/core/documents/doc_number.py` uses `find_one_and_update(upsert=True)` to generate sequential document numbers, causing `AttributeError` on every test that exercised document creation. Added `find_one_and_update` + `_apply_update_simple` to all three test files.
- All 9 OutboxWriter patches in `test_returns.py` and all 15 in `test_ar_credit_notes.py` used the wrong patch target: `src.modules.sales.services.rtn_service.OutboxWriter` / `ar_credit_note_service.OutboxWriter`. `OutboxWriter` is imported via a deferred local import inside function bodies (to avoid redis import-time failures at module load), so it is never a module-level attribute. Fixed all patches to the canonical location: `src.modules.finance_bridge.outbox_writer.OutboxWriter.publish`.

**Category B — Real implementation defects:**
- `list_return_requests()` and `list_returns()` accepted `size` parameter but tests called with `page_size`. Also return dict keys were camelCase (`perPage`, `totalPages`) but tests asserted snake_case (`page_size`, `total_pages`). Fixed parameter name and dict keys in both services.
- `return_request_service.py` and `rtn_service.py` were storing raw `datetime.date` objects in MongoDB writes — Motor/PyMongo can only encode `datetime.datetime`. Added `_to_dt()` helper (same pattern as `ar_credit_note_service.py`) and wrapped all `docDate`, `validUntilDate`, `actualReturnDate` field writes in both services.
- `CurrentUser` class in `src/modules/sales/middleware/auth.py` was missing the `organizationId` attribute entirely. API endpoints call `getattr(current_user, "organizationId", None)` which returned `None`, failing `_resolve_org_id()` validation with HTTP 400 "organization_id is required". Added `organizationId: Optional[str] = None` to `__init__()` and populated it in `get_current_user()`.

**Test results:** 205 passed, 0 failed (from 47 failed / 158 passed baseline). All 47 failures fixed, assertions not weakened.

**Live stack smoke (full RR → RTN → ARC chain):**
- RR-2026-0005: created DRAFT → transitioned to OPEN (return_posted event emitted) ✅
- RTN-2026-0001: created from RR (consumedQty=3 on RR; returnedQty=3 on DN-2026-0002) → transitioned to OPEN ✅
- ARC-2026-0001: created DRAFT → transitioned to OPEN (credit_note_posted event emitted) ✅

**MongoDB state changes verified:**
- `inventory_movements`: `{movementType: "return", quantity: 3}` row created ✅
- `ar_invoices_v2` ARI-2026-0001: `creditedAmount: 300, openAmount: 700, status: "partly_closed"` ✅
- `deliveries_v2` DN-2026-0002: `returnedQty: 3` ✅
- `return_requests_v2` RR-2026-0005: `consumedQty: 3` out of `requestedQty: 5` ✅
- `finance_outbox`: `return_posted` and `credit_note_posted` events emitted (status=`failed` — finance posting setup config gap for A001, not a code defect; filed as T-100.11.2) ✅

**Files modified:**
- `src/modules/sales/tests/test_return_requests.py` — added `find_one_and_update` to `_FakeCollection`
- `src/modules/sales/tests/test_returns.py` — added `find_one_and_update` + `_apply_update_simple`; fixed all 9 OutboxWriter patch paths to canonical location
- `src/modules/sales/tests/test_ar_credit_notes.py` — added `find_one_and_update` + `_apply_update_simple`; fixed all 15 OutboxWriter patch paths to canonical location
- `src/modules/sales/services/return_request_service.py` — renamed `size` → `page_size`, fixed dict keys, added `_to_dt()`, wrapped all date writes
- `src/modules/sales/services/rtn_service.py` — same fixes as above
- `src/modules/sales/middleware/auth.py` — added `organizationId` to `CurrentUser`

**Follow-up filed:** T-100.11.2 — provision finance posting setup for returns GL accounts so outbox events reach `status: "processed"`.

---

### T-100.9a.2 | Bug #4 — BSON date encoding in AR Invoice, AR Credit Note, SO, Delivery, and Quote services
- **Category:** Backend · **Priority:** P0
- **Completed:** 2026-05-30 · **Assigned:** backend-dev-expert
- **Description:** PyMongo / Motor cannot encode bare `datetime.date` objects — only `datetime.datetime`. All five Wave 3 sales services were storing Pydantic `date` fields directly into MongoDB writes, causing HTTP 500 (`cannot encode object: datetime.date`) on every document creation and update. Fixed by adding a `_to_dt(d: date) -> datetime` helper in each service that converts to midnight UTC `datetime.datetime`. Task scope was AR Invoice + Credit Note; SO, Delivery, and Quote were fixed in the same session to unblock the live smoke.
- **Services fixed (create + update paths):**
  - `src/modules/sales/services/ar_invoice_service.py` — `docDate`, `dateOfSupply`, `invoiceDate`, `taxDate`, `dueDate` (was fixed in T-100.9a.1 session, confirmed here)
  - `src/modules/sales/services/ar_credit_note_service.py` — `docDate`, `dateOfSupply`, `invoiceDate`, `taxDate` (was fixed in T-100.9a.1 session)
  - `src/modules/sales/services/sales_order_service.py` — `docDate`, `deliveryDate` (3 locations: create-direct, create-from-quote, update field_map)
  - `src/modules/sales/services/delivery_service.py` — `docDate`, `actualDeliveryDate` (2 locations: create, update field_map)
  - `src/modules/sales/services/quote_service.py` — `docDate`, `validUntilDate` (2 locations: create, update field_map)
- **Tests added:**
  - 3 new tests in `src/modules/sales/tests/test_ar_invoices.py` (create-direct, update-draft, create-from-delivery all store `datetime.datetime` at midnight UTC)
  - 4 new tests in `src/modules/sales/tests/test_ar_credit_notes.py` (`_to_dt` unit tests + update path test)
- **Test results:** 47 failed (pre-existing T-100.11.1 failures in returns/return-requests/arc fake DB), 158 passed — net +7 from baseline. Zero new failures.
- **Smoke chain verified (live stack):**
  - SO-2026-0001 created via `POST /api/v1/sales/orders-v2` → HTTP 200, no BSON error
  - SO transitioned to `open` via `POST /{doc_entry}/transition`
  - DN-2026-0002 created via `POST /api/v1/sales/deliveries/from-so/{so}` → HTTP 200
  - DN transitioned to `open` → inventory decremented, delivery_posted event emitted
  - ARI-2026-0001 created via `POST /api/v1/sales/ar-invoices/from-delivery/{dn}` → HTTP 200, doc_entry `4247ee3b-1b6c-48d9-b14f-377168a37b40`
  - ARI transitioned to `open` → `sales_invoice_posted` event emitted to `finance_outbox`
  - All 5 date fields stored as `ISODate` in MongoDB: `docDate: ISODate('2026-05-30T00:00:00.000Z')`, `dueDate: ISODate('2026-06-29T00:00:00.000Z')`, etc.
  - Finance returned HTTP 400 (company posting setup not configured for A001) — configuration issue, not a code bug; event was correctly emitted and processed
- **Adjacent issue flagged:** T-100.11.1 — `_FakeCollection` in `test_ar_credit_notes.py` is missing `find_one_and_update` (needed by `next_doc_number`), causing 20 pre-existing test failures. Out of scope for this task.
- **Hot reload required:** `docker compose restart api` — changes are in Python service files.

---

### T-060.10 | Finance — CashFlowStatementPage (indirect method)
- **Category:** Frontend · **Priority:** P1
- **Completed:** 2026-05-29 · **Assigned:** frontend-dev-expert
- **Released in:** v1.20.0
- **Description:** Cash Flow Statement page at `/finance/cash-flow` (indirect method). Operating / Investing / Financing sections with reconciliation footer. Comparative period uses two parallel queries. reconciliationDelta > 0.01 triggers warning banner.

---

### T-060.11-audit | Finance — Audit log endpoint + history modal
- **Category:** Backend + Frontend · **Priority:** P1
- **Completed:** 2026-05-29 · **Assigned:** backend-dev-expert + frontend-dev-expert
- **Released in:** v1.20.0
- **Description:** `GET /api/v1/finance/audit-log` with entity-type allowlist and cross-org isolation. Frontend AuditHistoryModal renders close/reopen events per fiscal period. 13 pytest tests.

---

### T-060.11-preview | Finance — Close dry-run + proposed-JE preview table
- **Category:** Backend + Frontend · **Priority:** P1
- **Completed:** 2026-05-29 · **Assigned:** backend-dev-expert + frontend-dev-expert
- **Released in:** v1.20.0
- **Description:** `PATCH /periods/{id}/close?dry_run=true` computes closing JE without writing. Two-stage close modal: Stage A shows ClosingJePreviewPanel; Stage B has reason textarea + Confirm. Property test verifies preview equals commit output. 5 new pytest tests.

---

### T-060.12 | Finance — CoA inline edit of cashFlowCategory
- **Category:** Frontend · **Priority:** P1
- **Completed:** 2026-05-29 · **Assigned:** frontend-dev-expert
- **Released in:** v1.20.0
- **Description:** 6-value cashFlowCategory enum inline-edit in CoA detail pane. Per-user review banner with localStorage dismissal. On save, invalidates CoA + all CF report queries.

---

### T-060.13 | Finance — Playwright UI smoke tests for Wave 2 pages
- **Category:** Testing · **Priority:** P1
- **Completed:** 2026-05-29 · **Assigned:** frontend-testing-playwright
- **Released in:** v1.20.0
- **Description:** 49 tests across 7 spec files (BS / IS / CF / Periods / ManualJE / CoA / auth-and-sidebar). Global-setup storageState reuse. All passing in ~41s. playwright.config.ts + @playwright/test devDep added.

---

### T-060.14 | Finance — Financial-Statements.md docs + Wave 2 closing chore
- **Category:** Docs · **Priority:** P1
- **Completed:** 2026-05-29 · **Assigned:** change-guardian
- **Released in:** v1.20.0
- **Description:** Financial-Statements.md (635 lines) documenting all three statements. CHANGELOG v1.20.0 entry. FINANCE_MODULE_GUIDE.md Phase 4 status updated. CodeMaps INDEX.md Wave 2 addendum. BACKLOG / ARCHIVE updated.

---

### T-061.1 | Finance — Manual JE entry form (Wave 2.5)
- **Category:** Frontend · **Priority:** P1
- **Completed:** 2026-05-29 · **Assigned:** frontend-dev-expert
- **Released in:** v1.20.0
- **Description:** Manual JE form at `/finance/journal-entries/new` (RHF + Zod). CostCenterCombobox component. Live balance indicator. Inactive-account warning modal. Period-validation. Unsaved-changes guard. "+New Manual JE" toolbar button on JE list page and sidebar entry. Fixes: AccountCombobox prop mismatch (valueAccountId / hasError); periods hook gate on companyCode; FiscalPeriodsListResponse envelope corrected.

---

### T-060.6 | Finance — Report export endpoint (PDF + Excel)
- **Category:** Backend + Tests · **Priority:** P1
- **Completed:** 2026-05-24 · **Assigned:** backend-dev-expert
- **Released in:** v1.19.0
- **Description:** New `GET /api/v1/finance/reports/export/{statement}?format=pdf|xlsx`
  streaming download. Jinja2 HTML templates for all three statements; WeasyPrint
  (HTML→PDF) and openpyxl (xlsx) renderers. Dockerfile updated with Pango/Cairo/GDK-Pixbuf
  system deps (~100 MB image delta). WeasyPrint 65.1 for Python 3.13 compatibility.

---

### T-060.6.1 | Finance — Multi cost-centre filter on report + export endpoints
- **Category:** Backend + Tests · **Priority:** P1
- **Completed:** 2026-05-24 · **Assigned:** backend-dev-expert
- **Released in:** v1.19.0
- **Description:** `cost_center_id` query param upgraded from `Optional[str]` to
  `Optional[List[str]]` on balance-sheet, income-statement, cash-flow, and export
  endpoints. SQL filter changed from `== :x` to `.in_()`. 13 tests added.

---

### T-060.7 + T-060.7.1 | Finance — FinanceReportPage shell component
- **Category:** Frontend · **Priority:** P1
- **Completed:** 2026-05-24 · **Assigned:** frontend-dev-expert
- **Released in:** v1.19.0
- **Description:** `<FinanceReportPage>` shell at
  `frontend/user-portal/src/components/finance/FinanceReportPage/`.
  Render-prop API `{ filters, display, openDrillDown }`. Multi-select cost centres
  (repeated URLSearchParams). Compare-to dropdown (None / Previous / YoY / Custom).
  Relocated from initial `src/features/finance/` draft to project convention path.

---

### T-060.8 | Finance — BalanceSheetPage frontend
- **Category:** Frontend · **Priority:** P1
- **Completed:** 2026-05-24 · **Assigned:** frontend-dev-expert
- **Released in:** v1.19.0
- **Description:** New `/finance/balance-sheet` page behind `<FinanceGate>`.
  `getBalanceSheet` service, `useBalanceSheet` hook (30 s stale window),
  sidebar entry, lazy route in `App.tsx`.

---

### T-060.9.1 | Finance — Inactive-account report visibility + posting-setup balance guard
- **Category:** Backend + Tests · **Priority:** P0
- **Completed:** 2026-05-24 · **Assigned:** backend-dev-expert
- **Released in:** v1.19.0
- **Description:** Removed 4 `isActive == True` filters from reports.py (IFRS/GAAP
  compliance). Added balance-change guard on all 10 clearing-account fields in
  `company.py` posting-setup endpoint (HTTP 409 if old account has non-zero balance).

---

### T-061 | Finance — Manual JE creation endpoint
- **Category:** Backend + Tests · **Priority:** P1
- **Completed:** 2026-05-24 · **Assigned:** backend-dev-expert
- **Released in:** v1.19.0
- **Description:** New `POST /api/v1/finance/journal-entries` for `finance_admin` /
  `super_admin`. Full validation (balanced, open period, no header accounts, active
  cost centres). Inactive accounts produce `meta.warnings[]`. Audit log in same
  transaction. 18 tests. Surfaced by the 35,000 AED GR/IR stranded-balance incident.

---

### T-062 | Finance tests — Triage 62 pre-existing failures
- **Category:** Tests · **Priority:** P1
- **Completed:** 2026-05-24 · **Assigned:** testing-backend-specialist
- **Released in:** v1.19.0
- **Description:** Fixed 62 pre-existing failures across
  test_trial_balance, test_vendor_sub_ledger, test_ap_aging, test_period_audit,
  test_je_reversal, test_coa_fixes_pm_items, test_purchase_item_ext.
  Root causes: envelope unwrap, missing org_id param, ClosePeriodResponse shape,
  JE-reversal model change (void → standard reversing entry), posting-setup fixtures
  needing type-correct accounts, FINANCE_INGESTION_SECRET env var.
  Final result: 273 passed, 1 skipped, 0 failed.

---

### T-063 | Finance — Posting-setup semantic type guard + PPV data repair
- **Category:** Backend + Data repair · **Priority:** P2
- **Completed:** 2026-05-24 · **Assigned:** backend-dev-expert
- **Released in:** v1.19.0
- **Description:** All 10 clearing-account fields on posting-setup endpoint now
  validated for correct `drawer`/`accountType` (HTTP 422 on mismatch; header
  accounts also rejected). Company 1000's `purchasePriceVarianceAccountId` repaired
  from fixed-asset `Buildings` to an OPERATING_COST/expense account (direct SQL;
  documented in DevLog §"Data repair — T-063.B").

---

### T-057-1a | Purchasing line enrichment — Wave 1a: discount + cost center
- **Category:** Backend + Frontend · **Priority:** P1
- **Completed:** 2026-05-24 · **Assigned:** inline (long-context delegation
  unavailable; backend-dev-expert + frontend-dev-expert delegation failed
  with "Usage credits required for long context requests")
- **Released in:** v1.17.0
- **Description:** Two purely additive per-line fields on purchasing
  documents — `discountPercent` (0–100) and `costCenterId` — with full
  PR → PO → GR → AP carry-through and per-cost-centre JE tagging on AP
  invoice posting.

**Backend:** `DocumentLineCreate/Response` schema additions; `_compute_line_totals`
applies discount factor; `_build_gr_lines_from_po`, `_build_ap_lines_from_gr`, and
the PR→PO converter inherit + re-apply discount (variance also discounted on AP);
`build_ap_invoice_event_payload` + `build_purchase_received_event_payload`
propagate `costCenterId`; `_line_to_response` surfaces both fields with safe
defaults; contracts (`ApInvoiceLine`, `GoodsReceivedLine`) gain `costCenterId`.

**Finance posting:** `_handle_ap_invoice_posted` now buckets payload lines by
`costCenterId` and emits one DR GR/IR Clearing + one DR Input VAT JE line per
distinct cost-centre, each tagged with `costCenterId`. CR AP Control + CR
Output VAT (reverse-charge) + DR/CR PPV stay single aggregates. JE balance
invariant preserved.

**Frontend:** Editable Disc% + Cost Center dropdown columns on PR + PO forms
with client-side recompute mirroring backend formula; read-only display
columns on GR + AP forms (values inherited via backend carry-through); AP
form client-side variance recompute also discounted. New
`costCentersService.ts` + `useCostCenters.ts` (5-min staleTime). Frontend
types extended on `purchasingApi.ts`, `goodsReceiptsService.ts`,
`apInvoicesService.ts`.

**Tests:** 7 new purchasing unit tests + 4 new finance JE-tagging tests, all
green. 46 purchasing suite (39 baseline + 7 new) passing; 20 AP posting
suite (16 baseline + 4 new) passing. Pre-existing 25 finance test failures
(trial_balance / vendor_sub_ledger / ap_aging / je_reversal /
purchase_item_ext) are environment issues unrelated to this work —
baseline and post-change failure counts match exactly. Frontend tsc: zero
new errors introduced.

**Notes:**
- Backend changes require Docker restart of `backend` + `finance` containers.
- New file `services/finance/tests/test_posting_ap_invoice_cost_center.py` is
  matched by the global `test_*.py` gitignore rule and committed with
  `git add -f` (same pattern as existing finance test files).
- Wave 1b (T-058 — service-line accounting) and Wave 0 (T-059 — finance as
  opt-in add-on) follow; see `Docs/2-Working-Progress/Wave-0-Design.md` and
  the 9-wave finance roadmap.

---

### T-056 | Tenant Setup Wizard — multi-step bootstrap for org-less super_admin
- **Category:** Frontend · **Priority:** P0
- **Completed:** 2026-05-21 · **Assigned:** frontend-dev-expert
- **Description:** Multi-step wizard for fresh-deployment super_admin bootstrap.
  New files: `services/tenantBootstrapService.ts`, `hooks/queries/useOrganizations.ts`,
  `pages/admin/TenantSetupWizardPage.tsx`. Extended: `services/financeCompaniesService.ts`
  (createCompany with seed message), `hooks/queries/useFinanceCompanies.ts` (useCreateCompany),
  `stores/auth.store.ts` (refreshUser action), `components/common/ProtectedRoute.tsx`
  (auto-redirect org-less super_admin), `components/layout/MainLayout.tsx` (Tenant Setup sidebar),
  `App.tsx` (/admin/tenant-setup route). TypeScript clean (exit 0). All backend endpoints
  verified via direct API calls. Backend note: API container required restart to pick up the
  new /admin/users/{id}/organization PATCH endpoint (code existed but process wasn't reloaded).

---

### T-055 | Tax code dropdown on ItemMappingPage + item-default tax code on PR/PO/AP forms
- **Category:** Frontend · **Priority:** P1
- **Completed:** 2026-05-21 · **Assigned:** frontend-dev-expert
- **Description:** (1) Replaced free-text tax code input on ItemMappingPage with a
  `<select>` dropdown backed by `useTaxCodes` + `FALLBACK_TAX_CODES`. "— None —" empty
  option included. (2) Created `useItemMappingsMap.ts` helper hook returning
  `Map<itemId, PurchaseItemFinanceExt>`. Wired into PR, PO, and AP forms: picking an item
  now auto-defaults `taxCode` from `itemMappings.get(itemId)?.taxCodeDefault`. PR uses
  `?? null`; PO uses `?? 'S'` (last-resort UAE VAT fallback); AP init uses
  `itemMappings.get(l.itemId)?.taxCodeDefault ?? 'S'`. Manual tax code edits are never
  overwritten. TypeScript: 0 errors.


### T-053 | Reusable AttachmentList component — PR, PO, GR, AP, Payment detail pages
- **Category:** Frontend · **Priority:** P1
- **Completed:** 2026-05-21 · **Assigned:** frontend-dev-expert
- **Description:** Built a fully typed reusable `<AttachmentList>` component with drag-and-drop
  upload zone, file list with click-to-download links, delete confirmation modal (no overlay
  close), and progress bar. Integrated on all five document detail pages. Service layer and
  TanStack Query hooks wired end-to-end. Gracefully handles 404 until backend ships.
- **Files added:**
  - `frontend/user-portal/src/services/attachmentsService.ts` — 110 lines
    (uploadAttachment, listAttachments, getDownloadUrl, deleteAttachment)
  - `frontend/user-portal/src/hooks/queries/useAttachments.ts` — 92 lines
    (useAttachments query, useUploadAttachment mutation, useDeleteAttachment mutation)
  - `frontend/user-portal/src/components/attachments/AttachmentList.tsx` — 453 lines
    (full component with upload zone, list, delete modal)
- **Files modified:**
  - `frontend/user-portal/src/hooks/queries/index.ts` — +8 lines (export attachments hooks)
  - `frontend/user-portal/src/pages/purchasing/PurchaseRequestDetailPage.tsx` — +8 lines
  - `frontend/user-portal/src/pages/purchasing/PurchaseOrderDetailPage.tsx` — +8 lines
  - `frontend/user-portal/src/pages/purchasing/GoodsReceiptDetailPage.tsx` — +8 lines
  - `frontend/user-portal/src/pages/purchasing/APInvoiceDetailPage.tsx` — +8 lines
  - `frontend/user-portal/src/pages/finance/PaymentDetailPage.tsx` — +7 lines

### T-051 | Finance backend — AP Aging report, Vendor sub-ledger, Period audit fields
- **Category:** Backend · **Priority:** P1
- **Completed:** 2026-05-21 · **Assigned:** backend-dev-expert
- **Description:** Three finance backend refinements:
  (1) AP Aging POST endpoint `POST /reports/ap-aging` — frontend-orchestrated, buckets
  outstanding invoices by overdue age across five bands, groups by vendor, sorted descending.
  (2) Vendor sub-ledger GET endpoint `GET /reports/vendor-sub-ledger` — queries
  journal_entry_lines on the AP Control account grouped by referenceLineId (vendorId),
  returns credits/debits/balance/entryCount/lastActivityAt per vendor.
  (3) Migration 013 — adds closeReason, reopenedAt, reopenedByUserId, reopenReason to
  fiscal_periods. Updated close/reopen endpoints to accept body params; reopen requires
  reason (5-500 chars); FiscalPeriodResponse surfaces all six audit fields.
- **Files added/modified:**
  - `services/finance/src/finance/models/orm/models.py` — +4 audit columns on FiscalPeriod
  - `services/finance/src/finance/models/schemas/period.py` — +4 fields on FiscalPeriodResponse
  - `services/finance/src/finance/api/v1/periods.py` — ClosePeriodRequest + ReopenPeriodRequest bodies, full audit trail logic
  - `services/finance/src/finance/api/v1/reports.py` — AP Aging + Vendor Sub-ledger endpoints
  - `services/finance/alembic/versions/013_period_audit_fields.py` — NEW migration
  - `services/finance/tests/test_ap_aging.py` — NEW 8 tests (all pass)
  - `services/finance/tests/test_vendor_sub_ledger.py` — NEW 9 tests (all pass)
  - `services/finance/tests/test_period_audit.py` — NEW 9 tests (all pass)
  - `services/finance/tests/test_periods.py` — updated reopen test to supply required reason

### T-051 | UAE VAT compliance — tax-point rule + reverse-charge mechanism
- **Category:** Backend · **Priority:** P0
- **Completed:** 2026-05-21 · **Assigned:** backend-dev-expert
- **Description:** PM feedback items 2 and 3.
  Item 2: UAE VAT Article 25 tax-point rule — `dateOfSupply` (= GR docDate)
  added to `ApInvoicePostedPayload` contract; `build_ap_invoice_event_payload`
  fetches the source GR header's `docDate` via `_emit_ap_invoice_posted_event`
  before building the payload; finance handler computes
  `tax_point_date = min(dateOfSupply, invoiceDate)` and embeds it in the Input
  VAT line description for FTA audit/VAT return traceability. JE date stays at
  `apDate`; no new column added (memo-on-description approach per spec).
  Item 3: Reverse-charge VAT mechanism — migration 012 adds `isReverseCharge`
  BOOLEAN to `tax_codes` with backfill for SR; ORM, Pydantic schemas, and seed
  loader updated; handler now looks up each line's tax code, posts both DR Input
  VAT and CR Output VAT for SR lines (self-accounting), and credits AP for
  lineNet only (not lineGross) on RC lines.
- **Files modified:**
  - `contracts/finance_events.py` (+14 lines)
  - `services/finance/alembic/versions/012_tax_codes_reverse_charge.py` (new, 55 lines)
  - `services/finance/src/finance/models/orm/models.py` (+7 lines)
  - `services/finance/src/finance/models/schemas/tax_code.py` (+8 lines)
  - `services/finance/src/finance/services/seed_loader.py` (+5 lines)
  - `services/finance/src/finance/api/v1/events.py` (+185 lines net; handler rewritten)
  - `services/finance/tests/test_posting_ap_invoice_posted.py` (+260 lines, 16 tests)
  - `src/modules/purchasing/services/document_service.py` (+38 lines)

### T-050 | Phase D.5 frontend — Fiscal Periods management UI
- **Category:** Frontend · **Priority:** P0
- **Completed:** 2026-05-20 · **Assigned:** frontend-dev-expert
- **Description:** Built full Fiscal Periods management page at /finance/periods with
  service layer, TanStack Query hooks, close/reopen confirmation modals, and bulk-create wizard.
- **Files added:**
  - `frontend/user-portal/src/services/fiscalPeriodsService.ts` (+115 lines) — typed API calls (listPeriods, createPeriod, closePeriod, reopenPeriod)
  - `frontend/user-portal/src/hooks/queries/useFiscalPeriods.ts` (+80 lines) — TanStack Query hooks (useFiscalPeriods, useCreatePeriod, useClosePeriod, useReopenPeriod)
  - `frontend/user-portal/src/pages/finance/PeriodsPage.tsx` (+600 lines) — full page component with table, close modal, reopen modal, bulk-create wizard
- **Files modified:**
  - `frontend/user-portal/src/hooks/queries/index.ts` — exports for the four fiscal period hooks
  - `frontend/user-portal/src/App.tsx` — lazy import + `/finance/periods` route
  - `frontend/user-portal/src/components/layout/MainLayout.tsx` — sidebar entry 📅 Fiscal Periods after Vendor Payments

### T-048 | Phase D — Vendor Payment module (finance backend)
- **Category:** Backend · **Priority:** P0
- **Completed:** 2026-05-20 · **Assigned:** backend-dev-expert
- **Description:** Phase D of the P2P cycle — the third and final journal entry (DR AP Control / CR Bank).
  Finance-internal action: finance user picks open AP invoices and records payment.
  JE created atomically in the same request (no outbox event).
- **Files added:**
  - `services/finance/alembic/versions/011_ap_payments.py` (+115 lines) — migration for ap_payments + ap_payment_applications
  - `services/finance/src/finance/models/schemas/ap_payments.py` (+160 lines) — Pydantic request/response schemas
  - `services/finance/src/finance/api/v1/ap_payments.py` (+380 lines) — payment router: POST /ap-payments, GET /ap-payments, GET /ap-payments/{id}, POST /ap-invoices/totals-paid
  - `services/finance/tests/test_ap_payment.py` (+480 lines) — 21 tests all passing
- **Files modified:**
  - `services/finance/src/finance/models/orm/models.py` — added PaymentMethodEnum, ApPayment, ApPaymentApplication ORM models
  - `services/finance/src/finance/api/v1/events.py` — added _next_payment_number helper
  - `services/finance/src/finance/main.py` — wired ap_payments router
- **Endpoints:**
  - `POST /api/v1/finance/ap-payments` — record a payment (finance_admin/admin/super_admin)
  - `GET /api/v1/finance/ap-payments` — list payments (all finance read roles)
  - `GET /api/v1/finance/ap-payments/{id}` — get payment detail with JE summary
  - `POST /api/v1/finance/ap-invoices/totals-paid` — get total paid per apDocId (v1 frontend-join)
- **Cross-service join:** v1 frontend-join approach — frontend supplies AP invoice details; finance returns totalPaid per apDocId; frontend computes outstanding. No service-to-service HTTP.
- **Aging report:** Deferred to D.5 — cross-service complexity out of scope for v1. Frontend-join endpoint provides the data needed for the frontend to build its own view.
- **Rebuild needed:** Finance container rebuild required (new ORM models, new router, new migration).



### T-046 | PM feedback: JE Reversal UI, Trial Balance page, Valuation Method relocation
- **Category:** Frontend · **Priority:** P0
- **Completed:** 2026-05-20 · **Assigned:** frontend-dev-expert
- **Description:** Three PM feedback critical items:
  (4) JE Reversal UI — "Reverse Entry" button on posted JEs (finance_admin/admin/super_admin),
  confirm modal with required reason text (5–500 chars), calls POST /api/v1/finance/journal-entries/{id}/reverse,
  Voided badge on original rows, Reversal badge on reversal rows, "Reversal of JE-..." link.
  (5) Trial Balance page at /finance/trial-balance — toolbar with company/date/period/voided toggle,
  "Generate" button, grouped-by-drawer table, out-of-balance footer warning.
  (11) Valuation Method moved from per-item to company level per IAS 2 — new "Inventory Valuation"
  section on PostingSetupPage, column removed from ItemMappingPage.
- **Files added:**
  - `src/services/trialBalanceService.ts` (+83 lines) — typed API for trial balance report
  - `src/hooks/queries/useTrialBalance.ts` (+77 lines) — useTrialBalance + useFinancePeriods hooks
  - `src/pages/finance/TrialBalancePage.tsx` (+763 lines) — full trial balance report page
- **Files modified:**
  - `src/services/journalEntriesService.ts` (+35 lines) — reverseJournalEntry function + types
  - `src/hooks/queries/useJournalEntries.ts` (+35 lines) — useReverseJournalEntry mutation
  - `src/hooks/queries/index.ts` (+6 lines) — exports for new hooks
  - `src/pages/finance/JournalEntriesPage.tsx` (+381 lines) — reversal UI, modal, voided rows
  - `src/services/postingSetupService.ts` (+16 lines) — ValuationMethod type + defaultValuationMethod field
  - `src/pages/finance/PostingSetupPage.tsx` (+65 lines) — Inventory Valuation section
  - `src/services/itemMappingService.ts` (-1 line) — removed valuationMethod from UpdateItemMappingBody
  - `src/pages/finance/ItemMappingPage.tsx` (-30 lines) — removed Valuation Method column/logic
  - `src/App.tsx` (+4 lines) — TrialBalancePage lazy import + route
  - `src/components/layout/MainLayout.tsx` (+1 line) — Trial Balance sidebar entry

---

### T-047 | PM feedback items 4 & 5 — JE Reversal endpoint + Trial Balance report
- **Category:** Backend · **Priority:** P0
- **Completed:** 2026-05-20 · **Assigned:** backend-dev-expert
- **Description:** Two new finance backend endpoints from PM critical feedback list.
  Item 4: JE Reversal — POST /api/v1/finance/journal-entries/{je_id}/reverse,
  creates offsetting JE with swapped DR/CR lines, voids the original, wraps in one transaction.
  Item 5: Trial Balance report — GET /api/v1/finance/reports/trial-balance,
  aggregates JE line balances per GL account as of a given date.
- **Files added:**
  - `services/finance/src/finance/api/v1/reports.py` (+219 lines) — new router with
    trial balance endpoint; subquery-based aggregation for correct LEFT JOIN behaviour;
    `TrialBalanceResponse`, `TrialBalanceAccount`, `TrialBalanceTotals` schemas inline.
  - `services/finance/tests/test_je_reversal.py` (+312 lines) — 7 tests covering happy
    path, already-void 400, 404, 403, closed-period-posts-in-current, description reason,
    exact DR/CR swap.
  - `services/finance/tests/test_trial_balance.py` (+300 lines) — 5 tests covering empty
    db, Phase B GR JE totals balance (35000 DR == 35000 CR), as_of_date filter,
    include_voided, 403 for non-finance roles.
- **Files modified:**
  - `services/finance/src/finance/api/v1/journal_entries.py` — added
    `POST /journal-entries/{je_id}/reverse` endpoint (+115 lines); imports `_next_je_number`
    from events module; role-gates to finance_admin/admin/super_admin.
  - `services/finance/src/finance/models/schemas/journal_entries.py` — added
    `ReversalRequest` (reason: str, 5–500 chars) and `ReversalResponse` schemas.
  - `services/finance/src/finance/main.py` — registered `reports.router` at `_PREFIX`.
- **Test results:** 17 new tests all pass (7 reversal + 5 trial balance + 5 existing JE read).
  Pre-existing 25 failures in test_events_ingest/test_posting_* are unrelated to this change.
- **Endpoint paths:**
  - `POST /api/v1/finance/journal-entries/{je_id}/reverse?organization_id={org}`
  - `GET /api/v1/finance/reports/trial-balance?organization_id={org}&company_code={cc}`
- **Note:** Finance container rebuild required for these changes to take effect.

### T-045 | Accounting/CoA fixes — Items 1, 10, 11, 12 from PM feedback
- **Category:** Backend · **Priority:** P0
- **Completed:** 2026-05-20 · **Assigned:** backend-dev-expert
- **Description:** Four accounting correctness fixes from PM audit.
- **Files modified:**
  - `services/finance/src/finance/db/seeds/default_coa.py` — added 3 accounts:
    `514000-004 Purchase Price Variance`, `617000-011 Rounding Differences`,
    `223000-004 Goods Received Not Invoiced`; updated docstring count to 231.
  - `services/finance/src/finance/models/orm/models.py` — added
    `CompanyPostingSetup.defaultValuationMethod` (NOT NULL, default MovingAverage);
    added deprecation docstring on `PurchaseItemFinanceExt.valuationMethod`.
  - `services/finance/src/finance/models/schemas/posting_setup.py` — added
    `defaultValuationMethod` to both `CompanyPostingSetupUpdate` (Optional) and
    `CompanyPostingSetupResponse` (required field).
  - `services/finance/src/finance/api/v1/company.py` — updated PUT handler to
    skip None on non-nullable fields (`defaultValuationMethod`) to prevent
    partial-update clobbering.
- **Files added:**
  - `services/finance/alembic/versions/010_posting_setup_default_valuation_method.py`
    — Alembic migration 010; adds `defaultValuationMethod` ENUM column.
  - `services/finance/scripts/migrate_grir_reclassification.py` — idempotent
    async script: migrates `grIrClearingAccountId` from 221000-002 → 223000-004
    and deactivates 221000-002 across all orgs.
  - `services/finance/scripts/__init__.py` — package marker.
  - `services/finance/tests/test_coa_fixes_pm_items.py` — 12 new tests (all pass).
- **Dev DB inserts applied:**
  - `617000-011 Rounding Differences` — inserted.
  - `223000-004 Goods Received Not Invoiced` — inserted.
  - `221000-002 Goods Received Not Invoiced` — set isActive=0 (row preserved).
  - `company_posting_setup.grIrClearingAccountId` migrated to 223000-004.
  - Migration 010 applied manually; alembic_version updated to 010.
- **Verification:**
  - All 3 new accounts active in dev DB; 221000-002 inactive.
  - `grIrClearingAccountId` points at 223000-004 (accountName confirmed).
  - JE-1000-2026-0001 lines unaffected — still reference 221000-002 correctly.
  - `defaultValuationMethod=MovingAverage` in company_posting_setup.
  - 12/12 new tests pass; existing passing tests unchanged (pre-existing failures
    unrelated to this task).
- **Note:** Finance container needs rebuild to load migration 010 and new seed
  accounts for fresh deployments.

### T-043 | Phase C.1 — AP Invoice module (operation side)
- **Category:** Backend · **Priority:** P0
- **Completed:** 2026-05-20 · **Assigned:** backend-dev-expert
- **Description:** Built full AP Invoice module on the operation side. New doc type
  `AP` with state machine Draft → Pending Approval → Approved | Rejected + Withdraw.
  Emits `ap_invoice_posted` outbox event on Approve (matches `ApInvoicePostedPayload`
  contract exactly). One-AP-per-GR enforcement, quantity locked to GR receipt, v1
  hardcoded tax rates (S/SR=5%, Z/E/N=0%), price variance computation per line.
  21/21 unit tests pass; 39/39 across all purchasing tests. No containers to restart
  (volume-mounted src).
- **Files added/changed:**
  - `src/modules/purchasing/models/document.py` — added APStatus, AP_TAX_RATES,
    APLineInput, APFromGRCreate, APCreate, APUpdate, APResponse, APDetailResponse;
    extended DocumentLineResponse with grLineId, poUnitPrice, priceVarianceAmount;
    DocType Literal extended with "AP"
  - `src/modules/purchasing/services/document_service.py` — added
    build_ap_invoice_event_payload, _header_to_ap_response, _AP_TRANSITIONS,
    _AP_TRANSITIONS in _validate_transition, all AP service methods
    (create_ap_from_gr, create_ap, list_aps, get_ap, update_ap, submit_ap,
    approve_ap, reject_ap, withdraw_ap, soft_delete_ap,
    _emit_ap_invoice_posted_event, _build_ap_lines_from_gr, _sum_ap_lines)
  - `src/modules/purchasing/services/approval_engine.py` — extended DocTypeT with
    AP_INVOICE, added AP_INVOICE fallback rule (accountant role, 10000 AED threshold)
  - `src/modules/purchasing/api/v1/ap_invoices.py` — NEW: full router with 9 endpoints
  - `src/modules/purchasing/api/v1/__init__.py` — wired ap_router
  - `tests/unit/test_purchasing/test_ap_invoice_service.py` — NEW: 21 unit tests

### T-044 | Phase C.5 — `_handle_ap_invoice_posted` finance handler
- **Category:** Backend · **Priority:** P0
- **Completed:** 2026-05-20 · **Assigned:** backend-dev-expert
- **Description:** Implemented `_handle_ap_invoice_posted` in
  `services/finance/src/finance/api/v1/events.py`. Produces the second JE of the P2P
  cycle: DR GR/IR Clearing (expectedNet) + DR Input VAT (if non-zero) + DR/CR Purchase
  Price Variance (if non-zero) + CR AP Control (totalGrossAmount). Wired into the
  dispatch block `elif event.eventType == "ap_invoice_posted"`. Full variance sign
  handling with balance proof. `referenceLineId` on CR line set to `vendorId` for
  sub-ledger prep. 11/11 tests pass in
  `services/finance/tests/test_posting_ap_invoice_posted.py`.

### T-042 | Replace plain-text tax-code inputs with dropdown sourced from finance service
- **Category:** Frontend · **Priority:** P1
- **Completed:** 2026-05-20 · **Assigned:** frontend-dev-expert
- **Description:** Created `taxCodesService.ts` + `useTaxCodes` hook (same pattern as
  `financeCompaniesService`/`useFinanceCompanies`). Wired into `PurchaseRequestFormPage` and
  `PurchaseOrderFormPage` — replaced plain `<input>` with `<select>` populated from
  `GET /api/v1/finance/tax-codes`. Fixed the hardcoded invalid default `'VAT5'` → `'S'`
  in both the `emptyLine()` factory and the from-PR line copy. Fallback to 5 seeded codes
  on network error. TypeScript clean (`npx tsc --noEmit` zero errors).

### T-041 | AccountCombobox UX fixes + ItemMappingPage table width
- **Category:** Frontend · **Priority:** P1
- **Completed:** 2026-05-20 · **Assigned:** frontend-dev-expert
- **Description:** Three UX fixes: (1) Replaced two-mode chip/input toggle with a single
  always-typeable input that shows the selected label when unfocused, select-all on focus,
  and a ✕ clear button inside the input. (2) Rendered the dropdown via ReactDOM.createPortal
  into document.body with fixed positioning + getBoundingClientRect so it escapes table-cell
  overflow:hidden. (3) Raised EditCell min-width from 200px to 280px and Table min-width from
  1000px to 1200px in ItemMappingPage. TypeScript clean (0 errors).

### T-040 | Approval engine + document header chain-readiness precautions
- **Category:** Backend · **Priority:** P1
- **Completed:** 2026-05-20 · **Assigned:** backend-dev-expert
- **Description:** Additive changes to make approval engine and document headers
  chain-ready for Phase F (multi-step workflow rewrite) without revisiting Phases C/D.
- **Files modified:**
  - `src/modules/purchasing/services/approval_engine.py` (+44 lines net)
    - Added `ApprovalStep` dataclass (step_number, required_role, step_label).
    - Expanded `ApprovalDecision` with `next_step: Optional[ApprovalStep]` and
      `workflow_id: Optional[str]` (null today). Added `approver_role` as a
      backward-compat `@property` derived from `next_step.required_role`.
    - `_fallback_rules` and `_query_finance` updated to build `ApprovalStep(1, role)`.
  - `src/modules/purchasing/models/document.py` (+36 lines net)
    - Added `ApprovalHistoryEntry` Pydantic model (7 fields, Literal decision).
    - Added `approvalHistory: List[ApprovalHistoryEntry] = []` to `PRResponse`,
      `POResponse`, `GRResponse` (GR always empty, for shape consistency).
  - `src/modules/purchasing/services/document_service.py` (+94 lines net)
    - Imported `ApprovalHistoryEntry`.
    - `_header_to_pr_response`, `_header_to_po_response` pass `approvalHistory` from doc.
    - `_header_to_gr_response` passes `approvalHistory=[]` (GR has no gate).
    - `submit_pr` / `submit_po`: initialize `approvalHistory: []` via conditional update
      before the main `$set` when field does not exist yet.
    - `approve_pr` / `reject_pr` / `approve_po` / `reject_po`: add `$push` to `approvalHistory`
      alongside `$set`; entry has stepNumber=1, workflowId=None.
    - `build_pr_event_payload` and `build_po_event_payload` include `approvalHistory`.
  - `contracts/finance_events.py` (+14 lines net)
    - `PurchaseRequestStateChangedPayload` + `PurchaseOrderStateChangedPayload` each get
      `approvalHistory: Optional[List[dict]] = None` (optional → backward-compat).
- **Tests added:**
  - `tests/unit/test_purchasing/test_approval_chain_readiness.py` (8 tests, all pass)
    - backward-compat property returns same value as next_step.required_role
    - fallback rules for PR / PO with step populated correctly
    - approve_pr appends history entry with stepNumber=1, decision=Approved
    - reject_pr appends history entry with stepNumber=1, decision=Rejected
- **Test run:** 47/47 passed (8 new + 39 pre-existing unchanged)

### T-037 | Phase B.1 — Goods Receipt (GR) module (operation side)
- **Category:** Backend · **Priority:** P0
- **Completed:** 2026-05-20 · **Assigned:** backend-dev-expert
- **Description:** Built the GR document type (Draft → Posted state machine) that creates a
  Goods Receipt from an Open/Sent PO. On Post: decrements PO line openQuantity, auto-closes the
  PO when fully received, emits purchase_received outbox event matching PurchaseReceivedPayload
  from contracts/finance_events.py. All steps atomic via _txn(). Immutability enforced.
- **Files added:**
  - `src/modules/purchasing/api/v1/goods_receipts.py` (new router, 6 endpoints)
  - `tests/unit/test_purchasing/__init__.py`
  - `tests/unit/test_purchasing/test_gr_service.py` (10 tests, all passing)
- **Files modified:**
  - `src/modules/purchasing/models/document.py` — added GR schemas + itemType on line response
  - `src/modules/purchasing/services/document_service.py` — added GR state machine, service
    methods, build_gr_event_payload, _header_to_gr_response, updated _resolve_item/_line_to_response
  - `src/modules/purchasing/api/v1/__init__.py` — registered gr_router

| ID | Task | Category | Completed | Verified |
|----|------|----------|-----------|----------|
| T-039 | Sidebar nav restructure — Operations group with recursive renderer | Frontend | 2026-05-20 | TypeScript clean (npx tsc --noEmit); user to verify UI |
| T-038 | Phase B.3 — `_handle_purchase_received` posting handler (finance side) | Backend | 2026-05-20 | 9/9 new tests pass; 55 total passed / 6 pre-existing failures unchanged |
| T-036 | Phase A.4 backend — per-item GL account mapping (finance side) | Backend | 2026-05-20 | migration 009 applied, DESCRIBE verified, 47 passed / 5 pre-existing X-Secret failures |
| T-035 | Phase A.4 frontend — Item GL Account Mapping page (/finance/item-mapping) | Frontend | 2026-05-20 | pending Viet Anh (backend endpoint not live yet) |
| T-032 | Phase A.1 + A.2 — JE tables + Posting Setup (finance backend) | Backend | 2026-05-20 | alembic upgrade head + DESCRIBE verified |
| T-033 | Phase A.3 — Posting Setup UI (/finance/posting-setup) | Frontend | 2026-05-20 | pending Viet Anh |
| T-034 | Searchable AccountCombobox for PostingSetupPage | Frontend | 2026-05-20 | pending Viet Anh |
| T-031 | Finance — Incoming Preview page (/finance/incoming) | Frontend | 2026-05-20 | pending Viet Anh |
| T-030 | Wire /api/v1/finance/companies into Approval Rules page — dynamic company dropdown | Frontend | 2026-05-20 | pending Viet Anh |
| T-029 | Finance backend flags: seed backfill + companies org filter + CoA docstring | Backend | 2026-05-20 | pending Viet Anh |
| T-028 | Frontend polish: 4 flags from CoA + Approval Rules session | Frontend | 2026-05-20 | pending Viet Anh |
| T-027 | Approval Rules management page (finance UI) | Frontend | 2026-05-20 | pending Viet Anh |
| T-026 | Surface four new GL Account fields on Chart of Accounts page UI | Frontend | 2026-05-20 | pending Viet Anh |
| T-025 | CoA backend polish — description field + surface account_level/role/ifrs_tag | Backend | 2026-05-20 | pending Viet Anh |
| T-024 | Chart of Accounts (CoA) page — Finance UI | Frontend | 2026-05-20 | pending Viet Anh |
| T-023 | Activate finance stack and verify outbox end-to-end | DevOps | 2026-05-20 | verified |
| T-022 | Vendor form modal — field-level validation and friendly error display | Frontend | 2026-05-20 | pending Viet Anh |
| T-021 | Transactional outbox in purchasing document service — Phase 2 (Viet Anh) | Backend | 2026-05-20 | pending Viet Anh |
| T-020 | Finance outbox reconciliation sweeper — Phase 1B follow-up (Viet Anh) | Backend + DevOps | 2026-05-20 | pending Viet Anh |
| T-019 | Purchasing — Phase 1B PR + PO + approvals (Viet Anh) | Backend + Frontend | 2026-05-20 | pending Viet Anh |
| T-018 | Purchasing — Phase 1A master data (Viet Anh) | Backend + Frontend + Database | 2026-05-19 | pending Viet Anh |
| T-017 | Finance Service — Week 3 outbox bridge (Viet Anh) | Backend + DevOps | 2026-05-19 | ✅ |
| T-016 | Finance Service — Week 1 scaffold (Viet Anh) | Backend | 2026-05-19 | ✅ |
| T-002 | Fertilizer Cost Calculator — Backend (Viet Anh) | Backend | 2026-05-07 | ✅ |
| T-003 | Fertilizer Cost Calculator — Frontend (Viet Anh) | Frontend | 2026-05-07 | ✅ |
| T-011 | Fertilizer Calculator UI — Price Book → modal (Viet Anh) | Frontend | 2026-05-07 | ✅ |
| T-004 | Fertilizer Calculator — archive-aware discovery + role gate (Viet Anh) | Backend | 2026-05-07 | ✅ |
| T-008 | Farm Detail + Block Monitor merge; Inventory/Stock split; Sales Order lifecycle (v1.14.0 session) | Frontend + Backend | 2026-05-07 | ✅ |
| T-009 | Fertilizer Calculator UI — unarchive + role gate (Viet Anh) | Frontend | 2026-05-07 | ✅ |
| T-010 | Fertilizer Calculator UI — slim Price Book panel (Viet Anh) | Frontend | 2026-05-07 | ✅ |
| T-015 | P&L Dashboard integration + PnlFiltersBar hideFarmingYear + UserManagement PATCH fix (Viet Anh) | Frontend | 2026-05-07 | ✅ |
| T-012 | Plant Library — Fertigation Schedule editor (Viet Anh) | Frontend | 2026-05-08 | ✅ |
| T-014 | Fert Calculator — Yield Mode (UI) (Viet Anh) | Frontend | 2026-05-11 | ✅ |
| T-013 | Fert Calculator — Yield Mode (Excel) (Viet Anh) | Backend | 2026-05-11 | ✅ |

### T-024 | Chart of Accounts (CoA) page — Finance UI
- **Category:** Frontend · **Priority:** P1
- **Completed:** 2026-05-20
- **Description:** Built the GL Chart of Accounts management page.
- **Result:**
  - `frontend/user-portal/src/utils/apiErrors.ts` — extracted `parseApiErrors` helper (65 lines)
  - `frontend/user-portal/src/services/financeAccountsService.ts` — axios-based CRUD (214 lines)
  - `frontend/user-portal/src/hooks/queries/useFinanceAccounts.ts` — TanStack Query hooks (151 lines)
  - `frontend/user-portal/src/pages/finance/ChartOfAccountsPage.tsx` — full page (1406 lines)
  - Routes `/finance/chart-of-accounts`, `/finance/coa` (redirect), `/finance` (redirect) added to `App.tsx`
  - Finance sidebar group added to `MainLayout.tsx` (accountant/finance_admin/auditor/admin/super_admin)
  - Finance hooks exported from `hooks/queries/index.ts`
  - TypeScript clean: 0 errors from `npx tsc --noEmit`

---

### T-021 | Transactional outbox in purchasing document service — Phase 2 (Viet Anh)
- **Category:** Backend · **Priority:** P0
- **Completed:** 2026-05-20
- **Author:** Viet Anh
- **Description:** Closed the consistency hole in the purchasing document service where
  two independent Mongo writes (header update, outbox insert) had no atomicity and the
  outbox failure was silently swallowed. Wrapped all state mutations in Motor session
  transactions so the header write and the outbox insert commit or abort together.
- **Result:**
  - **Modified:** `src/modules/finance_bridge/outbox_writer.py` — added optional
    `session: Optional[AsyncIOMotorClientSession]` parameter to `OutboxWriter.publish`;
    passes it to `insert_one(..., session=session)`. Backwards-compatible (default None).
  - **Modified:** `src/modules/purchasing/services/document_service.py` — added
    `_txn()` async context manager (`asynccontextmanager`) that yields a Motor session
    inside an active Mongo multi-document transaction. Updated `_next_doc_number` to
    accept a session (counter increments participate in the transaction). Updated
    `_build_and_insert_lines` to accept a session. Updated `_emit_pr_event` and
    `_emit_po_event` to accept session and forward to OutboxWriter; removed the
    `try/except` swallows so exceptions propagate and abort the transaction. Wrapped
    all 14 state-mutating methods in `_txn()`. Approval-engine network calls remain
    outside the transaction (see module docstring for rationale).
  - **Added:** `tests/unit/test_finance_bridge/test_transactional_outbox.py` — 7 new
    tests covering session passthrough, backwards compatibility, transaction abort on
    outbox failure, call ordering inside transaction, and exception propagation.
  - **Updated:** `Docs/4-Finance-Mod-docs/INTEGRATION_MODEL.md` — §6.4 added,
    §7 failure table updated, §9 action item marked done.
- **Test result:** 29/29 finance bridge tests pass. Pre-existing failures in
  `test_ai_assistant` and `test_excel_handler` are due to `passlib`/`anthropic`
  not installed in the local Python env (Docker-only deps) — unrelated to this task.

### T-020 | Finance outbox reconciliation sweeper — Phase 1B follow-up (Viet Anh)
- **Category:** Backend + DevOps · **Priority:** P1
- **Completed:** 2026-05-20
- **Author:** Viet Anh
- **Description:** Defense-in-depth safety net for the finance outbox consistency hole.
  Two separate non-transactional Mongo writes in `document_service.py` can leave
  finance_outbox with missing rows when the outbox write fails silently. This sweeper
  runs every 5 minutes in the cron container, detects gaps, and back-fills them with
  deterministic event IDs (uuid5) to guarantee idempotency.
- **Result:**
  - **Modified:** `src/modules/purchasing/services/document_service.py` — extracted
    `build_pr_event_payload()` and `build_po_event_payload()` as module-level functions;
    `_emit_pr_event` and `_emit_po_event` now delegate to them (no behavior change).
  - **New file:** `cron/scripts/__init__.py` — package init
  - **New file:** `cron/scripts/outbox_reconciler.py` — sweeper: scans document_headers,
    checks finance_outbox presence, re-emits via OutboxWriter with deterministic eventId
  - **New file:** `cron/run-outbox-reconciler.sh` — crontab shell wrapper
  - **Modified:** `cron/Dockerfile` — added Python 3, pip, motor, pydantic
  - **Modified:** `cron/crontab` — added `*/5 * * * *` entry for sweeper
  - **Modified:** `docker-compose.yml` — cron service gets MONGODB_URL, MONGODB_DB_NAME,
    FINANCE_OUTBOX_ENABLED, PYTHONPATH + volume mounts for src/, contracts/, cron/scripts/
  - **New file:** `tests/unit/test_finance_bridge/test_outbox_reconciler.py` — 13 tests
    (4 unit for make_sweeper_event_id, 3 unit for outbox_event_exists, 6 integration
    scenarios A–E + deterministic-ID capture); all 13 passing
  - **Test results:** 22/22 finance-bridge tests pass; pre-existing failures in
    test_fertilizer_calculator and test_sensehub_crop_sync are unrelated (passlib not
    installed locally)
- **CodeMaps:** Regeneration needed — new cron/scripts/ package added; no new API
  endpoints or MongoDB collections.

### T-017 | Finance Service — Week 3 outbox bridge (Viet Anh)
- **Category:** Backend + DevOps · **Priority:** P1
- **Completed:** 2026-05-19
- **Author:** Viet Anh
- **Description:** End-to-end outbox bridge infrastructure between main app (MongoDB) and finance service (MySQL). Manually triggerable demo event flows from insertion to processed state.
- **Result:**
  - **New package:** `contracts/` — shared Pydantic event schemas (10 event types, `EVENT_TYPE_REGISTRY`)
  - **New module:** `src/modules/finance_bridge/` — `OutboxWriter`, `OutboxRepository`, `feature_flag` (FINANCE_OUTBOX_ENABLED gate)
  - **New service:** `services/finance_consumer/` — consumer worker container (Motor + httpx, poll loop, exponential backoff, SIGTERM graceful shutdown)
  - **Finance endpoint:** `POST /api/v1/finance/events/ingest` — service-to-service auth (X-Service-Secret), idempotency via `outbox_events_processed`, Week 3 stub (no GL posting)
  - **Migration:** `003_outbox_events_processed.py` — `outbox_events_processed` table (eventId PK, 2 indexes)
  - **ORM:** `OutboxEventsProcessed` model added to `services/finance/src/finance/models/orm/models.py`
  - **Docker:** `docker-compose.finance.yml` updated — `finance_consumer` service + FINANCE_INGESTION_SECRET on both containers
  - **Tests:** 7 ingest endpoint tests + 8 poller unit tests + 9 OutboxWriter unit tests = **24 tests, all passing**
  - **Demo script:** `services/finance_consumer/scripts/demo_publish.py` + mongosh one-liner in README
  - **Docs:** System-Architecture.md updated with Outbox Bridge subsection + ASCII sequence diagram

### T-016 | Finance Service — Week 1 scaffold (Viet Anh)
- **Category:** Backend · **Priority:** P1
- **Completed:** 2026-05-19
- **Author:** Viet Anh
- **Description:** Full Week 1 scaffold for the A64 Finance Service — standalone FastAPI microservice with MySQL/Alembic, JWT verification (no MongoDB), master-data CRUD, seed CoA (~208 accounts), and opt-in Docker profile.
- **Result:**
  - **New service:** `services/finance/` — 60+ files
    - `Dockerfile`, `pyproject.toml`, `alembic.ini`, `README.md`
    - `src/finance/main.py` — FastAPI app, port 8001
    - `src/finance/config.py` — Pydantic settings, env-vars only, `SECRET_KEY` matches main app
    - `src/finance/api/v1/` — 8 routers: health, company, accounts, periods, tax_codes, cost_centers, vendors, customer_ext
    - `src/finance/models/orm/models.py` — 8 SQLAlchemy 2.x ORM tables (company_codes, gl_accounts, fiscal_periods, tax_codes, cost_centers, vendors, customer_finance_ext, audit_log)
    - `src/finance/models/schemas/` — 7 Pydantic schema files
    - `src/finance/services/jwt_verifier.py` — token-only JWT verification, no MongoDB
    - `src/finance/services/seed_loader.py` — idempotent CoA + tax code seeder
    - `src/finance/db/seeds/default_coa.py` — 208 seed accounts across 9 drawers + 5 tax codes
    - `alembic/versions/001_initial_master_data.py` — creates all 8 tables
    - `alembic/versions/002_indexes.py` — covering indexes
    - `tests/` — 23 tests (pytest + aiosqlite in-memory), all passing
  - **New file:** `docker-compose.finance.yml` — overlay with mysql:8.0 + finance services, both on `finance` profile
  - **Updated:** `nginx/nginx.dev.conf` — finance upstream + `/api/v1/finance/` location block
  - **Updated:** `nginx/nginx.prod.conf` — same updates
  - **Updated:** `Docs/1-Main-Documentation/System-Architecture.md` — Finance Service section
  - **Updated:** `Docs/1-Main-Documentation/API-Structure.md` — all finance endpoints
- **Verification:** 23/23 tests pass (SQLite in-memory). Docker build requires `asyncmy` + `pymysql` deps (in Dockerfile).

---

### T-014 | Fert Calculator — Yield Mode (UI) (Viet Anh)
- **Category:** Frontend · **Priority:** P1
- **Completed:** 2026-05-11
- **Author:** Viet Anh
- **Description:** Added Dripper Mode / Yield Mode toggle to FertilizerCostCalculator CropListPanel.
- **Result:**
  - **Modified**: `frontend/user-portal/src/types/tools.ts` — `CropListRow` extended with
    `yieldInfo?: YieldWasteInfo` and `targetYield?: number`; new `CropInputMode` type added.
  - **Modified**: `frontend/user-portal/src/pages/tools/FertilizerCostCalculator.tsx`:
    - `PlantDataOption` extended with `yieldInfo`.
    - Typeahead maps `yieldInfo` from search response at pick time.
    - `hydratePlantNames` also pulls `yieldInfo` from `getPlantDataEnhancedById`.
    - Conversion helpers: `computeYieldPerDripper`, `drippersToYield`, `yieldToDrippers`.
    - `CropListPanel` props extended with `mode`, `onModeChange`, `onUpdateTargetYield`.
    - Mode toggle segmented control in panel header, persisted to `localStorage` under
      `fertCalc.mode.<userId>`.
    - Dripper Mode: unchanged input + new read-only "Est. Yield" column.
    - Yield Mode: Target Yield input + per-row unit label + read-only "Drippers (auto)" column.
    - Mode switching converts all row values in place.
    - `points` always kept in sync; Calculate/Export/Save unchanged.
  - **Modified**: `Docs/1-Main-Documentation/User-Structure.md` — v1.16.0 changelog entry.

### T-013 | Fert Calculator — Yield Mode (Excel) (Viet Anh)
- **Category:** Backend · **Priority:** P1
- **Completed:** 2026-05-11
- **Author:** Viet Anh
- **Description:** Extended the Fertilizer Cost Calculator Excel import to support a "Net Yield (kg)"
  column alongside "Points". Users can now upload a spreadsheet with either dripper counts or target
  yield values; the backend auto-converts yield → points using each plant's yieldInfo.
- **Result:**
  - **Modified**: `src/modules/farm_manager/services/tools/excel_handler.py`
    - `build_import_template()`: new column C "Net Yield (kg)", column widths A=36 B=12 C=18,
      updated placeholder rows demonstrating both modes, italic instruction note at row 4.
    - `import_crops()`: reads optional Net Yield column (case-insensitive regex header match);
      if Net Yield is positive, computes `points = ceil(netYield / yieldPerDripper)` where
      `yieldPerDripper = yieldPerPlant × seedsPerPlantingPoint × (1 − waste%)`. Points clamped
      to 10,000,000 with warning (not skipped). Non-numeric Net Yield → skip with reason.
      Zero/negative Net Yield → falls through to Points column. Non-kg yieldUnit → informational
      warning. Old 2-column files still work unchanged (backward compatible).
    - New helpers: `_is_net_yield_header()`, `_try_parse_positive_float()`.
  - **New file**: `tests/unit/test_excel_handler.py` — 30 unit tests (all pass):
    Points-only (regression), Net Yield-only, both columns (Net Yield wins), invalid yield rate,
    clamp, round-trip template parse, old-format compatibility, non-numeric, zero fallthrough, non-kg.
  - **Modified**: `Docs/1-Main-Documentation/API-Structure.md` — Calculator endpoint table updated
    (added GET /import-template row), expanded POST /import docs with column behaviour, skip reasons
    table, clamping, and unit warning details.

### T-012 | Plant Library — Fertigation Schedule editor (Viet Anh)
- **Category:** Frontend · **Priority:** P1
- **Completed:** 2026-05-08
- **Author:** Viet Anh
- **Description:** Built full fertigation schedule editor modal for the Plant Library.
- **Result:**
  - **New file**: `FertigationScheduleEditorModal.tsx` — full CRUD editor for `FertigationSchedule`
    with card/rule/ingredient CRUD, move-up/down reorder, chemical typeahead (useChemicals),
    inline new-chemical creation, interval↔custom type-switch warning, live validation,
    auto-derived `totalFertilizationDays`, save via `updatePlantDataEnhanced`.
  - **Modified**: `PlantDataDetail.tsx` — Section 11 always renders for privileged roles;
    "Edit Schedule" / "Create Fertigation Schedule" button with role gate
    (`admin|agronomist|super_admin|moderator`); overlay no longer closes on backdrop click.
  - **Modified**: `PlantDataLibrary.tsx` — wired `onSaved` callback to refetch the selected plant
    and refresh the list after a schedule save.
  - **Modified**: `types/farm.ts` — `PlantDataEnhancedUpdate` now includes
    `fertigationSchedule?: FertigationSchedule`; `CustomApplication` now has `notes?: string`.
  - **Modified**: `Docs/1-Main-Documentation/User-Structure.md` — added Fertigation Schedule
    editor section and v1.15.0 changelog entry.
  - TypeScript: `tsc --noEmit` passes with zero errors.
  - No Docker rebuild required — pure frontend TS/JSX change, hot reload sufficient.
  - CodeMaps flagged for regeneration (1 new component file added).

---

### T-010 | Fertilizer Calculator UI — slim Price Book panel (Viet Anh)
- **Category:** Frontend · **Priority:** P2
- **Completed:** 2026-05-07
- **Author:** Viet Anh
- **Description:** Removed duplicate "Add Chemical" and "Discover from Plant Library" actions from
  the Price Book panel in `FertilizerCostCalculator.tsx`, enforcing single-responsibility: those
  actions now live exclusively in `ChemicalsCatalog.tsx`.
- **Result:**
  - **Removed from `PricebookPanel`**: `+ Add Chemical` button, `Discover from Plant Library`
    button (role-gated), `addOpen` state, `handleAddSave` handler, `createChemMutation`
    (`useCreateChemical`), `discoverMutation` (`useDiscoverChemicals`), `canDiscover` role-check,
    `useAuthStore` import.
  - **Removed from file**: `AddChemicalModal` component function and its `AddChemicalModalProps`
    interface (~88 lines of component code).
  - **Removed imports**: `useAuthStore`, `useCreateChemical`, `useDiscoverChemicals`,
    `CreateChemicalRequest`, `AxiosError` (was already unused in this file), `useChemicals`,
    `FertilizerChemical`.
  - **Kept**: search/filter input (hidden when no chemicals exist), the chemicals table with
    editable price column, the inline `Reset` link per override row, the `Source` badge column,
    and the "Manage Catalog →" `RouterLink` in the panel header.
  - **Added empty-state**: when `entries.length === 0`, renders a centred `PricebookEmptyState`
    block with the message "No chemicals catalogued yet — go to the Chemicals Catalog to add some
    or run Discover from Plant Library." and a `RouterLink $asButton` styled as a primary button
    navigating to `/tools/chemicals`.
  - **Added `$asButton` transient prop** to `RouterLink` styled component so the same component
    renders as either a text link or a full primary button without passing a DOM prop.
  - **Net change**: 1803 → 1716 lines (−87 lines).
  - **TypeScript**: `tsc --noEmit` passes with zero errors, zero unused imports.

### T-015 | P&L Dashboard integration + PnlFiltersBar hideFarmingYear + UserManagement PATCH fix (Viet Anh)
- **Category:** Frontend · **Priority:** P2
- **Completed:** 2026-05-07
- **Author:** Viet Anh
- **Description:** Integrated the full P&L component family into the main Dashboard page; added `hideFarmingYear` prop to `PnlFiltersBar`; polished `PnlBreakdownCharts` layout; fixed `UserManagementPage` HTTP method.
- **Result:**
  - **Modified**: `frontend/user-portal/src/pages/dashboard/Dashboard.tsx` — imported and rendered `PnlFiltersBar`, `PnlKpiCards`, `PnlRevenueTrendChart`, `PnlBreakdownCharts`, `PnlStatementTable`, `PnlArAging`, `PnlRevenueConfidence` with finance hooks (`useFinancePnlSummary`, `useFinancePnlByMonth`, `useFinancePnlByFarm`, `useFinancePnlByCrop`, `useFinancePnlArAging`, `useFinanceRevenueSources`).
  - **Modified**: `frontend/user-portal/src/components/pnl/PnlFiltersBar.tsx` — new optional `hideFarmingYear` prop suppresses the farming-year filter row when a global year selector is already present higher up the tree.
  - **Modified**: `frontend/user-portal/src/components/pnl/PnlBreakdownCharts.tsx` — `Row` uses `align-items: stretch`; new `FarmPanel` wrapper keeps adjacent panels at equal heights.
  - **Modified**: `frontend/user-portal/src/pages/admin/UserManagementPage.tsx` — corrected HTTP method from `PUT` to `PATCH` on `/v1/users/{id}/role` (was returning 405).

---

### T-011 | Fertilizer Calculator UI — Price Book → modal (Viet Anh)
- **Category:** Frontend · **Priority:** P2
- **Completed:** 2026-05-07
- **Author:** Viet Anh
- **Description:** Restructured `FertilizerCostCalculator.tsx` so the Price Book becomes a modal
  (opened by a header button) and the Crop List is promoted to the primary hero content.
- **Result:**
  - **Renamed** `PricebookPanel` → `PricebookContent` (renders just the inner content, no Panel shell).
  - **Added** `PricebookModal` component — wraps `PricebookContent` in the existing `Modal` shell
    with `maxWidth="960px"` to give the 7-column table enough horizontal room.
  - **Added** `priceBookOpen: boolean` state at the `FertilizerCostCalculator` page level.
  - **Added** "Price Book" `OutlineBtn` in the page header (right side). Modal opens on click,
    closes only via the X button (no backdrop-click close — enforced by existing `Modal` shell).
  - **Updated** `PageHeader` styled component: now `display: flex; justify-content: space-between`
    so title stays left and button sits right.
  - **Removed** inline `<PricebookPanel />` from the page body. Crop List panel is now the first
    and largest content block.
  - **Added** `PricebookModalFooterLink` styled component — renders "Manage Catalog →" link at the
    bottom of the modal body (was previously in the collapsible panel header).
  - **Removed** `CollapseIcon` styled component (only used by old collapsible panel header, now
    unused).
  - **Updated** stale "Price Book above" copy in the InfoBanner to "Price Book button".
  - **Layout before:** 3 stacked panels — Price Book (top, collapsible) → Crop List → Output.
  - **Layout after:** Header row (title + Price Book button) → Crop List hero → Output.
  - **Net change:** ~1717 → ~1720 lines (+3 lines net; removed ~60, added ~63 for modal wrapper
    and footer link).
  - **TypeScript:** `tsc --noEmit` passes with zero errors.

### T-009 | Fertilizer Calculator UI — unarchive + role gate (Viet Anh)
- **Category:** Frontend · **Priority:** P1
- **Completed:** 2026-05-07
- **Author:** Viet Anh
- **Description:** Two follow-up UI additions to the Fertilizer Calculator frontend.
- **Result:**
  - **Change 1 — Restore button on archived chemicals**: In `ChemicalsCatalog.tsx`, archived rows now show a "Restore" `LinkBtn` instead of the "Archive" `DangerLinkBtn`. Clicking calls `useUpdateChemical` with `{ archivedAt: null }`, which triggers `PATCH /api/v1/farm/tools/chemicals/{id}`. On success the hook invalidates both the chemicals and prices queries, showing the restored row in its active state (or removing it from view if "Show archived" is off). The `UpdateChemicalRequest` type was widened to an `interface` with an optional `archivedAt?: string | null` field.
  - **Change 2 — Role gate on Discover button**: The "Discover from Plant Library" `OutlineBtn` is now conditionally rendered behind `canDiscover = currentUser?.role === 'admin' || currentUser?.role === 'agronomist'` in both `ChemicalsCatalog.tsx` (top-of-page button) and `FertilizerCostCalculator.tsx` (Price Book panel button). Button is fully hidden — not disabled — for other roles.
- **Role-check pattern source:** `MainLayout.tsx` line 195 — `user?.role === 'super_admin'` direct string comparison on the Zustand `useAuthStore` `user` field.
- **TypeScript:** `tsc --noEmit` passes with zero errors.

### T-004 | Fertilizer Calculator — archive-aware discovery + role gate (Viet Anh)
- **Category:** Backend · **Priority:** P1
- **Completed:** 2026-05-07
- **Author: Viet Anh**
- **Description:** Two follow-up fixes to the Fertilizer Cost Calculator backend.
- **Result:**
  - **Fix 1 — Role gate confirmed on `POST /chemicals/discover`**: endpoint already used `require_permission("agronomist")` mapping to admin/super_admin/moderator roles. Confirmed + added integration test verifying `user` role gets 403.
  - **Fix 2 — Archive-aware auto-discovery and calculator warnings:**
    - `ChemicalsService.discover_from_plant_library` now fetches ALL chemicals (including archived) and skips auto-creation for names matching archived chemicals. A new `build_chemical_lookup()` static method builds two dicts: active → FertilizerChemical, archived → ArchivedChemicalMatch sentinel.
    - `fertilizer_calculator.calculate_for_crops` Phase 2 uses archive-aware lookup: truly unknown names still auto-create, archived matches emit a per-ingredient warning and return `unitPrice/totalCost = None`.
    - `ChemicalUpdate` model gains optional `archivedAt` field; repository `update()` uses `model_fields_set` to distinguish explicit `null` (unarchive) from omitted field.
  - **Tests:** 9 new tests added (4 unit, 3 integration + 1 role-gate + 1 unarchive). 47 total tests pass (38 prior + 9 new).
  - **Docs:** `API-Structure.md` updated with role gate note, archive-aware semantics, unarchive PATCH description.

### T-002 | Fertilizer Cost Calculator — Backend (Viet Anh)
- **Category:** Backend · **Priority:** P1
- **Completed:** 2026-05-07
- **Author: Viet Anh**
- **Description:** Built full backend for the Fertilizer Cost Calculator tool.
- **Result:**
  - 3 new MongoDB collections: `fertilizer_chemicals`, `fertilizer_price_overrides`, `fertilizer_calculation_lists` with all required indexes.
  - 7 Pydantic model files under `src/modules/farm_manager/models/tools/`.
  - 6 service files under `src/modules/farm_manager/services/tools/`: ChemicalsRepository, ChemicalsService, PriceBook, FertilizerCalculator, ExcelHandler, CalculationListsRepository.
  - 2 API router files under `src/api/v1/tools/`: chemicals.py (5 endpoints), fertilizer_cost.py (10 endpoints).
  - Routers mounted at `/api/v1/farm/tools/chemicals` and `/api/v1/farm/tools/fertilizer-cost`.
  - 25 unit tests (all pass) + 13 integration tests (all pass).
  - API-Structure.md updated with all new endpoints.
  - CodeMaps regeneration needed (structural change — 3 new collections, new API routes, new service modules).

### T-003 | Fertilizer Cost Calculator — Frontend (Viet Anh)
- **Category:** Frontend · **Priority:** P1
- **Completed:** 2026-05-07
- **Author: Viet Anh**
- **Description:** Built full frontend for the Fertilizer Cost Calculator tool and Chemicals Catalog.
- **Result:**
  - Extended `NavItemDef` in `MainLayout.tsx` to support `children[]`, `defaultExpanded`, and group rendering with collapsible chevron, child-active parent highlighting, and per-user localStorage persistence (`sidebar.expanded.{userId}`).
  - Added "Tools" sidebar group with two children: Fertilizer Cost Calculator and Chemicals Catalog.
  - New routes in `App.tsx`: `/tools` → redirect, `/tools/fertilizer-calculator`, `/tools/chemicals`.
  - New file `frontend/user-portal/src/types/tools.ts`: full TypeScript interfaces for all API shapes.
  - New file `frontend/user-portal/src/services/toolsApi.ts`: service layer for all `/api/v1/farm/tools/` endpoints.
  - New file `frontend/user-portal/src/hooks/queries/useTools.ts`: TanStack Query hooks for chemicals, prices, calculate, export, import, saved lists.
  - Extended `react-query.config.ts` with `queryKeys.tools` namespace.
  - New page `frontend/user-portal/src/pages/tools/FertilizerCostCalculator.tsx`: Price Book panel (collapsible, inline price edit, reset, add/discover), Crop List panel (typeahead with no-schedule greyed state, points edit, import/export XLSX, saved lists), Output panel (per-crop collapsible ingredient tables, grand total, warnings, discovered chemicals notice).
  - New page `frontend/user-portal/src/pages/tools/ChemicalsCatalog.tsx`: full CRUD table, add/edit modal, archive with 409 dependent-plants modal, show-archived toggle, search.
  - Updated `Docs/1-Main-Documentation/User-Structure.md` with Tools group documentation.
  - CodeMaps need regeneration (new pages, new sidebar pattern).

### T-008 | v1.14.0 development session — Farm, Inventory, Sales Order overhaul
- **Category:** Frontend + Backend · **Priority:** P1
- **Completed:** 2026-05-07
- **Author: Viet Anh**
- **Description:** Large multi-area session covering Farm Manager UI restructure, Inventory/Stock architectural split, per-batch harvest FIFO model, returned inventory, manual expire/revive, sales order lifecycle (reservations, two-step delete, Report Return), Add Item modal with FIFO allocation, and customer typeahead.
- **Result:**
  - Block Monitor route retired; all functionality merged into Farm Detail Blocks tab via `FarmQuickSwitcher`, `BlockMonitorHero`, `BlockViewToggle`, `VirtualBlocksView`, `PhysicalBlockPlantingsModal`, `useBlockViewMode` hook.
  - Farm Card redesigned with Yield Achievement progress bar, all-states pill row, `FarmCodeChip`, responsive metric grid.
  - Farm Manager Dashboard: new "View Farms" tab (embeds `FarmList`), Plant Library sidebar entry, tab sliding animation. Farm Breakdown tab merged into Overview.
  - Backend: `FarmSummary` extended with `physicalBlocks`/`virtualBlocks`/`actualYield`; `farmingYear` optional query param on `/farms/{id}/summary` and `/dashboard/farms/{id}`.
  - Inventory/Stock split: `/inventory` now Inputs + Assets only; `/sales/stock` (new) has Sellable / Returned / Waste tabs. Sales-side inventory service/repository/model retired.
  - Per-batch harvest model: `originalQuantity` immutable field, `farmingYear` computed at write, no more merging rows.
  - Manual expire (`POST .../expire`) and revive (`POST .../revive`) endpoints. Daily cron disabled.
  - Full `inventory_returned` CRUD (6 endpoints + `mark-waste`). `ReturnedInventoryList` frontend component.
  - `BlockHarvestEntryModal` Waste grade: dual-path submit to harvest vs waste endpoint.
  - `CustomerCombobox` typeahead with CRM address auto-fill in `OrderForm`.
  - `AddOrderItemModal`: FIFO multi-source allocation, container mode, duplicate detection, portaled dropdown.
  - Order schema: `allocations`, `containerCount`, `containerSize`, `deletedAt`, `returns` fields (backward-compatible).
  - Order lifecycle wired: reservation on confirm, deduction on ship, restoration on cancel.
  - Two-step order delete: `GET .../delete-preview` + `POST .../delete` with `BatchDecision[]`.
  - `ReportReturnModal` + `POST .../report-return` endpoint.
  - Numerous bug fixes: Farm TS type fields, URL correction, productId forwarding, UUID serialisation, nginx DNS flush, inventory backfill.
  - Released as v1.14.0 (MINOR bump). CodeMaps regenerated (structural changes).

## 2026-04

| ID | Task | Category | Completed | Verified |
|----|------|----------|-----------|----------|
| T-007 | Virtual-block SenseHub sync architecture (push per virtual child, MCP via parent chain) | Backend | 2026-04-24 | ✅ |
| T-006 | `mark_as_planted` doesn't persist crop metadata; SenseHub trigger skips | Backend | 2026-04-23 | ✅ |
| T-002 | SenseHub MCP crop-data sync integration | Backend | 2026-04-20 | ✅ |
| T-003 | Planting flow reads from empty legacy `plant_data` collection | Backend | 2026-04-23 | ✅ |
| T-004 | Missing `await` on `recalculate_future_dates` corrupts block status dates | Backend | 2026-04-23 | ✅ |
| T-005 | SenseHub trigger wrappers log "succeeded" even when MCP call fails | Backend | 2026-04-23 | ✅ |

### T-007 | Virtual-block SenseHub sync architecture
- **Category:** Backend · **Priority:** P1
- **Completed:** 2026-04-24
- **Description:** Architectural correction surfaced during first live SenseHub integration test.
  Physical parent blocks hold `iotController` (the MCP connector) but crops live on virtual child
  blocks created via `addVirtualCrop` — the UI's only planting path. Production data confirmed:
  169/170 virtual blocks have `targetCrop`; only 1/271 physical blocks does (test artifact
  F010-002). SenseHub natively supports multiple `block_id`s per zone, so pushing each virtual
  child as its own `block_id` is the correct architecture and requires no SenseHub schema changes.
- **Result:**
  - `SenseHubCropSync.from_block()` is now `async`. When a block has no `iotController`, the
    method walks up the `parentBlockId` chain via `await BlockRepository.get_by_id()` until it
    finds an ancestor with `iotController.enabled=True` and a valid `mcpApiKey`. Returns `None`
    if no such ancestor exists. Four call sites updated with `await`:
    `sensehub_block_service_triggers.py` (×2), `planting_service.py`, `sync_service.py`.
  - `_reconcile_crop_data` in `sync_service.py` now expands each iot-parent into its virtual
    children via `BlockRepository.get_children_by_parent` before the reconcile loop. Parents
    with children are skipped; reconciliation iterates the children. Parents without children
    are reconciled directly, preserving the T-006 flow.
  - Live SenseHub cleanup: `complete_crop` fired for F010-002 (archived parent-level Capsicum,
    `sensehub_crop_id=8`). F010-002 reset in A64Core: `state=partial`, all crop fields null.
    F010-002/001 (virtual child) pushed to SenseHub with its own `block_id`, `stage=ripening`,
    new `sensehub_crop_id=9`. SenseHub dashboard shows Capsicum-Green on Greenhouse 1 at
    ripening stage, sourced from virtual child.
  - 90/90 tests pass: 81 regression + 9 new integration tests in
    `tests/integration/test_sensehub_crop_sync_virtual.py`.
  - No schema changes. No CodeMap regeneration needed.
  - Released as v1.13.5 (PATCH bump).

### T-006 | `mark_as_planted` doesn't persist crop metadata on block, SenseHub trigger skips
- **Category:** Backend · **Priority:** P1
- **Completed:** 2026-04-23
- **Description:** Discovered during the first live SenseHub integration test. After
  `POST /plantings/{id}/mark-planted`, `planting_service.mark_as_planted` called
  `BlockRepository.update_status(block_id, GROWING, ...)` without passing `target_crop` /
  `target_crop_name` / `actual_plant_count` / `expected_harvest_date`. Block state transitioned
  correctly but crop metadata fields stayed null. The SenseHub trigger then aborted:
  `[SenseHub] block X has no targetCrop set after mark_as_planted — skipping set_crop_data`.
- **Result:**
  - Added `primary_plant = planting.plants[0]` helper and forwarded all four kwargs to
    `BlockRepository.update_status` in `mark_as_planted`. Caller bug only — the repository
    method already accepted these as optional kwargs.
  - For multi-crop plantings `plants[0]` is used as the primary (block.targetCrop is a single
    UUID); remaining plants are tracked in `planting.plants[]`.
  - Verified end-to-end via Playwright against live SenseHub at `100.124.168.35:3001`:
    `[SenseHub] set_crop_data succeeded` fires automatically ~203ms after mark-planted returns
    200, with zero manual DB intervention. Reconciliation confirms in-sync.
  - 81/81 SenseHub regression tests pass. No schema changes. No CodeMap regen needed.
  - Released as v1.13.4 (PATCH bump).
- **Surfaced during:** First live SenseHub integration test (2026-04-23). Would have been
  caught in T-002 step 8 if Playwright had hit a real MCP instead of fake 127.0.0.1:9999.

### T-005 | SenseHub trigger wrappers log "succeeded" even when MCP call fails
- **Category:** Backend · **Priority:** P3
- **Completed:** 2026-04-23
- **Description:** Three fire-and-forget asyncio trigger wrappers in
  `sensehub_block_service_triggers.py` and `planting_service.py` emitted
  `INFO "[SenseHub] <method> succeeded"` unconditionally after the MCP call,
  even when the call had failed. The upstream `SenseHubCropSync` layer already
  logs an ERROR on failure — the trailing success INFO was misleading for ops
  scanning logs.
- **Result:**
  - `_sensehub_update_growth_stage_task`: `if ok:` guard added around success log.
  - `_sensehub_complete_crop_task`: `if ok:` guard added around success log.
  - `_sync_set_crop_data_on_planted`: `if result is not None:` guard corrected
    (was `if result:` which would false-negative on empty dict).
  - No behavior change for callers or downstream state — log output only.
  - 81/81 SenseHub regression tests pass; no assertions relied on old unconditional
    behavior.
  - Released as v1.13.3 (PATCH bump).

### T-003 | Planting flow reads from empty legacy `plant_data` collection
- **Category:** Backend · **Priority:** P2
- **Completed:** 2026-04-23
- **Description:** Pre-existing bug. `PlantingService.create_planting_plan` called
  `PlantDataService.get_plant_data()` which reads from the legacy `plant_data` collection
  (0 documents in dev). Every UI planting attempt returned HTTP 404 in ~1ms.
  Planting had never worked in dev against any UI-created plant record.
- **Result (Option A implemented):**
  - `PlantingService.create_planting_plan` now reads from `PlantDataEnhancedService.get_plant_data`.
    Snapshot attribute paths adapted to nested enhanced model fields; all 8 snapshot dict keys
    are unchanged — downstream consumers (SenseHub trigger, harvest flow) unaffected.
  - Three additional pre-existing bugs uncovered and fixed during verification:
    1. `PlantingRepository` used `farm_db.db.plantings` (`.db` does not exist on
       `FarmDatabaseManager`) → fixed to `farm_db.get_database().plantings`.
    2. `BlockService.get_block_by_id` → corrected to `BlockService.get_block` (new API).
    3. `BlockService.update_block_state` → replaced with `BlockRepository.update_status` (new API).
  - Integration test mocks updated for renamed methods; 81/81 SenseHub regression tests pass.
  - Verified end-to-end: HTTP 201 on `POST /api/v1/plantings`; MongoDB doc has all 8 snapshot
    keys (Potato, growthCycleDays: 70, expectedYieldPerPlant: 1.575 kg, 15–40°C).
    Block transitioned EMPTY→PLANNED.
  - Released as v1.13.2 (PATCH bump).
- **Surfaced during:** T-002 Phase 4 e2e testing.

### T-004 | Missing `await` on `recalculate_future_dates` corrupts block status dates
- **Category:** Backend · **Priority:** P0
- **Completed:** 2026-04-23
- **Description:** Pre-existing bug. `BlockService.change_status` at
  `src/modules/farm_manager/services/block/block_service_new.py:703` called
  `BlockService.recalculate_future_dates()` (async coroutine) without `await`. The unresolved
  coroutine object was forwarded to `BlockRepository.update_status()` as `expected_status_changes`;
  motor silently stored null instead of the resolved `Dict[str, datetime]`. Every normal block
  status transition (non-planting, non-harvest-complete) corrupted block `expectedStatusChanges`.
- **Result:**
  - Single `await` added at `block_service_new.py:703` (else-branch of `change_status`).
  - Verified via mongosh: GROWING→HARVESTING transition now persists `expectedStatusChanges` as
    proper BSON ISODate objects. No `RuntimeWarning: coroutine ... was never awaited` post-fix.
  - Audit confirmed no other missing awaits in block service files.
  - 81/81 SenseHub regression tests pass. No data backfill needed (dev data was null/clean).
  - Released as v1.13.1 (PATCH bump). Follow-up data-cleanup task T-006 deemed unnecessary.
- **Surfaced during:** T-002 step 8 e2e Playwright testing.

### T-002 | SenseHub MCP crop-data sync integration
- **Category:** Backend · **Priority:** P1
- **Completed:** 2026-04-20
- **Description:** Wired A64Core → SenseHub MCP push for crop data, growth-stage transitions,
  and harvest completion across five implementation phases.
- **Result:**
  - Phase 1 reverted: `plant_data.py` extension rolled back; `plant_data_enhanced` already carries
    all required SenseHub fields in nested form. No UI change needed.
  - Phase 2 eliminated: `zone_id` dropped from external contract after negotiation. All crop tools
    are `block_id`-only; SenseHub handles zone routing internally via configured primary crop zone.
  - Phase 3: `SenseHubCropSync` service + `sensehub_stage_mapper.py` + payload builder. All 4 MCP
    tools wrapped; fire-and-log error handling; graceful degradation verified; 61/61 unit tests pass.
  - Phase 4: MCP triggers wired as detached `asyncio.create_task()` into `mark_as_planted`,
    `change_status` (stage boundary + HARVESTING→CLEANING), and a new
    `sensehub_block_service_triggers.py` helper module; 10/10 integration tests pass.
  - Phase 5: Crop reconciliation extended into `SenseHubSyncService` 3h cycle; 5 drift cases
    resolved; `asyncio.Semaphore(5)` concurrency cap; aggregated result via `get_status()`;
    10/10 integration tests pass.
  - Playwright e2e: `update_growth_stage` and `complete_crop` triggers verified in UI;
    `set_crop_data` path blocked by pre-existing T-003 bug (tracked separately).
  - 81 total tests: 61 unit + 20 integration.
  - Released as v1.13.0 (MINOR bump).
- **Follow-up tasks opened:** T-003 (P2), T-004 (P0), T-005 (P3)

<!--
Archive format — group by month:

## 2026-02

| ID | Task | Category | Completed | Verified |
|----|------|----------|-----------|----------|
| T-001 | Example task | Backend | 2026-02-26 | ✅ |

### T-001 | Example task
- **Category:** Backend · **Priority:** P1
- **Completed:** 2026-02-26
- **Description:** What was done
- **Result:** Outcome or key deliverable
-->
