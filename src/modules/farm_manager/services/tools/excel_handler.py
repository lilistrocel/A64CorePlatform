"""
Excel Handler

openpyxl-based export and import for the Fertilizer Cost Calculator.

Export:
  export_calculation(response) → bytes (.xlsx)
  - "Calculation" sheet: per-crop blocks with ingredient rows + subtotals
  - "Warnings" sheet: if any warnings exist

Import:
  import_crops(file_bytes) → ParsedImport
  - Reads first sheet, expects "Crop Name" and "Points" header columns
  - Returns parsed items + skipped rows + warnings
"""

from io import BytesIO
from datetime import date
from typing import List

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

from ...services.database import farm_db
from ...models.tools.calculator_request import (
    CalculateResponse,
    ParsedImport,
    ParsedImportItem,
    SkippedRow,
)

# ---------------------------------------------------------------------------
# Colour constants
# ---------------------------------------------------------------------------
_HEADER_BG = "1F6AA5"   # dark blue
_CROP_BG = "BDD7EE"     # light blue
_TOTAL_BG = "FFF2CC"    # light yellow
_GRAND_BG = "FCE4D6"    # light orange


def build_import_template() -> bytes:
    """
    Produce a sample .xlsx file users can fill in and re-upload via /import.

    Layout (sheet "Crops"):
    - Row 1: header — "Crop Name" | "Points"
    - Rows 2-3: placeholder example rows the user replaces with their data.

    Returns:
        Raw bytes of the .xlsx file.
    """
    wb = Workbook()
    ws = wb.active
    ws.title = "Crops"

    ws.column_dimensions["A"].width = 36
    ws.column_dimensions["B"].width = 12

    # Header row — same colours as the export sheet for visual consistency
    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill("solid", fgColor=_HEADER_BG)
    for col, label in enumerate(("Crop Name", "Points"), start=1):
        cell = ws.cell(row=1, column=col, value=label)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center")

    # Two placeholder rows — user replaces these
    ws.cell(row=2, column=1, value="Replace with crop name (must match Plant Library)")
    ws.cell(row=2, column=2, value=100)
    ws.cell(row=3, column=1, value="e.g. Potato")
    ws.cell(row=3, column=2, value=50)

    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


