# User Structure Documentation

## Overview
This document serves as the single source of truth for user management, roles, permissions, and authentication in the A64 Core Platform. **ALWAYS check and update this file before implementing user-related features or modifying authentication/authorization logic.**

## Table of Contents
- [User Model](#user-model)
- [User Roles](#user-roles)
- [Permissions Matrix](#permissions-matrix)
- [Authentication Flow](#authentication-flow)
- [User Lifecycle](#user-lifecycle)
- [Security Requirements](#security-requirements)
- [Database Schema](#database-schema)

## User Model

### Core User Attributes

| Field | Type | Required | Unique | Description |
|-------|------|----------|--------|-------------|
| userId | UUID | Yes | Yes | Primary identifier (MongoDB: _id, MySQL: uuid) |
| email | String | Yes | Yes | User's email address (login identifier) |
| passwordHash | String | Yes | No | Bcrypt hashed password (never store plain text) |
| firstName | String | Yes | No | User's first name |
| lastName | String | Yes | No | User's last name |
| role | Enum | Yes | No | User role (see User Roles section) |
| isActive | Boolean | Yes | No | Account activation status |
| isEmailVerified | Boolean | Yes | No | Email verification status |
| lastLoginAt | DateTime | No | No | Last successful login timestamp |
| createdAt | DateTime | Yes | No | Account creation timestamp |
| updatedAt | DateTime | Yes | No | Last update timestamp |
| deletedAt | DateTime | No | No | Soft delete timestamp (null if active) |

### Optional User Attributes

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| phone | String | No | Phone number (E.164 format) |
| avatar | String | No | URL to user avatar image |
| timezone | String | No | User's preferred timezone (IANA format) |
| locale | String | No | Preferred language (ISO 639-1 code) |
| metadata | JSON | No | Additional flexible user data |

### User Model Example (MongoDB)
```json
{
  "_id": "507f1f77bcf86cd799439011",
  "userId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "email": "user@example.com",
  "passwordHash": "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYIeWVIr9..",
  "firstName": "John",
  "lastName": "Doe",
  "role": "user",
  "isActive": true,
  "isEmailVerified": true,
  "phone": "+1234567890",
  "avatar": "https://example.com/avatars/user.jpg",
  "timezone": "America/New_York",
  "locale": "en",
  "lastLoginAt": "2025-10-16T10:30:00.000Z",
  "createdAt": "2025-01-15T10:00:00.000Z",
  "updatedAt": "2025-10-16T10:30:00.000Z",
  "deletedAt": null,
  "metadata": {
    "preferences": {
      "theme": "dark",
      "notifications": true
    }
  }
}
```

## User Roles

### Role Hierarchy

The platform uses a role-based access control (RBAC) system with the following hierarchy:

1. **Super Admin** (highest privilege)
2. **Admin**
3. **Moderator**
4. **User** (default role)
5. **Guest** (lowest privilege)

### Role Definitions

#### Super Admin
**Purpose:** Full system access, platform management

**Capabilities:**
- All Admin capabilities
- Manage other admins
- System configuration changes
- Access to all data and logs
- Irreversible operations (bulk delete, database management)
- Platform-wide settings

**Assignment:** Manual assignment only, requires approval from existing Super Admin

---

#### Admin
**Purpose:** Organization/tenant management

**Capabilities:**
- All Moderator capabilities
- Manage users within their organization
- Create and assign Moderator roles
- View analytics and reports
- Manage organization settings
- Bulk operations within organization

**Assignment:** Assigned by Super Admin

---

#### Moderator
**Purpose:** Content moderation and user support

**Capabilities:**
- All User capabilities
- View and moderate user-generated content
- Temporarily suspend users
- Access moderation logs
- Respond to user reports
- Limited analytics access

**Assignment:** Assigned by Admin or Super Admin

---

#### User (Default)
**Purpose:** Standard platform user

**Capabilities:**
- Full access to own account
- Create, read, update, delete own resources
- View public content
- Interact with platform features
- Cannot modify other users' data

**Assignment:** Automatic on registration

---

#### Guest
**Purpose:** Limited read-only access

**Capabilities:**
- View public content only
- No write operations
- No personal data access
- Cannot create resources
- Rate-limited API access

**Assignment:** Unauthenticated requests or explicit guest registration

---

### Role Enum Values

**MongoDB/JSON:**
```javascript
const UserRole = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  MODERATOR: 'moderator',
  USER: 'user',
  GUEST: 'guest'
}
```

**MySQL/Database:**
```sql
ENUM('super_admin', 'admin', 'moderator', 'user', 'guest')
```

## Permissions Matrix

### API Endpoint Permissions

| Endpoint | Super Admin | Admin | Moderator | User | Guest |
|----------|-------------|-------|-----------|------|-------|
| **Authentication** |
| POST /auth/login | ✅ | ✅ | ✅ | ✅ | ✅ |
| POST /auth/logout | ✅ | ✅ | ✅ | ✅ | ✅ |
| POST /auth/register | ✅ | ✅ | ✅ | ✅ | ❌ |
| POST /auth/refresh | ✅ | ✅ | ✅ | ✅ | ❌ |
| **User Management** |
| GET /users | ✅ | ✅ (org only) | ✅ (limited) | ❌ | ❌ |
| GET /users/me | ✅ | ✅ | ✅ | ✅ | ❌ |
| GET /users/{userId} | ✅ | ✅ (org only) | ✅ (limited) | ✅ (self only) | ❌ |
| POST /users | ✅ | ✅ | ❌ | ❌ | ❌ |
| PATCH /users/{userId} | ✅ | ✅ (org only) | ❌ | ✅ (self only) | ❌ |
| DELETE /users/{userId} | ✅ | ✅ (org only) | ❌ | ✅ (self only) | ❌ |
| PATCH /users/{userId}/role | ✅ | ✅ (limited) | ❌ | ❌ | ❌ |
| **System Operations** |
| GET /system/health | ✅ | ✅ | ✅ | ✅ | ✅ |
| GET /system/stats | ✅ | ✅ | ✅ (limited) | ❌ | ❌ |
| POST /system/backup | ✅ | ❌ | ❌ | ❌ | ❌ |

### Resource Permissions

| Operation | Super Admin | Admin | Moderator | User | Guest |
|-----------|-------------|-------|-----------|------|-------|
| Create Resource | ✅ | ✅ | ✅ | ✅ | ❌ |
| Read Own Resource | ✅ | ✅ | ✅ | ✅ | ✅ (public only) |
| Read Any Resource | ✅ | ✅ (org only) | ✅ (limited) | ❌ | ❌ |
| Update Own Resource | ✅ | ✅ | ✅ | ✅ | ❌ |
| Update Any Resource | ✅ | ✅ (org only) | ❌ | ❌ | ❌ |
| Delete Own Resource | ✅ | ✅ | ✅ | ✅ | ❌ |
| Delete Any Resource | ✅ | ✅ (org only) | ❌ | ❌ | ❌ |

## Authentication Flow

### Registration Flow

```
1. User submits registration (email, password, name)
   ↓
2. System validates input
   - Email format check
   - Password strength check
   - Email uniqueness check
   ↓
3. System creates user account
   - Hash password with bcrypt (cost factor: 12)
   - Generate UUID
   - Set role to 'user'
   - Set isActive = true, isEmailVerified = false
   ↓
4. System sends verification email
   - Generate email verification token (JWT, 24h expiry)
   - Send email with verification link
   ↓
5. Return success response (without sensitive data)
```

### Login Flow

```
1. User submits credentials (email, password)
   ↓
2. System validates credentials
   - Find user by email
   - Check user isActive = true
   - Compare password with bcrypt
   ↓
3. If valid, generate tokens
   - Access Token: JWT, 1 hour expiry
   - Refresh Token: JWT, 7 days expiry (stored in DB)
   ↓
4. Update user record
   - Set lastLoginAt to current timestamp
   ↓
5. Return tokens and user info
```

### Token Validation Flow

```
1. Client sends request with Authorization header
   ↓
2. Middleware extracts token from header
   - Format: "Bearer {token}"
   ↓
3. Middleware validates JWT
   - Verify signature
   - Check expiry
   - Extract userId from payload
   ↓
4. Middleware fetches user from database
   - Verify user exists
   - Check isActive = true
   ↓
5. Attach user object to request
   ↓
6. Proceed to route handler
```

### Logout Flow

```
1. User sends logout request with access token
   ↓
2. System validates token
   ↓
3. System invalidates refresh token
   - Mark token as revoked in database
   - Or delete from token store
   ↓
4. Return success response
   ↓
5. Client discards access token
```

## User Lifecycle

### State Diagram

```
[Registered] → [Active] → [Suspended] → [Active]
     ↓            ↓            ↓
     └──────→ [Deleted] ←──────┘
```

### State Definitions

**Registered (Unverified)**
- Account created but email not verified
- Can login but limited functionality
- Auto-delete after 30 days if not verified

**Active**
- Email verified
- Full access to permitted features
- Normal operational state

**Suspended**
- Temporarily disabled by admin/moderator
- Cannot login
- Data preserved
- Can be reactivated

**Deleted (Soft Delete)**
- User requested deletion or admin action
- `deletedAt` timestamp set
- Cannot login
- Data retained for 90 days then hard deleted
- Can be restored within 90 days

## Security Requirements

### Password Requirements

**Minimum Requirements:**
- Length: 8-128 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character (!@#$%^&*)

**Hashing:**
- Algorithm: bcrypt
- Cost factor: 12 (2^12 iterations)
- Salt: Automatically generated per password

### JWT Token Configuration

**Access Token:**
- Algorithm: HS256 (HMAC-SHA256)
- Expiry: 1 hour
- Payload: { userId, email, role }
- Secret: Environment variable (SECRET_KEY)

**Refresh Token:**
- Algorithm: HS256
- Expiry: 7 days
- Payload: { userId, tokenId }
- Stored in database for validation
- One-time use (rotating refresh tokens)

### Rate Limiting

**Login Attempts:**
- Max: 5 failed attempts per email
- Lockout duration: 15 minutes
- Counter reset on successful login

**API Requests:**
- Guest: 10 requests/minute
- User: 100 requests/minute
- Moderator: 200 requests/minute
- Admin: 500 requests/minute
- Super Admin: 1000 requests/minute

### Security Best Practices

1. **Never store passwords in plain text**
2. **Never log passwords or tokens**
3. **Always use HTTPS in production**
4. **Implement CSRF protection**
5. **Sanitize all user inputs**
6. **Use parameterized queries (prevent SQL injection)**
7. **Validate all tokens server-side**
8. **Rotate JWT secret keys periodically**
9. **Implement account lockout after failed attempts**
10. **Use secure, httpOnly cookies for refresh tokens**

## Database Schema

### MongoDB Collection: `users`

```javascript
{
  _id: ObjectId,                    // MongoDB ObjectId
  userId: String (UUID),            // Unique identifier
  email: String (indexed, unique),  // Email address
  passwordHash: String,             // Bcrypt hash
  firstName: String,                // First name
  lastName: String,                 // Last name
  role: String (enum),              // User role
  isActive: Boolean,                // Active status
  isEmailVerified: Boolean,         // Email verified
  phone: String (optional),         // Phone number
  avatar: String (optional),        // Avatar URL
  timezone: String (optional),      // Timezone
  locale: String (optional),        // Language
  lastLoginAt: Date (optional),     // Last login
  createdAt: Date,                  // Creation timestamp
  updatedAt: Date,                  // Update timestamp
  deletedAt: Date (optional),       // Soft delete
  metadata: Object (optional)       // Additional data
}

// Indexes
db.users.createIndex({ email: 1 }, { unique: true })
db.users.createIndex({ userId: 1 }, { unique: true })
db.users.createIndex({ role: 1 })
db.users.createIndex({ createdAt: -1 })
```

### MySQL Table: `users`

```sql
CREATE TABLE users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id VARCHAR(36) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  role ENUM('super_admin', 'admin', 'moderator', 'user', 'guest') NOT NULL DEFAULT 'user',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  phone VARCHAR(20),
  avatar VARCHAR(500),
  timezone VARCHAR(50),
  locale VARCHAR(10),
  last_login_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL,
  metadata JSON,

  INDEX idx_email (email),
  INDEX idx_user_id (user_id),
  INDEX idx_role (role),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### MongoDB Collection: `refresh_tokens`

```javascript
{
  _id: ObjectId,
  tokenId: String (UUID),           // Unique token identifier
  userId: String (UUID),            // Reference to user
  token: String,                    // JWT refresh token
  expiresAt: Date,                  // Expiration date
  isRevoked: Boolean,               // Revoked status
  createdAt: Date,                  // Creation timestamp
  lastUsedAt: Date (optional)       // Last use timestamp
}

// Indexes
db.refresh_tokens.createIndex({ tokenId: 1 }, { unique: true })
db.refresh_tokens.createIndex({ userId: 1 })
db.refresh_tokens.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }) // TTL index
```

### MySQL Table: `refresh_tokens`

```sql
CREATE TABLE refresh_tokens (
  id INT PRIMARY KEY AUTO_INCREMENT,
  token_id VARCHAR(36) UNIQUE NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  token TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMP NULL,

  INDEX idx_token_id (token_id),
  INDEX idx_user_id (user_id),
  INDEX idx_expires_at (expires_at),
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## Development Guidelines

### Before Implementing User Features

1. ✅ Check this document for user model structure
2. ✅ Verify role permissions in the matrix
3. ✅ Follow authentication flow diagrams
4. ✅ Implement security requirements
5. ✅ Update this document if adding new roles or permissions

### When Adding New Roles

1. Add role to Role Enum Values section
2. Update Permissions Matrix
3. Document role capabilities
4. Update database schema
5. Add migration scripts
6. Update API-Structure.md

### When Adding New Permissions

1. Update Permissions Matrix
2. Document permission logic
3. Implement middleware checks
4. Add to authorization tests
5. Update API-Structure.md

---

## Change Log

### v1.0.0 - 2025-10-16
- Initial user structure definition
- Defined 5 user roles (Super Admin, Admin, Moderator, User, Guest)
- Created permissions matrix
- Documented authentication flows
- Defined database schemas for MongoDB and MySQL

---

## References

- [API-Structure.md](./API-Structure.md) - API endpoints and authentication
- [Versioning.md](./Versioning.md) - Version management
- [CLAUDE.md](../../CLAUDE.md) - Development guidelines
- [bcrypt documentation](https://github.com/kelektiv/node.bcrypt.js)
- [JWT.io](https://jwt.io/) - JSON Web Tokens
