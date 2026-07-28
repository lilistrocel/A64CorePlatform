# A64 Core Platform — Backlog

> **Updated:** 2026-06-10
> **Tasks:** 5 active · 2 ready · 2 blocked · 0 completed (Wave 3 T-201.4/.5/.6/.7/.8 + T-201.0/.1/.2/.3 + T-202 all in ARCHIVE — this session closed 6 tickets in commits `096be1a` / `14046b3` / `cdc71a4` / `2ccb9dc`) — remaining Active: T-201.8b (Wave 6 SKU-master extraction), T-201.9/.10/.11 (SAP B1 chain-via-SO epic), T-200.25 (BLA stubs — implementation complete, awaiting commit); Wave 5: T-500 (production cost accounting) + T-501 (packing materials BOM); Wave 6: T-600 (standalone hardening) (T-003, T-004, T-008, T-009, T-010, T-011, T-012, T-013, T-014, T-016, T-017, T-018, T-019, T-020, T-021, T-022, T-023, T-024, T-025, T-026, T-027, T-028, T-029, T-030, T-031, T-032, T-033, T-034, T-035, T-036, T-037, T-038, T-039, T-040, T-041, T-042, T-043, T-044, T-045, T-046, T-047, T-048, T-050, T-051, T-053, T-055, T-056, T-057-1a, T-060.6, T-060.6.1, T-060.7, T-060.7.1, T-060.8, T-060.9.1, T-060.10, T-060.11-audit, T-060.11-preview, T-060.12, T-060.13, T-060.14, T-061, T-061.1, T-062, T-063, T-100.4, T-100.7, T-100.8, T-100.9a.1, T-100.9a.2, T-100.11.1, T-100.11.2, T-200.0, T-200.1, T-200.2, T-200.3, T-200.4, T-200.5, T-200.6, T-200.7, T-200.8, T-200.9, T-200.10, T-200.11, T-200.x completed, moved to ARCHIVE.md)

---

## Lessons Learned: T-100.9a.1 — Ops Services Must Not Query Finance MySQL as Mongo Collections

**Bug:** `ar_invoice_service.py` used `db["sale_item_finance_ext"].find_one(...)` and `db["customer_finance_ext"].find_one(...)` against the ops MongoDB. These tables live exclusively in the finance microservice's MySQL DB. The lookups always returned `None`, blocking every AR Invoice creation.

**Why tests didn't catch it:** The test fixtures used `db["sale_item_finance_ext"]._add(...)` to seed the in-memory fake Motor DB, exactly mirroring the broken production assumption. Tests passed because both code and test had the same wrong mental model.

**The correct pattern:** Use `httpx.AsyncClient` to call the finance microservice via HTTP, mirroring `sales_order_service.py`'s `_check_credit_limit` pattern:
- Module-level constant: `_FINANCE_BASE_URL = os.getenv("FINANCE_SERVICE_URL", "http://finance:8001")`
- 5-second timeout, forward user Bearer token in `Authorization` header
- Finance service wraps responses under `data` key: `body.get("data", body)`
- 404 = not configured (allowed to be None for customer ext, fatal for item ext)
- Any other 4xx/5xx = raise ValueError with upstream status

**For future agents:** Any ops-side service that needs finance ext data (revenue account, AR control account, COGS account, customer credit limit) MUST call the finance service via HTTP. Never query `sale_item_finance_ext`, `customer_finance_ext`, `vendor_finance_ext`, or `purchase_item_finance_ext` as MongoDB collections from the ops backend. The gold standard is `sales_order_service.py`.

**Test strategy going forward:** Mock `_get_item_finance_ext` and `_get_customer_finance_ext` at the service-layer function level (not at the MongoDB collection level). See `test_ar_invoices.py` `_patch_item_ext()` and `_patch_customer_ext()` helpers for the correct pattern.

---

## Rules for Agents

### Status Legend

| Status | Meaning |
|--------|---------|
| `🟢 Ready` | Available for implementation, no blockers |
| `🔵 Active` | Currently being worked on (check assignee) |
| `🔴 Blocked` | Waiting on dependencies to complete first |
| `✅ Done` | Completed and verified (moved to ARCHIVE.md) |

### Before Starting Work

1. **READ this file** before any implementation
2. Find a task with status `🟢 Ready`
3. **NEVER** work on `🔵 Active` tasks — already claimed by another agent
4. **NEVER** work on `🔴 Blocked` tasks — dependencies are unresolved
5. If no relevant task exists, **create one first** before starting work

### Claiming a Task

1. Change status from `🟢 Ready` to `🔵 Active`
2. Set `Assigned:` to your agent type (e.g., backend-dev-expert)
3. Set `Started:` to today's date
4. **One agent per task** — no shared ownership

### Completing a Task

1. Move the task entry from this file to [ARCHIVE.md](ARCHIVE.md)
2. Check: does this task appear in any other task's `Depends on:` field?
3. If ALL dependencies of a blocked task are now `✅ Done`, change it to `🟢 Ready`
4. Update the stats in the header of this file

### Creating New Tasks

- Use next available `T-XXX` ID (check both BACKLOG.md and ARCHIVE.md for highest ID)
- Set dependencies if this task requires other tasks to complete first
- **Categories:** Backend, Frontend, API, Database, Testing, DevOps, Docs
- **Priorities:** P0 (critical) · P1 (high) · P2 (medium) · P3 (low)

### Session Handoff

- If a session ends before task completion, add `> Context:` notes to the task
- Keep status as `🔵 Active` with context notes for the next session
- Next session reads task notes and continues from where it left off

### Task Entry Format

```markdown
### T-XXX | Task title here
- **Category:** [category] · **Priority:** [P0-P3]
- **Assigned:** [agent-type] · **Started:** [date]    ← only when 🔵 Active
- **Depends on:** T-001 ✅, T-002 🔵                  ← or "—" if none
- **Blocks:** T-005, T-006                             ← or "—" if none
- **Description:** What needs to be done
- **Steps:**
  1. Step one
  2. Step two
  3. Verify with Playwright MCP / mongosh
```

---

## 🔵 Active

---

### T-800 | Genetics Repo — cross-domain lab traceability module (lines, accessions, propagation, media, observations)
- **Category:** Full-stack · **Priority:** P1
- **Assigned:** main session · **Started:** 2026-07-28
- **Depends on:** none
- **Blocks:** none
- **Description:** New shared `genetics` module tracking lab genetics across every
  department (plants, fungi, animal bloodlines). Three-layer model: **genetic lines**
  (named identity) → **accessions** (physical material) → **propagation events**
  (the traceable clone/cross edge), plus versioned **medium recipes/batches** and
  **observations** with novel-trait promotion.
- **Key design decisions (agreed with user):**
  - **Dual generation counters.** `cloneGeneration` (G, asexual, senescence signal)
    and `filialGeneration` (F, sexual, trait-segregation signal) are orthogonal.
    Asexual methods → G+1, F inherited. Sexual methods → F+1, **G resets to 0**
    (a spore print off a G5 fruit is a fresh individual: F1-G0, not G6).
    Single source of truth: `_SEXUAL_METHODS` in `models/enums.py`.
  - **Batch-with-quantity accessions**, split out via `POST /accessions/{id}/split`
    when one vessel diverges. Split copies generations + parents verbatim (not a
    propagation).
  - **Flexible parentage.** `parents[]` supports 0 (founding/unknown provenance),
    1 (clone), or 2 (cross); each slot independently allows a null `accessionId`
    so half-known ancestry (dam known, sire not) survives.
  - **Novel traits promote to their own line** parented to the source line, with a
    founding accession minted so the physical chain stays unbroken.
  - **Additives are modelled separately from base ingredients** and snapshotted onto
    each batch, so "everything ever grown on a medium containing X" is a direct query
    that stays truthful after recipe edits.
- **Module visibility:** `industries: ["all"]` / `industry_mode: "shared"` — the lab is
  common to every division. Frontend nav uses a shared `GENETICS_NAV_GROUP`, not the
  industry-gated arrays. Verified rendering in the **Vegetable** division.
- **Status:** Implementation complete; verified end-to-end against the live stack.
  Full scenario driven through the API (G0 → clone ×8 → split sector → observe →
  promote to PO-BLU-S1 → spore print resetting G) and all four pages confirmed
  rendering in the browser, including lineage DAG, ancestry breadcrumb and the
  additive readout. Frontend `tsc -b` adds **0 new errors** (336 before and after —
  all pre-existing, none in genetics files).
- **Bugs found and fixed during verification:**
  - `propagation_service._build_child` passed `location=None` into a non-optional
    field → 500 on every propagation.
  - `GET /lines` declared `response_model=PaginatedResponse[Line]`, which silently
    stripped the `stats` rollups the repo cards depend on → now `LineWithStats`.
  - Ancestry breadcrumb roles were off by one when a chain ended at a parentless
    root (`roles` padded to `chain` length before reversing).
  - Ancestor traversal depth cap never fired (counter decremented against a
    less-than guard) → separate positive `steps_up` counter.
- **Files changed:**
  - `src/modules/genetics/**` (NEW — 6 models, 7 services, 7 route modules,
    manifest, register; collections: `genetic_lines`, `genetic_accessions`,
    `propagation_events`, `medium_recipes`, `medium_batches`, `genetic_observations`)
  - `frontend/user-portal/src/types/genetics.ts`, `services/geneticsApi.ts`,
    `hooks/genetics/useGenetics.ts` (NEW)
  - `frontend/user-portal/src/components/genetics/**` (NEW — 9 components incl.
    `LineageTree`, `PropagateModal`)
  - `frontend/user-portal/src/pages/genetics/**` (NEW — 4 pages)
  - `frontend/user-portal/src/App.tsx`, `components/layout/MainLayout.tsx` (modified)
- **CodeMaps:** ✅ Regenerated 2026-07-28. Graph 610→660 nodes, 590→655 edges via
  `scripts/codebase_mapper/batch_genetics.json`. Three mapper fixes made along the way:
  - `FILE_TO_TASK_MAP` had no prefix for `genetics`, `mushroom_manager`, `purchasing`
    or `finance` — `rerun.sh` silently re-seeded nothing when those modules changed.
  - `gen_index` hardcoded a 7-module directory that was already stale; now lists all 10.
  - Mapper scripts need `MONGO_URL="mongodb://localhost:27017/?directConnection=true"`
    from the host — the default fails because Mongo advertises the `mongodb` hostname
    for replica-set discovery.
- **Demo data:** ✅ Cleared 2026-07-28 (all six collections at zero).
- **Tests:** ✅ `tests/unit/test_genetics/test_generation_rules.py` — 44 tests pinning
  `derive_generations`, the enum contract and code/label formatting. Teeth verified by
  five source mutations, each caught (12 / 16 / 5 / 4 / 1 failures respectively).
  Note: `tests/` is not mounted into the api container, so run with
  `docker cp tests a64coreplatform-api-1:/app/ && docker exec -w /app a64coreplatform-api-1 python -m pytest tests/unit/test_genetics`.
- **Outstanding:**
  - Service-layer tests (propagate, split, promote_trait, lineage traversal) still rely on
    live-stack verification only — they need DB fixtures, unlike the pure `derive_generations`.
  - ~~Strain Library overlap~~ — resolved by **T-801** (2026-07-28, see ARCHIVE.md).
    Lines now link to their `mushroom_strains` / `plant_data` growing profile in both
    directions, with taxonomy prefill so nothing is typed twice.

---

### T-200.22 | Purchasing counter rollup + auto-close + chain cleanup via doc_chain_reconciler — Wave 4
- **Category:** Backend · **Priority:** P1
- **Assigned:** backend-dev-expert · **Started:** 2026-06-04
- **Depends on:** T-200.21 ✅
- **Blocks:** T-200.23 (AP Credit Note)
- **Description:** Apply `doc_chain_reconciler` pattern to the PR→PO→GR→AP chain.
  PO/GR open-qty tracking via purchasing-specific adapter, auto-close when fully consumed
  downstream, auto-reopen on downstream release, $pull dangling targetDocRefs on delete,
  audit writes on every chain event.
- **Status:** Implementation complete. Tests at T-200.21 baseline (36 passed / 10 failed —
  the 10 failures are pre-existing T-200.21a tech debt, not regressions from T-200.22).
  Sales tests 334 passed (no regressions).
- **Files changed:**
  - `src/modules/purchasing/services/purchasing_chain_reconciler.py` (NEW — 480 lines)
  - `src/modules/purchasing/services/document_service.py` (modified: +~250 lines)

---

### T-200.25 | Blanket Agreement (BLA) document type stubs — Wave 4
- **Category:** Backend · **Priority:** P1
- **Assigned:** backend-dev-expert · **Started:** 2026-06-10
- **Depends on:** T-200.24 ✅ (DPI — establishes per-doc-type service pattern)
- **Blocks:** T-200.25.1 (PO→BLA integration), T-200.26 (BLA frontend)
- **Description:** Ship BLA document type + lifecycle + standard CRUD + counter fields
  for consumption tracking. BLAs are long-term volume/price commitments between buyer
  and vendor. STUBS ONLY — no PR/PO integration in this slice.
- **Status:** Implementation complete. Tests at baseline (36 passed / 10 failed —
  same pre-existing T-200.21a failures, no new regressions). Sales tests 334 passed.
- **Files added:**
  - `src/modules/purchasing/services/blanket_agreement_service.py` (NEW — ~550 lines)
  - `src/modules/purchasing/api/v1/blanket_agreements.py` (NEW — ~330 lines)
- **Files modified:**
  - `src/core/documents/document_status.py` (BLA added to LEGAL_TRANSITIONS with comment block)
  - `src/modules/purchasing/models/document.py` (BLA models appended: 8 new model classes)
  - `src/modules/purchasing/services/purchasing_chain_reconciler.py` (5 BLA helpers added, not yet wired)
  - `src/modules/purchasing/api/v1/__init__.py` (bla_router registered)
- **Endpoints added** (prefix: `/api/v1/purchasing`):
  - `GET  /blanket-agreements/active` — active BLAs (status+date filter); PO form hint
  - `GET  /blanket-agreements` — paginated list with filters
  - `POST /blanket-agreements` — create DRAFT BLA
  - `GET  /blanket-agreements/{doc_id}`
  - `PATCH /blanket-agreements/{doc_id}`
  - `PATCH /blanket-agreements/{doc_id}/status`
  - `DELETE /blanket-agreements/{doc_id}` — super_admin only

---

### T-201.8b | Extract ops-side `sale_items` master from finance ext (Wave 6 prep) — Wave 6
- **Category:** Backend (ops + finance) · **Priority:** P2
- **Assigned:** — · **Started:** —
- **Depends on:** T-201.8 ✅ (gives us isStock as the migration testbed)
- **Blocks:** T-600 (standalone mode hardening)
- **Description:** Today the de-facto sale-item master is `SaleItemFinanceExt` in the
  finance microservice MySQL. This breaks standalone mode — ops cannot administer items
  (name, code, isStock, isSellable, UoM, defaultPrice) without finance running. Build
  a proper ops-side `sale_items` Mongo collection and shrink `SaleItemFinanceExt` to a
  GL-account-only overlay (`revenueAccountId`, `cogsAccountId`, `salesTaxCode`).
- **Steps (high level — refine when picked up):**
  1. New ops Mongo collection: `sale_items` (organizationId, itemCode, itemName, isStock,
     isSellable, defaultPrice, uom, isActive, audit timestamps).
  2. Ops endpoints: `GET/POST/PATCH/DELETE /api/v1/sales/items`.
  3. Migration: snapshot read of `SaleItemFinanceExt` denormalized fields (itemCode,
     itemName, isSellable, isStock from T-201.8) → seed `sale_items`. Keep finance ext
     for backward compat; deprecate the denormalized fields with a TODO.
  4. SalesItemsPage refactor: switch primary list source from `useSaleItemFinanceExtList`
     to a new `useSaleItems` hook; render the finance-ext fields (revenue/COGS/tax) as
     a secondary panel that only shows when `financeEnabled` module flag is on.
  5. AR Invoice gating: read `isStock` from ops-side `sale_items` instead of HTTP-hopping
     to finance for the flag. JE handlers continue to call finance for GL accounts.
  6. Standalone-mode smoke test: items can be created + listed + flagged isStock without
     finance running.
- **Notes:**
  - Filed 2026-06-02 alongside T-201.8 Option C decision as the architectural follow-up.
  - Not blocking T-201.8 — runs in parallel with T-201.9/.10/.11.
  - The "snapshot read" migration assumes finance is reachable at migration time. For
    tenants that flipped to standalone before this ships, provide a separate one-off
    import-from-CSV path.

