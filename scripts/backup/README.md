# MongoDB Backup & Restore Guide

## Overview

The A64 Core Platform uses automated MongoDB backups with a tiered retention policy to ensure data durability and compliance with Recovery Point Objective (RPO) requirements.

## Backup Schedule & Retention Policy

### Automated Schedule
- **Frequency:** Daily at 2:00 AM UTC
- **Compression:** Gzip compression enabled (typically 70-80% size reduction)
- **Location:** `/backups/mongodb/` with timestamped directories

### Retention Policy
The backup system maintains three tiers of backups:

1. **Daily Backups:** Last 7 days
   - Created every day
   - Automatically cleaned after 7 days
   - Use for recent data recovery

2. **Weekly Backups:** Last 4 weeks
   - Created every Sunday
   - Automatically cleaned after 4 weeks
   - Use for medium-term recovery

3. **Monthly Backups:** Last 3 months
   - Created on the 1st of each month
   - Automatically cleaned after 3 months
   - Use for long-term recovery and compliance

### RPO Compliance
- **Target RPO:** 24 hours
- **Achieved RPO:** 24 hours (daily backups at 2 AM UTC)
- **Worst-case data loss:** Maximum 24 hours of data

## Environment Variables

The backup scripts require the following environment variables:

### Required
- `MONGO_HOST` - MongoDB hostname (default: `mongodb`)
- `MONGO_PORT` - MongoDB port (default: `27017`)
- `MONGO_DB` - Database name (default: `a64core_db`)

### Optional (for authentication)
- `MONGO_USER` - MongoDB username
- `MONGO_PASSWORD` - MongoDB password
- `MONGO_AUTH_DB` - Authentication database (default: `admin`)

### Retention Configuration
- `BACKUP_RETENTION_DAILY` - Number of daily backups to keep (default: `7`)
- `BACKUP_RETENTION_WEEKLY` - Number of weekly backups to keep (default: `4`)
- `BACKUP_RETENTION_MONTHLY` - Number of monthly backups to keep (default: `3`)

### Logging
- `LOG_FILE` - Log file path (default: `/var/log/backup/mongodb_backup.log`)
- `BACKUP_DIR` - Backup directory (default: `/backups/mongodb`)

## Manual Backup

### Using Docker Compose

**Start the backup service (if not running):**
```bash
docker compose --profile backup up -d backup
```

**Trigger immediate backup:**
```bash
docker compose exec backup /scripts/mongodb_backup.sh
```

**View backup logs:**
```bash
docker compose exec backup tail -f /var/log/backup/mongodb_backup.log
```

### Direct Script Execution

**From host machine:**
```bash
# Set environment variables
export MONGO_HOST=localhost
export MONGO_PORT=27017
export MONGO_DB=a64core_db
export BACKUP_DIR=/path/to/backups

# Run backup script
bash scripts/backup/mongodb_backup.sh
```

## Restore Procedure

### Step-by-Step Restore

**1. List available backups:**
```bash
docker compose exec backup ls -lh /backups/mongodb/
```

Expected output:
```
drwxr-xr-x 3 root root 4.0K Nov 01 14:30 2025-11-01_14-30-00
drwxr-xr-x 3 root root 4.0K Nov 02 02:00 2025-11-02_02-00-00
drwxr-xr-x 3 root root 4.0K Nov 03 02:00 2025-11-03_02-00-00
```

**2. Identify backup type (optional):**
```bash
# Check if it's a daily, weekly, or monthly backup
docker compose exec backup ls -la /backups/mongodb/2025-11-01_14-30-00/

# Look for marker files: .daily, .weekly, or .monthly
```

**3. Restore from backup:**

⚠️ **WARNING:** This will REPLACE all data in the database!

**Interactive restore (with confirmation prompt):**
```bash
docker compose exec backup /scripts/mongodb_restore.sh /backups/mongodb/2025-11-01_14-30-00
```

**Non-interactive restore (no confirmation):**
```bash
docker compose exec backup /scripts/mongodb_restore.sh /backups/mongodb/2025-11-01_14-30-00 --yes
```

**4. Verify restore:**
```bash
# Check restore logs
docker compose exec backup tail -50 /var/log/backup/mongodb_restore.log

# Verify data in MongoDB
docker compose exec mongodb mongosh a64core_db --eval "db.getCollectionNames()"
```

### Restore from Remote Backup

If backups are stored remotely (S3, NFS, etc.), copy them to the backup volume first:

```bash
# Example: Copy from S3
aws s3 cp s3://a64-backups/mongodb/2025-11-01_14-30-00/ /path/to/backup/volume/ --recursive

# Then restore as usual
docker compose exec backup /scripts/mongodb_restore.sh /backups/mongodb/2025-11-01_14-30-00
```

## Verification Steps

### After Backup

**1. Check backup was created:**
```bash
docker compose exec backup ls -lh /backups/mongodb/ | tail -5
```

**2. Verify backup contents:**
```bash
BACKUP_PATH=/backups/mongodb/2025-11-01_14-30-00  # Use actual timestamp
docker compose exec backup ls -lh ${BACKUP_PATH}/a64core_db/
```

