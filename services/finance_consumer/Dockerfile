FROM python:3.11-slim

LABEL maintainer="A64 Platform <dev@a64core.com>"
LABEL description="Finance outbox consumer worker"

# Prevents Python from writing pyc files and enables unbuffered stdout
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install contracts package first (shared schemas — must precede consumer install)
COPY contracts/ /app/contracts/
RUN pip install --no-cache-dir -e /app/contracts

# Install consumer runtime dependencies explicitly
# (avoids pip trying to re-resolve the file:/// contracts dep)
RUN pip install --no-cache-dir \
    motor==3.6.0 \
    pymongo==4.9.2 \
    httpx==0.27.0 \
    pydantic-settings==2.3.4

# Copy consumer source and install as an editable package
COPY services/finance_consumer/pyproject.toml /app/consumer/pyproject.toml
COPY services/finance_consumer/src/ /app/consumer/src/
RUN pip install --no-cache-dir --no-deps -e /app/consumer

# Copy scripts (demo publish, etc.)
COPY services/finance_consumer/scripts/ /app/consumer/scripts/

# PYTHONPATH so "python -m consumer.main" resolves the consumer package
ENV PYTHONPATH=/app/consumer/src

CMD ["python", "-m", "consumer.main"]
