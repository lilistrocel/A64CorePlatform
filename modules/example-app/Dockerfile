# Example Module Dockerfile
# This creates a simple web server module for testing

FROM nginx:1.25-alpine

# Module metadata (optional but helpful)
LABEL maintainer="A64 Platform"
LABEL module.name="example-app"
LABEL module.version="1.0.0"
LABEL module.description="Simple example web application module"

# Security profile labels (IMPORTANT for automated security configuration)
# Options: "strict" (UID 1000, no caps), "relaxed" (root, full caps), or use specific labels below
LABEL a64core.security.profile="relaxed"
LABEL a64core.security.requires-root="true"
LABEL a64core.security.reason="NGINX needs root for port binding and cache directory creation"

# Alternative: Declare UID 1000 compatibility for strict security
# LABEL a64core.security.uid1000-ready="true"
# This tells the platform your module works with UID 1000 (non-root user)

# Copy custom configuration
COPY index.html /usr/share/nginx/html/index.html
COPY nginx.conf /etc/nginx/conf.d/default.conf

# NOTE: This module runs as root (relaxed security profile)
# For production modules, build for UID 1000 compatibility:
# 1. Pre-create all required directories during build
# 2. Set ownership to UID 1000
# 3. Use LABEL a64core.security.uid1000-ready="true"

# Expose port (module will listen here)
EXPOSE 8080

# Health check (optional but recommended)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:8080/health || exit 1

# Run nginx
CMD ["nginx", "-g", "daemon off;"]
