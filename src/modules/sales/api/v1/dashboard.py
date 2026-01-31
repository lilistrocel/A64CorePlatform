"""
Sales Module - Dashboard API Routes

Comprehensive dashboard endpoint for Sales statistics.
"""

from fastapi import APIRouter, Depends
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
    description="Get comprehensive sales dashboard statistics including orders, inventory, and purchase orders."
)
@cache_response(ttl=30, key_prefix="sales")
async def get_dashboard_stats(
    current_user: CurrentUser = Depends(require_permission("sales.view")),
    order_service: OrderService = Depends(),
    inventory_service: InventoryService = Depends(),
    po_service: PurchaseOrderService = Depends()
):
    """Get comprehensive sales dashboard statistics"""

    # Get order statistics
    # Service returns tuple: (orders_list, total_count, total_pages)
    orders_list, total_orders, _ = await order_service.get_all_orders(page=1, per_page=100)

    # Get accurate status counts by querying with status filters
    _, confirmed_orders, _ = await order_service.get_all_orders(page=1, per_page=1, status=SalesOrderStatus.CONFIRMED)
    _, shipped_orders, _ = await order_service.get_all_orders(page=1, per_page=1, status=SalesOrderStatus.SHIPPED)
    _, delivered_orders, _ = await order_service.get_all_orders(page=1, per_page=1, status=SalesOrderStatus.DELIVERED)

    # Get revenue stats using aggregation (across ALL orders, not just first 100)
    revenue_stats = await order_service.get_revenue_stats()
    total_revenue = revenue_stats.get("totalRevenue", 0)
    pending_payments = revenue_stats.get("pendingPayments", 0)

    # Get inventory statistics using aggregation (across ALL items)
    inventory_stats = await inventory_service.get_inventory_stats()
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
        ]
    }

    return SuccessResponse(data=dashboard_stats)
