// Static team pages, so search engines can find "Korea Republic football rating" and the like. The site itself is one
// page whose views are drawn in the browser, which search engines index poorly. Each night this writes:
//   teams/index.html                  every team, men and women, linked
//   teams/<men|women>/<slug>.html     one plain page per team: rating, band, rank, tier, last five results
//   matches/<g>/<date>-<a>-vs-<b>.html one page per upcoming fixture (the prediction) and per scored forecast (prediction
//                                     and result), for searches like "Italy vs France prediction"; matches/index.html lists them
//   h2h/<g>/<a>-vs-<b>.html           every meeting of two teams, all time, for every pair that has met and any pair with a
//                                     fixture coming up; h2h/index.html lists the most-played. Pairs with fewer than INDEX_MIN
//                                     meetings are kept out of the sitemap and marked noindex (too thin for search engines),
//                                     but every team page links to all its opponents.
//   sim/<tournament id>.html          one page per tournament on the Simulator: every team's chances from 10,000 runs.
//                                     The Simulator's Share button links here (?open=1&...), so a shared scenario gets a
//                                     proper link preview; with ?open=1 the page goes straight on to that scenario.
//   records/<g>/<record>.html         all-time records for search: biggest upsets, biggest wins, longest runs, every
//                                     country's best-ever team, and the FIFA method next to Formline; records/index.html
//   records/recaps/<month-year>.html  how Formline's live predictions did in each international window (from
//                                     data/forecasts.json), once a window has RECAP_MIN scored predictions
//   sitemap.xml and robots.txt        when the site's address is known
// Team and match pages point their link preview (og:image) at their own picture in previews/ once build/previews.mjs has
// drawn it, and at og.png until then. What each picture should show goes to PREVIEW_SPECS for previews.mjs to draw.
// The match and head-to-head pages carry no "updated on" date, so a page's file only changes when its content does.
// Each page links to the full interactive team page.   node build/pages.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {loadModel} from './lib/model.mjs';
import {siteBase} from './site-url.mjs';

const ROOT = process.env.FORMLINE_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const slugify = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'}[c]));
const ord = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th','st','nd','rd'][n % 10] || 'th');
const GAME = {men:"men's", women:"women's"};
const CSS = `
:root{--bg:#0e2117;--panel:#14291d;--line:#2a4a37;--chalk:#f1f4ec;--body:#d9e2da;--dim:#a7bba9;--amber:#f6b638;--win:#5fcf8a;--loss:#f08a7a}
@media (prefers-color-scheme: light){:root{--bg:#eef3ec;--panel:#fff;--line:#d3ddd2;--chalk:#112619;--body:#26392c;--dim:#4c6253;--amber:#935c00;--win:#1f7a45;--loss:#b3402f}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--body);font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:760px;margin:0 auto;padding:32px 18px 60px}a{color:var(--amber)}h1{color:var(--chalk);font-size:34px;line-height:1.15;margin:6px 0 4px}
.brand{font-weight:800;color:var(--chalk);text-decoration:none}.big{font-size:44px;font-weight:800;color:var(--amber)}.pm{color:var(--dim);font-size:18px}
.box{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:16px 18px;margin:18px 0}
table{width:100%;border-collapse:collapse}td{padding:7px 4px;border-top:1px solid var(--line);font-size:15px}td.n{text-align:right;white-space:nowrap}
.W{color:var(--win);font-weight:700}.L{color:var(--loss);font-weight:700}.D{color:var(--dim);font-weight:700}.muted{color:var(--dim)}
.btn{display:inline-block;background:var(--amber);color:var(--bg);font-weight:700;padding:10px 16px;border-radius:6px;text-decoration:none}
ul.cols{columns:3 180px;padding-left:18px}
.probs{display:flex;gap:10px;margin:10px 0 6px}.probs div{flex:1;text-align:center;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:10px 4px}
.probs b{display:block;font-size:30px;color:var(--chalk);line-height:1.1}.probs span{font-size:13px;color:var(--dim)}.probs .fav{border-color:var(--amber)}.probs .fav b{color:var(--amber)}
.bar{display:flex;height:10px;border-radius:5px;overflow:hidden;margin:8px 0}.bar .a{background:var(--win)}.bar .d{background:var(--dim)}.bar .b{background:var(--loss)}
.rec{display:flex;justify-content:space-between;text-align:center}.rec b{display:block;font-size:30px;color:var(--chalk)}.rec span{font-size:13px;color:var(--dim)}
h2{color:var(--chalk);font-size:22px;margin:28px 0 8px}td.yr{color:var(--amber);font-weight:700;border-top:0;padding-top:16px}
.src{font-size:13px;color:var(--dim);border-top:1px solid var(--line);margin-top:30px;padding-top:12px}
ul.opp{font-size:15px;line-height:1.7}
`;
const STYLE = '<link rel="stylesheet" href="../../pages.css">';
const STYLE_UP = '<link rel="stylesheet" href="../pages.css">';
const H2H_MIN = 1;                               // meetings needed for a head-to-head page without a fixture coming up
const INDEX_MIN = 3;                             // meetings needed for a head-to-head page to be offered to search engines
const MATCH_KEEP_DAYS = 120;                     // scored forecasts keep their page this long, then drop out of the sitemap
const pct = x => Math.round(x * 100);
/* Link-preview pictures. A picture is redrawn only when what it shows changes; bump PREVIEW_VERSION when the design
   changes, so every picture is redrawn once. */
