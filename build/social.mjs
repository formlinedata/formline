// The daily social post: picks today's kind of post, gathers its facts from the site itself (build/social/collect.js runs
// inside the real page, so every number matches what the site shows), and draws it as
//   1.jpg, 2.jpg …  Instagram carousel slides, 1080×1350 (4:5), JPEG as Instagram's API requires
//   x.png           one wide 1200×675 image for X (Seb posts it by hand)
//   caption.txt     the Instagram caption;  x.txt  the X post (under 280 characters, with a link)
//   post.json       everything above plus the type and the id used to avoid repeats
//   cta.jpg         a closing slide for Instagram only (follow, save, share, the site)
// into $SOCIAL_OUT/<date>/; on international-window days also <date>-b/ (SOCIAL_SLOT=b, the 6 pm post) and <date>-c/
// (SOCIAL_SLOT=c, the 7 am results roundup of the day before).
// Needs Playwright (installed by the workflow).
//
//   SOCIAL_DATE=2026-11-08 SOCIAL_TYPE=rivalry SOCIAL_USED=used.json node build/social.mjs
//
// The week: Mon rankings · Tue team spotlight · Wed on this day · Thu tournament chances · Fri rivalry ·
// Sat match preview · Sun a tournament from the past. On other days a big match in the next two days (two top-25 men's
// sides, or two top-12 women's sides) takes the slot, but not if one of the last two posts was already a match.
// In an international window, a day with five or more forecast matches opens with "today's matches" instead.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {siteBase} from './site-url.mjs';
import {slugify} from './pages.mjs';

const ROOT = process.env.FORMLINE_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.SOCIAL_OUT || path.join(ROOT, '_social');
const BASE = siteBase(ROOT, process.env.GITHUB_REPOSITORY) || 'https://formlinedata.com/';
const torontoDate = () => new Date().toLocaleDateString('en-CA', {timeZone:'America/Toronto'});
const DATE = process.env.SOCIAL_DATE || torontoDate();
const WEEK = ['pastTournament', 'rankings', 'spotlight', 'onThisDay', 'tournament', 'rivalry', 'match'];   // Sun … Sat
const FALLBACK = ['match', 'spotlight', 'rivalry', 'pastTournament', 'rankings'];
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'}[c]));
const GAME = {men:"Men's", women:"Women's"};
const ord = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
const r0 = x => Math.round(x);
const pctTxt = x => x >= 99.5 && x < 100 ? '>99' : x > 0 && x < 0.5 ? '<1' : String(Math.round(x));
/* A kick-off in the two time zones the posts use, Toronto's and the UK's: "2:45 PM ET · 7:45 PM UK". refDay (YYYY-MM-DD) is
   the day the post gives for the match; a zone where it falls on another day gets its weekday: "7:30 PM ET · 12:30 AM UK (Fri)". */
export function koText(iso, refDay){
  const t = iso ? Date.parse(iso) : NaN; if (isNaN(t)) return '';
  const part = (tz, lab) => {
    const time = new Date(t).toLocaleTimeString('en-US', {hour:'numeric', minute:'2-digit', timeZone:tz}).replace(/[\u202f\u00a0]/g, ' ');
    const other = refDay && new Date(t).toLocaleDateString('en-CA', {timeZone:tz}) !== refDay;
    return `${time} ${lab}${other ? ` (${new Date(t).toLocaleDateString('en-GB', {weekday:'short', timeZone:tz})})` : ''}`; };
  return part('America/Toronto', 'ET') + ' · ' + part('Europe/London', 'UK');
}
const utcDay = iso => new Date(Date.parse(iso)).toISOString().slice(0, 10);
/* The largest type (px, between min and max) at which a row's longest line of text still fits: chars is its length, room
   the width left for text, extra what the flags cost per px of type. */
const fitFs = (chars, max, min, room, extra = 0) => Math.max(min, Math.min(max, Math.floor(room / (0.56 * Math.max(1, chars) + extra))));

/* ---------- hashtags ---------- */
const COMP_TAG = {'FIFA World Cup':'WorldCup', 'FIFA World Cup qualification':'WorldCupQualifiers', 'UEFA Nations League':'NationsLeague',
  'UEFA Euro':'EURO', 'UEFA Euro qualification':'EuroQualifiers', 'Copa América':'CopaAmerica', 'African Cup of Nations':'AFCON',
  'African Cup of Nations qualification':'AFCONQualifiers', 'AFC Asian Cup':'AsianCup', 'Gold Cup':'GoldCup',
  'CONCACAF Nations League':'ConcacafNationsLeague', 'SAFF Championship':'SAFFChampionship', "FIFA Women's World Cup":'FIFAWWC',
  "UEFA Women's Euro":'WEURO', "UEFA Women's Nations League":'UWNL', 'Friendly':'InternationalFriendly'};
const tag = s => '#' + String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, 'And').replace(/[^A-Za-z0-9]+/g, '');
/* Bluesky: 2–3 hashtags that its topic feeds pick up. The fans' own tag for a team where there is a well-known one, then
   the competition, then #WoSo for women's posts, then #football. */
const FAN_TAG = {
  men:{Canada:'CanMNT', USA:'USMNT', Mexico:'ElTri', Jamaica:'ReggaeBoyz', England:'ThreeLions', Scotland:'SCO', Wales:'TogetherStronger',
    'Republic of Ireland':'COYBIG', Australia:'Socceroos', 'New Zealand':'AllWhites', Japan:'SamuraiBlue', Brazil:'Selecao', Argentina:'Albiceleste',
    Netherlands:'Oranje', Nigeria:'SuperEagles', Ghana:'BlackStars', 'South Africa':'BafanaBafana', India:'BlueTigers', Italy:'Azzurri',
    Germany:'DieMannschaft', Spain:'LaRoja', Portugal:'Portugal', France:'EquipeDeFrance', Belgium:'RedDevils', 'Korea Republic':'KoreaRepublic', 'Ivory Coast':'LesElephants', Uruguay:'LaCeleste'},
  women:{Canada:'CanWNT', USA:'USWNT', England:'Lionesses', Australia:'Matildas', 'New Zealand':'FootballFerns', Japan:'Nadeshiko', Jamaica:'ReggaeGirlz',
    Nigeria:'SuperFalcons', 'South Africa':'BanyanaBanyana', Scotland:'SWNT', Spain:'LaRoja', Netherlands:'OranjeLeeuwinnen', Brazil:'Selecao'}};
const BSKY_COMP = {...COMP_TAG, 'FIFA World Cup qualification':'WCQ', 'Friendly':''};
export function bskyTags(g, teams, comp){
  const t = [];
  for (const x of teams) if (x && FAN_TAG[g][x]) t.push(FAN_TAG[g][x]);
  const ct = comp ? (BSKY_COMP[comp] ?? COMP_TAG[comp] ?? '') : '';
  if (ct) t.push(ct);
  t.push(g === 'women' ? 'WoSo' : 'football');
  if (g === 'women' && t.length < 3) t.push('football');
  if (t.length < 2) t.push('soccer');   // "football" alone also catches American football on Bluesky
  return [...new Set(t)].slice(0, 3);
}
/* Instagram: at most five, most specific first. Each team (its fans' own tag where there is a well-known one), the
   competition, #WoSo for women's posts, then one tag for what kind of post it is. */
const TOPIC_TAG = {match:'#MatchPreview', spotlight:'#FootballStats', onthisday:'#OnThisDay', rivalry:'#HeadToHead',
  tournament:'#FootballPredictions', past:'#FootballHistory', rankings:'#FootballRankings', roundup:'#FootballResults', today:'#FootballPredictions'};
function hashtags(g, teams, comp, topic){
  const rest = [comp && COMP_TAG[comp] ? '#' + COMP_TAG[comp] : '', g === 'women' ? '#WoSo' : '', TOPIC_TAG[topic] || ''].filter(Boolean);
  const t = [...new Set(teams.filter(Boolean).map(x => FAN_TAG[g][x] ? '#' + FAN_TAG[g][x] : tag(x)))].slice(0, 5 - rest.length);
  return [...new Set(t.concat(rest))].join(' ');
}

/* ---------- slide drawing ---------- */
const LOGO = '<svg viewBox="0 0 32 32" width="48" height="48"><path d="M3 26.5 10.5 21 17 24.5 29 12.5V3.5L17 15 10.5 12 3 18Z" fill="rgba(246,182,56,.25)"/>' +
  '<path d="M3 22.5 10.5 16.5 17 19.8 29 8" fill="none" stroke="#f1f4ec" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="29" cy="8" r="3" fill="#f6b638"/></svg>';
const CSS = `*{box-sizing:border-box;margin:0;padding:0}
html,body{width:var(--W);height:var(--H);overflow:hidden}
body{background:#0e2117;color:#f1f4ec;font-family:Archivo,system-ui,sans-serif;position:relative;font-variant-numeric:tabular-nums}
.pg{position:absolute;inset:0;padding:var(--pt,64px) var(--px,92px) 0;display:flex;flex-direction:column}
.ct{flex:1;display:flex;flex-direction:column;justify-content:center;padding-bottom:var(--fb,150px)}
.brand{display:flex;align-items:center;gap:12px;font-weight:800;font-size:32px}
.foot{position:absolute;left:var(--px,92px);right:var(--px,92px);bottom:var(--fbot,52px);border-top:1.5px solid #2a4a37;padding-top:18px;display:flex;justify-content:space-between;font-size:23px;color:#a7bba9}
.foot b{color:#f6b638;font-weight:600}
.kick{color:#f6b638;font-weight:700;font-size:24px;letter-spacing:.07em;text-transform:uppercase}
h1{font-weight:800;font-stretch:118%;letter-spacing:-.015em;line-height:1.02;font-size:76px;margin-top:14px}
h2{font-weight:800;font-stretch:112%;font-size:46px;line-height:1.1;margin-top:10px}
.hook{font-weight:800;font-stretch:118%;font-size:62px;line-height:1.04;letter-spacing:-.012em;margin:0 0 30px;max-width:900px;text-wrap:balance}
.hook em{font-style:normal;color:#f6b638}
.dim{color:#a7bba9}.body{color:#d9e2da;font-size:28px;line-height:1.45}
.fl{display:inline-block;border-radius:6px;box-shadow:0 0 0 1.5px rgba(255,255,255,.16);vertical-align:middle;object-fit:cover}
.flb{display:inline-flex;align-items:center;justify-content:center;flex:none;vertical-align:middle}
.match{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:20px;margin-top:34px}
.side{display:flex;flex-direction:column;align-items:center;gap:16px;font-weight:800;font-size:44px;font-stretch:112%;text-align:center;line-height:1.05}
.side small{display:block;font-size:22px;font-weight:600;color:#a7bba9;font-stretch:100%;margin-top:4px}
.vs{color:#a7bba9;font-size:32px;font-weight:600}
.score{font-size:120px;font-weight:800;font-stretch:112%;color:#f6b638;white-space:nowrap}
.lab{color:#a7bba9;font-weight:700;font-size:21px;letter-spacing:.08em;text-transform:uppercase;margin-bottom:14px}
.box{background:#14301f;border:1.5px solid #2a4a37;border-radius:18px;padding:26px 30px;margin-top:30px}
.pick{display:flex;height:70px;border-radius:12px;overflow:hidden;gap:3px}
.pick div{display:flex;align-items:center;justify-content:center;font-weight:800;font-size:28px;color:#0e2117;white-space:nowrap;min-width:64px}
.pa{background:#f6b638}.pb{background:#7cc0ff}.pd{background:#3e6650;color:#f1f4ec!important}
.pk{display:flex;justify-content:space-between;font-size:22px;color:#a7bba9;margin-top:12px}
.rec{display:grid;grid-template-columns:1fr auto 1fr;align-items:end;gap:14px;text-align:center}
.rec .n{font-size:96px;font-weight:800;line-height:1}.rec .t{font-size:23px;color:#d9e2da;margin-top:8px}
.a{color:#f6b638}.b{color:#7cc0ff}
.bar{display:flex;gap:4px;height:16px;margin:20px 0 12px}.bar span{border-radius:4px}
.sa{background:#f6b638}.sb{background:#7cc0ff}.sd{background:#3e6650}
.row{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:20px;padding:14px 0;border-top:1.5px solid #2a4a37;font-size:31px;font-weight:650}
.row:first-child{border-top:0}.row .n{color:#7e9584;font-size:24px;width:34px}.row .v{font-weight:800;color:#f6b638}
.meter{height:10px;background:#2a4a37;border-radius:5px;margin-top:8px;overflow:hidden}.meter span{display:block;height:100%;background:#f6b638;border-radius:5px}
.chip{display:inline-flex;align-items:center;justify-content:center;width:46px;height:46px;border-radius:10px;font-weight:800;font-size:24px;color:#0e2117}
.W{background:#5fcf8a}.D{background:#a7bba9}.L{background:#f08a7a}
.facts{font-size:28px;line-height:1.5;color:#d9e2da}.facts li{margin:0 0 14px 28px}.facts b{color:#f1f4ec}
.big{font-size:150px;font-weight:800;font-stretch:112%;color:#f6b638;line-height:1}
.note{font-size:20px;color:#89a291;margin-top:18px}
.sub{display:block;font-size:21px;font-weight:500;color:#a7bba9;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.row>span{min-width:0}
.ell{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:0 44px}
.gbox{background:#14301f;border:1.5px solid #2a4a37;border-radius:16px;padding:12px 20px}
.gt{display:flex;align-items:center;gap:12px;font-size:25px;font-weight:650;padding:6px 0;border-top:1px solid #23402f;min-width:0}
.gt:first-child{border-top:0}.gt.ch{color:#f6b638;font-weight:800}
.stg{color:#a7bba9;font-size:21px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;width:120px;flex:none}
.dec{display:grid;grid-template-columns:96px 1fr 150px;align-items:center;gap:18px;padding:8px 0;font-size:25px}
.dec .bar{margin:0;height:26px}.dec .bar span{display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:800;color:#0e2117;overflow:hidden}`;
const flagImg = (f, h) => f && f.src ? `<img class="fl" src="${esc(f.src)}" style="height:${h}px;width:${r0(h * (f.ar || 1.5))}px" alt="">` : '';
/* A flag at the start of a list row: every flag sits in a slot of the same width (3:2), so the names after it line up.
   Wider flags (2:1, 5:3) are fitted to the slot's width and come out a little shorter; narrower ones are centred. */
