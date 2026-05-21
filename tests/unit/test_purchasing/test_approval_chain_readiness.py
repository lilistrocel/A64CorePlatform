"""
Unit tests — Approval engine chain-readiness precautions (T-040)

Covers:
  - ApprovalDecision.approver_role backward-compat property returns same string as
    next_step.required_role when next_step is set.
  - ApprovalDecision.approver_role is None when next_step is None.
  - _fallback_rules returns ApprovalDecision with next_step populated.
  - approve_pr appends exactly one approvalHistory entry with
    stepNumber=1 and decision="Approved".
  - reject_pr appends exactly one approvalHistory entry with
    stepNumber=1 and decision="Rejected".
"""

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.modules.purchasing.services.approval_engine import (
    ApprovalDecision,
    ApprovalEngine,
    ApprovalStep,
)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

ORG_ID = str(uuid.uuid4())
COMPANY_CODE = "1000"
APPROVER_ID = str(uuid.uuid4())
REQUESTER_ID = str(uuid.uuid4())
DOC_ID = str(uuid.uuid4())


# ---------------------------------------------------------------------------
# ApprovalDecision backward-compat property
# ---------------------------------------------------------------------------


class TestApprovalDecisionBackwardCompat:
    """Verify that decision.approver_role works as it did before the chain-readiness change."""

    def test_approver_role_returns_required_role_when_next_step_set(self) -> None:
        """
        decision.approver_role must equal next_step.required_role so that
        existing callers that never heard of ApprovalStep keep working.
        """
        step = ApprovalStep(step_number=1, required_role="procurement_manager")
        decision = ApprovalDecision(required=True, next_step=step)

        assert decision.approver_role == "procurement_manager"
        assert decision.approver_role == decision.next_step.required_role

    def test_approver_role_is_none_when_no_step(self) -> None:
        """When approval is not required there is no step; approver_role must be None."""
        decision = ApprovalDecision(required=False, next_step=None)

        assert decision.approver_role is None

    def test_workflow_id_defaults_to_none(self) -> None:
        """workflow_id is reserved for Phase F; must be None today."""
        decision = ApprovalDecision(required=True, next_step=ApprovalStep(1, "procurement_manager"))

        assert decision.workflow_id is None

    def test_fallback_rules_pr_populates_next_step(self) -> None:
        """_fallback_rules for PR must return a decision whose next_step is an ApprovalStep."""
        engine = ApprovalEngine()
        decision = engine._fallback_rules(doc_type="PR", amount=Decimal("500"))

        assert decision.required is True
        assert decision.next_step is not None
        assert decision.next_step.step_number == 1
        assert decision.next_step.required_role == "procurement_manager"
        # Backward-compat property must still work
        assert decision.approver_role == "procurement_manager"

    def test_fallback_rules_po_below_threshold_has_no_step(self) -> None:
        """PO below threshold → required=False, next_step=None."""
        engine = ApprovalEngine()
        decision = engine._fallback_rules(doc_type="PO", amount=Decimal("5000"))

        assert decision.required is False
        assert decision.next_step is None
        assert decision.approver_role is None

    def test_fallback_rules_po_above_threshold_populates_next_step(self) -> None:
        """PO above threshold → required=True with step_number=1."""
        engine = ApprovalEngine()
        decision = engine._fallback_rules(doc_type="PO", amount=Decimal("15000"))

        assert decision.required is True
        assert decision.next_step is not None
        assert decision.next_step.step_number == 1
        assert decision.approver_role == "procurement_manager"


# ---------------------------------------------------------------------------
# Helpers for DocumentService tests
# ---------------------------------------------------------------------------


def _make_pr_header(
    doc_id: Optional[str] = None,
    status: str = "Pending Approval",
    requester_id: Optional[str] = None,
) -> Dict[str, Any]:
    now = datetime.now(tz=timezone.utc)
    return {
        "docId": doc_id or DOC_ID,
        "organizationId": ORG_ID,
        "companyCode": COMPANY_CODE,
        "docType": "PR",
        "docNumber": "PR-2026-0001",
        "docDate": now,
        "status": status,
        "requestedBy": requester_id or REQUESTER_ID,
        "requestedDate": now,
        "urgency": "normal",
        "subtotalNet": 1000.0,
        "totalTax": 50.0,
        "totalGross": 1050.0,
        "currencyCode": "AED",
        "approvalState": "Pending",
        "approvalRequestedFrom": "procurement_manager",
        "approvalRequestedAt": now,
        "approvalHistory": [],
        "createdAt": now,
        "updatedAt": now,
        "deletedAt": None,
    }


