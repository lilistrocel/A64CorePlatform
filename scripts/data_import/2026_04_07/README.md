# Supabase 2026-04-07 Data Import

Re-import all non-PC Farm data from Supabase CSV dumps + reconcile with Excel
sales/purchase data. Run stages in order, verifying in the UI between each stage.

## Prerequisites

```bash
pip install pymongo openpyxl
```

MongoDB must be accessible at `mongodb://localhost:27017` from the host
(not inside Docker — port 27017 is already exposed).

## Source data

| File | Description |
|------|-------------|
| `OldData/7-April-2026/supabase_data_latest_040726/*.csv` | Supabase exports |
| `OldData/7-April-2026/Sales Reports - 02-04-2026 Aug25-July26.xlsx` | Sales Analysis (sheet: Sales Analysis, header row 3) |
| `OldData/7-April-2026/Purchase Register 2025-2026.xlsx` | Tally purchase data (2 sheets) |

## Run from project root

Always run from the repository root:

```bash
cd /home/noobcity/Code/A64CorePlatform
```

## Stage execution order

### Stage 2 — Farms and physical blocks

Imports 7 farms (F011–F017) and 274 physical blocks.

```bash
python scripts/data_import/2026_04_07/stage2_farms_blocks.py
```

**UI verification before proceeding:**
- Navigate to Farm Manager → should see 7 new farms listed (Liwa, Al Ain, Al Khazana, etc.)
- Each farm should have its physical blocks visible (e.g. Liwa has 69 blocks)
- PC Farm (F010) must be UNTOUCHED

---

### Stage 3 — Cycles, archives, harvests

**STOP: Read this before running.**

Stage 3 will FAIL if any crop name in the Supabase data does not exist in
`plant_data_enhanced`. The dry-run already detected 1 unmatched crop:

```
Lettuce - Phase 1 (5cm)
```

**You must decide what to do with this crop before running stage 3:**
- Option A: Add a `plant_data_enhanced` entry with `plantName = "Lettuce - Phase 1 (5cm)"`
- Option B: Manually map it to an existing crop (e.g. "Lettuce - Romaine") by editing
  `block_history_rows.csv` or `farm_block_rows.csv` (NOT recommended — corrupts source data)
- Option C: Skip blocks that reference this crop (edit stage3 to treat it as a warning not error)

After resolving, run:

```bash
python scripts/data_import/2026_04_07/stage3_cycles_harvests.py
```

This stage processes:
- 1,222 completed cycles → `block_archives` + `block_harvests` on parent physical block
- 230 active cycles → virtual `blocks` + `block_harvests` on virtual block UUID
- Updates parent physical block KPIs, virtualBlockCounter, childBlockIds, availableArea

**UI verification before proceeding:**
- Farm blocks should show state="partial" for blocks with active virtual cycles
- Block detail → Archives tab should show historical cycles
- Block detail → Harvests tab should show harvest records
- KPI numbers should be non-zero for blocks that had harvests

---

### Stage 4 — Customers, vehicles, sales orders

```bash
python scripts/data_import/2026_04_07/stage4_clients_vehicles_orders.py
```

Imports:
- 19 customers → `customers` collection
- 11 vehicles → `vehicles` collection
- 4,176 sales orders → `sales_orders` collection
- 11,007 order lines → `sales_order_lines` collection (NEW)

**UI verification before proceeding:**
- CRM → Customers should show 19 imported companies
- Logistics → Vehicles should show 11 vehicles (CANTER, HINO, TOYOTA HIACE)
- Sales → Orders should show imported orders with correct customer/farm associations

---

### Stage 5 — Sales Excel reconciliation

```bash
python scripts/data_import/2026_04_07/stage5_sales_excel.py
```

Reads `Sales Analysis` sheet (5,626 data rows) and:
- Matches Excel rows to supabase order lines by (date, customer, crop, grade)
- Matched → enriches `sales_order_lines.excel_data` with actual prices, VAT, payment status
- Unmatched → inserts into `sales_unmatched` + creates synthetic `sales_orders`
- Best-effort inventory source → block UUID matching (20 sources currently unmatched —
  see `logs/stage5_unmatched_inventory.txt` for details)