export const PREVIEW_VERSION = 1;
export const PREVIEW_SPECS = process.env.PREVIEW_SPECS || path.join(os.tmpdir(), 'formline-preview-specs.json');
export const previewHash = data => crypto.createHash('sha1').update(JSON.stringify([PREVIEW_VERSION, data])).digest('hex').slice(0, 10);
const ogImage = o => !o.base ? '' : `<meta property="og:type" content="website">${o.url ? `<meta property="og:url" content="${o.url}">` : ''}
<meta property="og:image" content="${o.base}${o.image || 'og.png'}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">${o.imageAlt ? `<meta property="og:image:alt" content="${esc(o.imageAlt)}">` : ''}
<meta name="twitter:card" content="summary_large_image">`;
const dayName = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', {weekday:'long', day:'numeric', month:'long', year:'numeric', timeZone:'UTC'});
const shortDay = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', {day:'numeric', month:'short', year:'numeric', timeZone:'UTC'});
const beacon = tok => tok ? `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"${esc(tok)}"}'></script>` : '';
const SOURCES = `<p class="src">Results from the open archives maintained by Mart J&uuml;risoo (CC0), with recent results and fixtures from
API-Football and some venues from Wikipedia (CC BY-SA 4.0). Penalty shoot-outs count as wins. Every source is listed on
<a href="../../index.html#/sources">Sources &amp; thanks</a>.</p>`;
function head(o){
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.desc)}">
${o.base ? `<link rel="canonical" href="${o.base}${o.path}">` : ''}${o.noindex ? '\n<meta name="robots" content="noindex">' : ''}
<meta property="og:title" content="${esc(o.ogTitle || o.title)}"><meta property="og:description" content="${esc(o.desc)}">
${ogImage({base:o.base, url:o.base ? o.base + o.path : '', image:o.image, imageAlt:o.imageAlt})}
${STYLE}${beacon(o.analytics)}</head><body><main>
<a class="brand" href="../../index.html">Formline</a>`;
}

function teamPage(g, r, meta, href, extra){
  extra = extra || {matches:[], rivals:[]};
  const rankTxt = r.rank ? `ranked ${ord(r.rank)} of ${meta.teams}` : 'not ranked yet (too few recent matches)';
  const desc = `${r.team} ${GAME[g]} national football team: rated ${r.rating} and ${rankTxt} in the Formline ratings, as of ${meta.asOf}.`;
  const res = x => x.gf > x.ga ? 'W' : x.gf < x.ga ? 'L' : 'D';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(r.team)} ${GAME[g]} football rating – Formline</title>
<meta name="description" content="${esc(desc)}">
${meta.base ? `<link rel="canonical" href="${meta.base}teams/${g}/${slugify(r.team)}.html">` : ''}
<meta property="og:title" content="${esc(r.team)} – ${GAME[g]} rating ${r.rating}"><meta property="og:description" content="${esc(desc)}">
${ogImage({base:meta.base, url:meta.base ? `${meta.base}teams/${g}/${slugify(r.team)}.html` : '', image:meta.image, imageAlt:meta.imageAlt})}
${STYLE}${beacon(meta.analytics)}</head><body><main>
<a class="brand" href="../../index.html">Formline</a>
<p class="muted" style="margin:18px 0 0">${GAME[g][0].toUpperCase() + GAME[g].slice(1)} national team${r.confName ? ' · ' + esc(r.confName) : ''}</p>
<h1>${esc(r.team)}</h1>
<div><span class="big">${r.rating}</span> <span class="pm">±${r.band}</span></div>
<p>${esc(r.team)} ${r.rank ? `are <b>${ord(r.rank)}</b> of ${meta.teams} ranked teams` : 'are not ranked yet: the model has seen too few recent matches'}${r.tier ? `, in tier ${r.tier}` : ''}.
The model is about 95% sure their true strength lies between ${r.rating - r.band} and ${r.rating + r.band}. Ratings use the last 12 years of results and were updated on ${meta.asOf}.</p>
${r.drawn.length ? `<p>Coming up: ${r.drawn.map(esc).join(', ')}.</p>` : ''}
${r.last.length ? `<div class="box"><b>Last ${r.last.length} results</b><table>${r.last.slice().reverse().map(x =>
  `<tr><td class="muted">${x.date}</td><td>v ${esc(x.opp)} <span class="muted">· ${esc(x.comp)}</span></td><td class="n">${x.gf}–${x.ga} <span class="${res(x)}">${res(x)}</span></td></tr>`).join('')}</table></div>` : ''}
${extra.matches.length ? `<div class="box"><b>Next matches</b><table>${extra.matches.map(x =>
  `<tr><td class="muted">${shortDay(x.day || x.date)}</td><td><a href="../../matches/${g}/${x.slug}.html">${esc(x.home)} v ${esc(x.away)}</a> <span class="muted">· ${esc(x.comp)}</span></td></tr>`).join('')}</table></div>` : ''}
${extra.rivals.length ? `<div class="box"><b>Most-played opponents</b><table>${extra.rivals.map(x =>
  `<tr><td><a href="../../h2h/${g}/${x.slug}.html">${esc(r.team)} v ${esc(x.opp)}</a></td><td class="n muted">${x.n} meetings: ${x.w}–${x.d}–${x.l}</td></tr>`).join('')}</table></div>` : ''}
${extra.all && extra.all.length > extra.rivals.length ? `<h2>Every opponent (${extra.all.length})</h2>
<ul class="cols opp">${extra.all.map(x => `<li><a href="../../h2h/${g}/${x.slug}.html">${esc(x.opp)}</a> <span class="muted">${x.w}–${x.d}–${x.l}</span></li>`).join('')}</ul>` : ''}
<p><a class="btn" href="${href}">Open the full team page</a></p>
<p class="muted">Every rating, chart and prediction on <a href="../../index.html">Formline</a> is worked out from open match data. <a href="../index.html">All teams</a></p>
</main></body></html>
`;
}

const venuePlain = x => x.city ? x.city + (x.country && x.country !== x.city ? ', ' + x.country : '') : (x.country && x.venue !== 'assumed' ? x.country : '');
const venueTxt = x => esc(venuePlain(x));
const h2hHref = (g, a, b) => `../../index.html#/h2h/${encodeURIComponent(a)}/${encodeURIComponent(b)}?ha=1${g === 'women' ? '&g=women' : ''}`;
const recordBox = (a, b, w, d, l, ga, gb, n) => `<div class="rec"><div><b>${w}</b><span>${esc(a)} win${w === 1 ? '' : 's'}</span></div>
<div><b>${d}</b><span>draw${d === 1 ? '' : 's'}</span></div><div><b>${l}</b><span>${esc(b)} win${l === 1 ? '' : 's'}</span></div></div>
<div class="bar"><span class="a" style="width:${w / n * 100}%"></span><span class="d" style="width:${d / n * 100}%"></span><span class="b" style="width:${l / n * 100}%"></span></div>
<p class="muted" style="margin:0">Goals: ${esc(a)} ${ga}, ${esc(b)} ${gb} · ${n} meeting${n === 1 ? '' : 's'}</p>`;
const scoreLine = x => `${esc(x.home)} ${x.hs}–${x.as} ${esc(x.away)}${x.pen ? ' <span class="muted">(pens)</span>' : ''}`;
const winnerOf = (x, a, b) => x.r > 0 ? a : x.r < 0 ? b : null;

