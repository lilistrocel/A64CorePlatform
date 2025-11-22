"""
Generate tasks for GH2 block (F001-022)
This block transitioned to planned but didn't get tasks generated.
"""
import asyncio
import sys
from uuid import UUID

# Add src to path
sys.path.insert(0, '/app/src')

from modules.farm_manager.services.task.task_generator import TaskGeneratorService
from modules.farm_manager.services.database import farm_db


async def generate_tasks_for_gh2():
    """Generate tasks for GH2 block"""

    # Connect to database
    await farm_db.connect()

    try:
        db = farm_db.get_database()

        # Get GH2 block
        block = await db.blocks.find_one({"blockCode": "F001-022"})
        if not block:
            print("Block F001-022 not found!")
            return

        block_id = UUID(block["blockId"])

        # Get or create cycle ID
        current_cycle_id = block.get("currentCycleId")
        if not current_cycle_id:
            # Generate a new cycle ID
            import uuid
            current_cycle_id = str(uuid.uuid4())
            print(f"Generated new cycle ID: {current_cycle_id}")

            # Update block with cycle ID
            await db.blocks.update_one(
                {"blockId": block["blockId"]},
                {"$set": {"currentCycleId": current_cycle_id}}
            )
        else:
            current_cycle_id = str(current_cycle_id)

        # Get admin user info for task creation
        admin = await db.users.find_one({"email": "admin@a64platform.com"})
        if not admin:
            print("Admin user not found!")
            return

        user_id = UUID(admin["userId"])
        user_email = admin["email"]

        print(f"\nGenerating tasks for block {block['blockCode']}...")
        print(f"Block ID: {block_id}")
        print(f"Cycle ID: {current_cycle_id}")
        print(f"User: {user_email}")
        print(f"Expected changes: {block.get('expectedStatusChanges', {})}")

        # Generate tasks
        tasks = await TaskGeneratorService.generate_tasks_for_block(
            block_id=block_id,
            cycle_id=UUID(current_cycle_id),
            user_id=user_id,
            user_email=user_email
        )

        print(f"\n✅ Successfully generated {len(tasks)} tasks:")
        for task in tasks:
            print(f"  - {task.taskType}: {task.title} (scheduled: {task.scheduledDate.date()})")

    finally:
        await farm_db.disconnect()


if __name__ == "__main__":
    asyncio.run(generate_tasks_for_gh2())
