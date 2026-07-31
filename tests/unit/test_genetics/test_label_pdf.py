"""
Unit tests for T-804 step 4 — Brother QL-800 label PDF generation.

Covers the two things a wrong implementation here would get away with until
120 real plates are already printed: the QR sizing arithmetic (spec §6.2)
and the range/side-effect contract (spec §5.1). Neither is validated by
"looks right" — page count and page physical dimensions are parsed directly
out of the generated PDF bytes (no pypdf/PyPDF2 available and none may be
added — see requirements.txt), and the QR module size is asserted against
what ``qrcode`` actually picks for the real payload shape, not the spec's
rounded numbers.

Test cases:
  1.  Page count matches the requested range
  2.  Page physical dimensions (mm) match the printer's PRINTABLE area for the
      requested tape size (29x90, 17x87, 62x20) — NOT the tape stock size.
      See T-804 follow-up: the page used to be sized to stock (90x29mm /
      87x17mm), which is larger than what a Brother QL-800 can actually
      mark, so anything rasterizing the PDF down to the printer's real
      raster size (991x306px / 956x165px / 696x236px @ 300dpi) silently
      shrunk the whole page — including the QR — by the stock/printable
      ratio.
  2b. Page physical dimensions in PIXELS AT 300DPI equal the exact raster
      size ``brother_ql`` requires (991x306 for 29x90, 696x236 for 62x20 —
      696 confirmed against brother_ql's own "62" endless label entry, 236
      is the chosen 20mm feed length, not a printer constant). This is the
      unit the printer actually consumes; asserting only mm is exactly what
      let the original stock-vs-printable bug slip through undetected, so
      this test exists specifically to close that gap.
  3.  Invalid `size` -> 400
  4.  Inverted range (from > to) -> 400
  5.  Range > 500 -> 400
  6.  labelledVesselCount advances to max(old, to)
  7.  labelledVesselCount never decreases when reprinting a lower `to`
  8.  Default `from`/`to` derive from labelledVesselCount / quantity
  9.  QR geometry for 29x90: version 3, 37 modules, ~0.63mm (byte mode)
  10. QR geometry for 17x87: version 2, 33 modules, ~0.38mm (alnum, uppercase)
  11. QR geometry for 62x20: version 3, 37 modules, ~0.486mm (byte mode, not
      uppercased) and stays on version 3 across vessel numbers 1/9/10/99/120
      — i.e. no mid-batch version cliff, unlike 17x87 (T-804 follow-up,
      2026-07-31)
  12. Missing line/medium/operator metadata does not fail the PDF
  13. T-805b — source-vessel suffix on the vessel line (" <- #N"), sourced
      from the accession's own ``parents[0].vesselNo`` (T-805a): renders when
      set, renders exactly as before when unset, uses the ASCII "<-" (never
      U+2190 — the base-14 PDF fonts don't carry that glyph), and is dropped
      per-tape (not truncated into the accession code) when it would not
      physically fit that tape's real text column.
"""

from __future__ import annotations

import base64
import re
import zlib
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.modules.genetics.api.v1 import labels as labels_module
from src.modules.genetics.middleware.auth import require_view
from src.modules.genetics.models.accession import Accession, ParentRef
from src.modules.genetics.models.enums import VesselForm

PT_PER_MM = 72 / 25.4


# ---------------------------------------------------------------------------
# Raw-PDF-bytes helpers (no pypdf/PyPDF2 in requirements.txt — parsing the
# handful of PDF tokens reportlab emits is simpler than adding a dependency)
# ---------------------------------------------------------------------------

def _pdf_page_count(pdf_bytes: bytes) -> int:
    # `/Type /Page` for a leaf page object; excluded from `/Type /Pages`
    # (the page-tree node) by requiring the char after "Page" not be "s".
    return len(re.findall(rb"/Type\s*/Page(?!s)", pdf_bytes))


def _pdf_page_dims_pt(pdf_bytes: bytes) -> list[tuple[float, float]]:
    boxes = re.findall(rb"/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]", pdf_bytes)
    dims = []
    for x0, y0, x1, y1 in boxes:
        width_pt = float(x1) - float(x0)
        height_pt = float(y1) - float(y0)
        dims.append((width_pt, height_pt))
    return dims


