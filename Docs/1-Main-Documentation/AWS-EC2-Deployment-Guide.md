# AWS EC2 Deployment Guide - Self-Hosted MongoDB

**Date:** 2025-11-02
**Deployment Type:** EC2 with Docker Compose + Self-Hosted MongoDB
**Estimated Monthly Cost:** ~$35-45/month

---

## Overview

This guide covers deploying the A64 Core Platform to AWS EC2 with self-hosted MongoDB. This approach uses your existing `docker-compose.yml` configuration, keeping all services (API, frontend, nginx, MongoDB) running together on a single EC2 instance.

**Why This Approach:**
- ✅ Uses your existing Docker Compose setup
- ✅ Self-hosted MongoDB with full control
- ✅ Simpler than ECS for database workloads
- ✅ Lower cost
- ✅ Easier backup and management

---

## Prerequisites

1. **AWS Account** - Create at https://aws.amazon.com if you don't have one
2. **Domain Name** - You mentioned you have one ready
3. **Git Repository** - Your code is already committed
4. **AWS CLI** - We'll install this first

---

## Cost Estimation

| Resource | Specification | Monthly Cost |
|----------|--------------|--------------|
| EC2 Instance | t3.medium (2 vCPU, 4GB RAM) | ~$30 |
| EBS Storage | 30GB gp3 (MongoDB data) | ~$2.50 |
| Elastic IP | 1 static IP address | Free (when attached) |
| Data Transfer | ~100GB/month | ~$9 |
| Route 53 | Hosted zone + queries | ~$0.50 |
| **Total** | | **~$42/month** |

---

## Step 1: Install AWS CLI

### Windows Installation

**Download and Install:**
1. Download AWS CLI MSI: https://awscli.amazonaws.com/AWSCLIV2.msi
2. Run the installer
3. Follow the wizard (default settings are fine)
4. **Restart your terminal after installation**

**Verify Installation:**
```bash
aws --version
# Should show: aws-cli/2.x.x Python/3.x.x Windows/...
```

### Configure AWS Credentials

1. **Get AWS Access Keys:**
   - Log into AWS Console: https://console.aws.amazon.com
   - Click your name (top right) → Security Credentials
   - Scroll to "Access keys" → Create access key
   - Choose "Command Line Interface (CLI)"
   - Check "I understand..." → Create access key
   - **Copy both Access Key ID and Secret Access Key**

2. **Configure AWS CLI:**
```bash
aws configure
```

Enter when prompted:
- **AWS Access Key ID**: `[paste your access key]`
- **AWS Secret Access Key**: `[paste your secret key]`
- **Default region name**: `us-east-1` (recommended for lower costs)
- **Default output format**: `json`

3. **Test Configuration:**
```bash
aws sts get-caller-identity
```
Should show your AWS account ID and user ARN.

---

## Step 2: Create SSH Key Pair

You'll need this to connect to your EC2 instance.

```bash
# Create new key pair (saved to AWS and downloaded)
aws ec2 create-key-pair --key-name a64-platform-key --query 'KeyMaterial' --output text > a64-platform-key.pem
```

**On Windows:**
- The key will be saved in your current directory
- You'll use this with PuTTY or Windows Terminal to connect

**Secure the key:**
```bash
# Windows - Set permissions (in PowerShell as Administrator)
icacls a64-platform-key.pem /inheritance:r /grant:r "%USERNAME%:R"
```

---

## Step 3: Create Security Group

This controls what traffic can reach your server.

```bash
# Create security group
aws ec2 create-security-group \
  --group-name a64-platform-sg \
  --description "Security group for A64 Core Platform"

# Allow SSH (port 22) - REPLACE 'YOUR_IP' with your actual IP
# Find your IP: curl ifconfig.me
aws ec2 authorize-security-group-ingress \
  --group-name a64-platform-sg \
  --protocol tcp --port 22 \
  --cidr YOUR_IP/32

# Allow HTTP (port 80)
aws ec2 authorize-security-group-ingress \
  --group-name a64-platform-sg \
  --protocol tcp --port 80 \
  --cidr 0.0.0.0/0

# Allow HTTPS (port 443)
aws ec2 authorize-security-group-ingress \
  --group-name a64-platform-sg \
  --protocol tcp --port 443 \
  --cidr 0.0.0.0/0
```

