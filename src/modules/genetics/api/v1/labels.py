"""
Genetics Repo Module - Label PDF Generation (T-804 step 4)

Generates print-ready label PDFs for a Brother QL-800 label printer, one PDF
page per physical vessel. See
``Docs/2-Working-Progress/genetics-label-qr-spec.md`` sections 5.1 (API
contract) and 6 (label layout / QR sizing arithmetic) for the full reasoning.

The QR module-size arithmetic in §6.2 is not eyeballed here: ``qrcode`` is
asked to build the real payload for each tape size and the version/module
size are read back off what it actually picked (see
:func:`compute_qr_geometry`), not hardcoded from the spec's rounded numbers.
"""

import io
import logging
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import List, Optional

import qrcode
from qrcode.constants import ERROR_CORRECT_M
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

from src.config.settings import settings
from src.services.user_service import UserService

from ...middleware.auth import CurrentUser, require_view
from ...services.accession.accession_service import AccessionService
from ...services.database import ACCESSIONS, genetics_db
from ...services.line.line_service import LineService
from ...services.medium.medium_service import MediumService

logger = logging.getLogger(__name__)

router = APIRouter()

# --- Brand assets: typefaces + mark (label PDF tuning round 3, 2026-07-31) -
#
# Real printed 62x15 feedback, third round: "brand the labels a bit — the
# fonts, and if there's spare room a small logo, really small." Per the
# brand contract (Brand_Engineering/Brand/A20Core_BRAND.md §4): Space Mono
# for metadata/labels/data, Hanken Grotesk for display/body/UI. The API
# container only ships ``src/`` and ``public/`` (see Dockerfile) — it
# cannot see ``frontend/`` or ``Brand_Engineering/`` at runtime, so the
# specific font/mark files this module needs are vendored into
# ``src/modules/genetics/assets/`` rather than referenced cross-tree.
#
# Registered ONCE at import time (not per-request — ``registerFont`` is not
# free) and wrapped in try/except: a missing or corrupt font asset must
# degrade to the base-14 fallback and log a WARNING, never 500 an endpoint
# whose whole point is printing a physical label. ``_LINE1_FONT_NAME`` /
# ``_SUPPORTING_FONT_NAME`` are the ACTUAL registered names used everywhere
# a font is set OR measured (``setFont`` and every ``stringWidth`` call) —
# registering under one name and measuring/drawing with a different literal
# string was the one way this could silently go wrong.
_ASSETS_DIR = Path(__file__).resolve().parent.parent.parent / "assets"

_LINE1_FONT_NAME = "Helvetica-Bold"  # fallback until/unless the brand font registers
try:
    pdfmetrics.registerFont(
        TTFont("SpaceMono-Bold", str(_ASSETS_DIR / "fonts" / "ttf" / "SpaceMono-Bold.ttf"))
    )
    _LINE1_FONT_NAME = "SpaceMono-Bold"
except Exception:
    logger.warning(
        "Label PDF: could not register Space Mono Bold (%s) — falling back to "
        "Helvetica-Bold for the vessel/accession-code line.",
        _ASSETS_DIR / "fonts" / "ttf" / "SpaceMono-Bold.ttf",
    )

# Lines 2-4 (supporting metadata) -> Hanken Grotesk per the brand contract's
# display/body/UI role. HankenGrotesk-Variable.ttf is a VARIABLE font —
# verified by hand before this was wired in (registered, drew a sample
# string at label-realistic sizes down to ~7pt, rendered to PNG at 300dpi,
# inspected): reportlab's TTFont reads the font's default named instance
# (Regular, wght=400) cleanly, matching the weight the base-14 "Helvetica"
# fallback it replaces already used for these lines. No fallback was
# actually needed, but the try/except stays — a missing/corrupt asset file
# on a future deploy must still degrade, not 500.
_SUPPORTING_FONT_NAME = "Helvetica"
try:
    pdfmetrics.registerFont(
        TTFont("HankenGrotesk", str(_ASSETS_DIR / "fonts" / "ttf" / "HankenGrotesk-Variable.ttf"))
    )
    _SUPPORTING_FONT_NAME = "HankenGrotesk"
except Exception:
    logger.warning(
        "Label PDF: could not register Hanken Grotesk (%s) — falling back to "
        "Helvetica for the supporting text lines.",
        _ASSETS_DIR / "fonts" / "ttf" / "HankenGrotesk-Variable.ttf",
    )

# Small brand mark (see _maybe_draw_brand_mark below). Sourced from
# Brand_Engineering/Brand/Logo/icons/mark-512-transparent.png (the mono
# orbital-swirl emblem, anti-aliased RGBA), pre-processed OFFLINE — not at
# request time — by thresholding alpha>=128 to pure opaque black and
# everything else to fully transparent, then cropped to its opaque bounding
# box (+3% padding). This is a ONE-TIME asset transform, not a runtime
# dependency: no SVG-rendering or image-processing library is imported here
# for it, only ``reportlab.lib.utils.ImageReader`` to draw the finished PNG.
# Thermal printing is 1-bit — the source PNG's partial-alpha anti-aliased
# edges (813 distinct colors) would dither to mush on a QL-800, so no grey
# survives in the committed asset (confirmed: exactly 2 colors, fully
# transparent or fully opaque black).
_BRAND_MARK_PATH = _ASSETS_DIR / "brand" / "mark-mono-1bit.png"
_brand_mark_reader: Optional[ImageReader] = None
_brand_mark_aspect: Optional[float] = None  # width / height, to draw without distortion
if _BRAND_MARK_PATH.exists():
    try:
        _brand_mark_reader = ImageReader(str(_BRAND_MARK_PATH))
        _mark_w_px, _mark_h_px = _brand_mark_reader.getSize()
        _brand_mark_aspect = _mark_w_px / _mark_h_px
    except Exception:
        logger.warning("Label PDF: could not load brand mark asset %s — mark will not be drawn.", _BRAND_MARK_PATH)
else:
    logger.warning("Label PDF: brand mark asset missing at %s — mark will not be drawn.", _BRAND_MARK_PATH)

# Vertical glyph-box metrics of the ACTUALLY REGISTERED fonts — read via
# reportlab's own `getAscentDescent`, not assumed. This matters because the
# leading/top-margin math further down (see the "Text block font sizing"
# section) was tuned in rounds 1-2 against Helvetica/Helvetica-Bold's metrics
# specifically. Measured here: Helvetica/Helvetica-Bold ascent 0.718em /
# descent -0.207em (total 0.925em); Space Mono Bold 1.120em / -0.361em
# (total 1.481em, +60%); Hanken Grotesk 1.000em / -0.303em (total 1.303em,
# +41%). Both brand fonts are materially taller than the base-14 faces the
# old constants assumed — reusing those constants unchanged produced REAL
# glyph-box overlap between line 1 and line 2, caught by
# ``test_text_block_lines_do_not_overlap_or_overflow_the_label`` against the
# actual generated PDF bytes, not eyeballed. Deriving the leading ratio and
# top-baseline offset from these values (rather than hand-tuning a second
# fixed constant for the new fonts) means the layout stays correct even if
# the fallback path ever triggers and swaps back to Helvetica.
_LINE1_ASCENT_FRAC, _LINE1_DESCENT_FRAC = pdfmetrics.getAscentDescent(_LINE1_FONT_NAME, 1.0)
_SUPPORTING_ASCENT_FRAC, _SUPPORTING_DESCENT_FRAC = pdfmetrics.getAscentDescent(_SUPPORTING_FONT_NAME, 1.0)


