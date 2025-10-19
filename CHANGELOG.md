# Changelog

All notable changes to the A64 Core Platform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Complete Authentication System (User Portal)**
  - JWT-based login/register with token persistence
  - Axios interceptor for automatic token attachment
  - Token refresh logic for expired tokens
  - Zustand store with persist middleware for auth state
  - Protected routes with proper user loading
  - Logout functionality with token cleanup

- **Enhanced CCM Dashboard**
  - Dashboard API service with widget data endpoints
  - Dashboard Zustand store for state management
  - Per-widget loading and error states
  - Refresh all widgets functionality
  - Error banner with dismiss button
  - Empty state for no widgets
  - Mock data support for development
  - Ready for backend API integration

- **Interactive Chart Widgets**
  - ChartWidget component with Recharts library
  - Line charts for trend analysis (single/multi-series)
  - Bar charts for comparisons (single/multi-series)
  - Pie charts for distribution visualization
  - Responsive chart sizing (mobile to desktop)
  - Interactive tooltips and legends
  - Per-chart loading, error, and empty states
  - Refresh functionality per chart
  - Custom color support via series configuration
  - 3 chart widgets with mock data (sales trend, revenue breakdown, user activity)
  - Flexible widget sizing system (medium, large, wide, full-width)
  - 4-column responsive grid layout on desktop

- **Drag-and-Drop Dashboard Customization**
  - react-grid-layout integration for widget repositioning
  - Edit mode toggle for enabling/disabling drag-and-drop
  - Persistent layout storage via Zustand persist middleware
  - Auto-generated default layout based on widget sizes
  - Reset layout functionality to restore defaults
  - Visual edit mode banner for user guidance
  - Layout saved to localStorage and persists across sessions
  - Configurable row heights (150px per row)
  - Edit/Done/Reset control buttons in dashboard header
  - Automatic overlap detection and layout regeneration
  - Collision prevention during drag operations
  - Proper widget height calculation (charts = 3 rows, stats = 1 row)
  - Resize snapping to grid boundaries

- **Fully Responsive Dashboard Layout**
  - Dynamic column count based on viewport width
  - Mobile (< 768px): 2 columns for optimal viewing
  - Tablet (768-1024px): 3 columns
  - Desktop (≥ 1024px): 4 columns
  - Bidirectional layout adjustment (mobile ↔ desktop)
  - Auto-reflow widgets when screen size changes
  - Widget width adapts to breakpoint (maintains size ratios)
  - Dynamic container width measurement
  - No horizontal scrolling on any device
  - Touch-friendly spacing on mobile

- **Responsive UI System**
  - Mobile-first responsive design across all pages
  - Login/Register pages - fully responsive with no white space
  - Dashboard - responsive grid (1-4 columns based on screen)
  - Profile & Settings - responsive layouts
  - MainLayout with mobile hamburger menu
  - Fixed viewport handling (no horizontal scroll)
  - Global styles with overflow-x hidden

- **Frontend Docker Integration**
  - Multi-stage Dockerfile for user-portal (development + production)
  - Docker Compose service configuration for frontend
  - Nginx reverse proxy routing for frontend application
  - Hot-reload development mode with Vite HMR via Docker
  - Production build with optimized static asset serving
  - Volume mounts for instant code updates in development
  - WebSocket proxy support for Vite HMR
  - Comprehensive Docker setup documentation

- **Frontend Proof of Concept (POC)**
  - React 18 + TypeScript 5 user portal
  - Monorepo structure with npm workspaces
  - Shared component library (@a64core/shared)
  - Centralized design system (theme, colors, typography)
  - CCM Dashboard with draggable widgets
  - StatWidget component with trends and metrics
  - styled-components for CSS-in-JS
  - Vite 5 for fast development builds

### Changed
- **Nginx Configuration**
  - Added user-portal upstream backend
  - Added WebSocket upgrade headers for HMR
  - Frontend SPA routing on / (fallback to index.html)
  - API routes prioritized over frontend routes

- **Docker Compose**
  - Added user-portal service with hot-reload volumes
  - Separate development and production configurations
  - Cross-platform volume exclusions for node_modules

