# Security Checklist - A64 Core Platform

**Last Updated:** 2026-01-31
**Status:** In Development
**Overall Rating:** 7/10 (Good with improvements needed)

---

## Pre-Production Checklist

### Critical (Must Fix Before Production)

- [ ] **SECRET_KEY** - Set strong random key via environment variable
  - Location: `src/config/settings.py:45`
  - Current: Hardcoded default `"dev_secret_key_change_in_production"`
  - Action: Set `SECRET_KEY` env var with 64+ character random string

- [ ] **DEBUG Mode** - Disable in production
  - Location: `src/config/settings.py:22`
  - Current: `DEBUG: bool = True`
  - Action: Set `DEBUG=False` in production environment

- [ ] **npm Vulnerabilities** - Fix before deployment
  - Count: 14 vulnerabilities (4 high, 10 moderate)
  - Action: Run `cd frontend/user-portal && npm audit fix`

### Medium Priority (Should Fix)

- [ ] **HSTS Header** - Add Strict-Transport-Security
  - Location: `nginx/nginx.prod.conf`
  - Action: Add `add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;`

- [ ] **Content-Security-Policy** - Add CSP header
  - Location: `nginx/nginx.prod.conf`
  - Action: Define and add appropriate CSP rules

- [ ] **CORS Restriction** - Limit allowed methods/headers
  - Location: `src/main.py:44-50`
  - Current: `allow_methods=["*"]`, `allow_headers=["*"]`
  - Action: Specify only needed methods `["GET", "POST", "PATCH", "DELETE", "OPTIONS"]`

- [ ] **File Upload Limits** - Add size restrictions
  - Location: `src/modules/farm_manager/api/v1/plant_data.py`
  - Action: Add max file size validation (e.g., 5MB)

### Low Priority (Nice to Have)

- [ ] **Redis Rate Limiting** - For multi-server deployment
  - Location: `src/middleware/rate_limit.py`
  - Current: In-memory (works for single server)
  - Action: Implement Redis-based rate limiter when scaling

- [ ] **Permissions-Policy Header** - Restrict browser features
  - Location: `nginx/nginx.prod.conf`
  - Action: Add `add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;`

---

## Can Fix Now (Development Phase)

### 1. npm Audit Fix (Safe to do now)
```bash
cd frontend/user-portal
npm audit fix
```

### 2. CORS Methods Restriction (Safe to do now)
Restrict to specific methods instead of wildcard.

### 3. Add Production Validation (Safe to do now)
Add startup check to warn about insecure defaults.

---

## Already Implemented (Good Practices)

- [x] bcrypt password hashing (cost factor 12)
- [x] Strong password validation requirements
- [x] JWT with rotating refresh tokens
- [x] Login brute force protection (5 attempts, 15 min lockout)
- [x] API rate limiting by user role
- [x] Pydantic input validation
- [x] Basic nginx security headers (X-Frame-Options, X-XSS-Protection, etc.)
- [x] TLS 1.2/1.3 only
- [x] No email enumeration on login/reset
- [x] Token revocation on password reset

---

## OWASP Top 10 Status

| # | Category | Status | Action Needed |
|---|----------|--------|---------------|
| A01 | Broken Access Control | ✅ Done | - |
| A02 | Cryptographic Failures | ⚠️ | Fix SECRET_KEY |
| A03 | Injection | ✅ Done | - |
| A04 | Insecure Design | ✅ Done | - |
| A05 | Security Misconfiguration | ⚠️ | Fix DEBUG, headers |
| A06 | Vulnerable Components | ⚠️ | npm audit fix |
| A07 | Auth & Session Failures | ✅ Done | - |
| A08 | Data Integrity Failures | ✅ Done | - |
| A09 | Logging & Monitoring | ✅ Done | - |
| A10 | SSRF | ✅ Done | - |

---

## Notes

- Security assessment performed: 2026-01-31
- Next review: Before production deployment
- Reference: OWASP Top 10 2021
