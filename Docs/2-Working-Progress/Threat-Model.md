# Threat Model - A64 Core Platform

**Document Status:** TEMPLATE - Requires organizational review and approval
**Last Updated:** 2026-02-05
**Methodology:** STRIDE + Attack Tree Analysis
**Owner:** [Assign responsible person]
**Review Cycle:** Quarterly or after significant architecture changes

---

## 1. System Overview

The A64 Core Platform is a containerized agricultural management system deployed on a single Azure VM (Ubuntu 22.04) in the UAE region (me-central-1). It consists of:

- **FastAPI Backend** - REST API serving all business logic
- **React Frontend** - Single-page application (User Portal)
- **MongoDB 7.0** - Primary data store
- **Redis 7** - Cache and rate limiting
- **Nginx 1.25** - Reverse proxy with TLS termination
- **Docker** - Container orchestration
- **Cron Service** - Scheduled tasks
- **Backup Service** - Automated MongoDB backups

### 1.1 Trust Boundaries

```
INTERNET (Untrusted)
    |
    | TLS 1.2+ (Port 443)
    |
+---v-------------------------------------------+
| BOUNDARY 1: Nginx (TLS Termination)           |
|   - SSL/TLS offloading                        |
|   - Security headers injection                |
|   - Rate limiting (connection level)          |
+---+-------------------------------------------+
    |
    | HTTP (Port 8000, internal Docker network)
    |
+---v-------------------------------------------+
| BOUNDARY 2: FastAPI Application               |
|   - JWT authentication                        |
|   - RBAC authorization                        |
|   - Input validation (Pydantic)               |
|   - Application-level rate limiting           |
+---+-------------------------------------------+
    |
    | TCP (internal Docker network)
    |
+---v-------------------------------------------+
| BOUNDARY 3: Data Layer                        |
|   - MongoDB (auth enabled in prod)            |
|   - Redis (password auth)                     |
|   - Docker Socket (root access)               |
+-----------------------------------------------+
```

---

## 2. STRIDE Threat Analysis

### 2.1 Spoofing (Identity)

| ID | Threat | Attack Vector | Affected Component | Risk | Mitigation Status |
|----|--------|--------------|-------------------|------|-------------------|
| S1 | Credential theft via brute force | Repeated login attempts | `/auth/login` | HIGH | MITIGATED - Redis rate limiting (5 attempts, 15-min lockout) |
| S2 | JWT token theft via XSS | Injected script reads localStorage | Frontend | HIGH | PARTIAL - CSP headers set; tokens in localStorage (not httpOnly cookies) |
| S3 | Session hijacking | Stolen refresh token reuse | Auth service | MEDIUM | MITIGATED - Rotating refresh tokens, revocation on logout |
| S4 | Admin impersonation | Compromised admin credentials | All admin endpoints | CRITICAL | PARTIAL - No MFA; password complexity enforced |
| S5 | Service spoofing on Docker network | Rogue container on bridge network | API <-> MongoDB | LOW | PARTIAL - Docker bridge network isolation |
| S6 | Cron service credential abuse | Cron has admin credentials | API via cron | MEDIUM | PARTIAL - Credentials in env vars, no service accounts |

### 2.2 Tampering (Integrity)

| ID | Threat | Attack Vector | Affected Component | Risk | Mitigation Status |
|----|--------|--------------|-------------------|------|-------------------|
| T1 | Database injection | Malformed API inputs | MongoDB queries | LOW | MITIGATED - Pydantic validation, Motor/PyMongo parameterized queries |
| T2 | Container image tampering | Compromised Docker registry | Module management | MEDIUM | PARTIAL - Trusted registries whitelist; no image signing |
| T3 | Backup tampering | Modify backup files on disk | Backup volume | MEDIUM | MITIGATED - Encrypted backups (AES-256-CBC) in production |
| T4 | Log tampering | Delete/modify audit logs | MongoDB audit collection | MEDIUM | PARTIAL - Audit logs exist but no immutability enforcement |
| T5 | Configuration tampering | Edit docker-compose on server | All services | HIGH | PARTIAL - SSH key auth; no file integrity monitoring |
| T6 | API response manipulation | MITM on internal HTTP | Nginx <-> API | LOW | NOT MITIGATED - Internal traffic unencrypted (same host) |

