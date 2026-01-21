"""
CRM Module Models
"""

from .customer import (
    Customer,
    CustomerBase,
    CustomerCreate,
    CustomerUpdate,
    CustomerType,
    CustomerStatus,
    Address
)

__all__ = [
    "Customer",
    "CustomerBase",
    "CustomerCreate",
    "CustomerUpdate",
    "CustomerType",
    "CustomerStatus",
    "Address"
]