/* One head-to-head page. P is a pair from model.pairs, with a and b the current names of P.k1 and P.k2. */
function h2hPage(g, P, a, b, meta){
  const n = P.n, first = P.meets[0], last = P.meets[n - 1];
  const big = side => { let best = null; for (const x of P.meets){ const mg = side * (x.s1 - x.s2); if (mg > 0 && (!best || mg > best.mg)) best = {mg, x}; } return best; };
  const bA = big(1), bB = big(-1);
  const lead = P.w1 > P.w2 ? `${a} lead ${P.w1}–${P.w2}` : P.w2 > P.w1 ? `${b} lead ${P.w2}–${P.w1}` : `level at ${P.w1} wins each`;
  const desc = n === 1 ? `${a} and ${b} have met once (${GAME[g]} national teams): ${first.home} ${first.hs}–${first.as} ${first.away} on ${shortDay(first.date)}.`
    : `${a} v ${b} head to head: ${n} ${GAME[g]} internationals since ${first.date.slice(0, 4)}. ${a} ${P.w1} wins, ${P.d} draws, ${b} ${P.w2} wins. Every result, with competition and venue.`;
  const next = meta.next ? `<div class="box"><b>Next meeting:</b> <a href="../../matches/${g}/${meta.next.slug}.html">${esc(meta.next.home)} v ${esc(meta.next.away)}, ${shortDay(meta.next.day || meta.next.date)}</a>
 <span class="muted">· ${esc(meta.next.comp)}</span>. See Formline's prediction.</div>` : '';
  let yr = null;
  const rows = P.meets.slice().reverse().map(x => {
    const y = x.date.slice(0, 4), hd = y !== yr ? `<tr><td class="yr" colspan="3">${y}</td></tr>` : ''; yr = y;
    const w = winnerOf(x, a, b), v = venueTxt(x);
    return hd + `<tr><td class="muted">${shortDay(x.date).replace(/ \d{4}$/, '')}</td><td>${scoreLine(x)}<br><span class="muted">${esc(x.tournament)}${v ? ' · ' + v : ''}${x.neutral ? ' (neutral)' : ''}</span></td>
<td class="n">${w ? `<span class="${w === a ? 'W' : 'L'}">${esc(w)}</span>` : '<span class="D">Draw</span>'}</td></tr>`;
  }).join('');
  const facts = [
    n > 1 ? `The first meeting on record was on ${dayName(first.date)}: ${first.home} ${first.hs}–${first.as} ${first.away}${first.city ? ' in ' + esc(first.city) : ''}.` : '',
    n > 1 ? `The most recent was on ${dayName(last.date)}: ${last.home} ${last.hs}–${last.as} ${last.away} (${esc(last.tournament)}).` : '',
    bA ? `${esc(a)}'s biggest win: ${bA.x.home} ${bA.x.hs}–${bA.x.as} ${bA.x.away}, ${bA.x.date.slice(0, 4)}.` : '',
    bB ? `${esc(b)}'s biggest win: ${bB.x.home} ${bB.x.hs}–${bB.x.as} ${bB.x.away}, ${bB.x.date.slice(0, 4)}.` : '',
    n > 1 ? `${P.comp} of the ${n} meetings were competitive matches and ${n - P.comp} were friendlies.` : ''
  ].filter(Boolean).map(t => `<li>${t}</li>`).join('');
  return head({title:`${a} vs ${b} head to head: ${n === 1 ? 'the only meeting' : `all ${n} results`} | Formline`,
      ogTitle:`${a} v ${b}: ${n === 1 ? 'one meeting' : lead}`, desc, base:meta.base, path:`h2h/${g}/${meta.slug}.html`, analytics:meta.analytics,
      noindex:n < INDEX_MIN && !meta.next}) + `
<p class="muted" style="margin:18px 0 0">Head to head · ${GAME[g][0].toUpperCase() + GAME[g].slice(1)} national teams</p>
<h1>${esc(a)} v ${esc(b)}</h1>
<p>${n === 1 ? `${esc(a)} and ${esc(b)} have met once.` : `${esc(a)} and ${esc(b)} have met ${n} times since ${first.date.slice(0, 4)}: ${esc(lead)}.`}</p>
<div class="box">${recordBox(a, b, P.w1, P.d, P.w2, P.g1, P.g2, n)}</div>
${next}
${facts ? `<ul>${facts}</ul>` : ''}
<p><a class="btn" href="${h2hHref(g, a, b)}">Compare their ratings over time</a></p>
<h2>Every meeting</h2>
<table>${rows}</table>
<p class="muted" style="margin-top:20px"><a href="../../teams/${g}/${meta.slugA}.html">${esc(a)}</a> · <a href="../../teams/${g}/${meta.slugB}.html">${esc(b)}</a> · <a href="../index.html">More head-to-heads</a></p>
${SOURCES}
</main></body></html>
`;
}

/* One match page: an upcoming fixture with the prediction, or a played one with the prediction and the result. */
function matchPage(g, x, meta){
  const [ph, pd, pa] = x.p.map(pct), played = !!x.result;
  const fav = x.p.indexOf(Math.max(...x.p)), when = dayName(x.day || x.date);
  const ko = x.kickoff ? new Date(x.kickoff).toISOString().slice(11, 16) + ' UTC' : '';
  const v = venueTxt(x);
  const res = played ? `${x.home} ${x.result[0]}–${x.result[1]} ${x.away}` : '';
  const title = played ? `${res}: result and prediction, ${shortDay(x.day || x.date)} | Formline` : `${x.home} vs ${x.away} prediction, ${shortDay(x.day || x.date)} | Formline`;
  const P = meta.pair, flip = P && P.k1 !== meta.keyH;
  const rec = P ? (flip ? {w:P.w2, l:P.w1, gh:P.g2, ga:P.g1} : {w:P.w1, l:P.w2, gh:P.g1, ga:P.g2}) : null;
  const h2hTxt = P ? ` Head to head: ${x.home} ${rec.w} wins, ${P.d} draws, ${x.away} ${rec.l} wins.` : ` Their first meeting on record.`;
  const desc = `${x.home} v ${x.away}, ${x.comp}, ${when}. ${played ? `Result ${x.result[0]}–${x.result[1]}. Formline's prediction was` : `Formline's prediction:`} ${x.home} ${ph}%, draw ${pd}%, ${x.away} ${pa}%.${h2hTxt}`;
  const box = (lbl, v, i) => `<div class="${i === fav ? 'fav' : ''}"><b>${v}%</b><span>${esc(lbl)}</span></div>`;
  const team = (name, r, slug) => r ? `<tr><td><a href="../../teams/${g}/${slug}.html">${esc(name)}</a></td><td class="n">${r.rating}</td><td class="n muted">${r.rank ? ord(r.rank) : 'unranked'}</td></tr>` : '';
  const verdict = played ? (() => { const o = x.result[0] > x.result[1] ? 0 : x.result[0] < x.result[1] ? 2 : 1, top = x.p.indexOf(Math.max(...x.p));
    return o === top ? `The result matched Formline's most likely outcome.` : `Formline had ${['a ' + x.home + ' win', 'a draw', 'a ' + x.away + ' win'][top]} as the most likely outcome, so this one went against the prediction.`; })() : '';
  const recent = P ? P.meets.slice(-5).reverse().map(m => `<tr><td class="muted">${shortDay(m.date)}</td><td>${scoreLine(m)}<br><span class="muted">${esc(m.tournament)}</span></td></tr>`).join('') : '';
  return head({title, desc, base:meta.base, path:`matches/${g}/${meta.slug}.html`, analytics:meta.analytics, image:meta.image, imageAlt:meta.imageAlt,
      ogTitle:played ? res : `${x.home} v ${x.away}: ${ph}% · ${pd}% · ${pa}%`}) + `
<p class="muted" style="margin:18px 0 0">${esc(x.comp)} · ${GAME[g][0].toUpperCase() + GAME[g].slice(1)} national teams</p>
<h1>${esc(x.home)} v ${esc(x.away)}</h1>
<p>${when}${ko ? ', kick-off ' + ko : ''}${v ? ' · ' + v : ''}${x.neutral ? ' (neutral venue)' : ''}</p>
${played ? `<div class="box"><b>Result:</b> <span class="big" style="font-size:30px">${x.result[0]}–${x.result[1]}</span><p style="margin:6px 0 0">${esc(verdict)}</p></div>` : ''}
<div class="box"><b>${played ? "Formline's prediction before kick-off" : "Formline's prediction"}</b>
<div class="probs">${box(x.home + ' win', ph, 0)}${box('Draw', pd, 1)}${box(x.away + ' win', pa, 2)}</div>
<p class="muted" style="margin:0">Most likely score ${esc(String(x.likely).replace('-', '–'))}${x.xg ? ` · expected goals ${x.xg[0].toFixed(1)}–${x.xg[1].toFixed(1)}` : ''}</p></div>
${meta.rh || meta.ra ? `<div class="box"><b>Ratings now</b><table>${team(x.home, meta.rh, meta.slugH)}${team(x.away, meta.ra, meta.slugA)}</table></div>` : ''}
<h2>Head to head</h2>
${P ? `<div class="box">${recordBox(x.home, x.away, rec.w, P.d, rec.l, rec.gh, rec.ga, P.n)}</div>
<table>${recent}</table>
<p>${meta.h2hSlug ? `<a href="../../h2h/${g}/${meta.h2hSlug}.html">All ${P.n} meetings of ${esc(x.home)} and ${esc(x.away)}</a>` : ''}</p>` : `<p>No earlier meeting between ${esc(x.home)} and ${esc(x.away)} is on record.</p>`}
<p><a class="btn" href="../../index.html#/fixtures${g === 'women' ? '?g=women' : ''}">See every upcoming match</a></p>
<p class="muted">Predictions come from Formline's ratings, worked out every night from every international result. <a href="../index.html">All match pages</a></p>
${SOURCES}
</main></body></html>
`;
}

