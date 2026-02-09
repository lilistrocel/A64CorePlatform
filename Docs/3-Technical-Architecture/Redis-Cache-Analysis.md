# Redis Cache Effectiveness Analysis

**Date:** 2026-02-09
**Analyst:** Claude Agent
**Feature:** #365 - Review Redis cache effectiveness

---

## Executive Summary

Redis caching is currently **underutilized** in the A64 Core Platform. The cache hit ratio is only **42%** (117 hits / 283 total requests), and only **2 active keys** exist (both for rate limiting). Several high-frequency database queries are not cached, representing significant optimization opportunities.

---

## Current Redis Configuration

### Memory Usage
| Metric | Value |
|--------|-------|
| Used Memory | 1.25 MB |
| Peak Memory | 1.42 MB |
| System Memory | 31.03 GB |
| Memory Overhead | 93.88% for dataset |

**Assessment:** Memory usage is minimal (<0.01% of available). There is substantial capacity for additional caching.

### Active Keys
| Key Pattern | Count | TTL | Purpose |
|-------------|-------|-----|---------|
| `rate_limit:user:*` | 1 | 60s | Per-user rate limiting |
| `rate_limit:ip:*` | 1 | 60s | Per-IP rate limiting |

**Assessment:** Only rate limiting keys are present. No application data is being actively cached.

### Cache Hit/Miss Statistics
| Metric | Value | Ratio |
|--------|-------|-------|
| Keyspace Hits | 117 | 42% |
| Keyspace Misses | 166 | 58% |
| Total Commands | 41,356 | - |

**Assessment:** Hit ratio is below optimal (target: 80%+). Most cache misses are due to short TTLs (30-60s) expiring before subsequent requests.

---

## Currently Cached Endpoints

| Endpoint | TTL | Key Prefix | Assessment |
|----------|-----|------------|------------|
| `GET /api/v1/farms` | 60s | `farm` | Good - frequently accessed |
| `GET /farm-manager/api/v1/dashboard` | 30s | `farm` | Too short for dashboard |
| `GET /sales/api/v1/dashboard` | 30s | `sales` | Too short for dashboard |
| `GET /sales/api/v1/stats` | 30s | `sales_stats` | Too short for stats |
| `GET /farm-manager/api/v1/plant-data` | 300s | `farm` | Good - appropriate for reference data |

---

## Uncached High-Frequency Endpoints

### Critical - Should Be Cached

1. **`GET /api/v1/dashboard/summary`**
   - Executes **9 database aggregation queries** per request
   - Called on every dashboard page load
   - Recommended TTL: 30-60 seconds
   - Expected impact: 70-90% reduction in DB load for dashboard

2. **`GET /api/v1/dashboard/widgets/{widget_id}/data`**
   - Called for each widget on dashboard
   - Database queries per widget: 1-3
   - Recommended TTL: 30-60 seconds

3. **`POST /api/v1/dashboard/widgets/bulk`**
   - Bulk widget data fetching
   - Could cache individual widget responses
   - Recommended: Cache at widget level, compose bulk response

4. **`GET /api/v1/users`**
   - User list pagination
   - Called by admin panel frequently
   - Recommended TTL: 60 seconds (invalidate on user mutation)

5. **`GET /api/v1/modules`**
   - Module list (rarely changes)
   - Recommended TTL: 300 seconds

### Secondary - Consider Caching

| Endpoint | Current State | Recommendation |
|----------|--------------|----------------|
| `/api/v1/admin/users` | Not cached | 60s TTL, admin only |
| `/api/v1/auth/me` | Not cached | User-specific, short TTL (10s) |
| Farm detail endpoints | Not cached | 60s TTL per farm |
| Block listings | Not cached | 60s TTL |

---

## TTL Analysis

### Current TTL Settings

| TTL | Endpoints | Assessment |
|-----|-----------|------------|
| 30s | Dashboards, Stats | **Too short** - dashboard data typically unchanged for minutes |
| 60s | Farm list | Appropriate for list data |
| 300s | Plant data | Good for reference data |

### Recommended TTL Adjustments

| Data Type | Current TTL | Recommended TTL | Rationale |
|-----------|-------------|-----------------|-----------|
| Dashboard summary | N/A | 60-120s | Aggregated counts change slowly |
| Dashboard widgets | N/A | 60s | Widget data should be fresh but not real-time |
| Farm/Sales dashboards | 30s | 60s | Double TTL to improve hit rate |
| User lists | N/A | 60s | With invalidation on mutations |
| Module lists | N/A | 300s | Modules rarely change |
| Reference data | 300s | 600s | Plant data, crop types, etc. |

