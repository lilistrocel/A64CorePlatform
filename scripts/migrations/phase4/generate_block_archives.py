#!/usr/bin/env python3
"""
Phase 4.1: Migrate block_history → block_archives
Completed planting cycles with yield/KPI data
"""

import re
import json

def parse_block_history_sql(filepath):
    """Parse block_history SQL"""
    with open(filepath) as f:
        content = f.read()

    archives = []
    seen_refs = set()

    # Schema: area, drips, plannedseason, time_finish, time_start, ref, block_id,
    #         farm_id(name), crop_id(name), time_cleaned, harvest_duration, farm_block_ref,
    #         state, farm_type, predicted_yield, harvest_data, kpi, net_yield,
    #         block_standard_ref, yieldperseed, viewing_year

    # Pattern to match VALUES tuples
    pattern = r"\('([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([a-f0-9-]+)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([a-f0-9-]+)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([a-f0-9-]+)',\s*([^,)]+),\s*'([^']*)'\)"

    for m in re.finditer(pattern, content):
        ref = m.group(6)
        if ref in seen_refs:
            continue
        seen_refs.add(ref)

        # Parse values
        area = m.group(1)
        drips = m.group(2)
        season = m.group(3)
        time_finish = m.group(4)
        time_start = m.group(5)
        block_id = m.group(7)
        farm_name = m.group(8)
        crop_name = m.group(9)
        time_cleaned = m.group(10)
        harvest_duration = m.group(11)
        farm_block_ref = m.group(12)
        state = m.group(13)
        farm_type = m.group(14)
        predicted_yield = m.group(15)
        harvest_data = m.group(16)
        kpi = m.group(17)
        net_yield = m.group(18)
        block_standard_ref = m.group(19)
        yield_per_seed = m.group(20).strip().replace("'", "")
        viewing_year = m.group(21)

        archives.append({
            "archiveId": ref,
            "legacyBlockCode": block_id,
            "farmBlockRef": farm_block_ref,
            "blockStandardRef": block_standard_ref,
            "farmName": farm_name,
            "cropName": crop_name,
            "season": int(season) if season and season.isdigit() else None,
            "state": state,
            "farmType": farm_type,
            "area": float(area) if area and area not in ('null', '') else None,
            "drips": int(drips) if drips and drips.isdigit() else None,
            "timeStart": time_start if time_start and 'null' not in time_start.lower() else None,
            "timeFinish": time_finish if time_finish and 'null' not in time_finish.lower() else None,
            "timeCleaned": time_cleaned if time_cleaned and 'null' not in time_cleaned.lower() else None,
            "harvestDuration": int(harvest_duration) if harvest_duration and harvest_duration.isdigit() else None,
            "predictedYield": float(predicted_yield) if predicted_yield and predicted_yield not in ('null', '') else None,
            "actualYield": float(harvest_data) if harvest_data and harvest_data not in ('null', '') else None,
            "kpi": float(kpi) if kpi and kpi not in ('null', '') else None,
            "netYield": float(net_yield) if net_yield and net_yield not in ('null', '') else None,
            "yieldPerSeed": float(yield_per_seed) if yield_per_seed and yield_per_seed not in ('null', '') else None,
            "viewingYear": viewing_year,
        })

    return archives


if __name__ == "__main__":
    archives = parse_block_history_sql("OldData/220126/block_history_rows.sql")
    print(f"Parsed {len(archives)} block archives")

    # State distribution
    states = {}
    for a in archives:
        s = a["state"]
        states[s] = states.get(s, 0) + 1
    print("\nState distribution:")
    for s, c in sorted(states.items(), key=lambda x: -x[1]):
        print(f"  {s}: {c}")

    # Farm distribution
    farms = {}
    for a in archives:
        f = a["farmName"]
        farms[f] = farms.get(f, 0) + 1
    print("\nFarm distribution:")
    for f, c in sorted(farms.items(), key=lambda x: -x[1]):
        print(f"  {f}: {c}")

    # Sample with KPI
    print("\nSample archives with KPI:")
    with_kpi = [a for a in archives if a["kpi"]]
    for a in with_kpi[:5]:
        print(f"  {a['legacyBlockCode']} - {a['cropName']} - KPI: {a['kpi']:.2f}, Yield: {a['actualYield']}")

    # Save to JSON
    with open('scripts/migrations/phase4/block_archives.json', 'w') as f:
        json.dump(archives, f, indent=2)
    print(f"\nWritten to scripts/migrations/phase4/block_archives.json")
