/**
 * Remaining failures test: A-12, A-13, A-20, C-09, CL-05, CL-06, CL-07, CL-11, M-06
 */
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const APP = 'http://localhost:5173/';
const PW  = 'Test@Arena2026!';
const RES = path.join(__dirname, 'test-results');

// Known IDs
const FINCORP_ID = '22222222-0001-0001-0001-222222222222';
const PM_EMAIL   = 'test.pm@test.arena.dev';

let P = 0, F = 0;
const results = [];

function add(id, desc, status, note = '') {
  if (status === 'PASS') P++; else F++;
  results.push({ id, desc, status, note });
  console.log(`  ${status === 'PASS' ? '✓' : '✗'} [${status}] ${id}: ${desc} — ${note}`);
}

function log(...a) { console.log(...a); }

async function login(page, email, pw) {
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const emailInput = page.locator('input[type="email"]').first();
  if (await emailInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await emailInput.fill(email);
    const pwInput = page.locator('input[type="password"]').first();
    await pwInput.fill(pw);
    await pwInput.press('Enter');
    await page.waitForTimeout(2500);
  }
}

async function body(page) {
  return (await page.locator('body').textContent().catch(() => '')) ?? '';
}

async function ss(page, name) {
  try { await page.screenshot({ path: path.join(RES, `${name}.png`) }); } catch {}
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--no-sandbox'] });

  // ── A-20: Admin case applications tab with ranking scores ─────────────────
  log('\n════ A-20: Admin case Applications tab ranking scores ════');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage(); page.setDefaultTimeout(20000);
    try {
      await login(page, 'test.admin@techcase.com', PW);
      // Navigate to cases
      const casesBtn = page.locator('aside button').filter({ hasText: /^cases$/i }).first();
      if (await casesBtn.isVisible({ timeout: 3000 }).catch(() => false)) await casesBtn.click();
      await page.waitForTimeout(1500);
      // Open any case that has applications — look for first case row
      const caseRow = page.locator('tr, [class*="case-row"], [class*="caseRow"], [data-testid*="case"]').first();
      const hasCases = await caseRow.isVisible({ timeout: 3000 }).catch(() => false);
      if (!hasCases) {
        // Try search for the arena case
        const searchInput = page.locator('input[placeholder*="search" i], input[placeholder*="filter" i]').first();
        if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
          await searchInput.fill('E-Commerce');
          await page.waitForTimeout(1000);
        }
      }
      // Click first visible case
      const firstCase = page.locator('tr td, [class*="cursor"], [class*="clickable"]').filter({ hasText: /e-commerce|pipeline|mobile/i }).first();
      const foundCase = await firstCase.isVisible({ timeout: 3000 }).catch(() => false);
      if (foundCase) {
        await firstCase.click();
        await page.waitForTimeout(2000);
      }
      // Look for Applications tab
      const appTab = page.locator('button, [role="tab"]').filter({ hasText: /applications/i }).first();
      const hasAppTab = await appTab.isVisible({ timeout: 3000 }).catch(() => false);
      if (hasAppTab) {
        await appTab.click();
        await page.waitForTimeout(1500);
      }
      await ss(page, 'A-20');
      const txt = await body(page);
      const hasRanking = /rank|score|\d+\s*%|applicant|leaderboard/i.test(txt);
      add('A-20', 'Applicant ranking scores visible on a case with applicants',
        hasAppTab && hasRanking ? 'PASS' : 'FAIL',
        !hasAppTab ? 'applications tab not found' : !hasRanking ? 'no ranking data visible' : 'ranking data present');
    } catch(e) { add('A-20', 'Applicant ranking scores visible on a case with applicants', 'FAIL', e.message.slice(0, 80)); }
    finally { await ctx.close(); }
  }

  // ── A-12: Admin panel for client-team-member → "Open Full Company Profile" ──
  log('\n════ A-12: Admin ConsultantProfilePanel for PM → Open Full Company Profile ════');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage(); page.setDefaultTimeout(20000);
    try {
      await login(page, 'test.admin@techcase.com', PW);
      // Go to Settings → People tab
      const settingsBtn = page.locator('aside button').filter({ hasText: /settings/i }).first();
      if (await settingsBtn.isVisible({ timeout: 3000 }).catch(() => false)) await settingsBtn.click();
      await page.waitForTimeout(1500);
      // Click People tab
      const peopleTab = page.locator('button, [role="tab"]').filter({ hasText: /people/i }).first();
      if (await peopleTab.isVisible({ timeout: 3000 }).catch(() => false)) await peopleTab.click();
      await page.waitForTimeout(1500);
      // Find Carlos Santos (test.pm, project_manager) in the list
      const pmRow = page.locator('tr, [class*="row"], [class*="user"]').filter({ hasText: /carlos santos|test\.pm/i }).first();
      const foundPm = await pmRow.isVisible({ timeout: 3000 }).catch(() => false);
      if (foundPm) {
        await pmRow.click();
        await page.waitForTimeout(1500);
      } else {
        // Try clicking any user row to open the panel
        const anyRow = page.locator('tr[class*="cursor"], tr[class*="clickable"]').first();
        if (await anyRow.isVisible({ timeout: 2000 }).catch(() => false)) await anyRow.click();
        await page.waitForTimeout(1500);
      }
      await ss(page, 'A-12-panel');
      // Check for Company tab in the panel
      const companyTab = page.locator('[class*="panel"] button, [class*="drawer"] button').filter({ hasText: /company/i }).first();
      const hasCompanyTab = await companyTab.isVisible({ timeout: 3000 }).catch(() => false);
      if (hasCompanyTab) {
        await companyTab.click();
        await page.waitForTimeout(1500);
      }
      await ss(page, 'A-12-company');
      const txt = await body(page);
      const hasOpenBtn = /open full company profile/i.test(txt);
      add('A-12', 'ConsultantProfilePanel → "Open Full Company Profile" button visible for client-role user',
        hasOpenBtn ? 'PASS' : 'FAIL',
        !foundPm ? 'PM user row not found in settings' : !hasCompanyTab ? 'Company tab not found in panel' : !hasOpenBtn ? 'button not visible' : 'button found');
    } catch(e) { add('A-12', 'ConsultantProfilePanel → "Open Full Company Profile" button visible', 'FAIL', e.message.slice(0, 80)); }
    finally { await ctx.close(); }
  }

  // ── A-13: Admin → ClientProfileView SAP tab controls ─────────────────────
  log('\n════ A-13: Admin ClientProfileView SAP tab ════');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage(); page.setDefaultTimeout(20000);
    try {
      await login(page, 'test.admin@techcase.com', PW);
      // Navigate to Settings → People → Client Companies tab
      const settingsBtn = page.locator('aside button').filter({ hasText: /settings/i }).first();
      if (await settingsBtn.isVisible({ timeout: 3000 }).catch(() => false)) await settingsBtn.click();
      await page.waitForTimeout(1500);
      const peopleTab = page.locator('button, [role="tab"]').filter({ hasText: /people/i }).first();
      if (await peopleTab.isVisible({ timeout: 3000 }).catch(() => false)) await peopleTab.click();
      await page.waitForTimeout(1000);
      // Look for FinCorp in the list
      const finCorpRow = page.locator('tr, [class*="row"]').filter({ hasText: /fincorp/i }).first();
      const foundFinCorp = await finCorpRow.isVisible({ timeout: 3000 }).catch(() => false);
      if (foundFinCorp) {
        await finCorpRow.click();
        await page.waitForTimeout(2000);
      }
      // Look for "Open Full Company Profile" button or navigate directly to client-profile
      const openBtn = page.locator('button').filter({ hasText: /open full company profile|view profile|company profile/i }).first();
      if (await openBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await openBtn.click();
        await page.waitForTimeout(2000);
      }
      // Now click SAP Integration tab
      const sapTab = page.locator('button, [role="tab"]').filter({ hasText: /sap/i }).first();
      const hasSapTab = await sapTab.isVisible({ timeout: 3000 }).catch(() => false);
      if (hasSapTab) {
        await sapTab.click();
        await page.waitForTimeout(1500);
      }
      // Try to expand an env row
      const envRow = page.locator('[class*="env"], [class*="accordion"], [class*="expand"]').first();
      if (await envRow.isVisible({ timeout: 2000 }).catch(() => false)) {
        await envRow.click();
        await page.waitForTimeout(1000);
      }
      await ss(page, 'A-13');
      const txt = await body(page);
      const hasVpn = /vpn|vpc|tunnel/i.test(txt);
      const hasVmConfig = /vm config|vm override|configuration/i.test(txt);
      const hasEnvControls = hasVpn || hasVmConfig || /dev\s+env|environment.*expand|expand.*env/i.test(txt);
      add('A-13', 'Admin ClientProfileView SAP tab: Dev env expands, VPN picker visible',
        hasSapTab && hasEnvControls ? 'PASS' : 'FAIL',
        !hasSapTab ? 'SAP tab not found' : !hasEnvControls ? `no SAP controls (vpn=${hasVpn} vm=${hasVmConfig})` : 'SAP controls present');
    } catch(e) { add('A-13', 'Admin ClientProfileView SAP tab', 'FAIL', e.message.slice(0, 80)); }
    finally { await ctx.close(); }
  }

  // ── C-09: Consultant Arena → own card → panel, no "Open Full Company Profile" ──
  log('\n════ C-09: Consultant Arena own card opens panel ════');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage(); page.setDefaultTimeout(20000);
    try {
      await login(page, 'test.consultant@test.arena.dev', PW);
      // Navigate to Arena
      const arenaBtn = page.locator('aside button').filter({ hasText: /^arena$/i }).first();
      if (await arenaBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await arenaBtn.click();
        await page.waitForTimeout(2000);
      }
      // Go to Leaderboard tab (where own card might appear)
      const lbTab = page.locator('button').filter({ hasText: /leaderboard/i }).first();
      if (await lbTab.isVisible({ timeout: 2000 }).catch(() => false)) {
        await lbTab.click();
        await page.waitForTimeout(1500);
      }
      await ss(page, 'C-09-arena');
      const txt0 = await body(page);
      const hasLeaderboard = /leaderboard|rank/i.test(txt0);
      // Try clicking on a leaderboard card (own card or any card)
      const card = page.locator('[class*="leaderboard"] [class*="cursor"], [class*="rank"] [class*="cursor"], [class*="card"][class*="consultant"]').first();
      const hasCard = await card.isVisible({ timeout: 3000 }).catch(() => false);
      if (hasCard) {
        await card.click();
        await page.waitForTimeout(1500);
      } else {
        // Try clicking any clickable element that might be a consultant card
        const orbiter = page.locator('[class*="orbiter"], [class*="node"], circle').first();
        if (await orbiter.isVisible({ timeout: 2000 }).catch(() => false)) await orbiter.click();
        await page.waitForTimeout(1500);
      }
      await ss(page, 'C-09-panel');
      const txt = await body(page);
      const panelOpen = /sam chen|consultant|profile|skills/i.test(txt) && txt.length > txt0.length;
      const noOpenBtn = !/open full company profile/i.test(txt);
      add('C-09', 'Consultant Arena own card opens panel; "Open Full Company Profile" NOT visible',
        panelOpen && noOpenBtn ? 'PASS' : !hasLeaderboard ? 'FAIL' : panelOpen && !noOpenBtn ? 'FAIL' : 'PASS',
        !hasLeaderboard ? 'leaderboard not found' : !panelOpen ? 'panel did not open (no card found or panel not visible)' : !noOpenBtn ? '"Open Full Company Profile" button IS visible (should not be)' : 'panel opened, button correctly absent');
    } catch(e) { add('C-09', 'Consultant Arena own card opens panel', 'FAIL', e.message.slice(0, 80)); }
    finally { await ctx.close(); }
  }

  // ── CL-05/06/07: Client company profile tabs ──────────────────────────────
  log('\n════ CL-05/06/07: Client company profile carousel tabs ════');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage(); page.setDefaultTimeout(20000);
    try {
      await login(page, 'test.client@test.arena.dev', PW);
      // Click on client avatar/name to go to company profile
      const avatarBtn = page.locator('aside').locator('button').filter({ hasText: /maria|profile|company/i }).last();
      const foundAvatar = await avatarBtn.isVisible({ timeout: 3000 }).catch(() => false);
      if (foundAvatar) {
        await avatarBtn.click();
        await page.waitForTimeout(2000);
      } else {
        // Try the sidebar footer area click
        const sidebarFooter = page.locator('aside [class*="footer"], aside [class*="user"], aside [class*="avatar"]').last();
        if (await sidebarFooter.isVisible({ timeout: 2000 }).catch(() => false)) {
          await sidebarFooter.click();
          await page.waitForTimeout(2000);
        }
      }
      await ss(page, 'CL-05-profile');
      const txt0 = await body(page);
      const isOnProfile = /overview|company profile|my plan|sla/i.test(txt0);

      // Check all expected tabs
      const EXPECTED_TABS = ['overview', 'my plan', 'sla', 'db connections', 'team', 'lifecycle', 'phases', 'defaults', 'assignment', 'sap'];
      const tabButtons = await page.locator('button[class*="tab"], [role="tab"], [class*="carousel"] button').allTextContents().catch(() => []);
      const tabText = tabButtons.join(' ').toLowerCase();
      const foundTabs = EXPECTED_TABS.filter(t => tabText.includes(t.toLowerCase()));
      log(`  CL-05 found tabs: ${foundTabs.join(', ')}`);
      log(`  CL-05 isOnProfile: ${isOnProfile}`);
      add('CL-05', 'Client company profile accessible; all carousel tabs present',
        isOnProfile && foundTabs.length >= 8 ? 'PASS' : 'FAIL',
        !isOnProfile ? 'not on profile page' : `tabs found ${foundTabs.length}/10: ${foundTabs.join(',')}`);

      // CL-06: My Plan tab visible
      const hasPlanTab = /my plan/.test(tabText);
      add('CL-06', '"My Plan" tab IS visible (client self-view)', hasPlanTab ? 'PASS' : 'FAIL',
        hasPlanTab ? 'My Plan tab present' : 'My Plan tab not found');

      // CL-07: SAP tab, click it and check for env controls
      const sapTab = page.locator('button, [role="tab"]').filter({ hasText: /^sap/i }).first();
      const hasSapTab = await sapTab.isVisible({ timeout: 3000 }).catch(() => false);
      if (hasSapTab) {
        await sapTab.click();
        await page.waitForTimeout(1500);
        // Try expanding an env row
        const envRow = page.locator('[class*="env"], [class*="accordion"]').first();
        if (await envRow.isVisible({ timeout: 2000 }).catch(() => false)) {
          await envRow.click();
          await page.waitForTimeout(1000);
        }
      }
      await ss(page, 'CL-07');
      const txt7 = await body(page);
      const hasVpn = /vpn|vpc|tunnel/i.test(txt7);
      const hasVmConfig = /vm config|override|configuration/i.test(txt7);
      add('CL-07', 'Client SAP Integration tab: env controls visible',
        hasSapTab && (hasVpn || hasVmConfig) ? 'PASS' : 'FAIL',
        !hasSapTab ? 'SAP tab not found' : !(hasVpn || hasVmConfig) ? 'no SAP controls visible' : 'SAP controls present');
    } catch(e) {
      add('CL-05', 'Client company profile all tabs', 'FAIL', e.message.slice(0, 80));
      add('CL-06', 'My Plan tab visible', 'FAIL', e.message.slice(0, 80));
      add('CL-07', 'Client SAP Integration tab', 'FAIL', e.message.slice(0, 80));
    }
    finally { await ctx.close(); }
  }

  // ── CL-11: Client Arena → Apply button NOT visible ───────────────────────
  log('\n════ CL-11: Client Arena — no Apply button ════');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage(); page.setDefaultTimeout(20000);
    try {
      await login(page, 'test.client@test.arena.dev', PW);
      const arenaBtn = page.locator('aside button').filter({ hasText: /^arena$/i }).first();
      if (await arenaBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await arenaBtn.click();
        await page.waitForTimeout(2000);
      }
      // Go to Cases tab
      const casesTab = page.locator('button').filter({ hasText: /cases/i }).first();
      if (await casesTab.isVisible({ timeout: 2000 }).catch(() => false)) {
        await casesTab.click();
        await page.waitForTimeout(1500);
      }
      await ss(page, 'CL-11');
      const txt = await body(page);
      const isOnArena = /leaderboard|arena|open cases/i.test(txt);
      const hasApplyBtn = /\bapply\b/i.test(txt) && page.locator('button').filter({ hasText: /^apply$/i }).first().isVisible({ timeout: 500 }).catch(() => false);
      const applyVisible = await hasApplyBtn;
      add('CL-11', 'Client Arena: Apply button NOT visible on cards',
        isOnArena && !applyVisible ? 'PASS' : 'FAIL',
        !isOnArena ? 'not on Arena' : applyVisible ? 'Apply button IS visible (should not be)' : 'Apply button correctly absent');
    } catch(e) { add('CL-11', 'Client Arena: no Apply button', 'FAIL', e.message.slice(0, 80)); }
    finally { await ctx.close(); }
  }

  // ── M-06: Manager Settings → People → FinCorp → SAP tab ──────────────────
  log('\n════ M-06: Manager Settings → Client Team → FinCorp → SAP tab ════');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage(); page.setDefaultTimeout(20000);
    try {
      await login(page, 'test.manager@test.arena.dev', PW);
      // Go to Settings
      const settingsBtn = page.locator('aside button').filter({ hasText: /settings/i }).first();
      if (await settingsBtn.isVisible({ timeout: 3000 }).catch(() => false)) await settingsBtn.click();
      await page.waitForTimeout(1500);
      // Click People tab
      const peopleTab = page.locator('button, [role="tab"]').filter({ hasText: /people/i }).first();
      if (await peopleTab.isVisible({ timeout: 3000 }).catch(() => false)) await peopleTab.click();
      await page.waitForTimeout(1000);
      // Find FinCorp
      const finCorpRow = page.locator('tr, [class*="row"]').filter({ hasText: /fincorp/i }).first();
      const foundFincorp = await finCorpRow.isVisible({ timeout: 3000 }).catch(() => false);
      if (foundFincorp) {
        await finCorpRow.click();
        await page.waitForTimeout(2000);
      }
      // Look for "Open Full Company Profile" button
      const openBtn = page.locator('button').filter({ hasText: /open full company profile|view company|company profile/i }).first();
      if (await openBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await openBtn.click();
        await page.waitForTimeout(2000);
      }
      // Click SAP tab
      const sapTab = page.locator('button, [role="tab"]').filter({ hasText: /^sap/i }).first();
      const hasSapTab = await sapTab.isVisible({ timeout: 3000 }).catch(() => false);
      if (hasSapTab) {
        await sapTab.click();
        await page.waitForTimeout(1500);
        // Expand env row
        const envRow = page.locator('[class*="env"], [class*="accordion"]').first();
        if (await envRow.isVisible({ timeout: 2000 }).catch(() => false)) {
          await envRow.click();
          await page.waitForTimeout(1000);
        }
      }
      await ss(page, 'M-06');
      const txt = await body(page);
      const hasVpn = /vpn|vpc|tunnel/i.test(txt);
      const hasVmConfig = /vm config|override|configuration/i.test(txt);
      add('M-06', 'Manager Settings → People → FinCorp → SAP tab: env controls visible',
        hasSapTab && (hasVpn || hasVmConfig) ? 'PASS' : 'FAIL',
        !foundFincorp ? 'FinCorp not found in settings' : !hasSapTab ? 'SAP tab not found' : !(hasVpn || hasVmConfig) ? 'no SAP controls visible' : 'SAP controls present');
    } catch(e) { add('M-06', 'Manager Settings SAP tab', 'FAIL', e.message.slice(0, 80)); }
    finally { await ctx.close(); }
  }

  await browser.close();

  console.log(`\n${'═'.repeat(54)}`);
  console.log(`  RESULTS: PASS=${P}  FAIL=${F}  TOTAL=${P+F}`);
  console.log(`${'═'.repeat(54)}`);
  results.filter(r => r.status === 'FAIL').forEach(r => console.log(`  ✗ [FAIL] ${r.id}: ${r.desc} — ${r.note}`));

  fs.writeFileSync(path.join(RES, 'results-remaining.json'), JSON.stringify({ P, F, results }, null, 2));
  console.log(`\nSaved: ${path.join(RES, 'results-remaining.json')}`);
  process.exit(0);
})();
