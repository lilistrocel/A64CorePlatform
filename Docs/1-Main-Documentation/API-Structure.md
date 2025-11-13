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

### Farm Management Module
**Status:** ✅ **IMPLEMENTED** (v1.6.0 - Microservice on port 8001)
**Base URL:** `http://localhost:8001/api/v1/farm` (proxied via nginx at `/api/v1/farm`)

The Farm Management Module is a separate microservice providing comprehensive farm operations management including farms, blocks, plant data, plantings, and harvest tracking.

**Architecture:** Independent FastAPI microservice with dedicated MongoDB database
**Authentication:** JWT Bearer Token (same token system as main API)
**Rate Limit:** By user role (inherited from main API auth)

---

#### Module Health Check
```
GET /api/v1/farm/health
```
**Purpose:** Check if farm management module is operational
**Authentication:** None
**Response:** 200 OK
```json
{
  "status": "healthy",
  "service": "Farm Management Module"
}
```

---

#### Get Managers List
```
GET /api/v1/farm/managers
```
**Purpose:** Get list of users with manager roles for farm assignment
**Authentication:** Required (Bearer Token)
**Rate Limit:** By user role
**Response:** 200 OK
```json
{
  "managers": [
    {
      "userId": "0224a4f2-916d-4434-8f50-871fa9f65cd6",
      "name": "Farm Tester",
      "email": "farmtest@test.com",
      "role": "admin"
    },
    {
      "userId": "uuid-here",
      "name": "John Smith",
      "email": "admin@example.com",
      "role": "super_admin"
    }
  ]
}
```

**Response Fields:**
- `userId` (string): Unique user identifier
- `name` (string): Full name (firstName + lastName)
- `email` (string): User email address
- `role` (string): User role (admin, super_admin, moderator)

**Filters:**
- Returns only users with manager roles: admin, super_admin, moderator
- Returns only active users (isActive: true)
- Sorted alphabetically by firstName

**Errors:**
- 401: Unauthorized (missing or invalid token)
- 500: Internal server error

**Use Case:** Populate manager dropdown in farm creation/edit forms

---

### Farms Management

#### List Farms
```
GET /api/v1/farm/farms
```
**Purpose:** Get paginated list of farms for current user
**Authentication:** Required (Bearer Token)
**Query Parameters:**
- `page` (integer, default: 1): Page number
- `perPage` (integer, default: 20, max: 100): Items per page
- `search` (string, optional): Search by farm name or location

**Response:** 200 OK (Paginated)

---

#### Create Farm
```
POST /api/v1/farm/farms
```
**Purpose:** Create a new farm
**Authentication:** Required (Bearer Token)
**Request Body:**
```json
{
  "name": "Green Valley Farm",
  "description": "Organic vegetable farm in central valley",
  "owner": "John Smith",
  "location": {
    "latitude": 40.7128,
    "longitude": -74.0060,
    "address": "123 Farm Road, Valley City"
  },
  "totalArea": 50.5,
  "areaUnit": "hectares",
  "numberOfStaff": 12
}
```

**Field Descriptions:**
- `name` (string, required): Farm name (1-200 chars)
- `description` (string, optional): Farm description
- `owner` (string, optional): Farm owner name (max 200 chars)
- `location` (object, optional): Geographic location with latitude, longitude, and address
- `totalArea` (float, optional): Total farm area (must be > 0)
- `areaUnit` (string, default: "hectares"): Area unit (hectares, acres, sqm)
- `numberOfStaff` (integer, optional): Number of staff members (must be >= 0)

**Response:** 201 Created

---

### Block Management

#### Create Block
```
POST /api/v1/farm/farms/{farmId}/blocks
```
**Purpose:** Create a cultivation block within a farm
**Authentication:** Required (Bearer Token)
**Path Parameters:** `farmId` (UUID)
**Request Body:**
```json
{
  "name": "Block A1",
  "blockType": "greenhouse",
  "area": 500.0,
  "areaUnit": "sqm"
}
```

**Response:** 201 Created

---

#### List Blocks
```
GET /api/v1/farm/farms/{farmId}/blocks
```
**Purpose:** Get all blocks for a specific farm
**Authentication:** Required (Bearer Token)
**Path Parameters:** `farmId` (UUID)

**Response:** 200 OK

---

### Plant Data Enhanced (Agronomic Knowledge Base)

#### Create Plant Data
```
POST /api/v1/farm/plant-data-enhanced
```
**Purpose:** Create comprehensive plant cultivation data entry
**Authentication:** Required (Bearer Token - Agronomist role)
**Rate Limit:** By user role
**Request Body:**
```json
{
  "plantName": "Tomato",
  "scientificName": "Solanum lycopersicum",
  "family": "Solanaceae",
  "commonNames": ["Roma Tomato", "Plum Tomato"],
  "tags": ["vegetable", "greenhouse", "high-yield"],
  "farmTypeCompatibility": ["greenhouse", "open_field"],
  "growthCycle": {
    "totalCycleDays": 90,
    "germinationDays": 7,
    "vegetativeDays": 30,
    "floweringDays": 21,
    "fruitingDays": 25,
    "harvestDays": 7
  },
  "yieldAndWaste": {
    "expectedYieldPerPlant": 5.0,
    "yieldUnit": "kg",
    "qualityAPercentage": 70.0,
    "qualityBPercentage": 25.0,
    "qualityCPercentage": 5.0,
    "wastePercentage": 5.0
  },
  "environmentalRequirements": {
    "temperatureRange": {
      "min": 18.0,
      "max": 27.0,
      "optimal": 22.0,
      "unit": "celsius"
    },
    "humidityRange": {
      "min": 60.0,
      "max": 80.0,
      "optimal": 70.0
    }
  }
}
```

**Response:** 201 Created
```json
{
  "data": {
    "plantDataId": "uuid-here",
    "plantName": "Tomato",
    "scientificName": "Solanum lycopersicum",
    "dataVersion": 1,
    "createdAt": "2025-10-31T12:00:00.000Z",
    "updatedAt": "2025-10-31T12:00:00.000Z"
  },
  "message": "Plant data created successfully"
}
```

