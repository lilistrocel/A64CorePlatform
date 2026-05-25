"""
Tests for period close/reopen audit trail fields (migration 013).

PATCH /api/v1/finance/periods/{period_id}/close
PATCH /api/v1/finance/periods/{period_id}/reopen

Coverage:
  - Close returns closedBy/closedAt/closeReason; reopened* fields are null.
  - Reopen returns reopened* populated; closed* fields are cleared.
  - Close-reopen-close cycle: fields update correctly on each transition.
  - Reopen without reason → 422 (required field).
  - Reopen reason too short (<5 chars) → 422.
  - Close with optional reason → reason saved; close without reason → null.
  - Existing close/reopen tests still pass (backward compatibility).
"""

import os
from datetime import datetime, timedelta

# Override DB and secrets BEFORE importing any finance module.
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("SECRET_KEY", "test_secret_key")
os.environ.setdefault("FINANCE_INGESTION_SECRET", "test-ingest-secret")

import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker  # noqa: E402

from finance.db.session import engine, get_db  # noqa: E402
from finance.main import app  # noqa: E402

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_BASE = "/api/v1/finance"
_ORG = "pa-test-org-0000-0000-000000000003"
_CODE = "PA01"

# ---------------------------------------------------------------------------
# Session + client fixtures
# ---------------------------------------------------------------------------

_TestSessionLocal = async_sessionmaker(
    bind=engine, class_=AsyncSession, expire_on_commit=False
)


@pytest_asyncio.fixture
async def db_session() -> AsyncSession:
    """Fresh session per test (rolled back after each test)."""
    async with _TestSessionLocal() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncClient:
    """Async HTTP client with DB session overridden to the test session."""

    async def _override_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_db
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------


def _make_jwt(
    role: str = "finance_admin",
    user_id: str = "test-user-pa",
) -> str:
    """Generate a test JWT signed with the test SECRET_KEY."""
    from jose import jwt

    payload = {
        "userId": user_id,
        "email": "pa@a64core.com",
        "role": role,
        "type": "access",
        "exp": datetime.utcnow() + timedelta(hours=1),
    }
    return jwt.encode(payload, "test_secret_key", algorithm="HS256")