---

## Step 4: Launch EC2 Instance

```bash
# Get the latest Ubuntu 22.04 AMI ID for your region
aws ec2 describe-images \
  --owners 099720109477 \
  --filters "Name=name,Values=ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*" \
  --query 'sort_by(Images, &CreationDate)[-1].ImageId' \
  --output text

# Launch instance (replace AMI_ID with output from above)
aws ec2 run-instances \
  --image-id AMI_ID \
  --instance-type t3.medium \
  --key-name a64-platform-key \
  --security-groups a64-platform-sg \
  --block-device-mappings '[{"DeviceName":"/dev/sda1","Ebs":{"VolumeSize":30,"VolumeType":"gp3"}}]' \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=A64-Platform}]' \
  --count 1
```

**Instance will take 1-2 minutes to start. Note the Instance ID from output.**

---

## Step 5: Allocate and Associate Elastic IP

```bash
# Allocate Elastic IP
aws ec2 allocate-address --domain vpc

# Note the AllocationId from output

# Associate with instance (replace INSTANCE_ID and ALLOCATION_ID)
aws ec2 associate-address \
  --instance-id INSTANCE_ID \
  --allocation-id ALLOCATION_ID

# Get your instance's public IP
aws ec2 describe-addresses \
  --allocation-ids ALLOCATION_ID \
  --query 'Addresses[0].PublicIp' \
  --output text
```

**Save this IP address - you'll use it to connect and for DNS configuration.**

---

## Step 6: Connect to EC2 Instance

### Using Windows Terminal / PowerShell

```bash
# Connect via SSH (replace PUBLIC_IP with your Elastic IP)
ssh -i a64-platform-key.pem ubuntu@PUBLIC_IP
```

### Using PuTTY (Alternative for Windows)

1. Download PuTTY: https://www.putty.org/
2. Convert .pem to .ppk using PuTTYgen
3. Use PuTTY to connect with the .ppk key

---

## Step 7: Install Docker and Docker Compose on EC2

**Once connected via SSH, run these commands on the EC2 instance:**

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add ubuntu user to docker group
sudo usermod -aG docker ubuntu

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Log out and back in for group changes to take effect
exit
```

**Reconnect via SSH:**
```bash
ssh -i a64-platform-key.pem ubuntu@PUBLIC_IP
```

**Verify installation:**
```bash
docker --version
docker-compose --version
```

---

## Step 8: Clone Repository and Configure

```bash
# Install git if not present
sudo apt install git -y

# Clone your repository
cd ~
git clone https://github.com/YOUR_USERNAME/A64CorePlatform.git
cd A64CorePlatform

# Or if using private repo, set up SSH keys first
```

### Set Up SSH for Private Repositories (if needed)

```bash
# Generate SSH key on EC2
ssh-keygen -t ed25519 -C "your_email@example.com"
# Press Enter for all prompts (default location, no passphrase)

# Display public key
cat ~/.ssh/id_ed25519.pub
# Copy this and add to GitHub: Settings → SSH Keys → New SSH key

# Test connection
ssh -T git@github.com

# Clone using SSH
git clone git@github.com:YOUR_USERNAME/A64CorePlatform.git
cd A64CorePlatform
```

---

## Step 9: Configure Environment Variables

```bash
# Create production .env file
nano .env
```

**Paste this configuration (customize values):**

```bash
# ===================================
# PRODUCTION ENVIRONMENT CONFIGURATION
# ===================================

