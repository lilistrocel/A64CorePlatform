"""
Logistics Module - Dashboard API Routes

Comprehensive dashboard endpoint for Logistics statistics.
"""

from fastapi import APIRouter, Depends
from datetime import datetime, timedelta
import logging

from src.modules.logistics.services.logistics import VehicleService, RouteService, ShipmentService
from src.modules.logistics.middleware.auth import require_permission, CurrentUser
from src.modules.logistics.utils.responses import SuccessResponse

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get(
    "",
    response_model=SuccessResponse[dict],
    summary="Get logistics dashboard statistics",
    description="Get comprehensive logistics dashboard statistics including vehicles, routes, and shipments."
)
async def get_dashboard_stats(
    current_user: CurrentUser = Depends(require_permission("logistics.view")),
    vehicle_service: VehicleService = Depends(),
    route_service: RouteService = Depends(),
    shipment_service: ShipmentService = Depends()
):
    """Get comprehensive logistics dashboard statistics"""

    # Get vehicle statistics
    # Service returns tuple: (vehicles_list, total_count, total_pages)
    vehicles_list, _, _ = await vehicle_service.get_all_vehicles(page=1, per_page=1000)

    total_vehicles = len(vehicles_list)
    available_vehicles = sum(1 for v in vehicles_list if v.status == "available")
    in_use_vehicles = sum(1 for v in vehicles_list if v.status == "in_use")
    maintenance_vehicles = sum(1 for v in vehicles_list if v.status == "maintenance")

    # Get route statistics
    # Service returns tuple: (routes_list, total_count, total_pages)
    routes_list, _, _ = await route_service.get_all_routes(page=1, per_page=1000)

    total_routes = len(routes_list)
    active_routes = sum(1 for r in routes_list if hasattr(r, 'isActive') and r.isActive)

    # Get shipment statistics
    # Service returns tuple: (shipments_list, total_count, total_pages)
    shipments_list, _, _ = await shipment_service.get_all_shipments(page=1, per_page=1000)

    total_shipments = len(shipments_list)
    scheduled_shipments = sum(1 for s in shipments_list if s.status == "scheduled")
    in_transit_shipments = sum(1 for s in shipments_list if s.status == "in_transit")
    delivered_shipments = sum(1 for s in shipments_list if s.status == "delivered")

    # Get recent shipments (last 5)
    recent_shipments = sorted(
        shipments_list,
        key=lambda x: x.createdAt if hasattr(x, 'createdAt') and x.createdAt else "",
        reverse=True
    )[:5]

    # Get upcoming maintenance (vehicles with maintenance scheduled in next 30 days)
    upcoming_maintenances = []
    thirty_days_from_now = datetime.utcnow() + timedelta(days=30)
    for vehicle in vehicles_list:
        if hasattr(vehicle, 'maintenanceSchedule') and vehicle.maintenanceSchedule:
            try:
                maintenance_date = datetime.fromisoformat(str(vehicle.maintenanceSchedule).replace('Z', '+00:00').replace('+00:00', ''))
                if datetime.utcnow() < maintenance_date < thirty_days_from_now:
                    upcoming_maintenances.append({
                        "vehicleId": str(vehicle.vehicleId),
                        "vehicleName": vehicle.name if hasattr(vehicle, 'name') else vehicle.vehicleCode,
                        "nextMaintenanceDate": str(vehicle.maintenanceSchedule)
                    })
            except Exception:
                continue

    dashboard_stats = {
        "totalVehicles": total_vehicles,
        "availableVehicles": available_vehicles,
        "inUseVehicles": in_use_vehicles,
        "maintenanceVehicles": maintenance_vehicles,
        "totalShipments": total_shipments,
        "scheduledShipments": scheduled_shipments,
        "inTransitShipments": in_transit_shipments,
        "deliveredShipments": delivered_shipments,
        "activeRoutes": active_routes,
        "totalRoutes": total_routes,
        "recentShipments": [
            {
                "shipmentId": str(s.shipmentId),
                "shipmentCode": s.shipmentCode,
                "routeId": str(s.routeId) if s.routeId else None,
                "vehicleId": str(s.vehicleId) if s.vehicleId else None,
                "status": s.status,
                "scheduledDate": str(s.scheduledDate) if hasattr(s, 'scheduledDate') and s.scheduledDate else None,
                "createdAt": str(s.createdAt) if hasattr(s, 'createdAt') and s.createdAt else None
            }
            for s in recent_shipments
        ],
        "upcomingMaintenances": upcoming_maintenances[:5]
    }

    return SuccessResponse(data=dashboard_stats)
