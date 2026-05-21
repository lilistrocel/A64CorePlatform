"""
Default Chart of Accounts seed data.

231 accounts across 9 drawers for a standard UAE agri-business company.
Each tuple: (accountNumber, accountName, drawer, accountType, parentAccountNumber_or_None, isHeader)

Control accounts (isControlAccount=True) are set in the seed loader:
  - 124000-001 Trade Receivables - Customers
  - 221000-001 Trade Payables - Suppliers

Change history:
  2026-05-20: Added 514000-004 Purchase Price Variance (Item 12)
              Added 617000-011 Rounding Differences (Item 10)
              Added 223000-004 Goods Received Not Invoiced (Item 1 — reclassified from 221000-002)
"""

from ...models.orm.models import AccountTypeEnum, DrawerEnum

# fmt: off
# (accountNumber, accountName, drawer, accountType, parentAccountNumber, isHeader)
DEFAULT_COA: list[tuple] = [
    # =========================================================================
    # ASSETS
    # =========================================================================
    ("110000",     "Non-Current Assets",                           DrawerEnum.ASSETS, AccountTypeEnum.ASSET, None,         True),
    ("110000-001", "Property, Plant & Equipment",                  DrawerEnum.ASSETS, AccountTypeEnum.ASSET, "110000",     True),
    ("110000-002", "Land",                                         DrawerEnum.ASSETS, AccountTypeEnum.ASSET, "110000-001", False),
    ("110000-003", "Buildings",                                    DrawerEnum.ASSETS, AccountTypeEnum.ASSET, "110000-001", False),
    ("110000-004", "Greenhouses & Structures",                     DrawerEnum.ASSETS, AccountTypeEnum.ASSET, "110000-001", False),
    ("110000-005", "Machinery & Equipment",                        DrawerEnum.ASSETS, AccountTypeEnum.ASSET, "110000-001", False),
    ("110000-006", "Vehicles",                                     DrawerEnum.ASSETS, AccountTypeEnum.ASSET, "110000-001", False),
    ("110000-007", "Office Equipment",                             DrawerEnum.ASSETS, AccountTypeEnum.ASSET, "110000-001", False),
    ("110000-008", "Irrigation Systems",                           DrawerEnum.ASSETS, AccountTypeEnum.ASSET, "110000-001", False),
    ("110000-009", "Accumulated Depreciation - PPE",               DrawerEnum.ASSETS, AccountTypeEnum.ASSET, "110000-001", False),
    ("111000",     "Intangible Assets",                            DrawerEnum.ASSETS, AccountTypeEnum.ASSET, "110000",     True),
    ("111000-001", "Software Licenses",                            DrawerEnum.ASSETS, AccountTypeEnum.ASSET, "111000",     False),
    ("111000-002", "Patents & IP",                                 DrawerEnum.ASSETS, AccountTypeEnum.ASSET, "111000",     False),
    ("111000-003", "Amortisation - Intangibles",                   DrawerEnum.ASSETS, AccountTypeEnum.ASSET, "111000",     False),
    ("112000",     "Right-of-Use Assets",                          DrawerEnum.ASSETS, AccountTypeEnum.ASSET, "110000",     True),
    ("112000-001", "ROU - Land Leases",                            DrawerEnum.ASSETS, AccountTypeEnum.ASSET, "112000",     False),
    ("112000-002", "ROU - Building Leases",                        DrawerEnum.ASSETS, AccountTypeEnum.ASSET, "112000",     False),
    ("112000-003", "Accumulated Depreciation - ROU",               DrawerEnum.ASSETS, AccountTypeEnum.ASSET, "112000",     False),
    ("113000",     "Biological Assets",                            DrawerEnum.ASSETS, AccountTypeEnum.ASSET, "110000",     True),
    ("113000-001", "Bearer Plants (at Cost)",                      DrawerEnum.ASSETS, AccountTypeEnum.ASSET, "113000",     False),
    ("113000-002", "Accumulated Depreciation - Bearer Plants",     DrawerEnum.ASSETS, AccountTypeEnum.ASSET, "113000",     False),
    ("114000",     "Investments",                                  DrawerEnum.ASSETS, AccountTypeEnum.ASSET, "110000",     True),
    ("114000-001", "Investment in Subsidiaries",                   DrawerEnum.ASSETS, AccountTypeEnum.ASSET, "114000",     False),
    ("114000-002", "Investment in Associates",                     DrawerEnum.ASSETS, AccountTypeEnum.ASSET, "114000",     False),
    ("114000-003", "Other Long-Term Investments",                  DrawerEnum.ASSETS, AccountTypeEnum.ASSET, "114000",     False),

    ("120000",     "Current Assets",                               DrawerEnum.ASSETS, AccountTypeEnum.ASSET, None,         True),
    ("121000",     "Inventories",                                  DrawerEnum.ASSETS, AccountTypeEnum.ASSET, "120000",     True),
    ("121000-001", "Raw Materials - Seeds",                        DrawerEnum.ASSETS, AccountTypeEnum.ASSET, "121000",     False),
    ("121000-002", "Raw Materials - Fertilisers",                  DrawerEnum.ASSETS, AccountTypeEnum.ASSET, "121000",     False),
    ("121000-003", "Raw Materials - Pesticides",                   DrawerEnum.ASSETS, AccountTypeEnum.ASSET, "121000",     False),
    ("121000-004", "Raw Materials - Packaging",                    DrawerEnum.ASSETS, AccountTypeEnum.ASSET, "121000",     False),
    ("121000-005", "Work in Progress - Crops",                     DrawerEnum.ASSETS, AccountTypeEnum.ASSET, "121000",     False),
    ("121000-006", "Finished Goods - Produce",                     DrawerEnum.ASSETS, AccountTypeEnum.ASSET, "121000",     False),
    ("121000-007", "Provision for Obsolescence",                   DrawerEnum.ASSETS, AccountTypeEnum.ASSET, "121000",     False),
    ("122000",     "Tax Recoverable",                              DrawerEnum.ASSETS, AccountTypeEnum.ASSET, "120000",     True),
    ("122000-001", "Input VAT Recoverable",                        DrawerEnum.ASSETS, AccountTypeEnum.ASSET, "122000",     False),
    ("122000-002", "VAT Refund Claim",                             DrawerEnum.ASSETS, AccountTypeEnum.ASSET, "122000",     False),
    ("123000",     "Prepayments & Deposits",                       DrawerEnum.ASSETS, AccountTypeEnum.ASSET, "120000",     True),
    ("123000-001", "Prepaid Insurance",                            DrawerEnum.ASSETS, AccountTypeEnum.ASSET, "123000",     False),
    ("123000-002", "Prepaid Rent",                                 DrawerEnum.ASSETS, AccountTypeEnum.ASSET, "123000",     False),
    ("123000-003", "Security Deposits",                            DrawerEnum.ASSETS, AccountTypeEnum.ASSET, "123000",     False),
    ("123000-004", "Advances to Suppliers",                        DrawerEnum.ASSETS, AccountTypeEnum.ASSET, "123000",     False),
    ("124000",     "Trade Receivables",                            DrawerEnum.ASSETS, AccountTypeEnum.ASSET, "120000",     True),
    ("124000-001", "Trade Receivables - Customers",                DrawerEnum.ASSETS, AccountTypeEnum.ASSET, "124000",     False),
    ("124000-002", "Allowance for Doubtful Debts",                 DrawerEnum.ASSETS, AccountTypeEnum.ASSET, "124000",     False),
    ("124000-003", "Credit Notes Receivable",                      DrawerEnum.ASSETS, AccountTypeEnum.ASSET, "124000",     False),
    ("125000",     "Other Receivables",                            DrawerEnum.ASSETS, AccountTypeEnum.ASSET, "120000",     True),
    ("125000-001", "Staff Loans & Advances",                       DrawerEnum.ASSETS, AccountTypeEnum.ASSET, "125000",     False),
    ("125000-002", "Due from Related Parties",                     DrawerEnum.ASSETS, AccountTypeEnum.ASSET, "125000",     False),
    ("125000-003", "Other Short-Term Receivables",                 DrawerEnum.ASSETS, AccountTypeEnum.ASSET, "125000",     False),
    ("126000",     "Cash & Cash Equivalents",                      DrawerEnum.ASSETS, AccountTypeEnum.ASSET, "120000",     True),
    ("126000-001", "Petty Cash",                                   DrawerEnum.ASSETS, AccountTypeEnum.ASSET, "126000",     False),
    ("126000-002", "Cash at Bank - AED Operating",                 DrawerEnum.ASSETS, AccountTypeEnum.ASSET, "126000",     False),
    ("126000-003", "Cash at Bank - AED Payroll",                   DrawerEnum.ASSETS, AccountTypeEnum.ASSET, "126000",     False),
    ("126000-004", "Cash at Bank - USD",                           DrawerEnum.ASSETS, AccountTypeEnum.ASSET, "126000",     False),
    ("126000-005", "Cash at Bank - EUR",                           DrawerEnum.ASSETS, AccountTypeEnum.ASSET, "126000",     False),

    # =========================================================================
    # LIABILITIES
    # =========================================================================
    ("210000",     "Non-Current Liabilities",                      DrawerEnum.LIABILITIES, AccountTypeEnum.LIABILITY, None,         True),
    ("211000",     "Long-Term Borrowings",                         DrawerEnum.LIABILITIES, AccountTypeEnum.LIABILITY, "210000",     True),
    ("211000-001", "Bank Loans - Long Term",                       DrawerEnum.LIABILITIES, AccountTypeEnum.LIABILITY, "211000",     False),
    ("211000-002", "Lease Liabilities - Non-Current",              DrawerEnum.LIABILITIES, AccountTypeEnum.LIABILITY, "211000",     False),
    ("212000",     "Deferred Tax Liabilities",                     DrawerEnum.LIABILITIES, AccountTypeEnum.LIABILITY, "210000",     True),
    ("212000-001", "Deferred Tax Liability",                       DrawerEnum.LIABILITIES, AccountTypeEnum.LIABILITY, "212000",     False),
    ("213000",     "Employee Benefits - Non-Current",              DrawerEnum.LIABILITIES, AccountTypeEnum.LIABILITY, "210000",     True),
    ("213000-001", "End of Service Benefits Provision",            DrawerEnum.LIABILITIES, AccountTypeEnum.LIABILITY, "213000",     False),

    ("220000",     "Current Liabilities",                          DrawerEnum.LIABILITIES, AccountTypeEnum.LIABILITY, None,         True),
    ("221000",     "Trade Payables",                               DrawerEnum.LIABILITIES, AccountTypeEnum.LIABILITY, "220000",     True),
    ("221000-001", "Trade Payables - Suppliers",                   DrawerEnum.LIABILITIES, AccountTypeEnum.LIABILITY, "221000",     False),
    ("221000-002", "Goods Received Not Invoiced",                  DrawerEnum.LIABILITIES, AccountTypeEnum.LIABILITY, "221000",     False),
    ("221000-003", "Credit Notes Payable",                         DrawerEnum.LIABILITIES, AccountTypeEnum.LIABILITY, "221000",     False),
    ("222000",     "Tax Payable",                                  DrawerEnum.LIABILITIES, AccountTypeEnum.LIABILITY, "220000",     True),
    ("222000-001", "Output VAT Payable",                           DrawerEnum.LIABILITIES, AccountTypeEnum.LIABILITY, "222000",     False),
    ("222000-002", "Reverse Charge VAT Output",                    DrawerEnum.LIABILITIES, AccountTypeEnum.LIABILITY, "222000",     False),
    ("222000-003", "Corporate Tax Payable",                        DrawerEnum.LIABILITIES, AccountTypeEnum.LIABILITY, "222000",     False),
    ("223000",     "Accruals & Deferred Income",                   DrawerEnum.LIABILITIES, AccountTypeEnum.LIABILITY, "220000",     True),
    ("223000-001", "Accrued Expenses",                             DrawerEnum.LIABILITIES, AccountTypeEnum.LIABILITY, "223000",     False),
    ("223000-002", "Deferred Revenue",                             DrawerEnum.LIABILITIES, AccountTypeEnum.LIABILITY, "223000",     False),
    ("223000-003", "Customer Deposits Received",                   DrawerEnum.LIABILITIES, AccountTypeEnum.LIABILITY, "223000",     False),
    # Item 1: GR/IR reclassified from Trade Payables (221000-002) to Accrued Liabilities.
    # IAS 37 / IAS 2 — goods received but not yet invoiced are accrued liabilities,
    # not specific trade payables.  The old 221000-002 row is kept inactive for JE history.
    ("223000-004", "Goods Received Not Invoiced",                  DrawerEnum.LIABILITIES, AccountTypeEnum.LIABILITY, "223000",     False),
    ("224000",     "Short-Term Borrowings",                        DrawerEnum.LIABILITIES, AccountTypeEnum.LIABILITY, "220000",     True),
    ("224000-001", "Bank Overdraft",                               DrawerEnum.LIABILITIES, AccountTypeEnum.LIABILITY, "224000",     False),
    ("224000-002", "Bank Loans - Short Term",                      DrawerEnum.LIABILITIES, AccountTypeEnum.LIABILITY, "224000",     False),
    ("224000-003", "Lease Liabilities - Current",                  DrawerEnum.LIABILITIES, AccountTypeEnum.LIABILITY, "224000",     False),
    ("225000",     "Other Current Liabilities",                    DrawerEnum.LIABILITIES, AccountTypeEnum.LIABILITY, "220000",     True),
    ("225000-001", "Salaries Payable",                             DrawerEnum.LIABILITIES, AccountTypeEnum.LIABILITY, "225000",     False),
    ("225000-002", "Due to Related Parties",                       DrawerEnum.LIABILITIES, AccountTypeEnum.LIABILITY, "225000",     False),
    ("225000-003", "Other Short-Term Payables",                    DrawerEnum.LIABILITIES, AccountTypeEnum.LIABILITY, "225000",     False),

    # =========================================================================
    # EQUITY
    # =========================================================================
    ("310000",     "Equity",                                       DrawerEnum.EQUITY, AccountTypeEnum.EQUITY, None,         True),
    ("311000",     "Share Capital",                                DrawerEnum.EQUITY, AccountTypeEnum.EQUITY, "310000",     True),
    ("311000-001", "Issued Share Capital",                         DrawerEnum.EQUITY, AccountTypeEnum.EQUITY, "311000",     False),
    ("311000-002", "Share Premium",                                DrawerEnum.EQUITY, AccountTypeEnum.EQUITY, "311000",     False),
    ("312000",     "Retained Earnings",                            DrawerEnum.EQUITY, AccountTypeEnum.EQUITY, "310000",     True),
    ("312000-001", "Retained Earnings - Prior Years",              DrawerEnum.EQUITY, AccountTypeEnum.EQUITY, "312000",     False),
    ("312000-002", "Current Year Profit / (Loss)",                 DrawerEnum.EQUITY, AccountTypeEnum.EQUITY, "312000",     False),
    ("313000",     "Reserves",                                     DrawerEnum.EQUITY, AccountTypeEnum.EQUITY, "310000",     True),
    ("313000-001", "Statutory Reserve",                            DrawerEnum.EQUITY, AccountTypeEnum.EQUITY, "313000",     False),
    ("313000-002", "Foreign Currency Translation Reserve",         DrawerEnum.EQUITY, AccountTypeEnum.EQUITY, "313000",     False),
    ("313000-003", "Other Comprehensive Income Reserve",           DrawerEnum.EQUITY, AccountTypeEnum.EQUITY, "313000",     False),
    ("314000",     "Drawings & Distributions",                     DrawerEnum.EQUITY, AccountTypeEnum.EQUITY, "310000",     True),
    ("314000-001", "Owner Drawings",                               DrawerEnum.EQUITY, AccountTypeEnum.EQUITY, "314000",     False),
    ("314000-002", "Dividends Paid",                               DrawerEnum.EQUITY, AccountTypeEnum.EQUITY, "314000",     False),

    # =========================================================================
    # REVENUE
    # =========================================================================
    ("410000",     "Revenue",                                      DrawerEnum.REVENUE, AccountTypeEnum.REVENUE, None,         True),
    ("411000",     "Product Sales",                                DrawerEnum.REVENUE, AccountTypeEnum.REVENUE, "410000",     True),
    ("411000-001", "Sales - Fresh Vegetables",                     DrawerEnum.REVENUE, AccountTypeEnum.REVENUE, "411000",     False),
    ("411000-002", "Sales - Fresh Herbs",                          DrawerEnum.REVENUE, AccountTypeEnum.REVENUE, "411000",     False),
    ("411000-003", "Sales - Microgreens",                          DrawerEnum.REVENUE, AccountTypeEnum.REVENUE, "411000",     False),
    ("411000-004", "Sales - Leafy Greens",                         DrawerEnum.REVENUE, AccountTypeEnum.REVENUE, "411000",     False),
    ("411000-005", "Sales - Fruiting Crops",                       DrawerEnum.REVENUE, AccountTypeEnum.REVENUE, "411000",     False),
    ("411000-006", "Sales - Root Vegetables",                      DrawerEnum.REVENUE, AccountTypeEnum.REVENUE, "411000",     False),
    ("411000-007", "Sales - Edible Flowers",                       DrawerEnum.REVENUE, AccountTypeEnum.REVENUE, "411000",     False),
    ("411000-008", "Sales - Seedlings & Transplants",              DrawerEnum.REVENUE, AccountTypeEnum.REVENUE, "411000",     False),
    ("412000",     "Service Revenue",                              DrawerEnum.REVENUE, AccountTypeEnum.REVENUE, "410000",     True),
    ("412000-001", "Consulting & Advisory Services",               DrawerEnum.REVENUE, AccountTypeEnum.REVENUE, "412000",     False),
    ("412000-002", "Farm Management Services",                     DrawerEnum.REVENUE, AccountTypeEnum.REVENUE, "412000",     False),
    ("412000-003", "Training & Education",                         DrawerEnum.REVENUE, AccountTypeEnum.REVENUE, "412000",     False),
    ("413000",     "Export Sales",                                 DrawerEnum.REVENUE, AccountTypeEnum.REVENUE, "410000",     True),
    ("413000-001", "Export Sales - GCC",                          DrawerEnum.REVENUE, AccountTypeEnum.REVENUE, "413000",     False),
    ("413000-002", "Export Sales - International",                 DrawerEnum.REVENUE, AccountTypeEnum.REVENUE, "413000",     False),
    ("414000",     "Revenue Adjustments",                          DrawerEnum.REVENUE, AccountTypeEnum.REVENUE, "410000",     True),
    ("414000-001", "Sales Returns & Allowances",                   DrawerEnum.REVENUE, AccountTypeEnum.REVENUE, "414000",     False),
    ("414000-002", "Trade Discounts Given",                        DrawerEnum.REVENUE, AccountTypeEnum.REVENUE, "414000",     False),

    # =========================================================================
    # COST OF SALES
    # =========================================================================
    ("510000",     "Cost of Sales",                                DrawerEnum.COST_OF_SALES, AccountTypeEnum.EXPENSE, None,         True),
    ("511000",     "Direct Material Costs",                        DrawerEnum.COST_OF_SALES, AccountTypeEnum.EXPENSE, "510000",     True),
    ("511000-001", "Seeds & Propagation Materials",                DrawerEnum.COST_OF_SALES, AccountTypeEnum.EXPENSE, "511000",     False),
    ("511000-002", "Fertilisers & Nutrients",                      DrawerEnum.COST_OF_SALES, AccountTypeEnum.EXPENSE, "511000",     False),
    ("511000-003", "Pesticides & Fungicides",                      DrawerEnum.COST_OF_SALES, AccountTypeEnum.EXPENSE, "511000",     False),
    ("511000-004", "Growth Media & Substrate",                     DrawerEnum.COST_OF_SALES, AccountTypeEnum.EXPENSE, "511000",     False),
    ("511000-005", "Irrigation Water & Consumables",               DrawerEnum.COST_OF_SALES, AccountTypeEnum.EXPENSE, "511000",     False),
    ("511000-006", "Packaging Materials",                          DrawerEnum.COST_OF_SALES, AccountTypeEnum.EXPENSE, "511000",     False),
    ("511000-007", "Cold Chain & Refrigeration Consumables",       DrawerEnum.COST_OF_SALES, AccountTypeEnum.EXPENSE, "511000",     False),
    ("512000",     "Direct Labour",                                DrawerEnum.COST_OF_SALES, AccountTypeEnum.EXPENSE, "510000",     True),
    ("512000-001", "Farm Labour - Planting",                       DrawerEnum.COST_OF_SALES, AccountTypeEnum.EXPENSE, "512000",     False),
    ("512000-002", "Farm Labour - Harvesting",                     DrawerEnum.COST_OF_SALES, AccountTypeEnum.EXPENSE, "512000",     False),
    ("512000-003", "Farm Labour - Post-Harvest Processing",        DrawerEnum.COST_OF_SALES, AccountTypeEnum.EXPENSE, "512000",     False),
    ("512000-004", "Labour Overtime",                              DrawerEnum.COST_OF_SALES, AccountTypeEnum.EXPENSE, "512000",     False),
    ("512000-005", "Labour Benefits & Allowances - Direct",        DrawerEnum.COST_OF_SALES, AccountTypeEnum.EXPENSE, "512000",     False),
    ("513000",     "Production Overheads",                         DrawerEnum.COST_OF_SALES, AccountTypeEnum.EXPENSE, "510000",     True),
    ("513000-001", "Electricity - Greenhouses",                    DrawerEnum.COST_OF_SALES, AccountTypeEnum.EXPENSE, "513000",     False),
    ("513000-002", "Water - Irrigation",                           DrawerEnum.COST_OF_SALES, AccountTypeEnum.EXPENSE, "513000",     False),
    ("513000-003", "Equipment Depreciation - Production",          DrawerEnum.COST_OF_SALES, AccountTypeEnum.EXPENSE, "513000",     False),
    ("513000-004", "Repairs & Maintenance - Production",           DrawerEnum.COST_OF_SALES, AccountTypeEnum.EXPENSE, "513000",     False),
    ("514000",     "Inventory Adjustments",                        DrawerEnum.COST_OF_SALES, AccountTypeEnum.EXPENSE, "510000",     True),
    ("514000-001", "Inventory Write-Offs",                         DrawerEnum.COST_OF_SALES, AccountTypeEnum.EXPENSE, "514000",     False),
    ("514000-002", "Waste & Spoilage",                             DrawerEnum.COST_OF_SALES, AccountTypeEnum.EXPENSE, "514000",     False),
    ("514000-003", "Cycle Count Adjustments",                      DrawerEnum.COST_OF_SALES, AccountTypeEnum.EXPENSE, "514000",     False),
    # Item 12: PPV account — captures the difference between PO price and invoice price.
    # Required by Phase C AP Invoice posting handler (purchase price variance JE leg).
    ("514000-004", "Purchase Price Variance",                      DrawerEnum.COST_OF_SALES, AccountTypeEnum.EXPENSE, "514000",     False),

    # =========================================================================
    # OPERATING COST
    # =========================================================================
    ("610000",     "Operating Expenses",                           DrawerEnum.OPERATING_COST, AccountTypeEnum.EXPENSE, None,         True),
    ("611000",     "Salaries & Employee Benefits",                 DrawerEnum.OPERATING_COST, AccountTypeEnum.EXPENSE, "610000",     True),
    ("611000-001", "Management Salaries",                          DrawerEnum.OPERATING_COST, AccountTypeEnum.EXPENSE, "611000",     False),
    ("611000-002", "Administrative Salaries",                      DrawerEnum.OPERATING_COST, AccountTypeEnum.EXPENSE, "611000",     False),
    ("611000-003", "Sales & Marketing Salaries",                   DrawerEnum.OPERATING_COST, AccountTypeEnum.EXPENSE, "611000",     False),
    ("611000-004", "End of Service Benefits Expense",              DrawerEnum.OPERATING_COST, AccountTypeEnum.EXPENSE, "611000",     False),
    ("611000-005", "Medical Insurance",                            DrawerEnum.OPERATING_COST, AccountTypeEnum.EXPENSE, "611000",     False),
    ("611000-006", "Housing Allowance",                            DrawerEnum.OPERATING_COST, AccountTypeEnum.EXPENSE, "611000",     False),
    ("611000-007", "Transport Allowance",                          DrawerEnum.OPERATING_COST, AccountTypeEnum.EXPENSE, "611000",     False),
    ("612000",     "Occupancy & Facilities",                       DrawerEnum.OPERATING_COST, AccountTypeEnum.EXPENSE, "610000",     True),
    ("612000-001", "Office Rent",                                  DrawerEnum.OPERATING_COST, AccountTypeEnum.EXPENSE, "612000",     False),
    ("612000-002", "Land Lease - Farm",                            DrawerEnum.OPERATING_COST, AccountTypeEnum.EXPENSE, "612000",     False),
    ("612000-003", "Electricity - Office",                         DrawerEnum.OPERATING_COST, AccountTypeEnum.EXPENSE, "612000",     False),
    ("612000-004", "Water & Sewerage - Office",                    DrawerEnum.OPERATING_COST, AccountTypeEnum.EXPENSE, "612000",     False),
    ("612000-005", "Building Maintenance",                         DrawerEnum.OPERATING_COST, AccountTypeEnum.EXPENSE, "612000",     False),
    ("613000",     "Sales & Distribution",                         DrawerEnum.OPERATING_COST, AccountTypeEnum.EXPENSE, "610000",     True),
    ("613000-001", "Delivery & Freight Costs",                     DrawerEnum.OPERATING_COST, AccountTypeEnum.EXPENSE, "613000",     False),
    ("613000-002", "Cold Chain Logistics",                         DrawerEnum.OPERATING_COST, AccountTypeEnum.EXPENSE, "613000",     False),
    ("613000-003", "Sales Commissions",                            DrawerEnum.OPERATING_COST, AccountTypeEnum.EXPENSE, "613000",     False),
    ("613000-004", "Marketing & Advertising",                      DrawerEnum.OPERATING_COST, AccountTypeEnum.EXPENSE, "613000",     False),
    ("613000-005", "Trade Shows & Exhibitions",                    DrawerEnum.OPERATING_COST, AccountTypeEnum.EXPENSE, "613000",     False),
    ("613000-006", "Market Research",                              DrawerEnum.OPERATING_COST, AccountTypeEnum.EXPENSE, "613000",     False),
    ("614000",     "Professional & Legal",                         DrawerEnum.OPERATING_COST, AccountTypeEnum.EXPENSE, "610000",     True),
    ("614000-001", "Legal Fees",                                   DrawerEnum.OPERATING_COST, AccountTypeEnum.EXPENSE, "614000",     False),
    ("614000-002", "Audit & Accounting Fees",                      DrawerEnum.OPERATING_COST, AccountTypeEnum.EXPENSE, "614000",     False),
    ("614000-003", "Consulting Fees",                              DrawerEnum.OPERATING_COST, AccountTypeEnum.EXPENSE, "614000",     False),
    ("614000-004", "Regulatory & Licensing Fees",                  DrawerEnum.OPERATING_COST, AccountTypeEnum.EXPENSE, "614000",     False),
    ("615000",     "Technology & IT",                              DrawerEnum.OPERATING_COST, AccountTypeEnum.EXPENSE, "610000",     True),
    ("615000-001", "Software Subscriptions",                       DrawerEnum.OPERATING_COST, AccountTypeEnum.EXPENSE, "615000",     False),
    ("615000-002", "IT Support & Maintenance",                     DrawerEnum.OPERATING_COST, AccountTypeEnum.EXPENSE, "615000",     False),
    ("615000-003", "Telecommunications",                           DrawerEnum.OPERATING_COST, AccountTypeEnum.EXPENSE, "615000",     False),
    ("615000-004", "Internet & Connectivity",                      DrawerEnum.OPERATING_COST, AccountTypeEnum.EXPENSE, "615000",     False),
    ("616000",     "Depreciation & Amortisation",                  DrawerEnum.OPERATING_COST, AccountTypeEnum.EXPENSE, "610000",     True),
    ("616000-001", "Depreciation - Buildings",                     DrawerEnum.OPERATING_COST, AccountTypeEnum.EXPENSE, "616000",     False),
    ("616000-002", "Depreciation - Greenhouses",                   DrawerEnum.OPERATING_COST, AccountTypeEnum.EXPENSE, "616000",     False),
    ("616000-003", "Depreciation - Vehicles",                      DrawerEnum.OPERATING_COST, AccountTypeEnum.EXPENSE, "616000",     False),
    ("616000-004", "Depreciation - Office Equipment",              DrawerEnum.OPERATING_COST, AccountTypeEnum.EXPENSE, "616000",     False),
    ("616000-005", "Amortisation - Software",                      DrawerEnum.OPERATING_COST, AccountTypeEnum.EXPENSE, "616000",     False),
    ("616000-006", "Depreciation - ROU Assets",                    DrawerEnum.OPERATING_COST, AccountTypeEnum.EXPENSE, "616000",     False),
    ("617000",     "General & Administrative",                     DrawerEnum.OPERATING_COST, AccountTypeEnum.EXPENSE, "610000",     True),
    ("617000-001", "Office Supplies & Stationery",                 DrawerEnum.OPERATING_COST, AccountTypeEnum.EXPENSE, "617000",     False),
    ("617000-002", "Travel & Entertainment",                       DrawerEnum.OPERATING_COST, AccountTypeEnum.EXPENSE, "617000",     False),
    ("617000-003", "Insurance - General",                          DrawerEnum.OPERATING_COST, AccountTypeEnum.EXPENSE, "617000",     False),
    ("617000-004", "Vehicle Running Costs",                        DrawerEnum.OPERATING_COST, AccountTypeEnum.EXPENSE, "617000",     False),
    ("617000-005", "Staff Training & Development",                 DrawerEnum.OPERATING_COST, AccountTypeEnum.EXPENSE, "617000",     False),
    ("617000-006", "Printing & Reproduction",                      DrawerEnum.OPERATING_COST, AccountTypeEnum.EXPENSE, "617000",     False),
    ("617000-007", "Bank Charges",                                 DrawerEnum.OPERATING_COST, AccountTypeEnum.EXPENSE, "617000",     False),
    ("617000-008", "Postage & Courier",                            DrawerEnum.OPERATING_COST, AccountTypeEnum.EXPENSE, "617000",     False),
    ("617000-009", "Miscellaneous Expenses",                       DrawerEnum.OPERATING_COST, AccountTypeEnum.EXPENSE, "617000",     False),
    ("617000-010", "Donations & CSR",                              DrawerEnum.OPERATING_COST, AccountTypeEnum.EXPENSE, "617000",     False),
    # Item 10: Rounding Differences — target for PostingSetup.roundingAccountId.
    # Absorbs sub-cent rounding deltas to keep JEs balanced.
    ("617000-011", "Rounding Differences",                         DrawerEnum.OPERATING_COST, AccountTypeEnum.EXPENSE, "617000",     False),
    ("618000",     "Research & Development",                       DrawerEnum.OPERATING_COST, AccountTypeEnum.EXPENSE, "610000",     True),
    ("618000-001", "R&D - Crop Trials",                            DrawerEnum.OPERATING_COST, AccountTypeEnum.EXPENSE, "618000",     False),
    ("618000-002", "R&D - Technology Development",                 DrawerEnum.OPERATING_COST, AccountTypeEnum.EXPENSE, "618000",     False),
    ("618000-003", "R&D - Lab Testing",                            DrawerEnum.OPERATING_COST, AccountTypeEnum.EXPENSE, "618000",     False),

    # =========================================================================
    # NON_OPERATING
    # =========================================================================
    ("710000",     "Finance Costs",                                DrawerEnum.NON_OPERATING, AccountTypeEnum.EXPENSE, None,         True),
    ("711000",     "Interest Expense",                             DrawerEnum.NON_OPERATING, AccountTypeEnum.EXPENSE, "710000",     True),
    ("711000-001", "Interest on Bank Loans",                       DrawerEnum.NON_OPERATING, AccountTypeEnum.EXPENSE, "711000",     False),
    ("711000-002", "Interest on Overdraft",                        DrawerEnum.NON_OPERATING, AccountTypeEnum.EXPENSE, "711000",     False),
    ("711000-003", "Finance Charges on Lease Liabilities",         DrawerEnum.NON_OPERATING, AccountTypeEnum.EXPENSE, "711000",     False),
    ("712000",     "Foreign Exchange",                             DrawerEnum.NON_OPERATING, AccountTypeEnum.EXPENSE, "710000",     True),
    ("712000-001", "Realised FX Losses",                           DrawerEnum.NON_OPERATING, AccountTypeEnum.EXPENSE, "712000",     False),
    ("712000-002", "Unrealised FX Losses",                         DrawerEnum.NON_OPERATING, AccountTypeEnum.EXPENSE, "712000",     False),
    ("713000",     "Impairment & Write-Offs",                      DrawerEnum.NON_OPERATING, AccountTypeEnum.EXPENSE, "710000",     True),
    ("713000-001", "Impairment of Assets",                         DrawerEnum.NON_OPERATING, AccountTypeEnum.EXPENSE, "713000",     False),
    ("713000-002", "Bad Debt Write-Offs",                          DrawerEnum.NON_OPERATING, AccountTypeEnum.EXPENSE, "713000",     False),

    # =========================================================================
    # OTHER_INCOME
    # =========================================================================
    ("810000",     "Other Income",                                 DrawerEnum.OTHER_INCOME, AccountTypeEnum.REVENUE, None,         True),
    ("811000",     "Finance Income",                               DrawerEnum.OTHER_INCOME, AccountTypeEnum.REVENUE, "810000",     True),
    ("811000-001", "Interest Income",                              DrawerEnum.OTHER_INCOME, AccountTypeEnum.REVENUE, "811000",     False),
    ("811000-002", "Foreign Exchange Gains",                       DrawerEnum.OTHER_INCOME, AccountTypeEnum.REVENUE, "811000",     False),
    ("812000",     "Non-Operating Income",                         DrawerEnum.OTHER_INCOME, AccountTypeEnum.REVENUE, "810000",     True),
    ("812000-001", "Rental Income",                                DrawerEnum.OTHER_INCOME, AccountTypeEnum.REVENUE, "812000",     False),
    ("812000-002", "Government Grants & Subsidies",                DrawerEnum.OTHER_INCOME, AccountTypeEnum.REVENUE, "812000",     False),
    ("812000-003", "Insurance Claims Received",                    DrawerEnum.OTHER_INCOME, AccountTypeEnum.REVENUE, "812000",     False),
    ("812000-004", "Gain on Disposal of Assets",                   DrawerEnum.OTHER_INCOME, AccountTypeEnum.REVENUE, "812000",     False),
    ("812000-005", "Miscellaneous Income",                         DrawerEnum.OTHER_INCOME, AccountTypeEnum.REVENUE, "812000",     False),
    ("812000-006", "Realised FX Gains",                            DrawerEnum.OTHER_INCOME, AccountTypeEnum.REVENUE, "812000",     False),
    ("812000-007", "Unrealised FX Gains",                          DrawerEnum.OTHER_INCOME, AccountTypeEnum.REVENUE, "812000",     False),

    # =========================================================================
    # TAXATION
    # =========================================================================
    ("910000",     "Taxation",                                     DrawerEnum.TAXATION, AccountTypeEnum.EXPENSE, None,         True),
    ("911000",     "Corporate Tax",                                DrawerEnum.TAXATION, AccountTypeEnum.EXPENSE, "910000",     True),
    ("911000-001", "Current Year Corporate Tax",                   DrawerEnum.TAXATION, AccountTypeEnum.EXPENSE, "911000",     False),
    ("911000-002", "Deferred Tax Expense / (Income)",              DrawerEnum.TAXATION, AccountTypeEnum.EXPENSE, "911000",     False),
    ("912000",     "Withholding Tax",                              DrawerEnum.TAXATION, AccountTypeEnum.EXPENSE, "910000",     True),
    ("912000-001", "Withholding Tax on Dividends",                 DrawerEnum.TAXATION, AccountTypeEnum.EXPENSE, "912000",     False),
    ("912000-002", "Withholding Tax on Services",                  DrawerEnum.TAXATION, AccountTypeEnum.EXPENSE, "912000",     False),
]
# fmt: on

# Control account markers: (accountNumber, isControlAccount)
CONTROL_ACCOUNT_NUMBERS: set[str] = {"124000-001", "221000-001"}

# Default tax codes: (taxCode, description, rate, inputTaxAccountNumber, outputTaxAccountNumber)
DEFAULT_TAX_CODES: list[tuple] = [
    ("S",  "Standard Rated 5% (UAE VAT)",   "5.00",  "122000-001", "222000-001"),
    ("Z",  "Zero Rated",                    "0.00",  None,          None),
    ("E",  "Exempt",                        "0.00",  None,          None),
    ("N",  "Out of Scope",                  "0.00",  None,          None),
    ("SR", "Standard Reverse Charge 5%",    "5.00",  "122000-001", "222000-002"),
]
