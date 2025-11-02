# ============================================================================
# Clear Development Cache Script
# ============================================================================
# This script clears browser cache, local storage, and restarts dev servers
# Run with: .\scripts\clear-dev-cache.ps1
# ============================================================================

Write-Host "`n=== A64 Core Platform - Clear Development Cache ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Kill all node processes (Vite servers)
Write-Host "[1/5] Stopping all Node.js processes..." -ForegroundColor Yellow
try {
    $nodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue
    if ($nodeProcesses) {
        Stop-Process -Name "node" -Force -ErrorAction SilentlyContinue
        Write-Host "   ✓ Stopped $($nodeProcesses.Count) Node.js process(es)" -ForegroundColor Green
    } else {
        Write-Host "   ✓ No Node.js processes running" -ForegroundColor Green
    }
} catch {
    Write-Host "   ! Warning: Could not stop all Node.js processes" -ForegroundColor Yellow
}

Start-Sleep -Seconds 1

# Step 2: Clear Chrome cache (if running)
Write-Host "`n[2/5] Clearing Chrome cache..." -ForegroundColor Yellow
try {
    $chromeProcesses = Get-Process -Name "chrome" -ErrorAction SilentlyContinue
    if ($chromeProcesses) {
        Write-Host "   ! Chrome is running. Please close Chrome to clear cache completely." -ForegroundColor Yellow
        Write-Host "   ! Or run this script with Chrome closed for full cache clearing." -ForegroundColor Yellow
    } else {
        # Clear Chrome cache folders
        $chromeCachePaths = @(
            "$env:LOCALAPPDATA\Google\Chrome\User Data\Default\Cache",
            "$env:LOCALAPPDATA\Google\Chrome\User Data\Default\Code Cache",
            "$env:LOCALAPPDATA\Google\Chrome\User Data\Default\GPUCache"
        )

        foreach ($path in $chromeCachePaths) {
            if (Test-Path $path) {
                Remove-Item -Path "$path\*" -Recurse -Force -ErrorAction SilentlyContinue
            }
        }
        Write-Host "   ✓ Chrome cache cleared" -ForegroundColor Green
    }
} catch {
    Write-Host "   ! Warning: Could not clear Chrome cache" -ForegroundColor Yellow
}

# Step 3: Clear Edge cache (if running)
Write-Host "`n[3/5] Clearing Edge cache..." -ForegroundColor Yellow
try {
    $edgeProcesses = Get-Process -Name "msedge" -ErrorAction SilentlyContinue
    if ($edgeProcesses) {
        Write-Host "   ! Edge is running. Please close Edge to clear cache completely." -ForegroundColor Yellow
    } else {
        $edgeCachePaths = @(
            "$env:LOCALAPPDATA\Microsoft\Edge\User Data\Default\Cache",
            "$env:LOCALAPPDATA\Microsoft\Edge\User Data\Default\Code Cache"
        )

        foreach ($path in $edgeCachePaths) {
            if (Test-Path $path) {
                Remove-Item -Path "$path\*" -Recurse -Force -ErrorAction SilentlyContinue
            }
        }
        Write-Host "   ✓ Edge cache cleared" -ForegroundColor Green
    }
} catch {
    Write-Host "   ! Warning: Could not clear Edge cache" -ForegroundColor Yellow
}

# Step 4: Clear project build artifacts
Write-Host "`n[4/5] Clearing project build artifacts..." -ForegroundColor Yellow
try {
    $artifactPaths = @(
        ".\frontend\user-portal\node_modules\.vite",
        ".\frontend\user-portal\dist",
        ".\node_modules\.cache"
    )

    foreach ($path in $artifactPaths) {
        if (Test-Path $path) {
            Remove-Item -Path $path -Recurse -Force -ErrorAction SilentlyContinue
            Write-Host "   ✓ Cleared: $path" -ForegroundColor Green
        }
    }
} catch {
    Write-Host "   ! Warning: Could not clear all build artifacts" -ForegroundColor Yellow
}

# Step 5: Restart Vite dev server
Write-Host "`n[5/5] Restarting Vite dev server..." -ForegroundColor Yellow
Write-Host "   Starting server on http://localhost:5173..." -ForegroundColor Cyan

Start-Sleep -Seconds 2

# Start Vite in a new window
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD\frontend\user-portal'; npm run dev"

Write-Host "   ✓ Vite server starting in new window" -ForegroundColor Green

Write-Host "`n=== Cache Clearing Complete ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "1. Wait for Vite server to start (check the new window)" -ForegroundColor White
Write-Host "2. Open browser in INCOGNITO/PRIVATE mode: http://localhost:5173" -ForegroundColor White
Write-Host "3. Or clear browser data manually (Ctrl+Shift+Delete)" -ForegroundColor White
Write-Host ""
Write-Host "For instant cache clearing during development:" -ForegroundColor Yellow
Write-Host "- Visit: http://localhost:5173/debug/clear-cache" -ForegroundColor Cyan
Write-Host ""
