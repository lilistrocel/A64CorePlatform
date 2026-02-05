"""
Shipment Service

Business logic layer for Shipment operations.
Handles validation, permissions, and orchestration.
"""

from typing import List, Optional
from uuid import UUID
from datetime import datetime
from fastapi import HTTPException, status
import logging

from src.modules.logistics.models.shipment import (
    Shipment, ShipmentCreate, ShipmentUpdate, ShipmentStatus,
    OrderAssignmentResponse, ShipmentTrackingData, TrackingLocation
)
from src.modules.logistics.services.logistics.shipment_repository import ShipmentRepository
from src.modules.logistics.services.logistics.vehicle_repository import VehicleRepository
from src.modules.logistics.services.logistics.route_repository import RouteRepository
from src.modules.sales.models.sales_order import SalesOrderStatus
from src.modules.sales.services.database import sales_db
from src.modules.sales.services.sales.order_service import OrderService

logger = logging.getLogger(__name__)


class ShipmentService:
    """Service for Shipment business logic"""

    def __init__(self):
        self.repository = ShipmentRepository()
        self.vehicle_repository = VehicleRepository()
        self.route_repository = RouteRepository()

    async def create_shipment(
        self,
        shipment_data: ShipmentCreate,
        created_by: UUID
    ) -> Shipment:
        """
        Create a new shipment

        Args:
            shipment_data: Shipment creation data
            created_by: ID of the user creating the shipment

        Returns:
            Created shipment

        Raises:
            HTTPException: If validation fails
        """
        try:
            # Validate that route exists
            route_exists = await self.route_repository.exists(shipment_data.routeId)
            if not route_exists:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Route {shipment_data.routeId} not found"
                )

            # Validate that vehicle exists
            vehicle_exists = await self.vehicle_repository.exists(shipment_data.vehicleId)
            if not vehicle_exists:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Vehicle {shipment_data.vehicleId} not found"
                )

            # Validate cargo
            if not shipment_data.cargo or len(shipment_data.cargo) == 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="At least one cargo item is required"
                )

            shipment = await self.repository.create(shipment_data, created_by)
            logger.info(f"Shipment created: {shipment.shipmentId} by user {created_by}")
            return shipment

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error creating shipment: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create shipment"
            )

    async def get_shipment(self, shipment_id: UUID) -> Shipment:
        """
        Get shipment by ID

        Args:
            shipment_id: Shipment ID

        Returns:
            Shipment

        Raises:
            HTTPException: If shipment not found
        """
        shipment = await self.repository.get_by_id(shipment_id)
        if not shipment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Shipment {shipment_id} not found"
            )
        return shipment

    async def get_all_shipments(
        self,
        page: int = 1,
        per_page: int = 20,
        status: Optional[ShipmentStatus] = None,
        vehicle_id: Optional[UUID] = None,
        route_id: Optional[UUID] = None
    ) -> tuple[List[Shipment], int, int]:
        """
        Get all shipments with pagination

        Args:
            page: Page number (1-indexed)
            per_page: Items per page
            status: Filter by shipment status (optional)
            vehicle_id: Filter by vehicle ID (optional)
            route_id: Filter by route ID (optional)

        Returns:
            Tuple of (shipments, total, total_pages)
        """
        if page < 1:
            page = 1
        if per_page < 1 or per_page > 100:
            per_page = 20

        skip = (page - 1) * per_page
        shipments, total = await self.repository.get_all(skip, per_page, status, vehicle_id, route_id)

        total_pages = (total + per_page - 1) // per_page  # Ceiling division

        return shipments, total, total_pages

    async def update_shipment(
        self,
        shipment_id: UUID,
        update_data: ShipmentUpdate
    ) -> Shipment:
        """
        Update a shipment

        Args:
            shipment_id: Shipment ID
            update_data: Fields to update

        Returns:
            Updated shipment

        Raises:
            HTTPException: If shipment not found or validation fails
        """
        # Check shipment exists
        await self.get_shipment(shipment_id)

        # Validate route if being updated
        if update_data.routeId is not None:
            route_exists = await self.route_repository.exists(update_data.routeId)
            if not route_exists:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Route {update_data.routeId} not found"
                )

        # Validate vehicle if being updated
        if update_data.vehicleId is not None:
            vehicle_exists = await self.vehicle_repository.exists(update_data.vehicleId)
            if not vehicle_exists:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Vehicle {update_data.vehicleId} not found"
                )

        # Validate cargo if being updated
        if update_data.cargo is not None and len(update_data.cargo) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="At least one cargo item is required"
            )

        updated_shipment = await self.repository.update(shipment_id, update_data)
        if not updated_shipment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Shipment {shipment_id} not found"
            )

        logger.info(f"Shipment updated: {shipment_id}")
        return updated_shipment

    async def update_shipment_status(
        self,
        shipment_id: UUID,
        new_status: ShipmentStatus
    ) -> Shipment:
        """
        Update shipment status

        Args:
            shipment_id: Shipment ID
            new_status: New status

        Returns:
            Updated shipment

        Raises:
            HTTPException: If shipment not found or invalid status transition
        """
        # Check shipment exists
        shipment = await self.get_shipment(shipment_id)

        # Validate status transition
        valid_transitions = {
            ShipmentStatus.PENDING: [ShipmentStatus.SCHEDULED, ShipmentStatus.LOADING, ShipmentStatus.CANCELLED],
            ShipmentStatus.SCHEDULED: [ShipmentStatus.LOADING, ShipmentStatus.IN_TRANSIT, ShipmentStatus.CANCELLED],
            ShipmentStatus.LOADING: [ShipmentStatus.IN_TRANSIT, ShipmentStatus.CANCELLED],
            ShipmentStatus.IN_TRANSIT: [ShipmentStatus.DELIVERED, ShipmentStatus.CANCELLED],
            ShipmentStatus.DELIVERED: [],
            ShipmentStatus.CANCELLED: []
        }

        if new_status not in valid_transitions.get(shipment.status, []):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid status transition from {shipment.status} to {new_status}"
            )

        updated_shipment = await self.repository.update_status(shipment_id, new_status)
        if not updated_shipment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Shipment {shipment_id} not found"
            )

        logger.info(f"Shipment status updated: {shipment_id} to {new_status.value}")
        return updated_shipment

    async def delete_shipment(self, shipment_id: UUID) -> dict:
        """
        Delete a shipment

        Args:
            shipment_id: Shipment ID

        Returns:
            Success message

        Raises:
            HTTPException: If shipment not found
        """
        # Check shipment exists
        await self.get_shipment(shipment_id)

        success = await self.repository.delete(shipment_id)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Shipment {shipment_id} not found"
            )

        logger.info(f"Shipment deleted: {shipment_id}")
        return {"message": "Shipment deleted successfully"}

    async def assign_orders_to_shipment(
        self,
        shipment_id: UUID,
        order_ids: List[UUID],
        assigned_by: UUID
    ) -> OrderAssignmentResponse:
        """
        Assign multiple sales orders to a shipment.

        Args:
            shipment_id: Shipment ID
            order_ids: List of order IDs to assign
            assigned_by: User performing the assignment

        Returns:
            OrderAssignmentResponse with updated shipment and orders

        Raises:
            HTTPException: If shipment not found, orders invalid, or wrong status
        """
        # Get shipment
        shipment = await self.get_shipment(shipment_id)

        # Validate shipment status allows assignment
        if shipment.status not in [ShipmentStatus.PENDING, ShipmentStatus.SCHEDULED, ShipmentStatus.LOADING]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot assign orders to shipment with status: {shipment.status.value}"
            )

        # Get sales orders and validate
        db = sales_db.get_database()
        orders_collection = db.sales_orders
        assigned_orders = []
        total_weight = 0.0

        for order_id in order_ids:
            order_doc = await orders_collection.find_one({"orderId": str(order_id)})
            if not order_doc:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Sales order {order_id} not found"
                )

            # Validate order status - must be CONFIRMED
            if order_doc.get("status") != SalesOrderStatus.CONFIRMED.value:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Order {order_id} is not in CONFIRMED status. Current: {order_doc.get('status')}"
                )

            # Check order not already assigned to another shipment
            if order_doc.get("shipmentId") and order_doc.get("shipmentId") != str(shipment_id):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Order {order_id} is already assigned to shipment {order_doc.get('shipmentId')}"
                )

            # Calculate weight from order items (estimate: quantity as weight)
            for item in order_doc.get("items", []):
                total_weight += item.get("quantity", 0)

            assigned_orders.append(order_doc)

        # Update shipment with order IDs
        current_order_ids = [str(oid) for oid in (shipment.orderIds or [])]
        new_order_ids = list(set(current_order_ids + [str(oid) for oid in order_ids]))

        await self.repository._get_collection().update_one(
            {"shipmentId": str(shipment_id)},
            {
                "$set": {
                    "orderIds": new_order_ids,
                    "updatedAt": datetime.utcnow()
                }
            }
        )

        # Update each order with shipment ID and status to ASSIGNED
        for order_id in order_ids:
            await orders_collection.update_one(
                {"orderId": str(order_id)},
                {
                    "$set": {
                        "shipmentId": str(shipment_id),
                        "status": SalesOrderStatus.ASSIGNED.value,
                        "updatedAt": datetime.utcnow()
                    }
                }
            )

        # Get updated shipment
        updated_shipment = await self.get_shipment(shipment_id)

        logger.info(f"Assigned {len(order_ids)} orders to shipment {shipment_id}")

        return OrderAssignmentResponse(
            shipment=updated_shipment.model_dump(mode="json"),
            assignedOrders=[{k: v for k, v in o.items() if k != "_id"} for o in assigned_orders],
            totalCargoWeight=total_weight,
            message=f"Successfully assigned {len(order_ids)} orders to shipment"
        )

    async def start_delivery(
        self,
        shipment_id: UUID,
        started_by: UUID
    ) -> Shipment:
        """
        Start delivery for shipment and update all linked orders to IN_TRANSIT.

        Args:
            shipment_id: Shipment ID
            started_by: User starting the delivery

        Returns:
            Updated shipment
        """
        shipment = await self.get_shipment(shipment_id)

        # Validate shipment can start delivery
        if shipment.status not in [ShipmentStatus.SCHEDULED, ShipmentStatus.LOADING]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot start delivery for shipment with status: {shipment.status.value}"
            )

        # Update shipment status
        updated_shipment = await self.update_shipment_status(shipment_id, ShipmentStatus.IN_TRANSIT)

        # Update all linked orders to IN_TRANSIT
        if shipment.orderIds:
            db = sales_db.get_database()
            for order_id in shipment.orderIds:
                await db.sales_orders.update_one(
                    {"orderId": str(order_id)},
                    {
                        "$set": {
                            "status": SalesOrderStatus.IN_TRANSIT.value,
                            "updatedAt": datetime.utcnow()
                        }
                    }
                )

            logger.info(f"Updated {len(shipment.orderIds)} orders to IN_TRANSIT for shipment {shipment_id}")

        return updated_shipment

    async def complete_delivery(
        self,
        shipment_id: UUID,
        completed_by: UUID
    ) -> dict:
        """
        Complete delivery for shipment and update all linked orders to DELIVERED.

        This method uses the OrderService to update order status, which triggers
        inventory fulfillment (deducting sold quantities from inventory).

        Args:
            shipment_id: Shipment ID
            completed_by: User completing the delivery

        Returns:
            Dictionary with shipment and order update results
        """
        shipment = await self.get_shipment(shipment_id)

        # Validate shipment can be completed
        if shipment.status != ShipmentStatus.IN_TRANSIT:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot complete delivery for shipment with status: {shipment.status.value}"
            )

        # Update shipment status
        updated_shipment = await self.update_shipment_status(shipment_id, ShipmentStatus.DELIVERED)

        # Update all linked orders to DELIVERED using OrderService
        # This triggers inventory fulfillment (deducts sold quantities)
        orders_updated = 0
        orders_failed = []
        if shipment.orderIds:
            order_service = OrderService()
            for order_id in shipment.orderIds:
                try:
                    # Use OrderService to update status - this triggers inventory fulfillment
                    await order_service.update_order_status(
                        UUID(str(order_id)),
                        SalesOrderStatus.DELIVERED
                    )
                    orders_updated += 1
                    logger.info(f"Order {order_id} marked as DELIVERED with inventory fulfilled")
                except Exception as e:
                    logger.error(f"Failed to update order {order_id} to DELIVERED: {e}")
                    orders_failed.append(str(order_id))

            logger.info(f"Updated {orders_updated} orders to DELIVERED for shipment {shipment_id}")
            if orders_failed:
                logger.warning(f"Failed to update orders: {orders_failed}")

        return {
            "shipment": updated_shipment.model_dump(mode="json"),
            "ordersUpdated": orders_updated,
            "ordersFailed": orders_failed,
            "message": f"Delivery completed. {orders_updated} orders marked as delivered."
        }

    async def get_shipment_orders(self, shipment_id: UUID) -> List[dict]:
        """
        Get all sales orders assigned to a shipment.

        Args:
            shipment_id: Shipment ID

        Returns:
            List of order documents
        """
        shipment = await self.get_shipment(shipment_id)

        if not shipment.orderIds:
            return []

        db = sales_db.get_database()
        orders = []

        for order_id in shipment.orderIds:
            order_doc = await db.sales_orders.find_one({"orderId": str(order_id)})
            if order_doc:
                order_doc.pop("_id", None)
                orders.append(order_doc)

        return orders

    async def get_tracking_data(self, shipment_id: UUID) -> ShipmentTrackingData:
        """
        Get GPS tracking data for a shipment.

        Builds tracking information from shipment status, route origin/destination
        coordinates, and calculates estimated current position based on progress.

        Args:
            shipment_id: Shipment ID

        Returns:
            ShipmentTrackingData with GPS coordinates and progress

        Raises:
            HTTPException: If shipment not found
        """
        shipment = await self.get_shipment(shipment_id)

        # Get route data for GPS coordinates
        origin_location = None
        destination_location = None
        route_name = None
        route_distance = None

        try:
            route = await self.route_repository.get_by_id(shipment.routeId)
            if route:
                route_name = route.name
                route_distance = route.distance

                # Extract origin GPS from route
                if route.origin:
                    coords = route.origin.coordinates
                    origin_location = TrackingLocation(
                        lat=coords.lat if coords else 24.4539,
                        lng=coords.lng if coords else 54.3773,
                        name=route.origin.name,
                        address=route.origin.address
                    )

                # Extract destination GPS from route
                if route.destination:
                    coords = route.destination.coordinates
                    destination_location = TrackingLocation(
                        lat=coords.lat if coords else 24.2075,
                        lng=coords.lng if coords else 55.7447,
                        name=route.destination.name,
                        address=route.destination.address
                    )
        except Exception as e:
            logger.warning(f"Could not fetch route data for shipment {shipment_id}: {e}")

        # Calculate progress and current location based on status
        progress_percent = 0.0
        current_location = None
        estimated_arrival = None

        if shipment.status == ShipmentStatus.DELIVERED:
            progress_percent = 100.0
            current_location = destination_location
        elif shipment.status == ShipmentStatus.IN_TRANSIT:
            # Estimate progress based on time elapsed since departure
            if shipment.actualDepartureDate and route_distance:
                elapsed = (datetime.utcnow() - shipment.actualDepartureDate).total_seconds()
                # Assume average speed of 60 km/h for estimation
                estimated_total_seconds = (route_distance / 60.0) * 3600
                if estimated_total_seconds > 0:
                    progress_percent = min(95.0, (elapsed / estimated_total_seconds) * 100.0)
                    # Estimate arrival
                    remaining_seconds = max(0, estimated_total_seconds - elapsed)
                    from datetime import timedelta
                    estimated_arrival = datetime.utcnow() + timedelta(seconds=remaining_seconds)
                else:
                    progress_percent = 50.0

                # Interpolate current location between origin and destination
                if origin_location and destination_location:
                    fraction = progress_percent / 100.0
                    current_location = TrackingLocation(
                        lat=origin_location.lat + (destination_location.lat - origin_location.lat) * fraction,
                        lng=origin_location.lng + (destination_location.lng - origin_location.lng) * fraction,
                        name="En Route",
                        address=f"Estimated {progress_percent:.0f}% of journey"
                    )
            else:
                progress_percent = 10.0
                current_location = origin_location
        elif shipment.status == ShipmentStatus.SCHEDULED:
            progress_percent = 0.0
            current_location = origin_location
        elif shipment.status == ShipmentStatus.CANCELLED:
            progress_percent = 0.0

        return ShipmentTrackingData(
            shipmentId=shipment.shipmentId,
            shipmentCode=shipment.shipmentCode,
            status=shipment.status,
            origin=origin_location,
            destination=destination_location,
            currentLocation=current_location,
            progressPercent=round(progress_percent, 1),
            routeName=route_name,
            routeDistance=route_distance,
            scheduledDate=shipment.scheduledDate,
            actualDepartureDate=shipment.actualDepartureDate,
            actualArrivalDate=shipment.actualArrivalDate,
            estimatedArrival=estimated_arrival,
            lastUpdated=datetime.utcnow()
        )
