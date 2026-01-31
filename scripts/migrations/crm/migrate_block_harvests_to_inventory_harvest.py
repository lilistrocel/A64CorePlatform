"""
Migrate Block Harvests to Inventory Harvest (Farm Manager)

Creates harvest inventory records from block_harvests data,
following the same aggregation logic as HarvestService._add_to_inventory().

Aggregation: Groups by farm + plant (crop) + quality grade + product type
This means multiple harvests from the same farm with the same crop and grade
will be consolidated into a single inventory item.

Usage:
    python scripts/migrations/crm/migrate_block_harvests_to_inventory_harvest.py [--dry-run]
"""

import asyncio
import sys
from datetime import datetime, timedelta
from pathlib import Path
from uuid import uuid4, UUID
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


def map_quality_grade(grade: str) -> str:
    """Map BlockHarvest quality grade to Inventory quality grade"""
    if not grade:
        return "grade_b"

    grade_upper = grade.upper().strip()

    # Direct mapping
    if grade_upper == "A":
        return "grade_a"
    elif grade_upper == "B":
        return "grade_b"
    elif grade_upper == "C":
        return "grade_c"

    # Extended mapping
    if grade_upper in ["PREMIUM", "GRADE A", "1", "FIRST", "GRADE_A"]:
        return "grade_a"
    elif grade_upper in ["STANDARD", "GRADE B", "2", "SECOND", "GRADE_B"]:
        return "grade_b"
    elif grade_upper in ["PROCESSING", "REJECTED"]:
        return "processing"

    return "grade_b"


def calculate_expiry_date(harvest_date: datetime, crop_name: str) -> datetime:
    """Calculate expiry date based on crop type"""
    crop_lower = (crop_name or "").lower()

    # Leafy greens expire quickly (7 days)
    if any(kw in crop_lower for kw in ["lettuce", "lollo", "frisee", "boston", "oakleaf", "gem", "celery", "hydro"]):
        return harvest_date + timedelta(days=7)

    # Medium shelf life (14 days)
    if any(kw in crop_lower for kw in ["cucumber", "capsicum", "pepper", "beans", "tomato"]):
        return harvest_date + timedelta(days=14)

    # Longer shelf life (30+ days)
    if any(kw in crop_lower for kw in ["cabbage", "cauliflower", "melon", "butternut", "squash", "gourd", "pumpkin", "eggplant"]):
        return harvest_date + timedelta(days=30)

    # Default 14 days
    return harvest_date + timedelta(days=14)