# --- Printer geometry: printable area, NOT tape stock size --------------
#
# ``29x90`` / ``17x87`` name the tape STOCK (DK-11201 / DK-11203: 90mm/87mm
# long x 29mm/17mm wide). The Brother QL-800 driver (``brother_ql``) cannot
# mark the full stock width — each label has a fixed, smaller PRINTABLE area
# baked into the printer's raster requirements. A PDF ``pagesize`` set to the
# stock dimensions is wrong: anything that later rasterizes the page down to
# the printer's actual raster size (what ``brother_ql`` demands) shrinks
# everything on the page, QR included, by the stock/printable ratio (~7% for
# 29x90). This was confirmed against real QL-800 hardware — see
# ``Docs/2-Working-Progress/genetics-label-qr-spec.md`` §6.2.
#
# So the page size is derived FROM the printer's native unit (pixels at
# 300dpi) rather than declared in mm by hand:
#
#     page_mm = printable_px / 300.0 * 25.4   (== page_pt = printable_px / 300.0 * 72.0,
#                                                since reportlab's `mm` unit is exactly 72/25.4 pt/mm)
#
# Printable-area pixel counts, per tape:
#   - 29x90 (DK-11201, DIE_CUT): 991 x 306 px @ 300dpi — CONFIRMED against
#     real QL-800 hardware by the user (brother_ql requires exactly this
#     raster size).
#   - 17x87 (DK-11203, DIE_CUT): 956 x 165 px @ 300dpi — CONFIRMED against
#     brother_ql's own label table: pklaus/brother_ql, ``brother_ql/labels.py``,
#     the ``"17x87"`` entry's ``dots_printable=(165, 956)`` (short-side,
#     long-side) = 165px/17mm side, 956px/87mm side. Fetched directly from
#     https://raw.githubusercontent.com/pklaus/brother_ql/master/brother_ql/labels.py
#     — not a local package install (brother_ql is not in requirements.txt;
#     it is not needed at runtime, only its label table was consulted).
#   - 62xN (DK-22205 class, ENDLESS/continuous): the tape is 62mm wide with
#     no fixed length — brother_ql's ``"62"`` entry gives
#     ``dots_printable=(696, 0)`` (width, length; length is 0 by definition
#     for endless labels since it is chosen at feed time, not baked into the
#     stock). 696px @ 300dpi = 58.93mm printable across the 62mm tape width.
#     The length side is NOT a printer constant — it is simply how much tape
#     we choose to feed per label, and unlike the two DIE_CUT sizes above a
#     different length choice for this tape is a config change, not a
#     hardware fact to re-verify. So the length is a free integer parameter
#     (``62xN``, N in mm) rather than a hardcoded catalogue entry — see
#     ``_parse_tape_spec`` below. T-804 follow-up (2026-07-31) shipped 20mm
#     as the first proven length; a second follow-up (this change) makes any
#     N in range work without a code change, because 20mm is not a printer
#     fact either — it was simply the first length tried.
_DPI = 300.0
_MM_PER_INCH = 25.4

# QR height reserves a margin against the printable-area edge so the code is
# never flush against the die-cut boundary. Expressed as a fraction of the
# tape's OWN printable height (not a second hardcoded mm figure per tape) so
# the margin scales with tape size instead of drifting out of sync the way
# the old hand-picked 24mm/14mm targets did — see spec §6.2.
#
# Raised 0.90 -> 0.93 (label PDF tuning round 2, 2026-07-31): real QL-800
# hardware feedback asked for "a bigger QR". 0.93 was chosen, not a rounder
# 0.95, because the vertical clearance floor below is a hard constraint on
# the shortest tape: clearance_mm = height_mm * (1 - fraction) / 2, and on
# 17x87 (13.97mm printable height, the shortest of the five shipped sizes)
# that must stay >= ~0.4mm. 0.93 leaves 0.489mm on 17x87 (0.94 would leave
# only 0.419mm — still technically over the floor but with much less
# manufacturing-tolerance headroom); 0.95 would drop to 0.349mm, UNDER the
# floor. See _TEXT_MARGIN_MM below for the paired change this required (the
# QR is square, so a larger _QR_HEIGHT_FRACTION also eats further into the
# text column's WIDTH, not just the vertical margin).
_QR_HEIGHT_FRACTION = 0.93

# Printable area in pixels at 300dpi (see provenance comment above).
# Convention: width = the long reading dimension, height = the short one.
#
# FIXED, non-parameterizable die-cut stock only. 62mm continuous tape is
# deliberately NOT in this table — see the ``_TAPE_62_*`` block below. Never
# add a ``62xN`` entry here; that would silently make a lookup-based size
# check (``size in _TAPE_PRINTABLE_PX``) miss a matching ``62xN`` request
# unless the caller also consults the regex path, which is exactly the kind
# of split-source-of-truth bug ``_parse_tape_spec`` exists to avoid.
_TAPE_PRINTABLE_PX = {
    "29x90": {"width_px": 991, "height_px": 306, "uppercase": False},
    "17x87": {"width_px": 956, "height_px": 165, "uppercase": True},
}

# --- 62mm continuous tape: only the WIDTH is a printer fact ----------------
#
# 696px (58.93mm) is confirmed against brother_ql's own "62" ENDLESS entry
# and never changes. The feed LENGTH is a free integer (mm), bounded to a
# sane physical range: below ~12mm there isn't room for a legible QR + text
# at all, above 100mm this stops being a "label" in any meaningful sense and
# starts being a small poster (also guards against a caller accidentally
# passing a stray large number and getting a many-page-tall single "label").
_TAPE_62_WIDTH_PX = 696
_TAPE_62_MIN_MM = 12
_TAPE_62_MAX_MM = 100
_TAPE_62_SIZE_RE = re.compile(r"^62x(\d+)$")

# Below this QR module size, scanning gets meaningfully harder for a phone
# camera at an angle in poor light (spec §6.2 cites ~0.5mm as the comfort
# line). Not a hard limit — request still succeeds — because a short 62mm
# length can be a deliberate, hardware-verified choice. Tightened from
# 0.40mm to 0.35mm (2026-07-31 follow-up): the user's QL-800 prints and
# scans 62x15 (0.365mm) cleanly, so a 0.40mm threshold was firing on a size
# that demonstrably works — noise, not signal (0.381mm/17x87 also stops
# warning under the new threshold, for the same reason: it prints, it just
# isn't the recommended default). 0.35mm still warns below anything actually
# hardware-verified so far (e.g. 62x14 at ~0.340mm and denser). Logged as a
# WARNING so a print run gets flagged for a test-scan rather than silently
# shipping a denser-than-usual code.
_LOW_DENSITY_WARNING_THRESHOLD_MM = 0.35


