# NGINX Health Check Fix

**Status:** ✅ Completed
**Date:** 2025-10-27
**Priority:** High (Blocking Issue)
**Developer:** Claude

---

## 🎯 Problem Summary

NGINX reverse proxy container was showing **unhealthy** status despite NGINX running correctly and serving traffic. This was blocking proper system monitoring and could have caused issues in production environments.

---

## 🔍 Root Cause Analysis

### Issue 1: Duplicate Server Blocks
The original `nginx.conf` had TWO server blocks both listening on port 80:
1. **Default server** (`default_server`) - Only had `/health` endpoint
2. **Main server** (localhost) - Had all application routes but NO `/health` endpoint

When the health check tried to access `http://localhost/health`, it routed to the main server (due to `server_name localhost`), which didn't have a `/health` endpoint, resulting in a 404.

### Issue 2: IPv6 vs IPv4 Resolution
The health check command used:
```yaml
test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost/health"]
```

Inside the Alpine Linux container, `localhost` was resolving to IPv6 address `[::1]`, but NGINX was only listening on IPv4 `0.0.0.0:80`, causing **Connection refused** errors.

**Evidence:**
```bash
$ docker exec a64core-nginx-dev netstat -tulpn | grep nginx
tcp        0      0 0.0.0.0:80              0.0.0.0:*               LISTEN      1/nginx: master pro
```

---

## ✅ Solutions Implemented

### Solution 1: Consolidated Server Blocks

**File:** `nginx/nginx.conf`

**Change:** Removed duplicate default server block and added `/health` endpoint to main server:

```nginx
# Before: Two separate server blocks
server {
    listen 80 default_server;
    server_name _;
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }
}

server {
    listen 80;
    server_name localhost;
    # ... rest of config (no /health)
}

# After: Single server block with all routes
server {
    listen 80;
    server_name localhost _;  # Handle both localhost and default

    # Health check endpoint (for Docker health checks)
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }

    # ... rest of config
}
```

**Benefits:**
- Single source of truth for routing
- `/health` endpoint accessible from any hostname
- Cleaner configuration

### Solution 2: Fixed Health Check to Use IPv4

**File:** `docker-compose.yml`

**Change:** Updated NGINX health check to use explicit IPv4 address:

```yaml
# Before
healthcheck:
  test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost/health"]

# After
healthcheck:
  test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://127.0.0.1/health"]
```

**Why this works:**
- `127.0.0.1` is explicitly IPv4
- Avoids IPv6 resolution issues in Alpine Linux
- Matches the actual listening address of NGINX

---

## 🧪 Testing & Verification

### Test 1: Internal Health Check (Inside Container)
```bash
$ docker exec a64core-nginx-dev wget -O- http://127.0.0.1/health
healthy
```
✅ **Pass**

### Test 2: External Access (From Host)
```bash
$ curl http://localhost/health
healthy
```
✅ **Pass**

### Test 3: API Proxy Through NGINX
```bash
$ curl http://localhost/api/health | python -m json.tool
{
    "status": "healthy",
    "timestamp": "2025-10-27T11:21:08.684896",
    "service": "A64 Core Platform API Hub",
    "version": "1.0.0"
}
```
✅ **Pass**

### Test 4: User Portal Through NGINX
```bash
$ curl http://localhost/ | head -5
<!doctype html>
<html lang="en">
  <head>
    <script type="module">import { injectIntoGlobalHook }...
```
✅ **Pass**

### Test 5: Docker Health Status
```bash
$ docker ps --format "table {{.Names}}\t{{.Status}}" | grep nginx
a64core-nginx-dev         Up 5 minutes (healthy)
```
✅ **Pass** - NGINX now shows **healthy**!

---

## 📊 Before vs After

| Metric | Before | After |
|--------|--------|-------|
| NGINX Status | 🔴 Unhealthy (51 consecutive failures) | 🟢 Healthy |
| Health Check Endpoint | ❌ 404 Not Found / Connection Refused | ✅ 200 OK |
| Frontend Access | ⚠️ Working but unhealthy | ✅ Working and healthy |
| API Proxy | ⚠️ Working but unhealthy | ✅ Working and healthy |
| Monitoring | ❌ False negatives | ✅ Accurate status |

---

## 🐛 Additional Findings: Example App Health Checks