/* ---------- records and window recaps ---------- */
const RECAP_MIN = 8;                              // scored predictions a window needs for its recap page
const RECAP_GAP_DAYS = 10;                        // a gap this long between matches starts a new window
const RECORDS = [
  ['biggest-upsets', 'Biggest upsets', g => `The biggest upsets in ${GAME[g]} international football history`],
  ['biggest-wins', 'Biggest wins', g => `The biggest wins in ${GAME[g]} international football history`],
  ['longest-runs', 'Longest winning and unbeaten runs', g => `The longest winning and unbeaten runs in ${GAME[g]} international football`],
  ['best-ever-teams', "Every country's best-ever team", g => `Every country's best-ever ${GAME[g]} national team`],
  ['fifa-ranking-vs-formline', 'FIFA ranking vs Formline', g => `FIFA ranking vs Formline vs World Elo: the ${GAME[g]} tables side by side`]];
const longDay = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', {day:'numeric', month:'long', year:'numeric', timeZone:'UTC'});
const recPct = p => p < 0.01 ? '<1%' : Math.round(p * 100) + '%';
function plainHead(o){   // a page two folders down, with og tags and the shared stylesheet
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.desc)}">
${o.base ? `<link rel="canonical" href="${o.base}${o.path}">` : ''}
<meta property="og:title" content="${esc(o.ogTitle || o.title)}"><meta property="og:description" content="${esc(o.desc)}">
${ogImage({base:o.base, url:o.base ? o.base + o.path : ''})}
${STYLE}${beacon(o.analytics)}</head><body><main>
<a class="brand" href="../../index.html">Formline</a>`;
}
const recNav = (g, here) => `<p class="muted">${RECORDS.filter(([id]) => id !== here).map(([id, label]) => `<a href="${id}.html">${esc(label)}</a>`).join(' · ')}
· <a href="../../records/${g === 'men' ? 'women' : 'men'}/${here}.html">${g === 'men' ? "Women's" : "Men's"} ${esc((RECORDS.find(r => r[0] === here) || [, 'records'])[1].toLowerCase())}</a> · <a href="../index.html">All records</a></p>`;
const recFoot = `<p class="src">Ratings and chances are Formline's, worked out from every international result in the open archives maintained by
Mart J&uuml;risoo (CC0), with recent results from API-Football. In the runs, a match settled on penalties counts as a draw. Every source is listed on
<a href="../../index.html#/sources">Sources &amp; thanks</a>.</p>
</main></body></html>
`;
function recordPage(g, id, R, meta){
  const [, label, h] = RECORDS.find(r => r[0] === id), G = GAME[g][0].toUpperCase() + GAME[g].slice(1);
  const tl = k => meta.slugOf.get(k) ? `../../teams/${g}/${meta.slugOf.get(k)}.html` : null;
  const team = (name, k) => { const u = tl(k); return u ? `<a href="${u}">${esc(name)}</a>` : esc(name); };
  const span = `${R.matches.toLocaleString('en')} ${GAME[g]} internationals from ${longDay(R.first)} to ${longDay(R.asOf)}`;
  let title, desc, body;
  if (id === 'biggest-upsets'){
    const u = R.upsets;
    title = `Biggest upsets in ${GAME[g]} international football history | Formline`;
    desc = `The ${u.length} biggest shocks in ${GAME[g]} international football, ranked by the winner's chance before kick-off: ${u.slice(0, 3).map(x => `${x.w} ${x.s} ${x.l} (${x.date.slice(0, 4)}, ${recPct(x.p)})`).join('; ')}.`;
    body = `<p>Every one of the ${span}, ranked by how unlikely the result looked beforehand: the winner's chance of winning, from Formline's
ratings on the day. Both teams had to have played enough recent matches for the model to know them well, so sides with little history are left out.</p>
<div class="box"><table>${u.map((x, i) => `<tr><td class="muted">${i + 1}</td><td>${team(x.w, x.wk)} ${esc(x.s)} ${team(x.l, x.lk)}<br><span class="muted">${esc(x.comp)} · ${longDay(x.date)}</span></td><td class="n"><b>${recPct(x.p)}</b></td></tr>`).join('')}</table></div>
<p class="muted">The percentage is the winner's chance before kick-off.</p>`;
  } else if (id === 'biggest-wins'){
    const w = R.wins;
    title = `Biggest wins in ${GAME[g]} international football history | Formline`;
    desc = `The ${w.length} biggest winning margins in ${GAME[g]} international football: ${w.slice(0, 3).map(x => `${x.w} ${x.s} ${x.l} (${x.date.slice(0, 4)})`).join('; ')}.`;
    body = `<p>The widest winning margins in the ${span}.</p>
<div class="box"><table>${w.map((x, i) => `<tr><td class="muted">${i + 1}</td><td>${team(x.w, x.wk)} ${esc(x.s)} ${team(x.l, x.lk)}<br><span class="muted">${esc(x.comp)} · ${longDay(x.date)}</span></td></tr>`).join('')}</table></div>`;
  } else if (id === 'longest-runs'){
    const row = (x, i) => `<tr><td class="muted">${i + 1}</td><td>${team(x.team, x.k)}<br><span class="muted">${longDay(x.from)} to ${x.going ? 'now, still going' : longDay(x.to)}</span></td><td class="n"><b>${x.n}</b></td></tr>`;
    title = `Longest winning and unbeaten runs in ${GAME[g]} international football | Formline`;
    desc = `The longest runs in ${GAME[g]} international football: ${R.winRuns[0] ? `${R.winRuns[0].team} won ${R.winRuns[0].n} in a row` : ''}${R.unbeaten[0] ? `, and ${R.unbeaten[0].team} went ${R.unbeaten[0].n} matches unbeaten` : ''}.`;
    body = `<p>Matches in a row won, and matches in a row without defeat, across the ${span}. A penalty shoot-out counts as a draw.</p>
<h2>Longest winning runs</h2><div class="box"><table>${R.winRuns.map(row).join('')}</table></div>
<h2>Longest unbeaten runs</h2><div class="box"><table>${R.unbeaten.map(row).join('')}</table></div>`;
  } else if (id === 'best-ever-teams'){
    title = `Every country's best-ever ${GAME[g]} national team | Formline`;
    desc = `The strongest side each country has ever had, by Formline's rating at its peak: ${R.peaks.slice(0, 4).map(x => `${x.team} ${x.year}`).join(', ')} and ${R.peaks.length - 4} more.`;
    body = `<p>Each country once, at its highest Formline rating ever: the model's best estimate of how strong the side was at that moment, from the ${span}.
Each rating measures a side against the teams of its own time, and the early decades had far fewer teams to measure against.</p>
<div class="box"><table><tr><td class="muted">#</td><td class="muted">Team, and when it peaked</td><td class="n muted">Rating</td></tr>
${R.peaks.map((x, i) => `<tr><td class="muted">${i + 1}</td><td>${team(x.team, x.k)}<br><span class="muted">${longDay(x.date)}</span></td><td class="n"><b>${x.r}</b></td></tr>`).join('')}</table></div>`;
  } else {
    const C = R.compare, withF = C.filter(x => x.fifa);
    const up = withF.slice().sort((a, b) => (b.fifa - b.rank) - (a.fifa - a.rank)).slice(0, 10), down = withF.slice().sort((a, b) => (a.fifa - a.rank) - (b.fifa - b.rank)).slice(0, 10);
    const same10 = C.slice(0, 10).filter(x => x.fifa && x.fifa <= 10).length;
    const vsHead = `<tr><td class="muted">Team</td><td class="n muted">Formline</td><td class="n muted">FIFA method</td></tr>`;
    const vsRow = x => `<tr><td>${team(x.team, x.k)}</td><td class="n"><b>${ord(x.rank)}</b></td><td class="n">${ord(x.fifa)}</td></tr>`;
    title = `FIFA ranking vs Formline vs World Elo: ${GAME[g]} national teams | Formline`;
    desc = `Formline's ${GAME[g]} table next to FIFA's ranking formula and the World Football Elo formula, all three worked out from the same results. ${same10} of Formline's top 10 are also in the FIFA method's top 10.`;
    body = `<p>Three ways of ranking the same ${GAME[g]} national teams, all worked out here from the same results, as of ${longDay(R.asOf)}:</p>
<ul><li><b>Formline</b>: its own ratings, built on the last 12 years of results and how strong each opponent was.</li>
<li><b>FIFA method</b>: FIFA's own ranking formula, calculated by Formline${g === 'men' ? ' from FIFA\'s June 2018 ranking onwards, as FIFA did' : ' from every match since 1971'}. It is our calculation, not FIFA's published ranking.</li>
<li><b>World Elo</b>: the World Football Elo Ratings formula, best known from eloratings.net, calculated by Formline. It is not eloratings.net's published table.</li></ul>
<p>All three count places among the same ${C.length} teams, the ones Formline ranks. ${same10} of Formline's top 10 are also in the FIFA method's top 10. Where they disagree, it is mostly down to how each formula weighs friendlies and opponents, and how far back it looks.</p>
<h2>Formline rates higher than FIFA's formula</h2><div class="box"><table>${vsHead}${up.map(vsRow).join('')}</table></div>
<h2>FIFA's formula rates higher than Formline</h2><div class="box"><table>${vsHead}${down.map(vsRow).join('')}</table></div>
<h2>All ranked teams</h2><div class="box"><table><tr><td class="muted">Team</td><td class="n muted">Formline</td><td class="n muted">FIFA method</td><td class="n muted">World Elo</td></tr>
${C.map(x => `<tr><td>${team(x.team, x.k)}</td><td class="n"><b>${x.rank}</b></td><td class="n">${x.fifa || '–'}</td><td class="n">${x.elo || '–'}</td></tr>`).join('')}</table></div>
<p><a class="btn" href="../../index.html#/compare${g === 'women' ? '?g=women' : ''}">Compare them on any date</a></p>`;
  }
  return plainHead({title, desc, base:meta.base, path:`records/${g}/${id}.html`, analytics:meta.analytics, ogTitle:h(g)}) + `
<p class="muted" style="margin:18px 0 0">Records · ${G} national teams</p>
<h1>${esc(h(g))}</h1>
${body}
${recNav(g, id)}
<p><a class="btn" href="../../index.html#/records${g === 'women' ? '?g=women' : ''}">Explore the records by year</a></p>
${recFoot}`;
}

