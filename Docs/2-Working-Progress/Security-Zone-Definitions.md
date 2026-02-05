# Security Zone Definitions

**Document Status:** TEMPLATE - Requires organizational review and approval
**Last Updated:** 2026-02-05
**Owner:** [Assign responsible person]
**Related Documents:** Threat-Model.md, System-Architecture.md, Data-Classification-Policy.md

---

## 1. Overview

This document defines the security zones for the A64 Core Platform deployment. Each zone has defined trust levels, access controls, and data classification boundaries.

---

## 2. Zone Architecture

```
+================================================================+
|                    ZONE 0: INTERNET (Untrusted)                |
|  Trust Level: NONE                                              |
|  Actors: Public users, bots, attackers                         |
|                                                                  |
|  Allowed inbound: HTTPS (443), HTTP (80 -> redirect to 443)    |
|  Allowed outbound: None                                         |
+==============================+===================================+
                               |
                    Port 443 (TLS 1.2+)
                    Port 80 (redirect only)
                               |
+==============================v===================================+
|                    ZONE 1: DMZ (Semi-Trusted)                   |
|  Trust Level: LOW                                                |
|  Purpose: TLS termination, static content, request filtering    |
|                                                                  |
|  Components:                                                     |
|  +------------------+   +------------------+                    |
|  |     Nginx        |   |   User Portal    |                    |
|  |  (Reverse Proxy) |   |   (Static SPA)   |                    |
|  |  Port 80/443     |   |   Port 8081      |                    |
|  +--------+---------+   +------------------+                    |
|           |                                                      |
|  Security Controls:                                              |
|  - TLS termination (Let's Encrypt)                              |
|  - Security headers (HSTS, CSP, Permissions-Policy)             |
|  - Connection rate limiting                                      |
|  - Request size limiting (20MB)                                  |
|  - X-Frame-Options / frame-ancestors: none                      |
|                                                                  |
|  Data Classification Allowed: T3 (INTERNAL), T4 (PUBLIC)       |
|  T1/T2 data passes through encrypted (TLS) but not stored      |
+==============================+===================================+
                               |
                    Port 8000 (HTTP, internal)
                               |
+==============================v===================================+
|                    ZONE 2: APPLICATION (Trusted)                |
|  Trust Level: MEDIUM                                             |
|  Purpose: Business logic, authentication, authorization         |
|                                                                  |
|  Components:                                                     |
|  +------------------+   +------------------+                    |
|  |   FastAPI API    |   |   Cron Service   |                    |
|  |   Port 8000      |   |   (Scheduled)    |                    |
|  +--------+---------+   +--------+---------+                    |
|           |                       |                              |
|  Security Controls:                                              |
|  - JWT authentication (HS256)                                    |
|  - RBAC (5-level: SuperAdmin > Admin > Mod > User > Guest)      |
|  - Pydantic input validation on all 43+ endpoints               |
|  - Redis-backed rate limiting (sliding window)                   |
|  - Login attempt tracking (5 max, 15-min lockout)               |
|  - Password complexity enforcement                               |
|  - SECRET_KEY fail-fast in production                            |
|                                                                  |
|  Data Classification Allowed: T1-T4 (processes all tiers)       |
|  T1 data: Passwords hashed (bcrypt), tokens signed (JWT)        |
|  T2 data: Validated, RBAC-controlled access                     |
+==============================+===================================+
                               |
                    TCP (internal Docker network)
                               |
+==============================v===================================+
|                    ZONE 3: DATA (Restricted)                    |
|  Trust Level: HIGH                                               |
|  Purpose: Data persistence, caching, secrets                    |
|                                                                  |
|  Components:                                                     |
|  +------------------+   +------------------+                    |
|  |   MongoDB 7.0    |   |   Redis 7        |                    |
|  |   Port 27017     |   |   Port 6379      |                    |
|  |   (internal)     |   |   (internal)     |                    |
|  +------------------+   +------------------+                    |
|                                                                  |
|  Security Controls:                                              |
|  - MongoDB authentication (--auth in production)                 |
|  - Dedicated application user (readWrite on a64core_db only)    |
|  - Separate root user for administration                         |
|  - Redis password authentication                                 |
|  - No external port exposure in production                       |
|  - Docker network isolation (bridge)                             |
|                                                                  |
|  Data Classification Stored: T1-T4                               |
|  T1: passwordHash, tokens, emiratesId, salary, license keys     |
|  T2: PII (names, emails, phones, addresses, GPS)                |
|  T3: Operational data (inventory, harvests, configs)             |
|  T4: Reference data (plant data)                                |
|                                                                  |
|  GAPS:                                                           |
|  ! No encryption at rest for MongoDB                            |
|  ! No field-level encryption for T1 fields                      |
|  ! No TLS for MongoDB/Redis internal connections                |
+==================================================================+

+==================================================================+
|                    ZONE 4: MANAGEMENT (Highly Restricted)        |
|  Trust Level: HIGHEST                                            |
|  Purpose: Infrastructure management, deployment                 |
|                                                                  |
|  Components:                                                     |
|  +------------------+   +------------------+                    |
|  |   Docker Engine  |   |   SSH Access      |                    |
|  |   (socket)       |   |   Port 22         |                    |
|  +------------------+   +------------------+                    |
|  +------------------+   +------------------+                    |
|  |   Local Registry |   |   Backup Service  |                    |
|  |   Port 5000      |   |   (Automated)     |                    |
|  |   (localhost)     |   |                  |                    |
|  +------------------+   +------------------+                    |
|                                                                  |
|  Security Controls:                                              |
|  - SSH key-based authentication only                             |
|  - AWS Security Group IP restriction                             |
|  - Docker registry localhost-only in production                  |
|  - Backup encryption (AES-256-CBC) in production                |
|  - Git-based deployment (no direct file editing on server)       |
|                                                                  |
|  Data Classification: T1 (management credentials, backups)       |
|                                                                  |
|  GAPS:                                                           |
|  ! No VPN for management access                                 |
|  ! Docker socket mounted in API container (cross-zone leak)     |
|  ! No bastion host                                              |
+==================================================================+
```

