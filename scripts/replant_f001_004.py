"""
Quick script to reset F001-004 to EMPTY and replant with lettuce
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def main():
    client = AsyncIOMotorClient('mongodb://localhost:27017')
    db = client.a64core_db

    # First, check current state
    block = await db.blocks.find_one({'blockCode': 'F001-004'})
    if block:
        print(f"Current state: {block.get('state')}")
    else:
        print("Block F001-004 not found!")
        return

    # Reset F001-004 to EMPTY state
    result = await db.blocks.update_one(
        {'blockCode': 'F001-004'},
        {'$set': {
            'state': 'empty',
            'targetCrop': None,
            'actualPlantCount': None,
            'expectedHarvestDate': None,
            'expectedStatusChanges': None,
            'plantedDate': None
        }}
    )

    print(f"Reset F001-004 to EMPTY: {result.modified_count} document(s) updated")

    # Verify the update
    block_after = await db.blocks.find_one({'blockCode': 'F001-004'})
    if block_after:
        print(f"New state: {block_after.get('state')}")

    client.close()

if __name__ == '__main__':
    asyncio.run(main())
