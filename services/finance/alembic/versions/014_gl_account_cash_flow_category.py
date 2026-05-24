"""Add cash_flow_category column to gl_accounts + seed defaults

Revision ID: 014
Revises: 013
Create Date: 2026-05-24 14:30:00.000000

Wave 2 / T-060.2 — adds the per-account `cash_flow_category` classifier
that drives placement on the Cash Flow Statement (indirect method).
Without this field there's no way to compute "Changes in working
capital" / "Investing activities" / "Financing activities" from the GL
alone — the existing DrawerEnum + AccountTypeEnum don't distinguish
those.

Schema change:
  - cash_flow_category ENUM('cash','working_capital','non_cash_adjustment',
    'investing','financing','none') NOT NULL DEFAULT 'none'

Idempotent seed defaults (applied via SQL UPDATEs after the column is
added) keyed off `accountNumber` prefixes, mirroring the UAE-agri
standard seed in `services/finance/src/finance/db/seeds/default_coa.py`:

  | Prefix         | Drawer        | Category               |
  |----------------|---------------|------------------------|
  | 110000-*       | ASSETS        | investing              |
  | 111000-*       | ASSETS        | investing              |
  | 112000-*       | ASSETS        | investing              |
  | 113000-*       | ASSETS        | investing              |
  | 114000-*       | ASSETS        | investing              |
  | 121000-*       | ASSETS        | working_capital        |
  | 122000-*       | ASSETS        | working_capital        |
  | 123000-*       | ASSETS        | working_capital        |
  | 124000-*       | ASSETS        | working_capital        |
  | 125000-*       | ASSETS        | working_capital        |
  | 126000-*       | ASSETS        | cash                   |
  | 211000-*       | LIABILITIES   | financing              |
  | 213000-*       | LIABILITIES   | non_cash_adjustment    |
  | 221000-*       | LIABILITIES   | working_capital        |
  | 222000-*       | LIABILITIES   | working_capital        |
  | 223000-*       | LIABILITIES   | working_capital        |
  | 224000-*       | LIABILITIES   | financing              |
  | 225000-*       | LIABILITIES   | working_capital        |
  | 311000-*       | EQUITY        | financing              |
  | 312000-*       | EQUITY        | none (closing JE handles)|
  | 313000-*       | EQUITY        | financing              |

Additional name-pattern override (runs AFTER the prefix mapping so it
wins): accounts whose accountName matches `%Depreciation%` or
`%Amortisation%` get cash_flow_category='non_cash_adjustment' regardless
of prefix. Same for the accumulated-depreciation contra accounts.

All P&L drawers (REVENUE / COST_OF_SALES / OPERATING_COST / NON_OPERATING
/ OTHER_INCOME / TAXATION) keep the default 'none' — the net of all P&L
activity reaches CF via the Net Income line; double-counting via
per-account category would corrupt the report.

Reversible: downgrade drops the column.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "014"
down_revision: Union[str, None] = "013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# (prefix, category) pairs for the back-fill. Kept as a Python tuple so
# the upgrade body stays declarative and easy to review.
_PREFIX_DEFAULTS = (
    # Non-current assets → investing
    ("110000", "investing"),
    ("111000", "investing"),
    ("112000", "investing"),
    ("113000", "investing"),
    ("114000", "investing"),
    # Current assets — working capital + cash
    ("121000", "working_capital"),
    ("122000", "working_capital"),
    ("123000", "working_capital"),
    ("124000", "working_capital"),
    ("125000", "working_capital"),
    ("126000", "cash"),
    # Liabilities
    ("211000", "financing"),
    ("213000", "non_cash_adjustment"),  # EOSB provision
    ("221000", "working_capital"),
    ("222000", "working_capital"),
    ("223000", "working_capital"),
    ("224000", "financing"),
    ("225000", "working_capital"),
    # Equity
    ("311000", "financing"),
    # 312000-* (Retained Earnings) stays 'none' — closing JE absorbs.
    ("313000", "financing"),
)


def upgrade() -> None:
    """Add column + back-fill defaults."""
    # ------------------------------------------------------------------ #
    # 1. Add the column with server default 'none' so existing rows are
    #    classified as excluded-from-CF until the back-fill runs.
    # ------------------------------------------------------------------ #
    op.add_column(
        "gl_accounts",
        sa.Column(
            "cash_flow_category",
            sa.Enum(
                "cash",
                "working_capital",
                "non_cash_adjustment",
                "investing",
                "financing",
                "none",
                name="cashflowcategoryenum",
            ),
            nullable=False,
            server_default="none",
        ),
    )

    # ------------------------------------------------------------------ #
    # 2. Back-fill defaults by accountNumber prefix.
    #
    # Reason: portable SQL — `LIKE '110000%'` matches both the header
    # account `110000` and every leaf `110000-NNN`. We rely on the
    # accountNumber being prefix-stable in the standard UAE-agri seed.
    # ------------------------------------------------------------------ #
    conn = op.get_bind()
    for prefix, category in _PREFIX_DEFAULTS:
        conn.execute(
            sa.text(
                "UPDATE gl_accounts "
                "SET cash_flow_category = :category "
                "WHERE accountNumber LIKE :pattern"
            ),
            {"category": category, "pattern": f"{prefix}%"},
        )

    # ------------------------------------------------------------------ #
    # 3. Name-pattern override: depreciation / amortisation accounts are
    #    non-cash regardless of prefix. Runs AFTER the prefix mapping so
    #    these always win.
    # ------------------------------------------------------------------ #
    for name_pattern in ("%Depreciation%", "%Amortisation%", "%Amortization%"):
        conn.execute(
            sa.text(
                "UPDATE gl_accounts "
                "SET cash_flow_category = 'non_cash_adjustment' "
                "WHERE accountName LIKE :pattern"
            ),
            {"pattern": name_pattern},
        )


def downgrade() -> None:
    """Drop the column."""
    op.drop_column("gl_accounts", "cash_flow_category")
    # Reason: drop the enum type explicitly so a future upgrade can
    # re-create it cleanly. MySQL handles ENUMs inline but PostgreSQL
    # (if A64 ever migrates) would leave the type orphaned otherwise.
    sa.Enum(name="cashflowcategoryenum").drop(op.get_bind(), checkfirst=True)
