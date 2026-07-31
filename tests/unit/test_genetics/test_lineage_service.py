"""
Unit tests for the lineage graph's split-edge traversal (LineageService).

Bug this closes: ``AccessionService.split_accession`` copies ``source.parents``
verbatim onto the split-off child (correct — a split is the same material, no
new generation) but that makes the child a SIBLING of the batch it physically
came from, sharing the same grandparent, rather than a child of it. Before
this fix, ``LineageService._collect_around`` only ever walked propagation
edges (``parents[].accessionId``), so a split-off record was reachable from
neither direction: a batch's own split-off children never appeared in its
descendant walk, and a split-off child's own ancestor walk never reached the
batch it came from. ``splitFromAccessionId`` recorded the true relationship
on the document the whole time; nothing treated it as a graph edge.

These fixtures deliberately mirror ``AccessionService.split_accession``'s
real output — the split child's ``parents`` list is copied verbatim from the
source (i.e. it points at the shared grandparent, NOT at the source/batch
itself) — which is what makes the bug reproducible here. (Contrast with
``test_public_route.py``'s own split fixtures, which additionally give the
child an explicit ``ParentRef`` to the batch — a stronger, non-representative
shape that happens to already work via the ordinary propagation walk.)

No live database — the same generic Motor-collection-shaped fake used by
``test_public_route.py`` (no mongomock in requirements.txt).
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

import pytest

from src.modules.genetics.models.accession import Accession, ParentRef
from src.modules.genetics.models.enums import ParentRole, VesselForm
from src.modules.genetics.services.common import model_to_doc
from src.modules.genetics.services.database import ACCESSIONS
from src.modules.genetics.services.lineage import lineage_service as lineage_module
from src.modules.genetics.services.lineage.lineage_service import LineageService

_ACCESSION_ID_KEY = "accessionId"


# ---------------------------------------------------------------------------
# Generic Motor-collection-shaped fake (mirrors test_public_route.py)
# ---------------------------------------------------------------------------


def _resolve_dotted(doc: Any, dotted_key: str) -> List[Any]:
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
        form=VesselForm.PETRI_DISH,
        quantity=8,
        unit="plates",
        cloneGeneration=3,
        labelledVesselCount=8,
    )
    defaults.update(overrides)
    return Accession(**defaults)


@pytest.fixture
def fake_db(monkeypatch: pytest.MonkeyPatch) -> _FakeGeneticsDB:
    db = _FakeGeneticsDB()
    # genetics_db is a shared singleton — patching it via any module that
    # imported the name (lineage_service's own import here) covers every
    # other service (accession_service, line_service, ...) that also calls
    # `genetics_db.get_database()`, since they all hold the same object.
    monkeypatch.setattr(lineage_module.genetics_db, "get_database", lambda: db)
    return db


def _seed(db: _FakeGeneticsDB, *accessions: Accession) -> None:
    db.seed(ACCESSIONS, [model_to_doc(a, _ACCESSION_ID_KEY) for a in accessions])


# ---------------------------------------------------------------------------
# Split visibility — the bug itself
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_split_off_child_appears_in_batchs_descendant_graph(fake_db: _FakeGeneticsDB) -> None:
    """The reported bug, reproduced directly: scan the batch (`source`), and
    its split-off child (created exactly the way `split_accession` creates
    it — `parents` copied verbatim from `source`, so it points at the shared
    grandparent, never at `source` itself) must now show up, connected by a
    `kind="split"` edge."""
    grandparent = _make_accession(accessionCode="PO-BLU-G0-001", cloneGeneration=0)
    source = _make_accession(
        accessionCode="PO-BLU-G3-001",
        parents=[ParentRef(accessionId=grandparent.id, role=ParentRole.CLONE_SOURCE, lineId=grandparent.lineId)],
        quantity=7,
    )
    split_child = _make_accession(
        accessionCode="PO-BLU-G3-003",
        # Verbatim copy of source.parents, per split_accession — NOT a
        # ParentRef to `source`.
        parents=list(source.parents),
        splitFromAccessionId=source.id,
        quantity=1,
    )
    _seed(fake_db, grandparent, source, split_child)

    graph = await LineageService.build_graph(
        root_accession_id=source.id, include_ancestors=True, include_descendants=True
    )

    node_ids = {n.accessionId for n in graph.nodes}
    assert split_child.id in node_ids, "split-off child must appear in the batch's own lineage graph"

    split_edges = [e for e in graph.edges if e.kind == "split"]
    assert len(split_edges) == 1
    assert split_edges[0].fromAccessionId == source.id
    assert split_edges[0].toAccessionId == split_child.id
    assert graph.truncated is False


@pytest.mark.asyncio
async def test_scanning_from_split_off_child_reaches_the_batch(fake_db: _FakeGeneticsDB) -> None:
    """The other direction: a tech who scans the split-off child's own label
    must be able to reach the batch it came from — the same batch that, in
    the reported bug, plate #3 could never see plate #2's contamination on."""
    grandparent = _make_accession(accessionCode="PO-BLU-G0-001", cloneGeneration=0)
    source = _make_accession(
        accessionCode="PO-BLU-G3-001",
        parents=[ParentRef(accessionId=grandparent.id, role=ParentRole.CLONE_SOURCE, lineId=grandparent.lineId)],
        quantity=7,
    )
    split_child = _make_accession(
        accessionCode="PO-BLU-G3-003",
        parents=list(source.parents),
        splitFromAccessionId=source.id,
        quantity=1,
    )
    _seed(fake_db, grandparent, source, split_child)

    graph = await LineageService.build_graph(
        root_accession_id=split_child.id, include_ancestors=True, include_descendants=True
    )

    node_ids = {n.accessionId for n in graph.nodes}
    assert source.id in node_ids, "scanning the split-off child must reach the batch it came from"
    # The shared grandparent is reachable too, via the ordinary propagation
    # walk on split_child.parents — unaffected by this fix, asserted here
    # only to confirm the split hop didn't crowd it out.
    assert grandparent.id in node_ids

    split_edges = [e for e in graph.edges if e.kind == "split"]
    assert len(split_edges) == 1
    assert split_edges[0].fromAccessionId == source.id
    assert split_edges[0].toAccessionId == split_child.id


