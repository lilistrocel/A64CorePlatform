#!/usr/bin/env python3
"""Generate valid test license keys"""
import secrets

# Generate segmented license (XXX-YYY-ZZZ-AAA format)
segments = []
for _ in range(4):
    segment = ''.join(secrets.choice("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789") for _ in range(4))
    segments.append(segment)

license_key = "-".join(segments)
print(f"Test License Key: {license_key}")
