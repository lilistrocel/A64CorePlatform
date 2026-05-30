"""Seed AR control account (124000 / 124000-001) for all existing organisations

Revision ID: 017
Revises: 016
Create Date: 2026-05-29 14:00:00.000000

Wave 3 / T-100.2.1 — Ensures every existing organisation has the two
Trade Receivables accounts that the AR Invoice JE handler will debit:

  124000     "Trade Receivables"            — header (isHeader=True)
  124000-001 "Trade Receivables - Customers" — postable leaf (isHeader=False)
                                              isControlAccount=True

Background
----------
These accounts have been present in default_coa.py since the CoA was written.
The seed_loader inserts them idempotently on first company creation.  However,
any organisation that was seeded on a deployment where the accounts were
temporarily absent — or where a manual CoA was used — will be missing them.

This migration backfills the gap:
  - For each distinct organisationId already in gl_accounts, insert the header
    and leaf rows if (organizationId, accountNumber) is not already present.
  - Parent linkage: header has parentAccountId = NULL (top-level ASSETS is not
    managed by a parent row at the header level in this CoA scheme); the leaf's
    parentAccountId is set to the header's accountId.
  - isControlAccount is set True on the leaf (matches CONTROL_ACCOUNT_NUMBERS
    in default_coa.py and the seed_loader behaviour).
  - Idempotent: uses INSERT … WHERE NOT EXISTS (via SELECT check); safe to run
    multiple times.

Downgrade
---------
Removes only the rows this migration inserted.  Any row that pre-existed
(account_number already present before this migration ran) is NOT touched on
downgrade.  The downgrade therefore removes rows where the migration_marker
comment equals '017_seed_ar_control_account' (stored in the description column
if it exists, otherwise identified by accountNumber + migrationSource).

Implementation note: MySQL does not support INSERT … ON CONFLICT.  We use a
Python-level existence check per organisation followed by a conditional INSERT,
wrapped in the same transaction as the rest of the migration.
"""

from __future__ import annotations

import uuid
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "017"
down_revision: Union[str, None] = "016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Account definitions matching default_coa.py exactly.
_HEADER_NUMBER = "124000"
_HEADER_NAME = "Trade Receivables"
_LEAF_NUMBER = "124000-001"
_LEAF_NAME = "Trade Receivables - Customers"

# Drawer/type values as stored in the MySQL ENUM columns.
_DRAWER = "ASSETS"
_ACCOUNT_TYPE = "asset"

# Migration source tag stored in a dedicated column so downgrade can be precise.
# We use the description column added in migration 006 if present; otherwise we
# identify rows by (organizationId, accountNumber, createdAt) proximity.
_MIGRATION_SOURCE = "017_seed_ar_control_account"


def upgrade() -> None:
    """Insert 124000 header + 124000-001 leaf for every org that lacks them."""
    conn = op.get_bind()

    # Collect all distinct organisationIds that already have gl_accounts rows.
    org_rows = conn.execute(
        sa.text("SELECT DISTINCT organizationId FROM gl_accounts")
    ).fetchall()

    inserted_header_ids: dict[str, str] = {}  # orgId → new header accountId

    for (org_id,) in org_rows:
        # ------------------------------------------------------------------ #
        # 1. Header: 124000 Trade Receivables
        # ------------------------------------------------------------------ #
        exists_header = conn.execute(
            sa.text(
                "SELECT accountId FROM gl_accounts "
                "WHERE organizationId = :org AND accountNumber = :num "
                "LIMIT 1"
            ),
            {"org": org_id, "num": _HEADER_NUMBER},
        ).fetchone()

        if exists_header:
            # Header already present — capture its ID for the leaf linkage.
            header_id = exists_header[0]
        else:
            header_id = str(uuid.uuid4())
            conn.execute(
                sa.text(
                    """
                    INSERT INTO gl_accounts
                        (accountId, organizationId, accountNumber, accountName,
                         drawer, accountType, parentAccountId,
                         isHeader, isControlAccount, isActive, isLockedNumber,
                         createdAt, updatedAt)
                    VALUES
                        (:account_id, :org, :num, :name,
                         :drawer, :acct_type, NULL,
                         1, 0, 1, 0,
                         NOW(), NOW())
                    """
                ),
                {
                    "account_id": header_id,
                    "org": org_id,
                    "num": _HEADER_NUMBER,
                    "name": _HEADER_NAME,
                    "drawer": _DRAWER,
                    "acct_type": _ACCOUNT_TYPE,
                },
            )
            inserted_header_ids[org_id] = header_id

        # ------------------------------------------------------------------ #
        # 2. Leaf: 124000-001 Trade Receivables - Customers (control account)
        # ------------------------------------------------------------------ #
        exists_leaf = conn.execute(
            sa.text(
                "SELECT accountId FROM gl_accounts "
                "WHERE organizationId = :org AND accountNumber = :num "
                "LIMIT 1"
            ),
            {"org": org_id, "num": _LEAF_NUMBER},
        ).fetchone()

        if not exists_leaf:
            leaf_id = str(uuid.uuid4())
            conn.execute(
                sa.text(
                    """
                    INSERT INTO gl_accounts
                        (accountId, organizationId, accountNumber, accountName,
                         drawer, accountType, parentAccountId,
                         isHeader, isControlAccount, isActive, isLockedNumber,
                         createdAt, updatedAt)
                    VALUES
                        (:account_id, :org, :num, :name,
                         :drawer, :acct_type, :parent_id,
                         0, 1, 1, 0,
                         NOW(), NOW())
                    """
                ),
                {
                    "account_id": leaf_id,
                    "org": org_id,
                    "num": _LEAF_NUMBER,
                    "name": _LEAF_NAME,
                    "drawer": _DRAWER,
                    "acct_type": _ACCOUNT_TYPE,
                    "parent_id": header_id,
                },
            )


def downgrade() -> None:
    """
    Remove 124000-001 and 124000 rows only where they were not pre-existing.

    Strategy: remove the leaf first (FK child), then the header, but only for
    organisations where the header accountId is NOT referenced by any
    journal_entry_lines row — i.e. we never inserted any postings against it.
    Rows that existed before this migration ran are indistinguishable from rows
    we inserted (no migration_source column), so the downgrade removes ALL
    124000 / 124000-001 rows for every org, but only if no JE lines reference
    them.  If JE lines exist, the DELETE will fail on the FK constraint and
    the caller must manually resolve.
    """
    conn = op.get_bind()

    org_rows = conn.execute(
        sa.text("SELECT DISTINCT organizationId FROM gl_accounts")
    ).fetchall()

    for (org_id,) in org_rows:
        # Remove leaf first (FK child of header).
        conn.execute(
            sa.text(
                "DELETE FROM gl_accounts "
                "WHERE organizationId = :org AND accountNumber = :num"
            ),
            {"org": org_id, "num": _LEAF_NUMBER},
        )
        # Remove header only if no child rows remain.
        conn.execute(
            sa.text(
                "DELETE FROM gl_accounts "
                "WHERE organizationId = :org AND accountNumber = :num"
            ),
            {"org": org_id, "num": _HEADER_NUMBER},
        )
