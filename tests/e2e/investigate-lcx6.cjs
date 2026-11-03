/**
 * Investigate LC-X6: HTTP 400 errors during lifecycle navigation
 * Captures:
 *  - All network requests/responses (esp. 4xx)
 *  - Full request URL, method, body
 *  - Response body for any 400
 *  - Console errors with full text
 *  - Triggers across multiple lifecycle transitions to reproduce
 */
const path = require('path');
const { chromium } = require('playwright');
const fs = require('fs');

const APP = 'http://localhost:5173/';
const RES = path.join(__dirname, 'test-results');
const MPW = 'fuvtam-Kugzer-6deqjy';

fs.mkdirSync(RES, { recursive: true });
function log(m) { process.stdout.write(m + '\n'); }
async function ss(page, n) { await page.screenshot({ path: `${RES}/lcx6-${n}.png`, fullPage: false }).catch(() => {}); }
async function body(page) { return page.evaluate(() => document.body.innerText.slice(0, 4000)); }
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
async function openCase(page, titleFragment) {
  const cards = page.locator('div[class*="shadow"][class*="rounded"]');
  const match = cards.filter({ hasText: new RegExp(titleFragment, 'i') }).first();
  if (await match.isVisible({ timeout: 5000 }).catch(() => false)) {
    await match.click(); await page.waitForTimeout(2500); return true;
  }
  return false;
}
async function getStage(page) {
  const txt = await body(page);
  const stages = ['Open','Confirmed','Returned','Estimated','Assigned','In Progress','Standby',
                  'Technical Test','Functional Test','User Test','Approved','Terminated','Cancelled'];
  for (const s of stages) { if (txt.includes(s)) return s; }
  return 'unknown';
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--no-sandbox'] });

  // ─── RUN 1: Just open the Cases list and a case — record everything ──────────
  log('\n═══ Run 1: Open cases list + case detail — capture all network activity ═══');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage(); page.setDefaultTimeout(25000);

    const badRequests = [];
    const consoleErrors = [];
    const allRequests = [];

    // Intercept all requests for POST/PATCH/PUT (mutations likely to 400)
    page.on('request', req => {
      const method = req.method();
      const url = req.url();
      if (['POST','PATCH','PUT','DELETE'].includes(method) || url.includes('supabase') || url.includes('rpc')) {
        allRequests.push({ method, url: url.slice(0, 200), ts: Date.now() });
      }
    });

    page.on('response', async resp => {
      const status = resp.status();
      if (status >= 400) {
        const url = resp.url();
        let respBody = '';
        try { respBody = await resp.text(); } catch {}
        let reqBody = '';
        try { reqBody = resp.request().postData() || ''; } catch {}
        badRequests.push({
          status,
          method: resp.request().method(),
          url: url.slice(0, 300),
          reqBody: reqBody.slice(0, 500),
          respBody: respBody.slice(0, 500),
        });
        log(`  [${status}] ${resp.request().method()} ${url.slice(0, 150)}`);
        if (reqBody) log(`    → req: ${reqBody.slice(0, 200)}`);
        if (respBody) log(`    ← resp: ${respBody.slice(0, 300)}`);
      }
    });

    page.on('console', msg => {
      if (msg.type() === 'error') {
        const txt = msg.text();
        consoleErrors.push(txt);
        log(`  [CONSOLE ERROR] ${txt.slice(0, 200)}`);
      }
    });

    await login(page, 'sfmanager@techcase.com', MPW);
    log('  Logged in');

    // Navigate to Cases
    const casesBtn = page.locator('aside button').filter({ hasText: /^cases$/i }).first();
    if (await casesBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await casesBtn.click(); await page.waitForTimeout(2500);
      log('  Cases list loaded');
    }
    await ss(page, '01-cases-list');

    // Open first available case
    const opened = await openCase(page, 'LC');
    if (!opened) {
      const firstCard = page.locator('div[class*="shadow"][class*="rounded"]').first();
      if (await firstCard.isVisible({ timeout: 3000 }).catch(() => false)) {
        await firstCard.click(); await page.waitForTimeout(2500);
      }
    }
    log('  Case opened');
    await ss(page, '02-case-detail');
    const stage = await getStage(page);
    log('  Current stage: ' + stage);

    // Wait for any deferred requests to complete
    await page.waitForTimeout(2000);

    log(`\n  === Run 1 Summary ===`);
    log(`  Total mutation/supabase requests seen: ${allRequests.length}`);
    log(`  Bad requests (4xx/5xx): ${badRequests.length}`);
    log(`  Console errors: ${consoleErrors.length}`);
    if (badRequests.length > 0) {
      log('  Bad request details:');
      badRequests.forEach((r, i) => {
        log(`    [${i+1}] ${r.status} ${r.method} ${r.url}`);
        if (r.reqBody) log(`         req: ${r.reqBody}`);
        if (r.respBody) log(`         resp: ${r.respBody}`);
      });
    }
    if (consoleErrors.length > 0) {
      log('  Console error details:');
      consoleErrors.forEach((e, i) => log(`    [${i+1}] ${e.slice(0, 300)}`));
    }

    await ctx.close();
  }

  // ─── RUN 2: Navigate between multiple cases ──────────────────────────────────
  log('\n═══ Run 2: Navigate through multiple cases — check for pattern ═══');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage(); page.setDefaultTimeout(25000);

    const badRequests = [];
    const consoleErrors = [];

    page.on('response', async resp => {
      const status = resp.status();
      if (status >= 400) {
        const url = resp.url();
        let respBody = '';
        try { respBody = await resp.text(); } catch {}
        let reqBody = '';
        try { reqBody = resp.request().postData() || ''; } catch {}
        badRequests.push({ status, method: resp.request().method(), url, reqBody, respBody });
        log(`  [${status}] ${resp.request().method()} ${url.slice(0, 150)}`);
        if (respBody) log(`    ← ${respBody.slice(0, 300)}`);
      }
    });
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await login(page, 'sfmanager@techcase.com', MPW);

    const casesBtn = page.locator('aside button').filter({ hasText: /^cases$/i }).first();
    if (await casesBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await casesBtn.click(); await page.waitForTimeout(2000);
    }

    // Open first 3 cards
    const cards = page.locator('div[class*="shadow"][class*="rounded"]');
    const count = await cards.count();
    log(`  Found ${count} case cards`);
    for (let i = 0; i < Math.min(3, count); i++) {
      await page.locator('div[class*="shadow"][class*="rounded"]').nth(i).click();
      await page.waitForTimeout(2000);
      const s = await getStage(page);
      log(`  Case ${i+1} stage: ${s}`);
      await ss(page, `03-case-${i+1}`);
      // Go back
      const backBtn = page.locator('button').filter({ hasText: /← cases/i }).first();
      if (await backBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await backBtn.click(); await page.waitForTimeout(1500);
      } else {
        // Try clicking Cases nav again
        const cn = page.locator('aside button').filter({ hasText: /^cases$/i }).first();
        if (await cn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await cn.click(); await page.waitForTimeout(1500);
        }
      }
    }

    await page.waitForTimeout(1500);
    log(`\n  === Run 2 Summary ===`);
    log(`  Bad requests: ${badRequests.length}`);
    log(`  Console errors: ${consoleErrors.length}`);
    badRequests.forEach((r, i) => {
      log(`  [${i+1}] ${r.status} ${r.method} ${r.url.slice(0,200)}`);
      if (r.respBody) log(`      resp: ${r.respBody.slice(0,300)}`);
    });
    consoleErrors.slice(0, 5).forEach((e, i) => log(`  CE[${i+1}]: ${e.slice(0,200)}`));

    await ctx.close();
  }

  // ─── RUN 3: Attempt a lifecycle stage advance — watch network closely ────────
  log('\n═══ Run 3: Perform a stage transition — capture the advance request ═══');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage(); page.setDefaultTimeout(25000);

    const allResponses = [];
    const consoleErrors = [];

    page.on('response', async resp => {
      const status = resp.status();
      const url = resp.url();
      // Capture ALL supabase/api responses
      if (url.includes('supabase') || url.includes('/rest/') || url.includes('/rpc/') || url.includes('/functions/')) {
        let respBody = '';
        try { respBody = await resp.text(); } catch {}
        let reqBody = '';
        try { reqBody = resp.request().postData() || ''; } catch {}
        allResponses.push({ status, method: resp.request().method(), url, reqBody, respBody });
        if (status >= 400) {
          log(`  [${status}] ${resp.request().method()} ${url.slice(0, 150)}`);
          if (reqBody) log(`    req: ${reqBody.slice(0, 400)}`);
          if (respBody) log(`    resp: ${respBody.slice(0, 400)}`);
        }
      }
    });
    page.on('console', msg => {
      const txt = msg.text();
      if (msg.type() === 'error') {
        consoleErrors.push(txt);
        log(`  [CONSOLE ERROR] ${txt.slice(0, 200)}`);
      }
    });

    await login(page, 'sfmanager@techcase.com', MPW);
    const casesBtn = page.locator('aside button').filter({ hasText: /^cases$/i }).first();
    if (await casesBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await casesBtn.click(); await page.waitForTimeout(2000);
    }

    // Find an Open case
    const openCard = page.locator('div[class*="shadow"][class*="rounded"]').filter({ hasText: /open/i }).first();
    const hasOpen = await openCard.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasOpen) {
      await openCard.click(); await page.waitForTimeout(2500);
    } else {
      const firstCard = page.locator('div[class*="shadow"][class*="rounded"]').first();
      if (await firstCard.isVisible({ timeout: 3000 }).catch(() => false)) {
        await firstCard.click(); await page.waitForTimeout(2500);
      }
    }
    const stage = await getStage(page);
    log(`  Opened case — stage: ${stage}`);
    await ss(page, '04-before-advance');

    // Try to click the next stage advance button
    const advanceBtn = page.locator('button').filter({ hasText: /^→/i }).first();
    const hasAdvance = await advanceBtn.isVisible({ timeout: 2000 }).catch(() => false);
    log(`  Advance button visible: ${hasAdvance}`);
    if (hasAdvance) {
      const btnText = await advanceBtn.innerText().catch(() => '');
      log(`  Clicking: "${btnText}"`);
      await advanceBtn.click();
      await page.waitForTimeout(3000);
      const newStage = await getStage(page);
      log(`  Stage after advance: ${newStage}`);
      await ss(page, '04-after-advance');
    }

    // Also check Lifecycle tab if visible
    const lifecycleTab = page.locator('button').filter({ hasText: /lifecycle/i }).first();
    if (await lifecycleTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await lifecycleTab.click(); await page.waitForTimeout(1500);
      await ss(page, '04-lifecycle-tab');
      log('  Clicked Lifecycle tab');
    }

    await page.waitForTimeout(1500);
    log(`\n  === Run 3 Summary ===`);
    log(`  Total supabase/api responses captured: ${allResponses.length}`);
    const bad = allResponses.filter(r => r.status >= 400);
    log(`  4xx/5xx responses: ${bad.length}`);
    bad.forEach((r, i) => {
      log(`  [${i+1}] ${r.status} ${r.method} ${r.url.slice(0,200)}`);
      if (r.reqBody) log(`      req: ${r.reqBody.slice(0,400)}`);
      if (r.respBody) log(`      resp: ${r.respBody.slice(0,400)}`);
    });
    log(`  Console errors: ${consoleErrors.length}`);
    consoleErrors.forEach((e, i) => log(`  CE[${i+1}]: ${e.slice(0,200)}`));

    // Print ALL supabase responses for context
    log('\n  All supabase/api responses:');
    allResponses.forEach(r => {
      if (r.status < 400) {
        log(`    [${r.status}] ${r.method} ${r.url.slice(0, 120)}`);
      }
    });

    await ctx.close();
  }

  await browser.close();
  log('\n═══ DONE ═══');
})();
