"""
Shared pytest fixtures for the finance service.

Uses SQLite in-memory via aiosqlite for fast, isolated tests.
No MySQL container required to run the test suite.

IMPORTANT: DATABASE_URL must be set BEFORE importing finance modules
so session.py picks up the SQLite URL at module load time.
"""

import os

# Override DB and secret BEFORE importing any finance module
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"
os.environ.setdefault("SECRET_KEY", "test_secret_key")
# Service-to-service secret used by events ingest endpoint (test value)
os.environ.setdefault("FINANCE_INGESTION_SECRET", "test-ingest-secret")

from typing import AsyncGenerator  # noqa: E402

import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine  # noqa: E402

from finance.db.session import engine, get_db  # noqa: E402
from finance.main import app  # noqa: E402
from finance.models.orm.base import Base  # noqa: E402
from finance.models.orm.models import (  # noqa: E402, F401
    AuditLog,
    CompanyCode,
    CostCenter,
    CustomerFinanceExt,
    FiscalPeriod,
    GLAccount,
    OutboxEventsProcessed,
    TaxCode,
    Vendor,
)


@pytest_asyncio.fixture(scope="session", autouse=True)
async def create_tables():
    """Create all tables once per test session using the SQLite engine."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


# Shared session factory for tests (same engine as session.py which uses SQLite)
_TestSessionLocal = async_sessionmaker(
    bind=engine, class_=AsyncSession, expire_on_commit=False
)


@pytest_asyncio.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """Provide a session per test (rolled back after each test)."""
    async with _TestSessionLocal() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """
    Async HTTP client with DB session overridden to the test session.

    Uses ASGI transport — no live server required.
    """

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


def make_token(
    user_id: str = "user-123",
    email: str = "test@a64core.com",
    role: str = "finance_admin",
) -> str:
    """
    Generate a test JWT signed with the test SECRET_KEY.

    Args:
        user_id: Token subject.
        email: User email.
        role: User role string.

    Returns:
        Bearer token string (without "Bearer " prefix).
    """
    from datetime import datetime, timedelta

    from jose import jwt

    payload = {
        "userId": user_id,
        "email": email,
        "role": role,
        "type": "access",
        "exp": datetime.utcnow() + timedelta(hours=1),
    }
    return jwt.encode(payload, "test_secret_key", algorithm="HS256")


def auth_headers(role: str = "finance_admin") -> dict:
    """Return Authorization headers for the given role."""
    return {"Authorization": f"Bearer {make_token(role=role)}"}
