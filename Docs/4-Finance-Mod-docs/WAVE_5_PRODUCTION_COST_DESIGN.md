# Wave 5 — Production Cost Accounting Design

**Author:** Viet Anh
**Status:** DRAFT — awaiting design-decision sign-off
**Period:** post-Wave 3 Sales Module closeout
**Date:** 2026-05-31
**Prerequisite tasks:** T-200.10 + T-200.11 + T-200.x (all complete)
**Tracker:** T-500 in `Docs/Backlog/BACKLOG.md`

---

## 1. Why this exists

The A64 platform today has two parallel inventory systems that do not talk to
each other. On the farm side, blocks are planted, inputs (seeds, fertilizer,
pesticides) are consumed, and harvests are recorded. On the sales/finance
side, inventory is tracked through `inventory_balances` (moving-average cost
source) and `inventory_movements` (the append-only ledger that Delivery /
Return decrement and increment). These two systems share zero data.

The visible consequence is that a Sales Order → Delivery → AR Invoice posted
against a harvested item produces a Journal Entry with the right account
structure but `Dr COGS 0.00 / Cr Inventory 0.00`. The arithmetic is correct —
the inputs to the COGS calculation are zero because no production cost has
ever flowed into `inventory_balances` for the harvested item. The Sales
Module's smoke testing exposed this throughout Wave 3 and the PM report
("Known Gaps" section) flagged it explicitly.

Wave 5 bridges the two halves. After Wave 5 the cost of inputs consumed by a
block accumulates as that block's work-in-progress balance, transfers to the
finished-goods inventory on harvest, and decrements through Delivery as real
COGS. The full cost-of-production lifecycle is then visible on every Sales
JE and on a new block-profitability report.

This is **process-costing** — the standard ERP pattern used by SAP Business
One, NetSuite, and any mid-market ERP that supports manufactured goods. The
A64 platform's farm context maps cleanly onto the process-costing model
(blocks are production runs; harvests are finished-good receipts; inputs are
raw materials issued to production).

---

## 2. Current state — verified live

### Two parallel inventory systems

| Side | Collection | Live count | What it holds |
|------|------------|-----------:|---------------|
| Farm | `blocks` | 404 | Planted blocks (location, crop, lifecycle state) |
| Farm | `block_harvests` | 13,942 | Yield events: which block produced how much of what crop |
| Farm | `inventory_input` | 171 | Inputs consumed by blocks (seeds, fertilizer, etc.) |
| Farm | `inventory_waste` | 1 | Harvested-but-wasted product |
| Farm | `inventory_asset` | 10 | Capital items (machinery, tools) |
| Sales/Finance | `inventory_balances` | 0 | Moving-average cost source — empty |
| Sales/Finance | `inventory_movements` | 5,096 | Ledger of decrements/increments; `unitCost: 0` on every row |

`inventory_balances` is empty because nothing has ever populated it for
harvestable items. Only purchasing's Goods Receipt writes to it, and no GRs
exist for any item that's both planted-and-harvested on the farm. The
TOM-SEED item that T-200.9 seeded `sale_item_finance_ext` for is the closest
case, but even that has no `inventory_balances` row — it has finance
configuration but not yet a cost basis.

### What happens on a Sales transaction today

Sequence for `Quote → SO → Delivery` against a harvested item:

1. Quote: no inventory touch.
2. Sales Order: no inventory touch.
3. Delivery DRAFT → OPEN:
   - `delivery_service.py` calls `_get_unit_cost(item_id, warehouse_id, org_id)` against `inventory_balances`. Returns `None` because no row exists.
   - Service logs `[DeliveryService] No inventory_balances record for item=... warehouse=... org=...` and **stamps `unitCost=0` on the Delivery line**.
   - Inventory movement row inserted: `quantity: -N, unitCost: 0, totalCost: 0`.
   - `delivery_posted` event emitted to finance outbox.
