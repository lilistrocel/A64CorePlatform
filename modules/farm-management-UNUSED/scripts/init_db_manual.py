"""
Temporary script to initialize database indexes with corrected syntax
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING, DESCENDING, TEXT
from pymongo.errors import OperationFailure


async def create_indexes():
    """Create all required indexes for plant_data_enhanced collection"""

    client = AsyncIOMotorClient("mongodb://mongodb:27017")
    db = client["a64core_db"]
    collection = db.plant_data_enhanced

    indexes_created = 0
    indexes = [
        # 1. Primary Key Index (Unique)
        {
            "keys": [("plantDataId", ASCENDING)],
            "name": "idx_plant_data_plant_data_id",
            "unique": True
        },
        # 2. Plant Name Index
        {
            "keys": [("plantName", ASCENDING)],
            "name": "idx_plant_data_plant_name"
        },
        # 3. Scientific Name Index (Unique, Partial) - FIXED
        {
            "keys": [("scientificName", ASCENDING)],
            "name": "idx_plant_data_scientific_name",
            "unique": True,
            "partialFilterExpression": {"scientificName": {"$exists": True, "$type": "string"}}
        },
        # 4. Farm Type Compatibility Index
        {
            "keys": [("farmTypeCompatibility", ASCENDING)],
            "name": "idx_plant_data_farm_type_compatibility"
        },
        # 5. Tags Index
        {
            "keys": [("tags", ASCENDING)],
            "name": "idx_plant_data_tags"
        },
        # 6. Growth Cycle Duration Index
        {
            "keys": [("growthCycle.totalCycleDays", ASCENDING)],
            "name": "idx_plant_data_growth_cycle_total"
        },
        # 7. Soft Delete Index (Sparse)
        {
            "keys": [("deletedAt", ASCENDING)],
            "name": "idx_plant_data_deleted_at",
            "sparse": True
        },
        # 8. Created By User Index (Compound)
        {
            "keys": [("createdBy", ASCENDING), ("createdAt", DESCENDING)],
            "name": "idx_plant_data_created_by_created_at"
        },
        # 9. Active Records Index (Compound)
        {
            "keys": [("deletedAt", ASCENDING), ("updatedAt", DESCENDING)],
            "name": "idx_plant_data_deleted_at_updated_at"
        },
        # 10. Text Search Index (Weighted)
        {
            "keys": [
                ("plantName", TEXT),
                ("scientificName", TEXT),
                ("tags", TEXT),
                ("additionalInfo.notes", TEXT)
            ],
            "name": "idx_plant_data_text_search",
            "weights": {
                "plantName": 10,
                "scientificName": 8,
                "tags": 5,
                "additionalInfo.notes": 1
            }
        }
    ]

    for idx_config in indexes:
        try:
            keys = idx_config.pop("keys")
            await collection.create_index(keys, **idx_config)
            print(f"✅ Created index: {idx_config['name']}")
            indexes_created += 1
        except OperationFailure as e:
            if "already exists" in str(e):
                print(f"⏭️  Skipped index (already exists): {idx_config['name']}")
            else:
                print(f"❌ Failed to create index {idx_config['name']}: {e}")
                raise

    print(f"\n✅ Total indexes created: {indexes_created}")
    client.close()
    return indexes_created


if __name__ == "__main__":
    result = asyncio.run(create_indexes())
    print(f"Database initialization complete. {result} indexes created.")
