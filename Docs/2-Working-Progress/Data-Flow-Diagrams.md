# Data Flow Diagrams

**Document Status:** TEMPLATE - Requires organizational review and approval
**Last Updated:** 2026-02-04
**Owner:** [Assign responsible person]
**Related Documents:** Data-Classification-Policy.md, System-Architecture.md

---

## 1. Overview

This document maps all data flows within the A64 Core Platform, identifying where sensitive data (T1-RESTRICTED and T2-CONFIDENTIAL) enters, moves, is stored, and exits the system. Each flow is annotated with the data classification tier and security controls applied.

---

## 2. System Context Diagram

```
                                    EXTERNAL SYSTEMS
                    +------------------------------------------+
                    |                                          |
                    |  WeatherBit API (T3 weather data)        |
                    |  Google Vertex AI (T3 analytics queries) |
                    |  Docker Hub (T4 container images)        |
                    |  GitHub (T4 source code)                 |
                    |  Let's Encrypt (T4 SSL certs)            |
                    |                                          |
                    +------------------+-----------------------+
                                       |
                                       | HTTPS (TLS 1.2+)
                                       v
+------------------+          +------------------+          +--------------------+
|                  |  HTTPS   |                  |  HTTP    |                    |
|  Web Browser     +--------->+  Nginx           +--------->+  FastAPI (API)     |
|  (User Portal)   |  (T2)   |  (Reverse Proxy) |  (T3)   |  (Backend)         |
|                  |<---------+                  |<---------+                    |
+------------------+          +------------------+          +---------+----------+
                                                                      |
                              +---------------------------------------+--------+
                              |                    |                            |
                              v                    v                            v
                    +------------------+  +------------------+        +------------------+
                    |                  |  |                  |        |                  |
                    |  MongoDB 7.0     |  |  Redis 7         |        |  Docker Engine   |
                    |  (Primary DB)    |  |  (Cache/Rate     |        |  (Modules)       |
                    |  T1-T4 data      |  |   Limiting)      |        |  T1-T3 data      |
                    |                  |  |  T1-T3 data      |        |                  |
                    +------------------+  +------------------+        +------------------+
```

---

## 3. Authentication Data Flow

### 3.1 User Registration Flow

```
User Browser                  Nginx                    API                     MongoDB              Redis
    |                           |                       |                        |                    |
    |  POST /auth/register      |                       |                        |                    |
    |  {email, password,        |                       |                        |                    |
    |   firstName, lastName}    |                       |                        |                    |
    |  [T2-CONFIDENTIAL]        |                       |                        |                    |
    |-------------------------->|                       |                        |                    |
    |                           |  Forward (HTTP)       |                        |                    |
    |                           |---------------------->|                        |                    |
    |                           |                       |                        |                    |
    |                           |                       |  Check duplicate email  |                    |
    |                           |                       |  [T2-CONFIDENTIAL]      |                    |
    |                           |                       |----------------------->|                    |
    |                           |                       |  <exists/not>          |                    |
    |                           |                       |<-----------------------|                    |
    |                           |                       |                        |                    |
    |                           |                       |  Hash password (bcrypt) |                    |
    |                           |                       |  [T1 -> T1 transform]  |                    |
    |                           |                       |                        |                    |
    |                           |                       |  Store user document   |                    |
    |                           |                       |  {email, passwordHash, |                    |
    |                           |                       |   names, phone}        |                    |
    |                           |                       |  [T1-RESTRICTED]       |                    |
    |                           |                       |----------------------->|                    |
    |                           |                       |  <stored>              |                    |
    |                           |                       |<-----------------------|                    |
    |                           |                       |                        |                    |
    |                           |                       |  Store verification    |                    |
    |                           |                       |  token [T1-RESTRICTED] |                    |
    |                           |                       |----------------------->|                    |
    |                           |                       |                        |                    |
    |                           |  UserResponse          |                        |                    |
    |                           |  (no password)         |                        |                    |
    |                           |  [T2-CONFIDENTIAL]     |                        |                    |
    |                           |<-----------------------|                        |                    |
    |  201 Created              |                       |                        |                    |
    |  [T2-CONFIDENTIAL]        |                       |                        |                    |
    |<--------------------------|                       |                        |                    |

SECURITY CONTROLS:
- TLS encryption: Browser <-> Nginx (HTTPS)
- Password never stored in plaintext (bcrypt hash)
- Verification token has TTL expiry
- Rate limiting on registration endpoint
```