def _pdf_page_dims_mm(pdf_bytes: bytes) -> list[tuple[float, float]]:
    return [(w_pt / PT_PER_MM, h_pt / PT_PER_MM) for w_pt, h_pt in _pdf_page_dims_pt(pdf_bytes)]


def _pdf_page_dims_px_300dpi(pdf_bytes: bytes) -> list[tuple[float, float]]:
    """Convert the PDF's point-based MediaBox back to pixels at 300dpi — the
    unit the printer driver actually consumes. Asserting only mm is exactly
    what let the original stock-vs-printable bug slip through undetected."""
    pt_per_inch = 72.0
    dpi = 300.0
    return [
        (w_pt / pt_per_inch * dpi, h_pt / pt_per_inch * dpi)
        for w_pt, h_pt in _pdf_page_dims_pt(pdf_bytes)
    ]


# ---------------------------------------------------------------------------
# Content-stream text extraction (T-805b) — reportlab compresses every page's
# content stream with `/Filter [ /ASCII85Decode /FlateDecode ]` by default, so
# the actual drawn text (e.g. "PO-BLU-... <- #4") does NOT appear anywhere in
# the raw PDF bytes; it only exists after undoing both. Confirmed by hand
# against a real reportlab-generated PDF before writing this helper — the
# decompressed stream contains plain PDF content-stream syntax like
# ``BT 1 0 0 1 10 50 Tm (PO-BLU-G3-001 \267 #3 <- #4) Tj T* ET``, i.e. a
# parenthesised string literal immediately followed by the `Tj` show-text
# operator, with octal escapes (``\267`` == 0xB7 == the WinAnsi/Latin-1 code
# point for '·') for any byte reportlab couldn't write literally.
# ---------------------------------------------------------------------------

_PDF_STREAM_RE = re.compile(rb"stream\r?\n(.*?)endstream", re.DOTALL)
_PDF_TJ_STRING_RE = re.compile(rb"\(((?:[^()\\]|\\.)*)\)\s*Tj")


def _pdf_content_streams(pdf_bytes: bytes) -> list[bytes]:
    """Decompress every ASCII85+Flate stream in the PDF. Streams that aren't
    that exact filter pair (there are none in this base-14-font-only PDF, but
    being defensive costs nothing) are skipped rather than raising."""
    streams = []
    for m in _PDF_STREAM_RE.finditer(pdf_bytes):
        raw = m.group(1).strip()
        if raw.endswith(b"~>"):  # Adobe ASCII85 end-of-data marker
            raw = raw[:-2]
        try:
            streams.append(zlib.decompress(base64.a85decode(raw, adobe=False)))
        except (ValueError, zlib.error):
            continue
    return streams


def _decode_pdf_string_literal(raw: bytes) -> str:
    """Undo PDF string-literal escaping (octal \\NNN and \\(, \\), \\\\) and
    decode as Latin-1 — the single-byte encoding reportlab's base-14 fonts
    draw text in (WinAnsiEncoding matches Latin-1 at the code points this
    file uses, e.g. 0xB7 for '·')."""
    out = bytearray()
    i = 0
    while i < len(raw):
        b = raw[i]
        if b == 0x5C and i + 1 < len(raw):  # backslash
            nxt = raw[i + 1]
            if 0x30 <= nxt <= 0x37:  # octal escape, 1-3 digits
                j = i + 1
                digits = b""
                while j < len(raw) and len(digits) < 3 and 0x30 <= raw[j] <= 0x37:
                    digits += bytes([raw[j]])
                    j += 1
                out.append(int(digits, 8) & 0xFF)
                i = j
                continue
            out.append(nxt)
            i += 2
            continue
        out.append(b)
        i += 1
    return bytes(out).decode("latin-1")


