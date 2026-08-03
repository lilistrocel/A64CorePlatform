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

Additional test cases (T-804 second follow-up, 2026-07-31 — 62mm continuous
tape length is now a free integer parameter, 12-100mm, instead of a single
hardcoded ``62x20`` entry):
  14. ``62x15`` and ``62x20`` both produce the correct page geometry in
      pixels @ 300dpi (696x177 and 696x236 respectively) — 15mm/25.4*300 =
      177.165 -> 177px, 20mm/25.4*300 = 236.22 -> 236px.
  15. An arbitrary in-range length (``62x18``) works end-to-end.
  16. Out-of-range 62mm lengths (``62x5``, ``62x150``) -> 400 naming the
      valid 12-100mm range. Malformed size strings (``62x``, ``62xabc``,
      bare ``62``) -> 400, never a 500/unhandled exception.
  17. ``29x90`` and ``17x87`` remain fixed, non-parameterizable: same
      geometry as before, and ``29xN``/``17xN`` variants (e.g. ``29x50``,
      ``17x100``) are rejected exactly like any other unknown size — this
      is a regression guard against the 62-family parsing logic ever
      accidentally widening to match the other two prefixes.
  18. The sub-0.35mm low-density WARNING log (tightened from 0.40mm
      2026-07-31 — 62x15 is hardware-confirmed clean, so 0.40mm was firing
      on a size that demonstrably works) fires for ``62x12`` (~0.302mm) and
      does NOT fire for ``62x15`` (~0.377mm) or ``62x20`` (~0.502mm),
      asserted via caplog. (``62x12`` replaces the original ``62x14`` case
      here — see test case 21 below, round 2 pushed ``62x14`` just over the
      threshold.)

Additional test cases (config-identity follow-up, 2026-08 — PUBLIC_BASE_URL
must never silently fall back to a foreign or unreachable value; see
docker-compose.yml / src/config/settings.py / _require_public_base_url):
  23. Empty PUBLIC_BASE_URL -> _require_public_base_url raises HTTPException
      500 naming the variable, and GET .../labels 500s the same way.
  24. Loopback/localhost PUBLIC_BASE_URL (several forms) -> same 500,
      mentioning "loopback" in the detail.
  25. A normal https host -> _require_public_base_url returns it unchanged
      and GET .../labels succeeds (200) exactly as before this guard existed.
  26. build_label_payload itself is untouched by the guard: every existing
      call in this file that passes a bare hostname string directly (not
      through settings.PUBLIC_BASE_URL) is unaffected, since the guard only
      runs inside get_labels(), not inside build_label_payload().

