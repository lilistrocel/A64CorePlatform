"""
Stage 5b: Price imputation for orders missing Excel match.

Two layers:
  Layer 1: Customer alias re-match — fix name mismatches, re-attempt exact match
           against Excel (date, customer_alias, crop, grade)
  Layer 2: Imputation — for lines still missing prices, apply avg price per
           (customerName, cropName, grade) computed from already-matched lines.
           Adds 5% VAT consistent with Excel data.

Layer 3 (global avg) intentionally NOT implemented — user decided against it
to keep revenue numbers defensible.

Tags every line with metadata.priceSource:
  - excel_match          : original stage 5 Excel join (already set)
  - excel_alias_match    : matched via alias map (layer 1)
  - imputed_customer_crop_avg : averaged layer 2
  - no_data              : no source available
"""
from __future__ import annotations

import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from common import (
    DIVISION_ID,
    MIGRATION_TAG,
    ORGANIZATION_ID,
    get_db,
    make_arg_parser,
    make_logger,
    print_summary,
    utcnow,
)
import openpyxl

STAGE = "stage5b_price_imputation"
EXCEL_PATH = Path(
    "OldData/7-April-2026/Sales Reports - 02-04-2026 Aug25-July26.xlsx"
)

# Customer alias map: DB name (lower+stripped) → Excel canonical name
ALIAS_MAP = {
    "nrtc company": "N.R.T.C DUBAI INTERNATIONAL VEGETABLES & FRUITS",
    "al montazah": "AL MONTAZAH VEGETABLES & FRUITS TRADING (L.L.C.)",
    "al fares for agricultural crop tradbing": "AL FARES FOR AGRICULTURAL  CROPS TRADIBNG",
    "al mahtab vegetables & fruits company llc": "AL MAHTAB VEGETABLES",
    "silal food and technology llc": "SILAL FOOD AND TECHNOLOGY L.L.C",
    "ali gholami vegetables & fruits llc": "ALI GHOLAMI VEGETABLES & FRUITS LLC",
}