**Note:** All 5,626 Excel rows will be "unmatched" on first run because stage 4's
order lines use supabase delivery dates while the Excel uses packed dates.
The match key is (date_day, customer_name, crop_name, grade) — these will align
after you verify the date format. If match rates are very low, check
`logs/stage5_*.log` for the normalized keys being compared.

**UI verification before proceeding:**
- Sales orders should now have payment status and invoice status populated
- Check a few orders manually in the UI

---

### Stage 6 — Purchase register

```bash
python scripts/data_import/2026_04_07/stage6_purchase_register.py
```

Parses both Excel sheets (AGRI NOVA + AL SAMARAT, treated as one buyer entity):
- 41 vouchers from AGRI NOVA, 89 vouchers from AL SAMARAT = 130 total
- 401 total line items → `purchase_register` collection (NEW)
- Best-effort crop mapping on item names (e.g. "Seeds # Cucumber" → Cucumber)

**UI verification:** This is backend-only data; no UI view exists yet.
Verify with:

```bash
docker exec a64core-mongodb-dev mongosh --eval "db.purchase_register.countDocuments()" a64core_db --quiet
# Expected: ~130
```

---

### Stage 7 — Finalize

```bash
python scripts/data_import/2026_04_07/stage7_finalize.py
```

- Creates `farm_assignments` for `admin@a64platform.com` across all 8 farms
- Rebuilds `financial_summary` collection with revenue/cost/margin by (farm, crop, yearMonth)

**UI verification before proceeding:**
- Farm Manager → all farms should be accessible by the admin user
- Financial summary should be populated (backend query):

```bash
docker exec a64core-mongodb-dev mongosh --eval "db.financial_summary.countDocuments()" a64core_db --quiet
```

---

## Re-running a stage (idempotency)

Every stage uses `--reset` to safely delete its migration-tagged data and reimport:

```bash
python scripts/data_import/2026_04_07/stage2_farms_blocks.py --reset
python scripts/data_import/2026_04_07/stage3_cycles_harvests.py --reset
python scripts/data_import/2026_04_07/stage4_clients_vehicles_orders.py --reset
python scripts/data_import/2026_04_07/stage5_sales_excel.py --reset
python scripts/data_import/2026_04_07/stage6_purchase_register.py --reset
python scripts/data_import/2026_04_07/stage7_finalize.py --reset
```

`--reset` only deletes documents tagged `metadata.migratedFrom = "supabase_2026_04_07"`.
PC Farm data is never tagged and will never be touched.

## Dry-run (no writes)

```bash
python scripts/data_import/2026_04_07/stage2_farms_blocks.py --dry-run
```

All stages support `--dry-run`. Dry-run reads all source data and computes
everything but does not write to MongoDB.

## Log files

Each run writes a timestamped log to:
```
scripts/data_import/2026_04_07/logs/stageN_YYYYMMDD_HHMMSS.log
```

Summary table printed at the end of each stage shows:
- Rows read
- Rows inserted
- Rows updated
- Rows skipped
- Rows errored (with sample error messages)

## New collections created by this import

| Collection | Stage | Description |
|------------|-------|-------------|
| `sales_order_lines` | Stage 4 | Individual order line items from supabase |
| `sales_unmatched` | Stage 5 | Excel rows with no supabase order match |
| `purchase_register` | Stage 6 | Purchase vouchers from Tally register |
| `financial_summary` | Stage 7 | Aggregated revenue/cost/margin by farm-crop-month |

**CodeMaps require regeneration** after a full import due to these new collections.

## Key constants

```python
PC_FARM_UUID = "23d67318-415e-49bf-a2b6-515b38974bde"  # NEVER TOUCH
MIGRATION_TAG = "supabase_2026_04_07"
New farms: F011 (Liwa) through F017 (New Hydroponic)
```

## Farm assignment

| Code | Farm Name |
|------|-----------|
| F010 | PC Farm (existing, untouched) |
| F011 | Liwa |
| F012 | Asharij-Television Farm |
| F013 | Silal Upgrade Farm |
| F014 | Al Wagen |
| F015 | Al Ain |
| F016 | Al Khazana |
| F017 | New Hydroponic |
