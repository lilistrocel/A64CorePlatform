# Debugging Guide - Cache Management

This guide provides tools and strategies for dealing with browser caching issues during development.

## Quick Solutions

### 🚀 Method 1: In-Browser Cache Clearing (FASTEST)

**URL**: `http://localhost:5173/debug/clear-cache`

1. Open your browser
2. Navigate to `http://localhost:5173/debug/clear-cache`
3. Click "Clear All & Reload"
4. Done! Page will automatically reload with fresh cache

**Features**:
- ✓ View current cache state (localStorage, sessionStorage, auth tokens)
- ✓ Clear auth data only
- ✓ Hard reload (Ctrl+Shift+R equivalent)
- ✓ Clear all cache and reload
- ✓ Works without closing the browser

**Recommended**: Bookmark this URL for instant access during development!

---

### 🔧 Method 2: PowerShell Script (Windows)

**Location**: `.\scripts\clear-dev-cache.ps1`

```powershell
# Run from project root
.\scripts\clear-dev-cache.ps1
```

**What it does**:
1. Stops all Node.js processes (Vite servers)
2. Clears Chrome cache (if browser is closed)
3. Clears Edge cache (if browser is closed)
4. Removes Vite build artifacts (.vite, dist, node_modules/.cache)
5. Restarts Vite dev server in a new window

**Note**: Close your browser before running for complete cache clearing.

---

### 🐧 Method 3: Bash Script (Linux/Mac)

**Location**: `./scripts/clear-dev-cache.sh`

```bash
# Run from project root
./scripts/clear-dev-cache.sh
```

**What it does**:
1. Kills all Vite/Node processes
2. Clears Chrome/Firefox cache (if browsers are closed)
3. Removes build artifacts
4. Restarts Vite dev server

---

## Development Configuration

### Vite Config - No-Cache Headers

The Vite development server is configured with aggressive no-cache headers:

**File**: `frontend/user-portal/vite.config.ts`

```typescript
server: {
  headers: {
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store',
  },
}
```

This prevents the browser from caching responses from the Vite dev server.

---

## Browser Best Practices

### Chrome/Edge DevTools

1. **Open DevTools**: `F12`
2. **Network Tab**: Check "Disable cache" checkbox
3. **Leave DevTools open** while developing

### Hard Refresh Shortcuts

- **Windows**: `Ctrl + Shift + R` or `Ctrl + F5`
- **Mac**: `Cmd + Shift + R`
- **Linux**: `Ctrl + Shift + R`

### Incognito/Private Mode

Always test in incognito mode when you suspect caching issues:

- **Chrome**: `Ctrl + Shift + N` (Windows/Linux) or `Cmd + Shift + N` (Mac)
- **Edge**: `Ctrl + Shift + N` (Windows/Linux) or `Cmd + Shift + N` (Mac)
- **Firefox**: `Ctrl + Shift + P` (Windows/Linux) or `Cmd + Shift + P` (Mac)

---

## Common Cache Issues

### Issue 1: "Coming Soon" Instead of Actual Page

**Symptoms**:
- Page shows placeholder text instead of real content
- New components don't appear

**Solutions**:
1. Visit `http://localhost:5173/debug/clear-cache` and click "Clear All & Reload"
2. Or hard refresh: `Ctrl + Shift + R`
3. Or use incognito mode

---

### Issue 2: Authentication Keeps Logging Out

**Symptoms**:
- Redirected to login page after accessing protected routes
- Tokens disappear from localStorage

**Solutions**:
1. Visit `http://localhost:5173/debug/clear-cache`
2. Check "Current Cache State" to see if tokens exist
3. Click "Clear Auth Only" to reset auth state
4. Re-login

---

### Issue 3: Changes Not Appearing After Code Update

**Symptoms**:
- Modified code doesn't reflect in browser
- Old version of components still showing

