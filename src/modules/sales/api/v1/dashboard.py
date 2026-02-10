"""
Sales Module - Dashboard API Routes

Comprehensive dashboard endpoint for Sales statistics.
"""

from typing import Optional
from fastapi import APIRouter, Depends, Query
import logging

from src.modules.sales.services.sales import OrderService, InventoryService, PurchaseOrderService
from src.modules.sales.middleware.auth import require_permission, CurrentUser
from src.modules.sales.utils.responses import SuccessResponse
from src.modules.sales.models import SalesOrderStatus
from src.core.cache import cache_response

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get(
    "",
    response_model=SuccessResponse[dict],
    summary="Get sales dashboard statistics",
    description="Get comprehensive sales dashboard statistics including orders, inventory, and purchase orders. Use farmingYear parameter to filter inventory stats by farming year."
)
@cache_response(ttl=30, key_prefix="sales")
async def get_dashboard_stats(
    farmingYear: Optional[int] = Query(
        None,
        description="Filter inventory statistics by farming year (e.g., 2025). When specified, inventory counts are filtered by farmingYear field. Default to all data when not specified."
    ),
    current_user: CurrentUser = Depends(require_permission("sales.view")),
    order_service: OrderService = Depends(),
    inventory_service: InventoryService = Depends(),
    po_service: PurchaseOrderService = Depends()
):
    """
    Get comprehensive sales dashboard statistics

    **Farming Year Filter**:
    - When `farmingYear` is specified, order counts, revenue, and inventory stats are filtered by farming year
    - Default (no filter): Returns stats across all farming years
    """

    # Get order statistics (filtered by farming year if specified)
    # Service returns tuple: (orders_list, total_count, total_pages)
    orders_list, total_orders, _ = await order_service.get_all_orders(page=1, per_page=100, farming_year=farmingYear)

    # Get accurate status counts by querying with status filters (filtered by farming year if specified)
    _, confirmed_orders, _ = await order_service.get_all_orders(page=1, per_page=1, status=SalesOrderStatus.CONFIRMED, farming_year=farmingYear)
    _, shipped_orders, _ = await order_service.get_all_orders(page=1, per_page=1, status=SalesOrderStatus.SHIPPED, farming_year=farmingYear)
    _, delivered_orders, _ = await order_service.get_all_orders(page=1, per_page=1, status=SalesOrderStatus.DELIVERED, farming_year=farmingYear)

    # Get revenue stats using aggregation (filtered by farming year if specified)
    revenue_stats = await order_service.get_revenue_stats(farming_year=farmingYear)
    total_revenue = revenue_stats.get("totalRevenue", 0)
    pending_payments = revenue_stats.get("pendingPayments", 0)

    # Get inventory statistics using aggregation (filtered by farming year if specified)
    inventory_stats = await inventory_service.get_inventory_stats(farming_year=farmingYear)
    total_inventory = inventory_stats.get("total", 0)
    available_inventory = inventory_stats.get("available", 0)
    reserved_inventory = inventory_stats.get("reserved", 0)
    sold_inventory = inventory_stats.get("sold", 0)

    # Get purchase order statistics
    # Service returns tuple: (po_list, total_count, total_pages)
    po_list, _, _ = await po_service.get_all_purchase_orders(page=1, per_page=1000)

    total_purchase_orders = len(po_list)
    sent_purchase_orders = sum(1 for p in po_list if p.status == "sent")
    confirmed_purchase_orders = sum(1 for p in po_list if p.status == "confirmed")
    received_purchase_orders = sum(1 for p in po_list if p.status == "received")

    # Get recent orders (last 5)
    recent_orders = sorted(
        orders_list,
        key=lambda x: x.createdAt if hasattr(x, 'createdAt') and x.createdAt else "",
        reverse=True
    )[:5]

    # Build farming year context
    farming_year_context = {
        "farmingYear": farmingYear,
        "isFiltered": farmingYear is not None
    }

    dashboard_stats = {
        "totalOrders": total_orders,
        "confirmedOrders": confirmed_orders,
        "shippedOrders": shipped_orders,
        "deliveredOrders": delivered_orders,
        "totalRevenue": total_revenue,
        "pendingPayments": pending_payments,
        "totalInventory": total_inventory,
        "availableInventory": available_inventory,
        "reservedInventory": reserved_inventory,
        "soldInventory": sold_inventory,
        "totalPurchaseOrders": total_purchase_orders,
        "sentPurchaseOrders": sent_purchase_orders,
        "confirmedPurchaseOrders": confirmed_purchase_orders,
        "receivedPurchaseOrders": received_purchase_orders,
        "recentOrders": [
            {
                "orderId": str(o.orderId),
                "orderCode": o.orderCode,
                "customerId": str(o.customerId) if o.customerId else None,
                "status": o.status,
                "total": o.total,
                "paymentStatus": o.paymentStatus,
                "orderDate": str(o.orderDate) if hasattr(o, 'orderDate') and o.orderDate else None,
                "createdAt": str(o.createdAt) if hasattr(o, 'createdAt') and o.createdAt else None
            }
            for o in recent_orders
        ],
        "farmingYearContext": farming_year_context
    }

    return SuccessResponse(data=dashboard_stats)


@router.get(
    "/stats",
    response_model=SuccessResponse[dict],
    summary="Get sales dashboard stats (alias)",
    description="Alias for GET /api/v1/sales/dashboard - returns sales metrics including total orders, revenue, and status breakdown. Supports farmingYear filter."
)
@cache_response(ttl=30, key_prefix="sales_stats")
async def get_dashboard_stats_alias(
    farmingYear: Optional[int] = Query(
        None,
        description="Filter inventory statistics by farming year (e.g., 2025)"
    ),
    current_user: CurrentUser = Depends(require_permission("sales.view")),
    order_service: OrderService = Depends(),
    inventory_service: InventoryService = Depends(),
    po_service: PurchaseOrderService = Depends()
):
    """Get sales dashboard stats - alias endpoint for /dashboard/stats"""
    return await get_dashboard_stats(
        farmingYear=farmingYear,
        current_user=current_user,
        order_service=order_service,
        inventory_service=inventory_service,
        po_service=po_service
    )