# MongoDB Configuration (Self-Hosted)
MONGODB_URL=mongodb://mongodb:27017/a64core_db
MONGODB_HOST=mongodb
MONGODB_PORT=27017
MONGODB_DB=a64core_db

# MongoDB Root Credentials
MONGO_INITDB_ROOT_USERNAME=admin
MONGO_INITDB_ROOT_PASSWORD=CHANGE_THIS_STRONG_PASSWORD

# JWT Authentication
JWT_SECRET=GENERATE_RANDOM_64_CHAR_STRING_HERE
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# API Configuration
API_HOST=0.0.0.0
API_PORT=5000
API_URL=https://yourdomain.com/api/v1

# Frontend Configuration
VITE_API_URL=https://yourdomain.com/api/v1

# CORS Configuration
CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# Email Configuration (if using)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your-email@gmail.com
SMTP_PASSWORD=your-app-password
EMAIL_FROM=noreply@yourdomain.com

# Environment
NODE_ENV=production
ENVIRONMENT=production
```

**Generate secure JWT secret:**
```bash
# On EC2 instance
openssl rand -hex 32
# Copy output and paste into JWT_SECRET
```

**Save and exit:** Press `Ctrl+X`, then `Y`, then `Enter`

---

## Step 10: Create Docker Compose Override for Production

Create a production-specific override file:

```bash
nano docker-compose.prod.yml
```

**Paste this configuration:**

```yaml
version: '3.8'

services:
  mongodb:
    volumes:
      - /data/mongodb:/data/db  # Use host path for persistence
    restart: unless-stopped
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  api:
    restart: unless-stopped
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  user-portal:
    restart: unless-stopped
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  nginx:
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /etc/letsencrypt:/etc/letsencrypt:ro  # For SSL certificates
    restart: unless-stopped
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

**Save and exit.**

---

## Step 11: Create MongoDB Data Directory

```bash
# Create persistent data directory
sudo mkdir -p /data/mongodb

# Set ownership to MongoDB user (UID 999 in container)
sudo chown -R 999:999 /data/mongodb

# Verify permissions
ls -la /data/
```

---

## Step 12: Deploy Application

```bash
# Build and start all services
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Check status
docker-compose ps

# View logs
docker-compose logs -f

# To stop viewing logs, press Ctrl+C
```

**Verify services are running:**
```bash
docker-compose ps
# All services should show "Up"

# Test API
curl http://localhost/api/v1/health
# Should return: {"status":"healthy"}
```

---

## Step 13: Configure Domain with Route 53

### Create Hosted Zone

1. **In AWS Console:**
   - Go to Route 53 → Hosted Zones → Create hosted zone
   - Domain name: `yourdomain.com`
   - Type: Public hosted zone
   - Create

2. **Note the Name Servers** (4 NS records shown)

3. **Update Your Domain Registrar:**
   - Log into where you bought your domain
   - Find DNS/Nameserver settings
   - Replace existing nameservers with AWS Route 53 nameservers
   - Save (propagation takes 15 minutes - 48 hours)

### Create DNS Records

**Using AWS CLI:**

```bash
# Get your hosted zone ID
aws route53 list-hosted-zones --query 'HostedZones[?Name==`yourdomain.com.`].Id' --output text

# Create A record for root domain (replace HOSTED_ZONE_ID and ELASTIC_IP)
aws route53 change-resource-record-sets \
  --hosted-zone-id HOSTED_ZONE_ID \
  --change-batch '{
    "Changes": [{
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "yourdomain.com",
        "Type": "A",
        "TTL": 300,
        "ResourceRecords": [{"Value": "ELASTIC_IP"}]
      }
    }]
  }'

# Create A record for www subdomain
aws route53 change-resource-record-sets \
  --hosted-zone-id HOSTED_ZONE_ID \
  --change-batch '{
    "Changes": [{
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "www.yourdomain.com",
        "Type": "A",
        "TTL": 300,
        "ResourceRecords": [{"Value": "ELASTIC_IP"}]
      }
    }]
  }'
```

