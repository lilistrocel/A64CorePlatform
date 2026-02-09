# Frontend Bundle Size and Performance Analysis

**Date:** 2026-02-09
**Analyst:** Claude Agent
**Feature:** #366 - Audit frontend bundle size and load times

---

## Executive Summary

The A64 Core Platform frontend is well-optimized with proper code splitting and lazy loading. Total bundle size is **3.21 MB** (uncompressed) / **~790 KB** (gzip), which is reasonable for an enterprise application with maps, charts, and multiple modules.

**Key Metrics:**
- First Contentful Paint (FCP): **158ms** (Excellent - target <1.8s)
- DOM Content Loaded: **158ms** (Excellent)
- Page Load Complete: **175ms** (Excellent)

---

## Bundle Size Breakdown

### Production Build Output

| Chunk | Size | Gzipped | Category |
|-------|------|---------|----------|
| vendor-maps (MapLibre, Turf) | 1,028.84 KB | 279.08 KB | **Heavy - Maps** |
| FarmManager | 525.25 KB | 105.28 KB | **Heavy - Module** |
| index (main) | 400.40 KB | 100.88 KB | Core App |
| vendor-charts (Recharts) | 383.26 KB | 111.67 KB | **Heavy - Charts** |
| vendor-react | 165.29 KB | 53.91 KB | Framework |
| Dashboard | 106.15 KB | 28.77 KB | Module |
| vendor-state (Zustand, etc.) | 89.41 KB | 25.13 KB | State Management |
| vendor-data (Axios, React Query) | 78.13 KB | 26.99 KB | Data Fetching |
| InventoryDashboard | 77.05 KB | 12.19 KB | Module |
| DrawingControls | 65.55 KB | 18.13 KB | Component |
| EmployeeDetailPage | 52.44 KB | 9.52 KB | Module |
| BlockTaskList | 38.79 KB | 6.93 KB | Module |
| vendor-ui (styled-components, lucide) | 33.56 KB | 12.14 KB | UI Framework |

### Total Bundle Size

| Metric | Uncompressed | Gzipped |
|--------|--------------|---------|
| JavaScript | ~3.1 MB | ~790 KB |
| CSS | ~77 KB | ~12 KB |
| **Total** | **~3.2 MB** | **~802 KB** |

---

## Large Dependencies Analysis

### Critical (>100 KB gzipped)

| Package | Size (gzip) | Used For | Optimization Opportunity |
|---------|-------------|----------|-------------------------|
| MapLibre GL | ~250 KB | Farm maps | Already lazy-loaded |
| Recharts | ~112 KB | Dashboard charts | Already lazy-loaded |
| FarmManager | ~105 KB | Farm module | Already lazy-loaded |
| Main bundle | ~101 KB | Core app | Consider further splitting |

### Heavy but Necessary

| Package | Size (gzip) | Notes |
|---------|-------------|-------|
| React + ReactDOM | ~54 KB | Framework - required |
| Turf.js | ~29 KB | Geospatial calculations - used with maps |
| Axios | ~13 KB | HTTP client |
| React Query | ~14 KB | Server state management |

---

## Code Splitting Analysis

### Current Implementation (GOOD)

```typescript
// All page components are lazy-loaded via React.lazy()
const FarmManager = lazy(() => import('./pages/farm/FarmManager'));
const Dashboard = lazy(() => import('./pages/dashboard/Dashboard'));
// ... 30+ lazy-loaded pages
```

### Vendor Chunk Strategy (Vite Config)

```javascript
manualChunks: {
  'vendor-react': ['react', 'react-dom', 'react-router-dom'],
  'vendor-ui': ['styled-components', 'lucide-react'],
  'vendor-charts': ['recharts'],
  'vendor-maps': ['maplibre-gl', '@turf/turf'],
  'vendor-state': ['zustand', 'react-hook-form', '@hookform/resolvers', 'zod'],
  'vendor-data': ['axios', '@tanstack/react-query'],
}
```

**Assessment:** Proper vendor chunking is implemented. Dependencies are split into logical groups.

---

## Route-Based Code Splitting

### Initial Load (Login Page)

Only essential chunks are loaded:
- `index.js` (core app + shared components)
- `vendor-react.js`
- `vendor-ui.js`
- `vendor-state.js`
- `Login.js` (lazy-loaded)

**Initial JS Load:** ~340 KB gzipped (excluding maps/charts)

### On-Demand Loading

| Route | Additional Chunks Loaded |
|-------|-------------------------|
| `/dashboard` | Dashboard.js, vendor-charts.js |
| `/farm/*` | FarmManager.js, vendor-maps.js, DrawingControls.js |
| `/operations` | OperationsDashboard.js |
| `/crm/*` | CRMPage.js, CustomerDetailPage.js |
| `/hr/*` | HRDashboardPage.js, EmployeeListPage.js |