def _px_to_mm(px: float) -> float:
    return px / _DPI * _MM_PER_INCH


def _parse_tape_spec(size: str) -> dict:
    """Resolve ``size`` to a printable-area px spec (``width_px``,
    ``height_px``, ``uppercase``), or raise ``HTTPException(400)``.

    ``29x90`` and ``17x87`` are matched verbatim against the FIXED die-cut
    table above — they are physical stock with one fixed length each and
    must never be parsed as a pattern (no ``29xN``/``17xN`` becomes valid,
    ever). ``62xN`` is the one parameterizable family: N is the continuous
    tape's chosen feed length in mm, 12-100 inclusive (``_TAPE_62_MIN_MM``
    / ``_TAPE_62_MAX_MM``). Anything else — malformed 62-family strings included
    (``62x``, ``62xabc``, bare ``62``) — is a 400, never an unhandled
    exception.
    """
    if size in _TAPE_PRINTABLE_PX:
        return _TAPE_PRINTABLE_PX[size]

    match = _TAPE_62_SIZE_RE.match(size)
    if not match:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"size must be one of {sorted(_TAPE_PRINTABLE_PX)} or "
                f"'62xN' (N = continuous tape length in mm, "
                f"{_TAPE_62_MIN_MM}-{_TAPE_62_MAX_MM}), got '{size}'"
            ),
        )

    length_mm = int(match.group(1))
    if not (_TAPE_62_MIN_MM <= length_mm <= _TAPE_62_MAX_MM):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"62mm tape length must be between {_TAPE_62_MIN_MM} and "
                f"{_TAPE_62_MAX_MM}mm, got {length_mm}"
            ),
        )

    length_px = round(length_mm / _MM_PER_INCH * _DPI)
    return {"width_px": _TAPE_62_WIDTH_PX, "height_px": length_px, "uppercase": False}


def _tape_dimensions(size: str) -> dict:
    """Full page geometry (mm) for ``size``: printable-area px converted to
    mm, plus the derived QR footprint (``qr_mm``). Raises
    ``HTTPException(400)`` via :func:`_parse_tape_spec` for anything
    invalid — this is the single entry point the route uses to both
    validate and resolve ``size``, so there is exactly one place a size
    string is accepted or rejected."""
    spec = _parse_tape_spec(size)
    width_mm = _px_to_mm(spec["width_px"])
    height_mm = _px_to_mm(spec["height_px"])
    return {
        "width_mm": width_mm,
        "height_mm": height_mm,
        "qr_mm": height_mm * _QR_HEIGHT_FRACTION,
        "uppercase": spec["uppercase"],
    }


# Fixed, non-parameterizable sizes only — precomputed for callers/tests that
# want the two die-cut sizes' geometry directly without going through string
# parsing. 62xN is deliberately NOT precomputed here: there is no finite
# table to build for a continuous tape's free length parameter. Use
# ``_tape_dimensions(f"62x{n}")`` for any 62mm length, including 20.
_TAPE_SIZES = {name: _tape_dimensions(name) for name in _TAPE_PRINTABLE_PX}

_MAX_LABELS_PER_REQUEST = 500


@dataclass(frozen=True)
class QRGeometry:
    """Pure result of sizing a QR code for a target physical footprint.

    Deliberately free of any reportlab/canvas code so it is directly
    unit-testable without generating a PDF — see
    ``tests/unit/test_genetics/test_label_pdf.py``.
    """

    version: int
    modules_count: int  # symbol size only, e.g. 29 for version 3
    total_modules: int  # symbol + quiet zone; matches the matrix dimension
    module_size_mm: float
    matrix: List[List[bool]]


def compute_qr_geometry(payload: str, target_size_mm: float) -> QRGeometry:
    """Build a QR code for ``payload`` and derive its physical module size.

    Error correction is fixed at level M per spec §6.2. ``border=4`` bakes
    the 4-module quiet zone into ``qr.get_matrix()`` on every side, so a
    version-3 symbol (29x29) comes back as a 37x37 matrix and a version-2
    symbol (25x25) as 33x33 — matching the spec's "37 modules" / "33
    modules" totals exactly, derived rather than assumed.
    """
    qr = qrcode.QRCode(error_correction=ERROR_CORRECT_M, box_size=1, border=4)
    qr.add_data(payload)
    qr.make(fit=True)
    matrix = qr.get_matrix()
    total_modules = len(matrix)
    module_size_mm = target_size_mm / total_modules
    return QRGeometry(
        version=qr.version,
        modules_count=qr.modules_count,
        total_modules=total_modules,
        module_size_mm=module_size_mm,
        matrix=matrix,
    )


def build_label_payload(public_base_url: str, token: str, vessel_no: int, uppercase: bool) -> str:
    """Build the QR payload URL for one vessel.

    29x90 and 62x20 use the URL as written (byte mode) — both have enough
    physical height (>=18mm QR) that version 3 is comfortable without any
    density trick. 17x87 forces uppercase to hit QR alphanumeric mode (~1.7x
    denser), which is the difference between landing on version 3 vs version
    2 at 14mm (spec §6.2). Crockford base32 tokens are already uppercase;
    only the scheme/host/path literals and the vessel number need folding
    here.

    ``public_base_url`` carries its own scheme rather than having ``https://``
    hardcoded: LAN testing runs over plain http against an IP, and a label
    whose QR points at an unreachable scheme is a label that cannot be tested
    before it is printed in quantity.
    """
    url = f"{public_base_url.rstrip('/')}/i/{token}/{vessel_no}"
    return url.upper() if uppercase else url


def _draw_qr(c: canvas.Canvas, geometry: QRGeometry, x_mm: float, y_mm: float) -> None:
    """Draw the QR as vector rectangles at their exact physical size.

    Deliberately not rasterized through PIL: a vector fill at 0.4-0.65mm per
    module keeps full precision at print scale, where a rasterized bitmap
    would round each module to a pixel grid at whatever DPI it was built at.
    """
    module_pt = geometry.module_size_mm * mm
    total = geometry.total_modules
    c.setFillColorRGB(0, 0, 0)
    for row_idx, row in enumerate(geometry.matrix):
        for col_idx, dark in enumerate(row):
            if not dark:
                continue
            # Matrix row 0 is the top of the symbol; PDF y grows upward, so
            # row 0 lands at the highest y.
            px = x_mm * mm + col_idx * module_pt
            py = y_mm * mm + (total - row_idx - 1) * module_pt
            c.rect(px, py, module_pt, module_pt, fill=1, stroke=0)


