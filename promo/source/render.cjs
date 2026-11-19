// node render.cjs <outDir> [fps] [t1 t2 ...]  — with times: stills only; without: every frame
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const path = require('path'); const fs = require('fs');
const out = process.argv[2]; const fps = Number(process.argv[3] || 30); const times = process.argv.slice(4).map(Number);
fs.mkdirSync(out, { recursive: true });
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  p.on('pageerror', e => { console.error('PAGE ERROR', e.message); process.exit(1); });
  await p.goto('file://' + path.join(__dirname, 'promo.html'));
  await p.evaluate(() => document.fonts.ready);
  await p.evaluate(async () => { for (const f of ['700 20px Cinzel', '500 20px Cinzel', '800 20px PJS', '700 20px PJS', '600 20px PJS']) await document.fonts.load(f); });
  const dur = await p.evaluate(() => window.DURATION);
  const list = times.length ? times : Array.from({ length: Math.round(dur * fps) }, (_, i) => i / fps);
  const canvas = await p.$('canvas');
  for (let i = 0; i < list.length; i++) {
    await p.evaluate(t => window.draw(t), list[i]);
    const name = times.length ? `t${String(list[i]).replace('.', '_')}.png` : `f${String(i).padStart(5, '0')}.png`;
    await canvas.screenshot({ path: path.join(out, name), type: 'png' });
    if (!times.length && i % 150 === 0) console.log('frame', i, '/', list.length);
  }
  await b.close();
})();
