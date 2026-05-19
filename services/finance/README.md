# Finance Service — Week 1 Scaffold

Standalone FastAPI microservice providing master-data CRUD for the A64 Core Platform finance module.

Runs on **port 8001**, proxied by Nginx at `/api/v1/finance/*`.

No posting engine yet — that arrives in Week 3.

---

## Local Development

### Prerequisites

- Docker 20.10+ and Docker Compose v2
- The main `a64core-network` must exist (created by `docker compose up -d`)

### Start Finance Stack

```bash
# Start main services first (creates the Docker network)
docker compose up -d

# Start finance + mysql on top
docker compose -f docker-compose.yml -f docker-compose.finance.yml --profile finance up -d
```

### Run Migrations

```bash
docker compose -f docker-compose.yml -f docker-compose.finance.yml --profile finance \
  exec finance alembic upgrade head
```

### Stop Finance Stack Only

```bash
docker compose -f docker-compose.yml -f docker-compose.finance.yml --profile finance \
  stop finance mysql
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `SECRET_KEY` | `dev_secret_key_change_in_production` | **Must match main app SECRET_KEY** — used to verify JWT tokens |
| `MYSQL_HOST` | `mysql` | MySQL hostname (Docker service name) |
| `MYSQL_PORT` | `3306` | MySQL port |
| `MYSQL_DATABASE` | `finance_db` | Database name |
| `MYSQL_USER` | `finance_user` | DB user |
| `MYSQL_PASSWORD` | `finance_password` | DB password |
| `ENVIRONMENT` | `development` | `development` or `production` |
| `DEBUG` | `True` | Enable debug mode |
| `LOG_LEVEL` | `INFO` | Log verbosity |

---

## API Endpoints

Base path: `/api/v1/finance`

### Public (no auth)

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Liveness probe |
| GET | `/ready` | Readiness probe (checks MySQL) |

### Master Data (JWT required)

| Method | Path | Roles |
|---|---|---|
| GET POST | `/companies` | read: all finance roles; write: finance_admin |
| GET PATCH | `/companies/{companyCode}` | same as above |
| GET POST | `/accounts` | read: all; write: finance_admin |
| GET PATCH DELETE | `/accounts/{accountId}` | same |
| GET POST | `/periods` | read: all; write: finance_admin |
| PATCH | `/periods/{periodId}/close` | finance_admin |
| PATCH | `/periods/{periodId}/reopen` | finance_admin |
| GET POST | `/tax-codes` | read: all; write: finance_admin |
| PATCH | `/tax-codes/{taxCode}` | finance_admin |
| GET POST | `/cost-centers` | read: all; write: finance_admin |
| PATCH | `/cost-centers/{costCenterId}` | finance_admin |
| GET POST | `/vendors` | read: all; write: finance_admin |
| GET PATCH | `/vendors/{vendorId}` | same |
| GET PUT | `/customers/{customerId}/finance-ext` | read: all; write: finance_admin, accountant |

**Role permission matrix:**

| Role | Read | Write master data | Close/reopen periods |
|---|---|---|---|
| `auditor` | ✓ | ✗ | ✗ |
| `accountant` | ✓ | customer-ext only | ✗ |
| `finance_admin` | ✓ | ✓ | ✓ |
| `admin` / `super_admin` | ✓ | ✓ | ✓ |

### Company Creation Seeds CoA

`POST /companies` automatically seeds:
- ~208 GL accounts across 9 drawers (standard UAE agri-business CoA)
- 5 default UAE VAT tax codes (S, Z, E, N, SR)

Seeding is idempotent — calling POST with the same `organizationId` a second time will not duplicate accounts.

---

## Running Tests

Tests use SQLite in-memory — no live MySQL required.

```bash
# From services/finance/
pip install -e ".[test]"
pytest tests/ -v
```

---

## Database Schema

8 MySQL tables:

| Table | Description |
|---|---|
| `company_codes` | Company entities with fiscal calendar |
| `gl_accounts` | Chart of accounts (self-referential tree) |
| `fiscal_periods` | Fiscal periods (up to 13/year) |
| `tax_codes` | UAE VAT tax codes |
| `cost_centers` | Cost centre master data |
| `vendors` | Vendor master with bank details JSON |
| `customer_finance_ext` | Finance extension for MongoDB customers |
| `audit_log` | Immutable mutation audit trail |

---

## Architecture Notes

- **No imports from main app** (`src/`) — this is a sibling service
- **JWT verification** — uses the same `SECRET_KEY` env var as the main app, decodes tokens directly (no MongoDB round-trip)
- **SQLAlchemy 2.x + asyncmy** — fully async MySQL driver
- **Alembic** — migration history in `alembic/versions/`
- **Week 3 additions** — posting engine, GL journal entries, outbox consumer
