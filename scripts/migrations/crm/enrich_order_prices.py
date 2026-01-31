"""
Enrich Sales Orders with Prices from Historical Pricing Data

Matches orders with crop_price data by:
- Customer name (normalized matching)
- Crop/Plant name (with mapping)
- Date (closest match within 30 days)

Usage:
    python scripts/migrations/crm/enrich_order_prices.py [--dry-run]
"""

import asyncio
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import argparse
import logging

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))

from motor.motor_asyncio import AsyncIOMotorClient
import os

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# MongoDB connection
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "a64core_db")

# Crop name mapping (same as migration script)
CROP_NAME_MAPPING = {
    "Hydroponics Bionda": "Lettuce - Lollo Bionda",
    "Hydroponics Boston": "Lettuce - Boston",
    "Hydroponics Frisee": "Lettuce - Frisee",
    "Hydroponics Rosso": "Lettuce - Lollo Rosso",
    "Hydroponics Oak Leafs": "Lettuce - Oakleaf Red",
    "Hydroponics Gem": "Lettuce - Gem",
    "Melon": "Rock Melon",
    "Radicchio": "Lettuce - Radicchio",
    "Tomato": "Tomato-Round-Table",
    "Lettuce - Oakleaf": "Lettuce - Oakleaf Red",
}

# Reverse mapping for lookups
REVERSE_CROP_MAPPING = {v: k for k, v in CROP_NAME_MAPPING.items()}


