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
- **Dual Database Support** - MongoDB for flexible schemas, MySQL for relational data
- **Docker Containerization** - Consistent development and production environments
- **Auto-Generated API Docs** - Swagger UI and ReDoc included
- **Health Monitoring** - Built-in health check and readiness endpoints
- **Type Safety** - Full Python type hints and Pydantic validation
- **Database UI** - Adminer interface for database management

## Tech Stack

### Backend
- **Python 3.11** - Core programming language
- **FastAPI 0.109.0** - Web framework
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
   docker-compose up -d
   ```

4. **Verify installation**
   - API: http://localhost:8000
   - API Docs: http://localhost:8000/api/docs
   - Health Check: http://localhost:8000/api/health
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

### Development with Docker (Hot Reload)

The docker-compose setup includes volume mounts for hot-reloading:
```bash
docker-compose up
```
Any changes to Python files in `src/` will automatically reload the application.

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

**MySQL Connection:**
- System: MySQL
- Server: mysql
- Username: root
- Password: rootpassword (change in production!)
- Database: a64core_db

### Direct Database Access

**MongoDB:**
```bash
docker exec -it a64core-mongodb-dev mongosh
```

**MySQL:**
```bash
docker exec -it a64core-mysql-dev mysql -u root -p
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
