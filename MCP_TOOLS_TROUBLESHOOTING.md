# MCP Tools Troubleshooting & Setup Guide

**Date:** 2025-11-01
**Status:** Critical Issues Found
**Priority:** HIGH - Impacts all agent testing workflows

---

## Executive Summary

Testing of Playwright MCP and MongoDB MCP tools revealed:
- ✅ **Playwright MCP:** WORKING - Browser installation and navigation functional
- ❌ **MongoDB MCP:** BROKEN - Connection does not persist between tool calls

---

## Playwright MCP Status: ✅ WORKING

### Test Results

**Browser Installation:**
```
✅ mcp__MCP_DOCKER__browser_install - SUCCESS
   Browser installed and ready
```

**Navigation Test:**
```
✅ mcp__MCP_DOCKER__browser_navigate(https://example.com) - SUCCESS
   Page loaded: Example Domain
   Snapshot retrieved successfully
```

### Working Features
- ✅ Browser installation
- ✅ Page navigation
- ✅ Page snapshots
- ✅ Element interaction (expected to work)

### Configuration
- **No special configuration required**
- Works out of the box
- Browser runs in Docker container

### Usage for Agents
```
CORRECT Usage:
1. Navigate to page: mcp__MCP_DOCKER__browser_navigate(url)
2. Take snapshot: mcp__MCP_DOCKER__browser_snapshot()
3. Interact: mcp__MCP_DOCKER__browser_click(element, ref)
4. Verify: mcp__MCP_DOCKER__browser_console_messages()
```

---

## MongoDB MCP Status: ❌ CRITICAL ISSUE

### Problem Description

**Connection does NOT persist between tool calls:**

```
1. mcp__MCP_DOCKER__connect("mongodb://host.docker.internal:27017/a64core_db")
   → Returns: "Successfully connected to MongoDB"

2. mcp__MCP_DOCKER__list-collections(database="a64core_db")
   → ERROR: "The configured connection string is not valid"

3. Check debug resource:
   → "The user is not connected to a MongoDB cluster"
```

**Root Cause:**
The MongoDB MCP server does not maintain connection state between tool invocations. Each tool call appears to start with a fresh state.

### Attempted Fixes

**Connection Strings Tested:**
- ❌ `mongodb://localhost:27017` - Connection refused (MCP in Docker)
- ❌ `mongodb://localhost:27017/a64core_db` - Connection refused
- ❌ `mongodb://mongodb:27017/a64core_db` - Invalid (not resolvable from MCP container)
- ✅ `mongodb://host.docker.internal:27017/a64core_db` - Connects but doesn't persist

**Verification from Host:**
```bash
✅ mongosh --eval "db.runCommand('ping')" mongodb://localhost:27017/a64core_db
   { ok: 1 }

✅ mongosh --eval "db.runCommand({connectionStatus: 1})" mongodb://localhost:27017/a64core_db
   { authInfo: { ... }, ok: 1 }
```

MongoDB is accessible from host on `localhost:27017`, but MCP server needs `host.docker.internal:27017` from Docker.

### Current Workaround: USE MONGOSH

**Since MongoDB MCP is broken, agents MUST use mongosh via Bash:**

```bash
# List collections
mongosh --eval "db.getCollectionNames()" mongodb://localhost:27017/a64core_db --quiet

# Find documents
mongosh --eval "db.plant_data.find().limit(2).toArray()" mongodb://localhost:27017/a64core_db --quiet

# Count documents
mongosh --eval "db.plant_data.countDocuments()" mongodb://localhost:27017/a64core_db --quiet

# Insert document
mongosh --eval 'db.collection.insertOne({...})' mongodb://localhost:27017/a64core_db --quiet

# Update document
mongosh --eval 'db.collection.updateOne({filter}, {$set: {...}})' mongodb://localhost:27017/a64core_db --quiet
```

---

## Recommended Solution: Configure MCP Server

### Issue
The `connect` tool is likely meant for switching databases, not establishing initial connection. The MCP server should be configured with a persistent connection string.

### Where to Configure
The MCP server needs configuration in Claude Code settings (not yet implemented).

**Expected Configuration Location:**
```
~/.config/claude-code/mcp-servers.json
OR
Project/.claude/mcp-config.json
```

**Expected Configuration Format:**
```json
{
  "mongodb": {
    "command": "mongodb-mcp-server",
    "args": [],
    "env": {
      "MONGODB_CONNECTION_STRING": "mongodb://host.docker.internal:27017/a64core_db"
    }
  }
}
```

### Action Required
1. **Contact Claude Code Support** - Report MongoDB MCP connection persistence issue
2. **Document Configuration** - Once fixed, update agent rules with correct config
3. **Update Agent Rules** - Switch from mongosh workaround to MCP tools

---

## Updated Agent Instructions

### For ALL Agents (Temporary)

**Until MongoDB MCP is fixed, use this approach:**

