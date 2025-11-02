# Farm Module Frontend - Test Execution Guide

**Quick Start Guide for Running Tests**

---

## Prerequisites Checklist

Before running tests, ensure:

- [ ] **Frontend is running** at http://localhost:5173
  ```bash
  cd C:\Code\A64CorePlatform\frontend\user-portal
  npm run dev
  ```

- [ ] **Backend API is running** at http://localhost:8001
  ```bash
  # Start your backend server (check project docs)
  ```

- [ ] **Test credentials are valid:**
  - Email: `admin@a64platform.com`
  - Password: `SuperAdmin123!`

- [ ] **Playwright is installed:**
  ```bash
  npm install -D @playwright/test
  npx playwright install chrome
  ```

---

## Option 1: Automated Testing (Recommended)

### Run All Tests

```bash
# Navigate to project root
cd C:\Code\A64CorePlatform

# Run complete test suite
npx playwright test tests/farm-module-frontend.spec.ts

# Expected: ~211 tests, ~5-10 minutes duration
```

### Run Priority 1 Tests Only (Critical)

```bash
# Run only critical functionality tests
npx playwright test tests/farm-module-frontend.spec.ts -g "Priority 1"

# Expected: 81 tests, ~2-3 minutes duration
```

### Run with UI Mode (Interactive)

```bash
# Interactive test runner with visual feedback
npx playwright test tests/farm-module-frontend.spec.ts --ui
```

### Generate HTML Report

```bash
# Run tests and generate report
npx playwright test tests/farm-module-frontend.spec.ts --reporter=html

# Open report in browser
npx playwright show-report
```

---

## Option 2: Manual Testing

### Use the Comprehensive Checklist

1. Open the manual testing checklist:
   - File: `tests/FARM_MODULE_MANUAL_TEST_CHECKLIST.md`

2. Login to the application:
   - URL: http://localhost:5173
   - Email: admin@a64platform.com
   - Password: SuperAdmin123!

3. Follow each test case systematically

4. Mark Pass ✓ or Fail ✗ for each test

5. Document issues in the Critical Issues section

6. Calculate final pass rate

---

## Option 3: Visual Color Testing (CRITICAL)

### Verify Block State Colors

**This is the most critical test - MUST BE DONE MANUALLY**

1. Navigate to: http://localhost:5173/farm/farms

2. Click "View" on any farm with blocks

3. Click "Blocks" tab

4. **Verify block colors match exactly:**

   | State | Expected Color | Expected RGB | Visual Check |
   |-------|----------------|--------------|--------------|
   | Empty | `#6B7280` | `rgb(107, 114, 128)` | Gray |
   | Planned | `#3B82F6` | `rgb(59, 130, 246)` | Blue |
   | Planted | `#10B981` | `rgb(16, 185, 129)` | Green |
   | Harvesting | `#F59E0B` | `rgb(245, 158, 11)` | Yellow |
   | Alert | `#EF4444` | `rgb(239, 68, 68)` | Red |

5. **Use DevTools to verify exact colors:**
   ```javascript
   // Open browser console and run:
   document.querySelectorAll('[class*="Card"]').forEach((card, index) => {
     const badge = card.querySelector('[class*="StateBadge"]');
     if (badge) {
       const bgColor = window.getComputedStyle(badge).backgroundColor;
       console.log(`Block ${index}: ${bgColor}`);
     }
   });
   ```

6. **Screenshot each state** for documentation

---

## Test Scenarios (Manual Walkthrough)

### Scenario 1: Complete Farm Creation Workflow

**Time:** 5 minutes

1. Login as admin@a64platform.com
2. Navigate to "Farm Manager"
3. Click "Manage Farms"
4. Click "Create Farm" button
5. Fill out form:
   - Name: "Test Farm Alpha"
   - City: "Sacramento"
   - State: "California"
   - Country: "USA"
   - Total Area: 50.5
   - Manager ID: test-manager-id
6. Submit form
7. Verify success toast appears
8. Verify farm appears in list
9. Click "View" on new farm
10. Verify farm detail page loads

**Expected Result:** All steps complete without errors

---

### Scenario 2: Block State Lifecycle

**Time:** 5 minutes

1. Navigate to farm detail (from Scenario 1)
2. Go to "Blocks" tab
3. Find an **empty block** (gray)
4. Open state transition dropdown
5. **Verify only "Planned" appears**
6. Transition to "Planned"
7. **Verify block color changes to BLUE**
8. Open dropdown again
9. **Verify "Planted" and "Empty" appear**
10. Transition to "Planted"
11. **Verify block color changes to GREEN**

**Expected Result:** Colors change immediately, transitions work smoothly

---

### Scenario 3: Search and Filter

**Time:** 3 minutes

1. Navigate to farm list
2. Enter "Test" in search box
3. Verify farms filter in real-time
4. Clear search
5. Open status filter dropdown
6. Select "Active"
7. Verify only active farms show
8. Select "All"
9. Verify all farms show again

**Expected Result:** Filtering is instant, results accurate

---

### Scenario 4: Error Handling

**Time:** 3 minutes

1. Navigate to farm detail
2. **Stop backend server**
3. Try to transition block state
4. **Verify error message appears** (toast or alert)
5. **Restart backend**
6. Retry transition
7. Verify success

**Expected Result:** Error handling is graceful, retry works

