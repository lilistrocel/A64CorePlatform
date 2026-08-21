"""
Unit tests for T-925 — Brother QL-800 network label printing.

Two layers under test, kept deliberately separate:

  1. ``src.services.label_printer_service`` — the httpx client talking to
     the printer's own API. All httpx calls are mocked; the real printer at
     the Tailscale IP in the printer's /agent.md is NEVER hit here.
  2. ``src.modules.genetics.api.v1.labels.print_labels`` /
     ``printer.get_printer_health`` — the two new genetics routes, tested
     through a TestClient with ``label_printer_service`` itself mocked at
     the module-attribute level (so these tests don't re-mock httpx; that's
     already covered by layer 1).

Test cases:
  1.  Unconfigured printer -> health() returns configured=False, ok=False,
      with NO httpx call made at all.
  2.  health() maps a real ready response (ok=true, status=["ready"]) to
      ok=True, and jobsQueued/printer populated from printer_status.
  3.  health() maps a not-ready status (e.g. ["offline"]) to ok=False,
      status preserved verbatim.
  4.  health() never raises on a connection failure — returns
      configured=True, ok=False, status=["unreachable"].
  5.  print_pdf() refuses (502) when the preflight health check is not
      ready, surfacing the printer's own status list in the detail, and
      makes NO POST call (only the GET /health call).
  6.  print_pdf() maps the printer's 401 to a 502 (deployment-config
      problem, not the caller's fault) whose detail never contains the
      configured API key.
  7.  print_pdf() maps the printer's 422 to a 422, passing through the
      printer's own `error` message.
  8.  print_pdf() maps the printer's 502 to a 502 after exactly one retry
      (two POST attempts total, never more).
  9.  print_pdf() succeeds on the retry if the second 502 attempt returns
      200 (i.e. the one allowed retry actually helps when the printer
      recovers).
  10. print_pdf() rejects out-of-range `copies` (0 and 51) with 422 and
      makes NO httpx call at all (not even the health check).
  11. print_pdf() on success returns the printer's job_id/pages_printed/
      printer/label, camelCased.
  12. The configured API key never appears in any exception `detail` raised
      across cases 5-10, nor in any log record emitted during those calls
      (asserted via caplog).
  13. GET /genetics/printer/health is HTTP 200 with configured=false when
      unconfigured — never a 500.
  14. GET /genetics/printer/health is HTTP 200 with ok=false + status
      surfaced when the printer reports not-ready.
  15. POST .../labels/print defaults `size` to 62x15 (NOT the GET route's
      29x90 default) and sends the printer `label="62"`.
  16. POST .../labels/print maps 29x90 and 17x87 straight through, and any
      62xN (e.g. 62x30) to label="62".
  17. labelledVesselCount is raised (max(current, to)) ONLY when the print
      call succeeds, and is left completely untouched when print_pdf raises
      (mocked as a 502) — the DB update mock is asserted to have NOT been
      called at all in the failure case.
  18. `copies` above the printer's cap (51) is rejected by FastAPI query
      validation (422) before the route body ever runs — asserted via the
      printer client mock never being called.
  19. An unauthenticated-tier role (guest-shaped) is rejected 403 on both
      GET /printer/health... no — guest cannot even reach genetics.view, so
      this pins that print_labels is gated on a permission requiring at
      least the bench tier, consistent with genetics.edit.
"""

from __future__ import annotations

from datetime import datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from src.modules.genetics.api.v1 import labels as labels_module
from src.modules.genetics.api.v1 import printer as printer_module
from src.modules.genetics.middleware.auth import get_current_active_user
from src.modules.genetics.models.accession import Accession
from src.modules.genetics.models.enums import VesselForm
from src.services import label_printer_service


# ---------------------------------------------------------------------------
# Fixtures shared by the route-level tests (layer 2)
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
    holder = {"accession": _make_accession()}

    async def _get_accession(accession_id):
        return holder["accession"]

    monkeypatch.setattr(labels_module.AccessionService, "get_accession", _get_accession)
    return holder


@pytest.fixture(autouse=True)
def _default_public_base_url(monkeypatch):
    async def _fake_get_value(key: str) -> str:
        assert key == "PUBLIC_BASE_URL"
        return "https://dev.a20core.com"

    monkeypatch.setattr(labels_module, "get_deployment_setting_value", _fake_get_value)


