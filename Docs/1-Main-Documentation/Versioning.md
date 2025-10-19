# Versioning Documentation

## Overview
This document serves as the central source of truth for all version information across the A64 Core Platform. **ALWAYS check and update this file when releasing new versions or making version-related changes.**

## Table of Contents
- [Versioning Strategy](#versioning-strategy)
- [Current Versions](#current-versions)
- [Version History](#version-history)
- [Subsystem Compatibility Matrix](#subsystem-compatibility-matrix)
- [Release Process](#release-process)
- [Deprecation Policy](#deprecation-policy)

## Versioning Strategy

### Semantic Versioning (SemVer)
We follow [Semantic Versioning 2.0.0](https://semver.org/) for all components:

**Format:** MAJOR.MINOR.PATCH (e.g., 1.4.2)

- **MAJOR** version: Incompatible API changes or breaking changes
- **MINOR** version: New functionality added in a backward-compatible manner
- **PATCH** version: Backward-compatible bug fixes

**Examples:**
- `1.0.0` → `1.0.1` : Bug fix (PATCH)
- `1.0.1` → `1.1.0` : New feature, backward compatible (MINOR)
- `1.1.0` → `2.0.0` : Breaking change (MAJOR)

### Pre-release Versions
For development and testing phases:

- **Alpha:** `1.0.0-alpha.1` - Internal testing, unstable
- **Beta:** `1.0.0-beta.1` - External testing, feature complete
- **Release Candidate:** `1.0.0-rc.1` - Final testing before release

### Build Metadata
Optional build information: `1.0.0+20251016` or `1.0.0+build.123`

## Current Versions

**Last Updated:** 2025-10-17

### Platform Version
**A64 Core Platform:** `1.3.0`

### API Versions
| API Component | Version | Status | Supported Until |
|---------------|---------|--------|-----------------|
| API Hub (FastAPI) | 1.3.0 | Active | - |
| API v1 Endpoints | 1.3.0 | Active | - |
| Module Management System | 1.3.0 | Active | - |

### Database Versions
| Database | Version | Schema Version | Notes |
|----------|---------|----------------|-------|
| MongoDB | 7.0 | N/A | Document-based (no schema version) |
| MySQL | 8.0 | N/A | Schema migrations TBD |

### Infrastructure Versions
| Component | Version | Notes |
|-----------|---------|-------|
| Docker | 20.10+ | Required minimum |
| Docker Compose | 2.0+ | Required minimum |
| Python | 3.11 | Runtime version |
| Redis | 7.0 | Module management caching |
| NGINX | 1.25 | Reverse proxy |
| Node.js | TBD | Future implementation |

### Service Versions
| Service | Version | Status | Dependencies |
|---------|---------|--------|--------------|
| API Hub | 1.3.0 | Active | Python 3.11, FastAPI 0.109.0 |
| Module Management | 1.3.0 | Active | Docker SDK 7.0.0, Redis 5.0.1 |
| Web UI | TBD | Planned | Node.js (TBD) |
| Embedded Systems Interface | TBD | Planned | Python 3.11 |

### Docker Images
| Image | Tag | Build Date | Size |
|-------|-----|------------|------|
| a64core/api | 1.3.0 | 2025-10-17 | TBD |
| a64core/api | latest | 2025-10-17 | TBD |

## Version History

### Platform Version History

#### v1.3.0 - 2025-10-17 (Current)
**Type:** Minor Release - Module Management System

**Added:**
- **Module Management System** - Docker Compose-based modular architecture
- 6 module management API endpoints (install, list, status, uninstall, audit log, health)
- License key validation with 3 modes (format, offline, online)
- License key encryption (Fernet + PBKDF2HMAC with 100k iterations)
- Container security sandboxing (no privileges, resource limits, non-root user)
- Docker image validation (trusted registries only, no 'latest' tags)
- Module limits enforcement (50 total, 10 per user)
- Comprehensive audit logging with 90-day TTL
- Runtime metrics collection (CPU, memory, network)
- Module lifecycle management (6 states)
- Health monitoring (3 states)
- RBAC enforcement (super_admin only)
- MongoDB indexes for module collections
- Redis integration for caching
- NGINX reverse proxy integration
- Docker socket mounting for container management

**New Services:**
- `redis` - Redis 7 for caching & rate limiting
- `nginx` - NGINX 1.25 for reverse proxy

**New Collections (MongoDB):**
- `installed_modules` - Module metadata & state
- `module_audit_log` - Audit trail (90-day TTL)

**New Models:**
- 10 Module Pydantic models with validation

**New Services (Code):**
- ModuleManager service (5 core methods)
- Encryption utility (Fernet with PBKDF2)
- License validator utility (3 validation modes)

**Dependencies Added:**
- docker 7.0.0 - Docker SDK for Python
- PyYAML 6.0.1 - docker-compose.yml manipulation
- redis 5.0.1 - Redis client
- cryptography 41.0.7 - License encryption
- jsonschema 4.20.0 - Module config validation

**Documentation:**
- Updated API-Structure.md with module endpoints
- Updated System-Architecture.md with module system
- Updated Versioning.md (this document)
- Created Modular-System-Implementation-Plan.md
- Created Security-Risk-Mitigation-Plan.md

**Security:**
- Docker socket access (CRITICAL risk, mitigated by RBAC & sandboxing)
- Container sandboxing (no privileges, capabilities dropped)
- License key encryption (Fernet symmetric encryption)
- Trusted registry validation
- Audit logging (immutable trail)

---

#### v1.2.0 - 2025-10-17
**Type:** Minor Release - Admin User Management

**Added:**
- Admin User Management System
- 5 admin endpoints for user management
- Super admin role and permissions
- Admin web interface at /admin/
- Role-based authorization (super_admin and admin)
- User filtering and search capabilities
- Pagination support (default 20, max 100 per page)
- Soft delete functionality (90-day retention)
- Self-modification prevention
- Super admin protection

**Infrastructure:**
- Admin web interface (HTML/JS single-page app)
- Public file serving from /app/public/

---

#### v1.1.0 - 2025-10-16
**Type:** Minor Release - Authentication System

**Added:**
- Complete authentication system (JWT-based)
- Email verification with JWT tokens (24hr expiry)
- Password reset flow with JWT tokens (1hr expiry)
- Login rate limiting (5 attempts, 15min lockout)
- Role-based rate limiting (5 roles with different limits)
- Rotating refresh tokens (one-time use)
- 9 authentication endpoints
- Database indexes with TTL for automatic token cleanup

**Security:**
- bcrypt password hashing (cost factor 12)
- JWT token signing (HS256)
- Refresh token rotation
- Token revocation on logout/password reset

---

#### v1.0.0 - 2025-10-16
**Type:** Initial Release

**Added:**
- FastAPI-based API Hub
- Health check and readiness endpoints
- Docker containerization with Docker Compose
- MongoDB and MySQL database integration
- Comprehensive documentation structure
- API standards and development guidelines
- Automated health monitoring support

**Infrastructure:**
- Docker support
- Development and production configurations
- Environment-based configuration management

**Documentation:**
- README.md with complete setup instructions
- DEPLOYMENT.md with production deployment guide
- API-Structure.md for endpoint documentation
- Versioning.md (this document)
- Development guidelines in CLAUDE.md

**Dependencies:**
- Python 3.11
- FastAPI 0.109.0
- MongoDB 7.0
- MySQL 8.0
- See requirements.txt for complete list

---

### API Version History

#### API v1.0.0 - 2025-10-16 (Current)
**Endpoints:**
- `GET /` - Root endpoint
- `GET /api/health` - Health check
- `GET /api/ready` - Readiness check
- `GET /api/docs` - Swagger documentation
- `GET /api/redoc` - ReDoc documentation

**Status:** Active, Stable
**Breaking Changes:** None
**Deprecations:** None

---

### Future Versions (Planned)

#### v1.1.0 (Planned)
**Target Date:** TBD

**Planned Features:**
- User authentication and authorization (JWT)
- User management endpoints
- Database connection managers
- Logging middleware
- Rate limiting
- Unit and integration tests

**API Changes:**
- `POST /api/v1/auth/login` - User login
- `POST /api/v1/auth/logout` - User logout
- `GET /api/v1/users/me` - Get current user
- `POST /api/v1/users` - Create user
- `PATCH /api/v1/users/{userId}` - Update user
- `DELETE /api/v1/users/{userId}` - Delete user

---

#### v1.2.0 (Planned)
**Target Date:** TBD

**Planned Features:**
- Node.js web frontend
- Embedded systems data ingestion
- Real-time data processing
- WebSocket support

---

#### v2.0.0 (Planned)
**Target Date:** TBD

**Potential Breaking Changes:**
- Major API restructure (if needed)
- Database schema migrations
- Authentication system overhaul

---

## Subsystem Compatibility Matrix

### Component Compatibility

| API Hub | MongoDB | MySQL | Python | Docker | Redis | NGINX | Status |
|---------|---------|-------|--------|--------|-------|-------|--------|
| 1.3.0 | 7.0 | 8.0 | 3.11 | 20.10+ | 7.0 | 1.25 | ✅ Compatible |
| 1.2.0 | 7.0 | 8.0 | 3.11 | 20.10+ | N/A | N/A | ✅ Compatible |
| 1.1.0 | 7.0 | 8.0 | 3.11 | 20.10+ | N/A | N/A | ✅ Compatible |
| 1.0.0 | 7.0 | 8.0 | 3.11 | 20.10+ | N/A | N/A | ✅ Compatible |

### API Version Compatibility

| Frontend Version | API Version | Compatible | Notes |
|------------------|-------------|------------|-------|
| TBD | v1 | ✅ | Future implementation |

### Database Schema Compatibility

| API Version | MongoDB Schema | MySQL Schema | Migration Required |
|-------------|----------------|--------------|-------------------|
| 1.0.0 | N/A | N/A | No |

## Release Process

### Version Number Assignment

**When to increment MAJOR (X.0.0):**
- Breaking API changes (endpoint removal, response format changes)
- Database schema breaking changes
- Removal of deprecated features
- Major architecture changes requiring migration

**When to increment MINOR (1.X.0):**
- New API endpoints added
- New features added (backward compatible)
- New optional parameters
- New database tables/collections (non-breaking)
- Deprecation warnings (but feature still works)

**When to increment PATCH (1.0.X):**
- Bug fixes
- Security patches
- Performance improvements
- Documentation updates
- Internal refactoring (no API changes)

### Release Checklist

**Pre-release:**
- [ ] Update version number in all relevant files
- [ ] Update CHANGELOG.md with all changes
- [ ] Update this Versioning.md document
- [ ] Update API-Structure.md if API changes
- [ ] Run all tests (unit, integration, e2e)
- [ ] Update README.md if user-facing changes
- [ ] Update DEPLOYMENT.md if deployment changes
- [ ] Review all documentation for accuracy

**Release:**
- [ ] Create git tag: `git tag -a v1.0.0 -m "Release version 1.0.0"`
- [ ] Build Docker images with version tag
- [ ] Push Docker images to registry
- [ ] Create GitHub release with changelog
- [ ] Update production deployment
- [ ] Verify production health checks

**Post-release:**
- [ ] Monitor logs for errors
- [ ] Update Docs/3-DevLog/ with release notes
- [ ] Announce release to stakeholders
- [ ] Archive old documentation versions

### Files to Update on Version Change

**Required:**
1. `Docs/1-Main-Documentation/Versioning.md` (this file)
2. `CHANGELOG.md` - Detailed change log
3. `src/main.py` - Application version constant
4. `docker-compose.yml` - Image tags
5. Git tags - Version tagging

**Conditional (if applicable):**
6. `README.md` - If user instructions change
7. `DEPLOYMENT.md` - If deployment process changes
8. `API-Structure.md` - If API endpoints change
9. `requirements.txt` - If dependencies change
10. `package.json` - Future Node.js components

## Deprecation Policy

### Deprecation Timeline
1. **Announcement:** Feature marked as deprecated in documentation
2. **Warning Period:** Minimum 6 months, feature still works with deprecation warnings
3. **Removal:** Feature removed in next MAJOR version

### Deprecation Process

**Step 1: Mark as Deprecated**
- Add `@deprecated` tag in code
- Update API documentation with deprecation notice
- Add deprecation warning to API response headers
- Document in API-Structure.md

**Step 2: Communication**
- Update CHANGELOG.md with deprecation notice
- Send notification to API consumers
- Update Versioning.md with deprecation date and removal plan

**Step 3: Provide Migration Path**
- Document replacement functionality
- Provide migration guide
- Update examples and tutorials

**Step 4: Monitor Usage**
- Log usage of deprecated features
- Track adoption of new features
- Extend deprecation period if needed

**Step 5: Removal**
- Remove in next MAJOR version
- Update all documentation
- Provide clear migration instructions in release notes

### Currently Deprecated Features
*None at this time*

### Planned Deprecations
*None at this time*

---

## Version Management Best Practices

### For Developers

1. **Always check this document before starting work**
   - Understand current version
   - Know compatibility requirements
   - Check for deprecations

2. **Update version numbers consistently**
   - Don't skip versions
   - Follow semantic versioning strictly
   - Update all necessary files

3. **Document all changes**
   - Update CHANGELOG.md
   - Update API-Structure.md for API changes
   - Update this Versioning.md

4. **Test across compatible versions**
   - Test database compatibility
   - Test API compatibility
   - Test deployment process

5. **Communicate breaking changes**
   - Provide advance notice
   - Document migration path
   - Support transition period

### For Releases

1. **Never release without updating documentation**
2. **Always create git tags for releases**
3. **Always test in staging before production**
4. **Always have rollback plan ready**
5. **Always monitor post-release metrics**

---

## Version Numbering Examples

### Good Version Progression
```
1.0.0 → 1.0.1 (bug fix)
1.0.1 → 1.1.0 (new feature)
1.1.0 → 1.1.1 (bug fix)
1.1.1 → 2.0.0 (breaking change)
```

### Bad Version Progression
```
1.0.0 → 1.0.2 (skipping 1.0.1) ❌
1.0.0 → 1.5.0 (skipping too many minors) ❌
1.0.0 → 3.0.0 (skipping major versions) ❌
```

---

## Contact Information

**Version Control Lead:** [Contact Info]
**Release Manager:** [Contact Info]
**Technical Lead:** [Contact Info]

---

## References

- [Semantic Versioning Specification](https://semver.org/)
- [Keep a Changelog](https://keepachangelog.com/)
- [API-Structure.md](./API-Structure.md) - API versioning details
- [CHANGELOG.md](../../CHANGELOG.md) - Detailed change history