### Documentation
- New: `Docker-Frontend-Setup.md` - Complete Docker frontend guide
- New: `Frontend-Implementation-Plan.md` - 18-week roadmap
- New: `Frontend-Architecture.md` - Technical architecture
- New: `CCM-Architecture.md` - Dashboard system design
- New: `Widget-Development-Guide.md` - Widget creation guide
- New: `UI-Standards.md` - Design system documentation
- New: `Enhanced-Dashboard-Implementation.md` - Dashboard state management details
- New: `Chart-Widget-Implementation.md` - Chart visualization guide
- New: `Drag-and-Drop-Dashboard.md` - Dashboard customization guide

### Planned for Future Releases
- Comprehensive test suite (unit, integration, e2e)
- Email service integration for verification and password reset
- Module start/stop/restart operations
- API analytics and usage tracking
- Webhook system for event notifications
- Admin portal frontend
- Module frontend dynamic loading

## [1.4.0] - 2025-10-19

### Added
- **Automatic Port Management System**
  - Auto-allocation of external ports from configurable range (9000-19999)
  - MongoDB-based port tracking with conflict prevention
  - Sequential port allocation supporting 10,000+ modules
  - Automatic port release on module uninstallation
  - Port registry with unique constraints and status tracking
  - Port statistics and usage monitoring
  - Database schema: `port_registry` collection with indexes

- **NGINX Reverse Proxy Auto-Configuration**
  - Automatic NGINX location block generation for each module
  - Clean URL routing (`/module-name/` instead of ports)
  - WebSocket support in proxy configuration
  - Security headers auto-added (X-Content-Type-Options, X-Frame-Options, X-XSS-Protection)
  - Docker DNS resolver integration (127.0.0.11)
  - Runtime DNS resolution using variables
  - Dedicated health check proxy routes
  - Zero-downtime NGINX reload
  - Automatic config rollback on errors

- **Docker Network Auto-Detection**
  - Automatic detection of platform Docker network
  - Cross-container communication via Docker DNS
  - Module containers automatically join platform network
  - Support for docker-compose network prefixes

- **Shared Volume Architecture**
  - Shared volume (`nginx_modules_config`) between API and NGINX containers
  - Automatic NGINX config synchronization
  - Module configs stored in `/etc/nginx/conf.d/modules/`

- **Enhanced Module Installation Flow**
  - Port allocation integrated into installation process
  - Proxy route generation during installation
  - Allocated ports stored in module database record
  - Container created with auto-allocated port mappings
  - NGINX config auto-generated and tested

### Changed
- **Module Manager** (`src/services/module_manager.py`)
  - Added `PortManager` dependency injection
  - Added `_get_platform_network()` method for network detection
  - Updated installation flow to include port allocation
  - Updated container creation to use allocated ports
  - Added proxy route creation after container start
  - Updated uninstallation to release ports and remove proxy configs

- **Module Model** (`src/models/module.py`)
  - Added `allocated_ports: Dict[str, int]` field (internal_port → external_port mapping)
  - Added `proxy_route: Optional[str]` field for reverse proxy path
  - Added `PortAllocation` and `PortRange` models

- **Docker Compose Configuration**
  - Added `nginx_modules_config` volume
  - Shared volume mounted in both API and NGINX containers
  - Updated NGINX config to include module configs

- **Main Application** (`src/main.py`)
  - Added Port Manager initialization on startup
  - Injected Port Manager into Module Manager

### New Services
- **Port Manager** (`src/services/port_manager.py`)
  - `allocate_ports()` - Allocate external ports for module
  - `release_ports()` - Free all ports for a module
  - `get_module_ports()` - Get allocated ports
  - `parse_ports_from_config()` - Parse port configuration
  - `is_port_available()` - Check port availability
  - `get_port_statistics()` - Get allocation statistics

- **Proxy Manager** (`src/services/proxy_manager.py`)
  - `generate_module_config()` - Generate NGINX location block
  - `create_proxy_route()` - Create and activate proxy config
  - `remove_proxy_route()` - Remove proxy config
  - `reload_nginx()` - Reload NGINX without downtime
  - `_test_nginx_config()` - Validate NGINX config
  - Docker client integration for NGINX container commands

