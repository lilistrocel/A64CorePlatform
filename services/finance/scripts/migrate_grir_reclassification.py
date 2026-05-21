"""
One-off migration script: GR/IR account reclassification (Item 1).

Purpose
-------
Moves Goods Received Not Invoiced from Trade Payables (221000-002) into
Accrued Liabilities (223000-004) for all organizations.

Steps performed:
  1. For every organization that has a company_posting_setup row pointing at
     the old 221000-002 account, update grIrClearingAccountId to point at
     the new 223000-004 account (if it exists in that org's CoA).
  2. Mark 221000-002 as isActive=False in every organization where it exists.
     The row is NOT deleted — historical journal entries reference it and
     must remain queryable.

Idempotent: safe to run multiple times.  Already-migrated rows are skipped.

Usage
-----
Run from the finance service root with DB connection env vars set:

    python -m scripts.migrate_grir_reclassification

Or directly:

    python services/finance/scripts/migrate_grir_reclassification.py

Environment variables required (matches docker-compose.finance.yml):
    MYSQL_HOST, MYSQL_PORT, MYSQL_DATABASE, MYSQL_USER, MYSQL_PASSWORD
"""

import asyncio
import logging
import os
import sys

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import create_async_engine

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)

_OLD_ACCOUNT_NUMBER = "221000-002"
_NEW_ACCOUNT_NUMBER = "223000-004"


def _build_url() -> str:
    """Build async MySQL URL from environment variables."""
    host = os.environ.get("MYSQL_HOST", "localhost")
    port = os.environ.get("MYSQL_PORT", "3307")
    db = os.environ.get("MYSQL_DATABASE", "finance_db")
    user = os.environ.get("MYSQL_USER", "finance_user")
    password = os.environ.get("MYSQL_PASSWORD", "finance_password")
    return f"mysql+aiomysql://{user}:{password}@{host}:{port}/{db}"


async def run_migration() -> None:
    """Execute the GR/IR reclassification migration."""
    url = _build_url()
    engine = create_async_engine(url, echo=False)

    async with engine.begin() as conn:
        # Step 1: For each org, update grIrClearingAccountId if it currently
        # points at 221000-002 and 223000-004 exists in that org's CoA.
        result = await conn.execute(
            sa.text(
                """
                UPDATE company_posting_setup ps
                INNER JOIN gl_accounts ga_old
                    ON ps.grIrClearingAccountId = ga_old.accountId
                    AND ga_old.accountNumber = :old_num
                    AND ga_old.organizationId = ps.organizationId
                INNER JOIN gl_accounts ga_new
                    ON ga_new.organizationId = ps.organizationId
                    AND ga_new.accountNumber = :new_num
                SET ps.grIrClearingAccountId = ga_new.accountId
                """
            ),
            {"old_num": _OLD_ACCOUNT_NUMBER, "new_num": _NEW_ACCOUNT_NUMBER},
        )
        migrated = result.rowcount
        logger.info(
            "Step 1: updated %d company_posting_setup row(s) — "
            "grIrClearingAccountId now points at %s",
            migrated,
            _NEW_ACCOUNT_NUMBER,
        )

        # Step 2: Deactivate 221000-002 in all organizations where it exists.
        # Reason: the row must be preserved (historical JE references) but
        # removed from the active CoA picker in the UI.
        result = await conn.execute(
            sa.text(
                """
                UPDATE gl_accounts
                SET isActive = 0
                WHERE accountNumber = :old_num
                  AND isActive = 1
                """
            ),
            {"old_num": _OLD_ACCOUNT_NUMBER},
        )
        deactivated = result.rowcount
        logger.info(
            "Step 2: deactivated %d gl_accounts row(s) with accountNumber=%s",
            deactivated,
            _OLD_ACCOUNT_NUMBER,
        )

    await engine.dispose()
    logger.info("Migration complete — idempotent, safe to re-run.")


if __name__ == "__main__":
    asyncio.run(run_migration())
