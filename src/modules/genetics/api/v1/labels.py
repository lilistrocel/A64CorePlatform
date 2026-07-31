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
from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional

import qrcode
from qrcode.constants import ERROR_CORRECT_M
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from reportlab.lib.units import mm
from reportlab.pdfbase.pdfmetrics import stringWidth
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
#   - 62x20 (DK-22205 class, ENDLESS/continuous): the tape is 62mm wide with
#     no fixed length — brother_ql's ``"62"`` entry gives
#     ``dots_printable=(696, 0)`` (width, length; length is 0 by definition
#     for endless labels since it is chosen at feed time, not baked into the
#     stock). 696px @ 300dpi = 58.93mm printable across the 62mm tape width.
#     The length side is NOT a printer constant — it is simply how much tape
#     we choose to feed per label, set here to 20mm (236px @ 300dpi) because
#     20mm-long labels are the preferred size for this stock (T-804
#     follow-up). Unlike the two DIE_CUT sizes above, a different length
#     choice for this tape is a config change here, not a hardware fact to
#     re-verify.
_DPI = 300.0
_MM_PER_INCH = 25.4

# QR height reserves a margin against the printable-area edge so the code is
# never flush against the die-cut boundary. Expressed as a fraction of the
# tape's OWN printable height (not a second hardcoded mm figure per tape) so
# the margin scales with tape size instead of drifting out of sync the way
# the old hand-picked 24mm/14mm targets did — see spec §6.2.
_QR_HEIGHT_FRACTION = 0.90

# Printable area in pixels at 300dpi (see provenance comment above).
# Convention: width = the long reading dimension, height = the short one.
_TAPE_PRINTABLE_PX = {
    "29x90": {"width_px": 991, "height_px": 306, "uppercase": False},
    "17x87": {"width_px": 956, "height_px": 165, "uppercase": True},
    "62x20": {"width_px": 696, "height_px": 236, "uppercase": False},
}


def _px_to_mm(px: float) -> float:
    return px / _DPI * _MM_PER_INCH


def _build_tape_sizes() -> dict:
    """Derive page dimensions (mm) and the QR footprint from the printer's
    native printable-area pixel counts, rather than declaring millimetres by
    hand and hoping they round correctly to what the printer can mark."""
    sizes = {}
    for name, spec in _TAPE_PRINTABLE_PX.items():
        width_mm = _px_to_mm(spec["width_px"])
        height_mm = _px_to_mm(spec["height_px"])
        sizes[name] = {
            "width_mm": width_mm,
            "height_mm": height_mm,
            "qr_mm": height_mm * _QR_HEIGHT_FRACTION,
            "uppercase": spec["uppercase"],
        }
    return sizes


_TAPE_SIZES = _build_tape_sizes()

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
    """Render one label page: QR on the left, four text lines on the right.

    The text block is the fallback when the QR or the network is unusable
    (spec §6.1), so it is built from plain strings that default to "" rather
    than ever raising — a missing common name or batch code blanks a line,
    it does not fail the page.
    """
    margin = 1.5  # mm
    qr_size_mm = qr_geometry.module_size_mm * qr_geometry.total_modules
    qr_x, qr_y = margin, (height_mm - qr_size_mm) / 2
    _draw_qr(c, qr_geometry, qr_x, qr_y)

    text_x = (qr_x + qr_size_mm + margin) * mm
    text_width_mm = max(width_mm - (qr_x + qr_size_mm + 2 * margin), 5.0)
    right_edge = text_x + text_width_mm * mm

    # Font tier keys off the page HEIGHT (the short axis — how much vertical
    # room four stacked lines have to fit in), not the width. 17mm tape
    # (13.97mm printable height) gets the smallest type so four lines still
    # fit. 62x20 (19.98mm) sits in between: taller than 17x87 but shorter
    # than 29x90 (25.91mm), so it gets its own mid-size tier rather than
    # falling through to the 17mm-tuned small type it doesn't need. All
    # three are legible printed at real ("Actual size") scale per spec §6.3.
    if height_mm >= 25:
        size1, size2, size3, size4 = 8, 7, 6.5, 6
    elif height_mm >= 18:
        size1, size2, size3, size4 = 7, 6.5, 6, 5.5
    else:
        size1, size2, size3, size4 = 6, 5.5, 5, 5

    line_gap_mm = height_mm / 4.4
    y = (height_mm - line_gap_mm * 0.85) * mm

    # Vessel line, e.g. "PO-BLU-G3-001 · #3". When the accession records which
    # vessel of the parent batch it was propagated from (T-805a's
    # ParentRef.vesselNo), that provenance is appended as
    # " <- #<parent vessel>" (spec §6.1 / T-805b) — ASCII "<-", never U+2190,
    # since the base-14 PDF fonts used here don't carry that glyph and it
    # would print as a blank box on thermal output.
    #
    # The 40-char slice below is a coarse, tape-agnostic safety net that
    # predates this suffix and is left untouched: it was never sized against
    # any tape's real column width, and the accession code must never be the
    # thing that gets clipped to make room for the suffix. So the suffix is
    # gated separately, on the ACTUAL rendered width of this specific string
    # at this tape's actual font tier (`stringWidth`, not a guessed char
    # count) against this tape's actual text column (`text_x`..`right_edge`,
    # which varies materially across 62x20/29x90/17x87 — see module docstring
    # geometry notes). If the suffixed string would not fit, the suffix is
    # dropped entirely and the line renders exactly as it did before T-805b;
    # the base line's own 40-char/width behaviour is never altered.
    base_line = f"{accession_code} · #{vessel_no}"
    line1 = base_line
    if source_vessel_no is not None:
        candidate = f"{base_line} <- #{source_vessel_no}"
        available_pt = right_edge - text_x
        if len(candidate) <= 40 and stringWidth(candidate, "Helvetica-Bold", size1) <= available_pt:
            line1 = candidate

    c.setFont("Helvetica-Bold", size1)
    c.drawString(text_x, y, line1[:40])
    y -= line_gap_mm * mm

    c.setFont("Helvetica", size2)
    line2 = f"{common_name}  {generation_label}".strip()
    c.drawString(text_x, y, line2[:40])
    y -= line_gap_mm * mm

    c.setFont("Helvetica", size3)
    c.drawString(text_x, y, (batch_code or "")[:40])
    y -= line_gap_mm * mm

    c.setFont("Helvetica", size4)
    c.drawString(text_x, y, date_str[:20])
    c.drawRightString(right_edge, y, operator_initials[:10])


@router.get(
    "/{accession_id}/labels",
    summary="Generate a label PDF for a range of vessels",
    description=(
        "One PDF page per vessel, sized for a Brother QL-800 (29x90 or "
        "17x87 die-cut tape, or 62x20 continuous tape). Read-only in "
        "permission but not in effect: printing raises labelledVesselCount "
        "to max(current, to) — see genetics-label-qr-spec.md §5.1."
    ),
)
async def get_labels(
    accession_id: str,
    from_: Optional[int] = Query(None, alias="from", ge=1, description="First vessel ordinal; defaults to the first never-printed one, or 1 if everything is already labelled (reprint)"),
    to: Optional[int] = Query(None, ge=1, description="Last vessel ordinal; defaults to quantity, or to labelledVesselCount if everything is already labelled (reprint)"),
    size: str = Query("29x90", description="Tape size: 29x90, 17x87, or 62x20"),
    current_user: CurrentUser = Depends(require_view),
) -> Response:
    if size not in _TAPE_SIZES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"size must be one of {sorted(_TAPE_SIZES)}, got '{size}'",
        )

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

    tape = _TAPE_SIZES[size]

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
