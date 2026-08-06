"""
Unit tests for DocumentService.soft_delete_po (T-811 follow-up).

Draft and Cancelled POs may be soft-deleted (removed from the list); any live
status must be rejected. Cancelled was added so the UI can clear voided POs.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock


def _service_with_header(status: str):
    """Build a DocumentService whose header lookup returns a PO in `status`."""
    from src.modules.purchasing.services.document_service import DocumentService

    headers = AsyncMock()
    headers.find_one = AsyncMock(
        return_value={"docId": "po-1", "docType": "PO", "status": status}
    )
    headers.update_one = AsyncMock()

    db = MagicMock()
    db.__getitem__ = MagicMock(return_value=headers)
    return DocumentService(db), headers


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["draft", "cancelled"])
async def test_soft_delete_po_allows_draft_and_cancelled(status: str) -> None:
    service, headers = _service_with_header(status)

    result = await service.soft_delete_po("org-1", "po-1", "user-1")

    assert result is True
    headers.update_one.assert_awaited_once()
    set_fields = headers.update_one.await_args.args[1]["$set"]
    assert set_fields["deletedAt"] is not None
    assert set_fields["updatedBy"] == "user-1"


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["open", "pending_approval", "partly_closed", "closed"])
async def test_soft_delete_po_rejects_live_statuses(status: str) -> None:
    service, headers = _service_with_header(status)

    with pytest.raises(ValueError, match="Draft or Cancelled"):
        await service.soft_delete_po("org-1", "po-1", "user-1")

    headers.update_one.assert_not_awaited()


@pytest.mark.asyncio
async def test_soft_delete_po_returns_false_when_not_found() -> None:
    from src.modules.purchasing.services.document_service import DocumentService

    headers = AsyncMock()
    headers.find_one = AsyncMock(return_value=None)
    headers.update_one = AsyncMock()
    db = MagicMock()
    db.__getitem__ = MagicMock(return_value=headers)

    result = await DocumentService(db).soft_delete_po("org-1", "missing", "user-1")

    assert result is False
    headers.update_one.assert_not_awaited()
