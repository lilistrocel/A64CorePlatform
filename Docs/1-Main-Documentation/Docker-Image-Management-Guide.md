# Docker Image Management Guide

Complete guide for creating, testing, and hosting Docker images for the A64 Core Platform Module Management System.

---

## Table of Contents

1. [Understanding Docker Images](#understanding-docker-images)
2. [Option 1: Local Images (Development & Testing)](#option-1-local-images-development--testing)
3. [Option 2: Self-Hosted Registry (Private)](#option-2-self-hosted-registry-private)
4. [Option 3: Public Registries (Production)](#option-3-public-registries-production)
5. [Best Practices](#best-practices)
6. [Troubleshooting](#troubleshooting)

---

## Understanding Docker Images

### What is a Docker Image?

A Docker image is a **read-only template** that contains:
- Application code
- Runtime environment (Node.js, Python, etc.)
- System libraries and dependencies
- Configuration files
- Startup commands

### Image vs Container

- **Image**: The blueprint/template (like a class in programming)
- **Container**: A running instance of an image (like an object)

### Where Are Images Stored?

1. **Local Docker Cache**: On your machine (`docker images` to see them)
2. **Docker Registry**: Remote server hosting images (Docker Hub, GitHub, self-hosted)

---

## Option 1: Local Images (Development & Testing)

**Best for:** Initial development, testing, experimentation

### Advantages
- ✅ No internet required
- ✅ Fast build and deploy
- ✅ Free (no registry costs)
- ✅ Complete privacy

### Disadvantages
- ❌ Only available on the machine where it's built
- ❌ Can't share with team members easily
- ❌ Lost if you rebuild Docker cache

### Step-by-Step: Create a Local Module

#### 1. Create Module Directory Structure

```bash
modules/
└── your-module-name/
    ├── Dockerfile          # Image build instructions
    ├── src/                # Your application code
    ├── requirements.txt    # Dependencies (Python example)
    ├── package.json        # Dependencies (Node.js example)
    └── README.md           # Module documentation
```

#### 2. Write Your Dockerfile

**Example: Python Flask Application**

```dockerfile
# modules/my-flask-app/Dockerfile
FROM python:3.11-slim

WORKDIR /app

# Copy dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY src/ ./src/

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=3s \
  CMD curl -f http://localhost:5000/health || exit 1

# Run application
CMD ["python", "src/app.py"]
```

**Example: Node.js Express Application**

```dockerfile
# modules/my-node-app/Dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy dependencies
COPY package*.json ./
RUN npm install --production

# Copy application code
COPY src/ ./src/

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget --quiet --tries=1 --spider http://localhost:3000/health || exit 1

# Run application
CMD ["node", "src/server.js"]
```

#### 3. Build the Image Locally

```bash
# Navigate to module directory
cd modules/your-module-name

# Build with localhost tag (no registry needed)
docker build -t localhost/your-module-name:1.0.0 .

# Verify the image was created
docker images | grep your-module-name
```

**Output:**
```
REPOSITORY                  TAG       IMAGE ID       CREATED         SIZE
localhost/your-module-name  1.0.0     abc123def456   2 minutes ago   150MB
```

#### 4. Test the Image Manually (Before Using Module System)

```bash
# Run container manually for testing
docker run -d \
  --name test-my-module \
  -p 9000:5000 \
  localhost/your-module-name:1.0.0

# Test the application
curl http://localhost:9000
curl http://localhost:9000/health

# Check logs
docker logs test-my-module

# Check if it's running
docker ps | grep test-my-module

# Stop and remove test container
docker stop test-my-module
docker rm test-my-module
```

#### 5. Install via Module Management System

**Using curl:**

```bash
# Get access token
TOKEN="your-jwt-token-here"

# Install module
curl -X POST http://localhost/api/v1/modules/install \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "module_name": "my-flask-app",
    "display_name": "My Flask Application",
    "docker_image": "localhost/your-module-name:1.0.0",
    "version": "1.0.0",
    "license_key": "TEST-LICENSE-KEY-123",
    "ports": ["9001:5000"],
    "environment": {
      "APP_ENV": "production",
      "DEBUG": "false"
    },
    "description": "My custom Flask application module"
  }'
```

**Using Python:**

```python
import requests

token = "your-jwt-token-here"
headers = {
    "Authorization": f"Bearer {token}",
    "Content-Type": "application/json"
}

module_config = {
    "module_name": "my-flask-app",
    "display_name": "My Flask Application",
    "docker_image": "localhost/your-module-name:1.0.0",
    "version": "1.0.0",
    "license_key": "TEST-LICENSE-KEY-123",
    "ports": ["9001:5000"],
    "environment": {
        "APP_ENV": "production",
        "DEBUG": "false"
    },
    "description": "My custom Flask application module"
}

response = requests.post(
    "http://localhost/api/v1/modules/install",
    headers=headers,
    json=module_config
)

print(response.json())
```

#### 6. Managing Local Images

```bash
# List all local images
docker images

# Remove an image
docker rmi localhost/your-module-name:1.0.0

# Remove all unused images (cleanup)
docker image prune -a

# See image details
docker inspect localhost/your-module-name:1.0.0

# See image history (layers)
docker history localhost/your-module-name:1.0.0
```

---

## Option 2: Self-Hosted Registry (Private)

**Best for:** Team collaboration, private modules, on-premise deployments

### Advantages
- ✅ Full control over your images
- ✅ Private and secure
- ✅ No external dependencies
- ✅ Share images within your network/team
- ✅ No usage limits or costs

### Disadvantages
- ❌ Requires server setup and maintenance
- ❌ Need to manage security (SSL, authentication)
- ❌ Storage costs (disk space)

### Quick Setup: Docker Registry

#### 1. Run a Private Registry Container

```bash
# Create directories for registry data
mkdir -p registry/data
mkdir -p registry/auth

# Run registry on port 5000
docker run -d \
  --name my-docker-registry \
  --restart=always \
  -p 5000:5000 \
  -v $(pwd)/registry/data:/var/lib/registry \
  registry:2
```

#### 2. Configure A64 Platform to Trust Your Registry

Update `.env`:

```bash
# Add your registry to trusted registries
TRUSTED_REGISTRIES=registry.hub.docker.com,ghcr.io,docker.io,localhost:5000
```

#### 3. Tag and Push Images to Your Registry

```bash
# Build your image
docker build -t my-module:1.0.0 .

# Tag for your registry
docker tag my-module:1.0.0 localhost:5000/my-module:1.0.0

# Push to your registry
docker push localhost:5000/my-module:1.0.0

# Verify it's in the registry
curl http://localhost:5000/v2/_catalog
```

#### 4. Install Module from Your Registry

```json
{
  "module_name": "my-module",
  "display_name": "My Custom Module",
  "docker_image": "localhost:5000/my-module:1.0.0",
  "version": "1.0.0",
  "license_key": "YOUR-LICENSE-KEY",
  "ports": ["9002:8080"]
}
```

### Advanced: Registry with Authentication

#### 1. Generate Password File

```bash
# Install htpasswd (if not available)
# Windows: Download from Apache website
# Linux: apt-get install apache2-utils
# macOS: brew install httpd

# Create password file
htpasswd -Bbn admin yourpassword > registry/auth/htpasswd
```

#### 2. Run Registry with Authentication

```bash
docker run -d \
  --name secure-registry \
  --restart=always \
  -p 5000:5000 \
  -v $(pwd)/registry/data:/var/lib/registry \
  -v $(pwd)/registry/auth:/auth \
  -e "REGISTRY_AUTH=htpasswd" \
  -e "REGISTRY_AUTH_HTPASSWD_REALM=Registry Realm" \
  -e "REGISTRY_AUTH_HTPASSWD_PATH=/auth/htpasswd" \
  registry:2
```

#### 3. Login to Your Registry

```bash
# Login from any machine
docker login localhost:5000
# Username: admin
# Password: yourpassword

# Now you can push/pull
docker push localhost:5000/my-module:1.0.0
```

### Production Registry Setup (with SSL)

For production, use a proper domain and SSL certificate:

```bash
# Using docker-compose
# Create: registry/docker-compose.yml

version: '3.8'

services:
  registry:
    image: registry:2
    container_name: docker-registry
    restart: always
    ports:
      - "5000:5000"
    environment:
      REGISTRY_HTTP_TLS_CERTIFICATE: /certs/domain.crt
      REGISTRY_HTTP_TLS_KEY: /certs/domain.key
      REGISTRY_AUTH: htpasswd
      REGISTRY_AUTH_HTPASSWD_PATH: /auth/htpasswd
      REGISTRY_AUTH_HTPASSWD_REALM: Registry Realm
    volumes:
      - ./data:/var/lib/registry
      - ./certs:/certs
      - ./auth:/auth
```

---

## Option 3: Public Registries (Production)

**Best for:** Public modules, production deployments, sharing with community

### Popular Docker Registries

#### 1. Docker Hub (docker.io)

**Free tier:** Unlimited public repositories, 1 private repository

```bash
# Login to Docker Hub
docker login

# Tag your image
docker tag my-module:1.0.0 yourusername/my-module:1.0.0

# Push to Docker Hub
docker push yourusername/my-module:1.0.0

# Install via A64 Platform
{
  "docker_image": "docker.io/yourusername/my-module:1.0.0"
}
```

**Pricing:**
- Free: 1 private repo, unlimited public
- Pro ($5/month): Unlimited private repos
- Team ($7/user/month): Collaborative private repos

#### 2. GitHub Container Registry (ghcr.io)

**Free tier:** Unlimited public, 500MB private storage

```bash
# Login to GitHub Container Registry
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin

# Tag your image
docker tag my-module:1.0.0 ghcr.io/yourusername/my-module:1.0.0

# Push
docker push ghcr.io/yourusername/my-module:1.0.0

# Install via A64 Platform
{
  "docker_image": "ghcr.io/yourusername/my-module:1.0.0"
}
```

**Advantages:**
- Free unlimited public images
- 500MB free private storage
- Integrated with GitHub Actions (CI/CD)
- Good for open-source projects

#### 3. Google Container Registry (gcr.io)

**Free tier:** 0.5GB storage, then pay-as-you-go

```bash
# Setup Google Cloud SDK first
gcloud auth configure-docker

# Tag your image
docker tag my-module:1.0.0 gcr.io/your-project-id/my-module:1.0.0

# Push
docker push gcr.io/your-project-id/my-module:1.0.0
```

#### 4. AWS Elastic Container Registry (ECR)

**Pricing:** $0.10 per GB/month

```bash
# Login to ECR
aws ecr get-login-password --region region | docker login --username AWS --password-stdin aws_account_id.dkr.ecr.region.amazonaws.com

# Tag and push
docker tag my-module:1.0.0 aws_account_id.dkr.ecr.region.amazonaws.com/my-module:1.0.0
docker push aws_account_id.dkr.ecr.region.amazonaws.com/my-module:1.0.0
```

---

## Best Practices

### Image Naming Conventions

```
[registry-host]/[namespace]/[repository]:[tag]

Examples:
- localhost/my-app:1.0.0                    # Local image
- localhost:5000/my-company/my-app:1.0.0    # Self-hosted registry
- docker.io/username/my-app:1.0.0           # Docker Hub
- ghcr.io/username/my-app:1.0.0             # GitHub Container Registry
```

### Tagging Strategy

```bash
# NEVER use 'latest' (forbidden by A64 Platform security)
❌ docker build -t my-app:latest .

# ALWAYS use semantic versioning
✅ docker build -t my-app:1.0.0 .
✅ docker build -t my-app:1.2.3 .

# Can use multiple tags
docker tag my-app:1.0.0 my-app:1.0
docker tag my-app:1.0.0 my-app:1
```

### Optimize Image Size

```dockerfile
# Use Alpine-based images (smaller)
FROM python:3.11-alpine    # ~50MB
# Instead of:
FROM python:3.11           # ~900MB

# Multi-stage builds (for compiled languages)
FROM golang:1.21 AS builder
WORKDIR /app
COPY . .
RUN go build -o myapp

FROM alpine:latest
COPY --from=builder /app/myapp /usr/local/bin/
CMD ["myapp"]

# Clean up after installing dependencies
RUN apt-get update && apt-get install -y package \
    && rm -rf /var/lib/apt/lists/*
```

### Security Best Practices

```dockerfile
# 1. Use specific versions (not latest)
FROM nginx:1.25-alpine

# 2. Run as non-root user
RUN adduser -D -u 1000 appuser
USER appuser

# 3. Don't include secrets
# Use environment variables instead
ENV DATABASE_URL=""

# 4. Scan for vulnerabilities
# Use: docker scan my-image:1.0.0

# 5. Use .dockerignore
# Create .dockerignore file:
.git
.env
node_modules
*.log
```

### Health Checks

```dockerfile
# HTTP health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

# TCP health check
HEALTHCHECK --interval=30s --timeout=3s \
  CMD nc -z localhost 5432 || exit 1

# Custom script health check
HEALTHCHECK --interval=30s --timeout=10s \
  CMD /app/healthcheck.sh || exit 1
```

---

## Troubleshooting

### Image Not Found

```bash
# Check if image exists locally
docker images | grep my-module

# Pull image manually to test
docker pull localhost:5000/my-module:1.0.0

# Check registry connectivity
curl http://localhost:5000/v2/_catalog
```

### Permission Denied (Windows)

```bash
# Make sure Docker Desktop is running
# Check: Docker Desktop -> Settings -> Resources -> WSL Integration

# Restart Docker service
# Windows: Restart Docker Desktop
```

### Image Too Large

```bash
# See image size
docker images

# Analyze layers
docker history my-module:1.0.0

# Use dive tool for detailed analysis
dive my-module:1.0.0
```

### Build Fails

```bash
# Build with more output
docker build -t my-module:1.0.0 --progress=plain .

# Build without cache (clean build)
docker build -t my-module:1.0.0 --no-cache .

# Check Dockerfile syntax
docker build -t my-module:1.0.0 --check .
```

---

## Example: Complete Workflow

### Development to Production

#### 1. **Development (Local)**

```bash
# Build and test locally
cd modules/my-app
docker build -t localhost/my-app:1.0.0 .

# Test manually
docker run -d -p 9000:8080 localhost/my-app:1.0.0
curl http://localhost:9000/health

# Install via Module System (local testing)
# Use docker_image: "localhost/my-app:1.0.0"
```

#### 2. **Staging (Self-Hosted Registry)**

```bash
# Tag for staging registry
docker tag localhost/my-app:1.0.0 staging-registry:5000/my-app:1.0.0

# Push to staging
docker push staging-registry:5000/my-app:1.0.0

# Install on staging environment
# Use docker_image: "staging-registry:5000/my-app:1.0.0"
```

#### 3. **Production (Public Registry)**

```bash
# Tag for production
docker tag localhost/my-app:1.0.0 ghcr.io/mycompany/my-app:1.0.0

# Push to GitHub Container Registry
docker push ghcr.io/mycompany/my-app:1.0.0

# Install on production
# Use docker_image: "ghcr.io/mycompany/my-app:1.0.0"
```

---

## Quick Reference

### Command Cheat Sheet

```bash
# Build
docker build -t name:tag .

# List images
docker images

# Remove image
docker rmi name:tag

# Tag image
docker tag source:tag target:tag

# Push to registry
docker push registry/name:tag

# Pull from registry
docker pull registry/name:tag

# Login to registry
docker login registry-url

# Save image to file
docker save name:tag > image.tar

# Load image from file
docker load < image.tar

# Export running container to image
docker commit container-id new-image:tag
```

---

## Summary

| Method | Best For | Cost | Complexity | Sharing |
|--------|----------|------|------------|---------|
| **Local Images** | Development, Testing | Free | Easy | No |
| **Self-Hosted Registry** | Private, Team | Server costs | Medium | Yes (private) |
| **Docker Hub** | Public modules | Free tier available | Easy | Yes (public) |
| **GitHub Container Registry** | Open source | Free (good limits) | Easy | Yes (public/private) |
| **AWS/GCP/Azure** | Enterprise | Pay-as-you-go | Complex | Yes (private) |

**Recommendation:**
1. **Start with local images** for development and testing
2. **Use self-hosted registry** for team collaboration and private modules
3. **Use public registry** (GitHub/Docker Hub) for production and public modules

---

**Next Steps:**
1. Try building the example module in `modules/example-app/`
2. Test it locally before using the Module Management System
3. Once comfortable, set up a private registry for your team
4. Deploy to production using a public registry

For more information, see:
- [Docker Documentation](https://docs.docker.com/)
- [Docker Registry Documentation](https://docs.docker.com/registry/)
- [A64 Platform API Structure](./API-Structure.md)