def _pdf_drawn_strings(pdf_bytes: bytes) -> list[str]:
    """Every literal-string `Tj` operand across every content stream, in
    order — i.e. every line of text reportlab actually drew onto the PDF."""
    texts = []
    for stream in _pdf_content_streams(pdf_bytes):
        for m in _PDF_TJ_STRING_RE.finditer(stream):
            texts.append(_decode_pdf_string_literal(m.group(1)))
    return texts


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def _make_accession(**overrides) -> Accession:
    defaults = dict(
        lineId="line-1",
        form=VesselForm.PETRI_DISH,
        quantity=10,
        accessionCode="PO-BLU-G3-004",
        cloneGeneration=3,
        labelledVesselCount=0,
        createdBy=None,
        createdAt=datetime(2026, 7, 1),
        acquiredAt=datetime(2026, 7, 1),
    )
    defaults.update(overrides)
    return Accession(**defaults)


class _FakeCollection:
    def __init__(self):
        self.update_one = AsyncMock()


class _FakeDB:
    def __init__(self):
        self._collection = _FakeCollection()

    def __getitem__(self, _name):
        return self._collection


@pytest.fixture
def fake_db(monkeypatch):
    db = _FakeDB()
    monkeypatch.setattr(labels_module.genetics_db, "get_database", lambda: db)
    return db


@pytest.fixture
def accession_holder(monkeypatch):
    """Mutable holder so each test can set up its own accession, fetched via
    a mocked AccessionService.get_accession."""
    holder = {"accession": _make_accession()}

    async def _get_accession(accession_id):
        return holder["accession"]

    monkeypatch.setattr(labels_module.AccessionService, "get_accession", _get_accession)
    return holder


@pytest.fixture(autouse=True)
def _mock_metadata_lookups(monkeypatch):
    """Line / medium / user lookups — stubbed to their happy-path values so
    tests not specifically exercising the fallback paths don't have to."""
    async def _get_line(line_id):
        return SimpleNamespace(commonName="Blue Oyster")

    async def _get_batch_codes(batch_ids):
        return {bid: "MEA-AC-2607-03" for bid in batch_ids}

    async def _get_user_by_id(user_id):
        return SimpleNamespace(firstName="Viet", lastName="Anh")

    monkeypatch.setattr(labels_module.LineService, "get_line", _get_line)
    monkeypatch.setattr(labels_module.MediumService, "get_batch_codes", _get_batch_codes)
    monkeypatch.setattr(labels_module.UserService, "get_user_by_id", _get_user_by_id)


@pytest.fixture
def client(fake_db, accession_holder):
    app = FastAPI()
    app.include_router(labels_module.router, prefix="/accessions")
    app.dependency_overrides[require_view] = lambda: SimpleNamespace(
        userId="u-1", role="user", divisionId=None, organizationId=None
    )
    with TestClient(app) as c:
        yield c


# ---------------------------------------------------------------------------
# Page count / dimensions
# ---------------------------------------------------------------------------

def test_page_count_matches_requested_range(client):
    resp = client.get("/accessions/acc-1/labels", params={"from": 1, "to": 5, "size": "29x90"})
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert _pdf_page_count(resp.content) == 5


@pytest.mark.parametrize(
    # Expected values are the PRINTABLE area (what brother_ql actually
    # rasterizes to), not the tape stock size — see T-804 follow-up.
    # 29x90 -> 991x306px @ 300dpi -> 83.90x25.91mm (confirmed on real QL-800
    # hardware). 17x87 -> 956x165px @ 300dpi -> 80.94x13.97mm (confirmed
    # against brother_ql's own label table, see labels.py provenance
    # comment).
    "size,expected_w,expected_h",
    [("29x90", 83.90, 25.91), ("17x87", 80.94, 13.97), ("62x20", 58.93, 19.98)],
)
def test_page_dimensions_match_printable_area(client, size, expected_w, expected_h):
    resp = client.get("/accessions/acc-1/labels", params={"from": 1, "to": 2, "size": size})
    assert resp.status_code == 200
    for width_mm, height_mm in _pdf_page_dims_mm(resp.content):
        assert width_mm == pytest.approx(expected_w, abs=0.05)
        assert height_mm == pytest.approx(expected_h, abs=0.05)


