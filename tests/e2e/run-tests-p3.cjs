/**
 * P3 final: HH-08 via Consultants view, re-verify C-08, re-verify CL-10
 */
const { chromium } = require('playwright');
const fs = require('fs');
const RES = './test-results';
const APP = 'http://localhost:5173/';
const PW  = 'Test@Arena2026!';

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
async function body(page) { return page.evaluate(() => document.body.innerText.slice(0, 5000)); }

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--no-sandbox'] });

  // HH-08: HH Consultants view → click card → check for propose/place buttons
  log('\n════ HH-08: Consultants view card click ════');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage(); page.setDefaultTimeout(20000);
    try {
      await login(page, 'test.hh@test.arena.dev', PW);
      const consBtn = page.locator('aside button').filter({ hasText: /consultants/i }).first();
      await consBtn.click(); await page.waitForTimeout(2500);
      await ss(page, 'final-hh-consultants');

      // Try different card selectors
      const selectors = [
        '[class*="consultant-card"]',
        'div[class*="grid"] [class*="card"]',
        'div[class*="card"][class*="consultant"]',
        '[data-consultant]',
        'div[class*="grid"] > div[class*="cursor"]',
        'div[class*="grid"] > div > div[class*="card"]',
        'article',
        // Look for any div that contains a name + score
        'div[class*="grid"] > div'
      ];

      let clicked = false;
      for (const sel of selectors) {
        const count = await page.locator(sel).count();
        if (count > 0) {
          log(`  Selector '${sel}': ${count} items`);
          const first = page.locator(sel).first();
          const isVis = await first.isVisible({ timeout: 1000 }).catch(() => false);
          const txt = await first.innerText().catch(() => '');
          if (isVis && txt.length > 5) {
            log(`  Clicking: "${txt.slice(0, 60)}"`);
            await first.click(); await page.waitForTimeout(2000);
            const afterTxt = await body(page);
            await ss(page, 'final-hh-card-panel');
            // Check if a panel/drawer opened
            const panelBtns = await page.evaluate(() =>
              Array.from(document.querySelectorAll('button')).map(b => (b.innerText || '').trim()).filter(t => t.length > 1 && t.length < 50)
            );
            log('  After click buttons: ' + panelBtns.join(' | '));
            const hasPanel = /propose|place|add.*candidate|shortlist|contact/i.test(afterTxt);
            if (hasPanel) {
              add('HH-08', 'HH Consultants: propose/place UI visible in panel', 'PASS', `sel=${sel}`);
              clicked = true;
              break;
            }
            const hasProfile = /profile|skills|experience|years/i.test(afterTxt);
            if (hasProfile) {
              add('HH-08', 'HH Consultants: profile panel opens (checking for HH buttons)', panelBtns.some(b => /propose|place|add|shortlist/i.test(b)) ? 'PASS' : 'FAIL',
                `buttons=[${panelBtns.slice(0,8).join(',')}]`);
              clicked = true;
              break;
            }
          }
        }
      }
      if (!clicked) {
        // Try clicking on "Consultants" → then click inside the list
        const allClickable = await page.locator('div, article, li').filter({ hasText: /specialist|architect|manager|SAP/i }).count();
        log(`  Clickable items with consultant keywords: ${allClickable}`);
        const firstConsultant = page.locator('div, article, li').filter({ hasText: /specialist|architect|manager|SAP/i }).first();
        if (await firstConsultant.isVisible({ timeout: 2000 }).catch(() => false)) {
          await firstConsultant.click(); await page.waitForTimeout(1500);
          const panelBtns = await page.evaluate(() =>
            Array.from(document.querySelectorAll('button')).map(b => (b.innerText || '').trim()).filter(t => t.length > 1 && t.length < 50)
          );
          log('  Buttons after keyword click: ' + panelBtns.join(' | '));
          const hasHHUI = /propose|place|add.*candidate|shortlist/i.test(panelBtns.join(' '));
          add('HH-08', 'HH Consultants: HH-specific buttons in panel', hasHHUI ? 'PASS' : 'FAIL',
            `buttons=[${panelBtns.slice(0,8).join(',')}]`);
        } else {
          add('HH-08', 'HH Consultants card clickable', 'FAIL', 'no consultant items found to click');
        }
      }
    } catch(e) { add('HH-08-ERR', 'HH-08 error', 'FAIL', e.message.slice(0,80)); }
    finally { await ctx.close(); }
  }

  // Re-verify C-08: does #arena truly redirect to Dashboard for consultant?
  log('\n════ C-08 re-verify: consultant arena ════');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage(); page.setDefaultTimeout(20000);
    try {
      await login(page, 'test.consultant@test.arena.dev', PW);
      await page.goto(APP + '#arena', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);
      const txt = await body(page);
      // Check if this is the Dashboard (not Arena)
      const isRedirectedToDash = /welcome back.*sam|open cases available|my applications/i.test(txt);
      const hasLeaderboard = /leaderboard.*tab|cards.*tab|compare.*tab/i.test(txt);
      log('C-08 page content: ' + txt.slice(0, 300).replace(/\n/g, ' '));
      add('C-08', 'Arena tab separate from Dashboard (consultant)',
        !isRedirectedToDash && hasLeaderboard ? 'PASS' : 'FAIL',
        isRedirectedToDash ? '#arena redirects to Dashboard for consultant' : 'leaderboard tabs absent');
    } catch(e) { add('C-08-ERR', 'C-08 error', 'FAIL', e.message.slice(0,80)); }
    finally { await ctx.close(); }
  }

  // Re-verify CL-10: does #arena truly redirect for client?
  log('\n════ CL-10 re-verify: client arena ════');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage(); page.setDefaultTimeout(20000);
    try {
      await login(page, 'test.client@test.arena.dev', PW);
      await page.goto(APP + '#arena', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);
      const txt = await body(page);
      const isProjectsPage = /projects.*\d+.*projects|no projects yet/i.test(txt);
      const hasRankings = /score|rank|\d+\s*%|applicant ranking/i.test(txt);
      log('CL-10 page text: ' + txt.slice(0, 300).replace(/\n/g, ' '));
      add('CL-10', 'Arena: applicant ranking scores visible for client',
        hasRankings && !isProjectsPage ? 'PASS' : 'FAIL',
        isProjectsPage ? '#arena redirects to Projects for client' : hasRankings ? 'scores visible' : 'no ranking data');
    } catch(e) { add('CL-10-ERR', 'CL-10 error', 'FAIL', e.message.slice(0,80)); }
    finally { await ctx.close(); }
  }

  await browser.close();
  log(`\n  FINAL: PASS=${P}  FAIL=${F}`);
  fs.writeFileSync(`${RES}/results-p3-final.json`, JSON.stringify({ P, F, results }, null, 2));
})();
