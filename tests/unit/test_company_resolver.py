"""
Unit tests for src/core/finance/company_resolver.py (T-201.0)

Covers:
  - explicit passthrough: resolve_company_code(explicit="X001") returns "X001"
  - auto-resolve (1 company): returns the single company's companyCode
  - zero companies → HTTPException 400
  - multiple companies → HTTPException 400
  - finance service unreachable (network error) → HTTPException 503
  - finance service 4xx/5xx response → HTTPException 503
  - per-request cache: second call with same org_id hits cache (no HTTP call)
  - cache isolation: separate cache dicts do not share state

All tests mock httpx.AsyncClient to avoid real network calls.
"""

from __future__ import annotations

import json
from typing import Dict
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from fastapi import HTTPException

from src.core.finance.company_resolver import resolve_company_code

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

ORG_ID = "org-test-001"


def _make_response(status_code: int, body: dict) -> MagicMock:
    """Return a mock httpx.Response with is_success, status_code, json(), text."""
    resp = MagicMock(spec=httpx.Response)
    resp.status_code = status_code
    resp.is_success = 200 <= status_code < 300
    resp.json.return_value = body
    resp.text = json.dumps(body)
    return resp


def _finance_ok(company_codes: list[str]) -> MagicMock:
    """Build a 200 response wrapping a list of company dicts."""
    companies = [{"companyCode": c, "companyName": f"Company {c}"} for c in company_codes]
    return _make_response(200, {"data": companies, "message": "ok"})


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestExplicitPassthrough:
    """When an explicit code is supplied the function must return it immediately."""

    @pytest.mark.asyncio
    async def test_explicit_returned_without_http_call(self):
        """No HTTP call should be made when explicit is provided."""
        with patch("src.core.finance.company_resolver.httpx.AsyncClient") as mock_client:
            result = await resolve_company_code(
                organization_id=ORG_ID,
                explicit="EXPLICIT01",
            )
        assert result == "EXPLICIT01"
        mock_client.assert_not_called()

    @pytest.mark.asyncio
    async def test_explicit_overrides_any_cache(self):
        """Explicit code ignores the cache."""
        cache: Dict[str, str] = {ORG_ID: "CACHED_CODE"}
        result = await resolve_company_code(
            organization_id=ORG_ID,
            explicit="OVERRIDE",
            _cache=cache,
        )
        assert result == "OVERRIDE"


class TestAutoResolve:
    """Auto-resolve path: call finance microservice."""

    @pytest.mark.asyncio
    async def test_single_company_resolved(self):
        """Exactly one company → return its companyCode."""
        mock_resp = _finance_ok(["A001"])

        with patch("src.core.finance.company_resolver.httpx.AsyncClient") as mock_cls:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_resp)
            mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_cls.return_value.__aexit__ = AsyncMock(return_value=None)

            result = await resolve_company_code(organization_id=ORG_ID)

        assert result == "A001"
        mock_client.get.assert_called_once()
        call_kwargs = mock_client.get.call_args
        assert "organization_id" in str(call_kwargs) or ORG_ID in str(call_kwargs)

    @pytest.mark.asyncio
    async def test_zero_companies_raises_400(self):
        """No companies configured → HTTPException 400."""
        mock_resp = _finance_ok([])

        with patch("src.core.finance.company_resolver.httpx.AsyncClient") as mock_cls:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_resp)
            mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_cls.return_value.__aexit__ = AsyncMock(return_value=None)

            with pytest.raises(HTTPException) as exc_info:
                await resolve_company_code(organization_id=ORG_ID)

        assert exc_info.value.status_code == 400
        assert "no company configured" in exc_info.value.detail.lower()

    @pytest.mark.asyncio
    async def test_multiple_companies_raises_400(self):
        """Multiple companies → HTTPException 400 with list of codes."""
        mock_resp = _finance_ok(["A001", "B002"])

        with patch("src.core.finance.company_resolver.httpx.AsyncClient") as mock_cls:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_resp)
            mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_cls.return_value.__aexit__ = AsyncMock(return_value=None)

            with pytest.raises(HTTPException) as exc_info:
                await resolve_company_code(organization_id=ORG_ID)

        assert exc_info.value.status_code == 400
        assert "A001" in exc_info.value.detail
        assert "B002" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_auth_token_forwarded(self):
        """Bearer token must appear in the Authorization header."""
        mock_resp = _finance_ok(["A001"])

        with patch("src.core.finance.company_resolver.httpx.AsyncClient") as mock_cls:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_resp)
            mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_cls.return_value.__aexit__ = AsyncMock(return_value=None)

            await resolve_company_code(
                organization_id=ORG_ID,
                auth_token="test-jwt-token",
            )

        call_kwargs = mock_client.get.call_args
        # Headers are passed as a keyword argument
        headers = call_kwargs.kwargs.get("headers", {})
        assert headers.get("Authorization") == "Bearer test-jwt-token"


