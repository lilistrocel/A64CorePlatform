"""
Sales Module — Report Pydantic Schemas (T-200.2)

Covers the AR Aging report shape produced by the
``GET /api/v1/sales/reports/ar-aging`` endpoint.

The AR Aging report answers "who owes me money and how late are they?" by
grouping outstanding AR Invoice open_amounts by customer + currency and
bucketing them into five ageing bands:

    current   — daysOverdue <= 0  (not yet due)
    1–30      — 1 <= daysOverdue <= 30
    31–60     — 31 <= daysOverdue <= 60
    61–90     — 61 <= daysOverdue <= 90
    over90    — daysOverdue > 90

``daysOverdue = (as_of_date - dueDate).days``

Amounts are serialised as Decimal strings (2dp) to avoid IEEE-754 float
drift.  All response models apply ``_RESPONSE_CONFIG`` (camelCase alias
generator) and routes pair this with ``response_model_by_alias=True``.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, Field

# Re-use the shared response config established in ar_invoices.py.
# Importing it here avoids duplication; if the project later moves it to a
# dedicated _response_config.py, update this import alone.
from .ar_invoices import _RESPONSE_CONFIG


# ---------------------------------------------------------------------------
# Row-level model — one per (customer, currency) group
# ---------------------------------------------------------------------------


class ARAgingCustomerRow(BaseModel):
    """
    Ageing summary for a single customer + currency combination.

    Attributes:
        customer_id:   FK to customers collection.
        customer_name: Denormalised customer name (snapshot from AR Invoice).
        currency:      ISO 4217 currency code for this bucket group.
        current:       Sum of open_amount for invoices not yet due.
        days_1_to_30:  Sum of open_amount for invoices 1–30 days overdue.
        days_31_to_60: Sum of open_amount for invoices 31–60 days overdue.
        days_61_to_90: Sum of open_amount for invoices 61–90 days overdue.
        over_90:       Sum of open_amount for invoices > 90 days overdue.
        total:         Sum across all buckets for this customer + currency.
        invoice_count: Number of open invoices contributing to this row.
    """

    model_config = _RESPONSE_CONFIG

    customer_id: str = Field(..., description="FK to customers collection")
    customer_name: str = Field(..., description="Denormalised customer name")
    currency: str = Field(..., description="ISO 4217 currency code")
    current: Decimal = Field(Decimal("0.00"), description="Open amount not yet due")
    days_1_to_30: Decimal = Field(Decimal("0.00"), description="Open amount 1–30 days overdue")
    days_31_to_60: Decimal = Field(Decimal("0.00"), description="Open amount 31–60 days overdue")
    days_61_to_90: Decimal = Field(Decimal("0.00"), description="Open amount 61–90 days overdue")
    over_90: Decimal = Field(Decimal("0.00"), description="Open amount > 90 days overdue")
    total: Decimal = Field(Decimal("0.00"), description="Total open amount across all buckets")
    invoice_count: int = Field(0, description="Number of open invoices in this group")


# ---------------------------------------------------------------------------
# Grand totals model — cross-customer / cross-currency sums
# ---------------------------------------------------------------------------


class ARAgingGrandTotals(BaseModel):
    """
    Cross-customer sum of every ageing bucket.

    When the response contains invoices across multiple currencies the grand
    totals only make accounting sense if filtered to a single currency via
    the ``currency`` query parameter.  The backend still returns the raw
    aggregated sums regardless — the caller is responsible for currency
    interpretation.

    Attributes:
        current:        Grand total for the current (not-yet-due) bucket.
        days_1_to_30:   Grand total for the 1–30 days overdue bucket.
        days_31_to_60:  Grand total for the 31–60 days overdue bucket.
        days_61_to_90:  Grand total for the 61–90 days overdue bucket.
        over_90:        Grand total for the > 90 days overdue bucket.
        total:          Grand total across all buckets.
        customer_count: Number of distinct customers in the result set.
        invoice_count:  Total number of open invoices across all customers.
    """

    model_config = _RESPONSE_CONFIG

    current: Decimal = Field(Decimal("0.00"))
    days_1_to_30: Decimal = Field(Decimal("0.00"))
    days_31_to_60: Decimal = Field(Decimal("0.00"))
    days_61_to_90: Decimal = Field(Decimal("0.00"))
    over_90: Decimal = Field(Decimal("0.00"))
    total: Decimal = Field(Decimal("0.00"))
    customer_count: int = Field(0)
    invoice_count: int = Field(0)


# ---------------------------------------------------------------------------
# Top-level report model
# ---------------------------------------------------------------------------


class ARAgingReport(BaseModel):
    """
    Full AR Aging report as returned by the API.

    Attributes:
        as_of_date:   The reference date used for computing days overdue.
        customers:    One row per (customer, currency) group with outstanding
                      balance; ordered by total descending then customer_name
                      ascending.
        grand_totals: Cross-customer aggregation of all buckets.
    """

    model_config = _RESPONSE_CONFIG

    as_of_date: date = Field(..., description="Reference date used for daysOverdue computation")
    customers: List[ARAgingCustomerRow] = Field(
        default_factory=list,
        description="One row per (customerId, currency) group with outstanding balance",
    )
    grand_totals: ARAgingGrandTotals = Field(
        default_factory=ARAgingGrandTotals,
        description="Cross-customer bucket sums",
    )


# ---------------------------------------------------------------------------
# Query param helper (not a DB model — used internally by the route)
# ---------------------------------------------------------------------------


class ARAgingParams(BaseModel):
    """
    Validated query parameters for the AR Aging endpoint.

    Not exposed directly in the API response.  The route handler resolves
    these from FastAPI Query() dependencies and passes them to the service.

    Attributes:
        organization_id: Owning organisation UUID — required.
        customer_id:     Optional FK filter to a single customer.
        as_of_date:      Reference date for daysOverdue; defaults to today UTC.
        currency:        If set, filters the result set to this currency only.
    """

    organization_id: str
    customer_id: Optional[str] = None
    as_of_date: date
    currency: Optional[str] = None