const flagBox = (f, h) => { if (!f || !f.src) return ''; const W = r0(h * 1.5), ar = f.ar || 1.5, wide = ar > 1.5;
  return `<span class="flb" style="width:${W}px;height:${h}px"><img class="fl" src="${esc(f.src)}" style="height:${wide ? r0(W / ar) : h}px;width:${wide ? W : r0(h * ar)}px" alt=""></span>`; };
const page = (W, H, inner, o = {}) => `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="../vendor/fonts.css"><style>:root{--W:${W}px;--H:${H}px${o.vars || ''}}${CSS}</style></head><body><div class="pg">` +
  `<div class="brand">${LOGO}Formline</div><div class="ct">${inner}</div></div>` +
  `<div class="foot"><b>${esc(BASE.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</b><span>${esc(o.right || 'Rankings updated every night')}</span></div></body></html>`;
const slide = inner => page(1080, 1350, inner);
const wide = inner => page(1200, 675, inner, {vars:';--pt:40px;--px:60px;--fb:70px;--fbot:30px'});
const pickBar = (p, A, B) => `<div class="pick"><div class="pa" style="flex:${p[0]}">${p[0]}%</div><div class="pd" style="flex:${p[1]}">${p[1]}%</div><div class="pb" style="flex:${p[2]}">${p[2]}%</div></div>
<div class="pk"><span class="a">${esc(A)} win</span><span>Draw</span><span class="b">${esc(B)} win</span></div>`;
const recBlock = (A, B, w, d, l, n) => `<div class="rec"><div><div class="n a">${w}</div><div class="t">${esc(A)} wins</div></div><div><div class="n dim">${d}</div><div class="t">draws</div></div><div><div class="n b">${l}</div><div class="t">${esc(B)} wins</div></div></div>
<div class="bar"><span class="sa" style="flex:${w || 0.01}"></span><span class="sd" style="flex:${d || 0.01}"></span><span class="sb" style="flex:${l || 0.01}"></span></div>`;
/* The cover's opening line: a question or a fact to stop the scroll, left-aligned above everything else. */
const hook = t => t ? `<div class="hook">${t}</div>` : '';
/* The last Instagram slide: what to do next. Not sent to Bluesky. */
const ctaSlide = share => slide(`<div class="kick">Formline</div><div class="hook" style="margin-top:16px">Every national team, <em>rated every night</em></div>
<ul class="facts" style="margin-top:20px;font-size:32px">
<li><b>Follow @formline.data</b> for match previews, rankings and the stories behind the numbers</li>
${share ? `<li><b>Send this to ${esc(share)}</b></li>` : ''}<li><b>Save this post</b> to come back to it</li>
<li><b>formlinedata.com</b>: every team's rating, every fixture's chances, and the Simulator</li></ul>`);
const venue = x => [x.city, x.country && x.country !== x.city ? x.country : ''].filter(Boolean).join(', ');
/* A fixture row: flags and names, a small line under them, and on the right Formline's pick with its chance. */
const pickRow = (x, fs, sub) => { const fav = x.call === 1 ? 'Draw' : (x.call === 0 ? x.home : x.away);
  return `<div class="row" style="grid-template-columns:1fr auto;padding:${r0(fs * 0.4)}px 0;font-size:${fs}px"><span style="min-width:0"><span class="ell" style="display:flex;align-items:center;gap:12px">${flagBox(x.hf, fs + 2)}${esc(x.home)} <span class="dim">v</span> ${esc(x.away)}${flagImg(x.af, fs + 2)}</span><span class="sub" style="font-size:${r0(fs * 0.66)}px">${esc(sub || '')}</span></span><span style="text-align:right"><span class="v">${x.p[x.call]}%</span><span class="sub" style="font-size:${r0(fs * 0.62)}px;text-align:right">${esc(fav)}</span></span></div>`; };
const pickPage = inner => page(1080, 1350, inner, {right:'Formline\'s pick and its chance'});
/* A team's flag as an emoji for the post text, with a space after it (nothing when there's no emoji for that flag). */
const fe = f => f && f.emo ? f.emo + ' ' : '';
const STAGE_SHORT = st => String(st || '').replace(/^Group stage$/, 'Group').replace(/^Round of (\d+)/, 'R$1').replace(/^Quarter-final/, 'QF')
  .replace(/^Semi-final/, 'SF').replace(/^Third place$/, '3rd place').replace(/, 1st leg$/, ' (1st leg)').replace(/, 2nd leg$/, ' (2nd leg)');
/* Rating over time as an SVG line, with the peak and the low marked. */
function ratingChart(ch, W = 896, H = 560){
  const P = {l:80, r:24, t:30, b:56}, w = W - P.l - P.r, h = H - P.t - P.b;
  const lo = Math.min(...ch.pts.map(p => p.r)), hi = Math.max(...ch.pts.map(p => p.r));
  const step = hi - lo > 400 ? 100 : 50, y0 = Math.floor((lo - 20) / step) * step, y1 = Math.ceil((hi + 20) / step) * step;
  const X = ts => P.l + (ts - ch.from) / (ch.to - ch.from) * w, Y = r => P.t + (1 - (r - y0) / (y1 - y0)) * h;
  let g = '';
  for (let v = y0; v <= y1; v += step) g += `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="#2a4a37" stroke-width="1.5"/><text x="${P.l - 14}" y="${Y(v) + 8}" fill="#89a291" font-size="22" text-anchor="end">${v}</text>`;
  const ya = new Date(ch.from).getUTCFullYear() + 1, yb = new Date(ch.to).getUTCFullYear();
  for (let y = ya; y <= yb; y += yb - ya > 8 ? 2 : 1){ const x = X(Date.UTC(y, 0, 1)); g += `<text x="${x}" y="${H - 16}" fill="#89a291" font-size="22" text-anchor="middle">${y}</text>`; }
  const line = ch.pts.map((p, i) => (i ? 'L' : 'M') + X(p.ts).toFixed(1) + ' ' + Y(p.r).toFixed(1)).join(' ');
  const area = line + ` L${X(ch.pts[ch.pts.length - 1].ts).toFixed(1)} ${P.t + h} L${X(ch.pts[0].ts).toFixed(1)} ${P.t + h} Z`;
  const mark = (q, col, lab, up) => { const x = X(q.ts), y = Y(q.r), tx = Math.min(Math.max(x, P.l + 70), W - P.r - 70);
    return `<circle cx="${x}" cy="${y}" r="9" fill="${col}" stroke="#0e2117" stroke-width="3"/><text x="${tx}" y="${up ? y - 22 : y + 40}" fill="${col}" font-size="24" font-weight="800" text-anchor="middle">${lab} ${q.r}</text>`; };
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;font-family:Archivo,sans-serif">${g}<path d="${area}" fill="rgba(246,182,56,.12)"/>` +
    `<path d="${line}" fill="none" stroke="#f6b638" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>` +
    mark(ch.peak, '#5fcf8a', 'Peak', true) + mark(ch.low, '#f08a7a', 'Low', false) + `</svg>`;
}
const shortDay = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', {day:'numeric', month:'short', year:'numeric', timeZone:'UTC'});
const teamUrl = (g, t) => `${BASE}teams/${g}/${slugify(t)}.html`;