class OrderPriceEnricher:
    def __init__(self, dry_run: bool = False):
        self.dry_run = dry_run
        self.client = None
        self.db = None
        self.price_cache: Dict[str, List[dict]] = {}  # plantName -> list of price records
        self.stats = {
            "orders_processed": 0,
            "orders_updated": 0,
            "items_priced": 0,
            "items_no_match": 0,
            "total_revenue": 0.0,
        }

    async def connect(self):
        """Connect to MongoDB"""
        self.client = AsyncIOMotorClient(MONGO_URI)
        self.db = self.client[DB_NAME]
        logger.info(f"Connected to MongoDB: {MONGO_URI}/{DB_NAME}")

    async def close(self):
        """Close MongoDB connection"""
        if self.client:
            self.client.close()

    async def build_price_cache(self):
        """Build cache of prices grouped by plant name"""
        logger.info("Building price cache from sales_pricing_history...")

        cursor = self.db.sales_pricing_history.find({
            "unitPrice": {"$gt": 0}
        }).sort("saleDate", -1)

        count = 0
        async for doc in cursor:
            plant_name = doc.get("plantName", "")
            if plant_name not in self.price_cache:
                self.price_cache[plant_name] = []

            self.price_cache[plant_name].append({
                "customerName": doc.get("customerName", ""),
                "saleDate": doc.get("saleDate"),
                "unitPrice": doc.get("unitPrice", 0),
                "qualityGrade": doc.get("qualityGrade", ""),
            })
            count += 1

        logger.info(f"Cached {count} price records for {len(self.price_cache)} crops")

    def normalize_customer_name(self, name: str) -> str:
        """Normalize customer name for matching"""
        if not name:
            return ""
        # Remove common suffixes and normalize
        normalized = name.upper()
        for suffix in [" LLC", " L.L.C", " L.L.C.", " CO", " COMPANY", " TRADING", " (LLC)"]:
            normalized = normalized.replace(suffix, "")
        # Remove punctuation and extra spaces
        normalized = "".join(c for c in normalized if c.isalnum() or c == " ")
        normalized = " ".join(normalized.split())
        return normalized

    def find_best_price(
        self,
        plant_name: str,
        customer_name: str,
        order_date: datetime,
        grade: str = None
    ) -> Optional[float]:
        """Find best matching price for an item"""

        # Try direct plant name first
        prices = self.price_cache.get(plant_name, [])

        # If no direct match, try reverse mapping (legacy name)
        if not prices and plant_name in REVERSE_CROP_MAPPING:
            legacy_name = REVERSE_CROP_MAPPING[plant_name]
            prices = self.price_cache.get(legacy_name, [])

        # Also try mapped name
        if not prices and plant_name in CROP_NAME_MAPPING:
            mapped_name = CROP_NAME_MAPPING[plant_name]
            prices = self.price_cache.get(mapped_name, [])

        if not prices:
            return None

        normalized_customer = self.normalize_customer_name(customer_name)

        # Score and sort candidates
        candidates = []
        for price in prices:
            score = 0

            # Customer match (highest priority)
            price_customer = self.normalize_customer_name(price.get("customerName", ""))
            if normalized_customer and price_customer:
                if normalized_customer == price_customer:
                    score += 100
                elif normalized_customer in price_customer or price_customer in normalized_customer:
                    score += 50

            # Grade match
            if grade and price.get("qualityGrade") == grade:
                score += 20

            # Date proximity (within 30 days)
            price_date = price.get("saleDate")
            if price_date and order_date:
                if isinstance(price_date, str):
                    try:
                        price_date = datetime.fromisoformat(price_date.replace("Z", "+00:00"))
                    except:
                        price_date = None

                if price_date:
                    # Remove timezone info for comparison
                    if hasattr(price_date, 'replace'):
                        price_date = price_date.replace(tzinfo=None)
                    if hasattr(order_date, 'replace'):
                        order_date_naive = order_date.replace(tzinfo=None)
                    else:
                        order_date_naive = order_date

                    days_diff = abs((price_date - order_date_naive).days)
                    if days_diff <= 7:
                        score += 30
                    elif days_diff <= 30:
                        score += 15
                    elif days_diff <= 90:
                        score += 5

            candidates.append((score, price.get("unitPrice", 0)))

        # Sort by score descending, then by price (prefer non-zero)
        candidates.sort(key=lambda x: (-x[0], -x[1]))

        if candidates and candidates[0][1] > 0:
            return candidates[0][1]

        # Fallback: return average price for this crop
        avg_price = sum(p.get("unitPrice", 0) for p in prices) / len(prices) if prices else 0
        return avg_price if avg_price > 0 else None

    async def enrich_orders(self):
        """Enrich all orders with prices"""
        logger.info("=" * 60)
        logger.info("Enriching orders with prices...")
        logger.info("=" * 60)

        # Process orders in batches
        batch_size = 100
        skip = 0

        while True:
            orders = await self.db.sales_orders.find({}).skip(skip).limit(batch_size).to_list(length=batch_size)

            if not orders:
                break

            for order in orders:
                self.stats["orders_processed"] += 1
                order_updated = False
                order_total = 0

                order_date = order.get("orderDate")
                customer_name = order.get("customerName", "")
                items = order.get("items", [])

                for item in items:
                    plant_name = item.get("productName", "")
                    quantity = item.get("quantity", 0)
                    grade = item.get("metadata", {}).get("grade")

                    # Find best price
                    unit_price = self.find_best_price(plant_name, customer_name, order_date, grade)

                    if unit_price and unit_price > 0:
                        item["unitPrice"] = round(unit_price, 2)
                        item["totalPrice"] = round(unit_price * quantity, 2)
                        order_total += item["totalPrice"]
                        self.stats["items_priced"] += 1
                        order_updated = True
                    else:
                        self.stats["items_no_match"] += 1

                if order_updated:
                    order["subtotal"] = round(order_total, 2)
                    order["total"] = round(order_total, 2)
                    self.stats["total_revenue"] += order_total

                    if not self.dry_run:
                        await self.db.sales_orders.update_one(
                            {"_id": order["_id"]},
                            {"$set": {
                                "items": items,
                                "subtotal": order["subtotal"],
                                "total": order["total"],
                            }}
                        )

                    self.stats["orders_updated"] += 1

            skip += batch_size
            if skip % 500 == 0:
                logger.info(f"Progress: {skip} orders processed, {self.stats['orders_updated']} updated")

        logger.info(f"Completed: {self.stats['orders_processed']} orders processed")

    async def run(self):
        """Run the enrichment"""
        try:
            await self.connect()
            await self.build_price_cache()
            await self.enrich_orders()

            # Print summary
            logger.info("=" * 60)
            logger.info("ENRICHMENT SUMMARY")
            logger.info("=" * 60)
            logger.info(f"Orders processed:    {self.stats['orders_processed']}")
            logger.info(f"Orders updated:      {self.stats['orders_updated']}")
            logger.info(f"Items priced:        {self.stats['items_priced']}")
            logger.info(f"Items no match:      {self.stats['items_no_match']}")
            logger.info(f"Total revenue:       ${self.stats['total_revenue']:,.2f}")

            if self.stats['items_priced'] + self.stats['items_no_match'] > 0:
                match_rate = self.stats['items_priced'] / (self.stats['items_priced'] + self.stats['items_no_match']) * 100
                logger.info(f"Match rate:          {match_rate:.1f}%")

        finally:
            await self.close()


async def main():
    parser = argparse.ArgumentParser(description="Enrich Sales Orders with Prices")
    parser.add_argument("--dry-run", action="store_true", help="Dry run without writing")
    args = parser.parse_args()

    enricher = OrderPriceEnricher(dry_run=args.dry_run)
    await enricher.run()


if __name__ == "__main__":
    asyncio.run(main())