### 3.2 User Login Flow

```
User Browser                  Nginx                    API                     MongoDB              Redis
    |                           |                       |                        |                    |
    |  POST /auth/login         |                       |                        |                    |
    |  {email, password}        |                       |                        |                    |
    |  [T1-RESTRICTED]          |                       |                        |                    |
    |-------------------------->|                       |                        |                    |
    |                           |  Forward              |                        |                    |
    |                           |---------------------->|                        |                    |
    |                           |                       |                        |                    |
    |                           |                       |  Check login attempts  |                    |
    |                           |                       |  [T2 email lookup]     |                    |
    |                           |                       |------------------------------------------>|
    |                           |                       |  <attempts count>      |                    |
    |                           |                       |<------------------------------------------|
    |                           |                       |                        |                    |
    |                           |                       |  Lookup user by email  |                    |
    |                           |                       |  [T2-CONFIDENTIAL]     |                    |
    |                           |                       |----------------------->|                    |
    |                           |                       |  <user with hash>      |                    |
    |                           |                       |  [T1-RESTRICTED]       |                    |
    |                           |                       |<-----------------------|                    |
    |                           |                       |                        |                    |
    |                           |                       |  Verify password       |                    |
    |                           |                       |  (bcrypt compare)      |                    |
    |                           |                       |  [T1 operation]        |                    |
    |                           |                       |                        |                    |
    |                           |                       |  Generate JWT tokens   |                    |
    |                           |                       |  [T1-RESTRICTED]       |                    |
    |                           |                       |                        |                    |
    |                           |                       |  Store refresh token   |                    |
    |                           |                       |  [T1-RESTRICTED]       |                    |
    |                           |                       |----------------------->|                    |
    |                           |                       |                        |                    |
    |                           |                       |  Clear login attempts  |                    |
    |                           |                       |------------------------------------------>|
    |                           |                       |                        |                    |
    |                           |  TokenResponse         |                        |                    |
    |                           |  {accessToken,         |                        |                    |
    |                           |   refreshToken}        |                        |                    |
    |                           |  [T1-RESTRICTED]       |                        |                    |
    |                           |<-----------------------|                        |                    |
    |  200 OK + tokens          |                       |                        |                    |
    |  [T1-RESTRICTED]          |                       |                        |                    |
    |<--------------------------|                       |                        |                    |

SECURITY CONTROLS:
- TLS encryption end-to-end
- Redis-backed login rate limiting (5 attempts, 15-min lockout)
- Bcrypt password comparison (constant-time)
- JWT tokens with 1h/7d expiry
- Refresh token rotation
- Failed attempt tracking in Redis with TTL
```

---

## 4. HR Module Data Flows

### 4.1 Employee Data Flow

```
HR User                       Nginx                    API                     MongoDB
    |                           |                       |                        |
    |  POST /farm/employees     |                       |                        |
    |  {firstName, lastName,    |                       |                        |
    |   email, phone,           |                       |                        |
    |   emiratesId, salary...}  |                       |                        |
    |  [T1-RESTRICTED]          |                       |                        |
    |-------------------------->|                       |                        |
    |                           |  + Auth header check  |                        |
    |                           |  [T1 token validation]|                        |
    |                           |---------------------->|                        |
    |                           |                       |                        |
    |                           |                       |  Validate JWT token    |
    |                           |                       |  Check role >= ADMIN   |
    |                           |                       |  [T1 operation]        |
    |                           |                       |                        |
    |                           |                       |  Validate emiratesId   |
    |                           |                       |  format (15 digits)    |
    |                           |                       |                        |
    |                           |                       |  Store employee        |
    |                           |                       |  document in MongoDB   |
    |                           |                       |  [T1-RESTRICTED]       |
    |                           |                       |----------------------->|
    |                           |                       |                        |
    |                           |  Employee response     |                        |
    |                           |  [T2-CONFIDENTIAL]     |                        |
    |                           |<-----------------------|                        |
    |  201 Created              |                       |                        |
    |<--------------------------|                       |                        |

SENSITIVE FIELDS IN THIS FLOW:
- emiratesId: T1 - UAE government ID (15 digits)
- salary, benefits: T1 - Financial compensation
- firstName, lastName, arabicNames: T2 - Personal names
- email, phone: T2 - Contact information
- gender, nationality, maritalStatus: T2 - Protected characteristics
- emergencyContact: T2 - Third-party PII

SECURITY GAPS IDENTIFIED:
! emiratesId is NOT encrypted at field level before storage
! Salary data is NOT encrypted at field level before storage
! No separate access control for financial vs. general HR data
```