---

### Scenario 5: Responsive Design

**Time:** 5 minutes

1. Open farm list at desktop size (1920x1080)
2. **Resize to tablet (768px)**
   - Verify grid adjusts to 2 columns
3. **Resize to mobile (375px)**
   - Verify single column layout
   - Verify navigation menu works
4. Test all interactions at mobile size
5. Try to create a farm on mobile

**Expected Result:** All layouts work, no horizontal scroll

---

## Common Issues & Troubleshooting

### Issue: Tests fail with "Login failed"

**Solution:**
- Verify backend is running at http://localhost:8001
- Verify test credentials are correct
- Check network tab in browser for 401/403 errors

### Issue: "Farm Manager" link not found

**Solution:**
- Verify user has `farm.manage` permission
- Check that Farm Management module is enabled
- Verify navigation configuration includes farm routes

### Issue: Block colors don't match

**Solution:**
- Use browser DevTools to inspect computed styles
- Check for CSS specificity issues
- Verify styled-components props are passing correctly
- Screenshot and report as critical bug

### Issue: Modal doesn't open

**Solution:**
- Check browser console for JavaScript errors
- Verify modal state management
- Check that overlay z-index is correct

### Issue: API calls timeout

**Solution:**
- Increase Playwright timeout settings
- Verify backend is responding (check backend logs)
- Check for CORS issues in browser console

---

## Test Results Interpretation

### Pass Criteria

**Priority 1 (Critical):** 100% pass required (81/81 tests)
- Navigation works
- Dashboard displays correctly
- Farm list loads
- Create farm succeeds
- Block state colors are correct
- State transitions work
- Error handling is graceful

**Priority 2 (Important):** ≥90% pass required (60/66 tests)
- Farm detail tabs work
- Search/filter functions
- Forms validate correctly
- Loading states display

**Priority 3 (Nice to Have):** ≥80% pass required (51/64 tests)
- Responsive design works
- Keyboard navigation works
- Accessibility compliant
- Performance targets met

### Overall Assessment

| Total Tests | Passed | Failed | Pass Rate | Status |
|-------------|--------|--------|-----------|--------|
| 211 | ___ | ___ | ___% | PASS / FAIL |

**PASS:** ≥ 95% pass rate, all Priority 1 tests pass
**FAIL:** < 95% pass rate OR any Priority 1 test fails

---

## Reporting Bugs

If you find issues, create a bug report using this format:

### Bug Report Template

```markdown
## Bug: [Short Title]

**Severity:** Critical / High / Medium / Low
**Found in Test:** [Test ID from checklist]

### Steps to Reproduce
1.
2.
3.

### Expected
[What should happen]

### Actual
[What actually happens]

### Screenshot
[Attach screenshot]

### Environment
- Browser: Chrome 120
- Viewport: 1920x1080
- OS: Windows 11
```

Save bug reports to: `C:\Code\A64CorePlatform\tests\bugs\`

---

## Quick Reference: Test Files

| File | Purpose | Use When |
|------|---------|----------|
| `farm-module-frontend.spec.ts` | Automated Playwright tests | Running automated tests |
| `FARM_MODULE_MANUAL_TEST_CHECKLIST.md` | Manual testing checklist | Doing manual QA |
| `FARM_MODULE_TEST_REPORT.md` | Test analysis & findings | Understanding test results |
| `README_TEST_EXECUTION.md` | This file | Getting started with testing |

---

## Test Execution Checklist

Before reporting test completion:

- [ ] Ran automated test suite
- [ ] Reviewed HTML test report
- [ ] Manually verified block state colors (CRITICAL)
- [ ] Completed Priority 1 manual tests
- [ ] Documented all bugs found
- [ ] Calculated final pass rate
- [ ] Reviewed accessibility with keyboard navigation
- [ ] Tested on multiple viewport sizes
- [ ] Checked browser console for errors
- [ ] Created bug reports for all failures

---

## Contact & Support

If you encounter issues running tests:

1. Check `FARM_MODULE_TEST_REPORT.md` for known issues
2. Review Playwright documentation: https://playwright.dev
3. Check browser console for JavaScript errors
4. Verify all prerequisites are met

---

## Quick Commands Cheat Sheet

```bash
# Start frontend
cd C:\Code\A64CorePlatform\frontend\user-portal && npm run dev

# Run all tests
npx playwright test tests/farm-module-frontend.spec.ts

# Run Priority 1 only
npx playwright test tests/farm-module-frontend.spec.ts -g "Priority 1"

# Interactive mode
npx playwright test tests/farm-module-frontend.spec.ts --ui

# Debug mode
npx playwright test tests/farm-module-frontend.spec.ts --debug

# Specific test
npx playwright test tests/farm-module-frontend.spec.ts -g "block state colors"

# Generate report
npx playwright test tests/farm-module-frontend.spec.ts --reporter=html && npx playwright show-report

# Visual regression
npx playwright test tests/farm-module-frontend.spec.ts --update-snapshots

# Headed mode (see browser)
npx playwright test tests/farm-module-frontend.spec.ts --headed

# Slow motion (debug)
npx playwright test tests/farm-module-frontend.spec.ts --headed --slow-mo=1000
```

---

**Good luck with testing!** 🧪✅

Remember: **Block state colors are the most critical test** - verify them visually!
