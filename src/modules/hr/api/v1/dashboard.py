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
from src.modules.hr.models.employee import EmployeeStatus

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
    # Service returns tuple: (employees_list, total_count, total_pages)
    # Use the total_count from the database, not len(employees_list) which is limited by pagination
    employees_list, total_employees, _ = await employee_service.get_all_employees(page=1, per_page=100)

    # Get counts by status directly from the database for accuracy
    active_list, active_employees, _ = await employee_service.get_all_employees(page=1, per_page=1, status=EmployeeStatus.ACTIVE)
    on_leave_list, on_leave_employees, _ = await employee_service.get_all_employees(page=1, per_page=1, status=EmployeeStatus.ON_LEAVE)
    terminated_list, terminated_employees, _ = await employee_service.get_all_employees(page=1, per_page=1, status=EmployeeStatus.TERMINATED)

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
                # Service returns tuple: (visas_list, total_count, total_pages)
                visas, _, _ = await visa_service.get_employee_visas(str(employee.employeeId), page=1, per_page=10)
                for visa in visas:
                    if hasattr(visa, 'expiryDate') and visa.expiryDate:
                        expiry = datetime.fromisoformat(str(visa.expiryDate).replace('Z', '+00:00').replace('+00:00', ''))
                        if datetime.utcnow() < expiry < sixty_days_from_now:
                            upcoming_visa_expirations.append(visa)
            except Exception:
                continue
    except Exception as e:
        logger.warning(f"Error fetching visa expirations: {e}")

    # Get department distribution from the employees list
    department_counts = {}
    for e in employees_list:
        dept = e.department or "Unassigned"
        department_counts[dept] = department_counts.get(dept, 0) + 1

    # Convert to list format for frontend
    department_distribution = [
        {"department": dept, "count": count}
        for dept, count in sorted(department_counts.items(), key=lambda x: -x[1])
    ]

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
        "averagePerformanceRating": avg_performance_rating,
        "departmentDistribution": department_distribution
    }

    return SuccessResponse(data=dashboard_stats)
