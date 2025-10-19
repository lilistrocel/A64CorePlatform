# Port Management & Reverse Proxy System

## Overview

The A64 Core Platform includes an **automatic port management and reverse proxy system** that simplifies module deployment and routing. The system automatically allocates external ports from a configurable range (default: 9000-19999), tracks allocations in MongoDB, and generates NGINX reverse proxy configurations for clean URL routing.

**Version:** 1.4.0
**Status:** Production Ready
**Last Updated:** 2025-10-19

---

## Key Features

### 1. Automatic Port Allocation
- **Port Range**: 9000-19999 (supports 10,000+ modules)
- **Auto-Detection**: Automatically finds next available port
- **Conflict Prevention**: MongoDB unique index prevents duplicate allocations
- **Database Tracking**: All allocations stored in `port_registry` collection
- **Cleanup on Uninstall**: Ports automatically released when module is uninstalled

### 2. Reverse Proxy Auto-Configuration
- **NGINX Integration**: Auto-generates NGINX location blocks for each module
- **Clean URLs**: Access modules via `/module-name/` instead of ports
- **WebSocket Support**: Built-in support for WebSocket connections
- **Security Headers**: Automatic security headers (X-Content-Type-Options, X-Frame-Options, etc.)
- **Health Checks**: Dedicated health check routes for monitoring

### 3. Docker Network Auto-Detection
- **Platform Network Detection**: Automatically detects the Docker network used by the platform
- **Cross-Container Communication**: Modules can communicate with each other via Docker DNS
- **No Manual Configuration**: Network setup is fully automated

---

## Architecture

### Components

```
┌─────────────────────────────────────────────────────────────────────┐
│                        A64 Core Platform API                         │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐        │
│  │ Port Manager   │  │ Proxy Manager  │  │ Module Manager │        │
│  │                │  │                │  │                │        │
│  │ - Allocate     │  │ - Generate     │  │ - Install      │        │
│  │ - Track        │  │ - Reload       │  │ - Uninstall    │        │
│  │ - Release      │  │ - Remove       │  │ - Monitor      │        │
│  └────────────────┘  └────────────────┘  └────────────────┘        │
└────────────────────────┬────────────────────────┬───────────────────┘
                         │                        │
                  ┌──────▼──────┐         ┌───────▼──────┐
                  │   MongoDB   │         │    NGINX     │
                  │             │         │              │
                  │ port_       │         │ /etc/nginx/  │
                  │ registry    │         │ conf.d/      │
                  └─────────────┘         │ modules/     │
                                          └──────────────┘
```

### Port Manager (`src/services/port_manager.py`)

Manages port allocation lifecycle:

**Key Methods:**
- `allocate_ports(module_name, internal_ports)` - Allocate external ports
- `release_ports(module_name)` - Free all ports for a module
- `get_module_ports(module_name)` - Get allocated ports
- `parse_ports_from_config(ports_config)` - Parse port configuration

**Port Range:**
- Start: 9000
- End: 19999
- Capacity: 10,000 modules
- Reserved: Configurable list (default: empty)

### Proxy Manager (`src/services/proxy_manager.py`)

Manages NGINX reverse proxy configuration:

**Key Methods:**
- `create_proxy_route(module_name, route_path, upstream_port)` - Create proxy config
- `remove_proxy_route(module_name)` - Remove proxy config
- `reload_nginx()` - Reload NGINX without downtime
- `generate_module_config()` - Generate NGINX location block

**Features:**
- Docker DNS resolver (127.0.0.11)
- Runtime DNS resolution using variables
- WebSocket support
- Security headers
- Automatic health check routes

### Module Manager (`src/services/module_manager.py`)

Orchestrates module installation with port and proxy setup:

**Installation Flow:**
1. Validate license and Docker image
2. Parse internal ports from configuration
3. **Allocate external ports** (via Port Manager)
4. **Generate proxy route** (via Port Manager)
5. Create database record with allocated ports
6. **Detect platform network** (auto)
7. Create Docker container with port mappings
8. Start container
9. **Create NGINX reverse proxy config** (via Proxy Manager)
10. Reload NGINX without downtime

---

## Database Schema

### Port Registry Collection (`port_registry`)

```javascript
{
  "_id": ObjectId("..."),
  "port": 9000,                               // External port number
  "module_name": "example-app",                // Module identifier
  "internal_port": 8080,                       // Container internal port
  "allocated_at": ISODate("2025-10-19T..."),  // Allocation timestamp
  "status": "active"                           // Status: active | released
}
```

**Indexes:**
- `port`: Unique (prevents duplicate allocations)
- `module_name, status`: Compound (query by module)

### Module Collection (`installed_modules`)

```javascript
{
  "module_name": "example-app",
  "allocated_ports": {
    "8080": 9000  // {internal_port: external_port}
  },
  "proxy_route": "/example-app",
  // ... other module fields
}
```

