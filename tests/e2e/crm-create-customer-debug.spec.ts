import { test, expect } from '@playwright/test';

const BASE_URL = 'https://a64core.com';
const CRM_URL = `${BASE_URL}/crm/customers`;

test('Debug: Create New Customer in CRM', async ({ page }) => {
  // Capture errors
  const errors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(`Console: ${msg.text()}`);
    }
  });
  page.on('pageerror', err => {
    errors.push(`Page error: ${err.message}`);
  });

  // Login
  console.log('Step 1: Logging in...');
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[type="email"]', 'admin@a64platform.com');
  await page.fill('input[type="password"]', 'SuperAdmin123!');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 15000 });
  console.log('Login successful');

  // Navigate to CRM
  console.log('Step 2: Navigating to CRM...');
  await page.goto(CRM_URL);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: 'test-results/crm-01-initial.png', fullPage: true });

  // Click New Customer button
  console.log('Step 3: Clicking New Customer button...');
  const newCustomerBtn = page.locator('button:has-text("New Customer")');
  await expect(newCustomerBtn).toBeVisible();
  await newCustomerBtn.click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'test-results/crm-02-after-click.png', fullPage: true });

  // Check for modal/form
  console.log('Step 4: Looking for form elements...');
  const modal = page.locator('[role="dialog"], .modal, [class*="modal"], [class*="Modal"]').first();
  const isModalVisible = await modal.isVisible().catch(() => false);
  console.log('Modal visible:', isModalVisible);

  // List all visible inputs
  const allInputs = await page.locator('input:visible').all();
  console.log('Visible inputs count:', allInputs.length);

  for (let i = 0; i < allInputs.length; i++) {
    const input = allInputs[i];
    const name = await input.getAttribute('name');
    const placeholder = await input.getAttribute('placeholder');
    const type = await input.getAttribute('type');
    console.log(`Input ${i}: name="${name}", placeholder="${placeholder}", type="${type}"`);
  }

  // Look for the form
  const form = page.locator('form').first();
  const formVisible = await form.isVisible().catch(() => false);
  console.log('Form visible:', formVisible);

  // Generate unique test data
  const timestamp = Date.now();
  const testCustomer = {
    name: `Test Customer ${timestamp}`,
    email: `test${timestamp}@example.com`,
    phone: '+1234567890',
    company: `Test Company ${timestamp}`
  };

  // Try to fill the form fields by various selectors
  console.log('Step 5: Filling form fields...');

  // Name field - try multiple selectors
  const nameSelectors = [
    'input[name="name"]',
    'input[placeholder*="name" i]',
    'input[placeholder*="Name"]',
    'input#name',
    '[data-testid="name-input"]'
  ];

  for (const selector of nameSelectors) {
    const field = page.locator(selector).first();
    if (await field.isVisible().catch(() => false)) {
      await field.fill(testCustomer.name);
      console.log(`Filled name using: ${selector}`);
      break;
    }
  }

  // Email field
  const emailSelectors = [
    'input[name="email"]',
    'input[type="email"]',
    'input[placeholder*="email" i]',
    'input#email'
  ];

  for (const selector of emailSelectors) {
    const field = page.locator(selector).first();
    if (await field.isVisible().catch(() => false)) {
      await field.fill(testCustomer.email);
      console.log(`Filled email using: ${selector}`);
      break;
    }
  }

  // Phone field
  const phoneSelectors = [
    'input[name="phone"]',
    'input[type="tel"]',
    'input[placeholder*="phone" i]',
    'input#phone'
  ];

  for (const selector of phoneSelectors) {
    const field = page.locator(selector).first();
    if (await field.isVisible().catch(() => false)) {
      await field.fill(testCustomer.phone);
      console.log(`Filled phone using: ${selector}`);
      break;
    }
  }

  // Company field
  const companySelectors = [
    'input[name="company"]',
    'input[placeholder*="company" i]',
    'input#company'
  ];

  for (const selector of companySelectors) {
    const field = page.locator(selector).first();
    if (await field.isVisible().catch(() => false)) {
      await field.fill(testCustomer.company);
      console.log(`Filled company using: ${selector}`);
      break;
    }
  }

  await page.screenshot({ path: 'test-results/crm-03-form-filled.png', fullPage: true });

  // Find and click submit button
  console.log('Step 6: Looking for submit button...');
  const submitSelectors = [
    'button[type="submit"]',
    'button:has-text("Save")',
    'button:has-text("Create")',
    'button:has-text("Add Customer")',
    'button:has-text("Submit")'
  ];

  for (const selector of submitSelectors) {
    const btn = page.locator(selector).first();
    if (await btn.isVisible().catch(() => false)) {
      const btnText = await btn.textContent();
      console.log(`Found submit button: "${btnText}" using ${selector}`);
      await btn.click();
      console.log('Clicked submit button');
      break;
    }
  }

  // Wait for response
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'test-results/crm-04-after-submit.png', fullPage: true });

  // Check result
  const bodyText = await page.locator('body').textContent();
  console.log('Page after submit (first 500 chars):', bodyText?.substring(0, 500));

  // Check for the new customer
  const hasNewCustomer = bodyText?.includes(testCustomer.name);
  console.log('New customer found in page:', hasNewCustomer);

  // Check for success message
  const hasSuccess = bodyText?.toLowerCase().includes('success') ||
                     bodyText?.toLowerCase().includes('created');
  console.log('Success message found:', hasSuccess);

  // Log any errors
  if (errors.length > 0) {
    console.log('\n=== ERRORS ===');
    errors.forEach(e => console.log(e));
  }

  // Final assertion
  expect(hasNewCustomer || hasSuccess).toBeTruthy();
});