# --- Text block font sizing (T-8xx follow-up, 2026-07-31) -----------------
#
# Real hardware feedback on a printed 62x15 label: "the fonts are small with
# large gaps between the lines." Root cause was two decoupled numbers: font
# size came from a coarse height_mm tier (three hardcoded buckets) while
# leading was `height_mm / 4.4` — scaled off the whole PAGE, not off the
# type actually being drawn. 62x15 (14.99mm) also fell into the tier tuned
# for 17x87, a tape with a much narrower text column, despite the two
# having nothing else in common.
#
# The replacement derives size1 (the vessel line — bold, largest, sets the
# vertical rhythm) directly from the vertical space the STACKED LINES ACTUALLY
# DRAWN have on THIS tape, then ties leading to that same font size
# (`_SIZE1_LEADING_RATIO`) instead of to the page. Lines 2-4 keep their
# existing relative hierarchy as fixed fractions of size1 (7/8, 6.5/8, 6/8 —
# the ratios the old 29x90 tier already used, just generalised).
#
# Round 2 (label PDF tuning, 2026-07-31, same day): real 62x15 prints still
# showed "a large space between the date and the species" and a request for
# bigger text/QR. Two changes here:
#
#   1. `_derive_text_sizes` no longer hardcodes "4 lines" — it takes
#      `line_count` from the caller (`_draw_label_page`), which builds its
#      line list from only the fields that actually have content FIRST. The
#      medium-batch-code line (line 3) is the one commonly empty in real
#      data (most accessions have no medium batch, including the live
#      reference accession PO-BLU-G3-001) — when empty, it is dropped from
#      the layout entirely instead of reserving its line-box height for a
#      blank string, which is what produced the visible gap. A label with
#      all 4 slots populated is unaffected (line_count stays 4).
#   2. `_SIZE1_LEADING_RATIO` tightened 1.15 -> 1.05 (less dead space between
#      lines buys size1 directly, since `line_box_mm` is divided by this
#      ratio) and `_SIZE1_ABSOLUTE_CEILING_PT` raised 9.0 -> 11.0 (was only
#      ever hit by 29x90's abundant vertical room; 11pt is still nowhere
#      near "absurd" on a tape with >20mm of printable height).
#
# Round 3 (label PDF tuning, 2026-07-31, same day): real printed 62x15
# feedback — "a small spacing at the top above the ID is needed so it
# doesn't touch the edge too much". The OLD `y` start in `_draw_label_page`
# (`height_mm - line_gap_mm * 0.85`) was never a real top margin — 0.85 is
# an intra-line baseline offset (how far below a line-box's top a
# Helvetica-ish cap-height baseline sits), applied directly against the
# page's top edge with nothing reserved above it. `_SIZE1_VERTICAL_MARGIN_MM`
# (the old name for the constant below) was already being subtracted before
# dividing into line-boxes, but the y-start formula never referenced it, so
# it constrained font SIZE without ever constraining where line 1 actually
# LANDS — the exact "top padding is disconnected from the size derivation"
# bug this round fixes.
#
# `_TOP_MARGIN_FRACTION` is the genuine fix: a FRACTION of `height_mm`
# (not a flat mm value), reserved above line 1 and wired into
# `_derive_text_sizes`'s `line_box_mm` the same way the old flat margin
# was — so it constrains both the font-size derivation AND (via
# `_draw_label_page`'s y-start, see below) where line 1 actually draws.
# A flat mm figure was rejected because the five shipped tapes span 13.97mm
# (17x87) to 25.91mm (29x90) printable height, and 62xN can in principle
# reach 100mm — a flat value sized right for 100mm (e.g. 4mm) would eat
# ~29% of 13.97mm, while one sized right for 13.97mm (e.g. 0.5mm) reads as
# nothing on a tall tape. 0.05 (5%) yields ~0.6-0.75mm of real top space on
# the shortest tapes (17x87 13.97mm -> 0.699mm; 62x15 14.99mm -> 0.750mm) up
# to ~1.3mm on the tallest shipped tape (29x90 25.91mm -> 1.296mm) —
# proportionate at both ends, unlike a flat constant.
#
# `_SIZE1_LEADING_RATIO` is now DERIVED from the actually-registered fonts'
# glyph-box metrics (`_LINE1_ASCENT_FRAC` etc., computed above near the font
# registration) instead of a second hand-tuned constant. This is not
# cosmetic: reusing round 2's flat `1.05` (tuned against Helvetica-Bold's
# 0.925em total glyph-box) against Space Mono Bold's markedly taller
# 1.481em box produced REAL, measured overlap between line 1 and line 2 —
# caught by `test_text_block_lines_do_not_overlap_or_overflow_the_label`
# against the actual generated PDF bytes, not eyeballed. The worst-case
# ADJACENT pair is always line1->line2 (line 1 is both the largest font size
# AND, when Space Mono Bold is registered, the tallest-metric font; lines
# 2-4 share one smaller, later font, so every other adjacent pair needs
# strictly less leading): the minimum leading (in units of size1) that keeps
# line 1's descent clear of line 2's ascent is
# ``|descent1| + ascent_supporting * (size2/size1)``, with `size2/size1`
# being the same fixed `0.875` fraction used to derive size2 below.
# `_LEADING_SAFETY_PAD_EM` adds a small cushion above that bare minimum.
# Falls back correctly to something close to round 2's `1.05` if font
# registration ever fails and both roles land on the base-14 fonts (whose
# combined worst case computes to ~0.98 + pad).
_LEADING_SAFETY_PAD_EM = 0.05
_SIZE1_LEADING_RATIO = abs(_LINE1_DESCENT_FRAC) + _SUPPORTING_ASCENT_FRAC * 0.875 + _LEADING_SAFETY_PAD_EM
_TOP_MARGIN_FRACTION = 0.05  # proportional top inset — see "Round 3" above for the derivation
# Bottom breathing room. Was a flat 0.5mm while the top inset was a FRACTION of
# height — so the two were asymmetric by construction, and visibly so: on a 20mm
# tape the top reserved 1.0mm against the bottom's 0.5mm, and the gap widened as
# tape got taller. Now proportional and equal to `_TOP_MARGIN_FRACTION`, so the
# text block sits optically centred on every length from 12mm to 100mm.
#
# The old flat value carried a real finding worth keeping: 0.3mm measured SHORT
# by ~0.055mm on 62x15 — the one vertically-bound tape+line-count with no
# width-ceiling slack to absorb Hanken Grotesk's larger descent. `_BOTTOM_MARGIN_FLOOR_MM`
# preserves that hard lower bound, so a short tape can never compute its way
# below the descent-safety limit that measurement established.
_BOTTOM_MARGIN_FRACTION = 0.05
_BOTTOM_MARGIN_FLOOR_MM = 0.5
_TOP_ASCENT_SAFETY_MM = 0.15  # small pad above line 1's own measured ascent (see _draw_label_page's y-start)
_SIZE1_FLOOR_PT = 6.0  # never smaller than the old worst-case tier, regardless of tape
_SIZE1_ABSOLUTE_CEILING_PT = 11.0  # never "absurdly large" just because a tape happens to be tall (29x90)
_SIZE1_WIDTH_SAFETY_MARGIN_PT = 1.5  # absorbs the round(size1, 1) below so it can never tip a fitting line over

