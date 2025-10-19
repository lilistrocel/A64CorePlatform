# Docker Image Quick Start Guide

This guide will help you understand and test Docker images with the A64 Core Platform Module Management System.

---

## 🎯 Quick Answer to Your Questions

### Q: How do I create Docker images locally?
**A:** Build them with `docker build` command. They're stored locally on your machine.

### Q: Can I create a folder for Docker images?
**A:** Not exactly. Docker images are stored in Docker's internal storage (not a regular folder). But you **can** create a folder for your **Dockerfile** and application code.

### Q: How do I test locally before hosting elsewhere?
**A:** Build image locally with `docker build`, tag it as `localhost/name:version`, then install via Module Management API using that local tag.

### Q: Can I self-host Docker images?
**A:** Yes! Three options:
1. **Local only** (easiest - no setup needed)
2. **Self-hosted registry** (for teams - run your own registry server)
3. **Public registries** (Docker Hub, GitHub - for sharing publicly)

---

## 🚀 Quick Start: Test the Example Module (5 Minutes)

### Step 1: The Example Module is Already Built!

I've created and built an example module for you:

```bash
# Verify it's there
docker images | grep example-app
```

**Output:**
```
localhost/example-app    1.0.0    689afac34133    2 minutes ago    74.2MB
```

### Step 2: Test it Manually (Optional - To See How It Works)

```bash
# Run the container manually
docker run -d --name test-example -p 9000:8080 localhost/example-app:1.0.0

# Test it in your browser
# Visit: http://localhost:9000

# Or use curl
curl http://localhost:9000
curl http://localhost:9000/health

# Check logs
docker logs test-example

# Stop and remove when done testing
docker stop test-example
docker rm test-example
```

### Step 3: Install via Module Management System (The Real Way)

**Option A: Using Python Script (Easiest)**

```bash
python scripts/install-example-module.py
```

This script will:
1. Login as super admin
2. Install the example module
3. Show you the status
4. Tell you how to access it

**Option B: Using curl (Manual)**

```bash
# 1. Get your access token first
# Login and copy the access_token from response
curl -X POST http://localhost/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@a64platform.com","password":"SuperAdmin123!"}'

# 2. Install the module (replace YOUR_TOKEN)
curl -X POST http://localhost/api/v1/modules/install \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "module_name": "example-app",
    "display_name": "Example Application",
    "docker_image": "localhost/example-app:1.0.0",
    "version": "1.0.0",
    "license_key": "EXAMPLE-LICENSE-123",
    "ports": ["9001:8080"],
    "description": "Example web application module"
  }'
```

### Step 4: Access Your Module

Once installed:
- **Web Interface:** http://localhost:9001
- **Health Check:** http://localhost:9001/health
- **Container Logs:** `docker logs a64core-example-app-dev`

---

## 📁 Project Structure

```
A64CorePlatform/
├── modules/                         # Your custom modules go here
│   └── example-app/                 # Example module (already created)
│       ├── Dockerfile               # Build instructions
│       ├── index.html               # Web interface
│       ├── nginx.conf               # NGINX configuration
│       └── README.md                # Module documentation
│
├── scripts/
│   └── install-example-module.py    # Helper script to install module
│
└── Docs/
    └── 1-Main-Documentation/
        └── Docker-Image-Management-Guide.md  # Complete guide
```

---

## 🎓 Understanding Docker Images

### What's a Docker Image?

