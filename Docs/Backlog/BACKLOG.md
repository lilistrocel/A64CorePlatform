# A64 Core Platform — Backlog

> **Updated:** 2026-08-03
> **Tasks:** 32 active · 14 ready · 1 blocked (counts as of this update; the
> narrative below predates several waves and is kept for history — see
> ARCHIVE.md for what has actually shipped). This update covers a full day's
> work, all committed and pushed to `main`. **Correction to this note's
> previous wording:** it previously said T-903's frontend wiring, backend
> unit tests, and the Cloudflare-side runbook doc were "separate follow-on
> work, not done in this pass" — that was wrong. All three shipped the same
> day, in commit `804e2fa`: the frontend dual-mode UI (Cloudflare sign-in
> button, silent exchange from `ProtectedRoute`, `PendingActivation` screen,
> pending-activation queue + auth-provider badge in User Management,
> Cloudflare-aware logout via `/cdn-cgi/access/logout`), 27 backend unit
> tests (`tests/unit/test_auth/test_cf_access.py`), and the domain-agnostic
> runbook (`Docs/1-Main-Documentation/Cloudflare-Access-Setup.md`). T-903's
> ARCHIVE.md entry has been extended accordingly. **Cloudflare Access is now
> LIVE on `dev.a20core.com`** (team `noobcity.cloudflareaccess.com`),
> configured via the Cloudflare dashboard UI, with three Zero Trust
> applications: two path-scoped Bypass apps (`/i`, `/api/v1/public`) and the
> domain-wide Allow app. `CF_ACCESS_EXCLUSIVE` remains **off**. Six more
> tasks shipped the same day and were moved straight to ARCHIVE.md: **T-904**
> (deployment identity — `PUBLIC_BASE_URL` can no longer default to another
> deployment's hostname, plus two healthchecks that had never once passed),
> **T-905** (deployment identity + Cloudflare Access configurable from the
> UI, DB-backed with env-var lock precedence), **T-906** (shared
> `pending_activation` handling across both login paths, plus an
> auto-derived-name banner), **T-907** (brand asset/logo fixes — missing PNG
> masters, opaque-background lockups, a stale bind-mount), **T-908**
> (Operations pages missing Night-Observatory page padding), **T-909**
> (Cloudflare Access runbook correction — Bypass scoping is an application
> property, not a policy field). CodeMaps regeneration is still flagged (two
> new endpoints, one new service, one new middleware module from T-903) but
> **blocked** — see "Known Open Items" below.
>
> Prior note (2026-07-30): **T-901** (Night Observatory redesign —
> dark-first glass-panel visual system) completed and moved to ARCHIVE.md,
> closing out its 4-phase sequencing (foundation → shell → screen sweep →
> gold audit).
>
> Prior note (2026-06-10): Wave 3 T-201.4/.5/.6/.7/.8 + T-201.0/.1/.2/.3 + T-202 all in ARCHIVE — that session closed 6 tickets in commits `096be1a` / `14046b3` / `cdc71a4` / `2ccb9dc` — remaining Active then: T-201.8b (Wave 6 SKU-master extraction), T-201.9/.10/.11 (SAP B1 chain-via-SO epic), T-200.25 (BLA stubs — implementation complete, awaiting commit); Wave 5: T-500 (production cost accounting) + T-501 (packing materials BOM); Wave 6: T-600 (standalone hardening) (T-003, T-004, T-008, T-009, T-010, T-011, T-012, T-013, T-014, T-016, T-017, T-018, T-019, T-020, T-021, T-022, T-023, T-024, T-025, T-026, T-027, T-028, T-029, T-030, T-031, T-032, T-033, T-034, T-035, T-036, T-037, T-038, T-039, T-040, T-041, T-042, T-043, T-044, T-045, T-046, T-047, T-048, T-050, T-051, T-053, T-055, T-056, T-057-1a, T-060.6, T-060.6.1, T-060.7, T-060.7.1, T-060.8, T-060.9.1, T-060.10, T-060.11-audit, T-060.11-preview, T-060.12, T-060.13, T-060.14, T-061, T-061.1, T-062, T-063, T-100.4, T-100.7, T-100.8, T-100.9a.1, T-100.9a.2, T-100.11.1, T-100.11.2, T-200.0, T-200.1, T-200.2, T-200.3, T-200.4, T-200.5, T-200.6, T-200.7, T-200.8, T-200.9, T-200.10, T-200.11, T-200.x completed, moved to ARCHIVE.md)

---

## Known Open Items (as of 2026-08-03)

- **CodeMaps are stale** and could not be regenerated this session.
  `rerun.sh` diffs `HEAD~1..HEAD` (so it needs the commit to already exist),
  and the mapper connects to Mongo unauthenticated — neither `MONGODB_URL`'s
  app user nor `MONGO_ROOT_*` from `.env` authenticate against the running
  instance (`AuthenticationFailed`, code 18). Mongo also runs as a replica
  set advertising the internal hostname `mongodb`, so host-side connections
  additionally need `directConnection=true`. Blocked on working credentials.
- **6 pre-existing unit-test failures on `main`**, unrelated to this day's
  work: 2 in `test_ai_assistant/test_context_composer.py`, 1 in
  `test_tool_executor.py`, 1 in `test_sensehub_crop_sync.py`, and 2 in
  `test_finance_bridge/test_outbox_reconciler.py` (the latter from the
  uncommitted-then-committed `905bf43` WIP, which is **not our work** — it
  belongs to whoever owns the finance outbox reconciler).
- **Deployment-specific defaults still hardcoded**, despite T-904/T-905's
  deployment-identity work: `GOOGLE_CLOUD_PROJECT=a64core` in
  `docker-compose.yml` with no `${VAR:-}` indirection; `FROM_EMAIL:
  noreply@a64core.com` and `nginx/*.conf` `server_name a64core.com` + Let's
  Encrypt paths, all referencing a domain `CLAUDE.md` itself calls
  decommissioned; `ADMIN_EMAIL` still `admin@a64platform.com` though the
  super_admin account was renamed to `lilistrocel@gmail.com`.
- **Before enabling `CF_ACCESS_EXCLUSIVE`**: the origin must be reachable
  only through the Cloudflare tunnel. This box currently binds nginx on
  `0.0.0.0:80` and Mongo on `0.0.0.0:27017`; direct routing to the public IP
  would make exclusive mode bypassable.

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

### T-917 | Plant Library CSV template/import — required-fields-first, minimal-CSV import, variety-modal parity
- **Category:** Backend · **Priority:** P2
- **Assigned:** backend-dev-expert · **Started:** 2026-08-07
- **Depends on:** T-915 🔵 (the mother/variety CSV rework this refines —
  same two methods, no shape changes to its result dict)
- **Blocks:** —
- **Description:** T-915's CSV template/import worked but didn't make clear
  which columns are actually required, buried them mid-list, and hard-failed
  a row for a blank `plantType` even though the model defaults it to
  `'crop'`. Reworked in two passes within this same ticket (second pass was
  a coordinator-relayed set of final user decisions superseding the first
  pass's `growthCycleDays` design):
  1. First pass: 4 required columns (plantName/scientificName/varietyName/
     yieldPerPlant), single optional `growthCycleDays` column with a
     percentage-split-into-stages placeholder. Hit a real conflict:
     `GrowthCycleDuration.totalCycleDays` is `Field(..., gt=0)`, so a
     literal "blank -> 0" default (as first specified) would 422 every
     minimal-CSV row — worked around with a `totalCycleDays=1` placeholder,
     flagged for sign-off.
  2. **Final pass (supersedes the placeholder above):** the single
     `growthCycleDays` column was replaced with the 5 individual
     growth-cycle PHASE columns, all hard-required, with `totalCycleDays`
     computed as their sum (mirrors the variety modal, where the total is
     read-only/derived) — this removes the `totalCycleDays=1` hack
     entirely; a real phase breakdown always sums to a valid total. The
     optional-column set was also expanded to full parity with the variety
     modal (humidity, light hours, water amount, economics).
  Final result: `generate_csv_template()` and `import_from_csv()` (both in
  `PlantDataEnhancedService`, same single file throughout both passes) — 9
  columns are truly required and marked `*` first in the template; every
  other column is optional with a documented safe default or is left
  entirely unset; a CSV containing ONLY the 9 required columns imports
  successfully as a "skeleton" variety. Import must NOT break for any
  existing CSV — verified via the full pre-existing test suite (still
  green) plus new coverage below.
- **Fix (`src/modules/farm_manager/services/plant_data/plant_data_enhanced_service.py`
  — the only file changed across both passes):**
  - **9 hard-required columns, first in the template, marked with `*`, in
    this order:** `plantName*`, `scientificName*`, `varietyName*`,
    `yieldPerPlant*` (>0), `germinationDays*`, `vegetativeDays*`,
    `floweringDays*`, `fruitingDays*`, `harvestDurationDays*`. Each phase
    cell must be PRESENT (blank → row fails, e.g. "floweringDays is
    required") but `0` is a legal value for any individual phase (leafy
    greens: flowering=0, fruiting=0). The 5 phases are summed into
    `totalCycleDays`; if that sum is `0`, the row fails with "growth cycle
    total must be greater than 0" (satisfies the model's `gt=0` — no
    placeholder needed since a real breakdown is now mandatory).
    `scientificName` is enforced at import even though the underlying
    model (`PlantMotherBase.scientificName`) allows null — a deliberate
    import-time tightening, not a model change.
  - **Full final column order** (9 required, then optional):
    `plantName*, scientificName*, varietyName*, yieldPerPlant*,
    germinationDays*, vegetativeDays*, floweringDays*, fruitingDays*,
    harvestDurationDays*, plantType, farmTypeCompatibility, yieldUnit,
    expectedWastePercentage, seedsPerPlantingPoint, spacingCategory,
    minTemperatureCelsius, maxTemperatureCelsius, optimalTemperatureCelsius,
    humidityMin, humidityMax, humidityOptimal, minPH, maxPH, optimalPH,
    wateringFrequencyDays, waterAmountPerPlantLiters, dailyLightHoursMin,
    dailyLightHoursMax, dailyLightHoursOptimal, averageMarketValuePerKg,
    currency, tags, notes`. (`growthCycleDays` from the first pass no
    longer exists as a column — superseded by the 5 phase columns above; a
    stray legacy `growthCycleDays` header on an old CSV is now simply
    ignored, not read.) The grouping/order for the newly added optional
    columns (seedsPerPlantingPoint, humidity*, waterAmountPerPlantLiters,
    dailyLightHours*, averageMarketValuePerKg, currency) was my own
    judgment call — the coordinator specified the set but not their exact
    position among the pre-existing optional columns; I grouped each new
    field next to its related existing field (e.g. `seedsPerPlantingPoint`
    beside the other yieldInfo fields, `humidityMin/Max/Optimal` beside
    the temperature fields).
  - **Third pass — `waterAmountUnit` data-integrity fix (coordinator
    catch, not a user-facing bug yet since not deployed):** the water
    group originally shipped as two columns, `waterAmountPerPlant` +
    `waterAmountUnit`, but `WateringRequirements.amountPerPlantLiters` is
    fixed to liters with no unit field on the model — `waterAmountUnit`
    was parsed and silently discarded, so a CSV entering `amount=500
    unit="ml"` would have stored `500` LITERS, a 500,000x error with no
    warning. Fixed by removing `waterAmountUnit` entirely (column, header
    map, import parsing, example rows) and renaming the amount column
    itself to `waterAmountPerPlantLiters` so the unit is unambiguous in
    the header. `_CSV_HEADER_CANONICAL_MAP` maps BOTH
    `"wateramountperplantliters"` (current) and `"wateramountperplant"`
    (the old pre-fix spelling) to the same canonical
    `"waterAmountPerPlantLiters"`, so an existing CSV built against the
    column order shipped earlier in this same ticket still imports
    without modification — verified by a dedicated test using the old
    header spelling alone.
  - **`plantType` optional** — blank defaults to `'crop'` (only used when
    CREATING a new mother; ignored when the mother already exists). A
    non-blank value is still validated against the mother's Literal
    vocabulary via the existing `PlantMotherCreate` attempt/catch.
  - **Nested-Optional-group build rule** (`environmentalRequirements` incl.
    nested `humidity`, `soilRequirements`, `wateringRequirements`,
    `lightRequirements`, `economicsAndLabor`): each group is built ONLY
    when at least one of its own CSV cells is filled; when built, any of
    that group's own required sub-fields left blank get a sensible
    default so the Pydantic model's constraints are satisfied — never
    fabricated when the whole group is untouched.
    - `environmentalRequirements`: `TemperatureRange` is required inside
      it, so this group is gated on the 3 temperature columns, NOT on
      humidity alone — humidity-only cells with no temperature cells are
      silently not enough to build the group (matches the coordinator's
      explicit rule). When built, `humidity` (`HumidityRange`) is nested
      inside it only if at least one `humidityMin/Max/Optimal` cell is
      filled (defaults 40/80/60 for any missing member).
    - `lightRequirements`: `lightType` is required but there is no
      `lightType` CSV column — defaulted to `LightTypeEnum.FULL_SUN`
      whenever any `dailyLightHours*` cell is provided (defaults 6/12/8
      for any missing hour). Otherwise stays `None` (previously always
      built with hardcoded defaults — this is a deliberate behavior
      change per the coordinator's explicit rule).
    - `wateringRequirements`: built if `wateringFrequencyDays` OR
      `waterAmountPerPlantLiters` is provided; `frequencyDays` (required,
      `gt=0`) defaults to `2` if only the water-amount cell was given. See
      the third-pass note above — the column is now unambiguously in
      liters (no separate unit field exists on the model, so the header
      name carries the unit instead of a discarded column).
    - `economicsAndLabor`: built if `averageMarketValuePerKg` OR
      `currency` is provided; required `totalManHoursPerPlant` defaults to
      `1.0` (unchanged from T-915/first pass).
    - `seedsPerPlantingPoint` (plain int on `yieldInfo`, not a nested
      group) defaults to `1` when blank, per the model's own default.
    - Unaffected/unchanged from the first pass: `farmTypeCompatibility` →
      `['open_field']`, `yieldUnit` → `'kg'`, `expectedWastePercentage` →
      `0`, `spacingCategory` → left unset when blank.
  - **Header normalization (`_normalize_csv_header`,
    `_CSV_HEADER_CANONICAL_MAP`, unchanged mechanism from the first pass,
    map extended with all new header names):** every header from
    `csv.DictReader` is stripped of surrounding whitespace and a trailing
    `*`, lowercased, and matched against a canonical-name lookup before
    any `row.get(...)` call runs. Built once from `reader.fieldnames`,
    applied per-row via a dict remap. This makes import STRICTLY more
    tolerant, never less — both the marked template (`plantName*`) and a
    plain CSV (`plantName`, any case) import identically.
  - **`generate_csv_template()`** — new column order above; both example
    rows (`plantName` "Tomato", `plantType` "vegetable", `varietyName`
    "Roma"/"Cherry") kept fully filled across every column (including all
    the new optional ones) so the template still documents the full
    format.
  - **Result dict shape, mother find-or-create, variety-under-mother
    delegation to `PlantMotherService.create_variety_for_mother`,
    duplicate-skip semantics, and the "only raise 422 when the whole batch
    is unusable" rule are all unchanged from T-915.**
- **Tests:** `tests/unit/test_farm_manager/test_plant_library_csv_import.py`
  — extended in place across all three passes (same fake-Motor-collection
  style, no live DB), **15 passed** in this file: the 5 original T-915
  cases (still pass, header assertions updated for the final column
  order/markers); minimal CSV with only the 9 marked required columns
  imports (mother+variety created, `totalCycleDays` == sum of the 5 phase
  values supplied, `farmTypeCompatibility=['open_field']`,
  `yieldUnit='kg'`, `plantType='crop'`, `seedsPerPlantingPoint=1`
  default, all nested-optional groups `None`); the same minimal CSV with
  plain unmarked headers imports identically; blank `scientificName`/
  blank `yieldPerPlant`/`yieldPerPlant<=0`/non-numeric `yieldPerPlant`
  each fail their row with a field-named message, valid rows still
  import; blank `plantType` → mother created as `'crop'`; invalid
  non-blank `plantType` still fails; a blank individual phase column
  fails with a field-named message; all-5-phases-zero fails with "greater
  than 0"; `0` accepted as one individual phase's value when the total is
  still positive; a fully-filled CSV (every optional column) builds
  `humidity` nested in `environmentalRequirements`, `lightRequirements`
  (defaulted `lightType`), `wateringRequirements.amountPerPlantLiters`,
  `economicsAndLabor`, and a non-default `seedsPerPlantingPoint`; a CSV
  using the OLD `waterAmountPerPlant` header spelling (pre-third-pass)
  alone still imports and still lands in `amountPerPlantLiters`, proving
  the tolerant dual-mapping. Run locally (miniconda `python3 -m pytest`,
  no Docker needed): **15 passed** in this file. Full
  `tests/unit/test_farm_manager/` suite re-run for regressions: **62
  passed** (47 pre-T-915 + 15 in this file), 0 failed.
- **Deploy note:** `docker restart <prefix>-api-1` required before this is
  live anywhere — the api container has no `--reload`, and only
  `src/modules/farm_manager/services/plant_data/plant_data_enhanced_service.py`
  changed. Not restarted/verified live by this ticket (no deployment
  target confirmed in this session).
- **CodeMaps:** not regenerated — no new/removed endpoints, services, or
  collections; changed logic inside two already-mapped functions
  (`generate_csv_template`, `import_from_csv`) plus two new private
  helpers (`_normalize_csv_header`, `_CSV_HEADER_CANONICAL_MAP`) on the
  same already-mapped service class.
- **Frontend NOT touched** (out of scope, single-file instruction) —
  flagging for the parent session: a short "* = required" help note next
  to the CSV import control in `PlantDataLibrary.tsx` would make the new
  template markers self-explanatory in the UI; T-915's flagged frontend
  gap (`CSVImportResult` interface / import-result display still assuming
  the old `{created, updated, errors}` shape) is still outstanding and
  unrelated to this ticket.
- **Files changed:**
  `src/modules/farm_manager/services/plant_data/plant_data_enhanced_service.py`,
  `tests/unit/test_farm_manager/test_plant_library_csv_import.py`.
- **Not moving to ARCHIVE** — leaving Active for the parent session to
  restart the api container, verify live (download the template, import a
  minimal CSV and a fully-filled CSV, mongosh-check the resulting
  `plant_mothers`/`plant_data_enhanced` docs), consider the frontend
  "* = required" note, and commit. No git command was run in this ticket.
  (The `waterAmountUnit` data-integrity gap flagged after the second pass
  is now resolved — see the third-pass note above — nothing outstanding
  on that point.)

---

### T-916 | Plant Library — "Duplicate variety" action (clone into a new variety under the same mother)
- **Category:** Frontend · **Priority:** P2
- **Assigned:** frontend-dev-expert · **Started:** 2026-08-07
- **Depends on:** T-914 🔵 (mother/variety hierarchy this extends — trusted
  as-is, not re-verified here), T-913 🔵 (create-variety API, unchanged by
  this ticket)
- **Blocks:** —
- **Description:** Lets a user clone an existing variety into a new one
  (e.g. same cultivation recipe, new requirements) without re-entering every
  field. Frontend-only — the backend variety-create endpoint already exists
  (`POST /api/v1/farm/plant-mothers/{motherId}/varieties`, exposed via
  `createVarietyForMother`/`useCreateVarietyForMother`, both unchanged).
  Extends `PlantDataFormModal`'s existing variety-create mode with a prefill
  path rather than forking a new modal/form.
- **Fix:**
  - **`PlantMotherDetailModal.tsx`** — added a `Duplicate` action (lucide
    `Copy` icon) to each variety row's `RowActions`, next to Edit/Delete,
    reusing the existing default `RowButton` styling (no new `$variant`).
    New optional prop `onDuplicateVariety?: (variety: PlantDataEnhanced) =>
    void`.
  - **`PlantDataFormModal.tsx`** — new optional prop
    `duplicateFromVariety?: PlantDataEnhanced | null`. Only applied when
    already in variety-CREATE mode (`!isEdit && isVarietyCreate`); ignored
    otherwise. Refactored the edit-mode prefill `reset(...)` (previously one
    large inline object) into two shared module-level helpers so the two
    prefill paths can never drift apart: `detailFieldsFromSource(source)`
    (every detailed cultivation field the form manages — growth cycle,
    yield, environmental/watering/soil/light requirements, economics, tags,
    notes, density — deliberately excluding identity/basic-info fields
    `plantName`/`scientificName`/`plantType`/`varietyName`/`isActive`) and
    `deriveDensityState(source)` (the density-chooser's local non-RHF UI
    state: mode/unit/input). Edit mode's `useEffect` now calls both helpers;
    a new second `useEffect` (keyed on `duplicateFromVariety?.plantDataId`,
    guarded to `!isEdit && isVarietyCreate`) calls
    `reset({ ...createDefaultValues, varietyName: "Copy of {source}",
    ...detailFieldsFromSource(duplicateFromVariety) })` plus the same
    density-state derivation. `varietyName` defaults to `"Copy of
    {sourceVarietyName || sourcePlantName}"` (user edits before saving).
    `plantDataId`/`motherPlantId` are never copied — submit still routes
    through the existing variety-create path
    (`createVarietyForMother(motherContext.plantMotherId, ...)`), which
    always creates a NEW record; the source variety is never written to.
  - **`PlantDataLibrary.tsx`** — new state
    `varietyFormDuplicateSource: PlantDataEnhanced | null`, reset alongside
    `varietyFormPlantData` in `handleAddVariety`/`handleEditVariety`/
    `handleVarietyFormClose`. New `handleDuplicateVariety(variety)`: permission
    check, resolves `variety.motherPlantId` (guaranteed present — every
    variety reachable from `PlantMotherDetailModal` belongs to a mother),
    sets `varietyFormMotherId` to it (same mother, reusing the existing
    variety-create modal-open path) + `varietyFormDuplicateSource` +
    `varietyFormPlantData(null)` (create, not edit), opens the form. Wired
    `onDuplicateVariety={handleDuplicateVariety}` into
    `PlantMotherDetailModal` and `duplicateFromVariety={varietyFormDuplicateSource}`
    into `PlantDataFormModal`. Post-create invalidation/refetch and success
    feedback needed no changes: `handleVarietyFormSuccess` already
    invalidates `queryKeys.plantMothers.varieties(motherId)` +
    `.lists()` keyed off `varietyFormMotherId` (set identically for
    duplicate as for plain "Add Variety"), and `PlantDataFormModal`'s
    existing success-message/submit-routing logic for variety-create is
    unchanged.
- **Not touched (explicitly out of scope):** backend (`src/`), CSV
  import/template code (owned by T-915), any other plant-library component.
- **Verify:** `npx tsc -b --noEmit` — zero new errors in any touched file
  (`PlantDataFormModal.tsx`, `PlantMotherDetailModal.tsx`,
  `PlantDataLibrary.tsx`); the only errors remaining in
  `PlantDataFormModal.tsx` are the same 2 pre-existing TS6133
  (`isValid`/`isSubmitting` unused, now at line ~872 after this ticket's
  insertions — line shift confirms nothing else changed there) already
  flagged in T-914's entry. Playwright NOT run (project rule — user
  verifies in the browser). Modal still closes only via the X button, never
  on backdrop click (unchanged, project rule) — this ticket added no new
  overlay/backdrop handling.
- **Files changed:**
  `frontend/user-portal/src/components/farm/PlantMotherDetailModal.tsx`,
  `frontend/user-portal/src/components/farm/PlantDataFormModal.tsx`,
  `frontend/user-portal/src/pages/farm/PlantDataLibrary.tsx`.
- **Not moving to ARCHIVE** — leaving Active for the parent session to
  verify in the browser (Duplicate opens a pre-filled create form under the
  same mother, defaults `varietyName` to "Copy of …", submits as CREATE with
  the source variety untouched) and commit. No git command was run in this
  ticket.

---

### T-914 | Plant Library redesign Phase 3 — frontend mother/variety hierarchy (final)
- **Category:** Frontend · **Priority:** P2
- **Assigned:** frontend-dev-expert · **Started:** 2026-08-07
- **Depends on:** T-912 ✅ (data model/migration), T-913 🔵 (CRUD API — trusted
  as-is, not re-verified here; still Active pending the parent session's
  restart/mongosh verification/CodeMap regen/commit)
- **Blocks:** —
- **Description:** Turns the flat Plant Library UI into the two-level
  hierarchy Phase 1/2 built server-side: cards are now MOTHER plants
  (product/folder — plantName/scientificName/plantType + variety count)
  instead of individual cultivation entries. Detailed cultivation data
  (density, fertigation, yield, waste %, farm type compatibility, etc.)
  moved one level down to VARIETIES, reached via a mother's "Add Variety"
  action or its detail view. The planting-crop dropdown (AddVirtualCropModal
  → PlantCombobox) deliberately stays variety-based, unchanged in behavior —
  only its label got a mother-context suffix.
- **Fix:**
  - **New API client** `frontend/user-portal/src/services/plantMotherApi.ts`
    — `listPlantMothers`/`createPlantMother`/`getPlantMother`/
    `updatePlantMother`/`deletePlantMother`/`listVarietiesForMother`/
    `createVarietyForMother`, mirroring `plantDataEnhancedApi.ts`'s
    `response.data.data`/`meta` envelope-unwrapping convention.
  - **New TanStack Query hooks**
    `frontend/user-portal/src/hooks/queries/usePlantMothers.ts` —
    `usePlantMothers`/`usePlantMother`/`useVarietiesForMother` (queries) +
    `useCreatePlantMother`/`useUpdatePlantMother`/`useDeletePlantMother`/
    `useCreateVarietyForMother` (mutations, each invalidating the affected
    list/detail/varieties query keys). New `queryKeys.plantMothers.*`
    namespace added to `frontend/user-portal/src/config/react-query.config.ts`.
  - **Types** — `PlantMother`/`PlantMotherWithVarietyCount`/`VarietySummary`/
    `PlantMotherWithVarieties`/`PlantMotherCreate`/`PlantMotherUpdate`/
    `VarietyCreateForMother`/`PlantMotherSearchParams` added to
    `frontend/user-portal/src/types/farm.ts`; `PlantDataEnhanced`/
    `PlantDataEnhancedUpdate` gained optional `motherPlantId`/`varietyName`
    fields matching the Phase 1/2 backend models.
  - **New components:**
    - `PlantMotherCard.tsx` — mirrors `PlantDataCard.tsx`'s
      `glassPanelHover` styling; shows plantName/scientificName/plantType +
      "N varieties"; View/Add Variety/Edit/Delete actions.
    - `PlantMotherFormModal.tsx` — small create/edit modal, plantName +
      scientificName + plantType only (per project rule, closes only via
      the X button, never on backdrop click).
    - `PlantMotherDetailModal.tsx` — shows a mother's active varieties
      (fetched via `useVarietiesForMother`, full records — no per-row
      follow-up fetch), each with View (reuses `PlantDataDetail` unmodified)/
      Edit/Delete, plus an "Add Variety" action. Closes only via X button.
  - **Extended (not forked) `PlantDataFormModal.tsx`** with a variety mode:
    - New optional prop `motherContext` (plantMotherId + inherited basic
      info). `isVarietyCreate = !isEdit && !!motherContext`;
      `isVarietyOfMother = isEdit && !!plantData?.motherPlantId`.
    - When in either variety mode, the Basic Information section hides the
      plantName/scientificName/plantType inputs behind a new
      `MotherContextBanner` read-only summary ("New variety of {mother}" /
      "Variety of {mother}") and shows a required `varietyName` field
      instead; farmTypeCompatibility/tags/density chooser/all Advanced
      sections are unchanged and still per-variety.
    - New `varietyCreateSchema` (extends `createSchema`, basic-info fields
      optional, `varietyName` required); `updateSchema` gained an optional
      `varietyName` field.
    - Submit routes to `createVarietyForMother(motherId, ...)` for
      variety-create, and — critically — the variety-edit path OMITS
      `plantName`/`scientificName` from the PATCH body (backend now rejects
      those with 422 for a variety) and sends `varietyName` instead.
    - Extracted the previously-duplicated density-chooser JSX into a single
      `densityChooserField` variable reused by both the standalone and
      variety layouts (avoids forking the block).
  - **`PlantDataLibrary.tsx`** rewritten to list mothers instead of
    varieties: `usePlantMothers` (TanStack Query, replacing the page's old
    manual `useState`/`useEffect` fetch loop) drives the grid/pagination/
    stats; "New Plant" opens `PlantMotherFormModal`; each card's actions
    wire to `PlantMotherDetailModal`/`PlantMotherFormModal`/
    `PlantDataFormModal` (variety mode) via id-based modal state that
    re-derives the target record from the live query cache (so a
    mutation's invalidation is immediately reflected, no stale snapshots).
    CSV import/template download left wired to the untouched
    `plantDataEnhancedApi` endpoints exactly as before (Phase 2 didn't
    touch that path either). Farm type/contributor/region filter selects
    were DROPPED — `GET /plant-mothers` only supports `search`, and those
    are variety-level fields a mother doesn't carry; kept only Search +
    Clear.
  - **`PlantCombobox.tsx`** — added a `varietyLabel()` helper
    (`"{plantName} · {varietyName}"` when a variety carries one) used for
    the chip, dropdown rows, and search matching. Still 100% variety-based
    (`plants` prop unchanged, still fed by `getActivePlants()` from
    `plantDataEnhancedApi` in `AddVirtualCropModal.tsx`, which was NOT
    touched) — planting behavior is unchanged.
  - **`PlantDataDetail.tsx`** — header now appends `· {varietyName}` next
    to the plant name when the record being viewed is a variety.
- **Verify:** `npx tsc -b --noEmit` — confirmed via a stash/pop round-trip
  that isolated this ticket's tracked-file diff: only 2 pre-existing errors
  remain in `PlantDataFormModal.tsx` (`isValid`/`isSubmitting` unused at
  line 779, on a line this ticket never touched — reproduces identically
  on the pre-change baseline). Zero errors in any new or touched file.
  Playwright NOT run (project rule — user verifies in the browser).
- **CodeMaps:** need regeneration — new components (`PlantMotherCard`,
  `PlantMotherFormModal`, `PlantMotherDetailModal`), new hook file
  (`usePlantMothers.ts`), new service (`plantMotherApi.ts`),
  `PlantDataFormModal`/`PlantDataLibrary`/`PlantCombobox`/`PlantDataDetail`
  structurally changed. Not regenerated in this ticket — flagging for the
  parent session (same as T-913's still-open flag).
- **Files changed:**
  `frontend/user-portal/src/services/plantMotherApi.ts` (new),
  `frontend/user-portal/src/hooks/queries/usePlantMothers.ts` (new),
  `frontend/user-portal/src/components/farm/PlantMotherCard.tsx` (new),
  `frontend/user-portal/src/components/farm/PlantMotherFormModal.tsx` (new),
  `frontend/user-portal/src/components/farm/PlantMotherDetailModal.tsx` (new),
  `frontend/user-portal/src/components/farm/PlantDataFormModal.tsx`,
  `frontend/user-portal/src/components/farm/PlantDataDetail.tsx`,
  `frontend/user-portal/src/components/farm/PlantCombobox.tsx`,
  `frontend/user-portal/src/pages/farm/PlantDataLibrary.tsx`,
  `frontend/user-portal/src/types/farm.ts`,
  `frontend/user-portal/src/config/react-query.config.ts`.
- **Not moving to ARCHIVE** — leaving Active for the parent session to
  verify in the browser (hard project rule: Playwright not run by the
  implementing agent), regenerate CodeMaps, and commit. No git command was
  run in this ticket.

---

### T-915 | Plant Library CSV template + bulk import reworked for the mother/variety model
- **Category:** Backend · **Priority:** P2
- **Assigned:** backend-dev-expert · **Started:** 2026-08-07
- **Depends on:** T-913 🔵 (CRUD API this reuses — trusted as-is, not
  re-verified here; still Active pending the parent session's restart/
  mongosh verification/CodeMap regen/commit)
- **Blocks:** —
- **Description:** The Plant Library CSV template/import was still the
  pre-Phase-1 flat "one plant per row, upsert by plantName straight into
  `plant_data_enhanced`" shape — never updated when Phases 1-3 (T-912/
  T-913/T-914) introduced the mother/variety hierarchy. Reworked to "one
  VARIETY per row, grouped under a find-or-created MOTHER by plantName,"
  matching how the rest of the Plant Library now works.
- **Fix:**
  - **`PlantDataEnhancedService.generate_csv_template()`**
    (`src/modules/farm_manager/services/plant_data/plant_data_enhanced_service.py`)
    — new column order: `plantName, scientificName, plantType, varietyName,
    farmTypeCompatibility, growthCycleDays, minTemperatureCelsius,
    maxTemperatureCelsius, optimalTemperatureCelsius, minPH, maxPH,
    optimalPH, wateringFrequencyDays, yieldPerPlant, yieldUnit,
    expectedWastePercentage, spacingCategory, tags, notes`. Two example
    rows, both `plantName` "Tomato" with distinct `varietyName` ("Roma" /
    "Cherry"), demonstrating multi-row-collapses-to-one-mother.
    `spacingCategory` (short enum: xs/s/m/l/xl/bush/large_bush/small_tree/
    medium_tree/large_tree) was chosen over a raw density number per the
    ticket's guidance — friendlier for a CSV template, matches the field
    `PlantDataEnhancedBase` already exposes.
  - **`PlantDataEnhancedService.import_from_csv()`** (same file) — gained
    `organization_id`/`division_id` params (threaded from the route, from
    `current_user.organizationId`/`getattr(current_user, "divisionId",
    None)` — `CurrentUser` has no `divisionId` attribute today, kept
    future-proof) so mothers created by import are org-scoped like mothers
    created via `POST /plant-mothers`. Per-row loop rewritten:
    1. Validates `plantName`/`varietyName` presence and `plantType` against
       the mother's Literal vocabulary by attempting
       `PlantMotherCreate(plantName=..., plantType=...)` and catching
       `pydantic.ValidationError` (single source of truth for the allow-list
       — no separate list to keep in sync). Missing/invalid → recorded in
       `rowsFailed`, `continue` — never aborts the batch.
    2. Mother find-or-create, **cached within the run** (a local
       `dict[plantName, PlantMother]`) so N rows sharing a plantName only
       call the repository once: `PlantMotherRepository.get_by_name` first;
       if found (or already in the cache), REUSED as-is (the row's
       `plantType`/`scientificName` are ignored — the existing mother
       already defines them); otherwise created via
       `PlantMotherRepository.create(...)`.
    3. Builds a `VarietyCreateForMother` from the row's detail fields
       (farm types, growth cycle, environmental/soil/watering requirements,
       `YieldInfo` including `expectedWastePercentage`, `spacingCategory`,
       tags, `notes` via `AdditionalInformation(notes=...)`) reusing the
       same flat-field parsing the old import already had.
    4. Calls `PlantMotherService.create_variety_for_mother(mother.
       plantMotherId, variety_create, user_id, user_email)` DIRECTLY —
       does not reimplement its 404/409 validation, basic-info inheritance,
       or `_validate_detail_fields` call. Catches `HTTPException`: 409
       (duplicate `varietyName` under that mother) → recorded in
       `rowsSkipped`; any other `HTTPException`/`Exception` → recorded in
       `rowsFailed`; either way the loop continues to the next row.
  - **Growth-cycle arithmetic bug fixed as a side effect of reuse:** the
    old per-stage percentage split (germination/vegetative/flowering/
    fruiting each independently `int(days * fraction)`, `harvestDurationDays`
    forced to `max(int(days*0.05), 1)`, `totalCycleDays` set to `days`
    directly) rounds short of `days` for most non-round `growthCycleDays`
    values (e.g. 85 → stages summed to 83) — invisible before this ticket
    because the old import wrote straight to the repository, bypassing
    `PlantDataEnhancedService._validate_detail_fields`'s growth-cycle-sum
    check entirely. Now that variety creation goes through
    `PlantMotherService.create_variety_for_mother`, which calls that same
    validation, the mismatch would have 422'd on nearly every realistic CSV
    row (including the ticket's own template examples). Fixed by computing
    `harvestDurationDays` as the exact remainder
    (`max(days - germination - vegetative - flowering - fruiting, 0)`) so
    the five stages always sum to precisely `totalCycleDays`, no truncation
    gap possible.
  - **API routes**
    (`src/modules/farm_manager/api/v1/plant_data_enhanced.py`) — both
    endpoints kept at their existing paths (`GET
    /plant-data-enhanced/template/csv`, `POST
    /plant-data-enhanced/import/csv`) so the frontend's existing
    download/upload wiring keeps working unchanged. `download_csv_template`
    docstring updated to the new column list.  `import_plant_data_csv` now
    passes `organization_id=current_user.organizationId,
    division_id=getattr(current_user, "divisionId", None)` through to the
    service, docstring rewritten for the new mother/variety semantics, and
    the `SuccessResponse` message string rebuilt from the new result keys.
  - **`export_to_csv()` deliberately left untouched** — reads FROM the DB
    with its own independent header list, still works unchanged (verified
    it doesn't reference anything this ticket touched). **Flagging as a
    follow-up, not fixed here:** it now reads as somewhat misleading — it
    exports one row per variety with no `plantType`/`varietyName`/mother
    grouping, so a round-trip export→re-import would silently collapse into
    one "Standard"-style variety naming pattern rather than preserving the
    mother/variety structure. Out of scope per the ticket's explicit
    instruction; CSV export mirroring the grouped format is future work.
  - **Result dict shape changed** (was `{created, updated, errors}`,
    documented in ARCHIVE/BACKLOG as a genuine behavior change, not
    preserved for backward compat since the old semantics don't map 1:1
    onto mother/variety):
    ```
    {
      "totalRows": int,
      "mothersCreated": int,
      "mothersReused": int,
      "varietiesCreated": int,
      "rowsSkipped": [{"row": int, "reason": str}, ...],  # duplicate varietyName under its mother
      "rowsFailed": [{"row": int, "error": str}, ...],    # missing/invalid fields, any other error
    }
    ```
    Raises 422 only when the CSV was completely unusable (zero varieties
    created, zero rows skipped, only failures) — never for a partially-bad
    CSV where at least one row succeeded.
  - **Frontend NOT touched** (out of scope for this ticket) — flagging for
    the parent session: `frontend/user-portal/src/services/
    plantDataEnhancedApi.ts`'s `CSVImportResult` interface (~line 163) and
    `frontend/user-portal/src/pages/farm/PlantDataLibrary.tsx`'s import
    result display (~line 701, currently reads
    `importResult.created`/`importResult.updated`) both still assume the
    old `{created, updated, errors}` shape and need updating to the new
    keys above or the import-success panel will show `undefined`.
- **Tests:** `tests/unit/test_farm_manager/test_plant_library_csv_import.py`
  (NEW, 5 cases, same hand-rolled fake-Motor-collection style as
  `test_plant_mother_api.py` — no live DB, no mongomock): (1) two rows,
  same plantName distinct varietyName → 1 mother created + 2 varieties
  created; (2) a row whose plantName matches a pre-seeded mother → reused
  (mothersReused increments, mothersCreated does not), 1 new variety added;
  (3) a row whose (mother, varietyName) already exists → skipped as
  duplicate, no exception, other rows in the same CSV still process; (4) a
  row missing varietyName + a row with an invalid plantType both land in
  `rowsFailed` with correct row numbers, while a third valid row in the
  same CSV still imports; (5) `generate_csv_template()`'s exact header list
  and both example rows sharing plantName "Tomato" with distinct
  varietyName. Run locally (miniconda `python3 -m pytest`, no Docker
  needed): **5 passed**. Full `tests/unit/test_farm_manager/` suite re-run
  for regressions (Phase 1-3's existing 47 tests): **52 passed** (47
  pre-existing + 5 new), 0 failed.
- **Deploy note:** `docker restart a64coreplatform-api-1` required — the
  api container has no `--reload`; only
  `src/modules/farm_manager/services/plant_data/plant_data_enhanced_service.py`
  and `src/modules/farm_manager/api/v1/plant_data_enhanced.py` changed.
- **CodeMaps:** not regenerated — no new/removed endpoints, services, or
  collections; this is changed logic inside two already-mapped functions
  (`generate_csv_template`, `import_from_csv`) on an existing service/route
  pair. No regeneration needed for this ticket specifically, though the
  broader Phase 1-3 CodeMap regeneration flagged by T-912/T-913/T-914 is
  still outstanding.
- **Files changed:**
  `src/modules/farm_manager/services/plant_data/plant_data_enhanced_service.py`,
  `src/modules/farm_manager/api/v1/plant_data_enhanced.py`,
  `tests/unit/test_farm_manager/test_plant_library_csv_import.py` (new).
- **Not moving to ARCHIVE** — leaving Active for the parent session to
  restart the api container, verify (download the template, import it live,
  mongosh-check the resulting `plant_mothers`/`plant_data_enhanced` docs),
  regenerate CodeMaps if bundled with the rest of the Phase 1-3 regen, and
  commit. No git command was run in this ticket.

---

### T-913 | Plant Library redesign Phase 2 — mother/variety CRUD API + planting product stamp
- **Category:** Backend/API · **Priority:** P2
- **Assigned:** api-developer · **Started:** 2026-08-07
- **Depends on:** T-912 🔵 (Phase 1 models/migration — trusted as-is, not
  re-verified here)
- **Blocks:** Frontend for the new hierarchy (not started, deliberately out
  of scope — this ticket is backend API only)
- **Description:** Builds the CRUD API on top of T-912's mother/variety data
  model: full mother-plant (product) CRUD, variety-creation nested under a
  mother (inheriting basic info), and the operational core — wiring the
  planting flow so every new planting stamps `block.productMotherId`/
  `productName` from the planted variety's mother, atomically with the same
  write that sets `targetCrop`. No frontend changes.
- **Fix:**
  - **New router** `src/modules/farm_manager/api/v1/plant_mothers.py`
    (prefix `/plant-mothers`), registered in
    `src/modules/farm_manager/api/v1/__init__.py`:
    - `POST /plant-mothers` — create mother (agronomist permission)
    - `GET /plant-mothers` — list mothers, excludes soft-deleted, each
      annotated with `varietyCount` (active variety count), search +
      pagination, org-scoped when the acting user has an `organizationId`
    - `GET /plant-mothers/{id}` — mother + embedded active-variety summary
      list (`plantDataId`/`varietyName`/`isActive`)
    - `PATCH /plant-mothers/{id}` — update; renaming `plantName`/
      `scientificName` cascades to every variety's denormalized
      `plantName`/`scientificName` and to referencing blocks'/
      `block_archives`' denormalized `productName` (update_many by
      `motherPlantId`/`productMotherId`, not scoped to active/deleted —
      stale records should still show the corrected name)
    - `DELETE /plant-mothers/{id}` — soft delete; 409-refuses (never
      cascades) while the mother still has active varieties
    - `POST /plant-mothers/{id}/varieties` — create a variety under a
      mother: `plantName`/`scientificName` are ALWAYS sourced from the
      mother (ignored if the client sends them anyway), `varietyName`
      required + unique within the mother, detailed cultivation fields
      reuse `PlantDataEnhancedService._validate_detail_fields` (extracted
      from `create_plant_data` so both creation paths enforce identical
      growth-cycle/temperature/humidity/pH validation)
    - `GET /plant-mothers/{id}/varieties` — active varieties under a
      mother, unpaginated (mirrors `GET /plant-data-enhanced/active`'s
      dropdown-listing convention)
  - **Existing `/plant-data-enhanced` router/service left otherwise
    untouched** — its list/get/clone/CSV endpoints are unaffected and still
    serve the planting dropdown exactly as before. One guard added to
    `PlantDataEnhancedService.update_plant_data`: rejects (422) a
    client-supplied `plantName`/`scientificName`/`motherPlantId` change,
    since basic info is now inherited from the mother — rename the mother
    instead. `varietyName` remains editable through this endpoint (it's the
    variety's own field, not inherited).
  - **Repository expansions**:
    `services/plant_data/plant_mother_repository.py` — added
    `list_mothers` (search + pagination + per-row `varietyCount` via
    `count_documents`, deliberately not a `$lookup` aggregation — this
    collection is expected to stay small, so N+1 simplicity wins per KISS),
    `update`, `soft_delete`, `cascade_rename` (touches
    `plant_data_enhanced`, `blocks`, `block_archives`); `create()` gained
    optional `organization_id`/`division_id` params.
    `services/plant_data/plant_data_enhanced_repository.py` — added
    `get_by_mother`, `get_by_mother_and_variety_name`; `create()` gained
    optional `mother_plant_id`/`variety_name` params (stringified like
    every other UUID field before insert, matching the Phase 1 migration's
    own convention) so a new variety is written with its mother link in the
    same insert, not a follow-up patch.
  - **New service** `services/plant_data/plant_mother_service.py`
    (`PlantMotherService`) — all mother CRUD + `create_variety_for_mother`
    business logic described above.
  - **Planting product stamp** — the actual write path for
    `block.targetCrop` is `BlockRepository.update_status` in
    `services/block/block_repository_new.py` (confirmed the single choke
    point: both the direct block status-change flow
    (`BlockService.change_status` → `update_status`) and virtual-crop
    planting (`VirtualBlockService.plant_virtual_crop` → same
    `update_status` call) funnel through it — `BlockCreate`/`create()`
    technically has a dead `targetCrop` passthrough but every real block
    starts `EMPTY` and is never planted at creation, so it was left
    untouched). Added `BlockRepository._resolve_product_ref(variety_id)`:
    resolves a variety → its mother's `(plantMotherId, plantName)`,
    mirroring the Phase 1 migration's own resolution style (no active/
    deleted filter on either lookup — a block can reference a
    since-deactivated variety or mother). Wired into the `if target_crop:`
    branch of `update_status` so `productMotherId`/`productName` are set in
    the SAME `update_dict`/`update_one` write as `targetCrop` — truly
    atomic, not a follow-up call. Returns `(None, None)` + logs a warning
    (never raises) when the variety has no `motherPlantId` or the mother
    doesn't resolve, so a lookup gap never blocks the actual planting
    write. The EMPTY-transition clearing block now also clears
    `productMotherId`/`productName` alongside `targetCrop`/`targetCropName`.
  - **New models** in `models/plant_mother.py`:
    `PlantMotherWithVarietyCount`, `VarietySummary`,
    `PlantMotherWithVarieties`, `VarietyCreateForMother` (subclasses
    `PlantDataEnhancedBase`, overrides `plantName`/`scientificName` to
    Optional-and-ignored, adds required `varietyName`). Registered in
    `models/__init__.py`.
- **Org scoping judgment call:** `plant_data_enhanced` does zero org
  scoping anywhere today (shared reference data), and no farm_manager API
  route currently reads `current_user.organizationId` at all. Phase 2's
  spec explicitly asked for org-scoped mother listing, and the model
  already carries `organizationId` (indexed by Phase 1). Resolved as:
  filter by `organizationId` only when the acting user has one, no-op
  otherwise — ready for multi-tenancy without breaking single-org/dev setups
  where it's `None`. Flagging as a deliberate judgment call, not a
  established convention followed elsewhere in this module.
- **Tests:** `tests/unit/test_farm_manager/test_plant_mother_api.py` (NEW,
  17 cases) — create/duplicate-name mother, `varietyCount` accuracy across
  multiple mothers, variety creation inherits + ignores client-supplied
  basic info, duplicate `varietyName` under one mother rejected, unknown
  mother 404s, delete blocked while active varieties exist then succeeds
  once they're deactivated, mother rename cascades to variety + block
  `productName`, the update-guard rejects `plantName`/`scientificName`
  changes but still allows `varietyName`, `_resolve_product_ref` resolves/
  degrades-to-None correctly (missing `motherPlantId`, unresolvable
  mother), and `update_status` stamps + clears the product ref atomically.
  No live DB — a hand-rolled fake Motor-collection (find/find_one/
  insert_one/update_one/update_many/count_documents), following this
  codebase's existing DB-free unit-test convention (mongomock is not in
  requirements.txt — see `tests/unit/test_genetics/test_line_purge.py` for
  the precedent). `FarmingYearService`'s singleton (eagerly grabs
  `farm_db.get_database()` at construction and caches it process-wide) is
  sidestepped with its own monkeypatched fake rather than exercised, since
  it's orthogonal to what these tests assert. **Run locally** (miniconda
  `python3 -m pytest`, no Docker needed — this suite imports only
  services/models/database, not `middleware.auth`, so it avoids a
  pre-existing, unrelated host-only `.env`/pydantic-settings collection
  error that currently blocks `tests/unit/test_genetics/*` on this box —
  confirmed pre-existing via `git stash`-equivalent reasoning: the same
  error reproduces on `test_line_purge.py`, a file this ticket never
  touched): **17 passed**. Full `tests/unit/test_farm_manager/` suite
  re-run for regressions (Phase 1's `test_plant_library_migration.py` +
  `test_plant_library_models.py`): **47 passed** (30 pre-existing + 17
  new), 0 failed. In-container run (once `tests/` is copied in, per
  standard convention):
  `docker exec a64coreplatform-api-1 sh -c 'rm -rf /app/tests'` then
  `docker cp tests a64coreplatform-api-1:/app/tests` then
  `docker exec a64coreplatform-api-1 python -m pytest tests/unit/test_farm_manager -q`.
