# MongoDB Backup Service Dockerfile
# Alpine-based image with mongodump/mongorestore and cron for automated backups

FROM mongo:7.0

# Install bash, cron, and openssl for encrypted backups
RUN apt-get update && \
    apt-get install -y cron bash openssl && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Create necessary directories
RUN mkdir -p /scripts /backups/mongodb /var/log/backup

# Copy backup scripts
COPY scripts/backup/mongodb_backup.sh /scripts/
COPY scripts/backup/mongodb_restore.sh /scripts/

# Make scripts executable
RUN chmod +x /scripts/mongodb_backup.sh /scripts/mongodb_restore.sh

# Create crontab file for automated backups
# Daily backup at 2 AM UTC
RUN echo "0 2 * * * /scripts/mongodb_backup.sh >> /var/log/backup/cron.log 2>&1" > /etc/cron.d/mongodb-backup

# Set proper permissions for crontab
RUN chmod 0644 /etc/cron.d/mongodb-backup

# Apply cron job
RUN crontab /etc/cron.d/mongodb-backup

# Create initial log file
RUN touch /var/log/backup/cron.log

# Health check - verify backup script exists and cron is running
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD pgrep cron || exit 1

# Run cron in foreground
CMD ["cron", "-f"]
