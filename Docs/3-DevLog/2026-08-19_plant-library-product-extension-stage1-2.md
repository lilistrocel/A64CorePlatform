# DevLog — Plant Library Product Extension, Stage 1+2 (T-922)

## 1. Session Header
- **Date:** 2026-08-19
- **Session type:** Multi-agent feature build (backend + frontend +
  migration), design-doc-driven
- **Focus area:** `farm_manager` module — plant mother product picklist
- **Status:** Stage 1 (backend CRUD), Stage 2 (frontend UI), the
  sellable-invariant addenda, and the CSV-importer bypass fix are all
  **complete and verified** (unit tests + `tsc`). Not yet committed —
  branch `plant-library-product-extension`. Stages 3-5 **not started**,
  carried forward as backlog T-923.
- **Objective:** Let each plant mother (the crop/SKU, e.g. "Capsicum")
  carry a picklist of concrete products it can yield, as the foundation
  for a later harvest modal that records several products in one
  submission and routes each to the correct inventory destination.

## 2. What We Accomplished
- Agreed and wrote the design doc
  (`Docs/2-Working-Progress/plant-library-product-extension-design.md`)
  before any code — locked decisions: kg-only unit (as a real enum, so a
  future animal-husbandry module is additive, not a backfill), a fixed
  `sellable`/`process`/`waste` category enum, live (not snapshotted)
  picklist resolution from the mother, and an invariant that every mother
  always keeps at least one active sellable product.
- **Backend (Stage 1 + two addenda):** `PlantProduct` model + 4 CRUD
  endpoints under `/plant-mothers/{id}/products`; server-side sellable
  invariant (auto-seed on create, 409 on any mutation that would remove
  the last active sellable one); closed the CSV importer's bypass of that
  invariant; 3 new indexes.
- **Migration:** wrote and **ran against production** — seeded a default
  sellable product for all 59 existing mothers, verified 59/59, confirmed
  idempotent via a clean second run (59 skipped / 0 seeded).
