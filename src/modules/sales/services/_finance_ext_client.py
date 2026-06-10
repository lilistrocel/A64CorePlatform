"""
Sales-side facade for the finance HTTP client.

Extracted to ``src/core/finance/finance_ext_client.py`` on 2026-06-10 (T-200.22b)
so both sales and purchasing can use the same HTTP client without duplicating
the implementation.  This module remains as a thin re-export shim so existing
sales callers (ar_invoice_service, ar_credit_note_service, return_request_service,
etc.) do not need to change their import statements.

Pattern matches T-200.22a's thin re-export approach for the purchasing chain
reconciler.
"""

from src.core.finance.finance_ext_client import (  # noqa: F401
    get_customer_finance_ext,
    get_item_finance_ext,
    get_tax_percent,
)