def _auth(role: str = "finance_admin", user_id: str = "test-user-pa") -> dict:
    return {"Authorization": f"Bearer {_make_jwt(role=role, user_id=user_id)}"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _ensure_company(client: AsyncClient, code: str = _CODE) -> None:
    """Idempotent — create company if not already present."""
    resp = await client.get(
        f"{_BASE}/companies/{code}",
        headers=_auth(),
    )
    if resp.status_code == 404:
        await client.post(
            f"{_BASE}/companies",
            json={
                "companyCode": code,
                "organizationId": _ORG,
                "legalName": "Period Audit Test Co",
            },
            headers=_auth(),
        )


async def _create_period(
    client: AsyncClient,
    period_number: int,
    code: str = _CODE,
) -> str:
    """Create a fiscal period and return its periodId."""
    resp = await client.post(
        f"{_BASE}/periods",
        json={
            "companyCode": code,
            "fiscalYear": 2026,
            "periodNumber": period_number,
            "startDate": f"2026-{period_number:02d}-01",
            "endDate": f"2026-{period_number:02d}-28",
        },
        headers=_auth(),
    )
    assert resp.status_code == 201, f"Failed to create period {period_number}: {resp.text}"
    return resp.json()["data"]["periodId"]


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_close_period_populates_audit_fields(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Closing a period with a reason populates closedAt, closedByUserId,
    closeReason and leaves all reopened* fields null.
    """
    await _ensure_company(client)
    period_id = await _create_period(client, period_number=1)

    resp = await client.patch(
        f"{_BASE}/periods/{period_id}/close",
        json={"reason": "End of January 2026 — all accruals posted."},
        params={"organization_id": _ORG},
        headers=_auth(user_id="user-close-test"),
    )
    assert resp.status_code == 200, resp.text

    # Close endpoint returns SuccessResponse[ClosePeriodResponse]; the period
    # fields live under data["period"], not at data directly.
    data = resp.json()["data"]["period"]
    assert data["status"] == "closed"

    # Close audit fields must be populated
    assert data["closedAt"] is not None
    assert data["closedByUserId"] == "user-close-test"
    assert data["closeReason"] == "End of January 2026 — all accruals posted."

    # Reopen audit fields must be null
    assert data["reopenedAt"] is None
    assert data["reopenedByUserId"] is None
    assert data["reopenReason"] is None


@pytest.mark.asyncio
async def test_close_period_without_reason(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Closing without a reason body is allowed; closeReason is null."""
    await _ensure_company(client)
    period_id = await _create_period(client, period_number=2)

    # Close with no body at all (reason is optional)
    resp = await client.patch(
        f"{_BASE}/periods/{period_id}/close",
        params={"organization_id": _ORG},
        headers=_auth(),
    )
    assert resp.status_code == 200, resp.text

    data = resp.json()["data"]["period"]
    assert data["status"] == "closed"
    assert data["closedAt"] is not None
    assert data["closedByUserId"] is not None
    assert data["closeReason"] is None  # no body → null


@pytest.mark.asyncio
async def test_reopen_period_populates_audit_fields_and_clears_close(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Reopening a closed period:
    - populates reopenedAt, reopenedByUserId, reopenReason
    - clears closedAt, closedByUserId, closeReason
    """
    await _ensure_company(client)
    period_id = await _create_period(client, period_number=3)

    # Close it first
    await client.patch(
        f"{_BASE}/periods/{period_id}/close",
        json={"reason": "Initial close"},
        params={"organization_id": _ORG},
        headers=_auth(user_id="user-closer"),
    )

    # Reopen it
    resp = await client.patch(
        f"{_BASE}/periods/{period_id}/reopen",
        json={"reason": "Late journal entry from auditor — must repost."},
        params={"organization_id": _ORG},
        headers=_auth(user_id="user-reopener"),
    )
    assert resp.status_code == 200, resp.text

    # Reopen endpoint returns SuccessResponse[ReopenPeriodResponse]; period
    # fields live under data["period"].
    data = resp.json()["data"]["period"]
    assert data["status"] == "open"

    # Reopen audit fields populated
    assert data["reopenedAt"] is not None
    assert data["reopenedByUserId"] == "user-reopener"
    assert data["reopenReason"] == "Late journal entry from auditor — must repost."

    # Close audit fields cleared
    assert data["closedAt"] is None
    assert data["closedByUserId"] is None
    assert data["closeReason"] is None


@pytest.mark.asyncio
async def test_close_reopen_close_cycle(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Full close → reopen → close cycle.

    After the second close:
    - closedAt/closedByUserId/closeReason have the SECOND close values.
    - reopenedAt/reopenedByUserId/reopenReason are cleared.
    """
    await _ensure_company(client)
    period_id = await _create_period(client, period_number=4)

    # First close
    r1 = await client.patch(
        f"{_BASE}/periods/{period_id}/close",
        json={"reason": "First close"},
        params={"organization_id": _ORG},
        headers=_auth(user_id="user-c1"),
    )
    assert r1.status_code == 200

    # Reopen
    r2 = await client.patch(
        f"{_BASE}/periods/{period_id}/reopen",
        json={"reason": "Reversal needed for correcting entry"},
        params={"organization_id": _ORG},
        headers=_auth(user_id="user-r1"),
    )
    assert r2.status_code == 200

    # Second close
    r3 = await client.patch(
        f"{_BASE}/periods/{period_id}/close",
        json={"reason": "Re-closed after correction"},
        params={"organization_id": _ORG},
        headers=_auth(user_id="user-c2"),
    )
    assert r3.status_code == 200, r3.text

    data = r3.json()["data"]["period"]
    assert data["status"] == "closed"

    # Second close values
    assert data["closedByUserId"] == "user-c2"
    assert data["closeReason"] == "Re-closed after correction"
    assert data["closedAt"] is not None

    # Reopen fields cleared after second close
    assert data["reopenedAt"] is None
    assert data["reopenedByUserId"] is None
    assert data["reopenReason"] is None


@pytest.mark.asyncio
async def test_reopen_without_reason_returns_422(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Reopening with no body returns 422 (reason is required)."""
    await _ensure_company(client)
    period_id = await _create_period(client, period_number=5)

    await client.patch(
        f"{_BASE}/periods/{period_id}/close",
        params={"organization_id": _ORG},
        headers=_auth(),
    )

    # No body at all — reason field is required
    resp = await client.patch(
        f"{_BASE}/periods/{period_id}/reopen",
        params={"organization_id": _ORG},
        headers=_auth(),
    )
    assert resp.status_code == 422, resp.text


@pytest.mark.asyncio
async def test_reopen_reason_too_short_returns_422(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Reopening with a reason shorter than 5 chars returns 422."""
    await _ensure_company(client)
    period_id = await _create_period(client, period_number=6)

    await client.patch(
        f"{_BASE}/periods/{period_id}/close",
        params={"organization_id": _ORG},
        headers=_auth(),
    )

    resp = await client.patch(
        f"{_BASE}/periods/{period_id}/reopen",
        json={"reason": "abc"},  # 3 chars — below min_length=5
        params={"organization_id": _ORG},
        headers=_auth(),
    )
    assert resp.status_code == 422, resp.text


@pytest.mark.asyncio
async def test_close_period_not_found_returns_404(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Closing a non-existent period returns 404."""
    await _ensure_company(client)

    resp = await client.patch(
        f"{_BASE}/periods/nonexistent-period-id/close",
        params={"organization_id": _ORG},
        headers=_auth(),
    )
    assert resp.status_code == 404, resp.text


@pytest.mark.asyncio
async def test_close_already_closed_returns_409(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Closing an already-closed period returns 409 (backward compatibility)."""
    await _ensure_company(client)
    period_id = await _create_period(client, period_number=7)

    await client.patch(
        f"{_BASE}/periods/{period_id}/close",
        params={"organization_id": _ORG},
        headers=_auth(),
    )
    resp = await client.patch(
        f"{_BASE}/periods/{period_id}/close",
        params={"organization_id": _ORG},
        headers=_auth(),
    )
    assert resp.status_code == 409, resp.text


@pytest.mark.asyncio
async def test_reopen_already_open_returns_409(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Reopening an already-open period returns 409 (backward compatibility)."""
    await _ensure_company(client)
    period_id = await _create_period(client, period_number=8)

    resp = await client.patch(
        f"{_BASE}/periods/{period_id}/reopen",
        json={"reason": "Trying to reopen open period"},
        params={"organization_id": _ORG},
        headers=_auth(),
    )
    assert resp.status_code == 409, resp.text
