# Genetics Label & QR System — Specification

**Task:** T-804
**Status:** Draft — awaiting approval
**Author:** Viet Anh
**Date:** 2026-07-31
**Depends on:** T-803 (Genetics Repo), protocols module

---

## 1. Purpose

Put a scannable label on every physical vessel in the lab, so that scanning it
opens a public, menu-less page showing where that material came from: its
lineage tree back to founding material, the medium it sits on, the protocol
followed, and who made it.

The printed label is the only durable link between a plate on a shelf and the
record in the database. Everything in this spec exists to make that link
survive: reprints, batch splits, contamination, and the passage of years.

---

## 2. Decisions

These were settled before writing this spec. Recorded here so the reasoning
survives the decision.

| # | Decision | Rejected alternative | Why |
|---|---|---|---|
| D1 | **Label the vessel, not the batch.** Accession stays a batch record with `quantity`; the label carries a vessel ordinal. | One label per accession (120 identical labels) | Identical labels cannot distinguish the plate that contaminated from the 119 that did not. |
| D2 | **The vessel ordinal is not a separate record.** No `genetic_vessels` collection. | 120 documents per session | The ordinal only needs its own record when a vessel *diverges* — which `AccessionSplit` already handles. Creating 120 rows to describe 120 identical things is storage for its own sake. |
| D3 | **QR encodes an opaque token, not the accession code.** | `…/i/PO-BLU-G3-004` | The page is unauthenticated. A readable code is enumerable, and enumerable means the whole genetics library — strain names, recipes, personnel — is scrapeable by anyone who scans one label. |
| D4 | **Server-rendered PDF, printed through the Brother driver.** | WebUSB / Brother b-PAC SDK | b-PAC is Windows-only ActiveX and WebUSB is fragile. A PDF at exact label dimensions prints identically on Windows and Linux (CLAUDE.md cross-platform rule) with zero printer integration. |
| D5 | **Path-based `/i/{token}` on the existing host.** | `{company}.a20core.com/info/{id}` | Tokens are globally unique, so the tenant is not needed in the URL. Subdomains need wildcard DNS plus a wildcard TLS cert and nginx `server_name` changes — real infra work for a cosmetic gain. Deferred, not cancelled. |

---

## 3. The renumbering problem

This is the part that is not obvious, and the reason the data model below looks
the way it does.

`AccessionService.split()` **decrements the parent's `quantity`**:

```python
{"$inc": {"quantity": -data.quantity}}
```

So if 120 plates are printed as `#1`–`#120` and plate `#7` sectors and is split
off, the parent drops to `quantity: 119`. A vessel ordinal derived from
`quantity` would then top out at `#119` — meaning the physical label reading
`#120` now points at nothing, and `#7` is ambiguous between the parent and the
split child.

**The label is physical and permanent. The record is mutable. The ordinal must
belong to the label, not to the current state.**

### Resolution

1. The accession carries `labelledVesselCount` — a **high-water mark**, set when
   labels are first printed, and **never decremented**. Ordinals are always
   `1..labelledVesselCount`, independent of `quantity`.

2. A split records which physical vessels moved: `sourceVesselNumbers: [7]` on
   the child.

3. The public resolver, given `(token, n)`, walks forward: find any child where
   `splitFromAccessionId == this.id` and `n ∈ child.sourceVesselNumbers`. If
   found, resolve to that child and repeat (capped at `MAX_SPLIT_DEPTH = 10`).
   Otherwise the vessel is still part of this batch.

The label on plate 7 never changes. What the system *says* about plate 7 changes
the moment it is split off. That is the correct behaviour — the sticker is a
pointer, not a claim.

**`sourceVesselNumbers` is optional.** A split that does not name vessel numbers
still works exactly as it does today; the resolver simply finds no match and
reports the vessel as part of the parent batch. No existing behaviour changes.

---

## 4. Data model changes

### 4.1 `genetic_accessions`

Three new fields on `Accession` (`src/modules/genetics/models/accession.py`):

```python
publicToken: str = Field(
    default_factory=generate_public_token,
    max_length=16,
    description="Opaque public-page key. Not derived from any readable field.",
)
labelledVesselCount: int = Field(
    0, ge=0,
    description=(
        "High-water mark of printed vessel ordinals. Set on first label print, "
        "never decremented — a split reduces quantity but the labels already "
        "on the shelf keep their numbers."
    ),
)
sourceVesselNumbers: List[int] = Field(
    default_factory=list,
    description=(
        "Which physical vessel ordinals of the parent batch this record holds. "
        "Only set when created via a split that named them."
    ),
)
```

`AccessionSplit` gains:

```python
vesselNumbers: List[int] = Field(
    default_factory=list,
    description="Ordinals being split out, e.g. [7]. Optional; when given, "
                "must be within the parent's labelledVesselCount and not "
                "already claimed by a sibling split.",
)
```

**Validation on split** (400 on failure):
- `len(vesselNumbers) == 0` **or** `len(vesselNumbers) == quantity` — you cannot
  claim 3 ordinals while splitting 5 vessels.
- Every ordinal in `1..parent.labelledVesselCount`.
- No ordinal already claimed by an existing sibling split.

### 4.2 Token generation

`src/modules/genetics/services/common.py`:

```python
# Crockford base32 — no I, L, O or U, so a token read aloud off a label or
# typed from a smudged print cannot be misheard as another valid token.
_TOKEN_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
PUBLIC_TOKEN_LENGTH = 10


def generate_public_token() -> str:
    """Mint an unguessable public-page key (~1.1e15 space)."""
    return "".join(secrets.choice(_TOKEN_ALPHABET) for _ in range(PUBLIC_TOKEN_LENGTH))
```

Use `secrets`, not `random` — this is the only thing standing between a stranger
with one label and the rest of the library.

Minted at accession creation, not on first print. Printing stays a pure read
path. Collisions are handled by the unique index plus a bounded retry, matching
the existing `_MAX_CODE_ATTEMPTS` pattern in `AccessionService.mint_code()`.

### 4.3 Indexes

`src/modules/genetics/services/database.py`:

```python
await db[ACCESSIONS].create_index("publicToken", unique=True)
await db[ACCESSIONS].create_index("splitFromAccessionId")   # resolver walk
```

`splitFromAccessionId` is written today but never indexed — the resolver queries
it on every public scan, so it needs one regardless.

### 4.4 Organization config

Follows the existing `OrganizationModules` precedent in
`src/models/organization.py`:

```python
class PublicInfoPageConfig(BaseModel):
    """What a scanned label is allowed to reveal to the public internet."""
    enabled: bool = True
    showOperatorName: bool = False      # initials only when False
    showMediumIngredients: bool = False # recipe name always; ratios opt-in
    showProtocolSteps: bool = False     # protocol name/version always
    showFacilityName: bool = False      # never shows room, unit or position
```

Defaults are deliberately closed. Two of these are judgement calls, not
technical ones:

- **`showOperatorName`** — a technician's full name on a permanently public,
  crawlable page is a personal-data disclosure they did not consent to.
  Initials by default; full name is an explicit opt-in.
- **`showMediumIngredients`** — additive ratios are plausibly the most
  commercially sensitive thing in the repo. Recipe *name* is enough to make the
  page useful.

### 4.5 Migration

`scripts/migrations/t804_add_public_tokens.py`

- Backfill `publicToken` on every existing accession (unique, retry on clash).
- `labelledVesselCount = 0` and `sourceVesselNumbers = []` on existing records —
  the Pydantic defaults cover reads, but set them explicitly so the collection
  is queryable without `$exists` gymnastics.