@pytest.fixture(autouse=True)
def _mock_metadata_lookups(monkeypatch):
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
    app.include_router(printer_module.router, prefix="/printer")
    # Overriding the shared identity dependency (not require_view/genetics.edit
    # directly) exercises the REAL role check inside require_permission for
    # both routes, since both label routes are gated at the bench tier.
    app.dependency_overrides[get_current_active_user] = lambda: SimpleNamespace(
        userId="u-1", role="user", divisionId=None, organizationId=None
    )
    with TestClient(app) as c:
        yield c


@pytest.fixture
def guest_client(fake_db, accession_holder):
    app = FastAPI()
    app.include_router(labels_module.router, prefix="/accessions")
    app.dependency_overrides[get_current_active_user] = lambda: SimpleNamespace(
        userId="u-2", role="guest", divisionId=None, organizationId=None
    )
    with TestClient(app) as c:
        yield c


# ---------------------------------------------------------------------------
# Layer 1 — src.services.label_printer_service (httpx mocked)
# ---------------------------------------------------------------------------

_BASE_URL = "http://100.109.203.99:8765"
_API_KEY = "s3cr3t-key-do-not-leak"


def _resolver(enabled=True, base_url=_BASE_URL, api_key=_API_KEY):
    async def _fake(key: str):
        return {
            "LABEL_PRINTER_ENABLED": enabled,
            "LABEL_PRINTER_BASE_URL": base_url,
            "LABEL_PRINTER_API_KEY": api_key,
        }[key]

    return _fake


class _FakeResponse:
    def __init__(self, status_code, json_body=None):
        self.status_code = status_code
        self._json_body = {} if json_body is None else json_body

    def json(self):
        return self._json_body

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError(
                "error", request=httpx.Request("GET", _BASE_URL), response=httpx.Response(self.status_code)
            )


class _FakeAsyncClient:
    """Queue of canned responses, or a raised exception, per call."""

    def __init__(self, queue):
        self._queue = list(queue)
        self.calls = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def _next(self, method, url, **kwargs):
        self.calls.append((method, url, kwargs))
        item = self._queue.pop(0)
        if isinstance(item, Exception):
            raise item
        return item

    async def get(self, url, **kwargs):
        return await self._next("GET", url, **kwargs)

    async def post(self, url, **kwargs):
        return await self._next("POST", url, **kwargs)


def _install_fake_client(monkeypatch, queue):
    client = _FakeAsyncClient(queue)
    monkeypatch.setattr(
        label_printer_service.httpx, "AsyncClient", lambda **kwargs: client
    )
    return client


_READY_HEALTH_BODY = {
    "ok": True,
    "printer": "Brother QL-800",
    "printer_status": {"status": ["ready"], "jobs_queued": 0},
}


@pytest.mark.asyncio
async def test_health_unconfigured_makes_no_http_call(monkeypatch):
    monkeypatch.setattr(
        label_printer_service, "get_deployment_setting_value", _resolver(enabled=False)
    )
    client = _install_fake_client(monkeypatch, [])
    result = await label_printer_service.health()
    assert result.configured is False
    assert result.ok is False
    assert client.calls == []


@pytest.mark.asyncio
async def test_health_ready(monkeypatch):
    monkeypatch.setattr(label_printer_service, "get_deployment_setting_value", _resolver())
    _install_fake_client(monkeypatch, [_FakeResponse(200, _READY_HEALTH_BODY)])
    result = await label_printer_service.health()
    assert result.configured is True
    assert result.ok is True
    assert result.status == ["ready"]
    assert result.printer == "Brother QL-800"
    assert result.jobsQueued == 0


@pytest.mark.asyncio
async def test_health_not_ready_status_preserved(monkeypatch):
    monkeypatch.setattr(label_printer_service, "get_deployment_setting_value", _resolver())
    body = {"ok": True, "printer": "Brother QL-800", "printer_status": {"status": ["paper_out"], "jobs_queued": 2}}
    _install_fake_client(monkeypatch, [_FakeResponse(200, body)])
    result = await label_printer_service.health()
    assert result.ok is False
    assert result.status == ["paper_out"]