class BlockHarvestsToInventoryMigration:
    def __init__(self, dry_run: bool = False):
        self.dry_run = dry_run
        self.client = None
        self.db = None
        self.admin_id = None
        self.organization_id = None
        self.stats = {
            "harvests_processed": 0,
            "inventory_created": 0,
            "inventory_updated": 0,
            "skipped": 0,
            "errors": 0,
            "total_quantity_kg": 0,
        }
        # Track aggregated inventory by key: (farmId, cropName, qualityGrade, productType)
        self.aggregated_inventory = {}
        self.farm_cache = {}
        self.block_cache = {}

    async def connect(self):
        """Connect to MongoDB"""
        self.client = AsyncIOMotorClient(MONGO_URI)
        self.db = self.client[DB_NAME]
        logger.info(f"Connected to MongoDB: {MONGO_URI}/{DB_NAME}")

    async def close(self):
        """Close MongoDB connection"""
        if self.client:
            self.client.close()

    async def get_admin_and_org(self):
        """Get admin user ID and organization ID"""
        user = await self.db.users.find_one({"role": "super_admin"})
        if user:
            self.admin_id = user.get("userId") or str(user.get("_id"))
            self.organization_id = user.get("organizationId")
            logger.info(f"Using admin user: {self.admin_id}")
        else:
            self.admin_id = str(uuid4())
            logger.warning(f"No admin user found, using generated ID: {self.admin_id}")

        # Try to get organization from first farm if not set
        if not self.organization_id:
            farm = await self.db.farms.find_one({})
            if farm:
                self.organization_id = farm.get("organizationId") or str(uuid4())
            else:
                self.organization_id = str(uuid4())

        logger.info(f"Using organization ID: {self.organization_id}")

    async def load_farms(self):
        """Load all farms into cache"""
        cursor = self.db.farms.find({})
        async for farm in cursor:
            farm_id = farm.get("farmId") or str(farm.get("_id"))
            self.farm_cache[farm_id] = farm
        logger.info(f"Loaded {len(self.farm_cache)} farms into cache")

    async def load_blocks(self):
        """Load all blocks into cache"""
        cursor = self.db.blocks.find({})
        async for block in cursor:
            block_id = block.get("blockId") or str(block.get("_id"))
            self.block_cache[block_id] = block
        logger.info(f"Loaded {len(self.block_cache)} blocks into cache")

    async def clear_existing_inventory(self):
        """Clear existing inventory_harvest data (optional, for clean migration)"""
        if self.dry_run:
            logger.info("DRY RUN: Would clear inventory_harvest collection")
            return

        result = await self.db.inventory_harvest.delete_many({})
        logger.info(f"Cleared {result.deleted_count} existing inventory_harvest records")

    def get_aggregation_key(self, farm_id: str, crop_name: str, quality_grade: str, product_type: str) -> str:
        """Generate aggregation key for grouping harvests"""
        return f"{farm_id}|{crop_name}|{quality_grade}|{product_type}"

    async def process_harvests(self):
        """Process all block_harvests and aggregate into inventory"""
        logger.info("=" * 60)
        logger.info("Processing block_harvests...")
        logger.info("=" * 60)

        cursor = self.db.block_harvests.find({}).sort("harvestDate", 1)  # Process oldest first

        async for harvest in cursor:
            self.stats["harvests_processed"] += 1

            try:
                harvest_id = harvest.get("harvestId")
                farm_id = harvest.get("farmId")
                block_id = harvest.get("blockId") or harvest.get("physicalBlockId")

                # Get quantity
                quantity = harvest.get("quantityKg") or harvest.get("quantity") or 0
                if quantity <= 0:
                    self.stats["skipped"] += 1
                    continue

                # Get crop name from harvest or block
                crop_name = harvest.get("cropName") or harvest.get("targetCropName")
                if not crop_name and block_id:
                    block = self.block_cache.get(str(block_id))
                    if block:
                        crop_name = block.get("targetCropName") or block.get("cropName")

                if not crop_name:
                    crop_name = "Unknown Crop"

                # Get quality grade
                raw_grade = harvest.get("qualityGrade") or harvest.get("grade") or "B"
                quality_grade = map_quality_grade(raw_grade)
                product_type = "fresh"  # Default

                # Get harvest date
                harvest_date = harvest.get("harvestDate") or harvest.get("harvestTime")
                if isinstance(harvest_date, str):
                    try:
                        harvest_date = datetime.fromisoformat(harvest_date.replace("Z", "+00:00"))
                    except:
                        harvest_date = datetime.utcnow()
                elif not harvest_date:
                    harvest_date = datetime.utcnow()

                # Create aggregation key
                agg_key = self.get_aggregation_key(
                    str(farm_id) if farm_id else "unknown",
                    crop_name,
                    quality_grade,
                    product_type
                )

                # Aggregate into existing or create new
                if agg_key in self.aggregated_inventory:
                    # Update existing aggregation
                    self.aggregated_inventory[agg_key]["quantity"] += quantity
                    self.aggregated_inventory[agg_key]["availableQuantity"] += quantity
                    self.aggregated_inventory[agg_key]["harvest_ids"].append(harvest_id)

                    # Update harvest date if this one is more recent
                    if harvest_date > self.aggregated_inventory[agg_key]["harvestDate"]:
                        self.aggregated_inventory[agg_key]["harvestDate"] = harvest_date
                        self.aggregated_inventory[agg_key]["expiryDate"] = calculate_expiry_date(harvest_date, crop_name)
                else:
                    # Create new aggregation
                    block = self.block_cache.get(str(block_id)) if block_id else None
                    plant_data_id = None
                    if block:
                        plant_data_id = block.get("targetCrop") or block.get("plantDataId")

                    self.aggregated_inventory[agg_key] = {
                        "inventoryId": str(uuid4()),
                        "farmId": str(farm_id) if farm_id else None,
                        "organizationId": str(self.organization_id),
                        "blockId": str(block_id) if block_id else None,
                        "plantDataId": str(plant_data_id) if plant_data_id else str(block_id) if block_id else str(uuid4()),
                        "plantName": crop_name,
                        "productType": product_type,
                        "variety": None,
                        "quantity": quantity,
                        "unit": "kg",
                        "reservedQuantity": 0,
                        "availableQuantity": quantity,
                        "qualityGrade": quality_grade,
                        "harvestDate": harvest_date,
                        "expiryDate": calculate_expiry_date(harvest_date, crop_name),
                        "storageLocation": f"{harvest.get('farmName', 'Farm')} - Cold Storage",
                        "unitPrice": None,
                        "currency": "AED",
                        "notes": f"Migrated from {len([harvest_id])} block harvest(s)",
                        "inventoryScope": "farm" if farm_id else "organization",
                        "sourceHarvestId": harvest_id,  # Link to first harvest
                        "createdBy": str(self.admin_id),
                        "createdAt": datetime.utcnow(),
                        "updatedAt": datetime.utcnow(),
                        "harvest_ids": [harvest_id],  # Track all contributing harvests
                    }

                self.stats["total_quantity_kg"] += quantity

                if self.stats["harvests_processed"] % 1000 == 0:
                    logger.info(f"Progress: {self.stats['harvests_processed']} harvests processed, {len(self.aggregated_inventory)} unique inventory items")

            except Exception as e:
                logger.error(f"Error processing harvest {harvest.get('harvestId')}: {e}")
                self.stats["errors"] += 1

        logger.info(f"Completed processing: {self.stats['harvests_processed']} harvests -> {len(self.aggregated_inventory)} aggregated inventory items")

    async def insert_inventory(self):
        """Insert aggregated inventory into inventory_harvest collection"""
        logger.info("=" * 60)
        logger.info("Inserting aggregated inventory...")
        logger.info("=" * 60)

        batch = []
        batch_size = 500

        for agg_key, inv_data in self.aggregated_inventory.items():
            # Update notes with harvest count
            harvest_count = len(inv_data.get("harvest_ids", []))
            inv_data["notes"] = f"Migrated from {harvest_count} block harvest(s)"

            # Remove tracking field before insert
            inv_data.pop("harvest_ids", None)

            # Convert dates to ISO format for MongoDB
            if isinstance(inv_data.get("harvestDate"), datetime):
                inv_data["harvestDate"] = inv_data["harvestDate"].isoformat()
            if isinstance(inv_data.get("expiryDate"), datetime):
                inv_data["expiryDate"] = inv_data["expiryDate"].isoformat()
            if isinstance(inv_data.get("createdAt"), datetime):
                inv_data["createdAt"] = inv_data["createdAt"].isoformat()
            if isinstance(inv_data.get("updatedAt"), datetime):
                inv_data["updatedAt"] = inv_data["updatedAt"].isoformat()

            batch.append(inv_data)

            if len(batch) >= batch_size:
                if not self.dry_run:
                    await self.db.inventory_harvest.insert_many(batch)
                self.stats["inventory_created"] += len(batch)
                logger.info(f"Inserted batch: {self.stats['inventory_created']} inventory items created")
                batch = []

        # Insert remaining
        if batch:
            if not self.dry_run:
                await self.db.inventory_harvest.insert_many(batch)
            self.stats["inventory_created"] += len(batch)

        logger.info(f"Completed: {self.stats['inventory_created']} inventory items created")

    async def create_indexes(self):
        """Create indexes for inventory_harvest collection"""
        if self.dry_run:
            logger.info("DRY RUN: Would create indexes")
            return

        logger.info("Creating indexes...")

        await self.db.inventory_harvest.create_index("inventoryId", unique=True)
        await self.db.inventory_harvest.create_index("farmId")
        await self.db.inventory_harvest.create_index("organizationId")
        await self.db.inventory_harvest.create_index("plantName")
        await self.db.inventory_harvest.create_index("qualityGrade")
        await self.db.inventory_harvest.create_index("harvestDate")
        await self.db.inventory_harvest.create_index("productType")
        await self.db.inventory_harvest.create_index([
            ("farmId", 1),
            ("plantName", 1),
            ("qualityGrade", 1),
            ("productType", 1)
        ])

        logger.info("Indexes created")

    async def run(self):
        """Run the migration"""
        try:
            await self.connect()
            await self.get_admin_and_org()
            await self.load_farms()
            await self.load_blocks()

            # Clear existing data for clean migration
            await self.clear_existing_inventory()

            # Process and aggregate
            await self.process_harvests()

            # Insert aggregated inventory
            await self.insert_inventory()

            # Create indexes
            await self.create_indexes()

            # Print summary
            logger.info("=" * 60)
            logger.info("MIGRATION SUMMARY")
            logger.info("=" * 60)
            logger.info(f"Mode:                {'DRY RUN' if self.dry_run else 'LIVE'}")
            logger.info(f"Harvests processed:  {self.stats['harvests_processed']}")
            logger.info(f"Inventory created:   {self.stats['inventory_created']}")
            logger.info(f"Skipped (0 qty):     {self.stats['skipped']}")
            logger.info(f"Errors:              {self.stats['errors']}")
            logger.info(f"Total quantity:      {self.stats['total_quantity_kg']:,.2f} kg")
            logger.info(f"Aggregation ratio:   {self.stats['harvests_processed']} harvests -> {len(self.aggregated_inventory)} inventory items")

        finally:
            await self.close()


async def main():
    parser = argparse.ArgumentParser(description="Migrate Block Harvests to Inventory Harvest")
    parser.add_argument("--dry-run", action="store_true", help="Dry run without writing")
    args = parser.parse_args()

    migration = BlockHarvestsToInventoryMigration(dry_run=args.dry_run)
    await migration.run()


if __name__ == "__main__":
    asyncio.run(main())
