# Module Security Guide

## Automated Security Configuration

The A64 Core Platform automatically configures container security based on your module's requirements. This guide explains how to declare your module's security needs for automated, safe deployment.

---

## Security Profiles

The platform supports three security profiles:

### 1. **Strict** (Production-Ready, Recommended)
- **User:** UID 1000 (non-root)
- **Capabilities:** All dropped (cap_drop: ALL)
- **Root Filesystem:** Writable (most apps need /tmp)
- **Best For:** Production modules, new modules, security-conscious deployments

### 2. **Relaxed** (Development/Legacy)
- **User:** root
- **Capabilities:** Not restricted
- **Root Filesystem:** Writable
- **Best For:** Legacy modules, NGINX-based apps, development/testing

### 3. **Auto** (Default)
- **Detection:** Automatically chooses profile based on:
  - Image labels (recommended)
  - Environment (`ENVIRONMENT=development` → relaxed, `ENVIRONMENT=production` → strict)
- **Best For:** When you want automatic, environment-aware configuration

---

## How to Declare Security Requirements

### Method 1: Use Image Labels (Recommended)

Add labels to your Dockerfile to declare security requirements:

```dockerfile
FROM nginx:1.25-alpine

# Module metadata
LABEL maintainer="Your Company"
LABEL module.name="your-module"
LABEL module.version="1.0.0"

# Security profile declaration (choose one approach)

# Option A: Direct profile declaration
LABEL a64core.security.profile="relaxed"
LABEL a64core.security.requires-root="true"
LABEL a64core.security.reason="NGINX needs root for port binding"

# Option B: Declare UID 1000 compatibility (for strict profile)
# LABEL a64core.security.uid1000-ready="true"
# LABEL a64core.security.reason="Module pre-creates directories with UID 1000 ownership"

# Your application code
COPY . /app
```

### Method 2: Specify in Installation Request

Pass `security_profile` when installing the module:

```json
{
  "module_name": "your-module",
  "docker_image": "localhost:5000/your-module:1.0.0",
  "security_profile": "relaxed",
  ...
}
```

**Priority:** Explicit `security_profile` in request > Image labels > Auto-detection

---

## Building UID 1000 Compatible Modules (Strict Profile)

To build production-ready modules that work with the strict security profile:

### 1. Pre-create Required Directories

```dockerfile
FROM python:3.11-slim

# Create directories and set ownership to UID 1000
RUN mkdir -p /app/data /app/logs /tmp/app && \
    chown -R 1000:1000 /app /tmp/app && \
    chmod -R 755 /app

# Switch to non-root user
USER 1000:1000

# Copy application
COPY --chown=1000:1000 . /app

# Declare UID 1000 compatibility
LABEL a64core.security.uid1000-ready="true"
LABEL a64core.security.profile="strict"
```

### 2. Handle File Permissions

- Use `/tmp` for writable files (always writable)
- Pre-create app directories during build
- Set ownership to UID 1000
- Avoid writing to system directories

### 3. Don't Bind to Privileged Ports

- Use ports > 1024 (e.g., 8080, 8000, 3000)
- Ports < 1024 require root (use relaxed profile or reverse proxy)

---

## NGINX/Web Server Modules

NGINX and similar web servers often need root for:
- Creating cache directories (`/var/cache/nginx`)
- Writing PID files (`/var/run/nginx.pid`)
- Binding to port 80/443

### Option 1: Use Relaxed Profile (Simplest)

```dockerfile
FROM nginx:1.25-alpine

# Declare root requirement
LABEL a64core.security.profile="relaxed"
LABEL a64core.security.requires-root="true"
LABEL a64core.security.reason="NGINX needs root for cache and port binding"

COPY nginx.conf /etc/nginx/nginx.conf
EXPOSE 8080
```

### Option 2: Build for UID 1000 (More Secure)

```dockerfile
FROM nginx:1.25-alpine

# Pre-create cache directories
RUN mkdir -p /var/cache/nginx/client_temp \
             /var/cache/nginx/proxy_temp \
             /tmp/nginx && \
    chown -R 1000:1000 /var/cache/nginx /tmp/nginx && \
    chmod -R 755 /var/cache/nginx

# Configure NGINX to use non-privileged port and /tmp for PID
COPY nginx.conf /etc/nginx/nginx.conf
RUN sed -i 's|/var/run/nginx.pid|/tmp/nginx/nginx.pid|g' /etc/nginx/nginx.conf

# Switch to non-root user
USER 1000:1000

# Declare UID 1000 compatibility
LABEL a64core.security.uid1000-ready="true"
LABEL a64core.security.profile="strict"

EXPOSE 8080
```

---

## Security Profile Detection Flow

```
1. Check installation request for explicit security_profile
   ├─ If "strict" or "relaxed" → Use that profile
   └─ If "auto" or not specified → Continue to step 2

2. Check Docker image labels
   ├─ a64core.security.profile="strict" → Use strict
   ├─ a64core.security.profile="relaxed" → Use relaxed
   ├─ a64core.security.uid1000-ready="true" → Use strict
   ├─ a64core.security.requires-root="true" → Use relaxed
   └─ No labels found → Continue to step 3

3. Auto-detection based on environment
   ├─ ENVIRONMENT=development → Use relaxed
   └─ ENVIRONMENT=production → Use strict
```

---

## Testing Your Module

### Test with Strict Profile (Recommended)

```bash
# Set explicit strict profile
curl -X POST http://localhost/api/v1/modules/install \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "module_name": "test-module",
    "docker_image": "localhost:5000/test-module:1.0.0",
    "security_profile": "strict",
    ...
  }'

# Check if container runs successfully
docker logs a64core-test-module
```