**Test DNS (wait 5-10 minutes for propagation):**
```bash
nslookup yourdomain.com
# Should show your Elastic IP
```

---

## Step 14: Set Up SSL/TLS with Let's Encrypt

**On EC2 instance via SSH:**

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# Stop nginx temporarily
docker-compose stop nginx

# Install Certbot's Nginx plugin
sudo apt install python3-certbot-nginx -y

# Get certificate (replace with your actual domain)
sudo certbot certonly --standalone \
  -d yourdomain.com \
  -d www.yourdomain.com \
  --agree-tos \
  --non-interactive \
  --email your-email@example.com

# Certificates will be saved to: /etc/letsencrypt/live/yourdomain.com/
```

### Update Nginx Configuration for SSL

```bash
# Create SSL-enabled nginx config
nano nginx/nginx.conf
```

**Replace with this SSL-enabled configuration:**

```nginx
events {
    worker_connections 1024;
}

http {
    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=login_limit:10m rate=5r/m;

    # Upstream services
    upstream api {
        server api:5000;
    }

    upstream user_portal {
        server user-portal:5173;
    }

    # HTTP to HTTPS redirect
    server {
        listen 80;
        server_name yourdomain.com www.yourdomain.com;

        location / {
            return 301 https://$host$request_uri;
        }
    }

    # HTTPS server
    server {
        listen 443 ssl http2;
        server_name yourdomain.com www.yourdomain.com;

        # SSL Configuration
        ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

        # SSL Security Settings
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;
        ssl_prefer_server_ciphers on;
        ssl_session_cache shared:SSL:10m;
        ssl_session_timeout 10m;

        # Security Headers
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-XSS-Protection "1; mode=block" always;
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

        # API Routes
        location /api/ {
            limit_req zone=api_limit burst=20 nodelay;

            proxy_pass http://api;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;

            proxy_connect_timeout 60s;
            proxy_send_timeout 60s;
            proxy_read_timeout 60s;
        }

        # Login endpoint with stricter rate limiting
        location /api/v1/auth/login {
            limit_req zone=login_limit burst=3 nodelay;

            proxy_pass http://api;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # Frontend Routes
        location / {
            proxy_pass http://user_portal;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;

            # SPA fallback
            try_files $uri $uri/ /index.html;
        }

        # Health check endpoint
        location /health {
            access_log off;
            return 200 "healthy\n";
            add_header Content-Type text/plain;
        }
    }
}
```

**Save and exit.**

**Restart services:**
```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --force-recreate nginx

# Check logs
docker-compose logs nginx
```

### Set Up Auto-Renewal for SSL Certificates

```bash
# Test renewal
sudo certbot renew --dry-run

# Set up automatic renewal (runs twice daily)
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer

# Verify timer is active
sudo systemctl status certbot.timer

# Create post-renewal hook to reload nginx
sudo nano /etc/letsencrypt/renewal-hooks/post/reload-nginx.sh
```

**Add this content:**
```bash
#!/bin/bash
docker-compose -f /home/ubuntu/A64CorePlatform/docker-compose.yml -f /home/ubuntu/A64CorePlatform/docker-compose.prod.yml restart nginx
```

**Make executable:**
```bash
sudo chmod +x /etc/letsencrypt/renewal-hooks/post/reload-nginx.sh
```

---

## Step 15: Verify Deployment

### Test All Endpoints

```bash
# Test HTTPS (should work)
curl https://yourdomain.com/health
# Output: healthy

# Test HTTP (should redirect to HTTPS)
curl -I http://yourdomain.com
# Should show: HTTP/1.1 301 Moved Permanently
# Location: https://yourdomain.com/

# Test API
curl https://yourdomain.com/api/v1/health
# Output: {"status":"healthy"}
```

### Open in Browser

1. Navigate to `https://yourdomain.com`
2. Should see your user portal
3. Should show secure padlock icon (valid SSL)
4. Try logging in with your credentials

---

## Step 16: Configure MongoDB Backups

### Automated Backup Script

```bash
# Create backup directory
sudo mkdir -p /home/ubuntu/backups
sudo chown ubuntu:ubuntu /home/ubuntu/backups

# Create backup script
nano /home/ubuntu/backup-mongodb.sh
```

**Add this content:**

```bash
#!/bin/bash

# Configuration
BACKUP_DIR="/home/ubuntu/backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="mongodb_backup_$DATE"
RETENTION_DAYS=7

# Create backup
docker exec a64core-mongodb-dev mongodump \
  --out /data/db/backup_temp \
  --authenticationDatabase admin \
  -u admin \
  -p "YOUR_MONGO_PASSWORD"

# Copy from container to host
docker cp a64core-mongodb-dev:/data/db/backup_temp "$BACKUP_DIR/$BACKUP_NAME"

# Compress backup
cd "$BACKUP_DIR"
tar -czf "$BACKUP_NAME.tar.gz" "$BACKUP_NAME"
rm -rf "$BACKUP_NAME"

# Clean up old backups (keep last 7 days)
find "$BACKUP_DIR" -name "mongodb_backup_*.tar.gz" -mtime +$RETENTION_DAYS -delete

# Log completion
echo "Backup completed: $BACKUP_NAME.tar.gz" >> "$BACKUP_DIR/backup.log"
```

**Make executable:**
```bash
chmod +x /home/ubuntu/backup-mongodb.sh
```

**Test backup:**
```bash
/home/ubuntu/backup-mongodb.sh

# Verify
ls -lh /home/ubuntu/backups/
```

### Schedule Daily Backups with Cron

```bash
# Edit crontab
crontab -e

# Add this line (runs daily at 2 AM)
0 2 * * * /home/ubuntu/backup-mongodb.sh
```

### Optional: Backup to S3

```bash
# Install AWS CLI on EC2
sudo apt install awscli -y

# Configure AWS credentials
aws configure

# Update backup script to include S3 upload
nano /home/ubuntu/backup-mongodb.sh
```

**Add before "Log completion" line:**
```bash
# Upload to S3 (optional - create bucket first)
aws s3 cp "$BACKUP_DIR/$BACKUP_NAME.tar.gz" s3://your-backup-bucket/mongodb/
```

---

## Monitoring and Maintenance

### View Application Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f api
docker-compose logs -f mongodb
docker-compose logs -f nginx

# Last 100 lines
docker-compose logs --tail=100 api
```

### Check Resource Usage

```bash
# Docker stats
docker stats

# System resources
htop  # Install: sudo apt install htop
```

### Update Application

```bash
# Connect via SSH
ssh -i a64-platform-key.pem ubuntu@YOUR_ELASTIC_IP

# Pull latest changes
cd ~/A64CorePlatform
git pull origin main

# Rebuild and restart
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Check status
docker-compose ps
```

---

## Security Best Practices

### 1. Restrict SSH Access

```bash
# Update security group to only allow SSH from your IP
aws ec2 revoke-security-group-ingress \
  --group-name a64-platform-sg \
  --protocol tcp --port 22 \
  --cidr 0.0.0.0/0

aws ec2 authorize-security-group-ingress \
  --group-name a64-platform-sg \
  --protocol tcp --port 22 \
  --cidr YOUR_CURRENT_IP/32
```

### 2. Set Up CloudWatch Monitoring

```bash
# Install CloudWatch agent
wget https://s3.amazonaws.com/amazoncloudwatch-agent/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb
sudo dpkg -i amazon-cloudwatch-agent.deb

# Configure and start (requires IAM role)
```

### 3. Enable Automatic Security Updates

```bash
sudo apt install unattended-upgrades -y
sudo dpkg-reconfigure --priority=low unattended-upgrades
```

### 4. Set Up Firewall

```bash
# Enable UFW
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP
sudo ufw allow 443/tcp  # HTTPS
sudo ufw enable
sudo ufw status
```

---

## Troubleshooting

### Services Won't Start

```bash
# Check logs
docker-compose logs

# Check specific service
docker-compose logs api

# Restart all services
docker-compose down
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

### MongoDB Connection Issues

```bash
# Check MongoDB is running
docker-compose ps mongodb

# Check MongoDB logs
docker-compose logs mongodb

# Test MongoDB connection
docker exec -it a64core-mongodb-dev mongosh -u admin -p YOUR_PASSWORD
```

### SSL Certificate Issues

```bash
# Check certificate expiry
sudo certbot certificates

# Manually renew
sudo certbot renew

# Check nginx config
docker-compose exec nginx nginx -t
```

### Domain Not Resolving

```bash
# Check DNS propagation
nslookup yourdomain.com

# Check Route 53 records
aws route53 list-resource-record-sets --hosted-zone-id YOUR_HOSTED_ZONE_ID
```

---

## Scaling and Upgrades

### Upgrade Instance Size

If you need more resources:

1. Stop application:
```bash
docker-compose down
```

2. In AWS Console:
   - EC2 → Instances → Select your instance
   - Instance State → Stop
   - Actions → Instance Settings → Change Instance Type
   - Choose larger size (e.g., t3.large for 2 vCPU, 8GB RAM)
   - Start instance

3. Restart application:
```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### Add More Storage

```bash
# In AWS Console, create new EBS volume and attach to instance
# Then on EC2:

# Format new volume
sudo mkfs -t ext4 /dev/xvdf

# Mount new volume
sudo mkdir /data/mongodb-new
sudo mount /dev/xvdf /data/mongodb-new

# Migrate data
sudo rsync -av /data/mongodb/ /data/mongodb-new/

# Update docker-compose.prod.yml to use new path
```

---

## Cost Optimization

### 1. Use Reserved Instances
- Save up to 72% vs on-demand
- 1-year or 3-year commitment

### 2. Enable Detailed Monitoring
- Identify unused resources
- Right-size instances

### 3. Set Up Billing Alerts
```bash
# Create SNS topic for alerts
aws sns create-topic --name billing-alerts

# Create billing alarm
aws cloudwatch put-metric-alarm \
  --alarm-name billing-alert \
  --alarm-description "Alert when charges exceed $50" \
  --metric-name EstimatedCharges \
  --namespace AWS/Billing \
  --statistic Maximum \
  --period 21600 \
  --evaluation-periods 1 \
  --threshold 50 \
  --comparison-operator GreaterThanThreshold
```

---

## Summary

You now have a fully deployed A64 Core Platform on AWS EC2 with:

- ✅ Self-hosted MongoDB with persistent storage
- ✅ All services running via Docker Compose
- ✅ Domain configured with Route 53
- ✅ SSL/TLS encryption with Let's Encrypt
- ✅ Automated SSL renewal
- ✅ Automated MongoDB backups
- ✅ Security hardening
- ✅ Monitoring and logging

**Total Setup Time:** ~1-2 hours
**Monthly Cost:** ~$35-45
**Maintenance:** ~1-2 hours/month (mostly automated)

---

## Quick Reference Commands

```bash
# Connect to EC2
ssh -i a64-platform-key.pem ubuntu@YOUR_ELASTIC_IP

# View logs
docker-compose logs -f

# Restart services
docker-compose restart

# Update application
git pull && docker-compose up -d --build

# Backup database
/home/ubuntu/backup-mongodb.sh

# Check SSL certificate
sudo certbot certificates

# View system resources
docker stats
htop
```

---

## Next Steps

1. Set up monitoring dashboards
2. Configure email alerts for system issues
3. Set up staging environment
4. Implement CI/CD pipeline
5. Configure additional backups to S3
6. Set up log aggregation with CloudWatch

---

**Need Help?** Check the troubleshooting section or reach out with specific error messages.
