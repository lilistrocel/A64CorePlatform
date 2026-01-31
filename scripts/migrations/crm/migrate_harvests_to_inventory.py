"""
Migrate Block Harvests to Harvest Inventory

Creates harvest inventory records from block_harvests data.
This links farm harvests to the sales inventory system.

Usage:
    python scripts/migrations/crm/migrate_harvests_to_inventory.py [--dry-run]
"""

import asyncio
import sys
from datetime import datetime, timedelta
from pathlib import Path
from uuid import uuid4
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

# Category mapping based on crop names
CROP_CATEGORY_MAP = {
    # Leafy Greens / Hydroponics
    "hydroponics": "Leafy Greens",
    "lettuce": "Leafy Greens",
    "lollo": "Leafy Greens",
    "frisee": "Leafy Greens",
    "boston": "Leafy Greens",
    "oakleaf": "Leafy Greens",
    "radicchio": "Leafy Greens",
    "gem": "Leafy Greens",
    "bionda": "Leafy Greens",
    "rosso": "Leafy Greens",
    "celery": "Leafy Greens",
    "fennel": "Leafy Greens",

    # Brassicas
    "cabbage": "Brassicas",
    "cauliflower": "Brassicas",
    "broccoli": "Brassicas",

    # Cucurbits
    "cucumber": "Cucurbits",
    "melon": "Cucurbits",
    "honeydew": "Cucurbits",
    "rock melon": "Cucurbits",
    "watermelon": "Cucurbits",
    "butternut": "Cucurbits",
    "zucchini": "Cucurbits",
    "squash": "Cucurbits",
    "gourd": "Cucurbits",
    "marrow": "Cucurbits",
    "pumpkin": "Cucurbits",

    # Solanaceae (Nightshades)
    "tomato": "Solanaceae",
    "eggplant": "Solanaceae",
    "capsicum": "Solanaceae",
    "pepper": "Solanaceae",
    "chili": "Solanaceae",

    # Legumes
    "beans": "Legumes",
    "peas": "Legumes",

    # Root Vegetables
    "carrot": "Root Vegetables",
    "radish": "Root Vegetables",
    "beetroot": "Root Vegetables",
    "turnip": "Root Vegetables",

    # Alliums
    "onion": "Alliums",
    "leek": "Alliums",
    "garlic": "Alliums",
}


def get_category(crop_name: str) -> str:
    """Determine category based on crop name"""
    crop_lower = crop_name.lower()

    for keyword, category in CROP_CATEGORY_MAP.items():
        if keyword in crop_lower:
            return category

    return "Other Vegetables"


def map_quality_grade(grade: str) -> str:
    """Map quality grade to valid enum value"""
    if not grade:
        return "B"  # Default to B if not specified

    grade_upper = grade.upper().strip()
    if grade_upper in ["A", "B", "C"]:
        return grade_upper

    # Map variations
    if grade_upper in ["PREMIUM", "GRADE A", "1", "FIRST"]:
        return "A"
    elif grade_upper in ["STANDARD", "GRADE B", "2", "SECOND"]:
        return "B"
    else:
        return "C"


def calculate_expiry_date(harvest_date: datetime, crop_name: str) -> datetime:
    """Calculate expiry date based on crop type"""
    crop_lower = crop_name.lower()

    # Leafy greens expire quickly (7 days)
    if any(kw in crop_lower for kw in ["hydroponics", "lettuce", "lollo", "frisee", "boston", "oakleaf", "gem", "celery"]):
        return harvest_date + timedelta(days=7)

    # Medium shelf life (14-21 days)
    if any(kw in crop_lower for kw in ["cucumber", "capsicum", "pepper", "beans", "tomato"]):
        return harvest_date + timedelta(days=14)

    # Longer shelf life (30+ days)
    if any(kw in crop_lower for kw in ["cabbage", "cauliflower", "melon", "butternut", "squash", "gourd", "pumpkin", "eggplant"]):
        return harvest_date + timedelta(days=30)

    # Default 14 days
    return harvest_date + timedelta(days=14)