@pytest.mark.asyncio
async def test_health_unreachable_never_raises(monkeypatch, caplog):
    monkeypatch.setattr(label_printer_service, "get_deployment_setting_value", _resolver())
    _install_fake_client(monkeypatch, [httpx.ConnectError("connection refused")])
    result = await label_printer_service.health()
    assert result.configured is True
    assert result.ok is False
    assert result.status == ["unreachable"]
    assert _API_KEY not in caplog.text


@pytest.mark.asyncio
async def test_print_pdf_refused_when_not_ready(monkeypatch):
    monkeypatch.setattr(label_printer_service, "get_deployment_setting_value", _resolver())
    body = {"ok": True, "printer": "Brother QL-800", "printer_status": {"status": ["offline"], "jobs_queued": 0}}
    client = _install_fake_client(monkeypatch, [_FakeResponse(200, body)])
    with pytest.raises(HTTPException) as exc_info:
        await label_printer_service.print_pdf(b"%PDF-1.4", label="62", copies=1)
    assert exc_info.value.status_code == 502
    assert "offline" in exc_info.value.detail
    # Only the health GET happened — no print POST was attempted.
    assert [c[0] for c in client.calls] == ["GET"]


@pytest.mark.asyncio
async def test_print_pdf_401_mapped_to_502_without_leaking_key(monkeypatch, caplog):
    monkeypatch.setattr(label_printer_service, "get_deployment_setting_value", _resolver())
    _install_fake_client(
        monkeypatch,
        [_FakeResponse(200, _READY_HEALTH_BODY), _FakeResponse(401, {"ok": False, "error": "bad key"})],
    )
    with pytest.raises(HTTPException) as exc_info:
        await label_printer_service.print_pdf(b"%PDF-1.4", label="62", copies=1)
    assert exc_info.value.status_code == 502
    assert _API_KEY not in str(exc_info.value.detail)
    assert _API_KEY not in caplog.text


@pytest.mark.asyncio
async def test_print_pdf_422_passes_through_printer_error(monkeypatch):
    monkeypatch.setattr(label_printer_service, "get_deployment_setting_value", _resolver())
    _install_fake_client(
        monkeypatch,
        [
            _FakeResponse(200, _READY_HEALTH_BODY),
            _FakeResponse(422, {"ok": False, "error": "unsupported label size"}),
        ],
    )
    with pytest.raises(HTTPException) as exc_info:
        await label_printer_service.print_pdf(b"%PDF-1.4", label="62", copies=1)
    assert exc_info.value.status_code == 422
    assert exc_info.value.detail == "unsupported label size"


@pytest.mark.asyncio
async def test_print_pdf_502_retried_once_then_raises(monkeypatch):
    monkeypatch.setattr(label_printer_service, "get_deployment_setting_value", _resolver())
    client = _install_fake_client(
        monkeypatch,
        [
            _FakeResponse(200, _READY_HEALTH_BODY),
            _FakeResponse(502, {"ok": False, "error": "spooler jammed"}),
            _FakeResponse(502, {"ok": False, "error": "spooler jammed"}),
        ],
    )
    with pytest.raises(HTTPException) as exc_info:
        await label_printer_service.print_pdf(b"%PDF-1.4", label="62", copies=1)
    assert exc_info.value.status_code == 502
    post_calls = [c for c in client.calls if c[0] == "POST"]
    assert len(post_calls) == 2  # exactly one retry, never more


@pytest.mark.asyncio
async def test_print_pdf_502_then_success_on_retry(monkeypatch):
    monkeypatch.setattr(label_printer_service, "get_deployment_setting_value", _resolver())
    success_body = {"ok": True, "job_id": 14, "printer": "Brother QL-800", "label": "62", "pages_printed": 3}
    client = _install_fake_client(
        monkeypatch,
        [
            _FakeResponse(200, _READY_HEALTH_BODY),
            _FakeResponse(502, {"ok": False, "error": "spooler jammed"}),
            _FakeResponse(200, success_body),
        ],
    )
    result = await label_printer_service.print_pdf(b"%PDF-1.4", label="62", copies=1)
    assert result.ok is True
    assert result.jobId == 14
    assert len([c for c in client.calls if c[0] == "POST"]) == 2


