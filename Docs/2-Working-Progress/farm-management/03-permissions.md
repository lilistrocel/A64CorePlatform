# Farm Management Module - User Roles & Permissions

## User Roles & Permissions

### Role Mapping

| Farm Role | A64Core Role | Permissions | Description |
|-----------|-------------|-------------|-------------|
| **Agronomist** | Manager (typically) | `agronomist`, `farm.view` | Manages plant data library |
| **Farm Manager** | Manager | `farm.manage`, `farm.view` | Plans and oversees farm operations |
| **Farmer** | User | `farm.operate`, `farm.view` | Executes farming tasks on assigned farms |
| **Admin** | Admin | All farm permissions | System administration |

### Permission Matrix

| Action | Agronomist | Farm Manager | Farmer | Admin |
|--------|-----------|--------------|--------|-------|
| **Plant Data** | | | | |
| View plant data | ✅ | ✅ | ✅ | ✅ |
| Create plant data | ✅ | ❌ | ❌ | ✅ |
| Edit plant data | ✅ | ❌ | ❌ | ✅ |
| Delete plant data | ✅ | ❌ | ❌ | ✅ |
| Import CSV plant data | ✅ | ❌ | ❌ | ✅ |
| **Farms** | | | | |
| View farms | ✅ | ✅ (assigned) | ✅ (assigned) | ✅ |
| Create farms | ❌ | ✅ | ❌ | ✅ |
| Edit farms | ❌ | ✅ (own) | ❌ | ✅ |
| Delete farms | ❌ | ✅ (own) | ❌ | ✅ |
| Assign users to farm | ❌ | ✅ (own farm) | ❌ | ✅ |
| **Blocks** | | | | |
| View blocks | ✅ | ✅ (own farms) | ✅ (assigned farms) | ✅ |
| Create blocks | ❌ | ✅ (own farms) | ❌ | ✅ |
| Edit blocks | ❌ | ✅ (own farms) | ❌ | ✅ |
| Delete blocks | ❌ | ✅ (own farms) | ❌ | ✅ |
| **Planting** | | | | |
| View planting plans | ✅ | ✅ (own farms) | ✅ (assigned farms) | ✅ |
| Create planting plans | ❌ | ✅ (own farms) | ❌ | ✅ |
| Edit planting plans | ❌ | ✅ (own farms, if not planted) | ❌ | ✅ |
| Mark as planted | ❌ | ✅ | ✅ (assigned farms) | ✅ |
| **Harvesting** | | | | |
| View harvest data | ✅ | ✅ (own farms) | ✅ (assigned farms) | ✅ |
| Record harvest | ❌ | ✅ | ✅ (assigned farms) | ✅ |
| End harvest | ❌ | ✅ | ✅ (assigned farms) | ✅ |
| **Alerts** | | | | |
| View alerts | ✅ | ✅ (own farms) | ✅ (assigned farms) | ✅ |
| Trigger alerts | ❌ | ✅ | ✅ (assigned farms) | ✅ |
| Resolve alerts | ❌ | ✅ | ✅ (assigned farms) | ✅ |
| **Yield Predictions** | | | | |
| View predictions | ✅ | ✅ (own farms) | ✅ (assigned farms) | ✅ |

### Permission Implementation

```python
# src/middleware/farm_permissions.py
from fastapi import HTTPException, status
from typing import List

async def check_farm_access(
    user_id: str,
    farm_id: str,
    required_permission: str
) -> bool:
    """Check if user has access to specific farm"""

    # Check if user is assigned to farm
    assignment = await db.farm_assignments.find_one({
        "userId": user_id,
        "farmId": farm_id,
        "isActive": True
    })

    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Not assigned to this farm"
        )

    # Check user permissions
    user = await get_user_by_id(user_id)
    if required_permission not in user.permissions:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Permission denied: Missing {required_permission}"
        )

    return True

async def get_user_farms(user_id: str) -> List[str]:
    """Get list of farm IDs user has access to"""
    assignments = await db.farm_assignments.find({
        "userId": user_id,
        "isActive": True
    }).to_list(None)

    return [assignment["farmId"] for assignment in assignments]
```

---



---

**[← Back to Index](./README.md)**