Expected output should show `.bson.gz` and `.metadata.json.gz` files for each collection.

**3. Check backup size:**
```bash
docker compose exec backup du -sh /backups/mongodb/2025-11-01_14-30-00
```

**4. Verify compression:**
```bash
# Count .gz files (should match number of collections)
docker compose exec backup find /backups/mongodb/2025-11-01_14-30-00 -name "*.gz" | wc -l
```

### After Restore

**1. Check collection count:**
```bash
docker compose exec mongodb mongosh a64core_db --quiet --eval "db.getCollectionNames().length"
```

**2. Verify sample data:**
```bash
# Example: Check users collection
docker compose exec mongodb mongosh a64core_db --quiet --eval "db.users.countDocuments()"

# Example: Verify specific record
docker compose exec mongodb mongosh a64core_db --quiet --eval "db.users.findOne({email: 'admin@a64platform.com'})"
```

**3. Test application:**
```bash
# Restart API to ensure it connects properly
docker compose restart api

# Check API health
curl http://localhost/api/health
```

**4. Verify logs for errors:**
```bash
docker compose logs --tail 50 api
docker compose logs --tail 50 mongodb
```

## Backup Storage Requirements

### Estimation
- **Uncompressed database size:** Check with `db.stats().dataSize` in mongosh
- **Compressed backup size:** Typically 20-30% of uncompressed size
- **Storage calculation:**
  - Daily: 7 backups × compressed_size
  - Weekly: 4 backups × compressed_size
  - Monthly: 3 backups × compressed_size
  - **Total:** ~14 × compressed_size (approximately)

### Example
For a 10 GB database:
- Compressed backup: ~2-3 GB
- Daily storage: 7 × 3 GB = 21 GB
- Weekly storage: 4 × 3 GB = 12 GB
- Monthly storage: 3 × 3 GB = 9 GB
- **Total required:** ~42 GB (with safety margin: 50 GB)

## Monitoring & Alerts

### Check Backup Service Status
```bash
docker compose ps backup
```

### View Recent Backup Logs
```bash
docker compose exec backup tail -100 /var/log/backup/mongodb_backup.log
```

### Check for Failed Backups
```bash
docker compose exec backup grep "ERROR" /var/log/backup/mongodb_backup.log
```

### Set Up Alerts (Recommended)
Integrate with your monitoring system to alert on:
- Backup failures (check exit code or ERROR in logs)
- Missing backups (no backup created in last 25 hours)
- Storage space warnings (backup volume >80% full)
- Restore operation attempts (for audit purposes)

## Troubleshooting

### Backup Fails with "Connection Refused"
**Problem:** Cannot connect to MongoDB.

**Solution:**
```bash
# Verify MongoDB is running
docker compose ps mongodb

# Check network connectivity
docker compose exec backup ping -c 3 mongodb

# Verify MONGO_HOST environment variable
docker compose exec backup env | grep MONGO_
```

### Backup Fails with "Authentication Failed"
**Problem:** Invalid credentials.

**Solution:**
```bash
# Verify credentials are set
docker compose exec backup env | grep MONGO_USER
docker compose exec backup env | grep MONGO_PASSWORD

# Test MongoDB connection manually
docker compose exec mongodb mongosh -u ${MONGO_USER} -p ${MONGO_PASSWORD} --authenticationDatabase admin
```

### Restore Fails with "Database Not Found"
**Problem:** Backup structure is incorrect.

**Solution:**
```bash
# Check backup structure
docker compose exec backup ls -la /backups/mongodb/2025-11-01_14-30-00/

# Should contain: a64core_db/ directory with .bson.gz files
# If missing, the backup may be corrupted or incomplete
```

### "No Space Left on Device"
**Problem:** Backup volume is full.

**Solution:**
```bash
# Check disk usage
docker compose exec backup df -h /backups

# Manually clean old backups (use with caution)
docker compose exec backup rm -rf /backups/mongodb/2025-10-01_*

# Or adjust retention policy to keep fewer backups
```

## Best Practices

1. **Test restores regularly:** Verify backups are valid by performing test restores monthly
2. **Monitor backup success:** Set up alerts for failed backups
3. **Off-site backups:** Copy backups to remote storage (S3, NFS) for disaster recovery
4. **Document restore procedures:** Ensure team members know how to restore data
5. **Verify after restore:** Always check data integrity after restoring
6. **Maintain backup logs:** Keep logs for audit and troubleshooting purposes
7. **Security:** Encrypt backups if stored on remote/untrusted systems
8. **Access control:** Restrict access to backup files (sensitive data)

## Emergency Recovery Contacts

- **Primary:** DevOps Team - devops@a64platform.com
- **Secondary:** Database Administrator - dba@a64platform.com
- **Emergency:** On-call rotation - See PagerDuty

## References

- [MongoDB mongodump Documentation](https://www.mongodb.com/docs/database-tools/mongodump/)
- [MongoDB mongorestore Documentation](https://www.mongodb.com/docs/database-tools/mongorestore/)
- [A64 Core Platform System Architecture](/home/noobcity/Code/A64CorePlatform/Docs/1-Main-Documentation/System-Architecture.md)