- Idempotent: skip any document that already has a `publicToken`.
- Report counts; do not fail the whole run on one bad document.

---

## 5. API

### 5.1 Authenticated — label generation

```
GET /api/v1/genetics/accessions/{id}/labels
    ?from=1&to=120&size=29x90&format=pdf
→ application/pdf
```

- Permission: existing `require_view` on the genetics namespace. Printing is a
  read.
- Defaults must survive a split (§3): a split decrements `quantity` but
  deliberately never decrements `labelledVesselCount`, so a naive
  `labelledVesselCount + 1 .. quantity` default can invert once everything
  currently held is already labelled (e.g. `quantity=5, labelledVesselCount=6`
  after one plate splits off — `7..5` is invalid). The defaults are therefore:
  - If `labelledVesselCount < quantity` (still something unprinted): `from`
    defaults to `labelledVesselCount + 1`, `to` defaults to `quantity` — the
    natural call prints only what has never been printed.
  - If `labelledVesselCount >= quantity` (nothing new to print): `from`
    defaults to `1`, `to` defaults to `labelledVesselCount` — a full reprint
    of everything already labelled. Reprinting ordinals that split away is
    correct, not a bug: the physical ordinals are unchanged and a scan of a
    split-off ordinal resolves to the child accession via `resolve_vessel()`
    (§4.4). The label is a pointer, not a claim.
  - Explicit `from`/`to` query params are unaffected by any of this and still
    reject a genuinely inverted range with 400.
- Reprinting an already-printed range is allowed and expected — labels get
  peeled, smudged, and stuck to the wrong thing.
- **Side effect:** `labelledVesselCount = max(labelledVesselCount, to)`. This is
  the one write on this path and the reason it is not a pure GET in spirit;
  documented deliberately rather than split into a second call the UI would have
  to remember to make.
- `size` ∈ `29x90` | `17x87` | `62xN` (N = integer mm, 12–100 inclusive,
  e.g. `62x15`, `62x20`). Reject anything else with 400 rather than
  guessing: an out-of-range `62xN` 400s naming the valid range ("62mm tape
  length must be between 12 and 100mm"); a malformed size string (`62x`,
  `62xabc`, bare `62`) 400s too, never a 500. `29x90`/`17x87` are fixed
  die-cut stock and are matched verbatim — `29xN`/`17xN` are never valid,
  only `62xN` is parameterized (T-804 follow-up, 2026-07-31 — `62x20` added;
  a second follow-up the same day made the length a free parameter and added
  `62x15`) — see §6.2 for the density tradeoff and why `62x20` remains the
  preferred default going forward.
- Cap the range at 500 labels per request.

### 5.2 Public — the info page

```
GET /api/v1/public/genetics/i/{token}
GET /api/v1/public/genetics/i/{token}/{vesselNo}
```

**This is the first unauthenticated route in the platform.** Auth in this
codebase is per-route via `Depends(require_view)` and friends — there is no
global middleware to exempt — so a public route is created simply by omitting
the dependency. That makes it easy to create by accident, which is exactly why
the rules below are not optional.

**Mandatory constraints:**

1. **Hand-built response model.** A dedicated `PublicAccessionInfo` model,
   assembled field by field. **Never** `response_model=Accession` and never a
   `model_dump()` of an internal model with keys popped. The failure mode here
   is leaking, not stripping — the inverse of the `response_model` trap already
   documented in CLAUDE.md, and it fails silently in the more dangerous
   direction.
2. **Rate limited** via the existing Redis limiter — 30 req/min per IP. A
   10-character token is not brute-forceable, but the limiter is what makes that
   true in practice rather than in theory.
3. **Never returns:** `location.roomId`, `location.unit`, `location.position`,
   `notes`, `tags`, `createdBy`, `divisionId`, `organizationId`, internal UUIDs,
   or any parent's `publicToken`. A scanned label must not become a key to the
   rest of the lab.
4. **404 for everything.** Unknown token, disabled org, out-of-range vessel
   number — all 404, identical body. Never 403, never "token exists but org
   disabled": distinguishable errors are an enumeration oracle.
5. **Cache-Control: no-store.** Lineage changes; a proxy holding a stale tree is
   worse than a slow page.

**Response shape:**

```jsonc
{
  "accessionCode": "PO-BLU-G3-004",
  "vessel": { "number": 7, "of": 120, "splitOff": false },
  "generationLabel": "G3",
  "line":   { "code": "PO-BLU", "commonName": "Blue Oyster",
              "scientificName": "Pleurotus ostreatus", "kind": "fungus" },
  "form": "petri_dish",
  "status": "active",
  "acquiredAt": "2026-07-31T00:00:00Z",
  "medium": { "batchCode": "MEA-AC-2607-03", "recipeName": "Malt Extract Agar + AC",
              "ingredients": null },        // null unless showMediumIngredients
  "protocol": { "code": "SOP-AGR-001", "title": "Agar-to-Agar Transfer",
                "version": 2, "steps": null },
  "operator": "V.A.",                        // initials unless showOperatorName
  "facility": null,                          // unless showFacilityName
  "lineage": [
    { "depth": 0, "accessionCode": "PO-BLU-G3-004", "generationLabel": "G3",
      "method": "agar_to_agar", "performedAt": "2026-07-31T00:00:00Z" },
    { "depth": 1, "accessionCode": "PO-BLU-G2-014", "generationLabel": "G2",
      "method": "agar_to_agar", "performedAt": "2026-06-02T00:00:00Z" },
    { "depth": 2, "accessionCode": "PO-BLU-G0-001", "generationLabel": "G0",
      "method": null, "provenance": "Spore print, Aljunied 2025" }
  ]
}
```

`lineage` reuses `LineageService`'s existing BFS walk and its
`MAX_LINEAGE_DEPTH` / `MAX_LINEAGE_NODES` caps — no new traversal code, and no
unbounded query reachable without authentication.

---

## 6. Label layout

### 6.1 Content

```
┌───────────────┬──────────────────────────────┐
│               │  PO-BLU-G3-004 · #7 <- #4    │  ← code + vessel ordinal (+ source vessel), bold
│   ▄▄▄▄▄▄▄▄    │  Blue Oyster          G3     │  ← common name + generation
│   █ QR   █    │  MEA-AC-2607-03              │  ← medium batch
│   ▀▀▀▀▀▀▀▀    │  2026-07-31            V.A.  │  ← date + operator initials
└───────────────┴──────────────────────────────┘
```

Everything on the right is legible without a phone. If the network is down, the
QR is dead and the label still tells a technician what they are holding — which
is the whole point of printing text alongside it.

**Blank-line collapse (label PDF tuning round 2, 2026-07-31).** The medium
batch line is empty for most real accessions — including the live reference
accession `PO-BLU-G3-001`, which has no medium batch at all. Rather than
reserving that line's full line-box height and leaving a visible gap between
the species line and the date line (the exact complaint from real 62×15
hardware prints), `_draw_label_page` now builds its drawn-line list from only
the lines that actually have content FIRST — the medium batch line is the
only one of the four that is ever dropped this way (vessel/common-name/date
are effectively always present) — and sizes the type against that count
(`line_count` = 3 or 4), not a hardcoded 4. A 3-line label uses the freed
vertical space to grow bigger, not to sit empty. See §6.1a.

