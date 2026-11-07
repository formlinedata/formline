// Link-preview pictures (1200×630) for the static team and match pages, so a link pasted into Reddit, Discord, X,
// WhatsApp or iMessage shows that team or match instead of the general site card. build/pages.mjs writes what each
// picture should show to PREVIEW_SPECS; this draws only the pictures whose content changed (previews/index.json keeps
// a hash per file), deletes pictures no page uses any more, and then rebuilds the pages so they point at the new
// pictures. Needs Playwright (the nightly full run installs it); without it nothing changes. sharp, when installed,
// shrinks each picture to a 256-colour PNG.
//   node build/pages.mjs && node build/previews.mjs
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildPages, PREVIEW_SPECS} from './pages.mjs';
import {siteBase} from './site-url.mjs';

const ROOT = process.env.FORMLINE_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'previews'), INDEX = path.join(DIR, 'index.json');
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'}[c]));
const ord = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th','st','nd','rd'][n % 10] || 'th');
const GAME = {men:"Men's", women:"Women's"};
const day = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', {weekday:'short', day:'numeric', month:'short', year:'numeric', timeZone:'UTC'});
const dayLong = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', {weekday:'long', day:'numeric', month:'long', year:'numeric', timeZone:'UTC'});

/* The site's dark-theme tier colours, read from index.html so the pictures always match the table. */
export function tierColours(html){
  const m = /:root\{(--tier-1:[^}]*)\}/.exec(html), out = {};
  if (m) for (const [, n, c] of m[1].matchAll(/--tier-(\d+):(#[0-9a-f]{3,8})/gi)) out[n] = c;
  return out;
}
const tierColour = (T, n) => { const k = Object.keys(T).length; if (!n || !k) return '#3e6650'; return T[n <= k ? n : 4 + (n - 4) % (k - 3)] || '#3e6650'; };

const flagCache = new Map();
function flagUri(f){
  if (!f) return null;
  if (!flagCache.has(f.file)){
    const p = path.join(ROOT, 'flags', 'h240', f.file + '.webp');
    flagCache.set(f.file, fs.existsSync(p) ? 'data:image/webp;base64,' + fs.readFileSync(p).toString('base64') : null);
  }
  return flagCache.get(f.file);
}
const flagImg = (f, h) => { const u = flagUri(f); return u ? `<img class="fl" src="${u}" style="height:${h}px;width:${Math.round(h * (f.ar || 1.5))}px" alt="">` :
  `<span class="fl none" style="height:${h}px;width:${Math.round(h * 1.5)}px"></span>`; };
const MARK = `<svg width="40" height="40" viewBox="0 0 32 32"><path d="M3 26.5 10.5 21 17 24.5 29 12.5V3.5L17 15 10.5 12 3 18Z" fill="rgba(246,182,56,.25)"/><path d="M3 22.5 10.5 16.5 17 19.8 29 8" fill="none" stroke="#f1f4ec" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="29" cy="8" r="3" fill="#f6b638"/></svg>`;

const CSS = `*{box-sizing:border-box;margin:0;}
html,body{width:1200px;height:630px;}
body{background:#0e2117;color:#f1f4ec;font-family:'Archivo',sans-serif;font-variant-numeric:tabular-nums;overflow:hidden;position:relative;}
#c{position:absolute;inset:0;padding:52px 64px 0;display:flex;flex-direction:column;}
.top{display:flex;align-items:center;justify-content:space-between;font-size:22px;color:#a7bba9;font-weight:600;letter-spacing:.02em;}
.brand{display:flex;align-items:center;gap:12px;color:#f1f4ec;font-size:30px;font-weight:800;font-stretch:115%;letter-spacing:-.01em;}
.foot{position:absolute;left:64px;right:64px;bottom:34px;display:flex;justify-content:space-between;font-size:21px;color:#89a291;}
.foot b{color:#d9e2da;font-weight:600;}
.fl{display:block;border-radius:6px;box-shadow:0 0 0 1px rgba(255,255,255,.14);object-fit:cover;flex:none;}
.fl.none{background:#2a4a37;}
.fit{white-space:nowrap;overflow:hidden;}
.line{position:absolute;left:0;right:0;bottom:0;height:120px;opacity:.45;}
/* team */
.hero{display:flex;align-items:center;gap:40px;margin-top:44px;}
.hero h1{font-size:96px;font-weight:800;font-stretch:112%;letter-spacing:-.02em;line-height:1;}
.hero .sub{font-size:26px;color:#a7bba9;margin-top:12px;}
.stats{display:grid;grid-template-columns:1.15fr 1fr 1fr 1.35fr;margin-top:46px;border-top:1px solid #2a4a37;}
.stat{padding:22px 0 0;}
.stat+.stat{padding-left:28px;border-left:1px solid #2a4a37;}
.k{font-size:20px;color:#a7bba9;font-weight:600;}
.v{font-size:58px;font-weight:800;font-stretch:108%;margin-top:6px;line-height:1.05;}
.v small{font-size:22px;font-weight:600;color:#a7bba9;margin-left:8px;font-stretch:100%;}
.amber{color:#f6b638;}
.tier{display:flex;align-items:center;gap:14px;}
.tier i{display:block;width:12px;height:52px;border-radius:4px;}
.form{display:flex;gap:8px;margin-top:14px;}
.form span{width:42px;height:42px;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800;}
.W{background:#2f7d4f;color:#eafff0;} .D{background:#4b5a50;color:#eef3ee;} .L{background:#8a3a34;color:#ffeceb;}
.next{margin-top:26px;font-size:25px;color:#d9e2da;} .next b{color:#f1f4ec;}
.unr{font-size:30px;font-weight:700;margin-top:14px;color:#d9e2da;}
/* match */
.teams{display:grid;grid-template-columns:1fr 250px 1fr;align-items:start;margin-top:40px;height:262px;}
.side{display:flex;flex-direction:column;align-items:center;text-align:center;gap:16px;min-width:0;}
.side h2{font-size:52px;font-weight:800;font-stretch:108%;letter-spacing:-.01em;line-height:1.05;max-width:420px;}
.side .meta{font-size:21px;color:#a7bba9;display:flex;align-items:center;gap:10px;}
.side .meta i{display:inline-block;width:8px;height:22px;border-radius:3px;}
.mid{text-align:center;font-size:44px;color:#89a291;font-weight:700;line-height:120px;white-space:nowrap;}
.mid.score{font-size:92px;color:#f1f4ec;font-weight:800;font-stretch:110%;letter-spacing:-.02em;}
.probs{margin-top:34px;}
.probs .lbl{font-size:20px;color:#a7bba9;font-weight:600;margin-bottom:10px;}
.bar{display:flex;height:18px;border-radius:9px;overflow:hidden;gap:3px;}
.bar i{display:block;height:100%;}
.pv{display:grid;grid-template-columns:1fr auto 1fr;gap:24px;margin-top:12px;color:#d9e2da;}
.pv span{font-size:26px;}
.pv b{color:#f1f4ec;font-weight:800;margin-right:8px;}
.sim h1{font-size:64px;font-weight:800;font-stretch:110%;letter-spacing:-.015em;line-height:1.05;margin-top:34px;}
.sim .sub{font-size:24px;color:#a7bba9;margin-top:10px;}
.rows{display:grid;grid-template-columns:1fr 1fr;gap:0 48px;margin-top:34px;}
.srow{display:grid;grid-template-columns:26px 1fr 90px;align-items:center;gap:12px;padding:14px 0 20px;border-top:1px solid #2a4a37;position:relative;}
.srow .n{font-size:19px;color:#89a291;} .srow .t{font-size:26px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.srow .b{position:absolute;left:38px;right:0;bottom:8px;height:6px;border-radius:3px;background:#1d3a28;overflow:hidden;}
.srow .fs{width:60px;display:flex;justify-content:center;flex:none;}
.srow .b i{position:absolute;left:0;top:0;bottom:0;background:#f6b638;border-radius:5px;}
.srow .p{font-size:27px;font-weight:800;text-align:right;color:#f6b638;}
.srow .tn{display:flex;align-items:center;gap:12px;min-width:0;}
.pv span:nth-child(2){text-align:center;} .pv span:last-child{text-align:right;}
.pv b{font-size:1.3em !important;}`;

const footer = right => `<svg class="line" viewBox="0 0 1200 120" preserveAspectRatio="none"><path d="M0 96 C120 88 180 102 260 90 S420 74 520 80 S700 59 800 66 S1000 32 1200 18 L1200 48 C1060 59 980 83 800 90 S640 99 520 104 S360 112 260 114 S90 117 0 120Z" fill="rgba(246,182,56,.10)"/></svg>
<div class="foot"><span><b>formlinedata.com</b></span><span>${right}</span></div>`;

function teamHtml(d, T){
  const c = tierColour(T, d.tier);
  const stats = d.rank ? `<div class="stats">
<div class="stat"><div class="k">World rank</div><div class="v amber">${ord(d.rank)}<small>of ${d.of}</small></div></div>
<div class="stat"><div class="k">Tier</div><div class="v tier"><i style="background:${c}"></i>${d.tier}</div></div>
<div class="stat"><div class="k">Rating</div><div class="v">${d.rating}</div></div>
<div class="stat"><div class="k">Last ${d.last.length || 'five'}</div>${d.last.length ? `<div class="form">${d.last.map(x => `<span class="${x}">${x}</span>`).join('')}</div>` : '<div class="v" style="font-size:28px;color:#a7bba9">No recent results</div>'}</div>
</div>` : `<div class="stats"><div class="stat" style="grid-column:1 / 4"><div class="k">World rank</div><div class="unr">Not ranked yet: too few recent matches</div></div>
<div class="stat"><div class="k">Last ${d.last.length || 'five'}</div>${d.last.length ? `<div class="form">${d.last.map(x => `<span class="${x}">${x}</span>`).join('')}</div>` : ''}</div></div>`;
  return `<div id="c"><div class="top"><span class="brand">${MARK}Formline</span><span>${GAME[d.g]} national teams</span></div>
<div class="hero">${flagImg(d.flag, 150)}<div style="min-width:0;flex:1"><h1 class="fit" data-max="96">${esc(d.team)}</h1><div class="sub">${GAME[d.g]} national team${d.conf ? ' · ' + esc(d.conf) : ''}</div></div></div>
${stats}
${d.next ? `<div class="next fit" data-max="25">Next: <b>v ${esc(d.next.opp)}</b> · ${day(d.next.day)} · ${esc(d.next.comp)}</div>` : ''}
</div>${footer('Every team. All of them.')}`;
}

function matchHtml(d, T){
  const side = s => `<div class="side">${flagImg(s.flag, 120)}<h2 class="fit" data-max="52">${esc(s.name)}</h2>
<div class="meta">${s.rank ? `<i style="background:${tierColour(T, s.tier)}"></i>${ord(s.rank)} in the world · tier ${s.tier}` : 'Not ranked yet'}</div></div>`;
  const [ph, pd, pa] = d.p, cols = ['#f6b638', '#5c7163', '#7cc0ff'];
  const likely = d.likely ? d.likely.replace('-', '–') : '';
  return `<div id="c"><div class="top"><span class="brand">${MARK}Formline</span><span class="fit" data-max="22" style="max-width:720px;text-align:right">${esc(d.comp)} · ${dayLong(d.day)}</span></div>
<div class="teams">${side(d.home)}<div class="mid${d.result ? ' score' : ''}">${d.result ? `${d.result[0]}–${d.result[1]}` : 'v'}</div>${side(d.away)}</div>
<div class="probs"><div class="lbl">${d.result ? "Formline's prediction before kick-off" : "Formline's prediction"}${likely ? ` · most likely score ${likely}` : ''}</div>
<div class="bar">${[ph, pd, pa].map((v, i) => `<i style="width:${Math.max(v, 1)}%;background:${cols[i]}"></i>`).join('')}</div>
<div class="pv"><span class="fit" data-max="26"><b>${ph}%</b>${esc(d.home.name)} win</span><span><b>${pd}%</b>Draw</span><span class="fit" data-max="26"><b>${pa}%</b>${esc(d.away.name)} win</span></div></div>
</div>${footer(d.venue ? esc(d.venue) : 'Every team. All of them.')}`;
}

/* The site's own copy of Archivo (vendor/, saved by build/vendor.mjs), inlined so drawing needs no network; Google
   Fonts when there is no local copy yet. */
function fontCss(root){
  const f = path.join(root, 'vendor', 'fonts.css');
  if (!fs.existsSync(f)) return '<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&display=block" rel="stylesheet">';
  const css = fs.readFileSync(f, 'utf8').replace(/font-display:\s*swap/g, 'font-display: block').replace(/url\((fonts\/[^)]+)\)/g, (m, u) => {
    const p = path.join(root, 'vendor', u); return fs.existsSync(p) ? `url(data:font/woff2;base64,${fs.readFileSync(p).toString('base64')})` : m; });
  return `<style>${css}</style>`;
}
const SIM_LABEL = {Winner:'Chances of winning it', Champion:'Chances of winning it', Promoted:'Chances of going up', Qualified:'Chances of qualifying', 'Group winner':'Chances of winning the group'};
function simHtml(d){
  const st = {upcoming:'Not started yet', 'in progress':'In progress', rewind:'The chances going in'}[d.status] || '';
  const top = Math.max(...d.rows.map(r => r.p), 1);
  const pc = p => p >= 99.95 ? '100%' : p >= 99.5 ? '>99%' : p < 0.5 ? '<1%' : Math.round(p) + '%';
  const half = Math.ceil(d.rows.length / 2), col = rs => `<div>${rs.map((r, i) => `<div class="srow"><span class="n">${r.i + 1}</span>
<span class="tn"><span class="fs">${flagImg(r.flag, 30)}</span><span class="t">${esc(r.team)}</span></span><span class="p">${pc(r.p)}</span><span class="b"><i style="width:${(100 * r.p / top).toFixed(1)}%"></i></span></div>`).join('')}</div>`;
  const rows = d.rows.map((r, i) => ({...r, i}));
  return `<div id="c" class="sim"><div class="top"><span class="brand">${MARK}Formline</span><span>Tournament simulator · ${GAME[d.g]}</span></div>
<h1 class="fit" data-max="64">${esc(d.name)}</h1>
<div class="sub">${SIM_LABEL[d.col] || 'Chances'} · ${d.runs.toLocaleString('en')} simulations${st ? ' · ' + st : ''}</div>
<div class="rows">${col(rows.slice(0, half))}${col(rows.slice(half))}</div>
</div>${footer(d.hosts && d.hosts.length ? esc(d.hosts.join(', ').replace(/, ([^,]*)$/, ' and $1')) + ' qualify as hosts' : 'Play it yourself on the Simulator')}`;
}

/* Shrinks any .fit element's font until it fits its box (long names such as Saint Vincent and the Grenadines). */
const FIT = () => { for (const el of document.querySelectorAll('.fit')){ let s = +el.dataset.max || 40;
  el.style.whiteSpace = el.tagName === 'H2' ? 'normal' : 'nowrap';
  const too = () => el.tagName === 'H2' ? (el.scrollHeight > s * 2.3 || el.scrollWidth > el.clientWidth + 1) : el.scrollWidth > el.clientWidth + 1;
  while (s > 14 && too()){ s -= 2; el.style.fontSize = s + 'px'; } } };

export async function drawPreviews({root = ROOT, chromium, sharp, specs, log = console.log} = {}){
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8'), T = tierColours(html);
  let drawn = {}; try { drawn = JSON.parse(fs.readFileSync(path.join(root, 'previews', 'index.json'), 'utf8')); } catch(e){}
  const want = new Map(specs.map(s => [s.file, s]));
  const todo = specs.filter(s => drawn[s.file] !== s.hash || !fs.existsSync(path.join(root, s.file)));
  let made = 0, failed = 0;
  if (todo.length){
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {});
    const page = await browser.newPage({viewport:{width:1200, height:630}});
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8">${fontCss(root)}
<style>${CSS}</style></head><body></body></html>`, {waitUntil:'networkidle'}).catch(() => {});
    await page.evaluate(() => document.fonts && document.fonts.ready);
    for (const s of todo){
      try {
        const body = s.data.kind === 'team' ? teamHtml(s.data, T) : s.data.kind === 'sim' ? simHtml(s.data) : matchHtml(s.data, T);
        await page.evaluate(b => { document.body.innerHTML = b; }, body);
        await page.evaluate(() => Promise.all([...document.images].map(i => i.decode().catch(() => {}))));
        await page.evaluate(FIT);
        const out = path.join(root, s.file);
        fs.mkdirSync(path.dirname(out), {recursive:true});
        let png = await page.screenshot({type:'png'});
        /* A 256-colour palette makes each picture about a quarter of the size, with no visible difference. */
        if (sharp) png = await sharp(png).png({palette:true, quality:90, effort:8, compressionLevel:9}).toBuffer();
        fs.writeFileSync(out, png);
        drawn[s.file] = s.hash; made++;
      } catch(e){ failed++; log('Could not draw ' + s.file + ': ' + e.message); }
    }
    await browser.close();
  }
  /* Drop pictures no page uses any more (match pages leave after MATCH_KEEP_DAYS). */
  let removed = 0;
  for (const f of Object.keys(drawn)) if (!want.has(f)){ fs.rmSync(path.join(root, f), {force:true}); delete drawn[f]; removed++; }
  const walk = d => fs.existsSync(d) ? fs.readdirSync(d, {withFileTypes:true}).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]) : [];
  for (const f of walk(path.join(root, 'previews'))){ const rel = path.relative(root, f).split(path.sep).join('/');
    if (rel.endsWith('.png') && !want.has(rel)){ fs.rmSync(f); removed++; } }
  fs.mkdirSync(path.join(root, 'previews'), {recursive:true});
  const sorted = Object.fromEntries(Object.keys(drawn).sort().map(k => [k, drawn[k]]));
  fs.writeFileSync(path.join(root, 'previews', 'index.json'), JSON.stringify(sorted, null, 0).replace(/,"/g, ',\n"') + '\n');
  return {wanted:specs.length, made, failed, removed};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)){
  let chromium;
  try { const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright'); chromium = pw.chromium || (pw.default && pw.default.chromium); if (!chromium) throw new Error('no chromium'); }
  catch { console.log('Playwright not installed: preview pictures left as they are.'); process.exit(0); }
  let sharp = null;
  try { sharp = (await import(process.env.SHARP_MODULE || 'sharp')).default; } catch { console.log('sharp not installed: pictures saved uncompressed.'); }
  if (!fs.existsSync(PREVIEW_SPECS)){ console.log('No preview list: run build/pages.mjs first.'); process.exit(0); }
  const specs = JSON.parse(fs.readFileSync(PREVIEW_SPECS, 'utf8'));
  const limit = +process.env.PREVIEW_LIMIT || 0;   // for trying the design on a few pictures
  const r = await drawPreviews({chromium, sharp, specs:limit ? specs.slice(0, limit) : specs});
  console.log(`Preview pictures: ${r.made} drawn, ${r.wanted - r.made - r.failed} unchanged, ${r.removed} removed${r.failed ? ', ' + r.failed + ' failed' : ''}.`);
  if (r.made || r.removed){ const n = buildPages(ROOT, siteBase(ROOT, process.env.GITHUB_REPOSITORY)); console.log(`Pages rebuilt to point at the pictures (${n.previews} in use).`); }
}
