"""
End-to-End Demo Script — Finance Outbox Bridge

Publishes a synthetic `sales_order_shipped` event to the `finance_outbox`
MongoDB collection and waits up to 30 seconds for the consumer worker to
process it.

Usage
-----
Run from the project root (requires motor installed):

    # Option A — inside the finance_consumer container:
    docker compose -p esgagro -f docker-compose.yml -f docker-compose.finance.yml \
        --profile finance exec finance_consumer \
        python /app/consumer/scripts/demo_publish.py

    # Option B — from the host (MongoDB must be reachable on localhost:27017):
    MONGODB_URL=mongodb://localhost:27017/a64core_db \
        python services/finance_consumer/scripts/demo_publish.py

Environment variables
---------------------
    MONGODB_URL      MongoDB connection string (default: mongodb://localhost:27017/a64core_db)
    MONGODB_DB_NAME  Database name (default: a64core_db)
    WAIT_SECONDS     How long to wait for processing (default: 30)
"""

import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorClient

MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017/a64core_db")
MONGODB_DB_NAME = os.getenv("MONGODB_DB_NAME", "a64core_db")
WAIT_SECONDS = int(os.getenv("WAIT_SECONDS", "30"))
COLLECTION = "finance_outbox"


def make_event() -> dict:
    """Build a synthetic sales_order_shipped event document."""
    event_id = str(uuid.uuid4())
    org_id = str(uuid.uuid4())
    now = datetime.now(tz=timezone.utc)
    return {
        "eventId": event_id,
        "eventType": "sales_order_shipped",
        "organizationId": org_id,
        "companyCode": "A001",
        "occurredAt": now,
        "sourceUserId": str(uuid.uuid4()),
        "sourceDocumentId": "demo-order-001",
        "payload": {
            "salesOrderId": str(uuid.uuid4()),
            "customerId": str(uuid.uuid4()),
            "farmCode": "ALAIN-01",
            "lines": [
                {
                    "productId": str(uuid.uuid4()),
                    "productName": "Butterhead Lettuce",
                    "quantityKg": "50.00",
                    "unitPrice": "12.50",
                    "lineTotal": "625.00",
                    "taxCode": "VAT5",
                    "taxAmount": "31.25",
                    "standardCostPerKg": "4.20",
                }
            ],
            "totalNetAmount": "625.00",
            "totalTaxAmount": "31.25",
            "totalGrossAmount": "656.25",
        },
        "status": "pending",
        "attempts": 0,
        "lastError": None,
        "lastAttemptAt": None,
        "processedAt": None,
        "createdAt": now,
    }


async def run() -> None:
    """Insert a test event and wait for the consumer to process it."""
    client = AsyncIOMotorClient(MONGODB_URL)
    db = client[MONGODB_DB_NAME]
    coll = db[COLLECTION]

    event = make_event()
    event_id = event["eventId"]

    print(f"\n[Demo] Inserting synthetic event event_id={event_id}")
    print(f"[Demo] event_type=sales_order_shipped company_code={event['companyCode']}")
    await coll.insert_one(event)
    print("[Demo] Inserted into finance_outbox with status=pending")

    print(f"\n[Demo] Waiting up to {WAIT_SECONDS}s for consumer to process...")

    for elapsed in range(WAIT_SECONDS):
        await asyncio.sleep(1)
        doc = await coll.find_one({"eventId": event_id})
        if doc is None:
            print("[Demo] ERROR: event document disappeared from outbox!")
            sys.exit(1)

        status = doc.get("status", "unknown")
        attempts = doc.get("attempts", 0)
        print(f"  [{elapsed+1:02d}s] status={status} attempts={attempts}", end="\r")

        if status == "processed":
            print(f"\n\n[Demo] SUCCESS: event processed in {elapsed+1}s")
            print(f"       processedAt={doc.get('processedAt')}")
            print(f"       attempts={doc.get('attempts')}")

            # Verify the idempotency table
            print("\n[Demo] Checking finance MySQL for outbox_events_processed...")
            print("       (run this in mysql container to verify)")
            print(f"       SELECT * FROM outbox_events_processed WHERE eventId='{event_id}';")

            # Second insertion — should be rejected by unique index
            print("\n[Demo] Testing duplicate rejection (unique eventId index)...")
            try:
                dupe_event = dict(event)
                dupe_event["_id"] = None  # type: ignore[assignment]
                dupe_event.pop("_id")
                await coll.insert_one(dupe_event)
                print("[Demo] WARNING: duplicate was not rejected — check unique index")
            except Exception as exc:
                if "duplicate key" in str(exc).lower() or "11000" in str(exc):
                    print("[Demo] Duplicate correctly rejected by unique eventId index")
                else:
                    print(f"[Demo] Unexpected duplicate error: {exc}")

            client.close()
            return

        if status == "failed":
            print(f"\n\n[Demo] FAILED: event permanently failed after {elapsed+1}s")
            print(f"       lastError={doc.get('lastError')}")
            print(f"       attempts={doc.get('attempts')}")
            client.close()
            sys.exit(1)

    print(f"\n\n[Demo] TIMEOUT: event not processed within {WAIT_SECONDS}s")
    doc = await coll.find_one({"eventId": event_id})
    print(f"       final status={doc.get('status') if doc else 'NOT FOUND'}")
    print("       Is the consumer running? Check: docker logs a64-finance-consumer")
    client.close()
    sys.exit(1)


if __name__ == "__main__":
    asyncio.run(run())