# ---------------------------------------------------------------------------
# Propagation edges are unaffected
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_ordinary_propagation_edge_is_still_kind_propagation(fake_db: _FakeGeneticsDB) -> None:
    parent = _make_accession(accessionCode="PO-BLU-G2-001", cloneGeneration=2)
    child = _make_accession(
        accessionCode="PO-BLU-G3-002",
        parents=[ParentRef(accessionId=parent.id, role=ParentRole.CLONE_SOURCE, lineId=parent.lineId)],
    )
    _seed(fake_db, parent, child)

    graph = await LineageService.build_graph(
        root_accession_id=parent.id, include_ancestors=True, include_descendants=True
    )

    assert len(graph.edges) == 1
    assert graph.edges[0].kind == "propagation"
    assert graph.edges[0].fromAccessionId == parent.id
    assert graph.edges[0].toAccessionId == child.id


# ---------------------------------------------------------------------------
# Caps — a split hop is not a separate budget
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_split_hop_counts_toward_the_depth_cap(fake_db: _FakeGeneticsDB) -> None:
    """batch -> split child (hop 1) -> that child's own propagation child
    (hop 2). Capping max_depth=1 must surface the split child but not the
    grandchild beyond it — the split hop consumed the one hop the cap
    allowed, exactly like a propagation hop would."""
    source = _make_accession(accessionCode="PO-BLU-G3-001")
    split_child = _make_accession(
        accessionCode="PO-BLU-G3-003",
        parents=list(source.parents),
        splitFromAccessionId=source.id,
    )
    beyond_cap = _make_accession(
        accessionCode="PO-BLU-G4-001",
        cloneGeneration=4,
        parents=[ParentRef(accessionId=split_child.id, role=ParentRole.CLONE_SOURCE, lineId=split_child.lineId)],
    )
    _seed(fake_db, source, split_child, beyond_cap)

    graph = await LineageService.build_graph(
        root_accession_id=source.id,
        include_ancestors=False,
        include_descendants=True,
        max_depth=1,
    )

    node_ids = {n.accessionId for n in graph.nodes}
    assert split_child.id in node_ids
    assert beyond_cap.id not in node_ids, "the split hop must count against the depth cap, not sit outside it"
    assert graph.truncated is False, "stopping at the depth cap is not the same as hitting the node cap"


@pytest.mark.asyncio
async def test_split_hop_counts_toward_the_node_cap(
    fake_db: _FakeGeneticsDB, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Several split-off children of the same batch must still respect
    MAX_LINEAGE_NODES — a wide split fan-out is exactly the same kind of
    blowup risk the existing propagation-child cap already guards against."""
    monkeypatch.setattr(lineage_module.settings, "MAX_LINEAGE_NODES", 2)

    source = _make_accession(accessionCode="PO-BLU-G3-001")
    children = [
        _make_accession(
            accessionCode=f"PO-BLU-G3-{100 + i}",
            parents=list(source.parents),
            splitFromAccessionId=source.id,
            quantity=1,
        )
        for i in range(5)
    ]
    _seed(fake_db, source, *children)

    graph = await LineageService.build_graph(
        root_accession_id=source.id, include_ancestors=False, include_descendants=True
    )

    assert len(graph.nodes) <= 2
    assert graph.truncated is True
