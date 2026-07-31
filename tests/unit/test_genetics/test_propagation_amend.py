"""
Unit tests for T-808 — amend a propagation event's recorded date.

The bug/gap this closes: propagation events were immutable by construction
(only GET/POST existed on the route). User decision, verbatim: "no need to
edit who, just when" — so ``performedAt`` becomes correctable but
``operatorName``/``performedBy`` (attribution) and the structural fields
(``method``, ``parents``, ``targets``, ``resultAccessionIds``, generations,
``reproductionMode``) never are.

The coherence trap: ``performedAt`` at propagation time becomes
``Accession.acquiredAt`` on every result accession, and that field is what
gets printed on the physical label. Amending only the event would leave the
event, its children and already-printed labels disagreeing three ways. The
fix must cascade ``acquiredAt`` to every result accession — but ONLY where
that accession's ``acquiredAt`` still equals the event's OLD ``performedAt``;
an accession diverged by hand must survive untouched.

No live database — a small fake Motor-collection double covering find_one /
update_one / update_many, matching the style already used by
``test_line_purge.py`` (no mongomock in requirements.txt).

Test cases:
   1.  amending performedAt updates the event's performedAt
   2.  amending performedAt cascades acquiredAt to every result accession
       whose date still equals the OLD performedAt
   3.  a diverged accession's acquiredAt is left untouched and reported as
       skipped, while others are still updated
   4.  amendedAt / amendedBy are set on the amended event
   5.  a future performedAt is rejected with 400
   6.  amend_event does not accept/alter structural fields — PropagationAmend
       has no method/parents/targets/operatorName/performedBy field at all,
       so wiring them through this route is impossible by construction, and
       the event's structural fields are unchanged after an amendment
   7.  amend 404s for an unknown event id
   8.  permission: bench role ("user") is allowed genetics.edit; guest is
       rejected
"""

from __future__ import annotations

from datetime import datetime, timedelta
from types import SimpleNamespace
from typing import Any, Dict, List, Optional

import pytest
from fastapi import HTTPException

from src.modules.genetics.middleware.auth import require_permission
from src.modules.genetics.models.enums import PropagationMethod, ReproductionMode
from src.modules.genetics.models.propagation import PropagationAmend, PropagationEvent
from src.modules.genetics.services.common import model_to_doc
from src.modules.genetics.services.database import ACCESSIONS, PROPAGATIONS
from src.modules.genetics.services.propagation import (
    propagation_service as propagation_module,
)
from src.modules.genetics.services.propagation.propagation_service import (
    PropagationService,
)

_EVENT_ID_KEY = "eventId"
_ACCESSION_ID_KEY = "accessionId"


# ---------------------------------------------------------------------------
# Generic Motor-collection-shaped fake (mirrors test_line_purge.py), extended
# with update_many since amend_event's cascade needs it.
# ---------------------------------------------------------------------------


def _matches(doc: Dict[str, Any], query: Dict[str, Any]) -> bool:
    for key, expected in query.items():
        actual = doc.get(key)
        if isinstance(expected, dict) and "$in" in expected:
            if actual not in expected["$in"]:
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

    async def update_one(self, query: Dict[str, Any], update: Dict[str, Any]) -> SimpleNamespace:
        for doc in self.docs:
            if _matches(doc, query):
                doc.update(update.get("$set", {}))
                return SimpleNamespace(matched_count=1, modified_count=1)
        return SimpleNamespace(matched_count=0, modified_count=0)

    async def update_many(self, query: Dict[str, Any], update: Dict[str, Any]) -> SimpleNamespace:
        # Mirrors real MongoDB semantics: matched_count counts every filter
        # hit; modified_count only counts documents whose stored value
        # actually changed. A $set to a value equal to what's already there
        # matches but does not modify — this distinction is exactly what
        # amend_event's "updated" count must key off (matched_count), not
        # modified_count, or a same-value re-amend gets mislabelled as a
        # skipped/diverged accession.
        matched = 0
        modified = 0
        set_fields = update.get("$set", {})
        for doc in self.docs:
            if _matches(doc, query):
                matched += 1
                if any(doc.get(k) != v for k, v in set_fields.items()):
                    modified += 1
                doc.update(set_fields)
        return SimpleNamespace(matched_count=matched, modified_count=modified)


