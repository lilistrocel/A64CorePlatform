"""
Core Finance Utilities

Cross-cutting helpers that both ops-side modules (sales, purchasing) use when
they need to interact with finance-owned data without introducing a direct
dependency on the finance microservice's internal code.

Modules
-------
company_resolver    — resolve the effective companyCode for an operation from
                      the user's org context via the finance microservice HTTP API.
finance_ext_client  — HTTP helpers for item finance ext, customer finance ext,
                      and tax-code rate lookups (extracted from sales in T-200.22b).
"""

from .finance_ext_client import (
    get_customer_finance_ext,
    get_item_finance_ext,
    get_tax_percent,
)

__all__ = [
    "get_customer_finance_ext",
    "get_item_finance_ext",
    "get_tax_percent",
]
