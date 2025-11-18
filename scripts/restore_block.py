import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def main():
    client = AsyncIOMotorClient('mongodb://localhost:27017')
    db = client.a64core_db

    result = await db.blocks.update_one(
        {'blockCode': 'F001-004'},
        {'$set': {'isActive': True}}
    )

    print(f"Restored F001-004: {result.modified_count} document(s) updated")
    client.close()

if __name__ == '__main__':
    asyncio.run(main())
