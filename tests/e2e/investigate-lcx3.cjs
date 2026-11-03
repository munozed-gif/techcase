/**
 * Investigate LC-X3: can a client self-advance their own Open case?
 *
 * Questions:
 * 1. What advance buttons does the CLIENT see on their Open case?
 * 2. Does clicking → Confirmed actually persist (stage changes in DB)?
 * 3. What does the MANAGER see after the client clicked advance?
 * 4. What does a FINAL USER see? (the original LC-X3 test intent)
 * 5. Does the client see buttons on someone else's case too?
 */
const path = require('path');
const { chromium } = require('playwright');
const fs = require('fs');

const APP  = 'http://localhost:5173/';
const RES  = path.join(__dirname, 'test-results');
const PW   = 'Test@Arena2026!';
const MPW  = 'fuvtam-Kugzer-6deqjy';
const TS   = Date.now();
const CASE_TITLE = `LCX3-Test-${TS}`;

fs.mkdirSync(RES, { recursive: true });
function log(m) { process.stdout.write(m + '\n'); }
async function ss(page, n) { await page.screenshot({ path: `${RES}/lcx3-${n}.png`, fullPage: false }).catch(() => {}); }
async function body(page) { return page.evaluate(() => document.body.innerText.slice(0, 8000)); }
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
async function getButtons(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('button'))
      .map(b => (b.innerText || '').trim())
      .filter(t => t.length > 0 && t.length < 60)
  );
}
async function getStageFromBody(page) {
  const txt = await body(page);
  const stages = ['Open','Confirmed','Returned','Estimated','Assigned','In Progress','Standby',
                  'Technical Test','Functional Test','User Test','Approved','Terminated','Cancelled'];
  for (const s of stages) {
    if (txt.includes(s)) return s;
  }
  return 'unknown';
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--no-sandbox'] });

  // ─── STEP 1: Manager creates a fresh Open case for FinCorp client ───────────
  log('\n═══ Step 1: Manager creates a fresh Open case ═══');
  let caseCreated = false;
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage(); page.setDefaultTimeout(25000);
    await login(page, 'sfmanager@techcase.com', MPW);

    await page.locator('aside button').filter({ hasText: /^cases$/i }).first().click();
    await page.waitForTimeout(2000);

    // Open create case wizard
    const createBtn = page.locator('button').filter({ hasText: /create case|new case|add case/i }).first();
    if (await createBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await createBtn.click(); await page.waitForTimeout(2000);

      // Fill title
      const titleInput = page.locator('input[placeholder*="title" i], input[placeholder*="name" i], input[placeholder*="subject" i]').first();
      if (await titleInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await titleInput.fill(CASE_TITLE);
        log('  Filled title: ' + CASE_TITLE);
      }

      // Select FinCorp or client
      const clientSel = page.locator('select, [role="combobox"]').first();
      if (await clientSel.isVisible({ timeout: 2000 }).catch(() => false)) {
        const tag = await clientSel.evaluate(el => el.tagName);
        if (tag === 'SELECT') {
          const opts = await clientSel.locator('option').allInnerTexts();
          const fincorp = opts.find(o => /fincorp/i.test(o));
          if (fincorp) { await clientSel.selectOption({ label: fincorp }); log('  Selected FinCorp'); }
        } else {
          await clientSel.click(); await page.waitForTimeout(500);
          const fincorpOpt = page.locator('[role="option"]').filter({ hasText: /fincorp/i }).first();
          if (await fincorpOpt.isVisible({ timeout: 2000 }).catch(() => false)) {
            await fincorpOpt.click(); log('  Selected FinCorp via combobox');
          }
        }
      }

      // Submit
      const submitBtn = page.locator('button').filter({ hasText: /create|save|submit|finish|next/i }).first();
      if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await submitBtn.click(); await page.waitForTimeout(3000);
        const afterTxt = await body(page);
        caseCreated = afterTxt.toLowerCase().includes(CASE_TITLE.toLowerCase().slice(0, 10));
        log('  Case created: ' + caseCreated);
      } else {
        const btns = await getButtons(page);
        log('  No submit button. Buttons: ' + btns.join(' | '));
      }
    } else {
      log('  No Create Case button found');
      const btns = await getButtons(page);
      log('  Available buttons: ' + btns.slice(0, 10).join(' | '));
    }
    await ss(page, '01-manager-after-create');
    await ctx.close();
  }

  // ─── STEP 2: Client logs in — what buttons do they see on the case? ─────────
  log('\n═══ Step 2: Client (Maria Torres) — what buttons are visible? ═══');
  let clientCanSeeAdvanceBtn = false;
  let stageBeforeClientClick = 'unknown';
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage(); page.setDefaultTimeout(25000);
    await login(page, 'test.client@test.arena.dev', PW);

    // Navigate to My Cases
    const myCasesBtn = page.locator('aside button, aside a').filter({ hasText: /my cases/i }).first();
    if (await myCasesBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await myCasesBtn.click(); await page.waitForTimeout(2000);
    }
    await ss(page, '02-client-mycases');

    // Look for the test case OR any Open case
    const opened = await openCase(page, CASE_TITLE.slice(0, 8));
    if (!opened) {
      log('  Test case not found — trying any case');
      // Try to find any Open case
      const anyCard = page.locator('div[class*="shadow"][class*="rounded"]').filter({ hasText: /open/i }).first();
      if (await anyCard.isVisible({ timeout: 3000 }).catch(() => false)) {
        await anyCard.click(); await page.waitForTimeout(2500);
      } else {
        // Just open first card
        const firstCard = page.locator('div[class*="shadow"][class*="rounded"]').first();
        if (await firstCard.isVisible({ timeout: 3000 }).catch(() => false)) {
          await firstCard.click(); await page.waitForTimeout(2500);
        }
      }
    }

    stageBeforeClientClick = await getStageFromBody(page);
    await ss(page, '02-client-case-detail');
    const btns = await getButtons(page);
    log('  Current stage: ' + stageBeforeClientClick);
    log('  All buttons: ' + btns.join(' | '));

    // Check for advance buttons specifically
    const advanceBtns = btns.filter(b => /→|advance|confirm|return|estimate|progress|standby|technical|functional|user test|approved|terminated|cancel/i.test(b));
    log('  Advance-like buttons: ' + (advanceBtns.length ? advanceBtns.join(' | ') : '(none)'));
    clientCanSeeAdvanceBtn = advanceBtns.length > 0;

    // Check what the page body says about the case
    const pageTxt = await body(page);
    log('  Page snippet (first 600): ' + pageTxt.slice(0, 600).replace(/\n/g, ' '));

    // If there's an advance button, click it and see what happens
    if (clientCanSeeAdvanceBtn) {
      const confirmBtn = page.locator('button').filter({ hasText: /→\s*confirmed|confirmed/i }).first();
      const hasConfirmBtn = await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false);
      log('  Has "→ Confirmed" button: ' + hasConfirmBtn);

      if (hasConfirmBtn) {
        log('  Clicking "→ Confirmed" as client...');
        await confirmBtn.click(); await page.waitForTimeout(3000);
        await ss(page, '02-client-after-advance');
        const afterTxt = await body(page);
        const stageAfter = await getStageFromBody(page);
        log('  Stage after click: ' + stageAfter);
        log('  After click snippet: ' + afterTxt.slice(0, 400).replace(/\n/g, ' '));

        // Check for any error/toast
        const toastOrError = await page.evaluate(() => {
          const toasts = document.querySelectorAll('[class*="toast"], [class*="alert"], [class*="error"], [role="alert"]');
          return Array.from(toasts).map(t => (t.innerText || '').trim().slice(0, 100)).filter(t => t);
        });
        log('  Toast/error messages: ' + JSON.stringify(toastOrError));

        // Check console errors
        const consoleErrors = [];
        page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 100)); });
        await page.waitForTimeout(1000);
        log('  Console errors: ' + JSON.stringify(consoleErrors));
      }
    } else {
      log('  No advance buttons visible for client — checking all interactive elements');
      const interactive = await page.evaluate(() => {
        const els = document.querySelectorAll('button, [role="button"], select');
        return Array.from(els).map(el => ({
          tag: el.tagName,
          text: (el.innerText || '').trim().slice(0, 50),
        })).filter(el => el.text.length > 0);
      });
      log('  Interactive elements: ' + JSON.stringify(interactive.slice(0, 20)));
    }

    await ctx.close();
  }

  // ─── STEP 3: Manager checks the case — did the stage change? ────────────────
  log('\n═══ Step 3: Manager verifies — did client advance the stage? ═══');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage(); page.setDefaultTimeout(25000);
    await login(page, 'sfmanager@techcase.com', MPW);

    await page.locator('aside button').filter({ hasText: /^cases$/i }).first().click();
    await page.waitForTimeout(2000);

    const opened = await openCase(page, CASE_TITLE.slice(0, 8));
    if (opened) {
      const stageAfter = await getStageFromBody(page);
      await ss(page, '03-manager-case-after');
      const btns = await getButtons(page);
      log('  Case stage as seen by manager: ' + stageAfter);
      log('  Buttons: ' + btns.filter(b => /→|back|edit|lifecycle|audit/i.test(b)).join(' | '));
      log('  Stage changed from ' + stageBeforeClientClick + ' → ' + stageAfter);
      if (stageAfter !== stageBeforeClientClick) {
        log('  ⚠️  CONFIRMED: client successfully advanced the stage');
      } else {
        log('  ✓ Stage unchanged — client click had no effect (UI-only button)');
      }

      // Check audit trail
      const auditTab = page.locator('button').filter({ hasText: /audit/i }).first();
      if (await auditTab.isVisible({ timeout: 2000 }).catch(() => false)) {
        await auditTab.click(); await page.waitForTimeout(1500);
        await ss(page, '03-manager-audit');
        const auditTxt = await body(page);
        log('  Audit trail snippet: ' + auditTxt.slice(0, 600).replace(/\n/g, ' '));
      }
    } else {
      log('  Could not find test case in manager view');
    }
    await ctx.close();
  }

  // ─── STEP 4: Final User — can they see advance buttons? ─────────────────────
  log('\n═══ Step 4: Final User (Tom Walsh) — advance buttons visible? ═══');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage(); page.setDefaultTimeout(25000);
    await login(page, 'test.finaluser@test.arena.dev', PW);

    // Navigate to cases (My Cases or similar)
    const nav = await page.evaluate(() =>
      Array.from(document.querySelectorAll('aside button, aside a')).map(b => (b.innerText || '').trim()).filter(t => t)
    );
    log('  Final User nav: ' + nav.join(' | '));

    const casesBtn = page.locator('aside button, aside a').filter({ hasText: /cases|my cases/i }).first();
    if (await casesBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await casesBtn.click(); await page.waitForTimeout(2000);
    }
    await ss(page, '04-finaluser-cases');

    const cards = page.locator('div[class*="shadow"][class*="rounded"]');
    const count = await cards.count();
    log('  Final User case cards: ' + count);

    if (count > 0) {
      await cards.first().click(); await page.waitForTimeout(2500);
      await ss(page, '04-finaluser-case-detail');
      const btns = await getButtons(page);
      log('  Final User buttons: ' + btns.join(' | '));
      const advanceBtns = btns.filter(b => /→|advance|confirm|return|estimate|progress/i.test(b));
      log('  Final User advance-like buttons: ' + (advanceBtns.length ? advanceBtns.join(' | ') : '(none — CORRECT)'));
    } else {
      log('  Final User sees no cases');
    }
    await ctx.close();
  }

  // ─── STEP 5: Check lifecycle config — is client role listed for Open stage? ─
  log('\n═══ Step 5: Manager — check lifecycle config for Open stage ═══');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage(); page.setDefaultTimeout(25000);
    await login(page, 'sfmanager@techcase.com', MPW);

    // Try to navigate to lifecycle/SLA settings
    const slaBtn = page.locator('aside button').filter({ hasText: /^sla$/i }).first();
    if (await slaBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await slaBtn.click(); await page.waitForTimeout(2000);
      await ss(page, '05-sla-page');
      log('  SLA page: ' + (await body(page)).slice(0, 500).replace(/\n/g, ' '));
    }

    // Try Settings → lifecycle or Templates
    const settingsBtn = page.locator('aside button').filter({ hasText: /^settings$/i }).first();
    if (await settingsBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await settingsBtn.click(); await page.waitForTimeout(2000);
      await ss(page, '05-settings');
      const settingsTxt = await body(page);
      log('  Settings tabs: ' + settingsTxt.slice(0, 400).replace(/\n/g, ' '));

      // Look for lifecycle config tab
      const lifecycleTab = page.locator('button, [role="tab"]').filter({ hasText: /lifecycle|stage|workflow/i }).first();
      if (await lifecycleTab.isVisible({ timeout: 2000 }).catch(() => false)) {
        await lifecycleTab.click(); await page.waitForTimeout(1500);
        await ss(page, '05-lifecycle-settings');
        log('  Lifecycle config: ' + (await body(page)).slice(0, 600).replace(/\n/g, ' '));
      }
    }
    await ctx.close();
  }

  await browser.close();
  log('\n═══ SUMMARY ═══');
  log('Client can see advance buttons: ' + clientCanSeeAdvanceBtn);
  log('Stage before client click: ' + stageBeforeClientClick);
  log('\nDone.');
})();
