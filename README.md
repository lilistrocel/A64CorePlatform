# A64 Core Platform

A comprehensive web application platform built with Python FastAPI, Node.js, MongoDB, and MySQL for API management and embedded systems integration.

## Table of Contents
- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [API Documentation](#api-documentation)
- [Database Management](#database-management)
- [Testing](#testing)
- [Contributing](#contributing)
- [License](#license)

## Overview

A64 Core Platform is a modern, scalable API hub designed to handle web applications and embedded systems integration. Built with a dual-database architecture (MongoDB and MySQL) to provide flexibility for different data types and use cases.

## Features

- **FastAPI Backend** - High-performance async Python API
- **MongoDB** - Primary datastore for the platform. (MySQL is used only by the optional finance service, not by the main API.)
- **Docker Containerization** - Consistent development and production environments
- **Auto-Generated API Docs** - Swagger UI and ReDoc included
- **Health Monitoring** - Built-in health check and readiness endpoints
- **Type Safety** - Full Python type hints and Pydantic validation
- **Database UI** - Adminer interface for database management

## Tech Stack

### Backend
- **Python 3.11** - Core programming language
- **FastAPI 0.128.0** - Web framework
- **Uvicorn** - ASGI server
- **Pydantic** - Data validation

### Databases
- **MongoDB 7.0** - NoSQL database
- **MySQL 8.0** - Relational database

### DevOps
- **Docker** - Containerization
- **Docker Compose** - Multi-container orchestration

### Development Tools
- **Black** - Code formatting
- **Flake8** - Linting
- **MyPy** - Type checking
- **Pytest** - Testing framework

## Prerequisites

Before you begin, ensure you have the following installed:
- **Docker** (version 20.10 or higher)
- **Docker Compose** (version 2.0 or higher)
- **Git** (for version control)

Optional for local development without Docker:
- **Python 3.11+**
- **MongoDB 7.0+**
- **MySQL 8.0+**

## Quick Start

### Using Docker (Recommended)

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd A64CorePlatform
   ```

2. **Create environment file**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` file with your configuration if needed.

3. **Start the services**
   ```bash
   docker compose up -d
   docker compose ps mongodb   # wait for healthy
   ```

4. **Initiate the MongoDB replica set — REQUIRED, once per machine**

   MongoDB runs with `--replSet rs0` and the API connects with
   `?replicaSet=rs0`. Until this runs, every database call times out, the API
   serves HTTP with a degraded database, and no admin account is ever created.

   ```bash
   docker exec <prefix>-mongodb-1 mongosh --quiet --eval \
     'rs.initiate({_id:"rs0", members:[{_id:0, host:"mongodb:27017"}]})'
   docker compose restart api
   ```

   Find `<prefix>` with `docker ps --format '{{.Names}}'` — it derives from your
   directory name.

5. **Verify installation**

   Check the response **body**, not the container health status: the health
   endpoint returns HTTP 200 with `"status": "degraded"` when the database is
   down, so the container can report *healthy* on a dead database.

   ```bash
   curl -s http://localhost/api/health
   # want: {"status":"healthy","database":"connected","redis":"connected"}
   ```

   - App: http://localhost/
   - API Docs: http://localhost/api/docs

> **New machine?** See
> [`Docs/1-Main-Documentation/Local-Development-Setup.md`](Docs/1-Main-Documentation/Local-Development-Setup.md)
> for the full walkthrough, including the `.env` values that matter and the
> traps worth knowing before you hit them.
   - Database UI (Adminer): http://localhost:8080

5. **View logs**
   ```bash
   docker-compose logs -f api
   ```

6. **Stop the services**
   ```bash
   docker-compose down
   ```

## Development Setup

### Local Development (Without Docker)

1. **Create virtual environment**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your local database connections.

4. **Run the application**
   ```bash
   cd src
   python main.py
   ```
   Or using uvicorn directly:
   ```bash
   uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
   ```

### Development with Docker

`src/` is bind-mounted into the api container, so your edits are visible inside
it immediately — but **the api container does NOT hot-reload**. Its `CMD` runs
plain uvicorn with no `--reload` flag, so a Python change is not picked up until
you restart:

```bash
docker restart <prefix>-api-1
```

Restart *immediately before verifying*, not merely after editing — a stale
process serves old code while the files on disk look correct, which has produced
false "verified" results. Find `<prefix>` with `docker ps --format '{{.Names}}'`.

The frontend (Vite) **does** hot-reload and needs no restart.

## Project Structure

```
A64CorePlatform/
├── src/                        # Source code
│   ├── main.py                # Application entry point
│   ├── api/                   # API routes and endpoints
│   │   ├── routes.py         # Route consolidation
│   │   └── health.py         # Health check endpoints
│   ├── config/               # Configuration management
│   │   └── settings.py       # Environment settings
│   ├── models/               # Database models
│   ├── controllers/          # Business logic
│   ├── services/             # Service layer
│   ├── middleware/           # Custom middleware
│   └── utils/                # Utility functions
├── tests/                    # Test files
├── config/                   # Configuration files
├── Docs/                     # Documentation
│   ├── 1-Main-Documentation/ # Core documentation
│   ├── 2-Working-Progress/   # Development status
│   └── 3-DevLog/            # Development logs
├── Dockerfile               # Docker image definition
├── docker-compose.yml       # Docker services configuration
├── requirements.txt         # Python dependencies
├── .env.example            # Environment template
├── .gitignore              # Git ignore rules
├── CLAUDE.md               # Development guidelines
├── DEPLOYMENT.md           # Deployment instructions
└── README.md               # This file
```

## API Documentation

### Automatic Documentation

FastAPI automatically generates interactive API documentation:

- **Swagger UI**: http://localhost:8000/api/docs
  - Interactive API testing interface
  - Try out endpoints directly from browser

- **ReDoc**: http://localhost:8000/api/redoc
  - Clean, responsive API documentation
  - Better for reading and sharing

### Available Endpoints

#### Root
- `GET /` - API information and links

#### Health
- `GET /api/health` - Health check status
- `GET /api/ready` - Readiness check with service status

#### API v1
- `GET /api/v1/...` - Version 1 endpoints (to be implemented)

## Database Management

### Adminer UI

Access the database management interface at http://localhost:8080

**MongoDB Connection:**
- System: MongoDB
- Server: mongodb
- Database: a64core_db

> There is no MySQL service in `docker-compose.yml`. MySQL exists only behind
> the optional finance overlay (`docker-compose.finance.yml`) — see
> `Docs/1-Main-Documentation/Deployment-Modes.md`.

### Direct Database Access

`mongosh` is not installed on the host; it exists only inside the container.
Container names are prefixed by the compose project name, which derives from
your directory — find yours with `docker ps --format '{{.Names}}'`.

```bash
docker exec -it <prefix>-mongodb-1 mongosh a64core_db
```

## Testing

### Run Tests

```bash
# Using pytest
pytest

# With coverage
pytest --cov=src tests/

# Verbose output
pytest -v
```

### Code Quality Checks

```bash
# Format code with Black
black src/

# Run linting
flake8 src/

# Type checking
mypy src/
```

## Environment Variables

Key environment variables (see `.env.example` for full list):

| Variable | Description | Default |
|----------|-------------|---------|
| `ENVIRONMENT` | Environment name | development |
| `DEBUG` | Debug mode | True |
| `HOST` | Server host | 0.0.0.0 |
| `PORT` | Server port | 8000 |
| `MONGODB_URL` | MongoDB connection string | mongodb://localhost:27017 |
| `MYSQL_HOST` | MySQL host | localhost |
| `SECRET_KEY` | Application secret key | (change in production!) |

## Contributing

1. Follow the coding standards in [CLAUDE.md](CLAUDE.md)
2. Update documentation when adding features
3. Write tests for new functionality
4. Use conventional commit messages (feat, fix, docs, etc.)
5. Create feature branches: `feature/your-feature-name`

## Troubleshooting

### Docker Issues

**Containers won't start:**
```bash
docker-compose down
docker-compose up --build
```

**Port already in use:**
Edit `docker-compose.yml` to change port mappings.

**Database connection errors:**
Check that database containers are healthy:
```bash
docker-compose ps
```

### Application Issues

**Module not found:**
Ensure you're in the correct directory and virtual environment is activated.

**Permission errors:**
Check file permissions and Docker volume mounts.

## License

[Specify your license here]

## Support

For issues and questions:
- Check [Docs/](Docs/) folder for detailed documentation
- Review [DEPLOYMENT.md](DEPLOYMENT.md) for deployment help
- See [CLAUDE.md](CLAUDE.md) for development guidelines