/* ---------- each kind of post ---------- */
const BUILD = {
  match(d){
    const A = d.home.team, B = d.away.team, h = d.h2h, url = `${BASE}matches/${d.g}/${d.date}-${slugify(A)}-vs-${slugify(B)}.html`;
    const top = d.pr.p.indexOf(Math.max(...d.pr.p)), fav = [A + ' are favourites', 'A draw is the most likely result', B + ' are favourites'][top];
    const eA = fe(d.home.flag), eB = fe(d.away.flag);
    const pf = Math.max(d.pr.p[0], d.pr.p[2]), favT = d.pr.p[0] >= d.pr.p[2] ? A : B, dogT = favT === A ? B : A;
    const hk = top !== 1 && pf >= 55 ? `Can ${esc(dogT)} stop <em>${esc(favT)}</em>?` : `${esc(A)} v ${esc(B)}: <em>too close to call?</em>`;
    const ko = d.kickoff ? koText(d.kickoff, utcDay(d.kickoff)) : '';
    const s1 = slide(`${hook(hk)}<div class="kick">${esc(d.comp)} · ${esc(d.day)}</div>${ko ? `<div class="body dim" style="font-size:26px;margin-top:8px">Kick-off ${esc(ko)}</div>` : ''}
<div class="match"><div class="side">${flagImg(d.home.flag, 120)}${esc(A)}<small>${d.home.rank ? 'Ranked ' + ord(d.home.rank) : ''}</small></div><div class="vs">v</div>
<div class="side">${flagImg(d.away.flag, 120)}${esc(B)}<small>${d.away.rank ? 'Ranked ' + ord(d.away.rank) : ''}</small></div></div>
<div class="box"><div class="lab">Formline's chances</div>${pickBar(d.pr.p, A, B)}<div class="body" style="margin-top:18px">Most likely score <b>${esc(d.pr.likely)}</b>${venue(d) ? ' · ' + esc(venue(d)) : ''}</div></div>`);
    const s2 = slide(`<div class="kick">Head to head · ${GAME[d.g]}</div><h2>${esc(A)} v ${esc(B)}</h2>
${h.n ? `<div class="box">${recBlock(A, B, h.w, h.d, h.l, h.n)}<div class="body dim" style="font-size:24px">${h.n} meeting${h.n === 1 ? '' : 's'} · goals ${h.gf}–${h.ga}</div></div>
<div class="lab" style="margin-top:34px">Last meetings</div>${h.last.map(m => `<div class="row" style="grid-template-columns:auto 1fr"><span class="dim" style="font-size:24px">${m.year}</span><span>${esc(m.home)} ${m.hs}–${m.as} ${esc(m.away)}<span class="sub">${esc(m.comp)}</span></span></div>`).join('')}`
  : `<p class="body" style="margin-top:30px">This will be the first meeting on record between ${esc(A)} and ${esc(B)}.</p>`}`);
    /* Form: each side's last five, next to each other. */
    const formCol = (T, cls) => `<div style="min-width:0"><div style="display:flex;align-items:center;gap:14px;font-size:34px;font-weight:800;font-stretch:112%">${flagImg(T.flag, 44)}<span class="ell">${esc(T.team)}</span></div>
<div class="body" style="font-size:23px;margin:10px 0 14px"><b class="${cls}">${T.rating}</b>${T.rank ? ` · ${ord(T.rank)}` : ''}${T.change != null ? ` · ${T.change > 0 ? '+' : T.change < 0 ? '−' : '±'}${Math.abs(T.change)} on a year ago` : ''}</div>
${(T.form || []).map(m => `<div class="gt" style="font-size:26px;gap:12px;padding:9px 0"><span class="chip ${m.r}" style="width:42px;height:42px;font-size:22px;flex:none">${m.r}</span><span class="ell" style="flex:1">v ${esc(m.opp)}<span class="sub" style="font-size:19px">${esc(m.comp)}, ${m.year}</span></span><b style="flex:none">${m.gf}–${m.ga}</b></div>`).join('')}</div>`;
    const s3 = slide(`<div class="kick">Form guide · last five results</div><h2>Who's in form?</h2>
<div class="cols" style="margin-top:34px">${formCol(d.home, 'a')}${formCol(d.away, 'b')}</div>
<p class="note">Rating and rank on Formline today; change against a year ago.</p>`);
    const x = wide(`<div class="kick" style="font-size:20px">${esc(d.comp)} · ${esc(d.day)}${ko ? ' · ' + esc(ko) : ''}</div>
<div class="match" style="margin-top:18px"><div class="side" style="font-size:34px;gap:10px">${flagImg(d.home.flag, 72)}${esc(A)}</div><div class="vs">v</div><div class="side" style="font-size:34px;gap:10px">${flagImg(d.away.flag, 72)}${esc(B)}</div></div>
<div style="margin-top:22px">${pickBar(d.pr.p, A, B)}</div>`);
    const h2hTxt = h.n ? `🤝 All-time: ${A} ${h.w} win${h.w === 1 ? '' : 's'}, ${h.d} draw${h.d === 1 ? '' : 's'}, ${B} ${h.l} win${h.l === 1 ? '' : 's'} (${h.n} meetings).` : `🆕 It will be their first meeting on record.`;
    const formTxt = T => (T.form || []).map(m => m.r).join('');
    const alts = [`${d.comp}, ${d.day}: ${A}${d.home.rank ? ` (ranked ${ord(d.home.rank)})` : ''} v ${B}${d.away.rank ? ` (ranked ${ord(d.away.rank)})` : ''}${venue(d) ? `, in ${venue(d)}` : ''}${ko ? `, kick-off ${ko.replace(' · ', ', ')}` : ''}. Formline's chances: ${A} win ${d.pr.p[0]}%, draw ${d.pr.p[1]}%, ${B} win ${d.pr.p[2]}%. Most likely score ${d.pr.likely}.`,
      h.n ? `Head to head, ${A} v ${B} (${GAME[d.g].toLowerCase()}): ${h.n} meetings, ${A} ${h.w} wins, ${h.d} draws, ${B} ${h.l} wins, goals ${h.gf}–${h.ga}. Last meetings: ${h.last.map(m => `${m.year}, ${m.home} ${m.hs}–${m.as} ${m.away} (${m.comp})`).join('; ')}.`
        : `Head to head, ${A} v ${B}: this will be their first meeting on record.`,
      `Form guide, last five results. ${[d.home, d.away].map(T => `${T.team} (rating ${T.rating}${T.rank ? `, ${ord(T.rank)}` : ''}): ${(T.form || []).map(m => `${{W:'won', D:'drew', L:'lost'}[m.r]} ${m.gf}–${m.ga} v ${m.opp}`).join('; ')}`).join('. ')}.`];
    return {title:`${A} v ${B} preview`, slides:[s1, s2, s3], x, alts,
      caption:`${A} v ${B} prediction: ${d.comp}, ${d.day} ${(eA + eB).trim()}${eA || eB ? ' ' : ''}🗓️${ko ? `\n⏰ Kick-off ${ko}` : ''}\n\n📊 ${fav}. Formline's chances: ${A} ${d.pr.p[0]}%, draw ${d.pr.p[1]}%, ${B} ${d.pr.p[2]}%. Most likely score ${d.pr.likely}.\n\n${h2hTxt}\n\n🔥 Last five: ${A} ${formTxt(d.home)}, ${B} ${formTxt(d.away)}.\n\nWho are you backing? 👇 Every upcoming match has a preview on Formline (link in bio).\n\n${hashtags(d.g, [A, B], d.comp, 'match')}`,
      xText:`${eA}${A} v ${B} ${eB}· ${d.day}\n\n📊 ${A} ${d.pr.p[0]}% · Draw ${d.pr.p[1]}% · ${B} ${d.pr.p[2]}%\n🎯 Most likely: ${d.pr.likely}\n${h.n ? `🤝 Head to head: ${h.w}–${h.d}–${h.l}` : '🆕 First meeting on record'}\n\n${url}`};
  },
  spotlight(d){
    const T = d.team, t = T.team, url = teamUrl(d.g, t), eT = fe(T.flag);
    const chg = d.change == null ? '' : d.change > 0 ? `Up ${d.change} points on a year ago` : d.change < 0 ? `Down ${-d.change} points on a year ago` : 'Level with a year ago';
    const s1 = slide(`${hook(`How good are <em>${esc(t)}</em> right now?`)}<div class="kick">Team spotlight · ${GAME[d.g]}</div>
<div style="margin-top:24px">${flagImg(T.flag, 140)}</div><h1>${esc(t)}</h1>
<div style="display:flex;gap:60px;margin-top:40px;align-items:flex-end"><div><div class="lab">Rating</div><div class="big">${T.rating}</div></div>
<div><div class="lab">Rank</div><div class="big" style="color:#f1f4ec">${T.rank ? ord(T.rank) : '–'}</div></div></div>
<p class="body" style="margin-top:26px">${T.rank ? `${ord(T.rank)} of ${T.ranked} ranked teams` : 'Not ranked yet'}${T.conf ? ' · ' + esc(T.conf) : ''}${chg ? '<br>' + esc(chg) : ''}</p>`);
    const s2 = slide(`<div class="kick">${esc(t)} · form and rivals</div>
<div class="lab" style="margin-top:30px">Last five results</div>${d.last5.map(m => `<div class="row"><span class="chip ${m.r}">${m.r}</span><span>v ${esc(m.opp)}<span class="sub">${esc(m.comp)}</span></span><span>${m.gf}–${m.ga}</span></div>`).join('')}
${d.rival ? `<div class="box"><div class="lab">Most-played opponent: ${esc(d.rival.opp)}</div><div class="body">${d.rival.n} meetings: ${esc(t)} won <b>${d.rival.w}</b>, drew ${d.rival.d}, lost ${d.rival.l}</div></div>` : ''}
${d.next && d.next.pr ? `<div class="box" style="margin-top:20px"><div class="lab">Next: ${esc(d.next.home)} v ${esc(d.next.away)}, ${esc(d.next.day)}</div>${pickBar(d.next.pr.p, d.next.home, d.next.away)}</div>` : ''}`);
    const C = d.chart, yr = s => s.slice(0, 4);
    const s3 = C ? slide(`<div class="kick">${esc(t)} · since ${new Date(C.from).getUTCFullYear()}</div><h2>Rating over time</h2>
<div style="margin-top:30px">${ratingChart(C)}</div>
<p class="body" style="margin-top:20px;font-size:26px"><b style="color:#5fcf8a">Peak ${C.peak.r}</b> on ${esc(shortDay(C.peak.date))} · <b style="color:#f08a7a">low ${C.low.r}</b> on ${esc(shortDay(C.low.date))} · <b class="a">now ${T.rating}</b></p>`) : null;
    const x = wide(`<div style="display:flex;gap:40px;align-items:center;margin-top:10px">${flagImg(T.flag, 130)}<div><div class="kick" style="font-size:20px">Team spotlight · ${GAME[d.g]}</div><h1 style="font-size:64px">${esc(t)}</h1></div></div>
<div style="display:flex;gap:50px;margin-top:30px;align-items:flex-end"><div><div class="lab">Rating</div><div class="big" style="font-size:96px">${T.rating}</div></div><div><div class="lab">Rank</div><div class="big" style="font-size:96px;color:#f1f4ec">${T.rank ? ord(T.rank) : '–'}</div></div>
<div><div class="lab">Last five</div><div style="display:flex;gap:8px">${d.last5.map(m => `<span class="chip ${m.r}">${m.r}</span>`).join('')}</div></div></div>`);
    const form = d.last5.map(m => m.r).join('');
    const alts = [`Team spotlight: ${t} (${GAME[d.g].toLowerCase()}). Rating ${T.rating}${T.rank ? `, ranked ${ord(T.rank)} of ${T.ranked}` : ', not ranked yet'}${T.conf ? `, ${T.conf}` : ''}.${chg ? ' ' + chg + '.' : ''}`,
      `${t}'s last five results: ${d.last5.map(m => `${{W:'won', D:'drew', L:'lost'}[m.r]} ${m.gf}–${m.ga} v ${m.opp} (${m.comp})`).join('; ')}.${d.rival ? ` Most-played opponent: ${d.rival.opp}, ${d.rival.n} meetings, ${d.rival.w} wins, ${d.rival.d} draws, ${d.rival.l} defeats.` : ''}${d.next && d.next.pr ? ` Next: ${d.next.home} v ${d.next.away}, ${d.next.day}; chances ${d.next.home} ${d.next.pr.p[0]}%, draw ${d.next.pr.p[1]}%, ${d.next.away} ${d.next.pr.p[2]}%.` : ''}`];
    if (C) alts.push(`Line chart of ${t}'s Formline rating since ${new Date(C.from).getUTCFullYear()}. Peak ${C.peak.r} on ${shortDay(C.peak.date)}, low ${C.low.r} on ${shortDay(C.low.date)}, now ${T.rating}.`);
    return {title:`${t} spotlight`, slides:[s1, s2, s3].filter(Boolean), x, alts,
      caption:`${t} ${d.g === 'women' ? "women's" : "men's"} national team: rating, ranking and form ${eT}🔦\n\n📊 Rated ${T.rating}${T.rank ? `, ${ord(T.rank)} of ${T.ranked}` : ''}${chg ? `. ${chg} ${d.change > 0 ? '📈' : d.change < 0 ? '📉' : ''}`.trimEnd() : ''}. Last five: ${form}.${C ? `\n\n⛰️ Best since ${new Date(C.from).getUTCFullYear()}: ${C.peak.r} (${yr(C.peak.date)}). Lowest: ${C.low.r} (${yr(C.low.date)}).` : ''}${d.rival ? `\n\n⚔️ Most-played opponent: ${fe(d.rival.oppFlag)}${d.rival.opp}, ${d.rival.n} meetings (${d.rival.w} wins, ${d.rival.d} draws, ${d.rival.l} defeats).` : ''}${d.next && d.next.pr ? `\n\n🗓️ Next up: ${d.next.home} v ${d.next.away}, ${d.next.day}.` : ''}\n\nEvery team has its own page on Formline (link in bio) 👆\n\n${hashtags(d.g, [t], d.next ? d.next.comp : null, 'spotlight')}`,
      xText:`🔦 Team spotlight: ${eT}${t}\n\n📊 Rating ${T.rating}${T.rank ? ` · ${ord(T.rank)} of ${T.ranked}` : ''}\n🔥 Last five: ${form}${C ? `\n⛰️ Peak since ${new Date(C.from).getUTCFullYear()}: ${C.peak.r} (${yr(C.peak.date)})` : ''}${d.rival ? `\n⚔️ v ${d.rival.opp}: ${d.rival.w}–${d.rival.d}–${d.rival.l} in ${d.rival.n}` : ''}\n\n${url}`};
  },
  onthisday(d){
    const H = d.home.name, A = d.away.name, winner = d.hs > d.as ? H : d.hs < d.as ? A : d.pen, tie = d.mode === 'tiein', N = d.next;
    const wp = d.p ? (d.hs > d.as ? d.p[0] : d.hs < d.as ? d.p[2] : null) : null;
    const stage = d.stage && !/group/i.test(d.stage) ? d.stage.replace(/s$/, '').replace(/-finals?$/, '-final') : '';
    const what = `${d.comp} ${d.edition}${stage ? ', ' + stage.toLowerCase() : ''}`;
    const eH = fe(d.home.flag), eA = fe(d.away.flag), C = d.ctx || {};
    const kick1 = tie ? `Before they meet again · ${esc(N.day)}` : `On this day · ${d.yearsAgo} years ago${d.g === 'women' ? " · Women's" : ''}`;
    const loser = winner ? (winner === H ? A : H) : '';
    const hk = tie ? `Before they meet again: <em>remember ${d.year}?</em>` : wp != null && wp < 35 ? `${esc(winner)} had a ${wp}% chance. <em>They won.</em>`
      : winner ? `The day ${esc(winner)} beat <em>${esc(loser)}</em>` : `${esc(H)} v ${esc(A)}: <em>honours even</em>`;
    const s1 = slide(`${hook(hk)}<div class="kick">${kick1}</div><h2 style="margin-top:16px">${tie ? `${d.year}: ` : ''}${esc(what)}</h2>
<div class="match"><div class="side">${flagImg(d.home.flag, 120)}${esc(H)}</div><div class="score">${d.hs}–${d.as}</div><div class="side">${flagImg(d.away.flag, 120)}${esc(A)}</div></div>
<p class="body" style="margin-top:30px;text-align:center">${esc(shortDay(d.date))}${venue(d) ? ' · ' + esc(venue(d)) : ''}${d.pen ? `<br>${esc(d.pen)} won on penalties` : ''}</p>`);
    const s2 = slide(`<div class="kick">${esc(H)} v ${esc(A)}, ${d.year}</div>
${d.p ? `<div class="box"><div class="lab">Chances before kick-off</div>${pickBar(d.p, H, A)}</div>
<p class="body" style="margin-top:26px">${wp != null && wp < 35 ? `<b>${esc(winner)}</b> were given just a <b>${wp}%</b> chance of winning, going by the ratings at the time.` : winner ? `<b>${esc(winner)}</b> were ${wp != null && wp >= 50 ? 'the favourites' : 'given a ' + wp + '% chance'} going in.` : 'Honours even.'}</p>` : ''}
${d.h2h.n > 1 ? `<div class="box"><div class="lab">All-time between them</div>${recBlock(d.home.modern, d.away.modern, d.h2h.w, d.h2h.d, d.h2h.l, d.h2h.n)}<div class="body dim" style="font-size:24px">${d.h2h.n} meetings</div></div>` : ''}`);
    /* How the tournament ended, and its biggest shock */
    const E = C.ended, U = C.upset;
    const s3 = E || U ? slide(`<div class="kick">${esc(d.comp)} ${esc(d.edition)}</div><h2>How it ended</h2>
${E ? `<div class="box" style="display:flex;align-items:center;gap:26px">${flagImg(E.champFlag, 90)}<div><div class="lab">Champions</div><div style="font-size:44px;font-weight:800;font-stretch:112%">${esc(E.champ)}</div>
${E.final ? `<div class="body" style="font-size:25px">Final: ${esc(E.final.home)} ${E.final.hs}–${E.final.as} ${esc(E.final.away)}${E.final.pen ? ` (${esc(E.final.pen)} on pens)` : ''}</div>` : ''}</div></div>
${(E.home && E.home !== 'won it') || (E.away && E.away !== 'won it') ? `<ul class="facts" style="margin-top:22px">${E.home && E.home !== 'won it' ? `<li><b>${esc(d.home.modern)}</b> ${esc(E.home)}</li>` : ''}${E.away && E.away !== 'won it' ? `<li><b>${esc(d.away.modern)}</b> ${esc(E.away)}</li>` : ''}</ul>` : ''}` : ''}
${U ? `<div class="box" style="margin-top:22px;display:grid;grid-template-columns:1fr auto;align-items:center;gap:24px"><div style="min-width:0"><div class="lab">That tournament's biggest upset</div>
<div style="display:flex;align-items:center;gap:14px;font-size:30px;font-weight:800">${flagBox(U.winFlag, 34)}<span class="ell">${esc(U.home)} ${U.hs}–${U.as} ${esc(U.away)}</span></div>
<div class="body" style="font-size:23px;margin-top:4px">${esc(U.stage ? U.stage.toLowerCase() : '')}</div></div><div style="text-align:right"><div class="big" style="font-size:68px">${U.wp}%</div><div class="dim" style="font-size:19px">${esc(U.winner)}'s chance</div></div></div>` : ''}`) : null;
    /* Then v now, and every meeting since */
    const T = C.then || {}, W = C.now || {}, S = C.since;
    const tv = (t, now) => `<span>${t && t.rank ? ord(t.rank) : t ? '–' : 'n/a'}<span class="sub" style="font-size:20px">${t ? t.rating : ''}</span></span><span>${now && now.rank ? ord(now.rank) : now ? '–' : 'n/a'}<span class="sub" style="font-size:20px">${now ? now.rating : ''}</span></span>`;
    const s4 = (T.home || T.away) ? slide(`<div class="kick">${esc(d.home.modern)} v ${esc(d.away.modern)}</div><h2>Then and now</h2>
<div class="row" style="grid-template-columns:1fr 200px 200px;margin-top:26px;font-size:21px;color:#a7bba9;font-weight:700;letter-spacing:.06em;text-transform:uppercase;border:0"><span></span><span>${d.year}</span><span>Today</span></div>
<div class="row" style="grid-template-columns:1fr 200px 200px;font-size:30px"><span style="display:flex;align-items:center;gap:14px">${flagBox(d.home.flag, 36)}${esc(d.home.modern)}</span>${tv(T.home, W.home)}</div>
<div class="row" style="grid-template-columns:1fr 200px 200px;font-size:30px"><span style="display:flex;align-items:center;gap:14px">${flagBox(d.away.flag, 36)}${esc(d.away.modern)}</span>${tv(T.away, W.away)}</div>
<p class="body dim" style="font-size:21px;margin-top:8px">World rank, with the Formline rating under it</p>
${S && S.n ? `<div class="box" style="margin-top:20px"><div class="lab">Since then: ${S.n} meeting${S.n === 1 ? '' : 's'}</div>${recBlock(d.home.modern, d.away.modern, S.w, S.d, S.l, S.n)}
${S.last.map(m => `<div class="body" style="font-size:23px">${m.year}: ${esc(m.home)} ${m.hs}–${m.as} ${esc(m.away)} <span class="dim">(${esc(m.comp)})</span></div>`).join('')}</div>`
  : `<p class="body" style="margin-top:22px">They haven't met since${tie ? ', until now' : ''}.</p>`}
${tie && N && N.pr ? `<div class="box" style="margin-top:20px"><div class="lab">Next: ${esc(N.home)} v ${esc(N.away)}, ${esc(N.day)}</div>${pickBar(N.pr.p, N.home, N.away)}</div>` : ''}`) : null;
    const x = wide(`<div class="kick" style="font-size:20px">${tie ? `Before they meet again · ${d.year}` : `On this day, ${d.year}`} · ${esc(what)}</div>
<div class="match" style="margin-top:20px"><div class="side" style="font-size:34px;gap:10px">${flagImg(d.home.flag, 80)}${esc(H)}</div><div class="score" style="font-size:96px">${d.hs}–${d.as}</div><div class="side" style="font-size:34px;gap:10px">${flagImg(d.away.flag, 80)}${esc(A)}</div></div>
${wp != null && wp < 35 ? `<p class="body" style="text-align:center;margin-top:18px">${esc(winner)} had a ${wp}% chance going in</p>` : ''}`);
    const alts = [`${tie ? `Before ${N.home} v ${N.away} on ${N.day}, a look back` : `On this day ${d.yearsAgo} years ago`}: ${what}, ${H} ${d.hs}–${d.as} ${A}, ${shortDay(d.date)}${venue(d) ? `, in ${venue(d)}` : ''}.${d.pen ? ` ${d.pen} won on penalties.` : ''}`,
      `${H} v ${A}, ${d.year}.${d.p ? ` Chances before kick-off, from the ratings at the time: ${H} ${d.p[0]}%, draw ${d.p[1]}%, ${A} ${d.p[2]}%.` : ''}${d.h2h.n > 1 ? ` All-time between them: ${d.home.modern} ${d.h2h.w} wins, ${d.h2h.d} draws, ${d.away.modern} ${d.h2h.l} wins, ${d.h2h.n} meetings.` : ''}`];
    if (s3) alts.push(`${d.comp} ${d.edition}.${E ? ` Champions: ${E.champ}${E.final ? `, final ${E.final.home} ${E.final.hs}–${E.final.as} ${E.final.away}${E.final.pen ? ` (${E.final.pen} on penalties)` : ''}` : ''}.${E.home ? ` ${d.home.modern} ${E.home}.` : ''}${E.away ? ` ${d.away.modern} ${E.away}.` : ''}` : ''}${U ? ` Biggest upset: ${U.home} ${U.hs}–${U.as} ${U.away}, ${U.winner} given ${U.wp}%.` : ''}`);
    if (s4) alts.push(`Then and now. ${d.home.modern}: ${T.home && T.home.rank ? `${ord(T.home.rank)} (${T.home.rating})` : 'not ranked'} in ${d.year}, ${W.home && W.home.rank ? `${ord(W.home.rank)} (${W.home.rating})` : 'not ranked'} today. ${d.away.modern}: ${T.away && T.away.rank ? `${ord(T.away.rank)} (${T.away.rating})` : 'not ranked'} in ${d.year}, ${W.away && W.away.rank ? `${ord(W.away.rank)} (${W.away.rating})` : 'not ranked'} today.${S && S.n ? ` Since then: ${S.n} meetings, ${d.home.modern} ${S.w} wins, ${S.d} draws, ${d.away.modern} ${S.l} wins.` : ''}`);
    const rankLine = (T.home && T.away && W.home && W.away && T.home.rank && T.away.rank && W.home.rank && W.away.rank) ? `\n\n📈 Then and now: ${d.home.modern} ${ord(T.home.rank)} → ${ord(W.home.rank)}, ${d.away.modern} ${ord(T.away.rank)} → ${ord(W.away.rank)} in Formline's world ranking.` : '';
    const endLine = E ? `\n\n🏆 ${E.champ} went on to win the ${d.comp}${E.home && E.champ !== d.home.modern ? `; ${d.home.modern} ${E.home}` : ''}${E.away && E.champ !== d.away.modern ? `; ${d.away.modern} ${E.away}` : ''}.` : '';
    const sinceLine = S && S.n ? `\n\n🤝 Since then: ${S.n} meeting${S.n === 1 ? '' : 's'}, ${d.home.modern} ${S.w} wins, ${S.d} draws, ${d.away.modern} ${S.l} wins.` : '';
    const nextLine = tie && N ? `\n\n🗓️ They meet again ${N.day}${N.comp ? ` (${N.comp})` : ''}${N.pr ? `: ${N.home} ${N.pr.p[0]}%, draw ${N.pr.p[1]}%, ${N.away} ${N.pr.p[2]}%` : ''}.` : '';
    const core = tie ? `${N.home} v ${N.away}: remember ${d.year}? ${H} ${d.hs}–${d.as} ${A}` : `On this day in ${d.year}: ${H} ${d.hs}–${d.as} ${A}`;
    const emo = tie ? `${(fe(N.homeFlag) + fe(N.awayFlag)).trim()}${fe(N.homeFlag) || fe(N.awayFlag) ? ' ' : ''}⏪` : `${(eH + eA).trim()}${eH || eA ? ' ' : ''}🗓️`;
    const head = `${core} ${emo}`;
    return {title:tie ? `Before ${N.home} v ${N.away}: ${d.year}` : `On this day: ${H} ${d.hs}–${d.as} ${A}`, slides:[s1, s2, s3, s4].filter(Boolean), x, alts,
      caption:`${core}${d.pen ? ` (${d.pen} won on penalties)` : ''}, ${what}${d.city ? `, in ${d.city}` : ''}. ${emo}${wp != null && wp < 35 ? `\n\n😱 Going by the ratings at the time, ${winner} had just a ${wp}% chance of winning.` : ''}${endLine}${rankLine}${sinceLine}${nextLine}\n\n${tie ? 'Who takes this one? 👇 The full preview is on Formline (link in bio).' : 'Do you remember this one? 👇 Swipe for how it ended and where both teams stand now.'}\n\n${hashtags(d.g, [d.home.modern, d.away.modern], tie && N ? N.comp : d.comp, tie ? 'match' : 'onthisday')}`,
      xText:`${head}\n${what}${wp != null && wp < 35 ? `\n\n😱 ${winner} had a ${wp}% chance going in.` : ''}${tie && N && N.pr ? `\n\n🗓️ Next: ${N.day}, ${N.home} ${N.pr.p[0]}% · ${N.away} ${N.pr.p[2]}%` : ''}\n\n${tie && N ? `${BASE}matches/${d.g}/${N.date}-${slugify(N.home)}-vs-${slugify(N.away)}.html` : BASE}`};
  },
  rivalry(d){
    const A = d.a.team, B = d.b.team, url = `${BASE}h2h/${d.g}/${[slugify(A), slugify(B)].sort().join('-vs-')}.html`;
    const eA = fe(d.a.flag), eB = fe(d.b.flag);
    const lead = d.w > d.l ? `${A} lead ${d.w}–${d.l}` : d.l > d.w ? `${B} lead ${d.l}–${d.w}` : `Level at ${d.w} wins each`;
    const big = (x, who) => x ? `<li><b>${esc(who)}'s biggest win:</b> ${esc(x.home)} ${x.hs}–${x.as} ${esc(x.away)}, ${x.year}</li>` : '';
    const s1 = slide(`${hook(`${d.n} meetings. <em>Who leads?</em>`)}<div class="kick">Rivalry · ${GAME[d.g]} · ${d.n} meetings</div>
<div class="match"><div class="side">${flagImg(d.a.flag, 120)}${esc(A)}</div><div class="vs">v</div><div class="side">${flagImg(d.b.flag, 120)}${esc(B)}</div></div>
<div class="box">${recBlock(A, B, d.w, d.d, d.l, d.n)}<div class="body dim" style="font-size:24px">Goals ${d.gf}–${d.ga} · shoot-outs count as wins</div></div>`);
    const s2 = slide(`<div class="kick">${esc(A)} v ${esc(B)}</div><h2>${esc(lead)}</h2>
<ul class="facts" style="margin-top:34px"><li><b>First meeting on record:</b> ${esc(d.first.home)} ${d.first.hs}–${d.first.as} ${esc(d.first.away)}, ${d.first.year}</li>
${big(d.bigA, A)}${big(d.bigB, B)}<li><b>Most recent:</b> ${esc(d.last.home)} ${d.last.hs}–${d.last.as} ${esc(d.last.away)}, ${d.last.year}</li></ul>
${d.next && d.next.pr ? `<div class="box"><div class="lab">Next: ${esc(d.next.home)} v ${esc(d.next.away)}, ${esc(d.next.day)}</div>${pickBar(d.next.pr.p, d.next.home, d.next.away)}</div>` : ''}`);
    /* Decade by decade, and the meetings at the big tournaments. */
    const decs = d.decades || [], many = decs.length > 9, fin = d.finals || [];
    const ko = fin.filter(f => f.stage && !/group|league/i.test(f.stage)), show = (ko.length ? ko : fin).slice(-4).reverse();
    const decRow = D => `<div class="dec" style="${many ? 'padding:4px 0;font-size:23px' : ''}"><b>${D.dec}s</b><div class="bar">${D.w ? `<span class="sa" style="flex:${D.w}">${D.w}</span>` : ''}${D.d ? `<span class="sd" style="flex:${D.d}">${D.d}</span>` : ''}${D.l ? `<span class="sb" style="flex:${D.l}">${D.l}</span>` : ''}</div><span class="dim" style="text-align:right">${D.n} played</span></div>`;
    const s3 = decs.length >= 2 ? slide(`<div class="kick">${esc(A)} v ${esc(B)} · decade by decade</div>
<div class="pk" style="font-size:22px;margin:22px 0 10px"><span class="a">■ ${esc(A)} wins</span><span>■ draws</span><span class="b">■ ${esc(B)} wins</span></div>
${decs.map(decRow).join('')}
${fin.length ? `<div class="box" style="margin-top:${many ? 16 : 26}px;padding:${many ? '16px 24px' : '22px 28px'}"><div class="lab">${fin.length} meeting${fin.length === 1 ? '' : 's'} at major tournaments${ko.length ? `, ${ko.length} in the knockouts` : ''}</div>
${show.map(f => `<div class="body" style="font-size:${many ? 22 : 25}px">${f.year} ${esc(f.comp)}${f.stage && !/group/i.test(f.stage) ? ` (${esc(f.stage.toLowerCase())})` : ''}: <b>${esc(f.home)} ${f.hs}–${f.as} ${esc(f.away)}</b>${f.pen ? `, ${esc(f.pen)} on pens` : ''}</div>`).join('')}</div>` : ''}`) : null;
    const x = wide(`<div class="kick" style="font-size:20px">Rivalry · ${d.n} meetings</div>
<div class="match" style="margin-top:14px"><div class="side" style="font-size:34px;gap:10px">${flagImg(d.a.flag, 72)}${esc(A)}</div><div class="vs">v</div><div class="side" style="font-size:34px;gap:10px">${flagImg(d.b.flag, 72)}${esc(B)}</div></div>
<div style="margin-top:14px">${recBlock(A, B, d.w, d.d, d.l, d.n).replace(/font-size:96px/g, '')}</div>`.replace('class="rec"', 'class="rec" style="--x:1"'));
    const alts = [`Rivalry, ${A} v ${B} (${GAME[d.g].toLowerCase()}), ${d.n} meetings: ${A} ${d.w} wins, ${d.d} draws, ${B} ${d.l} wins. Goals ${d.gf}–${d.ga}. Penalty shoot-outs count as wins.`,
      `${A} v ${B}: ${lead}. First meeting on record: ${d.first.home} ${d.first.hs}–${d.first.as} ${d.first.away}, ${d.first.year}.${d.bigA ? ` ${A}'s biggest win: ${d.bigA.home} ${d.bigA.hs}–${d.bigA.as} ${d.bigA.away}, ${d.bigA.year}.` : ''}${d.bigB ? ` ${B}'s biggest win: ${d.bigB.home} ${d.bigB.hs}–${d.bigB.as} ${d.bigB.away}, ${d.bigB.year}.` : ''} Most recent: ${d.last.home} ${d.last.hs}–${d.last.as} ${d.last.away}, ${d.last.year}.${d.next && d.next.pr ? ` Next: ${d.next.home} v ${d.next.away}, ${d.next.day}; chances ${d.next.home} ${d.next.pr.p[0]}%, draw ${d.next.pr.p[1]}%, ${d.next.away} ${d.next.pr.p[2]}%.` : ''}`];
    if (s3) alts.push(`${A} v ${B} decade by decade (${A} wins, draws, ${B} wins): ${decs.map(D => `${D.dec}s ${D.w}–${D.d}–${D.l}`).join(', ')}.${fin.length ? ` ${fin.length} meetings at major tournaments. ${show.map(f => `${f.year} ${f.comp}${f.stage && !/group/i.test(f.stage) ? ` ${f.stage.toLowerCase()}` : ''}: ${f.home} ${f.hs}–${f.as} ${f.away}${f.pen ? `, ${f.pen} on penalties` : ''}`).join('; ')}.` : ''}`);
    const bestDec = decs.length >= 3 ? decs.slice().sort((p, q) => Math.abs(q.w - q.l) - Math.abs(p.w - p.l))[0] : null;
    return {title:`${A} v ${B} rivalry`, slides:[s1, s2, s3].filter(Boolean), x, alts,
      caption:`${A} v ${B} head to head: ${d.n} meetings since ${d.first.year} ${(eA + eB).trim()}${eA || eB ? ' ' : ''}⚔️\n\n${lead}, with ${d.d} draws.\n\n📜 First meeting on record: ${d.first.home} ${d.first.hs}–${d.first.as} ${d.first.away} (${d.first.year}).${d.bigA ? ` ${A}'s biggest win: ${d.bigA.hs}–${d.bigA.as} in ${d.bigA.year}.` : ''}${d.bigB ? ` ${B}'s: ${d.bigB.hs}–${d.bigB.as} in ${d.bigB.year}.` : ''}${bestDec && bestDec.w !== bestDec.l ? `\n\n📅 Most one-sided decade: the ${bestDec.dec}s, ${bestDec.w > bestDec.l ? A : B} won ${Math.max(bestDec.w, bestDec.l)} of ${bestDec.n}.` : ''}${fin.length ? `\n\n🏆 ${fin.length} meeting${fin.length === 1 ? '' : 's'} at major tournaments.` : ''}${d.next && d.next.pr ? `\n\n🗓️ They meet again ${d.next.day}: ${d.next.home} ${d.next.pr.p[0]}%, draw ${d.next.pr.p[1]}%, ${d.next.away} ${d.next.pr.p[2]}%.` : ''}\n\nEvery result between them is on Formline (link in bio) 👆\n\n${hashtags(d.g, [A, B], d.next ? d.next.comp : null, 'rivalry')}`,
      xText:`⚔️ ${eA}${A} v ${B}${eB ? ' ' + eB.trim() : ''}: ${d.n} meetings since ${d.first.year}\n\n${A} ${d.w} · Draws ${d.d} · ${B} ${d.l}\n${lead}\n\nEvery result: ${url}`};
  },
  tournament(d){
    const rows = d.rows;
    const s1 = slide(`${hook(`Who wins <em>${esc(d.short)}</em>?`)}<div class="kick">Simulator · 10,000 runs</div><h2>${esc(d.name)}</h2>
<p class="body dim" style="font-size:24px;margin-top:8px">${esc(d.where || '')}</p>
<div style="display:grid;grid-template-columns:1fr 150px 150px;gap:0 18px;margin-top:30px;font-size:21px;color:#a7bba9;font-weight:700;letter-spacing:.06em;text-transform:uppercase"><span></span><span style="text-align:right">${esc(d.firstKo)}</span><span style="text-align:right">Win</span></div>
${rows.map(r => `<div class="row" style="grid-template-columns:1fr 150px 150px">${'<span style="display:flex;align-items:center;gap:16px">' + flagBox(r.flag, 40) + esc(r.team) + '</span>'}<span style="text-align:right" class="dim">${pctTxt(r.ko)}%</span><span style="text-align:right" class="v">${pctTxt(r.win)}%</span></div>`).join('')}`);
    const x = wide(`<div class="kick" style="font-size:20px">Simulator · ${esc(d.short)}</div><h2 style="font-size:40px">Who wins it?</h2>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 40px;margin-top:16px">${rows.slice(0, 6).map(r => `<div class="row" style="font-size:26px;padding:10px 0">${flagBox(r.flag, 30)}<span>${esc(r.team)}</span><span class="v">${pctTxt(r.win)}%</span></div>`).join('')}</div>`);
    const medal = i => ['🥇', '🥈', '🥉'][i] || '▫️';
    const lines = rows.slice(0, 5).map((r, i) => `${medal(i)} ${fe(r.flag)}${r.team} ${pctTxt(r.win)}%`).join('\n');
    const alts = [`Formline Simulator, 10,000 runs of ${d.name}${d.where ? ` (${d.where})` : ''}. Chance of reaching the ${d.firstKo.toLowerCase()} and of winning: ${rows.map(r => `${r.team} ${pctTxt(r.ko)}% and ${pctTxt(r.win)}%`).join('; ')}.`];
    /* Second slide: the groups (two to eight of them, side by side unless there are only two) as they stand, with points
       once a match has been played, and every side's chance of reaching the first knockout round. */
    const G = d.groups || [], started = d.groupsPlayed > 0, koName = d.firstKo.toLowerCase();
    let s2 = null, s3 = null;
    if (G.length >= 2 && G.length <= 8 && Math.max(...G.map(g => g.rows.length)) <= 6){
      const one = G.length <= 2, gfs = one ? 36 : G.length <= 4 ? 26 : G.length <= 6 ? 24 : 22, cols = started ? '1fr 48px 104px' : '1fr 104px', gpad = G.length <= 4 ? 10 : 6;
      const box = g => `<div class="gbox" style="padding:14px 20px"><div style="display:grid;grid-template-columns:${cols};gap:12px;font-size:16px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#a7bba9;padding-bottom:6px"><span>Group ${esc(g.name)}</span>${started ? '<span style="text-align:right">Pts</span>' : ''}<span style="text-align:right">${esc(d.koCol)}</span></div>` +
        g.rows.map(r => `<div class="gt" style="display:grid;grid-template-columns:auto ${cols};font-size:${gfs}px;padding:${gpad}px 0">${flagBox(r.flag, gfs + 4)}<span class="ell">${esc(r.team)}</span>${started ? `<span style="text-align:right">${r.pts}</span>` : ''}<span style="text-align:right;color:#f6b638;font-weight:800">${pctTxt(r.ko)}%</span></div>`).join('') + '</div>';
      s2 = slide(`<div class="kick">${esc(d.short)} · Simulator</div><h2>${started ? 'The groups as they stand' : 'The groups'}</h2>
<p class="body dim" style="font-size:23px;margin-top:8px">${started ? 'Points so far, and the' : 'The'} chance of reaching the ${esc(koName)}</p>
<div style="display:grid;grid-template-columns:${one ? '1fr' : '1fr 1fr'};gap:18px 20px;margin-top:24px">${G.map(box).join('')}</div>`);
      alts.push(`${d.short}, the groups${started ? ' as they stand' : ''}, with each side's${started ? ' points and' : ''} chance of reaching the ${koName}: ${G.map(g => `Group ${g.name}: ${g.rows.map(r => `${r.team}${started ? ` ${r.pts} points,` : ''} ${pctTxt(r.ko)}%`).join('; ')}`).join('. ')}.`);
    }
    /* Third slide: the group matches still to play, soonest first, with Formline's pick. */
    const L = d.toPlay ? d.toPlay.list : [];
    if (L.length >= 3){
      const fs3 = fitFs(Math.max(...L.map(x => `${x.home} v ${x.away}`.length)), L.length <= 5 ? 38 : 32, 26, 650, 3), more = d.toPlay.n - L.length;
      const when = x => [x.day, x.kickoff ? koText(x.kickoff, utcDay(x.kickoff)) : '', G.length ? 'Group ' + x.group : ''].filter(Boolean).join(' · ');
      s3 = pickPage(`<div class="kick">${esc(d.short)} · still to play</div><h2>${d.toPlay.n} group match${d.toPlay.n === 1 ? '' : 'es'} left</h2>
<div style="margin-top:16px">${L.map(x => pickRow(x, fs3, when(x))).join('')}</div>${more > 0 ? `<p class="body dim" style="font-size:22px;margin-top:10px">+ ${more} more after these</p>` : ''}`);
      alts.push(`Still to play in ${d.short}, with Formline's pick and its chance: ${L.map(x => `${x.day}, ${x.home} v ${x.away}, ${x.call === 1 ? 'draw' : (x.call === 0 ? x.home : x.away)} ${x.p[x.call]}%`).join('; ')}${more > 0 ? `; and ${more} more` : ''}.`);
    }
    const swipe = s2 && s3 ? `➡️ Swipe for the groups${started ? ' as they stand' : ''} and what's still to play.\n\n` : s2 ? `➡️ Swipe for the groups${started ? ' as they stand' : ''}.\n\n` : '';
    return {title:`${d.short}: who wins it?`, slides:[s1, s2, s3].filter(Boolean), x, alts,
      caption:`${d.name} predictions: who wins it? 🏆\n\n🎲 Formline's Simulator played it out 10,000 times. Chances of winning:\n${lines}\n\n${swipe}Play with the results yourself on Formline's Simulator (link in bio) 👆\n\n${hashtags(d.g, rows.slice(0, 2).map(r => r.team), d.name.replace(/ \d{4}.*$/, ''), 'tournament')}`,
      xText:`🏆 ${d.short}: who wins it? 🎲 10,000 simulations:\n\n${rows.slice(0, 4).map((r, i) => `${medal(i)} ${fe(r.flag)}${r.team} ${pctTxt(r.win)}%`).join('\n')}\n\n${BASE}#/simulate`};
  },
  past(d){
    const f = d.final, title = `${d.tournament} ${d.label}`, C = d.champ.name, eC = d.champEmo ? d.champEmo + ' ' : '';
    const s1 = slide(`${hook(`How <em>${esc(C)}</em> won the ${esc(title)}`)}<div class="kick">From the archive · ${esc(title)}</div>
<div style="margin-top:28px">${flagImg(d.champ.flag, 150)}</div><h1>${esc(C)}</h1><p class="body" style="font-size:34px;margin-top:8px">Champions</p>
<div class="box"><div class="lab">The final${f.city ? ', ' + esc(f.city) : ''}</div><div style="font-size:40px;font-weight:800">${esc(f.home)} ${f.hs}–${f.as} ${esc(f.away)}</div>${f.pen ? `<div class="body dim">${esc(f.pen)} won on penalties</div>` : ''}</div>`);
    /* The champions' road: every match they played, round by round. */
    const road = d.road || [], tight = road.length > 7, few = road.length <= 4;
    const s2 = slide(`<div class="kick">${esc(title)}${d.host ? ' · ' + esc(d.host) : ''}</div><h2>${esc(C)}'s road to the title</h2>
<p class="body" style="margin-top:10px">Won ${d.record.w}, drew ${d.record.d}, lost ${d.record.l} · goals ${d.record.gf}–${d.record.ga}</p>
<div style="margin-top:${tight ? 18 : 28}px">${road.map(m => `<div class="row" style="grid-template-columns:120px auto 1fr auto;gap:18px;padding:${tight ? 9 : few ? 22 : 13}px 0;font-size:${tight ? 27 : few ? 38 : 30}px"><span class="stg">${esc(STAGE_SHORT(m.stage) || '–')}</span>${flagBox(m.oppFlag, tight ? 30 : few ? 44 : 36)}<span class="ell">v ${esc(m.opp)}${m.wp != null && m.wp < 35 && m.r === 'W' ? ` <span style="color:#f6b638;font-size:21px;font-weight:700">· ${m.wp}% going in</span>` : ''}</span><span style="display:flex;align-items:center;gap:12px"><b>${m.gf}–${m.ga}${m.pen ? '<span style="font-size:20px;color:#a7bba9"> pens</span>' : ''}</b><span class="chip ${m.r}" style="width:40px;height:40px;font-size:21px">${m.r}</span></span></div>`).join('')}</div>`);
    /* The biggest upsets: winners given under 35% going in. */
    const ups = d.upsets || [];
    const s3 = ups.length ? slide(`<div class="kick">${esc(title)} · shocks</div><h2>The biggest upsets</h2>
<p class="body dim" style="font-size:24px;margin-top:8px">Chances from Formline's ratings on the day</p>
${ups.map(u => `<div class="box" style="margin-top:22px;display:grid;grid-template-columns:1fr auto;align-items:center;gap:24px"><div style="min-width:0"><div style="display:flex;align-items:center;gap:14px;font-size:32px;font-weight:800">${flagBox(u.winFlag, 38)}<span class="ell">${esc(u.winner)} beat ${esc(u.loser)}</span></div>
<div class="body" style="font-size:24px;margin-top:6px">${esc(u.home)} ${u.hs}–${u.as} ${esc(u.away)} · ${esc(u.stage ? u.stage.toLowerCase() : '')}</div></div><div style="text-align:right"><div class="big" style="font-size:72px">${u.wp}%</div><div class="dim" style="font-size:20px">chance going in</div></div></div>`).join('')}`) : null;
    /* Who took part: the groups in final order (champions in gold), else the teams by confederation. */
    let s4 = null;
    if (d.groups && d.groups.length){
      const G = d.groups, cols = G.length > 8 ? 3 : G.length > 1 ? 2 : 1, big = Math.max(...G.map(g => g.length)) > 5 || G.length > 8;
      const few = !big && d.teams <= 16, gfs = few ? 32 : big ? 21 : 25, gfl = few ? 36 : big ? 22 : 28, gpad = few ? '10px 0' : big ? '3px 0' : '6px 0';
      s4 = slide(`<div class="kick">${esc(title)} · ${d.teams} teams</div><h2>Who took part</h2><p class="body dim" style="font-size:22px;margin-top:6px">Groups in final order · champions in gold</p>
<div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:16px 20px;margin-top:22px">${G.map(g => `<div class="gbox">${g.map(t => `<div class="gt${t.champ ? ' ch' : ''}" style="font-size:${gfs}px;padding:${gpad}">${flagBox(t.flag, gfl)}<span class="ell">${esc(t.name)}</span></div>`).join('')}</div>`).join('')}</div>
${d.byes && d.byes.length ? `<div class="body" style="margin-top:18px;font-size:${gfs}px;display:flex;align-items:center;gap:12px;flex-wrap:wrap"><span class="dim">Straight to the knockouts:</span>${d.byes.map(t => `<span class="gt${t.champ ? ' ch' : ''}" style="border:0;padding:0;font-size:${gfs}px">${flagImg(t.flag, gfl)}${esc(t.name)}</span>`).join('')}</div>` : ''}`);
    } else if (d.byConf && d.byConf.length){
      s4 = slide(`<div class="kick">${esc(title)} · ${d.teams} teams</div><h2>Who took part</h2>
${d.byConf.map(c => `<div class="lab" style="margin-top:22px">${esc(c.conf)}</div><div style="display:flex;flex-wrap:wrap;gap:8px 26px">${c.teams.map(t => `<span class="gt${t.champ ? ' ch' : ''}" style="border:0;padding:2px 0">${flagImg(t.flag, 26)}${esc(t.name)}</span>`).join('')}</div>`).join('')}`);
    }
    const x = wide(`<div style="display:flex;gap:40px;align-items:center;margin-top:16px">${flagImg(d.champ.flag, 120)}<div><div class="kick" style="font-size:20px">${esc(title)}</div><h1 style="font-size:60px">${esc(C)}</h1><div class="body">Champions</div></div></div>
<div class="body" style="margin-top:26px">Final: <b>${esc(f.home)} ${f.hs}–${f.as} ${esc(f.away)}</b>${f.pen ? ` (${esc(f.pen)} on pens)` : ''}${d.upset ? `<br>Biggest upset: ${esc(d.upset.winner)}, ${d.upset.wp}% going in` : ''}</div>`);
    const alts = [`From the archive, ${title}: ${C} were champions. The final${f.city ? `, in ${f.city}` : ''}: ${f.home} ${f.hs}–${f.as} ${f.away}.${f.pen ? ` ${f.pen} won on penalties.` : ''}`,
      `${C}'s road to the ${title} title${d.host ? `, in ${d.host}` : ''}: won ${d.record.w}, drew ${d.record.d}, lost ${d.record.l}, goals ${d.record.gf}–${d.record.ga}. ${road.map(m => `${m.stage || 'Match'}: v ${m.opp}, ${m.gf}–${m.ga}${m.pen ? ` (${m.r === 'W' ? 'won' : 'lost'} on penalties)` : ''}`).join('; ')}.`];
    if (s3) alts.push(`The biggest upsets of the ${title}, with the winner's chance going in: ${ups.map(u => `${u.home} ${u.hs}–${u.as} ${u.away}, ${u.winner} ${u.wp}% (${u.stage.toLowerCase()})`).join('; ')}.`);
    if (s4) alts.push(d.groups ? `The ${d.teams} teams at the ${title}, by group in final order: ${d.groups.map(g => g.map(t => t.name).join(', ')).join('. ')}.${d.byes && d.byes.length ? ` Straight to the knockouts: ${d.byes.map(t => t.name).join(', ')}.` : ''}`
      : `The ${d.teams} teams at the ${title}: ${d.byConf.map(c => `${c.conf}: ${c.teams.map(t => t.name).join(', ')}`).join('. ')}.`);
    const roadTxt = road.length && road.length <= 8 ? `\n\n🛣️ The road: ${road.map(m => `${STAGE_SHORT(m.stage) ? STAGE_SHORT(m.stage) + ' ' : ''}${m.gf}–${m.ga} v ${m.oppEmo ? m.oppEmo + ' ' : ''}${m.opp}${m.pen ? ' (pens)' : ''}`).join(' · ')}` : '';
    return {title:`${title}: ${C}`, slides:[s1, s2, s3, s4].filter(Boolean), x, alts,
      caption:`${title}: ${C} were champions${d.host ? `, in ${d.host}` : ''} ${eC}🏆\n\n⚽ The final: ${f.home} ${f.hs}–${f.as} ${f.away}${f.pen ? ` (${f.pen} won on penalties)` : ''}. ${C}'s record: won ${d.record.w}, drew ${d.record.d}, lost ${d.record.l}.${roadTxt}${d.upset ? `\n\n😱 Biggest upset: ${d.upset.home} ${d.upset.hs}–${d.upset.as} ${d.upset.away}. ${d.upset.winEmo ? d.upset.winEmo + ' ' : ''}${d.upset.winner} had a ${d.upset.wp}% chance going in.` : ''}\n\n🌍 ${d.teams} teams took part. Swipe for the road to the title, the shocks and every group ➡️\n\nEvery edition of every tournament is on Formline (link in bio) 👆\n\n${hashtags(d.g, [C], d.tournament, 'past')}`,
      xText:`🏆 ${title}: ${eC}${C} were champions\n\n⚽ Final: ${f.home} ${f.hs}–${f.as} ${f.away}${f.pen ? ` (${f.pen} on pens)` : ''}${d.upset ? `\n😱 Biggest upset: ${d.upset.winner}, ${d.upset.wp}% going in` : ''}\n\n${BASE}`};
  },
  rankings(d){
    const G = GAME[d.g];
    const rowsOf = list => list.map(r => `<div class="row" style="padding:12px 0"><span class="n">${r.rank}</span><span style="display:flex;align-items:center;gap:16px">${flagBox(r.flag, 38)}${esc(r.team)}</span><span class="v">${r.rating}</span></div>`).join('');
    const s1 = slide(`${hook(`The best ${G.toLowerCase()} teams <em>right now</em>`)}<div class="kick">${G} rankings · ${esc(d.asOf)} · the top ten</div><div style="margin-top:16px">${rowsOf(d.top)}</div>`);
    const s2 = d.next && d.next.length ? slide(`<div class="kick">${G} rankings · ${esc(d.asOf)}</div><h2>11th to 20th</h2><div style="margin-top:24px">${rowsOf(d.next)}</div>`) : null;
    const mv = (xs, up) => xs.map(r => `<div class="row"><span>${flagBox(r.flag, 38)}</span><span>${esc(r.team)}</span><span style="color:${up ? '#5fcf8a' : '#f08a7a'};font-weight:800">${up ? '+' : '−'}${Math.abs(r.d)}</span></div>`).join('');
    const s3 = slide(`<div class="kick">${G} rankings · the last 30 days</div><h2>Who's moving?</h2>
<div class="lab" style="margin-top:34px">Biggest risers (top 60)</div>${mv(d.up, true)}
${d.down.length ? `<div class="lab" style="margin-top:34px">Biggest fallers</div>${mv(d.down, false)}` : ''}`);
    const x = wide(`<div class="kick" style="font-size:20px">${G} rankings · ${esc(d.asOf)}</div><h2 style="font-size:40px">The top ten</h2>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 40px;margin-top:12px">${d.top.map(r => `<div class="row" style="font-size:24px;padding:7px 0"><span class="n" style="font-size:20px">${r.rank}</span><span style="display:flex;align-items:center;gap:12px">${flagBox(r.flag, 26)}${esc(r.team)}</span><span class="v">${r.rating}</span></div>`).join('')}</div>`);
    const alts = [`Formline ${G.toLowerCase()} rankings, ${d.asOf}, top ten with ratings: ${d.top.map(r => `${r.rank} ${r.team} ${r.rating}`).join(', ')}.`];
    if (s2) alts.push(`${G} rankings, ${d.asOf}, 11th to 20th: ${d.next.map(r => `${r.rank} ${r.team} ${r.rating}`).join(', ')}.`);
    alts.push(`${G} rankings, the last 30 days. Biggest risers in the top 60: ${d.up.map(r => `${r.team} up ${r.d}`).join(', ')}.${d.down.length ? ` Biggest fallers: ${d.down.map(r => `${r.team} down ${-r.d}`).join(', ')}.` : ''}`);
    const medal = n => ({1:'🥇', 2:'🥈', 3:'🥉'})[n] || `${n}.`;
    return {title:`${G} top ten`, slides:[s1, s2, s3].filter(Boolean), x, alts,
      caption:`${G} national football team rankings, ${d.asOf} 📊\n\n${d.top.map(r => `${medal(r.rank)} ${fe(r.flag)}${r.team} ${r.rating}`).join('\n')}\n\n${d.up.length ? `📈 Biggest riser this month: ${fe(d.up[0].flag)}${d.up[0].team} (+${d.up[0].d}).` : ''}${d.down.length ? `\n📉 Biggest faller: ${fe(d.down[0].flag)}${d.down[0].team} (−${-d.down[0].d}).` : ''}\n\nWhere's your team? 👀 Swipe for 11th to 20th, or find every team on Formline (link in bio).\n\n${hashtags(d.g, d.top.slice(0, 3).map(r => r.team), null, 'rankings')}`,
      xText:`📊 ${G} top 10, ${d.asOf}\n\n${d.top.slice(0, 10).map(r => `${medal(r.rank)} ${fe(r.flag)}${r.team}`).join('\n')}\n\n${BASE}`};
  }
};

/* A day's results with Formline's calls: cover (the tally and the biggest matches), the rest, the upsets, the window so far. */
BUILD.roundup = function(d){
  const tick = x => x.hit ? '<span style="color:#5fcf8a;font-weight:800">&#10003;</span>' : '<span style="color:#f08a7a;font-weight:800">&#10007;</span>';
  const rowR = (x, fs) => `<div class="row" style="grid-template-columns:1fr auto;padding:${fs > 30 ? r0(fs * 0.42) : fs < 28 ? 8 : 11}px 0;font-size:${fs}px"><span class="ell" style="display:flex;align-items:center;gap:12px">${flagBox(x.hf, fs + 4)}${esc(x.home)} <b>${x.hs}–${x.as}</b> ${esc(x.away)}${flagImg(x.af, fs + 4)}</span>${tick(x)}</div>`;
  const head = d.list.slice(0, 7), rest = d.list.slice(7, 21), pc = Math.round(100 * d.hits / d.n);
  /* The cover's rows as large as the longest result allows: up to 40px for five results, 34px for seven. */
  const lineLen = x => `${x.home} ${x.hs}–${x.as} ${x.away}`.length, hfs = fitFs(Math.max(...head.map(lineLen)), head.length <= 5 ? 40 : head.length === 6 ? 37 : 34, 29, 780, 3);
  const s1 = slide(`${hook(`Formline called <em>${d.hits} of ${d.n}</em>`)}<div class="kick">Results · ${esc(d.dayTxt)}</div>
<div style="margin-top:16px">${head.map(x => rowR(x, hfs)).join('')}</div>${rest.length ? `<p class="body dim" style="font-size:22px;margin-top:10px">${rest.length} more results inside →</p>` : ''}`);
  /* The result of the day: the match between the highest-ranked sides, Formline's chances for it, and what it did to both ratings. */
  const B = d.big, chg = T => `<span style="color:${T.delta > 0 ? '#5fcf8a' : T.delta < 0 ? '#f08a7a' : '#a7bba9'}">${T.delta > 0 ? '+' : T.delta < 0 ? '−' : '±'}${Math.abs(T.delta)}</span>`;
  const bigWho = B ? (B.o === 1 ? 'A draw' : `${B.o === 0 ? B.home : B.away} won`) : '', bigCall = B ? (B.hit ? `Formline's pick, at ${B.p[B.o]}%` : `Formline had that at ${B.p[B.o]}%`) : '';
  const bigRated = B && B.H.delta != null && B.A.delta != null;
  const sB = B ? slide(`<div class="kick">Result of the day · ${esc(B.comp)}</div>
<div class="match"><div class="side">${flagImg(B.hf, 120)}${esc(B.home)}<small>${B.H.rank ? 'Ranked ' + ord(B.H.rank) : ''}</small></div><div class="score">${B.hs}–${B.as}</div><div class="side">${flagImg(B.af, 120)}${esc(B.away)}<small>${B.A.rank ? 'Ranked ' + ord(B.A.rank) : ''}</small></div></div>
<div class="box"><div class="lab">Formline's chances before kick-off</div>${pickBar(B.p, B.home, B.away)}<div class="body" style="margin-top:18px">${esc(bigWho)}: <b>${esc(bigCall)}</b></div></div>
${bigRated ? `<div class="box" style="margin-top:22px"><div class="lab">What it did to the ratings</div><div class="cols" style="font-size:32px;font-weight:700"><div class="ell">${esc(B.home)} <b class="a">${B.H.rating}</b> ${chg(B.H)}</div><div class="ell">${esc(B.away)} <b class="b">${B.A.rating}</b> ${chg(B.A)}</div></div></div>` : ''}`) : null;
  const s2 = rest.length ? slide(`<div class="kick">Results · ${esc(d.dayTxt)}</div><h2>Every other result</h2><div style="margin-top:14px">${rest.map(x => rowR(x, rest.length > 10 ? 23 : 27)).join('')}</div>
<p class="body dim" style="font-size:21px;margin-top:10px">&#10003; Formline's favourite won (or the draw it expected) · &#10007; it didn't</p>`) : null;
  const s3 = d.ups.length ? slide(`<div class="kick">Results · ${esc(d.dayTxt)}</div><h2>The upsets</h2><p class="body dim" style="font-size:24px;margin-top:8px">The winner's chance, published before kick-off</p>
${d.ups.map(u => `<div class="box" style="margin-top:22px;display:grid;grid-template-columns:1fr auto;align-items:center;gap:24px"><div style="min-width:0"><div style="display:flex;align-items:center;gap:14px;font-size:32px;font-weight:800">${flagBox(u.o === 0 ? u.hf : u.af, 38)}<span class="ell">${esc(u.o === 0 ? u.home : u.away)} beat ${esc(u.o === 0 ? u.away : u.home)}</span></div>
<div class="body" style="font-size:24px;margin-top:6px">${esc(u.home)} ${u.hs}–${u.as} ${esc(u.away)} · ${esc(u.comp)}</div></div><div style="text-align:right"><div class="big" style="font-size:72px">${u.p[u.o]}%</div><div class="dim" style="font-size:20px">chance going in</div></div></div>`).join('')}`) : null;
  const s4 = d.win.n > d.n ? slide(`<div class="kick">The window so far</div><h2>How Formline's calls are going</h2>
<div style="display:flex;gap:60px;margin-top:40px;align-items:flex-end"><div><div class="lab">Called right</div><div class="big">${d.win.hits}</div></div><div><div class="lab">Of</div><div class="big" style="color:#f1f4ec">${d.win.n}</div></div>
<div><div class="lab">Rate</div><div class="big" style="color:#f1f4ec">${Math.round(100 * d.win.hits / d.win.n)}%</div></div></div>
<p class="body" style="margin-top:30px">Every forecast is published before kick-off and checked after the final whistle. Make your own picks for the next matchday on formlinedata.com.</p>`) : null;
  const x = wide(`<div class="kick" style="font-size:20px">Results · ${esc(d.dayTxt)}</div><h2 style="font-size:44px">Formline called ${d.hits} of ${d.n}</h2>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 40px;margin-top:12px">${d.list.slice(0, 8).map(r => rowR(r, 22)).join('')}</div>`);
  const line = r => `${r.hit ? '✅' : '❌'} ${fe(r.hf)}${r.home} ${r.hs}–${r.as} ${r.away}${r.af && r.af.emo ? ' ' + r.af.emo : ''}`;
  const up = d.ups[0], upTxt = up ? `😱 Upset of the day: ${up.o === 0 ? up.home : up.away} won with a ${up.p[up.o]}% chance.` : '';
  const alts = [`Results for ${d.dayTxt}: Formline's pre-match favourite was right in ${d.hits} of ${d.n} matches. ${head.map(r => `${r.home} ${r.hs}–${r.as} ${r.away} (${r.hit ? 'right' : 'wrong'})`).join('; ')}.`];
  if (sB) alts.push(`Result of the day, ${B.comp}: ${B.home} ${B.hs}–${B.as} ${B.away}. Formline's chances before kick-off: ${B.home} ${B.p[0]}%, draw ${B.p[1]}%, ${B.away} ${B.p[2]}%.${bigRated ? ` Ratings after it: ${B.home} ${B.H.rating} (${B.H.delta >= 0 ? 'up' : 'down'} ${Math.abs(B.H.delta)}), ${B.away} ${B.A.rating} (${B.A.delta >= 0 ? 'up' : 'down'} ${Math.abs(B.A.delta)}).` : ''}`);
  if (s2) alts.push(`More results for ${d.dayTxt}: ${rest.map(r => `${r.home} ${r.hs}–${r.as} ${r.away} (${r.hit ? 'right' : 'wrong'})`).join('; ')}.`);
  if (s3) alts.push(`The upsets of ${d.dayTxt}, with the winner's chance before kick-off: ${d.ups.map(u => `${u.home} ${u.hs}–${u.as} ${u.away}, ${u.p[u.o]}%`).join('; ')}.`);
  if (s4) alts.push(`The window so far: Formline called ${d.win.hits} of ${d.win.n} results, ${Math.round(100 * d.win.hits / d.win.n)}%.`);
  return {title:`Results: ${d.hits} of ${d.n}, ${d.dayTxt}`, slides:[s1, sB, s2, s3, s4].filter(Boolean), x, alts,
    caption:`International football results, ${d.dayTxt}: Formline called ${d.hits} of ${d.n} (${pc}%) 📋\n\n${d.list.slice(0, 10).map(line).join('\n')}${d.list.length > 10 ? `\n…and ${d.list.length - 10} more in the slides` : ''}${upTxt ? '\n\n' + upTxt : ''}${d.win.n > d.n ? `\n\n📈 The window so far: ${d.win.hits} of ${d.win.n} called right.` : ''}\n\nWhich result surprised you most? 👇 Make your own picks for the next matchday at formlinedata.com (link in bio).\n\n${hashtags(d.g, d.list.slice(0, 2).map(r => r.home), null, 'roundup')}`,
    xText:`📋 ${d.dayTxt}: Formline called ${d.hits} of ${d.n}\n\n${d.list.slice(0, 4).map(line).join('\n')}${upTxt ? '\n\n' + upTxt : ''}\n\n${BASE}#/matchday?ud=${d.day}`};
};

/* Window days, the morning post: today's matches with Formline's pick, its chance and the kick-off in Toronto and UK time.
   The cover has the seven biggest; up to three more slides share the rest evenly, nine at most on each. */
BUILD.today = function(d){
  const favOf = x => x.call === 1 ? 'Draw' : (x.call === 0 ? x.home : x.away);
  const sl = pickPage, rowT = (x, fs) => pickRow(x, fs, [koText(x.kickoff, d.day), x.comp].filter(Boolean).join(' · '));
  const len = x => `${x.home} v ${x.away}`.length, size = (xs, max) => fitFs(Math.max(...xs.map(len)), max, 26, 650, 3);
  const head = d.list.slice(0, 7), more = d.list.slice(7), pages = [];
  const np = Math.min(3, Math.ceil(more.length / 9)), per = np ? Math.min(9, Math.ceil(more.length / np)) : 0;
  for (let i = 0; i < np; i++) pages.push(more.slice(i * per, (i + 1) * per));
  const shown = head.length + pages.reduce((n, p) => n + p.length, 0), left = d.n - shown;
  const s1 = sl(`${hook('Who wins <em>today?</em>')}<div class="kick">Matchday · ${esc(d.dayTxt)} · ${d.n} matches</div>
<div style="margin-top:14px">${head.map(x => rowT(x, size(head, head.length <= 5 ? 38 : 33))).join('')}</div>${more.length ? `<p class="body dim" style="font-size:22px;margin-top:10px">${more.length} more match${more.length === 1 ? '' : 'es'} inside →</p>` : ''}`);
  const rest = pages.map((p, i) => sl(`<div class="kick">Matchday · ${esc(d.dayTxt)}</div><h2>More of today's matches</h2>
<div style="margin-top:16px">${p.map(x => rowT(x, size(p, p.length <= 5 ? 36 : p.length <= 7 ? 33 : 30))).join('')}</div>${i === pages.length - 1 && left > 0 ? `<p class="body dim" style="font-size:22px;margin-top:10px">+ ${left} more on formlinedata.com · Matchday</p>` : ''}`));
  const pickCls = (x, side) => x.call === side ? ' style="color:#f6b638"' : '';
  const x = page(1200, 675, `<div class="kick" style="font-size:20px">Matchday · ${esc(d.dayTxt)}</div><h2 style="font-size:40px">Who wins today?</h2>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 40px;margin-top:12px">${d.list.slice(0, 8).map(r => `<div class="row" style="grid-template-columns:1fr auto;font-size:22px;padding:8px 0"><span class="ell" style="display:flex;align-items:center;gap:10px">${flagBox(r.hf, 24)}<span${pickCls(r, 0)}>${esc(r.home)}</span> <span class="dim">v</span> <span${pickCls(r, 2)}>${esc(r.away)}</span>${flagImg(r.af, 24)}</span><span class="v">${r.call === 1 ? 'Draw ' : ''}${r.p[r.call]}%</span></div>`).join('')}</div>`, {vars:';--pt:40px;--px:60px;--fb:70px;--fbot:30px', right:'Formline\'s pick in gold, and its chance'});
  const pick = r => r.call === 1 ? `draw ${r.p[1]}%` : `${favOf(r)} ${r.p[r.call]}%`;
  const line = r => { const ko = koText(r.kickoff, d.day); return `${fe(r.hf)}${r.home} v ${r.away}${r.af && r.af.emo ? ' ' + r.af.emo : ''}: ${pick(r)}${ko ? ` · ${ko.replace(' · ', ' / ')}` : ''}`; };
  const altOf = xs => xs.map(r => { const ko = koText(r.kickoff, d.day); return `${r.home} v ${r.away}, ${pick(r)}${ko ? ', ' + ko.replace(' · ', ', ') : ''}`; }).join('; ');
  const alts = [`International matches today, ${d.dayTxt}, with Formline's pick and its chance: ${altOf(head)}.`]
    .concat(pages.map(p => `More of today's matches, ${d.dayTxt}: ${altOf(p)}.`));
  const top = d.list[0];
  return {title:`Today's matches, ${d.dayTxt}`, slides:[s1, ...rest], x, alts,
    caption:`International football today, ${d.dayTxt}: Formline's predictions for ${d.n} matches ⚽\n\n${d.list.slice(0, 6).map(line).join('\n')}${d.n > 6 ? `\n…and ${d.n - 6} more in the slides` : ''}\n\n⏰ Kick-off times are Toronto (ET) and UK.\n\nWhich favourite slips up today? 👇 Make your own picks on Formline's Matchday (link in bio).\n\n${hashtags(top.g, [top.home, top.away], top.comp, 'today')}`,
    xText:`⚽ Today's biggest matches, and who Formline picks:\n\n${d.list.slice(0, 4).map(r => `${fe(r.hf)}${r.home} v ${r.away}${r.af && r.af.emo ? ' ' + r.af.emo : ''}: ${pick(r)}`).join('\n')}\n\n${BASE}#/matchday`};
};

/* The Instagram Story (1080×1920) for window days: today's matches and Formline's calls. */
const storyPage = d => page(1080, 1920, `<div class="kick" style="font-size:28px">Today · ${esc(d.dayTxt)}</div>
<div class="hook" style="font-size:76px;margin-top:14px">Who wins <em>today?</em></div>
<div style="margin-top:10px">${d.list.map(x => { const fav = x.call === 1 ? 'Draw' : (x.call === 0 ? x.home : x.away);
  return `<div class="row" style="grid-template-columns:1fr auto;padding:16px 0;font-size:32px"><span style="min-width:0"><span class="ell" style="display:flex;align-items:center;gap:12px">${flagBox(x.hf, 34)}${esc(x.home)} <span class="dim">v</span> ${esc(x.away)}${flagImg(x.af, 34)}</span><span class="sub" style="font-size:23px">${esc(koText(x.kickoff, d.day) || (x.time ? x.time + ' Toronto time' : ''))}</span></span><span style="text-align:right"><span class="v">${x.p[x.call]}%</span><span class="sub" style="font-size:21px;text-align:right">${esc(fav)}</span></span></div>`; }).join('')}</div>
${d.n > d.list.length ? `<p class="body dim" style="margin-top:14px;font-size:26px">+ ${d.n - d.list.length} more today</p>` : ''}
<p class="body" style="margin-top:30px;font-size:30px">Make your own picks: <b class="a">formlinedata.com</b> · Matchday</p>`, {vars:';--pt:90px;--px:80px;--fb:220px;--fbot:140px', right:'Formline\'s pick and its chance'});

/* ---------- run ---------- */
function serve(root){
  const types = {'.html':'text/html', '.js':'text/javascript', '.json':'application/json', '.css':'text/css', '.webp':'image/webp', '.png':'image/png',
    '.svg':'image/svg+xml', '.woff2':'font/woff2', '.jpg':'image/jpeg', '.csv':'text/csv'};
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname), f = path.join(root, u.replace(/^\/+/, ''));
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()){ res.writeHead(404); return res.end(); }
    res.writeHead(200, {'Content-Type':types[path.extname(f)] || 'application/octet-stream'}); fs.createReadStream(f).pipe(res);
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv)));
}

