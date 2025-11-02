# AWS Deployment Guide - A64 Core Platform

**Date Created:** 2025-11-02
**Platform:** Docker-based microservices on AWS
**Domain Configuration:** Included

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Deployment Options](#deployment-options)
4. [Recommended: AWS ECS with Fargate](#recommended-aws-ecs-with-fargate)
5. [Alternative: AWS EC2](#alternative-aws-ec2)
6. [Database Configuration](#database-configuration)
7. [Domain Configuration](#domain-configuration)
8. [Environment Variables](#environment-variables)
9. [SSL/TLS Certificates](#ssltls-certificates)
10. [Monitoring & Logging](#monitoring--logging)
11. [Cost Estimation](#cost-estimation)

---

## Overview

The A64 Core Platform is a Docker Compose-based application with:
- **Frontend**: Vite + React (user-portal)
- **Backend API**: FastAPI (Python)
- **Database**: MongoDB
- **Reverse Proxy**: Nginx

### Architecture
```
Internet → Route 53 → ALB/CloudFront → ECS/EC2 → Docker Containers
                                                   ├─ Nginx (80/443)
                                                   ├─ API (5000)
                                                   ├─ User Portal (5173)
                                                   └─ MongoDB (27017)
```

---

## Prerequisites

### AWS Account Setup
- [ ] AWS Account with billing enabled
- [ ] AWS CLI installed and configured
- [ ] IAM user with appropriate permissions
- [ ] SSH key pair created (for EC2 option)

### Local Requirements
- [ ] Git repository with all code committed
- [ ] GitHub/GitLab/Bitbucket account (for CI/CD)
- [ ] Domain name purchased (your domain)
- [ ] SSL certificate (can use AWS Certificate Manager)

### Install AWS CLI (if not installed)
```bash
# Windows
winget install Amazon.AWSCLI

# Verify
aws --version
```

### Configure AWS Credentials
```bash
aws configure
# Enter:
# - AWS Access Key ID
# - AWS Secret Access Key
# - Default region (e.g., us-east-1)
# - Default output format: json
```

---

## Deployment Options

### Option 1: AWS ECS with Fargate (Recommended)
**Pros:**
- ✅ Fully managed (no server maintenance)
- ✅ Auto-scaling built-in
- ✅ Pay only for what you use
- ✅ Easy CI/CD integration
- ✅ High availability

**Cons:**
- ❌ Slightly higher cost for small workloads
- ❌ Learning curve for AWS services

**Best For:** Production deployments, scalable applications

---

### Option 2: AWS EC2 Instance
**Pros:**
- ✅ Simple to understand
- ✅ Full control over server
- ✅ Lower cost for single instance
- ✅ Easier debugging

**Cons:**
- ❌ Manual server management
- ❌ You manage updates/security
- ❌ Manual scaling

**Best For:** Development, small projects, cost-conscious deployments

---

## Recommended: AWS ECS with Fargate

### Step-by-Step Deployment

#### 1. Create ECR Repositories

Create repositories for each Docker image:

```bash
# Create ECR repositories
aws ecr create-repository --repository-name a64core/nginx
aws ecr create-repository --repository-name a64core/api
aws ecr create-repository --repository-name a64core/user-portal
aws ecr create-repository --repository-name a64core/farm-management

# Get your AWS account ID and region
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
AWS_REGION=$(aws configure get region)
```

#### 2. Build and Push Docker Images

```bash
# Login to ECR
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

# Build images
docker-compose build

# Tag images for ECR
docker tag a64core-nginx:latest $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/a64core/nginx:latest
docker tag a64core-api:latest $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/a64core/api:latest
docker tag a64core-user-portal:latest $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/a64core/user-portal:latest

# Push images
docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/a64core/nginx:latest
docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/a64core/api:latest
docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/a64core/user-portal:latest
```

#### 3. Create ECS Cluster

```bash
# Create ECS cluster
aws ecs create-cluster --cluster-name a64core-production

# Create task execution role (if not exists)
aws iam create-role --role-name ecsTaskExecutionRole \
  --assume-role-policy-document file://ecs-trust-policy.json
```

**ecs-trust-policy.json:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "ecs-tasks.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

#### 4. Create MongoDB on AWS

**Option A: MongoDB Atlas (Recommended)**
1. Go to https://www.mongodb.com/cloud/atlas
2. Create free tier cluster
3. Whitelist AWS IP ranges
4. Get connection string
5. Update environment variables

**Option B: Self-hosted on EC2**
1. Launch EC2 instance
2. Install MongoDB
3. Configure security groups
4. Set up backups

#### 5. Create Task Definition

Create `task-definition.json`:

```json
{
  "family": "a64core-app",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "2048",
  "executionRoleArn": "arn:aws:iam::YOUR_ACCOUNT_ID:role/ecsTaskExecutionRole",
  "containerDefinitions": [
    {
      "name": "nginx",
      "image": "YOUR_ACCOUNT_ID.dkr.ecr.YOUR_REGION.amazonaws.com/a64core/nginx:latest",
      "portMappings": [
        {
          "containerPort": 80,
          "protocol": "tcp"
        }
      ],
      "essential": true,
      "dependsOn": [
        {
          "containerName": "api",
          "condition": "START"
        },
        {
          "containerName": "user-portal",
          "condition": "START"
        }
      ]
    },
    {
      "name": "api",
      "image": "YOUR_ACCOUNT_ID.dkr.ecr.YOUR_REGION.amazonaws.com/a64core/api:latest",
      "portMappings": [
        {
          "containerPort": 5000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "MONGODB_URL",
          "value": "your-mongodb-connection-string"
        },
        {
          "name": "JWT_SECRET",
          "value": "your-jwt-secret"
        }
      ],
      "essential": true
    },
    {
      "name": "user-portal",
      "image": "YOUR_ACCOUNT_ID.dkr.ecr.YOUR_REGION.amazonaws.com/a64core/user-portal:latest",
      "portMappings": [
        {
          "containerPort": 5173,
          "protocol": "tcp"
        }
      ],
      "essential": true
    }
  ]
}
```

Register task definition:
```bash
aws ecs register-task-definition --cli-input-json file://task-definition.json
```

#### 6. Create Application Load Balancer

```bash
# Create security group for ALB
aws ec2 create-security-group \
  --group-name a64core-alb-sg \
  --description "Security group for A64 Core ALB" \
  --vpc-id YOUR_VPC_ID

# Allow HTTP/HTTPS
aws ec2 authorize-security-group-ingress \
  --group-id sg-xxxxxxxx \
  --protocol tcp --port 80 --cidr 0.0.0.0/0

aws ec2 authorize-security-group-ingress \
  --group-id sg-xxxxxxxx \
  --protocol tcp --port 443 --cidr 0.0.0.0/0

# Create ALB (use AWS Console for easier setup)
```

#### 7. Create ECS Service

```bash
aws ecs create-service \
  --cluster a64core-production \
  --service-name a64core-service \
  --task-definition a64core-app \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxxxx,subnet-yyyyy],securityGroups=[sg-xxxxx],assignPublicIp=ENABLED}" \
  --load-balancers targetGroupArn=arn:aws:elasticloadbalancing:...,containerName=nginx,containerPort=80
```

---

## Alternative: AWS EC2

### Step-by-Step EC2 Deployment

#### 1. Launch EC2 Instance

```bash
# Launch Ubuntu instance
aws ec2 run-instances \
  --image-id ami-0c55b159cbfafe1f0 \
  --instance-type t3.medium \
  --key-name YOUR_KEY_PAIR \
  --security-group-ids sg-xxxxx \
  --subnet-id subnet-xxxxx \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=A64Core}]'
```

**Instance Requirements:**
- **Type:** t3.medium or larger (2 vCPU, 4 GB RAM minimum)
- **Storage:** 30 GB SSD
- **OS:** Ubuntu 22.04 LTS

#### 2. Configure Security Group

Allow these ports:
- **22**: SSH (your IP only)
- **80**: HTTP (0.0.0.0/0)
- **443**: HTTPS (0.0.0.0/0)

#### 3. Connect to Instance

```bash
# SSH into instance
ssh -i your-key.pem ubuntu@YOUR_EC2_PUBLIC_IP
```

#### 4. Install Docker & Docker Compose

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker ubuntu

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/v2.23.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Verify
docker --version
docker-compose --version
```

#### 5. Install Git & Clone Repository

```bash
# Install Git
sudo apt install git -y

# Generate SSH key for GitHub
ssh-keygen -t ed25519 -C "your@email.com"

# Copy public key and add to GitHub
cat ~/.ssh/id_ed25519.pub
# Add this key to GitHub: Settings → SSH Keys → New SSH Key

# Clone repository
git clone git@github.com:yourusername/A64CorePlatform.git
cd A64CorePlatform
```

#### 6. Configure Environment Variables

```bash
# Create .env file
nano .env
```

**Add these variables:**
```bash
# MongoDB
MONGODB_URL=mongodb://localhost:27017/a64core_db

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-this
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# API
API_HOST=0.0.0.0
API_PORT=5000

# Frontend
VITE_API_URL=http://YOUR_DOMAIN_OR_IP/api/v1
```

#### 7. Start Application

```bash
# Build and start containers
docker-compose up -d --build

# Check status
docker-compose ps

# View logs
docker-compose logs -f
```

#### 8. Set Up Auto-Start on Boot

```bash
# Create systemd service
sudo nano /etc/systemd/system/a64core.service
```

**a64core.service:**
```ini
[Unit]
Description=A64 Core Platform
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/home/ubuntu/A64CorePlatform
ExecStart=/usr/local/bin/docker-compose up -d
ExecStop=/usr/local/bin/docker-compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
```

```bash
# Enable service
sudo systemctl enable a64core.service
sudo systemctl start a64core.service
```

---

## Database Configuration

### MongoDB Atlas (Recommended for Production)

1. **Create Atlas Account**
   - Go to https://www.mongodb.com/cloud/atlas
   - Create free tier cluster

2. **Configure Network Access**
   - Add AWS IP ranges
   - Or add `0.0.0.0/0` (less secure, but easier)

3. **Create Database User**
   - Username: `a64core_admin`
   - Password: Generate strong password
   - Role: Read and write to any database

4. **Get Connection String**
   ```
   mongodb+srv://a64core_admin:PASSWORD@cluster0.xxxxx.mongodb.net/a64core_db?retryWrites=true&w=majority
   ```

5. **Update Environment Variable**
   ```bash
   MONGODB_URL=mongodb+srv://a64core_admin:PASSWORD@cluster0.xxxxx.mongodb.net/a64core_db
   ```

### Self-Hosted MongoDB on EC2

**⚠️ Not Recommended for Production**

If you want to host MongoDB on the same EC2 instance:

```bash
# MongoDB is already in docker-compose.yml
# Just ensure it's running:
docker-compose ps mongodb
```

**Backup Strategy:**
```bash
# Create backup script
nano backup-mongodb.sh
```

```bash
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
docker exec mongodb mongodump --out=/data/backup_$DATE
```

```bash
chmod +x backup-mongodb.sh

# Add to crontab (daily backup)
crontab -e
# Add: 0 2 * * * /home/ubuntu/A64CorePlatform/backup-mongodb.sh
```

---

## Domain Configuration

### Step 1: Configure Route 53

```bash
# Create hosted zone
aws route53 create-hosted-zone --name yourdomain.com --caller-reference $(date +%s)
```

### Step 2: Update Domain Registrar

Copy the 4 nameservers from Route 53 and update them in your domain registrar (GoDaddy, Namecheap, etc.)

**Example nameservers:**
```
ns-1234.awsdns-12.org
ns-5678.awsdns-34.com
ns-9012.awsdns-56.net
ns-3456.awsdns-78.co.uk
```

### Step 3: Create DNS Records

**For ECS with ALB:**
```bash
# Get ALB DNS name
ALB_DNS=$(aws elbv2 describe-load-balancers --query 'LoadBalancers[0].DNSName' --output text)

# Create Route 53 alias record (use AWS Console or CLI)
```

**For EC2:**
```bash
# Get EC2 Elastic IP
EC2_IP=$(aws ec2 describe-addresses --query 'Addresses[0].PublicIp' --output text)

# Create A record pointing to EC2 IP
```

**Route 53 Records to Create:**

| Type | Name | Value |
|------|------|-------|
| A | yourdomain.com | ALB DNS or EC2 IP |
| A | www.yourdomain.com | ALB DNS or EC2 IP |
| CNAME | api.yourdomain.com | yourdomain.com |

---

## SSL/TLS Certificates

### Option 1: AWS Certificate Manager (For ALB)

```bash
# Request certificate
aws acm request-certificate \
  --domain-name yourdomain.com \
  --subject-alternative-names www.yourdomain.com api.yourdomain.com \
  --validation-method DNS
```

Validate certificate via DNS (AWS will provide CNAME records to add to Route 53)

### Option 2: Let's Encrypt (For EC2)

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# Get certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Auto-renewal
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
```

Update nginx configuration to use SSL:

```nginx
server {
    listen 443 ssl;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # Your existing configuration...
}
```

---

## Environment Variables

### Production .env Template

```bash
# =====================================
# MongoDB Configuration
# =====================================
MONGODB_URL=mongodb+srv://user:password@cluster.mongodb.net/a64core_db

# =====================================
# JWT Configuration
# =====================================
JWT_SECRET=<GENERATE_RANDOM_STRING_64_CHARS>
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7

# =====================================
# API Configuration
# =====================================
API_HOST=0.0.0.0
API_PORT=5000
API_URL=https://yourdomain.com/api/v1

# =====================================
# Frontend Configuration
# =====================================
VITE_API_URL=https://yourdomain.com/api/v1

# =====================================
# CORS Configuration
# =====================================
CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# =====================================
# Email Configuration (Optional)
# =====================================
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@email.com
SMTP_PASSWORD=your-app-password

# =====================================
# AWS Configuration (Optional)
# =====================================
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret

# =====================================
# Monitoring (Optional)
# =====================================
SENTRY_DSN=https://your-sentry-dsn
NEW_RELIC_LICENSE_KEY=your-license-key
```

### Generate Secure Secrets

```bash
# Generate JWT secret (64 characters)
openssl rand -base64 48

# Generate random password
openssl rand -base64 32
```

---

## Monitoring & Logging

### CloudWatch (For ECS)

Logs automatically sent to CloudWatch. View them:

```bash
aws logs tail /ecs/a64core-app --follow
```

### EC2 Logging

```bash
# View application logs
docker-compose logs -f

# View nginx logs
docker-compose logs nginx

# View API logs
docker-compose logs api
```

### Install CloudWatch Agent (EC2)

```bash
wget https://s3.amazonaws.com/amazoncloudwatch-agent/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb
sudo dpkg -i amazon-cloudwatch-agent.deb
```

---

## Cost Estimation

### ECS Fargate Option

| Resource | Specs | Monthly Cost |
|----------|-------|--------------|
| ECS Fargate | 1 vCPU, 2 GB | ~$30 |
| Application Load Balancer | - | ~$20 |
| MongoDB Atlas | Free tier | $0 |
| Route 53 | Hosted zone | $0.50 |
| Data Transfer | 10 GB/month | ~$1 |
| **Total** | | **~$51.50/month** |

### EC2 Option

| Resource | Specs | Monthly Cost |
|----------|-------|--------------|
| EC2 t3.medium | 2 vCPU, 4 GB RAM | ~$30 |
| Elastic IP | 1 IP | $0 (if attached) |
| EBS Storage | 30 GB SSD | ~$3 |
| MongoDB Atlas | Free tier | $0 |
| Route 53 | Hosted zone | $0.50 |
| Data Transfer | 10 GB/month | ~$1 |
| **Total** | | **~$34.50/month** |

---

## Quick Start Checklist

### Pre-Deployment
- [ ] All code committed to git repository
- [ ] Environment variables prepared
- [ ] AWS account configured
- [ ] Domain purchased
- [ ] Choose deployment method (ECS or EC2)

### EC2 Deployment (Quickest)
- [ ] Launch EC2 instance
- [ ] Configure security groups
- [ ] Install Docker & Docker Compose
- [ ] Clone repository
- [ ] Create .env file
- [ ] Run `docker-compose up -d --build`
- [ ] Configure domain DNS
- [ ] Set up SSL with Let's Encrypt
- [ ] Test application

### ECS Deployment (Production)
- [ ] Create ECR repositories
- [ ] Build and push Docker images
- [ ] Create ECS cluster
- [ ] Set up MongoDB Atlas
- [ ] Create task definition
- [ ] Create Application Load Balancer
- [ ] Create ECS service
- [ ] Configure Route 53
- [ ] Request SSL certificate
- [ ] Test application

---

## Troubleshooting

### Container Won't Start
```bash
# Check logs
docker-compose logs container-name

# Check if ports are in use
sudo netstat -tulpn | grep :80
```

### Database Connection Issues
```bash
# Test MongoDB connection
docker exec -it mongodb mongosh
# Or from API container:
docker exec -it a64core-api-dev python -c "from pymongo import MongoClient; client = MongoClient('mongodb://localhost:27017'); print(client.server_info())"
```

### Domain Not Resolving
```bash
# Check DNS propagation
nslookup yourdomain.com

# Check Route 53 records
aws route53 list-resource-record-sets --hosted-zone-id YOUR_ZONE_ID
```

---

## Next Steps

1. **Choose Deployment Method**: ECS (production) or EC2 (simpler)
2. **Follow Step-by-Step Guide** above
3. **Configure Domain** after deployment
4. **Set up SSL** for HTTPS
5. **Test Application** thoroughly
6. **Set up Monitoring** (CloudWatch)
7. **Configure Backups** for MongoDB

---

## Support Resources

- **AWS Documentation**: https://docs.aws.amazon.com/
- **Docker Documentation**: https://docs.docker.com/
- **MongoDB Atlas**: https://docs.atlas.mongodb.com/
- **Let's Encrypt**: https://letsencrypt.org/docs/

---

**Ready to deploy? Let me know which option you'd like to proceed with (ECS or EC2), and I'll guide you through each step!** 🚀