---

## 5. Sales & Financial Data Flows

### 5.1 Sales Order Flow

```
Sales User                    Nginx                    API                     MongoDB
    |                           |                       |                        |
    |  POST /sales/orders       |                       |                        |
    |  {customerId,             |                       |                        |
    |   items[],                |                       |                        |
    |   shippingAddress}        |                       |                        |
    |  [T2-CONFIDENTIAL]        |                       |                        |
    |-------------------------->|                       |                        |
    |                           |---------------------->|                        |
    |                           |                       |                        |
    |                           |                       |  Lookup customer       |
    |                           |                       |  [T2-CONFIDENTIAL]     |
    |                           |                       |----------------------->|
    |                           |                       |<-----------------------|
    |                           |                       |                        |
    |                           |                       |  Check inventory       |
    |                           |                       |  (stock_inventory)     |
    |                           |                       |  [T3-INTERNAL]         |
    |                           |                       |----------------------->|
    |                           |                       |<-----------------------|
    |                           |                       |                        |
    |                           |                       |  Calculate pricing     |
    |                           |                       |  (subtotal, tax, total)|
    |                           |                       |  [T2-CONFIDENTIAL]     |
    |                           |                       |                        |
    |                           |                       |  Store sales order     |
    |                           |                       |  [T2-CONFIDENTIAL]     |
    |                           |                       |----------------------->|
    |                           |                       |                        |
    |                           |                       |  Reserve inventory     |
    |                           |                       |  [T3-INTERNAL]         |
    |                           |                       |----------------------->|
    |                           |                       |                        |
    |                           |  Order response        |                        |
    |                           |<-----------------------|                        |
    |  201 Created              |                       |                        |
    |<--------------------------|                       |                        |

DATA SENSITIVITY IN SALES ORDERS:
- customerName, shippingAddress: T2 - Customer PII
- unitPrice, totalPrice, tax, discount: T2 - Financial data
- items, quantities: T3 - Business operational data
```

### 5.2 Cross-Module Data Flow (Farm -> Sales -> Logistics)

```
Farm Module                   Sales Module              Logistics Module         MongoDB
    |                           |                        |                        |
    |  Harvest completed        |                        |                        |
    |  Creates stock_inventory  |                        |                        |
    |  [T3-INTERNAL]            |                        |                        |
    |----------------------------------------------------+---------------------->|
    |                           |                        |                        |
    |                           |  Sales order created   |                        |
    |                           |  References inventory  |                        |
    |                           |  [T2-CONFIDENTIAL]     |                        |
    |                           |----------------------------------------------->|
    |                           |                        |                        |
    |                           |  Order status ->       |                        |
    |                           |  "assigned"            |                        |
    |                           |  Triggers shipment     |                        |
    |                           |  creation              |                        |
    |                           |----------------------->|                        |
    |                           |                        |                        |
    |                           |                        |  Create shipment       |
    |                           |                        |  {routeId, vehicleId,  |
    |                           |                        |   driverId, orderIds}  |
    |                           |                        |  [T2-CONFIDENTIAL]     |
    |                           |                        |---------------------->|
    |                           |                        |                        |
    |                           |                        |  Lookup route          |
    |                           |                        |  (GPS coordinates)     |
    |                           |                        |  [T2-CONFIDENTIAL]     |
    |                           |                        |<----------------------|
    |                           |                        |                        |

DATA CROSSING MODULE BOUNDARIES:
- stock_inventory -> sales_orders: Product IDs, quantities (T3)
- sales_orders -> shipments: Order IDs, customer address (T2)
- employees -> shipments: driverId linking (T2)
- routes -> shipments: GPS coordinates (T2)
```

---

## 6. External Integration Data Flows

