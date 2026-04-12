"""
stage5_sales_excel.py — Reconcile Sales Analysis Excel with imported order lines.

Source: OldData/7-April-2026/Sales Reports - 02-04-2026 Aug25-July26.xlsx
Sheet:  Sales Analysis (header row 3, data from row 4, 5629 rows)

Match logic:
  Key = (date_day, customer_name_normalized, crop_name_normalized, grade)
  - Match found → update sales_order_lines with excel_data.* enrichment fields
  - Match NOT found in supabase → insert into sales_unmatched collection
  - Excel rows for sales not in supabase at all → insert as synthetic sales_orders
    + sales_order_lines with source="excel_only"

Inventory source matching (best-effort):
  - "Liwa 330A" → try to match "LW-330" style in blocks.legacyBlockCode
  - "S.NH-624" → try "NH-624", "S.NH-624" in blocks.legacyBlockCode
  - Unmatched inventory sources → logged to logs/stage5_unmatched_inventory.txt

New collections introduced: sales_unmatched

Run:  python stage5_sales_excel.py [--dry-run] [--reset]
"""

from __future__ import annotations

import re
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Optional

sys.path.insert(0, str(Path(__file__).parent))

from common import (
    DIVISION_ID,
    LOG_DIR,
    MIGRATION_TAG,
    ORGANIZATION_ID,
    SALES_EXCEL,
    deterministic_uuid,
    get_db,
    is_excluded_farm,
    make_arg_parser,
    make_logger,
    print_summary,
    reset_migration_data,
    utcnow,
)

STAGE = "stage5_sales_excel"
RESET_COLLECTIONS = ["sales_unmatched"]

try:
    import openpyxl
except ImportError:
    print("ERROR: openpyxl not installed. Run: pip install openpyxl")
    sys.exit(1)


# ---------------------------------------------------------------------------
# Normalization helpers
# ---------------------------------------------------------------------------


def _norm_name(s: Optional[str]) -> str:
    """
    Normalize a customer/crop name for matching.

    Steps:
    1. Lowercase
    2. Strip leading/trailing whitespace
    3. Remove ALL punctuation (dots, commas, hyphens, etc.) — handles
       'L.L.C' vs 'LLC', 'Al-Ain' vs 'Al Ain', etc.
    4. Collapse multiple spaces to one

    Args:
        s: raw name string

    Returns:
        Normalized string safe for equality comparison
    """
    if not s:
        return ""
    # Reason: Remove all non-word, non-space chars so 'L.L.C' == 'LLC'
    s = re.sub(r"[^\w\s]", "", str(s).lower())
    return re.sub(r"\s+", " ", s.strip())


def _norm_date(d) -> Optional[str]:
    """Normalize a date value to YYYY-MM-DD string."""
    if d is None:
        return None
    if isinstance(d, datetime):
        return d.strftime("%Y-%m-%d")
    if isinstance(d, str):
        try:
            return datetime.fromisoformat(d.strip()).strftime("%Y-%m-%d")
        except ValueError:
            return d.strip()[:10]
    return str(d)[:10]


def _norm_grade(g: Optional[str]) -> str:
    """Normalize grade to A/B/C or empty."""
    if not g:
        return ""
    g = str(g).strip().upper()
    return g if g in ("A", "B", "C") else ""


# ---------------------------------------------------------------------------
# Inventory source → block legacy code matching
# ---------------------------------------------------------------------------


def build_inventory_source_map(db) -> dict[str, str]:
    """
    Build a lookup from normalized inventory source tokens to blockId UUIDs.

    Tries multiple token normalizations:
      "Liwa 330A"   → try "LW-330", "LW-330A", "LW-330-A"
      "S.NH-624"    → try "NH-624", "S.NH-624", "S.NH 624"
      "S.GH 708"    → try "GH-708", "S.GH-708"

    Args:
        db: pymongo Database

    Returns:
        dict normalized_source_token → blockId UUID string
    """
    # Load all block legacy codes
    block_ref_map: dict[str, str] = {}  # legacyBlockCode.lower() → blockId
    for doc in db.blocks.find(
        {},
        {"blockId": 1, "legacyBlockCode": 1, "_id": 0},
    ):
        lbc = doc.get("legacyBlockCode", "")
        if lbc:
            block_ref_map[lbc.strip().lower()] = str(doc["blockId"])

    return block_ref_map


