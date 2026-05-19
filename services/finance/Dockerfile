FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install contracts package first (shared schemas — must come before finance install)
COPY contracts/ /app/contracts/
RUN pip install --no-cache-dir -e /app/contracts

# Copy project metadata first for layer caching
COPY services/finance/pyproject.toml ./pyproject.toml

# Install dependencies
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir \
        fastapi==0.111.1 \
        "uvicorn[standard]==0.30.1" \
        sqlalchemy==2.0.31 \
        asyncmy==0.2.9 \
        pymysql==1.1.1 \
        alembic==1.13.2 \
        "python-jose[cryptography]==3.3.0" \
        pydantic==2.8.2 \
        pydantic-settings==2.3.4 \
        email-validator==2.2.0 \
        httpx==0.27.0 \
        pytest==8.3.2 \
        pytest-asyncio==0.23.8 \
        pytest-mock==3.14.0 \
        aiosqlite==0.20.0

# Copy application source
COPY services/finance/src/ ./src/
COPY services/finance/alembic/ ./alembic/
COPY services/finance/alembic.ini ./

# Make the finance package importable as a top-level module
ENV PYTHONPATH=/app/src

# Run as non-root user
RUN adduser --disabled-password --gecos "" financeuser && \
    chown -R financeuser:financeuser /app
USER financeuser

# Expose port
EXPOSE 8001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:8001/api/v1/finance/health || exit 1

# Start finance service as module
CMD ["python", "-m", "uvicorn", "finance.main:app", \
     "--host", "0.0.0.0", "--port", "8001", \
     "--workers", "1", "--log-level", "info"]
