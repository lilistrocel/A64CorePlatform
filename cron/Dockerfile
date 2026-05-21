FROM alpine:3.19

# Install required packages including Python 3 for the outbox reconciler sweeper.
# curl + bash are kept for the existing harvest-aggregation and expiry-inventory scripts.
RUN apk add --no-cache \
    curl \
    tzdata \
    bash \
    python3 \
    py3-pip

# Install Python dependencies for the outbox reconciler.
# motor provides async MongoDB access; pydantic is required by the contracts package.
# --break-system-packages is required on Alpine 3.19 (PEP 668).
RUN pip3 install --no-cache-dir --break-system-packages \
    "motor>=3.3,<4" \
    "pydantic>=2.8,<3"

# Set timezone to UTC (11 PM UTC)
ENV TZ=UTC

# Copy cron job configuration
COPY crontab /etc/crontabs/root

# Copy aggregation script
COPY run-harvest-aggregation.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/run-harvest-aggregation.sh

# Copy expiry inventory script
COPY run-expiry-inventory.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/run-expiry-inventory.sh

# Copy outbox reconciler entry-point script
COPY run-outbox-reconciler.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/run-outbox-reconciler.sh

# Create log directory
RUN mkdir -p /var/log/cron

# Start cron in foreground
CMD ["crond", "-f", "-l", "2"]
