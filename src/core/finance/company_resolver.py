"""
Core Finance — Company Code Resolver

Resolves the effective companyCode for an ops-side operation by querying the
finance microservice via HTTP.  This helper is used by both the sales and
purchasing modules so that neither module hard-codes a companyCode default.

Resolution order
----------------
1. ``explicit`` — if the caller already has a validated company code (e.g. it
   was read from an existing persisted document), return it immediately.
2. Auto-resolve — call ``GET /api/v1/finance/companies?organization_id=...``
   against the finance microservice.
   - Exactly 1 row → return its ``companyCode``.
   - 0 rows → raise ``HTTPException 400`` (org has no company configured).
   - >1 rows → raise ``HTTPException 400`` (multi-company: caller must send
     ``companyCode`` explicitly; T-201.1 will expose the UX picker).

Caching
-------
Results are memoized per ``(organization_id)`` within a single request
lifecycle using a plain ``dict`` stored on the shared module namespace.
The cache is intentionally request-scoped via an explicit ``_cache`` argument
so tests can isolate test cases without global state leakage.

Cross-service pattern
---------------------
Mirrors ``_get_item_finance_ext`` and ``_get_customer_finance_ext`` in
``src/modules/sales/services/ar_invoice_service.py`` (documented in the
T-100.9a Lessons-Learned note in BACKLOG.md):
- Module-level constant ``_FINANCE_BASE_URL`` from ``FINANCE_SERVICE_URL`` env.
- 5-second timeout.
- Forward the caller's Bearer token if provided.
- Finance service wraps responses under a ``data`` key.
- 4xx / 5xx responses surface as ``HTTPException`` (not ``ValueError``) because
  this helper is called from the API layer where HTTP exceptions are appropriate.
"""

from __future__ import annotations

import logging
import os
from typing import Dict, Optional

import httpx
from fastapi import HTTPException, status

logger = logging.getLogger(__name__)

# Finance service base URL — falls back to the Docker Compose service name.
_FINANCE_BASE_URL = os.getenv("FINANCE_SERVICE_URL", "http://finance:8001")


async def resolve_company_code(
    organization_id: str,
    explicit: Optional[str] = None,
    auth_token: Optional[str] = None,
    _cache: Optional[Dict[str, str]] = None,
) -> str:
    """
    Resolve the effective companyCode for an operation.

    Resolution order:
      1. ``explicit`` — returned as-is (caller provides a known code).
      2. Auto-resolve from the finance microservice's company_codes table.
         - Exactly one company → return its ``companyCode``.
         - Zero companies → HTTPException 400 (no company configured).
         - Multiple companies → HTTPException 400 (send ``companyCode``
           explicitly; multi-company UX is T-201.1).

    Args:
        organization_id: Organisation UUID string.  Used to scope the finance
            service lookup.
        explicit: Caller-supplied company code.  When not None or empty, it is
            returned immediately without a finance service call.
        auth_token: Optional Bearer token forwarded to the finance service for
            authentication.  Falls back to unauthenticated if None (the finance
            service will reject requests without valid credentials; the ops
            backend should always forward the user's JWT here).
        _cache: Optional mutable dict for per-request memoization.  Callers
            that make multiple resolver calls in one request lifecycle should
            pass the same dict instance to avoid redundant HTTP round-trips.
            Tests pass a fresh ``{}`` per test to guarantee isolation.

    Returns:
        The resolved company code string (e.g. ``"A001"``).

    Raises:
        HTTPException 400: If the org has no company configured or has multiple
            companies without an explicit code being provided.
        HTTPException 503: If the finance microservice is unreachable.
    """
    # Step 1 — honour explicit override.
    if explicit:
        return explicit

    # Step 2 — per-request memoization (avoid repeated HTTP calls for the same
    # org within one request, e.g. when processing multiple invoice lines).
    if _cache is not None:
        cached = _cache.get(organization_id)
        if cached is not None:
            logger.debug(
                "[CompanyResolver] cache hit for org '%s' → '%s'",
                organization_id,
                cached,
            )
            return cached

    # Step 3 — query the finance microservice.
    url = f"{_FINANCE_BASE_URL}/api/v1/finance/companies"
    headers: Dict[str, str] = {}
    if auth_token:
        headers["Authorization"] = f"Bearer {auth_token}"

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                url,
                params={"organization_id": organization_id},
                headers=headers,
            )
    except Exception as exc:  # noqa: BLE001
        # Reason: finance service unreachable — surface as 503 so the caller
        # knows it is a transient infrastructure issue, not a data-validation
        # problem.  Do NOT silently fall back to "1000" or any hardcoded value.
        logger.error(
            "[CompanyResolver] Finance service unreachable for org '%s': %s",
            organization_id,
            exc,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Finance service is unreachable.  Cannot resolve company code "
                "for this organisation.  Ensure the finance service is running "
                "and FINANCE_SERVICE_URL is configured correctly."
            ),
        ) from exc

    if not resp.is_success:
        logger.error(
            "[CompanyResolver] Finance service returned HTTP %d for org '%s': %s",
            resp.status_code,
            organization_id,
            resp.text[:200],
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                f"Finance service returned HTTP {resp.status_code} when resolving "
                f"company code for organisation '{organization_id}'."
            ),
        )

    body = resp.json()
    # Reason: finance service wraps all successful responses under a ``data`` key
    # (see ``utils/responses.py`` → ``success()`` helper in the finance service).
    companies: list = body.get("data", body) or []

    # Step 4 — evaluate the company list.
    if len(companies) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Organisation '{organization_id}' has no company configured in the "
                "finance service.  Create a company via Settings → Finance → "
                "Company Codes before creating purchasing or sales documents."
            ),
        )

    if len(companies) > 1:
        codes = ", ".join(c.get("companyCode", "?") for c in companies)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Organisation '{organization_id}' has multiple companies ({codes}). "
                "Send 'companyCode' explicitly in the request body to identify "
                "which company this document belongs to."
            ),
        )

    # Exactly one company — auto-resolve.
    resolved: str = companies[0]["companyCode"]
    logger.info(
        "[CompanyResolver] auto-resolved org '%s' → company '%s'",
        organization_id,
        resolved,
    )

    # Populate cache for subsequent calls in this request.
    if _cache is not None:
        _cache[organization_id] = resolved

    return resolved