def match_inventory_source(source: str, block_ref_map: dict[str, str]) -> Optional[str]:
    """
    Try to match an inventory source string to a blockId.

    Tries multiple normalization strategies:
    1. Direct match (lowercased)
    2. Replace spaces with hyphens
    3. Strip leading "S.", "AG.", prefix
    4. Farm abbreviation substitution (Liwa→LW, etc.)

    Args:
        source: raw inventory source string from Excel
        block_ref_map: from build_inventory_source_map()

    Returns:
        blockId UUID string or None
    """
    if not source or not source.strip():
        return None

    candidates = set()
    s = source.strip()
    candidates.add(s.lower())
    candidates.add(s.replace(" ", "-").lower())
    candidates.add(s.replace(" ", "").lower())
    # Strip leading "S." or "AG."
    for prefix in ("s.", "ag.", "s.nh", "s.gh"):
        if s.lower().startswith(prefix):
            stripped = s[len(prefix):].strip().strip("-").strip()
            candidates.add(stripped.lower())
            candidates.add(stripped.replace(" ", "-").lower())

    # Farm abbreviation expansion
    farm_abbr = {
        "liwa": "lw",
        "al ain": "a",
        "al khazana": "khz",
        "al wagen": "wg",
        "new hydroponics": "nh",
        "new hydroponic": "nh",
        "silal": "s",
    }
    for farm_name, abbr in farm_abbr.items():
        if s.lower().startswith(farm_name):
            suffix = s[len(farm_name):].strip()
            candidates.add(f"{abbr}-{suffix}".lower())
            candidates.add(f"{abbr}{suffix}".lower())
            candidates.add(f"{abbr}-{suffix.replace(' ', '-')}".lower())

    for c in candidates:
        if c in block_ref_map:
            return block_ref_map[c]
    return None


# ---------------------------------------------------------------------------
# Excel reader
# ---------------------------------------------------------------------------

EXCEL_HEADER = [
    "date", "month", "customer_name", "inventory_source", "delivery_code",
    "crop_name", "grade", "kg_conversion", "qty_carton", "qty_kgs",
    "daily_predicted_price", "total_predicted_amount", "actual_price",
    "total_actual_value", "vat_5pct", "total_after_tax",
    "invoice_status", "payment_status", "collection_date",
    "paid_amount", "unpaid_amount", "vat_unpaid", "remarks",
]


def load_excel_rows() -> list[dict]:
    """
    Load Sales Analysis sheet from Excel, header at row 3, data from row 4.

    Returns:
        list of row dicts using EXCEL_HEADER keys
    """
    wb = openpyxl.load_workbook(SALES_EXCEL, read_only=True, data_only=True)
    ws = wb["Sales Analysis"]
    rows = []
    for i, row in enumerate(ws.iter_rows(min_row=4, values_only=True), 4):
        # Skip totals rows (first cell is None and row 1-2 are totals)
        if row[0] is None and row[2] is None:
            continue
        if len(row) < len(EXCEL_HEADER):
            continue
        d = dict(zip(EXCEL_HEADER, row))
        d["_excel_row"] = i
        rows.append(d)
    wb.close()
    return rows


# ---------------------------------------------------------------------------
# Document builders
# ---------------------------------------------------------------------------

MIGRATION_USER_UUID = deterministic_uuid("user", "migration_system_user")
MIGRATION_USER_EMAIL = "migration@supabase_2026_04_07"