**Permissions:** Requires `agronomist` role

**Field Groups (13 comprehensive categories):**
1. **Basic Info** - Plant identification and metadata
2. **Growth Cycle** - 5 growth stages with durations
3. **Yield & Waste** - Expected yields and quality grading
4. **Fertilizer Schedule** - Stage-specific NPK requirements
5. **Pesticide Schedule** - Disease/pest management
6. **Environmental Requirements** - Temperature, humidity, CO2, air circulation
7. **Watering Requirements** - Irrigation methods and schedules
8. **Soil & pH Requirements** - Soil type and nutrient needs
9. **Diseases & Pests** - Common issues and treatments
10. **Light Requirements** - Photoperiod and intensity
11. **Quality Grading** - Standards for A/B/C grades
12. **Economics & Labor** - Planting density and labor requirements
13. **Additional Info** - Notes, references, media

---

#### List Plant Data
```
GET /api/v1/farm/plant-data-enhanced
```
**Purpose:** Get paginated list of plant data with advanced search and filters
**Authentication:** Required (Bearer Token)
**Rate Limit:** By user role
**Query Parameters:**
- `page` (integer, default: 1): Page number
- `perPage` (integer, default: 20, max: 100): Items per page
- `search` (string, optional): Text search across plantName, scientificName, commonNames, description
- `farmType` (string, optional): Filter by farm type compatibility (greenhouse, open_field, hydroponic, vertical_farm, aquaponic, container, mixed)
- `plantType` (string, optional): Filter by plant type (vegetable, fruit, herb, leafy_green, root, flower, grain, other)
- `minCycleDays` (integer, optional): Minimum total growth cycle days
- `maxCycleDays` (integer, optional): Maximum total growth cycle days
- `tags` (string, optional): Comma-separated tags (AND logic)
- `isActive` (boolean, optional): Filter by active status (default: true)

**Response:** 200 OK (Paginated)
```json
{
  "data": [
    {
      "plantDataId": "uuid-here",
      "plantName": "Tomato",
      "scientificName": "Solanum lycopersicum",
      "family": "Solanaceae",
      "tags": ["vegetable", "greenhouse"],
      "farmTypeCompatibility": ["greenhouse", "open_field"],
      "growthCycle": {
        "totalCycleDays": 90
      },
      "createdAt": "2025-10-31T12:00:00.000Z"
    }
  ],
  "meta": {
    "total": 50,
    "page": 1,
    "perPage": 20,
    "totalPages": 3
  }
}
```

**Performance:** 10 strategic database indexes optimize query performance (~90% faster)

---

#### Get Plant Data by ID
```
GET /api/v1/farm/plant-data-enhanced/{plantDataId}
```
**Purpose:** Get complete plant data with all 13 field groups
**Authentication:** Required (Bearer Token)
**Path Parameters:** `plantDataId` (UUID)

**Response:** 200 OK
```json
{
  "data": {
    "plantDataId": "uuid-here",
    "plantName": "Tomato",
    "scientificName": "Solanum lycopersicum",
    "family": "Solanaceae",
    "commonNames": ["Roma Tomato"],
    "tags": ["vegetable", "greenhouse"],
    "farmTypeCompatibility": ["greenhouse", "open_field"],
    "growthCycle": { ... },
    "yieldAndWaste": { ... },
    "fertilizerSchedule": { ... },
    "pesticideSchedule": { ... },
    "environmentalRequirements": { ... },
    "wateringRequirements": { ... },
    "soilAndPH": { ... },
    "diseasesAndPests": { ... },
    "lightRequirements": { ... },
    "qualityGrading": { ... },
    "economicsAndLabor": { ... },
    "additionalInfo": { ... },
    "dataVersion": 1,
    "createdBy": "user-id",
    "createdAt": "2025-10-31T12:00:00.000Z",
    "updatedAt": "2025-10-31T12:00:00.000Z"
  }
}
```

**Errors:**
- 404: Plant data not found

---

#### Update Plant Data
```
PATCH /api/v1/farm/plant-data-enhanced/{plantDataId}
```
**Purpose:** Update plant data (increments dataVersion for tracking)
**Authentication:** Required (Bearer Token - Agronomist role)
**Path Parameters:** `plantDataId` (UUID)
**Request Body:** Partial update (any fields from creation schema)

**Response:** 200 OK (Updated plant data)

**Permissions:** Requires `agronomist` role

**Note:** Each update increments `dataVersion` for change tracking

---

#### Delete Plant Data (Soft Delete)
```
DELETE /api/v1/farm/plant-data-enhanced/{plantDataId}
```
**Purpose:** Soft delete plant data (sets deletedAt timestamp, preserves data)
**Authentication:** Required (Bearer Token - Agronomist role)
**Path Parameters:** `plantDataId` (UUID)

**Response:** 200 OK
```json
{
  "data": {
    "plantDataId": "uuid-here"
  },
  "message": "Plant data deleted successfully"
}
```

**Permissions:** Requires `agronomist` role

**Note:** Soft delete preserves data for audit trail. Deleted entries excluded from queries by default.

---

#### Clone Plant Data
```
POST /api/v1/farm/plant-data-enhanced/{plantDataId}/clone
```
**Purpose:** Create a copy of plant data for creating variations
**Authentication:** Required (Bearer Token - Agronomist role)
**Path Parameters:** `plantDataId` (UUID)

**Response:** 201 Created (Cloned plant data with new UUID)

**Permissions:** Requires `agronomist` role

**Note:** Clones all data, appends "(Clone)" to plantName, generates new UUID, resets audit fields

---

#### Download CSV Template
```
GET /api/v1/farm/plant-data-enhanced/template/csv
```
**Purpose:** Download CSV template for bulk plant data import
**Authentication:** Required (Bearer Token)

**Response:** 200 OK (CSV file download)
```csv
plantName,scientificName,family,growthDurationDays,...
Tomato,Solanum lycopersicum,Solanaceae,90,...
```