@pytest.mark.parametrize(
    # This is the unit the printer driver actually consumes. Asserting only
    # mm (above) is exactly what let the original stock-vs-printable bug
    # slip through undetected, so this test closes that gap by converting
    # the PDF's point-based MediaBox back to px @ 300dpi and checking it
    # equals the exact raster size brother_ql requires.
    "size,expected_w_px,expected_h_px",
    [("29x90", 991, 306), ("17x87", 956, 165), ("62x20", 696, 236)],
)
def test_page_dimensions_match_printer_raster_px(client, size, expected_w_px, expected_h_px):
    resp = client.get("/accessions/acc-1/labels", params={"from": 1, "to": 2, "size": size})
    assert resp.status_code == 200
    for width_px, height_px in _pdf_page_dims_px_300dpi(resp.content):
        assert width_px == pytest.approx(expected_w_px, abs=0.5)
        assert height_px == pytest.approx(expected_h_px, abs=0.5)


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def test_invalid_size_is_rejected(client):
    resp = client.get("/accessions/acc-1/labels", params={"from": 1, "to": 2, "size": "50x50"})
    assert resp.status_code == 400


def test_inverted_range_is_rejected(client):
    resp = client.get("/accessions/acc-1/labels", params={"from": 5, "to": 1})
    assert resp.status_code == 400


def test_range_over_500_is_rejected(client):
    resp = client.get("/accessions/acc-1/labels", params={"from": 1, "to": 502})
    assert resp.status_code == 400


def test_range_of_exactly_500_is_allowed(client):
    resp = client.get("/accessions/acc-1/labels", params={"from": 1, "to": 500})
    assert resp.status_code == 200
    assert _pdf_page_count(resp.content) == 500


def test_reprinting_an_already_printed_range_is_allowed(client, accession_holder):
    accession_holder["accession"] = _make_accession(labelledVesselCount=50, quantity=50)
    resp = client.get("/accessions/acc-1/labels", params={"from": 1, "to": 10})
    assert resp.status_code == 200
    assert _pdf_page_count(resp.content) == 10


# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------

def test_defaults_print_only_the_unprinted_range(client, accession_holder, fake_db):
    accession_holder["accession"] = _make_accession(labelledVesselCount=7, quantity=20)
    resp = client.get("/accessions/acc-1/labels")  # no from/to
    assert resp.status_code == 200
    assert _pdf_page_count(resp.content) == 13  # 8..20 inclusive

    args, _ = fake_db._collection.update_one.call_args
    assert args[1]["$set"]["labelledVesselCount"] == 20


def test_defaults_on_fresh_unlabelled_accession_are_unchanged(client, accession_holder, fake_db):
    """Sanity check that the split-aware default doesn't disturb the
    ordinary, never-printed-anything case: 1..quantity."""
    accession_holder["accession"] = _make_accession(labelledVesselCount=0, quantity=8)
    resp = client.get("/accessions/acc-1/labels")  # no from/to
    assert resp.status_code == 200
    assert _pdf_page_count(resp.content) == 8  # 1..8 inclusive

    args, _ = fake_db._collection.update_one.call_args
    assert args[1]["$set"]["labelledVesselCount"] == 8


def test_defaults_after_split_reprint_the_full_printed_range(client, accession_holder, fake_db):
    """T-804 follow-up: a split decrements `quantity` (spec §3) but never
    decrements `labelledVesselCount`, so labelledVesselCount+1..quantity can
    invert (7..5 for the real accession this was reproduced against:
    quantity=5, labelledVesselCount=6 after plate #2 split off as
    contaminated). Once everything currently held is already labelled, the
    sensible default becomes a full reprint: 1..labelledVesselCount. This
    must be a 200, not the 400 it was before this fix."""
    accession_holder["accession"] = _make_accession(labelledVesselCount=6, quantity=5)
    resp = client.get("/accessions/acc-1/labels")  # no from/to
    assert resp.status_code == 200
    assert _pdf_page_count(resp.content) == 6  # 1..6 inclusive

    args, _ = fake_db._collection.update_one.call_args
    assert args[1]["$set"]["labelledVesselCount"] == 6  # max(6, 6), unchanged


def test_explicit_inverted_range_still_400s_even_after_a_split(client, accession_holder):
    """Only the *defaults* change for a split accession — a genuinely
    inverted user-supplied range must still be rejected."""
    accession_holder["accession"] = _make_accession(labelledVesselCount=6, quantity=5)
    resp = client.get("/accessions/acc-1/labels", params={"from": 5, "to": 1})
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Side effect: labelledVesselCount high-water mark
# ---------------------------------------------------------------------------

