"""Setup default organization and assign users to it."""
import asyncio
import sys
sys.path.insert(0, '/home/noobcity/Code/A64CorePlatform')

from uuid import uuid4
from datetime import datetime, timezone


async def main():
    from motor.motor_asyncio import AsyncIOMotorClient
    import os

    mongo_uri = os.environ.get("MONGODB_URI", "mongodb://a64admin:a64password@localhost:27017/a64core_db?authSource=admin")
    client = AsyncIOMotorClient(mongo_uri)
    db = client["a64core_db"]

    # Check if org already exists
    existing = await db.organizations.find_one({})
    if existing:
        org_id = existing.get("organizationId")
        print(f"Organization already exists: {org_id}")
    else:
        org_id = str(uuid4())
        await db.organizations.insert_one({
            "organizationId": org_id,
            "name": "A64 Core Farm Operations",
            "description": "Default organization for A64 Core Platform",
            "isActive": True,
            "createdAt": datetime.now(timezone.utc),
            "updatedAt": datetime.now(timezone.utc)
        })
        print(f"Created organization: {org_id}")

    # Update users
    for email in ["farmtest_admin@a64core.com", "testadmin@a64core.com"]:
        result = await db.users.update_one(
            {"email": email},
            {"$set": {"organizationId": org_id}}
        )
        print(f"Updated {email}: matched={result.matched_count}, modified={result.modified_count}")

    client.close()
    print("Done!")


if __name__ == "__main__":
    asyncio.run(main())