Think of it like a **snapshot** or **template**:
- Contains your application code
- Contains all dependencies (Node.js, Python, libraries, etc.)
- Contains configuration
- Is **read-only** (doesn't change once built)

### What's a Docker Container?

A **running instance** of an image:
- Image = Recipe/Blueprint
- Container = The actual dish you made from the recipe

### Where Are Images Stored?

**Local Storage (Your Machine):**
```bash
# Images are stored by Docker in its internal storage
# Location (Windows): C:\ProgramData\Docker
# Location (Linux): /var/lib/docker

# You don't access these files directly
# Instead, use Docker commands:

docker images                          # List all images
docker inspect localhost/example-app:1.0.0  # See image details
```

**Registry (Remote Server):**
- Docker Hub (docker.io)
- GitHub Container Registry (ghcr.io)
- Your own registry server (localhost:5000)

---

## 🔧 How to Create Your Own Module

### Example: Simple Python Flask App

#### 1. Create Module Directory

```bash
mkdir -p modules/my-flask-app/src
cd modules/my-flask-app
```

#### 2. Create Your Application

**File: `src/app.py`**
```python
from flask import Flask, jsonify

app = Flask(__name__)

@app.route('/')
def home():
    return jsonify({
        "message": "Hello from My Flask App!",
        "status": "running",
        "version": "1.0.0"
    })

@app.route('/health')
def health():
    return jsonify({"status": "healthy"}), 200

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
```

**File: `requirements.txt`**
```
flask==3.0.0
```

#### 3. Create Dockerfile

**File: `Dockerfile`**
```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY src/ ./src/

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=3s \
  CMD curl -f http://localhost:5000/health || exit 1

# Run app
CMD ["python", "src/app.py"]
```

#### 4. Build the Image

```bash
# Build with localhost tag (no registry needed)
docker build -t localhost/my-flask-app:1.0.0 .

# Verify
docker images | grep my-flask-app
```

#### 5. Test Locally

```bash
# Run manually
docker run -d --name test-flask -p 9002:5000 localhost/my-flask-app:1.0.0

# Test
curl http://localhost:9002
curl http://localhost:9002/health

# Clean up
docker stop test-flask && docker rm test-flask
```

#### 6. Install via Module System

```python
# Use the install script or API:
{
    "module_name": "my-flask-app",
    "display_name": "My Flask Application",
    "docker_image": "localhost/my-flask-app:1.0.0",
    "version": "1.0.0",
    "license_key": "YOUR-LICENSE",
    "ports": ["9002:5000"]
}
```

---

## 🌐 Sharing Images (Self-Hosting)

### Option 1: Local Only (No Sharing)

✅ **Use case:** Development, personal testing
- Images only on your machine
- Fast, free, no setup
- **Tag with:** `localhost/name:version`

### Option 2: Self-Hosted Registry (Team Sharing)

✅ **Use case:** Team collaboration, private modules

**Quick Setup:**
```bash
# 1. Run a registry container
docker run -d -p 5000:5000 --name registry registry:2

# 2. Add to trusted registries in .env
TRUSTED_REGISTRIES=docker.io,ghcr.io,localhost:5000

# 3. Tag and push
docker tag my-app:1.0.0 localhost:5000/my-app:1.0.0
docker push localhost:5000/my-app:1.0.0

# 4. Anyone on your network can now pull it
docker pull localhost:5000/my-app:1.0.0
```

### Option 3: Public Registry (Public Sharing)

✅ **Use case:** Open source, production, public modules

**Docker Hub (Free):**
```bash
# 1. Create account at hub.docker.com
# 2. Login
docker login

# 3. Tag with your username
docker tag my-app:1.0.0 yourusername/my-app:1.0.0

# 4. Push
docker push yourusername/my-app:1.0.0

# 5. Anyone can now pull it
docker pull yourusername/my-app:1.0.0
```

**GitHub Container Registry (Free):**
```bash
# 1. Create personal access token on GitHub
# 2. Login
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin

# 3. Tag
docker tag my-app:1.0.0 ghcr.io/username/my-app:1.0.0

# 4. Push
docker push ghcr.io/username/my-app:1.0.0
```

---

## 📊 Comparison: Which Option?

| Method | Cost | Setup | Speed | Sharing | Best For |
|--------|------|-------|-------|---------|----------|
| **Local** | Free | None | Fastest | No | Development, Testing |
| **Self-Hosted** | Server cost | Medium | Fast (LAN) | Team/Private | Private modules, Team |
| **Docker Hub** | Free tier | Easy | Medium | Public | Open source, Production |
| **GitHub Registry** | Free | Easy | Medium | Public/Private | GitHub projects |
| **AWS/GCP** | Pay-as-you-go | Complex | Fast | Private | Enterprise |

---

## 🎯 Recommended Workflow

### 1. Development (Local)
```bash
cd modules/my-app
docker build -t localhost/my-app:1.0.0 .
docker run -d -p 9000:8080 localhost/my-app:1.0.0
# Test: curl http://localhost:9000
```

### 2. Team Testing (Self-Hosted Registry)
```bash
docker tag localhost/my-app:1.0.0 company-registry:5000/my-app:1.0.0
docker push company-registry:5000/my-app:1.0.0
# Team can now pull and test
```

### 3. Production (Public Registry)
```bash
docker tag localhost/my-app:1.0.0 ghcr.io/company/my-app:1.0.0
docker push ghcr.io/company/my-app:1.0.0
# Deploy to production servers
```

---

## 🔍 Common Commands

```bash
# List local images
docker images

# Build image
docker build -t name:tag .

# Run container
docker run -d -p host:container name:tag

# Stop container
docker stop container-name

# Remove container
docker rm container-name

# Remove image
docker rmi name:tag

# View running containers
docker ps

# View logs
docker logs container-name

# Execute command in container
docker exec -it container-name /bin/sh

# Clean up unused images
docker image prune -a
```

---

## 📚 Next Steps

1. **Try the example module:**
   ```bash
   python scripts/install-example-module.py
   ```

2. **Read the complete guide:**
   - [Docs/1-Main-Documentation/Docker-Image-Management-Guide.md](Docs/1-Main-Documentation/Docker-Image-Management-Guide.md)

3. **Create your own module:**
   - Copy `modules/example-app/` as a template
   - Modify Dockerfile and application code
   - Build and test locally
   - Install via Module Management System

4. **Set up self-hosting (optional):**
   - Run a local registry
   - Share with your team
   - See full guide for authentication and SSL setup

---

## ❓ FAQ

**Q: Do I need to upload images somewhere?**
**A:** No, not for local testing. Images built locally can be used directly with `localhost/name:version` tag.

**Q: Where are local images stored?**
**A:** In Docker's internal storage. Use `docker images` to see them. Don't try to access the files directly.

**Q: Can I delete local images?**
**A:** Yes: `docker rmi localhost/example-app:1.0.0`

**Q: How do I update a module?**
**A:** Build with a new version tag (1.0.0 → 1.0.1), then uninstall old and install new.

**Q: Can I use images from Docker Hub directly?**
**A:** Yes, if the registry is trusted. For example: `docker.io/library/nginx:1.25`

**Q: What if I want to share with my team but keep it private?**
**A:** Set up a self-hosted registry (see Docker-Image-Management-Guide.md)

---

## 🆘 Need Help?

- **Complete documentation:** `Docs/1-Main-Documentation/Docker-Image-Management-Guide.md`
- **Example module:** `modules/example-app/`
- **Installation script:** `scripts/install-example-module.py`
- **API documentation:** `Docs/1-Main-Documentation/API-Structure.md`

---

**Ready to test?** Run this now:
```bash
python scripts/install-example-module.py
```

Then visit: **http://localhost:9001** 🚀