def test_labelled_vessel_count_advances_to_max_of_old_and_to(client, accession_holder, fake_db):
    accession_holder["accession"] = _make_accession(labelledVesselCount=5, quantity=100)
    resp = client.get("/accessions/acc-1/labels", params={"from": 1, "to": 30})
    assert resp.status_code == 200

    args, _ = fake_db._collection.update_one.call_args
    filter_arg, update_arg = args
    assert filter_arg == {"accessionId": "acc-1"}
    assert update_arg["$set"]["labelledVesselCount"] == 30


def test_labelled_vessel_count_never_decreases_on_a_smaller_reprint(client, accession_holder, fake_db):
    accession_holder["accession"] = _make_accession(labelledVesselCount=120, quantity=120)
    resp = client.get("/accessions/acc-1/labels", params={"from": 1, "to": 10})
    assert resp.status_code == 200

    args, _ = fake_db._collection.update_one.call_args
    assert args[1]["$set"]["labelledVesselCount"] == 120  # max(120, 10), unchanged


# ---------------------------------------------------------------------------
# QR sizing arithmetic (spec §6.2) — via the pure, directly-testable helper
# ---------------------------------------------------------------------------

def test_qr_geometry_29x90_lands_on_version_3_at_37_modules():
    # target_size_mm comes from the module's own _TAPE_SIZES derivation
    # (printable-area-px -> mm -> * _QR_HEIGHT_FRACTION), not hardcoded here
    # a second time — that duplication is exactly how the old 24mm figure
    # drifted out of sync with what the printer can actually mark.
    qr_mm = labels_module._TAPE_SIZES["29x90"]["qr_mm"]
    payload = labels_module.build_label_payload("dev.a20core.com", "K7M2Q9XR4T", 7, uppercase=False)
    geometry = labels_module.compute_qr_geometry(payload, target_size_mm=qr_mm)

    assert geometry.version == 3
    assert geometry.modules_count == 29
    assert geometry.total_modules == 37  # 29 + 2*4 quiet-zone modules
    assert geometry.module_size_mm == pytest.approx(qr_mm / 37, abs=1e-6)
    # T-804 follow-up: this is SMALLER than the pre-fix 0.65mm, and that is
    # expected and correct — 0.65mm was computed against the 29mm tape
    # STOCK height, which the printer cannot physically reach. 0.63mm is
    # the honest number against the real 25.91mm printable height.
    assert geometry.module_size_mm == pytest.approx(0.630, abs=0.01)


def test_qr_geometry_17x87_forces_uppercase_and_lands_on_version_2_at_33_modules():
    qr_mm = labels_module._TAPE_SIZES["17x87"]["qr_mm"]
    payload = labels_module.build_label_payload("dev.a20core.com", "K7M2Q9XR4T", 7, uppercase=True)
    assert payload == payload.upper()

    geometry = labels_module.compute_qr_geometry(payload, target_size_mm=qr_mm)

    assert geometry.version == 2
    assert geometry.modules_count == 25
    assert geometry.total_modules == 33  # 25 + 2*4 quiet-zone modules
    assert geometry.module_size_mm == pytest.approx(qr_mm / 33, abs=1e-6)
    # T-804 follow-up: smaller than both the pre-fix 0.42mm (stock-height
    # based) and the spec's original ~0.45mm prose figure. The 17mm tape's
    # printable height (13.97mm) is itself smaller than its 17mm stock
    # height, so a worse-but-honest module size here is expected.
    assert geometry.module_size_mm == pytest.approx(0.381, abs=0.01)


