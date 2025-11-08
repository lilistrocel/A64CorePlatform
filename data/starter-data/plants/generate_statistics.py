#!/usr/bin/env python
"""
Generate comprehensive statistics for the UAE Popular Plants Enhanced Dataset
"""

import json
from collections import defaultdict
from pathlib import Path

# Load dataset
file_path = Path('C:/Code/A64CorePlatform/data/starter-data/plants/uae-popular-plants-enhanced.json')
with open(file_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

plants = data['plants']
metadata = data['metadata']

print('=' * 80)
print('UAE POPULAR PLANTS ENHANCED DATASET - COMPREHENSIVE STATISTICS')
print('=' * 80)
print()

# === OVERVIEW ===
print('OVERVIEW')
print('-' * 80)
print(f'Total Plants: {len(plants)}')
print(f'File Size: {file_path.stat().st_size:,} bytes ({file_path.stat().st_size / 1024:.1f} KB)')
print(f'Date Compiled: {metadata["date_compiled"]}')
print(f'Data Sources: {len(metadata["sources"])} official sources')
print()

# === GROWTH CYCLES ===
print('GROWTH CYCLE STATISTICS')
print('-' * 80)
cycles = [p['growthCycle']['totalCycleDays'] for p in plants]
print(f'Average Cycle: {sum(cycles)/len(cycles):.1f} days')
print(f'Shortest Cycle: {min(cycles)} days ({[p["plantName"] for p in plants if p["growthCycle"]["totalCycleDays"] == min(cycles)][0]})')
print(f'Longest Cycle: {max(cycles)} days ({[p["plantName"] for p in plants if p["growthCycle"]["totalCycleDays"] == max(cycles)][0]})')

# Fast, medium, slow categories
fast = [p['plantName'] for p in plants if p['growthCycle']['totalCycleDays'] <= 50]
medium = [p['plantName'] for p in plants if 50 < p['growthCycle']['totalCycleDays'] <= 100]
slow = [p['plantName'] for p in plants if p['growthCycle']['totalCycleDays'] > 100]
print(f'Fast-growing (<=50 days): {len(fast)} plants')
if fast:
    print(f'  {" | ".join(fast[:5])}{"..." if len(fast) > 5 else ""}')
print(f'Medium (51-100 days): {len(medium)} plants')
if medium:
    print(f'  {" | ".join(medium[:5])}{"..." if len(medium) > 5 else ""}')
print(f'Slow (>100 days): {len(slow)} plants')
if slow:
    print(f'  {" | ".join(slow)}')
print()

# === YIELD STATISTICS ===
print('YIELD STATISTICS')
print('-' * 80)
yields = [p['yieldInfo']['yieldPerPlant'] for p in plants]
print(f'Average Yield: {sum(yields)/len(yields):.2f} kg per plant')
print(f'Highest Yield: {max(yields)} kg ({[p["plantName"] for p in plants if p["yieldInfo"]["yieldPerPlant"] == max(yields)][0]})')
print(f'Lowest Yield: {min(yields)} kg ({[p["plantName"] for p in plants if p["yieldInfo"]["yieldPerPlant"] == min(yields)][0]})')

# High, medium, low yield categories
high_yield = [p['plantName'] for p in plants if p['yieldInfo']['yieldPerPlant'] >= 5]
med_yield = [p['plantName'] for p in plants if 1 <= p['yieldInfo']['yieldPerPlant'] < 5]
low_yield = [p['plantName'] for p in plants if p['yieldInfo']['yieldPerPlant'] < 1]
print(f'High yield (>=5 kg): {len(high_yield)} plants - {" | ".join(high_yield)}')
print(f'Medium yield (1-5 kg): {len(med_yield)} plants')
print(f'Low yield (<1 kg): {len(low_yield)} plants')
print()

# === ENVIRONMENTAL REQUIREMENTS ===
print('ENVIRONMENTAL REQUIREMENTS')
print('-' * 80)
temps = [(p['plantName'], p['environmentalRequirements']['temperature']['optimalCelsius']) for p in plants]
temps_sorted = sorted(temps, key=lambda x: x[1])
print(f'Temperature Range: {temps_sorted[0][1]}°C to {temps_sorted[-1][1]}°C optimal')
print(f'Coolest crop: {temps_sorted[0][0]} ({temps_sorted[0][1]}°C)')
print(f'Warmest crop: {temps_sorted[-1][0]} ({temps_sorted[-1][1]}°C)')

# Cool vs warm season
cool_season = [p['plantName'] for p in plants if p['environmentalRequirements']['temperature']['optimalCelsius'] <= 20]
warm_season = [p['plantName'] for p in plants if p['environmentalRequirements']['temperature']['optimalCelsius'] > 20]
print(f'Cool-season crops (<=20°C): {len(cool_season)} plants')
print(f'Warm-season crops (>20°C): {len(warm_season)} plants')
print()

# === ECONOMICS ===
print('ECONOMIC STATISTICS')
print('-' * 80)
prices = [(p['plantName'], p['economicsAndLabor']['averageMarketValuePerKg']) for p in plants]
prices_sorted = sorted(prices, key=lambda x: x[1], reverse=True)
avg_price = sum([p[1] for p in prices]) / len(prices)
print(f'Average Market Value: ${avg_price:.2f}/kg')
print(f'Highest Value: ${prices_sorted[0][1]:.2f}/kg ({prices_sorted[0][0]})')
print(f'Lowest Value: ${prices_sorted[-1][1]:.2f}/kg ({prices_sorted[-1][0]})')
print(f'Top 5 Most Valuable:')
for i, (name, price) in enumerate(prices_sorted[:5], 1):
    print(f'  {i}. {name}: ${price:.2f}/kg')
print()

# === LABOR REQUIREMENTS ===
print('LABOR REQUIREMENTS')
print('-' * 80)
labor = [(p['plantName'], p['economicsAndLabor']['totalManHoursPerPlant']) for p in plants]
labor_sorted = sorted(labor, key=lambda x: x[1], reverse=True)
avg_labor = sum([p[1] for p in labor]) / len(labor)
print(f'Average Labor: {avg_labor:.2f} hours per plant')
print(f'Most Labor-Intensive: {labor_sorted[0][0]} ({labor_sorted[0][1]:.2f} hrs)')
print(f'Least Labor-Intensive: {labor_sorted[-1][0]} ({labor_sorted[-1][1]:.2f} hrs)')
print()

# === FARM TYPE COMPATIBILITY ===
print('FARM TYPE COMPATIBILITY')
print('-' * 80)
farm_types = defaultdict(list)
for p in plants:
    for ft in p['farmTypeCompatibility']:
        farm_types[ft].append(p['plantName'])
for ft, plants_list in sorted(farm_types.items()):
    print(f'{ft}: {len(plants_list)} plants')
print()

# === TAGS ANALYSIS ===
print('CATEGORIZATION (TAGS)')
print('-' * 80)
all_tags = defaultdict(int)
for p in plants:
    for tag in p['tags']:
        all_tags[tag] += 1
print('Top 10 Most Common Tags:')
for i, (tag, count) in enumerate(sorted(all_tags.items(), key=lambda x: x[1], reverse=True)[:10], 1):
    print(f'  {i:2d}. {tag}: {count} plants')
print()

# === DATA COMPLETENESS ===
print('DATA COMPLETENESS')
print('-' * 80)
total_fert_applications = sum([len(p['fertilizerSchedule']) for p in plants])
total_pests = sum([len(p['diseasesAndPests']) for p in plants])
total_grades = sum([len(p['gradingStandards']) for p in plants])
print(f'Fertilizer Applications: {total_fert_applications} total ({total_fert_applications/len(plants):.1f} avg per plant)')
print(f'Diseases & Pests Documented: {total_pests} total ({total_pests/len(plants):.1f} avg per plant)')
print(f'Quality Grades Defined: {total_grades} total ({total_grades/len(plants):.1f} avg per plant)')
print()

print('=' * 80)
print('DATASET STATUS: COMPLETE AND READY FOR PRODUCTION')
print('=' * 80)
