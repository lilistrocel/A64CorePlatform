"""
Seed Loader Service

Idempotent loader for the default Chart of Accounts and tax codes.

Behaviour:
1. If any gl_accounts row already exists for the organization, skip entirely.
2. Insert accounts in definition order (parents first, children after).
3. After all rows are inserted, run a second pass to link parentAccountId
   using the accountNumber → accountId map built during insertion.
4. Set isControlAccount=True for the designated control accounts.
5. Wrap everything in a single transaction.
6. Seed default tax codes for the organization (idempotent per taxCode).
"""

import logging
from decimal import Decimal
from typing import Optional

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.seeds.default_coa import (
    CONTROL_ACCOUNT_NUMBERS,
    DEFAULT_COA,
    DEFAULT_TAX_CODES,
)
from ..models.orm.models import GLAccount, TaxCode

logger = logging.getLogger(__name__)


async def seed_chart_of_accounts(
    db: AsyncSession,
    organization_id: str,
    company_code: str,
) -> int:
    """
    Seed the default chart of accounts for an organization.

    Args:
        db: Active SQLAlchemy async session (caller must commit).
        organization_id: The organization to seed accounts for.
        company_code: Unused here but passed for consistency with the
                      tax-code seeder which may need it in the future.

    Returns:
        Number of accounts inserted (0 if already seeded).
    """
    # Idempotency check: if any account exists for this org, skip
    existing = await db.scalar(
        select(GLAccount.accountId)
        .where(GLAccount.organizationId == organization_id)
        .limit(1)
    )
    if existing:
        logger.info(
            "CoA already seeded for organization %s — skipping.", organization_id
        )
        return 0

    # First pass: insert all rows without parentAccountId linkage
    # Reason: SQLAlchemy FK constraint requires the parent row to exist first,
    # so we insert all rows with parent=None then update in second pass.
    number_to_id: dict[str, str] = {}
    rows: list[GLAccount] = []

    for (
        account_number,
        account_name,
        drawer,
        account_type,
        parent_number,
        is_header,
    ) in DEFAULT_COA:
        is_control = account_number in CONTROL_ACCOUNT_NUMBERS
        account = GLAccount(
            organizationId=organization_id,
            accountNumber=account_number,
            accountName=account_name,
            drawer=drawer,
            accountType=account_type,
            parentAccountId=None,  # set in second pass
            isHeader=is_header,
            isControlAccount=is_control,
            isActive=True,
            isLockedNumber=False,
        )
        db.add(account)
        rows.append(account)

    # Flush so SQLAlchemy generates accountId values (UUID default)
    await db.flush()

    # Build number → id map after flush (IDs are now populated)
    for account in rows:
        number_to_id[account.accountNumber] = account.accountId

    # Second pass: link parentAccountId
    for account, (_, _, _, _, parent_number, _) in zip(rows, DEFAULT_COA):
        if parent_number is not None:
            parent_id = number_to_id.get(parent_number)
            if parent_id:
                account.parentAccountId = parent_id
            else:
                logger.warning(
                    "Parent account number %s not found for account %s",
                    parent_number,
                    account.accountNumber,
                )

    logger.info(
        "Seeded %d GL accounts for organization %s",
        len(rows),
        organization_id,
    )
    return len(rows)


async def seed_tax_codes(
    db: AsyncSession,
    organization_id: str,
    number_to_id: Optional[dict[str, str]] = None,
) -> int:
    """
    Seed default UAE VAT tax codes for an organization.

    Looks up account IDs by account number using an optional pre-built map.
    If the map is not provided, queries the database for each account.

    Args:
        db: Active SQLAlchemy async session.
        organization_id: Organization to seed tax codes for.
        number_to_id: Optional pre-built accountNumber → accountId map.

    Returns:
        Number of tax codes inserted.
    """
    inserted = 0

    async def _get_account_id(account_number: Optional[str]) -> Optional[str]:
        """Resolve account number to accountId."""
        if account_number is None:
            return None
        if number_to_id and account_number in number_to_id:
            return number_to_id[account_number]
        result = await db.scalar(
            select(GLAccount.accountId).where(
                GLAccount.organizationId == organization_id,
                GLAccount.accountNumber == account_number,
            )
        )
        return result

    for (
        tax_code,
        description,
        rate_str,
        input_account_number,
        output_account_number,
    ) in DEFAULT_TAX_CODES:
        # Idempotency: skip if tax code already exists
        existing = await db.scalar(
            select(TaxCode.taxCode).where(
                TaxCode.organizationId == organization_id,
                TaxCode.taxCode == tax_code,
            )
        )
        if existing:
            continue

        input_id = await _get_account_id(input_account_number)
        output_id = await _get_account_id(output_account_number)

        tc = TaxCode(
            organizationId=organization_id,
            taxCode=tax_code,
            description=description,
            rate=Decimal(rate_str),
            inputTaxAccountId=input_id,
            outputTaxAccountId=output_id,
            isActive=True,
        )
        db.add(tc)
        inserted += 1

    logger.info(
        "Seeded %d tax codes for organization %s",
        inserted,
        organization_id,
    )
    return inserted


async def seed_company_defaults(
    db: AsyncSession,
    organization_id: str,
    company_code: str,
) -> dict:
    """
    Run all seeds for a newly created company.

    Inserts CoA + tax codes in a single logical batch.
    The caller is responsible for committing the session.

    Args:
        db: Active SQLAlchemy async session.
        organization_id: Target organization.
        company_code: Company code (for future period seeds).

    Returns:
        Dict with counts: {accounts_inserted, tax_codes_inserted}.
    """
    accounts_inserted = await seed_chart_of_accounts(db, organization_id, company_code)

    # Build number→id map from the just-inserted rows (or existing rows)
    result = await db.execute(
        select(GLAccount.accountNumber, GLAccount.accountId).where(
            GLAccount.organizationId == organization_id
        )
    )
    number_to_id = {row.accountNumber: row.accountId for row in result}

    tax_codes_inserted = await seed_tax_codes(db, organization_id, number_to_id)

    return {
        "accounts_inserted": accounts_inserted,
        "tax_codes_inserted": tax_codes_inserted,
    }
