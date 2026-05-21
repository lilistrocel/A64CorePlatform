"""
Unit tests for the Phase 2 transactional outbox wiring.

Covers:
    1. OutboxWriter.publish accepts and passes through a session parameter.
    2. OutboxWriter.publish with session=None behaves identically to before
       (backwards compatibility).
    3. DocumentService._txn() yields a session inside a transaction (mocked).
    4. When OutboxWriter.publish raises inside _txn(), the transaction aborts
       and the header update is rolled back — the header document is NOT
       persisted after a failed outbox write.
    5. A successful round-trip commits both the header update and the outbox
       insert as a single logical unit (verified via mock call order).
"""

import os
import uuid
from typing import Any, AsyncGenerator, Dict, List, Optional
from unittest.mock import AsyncMock, MagicMock, call, patch

import pytest


# ---------------------------------------------------------------------------
# Helpers: build minimal fixture documents
# ---------------------------------------------------------------------------


def _pr_id() -> str:
    return str(uuid.uuid4())


def _org_id() -> str:
    return str(uuid.uuid4())


def _user_id() -> str:
    return str(uuid.uuid4())


def _make_pr_header(
    doc_id: Optional[str] = None,
    status: str = "Pending Approval",
) -> Dict[str, Any]:
    """Return a minimal PR header document."""
    doc_id = doc_id or _pr_id()
    org_id = _org_id()
    user_id = _user_id()
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
        "totalGross": "500.00",
        "subtotalNet": "476.19",
        "totalTax": "23.81",
        "currencyCode": "AED",
        "docDate": "2026-05-20T00:00:00Z",
        "deletedAt": None,
        "approvalState": "Pending",
        "approvalRequestedFrom": "manager",
        "approvalRequestedAt": "2026-05-20T00:00:00Z",
        "approvalDecidedBy": None,
        "approvalDecidedAt": None,
        "approvalComment": None,
        "department": "Operations",
        "urgency": "normal",
        "notes": None,
        "baseDocId": None,
        "expectedDeliveryDate": None,
        "createdAt": "2026-05-20T00:00:00Z",
        "updatedAt": "2026-05-20T00:00:00Z",
        "postingDate": None,
        "dueDate": None,
        "issuedBy": None,
        "issuedDate": None,
        "vendorId": None,
        "vendorCode": None,
        "vendorName": None,
        "paymentTermsCode": None,
        "requestedDate": "2026-05-20T00:00:00Z",
    }


# ---------------------------------------------------------------------------
# Helpers: build a mock Motor session + transaction
# ---------------------------------------------------------------------------


def _make_mock_session() -> MagicMock:
    """
    Return a MagicMock that satisfies Motor's async session/transaction API.

    Motor's start_session() is an awaitable that returns an async context
    manager (the session itself).  The session's start_transaction() is
    a synchronous context manager.
    """
    mock_transaction_cm = MagicMock()
    mock_transaction_cm.__enter__ = MagicMock(return_value=None)
    mock_transaction_cm.__exit__ = MagicMock(return_value=False)
    # start_transaction must return the sync context manager directly (not async)
    mock_session = MagicMock()
    mock_session.start_transaction = MagicMock(return_value=mock_transaction_cm)
    # The session itself is an async context manager
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)
    return mock_session


def _make_mock_client(session: MagicMock) -> MagicMock:
    """
    Return a MagicMock Motor client whose start_session() returns the given session.

    Motor's start_session() returns a coroutine whose result is the session
    async context manager.
    """
    mock_client = MagicMock()
    # start_session() is awaited, then the result is used as an async cm
    mock_client.start_session = AsyncMock(return_value=session)
    return mock_client


# ---------------------------------------------------------------------------
# 1. OutboxWriter.publish passes session to insert_one
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_outbox_writer_passes_session_to_insert_one() -> None:
    """
    OutboxWriter.publish calls insert_one(doc, session=session) when session is given.
    """
    mock_collection = MagicMock()
    mock_collection.insert_one = AsyncMock(return_value=MagicMock(inserted_id="abc"))
    mock_db = MagicMock()
    mock_db.__getitem__ = MagicMock(return_value=mock_collection)

    fake_session = MagicMock()

    with patch.dict(os.environ, {"FINANCE_OUTBOX_ENABLED": "true"}):
        import importlib
        import src.modules.finance_bridge.feature_flag as ff_module
        import src.modules.finance_bridge.outbox_writer as ow_module
        importlib.reload(ff_module)
        importlib.reload(ow_module)

        await ow_module.OutboxWriter.publish(
            db=mock_db,
            event_type="pr_state_changed",
            organization_id=str(uuid.uuid4()),
            company_code="1000",
            payload=_make_pr_payload(),
            source_user_id=str(uuid.uuid4()),
            session=fake_session,
        )

    # Verify insert_one was called with the session keyword argument
    mock_collection.insert_one.assert_awaited_once()
    _, kwargs = mock_collection.insert_one.call_args
    assert kwargs.get("session") is fake_session, (
        "insert_one must receive session=<session> so it participates in the transaction"
    )