# The realistic worst-case vessel line used to bound how large size1 may
# grow horizontally (spec §6.1's own example). Font size must be identical
# across every page of one print run — it cannot depend on each page's
# actual (varying-length) accession code/vessel number — so growth is
# capped against this fixed reference via `stringWidth`, the same technique
# the per-page suffix-drop check below already uses, rather than a guessed
# character count.
_SIZE1_REFERENCE_LINE = "PO-BLU-G3-001 · #3 <- #4"

# Horizontal margin around the QR/text block: page-left-edge -> QR, QR ->
# text column, text column -> page-right-edge (all three gaps use this same
# value). Was an inline `margin = 1.5` literal in `_draw_label_page`; pulled
# out to a named constant and tightened to 1.3mm in the same round-2 tuning
# pass above, because the QR is square — raising `_QR_HEIGHT_FRACTION` grows
# its footprint in BOTH directions, and without recovering some horizontal
# room here the now-larger QR would mechanically shrink the width-ceiling
# guard's `available_pt` on 62x18/62x20 below their round-1 sizes (they were
# already width-ceiling-bound, not raw-bound — see the before/after table in
# the backlog entry and spec §6.1a). 1.3mm still leaves the QR's own
# left-edge clearance comfortably above the 0.4mm floor required elsewhere.
_TEXT_MARGIN_MM = 1.3


def _derive_text_sizes(
    height_mm: float, available_pt: float, line_count: int
) -> tuple[float, float, float, float, float]:
    """Derive (size1, size2, size3, size4, line_gap_mm) for the text block.

    ``line_count`` is the number of lines the caller is ACTUALLY going to
    draw (3 when the medium-batch-code line is empty and dropped, 4 when
    every slot is populated) — not a hardcoded 4. Fewer lines means a larger
    ``line_box_mm`` per line, so a 3-line label uses the freed vertical space
    to grow its type rather than leaving a blank quarter of the label empty.

    size1 is bounded above by the SMALLER of an absolute sanity ceiling and
    a width-derived ceiling (does ``_SIZE1_REFERENCE_LINE`` still fit this
    tape's actual text column at that size, measured against ``_LINE1_FONT_NAME``
    — the actual registered font line 1 is drawn in, Space Mono Bold unless
    the asset failed to register — not a hardcoded base-14 name), and below
    by a readability floor. Sizes 2-4 are fixed fractions of size1, preserving
    the existing line-1-largest-and-bold, line-4-smallest hierarchy — they
    are computed unconditionally even when the caller won't draw all of them
    (e.g. size3 when the batch-code line is dropped); an unused value is
    harmless. Leading is derived FROM the final size1 (proportional to type,
    per the fix this function exists for), not from ``height_mm`` directly.

    ``height_mm`` also feeds a proportional top-margin reservation
    (``_TOP_MARGIN_FRACTION``, round 3) before the vertical space is split
    into line-boxes — see the "Round 3" comment above the constants block
    for the derivation and why a flat mm value was rejected.
    """
    top_margin_mm = height_mm * _TOP_MARGIN_FRACTION
    bottom_margin_mm = max(height_mm * _BOTTOM_MARGIN_FRACTION, _BOTTOM_MARGIN_FLOOR_MM)
    line_box_mm = (height_mm - top_margin_mm - bottom_margin_mm) / line_count
    size1_mm = line_box_mm / _SIZE1_LEADING_RATIO
    size1_raw_pt = size1_mm * mm  # mm -> pt (reportlab's `mm` unit is pt-per-mm)

    reference_unit_width_pt = stringWidth(_SIZE1_REFERENCE_LINE, _LINE1_FONT_NAME, 1.0)
    width_ceiling_pt = (available_pt - _SIZE1_WIDTH_SAFETY_MARGIN_PT) / reference_unit_width_pt
    size1_ceiling_pt = min(width_ceiling_pt, _SIZE1_ABSOLUTE_CEILING_PT)

    size1 = max(_SIZE1_FLOOR_PT, min(size1_raw_pt, size1_ceiling_pt))
    size1 = round(size1, 1)
    size2 = round(size1 * 0.875, 1)
    size3 = round(size1 * 0.8125, 1)
    size4 = round(size1 * 0.75, 1)

    line_gap_mm = (size1 / mm) * _SIZE1_LEADING_RATIO  # pt -> mm, then apply leading ratio
    return size1, size2, size3, size4, line_gap_mm


# --- Small brand mark (label PDF tuning round 3+4, 2026-07-31) ------------
#
# Round 3: "if any open space on the right a small logo... but really
# small." A lab label, not marketing collateral — the mark must never
# compete with the data, so it is drawn ONLY when real, measured spare room
# exists, never by shrinking or crowding anything else.
#
# Round 4 (this change, same day): round 3's ONLY placement was below the
# last text line, in whatever vertical budget the text block did NOT
# consume. That budget is only ever spare when a tape is WIDTH-ceiling-bound
# (font size capped below what the vertical space alone would allow — see
# `_derive_text_sizes`'s docstring) — true for 62x18/62x20/29x90's 3-line
# layout, but false for EVERY tape's 4-line layout (four stacked lines
# consume the full vertical budget) and false for 62x15/17x87 at either
# line count (both are vertically-bound, not width-bound, at these
# settings — never spare below the text at all). The user's real production
# accession (HE-LMUS-G1-001, 20 physical labels already printed from it) has
# a `mediumBatchId`, so every label generated from it is 4-line — exactly
# the one case that never got a mark. Backwards from what was needed: the
# mark appeared on less-complete records and vanished on well-documented
# ones.
#
# Fix: use horizontal, not vertical, slack, as a fallback when the
# below-the-text placement doesn't fit. Lines 2/3 (common name, medium batch
# code) draw in a materially smaller size than line 1's width-ceiling-bound
# Space Mono Bold and are typically much shorter strings — measured with
# `stringWidth` against the actually registered fonts and realistic
# production-shaped samples ("Blue Oyster  G3", "MEA-AC-2607-03"), they
# leave 14-49mm of free width at the right edge of the text column on every
# shipped tape and line count, vs. line 1's 0.4-2.8mm (it fills the column
# by design — that is what `_derive_text_sizes`'s width-ceiling guard is
# for). That free width — read at the ACTUAL rendered end of whichever
# inner line (line 2, and line 3 if present) runs longest, never assumed —
# is where the mark goes instead, vertically centered in the space between
# line 1's own ink and the last line's own ink (the same vertical territory
# lines 2/3 already occupy).
#
# Measured against the real geometry of all 5 shipped tapes x both line
# counts: the below-placement continues to win on 62x18/62x20/29x90's
# 3-line layout (byte-identical to round 3, unchanged); the horizontal
# fallback newly covers ALL FIVE tapes' 4-line layout — closing the exact
# gap this task exists to fix. 62x15 and 17x87's 3-line layout still cannot
# fit a legible mark by either method (both are genuinely tight — 14.99mm /
# 13.97mm printable height, with only ~4mm total spare between line 1 and
# the date line even after collapsing the batch-code row) and are left
# without a mark: a disclosed, rare edge case, not the common 4-line case
# this task was scoped to fix.
#
# `_BRAND_MARK_MAX_SIZE_MM` tightened 8.0 -> 6.0mm this round: round 3's
# ceiling let the mark reach a full 8mm on the most generous tape (29x90),
# which read as more prominent than "really small" once printed. Re-checked
# visually at 300dpi (see verification notes) that 5-6mm still reads as a
# legible double ring with soft inner linework — the same conclusion round
# 3 reached across its wider 5-8mm band, just capped tighter.
# `_BRAND_MARK_MIN_SIZE_MM` (5.0mm) is UNCHANGED — that number came from an
# explicit per-mm visual legibility test (3/4/5/6/7/8mm rendered and
# inspected), not from open-space arithmetic, and nothing about this
# round's placement change affects font legibility at a given physical
# size, so it was not re-litigated.
_BRAND_MARK_MIN_SIZE_MM = 5.0
_BRAND_MARK_MAX_SIZE_MM = 6.0
# Clearance kept between the mark and the nearest text draw, on whichever
# side it borders one: below-placement borders the last line (above it);
# horizontal-placement borders line 1 (above), the last line (below), and
# the longest inner line (to its left).
_BRAND_MARK_GAP_MM = 0.8
_BRAND_MARK_EDGE_GAP_MM = 0.5  # clearance kept between the mark and the label's own bottom edge (below-placement only — horizontal placement never borders a physical edge)


