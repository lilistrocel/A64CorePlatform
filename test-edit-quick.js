const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  const dir = 'plant-edit-final';
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);

  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

  try {
    await page.goto('http://localhost');
    await page.fill('input[type="email"]', 'admin@a64platform.com');
    await page.fill('input[type="password"]', 'SuperAdmin123!');
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    await page.goto('http://localhost/farm/plants');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: dir + '/1-plants-page.png', fullPage: true });

    const editButtons = await page.$$('button');
    let editBtn = null;
    for (const btn of editButtons) {
      const text = await btn.textContent();
      if (text && text.includes('Edit')) {
        editBtn = btn;
        break;
      }
    }

    if (editBtn) {
      await editBtn.click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: dir + '/2-after-edit-click.png', fullPage: true });

      const modalData = await page.evaluate(() => {
        const modal = document.querySelector('[role="dialog"]');
        if (!modal) return { found: false };

        const inputs = Array.from(modal.querySelectorAll('input, textarea, select')).filter(i => i.type !== 'hidden');
        return {
          found: true,
          title: modal.querySelector('h1, h2, h3')?.textContent,
          fullText: modal.textContent,
          fields: inputs.map(input => ({
            type: input.type || input.tagName.toLowerCase(),
            name: input.name,
            id: input.id,
            placeholder: input.placeholder,
            label: input.labels?.[0]?.textContent || input.getAttribute('aria-label') || null
          }))
        };
      });

      console.log('\n=== EDIT MODAL ANALYSIS ===\n');
      console.log('Modal Found: ' + (modalData.found ? 'YES' : 'NO'));
      if (modalData.found) {
        console.log('Title: ' + modalData.title);
        console.log('\nTotal Fields: ' + modalData.fields.length + '\n');

        modalData.fields.forEach((f, i) => {
          console.log((i+1) + '. ' + (f.label || f.name || f.id || 'Unlabeled') + ' (' + f.type + ')');
        });

        const text = modalData.fullText.toLowerCase();
        console.log('\n=== CRITICAL CHECK ===');
        console.log('Fertilizer Schedule: ' + (text.includes('fertilizer') && text.includes('schedule') ? 'FOUND' : 'MISSING'));
        console.log('Pesticide Schedule: ' + (text.includes('pesticide') && text.includes('schedule') ? 'FOUND' : 'MISSING'));
        console.log('\nConsole Errors: ' + errors.length);
        if (errors.length > 0) {
          console.log('\nErrors:');
          errors.forEach((e, i) => console.log((i+1) + '. ' + e));
        }
      }

      fs.writeFileSync('plant-edit-modal-data.json', JSON.stringify(modalData, null, 2));
      console.log('\n✅ Saved: plant-edit-modal-data.json & screenshots in ' + dir + '/');
    } else {
      console.log('❌ Edit button not found');
    }

  } catch (e) {
    console.error('Error: ' + e.message);
  } finally {
    await browser.close();
  }
})();
