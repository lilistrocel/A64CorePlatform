# Plant Library — Product Extension (Design)

**Branch:** `plant-library-product-extension` · **Status:** design agreed, not yet built
**Author:** Viet Anh · **Date:** 2026-08-19

## 1. Intent

Each **mother** (the common crop name, e.g. "Capsicum") carries a list of
**products** it can yield. A block planted with a **variety** resolves its
product picklist live from its mother. The harvest modal records several
products in one submission — e.g. green *and* red capsicum off one planting —
and each line is routed to the destination its category implies.

## 2. Decisions locked

| Question | Decision |
|---|---|
| Units | **kg only.** Other units wait for an animal-husbandry module. |
| Unit stored? | Yes — `unit` enum with `kg` its only member, so adding units later is additive, not a backfill. |
| Categories | Fixed enum: **sellable / process / waste**. No user-created categories. |
| Yield counts | **Sellable only** — achieved structurally, see §6. |
| Picklist propagation | **Live read from the mother** — no snapshot, no staleness flag. |
| Grade | Per product line. Required for sellable/process; **not asked for waste**. |
| Waste | The new waste product is **canonical**; the old write path is retired. |
| Multi-line grouping | Shared **`harvestBatchId`**, carried across all three destinations. |
| Sellable invariant | Every mother must always have **at least one ACTIVE sellable product**. |
| Default harvest list | Shows **sellable only**. Batch lookup (§7) unions all categories. |

Because categories are a fixed enum, `sellable` is safe to rely on directly —
no `countsTowardYield` flag is needed.

## 3. Routing — one line, one destination

| Category | Destination | Block link |
|---|---|---|
| `sellable` | `block_harvests` row → `inventory_harvest` FIFO batch | `blockId`, existing `sourceHarvestId` |
| `process` | **new** processing inventory | source block ref |
| `waste` | `inventory_waste` **directly** | `sourceBlockId` + `sourceType: 'harvest'` |

### 3.1 Why waste and process do NOT get a `block_harvests` row

**This is the single most important decision in the document. Do not
"simplify" it later by centralising everything into `block_harvests`.**

`block_harvests` is the sellable ledger. 48 backend references sum its
`quantityKg` — including block analytics, farm analytics, three
`harvest_repository` aggregations, the `farms.py` `totalKg` rollup, and the
**finance P&L** (`pnl_service.py:394`).

If waste and process lines were written as `block_harvests` rows, every one of
those would silently start including non-sellable output. No error — just yield
and P&L numbers that quietly grow. Avoiding that would mean adding a category
filter to all 48 sites *and* a rule that legacy rows (13,947 of them, with no
category) still count as sellable.

Routing by destination makes the whole problem structural instead:
**every row in `block_harvests` is sellable, legacy and new alike.** Yield stays
"sum all rows", exactly as today. Zero of the 48 consumers change. The P&L is
never involved.

`WasteInventory` already supports this — it has a `'harvest'` member on
`sourceType` and a `sourceBlockId` documented as *"Block ID (for harvest
waste)"*. The one live row proves the path works end to end.

## 4. Model changes

### 4.1 `plant_mothers.products[]` (new, embedded)

```
PlantProduct:
  productId    UUID    stable identity; never reused
  name         str     1-200 chars, unique within the mother (409 on clash)
  unit         enum    "kg"   (only member today)
  category     enum    "sellable" | "process" | "waste"
  isActive     bool    default true
```

Embedded rather than a separate collection: products are meaningless outside
their mother, and the mother is already the product/SKU level per its own
docstring.

**Deletion follows the existing mother-delete precedent — refuse, don't
cascade.** A product referenced by any recorded line cannot be removed, only
deactivated (`isActive: false`), which hides it from the picklist while leaving
history intact.

### 4.1a The sellable invariant

**Every mother must always have at least one ACTIVE sellable product.**

Rationale: a mother with only `process`/`waste` products cannot have its
harvest recorded as sellable output, which is the whole point of the picklist.
The user called this out directly — creating only process or waste products
"doesn't make sense".

Enforced **server-side**, because any API client must end up with a valid
mother — the UI warning is a courtesy, not the guarantee.

- **On mother creation**, if no active sellable product results — no products
  supplied at all, OR only `process`/`waste` supplied — the server creates one
  automatically: name = the mother's `plantName`, `category: sellable`,
  `unit: kg`, `productId` = deterministic
  `uuid5(NAMESPACE_OID, str(plantMotherId))`, matching the seeding migration's
  scheme so both paths yield the same id. The response message says so.
- **409 on any mutation** that would leave zero active sellable products:
  deactivating the last active sellable, changing its category away from
  `sellable`, or setting `isActive: false` on it. All three routes into
  deactivation are covered, not just the DELETE endpoint.
- **Always allowed:** renaming any product including the last sellable; adding
  products of any category; moving a product between `process` and `waste`;
  deactivating a sellable when another active sellable remains.

The check lives in one named helper in `plant_mother_service.py` rather than
being repeated per mutation path. The frontend mirrors the rule for pre-submit
UX (a dialogue naming the product that will be auto-created), but the server is
the enforcement point.

All 59 existing mothers already satisfy this — the seeding migration gave each
one an active sellable product named after itself.

### 4.2 `block_harvests` — sellable only