def test_qr_geometry_62x20_lands_on_version_3_at_37_modules_no_uppercase():
    qr_mm = labels_module._TAPE_SIZES["62x20"]["qr_mm"]
    assert labels_module._TAPE_PRINTABLE_PX["62x20"]["uppercase"] is False
    payload = labels_module.build_label_payload("dev.a20core.com", "K7M2Q9XR4T", 7, uppercase=False)
    assert payload != payload.upper()  # confirms this size deliberately does NOT force uppercase

    geometry = labels_module.compute_qr_geometry(payload, target_size_mm=qr_mm)

    assert geometry.version == 3
    assert geometry.modules_count == 29
    assert geometry.total_modules == 37  # 29 + 2*4 quiet-zone modules
    assert geometry.module_size_mm == pytest.approx(qr_mm / 37, abs=1e-6)
    # T-804 follow-up (2026-07-31): comfortable module size without the
    # alphanumeric-mode trick 17x87 needs — the whole point of adding this
    # size. ~0.486mm, well above the ~0.5mm phone-camera comfort line's
    # neighborhood and far above 17x87's 0.38mm/0.34mm.
    assert geometry.module_size_mm == pytest.approx(0.486, abs=0.01)


@pytest.mark.parametrize("vessel_no", [1, 9, 10, 99, 120])
def test_qr_geometry_62x20_stays_on_version_3_across_vessel_numbers(vessel_no):
    """T-804 follow-up: the main advantage of 62x20 over 17x87 is that it does
    NOT cross a QR version boundary as the vessel-number digit count grows
    within a batch (17x87 drops from 0.381mm to 0.340mm at vessel #10 — a
    visible density cliff mid-run). Verified here against the real
    PUBLIC_BASE_URL and a real token, not assumed — every one of these must
    land on version 3 with an unchanging module size."""
    qr_mm = labels_module._TAPE_SIZES["62x20"]["qr_mm"]
    payload = labels_module.build_label_payload(
        "https://dev.a20core.com", "14DQRT8S8N", vessel_no, uppercase=False
    )
    geometry = labels_module.compute_qr_geometry(payload, target_size_mm=qr_mm)

    assert geometry.version == 3
    assert geometry.total_modules == 37
    assert geometry.module_size_mm == pytest.approx(0.486, abs=0.01)


def test_uppercase_payload_uses_fewer_or_equal_modules_than_mixed_case():
    """The whole point of forcing uppercase on 17x87 — it must not regress
    to needing the larger byte-mode version."""
    lower_geom = labels_module.compute_qr_geometry(
        labels_module.build_label_payload("dev.a20core.com", "K7M2Q9XR4T", 7, uppercase=False),
        target_size_mm=14.0,
    )
    upper_geom = labels_module.compute_qr_geometry(
        labels_module.build_label_payload("dev.a20core.com", "K7M2Q9XR4T", 7, uppercase=True),
        target_size_mm=14.0,
    )
    assert upper_geom.total_modules <= lower_geom.total_modules
    assert upper_geom.module_size_mm >= lower_geom.module_size_mm


# ---------------------------------------------------------------------------
# Metadata fallbacks — text block must never fail the PDF (spec §6.1)
# ---------------------------------------------------------------------------

def test_missing_line_medium_and_operator_do_not_fail_the_pdf(client, accession_holder, monkeypatch):
    accession_holder["accession"] = _make_accession(
        mediumBatchId=None, createdBy=None, labelledVesselCount=0, quantity=1,
    )

    async def _raise(*_args, **_kwargs):
        raise Exception("line service unreachable")

    monkeypatch.setattr(labels_module.LineService, "get_line", _raise)

    resp = client.get("/accessions/acc-1/labels", params={"from": 1, "to": 1})
    assert resp.status_code == 200
    assert _pdf_page_count(resp.content) == 1


# ---------------------------------------------------------------------------
# Source-vessel suffix (T-805b) — "PO-BLU-G3-004 · #3 <- #4" provenance
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("size", ["29x90", "17x87", "62x20"])
def test_source_vessel_suffix_renders_when_parent_vessel_recorded(client, accession_holder, size):
    """The suffix is sourced from the accession's own parents[0].vesselNo
    (T-805a) — no extra DB lookup. All three tape sizes comfortably fit this
    realistic-length example (short code, single-digit ordinals)."""
    accession_holder["accession"] = _make_accession(
        parents=[ParentRef(vesselNo=4)], labelledVesselCount=0, quantity=5,
    )
    resp = client.get("/accessions/acc-1/labels", params={"from": 3, "to": 3, "size": size})
    assert resp.status_code == 200
    assert "PO-BLU-G3-004 · #3 <- #4" in _pdf_drawn_strings(resp.content)


