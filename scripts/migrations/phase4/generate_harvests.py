#!/usr/bin/env python3
"""
Phase 4.2: Migrate harvest_reports → block_harvests
Individual harvest events
"""

import re
import json

def parse_harvest_reports_sql(filepath):
    """Parse harvest_reports SQL"""
    with open(filepath) as f:
        content = f.read()

    harvests = []
    seen_refs = set()

    # Schema: __id__, Quantity, harvestSeason, time, ref, farm_block_ref, block_id,
    #         crop, farm, reporter_user, main_block, main_block_ref, viewing_year, grade

    # Pattern to match VALUES tuples
    pattern = r"\('([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([a-f0-9-]+)',\s*'([a-f0-9-]+)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([a-f0-9-]+)',\s*'([^']*)',\s*([^)]+)\)"

    for m in re.finditer(pattern, content):
        ref = m.group(5)
        if ref in seen_refs:
            continue
        seen_refs.add(ref)

        legacy_id = m.group(1)
        quantity = m.group(2)
        season = m.group(3)
        harvest_time = m.group(4)
        farm_block_ref = m.group(6)
        block_id = m.group(7)
        crop = m.group(8)
        farm = m.group(9)
        reporter = m.group(10)
        main_block = m.group(11)
        main_block_ref = m.group(12)
        viewing_year = m.group(13)
        grade = m.group(14).strip().replace("'", "")

        harvests.append({
            "harvestId": ref,
            "legacyId": legacy_id if legacy_id else None,
            "legacyBlockCode": block_id,
            "mainBlockCode": main_block,
            "farmBlockRef": farm_block_ref,
            "mainBlockRef": main_block_ref,
            "cropName": crop,
            "farmName": farm,
            "quantity": float(quantity) if quantity and quantity not in ('null', '') else 0,
            "season": int(season) if season and season.isdigit() else None,
            "harvestTime": harvest_time if harvest_time and 'null' not in harvest_time.lower() else None,
            "reporterEmail": reporter if reporter and 'null' not in reporter.lower() else None,
            "grade": grade if grade and grade not in ('null', 'NULL') else None,
            "viewingYear": viewing_year,
        })

    return harvests


if __name__ == "__main__":
    harvests = parse_harvest_reports_sql("OldData/220126/harvest_reports_rows.sql")
    print(f"Parsed {len(harvests)} harvest records")

    # Farm distribution
    farms = {}
    for h in harvests:
        f = h["farmName"]
        farms[f] = farms.get(f, 0) + 1
    print("\nFarm distribution:")
    for f, c in sorted(farms.items(), key=lambda x: -x[1]):
        print(f"  {f}: {c}")

    # Crop distribution
    crops = {}
    for h in harvests:
        c = h["cropName"]
        crops[c] = crops.get(c, 0) + 1
    print(f"\nTop 10 crops:")
    for c, cnt in sorted(crops.items(), key=lambda x: -x[1])[:10]:
        print(f"  {c}: {cnt}")

    # Grade distribution
    grades = {}
    for h in harvests:
        g = h["grade"] or "None"
        grades[g] = grades.get(g, 0) + 1
    print("\nGrade distribution:")
    for g, c in sorted(grades.items(), key=lambda x: -x[1]):
        print(f"  {g}: {c}")

    # Total quantity by crop
    crop_totals = {}
    for h in harvests:
        c = h["cropName"]
        crop_totals[c] = crop_totals.get(c, 0) + (h["quantity"] or 0)
    print(f"\nTop 10 crops by total quantity:")
    for c, total in sorted(crop_totals.items(), key=lambda x: -x[1])[:10]:
        print(f"  {c}: {total:,.0f} kg")

    # Save to JSON
    with open('scripts/migrations/phase4/harvests.json', 'w') as f:
        json.dump(harvests, f, indent=2)
    print(f"\nWritten to scripts/migrations/phase4/harvests.json")
