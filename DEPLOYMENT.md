# Deployment Guide - A64 Core Platform

## Overview
This document contains all deployment instructions, configurations, and procedures for the A64CorePlatform project. The platform uses Docker containerization for consistent deployment across environments.

## Table of Contents
- [Prerequisites](#prerequisites)
- [Environment Setup](#environment-setup)
- [Deployment Process](#deployment-process)
- [Post-Deployment](#post-deployment)
- [Rollback Procedures](#rollback-procedures)
- [Monitoring](#monitoring)
- [Troubleshooting](#troubleshooting)

## Prerequisites

### System Requirements

**Production Server:**
- OS: Linux (Ubuntu 20.04+ or RHEL 8+)
- CPU: 4+ cores
- RAM: 8GB minimum, 16GB recommended
- Storage: 50GB+ SSD
- Network: Static IP address, open ports 80, 443

**Software Requirements:**
- Docker Engine 20.10+
- Docker Compose 2.0+
- Git
- SSL Certificate (for HTTPS)

### Access Requirements
- SSH access to production server
- Docker Hub credentials (if using private registry)
- Database backup storage access
- DNS configuration access

## Environment Setup

### 1. Server Preparation

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Add user to docker group
sudo usermod -aG docker $USER

# Verify installations
docker --version
docker-compose --version
```

### 2. Clone Repository

```bash
# Create application directory
sudo mkdir -p /opt/a64core
cd /opt/a64core

# Clone repository
git clone <repository-url> .

# Set proper permissions
sudo chown -R $USER:$USER /opt/a64core
```

### 3. Environment Configuration

```bash
# Copy environment template
cp .env.example .env

# Edit environment file
nano .env
```

**Required Environment Variables for Production:**

```bash
# Application Settings
APP_NAME=A64 Core Platform API Hub
ENVIRONMENT=production
DEBUG=False

# Server Settings
HOST=0.0.0.0
PORT=8000

# CORS Settings (update with actual domains)
ALLOWED_ORIGINS=https://yourdomain.com,https://api.yourdomain.com

# Database Settings - MongoDB
MONGODB_URL=mongodb://mongodb:27017
MONGODB_DB_NAME=a64core_prod

# Database Settings - MySQL
MYSQL_HOST=mysql
MYSQL_PORT=3306
MYSQL_USER=a64user
MYSQL_PASSWORD=<strong_password_here>
MYSQL_DB_NAME=a64core_prod

# Security Settings (MUST CHANGE!)
SECRET_KEY=<generate_secure_random_key_min_32_chars>
API_KEY_PREFIX=prod_key

# Logging
LOG_LEVEL=INFO
```

**Generate Secure Secret Key:**
```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

### 4. Docker Production Configuration

Create `docker-compose.prod.yml`:

```yaml
version: '3.8'

services:
  api:
    container_name: a64core-api-prod
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "8000:8000"
    env_file:
      - .env
    volumes:
      - ./logs:/app/logs
    depends_on:
      - mongodb
      - mysql
    networks:
      - a64core-network
    restart: always
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 4G

  mongodb:
    container_name: a64core-mongodb-prod
    image: mongo:7.0
    environment:
      - MONGO_INITDB_DATABASE=a64core_prod
      - MONGO_INITDB_ROOT_USERNAME=admin
      - MONGO_INITDB_ROOT_PASSWORD=<strong_password>
    volumes:
      - mongodb_data:/data/db
      - ./backups/mongodb:/backups
    networks:
      - a64core-network
    restart: always

  mysql:
    container_name: a64core-mysql-prod
    image: mysql:8.0
    environment:
      - MYSQL_ROOT_PASSWORD=<strong_root_password>
      - MYSQL_DATABASE=a64core_prod
      - MYSQL_USER=a64user
      - MYSQL_PASSWORD=<strong_password>
    volumes:
      - mysql_data:/var/lib/mysql
      - ./backups/mysql:/backups
    networks:
      - a64core-network
    restart: always

  nginx:
    container_name: a64core-nginx-prod
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - api
    networks:
      - a64core-network
    restart: always

networks:
  a64core-network:
    driver: bridge

volumes:
  mongodb_data:
  mysql_data:
```

## Deployment Process

### Initial Deployment

**Step 1: Build Images**
```bash
cd /opt/a64core
docker-compose -f docker-compose.prod.yml build --no-cache
```

**Step 2: Start Database Services First**
```bash
docker-compose -f docker-compose.prod.yml up -d mongodb mysql
```

**Step 3: Wait for Databases to be Ready**
```bash
# Check health status
docker-compose -f docker-compose.prod.yml ps

# Wait for healthy status
sleep 30
```

**Step 4: Initialize Databases**
```bash
# Run database migrations (when implemented)
# docker-compose -f docker-compose.prod.yml exec api python -m alembic upgrade head
```

**Step 5: Start API Service**
```bash
docker-compose -f docker-compose.prod.yml up -d api
```

**Step 6: Start Nginx Reverse Proxy**
```bash
docker-compose -f docker-compose.prod.yml up -d nginx
```

**Step 7: Verify All Services**
```bash
docker-compose -f docker-compose.prod.yml ps
```

### Update Deployment (Rolling Update)

**Step 1: Pull Latest Changes**
```bash
cd /opt/a64core
git pull origin main
```

**Step 2: Backup Databases** (See Backup Procedures below)

**Step 3: Rebuild and Update**
```bash
docker-compose -f docker-compose.prod.yml build api
docker-compose -f docker-compose.prod.yml up -d --no-deps api
```

**Step 4: Verify Update**
```bash
curl http://localhost:8000/api/health
docker-compose -f docker-compose.prod.yml logs -f api
```

## Post-Deployment

### Verification Checklist

1. **Health Checks**
   ```bash
   # API Health
   curl http://localhost:8000/api/health

   # Expected: {"status":"healthy","timestamp":"...","service":"A64 Core Platform API Hub","version":"1.0.0"}

   # Readiness Check
   curl http://localhost:8000/api/ready
   ```

2. **Database Connectivity**
   ```bash
   # MongoDB
   docker exec a64core-mongodb-prod mongosh --eval "db.runCommand({ping: 1})"

   # MySQL
   docker exec a64core-mysql-prod mysql -u root -p<password> -e "SELECT 1"
   ```

3. **API Documentation**
   - Access: https://yourdomain.com/api/docs
   - Verify all endpoints are accessible

4. **Logs Inspection**
   ```bash
   docker-compose -f docker-compose.prod.yml logs --tail=100
   ```

5. **Resource Usage**
   ```bash
   docker stats
   ```

### Security Hardening

1. **Firewall Configuration**
   ```bash
   sudo ufw allow 22/tcp    # SSH
   sudo ufw allow 80/tcp    # HTTP
   sudo ufw allow 443/tcp   # HTTPS
   sudo ufw enable
   ```

2. **SSL/TLS Setup** (using Let's Encrypt)
   ```bash
   # Install certbot
   sudo apt install certbot python3-certbot-nginx

   # Obtain certificate
   sudo certbot --nginx -d yourdomain.com -d api.yourdomain.com

   # Auto-renewal test
   sudo certbot renew --dry-run
   ```

3. **Database Security**
   - Change default passwords
   - Restrict network access
   - Enable authentication
   - Regular security updates

## Backup Procedures

### Automated Daily Backups

**MongoDB Backup Script** (`/opt/a64core/scripts/backup-mongodb.sh`):
```bash
#!/bin/bash
BACKUP_DIR="/opt/a64core/backups/mongodb"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
CONTAINER="a64core-mongodb-prod"

docker exec $CONTAINER mongodump \
  --archive=/backups/backup_${TIMESTAMP}.archive \
  --gzip

# Keep only last 7 days
find $BACKUP_DIR -name "*.archive" -mtime +7 -delete
```

**MySQL Backup Script** (`/opt/a64core/scripts/backup-mysql.sh`):
```bash
#!/bin/bash
BACKUP_DIR="/opt/a64core/backups/mysql"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
CONTAINER="a64core-mysql-prod"

docker exec $CONTAINER mysqldump \
  -u root -p<password> \
  --all-databases --single-transaction \
  | gzip > $BACKUP_DIR/backup_${TIMESTAMP}.sql.gz

# Keep only last 7 days
find $BACKUP_DIR -name "*.sql.gz" -mtime +7 -delete
```

**Setup Cron Jobs:**
```bash
# Edit crontab
crontab -e

# Add backup jobs (runs at 2 AM daily)
0 2 * * * /opt/a64core/scripts/backup-mongodb.sh
0 2 * * * /opt/a64core/scripts/backup-mysql.sh
```

## Rollback Procedures

### Application Rollback

**Step 1: Identify Previous Version**
```bash
cd /opt/a64core
git log --oneline -10
```

**Step 2: Checkout Previous Version**
```bash
git checkout <previous-commit-hash>
```

**Step 3: Rebuild and Restart**
```bash
docker-compose -f docker-compose.prod.yml build api
docker-compose -f docker-compose.prod.yml up -d --no-deps api
```

**Step 4: Verify Rollback**
```bash
curl http://localhost:8000/api/health
docker-compose -f docker-compose.prod.yml logs api
```

### Database Rollback

**MongoDB Restore:**
```bash
docker exec a64core-mongodb-prod mongorestore \
  --archive=/backups/backup_<timestamp>.archive \
  --gzip \
  --drop
```

**MySQL Restore:**
```bash
gunzip < /opt/a64core/backups/mysql/backup_<timestamp>.sql.gz | \
  docker exec -i a64core-mysql-prod mysql -u root -p<password>
```

## Monitoring

### Log Management

**View Real-time Logs:**
```bash
# All services
docker-compose -f docker-compose.prod.yml logs -f

# Specific service
docker-compose -f docker-compose.prod.yml logs -f api

# Last 100 lines
docker-compose -f docker-compose.prod.yml logs --tail=100 api
```

### Performance Monitoring

**Resource Usage:**
```bash
docker stats
```

**Disk Usage:**
```bash
docker system df
```

### Health Monitoring Setup

Create health check script (`/opt/a64core/scripts/health-check.sh`):
```bash
#!/bin/bash
HEALTH_URL="http://localhost:8000/api/health"
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" $HEALTH_URL)

if [ $RESPONSE -eq 200 ]; then
    echo "$(date): API is healthy"
    exit 0
else
    echo "$(date): API health check failed with status $RESPONSE"
    # Send alert (email, Slack, etc.)
    exit 1
fi
```

**Setup Cron for Monitoring:**
```bash
# Check every 5 minutes
*/5 * * * * /opt/a64core/scripts/health-check.sh >> /var/log/a64core-health.log
```

## Troubleshooting

### Common Issues

**1. Container Won't Start**
```bash
# Check logs
docker-compose -f docker-compose.prod.yml logs <service-name>

# Rebuild from scratch
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml build --no-cache
docker-compose -f docker-compose.prod.yml up -d
```

**2. Database Connection Failed**
```bash
# Check database is running
docker-compose -f docker-compose.prod.yml ps mongodb mysql

# Check network connectivity
docker network inspect a64core-network

# Verify environment variables
docker-compose -f docker-compose.prod.yml config
```

**3. Out of Memory**
```bash
# Check memory usage
docker stats

# Increase Docker memory limits in docker-compose.prod.yml
# Restart with new limits
docker-compose -f docker-compose.prod.yml up -d
```

**4. Disk Space Full**
```bash
# Clean up Docker resources
docker system prune -a

# Remove old images
docker image prune -a

# Remove unused volumes (CAUTION!)
docker volume prune
```

**5. SSL Certificate Issues**
```bash
# Renew certificate
sudo certbot renew

# Test renewal
sudo certbot renew --dry-run
```

### Emergency Procedures

**Complete System Restart:**
```bash
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d
```

**Database Recovery:**
```bash
# Stop affected services
docker-compose -f docker-compose.prod.yml stop mongodb mysql

# Restore from backup (see Rollback Procedures)

# Restart services
docker-compose -f docker-compose.prod.yml start mongodb mysql
docker-compose -f docker-compose.prod.yml restart api
```

## Maintenance

### Regular Maintenance Tasks

**Weekly:**
- Review logs for errors
- Check disk space
- Verify backups are running

**Monthly:**
- Update Docker images
- Security patches
- Performance review
- Backup testing

**Quarterly:**
- Security audit
- Capacity planning
- Update SSL certificates (if not auto-renewed)

### Update Process

```bash
# 1. Backup everything
/opt/a64core/scripts/backup-mongodb.sh
/opt/a64core/scripts/backup-mysql.sh

# 2. Pull latest changes
git pull origin main

# 3. Update dependencies
docker-compose -f docker-compose.prod.yml build

# 4. Rolling update
docker-compose -f docker-compose.prod.yml up -d

# 5. Verify
curl http://localhost:8000/api/health
```

## Support Contacts

- **System Administrator:** [Contact Info]
- **Database Administrator:** [Contact Info]
- **Development Team:** [Contact Info]
- **24/7 Emergency:** [Contact Info]
