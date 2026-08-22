# DevLog — Plant Library Product Extension, Stage 3+4 (T-923)

## 1. Session Header
- **Date:** 2026-08-19
- **Session type:** Multi-agent feature build (backend Stage 3 + frontend
  Stage 4), continuing directly from the Stage 1+2 session earlier the
  same day. Design-doc-driven throughout.
- **Focus area:** `farm_manager` module — harvest batch submission and
  per-category routing, plus the UI that makes it reachable.
- **Status:** Stage 3 (backend) and Stage 4 (frontend) are both
  **complete and user-verified** — backend committed
  (`450629f`/`dbccb1f`/`fd9211a`, plus the `fd0f3d2` CHANGELOG entry for
  the folded-in bug fixes), frontend prepared this pass for commit. T-923
  archives with this session. The one thing Stage 3-5's original scope
  did not ship — batch **editing** (design §7's other half) — is filed
  forward as T-924. A separate, app-wide bug found during Stage 4
  verification (the React Query `refetchOnMount` default) is documented
  and committed independently of this feature.
- **Objective:** Let one harvest submission carry several products at
  once (e.g. green *and* red capsicum off one planting), each routed —
  sellable, process, or waste — to the correct inventory destination
  without disturbing the 48 existing consumers of `block_harvests`.

## 2. What We Accomplished
- **Backend (Stage 3):** `HarvestService.submit_harvest_batch` — validates
  every line up front (product on the block's mother, active; grade
  required for sellable/process, rejected for waste) before writing
  anything, so a bad line rejects the whole submission, never a partial
  write. Routes by category: sellable through the existing
  `record_harvest`/`_add_to_inventory` path (untouched shape, now
  accepting optional product/batch kwargs); process into a new
  `processing_inventory` collection; waste straight into
  `inventory_waste`. New `POST .../harvests/batch` and
  `GET .../harvests/batch-lookup?harvestDate=` (unions all three
  destinations by block+date, grouped by `harvestBatchId`).
  `GET /inventory/processing` for visibility. 5 new indexes. 9 new tests;
  full suite 883 passed, 1 skipped, 2 pre-existing unrelated failures.
- **Folded in during the same commits (documented separately,
  `CHANGELOG.md`'s `fd0f3d2` PATCH entry):** the variety-name-not-
  product-name bug in `_add_to_inventory`, the archive-repository product-
  link drop, and the `plant_data_enhanced` cross-tenant read leak.
- **Migration:** `plant_library_harvest_routing_migration.py`, run against
  production — 1 legacy `inventory_waste` row backfilled with
  `productId`/`harvestBatchId`, idempotency proven live.
- **Frontend (Stage 4):** `BlockHarvestEntryModal.tsx` rewritten for
  multi-line submission with a live per-block product picklist;
  `BlockHarvestsTab.tsx` gains a Product column + Batch Lookup entry
  point; new read-only `BlockHarvestBatchLookupModal.tsx`; `farmApi.ts`
  retires `recordBlockWaste` in favour of `submitHarvestBatch`/
  `getHarvestBatchLookup`; new `useBlocks.ts`/`useHarvestBatch.ts` hooks
  and a shared `harvestCategory.ts` vocabulary module.
- **Verification:** Frontend `npx tsc -b` — 234 errors / 129 TS6133,
  diffed byte-identical against the pre-Stage-4 baseline, zero new. User
  click-through verified the feature working end to end, including the
  live picklist (see §3.2 below for why that almost didn't work).

## 3. Design Reasoning Not Recoverable From the Diff

### 3.1 Why waste and process still must NOT become `block_harvests` rows
This decision was already the centrepiece of the Stage 1+2 DevLog (§3.1
there) as a warning about what Stage 3 must not do. It is worth
re-recording here, briefly, now that Stage 3 has actually shipped and the
warning has been honored — because the risk it describes doesn't expire
once the code lands; it re-opens every time someone touches this surface
again (T-924 will).

`block_harvests` is the sellable ledger. **48 backend references sum its
`quantityKg`**, including the finance P&L (`pnl_service.py:394`). If a
waste or process line were ever written as a `block_harvests` row — even
tagged with a category field — every one of those 48 call sites would
silently start including non-sellable weight in yield and revenue
figures. No crash, no error: numbers that just quietly grow.

Stage 3 avoided this the way the design doc specified: by destination,
not by filter. `sellable` still becomes a `block_harvests` row exactly as
before; `process` and `waste` never touch that collection at all. The
9-case test suite has one test that exists specifically to keep this true
mechanically, not just by code review: a 3-line batch (one of each
category) asserts it produces **exactly one** `block_harvests` row. If a
future change ever makes that assertion fail, it is very likely
reintroducing this exact bug, and it would fail silently in production if
the test weren't there to catch it first.

**Do not "simplify" this later by centralising everything into one
harvest table.** It would look like a reasonable cleanup — one collection
instead of three — and it would quietly break yield and the P&L for
every future harvest until someone noticed the numbers didn't add up.

### 3.2 The React Query trap — a general lesson, not just a Plant Library one
This is worth writing down on its own, separate from the routing
decision above, because it is not specific to this feature. It will bite
the next cross-page feature too if it isn't recognized on sight.

The bug: `frontend/user-portal/src/config/react-query.config.ts` had
`refetchOnMount: false` under a comment reading *"Don't refetch when
component remounts if data is still fresh."* Read that comment again —
it describes what `refetchOnMount: true` actually does (skip the refetch
only when the data is NOT stale). `false` does something stronger and
different: it suppresses the refetch unconditionally, stale or not. The
comment and the value had drifted apart, and nothing enforces that they
match — TypeScript can't catch a comment being wrong.

Why this was so hard to notice by symptom alone: `queryClient
.invalidateQueries()` does not itself force a refetch of a query with no
mounted observer — React Query marks it stale and waits for something to
subscribe (a mount, in practice). That's correct, documented behavior.
The bug was entirely in what happened *next*: when the component the
invalidated data belongs to finally did mount, `refetchOnMount: false`
suppressed the refetch that should have happened right then. Two
individually-reasonable-looking pieces of behavior (deferred refetch of
inactive queries; a config comment that sounded like it was describing a
safe optimization) combined into "the mutation appears to have silently
failed," specifically on any workflow that creates something on one
screen and expects to see it on another. `gcTime`'s default eventually
evicted the stale entry and forced a real fetch — five minutes later —
which is why this reads as a caching bug that "fixes itself" if you wait,
which is exactly the kind of bug that's easy to shrug off as a fluke
during manual testing instead of chasing to a root cause.

The lesson to carry forward: **a `staleTime`/`refetchOnMount`/`gcTime`
config comment that describes a specific behavior is a claim, not
documentation of what the code does — cross-check the value against the
comment, not just against "does this look like a reasonable default."**
Any future feature that creates data on one page and expects it visible
on another (a picklist, a dropdown, a summary count fed by a mutation
elsewhere) should treat "does the invalidated query actually refetch
when its component mounts" as something to verify explicitly, not assume
from `invalidateQueries()` alone.

The specific fix here: global default flipped to `true` (matches what
the comment always claimed); `useProductsForMother` additionally pins
`staleTime: 0` + `refetchOnMount: 'always'`, since design doc §5's
"live read from the mother, no staleness flag" requirement is a stronger
guarantee than "not stale" — pinning it locally means this stays correct
even if the global default drifts again in the future.

## 4. Bugs/Issues Discovered
None new this session beyond the React Query default (§3.2) and the
three carried in from Stage 3's audit (already fixed in the same commits,
documented in `CHANGELOG.md`'s `fd0f3d2` entry, not repeated here).

## 5. What We Need To Do Next
1. **T-924** (filed, Ready): batch edit/delete endpoint — the design §7
   capability this stage did not ship. `BlockHarvestBatchLookupModal.tsx`
   already reads the data this would act on; only the write side and its
   frontend action are missing.
2. **CodeMap regeneration** — flagged at Stage 1+2 close, flagged again
   here, still not done. Now 7 new endpoints, 1 new collection, and
   6+ new/changed frontend files deep. Worth pairing with running T-921's
   already-shipped fix (PR #6, `8860e4a`) — it seeded 7 previously-blind
   module tasks into the mapper's `setup.py` but those tasks haven't
   actually been run yet.
3. Design doc §11 items remain outstanding and untracked by any specific
   ticket: `sales_order_lines.cropName` free-text (13,281 rows), the dead
   `products` collection, legacy `plant_data`. Noted in T-924 so they
   don't vanish now both T-922 and T-923 are archived.

## 6. Important Context for Next Session
- **Deploy:** `docker restart <prefix>-api-1` required for the Stage 3
  backend changes (already restarted and verified this session per the
  commit trail). No backend restart needed for the Stage 4 frontend-only
  commit; Vite hot-reloads.
- **Migration already ran in production**
  (`plant_library_harvest_routing_migration.py --execute`) — re-running
  is safe (idempotent, gated on `productId` not already set) but should
  report `migrated: 0, skipped: 1` on this box from here on.
- The three commits already on this branch (`450629f`, `dbccb1f`,
  `fd9211a`) are backend-only; nothing in this session touched them
  further. This session's new work is entirely the frontend Stage 4 diff
  plus the React Query fix plus this documentation pass.
- User has click-through verified the harvest modal, including that the
  React Query fix actually resolved the picklist symptom — this was not
  re-verified independently through Playwright by this session (per
  standing instruction: don't auto-run Playwright after UI edits unless
  asked).

## 7. Files Modified
- **Frontend (Stage 4):**
  `components/farm/BlockHarvestEntryModal.tsx`,
  `components/farm/BlockHarvestsTab.tsx`,
  `components/farm/BlockHarvestBatchLookupModal.tsx` (new),
  `services/farmApi.ts`, `hooks/queries/useBlocks.ts` (new),
  `hooks/queries/useHarvestBatch.ts` (new), `utils/harvestCategory.ts`
  (new), `types/farm.ts`, `utils/index.ts`.
- **React Query fix (separate commit, app-wide):**
  `config/react-query.config.ts` (`refetchOnMount` default; also carries
  the unrelated new `harvestBatchLookup` query key, which belongs to the
  Stage 4 feature commit — split by hunk, not by file),
  `hooks/queries/usePlantMothers.ts`.
- **Docs (this pass):** this file; `CHANGELOG.md` (two new entries —
  Stage 3+4 feature, React Query fix); `Docs/1-Main-Documentation/
  Versioning.md` (two new Version History entries + drift-note update);
  `Docs/Backlog/BACKLOG.md` (T-923 archived, T-924 filed);
  `Docs/Backlog/ARCHIVE.md` (T-923 entry added, count bumped to 117);
  `Docs/2-Working-Progress/plant-library-product-extension-design.md`
  (status header updated to reflect what's built).
- **Backend (already committed, prior to this pass):** see commits
  `450629f`/`dbccb1f`/`fd9211a` for the authoritative file list.

## 8. Session Metrics
- **Tests:** Backend suite unchanged since the Stage 3 commits — 883
  passed, 1 skipped, 2 pre-existing unrelated failures. Frontend
  `tsc -b`: 234 errors (129 TS6133), byte-identical to the documented
  baseline, zero new.
- **Key achievement:** the Plant Library product extension is now
  reachable end to end, from picklist definition (Stage 1+2) through
  multi-line harvest submission and per-category routing (Stage 3)
  through the UI that drives it (Stage 4) — and a real cross-page cache
  bug was caught and fixed during verification rather than shipped
  alongside it.
