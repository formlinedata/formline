// Stage 2 of keeping the method private (claude/method-disclosure.md): works out, in the build, the ratings the pages
// show, and writes them to files the pages can later read instead of working them out themselves.
//
// Nothing reads these files yet, and the nightly job does not run this script yet. It exists to settle the file
// formats, the sizes and the run times before any page is switched over.
//
// Usage: node build/precompute.mjs            (writes into _precompute/, which is not part of the site)
//   PRECOMPUTE_OUT=<dir>   where to write
//   PRECOMPUTE_FROM=<year> first year of the month-by-month tables (default: the archive's first year)
//
// Files, one pair per game (men, women):
//   latest-<g>.json    today's table at the site's default settings: every rated team with its rating, band, rank,
//                      tier and the rest of what the Rankings page shows.
//   months-<g>.json    the table as the site would have published it at the end of every month since the archive
//                      begins: [team, rating, band, rank] for every rated team.
//   table-<g>.json     today's table in full (the page's tableToFile): rows, tiers, each confederation's figures and
//   table-all-<g>.json the run of matches behind it; the second is the "all time" setting. Each is read back with the
//                      page's tableFromFile and compared with the page's own table before it is written.
//   index.json         what exists: for each game, the date of today's table and the years each kind of year file
//                      covers. The pages will read this first.
//   record-<g>.json    the Forecast record's long test (Formline, World Elo and the FIFA method on the same matches),
//                      year by year since 2019, as the page's own vsYear works it out.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {loadModel} from './lib/model.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const OUT = process.env.PRECOMPUTE_OUT || path.join(ROOT, '_precompute');

/* Today's table and the month-end tables for one game, worked out by the page's own model at its default settings. */
export function precompute(model, g, fromYear){
  return model.run(`(() => {
    const g = ${JSON.stringify(g)}, fromYear = ${JSON.stringify(fromYear || 0)};
    state.gender = g; state.windowYears = DEFAULTS.windowYears; state.comps = new Set(COMP_ORDER); state.confs = new Set();
    state.fifaFilter = DEFAULTS.fifaFilter; state.historicalNames = DEFAULTS.historicalNames; state.maxBand = DEFAULTS.maxBand;
    state.rankBy = DEFAULTS.rankBy;
    const B = state.bounds[g], r1 = x => Math.round(x * 10) / 10, at = ts => { state.asOf = ts; state.cache = {key:null}; return getRatings(); };
    const t0 = Date.now(), c = at(B.max);
    const latest = {asOf:fmtDate(B.max), ranked:c.table.length, median:r1(c.median),
      rows:c.all.filter(r => !r.island).map(r => ({key:r.key, team:r.team, rating:r1(r.rating), band:r1(r.band), rank:r.rank || null, tier:r.tier || null,
        conf:r.conf, mp:r.mp, last:r.lastTs ? fmtDate(r.lastTs) : null, change:r.change == null ? null : r1(r.change), provisional:!!r.provisional, defunct:!!r.defunct}))};
    const msLatest = Date.now() - t0;
    /* Month ends, from the first month with a match (or fromYear) to the last full month. Teams are numbered once. */
    const teams = [], idx = new Map(), id = k => { if (!idx.has(k)){ idx.set(k, teams.length); teams.push(k); } return idx.get(k); };
    const first = new Date(B.min), last = new Date(B.max), stamps = [], tables = [];
    let y = Math.max(first.getUTCFullYear(), fromYear), mo = y === first.getUTCFullYear() ? first.getUTCMonth() : 0;
    const t1 = Date.now();
    for (;; mo++){ if (mo > 11){ mo = 0; y++; }
      const end = Date.UTC(y, mo + 1, 0); if (end >= Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), 1)) break;
      const x = at(end);
      stamps.push(fmtDate(end).slice(0, 7));
      tables.push(x.all.filter(r => !r.island).map(r => [id(r.key), r1(r.rating), Math.round(r.band), r.rank || 0])); }
    at(B.max);
    return {latest, months:{from:stamps[0] || null, to:stamps[stamps.length - 1] || null, teams, stamps, tables}, msLatest, msMonths:Date.now() - t1};
  })()`);
}

