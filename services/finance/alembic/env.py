"""
Alembic async migration environment.

Uses synchronous (pymysql) URL for migrations since Alembic's default
runner is synchronous. AsyncAlchemy engine is used at runtime only.
"""

import sys
import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

# Ensure src/ is on the Python path so 'finance' package is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from finance.config import settings  # noqa: E402
from finance.models.orm.base import Base  # noqa: E402
import finance.models.orm.models  # noqa: E402, F401 — registers all ORM models

# Alembic Config object provides access to alembic.ini values
config = context.config

# Override sqlalchemy.url from settings (synchronous driver for migrations)
config.set_main_option("sqlalchemy.url", settings.alembic_database_url)

# Python logging configuration from alembic.ini
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Target metadata for autogenerate support
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """
    Run migrations in offline mode (emit SQL to stdout / file).

    Does not require a live DB connection.
    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """
    Run migrations in online mode (requires a live DB connection).
    """
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
