"""
Unit tests for T-804 step 3 — the public, unauthenticated genetics label-info
route (``GET /api/v1/public/genetics/i/{token}[/{vesselNo}]``).

This is the first unauthenticated route in the platform. Everything here
exists to pin down the two failure modes that matter for a route like that:

  1. **Leakage.** ``PublicAccessionInfo`` is hand-built (spec §5.2 rule 1),
     which only works as a guarantee if something fails the moment a new
     field reaches the response. ``test_response_never_exceeds_the_allowlist``
     is that guarantee — it walks the actual JSON response and asserts every
     key, at every depth, against an explicit allowlist. Add a field to
     ``Accession`` that this route's assembly code forwards without also
     adding it to the allowlist below, and this test fails. That is the
     point.
  2. **Enumeration.** Every way to fail (unknown token, disabled org,
     out-of-range ordinal, malformed input) must return the exact same 404
     — status, headers, and body — so a caller cannot learn anything about
     *why* a guess failed. ``test_all_failure_modes_return_byte_identical_404``
     pins that down across all four.

No live database — Motor's AsyncIOMotorCollection is stood in for with a
small generic fake supporting the query shapes this route's collaborators
actually issue (equality, ``$in``, and Mongo's array-contains-scalar
semantics), following the no-mongomock precedent in
tests/unit/test_genetics/test_vessel_resolver.py. ``resolve_vessel`` itself
is never mocked — the split-survives-a-scan test exercises the real
function against the fake collection, exactly as spec §3 describes it.

Test cases:
  - Leakage
      - full response (every optional field populated, every tenant show*
        flag on) contains no key outside the explicit allowlist
      - forbidden field names (roomId, unit/position under location, notes,
        tags, createdBy, divisionId, organizationId, internal ids,
        publicToken) never appear as a JSON key anywhere in the body
      - a parent in the lineage array never carries an accessionId or
        publicToken
  - 404 uniformity
      - unknown token, disabled org, out-of-range ordinal, malformed
        (non-numeric) ordinal all return status 404 with byte-identical
        response bodies
  - Ordinal survives a split (spec §3)
      - unsplit ordinal resolves to the batch, vessel.splitOff is False
      - the split ordinal resolves to the child, vessel.splitOff is True
      - an ordinal claimed by nobody, and one above the split but still
        printed, both still resolve to the parent batch
  - Token case-insensitivity (spec §5.2 rule 6)
      - lowercase and uppercase tokens both resolve to the same record
  - Reachability
      - the route responds 200 with no Authorization header at all
"""

from __future__ import annotations

import re
from datetime import datetime
from types import SimpleNamespace
from typing import Any, Dict, List, Optional
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from src.modules.genetics.api.v1 import public as public_module
from src.modules.genetics.models.accession import (
    Accession,
    ParentRef,
    StorageLocation,
)
from src.modules.genetics.models.enums import (
    AccessionStatus,
    IngredientUnit,
    MediumType,
    OrganismKind,
    ParentRole,
    PropagationMethod,
    ProvenanceType,
    ReproductionMode,
    VesselForm,
)
from src.modules.genetics.models.line import Line, Provenance
from src.modules.genetics.models.medium import Batch, Ingredient
from src.modules.genetics.models.propagation import PropagationEvent
from src.modules.genetics.services.common import model_to_doc
from src.modules.genetics.services.database import (
    ACCESSIONS,
    BATCHES,
    LINES,
    PROPAGATIONS,
)
from src.models.organization import PublicInfoPageConfig

ACCESSION_ID_KEY = "accessionId"
LINE_ID_KEY = "lineId"
BATCH_ID_KEY = "batchId"
EVENT_ID_KEY = "eventId"
PROTOCOLS_COLLECTION = "protocols"


# ---------------------------------------------------------------------------
# Generic Motor-collection-shaped fake, following test_vessel_resolver.py's
# precedent of standing in for AsyncIOMotorCollection rather than pulling in
# mongomock (not in requirements.txt).
# ---------------------------------------------------------------------------


def _resolve_dotted(doc: Any, dotted_key: str) -> List[Any]:
    """Best-effort Mongo-style dotted-path resolution through a list of
    subdocuments — e.g. ``"parents.accessionId"`` against
    ``parents: [{"accessionId": ..., ...}, ...]``, the shape
    ``LineageService._collect_around``'s descendant walk queries. Returns
    every value found at that path (Mongo matches a dotted query against ANY
    element, not just the first)."""
    current: List[Any] = [doc]
    for part in dotted_key.split("."):
        nxt: List[Any] = []
        for value in current:
            if isinstance(value, dict):
                if part in value:
                    nxt.append(value[part])
            elif isinstance(value, list):
                for item in value:
                    if isinstance(item, dict) and part in item:
                        nxt.append(item[part])
        current = nxt
    return current