---

## Usage Examples

### Example 1: Install Module with Auto Port Allocation

```json
{
  "module_name": "analytics-dashboard",
  "docker_image": "localhost:5000/analytics:1.0.0",
  "ports": ["8080:8080"],
  "version": "1.0.0",
  "license_key": "TEST-..."
}
```

**Result:**
- Port 9000 allocated (first available)
- Container created with port mapping: 9000 → 8080
- Proxy route created: `/analytics-dashboard/`
- NGINX config: `/etc/nginx/conf.d/modules/analytics-dashboard.conf`

**Access:**
- Direct: `http://localhost:9000`
- Reverse Proxy: `http://localhost/analytics-dashboard/`

### Example 2: Multi-Module Installation

```bash
# Install first module
POST /api/v1/modules/install
{
  "module_name": "example-app",
  "ports": ["9001:8080"]
}
# Result: Port 9000 allocated

# Install second module
POST /api/v1/modules/install
{
  "module_name": "example-app-2",
  "ports": ["9999:8080"]
}
# Result: Port 9001 allocated (next available, ignores 9999)
```

**Port Registry:**
```javascript
[
  { port: 9000, module_name: "example-app", internal_port: 8080 },
  { port: 9001, module_name: "example-app-2", internal_port: 8080 }
]
```

### Example 3: Check Allocated Ports

```javascript
// MongoDB query
db.port_registry.find({ status: "active" })

// API endpoint
GET /api/v1/modules/installed
```

---

## NGINX Configuration

### Generated Config Example

File: `/etc/nginx/conf.d/modules/example-app.conf`

```nginx
# Auto-generated reverse proxy configuration for example-app
# DO NOT EDIT MANUALLY - Managed by A64 Core Platform

# Main location block
location /example-app/ {
    # Use Docker's embedded DNS resolver
    resolver 127.0.0.11 valid=30s;

    # Set backend variable to enable DNS resolution at runtime
    set $backend a64core-example-app:8080;

    # Proxy to module container (trailing slash strips the location prefix)
    proxy_pass http://$backend/;
    proxy_http_version 1.1;

    # Host headers
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Port $server_port;

    # WebSocket support
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";

    # Timeouts
    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;

    # Buffering
    proxy_buffering on;
    proxy_buffer_size 4k;
    proxy_buffers 8 4k;
    proxy_busy_buffers_size 8k;

    # Security headers
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
}

# Health check endpoint
location /example-app/health {
    resolver 127.0.0.11 valid=30s;
    set $backend_health a64core-example-app:8080;
    proxy_pass http://$backend_health/health;
    proxy_http_version 1.1;
    access_log off;
}
```

### Shared Volume Setup

```yaml
# docker-compose.yml
volumes:
  nginx_modules_config:
    driver: local

services:
  api:
    volumes:
      - nginx_modules_config:/etc/nginx/conf.d/modules

  nginx:
    volumes:
      - nginx_modules_config:/etc/nginx/conf.d/modules
```

### Main NGINX Config

```nginx
# nginx/nginx.conf
http {
    # ... other config ...

    server {
        listen 80;
        server_name localhost;

        # Include module proxy configs
        include /etc/nginx/conf.d/modules/*.conf;
    }
}
```

---

## API Endpoints

### Port Management

**Get Port Statistics**
```http
GET /api/v1/admin/ports/stats
Authorization: Bearer {token}

Response:
{
  "total_allocated": 2,
  "total_available": 9998,
  "port_range": "9000-19999",
  "allocations": [
    {
      "module_name": "example-app",
      "port": 9000,
      "internal_port": 8080,
      "allocated_at": "2025-10-19T..."
    }
  ]
}
```

**Get Module Ports**
```http
GET /api/v1/modules/{module_name}/ports
Authorization: Bearer {token}

Response:
{
  "module_name": "example-app",
  "allocated_ports": {
    "8080": 9000
  }
}
```

---

## Configuration

### Port Range Configuration

**File:** `src/models/module.py`

```python
class PortRange(BaseModel):
    start_port: int = 9000
    end_port: int = 19999  # Supports 10,000+ modules
    reserved_ports: List[int] = []  # Add ports to exclude
```

**Example: Reserve Ports**
```python
PortRange(
    start_port=9000,
    end_port=19999,
    reserved_ports=[9100, 9200, 9300]  # Skip these ports
)
```

### Proxy Manager Configuration

**File:** `src/main.py`

```python
proxy_manager = ProxyManager(
    nginx_config_dir="/etc/nginx/conf.d",
    nginx_container_name="a64core-nginx-dev"
)
```

---

## Monitoring & Troubleshooting

### Check Port Allocations

```bash
# MongoDB
docker exec a64core-mongodb-dev mongosh a64core_db --eval "db.port_registry.find().pretty()"

# Check if port is in use
netstat -ano | findstr :9000  # Windows
lsof -i :9000                 # Linux/Mac
```

