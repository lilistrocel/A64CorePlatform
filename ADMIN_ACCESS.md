# Admin Access Guide

**Document Created:** 2025-10-28
**Platform Version:** v1.4.0

---

## 🔐 Admin Credentials

### Super Admin Account
The default super admin account is created during initial setup.

**Email:** `admin@a64platform.com`
**Password:** Set via `ADMIN_PASSWORD` environment variable (see `docker-compose.yml` or your deployment config)
**Role:** `super_admin`
**Status:** Active

> **Note:** Never hardcode credentials. Always use environment variables for password configuration.

---

## 🖥️ Admin Dashboard Access

### URL Access
**Admin Panel URL:** http://localhost/admin/

**Alternative URLs:**
- Direct API: http://localhost:8000/admin/ (same interface)
- Via NGINX: http://localhost/admin/ (recommended)

### What is the Admin Dashboard?

The Admin Dashboard is a **web-based user management interface** that allows administrators to:

1. **View All Users** - Paginated list of all registered users
2. **Search & Filter** - Find users by email, name, role, or status
3. **Manage User Roles** - Change user roles (user, moderator, admin, super_admin)
4. **Manage User Status** - Activate/deactivate user accounts
5. **View User Details** - See complete user information
6. **Delete Users** - Soft delete (90-day retention)

---

## 🎯 Admin Dashboard Features

### Interface Type
- **Single Page Application (SPA)** - HTML/CSS/JavaScript
- **Built-in to API** - Served by FastAPI backend at `/admin/`
- **No React** - Simple vanilla JavaScript for lightweight admin interface
- **Responsive Design** - Works on desktop, tablet, and mobile

### Available Functions

#### 1. **Login Screen**
- Admin/Super Admin authentication required
- Standard email/password login
- JWT token-based authentication
- Session management

#### 2. **User Management Table**
Displays user information with columns:
- Email
- Name (First + Last)
- Role (Guest, User, Moderator, Admin, Super Admin)
- Status (Active/Inactive)
- Email Verified (Yes/No)
- Last Login Date
- Created Date
- Actions (View, Edit Role, Change Status, Delete)

#### 3. **Pagination**
- Default: 20 users per page
- Maximum: 100 users per page
- Page navigation controls

#### 4. **Search & Filters**
- **Search:** Email, first name, last name
- **Filter by Role:** All roles or specific role
- **Filter by Status:** Active, Inactive, or All
- **Filter by Email Verification:** Verified, Unverified, or All

#### 5. **User Actions**
- **Change Role:** Assign new role (with permission checks)
- **Activate/Deactivate:** Enable or disable user account
- **Delete User:** Soft delete (can be restored within 90 days)
- **View Details:** See complete user profile

---

## 📋 Admin API Endpoints

The admin panel uses these backend API endpoints:

### 1. List Users (Paginated)
```
GET /api/v1/admin/users
```
**Query Parameters:**
- `page` - Page number (default: 1)
- `per_page` - Items per page (default: 20, max: 100)
- `role` - Filter by role (guest, user, moderator, admin, super_admin)
- `is_active` - Filter by active status (true/false)
- `is_email_verified` - Filter by email verification (true/false)
- `search` - Search email, firstName, lastName

**Authentication:** Required (admin or super_admin)

### 2. Get User by ID
```
GET /api/v1/admin/users/{userId}
```
**Authentication:** Required (admin or super_admin)

### 3. Update User Role
```
PATCH /api/v1/admin/users/{userId}/role
```
**Body:** `{ "role": "admin" }`
**Authentication:** Required (admin or super_admin)
**Restrictions:**
- Only super_admin can assign super_admin role
- Cannot change own role
- Admin can assign: guest, user, moderator

### 4. Update User Status
```
PATCH /api/v1/admin/users/{userId}/status
```
**Body:** `{ "is_active": false }`
**Authentication:** Required (admin or super_admin)
**Restrictions:**
- Cannot deactivate own account
- Super admin accounts protected

### 5. Delete User
```
DELETE /api/v1/admin/users/{userId}
```
**Authentication:** Required (admin or super_admin)
**Type:** Soft delete (90-day retention)
**Restrictions:**
- Cannot delete own account
- Cannot delete super admin (super_admin only)

---

## 🔑 Role Permissions

### Super Admin (Highest)
- Full system access
- Can manage all users including other admins
- Can assign any role including super_admin
- Can delete any user
- Access to all system features

### Admin
- Can manage most users
- Can assign roles: guest, user, moderator (NOT admin or super_admin)
- Can activate/deactivate users
- Can delete users (except super_admin)
- Access to admin panel

### Moderator
- Limited admin access
- Can view user list (read-only)
- Cannot modify users
- Future: Content moderation features

### User (Default)
- Standard user account
- Can manage own profile only
- Cannot access admin panel

### Guest (Lowest)
- Limited access
- Read-only for public content
- Cannot access admin panel

---

## 🚀 How to Access Admin Dashboard

### Step 1: Login to Admin Panel

1. **Open Browser:** Navigate to http://localhost/admin/
2. **Login Screen:** You'll see the admin login interface
3. **Enter Credentials:**
   - Email: `admin@a64platform.com`
   - Password: (your configured `ADMIN_PASSWORD`)
4. **Click Login:** JWT token generated and stored

### Step 2: Use Admin Dashboard

