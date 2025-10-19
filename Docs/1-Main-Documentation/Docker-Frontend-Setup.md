# Docker Frontend Setup

## Overview

The A64Core frontend is fully containerized and integrated with the existing Docker infrastructure. This provides:

- **Centralized Management**: All services (API, databases, frontend) in one Docker Compose stack
- **Environment Parity**: Development and production environments use identical configurations
- **Hot-Reload Development**: Full Vite HMR support in development mode
- **Optimized Production**: Multi-stage builds with Nginx serving static assets
- **Centralized Logging**: All frontend logs integrated with the existing logging system

## Architecture

### Development Mode

```
User Browser ’ Nginx (Port 80) ’ User Portal (Vite Dev Server, Port 5173)
                  “
              API (Port 8000) ’ MongoDB, MySQL, Redis
```

- **Vite Dev Server**: Runs in Docker with hot module replacement (HMR)
- **Volume Mounts**: Source code is mounted for instant code updates
- **WebSocket Support**: Nginx proxies HMR WebSocket connections

### Production Mode

```
User Browser ’ Nginx (Port 80) ’ User Portal (Nginx Static, Port 80)
                  “
              API (Port 8000) ’ MongoDB, MySQL, Redis
```

- **Static Build**: Production builds are compiled and served by Nginx
- **Optimized Assets**: Gzip compression, caching headers, minified bundles
- **No Source Code**: Only built dist/ files are included in container

## Docker Configuration

### Multi-Stage Dockerfile

**Location**: `frontend/user-portal/Dockerfile`

```dockerfile
# Stage 1: base - Install dependencies
# Stage 2: development - Vite dev server with hot-reload
# Stage 3: build - Production build
# Stage 4: production - Nginx serve static files
```

**Stages**:
1. **Base**: Installs all npm dependencies for shared library and user-portal
2. **Development**: Runs Vite dev server on port 5173 with --host 0.0.0.0
3. **Build**: Builds shared library first, then user-portal
4. **Production**: Serves built files with Nginx on port 80

### Docker Compose Services

#### Development (docker-compose.yml)

```yaml
user-portal:
  container_name: a64core-user-portal-dev
  build:
    context: .
    dockerfile: frontend/user-portal/Dockerfile
    target: development  # Use development stage
  ports:
    - "5173:5173"  # Vite dev server
  volumes:
    - ./frontend/shared:/app/shared  # Hot-reload
    - ./frontend/user-portal/src:/app/user-portal/src  # Hot-reload
    # Exclude node_modules (use container's)
    - /app/node_modules
```

**Features**:
- Volume mounts for instant code changes
- Vite HMR via WebSocket through Nginx
- Shared library changes trigger rebuilds
- Container's node_modules used (cross-platform compatibility)

#### Production (docker-compose.prod.yml)

```yaml
user-portal:
  build:
    target: production  # Use production stage
  ports:
    - "8081:80"  # Nginx static server
  volumes: []  # No volumes (use built files)
```

**Features**:
- Optimized production build
- Static file serving with Nginx
- Gzip compression enabled
- Cache headers for assets

## Nginx Configuration

### Main Proxy (nginx/nginx.conf)

**Upstream Configuration**:
```nginx
upstream user_portal_backend {
    server user-portal:5173;  # Dev: Vite, Prod: Nginx
}
```

**Routing**:
```nginx
location / {
    proxy_pass http://user_portal_backend;

    # Vite HMR WebSocket support
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}

location /api/ {
    proxy_pass http://api_backend;  # API routes
}
```

**Route Priority** (highest to lowest):
1. `/api/*` ’ FastAPI Backend
2. `/admin/*` ’ FastAPI Admin Interface
3. `/ws/*` ’ WebSocket connections
4. `/modules/*` ’ Dynamic module routes
5. `/*` ’ User Portal (React SPA)

### User Portal Nginx (frontend/user-portal/nginx.conf)

Production-only Nginx configuration:

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|svg|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

## Running the Frontend

### Development Mode

**Start all services** (API + Databases + Frontend):
```bash
docker-compose up -d
```

**Start only frontend**:
```bash
docker-compose up -d user-portal
```