### Documentation
- Added `Port-Management-System.md` - Comprehensive guide for port management and reverse proxy
- Updated `System-Architecture.md` with port management architecture
- Added installation scripts for multi-module testing
  - `scripts/install-example-module-2.py`

### Testing
- Created second test module (`example-app-2`) for multi-module testing
- Verified sequential port allocation (9000, 9001, ...)
- Tested reverse proxy routes for multiple modules
- Verified port registry tracking
- Tested NGINX config generation and reload

### Fixed
- Fixed Python import issues with relative imports in proxy_manager
- Fixed Docker network detection for module containers
- Fixed NGINX config syntax errors in generated configs
- Fixed port mapping to use internal ports for proxy routing
- Fixed f-string escaping in NGINX config generation

## [1.3.0] - 2025-10-17

### Added
- **Module Management System** - Docker Compose-based modular app installation & lifecycle management
  - Dynamic module installation from Docker images
  - Module uninstallation with cleanup
  - Module status monitoring with runtime metrics
  - Comprehensive audit logging (90-day retention)
  - Module health monitoring
- **Module API Endpoints** (6 new endpoints)
  - `POST /api/v1/modules/install` - Install new module with license validation
  - `GET /api/v1/modules/installed` - List all installed modules (paginated)
  - `GET /api/v1/modules/{module_name}/status` - Get detailed module status with metrics
  - `DELETE /api/v1/modules/{module_name}` - Uninstall module
  - `GET /api/v1/modules/audit-log` - Get audit log with filtering
  - `GET /api/v1/modules/health` - Module system health check
- **License Key Management**
  - License key validation (3 modes: format, offline, online)
  - Fernet symmetric encryption for license storage
  - PBKDF2HMAC key derivation (100,000 iterations with SHA256)
  - License format validation (segmented, UUID, alphanumeric)
  - Luhn checksum validation for numeric keys
  - License revocation support
  - Test license generation for development
- **Container Security & Sandboxing**
  - No privileged containers allowed
  - All Linux capabilities dropped (cap_drop: ["ALL"])
  - Read-only root filesystem support
  - Non-root user enforcement (UID 1000)
  - No new privileges flag set
  - Resource limits (CPU, memory, PIDs)
  - Docker image validation (trusted registries only)
  - 'latest' tag forbidden (exact versions required)
- **Module Lifecycle Management**
  - 6 module states: pending, installing, running, stopped, error, uninstalling
  - 3 health states: healthy, unhealthy, unknown
  - Automatic state tracking in database
  - Error tracking and recovery
- **Runtime Metrics Collection**
  - CPU usage percentage
  - Memory usage (MB) and limits
  - Network I/O (RX/TX bytes)
  - Container uptime tracking
  - Restart count monitoring
- **Infrastructure Services**
  - Redis 7 integration for caching and rate limiting
  - NGINX 1.25 reverse proxy integration
  - Docker socket mounting for container management
  - Module-specific Docker network support
- **Module Limits & Quotas**
  - System-wide limit: 50 modules maximum
  - Per-user limit: 10 modules maximum
  - Configurable via environment variables
  - Automatic enforcement during installation
- **Comprehensive Audit Logging**
  - All module operations logged (install, uninstall, etc.)
  - Immutable audit trail in MongoDB
  - 90-day TTL index for automatic cleanup
  - User context tracking (ID, email, role)
  - Operation timing and duration tracking
  - Metadata storage for operation-specific data
  - Filterable by module, operation, status, user

### Changed
- Updated Docker Compose configuration (docker-compose.yml)
  - Added Redis service (port 6379) with password authentication
  - Added NGINX service (ports 80/443) as reverse proxy
  - Mounted Docker socket to API container (`/var/run/docker.sock`)
  - Added redis dependency to API service
  - Added redis_data volume
- Updated Dockerfile
  - No changes required (Python dependencies handled via requirements.txt)
- Updated `src/services/database.py`
  - Added MongoDB indexes for `installed_modules` collection (7 indexes)
  - Added MongoDB indexes for `module_audit_log` collection (6 indexes)
  - TTL index on module_audit_log (90-day retention)
- Updated `src/api/routes.py`
  - Registered module management router