---

### T-201.9 | SO service-line tracking + from-SO AR Invoice endpoint (SAP B1 chain-via-SO) — Wave 3
- **Category:** Backend · **Priority:** P1
- **Assigned:** backend-dev-expert · **Started:** 2026-06-04
- **Depends on:** T-201.8 (isStock flag)
- **Blocks:** T-201.10, T-201.11
- **Description:** Build the SAP B1 / NetSuite pattern: every billable event has an SO root.
  Service lines on an SO are invoiced directly from the SO (no DN). Mixed SOs split: stock
  lines flow through DN → AR Invoice (from-DN); service lines flow SO → AR Invoice (from-SO).
  Service-only SOs (late fees, retainers, ad-hoc charges) skip DN entirely.
- **Steps:**
  1. **SO state machine** — confirm/allow DRAFT → OPEN with all-service lines (no DN gate).
  2. **SO line tracking** — add `invoicedQty` field on the SO line response model (already
     present? confirm). Service-line `invoicedQty` is incremented when a from-SO AR Invoice
     is created against it (parallel to how DN-line `invoicedQty` increments today).
  3. **`create_delivery_from_so`** — when building the DN, filter out lines where the
     underlying sale item is non-stock. Document this in the docstring.
  4. **New endpoint:** `POST /api/v1/sales/ar-invoices/from-so/{soDocEntry}` —
     mirror of `/from-delivery/{deliveryDocEntry}`. Validates that requested lines are
     service-only (else direct user to the DN flow). Increments SO line `invoicedQty`.
     Sets ARI header `baseDocRef = {docType: "SO", docId: soDocEntry, ...}` and per-line
     `baseDocRef = {docType: "SO", docId: soDocEntry, lineId: soLineId}`.
  5. **Auto-close on SO** — apply the same logic as T-201.5 to the SO: when every SO line
     (stock + service) has `open_invoice_qty == 0`, auto-transition SO to CLOSED.
     Audit action: `auto_close_on_full_invoice` (reuse from T-201.5 by parameterizing the
     helper to accept a generic doc collection).
  6. **Counter reconciliation on update/delete/cancel** — apply T-201.6 logic to from-SO
     AR Invoices: edit DRAFT line qty reconciles SO line `invoicedQty`; delete releases;
     `OPEN → CANCELLED` releases. Symmetric auto-reopen.
  7. **Document-chain cleanup** — apply T-201.7 logic to from-SO AR Invoices: `$pull`
     dangling refs from SO `targetDocRefs` (header + per-line) on delete + update.
  8. **Tests:** comprehensive — mirror the test_delivery_invoice_visibility.py suite for
     SO scenarios. Service-only SO end-to-end. Mixed SO: stock through DN, service direct.
     Multi-line, partial invoicing, edit, delete, cancel.
  9. **Important constraint:** stock lines on a mixed SO must still be unreachable from the
     from-SO endpoint (only DN can invoice them). Test this explicitly.
- **Notes:**
  - This is the larger half of the epic. ~250-350 lines of code + ~400 lines of tests.
  - **T-201.9.0 (refactor pre-step) ✅ DONE 2026-06-04:** `doc_chain_reconciler.py` extracted.
    All DN-chain helpers are now parameterised by collection name. Use them directly for SO chain.
    See `src/modules/sales/services/doc_chain_reconciler.py`.
  - **CRITICAL for agent dispatch:** do not run git commit/push.

---

### T-201.10 | Frontend: SO form mode-aware + SO detail service-invoice flow — Wave 3
- **Category:** Frontend · **Priority:** P1
- **Assigned:** — · **Started:** —
- **Depends on:** T-201.9
- **Blocks:** T-201.11
- **Description:** Wire the SO-chain pattern into the UI: SO form adapts to line type mix,
  SO detail surfaces the "Create Service Invoice" action, AR Invoice form gains a
  `from-so` mode.
- **Steps:**
  1. **`SalesOrderFormPage`** — detect line-type mix:
     - When all picked items are non-stock → "service-only mode": hide `deliveryDate`,
       warehouse fields, etc. Form title hint: "Service-Only Sales Order".
     - When mixed → tag each line visually with **[Stock]** / **[Service]** badge.
     - Stock-only → existing form unchanged.
  2. **`SalesOrderDetailPage`** — add "Generate Service Invoice" button when SO has
     unbilled service lines (computed: any line where `item.isStock=false` AND
     `line.invoicedQty < line.quantity`). Button navigates to
     `/sales/ar-invoices/from-so/{soDocEntry}`.
  3. **`SalesOrderDetailPage`** — Lines table:
     - For service lines: show **Invoiced** + **Open to Invoice** columns (like DN detail).
     - For stock lines: show **Delivered** + **Invoiced** (existing).
     - Mixed table: both column sets visible; per-row rendering depends on item type.
  4. **`ARInvoiceFormPage`** — add `from-so` mode (third mode alongside `direct` + `from-delivery`):
     - URL param `:soDocEntry` triggers it
     - Pre-fill: customer from SO, lines from SO service-lines, prices from SO, qty defaults
       to `open_invoice_qty` per line
     - Customer locked (like from-Delivery)
     - Item picker disabled (like from-Delivery)
     - Submit calls the new from-SO endpoint
  5. **Routing** — add `/sales/ar-invoices/from-so/:soDocEntry` to the router.
  6. **DeliveriesPage** — no changes needed (service items never appear on DNs).
  7. **`SalesOrdersPage`** — add Service-only filter chip (analogous to T-201.5's
     "Open to Invoice" chip on Deliveries). Add per-row badge for `service_open_invoice_qty`.
  8. **Tests:** TypeScript clean. Manual hand-testing checklist for the next session.
- **Notes:**
  - Reuse the existing `SalesItemCombobox` with `filterIsStock` prop (from T-201.8).
  - Reuse the existing badge/chip styled components from T-201.5's DN detail work.
  - **CRITICAL for agent dispatch:** do not run git commit/push.

---

### T-201.11 | (Optional polish) Quick Service Charge shortcut on customer detail — Wave 3
- **Category:** Frontend · **Priority:** P2
- **Assigned:** — · **Started:** —
- **Depends on:** T-201.10
- **Blocks:** —
- **Description:** UX shortcut for frequent ad-hoc service charges (late fees, surcharges).
  Streamlined modal: pick fee item + qty + price → creates service-only SO + posts it +
  creates AR Invoice + posts it, all behind one button. 3 clicks vs 6.
- **Steps:**
  1. Add "Quick Service Charge" button on `CustomerDetailPage`.
  2. Build modal with item picker (`filterIsStock=false`), qty, price, optional notes.
  3. On submit, sequentially call: `POST /sales/orders` (service-only SO) → transition to OPEN
     → `POST /sales/ar-invoices/from-so/{soDocEntry}` (service AR Invoice) → transition to OPEN.
  4. Show progress / handle partial failure (rollback or surface step that failed).
  5. After success, navigate to the AR Invoice detail page or show a success toast with
     chain summary.
- **Notes:**
  - Defer this entirely if T-201.10 is fully sufficient for daily accountant work.
  - **CRITICAL for agent dispatch:** do not run git commit/push.

---


### T-200.25.1 | PO→BLA integration — PO references Blanket Agreement + BLA consumption tracking — Wave 4
- **Category:** Backend · **Priority:** P2
- **Status:** 🟢 Ready
- **Assigned:** — · **Started:** —
- **Depends on:** T-200.25 ✅ (BLA stubs — service + models + reconciler helpers)
- **Blocks:** T-200.26 (full BLA frontend — consumption counters need this to be meaningful)
- **Description:** Wire the BLA into the PO creation flow.  When a PO line is created
  against an active BLA, the BLA's consumption counters are decremented.  When a PO
  referencing a BLA is deleted, the consumption is released and the BLA may auto-reopen.
- **Steps:**
  1. Add optional `bla_doc_id` field to PO line input (and PO create/update schema).
  2. On PO DRAFT→OPEN transition: for each line with `bla_doc_id` set, call
     `reconcile_bla_consumption(db, bla_doc_id=..., line_deltas=..., gross_delta=...)`.
     For line_based BLAs: `line_deltas = {bla_line_id: po_line_qty}`.
     For amount_based BLAs: `line_deltas = {}`, `gross_delta = po_line_gross`.
  3. After reconcile, call `auto_close_bla_if_fully_consumed(...)`.
  4. On PO delete: call `reconcile_bla_consumption` with negative deltas, then
     `auto_reopen_bla_if_not_fully_consumed` and `pull_dangling_bla_consumption_refs`.
  5. Price inheritance hint: if `bla_doc_id` is set on a PO line, the PO service copies
     `bla.lines[matching_line].unitPrice` onto the PO line as a default (frontend may
     already pre-fill via `/blanket-agreements/active` — this is the backend enforcement).
  6. Cap check: `reconcile_bla_consumption` with `cap_check=True` prevents over-consumption.
  7. Tests: PO referencing BLA happy path, over-consumption rejection, PO delete
     releases BLA, BLA auto-close on full PO consumption, BLA auto-reopen on PO delete.
- **Notes:**
  - Reconciler helpers (load_bla_with_lines, reconcile_bla_consumption, etc.) are
    already implemented in T-200.25; this ticket only wires them.
  - Estimate: ~1-2 task cycles.
  - **CRITICAL for agent dispatch:** do not run git commit/push.

---

### T-500 | Wave 5 — Production Cost Accounting (bridge farm production to sales inventory)
- **Category:** Cross-module (farm_manager · finance · sales) · **Priority:** P2
- **Status:** 🟢 Ready (Wave 3 fully closed — T-200.11 ✅ completed 2026-05-31)
- **Assigned:** — · **Started:** —
- **Depends on:** Wave 3 Phase 2 closeout (T-200.10 ✅, T-200.11 ✅)
- **Blocks:** Realistic COGS amounts on sales of self-produced (harvested) items; block-profitability reporting
- **Description:** The Wave 3 sales module reads COGS from `inventory_balances.avgCost`,
  which is populated only by purchasing's Goods Receipt. Self-produced (harvested) items
  never enter `inventory_balances` because farm_manager's `block_harvests` collection
  (13,942 rows live) does not bridge to the finance/sales inventory layer. Result:
  Deliveries of harvested items post Dr COGS 0 / Cr Inventory 0 — mathematically correct
  for zero input, but does not reflect real production cost. Additionally there is no
  per-block cost-of-production tracking despite `inventory_input` (171 rows) recording
  inputs consumed by blocks.
- **Today's gap (architectural):** Two parallel inventory systems coexist:
  - Farm side: `blocks`, `block_harvests`, `inventory_input`, `inventory_waste`, `inventory_asset`
  - Sales/finance side: `inventory_balances` (empty), `inventory_movements` (ledger; unitCost=0 on every harvest-related row)
  - No bridge; no cost flow Inputs → WIP → Finished Goods → COGS.
- **Target model:** Standard mid-market ERP process-costing flow:
  1. Issue inputs to production: Dr WIP(block) / Cr Raw Materials Inventory
  2. Accumulate per-block WIP balance during growth cycle
  3. On harvest: allocate WIP to harvested units; Dr Finished Goods Inv / Cr WIP
  4. Block close: roll-forward or write-off remaining WIP
  5. Sales chain reads finished-goods avgCost automatically; correct COGS posts on Delivery
- **Design decisions to settle BEFORE implementation:**
  1. **Item identity duality** — input items (TOM-SEED you buy) vs harvested output items
     (Tomatoes Grade A you sell) need separate itemCodes OR a dual-role flag. Recommend
     separate items linked by a production-routing record.
  2. **Warehouse/location modelling** — is each block its own warehouse, or do we add a
     "block_id" axis to inventory_balances? Recommend block-as-location dimension since
     blocks have lifecycle (planted → harvested → cleared) that warehouses don't.
  3. **Multi-harvest cost allocation** — for blocks with multiple harvest events per
     cycle, allocate WIP proportionally per harvest, OR zero WIP at first harvest, OR use
     standard cost. Recommend proportional allocation.
  4. **Loss/waste accounting** — `inventory_waste` (1 row today) should post Dr COGS-Waste /
     Cr Inventory at moving-avg cost. Currently no GL posting.
  5. **Chart of accounts additions** — new accounts needed: Work-in-Progress (WIP),
     Finished Goods Inventory (separate from Raw Materials), Production Variance.
     ~5 new GL accounts.
  6. **Cost mapping** — every input item must have a costAccountId; every harvested item
     must have a finishedGoodsAccountId. Extend `sale_item_finance_ext` or create
     `production_item_finance_ext` for the new fields.
- **Implementation phases (sequenced):**
  - **Phase 1 — Bridge harvest → sellable inventory (MVP, mechanical only).** When a
    `block_harvests` row is recorded, automatically create an `inventory_movements` row
    (movementType=harvest, quantity=+harvest_qty) AND upsert `inventory_balances` for
    the harvested item. Initial unitCost = 0 (Phase 2 fills this in). Sales chain
    mechanically works against harvested items. Estimate: 2-3 task cycles.
  - **Phase 2 — Per-block WIP tracking.** New collection `block_wip` (or extend
    `blocks`). Every `inventory_input` row adds its cost to the block's running WIP
    balance. Block detail page surfaces running cost. Estimate: 2-3 task cycles.
  - **Phase 3 — Cost transfer on harvest.** On harvest event, allocate
    `(block_wip_total / harvest_qty)` as the unitCost on the inventory_movements row
    AND `inventory_balances.avgCost`. Clear WIP proportionally. Sales chain now reads
    real production cost. Estimate: 2 task cycles.
  - **Phase 4 — GL postings for production events.** Finance event handlers for
    `input_issued` (Dr WIP / Cr Raw Materials), `harvest_recorded` (Dr Finished
    Goods / Cr WIP), `waste_recorded` (Dr COGS-Waste / Cr Inventory). Requires CoA
    extension. Estimate: 2 task cycles.
  - **Phase 5 — Sales correctness verification + reports.** End-to-end smoke
    verifying Quote → SO → DN → ARI now post real COGS amounts for harvested
    products. New report: block profitability (revenue from sales − accumulated WIP).
    Estimate: 1-2 task cycles.
- **Total estimate:** ~10-12 task cycles. Substantial. Worth doing carefully.
- **Why deferred from Wave 3:** Wave 3 Sales Module is shippable today for credit-sale
  workflows against externally-purchased items (those have GR history and therefore
  valid inventory_balances). The harvested-item COGS gap is a real limitation but does
  not block accountant acceptance testing of the chain itself — the JE structure is
  correct, only the amount is zero. Wave 5 closes the loop.
- **Notes:**
  - User confirmed this scope on 2026-05-31 after a clear walk-through of the gap.
  - Design doc should be drafted BEFORE Phase 1 implementation begins. The 6 design
    decisions above all have second-order consequences across modules.
  - Wave 4 (Purchasing parity upgrade — Blanket Agreement, Quotation, Returns flow,
    Down Payment, Vendor Refund) is independent and can interleave with Wave 5
    phases as priorities allow.

---

### T-501 | Wave 5 — Packing materials BOM + multi-component COGS at Delivery
- **Category:** Cross-module (sales · finance · inventory) · **Priority:** P2
- **Status:** 🟢 Ready (design-doc first; pre-empts no other ticket)
- **Assigned:** — · **Started:** —
- **Depends on:** T-500 Phase 3 ideally (real produce avgCost so the produce side of the
  composite COGS posting carries a real number, not zero). Can start design + Phase 1
  schema in parallel with T-500.
- **Blocks:** Accurate margin reporting on packed-and-shipped produce; per-block
  profitability reports that include packing overhead.
- **Description:** Today every sales item posts a single-component COGS at Delivery
  (`Dr COGS / Cr Inventory` for the produce side only). Real produce sales bundle the
  harvested item with packing materials — cartons, punnets, labels, tape, ice packs —
  each with its own unit cost and its own COGS account. A "Tomato 5 kg carton" sold at
  AED 105 actually costs (5 kg × bulk-cost) + (1 × carton-10kg cost) + (1 × label) +
  (~0.05 m tape). Without packing in COGS, margin reports overstate gross margin by
  whatever the packing share is — often 4–8% on produce. T-501 lands a small BOM-lite
  layer that attributes packing components at the existing Delivery posting event.