### 6.1 WeatherBit API Integration

```
API Server                    WeatherBit API            MongoDB (weather_cache)
    |                           |                        |
    |  GET /v2.0/forecast       |                        |
    |  ?lat=X&lon=Y             |                        |
    |  [T2 GPS coordinates]     |                        |
    |-------------------------->|                        |
    |                           |                        |
    |  Weather data response    |                        |
    |  [T3-INTERNAL]            |                        |
    |<--------------------------|                        |
    |                           |                        |
    |  Cache weather data       |                        |
    |  [T3-INTERNAL]            |                        |
    |----------------------------------------------->|
    |                           |                        |

SECURITY NOTES:
- Farm GPS coordinates (T2) are sent to external WeatherBit API
- API key transmitted via query parameter (should be header)
- Weather data cached locally to minimize external calls
! GPS coordinates reveal farm locations to third party
```

### 6.2 Google Vertex AI Integration

```
API Server                    Vertex AI (Google Cloud)
    |                           |
    |  Prediction request       |
    |  {farm metrics, yields,   |
    |   weather data}           |
    |  [T3-INTERNAL]            |
    |-------------------------->|
    |                           |
    |  AI prediction response   |
    |  [T3-INTERNAL]            |
    |<--------------------------|

SECURITY NOTES:
- Service account credentials stored as JSON file
- Farm operational data (T3) sent to Google Cloud
- No PII should be included in AI queries
! Verify no PII leaks into AI training data
```

---

## 7. Data at Rest Summary

### 7.1 MongoDB Collections - Data Classification Map

```
+------------------------------------------------------------------+
|                        MongoDB (a64core_db)                       |
+------------------------------------------------------------------+
|                                                                    |
|  T1 - RESTRICTED (encrypted storage required)                     |
|  +------------------------------------------------------------+  |
|  | users.passwordHash     | Bcrypt hashed passwords            |  |
|  | refresh_tokens.token   | JWT refresh tokens                 |  |
|  | verification_tokens    | Email/password reset tokens        |  |
|  | employees.emiratesId   | UAE government ID [!NOT ENCRYPTED] |  |
|  | contracts.salary       | Compensation data [!NOT ENCRYPTED] |  |
|  | contracts.benefits     | Benefits details [!NOT ENCRYPTED]  |  |
|  | insurance.coverage     | Coverage amounts [!NOT ENCRYPTED]  |  |
|  | installed_modules      | Fernet-encrypted license keys      |  |
|  +------------------------------------------------------------+  |
|                                                                    |
|  T2 - CONFIDENTIAL (access-controlled)                            |
|  +------------------------------------------------------------+  |
|  | users (email, names, phone)                                 |  |
|  | employees (names, email, phone, gender, nationality...)     |  |
|  | customers (name, email, phone, address)                     |  |
|  | sales_orders (customerName, shippingAddress, amounts)       |  |
|  | return_orders (customerName, refundAmount)                  |  |
|  | purchase_orders (amounts, pricing)                          |  |
|  | vehicles (licensePlate, costs)                              |  |
|  | routes (GPS coordinates, addresses)                         |  |
|  | shipments (driverId, totalCost)                             |  |
|  | farms (owner, managerEmail, location, boundary)             |  |
|  | block_alerts (user emails, comments)                        |  |
|  | performance_reviews (ratings, goals, personal notes)        |  |
|  | visas (visaType, dates, documents)                          |  |
|  | module_audit_log (user_email, ip_address)                   |  |
|  +------------------------------------------------------------+  |
|                                                                    |
|  T3 - INTERNAL (standard access)                                  |
|  +------------------------------------------------------------+  |
|  | stock_inventory (quantities, grades)                        |  |
|  | block_cycles (yields, metrics)                              |  |
|  | farm_tasks (types, statuses)                                |  |
|  | system_config (platform settings)                           |  |
|  | weather_cache (weather data)                                |  |
|  | port_registry (allocated ports)                             |  |
|  +------------------------------------------------------------+  |
|                                                                    |
|  T4 - PUBLIC (reference data)                                     |
|  +------------------------------------------------------------+  |
|  | plant_data (general agricultural reference)                 |  |
|  +------------------------------------------------------------+  |
|                                                                    |
+------------------------------------------------------------------+
```