**Solutions**:
1. Check Vite dev server is running (should show HMR updates in terminal)
2. Visit `http://localhost:5173/debug/clear-cache` → "Hard Reload"
3. If still not working, run `.\scripts\clear-dev-cache.ps1` to restart everything

---

### Issue 4: Multiple Vite Servers Running

**Symptoms**:
- Port 5173 in use, server starts on 5174, 5175, etc.
- Different content on different ports

**Solution (Windows)**:
```powershell
# Kill all Node processes
taskkill /F /IM node.exe

# Check if port 5173 is free
netstat -ano | findstr :5173

# If still occupied, kill specific PID
taskkill /F /PID <PID_NUMBER>

# Restart Vite
cd frontend\user-portal
npm run dev
```

**Solution (Linux/Mac)**:
```bash
# Kill all Vite processes
pkill -f vite

# Check port 5173
lsof -i :5173

# Kill specific process
kill -9 <PID>

# Restart Vite
cd frontend/user-portal
npm run dev
```

---

## Automated Testing with Cache Clearing

When running Playwright tests, ensure cache is cleared:

```typescript
test('My test', async ({ page, context }) => {
  // Clear all storage before test
  await context.clearCookies();
  await page.goto('http://localhost:5173/login');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  // Now proceed with test...
});
```

---

## Troubleshooting Checklist

When experiencing cache issues, go through this checklist:

- [ ] Hard refresh: `Ctrl + Shift + R`
- [ ] Visit: `http://localhost:5173/debug/clear-cache`
- [ ] Check DevTools Console for errors
- [ ] Check Network tab - are requests going to correct port (5173)?
- [ ] Verify Vite server is running: `http://localhost:5173`
- [ ] Try incognito/private mode
- [ ] Run cache clearing script: `.\scripts\clear-dev-cache.ps1`
- [ ] Check if multiple Vite servers are running
- [ ] Clear browser data manually: `Ctrl + Shift + Delete` → Clear last hour

---

## Production Build

**Note**: Cache headers are only for development. Production builds should have proper cache strategies.

To test production build locally:

```bash
cd frontend/user-portal
npm run build
npm run preview
```

This serves the optimized production build without development cache headers.

---

## Additional Resources

### Browser Cache Locations

**Chrome (Windows)**:
- `%LOCALAPPDATA%\Google\Chrome\User Data\Default\Cache`
- `%LOCALAPPDATA%\Google\Chrome\User Data\Default\Code Cache`

**Chrome (Mac)**:
- `~/Library/Caches/Google/Chrome`

**Chrome (Linux)**:
- `~/.cache/google-chrome`

**Edge (Windows)**:
- `%LOCALAPPDATA%\Microsoft\Edge\User Data\Default\Cache`

### Service Worker

If service workers are registered, they can also cache content:

```javascript
// Check registered service workers
navigator.serviceWorker.getRegistrations().then(registrations => {
  console.log('Service Workers:', registrations.length);
  registrations.forEach(registration => registration.unregister());
});
```

---

## Summary: Which Method to Use?

| Scenario | Recommended Method | Speed |
|----------|-------------------|-------|
| Quick fix during dev | Visit `/debug/clear-cache` | ⚡ Instant |
| Between test runs | Hard refresh (`Ctrl+Shift+R`) | ⚡ Instant |
| Complete cleanup | Run `clear-dev-cache.ps1` | 🔄 ~10 sec |
| Testing auth issues | Visit `/debug/clear-cache` → "Clear Auth Only" | ⚡ Instant |
| Multiple Vite servers | Run `clear-dev-cache.ps1` | 🔄 ~10 sec |
| Suspect deep cache | Close browser → Run script → Reopen in incognito | 🔄 ~30 sec |

---

**💡 Pro Tip**: Add this to your muscle memory:
1. `F12` to open DevTools
2. Network tab → Check "Disable cache"
3. Bookmark `http://localhost:5173/debug/clear-cache`
4. Keep DevTools open while developing
