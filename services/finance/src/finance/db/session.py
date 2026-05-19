"""
Database Session Management

Provides async SQLAlchemy engine and session factory for the finance service.
Uses asyncmy as the MySQL async driver in production.
In the test suite, DATABASE_URL is overridden to use SQLite+aiosqlite.
"""

import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from ..config import settings

# Allow DATABASE_URL env var to override settings (used by test suite for SQLite)
_database_url = os.environ.get("DATABASE_URL", settings.database_url)

# Async engine
engine = create_async_engine(
    _database_url,
    echo=settings.DEBUG,
    pool_pre_ping=True,
)

# Session factory
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency that yields a database session per request.

    Yields:
        AsyncSession: An active SQLAlchemy async session.

    Raises:
        Exception: Any unhandled exception causes the session to rollback.
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


@asynccontextmanager
async def get_db_context() -> AsyncGenerator[AsyncSession, None]:
    """
    Context manager version of get_db for use outside FastAPI request lifecycle
    (e.g. seed loaders, background tasks).

    Yields:
        AsyncSession: An active SQLAlchemy async session.
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