def _matches(doc: Dict[str, Any], query: Dict[str, Any]) -> bool:
    for key, expected in query.items():
        if "." in key:
            # Dotted path into an array of subdocuments (e.g. lineage graph's
            # "parents.accessionId" descendant query) — resolved separately
            # from the flat-field logic below.
            actual_values = _resolve_dotted(doc, key)
            if isinstance(expected, dict) and "$in" in expected:
                if not any(v in expected["$in"] for v in actual_values):
                    return False
            elif expected not in actual_values:
                return False
            continue

        actual = doc.get(key)
        if isinstance(expected, dict) and "$in" in expected:
            allowed = expected["$in"]
            if isinstance(actual, list):
                if not any(item in allowed for item in actual):
                    return False
            elif actual not in allowed:
                return False
        elif isinstance(actual, list) and not isinstance(expected, list):
            # Mongo array-field equality: {"field": x} matches any document
            # whose array field contains x — used by the vessel resolver's
            # sourceVesselNumbers query.
            if expected not in actual:
                return False
        elif actual != expected:
            return False
    return True


class _AsyncCursor:
    def __init__(self, items: List[Dict[str, Any]]) -> None:
        self._items = list(items)

    def sort(self, *args: Any, **kwargs: Any) -> "_AsyncCursor":
        return self

    def limit(self, *args: Any, **kwargs: Any) -> "_AsyncCursor":
        return self

    def skip(self, *args: Any, **kwargs: Any) -> "_AsyncCursor":
        return self

    def __aiter__(self) -> "_AsyncCursor":
        return self

    async def __anext__(self) -> Dict[str, Any]:
        if not self._items:
            raise StopAsyncIteration
        return self._items.pop(0)


class _FakeCollection:
    def __init__(self, docs: Optional[List[Dict[str, Any]]] = None) -> None:
        self.docs = list(docs or [])

    async def find_one(self, query: Dict[str, Any], *args: Any, **kwargs: Any) -> Optional[Dict[str, Any]]:
        for doc in self.docs:
            if _matches(doc, query):
                return dict(doc)
        return None

    def find(self, query: Optional[Dict[str, Any]] = None, *args: Any, **kwargs: Any) -> _AsyncCursor:
        query = query or {}
        return _AsyncCursor([dict(d) for d in self.docs if _matches(d, query)])


class _FakeGeneticsDB:
    """Stands in for ``genetics_db.get_database()`` — one collection per name,
    created empty on first access unless pre-seeded via ``seed``."""

    def __init__(self) -> None:
        self._collections: Dict[str, _FakeCollection] = {}

    def seed(self, name: str, docs: List[Dict[str, Any]]) -> None:
        self._collections[name] = _FakeCollection(docs)

    def __getitem__(self, name: str) -> _FakeCollection:
        return self._collections.setdefault(name, _FakeCollection())


# ---------------------------------------------------------------------------
# Fixture builders
# ---------------------------------------------------------------------------


def _make_accession(**overrides: Any) -> Accession:
    defaults: Dict[str, Any] = dict(
        lineId="line-po-blu",
        accessionCode="PO-BLU-G3-004",
        form=VesselForm.PETRI_DISH,
        quantity=113,
        unit="plates",
        cloneGeneration=3,
        publicToken="ZZZZZZ0001",
        labelledVesselCount=120,
    )
    defaults.update(overrides)
    return Accession(**defaults)


@pytest.fixture
def fake_db(monkeypatch: pytest.MonkeyPatch) -> _FakeGeneticsDB:
    db = _FakeGeneticsDB()
    monkeypatch.setattr(public_module.genetics_db, "get_database", lambda: db)
    return db


@pytest.fixture(autouse=True)
def _no_org_gate(monkeypatch: pytest.MonkeyPatch) -> None:
    """Default: accession.organizationId is None on every test accession
    unless a test overrides it, so OrganizationService is never consulted
    (matches ``_get_public_config``'s no-org-scope-configured branch). Tests
    that DO need an organization (the disabled-org test) monkeypatch
    ``get_organization`` themselves, which simply overrides this default."""
    monkeypatch.setattr(
        public_module.OrganizationService,
        "get_organization",
        AsyncMock(return_value=None),
    )


@pytest.fixture
def client(fake_db: _FakeGeneticsDB) -> TestClient:
    app = FastAPI()
    app.include_router(public_module.router)
    # Rate limiting is exercised in its own dedicated test below, calling the
    # dependency directly — disabling it here keeps the functional tests
    # (dozens of requests across a run) independent of Redis/in-memory state
    # shared with every other test in the process.
    app.dependency_overrides[public_module.enforce_public_rate_limit] = lambda: None
    with TestClient(app) as c:
        yield c


# ---------------------------------------------------------------------------
# Leakage — the allowlist
# ---------------------------------------------------------------------------

