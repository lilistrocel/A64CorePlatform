"""
HR Module - Dashboard API Routes

Comprehensive dashboard endpoint for HR statistics.
"""

from fastapi import APIRouter, Depends
from datetime import datetime, timedelta
import logging

from src.modules.hr.services.employee import EmployeeService, VisaService, PerformanceService
from src.modules.hr.middleware.auth import require_permission, CurrentUser
from src.modules.hr.utils.responses import SuccessResponse

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get(
    "",
    response_model=SuccessResponse[dict],
    summary="Get HR dashboard statistics",
    description="Get comprehensive HR dashboard statistics including employee counts, recent hires, and visa expirations."
)
async def get_dashboard_stats(
    current_user: CurrentUser = Depends(require_permission("hr.view")),
    employee_service: EmployeeService = Depends(),
    visa_service: VisaService = Depends(),
    performance_service: PerformanceService = Depends()
):
    """Get comprehensive HR dashboard statistics"""

    # Get employee counts by status
    all_employees = await employee_service.get_all_employees(page=1, per_page=1000)
    employees_list = all_employees.get("items", [])

    total_employees = len(employees_list)
    active_employees = sum(1 for e in employees_list if e.status == "active")
    on_leave_employees = sum(1 for e in employees_list if e.status == "on_leave")
    terminated_employees = sum(1 for e in employees_list if e.status == "terminated")

    # Get recent hires (last 30 days)
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    recent_hires = [
        e for e in employees_list
        if hasattr(e, 'hireDate') and e.hireDate and
        datetime.fromisoformat(str(e.hireDate).replace('Z', '+00:00').replace('+00:00', '')) > thirty_days_ago
    ][:5]  # Limit to 5 most recent

    # Get upcoming visa expirations (next 60 days)
    upcoming_visa_expirations = []
    try:
        sixty_days_from_now = datetime.utcnow() + timedelta(days=60)
        # Get all visas and filter for expiring soon
        for employee in employees_list[:50]:  # Limit to avoid too many API calls
            try:
                visas_result = await visa_service.get_employee_visas(str(employee.employeeId), page=1, per_page=10)
                visas = visas_result.get("items", [])
                for visa in visas:
                    if hasattr(visa, 'expiryDate') and visa.expiryDate:
                        expiry = datetime.fromisoformat(str(visa.expiryDate).replace('Z', '+00:00').replace('+00:00', ''))
                        if datetime.utcnow() < expiry < sixty_days_from_now:
                            upcoming_visa_expirations.append(visa)
            except Exception:
                continue
    except Exception as e:
        logger.warning(f"Error fetching visa expirations: {e}")

    # Get average performance rating
    avg_performance_rating = 0.0
    try:
        perf_metrics = await performance_service.get_dashboard_metrics()
        avg_performance_rating = perf_metrics.get("avgRating", 0.0)
    except Exception as e:
        logger.warning(f"Error fetching performance metrics: {e}")

    dashboard_stats = {
        "totalEmployees": total_employees,
        "activeEmployees": active_employees,
        "onLeaveEmployees": on_leave_employees,
        "terminatedEmployees": terminated_employees,
        "recentHires": [
            {
                "employeeId": str(e.employeeId),
                "employeeCode": e.employeeCode,
                "firstName": e.firstName,
                "lastName": e.lastName,
                "email": e.email,
                "department": e.department,
                "position": e.position,
                "hireDate": str(e.hireDate) if e.hireDate else None,
                "status": e.status
            }
            for e in recent_hires
        ],
        "upcomingVisaExpirations": [
            {
                "visaId": str(v.visaId),
                "employeeId": str(v.employeeId),
                "visaType": v.visaType,
                "country": v.country,
                "expiryDate": str(v.expiryDate) if v.expiryDate else None,
                "status": v.status
            }
            for v in upcoming_visa_expirations[:5]
        ],
        "averagePerformanceRating": avg_performance_rating
    }

    return SuccessResponse(data=dashboard_stats)
