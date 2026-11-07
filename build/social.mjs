// The daily social post: picks today's kind of post, gathers its facts from the site itself (build/social/collect.js runs
// inside the real page, so every number matches what the site shows), and draws it as
//   1.jpg, 2.jpg …  Instagram carousel slides, 1080×1350 (4:5), JPEG as Instagram's API requires
//   x.png           one wide 1200×675 image for X (Seb posts it by hand)
//   caption.txt     the Instagram caption;  x.txt  the X post (under 280 characters, with a link)
//   post.json       everything above plus the type and the id used to avoid repeats
// into $SOCIAL_OUT/<date>/. Needs Playwright (installed by the workflow).
//
//   SOCIAL_DATE=2026-11-08 SOCIAL_TYPE=rivalry SOCIAL_USED=used.json node build/social.mjs
//
// The week: Mon rankings · Tue team spotlight · Wed on this day · Thu tournament chances · Fri rivalry ·
// Sat match preview · Sun a tournament from the past. On other days a big match in the next two days (two top-25 men's
// sides, or two top-12 women's sides) takes the slot, but not if one of the last two posts was already a match.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {siteBase} from './site-url.mjs';
import {slugify} from './pages.mjs';

const ROOT = process.env.FORMLINE_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.SOCIAL_OUT || path.join(ROOT, '_social');
const BASE = siteBase(ROOT, process.env.GITHUB_REPOSITORY) || 'https://formlinedata.github.io/formline/';
const torontoDate = () => new Date().toLocaleDateString('en-CA', {timeZone:'America/Toronto'});
const DATE = process.env.SOCIAL_DATE || torontoDate();
const WEEK = ['pastTournament', 'rankings', 'spotlight', 'onThisDay', 'tournament', 'rivalry', 'match'];   // Sun … Sat
const FALLBACK = ['match', 'spotlight', 'rivalry', 'pastTournament', 'rankings'];
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'}[c]));
const GAME = {men:"Men's", women:"Women's"};
const ord = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
const r0 = x => Math.round(x);
const pctTxt = x => x >= 99.5 && x < 100 ? '>99' : x > 0 && x < 0.5 ? '<1' : String(Math.round(x));

/* ---------- hashtags ---------- */
const COMP_TAG = {'FIFA World Cup':'WorldCup', 'FIFA World Cup qualification':'WorldCupQualifiers', 'UEFA Nations League':'NationsLeague',
  'UEFA Euro':'EURO', 'UEFA Euro qualification':'EuroQualifiers', 'Copa América':'CopaAmerica', 'African Cup of Nations':'AFCON',
  'African Cup of Nations qualification':'AFCONQualifiers', 'AFC Asian Cup':'AsianCup', 'Gold Cup':'GoldCup',
  'CONCACAF Nations League':'ConcacafNationsLeague', 'SAFF Championship':'SAFFChampionship', "FIFA Women's World Cup":'FIFAWWC',
  "UEFA Women's Euro":'WEURO', "UEFA Women's Nations League":'UWNL', 'Friendly':'InternationalFriendly'};
