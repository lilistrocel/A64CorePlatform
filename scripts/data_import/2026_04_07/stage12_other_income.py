"""
stage12_other_income.py — Import Other Income transactions from P&L 2024-2025 xlsx.

Source: OldData/7-April-2026/P& L Season 2024-2025.xlsx
Sheet: P & L Aug 24 - Jul 25

Other Income items (rows 5-7 of Revenue Ledger):
  - Silal Farm Maintenance   325,500 AED  (2025-09-01)
  - Sold Vehicles             90,000 AED  (2025-09-01)
  - Silal Farm Maintenance 705 700,000 AED (2025-06-01)
  Total Others: 1,115,500 AED

New collection: other_income

Each document represents one real income transaction.
Category is inferred from the Particulars column.

Run: python stage12_other_income.py [--dry-run] [--reset]
"""

from __future__ import annotations

import sys
from datetime import date, datetime
from pathlib import Path
from typing import Any, Optional

import openpyxl

sys.path.insert(0, str(Path(__file__).parent))

from common import (
    DIVISION_ID,
    MIGRATION_TAG,
    ORGANIZATION_ID,
    deterministic_uuid,
    get_db,
    make_arg_parser,
    make_logger,
    print_summary,
    reset_migration_data,
    upsert_by_legacy_ref,
    utcnow,
)

STAGE = "stage12_other_income"
RESET_COLLECTIONS = ["other_income"]

ADMIN_UUID: str = "bff26b8f-5ce9-49b2-9126-86174eaea823"

DATA_DIR: Path = Path(__file__).parent.parent.parent.parent / "OldData" / "7-April-2026"
PNL_XLSX: Path = DATA_DIR / "P& L Season 2024-2025.xlsx"

# Farming year for the FY2024 P&L (Aug 2024 – Jul 2025)
FARMING_YEAR: int = 2024
FISCAL_PERIOD: str = "FY2024"


# ---------------------------------------------------------------------------
# Category inference
# ---------------------------------------------------------------------------


def infer_category(particulars: str) -> str:
    """
    Infer category from the particulars text.

    Args:
        particulars: raw particulars string from P&L

    Returns:
        category string: "maintenance" | "asset_sale" | "other"
    """
    p_lower = particulars.lower()
    if "maintenace" in p_lower or "maintenance" in p_lower:
        return "maintenance"
    if "vehicle" in p_lower or "sold" in p_lower:
        return "asset_sale"
    return "other"


# ---------------------------------------------------------------------------
# Excel loader — reads Other Income rows directly
# ---------------------------------------------------------------------------


def load_other_income_rows() -> list[dict[str, Any]]:
    """
    Extract Other Income rows from P&L Revenue Ledger.

    Row layout:
      Row 5: (date, 'Silal Farm Maintenace', 325500)
      Row 6: (date, 'Sold Vehicles', 90000)
      Row 7: (date, 'Silal Farm Maintenace 705', 700000)

    Returns:
        list of parsed income row dicts
    """
    wb = openpyxl.load_workbook(PNL_XLSX, data_only=True)
    ws = wb["P & L Aug 24 - Jul 25"]

    rows: list[dict[str, Any]] = []

    for i, row_vals in enumerate(ws.iter_rows(values_only=True), 1):
        # Other Income rows are 5-7 in the Revenue Ledger
        if i < 5 or i > 7:
            continue

        date_col = row_vals[0]
        particulars = str(row_vals[1]).strip() if row_vals[1] else ""
        amount_col = row_vals[2]

        if not particulars or not amount_col:
            continue

        # Parse date
        income_date: Optional[date] = None
        if isinstance(date_col, datetime):
            income_date = date_col.date()
        elif isinstance(date_col, date):
            income_date = date_col

        amount = float(amount_col)
        category = infer_category(particulars)

        rows.append(
            {
                "date": income_date,
                "particulars": particulars,
                "amount_aed": amount,
                "category": category,
                "source_row": i,
            }
        )

    return rows


# ---------------------------------------------------------------------------
# Document builder
# ---------------------------------------------------------------------------