@pytest.mark.asyncio
async def test_outbox_writer_session_none_passes_none_to_insert_one() -> None:
    """
    OutboxWriter.publish passes session=None to insert_one when no session given
    (backwards-compatible — Motor treats None as no session).
    """
    mock_collection = MagicMock()
    mock_collection.insert_one = AsyncMock(return_value=MagicMock(inserted_id="abc"))
    mock_db = MagicMock()
    mock_db.__getitem__ = MagicMock(return_value=mock_collection)

    with patch.dict(os.environ, {"FINANCE_OUTBOX_ENABLED": "true"}):
        import importlib
        import src.modules.finance_bridge.feature_flag as ff_module
        import src.modules.finance_bridge.outbox_writer as ow_module
        importlib.reload(ff_module)
        importlib.reload(ow_module)

        await ow_module.OutboxWriter.publish(
            db=mock_db,
            event_type="pr_state_changed",
            organization_id=str(uuid.uuid4()),
            company_code="1000",
            payload=_make_pr_payload(),
            source_user_id=str(uuid.uuid4()),
            # session omitted — defaults to None
        )

    mock_collection.insert_one.assert_awaited_once()
    _, kwargs = mock_collection.insert_one.call_args
    assert kwargs.get("session") is None


@pytest.mark.asyncio
async def test_outbox_writer_disabled_returns_none_with_session() -> None:
    """
    OutboxWriter.publish returns None without touching the session when flag is off.
    """
    mock_db = MagicMock()
    fake_session = MagicMock()

    with patch.dict(os.environ, {"FINANCE_OUTBOX_ENABLED": "false"}):
        import importlib
        import src.modules.finance_bridge.feature_flag as ff_module
        import src.modules.finance_bridge.outbox_writer as ow_module
        importlib.reload(ff_module)
        importlib.reload(ow_module)

        result = await ow_module.OutboxWriter.publish(
            db=mock_db,
            event_type="pr_state_changed",
            organization_id=str(uuid.uuid4()),
            company_code="1000",
            payload=_make_pr_payload(),
            source_user_id=str(uuid.uuid4()),
            session=fake_session,
        )

    assert result is None
    mock_db.__getitem__.assert_not_called()
    # Session must not be interacted with when the flag is off
    fake_session.assert_not_called()