```
productId       Optional[UUID]   null on legacy rows
productName     Optional[str]    FROZEN snapshot at harvest time
harvestBatchId  Optional[UUID]   groups lines from one submission
qualityGrade    unchanged        still required
quantityKg      unchanged        still required, gt=0
```

No `productCategory` field — every row here is sellable by construction.

`productName` is a **frozen snapshot**, not a synced denormalisation, following
the `block_archives.targetCropName` precedent. Renaming a product does not
rewrite history; anything needing the current name joins on `productId`.

### 4.3 `inventory_waste` (`WasteInventory`) — additions

```
productId       Optional[UUID]
harvestBatchId  Optional[UUID]
```
`plantName` is set from the **product** name. `originalGrade` stays null for
harvest waste — waste lines are not graded. `sourceType` is `'harvest'`,
`sourceBlockId` is the block.

### 4.4 Processing inventory (new)

Mirrors the harvest-inventory shape, separate from sellable stock: source block
ref, `productId`, `productName`, `quantity`, `unit`, `qualityGrade` (process
output IS graded), `harvestDate`, `harvestBatchId`.

### 4.5 Indexes to add

- `plant_mothers`: `products.productId`
- `block_harvests`: `productId`, `harvestBatchId`
- `inventory_waste`: `harvestBatchId`, `sourceBlockId`
- **`plant_data_enhanced.motherPlantId`** and **`blocks.productMotherId`** —
  missing today, so every mother→variety lookup and the whole rename cascade are
  collection scans. Add regardless of this feature.

## 5. Harvest modal

One submission → N lines, each routed by its product's category, all sharing a
`harvestBatchId`.

- Product picker resolves live from `block.productMotherId` → mother
  `products[]`, filtered to `isActive`. That link is already populated on all
  160 blocks.
- Each line: product, quantity (kg), grade.
- **The grade control is hidden when the chosen product's category is `waste`.**
- The old waste write path (`BlockHarvestEntryModal.tsx:145` →
  `farmApi.ts:500-520`) is **retired** — waste now flows through the product line.

## 6. Yield

Sellable only, achieved structurally: yield sums `block_harvests`, which
contains only sellable rows. No filtering, no legacy-row special case.

## 7. Batch lookup and editing

The default harvest list stays cheap — it reads `block_harvests`, so it shows
sellable rows only.

To edit a mixed submission, the user filters by **source block + harvest date**.
That view unions the three destinations and shows every line from the matching
batch(es), across all categories. `harvestBatchId` disambiguates when a block
has more than one submission on the same date, and is the key for editing or
deleting a submission as a unit.

## 8. Migration

Follows `plant_library_mother_variety_migration.py` — deterministic uuid5 ids,
idempotent per step, `--dry-run`, gated on `deletedAt: null`, warnings never
fatal.

1. Seed one `sellable` product per mother, named after the mother, unit kg —
   59 rows, so blocks can record harvests immediately without manual setup.
2. Migrate the single existing `inventory_waste` row to the new shape.
3. Add the indexes in §4.5.
4. `block_harvests`: **no backfill.** Legacy rows keep a null product and
   display as "Unspecified".

## 9. Pre-existing bugs folded in

Found during the audit; all three sit in files this work touches.

1. **`harvest_service.py:123-125` writes the VARIETY name** into
   `inventory_harvest.plantName`. It must write the **product** name.
2. **`archive_repository.py:488-513`** builds `BlockArchive` without copying
   `productMotherId`/`productName`, though the model has both fields. Latent
   only because no archive has been created since the migration — the next one
   gets a null.
3. **`plant_data_enhanced` is not org-scoped on read** (zero `organizationId`
   references in its repository, while `plant_mothers` *is* filtered). A live
   cross-tenant leak of the same family as the cache-isolation fix.

## 10. Downstream surface

- **Backend:** plant mother service/repository/API (products CRUD), harvest
  service + repository, the new processing inventory, waste inventory, archive
  repository.
- **Frontend:** `BlockHarvestEntryModal` (multi-line rework), `BlockHarvestsTab`,
  `HarvestInventoryList`, `PlantMotherFormModal` + `PlantMotherDetailModal`
  (products editor), `types/farm.ts`, the new batch-lookup view.
- **Untouched by design:** block analytics, farm analytics, `harvest_repository`
  aggregations, `farms.py`, and the finance P&L. See §3.1.

## 11. Deferred

- `sales_order_lines` still carries free-text `cropName` (13,281 rows, 63
  distinct values) with no product reference. Joining it needs human
  adjudication — see backlog T-500 decision #1 and T-201.8b.
- `products` collection (0 rows, zero frontend) remains a dead fourth claimant
  on the word "product". Candidate for deletion.
- Legacy `plant_data` collection + routes (0 rows, no importers).

## 12. Operational notes

- `response_model` silently strips unknown fields —
  `docker restart a64coreplatform-api-1` is REQUIRED after any Pydantic change.
  Also widen `plant_mothers.py:169`, which returns `List[PlantDataEnhanced]`.
- `/app/tests` is not bind-mounted: `rm -rf`, `docker cp`, then pytest.
- Relevant suites: `test_plant_mother_api.py`, `test_plant_library_models.py`,
  `test_plant_library_migration.py`, `test_plant_library_csv_import.py`.
- Open backlog items touching the same files: **T-916** (duplicate variety),
  **T-917** (CSV template/import rework).
