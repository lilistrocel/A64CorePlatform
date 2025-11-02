#!/bin/bash
# ============================================================================
# Clear Development Cache Script (Linux/Mac)
# ============================================================================
# This script clears browser cache, local storage, and restarts dev servers
# Run with: ./scripts/clear-dev-cache.sh
# ============================================================================

echo ""
echo "=== A64 Core Platform - Clear Development Cache ==="
echo ""

# Step 1: Kill all node processes (Vite servers)
echo "[1/5] Stopping all Node.js processes..."
if pgrep -x "node" > /dev/null; then
    pkill -f "vite" 2>/dev/null
    pkill -f "node" 2>/dev/null
    echo "   ✓ Stopped Node.js processes"
else
    echo "   ✓ No Node.js processes running"
fi

sleep 1

# Step 2: Clear Chrome cache (Linux/Mac)
echo ""
echo "[2/5] Clearing Chrome cache..."
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    CHROME_CACHE="$HOME/Library/Caches/Google/Chrome"
    if [ -d "$CHROME_CACHE" ]; then
        rm -rf "$CHROME_CACHE"/* 2>/dev/null
        echo "   ✓ Chrome cache cleared (macOS)"
    fi
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    CHROME_CACHE="$HOME/.cache/google-chrome"
    if [ -d "$CHROME_CACHE" ]; then
        rm -rf "$CHROME_CACHE"/* 2>/dev/null
        echo "   ✓ Chrome cache cleared (Linux)"
    fi
fi

# Step 3: Clear Firefox cache (if exists)
echo ""
echo "[3/5] Clearing Firefox cache..."
if [[ "$OSTYPE" == "darwin"* ]]; then
    FF_CACHE="$HOME/Library/Caches/Firefox"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    FF_CACHE="$HOME/.cache/mozilla/firefox"
fi

if [ -d "$FF_CACHE" ]; then
    rm -rf "$FF_CACHE"/* 2>/dev/null
    echo "   ✓ Firefox cache cleared"
else
    echo "   ✓ Firefox cache not found (skipped)"
fi

# Step 4: Clear project build artifacts
echo ""
echo "[4/5] Clearing project build artifacts..."
ARTIFACT_PATHS=(
    "./frontend/user-portal/node_modules/.vite"
    "./frontend/user-portal/dist"
    "./node_modules/.cache"
)

for path in "${ARTIFACT_PATHS[@]}"; do
    if [ -d "$path" ]; then
        rm -rf "$path" 2>/dev/null
        echo "   ✓ Cleared: $path"
    fi
done

# Step 5: Restart Vite dev server
echo ""
echo "[5/5] Restarting Vite dev server..."
echo "   Starting server on http://localhost:5173..."

cd frontend/user-portal
npm run dev &

sleep 2

echo "   ✓ Vite server starting (PID: $!)"

echo ""
echo "=== Cache Clearing Complete ==="
echo ""
echo "Next Steps:"
echo "1. Wait for Vite server to start (check above output)"
echo "2. Open browser in INCOGNITO/PRIVATE mode: http://localhost:5173"
echo "3. Or clear browser data manually (Ctrl+Shift+Delete)"
echo ""
echo "For instant cache clearing during development:"
echo "- Visit: http://localhost:5173/debug/clear-cache"
echo ""
