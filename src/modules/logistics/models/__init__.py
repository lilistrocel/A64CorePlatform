"""
Logistics Module - Models
"""

from .vehicle import Vehicle, VehicleCreate, VehicleUpdate, VehicleStatus, VehicleType, VehicleOwnership, VehicleCapacity
from .route import Route, RouteCreate, RouteUpdate, LocationInfo, Coordinates
from .shipment import Shipment, ShipmentCreate, ShipmentUpdate, ShipmentStatus, CargoItem

__all__ = [
    "Vehicle",
    "VehicleCreate",
    "VehicleUpdate",
    "VehicleStatus",
    "VehicleType",
    "VehicleOwnership",
    "VehicleCapacity",
    "Route",
    "RouteCreate",
    "RouteUpdate",
    "LocationInfo",
    "Coordinates",
    "Shipment",
    "ShipmentCreate",
    "ShipmentUpdate",
    "ShipmentStatus",
    "CargoItem",
]
