#!/usr/bin/env python3
"""
Phase 4.3: Migrate crop_price → crop_prices
Sales pricing data
"""

import re
import json

def parse_crop_price_sql(filepath):
    """Parse crop_price SQL"""
    with open(filepath) as f:
        content = f.read()

    prices = []
    seen_refs = set()

    # Schema: date, customer, crop, grade, quantity, price_unit, price_total, ref, farm

    # Pattern to match VALUES tuples
    pattern = r"\('([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([a-f0-9-]+)',\s*([^)]+)\)"

    for m in re.finditer(pattern, content):
        ref = m.group(8)
        if ref in seen_refs:
            continue
        seen_refs.add(ref)

        date = m.group(1)
        customer = m.group(2)
        crop = m.group(3)
        grade = m.group(4)
        quantity = m.group(5)
        price_unit = m.group(6)
        price_total = m.group(7)
        farm = m.group(9).strip().replace("'", "")

        prices.append({
            "priceId": ref,
            "date": date if date and 'null' not in date.lower() else None,
            "customerName": customer if customer and 'null' not in customer.lower() else None,
            "cropName": crop,
            "grade": grade if grade and grade not in ('null', 'NULL', '') else None,
            "quantity": float(quantity) if quantity and quantity not in ('null', '') else 0,
            "pricePerUnit": float(price_unit) if price_unit and price_unit not in ('null', '') else 0,
            "priceTotal": float(price_total) if price_total and price_total not in ('null', '') else 0,
            "farmName": farm if farm and farm not in ('null', 'NULL', '') else None,
        })

    return prices


if __name__ == "__main__":
    prices = parse_crop_price_sql("OldData/220126/crop_price_rows.sql")
    print(f"Parsed {len(prices)} crop price records")

    # Customer distribution
    customers = {}
    for p in prices:
        c = p["customerName"] or "Unknown"
        customers[c] = customers.get(c, 0) + 1
    print("\nCustomer distribution:")
    for c, cnt in sorted(customers.items(), key=lambda x: -x[1]):
        print(f"  {c[:50]}: {cnt}")

    # Crop distribution
    crops = {}
    for p in prices:
        c = p["cropName"]
        crops[c] = crops.get(c, 0) + 1
    print(f"\nTop 10 crops by sales frequency:")
    for c, cnt in sorted(crops.items(), key=lambda x: -x[1])[:10]:
        print(f"  {c}: {cnt}")

    # Total revenue by crop
    crop_revenue = {}
    for p in prices:
        c = p["cropName"]
        crop_revenue[c] = crop_revenue.get(c, 0) + (p["priceTotal"] or 0)
    print(f"\nTop 10 crops by total revenue:")
    for c, total in sorted(crop_revenue.items(), key=lambda x: -x[1])[:10]:
        print(f"  {c}: AED {total:,.2f}")

    # Total revenue
    total_revenue = sum(p["priceTotal"] or 0 for p in prices)
    print(f"\nTotal revenue: AED {total_revenue:,.2f}")

    # Save to JSON
    with open('scripts/migrations/phase4/crop_prices.json', 'w') as f:
        json.dump(prices, f, indent=2)
    print(f"\nWritten to scripts/migrations/phase4/crop_prices.json")