class _FakeGeneticsDB:
    def __init__(self) -> None:
        self._collections: Dict[str, _FakeCollection] = {}

    def seed(self, name: str, docs: List[Dict[str, Any]]) -> None:
        self._collections[name] = _FakeCollection(docs)

    def __getitem__(self, name: str) -> _FakeCollection:
        return self._collections.setdefault(name, _FakeCollection())


@pytest.fixture
def fake_db(monkeypatch: pytest.MonkeyPatch) -> _FakeGeneticsDB:
    db = _FakeGeneticsDB()
    monkeypatch.setattr(propagation_module.genetics_db, "get_database", lambda: db)
    return db


class _User:
    def __init__(self, role: str = "user", user_id: str = "u-amend-test"):
        self.role = role
        self.userId = user_id
        self.divisionId = None
        self.organizationId = None


OLD_DATE = datetime(2026, 7, 21, 9, 0, 0)
NEW_DATE = datetime(2026, 7, 25, 9, 0, 0)


def _make_event(**overrides: Any) -> PropagationEvent:
    defaults: Dict[str, Any] = dict(
        method=PropagationMethod.AGAR_TO_AGAR,
        reproductionMode=ReproductionMode.ASEXUAL,
        performedAt=OLD_DATE,
        resultAccessionIds=["a-1", "a-2"],
    )
    defaults.update(overrides)
    return PropagationEvent(**defaults)


def _seed_event(db: _FakeGeneticsDB, event: PropagationEvent) -> None:
    db.seed(PROPAGATIONS, [model_to_doc(event, _EVENT_ID_KEY)])


def _seed_accessions(db: _FakeGeneticsDB, docs: List[Dict[str, Any]]) -> None:
    db.seed(ACCESSIONS, docs)


# ---------------------------------------------------------------------------
# 1. Amending performedAt updates the event
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_amend_updates_event_performed_at(fake_db: _FakeGeneticsDB) -> None:
    event = _make_event(resultAccessionIds=[])
    _seed_event(fake_db, event)

    updated_event, updated, skipped = await PropagationService.amend_event(
        event.id, PropagationAmend(performedAt=NEW_DATE), _User()
    )

    assert updated_event.performedAt == NEW_DATE
    assert updated == 0
    assert skipped == 0


# ---------------------------------------------------------------------------
# 2. Cascades acquiredAt to every result accession still at the OLD date
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_amend_cascades_to_all_accessions_at_old_date(fake_db: _FakeGeneticsDB) -> None:
    event = _make_event(resultAccessionIds=["a-1", "a-2"])
    _seed_event(fake_db, event)
    _seed_accessions(
        fake_db,
        [
            {_ACCESSION_ID_KEY: "a-1", "acquiredAt": OLD_DATE},
            {_ACCESSION_ID_KEY: "a-2", "acquiredAt": OLD_DATE},
        ],
    )

    _updated_event, updated, skipped = await PropagationService.amend_event(
        event.id, PropagationAmend(performedAt=NEW_DATE), _User()
    )

    assert updated == 2
    assert skipped == 0
    acc1 = await fake_db[ACCESSIONS].find_one({_ACCESSION_ID_KEY: "a-1"})
    acc2 = await fake_db[ACCESSIONS].find_one({_ACCESSION_ID_KEY: "a-2"})
    assert acc1["acquiredAt"] == NEW_DATE
    assert acc2["acquiredAt"] == NEW_DATE