**Headers:**
- `Content-Type: text/csv`
- `Content-Disposition: attachment; filename=plant_data_template.csv`

---

#### Filter by Farm Type
```
GET /api/v1/farm/plant-data-enhanced/by-farm-type/{farmType}
```
**Purpose:** Get plants compatible with specific farm type
**Authentication:** Required (Bearer Token)
**Path Parameters:** `farmType` (greenhouse | open_field | hydroponic | vertical_farm | aquaponic | container | mixed)

**Response:** 200 OK (List of compatible plants)

---

#### Filter by Tags
```
GET /api/v1/farm/plant-data-enhanced/by-tags/{tags}
```
**Purpose:** Get plants matching comma-separated tags (AND logic)
**Authentication:** Required (Bearer Token)
**Path Parameters:** `tags` (comma-separated string, e.g., "vegetable,greenhouse,high-yield")

**Response:** 200 OK (List of matching plants)

---

### Planting Management

#### Create Planting Plan
```
POST /api/v1/farm/plantings
```
**Purpose:** Create a planting plan with yield prediction
**Authentication:** Required (Bearer Token)
**Request Body:**
```json
{
  "farmId": "uuid-here",
  "blockId": "uuid-here",
  "plantDataId": "uuid-here",
  "quantity": 100,
  "plantingMethod": "direct_seeding"
}
```

**Response:** 201 Created (Includes predicted yield)

---

#### Mark Planting as Planted
```
POST /api/v1/farm/plantings/{plantingId}/mark-planted
```
**Purpose:** Mark planting as planted and calculate harvest date
**Authentication:** Required (Bearer Token)
**Path Parameters:** `plantingId` (UUID)
**Request Body:**
```json
{
  "actualPlantedDate": "2025-11-01T00:00:00.000Z"
}
```

**Response:** 200 OK (Updates block state to "planted", calculates expected harvest date)

---

### Block Management (Complete Lifecycle System)
**Status:** ✅ **IMPLEMENTED** (v1.7.0 - 2025-11-12)

The Block Management system provides comprehensive cultivation block lifecycle tracking with 7 states, KPI monitoring, harvest recording, alert management, and automatic cycle archival.

**Key Features:**
- 7-state lifecycle workflow (alert ↔ empty → planted → growing → fruiting → harvesting → cleaning → empty)
- Automatic block code generation (F001-001, F001-002, etc.)
- Real-time KPI tracking (predicted yield, actual yield, efficiency percentage)
- Individual harvest recording with quality grading (A/B/C)
- Alert system with status preservation and restoration
- Automatic cycle archival on completion (cleaning → empty transition)
- Complete audit trail with status history
- Performance analytics and trend analysis

**Architecture:**
- 4 new database collections (blocks, block_harvests, alerts, block_archives)
- 35 new API endpoints across 4 routers
- Automatic KPI calculations on harvest recording
- Status validation with business logic enforcement
- Historical performance tracking and comparison

---

#### Create Block
```
POST /api/v1/farm/farms/{farmId}/blocks
```
**Purpose:** Create a new cultivation block within a farm
**Authentication:** Required (Bearer Token - farm.manage permission)
**Path Parameters:** `farmId` (UUID)
**Request Body:**
```json
{
  "name": "Greenhouse Block A1",
  "blockType": "greenhouse",
  "area": 500.0,
  "areaUnit": "sqm"
}
```
**Response:** 201 Created
```json
{
  "data": {
    "blockId": "uuid-here",
    "farmId": "farm-uuid",
    "blockCode": "F001-001",
    "name": "Greenhouse Block A1",
    "blockType": "greenhouse",
    "area": 500.0,
    "areaUnit": "sqm",
    "status": "empty",
    "hasAlert": false,
    "createdAt": "2025-11-12T10:00:00.000Z"
  },
  "message": "Block created successfully"
}
```
**Permissions:** Requires `farm.manage` permission

**Note:** Block code is automatically generated based on farm sequence (F001 = first farm, 001 = first block in that farm)

---

#### List Blocks
```
GET /api/v1/farm/farms/{farmId}/blocks
```
**Purpose:** Get paginated list of blocks in a farm with filters
**Authentication:** Required (Bearer Token)
**Path Parameters:** `farmId` (UUID)
**Query Parameters:**
- `page` (integer, default: 1): Page number
- `perPage` (integer, default: 20, max: 100): Items per page
- `status` (string, optional): Filter by block status (alert, empty, planted, growing, fruiting, harvesting, cleaning)
- `blockType` (string, optional): Filter by block type
- `targetCrop` (UUID, optional): Filter by target crop ID

**Response:** 200 OK (Paginated list of blocks)

---

#### Get Block by ID
```
GET /api/v1/farm/farms/{farmId}/blocks/{blockId}
```
**Purpose:** Get detailed block information including current cycle data and KPIs
**Authentication:** Required (Bearer Token)
**Path Parameters:** `farmId` (UUID), `blockId` (UUID)

**Response:** 200 OK
```json
{
  "data": {
    "blockId": "uuid-here",
    "farmId": "farm-uuid",
    "blockCode": "F001-001",
    "name": "Greenhouse Block A1",
    "status": "fruiting",
    "currentPlantingId": "planting-uuid",
    "currentPlantDataId": "plant-uuid",
    "currentPlantName": "Tomato - Roma",
    "plantedDate": "2025-10-15T00:00:00.000Z",
    "expectedHarvestDate": "2026-01-13T00:00:00.000Z",
    "predictedYield": {
      "amount": 500.0,
      "unit": "kg"
    },
    "actualYield": {
      "amount": 125.5,
      "unit": "kg"
    },
    "yieldEfficiency": 25.1,
    "hasAlert": false,
    "statusChanges": [
      {
        "fromStatus": "planted",
        "toStatus": "growing",
        "changedBy": "user-uuid",
        "changedByEmail": "user@test.com",
        "changedAt": "2025-10-20T10:00:00.000Z",
        "reason": "Seedlings emerged"
      }
    ],
    "createdAt": "2025-10-01T00:00:00.000Z",
    "updatedAt": "2025-10-20T10:00:00.000Z"
  }
}
```

