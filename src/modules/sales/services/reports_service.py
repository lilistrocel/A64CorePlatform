"""
Sales Module — Reports Service Layer (T-200.2)

Provides the ``compute_ar_aging`` function that builds the AR Aging report
by fetching all outstanding AR Invoices for an organisation and bucketing
their ``totals.openAmount`` by customer + currency into five ageing bands.

Ageing bucket logic
-------------------
Given ``as_of_date`` (the reference date, defaulting to today UTC):

    daysOverdue = (as_of_date - invoice.dueDate).days

    current   : daysOverdue <= 0
    1-30      : 1  <= daysOverdue <= 30
    31-60     : 31 <= daysOverdue <= 60
    61-90     : 61 <= daysOverdue <= 90
    over90    : daysOverdue > 90

Only invoices with ``status IN ('open', 'partly_closed')`` are included.

Collections used
----------------
  ar_invoices_v2   — read-only; no writes in this service

Design note: The task spec offers a MongoDB aggregation pipeline OR a Python
loop.  Given the current data volume (single-tenant, hundreds of invoices at
most) the Python loop is simpler to read and test.  A $group pipeline would
be more efficient for large tenants; this can be swapped in via T-200.2.1
when the need arises.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from datetime import date, datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Dict, List, Optional, Tuple

from motor.motor_asyncio import AsyncIOMotorDatabase

from ..models.reports import (
    ARAgingCustomerRow,
    ARAgingGrandTotals,
    ARAgingReport,
)

logger = logging.getLogger(__name__)

_ARI_COL = "ar_invoices_v2"
_TWOPLACES = Decimal("0.01")
_ZERO = Decimal("0")

# Statuses that have an outstanding balance.
_OUTSTANDING_STATUSES = {"open", "partly_closed"}


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _today_utc() -> date:
    """Return today's date in UTC."""
    return datetime.now(tz=timezone.utc).date()


def _q(value: Any) -> Decimal:
    """
    Coerce a raw MongoDB numeric value to a 2dp Decimal.

    Args:
        value: Raw value (int, float, Decimal, str, or None).

    Returns:
        Decimal quantized to 2dp; returns 0.00 for None/missing values.
    """
    if value is None:
        return _ZERO.quantize(_TWOPLACES, rounding=ROUND_HALF_UP)
    return Decimal(str(value)).quantize(_TWOPLACES, rounding=ROUND_HALF_UP)


def _extract_due_date(raw: Dict[str, Any]) -> Optional[date]:
    """
    Extract and normalise the dueDate from a raw MongoDB document.

    MongoDB stores dates as datetime objects.  We only need the date part
    for ageing computation.

    Args:
        raw: Raw MongoDB document from ar_invoices_v2.

    Returns:
        date or None if dueDate is absent/malformed.
    """
    due = raw.get("dueDate")
    if due is None:
        return None
    if isinstance(due, datetime):
        return due.date()
    if isinstance(due, date):
        return due
    # Reason: some old docs may have stored date as a string during development.
    try:
        return date.fromisoformat(str(due)[:10])
    except (ValueError, TypeError):
        logger.warning("Unparseable dueDate for docEntry=%s: %r", raw.get("docEntry"), due)
        return None


def _assign_bucket(days_overdue: int) -> str:
    """
    Assign an invoice to an ageing bucket based on days overdue.

    Args:
        days_overdue: Integer days between as_of_date and dueDate.
                      Positive = overdue; zero or negative = current.

    Returns:
        One of: 'current', '1_to_30', '31_to_60', '61_to_90', 'over_90'.
    """
    if days_overdue <= 0:
        return "current"
    if days_overdue <= 30:
        return "1_to_30"
    if days_overdue <= 60:
        return "31_to_60"
    if days_overdue <= 90:
        return "61_to_90"
    return "over_90"


# ---------------------------------------------------------------------------
# Public service function
# ---------------------------------------------------------------------------


