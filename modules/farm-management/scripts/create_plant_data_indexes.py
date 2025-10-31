"""
Create MongoDB Indexes for Enhanced Plant Data Collection

This script creates all required indexes for the plant_data_enhanced collection
to ensure optimal query performance.

Usage:
    python scripts/create_plant_data_indexes.py --collection plant_data_enhanced
    python scripts/create_plant_data_indexes.py --collection plant_data --legacy
"""

import asyncio
import argparse
import sys
import os
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING, DESCENDING, TEXT
from pymongo.errors import OperationFailure

# Add project root to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../')))


class PlantDataIndexCreator:
    """Creates and manages indexes for plant data collections"""

    def __init__(self, mongo_uri: str = "mongodb://localhost:27017", db_name: str = "farm_management_db"):
        self.mongo_uri = mongo_uri
        self.db_name = db_name
        self.client = None
        self.db = None

    async def connect(self):
        """Establish MongoDB connection"""
        self.client = AsyncIOMotorClient(self.mongo_uri)
        self.db = self.client[self.db_name]
        print(f"✅ Connected to MongoDB: {self.db_name}")

    async def close(self):
        """Close MongoDB connection"""
        if self.client:
            self.client.close()
            print("✅ MongoDB connection closed")

    async def create_enhanced_indexes(self, collection_name: str = "plant_data_enhanced"):
        """
        Create all indexes for enhanced plant data schema
        """
        collection = self.db[collection_name]
        print(f"\n📊 Creating indexes for collection: {collection_name}\n")

        indexes_created = 0
        indexes_skipped = 0

        # 1. Primary Key Index
        try:
            await collection.create_index(
                [("plantDataId", ASCENDING)],
                name="idx_plant_data_plant_data_id",
                unique=True
            )
            print("✅ [1/10] Created: idx_plant_data_plant_data_id (unique)")
            indexes_created += 1
        except OperationFailure as e:
            if "already exists" in str(e):
                print("⏭️  [1/10] Skipped: idx_plant_data_plant_data_id (already exists)")
                indexes_skipped += 1
            else:
                raise

        # 2. Plant Name Index
        try:
            await collection.create_index(
                [("plantName", ASCENDING)],
                name="idx_plant_data_plant_name"
            )
            print("✅ [2/10] Created: idx_plant_data_plant_name")
            indexes_created += 1
        except OperationFailure as e:
            if "already exists" in str(e):
                print("⏭️  [2/10] Skipped: idx_plant_data_plant_name (already exists)")
                indexes_skipped += 1
            else:
                raise

        # 3. Scientific Name Index (Unique, Partial)
        try:
            await collection.create_index(
                [("scientificName", ASCENDING)],
                name="idx_plant_data_scientific_name",
                unique=True,
                partialFilterExpression={"scientificName": {"$exists": True, "$ne": None}}
            )
            print("✅ [3/10] Created: idx_plant_data_scientific_name (unique, partial)")
            indexes_created += 1
        except OperationFailure as e:
            if "already exists" in str(e):
                print("⏭️  [3/10] Skipped: idx_plant_data_scientific_name (already exists)")
                indexes_skipped += 1
            else:
                raise

        # 4. Farm Type Compatibility Index
        try:
            await collection.create_index(
                [("farmTypeCompatibility", ASCENDING)],
                name="idx_plant_data_farm_type_compatibility"
            )
            print("✅ [4/10] Created: idx_plant_data_farm_type_compatibility")
            indexes_created += 1
        except OperationFailure as e:
            if "already exists" in str(e):
                print("⏭️  [4/10] Skipped: idx_plant_data_farm_type_compatibility (already exists)")
                indexes_skipped += 1
            else:
                raise

        # 5. Tags Index
        try:
            await collection.create_index(
                [("tags", ASCENDING)],
                name="idx_plant_data_tags"
            )
            print("✅ [5/10] Created: idx_plant_data_tags")
            indexes_created += 1
        except OperationFailure as e:
            if "already exists" in str(e):
                print("⏭️  [5/10] Skipped: idx_plant_data_tags (already exists)")
                indexes_skipped += 1
            else:
                raise

        # 6. Growth Cycle Duration Index
        try:
            await collection.create_index(
                [("growthCycle.totalCycleDays", ASCENDING)],
                name="idx_plant_data_growth_cycle_total"
            )
            print("✅ [6/10] Created: idx_plant_data_growth_cycle_total")
            indexes_created += 1
        except OperationFailure as e:
            if "already exists" in str(e):
                print("⏭️  [6/10] Skipped: idx_plant_data_growth_cycle_total (already exists)")
                indexes_skipped += 1
            else:
                raise

        # 7. Soft Delete Index (Sparse)
        try:
            await collection.create_index(
                [("deletedAt", ASCENDING)],
                name="idx_plant_data_deleted_at",
                sparse=True
            )
            print("✅ [7/10] Created: idx_plant_data_deleted_at (sparse)")
            indexes_created += 1
        except OperationFailure as e:
            if "already exists" in str(e):
                print("⏭️  [7/10] Skipped: idx_plant_data_deleted_at (already exists)")
                indexes_skipped += 1
            else:
                raise

        # 8. Created By User Index (Compound)
        try:
            await collection.create_index(
                [("createdBy", ASCENDING), ("createdAt", DESCENDING)],
                name="idx_plant_data_created_by_created_at"
            )
            print("✅ [8/10] Created: idx_plant_data_created_by_created_at (compound)")
            indexes_created += 1
        except OperationFailure as e:
            if "already exists" in str(e):
                print("⏭️  [8/10] Skipped: idx_plant_data_created_by_created_at (already exists)")
                indexes_skipped += 1
            else:
                raise

        # 9. Active Records Index (Compound)
        try:
            await collection.create_index(
                [("deletedAt", ASCENDING), ("updatedAt", DESCENDING)],
                name="idx_plant_data_deleted_at_updated_at"
            )
            print("✅ [9/10] Created: idx_plant_data_deleted_at_updated_at (compound)")
            indexes_created += 1
        except OperationFailure as e:
            if "already exists" in str(e):
                print("⏭️  [9/10] Skipped: idx_plant_data_deleted_at_updated_at (already exists)")
                indexes_skipped += 1
            else:
                raise

        # 10. Text Search Index (Optional but Recommended)
        try:
            await collection.create_index(
                [
                    ("plantName", TEXT),
                    ("scientificName", TEXT),
                    ("tags", TEXT),
                    ("additionalInfo.notes", TEXT)
                ],
                name="idx_plant_data_text_search",
                weights={
                    "plantName": 10,
                    "scientificName": 8,
                    "tags": 5,
                    "additionalInfo.notes": 1
                }
            )
            print("✅ [10/10] Created: idx_plant_data_text_search (text, weighted)")
            indexes_created += 1
        except OperationFailure as e:
            if "already exists" in str(e):
                print("⏭️  [10/10] Skipped: idx_plant_data_text_search (already exists)")
                indexes_skipped += 1
            else:
                raise

        print(f"\n📊 Index Creation Summary:")
        print(f"   ✅ Created: {indexes_created}")
        print(f"   ⏭️  Skipped: {indexes_skipped}")
        print(f"   📈 Total: {indexes_created + indexes_skipped}/10")

    async def create_legacy_indexes(self, collection_name: str = "plant_data"):
        """
        Create indexes for legacy plant data schema
        """
        collection = self.db[collection_name]
        print(f"\n📊 Creating indexes for legacy collection: {collection_name}\n")

        indexes_created = 0
        indexes_skipped = 0

        # 1. Primary Key
        try:
            await collection.create_index(
                [("plantDataId", ASCENDING)],
                name="idx_plant_data_plant_data_id",
                unique=True
            )
            print("✅ [1/5] Created: idx_plant_data_plant_data_id (unique)")
            indexes_created += 1
        except OperationFailure as e:
            if "already exists" in str(e):
                print("⏭️  [1/5] Skipped: idx_plant_data_plant_data_id (already exists)")
                indexes_skipped += 1

        # 2. Plant Name
        try:
            await collection.create_index(
                [("plantName", ASCENDING)],
                name="idx_plant_data_plant_name"
            )
            print("✅ [2/5] Created: idx_plant_data_plant_name")
            indexes_created += 1
        except OperationFailure as e:
            if "already exists" in str(e):
                print("⏭️  [2/5] Skipped: idx_plant_data_plant_name (already exists)")
                indexes_skipped += 1

        # 3. Scientific Name
        try:
            await collection.create_index(
                [("scientificName", ASCENDING)],
                name="idx_plant_data_scientific_name"
            )
            print("✅ [3/5] Created: idx_plant_data_scientific_name")
            indexes_created += 1
        except OperationFailure as e:
            if "already exists" in str(e):
                print("⏭️  [3/5] Skipped: idx_plant_data_scientific_name (already exists)")
                indexes_skipped += 1

        # 4. Tags
        try:
            await collection.create_index(
                [("tags", ASCENDING)],
                name="idx_plant_data_tags"
            )
            print("✅ [4/5] Created: idx_plant_data_tags")
            indexes_created += 1
        except OperationFailure as e:
            if "already exists" in str(e):
                print("⏭️  [4/5] Skipped: idx_plant_data_tags (already exists)")
                indexes_skipped += 1

        # 5. Created By
        try:
            await collection.create_index(
                [("createdBy", ASCENDING), ("createdAt", DESCENDING)],
                name="idx_plant_data_created_by_created_at"
            )
            print("✅ [5/5] Created: idx_plant_data_created_by_created_at (compound)")
            indexes_created += 1
        except OperationFailure as e:
            if "already exists" in str(e):
                print("⏭️  [5/5] Skipped: idx_plant_data_created_by_created_at (already exists)")
                indexes_skipped += 1

        print(f"\n📊 Legacy Index Creation Summary:")
        print(f"   ✅ Created: {indexes_created}")
        print(f"   ⏭️  Skipped: {indexes_skipped}")
        print(f"   📈 Total: {indexes_created + indexes_skipped}/5")

    async def list_indexes(self, collection_name: str):
        """List all indexes for a collection"""
        collection = self.db[collection_name]
        indexes = await collection.list_indexes().to_list(length=None)

        print(f"\n📋 Indexes for collection '{collection_name}':\n")
        for idx, index in enumerate(indexes, 1):
            print(f"  {idx}. {index['name']}")
            print(f"     Keys: {index['key']}")
            if 'unique' in index:
                print(f"     Unique: {index['unique']}")
            if 'sparse' in index:
                print(f"     Sparse: {index['sparse']}")
            if 'weights' in index:
                print(f"     Weights: {index['weights']}")
            print()

    async def drop_all_indexes(self, collection_name: str, confirm: bool = False):
        """Drop all indexes except _id (use with caution!)"""
        if not confirm:
            print("❌ Error: Must confirm index deletion with --confirm flag")
            return

        collection = self.db[collection_name]
        await collection.drop_indexes()
        print(f"✅ Dropped all indexes for collection '{collection_name}' (except _id)")