**Assessment:** Routes are properly split. Heavy modules (maps, charts) only load when needed.

---

## Performance Metrics

### Login Page (Cold Load)

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| First Contentful Paint | 158ms | <1.8s | Excellent |
| DOM Content Loaded | 158ms | <2s | Excellent |
| Load Event End | 175ms | <3s | Excellent |
| Transfer Size (HTML) | 931 bytes | <5 KB | Excellent |

### Dashboard Page (After Login)

| Metric | Expected Value | Notes |
|--------|----------------|-------|
| Additional JS | ~140 KB gzip | Dashboard + Charts |
| Time to Interactive | <500ms | With cached vendor chunks |

### Farm Manager Page

| Metric | Expected Value | Notes |
|--------|----------------|-------|
| Additional JS | ~385 KB gzip | Maps + FarmManager |
| Time to Interactive | <1s | Maps are render-heavy |

---

## React Query Configuration

### Current Settings (OPTIMIZED)

```typescript
defaultOptions: {
  queries: {
    staleTime: 30 * 1000,        // 30 seconds
    gcTime: 5 * 60 * 1000,       // 5 minutes
    refetchOnWindowFocus: false, // Reduces API calls
    refetchOnMount: false,       // Uses cached data
    refetchOnReconnect: false,   // Prevents spam
    retry: 1,                    // Single retry
  }
}
```

**Assessment:** Well-configured. Prevents duplicate API calls and excessive refetching.

---

## Render-Blocking Resources

### Identified Issues

1. **None** - All CSS is inlined or loaded asynchronously
2. **None** - All JS uses `type="module"` (deferred by default)

### Font Loading

- System fonts used (no external font downloads)
- No FOUT (Flash of Unstyled Text) issues

---

## Optimization Opportunities

### Priority 1 - Quick Wins

1. **Split Main Bundle Further**
   - Move shared layout components to separate chunk
   - Expected savings: ~20-30 KB gzip

2. **Optimize FarmManager**
   - Split drawing controls into separate lazy chunk (already done)
   - Consider further splitting map components

### Priority 2 - Medium Effort

1. **Tree-Shake Unused Exports**
   - Review lucide-react imports (only import used icons)
   - Review Turf.js imports (only import used functions)
   - Expected savings: ~10-15 KB gzip

2. **Implement Route Prefetching**
   - Prefetch likely navigation targets on hover
   - Improves perceived performance

### Priority 3 - Lower Priority

1. **Consider Lighter Alternatives**
   - Replace Recharts with lighter library for simple charts
   - Not recommended if advanced chart features needed

2. **Enable Brotli Compression**
   - ~15-20% smaller than gzip
   - Requires nginx configuration

---

## Bundle Visualization

```
Total: 3.21 MB (uncompressed)

[==================] vendor-maps     32.0% (1,028 KB)
[=========]          FarmManager     16.3% (525 KB)
[========]           index           12.5% (400 KB)
[========]           vendor-charts   11.9% (383 KB)
[===]                vendor-react    5.1% (165 KB)
[==]                 Dashboard       3.3% (106 KB)
[==]                 vendor-state    2.8% (89 KB)
[=]                  vendor-data     2.4% (78 KB)
[=]                  InventoryDash   2.4% (77 KB)
[=]                  DrawingControls 2.0% (65 KB)
[...]                other chunks    9.3% (300 KB)
```

---

## Recommendations Summary

| Recommendation | Priority | Effort | Impact |
|----------------|----------|--------|--------|
| Current setup is well-optimized | - | - | - |
| Enable Brotli compression (nginx) | P2 | Low | ~15% smaller |
| Tree-shake unused icon imports | P2 | Low | ~10 KB savings |
| Prefetch likely routes | P3 | Medium | Better UX |
| Monitor with Real User Monitoring | P3 | Medium | Data-driven optimization |

---

## Conclusion

The frontend bundle is **well-optimized** for an enterprise application with maps and charts:

1. **Code Splitting:** Properly implemented with React.lazy() for all routes
2. **Vendor Chunks:** Logically separated for optimal caching
3. **Lazy Loading:** Heavy dependencies (maps, charts) only load when needed
4. **React Query:** Configured to minimize API calls
5. **No Render-Blocking:** All resources load efficiently

**No critical issues found.** The current setup follows best practices for React applications.

---

## Test Results

- Build Command: `npm run build`
- Build Time: 6.34s
- Total Modules: 3,504
- Output: 64 chunks

**Screenshots:**
- `feature366-bundle-analysis-login.png` - Login page verification