---

## Cache Stampede Risk Analysis

### High Risk Endpoints

1. **Dashboard Summary** (Uncached)
   - Risk: All users hit DB simultaneously after cache miss
   - Mitigation: Add caching with lock mechanism

2. **Farm Dashboard** (30s TTL)
   - Risk: Short TTL causes frequent stampedes
   - Mitigation: Increase TTL to 60s, consider stale-while-revalidate pattern

### Recommendations to Prevent Stampedes

1. **Probabilistic Early Expiration**
   - Refresh cache before TTL expires (e.g., at 80% of TTL)
   - Prevents all instances hitting DB at exact expiry

2. **Background Cache Warming**
   - Pre-populate common dashboard queries on application start
   - Schedule periodic cache refresh (already exists for weather)

3. **Lock-Based Cache Refresh**
   - Use Redis SETNX to acquire refresh lock
   - Only one instance refreshes, others wait or serve stale

---

## Additional Caching Strategies

### 1. Query Result Caching
Currently implemented via `@cache_response` decorator. Expand usage to:
- Dashboard summary endpoint
- Widget data endpoints
- Admin user listings
- Module listings

### 2. Session/Auth Token Caching
Not currently implemented. Consider:
- Cache user role/permissions (avoid DB lookup on every request)
- Cache JWT validation results (short TTL)

### 3. Database Query Caching
Implement at service layer for:
- Count queries (`count_documents`)
- Aggregation pipelines
- Frequently accessed single documents

### 4. Response Fragment Caching
For bulk endpoints, cache individual items:
- Widget data cached per widget ID
- Compose bulk responses from cached fragments

---

## Implementation Recommendations

### Priority 1 (High Impact, Low Effort)

1. **Add caching to dashboard summary endpoint**
   ```python
   @router.get("/summary")
   @cache_response(ttl=60, key_prefix="dashboard")
   async def get_dashboard_summary(...):
   ```

2. **Increase dashboard TTLs from 30s to 60s**
   - Farm dashboard: 30s -> 60s
   - Sales dashboard: 30s -> 60s

3. **Add caching to widget data endpoint**
   ```python
   @router.get("/widgets/{widget_id}/data")
   @cache_response(ttl=60, key_prefix="widget")
   async def get_widget_data(...):
   ```

### Priority 2 (Medium Impact)

1. **Add cache invalidation on data mutations**
   - Use `@invalidate_cache_pattern` decorator on POST/PUT/DELETE
   - Pattern: `dashboard:*` when farm/order/employee data changes

2. **Cache user lists with proper invalidation**
   ```python
   @router.get("/users")
   @cache_response(ttl=60, key_prefix="users")
   async def get_users(...):
   ```

3. **Cache module listings**
   ```python
   @router.get("/modules")
   @cache_response(ttl=300, key_prefix="modules")
   async def list_modules(...):
   ```

### Priority 3 (Lower Impact)

1. **Implement cache warming on app startup**
2. **Add probabilistic early expiration**
3. **Monitor and adjust TTLs based on traffic patterns**

---

## Monitoring Recommendations

### Metrics to Track

1. **Cache Hit Ratio** (target: >80%)
   ```bash
   redis-cli -a redispassword INFO stats | grep keyspace
   ```

2. **Memory Usage Trend**
   ```bash
   redis-cli -a redispassword INFO memory | grep used_memory_human
   ```

3. **Key Count and Distribution**
   ```bash
   redis-cli -a redispassword DBSIZE
   redis-cli -a redispassword KEYS '*' | sort | uniq -c
   ```

### Alerting Thresholds

| Metric | Warning | Critical |
|--------|---------|----------|
| Hit Ratio | <70% | <50% |
| Memory Usage | >50% | >80% |
| Connection Count | >80% pool | >95% pool |

---

## Conclusion

The Redis cache infrastructure is well-implemented but significantly underutilized. By:

1. Adding caching to the dashboard summary endpoint
2. Extending TTLs on existing cached endpoints
3. Implementing proper cache invalidation

We expect to achieve:
- **60-80% reduction** in database load for dashboard queries
- **Cache hit ratio improvement** from 42% to 80%+
- **Improved response times** for frequently accessed pages

---

## Appendix: Commands for Cache Inspection

```bash
# Connect to Redis
docker exec -it a64core-redis-dev redis-cli -a redispassword

# View all keys
KEYS *

# Check memory usage
INFO memory

# Check hit/miss stats
INFO stats

# Monitor cache in real-time
MONITOR

# Check TTL of a specific key
TTL "farm:get_farms:73c923d3"

# Clear all cached data (use carefully!)
FLUSHDB
```