async def main():
    parser = argparse.ArgumentParser(description="Create MongoDB indexes for Plant Data collection")
    parser.add_argument(
        "--collection",
        default="plant_data_enhanced",
        help="Collection name (default: plant_data_enhanced)"
    )
    parser.add_argument(
        "--legacy",
        action="store_true",
        help="Create indexes for legacy schema instead of enhanced"
    )
    parser.add_argument(
        "--list",
        action="store_true",
        help="List existing indexes instead of creating"
    )
    parser.add_argument(
        "--drop",
        action="store_true",
        help="Drop all indexes (requires --confirm)"
    )
    parser.add_argument(
        "--confirm",
        action="store_true",
        help="Confirm destructive operations"
    )
    parser.add_argument(
        "--mongo-uri",
        default="mongodb://localhost:27017",
        help="MongoDB connection URI"
    )
    parser.add_argument(
        "--db-name",
        default="farm_management_db",
        help="Database name"
    )

    args = parser.parse_args()

    creator = PlantDataIndexCreator(mongo_uri=args.mongo_uri, db_name=args.db_name)

    try:
        await creator.connect()

        if args.list:
            # List existing indexes
            await creator.list_indexes(args.collection)

        elif args.drop:
            # Drop indexes (with confirmation)
            await creator.drop_all_indexes(args.collection, confirm=args.confirm)

        else:
            # Create indexes
            if args.legacy:
                await creator.create_legacy_indexes(args.collection)
            else:
                await creator.create_enhanced_indexes(args.collection)

            # Show final index list
            await creator.list_indexes(args.collection)

    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        await creator.close()


if __name__ == "__main__":
    asyncio.run(main())