**Source vessel suffix (T-805b).** ``ParentRef.vesselNo`` (T-805a) records
which physical vessel of the *parent* batch this material was propagated
from. When the accession's first recorded parent has that field set, the
vessel line grows a `` <- #<parent vessel>`` suffix, e.g. `#7 <- #4` reads as
"vessel 7 of this batch, propagated from vessel 4 of the parent batch". When
no source vessel was recorded (parentage unknown, or noted without a vessel
number), the line renders exactly as it always has — no dangling arrow, no
`#7 <- ?`.

The arrow is the ASCII two-character sequence `<-`, never the Unicode glyph
U+2190 (`←`): the label PDF is built with reportlab's base-14 fonts
(`Helvetica`/`Helvetica-Bold`), which do not contain U+2190, and it would
print as a blank box on the thermal printer. `·` (U+00B7, the existing
separator) is Latin-1 and unaffected.

The suffix is also the one piece of this line that can be dropped: the tape
sizes have materially different text-column widths and font sizes (see
§6.1a/§6.2, `labels.py` `_TAPE_PRINTABLE_PX` / `_derive_text_sizes`), and
the accession code must never be truncated to make room for the suffix. The
label generator measures the actual rendered width of the candidate string
(`stringWidth` against the real font/size for that tape, not a guessed
character count) against that tape's real text column and drops the suffix
entirely — rendering the pre-T-805b line — if it would not fit. In practice
all three tape sizes comfortably fit realistic accession codes plus the
suffix; only pathological (very long code / very high ordinal) combinations
would ever trigger the drop.

### 6.1a Font size / leading (2026-07-31 follow-up)

> **This section describes round 1 as originally shipped.** `/4`, `1.15`,
> and `9pt` below were superseded by round 2 (same day) — see "Round 2"
> further down for the current `line_count`-aware formula and the current
> `1.05`/`11.0`/`1.3mm` constants. Left as-is for the change history.

**Real hardware feedback, `62×15` on a QL-800:** "scans well, but the fonts
are small with large gaps between the lines." Root cause was two decoupled
numbers in `_draw_label_page`: font size came from three hand-picked
`height_mm` tiers (`>=25` / `>=18` / else), while leading was
`line_gap_mm = height_mm / 4.4` — scaled off the whole PAGE, not off the type
actually being drawn. `62×15` (14.99mm) also fell into the tier tuned for
`17×87`, a tape with a much narrower text column (~42mm vs ~64mm), despite
the two having nothing else in common.

**Fix:** size1 (the vessel line — bold, largest, sets the vertical rhythm)
is now derived directly from the vertical space four stacked lines actually
have on THAT tape: `line_box_mm = (height_mm - 1.0) / 4`, then
`size1 = line_box_mm / 1.15` (mm → pt), clamped between a 6pt floor and the
smaller of a 9pt absolute ceiling and a width-derived ceiling (does the
realistic worst-case line — `PO-BLU-G3-001 · #3 <- #4` — still fit this
tape's real text column at that size, via `stringWidth`, not a guessed
character count?). Lines 2-4 keep their existing relative hierarchy as fixed
fractions of size1 (7/8, 6.5/8, 6/8 — the ratios the old `29×90` tier already
used, generalised). Leading is then derived FROM the final size1
(`line_gap_mm = size1_mm * 1.15`) instead of from `height_mm` — tied to the
type, not the page, which is the actual fix for "large gaps between the
lines." See `_derive_text_sizes` in `labels.py` for the implementation and
`tests/unit/test_genetics/test_label_pdf.py`'s
`test_text_block_lines_do_not_overlap_or_overflow_the_label` /
`..._do_not_exceed_the_text_column_width` for the content-stream
measurements (draw position + font size pulled out of the actual generated
PDF bytes) that back this up — not just "the arithmetic looks right".

| Tape | size1 / size2 / size3 / size4 (pt) — BEFORE | AFTER |
|---|---|---|
| `62×15` | 6 / 5.5 / 5 / 5 | **8.6 / 7.5 / 7.0 / 6.4** |
| `62×18` | 7 / 6.5 / 6 / 5.5 | **8.9 / 7.8 / 7.2 / 6.7** |
| `62×20` | 7 / 6.5 / 6 / 5.5 | **8.5 / 7.4 / 6.9 / 6.4** |
| `29×90` | 8 / 7 / 6.5 / 6 | **9.0 / 7.9 / 7.3 / 6.8** |
| `17×87` | 6 / 5.5 / 5 / 5 | **8.0 / 7.0 / 6.5 / 6.0** |

Every tape gained size — `62×15` (the reported complaint) gained the most
(+43% on size1), `29×90`/`62×20` (already "fine") gained modestly and are
clamped from growing further, `17×87` gained despite its very short
printable height because its wide text column no longer constrains it. None
regressed. All five sizes were re-verified against live accession
`PO-BLU-G3-001` (token `14DQRT8S8N`) — the exact font sizes drawn in the
real PDFs match this table.

**Round 2 (label PDF tuning, 2026-07-31, same day).** Real 62×15 prints
still showed "a large space between the date and the species" (see the
blank-line collapse fix in §6.1 — `line_count` is now 3 or 4, not a
hardcoded 4) plus a request for bigger text and a bigger QR. Three
constants changed together:

- `_SIZE1_LEADING_RATIO` tightened `1.15 -> 1.05` — less dead space between
  lines buys size1 directly (`size1_mm = line_box_mm / _SIZE1_LEADING_RATIO`).
- `_SIZE1_ABSOLUTE_CEILING_PT` raised `9.0 -> 11.0` — was only ever hit by
  `29×90`'s abundant vertical room; 11pt is still nowhere near "absurd" on a
  tape with >20mm of printable height.