- **Design decisions to settle BEFORE implementation:**
  1. **Where the packing BOM lives.** Two options:
     (a) New table `sale_item_packing_components` keyed on `saleItemId` with rows
         `(packingItemId, qtyPerSoldUnit, cogsAccountId?)`. Same shape as a production
         BOM, smaller scope.
     (b) Embed packing list inside the ops-side `sale_items` master (T-201.8b) as a
         `packing: [{itemId, qtyPerUnit}]` array.
     Recommend (a) — keeps the master clean, easy to extend to multi-variant per item
     (different packing per customer / region).
  2. **Single-variant vs multi-variant packing per item.** "Tomatoes" might pack as
     5 kg punnet OR 10 kg carton depending on customer. Recommend supporting multiple
     variants from day one with a default flag; the SO line picks which variant.
  3. **Where packing materials live in inventory.** Cartons / labels / tape are their
     own SKUs in the new `sale_items` master (`isStock=true, isSellable=false`).
     Inventory tracked by `inventory_movements`; reorder via existing purchasing flow.
  4. **Cost-flow timing.** COGS posts at DN OPEN, same event as produce COGS today.
     Single composite JE per DN line with multiple debit + credit legs.
  5. **SO-line reservation.** SO commit reserves both produce inventory AND packing
     materials. Out-of-stock packing should warn at SO time (not surprise at DN).
  6. **Pickup orders / bulk sales.** Customer picks up loose — no packing. Packing
     plan = empty; DN posts produce-only COGS. Default flow handles this.
  7. **Spoilage / waste during packing.** Separate event (inventory adjustment),
     not the DN's problem. Out of scope for T-501.

- **Recommended user flow (sketch — refine in design doc):**

  *Item master setup (one-time, admin):*
    On the SalesItemsPage, "Tomatoes" gets a Packing section with one or more variants:
    `[10 kg carton] = 1 × Carton-10kg + 1 × Label + 0.05m Tape (default)`,
    `[5 kg punnet] = 2 × Punnet-5kg + 2 × Label + 0.1m Tape`.

  *Sales Order line (salesperson):*
    Add "Tomatoes 1000 kg". A "Packing" dropdown defaults to the item's default
    variant. Salesperson can override per customer ("they want 5 kg punnets"). SO
    reserves both produce + computed packing materials.

  *Delivery Note (warehouse):*
    DN from SO pre-fills packing plan. Each line shows two allocations:
      - Produce allocation — existing flow (batch → quantity)
      - Packing allocation — `100 × Carton-10kg + 100 × Label + 5m Tape` (new)
    Warehouse can adjust on the fly: "ran out of 10 kg cartons, used 80 × 10 kg
    + 40 × 5 kg" — the row splits into two packing sub-lines, packing material
    requirements recompute. On DRAFT → OPEN, `inventory_movements` rows are
    written for **both** produce (existing) and each packing component (new).
    The JE handler emits one composite JE per DN line:
      `Dr COGS-Produce + Dr COGS-Packing × N / Cr Inventory-Produce + Cr Inventory-Packing × N`.

  *AR Invoice (accountant):* Unchanged — bills the kg ordered. Revenue side is
  packing-agnostic.

  *Reports:* New "COGS breakdown" column on AR/sales reports split produce vs
  packing per line, per period. Packing-materials consumption rolls into the
  reorder report.