class TestServiceErrors:
    """Finance service errors surface as appropriate HTTP exceptions."""

    @pytest.mark.asyncio
    async def test_network_error_raises_503(self):
        """ConnectError → HTTPException 503."""
        with patch("src.core.finance.company_resolver.httpx.AsyncClient") as mock_cls:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(side_effect=httpx.ConnectError("refused"))
            mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_cls.return_value.__aexit__ = AsyncMock(return_value=None)

            with pytest.raises(HTTPException) as exc_info:
                await resolve_company_code(organization_id=ORG_ID)

        assert exc_info.value.status_code == 503
        assert "unreachable" in exc_info.value.detail.lower()

    @pytest.mark.asyncio
    async def test_finance_500_raises_503(self):
        """HTTP 500 from finance service → HTTPException 503."""
        mock_resp = _make_response(500, {"error": "internal server error"})

        with patch("src.core.finance.company_resolver.httpx.AsyncClient") as mock_cls:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_resp)
            mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_cls.return_value.__aexit__ = AsyncMock(return_value=None)

            with pytest.raises(HTTPException) as exc_info:
                await resolve_company_code(organization_id=ORG_ID)

        assert exc_info.value.status_code == 503


class TestCaching:
    """Per-request memoization via _cache dict."""

    @pytest.mark.asyncio
    async def test_cache_populated_on_first_call(self):
        """After a successful call the _cache dict should contain the result."""
        mock_resp = _finance_ok(["A001"])
        cache: Dict[str, str] = {}

        with patch("src.core.finance.company_resolver.httpx.AsyncClient") as mock_cls:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_resp)
            mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_cls.return_value.__aexit__ = AsyncMock(return_value=None)

            result = await resolve_company_code(
                organization_id=ORG_ID,
                _cache=cache,
            )

        assert result == "A001"
        assert cache.get(ORG_ID) == "A001"

    @pytest.mark.asyncio
    async def test_cache_hit_skips_http_call(self):
        """Second call with same org_id and pre-populated cache → no HTTP call."""
        cache: Dict[str, str] = {ORG_ID: "A001"}

        with patch("src.core.finance.company_resolver.httpx.AsyncClient") as mock_cls:
            result = await resolve_company_code(
                organization_id=ORG_ID,
                _cache=cache,
            )
            mock_cls.assert_not_called()

        assert result == "A001"

    @pytest.mark.asyncio
    async def test_separate_caches_are_isolated(self):
        """Two calls with separate cache dicts should each make their own HTTP call."""
        mock_resp = _finance_ok(["A001"])

        with patch("src.core.finance.company_resolver.httpx.AsyncClient") as mock_cls:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_resp)
            mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_cls.return_value.__aexit__ = AsyncMock(return_value=None)

            cache_a: Dict[str, str] = {}
            cache_b: Dict[str, str] = {}

            await resolve_company_code(organization_id=ORG_ID, _cache=cache_a)
            await resolve_company_code(organization_id=ORG_ID, _cache=cache_b)

        # Two separate client.get calls (one per cache)
        assert mock_client.get.call_count == 2
