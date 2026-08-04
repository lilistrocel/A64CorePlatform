"""
Purchasing Module — Approval Engine

Resolves approval requirements for PR and PO documents.

Algorithm:
1. If FINANCE_OUTBOX_ENABLED: query finance service approval-rules/resolve endpoint.
2. If finance is OFF or unreachable: apply hardcoded fallback rules:
   - PR → always requires approval by `procurement_manager`
   - PO → requires approval if totalGross > 10000 AED, role=procurement_manager
   - Default for unknown types → always require, role=procurement_manager

The engine does NOT raise on finance errors — it logs a warning and falls back.
All network calls use httpx with a short timeout so a slow finance service never
blocks the main-app request path.
"""

import logging
import os
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Literal, Optional

logger = logging.getLogger(__name__)

DocTypeT = Literal["PR", "PO", "AP_INVOICE"]

# Hardcoded fallback thresholds
_PO_APPROVAL_THRESHOLD_AED = Decimal("10000")

# Finance service internal URL (service-to-service; no nginx)
_FINANCE_BASE_URL = os.getenv("FINANCE_INTERNAL_URL", "http://finance:8002")
_FINANCE_TIMEOUT_SECONDS = 3.0


@dataclass
class ApprovalStep:
    """
    One step in an approval chain.

    Today there is only ever one step (step_number=1).  A future workflow
    rewrite (Phase F) will produce multiple ApprovalStep instances for
    multi-step chains — the data shape already carries everything needed.

    Attributes:
        step_number: Position in the chain; always 1 in single-gate approval.
        required_role: Role that must act on this step.
        step_label: Human-readable label (e.g. "Department Approval").
                    Optional; populated by chain definitions in Phase F.
    """

    step_number: int
    required_role: str
    step_label: Optional[str] = None


@dataclass
class ApprovalDecision:
    """
    Result of the approval engine resolve call.

    Today only a single step is ever populated.  When Phase F lands, the
    engine internals will build multi-step chains; callers using
    `decision.approver_role` (the backward-compat property) will keep
    working without modification because the property derives from next_step.

    Attributes:
        required: Whether approval is required for this document.
        next_step: The immediately actionable approval step.  None when
                   required=False.
        workflow_id: Reserved for Phase F.  Null today; will reference the
                     workflows collection when multi-step chains land.
    """

    required: bool
    next_step: Optional[ApprovalStep] = None
    workflow_id: Optional[str] = None

    # Reason: backward-compat shim so all existing callers that read
    # decision.approver_role continue to work without any modification.
    @property
    def approver_role(self) -> Optional[str]:
        """Derived from next_step.required_role; None when no step is set."""
        return self.next_step.required_role if self.next_step else None


class ApprovalEngine:
    """
    Stateless approval-rule resolver.

    Uses the finance service when available, falls back to hardcoded rules when not.
    """

    async def resolve_required_approval(
        self,
        *,
        org_id: str,
        company_code: str,
        doc_type: DocTypeT,
        amount: Decimal,
    ) -> ApprovalDecision:
        """
        Decide whether approval is required and by which role.

        Args:
            org_id: Organisation UUID string.
            company_code: Finance company code (e.g. '1000').
            doc_type: 'PR' or 'PO'.
            amount: Document total gross amount for threshold checks.

        Returns:
            ApprovalDecision with required flag and optional approver_role.
        """
        # Reason: only call finance if the outbox bridge is enabled (finance is installed)
        from src.modules.finance_bridge.feature_flag import is_outbox_enabled

        if is_outbox_enabled():
            decision = await self._query_finance(
                org_id=org_id,
                company_code=company_code,
                doc_type=doc_type,
                amount=amount,
            )
            if decision is not None:
                return decision
            # Reason: finance call failed — fall through to hardcoded rules
            logger.warning(
                "[ApprovalEngine] finance query failed for doc_type=%s; using fallback rules",
                doc_type,
            )

        return self._fallback_rules(doc_type=doc_type, amount=amount)

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    async def _query_finance(
        self,
        *,
        org_id: str,
        company_code: str,
        doc_type: DocTypeT,
        amount: Decimal,
    ) -> Optional[ApprovalDecision]:
        """
        Call the finance service approval-rules/resolve endpoint.

        Returns None on any error (timeout, connection refused, 5xx).

        Args:
            org_id: Organisation UUID string.
            company_code: Finance company code.
            doc_type: PR or PO.
            amount: Total gross amount.

        Returns:
            ApprovalDecision if finance responded successfully, None otherwise.
        """
        try:
            import httpx

            url = (
                f"{_FINANCE_BASE_URL}/api/v1/finance/master-data/approval-rules/resolve"
            )
            params = {
                "companyCode": company_code,
                "docType": doc_type,
                "amount": str(amount),
                "organizationId": org_id,
            }

            # Reason: short timeout so a slow finance service doesn't block the request
            async with httpx.AsyncClient(timeout=_FINANCE_TIMEOUT_SECONDS) as client:
                resp = await client.get(url, params=params)

            if resp.status_code == 200:
                body = resp.json()
                data = body.get("data", body)
                required = bool(data.get("required", False))
                approver_role = data.get("approverRole") or data.get("approver_role")
                logger.debug(
                    "[ApprovalEngine] finance says required=%s role=%s for doc_type=%s amount=%s",
                    required,
                    approver_role,
                    doc_type,
                    amount,
                )
                # Reason: wrap the single role from finance into an ApprovalStep so the
                # decision shape is chain-ready; workflow_id stays null until Phase F.
                step = (
                    ApprovalStep(step_number=1, required_role=approver_role)
                    if required and approver_role
                    else None
                )
                return ApprovalDecision(required=required, next_step=step)

            logger.warning(
                "[ApprovalEngine] finance returned %s for approval resolve",
                resp.status_code,
            )
            return None

        except Exception as exc:
            logger.warning(
                "[ApprovalEngine] finance call raised %s: %s", type(exc).__name__, exc
            )
            return None

    def _fallback_rules(
        self,
        *,
        doc_type: DocTypeT,
        amount: Decimal,
    ) -> ApprovalDecision:
        """
        Apply hardcoded default approval rules when finance is unavailable.

        Rules:
          PR  → always requires approval by procurement_manager
          PO  → requires approval if amount > 10,000 AED; else no approval
          other → always requires approval by procurement_manager

        Args:
            doc_type: PR or PO.
            amount: Total gross amount.

        Returns:
            ApprovalDecision.
        """
        if doc_type == "PR":
            return ApprovalDecision(
                required=True,
                next_step=ApprovalStep(
                    step_number=1, required_role="procurement_manager"
                ),
            )

        if doc_type == "PO":
            if amount > _PO_APPROVAL_THRESHOLD_AED:
                return ApprovalDecision(
                    required=True,
                    next_step=ApprovalStep(
                        step_number=1, required_role="procurement_manager"
                    ),
                )
            return ApprovalDecision(required=False)

        if doc_type == "AP_INVOICE":
            # Reason: AP Invoice approval mirrors PO threshold — above 10,000 AED
            # requires accountant sign-off. The finance service seed has an
            # AP_INVOICE rule (accountant role, threshold 10,000 AED).
            if amount > _PO_APPROVAL_THRESHOLD_AED:
                return ApprovalDecision(
                    required=True,
                    next_step=ApprovalStep(step_number=1, required_role="accountant"),
                )
            return ApprovalDecision(required=False)

        # Reason: unknown future doc types default to requiring approval
        return ApprovalDecision(
            required=True,
            next_step=ApprovalStep(step_number=1, required_role="procurement_manager"),
        )