Additional test cases (label PDF tuning round 2, 2026-07-31, same day —
real QL-800 hardware feedback on a printed 62x15 label: "still a large space
between the date and the species", "make the text a bit bigger and the QR a
bit bigger"):
  19. The medium-batch-code line, empty for most real accessions (including
      the live reference accession ``PO-BLU-G3-001``), is dropped from the
      layout entirely — 4 `Tj` draws instead of 5 — and the freed vertical
      space goes into a bigger `line_gap` (measured via `_pdf_text_draws`
      against the real content stream: the gap between the species line and
      the date line equals exactly one line-box, not two), on every tape.
  20. When the batch-code line DOES have content, all 4 rows still draw (5
      `Tj`s) — the collapse is conditional, not a blanket reduction.
  21. QR-to-edge vertical clearance stays >= 0.4mm on every tape at the
      raised `_QR_HEIGHT_FRACTION = 0.93`, and the specific landed clearance
      values are pinned so a future change fails loudly rather than eroding
      silently toward the floor.
  22. Every font-size/QR-geometry assertion pinned before round 2 (QR module
      sizes, `_derive_text_sizes` call sites, the suffix-drop long-code
      scenario, the reference-line width-ceiling guard) is re-verified
      against the new `_QR_HEIGHT_FRACTION` (0.93) and `_TEXT_MARGIN_MM`
      (1.3mm, replacing the old inline `margin = 1.5`) geometry — none of
      the five shipped tape sizes' font sizes may be smaller than their
      round-1 values (see the before/after table in the backlog entry).
"""

from __future__ import annotations

import base64
import logging
import re
import zlib
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from reportlab.pdfbase.pdfmetrics import getAscentDescent, stringWidth

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
#
# Round 3 (label PDF tuning, 2026-07-31) extension — brand fonts are now
# EMBEDDED TrueType subsets (Space Mono Bold / Hanken Grotesk), not the
# base-14 Helvetica/Helvetica-Bold this file originally assumed everywhere.
# Confirmed by hand against a real round-3 PDF before extending this harness:
# embedded-subset text is STILL a plain parenthesised literal followed by
# `Tj` (reportlab did not switch to a Type0/hex-string composite font here),
# but the BYTE VALUES inside it are the subset's own private single-byte
# encoding, assigned in first-use order starting near 0x01 for any character
# outside 0x20-0x7E — NOT WinAnsi/Latin-1. E.g. '·' (Latin-1 0xB7) can come
# back as raw byte 0x01 in a Space Mono Bold string. Decoding that byte as
# Latin-1 would silently produce the WRONG character. The fix is not a guess:
# reportlab also embeds a `/ToUnicode` CMap object per embedded font
# (standard PDF practice, for text-extraction/accessibility) that maps each
# byte code to its real Unicode codepoint via `beginbfchar`/`endbfchar`
# entries — `_pdf_font_decoders` parses that CMap directly out of the raw PDF
# object graph and `_pdf_text_draws` applies it per the `Tf` font resource
# (`/F2+0` etc.) active at each `Tj`. Fonts with no `/ToUnicode` (the base-14
# Helvetica/Helvetica-Bold fallback path, if font registration ever fails)
# fall through untouched — their raw byte IS already the correct Latin-1
# character, exactly the pre-round-3 behaviour.
# ---------------------------------------------------------------------------

_PDF_STREAM_RE = re.compile(rb"stream\r?\n(.*?)endstream", re.DOTALL)
_PDF_TJ_STRING_RE = re.compile(rb"\(((?:[^()\\]|\\.)*)\)\s*Tj")


def _decompress_pdf_stream(raw: bytes) -> Optional[bytes]:
    """Decompress a PDF stream body. Content streams use
    ``[/ASCII85Decode /FlateDecode]``; ``/ToUnicode`` CMap streams (round 3)
    use plain ``[/FlateDecode]`` — both are tried rather than assumed, since
    which one applies depends on the object, not a fixed rule."""
    raw = raw.strip()
    candidate = raw[:-2] if raw.endswith(b"~>") else raw  # Adobe ASCII85 end marker
    try:
        return zlib.decompress(base64.a85decode(candidate, adobe=False))
    except (ValueError, zlib.error):
        pass
    try:
        return zlib.decompress(raw)
    except zlib.error:
        return None


def _pdf_content_streams(pdf_bytes: bytes) -> list[bytes]:
    """Decompress every stream in the PDF that is actually a content stream
    (i.e. successfully decompresses and contains recognisable content-stream
    syntax) — ``/ToUnicode`` CMap streams and the mono-mark image's own
    Flate-compressed pixel data (round 3) also decompress via the same
    generic helper, so they are explicitly filtered back out here rather
    than trusting "decompressed successfully" alone."""
    streams = []
    for m in _PDF_STREAM_RE.finditer(pdf_bytes):
        decompressed = _decompress_pdf_stream(m.group(1))
        if decompressed is None:
            continue
        if b" Tj" in decompressed or b" re" in decompressed or b" cm" in decompressed:
            streams.append(decompressed)
    return streams


def _decode_pdf_string_literal(raw: bytes) -> str:
    """Undo PDF string-literal escaping (octal \\NNN and \\(, \\), \\\\) and
    decode as Latin-1. Latin-1 decoding of arbitrary bytes never fails and
    is lossless/order-preserving (``ord(decoded[i]) == original_byte[i]``
    always), so this doubles as a byte-preserving passthrough for embedded-
    font text too — callers that need the REAL character for an embedded
    font re-map through that font's ``/ToUnicode`` table afterwards (see
    ``_pdf_font_decoders`` / ``_pdf_text_draws``); this function's own output
    is deliberately just "the raw bytes as a string", not "the real text"."""
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


# ---------------------------------------------------------------------------
# Embedded-font byte -> real-character decoding (round 3, see the extended
# module-level comment above `_pdf_content_streams`).
# ---------------------------------------------------------------------------

_PDF_OBJ_RE = re.compile(rb"(\d+)\s+0\s+obj\s*<<(.*?)>>\s*\r?\n?endobj", re.DOTALL)
_PDF_FONT_TYPE_RE = re.compile(rb"/Type\s*/Font\b")
_PDF_RESOURCE_NAME_RE = re.compile(rb"/Name\s*/(F\d+(?:\+\d+)?)")
_PDF_TOUNICODE_REF_RE = re.compile(rb"/ToUnicode\s+(\d+)\s+0\s+R")
_PDF_BFCHAR_RE = re.compile(rb"<([0-9A-Fa-f]{2})>\s*<([0-9A-Fa-f]{4,})>")


def _pdf_font_decoders(pdf_bytes: bytes) -> dict[str, dict[int, str]]:
    """Map each font RESOURCE name (e.g. ``F2+0``) referenced anywhere in the
    document to a ``{byte_code: real_character}`` dict, built from that
    font's own ``/ToUnicode`` CMap object. A resource name with no
    ``/ToUnicode`` (a base-14 font — see module comment above) is simply
    absent from the returned dict."""
    decoders: dict[str, dict[int, str]] = {}
    for obj_match in _PDF_OBJ_RE.finditer(pdf_bytes):
        body = obj_match.group(2)
        if not _PDF_FONT_TYPE_RE.search(body):
            continue
        name_match = _PDF_RESOURCE_NAME_RE.search(body)
        touni_match = _PDF_TOUNICODE_REF_RE.search(body)
        if not name_match or not touni_match:
            continue
        resource_name = name_match.group(1).decode("ascii")
        touni_obj_num = touni_match.group(1)
        stream_match = re.search(
            touni_obj_num + rb"\s+0\s+obj\s*<<.*?>>\s*stream\r?\n(.*?)endstream",
            pdf_bytes, re.DOTALL,
        )
        if not stream_match:
            continue
        decompressed = _decompress_pdf_stream(stream_match.group(1))
        if decompressed is None:
            continue
        code_map: dict[int, str] = {}
        for code_hex, uni_hex in _PDF_BFCHAR_RE.findall(decompressed):
            codepoint = int(uni_hex[:4], 16)  # first UTF-16 code unit
            if codepoint:  # 0000 == .notdef — never a real drawn character
                code_map[int(code_hex, 16)] = chr(codepoint)
        decoders[resource_name] = code_map
    return decoders


def _pdf_drawn_strings(pdf_bytes: bytes) -> list[str]:
    """Every literal-string `Tj` operand across every content stream, in
    order — i.e. every line of text reportlab actually drew onto the PDF,
    decoded to its REAL characters (round 3: via each draw's own embedded-
    font ``/ToUnicode`` table where one applies)."""
    return [d["text"] for d in _pdf_text_draws(pdf_bytes)]


# ---------------------------------------------------------------------------
# Text-block geometry measurement (font-size/leading fix, 2026-07-31) — pulls
# the ACTUAL font size and (x, y) draw position of every text line out of the
# content stream, so overlap/overflow/width claims are measured against the
# real PDF bytes rather than eyeballed off a screenshot. reportlab emits each
# line as two separate operators in sequence: `BT /F<n> <size> Tf ... ET`
# (sets the font/size state) followed later by
# `BT 1 0 0 1 <x> <y> Tm (<text>) Tj T* ET` (draws at that state) — confirmed
# by hand against a real generated PDF's decompressed stream before writing
# these regexes. There is no single operator carrying both, so the two are
# matched separately and merged by stream position (`.start()`), mirroring
# how a real PDF interpreter would apply them in document order.
#
# Round 3: two things changed in the operator stream, confirmed by hand
# against a real round-3 PDF before touching these regexes:
#
#   1. The font RESOURCE name is no longer always ``/F<digits>`` — embedded
#      subset fonts get a ``+<n>`` subset-tag suffix (e.g. ``/F2+0``).
#      `_PDF_TF_RE` now captures the resource name (not just discards it) so
#      `_pdf_text_draws` can look it up in `_pdf_font_decoders`'s per-font
#      byte maps.
#   2. `Tm` and the `(text) Tj` that draws at that position are no longer
#      always ONE contiguous operator run — for an embedded font, reportlab
#      emits ``Tm /F2+0 10.7 Tf 12.84 TL (text) Tj``, i.e. the `Tf`/`TL`
#      state-setting operators sit BETWEEN `Tm` and `Tj`, not before both
#      (the pre-round-3 base-14 path emits `Tm` immediately before `(text)
#      Tj` with no operator in between, which is why the original regex
#      fused them into one match). `Tm`, `Tf`, and `(text) Tj` are now three
#      INDEPENDENT event streams merged by stream position — the same
#      "apply operators in document order" approach the module already used
#      for `Tf` vs `Tj`, just widened to a third operator instead of
#      assuming adjacency between any two.
# ---------------------------------------------------------------------------

_PDF_TF_RE = re.compile(rb"/(F\d+(?:\+\d+)?)\s+([\d.]+)\s+Tf")
_PDF_TM_RE = re.compile(rb"1 0 0 1 ([\d.]+) ([\d.]+) Tm")


def _pdf_text_draws(pdf_bytes: bytes) -> list[dict]:
    """Every text draw across every content stream, in document order, as
    ``{"size": <pt>, "x_pt": <pt>, "y_pt": <pt>, "text": <str>}`` — position
    is whatever the most recently preceding ``Tm`` set, font size/resource is
    whatever the most recently preceding ``Tf`` set (independently of ``Tm``
    — see "Round 3" above), and ``text`` is decoded through that resource's
    embedded-font ``/ToUnicode`` map when one exists (round 3), else the raw
    Latin-1 byte (pre-round-3 behaviour, still correct for the base-14
    fallback path)."""
    font_decoders = _pdf_font_decoders(pdf_bytes)
    draws = []
    for stream in _pdf_content_streams(pdf_bytes):
        events = [(m.start(), "tf", (m.group(1).decode("ascii"), float(m.group(2)))) for m in _PDF_TF_RE.finditer(stream)]
        events += [(m.start(), "tm", (float(m.group(1)), float(m.group(2)))) for m in _PDF_TM_RE.finditer(stream)]
        events += [
            (m.start(), "tj", _decode_pdf_string_literal(m.group(1)))
            for m in _PDF_TJ_STRING_RE.finditer(stream)
        ]
        events.sort(key=lambda e: e[0])
        current_size = None
        current_font = None
        current_xy = None
        for _, kind, payload in events:
            if kind == "tf":
                current_font, current_size = payload
            elif kind == "tm":
                current_xy = payload
            else:
                raw_text = payload
                code_map = font_decoders.get(current_font, {})
                text = "".join(code_map.get(ord(ch), ch) for ch in raw_text)
                x_pt, y_pt = current_xy
                draws.append({"size": current_size, "x_pt": x_pt, "y_pt": y_pt, "text": text})
    return draws


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
    # STOCK height, which the printer cannot physically reach. Label PDF
    # tuning round 2 (2026-07-31) then raised _QR_HEIGHT_FRACTION 0.90 ->
    # 0.93 (bigger QR per hardware feedback), growing this from 0.63mm to
    # 0.65mm.
    assert geometry.module_size_mm == pytest.approx(0.651, abs=0.01)


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
    # height, so a worse-but-honest module size here is expected. Label PDF
    # tuning round 2 (2026-07-31) raised _QR_HEIGHT_FRACTION 0.90 -> 0.93,
    # growing this from 0.381mm to 0.394mm.
    assert geometry.module_size_mm == pytest.approx(0.394, abs=0.01)


def test_qr_geometry_62x20_lands_on_version_3_at_37_modules_no_uppercase():
    qr_mm = labels_module._tape_dimensions("62x20")["qr_mm"]
    assert labels_module._parse_tape_spec("62x20")["uppercase"] is False
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
    # neighborhood and far above 17x87's 0.38mm/0.34mm. Label PDF tuning
    # round 2 (same day) raised _QR_HEIGHT_FRACTION 0.90 -> 0.93, growing
    # this further to ~0.502mm.
    assert geometry.module_size_mm == pytest.approx(0.502, abs=0.01)


@pytest.mark.parametrize("vessel_no", [1, 9, 10, 99, 120])
def test_qr_geometry_62x20_stays_on_version_3_across_vessel_numbers(vessel_no):
    """T-804 follow-up: the main advantage of 62x20 over 17x87 is that it does
    NOT cross a QR version boundary as the vessel-number digit count grows
    within a batch (17x87 drops from 0.381mm to 0.340mm at vessel #10 — a
    visible density cliff mid-run). Verified here against the real
    PUBLIC_BASE_URL and a real token, not assumed — every one of these must
    land on version 3 with an unchanging module size."""
    qr_mm = labels_module._tape_dimensions("62x20")["qr_mm"]
    payload = labels_module.build_label_payload(
        "https://dev.a20core.com", "14DQRT8S8N", vessel_no, uppercase=False
    )
    geometry = labels_module.compute_qr_geometry(payload, target_size_mm=qr_mm)

    assert geometry.version == 3
    assert geometry.total_modules == 37
    assert geometry.module_size_mm == pytest.approx(0.502, abs=0.01)


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
    """Width-budget check (spec §6.1 / T-805b): the tape sizes have
    materially different text-column widths and font sizes (62x20's column
    is the narrowest at its font size — see labels.py's `_TAPE_PRINTABLE_PX`
    / `_draw_label_page`). A long code with 4-digit ordinals is a synthetic
    worst case verified (via `stringWidth` against Helvetica-Bold at each
    tape's real size1) to overflow both 62x20's and 29x90's columns with the
    suffix appended, while still fitting 17x87.

    `mediumBatchId`/`createdBy` are set here (unlike most other tests in this
    file) so this fixture always has all 4 line slots populated — line_count
    is pinned at 4, isolating this width-ceiling behaviour from the
    blank-line-collapse feature (T-8xx round 2), which is a separate concern
    covered by its own tests below.

    Label PDF tuning round 2 (2026-07-31) raised `_SIZE1_ABSOLUTE_CEILING_PT`
    9.0 -> 11.0, which lets 29x90's size1 grow enough (9.0 -> 11.0) that this
    particular pathological synthetic string (not the realistic
    `_SIZE1_REFERENCE_LINE` — see `test_reference_vessel_line_fits_on_every_
    tape_size`, which is guaranteed to fit by construction and is
    unaffected) now also overflows 29x90's column, where round 1 kept it.
    That is the expected width-ceiling guard doing its job at a bigger font
    size, not a regression — 29x90's actual font size did not shrink (see
    `test_text_block_lines_do_not_overlap_or_overflow_the_label` and the
    before/after table in the backlog entry).

    62x20 and 29x90 must drop the suffix and fall back to the un-suffixed
    line rather than clip the accession code; 17x87 must still show it. The
    accession code itself must render in FULL on every size."""
    accession_holder["accession"] = _make_accession(
        accessionCode="PO-BLU-G100-1234",
        parents=[ParentRef(vesselNo=1234)],
        mediumBatchId="batch-1", createdBy="user-1",
        labelledVesselCount=0, quantity=2000,
    )

    for size in ["62x20", "29x90"]:
        resp = client.get("/accessions/acc-1/labels", params={"from": 1234, "to": 1234, "size": size})
        assert resp.status_code == 200
        texts = _pdf_drawn_strings(resp.content)
        assert "PO-BLU-G100-1234 · #1234" in texts  # accession code intact, unsuffixed
        assert not any("<-" in t for t in texts), f"{size}: suffix should have been dropped, not truncated in"

    resp = client.get("/accessions/acc-1/labels", params={"from": 1234, "to": 1234, "size": "17x87"})
    assert resp.status_code == 200
    texts = _pdf_drawn_strings(resp.content)
    assert "PO-BLU-G100-1234 · #1234 <- #1234" in texts  # widest column relative to its own font size: suffix fits


# ---------------------------------------------------------------------------
# 62mm continuous tape — parameterized length (T-804 second follow-up,
# 2026-07-31). Only the ``62`` family is parameterizable; ``29x90``/``17x87``
# are fixed die-cut stock and must reject any ``29xN``/``17xN`` variant.
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "size,expected_w_px,expected_h_px",
    [("62x15", 696, 177), ("62x20", 696, 236)],
)
def test_62mm_parameterized_length_page_dims_px(client, size, expected_w_px, expected_h_px):
    """15mm/25.4*300 = 177.165 -> 177px, 20mm/25.4*300 = 236.22 -> 236px.
    Width stays the fixed 696px (58.93mm) printable tape width regardless
    of the chosen length."""
    resp = client.get("/accessions/acc-1/labels", params={"from": 1, "to": 1, "size": size})
    assert resp.status_code == 200
    for width_px, height_px in _pdf_page_dims_px_300dpi(resp.content):
        assert width_px == pytest.approx(expected_w_px, abs=0.5)
        assert height_px == pytest.approx(expected_h_px, abs=0.5)


def test_62mm_arbitrary_in_range_length_works_end_to_end(client):
    """62x18 is not a previously-hardcoded value — proves the parameterized
    path works for any in-range N, not just 15/20."""
    resp = client.get("/accessions/acc-1/labels", params={"from": 1, "to": 3, "size": "62x18"})
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert _pdf_page_count(resp.content) == 3
    for width_px, height_px in _pdf_page_dims_px_300dpi(resp.content):
        assert width_px == pytest.approx(696, abs=0.5)
        assert height_px == pytest.approx(213, abs=0.5)  # round(18/25.4*300) = 213


@pytest.mark.parametrize("size", ["62x5", "62x150", "62x11", "62x101"])
def test_62mm_out_of_range_length_rejected(client, size):
    resp = client.get("/accessions/acc-1/labels", params={"from": 1, "to": 1, "size": size})
    assert resp.status_code == 400
    detail = resp.json()["detail"]
    assert "12" in detail and "100" in detail  # names the valid range, not just "invalid"


@pytest.mark.parametrize("size", ["62x", "62xabc", "62", "62x15.5", "62x-5"])
def test_62mm_malformed_size_strings_rejected_not_500(client, size):
    """Malformed size strings must 400, never an unhandled exception/500."""
    resp = client.get("/accessions/acc-1/labels", params={"from": 1, "to": 1, "size": size})
    assert resp.status_code == 400


def test_62mm_leading_zeros_in_length_are_accepted_not_malformed(client):
    """``62x0015`` DOES match the digits-only length pattern and parses to a
    valid in-range length (15) — leading zeros are an unusual spelling of a
    valid int, not a malformed string, and int('0015') == 15 in Python."""
    resp = client.get("/accessions/acc-1/labels", params={"from": 1, "to": 1, "size": "62x0015"})
    assert resp.status_code == 200
    for width_px, height_px in _pdf_page_dims_px_300dpi(resp.content):
        assert width_px == pytest.approx(696, abs=0.5)
        assert height_px == pytest.approx(177, abs=0.5)


@pytest.mark.parametrize("size", ["29x50", "29x15", "29xN", "17x100", "17x50", "17x87mm"])
def test_29xN_and_17xN_variants_are_never_parameterizable(client, size):
    """Regression guard: 29x90 and 17x87 are fixed die-cut stock. The 62xN
    parsing path must never accidentally widen to accept a 29xN/17xN
    variant — every one of these must be rejected exactly like any other
    unknown size string."""
    resp = client.get("/accessions/acc-1/labels", params={"from": 1, "to": 1, "size": size})
    assert resp.status_code == 400


def test_29x90_and_17x87_geometry_unchanged_by_62_parameterization(client):
    """29x90/17x87 must still behave EXACTLY as before this change: same
    printable-area geometry, unaffected by the 62-family becoming
    parameterizable."""
    for size, expected_w_px, expected_h_px in [("29x90", 991, 306), ("17x87", 956, 165)]:
        resp = client.get("/accessions/acc-1/labels", params={"from": 1, "to": 1, "size": size})
        assert resp.status_code == 200
        for width_px, height_px in _pdf_page_dims_px_300dpi(resp.content):
            assert width_px == pytest.approx(expected_w_px, abs=0.5)
            assert height_px == pytest.approx(expected_h_px, abs=0.5)


def test_qr_geometry_62x15_lands_on_version_3_at_37_modules():
    """The user's next hardware trial after the proven-good 62x20 baseline —
    see spec §6.2 for the explicit comparison against 17x87's 0.381mm. Label
    PDF tuning round 2 (2026-07-31) raised _QR_HEIGHT_FRACTION 0.90 -> 0.93,
    growing this from 0.365mm to ~0.377mm."""
    qr_mm = labels_module._tape_dimensions("62x15")["qr_mm"]
    payload = labels_module.build_label_payload("dev.a20core.com", "K7M2Q9XR4T", 7, uppercase=False)
    geometry = labels_module.compute_qr_geometry(payload, target_size_mm=qr_mm)

    assert geometry.version == 3
    assert geometry.modules_count == 29
    assert geometry.total_modules == 37
    assert geometry.module_size_mm == pytest.approx(qr_mm / 37, abs=1e-6)
    assert geometry.module_size_mm == pytest.approx(0.377, abs=0.01)


def test_qr_geometry_62x18_lands_on_version_3_at_37_modules():
    qr_mm = labels_module._tape_dimensions("62x18")["qr_mm"]
    payload = labels_module.build_label_payload("dev.a20core.com", "K7M2Q9XR4T", 7, uppercase=False)
    geometry = labels_module.compute_qr_geometry(payload, target_size_mm=qr_mm)

    assert geometry.version == 3
    assert geometry.modules_count == 29
    assert geometry.total_modules == 37
    assert geometry.module_size_mm == pytest.approx(qr_mm / 37, abs=1e-6)


# ---------------------------------------------------------------------------
# Low-density warning (below 0.35mm/module — tightened from 0.40mm 2026-07-31:
# 62x15 (0.365mm) is hardware-confirmed scanning cleanly, so a 0.40mm
# threshold fired on a size that demonstrably works. Fires for 62x12
# (previously 62x14, see below), not for 62x15 or 62x20.
#
# Label PDF tuning round 2 (2026-07-31, same day) raised _QR_HEIGHT_FRACTION
# 0.90 -> 0.93, which raises EVERY 62mm length's module size a little —
# including 62x14, which moved from ~0.340mm (fires) to ~0.351mm (does NOT
# fire; it is now just barely over the 0.35mm line). That is the correct
# consequence of a genuinely bigger QR, not a bug, but it means 62x14 no
# longer demonstrates the "fires" case. 62x12 (the shortest length the
# parser accepts at all, `_TAPE_62_MIN_MM`) still sits well under the
# threshold at ~0.302mm and is used here instead.
# ---------------------------------------------------------------------------

def test_low_density_warning_fires_for_62x12(client, caplog):
    """62x12 (~0.302mm/module) sits below the tightened 0.35mm threshold."""
    with caplog.at_level(logging.WARNING, logger=labels_module.logger.name):
        resp = client.get("/accessions/acc-1/labels", params={"from": 1, "to": 1, "size": "62x12"})
    assert resp.status_code == 200

    warnings = [r for r in caplog.records if r.levelno == logging.WARNING]
    assert any("size=62x12" in r.getMessage() and "below the 0.35mm comfort threshold" in r.getMessage() for r in warnings), (
        f"expected a low-density warning for 62x12, got: {[r.getMessage() for r in warnings]}"
    )


def test_low_density_warning_does_not_fire_for_62x15(client, caplog):
    """62x15 (~0.365mm/module) is ABOVE the tightened 0.35mm threshold —
    the whole point of tightening it: this size is hardware-verified to
    scan cleanly, so it must not still be flagged as noise."""
    with caplog.at_level(logging.WARNING, logger=labels_module.logger.name):
        resp = client.get("/accessions/acc-1/labels", params={"from": 1, "to": 1, "size": "62x15"})
    assert resp.status_code == 200

    warnings = [r for r in caplog.records if r.levelno == logging.WARNING]
    assert not any("comfort threshold" in r.getMessage() for r in warnings)


def test_low_density_warning_does_not_fire_for_62x20(client, caplog):
    with caplog.at_level(logging.WARNING, logger=labels_module.logger.name):
        resp = client.get("/accessions/acc-1/labels", params={"from": 1, "to": 1, "size": "62x20"})
    assert resp.status_code == 200

    warnings = [r for r in caplog.records if r.levelno == logging.WARNING]
    assert not any("comfort threshold" in r.getMessage() for r in warnings)


# ---------------------------------------------------------------------------
# Text-block font size / leading (2026-07-31 follow-up) — real QL-800
# hardware feedback on a printed 62x15 label was "the fonts are small with
# large gaps between the lines" (leading scaled off the whole PAGE, font
# size off a coarse height tier, the two uncoupled). Font size is now
# derived from the vertical space four stacked lines actually have on each
# tape, and leading is derived from that font size instead of from
# height_mm directly. These tests measure the real generated PDF bytes —
# draw position and font size pulled out of the content stream via
# `_pdf_text_draws` — rather than trusting that the arithmetic "looks
# right": no line may overlap the next, overflow the label height, or
# exceed the text column width, on ANY of the five tape sizes.
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("size", ["62x15", "62x18", "62x20", "29x90", "17x87"])
def test_text_block_lines_do_not_overlap_or_overflow_the_label(client, accession_holder, size):
    """Ascent/descent-aware check: line N's glyph box (baseline +/- real
    font-metric ascent/descent, via reportlab's own `getAscentDescent` — not
    a guessed ratio) must not intrude into line N-1's box, and the topmost
    line's ascent / bottommost line's descent must both stay inside the
    physical page (0..height_pt)."""
    accession_holder["accession"] = _make_accession(
        accessionCode="PO-BLU-G3-001",
        parents=[ParentRef(vesselNo=4)],
        mediumBatchId="batch-1", createdBy="user-1",  # non-empty line3/operator — an empty Tj draw is silently
        labelledVesselCount=0, quantity=5,             # skipped by reportlab, which would undercount the 5 lines
    )
    resp = client.get("/accessions/acc-1/labels", params={"from": 3, "to": 3, "size": size})
    assert resp.status_code == 200

    draws = _pdf_text_draws(resp.content)
    # 5 draws in this fixture: line1 (suffixed vessel line), line2 (common
    # name + generation), line3 (batch code), line4 date, line4 operator
    # initials (drawRightString — same font/size as the date, shares its Tf).
    assert len(draws) == 5, f"expected 5 text draws, got: {draws}"

    tape = labels_module._tape_dimensions(size)
    height_pt = tape["height_mm"] * PT_PER_MM

    # Group into the 4 STACKED rows (date + operator share row 4) in
    # top-to-bottom order (descending y, matching how they were drawn).
    rows = [draws[0], draws[1], draws[2], draws[3]]  # draws[4] (operator) shares draws[3]'s row
    assert draws[4]["y_pt"] == pytest.approx(draws[3]["y_pt"], abs=0.01)

    font_names = [
        labels_module._LINE1_FONT_NAME,
        labels_module._SUPPORTING_FONT_NAME,
        labels_module._SUPPORTING_FONT_NAME,
        labels_module._SUPPORTING_FONT_NAME,
    ]
    boxes = []  # (top_pt, bottom_pt) per row, in page (bottom-left-origin) coordinates
    for row, font_name in zip(rows, font_names):
        ascent, descent = getAscentDescent(font_name, row["size"])
        top_pt = row["y_pt"] + ascent
        bottom_pt = row["y_pt"] + descent  # descent is negative
        boxes.append((top_pt, bottom_pt))

    # No overflow: topmost row's ascent stays under the page top; bottommost
    # row's descent stays above the page bottom.
    assert boxes[0][0] <= height_pt, f"{size}: line 1 overflows the top of the label ({boxes[0][0]:.2f}pt > {height_pt:.2f}pt)"
    assert boxes[-1][1] >= 0, f"{size}: line 4 overflows the bottom of the label ({boxes[-1][1]:.2f}pt < 0)"

    # No overlap: each row's bottom must sit at or above the next row's top.
    for i in range(len(boxes) - 1):
        assert boxes[i][1] >= boxes[i + 1][0], (
            f"{size}: line {i + 1} (bottom={boxes[i][1]:.2f}pt) overlaps "
            f"line {i + 2} (top={boxes[i + 1][0]:.2f}pt)"
        )


@pytest.mark.parametrize("size", ["62x15", "62x18", "62x20", "29x90", "17x87"])
def test_text_block_lines_do_not_exceed_the_text_column_width(client, accession_holder, size):
    """Every drawn line's rendered width (`stringWidth` against its actual
    font/size, not a guessed character count) must fit within the tape's
    real text column (`text_x`..`right_edge`), recomputed here the same way
    `_draw_label_page` computes it — margin + QR footprint + margin — since
    the QR's physical footprint is always exactly `tape["qr_mm"]` regardless
    of which QR version the payload happens to pick (see
    `compute_qr_geometry`/`_draw_qr`: module_size_mm * total_modules ==
    target_size_mm, always)."""
    accession_holder["accession"] = _make_accession(
        accessionCode="PO-BLU-G3-001",
        parents=[ParentRef(vesselNo=4)],
        mediumBatchId="batch-1", createdBy="user-1",  # non-empty line3/operator — see the sibling overlap test
        labelledVesselCount=0, quantity=5,
    )
    resp = client.get("/accessions/acc-1/labels", params={"from": 3, "to": 3, "size": size})
    assert resp.status_code == 200

    tape = labels_module._tape_dimensions(size)
    margin_mm = labels_module._TEXT_MARGIN_MM
    text_x_mm = margin_mm + tape["qr_mm"] + margin_mm
    text_width_mm = max(tape["width_mm"] - (margin_mm + tape["qr_mm"] + 2 * margin_mm), 5.0)
    right_edge_mm = text_x_mm + text_width_mm
    text_x_pt = text_x_mm * PT_PER_MM
    right_edge_pt = right_edge_mm * PT_PER_MM

    draws = _pdf_text_draws(resp.content)
    assert len(draws) == 5
    font_names = [
        labels_module._LINE1_FONT_NAME,
        labels_module._SUPPORTING_FONT_NAME,
        labels_module._SUPPORTING_FONT_NAME,
        labels_module._SUPPORTING_FONT_NAME,
        labels_module._SUPPORTING_FONT_NAME,
    ]

    for i, (draw, font_name) in enumerate(zip(draws, font_names)):
        width_pt = stringWidth(draw["text"], font_name, draw["size"])
        left_pt = draw["x_pt"]
        right_pt = draw["x_pt"] + width_pt
        assert left_pt >= text_x_pt - 0.5, (
            f"{size}: draw {i} ('{draw['text']}') starts left of the text column "
            f"({left_pt:.2f}pt < {text_x_pt:.2f}pt)"
        )
        assert right_pt <= right_edge_pt + 0.5, (
            f"{size}: draw {i} ('{draw['text']}') overflows the text column width "
            f"({right_pt:.2f}pt > {right_edge_pt:.2f}pt)"
        )


@pytest.mark.parametrize("line_count", [3, 4])
def test_reference_vessel_line_fits_on_every_tape_size(line_count):
    """Spec §6.1's own worst-case example — accession code + ' · #N <- #M'
    — must fit `stringWidth`-wise on every tape size without the suffix
    being dropped, confirming the font-size derivation's width ceiling did
    its job (point C of the 2026-07-31 font-size follow-up). Parametrized
    over both possible ``line_count`` values (label PDF tuning round 2,
    2026-07-31: 3 when the medium-batch-code line is empty and dropped, 4
    when every slot is populated) — the guard must hold either way, since a
    3-line label derives an even larger size1 than a 4-line one."""
    for size in ["62x15", "62x18", "62x20", "29x90", "17x87"]:
        tape = labels_module._tape_dimensions(size)
        margin_mm = labels_module._TEXT_MARGIN_MM
        text_width_mm = max(tape["width_mm"] - (margin_mm + tape["qr_mm"] + 2 * margin_mm), 5.0)
        available_pt = text_width_mm * PT_PER_MM
        size1, _, _, _, _ = labels_module._derive_text_sizes(tape["height_mm"], available_pt, line_count)

        width_pt = stringWidth(labels_module._SIZE1_REFERENCE_LINE, labels_module._LINE1_FONT_NAME, size1)
        assert width_pt <= available_pt, (
            f"{size} (line_count={line_count}): reference line at size1={size1}pt is "
            f"{width_pt:.2f}pt, wider than the {available_pt:.2f}pt text column"
        )


# ---------------------------------------------------------------------------
# Blank-line collapse (label PDF tuning round 2, 2026-07-31) — real hardware
# feedback on a printed 62x15 label: "there is still a large space between
# the date and the species". Root cause: the medium-batch-code line (line 3)
# is empty for most real accessions (including the live reference accession
# PO-BLU-G3-001, which has no medium batch), yet the layout used to reserve
# its full line-box height regardless, leaving a visible gap between line 2
# (species) and line 4 (date). Fixed by building the drawn-line list from
# only the lines with actual content FIRST, then sizing against
# `len(lines)` rather than a hardcoded 4 — see `_draw_label_page` /
# `_derive_text_sizes`.
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("size", ["62x15", "62x18", "62x20", "29x90", "17x87"])
def test_blank_medium_line_is_dropped_not_reserved(client, accession_holder, size):
    """No medium batch recorded (the common case, matching the live
    accession PO-BLU-G3-001) -> only 3 stacked rows are drawn (vessel,
    common name, date+operator) — 4 `Tj` draws total (date + operator share
    one row). The freed vertical space must go into a bigger line_gap, not
    sit empty: the gap between the species line and the date line must equal
    exactly ONE line-box (`line_gap_mm` derived for `line_count=3`), not two
    — which is what a still-reserved blank line 3 would look like."""
    accession_holder["accession"] = _make_accession(
        accessionCode="PO-BLU-G3-001",
        mediumBatchId=None, createdBy=None,
        labelledVesselCount=0, quantity=1,
    )
    resp = client.get("/accessions/acc-1/labels", params={"from": 1, "to": 1, "size": size})
    assert resp.status_code == 200

    draws = _pdf_text_draws(resp.content)
    # vessel, common name, date, operator (drawRightString shares the date
    # row's Tf/Tm-Tj pair count as its own Tj) = 4 draws, not 5 — the
    # batch-code line's Tj never happens at all (not even an empty one).
    assert len(draws) == 4, f"{size}: expected 4 text draws (batch line dropped), got: {draws}"
    assert draws[3]["y_pt"] == pytest.approx(draws[3]["y_pt"], abs=0.01)  # date/operator share one row (sanity)

    tape = labels_module._tape_dimensions(size)
    margin_mm = labels_module._TEXT_MARGIN_MM
    text_width_mm = max(tape["width_mm"] - (margin_mm + tape["qr_mm"] + 2 * margin_mm), 5.0)
    available_pt = text_width_mm * PT_PER_MM
    _, _, _, _, line_gap_mm = labels_module._derive_text_sizes(tape["height_mm"], available_pt, line_count=3)
    expected_gap_pt = line_gap_mm * PT_PER_MM

    # draws[0]=vessel line, draws[1]=common name, draws[2]=date row. The gap
    # between the species line (draws[1]) and the date row (draws[2]) must be
    # ONE line-box, proving the empty batch-code line was never given its
    # own reserved slot in between.
    gap_pt = draws[1]["y_pt"] - draws[2]["y_pt"]
    assert gap_pt == pytest.approx(expected_gap_pt, abs=0.05), (
        f"{size}: gap between the species line and the date line is "
        f"{gap_pt:.2f}pt, expected {expected_gap_pt:.2f}pt (one line-box) — "
        f"looks like the empty batch-code line is still being reserved"
    )


@pytest.mark.parametrize("size", ["62x15", "62x18", "62x20", "29x90", "17x87"])
def test_populated_medium_line_keeps_all_four_rows(client, accession_holder, size):
    """Sanity check paired with the test above: when the batch-code line
    DOES have content, all 4 rows are still drawn (5 `Tj`s, date + operator
    sharing a row) — the collapse is conditional on emptiness, not a general
    reduction to 3 lines."""
    accession_holder["accession"] = _make_accession(
        accessionCode="PO-BLU-G3-001",
        mediumBatchId="batch-1", createdBy="user-1",
        labelledVesselCount=0, quantity=1,
    )
    resp = client.get("/accessions/acc-1/labels", params={"from": 1, "to": 1, "size": size})
    assert resp.status_code == 200
    draws = _pdf_text_draws(resp.content)
    assert len(draws) == 5, f"{size}: expected 5 text draws (all 4 rows populated), got: {draws}"


# ---------------------------------------------------------------------------
# QR-to-edge clearance (label PDF tuning round 2, 2026-07-31) — hard
# constraint from the task spec: raising `_QR_HEIGHT_FRACTION` must still
# leave >= ~0.4mm clear between the QR's top/bottom edge and the label's
# printable-area edge on every tape (`(height_mm - qr_size_mm) / 2`, since
# `_draw_label_page` centers the QR vertically). A QR clipped at the edge
# does not decode at all — thermal feed has registration tolerance, so this
# is not optional headroom.
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("size", ["62x15", "62x18", "62x20", "29x90", "17x87"])
def test_qr_vertical_clearance_stays_above_the_0_4mm_floor(size):
    tape = labels_module._tape_dimensions(size)
    clearance_mm = (tape["height_mm"] - tape["qr_mm"]) / 2
    assert clearance_mm >= 0.4, (
        f"{size}: QR-to-edge clearance is {clearance_mm:.3f}mm, below the "
        f"0.4mm floor (_QR_HEIGHT_FRACTION={labels_module._QR_HEIGHT_FRACTION})"
    )


def test_qr_vertical_clearance_matches_round_2_landed_values():
    """Pins the actual clearance figures landed on for `_QR_HEIGHT_FRACTION
    = 0.93` (reported in the backlog entry and spec §6.2), so a future
    accidental change to the fraction fails loudly here instead of silently
    eroding the margin toward the 0.4mm floor asserted by the sibling test."""
    expected_clearance_mm = {
        "17x87": 0.489,  # tightest tape — the one the 0.4mm floor was chosen against
        "62x15": 0.525,
        "62x18": 0.631,
        "62x20": 0.699,
        "29x90": 0.907,
    }
    for size, expected in expected_clearance_mm.items():
        tape = labels_module._tape_dimensions(size)
        clearance_mm = (tape["height_mm"] - tape["qr_mm"]) / 2
        assert clearance_mm == pytest.approx(expected, abs=0.01), (
            f"{size}: clearance {clearance_mm:.3f}mm, expected ~{expected}mm"
        )


# ---------------------------------------------------------------------------
# Brand-mark placement (label PDF tuning round 4, 2026-07-31) — round 3's
# ONLY placement was below the last text line, which only ever had spare
# room on width-ceiling-bound tapes' 3-line layout (62x18/62x20/29x90) —
# NEVER on any tape's 4-line layout, which is exactly what the user's real
# production accession (HE-LMUS-G1-001, has a `mediumBatchId`) always
# renders. Round 4 adds a second placement — horizontal slack at the right
# edge of the text column, vertically between line 1's own ink and the last
# line's own ink — tried as a fallback when the below-placement doesn't fit.
#
# These tests measure the ACTUAL image XObject placement pulled out of the
# real PDF bytes (reportlab's `drawImage` emits
# ``<sx> 0 0 <sy> <tx> <ty> cm`` immediately followed by ``/<name> Do`` —
# confirmed by hand against a real round-4 PDF before writing this regex),
# not assumed geometry — the same "read the real content stream, don't
# trust the arithmetic" approach `_pdf_text_draws` already uses for text.
# ---------------------------------------------------------------------------

_PDF_IMAGE_CM_DO_RE = re.compile(rb"([\d.]+) 0 0 ([\d.]+) ([\d.]+) ([\d.]+) cm\s*/\S+ Do")


def _pdf_image_draws(pdf_bytes: bytes) -> list[dict]:
    """Every image/form-XObject placement across every content stream, as
    ``{"x_pt", "y_pt", "width_pt", "height_pt"}`` (bottom-left origin, same
    as every other coordinate in this file) — the brand mark is the only
    image ever drawn on a label page, so any draw found here IS the mark."""
    draws = []
    for stream in _pdf_content_streams(pdf_bytes):
        for m in _PDF_IMAGE_CM_DO_RE.finditer(stream):
            sx, sy, tx, ty = (float(g) for g in m.groups())
            draws.append({"x_pt": tx, "y_pt": ty, "width_pt": sx, "height_pt": sy})
    return draws


# Matches the actual measured/verified behaviour (see the module comment
# above `_maybe_draw_brand_mark` in labels.py): 62x15 and 17x87 at 3 lines
# are the one disclosed edge case where NEITHER placement has enough spare
# room; every other tape/line-count combination — crucially including EVERY
# tape's 4-line layout, the case that was broken — gets a mark.
_BRAND_MARK_EXPECTED = {
    ("62x15", 3): False,
    ("62x15", 4): True,
    ("62x18", 3): True,
    ("62x18", 4): True,
    ("62x20", 3): True,
    ("62x20", 4): True,
    ("29x90", 3): True,
    ("29x90", 4): True,
    ("17x87", 3): False,
    ("17x87", 4): True,
}


@pytest.mark.parametrize("size,line_count", list(_BRAND_MARK_EXPECTED))
def test_brand_mark_draws_exactly_where_expected(client, accession_holder, size, line_count):
    """Pins which tape/line-count combinations get a mark at all — proving
    the reported bug is fixed (the mark now draws on the common 4-line case,
    on every tape) without silently regressing which 3-line cases already
    worked (round 3: 62x18/62x20/29x90 yes, 62x15/17x87 no, unchanged)."""
    accession_holder["accession"] = _make_accession(
        accessionCode="PO-BLU-G3-001",
        mediumBatchId="batch-1" if line_count == 4 else None,
        createdBy="user-1",
        labelledVesselCount=0, quantity=1,
    )
    resp = client.get("/accessions/acc-1/labels", params={"from": 1, "to": 1, "size": size})
    assert resp.status_code == 200

    image_draws = _pdf_image_draws(resp.content)
    expected = _BRAND_MARK_EXPECTED[(size, line_count)]
    if expected:
        assert len(image_draws) == 1, (
            f"{size} lc={line_count}: expected exactly one brand-mark image, got {image_draws}"
        )
    else:
        assert image_draws == [], (
            f"{size} lc={line_count}: expected no brand mark (disclosed edge case), got {image_draws}"
        )


@pytest.mark.parametrize("size,line_count", list(_BRAND_MARK_EXPECTED))
def test_brand_mark_never_overlaps_text_or_exceeds_page_bounds(client, accession_holder, size, line_count):
    """Whenever the mark draws (see the pinned table above), its rectangle
    must (a) stay fully inside the physical page and (b) never intersect any
    text draw's real glyph box — ascent/descent via reportlab's own
    `getAscentDescent`, width via `stringWidth` against the actual text/
    font/size that was actually drawn, not a guess."""
    accession_holder["accession"] = _make_accession(
        accessionCode="PO-BLU-G3-001",
        mediumBatchId="batch-1" if line_count == 4 else None,
        createdBy="user-1",
        labelledVesselCount=0, quantity=1,
    )
    resp = client.get("/accessions/acc-1/labels", params={"from": 1, "to": 1, "size": size})
    assert resp.status_code == 200

    image_draws = _pdf_image_draws(resp.content)
    if not image_draws:
        return  # disclosed edge case (62x15/17x87 at 3 lines) — nothing to check

    assert len(image_draws) == 1
    mark = image_draws[0]

    tape = labels_module._tape_dimensions(size)
    width_pt = tape["width_mm"] * PT_PER_MM
    height_pt = tape["height_mm"] * PT_PER_MM

    assert mark["x_pt"] >= -0.01, f"{size} lc={line_count}: mark starts left of the page ({mark})"
    assert mark["y_pt"] >= -0.01, f"{size} lc={line_count}: mark starts below the page ({mark})"
    assert mark["x_pt"] + mark["width_pt"] <= width_pt + 0.01, (
        f"{size} lc={line_count}: mark overflows the page width ({mark}, page width {width_pt:.2f}pt)"
    )
    assert mark["y_pt"] + mark["height_pt"] <= height_pt + 0.01, (
        f"{size} lc={line_count}: mark overflows the page height ({mark}, page height {height_pt:.2f}pt)"
    )

    mark_left, mark_right = mark["x_pt"], mark["x_pt"] + mark["width_pt"]
    mark_bottom, mark_top = mark["y_pt"], mark["y_pt"] + mark["height_pt"]

    draws = _pdf_text_draws(resp.content)
    assert draws, f"{size} lc={line_count}: expected at least one text draw"
    for i, draw in enumerate(draws):
        # draws[0] is always line 1 (Space Mono Bold); every subsequent draw
        # is a supporting-role line (Hanken Grotesk) — same convention the
        # existing overlap/width tests above already use.
        font_name = labels_module._LINE1_FONT_NAME if i == 0 else labels_module._SUPPORTING_FONT_NAME
        ascent, descent = getAscentDescent(font_name, draw["size"])
        text_left = draw["x_pt"]
        text_right = draw["x_pt"] + stringWidth(draw["text"], font_name, draw["size"])
        text_bottom = draw["y_pt"] + descent  # descent negative
        text_top = draw["y_pt"] + ascent

        overlaps = (
            mark_left < text_right and mark_right > text_left
            and mark_bottom < text_top and mark_top > text_bottom
        )
        assert not overlaps, (
            f"{size} lc={line_count}: brand mark {mark} overlaps text draw {i} "
            f"('{draw['text']}') at glyph box "
            f"(left={text_left:.2f}, right={text_right:.2f}, "
            f"bottom={text_bottom:.2f}, top={text_top:.2f})"
        )


# ---------------------------------------------------------------------------
# PUBLIC_BASE_URL guard (config-identity follow-up) — a deployment must never
# silently print QR codes that are unscannable (empty) or that could not
# possibly resolve off this machine (loopback/localhost). Deliberately NOT
# validated at app boot (see _require_public_base_url's own docstring): an
# ops-only deployment that never prints genetics labels must not be blocked
# from starting by a genetics-only setting — the failure must surface at the
# point of use instead.
# ---------------------------------------------------------------------------

def test_require_public_base_url_rejects_empty_string():
    with pytest.raises(HTTPException) as exc_info:
        labels_module._require_public_base_url("")
    assert exc_info.value.status_code == 500
    assert "PUBLIC_BASE_URL" in exc_info.value.detail


@pytest.mark.parametrize(
    "bad_url",
    [
        "http://localhost",
        "http://localhost:8000",
        "https://127.0.0.1",
        "http://0.0.0.0:8000",
        "http://[::1]:8000",
    ],
)
def test_require_public_base_url_rejects_loopback_hosts(bad_url):
    with pytest.raises(HTTPException) as exc_info:
        labels_module._require_public_base_url(bad_url)
    assert exc_info.value.status_code == 500
    assert "PUBLIC_BASE_URL" in exc_info.value.detail
    assert "loopback" in exc_info.value.detail.lower()


def test_require_public_base_url_accepts_a_normal_https_host():
    # Returns the value unchanged — build_label_payload still owns the
    # scheme/host formatting, this guard only vetoes the unusable cases.
    result = labels_module._require_public_base_url("https://dev.a20core.com")
    assert result == "https://dev.a20core.com"


def test_get_labels_500s_when_public_base_url_is_empty(client, accession_holder, monkeypatch):
    monkeypatch.setattr(labels_module.settings, "PUBLIC_BASE_URL", "")
    resp = client.get("/accessions/acc-1/labels", params={"from": 1, "to": 1})
    assert resp.status_code == 500
    assert "PUBLIC_BASE_URL" in resp.json()["detail"]


def test_get_labels_500s_when_public_base_url_is_loopback(client, accession_holder, monkeypatch):
    monkeypatch.setattr(labels_module.settings, "PUBLIC_BASE_URL", "http://localhost:8000")
    resp = client.get("/accessions/acc-1/labels", params={"from": 1, "to": 1})
    assert resp.status_code == 500
    assert "loopback" in resp.json()["detail"].lower()


def test_get_labels_succeeds_with_a_normal_public_base_url(client, accession_holder, monkeypatch):
    # Same value this box's real .env sets today (dev.a20core.com) — this is
    # also the regression guard that the guard is a no-op for a correctly
    # configured deployment.
    monkeypatch.setattr(labels_module.settings, "PUBLIC_BASE_URL", "https://dev.a20core.com")
    resp = client.get("/accessions/acc-1/labels", params={"from": 1, "to": 1})
    assert resp.status_code == 200
    assert _pdf_page_count(resp.content) == 1


def test_build_label_payload_direct_calls_are_unaffected_by_the_guard():
    """Every other test in this file calls build_label_payload directly with
    a bare hostname string (e.g. "dev.a20core.com"), never through
    settings.PUBLIC_BASE_URL. The guard lives in get_labels(), not in
    build_label_payload() itself, so those calls — including ones that would
    fail the guard's own rules, like a bare non-URL string — must keep
    working exactly as before."""
    payload = labels_module.build_label_payload("dev.a20core.com", "K7M2Q9XR4T", 7, uppercase=False)
    assert payload == "dev.a20core.com/i/K7M2Q9XR4T/7"
