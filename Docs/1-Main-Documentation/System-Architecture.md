# System Architecture Documentation

## Overview
This document serves as the **single source of truth** for the A64 Core Platform's framework, system design, and architecture. **ALWAYS check and update this file when implementing or modifying system architecture, infrastructure, or core components.**

---

## Table of Contents
- [System Overview](#system-overview)
- [Architecture Principles](#architecture-principles)
- [Technology Stack](#technology-stack)
- [System Components](#system-components)
- [Architecture Layers](#architecture-layers)
- [Data Flow](#data-flow)
- [Database Architecture](#database-architecture)
- [Security Architecture](#security-architecture)
- [Deployment Architecture](#deployment-architecture)
- [Scalability & Performance](#scalability--performance)
- [Monitoring & Logging](#monitoring--logging)
- [Development Guidelines](#development-guidelines)

---

## System Overview

### Project Information
- **Name:** A64 Core Platform API Hub
- **Type:** RESTful API Backend with Authentication & User Management
- **Version:** v1.1.0
- **Architecture Pattern:** Layered Architecture (Service Layer Pattern)
- **Deployment:** Docker Containerized Microservices

### Core Purpose
A secure, scalable API platform providing:
1. **Authentication & Authorization** - JWT-based auth with RBAC
2. **User Management** - Complete user lifecycle management
3. **Email Verification** - Automated email verification flow
4. **Password Management** - Secure password reset flow
5. **Rate Limiting** - Role-based and login attempt limiting
6. **Extensible API Framework** - Foundation for future features

---

## Architecture Principles

### Design Philosophy

#### 1. KISS (Keep It Simple, Stupid)
- Favor simple, straightforward solutions over complex ones
- Easy to understand, maintain, and debug
- Clear separation of concerns

#### 2. YAGNI (You Aren't Gonna Need It)
- Implement features only when needed
- No speculative development
- Avoid premature optimization

#### 3. SOLID Principles

**Single Responsibility Principle**
- Each module/class has one clear purpose
- Example: `auth_service.py` handles authentication logic only
- Example: `user_service.py` handles user CRUD operations only

**Open/Closed Principle**
- Open for extension, closed for modification
- Example: Role-based permissions can be extended without modifying core auth

**Dependency Inversion**
- High-level modules depend on abstractions
- Example: Services depend on database interface, not implementation

**Interface Segregation**
- Specific interfaces over general-purpose ones
- Example: Separate authentication and authorization middleware

**Liskov Substitution**
- Subtypes must be substitutable for base types
- Example: Different database implementations (MongoDB, MySQL) follow same interface

#### 4. Fail Fast
- Check for errors early
- Raise exceptions immediately
- Validate inputs at API boundary

---

## Technology Stack

### Backend Framework
- **FastAPI 0.109.0** - Modern async Python web framework
  - Built-in OpenAPI documentation (Swagger/ReDoc)
  - Pydantic for data validation
  - Async/await support throughout
  - Type hints for IDE support

### Programming Languages
- **Python 3.11+** - Primary backend language
- **JavaScript/Node.js** - Future frontend/embedded systems

### Databases

#### MongoDB 7.0 (NoSQL)
- **Purpose:** Flexible document storage for users, tokens
- **Driver:** Motor (async driver for asyncio)
- **Connection Pooling:** 10-50 connections
- **Collections:**
  - `users` - User accounts and profiles
  - `refresh_tokens` - JWT refresh tokens
  - `verification_tokens` - Email verification & password reset tokens

#### MySQL 8.0 (SQL)
- **Purpose:** ACID transactions, relational data
- **Driver:** aiomysql (async MySQL driver)
- **Connection Pooling:** 5-20 connections
- **Tables:**
  - `users` - User accounts (synced with MongoDB)
  - `refresh_tokens` - Token storage with foreign keys
  - Future: Complex relational data

### Security Libraries
- **passlib[bcrypt]** - Password hashing (bcrypt, cost factor 12)
- **python-jose[cryptography]** - JWT token creation/verification (HS256)
- **pydantic[email]** - Email validation

### Container & Orchestration
- **Docker** - Application containerization
- **Docker Compose** - Multi-container orchestration
- **Services:**
  - `api` - FastAPI application
  - `mongodb` - MongoDB database
  - `mysql` - MySQL database
  - `adminer` - Database management UI

### Development Tools
- **Git** - Version control
- **Python Virtual Environment** - Dependency isolation
- **pip** - Package management

---

## System Components

### Directory Structure

```
A64CorePlatform/
├── src/                          # Application source code
│   ├── api/                      # API layer
│   │   ├── v1/                   # API version 1
│   │   │   ├── auth.py           # Authentication endpoints (9 routes)
│   │   │   └── users.py          # User management endpoints (7 routes)
│   │   ├── health.py             # Health check endpoints
│   │   └── routes.py             # Router aggregation
│   │
│   ├── models/                   # Data models
│   │   └── user.py               # User & auth Pydantic models (16 models)
│   │
│   ├── services/                 # Business logic layer
│   │   ├── auth_service.py       # Authentication service (8 methods)
│   │   ├── user_service.py       # User management service (8 methods)
│   │   └── database.py           # Database connection managers
│   │
│   ├── middleware/               # Request/response middleware
│   │   ├── auth.py               # Authentication middleware (3 functions)
│   │   ├── permissions.py        # Authorization middleware (5 functions)
│   │   └── rate_limit.py         # Rate limiting (2 classes)
│   │
│   ├── utils/                    # Utility functions
│   │   ├── security.py           # Password & JWT utilities (10 functions)
│   │   └── email.py              # Email sending utilities (3 functions)
│   │
│   ├── config/                   # Configuration
│   │   └── settings.py           # Environment-based settings
│   │
│   └── main.py                   # Application entry point
│
├── Docs/                         # Documentation
│   ├── 1-Main-Documentation/     # Single source of truth
│   │   ├── System-Architecture.md   # THIS FILE
│   │   ├── User-Structure.md        # User system specification
│   │   ├── API-Structure.md         # API endpoint registry
│   │   └── Versioning.md            # Version management
│   │
│   ├── 2-Working-Progress/       # In-progress documentation
│   └── 3-DevLog/                 # Development logs
│
├── docker-compose.yml            # Container orchestration
├── Dockerfile                    # API container definition
├── requirements.txt              # Python dependencies
├── .env.example                  # Environment variables template
├── .gitignore                    # Git ignore rules
├── CLAUDE.md                     # Development guidelines & rules
├── README.md                     # Project setup & usage
├── CHANGELOG.md                  # Version history
└── DEPLOYMENT.md                 # Deployment instructions
```

---

## Architecture Layers

### Layer 1: API Layer (Presentation)
**Location:** `src/api/`

**Responsibility:** HTTP request/response handling

**Components:**
- **Routers** - Endpoint definitions
- **Request Models** - Input validation (Pydantic)
- **Response Models** - Output serialization (Pydantic)
- **Error Handlers** - HTTP exception handling

**Example Flow:**
```python
@router.post("/login", response_model=TokenResponse)
async def login(credentials: UserLogin) -> TokenResponse:
    # 1. Validate input (Pydantic automatic)
    # 2. Check rate limits (middleware)
    # 3. Call service layer
    token_response = await auth_service.login_user(credentials)
    # 4. Return response
    return token_response
```

**Rules:**
- ✅ DO: Validate inputs, call services, return responses
- ❌ DON'T: Business logic, database access, complex calculations

---

### Layer 2: Service Layer (Business Logic)
**Location:** `src/services/`

**Responsibility:** Business rules, data processing, orchestration

**Components:**
- **auth_service.py** - Authentication logic
  - User registration, login, logout
  - Token generation & validation
  - Email verification
  - Password reset
- **user_service.py** - User management logic
  - CRUD operations
  - Role management
  - User activation/deactivation

**Example Flow:**
```python
async def login_user(credentials: UserLogin) -> TokenResponse:
    # 1. Fetch user from database
    user_doc = await db.users.find_one({"email": credentials.email})

    # 2. Verify password (bcrypt)
    if not verify_password(credentials.password, user_doc["passwordHash"]):
        raise HTTPException(401, "Invalid credentials")

    # 3. Generate tokens
    access_token = create_access_token(user_id, email, role)
    refresh_token, token_id = create_refresh_token(user_id)

    # 4. Store refresh token
    await db.refresh_tokens.insert_one(token_doc)

    # 5. Update last login
    await db.users.update_one({"userId": user_id}, {"$set": {"lastLoginAt": now}})

    # 6. Return token response
    return TokenResponse(...)
```

**Rules:**
- ✅ DO: Business logic, orchestration, data transformation
- ❌ DON'T: HTTP handling, database implementation details

---

### Layer 3: Data Access Layer
**Location:** `src/services/database.py`

**Responsibility:** Database connection management, health checks

**Components:**
- **MongoDBManager** - MongoDB connection pooling & indexes
- **MySQLManager** - MySQL connection pooling & table creation

**Features:**
- Connection pooling (async)
- Auto-create indexes (MongoDB) / tables (MySQL)
- Health check endpoints
- Graceful shutdown

**Rules:**
- ✅ DO: Connection management, query execution, schema creation
- ❌ DON'T: Business logic, HTTP handling

---

### Layer 4: Cross-Cutting Concerns

#### Middleware Layer
**Location:** `src/middleware/`

**Components:**
- **Authentication** - JWT token validation
- **Authorization** - Role-based access control
- **Rate Limiting** - Request throttling

**Execution Order:**
```
Request
  ↓
1. Rate Limiting (check limits)
  ↓
2. Authentication (validate JWT)
  ↓
3. Authorization (check permissions)
  ↓
4. API Handler
  ↓
Response
```

#### Utility Layer
**Location:** `src/utils/`

**Components:**
- **security.py** - Cryptography (bcrypt, JWT)
- **email.py** - Email sending

**Rules:**
- ✅ DO: Pure functions, no side effects, reusable
- ❌ DON'T: Business logic, state management

---

## Data Flow

### Authentication Flow (Complete)

```
┌─────────────────────────────────────────────────────────────────┐
│                     REGISTRATION FLOW                            │
└─────────────────────────────────────────────────────────────────┘

User → POST /api/v1/auth/register
  ↓
API Layer (auth.py)
  ↓ Validates input (Pydantic)
  ↓
Service Layer (auth_service.py)
  ↓ 1. Check email uniqueness
  ↓ 2. Hash password (bcrypt, cost 12)
  ↓ 3. Generate UUID
  ↓ 4. Create user (isEmailVerified=false)
  ↓
Database Layer (MongoDB)
  ↓ Insert user document
  ↓
Service Layer
  ↓ 5. Generate verification token (JWT, 24hr)
  ↓ 6. Store token in verification_tokens collection
  ↓
Email Utility
  ↓ 7. Send verification email
  ↓
API Layer
  ↓ Return UserResponse (201 Created)
  ↓
User receives verification email


┌─────────────────────────────────────────────────────────────────┐
│                     LOGIN FLOW (with Rate Limiting)              │
└─────────────────────────────────────────────────────────────────┘

User → POST /api/v1/auth/login
  ↓
Rate Limiter
  ↓ Check failed login attempts for email
  ↓ (if >= 5 attempts → 429 Too Many Requests)
  ↓
API Layer (auth.py)
  ↓ Validates credentials (Pydantic)
  ↓
Service Layer (auth_service.py)
  ↓ 1. Find user by email
  ↓ 2. Check isActive = true
  ↓ 3. Verify password (bcrypt)
  ↓ 4. Generate access token (JWT, 1hr)
  ↓ 5. Generate refresh token (JWT, 7days)
  ↓
Database Layer
  ↓ 6. Store refresh token
  ↓ 7. Update lastLoginAt
  ↓
Rate Limiter
  ↓ Clear failed attempts on success
  ↓
API Layer
  ↓ Return TokenResponse (200 OK)
  ↓
User receives tokens


┌─────────────────────────────────────────────────────────────────┐
│                     PROTECTED ENDPOINT FLOW                      │
└─────────────────────────────────────────────────────────────────┘

User → GET /api/v1/users/me
  ↓ Headers: Authorization: Bearer {token}
  ↓
Rate Limiter
  ↓ Check request count for user/role
  ↓ (if exceeded → 429 Too Many Requests)
  ↓
Auth Middleware (auth.py)
  ↓ 1. Extract token from header
  ↓ 2. Verify JWT signature & expiry
  ↓ 3. Extract userId from payload
  ↓
Database Layer
  ↓ 4. Fetch user by userId
  ↓ 5. Check isActive = true
  ↓
Auth Middleware
  ↓ 6. Attach user to request.state
  ↓
Permissions Middleware (if required)
  ↓ 7. Check user role against required roles
  ↓
API Handler
  ↓ 8. Process request with authenticated user
  ↓
Response → User
```

---

## Database Architecture

### MongoDB Collections

#### users Collection
```javascript
{
  _id: ObjectId,                    // MongoDB internal ID
  userId: String (UUID),            // Unique user identifier
  email: String,                    // Email (unique index)
  passwordHash: String,             // bcrypt hash
  firstName: String,
  lastName: String,
  role: String,                     // 'super_admin', 'admin', 'moderator', 'user', 'guest'
  isActive: Boolean,
  isEmailVerified: Boolean,
  phone: String,
  avatar: String,
  timezone: String,
  locale: String,
  lastLoginAt: Date,
  createdAt: Date,
  updatedAt: Date,
  deletedAt: Date,                  // Soft delete
  metadata: Object                  // Flexible additional data
}

// Indexes
- email: unique
- userId: unique
- role: non-unique
- createdAt: descending
```

#### refresh_tokens Collection
```javascript
{
  _id: ObjectId,
  tokenId: String (UUID),           // Unique token ID
  userId: String (UUID),            // Reference to user
  token: String,                    // JWT refresh token
  expiresAt: Date,                  // Expiration timestamp
  isRevoked: Boolean,
  createdAt: Date,
  lastUsedAt: Date
}

// Indexes
- tokenId: unique
- userId: non-unique
- expiresAt: TTL index (auto-delete expired tokens)
```

#### verification_tokens Collection
```javascript
{
  _id: ObjectId,
  tokenId: String (UUID),
  userId: String (UUID),
  email: String,
  token: String,                    // JWT verification token
  tokenType: String,                // 'email_verification' or 'password_reset'
  expiresAt: Date,
  isUsed: Boolean,
  createdAt: Date,
  usedAt: Date
}

// Indexes
- tokenId: unique
- userId: non-unique
- email: non-unique
- tokenType: non-unique
- expiresAt: TTL index (auto-delete expired tokens)
```

### MySQL Tables

#### users Table
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

### Database Strategy: Dual Database

**Why Both MongoDB and MySQL?**

**MongoDB (Primary):**
- ✅ Fast reads/writes for authentication
- ✅ Flexible schema for user metadata
- ✅ TTL indexes for automatic token cleanup
- ✅ Horizontal scalability

**MySQL (Secondary):**
- ✅ ACID transactions for critical operations
- ✅ Foreign key constraints for referential integrity
- ✅ Complex queries with JOINs
- ✅ Future: Relational data (orders, payments, etc.)

**Sync Strategy:**
- Currently: Write to both databases simultaneously
- Future: Event-driven sync with message queue (RabbitMQ/Kafka)

---

## Security Architecture

### Authentication Security

#### Password Security
- **Algorithm:** bcrypt
- **Cost Factor:** 12 (2^12 = 4,096 iterations)
- **Salt:** Automatically generated per password
- **Never stored:** Plain text passwords
- **Never logged:** Passwords or tokens

#### JWT Token Security
- **Algorithm:** HS256 (HMAC-SHA256)
- **Secret Key:** Environment variable (min 32 chars)
- **Token Types:**
  - Access Token: 1 hour expiry
  - Refresh Token: 7 days expiry (rotating, one-time use)
  - Verification Token: 24 hours expiry (email verification)
  - Reset Token: 1 hour expiry (password reset)

**Token Payload:**
```javascript
// Access Token
{
  "userId": "uuid",
  "email": "user@example.com",
  "role": "user",
  "type": "access",
  "exp": 1234567890
}

// Refresh Token
{
  "userId": "uuid",
  "tokenId": "uuid",
  "type": "refresh",
  "exp": 1234567890
}
```

#### Token Security Features
- ✅ Short-lived access tokens (1 hour)
- ✅ Rotating refresh tokens (one-time use)
- ✅ Database-backed token validation
- ✅ Token revocation on logout/password reset
- ✅ TTL indexes for automatic cleanup
- ✅ Signature verification on every request

### Authorization Security (RBAC)

**Role Hierarchy:**
```
Super Admin (highest)
    ↓
  Admin
    ↓
Moderator
    ↓
  User (default)
    ↓
Guest (lowest)
```

**Permission Enforcement:**
```python
# Endpoint-level protection
@router.get("/users", dependencies=[Depends(require_admin)])
async def list_users():
    # Only Admin and Super Admin can access
    ...

# Resource-level protection
if not can_manage_user(target_user_id, current_user):
    raise HTTPException(403, "Permission denied")
```

### Rate Limiting Security

**Role-Based Limits:**
- Guest: 10 requests/minute
- User: 100 requests/minute
- Moderator: 200 requests/minute
- Admin: 500 requests/minute
- Super Admin: 1000 requests/minute

**Login Rate Limiting:**
- Max 5 failed attempts per email
- 15 minute lockout period
- Prevents brute force attacks

**Implementation:**
- In-memory tracking (development)
- Redis recommended (production, distributed)

### Attack Prevention

**Email Enumeration Prevention:**
- Password reset always returns success
- Registration returns generic errors
- Login errors don't reveal if email exists

**SQL Injection Prevention:**
- Parameterized queries only
- ORM/ODM usage (Motor, aiomysql)
- Input validation (Pydantic)

**XSS Prevention:**
- Input sanitization
- Output encoding
- Content Security Policy headers

**CSRF Prevention:**
- JWT tokens (stateless)
- Same-Origin Policy
- CORS configuration

---

## Deployment Architecture

### Container Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Docker Compose Stack                        │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│   API Container  │  │ MongoDB Container│  │ MySQL Container  │
│   FastAPI App    │  │   Port: 27017    │  │   Port: 3306     │
│   Port: 8000     │  │   Volume: ./data │  │   Volume: ./data │
└──────────────────┘  └──────────────────┘  └──────────────────┘
         ↓                      ↓                      ↓
┌────────────────────────────────────────────────────────────────┐
│                      Docker Network                             │
└────────────────────────────────────────────────────────────────┘
         ↓
┌──────────────────┐
│ Adminer Container│
│   Port: 8080     │
│   DB Management  │
└──────────────────┘
```

### Environment Configuration

**Development:**
- Docker Compose for local development
- Hot reload enabled
- Debug mode on
- Email logging (no actual sending)
- In-memory rate limiting

**Staging:**
- Docker containers
- Production-like environment
- Email service integration
- Redis rate limiting
- SSL/TLS enabled

**Production:**
- Kubernetes/Docker Swarm
- Load balancing
- Auto-scaling
- Email service (SendGrid/SES)
- Redis cluster
- SSL/TLS required
- Monitoring & alerting

### Port Allocation

| Service  | Port | Purpose              |
|----------|------|----------------------|
| API      | 8000 | FastAPI application  |
| MongoDB  | 27017| Database             |
| MySQL    | 3306 | Database             |
| Adminer  | 8080 | DB admin UI          |
| Redis    | 6379 | Rate limiting cache  |

---

## Scalability & Performance

### Horizontal Scalability

**API Layer:**
- ✅ Stateless design (JWT tokens)
- ✅ Multiple API instances behind load balancer
- ✅ No session storage on server

**Database Layer:**
- MongoDB: Replica sets, sharding
- MySQL: Read replicas, master-slave
- Redis: Cluster mode

**Load Balancing:**
```
                    ┌──────────┐
Internet ─────────→ │ Nginx/   │
                    │ HAProxy  │
                    └──────────┘
                         ↓
        ┌────────────────┼────────────────┐
        ↓                ↓                ↓
   ┌────────┐      ┌────────┐      ┌────────┐
   │ API #1 │      │ API #2 │      │ API #3 │
   └────────┘      └────────┘      └────────┘
        ↓                ↓                ↓
        └────────────────┼────────────────┘
                         ↓
                  ┌────────────┐
                  │ Database   │
                  │ Cluster    │
                  └────────────┘
```

### Performance Optimizations

**Async Operations:**
- All I/O operations are async (await)
- Non-blocking database queries
- Concurrent request handling

**Connection Pooling:**
- MongoDB: 10-50 connections
- MySQL: 5-20 connections
- Reuse connections, avoid overhead

**Database Indexes:**
- Email (unique) - Fast user lookup
- userId (unique) - Fast token validation
- TTL indexes - Auto-cleanup expired tokens

**Caching Strategy (Future):**
- Redis for session data
- Cache frequently accessed user data
- Cache invalidation on updates

---

## Monitoring & Logging

### Logging Strategy

**Log Levels:**
- **DEBUG:** Development debugging
- **INFO:** Normal operations, important events
- **WARNING:** Rate limit warnings, deprecated features
- **ERROR:** Failed operations, exceptions
- **CRITICAL:** System failures

**Log Locations:**
```
logs/
├── api/                 # API application logs
├── mongodb/             # MongoDB server logs
└── mysql/               # MySQL server logs
```

**Log Rotation:**
- Max size: 10MB per file
- Max files: 3 (30MB total)
- Driver: json-file

**What to Log:**
- ✅ User registration, login, logout
- ✅ Failed login attempts
- ✅ Token generation & validation
- ✅ Rate limit warnings
- ✅ Database errors
- ✅ API errors
- ❌ Passwords (NEVER)
- ❌ Tokens (NEVER in production)
- ❌ Sensitive user data

### Health Monitoring

**Health Endpoints:**
- `GET /api/health` - API service status
- `GET /api/ready` - Readiness check (includes DB status)

**Metrics to Monitor:**
- Request rate (requests/second)
- Response time (p50, p95, p99)
- Error rate (4xx, 5xx)
- Database connection pool usage
- Rate limit violations
- Failed login attempts

**Alerting Thresholds:**
- Error rate > 5%
- Response time p95 > 1000ms
- Database connection pool > 80%
- Failed login attempts > 100/minute

---

## Development Guidelines

### Coding Standards
**See:** [CLAUDE.md](../../CLAUDE.md) for complete guidelines

**Key Principles:**
- Type hints for all function parameters
- Docstrings for all public functions
- Pydantic models for all data validation
- Async/await for all I/O operations
- Parameterized queries only (no string concatenation)

### Adding New Features

**Required Steps:**
1. ✅ Check [User-Structure.md](./User-Structure.md) for user-related features
2. ✅ Check [API-Structure.md](./API-Structure.md) for API endpoint conflicts
3. ✅ Check [System-Architecture.md](./System-Architecture.md) (this file) for architecture constraints
4. ✅ Update all relevant documentation files
5. ✅ Follow layered architecture (API → Service → Database)
6. ✅ Add appropriate error handling
7. ✅ Add logging statements
8. ✅ Follow security standards ([CLAUDE.md](../../CLAUDE.md))

### Adding New API Endpoints

**Checklist:**
- [ ] Define Pydantic request/response models
- [ ] Implement service layer method
- [ ] Create API endpoint with proper decorators
- [ ] Add authentication/authorization if needed
- [ ] Add rate limiting if needed
- [ ] Update [API-Structure.md](./API-Structure.md)
- [ ] Add docstring with examples
- [ ] Test all error cases

### Database Changes

**MongoDB:**
- [ ] Update collection schema in this file
- [ ] Add indexes in `src/services/database.py`
- [ ] Update relevant Pydantic models
- [ ] Test queries for performance

**MySQL:**
- [ ] Create migration script
- [ ] Update table schema in this file
- [ ] Update relevant Pydantic models
- [ ] Test foreign key constraints

### Security Changes

**Authentication/Authorization:**
- [ ] Update [User-Structure.md](./User-Structure.md)
- [ ] Update security section in this file
- [ ] Follow secure coding standards ([CLAUDE.md](../../CLAUDE.md))
- [ ] Test all permission scenarios
- [ ] Verify no security regressions

---

## Future Architecture Considerations

### Planned Enhancements

**Phase 1: Testing & Quality**
- Unit tests (80% coverage target)
- Integration tests
- Load testing
- Security audit

**Phase 2: Production Readiness**
- Redis rate limiting
- Email service integration (SendGrid/SES)
- CI/CD pipeline
- Automated deployments

**Phase 3: Advanced Features**
- Multi-factor authentication (MFA)
- OAuth2 providers (Google, GitHub)
- Session management
- Audit logging
- Webhook system

**Phase 4: Microservices Evolution**
- Service separation (Auth, Users, etc.)
- Message queue (RabbitMQ/Kafka)
- API Gateway
- Service mesh

### Scalability Roadmap

**Current (v1.1.0):**
- Single API instance
- MongoDB + MySQL
- In-memory rate limiting
- Docker Compose deployment

**Short Term (v1.5.0):**
- Multiple API instances
- Redis rate limiting
- Load balancer
- Database read replicas

**Long Term (v2.0.0):**
- Kubernetes deployment
- Auto-scaling
- Database sharding
- Distributed tracing
- Global CDN

---

## Architecture Diagrams

### High-Level Architecture

```
┌───────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                           │
│  Web Browser  │  Mobile App  │  Third-party API  │  CLI Tool │
└───────────────────────────────────────────────────────────────┘
                                 ↓
┌───────────────────────────────────────────────────────────────┐
│                         API GATEWAY                            │
│              HTTPS / TLS / Load Balancer                      │
└───────────────────────────────────────────────────────────────┘
                                 ↓
┌───────────────────────────────────────────────────────────────┐
│                    MIDDLEWARE LAYER                            │
│  Rate Limiting  │  Authentication  │  Authorization  │  CORS  │
└───────────────────────────────────────────────────────────────┘
                                 ↓
┌───────────────────────────────────────────────────────────────┐
│                      API LAYER (FastAPI)                       │
│    /auth endpoints    │    /users endpoints    │    /health   │
└───────────────────────────────────────────────────────────────┘
                                 ↓
┌───────────────────────────────────────────────────────────────┐
│                     SERVICE LAYER                              │
│   auth_service.py   │   user_service.py   │   email.py        │
└───────────────────────────────────────────────────────────────┘
                                 ↓
┌───────────────────────────────────────────────────────────────┐
│                    DATABASE LAYER                              │
│         MongoDB (Primary)        │      MySQL (Secondary)      │
│  users, tokens, verifications    │    relational data          │
└───────────────────────────────────────────────────────────────┘
```

### Request Flow Diagram

```
1. User Request
     ↓
2. Rate Limiter (check limits)
     ↓
3. Authentication Middleware (validate JWT)
     ↓
4. Authorization Middleware (check permissions)
     ↓
5. API Handler (validate input)
     ↓
6. Service Layer (business logic)
     ↓
7. Database Layer (data access)
     ↓
8. Response (serialize output)
     ↓
9. User Response
```

---

## Version History

### v1.1.0 - 2025-10-16
- ✅ Complete authentication system
- ✅ Email verification system
- ✅ Password reset flow
- ✅ Rate limiting (role-based + login)
- ✅ 13 API endpoints
- ✅ Dual database architecture (MongoDB + MySQL)
- ✅ Service layer pattern
- ✅ Comprehensive security
- ✅ Docker containerization

### v1.0.0 - 2025-10-16
- Initial architecture design
- FastAPI framework setup
- Basic authentication
- User management
- Health check endpoints

---

## References

### Internal Documentation
- [User-Structure.md](./User-Structure.md) - User system specification
- [API-Structure.md](./API-Structure.md) - API endpoint registry
- [Versioning.md](./Versioning.md) - Version management
- [CLAUDE.md](../../CLAUDE.md) - Development guidelines
- [README.md](../../README.md) - Project setup
- [DEPLOYMENT.md](../../DEPLOYMENT.md) - Deployment instructions

### External Resources
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [MongoDB Documentation](https://docs.mongodb.com/)
- [MySQL Documentation](https://dev.mysql.com/doc/)
- [bcrypt](https://github.com/pyca/bcrypt/)
- [JWT.io](https://jwt.io/)
- [Docker Documentation](https://docs.docker.com/)

---

## Change Log

### 2025-10-16 - Initial Creation
- Created System Architecture documentation
- Documented complete system design
- Defined architecture principles and patterns
- Documented all components and layers
- Created architecture diagrams
- Defined development guidelines

---

**REMEMBER: Always update this file when making architectural changes!**
