# Multi-Crop Virtual Blocks - Quick Reference

**Quick implementation guide for developers working with multi-crop features.**

---

## Key Concepts

| Concept | Description |
|---------|-------------|
| **Physical Block** | Permanent block representing actual farm area (e.g., "F001-021") |
| **Virtual Block** | Temporary child block for additional crops (e.g., "F001-021/001") |
| **Area Budget** | Physical block's total area, allocated to children |
| **PARTIAL Status** | Physical block has virtual children but no direct crop |

---

## Block Category Quick Check

```python
# Physical block
block.blockCategory == "physical"
block.parentBlockId == None
block.availableArea  # Area budget remaining
block.childBlockIds  # List of virtual child IDs
block.virtualBlockCounter  # Counter for code generation

# Virtual block
block.blockCategory == "virtual"
block.parentBlockId  # UUID of parent block
block.allocatedArea  # Area allocated from parent
block.childBlockIds == []  # Virtual blocks cannot have children
```

---

## Common Queries

### Get all physical blocks

```python
blocks = await db.blocks.find({
    "blockCategory": "physical",
    "isActive": True
}).to_list(length=None)
```

### Get virtual children of a block

```python
children = await db.blocks.find({
    "parentBlockId": parent_block_id,
    "isActive": True
}).to_list(length=None)
```

### Get blocks with available area for more crops

```python
available_blocks = await db.blocks.find({
    "blockCategory": "physical",
    "isActive": True,
    "availableArea": {"$gt": 0}
}).to_list(length=None)
```

---

## Virtual Block Creation Logic

```python
async def create_virtual_block(parent_block: Block, crop: PlantData, area: float, plants: int):
    """Create a virtual child block for a physical block"""

    # 1. Validate parent is physical
    if parent_block.blockCategory != "physical":
        raise ValueError("Only physical blocks can have virtual children")

    # 2. Initialize parent's availableArea if first child
    if parent_block.availableArea is None:
        parent_block.availableArea = parent_block.area

    # 3. Validate area budget
    if area > parent_block.availableArea:
        raise ValueError(f"Insufficient area. Available: {parent_block.availableArea}, Requested: {area}")

    # 4. Generate virtual block code
    parent_block.virtualBlockCounter += 1
    virtual_code = f"{parent_block.blockCode}/{parent_block.virtualBlockCounter:03d}"

    # 5. Create virtual block
    virtual_block = Block(
        blockId=uuid4(),
        blockCode=virtual_code,
        farmId=parent_block.farmId,
        blockCategory="virtual",
        parentBlockId=parent_block.blockId,
        allocatedArea=area,
        area=area,  # For display consistency
        maxPlants=plants,
        targetCrop=crop.plantDataId,
        targetCropName=crop.name,
        actualPlantCount=plants,
        state=BlockStatus.GROWING,
        # ... other fields
    )

    # 6. Update parent
    parent_block.availableArea -= area
    parent_block.childBlockIds.append(str(virtual_block.blockId))

    # 7. Save both blocks
    await db.blocks.insert_one(virtual_block.dict())
    await db.blocks.update_one(
        {"blockId": parent_block.blockId},
        {"$set": {
            "availableArea": parent_block.availableArea,
            "virtualBlockCounter": parent_block.virtualBlockCounter,
            "childBlockIds": parent_block.childBlockIds,
            "updatedAt": datetime.utcnow()
        }}
    )

    return virtual_block
```

---

## Virtual Block Auto-Deletion Logic

```python
async def check_and_delete_empty_virtual_block(block: Block):
    """Delete virtual block if status is EMPTY"""

    # 1. Only apply to virtual blocks
    if block.blockCategory != "virtual" or block.state != BlockStatus.EMPTY:
        return False

    # 2. Get parent block
    parent = await db.blocks.find_one({"blockId": block.parentBlockId})
    if not parent:
        raise ValueError("Parent block not found")

    # 3. Transfer history (tasks, harvests) to parent
    await transfer_virtual_block_history(block.blockId, parent["blockId"])

    # 4. Return area to parent's budget
    parent["availableArea"] = (parent["availableArea"] or 0) + block.allocatedArea

    # 5. Remove from parent's child list
    parent["childBlockIds"] = [
        child_id for child_id in parent["childBlockIds"]
        if child_id != str(block.blockId)
    ]

    # 6. Check if parent should become EMPTY or PARTIAL
    if len(parent["childBlockIds"]) == 0 and parent.get("targetCrop") is None:
        parent["state"] = BlockStatus.EMPTY
    elif parent.get("targetCrop") is None:
        parent["state"] = BlockStatus.PARTIAL

    # 7. Soft delete virtual block
    await db.blocks.update_one(
        {"blockId": block.blockId},
        {"$set": {"isActive": False, "updatedAt": datetime.utcnow()}}
    )

    # 8. Update parent
    await db.blocks.update_one(
        {"blockId": parent["blockId"]},
        {"$set": {
            "availableArea": parent["availableArea"],
            "childBlockIds": parent["childBlockIds"],
            "state": parent["state"],
            "updatedAt": datetime.utcnow()
        }}
    )

    return True
```

---

## Status Transition Rules

| Block Type | Current Status | Has Children? | Has Direct Crop? | New Status |
|------------|---------------|---------------|------------------|------------|
| Physical | EMPTY | No | No | EMPTY |
| Physical | EMPTY | Yes | No | PARTIAL |
| Physical | EMPTY | No | Yes | PLANNED → GROWING |
| Physical | EMPTY | Yes | Yes | PLANNED → GROWING |
| Virtual | GROWING | N/A | Yes | HARVESTING → EMPTY → DELETE |