4. Finance consumes `delivery_posted`:
   - Reads the per-line `unitCost` (0) and computes `lineCogs = quantity * unitCost = 0`.
   - Posts `Dr COGS 0.00 / Cr Inventory 0.00`.
   - Account assignments are correct (T-200.9 fixed those); the amounts are zero because the inputs are zero.

The chain is mechanically sound. The bug is upstream — nothing populated
`inventory_balances` with a real avgCost for the item.

---

## 3. Target model — process-costing flow

Wave 5 introduces a three-step cost flow that mirrors the SAP B1 production
order pattern:

```
                              [Raw Materials Inventory]
                                       │
              (1) Issue input to block │ Dr WIP / Cr Raw Materials
                                       ▼
                                [Block WIP balance]
                                       │
              (2) Record harvest       │ Dr Finished Goods / Cr WIP
                                       │   (allocate WIP → harvest qty)
                                       ▼
                          [Finished Goods Inventory]
                                       │
              (3) Sell via Delivery    │ Dr COGS / Cr Finished Goods
                                       ▼
                                     [COGS]
```

Each step is a real journal entry posted by the finance microservice in
response to an event emitted by the farm / sales layer. The events are new
additions to the existing outbox pattern that Wave 3 already uses for
sales-side postings.

### Worked example — TOM-RED tomatoes from Block 42

Assume seed cost is AED 100/kg, fertilizer cost is AED 50/kg, Block 42
expects a 150 kg yield.

**Day 1 — Planting:** 5 kg of TOM-SEED issued to Block 42.

- `inventory_input` row: `{blockId: 42, itemId: TOM-SEED, quantity: 5, unitCost: 100, totalCost: 500}`
- `inventory_movements` row: `{itemId: TOM-SEED, quantity: -5, unitCost: 100, movementType: "input_issued"}`
- `inventory_balances` decrement: TOM-SEED stock and value down by 5 kg / AED 500
- Event `input_issued` emitted; finance posts: `Dr WIP-Block-42 500.00 / Cr Raw Materials Inv 500.00`
- New: `block_wip` row: `{blockId: 42, balance: 500.00}`

**Day 28 — Fertilizer:** 2 kg of FERT-NPK issued to Block 42.

- `inventory_input` row: `{quantity: 2, unitCost: 50, totalCost: 100}`
- Movement, balance, event same pattern
- Finance posts: `Dr WIP-Block-42 100.00 / Cr Raw Materials Inv 100.00`
- `block_wip` row: `{blockId: 42, balance: 600.00}`

**Day 84 — First harvest:** 60 kg of TOM-RED produced.

- `block_harvests` row: `{blockId: 42, itemId: TOM-RED, quantity: 60}`
- Cost allocation (running estimate against expected yield = 150 kg): unitCost = 600 / 150 = AED 4/kg
- `inventory_movements` row: `{itemId: TOM-RED, quantity: +60, unitCost: 4, totalCost: 240, movementType: "harvest"}`
- `inventory_balances` upsert: TOM-RED avgCost = 4.00 (or recomputed if existing stock)
- Event `harvest_recorded`; finance posts: `Dr Finished Goods (TOM-RED) 240.00 / Cr WIP-Block-42 240.00`
- `block_wip` row: `{blockId: 42, balance: 360.00}`

**Day 98 — Second harvest:** 50 kg of TOM-RED.

- Same flow; unitCost still 4/kg against expected yield
- Finance posts: `Dr Finished Goods 200.00 / Cr WIP 200.00`
- `block_wip` row: `{blockId: 42, balance: 160.00}`

**Day 112 — Final harvest:** 40 kg of TOM-RED. Total now 150 kg matching the
expected yield.

- Same flow; finance posts: `Dr Finished Goods 160.00 / Cr WIP 160.00`
- `block_wip` row: `{blockId: 42, balance: 0.00, status: closed}`

**Day 120 — Sales:** Delivery of 100 kg TOM-RED to Customer X.

- `delivery_service._get_unit_cost(TOM-RED, ...)` reads `inventory_balances.avgCost` = 4.00
- Delivery line stamped: `unitCost: 4, lineCogs: 400`
- Finance posts: `Dr COGS 400.00 / Cr Finished Goods 400.00`