def norm_name(s) -> str:
    """Aggressive normalization — lowercase, strip all non-alphanum, collapse spaces."""
    import re
    if s is None:
        return ""
    s = str(s).lower()
    s = re.sub(r"[^a-z0-9 ]", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def norm_date(d) -> str:
    if d is None:
        return ""
    if isinstance(d, datetime):
        return d.strftime("%Y-%m-%d")
    return str(d)[:10]


def norm_grade(g) -> str:
    if not g:
        return ""
    return str(g).strip().upper()


def load_excel_by_alias_key():
    """
    Load Excel rows indexed by (date, excel_customer_norm, crop_norm, grade).
    Uses the EXCEL canonical names from ALIAS_MAP so we can match aliased DB rows.
    """
    wb = openpyxl.load_workbook(str(EXCEL_PATH), read_only=True, data_only=True)
    ws = wb["Sales Analysis"]
    excel_rows = []
    for i, r in enumerate(ws.iter_rows(min_row=4, values_only=True)):
        if not r or not r[0]:
            continue
        excel_rows.append({
            "row": i + 4,
            "date": r[0],
            "customer": r[2],
            "inventorySource": r[3],
            "deliveryCode": r[4],
            "crop": r[5],
            "grade": r[6],
            "qtyKgs": r[9],
            "actualPrice": r[12],
            "totalActualValue": r[13],
            "vatAmount": r[14],
            "totalAfterTax": r[15],
            "invoiceStatus": r[16],
            "paymentStatus": r[17],
            "paidAmount": r[19],
            "unpaidAmount": r[20],
        })
    wb.close()

    index = defaultdict(list)
    for er in excel_rows:
        key = (
            norm_date(er["date"]),
            norm_name(er["customer"]),
            norm_name(er["crop"]),
            norm_grade(er["grade"]),
        )
        index[key].append(er)
    return index


def run(dry_run: bool, reset: bool) -> None:
    logger = make_logger(STAGE)
    db = get_db()

    if reset:
        logger.info("[RESET] Clearing imputation flags...")
        if not dry_run:
            db.sales_order_lines.update_many(
                {"metadata.migratedFrom": MIGRATION_TAG,
                 "metadata.priceSource": {"$in": ["excel_alias_match", "imputed_customer_crop_avg"]}},
                {"$unset": {"excel_data": "", "metadata.priceSource": ""}}
            )

    # --------------------------------------------------------------
    # Build Excel alias-aware index
    # --------------------------------------------------------------
    logger.info("Loading Excel for alias-aware re-match...")
    excel_index = load_excel_by_alias_key()
    logger.info(f"Excel index: {len(excel_index)} unique keys")

    # --------------------------------------------------------------
    # Fetch noPriceData orders + their lines
    # --------------------------------------------------------------
    logger.info("Fetching orders with noPriceData flag...")
    no_price_orders = list(db.sales_orders.find(
        {"metadata.migratedFrom": MIGRATION_TAG, "metadata.noPriceData": True,
         "source": {"$ne": "excel_only"}},
        {"orderId": 1, "packedDate": 1, "orderDate": 1, "customerName": 1, "_id": 0}
    ))
    logger.info(f"Found {len(no_price_orders)} noPriceData orders")

    order_date_map = {}
    order_customer_map = {}
    for o in no_price_orders:
        d = o.get("packedDate") or o.get("orderDate")
        order_date_map[str(o["orderId"])] = norm_date(d)
        order_customer_map[str(o["orderId"])] = o.get("customerName") or ""

    order_ids = set(order_date_map.keys())

    # --------------------------------------------------------------
    # LAYER 1: Alias re-match
    # --------------------------------------------------------------
    logger.info("LAYER 1: Alias re-match...")
    layer1_matched = 0

    for line in db.sales_order_lines.find(
        {"metadata.migratedFrom": MIGRATION_TAG,
         "orderId": {"$in": list(order_ids)},
         "$or": [{"excel_data": None}, {"excel_data": {"$exists": False}}]},
        {"lineId": 1, "orderId": 1, "cropName": 1, "grade": 1, "customerName": 1, "totalKg": 1}
    ):
        order_id = str(line["orderId"])
        date_key = order_date_map.get(order_id, "")
        db_customer_norm = norm_name(line.get("customerName") or order_customer_map.get(order_id, ""))

        # Translate DB name → Excel canonical via alias map, then normalize
        excel_canon = ALIAS_MAP.get(db_customer_norm)
        if not excel_canon:
            continue
        excel_customer_norm = norm_name(excel_canon)

        crop_norm = norm_name(line.get("cropName"))
        grade_norm = norm_grade(line.get("grade"))

        match_key = (date_key, excel_customer_norm, crop_norm, grade_norm)
        matches = excel_index.get(match_key, [])
        if not matches:
            continue

        # Use first match (there can be duplicates for same grade/day — pick first)
        er = matches[0]
        enrichment = {
            "actualPrice": er["actualPrice"],
            "totalActualValue": er["totalActualValue"],
            "vatAmount": er["vatAmount"],
            "totalAmountAfterTax": er["totalAfterTax"],
            "invoiceStatus": er["invoiceStatus"],
            "paymentStatus": er["paymentStatus"],
            "paidAmount": er["paidAmount"],
            "unpaidAmount": er["unpaidAmount"],
            "excelRowNumber": er["row"],
            "aliasMatched": True,
        }
        if not dry_run:
            db.sales_order_lines.update_one(
                {"lineId": line["lineId"]},
                {"$set": {
                    "excel_data": enrichment,
                    "metadata.priceSource": "excel_alias_match",
                    "updatedAt": utcnow(),
                }}
            )
        layer1_matched += 1

    logger.info(f"Layer 1: {layer1_matched} lines matched via alias")

    # --------------------------------------------------------------
    # Build avg price index from ALL priced lines (original excel + alias)
    # --------------------------------------------------------------
    logger.info("LAYER 2: Building customer+crop+grade average price index...")
    # Key: (customer_norm, crop_norm, grade_norm) → {price_sum, kg_sum, n}
    avg_index = defaultdict(lambda: {"price_sum": 0.0, "kg_sum": 0.0, "n": 0})

    for line in db.sales_order_lines.find(
        {"metadata.migratedFrom": MIGRATION_TAG,
         "excel_data.actualPrice": {"$exists": True, "$ne": None, "$gt": 0}},
        {"customerName": 1, "cropName": 1, "grade": 1, "excel_data.actualPrice": 1,
         "totalKg": 1}
    ):
        cust = norm_name(line.get("customerName"))
        crop = norm_name(line.get("cropName"))
        grade = norm_grade(line.get("grade"))
        price = float(line["excel_data"].get("actualPrice") or 0)
        if price <= 0:
            continue
        kg = float(line.get("totalKg") or 0)
        key = (cust, crop, grade)
        avg_index[key]["price_sum"] += price
        avg_index[key]["kg_sum"] += kg
        avg_index[key]["n"] += 1

    # Compute simple average price per unit (not weighted by kg — straight average)
    avg_price_map = {
        k: v["price_sum"] / v["n"] for k, v in avg_index.items() if v["n"] > 0
    }
    logger.info(f"Built avg price map: {len(avg_price_map)} (customer,crop,grade) combos")

    # --------------------------------------------------------------
    # LAYER 2: Impute remaining unmatched lines
    # --------------------------------------------------------------
    logger.info("LAYER 2: Imputing prices for remaining lines...")
    layer2_imputed = 0
    layer2_no_avg = 0

    for line in db.sales_order_lines.find(
        {"metadata.migratedFrom": MIGRATION_TAG,
         "orderId": {"$in": list(order_ids)},
         "$or": [{"excel_data": None}, {"excel_data": {"$exists": False}}]},
        {"lineId": 1, "orderId": 1, "cropName": 1, "grade": 1,
         "customerName": 1, "totalKg": 1, "quantity": 1}
    ):
        order_id = str(line["orderId"])
        cust_raw = line.get("customerName") or order_customer_map.get(order_id, "")
        cust = norm_name(cust_raw)
        # Also try alias-translated customer name for the avg lookup
        excel_canon = ALIAS_MAP.get(cust)
        lookup_cust = norm_name(excel_canon) if excel_canon else cust

        crop = norm_name(line.get("cropName"))
        grade = norm_grade(line.get("grade"))

        avg_price = avg_price_map.get((lookup_cust, crop, grade))
        if not avg_price:
            layer2_no_avg += 1
            if not dry_run:
                db.sales_order_lines.update_one(
                    {"lineId": line["lineId"]},
                    {"$set": {"metadata.priceSource": "no_data"}}
                )
            continue

        kg = float(line.get("totalKg") or 0)
        if kg <= 0:
            layer2_no_avg += 1
            continue

        total_actual = round(avg_price * kg, 2)
        vat = round(total_actual * 0.05, 2)
        total_after_tax = round(total_actual + vat, 2)

        enrichment = {
            "actualPrice": round(avg_price, 4),
            "totalActualValue": total_actual,
            "vatAmount": vat,
            "totalAmountAfterTax": total_after_tax,
            "invoiceStatus": "IMPUTED",
            "paymentStatus": "unknown",
            "paidAmount": 0,
            "unpaidAmount": total_after_tax,
            "imputed": True,
            "imputedFrom": f"{lookup_cust}|{crop}|{grade}",
        }
        if not dry_run:
            db.sales_order_lines.update_one(
                {"lineId": line["lineId"]},
                {"$set": {
                    "excel_data": enrichment,
                    "metadata.priceSource": "imputed_customer_crop_avg",
                    "updatedAt": utcnow(),
                }}
            )
        layer2_imputed += 1

    logger.info(f"Layer 2: {layer2_imputed} imputed, {layer2_no_avg} no avg available")

    # --------------------------------------------------------------
    # Re-rollup order totals (same logic as stage 5)
    # --------------------------------------------------------------
    logger.info("Re-rolling up order totals...")
    rollup_orders = 0
    total_revenue = 0.0
    status_counts = defaultdict(int)

    pipeline = [
        {"$match": {"metadata.migratedFrom": MIGRATION_TAG,
                    "orderId": {"$in": list(order_ids)}}},
        {"$group": {
            "_id": "$orderId",
            "lineCount": {"$sum": 1},
            "matchedCount": {"$sum": {"$cond": [{"$ifNull": ["$excel_data", False]}, 1, 0]}},
            "subtotal": {"$sum": {"$ifNull": ["$excel_data.totalActualValue", 0]}},
            "tax": {"$sum": {"$ifNull": ["$excel_data.vatAmount", 0]}},
            "total": {"$sum": {"$ifNull": ["$excel_data.totalAmountAfterTax", 0]}},
            "paidAmount": {"$sum": {"$ifNull": ["$excel_data.paidAmount", 0]}},
            "unpaidAmount": {"$sum": {"$ifNull": ["$excel_data.unpaidAmount", 0]}},
        }},
    ]

    if not dry_run:
        for agg in db.sales_order_lines.aggregate(pipeline):
            order_id = agg["_id"]
            matched = int(agg.get("matchedCount") or 0)
            if matched == 0:
                continue
            subtotal = float(agg.get("subtotal") or 0)
            tax = float(agg.get("tax") or 0)
            total = float(agg.get("total") or 0)
            paid = float(agg.get("paidAmount") or 0)
            unpaid = float(agg.get("unpaidAmount") or 0)

            if total <= 0.01:
                continue

            if paid >= total - 0.01:
                pay_status = "paid"
            elif paid > 0:
                pay_status = "partial"
            else:
                pay_status = "pending"

            db.sales_orders.update_one(
                {"orderId": order_id},
                {"$set": {
                    "subtotal": round(subtotal, 2),
                    "tax": round(tax, 2),
                    "total": round(total, 2),
                    "paidAmount": round(paid, 2),
                    "unpaidAmount": round(unpaid, 2),
                    "paymentStatus": pay_status,
                    "metadata.excelMatchedLineCount": matched,
                    "metadata.excelTotalLineCount": int(agg.get("lineCount") or 0),
                    "metadata.noPriceData": False,
                    "updatedAt": utcnow(),
                }}
            )
            rollup_orders += 1
            total_revenue += total
            status_counts[pay_status] += 1

    logger.info(f"Rolled up {rollup_orders} additional orders")
    logger.info(f"Additional revenue recovered: {total_revenue:,.2f} AED")
    logger.info(f"Payment status distribution: {dict(status_counts)}")

    print_summary(
        stage=STAGE,
        rows_read=len(no_price_orders),
        rows_inserted=0,
        rows_updated=layer1_matched + layer2_imputed,
        rows_skipped=layer2_no_avg,
        rows_errored=0,
        error_samples=[],
        logger=logger,
    )


if __name__ == "__main__":
    parser = make_arg_parser(
        "Stage 5b: Price imputation (alias match + customer+crop+grade average)"
    )
    args = parser.parse_args()
    run(dry_run=args.dry_run, reset=args.reset)