**View logs**:
```bash
docker-compose logs -f user-portal
```

**Rebuild after dependency changes**:
```bash
docker-compose up -d --build user-portal
```

**Access**:
- User Portal: http://localhost (via Nginx proxy)
- Direct Access: http://localhost:5173 (bypass Nginx)
- API: http://localhost/api

### Production Mode

**Build and start**:
```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

**Access**:
- User Portal: http://localhost (via Nginx proxy on port 80)

## Hot-Reload Development

### How It Works

1. **Volume Mounts**: Source code directories are mounted into container
2. **Vite Watch**: Vite watches for file changes inside container
3. **HMR WebSocket**: Nginx proxies WebSocket connections for HMR
4. **Instant Updates**: Changes appear in browser without page reload

### Supported Hot-Reload

 **Hot-Reload Enabled**:
- `frontend/user-portal/src/**/*` - User portal source code
- `frontend/shared/src/**/*` - Shared library source code
- `frontend/user-portal/index.html` - HTML template
- `frontend/user-portal/vite.config.ts` - Vite configuration

L **Requires Rebuild**:
- `frontend/user-portal/package.json` - Dependency changes
- `frontend/shared/package.json` - Shared library dependencies
- `frontend/user-portal/Dockerfile` - Docker configuration changes

### Testing Hot-Reload

1. Start dev environment:
   ```bash
   docker-compose up -d user-portal
   ```

2. Open http://localhost in browser

3. Edit `frontend/user-portal/src/App.tsx`:
   ```tsx
   <h1>CCM Dashboard - LIVE EDIT TEST</h1>
   ```

4. Save file ’ Browser updates instantly 

## Environment Variables

### Development (.env or docker-compose.yml)

```env
NODE_ENV=development
VITE_API_URL=http://localhost/api
```

### Production (.env.production or docker-compose.prod.yml)

```env
NODE_ENV=production
VITE_API_URL=https://your-domain.com/api
```

**Note**: Vite requires `VITE_` prefix for environment variables accessible in browser code.

## Build Optimization

### Production Build Process

1. **Dependency Installation**: npm install (lockfile ensures consistency)
2. **Shared Library Build**: Compiles TypeScript, bundles with Vite
3. **User Portal Build**:
   - Compiles TypeScript
   - Bundles with Vite (tree-shaking, minification)
   - Generates source maps
   - Optimizes assets
4. **Static File Copy**: Moves dist/ to Nginx html directory

### Bundle Size

Expected production bundle sizes:
- **Vendor chunk** (React, styled-components, etc.): ~150KB gzipped
- **App chunk** (Application code): ~50KB gzipped
- **Shared library**: ~30KB gzipped
- **Total Initial Load**: ~230KB gzipped

## Logging

### Development Logs

View real-time logs:
```bash
docker-compose logs -f user-portal
```

Sample output:
```
user-portal | VITE v7.1.10 ready in 304 ms
user-portal | œ  Local:   http://localhost:5173/
user-portal | œ  Network: http://10.5.0.2:5173/
```

### Production Logs

Nginx access and error logs:
```bash
# Access logs
docker exec a64core-user-portal-dev cat /var/log/nginx/access.log

