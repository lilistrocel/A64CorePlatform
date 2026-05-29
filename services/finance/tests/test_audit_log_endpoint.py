"""
Tests for GET /api/v1/finance/audit-log (T-060.11-audit)

Coverage:
  - Happy path: filter by entityType=FiscalPeriod + entityId → returns rows.
  - Filter by action=CLOSE → only that action returned.
  - Empty result: entity with no audit history → 200 + empty items list.
  - Reject: invalid entityType not in allow-list → 422.
  - Cross-org isolation: entity belongs to org A, requester scoped to org B
    → 200 + empty items (filter, not 403).
  - Missing required query params → 422.
  - Auth: non-finance role → 403.
  - Pagination: create 5 audit rows, fetch with size=2 → returns 2 rows.
  - finance_reviewer role is allowed (read-only).
"""

import os
import uuid
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
from finance.models.orm.models import AuditLog  # noqa: E402

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_BASE = "/api/v1/finance"
_ORG_A = "al-test-org-aaaa-0000-000000000001"
_ORG_B = "al-test-org-bbbb-0000-000000000002"

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
    """Async HTTP client with the DB session overridden to the test session."""

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


def _make_jwt(role: str = "finance_admin", user_id: str = "test-user-al") -> str:
    """Generate a test JWT signed with the test SECRET_KEY."""
    from jose import jwt

    payload = {
        "userId": user_id,
        "email": "test@a64core.com",
        "role": role,
        "type": "access",
        "exp": datetime.utcnow() + timedelta(hours=1),
    }
    return jwt.encode(payload, "test_secret_key", algorithm="HS256")


def _auth(role: str = "finance_admin", user_id: str = "test-user-al") -> dict:
    return {"Authorization": f"Bearer {_make_jwt(role=role, user_id=user_id)}"}


# ---------------------------------------------------------------------------
# Helpers — insert audit_log rows directly via the ORM
# ---------------------------------------------------------------------------


async def _insert_audit_row(
    db: AsyncSession,
    *,
    organization_id: str = _ORG_A,
    entity_type: str = "FiscalPeriod",
    entity_id: str,
    action: str = "CLOSE",
    actor_user_id: str = "actor-user-001",
    before_json: dict | None = None,
    after_json: dict | None = None,
) -> AuditLog:
    """Insert a single audit_log row and return it (not committed — test
    uses the fixture session which rolls back after each test)."""
    row = AuditLog(
        auditId=str(uuid.uuid4()),
        organizationId=organization_id,
        actorUserId=actor_user_id,
        action=action,
        entityType=entity_type,
        entityId=entity_id,
        beforeJson=before_json or {"status": "open"},
        afterJson=after_json or {"status": "closed", "reason": None},
    )
    db.add(row)
    await db.flush()
    return row


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_happy_path_returns_audit_rows(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Happy path: insert 2 rows for one entity → endpoint returns both."""
    entity_id = str(uuid.uuid4())
    await _insert_audit_row(db_session, entity_id=entity_id, action="CLOSE")
    await _insert_audit_row(db_session, entity_id=entity_id, action="REOPEN")

    resp = await client.get(
        f"{_BASE}/audit-log",
        params={
            "organization_id": _ORG_A,
            "entity_type": "FiscalPeriod",
            "entity_id": entity_id,
        },
        headers=_auth(),
    )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] == 2
    assert len(body["items"]) == 2
    # Both inserted actions are present (order may collapse to insertion order
    # in SQLite in-memory due to identical server-default timestamps).
    actions_returned = {item["action"] for item in body["items"]}
    assert actions_returned == {"CLOSE", "REOPEN"}
    # Confirm required fields present on the first item
    item = body["items"][0]
    assert "auditLogId" in item
    assert item["entityType"] == "FiscalPeriod"
    assert item["entityId"] == entity_id
    assert item["organizationId"] == _ORG_A
    assert item["actorUserId"] == "actor-user-001"


@pytest.mark.asyncio
async def test_filter_by_action_returns_only_matching_rows(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Filter by action=CLOSE → only CLOSE rows returned."""
    entity_id = str(uuid.uuid4())
    await _insert_audit_row(db_session, entity_id=entity_id, action="CLOSE")
    await _insert_audit_row(db_session, entity_id=entity_id, action="REOPEN")
    await _insert_audit_row(db_session, entity_id=entity_id, action="CLOSE")

    resp = await client.get(
        f"{_BASE}/audit-log",
        params={
            "organization_id": _ORG_A,
            "entity_type": "FiscalPeriod",
            "entity_id": entity_id,
            "action": "CLOSE",
        },
        headers=_auth(),
    )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] == 2
    assert all(item["action"] == "CLOSE" for item in body["items"])