---

#### Update Block Status
```
PATCH /api/v1/farm/farms/{farmId}/blocks/{blockId}/status
```
**Purpose:** Transition block to next lifecycle status with validation
**Authentication:** Required (Bearer Token - farm.operate permission)
**Path Parameters:** `farmId` (UUID), `blockId` (UUID)
**Request Body:**
```json
{
  "status": "growing",
  "reason": "Seedlings have emerged and are developing well"
}
```

**Response:** 200 OK (Updated block with status history)

**Status Transition Rules:**
- ALERT can transition to/from any status (bidirectional)
- EMPTY → PLANTED (requires planting data)
- PLANTED → GROWING (seedling emergence)
- GROWING → FRUITING (flowering/fruit set)
- FRUITING → HARVESTING (harvest ready)
- HARVESTING → CLEANING (harvest complete)
- CLEANING → EMPTY (triggers automatic archival)
- Cannot skip states in the forward progression

**Errors:**
- 400: Invalid status transition
- 400: Missing required data for status (e.g., planting data for EMPTY → PLANTED)
- 404: Block not found

**Permissions:** Requires `farm.operate` permission

---

#### Update Block
```
PATCH /api/v1/farm/farms/{farmId}/blocks/{blockId}
```
**Purpose:** Update block details (name, area, etc.)
**Authentication:** Required (Bearer Token - farm.manage permission)
**Path Parameters:** `farmId` (UUID), `blockId` (UUID)
**Request Body:** Partial update (any fields from creation schema)

**Response:** 200 OK (Updated block)

**Permissions:** Requires `farm.manage` permission

---

#### Delete Block
```
DELETE /api/v1/farm/farms/{farmId}/blocks/{blockId}
```
**Purpose:** Delete a block (soft delete, preserves data)
**Authentication:** Required (Bearer Token - farm.manage permission)
**Path Parameters:** `farmId` (UUID), `blockId` (UUID)

**Response:** 200 OK
```json
{
  "data": {
    "blockId": "uuid-here"
  },
  "message": "Block deleted successfully"
}
```

**Permissions:** Requires `farm.manage` permission

---

### Harvest Management

#### Record Harvest
```
POST /api/v1/farm/farms/{farmId}/blocks/{blockId}/harvests
```
**Purpose:** Record a harvest event and automatically update block KPIs
**Authentication:** Required (Bearer Token - farm.operate permission)
**Path Parameters:** `farmId` (UUID), `blockId` (UUID)
**Request Body:**
```json
{
  "blockId": "block-uuid",
  "plantingId": "planting-uuid",
  "harvestDate": "2025-11-12T08:00:00.000Z",
  "amount": 25.5,
  "unit": "kg",
  "qualityGrade": "A",
  "notes": "First harvest - excellent quality"
}
```

**Response:** 201 Created
```json
{
  "data": {
    "harvestId": "uuid-here",
    "blockId": "block-uuid",
    "farmId": "farm-uuid",
    "plantingId": "planting-uuid",
    "harvestDate": "2025-11-12T08:00:00.000Z",
    "amount": 25.5,
    "unit": "kg",
    "qualityGrade": "A",
    "harvestedBy": "user-uuid",
    "harvestedByEmail": "user@test.com",
    "notes": "First harvest - excellent quality",
    "createdAt": "2025-11-12T09:00:00.000Z"
  },
  "message": "Harvest recorded successfully"
}
```

**Automatic Updates:**
- Increments block's `actualYield` (cumulative)
- Recalculates `yieldEfficiency` ((actual/predicted) * 100)
- Tracks quality grade for performance analytics

**Quality Grades:**
- **A:** Premium quality (meets all standards)
- **B:** Good quality (minor imperfections)
- **C:** Acceptable quality (noticeable defects)

**Errors:**
- 400: Block ID mismatch (URL vs request body)
- 400: Amount must be greater than 0
- 400: Invalid quality grade
- 404: Block or planting not found

**Permissions:** Requires `farm.operate` permission

---

#### List Block Harvests
```
GET /api/v1/farm/farms/{farmId}/blocks/{blockId}/harvests
```
**Purpose:** Get paginated list of harvest events for a block
**Authentication:** Required (Bearer Token)
**Path Parameters:** `farmId` (UUID), `blockId` (UUID)
**Query Parameters:**
- `page` (integer, default: 1): Page number
- `perPage` (integer, default: 20, max: 100): Items per page
- `startDate` (datetime, optional): Filter harvests from this date
- `endDate` (datetime, optional): Filter harvests until this date

**Response:** 200 OK (Paginated list of harvest events)

---

#### Get Harvest by ID
```
GET /api/v1/farm/farms/{farmId}/blocks/{blockId}/harvests/{harvestId}
```
**Purpose:** Get detailed harvest event information
**Authentication:** Required (Bearer Token)
**Path Parameters:** `farmId` (UUID), `blockId` (UUID), `harvestId` (UUID)

**Response:** 200 OK (Harvest details)

---

#### Update Harvest
```
PATCH /api/v1/farm/farms/{farmId}/blocks/{blockId}/harvests/{harvestId}
```
**Purpose:** Update harvest details (recalculates block KPIs)
**Authentication:** Required (Bearer Token - farm.operate permission)
**Path Parameters:** `farmId` (UUID), `blockId` (UUID), `harvestId` (UUID)
**Request Body:** Partial update

**Response:** 200 OK (Updated harvest)

**Note:** Updating harvest amount triggers recalculation of block's actual yield and efficiency

**Permissions:** Requires `farm.operate` permission

---

#### Delete Harvest
```
DELETE /api/v1/farm/farms/{farmId}/blocks/{blockId}/harvests/{harvestId}
```
**Purpose:** Delete a harvest record (recalculates block KPIs)
**Authentication:** Required (Bearer Token - farm.operate permission)
**Path Parameters:** `farmId` (UUID), `blockId` (UUID), `harvestId` (UUID)

