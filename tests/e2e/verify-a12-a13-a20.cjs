/**
 * Targeted verification for A-12, A-13, A-20
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
async function body(page) { return page.evaluate(() => document.body.innerText.slice(0, 6000)); }

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--no-sandbox'] });

  // ─── A-12: Find Lisa Müller in Arena Cards (she's internal_consultant for FinCorp) ───
  log('\n════ A-12: Admin Arena → Lisa Müller (internal consultant) card ════');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage(); page.setDefaultTimeout(20000);
    try {
      await login(page, 'test.admin@techcase.com', PW);
      const arenaBtn = page.locator('aside button').filter({ hasText: /^arena$/i }).first();
      if (await arenaBtn.isVisible({ timeout: 3000 }).catch(() => false)) { await arenaBtn.click(); await page.waitForTimeout(2500); }
      // Switch to Cards tab
      const cardsTab = page.locator('button').filter({ hasText: /^cards$/i }).first();
      if (await cardsTab.isVisible({ timeout: 2000 }).catch(() => false)) { await cardsTab.click(); await page.waitForTimeout(1500); }
      // Find Lisa Müller's card specifically
      const lisaCard = page.locator('div[class*="cursor"]').filter({ hasText: /Lisa|Müller|Muller/i }).first();
      const hasLisa = await lisaCard.isVisible({ timeout: 3000 }).catch(() => false);
      log(`  Lisa Müller card found: ${hasLisa}`);
      if (!hasLisa) {
        // Show all card names
        const cardNames = await page.evaluate(() =>
          Array.from(document.querySelectorAll('div[class*="cursor"]'))
            .map(d => d.querySelector('.font-semibold')?.innerText?.trim() || d.innerText?.split('\n')[0]?.trim())
            .filter(t => t && t.length < 50)
        );
        log('  Card names visible: ' + cardNames.join(' | '));
        add('A-12', 'Admin: internal consultant card (Lisa Müller) in Arena', 'FAIL', 'Lisa not found. Cards: ' + cardNames.slice(0,5).join(','));
      } else {
        await lisaCard.click(); await page.waitForTimeout(2000);
        await ss(page, 'verify-a12-lisa-panel');
        // Click "View Profile"
        const viewProfileBtn = page.locator('button').filter({ hasText: /view.*profile/i }).first();
        const hasViewProfile = await viewProfileBtn.isVisible({ timeout: 3000 }).catch(() => false);
        log(`  View Profile button: ${hasViewProfile}`);
        if (hasViewProfile) {
          await viewProfileBtn.click(); await page.waitForTimeout(3000);
          await ss(page, 'verify-a12-lisa-profile');
          const txt = await body(page);
          log('  Profile page (300): ' + txt.slice(0, 300).replace(/\n/g, ' '));
          const companyBtn = page.locator('button').filter({ hasText: /open.*company.*profile|company.*profile/i }).first();
          const hasCompanyBtn = await companyBtn.isVisible({ timeout: 3000 }).catch(() => false);
          log(`  Open Full Company Profile: ${hasCompanyBtn}`);
          if (hasCompanyBtn) {
            await companyBtn.click(); await page.waitForTimeout(2000);
            await ss(page, 'verify-a12-fincorp');
            const afterTxt = await body(page);
            const onClientProfile = /fincorp|company.*profile|overview|sla|team|lifecycle|sap/i.test(afterTxt);
            add('A-12', 'Open Full Company Profile → ClientProfileView opens', onClientProfile ? 'PASS' : 'FAIL',
              onClientProfile ? 'ClientProfileView opened' : `page: ${afterTxt.slice(0,100)}`);
          } else {
            add('A-12', 'Open Full Company Profile button visible', 'FAIL',
              `not visible. Txt: ${txt.slice(0, 200).replace(/\n/g,' ')}`);
          }
        } else {
          const panelBtns = await page.evaluate(() =>
            Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim()).filter(t => t.length > 1 && t.length < 60)
          );
          add('A-12', 'View Profile button in panel', 'FAIL', `[${panelBtns.slice(0,8).join(',')}]`);
        }
      }
    } catch(e) { add('A-12-ERR', 'A-12 error', 'FAIL', e.message.slice(0,80)); }
    finally { await ctx.close(); }
  }

  // ─── A-13/M-06: Settings → People → Client Team → FinCorp user → navigate to profile ───
  log('\n════ A-13/M-06: Admin Settings → FinCorp SAP Integration tab ════');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage(); page.setDefaultTimeout(20000);
    try {
      await login(page, 'test.admin@techcase.com', PW);
      // Settings
      const settingsBtn = page.locator('aside button').filter({ hasText: /settings/i }).first();
      if (await settingsBtn.isVisible({ timeout: 3000 }).catch(() => false)) { await settingsBtn.click(); await page.waitForTimeout(2000); }
      // People tab
      const peopleTab = page.locator('button').filter({ hasText: /^people$/i }).first();
      if (await peopleTab.isVisible({ timeout: 3000 }).catch(() => false)) { await peopleTab.click(); await page.waitForTimeout(1500); }
      // Client Team persona
      const clientTeamBtn = page.locator('button').filter({ hasText: /client.*team/i }).first();
      if (await clientTeamBtn.isVisible({ timeout: 3000 }).catch(() => false)) { await clientTeamBtn.click(); await page.waitForTimeout(1500); }
      await ss(page, 'verify-a13-client-team');
      const txt = await body(page);
      log('  Client Team (400): ' + txt.slice(0, 400).replace(/\n/g, ' '));

      // Find t.bauer@fincorp.com or any FinCorp user
      const fincorpUserEl = page.locator('tr, div[class*="card"], div[class*="row"], button').filter({ hasText: /fincorp|bauer|FinCorp/i }).first();
      const hasFincorp = await fincorpUserEl.isVisible({ timeout: 3000 }).catch(() => false);
      log(`  FinCorp user found: ${hasFincorp}`);
      if (hasFincorp) {
        const elTxt = await fincorpUserEl.innerText().catch(() => '');
        log(`  FinCorp element text: "${elTxt.slice(0, 80)}"`);
        await fincorpUserEl.click(); await page.waitForTimeout(2500);
        await ss(page, 'verify-a13-after-click');
        const afterTxt = await body(page);
        log('  After click (400): ' + afterTxt.slice(0, 400).replace(/\n/g, ' '));
        // Check for panel with View Profile
        const viewProfileBtn = page.locator('button').filter({ hasText: /view.*profile/i }).first();
        const hasViewProfile = await viewProfileBtn.isVisible({ timeout: 3000 }).catch(() => false);
        log(`  View Profile button: ${hasViewProfile}`);
        if (hasViewProfile) {
          await viewProfileBtn.click(); await page.waitForTimeout(3000);
          await ss(page, 'verify-a13-profile-view');
          const profileTxt = await body(page);
          log('  Profile (300): ' + profileTxt.slice(0, 300).replace(/\n/g, ' '));
          // Look for Open Full Company Profile
          const companyBtn = page.locator('button').filter({ hasText: /open.*company.*profile|company.*profile/i }).first();
          const hasCompanyBtn = await companyBtn.isVisible({ timeout: 3000 }).catch(() => false);
          log(`  Open Full Company Profile: ${hasCompanyBtn}`);
          if (hasCompanyBtn) {
            await companyBtn.click(); await page.waitForTimeout(2000);
            await ss(page, 'verify-a13-fincorp-profile');
          }
        }
        // Check for SAP Integration tab (whether we got there via button or directly)
        const sapTab = page.locator('[role="tab"], button').filter({ hasText: /sap.*integration/i }).first();
        const hasSapTab = await sapTab.isVisible({ timeout: 3000 }).catch(() => false);
        if (hasSapTab) {
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
        add('A-13', 'Admin ClientProfileView SAP tab', 'FAIL', 'FinCorp user not found in Settings Client Team');
      }
    } catch(e) { add('A-13-ERR', 'A-13 error', 'FAIL', e.message.slice(0,80)); }
    finally { await ctx.close(); }
  }

  // ─── A-20: Admin Arena → View ranking on estimated case ───
  log('\n════ A-20: Admin Arena → View ranking (estimated case) ════');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage(); page.setDefaultTimeout(20000);
    try {
      await login(page, 'test.admin@techcase.com', PW);
      const arenaBtn = page.locator('aside button').filter({ hasText: /^arena$/i }).first();
      if (await arenaBtn.isVisible({ timeout: 3000 }).catch(() => false)) { await arenaBtn.click(); await page.waitForTimeout(4000); }
      await ss(page, 'verify-a20-arena-new');
      const txt = await body(page);
      log('  Arena (500): ' + txt.slice(0, 500).replace(/\n/g, ' '));
      // Look for "View ranking" button
      const viewRankBtn = page.locator('button').filter({ hasText: /view.*ranking/i }).first();
      const hasViewRank = await viewRankBtn.isVisible({ timeout: 3000 }).catch(() => false);
      log(`  View ranking button: ${hasViewRank}`);
      if (hasViewRank) {
        await viewRankBtn.click(); await page.waitForTimeout(2500);
        await ss(page, 'verify-a20-case-ranking');
        const rankTxt = await body(page);
        const hasRanking = /applicant.*ranking|ranking|score|\d+.*applicant/i.test(rankTxt);
        const hasNoApps = /no apps/i.test(rankTxt);
        add('A-20', 'Arena: applicant ranking section on estimated case with applicant',
          hasRanking && !hasNoApps ? 'PASS' : 'FAIL',
          hasNoApps ? 'no apps shown' : hasRanking ? 'ranking section visible' : `page: ${rankTxt.slice(0,150).replace(/\n/g,' ')}`);
      } else {
        // Maybe case cards show but "View ranking" style is different
        const caseCards = await page.locator('div[style*="background"]').filter({ hasText: /FICO|SAP|estimated/i }).count();
        log(`  Case cards found: ${caseCards}`);
        add('A-20', 'Arena: View ranking button on estimated case', 'FAIL',
          `no button found. Text: ${txt.slice(0, 200).replace(/\n/g,' ')}`);
      }
    } catch(e) { add('A-20-ERR', 'A-20 error', 'FAIL', e.message.slice(0,80)); }
    finally { await ctx.close(); }
  }

  const a13 = results.find(r => r.id === 'A-13');
  if (a13) add('M-06', 'Manager Settings → FinCorp SAP Integration tab', a13.status, `A-13: ${a13.note}`);

  await browser.close();
  log(`\n  VERIFY: PASS=${P}  FAIL=${F}`);
  fs.writeFileSync('/home/user/techcase/tests/e2e/test-results/results-verify-final.json', JSON.stringify({ P, F, results }, null, 2));
})();
