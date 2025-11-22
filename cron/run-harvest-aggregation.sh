#!/bin/bash
#
# Daily Harvest Aggregation Script
#
# This script runs at 11 PM every day to aggregate all daily harvest tasks
# and generate next day's tasks for blocks still in HARVESTING state.
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

log "=== Starting Daily Harvest Aggregation ==="

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

# Step 2: Run daily aggregation
log "Running daily harvest aggregation..."
AGGREGATION_RESPONSE=$(curl -s -X POST \
    "http://${API_HOST}/api/v1/farm/tasks/admin/run-daily-aggregation" \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    -H "Content-Type: application/json")

# Check if aggregation was successful
if echo "$AGGREGATION_RESPONSE" | grep -q '"success":true'; then
    log "✅ Aggregation completed successfully"
    log "Response: $AGGREGATION_RESPONSE"
else
    log "⚠️ Aggregation may have issues"
    log "Response: $AGGREGATION_RESPONSE"
fi

log "=== Daily Harvest Aggregation Complete ==="
exit 0