---

## 3. Zone Rules Matrix

### 3.1 Allowed Traffic Flows

| Source Zone | Destination Zone | Protocol | Ports | Purpose |
|------------|-----------------|----------|-------|---------|
| Zone 0 (Internet) | Zone 1 (DMZ) | HTTPS | 443 | User access |
| Zone 0 (Internet) | Zone 1 (DMZ) | HTTP | 80 | Redirect to HTTPS |
| Zone 1 (DMZ) | Zone 2 (Application) | HTTP | 8000 | API proxy |
| Zone 1 (DMZ) | Zone 2 (Application) | HTTP | 8081 | Frontend proxy |
| Zone 2 (Application) | Zone 3 (Data) | TCP | 27017 | MongoDB queries |
| Zone 2 (Application) | Zone 3 (Data) | TCP | 6379 | Redis cache |
| Zone 2 (Application) | Zone 0 (Internet) | HTTPS | 443 | External APIs (WeatherBit, Vertex AI) |
| Zone 2 (Application) | Zone 4 (Management) | Unix Socket | - | Docker module management |
| Zone 4 (Management) | Zone 3 (Data) | TCP | 27017 | Backup operations |
| Zone 4 (Management) | All Zones | SSH | 22 | Administration |

### 3.2 Denied Traffic Flows (Enforced)

| Source | Destination | Enforcement | Notes |
|--------|------------|-------------|-------|
| Zone 0 | Zone 2 | Nginx proxy | No direct API access from internet |
| Zone 0 | Zone 3 | Docker + Firewall | DB ports closed in production |
| Zone 0 | Zone 4 | AWS Security Group | SSH restricted to allowed IPs |
| Zone 1 | Zone 3 | Docker network | Nginx cannot reach DB directly |
| Zone 3 | Zone 0 | Docker network | Databases have no outbound internet |

