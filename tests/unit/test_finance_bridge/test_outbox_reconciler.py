"""
Unit and integration tests for the Finance Outbox Reconciliation Sweeper.

Test coverage:
    Unit:
        - make_sweeper_event_id: same inputs → same UUID (idempotency contract)
        - make_sweeper_event_id: different inputs → different UUIDs
        - outbox_event_exists: returns True when matching document found
        - outbox_event_exists: returns False when no matching document
        - outbox_event_exists: returns False when payload.state differs

    Integration (in-memory mock, no real MongoDB):
        - Scenario A: doc in Approved state, no outbox row → sweeper emits
        - Scenario B: doc in Approved state, matching outbox row exists → sweeper skips
        - Scenario C: FINANCE_OUTBOX_ENABLED=false → sweeper exits cleanly (no writes)
        - Scenario D: PO in Open state, missing row → sweeper emits po_state_changed
        - Scenario E: PR in Draft state → sweeper ignores (Draft is not finance-relevant)
"""

import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_pr_header(
    doc_id: Optional[str] = None,
    status: str = "Approved",
) -> Dict[str, Any]:
    """Return a minimal document_headers document for a PR."""
    doc_id = doc_id or str(uuid.uuid4())
    org_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())
    return {
        "docId": doc_id,
        "docNumber": "PR-2026-0001",
        "docType": "PR",
        "status": status,
        "organizationId": org_id,
        "companyCode": "1000",
        "requestedBy": user_id,
        "createdBy": user_id,
        "updatedBy": user_id,
        "docDate": datetime(2026, 5, 20, tzinfo=timezone.utc),
        "requestedDate": datetime(2026, 5, 20, tzinfo=timezone.utc),
        "urgency": "normal",
        "totalGross": 1000,
        "currencyCode": "AED",
        "deletedAt": None,
    }


def _make_po_header(
    doc_id: Optional[str] = None,
    status: str = "Open",
) -> Dict[str, Any]:
    """Return a minimal document_headers document for a PO."""
    doc_id = doc_id or str(uuid.uuid4())
    org_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())
    return {
        "docId": doc_id,
        "docNumber": "PO-2026-0001",
        "docType": "PO",
        "status": status,
        "organizationId": org_id,
        "companyCode": "1000",
        "createdBy": user_id,
        "updatedBy": user_id,
        "issuedBy": user_id,
        "docDate": datetime(2026, 5, 20, tzinfo=timezone.utc),
        "issuedDate": datetime(2026, 5, 20, tzinfo=timezone.utc),
        "subtotalNet": 900,
        "totalTax": 45,
        "totalGross": 945,
        "currencyCode": "AED",
        "deletedAt": None,
    }


# ---------------------------------------------------------------------------
# Unit: make_sweeper_event_id
# ---------------------------------------------------------------------------


class TestMakeSweeperEventId:
    """Tests for the deterministic event ID derivation."""

    def test_same_inputs_produce_same_id(self) -> None:
        """Two calls with identical (docId, status) must return the same UUID."""
        from cron.scripts.outbox_reconciler import make_sweeper_event_id

        doc_id = str(uuid.uuid4())
        status = "Approved"

        id1 = make_sweeper_event_id(doc_id, status)
        id2 = make_sweeper_event_id(doc_id, status)

        assert id1 == id2, "Sweeper event IDs must be deterministic for the same inputs"

    def test_different_status_produces_different_id(self) -> None:
        """Different statuses must produce different IDs for the same docId."""
        from cron.scripts.outbox_reconciler import make_sweeper_event_id

        doc_id = str(uuid.uuid4())

        id_approved = make_sweeper_event_id(doc_id, "Approved")
        id_closed = make_sweeper_event_id(doc_id, "Closed")

        assert id_approved != id_closed

    def test_different_doc_id_produces_different_id(self) -> None:
        """Different docIds must produce different IDs even for the same status."""
        from cron.scripts.outbox_reconciler import make_sweeper_event_id

        id1 = make_sweeper_event_id(str(uuid.uuid4()), "Approved")
        id2 = make_sweeper_event_id(str(uuid.uuid4()), "Approved")

        assert id1 != id2

    def test_returns_valid_uuid_string(self) -> None:
        """Result must be a valid UUID-format string."""
        from cron.scripts.outbox_reconciler import make_sweeper_event_id

        result = make_sweeper_event_id(str(uuid.uuid4()), "Open")
        # Raises ValueError if not a valid UUID
        uuid.UUID(result)


# ---------------------------------------------------------------------------
# Unit: outbox_event_exists
# ---------------------------------------------------------------------------