def _maybe_draw_brand_mark(
    c: canvas.Canvas,
    *,
    first_line_baseline_pt: float,
    first_line_font_size: float,
    last_line_baseline_pt: float,
    last_line_font_size: float,
    right_edge_pt: float,
    text_width_mm: float,
    inner_lines_right_edge_pt: float,
) -> None:
    """Draw the brand mark in the text column, ONLY if the asset loaded AND
    real, measured spare room exists somewhere — never by assumption, never
    by crowding any text draw.

    Two placements are tried in order (round 4 — see the extended module
    comment above the constants block for the full reasoning and the
    measured numbers behind this ordering):

    1. Below the last text line (round 3, unchanged): fires when a tape is
       width-ceiling-bound and the text block therefore consumes less than
       its full vertical budget, leaving genuine spare room above the
       label's bottom edge.
    2. Horizontal slack at the right edge of the text column, vertically
       centered between line 1's own ink and the last line's own ink — the
       same vertical territory lines 2/3 occupy, which measured out short
       enough on every shipped tape to leave large amounts of free width at
       that edge (see module comment). Fires when (1) does not, which today
       is every 4-line label on every tape, and every 3-line label on the
       two tightest tapes (62x15, 17x87).

    If neither placement has room for a mark at least `_BRAND_MARK_MIN_SIZE_MM`
    tall (and, for placement 2, wide enough to actually clear the longest
    inner line), no mark is drawn — a rare, disclosed edge case (see module
    comment), never a crash.
    """
    if _brand_mark_reader is None or _brand_mark_aspect is None:
        return

    # --- Placement 1: below the last line (round 3, unchanged) ------------
    _, last_descent_pt = pdfmetrics.getAscentDescent(_SUPPORTING_FONT_NAME, last_line_font_size)
    last_line_bottom_mm = (last_line_baseline_pt + last_descent_pt) / mm  # descent_pt is negative

    below_available_mm = last_line_bottom_mm - _BRAND_MARK_GAP_MM - _BRAND_MARK_EDGE_GAP_MM
    mark_h_mm = min(below_available_mm, _BRAND_MARK_MAX_SIZE_MM)
    if mark_h_mm >= _BRAND_MARK_MIN_SIZE_MM:
        mark_w_mm = mark_h_mm * _brand_mark_aspect
        if mark_w_mm > text_width_mm:
            # Narrow text columns (e.g. 17x87) could in principle make the
            # width-derived footprint wider than the column itself even
            # though the height check passed; re-derive from width instead
            # of skipping outright, but never go below the legibility floor.
            mark_w_mm = text_width_mm
            mark_h_mm = mark_w_mm / _brand_mark_aspect
        if mark_h_mm >= _BRAND_MARK_MIN_SIZE_MM:
            mark_x_mm = right_edge_pt / mm - mark_w_mm
            mark_y_mm = _BRAND_MARK_EDGE_GAP_MM
            c.drawImage(
                _brand_mark_reader,
                mark_x_mm * mm,
                mark_y_mm * mm,
                width=mark_w_mm * mm,
                height=mark_h_mm * mm,
                mask="auto",
            )
            return

    # --- Placement 2 (round 4): horizontal slack beside lines 2/3 ---------
    _first_ascent_pt, first_descent_pt = pdfmetrics.getAscentDescent(_LINE1_FONT_NAME, first_line_font_size)
    row1_bottom_mm = (first_line_baseline_pt + first_descent_pt) / mm  # descent_pt is negative

    last_ascent_pt, _ = pdfmetrics.getAscentDescent(_SUPPORTING_FONT_NAME, last_line_font_size)
    row_last_top_mm = (last_line_baseline_pt + last_ascent_pt) / mm

    band_bottom_mm = row_last_top_mm + _BRAND_MARK_GAP_MM
    band_top_mm = row1_bottom_mm - _BRAND_MARK_GAP_MM
    band_height_mm = band_top_mm - band_bottom_mm
    mark_h_mm = min(band_height_mm, _BRAND_MARK_MAX_SIZE_MM)
    if mark_h_mm < _BRAND_MARK_MIN_SIZE_MM:
        return

    mark_w_mm = mark_h_mm * _brand_mark_aspect
    avail_w_mm = right_edge_pt / mm - inner_lines_right_edge_pt / mm - _BRAND_MARK_GAP_MM
    if mark_w_mm > avail_w_mm:
        mark_w_mm = avail_w_mm
        mark_h_mm = mark_w_mm / _brand_mark_aspect
        if mark_h_mm < _BRAND_MARK_MIN_SIZE_MM:
            return

    mark_x_mm = right_edge_pt / mm - mark_w_mm
    mark_y_mm = band_bottom_mm + (band_height_mm - mark_h_mm) / 2
    c.drawImage(
        _brand_mark_reader,
        mark_x_mm * mm,
        mark_y_mm * mm,
        width=mark_w_mm * mm,
        height=mark_h_mm * mm,
        mask="auto",
    )