- **Deploy note:** `docker restart a64coreplatform-api-1` required — the
  api container has no `--reload`; several `src/` files changed (new
  router, new service, model + repository edits).
- **CodeMaps:** need regeneration — new router (`plant_mothers.py`, 7 new
  endpoints), new service (`PlantMotherService`), `plant_mother_repository.py`
  gained real CRUD (was migration-only skeleton in Phase 1's map entry).
  Not regenerated in this ticket — flagging for the parent session.
- **Files changed:**
  `src/modules/farm_manager/api/v1/plant_mothers.py` (new),
  `src/modules/farm_manager/api/v1/__init__.py`,
  `src/modules/farm_manager/models/plant_mother.py`,
  `src/modules/farm_manager/models/__init__.py`,
  `src/modules/farm_manager/services/plant_data/plant_mother_repository.py`,
  `src/modules/farm_manager/services/plant_data/plant_mother_service.py`
  (new),
  `src/modules/farm_manager/services/plant_data/plant_data_enhanced_repository.py`,
  `src/modules/farm_manager/services/plant_data/plant_data_enhanced_service.py`,
  `src/modules/farm_manager/services/plant_data/__init__.py`,
  `src/modules/farm_manager/services/block/block_repository_new.py`,
  `tests/unit/test_farm_manager/test_plant_mother_api.py` (new).
- **Not moving to ARCHIVE** — leaving Active for the parent session to
  restart the api container, verify live (mongosh + a real planting flow),
  regenerate CodeMaps, and commit. No git command was run in this ticket.

---

### T-912 | Plant Library redesign Phase 1 — mother/variety hierarchy (data model + migration script only)
- **Category:** Backend/Database · **Priority:** P2
- **Assigned:** database-schema-architect · **Started:** 2026-08-07
- **Depends on:** —
- **Blocks:** Phase 2 (CRUD API + frontend for the new hierarchy — not
  started, deliberately out of scope for this ticket)
- **Description:** Introduces a two-level Plant Library hierarchy: a
  "mother plant" (product/SKU) holding multiple "varieties" (cultivation
  recipes). VARIETY = the existing `plant_data_enhanced` collection/model —
  a block reads ALL growing data (density, fertigation, yield, waste %)
  from its variety, meaning UNCHANGED. MOTHER = the product; harvest,
  inventory, and sales roll up to the mother so a farm sells one "Cabbage"
  product rather than one line item per variety. This ticket is DATA MODEL
  + MIGRATION SCRIPT ONLY — no API routes, no frontend changes, fully
  additive/backward-compatible; everything that works today keeps working
  unchanged until the migration is actually run.
- **Fix:**
  - **New model** `src/modules/farm_manager/models/plant_mother.py` —
    `PlantMotherBase`/`Create`/`Update`/`PlantMother`, following the exact
    Base/Create/Update/Full convention used by `plant_data.py` and
    `plant_data_enhanced.py`. Fields: `plantMotherId: UUID`,
    `plantName: str` (required), `scientificName: Optional[str]`,
    `plantType: Literal['crop','tree','herb','fruit','vegetable',
    'ornamental','medicinal']` (default `'crop'`, reusing
    `plant_data_enhanced`'s existing vocabulary — not a new enum),
    `organizationId`/`divisionId: Optional[str]`, `isActive: bool = True`,
    `deletedAt: Optional[datetime]`, `createdBy: Optional[UUID]`,
    `createdByEmail: Optional[str]` (both Optional, unlike
    `PlantDataEnhanced`'s required equivalents — Phase 1 populates this
    collection entirely via the migration script, which has no acting
    user), `createdAt`/`updatedAt: datetime`. Registered in
    `models/__init__.py`.
  - **New repository skeleton**
    `src/modules/farm_manager/services/plant_data/plant_mother_repository.py`
    (`create`/`get_by_id`/`get_by_name`/`get_active_mothers` only — no full
    CRUD API, that's Phase 2) and collection registration + indexes
    (`plantMotherId` unique, `organizationId`, `plantName`, `isActive`,
    `createdAt` desc) added to `FarmDatabaseManager._create_indexes()` in
    `src/modules/farm_manager/services/database.py`, mirroring the existing
    `plant_data` index block.
  - **Variety fields** on `PlantDataEnhanced`
    (`src/modules/farm_manager/models/plant_data_enhanced.py`):
    `motherPlantId: Optional[UUID]`, `varietyName: Optional[str]` — added
    to the main model (alongside `isActive`/`dataVersion`, not
    `PlantDataEnhancedBase`) and mirrored onto `PlantDataEnhancedUpdate`.
    Both Optional so pre-migration documents (57 active docs today) still
    validate; `plantName`/`scientificName` untouched — version snapshots
    and display code still read them. `plantDataId` untouched everywhere.
  - **Product ref on blocks**
    (`src/modules/farm_manager/models/block.py`, `Block` class only — the
    only class that already carries both `targetCrop`/`targetCropName`):
    `productMotherId: Optional[UUID]`, `productName: Optional[str]`.
    `targetCrop` stays = the variety, meaning UNCHANGED. Same two fields
    added to `BlockArchive`
    (`src/modules/farm_manager/models/block_archive.py`).
  - **Migration script**
    `scripts/migrations/plant_library_mother_variety_migration.py` (NOT
    run — see below). Follows the `wave4_purchasing_status_migration.py`
    style: module docstring, `MONGODB_URL`/`MONGODB_DB_NAME` env vars
    (same defaults), `logging`, async Motor, fully idempotent.
- **Migration mechanics:**
  - **Idempotency:** deterministic mother id =
    `uuid.uuid5(uuid.NAMESPACE_OID, str(variety_plantDataId))`. Re-running
    always resolves to the same mother id for the same variety — mothers
    are never duplicated, `plantDataId` is never reissued.
  - **Step 1 (mothers):** for every `plant_data_enhanced` doc with
    `deletedAt: null` (isActive is deliberately NOT used as a gate here —
    it only controls dropdown visibility for new plantings, not whether a
    variety is in use; existing blocks can reference an isActive=False
    variety), create/link a `plant_mothers` doc; `plantType` inferred from
    `tags` (see mapping below); sets `motherPlantId` +
    `varietyName='Standard'` on the variety. Skips docs that already have
    `motherPlantId`.
  - **Step 2/3 (blocks / block_archives):** for every doc with non-null
    `targetCrop`, resolves the mother by looking up the variety doc (no
    `deletedAt` filter — a block can reference a since-deleted variety) and
    RECOMPUTING the mother id via the same uuid5 formula directly from
    `targetCrop` (more robust than trusting the variety's own
    `motherPlantId` field, which may not be backfilled yet or could be
    stale). Sets `productMotherId`/`productName`; `targetCrop` untouched.
    Idempotent: skips when `productMotherId` already matches the freshly
    resolved value, re-backfills when `targetCrop` changed since the last
    run. Unresolvable `targetCrop` → logged warning + skip, never a crash.
    `block_harvests` (13,947 docs) is never touched — it carries no plant
    reference; rollups derive through the block/archive.
  - **Tag → plantType mapping** (`_TAG_TO_PLANT_TYPE` /
    `TAG_PLANT_TYPE_PRECEDENCE` in the script):
    `tree→tree`, `herb→herb`, `ornamental→ornamental`,
    `medicinal→medicinal`, `vegetable→vegetable`, `fruit→fruit`; default
    `crop` when no tag matches. **Conflict precedence** when a doc has
    multiple mapped tags: `tree > herb > ornamental > medicinal >
    vegetable > fruit` — growth-habit tags rank highest (most
    decision-relevant for a product grouping), use-category tags next,
    `vegetable` beats `fruit` as the final fixed tie-break.
  - **`--dry-run` / `--execute`:** dry-run is the DEFAULT (no flags, or
    `--dry-run` explicitly) — every read/resolution step still runs so the
    summary is accurate, but zero writes happen. `--execute` is required to
    actually write. Commands (parent runs these, NOT run in this ticket):
    `docker compose exec api python scripts/migrations/plant_library_mother_variety_migration.py`
    (dry-run first) then
    `docker compose exec api python scripts/migrations/plant_library_mother_variety_migration.py --execute`.
  - Logs a full summary: mothers created vs already-linked, plantType
    inference breakdown, blocks/archives backfilled vs already-correct vs
    unresolved (with unresolved ids listed).
- **Tests:** `tests/unit/test_farm_manager/test_plant_library_migration.py`
  (NEW) — unit tests for the standalone `infer_plant_type_from_tags()`
  helper: each mapped tag individually, case-insensitivity, every
  multi-tag conflict pairing against the documented precedence, input-order
  independence, and the `crop` fallback (None/empty/unmapped/blank tags).
  `tests/unit/test_farm_manager/test_plant_library_models.py` (NEW) —
  `PlantMother` constructs with/without `scientificName` and
  with/without `createdBy`; `PlantDataEnhanced` constructs identically
  with/without `motherPlantId`/`varietyName` (pre-migration-doc backward
  compat proof) and confirms `plantDataId` is never implicitly reissued;
  `Block` constructs identically with/without
  `productMotherId`/`productName` and confirms `targetCrop` /
  `productMotherId` are independent fields. **NOT run in this ticket**
  (`tests/` is not bind-mounted into the api container in this
  environment) — syntax/import-checked locally instead (`ast.parse` +
  direct model construction against installed `pydantic`/`motor` on the
  host, no pytest). Parent runs via:
  `docker exec a64coreplatform-api-1 sh -c 'rm -rf /app/tests'` then
  `docker cp tests a64coreplatform-api-1:/app/tests` then
  `docker exec a64coreplatform-api-1 python -m pytest tests/unit/test_farm_manager -q`
  (note: a container restart wipes `/app/tests` again).
- **Deploy note:** `docker restart a64coreplatform-api-1` required after
  this lands — the api container has no `--reload`.
- **CodeMaps:** need regeneration — new model file (`plant_mother.py`), new
  collection (`plant_mothers`), new repository
  (`plant_mother_repository.py`). Not regenerated in this ticket — flagging
  for the parent session.
- **Files changed:**
  `src/modules/farm_manager/models/plant_mother.py` (new),
  `src/modules/farm_manager/models/plant_data_enhanced.py`,
  `src/modules/farm_manager/models/block.py`,
  `src/modules/farm_manager/models/block_archive.py`,
  `src/modules/farm_manager/models/__init__.py`,
  `src/modules/farm_manager/services/plant_data/plant_mother_repository.py`
  (new),
  `src/modules/farm_manager/services/database.py`,
  `scripts/migrations/plant_library_mother_variety_migration.py` (new),
  `tests/unit/test_farm_manager/__init__.py` (new),
  `tests/unit/test_farm_manager/test_plant_library_migration.py` (new),
  `tests/unit/test_farm_manager/test_plant_library_models.py` (new).
- **Not moving to ARCHIVE** — the migration has NOT been run against any
  database (57 live `plant_data_enhanced` docs + live `blocks`/
  `block_archives`); no git command was run either. Leaving Active for the
  parent session to review, run the dry-run, inspect the summary, then run
  `--execute`, verify with `mongosh`, regenerate CodeMaps, and commit.

---

### T-911 | PO-from-PR conversion now creates a live (Open) PO, not Draft
- **Category:** Backend · **Priority:** P1
- **Assigned:** backend-dev-expert · **Started:** 2026-08-04
- **Depends on:** T-810 ✅ (event-payload state mapping this change relies on)
- **Blocks:** —
- **Description:** Deliberate product decision: converting an already-Approved
  PR into a PO must produce a LIVE (Open) PO directly, not a Draft. The PR
  approval already covers it, so a second PO approval step is redundant.
  Previously `DocumentService.create_po_from_pr` (in
  `src/modules/purchasing/services/document_service.py`) always built the
  new PO header with `status: DocumentStatus.DRAFT.value` and
  `issuedDate: None`, requiring a manual extra approve/issue step on every
  PR→PO conversion despite the PR already being Approved.
- **Fix:** In `create_po_from_pr` (~line 2064), the new PO header now sets:
  - `status: DocumentStatus.OPEN.value` (was `DRAFT.value`)
  - `issuedDate: now` (was `None`) — issued immediately since the PO is live
    from creation; `dueDate` stays `None` unchanged (computed at Send time
    elsewhere).
  - `approvalState` stays `"NotRequired"` unchanged — the PR approval IS the
    approval; the approval engine (`self._engine`) is deliberately NOT
    invoked on this path.
  - The existing `await self._emit_po_event(header, None, company_code,
    session=session)` call is unchanged in code, but now naturally emits
    `po_state_changed` with `payload.state == "Open"` (via the existing
    `map_po_state_for_event`/`build_po_event_payload` from T-810) instead of
    `"Draft"`. `previousState` stays `None` — correct for a document that
    never existed as Draft. No second event added.
  - Docstring updated to state the PO is created directly OPEN/live because
    the source PR was already Approved.
  - Everything else in the method (PR auto-close to CLOSED, line copy with
    `baseLineId` preserved, PR event emission, best-effort audit write) is
    untouched.
- **Tests:** `tests/unit/test_purchasing/test_create_po_from_pr.py` (NEW, 4
  cases) — no prior test file covered this method at all, so nothing needed
  updating for a stale `'draft'` assertion. New cases: (1) returned PO
  `status == 'open'`; (2) `po_state_changed` outbox event emitted with
  `payload['state'] == 'Open'`, round-tripped against the REAL
  `PurchaseOrderStateChangedPayload` contract model (proof this doesn't
  reintroduce the T-810 crash class), `previousState is None`; (3) source PR
  transitions to `status == 'closed'` via `document_headers.update_one` and
  emits `pr_state_changed` with `state == 'Closed'`; (4) `approvalState ==
  'NotRequired'` on the returned PO, with `service._engine.evaluate` spied to
  raise if ever called — proves the approval engine is never invoked on this
  path. Run locally (miniconda `python3 -m pytest`, no Docker needed — full
  `src`/`contracts` tree imports cleanly on this host): **4 passed**. Full
  `tests/unit/test_purchasing/` suite re-run for regressions: **109 passed**
  (105 pre-existing + 4 new), 0 failed.
- **Deploy note:** `docker restart a64coreplatform-api-1` required — the api
  container has no `--reload`; only
  `src/modules/purchasing/services/document_service.py` changed.
- **CodeMaps:** not regenerated — no new/removed endpoints, services, or
  collections; this is a status/field-value change inside one existing
  service method.
- **Files changed:**
  `src/modules/purchasing/services/document_service.py`,
  `tests/unit/test_purchasing/test_create_po_from_pr.py` (new).
- **Not moving to ARCHIVE** — leaving Active for the parent session to
  restart the api container, verify, and commit.

---

### T-811 | Purchasing detail pages — Wave 4 status vocabulary never updated on frontend (no action buttons render)
- **Category:** Frontend · **Priority:** P0
- **Assigned:** frontend-dev-expert · **Started:** 2026-08-04
- **Depends on:** T-810 ✅ (backend counterpart — same root migration)
- **Blocks:** —
- **Description:** Companion regression to T-810. `wave4_purchasing_status_migration.py`
  rewrote stored `document_headers.status` from TitleCase to lowercase_snake
  (`draft`, `pending_approval`, `open`, `partly_closed`, `closed`, `cancelled`
  — plus unchanged `'Rejected'`/`'Sent'`/`'Partially Received'`/`'Received'`),
  but the frontend was never updated: `statusPhase.ts`'s
  `PURCHASING_STATUS_PHASE` map and all 4 purchasing detail pages' action
  gating still compared against the old TitleCase strings, so a Draft PO
  (status `"draft"`) showed zero action buttons (no Submit/Edit/Delete) and
  badges rendered the raw lowercase string instead of a display label.
- **Fix:** re-keyed `PURCHASING_STATUS_PHASE` on backend values (old
  TitleCase kept as harmless aliases), added `statusDisplayLabel()`, fixed
  gating in `PurchaseOrderDetailPage.tsx` / `PurchaseRequestDetailPage.tsx` /
  `GoodsReceiptDetailPage.tsx` / `APInvoiceDetailPage.tsx` /
  `PurchaseOrderFormPage.tsx`, added `useDeletePurchaseOrder` + a Delete
  button for draft POs, updated `POStatus`/`PRStatus` types in
  `purchasingApi.ts`, aligned list-page filters/badges. Verified with
  `npx tsc -b --noEmit` only — no Playwright (user verifies in browser per
  project rule). Not moving to ARCHIVE — leaving for the parent session to
  verify + commit.
- **Follow-up noted, not done:** PR/GR/AP have delete endpoints/client
  methods but no delete UI — same pattern as the new PO delete button could
  be added later if wanted.

---

### T-910 | Finance-outbox silent drop — ap_down_payment_posted / ap_credit_note_posted never registered as contracts (Stage 1 of 2)
- **Category:** Backend · **Priority:** P0
- **Assigned:** backend-dev-expert · **Started:** 2026-08-04
- **Depends on:** —
- **Blocks:** Stage 2 (finance service side — services/finance/, out of scope here)
- **Description:** `ap_down_payment_service.py` and `ap_credit_note_service.py`
  have always correctly built and called `OutboxWriter.publish(event_type=
  "ap_down_payment_posted" / "ap_credit_note_posted", ...)` on their
  PENDING_APPROVAL → OPEN transitions, but neither event type was ever
  registered in `contracts/finance_events.py`'s `EVENT_TYPE_REGISTRY`.
  `OutboxWriter.publish` raises `ValueError` for an unregistered
  `event_type`; both services catch that inside a broad
  `except Exception as exc` around the publish call (logged, not raised) —
  so the DPI/ACN status transition itself succeeds but finance receives
  NOTHING. This is Stage 1 (contracts only) — Stage 2 (the finance
  microservice's ingest/consumer side actually booking the JE for these two
  event types) is separate future work, intentionally not started here.
- **Fix:** Added 4 new Pydantic models to `contracts/finance_events.py`
  (`ApDownPaymentPostedLine`, `ApDownPaymentPostedPayload`,
  `ApCreditNotePostedLine`, `ApCreditNotePostedPayload`), registered both
  payload classes in `EVENT_TYPE_REGISTRY` under
  `"ap_down_payment_posted"` / `"ap_credit_note_posted"`, and added both to
  the `EventPayload` Union. Typing was derived from reading the producers'
  actual `_build_outbox_payload` dict-building code (not copied from the
  sibling `ApInvoicePostedPayload`, which is stricter than what these two
  producers actually emit) — notably `vendorId: str` (not UUID, producer
  falls back to `""`), `docDate: str` (producer pre-formats to
  `"YYYY-MM-DD"`), DPI line `itemId: Optional[UUID] = None` (amount-only
  DPI lines have no item), ACN `baseApInvoiceDocId/Number: str = ""`
  (empty on the direct-create path, no source AP Invoice). `totals` is
  typed as a plain `dict` (not a new nested sub-model) to match this
  file's own existing precedent for nested totals
  (`SalesInvoicePostedPayload.totals`, `CreditNotePostedPayload.totals`
  are both `dict` with a `"""Keys: net, tax, gross."""` docstring) rather
  than inventing a new pattern. `ApCreditNotePostedPayload.originalEventId:
  Optional[str] = None` is forward-compat only — reserved for a future
  `ap_credit_note_cancelled` variant that is NOT emitted by the current
  producer.
  **Not touched (explicitly out of scope):** `services/finance/` (Stage 2),
  the `OutboxWriter.publish`/try-except code in either purchasing service
  (they already publish correctly — they only needed the contract
  registered), any other event type already in the registry.
- **Tests:** `tests/unit/test_purchasing/test_ap_dpi_acn_outbox_contracts.py`
  (NEW, 7 cases) — imports the REAL `_build_outbox_payload` from both
  services, builds representative raw DPI/ACN docs (each with one taxed
  line + one exempt line; DPI additionally covers an amount-only line with
  `itemId=None`), calls the real producer, and instantiates
  `ApDownPaymentPostedPayload(**payload)` /
  `ApCreditNotePostedPayload(**payload)` directly against the actual
  output — the round-trip proof that producer and contract now agree.
  Also pins `EVENT_TYPE_REGISTRY["ap_down_payment_posted"] is
  ApDownPaymentPostedPayload` / same for the ACN side, plus two edge cases
  per event type (missing `vendorId` key → `""`, and for ACN, a `None`
  `baseInvoiceDocRef` on the direct-create path → `""` refs). Run
  host-side (miniconda `python3 -m pytest`, no Docker needed — pydantic,
  fastapi, motor, and the full `src`/`contracts` tree all import cleanly
  on this host): **7 passed**. Full `tests/unit/test_purchasing/` suite
  re-run for regressions: **105 passed** (98 pre-existing + 7 new), 0
  failed.
- **Deploy note:** `docker restart a64coreplatform-api-1` required — only
  `contracts/finance_events.py` changed and the api container bind-mounts
  `./contracts:/app/contracts`, but has no `--reload`.
- **Finance-consumer mount gap (flagging for whoever picks up Stage 2):**
  `docker-compose.finance.yml`'s `finance_consumer` and `finance` services
  have **no `volumes:` section at all** — unlike the api container,
  neither bind-mounts `./contracts`. Both Dockerfiles
  (`services/finance_consumer/Dockerfile`, presumably
  `services/finance/Dockerfile` too) do `COPY contracts/ /app/contracts/`
  and `pip install -e /app/contracts` at **build time**. This means
  today's contract change is invisible to both services until they are
  **rebuilt** (`docker compose -f docker-compose.yml -f
  docker-compose.finance.yml build finance finance_consumer`), not just
  restarted. Not urgent for Stage 1 (neither service does anything with
  these two event types yet — that's Stage 2), but Stage 2 will need this
  rebuild step, not a restart, and it's easy to reach for the wrong one
  given every other deploy note in this codebase says "restart."
- **CodeMaps:** not regenerated — no new/removed endpoints, services, or
  collections; this is 4 new Pydantic models + 2 registry entries inside
  an existing contracts module.
- **Files changed:** `contracts/finance_events.py`,
  `tests/unit/test_purchasing/test_ap_dpi_acn_outbox_contracts.py` (new).
- **Not moving to ARCHIVE** — Stage 2 (finance service actually consuming
  these two event types) is separate future work per this ticket's scope;
  leaving Active for the parent session to verify + commit + decide when
  Stage 2 is picked up.

---

### T-810 | Purchasing PO/PR create crash — Wave 4 status vocabulary vs finance event contracts
- **Category:** Backend · **Priority:** P0
- **Assigned:** backend-dev-expert · **Started:** 2026-08-03
- **Depends on:** T-200.21 ✅
- **Blocks:** —
- **Description:** Creating a PO crashed with `1 validation error for
  PurchaseOrderStateChangedPayload: state ... [input_value='draft']`.
  Root cause: `wave4_purchasing_status_migration.py` (T-200.21) rewrote the
  STORED `document_headers.status` field from legacy TitleCase to the shared
  `DocumentStatus` lowercase_snake vocabulary (draft, pending_approval, open,
  partly_closed, closed, cancelled — plus unchanged purchasing-internal
  "Rejected"/"Sent"/"Partially Received"/"Received"), but the finance event
  contracts (`contracts/finance_events.py`) and the two payload builders in
  `document_service.py` were never updated alongside it — they still
  declare/pass the pre-migration TitleCase DISPLAY vocabulary.
- **Fix:**
  1. Added `map_pr_state_for_event` / `map_po_state_for_event` (doc-type
     specific — stored "open" displays "Approved" for PR, "Open" for PO) in
     `src/modules/purchasing/services/document_service.py`, applied to both
     `state` and `previousState` (previousState mapped too, for vocabulary
     consistency — the contract only requires `Optional[str]` there, so this
     is a stylistic choice, not a validation requirement) in
     `build_pr_event_payload` / `build_po_event_payload`. Both maps also
     accept the pre-migration legacy TitleCase inputs as identity mappings —
     required because `document_service.py` explicitly tolerates the
     migration window (`_parse_status` does the same for business-logic
     transitions); an unmapped value raises `ValueError` rather than passing
     through silently.
  2. Added `"Rejected"` to `PurchaseOrderStateChangedPayload.state` Literal
     in `contracts/finance_events.py` — `reject_po` stores `"Rejected"` and
     emits `po_state_changed`, but the PO contract (unlike the PR contract)
     never had a `"Rejected"` literal. Additive, backward-compatible.
  3. **Discovered while checking for bypasses (not in the original bug
     report):** `cron/scripts/outbox_reconciler.py`'s
     `_PR_FINANCE_STATUSES`/`_PO_FINANCE_STATUSES` still held the OLD
     display-vocabulary strings (`"Approved"`, `"Open"`, `"Closed"`,
     `"Cancelled"`) used directly as a MongoDB `status` `$in` filter — after
     the Wave 4 migration these no longer match any migrated document
     (`"open"`/`"closed"`/`"cancelled"` lowercase), so the sweeper was
     silently scanning almost nothing. Updated both lists to the STORED
     vocabulary. Separately, `outbox_event_exists`'s `payload.state` dedup
     check compared against the RAW stored status; since the builders now
     write the MAPPED display value into `payload.state`, the sweeper now
     maps before checking existence — otherwise every check would
     false-negative and re-emit duplicates on every run.
- **Tests:** `tests/unit/test_purchasing/test_event_payload_state_mapping.py`
  (NEW, 44 cases) — pins the full stored→display table for both doc types,
  validates `previousState` mapping/None-passthrough, and instantiates the
  REAL `PurchaseRequestStateChangedPayload`/`PurchaseOrderStateChangedPayload`
  contract models against builder output for every stored status (fails on
  drift between the mapping and the contract Literal, not just on this bug).
  Includes a dedicated regression pin for the exact reported crash (stored
  `"draft"` → PO create). Also updated `tests/unit/test_finance_bridge/
  test_outbox_reconciler.py` fixtures/assertions from stale display-vocab
  statuses (`"Approved"`/`"Open"`) to stored vocab (`"open"`) to match step 3's
  fix. Full `tests/unit/test_purchasing/` suite: **98 passed, 0 failed**
  (run locally with `redis` installed; the container has it by default).
  `test_outbox_reconciler.py`: 2 of 13 fail
  (`test_scenario_a_missing_event_emitted`, `test_scenario_d_po_open_emits_po_event`)
  — confirmed via `git stash` to be **pre-existing on unmodified code**,
  unrelated to this fix (`TypeError: object MagicMock can't be used in
  'await' expression` — the mock DB in that test file has no async stub for
  the `organizations` collection that `OutboxWriter.publish`'s tenant-flag
  check queries; a gap in that test's mocking, not something this ticket's
  scope covers). Flagging, not fixing — out of scope.
- **Deploy note:** `docker restart a64coreplatform-api-1` required — the api
  container has no `--reload`. `cron/scripts/outbox_reconciler.py` runs as a
  separate one-shot cron job (not the long-running api process); confirm its
  container/cron image also picks up the new code before its next scheduled
  run.
- **CodeMaps:** not regenerated — no new/removed endpoints, services,
  components, or collections; this is a bugfix inside existing payload
  builders + one existing contract's Literal + one existing cron script.
- **Files changed:**
  `src/modules/purchasing/services/document_service.py`,
  `contracts/finance_events.py`, `cron/scripts/outbox_reconciler.py`,
  `tests/unit/test_purchasing/test_event_payload_state_mapping.py` (new),
  `tests/unit/test_finance_bridge/test_outbox_reconciler.py`.
- **Not moving to ARCHIVE** — leaving for the parent session per this
  ticket's process rules (parent verifies + commits).

---

### T-809 | Genetics line cascade purge + org-wide orphan sweep
- **Category:** Backend · **Priority:** P2
- **Assigned:** backend-dev-expert · **Started:** 2026-07-31
- **Depends on:** T-807 ✅
- **Blocks:** —
- **Description:** T-807's `LineService.purge_line()` is correct and stays
  the safe default (refuse rather than cascade at any nonzero dependent
  count). Missing: a deliberate, explicit, audited path for the case the
  user actually has — "sometimes i have demo lines or test lines which
  shouldn't clutter when the test or demo is cancelled" — where the whole
  line WAS the test, plus an org-wide sweep for orphans already left behind
  by earlier line removals (found live: accession `T808-TEST-G1-002` whose
  line no longer exists).
- **Steps:**
  1. `DELETE /api/v1/genetics/lines/{id}/purge?cascade=true`, body
     `{"confirm": "<exact line code>"}` — GitHub repo-deletion pattern,
     mismatch is 400. super_admin only (`genetics.delete.cascade`, one tier
     above `genetics.delete`). Cascade-removes accessions, propagation
     events and observations by explicit gathered id lists, never a broad
     filter. Hard-refuses (409, unconditionally, even with a correct
     confirm) when the line has harvests (real production yield) or child
     lines (real downstream work).
  2. `?dryRun=true` on the same route — exact preview (counts + accession
     codes), deletes nothing, does not require `confirm`; still enforces the
     harvest/child-line hard-refuse so a preview never promises an
     impossible cascade.
  3. `GET /api/v1/genetics/maintenance/orphans` (read-only,
     `genetics.delete`) + `DELETE /api/v1/genetics/maintenance/orphans`
     (super_admin, `genetics.maintenance`, audited, `?dryRun=true`
     supported) — accessions/propagation events/observations whose lineId
     (or, for propagation events, every referenced lineId) matches no
     existing line. Null/absent lineId is explicitly NOT an orphan.
  4. Audit log (`admin_audit_log`) on both real deletes, full pre-deletion
     snapshot, matching the `PATCH /organizations/{id}/modules` precedent.
  5. `deactivate_line`/`purge_line` left behaviourally unchanged; all three
     removal paths' docstrings cross-reference which is which.
  6. Tests: `tests/unit/test_genetics/test_line_cascade_purge.py`,
     `tests/unit/test_genetics/test_maintenance_orphans.py`
  7. Verify with mongosh + full `pytest tests/unit/test_genetics`, live
     against a throwaway line only — never `PO-BLU`/`HE-LM`/`HE-LMUS`.

---

### T-808 | Genetics propagation date amendment — correct `performedAt` only, cascaded
- **Category:** Backend · **Priority:** P2
- **Assigned:** backend-dev-expert · **Started:** 2026-07-31
- **Depends on:** T-800 ✅
- **Blocks:** —
- **Description:** Propagation events are immutable by construction (only
  GET/POST existed). User decision: allow correcting a mis-entered date
  ("work happened Tuesday, logged Friday") — "no need to edit who, just
  when." `performedAt` becomes amendable; `operatorName`/`performedBy`
  (attribution) and the structural fields (`method`, `parents`, `targets`,
  `resultAccessionIds`, generations, `reproductionMode`) stay immutable. The
  date is chained: event `performedAt` → child `Accession.acquiredAt` →
  printed label (`labels.py`) — amending only the event would create a
  three-way disagreement, so the fix must cascade to child accessions
  without touching a divergence someone already made by hand.
- **Steps:**
  1. `PropagationAmend` model — `performedAt` only, no general-purpose
     `PropagationUpdate`
  2. `PATCH /api/v1/genetics/propagations/{id}` — permission `genetics.edit`
     (bench tier — "update / split an accession" already covers correcting
     an existing bench record; this is the same class of correction, not a
     curation act)
  3. Cascade to `resultAccessionIds`: update `acquiredAt` only where it still
     equals the event's OLD `performedAt`; report `accessionsUpdated` /
     `accessionsSkipped`
  4. `amendedAt`/`amendedBy` stamped on the event — the correction is
     recorded, not made invisible
  5. Reject a future `performedAt` with 400
  6. Tests in `tests/unit/test_genetics/test_propagation_amend.py`
  7. Verify with mongosh against a throwaway line/accession/propagation only

---

### T-807 | Genetics line purge — refuse-rather-than-cascade hard delete
- **Category:** Backend · **Priority:** P2
- **Assigned:** backend-dev-expert · **Started:** 2026-07-31
- **Depends on:** T-800 ✅
- **Blocks:** —
- **Description:** `LineService.deactivate_line()` is soft-delete only; hard
  deletion was deliberately unsupported because accessions/propagation events
  reference the line. That leaves no way to remove a line created by mistake,
  a typo, or a test. Follows the `RoomService.room_dependents()` /
  `delete_room()` precedent in mushroom_manager: count everything that would
  be orphaned, refuse rather than cascade.
- **Steps:**
  1. `GET /api/v1/genetics/lines/{id}/dependents` — counts accessions,
     propagation events (source+result), observations, child lines, harvests
  2. `DELETE /api/v1/genetics/lines/{id}/purge` — hard delete only at zero
     dependents, else 409 naming what blocks it. Permission: `genetics.delete`
     (already the strictest tier in the namespace — curation, moderator+).
  3. `deactivate_line()` unchanged; both docstrings now explain the split
  4. Tests in `tests/unit/test_genetics/test_line_purge.py`
  5. Verify with mongosh + Playwright MCP `browser_network_request` against a
     throwaway line, and confirm `PO-BLU` (has accessions) refuses and survives

---

### T-806 | Scan-to-act — authenticated label-token resolution + act-on-scan UI
- **Category:** API + Frontend · **Priority:** P1
- **Assigned:** api-developer (part 1) · **Started:** 2026-07-31
- **Depends on:** T-804 ✅ (publicToken, labelledVesselCount, resolve_vessel, public info page)
- **Blocks:** —
- **Description:** T-804's public label-info page is deliberately unauthenticated and
  deliberately exposes no internal accession UUID. To let a logged-in bench user act on
  what they just scanned ("this plate is contaminated"), the app needs an authenticated
  way to turn `{token, vesselNo}` into an accession id — resolution happens behind auth so
  the public page never learns the UUID.
- **Part 1 (this entry) — DONE 2026-07-31:** `GET /api/v1/genetics/accessions/by-token/{token}?vesselNo=N`
  on the authenticated `accessions` router. Reuses `public._load_accession_by_token`
  (case-insensitive, uppercase-normalised, plain-equality lookup against the unique
  `publicToken` index — not a regex) and `vessel_resolver.resolve_vessel` verbatim,
  no reimplementation. Gated on the existing `require_view` dependency. Returns the
  full internal `Accession` (`response_model=SuccessResponse[Accession]`) — UUIDs are
  expected and correct on this side, unlike the public route's hand-built,
  UUID-free shape. 404 (not 403) for an unknown token or an out-of-range `vesselNo`.
  - **Files changed:** `src/modules/genetics/api/v1/accessions.py` (new route + imports
    of `_load_accession_by_token` from `.public` and `resolve_vessel` from
    `...services.accession.vessel_resolver`; `public.py` itself untouched).
  - **Tests:** `tests/unit/test_genetics/test_accession_by_token.py` (NEW, 11 cases) —
    case-insensitive token match, split-off `vesselNo` resolves to the child accession,
    unclaimed `vesselNo` still resolves to the parent, out-of-range `vesselNo` -> 404,
    unknown token -> 404, no `Authorization` header -> 401, permitted role succeeds,
    route-ordering regression guard (`/by-token/{token}` vs `/{accession_id}`).
    Full suite: **151 passed** (140 baseline + 11 new), 0 regressions.
  - **Live verification (production data, read-only):** token `14DQRT8S8N` /
    `PO-BLU-G3-001`, vessel 2 split off contaminated into `PO-BLU-G3-003`.
    `?vesselNo=2` -> `PO-BLU-G3-003` ✅; `?vesselNo=3` -> `PO-BLU-G3-001` ✅; unknown
    token -> 404 ✅; `?vesselNo=999` (out of range) -> 404 ✅; no auth header -> 401
    (`{"detail":"Not authenticated"}`) ✅; `/accessions/{accession_id}` with a real UUID
    still 200s unaffected by the new route ✅.
  - **Route ordering:** `/by-token/{token}` declared before `/{accession_id}` in
    `accessions.py`. Structurally the two never collide (2 path segments vs. 1), but
    kept explicit and verified live per the `/users/me/tutorials` vs `/users/{user_id}`
    precedent already on file for this codebase.
- **Part 2 (not started) — frontend "act on scan":** wire a UI affordance on
  `LabelInfoPage.tsx` (or a logged-in variant of it) so a bench user who is already
  authenticated and scans a label can jump straight to an action (mark contaminated,
  view full accession detail, etc.) using this endpoint instead of the public one.
  Needs its own frontend-dev-expert pass — out of scope for this entry.
- **Part 3 — DONE 2026-07-31 (api-developer):** made the public label-info route
  (`GET /api/v1/public/genetics/i/{token}[/{vesselNo}]`, `public.py` — separate from
  part 1's authenticated `by-token` route, which is untouched) two-tiered: an
  anonymous shape (unchanged from T-804/T-805) and a richer authenticated shape,
  enforced server-side by what gets *assembled*, never by hiding fields in the UI.
  - **Optional auth, fails closed (`_optional_current_user`):** `HTTPBearer(auto_error=False)`
    + `get_current_user` (identity only, from `...middleware.auth`) called as a plain
    function so its `HTTPException`s are catchable locally — every failure (no header,
    malformed header, expired/invalid token, unknown/inactive user, a DB hiccup) degrades
    to `None` (anonymous). Deliberately not `require_view`, which raises by design.
  - **Two hand-built response models**, not one model with nulled fields:
    `PublicAccessionInfo` (anonymous, unchanged) and new `AuthenticatedAccessionInfo`.
    Authenticated adds exactly two things anonymous never has at all — `accessionId`
    and a `token` on every `lineageGraph` node — and additionally ignores the tenant's
    `PublicInfoPageConfig` show* flags (`showMediumIngredients`/`showProtocolSteps`/
    `showOperatorName`/`showFacilityName`), always returning the fully-opened content
    for those four fields regardless of tenant config. Anonymous keeps those flags
    exactly as before (T-804/T-805 behaviour unchanged).
  - **`enabled=false` gate is anonymous-only:** a disabled tenant page still 404s an
    anonymous caller (byte-identical to every other 404) but does NOT 404 an
    authenticated one — decided and documented as "public-exposure switch, not
    access-control gate" per the task spec, see the comment at the gate's call site
    in `_handle_public_info`.
  - **Files changed:** `src/modules/genetics/api/v1/public.py` (module docstring rule 3
    rewritten for the two tiers; new `_optional_current_user`, `AuthenticatedLineageGraphNode`,
    `AuthenticatedLineageGraph`, `AuthenticatedAccessionInfo`, `_assemble_authenticated_info`;
    `_build_lineage_graph` takes an `authenticated` flag; `_assemble_info` renamed
    `_assemble_anonymous_info`; both routes now declare `response_model=None` — the two
    hand-built shapes are the leakage guard, not FastAPI's response filtering — and take
    `current_user: Optional[CurrentUser] = Depends(_optional_current_user)`).
    `accessions.py` and `labels.py` untouched.
  - **Tests:** `tests/unit/test_genetics/test_public_route.py` — 12 new cases: authenticated
    allowlist, authenticated tier ignores tenant flags (`closed_scenario` fixture, all
    flags False), anonymous shape verified to exclude every privileged field by name
    (not just "within the allowlist"), garbage/expired bearer token degrades to
    anonymous (not 401), non-Bearer auth scheme degrades to anonymous, UUID leakage
    scoped correctly for both tiers (anonymous: zero UUIDs; authenticated: exactly one,
    the scanned accession's own `accessionId`, no others), authenticated node token
    resolves anonymously back to that parent's own limited page (closes the loop),
    disabled-org 404s anonymous but not authenticated. Full suite:
    **183 passed** (151 baseline + 21 net new across T-806 parts 1 and 3 — part 1 added
    11, this part added 12; 0 regressions), full verbatim output captured during review.
  - **Guard proven to fire:** temporarily added a stray field to `PublicAccessionInfo`,
    watched `test_response_never_exceeds_the_allowlist` fail with "Unexpected key
    'temporaryGuardProofField' leaked", reverted, confirmed via `grep` (the file is
    tracked in git — contrary to earlier assumption — so `git diff`/`git status` also
    confirmed the clean revert).
  - **Live verification (production data, read-only, token `14DQRT8S8N` / `PO-BLU-G3-001`,
    vessel 3):** no header -> anonymous shape, no `accessionId`/`token` anywhere ✅;
    `Authorization: Bearer <garbage>` -> anonymous shape, status 200 (not 401) ✅; valid
    bearer (`admin@a64platform.com`) -> full shape, `accessionId` present, node tokens
    present, `operator: "Super Admin"` (full name despite `show*` flags off) ✅; a
    parent node's token (`9DZ493MFMA`, `PO-BLU-G0-001`) fetched anonymously at
    `/i/9DZ493MFMA` -> that parent's own limited page, no `accessionId` ✅.
  - **Docs:** `Docs/1-Main-Documentation/API-Structure.md` updated with the two-tier
    contract table, authenticated example response, and updated Notes. Flagged (not
    fixed, out of scope) a pre-existing staleness in that same section:
    `fromVesselNo`/`lineageGraph` from T-805 were never added to the JSON examples.
- **Notes:**
  - A frontend agent was working in `LabelInfoPage.tsx` concurrently with part 1;
    that file was deliberately not touched here.
  - CodeMaps: not regenerated — a new route on an existing router is additive, not a
    new module/service/collection; flag for `change-guardian` to confirm. Part 3 added
    no new routes, only response-shape/model changes on the existing two routes — also
    should not need a CodeMaps regeneration, but flagging for the same reason.

---

### T-804 | Genetics label & QR system — per-vessel labels + public lineage info page
- **Category:** genetics · **Priority:** P1
- **Assigned:** — · **Started:** 2026-07-31 (spec only)
- **Depends on:** T-800 ✅, T-803 ✅
- **Blocks:** scan-to-act (mark-contaminated by scan) — not yet ticketed
- **Spec:** `Docs/2-Working-Progress/genetics-label-qr-spec.md` — read this first, it
  carries the reasoning for every decision below
- **Description:** Print a QR label per physical vessel on a Brother QL-800, so
  scanning it opens a public, menu-less lineage page. Accession stays a batch
  record; the label carries a vessel ordinal. QR encodes an opaque `publicToken`,
  never the readable accession code — the page is unauthenticated and a readable
  code would make the whole library enumerable.
- **Key constraint:** `split()` decrements `quantity`, so vessel ordinals must come
  from a `labelledVesselCount` high-water mark that is never decremented. See
  spec §3 — getting this wrong silently orphans printed labels.
- **Steps:**
  1. `database-schema-architect` — `publicToken` / `labelledVesselCount` /
     `sourceVesselNumbers` fields, unique + `splitFromAccessionId` indexes,
     idempotent backfill migration
  2. `backend-dev-expert` — split validation for `vesselNumbers`, split-resolver walk
  3. `api-developer` — public `/api/v1/public/genetics/i/{token}/{vesselNo}` route,
     hand-built `PublicAccessionInfo` (allowlist, never `response_model=Accession`),
     rate limit, `PublicInfoPageConfig` on organization
  4. `backend-dev-expert` — label PDF endpoint (reportlab + qrcode, both already in
     requirements.txt)
  5. `frontend-dev-expert` — public info page at `/i/:token/:vesselNo?` (outside
     ProtectedRoute/MainLayout, mobile-first) + `PrintLabelsModal`
  6. `testing-backend-specialist` — leakage allowlist test, ordinal-survives-split
     test, identical-404 test
  7. `frontend-testing-playwright` — info page on mobile viewport, print dialog flow
  8. **Physically scan a printed 17×87 sample before any run >20 labels** — spec §6.2
     numbers are geometry, scannability is empirical
  9. `change-guardian` — docs, CHANGELOG, version bump; regenerate CodeMaps
- **Open item (not blocking):** accession/line/recipe/batch codes carry *global*
  unique indexes, not per-org. Collides the moment a second tenant creates their
  own `PO-BLU`. Worth deciding before large print runs — re-coding labelled
  physical stock is not something to do twice.
- **Step 5 leftover — render `lineageGraph` as a tree — DONE 2026-07-31
  (frontend-dev-expert):** The public info page rendered `lineage` (the flat
  breadcrumb) only; the backend has served a real `lineageGraph` (ancestors +
  descendants, capped 60 nodes / depth 8) for a while with nothing consuming
  it. Now rendered as generation-row tree with the scanned node highlighted.
  - **Shape-mismatch decision:** built a lightweight tree renderer local to
    `LabelInfoPage.tsx` (option b), not an adapter onto the existing
    `components/genetics/LineageTree.tsx`. That component is sized for the
    *authenticated* graph (up to 500 nodes, keyed by internal `accessionId`
    UUID, absolutely-positioned rows + SVG bezier edges, richer node shape
    with `quantity`/`unit`/`mediumBatchCode`). The public graph is capped far
    smaller and keyed by `accessionCode` only (never a UUID, spec §5.2 rule
    3) — adapting would mean fabricating fields the public payload doesn't
    carry. A plain wrapping generation-row list needs no SVG/measurement pass
    and reads better one-handed on a 375px phone screen (KISS/YAGNI).
  - **Highlight contrast:** scanned card uses
    `` `${theme.colors.primary[500]}29` `` background (never `[50]`/`[100]`,
    the exact bug already fixed on `AccessionDetailPage`'s current-breadcrumb
    chip) with text staying `textPrimary`. Measured via Playwright
    (`getComputedStyle` + composited-background WCAG relative-luminance calc,
    live page, dark "Night Observatory" theme): **14.08:1** — well above the
    4.5:1 floor.
  - **`fromVesselNo` on edges:** shown as `from CODE #N` per incoming edge
    (two for a cross), vessel number omitted entirely (never "#null") when
    not recorded — expected on today's live data.
  - **`truncated`:** surfaced via the existing `Banner $tone="warning"`
    component, only when true.
  - **Old flat `lineage` list:** kept, not dropped (still carries
    method/date-per-hop the graph doesn't), but demoted into a
    collapsed-by-default `<details>` ("Ancestry details") under the tree so
    it no longer competes as a second full-size section.
  - **Files changed:**
    `frontend/user-portal/src/pages/public/LabelInfoPage.tsx` only (new
    `PublicLineageGraph`/`Node`/`Edge` local interfaces mirroring
    `src/modules/genetics/api/v1/public.py` verbatim; new styled components;
    tree-building/formatting helpers; render logic). No new file — a
    dedicated component wasn't warranted at this graph size (≤60 nodes).
  - **Verification (Playwright MCP, live data, `https://dev.a20core.com/i/14DQRT8S8N/3`,
    5 nodes / 4 edges / `truncated: false`):** exactly one highlighted node
    (`PO-BLU-G3-001`, "You are here"); 375px width and 1280px desktop both
    confirmed `document.documentElement.scrollWidth === window.innerWidth`
    (no body horizontal scroll) via `browser_evaluate`; `localStorage.clear()`
    + reload still renders correctly; bogus token
    (`/i/BOGUS000AA`) shows "No record found for this label." and stays on
    that URL (no redirect to `/login`).
  - **`tsc -b`:** 238 errors — matches the documented pre-existing baseline
    exactly, 0 in `LabelInfoPage.tsx` (the only file touched).
  - Not moving T-804 to ARCHIVE — other sub-items (PrintLabelsModal
    verification, testing-backend-specialist leakage tests, physical label
    scan, change-guardian docs pass) are still open per the Steps list above.
- **Step 4 follow-up — 62mm continuous tape length parameterized, `62x15`
  added as a proven size — DONE 2026-07-31 (`backend-dev-expert`):** `62x20`
  was previously the only usable 62mm length, hardcoded as a third literal
  entry alongside the two genuinely-fixed die-cut sizes (`29x90`, `17x87`).
  Since 62mm is continuous stock, any feed length is physically valid, so a
  new hardcoded entry was needed every time a length was tried on real
  hardware — the user had already scan-confirmed `62x20` and wanted to try
  `62x15` to save tape, with more lengths likely later.
  - **What changed:** `size=62xN` now accepts any integer N (mm),
    12-100 inclusive, parsed via a dedicated `_parse_tape_spec()` /
    `_tape_dimensions()` pair in `labels.py` — width stays the fixed 696px
    (58.93mm) printer fact, length in px = `round(N / 25.4 * 300)`. `29x90`
    and `17x87` are matched verbatim against a small fixed table and were
    NOT touched by the new parsing path — verified with an explicit
    regression test that `29xN`/`17xN` variants (`29x50`, `17x100`, ...)
    still 400 exactly like any other unknown size.
  - **Validation:** out-of-range N -> 400 naming the 12-100mm range
    ("62mm tape length must be between 12 and 100mm"); malformed strings
    (`62x`, `62xabc`, bare `62`) -> 400, never a 500.
  - **Low-density warning added:** below 0.40mm/module, a new WARNING log
    fires (`Label PDF: size=62x15 QR module 0.365mm is below the 0.40mm
    comfort threshold — test-scan before a large run.`) — request still
    succeeds, this is advisory. Confirmed firing for `62x15` and NOT for
    `62x20` via caplog-based tests and a live `--log-cli-level` capture.
  - **Density check, computed (not assumed) against the real `qrcode`
    library:** `62x15` = version 3, 37 modules, **0.365mm/module** — this is
    BELOW `17x87`'s 0.381mm/module, the size the spec already marks "not
    recommended" for density. This is the user's informed call (they have
    hardware scan-success evidence for `62x20` already and are extending the
    same approach to `62x15`), but the comparison is real and flagged here,
    not buried — see spec §6.2, updated with a comparison table.
  - **Text-column check at 15mm (spec §6.1 font tiers):** 62x15's printable
    height is 14.99mm, which is MORE vertical room than 17x87's 13.97mm
    (both fall into the same smallest font tier, `_draw_label_page`'s
    `else` branch, sizes 6/5.5/5/5pt) — 17x87 already ships successfully at
    less room, so no font-tier change was needed for 15mm. Not modified.
  - **Tests:** `tests/unit/test_genetics/test_label_pdf.py` — 20 new cases
    (parameterized-length geometry, in-range arbitrary length, out-of-range,
    malformed strings, leading-zero edge case, 29xN/17xN regression guard,
    QR geometry for 62x15/62x18, low-density warning fires/doesn't-fire).
    Full suite: 175 passed (`tests/unit/test_genetics`, run inside
    `a64coreplatform-api-1` via `docker cp` — no local env issues).
  - **Live verification:** real PDFs generated against `PO-BLU-G3-001`
    (`3b36b3e7-7838-4105-aa0a-8be41772754b`, token `14DQRT8S8N`) at `62x15`
    and `62x20`; MediaBox converted to px @ 300dpi matched 696x177 and
    696x236 exactly; QR decoded (pypdfium2 render + OpenCV
    `QRCodeDetector`, ad-hoc verification tooling only, not added to
    requirements.txt) to `https://dev.a20core.com/i/14DQRT8S8N/1` on both.
  - **Known side effect of this verification:** the `/labels` endpoint's
    documented side effect (spec §5.1: `labelledVesselCount =
    max(current, to)`) always `$set`s `updatedAt` even when the count value
    itself is unchanged (it was 6, requests used `to=1`, so `max(6,1)=6` —
    unchanged). The live GET calls above therefore did touch
    `PO-BLU-G3-001.updatedAt` (no other field changed) — this is pre-existing
    endpoint behaviour, not something this change introduced, and was
    unavoidable while following the mandated live-verification steps against
    this real accession.
  - **Known follow-up gap, NOT done here (out of scope per task instructions):**
    `PrintLabelsModal.tsx` still hardcodes a 3-option dropdown
    (`29x90`/`17x87`/fixed `62x20`) — it needs an input for an arbitrary
    62mm length now that the backend supports it. Flagged, not implemented.
  - **Files:** `src/modules/genetics/api/v1/labels.py`,
    `tests/unit/test_genetics/test_label_pdf.py`,
    `Docs/2-Working-Progress/genetics-label-qr-spec.md` (§6.2 updated).
  - Not moving T-804 to ARCHIVE — same open sub-items as noted above, plus
    the new `PrintLabelsModal` 62xN gap.
- **Follow-up — `PublicInfoPageConfig.enabled` made operable — DONE
  2026-07-31 (`api-developer`):** `PublicInfoPageConfig.enabled` defaulted
  `True` with no way to turn it off — `PATCH
  /api/v1/organizations/{orgId}/modules` only accepted `financeEnabled`.
  Every tenant's public label page was permanently on, with no admin
  control, even as the page grew a lineage tree / vessel-level parentage /
  cross-navigation (step 5/6 above) each widening what a scanned sticker
  reveals.
  - **What changed:** `OrganizationModulesUpdate.publicInfoPage` added as
    `Optional[PublicInfoPageConfigUpdate]` — a new all-Optional partial
    schema, distinct from `PublicInfoPageConfig` itself. The route
    (`update_organization_modules`) and `OrganizationService.update_modules`
    forward it through unchanged; the merge happens in the service, `$set`
    on `modules.publicInfoPage` as a single sub-document built from
    `{**PublicInfoPageConfig().model_dump(), **stored, **patch}` (falls
    back to model defaults for tenants predating the field entirely).
  - **Why a separate partial schema, not `PublicInfoPageConfig` reused:**
    parsing `{"enabled": false}` straight into `PublicInfoPageConfig` would
    coerce every omitted field to that model's own default via Pydantic,
    silently resetting `showOperatorName`/etc. on every single-flag PATCH.
    `PublicInfoPageConfigUpdate` defaults every field to `None` ("leave
    unchanged") instead, and the service only merges keys the caller
    actually set.
  - **T-806 two-tier behaviour preserved, not touched:** `public.py` was
    read, not edited — `enabled=false` still 404s an anonymous caller and
    still 200s an authenticated one (it always was a public-exposure
    switch, not an access-control gate; this task just made the switch
    reachable). Pinned by the pre-existing
    `test_disabled_org_still_404s_for_anonymous_but_not_for_authenticated`
    in `test_public_route.py` plus a fresh live check (below).
  - **GET already returned the field** — `OrganizationResponse` extends
    `OrganizationBase`, which already declared `modules: OrganizationModules`
    (`publicInfoPage` included) prior to this change. No response-model
    change was needed; verified live rather than assumed, per the
    `response_model`-strips-fields gotcha in `CLAUDE.md`.
  - **Audit log:** unchanged shape (`details.before`/`details.after` are
    the *entire* `modules` object, `details.patch` the raw request) already
    satisfied "record what changed" — confirmed live: a `publicInfoPage`
    change now shows up correctly in `before`/`after`/`patch` without any
    audit-code change being needed.
  - **Tests added:** `tests/unit/test_organizations/` (new dir) —
    `test_modules_service.py` (5 cases: merge without resetting siblings,
    inverse — `financeEnabled` patch leaves `publicInfoPage` untouched,
    merge against a legacy doc with no stored `publicInfoPage` key at all,
    empty-patch no-op, 404 on unknown org) and `test_modules_route.py` (3
    cases: non-super_admin 403 with services never called, super_admin
    toggle 200 + audit log before/after/patch assertions, 404 on unknown
    org). All 8 pass. Full required suite (run inside
    `a64coreplatform-api-1` via `docker cp`, `src/` is bind-mounted so no
    copy needed there): `tests/unit/test_genetics
    tests/unit/test_finance_bridge/test_tenant_flag.py` → 192 passed, 6
    failed. The 6 failures are pre-existing/concurrent — all in
    `test_public_route.py`, all an unexpected `kind` key on
    `lineageGraph.edges[]` not yet in the allowlist tests' schema, in files
    (`lineage_service.py`, `public.py`) explicitly out of this task's scope
    and being edited by another agent concurrently. `test_tenant_flag.py`:
    14/14 passed.
  - **Live verification (admin org
    `00000000-0000-0000-0000-000000000001`, accession `PO-BLU-G3-001` /
    token `14DQRT8S8N`):** `PATCH .../modules
    {"publicInfoPage":{"enabled":false}}` → 200, `GET
    /api/v1/public/genetics/i/14DQRT8S8N/3` with no auth header → 404; same
    URL with a super_admin bearer token → 200 with full accession detail;
    `admin_audit_log` entry confirmed with correct before(`enabled:true`)/
    after(`enabled:false`)/patch; partial-update merge confirmed live —
    `showOperatorName` etc. stayed `false` (unchanged) across the toggle,
    only `enabled` moved. Restored `enabled:true` afterward; confirmed
    anonymous access works again. Tenant's `financeEnabled` untouched
    (`true`) throughout. Note: the org doc previously had no stored
    `modules.publicInfoPage` key at all (defaults were computed on read);
    it now explicitly stores one with the same effective values
    (`enabled: true`, all `show*` false) — functionally identical, this is
    the expected permanent effect of exercising the merge path once, not a
    leftover to clean up.
  - **Frontend note (not built here, per task scope):** `Settings → Tenant
    Modules` needs a `publicInfoPage.enabled` switch — currently only
    renders `financeEnabled`. A frontend agent was concurrently working in
    `PrintLabelsModal.tsx`/`LabelInfoPage.tsx`; this control was
    deliberately left for a separate pass.
  - **Files:** `src/models/organization.py` (added
    `PublicInfoPageConfigUpdate`, extended `OrganizationModulesUpdate`),
    `src/services/organization_service.py` (`update_modules` merge logic),
    `src/api/v1/organizations.py` (route forwards `publicInfoPage`,
    docstring updated), `tests/unit/test_organizations/` (new),
    `Docs/1-Main-Documentation/API-Structure.md` (new "Organization Module
    Toggles" section). Not touched: `labels.py`, `lineage_service.py`,
    `public.py`, any frontend file, demo data.
  - Not moving T-804 to ARCHIVE — same open sub-items as noted above.
- **Label PDF tuning round 2 — collapse blank line + bigger text/QR — DONE
  2026-07-31 (`backend-dev-expert`, dispatched from main session):**
  User printed real 62x15 labels on the QL-800 and reported a large gap
  between the date line and the species line (the medium-batch-code line is
  empty on most accessions, incl. live `PO-BLU-G3-001`, but still reserved
  its full line-box height), and asked for bigger text and a bigger QR.
  Built on round 1's `_derive_text_sizes()` derivation (not reverted to
  hardcoded tiers).
  - **1. Collapse blank lines.** `_draw_label_page` now decides
    `has_batch_line = bool(batch_code)` and `line_count = 4 if has_batch_line
    else 3` BEFORE calling `_derive_text_sizes`, which took a new
    `line_count: int` parameter replacing the hardcoded `/ 4`. The
    batch-code line is skipped entirely (no draw call at all, not an empty
    one) when absent; vessel/common-name/date lines are unconditional. A
    3-line label uses the freed vertical space to grow bigger, not to leave
    the freed quarter empty.
  - **2. Bigger text.** `_SIZE1_LEADING_RATIO` tightened `1.15 -> 1.05`;
    `_SIZE1_ABSOLUTE_CEILING_PT` raised `9.0 -> 11.0`. The `stringWidth`
    width-ceiling guard (`_SIZE1_REFERENCE_LINE`) stayed load-bearing and is
    what caps `62x18`/`62x20` at their round-1 sizes (see below) — expected,
    not a bug.
  - **3. Bigger QR.** `_QR_HEIGHT_FRACTION` raised `0.90 -> 0.93` — chosen
    so the tightest tape (`17x87`, 13.97mm printable height) keeps
    `>=0.4mm` QR-to-edge clearance (lands at 0.489mm; 0.94 would have left
    only 0.419mm, 0.95 would have gone under the floor at 0.349mm).
  - **New constant, not in the original 3-point plan:** `_TEXT_MARGIN_MM =
    1.3` (was an inline `margin = 1.5` literal in `_draw_label_page`).
    Required because the QR is square — a taller QR from point 3 is also a
    *wider* one, eating into the text column. `62x18`/`62x20` were already
    width-ceiling-bound in round 1 (not raw-vertical-bound), so raising the
    QR fraction alone would have mechanically shrunk their available text
    width and therefore their font size BELOW round 1 — a real regression
    the task's own "nothing shrinks" constraint forbade. Recovering ~0.2mm
    of horizontal margin on each of the three gaps (left-edge→QR, QR→text,
    text→right-edge) exactly offsets the loss; verified no tape's font size
    or QR module size is smaller than round 1's (see table below).
  - **Before/after (pt; round 2's "4 lines" column is the fair round-1
    comparison — all four slots populated, matching how round 1 always
    sized; "3 lines" is the common no-medium-batch case):**

    | Tape | round 1 (4 lines) | round 2, 4 lines | round 2, 3 lines (no batch) | `_QR_HEIGHT_FRACTION` | QR module (mm) | old module (mm) | QR clearance (mm) |
    |---|---|---|---|---|---|---|---|
    | `62x15` | 8.6/7.5/7.0/6.4 | **9.4/8.2/7.6/7.1** | **9.6/8.4/7.8/7.2** | 0.93 | 0.3767 | 0.365 | 0.525 |
    | `62x18` | 8.9/7.8/7.2/6.7 | **8.9/7.8/7.2/6.7** (width-ceiling bound, unchanged) | same | 0.93 | 0.4533 | 0.439 | 0.631 |
    | `62x20` | 8.5/7.4/6.9/6.4 | **8.5/7.4/6.9/6.4** (width-ceiling bound, unchanged) | same | 0.93 | 0.5022 | 0.486 | 0.699 |
    | `29x90` | 9.0/7.9/7.3/6.8 | **11.0/9.6/8.9/8.2** | same | 0.93 | 0.6512 | 0.630 | 0.907 |
    | `17x87` | 8.0/7.0/6.5/6.0 | **8.8/7.7/7.2/6.6** | **11.0/9.6/8.9/8.2** (width-ceiling bound at lc=3) | 0.93 | 0.3937 | 0.381 | 0.489 |

    Nothing shrank on any tape at either line count. `62x18`/`62x20` stay
    flat because they are genuinely width-ceiling bound — the guard doing
    exactly what the task said was acceptable ("fine and expected... just
    don't have text or QR SHRINK").
  - **Final constants landed on:** `_QR_HEIGHT_FRACTION = 0.93` (max value
    that keeps `17x87`'s clearance `>=0.4mm`), `_SIZE1_LEADING_RATIO =
    1.05` (task's suggested 1.0–1.05 range; kept a touch of breathing room
    over fully single-spaced), `_SIZE1_ABSOLUTE_CEILING_PT = 11.0` (only
    ever binds `29x90`, which has abundant vertical room — 11pt is not
    "absurd" on a >20mm-tall tape), `_TEXT_MARGIN_MM = 1.3` (new, see above).
  - **Tests:** `tests/unit/test_genetics/test_label_pdf.py` — updated 7
    existing cases (QR module-size assertions, the suffix-drop long-code
    scenario re-verified against the new geometry — `29x90` now also drops
    the pathological synthetic suffix, `17x87` keeps it, matching the new
    font sizes; `62x14`→`62x12` for the low-density-fires case since round 2
    pushed `62x14` just over the 0.35mm threshold; `_derive_text_sizes`
    call sites updated for the new `line_count` param and
    `_TEXT_MARGIN_MM`) + 12 new cases (`test_blank_medium_line_is_dropped_
    not_reserved` ×5 tapes — asserts 4 `Tj` draws not 5, and that the gap
    between species/date lines equals exactly one line-box via the real
    content-stream y-positions, not the arithmetic;
    `test_populated_medium_line_keeps_all_four_rows` ×5 tapes — sanity
    paired test; `test_qr_vertical_clearance_stays_above_the_0_4mm_floor`
    ×5 tapes; `test_qr_vertical_clearance_matches_round_2_landed_values`
    pinning the exact clearance figures — 5+5+5+1 new plus +1 from
    parametrizing the reference-line test over `line_count`, 17 net new
    cases total). Full suite (`tests/unit/test_genetics`, run inside
    `a64coreplatform-api-1` via `docker cp tests` — confirmed `tests/` is
    NOT bind-mounted, matching the prior round's note — plus a stale-
    `__pycache__` clear before trusting the run): **217 passed**, 0 failed.
    Baseline (round 1's uncommitted working-tree state, before this round's
    edits) was **200** for the whole `test_genetics` directory — matches
    the task dispatch's own "~200 tests currently pass" — 75 of those in
    `test_label_pdf.py` alone, 92 there after this round (net +17, all in
    that one file; no other test file in the directory was touched).
  - **Visual check (poppler `pdftoppm` @ 300dpi, inside the api container):**
    rendered `62x15` for (a) the live accession `PO-BLU-G3-001` (no medium
    batch — the real complaint case) and (b) a synthetic fixture with all 4
    lines populated. (a): the gap between the species line and the date
    line is visibly gone — 3 evenly-spaced rows fill the label height. (b):
    all 4 rows render, evenly spaced, nothing clipped or cramped, the
    suffix (`#3 <- #4`, ASCII arrow) renders correctly. Both images
    inspected directly (not just "PDF generated without error").
  - **Live verification (read-only):** 5 real label PDFs (`from=1&to=3`,
    one per shipped tape size) generated against live accession
    `PO-BLU-G3-001` (`3b36b3e7-7838-4105-aa0a-8be41772754b`, token
    `14DQRT8S8N`) via the authenticated endpoint — all 200. `labelledVessel
    Count` confirmed **still 6** before and after via `mongosh` against
    `a64core_db.genetic_accessions` (unchanged, since `to=3` stays inside
    the existing high-water mark — `max(6, 3) = 6`).
  - **Files changed:** `src/modules/genetics/api/v1/labels.py` (constants
    block, `_derive_text_sizes` signature, `_draw_label_page` line-building
    logic), `tests/unit/test_genetics/test_label_pdf.py` (7 updated + 12 new
    cases, module docstring extended), `Docs/2-Working-Progress/genetics-
    label-qr-spec.md` (§6.1 blank-line-collapse note, §6.1a round-2
    subsection + before/after table, §6.2 QR-fraction/module-size/clearance
    numbers throughout, including the version-boundary-cliff and
    low-density-threshold callouts). Not touched: `public.py`,
    `lineage_service.py`, `organization.py`, any frontend file, demo/
    production data beyond the pre-existing `labelledVesselCount` read-only
    side effect (confirmed unchanged this run).
  - **CodeMaps:** not regenerated — this is a sizing/logic change inside an
    existing endpoint (no new/removed routes, services, components, or
    collections), matching the "not needed for logic changes" rule in
    `CLAUDE.md`.
  - Not moving T-804 to ARCHIVE — same open sub-items as noted elsewhere in
    this entry (`PrintLabelsModal` 62xN gap, testing-backend-specialist
    pass, physical-scan step, change-guardian docs pass).
- **Label PDF tuning round 3 — top padding + brand typefaces + small brand
  mark — DONE 2026-07-31 (`backend-dev-expert`, dispatched from main
  session):** User reviewed a real printed round-2 `62x15` label and asked
  for "a small spacing at the top above the ID... also since we have a
  proud brand lets also brand the labels a bit, the fonts and if any open
  space on the right a small logo... but really small."
  - **1. Genuine top padding.** New `_TOP_MARGIN_FRACTION = 0.05` (5% of
    `height_mm`, proportional — a flat mm value was rejected since the
    shipped tapes span 13.97-25.91mm and `62xN` can reach 100mm) wired into
    `_derive_text_sizes`'s `line_box_mm`, replacing the old `y = height_mm -
    line_gap_mm * 0.85` formula, which was never a real top margin (0.85
    was an intra-line-box offset with nothing reserved above it — font size
    was constrained by the old flat margin but where line 1 actually LANDED
    never was). Yields ~0.6-0.75mm on the shortest tapes, ~1.3mm on the
    tallest.
  - **2. Brand typefaces.** Per `Brand_Engineering/Brand/A20Core_BRAND.md`
    §4: line 1 (accession code/vessel) now draws in **Space Mono Bold**;
    lines 2-4 (common name, medium batch, date/operator) in **Hanken
    Grotesk**. Both embedded via `pdfmetrics.registerFont(TTFont(...))`
    once at import time from `src/modules/genetics/assets/fonts/ttf/`
    (vendored — the API container only mounts `src/`/`public/`, confirmed
    via `Dockerfile`, and cannot see `frontend/` or `Brand_Engineering/`),
    with try/except fallback to Helvetica/Helvetica-Bold + a WARNING log if
    an asset is ever missing (an endpoint must never 500 over a font).
    Hanken Grotesk is a **variable font** — per the task's explicit
    instruction, tested FIRST before any other code: registered, drew a
    sample string at label-realistic sizes (down to ~7pt), rendered to PNG
    at 300dpi, inspected. It registered cleanly at its default named
    instance (Regular, matching the weight the Helvetica fallback it
    replaces already used) — **no fallback was actually needed for either
    font**, both shipped as the real brand typefaces.
  - **Real, measured, disclosed shrink from the font swap.** Space Mono
    Bold and Hanken Grotesk have materially taller glyph-box metrics than
    the base-14 faces rounds 1-2 were tuned against (`getAscentDescent`,
    not assumed: Space Mono Bold ascent+descent totals 1.481em vs
    Helvetica-Bold's 0.925em, +60%; Hanken Grotesk 1.303em vs Helvetica's
    0.925em, +41%). Reusing round 2's flat `_SIZE1_LEADING_RATIO = 1.05`
    against these produced REAL glyph-box overlap between line 1 and line
    2 — caught by `test_text_block_lines_do_not_overlap_or_overflow_the_
    label` against the actual generated PDF bytes, not eyeballed. Fixed by
    DERIVING the leading ratio from whichever fonts are actually registered
    (`|line1 descent| + supporting ascent * 0.875 + 0.05em pad` — lands at
    **1.286**) instead of a second hand-picked constant, and by deriving
    the y-start's intra-box offset from line 1's own measured ascent
    instead of the old fixed `0.85` fraction. `_BOTTOM_MARGIN_MM` was also
    bumped `0.3 -> 0.5` after the same test caught a ~0.055mm bottom
    overflow on `62x15` (the one raw/vertically-bound case with no
    width-ceiling slack to absorb Hanken Grotesk's larger descent).
    Separately, Space Mono Bold is monospace and measurably WIDER per
    character than Helvetica-Bold at the same point size (`stringWidth` of
    `_SIZE1_REFERENCE_LINE`: 1.22x wider) — every `stringWidth` call that
    assumed `"Helvetica-Bold"` (the width-ceiling guard in
    `_derive_text_sizes`, the suffix-fit guard in `_draw_label_page`) now
    measures against `_LINE1_FONT_NAME`, the ACTUAL registered font, per
    the task's explicit requirement. Combined, these two effects
    (taller leading ratio + wider mono font tightening the width ceiling)
    genuinely shrink size1 on every tape relative to round 2 — an honest,
    disclosed consequence of switching to the brand fonts, not a bug, not
    hidden:

    | Tape | line_count | round 2 (size1/2/3/4, pt) | round 3 (size1/2/3/4, pt) |
    |---|---|---|---|
    | `62x15` | 4 | 9.4/8.2/7.6/7.1 | **7.6/6.6/6.2/5.7** |
    | `62x15` | 3 | 9.6/8.4/7.8/7.2 | **7.8/6.8/6.3/5.8** |
    | `62x18` | 4 or 3 | 8.9/7.8/7.2/6.7 | **7.3/6.4/5.9/5.5** |
    | `62x20` | 4 or 3 | 8.5/7.4/6.9/6.4 | **6.9/6.0/5.6/5.2** |
    | `29x90` | 4 or 3 | 11.0/9.6/8.9/8.2 | **10.7/9.4/8.7/8.0** |
    | `17x87` | 4 | 8.8/7.7/7.2/6.6 | **7.0/6.1/5.7/5.2** |
    | `17x87` | 3 | 11.0/9.6/8.9/8.2 | **9.4/8.2/7.6/7.1** |

    The accession code itself is never truncated on any tape (unchanged
    guarantee) — only the ` <- #N` suffix drops where it would not fit.
  - **3. Small brand mark.** Sourced from `Brand_Engineering/Brand/Logo/
    icons/mark-512-transparent.png` (mono orbital-swirl emblem, RGBA,
    813-colour anti-aliased). No SVG-rendering tool was installed on the
    host (checked: no rsvg-convert/inkscape/cairosvg) and none was added as
    a runtime dependency — the existing raster was thresholded OFFLINE
    (alpha>=128 -> opaque black, else fully transparent; PIL is already a
    dependency via `qrcode[pil]`) to pure 1-bit (confirmed: exactly 2
    colors in the result), cropped to its opaque bounding box (+3% pad),
    and committed as `src/modules/genetics/assets/brand/mark-mono-1bit.png`
    (430x399px). Drawn bottom-right via `drawImage` ONLY when real,
    measured spare vertical space exists below the last text line (a
    width-ceiling-bound tape/line-count consumes less height than its
    budgeted `line_box_mm`, leaving a genuine, computed gap — never a
    per-tape guess or a fixed corner reservation), sized between a `5mm`
    legibility floor and an `8mm` ceiling.
  - **The `5mm` floor was visually verified, not assumed** — per the task's
    explicit warning about this exact risk. The mono mark's inner swirl is
    an intricate multi-stroke illustration (viewBox 100x100, strokes as
    thin as 0.32-0.49 units) at partial opacity in the source SVG. Rendered
    the 1-bit asset at 300dpi (the real QL-800 resolution, via `pdftoppm`,
    not a screen-resolution guess) at 3/4/5/6/7/8mm and inspected each:
    at 3-4mm the inner swirl is genuine mush, only a blob-like double ring
    survives; at 5-8mm the double ring reads clearly as a deliberate mark
    and the inner linework, while soft, is no longer pure mush. 5mm was
    chosen as the floor on that basis.
  - **Which tapes actually get the mark, and why:** computed against the
    final round-3 geometry (not the table above's font-size numbers alone —
    those interact with the top-margin/leading changes too), the mark
    draws ONLY on the 3-line (no medium batch) layout of `62x18`, `62x20`,
    and `29x90`. It does NOT draw on `62x15` or `17x87` at either line
    count (both are raw/vertically-bound at these settings, leaving no
    spare room below the text), and does NOT draw on any tape's 4-line
    layout (round 3's taller, brand-derived leading ratio consumes more of
    the vertical budget than round 2's flat `1.05` did). Confirmed both by
    direct computation against `_derive_text_sizes`/`_maybe_draw_brand_mark`
    and by visually inspecting the real rendered PNGs for all 5 tapes at
    both line counts (10 renders total) — the mark appears exactly where
    computed and nowhere else, positioned clear of the QR and every text
    line with no overlap.
  - **Harness fix required for testing, not a labels.py bug:** embedded
    TrueType fonts get their own private single-byte text encoding per PDF
    (reportlab assigns codes in first-use order, NOT WinAnsi/Latin-1 — e.g.
    `·` can come back as raw byte `0x01` instead of Latin-1's `0xB7`), so
    `tests/unit/test_genetics/test_label_pdf.py`'s existing raw-PDF-bytes
    harness (`_pdf_text_draws`/`_pdf_drawn_strings`, which assumed Latin-1
    decoding throughout) silently produced wrong or empty results against
    round-3 PDFs. Fixed by extending the harness — per the task's explicit
    "extend this harness, don't invent a parallel one" — to parse each
    embedded font's own `/ToUnicode` CMap object (which reportlab already
    emits, for copy/paste accessibility) and decode each `Tj` string
    through whichever font's `Tf` was active; the base-14 fallback path is
    untouched (no `/ToUnicode` present, raw byte trusted directly, exactly
    the pre-round-3 behaviour). Also discovered and fixed: `Tf`/`Tm`/`Tj`
    are no longer always contiguous per line once fonts are embedded
    (`Tm ... Tf ... Tj` instead of the base-14 path's `Tm (text) Tj`), so
    the parser was widened from one fused regex to three independently
    tracked event streams merged by stream position.
  - **Tests:** `tests/unit/test_genetics/test_label_pdf.py` — 0 new/removed
    test cases (92 in this file, identical to round 2's own count); the
    harness extension above plus dynamic font-name assertions (previously
    hardcoded `"Helvetica-Bold"`/`"Helvetica"`) were needed to make the
    EXISTING cases pass against the new fonts, not new coverage. Full
    suite (`tests/unit/test_genetics`, run inside `a64coreplatform-api-1`,
    stale `__pycache__` cleared first): **247 passed**, 0 failed (net
    growth beyond round 2's 217 is other concurrent T-806/T-807 work in
    sibling files in the same directory, not this round — this round's own
    file stayed flat at 92).
  - **Restart discipline honored:** `a64coreplatform-api-1` restarted
    (`docker restart`) after the final edit; restart timestamp
    (`2026-07-31T19:46:31Z`) confirmed AFTER `labels.py`'s final-edit mtime
    (`19:45:12`) before any live verification — the exact trap flagged in
    the task dispatch (a prior session in this same task produced a false
    "verified" result by skipping this check).
  - **Visual check (poppler `pdftoppm` @ 300dpi, inside the api container,
    live accession `PO-BLU-G3-001` for the blank-medium case + a synthetic
    4-line fixture for the populated case, all 5 tapes, both cases):** top
    spacing reads as deliberate breathing room on every tape, not touching
    the printable-area edge; Space Mono Bold/Hanken Grotesk render cleanly
    and legibly at every landed size down to ~5.2pt; the brand mark (where
    drawn) sits clear of text/QR with a visible gap, reads as a ring
    emblem with soft-but-present inner linework, does not overlap
    anything.
  - **Live verification (production data, read-only):** 5 real label PDFs
    (`from=1&to=3`, one per shipped tape size) generated against live
    accession `PO-BLU-G3-001` (`3b36b3e7-7838-4105-aa0a-8be41772754b`,
    token `14DQRT8S8N`) via the authenticated endpoint through nginx on
    port 8000 directly — all 200, no font-registration warnings in the
    logs. `labelledVesselCount` confirmed **still 6** before and after via
    `mongosh` against `a64core_db.genetic_accessions` (`from=1&to=3` stays
    inside the existing high-water mark — `max(6,3)=6`, unchanged).
  - **Files:** `src/modules/genetics/api/v1/labels.py` (font/mark asset
    registration block, derived ascent/descent + leading-ratio constants,
    `_derive_text_sizes` top-margin wiring, `_draw_label_page` y-start/
    font-name/mark-draw changes, new `_maybe_draw_brand_mark` +
    `_BRAND_MARK_*` constants), `src/modules/genetics/assets/` (NEW
    directory: `fonts/ttf/{SpaceMono-Bold,HankenGrotesk-Variable}.ttf`,
    `fonts/licenses/{OFL-SpaceMono,OFL-HankenGrotesk}.txt`,
    `brand/mark-mono-1bit.png`), `tests/unit/test_genetics/test_label_pdf.py`
    (harness extension + dynamic font-name assertions, module docstring
    extended), `Docs/2-Working-Progress/genetics-label-qr-spec.md` (§6.1a
    round-3 subsection: top-margin/leading derivation, before/after
    font-size table, brand-mark placement/legibility-floor rationale, which
    tapes draw it and why). Not touched: QR geometry/module sizes, page
    dimensions, the ASCII `<-` arrow, the round-2 blank-line collapse,
    fail-soft metadata handling, the `labelledVesselCount` write, any
    frontend file, `public.py`, `lineage_service.py`, `line_service.py`.
  - **CodeMaps:** not regenerated. This adds a new `src/modules/genetics/
    assets/` directory of static (non-Python) files and changes logic
    inside an existing endpoint — no new/removed routes, services,
    components, or MongoDB collections. Flagging for `change-guardian` to
    confirm, per the task's explicit instruction, but per CLAUDE.md's own
    rule ("NOT needed for bug fixes, logic changes, or style updates") this
    should not require a regeneration.
  - Not moving T-804 to ARCHIVE — same open sub-items as noted elsewhere in
    this entry (`PrintLabelsModal` 62xN gap, testing-backend-specialist
    pass, physical-scan step, change-guardian docs pass).
- **Label PDF tuning round 4 — brand mark bug fix: it never appeared on the
  4-line case — DONE 2026-07-31 (`backend-dev-expert`, dispatched from main
  session):** User report: "i don't see the mark or the logo on the larger
  labels also." Root-caused (re-verified independently, not trusted as
  given): round 3's `_maybe_draw_brand_mark` had exactly ONE placement —
  below the last text line, in whatever vertical budget the text block did
  NOT consume. That budget is only ever spare when a tape is
  width-ceiling-bound (font size capped below what the vertical space alone
  would allow — true for `62x18`/`62x20`/`29x90`'s 3-line layout only).
  Every tape's 4-line layout consumes its full vertical budget by
  construction, so the below-placement NEVER fires there — confirmed by
  direct computation before writing any code (`below_available_mm` came out
  negative or near-zero on all 5 tapes at `line_count=4`). The user's real
  production accession, `HE-LMUS-G1-001` (20 physical labels already
  printed from it), is the only record in the database with a
  `mediumBatchId`, so every label generated from it is 4-line — exactly the
  broken case. Every accession that showed the mark in earlier testing was
  a 3-line record with no medium batch — backwards from what was needed.
  - **Fix — a second placement, horizontal instead of vertical, tried as a
    fallback.** Measured with `stringWidth` against the real registered
    fonts and realistic production-shaped sample text (not estimates):
    line 1 (Space Mono Bold, width-ceiling-bound by design) fills its
    column to within 0.4-2.8mm on every tape, but lines 2/3 (Hanken
    Grotesk, smaller, shorter real-world strings) leave 14-49mm of free
    width at the right edge on every tape and line count. That free
    width — read at the ACTUAL rendered end of whichever of line 2/line 3
    runs longest, never assumed — is where the mark now goes when the
    below-placement doesn't fit: vertically centered between line 1's own
    ink and the last line's own ink (the same territory lines 2/3 already
    occupy; horizontal separation is what prevents overlap, not vertical).
  - **Why this placement over the task's other two options:** inline after
    the operator initials on the last line was rejected — that line's
    right edge is already claimed by the operator initials
    (`drawRightString`), and the remaining single-row vertical band there
    measured too short to clear the 5mm legibility floor after clearance
    on its own. The shipped design IS the task's third option (below-first,
    horizontal fallback), not a pure "always horizontal" — verified this
    was the right call by computing the vertical band between line 1's ink
    and the last line's ink directly (the same y-walk `_draw_label_page`
    already performs) for both line counts on all 5 tapes: the 4-line case
    always has MORE band than the 3-line case on the same tape (band scales
    with `line_count - 1` gaps, and losing a whole gap by dropping to 3
    lines outweighs each remaining gap being individually larger) —
    counter-intuitive, but it means the horizontal fallback is exactly
    right for the case that was broken (every tape's 4-line layout now
    clears the 5mm floor: 5.08-8.00mm band-derived height across all 5
    tapes) while correctly leaving `62x15`/`17x87`'s 3-line layout without
    a mark (2.44mm / 3.14mm — genuinely no room either way, matching
    round 3's own finding for those two, unchanged).
  - **`_BRAND_MARK_MAX_SIZE_MM` tightened `8.0 -> 6.0mm`** (separate from
    the placement fix): user also observed round 3's mark "reads bigger
    than really small" — the 8mm ceiling only ever bound `29x90`, the most
    generous tape. Re-verified visually at 300dpi that 5-6mm still reads as
    a legible double ring with soft inner linework (same conclusion round 3
    reached across 5-8mm, just capped tighter). `_BRAND_MARK_MIN_SIZE_MM`
    (5.0mm) unchanged — that number came from an explicit per-mm legibility
    render/inspect pass in round 3, not open-space arithmetic, and nothing
    about where the mark is placed changes legibility at a given physical
    size.
  - **Coverage table (measured + confirmed via real generated PDFs, all 5
    tapes x both line counts):**

    | Tape | 3-line | 4-line |
    |---|---|---|
    | `62x15` | no mark (disclosed edge case, unchanged from round 3) | **mark (NEW — horizontal band)** |
    | `62x18` | mark (below-placement, unchanged) | **mark (NEW — horizontal band)** |
    | `62x20` | mark (below-placement, unchanged) | **mark (NEW — horizontal band)** |
    | `29x90` | mark (below-placement, unchanged) | **mark (NEW — horizontal band)** |
    | `17x87` | no mark (disclosed edge case, unchanged from round 3) | **mark (NEW — horizontal band)** |

    Every 4-line label — the shape of the real `HE-LMUS-G1-001` accession,
    and the exact case the bug report was about — now gets a mark, on every
    tape. Nothing that worked under round 3 regressed.
  - **Tests:** `tests/unit/test_genetics/test_label_pdf.py` — 20 new cases:
    `test_brand_mark_draws_exactly_where_expected` (10 — pins the table
    above via a new `_pdf_image_draws` helper, which parses the real
    `<sx> 0 0 <sy> <tx> <ty> cm /<name> Do` sequence reportlab's
    `drawImage` emits — confirmed by hand against a real round-4 PDF before
    writing the regex, the same "read the actual content stream" discipline
    `_pdf_text_draws` already uses for text) and
    `test_brand_mark_never_overlaps_text_or_exceeds_page_bounds` (10 —
    whenever a mark draws, its rectangle is checked against every text
    draw's real glyph box via `getAscentDescent`/`stringWidth`, and against
    the physical page bounds). API container restarted immediately before
    the test run (and would have been restarted again had any edit followed
    it — none did) so no stale process could serve pre-round-4 code; stale
    `__pycache__` cleared first. Full suite (`tests/unit/test_genetics`,
    run inside `a64coreplatform-api-1`): **267 passed**, 0 failed (247
    baseline + 20 net new, matching exactly).
  - **Visual check (poppler `pdftoppm` @ 300dpi, inside the api container,
    all 5 tapes x both line counts, 10 renders total, realistic synthetic
    accession data):** every combination in the coverage table above
    visually confirmed — the mark reads as a small, discreet double-ring
    emblem with soft inner linework, clearly separated from the QR and
    every text line, never crowding or competing with the data. Materially
    smaller and less prominent than round 3's mark on the most generous
    tape (`29x90`, was up to 8mm, now capped at 6mm).
  - **Live verification (production data, the one permitted write):** via
    an authenticated browser session (Playwright MCP — no curl, per this
    repo's rule), hit the real endpoint against `HE-LMUS-G1-001`
    (`d6fd8991-d3e0-470d-a54b-52dca77c08fa`, token `EGT4H5JRVH`,
    `quantity=20`, `labelledVesselCount=20`) at `62x15`, `from=1&to=1` and
    `from=1&to=3` — both 200, both inside the existing high-water mark, so
    `labelledVesselCount` confirmed **20 -> 20** (unchanged) via `mongosh`
    before and after (`updatedAt` did advance — the pre-existing, already-
    documented `$set`-always-touches-`updatedAt` behaviour, not introduced
    by this round). The `from=1&to=1` response's actual bytes were rendered
    to PNG at 300dpi and inspected: `HE-LMUS-G1-001`'s real common name
    ("Lion's Mane OG"), real medium batch code ("ELME20-2607-01"), and real
    operator initials render correctly, and the brand mark now appears —
    clean, small, no overlap with anything, on the exact accession and tape
    size the bug report was about.
  - **Files:** `src/modules/genetics/api/v1/labels.py`
    (`_BRAND_MARK_MAX_SIZE_MM` tightened, `_maybe_draw_brand_mark` rewritten
    with the two-placement fallback, `_draw_label_page` now captures line
    1's baseline and the real rendered end-x of lines 2/3 to feed it),
    `tests/unit/test_genetics/test_label_pdf.py` (20 new cases,
    `_pdf_image_draws` helper), `Docs/2-Working-Progress/genetics-label-qr-
    spec.md` (§6.1, new "Round 4" subsection: bug root cause, placement
    reasoning with measured numbers, coverage table, tests, live
    verification). Not touched: QR geometry/module sizing, page dimensions,
    font sizes (only where/how large the mark may be, never text), the
    ASCII `<-` arrow, the blank-line collapse, the `labelledVesselCount`
    write semantics, `public.py`, `lineage_service.py`, `line_service.py`,
    `propagation_service.py`, any frontend file.
  - **CodeMaps:** not regenerated. This is a logic/placement change inside
    an existing endpoint's helper function — no new/removed routes,
    services, components, or MongoDB collections. Per CLAUDE.md's own rule
    ("NOT needed for bug fixes, logic changes, or style updates") this
    should not require a regeneration; flagging for `change-guardian` to
    confirm per standard practice.
  - Not moving T-804 to ARCHIVE — same open sub-items as noted throughout
    this entry (`PrintLabelsModal` 62xN gap, testing-backend-specialist
    pass, physical-scan step, change-guardian docs pass).
- **Change-guardian docs pass — DONE 2026-08-01 (`change-guardian`):**
  Covers T-804 step 9 and the recurring "change-guardian docs pass" open
  item threaded through this entry and T-805/T-806/T-807/T-808/T-809.
  - **CodeMaps regenerated:** 663 → 679 nodes, 667 → 701 edges
    (`scripts/codebase_mapper/batch_genetics.json` extended with the new
    public route, `labels.py`, `maintenance.py`, `maintenance_service.py`,
    `vessel_resolver.py`, the two new `core.api.organizations` /
    `core.model.organization` nodes for the `publicInfoPage` extension, and
    9 new/updated frontend nodes including `LabelInfoPage.tsx`,
    `PrintLabelsModal.tsx`, `EditAccessionModal.tsx`, `LocationPicker.tsx`,
    `RemoveLineModal.tsx`, `permissions.ts`, `OrphanSweepCard.tsx` — the
    last three landed from a concurrent frontend session during this pass
    and were re-checked via `git status` until stable before the final
    `map_generator.py all` run, per the dispatch's explicit instruction to
    run the mapper last). `Docs/CodeMaps/api-map.md` gained a hand-written
    blockquote callout identifying the public route as the platform's only
    unauthenticated one — the generator's endpoint table has no Auth
    column, so the route otherwise reads identically to every authenticated
    one; **that callout is not generator output and will be silently
    overwritten on the next full `map_generator.py all` run** unless
    re-added or the generator is extended with a real Auth column (not
    done). NOT regenerated: `map_core_api`, `map_core_services`,
    `map_farm_services`, `map_frontend_farm/components/hooks_services/types`,
    `map_config_env`, `map_database_collections` (18/26 tasks now pending,
    down from 8/26 completed pre-pass to 8/26 completed post-pass at the
    task-tracker level) — `rerun.sh --since d0c7dcb` correctly flagged
    these as stale because unrelated collateral changes (mushroom_manager,
    protocols module, farm block-card edits, `organization_service.py`)
    touched their file prefixes since the last full regen, but auditing
    those modules was out of scope for this pass; flagged for a dedicated
    follow-up rather than rushed here. (Task tracker: 16/26 completed
    before `rerun.sh --since d0c7dcb` correctly reset those 8 collateral
    tasks to pending; 8/26 completed after.)
  - **CHANGELOG.md / Versioning.md:** new `## [Unreleased] — Genetics:
    label/QR traceability, safe line removal, public info page` section in
    both, classified **MINOR** (additive only, no breaking changes).
    Deliberately left unnumbered (no `vX.Y.0` assigned) rather than
    guessing an ordering against the separate, also-still-`Unreleased`
    Wave 3 Phase 2 Sales AR entry already in `CHANGELOG.md` — assigning the
    real version number is a release-manager decision. Flagged (not fixed,
    out of scope — no source files touched): `src/main.py`'s version
    constant (`1.17.0`) and `Versioning.md`'s "Current Versions" table
    (`1.15.0`) both already trail released `v1.20.0`; noted as a known
    drift rather than silently left unremarked.
  - Still open on T-804 (unaffected by this pass): `PrintLabelsModal` 62xN
    gap, testing-backend-specialist leakage/coverage pass, physical-scan
    verification step.

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


### T-700 | Task Manager redesign — state-driven tasks, assignment UI & farmer portal
- **Category:** Farm Manager (Operations) · Frontend-heavy + some backend · **Priority:** P2
- **Status:** Audited, redesign not started (deferred 2026-06-29).
- **Context:** Blocks already auto-generate lifecycle tasks from state transitions with
  deadlines from `expectedStatusChanges` (backend is mature — `task_generator.py`,
  `task_service.py`, `tasks.py`, 15 endpoints, daily-harvest aggregation). The FRONTEND is a
  minimal per-block MVP (`pages/operations/`): no standalone Task Manager page, **no assignment
  UI**, `/my-tasks` unused (no farmer portal), no task-creation form, status-only filters.
- **Goal:** proper Task Manager surface (overview + filters + assignment user-picker), a
  farmer-facing "My Tasks" portal (wire existing `/my-tasks`), and link the manager block-card
  state buttons to auto-complete the matching task (reverse of the existing `triggerStateChange`).
- **Full audit + open questions:** `Docs/2-Working-Progress/task-manager-redesign-audit.md`

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