/* The site's default settings, set before every piece of work so one job cannot leak its settings into the next. */
const DEFAULT_STATE = g => `state.gender = ${JSON.stringify(g)}; state.windowYears = DEFAULTS.windowYears; state.comps = new Set(COMP_ORDER); state.confs = new Set();
    state.fifaFilter = DEFAULTS.fifaFilter; state.historicalNames = DEFAULTS.historicalNames; state.maxBand = DEFAULTS.maxBand; state.rankBy = DEFAULTS.rankBy;
    state.asOf = state.bounds[${JSON.stringify(g)}].max; state.cache = {key:null};`;

/* Seb, 12 Nov 2026: past rankings after every match day, not only at month ends. The table as the site would have
   published it at the end of each match day of one year: [team, rating, band, rank] for every rated team.
   allTime: every match since the archive begins counts (the site's "all time" setting) instead of the usual window. */
export function dayTables(model, g, year, allTime){
  return model.run(`(() => { ${DEFAULT_STATE(g)}
    const g = ${JSON.stringify(g)}, Y = ${+year}, B = state.bounds[g], r1 = x => Math.round(x * 10) / 10;
    if (${allTime ? 'true' : 'false'}) state.windowYears = 0;
    const ms = state.matches[g], days = [], teams = [], idx = new Map(), id = k => { if (!idx.has(k)){ idx.set(k, teams.length); teams.push(k); } return idx.get(k); };
    for (let i = firstIndexAt(ms, Date.UTC(Y, 0, 1)); i < ms.length && ms[i].ts < Date.UTC(Y + 1, 0, 1); i++) if (!days.length || days[days.length - 1] !== ms[i].ts) days.push(ms[i].ts);
    const tables = days.map(ts => { state.asOf = ts; state.cache = {key:null};
      return getRatings().all.filter(r => !r.island).map(r => [id(r.key), r1(r.rating), Math.round(r.band), r.rank || 0]); });
    state.windowYears = DEFAULTS.windowYears; state.asOf = B.max; state.cache = {key:null};
    return {year:Y, window:${allTime ? "'all'" : 'DEFAULTS.windowYears'}, teams, days:days.map(fmtDate), tables};
  })()`);
}

/* Every match of one year with both sides' ratings as the site published them: going in (from the window that ended
   the day before, which is what match lists show) and coming out, the band after it, and the home side's expected
   score. One row a match: [date, home, away, home goals, away goals, home before, away before, home after, away after,
   home band after, away band after, expected]. Teams are numbers into the file's own list. */
export function matchLedger(model, g, year){
  return model.run(`(() => { ${DEFAULT_STATE(g)}
    const g = ${JSON.stringify(g)}, Y = ${+year}, r1 = x => Math.round(x * 10) / 10;
    const ms = state.matches[g], teams = [], idx = new Map(), id = k => { if (!idx.has(k)){ idx.set(k, teams.length); teams.push(k); } return idx.get(k); }, rows = [];
    let last = null;
    for (let i = firstIndexAt(ms, Date.UTC(Y, 0, 1)); i < ms.length && ms[i].ts < Date.UTC(Y + 1, 0, 1); i++){
      const ts = ms[i].ts; if (ts === last) continue; last = ts;
      const d = pubDay(ts);
      for (const [m, x] of d) rows.push([fmtDate(ts), id(x.home), id(x.away), m.hs, m.as, r1(x.A.r), r1(x.B.r), r1(x.nA.r), r1(x.nB.r),
        Math.round(BAND_Z * x.nA.rd), Math.round(BAND_Z * x.nB.rd), Math.round(x.expHome * 1e4) / 1e4]);
      pubCache.day.delete(ts);
    }
    return {year:Y, teams, rows};
  })()`);
}

/* Today's table in full: everything the pages read off a finished table (rows, tiers, each confederation's figures,
   and the run of matches behind it), written by the page's own tableToFile. allTime gives the "all time" setting. */
export function tableFile(model, g, allTime){
  return model.run(`(() => { ${DEFAULT_STATE(g)}
    if (${allTime ? 'true' : 'false'}){ state.windowYears = 0; state.cache = {key:null}; }
    const F = tableToFile(getRatings());
    state.windowYears = DEFAULTS.windowYears; state.cache = {key:null};
    return F; })()`);
}
/* Reads a table file back with the page's own tableFromFile and compares it, field by field, with the table the page
   computes. Returns how much was compared and a list of differences (empty when the two agree). Numbers may differ
   by the rounding in the file: a hundredth of a rating point, a ten-thousandth of a chance. */