@pytest.mark.parametrize("size", ["29x90", "17x87", "62x20"])
@pytest.mark.parametrize(
    "parents", [[], [ParentRef(vesselNo=None)]], ids=["no_parents_recorded", "parent_without_a_vessel_no"]
)
def test_vessel_line_unchanged_without_a_recorded_source_vessel(client, accession_holder, size, parents):
    """No source vessel on record (parentage unknown, or noted without a
    vessel number) -> the line renders EXACTLY as it did before T-805b: no
    suffix, no dangling arrow, nothing appended."""
    accession_holder["accession"] = _make_accession(parents=parents, labelledVesselCount=0, quantity=3)
    resp = client.get("/accessions/acc-1/labels", params={"from": 3, "to": 3, "size": size})
    assert resp.status_code == 200
    texts = _pdf_drawn_strings(resp.content)
    assert "PO-BLU-G3-004 · #3" in texts
    assert not any("<-" in t for t in texts)


def test_source_vessel_suffix_uses_ascii_arrow_never_the_unicode_glyph(client, accession_holder):
    """CRITICAL per spec §6.1 / T-805b: the base-14 PDF fonts used here
    (Helvetica/Helvetica-Bold) do not contain U+2190 ('←') — it must never
    appear anywhere in the PDF, compressed or decompressed, in any encoded
    form. The arrow drawn must be the ASCII two-character sequence "<-"."""
    accession_holder["accession"] = _make_accession(
        parents=[ParentRef(vesselNo=4)], labelledVesselCount=0, quantity=5,
    )
    resp = client.get("/accessions/acc-1/labels", params={"from": 3, "to": 3, "size": "29x90"})
    assert resp.status_code == 200

    texts = _pdf_drawn_strings(resp.content)
    assert any("<-" in t for t in texts)  # ASCII arrow present in drawn text

    unicode_arrow_utf8 = "←".encode("utf-8")  # b'\xe2\x86\x90'
    # Raw PDF bytes (covers anything NOT inside a compressed content stream,
    # e.g. document metadata) ...
    assert unicode_arrow_utf8 not in resp.content
    assert "←" not in resp.content.decode("latin-1", errors="ignore")
    # ... and every decompressed content stream (where the drawn text lives).
    for stream in _pdf_content_streams(resp.content):
        assert unicode_arrow_utf8 not in stream
        assert "←" not in stream.decode("latin-1", errors="ignore")


def test_source_vessel_suffix_dropped_per_tape_when_it_would_not_fit_accession_code_never_truncated(
    client, accession_holder,
):
    """Width-budget check (spec §6.1 / T-805b): the three tape sizes have
    materially different text-column widths and font-size tiers (62x20's
    column is the narrowest of the three at its font tier — see
    labels.py's `_TAPE_PRINTABLE_PX` / `_draw_label_page`). A long code with
    4-digit ordinals is a synthetic worst case verified (via `stringWidth`
    against Helvetica-Bold at each tape's real size1) to overflow 62x20's
    column with the suffix appended, while still fitting 29x90 and 17x87.

    62x20 must drop the suffix and fall back to the un-suffixed line rather
    than clip the accession code; the other two sizes must still show it.
    The accession code itself must render in FULL on every size."""
    accession_holder["accession"] = _make_accession(
        accessionCode="PO-BLU-G100-1234",
        parents=[ParentRef(vesselNo=1234)],
        labelledVesselCount=0, quantity=2000,
    )

    resp_narrow = client.get("/accessions/acc-1/labels", params={"from": 1234, "to": 1234, "size": "62x20"})
    assert resp_narrow.status_code == 200
    texts_narrow = _pdf_drawn_strings(resp_narrow.content)
    assert "PO-BLU-G100-1234 · #1234" in texts_narrow  # accession code intact, unsuffixed
    assert not any("<-" in t for t in texts_narrow)  # suffix dropped, not truncated in

    for size in ["29x90", "17x87"]:
        resp = client.get("/accessions/acc-1/labels", params={"from": 1234, "to": 1234, "size": size})
        assert resp.status_code == 200
        texts = _pdf_drawn_strings(resp.content)
        assert "PO-BLU-G100-1234 · #1234 <- #1234" in texts  # wider columns: suffix fits