- A new `_TEXT_MARGIN_MM` constant (`1.3mm`, replacing an inline
  `margin = 1.5` literal in `_draw_label_page`) — required because raising
  `_QR_HEIGHT_FRACTION` (§6.2) grows the QR's footprint in BOTH directions
  (it's square): on `62×18`/`62×20`, which were already bound by the
  width-derived ceiling (not the raw vertical one) in round 1, a bigger QR
  alone would have mechanically shrunk their available text-column width
  and therefore their font size below the round-1 table above — a real
  regression, not the acceptable "guard caps growth" case. Recovering
  ~0.2mm of horizontal margin on each of the three gaps (left-edge→QR,
  QR→text, text→right-edge) exactly offsets that loss.

| Tape | size1/size2/size3/size4 (pt) — round 1 (4 lines, all populated) | round 2, 4 lines (all populated) | round 2, 3 lines (no medium batch — the common case) |
|---|---|---|---|
| `62×15` | 8.6 / 7.5 / 7.0 / 6.4 | **9.4 / 8.2 / 7.6 / 7.1** | **9.6 / 8.4 / 7.8 / 7.2** |
| `62×18` | 8.9 / 7.8 / 7.2 / 6.7 | **8.9 / 7.8 / 7.2 / 6.7** (width-ceiling bound, unchanged) | **8.9 / 7.8 / 7.2 / 6.7** |
| `62×20` | 8.5 / 7.4 / 6.9 / 6.4 | **8.5 / 7.4 / 6.9 / 6.4** (width-ceiling bound, unchanged) | **8.5 / 7.4 / 6.9 / 6.4** |
| `29×90` | 9.0 / 7.9 / 7.3 / 6.8 | **11.0 / 9.6 / 8.9 / 8.2** | **11.0 / 9.6 / 8.9 / 8.2** |
| `17×87` | 8.0 / 7.0 / 6.5 / 6.0 | **8.8 / 7.7 / 7.2 / 6.6** | **11.0 / 9.6 / 8.9 / 8.2** (width-ceiling bound at this line count) |

Nothing shrank relative to round 1 on any tape at either line count.
`62×18`/`62×20` stay flat because they are genuinely width-ceiling bound —
the guard (`stringWidth` of `_SIZE1_REFERENCE_LINE` against the real text
column) naturally caps them there regardless of how much vertical room a
bigger ceiling or fewer lines would otherwise allow, which is expected
(the guard existed in round 1 too — see the "genuine conflict" note this
task was dispatched with). Verified against the real generated PDF bytes
(`_pdf_text_draws`/`getAscentDescent`/`stringWidth`), not just the
arithmetic — see `tests/unit/test_genetics/test_label_pdf.py`'s
`test_blank_medium_line_is_dropped_not_reserved`,
`test_populated_medium_line_keeps_all_four_rows`, and the extended
`test_reference_vessel_line_fits_on_every_tape_size` (now parametrized over
`line_count` 3 and 4). Also visually confirmed: `62×15` rendered to PNG
at 300dpi against the live accession `PO-BLU-G3-001` (no medium batch) shows
the gap gone — 3 evenly-spaced rows filling the label — and a synthetic
all-4-lines-populated `62×15` render is uncramped, nothing clipped.

**Round 3 (label PDF tuning, 2026-07-31, same day).** User request after a
real printed round-2 `62×15` review: "a small spacing at the top above the
ID... also since we have a proud brand lets also brand the labels a bit,
the fonts and if any open space on the right a small logo... but really
small." Three changes, all in `labels.py`:

1. **Genuine top padding.** The old `y` start
   (`height_mm - line_gap_mm * 0.85`) was never a real top margin — `0.85`
   was an intra-line-box baseline offset applied directly against the
   printable-area edge, with nothing reserved above it. A new
   `_TOP_MARGIN_FRACTION = 0.05` (5% of `height_mm`, chosen — not a flat mm
   value — because the shipped tapes span 13.97-25.91mm printable height and
   `62xN` can reach 100mm; a flat figure sized right for one end is wrong at
   the other) is now wired into `_derive_text_sizes`'s `line_box_mm` the
   same way the pre-existing (now bottom-only) margin was, and the y-start
   is derived from line 1's own measured font ascent instead of the old
   `0.85` fraction (see point 2 — that fraction stopped being correct once
   the font changed). Yields ~0.6-0.75mm of real top space on the shortest
   tapes up to ~1.3mm on the tallest.

2. **Brand typefaces.** Per `Brand_Engineering/Brand/A20Core_BRAND.md` §4:
   the vessel/accession-code line (line 1) now draws in **Space Mono
   Bold**, and the three supporting lines (common name, medium batch, date/
   operator) in **Hanken Grotesk**. Both are embedded TrueType fonts,
   registered once at import time via `pdfmetrics.registerFont(TTFont(...))`
   from `src/modules/genetics/assets/fonts/ttf/` (vendored from
   `frontend/user-portal/public/fonts/` — the API container cannot see
   `frontend/`), with a try/except fallback to `Helvetica-Bold`/`Helvetica`
   if a font asset is ever missing or fails to register (an endpoint must
   never 500 over a missing font). Both registered cleanly in practice —
   Hanken Grotesk is a variable font, verified by hand (registered, drew a
   sample string at label-realistic sizes, rendered to PNG at 300dpi,
   inspected) before being wired in; reportlab reads its default named
   instance (Regular, matching the weight the Helvetica fallback it
   replaces already used).

   Both fonts have materially different glyph-box metrics than the base-14
   faces rounds 1-2 were tuned against — measured via reportlab's own
   `getAscentDescent`, not assumed: Space Mono Bold's ascent+descent totals
   1.481em vs Helvetica-Bold's 0.925em (+60%); Hanken Grotesk 1.303em vs
   Helvetica's 0.925em (+41%). Reusing round 2's flat `_SIZE1_LEADING_RATIO
   = 1.05` against these taller fonts produced REAL, measured glyph-box
   overlap between line 1 and line 2 (caught by
   `test_text_block_lines_do_not_overlap_or_overflow_the_label` against the
   actual generated PDF bytes). The ratio is now DERIVED from whichever
   fonts are actually registered (`|line1 descent| + supporting ascent *
   0.875 + a 0.05em safety pad`, using the same `size2/size1 = 0.875`
   fraction the layout already uses) rather than a second hand-picked
   constant — it lands at **1.286** with the brand fonts, versus ~0.98 if
   the fallback ever triggers both roles onto Helvetica.

   Space Mono is also monospace and noticeably WIDER per character than
   Helvetica-Bold at the same point size (measured: `stringWidth` of
   `_SIZE1_REFERENCE_LINE` is 1.22× wider in Space Mono Bold). Combined with
   the taller leading ratio above, this genuinely shrinks size1 on every
   tape relative to round 2 — an honest, disclosed consequence of the font
   change, not a bug (the width-ceiling guard and the top-margin/leading
   changes together control it; nothing was fudged to hide it):

   | Tape | line_count | round 2 (size1/2/3/4, pt) | round 3 (size1/2/3/4, pt) |
   |---|---|---|---|
   | `62×15` | 4 | 9.4 / 8.2 / 7.6 / 7.1 | **7.6 / 6.6 / 6.2 / 5.7** |
   | `62×15` | 3 | 9.6 / 8.4 / 7.8 / 7.2 | **7.8 / 6.8 / 6.3 / 5.8** |
   | `62×18` | 4 or 3 | 8.9 / 7.8 / 7.2 / 6.7 | **7.3 / 6.4 / 5.9 / 5.5** |
   | `62×20` | 4 or 3 | 8.5 / 7.4 / 6.9 / 6.4 | **6.9 / 6.0 / 5.6 / 5.2** |
   | `29×90` | 4 or 3 | 11.0 / 9.6 / 8.9 / 8.2 | **10.7 / 9.4 / 8.7 / 8.0** |
   | `17×87` | 4 | 8.8 / 7.7 / 7.2 / 6.6 | **7.0 / 6.1 / 5.7 / 5.2** |
   | `17×87` | 3 | 11.0 / 9.6 / 8.9 / 8.2 | **9.4 / 8.2 / 7.6 / 7.1** |

   The width-ceiling guard (`_SIZE1_REFERENCE_LINE` against `stringWidth`)
   is re-measured against whichever font line 1 actually registers as
   (`_LINE1_FONT_NAME`), never a hardcoded `"Helvetica-Bold"` literal — the
   same fix applies to the per-page suffix-fit check. The accession code
   itself is never truncated on any tape; only the ` <- #N` suffix is
   dropped where it would not fit, exactly as before.

3. **Small brand mark.** The mono orbital-swirl emblem
   (`Brand_Engineering/Brand/Logo/icons/mark-512-transparent.png`),
   pre-processed OFFLINE (not a runtime dependency) by thresholding its
   anti-aliased alpha to pure opaque-black-or-transparent (thermal printing
   is 1-bit; the source's 813-colour anti-aliasing would dither to mush)
   and cropped to its opaque bounding box, committed as
   `src/modules/genetics/assets/brand/mark-mono-1bit.png`. Drawn bottom-
   right of the text column via `drawImage`, but ONLY when real, measured
   spare vertical space exists below the last text line after the top
   margin and text block are accounted for — never by crowding. A tape/
   line-count combination whose font size is width-ceiling-bound (see the
   table above) consumes less height than its budgeted `line_box_mm`,
   leaving a genuine gap; that gap (not a per-tape guess) is what gets
   measured and, if `>= 5mm` (the legibility floor — see below), filled up
   to an `8mm` ceiling (a lab label has no use for a bigger logo even on a
   tall tape).

   The `5mm` floor is not a guess: the asset was rendered at 300dpi (the
   real QL-800 resolution, via `pdftoppm`) at 3/4/5/6/7/8mm and visually
   inspected before this number was chosen. Below ~5mm the swirl's finest
   strokes (0.32-0.49 of a 100-unit viewBox — already delicate before any
   print-resolution constraint) collapse into an indistinct blur; only the
   bold outer double ring survives. At 5-8mm the double ring reads clearly
   as a deliberate mark and the inner linework, while soft, is no longer
   pure mush.

   Computed against the final round-3 geometry, the mark draws ONLY on the
   3-line (no medium batch) layout of `62×18`, `62×20`, and `29×90` — never
   on `62×15` or `17×87` at either line count, and never on any tape's
   4-line layout (round 3's taller, brand-derived leading ratio consumes
   more of the vertical budget than round 2's did, leaving materially less
   width-ceiling leftover than an earlier estimate against round 2's
   numbers suggested). Verified against real rendered PNGs, not just the
   arithmetic — see the T-804 backlog entry for the visual assessment.

**Tests:** `tests/unit/test_genetics/test_label_pdf.py` — no test cases
added or removed (92 in this file, same as round 2's count), but the
content-stream-parsing harness (`_pdf_text_draws`/`_pdf_drawn_strings`) was
extended: embedded TrueType fonts get their own private single-byte
encoding per PDF (reportlab assigns it in first-use order, NOT
WinAnsi/Latin-1 — e.g. `·` can come back as raw byte `0x01` instead of
Latin-1's `0xB7`), so byte-for-byte Latin-1 decoding of drawn text is no
longer sufficient for lines 1-4. The harness now also parses each embedded
font's own `/ToUnicode` CMap object (which reportlab already emits, for
copy/paste-accessibility, mapping byte code -> real Unicode codepoint) and
decodes each `Tj` string through whichever font's `Tf` was active — the
base-14 fallback path is untouched (no `/ToUnicode` object, raw byte trusted
directly, matching pre-round-3 behaviour exactly). The `Tf`/`Tm`/`Tj`
operators were also no longer always contiguous per line once fonts are
embedded (`Tm ... Tf ... Tj` instead of `Tm (text) Tj`), so the parser was
widened from "one fused Tm+Tj regex" to three independent event streams
merged by stream position. Full suite (`tests/unit/test_genetics`, run
inside `a64coreplatform-api-1`, stale `__pycache__` cleared first): **247
passed**, 0 failed (net growth beyond round 2's own count is from other
concurrent T-806/T-807 work in the same directory, not this round).

**Files:** `src/modules/genetics/api/v1/labels.py` (font/mark asset
registration, `_derive_text_sizes` top-margin + derived-leading-ratio
wiring, `_draw_label_page` y-start/font-name/mark-draw changes, new
`_maybe_draw_brand_mark`), `src/modules/genetics/assets/` (new — fonts +
mark, see the T-804 backlog entry for the exact file list),
`tests/unit/test_genetics/test_label_pdf.py` (harness extended per above;
font-name assertions made dynamic). Not touched: QR geometry/module sizing,
page dimensions, the ASCII `<-` arrow, the round-2 blank-line collapse, the
`labelledVesselCount` write, `public.py`, `lineage_service.py`,
`line_service.py`, any frontend file.

**Round 4 (label PDF tuning, 2026-07-31, same day) — bug fix: the mark
never appeared on the case it mattered most.** User report: "i don't see
the mark or the logo on the larger labels also." Root cause: round 3's
ONLY placement was below the last text line, in whatever vertical budget
the text block did NOT consume — which is only ever spare when a tape is
width-ceiling-bound (font size capped below what the vertical space alone
would allow). That was true for `62×18`/`62×20`/`29×90`'s 3-line layout,
but false for **every tape's 4-line layout** (four stacked lines consume
the full vertical budget by construction) and false for `62×15`/`17×87` at
either line count (both are vertically-bound, not width-bound, at these
settings). The user's real production accession, `HE-LMUS-G1-001` — the
one with 20 physical labels already printed from it — is the only record
in the database with a `mediumBatchId`, so every label generated from it is
4-line: exactly the one case that never got a mark. Every accession that
showed the mark in earlier testing was a 3-line record with no medium
batch — backwards from what was needed.

**Fix: a second placement, tried as a fallback, using horizontal instead of
vertical slack.** Lines 2/3 (common name, medium batch code) draw in a
materially smaller size than line 1's width-ceiling-bound Space Mono Bold
and are typically much shorter strings. Measured with `stringWidth` against
the actually registered fonts and realistic production-shaped samples
(`"Blue Oyster  G3"`, `"MEA-AC-2607-03"`), they leave **14-49mm** of free
width at the right edge of the text column on every shipped tape and line
count — versus line 1's **0.4-2.8mm** (it fills the column by design; that
is what the width-ceiling guard in `_derive_text_sizes` is for). That free
width — read at the ACTUAL rendered end of whichever inner line (line 2,
and line 3 if present) runs longest, never assumed — is where the mark now
goes when the below-the-text placement doesn't fit: vertically centered
between line 1's own ink and the last line's own ink, i.e. the same
vertical territory lines 2/3 already occupy.

Three placements from the task brief were considered:

1. **Right-edge, vertically centered against the middle lines** (chosen).
2. Inline at the end of the last line, after the operator initials —
   rejected: the last line's right edge is already occupied by the operator
   initials (`drawRightString`), and its left side (the date string) is
   short but sits in a single-row band that measured too short to clear the
   5mm legibility floor on its own once clearance is subtracted (see the
   "why not extend the below-placement" note below) — no net improvement
   over just not drawing there.
3. **Keep the below-placement when it fits, fall back to (1) when it
   doesn't** (also chosen, combined with option 1) — this is the actual
   shipped behaviour: two placements tried in order, not one placement
   picked exclusively.

**Why the horizontal band, not just "more below-space":** the vertical gap
between line 1's ink and the last line's ink was measured directly (same
`y`-walk `_draw_label_page` already performs, read back per tape/line-count
via `getAscentDescent`) rather than assumed:

| Tape | line_count | vertical band, line1-ink to last-line-ink (mm) | mark height after clearance (mm) | fits >= 5mm floor? |
|---|---|---|---|---|
| `62×15` | 3 | 4.04 | 2.44 | no |
| `62×15` | 4 | 7.15 | 5.55 | **yes** |
| `62×18` | 3 | 3.75 | 2.15 | no (below-placement covers this case instead) |
| `62×18` | 4 | 7.07 | 5.47 | **yes** |
| `62×20` | 3 | 3.55 | 1.95 | no (below-placement covers this case instead) |
| `62×20` | 4 | 6.68 | 5.08 | **yes** |
| `29×90` | 3 | 5.52 | 3.92 | no (below-placement covers this case instead) |
| `29×90` | 4 | 10.38 | 8.00 (capped) | **yes** |
| `17×87` | 3 | 4.74 | 3.14 | no |
| `17×87` | 4 | 6.68 | 5.08 | **yes** |

The 4-line case always has MORE vertical band than the 3-line case on the
same tape, which is counter-intuitive at first (fewer lines usually means
more room) — but the band is `(line_count - 1)` multiples of `line_gap_mm`
minus the two end lines' own glyph depth, and losing a whole `line_gap_mm`
multiple by dropping to 3 lines outweighs each remaining gap being
individually larger. This is exactly why the horizontal-band placement is
the right fix for the reported bug (every tape's 4-line case now clears the
floor) while the two tightest tapes' 3-line case (`62×15`, `17×87`) still
cannot, on either placement — the disclosed edge case below.

**`_BRAND_MARK_MAX_SIZE_MM` tightened `8.0 -> 6.0mm`.** Separately from the
placement fix, the user also observed the round-3 mark "reads bigger than
[really small]" — round 3's ceiling let it reach a full 8mm on the most
generous tape (`29×90`). Re-checked visually at 300dpi (see below) that
5-6mm still reads as a legible double ring with soft inner linework, the
same conclusion round 3 reached across its wider 5-8mm band, just capped
tighter. `_BRAND_MARK_MIN_SIZE_MM` (5.0mm) is unchanged — that number came
from an explicit per-mm visual legibility test, not open-space arithmetic,
and this round's placement change doesn't affect legibility at a given
physical size, so it was not re-litigated.

**Resulting coverage (all 5 shipped tapes x both line counts):**

| Tape | 3-line | 4-line |
|---|---|---|
| `62×15` | no mark (disclosed edge case — genuinely no spare room either way) | mark (horizontal band) |
| `62×18` | mark (below-placement, unchanged from round 3) | mark (horizontal band) |
| `62×20` | mark (below-placement, unchanged from round 3) | mark (horizontal band) |
| `29×90` | mark (below-placement, unchanged from round 3) | mark (horizontal band) |
| `17×87` | no mark (disclosed edge case — genuinely no spare room either way) | mark (horizontal band) |

Every 4-line label — the case the bug report was about, and the shape of
the real `HE-LMUS-G1-001` accession — now gets a mark, on every tape. The
two 3-line combinations that still don't (`62×15`, `17×87`) are the same
two that never got one under round 3 either; nothing regressed.

**Tests:** `tests/unit/test_genetics/test_label_pdf.py` — 20 new cases:
`test_brand_mark_draws_exactly_where_expected` (10, one per tape/line-count
combination, pinning the table above via a real `_pdf_image_draws` count —
a new helper that parses the `<sx> 0 0 <sy> <tx> <ty> cm /<name> Do`
pattern reportlab's `drawImage` emits, the same "read the actual content
stream" approach `_pdf_text_draws` already uses for text) and
`test_brand_mark_never_overlaps_text_or_exceeds_page_bounds` (10 — whenever
a mark draws, its rectangle is checked against every text draw's real
glyph box, ascent/descent + `stringWidth`, never a guess, plus checked
against the physical page bounds). Full suite (`tests/unit/test_genetics`,
run inside `a64coreplatform-api-1`, stale `__pycache__` cleared first, API
container restarted immediately before the run so no stale process could
serve pre-round-4 code): **267 passed**, 0 failed (247 baseline + 20 new).

**Live verification (read-only beyond the one permitted label-generation
call):** real label PDFs generated via the authenticated endpoint (through
a logged-in browser session, per this repo's "no curl for API
verification" rule) against the real production accession
`HE-LMUS-G1-001` (`d6fd8991-d3e0-470d-a54b-52dca77c08fa`, token
`EGT4H5JRVH`, `quantity=20`, `labelledVesselCount=20`) at `62×15`,
`from=1&to=1` and `from=1&to=3` — both inside the existing high-water mark,
so `labelledVesselCount` stayed **20 -> 20** (confirmed via `mongosh`
before and after; `updatedAt` did advance, matching the pre-existing,
documented `$set`-always-touches-`updatedAt` behaviour noted in the T-804
follow-up entry, not something this round introduced). The `from=1&to=1`
response's actual bytes were rendered to PNG at 300dpi (`pdftoppm`) and
inspected: `HE-LMUS-G1-001`'s real common name ("Lion's Mane OG"), real
medium batch code ("ELME20-2607-01"), and real operator initials render
correctly, and the brand mark now appears — small, clear double ring,
positioned in the horizontal band beside the common-name/batch-code lines,
no overlap with any text or the QR.

**Files:** `src/modules/genetics/api/v1/labels.py` (`_BRAND_MARK_MAX_SIZE_MM`
tightened, `_maybe_draw_brand_mark` rewritten with the two-placement
fallback, `_draw_label_page` now captures line 1's baseline and the actual
rendered end-x of lines 2/3 to feed it), `tests/unit/test_genetics/
test_label_pdf.py` (20 new cases, `_pdf_image_draws` helper), this spec
(§6.1, this subsection). Not touched: QR geometry/module sizing, page
dimensions, font sizes (no font size changed — only where the mark is
placed and how large it may grow), the ASCII `<-` arrow, the blank-line
collapse, the `labelledVesselCount` write semantics, `public.py`,
`lineage_service.py`, `line_service.py`, `propagation_service.py`, any
frontend file.

### 6.2 QR sizing — read this before a bulk print run

**Corrected 2026-07-31 (T-804 follow-up).** The numbers below were originally
computed against the tape STOCK dimensions (90×29mm / 87×17mm). That was
wrong: a Brother QL-800, via the `brother_ql` driver, can only mark a smaller
PRINTABLE area within the stock — confirmed on real hardware for 29×90. The
PDF `pagesize` must equal the printable area, not the stock size, or anything
that rasterizes the page down to the printer's actual raster requirement
silently shrinks everything on the page — including the QR — by the
stock/printable ratio (~7% for 29×90). The numbers below are the corrected,
printable-area-based geometry; see `src/modules/genetics/api/v1/labels.py`
(`_TAPE_PRINTABLE_PX` for the two fixed die-cut sizes, `_tape_dimensions` for
the derivation, including the parameterized 62mm family below) for the
derivation.

**Added 2026-07-31 (T-804 follow-up, second round): `62×20` on continuous
tape.** `29×90` and `17×87` are DIE_CUT — fixed length, fixed printable area
in both directions, entirely dictated by the pre-cut stock. `62` is ENDLESS
(continuous) — only the tape WIDTH (62mm, 696px printable) is a printer fact;
the LENGTH is whatever we choose to feed, set to 20mm (236px) here because
20mm-long labels are the preferred size for this stock: easier to apply than
die-cut, and — see below — the QR stays on version 3 across the whole batch
range instead of dropping a version partway through like `17×87` does.

**Parameterized 2026-07-31 (T-804 follow-up, third round): `62×N` is now a
free integer, not a hardcoded catalogue entry.** 20mm was never a printer
fact — it was simply the first length tried and scan-confirmed. Since the
tape is continuous, there is no reason a *different* length should require a
code change: `size=62xN` now accepts any integer N (mm) in **12–100
inclusive** (`_TAPE_62_MIN_MM`/`_TAPE_62_MAX_MM` in `labels.py`), with the
feed length in px computed as `round(N / 25.4 * 300)`. Width stays the fixed
696px regardless of N. `29×90` and `17×87` remain exactly what they were —
fixed die-cut stock, matched verbatim, never parsed as `29xN`/`17xN`.

The first length tried beyond `62×20` is **`62×15`**, added here because the
user has direct hardware evidence it scans cleanly on their QL-800 (same as
`62×20` before it) and it uses less tape per label. See the density callout
below the table — `62×15`'s module size is honestly worse than `62×20`'s,
and worse than `17×87`'s (already marked "not recommended" in this doc), so
that comparison is stated plainly rather than left implicit.

QL-800 prints at 300 dpi (1 mm ≈ 11.8 px). A QR needs a 4-module quiet zone on
each side, so a version-3 symbol occupies `29 + 8 = 37` modules of width.

**Raised again 2026-07-31, label PDF tuning round 2: `_QR_HEIGHT_FRACTION`
`0.90 -> 0.93`.** Same-day hardware feedback on a printed `62×15` asked for
"the QR a bit bigger" too. 0.93 (not a rounder 0.95) was chosen against a
hard constraint: `clearance_mm = height_mm * (1 - fraction) / 2` must stay
`>= ~0.4mm` on the shortest of the five shipped tapes (`17×87`, 13.97mm
printable height) so thermal-feed registration tolerance never clips the
code. 0.93 leaves **0.489mm** on `17×87`; 0.95 would have dropped to
0.349mm, under the floor. The table below is the corrected, round-2
geometry — QR footprint (`qr_mm`) and module size both grew on every tape,
none shrank. See §6.1a for the paired `_TEXT_MARGIN_MM` tightening this
required (the QR is square, so a taller QR is also a wider one, eating
further into the text column).

| Tape | Form | Printable area (px @ 300dpi) | Printable area (mm) | Page size (pt) | QR size | Payload | Version | Module size | QR-to-edge clearance |
|---|---|---|---|---|---|---|---|---|---|
| **DK-11201 (29×90)** | die-cut | 991 × 306 (confirmed on real QL-800 hardware) | 83.90 × 25.91 | 237.84 × 73.44 | 24.09 mm | 38 bytes | 3 (29×29) | **0.651 mm** ✅ | 0.907 mm |
| **DK-11203 (17×87)** | die-cut | 956 × 165 (confirmed against `brother_ql`'s own label table — see below) | 80.94 × 13.97 | 229.44 × 39.6 | 12.99 mm | 38 bytes | 2 (25×25, alnum) | **0.394 mm** ⚠️ **not recommended** | 0.489 mm |
| **DK-22205 class (62×20)** | continuous | 696 × 236 (696 confirmed against `brother_ql`'s `"62"` endless entry; 236 = 20mm chosen feed length, not a printer constant) | 58.93 × 20.00 | 167.04 × 56.64 | 18.58 mm | 38–40 bytes | 3 (29×29) | **~0.502 mm** ✅ preferred | 0.699 mm |
| **DK-22205 class (62×18)** | continuous | 696 × 213 (213 = 18mm feed length) | 58.93 × 18.03 | 167.04 × 51.10 | 16.77 mm | 38–40 bytes | 3 (29×29) | **~0.453 mm** ✅ | 0.631 mm |
| **DK-22205 class (62×15)** | continuous | 696 × 177 (177 = round(15/25.4×300), 15mm feed length) | 58.93 × 14.99 | 167.04 × 42.48 | 13.94 mm | 38–40 bytes | 3 (29×29) | **~0.377 mm** ⚠️ **below 17×87** — user-verified on hardware, see below | 0.525 mm |

Module sizes for `62×N` above are computed by the real implementation
(`compute_qr_geometry` fed the actual `qrcode` payload), not hand-derived —
confirmed against a live token/payload as of this update:
`62×15` → version 3, 37 modules, **0.3767mm**/module (was 0.3645mm before
round 2); `62×18` → version 3, 37 modules, **0.4533mm**/module (was
0.4387mm); `62×20` → version 3, 37 modules, **0.5022mm**/module (was
0.4860mm). QR-to-edge clearance is pinned by
`test_qr_vertical_clearance_matches_round_2_landed_values` and floored at
`>=0.4mm` by `test_qr_vertical_clearance_stays_above_the_0_4mm_floor` in
`tests/unit/test_genetics/test_label_pdf.py`.

The 17×87 printable-px figure was verified against `brother_ql`'s own label
definitions (`pklaus/brother_ql`, `brother_ql/labels.py`, the `"17x87"` entry:
`dots_printable=(165, 956)`), not just recalled — `brother_ql` itself is not
a runtime dependency of this codebase (not in `requirements.txt`); only its
label table was consulted for this dimension.

The 62mm printable-width figure was verified the same way, against the same
file's `"62"` ENDLESS entry: `Label("62", (62, 0), FormFactor.ENDLESS, (732,
0), (696, 0), 12, feed_margin=35)` — `dots_printable=(696, 0)`, where the `0`
length is not a bug, it's the library's own convention for "length is not a
stock property on endless tape." 696px @ 300dpi = 58.93mm across the 62mm
tape.

QR size is derived, not hand-picked: `qr_mm = printable_height_mm * 0.93`
(raised from `0.90` in label PDF tuning round 2, 2026-07-31 — see above) — a
margin so the code is never flush against the printable-area edge,
expressed as a fraction of the tape's own printable height so it scales
with tape size instead of being a second hardcoded mm figure that can drift
out of sync the way the old 24mm/14mm targets did.

`https://dev.a20core.com/i/K7M2Q9XR4T/7` is 38 bytes → QR version 3 at EC level
M (42-byte capacity).

**29×90 is the default. `62×20` is the preferred size going forward** once
the frontend tape selector is updated (not yet done — currently hardcoded to
two options plus a fixed `62×20`, not yet a free-length input; see the
"Frontend" section below). At 0.651mm (29×90) and ~0.502mm (62×20) per
module, both scan reliably off a phone in poor light at an angle, which is
the actual condition in a lab.

**`62×15` is DENSER than `17×87` — read this before choosing it.** At
0.377mm/module, `62×15` sits *below* `17×87`'s 0.394mm/module, the size this
spec already marks "not recommended" a few paragraphs down for exactly that
reason. This is not hidden or rounded away — but as of the 2026-07-31
follow-up it also no longer trips the backend's low-density WARNING:
`62×15` is hardware-confirmed scanning cleanly on this lab's QL-800, so the
comfort threshold was **tightened from 0.40mm to 0.35mm** — a 0.40mm
threshold was firing a warning on a size that demonstrably works, which is
noise, not signal (`17×87` at 0.394mm stops warning under the new threshold
too, for the same reason: it prints, it just isn't the recommended
default). 0.35mm still warns below anything actually hardware-verified so
far (e.g. `62×12`, the shortest length the parser accepts at all, at
~0.302mm and denser — `labels.py` logs a WARNING:
`... QR module 0.302mm is below the 0.35mm comfort threshold — test-scan
before a large run.` — for any size, request still succeeds; see the
threshold table two paragraphs up). `62×14`, previously the reference "fires"
example, moved from ~0.340mm to ~0.351mm after round 2's QR-fraction raise
and now sits just OVER the threshold — a genuine consequence of a bigger QR,
not a bug, but worth noting since it moves a size from "warns" to
"doesn't warn" without anyone touching `62×14` directly. Choosing `62×15`
over `62×20` is a deliberate tradeoff (less tape per label) the user made
**with empirical scan-success evidence on their own QL-800**, the same
standard this spec already applies to every other size recommendation here
(§6.2's requirement to physically scan a sample before a run >20 labels). It
is not the recommended default; it is a validated option for someone who has
already done that scan test. Do not print an unscanned `62×15` batch >20
labels without repeating that scan test on the actual roll being used.

**17×87 is not recommended.** ~0.39mm modules are below the ~0.5mm commonly
cited as comfortable for phone cameras, and — unlike `62×20` — the payload
crosses a QR version boundary mid-batch: vessel numbers 1–9 (38 bytes) sit at
version 2 with uppercase forced, but the module size *drops* to ~0.351mm at
vessel #10 once the extra ordinal digit pushes the payload past the version-2
alphanumeric capacity. A 120-plate run on this stock prints two visibly
different QR densities in the same batch. `62×20` does not have this problem
— verified across vessel numbers 1, 9, 10, 99 and 120 (all four-digit-safe):
all five stay on version 3 at a flat ~0.502mm/module, because the extra
printable height (20mm vs 17mm) buys enough version-3 headroom that the
payload never approaches the version-3/version-4 boundary within any
realistic accession quantity. Reserve `17×87` only for stock where a `62×20`
or `29×90` label genuinely will not fit; if it must be used, uppercase
forcing (already implemented) is mandatory, not optional, and see the two
mitigations below.

Mitigations if `17×87` must be used:

1. **Print the payload in uppercase.** QR alphanumeric mode covers `0-9 A-Z` and
   `$%*+-./:` at ~1.7× the density of byte mode. Since Crockford base32 is
   uppercase already, `HTTPS://DEV.A64CORE.COM/I/K7M2Q9XR4T/7` (38 chars) fits
   **version 2** — 33 modules with quiet zone, **0.394 mm** at 12.99 mm (round 2:
   was 0.38mm at 12.57mm before `_QR_HEIGHT_FRACTION` was raised). Hosts are
   case-insensitive per RFC 3986; the path is not, so **the public route must
   match the token case-insensitively** for this to work. Worth the density gain,
   but does not eliminate the version-boundary cliff at vessel #10 noted above.
2. Reserve 17 mm tape for slim vessels — slants, cryo vials — where neither a
   29mm nor a 62mm label physically fits.

**Requirement: physically scan a printed sample on any new tape/size
combination before any run larger than ~20 labels.** The numbers above are
geometry; scannability is empirical, and a 120-plate run that turns out to be
unreadable is 120 plates that have to be relabelled by hand.

### 6.3 Implementation

`reportlab` (PDF, `pagesize` set to the PRINTABLE area in mm — 83.90×25.91 for
29×90, 58.93×20.00 for 62×20, derived from `991×306` / `696×236 px @ 300dpi`
respectively, **not** the tape stock size; see §6.2 correction and addendum)
+ `qrcode[pil]` — **both are already in `requirements.txt`** (lines 26 and
52; `qrcode` is there for MFA). No new backend dependency.

One label per PDF page, landscape. Print with **"Actual size" / scale 100%** —
any "fit to page" setting silently rescales the QR and is the most likely cause
of a batch that will not scan.

---

## 7. Frontend

### 7.1 Public info page — `/i/:token/:vesselNo?`

Registered in `App.tsx` **above** `<ProtectedRoute>`, alongside `/login` — no
`MainLayout`, no sidebar, no auth check, no division context.

- Must render for a logged-out visitor on a phone. Mobile-first.
- Lineage tree rendered vertically, newest at top, with generation badges reusing
  the existing `GenerationBadge` from `components/genetics/styled`.
- Its own minimal fetch — **not** the authenticated axios instance, which
  attaches tokens and will redirect to `/login` on 401.
- 404 state: "No record found for this label." Nothing more — do not hint at
  whether the token was malformed or simply unknown.
- Honour the Night Observatory theme so a scanned label looks like the product.

### 7.2 Print dialog — `PrintLabelsModal`

Opened from the accession detail view and, more importantly, from the
propagation success state — the moment you have just made 120 plates is the
moment you want 120 labels.

- Range inputs, defaulting to the unprinted range.
- Tape size selector. **`PrintLabelsModal.tsx` hardcodes a fixed
  three-option dropdown: `29×90`, `17×87`, and a single fixed `62×20`
  (defaulted). The backend's `62xN` free-length parameterization
  (2026-07-31, this follow-up) is NOT reflected in the UI at all — there is
  no way for a user to request `62×15` or any other 62mm length from the
  print dialog today.** Outstanding follow-up: replace the fixed `62×20`
  option with either a numeric length input (shown only when the `62`
  family is selected, validated client-side against 12–100mm before the
  request is even sent) or a short list of pre-scanned lengths (`62×15`,
  `62×20`, ...) the user can extend. Not implemented as part of this
  backend-only follow-up.
- On-screen preview of label #1 before committing to the print run.
- Downloads/opens the PDF; a short note about "Actual size" sits next to the
  button, because that is the setting people get wrong.
- Standard genetics `Modal` — focus trap, no backdrop close (per project
  convention).

### 7.3 Scan-to-act (follow-on, not this task)

Scanning while logged in should offer "mark contaminated", which performs the
split with `vesselNumbers: [7]` prefilled. This is what makes the split feature
— which currently exists but is hard to reach from the UI — genuinely usable.
Specified here so the data model supports it; **not in scope for T-804.**

---

## 8. Out of scope

- `{company}.a20core.com` subdomains (D5).
- Labels for medium batches, substrate batches, rooms, or harvests. The same
  token/PDF machinery generalises later; proving it on accessions first is the
  point.
- Direct printer control.
- Scan-to-act (§7.3).
- Populating `eventCode` on propagation events — see §10.

---

## 9. Task breakdown

| # | Work | Agent |
|---|---|---|
| 1 | Model fields, token generator, indexes, migration script | `database-schema-architect` |
| 2 | Split validation for `vesselNumbers` + resolver walk | `backend-dev-expert` |
| 3 | Public route, `PublicAccessionInfo`, rate limit, org config | `api-developer` |
| 4 | Label PDF endpoint (reportlab + qrcode) | `backend-dev-expert` |
| 5 | Public info page + `PrintLabelsModal` | `frontend-dev-expert` |
| 6 | Public-route leakage tests, split-ordinal tests, resolver tests | `testing-backend-specialist` |
| 7 | Info page on mobile viewport; print dialog flow | `frontend-testing-playwright` |
| 8 | Docs, CHANGELOG, version bump | `change-guardian` |

Order: 1 → (2, 3, 4 in parallel) → 5 → (6, 7) → 8.
CodeMaps regeneration required — new collection fields, new public route
namespace, new components.

**Test coverage that is not optional:**
- Public response contains **no** internal field. Assert against an explicit
  allowlist, so a future field added to `Accession` fails the test rather than
  silently leaking.
- Ordinal survives a split: print 120 → split `#7` → `/i/{token}/7` resolves to
  the child, `/i/{token}/8` still resolves to the parent, `/i/{token}/120` still
  resolves.
- `labelledVesselCount` never decreases across a split.
- Unknown token, disabled org, and out-of-range ordinal all return byte-identical
  404s.

---

## 10. Open items

**Codes are globally unique, not per-organization.** `accessionCode`, line
`code`, recipe `code` and `batchCode` all carry global unique indexes
(`database.py:71,81,111,121`). Fine with one tenant; a genuine collision the
moment a second organization creates their own `PO-BLU` — their accession
creation will simply 409 against a code they cannot see.

This does not block T-804 — `publicToken` is globally unique by design and is
unaffected. But **re-coding physical stock that has already been labelled is
not something to do twice**, so it is worth deciding the scoping rule before a
large print run rather than after.

**`eventCode` is dead.** `Propagation.eventCode` exists and is never populated.
If a label should ever cite the transfer session that produced it
(`TX-2607-014`), that needs minting. Not required for T-804.
