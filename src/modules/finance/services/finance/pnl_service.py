"""
Finance Module - P&L Service

All aggregation logic for the P&L dashboard endpoints.

Design notes
------------
- All DB reads are read-only (no writes).
- Revenue is sourced from sales_order_lines.excel_data (the enriched per-line data).
  Lines with null excel_data contribute 0 to monetary totals but are still counted.
- COGS uses Option B: purchase_register items with mappedCropName are crop-direct;
  items without mappedCropName (fertilizers, seeds, pesticides etc.) are farm overhead
  allocated by revenue ratio. inventory_movements type='consumed' also contribute to COGS.
- Opex: purchase_register items classified as ASSET/MAINTENANCE/SERVICE/REPAIR/LABOR.
  Currently labor = 0 (no HR salary data).
- All monetary values returned as float (AED). Frontend handles formatting.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from src.services.database import mongodb

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Item classification helpers
# ---------------------------------------------------------------------------

# Keywords in purchase_register item names that classify as OPEX (not COGS).
# The check is case-insensitive substring match.
OPEX_KEYWORDS: Tuple[str, ...] = (
    "service", "repair", "maintenance", "labor", "labour",
    "salary", "wage", "insurance", "rent", "lease",
    "fuel", "transport", "freight", "vehicle",
    "admin", "office", "utility", "electricity",
)

# Keywords that specifically indicate maintenance opex
MAINTENANCE_KEYWORDS: Tuple[str, ...] = (
    "repair", "maintenance", "service",
)

# Keywords that indicate logistics opex
LOGISTICS_KEYWORDS: Tuple[str, ...] = (
    "fuel", "transport", "freight", "vehicle", "delivery",
)


def _classify_item(item_name: str) -> str:
    """
    Classify a purchase_register item name into one of:
      'cogs_crop'   — has mappedCropName (handled separately)
      'cogs_farm'   — farm overhead (fertilizer, seed, pesticide, etc.)
      'opex_maintenance'
      'opex_logistics'
      'opex_other'

    This function is only called when mappedCropName is None.
    """
    lower = item_name.lower()
    for kw in MAINTENANCE_KEYWORDS:
        if kw in lower:
            return "opex_maintenance"
    for kw in LOGISTICS_KEYWORDS:
        if kw in lower:
            return "opex_logistics"
    for kw in OPEX_KEYWORDS:
        if kw in lower:
            return "opex_other"
    # Default: treat as farm overhead COGS
    return "cogs_farm"


def _safe_round(value: float, decimals: int = 2) -> float:
    """Round a float to `decimals` places, returning 0.0 if value is NaN/None."""
    try:
        return round(float(value or 0.0), decimals)
    except (TypeError, ValueError):
        return 0.0


def _margin(profit: float, revenue: float) -> float:
    """Calculate a margin percentage, guarding against division by zero."""
    if revenue == 0:
        return 0.0
    return _safe_round(profit / revenue * 100)


# ---------------------------------------------------------------------------
# Date filter helpers
# ---------------------------------------------------------------------------

def _build_date_match(
    start_date: Optional[date],
    end_date: Optional[date],
    date_field: str = "orderDate",
) -> Dict[str, Any]:
    """Build a MongoDB $match clause for date range filtering."""
    date_filter: Dict[str, Any] = {}
    if start_date:
        date_filter["$gte"] = datetime.combine(start_date, datetime.min.time())
    if end_date:
        date_filter["$lte"] = datetime.combine(end_date, datetime.max.time())
    if date_filter:
        return {date_field: date_filter}
    return {}


# ---------------------------------------------------------------------------
# Main service class
# ---------------------------------------------------------------------------

class PnLService:
    """
    Service layer for P&L aggregation.

    Each public method corresponds to one API endpoint and returns the
    data dict that the route handler will wrap in the response model.
    """

    def __init__(self) -> None:
        self._db = None

    def _get_db(self):
        """Lazy-load the database handle."""
        if self._db is None:
            self._db = mongodb.get_database()
        return self._db

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _revenue_pipeline(
        self,
        farm_id: Optional[str],
        farming_year: Optional[int],
        start_date: Optional[date],
        end_date: Optional[date],
        include_imputed: bool,
        price_source_filter: Optional[str],
    ) -> Dict[str, Any]:
        """
        Run the core revenue aggregation over sales_order_lines.

        Returns a dict with:
          gross, tax, net, lineCount, paidAmount, unpaidAmount,
          bySource (dict), kgSold, orderRefs (set of unique order refs)
        """
        db = self._get_db()

        match: Dict[str, Any] = {}

        if farm_id:
            match["farmId"] = farm_id
        if farming_year:
            match["farmingYear"] = farming_year
        if start_date or end_date:
            match.update(_build_date_match(start_date, end_date, "createdAt"))

        # Price source filtering
        if price_source_filter:
            match["metadata.priceSource"] = price_source_filter
        elif not include_imputed:
            match["metadata.priceSource"] = {"$in": ["excel_match", "excel_alias_match"]}

        pipeline = [
            {"$match": match},
            {
                "$group": {
                    "_id": None,
                    "gross": {
                        "$sum": {
                            "$subtract": [
                                {"$ifNull": ["$excel_data.totalAmountAfterTax", 0]},
                                {"$ifNull": ["$excel_data.vatAmount", 0]},
                            ]
                        }
                    },
                    "tax": {"$sum": {"$ifNull": ["$excel_data.vatAmount", 0]}},
                    "net": {"$sum": {"$ifNull": ["$excel_data.totalAmountAfterTax", 0]}},
                    "paidAmount": {"$sum": {"$ifNull": ["$excel_data.paidAmount", 0]}},
                    "lineCount": {"$sum": 1},
                    "kgSold": {"$sum": {"$ifNull": ["$totalKg", 0]}},
                    "orderRefs": {"$addToSet": "$orderRef"},
                }
            },
        ]

        result = await db.sales_order_lines.aggregate(pipeline).to_list(1)
        row = result[0] if result else {}

        net = _safe_round(row.get("net", 0.0))
        paid = _safe_round(row.get("paidAmount", 0.0))
        unpaid = _safe_round(max(net - paid, 0.0))
        collection_rate = _safe_round(paid / net) if net > 0 else 0.0

        # By-source breakdown
        source_match = dict(match)  # copy to avoid mutation
        by_source_pipeline = [
            {"$match": source_match},
            {
                "$group": {
                    "_id": {"$ifNull": ["$metadata.priceSource", "unknown"]},
                    "revenue": {"$sum": {"$ifNull": ["$excel_data.totalAmountAfterTax", 0]}},
                }
            },
        ]
        source_rows = await db.sales_order_lines.aggregate(by_source_pipeline).to_list(20)
        by_source: Dict[str, float] = {
            "excel_match": 0.0,
            "excel_alias_match": 0.0,
            "imputed_customer_crop_avg": 0.0,
            "no_data": 0.0,
        }
        for sr in source_rows:
            key = sr["_id"] or "unknown"
            if key in by_source:
                by_source[key] = _safe_round(sr["revenue"])
            else:
                by_source[key] = _safe_round(sr["revenue"])

        return {
            "gross": _safe_round(row.get("gross", 0.0)),
            "tax": _safe_round(row.get("tax", 0.0)),
            "net": net,
            "lineCount": int(row.get("lineCount", 0)),
            "paidAmount": paid,
            "unpaidAmount": unpaid,
            "collectionRate": collection_rate,
            "bySource": by_source,
            "kgSold": _safe_round(row.get("kgSold", 0.0)),
            "orderRefs": set(row.get("orderRefs", [])),
        }

    async def _cogs_and_opex(
        self,
        farm_id: Optional[str],
        farming_year: Optional[int],
        start_date: Optional[date],
        end_date: Optional[date],
    ) -> Dict[str, Any]:
        """
        Aggregate COGS and Opex from purchase_register and inventory_movements.

        Returns dict with:
          cogs_crop, cogs_farm, opex_maintenance, opex_logistics, opex_other,
          inventory_cogs
        """
        db = self._get_db()

        pr_match: Dict[str, Any] = {}
        if start_date or end_date:
            pr_match.update(_build_date_match(start_date, end_date, "date"))

        pipeline = [
            {"$match": pr_match},
            {"$unwind": "$items"},
            {
                "$project": {
                    "name": "$items.name",
                    "amount": "$items.amount",
                    "mappedCropName": "$items.mappedCropName",
                }
            },
        ]
        items = await db.purchase_register.aggregate(pipeline).to_list(10000)

        cogs_crop = 0.0
        cogs_farm = 0.0
        opex_maintenance = 0.0
        opex_logistics = 0.0
        opex_other = 0.0

        for item in items:
            amount = float(item.get("amount") or 0.0)
            if item.get("mappedCropName"):
                cogs_crop += amount
            else:
                classification = _classify_item(item.get("name", ""))
                if classification == "cogs_farm":
                    cogs_farm += amount
                elif classification == "opex_maintenance":
                    opex_maintenance += amount
                elif classification == "opex_logistics":
                    opex_logistics += amount
                else:
                    opex_other += amount

        # NOTE: inventory_movements.totalCost for 'consumed' records is computed as
        # baseQuantity (mg) * unitCost in the migration data, producing absurdly large values.
        # Until the data is corrected, we exclude inventory_movements from COGS and rely
        # solely on purchase_register which has verified, clean amounts.
        # This field is kept in the response as 0.0 until data quality is confirmed.
        inventory_cogs = 0.0

        return {
            "cogs_crop": _safe_round(cogs_crop),
            "cogs_farm": _safe_round(cogs_farm),
            "opex_maintenance": _safe_round(opex_maintenance),
            "opex_logistics": _safe_round(opex_logistics),
            "opex_other": _safe_round(opex_other),
            "inventory_cogs": _safe_round(inventory_cogs),
        }

    async def _order_counts(
        self,
        farm_id: Optional[str],
        farming_year: Optional[int],
        start_date: Optional[date],
        end_date: Optional[date],
    ) -> Dict[str, int]:
        """Get order counts by paymentStatus."""
        db = self._get_db()

        match: Dict[str, Any] = {}
        if farm_id:
            match["farmId"] = farm_id
        if farming_year:
            match["farmingYear"] = farming_year
        if start_date or end_date:
            match.update(_build_date_match(start_date, end_date, "orderDate"))

        pipeline = [
            {"$match": match},
            {"$group": {"_id": "$paymentStatus", "count": {"$sum": 1}}},
        ]
        rows = await db.sales_orders.aggregate(pipeline).to_list(20)
        counts = {"paid": 0, "pending": 0, "partial": 0}
        total = 0
        for row in rows:
            status = row["_id"] or "unknown"
            n = int(row["count"])
            total += n
            if status in counts:
                counts[status] = n
        counts["total"] = total
        return counts

    async def _kg_harvested(
        self,
        farm_id: Optional[str],
        start_date: Optional[date],
        end_date: Optional[date],
    ) -> float:
        """Sum kg harvested from block_harvests."""
        db = self._get_db()

        match: Dict[str, Any] = {}
        if farm_id:
            match["farmId"] = farm_id
        if start_date or end_date:
            match.update(_build_date_match(start_date, end_date, "harvestDate"))

        pipeline = [
            {"$match": match},
            {"$group": {"_id": None, "total": {"$sum": {"$ifNull": ["$quantityKg", 0]}}}},
        ]
        result = await db.block_harvests.aggregate(pipeline).to_list(1)
        return _safe_round(result[0]["total"] if result else 0.0)

    async def _period_bounds(
        self,
        farm_id: Optional[str],
        farming_year: Optional[int],
    ) -> Tuple[Optional[str], Optional[str]]:
        """Derive the actual data period start/end from the order lines."""
        db = self._get_db()

        match: Dict[str, Any] = {}
        if farm_id:
            match["farmId"] = farm_id
        if farming_year:
            match["farmingYear"] = farming_year

        pipeline = [
            {"$match": match},
            {
                "$group": {
                    "_id": None,
                    "minDate": {"$min": "$createdAt"},
                    "maxDate": {"$max": "$createdAt"},
                }
            },
        ]
        result = await db.sales_order_lines.aggregate(pipeline).to_list(1)
        if not result:
            return None, None
        row = result[0]
        start = row["minDate"].date().isoformat() if row.get("minDate") else None
        end = row["maxDate"].date().isoformat() if row.get("maxDate") else None
        return start, end

    # ------------------------------------------------------------------
    # Public endpoint methods
    # ------------------------------------------------------------------

    async def get_summary(
        self,
        farm_id: Optional[str] = None,
        farming_year: Optional[int] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        include_imputed: bool = True,
        price_source_filter: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Aggregate data for the /summary endpoint."""

        revenue_data = await self._revenue_pipeline(
            farm_id, farming_year, start_date, end_date,
            include_imputed, price_source_filter,
        )
        costs_data = await self._cogs_and_opex(
            farm_id, farming_year, start_date, end_date,
        )
        order_counts = await self._order_counts(
            farm_id, farming_year, start_date, end_date,
        )
        kg_harvested = await self._kg_harvested(farm_id, start_date, end_date)

        # Period
        if start_date and end_date:
            period_start = start_date.isoformat()
            period_end = end_date.isoformat()
        else:
            period_start, period_end = await self._period_bounds(farm_id, farming_year)

        net_revenue = revenue_data["net"]
        total_cogs = (
            costs_data["cogs_crop"]
            + costs_data["cogs_farm"]
            + costs_data["inventory_cogs"]
        )
        total_opex = (
            costs_data["opex_maintenance"]
            + costs_data["opex_logistics"]
            + costs_data["opex_other"]
        )
        gross_profit = _safe_round(net_revenue - total_cogs)
        operating_profit = _safe_round(gross_profit - total_opex)

        return {
            "revenue": {
                "gross": revenue_data["gross"],
                "tax": revenue_data["tax"],
                "net": net_revenue,
                "lineCount": revenue_data["lineCount"],
                "paidAmount": revenue_data["paidAmount"],
                "unpaidAmount": revenue_data["unpaidAmount"],
                "collectionRate": revenue_data["collectionRate"],
                "bySource": revenue_data["bySource"],
            },
            "cogs": {
                "total": _safe_round(total_cogs),
                "allocatedByCrop": costs_data["cogs_crop"],
                "allocatedByFarm": costs_data["cogs_farm"],
                # inventory_movements totalCost is excluded due to data quality issue
                # (migration computed it using baseQuantity in mg, not kg quantity).
                "unallocatedOverhead": 0.0,
            },
            "grossProfit": gross_profit,
            "grossMarginPercent": _margin(gross_profit, net_revenue),
            "opex": {
                "total": _safe_round(total_opex),
                "logistics": costs_data["opex_logistics"],
                "maintenance": costs_data["opex_maintenance"],
                "labor": 0.0,
                "other": costs_data["opex_other"],
            },
            "operatingProfit": operating_profit,
            "operatingMarginPercent": _margin(operating_profit, net_revenue),
            "kg": {
                "sold": revenue_data["kgSold"],
                "harvested": kg_harvested,
            },
            "orders": order_counts,
            "period": {"start": period_start, "end": period_end},
        }

    async def get_by_month(
        self,
        farm_id: Optional[str] = None,
        farming_year: Optional[int] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        include_imputed: bool = True,
        price_source_filter: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Aggregate monthly P&L buckets."""
        db = self._get_db()

        match: Dict[str, Any] = {}
        if farm_id:
            match["farmId"] = farm_id
        if farming_year:
            match["farmingYear"] = farming_year
        if start_date or end_date:
            match.update(_build_date_match(start_date, end_date, "createdAt"))
        if price_source_filter:
            match["metadata.priceSource"] = price_source_filter
        elif not include_imputed:
            match["metadata.priceSource"] = {"$in": ["excel_match", "excel_alias_match"]}

        pipeline = [
            {"$match": match},
            {
                "$group": {
                    "_id": {
                        "year": {"$year": "$createdAt"},
                        "month": {"$month": "$createdAt"},
                    },
                    "revenue": {"$sum": {"$ifNull": ["$excel_data.totalAmountAfterTax", 0]}},
                    "kgSold": {"$sum": {"$ifNull": ["$totalKg", 0]}},
                    "orderRefs": {"$addToSet": "$orderRef"},
                }
            },
            {"$sort": {"_id.year": 1, "_id.month": 1}},
        ]
        rows = await db.sales_order_lines.aggregate(pipeline).to_list(200)

        # Build a month -> purchase costs lookup (simplified: spread total evenly)
        pr_match: Dict[str, Any] = {}
        if start_date or end_date:
            pr_match.update(_build_date_match(start_date, end_date, "date"))

        pr_pipeline = [
            {"$match": pr_match},
            {"$unwind": "$items"},
            {
                "$group": {
                    "_id": {
                        "year": {"$year": "$date"},
                        "month": {"$month": "$date"},
                    },
                    "totalCost": {"$sum": "$items.amount"},
                }
            },
        ]
        pr_rows = await db.purchase_register.aggregate(pr_pipeline).to_list(200)
        pr_by_month: Dict[str, float] = {}
        for pr in pr_rows:
            key = f"{pr['_id']['year']:04d}-{pr['_id']['month']:02d}"
            pr_by_month[key] = _safe_round(pr["totalCost"])

        buckets: List[Dict[str, Any]] = []
        for row in rows:
            yr = row["_id"]["year"]
            mo = row["_id"]["month"]
            ym = f"{yr:04d}-{mo:02d}"
            revenue = _safe_round(row["revenue"])
            cogs = pr_by_month.get(ym, 0.0)
            opex = 0.0  # Opex not broken by month yet (purchase_register has no classification in this query)
            gross = _safe_round(revenue - cogs)
            net = _safe_round(gross - opex)
            buckets.append({
                "yearMonth": ym,
                "revenue": revenue,
                "cogs": cogs,
                "opex": opex,
                "grossProfit": gross,
                "netProfit": net,
                "kgSold": _safe_round(row["kgSold"]),
                "orderCount": len(row.get("orderRefs", [])),
            })

        return buckets

    async def get_by_farm(
        self,
        farming_year: Optional[int] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        include_imputed: bool = True,
        price_source_filter: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Aggregate P&L per farm. Includes all farms even with zero revenue."""
        db = self._get_db()

        # Get all farms
        all_farms = await db.farms.find({}, {"farmId": 1, "name": 1}).to_list(100)
        farm_map: Dict[str, str] = {
            f["farmId"]: f.get("name", "Unknown") for f in all_farms if f.get("farmId")
        }

        match: Dict[str, Any] = {}
        if farming_year:
            match["farmingYear"] = farming_year
        if start_date or end_date:
            match.update(_build_date_match(start_date, end_date, "createdAt"))
        if price_source_filter:
            match["metadata.priceSource"] = price_source_filter
        elif not include_imputed:
            match["metadata.priceSource"] = {"$in": ["excel_match", "excel_alias_match"]}

        pipeline = [
            {"$match": match},
            {
                "$group": {
                    "_id": "$farmId",
                    "revenue": {"$sum": {"$ifNull": ["$excel_data.totalAmountAfterTax", 0]}},
                    "kgSold": {"$sum": {"$ifNull": ["$totalKg", 0]}},
                    "orderRefs": {"$addToSet": "$orderRef"},
                }
            },
        ]
        rows = await db.sales_order_lines.aggregate(pipeline).to_list(100)
        revenue_by_farm: Dict[str, Dict[str, Any]] = {}
        for row in rows:
            revenue_by_farm[row["_id"]] = {
                "revenue": _safe_round(row["revenue"]),
                "kgSold": _safe_round(row["kgSold"]),
                "orderCount": len(row.get("orderRefs", [])),
            }

        # Total revenue for COGS allocation ratio
        total_revenue = sum(v["revenue"] for v in revenue_by_farm.values()) or 1.0

        # Total farm COGS (all purchase_register items without mappedCropName that are farm overhead)
        pr_match: Dict[str, Any] = {}
        if start_date or end_date:
            pr_match.update(_build_date_match(start_date, end_date, "date"))

        pr_pipeline = [
            {"$match": pr_match},
            {"$unwind": "$items"},
            {
                "$match": {
                    "items.mappedCropName": None,
                }
            },
            {
                "$group": {"_id": None, "totalFarmCogs": {"$sum": "$items.amount"}}
            },
        ]
        pr_result = await db.purchase_register.aggregate(pr_pipeline).to_list(1)
        total_farm_cogs = float((pr_result[0]["totalFarmCogs"] if pr_result else 0.0))

        buckets: List[Dict[str, Any]] = []
        for farm_id, farm_name in farm_map.items():
            data = revenue_by_farm.get(farm_id, {"revenue": 0.0, "kgSold": 0.0, "orderCount": 0})
            revenue = data["revenue"]
            # Allocate farm COGS proportionally by revenue share
            farm_share = revenue / total_revenue if revenue > 0 else 0.0
            cogs = _safe_round(total_farm_cogs * farm_share)
            gross = _safe_round(revenue - cogs)
            margin = _margin(gross, revenue)
            buckets.append({
                "farmId": farm_id,
                "farmName": farm_name,
                "revenue": revenue,
                "cogs": cogs,
                "grossProfit": gross,
                "marginPercent": margin,
                "kgSold": data["kgSold"],
                "orderCount": data["orderCount"],
            })

        # Sort by revenue descending
        buckets.sort(key=lambda x: x["revenue"], reverse=True)
        return buckets

    async def get_by_crop(
        self,
        farm_id: Optional[str] = None,
        farming_year: Optional[int] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        include_imputed: bool = True,
        price_source_filter: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Aggregate top 20 crops by revenue."""
        db = self._get_db()

        match: Dict[str, Any] = {}
        if farm_id:
            match["farmId"] = farm_id
        if farming_year:
            match["farmingYear"] = farming_year
        if start_date or end_date:
            match.update(_build_date_match(start_date, end_date, "createdAt"))
        if price_source_filter:
            match["metadata.priceSource"] = price_source_filter
        elif not include_imputed:
            match["metadata.priceSource"] = {"$in": ["excel_match", "excel_alias_match"]}

        pipeline = [
            {"$match": match},
            {
                "$group": {
                    "_id": "$cropName",
                    "revenue": {"$sum": {"$ifNull": ["$excel_data.totalAmountAfterTax", 0]}},
                    "kgSold": {"$sum": {"$ifNull": ["$totalKg", 0]}},
                }
            },
            {"$sort": {"revenue": -1}},
            {"$limit": 20},
        ]
        rows = await db.sales_order_lines.aggregate(pipeline).to_list(20)

        # Crop-level COGS from purchase_register items with mappedCropName
        pr_pipeline = [
            {"$unwind": "$items"},
            {"$match": {"items.mappedCropName": {"$ne": None}}},
            {
                "$group": {
                    "_id": "$items.mappedCropName",
                    "cogs": {"$sum": "$items.amount"},
                }
            },
        ]
        pr_rows = await db.purchase_register.aggregate(pr_pipeline).to_list(200)
        cogs_by_crop: Dict[str, float] = {r["_id"]: _safe_round(r["cogs"]) for r in pr_rows}

        buckets: List[Dict[str, Any]] = []
        for row in rows:
            crop = row["_id"] or "Unknown"
            revenue = _safe_round(row["revenue"])
            kg = _safe_round(row["kgSold"])
            cogs = cogs_by_crop.get(crop, 0.0)
            gross = _safe_round(revenue - cogs)
            avg_price = _safe_round(revenue / kg) if kg > 0 else 0.0
            buckets.append({
                "cropName": crop,
                "revenue": revenue,
                "cogs": cogs,
                "grossProfit": gross,
                "kgSold": kg,
                "avgPricePerKg": avg_price,
            })

        return buckets

    async def get_ar_aging(
        self,
        farm_id: Optional[str] = None,
        farming_year: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Customer AR aging buckets.

        Uses orderDate as the invoice date.
        Aging is calculated from today (UTC).
        Only orders with unpaid/partial status and outstanding > 0 are included.
        """
        db = self._get_db()
        today = datetime.now(timezone.utc).replace(tzinfo=None)

        match: Dict[str, Any] = {
            "paymentStatus": {"$in": ["pending", "partial"]},
        }
        if farm_id:
            match["farmId"] = farm_id
        if farming_year:
            match["farmingYear"] = farming_year

        pipeline = [
            {"$match": match},
            {
                "$project": {
                    "customerId": 1,
                    "customerName": 1,
                    "orderDate": 1,
                    "total": 1,
                    "paidAmount": {"$ifNull": ["$paidAmount", 0]},
                    "outstanding": {
                        "$max": [
                            0,
                            {
                                "$subtract": [
                                    {"$ifNull": ["$total", 0]},
                                    {"$ifNull": ["$paidAmount", 0]},
                                ]
                            },
                        ]
                    },
                    "ageDays": {
                        "$dateDiff": {
                            "startDate": "$orderDate",
                            "endDate": today,
                            "unit": "day",
                        }
                    },
                }
            },
            {"$match": {"outstanding": {"$gt": 0}}},
        ]
        orders = await db.sales_orders.aggregate(pipeline).to_list(10000)

        current = {"count": 0, "amount": 0.0}
        aging_30_60 = {"count": 0, "amount": 0.0}
        aging_60_90 = {"count": 0, "amount": 0.0}
        over_90 = {"count": 0, "amount": 0.0}

        # Per-customer aggregation
        customer_map: Dict[str, Dict[str, Any]] = {}

        for order in orders:
            age = int(order.get("ageDays") or 0)
            outstanding = _safe_round(float(order.get("outstanding") or 0.0))
            cid = str(order.get("customerId", "unknown"))
            cname = str(order.get("customerName", "Unknown"))

            if age <= 30:
                current["count"] += 1
                current["amount"] += outstanding
                overdue_amount = 0.0
            elif age <= 60:
                aging_30_60["count"] += 1
                aging_30_60["amount"] += outstanding
                overdue_amount = outstanding
            elif age <= 90:
                aging_60_90["count"] += 1
                aging_60_90["amount"] += outstanding
                overdue_amount = outstanding
            else:
                over_90["count"] += 1
                over_90["amount"] += outstanding
                overdue_amount = outstanding

            if cid not in customer_map:
                customer_map[cid] = {
                    "customerId": cid,
                    "customerName": cname,
                    "outstanding": 0.0,
                    "overdue": 0.0,
                    "orderCount": 0,
                }
            customer_map[cid]["outstanding"] += outstanding
            customer_map[cid]["overdue"] += overdue_amount
            customer_map[cid]["orderCount"] += 1

        total_outstanding = _safe_round(
            current["amount"]
            + aging_30_60["amount"]
            + aging_60_90["amount"]
            + over_90["amount"]
        )

        # Top 10 customers by outstanding
        top_customers = sorted(
            customer_map.values(),
            key=lambda x: x["outstanding"],
            reverse=True,
        )[:10]

        for tc in top_customers:
            tc["outstanding"] = _safe_round(tc["outstanding"])
            tc["overdue"] = _safe_round(tc["overdue"])

        return {
            "current": {"count": current["count"], "amount": _safe_round(current["amount"])},
            "aging_30_60": {"count": aging_30_60["count"], "amount": _safe_round(aging_30_60["amount"])},
            "aging_60_90": {"count": aging_60_90["count"], "amount": _safe_round(aging_60_90["amount"])},
            "over_90": {"count": over_90["count"], "amount": _safe_round(over_90["amount"])},
            "total_outstanding": total_outstanding,
            "byCustomer": top_customers,
        }

    async def get_revenue_sources(
        self,
        farm_id: Optional[str] = None,
        farming_year: Optional[int] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
    ) -> Dict[str, Any]:
        """Breakdown by price-source confidence level."""
        db = self._get_db()

        match: Dict[str, Any] = {}
        if farm_id:
            match["farmId"] = farm_id
        if farming_year:
            match["farmingYear"] = farming_year
        if start_date or end_date:
            match.update(_build_date_match(start_date, end_date, "createdAt"))

        pipeline = [
            {"$match": match},
            {
                "$group": {
                    "_id": {"$ifNull": ["$metadata.priceSource", "no_data"]},
                    "lineCount": {"$sum": 1},
                    "revenue": {"$sum": {"$ifNull": ["$excel_data.totalAmountAfterTax", 0]}},
                    "orderRefs": {"$addToSet": "$orderRef"},
                }
            },
        ]
        rows = await db.sales_order_lines.aggregate(pipeline).to_list(20)

        result: Dict[str, Dict[str, Any]] = {
            "excel_match": {"lineCount": 0, "revenue": 0.0, "orderCount": 0},
            "excel_alias_match": {"lineCount": 0, "revenue": 0.0, "orderCount": 0},
            "imputed_customer_crop_avg": {"lineCount": 0, "revenue": 0.0, "orderCount": 0},
            "no_data": {"lineCount": 0, "revenue": 0.0, "orderCount": 0},
        }

        for row in rows:
            key = row["_id"] or "no_data"
            entry = result.get(key)
            if entry is None:
                # Unknown source — add it
                result[key] = {"lineCount": 0, "revenue": 0.0, "orderCount": 0}
                entry = result[key]
            entry["lineCount"] += int(row["lineCount"])
            entry["revenue"] = _safe_round(entry["revenue"] + row["revenue"])
            entry["orderCount"] += len(row.get("orderRefs", []))

        return result