**Response:** 200 OK

**Note:** Deleting harvest subtracts amount from block's actual yield and recalculates efficiency

**Permissions:** Requires `farm.operate` permission

---

#### Get Harvest Summary
```
GET /api/v1/farm/farms/{farmId}/blocks/{blockId}/harvests/summary
```
**Purpose:** Get aggregated harvest statistics for current cycle
**Authentication:** Required (Bearer Token)
**Path Parameters:** `farmId` (UUID), `blockId` (UUID)

**Response:** 200 OK
```json
{
  "data": {
    "totalAmount": 125.5,
    "unit": "kg",
    "harvestCount": 5,
    "qualityBreakdown": {
      "gradeA": 87.5,
      "gradeB": 30.0,
      "gradeC": 8.0
    },
    "averagePerHarvest": 25.1,
    "firstHarvestDate": "2025-11-01T00:00:00.000Z",
    "lastHarvestDate": "2025-11-12T00:00:00.000Z"
  }
}
```

---

#### List Farm Harvests
```
GET /api/v1/farm/farms/{farmId}/harvests
```
**Purpose:** Get all harvests across all blocks in a farm
**Authentication:** Required (Bearer Token)
**Path Parameters:** `farmId` (UUID)
**Query Parameters:**
- `page`, `perPage`: Pagination
- `blockId` (UUID, optional): Filter by specific block
- `startDate`, `endDate`: Date range filter
- `qualityGrade` (string, optional): Filter by quality grade

**Response:** 200 OK (Paginated list of harvests across farm)

---

### Alert Management

#### Create Alert
```
POST /api/v1/farm/farms/{farmId}/blocks/{blockId}/alerts
```
**Purpose:** Create an alert for a block (manual or sensor-triggered)
**Authentication:** Required (Bearer Token - anyone can create alerts)
**Path Parameters:** `farmId` (UUID), `blockId` (UUID)
**Query Parameters:**
- `changeBlockStatus` (boolean, default: true): Whether to change block status to ALERT
**Request Body:**
```json
{
  "blockId": "block-uuid",
  "severity": "high",
  "title": "High temperature detected",
  "description": "Greenhouse temperature exceeded 32°C threshold",
  "alertType": "sensor",
  "sensorData": {
    "sensorId": "TEMP-001",
    "reading": {
      "value": 34.5,
      "unit": "celsius"
    },
    "threshold": {
      "value": 32.0,
      "unit": "celsius"
    }
  }
}
```

**Response:** 201 Created
```json
{
  "data": {
    "alertId": "uuid-here",
    "blockId": "block-uuid",
    "farmId": "farm-uuid",
    "severity": "high",
    "title": "High temperature detected",
    "description": "Greenhouse temperature exceeded 32°C threshold",
    "alertType": "sensor",
    "status": "active",
    "sensorData": { ... },
    "createdBy": "user-uuid",
    "createdByEmail": "user@test.com",
    "createdAt": "2025-11-12T10:00:00.000Z"
  },
  "message": "Alert created successfully"
}
```

**Automatic Features:**
- If `changeBlockStatus=true`, block status changes to ALERT
- Previous status saved in `statusBeforeAlert` field
- Block's `hasAlert` flag set to true
- Block's `alertSeverity` updated

**Alert Types:**
- **manual:** User-created alert
- **sensor:** Triggered by sensor threshold
- **system:** Triggered by automated rules

**Severity Levels:**
- **low:** Minor issue, no immediate action needed
- **medium:** Moderate issue, action recommended
- **high:** Serious issue, action required soon
- **critical:** Emergency, immediate action required

**Errors:**
- 400: Block ID mismatch (URL vs request body)
- 404: Block not found

---

#### List Block Alerts
```
GET /api/v1/farm/farms/{farmId}/blocks/{blockId}/alerts
```
**Purpose:** Get paginated list of alerts for a block
**Authentication:** Required (Bearer Token)
**Path Parameters:** `farmId` (UUID), `blockId` (UUID)
**Query Parameters:**
- `page`, `perPage`: Pagination
- `status` (string, optional): Filter by status (active, resolved, dismissed)
- `severity` (string, optional): Filter by severity (low, medium, high, critical)

**Response:** 200 OK (Paginated list of alerts)

---

#### Get Alert by ID
```
GET /api/v1/farm/farms/{farmId}/blocks/{blockId}/alerts/{alertId}
```
**Purpose:** Get detailed alert information
**Authentication:** Required (Bearer Token)
**Path Parameters:** `farmId` (UUID), `blockId` (UUID), `alertId` (UUID)

**Response:** 200 OK (Alert details)

---

#### Resolve Alert
```
POST /api/v1/farm/farms/{farmId}/blocks/{blockId}/alerts/{alertId}/resolve
```
**Purpose:** Mark alert as resolved and optionally restore block status
**Authentication:** Required (Bearer Token)
**Path Parameters:** `farmId` (UUID), `blockId` (UUID), `alertId` (UUID)
**Query Parameters:**
- `restoreStatus` (boolean, default: true): Restore block to status before alert
**Request Body:**
```json
{
  "resolutionNotes": "Temperature brought back to normal by adjusting ventilation"
}
```

**Response:** 200 OK
```json
{
  "data": {
    "alertId": "uuid-here",
    "status": "resolved",
    "resolvedBy": "user-uuid",
    "resolvedByEmail": "user@test.com",
    "resolvedAt": "2025-11-12T11:00:00.000Z",
    "resolutionNotes": "Temperature brought back to normal by adjusting ventilation"
  },
  "message": "Alert resolved successfully"
}
```

**Automatic Features:**
- Alert status changed to "resolved"
- If `restoreStatus=true` and no other active alerts, block status restored to `statusBeforeAlert`
- Block's `hasAlert` flag updated
- Resolution timestamp and user recorded

**Errors:**
- 400: Alert already resolved
- 404: Alert not found

---