class HarvestInventoryMigration:
    def __init__(self, dry_run: bool = False):
        self.dry_run = dry_run
        self.client = None
        self.db = None
        self.admin_id = None
        self.stats = {
            "harvests_processed": 0,
            "inventory_created": 0,
            "skipped_duplicates": 0,
            "errors": 0,
            "total_quantity_kg": 0,
        }
        self.existing_harvest_ids = set()

    async def connect(self):
        """Connect to MongoDB"""
        self.client = AsyncIOMotorClient(MONGO_URI)
        self.db = self.client[DB_NAME]
        logger.info(f"Connected to MongoDB: {MONGO_URI}/{DB_NAME}")

    async def close(self):
        """Close MongoDB connection"""
        if self.client:
            self.client.close()

    async def get_admin_user(self):
        """Get admin user ID for createdBy field"""
        user = await self.db.users.find_one({"role": "super_admin"})
        if user:
            self.admin_id = user.get("userId") or str(user.get("_id"))
            logger.info(f"Using admin user: {self.admin_id}")
        else:
            self.admin_id = str(uuid4())
            logger.warning(f"No admin user found, using generated ID: {self.admin_id}")

    async def load_existing_inventory(self):
        """Load existing inventory harvest IDs to avoid duplicates"""
        cursor = self.db.harvest_inventory.find({}, {"harvestId": 1})
        async for doc in cursor:
            if doc.get("harvestId"):
                self.existing_harvest_ids.add(doc["harvestId"])

        logger.info(f"Found {len(self.existing_harvest_ids)} existing inventory records")

    async def migrate_harvests(self):
        """Migrate block_harvests to harvest_inventory"""
        logger.info("=" * 60)
        logger.info("Migrating block_harvests to harvest_inventory...")
        logger.info("=" * 60)

        batch_size = 500
        batch = []

        cursor = self.db.block_harvests.find({}).sort("harvestDate", -1)

        async for harvest in cursor:
            self.stats["harvests_processed"] += 1

            harvest_id = harvest.get("harvestId")

            # Skip if already migrated
            if harvest_id in self.existing_harvest_ids:
                self.stats["skipped_duplicates"] += 1
                continue

            try:
                # Get harvest date
                harvest_date = harvest.get("harvestDate") or harvest.get("harvestTime")
                if isinstance(harvest_date, str):
                    harvest_date = datetime.fromisoformat(harvest_date.replace("Z", "+00:00"))

                if not harvest_date:
                    harvest_date = datetime.utcnow()

                # Get quantity
                quantity = harvest.get("quantityKg") or harvest.get("quantity") or 0
                if quantity <= 0:
                    continue

                crop_name = harvest.get("cropName", "Unknown")

                # Create inventory record
                inventory_doc = {
                    "inventoryId": str(uuid4()),
                    "harvestId": harvest_id,  # Link back to original harvest
                    "productName": crop_name,
                    "category": get_category(crop_name),
                    "farmId": harvest.get("farmId"),
                    "blockId": harvest.get("blockId") or harvest.get("physicalBlockId"),
                    "harvestDate": harvest_date,
                    "quantity": float(quantity),
                    "unit": "kg",
                    "quality": map_quality_grade(harvest.get("qualityGrade") or harvest.get("grade")),
                    "status": "available",
                    "expiryDate": calculate_expiry_date(harvest_date, crop_name),
                    "storageLocation": f"{harvest.get('farmName', 'Unknown Farm')} - Cold Storage",
                    "createdBy": harvest.get("recordedBy") or self.admin_id,
                    "createdAt": datetime.utcnow(),
                    "updatedAt": datetime.utcnow(),
                    "metadata": {
                        "sourceCollection": "block_harvests",
                        "originalHarvestId": harvest_id,
                        "farmName": harvest.get("farmName"),
                        "blockCode": harvest.get("physicalBlockCode") or harvest.get("blockCode") or harvest.get("legacyBlockCode"),
                        "migratedAt": datetime.utcnow(),
                    }
                }

                batch.append(inventory_doc)
                self.stats["total_quantity_kg"] += quantity

                # Insert batch
                if len(batch) >= batch_size:
                    if not self.dry_run:
                        await self.db.harvest_inventory.insert_many(batch)
                    self.stats["inventory_created"] += len(batch)
                    logger.info(f"Progress: {self.stats['harvests_processed']} harvests processed, {self.stats['inventory_created']} inventory created")
                    batch = []

            except Exception as e:
                logger.error(f"Error processing harvest {harvest_id}: {e}")
                self.stats["errors"] += 1

        # Insert remaining batch
        if batch:
            if not self.dry_run:
                await self.db.harvest_inventory.insert_many(batch)
            self.stats["inventory_created"] += len(batch)

        logger.info(f"Completed: {self.stats['harvests_processed']} harvests processed")

    async def create_indexes(self):
        """Create indexes for harvest_inventory collection"""
        if self.dry_run:
            return

        logger.info("Creating indexes...")

        await self.db.harvest_inventory.create_index("inventoryId", unique=True)
        await self.db.harvest_inventory.create_index("harvestId")
        await self.db.harvest_inventory.create_index("productName")
        await self.db.harvest_inventory.create_index("category")
        await self.db.harvest_inventory.create_index("farmId")
        await self.db.harvest_inventory.create_index("status")
        await self.db.harvest_inventory.create_index("harvestDate")
        await self.db.harvest_inventory.create_index("expiryDate")

        logger.info("Indexes created")

    async def run(self):
        """Run the migration"""
        try:
            await self.connect()
            await self.get_admin_user()
            await self.load_existing_inventory()
            await self.migrate_harvests()
            await self.create_indexes()

            # Print summary
            logger.info("=" * 60)
            logger.info("MIGRATION SUMMARY")
            logger.info("=" * 60)
            logger.info(f"Mode:                {'DRY RUN' if self.dry_run else 'LIVE'}")
            logger.info(f"Harvests processed:  {self.stats['harvests_processed']}")
            logger.info(f"Inventory created:   {self.stats['inventory_created']}")
            logger.info(f"Skipped duplicates:  {self.stats['skipped_duplicates']}")
            logger.info(f"Errors:              {self.stats['errors']}")
            logger.info(f"Total quantity:      {self.stats['total_quantity_kg']:,.2f} kg")

        finally:
            await self.close()


async def main():
    parser = argparse.ArgumentParser(description="Migrate Block Harvests to Harvest Inventory")
    parser.add_argument("--dry-run", action="store_true", help="Dry run without writing")
    args = parser.parse_args()

    migration = HarvestInventoryMigration(dry_run=args.dry_run)
    await migration.run()


if __name__ == "__main__":
    asyncio.run(main())