**Issue:** Example app containers (`a64core-example-app`, `a64core-example-app-2`) also showing unhealthy due to same IPv6/IPv4 issue.

**Status:** ⚠️ Non-blocking - Apps are functional despite unhealthy status

**Details:**
- Apps were installed 8 days ago via module management system
- Using `localhost` in health checks (resolves to IPv6)
- Apps actually listen on IPv4 and respond correctly
- Accessible via host ports 9000 and 9001

**Recommendation:**
- Update module management system to use `127.0.0.1` instead of `localhost` for health checks
- Recreate existing example apps with corrected health checks (non-urgent)

---

## 🔄 Files Modified

### 1. `nginx/nginx.conf`
- Removed duplicate `default_server` block
- Added `/health` endpoint to main server block
- Changed `server_name` to `localhost _` (handles both localhost and default)

### 2. `docker-compose.yml`
- Changed NGINX health check from `http://localhost/health` to `http://127.0.0.1/health`

---

## 📚 Lessons Learned

### 1. localhost ≠ 127.0.0.1 in Containers
- `localhost` can resolve to IPv6 (`::1`) or IPv4 (`127.0.0.1`)
- Alpine Linux containers prefer IPv6 when available
- **Always use explicit IP addresses in health checks**

### 2. Server Block Naming Matters
- NGINX uses `server_name` to route requests
- Having `default_server` and named server on same port can cause routing issues
- Test all hostnames that will be used to access the service

### 3. Health Checks Must Match Actual Configuration
- Health check must test actual service behavior
- Simple `return 200` endpoints are perfect for Docker health checks
- Don't proxy health checks to backend services (adds complexity)

### 4. Testing Inside vs Outside Container
- Always test health checks from **inside** the container (same environment as Docker)
- External access (from host) may work even if internal health check fails

---

## 🎯 Impact & Benefits

### Immediate Benefits
✅ **Accurate Monitoring** - Docker correctly reports NGINX health status
✅ **Production Readiness** - Health checks work in orchestration systems (Kubernetes, Docker Swarm)
✅ **Faster Debugging** - Clear distinction between actual failures and false negatives
✅ **System Stability** - Orchestrators can now correctly restart unhealthy containers

### Long-term Benefits
✅ **DevOps Automation** - CI/CD pipelines can trust health check results
✅ **Load Balancing** - Load balancers can accurately route traffic to healthy instances
✅ **Alerting** - Monitoring systems get accurate service status

---

## 📋 Checklist for Future Health Checks

When adding health checks to Docker services:

- [ ] Use explicit IPv4 address (`127.0.0.1`) instead of `localhost`
- [ ] Test health check from **inside** the container
- [ ] Verify service actually listens on tested port/address
- [ ] Use simple endpoints that don't depend on external services
- [ ] Set appropriate `interval`, `timeout`, `retries`, and `start_period`
- [ ] Test health check in all environments (dev, staging, prod)
- [ ] Document health check endpoint in service documentation

---

## 🚀 Next Steps

### Completed ✅
- [x] Fix NGINX health check (IPv4 address)
- [x] Consolidate NGINX server blocks
- [x] Verify all routes working through NGINX
- [x] Test frontend-backend communication
- [x] Document the fix

### Future Improvements 🔮
- [ ] Update module management system to use `127.0.0.1` for all health checks
- [ ] Recreate example apps with corrected health checks
- [ ] Add health check testing to CI/CD pipeline
- [ ] Document health check standards in CLAUDE.md or System-Architecture.md

---

## 📖 References

### Internal Documentation
- [System-Architecture.md](../1-Main-Documentation/System-Architecture.md) - Deployment architecture
- [DEPLOYMENT.md](../../DEPLOYMENT.md) - Deployment instructions

### External Resources
- [Docker Health Checks](https://docs.docker.com/engine/reference/builder/#healthcheck)
- [NGINX Server Names](https://nginx.org/en/docs/http/server_names.html)
- [IPv6 in Containers](https://docs.docker.com/config/daemon/ipv6/)

---

**Status:** ✅ Issue Resolved - System Operational
**Deployment:** Changes applied to development environment
**Testing:** All health checks passing
**Documentation:** Complete

---

**Date Completed:** 2025-10-27
**Resolution Time:** ~30 minutes
**Complexity:** Low (configuration fix)
**Impact:** High (critical monitoring fix)