export function tableCheck(model, g, allTime, file){
  model.run(`__tf = ${JSON.stringify(JSON.stringify(file))}`);
  return model.run(`(() => { ${DEFAULT_STATE(g)}
    if (${allTime ? 'true' : 'false'}){ state.windowYears = 0; state.cache = {key:null}; }
    const c = getRatings(), h = tableFromFile(JSON.parse(__tf)), bad = [], say = s => { if (bad.length < 12) bad.push(s); };
    let n = 0;
    const num = (a, b, tol, what) => { n++; if ((a == null) !== (b == null) || (a != null && !(Math.abs(a - b) <= tol))) say(what + ': ' + a + ' v ' + b); };
    const same = (a, b, what) => { n++; if (a !== b && !(a == null && b == null)) say(what + ': ' + a + ' v ' + b); };
    if (!h){ say('file refused'); return {n, bad}; }
    same(c.all.length, h.all.length, 'teams'); same(c.table.length, h.table.length, 'ranked'); same(c.provisional.length, h.provisional.length, 'provisional');
    num(c.median, h.median, 0.006, 'median'); same(c.bench && c.bench.key, h.bench && h.bench.key, 'benchmark team'); same(c.windowStart, h.windowStart, 'window start');
    c.all.forEach((r, i) => { const x = h.all[i], w = r.key; if (!x){ say('missing row ' + w); return; }
      same(r.key, x.key, 'order at ' + i); same(r.team, x.team, w + ' name'); same(r.rank, x.rank, w + ' rank'); same(r.tier, x.tier, w + ' tier');
      same(r.pool, x.pool, w + ' pool'); same(r.conf, x.conf, w + ' conf'); same(r.mp, x.mp, w + ' played'); same(r.lastTs, x.lastTs, w + ' last match');
      same(r.status, x.status, w + ' status'); same(!!r.defunct, !!x.defunct, w + ' defunct'); same(r.island, x.island, w + ' island'); same(r.provisional, x.provisional, w + ' provisional');
      same((r.islandWith || []).join(), (x.islandWith || []).join(), w + ' island mates');
      num(r.rating, x.rating, 0.006, w + ' rating'); num(r.rd, x.rd, 0.001, w + ' rd'); num(r.rdOwn, x.rdOwn, 0.001, w + ' own rd'); num(r.w, x.w, 0.001, w + ' w');
      num(r.band, x.band, 0.002, w + ' band'); num(r.lower, x.lower, 0.008, w + ' lower'); num(r.upper, x.upper, 0.008, w + ' upper'); num(r.change, x.change, 0.006, w + ' change');
      num(r.vsMedian, x.vsMedian, 0.011, w + ' v median'); num(r.expVsMedian, x.expVsMedian, 6e-5, w + ' exp v median'); num(r.expVsBench, x.expVsBench, 6e-5, w + ' exp v bench');
      for (const [a, b, t] of [[r.pVsMedian, x.pVsMedian, 'median'], [r.pVsBench, x.pVsBench, 'bench']]){ same(!!a, !!b, w + ' chances v ' + t);
        if (a && b) for (const k of ['home', 'draw', 'away']) num(a[k], b[k], 6e-5, w + ' ' + k + ' v ' + t); }
      same((r.tierMix || []).map(m => m.n).join(), (x.tierMix || []).map(m => m.n).join(), w + ' tier mix');
      (r.tierMix || []).forEach((m, j) => { if (x.tierMix && x.tierMix[j]) num(m.p, x.tierMix[j].p, 6e-5, w + ' tier mix ' + m.n); });
      same(r.tierAlso ? r.tierAlso.n : null, x.tierAlso ? x.tierAlso.n : null, w + ' also tier'); });
    same(c.provisional.map(r => r.key).join(), h.provisional.map(r => r.key).join(), 'provisional order');
    same(c.tiers.length, h.tiers.length, 'tiers');
    c.tiers.forEach((t, i) => { const x = h.tiers[i]; if (!x) return;
      same(t.n, x.n, 'tier number'); same(t.lead.key, x.lead.key, 'tier ' + t.n + ' leader'); same(t.rows.map(r => r.key).join(), x.rows.map(r => r.key).join(), 'tier ' + t.n + ' members');
      same([...t.wide].map(r => r.key).sort().join(), [...x.wide].map(r => r.key).sort().join(), 'tier ' + t.n + ' wide members');
      num(t.hi, x.hi, 0.006, 'tier ' + t.n + ' top'); num(t.lo, x.lo, 0.006, 'tier ' + t.n + ' bottom'); num(t.gapUp, x.gapUp, 0.011, 'tier ' + t.n + ' gap up'); num(t.gapDown, x.gapDown, 0.011, 'tier ' + t.n + ' gap down'); });
    same([...c.confStats.keys()].join(), [...h.confStats.keys()].join(), 'confederations');
    for (const [k, a] of c.confStats){ const b = h.confStats.get(k); if (!b) continue;
      same(a.n, b.n, k + ' teams'); same(a.best.key, b.best.key, k + ' best'); num(a.level, b.level, 0.001, k + ' level'); num(a.levelBand, b.levelBand, 0.001, k + ' level band');
      num(a.top10, b.top10, 0.001, k + ' top ten'); num(a.median, b.median, 0.006, k + ' median'); }
    same(c.history.size, h.history.size, 'teams with matches');
    let entries = 0;
    for (const [k, a] of c.history){ const b = h.history.get(k) || []; same(a.length, b.length, k + ' matches');
      a.forEach((e, j) => { const f = b[j]; if (!f) return; entries++;
        if (e.m !== f.m){ say(k + ' match ' + j + ' is a different match'); return; }
        same(e.ts, f.ts, k + ' ts'); same(e.opp, f.opp, k + ' opponent'); same(e.oppName, f.oppName, k + ' opponent name'); same(e.name, f.name, k + ' name');
        same(e.gf, f.gf, k + ' for'); same(e.ga, f.ga, k + ' against'); same(e.tournament, f.tournament, k + ' competition'); same(e.cat, f.cat, k + ' kind');
        same(e.neutral, f.neutral, k + ' neutral'); same(e.home, f.home, k + ' home');
        num(e.rating, f.rating, 0.006, k + ' after'); num(e.pre, f.pre, 0.006, k + ' before'); num(e.oppPre, f.oppPre, 0.006, k + ' opp before'); num(e.oppPost, f.oppPost, 0.006, k + ' opp after');
        num(e.rd, f.rd, 0.001, k + ' rd'); num(e.delta, f.delta, 0.011, k + ' change'); num(e.exp, f.exp, 6e-5, k + ' expected'); }); }
    state.windowYears = DEFAULTS.windowYears; state.cache = {key:null};
    return {n, entries, bad}; })()`);
}