# ---------------------------------------------------------------------------
# 3. A diverged accession is left untouched and reported as skipped
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_amend_skips_accession_already_diverged_by_hand(fake_db: _FakeGeneticsDB) -> None:
    diverged_date = datetime(2026, 6, 1, 0, 0, 0)
    event = _make_event(resultAccessionIds=["a-1", "a-2"])
    _seed_event(fake_db, event)
    _seed_accessions(
        fake_db,
        [
            {_ACCESSION_ID_KEY: "a-1", "acquiredAt": OLD_DATE},
            # a-2 was already corrected by hand to a date that differs from
            # the event's old performedAt — must NOT be overwritten.
            {_ACCESSION_ID_KEY: "a-2", "acquiredAt": diverged_date},
        ],
    )

    _updated_event, updated, skipped = await PropagationService.amend_event(
        event.id, PropagationAmend(performedAt=NEW_DATE), _User()
    )

    assert updated == 1
    assert skipped == 1

    acc1 = await fake_db[ACCESSIONS].find_one({_ACCESSION_ID_KEY: "a-1"})
    acc2 = await fake_db[ACCESSIONS].find_one({_ACCESSION_ID_KEY: "a-2"})
    assert acc1["acquiredAt"] == NEW_DATE
    # Untouched — still the deliberately-diverged date, not NEW_DATE and not
    # even reverted to OLD_DATE.
    assert acc2["acquiredAt"] == diverged_date


# ---------------------------------------------------------------------------
# 3b. Re-amending to the SAME date must not be mislabelled as "skipped"
#
# MongoDB's update_many modified_count is 0 when a $set doesn't change the
# stored value — e.g. re-submitting an identical correction. That must not
# be conflated with "this accession had already diverged"; the accession did
# match the old date and was legitimately cascaded (a no-op cascade, but a
# cascade). Caught live: PATCHing the same event twice with the same new
# date reported accessionsSkipped=1 for an accession that had not diverged
# at all, before this was fixed to key off matched_count.
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_reamending_to_the_same_date_is_reported_as_updated_not_skipped(
    fake_db: _FakeGeneticsDB,
) -> None:
    event = _make_event(resultAccessionIds=["a-1"])
    _seed_event(fake_db, event)
    _seed_accessions(fake_db, [{_ACCESSION_ID_KEY: "a-1", "acquiredAt": OLD_DATE}])

    # First amendment: a genuine change, must cascade.
    _e1, updated1, skipped1 = await PropagationService.amend_event(
        event.id, PropagationAmend(performedAt=NEW_DATE), _User()
    )
    assert updated1 == 1
    assert skipped1 == 0

    # Second amendment to the identical date: MongoDB will report
    # modified_count=0 for the accession (no bits changed), but it DID match
    # the (now current) old date and must be reported as updated, not
    # skipped — it never diverged.
    _e2, updated2, skipped2 = await PropagationService.amend_event(
        event.id, PropagationAmend(performedAt=NEW_DATE), _User()
    )
    assert updated2 == 1
    assert skipped2 == 0


# ---------------------------------------------------------------------------
# 4. amendedAt / amendedBy are set
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_amend_stamps_amended_at_and_amended_by(fake_db: _FakeGeneticsDB) -> None:
    event = _make_event(resultAccessionIds=[])
    _seed_event(fake_db, event)
    user = _User(user_id="tech-42")

    before = datetime.utcnow()
    updated_event, _updated, _skipped = await PropagationService.amend_event(
        event.id, PropagationAmend(performedAt=NEW_DATE), user
    )
    after = datetime.utcnow()

    assert updated_event.amendedBy == "tech-42"
    assert updated_event.amendedAt is not None
    assert before <= updated_event.amendedAt <= after


@pytest.mark.asyncio
async def test_amended_at_is_none_before_any_amendment(fake_db: _FakeGeneticsDB) -> None:
    event = _make_event(resultAccessionIds=[])
    _seed_event(fake_db, event)

    fetched = await PropagationService.get_event(event.id)
    assert fetched.amendedAt is None
    assert fetched.amendedBy is None


# ---------------------------------------------------------------------------
# 5. Future date rejected
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_amend_rejects_future_performed_at(fake_db: _FakeGeneticsDB) -> None:
    event = _make_event(resultAccessionIds=[])
    _seed_event(fake_db, event)
    future = datetime.utcnow() + timedelta(days=1)

    with pytest.raises(HTTPException) as exc:
        await PropagationService.amend_event(
            event.id, PropagationAmend(performedAt=future), _User()
        )

    assert exc.value.status_code == 400
    assert "future" in exc.value.detail.lower()

    # Refused, not partially applied — the event's date must be unchanged.
    still_there = await PropagationService.get_event(event.id)
    assert still_there.performedAt == OLD_DATE
    assert still_there.amendedAt is None