### Check NGINX Config

```bash
# List module configs
docker exec a64core-nginx-dev ls -la /etc/nginx/conf.d/modules/

# View specific config
docker exec a64core-nginx-dev cat /etc/nginx/conf.d/modules/example-app.conf

# Test NGINX config
docker exec a64core-nginx-dev nginx -t

# Reload NGINX
docker exec a64core-nginx-dev nginx -s reload
```

### Check Module Containers

```bash
# List module containers
docker ps | grep a64core-

# Check container network
docker inspect a64core-example-app --format '{{range $net,$v := .NetworkSettings.Networks}}{{$net}}{{end}}'

# Check port mappings
docker port a64core-example-app
```

### Common Issues

**Issue:** Port already in use
```
Solution: Check port_registry, release old allocations, or expand port range
```

**Issue:** 502 Bad Gateway on reverse proxy
```
Solution:
1. Check container is on correct Docker network
2. Verify NGINX can resolve container hostname
3. Check module is listening on internal port
```

**Issue:** Module installed but no port allocated
```
Solution: Ensure module config includes ports specification (e.g., "ports": ["9001:8080"])
```

---

## Performance Considerations

### Port Allocation Performance

- **Average allocation time**: < 50ms
- **Database lookups**: O(n) where n = allocated ports
- **Optimization**: Consider indexing strategy for 1000+ modules

### NGINX Reload Performance

- **Zero downtime**: Uses `nginx -s reload`
- **Config test**: Validates before applying
- **Rollback**: Automatic rollback on config error
- **Reload time**: < 100ms

### Scalability

- **Maximum modules**: 10,000 (with default range 9000-19999)
- **Expand range**: Increase `end_port` to 65535 for 56,000+ modules
- **Performance impact**: Minimal (port lookup is O(n))

---

## Security Considerations

### Port Access Control

1. **Firewall**: Only expose ports 80/443 externally
2. **Internal Ports**: Module ports (9000-19999) should be internal only
3. **Reverse Proxy**: Always use NGINX for external access
4. **Network Isolation**: Modules on isolated Docker network

### NGINX Security

1. **Headers**: Auto-added security headers
2. **Rate Limiting**: Can be added per module
3. **SSL/TLS**: Terminate at NGINX level
4. **Authentication**: Add auth_request directive if needed

### Port Registry Security

1. **Unique Constraint**: Prevents duplicate allocations
2. **Audit Trail**: Track allocation timestamps
3. **Status Tracking**: Mark ports as active/released
4. **Cleanup**: Automatic cleanup on uninstall

---

## Testing

### Test Port Allocation

```bash
# Install first module
python scripts/install-example-module.py

# Check allocation
curl http://localhost:9000/health  # Direct
curl http://localhost/example-app/health  # Reverse proxy

# Install second module
python scripts/install-example-module-2.py

# Verify sequential allocation
curl http://localhost:9001/health  # Should be 9001
curl http://localhost/example-app-2/health
```

### Test Port Cleanup

```bash
# Uninstall module
curl -X DELETE http://localhost/api/v1/modules/example-app

# Verify port released
docker exec a64core-mongodb-dev mongosh a64core_db --eval "db.port_registry.find()"
# Port should show status: "released"

# Verify NGINX config removed
docker exec a64core-nginx-dev ls /etc/nginx/conf.d/modules/
# example-app.conf should be gone
```

---

## Future Enhancements

### Planned Features (v1.5.0)

1. **Port Reservation API**: Reserve ports before module installation
2. **Port Pool Management**: Pre-allocate port pools for module families
3. **Custom Port Ranges**: Per-module port range configuration
4. **Port Usage Analytics**: Track port usage over time
5. **Automatic Port Expansion**: Auto-expand range when capacity reached
6. **Port Conflict Resolution**: Automatic resolution of port conflicts

### Potential Improvements

- **Load Balancing**: Multiple instances of same module on different ports
- **Port Recycling**: Reuse released ports after cooldown period
- **Health-Based Routing**: Route traffic based on module health
- **SSL/TLS Per Module**: Individual SSL certificates per module
- **Rate Limiting Per Module**: Custom rate limits per proxy route

---

## Version History

- **v1.4.0** (2025-10-19): Initial release of Port Management & Reverse Proxy System
  - Automatic port allocation (9000-19999 range)
  - MongoDB port tracking
  - NGINX reverse proxy auto-configuration
  - Docker network auto-detection
  - Shared volume for NGINX configs
  - Zero-downtime NGINX reload

---

## References

- [Module Management System](./Module-Management-System.md)
- [System Architecture](./System-Architecture.md)
- [Deployment Guide](../DEPLOYMENT.md)
- [NGINX Documentation](https://nginx.org/en/docs/)
- [Docker Networking](https://docs.docker.com/network/)
