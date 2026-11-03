/**
 * Investigate: case card click + lifecycle controls in detail
 */
const { chromium } = require('playwright');
const RES = './test-results';
const APP = 'http://localhost:5173/';
const PW  = 'Test@Arena2026!';
const MPW = 'fuvtam-Kugzer-6deqjy';

function log(m) { process.stdout.write(m + '\n'); }
async function login(page, email, pass) {
  await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1500);
  const btn = page.locator('a, button').filter({ hasText: /^sign in$/i }).first();
  if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) { await btn.click(); await page.waitForTimeout(800); }
  await page.locator('input[type="email"], input[placeholder*="email" i]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(pass);
  await page.locator('button').filter({ hasText: /^sign in$/i }).first().click();
  await page.waitForTimeout(3500);
}
async function ss(page, name) { await page.screenshot({ path: `${RES}/${name}.png` }).catch(() => {}); }
async function body(page) { return page.evaluate(() => document.body.innerText.slice(0, 8000)); }

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--no-sandbox'] });

  // 1. Manager: click a case using div selector, check lifecycle controls
  log('\n═══ Manager: open case + lifecycle controls ═══');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage(); page.setDefaultTimeout(25000);
    await login(page, 'sfmanager@techcase.com', MPW);

    // Click Cases
    const casesBtn = page.locator('aside button').filter({ hasText: /^cases$/i }).first();
    await casesBtn.click(); await page.waitForTimeout(2000);

    // Use div with shadow selector
    const caseCards = page.locator('div[class*="shadow"][class*="rounded"]');
    const count = await caseCards.count();
    log('Case cards found: ' + count);

    if (count > 0) {
      // Try clicking "LC Test Case" card
      const lcCard = caseCards.filter({ hasText: /LC Test Case/ }).first();
      const lcCount = await lcCard.count();
      log('LC Test Case cards: ' + lcCount);

      if (lcCount > 0) {
        log('Clicking LC Test Case card...');
        await lcCard.click(); await page.waitForTimeout(2500);
      } else {
        // Click first card
        log('Clicking first card...');
        await caseCards.first().click(); await page.waitForTimeout(2500);
      }

      await ss(page, 'inv4-manager-case-detail');
      const detailTxt = await body(page);
      log('Case detail URL: ' + page.url());
      log('Case detail (first 800): ' + detailTxt.slice(0, 800).replace(/\n/g, ' '));

      // Look for ALL buttons
      const allBtns = await page.evaluate(() =>
        Array.from(document.querySelectorAll('button')).map(b => ({
          text: (b.innerText || '').trim().slice(0, 60),
          class: b.className.slice(0, 60),
        })).filter(b => b.text.length > 0)
      );
      log('All buttons: ' + JSON.stringify(allBtns, null, 2));

      // Look for select/dropdown for status
      const selects = await page.evaluate(() =>
        Array.from(document.querySelectorAll('select')).map(s => ({
          id: s.id,
          name: s.name,
          options: Array.from(s.options).map(o => o.text),
        }))
      );
      log('Selects: ' + JSON.stringify(selects));

      // Look for any element with status/stage class
      const stageEls = await page.evaluate(() => {
        const els = document.querySelectorAll('[class*="status"], [class*="stage"], [class*="badge"]');
        return Array.from(els).map(el => ({
          tag: el.tagName,
          class: el.className.slice(0, 60),
          text: (el.innerText || '').trim().slice(0, 40),
        })).filter(el => el.text.length > 0);
      });
      log('Stage elements: ' + JSON.stringify(stageEls));

      // Look for any dropdown trigger
      const dropdowns = await page.evaluate(() => {
        const triggers = document.querySelectorAll('[aria-haspopup], [aria-expanded], [data-dropdown], [data-state]');
        return Array.from(triggers).map(el => ({
          tag: el.tagName,
          text: (el.innerText || '').trim().slice(0, 50),
          ariaHasPopup: el.getAttribute('aria-haspopup'),
          ariaExpanded: el.getAttribute('aria-expanded'),
          dataState: el.getAttribute('data-state'),
        })).filter(el => el.text.length > 0);
      });
      log('Dropdown triggers: ' + JSON.stringify(dropdowns));

    } else {
      log('No case cards found with shadow selector');

      // Try another approach - check what's on cases page
      await ss(page, 'inv4-manager-cases-page');
      const casesPageTxt = await body(page);
      log('Cases page: ' + casesPageTxt.slice(0, 800).replace(/\n/g, ' '));

      // Get DOM structure
      const structure = await page.evaluate(() => {
        const main = document.querySelector('main');
        if (!main) return 'no main element';
        const children = Array.from(main.children).map(c => ({
          tag: c.tagName,
          class: c.className.slice(0, 80),
          children: Array.from(c.children).slice(0, 3).map(gc => ({
            tag: gc.tagName,
            class: gc.className.slice(0, 80),
          })),
        }));
        return children.slice(0, 5);
      });
      log('Main structure: ' + JSON.stringify(structure, null, 2));
    }
    await ctx.close();
  }

  // 2. Client: open case and check what controls are visible
  log('\n═══ Client: open case ═══');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage(); page.setDefaultTimeout(20000);
    await login(page, 'test.client@test.arena.dev', PW);

    // Click My Cases
    const myCasesBtn = page.locator('aside button').filter({ hasText: /my cases/i }).first();
    await myCasesBtn.click(); await page.waitForTimeout(2000);

    // Click a case card
    const caseCards = page.locator('div[class*="shadow"][class*="rounded"]');
    const count = await caseCards.count();
    log('Client case cards: ' + count);

    if (count > 0) {
      await caseCards.first().click(); await page.waitForTimeout(2000);
      await ss(page, 'inv4-client-case-detail');
      const detailTxt = await body(page);
      log('Client case detail: ' + detailTxt.slice(0, 600).replace(/\n/g, ' '));

      // Check buttons
      const allBtns = await page.evaluate(() =>
        Array.from(document.querySelectorAll('button')).map(b => (b.innerText || '').trim().slice(0, 60)).filter(t => t.length > 0)
      );
      log('Client case buttons: ' + allBtns.join(' | '));

      // Check status elements
      const status = await page.evaluate(() => {
        const badge = document.querySelector('[class*="status"], [class*="badge"], [class*="stage"]');
        return badge ? { text: (badge.innerText || '').trim(), class: badge.className } : null;
      });
      log('Status element: ' + JSON.stringify(status));
    }
    await ctx.close();
  }

  await browser.close();
  log('\nDone.');
})();