def build_excel_enrichment(excel_row: dict) -> dict:
    """
    Build the excel_data sub-document to embed in a matched order line.

    Args:
        excel_row: dict with EXCEL_HEADER keys

    Returns:
        dict for sales_order_lines.excel_data
    """
    return {
        "actualPrice": excel_row.get("actual_price"),
        "totalActualValue": excel_row.get("total_actual_value"),
        "vatAmount": excel_row.get("vat_5pct"),
        "totalAmountAfterTax": excel_row.get("total_after_tax"),
        "invoiceStatus": excel_row.get("invoice_status"),
        "paymentStatus": excel_row.get("payment_status"),
        "collectionDate": _norm_date(excel_row.get("collection_date")),
        "paidAmount": excel_row.get("paid_amount"),
        "unpaidAmount": excel_row.get("unpaid_amount"),
        "vatUnpaid": excel_row.get("vat_unpaid"),
        "dailyPredictedPrice": excel_row.get("daily_predicted_price"),
        "totalPredictedAmount": excel_row.get("total_predicted_amount"),
        "kgConversion": excel_row.get("kg_conversion"),
        "qtyCarton": excel_row.get("qty_carton"),
        "deliveryCode": excel_row.get("delivery_code"),
        "inventorySource": excel_row.get("inventory_source"),
        "remarks": excel_row.get("remarks"),
        "excelRowNumber": excel_row.get("_excel_row"),
    }


def build_unmatched_doc(excel_row: dict, reason: str) -> dict:
    """
    Build a sales_unmatched document for an Excel row with no supabase match.

    Args:
        excel_row: dict with EXCEL_HEADER keys
        reason: human-readable reason for mismatch

    Returns:
        sales_unmatched document dict
    """
    now = utcnow()
    key = f"{_norm_date(excel_row.get('date'))}|{_norm_name(excel_row.get('customer_name'))}|{_norm_name(excel_row.get('crop_name'))}|{_norm_grade(excel_row.get('grade'))}"
    doc_uuid = deterministic_uuid("unmatched", key + str(excel_row.get("_excel_row", "")))
    return {
        "unmatchedId": doc_uuid,
        "reason": reason,
        "date": excel_row.get("date"),
        "normalizedDate": _norm_date(excel_row.get("date")),
        "customerName": excel_row.get("customer_name"),
        "inventorySource": excel_row.get("inventory_source"),
        "deliveryCode": excel_row.get("delivery_code"),
        "cropName": excel_row.get("crop_name"),
        "grade": excel_row.get("grade"),
        "kgConversion": excel_row.get("kg_conversion"),
        "qtyCarton": excel_row.get("qty_carton"),
        "qtyKgs": excel_row.get("qty_kgs"),
        "actualPrice": excel_row.get("actual_price"),
        "totalActualValue": excel_row.get("total_actual_value"),
        "vatAmount": excel_row.get("vat_5pct"),
        "totalAmountAfterTax": excel_row.get("total_after_tax"),
        "invoiceStatus": excel_row.get("invoice_status"),
        "paymentStatus": excel_row.get("payment_status"),
        "collectionDate": _norm_date(excel_row.get("collection_date")),
        "paidAmount": excel_row.get("paid_amount"),
        "unpaidAmount": excel_row.get("unpaid_amount"),
        "excelRowNumber": excel_row.get("_excel_row"),
        "createdAt": now,
        "divisionId": DIVISION_ID,
        "organizationId": ORGANIZATION_ID,
        "metadata": {
            "migratedFrom": MIGRATION_TAG,
            "legacyRef": doc_uuid,
            "source": "excel_only",
        },
    }


