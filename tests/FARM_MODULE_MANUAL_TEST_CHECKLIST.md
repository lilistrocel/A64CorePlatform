# Farm Management Module - Manual Testing Checklist

**Version:** 1.0
**Date:** 2025-10-30
**Tester:** _________________
**Environment:** Development (http://localhost:5173)

---

## Pre-Test Setup

- [ ] Frontend server is running at http://localhost:5173
- [ ] Backend API is running at http://localhost:8001
- [ ] Browser: Chrome/Firefox/Safari (specify: ____________)
- [ ] Viewport size: ____________ x ____________
- [ ] Test user logged in: admin@a64platform.com

---

## PRIORITY 1 TESTS (CRITICAL) ⭐⭐⭐

### 1.1 Navigation to Farm Manager

| Test ID | Test Case | Expected Result | Pass/Fail | Notes |
|---------|-----------|----------------|-----------|-------|
| NAV-01 | "Farm Manager" appears in sidebar navigation | Link is visible and clickable | ⬜ Pass ⬜ Fail | |
| NAV-02 | Clicking "Farm Manager" navigates to `/farm` | URL changes to /farm, dashboard loads | ⬜ Pass ⬜ Fail | |
| NAV-03 | Navigation persists after page refresh | After refresh, still on /farm page | ⬜ Pass ⬜ Fail | |
| NAV-04 | Page title updates to "Farm Manager Dashboard" | H1 title displays correctly | ⬜ Pass ⬜ Fail | |

**Section Score:** ___ / 4

---

### 1.2 Farm Dashboard Metrics Display

| Test ID | Test Case | Expected Result | Pass/Fail | Notes |
|---------|-----------|----------------|-----------|-------|
| DASH-01 | "Total Farms" metric card displays | Card visible with farm icon 🏞️ | ⬜ Pass ⬜ Fail | Value: ___ |
| DASH-02 | "Total Blocks" metric card displays | Card visible with block icon 🏗️ | ⬜ Pass ⬜ Fail | Value: ___ |
| DASH-03 | "Active Plantings" metric card displays | Card visible with planting icon 🌱 | ⬜ Pass ⬜ Fail | Value: ___ |
| DASH-04 | "Upcoming Harvests" metric card displays | Card visible with harvest icon 🌾 | ⬜ Pass ⬜ Fail | Value: ___ |
| DASH-05 | Block state badges display correctly | Empty (gray), Planned (blue), Planted (green), Harvesting (yellow) | ⬜ Pass ⬜ Fail | |
| DASH-06 | Metrics load within 2 seconds | Dashboard data loads quickly | ⬜ Pass ⬜ Fail | Load time: ___ms |
| DASH-07 | Loading spinner shows during data fetch | Spinner visible initially | ⬜ Pass ⬜ Fail | |
| DASH-08 | Error state displays if API fails | Error message shows when backend unavailable | ⬜ Pass ⬜ Fail | |

**Section Score:** ___ / 8

---

### 1.3 Quick Actions Section

| Test ID | Test Case | Expected Result | Pass/Fail | Notes |
|---------|-----------|----------------|-----------|-------|
| QA-01 | "Manage Farms" button visible | Primary blue button with farm icon | ⬜ Pass ⬜ Fail | |
| QA-02 | "Manage Farms" navigates to `/farm/farms` | Click navigates to farm list | ⬜ Pass ⬜ Fail | |
| QA-03 | "Plant Data Library" button visible | Secondary green button with plant icon | ⬜ Pass ⬜ Fail | |
| QA-04 | "View Plantings" button visible | Outline button with clipboard icon | ⬜ Pass ⬜ Fail | |
| QA-05 | Button hover effects work | Background color changes on hover | ⬜ Pass ⬜ Fail | |

**Section Score:** ___ / 5

---

### 1.4 Farm List View

| Test ID | Test Case | Expected Result | Pass/Fail | Notes |
|---------|-----------|----------------|-----------|-------|
| LIST-01 | Farm list page loads at `/farm/farms` | URL correct, page displays | ⬜ Pass ⬜ Fail | |
| LIST-02 | Search bar present at top | Search input visible | ⬜ Pass ⬜ Fail | |
| LIST-03 | "Create Farm" button visible | Button visible and clickable | ⬜ Pass ⬜ Fail | |
| LIST-04 | Farms display in grid layout | Cards arranged in grid | ⬜ Pass ⬜ Fail | Columns: ___ |
| LIST-05 | Farm cards show name | Farm name displays on card | ⬜ Pass ⬜ Fail | |
| LIST-06 | Farm cards show location (city, state) | Location displays correctly | ⬜ Pass ⬜ Fail | |
| LIST-07 | Farm cards show total area | Area displays with unit | ⬜ Pass ⬜ Fail | |
| LIST-08 | Farm cards show number of blocks | Block count displays | ⬜ Pass ⬜ Fail | |
| LIST-09 | Farm cards show status badge | Active/Inactive badge displays | ⬜ Pass ⬜ Fail | |
| LIST-10 | Farm cards have action buttons | View/Edit/Delete buttons visible | ⬜ Pass ⬜ Fail | |
| LIST-11 | "View" button navigates to farm detail | Click opens farm detail page | ⬜ Pass ⬜ Fail | |
| LIST-12 | Empty state shows if no farms | "No farms" message when empty | ⬜ Pass ⬜ Fail | |

**Section Score:** ___ / 12

---

### 1.5 Create Farm Modal (SCENARIO 1)

| Test ID | Test Case | Expected Result | Pass/Fail | Notes |
|---------|-----------|----------------|-----------|-------|
| CREATE-01 | Click "Create Farm" opens modal | Modal appears with title "Create New Farm" | ⬜ Pass ⬜ Fail | |
| CREATE-02 | Modal has close button (X) | X button visible in top-right | ⬜ Pass ⬜ Fail | |
| CREATE-03 | Modal has Cancel button | Cancel button visible in footer | ⬜ Pass ⬜ Fail | |
| CREATE-04 | Modal has Submit button | "Create Farm" submit button visible | ⬜ Pass ⬜ Fail | |
| CREATE-05 | Name field present (required) | Input with label "Farm Name *" | ⬜ Pass ⬜ Fail | |
| CREATE-06 | City field present (required) | Input with label "City *" | ⬜ Pass ⬜ Fail | |
| CREATE-07 | State field present (required) | Input with label "State/Province *" | ⬜ Pass ⬜ Fail | |
| CREATE-08 | Country field present (required) | Input with label "Country *" | ⬜ Pass ⬜ Fail | |
| CREATE-09 | Total Area field present (required) | Number input with label "Total Area (hectares) *" | ⬜ Pass ⬜ Fail | |
| CREATE-10 | Manager ID field present (required) | Input with label "Manager ID *" | ⬜ Pass ⬜ Fail | |
| CREATE-11 | Active checkbox present | Checkbox "Mark farm as active" | ⬜ Pass ⬜ Fail | |
| CREATE-12 | Empty required fields show validation error | Red border and error text appear | ⬜ Pass ⬜ Fail | |
| CREATE-13 | Negative area value shows error | Validation error for negative number | ⬜ Pass ⬜ Fail | |
| CREATE-14 | Zero area value shows error | Validation error for zero | ⬜ Pass ⬜ Fail | |
| CREATE-15 | Submit disabled if form invalid | Button disabled when errors present | ⬜ Pass ⬜ Fail | |

**Create Farm with Valid Data:**

| Field | Value to Enter | ✓ |
|-------|----------------|---|
| Name | Test Farm Alpha | ⬜ |
| City | Sacramento | ⬜ |
| State | California | ⬜ |
| Country | USA | ⬜ |
| Total Area | 50.5 | ⬜ |
| Manager ID | test-manager-id | ⬜ |
| Active | ✓ Checked | ⬜ |

| Test ID | Test Case | Expected Result | Pass/Fail | Notes |
|---------|-----------|----------------|-----------|-------|
| CREATE-16 | Submit form with valid data | Loading state shows "Creating..." | ⬜ Pass ⬜ Fail | |
| CREATE-17 | Success toast appears | Success message displays | ⬜ Pass ⬜ Fail | |
| CREATE-18 | Modal closes after success | Modal disappears automatically | ⬜ Pass ⬜ Fail | |
| CREATE-19 | Farm list refreshes with new farm | New farm "Test Farm Alpha" appears in list | ⬜ Pass ⬜ Fail | |
| CREATE-20 | Error toast appears on API failure | Error message if submission fails | ⬜ Pass ⬜ Fail | |
| CREATE-21 | Click X closes modal | Modal closes without submission | ⬜ Pass ⬜ Fail | |
| CREATE-22 | Click Cancel closes modal | Modal closes without submission | ⬜ Pass ⬜ Fail | |
| CREATE-23 | Click outside modal closes it | Overlay click closes modal | ⬜ Pass ⬜ Fail | |
| CREATE-24 | Escape key closes modal | Press ESC to close | ⬜ Pass ⬜ Fail | |

**Section Score:** ___ / 24

---

### 1.6 Block State Transitions & Colors (SCENARIO 2) 🎨

**CRITICAL: Block State Colors MUST Match Exactly**

| State | Expected Color (HEX) | Expected Color (RGB) | Visual Check |
|-------|---------------------|----------------------|--------------|
| Empty | `#6B7280` | `rgb(107, 114, 128)` | Gray ⬜ |
| Planned | `#3B82F6` | `rgb(59, 130, 246)` | Blue ⬜ |
| Planted | `#10B981` | `rgb(16, 185, 129)` | Green ⬜ |
| Harvesting | `#F59E0B` | `rgb(245, 158, 11)` | Yellow/Orange ⬜ |
| Alert | `#EF4444` | `rgb(239, 68, 68)` | Red ⬜ |

**Navigate to a farm with blocks:**
1. Go to Farm List
2. Click "View" on any farm
3. Click "Blocks" tab

| Test ID | Test Case | Expected Result | Pass/Fail | Notes |
|---------|-----------|----------------|-----------|-------|
| BLOCK-01 | Block grid displays blocks | Blocks shown in grid layout | ⬜ Pass ⬜ Fail | Count: ___ |
| BLOCK-02 | Block cards have state badges | Badge displays state name | ⬜ Pass ⬜ Fail | |
| BLOCK-03 | Block cards have border color | Left border matches state color | ⬜ Pass ⬜ Fail | |
| BLOCK-04 | Empty block displays GRAY (#6B7280) | Visual confirmation of gray | ⬜ Pass ⬜ Fail | |
| BLOCK-05 | Planned block displays BLUE (#3B82F6) | Visual confirmation of blue | ⬜ Pass ⬜ Fail | |
| BLOCK-06 | Planted block displays GREEN (#10B981) | Visual confirmation of green | ⬜ Pass ⬜ Fail | |
| BLOCK-07 | Harvesting block displays YELLOW (#F59E0B) | Visual confirmation of yellow | ⬜ Pass ⬜ Fail | |
| BLOCK-08 | Alert block displays RED (#EF4444) | Visual confirmation of red | ⬜ Pass ⬜ Fail | |

**State Transition Testing:**

Find an **Empty** block and test transitions:

| Test ID | Test Case | Expected Result | Pass/Fail | Notes |
|---------|-----------|----------------|-----------|-------|
| TRANS-01 | Empty block has state dropdown | Dropdown/select visible | ⬜ Pass ⬜ Fail | |
| TRANS-02 | Empty → Planned option appears | Only "Planned" in dropdown | ⬜ Pass ⬜ Fail | |
| TRANS-03 | Transition Empty → Planned works | Select "Planned", API call succeeds | ⬜ Pass ⬜ Fail | |
| TRANS-04 | Block color changes to BLUE | Color updates immediately | ⬜ Pass ⬜ Fail | |
| TRANS-05 | Success toast appears | Transition success message | ⬜ Pass ⬜ Fail | |

Now test from **Planned** state:

| Test ID | Test Case | Expected Result | Pass/Fail | Notes |
|---------|-----------|----------------|-----------|-------|
| TRANS-06 | Planned → Planted option appears | "Planted" and "Empty" in dropdown | ⬜ Pass ⬜ Fail | |
| TRANS-07 | Planned → Empty option appears | Can transition back to Empty | ⬜ Pass ⬜ Fail | |
| TRANS-08 | Transition Planned → Planted works | Select "Planted", succeeds | ⬜ Pass ⬜ Fail | |
| TRANS-09 | Block color changes to GREEN | Color updates immediately | ⬜ Pass ⬜ Fail | |

Now test from **Planted** state:

| Test ID | Test Case | Expected Result | Pass/Fail | Notes |
|---------|-----------|----------------|-----------|-------|
| TRANS-10 | Planted → Harvesting option appears | "Harvesting" in dropdown | ⬜ Pass ⬜ Fail | |
| TRANS-11 | Planted → Alert option appears | "Alert" in dropdown | ⬜ Pass ⬜ Fail | |
| TRANS-12 | Planted → Empty option appears | "Empty" in dropdown | ⬜ Pass ⬜ Fail | |
| TRANS-13 | Transition Planted → Harvesting works | Select "Harvesting", succeeds | ⬜ Pass ⬜ Fail | |
| TRANS-14 | Block color changes to YELLOW | Color updates immediately | ⬜ Pass ⬜ Fail | |

**Invalid transitions should NOT appear:**

| Test ID | Test Case | Expected Result | Pass/Fail | Notes |
|---------|-----------|----------------|-----------|-------|
| TRANS-15 | Empty cannot go to Planted | "Planted" NOT in Empty dropdown | ⬜ Pass ⬜ Fail | |
| TRANS-16 | Empty cannot go to Harvesting | "Harvesting" NOT in Empty dropdown | ⬜ Pass ⬜ Fail | |
| TRANS-17 | Planned cannot go to Harvesting | "Harvesting" NOT in Planned dropdown | ⬜ Pass ⬜ Fail | |

**Section Score:** ___ / 25

---

### 1.7 API Error Handling (SCENARIO 4)

**Setup:** Stop the backend server before running these tests.

| Test ID | Test Case | Expected Result | Pass/Fail | Notes |
|---------|-----------|----------------|-----------|-------|
| ERR-01 | Dashboard loads with backend down | Error message displays | ⬜ Pass ⬜ Fail | Message: |
| ERR-02 | Error message is user-friendly | No technical jargon | ⬜ Pass ⬜ Fail | |
| ERR-03 | Try block state transition (backend down) | Error toast appears | ⬜ Pass ⬜ Fail | |
| ERR-04 | Error toast auto-dismisses | Toast disappears after 5 seconds | ⬜ Pass ⬜ Fail | |
| ERR-05 | UI doesn't break on error | Page remains functional | ⬜ Pass ⬜ Fail | |
| ERR-06 | Restart backend and retry | Operation succeeds after backend up | ⬜ Pass ⬜ Fail | |
| ERR-07 | Network error shows friendly message | Not "Failed to fetch" raw error | ⬜ Pass ⬜ Fail | |

**Section Score:** ___ / 7

---

## PRIORITY 2 TESTS (IMPORTANT) ⭐⭐

### 2.1 Farm Detail Tabs

Navigate to a farm detail page.

| Test ID | Test Case | Expected Result | Pass/Fail | Notes |
|---------|-----------|----------------|-----------|-------|
| TAB-01 | Four tabs visible | Overview, Blocks, Plantings, Statistics | ⬜ Pass ⬜ Fail | |
| TAB-02 | Active tab is highlighted | Visual indicator on active tab | ⬜ Pass ⬜ Fail | |
| TAB-03 | Click "Overview" tab | Overview content displays | ⬜ Pass ⬜ Fail | |
| TAB-04 | Click "Blocks" tab | Blocks grid displays | ⬜ Pass ⬜ Fail | |
| TAB-05 | Click "Plantings" tab | Plantings list displays | ⬜ Pass ⬜ Fail | |
| TAB-06 | Click "Statistics" tab | Statistics charts display | ⬜ Pass ⬜ Fail | |
| TAB-07 | Tab switching is smooth | No lag between tab changes | ⬜ Pass ⬜ Fail | Time: ___ms |
| TAB-08 | Tab state persists on refresh | Active tab remains after refresh | ⬜ Pass ⬜ Fail | |

**Overview Tab Content:**

| Test ID | Test Case | Expected Result | Pass/Fail | Notes |
|---------|-----------|----------------|-----------|-------|
| TAB-09 | Farm details section displays | Name, Location, Area, Manager, Status | ⬜ Pass ⬜ Fail | |
| TAB-10 | Quick stats cards display | Total Blocks, Active Plantings, Planted Area | ⬜ Pass ⬜ Fail | |
| TAB-11 | "Edit Farm" button present | Edit button visible | ⬜ Pass ⬜ Fail | |
| TAB-12 | "Delete Farm" button present | Delete button visible | ⬜ Pass ⬜ Fail | |

**Blocks Tab Content:**

| Test ID | Test Case | Expected Result | Pass/Fail | Notes |
|---------|-----------|----------------|-----------|-------|
| TAB-13 | Block grid displays | Grid layout with block cards | ⬜ Pass ⬜ Fail | |
| TAB-14 | "Create Block" button visible | Button at top of blocks section | ⬜ Pass ⬜ Fail | |
| TAB-15 | Empty state if no blocks | "No blocks" message displays | ⬜ Pass ⬜ Fail | |
| TAB-16 | Block card shows name | Block name visible | ⬜ Pass ⬜ Fail | |
| TAB-17 | Block card shows state badge | State badge with color | ⬜ Pass ⬜ Fail | |
| TAB-18 | Block card shows area | Area in hectares | ⬜ Pass ⬜ Fail | |
| TAB-19 | Block card shows max plants | Plant capacity | ⬜ Pass ⬜ Fail | |
| TAB-20 | Block card shows current planting (if any) | Planting info displays | ⬜ Pass ⬜ Fail | |
| TAB-21 | Block action buttons present | View, Edit, Delete, State dropdown | ⬜ Pass ⬜ Fail | |

**Plantings Tab Content:**

| Test ID | Test Case | Expected Result | Pass/Fail | Notes |
|---------|-----------|----------------|-----------|-------|
| TAB-22 | Planting list displays | List or grid of plantings | ⬜ Pass ⬜ Fail | |
| TAB-23 | "Create Planting Plan" button visible | Button at top | ⬜ Pass ⬜ Fail | |
| TAB-24 | Filter by status dropdown present | Status filter dropdown | ⬜ Pass ⬜ Fail | |
| TAB-25 | Planting card shows ID | Planting ID visible | ⬜ Pass ⬜ Fail | |
| TAB-26 | Planting card shows block name | Associated block name | ⬜ Pass ⬜ Fail | |
| TAB-27 | Planting card shows plant names | List of plants | ⬜ Pass ⬜ Fail | |
| TAB-28 | Planting card shows total plants | Plant count | ⬜ Pass ⬜ Fail | |
| TAB-29 | Planting card shows predicted yield | Yield estimate | ⬜ Pass ⬜ Fail | |
| TAB-30 | Planting card shows status | Status badge | ⬜ Pass ⬜ Fail | |

**Statistics Tab Content:**

| Test ID | Test Case | Expected Result | Pass/Fail | Notes |
|---------|-----------|----------------|-----------|-------|
| TAB-31 | Farm summary stats display | Key metrics visible | ⬜ Pass ⬜ Fail | |
| TAB-32 | Block state distribution shows | Chart or cards by state | ⬜ Pass ⬜ Fail | |
| TAB-33 | Yield predictions display | Predicted yield data | ⬜ Pass ⬜ Fail | |
| TAB-34 | Data loads correctly | All stats populated | ⬜ Pass ⬜ Fail | |

**Section Score:** ___ / 34

---

### 2.2 Search and Filter (SCENARIO 3)

Go to Farm List page.

| Test ID | Test Case | Expected Result | Pass/Fail | Notes |
|---------|-----------|----------------|-----------|-------|
| SEARCH-01 | Enter search term "Test" | Results filter in real-time | ⬜ Pass ⬜ Fail | Results: ___ |
| SEARCH-02 | Search by farm name | Matching farms display | ⬜ Pass ⬜ Fail | |
| SEARCH-03 | Search by location | Farms in location display | ⬜ Pass ⬜ Fail | |
| SEARCH-04 | Clear search input | All farms display again | ⬜ Pass ⬜ Fail | |
| SEARCH-05 | Search with no results | "No farms found" message | ⬜ Pass ⬜ Fail | |
| SEARCH-06 | Status filter dropdown present | Dropdown visible | ⬜ Pass ⬜ Fail | |
| SEARCH-07 | Select "Active" status filter | Only active farms show | ⬜ Pass ⬜ Fail | Results: ___ |
| SEARCH-08 | Select "Inactive" status filter | Only inactive farms show | ⬜ Pass ⬜ Fail | Results: ___ |
| SEARCH-09 | Select "All" status filter | All farms display | ⬜ Pass ⬜ Fail | Results: ___ |
| SEARCH-10 | Combine search and filter | Both filters apply | ⬜ Pass ⬜ Fail | |
| SEARCH-11 | Search updates URL params | URL contains search query | ⬜ Pass ⬜ Fail | |
| SEARCH-12 | Refresh preserves search/filter | Search persists after refresh | ⬜ Pass ⬜ Fail | |

**Section Score:** ___ / 12

---

### 2.3 Pagination

| Test ID | Test Case | Expected Result | Pass/Fail | Notes |
|---------|-----------|----------------|-----------|-------|
| PAGE-01 | Pagination controls visible (if >20 farms) | Controls at bottom | ⬜ Pass ⬜ Fail | N/A if <20 |
| PAGE-02 | Page numbers clickable | Can click page number | ⬜ Pass ⬜ Fail | |
| PAGE-03 | "Next" button works | Advances to next page | ⬜ Pass ⬜ Fail | |
| PAGE-04 | "Previous" button works | Goes back to previous page | ⬜ Pass ⬜ Fail | |
| PAGE-05 | Current page highlighted | Active page indicator | ⬜ Pass ⬜ Fail | |
| PAGE-06 | Page persists in URL | URL updates with page number | ⬜ Pass ⬜ Fail | |

**Section Score:** ___ / 6

---

### 2.4 Form Validation & Edge Cases

| Test ID | Test Case | Expected Result | Pass/Fail | Notes |
|---------|-----------|----------------|-----------|-------|
| VALID-01 | Name field max length (100 chars) | Error if exceeds 100 | ⬜ Pass ⬜ Fail | |
| VALID-02 | Area accepts decimal values | Can enter 50.5 | ⬜ Pass ⬜ Fail | |
| VALID-03 | Area validation message clear | Helpful error text | ⬜ Pass ⬜ Fail | |
| VALID-04 | Required field asterisks visible | * shown on required fields | ⬜ Pass ⬜ Fail | |
| VALID-05 | Error messages in red | Error text is red (#EF4444) | ⬜ Pass ⬜ Fail | |
| VALID-06 | Input borders turn red on error | Red border on invalid input | ⬜ Pass ⬜ Fail | |
| VALID-07 | Error messages clear on valid input | Errors disappear when corrected | ⬜ Pass ⬜ Fail | |
| VALID-08 | Submit button enabled when valid | Button clickable with valid form | ⬜ Pass ⬜ Fail | |

**Section Score:** ___ / 8

---

### 2.5 Loading States

| Test ID | Test Case | Expected Result | Pass/Fail | Notes |
|---------|-----------|----------------|-----------|-------|
| LOAD-01 | Skeleton loaders during data fetch | Loading placeholders visible | ⬜ Pass ⬜ Fail | |
| LOAD-02 | Spinner on form submission | Loading spinner during submit | ⬜ Pass ⬜ Fail | |
| LOAD-03 | Button text changes during submit | "Creating..." instead of "Create Farm" | ⬜ Pass ⬜ Fail | |
| LOAD-04 | Button disabled during submission | Cannot double-submit | ⬜ Pass ⬜ Fail | |
| LOAD-05 | Loading overlay doesn't block UI | Can still interact with other elements | ⬜ Pass ⬜ Fail | |
| LOAD-06 | Loading state transitions smoothly | No UI flicker | ⬜ Pass ⬜ Fail | |

**Section Score:** ___ / 6

---

## PRIORITY 3 TESTS (NICE TO HAVE) ⭐

### 3.1 Responsive Design (SCENARIO 5)

**Desktop (1920x1080):**

| Test ID | Test Case | Expected Result | Pass/Fail | Notes |
|---------|-----------|----------------|-----------|-------|
| RESP-01 | Layout uses full width appropriately | Content not cramped | ⬜ Pass ⬜ Fail | |
| RESP-02 | Farm cards display in 3-4 column grid | Multi-column layout | ⬜ Pass ⬜ Fail | Columns: ___ |
| RESP-03 | All elements visible and accessible | No overlapping elements | ⬜ Pass ⬜ Fail | |
| RESP-04 | Text readable at desktop size | Font sizes appropriate | ⬜ Pass ⬜ Fail | |

**Tablet (768x1024):**

| Test ID | Test Case | Expected Result | Pass/Fail | Notes |
|---------|-----------|----------------|-----------|-------|
| RESP-05 | Layout adjusts to 2-column grid | Cards reflow to 2 columns | ⬜ Pass ⬜ Fail | |
| RESP-06 | Navigation remains accessible | Sidebar or menu accessible | ⬜ Pass ⬜ Fail | |
| RESP-07 | Forms remain usable | Input fields appropriately sized | ⬜ Pass ⬜ Fail | |
| RESP-08 | Touch targets appropriately sized (44px min) | Buttons easy to tap | ⬜ Pass ⬜ Fail | |

**Mobile (375x667):**

| Test ID | Test Case | Expected Result | Pass/Fail | Notes |
|---------|-----------|----------------|-----------|-------|
| RESP-09 | Layout switches to single column | Cards stack vertically | ⬜ Pass ⬜ Fail | |
| RESP-10 | Sidebar becomes hamburger menu | Menu icon visible | ⬜ Pass ⬜ Fail | |
| RESP-11 | Touch targets appropriately sized | All buttons tappable | ⬜ Pass ⬜ Fail | |
| RESP-12 | Forms remain fully functional | Can complete form on mobile | ⬜ Pass ⬜ Fail | |
| RESP-13 | Text remains readable | No text overflow | ⬜ Pass ⬜ Fail | |
| RESP-14 | Modal fits on screen | Modal scrollable on small screen | ⬜ Pass ⬜ Fail | |
| RESP-15 | Horizontal scrolling not required | Content fits viewport width | ⬜ Pass ⬜ Fail | |

**Section Score:** ___ / 15

---

### 3.2 Keyboard Navigation (Accessibility)

| Test ID | Test Case | Expected Result | Pass/Fail | Notes |
|---------|-----------|----------------|-----------|-------|
| KEY-01 | Tab key navigates through interactive elements | Focus moves logically | ⬜ Pass ⬜ Fail | |
| KEY-02 | Shift+Tab navigates backwards | Reverse tab order works | ⬜ Pass ⬜ Fail | |
| KEY-03 | Enter key activates buttons | Can submit with Enter | ⬜ Pass ⬜ Fail | |
| KEY-04 | Space key activates buttons | Can click with Space | ⬜ Pass ⬜ Fail | |
| KEY-05 | Escape key closes modals | ESC closes modal | ⬜ Pass ⬜ Fail | |
| KEY-06 | Focus visible on all elements | Blue outline on focus | ⬜ Pass ⬜ Fail | |
| KEY-07 | Focus trapped in modal | Tab doesn't leave modal | ⬜ Pass ⬜ Fail | |
| KEY-08 | Can navigate entire form with keyboard | Complete form without mouse | ⬜ Pass ⬜ Fail | |
| KEY-09 | Arrow keys work in dropdowns | Can select with arrows | ⬜ Pass ⬜ Fail | |

**Section Score:** ___ / 9

---

### 3.3 Screen Reader Compatibility

| Test ID | Test Case | Expected Result | Pass/Fail | Notes |
|---------|-----------|----------------|-----------|-------|
| SR-01 | All buttons have aria-labels or text | Screen reader reads button purpose | ⬜ Pass ⬜ Fail | |
| SR-02 | Form fields have proper labels | Label associations correct | ⬜ Pass ⬜ Fail | |
| SR-03 | Error messages announced | Screen reader reads errors | ⬜ Pass ⬜ Fail | |
| SR-04 | Status changes announced | State transitions announced | ⬜ Pass ⬜ Fail | |
| SR-05 | Landmark regions defined | Header, nav, main, footer roles | ⬜ Pass ⬜ Fail | |
| SR-06 | Heading hierarchy correct | H1 → H2 → H3 structure | ⬜ Pass ⬜ Fail | |
| SR-07 | Images have alt text | Icons have text alternatives | ⬜ Pass ⬜ Fail | |

**Section Score:** ___ / 7

---

### 3.4 Color Contrast (WCAG AA)

Use contrast checker tool (e.g., WebAIM Contrast Checker).

| Test ID | Element | Foreground | Background | Ratio | Pass (4.5:1) | Notes |
|---------|---------|------------|------------|-------|--------------|-------|
| CON-01 | Body text | #212121 | #FFFFFF | | ⬜ Pass ⬜ Fail | |
| CON-02 | Button text (primary) | #FFFFFF | #3B82F6 | | ⬜ Pass ⬜ Fail | |
| CON-03 | Button text (secondary) | #FFFFFF | #10B981 | | ⬜ Pass ⬜ Fail | |
| CON-04 | Error text | #EF4444 | #FFFFFF | | ⬜ Pass ⬜ Fail | |
| CON-05 | Label text | #212121 | #FFFFFF | | ⬜ Pass ⬜ Fail | |
| CON-06 | Link text | #3B82F6 | #FFFFFF | | ⬜ Pass ⬜ Fail | |
| CON-07 | Badge text (empty) | #FFFFFF | #6B7280 | | ⬜ Pass ⬜ Fail | |
| CON-08 | Badge text (alert) | #FFFFFF | #EF4444 | | ⬜ Pass ⬜ Fail | |

**Section Score:** ___ / 8

---

### 3.5 Performance Metrics

Use browser DevTools (Network tab, Performance tab).

| Test ID | Test Case | Expected | Actual | Pass/Fail | Notes |
|---------|-----------|----------|--------|-----------|-------|
| PERF-01 | Initial page load time | < 2s | ___ms | ⬜ Pass ⬜ Fail | |
| PERF-02 | Farm list load time | < 1s | ___ms | ⬜ Pass ⬜ Fail | |
| PERF-03 | Farm detail load time | < 1s | ___ms | ⬜ Pass ⬜ Fail | |
| PERF-04 | Modal open time | < 100ms | ___ms | ⬜ Pass ⬜ Fail | |
| PERF-05 | State transition response | < 500ms | ___ms | ⬜ Pass ⬜ Fail | |
| PERF-06 | Form submission response | < 1s | ___ms | ⬜ Pass ⬜ Fail | |
| PERF-07 | Tab switching response | < 200ms | ___ms | ⬜ Pass ⬜ Fail | |
| PERF-08 | Search filter response | < 300ms | ___ms | ⬜ Pass ⬜ Fail | |

**Core Web Vitals:**

| Metric | Expected | Actual | Pass/Fail |
|--------|----------|--------|-----------|
| Largest Contentful Paint (LCP) | < 2.5s | ___s | ⬜ Pass ⬜ Fail |
| First Input Delay (FID) | < 100ms | ___ms | ⬜ Pass ⬜ Fail |
| Cumulative Layout Shift (CLS) | < 0.1 | ___ | ⬜ Pass ⬜ Fail |

**Section Score:** ___ / 11

---

### 3.6 Console Error Monitoring

Open browser DevTools Console before testing.

| Test ID | Test Case | Expected Result | Pass/Fail | Notes |
|---------|-----------|----------------|-----------|-------|
| CONS-01 | No errors on page load | Console clean | ⬜ Pass ⬜ Fail | Errors: |
| CONS-02 | No errors on navigation | Console clean during navigation | ⬜ Pass ⬜ Fail | Errors: |
| CONS-03 | No errors on form submission | Console clean during submit | ⬜ Pass ⬜ Fail | Errors: |
| CONS-04 | No errors on state transitions | Console clean during transitions | ⬜ Pass ⬜ Fail | Errors: |
| CONS-05 | No 404 errors for resources | All assets load successfully | ⬜ Pass ⬜ Fail | |
| CONS-06 | No React warnings | No React-specific warnings | ⬜ Pass ⬜ Fail | Warnings: |

**Section Score:** ___ / 6

---

### 3.7 Visual Regression & Polish

| Test ID | Test Case | Expected Result | Pass/Fail | Notes |
|---------|-----------|----------------|-----------|-------|
| VIS-01 | Card shadows consistent | Same shadow on all cards | ⬜ Pass ⬜ Fail | |
| VIS-02 | Spacing uniform | 16px, 24px, 32px spacing | ⬜ Pass ⬜ Fail | |
| VIS-03 | Border radius consistent | 8px radius on cards | ⬜ Pass ⬜ Fail | |
| VIS-04 | Font sizes appropriate | 14px body, 16-24px headings | ⬜ Pass ⬜ Fail | |
| VIS-05 | Hover effects smooth | Transitions feel polished | ⬜ Pass ⬜ Fail | |
| VIS-06 | No layout shifts during load | Content doesn't jump | ⬜ Pass ⬜ Fail | |
| VIS-07 | Icons aligned properly | Icons centered and aligned | ⬜ Pass ⬜ Fail | |
| VIS-08 | Text truncation handled | Long text doesn't overflow | ⬜ Pass ⬜ Fail | |

**Section Score:** ___ / 8

---

## TEST SUMMARY

| Priority | Total Tests | Passed | Failed | Pass Rate | Critical Issues |
|----------|-------------|--------|--------|-----------|-----------------|
| Priority 1 (Critical) | 81 | ___ | ___ | ___% | |
| Priority 2 (Important) | 66 | ___ | ___ | ___% | |
| Priority 3 (Nice to Have) | 64 | ___ | ___ | ___% | |
| **TOTAL** | **211** | ___ | ___ | ___% | |

---

## SUCCESS CRITERIA

- [ ] All Priority 1 tests pass (81/81)
- [ ] At least 90% of Priority 2 tests pass (60/66)
- [ ] No critical bugs found
- [ ] Block state colors are correct
- [ ] Forms work as expected
- [ ] API integration is solid
- [ ] No console errors during normal usage
- [ ] Responsive design works across all breakpoints

---

## CRITICAL ISSUES FOUND

| Issue # | Severity | Description | Screenshot | Steps to Reproduce |
|---------|----------|-------------|------------|-------------------|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |

---

## RECOMMENDATIONS

1.
2.
3.

---

## TESTER NOTES



---

## SIGN-OFF

**Tested by:** _________________
**Date:** _________________
**Signature:** _________________

**Overall Assessment:** ⬜ PASS ⬜ FAIL ⬜ NEEDS WORK

---

## APPENDIX: Color Reference

**Block State Colors (from types/farm.ts):**

```typescript
BLOCK_STATE_COLORS = {
  empty: '#6B7280',      // rgb(107, 114, 128) - Gray
  planned: '#3B82F6',    // rgb(59, 130, 246) - Blue
  planted: '#10B981',    // rgb(16, 185, 129) - Green
  harvesting: '#F59E0B', // rgb(245, 158, 11) - Yellow/Orange
  alert: '#EF4444',      // rgb(239, 68, 68) - Red
}
```

**Visual Color Swatches:**

- Empty: ▮ Gray
- Planned: ▮ Blue
- Planted: ▮ Green
- Harvesting: ▮ Yellow
- Alert: ▮ Red