# Path-aware: a key is only permitted at the position this schema says it
# may appear. `None` means "leaf — must not be a dict/list-of-dict"; a dict
# means "may recurse here, and only these child keys are allowed". This is
# deliberately stricter than a flat set of permitted names: `unit` is a
# legitimate field of an ingredient (a measurement unit) but must never
# appear as `location.unit` — a flat allowlist could not tell those apart,
# a path-aware one does not need to, because `location` is not a key that
# can appear anywhere in this schema at all.
ALLOWED_SCHEMA: Dict[str, Any] = {
    "accessionCode": None,
    "generationLabel": None,
    "form": None,
    "status": None,
    "acquiredAt": None,
    "operator": None,
    "facility": None,
    "vessel": {
        "number": None,
        "of": None,
        "splitOff": None,
        "fromVesselNo": None,
    },
    "line": {
        "code": None,
        "commonName": None,
        "scientificName": None,
        "kind": None,
    },
    "medium": {
        "batchCode": None,
        "recipeName": None,
        "ingredients": {
            "name": None,
            "amount": None,
            "unit": None,
        },
    },
    "protocol": {
        "code": None,
        "title": None,
        "version": None,
        "steps": None,
    },
    "lineage": {
        "depth": None,
        "accessionCode": None,
        "generationLabel": None,
        "method": None,
        "performedAt": None,
        "provenance": None,
        "fromVesselNo": None,
    },
    "lineageGraph": {
        "nodes": {
            "code": None,
            "generationLabel": None,
            "form": None,
            "status": None,
            "isScanned": None,
            "depth": None,
        },
        "edges": {
            "from": None,
            "to": None,
            "fromVesselNo": None,
        },
        "truncated": None,
    },
}

# Exact JSON key names that must never appear anywhere in the body,
# regardless of nesting — the literal list from spec §5.2 rule 3, plus the
# internal-id family Accession carries.
FORBIDDEN_KEYS = {
    "roomId",
    "position",
    "notes",
    "tags",
    "createdBy",
    "divisionId",
    "organizationId",
    "publicToken",
    "id",
    "lineId",
    "mediumBatchId",
    "sourceEventId",
    "splitFromAccessionId",
    "accessionId",
    "facilityId",
    "location",
}


def _is_scalar(value: Any) -> bool:
    return value is None or isinstance(value, (str, int, float, bool))


def _assert_within_schema(node: Any, schema: Dict[str, Any], path: str) -> None:
    """Recursively assert every dict key in `node` is declared in `schema`,
    and that `ingredients`/`lineage`-shaped lists recurse into their item
    schema too.

    A leaf entry in `schema` (value `None`) permits either a scalar or a
    list of scalars — ``protocol.steps`` is exactly that: a plain
    ``List[str]``, not a list of objects, so it does not get its own child
    schema the way ``lineage`` or `medium.ingredients`` do. What a leaf
    entry never permits is a dict, or a list containing one — that would be
    an unvalidated nested structure this test was not told to expect.
    """
    if node is None:
        return
    if isinstance(node, list):
        for index, item in enumerate(node):
            _assert_within_schema(item, schema, f"{path}[{index}]")
        return
    if not isinstance(node, dict):
        # Leaf scalar (str/int/float/bool) — fine as long as we were called
        # with a leaf schema, which the caller guarantees.
        return

    for key, value in node.items():
        assert key in schema, f"Unexpected key '{key}' leaked at {path} — not in the T-804 public allowlist"
        child_schema = schema[key]
        if child_schema is None:
            if isinstance(value, list):
                assert all(_is_scalar(item) for item in value), (
                    f"'{path}.{key}' is a declared leaf field but its list contains a "
                    f"non-scalar item: {value!r}"
                )
            else:
                assert _is_scalar(value), (
                    f"'{path}.{key}' was declared a leaf field but carries a "
                    f"nested structure: {value!r}"
                )
        else:
            _assert_within_schema(value, child_schema, f"{path}.{key}")


def _assert_no_forbidden_keys_anywhere(raw_body: bytes) -> None:
    """Belt-and-braces: scan the raw JSON text for any forbidden key
    appearing as a literal JSON object key, independent of the schema walk
    above (protects against, e.g., a key smuggled in under a list index the
    schema walk wasn't told to expect)."""
    text = raw_body.decode("utf-8")
    for forbidden in FORBIDDEN_KEYS:
        token = f'"{forbidden}":'
        assert token not in text, f"Forbidden key '{forbidden}' found in response body"


def _full_public_config() -> PublicInfoPageConfig:
    return PublicInfoPageConfig(
        enabled=True,
        showOperatorName=True,
        showMediumIngredients=True,
        showProtocolSteps=True,
        showFacilityName=True,
    )