- Updated `src/main.py`
  - No changes required (routes auto-registered)
- Enhanced `.env.example`
  - Added Redis configuration (REDIS_URL, REDIS_PASSWORD)
  - Added 8 module management environment variables
  - Added trusted registries configuration
  - Added module limits configuration

### Added Files
- **Models**
  - `src/models/module.py` - 10 Pydantic models for module management
    - ModuleStatus enum (6 states)
    - ModuleHealth enum (3 states)
    - ModuleConfig (installation request with validation)
    - ModuleInDB (database representation with encrypted license)
    - ModuleResponse (API response, excludes sensitive data)
    - ModuleListResponse (paginated list)
    - ModuleStatusResponse (detailed status with metrics)
    - ModuleAuditLog (audit trail)
    - ModuleInstallResponse, ModuleUninstallResponse
- **Services**
  - `src/services/module_manager.py` - ModuleManager service class
    - install_module() - Complete installation workflow
    - uninstall_module() - Clean removal with cleanup
    - get_installed_modules() - Paginated list with metadata
    - get_module_status() - Detailed runtime metrics
    - Docker image validation and security enforcement
    - License validation integration
    - Audit logging for all operations
- **Utilities**
  - `src/utils/encryption.py` - License key encryption utility
    - encrypt_license_key() - Fernet encryption
    - decrypt_license_key() - Secure decryption
    - validate_encryption_key() - Startup validation
    - hash_license_key() - One-way hashing
    - generate_secure_key() - Key generation
    - test_encryption_roundtrip() - Self-test
    - CLI utility for testing
  - `src/utils/license_validator.py` - License validation utility
    - LicenseValidator class with 3 validation modes
    - validate_format() - Structure validation
    - validate_checksum() - Luhn algorithm
    - validate_offline() - Format + checksum + revocation
    - validate_online() - External license server validation
    - generate_test_license() - Development testing
    - Revocation management
    - CLI utility for testing
- **API**
  - `src/api/v1/modules.py` - Module management REST API
    - 6 fully documented endpoints
    - Complete request/response validation
    - Error handling with appropriate HTTP status codes
    - Super admin RBAC enforcement
- **Infrastructure**
  - `nginx/nginx.conf` - NGINX reverse proxy configuration
    - Security headers (X-Content-Type-Options, X-Frame-Options, etc.)
    - Upstream to API container
    - Routes for /api/, /admin/, /, /ws/
    - Health check endpoint
    - Placeholder for dynamic module routing
- **Documentation**
  - `Docs/2-Working-Progress/Modular-System-Implementation-Plan.md` (940 lines)
    - 4-phase implementation plan with detailed tasks
    - Task breakdown with effort estimates
    - Testing procedures and rollback plans
  - `Docs/2-Working-Progress/Security-Risk-Mitigation-Plan.md` (1274 lines)
    - 14 identified security risks (2 CRITICAL, 4 HIGH, 5 MEDIUM, 3 LOW)
    - Detailed mitigation strategies for each risk
    - Attack scenarios and prevention measures

### Dependencies Added
- docker==7.0.0 - Docker SDK for Python (container management)
- PyYAML==6.0.1 - YAML manipulation for docker-compose.yml
- redis==5.0.1 - Redis client for caching
- cryptography==41.0.7 - License key encryption (Fernet + PBKDF2)
- jsonschema==4.20.0 - Module configuration validation

### Documentation
- Updated [API-Structure.md](Docs/1-Main-Documentation/API-Structure.md)
  - Added Module Management section with 6 endpoints
  - Complete request/response schemas
  - Security notes and warnings
  - Module status and health value definitions
  - Added v1.3.0 to API Changelog
- Updated [System-Architecture.md](Docs/1-Main-Documentation/System-Architecture.md)
  - Updated platform version to v1.3.0
  - Added Module Management System to core purpose
  - Updated directory structure with new files
  - Added module management libraries
  - Updated Docker Compose services list
  - Added installed_modules and module_audit_log collections
  - Added v1.3.0 to version history
