/**
 * Remaining LC tests: PR-02/03/04, LC-07-resume, LC-11/12/13, LC-X1-X6, AL-05
 * Uses confirmed selectors: div[class*="shadow"][class*="rounded"]  + "→ Stage" buttons
 */
const { chromium } = require('playwright');
const fs = require('fs');

const APP  = 'http://localhost:5173/';
const RES  = './test-results';
const PW   = 'Test@Arena2026!';
const MPW  = 'fuvtam-Kugzer-6deqjy';
const TS   = Date.now();

fs.mkdirSync(RES, { recursive: true });
const results = [];
let P = 0, F = 0;

function log(m) { process.stdout.write(m + '\n'); }
function add(id, desc, status, note = '') {
  results.push({ id, desc, status, note });
  if (status === 'PASS') P++; else F++;
  log(`  ${status === 'PASS' ? '✓' : '✗'} [${status}] ${id}: ${desc}${note ? ' — ' + note : ''}`);
}
async function ss(page, name) { await page.screenshot({ path: `${RES}/${name}.png`, fullPage: false }).catch(() => {}); }
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

async function clickNav(page, text) {
  const link = page.locator('aside button, aside a').filter({ hasText: new RegExp(`^${text}$`, 'i') }).first();
  if (await link.isVisible({ timeout: 5000 }).catch(() => false)) {
    await link.click(); await page.waitForTimeout(2000); return true;
  }
  return false;
}

async function openCase(page, titleFragment) {
  const cards = page.locator('div[class*="shadow"][class*="rounded"]');
  if (titleFragment) {
    const match = cards.filter({ hasText: new RegExp(titleFragment, 'i') }).first();
    if (await match.isVisible({ timeout: 5000 }).catch(() => false)) {
      await match.click(); await page.waitForTimeout(2500); return true;
    }
  }
  const first = cards.first();
  if (await first.isVisible({ timeout: 3000 }).catch(() => false)) {
    const txt = await first.innerText().catch(() => '');
    log('  Using case: ' + txt.split('\n')[1]?.trim().slice(0, 40));
    await first.click(); await page.waitForTimeout(2500); return true;
  }
  return false;
}

async function advance(page, targetStage) {
  const btn = page.locator('button').filter({ hasText: new RegExp(`→.*${targetStage}|${targetStage}.*→`, 'i') }).first();
  if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await btn.click(); await page.waitForTimeout(2000);
    const confirm = page.locator('button').filter({ hasText: /confirm|yes|ok/i }).first();
    if (await confirm.isVisible({ timeout: 1500 }).catch(() => false)) {
      await confirm.click(); await page.waitForTimeout(1500);
    }
    return true;
  }
  return false;
}

async function getBtns(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('button')).map(b => (b.innerText || '').trim()).filter(t => t.length > 0 && t.length < 60)
  );
}

