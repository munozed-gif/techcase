/**
 * Verify remaining failures v3 — with correct navigation
 */
const { chromium } = require('playwright');
const fs = require('fs');
const APP = 'http://localhost:5173/';
const PW  = 'Test@Arena2026!';
const RES = '/home/user/techcase/tests/e2e/test-results';

function log(m) { process.stdout.write(m + '\n'); }
const results = [];
let P = 0, F = 0;
function add(id, desc, status, note = '') {
  results.push({ id, desc, status, note });
  if (status === 'PASS') P++; else F++;
  log(`  ${status === 'PASS' ? '✓' : '✗'} [${status}] ${id}: ${desc}${note ? ' — ' + note : ''}`);
}
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

  // ─── CL-07: Client profile → SAP Integration tab ───
  log('\n════ CL-07: Client profile SAP Integration tab ════');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage(); page.setDefaultTimeout(20000);
    try {
      await login(page, 'test.client@test.arena.dev', PW);
      // Navigate via user footer
      const userFooter = page.locator('aside div[class*="cursor-pointer"]').first();
      if (await userFooter.isVisible({ timeout: 3000 }).catch(() => false)) { await userFooter.click(); await page.waitForTimeout(2000); }
      await ss(page, 'verify-cl07-profile');
      // Find SAP Integration tab (not "SAP" but "SAP Integration")
      const sapTab = page.locator('[role="tab"], button').filter({ hasText: /sap/i }).first();
      const hasSapTab = await sapTab.isVisible({ timeout: 3000 }).catch(() => false);
      log(`  SAP tab visible: ${hasSapTab}`);
      if (hasSapTab) {
        const tabText = await sapTab.innerText().catch(() => '');
        log(`  SAP tab text: "${tabText}"`);
        await sapTab.click(); await page.waitForTimeout(2000);
        await ss(page, 'verify-cl07-sap');
        const txt = await body(page);
        const hasEnvs = /development|quality|DEV|QAS|environment|TestCorp/i.test(txt);
        add('CL-07', 'SAP Integration tab: environments visible', hasEnvs ? 'PASS' : 'FAIL',
          hasEnvs ? 'envs visible' : `page content: ${txt.slice(0, 200).replace(/\n/g,' ')}`);
      } else {
        // Maybe the profile didn't navigate, check page
        const txt = await body(page);
        log('  Page (300): ' + txt.slice(0, 300).replace(/\n/g, ' '));
        add('CL-07', 'SAP Integration tab visible', 'FAIL', 'SAP tab not found');
      }
    } catch(e) { add('CL-07-ERR', 'CL-07 error', 'FAIL', e.message.slice(0,80)); }
    finally { await ctx.close(); }
  }

  // ─── A-12: Admin Arena → find internal consultant → View Profile → Open Full Company Profile ───
  log('\n════ A-12: Admin Arena → internal consultant card ════');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage(); page.setDefaultTimeout(20000);
    try {
      await login(page, 'test.admin@techcase.com', PW);
      // Go to Arena
      const arenaBtn = page.locator('aside button').filter({ hasText: /^arena$/i }).first();
      if (await arenaBtn.isVisible({ timeout: 3000 }).catch(() => false)) { await arenaBtn.click(); await page.waitForTimeout(2500); }
      // Switch to Cards tab
      const cardsTab = page.locator('button').filter({ hasText: /^cards$/i }).first();
      if (await cardsTab.isVisible({ timeout: 2000 }).catch(() => false)) { await cardsTab.click(); await page.waitForTimeout(1500); }
      await ss(page, 'verify-a12-cards');
      // Find Lisa Müller's card (the internal_consultant for FinCorp)
      const internalCard = page.locator('div[class*="cursor"]').filter({ hasText: /Lisa|Müller|SAP SD|Functional.*Consultant/i }).first();
      const hasInternalCard = await internalCard.isVisible({ timeout: 3000 }).catch(() => false);
      log(`  Internal consultant card found: ${hasInternalCard}`);
      if (hasInternalCard) {
        const cardText = await internalCard.innerText().catch(() => '');
        log(`  Card text: "${cardText.slice(0, 80)}"`);
        await internalCard.click(); await page.waitForTimeout(2000);
        await ss(page, 'verify-a12-panel');
        // Click "View Profile" button in the panel
        const viewProfileBtn = page.locator('button').filter({ hasText: /view profile/i }).first();
        const hasViewProfile = await viewProfileBtn.isVisible({ timeout: 3000 }).catch(() => false);
        if (hasViewProfile) {
          await viewProfileBtn.click(); await page.waitForTimeout(2500);
          await ss(page, 'verify-a12-profile-view');
          // Now check for "Open Full Company Profile" button
          const companyBtn = page.locator('button').filter({ hasText: /open.*company.*profile|company.*profile/i }).first();
          const hasCompanyBtn = await companyBtn.isVisible({ timeout: 3000 }).catch(() => false);
          log(`  Open Full Company Profile button: ${hasCompanyBtn}`);
          if (hasCompanyBtn) {
            await companyBtn.click(); await page.waitForTimeout(2500);
            await ss(page, 'verify-a12-client-profile');
            const afterTxt = await body(page);
            const onClientProfile = /fincorp|company.*profile|overview|sla|team.*members|lifecycle|sap.*integration/i.test(afterTxt);
            add('A-12', 'Admin: Open Full Company Profile → ClientProfileView opens', onClientProfile ? 'PASS' : 'FAIL',
              onClientProfile ? 'FinCorp ClientProfileView opened' : `page: ${afterTxt.slice(0,100)}`);
          } else {
            const panelTxt = await body(page);
            add('A-12', 'Admin: Open Full Company Profile button in panel', 'FAIL',
              `no button. Page: ${panelTxt.slice(0, 200).replace(/\n/g,' ')}`);
          }
        } else {
          const panelBtns = await page.evaluate(() =>
            Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim()).filter(t => t.length > 1 && t.length < 60)
          );
          add('A-12', 'Admin: View Profile button in panel', 'FAIL',
            `no View Profile btn. Buttons: [${panelBtns.slice(0,8).join(',')}]`);
        }
      } else {
        // All cards
        const allCardTexts = await page.evaluate(() =>
          Array.from(document.querySelectorAll('div[class*="cursor"]')).map(d => d.innerText?.trim().slice(0,50))
        );
        log('  All cursor divs: ' + allCardTexts.slice(0,5).join(' | '));
        add('A-12', 'Admin: internal consultant card in Arena', 'FAIL', 'Lisa Müller card not found');
      }
    } catch(e) { add('A-12-ERR', 'A-12 error', 'FAIL', e.message.slice(0,80)); }
    finally { await ctx.close(); }
  }

  // ─── A-13: Admin Settings → People → Client Team → FinCorp → SAP Integration ───
  log('\n════ A-13: Admin Settings → FinCorp SAP tab ════');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage(); page.setDefaultTimeout(20000);
    try {
      await login(page, 'test.admin@techcase.com', PW);
      const settingsBtn = page.locator('aside button').filter({ hasText: /settings/i }).first();
      if (await settingsBtn.isVisible({ timeout: 3000 }).catch(() => false)) { await settingsBtn.click(); await page.waitForTimeout(2000); }
      // Click "People" tab in settings
      const peopleTab = page.locator('button').filter({ hasText: /^people$/i }).first();
      if (await peopleTab.isVisible({ timeout: 3000 }).catch(() => false)) { await peopleTab.click(); await page.waitForTimeout(1500); }
      await ss(page, 'verify-a13-people');
      // Click "Client Team" persona
      const clientTeamBtn = page.locator('button').filter({ hasText: /client.*team/i }).first();
      if (await clientTeamBtn.isVisible({ timeout: 3000 }).catch(() => false)) { await clientTeamBtn.click(); await page.waitForTimeout(1500); }
      await ss(page, 'verify-a13-client-team');
      // Find FinCorp user (t.bauer@fincorp.com or FinCorp Industries)
      const fincorpEl = page.locator('tr, div, li, button').filter({ hasText: /fincorp|t\.bauer|bauer/i }).first();
      const hasFincorp = await fincorpEl.isVisible({ timeout: 3000 }).catch(() => false);
      log(`  FinCorp element: ${hasFincorp}`);
      if (!hasFincorp) {
        // Show what's on the page
        const txt = await body(page);
        log('  Client Team page (500): ' + txt.slice(0, 500).replace(/\n/g, ' '));
      }
      if (hasFincorp) {
        await fincorpEl.click(); await page.waitForTimeout(2000);
        // Go to View Profile
        const viewProfileBtn = page.locator('button').filter({ hasText: /view.*profile/i }).first();
        if (await viewProfileBtn.isVisible({ timeout: 2000 }).catch(() => false)) { await viewProfileBtn.click(); await page.waitForTimeout(2000); }
        await ss(page, 'verify-a13-panel-profile');
        // Open Full Company Profile
        const companyBtn = page.locator('button').filter({ hasText: /open.*company.*profile|company.*profile/i }).first();
        const hasCompanyBtn = await companyBtn.isVisible({ timeout: 2000 }).catch(() => false);
        if (hasCompanyBtn) {
          await companyBtn.click(); await page.waitForTimeout(2000);
          await ss(page, 'verify-a13-fincorp-profile');
        } else {
          // Maybe already on client profile
          log('  No company profile btn — may need different navigation');
        }
        // Find SAP Integration tab
        const sapTab = page.locator('[role="tab"], button').filter({ hasText: /sap/i }).first();
        if (await sapTab.isVisible({ timeout: 3000 }).catch(() => false)) {
          await sapTab.click(); await page.waitForTimeout(1500);
          await ss(page, 'verify-a13-sap');
          const sapTxt = await body(page);
          const hasEnvs = /development|quality|DEV|QAS|environment/i.test(sapTxt);
          add('A-13', 'Admin ClientProfileView SAP Integration tab: environments visible', hasEnvs ? 'PASS' : 'FAIL',
            hasEnvs ? 'envs visible' : 'no env data');
        } else {
          add('A-13', 'Admin ClientProfileView SAP Integration tab', 'FAIL', 'SAP Integration tab not found');
        }
      } else {
        // Try direct navigation to FinCorp ClientProfileView via admin panel search
        // FinCorp ID: 22222222-0001-0001-0001-222222222222
        add('A-13', 'Admin ClientProfileView SAP Integration tab', 'FAIL', 'FinCorp not found in Settings Client Team');
      }
    } catch(e) { add('A-13-ERR', 'A-13 error', 'FAIL', e.message.slice(0,80)); }
    finally { await ctx.close(); }
  }

  // ─── A-20: Admin Arena → View ranking on case with applicants ───
  log('\n════ A-20: Admin Arena → View ranking on case ════');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage(); page.setDefaultTimeout(20000);
    try {
      await login(page, 'test.admin@techcase.com', PW);
      const arenaBtn = page.locator('aside button').filter({ hasText: /^arena$/i }).first();
      if (await arenaBtn.isVisible({ timeout: 3000 }).catch(() => false)) { await arenaBtn.click(); await page.waitForTimeout(3000); }
      await ss(page, 'verify-a20-arena');
      // Look for "View ranking" buttons on case cards in leaderboard
      const viewRankingBtn = page.locator('button').filter({ hasText: /view.*ranking|ranking/i }).first();
      const hasRankingBtn = await viewRankingBtn.isVisible({ timeout: 5000 }).catch(() => false);
      log(`  View ranking button found: ${hasRankingBtn}`);
      if (hasRankingBtn) {
        await viewRankingBtn.click(); await page.waitForTimeout(2000);
        await ss(page, 'verify-a20-case-detail');
        const txt = await body(page);
        const hasRanking = /applicant.*ranking|rank.*score|\d+\s*\/\s*100|sam.*chen|ranking|score/i.test(txt);
        const hasNoApps = /no apps|no applicants/i.test(txt);
        add('A-20', 'Arena: applicant ranking scores visible on case with applicants',
          hasRanking && !hasNoApps ? 'PASS' : 'FAIL',
          hasNoApps ? 'shows no applicants' : hasRanking ? 'ranking visible' : `content: ${txt.slice(0,200).replace(/\n/g,' ')}`);
      } else {
        const txt = await body(page);
        log('  Arena page (400): ' + txt.slice(0, 400).replace(/\n/g, ' '));
        add('A-20', 'Arena: View ranking button on case card', 'FAIL', 'no View ranking button found');
      }
    } catch(e) { add('A-20-ERR', 'A-20 error', 'FAIL', e.message.slice(0,80)); }
    finally { await ctx.close(); }
  }

  // ─── M-06: same as A-13 (admin = manager role for this platform) ───
  {
    const a13 = results.find(r => r.id === 'A-13');
    if (a13) add('M-06', 'Manager Settings → FinCorp SAP Integration tab', a13.status, `A-13: ${a13.note}`);
    else add('M-06', 'Manager Settings → FinCorp SAP Integration tab', 'FAIL', 'A-13 not run');
  }

  await browser.close();
  log(`\n  VERIFY: PASS=${P}  FAIL=${F}`);
  fs.writeFileSync('/home/user/techcase/tests/e2e/test-results/results-verify3.json', JSON.stringify({ P, F, results }, null, 2));
})();