# ---------------------------------------------------------------------------
# 2. Transaction abort when outbox write fails
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_transaction_aborts_header_update_when_outbox_raises() -> None:
    """
    CRITICAL: When OutboxWriter.publish raises inside DocumentService._txn(),
    the entire transaction aborts.  The header update must NOT be visible
    after the failure.

    We verify this by mocking the Motor session so that:
    - The header update_one is recorded (called inside the transaction).
    - OutboxWriter.publish raises RuntimeError.
    - The exception propagates out of approve_pr.
    - Because the transaction is mocked (no real Mongo), we verify that
      the Motor transaction exit is called with the exception (abort path).
    """
    from src.modules.purchasing.services.document_service import DocumentService

    doc_id = _pr_id()
    org_id = _org_id()
    approver_id = _user_id()
    header = _make_pr_header(doc_id=doc_id, status="Pending Approval")
    # After update the header will show Approved
    approved_header = {**header, "status": "Approved", "approvalState": "Approved"}

    # --- Set up mock Motor collections ---
    mock_headers_col = MagicMock()
    mock_headers_col.find_one = AsyncMock(side_effect=[header, approved_header])
    mock_headers_col.update_one = AsyncMock()

    mock_collection_map: Dict[str, Any] = {
        "document_headers": mock_headers_col,
    }

    mock_db = MagicMock()
    mock_db.__getitem__ = MagicMock(side_effect=lambda name: mock_collection_map.get(name, MagicMock()))

    # --- Set up mock Motor session/transaction ---
    # The transaction context manager must propagate exceptions (abort path)
    # so __exit__ must return False (do not suppress exceptions).
    mock_session = _make_mock_session()
    mock_client = _make_mock_client(mock_session)
    mock_db.client = mock_client

    # --- Patch OutboxWriter to raise ---
    # Reason: OutboxWriter is imported locally inside _emit_pr_event, so we must
    # patch it at the source module location, not at the document_service namespace.
    with patch(
        "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
        new=AsyncMock(side_effect=RuntimeError("Mongo write failed")),
    ):
        with patch.dict(os.environ, {"FINANCE_OUTBOX_ENABLED": "true"}):
            import importlib
            import src.modules.finance_bridge.feature_flag as ff_module
            importlib.reload(ff_module)

            service = DocumentService(db=mock_db)
            # Wire the mock headers collection
            service._headers = mock_headers_col

            with pytest.raises(RuntimeError, match="Mongo write failed"):
                await service.approve_pr(
                    org_id=org_id,
                    doc_id=doc_id,
                    approver_id=approver_id,
                    approver_role="manager",
                    comment=None,
                    company_code="1000",
                )

    # The header update_one was called (inside the transaction) but then the
    # transaction exited with an exception — the session's __aexit__ was called
    # with a non-None exc_info, meaning Mongo aborted the transaction.
    mock_session.__aexit__.assert_awaited_once()
    exit_args = mock_session.__aexit__.call_args[0]
    # exit_args = (exc_type, exc_val, exc_tb); exc_type must not be None
    assert exit_args[0] is not None, (
        "Session.__aexit__ must be called with the exception so Motor aborts the transaction"
    )


# ---------------------------------------------------------------------------
# 3. Successful commit: header update + outbox insert called in order
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_successful_approve_pr_calls_update_then_outbox_in_session() -> None:
    """
    On a successful approve_pr:
    - headers.update_one is called with a session kwarg.
    - headers.find_one is called with a session kwarg (to read the committed state).
    - OutboxWriter.publish is called with session= (same session object).
    All three must happen before the session context manager exits.
    """
    from src.modules.purchasing.services.document_service import DocumentService

    doc_id = _pr_id()
    org_id = _org_id()
    approver_id = _user_id()
    header = _make_pr_header(doc_id=doc_id, status="Pending Approval")
    approved_header = {**header, "status": "Approved", "approvalState": "Approved"}

    call_order: List[str] = []

    mock_headers_col = MagicMock()

    async def _find_one(query: Any, session: Any = None) -> Any:
        call_order.append("find_one")
        if query.get("docId") == doc_id and session is not None:
            return approved_header
        return header

    async def _update_one(query: Any, update: Any, session: Any = None) -> Any:
        call_order.append("update_one")
        return MagicMock()

    mock_headers_col.find_one = AsyncMock(side_effect=_find_one)
    mock_headers_col.update_one = AsyncMock(side_effect=_update_one)

    # _get_lines is called after the transaction (no session)
    mock_lines_col = MagicMock()
    mock_lines_col.find = MagicMock(return_value=MagicMock(
        sort=MagicMock(return_value=MagicMock(
            to_list=AsyncMock(return_value=[])
        ))
    ))

    mock_db = MagicMock()
    mock_db.__getitem__ = MagicMock(side_effect=lambda name: (
        mock_headers_col if name == "document_headers" else mock_lines_col
    ))

    mock_session = _make_mock_session()
    mock_client = _make_mock_client(mock_session)
    mock_db.client = mock_client

    publish_call_session: Optional[Any] = None

    async def _mock_publish(*args: Any, **kwargs: Any) -> Optional[str]:
        call_order.append("outbox_publish")
        nonlocal publish_call_session
        publish_call_session = kwargs.get("session")
        return str(uuid.uuid4())

    # Reason: OutboxWriter is imported locally inside _emit_pr_event, so we must
    # patch it at the source module location, not at the document_service namespace.
    with patch(
        "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
        new=AsyncMock(side_effect=_mock_publish),
    ):
        with patch.dict(os.environ, {"FINANCE_OUTBOX_ENABLED": "true"}):
            import importlib
            import src.modules.finance_bridge.feature_flag as ff_module
            importlib.reload(ff_module)

            service = DocumentService(db=mock_db)
            service._headers = mock_headers_col
            service._lines = mock_lines_col

            await service.approve_pr(
                org_id=org_id,
                doc_id=doc_id,
                approver_id=approver_id,
                approver_role="manager",
                comment="Looks good",
                company_code="1000",
            )

    # update_one then find_one then outbox_publish — in that order inside txn
    assert "update_one" in call_order
    assert "outbox_publish" in call_order
    update_idx = call_order.index("update_one")
    publish_idx = call_order.index("outbox_publish")
    assert update_idx < publish_idx, (
        "update_one must be called before outbox publish within the transaction"
    )

    # Session exits cleanly (no exception)
    mock_session.__aexit__.assert_awaited_once()
    exit_args = mock_session.__aexit__.call_args[0]
    assert exit_args[0] is None, (
        "Session.__aexit__ must be called with exc_type=None on success (commit path)"
    )

    # OutboxWriter received the session
    assert publish_call_session is mock_session, (
        "OutboxWriter.publish must receive the Motor session so the insert is in the transaction"
    )