### 3.3 Denied Traffic Flows (Should Be Enforced)

| Source | Destination | Current State | Recommended |
|--------|------------|---------------|-------------|
| Zone 2 (API) | Zone 4 (Docker socket) | ALLOWED (mounted) | Isolate into separate management service |
| Zone 0 | Zone 3 (dev) | ALLOWED (ports exposed) | Already fixed in production |
| Zone 2 (Cron) | Zone 2 (API) | HTTP with credentials | Use service accounts with limited scope |

---

## 4. Data Classification Boundaries

### 4.1 Data Movement Between Zones

| Data Type | Origin Zone | Allowed Zones | Encryption Required |
|-----------|------------|---------------|-------------------|
| User credentials (T1) | Zone 0 | Zone 1 (transit) -> Zone 2 (hashed) -> Zone 3 (stored) | TLS in transit, bcrypt at rest |
| JWT tokens (T1) | Zone 2 | Zone 1 (transit) -> Zone 0 (client storage) | TLS in transit |
| Emirates ID (T1) | Zone 0 | Zone 1 (transit) -> Zone 2 (processed) -> Zone 3 (stored) | TLS in transit, **field encryption needed** |
| Salary data (T1) | Zone 0 | Zone 2 (processed) -> Zone 3 (stored) | TLS in transit, **field encryption needed** |
| PII - names, emails (T2) | Zone 0 | All zones (transit/processing/storage) | TLS in transit |
| Financial data (T2) | Zone 0 | Zone 2 (processed) -> Zone 3 (stored) | TLS in transit |
| Operational data (T3) | Zone 2 | Zone 2 (processed) -> Zone 3 (stored) | None required |
| Backup data (T1-T2) | Zone 3 | Zone 4 (stored) | AES-256-CBC encryption |

### 4.2 Data at Rest per Zone

| Zone | Stored Data | Classification | Encryption |
|------|------------|----------------|-----------|
| Zone 0 (Client) | JWT tokens, UI state | T1, T3 | Browser security |
| Zone 1 (DMZ) | Access logs, SSL certs | T3 | Log rotation |
| Zone 2 (App) | Application logs, temp files | T2-T3 | None |
| Zone 3 (Data) | All persistent data | T1-T4 | Auth only (no encryption at rest) |
| Zone 4 (Mgmt) | Backups, deployment config | T1-T2 | Encrypted backups in prod |

---

## 5. Compliance Mapping

| Zone | Controls Applied | Gaps |
|------|-----------------|------|
| Zone 1 (DMZ) | Control 2 (TLS), Control 8 (headers), Control 15 (partial) | No WAF, no bot detection |
| Zone 2 (Application) | Control 10 (auth), Control 8 (validation), Control 23 (RBAC) | No MFA, no activity logging |
| Zone 3 (Data) | Control 9 (DB auth), Control 6 (backups) | No encryption at rest, no replica set |
| Zone 4 (Management) | Control 12 (SSH), Control 6 (encrypted backups) | No VPN, no bastion host |

---

## 6. Remediation Priorities

| Priority | Action | Zones Affected | Impact |
|----------|--------|---------------|--------|
| 1 | Remove Docker socket from API container | Zone 2 -> Zone 4 | Eliminates cross-zone privilege escalation |
| 2 | Enable MongoDB TLS | Zone 2 <-> Zone 3 | Encrypts internal data transit |
| 3 | Implement field-level encryption | Zone 3 | Protects T1 data at rest |
| 4 | Deploy WAF | Zone 0 -> Zone 1 | Adds application-layer filtering |
| 5 | Add VPN for management | Zone 0 -> Zone 4 | Secures management access |
| 6 | Implement MongoDB replica set | Zone 3 | Adds data layer redundancy |

---

## 7. Document History

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2026-02-05 | 1.0 | [Author] | Initial security zone definitions |

---

## 8. Document Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Security Architect | | | |
| Network Engineer | | | |
| Platform Owner | | | |