/* International windows from the scored forecasts: matches less than RECAP_GAP_DAYS apart belong together. */
export function recapWindows(entries, fixtures){
  const scored = entries.filter(e => e.result && e.p).sort((a, b) => a.date.localeCompare(b.date)), out = [];
  for (const e of scored){
    const w = out[out.length - 1];
    if (w && (Date.parse(e.date) - Date.parse(w.to)) / 864e5 < RECAP_GAP_DAYS){ w.list.push(e); w.to = e.date; }
    else out.push({from:e.date, to:e.date, list:[e]});
  }
  const ahead = ['men', 'women'].flatMap(g => (fixtures[g] || []).map(x => x.date)).sort();
  const used = new Set();
  return out.filter(w => w.list.length >= RECAP_MIN).map(w => {
    const d = new Date(w.from + 'T12:00:00Z'); let slug = d.toLocaleDateString('en-GB', {month:'long', timeZone:'UTC'}).toLowerCase() + '-' + d.getUTCFullYear();
    if (used.has(slug)) slug += '-' + w.from.slice(8); used.add(slug);
    const open = ahead.some(x => x >= w.from && (Date.parse(x) - Date.parse(w.to)) / 864e5 < RECAP_GAP_DAYS);
    return {...w, slug, open, label:d.toLocaleDateString('en-GB', {month:'long', year:'numeric', timeZone:'UTC'})};
  });
}
export function recapPage(w, meta){
  const L = w.list, n = L.length, hits = L.filter(e => e.hit).length, draws = L.filter(e => e.outcome === 1).length;
  const brier = L.reduce((a, e) => a + e.brier, 0) / n, byG = g => L.filter(e => e.g === g).length;
  const out = e => e.p[e.outcome], name = (e, i) => [e.home, 'Draw', e.away][i];
  const surprises = L.slice().sort((a, b) => out(a) - out(b)).slice(0, 5);
  const fav = e => e.p.indexOf(Math.max(...e.p));
  const range = w.from === w.to ? longDay(w.from) : `${longDay(w.from)} to ${longDay(w.to)}`;
  const title = `How Formline's predictions did: ${w.label} internationals${w.open ? ' (so far)' : ''} | Formline`;
  const desc = `${w.label} international window${w.open ? ', so far' : ''}: Formline predicted ${n} matches before kick-off and its favourite won ${hits} (${Math.round(100 * hits / n)}%).`;
  const row = e => { const f = fav(e); return `<tr><td>${esc(e.home)} ${e.result[0]}–${e.result[1]} ${esc(e.away)}<br><span class="muted">${esc(e.tournament)} · ${shortDay(e.date)}${e.g === 'women' ? " · women's" : ''}</span></td>
<td class="n">${esc(f === 1 ? 'Draw' : name(e, f))} ${Math.round(e.p[f] * 100)}%<br><span class="${e.hit ? 'W' : 'L'}">${e.hit ? 'Right' : 'Wrong'}</span></td></tr>`; };
  return plainHead({title, desc, base:meta.base, path:`records/recaps/${w.slug}.html`, analytics:meta.analytics,
    ogTitle:`${w.label} internationals: Formline's favourite won ${hits} of ${n}`}) + `
<p class="muted" style="margin:18px 0 0">Forecast record · international window</p>
<h1>How the predictions did: ${esc(w.label)}${w.open ? ', so far' : ''}</h1>
<p>${range}. Formline published a prediction for each of these ${n} matches${byG('women') && byG('men') ? ` (${byG('men')} men's, ${byG('women')} women's)` : ''} before kick-off, and they are scored here exactly as they were made.${w.open ? ' The window is still going, so this page updates each night.' : ''}</p>
<div class="probs"><div class="fav"><b>${hits} of ${n}</b><span>favourite won</span></div><div><b>${Math.round(100 * hits / n)}%</b><span>right</span></div><div><b>${brier.toFixed(2)}</b><span>Brier score</span></div></div>
<p class="muted">The Brier score measures how close the chances were to what happened: 0 is perfect, and giving every outcome a third each time would score 0.67. ${draws} of the ${n} ended level.</p>
<h2>Biggest surprises</h2><div class="box"><table>${surprises.map(e => `<tr><td>${esc(e.home)} ${e.result[0]}–${e.result[1]} ${esc(e.away)}<br><span class="muted">${esc(e.tournament)} · ${shortDay(e.date)}</span></td><td class="n">${e.outcome === 1 ? 'Draw' : esc(name(e, e.outcome)) + ' win'}: ${Math.round(out(e) * 100)}%</td></tr>`).join('')}</table></div>
<p class="muted">The percentage is the chance Formline gave the result that happened.</p>
<h2>Every prediction</h2><div class="box"><table>${L.slice().sort((a, b) => a.date.localeCompare(b.date) || a.home.localeCompare(b.home)).map(row).join('')}</table></div>
<p><a class="btn" href="../../index.html#/record">Formline's full forecast record</a></p>
<p class="muted"><a href="../index.html">All records and recaps</a> · <a href="../../matches/index.html">Upcoming match predictions</a></p>
${recFoot}`;
}