- **Implementation phases (sequenced; estimate ~6-8 task cycles total):**
  - **Phase 1 — Schema + admin.** New `sale_item_packing_components` table (or the
    chosen home from decision #1) + admin UI to define variants on SalesItemsPage.
    Cartons/labels/tape land in inventory as their own items. Estimate: 2 cycles.
  - **Phase 2 — SO + DN propagation.** SO line carries `packingVariant` reference.
    DN line carries `packingActual: [{packingItemId, quantity}]` allowing warehouse
    adjustment. `inventory_movements` rows written for both produce and packing on
    DRAFT → OPEN. Estimate: 2 cycles.
  - **Phase 3 — JE handler multi-leg.** Extend `delivery_posted` finance handler to
    emit composite COGS posting (multiple Dr COGS legs, multiple Cr Inventory legs).
    Per-component cogsAccountId resolved from the packing item's finance ext.
    Estimate: 1-2 cycles.
  - **Phase 4 — Reports + reservation warnings.** COGS-breakdown report column,
    out-of-stock packing warning at SO commit, packing consumption in reorder feed.
    Estimate: 1-2 cycles.

- **Honest trade-offs:**
  - **Pro:** Margin reports become honest. Packing-material visibility for reorder
    + waste. Reuses the existing DN posting event — no new doc type, no new chain
    transitions. The packing-BOM table generalises to a full production BOM later
    (Wave 5 progression — Pattern B → Pattern A).
  - **Con:** Forces operational discipline: cartons / labels / tape must be tracked
    as inventory SKUs with periodic counts. Without that discipline, packing-COGS
    drifts from reality. ~3 new touch points across services. Multi-leg JE is more
    work than the current single-leg COGS — testing surface widens.
  - **Honest gap:** True catch-weight produce (each 5 kg carton actually weighs
    4.7 to 5.3 kg) is NOT addressed by T-501. The carton's contents weight is
    assumed equal to the SO line's nominal qty. Catch-weight is its own ticket
    (T-502 if needed, post-Wave-5).

- **Notes:**
  - Filed 2026-06-02 with Viet Anh during T-201.8 closeout after a design discussion
    on how to capture packing cost in COGS. Decided this is a Wave 5 sibling concern,
    not a Wave 3 fix.
  - Design doc should be drafted BEFORE Phase 1 implementation. Especially decisions
    #1 and #2 (BOM home + multi-variant) have second-order consequences.
  - Loosely depends on T-201.8b (ops-side sale_items master) — packing materials
    naturally live there. If T-201.8b ships first, the packing-components table just
    keys to ops-side items. If T-501 ships first, it can key to finance-side
    `SaleItemFinanceExt.itemId` and migrate later.

---

### T-600 | Wave 6 — Standalone-mode hardening + external accounting export (run Sales/Purchasing without finance)
- **Category:** Cross-module (sales · purchasing · core · finance-gating) · **Priority:** P2
- **Status:** 🟢 Ready (post-Wave 5; can interleave with Wave 4)
- **Assigned:** — · **Started:** —
- **Depends on:** Wave 3 Phase 2 closeout (✅), Wave 5 (T-500) phases 1–3 ideally complete so inventory cost flow is correct in standalone too
- **Blocks:** Shipping A64 as a non-finance product mode to customers who use Xero/QuickBooks/etc.
- **Description:** Wave 0 already split deployment into ops-only vs full-stack via the
  `organizations.modules.financeEnabled` flag + the `--profile finance` Docker split.
  The architecture supports standalone, but several ops-side code paths still assume
  the finance microservice is reachable, and there is no built-in way to push transactions
  to an external accounting system. This wave hardens standalone mode and ships the
  export feature so customers running Xero/QuickBooks/external can use Sales + Purchasing
  as their operational system of record.
- **Customer profiles this serves:**
  - **Pattern 1 (dominant) — "I have Xero/QuickBooks already":** wants A64 for inventory +
    document workflow + customer/vendor management, accounting lives elsewhere. Needs
    transaction export.
  - **Pattern 2 — "Small op, manual reconciliation in Excel":** logs in periodically,
    grabs CSV exports of open AR / open AP / cash flow. Most exists; needs polish.
  - **Pattern 3 — "Internal procurement / packing-house portal, no accounting":** today's
    modules already serve this; just needs the finance-required code paths to degrade
    gracefully.
- **What works in ops-only today (verified):**
  - Full document chain: Quote → SO → DN → AR Invoice → Customer Receipt (sales)
  - Full document chain: PR → PO → GR → AP Invoice → Vendor Payment (purchasing)
  - Inventory tracking (`inventory_movements`, `inventory_balances`) in ops Mongo
  - Customer/vendor masters, BP Ref tracking, doc numbering, audit trail
  - Tax codes, operational reports (Open SOs, Open POs, Inventory on Hand, Sales by Customer)
- **Known gaps in current code (must be fixed for clean standalone):**
  1. `_build_line_doc` in `ar_invoice_service.py` looks up `revenue_account_id` from finance
     microservice's `sale_item_finance_ext` (MySQL). Today this would error out blocking
     AR Invoice creation when `financeEnabled=false`. Needs: conditional lookup + `null`
     fallback OR Mongo-side default revenue category string per item.
  2. Same pattern for `customer_finance_ext.arControlAccountId` lookup in AR Invoice creation.
  2a. **(Added 2026-06-02, surfaced during T-202.)** `_build_line_doc` resolves `taxPercent`
     by HTTP-calling `GET /api/v1/finance/tax-codes` and filtering for the line's
     `taxCodeId`. Standalone mode either (a) needs an ops-side `tax_codes` Mongo
     collection seeded at tenant setup and read locally, OR (b) needs to mirror the
     SO pattern — the client (frontend) ships `taxPercent` as a number on every
     ARI line, the backend trusts it, no HTTP lookup. **Option (b) is the smaller change
     and matches the existing SO flow** — the only caveat is the frontend tax-code
     picker (`useTaxCodes` hook) needs a Mongo fallback for the dropdown source.
     **Decision (Viet Anh, 2026-06-02):** defer to Wave 6, don't carve out a T-202.1.
     The current T-202 fix is correct for full-stack mode; standalone tax correctness
     waits for the broader Wave 6 standalone-mode hardening pass.
  3. Credit limit checks on SO (`outstandingAr` source) — needs Mongo-based fallback
     (sum of open AR Invoices per customer) when finance is off.
  4. Finance Companies lookup for `companyCode` resolution (T-201.0) — standalone needs
     either a replicated company list in ops Mongo OR accepts single-company-only.
  5. `SalesItemsPage` displays Revenue Account + COGS Account columns from `sale_item_finance_ext`;
     in standalone mode these should hide gracefully, replaced by free-text "Revenue Category"
     / "Cost Category" strings stored on the ops-side `sale_items` document.
  6. Posting Setup page (already correctly gated by `financeEnabled`) — verify it hides cleanly.
  7. AR / AP aging reports — today these can be derived from Mongo but aren't formal
     standalone reports; need Mongo-side aggregation endpoints.
- **External accounting export feature (Pattern 1):**
  - Minimum viable: CSV exports of AR Invoices (header + lines), AP Invoices, Customer Receipts,
    Vendor Payments, with a per-tenant column-mapping config (which CSV column = which
    Xero/QuickBooks field).
  - Better: Universal Business Language (UBL) XML export for tax-compliant invoice
    interchange (UAE eInvoicing alignment is a future bonus).
  - Best: Direct API integration with Xero / QuickBooks / Zoho Books via OAuth + webhook
    push on document post. Probably one integration per cycle; ship CSV first.
  - Reconciliation tracking: each pushed document gets a `externalSyncStatus` field
    (pending / pushed / failed) so the user can see which docs are in their external system.
- **Steps (sequenced):**
  1. **Phase A — Graceful degradation audit.** Walk every backend call that reaches into
     finance MySQL or the finance microservice. For each, decide: skip-if-disabled,
     Mongo-fallback, or fail-with-clear-error. Document in a new
     `Docs/1-Main-Documentation/Standalone-Mode.md`. Estimate: 1 cycle.
  2. **Phase B — Implement Mongo fallbacks.** AR Invoice creation works with
     `financeEnabled=false`; credit checks fall back to Mongo aggregation; SalesItemsPage
     swaps the finance columns for ops-side strings. Estimate: 2 cycles.
  3. **Phase C — Standalone-mode UI polish.** Sidebar shows only relevant modules; doc
     detail pages hide finance-specific sections (JE preview, posted GL refs); item form
     swaps comboboxes for free-text. Estimate: 1 cycle.
  4. **Phase D — Mongo-based aging reports.** AR Aging (Current / 30 / 60 / 90+ buckets by
     customer); AP Aging (same shape by vendor); accessible from a new "Reports" section
     under each module. Estimate: 1 cycle.
  5. **Phase E — CSV export endpoints.** Per-tenant column mapping config; downloads for
     each of the 4 doc types; "Mark as Exported" workflow. Estimate: 1-2 cycles.
  6. **Phase F — External system integrations (per integration; ship as a per-cycle
     incremental feature).** Xero OAuth + push-on-post. Then QuickBooks. Then Zoho Books.
     Each integration ~1-2 cycles. Skip until customer demand exists.
  7. **Phase G — Deployment guide + documentation.** `Docs/1-Main-Documentation/Standalone-Mode.md`
     covers tenant setup, what works, what doesn't, the export feature, integration setup,
     limitations. Estimate: 0.5 cycle.
- **Total estimate (Phases A-E):** ~5-6 task cycles for a polished, customer-shippable
  standalone story. Phase F integrations add ~1-2 cycles each as demand surfaces.
- **Notes:**
  - User confirmed scope on 2026-06-01 after a discussion of the standalone story.
  - Wave 6 can interleave with Wave 4 (Purchasing parity) and Wave 5 phases — they touch
    different code surface, so parallelism is feasible if developer bandwidth allows.
  - The architectural foundation already exists (Wave 0 split + `financeEnabled` flag);
    this wave is **completing** rather than **introducing** the standalone story.
  - **CRITICAL for agent dispatch:** do not run git commit/push.

---

### T-100 | Wave 3 — Sales module redesign with full SAP B1-parity depth
- **Category:** Backend + Frontend + API · **Priority:** P1
- **Assigned:** — · **Started:** 2026-05-29
- **Depends on:** T-100.1 🔵 (shared document infrastructure, active)
- **Blocks:** T-200
- **Description:** Full redesign of the Sales module to reach SAP B1 document-chain
  parity. Covers the complete Quote → SO → Delivery → AR Invoice → Payment cycle
  with open-quantity tracking, base/target linking, proper status lifecycles, and
  finance JE integration. ~6-8 weeks total effort.
- **Sub-tasks:**
  - T-100.1 — Shared document infrastructure (Phase 0) 🔵 Active
  - T-100.2 — Customer finance extension (backend, Wave 3 Phase 1) ✅ Done (2026-05-29)
  - T-100.2.1 — Seed AR control account in default CoA ✅ Done (2026-05-29)
  - T-100.3 — Item sales finance extension (backend, Wave 3 Phase 1) ✅ Done (2026-05-29)
  - T-100.4 — Sales Quotation document (QUOTE) ✅ Done (2026-05-29)
  - T-100.5 — Sales Order (SO) with SO-from-Quote flow ✅ Done (2026-05-29) [numbered as T-100.7 in backlog]
  - T-100.6 — Sales Quotation (QUOTE) ✅ Done (2026-05-29) [numbered as T-100.4 in backlog]
  - T-100.8 — Delivery Note (DN) with open-qty decrement on SO lines ✅ Done (2026-05-29)
  - T-100.8.1 — delivery_posted finance handler (COGS JE) 🔴 Blocked (depends on T-100.8)
  - T-100.9a — AR Invoice backend (ops side): ar_invoices_v2, ARI doc lifecycle, sales_invoice_posted event ✅ Done (2026-05-29)
  - T-100.9b — sales_invoice_posted finance handler + arControlAccountId column on CompanyPostingSetup ✅ Done (2026-05-29) — revenue JEs live: DR AR / CR Revenue / CR Output VAT. IS revenue side wired end-to-end.
  - T-100.9.1 — Down payment netting in sales_invoice_posted (placeholder — depends on future DP doc work)
  - T-100.9.2 — Multiple Output VAT lines grouped per tax-code (placeholder — currently one combined line, sufficient for standard UAE VAT single-rate but limiting for multi-rate scenarios)
  - T-100.10 — Customer Receipt (IPAY) backend (ops side) ✅ Done (2026-05-29) — customer_receipts_v2, IPAY doc lifecycle, atomic paid_amount updates on AR Invoices, customer_payment_received outbox event
  - T-100.10.1 — customer_payment_received finance handler (DR Bank / CR AR JE) ✅ Done (2026-05-29) — `_validate_bank_account_or_raise` + `_handle_customer_payment_received` + `_handle_customer_payment_cancelled` + dispatcher registration; 14 new tests; cash collection cycle fully wired end-to-end
  - T-100.11 — Returns flow (bundled): Return Request (RR) + Return Note (RTN) + AR Credit Note (ARC) + 2 finance handlers ✅ Done (2026-05-29) — return_requests_v2, returns_v2, ar_credit_notes_v2 collections; return_posted/cancelled + credit_note_posted/cancelled finance handlers; creditedAmount field on ARI totals; 90 new tests across 5 test files
  - T-100.11.1 — Returns flow repair: fix 47 test failures left broken by T-100.11 agent (false "342 pass, zero regressions" claim) ✅ Done (2026-05-30)
  - T-100.11.2 — Finance posting setup for Returns flow (A001 config gap) ✅ Done (2026-05-30) — migration 018 adds A001 company_codes + fiscal_period + posting_setup; all Wave 3 events now process cleanly
  - T-100.12 — Customer Payment (OPAY)
  - T-100.13 — Sales dashboard V2 + frontend pages (all doc types)

---

### T-100.1 | Shared document infrastructure (Wave 3 Phase 0)
- **Category:** Backend · **Priority:** P0
- **Assigned:** backend-dev-expert · **Started:** 2026-05-29
- **Depends on:** —
- **Blocks:** T-100.2, T-200.1 (Wave 4 purchasing parity retrofit)
- **Description:** Pure library code — no API endpoints, no schema migrations, no
  running-service impact. Provides the six foundational helpers that every future
  sales and purchasing document will inherit from.
- **Files created:**
  - `src/core/documents/__init__.py` — package init + module summary
  - `src/core/documents/document_links.py` — DocumentLinkRef, DocumentLineLinkMixin, write_back_target_ref, find_broken_links
  - `src/core/documents/open_quantity.py` — LineQuantityState, increment_consumed_qty, get_quantity_state
  - `src/core/documents/doc_number.py` — next_doc_number, DOC_TYPE_PREFIXES, assert_no_gaps
  - `src/core/documents/bp_ref.py` — BPReferenceMixin
  - `src/core/documents/journal_memo.py` — JournalMemoMixin, format_journal_memo
  - `src/core/documents/document_status.py` — DocumentStatus enum, LEGAL_TRANSITIONS, assert_legal_transition
  - `src/core/documents/tests/__init__.py` — test package init
  - `src/core/documents/tests/test_document_infrastructure.py` — 32 tests across all 6 modules
  - `Docs/4-Finance-Mod-docs/Document-Conventions.md` — contract documentation (~200 lines)
- **Steps:**
  1. Read CodeMaps + survey existing purchasing patterns ✅
  2. Create `src/core/documents/` package ✅
  3. Implement 6 modules with full type hints and docstrings ✅
  4. Write 32 unit tests (no live DB required — fake Motor) ✅
  5. Write Document-Conventions.md contract doc ✅
  6. Update BACKLOG.md ✅

---

### T-100.4 | Sales Quotation document (QUOTE) — backend (Wave 3 Phase 2) ✅ Done
- **Category:** Backend · **Priority:** P1
- **Assigned:** backend-dev-expert · **Started:** 2026-05-29 · **Done:** 2026-05-29
- **Depends on:** T-100.1 🔵
- **Blocks:** T-100.5 (SO-from-Quote flow needs quote line target_doc_refs and consumed_qty)
- **Description:** First greenfield sales document in the quote-to-cash chain. Non-posting
  offer to a customer; no GL impact. DRAFT → OPEN → CLOSED / CANCELLED lifecycle.
  Establishes patterns for SO, Delivery, AR Invoice.
- **T-100.1 fix:** `_matches()` $regex operator in test helper stripped leading `^` anchor
  (was causing `assert_no_gaps` test to return empty instead of detecting gap). 59→59 T-100.1 tests all pass.
- **Files created:**
  - `src/modules/sales/models/quotes.py` — QuoteLineCreate/Update/Response, QuoteCreate/Update/Response, QuoteListItem, QuoteTotals, QuoteStatusTransitionRequest
  - `src/modules/sales/services/quote_service.py` — create_quote, get_quote, list_quotes, update_quote, transition_status, delete_quote
  - `src/modules/sales/api/v1/quotes.py` — 6 endpoints (list, get, create, patch, delete, transition)
  - `src/modules/sales/tests/__init__.py` — test package init
  - `src/modules/sales/tests/conftest.py` — sys.modules stubs for missing Docker-only deps
  - `src/modules/sales/tests/test_quotes.py` — 21 tests (all pass)
- **Files modified:**
  - `src/modules/sales/api/v1/__init__.py` — registered quotes_router at prefix /quotes
  - `src/core/documents/tests/test_document_infrastructure.py` — fixed $regex stub (lstrip "^")
- **Endpoints registered** (prefix: `/api/v1/sales/quotes`):
  - `GET    /` — paginated list with status, customer_id, date_from, date_to filters
  - `GET    /{doc_entry}` — single quote detail with all lines
  - `POST   /` — create DRAFT quote (doc_number = SQ-YYYY-NNNN via next_doc_number("QUOTE"))
  - `PATCH  /{doc_entry}` — update header/lines (DRAFT only)
  - `DELETE /{doc_entry}` — hard delete (DRAFT only)
  - `POST   /{doc_entry}/transition` — status transition (QUOTE LEGAL_TRANSITIONS enforced)
- **QUOTE transition table** (from T-100.1 document_status.py):
  - DRAFT → OPEN, CLOSED, CANCELLED
  - OPEN  → CLOSED, CANCELLED
  - CLOSED / CANCELLED → terminal (no further transitions)
- **Test results:** 21 new, 21 pass. T-100.1 tests: 59 pass (was 58 before $regex fix → now 59). Zero regressions.
- **Note on DRAFT→CLOSED:** Allowed directly (expiry use-case). Task spec said "DRAFT→CLOSED illegal" but T-100.1 table already has it as legal; kept T-100.1 as source of truth and updated test accordingly.

---

### T-100.7 | Sales Order (SO) backend — Wave 3 Phase 2 ✅ Done
- **Category:** Backend · **Priority:** P1
- **Assigned:** backend-dev-expert · **Started:** 2026-05-29 · **Done:** 2026-05-29
- **Depends on:** T-100.6 (Sales Quote) ✅, T-100.1 (shared document infra) ✅
- **Blocks:** T-100.8 (Delivery Note — needs SO lines with open_qty tracking)
- **Description:** Second greenfield sales document in the quote-to-cash chain. Confirmed
  customer commitment; no GL posting (commitment only). Includes Quote→SO conversion with
  consumed_qty tracking, credit-limit check at DRAFT→OPEN, per-line inventory reservation
  placeholder (committed_qty), and DRAFT→OPEN→PARTLY_CLOSED→CLOSED / CANCELLED lifecycle.
- **Collection:** `sales_orders_v2` (new; avoids collision with legacy `sales_orders` used by dashboard)
- **Audit collection:** `sales_orders_v2_audit`
- **Files created:**
  - `src/modules/sales/models/sales_orders.py` — SalesOrderLineCreate/Update/Response, SalesOrderCreate/Update/Response, SalesOrderListItem, SalesOrderTotals, CreditCheckSnapshot, SalesOrderStatusTransitionRequest, SalesOrderFromQuoteRequest
  - `src/modules/sales/services/sales_order_service.py` — create_sales_order, create_sales_order_from_quote, get_sales_order, list_sales_orders, update_sales_order, transition_status, delete_sales_order; credit-limit check via httpx to finance microservice
  - `src/modules/sales/api/v1/sales_orders.py` — 7 endpoints (list, get, create, create-from-quote, patch, delete, transition)
  - `src/modules/sales/tests/test_sales_orders.py` — 25 tests (all pass)
- **Files modified:**
  - `src/modules/sales/api/v1/__init__.py` — registered sales_orders_v2_router at prefix /orders-v2
- **Endpoints registered** (prefix: `/api/v1/sales/orders-v2`):
  - `GET    /` — paginated list (status, customer_id, date range, has_open_lines filters)
  - `GET    /{doc_entry}` — single SO detail with all lines
  - `POST   /` — create DRAFT SO (doc_number = SO-YYYY-NNNN)
  - `POST   /from-quote/{quote_doc_entry}` — create from Quote (consumes Quote lines)
  - `PATCH  /{doc_entry}` — update header/lines (DRAFT only)
  - `DELETE /{doc_entry}` — hard delete (DRAFT only; restores Quote consumed_qty if from-quote)
  - `POST   /{doc_entry}/transition` — status transition with optional credit override
- **SO transition table** (from T-100.1 document_status.py):
  - DRAFT → OPEN (credit check), CANCELLED
  - OPEN  → PARTLY_CLOSED, CLOSED (guard: all lines open_qty==0), CANCELLED
  - PARTLY_CLOSED → CLOSED, CANCELLED
  - CLOSED / CANCELLED → terminal
- **Credit check:** GET /api/v1/finance/customer-finance-ext/{customer_id} via httpx; fail-open if service unreachable; override requires super_admin or finance_admin role + reason
- **outstanding_ar placeholder:** Zero until T-100.9 AR Invoice handler is built.
- **Test results:** 25 new, 25 pass. Full sales suite: 46 pass (21 T-100.6 + 25 T-100.7). Zero regressions.
- **URL suffix -v2:** Temporary to avoid collision with legacy /orders route. Rename to /orders when legacy module deprecated (see T-100.7.2 follow-up below).
- **Follow-up tasks:**
  - **T-100.7.1** — Real outstanding_ar in credit-limit check (depends on T-100.9 AR Invoice handler being built; currently zero)
  - **T-100.7.2** — Rename /orders-v2 to /orders when legacy sales_orders module is deprecated

---

### T-100.8 | Delivery Note (DN) backend — Wave 3 Phase 2 ✅ Done
- **Category:** Backend · **Priority:** P1
- **Assigned:** backend-dev-expert · **Started:** 2026-05-29 · **Done:** 2026-05-29
- **Depends on:** T-100.7 (Sales Order — needs SO lines with open_qty tracking) ✅
- **Blocks:** T-100.8.1 (delivery_posted finance handler — COGS JE requires this event)
- **Description:** Third greenfield sales document in the quote-to-cash chain. Records
  physical goods leaving the warehouse. Decrements inventory via `inventory_movements`
  collection, increments source SO line `deliveredQty`, auto-transitions the SO to
  PARTLY_CLOSED / CLOSED when all qty is shipped, and emits `delivery_posted` to the
  finance outbox. Cancellation path reverses all inventory movements and re-opens the SO
  if it was auto-closed by this delivery. No JE posted here — that is T-100.8.1.
- **Collection:** `deliveries_v2` (new); audit: `deliveries_v2_audit`
- **Files created:**
  - `src/modules/sales/models/deliveries.py` — DeliveryLineCreate/Update/Response,
    DeliveryCreate/Update/Response, DeliveryListItem, DeliveryStatusTransitionRequest,
    DeliveryFromSORequest; `DeliveryLineResponse` extends `DocumentLineLinkMixin`
  - `src/modules/sales/services/delivery_service.py` — create_delivery_from_so,
    get_delivery, list_deliveries, update_delivery, transition_status, delete_delivery;
    `_get_moving_avg_cost` resolves unit cost from `inventory_balances`; `_build_outbox_payload`
    builds `DeliveryPostedPayload` / `DeliveryCancelledPayload` contract shapes
  - `src/modules/sales/api/v1/deliveries.py` — 6 endpoints (list, get, create-from-so,
    patch, delete, transition); error mapping: not-found→404, status-conflict→409, qty→422
  - `src/modules/sales/tests/test_deliveries.py` — 30 tests (all pass)
- **Files modified:**
  - `src/modules/sales/api/v1/__init__.py` — registered deliveries_router at prefix /deliveries
  - `src/core/documents/document_status.py` — extended DELIVERY LEGAL_TRANSITIONS: OPEN now
    allows CANCELLED; added CANCELLED as terminal state; PARTLY_CLOSED allows CANCELLED
  - `contracts/finance_events.py` — added DeliveryPostedLine, DeliveryPostedPayload,
    DeliveryCancelledPayload; registered both event types in EVENT_TYPE_REGISTRY
- **Endpoints registered** (prefix: `/api/v1/sales/deliveries`):
  - `GET    /` — paginated list (status, customer_id, so_doc_entry, date_from/to filters)
  - `GET    /{doc_entry}` — single Delivery detail with all lines
  - `POST   /from-so/{so_doc_entry}` — create DRAFT Delivery from SO (doc_number = DN-YYYY-NNNN)
  - `PATCH  /{doc_entry}` — update header/lines (DRAFT only)
  - `DELETE /{doc_entry}` — hard delete (DRAFT only); HTTP 204
  - `POST   /{doc_entry}/transition` — status transition (DELIVERY LEGAL_TRANSITIONS enforced)
- **DELIVERY transition table** (updated in document_status.py):
  - DRAFT → OPEN (posts delivery; decrements inventory; increments SO deliveredQty; emits delivery_posted), CANCELLED
  - OPEN → PARTLY_CLOSED, CLOSED, CANCELLED (cancel: reverses inventory; restores SO qty; emits delivery_cancelled)
  - PARTLY_CLOSED → CLOSED, CANCELLED
  - CLOSED / CANCELLED → terminal
- **SO auto-transition logic** (triggered by DRAFT→OPEN on Delivery):
  - If all SO lines open_qty ≤ tolerance after increment → SO transitions CLOSED
  - If SO was OPEN and any qty delivered → SO transitions PARTLY_CLOSED
  - Cancellation: re-opens SO only if this Delivery's doc_entry appears in SO's targetDocRefs
- **Finance outbox events emitted:**
  - `delivery_posted` — DeliveryPostedPayload (lines with unitCost, lineCogs, warehouseId, costCenterId; totalCogs; sourceSoDocEntry)
  - `delivery_cancelled` — DeliveryCancelledPayload (same fields + originalEventId)
- **Test results:** 30 new, 30 pass. Full sales suite: 76 pass (21 T-100.6 + 25 T-100.7 + 30 T-100.8). Zero regressions.

---

### T-100.8.1 | delivery_posted finance handler (COGS JE) — Wave 3 Phase 2 ✅ Done
- **Category:** Backend · **Priority:** P1
- **Status:** ✅ Done
- **Assigned:** backend-dev-expert · **Started:** 2026-05-29 · **Done:** 2026-05-29
- **Depends on:** T-100.8 ✅ (Delivery Note backend — emits delivery_posted event)
- **Blocks:** T-100.8.2 (inventory_movements event-ID cross-service consistency — placeholder)
- **Description:** Finance consumer handler that processes `delivery_posted` and
  `delivery_cancelled` outbox events. Posts COGS JE: `Dr COGS / Cr Inventory` per line
  (2 × N lines per delivery). Cancellation reverses the original JE. First sales-side
  GL posting milestone (Wave 3 Phase 2).
- **Files modified:**
  - `services/finance/src/finance/api/v1/events.py` — 2 new account-resolution helpers
    (`_resolve_item_cogs_account_or_raise` at line 693,
    `_resolve_item_inventory_account_validated_or_raise` at line 776), 2 new handlers
    (`_handle_delivery_posted` at line 865, `_handle_delivery_cancelled` at line 1027),
    dispatcher branches at lines 1821–1826. Updated model imports to include
    `SaleItemFinanceExt`, `DrawerEnum`, `AccountTypeEnum`.
  - `services/finance/tests/test_posting_delivery_posted.py` — NEW, 12 tests (all pass)
- **No schema changes** — no Alembic migration needed.
- **Test results:** 12 new tests, all pass. Total suite: 342 pass, 1 skipped. Zero regressions.
- **Deploy:** Rebuild finance container only. No migration. No ops-side changes.

### T-100.8.2 | inventory_movements event-ID cross-service consistency — placeholder
- **Category:** Backend · **Priority:** P3
- **Status:** 🔵 Ready (placeholder — not blocking)
- **Depends on:** T-100.8.1 ✅
- **Blocks:** —
- **Description:** Ensure cross-service consistency between ops inventory state and finance
  JE state by tracking `delivery_posted` event IDs in `inventory_movements` (or equivalent
  ops-side table). Currently the finance JE is the only record of the event linkage.
  Placeholder: do not implement until the ops inventory_movements table design is finalized.

---

### T-100.9b | sales_invoice_posted finance handler + arControlAccountId column ✅ Done
- **Category:** Backend (Finance service) · **Priority:** P0
- **Assigned:** backend-dev-expert · **Started:** 2026-05-29 · **Done:** 2026-05-29
- **Depends on:** T-100.9a ✅ (AR Invoice backend — emits sales_invoice_posted event + contract)
- **Blocks:** T-100.9.1 (down payment netting), T-100.9.2 (multi-rate Output VAT grouping)
- **Description:** Revenue side of the Income Statement wired end-to-end.  AR Invoice JE handler + cancellation reversal.  arControlAccountId column was already present in migration 008, ORM, Pydantic schemas, and both posting guards — no migration 018 required.
- **Deliverables:**
  - **`_handle_sales_invoice_posted`** — posts DR AR / CR Revenue (per line) / CR Output VAT (combined, skipped if zero-tax).  3-tier AR resolution chain: customer_finance_ext → company_posting_setup → 124000-001 fallback.
  - **`_handle_sales_invoice_cancelled`** — reversal JE (DR↔CR swap).  Original JE stays POSTED.  Idempotency guard mirrors delivery_cancelled pattern.
  - **Dispatcher** additions for `sales_invoice_posted` and `sales_invoice_cancelled`.
  - **`_resolve_ar_control_account_or_raise`** helper — validates active, non-header, ASSETS/asset.
  - **`_validate_revenue_account_or_raise`** helper — validates active, non-header, REVENUE/revenue.
  - **`CustomerFinanceExt`** added to ORM imports in events.py (was missing).
  - **`tests/test_posting_sales_invoice_posted.py`** — 19 tests (all pass).
  - **`Docs/4-Finance-Mod-docs/Document-Conventions.md`** — `_handle_sales_invoice_posted` behaviour section added.
- **Files modified:**
  - `services/finance/src/finance/api/v1/events.py` — added two handlers + two helpers + dispatcher entries + CustomerFinanceExt import
  - `services/finance/tests/test_posting_sales_invoice_posted.py` — NEW (19 tests)
  - `Docs/4-Finance-Mod-docs/Document-Conventions.md` — updated
  - `Docs/Backlog/BACKLOG.md` — this entry
- **Test results:** 19 new, 19 pass. Full suite: 361 passed, 1 skipped (baseline was 342+1). Zero regressions.
- **Rebuild needed:** No schema changes — arControlAccountId already in DB. Restart finance service to pick up the new handler code.
- **Follow-up tasks added:**
  - T-100.9.1 — Down payment netting in sales_invoice_posted
  - T-100.9.2 — Multiple Output VAT lines grouped per tax-code

---

### T-100.9.1 | Down payment netting in sales_invoice_posted — placeholder
- **Category:** Backend (Finance service) · **Priority:** P2
- **Status:** 🔵 Ready (placeholder — not blocking)
- **Depends on:** T-100.9b ✅ + future DP (down payment) document work
- **Description:** When `totals.downPaymentApplied > 0`, reduce the AR DR by the down payment amount and credit the DP liability clearing account.  The v1 handler assumes `downPaymentApplied == 0` and ignores this field.  Implement only after the DP document type and its GL account are defined.

---

### T-100.9.2 | Multiple Output VAT lines grouped per tax-code — placeholder
- **Category:** Backend (Finance service) · **Priority:** P3
- **Status:** 🔵 Ready (placeholder — not blocking)
- **Depends on:** T-100.9b ✅
- **Description:** The v1 handler emits one combined CR Output VAT line per invoice.  For multi-rate UAE VAT scenarios (e.g., mix of 0% and 5% on the same invoice), group Output VAT by tax-code and emit one JE line per rate.  Sufficient for current standard-rate UAE VAT; revisit when multi-rate invoices are confirmed in scope.

---

### T-100.3 | Item sales finance extension (backend, Wave 3 Phase 1) ✅ Done
- **Category:** Backend · **Priority:** P1
- **Assigned:** backend-dev-expert · **Started:** 2026-05-29 · **Done:** 2026-05-29
- **Depends on:** T-100.2 ✅
- **Blocks:** T-100.7 (AR Invoice JE handler needs revenueAccountId + salesTaxCode per item), T-100.6 (Delivery JE needs cogsAccountId per item)
- **Decision:** Option B (parallel `sale_item_finance_ext` table). `purchase_item_finance_ext` already has a `cogsAccountId` used by the live `_handle_purchase_received` handler; keeping them separate eliminates semantic conflict and zero migration risk to existing code.
- **Description:** Per-item sales-side finance extension. Provides `revenueAccountId`, `cogsAccountId`, and `salesTaxCode` needed by the AR Invoice JE (DR AR / CR Revenue) and Delivery JE (DR COGS / CR Inventory). Includes type guards, audit logging, and `isSellable` filter flag.
- **Files created / modified:**
  - `services/finance/alembic/versions/016_sale_item_finance_ext.py` — NEW migration (new table)
  - `services/finance/src/finance/models/orm/models.py` — NEW class `SaleItemFinanceExt`
  - `services/finance/src/finance/models/schemas/master_data.py` — NEW schemas `SaleItemFinanceExtCreate`, `SaleItemFinanceExtUpdate`, `SaleItemFinanceExtResponse`
  - `services/finance/src/finance/api/v1/item_ext.py` — NEW router with 5 endpoints
  - `services/finance/src/finance/main.py` — registered `item_ext.router`
  - `services/finance/tests/test_item_finance_ext.py` — NEW 16 tests (all pass)
  - `services/finance/tests/conftest.py` — added `SaleItemFinanceExt` import so test session creates the table
- **Endpoints:**
  - `GET    /api/v1/finance/item-finance-ext` — list paginated, org-scoped, optional `isSellable` filter
  - `GET    /api/v1/finance/item-finance-ext/{item_id}` — get by itemId
  - `POST   /api/v1/finance/item-finance-ext` — create (type guards on revenueAccountId + cogsAccountId)
  - `PATCH  /api/v1/finance/item-finance-ext/{item_id}` — update (same guards; no-op skips audit)
  - `DELETE /api/v1/finance/item-finance-ext/{item_id}` — delete + audit row
- **Type guards:**
  - `revenueAccountId` — drawer=REVENUE, accountType=revenue, isHeader=false, isActive=true (HTTP 422)
  - `cogsAccountId` — drawer=COST_OF_SALES, accountType=expense, isHeader=false, isActive=true (HTTP 422)
  - Balance-change guard: NOT implemented (revenue/COGS accounts are posting targets, not running balances; a change affects only future postings, no orphan-balance risk)
- **Test results:** 16 new tests, all pass. Full suite: 322 passed, 1 skipped (baseline was 306+1).

---

### T-100.2.1 | Seed AR control account in default CoA ✅ Done
- **Category:** Backend · **Priority:** P1
- **Assigned:** backend-dev-expert · **Started:** 2026-05-29 · **Done:** 2026-05-29
- **Depends on:** T-100.2 ✅
- **Blocks:** T-100.7 (AR Invoice JE handler — needs a seeded AR control account for the default CoA so the handler can resolve it at posting time)
- **Outcome:** 124000/124000-001 were already present in default_coa.py and already marked in CONTROL_ACCOUNT_NUMBERS. No seed edit required.
- **Delivered:**
  - `services/finance/alembic/versions/017_seed_ar_control_account.py` — idempotent backfill migration for any org missing these rows.
  - `services/finance/tests/test_ar_control_account_seed.py` — 8 tests (6 shape + 2 DB-level), all pass.
  - `Docs/4-Finance-Mod-docs/Document-Conventions.md` — "Standard Control Accounts" section added; AR resolution priority chain documented.
- **Test result:** 330 passed, 1 skipped (was 322+1).

---

### T-054 | Document attachment infrastructure — backend (PR, PO, GR, AP Invoice, Payment)
- **Category:** Backend · **Priority:** P1
- **Assigned:** backend-dev-expert · **Started:** 2026-05-21
- **Depends on:** T-053 ✅ (frontend AttachmentList component)
- **Blocks:** —
- **Description:** Reusable attachment backend for the five P2P doc types. Storage
  abstraction (LocalStorageBackend), Mongo collection `document_attachments`,
  endpoints at `/api/v1/attachments/{doc_type}/{doc_id}` and `/api/v1/attachments/file/{file_id}`.
  Mime whitelist: PDF + JPEG + PNG + WebP. 10 MB cap. Soft delete. Read-only after
  approval except PAYMENT type. Range request support for PDF streaming.
- **Steps:**
  1. Create `src/modules/attachments/` module skeleton with __init__.py files ✅
  2. `storage/base.py` — abstract StorageBackend interface ✅
  3. `storage/local.py` — LocalStorageBackend (pathlib) ✅
  4. `models/attachment.py` — AttachmentMetadata Pydantic schema ✅
  5. `services/attachment_service.py` — full business logic ✅
  6. `api/v1/attachments.py` — 5 endpoints ✅
  7. `utils/range_parser.py` — HTTP Range header parser (extracted for testability) ✅
  8. `src/config/settings.py` — ATTACHMENT_STORAGE_ROOT ✅
  9. `src/api/routes.py` — register router at /api/v1/attachments ✅
  10. `docker-compose.yml` — bind mount ./data/attachments:/app/data/attachments ✅
  11. `tests/unit/test_attachments/` — 27 tests (all pass) ✅

---

### T-052 | Phase E frontend — AP Aging + Vendor Sub-Ledger report pages
- **Category:** Frontend · **Priority:** P1
- **Assigned:** frontend-dev-expert · **Started:** 2026-05-21
- **Depends on:** T-051 ✅ (finance reports backend endpoints — complete)
- **Blocks:** —
- **Description:** Build two finance report pages: APAgingPage (/finance/ap-aging) and
  VendorSubLedgerPage (/finance/vendor-sub-ledger). AP Aging uses frontend orchestration:
  fetch Approved AP invoices, call totals-paid endpoint, compute outstanding, POST to
  finance aging endpoint. Vendor Sub-Ledger is a GET report cross-referenced with the
  operation vendor list for vendorCode + vendorName. Both pages have role gate, loading,
  error, empty states. Sidebar entries added after Vendor Payments, before Fiscal Periods.
  New financeReportsService.ts and useFinanceReports.ts.
- **Steps:**
  1. financeReportsService.ts — getApDocTotalsPaid, getApAging, getVendorSubLedger ✅
  2. useFinanceReports.ts — useApAging mutation, useVendorSubLedger query ✅
  3. Export from hooks/queries/index.ts ✅
  4. APAgingPage.tsx — toolbar + orchestration + bucket cards + by-vendor table ✅
  5. VendorSubLedgerPage.tsx — toolbar + total card + table + View Entries link ✅
  6. App.tsx — lazy imports + routes ✅
  7. MainLayout.tsx — sidebar entries ✅
  > Context: All files created 2026-05-21. Pages show graceful API errors until T-051 ships.

---

### T-049 | Phase D frontend — Vendor Payment UI (payments list, detail, form)
- **Category:** Frontend · **Priority:** P0
- **Assigned:** frontend-dev-expert · **Started:** 2026-05-20
- **Depends on:** T-048 🔵 (backend AP payments endpoints, landing in parallel)
- **Blocks:** —
- **Description:** Build vendor payment pages: PaymentsPage (list + toolbar + New Payment button),
  PaymentDetailPage (header + applied invoices + JE summary + Reverse affordance), and
  RecordPaymentPage (single-form with invoice checkbox-table). Service layer
  paymentsService.ts + usePayments.ts hooks. Sidebar entry after Trial Balance / before P&L.
  Role gating: view for accountant/finance_admin/auditor/admin/super_admin; create for
  finance_admin/admin/super_admin. AP aging deferred (backend not yet shipping).
- **Steps:**
  1. paymentsService.ts — typed API (listPayments, getPayment, createPayment)
  2. usePayments.ts — TanStack Query hooks
  3. Export from hooks/queries/index.ts
  4. PaymentsPage.tsx — list + toolbar + method pill + New Payment → RecordPaymentPage
  5. PaymentDetailPage.tsx — header + applied invoices table + JE inline summary + Reverse link
  6. RecordPaymentPage.tsx — single-form: vendor, date, bank acct, method, invoice table, notes
  7. App.tsx — lazy imports + routes (/finance/payments, /finance/payments/new, /finance/payments/:id)
  8. MainLayout.tsx — sidebar entry 💸 after Trial Balance, before P&L Statement

---

### T-049 | Phase D frontend — Vendor Payment UI (payments list, detail, form)
- **Category:** Frontend · **Priority:** P0
- **Status:** 🟢 Ready (backend T-048 complete)
- **Depends on:** T-048 ✅ (backend AP payments endpoints)
- **Blocks:** —
- **Description:** Build vendor payment pages: PaymentsPage (list + toolbar + New Payment button),
  PaymentDetailPage (header + applied invoices + JE summary + Reverse affordance), and
  RecordPaymentPage (single-form with invoice checkbox-table). Service layer
  paymentsService.ts + usePayments.ts hooks. Sidebar entry after Trial Balance / before P&L.
  Role gating: view for accountant/finance_admin/auditor/admin/super_admin; create for
  finance_admin/admin/super_admin. AP aging deferred (backend not yet shipping).
- **Steps:**
  1. paymentsService.ts — typed API (listPayments, getPayment, createPayment, getApDocTotalsPaid)
  2. usePayments.ts — TanStack Query hooks
  3. Export from hooks/queries/index.ts
  4. PaymentsPage.tsx — list + toolbar + method pill + New Payment → RecordPaymentPage
  5. PaymentDetailPage.tsx — header + applied invoices table + JE inline summary + Reverse link
  6. RecordPaymentPage.tsx — single-form: vendor, date, bank acct, method, invoice table, notes
  7. App.tsx — lazy imports + routes (/finance/payments, /finance/payments/new, /finance/payments/:id)
  8. MainLayout.tsx — sidebar entry after Trial Balance

---

### T-044 | Phase C frontend — AP Invoice pages + variance display
- **Category:** Frontend · **Priority:** P0
- **Assigned:** frontend-dev-expert · **Started:** 2026-05-20
- **Depends on:** T-043 (Phase C.1 AP Invoice backend, landing in parallel)
- **Blocks:** —
- **Description:** Build AP Invoice list, detail, and form pages. Service layer
  (apInvoicesService.ts), TanStack Query hooks (useAPInvoices.ts), sidebar entry,
  lazy routes in App.tsx. Variance display: per-line amber row highlight + red/green
  amounts, total variance in header with tooltip. "View Journal Entry →" banner on
  Approved docs. Extend ApprovalInboxPage to handle AP_INVOICE docType.
- **Steps:**
  1. apInvoicesService.ts — typed API, full CRUD + state transitions
  2. useAPInvoices.ts — TanStack Query hooks
  3. Export from hooks/queries/index.ts
  4. APInvoicesPage.tsx — list with variance column
  5. APInvoiceDetailPage.tsx — header + lines + totals + banners + actions
  6. APInvoiceFormPage.tsx — GR picker + from-GR form + edit mode
  7. App.tsx — lazy imports + routes
  8. MainLayout.tsx — sidebar entry between Goods Receipts and Approval Inbox
  9. ApprovalInboxPage.tsx — extend DocType to include AP_INVOICE

---

### T-038 | Phase B frontend — Goods Receipts UI + Journal Entries list
- **Category:** Frontend · **Priority:** P0
- **Assigned:** frontend-dev-expert · **Started:** 2026-05-20
- **Depends on:** T-037 (backend GR module, landing in parallel)
- **Blocks:** —
- **Description:** Build GoodsReceiptsPage, GoodsReceiptDetailPage, GoodsReceiptFormPage
  (purchasing side) and JournalEntriesPage with inline row-expand (finance side). Service
  layer, TanStack Query hooks, sidebar entries, lazy routes in App.tsx.
- **Steps:**
  1. goodsReceiptsService.ts — typed API calls mirroring purchasingApi.ts
  2. journalEntriesService.ts — JE list + detail with correct envelope unwrap
  3. useGoodsReceipts.ts + useJournalEntries.ts hooks
  4. Export from hooks/queries/index.ts
  5. GoodsReceiptsPage.tsx, GoodsReceiptDetailPage.tsx, GoodsReceiptFormPage.tsx
  6. JournalEntriesPage.tsx with inline row-expand
  7. App.tsx — lazy imports + routes
  8. MainLayout.tsx — sidebar entries

---

### T-001 | Supabase 2026-04-07 reimport — User runs stages
- **Category:** Database · **Priority:** P0
- **Assigned:** backend-dev-expert · **Started:** 2026-04-07
- **Depends on:** —
- **Blocks:** —
- **Description:** Scripts built and dry-run verified. Blocked on user running stage-by-stage
  with UI verification between stages. One crop blocker: `Lettuce - Phase 1 (5cm)` not in
  plant_data_enhanced — user must add it (or decide to skip) before stage 3 will succeed.
- **Steps:**
  1. User resolves `Lettuce - Phase 1 (5cm)` crop (add to plant_data_enhanced or skip)
  2. User runs `stage2_farms_blocks.py` → verifies farms in UI
  3. User runs `stage3_cycles_harvests.py` → verifies block states, archives, harvests in UI
  4. User runs `stage4_clients_vehicles_orders.py` → verifies CRM/Sales in UI
  5. User runs `stage5_sales_excel.py` → verifies payment enrichment on order lines
  6. User runs `stage6_purchase_register.py` → verify via mongosh count
  7. User runs `stage7_finalize.py` → verify farm assignments, financial_summary
  8. Regenerate CodeMaps (new collections: sales_order_lines, sales_unmatched, purchase_register, financial_summary)
  9. Move task to ARCHIVE.md

---

### T-008 | Replace four Gemini AI agents with one Claude assistant
- **Category:** Backend + Frontend · **Priority:** P1
- **Assigned:** backend-dev-expert · **Started:** 2026-05-19
- **Depends on:** —
- **Blocks:** —
- **Description:** Collapse the current Gemini-based AI surface (4 services: `farm_ai`,
  `farm_level_ai`, `global_ai`, `ai_hub` + voice endpoints + 2 frontends: `AIHub`,
  `AIAnalyticsChat`) into one Claude Sonnet 4.6 assistant. Single chat surface — slide-out side
  panel available on every page. Read-only (write/control actions stay in SenseHub). Open to all
  authenticated users. Last 3 conversations persisted per user.
- **Decisions locked (user, 2026-05-19):**
  1. No write actions — SenseHub owns relay/automation control
  2. Drop voice (transcribe + TTS) — feature creep
  3. Keep cost tracking + 30-min query cache as middleware around Claude tool calls
  4. Fresh module, retire all four Gemini agents
  5. Frontend: slide-out side panel (not full-screen tab) — available everywhere
  6. Permissions: all authenticated users (read-only is safe)
  7. History: last 3 conversations per user, older auto-evicted
- **Phases:**
  - **A. Backend foundation** — Anthropic SDK + `ANTHROPIC_API_KEY` setting + module skeleton at
    `src/modules/ai_assistant/` + Claude service wrapper (Sonnet 4.6, prompt caching on system
    prompt + tool defs) + cost tracking in `ai_assistant_cost_log`
  - **B. Tools** — `query_mongodb` (lift `ai_analytics.QueryValidator` + 30-min cache) +
    SenseHub MCP read tools (lift from `farm_ai/tool_definitions.py`; strip relay/manage)
  - **C. Context + API** — single context composer (merges what the four context_builders did,
    keyed off `farm_id`/`block_id` from request) + `POST /api/v1/ai/chat` (streaming) +
    conversation persistence in `ai_assistant_conversations` (last 3 per user)
  - **D. Frontend** — slide-out chat panel, replaces `AIHub` + `AIAnalyticsChat`. Available on
    every page; pulls current farm/block selection automatically
  - **E. Retire** — delete `farm_ai`, `farm_level_ai`, `global_ai`, `ai_hub`, voice routes,
    `AIHub`, `AIAnalyticsChat`, related Gemini config. Migrate any chat history we want to keep.
  - **F. Tests** — backend + integration tests; Playwright e2e of the slide-out
  - **G. Change Guardian** — MINOR bump (current v1.14.x → v1.15.0), CHANGELOG, commit
- **Context notes:**
  - Use `claude-sonnet-4-6` model per Jan 2026 cutoff in CLAUDE.md
  - Bake prompt caching (`cache_control: {type: "ephemeral"}`) on system + tool defs for
    cost savings — every turn after the first reads cache at ~10% of full input price
  - Use `messages.stream` for responsive UX
  - `ai_analytics` module's `QueryValidator` is the gold guardrail — preserve it intact when
    lifting into the new module
  - Old Gemini code stays running until Phase E retirement — no behavioral gap during cutover
  - **Phases A+B+C completed 2026-04-20 (backend-dev-expert):**
    - `src/config/settings.py` — added `ANTHROPIC_API_KEY`, `CLAUDE_MODEL`, `AI_ASSISTANT_MAX_TOKENS`,
      `AI_ASSISTANT_MAX_TURNS`, `AI_ASSISTANT_HISTORY_LIMIT`
    - `src/modules/ai_assistant/` — full module skeleton: models, services, API
    - `src/modules/ai_assistant/services/claude_service.py` — AsyncAnthropic streaming wrapper,
      prompt caching (system + tool defs), bounded tool-use loop (max 8 turns), cost tracking
    - `src/modules/ai_assistant/services/tool_definitions.py` — 7 read-only tools:
      `query_mongodb`, `get_equipment_list`, `get_sensor_readings`, `get_alerts`,
      `get_automations`, `get_lab_readings`, `get_lab_latest`
    - `src/modules/ai_assistant/services/tool_executor.py` — async dispatcher, delegates
      `query_mongodb` to existing `ai_analytics.QueryEngine`; SenseHub tools via
      `SenseHubConnectionService.get_client(farm_id, block_id)` with cache fallback
    - `src/modules/ai_assistant/services/context_composer.py` — merges four existing
      context builders keyed off ChatScope (BLOCK/FARM/GLOBAL)
    - `src/modules/ai_assistant/services/conversation_repository.py` — last-3-per-user
      eviction, cross-user isolation enforced at all query points
    - `src/modules/ai_assistant/services/cost_tracker.py` — writes to `ai_assistant_cost_log`
    - `src/modules/ai_assistant/api/v1/assistant.py` — 3 endpoints:
      `POST /api/v1/ai/assistant/chat` (SSE streaming),
      `GET /api/v1/ai/assistant/conversations`,
      `DELETE /api/v1/ai/assistant/conversations/{id}`
    - `src/api/routes.py` — router wired at `/api/v1/ai/assistant/*`
    - `tests/unit/test_ai_assistant/` — 4 test files (cost_tracker, context_composer,
      tool_executor, conversation_repository, claude_service)
    - `tests/integration/test_ai_assistant.py` — 8 integration test scenarios
  - **Requires Docker hot-reload (no rebuild needed)** — code changes are live via volume mount
  - **New env var required:** `ANTHROPIC_API_KEY` must be set in `.env` / Docker environment
  - **New MongoDB collections created at runtime:**
    - `ai_assistant_conversations` — conversation + message history
    - `ai_assistant_cost_log` — per-call cost/token tracking
  - **Phase D completed 2026-05-19 (frontend-dev-expert):**
    - **New files added:**
      - `frontend/user-portal/src/stores/aiAssistant.store.ts` — Zustand store: panel open/close,
        message list, streaming state, conversation list, draft input. No persistence (intentional —
        state resets on page reload per spec).
      - `frontend/user-portal/src/services/aiAssistantApi.ts` — SSE streaming via fetch+ReadableStream
        (not axios); REST conversation list/delete via existing apiClient. Auth header injected from
        localStorage (same source as api.ts interceptor).
      - `frontend/user-portal/src/hooks/queries/useAIAssistant.ts` — central hook: wires store +
        SSE + TanStack Query (conversations list query + delete mutation). Context auto-derived from
        sessionStorage keys `selectedFarmId` / `selectedBlockId` (global scope fallback when absent).
      - `frontend/user-portal/src/components/ai-assistant/AIAssistantFAB.tsx` — fixed FAB,
        bottom-right, z-index 895, visible to all authenticated users, pulse animation when closed.
      - `frontend/user-portal/src/components/ai-assistant/AIAssistantPanel.tsx` — 420px slide-out
        drawer, right-anchored, full-height, 200ms ease-out transform transition. Backdrop is purely
        decorative (pointer-events: none always) so sidebar/page remains fully clickable.
        Closes via X button or Escape key.
      - `frontend/user-portal/src/components/ai-assistant/ConversationList.tsx` — last-3 selector
        with delete button, new conversation button, relative timestamps.
      - `frontend/user-portal/src/components/ai-assistant/MessageList.tsx` — auto-scroll on chunk
        append; empty state with 4 quick-suggestion chips.
      - `frontend/user-portal/src/components/ai-assistant/MessageBubble.tsx` — memoized; user
        (right, primary blue) vs assistant (left, neutral) bubbles; inline markdown renderer (bold,
        italic, code, pre, lists); cost indicator ($0.000x); typing indicator; tool call cards.
      - `frontend/user-portal/src/components/ai-assistant/ToolCallCard.tsx` — inline pending/done
        cards for each tool call (spinner → checkmark + summary).
      - `frontend/user-portal/src/components/ai-assistant/InputBox.tsx` — textarea (Enter=send,
        Shift+Enter=newline), char counter at 7000+, cancel button during streaming.
      - `frontend/user-portal/src/components/ai-assistant/index.ts` — barrel exports.
    - **Modified files:**
      - `frontend/user-portal/src/components/layout/MainLayout.tsx` — added `<AIAssistantFAB />`
        and `<AIAssistantPanel />` mounts at bottom of LayoutContainer.
    - **FAB position:** `bottom: 88px; right: 28px` (sits above back-to-top button). On mobile:
      `bottom: 24px; right: 16px`.
    - **Surprising findings:**
      - `BotMessageSquare` icon does not exist in lucide-react 0.309.0 — replaced with `Bot`.
      - The backend `/api/v1/ai/assistant/conversations` returns 404 in dev — nginx proxies to the
        correct backend but the backend module may not be registered in dev docker yet. Frontend
        handles it gracefully (empty conversation list, error surfaced in bubble).
      - `ANTHROPIC_API_KEY` not set in dev env yet — confirmed by 404/500 on chat endpoint. UI
        flow is visually complete through message send; backend error is correctly surfaced inline.
    - **Hot-reload status:** Vite picks up all new component files automatically — no restart needed.
      However, HMR may show stale-module errors for `BotMessageSquare` until a hard page reload
      clears the Vite module cache. Hard reload resolves to zero JS errors.
  - **Next phase:** Phase E (Retire Gemini agents: farm_ai, farm_level_ai, global_ai, ai_hub,
    voice routes, AIHub, AIAnalyticsChat, related Gemini config)

---

### T-051 | UAE VAT compliance — tax-point rule + reverse-charge mechanism
- **Category:** Backend · **Priority:** P0
- **Assigned:** backend-dev-expert · **Started:** 2026-05-21
- **Depends on:** —
- **Blocks:** —
- **Description:** PM feedback items 2 and 3.
  Item 2: UAE Article 25 tax-point rule — add `dateOfSupply` to
  `ApInvoicePostedPayload`, populate from GR `docDate` in
  `build_ap_invoice_event_payload`, compute `tax_point_date =
  min(dateOfSupply, invoiceDate)` in handler, stamp on VAT line description.
  Item 3: Reverse-charge VAT — migration 012 adds `isReverseCharge` to
  `tax_codes`, ORM + schema updated, handler posts both DR Input VAT and
  CR Output VAT for SR lines, AP credit = lineNet only for SR lines.
- **Steps:**
  1. Claim task (done)
  2. Migration 012_tax_codes_reverse_charge.py
  3. ORM model: add isReverseCharge to TaxCode
  4. Pydantic schemas: add isReverseCharge to TaxCodeCreate/Update/Response
  5. Seed: set isReverseCharge=True on SR in seed_tax_codes
  6. Contract: add dateOfSupply to ApInvoicePostedPayload
  7. document_service.py: populate dateOfSupply in build_ap_invoice_event_payload
  8. Finance handler: tax-point logic + reverse-charge JE logic
  9. Tests

## 🟢 Ready


### T-203 | CRM Customer detail — AR visibility (outstanding balance, open invoices, payment history, aging)
- **Category:** Frontend + Backend (read-only aggregation endpoints) · **Priority:** P2
- **Assigned:** — · **Started:** —
- **Discovered:** During T-201.10 verification (Customer Receipt cycle), 2026-06-04. Viet Anh asked where to verify the customer's outstanding AR after a receipt posted. Walked through `CRM → Customers → {customer}`; the page only shows Contact Information / Address / Tags / Notes. No financial context anywhere.
- **Description:** The CRM CustomerDetailPage is a pure contact-management surface today. For a sales-module app, this is a real UX gap — accountants and salespeople routinely want to see, from a customer's page:
  1. **Outstanding AR balance** — sum of open AR Invoices (`status IN (open, partly_closed)`) minus allocated receipts. The number that matters for "should we ship more to them?"
  2. **Open invoices list** — recent unpaid ARIs (docNumber, docDate, dueDate, gross, openAmount, days overdue), clickable to ARI detail.
  3. **Payment history** — recent Customer Receipts allocated to this customer (docNumber, date, amount, payment method).
  4. **Aging breakdown** — Current / 1-30 / 31-60 / 61-90 / 90+ buckets, dollar amounts. Mirror the report shape from `Sales → Reports → AR Aging` but scoped to one customer.
  5. **Credit limit** — pulled from `customer_finance_ext.creditLimit` (already exists per T-100.9b); show next to outstanding balance with a colour indicator (green if balance ≤ 70% of limit, amber 70-100%, red over limit).
  6. **Recent SO + Quote activity** (optional, lower priority) — last 5 SOs and Quotes for quick context.
- **Backend touchpoints:**
  - Likely needs a new aggregation endpoint `GET /api/v1/sales/customers/{customerId}/ar-summary` returning outstanding balance, aging buckets, recent invoices, recent receipts in a single call. Reduces N+1 query risk on the frontend.
  - Reuses existing AR Invoice + Customer Receipt query patterns. Mostly read-only.
  - Standalone-mode consideration: if finance is disabled, the aging + credit-limit columns should hide gracefully (same approach as T-201.0 / T-201.1).
- **Frontend touchpoints:**
  - Add new sections to `CustomerDetailPage.tsx` (between existing Contact Info and Address):
    - "Account Summary" card — outstanding balance + credit limit + age bucket headline
    - "Open Invoices" table
    - "Recent Payments" table
    - "Aging" mini-chart or table
  - Reuse styled-components from existing `SectionTitle` + `Section` patterns in the page. Don't introduce a new design language.
- **Notes:**
  - Filed 2026-06-04 during T-201.10 verification. Discovered the gap when I (Claude) hallucinated that the page already had this info — it didn't.
  - This is a sales/CRM convergence concern. Could naturally land alongside T-201.11 (Quick Service Charge shortcut, also on CustomerDetailPage) — they'd share the "we're already touching the customer detail page" cost. But priorities differ: T-201.11 is P2 polish for ad-hoc service invoicing; T-203 is P2 because the underlying data is verifiable through other reports today, just inconveniently.
  - **Honest scope estimate:** ~2-3 task cycles (1 backend aggregation endpoint, 1 frontend page expansion, 1 test pass for the endpoint).




### T-204 | Direct-create AR Credit Note: required "Reason" field for audit-trail clarity
- **Category:** Backend + Frontend · **Priority:** P2
- **Assigned:** — · **Started:** —
- **Discovered:** During T-201.11 verification, 2026-06-04. Viet Anh observed that the direct-create AR Credit Note flow (`/sales/ar-credit-notes/new`) lets the user post a credit note without referencing a source ARI or RTN — and asked "should this even be allowed?".
- **Background:** Direct-create ARC exists today for legitimate use cases that don't map to a single source invoice:
  - **Goodwill credit** — customer relationship gesture
  - **Multi-invoice correction** — single credit spread across many historical invoices
  - **Promotional credit** — future-order vouchers
  - **Bad-debt write-off** — stale receivables crossing many old invoices
  - **Other** — escape hatch for the long tail
  T-201.8 already restricts direct-create ARC to service items only (same isStock gate as direct ARI), so stock-item credits must go via Return Note → from-RTN ARC. But the orphan-credit (no source) audit trail concern remains: today there is no recorded reason for the lack of source doc.
- **Decision (2026-06-04, Viet Anh):** keep the flexibility — direct-create is industry-standard (SAP B1, NetSuite, Oracle) — but require a `direct_credit_reason` field at the schema level so the audit log captures *why* the credit has no source.
- **Description:**
  - Add `direct_credit_reason: Optional[DirectCreditReason]` to AR Credit Note model + Pydantic Create/Update schemas.
  - New enum `DirectCreditReason`: GOODWILL | MULTI_INVOICE_CORRECTION | PROMOTIONAL | BAD_DEBT_WRITE_OFF | OTHER
  - When `OTHER`, surface optional `direct_credit_reason_notes: str` for free-text context.
  - Backend validation: `direct_credit_reason` is REQUIRED on create + update when both `baseInvoiceDocRef` and `baseReturnDocRef` are absent; PROHIBITED otherwise (mutually exclusive with chained-create paths). Returns 422 with clear error if the rule is violated.
  - Audit log: include `direct_credit_reason` in the `create_ar_credit_note` audit row and any `transition_status` audit row that touches it.
  - Frontend `ArCreditNoteFormPage` direct-create mode:
    - Add a "Reason for direct credit" dropdown above the lines table, alongside the existing T-201.8 banner.
    - Conditional notes textarea when reason === OTHER.
    - Form hides the field entirely in from-invoice / from-RTN / edit modes.
- **Acceptance criteria:**
  - Direct-create ARC without reason → 422 with descriptive error.
  - Direct-create ARC with each reason value → success.
  - From-invoice and from-RTN ARC continue to work without sending the reason field.
  - Audit log on every direct ARC includes the reason.
  - `OTHER` requires non-empty `direct_credit_reason_notes`.
- **Honest scope estimate:** ~1 task cycle (1 backend schema/validation/audit change + 1 frontend form field + tests). Smaller than typical because backend gating logic mirrors T-201.8's existing direct-vs-chained discriminator.
- **Notes:**
  - Filed during the same session that shipped T-201.8 + T-201.9 + T-201.10 + T-201.11. The direct-create reason field is a natural completion of T-201.8's "direct-create gating" theme — T-201.8 gated by item type, T-204 augments with intent capture.
  - Frontend mirroring opportunity: when this lands, consider whether the same reason-capture pattern should apply to direct-create Return Requests (T-201.8's known dead-code path) or direct-create AR Invoices (rare in practice). Out of scope for T-204; capture in a future ticket if the pattern proves useful.


### T-200 | Wave 4 — Purchasing parity upgrade (SAP B1-style document depth)
- **Category:** Backend + Frontend · **Priority:** P1
- **Depends on:** T-100 🔵 (Wave 3 shared infrastructure must be complete)
- **Blocks:** —
- **Description:** Retrofit the existing purchasing module (PR → PO → GR → AP Invoice →
  Payment) to use the shared document infrastructure from T-100.  Adds open-quantity
  tracking per PO line (currently stored but not enforced via the shared helper),
  base/target link back-pointers, BP reference number mixin, journal memo composition,
  and the DocumentStatus enum.  Also adds any SAP B1 parity gaps identified during
  Wave 3 (e.g. Down Payment Invoice, AP Credit Note, Blanket Agreement stubs).
  ~4-6 weeks total effort.
- **Numbering note (2026-06-04):** sub-tasks start at T-200.21, NOT T-200.1, because
  T-200.0 through T-200.11 are all archived completed sales-UI work (see ARCHIVE.md —
  T-200.0 Sales UI foundation, T-200.1 Customer Receipt UI, etc.). Reusing those IDs
  for purchasing would create permanent confusion. The "20s" prefix flags that these
  belong to Wave 4 purchasing, mirroring how Wave 3 sales used .0-.11.
- **Sub-tasks (outline — sequenced; each becomes its own ticket as it's claimed):**
  - **T-200.21** — Foundation: replace ad-hoc status strings with `DocumentStatus`
    enum + `assert_legal_transition` validation across all purchasing services.
    Behavior-preserving. ~2-3 task cycles.
  - **T-200.22** — Counter rollup: apply `doc_chain_reconciler` (extracted in
    T-201.9.0) to the PO → GR → AP chain. PO-line open-qty tracking, auto-close
    on full GR, auto-reopen on GR delete/cancel, $pull dangling refs. Mirrors
    T-201.5/.6/.7 done for DN. ~3-4 task cycles.
  - **T-200.23** — AP Credit Note: vendor-side counterpart to ARC. From-AP-Invoice
    and from-GR (return-of-goods) paths. ~2-3 task cycles.
  - **T-200.24** — Down Payment Invoice (DPI): SAP B1 vendor-prepayment doc.
    Allocates against future AP Invoices. ~2-3 task cycles. **🔵 Active — see standalone task below.**
  - **T-200.25** — Blanket Agreement (BLA) stubs: long-term volume/price
    commitments that PRs/POs reference. Skeleton only per the BACKLOG note.
    ~1-2 task cycles.
  - **T-200.26** — Purchasing V2 frontend pages: parity with the Wave 3 sales UI
    patterns (list+form+detail+from-X modes, T-201.x lock-set decisions,
    CompanyCombobox / SalesItemCombobox-equivalent purchasing pickers, etc.).
    Largest slice. ~6-10 task cycles.
- **Total realistic estimate:** ~16-25 task cycles across the sub-tasks.

---

### T-200.24 | 🔵 AP Down Payment Invoice (DPI) — vendor prepayment document
- **Category:** Backend · **Priority:** P1
- **Assigned:** backend-dev-expert · **Started:** 2026-06-10
- **Depends on:** T-200.21 ✅, T-200.22 ✅, T-200.23 ✅
- **Blocks:** T-200.26 (purchasing frontend)
- **Description:** New `AP_DPI` document type for SAP B1-style vendor prepayments.
  DPIs are standalone (not chained from PR/PO). AP Invoices can allocate one or
  more DPIs at creation time; consumption fires when the AP transitions to OPEN.
  DPIs auto-close when fully consumed, auto-reopen when an AP allocation is
  reversed. Emits `ap_down_payment_posted` outbox event.
- **Scope:**
  - `AP_DPI` added to `LEGAL_TRANSITIONS` in `document_status.py`
  - New Pydantic models in `models/document.py` (`APDownPaymentCreate`,
    `APDownPaymentResponse`, `APDownPaymentListItem`, `DPIAllocation`,
    `AppliedDPIAllocation`, etc.)
  - New service `services/ap_down_payment_service.py` with full CRUD +
    `transition_status`. Collection: `ap_down_payments_v2`.
  - Reconciler helpers in `purchasing_chain_reconciler.py`:
    `load_dpi_with_lines`, `reconcile_dpi_consumption`,
    `auto_close_dpi_if_fully_consumed`, `auto_reopen_dpi_if_not_fully_consumed`,
    `pull_dangling_dpi_allocation_refs`
  - AP Invoice allocation: pre-flight validation in `create_ap_from_gr`;
    consumption ($inc consumedAmount) in `approve_ap` / auto-approve path
  - New route handler `api/v1/ap_down_payments.py` registered in `__init__.py`
- **Acceptance criteria:**
  - DPI CRUD (create/list/get/update/delete) working
  - DPI status transitions: DRAFT → PENDING_APPROVAL → OPEN → PARTLY_CLOSED/CLOSED
  - AP Invoice creation with `dpi_allocations` validates DPI status, vendor, currency, amounts
  - AP Invoice approval consumes DPI outstanding balance; DPI auto-closes when fully consumed
  - `GET /ap-down-payments/outstanding` returns only DPIs with remaining balance
  - pytest baseline unchanged: 36 passed / 10 failed (purchasing), 334 passed (sales)
- **Status:** Implementation complete (backend only). Frontend deferred to T-200.26.
  No tests shipped (separate dispatch). No frontend changes.
- > Context (2026-06-10): All 6 implementation parts shipped. Symbol import check passes.
  > pytest baselines confirmed unchanged. `_header_to_ap_response` updated with
  > `dpiAllocations` mapping. Pending: user verification on live stack before archiving.

---

_T-059 (Wave 0) — see Active for context._
_T-060 (Wave 2) — design approved 2026-05-24, ready to claim._
_T-061, T-062, T-063 — completed 2026-05-24, moved to ARCHIVE.md._
_T-065 – T-068 — out-of-scope spin-offs from T-061.1 (Manual JE frontend),
captured 2026-05-29 so they can be revisited when prioritisation revisits
finance UX maturity. None are urgent today; each waits on user need._


### T-065 | Manual JE — Templates / recurring entries
- **Category:** Backend + Frontend · **Priority:** P2
- **Assigned:** unclaimed · **Depends on:** T-061 ✅ (backend), T-061.1 (frontend, in progress) · **Blocks:** —
- > Context (2026-05-29): Spun off from T-061.1 scope discussion. Once finance
  > admins can post manual JEs through the UI, the next pain point is the
  > monthly close. Every month requires roughly the same JE set: depreciation
  > on PP&E, amortisation of prepaid expenses, accruals for unbilled revenue
  > and unbilled expenses, etc. Re-entering these by hand each month is both
  > tedious and error-prone (typos, account mis-selections).
- **Goal:** Add a "JE Template" entity that captures a structured manual-JE
  shape (description, line accounts, line cost-centres, optional amount
  formulas — e.g. "1/12 of fixed-asset cost"). User saves an existing manual
  JE as a template, then on subsequent runs they pick the template + a
  posting date + (optional) amount overrides → form pre-fills → submit.
- **Scope highlights:**
  - Backend: new `je_templates` table; CRUD endpoints; "apply template" mutation
    that constructs the JE payload server-side
  - Frontend: "Save as Template" button on the manual JE form (post-submit);
    "Apply Template" picker on form open; template list+manage page
  - Amount formulas (v1): only literal amounts. Formulas like "1/12 of
    fixed-asset balance as of last close" are v2.
  - Recurring auto-post (cron-style "post on the 1st of every month"): v2.
    Keep v1 manual-trigger only.
- **Acceptance criteria:** can save a JE as template; can apply template +
  date to construct a new JE without re-entering accounts/lines; templates
  scoped per company; audit_log captures both template creation and each
  application.
- **Estimated effort:** ~3–4 days (1.5 backend, 2 frontend, .5 tests)
- **When to prioritise:** as soon as a finance admin posts the same JE
  shape twice (typically month 2 of monthly-close discipline).

---

### T-066 | Manual JE — Bulk import from spreadsheet
- **Category:** Backend + Frontend · **Priority:** P2
- **Assigned:** unclaimed · **Depends on:** T-061 ✅ (backend), T-061.1 (frontend) · **Blocks:** —
- > Context (2026-05-29): Spun off from T-061.1. The biggest one-shot use
  > of manual JEs is migrating opening balances from a previous accounting
  > system. A typical migration JE has 50–500 lines (one per account that
  > had a balance on cutover date). Entering this through the form is
  > impractical. Equally relevant: external accountants often deliver
  > adjusting-JE worksheets in Excel during audit prep — uploading them
  > directly avoids transcription errors.
- **Goal:** Accept a CSV/XLSX file describing JE header(s) + lines and post
  them atomically (or atomically per JE if multiple).
- **Scope highlights:**
  - Backend: new `POST /api/v1/finance/journal-entries/bulk` accepting
    multipart/form-data; parses CSV/XLSX via openpyxl (already a dep);
    validates structure → constructs JE batch → posts all-or-nothing per JE
  - Frontend: upload page with CSV/XLSX template download, file picker,
    pre-post validation summary (X JEs parsed, Y errors), Submit
  - Template spec: header row with mandatory columns (jeNumber-grouping
    key, jeDate, description, reason) + line columns (accountNumber, debit,
    credit, costCenter, description); JEs grouped by the grouping key
  - Errors: invalid account number, unbalanced JE, account is header, closed
    period — all surfaced as a downloadable error report tied to the
    source rows
- **Acceptance criteria:** can upload a 100-line opening-balance JE and
  see it posted as one transaction; can upload a multi-JE file and see N
  transactions posted; invalid rows surface error report with row numbers;
  audit_log records the original filename + actor + payload hash.
- **Estimated effort:** ~4–5 days (2.5 backend, 2 frontend, .5 tests)
- **When to prioritise:** before the first real-tenant onboarding that
  needs opening balances OR before the first external-auditor adjusting-JE
  workflow.

---

### T-067 | Manual JE — Approval workflow for high-value entries
- **Category:** Backend + Frontend · **Priority:** P2
- **Assigned:** unclaimed · **Depends on:** T-061 ✅, T-061.1, existing approval-rules engine
  · **Blocks:** —
- > Context (2026-05-29): Spun off from T-061.1. Standard SOX-style control:
  > a single finance admin can post small adjusting JEs unilaterally, but
  > anything over a configurable threshold (e.g. > 10,000 AED) must be
  > reviewed and approved by a second authorised user before it posts.
  > Today's manual JE endpoint posts immediately on submit — no review gate.
  > The existing approval-rules engine (used for PR/PO already) is the
  > natural home for the rule logic; this task wires manual JEs into it.
- **Goal:** Add an "approval required" state for manual JEs above a
  configurable rule threshold. JE is created with `status='draft_pending_approval'`
  and only flips to `status='posted'` once approved.
- **Scope highlights:**
  - Backend: extend `JEStatusEnum` with `draft_pending_approval` (requires an
    Alembic migration); manual JE endpoint consults approval-rules engine
    to decide whether to skip-or-gate; new `POST .../journal-entries/{id}/approve`
    and `.../reject` endpoints; email/notification on pending approval
  - Frontend: approval inbox section for finance admins; per-JE approve/reject
    modal with reason; pending JE shows distinct status badge throughout
    UI (JE list, drill-downs, etc.)
  - Rules: thresholds per company + per role (e.g. "manual JEs > 10K need
    second sign-off from finance_admin role"); reuse the existing rules
    table or add a manual-JE-specific rule type
- **Acceptance criteria:** posting a JE under threshold posts immediately
  (existing behaviour); posting over threshold creates draft, second user
  can approve via inbox, original creator cannot self-approve, rejection
  records reason in audit_log.
- **Estimated effort:** ~5–7 days (3 backend, 3 frontend, 1 tests)
- **When to prioritise:** before the first real audit, or when a finance
  admin first asks "can someone else review my correcting JEs before
  they post?"

---

### T-068 | Manual JE — Draft state (save and finish later)
- **Category:** Backend + Frontend · **Priority:** P3
- **Assigned:** unclaimed · **Depends on:** T-061 ✅, T-061.1 · **Blocks:** —
- > Context (2026-05-29): Spun off from T-061.1. Long multi-line JEs (e.g.
  > opening-balance entries with 50+ lines) take time to prepare. Today
  > there's no way to save a partial JE and come back — every form session
  > is either Submit (post immediately) or Cancel (lose work). T-066 bulk
  > import partially mitigates this for the long-line case, but in-form
  > drafts are a useful UX even for short JEs interrupted by a meeting.
- **Goal:** Add `status='draft'` for manual JEs. Save-as-draft button
  alongside Submit; draft JEs do NOT post to the GL but persist for the
  user to resume.
- **Scope highlights:**
  - Backend: add `draft` to `JEStatusEnum` (Alembic migration); manual JE
    endpoint accepts `?save_as_draft=true`; new `PATCH .../journal-entries/{id}/post`
    that promotes a draft to posted (re-validates everything fresh)
  - Frontend: Save-as-Draft button on form; draft JEs visible only to their
    creator in a "My Drafts" section of the JE list; clicking a draft opens
    the form pre-filled with its lines; auto-save every 30s (optional, v2)
  - Drafts skip ALL validations until Submit: unbalanced drafts allowed,
    closed-period date allowed, etc. Only the Post action enforces the
    full ruleset.
- **Acceptance criteria:** can save an unbalanced JE as draft and reload
  it days later; the draft does not appear in financial reports; promoting
  to posted runs full validation; only the original author can see / edit
  / promote their own drafts.
- **Estimated effort:** ~3–4 days (1.5 backend, 1.5 frontend, .5–1 tests)
- **When to prioritise:** P3 — useful but easy to work around via bulk
  import (T-066) or by keeping a draft in a text editor outside the app.
  Revisit only if specific user requests come in.

---

### T-059 | Wave 0 — Finance as opt-in add-on (architectural hygiene) — 🔵 Active
- **Category:** Backend + Frontend + DevOps + Docs · **Priority:** P0
- **Assigned:** Viet Anh (inline implementation) · **Started:** 2026-05-24
- **Depends on:** T-057-1a ✅ · **Blocks:** T-060+
  (every future finance wave)
- **Approver defaults (design doc §13):** super_admin only · accept any
  tax-code string · nginx 503 on finance-down · existing audit_log schema
- > Context (2026-05-24): All 7 sub-tasks implemented in one inline
  > session.
  > - T-059.1 ✅ /api/v1/system/capabilities + per-tenant flag +
  >   OutboxWriter gate + migration script
  > - T-059.2 ✅ /api/v1/system/health on finance + Redis-cached
  >   reachability check
  > - T-059.3 ✅ useCapabilities hook + FinanceGate (route gating) +
  >   sidebar gating + free-text fallback in PR/PO/GR/AP forms +
  >   FinanceUnreachableBanner
  > - T-059.4 ✅ PATCH /organizations/{id}/modules + ModulesSettingsCard
  >   (super_admin, audit-logged, confirmation modal that doesn't
  >   close on overlay click)
  > - T-059.5 ✅ nginx dev+prod confs return 503 JSON on finance
  >   unreachable (docker-compose.finance.yml already existed)
  > - T-059.6 ✅ ops-only-smoke workflow + scripts/ci/check_finance_imports.sh
  >   (lint passes locally)
  > - T-059.7 ✅ Docs/1-Main-Documentation/Deployment-Modes.md +
  >   CLAUDE.md modules section + DevLog
  > Pending: user verification (boot stack + Playwright smoke),
  > backend unit tests (deferred — testing-backend-specialist),
  > CodeMaps regeneration (4 new src/ modules + new endpoint).
  > See `Docs/3-DevLog/2026-05-24_wave0-finance-opt-in.md`.
- **Goal:** Establish operations-vs-finance boundary as a first-class
  deployment mode. Per-tenant `financeEnabled` flag + runtime capability
  check + structurally separable docker-compose. Without this, every
  subsequent finance wave will accrete coupling that has to be unwound.
- **Design doc:** `Docs/2-Working-Progress/Wave-0-Design.md` (approved
  2026-05-24)
- **Sub-tasks:**
  - T-059.1 Backend: `/api/v1/system/capabilities` endpoint, per-tenant
    `modules.financeEnabled` field on organizations, one-shot migration
    script (default true for existing orgs), outbox writer gate that skips
    event emission when tenant has `financeEnabled=false` (Redis-cached
    org lookup, 60s TTL)
  - T-059.2 Backend: `/system/health` on finance service + Redis-cached
    reachability ping from ops side (1s timeout, 60s cache key
    `system:finance:reachable`)
  - T-059.3 Frontend: `useCapabilities()` hook + route gating + sidebar
    gating + graceful degradation in PR/PO/GR/AP forms (tax codes,
    cost centres become free-text when finance off; amber banner when
    enabled-but-unreachable)
  - T-059.4 Frontend: Tenant Settings → Modules toggle UI; super_admin
    only; audit-logged
  - T-059.5 DevOps: split `docker-compose.finance.yml` (finance +
    finance_consumer + mysql); update nginx confs with conditional
    upstreams returning 503 when finance unavailable
  - T-059.6 CI: new `ops-only-smoke` Playwright job (mongo + redis +
    backend + nginx + user-portal only; full PR→PO→GR→AP smoke); import-
    boundary lint blocking `from services.finance import …` in `src/`
  - T-059.7 Docs: new `Docs/1-Main-Documentation/Deployment-Modes.md` +
    update CLAUDE.md modules section + DevLog entry
- **Acceptance criteria:** see design doc §11
- **Estimated effort:** 4-7 days (backend + frontend in parallel)

---

### T-060 | Wave 2 — Statutory Financial Statements (BS, IS, CF) + Period Close
- **Category:** Backend + Frontend + Docs · **Priority:** P0
- **Assigned:** unclaimed · **Depends on:** T-059 ✅ (Wave 0 — module gate) ·
  **Blocks:** Wave 2.5 (Manual JE UI + Opening Balance Wizard +
  Cutover playbook); Phase E.1 (GR/IR reconciliation report)
- **Goal:** Ship the three statutory financial statements (Balance
  Sheet, Income Statement, Cash Flow) plus the minimum period-close
  machinery they depend on (auto-posted closing JE on fiscal year-end
  close). Maps to Phase 4 of `FINANCE_MODULE_GUIDE.md` and Phase D.5
  of `POSTING_ENGINE_ROADMAP.md`. Reports compute on-demand from the
  GL (same pattern as Trial Balance). No materialisation.
- **Design doc:** `Docs/2-Working-Progress/Wave-2-Design.md`
  (approved 2026-05-24, rev 2)
- **Approver decisions (design doc §12):** "Operational P&L" +
  "Income Statement" naming · closing JE auto-posts with preview
  modal on close · cash-flow seed auto-runs with review banner ·
  parentheses default for negatives · openpyxl for Excel ·
  WeasyPrint for PDF (document Docker footprint) · cost-centre
  filter on all three with BS footnote · Wave 2 scope split from
  Wave 2.5 (Manual JE + Opening Balance + Cutover)
- **Sub-tasks:**
  - T-060.1 Backend (Phase D.5) — Extend `_resolve_fiscal_period_or_raise`
    to refuse postings into closed periods. New endpoints
    `POST /api/v1/finance/periods/{periodId}/close` (validates
    + auto-posts closing JE for fiscal-year-end periods + sets
    `period.status='closed'`, atomically) and
    `POST /periods/{periodId}/reopen` (reverses closing JE via
    existing reversal engine, sets status back to `open`). Audit
    logged via existing finance audit_log.
  - T-060.2 Backend — `gl_accounts.cashFlowCategory` column
    (enum: `cash|working_capital|non_cash_adjustment|investing|financing|none`,
    default `none`) + Alembic migration + idempotent seed defaults
    keyed off code-range prefixes (`110000-*→investing`,
    `121000-*→working_capital`, `126000-*→cash`, `211000-*→financing`,
    etc.) + name-pattern overrides for depreciation/amortisation
    accounts. CoA service reads/writes the new field.
  - T-060.3 Backend — `GET /api/v1/finance/reports/balance-sheet`
    endpoint + `/balance-sheet/drill` + hierarchical walk
    (`parentAccountNumber` + `isHeader`) + `as_of_date` snapshot +
    current-year-P/(L) computation from P&L drawers + balance
    validator (warning when `assets - (liabilities + equity)` >
    0.01 AED).
  - T-060.4 Backend — `GET /reports/income-statement` endpoint +
    drill + DrawerEnum grouping (REVENUE → COST_OF_SALES → OPERATING_COST
    → NON_OPERATING → OTHER_INCOME → TAXATION) + Gross Profit /
    EBIT / Net Income subtotals + comparative-period queries via
    `asyncio.gather` + cost-centre filter using T-057-1a
    `costCenterId` on `journal_entry_lines`.
  - T-060.5 Backend — `GET /reports/cash-flow` endpoint + drill +
    indirect-method computation (net income + non-cash adjustments
    + working-capital deltas + investing + financing) using
    `cashFlowCategory` + cash-validator warning.
  - T-060.6 Backend — `GET /reports/export/{statement}?format=pdf|xlsx`
    streaming download. Excel via `openpyxl`, PDF via WeasyPrint
    (HTML → PDF). Update `services/finance/Dockerfile` with
    Pango/Cairo system deps; document ~100 MB image-size hit in
    DevLog.
    **Status:** ✅ Done · Completed: 2026-05-24 · Assigned: backend-dev-expert
  - T-060.7 Frontend — `<FinanceReportPage>` shell component:
    period/date picker with quick-picks (MTD/QTD/YTD/last closed),
    comparative-period toggle, cost-centre multi-select filter,
    negative-number toggle (parentheses default), scale toggle,
    export buttons (PDF + Excel), drill-down modal pattern. Used
    by all three statement pages.
    **Status:** ✅ Done · Completed: 2026-05-24 · Assigned: frontend-dev-expert
  - T-060.7.1 Frontend — Follow-up: multi-select cost-centres (real `string[]`
    array, repeated-key serialisation via URLSearchParams), Compare-to dropdown
    (None / Previous period / Same period prior year / Custom — with resolved
    compare dates + `compareMode` discriminator in filters), folder cleanup
    (move from `src/features/finance/` → `src/components/finance/`,
    co-locate `types.ts`).
    **Status:** 🔵 Active · Started: 2026-05-24 · Assigned: frontend-dev-expert
  - T-060.8 Frontend — `BalanceSheetPage` (`/finance/balance-sheet`,
    behind `<FinanceGate>`).
    **Status:** ✅ Done · Completed: 2026-05-24 · Assigned: frontend-dev-expert
  - T-060.9 Frontend — `IncomeStatementPage`
    (`/finance/income-statement`, behind `<FinanceGate>`). Sidebar
    rename of existing P&L entry from "P&L Statement" to
    "Operational P&L".
    **Status:** ✅ Done · Completed: 2026-05-25 · Assigned: frontend-dev-expert
  - T-060.10 Frontend — `CashFlowStatementPage`
    (`/finance/cash-flow`, behind `<FinanceGate>`).
    **Status:** ✅ Done · Completed: 2026-05-25 · Assigned: frontend-dev-expert
  - T-060.11 Frontend (Phase D.5 UI) — Close/Reopen buttons on
    existing `/finance/periods` page with pre-close validation
    modal showing the closing-JE preview. Status badges
    (OPEN/CLOSED/LOCKED).
    **Status:** ✅ Done · Completed: 2026-05-29 · Assigned: frontend-dev-expert
  - T-060.12 Frontend — Chart-of-Accounts inline edit of
    `cashFlowCategory` (dropdown, super_admin / finance_admin
    only). One-time review banner shown until dismissed.
    Mutation invalidates the cash-flow report TanStack query.
    **Status:** ✅ Done · Completed: 2026-05-29 · Assigned: frontend-dev-expert
  - T-060.13 Tests — backend unit tests for each computation (BS
    balances, IS Gross/EBIT/Net subtotals, CF reconciles to cash
    delta, drill-down sums match line balances, comparative
    queries, cost-centre filter consistency, closing JE round-trip
    via close/reopen, period-close validation rejection paths).
    Playwright UI smoke for each new page.
    **Status:** ✅ Done · Completed: 2026-05-29 · Assigned: frontend-testing-playwright
    **Result:** 49/49 tests pass (chromium). 7 spec files covering auth/sidebar, balance
    sheet, cash flow, income statement, CoA CF category, manual JE, fiscal periods.
  - T-060.14 Docs — `Docs/1-Main-Documentation/Financial-Statements.md`
    (formulas, sign conventions, drill semantics, closing-JE
    behaviour, cost-centre presentation note) + update
    `Docs/4-Finance-Mod-docs/FINANCE_MODULE_GUIDE.md` Phase 4
    status + CodeMap manual addenda + DevLog + CHANGELOG bump
    (MINOR — new feature).
    **Status:** ✅ Done · Completed: 2026-05-29 · Assigned: api-developer
- **Acceptance criteria:** see design doc §10. Highlights:
  - BS balances within 0.01 AED tolerance.
  - CF reconciles to actual cash account delta within 0.01 AED.
  - Closing a year-end period auto-posts the closing JE; BS shows
    `312000-002 Current Year P/(L)` = 0 on next render.
  - Reopen reverses the closing JE atomically; audit logged.
  - Posting into a closed period returns the existing HTTP 422.
  - Cost-centre subtotals across all centres + un-tagged bucket
    equals the unfiltered total (within tolerance).
  - All three reports respect `<FinanceGate>` (redirect to
    `/dashboard` when finance off).
  - Each report's `meta.computeMs` < 500 ms on seed tenant with
    100k JE rows.
- **Estimated effort:** 12–18 days (~7 backend, ~5 frontend, ~2
  tests + docs + period-close UI; mostly sequential)

---

### T-058 | Purchasing line enrichment — Wave 1b: service-line accounting
- **Category:** Backend + Frontend · **Priority:** P1
- **Assigned:** unclaimed · **Depends on:** T-057-1a ✅ · **Blocks:** —
- **Goal:** Wave 1b of T-057. Service-line accounting: when `line.itemType ==
  "service"`, bypass GR and post AP as DR Expense / CR AP (no GRNI, no
  inventory account). Type-filter chip on PR/PO line item picker.
- **Required item-mapping field:** `expenseAccountId: Optional[str]` on
  `purchase_item_finance_ext`. Verify present; add via Alembic migration
  if missing. Service items MUST have an expenseAccountId before they can
  be used on a PR line (server-side validation).
- **Document-flow changes:**
  - PO → GR transition: skip service lines from GR creation prompt.
  - PO status: a PO with only service lines auto-transitions to "Received"
    on approval; mixed PO transitions to "Received" once all non-service
    lines are fully received.
  - AP invoice posting handler in `services/finance/src/finance/api/v1/events.py`:
    branch on `line.itemType` — service goes DR Expense, others use the
    existing GRNI-clearing path.
- **Frontend:** PR/PO line item picker offers a type filter (Item / Service /
  All); a `Type` chip on each line shows "Item" or "Service" derived from
  itemType (no user-editable toggle since it's determined by the catalog item).
- **Acceptance criteria:**
  - A service item creates a PR → PO → AP chain (no GR step), and the AP
    invoice posts DR Expense / CR AP (no GRNI involvement, no inventory
    account touched).
  - Mixed PO (service + raw_material lines) handles GR flow correctly for
    non-service lines only.
  - All existing tests still pass; new tests cover service-line accounting flow.

---

### T-060.11-audit | Per-period audit history endpoint + UI
- **Category:** Backend + Frontend · **Priority:** P3
- **Assigned:** frontend-dev-expert · **Started:** 2026-05-29 · **Depends on:** T-060.11 ✅ · **Blocks:** —
- **Status:** 🔵 Active (frontend complete 2026-05-29, pending user verification)
- **Description:** The backend writes an `audit_log` row for every fiscal period
  close/reopen event (action=CLOSE or REOPEN, entityType=FiscalPeriod,
  entityId=periodId). This task adds the endpoint and frontend UI.
- **Steps:**
  1. Backend — add audit log list endpoint on finance service ✅ (2026-05-29, backend-dev-expert)
     - `services/finance/src/finance/api/v1/audit_log.py` — new file
     - `services/finance/src/finance/main.py` — router registered
     - `services/finance/tests/test_audit_log_endpoint.py` — 13 tests, all pass
  2. Frontend — auditLogService.ts: `listAuditLog(params)` ✅ (2026-05-29)
  3. Frontend — useAuditLog.ts: `useAuditLog(params)` query hook ✅ (2026-05-29)
  4. Frontend — AuditHistoryModal component ✅ (2026-05-29)
  5. Frontend — PeriodsPage.tsx: Audit button + modal wired for super_admin/finance_admin/finance_reviewer ✅ (2026-05-29)
  6. Backlog — T-064 added (actor-name resolution follow-up) ✅ (2026-05-29)
  > Context: Backend rebuild required for finance container before button works.
  > Frontend is hot-reload only — Vite picks up all changes automatically.
  > Actor names render as truncated UUID — see T-064.

---

### T-064 | Frontend: audit log actor-name resolution
- **Status:** ✅ Done
- **Category:** Frontend · **Priority:** P3
- **Assigned:** frontend-dev-expert · **Started:** 2026-05-29 · **Completed:** 2026-05-29 · **Depends on:** T-060.11-audit ✅ · **Blocks:** —
- **Description:** The AuditHistoryModal (T-060.11-audit) renders `actorUserId` as a
  truncated UUID (first 8 chars + "…") with a tooltip for the full UUID, because no
  shared user-fetch hook exists in the codebase. This follow-up task adds actor-name
  resolution so the audit table shows a human-readable display name instead.
  - Add a shared `useAdminUsers` hook (or extend UserManagementPage inline fetch into
    a reusable hook) that fetches from `GET /v1/users` and returns a userId→name map.
  - The AuditHistoryModal should batch-resolve all unique actorUserIds in the current
    page of results in a single query (not N individual fetches).
  - Render "Loading…" while resolution is in progress, fall back to truncated UUID
    if resolution fails for a given actor.
  - Cache result with TanStack Query (staleTime 5min — user list doesn't change often).
  > Completed 2026-05-29 (frontend-dev-expert):
  > - NEW: `frontend/user-portal/src/hooks/queries/useAdminUsers.ts` — TanStack Query
  >   hook fetching GET /v1/users?perPage=100, returning UserDisplayMap (userId→name).
  >   staleTime=5min. Disabled for non-admin roles (403 guard) and when modal is closed.
  > - MODIFIED: `AuditHistoryModal.tsx` — integrates useAdminUsers + useMemo dedup;
  >   Actor column renders resolved name with UUID in title tooltip; loading spinner
  >   shown during actor resolution; falls back to truncated UUID for unresolved actors.
  > - MODIFIED: `PeriodsPage.tsx` — passes `viewerRole={user?.role}` to modal.
  > - MODIFIED: `hooks/queries/index.ts` — exports useAdminUsers + UserDisplayMap.
  > Approach: Option B (list-all). No batch-by-ID endpoint exists on the backend.
  > Hot-reload sufficient — frontend-only changes.

---

## 🔴 Blocked

### T-100.8.1 | delivery_posted finance handler (COGS JE) — Wave 3 Phase 2
_See full entry under Active/T-100 sub-tasks section above._
- **Category:** Backend · **Priority:** P1
- **Depends on:** T-100.8 ✅
- **Description:** Finance consumer handler that posts `Dr COGS / Cr Inventory` JEs
  when `delivery_posted` outbox events are consumed. All work in `services/finance/`.
  Until this ships, deliveries emit events to the outbox but no COGS JEs are posted.
  Unblock by claiming and implementing the handler in `services/finance/src/finance/api/v1/events.py`.