@pytest.mark.asyncio
async def test_entity_with_no_audit_history_returns_empty(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Entity with no audit_log rows → 200 with empty items list."""
    non_existent_entity = str(uuid.uuid4())

    resp = await client.get(
        f"{_BASE}/audit-log",
        params={
            "organization_id": _ORG_A,
            "entity_type": "FiscalPeriod",
            "entity_id": non_existent_entity,
        },
        headers=_auth(),
    )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] == 0
    assert body["items"] == []


@pytest.mark.asyncio
async def test_invalid_entity_type_returns_422(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """entity_type not in allow-list → 422 Unprocessable Entity."""
    resp = await client.get(
        f"{_BASE}/audit-log",
        params={
            "organization_id": _ORG_A,
            "entity_type": "SomethingArbitrary",
            "entity_id": str(uuid.uuid4()),
        },
        headers=_auth(),
    )
    assert resp.status_code == 422, resp.text


@pytest.mark.asyncio
async def test_cross_org_access_returns_empty_not_403(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Entity belongs to org A; requester is scoped to org B.
    Result: 200 + empty items — we filter silently, not 403, to avoid
    disclosing entity existence to unauthorised callers.
    """
    entity_id = str(uuid.uuid4())
    # Insert a row for org A
    await _insert_audit_row(db_session, organization_id=_ORG_A, entity_id=entity_id)

    # Request scoped to org B — should see nothing
    resp = await client.get(
        f"{_BASE}/audit-log",
        params={
            "organization_id": _ORG_B,
            "entity_type": "FiscalPeriod",
            "entity_id": entity_id,
        },
        headers=_auth(),
    )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] == 0
    assert body["items"] == []


@pytest.mark.asyncio
async def test_missing_organization_id_returns_422(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Missing required organization_id → 422."""
    resp = await client.get(
        f"{_BASE}/audit-log",
        params={
            "entity_type": "FiscalPeriod",
            "entity_id": str(uuid.uuid4()),
        },
        headers=_auth(),
    )
    assert resp.status_code == 422, resp.text


@pytest.mark.asyncio
async def test_missing_entity_type_returns_422(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Missing required entity_type → 422."""
    resp = await client.get(
        f"{_BASE}/audit-log",
        params={
            "organization_id": _ORG_A,
            "entity_id": str(uuid.uuid4()),
        },
        headers=_auth(),
    )
    assert resp.status_code == 422, resp.text


@pytest.mark.asyncio
async def test_missing_entity_id_returns_422(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Missing required entity_id → 422."""
    resp = await client.get(
        f"{_BASE}/audit-log",
        params={
            "organization_id": _ORG_A,
            "entity_type": "FiscalPeriod",
        },
        headers=_auth(),
    )
    assert resp.status_code == 422, resp.text


@pytest.mark.asyncio
async def test_non_finance_role_returns_403(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """A user with role 'worker' (not in finance read roles) → 403."""
    resp = await client.get(
        f"{_BASE}/audit-log",
        params={
            "organization_id": _ORG_A,
            "entity_type": "FiscalPeriod",
            "entity_id": str(uuid.uuid4()),
        },
        headers=_auth(role="worker"),
    )
    assert resp.status_code == 403, resp.text


@pytest.mark.asyncio
async def test_finance_reviewer_is_allowed(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """finance_reviewer role has read access to the audit log."""
    entity_id = str(uuid.uuid4())
    await _insert_audit_row(db_session, entity_id=entity_id, action="CLOSE")

    resp = await client.get(
        f"{_BASE}/audit-log",
        params={
            "organization_id": _ORG_A,
            "entity_type": "FiscalPeriod",
            "entity_id": entity_id,
        },
        headers=_auth(role="finance_reviewer"),
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["total"] == 1


@pytest.mark.asyncio
async def test_pagination_smoke_size_2_of_5(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """
    Insert 5 audit rows for one entity. Fetch with size=2 → returns 2 rows,
    total=5, pages=3.
    """
    entity_id = str(uuid.uuid4())
    for i in range(5):
        await _insert_audit_row(
            db_session,
            entity_id=entity_id,
            action="CLOSE" if i % 2 == 0 else "REOPEN",
        )

    resp = await client.get(
        f"{_BASE}/audit-log",
        params={
            "organization_id": _ORG_A,
            "entity_type": "FiscalPeriod",
            "entity_id": entity_id,
            "size": 2,
            "page": 1,
        },
        headers=_auth(),
    )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] == 5
    assert len(body["items"]) == 2
    assert body["size"] == 2
    assert body["pages"] == 3


@pytest.mark.asyncio
async def test_journal_entry_entity_type_allowed(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """JournalEntry is also in the allow-list and returns its rows correctly."""
    entity_id = str(uuid.uuid4())
    row = AuditLog(
        auditId=str(uuid.uuid4()),
        organizationId=_ORG_A,
        actorUserId="actor-je-user",
        action="manual_je_posted",
        entityType="JournalEntry",
        entityId=entity_id,
        beforeJson=None,
        afterJson={"jeId": entity_id, "jeNumber": "JE-TEST-2026-0001"},
    )
    db_session.add(row)
    await db_session.flush()

    resp = await client.get(
        f"{_BASE}/audit-log",
        params={
            "organization_id": _ORG_A,
            "entity_type": "JournalEntry",
            "entity_id": entity_id,
        },
        headers=_auth(),
    )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] == 1
    assert body["items"][0]["action"] == "manual_je_posted"
    assert body["items"][0]["beforeJson"] is None


@pytest.mark.asyncio
async def test_unauthenticated_request_returns_403(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """No Authorization header → 403."""
    resp = await client.get(
        f"{_BASE}/audit-log",
        params={
            "organization_id": _ORG_A,
            "entity_type": "FiscalPeriod",
            "entity_id": str(uuid.uuid4()),
        },
    )
    assert resp.status_code == 403, resp.text