/* A tournament's page: the chances from the Simulator, a button to play it, and a hand-off for shared scenarios. */
const SIM_PHRASE = {Winner:'chances of winning it', Champion:'chances of winning it', Promoted:'chances of going up', Qualified:'chances of qualifying', 'Group winner':'chances of winning the group'};
const simPct = p => p >= 0.9995 ? '100%' : p >= 0.995 ? '>99%' : p < 0.0005 ? '0%' : p < 0.005 ? '<1%' : Math.round(p * 100) + '%';
function simPage(g, S, meta){
  const app = `../index.html#/simulate?t=${encodeURIComponent(S.id)}${g === 'women' ? '&g=women' : ''}`;
  const rewind = S.status === 'rewind', phrase = SIM_PHRASE[S.col] || 'chances';
  const lead = S.rows.filter(r => !S.hosts.includes(r.team)).slice(0, 3);
  const title = rewind ? `${S.name}: who the model backed going in | Formline` : `${S.name} predictions: ${phrase} | Formline`;
  const desc = `Formline played the ${S.name} ${S.runs.toLocaleString('en')} times${rewind ? ', with the ratings from the day before kick-off' : ''}: ` +
    lead.map(r => `${r.team} ${simPct(r.p)}`).join(', ') + `. Every team's ${phrase}${rewind ? '' : ', updated every night'}.`;
  const st = {upcoming:'not started yet', 'in progress':'in progress', rewind:'already played'}[S.status] || S.status;
  const teamLink = r => r.key && meta.slugOf.get(r.key) ? `<a href="../teams/${g}/${meta.slugOf.get(r.key)}.html">${esc(r.team)}</a>` : esc(r.team);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<script>if (/[?&]open=1/.test(location.search)){ const q = new URLSearchParams(location.search); q.delete('open'); q.delete('t');
  location.replace(${JSON.stringify(app)} + (q.toString() ? '&' + q.toString() : '')); }</script>
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
${canonical(meta)}
<meta property="og:title" content="${esc(rewind ? `${S.name}: the chances going in` : `${S.name}: ${phrase}`)}"><meta property="og:description" content="${esc(desc)}">
${ogImage({base:meta.base, url:meta.base ? `${meta.base}sim/${S.id}.html` : '', image:meta.image, imageAlt:meta.imageAlt})}
${STYLE_UP}${beacon(meta.analytics)}</head><body><main>
<a class="brand" href="../index.html">Formline</a>
<p class="muted" style="margin:18px 0 0">Tournament simulator · ${GAME[g][0].toUpperCase() + GAME[g].slice(1)} national teams</p>
<h1>${esc(S.name)}</h1>
<p>${S.where ? esc(S.where) + ' · ' : ''}${st}</p>
<p>Formline played the whole ${esc(S.short || S.name)} ${S.runs.toLocaleString('en')} times, using its ratings${rewind ? ' from the day before kick-off' : ''} and the results already in.
${lead.length ? `${esc(lead[0].team)} ${S.col === 'Winner' || S.col === 'Champion' ? 'won it' : S.col === 'Promoted' ? 'went up' : S.col === 'Qualified' ? 'qualified' : 'came out on top'} in ${simPct(lead[0].p)} of them.` : ''}</p>
${S.hosts.length ? `<p class="muted">${esc(S.hosts.join(', ').replace(/, ([^,]*)$/, ' and $1'))} qualify as hosts.</p>` : ''}
<p><a class="btn" href="${app}">Play it yourself in the Simulator</a></p>
<div class="box"><b>${esc(phrase[0].toUpperCase() + phrase.slice(1))}</b><table>
${S.firstKo ? `<tr><td class="muted">Team</td><td class="n muted">${esc(S.firstKo)}</td><td class="n muted">${esc(S.col)}</td></tr>` : ''}
${S.rows.map(r => `<tr><td>${teamLink(r)}</td>${S.firstKo ? `<td class="n muted">${simPct(r.first)}</td>` : ''}<td class="n">${simPct(r.p)}</td></tr>`).join('')}
</table></div>
<p class="muted">${esc(S.note)}</p>
<p class="muted"><a href="../teams/index.html">All teams</a> · <a href="../matches/index.html">Match predictions</a> · <a href="../h2h/index.html">Head to head</a></p>
<p class="src">Results from the open archives maintained by Mart J&uuml;risoo (CC0), with recent results and fixtures from API-Football.
Every source is listed on <a href="../index.html#/sources">Sources &amp; thanks</a>.</p>
</main></body></html>
`;
}
const canonical = m => m.base ? `<link rel="canonical" href="${m.base}${m.path}">` : '';

export function buildPages(root, base){
  const model = loadModel(path.join(root, 'index.html'));
  const analytics = model.analytics();
  const out = {men:[], women:[]}, extraUrls = [], hub = {matches:{men:[], women:[]}, h2h:{men:[], women:[]}, sim:[]};
  const readJson = f => { try { return JSON.parse(fs.readFileSync(path.join(root, 'data', f), 'utf8')); } catch(e){ return null; } };
  const fixtures = readJson('fixtures.json') || {}, forecasts = (readJson('forecasts.json') || {}).entries || [];
  /* Pictures already drawn (previews/index.json: file → hash of what it shows). A page uses its picture whenever one
     exists, even if it is a few hours behind, and og.png otherwise. */
  let drawn = {}; try { drawn = JSON.parse(fs.readFileSync(path.join(root, 'previews', 'index.json'), 'utf8')); } catch(e){}
  const specs = [];
  const preview = (file, alt, data) => { const hash = previewHash(data); specs.push({file, hash, alt, data});
    const have = drawn[file] && fs.existsSync(path.join(root, file)) ? drawn[file] : null;
    return have ? {image:`${file}?v=${have}`, imageAlt:alt} : {}; };
  const today = new Date().toISOString().slice(0, 10), keepFrom = new Date(Date.now() - MATCH_KEEP_DAYS * 864e5).toISOString().slice(0, 10);
  for (const g of ['men', 'women']){
    const f = path.join(root, 'data', g + '.json');
    if (!fs.existsSync(f)) continue;
    model.load(g, JSON.parse(fs.readFileSync(f, 'utf8')));
    const t = model.table(g);
    const byKey = new Map(t.rows.map(r => [r.key, r])), slugOf = new Map();
    { const used = new Set();
      for (const r of t.rows){ let slug = slugify(r.team); if (used.has(slug)) slug += '-' + slugify(r.key); used.add(slug); slugOf.set(r.key, slug); } }
    const nameOf = k => byKey.has(k) ? byKey.get(k).team : k;

    /* Matches: upcoming fixtures (fresh prediction) and scored forecasts (stored prediction plus result). */
    const id = x => x.date + '|' + x.home + '|' + x.away;
    const played = forecasts.filter(e => e.g === g && e.result && e.date >= keepFrom);
    const playedIds = new Set(played.map(id));
    const upcoming = (fixtures[g] || []).filter(x => x.date >= today && !playedIds.has(id(x)));
    const preds = upcoming.length ? model.forecast(g, upcoming) : [];
    const matches = [];
    upcoming.forEach((x, i) => { const pr = preds[i]; if (pr) matches.push({...x, p:pr.p, likely:pr.likely, xg:pr.xg}); });
    played.forEach(e => matches.push({date:e.date, kickoff:e.kickoff, home:e.home, away:e.away, tournament:e.tournament, p:e.p, likely:e.likely, xg:e.xg, result:e.result}));
    matches.forEach(x => { x.kh = model.keyOf(x.home); x.ka = model.keyOf(x.away); x.comp = model.compName(x.tournament);
      x.slug = `${x.date}-${slugOf.get(x.kh) || slugify(x.home)}-vs-${slugOf.get(x.ka) || slugify(x.away)}`;
      /* Dates are UTC. An evening kick-off in the Americas falls on the next UTC day, so show the local day there. */
      const conf = (byKey.get(x.kh) || {}).conf, hr = x.kickoff ? new Date(x.kickoff).getUTCHours() : 12;
      x.day = hr < 6 && (conf === 'CONCACAF' || conf === 'CONMEBOL') ? new Date(Date.parse(x.date + 'T12:00:00Z') - 864e5).toISOString().slice(0, 10) : x.date; });

    /* Head-to-heads: every pair with H2H_MIN meetings, plus any pair with a match page. */
    const pairs = model.pairs(g, H2H_MIN, matches.map(x => x.kh + '|' + x.ka)).filter(P => slugOf.has(P.k1) && slugOf.has(P.k2));
    const pairOf = new Map(pairs.map(P => [P.k1 + '|' + P.k2, P]));
    const findPair = (a, b) => pairOf.get(a + '|' + b) || pairOf.get(b + '|' + a) || null;
    const h2hSlug = P => { const [x, y] = [slugOf.get(P.k1), slugOf.get(P.k2)].sort(); return `${x}-vs-${y}`; };
    const nextFor = new Map();
    matches.filter(x => !x.result).sort((a, b) => a.date.localeCompare(b.date)).forEach(x => {
      const P = findPair(x.kh, x.ka); if (P && !nextFor.has(P)) nextFor.set(P, x); });

    for (const dir of ['teams', 'matches', 'h2h']){ fs.rmSync(path.join(root, dir, g), {recursive:true, force:true}); fs.mkdirSync(path.join(root, dir, g), {recursive:true}); }
    if (g === 'men'){ fs.rmSync(path.join(root, 'sim'), {recursive:true, force:true}); fs.mkdirSync(path.join(root, 'sim'), {recursive:true}); }
    for (const P of pairs){
      const slug = h2hSlug(P), a = nameOf(P.k1), b = nameOf(P.k2);
      fs.writeFileSync(path.join(root, 'h2h', g, slug + '.html'), h2hPage(g, P, a, b,
        {base, slug, analytics, slugA:slugOf.get(P.k1), slugB:slugOf.get(P.k2), next:nextFor.get(P)}));
      if (base && (P.n >= INDEX_MIN || nextFor.has(P))) extraUrls.push(`${base}h2h/${g}/${slug}.html`);
      hub.h2h[g].push({a, b, slug, n:P.n});
    }
    for (const x of matches){
      const P = findPair(x.kh, x.ka), rh = byKey.get(x.kh), ra = byKey.get(x.ka), [ph, pd, pa] = x.p.map(pct);
      const pic = preview(`previews/matches/${g}/${x.slug}.png`,
        x.result ? `${x.home} ${x.result[0]}–${x.result[1]} ${x.away}, with Formline's prediction before kick-off` : `${x.home} v ${x.away}: Formline gives ${x.home} ${ph}%, a draw ${pd}% and ${x.away} ${pa}%`,
        {kind:'match', g, comp:x.comp, day:x.day, ko:x.kickoff ? new Date(x.kickoff).toISOString().slice(11, 16) : '', venue:venuePlain(x),
         home:{name:rh ? rh.team : x.home, flag:model.flag(x.home), rank:rh ? rh.rank : null, tier:rh ? rh.tier : null},
         away:{name:ra ? ra.team : x.away, flag:model.flag(x.away), rank:ra ? ra.rank : null, tier:ra ? ra.tier : null},
         p:[ph, pd, pa], likely:String(x.likely || ''), result:x.result || null});
      fs.writeFileSync(path.join(root, 'matches', g, x.slug + '.html'), matchPage(g, x,
        {base, analytics, slug:x.slug, pair:P, keyH:x.kh, h2hSlug:P ? h2hSlug(P) : null, ...pic,
         rh, ra, slugH:slugOf.get(x.kh), slugA:slugOf.get(x.ka)}));
      if (base) extraUrls.push(`${base}matches/${g}/${x.slug}.html`);
      hub.matches[g].push(x);
    }

    /* Team pages, now with links to their next matches and most-played opponents. */
    for (const r of t.rows){
      const slug = slugOf.get(r.key);
      const href = `../../index.html#/team/${encodeURIComponent(r.team)}${g === 'women' ? '?g=women' : ''}`;
      const extra = {
        matches:matches.filter(x => !x.result && (x.kh === r.key || x.ka === r.key)).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 4),
        rivals:[]};
      const opps = pairs.filter(P => P.k1 === r.key || P.k2 === r.key).map(P => {
        const one = P.k1 === r.key; return {opp:nameOf(one ? P.k2 : P.k1), n:P.n, w:one ? P.w1 : P.w2, d:P.d, l:one ? P.w2 : P.w1, slug:h2hSlug(P)}; });
      extra.rivals = opps.slice().sort((a, b) => b.n - a.n || a.opp.localeCompare(b.opp)).slice(0, 8);
      extra.all = opps.sort((a, b) => a.opp.localeCompare(b.opp));
      const nx = extra.matches[0], res = x => x.gf > x.ga ? 'W' : x.gf < x.ga ? 'L' : 'D';
      const pic = preview(`previews/teams/${g}/${slug}.png`,
        `${r.team} ${GAME[g]} national team: ${r.rank ? `ranked ${ord(r.rank)} of ${t.teams}, tier ${r.tier}, rated ${r.rating}` : 'not ranked yet'}`,
        {kind:'team', g, team:r.team, conf:r.conf, flag:model.flag(r.team), rank:r.rank || null, of:t.teams, tier:r.tier, rating:r.rating,
         last:r.last.map(res), next:nx ? {opp:nameOf(nx.kh === r.key ? nx.ka : nx.kh), day:nx.day || nx.date, comp:nx.comp} : null});
      fs.writeFileSync(path.join(root, 'teams', g, slug + '.html'), teamPage(g, r, {asOf:t.asOf, teams:t.teams, base, analytics, ...pic}, href, extra));
      out[g].push({team:r.team, slug, rank:r.rank});
    }

    /* Tournament pages from the Simulator. */
    for (const S of model.simulations(g)){
      if (!S.rows.length) continue;
      const shown = S.rows.filter(r => !S.hosts.includes(r.team)).slice(0, 8).map(r => ({team:r.team, flag:r.flag, p:Math.round(r.p * 1000) / 10}));
      const pic = preview(`previews/sim/${S.id}.png`, `${S.name}: ${SIM_PHRASE[S.col] || 'chances'} from ${S.runs.toLocaleString('en')} simulations, led by ` +
        shown.slice(0, 3).map(r => `${r.team} ${r.p}%`).join(', '),
        {kind:'sim', g, name:S.name, where:S.where, status:S.status, col:S.col, runs:S.runs, rows:shown, hosts:S.hosts});
      fs.writeFileSync(path.join(root, 'sim', S.id + '.html'), simPage(g, S, {base, path:`sim/${S.id}.html`, analytics, slugOf, ...pic}));
      if (base) extraUrls.push(`${base}sim/${S.id}.html`);
      hub.sim.push({g, id:S.id, name:S.name, status:S.status});
    }

    /* All-time records. */
    fs.rmSync(path.join(root, 'records', g), {recursive:true, force:true}); fs.mkdirSync(path.join(root, 'records', g), {recursive:true});
    const R = model.records(g, 30);
    for (const [id] of RECORDS){
      fs.writeFileSync(path.join(root, 'records', g, id + '.html'), recordPage(g, id, R, {base, analytics, slugOf}));
      if (base) extraUrls.push(`${base}records/${g}/${id}.html`);
    }
  }
  /* Window recaps, from the predictions recorded before kick-off. */
  fs.rmSync(path.join(root, 'records', 'recaps'), {recursive:true, force:true}); fs.mkdirSync(path.join(root, 'records', 'recaps'), {recursive:true});
  const recaps = recapWindows(forecasts.map(e => ({...e, tournament:model.compName(e.tournament)})), fixtures);
  for (const w of recaps){
    fs.writeFileSync(path.join(root, 'records', 'recaps', w.slug + '.html'), recapPage(w, {base, analytics}));
    if (base) extraUrls.push(`${base}records/recaps/${w.slug}.html`);
  }
  fs.writeFileSync(path.join(root, 'records', 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>International football records and forecast recaps – Formline</title>
<meta name="description" content="All-time records for men's and women's international football (biggest upsets, biggest wins, longest runs, every country's best-ever team) and how Formline's predictions did in each window.">
${base ? `<link rel="canonical" href="${base}records/index.html">` : ''}${STYLE_UP}${beacon(analytics)}</head><body><main>
<a class="brand" href="../index.html">Formline</a><h1>Records</h1>
<p class="muted"><a href="../teams/index.html">All teams</a> · <a href="../matches/index.html">Match predictions</a> · <a href="../h2h/index.html">Head to head</a></p>
${['men', 'women'].map(g => `<h2>${GAME[g][0].toUpperCase() + GAME[g].slice(1)} internationals</h2><ul>${RECORDS.map(([id, label]) => `<li><a href="${g}/${id}.html">${esc(label)}</a></li>`).join('')}</ul>`).join('')}
<h2>How the predictions did</h2>${recaps.length ? `<ul>${recaps.slice().reverse().map(w => `<li><a href="recaps/${w.slug}.html">${esc(w.label)} internationals</a>${w.open ? ' <span class="muted">(so far)</span>' : ''}</li>`).join('')}</ul>` :
  `<p class="muted">The first window recap appears once ${RECAP_MIN} predictions made before kick-off have been scored. Meanwhile, see the <a href="../index.html#/record">forecast record</a>.</p>`}
</main></body></html>
`);
  hub.recaps = recaps.length;
  fs.writeFileSync(path.join(root, 'pages.css'), CSS);
  fs.writeFileSync(PREVIEW_SPECS, JSON.stringify(specs));
  const hubHead = (title, desc, rel) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">${STYLE_UP}${beacon(analytics)}</head><body><main>
<a class="brand" href="${rel}index.html">Formline</a><h1>${esc(title.replace(/ – Formline$/, ''))}</h1>
<p class="muted"><a href="${rel}teams/index.html">All teams</a> · <a href="${rel}matches/index.html">Match predictions</a> · <a href="${rel}h2h/index.html">Head to head</a> · <a href="${rel}records/index.html">Records</a></p>`;
  const list = g => out[g].slice().sort((a, b) => a.team.localeCompare(b.team))
    .map(x => `<li><a href="${g}/${x.slug}.html">${esc(x.team)}</a>${x.rank ? ` <span class="muted">#${x.rank}</span>` : ''}</li>`).join('');
  fs.writeFileSync(path.join(root, 'teams', 'index.html'), hubHead('All national teams – Formline', "Ratings for every men's and women's national football team.", '../') +
`<h2>Men</h2><ul class="cols">${list('men')}</ul><h2>Women</h2><ul class="cols">${list('women')}</ul></main></body></html>
`);
  const mList = (g, up) => { const xs = hub.matches[g].filter(x => !x.result === up).sort((a, b) => up ? a.day.localeCompare(b.day) : b.day.localeCompare(a.day));
    let d = null; return xs.length ? '<table>' + xs.map(x => { const hd = x.day !== d ? `<tr><td class="yr" colspan="2">${dayName(x.day)}</td></tr>` : ''; d = x.day;
      return hd + `<tr><td><a href="${g}/${x.slug}.html">${esc(x.home)} ${x.result ? x.result[0] + '–' + x.result[1] : 'v'} ${esc(x.away)}</a> <span class="muted">· ${esc(x.comp)}</span></td>
<td class="n muted">${x.p.map(pct).join(' · ')}</td></tr>`; }).join('') + '</table>' : '<p class="muted">None at the moment.</p>'; };
  fs.mkdirSync(path.join(root, 'matches'), {recursive:true});
  fs.writeFileSync(path.join(root, 'matches', 'index.html'), hubHead('Match predictions – Formline',
    "Predictions for every upcoming men's and women's international, with head-to-head records, and how recent predictions turned out.", '../') +
`<p>Chances shown as home win · draw · away win (%).</p><h2>Men: coming up</h2>${mList('men', true)}<h2>Women: coming up</h2>${mList('women', true)}
<h2>Men: recent results</h2>${mList('men', false)}<h2>Women: recent results</h2>${mList('women', false)}</main></body></html>
`);
  const hList = (g, n) => '<table>' + hub.h2h[g].slice().sort((a, b) => b.n - a.n || a.a.localeCompare(b.a)).slice(0, n)
    .map(x => `<tr><td><a href="${g}/${x.slug}.html">${esc(x.a)} v ${esc(x.b)}</a></td><td class="n muted">${x.n} meetings</td></tr>`).join('') + '</table>';
  fs.mkdirSync(path.join(root, 'h2h'), {recursive:true});
  fs.writeFileSync(path.join(root, 'h2h', 'index.html'), hubHead('Head to head – Formline',
    "Head-to-head records for every pair of national teams that have ever met: every result since 1872.", '../') +
`<p>The most-played pairs. Every team page lists all its opponents, each with its own head-to-head page.</p><h2>Men</h2>${hList('men', 200)}<h2>Women</h2>${hList('women', 100)}</main></body></html>
`);
  if (base){
    const urls = [base, base + 'teams/index.html', base + 'matches/index.html', base + 'h2h/index.html', base + 'records/index.html',
      ...['men', 'women'].flatMap(g => out[g].map(x => `${base}teams/${g}/${x.slug}.html`)), ...extraUrls];
    fs.writeFileSync(path.join(root, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      urls.map(u => `  <url><loc>${esc(u)}</loc></url>`).join('\n') + `\n</urlset>\n`);
    fs.writeFileSync(path.join(root, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${base}sitemap.xml\n`);
  }
  return {men:out.men.length, women:out.women.length, matches:hub.matches.men.length + hub.matches.women.length,
    h2h:hub.h2h.men.length + hub.h2h.women.length, sim:hub.sim.length, recaps:hub.recaps || 0, previews:specs.length};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)){
  const base = siteBase(ROOT, process.env.GITHUB_REPOSITORY);
  const n = buildPages(ROOT, base);
  console.log(`Static pages: ${n.men} men's and ${n.women} women's teams, ${n.matches} matches, ${n.h2h} head-to-heads, ${n.sim} tournaments` + (base ? `, sitemap for ${base}` : ' (address unknown: no sitemap)'));
}