@pytest.fixture
def full_scenario(fake_db: _FakeGeneticsDB, monkeypatch: pytest.MonkeyPatch) -> Dict[str, Any]:
    """Every optional field populated and every tenant show* flag on — the
    worst case for leakage, and the fixture the ordinal/case-insensitivity
    tests reuse for a realistic accession."""
    root = _make_accession(
        accessionCode="PO-BLU-G0-001",
        cloneGeneration=0,
        publicToken="ROOTTOKEN1",
        labelledVesselCount=0,
        provenance=Provenance(type=ProvenanceType.WILD_COLLECTED, sourceNote="Spore print, Aljunied 2025"),
    )
    event = PropagationEvent(
        method=PropagationMethod.AGAR_TO_AGAR,
        reproductionMode=ReproductionMode.ASEXUAL,
        resultAccessionIds=[],  # filled in after `main` is built below
        performedAt=datetime(2026, 7, 31, 0, 0, 0),
        protocolRef={"protocolId": "prot-1", "code": "SOP-AGR-001", "title": "Agar-to-Agar Transfer", "version": 2},
    )
    main = _make_accession(
        accessionCode="PO-BLU-G3-004",
        lineId=root.lineId,
        parents=[ParentRef(accessionId=root.id, role=ParentRole.CLONE_SOURCE, lineId=root.lineId)],
        sourceEventId=event.id,
        mediumBatchId="batch-1",
        createdBy="user-1",
        organizationId="org-1",
        location=StorageLocation(facility="Lab A", roomId="room-9", unit="fridge-2", position="shelf-3"),
        acquiredAt=datetime(2026, 7, 31, 0, 0, 0),
    )
    event.resultAccessionIds = [main.id]

    line = Line(
        id=main.lineId,
        code="PO-BLU",
        commonName="Blue Oyster",
        kind=OrganismKind.FUNGUS,
        scientificName="Pleurotus ostreatus",
    )
    batch = Batch(
        id="batch-1",
        batchCode="MEA-AC-2607-03",
        recipeId="recipe-1",
        recipeName="Malt Extract Agar + AC",
        type=MediumType.AGAR,
        ingredientsSnapshot=[Ingredient(name="Malt extract", amount=20.0, unit=IngredientUnit.G_PER_L)],
    )

    fake_db.seed(ACCESSIONS, [
        model_to_doc(main, ACCESSION_ID_KEY),
        model_to_doc(root, ACCESSION_ID_KEY),
    ])
    fake_db.seed(LINES, [model_to_doc(line, LINE_ID_KEY)])
    fake_db.seed(BATCHES, [model_to_doc(batch, BATCH_ID_KEY)])
    fake_db.seed(PROPAGATIONS, [model_to_doc(event, EVENT_ID_KEY)])
    fake_db.seed(PROTOCOLS_COLLECTION, [
        {
            "protocolId": "prot-1",
            "steps": [
                {"order": 2, "text": "Let the agar set before inoculating"},
                {"order": 1, "text": "Flame the loop"},
            ],
        }
    ])

    monkeypatch.setattr(
        public_module.OrganizationService,
        "get_organization",
        AsyncMock(return_value=SimpleNamespace(modules=SimpleNamespace(publicInfoPage=_full_public_config()))),
    )
    monkeypatch.setattr(
        public_module.UserService,
        "get_user_by_id",
        AsyncMock(return_value=SimpleNamespace(firstName="Viet", lastName="Anh")),
    )

    return {"main": main, "root": root}


# ---------------------------------------------------------------------------
# Leakage tests
# ---------------------------------------------------------------------------


def test_response_never_exceeds_the_allowlist(client: TestClient, full_scenario: Dict[str, Any]) -> None:
    token = full_scenario["main"].publicToken
    resp = client.get(f"/i/{token}")
    assert resp.status_code == 200, resp.text

    body = resp.json()
    _assert_within_schema(body, ALLOWED_SCHEMA, path="$")
    _assert_no_forbidden_keys_anywhere(resp.content)

    # Sanity: the fields the allowlist permits actually got populated in
    # this worst-case scenario — an allowlist that never fails because the
    # route always returns nulls would be a hollow guarantee.
    assert body["medium"]["ingredients"], "expected ingredients to be populated with showMediumIngredients=True"
    assert body["protocol"]["steps"] == ["Flame the loop", "Let the agar set before inoculating"]
    assert body["operator"] == "Viet Anh"
    assert body["facility"] == "Lab A"
    assert len(body["lineage"]) == 2
    assert body["lineage"][0]["provenance"] is None  # depth 0 (main) has a method, not provenance
    assert body["lineage"][1]["provenance"] == "Spore print, Aljunied 2025"  # depth 1 (root)

    # lineageGraph: same two accessions (main + its one ancestor), but as a
    # code-keyed graph rather than the flat breadcrumb — exactly one node
    # flagged isScanned, one edge from the ancestor to the scanned node.
    graph = body["lineageGraph"]
    assert {n["code"] for n in graph["nodes"]} == {"PO-BLU-G3-004", "PO-BLU-G0-001"}
    scanned_nodes = [n for n in graph["nodes"] if n["isScanned"]]
    assert len(scanned_nodes) == 1, f"expected exactly one isScanned node, got {scanned_nodes}"
    assert scanned_nodes[0]["code"] == "PO-BLU-G3-004"
    assert graph["edges"] == [{"from": "PO-BLU-G0-001", "to": "PO-BLU-G3-004", "fromVesselNo": None}]
    assert graph["truncated"] is False


