"""Seed A001 company code, fiscal period, and posting setup for Wave 3 sales events

Revision ID: 018
Revises: 017
Create Date: 2026-05-30 00:00:00.000000

Background
----------
All Wave 3 sales-module outbox events (delivery_posted, sales_invoice_posted,
customer_payment_received, return_posted, credit_note_posted, and their
cancellation counterparts) emit ``companyCode: "A001"``.  The finance DB
only has a company_codes row for ``companyCode: "1000"``.  Every Wave 3
posting event therefore fails at ``_resolve_posting_setup_or_raise`` with:

    HTTP 400: Company posting setup not configured for A001.

This migration idempotently seeds three rows for the default organisation
(``00000000-0000-0000-0000-000000000001``) under company code ``A001``:

1. **company_codes** — "A64 Farm Operations LLC" legal entity under A001.
2. **fiscal_periods** — One full-year 2026 open period (Jan–Dec) so any
   Wave 3 event with a docDate in 2026 resolves a fiscal period.
3. **company_posting_setup** — All clearing-account FKs, referencing GL
   accounts that already exist in the org's chart of accounts (seeded by
   migration 001 via seed_loader):

   Field                         Account#   Name
   ---------------------------   --------   ----------------------------------------
   apControlAccountId            221000-001 Trade Payables - Suppliers
   arControlAccountId            124000-001 Trade Receivables - Customers  (control)
   bankAccountId                 126000-002 Cash at Bank - AED Operating
   cashAccountId                 126000-001 Petty Cash
   grIrClearingAccountId         223000-004 Goods Received Not Invoiced
   inputVatAccountId             122000-001 Input VAT Recoverable
   outputVatAccountId            222000-001 Output VAT Payable
   retainedEarningsAccountId     312000-001 Retained Earnings - Prior Years
   purchasePriceVarianceAccountId 514000-004 Purchase Price Variance
   roundingAccountId             123000-004 Advances to Suppliers  (≈ rounding)

   Note: the ``1000`` posting setup also has these accounts (minus
   arControlAccountId which was left NULL there).  A001 sets
   arControlAccountId = 124000-001 so the AR/credit-note JE handlers can
   resolve the AR control account via the posting-setup tier of the 3-tier
   resolution chain.

The migration is fully idempotent: each INSERT is guarded by a
``SELECT … LIMIT 1`` existence check.  Running it twice produces no
duplicate rows.

Account IDs used
----------------
All account IDs below are stable primary keys from the gl_accounts table
seeded in migration 001 for ``organizationId=00000000-0000-0000-0000-000000000001``.
They were verified against the live finance_db before this migration was written.

Downgrade
---------
Removes the three rows in reverse-dependency order:
  posting setup → fiscal period → company code
Only removes rows that were inserted by this migration (identified by
companyCode = 'A001' and the same organizationId).
"""

from __future__ import annotations

import uuid
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "018"
down_revision: Union[str, None] = "017"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_ORG_ID = "00000000-0000-0000-0000-000000000001"
_COMPANY_CODE = "A001"
_LEGAL_NAME = "A64 Farm Operations LLC"

# Posting-setup account IDs — all verified against gl_accounts in the live DB.
# These are the same accounts used by the existing companyCode=1000 setup,
# with arControlAccountId explicitly set (it was NULL on 1000).
_AP_CONTROL_ACCOUNT_ID = "aa02c309-9706-4174-8892-c8ed774092bc"   # 221000-001 Trade Payables - Suppliers
_AR_CONTROL_ACCOUNT_ID = "1810f5cb-40a0-4e0b-bec5-10d65a21dc03"   # 124000-001 Trade Receivables - Customers
_BANK_ACCOUNT_ID = "e04ad013-4f92-4661-9527-e35e8375bb64"          # 126000-002 Cash at Bank - AED Operating
_CASH_ACCOUNT_ID = "4e6bdb6f-2f2a-4911-be09-f4a7676c1137"          # 126000-001 Petty Cash
_GRIR_CLEARING_ACCOUNT_ID = "f029e50f-545b-11f1-8dbc-4211d192a92b" # 223000-004 Goods Received Not Invoiced
_INPUT_VAT_ACCOUNT_ID = "bcf8d4e4-7562-4fb7-843a-25d98e1c3435"     # 122000-001 Input VAT Recoverable
_OUTPUT_VAT_ACCOUNT_ID = "f6ed18f1-8ccf-408c-8606-60be0949b770"    # 222000-001 Output VAT Payable
_RETAINED_EARNINGS_ACCOUNT_ID = "22b2b00e-9029-421c-887c-92cf44904dc5"  # 312000-001 Retained Earnings
_PPV_ACCOUNT_ID = "b99d7ae4-5455-11f1-8dbc-4211d192a92b"           # 514000-004 Purchase Price Variance
_ROUNDING_ACCOUNT_ID = "0d659426-47e2-4e28-bf66-12dabc465dc0"      # 123000-004 Advances to Suppliers


