"""
Sales Module — Finance-Ext HTTP Client (shared internal helper)

Provides the ``get_item_finance_ext``, ``get_customer_finance_ext``, and
``get_tax_percent`` coroutines used by multiple service modules in this package.
Factored out here to avoid copy-pasting the HTTP call pattern into every service
that needs finance-extension data.

Architectural rule (T-100.9a.1):
  ``sale_item_finance_ext``, ``customer_finance_ext``, and ``tax_codes`` live in
  the finance microservice's MySQL DB.  Ops services MUST call the finance
  service via HTTP.  Never query these as MongoDB collections from the ops
  backend.

Usage
-----
::

    from ._finance_ext_client import get_item_finance_ext, get_tax_percent

    ext = await get_item_finance_ext(item_id, org_id, auth_token)
    is_stock: bool = ext.get("isStock", True)

    tax_pct = await get_tax_percent("S", org_id, auth_token)

"""

from __future__ import annotations

import logging
import os
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Dict, Optional

import httpx

logger = logging.getLogger(__name__)

# Finance service base URL (internal — routed through Nginx in production).
# Falls back to the Docker Compose service name on the internal network.
_FINANCE_BASE_URL = os.getenv("FINANCE_SERVICE_URL", "http://finance:8001")


async def get_item_finance_ext(
    item_id: str,
    org_id: str,
    auth_token: Optional[str],
) -> Dict[str, Any]:
    """
    Fetch the sale_item_finance_ext record from the finance microservice via HTTP.

    ``sale_item_finance_ext`` lives in the finance service's MySQL DB — it must
    NOT be queried as a MongoDB collection from the ops backend.

    Args:
        item_id:    MongoDB itemId UUID string.
        org_id:     Organisation UUID for scoping.
        auth_token: Bearer token from the calling user's JWT, forwarded to
                    the finance service for authentication.

    Returns:
        Dict of the finance extension fields (camelCase, matching the
        finance service's SaleItemFinanceExtResponse schema).  Includes
        ``isStock`` (bool, defaults True if absent from response).

    Raises:
        ValueError: If the finance service returns 404 (no ext configured)
                    or a non-2xx status.
    """
    url = f"{_FINANCE_BASE_URL}/api/v1/finance/item-finance-ext/{item_id}"
    headers: Dict[str, str] = {}
    if auth_token:
        headers["Authorization"] = f"Bearer {auth_token}"

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                url,
                params={"organization_id": org_id},
                headers=headers,
            )
    except Exception as exc:  # noqa: BLE001
        raise ValueError(
            f"Finance service unreachable when looking up item '{item_id}': {exc}. "
            "Ensure FINANCE_SERVICE_URL is set and the finance service is running."
        ) from exc

    if resp.status_code == 404:
        raise ValueError(
            f"Item '{item_id}' has no sale_item_finance_ext record in org '{org_id}'. "
            "Configure the item's finance extension (revenueAccountId) before invoicing."
        )

    if not resp.is_success:
        raise ValueError(
            f"Finance service returned HTTP {resp.status_code} when looking up "
            f"item '{item_id}' finance ext. Response: {resp.text[:200]}"
        )

    body = resp.json()
    # Reason: finance service wraps data under 'data' key per its SuccessResponse.
    return body.get("data", body)


_TWOPLACES = Decimal("0.01")


async def get_tax_percent(
    tax_code: Optional[str],
    org_id: str,
    auth_token: Optional[str],
) -> Decimal:
    """
    Fetch the tax rate for a given tax code from the finance microservice via HTTP.

    ``tax_codes`` live exclusively in the finance microservice's MySQL DB — they
    must NOT be queried as a MongoDB collection from the ops backend (T-100.9a.1).

    Args:
        tax_code:   Tax code string (e.g. "S" for UAE 5% standard rate), or None
                    for exempt lines.
        org_id:     Organisation UUID for scoping.
        auth_token: Bearer token from the calling user's JWT, forwarded to the
                    finance service for authentication.

    Returns:
        Tax rate as Decimal quantized to 2 decimal places (e.g. Decimal("5.00")).
        Returns Decimal("0.00") immediately when tax_code is None or empty —
        no HTTP call is made for exempt lines.

    Raises:
        ValueError: If the tax code is not found in the organisation's tax code list.
        ValueError: If the finance service returns a non-2xx status.
        ValueError: If the finance service is unreachable (wraps httpx exceptions).
    """
    # Reason: exempt lines have no taxCodeId; return zero without an HTTP round-trip.
    if not tax_code:
        return Decimal("0.00")

    url = f"{_FINANCE_BASE_URL}/api/v1/finance/tax-codes"
    headers: Dict[str, str] = {}
    if auth_token:
        headers["Authorization"] = f"Bearer {auth_token}"

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                url,
                params={"organization_id": org_id},
                headers=headers,
            )
    except Exception as exc:  # noqa: BLE001
        raise ValueError(
            f"Finance service unreachable when looking up tax code '{tax_code}': {exc}. "
            "Ensure FINANCE_SERVICE_URL is set and the finance service is running."
        ) from exc

    if not resp.is_success:
        raise ValueError(
            f"Finance service returned HTTP {resp.status_code} when looking up "
            f"tax codes for org '{org_id}'. Response: {resp.text[:200]}"
        )

    body = resp.json()
    # Reason: finance service wraps list responses under 'data' key per its
    # SuccessResponse schema.  Each entry has 'taxCode' (str) and 'rate' (str).
    codes = body.get("data", [])
    for tc in codes:
        if tc.get("taxCode") == tax_code:
            return Decimal(str(tc["rate"])).quantize(_TWOPLACES, rounding=ROUND_HALF_UP)

    # Reason: fail-hard — silently returning 0 when a tax code is unknown was the
    # exact root cause of the T-202 P0 bug (VAT obligation missing from GL).
    raise ValueError(
        f"Tax code '{tax_code}' not found in org '{org_id}'. "
        "Configure it in the finance service before posting."
    )