### Test with Relaxed Profile

```bash
# Set explicit relaxed profile
curl -X POST http://localhost/api/v1/modules/install \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "module_name": "test-module",
    "docker_image": "localhost:5000/test-module:1.0.0",
    "security_profile": "relaxed",
    ...
  }'
```

---

## Common Security Errors and Solutions

### Error: Permission Denied (mkdir, open, write)

**Cause:** Running as UID 1000 (strict profile) but directories not writable

**Solutions:**
1. Pre-create directories in Dockerfile with `chown 1000:1000`
2. Use `/tmp` for temporary files
3. OR use relaxed profile if module genuinely needs root

### Error: Container Exits Immediately

**Cause:** Application crashes due to permission issues

**Solutions:**
1. Check container logs: `docker logs a64core-your-module`
2. Verify file permissions in image
3. Test locally with `docker run --user 1000:1000 your-image`

### Error: Cannot Bind to Port 80

**Cause:** Ports < 1024 require root privileges

**Solutions:**
1. Use port > 1024 (e.g., 8080) and rely on reverse proxy
2. OR use relaxed profile if you must bind to privileged ports

---

## Security Best Practices

### DO ✅
- Declare security requirements with image labels
- Test with strict profile first
- Pre-create directories with proper ownership (UID 1000)
- Use ports > 1024
- Provide `a64core.security.reason` label explaining why root is needed

### DON'T ❌
- Assume you have root access
- Write to system directories without pre-creating them
- Bind to privileged ports (< 1024) without declaring root requirement
- Leave security profile as "auto" without image labels (unpredictable)

---

## Example Dockerfiles

### Python Web Application (Strict Profile)

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Create app directories with UID 1000 ownership
RUN mkdir -p /app/data /app/logs && \
    chown -R 1000:1000 /app && \
    chmod -R 755 /app

# Copy application
COPY --chown=1000:1000 . .

# Switch to non-root user
USER 1000:1000

# Security labels
LABEL a64core.security.uid1000-ready="true"
LABEL a64core.security.profile="strict"
LABEL a64core.security.reason="Application pre-creates directories with UID 1000"

EXPOSE 8000
CMD ["python", "app.py"]
```

### Node.js Application (Strict Profile)

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --production

# Create app directories
RUN mkdir -p /app/uploads /app/logs && \
    chown -R 1000:1000 /app && \
    chmod -R 755 /app

# Copy application
COPY --chown=1000:1000 . .

# Switch to non-root user
USER 1000:1000

# Security labels
LABEL a64core.security.uid1000-ready="true"
LABEL a64core.security.profile="strict"

EXPOSE 3000
CMD ["node", "server.js"]
```

### Legacy Application (Relaxed Profile)

```dockerfile
FROM legacy-base:latest

# Application setup
COPY . /app
WORKDIR /app

# Security labels - declare root requirement
LABEL a64core.security.profile="relaxed"
LABEL a64core.security.requires-root="true"
LABEL a64core.security.reason="Legacy application requires root for system-level operations"

EXPOSE 8080
CMD ["/app/start.sh"]
```

---

## API Documentation

### Security Profile Field

When installing a module, you can specify the security profile:

```json
{
  "module_name": "string",
  "docker_image": "string",
  "security_profile": "strict" | "relaxed" | "auto",  // Optional, default: "auto"
  ...
}
```

### Response

The installed module response includes the applied security profile in container labels:

```json
{
  "container_id": "abc123...",
  "container_name": "a64core-your-module",
  "labels": {
    "a64core.security.profile": "relaxed"
  },
  ...
}
```

---

## Migration Guide: From Manual to Automated Security

### Current State (Manual)
- All containers run with hardcoded security settings
- Developers must modify platform code to change security

### New State (Automated)
- Security automatically configured based on module requirements
- Developers declare requirements in Dockerfile labels

### Migration Steps

1. **Audit existing modules** - Check which require root
2. **Add labels to Dockerfiles** - Declare security requirements
3. **Rebuild images** - Push updated images to registry
4. **Test installations** - Verify containers start correctly
5. **Update documentation** - Guide users on security declarations

---

## Troubleshooting

### How to Check Current Security Profile

```bash
# Check container user
docker inspect a64core-your-module --format '{{.Config.User}}'
# Output: "1000:1000" (strict) or empty (relaxed, running as root)

# Check security labels
docker inspect a64core-your-module --format '{{.Config.Labels}}'
# Look for "a64core.security.profile": "strict" or "relaxed"

# Check capabilities
docker inspect a64core-your-module --format '{{.HostConfig.CapDrop}}'
# Output: [ALL] (strict) or [] (relaxed)
```

### Enable Debug Logging

Check API logs for security profile detection:

```bash
docker logs a64core-api-dev | grep "security profile"
```

You should see:
```
INFO - Detected security profile from image labels: relaxed
INFO - Applying security profile: relaxed
INFO - Applying RELAXED security profile (development/legacy modules)
INFO -   - Running as root (for legacy compatibility)
```

---

## Summary

The A64 Core Platform's automated security configuration:
- **Automatically detects** module security requirements from Docker image labels
- **Applies appropriate security** (strict for UID 1000 compatible, relaxed for legacy)
- **Requires no user intervention** - fully automated during installation
- **Provides safe defaults** - development = relaxed, production = strict
- **Fully configurable** - override with explicit `security_profile` parameter

**Recommendation:** Build new modules for UID 1000 compatibility (strict profile) for maximum security. Use relaxed profile only when absolutely necessary.
