#!/bin/bash
# A64 Core Platform - Development Environment Setup Script
# This script sets up and starts the full development environment.

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

echo "========================================"
echo "  A64 Core Platform - Dev Environment"
echo "========================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed.${NC}"
    echo "Install Docker: https://docs.docker.com/get-docker/"
    exit 1
fi

if ! command -v docker compose &> /dev/null && ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}Error: Docker Compose is not installed.${NC}"
    echo "Install Docker Compose: https://docs.docker.com/compose/install/"
    exit 1
fi

# Determine docker compose command
if docker compose version &> /dev/null; then
    COMPOSE="docker compose"
else
    COMPOSE="docker-compose"
fi

echo -e "${GREEN}Docker and Docker Compose found.${NC}"

# Check for .env file
if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        echo -e "${YELLOW}Creating .env from .env.example...${NC}"
        cp .env.example .env
    else
        echo -e "${YELLOW}Warning: No .env file found. Using defaults from docker-compose.yml${NC}"
    fi
fi

# Stop any existing containers
echo ""
echo -e "${YELLOW}Stopping any existing containers...${NC}"
$COMPOSE down --remove-orphans 2>/dev/null || true

# Build and start all services
echo ""
echo -e "${YELLOW}Building and starting services...${NC}"
echo "  - MongoDB 7.0"
echo "  - Redis 7"
echo "  - FastAPI (Python 3.11+)"
echo "  - Nginx 1.25"
echo ""

$COMPOSE up -d --build

# Wait for services to be healthy
echo ""
echo -e "${YELLOW}Waiting for services to become healthy...${NC}"

MAX_WAIT=60
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
    # Check if API is responding
    if curl -s http://localhost:8000/api/health > /dev/null 2>&1; then
        echo -e "${GREEN}API is healthy!${NC}"
        break
    fi
    sleep 2
    WAITED=$((WAITED + 2))
    echo "  Waiting... ($WAITED/$MAX_WAIT seconds)"
done

if [ $WAITED -ge $MAX_WAIT ]; then
    echo -e "${YELLOW}API may still be starting up. Check logs with: $COMPOSE logs api${NC}"
fi

# Install frontend dependencies if needed
echo ""
echo -e "${YELLOW}Setting up frontend...${NC}"
FRONTEND_DIR="$PROJECT_DIR/frontend/user-portal"
if [ -d "$FRONTEND_DIR" ]; then
    if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
        echo "Installing frontend dependencies..."
        cd "$FRONTEND_DIR"
        npm install
        cd "$PROJECT_DIR"
    else
        echo "Frontend dependencies already installed."
    fi

    # Start frontend dev server in background
    echo "Starting frontend dev server..."
    cd "$FRONTEND_DIR"
    nohup npm run dev -- --host 0.0.0.0 > /tmp/a64-frontend.log 2>&1 &
    FRONTEND_PID=$!
    cd "$PROJECT_DIR"
    echo "Frontend dev server started (PID: $FRONTEND_PID)"
else
    echo -e "${YELLOW}Frontend directory not found at $FRONTEND_DIR. Skipping frontend setup.${NC}"
fi

# Print access information
echo ""
echo "========================================"
echo -e "${GREEN}  A64 Core Platform is running!${NC}"
echo "========================================"
echo ""
echo "  Services:"
echo "  -----------------------------------------"
echo "  Backend API:    http://localhost:8000"
echo "  API Docs:       http://localhost:8000/docs"
echo "  ReDoc:          http://localhost:8000/redoc"
echo "  Health Check:   http://localhost:8000/api/health"
echo "  Readiness:      http://localhost:8000/api/ready"
echo "  Frontend:       http://localhost:5173"
echo "  Nginx Proxy:    http://localhost:80"
echo "  Adminer (DB):   http://localhost:8080"
echo "  -----------------------------------------"
echo ""
echo "  Useful Commands:"
echo "  -----------------------------------------"
echo "  View logs:      $COMPOSE logs -f api"
echo "  Stop all:       $COMPOSE down"
echo "  Restart API:    $COMPOSE restart api"
echo "  MongoDB shell:  $COMPOSE exec mongodb mongosh a64core_db"
echo "  Redis CLI:      $COMPOSE exec redis redis-cli"
echo "  -----------------------------------------"
echo ""
echo -e "${GREEN}Ready for development!${NC}"