- Updated [Versioning.md](Docs/1-Main-Documentation/Versioning.md)
  - Updated platform version to v1.3.0
  - Added Module Management System version
  - Added Redis and NGINX to infrastructure versions
  - Updated service versions table
  - Updated Docker image tags
  - Added comprehensive v1.3.0 version history
  - Updated compatibility matrix

### Security
- **CRITICAL Risk: Docker Socket Access**
  - Mitigation: RBAC (super_admin only), audit logging, image validation, container sandboxing
  - Attack scenarios documented and mitigated
- **Container Security Hardening**
  - No privileges, capabilities dropped, read-only filesystem
  - Resource limits to prevent exhaustion attacks
  - Non-root user enforcement
- **License Key Protection**
  - Fernet symmetric encryption (AES-128-CBC + HMAC)
  - PBKDF2 key derivation with 100k iterations
  - Never logged or exposed in API responses
  - Safe database storage
- **Docker Image Security**
  - Trusted registry validation
  - 'latest' tag forbidden
  - Image format validation
- **Audit Trail**
  - All operations logged with user context
  - Immutable (insert-only collection)
  - 90-day retention with automatic cleanup

### Fixed
- **Cryptography Import Error** - Fixed import of PBKDF2HMAC (was incorrectly PBKDF2)
- **Lazy Docker Initialization** - ModuleManager now initializes Docker client on first use to prevent startup errors on Windows
- **Import Path Fix** - Fixed get_current_user import (moved from permissions to auth middleware)

### Infrastructure
- Redis service running on port 6379 with password authentication
- NGINX reverse proxy on ports 80/443
- Docker socket mounted to API container for module management
- Module-specific Docker network (a64core-network)
- Health checks for Redis and NGINX services

### Database Schema
- **New Collections (MongoDB)**
  - `installed_modules` - Module metadata, state, and configuration
  - `module_audit_log` - Immutable audit trail with 90-day TTL
- **New Indexes**
  - installed_modules: 7 indexes (module_name unique, status, health, user, dates, container)
  - module_audit_log: 6 indexes (module, operation, user, status, timestamp, TTL)

### Testing
- **Comprehensive Test Suite Executed** (9/9 tests passed - 100% success rate)
  - Module health endpoint tested and working
  - Authentication and RBAC enforcement verified
  - Module listing with/without auth validated
  - Audit log retrieval tested successfully
  - Input validation (Pydantic) confirmed working
  - Security controls verified ('latest' tag rejection, untrusted registry blocking)
  - Error handling validated (404, 422, 403 responses)
  - Non-existent module handling tested
- **Test Infrastructure**
  - Created `tests/test_module_management.py` - Comprehensive test suite (351 lines)
  - Created test report: `Docs/2-Working-Progress/Module-Management-Test-Report.md`
  - Cross-platform compatible (Windows encoding handled)
  - Automated pass/fail detection with color-coded output
- **Security Validation**
  - ✅ Unauthenticated access blocked (403 Forbidden)
  - ✅ Super admin role correctly enforced
  - ✅ Module name validation (lowercase, alphanumeric, hyphens only)
  - ✅ Semantic versioning pattern enforced
  - ✅ 'latest' Docker tag forbidden
  - ✅ Untrusted registry rejection working
  - ✅ 404 for missing resources, 422 for validation errors
- **Cross-Platform Docker Support** (Windows + Linux + macOS)
  - ✅ Platform detection auto-selects correct Docker socket
  - ✅ Windows: `npipe:////./pipe/docker_engine` (Docker Desktop)
  - ✅ Linux: `unix:///var/run/docker.sock`
  - ✅ macOS: `unix:///var/run/docker.sock`
  - ✅ Docker socket access working on Windows
  - ✅ Module installation ready for all platforms
- Container startup successful with new services (Redis, NGINX, API with socket mount)
- Database indexes created successfully
- Encryption utility self-test implemented

## [1.2.0] - 2025-10-17

### Added
- **Admin Management System** - Complete user administration interface
  - Web-based admin panel at `/admin/` with login authentication
  - Admin dashboard with user management table
  - Real-time search and filtering across users
  - Pagination support for large user datasets
