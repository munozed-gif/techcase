const { chromium } = require('playwright');
const APP = 'http://localhost:5173/';
const PW = 'Test@Arena2026!';
let pass = 0, fail = 0;
function log(m) { process.stdout.write(m + '\n'); }
function PASS(id, msg) { pass++; log(`✓ ${id}: ${msg}`); }
function FAIL(id, msg) { fail++; log(`✗ ${id}: ${msg}`); }

async function login(page, email) {
  await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1500);
  const btn = page.locator('a, button').filter({ hasText: /^sign in$/i }).first();
  if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) { await btn.click(); await page.waitForTimeout(800); }
  await page.locator('input[type="email"], input[placeholder*="email" i]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(PW);
  await page.locator('button').filter({ hasText: /^sign in$/i }).first().click();
  await page.waitForTimeout(3500);
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--no-sandbox'] });

  // === C-08: Consultant Arena ===
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage(); page.setDefaultTimeout(20000);
    try {
      await login(page, 'test.consultant@test.arena.dev');
      const arenaBtn = page.locator('aside button').filter({ hasText: /^arena$/i }).first();
      if (!await arenaBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        FAIL('C-08', 'Arena button not in sidebar'); await ctx.close(); return;
      }
      await arenaBtn.click(); await page.waitForTimeout(3000);

      // Check Arena loaded (no crash/error boundary)
      const bodyText = await page.evaluate(() => document.body.innerText);
      if (/something went wrong/i.test(bodyText)) { FAIL('C-08', 'Error boundary fired'); await ctx.close(); return; }

      // Leaderboard tab visible — look for "Leaderboard" text in nav area
      const lbVisible = await page.locator('text=Leaderboard').first().isVisible({ timeout: 3000 }).catch(() => false);
      if (!lbVisible) { FAIL('C-08', 'Leaderboard not visible'); await ctx.close(); return; }

      // Cards tab visible
      const cardsTab = page.locator('button, div').filter({ hasText: /^cards$/i }).first();
      const cardsVisible = await cardsTab.isVisible({ timeout: 3000 }).catch(() => false);
      if (!cardsVisible) { FAIL('C-08', 'Cards tab not visible'); await ctx.close(); return; }

      // Click Cards tab
      await cardsTab.click(); await page.waitForTimeout(1500);
      await page.screenshot({ path: '/tmp/claude-0/-home-user-techcase/712bd800-39f2-5608-899c-3c0c8c60968a/scratchpad/c08-cards.png' });
      const afterCards = await page.evaluate(() => document.body.innerText.slice(0, 300));
      if (/something went wrong/i.test(afterCards)) { FAIL('C-08', 'Error on Cards tab'); await ctx.close(); return; }

      // No "View ranking" button visible for consultant (canViewRanking = false)
      const rankingBtn = await page.locator('button').filter({ hasText: /view ranking/i }).count();
      if (rankingBtn > 0) { FAIL('C-08', `Ranking button visible for consultant (should be hidden) — count: ${rankingBtn}`); await ctx.close(); return; }

      PASS('C-08', 'Arena loads, Leaderboard visible, Cards tab visible, no ranking button');
    } catch(e) { FAIL('C-08', e.message.slice(0, 200)); }
    finally { await ctx.close(); }
  }

  // === CL-11: Client — no Apply button in Arena ===
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage(); page.setDefaultTimeout(20000);
    try {
      await login(page, 'test.client@test.arena.dev');
      const arenaBtn = page.locator('aside button').filter({ hasText: /^arena$/i }).first();
      if (!await arenaBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        FAIL('CL-11', 'Arena button not in sidebar'); await ctx.close(); return;
      }
      await arenaBtn.click(); await page.waitForTimeout(2500);

      // No Apply button
      const applyBtns = await page.locator('button').filter({ hasText: /^apply\s*→?$/i }).count();
      if (applyBtns > 0) {
        FAIL('CL-11', `Apply button visible for client (count: ${applyBtns})`);
      } else {
        PASS('CL-11', 'No Apply button visible for client in Arena');
      }
    } catch(e) { FAIL('CL-11', e.message.slice(0, 200)); }
    finally { await ctx.close(); }
  }

  await browser.close();
  log(`\nRESULTS: PASS=${pass}  FAIL=${fail}  TOTAL=${pass+fail}`);
})();
