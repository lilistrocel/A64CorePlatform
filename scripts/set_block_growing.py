import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def main():
    client = AsyncIOMotorClient('mongodb://localhost:27017')
    db = client.a64core_db

    # Set F001-004 to growing state
    result = await db.blocks.update_one(
        {'blockCode': 'F001-004'},
        {'$set': {'state': 'growing'}}
    )

    print(f"Set F001-004 to growing: {result.modified_count} document(s) updated")
    client.close()

if __name__ == '__main__':
    asyncio.run(main())