### 7.2 Redis - Data Classification Map

```
+------------------------------------------------------------------+
|                          Redis 7                                  |
+------------------------------------------------------------------+
|                                                                    |
|  T1 - RESTRICTED                                                  |
|  +------------------------------------------------------------+  |
|  | (none currently - tokens stored in MongoDB)                 |  |
|  +------------------------------------------------------------+  |
|                                                                    |
|  T2 - CONFIDENTIAL                                                |
|  +------------------------------------------------------------+  |
|  | login_attempts:{email} - Failed login tracking per user     |  |
|  +------------------------------------------------------------+  |
|                                                                    |
|  T3 - INTERNAL                                                    |
|  +------------------------------------------------------------+  |
|  | rate_limit:{client_id}:{window} - API rate limit counters   |  |
|  | weather cache entries (if cached in Redis)                  |  |
|  +------------------------------------------------------------+  |
|                                                                    |
+------------------------------------------------------------------+
```

---

## 8. Data in Transit Summary

| Source | Destination | Protocol | Classification | Encrypted |
|--------|------------|----------|----------------|-----------|
| Browser | Nginx | HTTPS (TLS 1.2+) | T1-T2 | YES |
| Nginx | API | HTTP (internal) | T1-T2 | NO (same host) |
| API | MongoDB | TCP (internal) | T1-T2 | NO (same network) |
| API | Redis | TCP (internal) | T2-T3 | NO (password auth) |
| API | WeatherBit | HTTPS | T2-T3 | YES |
| API | Vertex AI | HTTPS (gRPC) | T3 | YES |
| API | Docker Socket | Unix socket | T1-T3 | NO (local) |
| Cron | API | HTTP (internal) | T1 (credentials) | NO (same network) |
| Backup | MongoDB | TCP (internal) | T1-T2 | NO (same network) |

### 8.1 Security Gaps in Transit

| Gap | Risk | Remediation |
|-----|------|-------------|
| Nginx -> API is unencrypted HTTP | Low (same host/Docker network) | Consider mTLS for zero-trust |
| API -> MongoDB unencrypted | Medium (Docker network) | Enable MongoDB TLS |
| API -> Redis unencrypted | Medium (Docker network) | Enable Redis TLS |
| Cron sends credentials over HTTP | Medium (internal) | Use service accounts with limited scope |
| Backup reads full DB unencrypted | Medium (internal) | Encrypt backup output (gzip + GPG) |
| Farm GPS sent to WeatherBit | Medium (data exposure) | Consider approximate coordinates |

---

## 9. Data Lifecycle

### 9.1 Data Creation Points

| Data Type | Entry Point | Validation | Classification at Entry |
|-----------|-------------|-----------|------------------------|
| User credentials | `/auth/register` | Email format, password complexity | T1 (password -> hash) |
| Employee data | HR module endpoints | Emirates ID format (15 digits) | T1 (emiratesId, salary) |
| Customer data | CRM module endpoints | Email format, phone format | T2 |
| Sales orders | Sales module endpoints | Item availability, pricing | T2 |
| Farm data | Farm module endpoints | GPS coordinate ranges | T2 (location) |
| Plant data | Farm module endpoints | Growth parameters | T4 (reference data) |

### 9.2 Recommended Retention Policy

| Data Type | Active Retention | Archive Period | Disposal Method |
|-----------|-----------------|----------------|-----------------|
| User accounts | While active | 2 years after deactivation | Cryptographic erasure |
| Employee records | During employment | 7 years (UAE labor law) | Secure deletion |
| Financial records | Current fiscal year | 5 years (accounting law) | Secure deletion |
| Customer data | While active | 2 years after last activity | Standard deletion with consent |
| Farm operational | Current season | 5 years (agricultural records) | Standard deletion |
| Audit logs | 1 year hot storage | 7 years cold storage | Immutable; age-off only |
| JWT tokens | Until expiry | None (auto-expire) | TTL-based |
| Backup archives | Per retention policy | Daily:7d, Weekly:4w, Monthly:3m | Secure deletion |

---

## 10. Document History

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2026-02-04 | 1.0 | [Author] | Initial data flow diagrams created |

---

## 11. Document Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Data Protection Officer | | | |
| Platform Owner | | | |
| IT Security | | | |