#### Dismiss Alert
```
POST /api/v1/farm/farms/{farmId}/blocks/{blockId}/alerts/{alertId}/dismiss
```
**Purpose:** Dismiss an alert without resolution (false positive)
**Authentication:** Required (Bearer Token)
**Path Parameters:** `farmId` (UUID), `blockId` (UUID), `alertId` (UUID)
**Request Body:** Optional dismissal reason

**Response:** 200 OK

---

#### List Farm Alerts
```
GET /api/v1/farm/farms/{farmId}/alerts
```
**Purpose:** Get all alerts across all blocks in a farm
**Authentication:** Required (Bearer Token)
**Path Parameters:** `farmId` (UUID)
**Query Parameters:**
- `page`, `perPage`: Pagination
- `blockId` (UUID, optional): Filter by specific block
- `status`, `severity`: Alert filters
- `alertType`: Filter by alert type

**Response:** 200 OK (Paginated list of alerts across farm)

---

#### Get Active Alerts Summary
```
GET /api/v1/farm/farms/{farmId}/alerts/active-summary
```
**Purpose:** Get count of active alerts by severity across farm
**Authentication:** Required (Bearer Token)
**Path Parameters:** `farmId` (UUID)

**Response:** 200 OK
```json
{
  "data": {
    "totalActive": 5,
    "bySeverity": {
      "critical": 1,
      "high": 2,
      "medium": 1,
      "low": 1
    },
    "affectedBlocks": 4
  }
}
```

---

### Archive & Analytics

#### List Block Archives
```
GET /api/v1/farm/farms/{farmId}/blocks/{blockId}/archives
```
**Purpose:** Get historical cycles for a specific block
**Authentication:** Required (Bearer Token)
**Path Parameters:** `farmId` (UUID), `blockId` (UUID)
**Query Parameters:**
- `page`, `perPage`: Pagination

**Response:** 200 OK
```json
{
  "data": [
    {
      "archiveId": "uuid-here",
      "blockId": "block-uuid",
      "farmId": "farm-uuid",
      "plantName": "Tomato - Roma",
      "plantedDate": "2025-08-01T00:00:00.000Z",
      "harvestStartDate": "2025-10-15T00:00:00.000Z",
      "harvestEndDate": "2025-10-30T00:00:00.000Z",
      "cycleDuration": 90,
      "predictedYield": {
        "amount": 500.0,
        "unit": "kg"
      },
      "actualYield": {
        "amount": 485.0,
        "unit": "kg"
      },
      "yieldEfficiency": 97.0,
      "qualityBreakdown": {
        "gradeA": 340.0,
        "gradeB": 120.0,
        "gradeC": 25.0,
        "total": 485.0
      },
      "harvests": [ ... ],
      "statusChanges": [ ... ],
      "archivedAt": "2025-11-01T00:00:00.000Z",
      "archivedBy": "user-uuid"
    }
  ],
  "meta": {
    "total": 3,
    "page": 1,
    "perPage": 20,
    "totalPages": 1
  }
}
```

**Note:** Archives are automatically created when block transitions from CLEANING → EMPTY

---

#### Get Block Cycle History
```
GET /api/v1/farm/farms/{farmId}/blocks/{blockId}/archives/history
```
**Purpose:** Get complete cycle history with statistics for a block
**Authentication:** Required (Bearer Token)
**Path Parameters:** `farmId` (UUID), `blockId` (UUID)

**Response:** 200 OK
```json
{
  "data": {
    "totalCycles": 5,
    "statistics": {
      "averageEfficiency": 94.2,
      "averageDuration": 88.4,
      "totalYield": 2425.0,
      "yieldUnit": "kg"
    },
    "bestCycle": {
      "archiveId": "uuid-here",
      "plantName": "Tomato - Roma",
      "yieldEfficiency": 98.5,
      "cycleDuration": 85,
      "plantedDate": "2025-06-01"
    },
    "worstCycle": {
      "archiveId": "uuid-here",
      "plantName": "Tomato - Roma",
      "yieldEfficiency": 87.0,
      "cycleDuration": 95,
      "plantedDate": "2025-02-01"
    },
    "cropsGrown": [
      {
        "plantDataId": "plant-uuid",
        "plantName": "Tomato - Roma",
        "cycles": 3,
        "averageEfficiency": 95.0
      },
      {
        "plantDataId": "plant-uuid",
        "plantName": "Lettuce - Romaine",
        "cycles": 2,
        "averageEfficiency": 93.0
      }
    ],
    "recentCycles": [ ... ]
  }
}
```

---

#### List Farm Archives
```
GET /api/v1/farm/farms/{farmId}/archives
```
**Purpose:** Get all archived cycles across all blocks in a farm
**Authentication:** Required (Bearer Token)
**Path Parameters:** `farmId` (UUID)
**Query Parameters:**
- `page`, `perPage`: Pagination
- `cropId` (UUID, optional): Filter by crop/plant data ID
- `startDate`, `endDate`: Filter by planting date range

**Response:** 200 OK (Paginated list of archives across farm)

---

#### Get Archive Analytics
```
GET /api/v1/farm/archives/analytics
```
**Purpose:** Get comprehensive performance analytics across farms
**Authentication:** Required (Bearer Token)
**Query Parameters:**
- `farmId` (UUID, optional): Filter by specific farm
- `cropId` (UUID, optional): Filter by specific crop
- `startDate`, `endDate`: Date range filter

**Response:** 200 OK
```json
{
  "data": {
    "totalCycles": 25,
    "totalFarms": 3,
    "totalBlocks": 12,
    "overallStats": {
      "averageEfficiency": 92.5,
      "averageDuration": 87.2,
      "totalYield": 12500.0,
      "yieldUnit": "kg"
    },
    "byFarm": [ ... ],
    "byCrop": [ ... ],
    "trends": {
      "efficiencyTrend": "improving",
      "efficiencyChange": 2.5
    }
  }
}
```

---