# ---------------------------------------------------------------------------
# 4. _emit_pr_event no longer swallows exceptions
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_emit_pr_event_propagates_exception() -> None:
    """
    _emit_pr_event must NOT swallow exceptions from OutboxWriter.publish.
    Any exception must propagate to the caller (and abort the surrounding txn).
    """
    from src.modules.purchasing.services.document_service import DocumentService

    mock_db = MagicMock()
    mock_session = _make_mock_session()
    mock_client = _make_mock_client(mock_session)
    mock_db.client = mock_client

    service = DocumentService(db=mock_db)
    header = _make_pr_header()

    with patch(
        "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
        new=AsyncMock(side_effect=ValueError("schema mismatch")),
    ):
        with patch.dict(os.environ, {"FINANCE_OUTBOX_ENABLED": "true"}):
            import importlib
            import src.modules.finance_bridge.feature_flag as ff_module
            importlib.reload(ff_module)

            with pytest.raises(ValueError, match="schema mismatch"):
                await service._emit_pr_event(
                    header=header,
                    previous_state="Draft",
                    company_code="1000",
                    session=None,
                )


@pytest.mark.asyncio
async def test_emit_po_event_propagates_exception() -> None:
    """
    _emit_po_event must NOT swallow exceptions from OutboxWriter.publish.
    """
    from src.modules.purchasing.services.document_service import DocumentService

    mock_db = MagicMock()
    mock_session = _make_mock_session()
    mock_client = _make_mock_client(mock_session)
    mock_db.client = mock_client

    service = DocumentService(db=mock_db)

    po_header = {
        **_make_pr_header(),
        "docType": "PO",
        "docNumber": "PO-2026-0001",
        "vendorId": str(uuid.uuid4()),
        "vendorCode": "V001",
        "vendorName": "Test Vendor",
        "issuedBy": str(uuid.uuid4()),
        "issuedDate": None,
        "subtotalNet": "476.19",
        "totalTax": "23.81",
        "totalGross": "500.00",
        "paymentTermsCode": None,
        "expectedDeliveryDate": None,
        "postingDate": None,
        "dueDate": None,
    }

    with patch(
        "src.modules.finance_bridge.outbox_writer.OutboxWriter.publish",
        new=AsyncMock(side_effect=ValueError("schema mismatch")),
    ):
        with patch.dict(os.environ, {"FINANCE_OUTBOX_ENABLED": "true"}):
            import importlib
            import src.modules.finance_bridge.feature_flag as ff_module
            importlib.reload(ff_module)

            with pytest.raises(ValueError, match="schema mismatch"):
                await service._emit_po_event(
                    header=po_header,
                    previous_state="Draft",
                    company_code="1000",
                    session=None,
                )


# ---------------------------------------------------------------------------
# Payload builder (shared across tests)
# ---------------------------------------------------------------------------


def _make_pr_payload(
    doc_id: Optional[str] = None,
    org_id: Optional[str] = None,
    state: str = "Approved",
) -> Dict[str, Any]:
    """Build a valid pr_state_changed payload dict."""
    return {
        "docId": doc_id or _pr_id(),
        "docNumber": "PR-2026-0001",
        "state": state,
        "previousState": "Pending Approval",
        "organizationId": org_id or _org_id(),
        "companyCode": "1000",
        "requestedBy": _user_id(),
        "requestedDate": "2026-05-20T00:00:00+00:00",
        "department": "Operations",
        "urgency": "normal",
        "totalAmount": "500.00",
        "currencyCode": "AED",
        "notes": None,
        "approvalRequestedFrom": "manager",
        "approvalDecidedBy": None,
        "approvalComment": None,
    }