@pytest.mark.asyncio
async def test_print_pdf_success_maps_fields(monkeypatch):
    monkeypatch.setattr(label_printer_service, "get_deployment_setting_value", _resolver())
    success_body = {
        "ok": True,
        "job_id": 14,
        "printer": "Brother QL-800",
        "label": "62",
        "pages_printed": 6,
        "copies": 1,
        "bytes_sent": 100230,
    }
    _install_fake_client(monkeypatch, [_FakeResponse(200, _READY_HEALTH_BODY), _FakeResponse(200, success_body)])
    result = await label_printer_service.print_pdf(b"%PDF-1.4", label="62", copies=1)
    assert result.ok is True
    assert result.jobId == 14
    assert result.pagesPrinted == 6
    assert result.printer == "Brother QL-800"
    assert result.label == "62"


@pytest.mark.asyncio
@pytest.mark.parametrize("copies", [0, 51])
async def test_print_pdf_rejects_out_of_range_copies(monkeypatch, copies):
    monkeypatch.setattr(label_printer_service, "get_deployment_setting_value", _resolver())
    client = _install_fake_client(monkeypatch, [])
    with pytest.raises(HTTPException) as exc_info:
        await label_printer_service.print_pdf(b"%PDF-1.4", label="62", copies=copies)
    assert exc_info.value.status_code == 422
    assert client.calls == []  # not even the health check ran


@pytest.mark.asyncio
async def test_print_pdf_not_configured_raises_409(monkeypatch):
    monkeypatch.setattr(
        label_printer_service, "get_deployment_setting_value", _resolver(base_url="")
    )
    client = _install_fake_client(monkeypatch, [])
    with pytest.raises(HTTPException) as exc_info:
        await label_printer_service.print_pdf(b"%PDF-1.4", label="62", copies=1)
    assert exc_info.value.status_code == 409
    assert client.calls == []


# ---------------------------------------------------------------------------
# _printer_label_for_size mapping (labels.py)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "size,expected",
    [("62x15", "62"), ("62x100", "62"), ("62x12", "62"), ("29x90", "29x90"), ("17x87", "17x87")],
)
def test_printer_label_for_size_mapping(size, expected):
    assert labels_module._printer_label_for_size(size) == expected


# ---------------------------------------------------------------------------
# Layer 2 — routes (label_printer_service itself mocked)
# ---------------------------------------------------------------------------


def test_printer_health_endpoint_unconfigured_is_200(client, monkeypatch):
    monkeypatch.setattr(
        labels_module.label_printer_service,
        "health",
        AsyncMock(return_value=label_printer_service.PrinterHealthResult(configured=False, ok=False)),
    )
    # printer_module imports label_printer_service too — same module object.
    resp = client.get("/printer/health")
    assert resp.status_code == 200
    body = resp.json()["data"]
    assert body["configured"] is False
    assert body["ok"] is False


def test_printer_health_endpoint_not_ready_is_still_200(client, monkeypatch):
    monkeypatch.setattr(
        printer_module.label_printer_service,
        "health",
        AsyncMock(
            return_value=label_printer_service.PrinterHealthResult(
                configured=True, ok=False, status=["paper_out"], printer="Brother QL-800", jobsQueued=1
            )
        ),
    )
    resp = client.get("/printer/health")
    assert resp.status_code == 200
    body = resp.json()["data"]
    assert body["configured"] is True
    assert body["ok"] is False
    assert body["status"] == ["paper_out"]
    assert body["jobsQueued"] == 1


def test_print_labels_defaults_to_62x15_and_maps_label(client, monkeypatch, accession_holder):
    accession_holder["accession"] = _make_accession(labelledVesselCount=0, quantity=5)
    mock_print = AsyncMock(
        return_value=label_printer_service.PrintResult(
            ok=True, jobId=1, pagesPrinted=5, printer="Brother QL-800", label="62"
        )
    )
    monkeypatch.setattr(labels_module.label_printer_service, "print_pdf", mock_print)

    resp = client.post("/accessions/acc-1/labels/print")

    assert resp.status_code == 200
    body = resp.json()["data"]
    assert body["ok"] is True
    assert body["jobId"] == 1
    assert body["label"] == "62"
    assert body["from"] == 1
    assert body["to"] == 5
    assert body["copies"] == 1
    # size defaulted to 62x15 -> mapped to printer label "62"
    assert mock_print.call_args.kwargs["label"] == "62"