#### Compare Crop Performance
```
POST /api/v1/farm/archives/compare-crops
```
**Purpose:** Compare performance of different crops
**Authentication:** Required (Bearer Token)
**Request Body:**
```json
{
  "cropIds": ["crop-uuid-1", "crop-uuid-2"],
  "farmId": "farm-uuid"
}
```

**Response:** 200 OK
```json
{
  "data": {
    "crops": [
      {
        "plantDataId": "crop-uuid-1",
        "plantName": "Tomato - Roma",
        "totalCycles": 15,
        "averageEfficiency": 94.0,
        "averageDuration": 90,
        "totalYield": 7500.0,
        "yieldUnit": "kg"
      },
      {
        "plantDataId": "crop-uuid-2",
        "plantName": "Lettuce - Romaine",
        "totalCycles": 20,
        "averageEfficiency": 91.0,
        "averageDuration": 45,
        "totalYield": 2000.0,
        "yieldUnit": "kg"
      }
    ],
    "bestPerformer": "crop-uuid-1",
    "recommendation": "Tomato - Roma shows 3% higher efficiency"
  }
}
```

---

#### Get Top Performing Blocks
```
GET /api/v1/farm/farms/{farmId}/archives/top-blocks
```
**Purpose:** Get best performing blocks by efficiency
**Authentication:** Required (Bearer Token)
**Path Parameters:** `farmId` (UUID)
**Query Parameters:**
- `limit` (integer, default: 10): Number of top blocks to return
- `cropId` (UUID, optional): Filter by specific crop

**Response:** 200 OK
```json
{
  "data": [
    {
      "blockId": "block-uuid",
      "blockCode": "F001-003",
      "blockName": "Greenhouse Block A3",
      "averageEfficiency": 96.5,
      "totalCycles": 4,
      "lastCycleDate": "2025-11-01"
    }
  ]
}
```

---

#### Get Efficiency Trends
```
GET /api/v1/farm/farms/{farmId}/archives/efficiency-trends
```
**Purpose:** Get efficiency trends over time for performance monitoring
**Authentication:** Required (Bearer Token)
**Path Parameters:** `farmId` (UUID)
**Query Parameters:**
- `blockId` (UUID, optional): Filter by specific block
- `cropId` (UUID, optional): Filter by specific crop
- `months` (integer, default: 6): Number of months to analyze

**Response:** 200 OK
```json
{
  "data": {
    "timeline": [
      {
        "month": "2025-06",
        "averageEfficiency": 89.5,
        "cyclesCompleted": 3
      },
      {
        "month": "2025-07",
        "averageEfficiency": 91.0,
        "cyclesCompleted": 4
      },
      {
        "month": "2025-08",
        "averageEfficiency": 93.5,
        "cyclesCompleted": 5
      }
    ],
    "trend": "improving",
    "trendPercent": 4.5,
    "recommendation": "Efficiency improving consistently - current practices are effective"
  }
}
```

---

### Farm Management Endpoints Summary

| Category | Endpoints | Status | Version |
|----------|-----------|--------|---------|
| **Farms** | 6 endpoints | ✅ Active | v1.5.0 |
| **Blocks (Core)** | 6 endpoints | ✅ Active | v1.7.0 |
| **Harvests** | 7 endpoints | ✅ Active | v1.7.0 |
| **Alerts** | 8 endpoints | ✅ Active | v1.7.0 |
| **Archives & Analytics** | 11 endpoints | ✅ Active | v1.7.0 |
| **Plant Data (Legacy)** | 7 endpoints | ✅ Active | v1.5.0 |
| **Plant Data Enhanced** | 9 endpoints | ✅ Active | v1.6.0 |
| **Plantings** | 4 endpoints | ✅ Active | v1.5.0 |
| **Managers** | 1 endpoint | ✅ Active | v1.7.0 |
| **Total** | **59 endpoints** | ✅ Active | - |

**Microservice Details:**
- **Port:** 8001 (internal), proxied via nginx
- **Database:** MongoDB (separate from main API)
- **Authentication:** Shared JWT system with main API
- **Authorization:** Role-based (Agronomist role for plant data modifications)
- **Documentation:** See `modules/farm-management/README.md` for detailed docs

**Sample Data:**
- 3 complete plant examples included (Tomato, Lettuce, Strawberry)
- Demonstrates all 13 field groups with realistic agronomic data

**Documentation Reference:**
- Detailed documentation: `Docs/2-Working-Progress/farm-management/`
- API summary: `modules/farm-management/PLANT_DATA_API_SUMMARY.md`
- Schema design: `modules/farm-management/docs/PLANT_DATA_SCHEMA_SUMMARY.md`
- Test report: `Docs/2-Working-Progress/plant-data-enhanced-api-test-report.md`

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

---

### Dashboard & Widgets
**Status:** ✅ **IMPLEMENTED** (v1.4.0 - 2025-10-28)

#### Dashboard Health Check
```
GET /api/v1/dashboard/health
```
**Purpose:** Check if dashboard API is operational
**Authentication:** None
**Rate Limit:** None
**Response:** 200 OK
```json
{
  "status": "healthy",
  "service": "Dashboard API",
  "endpoints": 3
}
```

---

#### Get Widget Data
```
GET /api/v1/dashboard/widgets/{widgetId}/data
```
**Purpose:** Fetch data for a specific dashboard widget by ID
**Authentication:** Required (Bearer Token)
**Rate Limit:** User (100 req/min)
**Path Parameters:**
- `widgetId`: Unique widget identifier (e.g., "sales-trend-chart", "total-users")

**Supported Widget IDs:**
- Charts: `sales-trend-chart`, `revenue-breakdown-chart`, `user-activity-chart`
- Stats: `total-users`, `active-sessions`, `api-requests`

**Response:** 200 OK (Chart Widget)
```json
{
  "widgetId": "sales-trend-chart",
  "data": {
    "chartType": "line",
    "data": [
      {"date": "Mon", "sales": 4200, "revenue": 12500},
      {"date": "Tue", "sales": 5100, "revenue": 15300}
    ],
    "xKey": "date",
    "yKey": "sales",
    "series": [
      {"name": "Sales", "dataKey": "sales", "color": "#3b82f6"},
      {"name": "Revenue", "dataKey": "revenue", "color": "#10b981"}
    ]
  },
  "lastUpdated": "2025-10-28T07:45:00.000000"
}
```