# ---------------------------------------------------------------------------
# 6. Structural fields and attribution cannot be changed through this route
# ---------------------------------------------------------------------------


def test_propagation_amend_model_has_no_structural_or_attribution_fields() -> None:
    """PropagationAmend must carry exactly one field — performedAt. Any of
    method/parents/targets/resultAccessionIds/operatorName/performedBy
    slipping into the model would be a route someone could wire up later to
    rewrite lineage or attribution; assert the model shape forbids it."""
    fields = set(PropagationAmend.model_fields.keys())
    assert fields == {"performedAt"}


def test_propagation_amend_rejects_unknown_fields_like_method_or_operator() -> None:
    """Pydantic v2 BaseModel ignores extra fields by default unless
    forbidden, but the model simply not declaring them means they cannot
    reach the service layer at all — this pins that down for the fields an
    attacker/careless caller is most likely to try."""
    # These extra keys are silently dropped (not stored on the model at all,
    # since PropagationAmend does not declare them) — proving the payload
    # cannot smuggle a structural or attribution change through.
    amend = PropagationAmend(
        performedAt=NEW_DATE,
        method="cutting",  # type: ignore[call-arg]
        operatorName="Someone Else",  # type: ignore[call-arg]
        performedBy="other-user",  # type: ignore[call-arg]
        parents=[{"accessionId": "should-not-exist"}],  # type: ignore[call-arg]
    )
    assert not hasattr(amend, "method")
    assert not hasattr(amend, "operatorName")
    assert not hasattr(amend, "performedBy")
    assert not hasattr(amend, "parents")
    assert amend.model_dump() == {"performedAt": NEW_DATE}


@pytest.mark.asyncio
async def test_amend_leaves_structural_fields_and_attribution_untouched(
    fake_db: _FakeGeneticsDB,
) -> None:
    event = _make_event(
        method=PropagationMethod.AGAR_TO_AGAR,
        reproductionMode=ReproductionMode.ASEXUAL,
        parents=[],
        resultAccessionIds=["a-1"],
        performedBy="original-tech",
        operatorName="Original Tech",
    )
    _seed_event(fake_db, event)
    _seed_accessions(fake_db, [{_ACCESSION_ID_KEY: "a-1", "acquiredAt": OLD_DATE}])

    updated_event, _updated, _skipped = await PropagationService.amend_event(
        event.id,
        PropagationAmend(performedAt=NEW_DATE),
        _User(user_id="different-tech"),
    )

    # The date changed...
    assert updated_event.performedAt == NEW_DATE
    # ...but attribution and structure did not, even though a different user
    # performed the amendment.
    assert updated_event.performedBy == "original-tech"
    assert updated_event.operatorName == "Original Tech"
    assert updated_event.method == PropagationMethod.AGAR_TO_AGAR
    assert updated_event.reproductionMode == ReproductionMode.ASEXUAL
    assert updated_event.parents == []
    assert updated_event.resultAccessionIds == ["a-1"]


# ---------------------------------------------------------------------------
# 7. 404 for an unknown event
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_amend_404s_for_unknown_event(fake_db: _FakeGeneticsDB) -> None:
    with pytest.raises(HTTPException) as exc:
        await PropagationService.amend_event(
            "does-not-exist", PropagationAmend(performedAt=NEW_DATE), _User()
        )
    assert exc.value.status_code == 404


# ---------------------------------------------------------------------------
# 8. Permission — genetics.edit (bench tier)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_bench_role_is_allowed_amend_permission() -> None:
    checker = require_permission("genetics.edit")
    user = _User("user")
    assert await checker(current_user=user) is user


@pytest.mark.asyncio
async def test_guest_role_is_rejected_from_amend_permission() -> None:
    checker = require_permission("genetics.edit")
    with pytest.raises(HTTPException) as exc:
        await checker(current_user=_User("guest"))
    assert exc.value.status_code == 403