def build_synthetic_order_doc(excel_row: dict, customer_uuid_map: dict) -> tuple[dict, dict]:
    """
    Build a synthetic sales_orders + sales_order_lines doc pair for an excel-only row.

    Args:
        excel_row: dict with EXCEL_HEADER keys
        customer_uuid_map: customer name → UUID (may miss if truly excel-only)

    Returns:
        (order_doc, line_doc) tuple
    """
    now = utcnow()
    order_date = excel_row.get("date")
    if isinstance(order_date, datetime):
        order_date_norm = order_date.strftime("%Y-%m-%d")
    else:
        order_date_norm = str(order_date)[:10] if order_date else "unknown"

    customer_name = (excel_row.get("customer_name") or "").strip()
    crop_name = (excel_row.get("crop_name") or "").strip()
    grade = _norm_grade(excel_row.get("grade"))

    order_key = f"excel|{order_date_norm}|{_norm_name(customer_name)}|{excel_row.get('delivery_code','')}"
    order_uuid = deterministic_uuid("excel_order", order_key)
    customer_uuid = customer_uuid_map.get(_norm_name(customer_name))

    # Map excel payment_status to enum
    raw_pay = (excel_row.get("payment_status") or "").strip().lower()
    if "paid" in raw_pay and "unpaid" not in raw_pay:
        pay_status = "paid"
    elif "partial" in raw_pay:
        pay_status = "partial"
    else:
        pay_status = "pending"

    # Deterministic orderCode to avoid unique-index collision
    order_code = f"EX-{order_date_norm.replace('-','')}-{str(order_uuid)[:8]}"

    order_doc = {
        "orderId": order_uuid,
        "orderCode": order_code,
        "orderNumber": excel_row.get("delivery_code"),
        "orderDate": order_date,
        "startDate": order_date,
        "customerId": customer_uuid,
        "customerName": customer_name,
        "vehicleId": None,
        "farmId": None,
        "farmName": (excel_row.get("inventory_source") or "").strip() or None,
        "status": "delivered",
        "paymentStatus": pay_status,
        "items": [{
            "productId": "00000000-0000-0000-0000-000000000000",
            "productName": crop_name or "Excel Import",
            "quantity": int(excel_row.get("qty_carton") or 1),
            "unitPrice": float(excel_row.get("actual_price") or 0),
            "totalPrice": float(excel_row.get("total_actual_value") or 0),
            "sourceType": "fresh",
        }],
        "subtotal": float(excel_row.get("total_actual_value") or 0),
        "tax": float(excel_row.get("vat_5pct") or 0),
        "total": float(excel_row.get("total_after_tax") or 0),
        "discount": 0,
        "createdBy": "bff26b8f-5ce9-49b2-9126-86174eaea823",
        "source": "excel_only",
        "isActive": True,
        "divisionId": DIVISION_ID,
        "organizationId": ORGANIZATION_ID,
        "createdAt": order_date or now,
        "updatedAt": now,
        "metadata": {
            "migratedFrom": MIGRATION_TAG,
            "legacyRef": order_uuid,
            "source": "excel_only",
            "excelRowNumber": excel_row.get("_excel_row"),
        },
    }

    line_key = f"excel_line|{order_date_norm}|{_norm_name(customer_name)}|{_norm_name(crop_name)}|{grade}|{excel_row.get('_excel_row','')}"
    line_uuid = deterministic_uuid("excel_line", line_key)
    line_doc = {
        "lineId": line_uuid,
        "orderId": order_uuid,
        "orderRef": order_uuid,
        "cropName": crop_name,
        "customerId": customer_uuid,
        "customerName": customer_name,
        "farmId": None,
        "farmName": (excel_row.get("inventory_source") or "").strip() or None,
        "grade": grade or None,
        "packageSize": excel_row.get("kg_conversion"),
        "packageType": None,
        "quantity": int(excel_row.get("qty_carton") or 0),
        "totalKg": excel_row.get("qty_kgs"),
        "totalPrice": excel_row.get("total_actual_value"),
        "avgPrice": excel_row.get("actual_price"),
        "blockId": None,
        "excel_data": build_excel_enrichment(excel_row),
        "divisionId": DIVISION_ID,
        "organizationId": ORGANIZATION_ID,
        "createdAt": order_date or now,
        "updatedAt": now,
        "metadata": {
            "migratedFrom": MIGRATION_TAG,
            "legacyRef": line_uuid,
            "source": "excel_only",
            "excelRowNumber": excel_row.get("_excel_row"),
        },
    }
    return order_doc, line_doc


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def run(dry_run: bool, reset: bool) -> None:
    """
    Main entry point for stage 5.

    Args:
        dry_run: if True, read and compute but do not write
        reset: if True, delete all migration-tagged sales_unmatched docs
    """
    logger = make_logger(STAGE)
    db = get_db()

    if reset:
        logger.info("[RESET] Deleting migration-tagged sales_unmatched docs...")
        reset_migration_data(db, RESET_COLLECTIONS, logger)
        # Also clear excel_data from order lines
        if not dry_run:
            db.sales_order_lines.update_many(
                {"metadata.migratedFrom": MIGRATION_TAG, "excel_data": {"$ne": None}},
                {"$set": {"excel_data": None, "blockId": None}},
            )
            db.sales_orders.delete_many(
                {"metadata.migratedFrom": MIGRATION_TAG, "source": "excel_only"}
            )

    # Ensure indexes
    if not dry_run:
        db.sales_unmatched.create_index("metadata.legacyRef", background=True)

    # -------------------------------------------------------------------
    # Load Excel
    # -------------------------------------------------------------------
    logger.info("Loading Sales Analysis Excel...")
    excel_rows = load_excel_rows()
    logger.info(f"Loaded {len(excel_rows)} Excel rows from Sales Analysis")

    # -------------------------------------------------------------------
    # Build match index from imported order lines
    # -------------------------------------------------------------------
    logger.info("Building match index from imported order lines...")

    # Key = (date_day, norm_customer, norm_crop, grade) → list of line docs
    line_index: dict[tuple, list[dict]] = defaultdict(list)

    for line_doc in db.sales_order_lines.find(
        {"metadata.migratedFrom": MIGRATION_TAG, "metadata.source": {"$ne": "excel_only"}},
        {
            "lineId": 1, "cropName": 1, "customerName": 1, "grade": 1,
            "orderId": 1, "metadata": 1, "_id": 0,
        },
    ):
        # We need the order date — join via orderId
        pass  # We'll do a two-pass approach below

    # Build order date map
    logger.info("Building order date map...")
    order_date_map: dict[str, str] = {}  # orderId → YYYY-MM-DD
    for order_doc in db.sales_orders.find(
        {"metadata.migratedFrom": MIGRATION_TAG, "source": {"$ne": "excel_only"}},
        {"orderId": 1, "orderDate": 1, "packedDate": 1, "_id": 0},
    ):
        date_val = order_doc.get("packedDate") or order_doc.get("orderDate")
        order_date_map[str(order_doc["orderId"])] = _norm_date(date_val)

    for line_doc in db.sales_order_lines.find(
        {"metadata.migratedFrom": MIGRATION_TAG, "metadata.source": {"$ne": "excel_only"}},
        {
            "lineId": 1, "cropName": 1, "customerName": 1, "grade": 1,
            "orderId": 1, "_id": 0,
        },
    ):
        order_id = str(line_doc.get("orderId", ""))
        date_key = order_date_map.get(order_id, "")
        cust_key = _norm_name(line_doc.get("customerName", ""))
        crop_key = _norm_name(line_doc.get("cropName", ""))
        grade_key = _norm_grade(line_doc.get("grade", ""))
        match_key = (date_key, cust_key, crop_key, grade_key)
        line_index[match_key].append(line_doc)

    logger.info(f"Match index built: {len(line_index)} unique (date,customer,crop,grade) keys")

    # Build customer UUID map for excel-only synthetic orders
    customer_uuid_map: dict[str, str] = {}
    for doc in db.customers.find(
        {"metadata.migratedFrom": MIGRATION_TAG},
        {"name": 1, "customerId": 1, "_id": 0},
    ):
        customer_uuid_map[_norm_name(doc.get("name", ""))] = str(doc["customerId"])

    # Inventory source → block UUID map
    logger.info("Building inventory source → block map...")
    block_ref_map = build_inventory_source_map(db)
    logger.info(f"Block ref map: {len(block_ref_map)} blocks")

    # -------------------------------------------------------------------
    # Process Excel rows
    # -------------------------------------------------------------------
    matched = 0
    unmatched_in_supabase = 0
    excel_only = 0
    errors = 0
    error_samples: list[str] = []
    unmatched_inventory_sources: list[str] = []

    # Track synthetic orders to avoid duplicates
    synthetic_order_keys: set[str] = set()
    nh_excel_excluded = 0

    for excel_row in excel_rows:
        date_key = _norm_date(excel_row.get("date"))
        cust_key = _norm_name(excel_row.get("customer_name"))
        crop_key = _norm_name(excel_row.get("crop_name"))
        grade_key = _norm_grade(excel_row.get("grade"))

        match_key = (date_key, cust_key, crop_key, grade_key)

        # Inventory source matching (best effort)
        inv_source = (excel_row.get("inventory_source") or "").strip()

        # Check if inventory source is NH — route to sales_unmatched with reason
        inv_source_lower = inv_source.lower()
        is_nh_source = (
            is_excluded_farm(inv_source)
            or inv_source_lower.startswith("s.nh")
            or inv_source_lower.startswith("nh-")
            or "new hydroponic" in inv_source_lower
        )
        if is_nh_source:
            # Excluded NH source: insert to sales_unmatched, do not attribute to any farm
            nh_excel_excluded += 1
            try:
                unmatched_doc = build_unmatched_doc(
                    excel_row,
                    reason="Excluded: NH (New Hydroponic) inventory source — farm removed from import",
                )
                if not dry_run:
                    db.sales_unmatched.replace_one(
                        {"metadata.legacyRef": unmatched_doc["metadata"]["legacyRef"]},
                        unmatched_doc,
                        upsert=True,
                    )
            except Exception as exc:
                msg = f"NH unmatched insert failed row={excel_row.get('_excel_row')}: {exc}"
                logger.error(msg)
                error_samples.append(msg)
                errors += 1
            continue  # Do not process further

        block_uuid = match_inventory_source(inv_source, block_ref_map) if inv_source else None
        if inv_source and not block_uuid:
            if inv_source not in unmatched_inventory_sources:
                unmatched_inventory_sources.append(inv_source)

        enrichment = build_excel_enrichment(excel_row)
        enrichment["matchedBlockId"] = block_uuid

        matched_lines = line_index.get(match_key, [])

        if matched_lines:
            # Update existing order lines
            for line_doc in matched_lines:
                line_id = line_doc.get("lineId")
                if not dry_run:
                    try:
                        db.sales_order_lines.update_one(
                            {"lineId": line_id},
                            {
                                "$set": {
                                    "excel_data": enrichment,
                                    "blockId": block_uuid,
                                    "updatedAt": utcnow(),
                                }
                            },
                        )
                        matched += 1
                    except Exception as exc:
                        msg = f"Order line update failed lineId={line_id}: {exc}"
                        logger.error(msg)
                        error_samples.append(msg)
                        errors += 1
                else:
                    logger.debug(f"  [DRY-RUN] Would update line {line_id} with excel enrichment")
                    matched += 1
        else:
            # No supabase match — check if it's an entirely new order (excel-only)
            # For now, insert into unmatched AND as synthetic order
            try:
                unmatched_doc = build_unmatched_doc(excel_row, reason="No matching supabase order line")
                if not dry_run:
                    db.sales_unmatched.replace_one(
                        {"metadata.legacyRef": unmatched_doc["metadata"]["legacyRef"]},
                        unmatched_doc,
                        upsert=True,
                    )
                unmatched_in_supabase += 1

                # Also create synthetic order + line
                order_doc, line_doc = build_synthetic_order_doc(excel_row, customer_uuid_map)
                order_key = order_doc["orderId"]
                if order_key not in synthetic_order_keys:
                    synthetic_order_keys.add(order_key)
                    if not dry_run:
                        db.sales_orders.replace_one(
                            {"metadata.legacyRef": order_key},
                            order_doc,
                            upsert=True,
                        )

                # Patch block onto line
                line_doc["blockId"] = block_uuid
                if not dry_run:
                    db.sales_order_lines.replace_one(
                        {"metadata.legacyRef": line_doc["metadata"]["legacyRef"]},
                        line_doc,
                        upsert=True,
                    )
                excel_only += 1

            except Exception as exc:
                msg = f"Unmatched/synthetic insert failed row={excel_row.get('_excel_row')}: {exc}"
                logger.error(msg)
                error_samples.append(msg)
                errors += 1

    # -------------------------------------------------------------------
    # Pass 2: Roll up Excel enrichment into sales_orders headers
    # -------------------------------------------------------------------
    logger.info("Pass 2: Rolling up Excel enrichment into order totals...")
    rollup_orders = 0
    rollup_revenue_total = 0.0
    rollup_status_counts: dict[str, int] = defaultdict(int)
    orders_no_price = 0

    if not dry_run:
        # Aggregate all lines per order using MongoDB
        pipeline = [
            {"$match": {"metadata.migratedFrom": MIGRATION_TAG}},
            {
                "$group": {
                    "_id": "$orderId",
                    "lineCount": {"$sum": 1},
                    "matchedCount": {
                        "$sum": {
                            "$cond": [{"$ifNull": ["$excel_data", False]}, 1, 0]
                        }
                    },
                    "subtotal": {
                        "$sum": {"$ifNull": ["$excel_data.totalActualValue", 0]}
                    },
                    "tax": {
                        "$sum": {"$ifNull": ["$excel_data.vatAmount", 0]}
                    },
                    "total": {
                        "$sum": {"$ifNull": ["$excel_data.totalAmountAfterTax", 0]}
                    },
                    "paidAmount": {
                        "$sum": {"$ifNull": ["$excel_data.paidAmount", 0]}
                    },
                    "unpaidAmount": {
                        "$sum": {"$ifNull": ["$excel_data.unpaidAmount", 0]}
                    },
                },
            },
        ]

        for agg in db.sales_order_lines.aggregate(pipeline):
            order_id = agg["_id"]
            if not order_id:
                continue
            subtotal = float(agg.get("subtotal") or 0)
            tax = float(agg.get("tax") or 0)
            total = float(agg.get("total") or 0)
            paid = float(agg.get("paidAmount") or 0)
            unpaid = float(agg.get("unpaidAmount") or 0)
            matched_lines_count = int(agg.get("matchedCount") or 0)
            total_lines_count = int(agg.get("lineCount") or 0)

            update_fields: dict = {
                "metadata.excelRollupApplied": True,
                "metadata.excelMatchedLineCount": matched_lines_count,
                "metadata.excelTotalLineCount": total_lines_count,
                "updatedAt": utcnow(),
            }

            if matched_lines_count == 0:
                # No Excel data at all for this order — flag and skip monetary update
                update_fields["metadata.noPriceData"] = True
                orders_no_price += 1
            else:
                update_fields["subtotal"] = round(subtotal, 2)
                update_fields["tax"] = round(tax, 2)
                update_fields["total"] = round(total, 2)
                update_fields["paidAmount"] = round(paid, 2)
                update_fields["unpaidAmount"] = round(unpaid, 2)

                # Determine paymentStatus
                if total <= 0.01:
                    pay_status = None  # keep existing
                elif paid >= total - 0.01:
                    pay_status = "paid"
                elif paid > 0:
                    pay_status = "partial"
                else:
                    pay_status = "pending"
                if pay_status:
                    update_fields["paymentStatus"] = pay_status
                    rollup_status_counts[pay_status] += 1

                rollup_revenue_total += total
                rollup_orders += 1

            db.sales_orders.update_one({"orderId": order_id}, {"$set": update_fields})

    logger.info(
        f"Pass 2 done. Rolled up {rollup_orders} orders "
        f"(revenue: {rollup_revenue_total:,.2f} AED), "
        f"{orders_no_price} orders flagged noPriceData"
    )
    logger.info(f"  paymentStatus distribution: {dict(rollup_status_counts)}")

    # -------------------------------------------------------------------
    # Write unmatched inventory sources log
    # -------------------------------------------------------------------
    if unmatched_inventory_sources:
        inv_log = LOG_DIR / "stage5_unmatched_inventory.txt"
        with open(inv_log, "w", encoding="utf-8") as f:
            f.write("Unmatched inventory sources (could not map to block):\n")
            for s in sorted(set(unmatched_inventory_sources)):
                f.write(f"  - {s}\n")
        logger.warning(
            f"{len(set(unmatched_inventory_sources))} unique inventory sources unmatched. "
            f"See {inv_log}"
        )

    print_summary(
        stage=STAGE,
        rows_read=len(excel_rows),
        rows_inserted=excel_only,
        rows_updated=matched,
        rows_skipped=0,
        rows_errored=errors,
        error_samples=error_samples,
        logger=logger,
    )
    logger.info(
        f"  Matched (order line enriched): {matched}\n"
        f"  Unmatched (no supabase order): {unmatched_in_supabase}\n"
        f"  Synthetic (excel-only orders): {excel_only}\n"
        f"  NH rows routed to sales_unmatched: {nh_excel_excluded}\n"
        f"  Inventory sources unmatched: {len(set(unmatched_inventory_sources))}"
    )

    if errors > 0:
        sys.exit(1)


if __name__ == "__main__":
    parser = make_arg_parser(
        "Stage 5: Reconcile Sales Excel with imported order lines"
    )
    args = parser.parse_args()
    run(dry_run=args.dry_run, reset=args.reset)