**Response:** 200 OK (Stat Widget)
```json
{
  "widgetId": "total-users",
  "data": {
    "value": "17,427",
    "label": "Total Users",
    "trend": 6.9,
    "trendLabel": "vs last month"
  },
  "lastUpdated": "2025-10-28T07:45:00.000000"
}
```

**Errors:**
- 401: Unauthorized (missing or invalid token)
- 404: Widget not found (unknown widgetId)
- 500: Internal server error

---

#### Refresh Widget Data
```
POST /api/v1/dashboard/widgets/{widgetId}/refresh
```
**Purpose:** Force refresh data for a specific dashboard widget (bypasses cache)
**Authentication:** Required (Bearer Token)
**Rate Limit:** User (100 req/min)
**Path Parameters:**
- `widgetId`: Unique widget identifier

**Response:** 200 OK
Same format as GET /widgets/{widgetId}/data

**Errors:**
- 401: Unauthorized
- 404: Widget not found
- 500: Internal server error

---

#### Get Bulk Widget Data
```
POST /api/v1/dashboard/widgets/bulk
```
**Purpose:** Fetch data for multiple dashboard widgets in a single request (more efficient than individual requests)
**Authentication:** Required (Bearer Token)
**Rate Limit:** User (100 req/min)
**Request Body:**
```json
{
  "widgetIds": [
    "total-users",
    "sales-trend-chart",
    "revenue-breakdown-chart"
  ]
}
```

**Limits:**
- Minimum: 1 widget ID
- Maximum: 50 widget IDs per request

**Response:** 200 OK
```json
{
  "widgets": [
    {
      "widgetId": "total-users",
      "data": {
        "value": "17,427",
        "label": "Total Users",
        "trend": 6.9
      },
      "lastUpdated": "2025-10-28T07:45:00"
    },
    {
      "widgetId": "sales-trend-chart",
      "data": {
        "chartType": "line",
        "data": [...],
        "xKey": "date",
        "yKey": "sales"
      },
      "lastUpdated": "2025-10-28T07:45:00"
    }
  ],
  "requestedCount": 3,
  "returnedCount": 2,
  "errors": [
    {
      "widgetId": "invalid-widget",
      "error": "Unknown widget_id: invalid-widget"
    }
  ]
}
```

**Notes:**
- Partial failures are supported: successful widgets are returned even if some fail
- Check the `errors` array for failed widgets
- `returnedCount` may be less than `requestedCount` if some widgets fail

**Errors:**
- 400: Invalid request (empty widget list, too many widgets)
- 401: Unauthorized
- 500: Internal server error

---

**Dashboard Endpoints Summary:**
| Method | Endpoint | Purpose | Auth | Implemented |
|--------|----------|---------|------|-------------|
| GET | `/dashboard/health` | Check dashboard API health | No | ✅ v1.4.0 |
| GET | `/dashboard/widgets/{id}/data` | Get single widget data | Yes | ✅ v1.4.0 |
| POST | `/dashboard/widgets/{id}/refresh` | Refresh single widget | Yes | ✅ v1.4.0 |
| POST | `/dashboard/widgets/bulk` | Get multiple widgets data | Yes | ✅ v1.4.0 |

**Chart Types Supported:**
- **Line Chart:** Multi-series trend analysis (e.g., sales over time)
- **Bar Chart:** Multi-series comparison (e.g., daily user activity)
- **Pie Chart:** Distribution visualization (e.g., revenue breakdown)

**Mock Data:**
Current implementation uses mock data generators for development/testing:
- Sales trend data (7 days, random variance)
- Revenue breakdown by category (5 categories)
- User activity metrics (7 days, weekday/weekend variance)
- Total users stat (15K-18K range)
- Active sessions stat (2K-3.5K range)
- API requests stat (250K-500K range)

**Future Enhancements:**
- Real-time data integration with modules
- System metrics (CPU, memory, disk, network)
- External API data sources
- Custom widget creation
- Widget persistence (save user-specific dashboard layouts)
- Widget permissions (role-based widget visibility)

---

## API Changelog

### v1.6.0 - 2025-10-31
- ✅ **Farm Management Module - Plant Data Enhanced API** documented
- ✅ 9 comprehensive plant data management endpoints
- ✅ 13 field groups for agronomic knowledge base
- ✅ Advanced search and filtering (7 filter options)
- ✅ Soft delete with audit trail (deletedAt timestamp)
- ✅ Clone functionality for plant variations
- ✅ CSV template export for bulk import
- ✅ Data versioning system (increments on updates)
- ✅ 10 strategic database indexes (~90% query performance improvement)
- ✅ Agronomist role-based permissions
- ✅ 3 sample plants included (Tomato, Lettuce, Strawberry)
- ✅ Farm Management Module summary added (34 total endpoints)

### v1.5.0 - 2025-10-30
- ✅ **Farm Management Module - Planting Service** implemented
- ✅ 4 planting management endpoints (create plan, mark planted, get, list)
- ✅ Yield prediction calculation
- ✅ Block state integration (planned → planted)
- ✅ Harvest date calculation based on growth cycle

### v1.4.0 - 2025-10-28
- ✅ **Dashboard & Widget API** implemented
- ✅ 4 dashboard endpoints (health, get widget data, refresh widget, bulk fetch)
- ✅ Chart widget support (line, bar, pie charts)
- ✅ Stat widget support (metrics with trends)
- ✅ Mock data generators for development/testing
- ✅ Pydantic models for dashboard data validation
- ✅ Dashboard service layer for data management
- ✅ Multi-series chart support (multiple data series per chart)
- ✅ Bulk widget data fetching (up to 50 widgets per request)
- ✅ Partial failure support (returns successful widgets even if some fail)
- ✅ Widget authentication (requires JWT bearer token)

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