def upgrade() -> None:
    """
    Seed A001 company code, 2026 fiscal period, and posting setup.

    All three inserts are guarded by existence checks — safe to run multiple
    times on any environment.
    """
    conn = op.get_bind()

    # ---------------------------------------------------------------------- #
    # 1. company_codes — A001 legal entity
    # ---------------------------------------------------------------------- #
    exists_company = conn.execute(
        sa.text(
            "SELECT companyCode FROM company_codes "
            "WHERE companyCode = :code LIMIT 1"
        ),
        {"code": _COMPANY_CODE},
    ).fetchone()

    if not exists_company:
        conn.execute(
            sa.text(
                """
                INSERT INTO company_codes
                    (companyCode, organizationId, legalName,
                     trn, fiscalYearStartMonth, fiscalYearStartDay,
                     defaultCurrency, isLocked, createdAt, updatedAt)
                VALUES
                    (:code, :org, :name,
                     NULL, 1, 1,
                     'AED', 0, NOW(), NOW())
                """
            ),
            {
                "code": _COMPANY_CODE,
                "org": _ORG_ID,
                "name": _LEGAL_NAME,
            },
        )

    # ---------------------------------------------------------------------- #
    # 2. fiscal_periods — open full-year 2026 period for A001
    # ---------------------------------------------------------------------- #
    exists_period = conn.execute(
        sa.text(
            "SELECT periodId FROM fiscal_periods "
            "WHERE companyCode = :code AND fiscalYear = 2026 LIMIT 1"
        ),
        {"code": _COMPANY_CODE},
    ).fetchone()

    if not exists_period:
        period_id = str(uuid.uuid4())
        conn.execute(
            sa.text(
                """
                INSERT INTO fiscal_periods
                    (periodId, companyCode, fiscalYear, periodNumber,
                     startDate, endDate, status, createdAt, updatedAt)
                VALUES
                    (:pid, :code, 2026, 1,
                     '2026-01-01', '2026-12-31', 'open', NOW(), NOW())
                """
            ),
            {
                "pid": period_id,
                "code": _COMPANY_CODE,
            },
        )

    # ---------------------------------------------------------------------- #
    # 3. company_posting_setup — all clearing accounts for A001
    #
    # Reasons for each account choice:
    #   apControlAccountId            = 221000-001  AP sub-ledger control (Trade Payables)
    #   arControlAccountId            = 124000-001  AR sub-ledger control (Trade Receivables)
    #                                               This was NULL on 1000; explicitly set here
    #                                               so the 3-tier AR resolution in
    #                                               _resolve_ar_control_account_or_raise can
    #                                               fall back to the setup-tier before the
    #                                               hardcoded 124000-001 fallback. Setting it
    #                                               explicitly makes the config self-documenting.
    #   bankAccountId                 = 126000-002  AED Operating bank account for receipts
    #   cashAccountId                 = 126000-001  Petty cash account
    #   grIrClearingAccountId         = 223000-004  GR/IR clearing (same acct used by 1000)
    #   inputVatAccountId             = 122000-001  Input VAT Recoverable
    #   outputVatAccountId            = 222000-001  Output VAT Payable (required by
    #                                               credit_note_posted handler when tax>0)
    #   retainedEarningsAccountId     = 312000-001  Retained Earnings - Prior Years
    #   purchasePriceVarianceAccountId = 514000-004 PPV (for GR variance JEs)
    #   roundingAccountId             = 123000-004  Advances to Suppliers (rounding differences)
    # ---------------------------------------------------------------------- #
    exists_setup = conn.execute(
        sa.text(
            "SELECT setupId FROM company_posting_setup "
            "WHERE organizationId = :org AND companyCode = :code LIMIT 1"
        ),
        {"org": _ORG_ID, "code": _COMPANY_CODE},
    ).fetchone()

    if not exists_setup:
        setup_id = str(uuid.uuid4())
        conn.execute(
            sa.text(
                """
                INSERT INTO company_posting_setup
                    (setupId, organizationId, companyCode,
                     apControlAccountId, arControlAccountId,
                     bankAccountId, cashAccountId,
                     grIrClearingAccountId, inputVatAccountId,
                     outputVatAccountId, retainedEarningsAccountId,
                     purchasePriceVarianceAccountId, roundingAccountId,
                     isComplete, defaultValuationMethod,
                     createdAt, updatedAt)
                VALUES
                    (:sid, :org, :code,
                     :ap_ctrl, :ar_ctrl,
                     :bank, :cash,
                     :grir, :ivat,
                     :ovat, :re,
                     :ppv, :rnd,
                     1, 'MovingAverage',
                     NOW(), NOW())
                """
            ),
            {
                "sid": setup_id,
                "org": _ORG_ID,
                "code": _COMPANY_CODE,
                "ap_ctrl": _AP_CONTROL_ACCOUNT_ID,
                "ar_ctrl": _AR_CONTROL_ACCOUNT_ID,
                "bank": _BANK_ACCOUNT_ID,
                "cash": _CASH_ACCOUNT_ID,
                "grir": _GRIR_CLEARING_ACCOUNT_ID,
                "ivat": _INPUT_VAT_ACCOUNT_ID,
                "ovat": _OUTPUT_VAT_ACCOUNT_ID,
                "re": _RETAINED_EARNINGS_ACCOUNT_ID,
                "ppv": _PPV_ACCOUNT_ID,
                "rnd": _ROUNDING_ACCOUNT_ID,
            },
        )


def downgrade() -> None:
    """
    Remove the A001 posting setup, fiscal period, and company code in safe order.

    Only removes rows where companyCode = 'A001' and organizationId matches.
    Does NOT remove gl_accounts rows — those are shared with the org.
    Will fail on FK constraint if JEs have been posted against A001.
    """
    conn = op.get_bind()

    # Remove posting setup first (no FK children).
    conn.execute(
        sa.text(
            "DELETE FROM company_posting_setup "
            "WHERE organizationId = :org AND companyCode = :code"
        ),
        {"org": _ORG_ID, "code": _COMPANY_CODE},
    )

    # Remove fiscal periods.
    conn.execute(
        sa.text(
            "DELETE FROM fiscal_periods "
            "WHERE companyCode = :code"
        ),
        {"code": _COMPANY_CODE},
    )

    # Remove company code last.
    conn.execute(
        sa.text(
            "DELETE FROM company_codes "
            "WHERE companyCode = :code"
        ),
        {"code": _COMPANY_CODE},
    )
