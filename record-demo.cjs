/**
 * Demo video recorder — CJS style, all top-level awaits wrapped in IIFE.
 */
const { chromium } = require('playwright');
const fs = require('fs');

const APP      = 'http://localhost:5173/';
const SCRAP    = '/tmp/claude-0/-home-user-techcase/712bd800-39f2-5608-899c-3c0c8c60968a/scratchpad';
const VID_DIR  = SCRAP + '/video-clips';
const PASSWORD     = 'Test@Arena2026!';
const MANAGER_PASS = 'fuvtam-Kugzer-6deqjy';

fs.mkdirSync(VID_DIR, { recursive: true });

const delay = ms => new Promise(r => setTimeout(r, ms));
const log   = msg => process.stdout.write(msg + '\n');

const clipPaths = [];

async function recordSection(sectionName, recordFn) {
  log(`\n▶ Recording: ${sectionName}`);
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: VID_DIR + '/', size: { width: 1280, height: 720 } },
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(25000);

  try {
    await recordFn(page);
    await delay(1000); // hold last frame
  } catch(e) {
    log(`  ⚠ Error in section: ${e.message.slice(0,100)}`);
  } finally {
    await ctx.close();
    await browser.close();
  }

  // Rename to ordered name
  const files = fs.readdirSync(VID_DIR)
    .filter(f => f.endsWith('.webm'))
    .map(f => ({ f, mt: fs.statSync(`${VID_DIR}/${f}`).mtimeMs }))
    .sort((a, b) => b.mt - a.mt);

  if (files.length) {
    const src = `${VID_DIR}/${files[0].f}`;
    const dst = `${VID_DIR}/${String(clipPaths.length + 1).padStart(2,'0')}_${sectionName.replace(/[^a-z0-9]/gi,'_')}.webm`;
    fs.renameSync(src, dst);
    clipPaths.push(dst);
    log(`  ✓ Clip: ${dst}`);
  }
}

async function doLogin(page, email, password) {
  await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await delay(2000);
  const btn = page.locator('a, button').filter({ hasText: /^sign in$/i }).first();
  if (await btn.isVisible({ timeout: 4000 }).catch(() => false)) { await btn.click(); await delay(1000); }
  await page.locator('input[type="email"], input[placeholder*="email" i]').first().fill(email);
  await delay(400);
  await page.locator('input[type="password"]').first().fill(password);
  await delay(400);
  await page.locator('button').filter({ hasText: /^sign in$/i }).first().click();
  await delay(3500);
}

async function clickNav(page, label, waitMs = 2000) {
  const link = page.locator('aside a, nav a, aside button, nav button').filter({ hasText: new RegExp(`^${label}$`, 'i') }).first();
  if (await link.isVisible({ timeout: 5000 }).catch(() => false)) { await link.click(); await delay(waitMs); }
  else log(`  ⚠ Nav item not found: ${label}`);
}

