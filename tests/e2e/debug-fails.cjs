/**
 * Debug screenshots for failing tests
 */
const { chromium } = require('playwright');
const fs = require('fs');
const RES = './test-results';
const APP = 'http://localhost:5173/';
const PW = 'Test@Arena2026!';

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
async function ss(page, name) { await page.screenshot({ path: `${RES}/${name}.png` }).catch(() => {}); log(`  [screenshot: ${name}.png]`); }
async function body(page) { return page.evaluate(() => document.body.innerText.slice(0, 5000)); }

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--no-sandbox'] });

  // === Debug A-20: Admin case Applications tab ===
  log('\n=== A-20: Admin case applications tab ===');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage(); page.setDefaultTimeout(20000);
    try {
      await login(page, 'test.admin@techcase.com', PW);
      // Navigate to cases/projects
      const casesBtn = page.locator('aside button').filter({ hasText: /cases|projects/i }).first();
      if (await casesBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await casesBtn.click(); await page.waitForTimeout(2000);
        await ss(page, 'debug-a20-cases-list');
        log('Cases list page: ' + (await body(page)).slice(0, 300).replace(/\n/g, ' '));
        // Click on a case
        const firstCase = page.locator('div[class*="card"], article, [class*="case-row"], tr').first();
        if (await firstCase.isVisible({ timeout: 2000 }).catch(() => false)) {
          await firstCase.click(); await page.waitForTimeout(2000);
          await ss(page, 'debug-a20-case-detail');
          log('Case detail: ' + (await body(page)).slice(0, 300).replace(/\n/g, ' '));
          // Check tabs
          const tabs = await page.locator('[role="tab"], button[class*="tab"]').allInnerTexts().catch(() => []);
          log('Tabs: ' + tabs.join(' | '));
        }
      } else {
        log('Cases button not found');
        await ss(page, 'debug-a20-dashboard');
        const sidebarBtns = await page.locator('aside button').allInnerTexts().catch(() => []);
        log('Sidebar buttons: ' + sidebarBtns.join(' | '));
      }
    } catch(e) { log('A-20 debug error: ' + e.message.slice(0, 200)); }
    finally { await ctx.close(); }
  }

  // === Debug A-12: Admin Settings → People → PM user ===
  log('\n=== A-12: Admin Settings People PM user ===');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage(); page.setDefaultTimeout(20000);
    try {
      await login(page, 'test.admin@techcase.com', PW);
      // Find settings
      const settingsBtn = page.locator('aside button').filter({ hasText: /settings/i }).first();
      if (await settingsBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await settingsBtn.click(); await page.waitForTimeout(2000);
        await ss(page, 'debug-a12-settings');
        log('Settings: ' + (await body(page)).slice(0, 300).replace(/\n/g, ' '));
        // Look for People tab
        const peopleTab = page.locator('[role="tab"], button').filter({ hasText: /^people$/i }).first();
        if (await peopleTab.isVisible({ timeout: 2000 }).catch(() => false)) {
          await peopleTab.click(); await page.waitForTimeout(2000);
          await ss(page, 'debug-a12-people');
          log('People tab: ' + (await body(page)).slice(0, 500).replace(/\n/g, ' '));
          // List user rows
          const rows = await page.locator('tr, [class*="row"], [class*="user-item"]').allInnerTexts().catch(() => []);
          log('User rows sample: ' + rows.slice(0, 5).join(' | '));
        } else {
          const tabs = await page.locator('[role="tab"], button[class*="tab"]').allInnerTexts().catch(() => []);
          log('Settings tabs: ' + tabs.join(' | '));
        }
      } else {
        log('Settings button not found');
        const sidebarBtns = await page.locator('aside button').allInnerTexts().catch(() => []);
        log('Sidebar: ' + sidebarBtns.join(' | '));
      }
    } catch(e) { log('A-12 debug error: ' + e.message.slice(0, 200)); }
    finally { await ctx.close(); }
  }

  // === Debug CL-05: Client profile tabs ===
  log('\n=== CL-05: Client profile tabs ===');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage(); page.setDefaultTimeout(20000);
    try {
      await login(page, 'test.client@test.arena.dev', PW);
      await ss(page, 'debug-cl05-dashboard');
      log('Dashboard: ' + (await body(page)).slice(0, 200).replace(/\n/g, ' '));
      // Try sidebar avatar/profile click
      const sidebarBtns = await page.locator('aside button').allInnerTexts().catch(() => []);
      log('Sidebar buttons: ' + sidebarBtns.join(' | '));

      // Look for avatar button in sidebar (bottom area)
      const avatarBtn = page.locator('aside button[class*="avatar"], aside [class*="avatar"], aside button').last();
      log('Last aside button text: ' + await avatarBtn.innerText().catch(() => 'N/A'));

      // Try company profile link
      const companyBtn = page.locator('aside button').filter({ hasText: /company|profile|my company/i }).first();
      if (await companyBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await companyBtn.click(); await page.waitForTimeout(2000);
        await ss(page, 'debug-cl05-company');
        log('Company profile: ' + (await body(page)).slice(0, 300).replace(/\n/g, ' '));
        const tabs = await page.locator('[role="tab"], button[class*="tab"], [class*="carousel"] button').allInnerTexts().catch(() => []);
        log('Tabs: ' + tabs.join(' | '));
      } else {
        // Click last sidebar button (avatar)
        const lastBtn = page.locator('aside button').last();
        await lastBtn.click(); await page.waitForTimeout(2000);
        await ss(page, 'debug-cl05-after-avatar');
        log('After avatar click: ' + (await body(page)).slice(0, 300).replace(/\n/g, ' '));
        const tabs = await page.locator('[role="tab"], button[class*="tab"]').allInnerTexts().catch(() => []);
        log('Tabs: ' + tabs.join(' | '));
      }
    } catch(e) { log('CL-05 debug error: ' + e.message.slice(0, 200)); }
    finally { await ctx.close(); }
  }

  // === Debug M-06: Manager Settings FinCorp ===
  log('\n=== M-06: Manager Settings FinCorp ===');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage(); page.setDefaultTimeout(20000);
    try {
      await login(page, 'test.manager@test.arena.dev', PW);
      const settingsBtn = page.locator('aside button').filter({ hasText: /settings/i }).first();
      if (await settingsBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await settingsBtn.click(); await page.waitForTimeout(2000);
        await ss(page, 'debug-m06-settings');
        log('Settings: ' + (await body(page)).slice(0, 300).replace(/\n/g, ' '));
        const tabs = await page.locator('[role="tab"], button[class*="tab"]').allInnerTexts().catch(() => []);
        log('Settings tabs: ' + tabs.join(' | '));

        // Look for client teams / companies
        const clientTeamTab = page.locator('[role="tab"], button').filter({ hasText: /client|team|compan/i }).first();
        if (await clientTeamTab.isVisible({ timeout: 2000 }).catch(() => false)) {
          await clientTeamTab.click(); await page.waitForTimeout(2000);
          await ss(page, 'debug-m06-clients');
          log('Client tab: ' + (await body(page)).slice(0, 500).replace(/\n/g, ' '));
        }
      } else {
        log('Settings not found');
        const sidebarBtns = await page.locator('aside button').allInnerTexts().catch(() => []);
        log('Sidebar: ' + sidebarBtns.join(' | '));
      }
    } catch(e) { log('M-06 debug error: ' + e.message.slice(0, 200)); }
    finally { await ctx.close(); }
  }

  // === Debug C-09: Consultant Arena card click ===
  log('\n=== C-09: Consultant Arena leaderboard card click ===');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage(); page.setDefaultTimeout(20000);
    try {
      await login(page, 'test.consultant@test.arena.dev', PW);
      const arenaBtn = page.locator('aside button').filter({ hasText: /^arena$/i }).first();
      if (await arenaBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await arenaBtn.click(); await page.waitForTimeout(2000);
        await ss(page, 'debug-c09-arena');
        log('Arena page: ' + (await body(page)).slice(0, 300).replace(/\n/g, ' '));
        // Find leaderboard section
        const lbSection = page.locator('[class*="leaderboard"], [class*="leader"]').first();
        if (await lbSection.isVisible({ timeout: 2000 }).catch(() => false)) {
          log('Leaderboard found');
          // Count cards
          const cards = await page.locator('[class*="leaderboard"] [class*="card"], [class*="leader"] [class*="card"], [class*="consultant"] [class*="card"]').count();
          log('Cards in leaderboard: ' + cards);
          // List all clickable divs with names
          const names = await page.evaluate(() => {
            const els = document.querySelectorAll('[class*="leaderboard"] div, [class*="leader"] div');
            return Array.from(els).slice(0, 10).map(e => ({ tag: e.tagName, cls: e.className.slice(0, 50), txt: e.innerText.slice(0, 50).replace(/\n/g, '|') }));
          });
          log('Leaderboard elements: ' + JSON.stringify(names.slice(0,5)));
        } else {
          log('No leaderboard section found');
          await ss(page, 'debug-c09-no-lb');
        }
      } else {
        log('Arena button not visible for consultant');
        const sidebarBtns = await page.locator('aside button').allInnerTexts().catch(() => []);
        log('Sidebar: ' + sidebarBtns.join(' | '));
      }
    } catch(e) { log('C-09 debug error: ' + e.message.slice(0, 200)); }
    finally { await ctx.close(); }
  }

  await browser.close();
  log('\nDone');
})();