### 2.3 Repudiation (Non-repudiation)

| ID | Threat | Attack Vector | Affected Component | Risk | Mitigation Status |
|----|--------|--------------|-------------------|------|-------------------|
| R1 | User denies actions | No action audit trail per user | All endpoints | MEDIUM | PARTIAL - Module audit log exists; no general user activity log |
| R2 | Admin denies changes | No admin action logging | Admin endpoints | HIGH | PARTIAL - Module operations logged; other admin actions not tracked |
| R3 | Data modification without trail | Direct DB modification | MongoDB | HIGH | NOT MITIGATED - No change data capture or DB audit logging |

### 2.4 Information Disclosure

| ID | Threat | Attack Vector | Affected Component | Risk | Mitigation Status |
|----|--------|--------------|-------------------|------|-------------------|
| I1 | PII exposure via API | Over-fetching in API responses | All data endpoints | MEDIUM | PARTIAL - Passwords excluded; other PII returned in full |
| I2 | Emirates ID exposure | Unauthorized access to HR data | Employee endpoints | CRITICAL | NOT MITIGATED - No field-level encryption; RBAC not granular enough |
| I3 | Salary data exposure | Unauthorized access to contracts | Contract endpoints | HIGH | NOT MITIGATED - No field-level encryption |
| I4 | Error message leakage | Detailed stack traces in responses | All endpoints | LOW | PARTIAL - FastAPI default error handling; DEBUG=False in prod |
| I5 | Database port exposure | Direct MongoDB/Redis connection | Ports 27017, 6379 | HIGH | MITIGATED - Ports closed in production docker-compose |
| I6 | GPS coordinate exposure | Location data sent to WeatherBit | Weather integration | MEDIUM | NOT MITIGATED - Exact coordinates sent to third party |
| I7 | Backup data exposure | Unencrypted backups on disk | Backup volume | HIGH | MITIGATED - Encrypted backups in production |
| I8 | Docker socket access | Container escape via Docker socket | API container | CRITICAL | NOT MITIGATED - API runs as root with Docker socket mounted |

### 2.5 Denial of Service

| ID | Threat | Attack Vector | Affected Component | Risk | Mitigation Status |
|----|--------|--------------|-------------------|------|-------------------|
| D1 | API flooding | High volume of API requests | All endpoints | HIGH | PARTIAL - Application-level rate limiting; no WAF/CDN |
| D2 | Login lockout abuse | Trigger lockout for legitimate users | `/auth/login` | MEDIUM | ACCEPTED - Rate limit is per-email (attacker can lock out known emails) |
| D3 | Large file upload | Upload large files to exhaust disk | File upload endpoints | MEDIUM | MITIGATED - client_max_body_size 20M in prod Nginx |
| D4 | MongoDB connection exhaustion | Many concurrent connections | MongoDB | MEDIUM | PARTIAL - Connection pooling via Motor; no connection limits configured |
| D5 | Single instance failure | Server crash or hardware failure | Entire platform | CRITICAL | NOT MITIGATED - Single instance, no failover, no load balancer |
| D6 | Redis memory exhaustion | Flood rate limit keys | Redis | LOW | MITIGATED - TTL on all Redis keys; maxmemory policy recommended |

### 2.6 Elevation of Privilege

| ID | Threat | Attack Vector | Affected Component | Risk | Mitigation Status |
|----|--------|--------------|-------------------|------|-------------------|
| E1 | Role escalation | Modify own role via API | User management | LOW | MITIGATED - Role changes restricted to ADMIN+ via middleware |
| E2 | Container escape | Exploit Docker socket | API container | CRITICAL | NOT MITIGATED - API has Docker socket access as root |
| E3 | JWT claims manipulation | Forge or modify JWT payload | Auth service | LOW | MITIGATED - HS256 signature verification; SECRET_KEY required in prod |
| E4 | Cross-tenant data access | Access other farm's data | Farm endpoints | MEDIUM | PARTIAL - Farm data filtered by managerId; no strict tenant isolation |
| E5 | Module privilege escalation | Malicious module gains host access | Module management | HIGH | PARTIAL - Resource limits enforced; network isolation via Docker |

---

## 3. Attack Trees

