"""
Tests for POST /api/v1/finance/events/ingest

Covers:
    - Reject request with no X-Service-Secret header → 422 (FastAPI rejects missing required header)
    - Reject with wrong X-Service-Secret → 401
    - Valid sales_order_shipped event → 200 with status=processed
    - Same eventId a second time → 200 with status=already_processed, no duplicate row
    - Unknown eventType → 400
    - Malformed payload (missing required field) → 400
    - Valid harvest_recorded event → 200 with status=processed
"""

import os
import uuid
from datetime import datetime
from typing import Any, Dict

# Override DB and secrets BEFORE importing any finance module.
# conftest.py also sets DATABASE_URL but this file may be collected first.
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("SECRET_KEY", "test_secret_key")
os.environ["FINANCE_INGESTION_SECRET"] = "test-ingest-secret"

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

# These imports rely on conftest.py having set DATABASE_URL before module load
from finance.db.session import engine, get_db
from finance.main import app
from finance.models.orm.models import OutboxEventsProcessed

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

_INGEST_URL = "/api/v1/finance/events/ingest"
_VALID_SECRET = "test-ingest-secret"
_WRONG_SECRET = "wrong-secret"


def _make_valid_event(
    event_id: str | None = None,
    event_type: str = "sales_order_shipped",
) -> Dict[str, Any]:
    """Return a valid BaseFinanceEvent-compatible dict."""
    return {
        "eventId": event_id or str(uuid.uuid4()),
        "eventType": event_type,
        "organizationId": str(uuid.uuid4()),
        "companyCode": "A001",
        "occurredAt": datetime.utcnow().isoformat(),
        "sourceUserId": str(uuid.uuid4()),
        "sourceDocumentId": "order-001",
        "payload": {
            "salesOrderId": str(uuid.uuid4()),
            "customerId": str(uuid.uuid4()),
            "farmCode": "ALAIN-01",
            "lines": [
                {
                    "productId": str(uuid.uuid4()),
                    "productName": "Butterhead Lettuce",
                    "quantityKg": "50.00",
                    "unitPrice": "12.50",
                    "lineTotal": "625.00",
                    "taxCode": "VAT5",
                    "taxAmount": "31.25",
                    "standardCostPerKg": "4.20",
                }
            ],
            "totalNetAmount": "625.00",
            "totalTaxAmount": "31.25",
            "totalGrossAmount": "656.25",
        },
    }


from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

_TestSessionLocal = async_sessionmaker(
    bind=engine, class_=AsyncSession, expire_on_commit=False
)


@pytest_asyncio.fixture
async def db_session() -> AsyncSession:
    """Provide a fresh session per test (uses same engine as conftest)."""
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
# Test cases
# ---------------------------------------------------------------------------


async def test_reject_missing_secret(client: AsyncClient) -> None:
    """Request with no X-Service-Secret header → 401."""
    response = await client.post(
        _INGEST_URL,
        json=_make_valid_event(),
    )
    assert response.status_code == 422  # FastAPI rejects missing required header


async def test_reject_wrong_secret(client: AsyncClient) -> None:
    """Request with wrong X-Service-Secret → 401."""
    response = await client.post(
        _INGEST_URL,
        json=_make_valid_event(),
        headers={"X-Service-Secret": _WRONG_SECRET},
    )
    assert response.status_code == 401
    assert "Invalid" in response.json()["detail"]


async def test_valid_event_processed(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Valid event → 200 with status=processed, row in outbox_events_processed."""
    event_id = str(uuid.uuid4())
    response = await client.post(
        _INGEST_URL,
        json=_make_valid_event(event_id=event_id),
        headers={"X-Service-Secret": _VALID_SECRET},
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["status"] == "processed"
    assert data["eventId"] == event_id
    assert "processedAt" in data

    # Verify row exists in outbox_events_processed
    result = await db_session.execute(
        select(OutboxEventsProcessed).where(OutboxEventsProcessed.eventId == event_id)
    )
    row = result.scalar_one_or_none()
    assert row is not None, "Row must exist in outbox_events_processed"
    assert row.eventType == "sales_order_shipped"
    assert row.result.value == "success"


async def test_idempotency_already_processed(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Same eventId twice → second call returns already_processed, no duplicate row."""
    event_id = str(uuid.uuid4())
    event_data = _make_valid_event(event_id=event_id)
    headers = {"X-Service-Secret": _VALID_SECRET}

    # First call
    r1 = await client.post(_INGEST_URL, json=event_data, headers=headers)
    assert r1.status_code == 200
    assert r1.json()["status"] == "processed"

    # Second call — same eventId
    r2 = await client.post(_INGEST_URL, json=event_data, headers=headers)
    assert r2.status_code == 200
    data2 = r2.json()
    assert data2["status"] == "already_processed"
    assert data2["eventId"] == event_id
    assert "originalProcessedAt" in data2

    # Verify exactly ONE row in the table
    count_result = await db_session.execute(
        select(func.count()).select_from(OutboxEventsProcessed).where(
            OutboxEventsProcessed.eventId == event_id
        )
    )
    count = count_result.scalar()
    assert count == 1, f"Expected 1 row, got {count}"


async def test_unknown_event_type(client: AsyncClient) -> None:
    """Unknown eventType → 400."""
    event_data = _make_valid_event()
    event_data["eventType"] = "totally_unknown_event"
    response = await client.post(
        _INGEST_URL,
        json=event_data,
        headers={"X-Service-Secret": _VALID_SECRET},
    )
    assert response.status_code == 400
    assert "Unknown eventType" in response.json()["detail"]


async def test_malformed_payload(client: AsyncClient) -> None:
    """Malformed payload (missing required fields) → 400."""
    event_data = _make_valid_event()
    # Remove required payload field
    event_data["payload"] = {"salesOrderId": str(uuid.uuid4())}  # missing most fields
    response = await client.post(
        _INGEST_URL,
        json=event_data,
        headers={"X-Service-Secret": _VALID_SECRET},
    )
    assert response.status_code == 400
    assert "Invalid payload" in response.json()["detail"]


async def test_harvest_recorded_event(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Valid harvest_recorded event → 200 processed."""
    event_id = str(uuid.uuid4())
    event_data = {
        "eventId": event_id,
        "eventType": "harvest_recorded",
        "organizationId": str(uuid.uuid4()),
        "companyCode": "A001",
        "occurredAt": datetime.utcnow().isoformat(),
        "sourceUserId": str(uuid.uuid4()),
        "payload": {
            "harvestId": str(uuid.uuid4()),
            "plantDataId": str(uuid.uuid4()),
            "plantName": "Basil",
            "blockCode": "BLK-001",
            "farmCode": "ALAIN-01",
            "quantityKg": "25.50",
            "cropCategory": "herbs",
            "standardCostPerKg": "3.50",
        },
    }
    response = await client.post(
        _INGEST_URL,
        json=event_data,
        headers={"X-Service-Secret": _VALID_SECRET},
    )
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "processed"
