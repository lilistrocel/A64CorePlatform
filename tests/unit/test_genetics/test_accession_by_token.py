"""
Unit tests for T-806 part 1 — the AUTHENTICATED label-token resolution route
(``GET /api/v1/genetics/accessions/by-token/{token}``).

Why this route exists: scanning a label opens the public info page
(``public.py``), which is deliberately auth-free and deliberately exposes no
internal UUIDs. To let a logged-in user act on what they just scanned ("this
plate is contaminated"), the app needs to turn ``{token, vesselNo}`` into an
accession id — and that resolution must happen behind auth, so the public
page never learns the UUID.

This route reuses ``public._load_accession_by_token`` (case-insensitive,
uppercase-normalised, plain-equality lookup — NOT a regex, so the unique
index on ``publicToken`` is used) and ``vessel_resolver.resolve_vessel``
verbatim rather than reimplementing either. Both live behind the shared
``genetics_db`` singleton, so a single fake-database monkeypatch on
``public_module.genetics_db`` covers both collaborators regardless of which
module's namespace actually calls ``get_database()``.

No live database — same generic Motor-collection-shaped fake used by
``test_public_route.py`` and ``test_vessel_resolver.py`` (no mongomock in
requirements.txt).

Test cases:
  - resolves a known token, uppercase and lowercase
  - `vesselNo` pointing at a split-off ordinal resolves to the CHILD accession
  - `vesselNo` pointing at an unclaimed ordinal still resolves to the parent
  - out-of-range `vesselNo` -> 404
  - unknown token -> 404
  - no Authorization header at all -> 401 (never a second public route)
  - a permitted role (e.g. `user`, which holds `genetics.view`) succeeds
  - route ordering: `/by-token/{token}` is not swallowed by `/{accession_id}`
  - the full internal `Accession` is returned, including its UUID `id` and
    `organizationId` — this is the authenticated side, unlike the public
    route's hand-built, UUID-free response shape
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any, Dict, List, Optional

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.modules.genetics.api.v1 import accessions as accessions_module
from src.modules.genetics.api.v1 import public as public_module
from src.modules.genetics.models.accession import Accession
from src.modules.genetics.services.common import model_to_doc
from src.modules.genetics.services.database import ACCESSIONS

ACCESSION_ID_KEY = "accessionId"


# ---------------------------------------------------------------------------
# Generic Motor-collection-shaped fake, following test_public_route.py's /
# test_vessel_resolver.py's precedent of standing in for
# AsyncIOMotorCollection rather than pulling in mongomock.
# ---------------------------------------------------------------------------


def _matches(doc: Dict[str, Any], query: Dict[str, Any]) -> bool:
    for key, expected in query.items():
        actual = doc.get(key)
        if isinstance(actual, list) and not isinstance(expected, list):
            # Mongo array-field equality: {"field": x} matches any document
            # whose array field contains x — used by the vessel resolver's
            # sourceVesselNumbers query.
            if expected not in actual:
                return False
        elif actual != expected:
            return False
    return True


class _FakeCollection:
    def __init__(self, docs: Optional[List[Dict[str, Any]]] = None) -> None:
        self.docs = list(docs or [])

    async def find_one(self, query: Dict[str, Any], *args: Any, **kwargs: Any) -> Optional[Dict[str, Any]]:
        for doc in self.docs:
            if _matches(doc, query):
                return dict(doc)
        return None


class _FakeGeneticsDB:
    """Stands in for ``genetics_db.get_database()`` — one collection per name,
    created empty on first access unless pre-seeded via ``seed``."""

    def __init__(self) -> None:
        self._collections: Dict[str, _FakeCollection] = {}

    def seed(self, name: str, docs: List[Dict[str, Any]]) -> None:
        self._collections[name] = _FakeCollection(docs)

    def __getitem__(self, name: str) -> _FakeCollection:
        return self._collections.setdefault(name, _FakeCollection())


def _make_accession(**overrides: Any) -> Accession:
    defaults: Dict[str, Any] = dict(
        lineId="line-po-blu",
        accessionCode="PO-BLU-G3-001",
        form="petri_dish",
        quantity=113,
        unit="plates",
        cloneGeneration=3,
        publicToken="14DQRT8S8N",
        labelledVesselCount=120,
        organizationId="org-1",
    )
    defaults.update(overrides)
    return Accession(**defaults)


@pytest.fixture
def fake_db(monkeypatch: pytest.MonkeyPatch) -> _FakeGeneticsDB:
    db = _FakeGeneticsDB()
    # Patches the shared genetics_db singleton — both `_load_accession_by_token`
    # (defined in public.py) and `resolve_vessel` (defined in vessel_resolver.py)
    # call `.get_database()` off the *same object*, regardless of which
    # module's namespace imported the name, so one patch covers both.
    monkeypatch.setattr(public_module.genetics_db, "get_database", lambda: db)
    return db


_FAKE_USER = SimpleNamespace(userId="tester-1", role="user", divisionId=None, organizationId=None)
_FAKE_GUEST = SimpleNamespace(userId="tester-2", role="guest", divisionId=None, organizationId=None)


@pytest.fixture
def authed_client(fake_db: _FakeGeneticsDB) -> TestClient:
    """require_view overridden with a bench-role (`user`) fake identity —
    exercises the route's own logic without re-testing JWT decoding, which
    `test_permissions.py` already covers for the shared `require_view`
    dependency."""
    app = FastAPI()
    app.include_router(accessions_module.router, prefix="/accessions")
    app.dependency_overrides[accessions_module.require_view] = lambda: _FAKE_USER
    with TestClient(app) as c:
        yield c


@pytest.fixture
def unauthed_client(fake_db: _FakeGeneticsDB) -> TestClient:
    """No dependency override at all — the real `require_view` ->
    `get_current_active_user` -> `get_current_user` -> `HTTPBearer()` chain
    runs, exactly as it would in production."""
    app = FastAPI()
    app.include_router(accessions_module.router, prefix="/accessions")
    with TestClient(app) as c:
        yield c


# ---------------------------------------------------------------------------
# Token resolution — happy path, case-insensitivity
# ---------------------------------------------------------------------------


def test_resolves_known_token_uppercase(authed_client: TestClient, fake_db: _FakeGeneticsDB) -> None:
    accession = _make_accession(publicToken="ABCDEFGH12")
    fake_db.seed(ACCESSIONS, [model_to_doc(accession, ACCESSION_ID_KEY)])

    resp = authed_client.get("/accessions/by-token/ABCDEFGH12")

    assert resp.status_code == 200, resp.text
    body = resp.json()["data"]
    assert body["accessionCode"] == accession.accessionCode
    # Authenticated side: the full internal record, UUID included — this is
    # the opposite guarantee from the public route's hand-built, UUID-free
    # response shape.
    assert body["id"] == accession.id
    assert body["organizationId"] == "org-1"


def test_resolves_known_token_lowercase(authed_client: TestClient, fake_db: _FakeGeneticsDB) -> None:
    accession = _make_accession(publicToken="ABCDEFGH12")
    fake_db.seed(ACCESSIONS, [model_to_doc(accession, ACCESSION_ID_KEY)])

    resp = authed_client.get("/accessions/by-token/abcdefgh12")

    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["accessionCode"] == accession.accessionCode


def test_resolves_known_token_mixed_case(authed_client: TestClient, fake_db: _FakeGeneticsDB) -> None:
    accession = _make_accession(publicToken="ABCDEFGH12")
    fake_db.seed(ACCESSIONS, [model_to_doc(accession, ACCESSION_ID_KEY)])

    resp = authed_client.get("/accessions/by-token/AbCdEfGh12")

    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["accessionCode"] == accession.accessionCode


def test_unknown_token_returns_404(authed_client: TestClient, fake_db: _FakeGeneticsDB) -> None:
    resp = authed_client.get("/accessions/by-token/DOESNOTEXIST")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# vesselNo — split-forward resolution, range checking
# ---------------------------------------------------------------------------


def test_vessel_no_split_off_resolves_to_child_accession(
    authed_client: TestClient, fake_db: _FakeGeneticsDB
) -> None:
    """Mirrors the live-data fixture: vessel #7 was split off the parent into
    its own contaminated-plate accession — the token must resolve to the
    CHILD, not the parent batch."""
    parent = _make_accession(
        accessionCode="PO-BLU-G3-001",
        publicToken="SPLITPARENT",
        labelledVesselCount=120,
        quantity=119,
    )
    child = _make_accession(
        accessionCode="PO-BLU-G3-003",
        publicToken="SPLITCHILD1",
        labelledVesselCount=0,
        quantity=1,
        splitFromAccessionId=parent.id,
        sourceVesselNumbers=[2],
        status="contaminated",
    )
    fake_db.seed(ACCESSIONS, [
        model_to_doc(parent, ACCESSION_ID_KEY),
        model_to_doc(child, ACCESSION_ID_KEY),
    ])

    resp = authed_client.get(f"/accessions/by-token/{parent.publicToken}?vesselNo=2")

    assert resp.status_code == 200, resp.text
    body = resp.json()["data"]
    assert body["accessionCode"] == "PO-BLU-G3-003"
    assert body["id"] == child.id


def test_vessel_no_unclaimed_ordinal_resolves_to_parent(
    authed_client: TestClient, fake_db: _FakeGeneticsDB
) -> None:
    parent = _make_accession(
        accessionCode="PO-BLU-G3-001",
        publicToken="SPLITPARENT",
        labelledVesselCount=120,
        quantity=119,
    )
    child = _make_accession(
        accessionCode="PO-BLU-G3-003",
        publicToken="SPLITCHILD1",
        labelledVesselCount=0,
        quantity=1,
        splitFromAccessionId=parent.id,
        sourceVesselNumbers=[2],
    )
    fake_db.seed(ACCESSIONS, [
        model_to_doc(parent, ACCESSION_ID_KEY),
        model_to_doc(child, ACCESSION_ID_KEY),
    ])

    # Vessel #3 was never split off -> still the parent batch.
    resp = authed_client.get(f"/accessions/by-token/{parent.publicToken}?vesselNo=3")

    assert resp.status_code == 200, resp.text
    body = resp.json()["data"]
    assert body["accessionCode"] == "PO-BLU-G3-001"
    assert body["id"] == parent.id


def test_vessel_no_out_of_range_returns_404(authed_client: TestClient, fake_db: _FakeGeneticsDB) -> None:
    accession = _make_accession(publicToken="RANGETOKEN", labelledVesselCount=5)
    fake_db.seed(ACCESSIONS, [model_to_doc(accession, ACCESSION_ID_KEY)])

    resp = authed_client.get(f"/accessions/by-token/{accession.publicToken}?vesselNo=999")

    assert resp.status_code == 404


def test_no_vessel_no_returns_the_batch_record(authed_client: TestClient, fake_db: _FakeGeneticsDB) -> None:
    accession = _make_accession(publicToken="BATCHTOKEN")
    fake_db.seed(ACCESSIONS, [model_to_doc(accession, ACCESSION_ID_KEY)])

    resp = authed_client.get(f"/accessions/by-token/{accession.publicToken}")

    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["accessionCode"] == accession.accessionCode


# ---------------------------------------------------------------------------
# Auth — must be behind require_view, never a second public route
# ---------------------------------------------------------------------------


def test_no_auth_header_returns_401(unauthed_client: TestClient, fake_db: _FakeGeneticsDB) -> None:
    accession = _make_accession(publicToken="NOAUTHTOK1")
    fake_db.seed(ACCESSIONS, [model_to_doc(accession, ACCESSION_ID_KEY)])

    resp = unauthed_client.get(f"/accessions/by-token/{accession.publicToken}", headers={})

    assert "authorization" not in {h.lower() for h in resp.request.headers.keys()}
    assert resp.status_code == 401
    assert resp.status_code != 200


def test_bench_role_holding_genetics_view_succeeds(fake_db: _FakeGeneticsDB) -> None:
    """`require_view` is `genetics.view`, which the bench tier (`user` and
    above) holds — confirms the route is gated on the real permission
    dependency, not a hand-rolled check that happens to look similar."""
    app = FastAPI()
    app.include_router(accessions_module.router, prefix="/accessions")
    app.dependency_overrides[accessions_module.require_view] = lambda: _FAKE_USER

    accession = _make_accession(publicToken="ROLETOKEN1")
    fake_db.seed(ACCESSIONS, [model_to_doc(accession, ACCESSION_ID_KEY)])

    with TestClient(app) as client:
        resp = client.get(f"/accessions/by-token/{accession.publicToken}")

    assert resp.status_code == 200, resp.text


# ---------------------------------------------------------------------------
# Route ordering — /by-token/{token} must not be swallowed by /{accession_id}
# ---------------------------------------------------------------------------


def test_by_token_route_is_not_captured_by_accession_id_route(
    authed_client: TestClient, fake_db: _FakeGeneticsDB
) -> None:
    """Regression guard for the `/users/me/tutorials` vs `/users/{user_id}`
    class of bug: `by-token/{token}` must dispatch to the token-resolution
    handler, never to `get_accession` with `accession_id="by-token"`. If the
    wrong route matched, this would 404 with a not-found-accession error
    rather than resolving the seeded token — this test seeds a real
    accession and asserts the *correct* handler's success shape came back."""
    accession = _make_accession(publicToken="ORDERTOKEN")
    fake_db.seed(ACCESSIONS, [model_to_doc(accession, ACCESSION_ID_KEY)])

    resp = authed_client.get(f"/accessions/by-token/{accession.publicToken}")

    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["accessionCode"] == accession.accessionCode

    # Sanity: FastAPI's own route table lists by-token before {accession_id}
    # — belt-and-braces on top of the live-behaviour assertion above.
    path_templates = [route.path for route in accessions_module.router.routes]
    by_token_index = path_templates.index("/by-token/{token}")
    accession_id_index = path_templates.index("/{accession_id}")
    assert by_token_index < accession_id_index, (
        "/by-token/{token} must be declared before /{accession_id} in accessions.py"
    )