def _draw_label_page(
    c: canvas.Canvas,
    *,
    width_mm: float,
    height_mm: float,
    qr_geometry: QRGeometry,
    accession_code: str,
    vessel_no: int,
    common_name: str,
    generation_label: str,
    batch_code: str,
    date_str: str,
    operator_initials: str,
    source_vessel_no: Optional[int] = None,
) -> None:
    """Render one label page: QR on the left, up to four text lines on the
    right (three when the medium-batch-code line is empty — see below), plus
    a small brand mark when — and only when — there is genuinely spare room
    for one, either below the text block or (round 4) as horizontal slack
    beside lines 2/3 — see ``_maybe_draw_brand_mark`` for the two placements
    and the reasoning for trying them in that order.

    The text block is the fallback when the QR or the network is unusable
    (spec §6.1), so it is built from plain strings that default to "" rather
    than ever raising — a missing common name blanks a line, it does not
    fail the page.
    """
    margin = _TEXT_MARGIN_MM  # mm
    qr_size_mm = qr_geometry.module_size_mm * qr_geometry.total_modules
    qr_x, qr_y = margin, (height_mm - qr_size_mm) / 2
    _draw_qr(c, qr_geometry, qr_x, qr_y)

    text_x = (qr_x + qr_size_mm + margin) * mm
    text_width_mm = max(width_mm - (qr_x + qr_size_mm + 2 * margin), 5.0)
    right_edge = text_x + text_width_mm * mm
    available_pt = right_edge - text_x

    # Collapse blank lines (label PDF tuning round 2, 2026-07-31): the
    # medium-batch-code line is commonly empty in real data (most accessions
    # have no medium batch, including the live reference accession
    # PO-BLU-G3-001) — when it is, drop it from the layout entirely rather
    # than reserving its line-box height for a blank string, which is what
    # produced the visible gap between the species line and the date line
    # that prompted this round of tuning. The vessel line, common-name+
    # generation line, and date+operator line are effectively always
    # present, so only the batch-code line is conditional.
    has_batch_line = bool(batch_code)
    line_count = 4 if has_batch_line else 3

    # Font size and leading are derived together from the vertical space the
    # lines ACTUALLY BEING DRAWN have on THIS tape (see `_derive_text_sizes`
    # and the constants above it for the full rationale) — not read off a
    # coarse height_mm tier, and not divided by a hardcoded 4 regardless of
    # how many lines have content.
    size1, size2, size3, size4, line_gap_mm = _derive_text_sizes(height_mm, available_pt, line_count)

    # Top padding (round 3, real hardware feedback: the accession code sat
    # too close to the top/feed edge). `top_margin_mm` here MUST match what
    # `_derive_text_sizes` reserved internally — recomputed from the same
    # `height_mm` / `_TOP_MARGIN_FRACTION` rather than threaded through the
    # return tuple, since it depends on nothing else.
    #
    # The old `* 0.85` intra-line-box baseline offset is GONE, not just
    # relocated: it was a fraction of `line_gap_mm` picked to roughly clear
    # Helvetica-Bold's ascent, and produced a real, measured top overflow
    # once Space Mono Bold (a taller face — see `_LINE1_ASCENT_FRAC` above)
    # replaced it (caught by
    # `test_text_block_lines_do_not_overlap_or_overflow_the_label`, not
    # eyeballed). The baseline offset is now line 1's OWN measured ascent —
    # exactly the distance needed so its glyph box's top touches (not
    # crosses) the top of the reserved area — plus a tiny fixed safety pad,
    # correct for whichever font actually ended up registered rather than
    # tuned for one specific face.
    ascent1_mm = (_LINE1_ASCENT_FRAC * size1) / mm  # size1 is pt; /mm converts pt -> mm
    top_margin_mm = height_mm * _TOP_MARGIN_FRACTION
    y = (height_mm - top_margin_mm - ascent1_mm - _TOP_ASCENT_SAFETY_MM) * mm

    # Vessel line, e.g. "PO-BLU-G3-001 · #3". When the accession records which
    # vessel of the parent batch it was propagated from (T-805a's
    # ParentRef.vesselNo), that provenance is appended as
    # " <- #<parent vessel>" (spec §6.1 / T-805b) — ASCII "<-", never U+2190:
    # neither the base-14 fonts nor Space Mono Bold (the brand font line 1 is
    # drawn in as of round 3 — see `_LINE1_FONT_NAME`) are guaranteed to
    # carry that glyph, and an unsupported glyph would print as a blank box
    # on thermal output.
    #
    # The 40-char slice below is a coarse, tape-agnostic safety net that
    # predates this suffix and is left untouched: it was never sized against
    # any tape's real column width, and the accession code must never be the
    # thing that gets clipped to make room for the suffix. So the suffix is
    # gated separately, on the ACTUAL rendered width of this specific string
    # at this tape's actual font tier (`stringWidth` against `_LINE1_FONT_NAME`
    # — the font line 1 is ACTUALLY drawn in, not a guessed char count or a
    # hardcoded base-14 name) against this tape's actual text column
    # (`text_x`..`right_edge`, which varies materially across 62x20/29x90/
    # 17x87 — see module docstring geometry notes). If the suffixed string
    # would not fit, the suffix is dropped entirely and the line renders
    # exactly as it did before T-805b; the base line's own 40-char/width
    # behaviour is never altered.
    base_line = f"{accession_code} · #{vessel_no}"
    line1 = base_line
    if source_vessel_no is not None:
        candidate = f"{base_line} <- #{source_vessel_no}"
        if len(candidate) <= 40 and stringWidth(candidate, _LINE1_FONT_NAME, size1) <= available_pt:
            line1 = candidate

    # `first_line_baseline_pt` is captured before the first draw/decrement so
    # the brand-mark placement below (round 4) can measure the real gap
    # between line 1's ink and the inner lines/last line without threading a
    # second y-walk through the geometry.
    first_line_baseline_pt = y

    c.setFont(_LINE1_FONT_NAME, size1)
    c.drawString(text_x, y, line1[:40])
    y -= line_gap_mm * mm

    c.setFont(_SUPPORTING_FONT_NAME, size2)
    line2 = f"{common_name}  {generation_label}".strip()
    line2_drawn = line2[:40]
    c.drawString(text_x, y, line2_drawn)
    y -= line_gap_mm * mm
    # ACTUAL rendered width of what was just drawn (round 4 brand-mark
    # placement needs the real end x, not an estimate) — `stringWidth`
    # against the same font/size/text that was actually shown on the page.
    inner_lines_right_edge_pt = text_x + stringWidth(line2_drawn, _SUPPORTING_FONT_NAME, size2)

    if has_batch_line:
        c.setFont(_SUPPORTING_FONT_NAME, size3)
        batch_code_drawn = batch_code[:40]
        c.drawString(text_x, y, batch_code_drawn)
        y -= line_gap_mm * mm
        line3_right_edge_pt = text_x + stringWidth(batch_code_drawn, _SUPPORTING_FONT_NAME, size3)
        inner_lines_right_edge_pt = max(inner_lines_right_edge_pt, line3_right_edge_pt)

    c.setFont(_SUPPORTING_FONT_NAME, size4)
    c.drawString(text_x, y, date_str[:20])
    c.drawRightString(right_edge, y, operator_initials[:10])

    _maybe_draw_brand_mark(
        c,
        first_line_baseline_pt=first_line_baseline_pt,
        first_line_font_size=size1,
        last_line_baseline_pt=y,
        last_line_font_size=size4,
        right_edge_pt=right_edge,
        text_width_mm=text_width_mm,
        inner_lines_right_edge_pt=inner_lines_right_edge_pt,
    )