The journal entries balance end-to-end; the cost trail from TOM-SEED purchase
to final COGS is auditable through the chain of events.

---

## 4. The six design decisions

Each decision below has 2-3 options, tradeoffs, and a recommendation. The
recommendations form the default — override only if you want a different
behaviour and accept the additional complexity.

### Decision 1 — Item identity for inputs vs harvested outputs

The same physical thing has different roles depending on where it sits in
the chain: TOM-SEED is an input you buy; TOMATO-RED is an output you sell.
They are different SKUs with different cost bases, different unit economics,
different tax codes.

**Options:**

A. **Separate items linked by a production routing** — one item record per
   role. TOM-SEED has its own entry; TOMATO-RED has its own entry; a
   `production_routing` collection links inputs to outputs ("Block 42's
   recipe: TOM-SEED → TOMATO-RED, expected ratio 1 kg seed produces 30 kg
   tomato").

B. **Single item with dual-role flag** — one item record with
   `{isInputItem: true, isOutputItem: false}` flags. TOM-SEED would have
   `isInputItem: true`. The harvest creates a new SKU on the fly or you
   tag the same SKU as both. Saves table joins but conflates two distinct
   business concepts.

C. **Hybrid — items have both inputs and outputs collections** as nested
   lists. Single item record can be both a finished good and a component
   of another product.

**Recommendation: A (separate items + production routing).** Matches SAP B1
"Bill of Materials" + "Production Order" model. Each item has its own cost
basis, tax code, sellability flag, and chart-of-accounts mapping. The
routing record captures the recipe and yield expectations cleanly.

**Why this matters for Wave 5:** the `block_harvests` collection today
references items by `itemId` but the items themselves don't exist in any
master (T-200.9 confirmed `db.items` is empty). Wave 5 needs an items
master either way — Decision 1 settles whether each role is its own row.

**Cost of this decision:** a new `items` master collection + a
`production_routing` collection + a small UI under Sales Items Config (or
a sibling page) for managing them. Probably 2-3 task cycles on its own.

### Decision 2 — Warehouse vs block-as-location

`inventory_balances` is keyed by `(itemId, warehouseId, organizationId)`.
Today blocks aren't warehouses; they're a separate dimension. Two paths:

**Options:**

A. **Block-as-warehouse** — treat each block as a logical warehouse. The
   "TOM-RED in Block 42" inventory_balances row sits next to "TOM-SEED in
   Main Warehouse." Pros: minimal schema change. Cons: blocks have a
   lifecycle warehouses don't (planted → harvested → cleared → replanted),
   and you don't typically deliver from a block, you deliver from a
   storage facility after the harvest has been moved.

B. **Block-as-location dimension** — extend the key to
   `(itemId, warehouseId, blockId, organizationId)`, where `blockId` is
   optional. Inputs and WIP are tracked per block; finished goods get
   tracked per warehouse (and optionally per block-of-origin for
   traceability). Pros: more flexible; matches reality (harvested
   tomatoes move from Block 42 to Cold Storage to Loading Dock during the
   sales workflow). Cons: bigger schema change; new indices.

C. **Block-as-warehouse during WIP; physical warehouse for finished goods**
   — hybrid. WIP tracks at the block level; on harvest, the cost transfers
   to a real warehouse's `inventory_balances`. Simpler than B; preserves
   the "blocks aren't warehouses long-term" intuition.

**Recommendation: C (hybrid).** WIP is per block; finished-goods inventory
is per warehouse with an optional `blockOfOrigin` denormalised reference
for traceability. The `inventory_balances` schema gets an optional
`blockId` for WIP rows; finished-goods rows leave it null. This matches
how a real farm operations team thinks about it: "block 42 has X in
process; cold storage has Y of TOM-RED on hand, of which Z came from block
42 originally."

**Tradeoff if you pick B instead:** more granular but harder to surface in
reports; users will ask "how much TOM-RED do I have on hand total" and
that's a sum across many block-keyed rows.

### Decision 3 — Multi-harvest cost allocation

A single block typically produces multiple harvest events over a cycle.
The WIP was built up over the whole growing period; when the first harvest
happens, we don't yet know how much the total yield will be. Yet we need to
assign a unitCost to the harvested goods so they can be sold.

**Options:**

A. **Proportional against expected yield** — at planting, the block
   declares `expectedYield: 150 kg`. Each harvest event allocates
   `running_unit_cost = (current_wip_balance / remaining_expected_yield)`.
   When actual matches expected, WIP closes to zero. If actual ≠ expected,
   a variance is posted at cycle close.

B. **Running average / "consumption draws WIP"** — each harvest takes a
   proportional share of the CURRENT WIP balance: `unitCost = wip_balance
   / harvest_qty` for the first harvest, then remainder rolls forward.
   Doesn't need an expected yield; mathematically cleaner but harder to
   explain to a farm manager.

C. **Standard cost** — every harvested item has a per-kg standard cost
   defined in advance (e.g., TOMATO-RED = AED 4/kg standard). Every
   harvest posts at standard. At cycle close, WIP - (total harvest *
   standard cost) is the variance, posted to a Production Variance
   account. This is SAP B1 and is the most rigorous model.

**Recommendation: A (proportional with expected yield).** Easiest to
explain to non-accountant operators; produces sensible numbers per harvest;
keeps the cycle-close variance as a real concept but rare in practice
(when planning is accurate). Layer C (standard cost) in a later phase if
the customer wants tighter cost control.

**Required schema change:** `blocks.expectedYield` field. Captured at
planting time or set on the block record by the farm planner.

### Decision 4 — Loss and waste accounting

`inventory_waste` records harvested-but-wasted product. Today this writes
to a Mongo collection with no GL impact. In a real cost-accounting
system, waste is a cost that needs to land somewhere — typically
"COGS-Waste" or "Production Loss."

**Options:**

A. **Waste posts Dr COGS-Waste / Cr Finished Goods** at moving-avg cost
   when recorded. Treats waste as a normal COGS event. Pros: simple;
   ties to existing GL accounts. Cons: hides the production-loss signal
   in a generic COGS line.

B. **Waste posts Dr Production Loss / Cr Finished Goods** with a
   dedicated Production Loss account. Reports can flag waste as a
   distinct cost category. Pros: visible. Cons: one more account to
   manage.

C. **Allocate waste cost back to WIP** at the time of waste rather than
   passing through Finished Goods. Skips the COGS step. Pros: keeps
   "wasted" product out of revenue-side accounts. Cons: timing — waste
   often happens days/weeks after harvest, by which time the cost is
   already in Finished Goods.

**Recommendation: B (dedicated Production Loss account).** Visibility is
the point. The farm manager wants to see "we lost 12 kg this month worth
AED 48" as a line item, not buried in COGS. The Production Loss account
sits next to COGS in the operating-expense drawer.

### Decision 5 — Chart of accounts additions

Wave 5 needs new GL accounts. Best to add them as part of the standard
seed (Alembic migration) so every new tenant has them on day 1, and
patch the existing A001 tenant with a one-time data migration.

**New accounts to add** (all under 5xxxxx Cost of Sales / Operating Cost
drawers):

| Number | Name | Drawer | Type | Used by |
|--------|------|--------|------|---------|
| 122500-001 | Work-in-Progress (Production) | ASSETS | asset | Phase 1 |
| 121500-001 | Finished Goods Inventory | ASSETS | asset | Phase 1 |
| 511500-001 | COGS - Harvested Produce | COST_OF_SALES | expense | Phase 1 |
| 514500-001 | Production Variance | OPERATING_COST | expense | Phase 3 |
| 514500-002 | Production Loss / Waste | OPERATING_COST | expense | Phase 4 |

**Configuration on `company_posting_setup`** — add 5 new account-ID fields
to the table, paired with form fields on the Posting Setup UI. Existing
T-200.10 page extends naturally.

### Decision 6 — Cost mapping field placement

Each item needs to know which GL accounts to post against in production
events. Today `sale_item_finance_ext` carries `revenueAccountId` +
`cogsAccountId` for sales events. Two paths for production:

**Options:**

A. **Extend `sale_item_finance_ext`** with two new fields:
   - `productionInputAccountId` — the Raw Materials account to credit when this item is issued to a block
   - `producedItemId` — for input items, points to the harvested-output item this becomes (or null for items not used in production)
   - And maybe `finishedGoodsAccountId` — for output items, the FG account to debit when this item is harvested

B. **New `production_item_finance_ext` collection** — sibling to
   `sale_item_finance_ext`. Keeps the sales-side schema clean. Pros: each
   ext table maps cleanly to one workflow. Cons: two ext tables to keep
   in sync; an item that's both sellable and producible needs both rows.

**Recommendation: A (extend `sale_item_finance_ext`).** Single ext table
per item; mode-specific fields are nullable. The Sales Items Config page
already exists; it gets a few more fields when an item is marked
producible. Avoids the duplicate-row problem of B.

---

## 5. Schema additions

### New collections

**`block_wip`** (Mongo, ops side):
```
{
  _id: ObjectId,
  blockId: string (FK to blocks),
  organizationId: string,
  balance: Decimal,         // running WIP balance, AED
  status: "open" | "closed",
  cycleStartedAt: datetime,
  cycleClosedAt: datetime | null,
  movements: [
    { timestamp, amount, type: "input_issued" | "harvest_allocated" | "variance", refId }
  ]
}
```
One row per block per growing cycle. When the block is replanted, a new
cycle starts. WIP balance never goes negative; final close-out moves any
remainder to Production Variance.

**`production_routing`** (Mongo, ops side):
```
{
  _id: ObjectId,
  organizationId: string,
  inputItemId: string,      // e.g., TOM-SEED
  outputItemId: string,     // e.g., TOM-RED
  yieldRatio: Decimal,      // expected output kg per input kg
  isActive: boolean
}
```
The "recipe" linking inputs to outputs. Multiple inputs per output is
allowed (one routing row per input-output pair).

**`items`** (Mongo, ops side):
```
{
  _id: ObjectId,
  itemId: string (UUID),
  itemCode: string,
  itemName: string,
  organizationId: string,
  uom: string,
  isInputItem: boolean,
  isOutputItem: boolean,
  isSellable: boolean,
  expectedYieldPerKg: Decimal | null,   // for output items
  notes: string,
  isActive: boolean,
  createdAt, createdBy, updatedAt, updatedBy
}
```
The items master that's been missing. Wave 5 needs it for production
routing to point at; it's also the natural home for sales-side item
config to point at instead of denormalising.

### Modifications to existing collections

**`blocks`** — add:
```
expectedYield: Decimal | null,        // kg expected this cycle
currentCycleStartedAt: datetime,
currentCycleStatus: "planted" | "growing" | "harvesting" | "harvested" | "closed",
plannedOutputItemId: string | null    // FK to items
```

**`inventory_input`** — already has cost; verify the cost is moving-avg
sourced from `inventory_balances` at input-issue time.

**`inventory_movements`** — extend `movementType` enum to include:
`input_issued`, `harvest`, `waste`, `variance_writeoff`.

**`inventory_balances`** — schema unchanged; new rows are added for
output items as harvests occur.

**`sale_item_finance_ext`** (per Decision 6) — add:
```
isProductionInput: boolean,
isProductionOutput: boolean,
finishedGoodsAccountId: UUID | null,   // for output items
productionLossAccountId: UUID | null,  // for output items (waste destination)
```

**`company_posting_setup`** — add:
```
workInProgressAccountId: UUID,
finishedGoodsDefaultAccountId: UUID,
productionVarianceAccountId: UUID,
productionLossAccountId: UUID
```

### New event types (finance outbox + contracts)

| Event | Emitter | GL effect | Payload |
|-------|---------|-----------|---------|
| `input_issued` | farm_manager | Dr WIP / Cr Raw Materials | blockId, itemId, quantity, unitCost, totalCost, organizationId, companyCode |
| `harvest_recorded` | farm_manager | Dr Finished Goods / Cr WIP | blockId, itemId, quantity, allocatedUnitCost, totalCostAllocated, organizationId, companyCode |
| `waste_recorded` | farm_manager | Dr Production Loss / Cr Finished Goods | itemId, quantity, unitCost, totalCost, reason, organizationId, companyCode |
| `wip_writeoff` | farm_manager | Dr Production Variance / Cr WIP (or reverse) | blockId, amount (signed: + = WIP remainder to expense; - = under-allocated, cost back to WIP), organizationId, companyCode |
| `input_issued_cancelled` | farm_manager | reverses `input_issued` | original event ref |
| `harvest_cancelled` | farm_manager | reverses `harvest_recorded` | original event ref |

Each event payload follows the existing Wave 3 contract style
(`contracts/finance_events.py`); add new Pydantic payload classes there.
Finance microservice gets new event handlers in
`services/finance/src/finance/api/v1/events.py` paired with each event
type.

---

## 6. Implementation phases

Each phase has its own task ID once the design is signed off. Phases are
sequenced so each delivers a working slice; the MVP (Phase 1) makes the
Sales chain mechanically correct even before per-block costing is
implemented.

### Phase 5.0 — Items master + production routing (foundation)

**Why first:** every Wave 5 phase references an `items` master that
doesn't exist today. Build it before anything else.

- New `items` Mongo collection + CRUD endpoints
- Items master admin page (extends T-200.9's Sales Items Config OR replaces it)
- New `production_routing` collection + admin page
- Seed the existing TOM-SEED + the implied TOM-RED output as a worked example
- No GL events yet

**Acceptance:** items master populated; routing for TOM-SEED → TOM-RED
exists; Sales Items Config now reads from `items` rather than denormalising.

**Estimate:** 2-3 task cycles.

### Phase 5.1 — Bridge harvest to sellable inventory (mechanical MVP)

**Why second:** unblocks the Sales chain. After this phase, harvested
items appear in `inventory_balances` with `avgCost: 0` (real cost flows
in Phase 5.3). The Delivery / Return chain mechanically works against
harvested items; the JE accounts are correct; the amounts are still zero
until cost flows.

- Wire `block_harvests` insert to emit `inventory_movements` row + upsert
  `inventory_balances` for the harvested item
- Wire `inventory_input` insert to emit `inventory_movements` row +
  decrement `inventory_balances` for the input item
- No finance event yet; no WIP yet
- Smoke test: create a `block_harvests` row, watch `inventory_balances`
  for TOM-RED get a row at zero cost

**Acceptance:** end-to-end Delivery against TOM-RED works mechanically;
JE is `Dr COGS 0 / Cr FG 0`; structure correct.

**Estimate:** 2-3 task cycles.

### Phase 5.2 — Per-block WIP tracking

**Why third:** introduces the WIP balance that Phase 5.3 will draw from
on harvest. No finance events yet; just internal cost tracking.

- New `block_wip` collection
- `inventory_input` write logic also appends to the block's WIP
  movements + updates running balance
- Block detail page (in farm_manager UI) gains a "Running cost: AED X
  / X kg expected = Y/kg" card
- No finance events

**Acceptance:** issuing inputs to Block 42 visibly increases its WIP
balance on the Block detail page; the WIP balance is correct in MongoDB.

**Estimate:** 2-3 task cycles.

### Phase 5.3 — Cost transfer on harvest

**Why fourth:** activates the GL postings — this is the phase where the
abstract "production cost accounting" actually starts moving money in
the books.

- Wire `block_harvests` insert to:
  1. Read the block's WIP balance + expected yield
  2. Compute `allocatedUnitCost = (wip / expected_remaining_qty)`
  3. Stamp the inventory_movements row with that unitCost
  4. Upsert inventory_balances with the new avgCost
  5. Decrement block_wip by `allocatedUnitCost * harvest_qty`
- Finance handlers for `input_issued` + `harvest_recorded` events
- New GL accounts seeded via Alembic migration (Decision 5)
- Posting Setup UI extended with the 4 new account fields

**Acceptance:** post a fresh end-to-end TOM-SEED issuance → harvest →
Delivery; verify Delivery's COGS lineCogs is non-zero and matches the
allocated unit cost.

**Estimate:** 2 task cycles.

### Phase 5.4 — Loss / waste accounting + variance close

**Why fifth:** closes the lifecycle. Wave 5 isn't done until the cycle
can be closed and any remainder accounted for.

- Wire `inventory_waste` insert to emit `waste_recorded` event
- Finance handler posts `Dr Production Loss / Cr Finished Goods`
- New block lifecycle action: "Close cycle" — writes off remaining WIP
  to Production Variance, marks `block_wip.status = closed`
- Block detail page surfaces "Close cycle" action; warns on remaining
  WIP > tolerance

**Acceptance:** record a waste event against TOM-RED; verify
Production Loss account debits; close Block 42's cycle with AED 10
remainder; verify Production Variance debits.

**Estimate:** 2 task cycles.

### Phase 5.5 — Block profitability report + sales correctness verification

**Why sixth:** new reports that exercise the data Wave 5 creates.
Closes the loop with management-visible information.

- New report endpoint: `GET /api/v1/farm/reports/block-profitability`
  returning per-block revenue (from sales of items where
  `blockOfOrigin == :blockId`), accumulated WIP at cycle close, and
  net contribution margin
- New UI page mirroring AR Aging style: filter by date range, block,
  crop; sortable table; CSV export
- End-to-end smoke covering a complete cycle: planting → inputs → 3
  harvests → sales → block close → report shows profitability

**Acceptance:** Block 42 shows revenue, cost, and margin numbers in the
report after a fully-cycled smoke run.

**Estimate:** 1-2 task cycles.

### Total

**Estimated ~12-13 task cycles** for all of Wave 5, with each phase
shippable independently. Phases 5.0 → 5.1 → 5.2 → 5.3 is the critical
path to "real COGS amounts on sales JEs." Phases 5.4 and 5.5 are
follow-on value once the foundation is in place.

---

## 7. Open questions for the user

These are not yet settled by the recommendations above; flagging
explicitly so they can be decided before Phase 5.0 starts.

**Q1 — Decision 1 confirmation.** Do you want separate items per role
(my recommendation A) or single items with dual flags (option B)? This
shapes the entire items master design.

**Q2 — Decision 2 confirmation.** Block-as-warehouse hybrid (my
recommendation C) or fully model blocks as locations (B)?

**Q3 — Decision 3 confirmation.** Proportional with expected yield (my
recommendation A) or full standard costing (C)? Standard costing is
more rigorous but adds a "standard cost per crop" master to maintain.

**Q4 — Multi-input recipe complexity.** A block typically consumes
multiple input types (seeds AND fertilizer AND pesticide AND water,
etc.). Do you want all of those tracked individually as inputs to the
block's WIP, or a simplified "primary input" model where only seeds
matter and other inputs are expense-immediate?

**Q5 — Capital and labor.** Wave 5 as scoped covers raw materials only.
Block 42's WIP doesn't include the depreciation on the irrigation
system or the labor cost of the field workers. Should Wave 5 extend
to include those, or leave them as a separate Wave 6 ("Capital and
Labor Allocation")?

**Q6 — Cycle definition.** What "ends a cycle" for a block? A user
explicitly clicking "Close cycle"? An automatic trigger on a planting
date threshold? An end-of-month rollover for perennial crops? The
answer affects when variances post.

**Q7 — Block transfers.** If a farm physically moves harvested product
from Block 42 to a central storage area (or to another block for
further processing), does that count as a stock movement (with GL
implication: Dr Cold Storage / Cr Block 42 Inventory) or just a
non-GL location update? SAP B1 supports both — needs a tenant-level
policy decision.

**Q8 — How aggressive on the items master rebuild?** Today T-200.9's
"Sales Items Config" page reads denormalised data from
`sale_item_finance_ext`. Phase 5.0 introduces a real `items` master.
Should Phase 5.0 also retire the denormalisation (re-fetching from
items in every sales document write), or leave the denormalisation
in place and just sync the items master alongside? Smaller scope; less
risk of accidentally regressing sales doc consistency.

---

## 8. Risks and edge cases

- **Existing data**: 13,942 `block_harvests` rows exist with no cost data
  attached. Phase 5.1 should NOT backfill these — they pre-date the
  cost-accounting system. Only NEW harvests get the bridge treatment.
  Document this clearly so the farm team doesn't expect historical
  data to populate inventory_balances retroactively.

- **Empty `inventory_balances` for inputs**: many input items today
  (FERT-NPK, etc.) have never had a GR receipt either. Phase 5.0 needs
  to either seed initial inventory_balances rows for these inputs at
  a manual "opening cost" OR require that all inputs come through
  purchasing's GR before they can be issued to a block. The latter is
  cleaner but blocks Phase 5.2 on customer workflow.

- **Concurrent harvests**: two harvests recorded in quick succession
  against the same block could race on the `block_wip.balance` update.
  Use Mongo's `findOneAndUpdate` with `$inc` for atomic updates; do not
  read-modify-write.

- **Currency**: Wave 5 assumes single-currency operations (the existing
  Wave 3 already supports multi-currency on sales documents). Inputs
  and outputs of a block are typically in the same currency (AED for a
  UAE farm) so this is not a near-term concern; flag for Wave 6+.

- **Period close interaction**: closing a fiscal period today blocks
  manual JE posting in that period. Wave 5 events post automatically
  — what happens if an `input_issued` event fires with a timestamp in
  a closed period? Two options: (a) reject the event back to the
  outbox with a permanent error, (b) post into the next open period.
  Mirror whatever the existing Wave 3 handlers do.

- **Multi-tenant: WIP balances must not leak across orgs**. Every new
  collection's queries must filter by `organizationId`. Verify in code
  review of every Phase.

---

## 9. References

- `Docs/4-Finance-Mod-docs/Document-Conventions.md` — shared document
  chain contract (DocEntry/DocNum split, base/target linking, status
  flow). Wave 5 doesn't add new documents but follows the same event
  + outbox pattern.
- `Docs/4-Finance-Mod-docs/SALES_PM_REPORT.docx` — Wave 3 Phase 2
  status report. The "Known Gaps" section calls out the production
  cost gap that this design closes.
- `Docs/4-Finance-Mod-docs/SALES_USER_GUIDE.docx` — accountant tutorial.
  Will need a Phase 5.5 addendum covering the new block-profitability
  report.
- `Docs/4-Finance-Mod-docs/FINANCE_PM_REPORT_POST_D.docx` — prior PM
  report style guide; this design doc follows the same voice.
- `Docs/Backlog/BACKLOG.md` — T-500 entry; this design doc is the
  detailed expansion of that one-paragraph summary.
- `contracts/finance_events.py` — Wave 3 event contracts; Wave 5 adds
  the new event types listed in Section 5.
- `src/modules/sales/services/delivery_service.py` — the `_get_unit_cost`
  function that reads `inventory_balances`. Wave 5 makes its return
  value non-zero for harvested items.

---

## 10. What signing off this design means

Once you've reviewed Sections 4 (the six design decisions) and 7 (open
questions), tell me your choices on each. I'll lock them into a
`WAVE_5_DECISIONS.md` companion doc (or amend this one) and Phase 5.0
gets dispatched as the first task. Until then, no implementation work
starts on Wave 5.

If a decision is "go with your recommendation" for all six, say so and
I'll proceed with the defaults captured above.

If you want to push back on any of the recommendations, let me know
which one and what you'd prefer; we'll iterate before locking.
