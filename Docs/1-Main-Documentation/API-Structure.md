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

### Users
*To be implemented*

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