async def compute_ar_aging(
    db: AsyncIOMotorDatabase,
    org_id: str,
    *,
    customer_id: Optional[str] = None,
    as_of_date: Optional[date] = None,
    currency: Optional[str] = None,
) -> ARAgingReport:
    """
    Compute the AR Aging report for an organisation.

    Fetches all outstanding AR Invoices (status = open or partly_closed),
    applies optional filters, computes daysOverdue per invoice, and groups
    by (customerId, customerName, currency) with per-bucket open_amount sums.

    Args:
        db:          Motor database instance.
        org_id:      Organisation UUID — scope for all queries.
        customer_id: Optional filter to a single customer.
        as_of_date:  Reference date for daysOverdue.  Defaults to today UTC.
        currency:    Optional ISO 4217 filter.  If provided only invoices in
                     this currency are included in the result.

    Returns:
        ARAgingReport with customers list and grand_totals.
    """
    effective_as_of = as_of_date if as_of_date is not None else _today_utc()

    # Build Mongo query filter.
    query: Dict[str, Any] = {
        "organizationId": org_id,
        "status": {"$in": list(_OUTSTANDING_STATUSES)},
    }
    if customer_id:
        query["customerId"] = customer_id
    if currency:
        query["currency"] = currency

    # Reason: projection avoids loading lines array for each invoice;
    # we only need header fields + totals for the ageing computation.
    projection = {
        "docEntry": 1,
        "customerId": 1,
        "customerName": 1,
        "currency": 1,
        "dueDate": 1,
        "status": 1,
        "totals": 1,
    }

    cursor = db[_ARI_COL].find(query, projection)
    raw_docs: List[Dict[str, Any]] = await cursor.to_list(length=None)

    logger.info(
        "[reports_service] AR Aging: org=%s as_of=%s invoice_count=%d",
        org_id,
        effective_as_of,
        len(raw_docs),
    )

    # Group key: (customerId, customerName, currency) → {bucket: Decimal, count: int}
    # Using a tuple key ensures correct grouping even if two customers share a name.
    GroupKey = Tuple[str, str, str]
    buckets: Dict[GroupKey, Dict[str, Decimal]] = defaultdict(
        lambda: {
            "current": _ZERO,
            "1_to_30": _ZERO,
            "31_to_60": _ZERO,
            "61_to_90": _ZERO,
            "over_90": _ZERO,
            "invoice_count": _ZERO,
        }
    )

    for raw in raw_docs:
        customer_id_val: str = raw.get("customerId", "")
        customer_name_val: str = raw.get("customerName", "")
        currency_val: str = raw.get("currency", "AED")

        totals = raw.get("totals", {})
        # Reason: use openAmount directly — this is already net of paidAmount
        # and creditedAmount as maintained by Customer Receipt and Credit Note
        # services.  No re-computation needed here.
        open_amount = _q(totals.get("openAmount", 0))

        # Skip invoices with zero or negative open balance (e.g. fully-paid
        # invoices that haven't been transitioned to CLOSED yet).
        if open_amount <= _ZERO:
            continue

        due_date = _extract_due_date(raw)
        if due_date is None:
            # Reason: treat missing dueDate as current (not overdue) to avoid
            # dropping the invoice entirely from the report.
            days_overdue = 0
            logger.warning(
                "AR Invoice %s has no dueDate — treated as current",
                raw.get("docEntry"),
            )
        else:
            days_overdue = (effective_as_of - due_date).days

        bucket = _assign_bucket(days_overdue)
        group_key: GroupKey = (customer_id_val, customer_name_val, currency_val)
        buckets[group_key][bucket] += open_amount
        buckets[group_key]["invoice_count"] += Decimal("1")

    # Build the customer rows.
    customer_rows: List[ARAgingCustomerRow] = []
    for (cid, cname, curr), b in buckets.items():
        row_total = (
            b["current"]
            + b["1_to_30"]
            + b["31_to_60"]
            + b["61_to_90"]
            + b["over_90"]
        ).quantize(_TWOPLACES, rounding=ROUND_HALF_UP)

        customer_rows.append(
            ARAgingCustomerRow(
                customer_id=cid,
                customer_name=cname,
                currency=curr,
                current=b["current"].quantize(_TWOPLACES, rounding=ROUND_HALF_UP),
                days_1_to_30=b["1_to_30"].quantize(_TWOPLACES, rounding=ROUND_HALF_UP),
                days_31_to_60=b["31_to_60"].quantize(_TWOPLACES, rounding=ROUND_HALF_UP),
                days_61_to_90=b["61_to_90"].quantize(_TWOPLACES, rounding=ROUND_HALF_UP),
                over_90=b["over_90"].quantize(_TWOPLACES, rounding=ROUND_HALF_UP),
                total=row_total,
                invoice_count=int(b["invoice_count"]),
            )
        )

    # Order: descending total (largest debtor first), then ascending customer_name.
    customer_rows.sort(key=lambda r: (-r.total, r.customer_name))

    # Compute grand totals.
    gt_current = sum((r.current for r in customer_rows), _ZERO).quantize(
        _TWOPLACES, rounding=ROUND_HALF_UP
    )
    gt_1_30 = sum((r.days_1_to_30 for r in customer_rows), _ZERO).quantize(
        _TWOPLACES, rounding=ROUND_HALF_UP
    )
    gt_31_60 = sum((r.days_31_to_60 for r in customer_rows), _ZERO).quantize(
        _TWOPLACES, rounding=ROUND_HALF_UP
    )
    gt_61_90 = sum((r.days_61_to_90 for r in customer_rows), _ZERO).quantize(
        _TWOPLACES, rounding=ROUND_HALF_UP
    )
    gt_over90 = sum((r.over_90 for r in customer_rows), _ZERO).quantize(
        _TWOPLACES, rounding=ROUND_HALF_UP
    )
    gt_total = (gt_current + gt_1_30 + gt_31_60 + gt_61_90 + gt_over90).quantize(
        _TWOPLACES, rounding=ROUND_HALF_UP
    )
    # Count distinct (customerId, currency) groups (not rows, since each row is
    # already one group — same as len(customer_rows)).
    distinct_customers = len({r.customer_id for r in customer_rows})
    total_invoice_count = sum(r.invoice_count for r in customer_rows)

    grand_totals = ARAgingGrandTotals(
        current=gt_current,
        days_1_to_30=gt_1_30,
        days_31_to_60=gt_31_60,
        days_61_to_90=gt_61_90,
        over_90=gt_over90,
        total=gt_total,
        customer_count=distinct_customers,
        invoice_count=total_invoice_count,
    )

    return ARAgingReport(
        as_of_date=effective_as_of,
        customers=customer_rows,
        grand_totals=grand_totals,
    )
