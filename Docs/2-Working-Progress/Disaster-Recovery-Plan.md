# Disaster Recovery Plan (DRP)

**Document Status:** TEMPLATE - Requires organizational review, testing, and approval
**Last Updated:** 2026-02-04
**Owner:** [Assign responsible person]
**Review Cycle:** Quarterly
**Next DR Test:** [Schedule date]

---

## 1. Overview

### 1.1 Purpose

This document defines the procedures for recovering the A64 Core Platform from various disaster scenarios, ensuring business continuity with minimal data loss and downtime.

### 1.2 Recovery Objectives

| Metric | Target | Description |
|--------|--------|-------------|
| **RTO** (Recovery Time Objective) | 4 hours | Maximum acceptable downtime |
| **RPO** (Recovery Point Objective) | 1 hour | Maximum acceptable data loss |
| **MTTR** (Mean Time to Recover) | 2 hours | Average expected recovery time |

### 1.3 Scope

This plan covers:
- A64 Core Platform (API, Frontend, Database, Cache)
- Supporting services (Nginx, Cron, Backup)
- Deployment infrastructure (Docker, VM)

---

## 2. Contact Information

| Role | Name | Phone | Email | Escalation |
|------|------|-------|-------|------------|
| Primary On-Call | [Name] | [Phone] | [Email] | First responder |
| Platform Lead | [Name] | [Phone] | [Email] | 15 min escalation |
| Infrastructure | [Name] | [Phone] | [Email] | Infrastructure issues |
| Management | [Name] | [Phone] | [Email] | 1 hour escalation |

---

## 3. Disaster Scenarios & Runbooks

### 3.1 Scenario: Database Failure (MongoDB)

**Symptoms:** API returns 500 errors, "connection refused" in logs, MongoDB container unhealthy
**Impact:** CRITICAL - All platform operations affected
**Estimated Recovery:** 30-60 minutes

**Runbook:**

```bash
# Step 1: Assess the situation
ssh -i a64-platform-key.pem ubuntu@a64core.com
cd ~/A64CorePlatform

# Step 2: Check MongoDB container status
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps mongodb
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --tail 50 mongodb

# Step 3: Attempt restart
docker compose -f docker-compose.yml -f docker-compose.prod.yml restart mongodb

# Step 4: Wait for health check (up to 60 seconds)
sleep 60
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps mongodb

# Step 5: If restart fails, check data volume
docker volume inspect a64coreplatform_mongodb_data

# Step 6: If data is corrupted, restore from backup
# Find latest backup
ls -la /backups/mongodb/ | tail -5

# Restore (see Section 4 for detailed restore procedure)
bash scripts/backup/mongodb_restore.sh /backups/mongodb/LATEST_BACKUP_DIR

# Step 7: Restart dependent services
docker compose -f docker-compose.yml -f docker-compose.prod.yml restart api cron

# Step 8: Verify platform health
curl -s https://a64core.com/api/health | jq .
```

### 3.2 Scenario: Server/VM Failure

**Symptoms:** SSH connection refused, website unreachable, monitoring alerts
**Impact:** CRITICAL - Complete platform outage
**Estimated Recovery:** 1-4 hours

**Runbook:**

```bash
# Step 1: Verify server is unreachable
ping a64core.com
ssh -i a64-platform-key.pem ubuntu@a64core.com

# Step 2: Check cloud provider console
# - Log into Azure/AWS console
# - Check VM status, recent events
# - Check if VM can be restarted

# Step 3: If VM can restart
# - Restart via cloud console
# - Wait for SSH access
# - Verify Docker services start automatically (restart: always)

# Step 4: If VM is unrecoverable - provision new VM
# a) Launch new VM (same spec: Ubuntu 22.04, Docker installed)
# b) Update DNS for a64core.com to new IP
# c) Clone repository:
git clone https://github.com/[org]/A64CorePlatform.git
cd A64CorePlatform

# d) Restore environment files:
# - Copy .env from secure backup
# - Copy SSL certificates or re-issue via certbot

# e) Restore database from off-site backup
# f) Start services:
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# g) Verify:
curl -s https://a64core.com/api/health
```

### 3.3 Scenario: Data Corruption

**Symptoms:** Inconsistent data in UI, API returns unexpected values, validation errors
**Impact:** HIGH - Data integrity compromised
**Estimated Recovery:** 1-2 hours

**Runbook:**

```bash
# Step 1: Identify scope of corruption
# Connect to MongoDB and investigate
mongosh --eval "
  db.getSiblingDB('a64core_db').getCollectionNames().forEach(c => {
    print(c + ': ' + db.getSiblingDB('a64core_db')[c].countDocuments())
  })
" mongodb://localhost:27017 --quiet

# Step 2: Stop writes to prevent further corruption
docker compose -f docker-compose.yml -f docker-compose.prod.yml stop api cron

# Step 3: Create a snapshot of current (corrupted) state
mongodump --gzip --out /backups/mongodb/corrupted_$(date +%Y%m%d_%H%M%S) \
  --uri="mongodb://localhost:27017/a64core_db"

# Step 4: Identify the last known good backup
ls -la /backups/mongodb/

# Step 5: Restore from last good backup
bash scripts/backup/mongodb_restore.sh /backups/mongodb/LAST_GOOD_BACKUP --yes

# Step 6: Restart services
docker compose -f docker-compose.yml -f docker-compose.prod.yml start api cron

# Step 7: Verify data integrity
curl -s https://a64core.com/api/v1/farm/farms -H "Authorization: Bearer TOKEN" | jq .
```

### 3.4 Scenario: Security Incident / Cyber Attack