/* SOCIAL_SLOT=b makes a second, evening post on days in an international window (into <date>-b), and nothing otherwise. */
export async function makePost({date = DATE, type = process.env.SOCIAL_TYPE || '', used = [], recentTypes = [], out = OUT, slot = process.env.SOCIAL_SLOT || ''} = {}){
  let chromium;
  try { const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright'); chromium = pw.chromium || (pw.default && pw.default.chromium); }
  catch { throw new Error('Playwright is not installed'); }
  const srv = await serve(ROOT), port = srv.address().port, host = `http://127.0.0.1:${port}/`;
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {});
  const tmp = path.join(ROOT, '_social_tmp'); fs.mkdirSync(tmp, {recursive:true});
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => { try { localStorage.setItem('formline.tourSeen', '1'); } catch(e){} });
    await page.goto(host + 'index.html#/about');
    await page.waitForFunction(() => typeof ensureData === 'function' && typeof TOURNAMENTS !== 'undefined', null, {timeout:60000});
    await page.addScriptTag({path:path.join(ROOT, 'build', 'social', 'collect.js')});
    /* Collectors pick matches relative to the time the post goes out: 14:00 UTC that day (9 am in Toronto in winter, 10 am
       in summer), so a match preview covers a match kicking off 8 to 56 hours after the post. */
    const now = Date.parse(date + (slot === 'c' ? 'T12:00:00Z' : slot ? 'T23:00:00Z' : 'T14:00:00Z'));
    const run = (t, extra = {}) => page.evaluate(([t, now, used, extra]) => window.FL_SOCIAL[t]({now, used, ...extra}), [t, now, used, extra]);
    const dow = new Date(date + 'T12:00:00Z').getUTCDay();
    let order = type ? [type] : [WEEK[dow]];
    /* SOCIAL_SLOT=c: window days, the results roundup of the day before, out at 7 am Toronto on Bluesky and Instagram. */
    let data = null;
    if (slot === 'c'){
      const w3 = await page.evaluate(now => window.FL_SOCIAL.windowOn({now}), now);
      if (!type && (!w3 || !w3.on)){ console.log('No results roundup: not an international window.'); return null; }
      data = await run('roundup');
      if (!data){ console.log('No results roundup: fewer than five results yesterday.'); return null; }
    }
    if (slot === 'b' && !type){
      const w2 = await page.evaluate(now => window.FL_SOCIAL.windowOn({now}), now);
      if (!w2 || !w2.on){ console.log('No evening post: not an international window.'); return null; }
      /* The evening post in a window: another match preview, else a tie-in, the tournament chances or the movers, but not
         the same kind as this morning's unless it's a preview. */
      /* The morning's kind is the latest one that isn't the roundup (made between the two). On a Monday whose morning went to
         today's matches, the weekly rankings move here. */
      const am = recentTypes.find(t => t !== 'roundup');
      order = (dow === 1 && am === 'today' ? ['rankings', 'match', 'tieIn', 'tournament', 'spotlight'] : ['match', 'tieIn', 'tournament', 'rankings', 'spotlight']).filter((t, i) => i === 0 || t !== am);
      console.log(`Evening post (${w2.n} matches around today): ${order.join(', ')}.`);
    }
    /* International windows: no plain history posts. Sunday's past tournament and Wednesday's on-this-day give way to
       tournament chances, a tie-in (an earlier meeting of a pair that plays this week), movers and extra previews. */
    const win = type || slot ? null : await page.evaluate(now => window.FL_SOCIAL.windowOn({now}), now);
    if (win && win.on){
      if (WEEK[dow] === 'pastTournament') order = ['tournament', 'tieIn', 'rankings', 'match'];
      if (WEEK[dow] === 'onThisDay') order = ['tieIn', 'match', 'tournament', 'rankings'];
      /* A day with at least five forecast matches: the morning post is today's matches, and the day's usual post gives way
         (previews go out in the evening slot). */
      try { data = await run('today'); } catch(e){ console.log('today: ' + e.message.split('\n')[0]); }
      console.log(`International window (${win.n} matches around today): ${data ? "today's matches (" + data.n + ')' : order[0]} first.`);
    }
    if (!data && !type && !slot && dow !== 1 && !recentTypes.slice(0, 2).includes('match') && WEEK[dow] !== 'match'){
      const m = await run('match');
      if (m && ((m.g === 'men' && m.home.rank <= 25 && m.away.rank <= 25) || (m.g === 'women' && m.home.rank <= 12 && m.away.rank <= 12))) data = m;
    }
    if (!type && !slot) order = order.concat(FALLBACK.filter(t => !order.includes(t) && !(win && win.on && (t === 'pastTournament' || t === 'onThisDay'))));
    for (const t of order){ if (data) break; try { data = await run(t); } catch(e){ console.log(`${t}: ${e.message.split('\n')[0]}`); } }
    if (!data) throw new Error('No post could be made today');
    /* Gathered now, while the site page is still loaded (drawing the slides navigates away from it). */
    let storyData = null;
    if (!slot && !type){ try { const w = await page.evaluate(now => window.FL_SOCIAL.windowOn({now}), now);
      if (w && w.on) storyData = await run('storyToday'); } catch(e){ console.log('story: ' + e.message.split('\n')[0]); } }
    const post = BUILD[data.type](data);
    const key = date + (slot ? '-' + slot : ''), dir = path.join(out, key); fs.rmSync(dir, {recursive:true, force:true}); fs.mkdirSync(dir, {recursive:true});
    const shoot = async (html, W, H, file, jpg) => {
      const f = path.join(tmp, 'slide.html'); fs.writeFileSync(f, html.replaceAll(host, '../'));
      await page.setViewportSize({width:W, height:H});
      await page.goto(host + '_social_tmp/slide.html', {waitUntil:'networkidle'});
      await page.evaluate(() => document.fonts && document.fonts.ready);
      await page.screenshot({path:path.join(dir, file), type:jpg ? 'jpeg' : 'png', quality:jpg ? 90 : undefined});
    };
    const files = [];
    for (let i = 0; i < post.slides.length; i++){ await shoot(post.slides[i], 1080, 1350, `${i + 1}.jpg`, true); files.push(`${i + 1}.jpg`); }
    await shoot(post.x, 1200, 675, 'x.png', false);
    /* "1 wins" → "1 win" everywhere the counts are filled in (before the text files are written, so every copy agrees). */
    const one = t => String(t).replace(/(^|[^\d.,])1 (win|draw|defeat|meeting|goal)s\b/g, '$11 $2');
    post.caption = one(post.caption); post.xText = one(post.xText);
    fs.writeFileSync(path.join(dir, 'caption.txt'), post.caption + '\n');
    fs.writeFileSync(path.join(dir, 'x.txt'), post.xText + '\n');
    const alts = (post.alts || []).map(a => one(a).replace(/\s+/g, ' ').trim().slice(0, 1000));
    const who = {match:[data.home && data.home.team, data.away && data.away.team], spotlight:[data.team && data.team.team],
      onthisday:[data.home && data.home.modern, data.away && data.away.modern], rivalry:[data.a && data.a.team, data.b && data.b.team],
      tournament:(data.rows || []).slice(0, 2).map(r => r.team), past:[data.champ && data.champ.name], rankings:[],
      roundup:(data.list || []).slice(0, 2).map(r => r.home), today:data.list && data.list[0] ? [data.list[0].home, data.list[0].away] : []}[data.type] || [];
    const comp = {match:data.comp, spotlight:data.next && data.next.comp, onthisday:data.comp, rivalry:data.next && data.next.comp,
      tournament:(data.name || '').replace(/ \d{4}.*$/, ''), past:data.tournament, rankings:null, roundup:null, today:data.list && data.list[0] ? data.list[0].comp : null}[data.type];
    /* Window days, morning post: an Instagram Story of today's matches. */
    let story = null;
    if (storyData){ await shoot(storyPage(storyData), 1080, 1920, 'story.jpg', true); story = 'story.jpg'; console.log(`Story: ${storyData.n} matches today.`); }
    /* The closing slide, for Instagram only (Bluesky shows the first four slides). */
    const fans = who.filter(Boolean).slice(0, 2), igSlides = files.slice();
    while (alts.length < files.length) alts.push(post.title);
    if (files.length < 10){ await shoot(ctaSlide(fans.length ? `a ${fans.join(' or ')} fan` : 'a football fan'), 1080, 1350, 'cta.jpg', true); igSlides.push('cta.jpg');
      alts.push('Formline: every national team, rated every night. Follow @formline.data for match previews and rankings, and visit formlinedata.com.'); }
    /* The question the bot leaves as the first comment on Instagram. */
    const fl = t => (t && t.emo) || '', vs = (a, b, fa, fb) => `${a} v ${b}${fl(fa) || fl(fb) ? ' ' + fl(fa) + fl(fb) : ''}`;
    const question = {
      match:() => `Who wins ${vs(data.home.team, data.away.team, data.home.flag, data.away.flag)}? Drop your score prediction 👇`,
      spotlight:() => `How far can ${data.team.team} go this year? 👇`,
      onthisday:() => data.mode === 'tiein' && data.next ? `Who takes ${data.next.home} v ${data.next.away} this time? 👇` : 'Were you watching this one? 👇',
      rivalry:() => `Who wins the next ${data.a.team} v ${data.b.team}? 👇`,
      tournament:() => `Who's your pick to win ${data.short}? 👇`,
      past:() => `Do you remember ${data.tournament} ${data.label}? Who was your player of the tournament? 👇`,
      rankings:() => `Who's too high, who's too low? 👇`,
      roundup:() => 'Which result surprised you most? 👇',
      today:() => 'Which favourite slips up today? 👇'}[data.type];
    const meta = {date, key, slot, type:data.type, id:data.id, g:data.g, title:post.title, slides:files, igSlides, story, alts, x:'x.png', caption:post.caption, xText:post.xText,
      question:question ? one(question()) : '',
      bskyTags:bskyTags(data.g, who, comp)};
    fs.writeFileSync(path.join(dir, 'post.json'), JSON.stringify(meta, null, 1) + '\n');
    return meta;
  } finally {
    await browser.close(); srv.close(); fs.rmSync(tmp, {recursive:true, force:true});
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)){
  let used = [], recentTypes = [];
  try { const u = JSON.parse(fs.readFileSync(process.env.SOCIAL_USED || path.join(OUT, 'used.json'), 'utf8')); used = u.ids || []; recentTypes = u.recentTypes || []; } catch(e){}
  let meta = null;
  try { meta = await makePost({used, recentTypes}); }
  catch(e){ if (!process.env.SOCIAL_SLOT) throw e; console.log(`No evening post: ${e.message}`); }   // the evening post is a bonus: never fail the run for it
  if (!meta){ if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, 'title=\n'); process.exit(0); }
  console.log(`Social post for ${meta.key}: ${meta.type}, "${meta.title}" (${meta.slides.length} slide${meta.slides.length === 1 ? '' : 's'})`);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `title=${meta.title}\ntype=${meta.type}\n`);
}