def test_forbidden_keys_absent_with_default_closed_config(
    client: TestClient, fake_db: _FakeGeneticsDB, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Same shape, but with the tenant's show* flags at their (closed)
    default — the far more common case in production, and independently
    worth asserting the forbidden set against. The line lookup is left
    unmocked on purpose: LINES is never seeded, so this also exercises
    ``_build_line_info``'s graceful-fallback path for a missing line."""
    accession = _make_accession(
        createdBy="user-1",
        location=StorageLocation(facility="Lab A", roomId="room-9", unit="fridge-2", position="shelf-3"),
    )
    fake_db.seed(ACCESSIONS, [model_to_doc(accession, ACCESSION_ID_KEY)])
    monkeypatch.setattr(
        public_module.UserService,
        "get_user_by_id",
        AsyncMock(return_value=SimpleNamespace(firstName="Viet", lastName="Anh")),
    )

    resp = client.get(f"/i/{accession.publicToken}")

    assert resp.status_code == 200, resp.text
    body = resp.json()
    _assert_within_schema(body, ALLOWED_SCHEMA, path="$")
    _assert_no_forbidden_keys_anywhere(resp.content)
    # showOperatorName defaults False -> initials ("V.A."), never the full name.
    assert body["operator"] == "V.A."
    # showFacilityName defaults False -> facility must be null even though
    # the accession's location carries one.
    assert body["facility"] is None


def test_lineage_graph_descendant_never_leaks_uuid_or_token(
    client: TestClient, fake_db: _FakeGeneticsDB
) -> None:
    """A descendant (split-off child / propagation result) carries its own
    internal accessionId and publicToken — neither may ever reach the public
    ``lineageGraph``, even though the descendant itself is now visible by
    code (the T-804 follow-up's whole point: widen ancestry-only to a real
    tree). Regression guard for `_build_lineage_graph`'s UUID -> code
    translation on a non-trivial (ancestor + scanned + descendant) shape —
    ``full_scenario`` above only ever exercises an ancestor-only shape."""
    root = _make_accession(
        accessionCode="PO-BLU-G0-001",
        cloneGeneration=0,
        publicToken="ROOTTOKEN2",
        labelledVesselCount=0,
    )
    main = _make_accession(
        accessionCode="PO-BLU-G3-001",
        lineId=root.lineId,
        publicToken="MAINTOKEN1",
        parents=[ParentRef(accessionId=root.id, role=ParentRole.CLONE_SOURCE, lineId=root.lineId)],
        labelledVesselCount=120,
    )
    # Same shape LineageService._collect_around's descendant walk matches on:
    # a `parents` entry referencing `main`, plus splitFromAccessionId for a
    # split-off vessel specifically (spec §3).
    child = _make_accession(
        accessionCode="PO-BLU-G3-003",
        lineId=root.lineId,
        publicToken="CHILDTOKEN1",
        parents=[ParentRef(accessionId=main.id, role=ParentRole.CLONE_SOURCE, lineId=root.lineId)],
        splitFromAccessionId=main.id,
        labelledVesselCount=0,
        status=AccessionStatus.CONTAMINATED,
    )
    fake_db.seed(ACCESSIONS, [
        model_to_doc(root, ACCESSION_ID_KEY),
        model_to_doc(main, ACCESSION_ID_KEY),
        model_to_doc(child, ACCESSION_ID_KEY),
    ])

    resp = client.get(f"/i/{main.publicToken}")
    assert resp.status_code == 200, resp.text
    body = resp.json()

    _assert_within_schema(body, ALLOWED_SCHEMA, path="$")
    _assert_no_forbidden_keys_anywhere(resp.content)

    # Sanity: the descendant genuinely made it into the graph — an allowlist
    # that passes only because the graph came back empty proves nothing.
    graph = body["lineageGraph"]
    codes = {n["code"] for n in graph["nodes"]}
    assert codes == {"PO-BLU-G0-001", "PO-BLU-G3-001", "PO-BLU-G3-003"}
    assert {"from": "PO-BLU-G3-001", "to": "PO-BLU-G3-003", "fromVesselNo": None} in graph["edges"]

    # Belt-and-braces beyond the allowlist/forbidden-key scans above: no
    # UUID-shaped string appears anywhere in the raw body, and none of the
    # three minted publicTokens or internal ids leak as a bare value either
    # (the forbidden-key scan only catches leakage as a JSON *key*; this
    # catches it leaking as a *value* too, e.g. smuggled into a code field).
    uuid_pattern = re.compile(
        r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
    )
    text = resp.text
    assert not uuid_pattern.search(text), f"UUID-shaped value leaked in response: {text}"
    for token in (root.publicToken, main.publicToken, child.publicToken):
        assert token not in text, f"publicToken '{token}' leaked in response"
    for internal_id in (root.id, main.id, child.id):
        assert internal_id not in text, f"internal id '{internal_id}' leaked in response"


def _seed_single(accession: Accession) -> _FakeGeneticsDB:
    db = _FakeGeneticsDB()
    db.seed(ACCESSIONS, [model_to_doc(accession, ACCESSION_ID_KEY)])
    return db


# ---------------------------------------------------------------------------
# 404 uniformity
# ---------------------------------------------------------------------------


def test_all_failure_modes_return_byte_identical_404(client: TestClient, fake_db: _FakeGeneticsDB) -> None:
    # Two distinct accessions so the org-gate sub-test doesn't shadow the
    # range-check / parsing sub-tests (organizationId=None on `plain_accession`
    # takes the autouse "no org configured -> open" path, so those two
    # requests genuinely exercise the range-check and int-parse branches
    # rather than being short-circuited by the org gate first).
    org_gated_accession = _make_accession(publicToken="ORGCLOSED1", labelledVesselCount=5, organizationId="org-closed")
    plain_accession = _make_accession(publicToken="PLAINTOKEN", labelledVesselCount=5, organizationId=None)
    fake_db.seed(ACCESSIONS, [
        model_to_doc(org_gated_accession, ACCESSION_ID_KEY),
        model_to_doc(plain_accession, ACCESSION_ID_KEY),
    ])

    unknown_token_resp = client.get("/i/DOESNOTEXIST")

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(
            public_module.OrganizationService,
            "get_organization",
            AsyncMock(return_value=SimpleNamespace(modules=SimpleNamespace(publicInfoPage=PublicInfoPageConfig(enabled=False)))),
        )
        disabled_org_resp = client.get(f"/i/{org_gated_accession.publicToken}")

    out_of_range_resp = client.get(f"/i/{plain_accession.publicToken}/999")
    malformed_ordinal_resp = client.get(f"/i/{plain_accession.publicToken}/not-a-number")

    responses = {
        "unknown_token": unknown_token_resp,
        "disabled_org": disabled_org_resp,
        "out_of_range": out_of_range_resp,
        "malformed_ordinal": malformed_ordinal_resp,
    }

    for name, resp in responses.items():
        assert resp.status_code == 404, f"{name} -> {resp.status_code}: {resp.text}"

    bodies = {name: resp.content for name, resp in responses.items()}
    reference = bodies["unknown_token"]
    for name, body in bodies.items():
        assert body == reference, f"{name}'s 404 body differs from unknown_token's — enumeration oracle"

    for resp in responses.values():
        assert resp.headers.get("cache-control") == "no-store"


def test_404_is_never_403(client: TestClient) -> None:
    """A disabled org must read exactly like an unknown token, never as a
    distinguishable 'forbidden' — spec §5.2 rule 4 explicitly calls out 403
    as the wrong status even though the accession genuinely exists."""
    accession = _make_accession(organizationId="org-closed")
    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(public_module.genetics_db, "get_database", lambda: _seed_single(accession))
        mp.setattr(
            public_module.OrganizationService,
            "get_organization",
            AsyncMock(return_value=SimpleNamespace(modules=SimpleNamespace(publicInfoPage=PublicInfoPageConfig(enabled=False)))),
        )
        resp = client.get(f"/i/{accession.publicToken}")
    assert resp.status_code == 404
    assert resp.status_code != 403


# ---------------------------------------------------------------------------
# Ordinal survives a split (spec §3)
# ---------------------------------------------------------------------------


def test_ordinal_survives_a_split(client: TestClient, fake_db: _FakeGeneticsDB) -> None:
    parent = _make_accession(
        accessionCode="PO-BLU-G3-004",
        publicToken="SPLITPARENT",
        labelledVesselCount=120,
        quantity=119,
    )
    child = _make_accession(
        accessionCode="PO-BLU-G3-100",
        publicToken="SPLITCHILD1",
        labelledVesselCount=0,
        quantity=1,
        splitFromAccessionId=parent.id,
        sourceVesselNumbers=[7],
    )
    fake_db.seed(ACCESSIONS, [
        model_to_doc(parent, ACCESSION_ID_KEY),
        model_to_doc(child, ACCESSION_ID_KEY),
    ])

    # #7 was split off -> resolves to the child, splitOff true.
    resp7 = client.get(f"/i/{parent.publicToken}/7")
    assert resp7.status_code == 200, resp7.text
    body7 = resp7.json()
    assert body7["accessionCode"] == "PO-BLU-G3-100"
    assert body7["vessel"] == {"number": 7, "of": 120, "splitOff": True, "fromVesselNo": None}

    # #8 was never claimed by any split -> still the parent batch.
    resp8 = client.get(f"/i/{parent.publicToken}/8")
    assert resp8.status_code == 200, resp8.text
    body8 = resp8.json()
    assert body8["accessionCode"] == "PO-BLU-G3-004"
    assert body8["vessel"] == {"number": 8, "of": 120, "splitOff": False, "fromVesselNo": None}

    # #120 was printed (within labelledVesselCount) and never split -> parent.
    resp120 = client.get(f"/i/{parent.publicToken}/120")
    assert resp120.status_code == 200, resp120.text
    body120 = resp120.json()
    assert body120["accessionCode"] == "PO-BLU-G3-004"
    assert body120["vessel"] == {"number": 120, "of": 120, "splitOff": False, "fromVesselNo": None}

    # #121 was never printed -> 404.
    resp121 = client.get(f"/i/{parent.publicToken}/121")
    assert resp121.status_code == 404


# ---------------------------------------------------------------------------
# Vessel-level parentage (T-805b — display half of T-805)
# ---------------------------------------------------------------------------


def test_from_vessel_no_populated_from_primary_parent(
    client: TestClient, fake_db: _FakeGeneticsDB
) -> None:
    """`vessel.fromVesselNo` and each lineage step's `fromVesselNo` read
    straight off `ParentRef.vesselNo` (landed in T-805a) — the populated-path
    companion to the null-by-default coverage everywhere else in this file
    (real demo data predates T-805a and has none recorded, so it never
    exercises this)."""
    root = _make_accession(
        accessionCode="PO-BLU-G0-001",
        cloneGeneration=0,
        publicToken="VESSELROOT1",
        labelledVesselCount=0,
    )
    main = _make_accession(
        accessionCode="PO-BLU-G1-001",
        lineId=root.lineId,
        publicToken="VESSELMAIN1",
        cloneGeneration=1,
        parents=[ParentRef(accessionId=root.id, role=ParentRole.CLONE_SOURCE, lineId=root.lineId, vesselNo=4)],
        labelledVesselCount=10,
    )
    fake_db.seed(ACCESSIONS, [
        model_to_doc(root, ACCESSION_ID_KEY),
        model_to_doc(main, ACCESSION_ID_KEY),
    ])

    resp = client.get(f"/i/{main.publicToken}/1")
    assert resp.status_code == 200, resp.text
    body = resp.json()

    # The scanned vessel came off plate #4 of its parent.
    assert body["vessel"]["fromVesselNo"] == 4

    lineage_by_code = {step["accessionCode"]: step for step in body["lineage"]}
    assert lineage_by_code["PO-BLU-G1-001"]["fromVesselNo"] == 4
    # The root has no parent to cite a vessel from.
    assert lineage_by_code["PO-BLU-G0-001"]["fromVesselNo"] is None


def test_lineage_graph_edge_carries_from_vessel_no(client: TestClient, fake_db: _FakeGeneticsDB) -> None:
    """`lineageGraph.edges[].fromVesselNo` reads the same `ParentRef.vesselNo`
    as `vessel.fromVesselNo` / the lineage breadcrumb, but per graph edge —
    the T-805b graph-half companion to `test_from_vessel_no_populated_from_primary_parent`
    above, which only covers `vessel` and `lineage`."""
    root = _make_accession(
        accessionCode="PO-BLU-G0-003",
        cloneGeneration=0,
        publicToken="EDGEROOT001",
        labelledVesselCount=0,
    )
    main = _make_accession(
        accessionCode="PO-BLU-G1-003",
        lineId=root.lineId,
        publicToken="EDGEMAIN001",
        cloneGeneration=1,
        parents=[ParentRef(accessionId=root.id, role=ParentRole.CLONE_SOURCE, lineId=root.lineId, vesselNo=4)],
        labelledVesselCount=10,
    )
    fake_db.seed(ACCESSIONS, [
        model_to_doc(root, ACCESSION_ID_KEY),
        model_to_doc(main, ACCESSION_ID_KEY),
    ])

    resp = client.get(f"/i/{main.publicToken}")
    assert resp.status_code == 200, resp.text
    body = resp.json()

    graph = body["lineageGraph"]
    assert graph["edges"] == [{"from": "PO-BLU-G0-003", "to": "PO-BLU-G1-003", "fromVesselNo": 4}]


def test_lineage_graph_cross_edges_carry_distinct_vessel_numbers(
    client: TestClient, fake_db: _FakeGeneticsDB
) -> None:
    """The bug `_vessel_no_cited_by_child` exists to prevent: a cross has TWO
    parents in `child.parents`, each potentially citing its own vessel
    number. Naively reading `child.parents[0].vesselNo` for every incoming
    edge would attribute the seed parent's vessel number to the pollen
    parent's edge too (or vice versa, depending on list order). This pins
    down that each edge carries the vessel number off the `ParentRef` entry
    that actually matches its own `from` node — not the same value twice."""
    seed_parent = _make_accession(
        accessionCode="PO-BLU-G1-010",
        publicToken="CROSSSEED01",
        cloneGeneration=1,
        labelledVesselCount=6,
    )
    pollen_parent = _make_accession(
        accessionCode="PO-BLU-G1-011",
        publicToken="CROSSPOLL01",
        cloneGeneration=1,
        labelledVesselCount=6,
    )
    child = _make_accession(
        accessionCode="PO-BLU-F1-001",
        publicToken="CROSSCHILD1",
        cloneGeneration=0,
        filialGeneration=1,
        labelledVesselCount=3,
        parents=[
            ParentRef(
                accessionId=seed_parent.id,
                role=ParentRole.SEED_PARENT,
                lineId=seed_parent.lineId,
                vesselNo=2,
            ),
            ParentRef(
                accessionId=pollen_parent.id,
                role=ParentRole.POLLEN_PARENT,
                lineId=pollen_parent.lineId,
                vesselNo=5,
            ),
        ],
    )
    fake_db.seed(ACCESSIONS, [
        model_to_doc(seed_parent, ACCESSION_ID_KEY),
        model_to_doc(pollen_parent, ACCESSION_ID_KEY),
        model_to_doc(child, ACCESSION_ID_KEY),
    ])

    resp = client.get(f"/i/{child.publicToken}")
    assert resp.status_code == 200, resp.text
    body = resp.json()

    graph = body["lineageGraph"]
    edges_by_from = {edge["from"]: edge for edge in graph["edges"]}
    assert set(edges_by_from) == {"PO-BLU-G1-010", "PO-BLU-G1-011"}
    assert edges_by_from["PO-BLU-G1-010"] == {
        "from": "PO-BLU-G1-010", "to": "PO-BLU-F1-001", "fromVesselNo": 2,
    }
    assert edges_by_from["PO-BLU-G1-011"] == {
        "from": "PO-BLU-G1-011", "to": "PO-BLU-F1-001", "fromVesselNo": 5,
    }
    # The core regression this test exists to catch: neither edge's vessel
    # number leaked onto the other.
    assert edges_by_from["PO-BLU-G1-010"]["fromVesselNo"] != edges_by_from["PO-BLU-G1-011"]["fromVesselNo"]


def test_from_vessel_no_null_when_not_recorded(client: TestClient, fake_db: _FakeGeneticsDB) -> None:
    """The far more common case pre-T-805a (and still common after, since
    recording it is optional): a parent slot with no `vesselNo` at all
    yields `fromVesselNo: null`, never an invented value or a 0/-1 default."""
    root = _make_accession(
        accessionCode="PO-BLU-G0-002",
        cloneGeneration=0,
        publicToken="NOVESSROOT1",
        labelledVesselCount=0,
    )
    main = _make_accession(
        accessionCode="PO-BLU-G1-002",
        lineId=root.lineId,
        publicToken="NOVESSMAIN1",
        cloneGeneration=1,
        parents=[ParentRef(accessionId=root.id, role=ParentRole.CLONE_SOURCE, lineId=root.lineId)],
        labelledVesselCount=10,
    )
    fake_db.seed(ACCESSIONS, [
        model_to_doc(root, ACCESSION_ID_KEY),
        model_to_doc(main, ACCESSION_ID_KEY),
    ])

    resp = client.get(f"/i/{main.publicToken}/1")
    assert resp.status_code == 200, resp.text
    body = resp.json()

    assert body["vessel"]["fromVesselNo"] is None
    lineage_by_code = {step["accessionCode"]: step for step in body["lineage"]}
    assert lineage_by_code["PO-BLU-G1-002"]["fromVesselNo"] is None


# ---------------------------------------------------------------------------
# Token case-insensitivity (spec §5.2 rule 6)
# ---------------------------------------------------------------------------


def test_lowercase_and_uppercase_token_both_resolve(client: TestClient, fake_db: _FakeGeneticsDB) -> None:
    accession = _make_accession(publicToken="ABCDEFGH12")
    fake_db.seed(ACCESSIONS, [model_to_doc(accession, ACCESSION_ID_KEY)])

    upper_resp = client.get("/i/ABCDEFGH12")
    lower_resp = client.get("/i/abcdefgh12")
    mixed_resp = client.get("/i/AbCdEfGh12")

    for resp in (upper_resp, lower_resp, mixed_resp):
        assert resp.status_code == 200, resp.text
        assert resp.json()["accessionCode"] == accession.accessionCode


# ---------------------------------------------------------------------------
# Reachability with no auth header
# ---------------------------------------------------------------------------


def test_reachable_with_no_authorization_header(client: TestClient, fake_db: _FakeGeneticsDB) -> None:
    accession = _make_accession(publicToken="NOAUTHTOK1")
    fake_db.seed(ACCESSIONS, [model_to_doc(accession, ACCESSION_ID_KEY)])

    # TestClient sends no Authorization header unless one is explicitly set
    # — this is the whole point of the assertion, made explicit rather than
    # merely implicit in every other test's setup.
    resp = client.get(f"/i/{accession.publicToken}", headers={})
    assert "authorization" not in {h.lower() for h in resp.request.headers.keys()}
    assert resp.status_code == 200
    assert resp.json()["accessionCode"] == accession.accessionCode


# ---------------------------------------------------------------------------
# Rate limiting — dependency exercised directly (spec §5.2 rule 2)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_rate_limit_blocks_the_31st_request_in_a_minute() -> None:
    # The Redis-backed sliding window is real infrastructure (this route's
    # limiter deliberately reuses it — see enforce_public_rate_limit's
    # docstring), so its state outlives a single test process. A fixed IP
    # would collide with whatever count a previous run in the same 60s
    # window left behind; a fresh IP per invocation keeps this test
    # re-runnable.
    import uuid

    # Not a real IP shape — `_client_ip` just returns `request.client.host`
    # verbatim as the rate-limit key's suffix, so a UUID is just as valid a
    # "caller identity" here and gives a far larger, collision-free space
    # than faking an IPv4 octet.
    fake_request = SimpleNamespace(
        headers={},
        client=SimpleNamespace(host=f"test-{uuid.uuid4()}"),
    )

    for _ in range(30):
        await public_module.enforce_public_rate_limit(fake_request)  # type: ignore[arg-type]

    with pytest.raises(HTTPException) as exc_info:
        await public_module.enforce_public_rate_limit(fake_request)  # type: ignore[arg-type]

    assert exc_info.value.status_code == 429
    assert exc_info.value.headers["Cache-Control"] == "no-store"
