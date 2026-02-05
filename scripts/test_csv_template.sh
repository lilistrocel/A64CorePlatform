#!/bin/bash
# Test CSV template download for Feature #301

# Login as admin
RESP=$(curl -s http://localhost:8000/api/v1/auth/login -X POST -H "Content-Type: application/json" -d '{"email":"farmtest_admin@a64core.com","password":"TestAdmin123@"}')
TOKEN=$(echo "$RESP" | grep -o '"access_token":"[^"]*"' | grep -o 'eyJ[^"]*')

if [ -z "$TOKEN" ]; then
  echo "FAIL: Login failed"
  exit 1
fi
echo "STEP 1: Login OK"

# Download CSV template
echo ""
echo "STEP 2: Download CSV template from /api/v1/farm/plant-data/template/csv"
HTTP_CODE=$(curl -s -o /tmp/plant_data_template.csv -w "%{http_code}" \
  "http://localhost:8000/api/v1/farm/plant-data/template/csv" \
  -H "Authorization: Bearer $TOKEN")
echo "HTTP Status: $HTTP_CODE"

# Check content type header
echo ""
echo "STEP 3: Verify CSV file downloaded"
CONTENT_TYPE=$(curl -s -I "http://localhost:8000/api/v1/farm/plant-data/template/csv" \
  -H "Authorization: Bearer $TOKEN" | grep -i "content-type" | head -1)
echo "Content-Type: $CONTENT_TYPE"

CONTENT_DISP=$(curl -s -I "http://localhost:8000/api/v1/farm/plant-data/template/csv" \
  -H "Authorization: Bearer $TOKEN" | grep -i "content-disposition" | head -1)
echo "Content-Disposition: $CONTENT_DISP"

# Show file contents
echo ""
echo "STEP 4: CSV file contents:"
cat /tmp/plant_data_template.csv

# Verify headers include required fields
echo ""
echo "STEP 5: Verify headers"
HEADER=$(head -1 /tmp/plant_data_template.csv)
echo "Header line: $HEADER"

# Check for required fields
echo ""
echo "Checking required fields:"
echo "$HEADER" | grep -q "plantName" && echo "  plantName: FOUND" || echo "  plantName: MISSING"
echo "$HEADER" | grep -q "scientificName" && echo "  scientificName: FOUND" || echo "  scientificName: MISSING"
echo "$HEADER" | grep -q "plantType" && echo "  plantType (category): FOUND" || echo "  plantType: MISSING"

# Verify it's valid CSV (has comma-separated values)
echo ""
echo "STEP 6: Verify CSV format"
COMMA_COUNT=$(head -1 /tmp/plant_data_template.csv | grep -o "," | wc -l)
echo "Commas in header: $COMMA_COUNT"
LINES=$(wc -l < /tmp/plant_data_template.csv)
echo "Total lines: $LINES (should be 2: header + example)"

echo ""
echo "=== ALL STEPS COMPLETE ==="