- **Admin API Endpoints** (5 new endpoints)
  - `GET /api/v1/admin/users` - List all users with pagination and filters
  - `GET /api/v1/admin/users/{userId}` - Get detailed user information by ID
  - `PATCH /api/v1/admin/users/{userId}/role` - Update user role (super_admin, admin, moderator, user, guest)
  - `PATCH /api/v1/admin/users/{userId}/status` - Activate or deactivate user accounts
  - `DELETE /api/v1/admin/users/{userId}` - Soft delete user (90-day retention)
- **Super Admin Role** - Highest privilege level with full system access
  - Manage all users including other admins
  - Assign any role including admin and super_admin
  - Access to all system operations
- **Role-Based Authorization System**
  - `require_role()` helper function for flexible permission checking
  - Supports both dict and Pydantic model user objects
  - Granular permission controls per endpoint
- **Security Features**
  - Self-modification prevention (users cannot change own role/status)
  - Super admin protection (only super admins can manage other super admins)
  - Admin limitations (admins cannot create other admins)
  - Automatic JWT token validation for all admin operations
- **User Filtering and Search**
  - Filter by role (super_admin, admin, moderator, user, guest)
  - Filter by active status (isActive)
  - Filter by email verification status (isEmailVerified)
  - Full-text search across email, firstName, lastName
- **Static File Serving** - FastAPI StaticFiles integration for admin interface

### Changed
- Updated `src/models/user.py` with admin-specific models:
  - Added `UserRoleUpdate` for role change requests
  - Added `UserStatusUpdate` for account activation/deactivation
  - Added `UserListResponse` for paginated user lists
  - Added `UserListFilters` for query parameter validation
- Updated `src/middleware/permissions.py` with `require_role()` function
- Updated `src/main.py` to mount admin static files at `/admin/`
- Updated `src/api/routes.py` to register admin router
- Enhanced Dockerfile to include `public/` directory for admin interface

### Fixed
- **Bcrypt compatibility issue** - Pinned bcrypt to 4.2.1 for passlib 1.7.4 compatibility
- **Import errors** - Fixed relative import issues in admin module
- **Type handling** - Fixed UserResponse vs dict type inconsistencies in permission checks

### Documentation
- Updated [API-Structure.md](Docs/1-Main-Documentation/API-Structure.md) with complete admin endpoint documentation
- Updated [System-Architecture.md](Docs/1-Main-Documentation/System-Architecture.md) to v1.2.0
- Added comprehensive API changelog in API-Structure.md
- Documented all admin endpoints with request/response schemas and examples

### Infrastructure
- Added `public/admin/` directory with HTML/CSS/JavaScript admin interface
- Updated Dockerfile to copy public files into container
- Admin interface accessible at `http://localhost:8000/admin/`

### Security
- Role-based access control (RBAC) implementation
- Multi-level permission validation
- Audit trail for role changes and user modifications
- Protected super admin accounts from unauthorized changes

## [1.1.0] - 2025-10-16

### Added
- **User Authentication System** - Complete JWT-based authentication
  - User registration with password validation
  - User login with bcrypt password hashing
  - Access token (1 hour expiry) and refresh token (7 days expiry)
  - Token refresh endpoint for seamless session extension
  - Logout with token revocation
- **User Management Endpoints**
  - `POST /api/v1/auth/register` - User registration
  - `POST /api/v1/auth/login` - User authentication
  - `POST /api/v1/auth/logout` - Session termination
  - `POST /api/v1/auth/refresh` - Token renewal
  - `GET /api/v1/users/me` - Get current user profile
  - `PATCH /api/v1/users/me` - Update current user profile
  - `DELETE /api/v1/users/me` - Delete current user account
- **User Model** - Complete Pydantic models following User-Structure.md
  - UserRole enum (super_admin, admin, moderator, user, guest)
  - UserCreate, UserUpdate, UserResponse, UserInDB models
  - TokenResponse, TokenPayload models
  - Password validation with strength requirements
- **Database Integration**
  - MongoDB connection manager with async support
  - MySQL connection manager (prepared for future use)
  - User collection with proper indexing
  - Refresh token collection with TTL index
- **Security Features**
  - bcrypt password hashing (cost factor: 12)
  - JWT token generation and validation (HS256 algorithm)
  - Authentication middleware with Bearer token support
  - Rate limiting structure (documented, implementation pending)