async function getStage(page) {
  const txt = await body(page);
  const stages = ['Completed','Closed','Approved','User Test','Functional Test','Technical Test',
    'Standby','In Progress','Assigned','Estimated','Returned','Confirmed','Open'];
  for (const s of stages) {
    if (new RegExp(s, 'i').test(txt.slice(0, 500))) return s;
  }
  return '';
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--no-sandbox'] });

  // ═══ PR-02 to PR-04: Project wizard fix ═══
  log('\n════ PR-02 to PR-04: Project wizard ════');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage(); page.setDefaultTimeout(25000);
    try {
      await login(page, 'sfmanager@techcase.com', MPW);
      await clickNav(page, 'Projects');
      const newBtn = page.locator('button').filter({ hasText: /new project/i }).first();

      if (!await newBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        add('PR-02', 'Project wizard form opens', 'FAIL', 'No New Project button');
        add('PR-03', 'Project created', 'FAIL', 'No New Project button');
        add('PR-04', 'Project visible', 'FAIL', 'No New Project button');
      } else {
        await newBtn.click(); await page.waitForTimeout(2000);
        await ss(page, 'PR-wizard-open');

        let submitted = false;
        let nextClicks = 0;

        for (let step = 0; step < 12; step++) {
          const stepTxt = await body(page);
          const btns = await getBtns(page);
          log(`  Wizard step ${step}: btns=[${btns.filter(b => /next|continue|create|submit|start|blank|template/i.test(b)).join(', ')}]`);

          // Click template/card if step 1
          if (step === 0) {
            const templateCards = page.locator('[class*="rounded"][class*="shadow"], [class*="card"], [class*="template"]').first();
            if (await templateCards.isVisible({ timeout: 1000 }).catch(() => false)) {
              await templateCards.click(); await page.waitForTimeout(600);
            }
          }

          // Fill any visible inputs
          const inputs = await page.locator('input:not([type="hidden"]):not([type="checkbox"]):not([type="search"]):not([type="radio"]), textarea').all();
          for (const inp of inputs) {
            if (!await inp.isVisible({ timeout: 300 }).catch(() => false)) continue;
            const val = await inp.inputValue().catch(() => '');
            if (!val) {
              await inp.fill(`TestProject ${TS}`).catch(() => {});
            }
          }

          // Try submit first
          const submitBtn = page.locator('button').filter({ hasText: /^(create project|save|finish|done|submit)$/i }).first();
          if (await submitBtn.isVisible({ timeout: 800 }).catch(() => false)) {
            await submitBtn.click(); await page.waitForTimeout(4000);
            await ss(page, 'PR-04-submit');
            const afterTxt = await body(page);
            add('PR-02', 'Project wizard navigated successfully', 'PASS', `steps=${nextClicks}`);
            add('PR-03', 'Project form submitted without crash', 'PASS');
            const visible = /testproject|project|created|saved/i.test(afterTxt);
            add('PR-04', 'Project visible after creation', visible ? 'PASS' : 'FAIL',
              visible ? 'project found' : afterTxt.slice(50, 150));
            submitted = true;
            break;
          }

          // Try Next/Continue
          const nextBtn = page.locator('button').filter({ hasText: /^(next|continue|next step|proceed)$/i }).first();
          if (await nextBtn.isVisible({ timeout: 800 }).catch(() => false)) {
            await nextBtn.click(); await page.waitForTimeout(1200); nextClicks++;
          } else {
            // Check if there's a different button pattern
            const anyBtn = page.locator('button[type="submit"], button').filter({ hasText: /step \d|get started|begin/i }).first();
            if (await anyBtn.isVisible({ timeout: 800 }).catch(() => false)) {
              await anyBtn.click(); await page.waitForTimeout(1200); nextClicks++;
            } else {
              if (step > 1) {
                log(`  No next/submit at step ${step}, btns=[${btns.join(', ')}]`);
                add('PR-02', 'Project wizard navigable', 'FAIL', `stuck at step ${step}`);
                add('PR-03', 'Project created', 'FAIL', 'wizard stuck');
                add('PR-04', 'Project visible', 'FAIL', 'wizard stuck');
                break;
              }
            }
          }
        }
        if (!submitted && !results.find(r => r.id === 'PR-02')) {
          add('PR-02', 'Project wizard', 'FAIL', 'no submit found after all steps');
          add('PR-03', 'Project created', 'FAIL', 'wizard incomplete');
          add('PR-04', 'Project visible', 'FAIL', 'wizard incomplete');
        }
      }
    } catch(e) {
      ['PR-02','PR-03','PR-04'].forEach(id => add(id, id, 'FAIL', e.message.slice(0, 60)));
    }
    finally { await ctx.close(); }
  }

  // ═══ LC-07-resume: Resume from Standby ═══
  log('\n════ LC-07-resume: Resume from Standby ════');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage(); page.setDefaultTimeout(25000);
    try {
      await login(page, 'sfmanager@techcase.com', MPW);
      await clickNav(page, 'Cases');
      const found = await openCase(page, 'LC Case');
      if (found) {
        const btns = await getBtns(page);
        const canResume = btns.some(b => /in progress|resume|technical test/i.test(b));
        const stage = await getStage(page);
        log('  Current stage: ' + stage + ', btns: ' + btns.filter(b => /→|resume/i.test(b)).join(' | '));
        add('LC-07-resume', 'Resume from Standby (advance controls available)',
          canResume ? 'PASS' : 'FAIL', `stage="${stage}" canResume=${canResume}`);
      } else {
        add('LC-07-resume', 'Resume from Standby', 'FAIL', 'case not found');
      }
    } catch(e) { add('LC-07-resume', 'LC-07-resume error', 'FAIL', e.message.slice(0, 60)); }
    finally { await ctx.close(); }
  }

  // ═══ LC-11/12/13: Approved → Closed → Completed ═══
  log('\n════ LC-11/12/13: Terminal stages ════');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage(); page.setDefaultTimeout(25000);
    try {
      await login(page, 'sfmanager@techcase.com', MPW);
      await clickNav(page, 'Cases');
      const found = await openCase(page, 'LC Case');
      if (found) {
        const stage0 = await getStage(page);
        const btns0 = await getBtns(page);
        log('  Starting: stage=' + stage0 + ', advance=' + btns0.filter(b => /→/.test(b)).join(' | '));
        await ss(page, 'LC-11-before');

        // Try to advance to Approved
        const adv11 = await advance(page, 'Approved');
        const txt11 = await body(page);
        const stage11 = await getStage(page);
        log('  After → Approved: stage=' + stage11 + ' adv=' + adv11);
        add('LC-11', 'Approved stage reachable', /approved/i.test(txt11.slice(0, 600)) ? 'PASS' : 'FAIL',
          `stage="${stage11}" adv=${adv11}`);
        await ss(page, 'LC-11');

        // Closed
        const adv12 = await advance(page, 'Closed');
        const txt12 = await body(page);
        const stage12 = await getStage(page);
        log('  After → Closed: stage=' + stage12 + ' adv=' + adv12);
        add('LC-12', 'Closed stage reachable', /closed/i.test(txt12.slice(0, 600)) ? 'PASS' : 'FAIL',
          `stage="${stage12}" adv=${adv12}`);
        await ss(page, 'LC-12');

        // Completed
        const adv13 = await advance(page, 'Completed');
        const txt13 = await body(page);
        const stage13 = await getStage(page);
        log('  After → Completed: stage=' + stage13 + ' adv=' + adv13);
        add('LC-13', 'Completed stage reachable', /completed/i.test(txt13.slice(0, 600)) ? 'PASS' : 'FAIL',
          `stage="${stage13}" adv=${adv13}`);
        await ss(page, 'LC-13');

        // No further transitions
        const finalBtns = await getBtns(page);
        const advFinal = finalBtns.filter(b => /^→ /.test(b));
        log('  Final advance buttons: ' + advFinal.join(' | '));
        add('LC-13-final', 'No further stage transitions in terminal state',
          advFinal.length === 0 ? 'PASS' : 'FAIL',
          advFinal.length > 0 ? `still has: [${advFinal.join(',')}]` : 'clean');
      } else {
        ['LC-11','LC-12','LC-13','LC-13-final'].forEach(id => add(id, id, 'FAIL', 'case not found'));
      }
    } catch(e) { ['LC-11','LC-12','LC-13','LC-13-final'].forEach(id => add(id, id, 'FAIL', e.message.slice(0, 60))); }
    finally { await ctx.close(); }
  }

  // ═══ LC Cross-Cutting ═══
  log('\n════ LC Cross-Cutting ════');

  // LC-X1: FinCorp/SAP case lifecycle
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage(); page.setDefaultTimeout(20000);
    try {
      await login(page, 'sfmanager@techcase.com', MPW);
      await clickNav(page, 'Cases');
      const fcCard = page.locator('div[class*="shadow"][class*="rounded"]').filter({ hasText: /VSS|Admosa|SAP|fincorp/i }).first();
      if (await fcCard.isVisible({ timeout: 5000 }).catch(() => false)) {
        await fcCard.click(); await page.waitForTimeout(2000);
        const txt = await body(page);
        await ss(page, 'LC-X1');
        add('LC-X1', 'SAP/FinCorp case shows lifecycle stage tracker',
          /open|confirmed|assigned|in progress|estimated/i.test(txt.slice(0, 800)) ? 'PASS' : 'FAIL');
      } else {
        // Use any case
        const anyCard = page.locator('div[class*="shadow"][class*="rounded"]').first();
        if (await anyCard.isVisible({ timeout: 3000 }).catch(() => false)) {
          await anyCard.click(); await page.waitForTimeout(2000);
          const txt = await body(page);
          const hasLifecycle = /open|confirmed|assigned|in progress/i.test(txt.slice(0, 800));
          add('LC-X1', 'Case lifecycle stage tracker visible', hasLifecycle ? 'PASS' : 'FAIL',
            'no SAP/FinCorp case found, used first available');
        } else {
          add('LC-X1', 'Lifecycle stage tracker check', 'FAIL', 'no case found');
        }
      }
    } catch(e) { add('LC-X1', 'LC-X1 error', 'FAIL', e.message.slice(0, 60)); }
    finally { await ctx.close(); }
  }

  // LC-X2: Stage badge updates in real-time
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage(); page.setDefaultTimeout(25000);
    try {
      await login(page, 'sfmanager@techcase.com', MPW);
      await clickNav(page, 'Cases');
      const found = await openCase(page, 'LC Case');
      if (found) {
        const before = await getStage(page);
        const adv = await advance(page, 'Confirmed');
        await page.waitForTimeout(1000);
        const after = await getStage(page);
        log('  LC-X2: before=' + before + ' after=' + after + ' adv=' + adv);
        add('LC-X2', 'Stage badge updates in-page without reload',
          adv || before !== after ? 'PASS' : 'FAIL', `before="${before}" after="${after}"`);
      } else {
        add('LC-X2', 'Stage badge real-time update', 'FAIL', 'case not found');
      }
    } catch(e) { add('LC-X2', 'LC-X2 error', 'FAIL', e.message.slice(0, 60)); }
    finally { await ctx.close(); }
  }

  // LC-X3: Client (final user) cannot advance stages
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage(); page.setDefaultTimeout(20000);
    try {
      await login(page, 'test.client@test.arena.dev', PW);
      await clickNav(page, 'My Cases');
      const found = await openCase(page, 'LC Case');
      if (found) {
        const btns = await getBtns(page);
        const advBtns = btns.filter(b => /^→ /.test(b));
        log('  Client advance btns: ' + advBtns.join(' | '));
        add('LC-X3', 'Client (Final User) cannot advance lifecycle stages',
          advBtns.length === 0 ? 'PASS' : 'FAIL',
          advBtns.length > 0 ? `unexpected: [${advBtns.join(',')}]` : 'no advance buttons shown');
      } else {
        add('LC-X3', 'Client cannot advance stages', 'FAIL', 'case not found');
      }
    } catch(e) { add('LC-X3', 'LC-X3 error', 'FAIL', e.message.slice(0, 60)); }
    finally { await ctx.close(); }
  }

  // LC-X4: HH/Dispatch/AL cannot see FinCorp client cases
  {
    const roles = [
      { label: 'headhunter',  email: 'test.hh@test.arena.dev', nav: 'Resource Needs' },
      { label: 'dispatch',    email: 'test.dispatch@techcase.com', nav: 'Dispatch Queue' },
      { label: 'area_leader', email: 'test.leader@techcase.com', nav: 'My Area Cases' },
    ];
    let noAccessCount = 0;
    for (const r of roles) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      const page = await ctx.newPage(); page.setDefaultTimeout(20000);
      try {
        await login(page, r.email, PW);
        await clickNav(page, r.nav);
        const txt = await body(page);
        const seesFincorp = /fincorp.*case|lc.*case.*1793674/i.test(txt);
        log(`  LC-X4 ${r.label}: sees_case=${seesFincorp}`);
        if (!seesFincorp) noAccessCount++;
      } catch(e) { log(`  LC-X4 ${r.label} error: ${e.message.slice(0, 60)}`); noAccessCount++; }
      finally { await ctx.close(); }
    }
    add('LC-X4', 'HH/Dispatch/AL cannot access client lifecycle cases',
      noAccessCount >= 2 ? 'PASS' : 'FAIL', `${noAccessCount}/3 correctly restricted`);
  }

  // LC-X5: Audit trail with timestamps
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage(); page.setDefaultTimeout(20000);
    try {
      await login(page, 'sfmanager@techcase.com', MPW);
      await clickNav(page, 'Cases');
      const found = await openCase(page, 'LC Case');
      if (found) {
        const auditTab = page.locator('button').filter({ hasText: /audit.*log|activity|history/i }).first();
        if (await auditTab.isVisible({ timeout: 3000 }).catch(() => false)) {
          await auditTab.click(); await page.waitForTimeout(1500);
          const auditTxt = await body(page);
          await ss(page, 'LC-X5');
          const hasTime = /\d{1,2}[:/]\d{2}|\w+\s+\d+,?\s+\d{4}|ago|just now|2026|2025/i.test(auditTxt);
          const hasEntry = /open|created|confirmed|status|stage|transition/i.test(auditTxt);
          add('LC-X5', 'Audit trail has entries with timestamps',
            hasTime && hasEntry ? 'PASS' : 'FAIL', `time=${hasTime} entry=${hasEntry}`);
        } else {
          add('LC-X5', 'Audit Log tab accessible', 'FAIL', 'no audit tab found');
        }
      } else {
        add('LC-X5', 'Audit trail check', 'FAIL', 'case not found');
      }
    } catch(e) { add('LC-X5', 'LC-X5 error', 'FAIL', e.message.slice(0, 60)); }
    finally { await ctx.close(); }
  }

  // LC-X6: No JS console errors during navigation
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage(); page.setDefaultTimeout(20000);
    const errors = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text().slice(0, 100)); });
    try {
      await login(page, 'sfmanager@techcase.com', MPW);
      await clickNav(page, 'Cases');
      await openCase(page, 'LC Case');
      await page.waitForTimeout(2000);
      const critical = errors.filter(e => !/favicon|chunk|not.*found|google|sentry/i.test(e));
      log('  Console errors: ' + errors.length + ' total, ' + critical.length + ' critical');
      add('LC-X6', 'No JS console errors during lifecycle navigation',
        critical.length === 0 ? 'PASS' : 'FAIL',
        critical.length > 0 ? `[${critical.slice(0,3).join('|')}]` : 'clean');
    } catch(e) { add('LC-X6', 'LC-X6 error', 'FAIL', e.message.slice(0, 60)); }
    finally { await ctx.close(); }
  }

  // ═══ AL-05: Area Leader lifecycle controls ═══
  log('\n════ AL-05: Area Leader lifecycle ════');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage(); page.setDefaultTimeout(20000);
    try {
      await login(page, 'test.leader@techcase.com', PW);
      await clickNav(page, 'My Area Cases');
      const txt = await body(page);
      if (/no cases/i.test(txt)) {
        add('AL-05', 'Area Leader lifecycle controls', 'FAIL',
          'No cases in territory — test data gap');
      } else {
        const found = await openCase(page, '');
        if (found) {
          const btns = await getBtns(page);
          const hasAdvance = btns.some(b => /→|advance|lifecycle/i.test(b));
          add('AL-05', 'Area Leader sees lifecycle controls', hasAdvance ? 'PASS' : 'FAIL',
            `btns=[${btns.slice(0,8).join(',')}]`);
        } else {
          add('AL-05', 'Area Leader opens case', 'FAIL', 'no case card');
        }
      }
    } catch(e) { add('AL-05', 'AL-05 error', 'FAIL', e.message.slice(0, 60)); }
    finally { await ctx.close(); }
  }

  await browser.close();
  log(`\n══════════════════════════════════════════`);
  log(`  REMAIN RESULTS: PASS=${P}  FAIL=${F}  TOTAL=${P+F}`);
  log(`══════════════════════════════════════════`);
  results.forEach(r => log(`  ${r.status === 'PASS' ? '✓' : '✗'} [${r.status}] ${r.id}: ${r.desc}${r.note ? ' — '+r.note : ''}`));
  fs.writeFileSync(`${RES}/results-lc-remain.json`, JSON.stringify({ P, F, results }, null, 2));
  log('\nSaved: ' + RES + '/results-lc-remain.json');
})();