@router.get(
    "/{accession_id}/labels",
    summary="Generate a label PDF for a range of vessels",
    description=(
        "One PDF page per vessel, sized for a Brother QL-800 (29x90 or "
        "17x87 fixed die-cut tape, or 62xN continuous tape, N = feed "
        "length in mm, 12-100). Read-only in permission but not in "
        "effect: printing raises labelledVesselCount to max(current, to) "
        "— see genetics-label-qr-spec.md §5.1."
    ),
)
async def get_labels(
    accession_id: str,
    from_: Optional[int] = Query(None, alias="from", ge=1, description="First vessel ordinal; defaults to the first never-printed one, or 1 if everything is already labelled (reprint)"),
    to: Optional[int] = Query(None, ge=1, description="Last vessel ordinal; defaults to quantity, or to labelledVesselCount if everything is already labelled (reprint)"),
    size: str = Query("29x90", description="Tape size: 29x90, 17x87 (fixed die-cut), or 62xN (continuous, N = length in mm, 12-100, e.g. 62x15, 62x20)"),
    current_user: CurrentUser = Depends(require_view),
) -> Response:
    # Resolves AND validates `size` in one place — 400 on anything invalid
    # (unknown fixed size, out-of-range 62xN, or a malformed string like
    # "62x"/"62xabc"/"62") via _parse_tape_spec, never a 500.
    tape = _tape_dimensions(size)

    accession = await AccessionService.get_accession(accession_id)

    # Defaults must survive a split. A split decrements `quantity` (spec §3)
    # but deliberately never decrements `labelledVesselCount` (it's a
    # high-water mark of physical labels already printed — reprinting an
    # ordinal that got split off is correct, since the label is a pointer
    # resolved through resolve_vessel(), not a claim on that ordinal).
    # So once everything currently held is labelled, "print what's new"
    # is empty and the sensible default becomes "reprint everything
    # already printed" (1..labelledVesselCount) rather than the inverted
    # (labelledVesselCount+1)..quantity range that produces a 400.
    if accession.labelledVesselCount >= accession.quantity:
        default_from = 1
        default_to = accession.labelledVesselCount
    else:
        default_from = accession.labelledVesselCount + 1
        default_to = accession.quantity

    from_n = from_ if from_ is not None else default_from
    to_n = to if to is not None else default_to

    if from_n > to_n:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"'from' ({from_n}) must be <= 'to' ({to_n})",
        )
    if (to_n - from_n + 1) > _MAX_LABELS_PER_REQUEST:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Range of {to_n - from_n + 1} labels exceeds the {_MAX_LABELS_PER_REQUEST}-per-request cap",
        )

    # Best-effort context for the text block — none of this may fail the PDF
    # (spec §6.1: the text is the fallback for when the QR is unusable, so it
    # must render even when the metadata behind it is incomplete).
    common_name = ""
    try:
        line = await LineService.get_line(accession.lineId)
        common_name = line.commonName
    except Exception:
        logger.warning("Label PDF: could not resolve line %s for common name", accession.lineId)

    batch_code = ""
    if accession.mediumBatchId:
        try:
            codes = await MediumService.get_batch_codes([accession.mediumBatchId])
            batch_code = codes.get(accession.mediumBatchId, "")
        except Exception:
            logger.warning("Label PDF: could not resolve medium batch %s", accession.mediumBatchId)

    operator_initials = "—"  # em dash — graceful fallback, never blocks the PDF
    if accession.createdBy:
        try:
            user = await UserService.get_user_by_id(accession.createdBy)
            if user and user.firstName and user.lastName:
                operator_initials = f"{user.firstName[0]}.{user.lastName[0]}."
        except Exception:
            logger.warning("Label PDF: could not resolve operator %s", accession.createdBy)

    date_value = accession.acquiredAt or accession.createdAt
    date_str = date_value.strftime("%Y-%m-%d") if date_value else ""

    # Source vessel of the FIRST recorded parent (T-805a's ParentRef.vesselNo),
    # e.g. "propagated from plate #4 of the parent batch" — printed on the
    # vessel line as " <- #4" (T-805b, spec §6.1). A cross can have more than
    # one parent, but the label has room for one provenance pointer; the
    # first parent is the one already treated as primary elsewhere (e.g. the
    # lineage walk). None when parentage is unrecorded or that parent's
    # vessel was never noted — the line then renders exactly as before.
    source_vessel_no: Optional[int] = accession.parents[0].vesselNo if accession.parents else None

    # Representative geometry for the log line (spec §6.2 requires logging
    # the resulting version/module size once per call, not per page). Drawn
    # per-page below using each page's own payload — the vessel-number digit
    # count can in principle push a payload across a version boundary near
    # the byte/character capacity edge, and each page must stay correct even
    # if that happens rather than reuse a possibly-stale geometry.
    sample_payload = build_label_payload(settings.PUBLIC_BASE_URL, accession.publicToken, from_n, tape["uppercase"])
    sample_geometry = compute_qr_geometry(sample_payload, tape["qr_mm"])
    logger.info(
        "Label PDF: size=%s tape, QR version=%d, modules=%d, module_size=%.3fmm",
        size, sample_geometry.version, sample_geometry.total_modules, sample_geometry.module_size_mm,
    )
    if sample_geometry.module_size_mm < _LOW_DENSITY_WARNING_THRESHOLD_MM:
        # Not a rejection — a short 62mm length can be a deliberate,
        # hardware-verified choice (spec §6.2 / T-804 follow-up: 62x15
        # confirmed scanning cleanly on this lab's QL-800). This is a
        # heads-up to test-scan before committing to a large run, not a
        # block on generating the PDF.
        logger.warning(
            "Label PDF: size=%s QR module %.3fmm is below the %.2fmm comfort threshold — test-scan before a large run.",
            size, sample_geometry.module_size_mm, _LOW_DENSITY_WARNING_THRESHOLD_MM,
        )

    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=(tape["width_mm"] * mm, tape["height_mm"] * mm))

    for vessel_no in range(from_n, to_n + 1):
        payload = build_label_payload(settings.PUBLIC_BASE_URL, accession.publicToken, vessel_no, tape["uppercase"])
        geometry = compute_qr_geometry(payload, tape["qr_mm"])
        _draw_label_page(
            c,
            width_mm=tape["width_mm"],
            height_mm=tape["height_mm"],
            qr_geometry=geometry,
            accession_code=accession.accessionCode,
            vessel_no=vessel_no,
            common_name=common_name,
            generation_label=accession.generationLabel,
            batch_code=batch_code,
            date_str=date_str,
            operator_initials=operator_initials,
            source_vessel_no=source_vessel_no,
        )
        c.showPage()

    c.save()
    pdf_bytes = buffer.getvalue()
    buffer.close()

    # Side effect (spec §5.1, deliberate): printing raises the high-water mark
    # so /labels?from=... defaults to "what's never been printed" next time.
    # This is the one write on an otherwise read-only path.
    new_count = max(accession.labelledVesselCount, to_n)
    db = genetics_db.get_database()
    await db[ACCESSIONS].update_one(
        {"accessionId": accession_id},
        {"$set": {"labelledVesselCount": new_count, "updatedAt": datetime.utcnow()}},
    )

    filename = f"labels-{accession.accessionCode}-{from_n}-{to_n}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