---

## Area Budget Validation

```python
def validate_area_budget(parent: Block) -> bool:
    """Verify parent block's area budget is consistent"""

    # Get all active children
    children = db.blocks.find({
        "parentBlockId": parent.blockId,
        "isActive": True
    })

    # Calculate total allocated
    total_allocated = sum(child.allocatedArea for child in children)

    # Verify budget equation
    expected_available = parent.area - total_allocated
    actual_available = parent.availableArea or 0

    return abs(expected_available - actual_available) < 0.01  # Float tolerance
```

---

## API Request Examples

### Plant Multi-Crop

```bash
POST /api/v1/farm/farms/{farm_id}/blocks/{block_id}/plant-multi-crop
Content-Type: application/json
Authorization: Bearer {token}

{
  "primaryCrop": {
    "newStatus": "growing",
    "targetCrop": "crop-uuid-1",
    "actualPlantCount": 100
  },
  "additionalCrops": [
    {
      "cropId": "crop-uuid-2",
      "allocatedArea": 200.0,
      "plantCount": 50
    },
    {
      "cropId": "crop-uuid-3",
      "allocatedArea": 150.0,
      "plantCount": 75
    }
  ]
}
```

### Add Virtual Crop

```bash
POST /api/v1/farm/farms/{farm_id}/blocks/{block_id}/add-virtual-crop
Content-Type: application/json
Authorization: Bearer {token}

{
  "cropId": "crop-uuid-4",
  "allocatedArea": 100.0,
  "plantCount": 30,
  "plantingDate": "2025-11-27T10:00:00Z"
}
```

---

## Common Pitfalls

### ❌ Don't: Create virtual blocks without checking area budget

```python
# BAD - No validation
virtual_block = create_virtual_block(parent, crop, 999999, plants)
```

```python
# GOOD - Validate first
if requested_area > parent.availableArea:
    raise ValueError("Insufficient area")
virtual_block = create_virtual_block(parent, crop, requested_area, plants)
```

### ❌ Don't: Allow virtual blocks to have children

```python
# BAD - Virtual blocks cannot have children
if block.blockCategory == "virtual":
    child = create_virtual_block(block, crop, area, plants)  # ERROR!
```

```python
# GOOD - Only physical blocks can have children
if block.blockCategory == "physical":
    child = create_virtual_block(block, crop, area, plants)
```

### ❌ Don't: Forget to update parent when deleting virtual block

```python
# BAD - Orphaned area budget
await db.blocks.delete_one({"blockId": virtual_block.blockId})
```

```python
# GOOD - Return area to parent first
parent.availableArea += virtual_block.allocatedArea
parent.childBlockIds.remove(str(virtual_block.blockId))
await update_parent(parent)
await delete_virtual_block(virtual_block)
```

---

## Testing Checklist

- [ ] Physical block defaults to `blockCategory="physical"`
- [ ] Virtual block code format: `{parentCode}/{counter:03d}`
- [ ] Area budget validation prevents over-allocation
- [ ] Parent `availableArea` initialized when first child created
- [ ] Virtual block auto-deletes when status → EMPTY
- [ ] Area returned to parent on virtual block deletion
- [ ] Parent status → PARTIAL when has children but no direct crop
- [ ] Parent status → EMPTY when no children and no direct crop
- [ ] Virtual blocks cannot have children
- [ ] History (tasks/harvests) transferred to parent on deletion

---

## MongoDB Schema

```javascript
{
  // Standard block fields
  "blockId": "uuid",
  "blockCode": "F001-021" or "F001-021/001",
  "farmId": "uuid",
  "blockCategory": "physical" or "virtual",
  "state": "empty|planned|growing|fruiting|harvesting|cleaning|alert|partial",

  // Physical block only
  "parentBlockId": null,
  "availableArea": 1000.0,  // Remaining budget
  "virtualBlockCounter": 2,  // Next: /003
  "childBlockIds": ["uuid1", "uuid2"],

  // Virtual block only
  "parentBlockId": "parent-uuid",
  "allocatedArea": 200.0,  // From parent's budget

  // Both
  "area": 1000.0,  // Total area (physical) or allocated (virtual)
  "maxPlants": 100,
  "targetCrop": "crop-uuid",
  "actualPlantCount": 95,
  "isActive": true
}
```

---

## Useful Queries for Debugging

### Check area budget consistency

```javascript
db.blocks.aggregate([
  { $match: { blockCategory: "physical", isActive: true } },
  {
    $lookup: {
      from: "blocks",
      localField: "blockId",
      foreignField: "parentBlockId",
      as: "children"
    }
  },
  {
    $project: {
      blockCode: 1,
      totalArea: "$area",
      availableArea: 1,
      childrenCount: { $size: "$children" },
      allocatedToChildren: {
        $sum: "$children.allocatedArea"
      }
    }
  }
])
```

### Find orphaned virtual blocks

```javascript
db.blocks.aggregate([
  { $match: { blockCategory: "virtual", isActive: true } },
  {
    $lookup: {
      from: "blocks",
      localField: "parentBlockId",
      foreignField: "blockId",
      as: "parent"
    }
  },
  { $match: { parent: { $size: 0 } } }  // No parent found
])
```

---

**Quick Reference Version:** 1.0
**Last Updated:** 2025-11-27