/* The Forecast record's long test: Formline against World Elo and the FIFA method, year by year since 2019, exactly
   as the page works it out (its vsYear), so the page can read the figures instead. One entry a year, null for a year
   the test cannot cover; each holds the counts, the three methods' scores and, per match, [date, Formline's score,
   World Elo's score] for the page's running chart. Scores are kept to six decimal places. */
export function recordYears(model, g){
  return model.run(`(() => { ${DEFAULT_STATE(g)}
    const g = ${JSON.stringify(g)}, y1 = new Date(state.bounds[g].max).getUTCFullYear(), r6 = x => Math.round(x * 1e6) / 1e6, out = [];
    for (let y = 2019; y <= y1; y++){ let a = null; try { a = vsYear(g, y); } catch(e){ a = null; }
      out.push(a && {y:a.y, n:a.n, dec:a.dec, ll:a.ll.map(r6), hit:a.hit, dis:a.dis, list:a.list.map(x => [x[0], r6(x[1]), r6(x[2])])}); }
    ${DEFAULT_STATE(g)}
    return out; })()`);
}
/* Compares a recordYears file with what the page works out. Returns the number of values compared and the differences. */
export function recordCheck(model, g, file){
  model.run(`__rf = ${JSON.stringify(JSON.stringify(file))}`);
  return model.run(`(() => { ${DEFAULT_STATE(g)}
    const g = ${JSON.stringify(g)}, F = JSON.parse(__rf), bad = [], say = s => { if (bad.length < 12) bad.push(s); }; let n = 0;
    const num = (a, b, what) => { n++; if (!(Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a)))) say(what + ': ' + a + ' v ' + b); };
    F.forEach((f, i) => { let a = null; try { a = vsYear(g, 2019 + i); } catch(e){}
      n++; if (!a !== !f){ say((2019 + i) + ': one is missing'); return; } if (!a) return;
      num(a.y, f.y, 'year'); num(a.n, f.n, f.y + ' matches'); num(a.dec, f.dec, f.y + ' decided'); num(a.list.length, f.list.length, f.y + ' list');
      [0, 1, 2].forEach(j => { num(a.ll[j], f.ll[j], f.y + ' score ' + j); num(a.hit[j], f.hit[j], f.y + ' picks ' + j); });
      [1, 2].forEach(j => a.dis[j].forEach((v, k) => num(v, f.dis[j][k], f.y + ' disagreements'))); n++; if (f.dis[0] !== null) say(f.y + ' dis[0]');
      a.list.forEach((x, k) => { const z = f.list[k]; if (!z) return; num(x[0], z[0], f.y + ' date'); num(x[1], z[1], f.y + ' match score'); num(x[2], z[2], f.y + ' match score, Elo'); }); });
    ${DEFAULT_STATE(g)}
    return {n, bad}; })()`);
}