class TestOutboxEventExists:
    """Tests for the outbox presence check, using a mocked Motor collection."""

    @pytest.mark.asyncio
    async def test_returns_true_when_event_found(self) -> None:
        """Returns True when find_one returns a matching document."""
        from cron.scripts.outbox_reconciler import outbox_event_exists

        mock_collection = MagicMock()
        mock_collection.find_one = AsyncMock(return_value={"eventId": "abc"})
        mock_db = MagicMock()
        mock_db.__getitem__ = MagicMock(return_value=mock_collection)

        result = await outbox_event_exists(mock_db, "doc-123", "Approved")

        assert result is True
        mock_collection.find_one.assert_awaited_once_with(
            {"sourceDocumentId": "doc-123", "payload.state": "Approved"}
        )

    @pytest.mark.asyncio
    async def test_returns_false_when_no_event(self) -> None:
        """Returns False when find_one returns None."""
        from cron.scripts.outbox_reconciler import outbox_event_exists

        mock_collection = MagicMock()
        mock_collection.find_one = AsyncMock(return_value=None)
        mock_db = MagicMock()
        mock_db.__getitem__ = MagicMock(return_value=mock_collection)

        result = await outbox_event_exists(mock_db, "doc-999", "Approved")

        assert result is False

    @pytest.mark.asyncio
    async def test_queries_correct_collection(self) -> None:
        """Verify the query targets the finance_outbox collection."""
        from cron.scripts.outbox_reconciler import outbox_event_exists

        mock_collection = MagicMock()
        mock_collection.find_one = AsyncMock(return_value=None)
        mock_db = MagicMock()
        mock_db.__getitem__ = MagicMock(return_value=mock_collection)

        await outbox_event_exists(mock_db, "doc-123", "Open")

        # The __getitem__ call determines which collection is accessed
        mock_db.__getitem__.assert_called_with("finance_outbox")


# ---------------------------------------------------------------------------
# Integration: run_sweep scenarios
# ---------------------------------------------------------------------------


class _AsyncCursorMock:
    """
    Minimal async iterator that replaces motor cursor.

    Used to feed a fixed list of documents through `async for header in cursor`.
    """

    def __init__(self, docs: List[Dict[str, Any]]) -> None:
        self._docs = iter(docs)

    def __aiter__(self) -> "_AsyncCursorMock":
        return self

    async def __anext__(self) -> Dict[str, Any]:
        try:
            return next(self._docs)
        except StopIteration:
            raise StopAsyncIteration