def _make_document_service(headers_col: Any) -> Any:
    """Build a DocumentService with all heavy dependencies mocked out."""
    from src.modules.purchasing.services.document_service import DocumentService

    db = MagicMock()
    db.__getitem__ = MagicMock(return_value=headers_col)

    svc = DocumentService.__new__(DocumentService)
    svc._db = db
    svc._headers = headers_col
    svc._lines = MagicMock()
    svc._counters = MagicMock()
    svc._engine = MagicMock(spec=ApprovalEngine)
    return svc


# ---------------------------------------------------------------------------
# approve_pr — approvalHistory entry
# ---------------------------------------------------------------------------


class TestApprovePrHistory:
    """approve_pr must append a well-formed approvalHistory entry."""

    @pytest.mark.asyncio
    async def test_approve_pr_appends_approved_history_entry(self) -> None:
        """
        After approve_pr the updated document's approvalHistory must contain
        exactly one entry with stepNumber=1 and decision="Approved".
        """
        pr_header = _make_pr_header()

        # Track the $push argument so we can inspect the history entry
        captured_push: Dict[str, Any] = {}

        async def fake_update_one(filter_: Any, update: Any, **_: Any) -> None:
            if "$push" in update:
                captured_push.update(update["$push"])

        updated_header = dict(pr_header)
        updated_header["status"] = "Approved"
        updated_header["approvalState"] = "Approved"
        updated_header["approvalDecidedBy"] = APPROVER_ID

        headers_col = MagicMock()
        headers_col.find_one = AsyncMock(side_effect=[pr_header, updated_header])
        headers_col.update_one = AsyncMock(side_effect=fake_update_one)

        svc = _make_document_service(headers_col)

        # Patch transaction context and outbox emission so the test is self-contained
        from contextlib import asynccontextmanager

        @asynccontextmanager
        async def fake_txn():
            yield MagicMock()

        svc._txn = fake_txn
        svc._emit_pr_event = AsyncMock()
        svc._get_lines = AsyncMock(return_value=[])

        await svc.approve_pr(
            org_id=ORG_ID,
            doc_id=DOC_ID,
            approver_id=APPROVER_ID,
            approver_role="procurement_manager",
            comment="Looks good",
            company_code=COMPANY_CODE,
        )

        assert "approvalHistory" in captured_push, (
            "$push must target approvalHistory"
        )
        entry = captured_push["approvalHistory"]
        assert entry["stepNumber"] == 1
        assert entry["decision"] == "Approved"
        assert entry["approverId"] == APPROVER_ID
        assert entry["approverRole"] == "procurement_manager"
        assert entry["comment"] == "Looks good"
        assert entry["workflowId"] is None


# ---------------------------------------------------------------------------
# reject_pr — approvalHistory entry
# ---------------------------------------------------------------------------


class TestRejectPrHistory:
    """reject_pr must append a well-formed approvalHistory entry with decision=Rejected."""

    @pytest.mark.asyncio
    async def test_reject_pr_appends_rejected_history_entry(self) -> None:
        """
        After reject_pr the updated document's approvalHistory must contain
        exactly one entry with stepNumber=1 and decision="Rejected".
        """
        pr_header = _make_pr_header()

        captured_push: Dict[str, Any] = {}

        async def fake_update_one(filter_: Any, update: Any, **_: Any) -> None:
            if "$push" in update:
                captured_push.update(update["$push"])

        updated_header = dict(pr_header)
        updated_header["status"] = "Rejected"
        updated_header["approvalState"] = "Rejected"
        updated_header["approvalDecidedBy"] = APPROVER_ID

        headers_col = MagicMock()
        headers_col.find_one = AsyncMock(side_effect=[pr_header, updated_header])
        headers_col.update_one = AsyncMock(side_effect=fake_update_one)

        svc = _make_document_service(headers_col)

        from contextlib import asynccontextmanager

        @asynccontextmanager
        async def fake_txn():
            yield MagicMock()

        svc._txn = fake_txn
        svc._emit_pr_event = AsyncMock()
        svc._get_lines = AsyncMock(return_value=[])

        await svc.reject_pr(
            org_id=ORG_ID,
            doc_id=DOC_ID,
            approver_id=APPROVER_ID,
            approver_role="procurement_manager",
            comment="Budget exceeded",
            company_code=COMPANY_CODE,
        )

        assert "approvalHistory" in captured_push, (
            "$push must target approvalHistory"
        )
        entry = captured_push["approvalHistory"]
        assert entry["stepNumber"] == 1
        assert entry["decision"] == "Rejected"
        assert entry["approverId"] == APPROVER_ID
        assert entry["approverRole"] == "procurement_manager"
        assert entry["comment"] == "Budget exceeded"
        assert entry["workflowId"] is None