/* What a year's files depend on, as one number: every match that can reach that year's ratings (the window before it,
   or everything before it for all time). A year whose number and model print are unchanged is not worked out again. */
export function inputPrint(model, g, year, allTime){
  return model.run(`(() => { const g = ${JSON.stringify(g)}, Y = ${+year}, ms = state.matches[g];
    const from = ${allTime ? '-Infinity' : `Date.UTC(Y - DEFAULTS.windowYears - 1, 0, 1)`}, to = Date.UTC(Y + 1, 0, 1);
    let h = 2166136261, n = 0;
    for (const m of ms){ if (m.ts < from) continue; if (m.ts >= to) break; n++;
      const s = m.ts + '|' + m.home + '|' + m.away + '|' + m.hs + '|' + m.as + '|' + m.tournament + '|' + m.city + '|' + m.country + '|' + m.neutral;
      for (let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } }
    return n + ':' + h; })()`);
}
/* The model's own print: a handful of tables from across the archive. Changing the page's text leaves it alone; changing
   how ratings are worked out moves it, and then every year is worked out again. PRECOMPUTE_FORCE=1 does the same by hand. */
export function modelPrint(model){
  return model.run(`(() => { let h = 2166136261; const add = s => { for (let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } };
    for (const g of ['men', 'women']){ if (!state.matches[g]) continue; 
      for (const w of [DEFAULTS.windowYears, 0]) for (const y of [1930, 1955, 1975, 1990, 2005, 2015, 2024]){
        const ts = Date.UTC(y, 5, 30); if (ts < state.bounds[g].min) continue;
        state.gender = g; state.windowYears = w; state.comps = new Set(COMP_ORDER); state.confs = new Set(); state.asOf = ts; state.cache = {key:null};
        add(getRatings().all.map(r => r.key + Math.round(r.rating * 100) + ':' + Math.round(r.band * 10) + ':' + (r.rank || 0)).join(','));
        const dd = state.matches[g][firstIndexAt(state.matches[g], ts)]; if (w && dd){ const d = pubDay(dd.ts); for (const [, x] of d) add(Math.round(x.nA.r * 100) + ':' + Math.round(x.expHome * 1e5)); pubCache.day.delete(dd.ts); } }
      state.windowYears = DEFAULTS.windowYears; state.asOf = state.bounds[g].max; state.cache = {key:null}; }
    return String(h); })()`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)){
  const model = loadModel(process.env.SITE_HTML || path.join(ROOT, 'index.html'));
  for (const g of ['men', 'women']) model.load(g, JSON.parse(fs.readFileSync(path.join(DATA, g + '.json'), 'utf8')));
  fs.mkdirSync(OUT, {recursive:true});
  const built = new Date().toISOString(), kb = n => (n / 1024).toFixed(0) + ' KB';
  for (const g of ['men', 'women']){
    const R = precompute(model, g, +(process.env.PRECOMPUTE_FROM || 0));
    const files = {['latest-' + g + '.json']:{built, ...R.latest}, ['months-' + g + '.json']:{built, ...R.months}};
    /* Today's table in full, at the usual window and for all time, each checked against the page before it is written. */
    for (const [name, allTime] of [['table-' + g + '.json', false], ['table-all-' + g + '.json', true]]){
      const t0 = Date.now(), F = tableFile(model, g, allTime), chk = tableCheck(model, g, allTime, F);
      if (chk.bad.length) throw new Error(`${name} does not match the page: ${chk.bad.join('; ')}`);
      files[name] = {built, ...F};
      console.log(`${name}: ${F.rows.length} teams, ${F.window.length} matches, ${chk.n} values equal to the page's (${((Date.now() - t0) / 1000).toFixed(1)} s)`); }
    /* The Forecast record's year-by-year test. */
    { const t0 = Date.now(), Y = recordYears(model, g);
      files['record-' + g + '.json'] = {built, from:2019, years:Y};
      console.log(`record-${g}.json: ${Y.filter(Boolean).length} years, ${Y.reduce((a, y) => a + (y ? y.n : 0), 0)} matches (${((Date.now() - t0) / 1000).toFixed(1)} s)`); }
    for (const [name, obj] of Object.entries(files)){
      const s = JSON.stringify(obj); fs.writeFileSync(path.join(OUT, name), s + '\n');
      console.log(`${name}: ${kb(s.length)} (${kb(zlib.gzipSync(s).length)} gzipped)`); }
    console.log(`${g}: today's table of ${R.latest.rows.length} teams in ${R.msLatest} ms; ${R.months.stamps.length} month-end tables (${R.months.from} to ${R.months.to}) in ${(R.msMonths / 1000).toFixed(1)} s`);
  }
  /* Year by year: the table after every match day (the usual window, and all time) and every match as published.
     PRECOMPUTE_WHAT=days,all,matches picks which (default days,matches); PRECOMPUTE_YEARS=1990-2026 limits the years. */
  const what = (process.env.PRECOMPUTE_WHAT || 'days,matches').split(',').filter(Boolean);
  const mfile = path.join(OUT, 'manifest.json'), manifest = fs.existsSync(mfile) ? JSON.parse(fs.readFileSync(mfile, 'utf8')) : {};
  const mp = modelPrint(model), force = process.env.PRECOMPUTE_FORCE === '1' || manifest.model !== mp;
  if (force) for (const k of Object.keys(manifest)) delete manifest[k];
  manifest.model = mp;
  const [y0, y1] = (process.env.PRECOMPUTE_YEARS || '').split('-').map(Number);
  const jobs = {days:(g, y) => dayTables(model, g, y, false), all:(g, y) => dayTables(model, g, y, true), matches:(g, y) => matchLedger(model, g, y)};
  for (const g of ['men', 'women']){
    const first = new Date(model.run(`state.bounds[${JSON.stringify(g)}].min`)).getUTCFullYear(), last = new Date(model.run(`state.bounds[${JSON.stringify(g)}].max`)).getUTCFullYear();
    for (const kind of what){ if (!jobs[kind]) continue;
      const t0 = Date.now(); let done = 0, kept = 0, bytes = 0, gz = 0;
      for (let y = Math.max(first, y0 || first); y <= Math.min(last, y1 || last); y++){
        const name = `${kind}/${g}/${y}.json`, file = path.join(OUT, name), print = inputPrint(model, g, y, kind === 'all');
        if (manifest[name] === print && fs.existsSync(file)){ kept++; continue; }
        const s = JSON.stringify({built, ...jobs[kind](g, y)});
        fs.mkdirSync(path.dirname(file), {recursive:true}); fs.writeFileSync(file, s + '\n'); manifest[name] = print;
        done++; bytes += s.length; gz += zlib.gzipSync(s).length;
        fs.writeFileSync(mfile, JSON.stringify(manifest, null, 1) + '\n');
      }
      console.log(`${kind}/${g}: ${done} year${done === 1 ? '' : 's'} worked out in ${((Date.now() - t0) / 1000).toFixed(0)} s (${kb(bytes)}, ${kb(gz)} gzipped), ${kept} unchanged`);
    }
  }
  /* The index the pages will read first: for each game, the date of today's table and which years each kind of year
     file covers (a page asks only for the year being looked at). */
  const index = {v:1, built, games:{}};
  for (const g of ['men', 'women']){
    const span = kind => { const d = path.join(OUT, kind, g), ys = fs.existsSync(d) ? fs.readdirSync(d).map(f => +f.replace('.json', '')).filter(Boolean).sort((a, b) => a - b) : [];
      return ys.length ? {from:ys[0], to:ys[ys.length - 1], missing:ys.length === ys[ys.length - 1] - ys[0] + 1 ? undefined : Array.from({length:ys[ys.length - 1] - ys[0] + 1}, (_, i) => ys[0] + i).filter(y => !ys.includes(y))} : null; };
    index.games[g] = {asOf:model.run(`fmtDate(state.bounds[${JSON.stringify(g)}].max)`), table:`table-${g}.json`, tableAll:`table-all-${g}.json`, record:`record-${g}.json`,
      days:span('days'), all:span('all'), matches:span('matches')};
  }
  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index) + '\n');
  console.log('index.json: ' + JSON.stringify(index.games));
}
