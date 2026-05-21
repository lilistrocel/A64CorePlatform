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

Note on account_level backfill (Flag A — 2026-05-20):
Migration 004 adds the account_level column and backfills it via two UPDATE
statements executed at migration time. However, when alembic upgrade head
runs on a fresh deployment, gl_accounts is empty — no CoA rows exist yet
because they are seeded lazily when the first company is created, not at
migration time. The migration backfill therefore produces zero updated rows
on a fresh deploy.

Fix: seed_chart_of_accounts now sets accountLevel directly on each GLAccount
ORM object before flush, using the same two-rule logic as migration 004:
  - isHeader=True  AND parentAccountId IS NULL  → drawer
  - isHeader=True  AND parentAccountId IS NOT NULL → title
  - isHeader=False (leaf)                          → active (ORM default)
This makes the seed self-contained and idempotent — no manual SQL is needed
after a fresh alembic upgrade + first company creation.
"""

import logging
import uuid
from decimal import Decimal
from typing import Optional

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.seeds.default_coa import (
    CONTROL_ACCOUNT_NUMBERS,
    DEFAULT_COA,
    DEFAULT_TAX_CODES,
)
from ..models.orm.models import AccountLevelEnum, ApprovalRule, GLAccount, TaxCode

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

    # Third pass: backfill account_level using the same logic as migration 004.
    # Reason: migration 004 runs its UPDATE backfill at migration time, but
    # gl_accounts is empty on a fresh deployment (CoA is seeded lazily on first
    # company creation, not at migrate time). Setting accountLevel here ensures
    # every fresh deploy produces correct values without manual SQL intervention.
    #
    # Rules (mirror of migration 004):
    #   isHeader=True  AND parentAccountId IS NULL  → drawer  (top-level section)
    #   isHeader=True  AND parentAccountId IS NOT NULL → title (intermediate header)
    #   isHeader=False (leaf account)               → active  (matches ORM default)
    for account in rows:
        if account.isHeader:
            if account.parentAccountId is None:
                account.accountLevel = AccountLevelEnum.DRAWER
            else:
                account.accountLevel = AccountLevelEnum.TITLE
        # Reason: leaf accounts keep the default AccountLevelEnum.ACTIVE set in
        # the GLAccount ORM model — no explicit assignment needed.

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

        # Reason: SR (Standard Reverse Charge) requires UAE VAT self-accounting.
        # The buyer posts both DR Input VAT and CR Output VAT for the same amount.
        is_reverse_charge = tax_code == "SR"

        tc = TaxCode(
            organizationId=organization_id,
            taxCode=tax_code,
            description=description,
            rate=Decimal(rate_str),
            inputTaxAccountId=input_id,
            outputTaxAccountId=output_id,
            isReverseCharge=is_reverse_charge,
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


async def seed_approval_rules(
    db: AsyncSession,
    organization_id: str,
    company_code: str,
) -> int:
    """
    Seed four default approval rules for a newly created company.

    Idempotent — skips if any rules already exist for (org, company).

    Args:
        db: Active SQLAlchemy async session.
        organization_id: Target organisation.
        company_code: Finance company code.

    Returns:
        Number of rules inserted (0 if already seeded).
    """
    from sqlalchemy import select as sa_select

    # Idempotency: skip if already seeded
    existing = await db.scalar(
        sa_select(ApprovalRule.ruleId).where(
            ApprovalRule.organizationId == organization_id,
            ApprovalRule.companyCode == company_code,
        ).limit(1)
    )
    if existing:
        return 0

    defaults = [
        {
            "docType": "PR",
            "thresholdAmount": None,
            "approverRole": "procurement_manager",
            "alwaysRequired": True,
            "priority": 100,
            "notes": "Default — PRs always require procurement manager approval",
        },
        {
            "docType": "PO",
            "thresholdAmount": Decimal("10000.00"),
            "approverRole": "procurement_manager",
            "alwaysRequired": False,
            "priority": 100,
            "notes": "Default — POs over AED 10,000 require procurement manager approval",
        },
        {
            "docType": "AP_INVOICE",
            "thresholdAmount": Decimal("10000.00"),
            "approverRole": "accountant",
            "alwaysRequired": False,
            "priority": 100,
            "notes": "Default — AP invoices over AED 10,000 require accountant review",
        },
        {
            "docType": "OUTGOING_PAYMENT",
            "thresholdAmount": None,
            "approverRole": "finance_admin",
            "alwaysRequired": True,
            "priority": 100,
            "notes": "Default — all outgoing payments require finance admin approval",
        },
    ]

    for rule_data in defaults:
        rule = ApprovalRule(
            ruleId=str(uuid.uuid4()),
            organizationId=organization_id,
            companyCode=company_code,
            docType=rule_data["docType"],
            thresholdAmount=rule_data["thresholdAmount"],
            approverRole=rule_data["approverRole"],
            alwaysRequired=rule_data["alwaysRequired"],
            priority=rule_data["priority"],
            isActive=True,
            notes=rule_data["notes"],
        )
        db.add(rule)

    logger.info(
        "Seeded %d default approval rules for company=%s org=%s",
        len(defaults), company_code, organization_id,
    )
    return len(defaults)


async def seed_company_defaults(
    db: AsyncSession,
    organization_id: str,
    company_code: str,
) -> dict:
    """
    Run all seeds for a newly created company.

    Inserts CoA + tax codes + approval rules in a single logical batch.
    The caller is responsible for committing the session.

    Args:
        db: Active SQLAlchemy async session.
        organization_id: Target organization.
        company_code: Company code.

    Returns:
        Dict with counts: {accounts_inserted, tax_codes_inserted, approval_rules_inserted}.
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
    approval_rules_inserted = await seed_approval_rules(db, organization_id, company_code)

    return {
        "accounts_inserted": accounts_inserted,
        "tax_codes_inserted": tax_codes_inserted,
        "approval_rules_inserted": approval_rules_inserted,
    }