def build_income_doc(row: dict[str, Any]) -> dict[str, Any]:
    """
    Build an other_income collection document.

    Args:
        row: parsed income row dict from load_other_income_rows()

    Returns:
        other_income document dict
    """
    now = utcnow()
    legacy_ref = (
        f"other_income:fy2024:{row['particulars'].lower().replace(' ', '_')[:60]}"
    )
    income_uuid = deterministic_uuid("other_income", legacy_ref)

    return {
        "incomeId": income_uuid,
        "date": row["date"],
        "particulars": row["particulars"],
        "amountAed": round(row["amount_aed"], 2),
        "category": row["category"],
        "currency": "AED",
        "farmingYear": FARMING_YEAR,
        "fiscalPeriod": FISCAL_PERIOD,
        "source": "pnl_2024_2025_xlsx",
        "notes": None,
        "createdBy": ADMIN_UUID,
        "divisionId": DIVISION_ID,
        "organizationId": ORGANIZATION_ID,
        "createdAt": now,
        "updatedAt": now,
        "metadata": {
            "migratedFrom": MIGRATION_TAG,
            "legacyRef": legacy_ref,
            "sourceRow": row["source_row"],
        },
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def run(dry_run: bool, reset: bool) -> None:
    """
    Main entry point for stage 12.

    Args:
        dry_run: if True, read and compute but do not write
        reset: if True, delete all migration-tagged other_income docs
    """
    logger = make_logger(STAGE)
    db = get_db()

    if reset:
        logger.info("[RESET] Deleting migration-tagged other_income docs...")
        reset_migration_data(db, RESET_COLLECTIONS, logger)

    if not dry_run:
        db.other_income.create_index("metadata.legacyRef", unique=False, background=True)

    # -----------------------------------------------------------------------
    # Load income rows
    # -----------------------------------------------------------------------
    logger.info("Loading Other Income rows from P&L 2024-2025...")
    income_rows = load_other_income_rows()
    logger.info(f"  Loaded {len(income_rows)} other income rows (expected 3)")

    if dry_run:
        logger.info("[DRY-RUN] Preview:")
        for row in income_rows:
            logger.info(
                f"  date={row['date']} particulars={row['particulars']} "
                f"amount=AED {row['amount_aed']:,.2f} category={row['category']}"
            )

    # -----------------------------------------------------------------------
    # Build and upsert docs
    # -----------------------------------------------------------------------
    inserted = updated = 0
    error_samples: list[str] = []

    for row in income_rows:
        doc = build_income_doc(row)
        legacy_ref = doc["metadata"]["legacyRef"]
        logger.info(
            f"  Processing: {doc['particulars']} → AED {doc['amountAed']:,.2f} "
            f"category={doc['category']}"
        )
        try:
            ins, upd = upsert_by_legacy_ref(
                db.other_income, doc, legacy_ref, dry_run=dry_run, logger=logger
            )
            if ins:
                inserted += 1
            elif upd:
                updated += 1
        except Exception as exc:
            msg = f"Upsert failed [{legacy_ref}]: {exc}"
            logger.error(msg)
            error_samples.append(msg)

    # -----------------------------------------------------------------------
    # Summary
    # -----------------------------------------------------------------------
    total_aed = sum(r["amount_aed"] for r in income_rows)
    by_category: dict[str, float] = {}
    for row in income_rows:
        by_category[row["category"]] = by_category.get(row["category"], 0.0) + row["amount_aed"]

    logger.info("")
    logger.info("=" * 60)
    logger.info("  OTHER INCOME SUMMARY (FY2024):")
    logger.info(f"    Total other income AED: {total_aed:,.2f}")
    for cat, amt in by_category.items():
        logger.info(f"    {cat}: AED {amt:,.2f}")
    logger.info("=" * 60)

    print_summary(
        stage=STAGE,
        rows_read=len(income_rows),
        rows_inserted=inserted,
        rows_updated=updated,
        rows_skipped=0,
        rows_errored=len(error_samples),
        error_samples=error_samples,
        logger=logger,
    )


if __name__ == "__main__":
    parser = make_arg_parser(
        "Stage 12: Import Other Income transactions from P&L 2024-2025"
    )
    args = parser.parse_args()
    run(dry_run=args.dry_run, reset=args.reset)