Once logged in, you'll see:
- **User List Table** - All registered users
- **Search Bar** - Search by email/name
- **Filter Dropdowns** - Filter by role, status, verification
- **Action Buttons** - Manage each user
- **Pagination** - Navigate through users

### Step 3: Manage Users

**Change User Role:**
1. Find user in list
2. Click "Change Role" button
3. Select new role from dropdown
4. Confirm change

**Activate/Deactivate User:**
1. Find user in list
2. Click "Activate" or "Deactivate" button
3. User status updated immediately

**Delete User:**
1. Find user in list
2. Click "Delete" button
3. Confirm deletion (soft delete, 90-day retention)

---

## 🧪 Testing Admin Dashboard

### Quick Test via curl

**Login:**
```bash
curl -X POST http://localhost/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@a64platform.com","password":"YOUR_ADMIN_PASSWORD"}'
```

**List Users (with token):**
```bash
TOKEN="your_access_token_here"

curl -X GET "http://localhost/api/v1/admin/users?page=1&per_page=20" \
  -H "Authorization: Bearer $TOKEN"
```

### Quick Test via Browser

1. Open http://localhost/admin/ in browser
2. Login with admin credentials
3. Browse user list, test filters, try user actions

### Quick Test via Swagger UI

1. Open http://localhost:8000/api/docs
2. Find "Admin" section
3. Click "Authorize" button
4. Login to get token
5. Try admin endpoints interactively

---

## 📱 User Portal vs Admin Dashboard

### User Portal (http://localhost:5173)
**Purpose:** End-user application
**Features:**
- User registration and login
- Personal profile management
- CCM Dashboard with widgets
- Settings and preferences
- User-facing features

**Access:** All registered users

### Admin Dashboard (http://localhost/admin/)
**Purpose:** System administration
**Features:**
- User management (list, search, edit)
- Role assignment
- Account activation/deactivation
- User deletion
- System administration

**Access:** Admin and Super Admin only

---

## 🔒 Security Notes

### Password Security
- Passwords are hashed with bcrypt (cost factor 12)
- Never stored in plain text
- Never logged or exposed in API responses
- Strong password requirements enforced

### JWT Token Security
- Access tokens expire after 1 hour
- Refresh tokens expire after 7 days
- Tokens are signed with HS256 algorithm
- Token validation on every request

### Admin Access Security
- Role-based access control (RBAC)
- Permission checks on all admin actions
- Self-modification prevention (can't change own role/status)
- Super admin protection (can only be managed by other super admins)
- Audit logging (all admin actions logged)

### Rate Limiting
- Admin endpoints: 500 requests/minute
- Super Admin: 1000 requests/minute
- Login attempts: 5 attempts per email, 15-minute lockout

---

## 🐛 Troubleshooting

### Can't Login to Admin Dashboard

**Problem:** Login fails with "Invalid credentials"
**Solution:**
1. Verify credentials: `admin@a64platform.com` / your configured `ADMIN_PASSWORD`
2. Check user exists in database:
   ```bash
   docker exec a64core-mongodb-dev mongosh a64core_db --quiet --eval \
     'db.users.find({email: "admin@a64platform.com"}, {email:1, role:1, isActive:1})'
   ```
3. If user doesn't exist, create super admin:
   ```bash
   docker exec a64core-api-dev python scripts/create_superadmin.py
   ```

### Admin Dashboard Not Loading

**Problem:** http://localhost/admin/ returns 404 or error
**Solution:**
1. Check API is running:
   ```bash
   curl http://localhost/api/health
   ```
2. Check NGINX is healthy:
   ```bash
   docker ps | grep nginx
   ```
3. Restart services if needed:
   ```bash
   docker-compose restart api nginx
   ```

### Permission Denied Errors

**Problem:** "Permission denied" when trying to manage users
**Solution:**
1. Verify you're logged in as admin or super_admin
2. Check your role:
   ```bash
   curl http://localhost/api/v1/auth/me \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```
3. Admin role can only assign limited roles
4. Only super_admin can manage other admins

---

## 📚 Additional Resources

### Documentation Files
- **API Structure:** `Docs/1-Main-Documentation/API-Structure.md`
- **User Structure:** `Docs/1-Main-Documentation/User-Structure.md`
- **System Architecture:** `Docs/1-Main-Documentation/System-Architecture.md`

### API Documentation
- **Swagger UI:** http://localhost:8000/api/docs
- **ReDoc:** http://localhost:8000/api/redoc

### Development Files
- **Admin API:** `src/api/v1/admin.py`
- **Admin HTML:** Served inline from admin.py (embedded in code)
- **User Service:** `src/services/user_service.py`
- **Auth Middleware:** `src/middleware/auth.py`
- **Permissions:** `src/middleware/permissions.py`

---

## 🎯 Quick Reference

| Item | Value |
|------|-------|
| **Admin URL** | http://localhost/admin/ |
| **Admin Email** | admin@a64platform.com |
| **Admin Password** | Set via `ADMIN_PASSWORD` env var |
| **Admin Role** | super_admin |
| **API Docs** | http://localhost:8000/api/docs |
| **User Portal** | http://localhost:5173 |
| **Dashboard API** | http://localhost/api/v1/dashboard/* |

---

**Last Updated:** 2025-10-28
**Platform Version:** v1.4.0
**Status:** ✅ Operational