- **Middleware System**
  - `get_current_user()` dependency for protected routes
  - JWT token validation and user fetching
  - Error handling for invalid/expired tokens

### Documentation
- Created [User-Structure.md](Docs/1-Main-Documentation/User-Structure.md) - Complete user model documentation
  - User roles and permissions matrix
  - Authentication flows (registration, login, token validation, logout)
  - User lifecycle states
  - Security requirements and best practices
  - Database schemas for MongoDB and MySQL

### Dependencies
- Added PyJWT 2.8.0 (JWT token handling)
- Added python-multipart 0.0.6 (form data parsing)
- Added email-validator 2.1.0 (email validation)

## [1.0.0] - 2025-10-16

### Added
- Initial release of A64 Core Platform API Hub
- FastAPI-based REST API framework
- Health check endpoint (`GET /api/health`)
- Readiness check endpoint (`GET /api/ready`)
- Root information endpoint (`GET /`)
- Automatic API documentation (Swagger UI at `/api/docs`)
- Automatic API documentation (ReDoc at `/api/redoc`)
- Docker containerization support
- Docker Compose multi-container orchestration
- MongoDB 7.0 database integration
- MySQL 8.0 database integration
- Adminer database management UI
- Environment-based configuration with Pydantic
- CORS middleware configuration
- Global exception handling
- Structured logging setup
- Development and production environment support
- Hot-reload development mode

### Documentation
- Comprehensive README.md with setup instructions
- DEPLOYMENT.md with production deployment guide
- CLAUDE.md with development guidelines and coding standards
- API-Structure.md for API endpoint documentation
- Versioning.md for version management
- API standards and RESTful design principles
- Versioning standards with Semantic Versioning
- Git workflow and commit message standards
- Docker containerization standards
- Database naming conventions (MongoDB & MySQL)
- Structured documentation system (Docs/)
  - 1-Main-Documentation/ for core docs
  - 2-Working-Progress/ for active work tracking
  - 3-DevLog/ for development decisions

### Infrastructure
- Dockerfile for API service
- docker-compose.yml for development environment
- Production-ready Docker configuration template
- Health checks for all Docker services
- Volume mounts for development hot-reload
- Network isolation for services
- Non-root user in container for security

### Configuration
- .env.example template for environment variables
- Pydantic settings management
- Support for development and production environments
- Configurable CORS origins
- Configurable database connections
- Configurable logging levels

### Security
- Environment-based secret management
- .gitignore to prevent secret commits
- Non-root Docker user
- CORS configuration
- API key prefix system

### Dependencies
- Python 3.11
- FastAPI 0.109.0
- Uvicorn 0.27.0 (ASGI server)
- Pydantic 2.5.3 (data validation)
- Pydantic-settings 2.1.0 (configuration)
- Motor 3.3.2 (async MongoDB driver)
- PyMongo 4.6.1 (MongoDB driver)
- MySQLClient 2.2.1 (MySQL driver)
- SQLAlchemy 2.0.25 (ORM)
- Python-Jose 3.3.0 (JWT)
- Passlib 1.7.4 (password hashing)
- Development tools: pytest, black, flake8, mypy

### Project Structure
- Organized directory structure following best practices
- Separation of concerns (api, models, controllers, services)
- Dedicated configuration directory
- Test directory structure
- Documentation directory structure

---

## Release Notes Format

Each release should include:
- **Version number** following Semantic Versioning
- **Release date** in ISO format (YYYY-MM-DD)
- **Changes** categorized as:
  - **Added** - New features
  - **Changed** - Changes in existing functionality
  - **Deprecated** - Soon-to-be removed features
  - **Removed** - Removed features
  - **Fixed** - Bug fixes
  - **Security** - Security improvements

---

## Links
- [Versioning Documentation](Docs/1-Main-Documentation/Versioning.md)
- [API Structure Documentation](Docs/1-Main-Documentation/API-Structure.md)
- [Development Guidelines](CLAUDE.md)
- [Deployment Guide](DEPLOYMENT.md)

---

**Note:** This changelog is maintained manually. All significant changes should be documented here before each release.
