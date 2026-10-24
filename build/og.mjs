// Share card (og.png, 1200×630) and home-screen icon (apple-touch-icon.png). The card shows the current top five for
// men and women, so a shared link always previews today's table. Needs Playwright; the nightly workflow installs it,
// and if it is missing the existing images are simply kept.
//   node build/og.mjs
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadModel} from './lib/model.mjs';

const ROOT = process.env.FORMLINE_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let chromium;
try { ({chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')); }
catch { console.log('Playwright not installed: share images left as they are.'); process.exit(0); }

const model = loadModel(path.join(ROOT, 'index.html'));
const top = {}, asOf = {};
for (const g of ['men', 'women']){
  const f = path.join(ROOT, 'data', g + '.json');
  if (!fs.existsSync(f)) continue;
  model.load(g, JSON.parse(fs.readFileSync(f, 'utf8')));
  const r = model.run(`(() => { state.gender = '${g}'; state.windowYears = DEFAULTS.windowYears; state.comps = new Set(COMP_ORDER);
    state.maxBand = DEFAULTS.maxBand; state.rankBy = DEFAULTS.rankBy; state.historicalNames = true; state.confs = new Set();
    state.fifaFilter = 'all'; state.asOf = state.bounds['${g}'].max; state.cache = {key:null};
    const c = getRatings(); return {asOf: fmtDay(state.asOf), rows: c.table.slice(0, 5).map(r => ({team:r.team, rating:Math.round(r.rating), band:Math.round(r.band)}))}; })()`);
  top[g] = r.rows; asOf[g] = r.asOf;
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'}[c]));
const MARK = (w, line) => `<svg width="${w}" height="${w}" viewBox="0 0 32 32"><path d="M3 26.5 10.5 21 17 24.5 29 12.5V3.5L17 15 10.5 12 3 18Z" fill="rgba(246,182,56,.25)"/><path d="M3 22.5 10.5 16.5 17 19.8 29 8" fill="none" stroke="${line}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="29" cy="8" r="3" fill="#f6b638"/></svg>`;
const list = (g, label) => !top[g] ? '' : `<div class="col"><h2>${label}</h2>${top[g].map((r, i) => {
  return `<div class="row"><span class="n">${i + 1}</span><span class="t">${esc(r.team)}</span><span class="v">${r.rating}</span></div>`;
}).join('')}</div>`;
const html = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&display=block" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;}
  body{width:1200px;height:630px;background:#0e2117;color:#f1f4ec;font-family:'Archivo',sans-serif;font-variant-numeric:tabular-nums;
    padding:64px 72px;display:grid;grid-template-columns:430px 1fr;gap:56px;position:relative;overflow:hidden;}
  .brand{display:flex;align-items:center;gap:16px;}
  .brand b{font-size:62px;font-weight:800;font-stretch:118%;letter-spacing:-.015em;}
  p{font-size:27px;line-height:1.35;color:#d9e2da;margin-top:30px;max-width:15em;}
  .date{position:absolute;left:72px;bottom:58px;font-size:20px;color:#a7bba9;}
  .cols{display:grid;grid-template-columns:1fr 1fr;gap:34px;align-self:center;}
  h2{font-size:22px;font-weight:700;color:#a7bba9;margin-bottom:14px;}
  .row{display:grid;grid-template-columns:22px 1fr auto;column-gap:10px;align-items:baseline;padding:13px 0;border-top:1px solid #2a4a37;}
  .n{color:#7e9584;font-size:19px;} .t{font-size:22px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .v{font-size:23px;font-weight:700;color:#f6b638;font-stretch:108%;}
  .b{grid-column:2 / 4;position:relative;height:8px;margin-top:7px;}
  .b i{position:absolute;top:0;bottom:0;background:rgba(246,182,56,.28);border-radius:4px;} .b em{position:absolute;top:-2px;width:3px;height:12px;background:#f6b638;border-radius:2px;}
  .line{position:absolute;left:0;right:0;bottom:0;height:150px;opacity:.5;}
</style></head><body>
<svg class="line" viewBox="0 0 1200 150" preserveAspectRatio="none"><path d="M0 120 C120 110 180 128 260 112 S420 92 520 100 S700 74 800 82 S1000 40 1200 22 L1200 60 C1060 74 980 104 800 112 S640 124 520 130 S360 140 260 142 S90 146 0 150Z" fill="rgba(246,182,56,.10)"/></svg>
<div><div class="brand">${MARK(64, '#f1f4ec')}<b>Formline</b></div>
<p>Every national team, men and women, rated on recent form and updated every night.</p></div>
<div class="cols">${list('men', 'Men')}${list('women', 'Women')}</div>
<div class="date">Ratings as of ${esc(asOf.men || asOf.women || '')}</div>
</body></html>`;
const icon = `<!doctype html><html><head><style>*{margin:0}body{width:180px;height:180px;background:#0e2117;display:flex;align-items:center;justify-content:center;}</style></head>
<body>${MARK(128, '#f1f4ec')}</body></html>`;

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {});
const page = await browser.newPage({viewport:{width:1200, height:630}});
await page.setContent(html, {waitUntil:'networkidle'}).catch(() => page.setContent(html));
await page.evaluate(() => document.fonts && document.fonts.ready);
await page.screenshot({path:path.join(ROOT, 'og.png')});
await page.setViewportSize({width:180, height:180});
await page.setContent(icon);
await page.screenshot({path:path.join(ROOT, 'apple-touch-icon.png')});
await browser.close();
console.log('og.png and apple-touch-icon.png written');