(async () => {

  // SECTION 1: Admin
  await recordSection('01_Admin', async (page) => {
    await doLogin(page, 'test.admin@techcase.com', PASSWORD);
    await delay(1500);
    await clickNav(page, 'Cases');
    await clickNav(page, 'Settings');
    await clickNav(page, 'DB Connections', 2500);
  });

  // SECTION 2: Manager
  await recordSection('02_Manager', async (page) => {
    await doLogin(page, 'sfmanager@techcase.com', MANAGER_PASS);
    await delay(1500);
    await clickNav(page, 'Cases');
    await clickNav(page, 'Client Teams', 2000);
  });

  // SECTION 3: Consultant
  await recordSection('03_Consultant', async (page) => {
    await doLogin(page, 'test.consultant@test.arena.dev', PASSWORD);
    await delay(1500);
    await clickNav(page, 'My Cases');
    await clickNav(page, 'Projects', 1500);
  });

  // SECTION 4: Client
  await recordSection('04_Client', async (page) => {
    await doLogin(page, 'test.client@test.arena.dev', PASSWORD);
    await delay(1500);
    await clickNav(page, 'My Cases');
    await clickNav(page, 'Projects', 1500);
  });

  // SECTION 5: Invited Client (onboarding)
  await recordSection('05_Invited_Client', async (page) => {
    await doLogin(page, 'test.invited@test.arena.dev', PASSWORD);
    await delay(3000);
  });

  // SECTION 6: Key User
  await recordSection('06_Key_User', async (page) => {
    await doLogin(page, 'test.keyuser@test.arena.dev', PASSWORD);
    await delay(1500);
    await clickNav(page, 'My Cases');
    await clickNav(page, 'My Reviews', 1500);
  });

  // SECTION 7: Final User
  await recordSection('07_Final_User', async (page) => {
    await doLogin(page, 'test.finaluser@test.arena.dev', PASSWORD);
    await delay(3000);
  });

  // SECTION 8: Internal Consultant
  await recordSection('08_Internal_Consultant', async (page) => {
    await doLogin(page, 'test.internal@test.arena.dev', PASSWORD);
    await delay(1500);
    await clickNav(page, 'My Cases');
    await clickNav(page, 'My Reviews', 1500);
  });

  // SECTION 9: Project Manager
  await recordSection('09_Project_Manager', async (page) => {
    await doLogin(page, 'test.pm@test.arena.dev', PASSWORD);
    await delay(3000);
  });

  // SECTION 10: Headhunter
  await recordSection('10_Headhunter', async (page) => {
    await doLogin(page, 'test.hh@test.arena.dev', PASSWORD);
    await delay(1500);
    await clickNav(page, 'Resource Needs');
    await clickNav(page, 'My Talent');
    await clickNav(page, 'Pipeline', 1500);
  });

  // SECTION 11: Dispatch
  await recordSection('11_Dispatch', async (page) => {
    await doLogin(page, 'test.dispatch@techcase.com', PASSWORD);
    await delay(1500);
    await clickNav(page, 'Dispatch Queue', 2500);
  });

  // SECTION 12: Area Leader
  await recordSection('12_Area_Leader', async (page) => {
    await doLogin(page, 'test.leader@techcase.com', PASSWORD);
    await delay(1500);
    await clickNav(page, 'My Area Cases');
    await clickNav(page, 'Spec Review', 2000);
  });

  // SECTION 13: Case Creation
  await recordSection('13_Case_Creation', async (page) => {
    await doLogin(page, 'test.client@test.arena.dev', PASSWORD);
    await delay(1500);
    await clickNav(page, 'My Cases');
    await delay(1000);
    const createBtn = page.locator('button').filter({ hasText: /create case|new case|\+ case/i }).first();
    if (await createBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await createBtn.click(); await delay(2000);
      const titleInput = page.locator('input[placeholder*="title" i], input[placeholder*="subject" i], textarea').first();
      if (await titleInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await titleInput.fill('SAP S/4HANA Migration Issue — Demo Case');
        await delay(1500);
      }
      await delay(2000);
    } else {
      log('  ⚠ Create Case button not visible — showing list');
      await delay(2000);
    }
  });

  // Write concat list
  log('\n\n══════════════════════════════════════════');
  log('  ALL CLIPS RECORDED');
  log('══════════════════════════════════════════');
  clipPaths.forEach((p, i) => log(`  ${i+1}. ${p}`));

  const concatContent = clipPaths.map(p => `file '${p}'`).join('\n');
  fs.writeFileSync(`${VID_DIR}/concat.txt`, concatContent);
  log(`\n  Concat list written. Running ffmpeg...`);

  // Run ffmpeg to join all clips
  const { execSync } = require('child_process');
  const outputMp4 = `${SCRAP}/techcase-platform-demo.mp4`;
  try {
    execSync(`ffmpeg -y -f concat -safe 0 -i "${VID_DIR}/concat.txt" -c:v libx264 -preset fast -crf 23 -movflags +faststart "${outputMp4}" 2>&1`, { encoding: 'utf8' });
    const stat = fs.statSync(outputMp4);
    log(`\n  ✓ Video saved: ${outputMp4}`);
    log(`  ✓ File size: ${(stat.size / 1024 / 1024).toFixed(1)} MB`);
  } catch(e) {
    log(`  ✗ ffmpeg error: ${e.message.slice(0,200)}`);
    log(`  Individual clips are in: ${VID_DIR}`);
  }

})();