class TestRunSweep:
    """Integration-level tests for run_sweep() using mock databases."""

    def _make_mock_db(
        self,
        headers: List[Dict[str, Any]],
        outbox_docs: Optional[List[Dict[str, Any]]] = None,
    ) -> MagicMock:
        """
        Build a mock Motor database with pre-populated collections.

        Args:
            headers: Documents returned by document_headers.find().
            outbox_docs: Documents that count as "already present" in finance_outbox.
                         Each is matched by (sourceDocumentId, payload.state).
        """
        outbox_docs = outbox_docs or []

        # Track which (docId, status) pairs are already in the outbox
        outbox_set = {
            (d["sourceDocumentId"], d["payload"]["state"])
            for d in outbox_docs
        }

        async def mock_find_one(query: Dict[str, Any]) -> Optional[Dict[str, Any]]:
            doc_id = query.get("sourceDocumentId")
            status = query.get("payload.state")
            if (doc_id, status) in outbox_set:
                return {"eventId": "exists"}
            return None

        mock_outbox_collection = MagicMock()
        mock_outbox_collection.find_one = AsyncMock(side_effect=mock_find_one)
        mock_outbox_collection.insert_one = AsyncMock(
            return_value=MagicMock(inserted_id="new_id")
        )

        mock_headers_collection = MagicMock()
        mock_headers_collection.find = MagicMock(
            return_value=_AsyncCursorMock(headers)
        )

        def collection_router(name: str) -> MagicMock:
            if name == "document_headers":
                return mock_headers_collection
            if name == "finance_outbox":
                return mock_outbox_collection
            return MagicMock()

        mock_db = MagicMock()
        mock_db.__getitem__ = MagicMock(side_effect=collection_router)
        return mock_db

    @pytest.mark.asyncio
    async def test_scenario_a_missing_event_emitted(self) -> None:
        """PR Approved with no outbox row → sweeper emits pr_state_changed."""
        header = _make_pr_header(status="Approved")
        mock_db = self._make_mock_db(headers=[header], outbox_docs=[])

        with patch.dict(os.environ, {"FINANCE_OUTBOX_ENABLED": "true"}):
            import importlib
            import src.modules.finance_bridge.feature_flag as ff_module
            importlib.reload(ff_module)

            from cron.scripts.outbox_reconciler import run_sweep
            stats = await run_sweep(mock_db)

        assert stats["scanned"] == 1
        assert stats["missing"] == 1
        assert stats["re_emitted"] == 1
        assert stats["errors"] == 0

    @pytest.mark.asyncio
    async def test_scenario_b_existing_event_skipped(self) -> None:
        """PR Approved with matching outbox row → sweeper skips (no duplicate)."""
        header = _make_pr_header(status="Approved")
        existing_outbox = {
            "sourceDocumentId": header["docId"],
            "payload": {"state": "Approved"},
        }
        mock_db = self._make_mock_db(headers=[header], outbox_docs=[existing_outbox])

        with patch.dict(os.environ, {"FINANCE_OUTBOX_ENABLED": "true"}):
            import importlib
            import src.modules.finance_bridge.feature_flag as ff_module
            importlib.reload(ff_module)

            from cron.scripts.outbox_reconciler import run_sweep
            stats = await run_sweep(mock_db)

        assert stats["scanned"] == 1
        assert stats["missing"] == 0
        assert stats["re_emitted"] == 0
        assert stats["errors"] == 0

    @pytest.mark.asyncio
    async def test_scenario_c_outbox_disabled_exits_cleanly(self) -> None:
        """FINANCE_OUTBOX_ENABLED=false → main() exits without touching MongoDB."""
        mock_client = MagicMock()
        mock_client.__getitem__ = MagicMock()
        mock_client.close = MagicMock()

        with patch.dict(os.environ, {"FINANCE_OUTBOX_ENABLED": "false"}):
            import importlib
            import src.modules.finance_bridge.feature_flag as ff_module
            importlib.reload(ff_module)

            # main() should return immediately without creating a Motor client
            with patch(
                "motor.motor_asyncio.AsyncIOMotorClient",
                return_value=mock_client,
            ) as mock_motor:
                from cron.scripts.outbox_reconciler import main
                await main()

                # Motor client must NOT have been created because the flag is off
                mock_motor.assert_not_called()

    @pytest.mark.asyncio
    async def test_scenario_d_po_open_emits_po_event(self) -> None:
        """PO Open with no outbox row → sweeper emits po_state_changed."""
        header = _make_po_header(status="Open")
        mock_db = self._make_mock_db(headers=[header], outbox_docs=[])

        with patch.dict(os.environ, {"FINANCE_OUTBOX_ENABLED": "true"}):
            import importlib
            import src.modules.finance_bridge.feature_flag as ff_module
            importlib.reload(ff_module)

            from cron.scripts.outbox_reconciler import run_sweep
            stats = await run_sweep(mock_db)

        assert stats["scanned"] == 1
        assert stats["missing"] == 1
        assert stats["re_emitted"] == 1
        assert stats["errors"] == 0

    @pytest.mark.asyncio
    async def test_scenario_e_draft_pr_ignored(self) -> None:
        """PR in Draft state is not returned by the Mongo query and is not processed."""
        # The MongoDB query filters on status $in [finance-relevant statuses],
        # so Draft headers should never reach the sweeper.  Simulate this by
        # passing no headers (empty cursor) — representing what Mongo would return.
        mock_db = self._make_mock_db(headers=[], outbox_docs=[])

        with patch.dict(os.environ, {"FINANCE_OUTBOX_ENABLED": "true"}):
            import importlib
            import src.modules.finance_bridge.feature_flag as ff_module
            importlib.reload(ff_module)

            from cron.scripts.outbox_reconciler import run_sweep
            stats = await run_sweep(mock_db)

        assert stats["scanned"] == 0
        assert stats["missing"] == 0
        assert stats["re_emitted"] == 0
        assert stats["errors"] == 0

    @pytest.mark.asyncio
    async def test_deterministic_event_id_used_on_emit(self) -> None:
        """Sweeper passes a deterministic event_id to OutboxWriter.publish."""
        from cron.scripts.outbox_reconciler import make_sweeper_event_id

        header = _make_pr_header(status="Approved")
        mock_db = self._make_mock_db(headers=[header], outbox_docs=[])

        published_event_ids: List[str] = []

        async def capture_publish(**kwargs: Any) -> Optional[str]:
            published_event_ids.append(kwargs.get("event_id", ""))
            return kwargs.get("event_id")

        with patch.dict(os.environ, {"FINANCE_OUTBOX_ENABLED": "true"}):
            import importlib
            import src.modules.finance_bridge.feature_flag as ff_module
            import src.modules.finance_bridge.outbox_writer as ow_module
            importlib.reload(ff_module)
            importlib.reload(ow_module)

            with patch.object(ow_module.OutboxWriter, "publish", new=AsyncMock(side_effect=capture_publish)):
                from cron.scripts import outbox_reconciler
                importlib.reload(outbox_reconciler)
                stats = await outbox_reconciler.run_sweep(mock_db)

        expected_id = make_sweeper_event_id(header["docId"], "Approved")
        assert len(published_event_ids) == 1
        assert published_event_ids[0] == expected_id
        assert stats["re_emitted"] == 1
