# API Structure Documentation

## Overview
This document serves as the central registry for all API routes, endpoints, and their functionality in the A64 Core Platform. **ALWAYS check and update this file before creating or modifying API endpoints.**

## Table of Contents
- [API Versioning](#api-versioning)
- [Base URLs](#base-urls)
- [Authentication](#authentication)
- [API Endpoints](#api-endpoints)
  - [System/Health](#systemhealth)
  - [Authentication & Authorization](#authentication--authorization)
  - [Users](#users)
  - [Resources](#resources)
- [Response Standards](#response-standards)
- [Error Codes](#error-codes)

## API Versioning

Current API Version: **v1**

- Version format: `/api/v{version}`
- Current base path: `/api/v1`
- Unversioned routes: `/api` (system routes only)

### Version Strategy
- Major version increment (v1 → v2): Breaking changes
- Minor changes: Backward compatible, no version change
- Deprecation notice: 6 months before removing old version

## Base URLs

### Development
- Local: `http://localhost:8000`
- Docker: `http://localhost:8000`

### Production
- API: `https://api.yourdomain.com`
- Docs: `https://api.yourdomain.com/api/docs`

## Authentication

### Authentication Methods
1. **API Key** (for service-to-service)
   - Header: `X-API-Key: {api_key}`
   - Format: `{environment}_key_{random_string}`

2. **JWT Bearer Token** (for user authentication) - *To be implemented*
   - Header: `Authorization: Bearer {token}`

3. **OAuth2** - *Future consideration*

## API Endpoints

### System/Health

#### Root Endpoint
```
GET /
```
**Purpose:** API information and available endpoints
**Authentication:** None
**Response:** 200 OK
```json
{
  "name": "A64 Core Platform API Hub",
  "version": "1.0.0",
  "status": "online",
  "docs": "/api/docs",
  "health": "/api/health"
}
```

---

#### Health Check
```
GET /api/health
```
**Purpose:** Check if API service is running
**Authentication:** None
**Response:** 200 OK
```json
{
  "status": "healthy",
  "timestamp": "2025-10-16T10:30:00.000Z",
  "service": "A64 Core Platform API Hub",
  "version": "1.0.0"
}
```

---

#### Readiness Check
```
GET /api/ready
```
**Purpose:** Check if API and dependencies are ready to accept requests
**Authentication:** None
**Response:** 200 OK
```json
{
  "ready": true,
  "timestamp": "2025-10-16T10:30:00.000Z",
  "checks": {
    "database": "not_configured",
    "cache": "not_configured"
  }
}
```

---

### Authentication & Authorization
**Status:** ✅ **IMPLEMENTED**

#### Register
```
POST /api/v1/auth/register
```
**Purpose:** Register a new user (automatically sends verification email)
**Authentication:** None
**Rate Limit:** Guest (10 req/min)
**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+1234567890",
  "avatar": "https://example.com/avatar.jpg",
  "timezone": "America/New_York",
  "locale": "en"
}
```
**Response:** 201 Created
```json
{
  "userId": "uuid-here",
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "role": "user",
  "isActive": true,
  "isEmailVerified": false,
  "phone": "+1234567890",
  "avatar": "https://example.com/avatar.jpg",
  "timezone": "America/New_York",
  "locale": "en",
  "lastLoginAt": null,
  "createdAt": "2025-10-16T10:30:00.000Z",
  "updatedAt": "2025-10-16T10:30:00.000Z"
}
```
**Errors:**
- 409: Email already registered
- 422: Password validation failed

---

#### Login
```
POST /api/v1/auth/login
```
**Purpose:** User authentication (with login rate limiting)
**Authentication:** None
**Rate Limit:** Guest (10 req/min) + Login lockout (5 attempts, 15min)
**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```
**Response:** 200 OK
```json
{
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc...",
  "tokenType": "bearer",
  "expiresIn": 3600,
  "user": {
    "userId": "uuid-here",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "role": "user",
    "isActive": true,
    "isEmailVerified": true,
    "createdAt": "2025-10-16T10:30:00.000Z"
  }
}
```
**Errors:**
- 401: Invalid credentials
- 403: Account inactive
- 429: Too many failed login attempts

---

#### Logout
```
POST /api/v1/auth/logout
```
**Purpose:** Revoke refresh token(s)
**Authentication:** Required (Bearer Token)
**Rate Limit:** By user role
**Request Body (optional):**
```json
{
  "refreshToken": "eyJhbGc..."
}
```
**Response:** 200 OK
```json
{
  "message": "Logged out successfully"
}
```

---

#### Refresh Token
```
POST /api/v1/auth/refresh
```
**Purpose:** Get new access token using refresh token
**Authentication:** None (uses refresh token)
**Rate Limit:** Guest (10 req/min)
**Request Body:**
```json
{
  "refreshToken": "eyJhbGc..."
}
```
**Response:** 200 OK
```json
{
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc...",
  "tokenType": "bearer",
  "expiresIn": 3600,
  "user": { ... }
}
```
**Errors:**
- 401: Invalid or expired refresh token
- 401: Refresh token revoked

**Note:** Implements rotating refresh tokens (one-time use)

---

#### Get Current User
```
GET /api/v1/auth/me
```
**Purpose:** Get authenticated user's profile
**Authentication:** Required (Bearer Token)
**Rate Limit:** By user role
**Response:** 200 OK
```json
{
  "userId": "uuid-here",
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "role": "user",
  "isActive": true,
  "isEmailVerified": true,
  "createdAt": "2025-10-16T10:30:00.000Z"
}
```

---

#### Send Verification Email
```
POST /api/v1/auth/send-verification-email
```
**Purpose:** Send or resend email verification link
**Authentication:** Required (Bearer Token)
**Rate Limit:** By user role
**Response:** 200 OK
```json
{
  "message": "Verification email sent successfully"
}
```
**Errors:**
- 400: Email already verified
- 404: User not found

---

#### Verify Email
```
POST /api/v1/auth/verify-email
```
**Purpose:** Verify user email with token
**Authentication:** None (uses token)
**Rate Limit:** Guest (10 req/min)
**Request Body:**
```json
{
  "token": "eyJhbGc..."
}
```
**Response:** 200 OK
```json
{
  "userId": "uuid-here",
  "email": "user@example.com",
  "isEmailVerified": true,
  ...
}
```
**Errors:**
- 400: Token already used
- 401: Invalid or expired token

**Token Expiry:** 24 hours

---

#### Request Password Reset
```
POST /api/v1/auth/request-password-reset
```
**Purpose:** Request password reset link
**Authentication:** None
**Rate Limit:** Guest (10 req/min)
**Request Body:**
```json
{
  "email": "user@example.com"
}
```
**Response:** 200 OK (always)
```json
{
  "message": "If your email is registered, you will receive a password reset link"
}
```

**Note:** Always returns success to prevent email enumeration

---

#### Reset Password
```
POST /api/v1/auth/reset-password
```
**Purpose:** Reset password with reset token
**Authentication:** None (uses token)
**Rate Limit:** Guest (10 req/min)
**Request Body:**
```json
{
  "token": "eyJhbGc...",
  "newPassword": "NewSecurePass123!"
}
```
**Response:** 200 OK
```json
{
  "message": "Password reset successfully"
}
```
**Errors:**
- 400: Token already used
- 401: Invalid or expired token
- 422: Password validation failed

**Token Expiry:** 1 hour
**Security:** All refresh tokens are revoked after password reset

---

### Admin - User Management
**Status:** ✅ **IMPLEMENTED**

#### List All Users
```
GET /api/v1/admin/users
```
**Purpose:** List all users with pagination and filters (admin/super_admin only)
**Authentication:** Required (Bearer Token - Admin or Super Admin)
**Rate Limit:** By user role (Admin: 500/min, Super Admin: 1000/min)
**Query Parameters:**
- `page` (integer, default: 1): Page number
- `per_page` (integer, default: 20, max: 100): Items per page
- `role` (string, optional): Filter by role (super_admin, admin, moderator, user, guest)
- `is_active` (boolean, optional): Filter by active status
- `is_email_verified` (boolean, optional): Filter by email verification
- `search` (string, optional): Search in email, firstName, lastName

**Response:** 200 OK
```json
{
  "data": [
    {
      "userId": "uuid-here",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "role": "user",
      "isActive": true,
      "isEmailVerified": true,
      "phone": "+1234567890",
      "avatar": "https://example.com/avatar.jpg",
      "timezone": "America/New_York",
      "locale": "en",
      "lastLoginAt": "2025-10-16T10:30:00.000Z",
      "createdAt": "2025-10-16T10:00:00.000Z",
      "updatedAt": "2025-10-16T10:30:00.000Z"
    }
  ],
  "total": 100,
  "page": 1,
  "perPage": 20,
  "totalPages": 5
}
```
**Errors:**
- 401: Unauthorized
- 403: Forbidden (insufficient permissions)

---

#### Get User by ID
```
GET /api/v1/admin/users/{userId}
```
**Purpose:** Get detailed user information by ID (admin/super_admin only)
**Authentication:** Required (Bearer Token - Admin or Super Admin)
**Rate Limit:** By user role
**Path Parameters:**
- `userId`: UUID of user to retrieve

**Response:** 200 OK
```json
{
  "userId": "uuid-here",
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "role": "user",
  "isActive": true,
  "isEmailVerified": true,
  "phone": "+1234567890",
  "avatar": "https://example.com/avatar.jpg",
  "timezone": "America/New_York",
  "locale": "en",
  "lastLoginAt": "2025-10-16T10:30:00.000Z",
  "createdAt": "2025-10-16T10:00:00.000Z",
  "updatedAt": "2025-10-16T10:30:00.000Z"
}
```
**Errors:**
- 401: Unauthorized
- 403: Forbidden
- 404: User not found

---

#### Update User Role
```
PATCH /api/v1/admin/users/{userId}/role
```
**Purpose:** Change user's role (admin/super_admin only)
**Authentication:** Required (Bearer Token - Admin or Super Admin)
**Rate Limit:** By user role
**Path Parameters:**
- `userId`: UUID of user to update

**Request Body:**
```json
{
  "role": "moderator"
}
```
**Permissions:**
- **Super Admin:** Can assign any role (super_admin, admin, moderator, user, guest)
- **Admin:** Can only assign moderator, user, guest (cannot create other admins)

**Response:** 200 OK
```json
{
  "userId": "uuid-here",
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "role": "moderator",
  "isActive": true,
  "isEmailVerified": true,
  "createdAt": "2025-10-16T10:00:00.000Z",
  "updatedAt": "2025-10-16T10:35:00.000Z"
}
```
**Errors:**
- 401: Unauthorized
- 403: Forbidden (insufficient permissions or trying to modify own role)
- 404: User not found

**Security:**
- Users cannot modify their own role
- Only super admins can modify other super admin roles
- Admins cannot create other admins or super admins

---

#### Update User Status
```
PATCH /api/v1/admin/users/{userId}/status
```
**Purpose:** Activate or deactivate user account (admin/super_admin only)
**Authentication:** Required (Bearer Token - Admin or Super Admin)
**Rate Limit:** By user role
**Path Parameters:**
- `userId`: UUID of user to update

**Request Body:**
```json
{
  "isActive": false
}
```
**Response:** 200 OK
```json
{
  "userId": "uuid-here",
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "role": "user",
  "isActive": false,
  "isEmailVerified": true,
  "createdAt": "2025-10-16T10:00:00.000Z",
  "updatedAt": "2025-10-16T10:35:00.000Z"
}
```
**Errors:**
- 401: Unauthorized
- 403: Forbidden (trying to modify own status or insufficient permissions)
- 404: User not found

**Security:**
- Users cannot modify their own status
- Only super admins can modify other super admin accounts

---

#### Delete User (Soft Delete)
```
DELETE /api/v1/admin/users/{userId}
```
**Purpose:** Soft delete user account (sets deletedAt timestamp)
**Authentication:** Required (Bearer Token - Admin or Super Admin)
**Rate Limit:** By user role
**Path Parameters:**
- `userId`: UUID of user to delete

**Response:** 200 OK
```json
{
  "message": "User deleted successfully",
  "userId": "uuid-here",
  "deletedAt": "2025-10-16T10:40:00.000Z"
}
```
**Errors:**
- 401: Unauthorized
- 403: Forbidden (trying to delete own account or insufficient permissions)
- 404: User not found

**Note:**
- Performs soft delete (user can be restored within 90 days)
- Hard delete happens automatically after 90 days
- Users cannot delete their own account
- Only super admins can delete other super admin accounts

---

### Users
**Status:** ⚠️ **PARTIALLY IMPLEMENTED**

#### Get Current User
```
GET /api/v1/users/me
```
**Purpose:** Get authenticated user's profile
**Authentication:** Required (Bearer Token)
**Response:** 200 OK
```json
{
  "userId": "uuid-here",
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "createdAt": "2025-01-15T10:00:00.000Z",
  "updatedAt": "2025-10-16T10:30:00.000Z"
}
```

---

#### Create User
```
POST /api/v1/users
```
**Purpose:** Register a new user
**Authentication:** None (or API Key for service registration)
**Request Body:**
```json
{
  "email": "newuser@example.com",
  "password": "securePassword123",
  "firstName": "Jane",
  "lastName": "Smith"
}
```
**Response:** 201 Created
```json
{
  "userId": "uuid-here",
  "email": "newuser@example.com",
  "firstName": "Jane",
  "lastName": "Smith",
  "createdAt": "2025-10-16T10:30:00.000Z"
}
```

---

#### Update User
```
PATCH /api/v1/users/{userId}
```
**Purpose:** Update user information
**Authentication:** Required (Bearer Token)
**Path Parameters:**
- `userId`: UUID of user to update

**Request Body:**
```json
{
  "firstName": "Jane",
  "lastName": "Doe"
}
```
**Response:** 200 OK
```json
{
  "userId": "uuid-here",
  "email": "user@example.com",
  "firstName": "Jane",
  "lastName": "Doe",
  "updatedAt": "2025-10-16T10:35:00.000Z"
}
```

---

#### Delete User
```
DELETE /api/v1/users/{userId}
```
**Purpose:** Delete/deactivate user account
**Authentication:** Required (Bearer Token + Admin)
**Path Parameters:**
- `userId`: UUID of user to delete

**Response:** 204 No Content

---

### Module Management
**Status:** ✅ **IMPLEMENTED** (v1.3.0)

#### Module System Health Check
```
GET /api/v1/modules/health
```
**Purpose:** Check if module management system is operational
**Authentication:** None
**Rate Limit:** None
**Response:** 200 OK (healthy) / 503 Service Unavailable (unhealthy)
```json
{
  "status": "healthy",
  "components": {
    "docker": "healthy",
    "database": "healthy",
    "license_validator": "healthy"
  },
  "timestamp": "2025-10-17T10:30:00.000Z"
}
```
**Errors:**
- 503: Module system unhealthy (Docker daemon unreachable)

---

#### Install Module
```
POST /api/v1/modules/install
```
**Purpose:** Install a new Docker-based module with license validation
**Authentication:** Required (Bearer Token - Super Admin only)
**Rate Limit:** 10 requests/minute
**Request Body:**
```json
{
  "module_name": "analytics-dashboard",
  "display_name": "Analytics Dashboard",
  "description": "Real-time analytics and reporting dashboard",
  "docker_image": "myregistry.com/analytics:1.0.0",
  "version": "1.0.0",
  "license_key": "XXX-YYY-ZZZ-AAA-BBB",
  "ports": ["8001:8000"],
  "environment": {
    "DATABASE_URL": "mongodb://mongodb:27017/analytics",
    "DEBUG": "false"
  },
  "volumes": ["./modules/analytics/data:/app/data"],
  "cpu_limit": "1.0",
  "memory_limit": "512m",
  "network_mode": "a64core-network",
  "depends_on": ["mongodb", "redis"],
  "health_check": {
    "test": "curl -f http://localhost:8000/health || exit 1",
    "interval": "30s",
    "timeout": "10s",
    "retries": "3",
    "start_period": "40s"
  },
  "route_prefix": "/analytics"
}
```
**Response:** 202 Accepted
```json
{
  "message": "Module 'analytics-dashboard' installed successfully",
  "module_name": "analytics-dashboard",
  "status": "installing"
}
```
**Errors:**
- 400: Validation failed (invalid license, format errors, limits exceeded)
- 403: Forbidden (not super_admin)
- 409: Conflict (module already installed)
- 500: Installation failed (Docker error, network error)

**Security:**
- License keys validated before installation
- Docker images must be from trusted registries
- 'latest' tag not allowed (must specify exact version)
- Containers run with security restrictions (no privileges, resource limits)
- Maximum 50 total modules, 10 per user

---

#### List Installed Modules
```
GET /api/v1/modules/installed
```
**Purpose:** Get paginated list of all installed modules
**Authentication:** Required (Bearer Token - Super Admin only)
**Rate Limit:** By user role
**Query Parameters:**
- `page` (integer, default: 1): Page number
- `per_page` (integer, default: 20, max: 100): Items per page

**Response:** 200 OK
```json
{
  "data": [
    {
      "module_name": "analytics-dashboard",
      "display_name": "Analytics Dashboard",
      "description": "Real-time analytics and reporting dashboard",
      "docker_image": "myregistry.com/analytics:1.0.0",
      "version": "1.0.0",
      "status": "running",
      "health": "healthy",
      "container_id": "abc123def456",
      "container_name": "a64core-analytics-dashboard",
      "ports": ["8001:8000"],
      "route_prefix": "/analytics",
      "cpu_limit": "1.0",
      "memory_limit": "512m",
      "installed_by_email": "admin@a64platform.com",
      "installed_at": "2025-10-17T10:30:00.000Z",
      "updated_at": "2025-10-17T10:30:00.000Z"
    }
  ],
  "meta": {
    "total": 5,
    "page": 1,
    "per_page": 20,
    "total_pages": 1
  }
}
```
**Errors:**
- 403: Forbidden (not super_admin)
- 500: Query failed

**Module Status Values:**
- `pending`: Installation queued
- `installing`: Currently being installed
- `running`: Successfully running
- `stopped`: Stopped but installed
- `error`: Installation or runtime error
- `uninstalling`: Currently being removed

**Module Health Values:**
- `healthy`: Container running and responding
- `unhealthy`: Container running but not responding
- `unknown`: Health check not configured

---

#### Get Module Status
```
GET /api/v1/modules/{module_name}/status
```
**Purpose:** Get detailed status and runtime metrics for a specific module
**Authentication:** Required (Bearer Token - Super Admin only)
**Rate Limit:** By user role
**Path Parameters:**
- `module_name`: Module name (e.g., "analytics-dashboard")

**Response:** 200 OK
```json
{
  "module_name": "analytics-dashboard",
  "display_name": "Analytics Dashboard",
  "status": "running",
  "health": "healthy",
  "container_id": "abc123def456",
  "container_name": "a64core-analytics-dashboard",
  "uptime_seconds": 86400,
  "restart_count": 0,
  "cpu_usage_percent": 5.2,
  "memory_usage_mb": 256.8,
  "memory_limit_mb": 512.0,
  "network_rx_bytes": 1024000,
  "network_tx_bytes": 512000,
  "container_state": "running",
  "started_at": "2025-10-16T10:30:00.000Z",
  "error_message": null,
  "error_count": 0,
  "last_error_at": null
}
```
**Errors:**
- 403: Forbidden (not super_admin)
- 404: Module not found
- 500: Query failed

---

#### Uninstall Module
```
DELETE /api/v1/modules/{module_name}
```
**Purpose:** Uninstall a module and remove its container
**Authentication:** Required (Bearer Token - Super Admin only)
**Rate Limit:** 10 requests/minute
**Path Parameters:**
- `module_name`: Module name to uninstall

**Response:** 200 OK
```json
{
  "message": "Module 'analytics-dashboard' uninstalled successfully",
  "module_name": "analytics-dashboard"
}
```
**Errors:**
- 403: Forbidden (not super_admin)
- 404: Module not found
- 500: Uninstallation failed

**Warning:** This operation cannot be undone. All module data in the container will be lost. Backup important data before uninstalling.

---

#### Get Module Audit Log
```
GET /api/v1/modules/audit-log
```
**Purpose:** Get audit log of all module operations with filtering
**Authentication:** Required (Bearer Token - Super Admin only)
**Rate Limit:** By user role
**Query Parameters:**
- `page` (integer, default: 1): Page number
- `per_page` (integer, default: 50, max: 100): Items per page
- `module_name` (string, optional): Filter by module name
- `operation` (string, optional): Filter by operation (install, uninstall, start, stop)
- `status` (string, optional): Filter by status (success, failure)
- `user_id` (string, optional): Filter by user ID

**Response:** 200 OK
```json
{
  "data": [
    {
      "operation": "install",
      "module_name": "analytics-dashboard",
      "module_version": "1.0.0",
      "user_id": "0224a4f2-916d-4434-8f50-871fa9f65cd6",
      "user_email": "admin@a64platform.com",
      "user_role": "super_admin",
      "status": "success",
      "error_message": null,
      "timestamp": "2025-10-17T10:30:00.000Z",
      "duration_seconds": 45.2,
      "metadata": {
        "docker_image": "myregistry.com/analytics:1.0.0",
        "container_id": "abc123def456"
      }
    }
  ],
  "meta": {
    "total": 25,
    "page": 1,
    "per_page": 50,
    "total_pages": 1
  },
  "filters": {
    "module_name": null,
    "operation": null,
    "status": null,
    "user_id": null
  }
}
```
**Errors:**
- 403: Forbidden (not super_admin)
- 500: Query failed

**Note:** Audit logs are automatically deleted after 90 days (TTL index).

---

### Resources
*Section for future resource endpoints*

---

## Response Standards

### Success Response Format
All successful responses follow this structure:

**Single Resource:**
```json
{
  "data": {
    "id": "resource-id",
    "attribute": "value"
  }
}
```

**Multiple Resources (Paginated):**
```json
{
  "data": [
    {"id": "1", "attribute": "value"},
    {"id": "2", "attribute": "value"}
  ],
  "meta": {
    "total": 100,
    "page": 1,
    "perPage": 20,
    "totalPages": 5
  },
  "links": {
    "first": "/api/v1/resource?page=1",
    "last": "/api/v1/resource?page=5",
    "prev": null,
    "next": "/api/v1/resource?page=2"
  }
}
```

### Error Response Format
All error responses follow this structure:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": "Additional context (optional)",
    "timestamp": "2025-10-16T10:30:00.000Z",
    "path": "/api/v1/resource"
  }
}
```

## Error Codes

### HTTP Status Codes

| Code | Meaning | Usage |
|------|---------|-------|
| 200 | OK | Successful GET, PATCH, PUT |
| 201 | Created | Successful POST (resource created) |
| 204 | No Content | Successful DELETE |
| 400 | Bad Request | Invalid request format/parameters |
| 401 | Unauthorized | Missing or invalid authentication |
| 403 | Forbidden | Authenticated but insufficient permissions |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Resource already exists (duplicate) |
| 422 | Unprocessable Entity | Validation errors |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server-side error |
| 503 | Service Unavailable | Service temporarily down |

### Application Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_CREDENTIALS` | 401 | Login failed - wrong email/password |
| `TOKEN_EXPIRED` | 401 | JWT token has expired |
| `TOKEN_INVALID` | 401 | JWT token is malformed/invalid |
| `INSUFFICIENT_PERMISSIONS` | 403 | User lacks required permissions |
| `RESOURCE_NOT_FOUND` | 404 | Requested resource doesn't exist |
| `USER_NOT_FOUND` | 404 | User ID not found |
| `DUPLICATE_EMAIL` | 409 | Email already registered |
| `VALIDATION_ERROR` | 422 | Input validation failed |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests from client |
| `DATABASE_ERROR` | 500 | Database operation failed |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

## API Changelog

### v1.3.0 - 2025-10-17
- ✅ **Module Management System** implemented
- ✅ 6 module management endpoints (install, list, status, uninstall, audit log, health check)
- ✅ Docker Compose-based modular architecture
- ✅ License key validation (format, offline, online modes)
- ✅ License key encryption (Fernet + PBKDF2HMAC)
- ✅ Container security sandboxing (no privileges, resource limits, non-root)
- ✅ Docker image validation (trusted registries, no 'latest' tags)
- ✅ Module limits (50 total, 10 per user)
- ✅ Comprehensive audit logging (90-day TTL)
- ✅ Runtime metrics (CPU, memory, network stats)
- ✅ Module lifecycle management (pending, installing, running, stopped, error, uninstalling)
- ✅ Health monitoring (healthy, unhealthy, unknown)
- ✅ Super admin only access (RBAC enforcement)
- ✅ MongoDB indexes for module collections (optimized queries)

### v1.2.0 - 2025-10-17
- ✅ **Admin User Management System** implemented
- ✅ 5 admin endpoints for user management (list, get, update role, update status, delete)
- ✅ Super admin role and permissions
- ✅ Admin web interface at `/admin/`
- ✅ Role-based authorization (super_admin and admin)
- ✅ User filtering and search (by role, status, email verification)
- ✅ Pagination support (default 20, max 100 per page)
- ✅ Soft delete functionality (90-day retention)
- ✅ Self-modification prevention (cannot change own role/status)
- ✅ Super admin protection (only super admins can manage other super admins)

### v1.1.0 - 2025-10-16
- ✅ Complete authentication system implemented
- ✅ Email verification with JWT tokens (24hr expiry)
- ✅ Password reset flow with JWT tokens (1hr expiry)
- ✅ Login rate limiting (5 attempts, 15min lockout)
- ✅ Role-based rate limiting (Guest: 10/min, User: 100/min, Moderator: 200/min, Admin: 500/min, Super Admin: 1000/min)
- ✅ Rotating refresh tokens (one-time use)
- ✅ 9 authentication endpoints
- ✅ Database indexes with TTL for automatic token cleanup

### v1.0.0 - 2025-10-16
- Initial API structure
- Health check endpoints
- Readiness check endpoint
- Documentation endpoints (Swagger/ReDoc)
- User management endpoints

### Future Versions
*Document all API changes here with version, date, and description*

---

## Notes for Developers

### Before Creating New Endpoints
1. ✅ Check this document to avoid conflicts
2. ✅ Follow the API standards in CLAUDE.md
3. ✅ Update this document with new endpoint details
4. ✅ Include request/response examples
5. ✅ Document all error cases
6. ✅ Add to API changelog

### Naming Conventions
- Endpoints: plural nouns (`/users`, `/products`)
- Actions: HTTP verbs (GET, POST, PATCH, DELETE)
- IDs in path: `{resourceId}` format
- Query params: camelCase (`?sortBy=createdAt`)
- Response fields: camelCase in JSON

### Required Documentation for Each Endpoint
- [ ] HTTP Method and path
- [ ] Purpose/description
- [ ] Authentication requirements
- [ ] Request parameters (path, query, body)
- [ ] Request body schema
- [ ] Response schema
- [ ] All possible status codes
- [ ] Error responses
- [ ] Example requests/responses
