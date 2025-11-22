FROM alpine:3.19

# Install required packages
RUN apk add --no-cache \
    curl \
    tzdata \
    bash

# Set timezone to UTC (11 PM UTC)
ENV TZ=UTC

# Copy cron job configuration
COPY crontab /etc/crontabs/root

# Copy aggregation script
COPY run-harvest-aggregation.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/run-harvest-aggregation.sh

# Create log directory
RUN mkdir -p /var/log/cron

# Start cron in foreground
CMD ["crond", "-f", "-l", "2"]