- **Frontend (Stage 2 + addendum):** shared `ProductsEditor.tsx` in draft
  (create flow) and live (CRUD) modes, embedded in `PlantMotherFormModal`
  (create only) and `PlantMotherDetailModal` (always — now the single
  home for managing an existing mother's products); pre-submit
  confirmation dialogue mirroring the server invariant.
- **Verification:** `tests/unit/test_farm_manager` 98 passed (78 at Stage
  1 start); full `tests/unit` 851 passed / 1 skipped / 2 pre-existing
  unrelated failures; frontend `npx tsc -b` at the documented 234-error /
  129-TS6133 baseline exactly, zero new, none in a touched file.

## 3. Design Reasoning Not Recoverable From the Diff

### 3.1 Why waste and process must NOT become `block_harvests` rows
This is the single most load-bearing decision in the design doc, and it's
invisible in the code — Stage 1/2 don't touch routing at all, but every
future stage (T-923) has to respect it, so it's worth spelling out here
rather than trusting it survives only as a design-doc paragraph.

`block_harvests` is today's sellable ledger. **48 backend references sum
its `quantityKg`** — block analytics, farm analytics, three
`harvest_repository` aggregations, the `farms.py` `totalKg` rollup, and
critically the **finance P&L** (`pnl_service.py:394`). None of those 48
call sites filter by category; they all assume every row is sellable
output, because until now that's been true by construction.

If a future stage wrote `process` or `waste` harvest lines into
`block_harvests` — even with a `productCategory` field to distinguish
them — every one of those 48 sites would silently start including
non-sellable weight in yield and revenue figures. No error, no crash:
just yield and P&L numbers that quietly grow. Making it safe after the
fact would mean adding a category filter to all 48 call sites, plus a
rule that the 13,947 pre-existing legacy rows (which carry no category at
all) still count as sellable — a correctness-critical change smeared
across the whole codebase with no single place to verify it's complete.

**Routing by destination avoids the problem structurally instead**: a
`sellable` product line becomes a `block_harvests` row (as today);
`process` goes to a new processing-inventory collection; `waste` goes
straight to `inventory_waste` (which already has a `sourceType:
'harvest'` member and a `sourceBlockId` documented for exactly this case
— the one live waste row proves the path works end to end). Every row in
`block_harvests` stays sellable, legacy and new alike. Yield stays "sum
all rows," exactly as today. **Zero of the 48 consumers need to change.**
The P&L is never in the blast radius of this feature at all.

This is why T-923's description explicitly warns against "simplifying"
the routing later by centralizing everything into one table — it would
reintroduce the exact bug this design avoids, and the bug would be silent.

### 3.2 The mother/variety hierarchy is currently flat in live data
The model supports mother → many varieties (e.g. "Capsicum" → "Purple
Beauty", "California Wonder"), but as of this session **every one of the
59 live mothers has exactly one variety, and every `varietyName` is
literally `"Standard"`.** Nothing in this stage depended on that fact —
products live on the mother, not the variety, specifically so the
picklist doesn't need to account for per-variety differences — but it's
worth recording because it means the mother/variety split is, in
practice, currently a 1:1 relationship carrying no real data yet. Anyone
reasoning about "does a product apply to all varieties of a mother or
just one" should know the honest answer today is "there's only one
variety to ask about," not that the question has been answered by design.

### 3.3 Why the CSV importer bypass mattered
The invariant addendum's first pass left a known gap: `import_from_csv`'s
mother find-or-create called `PlantMotherRepository.create()` directly
instead of going through `PlantMotherService.create_mother`, so a mother
created by CSV import got no auto-seeded sellable product and no 409
protection on later edits — a silently inconsistent invariant depending
on which door a mother came in through. The stated blocker for not fixing
it immediately ("circular import risk") turned out to be already solved
in the same function — a working deferred-import block for
`PlantMotherService`/`PlantMotherRepository` already existed a few lines
above the bypass. Fixing it was a one-line call-site swap once that was
noticed. Recorded here because "the blocker was already solved nearby, it
just wasn't used" is a useful thing to re-check before accepting a
blocker as real on the next stage.

## 4. Bugs/Issues Discovered (deferred, not fixed this session)
Found during the design audit (design doc §9), all three in files T-923
will touch again — **not fixed here**, explicitly carried into T-923:
1. **[Medium]** `harvest_service.py:123-125` writes the **variety** name
   into `inventory_harvest.plantName`; should write the **product** name.
2. **[Low, currently latent]** `archive_repository.py:488-513` builds
   `BlockArchive` without copying `productMotherId`/`productName`, though
   the model has both fields. No archive has been created since the
   mother/variety migration, so this hasn't produced a bad record yet —
   the next one will.
3. **[Medium, security-adjacent]** `plant_data_enhanced` reads are not
   org-scoped (zero `organizationId` references in its repository, while
   `plant_mothers` *is* filtered) — the same family of bug as the T-918
   cache cross-tenant leak, just in a different layer (missing filter vs.
   missing cache key).

## 5. What We Need To Do Next
1. User click-through verification of the frontend (draft/live editor,
   confirmation dialogue, 409 surfacing) — not run through Playwright this
   session.
2. Backlog **T-923** (filed in `Docs/Backlog/BACKLOG.md`, Ready section):
   harvest modal multi-line rework, `block_harvests`/waste/
   processing-inventory routing, batch lookup — plus the three bugs in
   §4 above.
3. **Coordinate with T-917** (CSV template/import rework, Active) before
   starting T-923 — both touch `plant_data_enhanced_service.py`'s
   `import_from_csv`; this session already changed its mother
   find-or-create call, so T-917 will need to rebase onto it.
4. CodeMaps regeneration — flagged, not run this session (structural:
   4 new endpoints, 5 new/changed models, 1 new frontend component).

## 6. Important Context for Next Session
- **Deploy:** `docker restart <prefix>-api-1` required after these
  backend changes land — this session's verification of the sellable
  invariant/migration IDs matching was done via a clean restart + unit
  tests, not yet re-verified after this branch is actually deployed.
- **Migration already ran in production** on this deployment
  (`plant_library_default_product_migration.py --execute`) — re-running
  it is safe (idempotent, mother-level skip) but should not seed a second
  time; a second run should always report 59 skipped / 0 seeded on this
  box.
- No live `plant_mothers` document was ever mutated by a **product**
  create/edit/deactivate this session (only by the migration's seed) —
  the CRUD endpoints themselves were verified via the unit-test fake DB
  only, not a real logged-in smoke test (no working super_admin login on
  this deployment).
- Design doc §11 lists explicitly deferred, out-of-scope items worth
  remembering: `sales_order_lines.cropName` free-text with no product
  reference (13,281 rows), the unused `products` collection (0 rows), and
  the legacy `plant_data` collection/routes (0 rows).

## 7. Files Modified
See the branch's own commits for the authoritative list (backend,
frontend, migration+test, and docs were split into 4 separate commits).
Summary:
- **Backend:** `src/modules/farm_manager/models/plant_mother.py`,
  `api/v1/plant_mothers.py`, `services/database.py`,
  `services/plant_data/plant_mother_repository.py`,
  `services/plant_data/plant_mother_service.py`,
  `services/plant_data/plant_data_enhanced_service.py`; tests in
  `tests/unit/test_farm_manager/test_plant_mother_api.py` and
  `test_plant_library_csv_import.py`.
- **Migration:**
  `scripts/migrations/plant_library_default_product_migration.py` (new)
  + `tests/unit/test_farm_manager/test_plant_library_default_product_migration.py`
  (new).
- **Frontend:** `frontend/user-portal/src/components/farm/ProductsEditor.tsx`
  (new), `PlantMotherDetailModal.tsx`, `PlantMotherFormModal.tsx`,
  `types/farm.ts`, `services/plantMotherApi.ts`,
  `hooks/queries/usePlantMothers.ts`, `config/react-query.config.ts`.
- **Docs:** this file;
  `Docs/2-Working-Progress/plant-library-product-extension-design.md`
  (new); `CHANGELOG.md`; `Docs/1-Main-Documentation/Versioning.md`;
  `Docs/Backlog/BACKLOG.md` (T-922 archived, T-923 filed);
  `Docs/Backlog/ARCHIVE.md`.

## 8. Session Metrics
- **Tests:** `tests/unit/test_farm_manager` 98/98 passed (+20 net from
  the 78 baseline noted at Stage 1 start, after accounting for helper
  changes). Full `tests/unit`: 851 passed, 1 skipped, 2 pre-existing
  unrelated failures. Frontend `tsc -b`: 234 errors (129 TS6133), exactly
  the documented pre-existing baseline.
- **Key achievement:** shipped the full products-picklist foundation
  (model, CRUD, invariant, migration, UI) that every later stage of the
  harvest-routing redesign depends on, with the invariant closed on both
  entry points (API and CSV import) before handoff.
