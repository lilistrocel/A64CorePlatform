# Example App Module

A simple example web application module for testing the A64 Core Platform Module Management System.

## Building the Image Locally

```bash
# Navigate to the module directory
cd modules/example-app

# Build the Docker image with a local tag
docker build -t localhost/example-app:1.0.0 .

# Verify the image was built
docker images | grep example-app
```

## Testing the Image Locally (Outside Module System)

```bash
# Run the container manually for testing
docker run -d --name test-example-app -p 9000:8080 localhost/example-app:1.0.0

# Test the application
curl http://localhost:9000
curl http://localhost:9000/health

# Check logs
docker logs test-example-app

# Stop and remove
docker stop test-example-app
docker rm test-example-app
```

## Installing via Module Management System

Once you've tested the image locally, install it via the API:

```bash
POST http://localhost/api/v1/modules/install
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "module_name": "example-app",
  "display_name": "Example Application",
  "docker_image": "localhost/example-app:1.0.0",
  "version": "1.0.0",
  "license_key": "TEST-LICENSE-KEY-123",
  "ports": ["9001:8080"],
  "description": "Example web application module"
}
```

## Features

- ✅ Simple NGINX-based web server
- ✅ Custom HTML interface
- ✅ Health check endpoint
- ✅ Lightweight (Alpine-based, ~10MB)
- ✅ Production-ready configuration

## Module Details

- **Base Image:** nginx:1.25-alpine
- **Exposed Port:** 8080
- **Health Check:** GET /health
- **Size:** ~10MB compressed
