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
- `size` ∈ `29x90` | `17x87` | `62x20`. Reject anything else with 400 rather
  than guessing. `62x20` is a continuous tape (T-804 follow-up, 2026-07-31) —
  see §6.2 for why it is the preferred size going forward.
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

The suffix is also the one piece of this line that can be dropped: the three
tape sizes (62x20, 29x90, 17x87) have materially different text-column
widths and font-size tiers (see §6.2/`labels.py` `_TAPE_PRINTABLE_PX`), and
the accession code must never be truncated to make room for the suffix. The
label generator measures the actual rendered width of the candidate string
(`stringWidth` against the real font/size for that tape, not a guessed
character count) against that tape's real text column and drops the suffix
entirely — rendering the pre-T-805b line — if it would not fit. In practice
all three tape sizes comfortably fit realistic accession codes plus the
suffix; only pathological (very long code / very high ordinal) combinations
would ever trigger the drop.

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
(`_TAPE_PRINTABLE_PX`, `_build_tape_sizes`) for the derivation.

**Added 2026-07-31 (T-804 follow-up, second round): `62×20` on continuous
tape.** `29×90` and `17×87` are DIE_CUT — fixed length, fixed printable area
in both directions, entirely dictated by the pre-cut stock. `62` is ENDLESS
(continuous) — only the tape WIDTH (62mm, 696px printable) is a printer fact;
the LENGTH is whatever we choose to feed, set to 20mm (236px) here because
20mm-long labels are the preferred size for this stock: easier to apply than
die-cut, and — see below — the QR stays on version 3 across the whole batch
range instead of dropping a version partway through like `17×87` does.

QL-800 prints at 300 dpi (1 mm ≈ 11.8 px). A QR needs a 4-module quiet zone on
each side, so a version-3 symbol occupies `29 + 8 = 37` modules of width.

| Tape | Form | Printable area (px @ 300dpi) | Printable area (mm) | Page size (pt) | QR size | Payload | Version | Module size |
|---|---|---|---|---|---|---|---|---|
| **DK-11201 (29×90)** | die-cut | 991 × 306 (confirmed on real QL-800 hardware) | 83.90 × 25.91 | 237.84 × 73.44 | 23.32 mm | 38 bytes | 3 (29×29) | **0.63 mm** ✅ |
| **DK-11203 (17×87)** | die-cut | 956 × 165 (confirmed against `brother_ql`'s own label table — see below) | 80.94 × 13.97 | 229.44 × 39.6 | 12.57 mm | 38 bytes | 2 (25×25, alnum) | **0.38 mm** ⚠️ **not recommended** |
| **DK-22205 class (62×20)** | continuous | 696 × 236 (696 confirmed against `brother_ql`'s `"62"` endless entry; 236 = 20mm chosen feed length, not a printer constant) | 58.93 × 20.00 | 167.04 × 56.64 | 18.00 mm | 38–40 bytes | 3 (29×29) | **~0.486 mm** ✅ preferred |

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

QR size is derived, not hand-picked: `qr_mm = printable_height_mm * 0.90` —
a 10% margin (5% top, 5% bottom) so the code is never flush against the
printable-area edge, expressed as a fraction of the tape's own printable
height so it scales with tape size instead of being a second hardcoded mm
figure that can drift out of sync the way the old 24mm/14mm targets did.

`https://dev.a20core.com/i/K7M2Q9XR4T/7` is 38 bytes → QR version 3 at EC level
M (42-byte capacity).

**29×90 is the default. `62×20` is the preferred size going forward** once
the frontend tape selector is updated (not yet done — currently hardcoded to
two options). At 0.63mm (29×90) and ~0.486mm (62×20) per module, both scan
reliably off a phone in poor light at an angle, which is the actual condition
in a lab.

**17×87 is not recommended.** 0.38mm modules are below the ~0.5mm commonly
cited as comfortable for phone cameras, and — unlike `62×20` — the payload
crosses a QR version boundary mid-batch: vessel numbers 1–9 (38 bytes) sit at
version 2 with uppercase forced, but the module size *drops* to 0.340mm at
vessel #10 once the extra ordinal digit pushes the payload past the version-2
alphanumeric capacity. A 120-plate run on this stock prints two visibly
different QR densities in the same batch. `62×20` does not have this problem
— verified across vessel numbers 1, 9, 10, 99 and 120 (all four-digit-safe):
all five stay on version 3 at a flat 0.486mm/module, because the extra
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
   **version 2** — 33 modules with quiet zone, **0.38 mm** at 12.57 mm. Hosts are
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
- Tape size selector, defaulting to 29×90. **Currently hardcoded to two
  options (29×90 / 17×87) in `PrintLabelsModal.tsx` — needs a `62×20` option
  added; not done as part of the T-804 follow-up that added backend support
  for this size (2026-07-31), flagged here as outstanding.**
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