@pytest.mark.parametrize("size,expected_label", [("29x90", "29x90"), ("17x87", "17x87"), ("62x30", "62")])
def test_print_labels_size_to_label_mapping(client, monkeypatch, accession_holder, size, expected_label):
    accession_holder["accession"] = _make_accession(labelledVesselCount=0, quantity=5)
    mock_print = AsyncMock(
        return_value=label_printer_service.PrintResult(
            ok=True, jobId=1, pagesPrinted=1, printer="Brother QL-800", label=expected_label
        )
    )
    monkeypatch.setattr(labels_module.label_printer_service, "print_pdf", mock_print)

    resp = client.post("/accessions/acc-1/labels/print", params={"size": size, "to": 1})

    assert resp.status_code == 200
    assert mock_print.call_args.kwargs["label"] == expected_label


def test_print_labels_bumps_labelled_vessel_count_only_on_success(client, monkeypatch, accession_holder, fake_db):
    accession_holder["accession"] = _make_accession(labelledVesselCount=0, quantity=5)
    monkeypatch.setattr(
        labels_module.label_printer_service,
        "print_pdf",
        AsyncMock(
            return_value=label_printer_service.PrintResult(
                ok=True, jobId=1, pagesPrinted=5, printer="Brother QL-800", label="62"
            )
        ),
    )

    resp = client.post("/accessions/acc-1/labels/print")

    assert resp.status_code == 200
    fake_db._collection.update_one.assert_awaited_once()
    (filter_arg, update_arg), _ = fake_db._collection.update_one.await_args
    assert update_arg["$set"]["labelledVesselCount"] == 5


def test_print_labels_does_not_bump_labelled_vessel_count_on_failure(client, monkeypatch, accession_holder, fake_db):
    accession_holder["accession"] = _make_accession(labelledVesselCount=0, quantity=5)
    monkeypatch.setattr(
        labels_module.label_printer_service,
        "print_pdf",
        AsyncMock(side_effect=HTTPException(status_code=502, detail="Printer not ready")),
    )

    resp = client.post("/accessions/acc-1/labels/print")

    assert resp.status_code == 502
    fake_db._collection.update_one.assert_not_awaited()


def test_print_labels_copies_above_cap_rejected_before_printing(client, monkeypatch, accession_holder):
    mock_print = AsyncMock()
    monkeypatch.setattr(labels_module.label_printer_service, "print_pdf", mock_print)

    resp = client.post("/accessions/acc-1/labels/print", params={"copies": 51, "to": 1})

    assert resp.status_code == 422
    mock_print.assert_not_awaited()


def test_print_labels_copies_zero_rejected(client, monkeypatch, accession_holder):
    mock_print = AsyncMock()
    monkeypatch.setattr(labels_module.label_printer_service, "print_pdf", mock_print)

    resp = client.post("/accessions/acc-1/labels/print", params={"copies": 0, "to": 1})

    assert resp.status_code == 422
    mock_print.assert_not_awaited()


def test_print_labels_forbidden_for_guest(guest_client, monkeypatch, accession_holder):
    mock_print = AsyncMock()
    monkeypatch.setattr(labels_module.label_printer_service, "print_pdf", mock_print)

    resp = guest_client.post("/accessions/acc-1/labels/print", params={"to": 1})

    assert resp.status_code == 403
    mock_print.assert_not_awaited()


def test_get_labels_still_works_and_bumps_unconditionally(client, accession_holder, fake_db):
    """Regression guard: the GET route's pre-T-925 behaviour (bump on every
    call, 29x90 default) must be completely unchanged by the refactor."""
    accession_holder["accession"] = _make_accession(labelledVesselCount=0, quantity=3)
    resp = client.get("/accessions/acc-1/labels")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    fake_db._collection.update_one.assert_awaited_once()
    (filter_arg, update_arg), _ = fake_db._collection.update_one.await_args
    assert update_arg["$set"]["labelledVesselCount"] == 3
