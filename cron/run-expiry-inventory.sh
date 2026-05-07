#!/bin/bash
#
# Daily Expiry Inventory Script
#
# This script runs at 02:00 UTC every day to auto-move expired sellable stock
# from inventory_harvest into inventory_waste with sourceType=expired.
#

set -e  # Exit on error

# Configuration
API_HOST="${API_HOST:-api:8000}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@a64platform.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-SuperAdmin123!}"

# Logging
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1"
}

log "=== Starting Daily Expiry Inventory Processing ==="

# Step 1: Login and get access token
log "Logging in as admin..."
LOGIN_RESPONSE=$(curl -s -X POST \
    "http://${API_HOST}/api/v1/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASSWORD}\"}")

# Extract access token
ACCESS_TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

if [ -z "$ACCESS_TOKEN" ]; then
    log "ERROR: Failed to obtain access token"
    log "Response: $LOGIN_RESPONSE"
    exit 1
fi

log "Successfully obtained access token"

# Step 2: Run expiry processing
log "Running expired inventory processing..."
EXPIRY_RESPONSE=$(curl -s -X POST \
    "http://${API_HOST}/api/v1/farm/inventory/admin/process-expired" \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    -H "Content-Type: application/json")

# Check if processing was successful
if echo "$EXPIRY_RESPONSE" | grep -q '"success":true'; then
    log "Expiry processing completed successfully"
    log "Response: $EXPIRY_RESPONSE"
else
    log "WARNING: Expiry processing may have issues"
    log "Response: $EXPIRY_RESPONSE"
fi

log "=== Daily Expiry Inventory Processing Complete ==="
exit 0
