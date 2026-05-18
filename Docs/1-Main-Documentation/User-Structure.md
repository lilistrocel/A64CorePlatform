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

## Sidebar Navigation

### Tools Group (v1.14.0)

A new collapsible "Tools" sidebar group has been added, visible to all authenticated users regardless of industry type. It contains two child pages:

**Fertilizer Cost Calculator** (`/tools/fertilizer-calculator`): Allows users to build a crop-and-points list, run a fertigation cost calculation against the plant library schedules, view per-crop ingredient breakdowns with prices in AED, and export/import via XLSX. Includes a collapsible Price Book panel showing all chemicals with inline price editing, and a Saved Lists feature for re-using common crop configurations.

**Chemicals Catalog** (`/tools/chemicals`): Full CRUD management for the master chemicals list used by the Fertilizer Cost Calculator. Supports adding chemicals with name/aliases/category/unit, editing, archiving (with a dependent-plants confirmation flow when the chemical is referenced by plant data), and auto-discovery of chemicals from fertigation schedules in the Plant Library.

The sidebar group uses an expandable row pattern with a chevron indicator. Expanded state is persisted per-user in `localStorage` under the key `sidebar.expanded.{userId}`. If any child route is active, the group header receives a subtle "child-active" highlight. This is the first use of the nested `NavItemDef` (with `children[]` field) in `MainLayout.tsx`.

---

### Plant Library — Fertigation Schedule Editor (v1.15.0)

Privileged roles (`admin`, `agronomist`, `super_admin`, `moderator`) can create and edit the fertigation schedule attached to each Plant Library entry directly from the detail view.

**Entry point**: `PlantDataDetail` Section 11 ("Fertigation Schedule"). For users with the above roles, an "Edit Schedule" button appears next to the section header. If no schedule exists yet, the section always renders (for privileged users) with a "Create Fertigation Schedule" call-to-action. For non-privileged users the section is still shown if a schedule exists (read-only), and hidden when no schedule is present.

**Editor component**: `FertigationScheduleEditorModal` (`frontend/user-portal/src/components/farm/FertigationScheduleEditorModal.tsx`). This modal manages a full local draft of the `FertigationSchedule` structure:

- **Cards** — each card covers a growth-stage day range with a name, growth stage label, `dayStart`/`dayEnd`, active flag, optional notes, and one or more rules.
- **Rules** — each rule can be `interval` (frequency + optional active-day window + ingredients list) or `custom` (one or more applications, each with a day number + ingredients). Switching types with existing data shows an inline confirmation warning.
- **Ingredients** — each ingredient has a chemical name (typeahead against the Chemicals Catalog), category, dosage-per-point, and unit. Selecting a chemical from the catalog locks the name; an inline "Add to Chemicals Catalog" form is available when a typed name doesn't match any existing chemical.
- **Save flow** — on save, `totalFertilizationDays` is auto-derived as `max(card.dayEnd)` across all cards. The full schedule is submitted via `PATCH /api/v1/farm/plant-data-enhanced/{id}` (`updatePlantDataEnhanced`). On success the parent detail view refetches the plant record. The modal never closes on overlay click; X button only.

**Role gate implementation** (matches the pattern used in `ChemicalsCatalog.tsx`):
```typescript
const canEditFertigation = ['admin', 'agronomist', 'super_admin', 'moderator'].includes(
  currentUser?.role ?? ''
);
```

**Type changes**: `PlantDataEnhancedUpdate` now includes `fertigationSchedule?: FertigationSchedule`. `CustomApplication` now includes `notes?: string` to mirror the backend model.

---

## Change Log

### v1.16.0 - 2026-05-11

#### Fertilizer Cost Calculator — Dripper Mode / Yield Mode Toggle

The Crop List panel in the Fertilizer Cost Calculator (`/tools/fertilizer-calculator`) now supports
two input modes, switchable via a segmented toggle at the top of the panel:

**Dripper Mode** (default, unchanged behaviour):
- Users enter dripper/point counts per crop directly.
- A new read-only "Est. Yield" column shows the equivalent yield computed as
  `points × yieldPerDripper`, where `yieldPerDripper = yieldPerPlant × seedsPerPlantingPoint × (1 − expectedWastePercentage / 100)`.
- Yield is shown greyed-out, formatted with commas and up to 2 decimal places, next to the plant's `yieldUnit`.

**Yield Mode**:
- The Points/Drippers input is replaced by a "Target Yield" input. The unit (e.g. `kg`) is shown
  per row from the plant's `yieldInfo.yieldUnit`, not as a global header label.
- A read-only "Drippers (auto)" column shows `ceil(targetYield / yieldPerDripper)`.
- Plants with missing or zero yieldInfo show "— no yield data" with a tooltip.

**Mode switching converts row values in place:**
- Dripper → Yield: pre-populates target yield from current point count (1 decimal place).
- Yield → Dripper: recalculates drippers from current target yield (ceiling).

**Persistence:**
- The selected mode is stored per user in `localStorage` under key `fertCalc.mode.<userId>`.
  Default is `dripper` if no preference is stored.
- `targetYield` is included in the per-user draft stored at `fertCalc.draft.<userId>`, so
  in-progress yield entries survive a page refresh.
- Saved lists on the backend always store drippers only (`points`). `targetYield` is UI-only.

**Yield data hydration (strategy A):**
- `yieldInfo` is embedded into each `CropListRow` at typeahead-pick time (from the
  `/v1/farm/plant-data-enhanced` search response).
- When loading a saved list, the existing `hydratePlantNames` `Promise.all` also pulls
  `yieldInfo` from `getPlantDataEnhancedById`, adding zero extra network round-trips.

**Calculate / Export / Save** always read `points`, which is always kept up-to-date.
No backend changes are required by this feature.

### v1.15.0 - 2026-05-08
- Added Fertigation Schedule editor modal for Plant Library (FertigationScheduleEditorModal)
- Edit/Create entry point wired into PlantDataDetail Section 11 with agronomist role gate
- PlantDataEnhancedUpdate type extended with fertigationSchedule field
- CustomApplication type extended with optional notes field

### v1.14.0 - 2026-05-07
- Added Tools sidebar group with Fertilizer Cost Calculator and Chemicals Catalog pages
- Extended `NavItemDef` in `MainLayout.tsx` to support `children[]` and `defaultExpanded`

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