**Symptoms:** Unusual activity in logs, unauthorized access, data exfiltration indicators
**Impact:** CRITICAL - Security breach
**Estimated Recovery:** 4-24 hours (depending on severity)

**Runbook:**

```bash
# Step 1: CONTAIN - Isolate the system
# Option A: Block all traffic except your IP
# Update security group / firewall rules immediately

# Option B: If severity is extreme, shut down
docker compose -f docker-compose.yml -f docker-compose.prod.yml down

# Step 2: PRESERVE - Collect evidence before making changes
# Save logs
cp -r logs/ /tmp/incident_$(date +%Y%m%d)/
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs > /tmp/incident_$(date +%Y%m%d)/docker.log

# Save current database state
mongodump --gzip --out /tmp/incident_$(date +%Y%m%d)/db_snapshot

# Step 3: INVESTIGATE
# Check access logs for suspicious activity
grep -i "401\|403\|500" logs/nginx/access.log | tail -100

# Check for unauthorized users
mongosh --eval "db.getSiblingDB('a64core_db').users.find({}, {email:1, role:1, lastLogin:1})" \
  mongodb://localhost:27017 --quiet

# Step 4: ERADICATE
# - Rotate ALL secrets (SECRET_KEY, MONGO passwords, REDIS password, API keys)
# - Revoke all active sessions (clear Redis)
# - Force password reset for all users
# - Update SSL certificates if compromised
# - Patch any identified vulnerability

# Step 5: RECOVER
# - Restore from last known clean backup if needed
# - Redeploy with rotated credentials
# - Re-enable services one by one
# - Monitor closely for 48 hours

# Step 6: REPORT
# - Document timeline of events
# - Notify affected parties as required
# - File incident report
# - Update security controls based on lessons learned
```

---

## 4. Database Restore Procedure

### 4.1 Prerequisites

- SSH access to the server
- Backup file location known
- MongoDB container running

### 4.2 Step-by-Step Restore

```bash
# 1. Stop API to prevent writes during restore
docker compose -f docker-compose.yml -f docker-compose.prod.yml stop api cron

# 2. List available backups
ls -la /backups/mongodb/

# 3. Verify backup integrity (check file sizes are non-zero)
du -sh /backups/mongodb/TARGET_BACKUP/

# 4. Run restore script
bash scripts/backup/mongodb_restore.sh /backups/mongodb/TARGET_BACKUP

# 5. Restart services
docker compose -f docker-compose.yml -f docker-compose.prod.yml start api cron

# 6. Verify restore
curl -s https://a64core.com/api/health
mongosh --eval "db.getSiblingDB('a64core_db').getCollectionNames()" \
  mongodb://localhost:27017 --quiet
```

### 4.3 Post-Restore Verification

- [ ] API health check returns 200
- [ ] Login works for known user accounts
- [ ] Farm data is present and consistent
- [ ] Recent data matches expected state (check timestamps)
- [ ] No error spikes in API logs

---

## 5. Backup Strategy

### 5.1 Current Backup Configuration

| Type | Schedule | Retention | Storage |
|------|----------|-----------|---------|
| Daily full backup | 2:00 AM UTC | 7 days | Local volume |
| Weekly backup | Sunday 2:00 AM UTC | 4 weeks | Local volume |
| Monthly backup | 1st of month | 3 months | Local volume |

### 5.2 RPO Compliance

- **Target RPO:** 1 hour
- **Current RPO:** 24 hours (daily backups)
- **Gap:** Need to implement more frequent backups or MongoDB oplog-based continuous backup
- **Recommended:** Reduce backup interval to every 6 hours for CRITICAL data, or implement MongoDB Change Streams for near-real-time replication

### 5.3 Backup Verification

Monthly verification procedure:
1. Restore latest backup to a test database
2. Run data integrity checks
3. Compare record counts with production
4. Document results in DR test log

---

## 6. Communication Plan

### 6.1 Internal Communication

| Timeframe | Action | Channel |
|-----------|--------|---------|
| 0-15 min | Acknowledge incident | Team chat / phone |
| 15-30 min | Initial assessment shared | Email to stakeholders |
| Every 30 min | Status updates | Team chat |
| Resolution | All-clear notification | Email + team chat |
| +24 hours | Post-incident report | Email to all stakeholders |

### 6.2 External Communication

| Timeframe | Action | Audience |
|-----------|--------|----------|
| 0-30 min | Status page updated | All users |
| 1 hour | Email notification (if extended) | Affected customers |
| Resolution | Service restored notification | All users |
| +48 hours | Root cause analysis shared | Key customers |

---

## 7. DR Testing Schedule

| Quarter | Test Type | Scope | Expected Duration |
|---------|-----------|-------|-------------------|
| Q1 | Tabletop exercise | All scenarios reviewed | 2 hours |
| Q2 | Database restore test | Restore from backup to test env | 1 hour |
| Q3 | Failover simulation | Full platform recovery on new VM | 4 hours |
| Q4 | Full DR drill | End-to-end recovery including comms | 4 hours |

### 7.1 DR Test Checklist

- [ ] Notify all participants 1 week in advance
- [ ] Ensure recent backup is available
- [ ] Prepare test environment (if applicable)
- [ ] Document start time
- [ ] Execute recovery procedures
- [ ] Measure actual RTO and RPO achieved
- [ ] Document all issues encountered
- [ ] Update this plan based on findings
- [ ] Share results with stakeholders

---

## 8. Document History

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2026-02-04 | 1.0 | [Author] | Initial template created |

---

## 9. Document Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Platform Owner | | | |
| Operations Lead | | | |
| IT Security | | | |
| Management | | | |