const tag = s => '#' + String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, 'And').replace(/[^A-Za-z0-9]+/g, '');
function hashtags(g, teams, comp){
  const t = [...teams.map(tag)];
  if (comp && COMP_TAG[comp]) t.push('#' + COMP_TAG[comp]);
  t.push(g === 'women' ? '#WomensFootball' : '#InternationalFootball', '#Football', '#Soccer', '#FootballStats');
  return [...new Set(t)].join(' ');
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
.dim{color:#a7bba9}.body{color:#d9e2da;font-size:28px;line-height:1.45}
.fl{display:inline-block;border-radius:6px;box-shadow:0 0 0 1.5px rgba(255,255,255,.16);vertical-align:middle;object-fit:cover}
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
.row>span{min-width:0}`;
const flagImg = (f, h) => f ? `<img class="fl" src="${esc(f.src)}" style="height:${h}px;width:${r0(h * (f.ar || 1.5))}px" alt="">` : '';
const page = (W, H, inner, o = {}) => `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="../vendor/fonts.css"><style>:root{--W:${W}px;--H:${H}px${o.vars || ''}}${CSS}</style></head><body><div class="pg">` +
  `<div class="brand">${LOGO}Formline</div><div class="ct">${inner}</div></div>` +
  `<div class="foot"><b>formlinedata.github.io/formline</b><span>${esc(o.right || 'Rankings updated every night')}</span></div></body></html>`;
const slide = inner => page(1080, 1350, inner);
const wide = inner => page(1200, 675, inner, {vars:';--pt:40px;--px:60px;--fb:70px;--fbot:30px'});
const pickBar = (p, A, B) => `<div class="pick"><div class="pa" style="flex:${p[0]}">${p[0]}%</div><div class="pd" style="flex:${p[1]}">${p[1]}%</div><div class="pb" style="flex:${p[2]}">${p[2]}%</div></div>
<div class="pk"><span class="a">${esc(A)} win</span><span>Draw</span><span class="b">${esc(B)} win</span></div>`;
const recBlock = (A, B, w, d, l, n) => `<div class="rec"><div><div class="n a">${w}</div><div class="t">${esc(A)} wins</div></div><div><div class="n dim">${d}</div><div class="t">draws</div></div><div><div class="n b">${l}</div><div class="t">${esc(B)} wins</div></div></div>
<div class="bar"><span class="sa" style="flex:${w || 0.01}"></span><span class="sd" style="flex:${d || 0.01}"></span><span class="sb" style="flex:${l || 0.01}"></span></div>`;
const venue = x => [x.city, x.country && x.country !== x.city ? x.country : ''].filter(Boolean).join(', ');
const shortDay = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', {day:'numeric', month:'short', year:'numeric', timeZone:'UTC'});
const teamUrl = (g, t) => `${BASE}teams/${g}/${slugify(t)}.html`;

/* ---------- each kind of post ---------- */
const BUILD = {
  match(d){
    const A = d.home.team, B = d.away.team, h = d.h2h, url = `${BASE}matches/${d.g}/${d.date}-${slugify(A)}-vs-${slugify(B)}.html`;
    const top = d.pr.p.indexOf(Math.max(...d.pr.p)), fav = [A + ' are favourites', 'A draw is the most likely result', B + ' are favourites'][top];
    const s1 = slide(`<div class="kick">${esc(d.comp)} · ${esc(d.day)}</div>
<div class="match"><div class="side">${flagImg(d.home.flag, 120)}${esc(A)}<small>${d.home.rank ? 'Ranked ' + ord(d.home.rank) : ''}</small></div><div class="vs">v</div>
<div class="side">${flagImg(d.away.flag, 120)}${esc(B)}<small>${d.away.rank ? 'Ranked ' + ord(d.away.rank) : ''}</small></div></div>
<div class="box"><div class="lab">Formline's chances</div>${pickBar(d.pr.p, A, B)}<div class="body" style="margin-top:18px">Most likely score <b>${esc(d.pr.likely)}</b>${venue(d) ? ' · ' + esc(venue(d)) : ''}</div></div>`);
    const s2 = slide(`<div class="kick">Head to head · ${GAME[d.g]}</div><h2>${esc(A)} v ${esc(B)}</h2>
${h.n ? `<div class="box">${recBlock(A, B, h.w, h.d, h.l, h.n)}<div class="body dim" style="font-size:24px">${h.n} meeting${h.n === 1 ? '' : 's'} · goals ${h.gf}–${h.ga}</div></div>
<div class="lab" style="margin-top:34px">Last meetings</div>${h.last.map(m => `<div class="row" style="grid-template-columns:auto 1fr"><span class="dim" style="font-size:24px">${m.year}</span><span>${esc(m.home)} ${m.hs}–${m.as} ${esc(m.away)}<span class="sub">${esc(m.comp)}</span></span></div>`).join('')}`
  : `<p class="body" style="margin-top:30px">This will be the first meeting on record between ${esc(A)} and ${esc(B)}.</p>`}`);
    const x = wide(`<div class="kick" style="font-size:20px">${esc(d.comp)} · ${esc(d.day)}</div>
<div class="match" style="margin-top:18px"><div class="side" style="font-size:34px;gap:10px">${flagImg(d.home.flag, 72)}${esc(A)}</div><div class="vs">v</div><div class="side" style="font-size:34px;gap:10px">${flagImg(d.away.flag, 72)}${esc(B)}</div></div>
<div style="margin-top:22px">${pickBar(d.pr.p, A, B)}</div>`);
    const h2hTxt = h.n ? `All-time: ${A} ${h.w} win${h.w === 1 ? '' : 's'}, ${h.d} draw${h.d === 1 ? '' : 's'}, ${B} ${h.l} win${h.l === 1 ? '' : 's'} (${h.n} meetings).` : `It will be their first meeting on record.`;
    const alts = [`${d.comp}, ${d.day}: ${A}${d.home.rank ? ` (ranked ${ord(d.home.rank)})` : ''} v ${B}${d.away.rank ? ` (ranked ${ord(d.away.rank)})` : ''}${venue(d) ? `, in ${venue(d)}` : ''}. Formline's chances: ${A} win ${d.pr.p[0]}%, draw ${d.pr.p[1]}%, ${B} win ${d.pr.p[2]}%. Most likely score ${d.pr.likely}.`,
      h.n ? `Head to head, ${A} v ${B} (${GAME[d.g].toLowerCase()}): ${h.n} meetings, ${A} ${h.w} wins, ${h.d} draws, ${B} ${h.l} wins, goals ${h.gf}–${h.ga}. Last meetings: ${h.last.map(m => `${m.year}, ${m.home} ${m.hs}–${m.as} ${m.away} (${m.comp})`).join('; ')}.`
        : `Head to head, ${A} v ${B}: this will be their first meeting on record.`];
    return {title:`${A} v ${B} preview`, slides:[s1, s2], x, alts,
      caption:`${A} v ${B} · ${d.comp}, ${d.day}.\n\n${fav}. Formline's chances: ${A} ${d.pr.p[0]}%, draw ${d.pr.p[1]}%, ${B} ${d.pr.p[2]}%. Most likely score ${d.pr.likely}.\n\n${h2hTxt}\n\nWho are you backing? Every upcoming match has a preview on Formline (link in bio).\n\n${hashtags(d.g, [A, B], d.comp)}`,
      xText:`${A} v ${B}, ${d.day}\n\n${A} ${d.pr.p[0]}% · Draw ${d.pr.p[1]}% · ${B} ${d.pr.p[2]}%\nMost likely: ${d.pr.likely}\n${h.n ? `Head to head: ${h.w}–${h.d}–${h.l}` : 'First meeting on record'}\n\n${url}`};
  },
  spotlight(d){
    const T = d.team, t = T.team, url = teamUrl(d.g, t);
    const chg = d.change == null ? '' : d.change > 0 ? `Up ${d.change} points on a year ago` : d.change < 0 ? `Down ${-d.change} points on a year ago` : 'Level with a year ago';
    const s1 = slide(`<div class="kick">Team spotlight · ${GAME[d.g]}</div>
<div style="margin-top:34px">${flagImg(T.flag, 160)}</div><h1>${esc(t)}</h1>
<div style="display:flex;gap:60px;margin-top:40px;align-items:flex-end"><div><div class="lab">Rating</div><div class="big">${T.rating}</div></div>
<div><div class="lab">Rank</div><div class="big" style="color:#f1f4ec">${T.rank ? ord(T.rank) : '–'}</div></div></div>
<p class="body" style="margin-top:26px">${T.rank ? `${ord(T.rank)} of ${T.ranked} ranked teams` : 'Not ranked yet'}${T.conf ? ' · ' + esc(T.conf) : ''}${chg ? '<br>' + esc(chg) : ''}</p>`);
    const s2 = slide(`<div class="kick">${esc(t)} · form and rivals</div>
<div class="lab" style="margin-top:30px">Last five results</div>${d.last5.map(m => `<div class="row"><span class="chip ${m.r}">${m.r}</span><span>v ${esc(m.opp)}<span class="sub">${esc(m.comp)}</span></span><span>${m.gf}–${m.ga}</span></div>`).join('')}
${d.rival ? `<div class="box"><div class="lab">Most-played opponent: ${esc(d.rival.opp)}</div><div class="body">${d.rival.n} meetings: ${esc(t)} won <b>${d.rival.w}</b>, drew ${d.rival.d}, lost ${d.rival.l}</div></div>` : ''}
${d.next && d.next.pr ? `<div class="box" style="margin-top:20px"><div class="lab">Next: ${esc(d.next.home)} v ${esc(d.next.away)}, ${esc(d.next.day)}</div>${pickBar(d.next.pr.p, d.next.home, d.next.away)}</div>` : ''}`);
    const x = wide(`<div style="display:flex;gap:40px;align-items:center;margin-top:10px">${flagImg(T.flag, 130)}<div><div class="kick" style="font-size:20px">Team spotlight · ${GAME[d.g]}</div><h1 style="font-size:64px">${esc(t)}</h1></div></div>
<div style="display:flex;gap:50px;margin-top:30px;align-items:flex-end"><div><div class="lab">Rating</div><div class="big" style="font-size:96px">${T.rating}</div></div><div><div class="lab">Rank</div><div class="big" style="font-size:96px;color:#f1f4ec">${T.rank ? ord(T.rank) : '–'}</div></div>
<div><div class="lab">Last five</div><div style="display:flex;gap:8px">${d.last5.map(m => `<span class="chip ${m.r}">${m.r}</span>`).join('')}</div></div></div>`);
    const form = d.last5.map(m => m.r).join('');
    const alts = [`Team spotlight: ${t} (${GAME[d.g].toLowerCase()}). Rating ${T.rating}${T.rank ? `, ranked ${ord(T.rank)} of ${T.ranked}` : ', not ranked yet'}${T.conf ? `, ${T.conf}` : ''}.${chg ? ' ' + chg + '.' : ''}`,
      `${t}'s last five results: ${d.last5.map(m => `${{W:'won', D:'drew', L:'lost'}[m.r]} ${m.gf}–${m.ga} v ${m.opp} (${m.comp})`).join('; ')}.${d.rival ? ` Most-played opponent: ${d.rival.opp}, ${d.rival.n} meetings, ${d.rival.w} wins, ${d.rival.d} draws, ${d.rival.l} defeats.` : ''}${d.next && d.next.pr ? ` Next: ${d.next.home} v ${d.next.away}, ${d.next.day}; chances ${d.next.home} ${d.next.pr.p[0]}%, draw ${d.next.pr.p[1]}%, ${d.next.away} ${d.next.pr.p[2]}%.` : ''}`];
    return {title:`${t} spotlight`, slides:[s1, s2], x, alts,
      caption:`Team spotlight: ${t} (${GAME[d.g].toLowerCase()}).\n\nRated ${T.rating}${T.rank ? `, ${ord(T.rank)} of ${T.ranked}` : ''}${chg ? `. ${chg}` : ''}. Last five: ${form}.${d.rival ? `\n\nMost-played opponent: ${d.rival.opp}, ${d.rival.n} meetings (${d.rival.w} wins, ${d.rival.d} draws, ${d.rival.l} defeats).` : ''}${d.next && d.next.pr ? `\n\nNext up: ${d.next.home} v ${d.next.away}, ${d.next.day}.` : ''}\n\nEvery team has its own page on Formline (link in bio).\n\n${hashtags(d.g, [t], d.next ? d.next.comp : null)}`,
      xText:`Team spotlight: ${t}\n\nRating ${T.rating}${T.rank ? ` · ${ord(T.rank)} of ${T.ranked}` : ''}\nLast five: ${form}${d.rival ? `\nv ${d.rival.opp}: ${d.rival.w}–${d.rival.d}–${d.rival.l} in ${d.rival.n} meetings` : ''}\n\n${url}`};
  },
  onthisday(d){
    const H = d.home.name, A = d.away.name, winner = d.hs > d.as ? H : d.hs < d.as ? A : d.pen;
    const wp = d.p ? (d.hs > d.as ? d.p[0] : d.hs < d.as ? d.p[2] : null) : null;
    const stage = d.stage && !/group/i.test(d.stage) ? d.stage.replace(/s$/, '').replace(/-finals?$/, '-final') : '';
    const what = `${d.comp} ${d.edition}${stage ? ', ' + stage.toLowerCase() : ''}`;
    const s1 = slide(`<div class="kick">On this day · ${d.yearsAgo} years ago${d.g === 'women' ? " · Women's" : ''}</div><h2 style="margin-top:16px">${esc(what)}</h2>
<div class="match"><div class="side">${flagImg(d.home.flag, 120)}${esc(H)}</div><div class="score">${d.hs}–${d.as}</div><div class="side">${flagImg(d.away.flag, 120)}${esc(A)}</div></div>
<p class="body" style="margin-top:30px;text-align:center">${esc(shortDay(d.date))}${venue(d) ? ' · ' + esc(venue(d)) : ''}${d.pen ? `<br>${esc(d.pen)} won on penalties` : ''}</p>`);
    const s2 = slide(`<div class="kick">${esc(H)} v ${esc(A)}, ${d.year}</div>
${d.p ? `<div class="box"><div class="lab">Chances before kick-off</div>${pickBar(d.p, H, A)}</div>
<p class="body" style="margin-top:26px">${wp != null && wp < 35 ? `<b>${esc(winner)}</b> were given just a <b>${wp}%</b> chance of winning, going by the ratings at the time.` : winner ? `<b>${esc(winner)}</b> were ${wp != null && wp >= 50 ? 'the favourites' : 'given a ' + wp + '% chance'} going in.` : 'Honours even.'}</p>` : ''}
${d.h2h.n > 1 ? `<div class="box"><div class="lab">All-time between them</div>${recBlock(d.home.modern, d.away.modern, d.h2h.w, d.h2h.d, d.h2h.l, d.h2h.n)}<div class="body dim" style="font-size:24px">${d.h2h.n} meetings</div></div>` : ''}`);
    const x = wide(`<div class="kick" style="font-size:20px">On this day, ${d.year} · ${esc(what)}</div>
<div class="match" style="margin-top:20px"><div class="side" style="font-size:34px;gap:10px">${flagImg(d.home.flag, 80)}${esc(H)}</div><div class="score" style="font-size:96px">${d.hs}–${d.as}</div><div class="side" style="font-size:34px;gap:10px">${flagImg(d.away.flag, 80)}${esc(A)}</div></div>
${wp != null && wp < 35 ? `<p class="body" style="text-align:center;margin-top:18px">${esc(winner)} had a ${wp}% chance going in</p>` : ''}`);
    const alts = [`On this day ${d.yearsAgo} years ago, ${what}: ${H} ${d.hs}–${d.as} ${A}, ${shortDay(d.date)}${venue(d) ? `, in ${venue(d)}` : ''}.${d.pen ? ` ${d.pen} won on penalties.` : ''}`,
      `${H} v ${A}, ${d.year}.${d.p ? ` Chances before kick-off, from the ratings at the time: ${H} ${d.p[0]}%, draw ${d.p[1]}%, ${A} ${d.p[2]}%.` : ''}${d.h2h.n > 1 ? ` All-time between them: ${d.home.modern} ${d.h2h.w} wins, ${d.h2h.d} draws, ${d.away.modern} ${d.h2h.l} wins, ${d.h2h.n} meetings.` : ''}`];
    return {title:`On this day: ${H} ${d.hs}–${d.as} ${A}`, slides:[s1, s2], x, alts,
      caption:`On this day in ${d.year}: ${H} ${d.hs}–${d.as} ${A}${d.pen ? ` (${d.pen} won on penalties)` : ''}, ${what}${d.city ? `, in ${d.city}` : ''}.${wp != null && wp < 35 ? `\n\nGoing by the ratings at the time, ${winner} had just a ${wp}% chance of winning.` : ''}${d.h2h.n > 1 ? `\n\nAll-time: ${d.home.modern} ${d.h2h.w} wins, ${d.h2h.d} draws, ${d.away.modern} ${d.h2h.l} wins.` : ''}\n\nDo you remember this one?\n\n${hashtags(d.g, [d.home.modern, d.away.modern], d.comp)} #OnThisDay #FootballHistory`,
      xText:`On this day in ${d.year}: ${H} ${d.hs}–${d.as} ${A}\n${what}${wp != null && wp < 35 ? `\n\n${winner} had a ${wp}% chance going in.` : ''}\n\n${BASE}`};
  },
  rivalry(d){
    const A = d.a.team, B = d.b.team, url = `${BASE}h2h/${d.g}/${[slugify(A), slugify(B)].sort().join('-vs-')}.html`;
    const lead = d.w > d.l ? `${A} lead ${d.w}–${d.l}` : d.l > d.w ? `${B} lead ${d.l}–${d.w}` : `Level at ${d.w} wins each`;
    const big = (x, who) => x ? `<li><b>${esc(who)}'s biggest win:</b> ${esc(x.home)} ${x.hs}–${x.as} ${esc(x.away)}, ${x.year}</li>` : '';
    const s1 = slide(`<div class="kick">Rivalry · ${GAME[d.g]} · ${d.n} meetings</div>
<div class="match"><div class="side">${flagImg(d.a.flag, 120)}${esc(A)}</div><div class="vs">v</div><div class="side">${flagImg(d.b.flag, 120)}${esc(B)}</div></div>
<div class="box">${recBlock(A, B, d.w, d.d, d.l, d.n)}<div class="body dim" style="font-size:24px">Goals ${d.gf}–${d.ga} · shoot-outs count as wins</div></div>`);
    const s2 = slide(`<div class="kick">${esc(A)} v ${esc(B)}</div><h2>${esc(lead)}</h2>
<ul class="facts" style="margin-top:34px"><li><b>First meeting on record:</b> ${esc(d.first.home)} ${d.first.hs}–${d.first.as} ${esc(d.first.away)}, ${d.first.year}</li>
${big(d.bigA, A)}${big(d.bigB, B)}<li><b>Most recent:</b> ${esc(d.last.home)} ${d.last.hs}–${d.last.as} ${esc(d.last.away)}, ${d.last.year}</li></ul>
${d.next && d.next.pr ? `<div class="box"><div class="lab">Next: ${esc(d.next.home)} v ${esc(d.next.away)}, ${esc(d.next.day)}</div>${pickBar(d.next.pr.p, d.next.home, d.next.away)}</div>` : ''}`);
    const x = wide(`<div class="kick" style="font-size:20px">Rivalry · ${d.n} meetings</div>
<div class="match" style="margin-top:14px"><div class="side" style="font-size:34px;gap:10px">${flagImg(d.a.flag, 72)}${esc(A)}</div><div class="vs">v</div><div class="side" style="font-size:34px;gap:10px">${flagImg(d.b.flag, 72)}${esc(B)}</div></div>
<div style="margin-top:14px">${recBlock(A, B, d.w, d.d, d.l, d.n).replace(/font-size:96px/g, '')}</div>`.replace('class="rec"', 'class="rec" style="--x:1"'));
    const alts = [`Rivalry, ${A} v ${B} (${GAME[d.g].toLowerCase()}), ${d.n} meetings: ${A} ${d.w} wins, ${d.d} draws, ${B} ${d.l} wins. Goals ${d.gf}–${d.ga}. Penalty shoot-outs count as wins.`,
      `${A} v ${B}: ${lead}. First meeting on record: ${d.first.home} ${d.first.hs}–${d.first.as} ${d.first.away}, ${d.first.year}.${d.bigA ? ` ${A}'s biggest win: ${d.bigA.home} ${d.bigA.hs}–${d.bigA.as} ${d.bigA.away}, ${d.bigA.year}.` : ''}${d.bigB ? ` ${B}'s biggest win: ${d.bigB.home} ${d.bigB.hs}–${d.bigB.as} ${d.bigB.away}, ${d.bigB.year}.` : ''} Most recent: ${d.last.home} ${d.last.hs}–${d.last.as} ${d.last.away}, ${d.last.year}.${d.next && d.next.pr ? ` Next: ${d.next.home} v ${d.next.away}, ${d.next.day}; chances ${d.next.home} ${d.next.pr.p[0]}%, draw ${d.next.pr.p[1]}%, ${d.next.away} ${d.next.pr.p[2]}%.` : ''}`];
    return {title:`${A} v ${B} rivalry`, slides:[s1, s2], x, alts,
      caption:`${A} v ${B}: ${d.n} meetings since ${d.first.year}. ${lead}, with ${d.d} draws.\n\nFirst meeting on record: ${d.first.home} ${d.first.hs}–${d.first.as} ${d.first.away} (${d.first.year}).${d.bigA ? ` ${A}'s biggest win: ${d.bigA.hs}–${d.bigA.as} in ${d.bigA.year}.` : ''}${d.bigB ? ` ${B}'s: ${d.bigB.hs}–${d.bigB.as} in ${d.bigB.year}.` : ''}${d.next && d.next.pr ? `\n\nThey meet again ${d.next.day}: ${d.next.home} ${d.next.pr.p[0]}%, draw ${d.next.pr.p[1]}%, ${d.next.away} ${d.next.pr.p[2]}%.` : ''}\n\nEvery result between them is on Formline (link in bio).\n\n${hashtags(d.g, [A, B], d.next ? d.next.comp : null)}`,
      xText:`${A} v ${B}: ${d.n} meetings since ${d.first.year}\n\n${A} ${d.w} · Draws ${d.d} · ${B} ${d.l}\n${lead}\n\nEvery result: ${url}`};
  },
  tournament(d){
    const rows = d.rows;
    const s1 = slide(`<div class="kick">Simulator · 10,000 runs</div><h2>${esc(d.name)}</h2>
<p class="body dim" style="font-size:24px;margin-top:8px">${esc(d.where || '')}</p>
<div style="display:grid;grid-template-columns:1fr 150px 150px;gap:0 18px;margin-top:30px;font-size:21px;color:#a7bba9;font-weight:700;letter-spacing:.06em;text-transform:uppercase"><span></span><span style="text-align:right">${esc(d.firstKo)}</span><span style="text-align:right">Win</span></div>
${rows.map(r => `<div class="row" style="grid-template-columns:1fr 150px 150px">${'<span style="display:flex;align-items:center;gap:16px">' + flagImg(r.flag, 40) + esc(r.team) + '</span>'}<span style="text-align:right" class="dim">${pctTxt(r.ko)}%</span><span style="text-align:right" class="v">${pctTxt(r.win)}%</span></div>`).join('')}`);
    const x = wide(`<div class="kick" style="font-size:20px">Simulator · ${esc(d.short)}</div><h2 style="font-size:40px">Who wins it?</h2>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 40px;margin-top:16px">${rows.slice(0, 6).map(r => `<div class="row" style="font-size:26px;padding:10px 0">${flagImg(r.flag, 30)}<span>${esc(r.team)}</span><span class="v">${pctTxt(r.win)}%</span></div>`).join('')}</div>`);
    const lines = rows.slice(0, 5).map(r => `${r.team} ${pctTxt(r.win)}%`).join('\n');
    const alts = [`Formline Simulator, 10,000 runs of ${d.name}${d.where ? ` (${d.where})` : ''}. Chance of reaching the ${d.firstKo.toLowerCase()} and of winning: ${rows.map(r => `${r.team} ${pctTxt(r.ko)}% and ${pctTxt(r.win)}%`).join('; ')}.`];
    return {title:`${d.short}: who wins it?`, slides:[s1], x, alts,
      caption:`${d.name}: who wins it?\n\nFormline's Simulator played it out 10,000 times. Chances of winning:\n${lines}\n\nPlay with the results yourself on Formline's Simulator (link in bio).\n\n${hashtags(d.g, rows.slice(0, 3).map(r => r.team), d.name.replace(/ \d{4}.*$/, ''))}`,
      xText:`${d.short}: who wins it? 10,000 simulations:\n\n${rows.slice(0, 4).map(r => `${r.team} ${pctTxt(r.win)}%`).join('\n')}\n\n${BASE}#/simulate`};
  },
  past(d){
    const f = d.final, title = `${d.tournament} ${d.label}`;
    const s1 = slide(`<div class="kick">From the archive · ${esc(title)}</div>
<div style="margin-top:40px">${flagImg(d.champ.flag, 170)}</div><h1>${esc(d.champ.name)}</h1><p class="body" style="font-size:34px;margin-top:8px">Champions</p>
<div class="box"><div class="lab">The final${f.city ? ', ' + esc(f.city) : ''}</div><div style="font-size:40px;font-weight:800">${esc(f.home)} ${f.hs}–${f.as} ${esc(f.away)}</div>${f.pen ? `<div class="body dim">${esc(f.pen)} won on penalties</div>` : ''}</div>`);
    const s2 = slide(`<div class="kick">${esc(title)}${d.host ? ' · ' + esc(d.host) : ''}</div><h2>How ${esc(d.champ.name)} won it</h2>
<div class="box"><div class="lab">Their record</div><div class="body">Won ${d.record.w}, drew ${d.record.d}, lost ${d.record.l} · goals ${d.record.gf}–${d.record.ga}</div></div>
${d.upset ? `<div class="box"><div class="lab">Biggest upset of the tournament</div><div style="font-size:36px;font-weight:800">${esc(d.upset.home)} ${d.upset.hs}–${d.upset.as} ${esc(d.upset.away)}</div>
<div class="body" style="margin-top:8px">${esc(d.upset.winner)} had a <b>${d.upset.wp}%</b> chance going in${d.upset.stage && !/group/i.test(d.upset.stage) ? ' (' + esc(d.upset.stage.toLowerCase()) + ')' : ''}.</div></div>` : ''}
<p class="body dim" style="font-size:24px;margin-top:26px">${d.teams} teams took part.</p>`);
    const x = wide(`<div style="display:flex;gap:40px;align-items:center;margin-top:16px">${flagImg(d.champ.flag, 120)}<div><div class="kick" style="font-size:20px">${esc(title)}</div><h1 style="font-size:60px">${esc(d.champ.name)}</h1><div class="body">Champions</div></div></div>
<div class="body" style="margin-top:26px">Final: <b>${esc(f.home)} ${f.hs}–${f.as} ${esc(f.away)}</b>${f.pen ? ` (${esc(f.pen)} on pens)` : ''}${d.upset ? `<br>Biggest upset: ${esc(d.upset.winner)}, ${d.upset.wp}% going in` : ''}</div>`);
    const alts = [`From the archive, ${title}: ${d.champ.name} were champions. The final${f.city ? `, in ${f.city}` : ''}: ${f.home} ${f.hs}–${f.as} ${f.away}.${f.pen ? ` ${f.pen} won on penalties.` : ''}`,
      `How ${d.champ.name} won the ${title}${d.host ? `, in ${d.host}` : ''}: won ${d.record.w}, drew ${d.record.d}, lost ${d.record.l}, goals ${d.record.gf}–${d.record.ga}.${d.upset ? ` Biggest upset of the tournament: ${d.upset.home} ${d.upset.hs}–${d.upset.as} ${d.upset.away}; ${d.upset.winner} had a ${d.upset.wp}% chance going in.` : ''} ${d.teams} teams took part.`];
    return {title:`${title}: ${d.champ.name}`, slides:[s1, s2], x, alts,
      caption:`${title}: ${d.champ.name} were champions${d.host ? `, in ${d.host}` : ''}.\n\nThe final: ${f.home} ${f.hs}–${f.as} ${f.away}${f.pen ? ` (${f.pen} won on penalties)` : ''}. ${d.champ.name}'s record: won ${d.record.w}, drew ${d.record.d}, lost ${d.record.l}.${d.upset ? `\n\nBiggest upset: ${d.upset.home} ${d.upset.hs}–${d.upset.as} ${d.upset.away}. ${d.upset.winner} had a ${d.upset.wp}% chance going in.` : ''}\n\nEvery edition of every tournament is on Formline (link in bio).\n\n${hashtags(d.g, [d.champ.name], d.tournament)} #FootballHistory`,
      xText:`${title}: ${d.champ.name} were champions\n\nFinal: ${f.home} ${f.hs}–${f.as} ${f.away}${f.pen ? ` (${f.pen} on pens)` : ''}${d.upset ? `\nBiggest upset: ${d.upset.winner}, ${d.upset.wp}% going in` : ''}\n\n${BASE}`};
  },
  rankings(d){
    const G = GAME[d.g];
    const s1 = slide(`<div class="kick">${G} rankings · ${esc(d.asOf)}</div><h2>The top ten</h2><div style="margin-top:24px">
${d.top.map(r => `<div class="row" style="padding:12px 0"><span class="n">${r.rank}</span><span style="display:flex;align-items:center;gap:16px">${flagImg(r.flag, 38)}${esc(r.team)}</span><span class="v">${r.rating}</span></div>`).join('')}</div>`);
    const mv = (xs, up) => xs.map(r => `<div class="row"><span>${flagImg(r.flag, 38)}</span><span>${esc(r.team)}</span><span style="color:${up ? '#5fcf8a' : '#f08a7a'};font-weight:800">${up ? '+' : '−'}${Math.abs(r.d)}</span></div>`).join('');
    const s2 = slide(`<div class="kick">${G} rankings · the last 30 days</div><h2>Who's moving?</h2>
<div class="lab" style="margin-top:34px">Biggest risers (top 60)</div>${mv(d.up, true)}
${d.down.length ? `<div class="lab" style="margin-top:34px">Biggest fallers</div>${mv(d.down, false)}` : ''}`);
    const x = wide(`<div class="kick" style="font-size:20px">${G} rankings · ${esc(d.asOf)}</div><h2 style="font-size:40px">The top ten</h2>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 40px;margin-top:12px">${d.top.map(r => `<div class="row" style="font-size:24px;padding:7px 0"><span class="n" style="font-size:20px">${r.rank}</span><span style="display:flex;align-items:center;gap:12px">${flagImg(r.flag, 26)}${esc(r.team)}</span><span class="v">${r.rating}</span></div>`).join('')}</div>`);
    const alts = [`Formline ${G.toLowerCase()} rankings, ${d.asOf}, top ten with ratings: ${d.top.map(r => `${r.rank} ${r.team} ${r.rating}`).join(', ')}.`,
      `${G} rankings, the last 30 days. Biggest risers in the top 60: ${d.up.map(r => `${r.team} up ${r.d}`).join(', ')}.${d.down.length ? ` Biggest fallers: ${d.down.map(r => `${r.team} down ${-r.d}`).join(', ')}.` : ''}`];
    return {title:`${G} top ten`, slides:[s1, s2], x, alts,
      caption:`${G} national-team rankings, ${d.asOf}.\n\n${d.top.map(r => `${r.rank}. ${r.team} ${r.rating}`).join('\n')}\n\n${d.up.length ? `Biggest riser this month: ${d.up[0].team} (+${d.up[0].d}).` : ''}${d.down.length ? ` Biggest faller: ${d.down[0].team} (−${-d.down[0].d}).` : ''}\n\nWhere's your team? Every team is ranked on Formline (link in bio).\n\n${hashtags(d.g, d.top.slice(0, 3).map(r => r.team), null)} #FootballRankings`,
      xText:`${G} top 10, ${d.asOf}\n\n${d.top.slice(0, 10).map(r => `${r.rank}. ${r.team}`).join('\n')}\n\n${BASE}`};
  }
};

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