# Error logs
docker exec a64core-user-portal-dev cat /var/log/nginx/error.log
```

### Centralized Logging

All frontend containers use JSON file logging driver:
```yaml
logging:
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "3"
```

Logs are stored in Docker's logging directory and can be exported to external log aggregation systems (ELK, Grafana Loki, etc.).

## Troubleshooting

### Hot-Reload Not Working

**Symptom**: Code changes don't appear in browser

**Solutions**:
1. Check Nginx WebSocket proxy is configured:
   ```nginx
   proxy_http_version 1.1;
   proxy_set_header Upgrade $http_upgrade;
   proxy_set_header Connection "upgrade";
   ```

2. Verify volumes are mounted:
   ```bash
   docker inspect a64core-user-portal-dev | grep Mounts -A 20
   ```

3. Check Vite is running in container:
   ```bash
   docker-compose logs user-portal
   ```

### Build Failures

**Symptom**: Docker build fails with TypeScript errors

**Solutions**:
1. Rebuild shared library first:
   ```bash
   npm run build:shared
   ```

2. Check styled-components types:
   ```bash
   # Verify styled.d.ts exists
   ls frontend/shared/src/styled.d.ts
   ```

3. Clear Docker build cache:
   ```bash
   docker-compose build --no-cache user-portal
   ```

### Port Conflicts

**Symptom**: `Port 5173 is already in use`

**Solutions**:
1. Stop local Vite dev server
2. Kill process using port:
   ```bash
   # Windows
   netstat -ano | findstr :5173
   taskkill //PID <PID> //F

   # Linux/Mac
   lsof -ti:5173 | xargs kill
   ```

### Connection Refused

**Symptom**: Browser shows "ERR_CONNECTION_REFUSED"

**Solutions**:
1. Check container is running:
   ```bash
   docker-compose ps
   ```

2. Check Nginx upstream:
   ```bash
   docker exec a64core-nginx-dev cat /etc/nginx/nginx.conf | grep user_portal
   ```

3. Verify network connectivity:
   ```bash
   docker exec a64core-nginx-dev wget -O- http://user-portal:5173
   ```

## Performance Optimization

### Development

- **Volume Performance**: Use Docker Desktop's "Use file sharing implementation: VirtioFS" for faster file I/O (macOS/Windows)
- **Node Modules**: Exclude from volumes to avoid cross-platform issues
- **HMR**: Only mount necessary directories (src/, not entire project)

### Production

- **Multi-Stage Builds**: Reduces final image size by 80%
- **Nginx Gzip**: Compresses responses (30-70% size reduction)
- **Asset Caching**: 1-year cache for immutable assets
- **CDN**: Consider CDN for static assets in production

## Security

### Development

- **Exposed Ports**: Only expose necessary ports (5173 for debugging)
- **Source Code**: Mounted volumes contain source code (acceptable in dev)
- **Nginx Proxy**: Always access through Nginx to test routing

### Production

- **No Source Code**: Only built dist/ files in container
- **Security Headers**: Nginx adds X-Content-Type-Options, X-Frame-Options, etc.
- **HTTPS**: Use Nginx SSL termination (add SSL certificates to nginx/ssl/)
- **Rate Limiting**: Consider adding rate limiting to Nginx

## Future Enhancements

### Planned

1. **Admin Portal**: Separate containerized admin frontend
2. **Module Frontends**: Dynamic loading of module-specific UI components
3. **Service Worker**: PWA support for offline functionality
4. **CI/CD**: Automated builds and deployments
5. **Multi-Environment**: Staging, QA, Production configurations

### Under Consideration

- **Kubernetes**: Migrate to K8s for production scalability
- **Server-Side Rendering**: Next.js for improved SEO
- **Micro-Frontends**: Module federation for independent deployments

## Commands Reference

### Development Commands

```bash
# Start all services
docker-compose up -d

# Start only frontend
docker-compose up -d user-portal

# View logs
docker-compose logs -f user-portal

# Rebuild
docker-compose up -d --build user-portal

# Stop
docker-compose stop user-portal

# Remove container
docker-compose down user-portal

# Shell into container
docker exec -it a64core-user-portal-dev sh

# View files in container
docker exec a64core-user-portal-dev ls -la /app/user-portal/src
```

### Production Commands

```bash
# Build and start
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# View production logs
docker-compose -f docker-compose.yml -f docker-compose.prod.yml logs -f user-portal

# Stop production
docker-compose -f docker-compose.yml -f docker-compose.prod.yml down
```

### Cleanup Commands

```bash
# Remove all containers
docker-compose down

# Remove containers and volumes
docker-compose down -v

# Remove images
docker-compose down --rmi all

# Prune unused Docker resources
docker system prune -a
```

## Related Documentation

- [Frontend Implementation Plan](./Frontend-Implementation-Plan.md) - Complete frontend roadmap
- [CCM Architecture](./CCM-Architecture.md) - Dashboard architecture
- [System Architecture](./System-Architecture.md) - Overall system design
- [API Structure](./API-Structure.md) - API endpoints and integration