### 3.1 Compromise User Account

```
Goal: Gain unauthorized access to user account
├── Brute force password [MITIGATED - rate limiting]
│   └── Bypass rate limiting
│       ├── Use multiple IPs [PARTIAL - rate limit is per-email not per-IP]
│       └── Slow attack below threshold [ACCEPTED - low risk]
├── Steal JWT token
│   ├── XSS attack to read localStorage [PARTIAL - CSP headers]
│   ├── Network sniffing [MITIGATED - TLS]
│   └── Token leakage in logs [MITIGATED - tokens not logged]
├── Password reset abuse
│   ├── Email enumeration [MITIGATED - constant response]
│   └── Intercept reset email [EXTERNAL - email provider security]
└── Social engineering [OUT OF SCOPE - organizational control]
```

### 3.2 Exfiltrate Sensitive Data

```
Goal: Extract PII or financial data
├── API exploitation
│   ├── IDOR on user endpoints [PARTIAL - UUID-based, RBAC]
│   ├── Mass data export via pagination [NOT MITIGATED - no export limits]
│   └── GraphQL/query abuse [N/A - REST only]
├── Database access
│   ├── Direct connection to MongoDB [MITIGATED - ports closed in prod]
│   ├── SQL/NoSQL injection [MITIGATED - Pydantic + parameterized queries]
│   └── Backup file access [MITIGATED - encrypted backups]
├── Container escape
│   ├── Docker socket exploitation [NOT MITIGATED - socket mounted]
│   └── Kernel exploit [LOW - Ubuntu LTS with updates]
└── Insider threat
    ├── Admin dumps database [PARTIAL - audit log exists]
    └── Developer accesses prod [PARTIAL - SSH key required]
```

---

## 4. Risk Matrix

| Risk Level | Count | Examples |
|-----------|-------|---------|
| **CRITICAL** | 4 | Docker socket as root (E2, I8), No MFA for admin (S4), Single instance (D5) |
| **HIGH** | 7 | No field-level encryption (I2, I3), No WAF (D1), JWT in localStorage (S2), No file integrity (T5), No admin audit (R2), Module privilege (E5) |
| **MEDIUM** | 10 | Internal traffic unencrypted (T6), GPS exposure (I6), Login lockout abuse (D2), Cross-tenant (E4), etc. |
| **LOW** | 5 | NoSQL injection (T1), Error leakage (I4), JWT forgery (E3), etc. |

---

## 5. Prioritized Remediation

### 5.1 Critical (Address Immediately)

| ID | Threat | Remediation | Effort |
|----|--------|-------------|--------|
| E2/I8 | Docker socket as root | Create dedicated module-manager service with limited Docker API access; remove socket from API container | High |
| S4 | No MFA for admin | Implement TOTP-based MFA for ADMIN+ roles | Medium |
| D5 | Single instance | Deploy behind load balancer with health checks; plan multi-instance | High |

### 5.2 High (Address Within 30 Days)

| ID | Threat | Remediation | Effort |
|----|--------|-------------|--------|
| I2/I3 | No field-level encryption | Implement field-level encryption for emiratesId, salary using MongoDB CSFLE or application-level Fernet | Medium |
| D1 | No WAF | Deploy AWS WAF or Cloudflare in front of Nginx | Medium |
| S2 | JWT in localStorage | Migrate to httpOnly cookies with SameSite=Strict | Medium |
| R2/R3 | No comprehensive audit | Implement user activity logging middleware | Medium |
| T5 | No file integrity | Deploy AIDE or similar file integrity monitoring | Low |

### 5.3 Medium (Address Within 90 Days)

| ID | Threat | Remediation | Effort |
|----|--------|-------------|--------|
| I6 | GPS sent to third party | Truncate GPS coordinates to 2 decimal places for weather queries | Low |
| E4 | Cross-tenant access | Implement strict tenant isolation middleware | Medium |
| T6 | Internal traffic unencrypted | Enable mTLS between containers (zero-trust) | High |
| R1 | No user activity log | Add general API request logging with user context | Medium |

---

## 6. Document History

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2026-02-05 | 1.0 | [Author] | Initial threat model created |

---

## 7. Document Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Security Architect | | | |
| Platform Owner | | | |
| IT Security | | | |