def export_calculation(response: CalculateResponse) -> bytes:
    """
    Produce a .xlsx file from a CalculateResponse.

    Workbook layout:
    - Sheet "Per Crop": one block per crop with ingredient rows + subtotal,
      grand total row at the bottom.
    - Sheet "Per Input": one row per chemical aggregated across all crops with
      total qty + total cost, grand total row at the bottom.
    - Sheet "Warnings": one warning per row, only if warnings exist.

    Args:
        response: CalculateResponse from the calculator engine.

    Returns:
        Raw bytes of the .xlsx file.
    """
    wb = Workbook()
    ws = wb.active
    ws.title = "Per Crop"

    # --- Column widths ---
    col_widths = [30, 8, 12, 30, 12, 8, 18, 18]
    for i, width in enumerate(col_widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = width

    # --- Header row ---
    headers = [
        "Crop Name", "Points", "Cycle Days",
        "Chemical", "Qty", "Unit", "Unit Price (AED)", "Total Cost (AED)",
    ]
    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill("solid", fgColor=_HEADER_BG)
    header_row = 1
    for col_idx, header in enumerate(headers, start=1):
        cell = ws.cell(row=header_row, column=col_idx, value=header)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center")

    current_row = 2
    grand_total = 0.0
    grand_total_known = True

    for crop in response.perCrop:
        # -- Crop header row --
        crop_fill = PatternFill("solid", fgColor=_CROP_BG)
        crop_font = Font(bold=True)
        crop_cells = [crop.plantName, crop.points, crop.cycleDays]
        for c_idx, val in enumerate(crop_cells, start=1):
            cell = ws.cell(row=current_row, column=c_idx, value=val)
            cell.fill = crop_fill
            cell.font = crop_font
        # Remaining cols grey
        for c_idx in range(4, 9):
            ws.cell(row=current_row, column=c_idx).fill = crop_fill
        current_row += 1

        # -- Ingredient rows --
        for ing in crop.ingredients:
            ws.cell(row=current_row, column=1, value="")
            ws.cell(row=current_row, column=2, value="")
            ws.cell(row=current_row, column=3, value="")
            ws.cell(row=current_row, column=4, value=ing.name)
            ws.cell(row=current_row, column=5, value=round(ing.qty, 4))
            ws.cell(row=current_row, column=6, value=ing.unit)
            ws.cell(row=current_row, column=7, value=ing.unitPrice)
            ws.cell(row=current_row, column=8, value=ing.totalCost)
            current_row += 1

        # -- Subtotal row --
        total_fill = PatternFill("solid", fgColor=_TOTAL_BG)
        total_font = Font(bold=True)
        subtotal_label = "Subtotal"
        for c_idx in range(1, 9):
            ws.cell(row=current_row, column=c_idx).fill = total_fill
        ws.cell(row=current_row, column=4, value=subtotal_label).font = total_font
        if crop.subtotalCost is not None:
            ws.cell(row=current_row, column=8, value=round(crop.subtotalCost, 4)).font = total_font
        else:
            ws.cell(row=current_row, column=8, value="N/A (missing prices)").font = total_font
            grand_total_known = False
        current_row += 1

        if crop.subtotalCost is not None and grand_total_known:
            grand_total += crop.subtotalCost

    # -- Grand total row --
    gt_fill = PatternFill("solid", fgColor=_GRAND_BG)
    gt_font = Font(bold=True, size=12)
    for c_idx in range(1, 9):
        ws.cell(row=current_row, column=c_idx).fill = gt_fill
    ws.cell(row=current_row, column=1, value="GRAND TOTAL").font = gt_font
    if grand_total_known:
        ws.cell(row=current_row, column=8, value=round(grand_total, 4)).font = gt_font
    else:
        ws.cell(row=current_row, column=8, value="N/A (missing prices)").font = gt_font

    # -- Per Input sheet --
    _write_per_input_sheet(wb, response)

    # -- Warnings sheet --
    if response.warnings:
        ws_warn = wb.create_sheet(title="Warnings")
        ws_warn.column_dimensions["A"].width = 80
        ws_warn.cell(row=1, column=1, value="Warnings").font = Font(bold=True)
        for i, w in enumerate(response.warnings, start=2):
            ws_warn.cell(row=i, column=1, value=w)

    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _write_per_input_sheet(wb: Workbook, response: CalculateResponse) -> None:
    """
    Add a "Per Input" sheet that aggregates ingredient quantities and costs
    across all crops in the calculation response.

    Aggregation key: chemicalId when present, else (name, unit) for unmatched
    or archived-chemical rows.
    """
    ws = wb.create_sheet(title="Per Input")
    ws.column_dimensions["A"].width = 36
    ws.column_dimensions["B"].width = 14
    ws.column_dimensions["C"].width = 8
    ws.column_dimensions["D"].width = 18
    ws.column_dimensions["E"].width = 18

    headers = ["Chemical", "Total Qty", "Unit", "Unit Price (AED)", "Total Cost (AED)"]
    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill("solid", fgColor=_HEADER_BG)
    for col_idx, label in enumerate(headers, start=1):
        cell = ws.cell(row=1, column=col_idx, value=label)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center")

    # Aggregate: key → {name, qty, unit, unitPrice, totalCost, costKnown}
    aggregated: dict = {}
    for crop in response.perCrop:
        for ing in crop.ingredients:
            key = str(ing.chemicalId) if ing.chemicalId else f"unmatched::{ing.name}::{ing.unit}"
            entry = aggregated.setdefault(
                key,
                {
                    "name": ing.name,
                    "unit": ing.unit,
                    "qty": 0.0,
                    "unitPrice": ing.unitPrice,
                    "totalCost": 0.0,
                    "costKnown": True,
                },
            )
            entry["qty"] += ing.qty
            if ing.totalCost is not None:
                entry["totalCost"] += ing.totalCost
            else:
                entry["costKnown"] = False
            # Reason: keep the last seen unitPrice; all rows for the same chemical
            # share the same chemical.defaultUnit price.
            if ing.unitPrice is not None:
                entry["unitPrice"] = ing.unitPrice

    current_row = 2
    grand_total = 0.0
    grand_total_known = True
    for entry in sorted(aggregated.values(), key=lambda e: e["name"].lower()):
        ws.cell(row=current_row, column=1, value=entry["name"])
        ws.cell(row=current_row, column=2, value=round(entry["qty"], 4))
        ws.cell(row=current_row, column=3, value=entry["unit"])
        ws.cell(row=current_row, column=4, value=entry["unitPrice"])
        if entry["costKnown"] and entry["unitPrice"] is not None:
            ws.cell(row=current_row, column=5, value=round(entry["totalCost"], 4))
            grand_total += entry["totalCost"]
        else:
            ws.cell(row=current_row, column=5, value="N/A")
            grand_total_known = False
        current_row += 1

    # Grand total row
    gt_fill = PatternFill("solid", fgColor=_GRAND_BG)
    gt_font = Font(bold=True, size=12)
    for c_idx in range(1, 6):
        ws.cell(row=current_row, column=c_idx).fill = gt_fill
    ws.cell(row=current_row, column=1, value="GRAND TOTAL").font = gt_font
    if grand_total_known:
        ws.cell(row=current_row, column=5, value=round(grand_total, 4)).font = gt_font
    else:
        ws.cell(row=current_row, column=5, value="N/A (missing prices)").font = gt_font


async def import_crops(file_bytes: bytes) -> ParsedImport:
    """
    Parse a .xlsx file to extract crop name + points pairs.

    Expected format:
    - First sheet
    - First row: headers — must contain at least "Crop Name" and "Points"
      (case-insensitive, leading/trailing whitespace ignored)
    - Subsequent rows: data

    Processing rules:
    - Strip + lower-case crop name, look up plant_data_enhanced
    - Parse points as positive integer
    - Aggregate duplicate plant names by summing points
    - Skip rows that cannot be resolved; log in skipped list

    Args:
        file_bytes: Raw .xlsx file bytes.

    Returns:
        ParsedImport with items, skipped, and warnings.

    Raises:
        ValueError: If the file cannot be parsed or has no header row.
    """
    try:
        wb = load_workbook(BytesIO(file_bytes), read_only=True, data_only=True)
    except Exception as exc:
        raise ValueError(f"Cannot open Excel file: {exc}") from exc

    ws = wb.worksheets[0]
    rows = list(ws.iter_rows(values_only=True))

    if not rows:
        raise ValueError("Excel file is empty — no rows found")

    # -- Find header row --
    header_row = rows[0]
    header_lower = [
        str(cell).strip().lower() if cell is not None else ""
        for cell in header_row
    ]

    if "crop name" not in header_lower or "points" not in header_lower:
        raise ValueError(
            "Header row must contain 'Crop Name' and 'Points' columns "
            f"(found: {header_lower})"
        )

    crop_col = header_lower.index("crop name")
    points_col = header_lower.index("points")

    db = farm_db.get_database()

    items_by_plant: dict = {}  # plantDataId → ParsedImportItem
    skipped: List[SkippedRow] = []
    import_warnings: List[str] = []

    for row_idx, row in enumerate(rows[1:], start=1):
        raw_name = row[crop_col] if crop_col < len(row) else None
        raw_points = row[points_col] if points_col < len(row) else None

        # Skip completely blank rows silently
        if raw_name is None and raw_points is None:
            continue

        name_str = str(raw_name).strip() if raw_name is not None else ""
        if not name_str:
            skipped.append(SkippedRow(rowIndex=row_idx, name="", reason="Empty crop name"))
            continue

        # -- Resolve plant --
        name_lower = name_str.lower()
        plant_doc = await db.plant_data_enhanced.find_one(
            {
                "deletedAt": None,
                "plantName": {
                    "$regex": f"^{_escape_regex_excel(name_str)}$",
                    "$options": "i",
                },
            },
            {"plantDataId": 1, "plantName": 1},
        )

        if plant_doc is None:
            skipped.append(
                SkippedRow(rowIndex=row_idx, name=name_str, reason="Unknown crop")
            )
            continue

        # -- Parse points --
        try:
            points = int(raw_points)
            if points < 1:
                raise ValueError("Must be ≥ 1")
        except (TypeError, ValueError):
            skipped.append(
                SkippedRow(
                    rowIndex=row_idx,
                    name=name_str,
                    reason=f"Invalid points value: '{raw_points}' (must be a positive integer)",
                )
            )
            continue

        pid = plant_doc["plantDataId"]
        if pid in items_by_plant:
            items_by_plant[pid].points += points
        else:
            items_by_plant[pid] = ParsedImportItem(
                plantDataId=pid,
                plantName=plant_doc["plantName"],
                points=points,
            )

    if skipped:
        import_warnings.append(
            f"{len(skipped)} row(s) were skipped — see the 'skipped' list for details"
        )

    return ParsedImport(
        items=list(items_by_plant.values()),
        skipped=skipped,
        warnings=import_warnings,
    )


def _escape_regex_excel(text: str) -> str:
    """Escape special MongoDB regex characters."""
    special = r"\.^$*+?{}[]|()"
    return "".join(f"\\{c}" if c in special else c for c in text)
