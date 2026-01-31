"""
CRM Data Migration Script

Migrates legacy CRM data from OldData/220126 SQL dumps to MongoDB:
- Phase 1: Create Lettuce - Gem plant_data entry
- Phase 2: Customers (19) → CRM customers collection
- Phase 3: Orders (3,579) + Items (7,717) → Sales orders collection
- Phase 4: Crop prices (4,982) → Historical pricing collection

Usage:
    python scripts/migrations/crm/migrate_crm_data.py [--phase N] [--dry-run]
"""

import asyncio
import re
import sys
import os
from datetime import datetime
from uuid import UUID, uuid4
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import argparse
import logging

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))

from motor.motor_asyncio import AsyncIOMotorClient

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# MongoDB connection
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "a64core_db")

# Data paths
OLD_DATA_PATH = Path(__file__).parent.parent.parent.parent / "OldData" / "220126"

# Crop name mapping (legacy → current plant_data name)
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
    "Drumstick": "Drumstick",  # Will be created if doesn't exist
}

# Order status mapping
ORDER_STATUS_MAPPING = {
    "Pending": "draft",
    "In Progress": "processing",
    "Completed": "delivered",
    "Cancelled": "cancelled",
    "Shipped": "shipped",
}


class CRMMigration:
    def __init__(self, dry_run: bool = False):
        self.dry_run = dry_run
        self.client = None
        self.db = None
        self.plant_cache: Dict[str, str] = {}  # plantName → plantDataId
        self.customer_cache: Dict[str, str] = {}  # clientName → customerId
        self.stats = {
            "plant_created": 0,
            "customers_migrated": 0,
            "orders_migrated": 0,
            "order_items_migrated": 0,
            "prices_migrated": 0,
            "errors": [],
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

    def parse_sql_values(self, sql_content: str) -> List[Tuple]:
        """Parse SQL INSERT VALUES into tuples"""
        # Find all value tuples
        pattern = r"\(([^)]+)\)"
        matches = re.findall(pattern, sql_content)

        results = []
        for match in matches:
            # Parse individual values (handling quoted strings and nulls)
            values = []
            current = ""
            in_quote = False

            for char in match:
                if char == "'" and not in_quote:
                    in_quote = True
                elif char == "'" and in_quote:
                    in_quote = False
                elif char == "," and not in_quote:
                    val = current.strip()
                    if val == "null" or val == "NULL":
                        values.append(None)
                    elif val.startswith("'") and val.endswith("'"):
                        values.append(val[1:-1])
                    else:
                        values.append(val)
                    current = ""
                    continue
                current += char

            # Don't forget the last value
            if current:
                val = current.strip()
                if val == "null" or val == "NULL":
                    values.append(None)
                elif val.startswith("'") and val.endswith("'"):
                    values.append(val[1:-1])
                else:
                    values.append(val)

            if values:
                results.append(tuple(values))

        return results

    async def load_plant_cache(self):
        """Load existing plant_data into cache"""
        cursor = self.db.plant_data.find({}, {"plantName": 1, "plantDataId": 1})
        async for doc in cursor:
            self.plant_cache[doc["plantName"]] = doc["plantDataId"]
        logger.info(f"Loaded {len(self.plant_cache)} plants into cache")

    async def load_customer_cache(self):
        """Load existing customers into cache"""
        cursor = self.db.customers.find({}, {"name": 1, "customerId": 1})
        async for doc in cursor:
            self.customer_cache[doc["name"]] = doc["customerId"]
        logger.info(f"Loaded {len(self.customer_cache)} customers into cache")

    def get_plant_id(self, crop_name: str) -> Optional[str]:
        """Get plantDataId for a crop name (with mapping)"""
        mapped_name = CROP_NAME_MAPPING.get(crop_name, crop_name)
        return self.plant_cache.get(mapped_name)

    def get_customer_id(self, client_name: str) -> Optional[str]:
        """Get customerId for a client name"""
        # Try exact match first
        if client_name in self.customer_cache:
            return self.customer_cache[client_name]

        # Try normalized matching (for variations like "NRTC Company" vs "N.R.T.C...")
        normalized = client_name.upper().replace(".", "").replace(" ", "")
        for name, cid in self.customer_cache.items():
            if name.upper().replace(".", "").replace(" ", "") == normalized:
                return cid

        return None

    # =========================================================================
    # PHASE 1: Create Lettuce - Gem
    # =========================================================================
    async def phase1_create_lettuce_gem(self):
        """Create Lettuce - Gem plant_data entry"""
        logger.info("=" * 60)
        logger.info("PHASE 1: Creating Lettuce - Gem plant_data entry")
        logger.info("=" * 60)

        # Check if already exists
        existing = await self.db.plant_data.find_one({"plantName": "Lettuce - Gem"})
        if existing:
            logger.info("Lettuce - Gem already exists, skipping")
            self.plant_cache["Lettuce - Gem"] = existing["plantDataId"]
            return

        # Get admin user for createdBy
        admin = await self.db.users.find_one({"email": "admin@a64platform.com"})
        admin_id = admin["userId"] if admin else "bff26b8f-5ce9-49b2-9126-86174eaea823"

        plant_data = {
            "plantDataId": str(uuid4()),
            "plantName": "Lettuce - Gem",
            "scientificName": "Lactuca sativa var. longifolia",
            "plantType": "Crop",
            "growthCycleDays": 60,
            "minTemperatureCelsius": None,
            "maxTemperatureCelsius": None,
            "optimalPHMin": None,
            "optimalPHMax": None,
            "wateringFrequencyDays": None,
            "sunlightHoursDaily": None,
            "expectedYieldPerPlant": 0.25,
            "yieldUnit": "kg",
            "spacingCategory": None,
            "notes": "Gem lettuce (Little Gem), compact romaine-type lettuce. Migrated from legacy Hydroponics Gem.",
            "tags": ["lettuce", "hydroponics", "migrated"],
            "dataVersion": 1,
            "createdBy": admin_id,
            "createdByEmail": "admin@a64platform.com",
            "createdAt": datetime.utcnow(),
            "updatedAt": datetime.utcnow(),
            "contributor": {
                "name": "CRM Migration",
                "organization": "A64 Platform",
                "email": "admin@a64platform.com",
                "contributedAt": datetime.utcnow().strftime("%B %Y")
            }
        }

        if self.dry_run:
            logger.info(f"[DRY RUN] Would create: Lettuce - Gem")
        else:
            await self.db.plant_data.insert_one(plant_data)
            self.plant_cache["Lettuce - Gem"] = plant_data["plantDataId"]
            self.stats["plant_created"] += 1
            logger.info(f"Created Lettuce - Gem with ID: {plant_data['plantDataId']}")

    # =========================================================================
    # PHASE 2: Migrate Customers
    # =========================================================================
    async def phase2_migrate_customers(self):
        """Migrate customers from client_details_rows.sql"""
        logger.info("=" * 60)
        logger.info("PHASE 2: Migrating Customers")
        logger.info("=" * 60)

        sql_file = OLD_DATA_PATH / "client_details_rows.sql"
        if not sql_file.exists():
            logger.error(f"SQL file not found: {sql_file}")
            return

        with open(sql_file, 'r') as f:
            content = f.read()

        # Parse: __id__, clientname, ref
        pattern = r"\(([^,]+), '([^']+)', '([^']+)'\)"
        matches = re.findall(pattern, content)

        logger.info(f"Found {len(matches)} customers to migrate")

        # Get admin user
        admin = await self.db.users.find_one({"email": "admin@a64platform.com"})
        admin_id = admin["userId"] if admin else "bff26b8f-5ce9-49b2-9126-86174eaea823"

        for i, match in enumerate(matches, 1):
            _, client_name, ref_uuid = match

            # Check if already exists
            existing = await self.db.customers.find_one({
                "$or": [
                    {"customerId": ref_uuid},
                    {"name": client_name}
                ]
            })

            if existing:
                self.customer_cache[client_name] = existing["customerId"]
                logger.debug(f"Customer already exists: {client_name}")
                continue

            customer = {
                "customerId": ref_uuid,  # Preserve legacy UUID
                "customerCode": f"C{i:03d}",
                "name": client_name,
                "email": None,
                "phone": None,
                "company": client_name,
                "address": None,
                "type": "business",
                "status": "active",
                "notes": "Migrated from legacy CRM system",
                "tags": ["migrated", "legacy"],
                "createdBy": admin_id,
                "createdAt": datetime.utcnow(),
                "updatedAt": datetime.utcnow(),
            }

            if self.dry_run:
                logger.info(f"[DRY RUN] Would create customer: {client_name}")
            else:
                await self.db.customers.insert_one(customer)
                self.customer_cache[client_name] = ref_uuid
                self.stats["customers_migrated"] += 1
                logger.info(f"Migrated customer: {client_name} ({ref_uuid})")

    # =========================================================================
    # PHASE 3: Migrate Orders + Items
    # =========================================================================
    async def phase3_migrate_orders(self):
        """Migrate orders from orderlist_re_rows.sql and order_list_content_rows.sql"""
        logger.info("=" * 60)
        logger.info("PHASE 3: Migrating Orders and Order Items")
        logger.info("=" * 60)

        # Load order items first (grouped by order_list_ref)
        order_items = await self._load_order_items()
        logger.info(f"Loaded {sum(len(v) for v in order_items.values())} order items for {len(order_items)} orders")

        # Load and migrate orders
        orders_file = OLD_DATA_PATH / "orderlist_re_rows.sql"
        if not orders_file.exists():
            logger.error(f"SQL file not found: {orders_file}")
            return

        with open(orders_file, 'r') as f:
            content = f.read()

        # Parse order fields
        # Structure: __id__, DateFinished, DatePacked, RNumber, Reciever, Signature, StartDate,
        #           assigned.__ref__, note, order_driver, status, vehicle_id, client_id, farm_id,
        #           packager_email, ref, viewing_year
        pattern = r"\(([^,]*), ([^,]*), '([^']*)', ([^,]*), ([^,]*), ([^,]*), '([^']*)', ([^,]*), '([^']*)', '([^']*)', '([^']*)', '([^']*)', '([^']*)', '([^']*)', '([^']*)', '([^']+)', ([^)]*)\)"

        matches = re.findall(pattern, content)
        logger.info(f"Found {len(matches)} orders to migrate")

        # Get admin user
        admin = await self.db.users.find_one({"email": "admin@a64platform.com"})
        admin_id = admin["userId"] if admin else "bff26b8f-5ce9-49b2-9126-86174eaea823"

        migrated = 0
        for i, match in enumerate(matches):
            try:
                (_, _, date_packed, _, _, _, start_date, _, note, driver,
                 status, vehicle, client_name, farm, packager, ref_uuid, year) = match

                # Skip if already exists
                existing = await self.db.sales_orders.find_one({"orderId": ref_uuid})
                if existing:
                    continue

                # Get customer ID
                customer_id = self.get_customer_id(client_name)
                if not customer_id:
                    # Create placeholder customer
                    customer_id = str(uuid4())
                    if not self.dry_run:
                        await self.db.customers.insert_one({
                            "customerId": customer_id,
                            "customerCode": f"C{len(self.customer_cache) + 100:03d}",
                            "name": client_name,
                            "type": "business",
                            "status": "active",
                            "tags": ["auto-created", "migrated"],
                            "createdBy": admin_id,
                            "createdAt": datetime.utcnow(),
                            "updatedAt": datetime.utcnow(),
                        })
                        self.customer_cache[client_name] = customer_id

                # Parse date
                order_date = self._parse_date(date_packed or start_date)

                # Get items for this order
                items = order_items.get(ref_uuid, [])

                # Calculate totals
                subtotal = sum(item.get("totalPrice", 0) or 0 for item in items)
                total = subtotal  # No tax/discount in legacy data

                order = {
                    "orderId": ref_uuid,
                    "orderCode": f"SO{i + 1:05d}",
                    "customerId": customer_id,
                    "customerName": client_name,
                    "status": ORDER_STATUS_MAPPING.get(status, "draft"),
                    "orderDate": order_date,
                    "items": items,
                    "subtotal": subtotal,
                    "tax": 0,
                    "discount": 0,
                    "total": total,
                    "paymentStatus": "pending",
                    "shippingAddress": None,
                    "notes": f"Farm: {farm}. Driver: {driver}. {note}".strip(),
                    "createdBy": admin_id,
                    "createdAt": datetime.utcnow(),
                    "updatedAt": datetime.utcnow(),
                    "metadata": {
                        "migratedAt": datetime.utcnow().isoformat(),
                        "legacyFarm": farm,
                        "legacyDriver": driver,
                        "legacyVehicle": vehicle,
                        "legacyPackager": packager,
                        "legacyYear": year.strip("'") if year else None,
                    }
                }

                if self.dry_run:
                    if migrated < 5:  # Only log first 5 in dry run
                        logger.info(f"[DRY RUN] Would create order: {ref_uuid} for {client_name}")
                else:
                    await self.db.sales_orders.insert_one(order)
                    self.stats["orders_migrated"] += 1
                    self.stats["order_items_migrated"] += len(items)

                migrated += 1
                if migrated % 500 == 0:
                    logger.info(f"Progress: {migrated} orders migrated")

            except Exception as e:
                self.stats["errors"].append(f"Order {i}: {str(e)}")
                logger.error(f"Error migrating order {i}: {e}")

        logger.info(f"Migrated {migrated} orders")

    async def _load_order_items(self) -> Dict[str, List[dict]]:
        """Load order items grouped by order_list_ref"""
        items_file = OLD_DATA_PATH / "order_list_content_rows.sql"
        if not items_file.exists():
            return {}

        with open(items_file, 'r') as f:
            content = f.read()

        # Structure: Grade, packagesize, packagetype, quantity, created_time, updated_time,
        #           order_list_ref, crop_id, ref, farm_id, totalkg, client_id, total_price, avg_price
        pattern = r"\('([^']*)', '([^']*)', '([^']*)', '([^']*)', '([^']*)', '([^']*)', '([^']+)', '([^']+)', '([^']+)', '([^']*)', '([^']*)', '([^']*)', ([^,]*), ([^)]*)\)"

        matches = re.findall(pattern, content)

        items_by_order: Dict[str, List[dict]] = {}

        for match in matches:
            (grade, pkg_size, pkg_type, quantity, created, updated,
             order_ref, crop_name, item_ref, farm, total_kg, client, total_price, avg_price) = match

            # Get plant ID
            plant_id = self.get_plant_id(crop_name)
            mapped_name = CROP_NAME_MAPPING.get(crop_name, crop_name)

            # Parse prices (might be null)
            try:
                unit_price = float(avg_price.strip("'")) if avg_price and avg_price != "null" else 0
            except:
                unit_price = 0

            try:
                item_total = float(total_price.strip("'")) if total_price and total_price != "null" else 0
            except:
                item_total = 0

            try:
                qty = float(total_kg) if total_kg else float(quantity) if quantity else 0
            except:
                qty = 0

            item = {
                "productId": plant_id or str(uuid4()),
                "productName": mapped_name,
                "quantity": qty,
                "unitPrice": unit_price,
                "totalPrice": item_total,
                "metadata": {
                    "legacyCropName": crop_name,
                    "grade": grade,
                    "packageSize": pkg_size,
                    "packageType": pkg_type,
                    "farm": farm,
                }
            }

            if order_ref not in items_by_order:
                items_by_order[order_ref] = []
            items_by_order[order_ref].append(item)

        return items_by_order

    # =========================================================================
    # PHASE 4: Migrate Historical Pricing
    # =========================================================================
    async def phase4_migrate_pricing(self):
        """Migrate crop prices to historical pricing collection"""
        logger.info("=" * 60)
        logger.info("PHASE 4: Migrating Historical Pricing Data")
        logger.info("=" * 60)

        prices_file = OLD_DATA_PATH / "crop_price_rows.sql"
        if not prices_file.exists():
            logger.error(f"SQL file not found: {prices_file}")
            return

        with open(prices_file, 'r') as f:
            content = f.read()

        # Structure: date, customer, crop, grade, quantity, price_unit, price_total, ref, farm
        pattern = r"\('([^']*)', '([^']*)', '([^']*)', '([^']*)', '([^']*)', '([^']*)', '([^']*)', '([^']+)', ([^)]*)\)"

        matches = re.findall(pattern, content)
        logger.info(f"Found {len(matches)} price records to migrate")

        # Get admin user
        admin = await self.db.users.find_one({"email": "admin@a64platform.com"})
        admin_id = admin["userId"] if admin else "bff26b8f-5ce9-49b2-9126-86174eaea823"

        # Create index for efficient queries
        if not self.dry_run:
            await self.db.sales_pricing_history.create_index([
                ("plantDataId", 1),
                ("saleDate", -1)
            ])
            await self.db.sales_pricing_history.create_index([
                ("customerId", 1),
                ("saleDate", -1)
            ])

        migrated = 0
        batch = []

        for match in matches:
            try:
                (date_str, customer, crop, grade, quantity, price_unit,
                 price_total, ref_uuid, farm) = match

                # Get plant ID
                plant_id = self.get_plant_id(crop)
                mapped_name = CROP_NAME_MAPPING.get(crop, crop)

                # Get customer ID
                customer_id = self.get_customer_id(customer)

                # Parse values
                sale_date = self._parse_date(date_str)
                try:
                    qty = float(quantity) if quantity else 0
                except:
                    qty = 0
                try:
                    unit_price = float(price_unit) if price_unit else 0
                except:
                    unit_price = 0
                try:
                    total_price = float(price_total) if price_total else 0
                except:
                    total_price = 0

                price_record = {
                    "priceId": ref_uuid,
                    "plantDataId": plant_id,
                    "plantName": mapped_name,
                    "customerId": customer_id,
                    "customerName": customer,
                    "saleDate": sale_date,
                    "quantityKg": qty,
                    "unitPrice": unit_price,
                    "totalPrice": total_price,
                    "qualityGrade": grade,
                    "farm": farm.strip("'") if farm and farm != "null" else None,
                    "createdAt": datetime.utcnow(),
                    "metadata": {
                        "migratedAt": datetime.utcnow().isoformat(),
                        "legacyCropName": crop,
                    }
                }

                batch.append(price_record)

                if len(batch) >= 500:
                    if not self.dry_run:
                        await self.db.sales_pricing_history.insert_many(batch)
                        self.stats["prices_migrated"] += len(batch)
                    migrated += len(batch)
                    logger.info(f"Progress: {migrated} price records migrated")
                    batch = []

            except Exception as e:
                self.stats["errors"].append(f"Price record: {str(e)}")

        # Insert remaining batch
        if batch:
            if not self.dry_run:
                await self.db.sales_pricing_history.insert_many(batch)
                self.stats["prices_migrated"] += len(batch)
            migrated += len(batch)

        logger.info(f"Migrated {migrated} price records")

    def _parse_date(self, date_str: str) -> datetime:
        """Parse date string to datetime"""
        if not date_str:
            return datetime.utcnow()

        # Remove timezone info
        date_str = date_str.replace("+00", "").strip()

        formats = [
            "%Y-%m-%d %H:%M:%S",
            "%Y-%m-%d",
            "%Y/%m/%d",
        ]

        for fmt in formats:
            try:
                return datetime.strptime(date_str, fmt)
            except:
                continue

        return datetime.utcnow()

    async def run(self, phases: List[int] = None):
        """Run migration for specified phases"""
        try:
            await self.connect()
            await self.load_plant_cache()
            await self.load_customer_cache()

            all_phases = phases or [1, 2, 3, 4]

            if 1 in all_phases:
                await self.phase1_create_lettuce_gem()

            if 2 in all_phases:
                await self.phase2_migrate_customers()

            if 3 in all_phases:
                await self.phase3_migrate_orders()

            if 4 in all_phases:
                await self.phase4_migrate_pricing()

            # Print summary
            logger.info("=" * 60)
            logger.info("MIGRATION SUMMARY")
            logger.info("=" * 60)
            logger.info(f"Plants created:      {self.stats['plant_created']}")
            logger.info(f"Customers migrated:  {self.stats['customers_migrated']}")
            logger.info(f"Orders migrated:     {self.stats['orders_migrated']}")
            logger.info(f"Order items:         {self.stats['order_items_migrated']}")
            logger.info(f"Prices migrated:     {self.stats['prices_migrated']}")
            logger.info(f"Errors:              {len(self.stats['errors'])}")

            if self.stats['errors']:
                logger.warning("Errors encountered:")
                for err in self.stats['errors'][:10]:
                    logger.warning(f"  - {err}")

        finally:
            await self.close()


async def main():
    parser = argparse.ArgumentParser(description="CRM Data Migration")
    parser.add_argument("--phase", type=int, nargs="+", help="Run specific phases (1-4)")
    parser.add_argument("--dry-run", action="store_true", help="Dry run without writing")
    args = parser.parse_args()

    migration = CRMMigration(dry_run=args.dry_run)
    await migration.run(phases=args.phase)


if __name__ == "__main__":
    asyncio.run(main())