### ✅ Frontend/API Testing - Use Playwright MCP
```
CORRECT:
✅ mcp__MCP_DOCKER__browser_navigate(http://localhost)
✅ mcp__MCP_DOCKER__browser_click(button)
✅ mcp__MCP_DOCKER__browser_snapshot()

WRONG:
❌ curl http://localhost/api/endpoint
❌ Manual browser testing
```

### ⚠️ Database Verification - Use MONGOSH (Temporary)
```
CORRECT (until MCP fixed):
✅ mongosh --eval "db.collection.find()" mongodb://localhost:27017/a64core_db --quiet

WRONG:
❌ mongo shell interactive mode
❌ pymongo with print statements
❌ mcp__MCP_DOCKER__find() [BROKEN - don't use]
```

---

## Testing Checklist for Agents

### Before Using MCP Tools

**Playwright MCP (WORKING):**
- [ ] Browser installed: `mcp__MCP_DOCKER__browser_install`
- [ ] Can navigate: `mcp__MCP_DOCKER__browser_navigate(url)`
- [ ] Can take snapshot: `mcp__MCP_DOCKER__browser_snapshot()`

**MongoDB MCP (BROKEN - Use mongosh instead):**
- [ ] Use mongosh for queries
- [ ] Use `--quiet` flag for clean output
- [ ] Always specify database in connection string

---

## Example: Complete Testing Workflow

### Testing Plant Data Add/Edit Feature

**1. Test API Endpoint with Playwright MCP:**
```
✅ mcp__MCP_DOCKER__browser_navigate("http://localhost:8001/docs")
✅ mcp__MCP_DOCKER__browser_click("POST /api/v1/farm/plant-data")
✅ mcp__MCP_DOCKER__browser_evaluate(fetch POST request)
✅ Check response status
```

**2. Verify Database with mongosh:**
```bash
✅ mongosh --eval "db.plant_data.find({plantName: 'Test Plant'}).toArray()" \
   mongodb://localhost:27017/a64core_db --quiet
```

**3. Verify Data Structure:**
```bash
✅ mongosh --eval "db.plant_data.findOne()" \
   mongodb://localhost:27017/a64core_db --quiet
```

---

## Issues to Report

### To Claude Code Team

**Issue #1: MongoDB MCP Connection Persistence**
- **Severity:** Critical
- **Impact:** Prevents database verification workflows
- **Description:** `mcp__MCP_DOCKER__connect()` succeeds but connection doesn't persist to next tool call
- **Workaround:** Use mongosh via Bash
- **Connection String:** `mongodb://host.docker.internal:27017/a64core_db`

**Issue #2: MCP Server Configuration**
- **Severity:** Medium
- **Impact:** Requires connection on every use
- **Description:** No clear way to configure persistent MongoDB connection string for MCP server
- **Expected:** Configuration file or environment variable
- **Requested:** Documentation on proper MCP server setup

---

## Status Updates

### 2025-11-01 - Initial Testing
- ✅ Playwright MCP: Fully functional
- ❌ MongoDB MCP: Connection persistence broken
- 📝 Workaround: Use mongosh via Bash
- 🎯 Next: Wait for MCP server fix or configuration guidance

### 2025-11-01 - User Configuration Testing (Updated)
- ✅ Identified correct connection string: `mongodb://localhost:27017/a64core_db`
- ✅ MongoDB running without authentication (development mode)
- ✅ Port 27017 exposed and accessible from host
- ✅ `mcp__MCP_DOCKER__connect()` succeeds with `mongodb://host.docker.internal:27017/a64core_db`
- ❌ Connection still doesn't persist - `list-databases()` fails immediately after `connect()`
- ⚠️ User sees "connected" in Claude Desktop UI, but functional state is lost
- 📝 **Confirmed:** This is a MCP server bug, not a configuration issue
- 🎯 **Recommendation:** Continue using mongosh workaround until MCP is fixed

---

## Quick Reference

### What Works
- ✅ Playwright MCP for frontend/API testing
- ✅ mongosh for database queries (via Bash)
- ✅ Docker containers running properly
- ✅ MongoDB accessible on localhost:27017

### What Doesn't Work
- ❌ MongoDB MCP tools (connection doesn't persist)
- ❌ Playwright MCP access to localhost (network isolation)
- ❌ MCP persistent configuration (not implemented yet)

### Temporary Rules for Agents
1. ✅ ALWAYS use Playwright MCP for browser testing
2. ⚠️ TEMPORARILY use mongosh (via Bash) for database verification
3. ❌ NEVER use curl for API testing (use Playwright MCP)
4. ❌ NEVER use mongo shell interactive or pymongo prints

---

**Next Steps:**
1. Update agent rules with mongosh workaround
2. Report MongoDB MCP issue to Claude Code team
3. Monitor for MCP server configuration documentation
4. Switch back to MongoDB MCP when fixed
