# Finance Consumer Worker

Polls the `finance_outbox` MongoDB collection and delivers events to the
finance service ingestion endpoint.

Part of the Week 3 outbox bridge infrastructure. Business events are wired
in Week 4.

## Architecture

```
Main App (MongoDB)          Consumer Worker          Finance Service (MySQL)
─────────────────           ────────────────         ──────────────────────
OutboxWriter.publish()  ──> finance_outbox       ─>  POST /finance/events/ingest
   (status=pending)         findOneAndUpdate          outbox_events_processed
                            (claim→process→done)
```

Full event flow sequence:

```
Business Handler (Week 4)
  │
  ▼ OutboxWriter.publish(event_type, payload, ...)
  │
  ▼ MongoDB: finance_outbox (status=pending)
  │
  ▼  [consumer polls every N seconds]
  │
  ▼ findOneAndUpdate → status=processing (atomic claim)
  │
  ▼ HTTP POST /api/v1/finance/events/ingest
  │   Header: X-Service-Secret: <shared_secret>
  │   Body: BaseFinanceEvent JSON
  │
  ├── 200 processed      → status=processed
  ├── 200 already_processed → status=processed (idempotent)
  ├── 4xx (bad payload)  → status=failed (no retry)
  └── 5xx / timeout      → attempts++ → pending (retry next cycle)
                           if attempts >= MAX_ATTEMPTS → status=failed
```

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MONGODB_URL` | `mongodb://mongodb:27017/a64core_db` | MongoDB connection string |
| `MONGODB_DB_NAME` | `a64core_db` | Database name |
| `FINANCE_URL` | `http://finance:8001` | Finance service base URL |
| `FINANCE_INGESTION_SECRET` | `dev-only-secret-change-in-prod` | Shared secret (X-Service-Secret header) |
| `CONSUMER_POLL_INTERVAL_SECONDS` | `5` | Seconds between poll cycles |
| `CONSUMER_BATCH_SIZE` | `50` | Events claimed per cycle |
| `CONSUMER_MAX_ATTEMPTS` | `5` | Max delivery attempts per event |
| `CONSUMER_STALE_CLAIM_SECONDS` | `300` | Re-claim events stuck in 'processing' > N seconds |
| `LOG_LEVEL` | `INFO` | Python logging level |

## Running locally (Docker Compose)

```bash
# Start main stack + finance overlay
docker compose -p esgagro \
  -f docker-compose.yml \
  -f docker-compose.finance.yml \
  --profile finance up -d --build

# Run migrations
docker compose -p esgagro \
  -f docker-compose.yml \
  -f docker-compose.finance.yml \
  --profile finance \
  exec finance alembic upgrade head

# Check consumer logs
docker logs a64-finance-consumer -f
```

## End-to-end demo

The demo script inserts a synthetic `sales_order_shipped` event and waits for
the consumer to process it.

### Option A — via Docker exec (recommended)

```bash
docker compose -p esgagro \
  -f docker-compose.yml \
  -f docker-compose.finance.yml \
  --profile finance \
  exec finance_consumer \
  python /app/consumer/scripts/demo_publish.py
```

Expected output:

```
[Demo] Inserting synthetic event event_id=<uuid>
[Demo] event_type=sales_order_shipped company_code=A001
[Demo] Inserted into finance_outbox with status=pending

[Demo] Waiting up to 30s for consumer to process...
  [06s] status=processed attempts=0

[Demo] SUCCESS: event processed in 6s
       processedAt=2026-05-19T12:00:00.123456
       attempts=0

[Demo] Checking finance MySQL for outbox_events_processed...
       (run this in mysql container to verify)
       SELECT * FROM outbox_events_processed WHERE eventId='<uuid>';

[Demo] Testing duplicate rejection (unique eventId index)...
[Demo] Duplicate correctly rejected by unique eventId index
```

### Option B — mongosh one-liner

Paste this into `mongosh mongodb://localhost:27017/a64core_db` to insert a
test event manually:

```javascript
db.finance_outbox.insertOne({
  eventId: UUID().toString().replace(/-/g, ''),
  eventType: "sales_order_shipped",
  organizationId: UUID().toString(),
  companyCode: "A001",
  occurredAt: new Date(),
  sourceUserId: UUID().toString(),
  sourceDocumentId: "manual-test-001",
  payload: {
    salesOrderId: UUID().toString(),
    customerId: UUID().toString(),
    farmCode: "ALAIN-01",
    lines: [],
    totalNetAmount: "100.00",
    totalTaxAmount: "5.00",
    totalGrossAmount: "105.00"
  },
  status: "pending",
  attempts: 0,
  lastError: null,
  lastAttemptAt: null,
  processedAt: null,
  createdAt: new Date()
})
```

Then watch the status:

```javascript
db.finance_outbox.findOne({ eventType: "sales_order_shipped" }, { eventId: 1, status: 1, processedAt: 1 })
```

### Verify idempotency (second run)

Run the demo a second time with the same `eventId`. The finance service will
return `already_processed` and the consumer will mark the event as processed.
No duplicate row is created in `outbox_events_processed`.

Verify in MySQL:

```sql
SELECT COUNT(*) FROM outbox_events_processed WHERE eventId = '<your-event-id>';
-- Expected: 1 (not 2)
```

## Running tests

```bash
# Finance service tests (ingest endpoint)
cd services/finance
pip install -e ".[test]"
pytest tests/test_events_ingest.py -v

# Consumer worker tests (poller unit tests)
cd services/finance_consumer
pip install -e ".[test]"
pytest tests/test_poller.py -v
```

## Service-to-service secret

Generate a secure secret for production:

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

Set it in your `.env`:

```env
FINANCE_INGESTION_SECRET=<generated_value>
```

The same value must be set on both the `finance` container and the
`finance_consumer` container.  The default `dev-only-secret-change-in-prod`
is acceptable for local development only.
