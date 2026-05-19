"""
SQLAlchemy ORM Base

Provides the declarative base for all finance ORM models.
"""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Base class for all Finance ORM models."""
    pass
