"""
Sales Module - Dashboard API Routes

Comprehensive dashboard endpoint for Sales statistics.
"""

from fastapi import APIRouter, Depends
import logging

from src.modules.sales.services.sales import OrderService, InventoryService, PurchaseOrderService
from src.modules.sales.middleware.auth import require_permission, CurrentUser
from src.modules.sales.utils.responses import SuccessResponse

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get(
    "",
    response_model=SuccessResponse[dict],
    summary="Get sales dashboard statistics",
    description="Get comprehensive sales dashboard statistics including orders, inventory, and purchase orders."
)
async def get_dashboard_stats(
    current_user: CurrentUser = Depends(require_permission("sales.view")),
    order_service: OrderService = Depends(),
    inventory_service: InventoryService = Depends(),
    po_service: PurchaseOrderService = Depends()
):
    """Get comprehensive sales dashboard statistics"""

    # Get order statistics
    # Service returns tuple: (orders_list, total_count, total_pages)
    orders_list, _, _ = await order_service.get_all_orders(page=1, per_page=1000)

    total_orders = len(orders_list)
    confirmed_orders = sum(1 for o in orders_list if o.status == "confirmed")
    shipped_orders = sum(1 for o in orders_list if o.status == "shipped")
    delivered_orders = sum(1 for o in orders_list if o.status == "delivered")

    # Calculate revenue
    total_revenue = sum(o.total for o in orders_list if hasattr(o, 'total') and o.total)
    pending_payments = sum(
        o.total for o in orders_list
        if hasattr(o, 'paymentStatus') and o.paymentStatus in ["pending", "partial"]
        and hasattr(o, 'total') and o.total
    )

    # Get inventory statistics
    # Service returns tuple: (inventory_list, total_count, total_pages)
    inventory_list, _, _ = await inventory_service.get_all_inventory(page=1, per_page=1000)

    total_inventory = len(inventory_list)
    available_inventory = sum(1 for i in inventory_list if i.status == "available")
    reserved_inventory = sum(1 for i in inventory_list if i.status == "reserved")
    sold_inventory = sum(1 for i in inventory_list if i.status == "sold")

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