export async function makePost({date = DATE, type = process.env.SOCIAL_TYPE || '', used = [], recentTypes = [], out = OUT} = {}){
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
    /* Collectors pick matches relative to the time the post goes out: 18:00 in Toronto that day. */
    const now = Date.parse(date + 'T23:00:00Z');
    const run = t => page.evaluate(([t, now, used]) => window.FL_SOCIAL[t]({now, used}), [t, now, used]);
    const dow = new Date(date + 'T12:00:00Z').getUTCDay();
    let order = type ? [type] : [WEEK[dow]];
    let data = null;
    if (!type && dow !== 1 && !recentTypes.slice(0, 2).includes('match') && WEEK[dow] !== 'match'){
      const m = await run('match');
      if (m && ((m.g === 'men' && m.home.rank <= 25 && m.away.rank <= 25) || (m.g === 'women' && m.home.rank <= 12 && m.away.rank <= 12))) data = m;
    }
    if (!type) order = order.concat(FALLBACK.filter(t => !order.includes(t)));
    for (const t of order){ if (data) break; try { data = await run(t); } catch(e){ console.log(`${t}: ${e.message.split('\n')[0]}`); } }
    if (!data) throw new Error('No post could be made today');
    const post = BUILD[data.type](data);
    const dir = path.join(out, date); fs.rmSync(dir, {recursive:true, force:true}); fs.mkdirSync(dir, {recursive:true});
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
    fs.writeFileSync(path.join(dir, 'caption.txt'), post.caption + '\n');
    fs.writeFileSync(path.join(dir, 'x.txt'), post.xText + '\n');
    /* "1 wins" → "1 win" everywhere the counts are filled in. */
    const one = t => String(t).replace(/(^|[^\d.,])1 (win|draw|defeat|meeting|goal)s\b/g, '$11 $2');
    post.caption = one(post.caption); post.xText = one(post.xText);
    const alts = (post.alts || []).map(a => one(a).replace(/\s+/g, ' ').trim().slice(0, 1000));
    const meta = {date, type:data.type, id:data.id, g:data.g, title:post.title, slides:files, alts, x:'x.png', caption:post.caption, xText:post.xText};
    fs.writeFileSync(path.join(dir, 'post.json'), JSON.stringify(meta, null, 1) + '\n');
    return meta;
  } finally {
    await browser.close(); srv.close(); fs.rmSync(tmp, {recursive:true, force:true});
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)){
  let used = [], recentTypes = [];
  try { const u = JSON.parse(fs.readFileSync(process.env.SOCIAL_USED || path.join(OUT, 'used.json'), 'utf8')); used = u.ids || []; recentTypes = u.recentTypes || []; } catch(e){}
  const meta = await makePost({used, recentTypes});
  console.log(`Social post for ${meta.date}: ${meta.type}, "${meta.title}" (${meta.slides.length} slide${meta.slides.length === 1 ? '' : 's'})`);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `title=${meta.title}\ntype=${meta.type}\n`);
}
