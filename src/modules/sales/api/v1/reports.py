"""
Sales Module — Reports API Routes (T-200.2)

Endpoint set for the Sales reporting surface.

Currently implemented:
    GET  /api/v1/sales/reports/ar-aging   — AR Aging report

Authorization:
    All endpoints require ``sales.view`` permission (same as other sales
    read endpoints — see ``customer_receipts.py`` for the import pattern).

Prefix: /reports  (registered in api/v1/__init__.py)
Full prefix after module registration: /api/v1/sales/reports
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from ...middleware.auth import (
    CurrentUser,
    get_current_active_user,
    require_permission,
)
from ...models.reports import ARAgingReport
from ...services.database import sales_db
from ...services.reports_service import compute_ar_aging
from ...utils.responses import SuccessResponse

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Sales — Reports"])


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _get_db():
    """Dependency: return the shared ops MongoDB database instance."""
    return sales_db.get_database()


def _resolve_org_id(
    organization_id: Optional[str],
    current_user: CurrentUser,
) -> str:
    """
    Resolve organisation ID from query param or JWT claim.

    Args:
        organization_id: Optional explicit override from query param.
        current_user:    Authenticated user from JWT.

    Returns:
        Organisation UUID string.

    Raises:
        HTTPException 400: If org ID cannot be resolved from either source.
    """
    org_id = organization_id or getattr(current_user, "organizationId", None)
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="organization_id is required",
        )
    return org_id


def _today_utc() -> date:
    """Return today's date in UTC."""
    return datetime.now(tz=timezone.utc).date()


# ---------------------------------------------------------------------------
# GET /reports/ar-aging
# ---------------------------------------------------------------------------


@router.get(
    "/ar-aging",
    response_model=SuccessResponse[ARAgingReport],
    response_model_by_alias=True,
    status_code=status.HTTP_200_OK,
    summary="AR Aging Report",
    description=(
        "Compute the AR Aging report for an organisation. "
        "Returns outstanding AR Invoice open_amounts grouped by customer + currency "
        "and bucketed into five ageing bands: current, 1–30, 31–60, 61–90, over 90 days. "
        "Only invoices with status 'open' or 'partly_closed' are included. "
        "Amounts are returned as Decimal strings to avoid float drift."
    ),
)
async def get_ar_aging(
    organization_id: Optional[str] = Query(None, description="Organisation UUID (defaults to JWT claim)"),
    customer_id: Optional[str] = Query(None, description="Filter to a single customer UUID"),
    as_of_date: Optional[date] = Query(
        None,
        description="Reference date for computing daysOverdue (ISO YYYY-MM-DD; defaults to today UTC)",
    ),
    currency: Optional[str] = Query(
        None,
        max_length=3,
        description="Filter to a single currency ISO code (e.g. AED)",
    ),
    current_user: CurrentUser = Depends(require_permission("sales.view")),
    db=Depends(_get_db),
) -> SuccessResponse[ARAgingReport]:
    """
    Compute the AR Aging report.

    Groups outstanding AR Invoices by (customerId, currency) and sums their
    openAmount into five ageing buckets based on (as_of_date - dueDate).days.

    Args:
        organization_id: Organisation UUID (defaults to JWT claim).
        customer_id:     Optional filter to a single customer.
        as_of_date:      Reference date; defaults to today UTC.
        currency:        Optional ISO currency filter.
        current_user:    Authenticated user (requires sales.view permission).
        db:              MongoDB database dependency.

    Returns:
        SuccessResponse wrapping an ARAgingReport with customer rows + grand totals.

    Raises:
        HTTPException 400: If organisation ID cannot be resolved.
        HTTPException 500: On unexpected service failure.
    """
    org_id = _resolve_org_id(organization_id, current_user)
    effective_as_of = as_of_date or _today_utc()

    try:
        report = await compute_ar_aging(
            db,
            org_id,
            customer_id=customer_id,
            as_of_date=effective_as_of,
            currency=currency,
        )
    except Exception as exc:
        logger.error(
            "[reports] AR Aging computation failed for org=%s: %s",
            org_id,
            exc,
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="AR Aging computation failed",
        ) from exc

    customer_count = report.grand_totals.customer_count
    invoice_count = report.grand_totals.invoice_count
    message = (
        f"AR aging computed for {customer_count} customer(s)"
        if customer_count > 0
        else "No outstanding AR invoices for the selected filters"
    )
    if invoice_count > 0 and customer_count > 0:
        message = f"AR aging computed for {customer_count} customer(s) — {invoice_count} invoice(s)"

    return SuccessResponse(data=report, message=message)
