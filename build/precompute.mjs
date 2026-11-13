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
//   months-<g>.json    only with PRECOMPUTE_WHAT=months: the table at the end of every month since the archive begins
//                      (superseded by the match-day files below).
//   table-<g>.json     today's table in full (the page's tableToFile): rows, tiers, each confederation's figures and
//   table-all-<g>.json the run of matches behind it; the second is the "all time" setting. Each is read back with the
//                      page's tableFromFile and compared with the page's own table before it is written.
//   index.json         what exists: for each game, the date of today's table and the years each kind of year file
//                      covers. The pages will read this first.
//   conf-<g>.json      each confederation's level and top-ten average at every year end, for the Confederations
//                      page's history chart.
//   record-<g>.json    the Forecast record's long test (Formline, World Elo and the FIFA method on the same matches),
//                      year by year since 2019, as the page's own vsYear works it out.
//   ed/<g>/<name>.json one file an edition (a World Cup, a year of qualifying): what its page shows (editionFile below);
//   ed-all/...         the same for the "all time" setting.
//   fc-<g>.json        what today's forecasts are made from: the all-time table, the goals figures, and what a result
//                      would do to both ratings in each listed fixture.
//   records-<g>.json   the Records page's lists: the entries that can reach a top ten, for all time and each year.
//   hist-<g>.json      each team's all-time history figures: best ranks, peak, biggest upsets.
//   yearends-<g>.json  every year's closing table, for the era comparer.
//   snap-<g>.json      the charts' series: every team's published rating and band on each date the charts sample, and
//   snap-all-<g>.json  on each of its match days of the last two years (snapSeries below); the second is "all time".
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

/* Seb, 12 Nov 2026: past rankings for every date, not only at month ends. The table for each day of one year on which
   it changes (see the days below: match days, days a match leaves the window, and a weekly fill), in the table's own
   order: [team, rating, band, rank, tier] for every rated team (rank and tier 0: not ranked), and for each day the confederations' levels as [confederation, level, its variance]. The page's
   tableFromDay rebuilds the rest (matches played, form, tiers) from these and the match list.
   allTime: every match since the archive begins counts (the site's "all time" setting) instead of the usual window. */
export function dayTables(model, g, year, allTime){
  return model.run(`(() => { ${DEFAULT_STATE(g)}
    const g = ${JSON.stringify(g)}, Y = ${+year}, B = state.bounds[g], r1 = x => Math.round(x * 10) / 10, r2 = x => Math.round(x * 100) / 100;
    /* The band is shown as a whole number. Kept to one decimal place, 145.46 would become 145.5 and show as 146
       instead of 145, so such a value is kept as 145.4: the page then shows the same whole number as the exact value. */
    const rb = x => { const v = r1(x); return Math.round(v) === Math.round(x) ? v : r1(v - 0.1); };
    if (${allTime ? 'true' : 'false'}) state.windowYears = 0;
    const ms = state.matches[g], days = [], teams = [], idx = new Map(), id = k => { if (!idx.has(k)){ idx.set(k, teams.length); teams.push(k); } return idx.get(k); };
    let n = 0;
    /* The days on which the table changes (Seb, 12 Nov 2026: a past date shows the table for that exact date, as the date
       picker always has). A table changes when a match is played and when a match drops out of the window, the first day
       whose window starts after it; between those days it only drifts by a few hundredths of a point a day, so a day is
       added wherever a week would otherwise pass without one. For all time nothing ever drops out. */
    const y0 = Date.UTC(Y, 0, 1), y1 = Math.min(Date.UTC(Y + 1, 0, 1) - DAY, B.max), set = new Set();
    for (let i = firstIndexAt(ms, y0); i < ms.length && ms[i].ts < Date.UTC(Y + 1, 0, 1); i++){ n++; set.add(ms[i].ts); }
    if (state.windowYears > 0){
      const exitOf = ts => { let lo = ts, hi = ts + (state.windowYears * 366 + 2) * DAY; while (hi - lo > DAY){ const mid = lo + Math.floor((hi - lo) / DAY / 2) * DAY; if (windowStartFor(mid) > ts) hi = mid; else lo = mid; } return hi; };
      for (let i = firstIndexAt(ms, Date.UTC(Y - state.windowYears - 1, 0, 1)); i < ms.length && ms[i].ts < Date.UTC(Y - state.windowYears + 1, 0, 2); i++){ const x = exitOf(ms[i].ts); if (x >= y0 && x <= y1) set.add(x); }
    }
    { const from = Math.max(y0, B.min), sorted = [...set].sort((a, b) => a - b); let prev = from >= B.min && from > y0 ? from : null;
      /* weekly fill: from the year's first day (or the archive's first match) to its last, no gap longer than seven days */
      const edges = [from - DAY].concat(sorted.filter(x => x >= from), [y1 + DAY]);
      for (let k = 0; k + 1 < edges.length; k++) for (let t = edges[k] + 7 * DAY; t < edges[k + 1]; t += 7 * DAY) if (t >= B.min && t <= y1) set.add(t); }
    for (const t of [...set].sort((a, b) => a - b)) if (t >= B.min && t <= y1) days.push(t);
    /* One more kind of day: a team's band grows a little every day it does not play, and the day it passes the limit
       for being ranked the team leaves the table and everyone below moves up a place. Where a team sits close enough
       under the limit to pass it before the next day in the list, the days in between are looked at one by one and the
       day the ranked teams change is added. */
    const pools = [], tables = [], outDays = [];
    const tableOn = ts => { state.asOf = ts; state.cache = {key:null}; return computeRatings(null); };
    const put = (ts, c) => { outDays.push(ts);
      pools.push([...new Set(c.table.map(r => r.pool))].filter(p => p && p !== 'UNKNOWN').map(p => { const o = poolAt(c.st, p, ts); return [p, r2(o.m), r2(o.w)]; }));
      tables.push(c.all.map(r => [id(r.key), r1(r.rating), rb(r.band), r.rank || 0, r.tier || 0])); };
    const ranked = c => c.table.map(r => r.key).join('|');
    days.forEach((ts, k) => { let c = tableOn(ts); put(ts, c);
      const next = k + 1 < days.length ? days[k + 1] : Math.min(y1 + DAY, B.max + DAY), gap = Math.round((next - ts) / DAY);
      if (gap > 1 && state.maxBand > 0 && c.table.some(r => r.band > state.maxBand - 0.15 * gap)){
        let was = ranked(c);
        for (let t = ts + DAY; t < next; t += DAY){ const x = tableOn(t), now = ranked(x); if (now !== was){ put(t, x); was = now; } } } });
    days.length = 0; outDays.forEach(t => days.push(t));
    state.windowYears = DEFAULTS.windowYears; state.asOf = B.max; state.cache = {key:null};
    return {v:3, year:Y, window:${allTime ? "'all'" : 'DEFAULTS.windowYears'}, matches:n, teams, days:days.map(fmtDate), tables, pools};
  })()`);
}

/* Rebuilds the table for day i of a match-day file with the page's own tableAt / tableFromDay and compares it with the
   table the page works out for that day. The file keeps one decimal place, so numbers may differ by 0.05 (a band by 0.1, though never as shown); ranks, order,
   matches played, names, confederations and cut-off groups must be equal. Tiers come from the file, so they must be equal too
   (tierDiffs counts any that are not; the checks expect none).
   shift: view a date that many days after day i (it must fall before the next day in the file) and compare with the
   table worked out for that later date: between the file's days a table only drifts, by a few hundredths of a point a
   day, so the numbers are allowed that much more. before: the year files before this one, which the page needs for
   each team's change on a year earlier (the difference between the two dates' tables). */
export function dayCheck(model, g, file, i, shift, before){
  model.run(`__df = ${JSON.stringify(JSON.stringify(file))}; __dp = ${JSON.stringify(JSON.stringify(before || []))}`);
  return model.run(`(() => { ${DEFAULT_STATE(g)}
    const g = ${JSON.stringify(g)}, F = JSON.parse(__df), i = ${+i}, ts = Date.parse(F.days[i] + 'T00:00:00Z'), bad = [], say = s => { if (bad.length < 12) bad.push(s); };
    let n = 0, tierDiffs = 0;
    const num = (a, b, tol, what) => { n++; if ((a == null) !== (b == null) || (a != null && !(Math.abs(a - b) <= tol))) say(what + ': ' + a + ' v ' + b); };
    const same = (a, b, what) => { n++; if (a !== b && !(a == null && b == null)) say(what + ': ' + a + ' v ' + b); };
    state.asOf = ts + ${+(shift || 0)} * DAY; state.cache = {key:null};
    const c = computeRatings(null), drift = ${+(shift || 0)} * 0.06;
    state.useTableFiles = true; state.dayFiles = {[g + '|' + F.year]:F}; for (const P of JSON.parse(__dp)) state.dayFiles[g + '|' + P.year] = P;
    state.dayCache = null; state.asOf = ts + ${+(shift || 0)} * DAY; state.cache = {key:null};
    const h = tableAt();
    state.useTableFiles = false; state.dayFiles = {}; state.dayCache = null;
    if (!h.lite){ say('the page did not use the file'); state.asOf = state.bounds[g].max; state.cache = {key:null}; return {n, bad, tierDiffs}; }
    same(h.day, F.days[i], 'day'); same(c.all.length, h.all.length, 'teams'); same(c.table.map(r => r.key).join(), h.table.map(r => r.key).join(), 'ranked order');
    same(c.provisional.map(r => r.key).sort().join(), h.provisional.map(r => r.key).sort().join(), 'provisional'); if (!drift) same(c.windowStart, h.windowStart, 'window start');
    num(c.median, h.median, 0.051 + drift, 'median'); same(c.tiers.length > 0, h.tiers.length > 0, 'tiers exist');
    c.all.forEach(r => { const x = h.byKey.get(r.key), w = r.key; if (!x){ say('missing ' + w); return; }
      same(r.team, x.team, w + ' name'); same(r.rank, x.rank, w + ' rank'); same(r.pool, x.pool, w + ' pool'); same(r.mp, x.mp, w + ' played'); same(r.lastTs, x.lastTs, w + ' last match');
      same(r.status, x.status, w + ' status'); same(!!r.defunct, !!x.defunct, w + ' defunct'); same(r.island, x.island, w + ' island'); same(r.provisional, x.provisional, w + ' provisional');
      same((r.islandWith || []).slice().sort().join(), (x.islandWith || []).slice().sort().join(), w + ' island mates');
      num(r.rating, x.rating, 0.0501 + drift, w + ' rating'); num(r.band, x.band, 0.1001 + drift, w + ' band'); if (!drift) same(Math.round(r.band), Math.round(x.band), w + ' band as shown');
      num(r.change, x.change, 0.3501 + 2 * drift, w + ' change on a year'); num(r.vsMedian, x.vsMedian, 0.11 + 2 * drift, w + ' v median');
      if ((r.tier || 0) !== (x.tier || 0)) tierDiffs++;
      const a = c.history.get(w) || [], b = h.history.get(w) || []; same(a.length, b.length, w + ' matches');
      a.forEach((e, j) => { const f = b[j]; if (!f) return; if (e.m !== f.m){ say(w + ' match ' + j + ' differs'); return; }
        same(e.opp, f.opp, w + ' opponent'); same(e.oppName, f.oppName, w + ' opponent name'); same(e.name, f.name, w + ' own name'); same(e.gf, f.gf, w + ' for'); same(e.ga, f.ga, w + ' against');
        same(e.home, f.home, w + ' home'); same(e.neutral, f.neutral, w + ' neutral'); same(e.cat, f.cat, w + ' kind'); }); });
    same([...c.confStats.keys()].sort().join(), [...h.confStats.keys()].sort().join(), 'confederations');
    for (const [k, a] of c.confStats){ const b = h.confStats.get(k); if (!b) continue;
      same(a.n, b.n, k + ' teams'); same(a.best.key, b.best.key, k + ' best'); num(a.level, b.level, 0.02 + drift, k + ' level'); num(a.levelBand, b.levelBand, 0.1 + drift, k + ' level band');
      num(a.top10, b.top10, 0.0501 + drift, k + ' top ten'); num(a.median, b.median, 0.0501 + drift, k + ' median'); }
    state.asOf = state.bounds[g].max; state.cache = {key:null};
    return {n, bad, tierDiffs, ranked:c.table.length, tiers:[c.tiers.length, h.tiers.length]}; })()`);
}

/* Every match of one year with both sides' ratings as the site published them: going in (from the window that ended
   the day before, which is what match lists show) and coming out, the band after it, the home side's expected score,
   and each side's rank just after the match (the page's own rankAfter: in the world and in its confederation, each as
   rank and out of how many; 0 where it has none). One row a match:
   [date, home, away, home goals, away goals, home before, away before, home after, away after, home band after,
    away band after, expected, home world rank, of, home confederation rank, of, away world rank, of, away
    confederation rank, of]. Teams are numbers into the file's own list. */
export function matchLedger(model, g, year){
  return model.run(`(() => { ${DEFAULT_STATE(g)}
    const g = ${JSON.stringify(g)}, Y = ${+year}, r1 = x => Math.round(x * 10) / 10, r2 = x => Math.round(x * 100) / 100;
    /* Ratings keep two decimal places, nudged by a hundredth where plain rounding would make the page show a different
       figure from the exact value, to one decimal place or as a whole number (1751.46 would otherwise read 1752). */
    const keep = x => { const v = r2(x); return r1(v) === r1(x) && Math.round(v) === Math.round(x) ? v : r2(v - 0.01); };
    const ms = state.matches[g], teams = [], idx = new Map(), id = k => { if (!idx.has(k)){ idx.set(k, teams.length); teams.push(k); } return idx.get(k); }, rows = [];
    let last = null;
    for (let i = firstIndexAt(ms, Date.UTC(Y, 0, 1)); i < ms.length && ms[i].ts < Date.UTC(Y + 1, 0, 1); i++){
      const ts = ms[i].ts; if (ts === last) continue; last = ts;
      const d = pubDay(ts), memo = {}, rk = (k, conf) => { const r = rankAfter(memo, k, ts, conf); return r ? [r.rank, r.of] : [0, 0]; };
      for (const [m, x] of d) rows.push([fmtDate(ts), id(x.home), id(x.away), m.hs, m.as, keep(x.A.r), keep(x.B.r), keep(x.nA.r), keep(x.nB.r),
        Math.round(BAND_Z * x.nA.rd), Math.round(BAND_Z * x.nB.rd), Math.round(x.expHome * 1e6) / 1e6,
        ...rk(x.home, false), ...rk(x.home, true), ...rk(x.away, false), ...rk(x.away, true)]);
      pubCache.day.delete(ts);
    }
    return {v:2, year:Y, teams, rows};
  })()`);
}

/* Reads a year of matches back with the page's own lookups (pubEntry and rankAfter with the file switched on) and
   compares every side of every match with what the page works out. Ratings may differ by the file's one decimal place
   (the change by 0.1, being the difference of the two ratings as shown); ranks must be equal. */
export function ledgerCheck(model, g, file){
  model.run(`__lf = ${JSON.stringify(JSON.stringify(file))}`);
  return model.run(`(() => { ${DEFAULT_STATE(g)}
    const g = ${JSON.stringify(g)}, F = JSON.parse(__lf), Y = F.year, ms = state.matches[g], bad = [], say = s => { if (bad.length < 12) bad.push(s); };
    let n = 0, sides = 0, skipped = 0;
    const num = (a, b, tol, what) => { n++; if (!(Math.abs(a - b) <= tol)) say(what + ': ' + a + ' v ' + b); };
    const use = on => { state.useTableFiles = on; state.ledgerFiles = on ? {[g + '|' + Y]:ledgerIndex(F)} : {}; pubCache.key = null; };
    for (let i = firstIndexAt(ms, Date.UTC(Y, 0, 1)); i < ms.length && ms[i].ts < Date.UTC(Y + 1, 0, 1); i++){
      const m = namesFor(ms[i]); if (!includeMatch(m)) continue;
      for (const key of [m._h, m._a]){ const base = {ts:m.ts, m}, w = fmtDate(m.ts) + ' ' + key;
        use(false); const a = pubEntry(base, key), ra = [rankAfter({}, key, m.ts, false), rankAfter({}, key, m.ts, true)];
        use(true); const hit = ledgerRow(key, m.ts, m), b = pubEntry(base, key), rb = [rankAfter({}, key, m.ts, false), rankAfter({}, key, m.ts, true)];
        if (!hit){ skipped++; continue; }
        sides++;
        if (!a.published || !b.published){ say(w + ': not published'); continue; }
        num(a.pre, b.pre, 0.0101, w + ' before'); num(a.rating, b.rating, 0.0101, w + ' after'); num(a.oppPre, b.oppPre, 0.0101, w + ' opponent before'); num(a.oppPost, b.oppPost, 0.0101, w + ' opponent after');
        for (const f of ['pre', 'rating', 'oppPre', 'oppPost']){ n++; if (Math.round(a[f]) !== Math.round(b[f]) || Math.round(a[f] * 10) !== Math.round(b[f] * 10)) say(w + ' ' + f + ' as shown: ' + a[f] + ' v ' + b[f]); }
        num(a.delta, b.delta, 0.1001, w + ' change'); num(a.exp, b.exp, 5.1e-7, w + ' expected'); num(BAND_Z * a.rd, BAND_Z * b.rd, 0.501, w + ' band');
        [0, 1].forEach(j => { n++; if ((ra[j] ? ra[j].rank + '/' + ra[j].of : '-') !== (rb[j] ? rb[j].rank + '/' + rb[j].of : '-')) say(w + (j ? ' confederation' : ' world') + ' rank: ' + JSON.stringify(ra[j]) + ' v ' + JSON.stringify(rb[j])); }); }
      pubCache.day.delete(m.ts);
    }
    use(false); state.asOf = state.bounds[g].max; state.cache = {key:null};
    return {n, sides, skipped, bad}; })()`);
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
    { const a = trendData(c, 24), b = trendData(h, 24); num(a.field, b.field, 2e-6, '24-month field');
      c.all.forEach(r => { const x = a.map.get(r.key), y = b.map.get(r.key); num(x.raw, y && y.raw, 2e-6, r.key + ' change over 24 months'); same(x.lvl, y && y.lvl, r.key + ' 24-month trend'); same(x.n, y && y.n, r.key + ' matches in 24 months'); }); }
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

/* Each confederation's level and the average of its ten best teams at the end of one year, as the Confederations page's
   history chart works them out: {CONF:{level, top10}}. */
export function confYear(model, g, year){
  return model.run(`(() => { ${DEFAULT_STATE(g)}
    const r3 = x => Math.round(x * 1000) / 1000;
    const v = atDefaults(c => { const o = {}; for (const [k, s] of (c.confStats || new Map())) o[k] = {level:r3(s.level), top10:r3(s.top10)}; return o; }, Date.UTC(${+year}, 11, 31)) || {};
    ${DEFAULT_STATE(g)}
    return v; })()`);
}

/* The charts' series (Home's chart and line, a team's chart and the best ranks and peak in its history, the two lines
   on Head to head): every team's published rating and band on each date the charts sample (every four months of the
   window; 121 dates across the archive for all time), each from its own window as the site would have shown it that
   day, and for each match day of the last two years the same for the teams that played (the team chart's extra
   points). Rows are [team, rating, band, rank, rank by the bottom of the band] (ranks for the usual window only; 0: not
   ranked that day). The rating keeps two decimal places and the band one, each nudged where plain rounding would make
   the page show a different figure from the exact value (to one decimal place, or to a whole number).
   The file is then read back the way the page reads it (snapsFromFile, snapPt, teamPoints) and every point compared
   with the one the page works out; returns {file, n, bad} with bad empty when the two agree. */
export function snapSeries(model, g, allTime){
  return model.run(`(() => { ${DEFAULT_STATE(g)}
    if (${allTime ? 'true' : 'false'}){ state.windowYears = 0; state.cache = {key:null}; }
    const g = ${JSON.stringify(g)}, r1 = x => Math.round(x * 10) / 10, r2 = x => Math.round(x * 100) / 100;
    const keep = x => { const v = r2(x); return r1(v) === r1(x) && Math.round(v) === Math.round(x) ? v : r2(v - 0.01); };
    const rb = x => { const v = r1(x); return Math.round(v) === Math.round(x) ? v : r1(v - 0.1); };
    const c = getRatings(), stamps = snapshotStamps(), from = state.asOf - TEAM_DETAIL_YEARS * 365 * DAY, played = new Map();
    for (const [key, h] of c.history) for (const x of h) if (x.ts >= from && x.ts < state.asOf){ if (!played.has(x.ts)) played.set(x.ts, []); if (!played.get(x.ts).includes(key)) played.get(x.ts).push(key); }
    const days = [...played.keys()].sort((a, b) => a - b), all = stamps.concat(days), ranked = state.windowYears > 0;
    const maps = ranked ? all.map(t => runWindow(windowStartFor(t), t)) : allTimeMaps(all);
    const teams = [], idx = new Map(), id = k => { if (!idx.has(k)){ idx.set(k, teams.length); teams.push(k); } return idx.get(k); };
    const rows = (mp, ts, keys) => { const R = ranked ? ranksIn(mp, ts) : null, out = [];
      for (const key of keys){ const p = statePt(mp, key, ts); if (!p) continue;
        out.push(R ? [id(key), keep(p.r), rb(p.b), R.byR.get(key) || 0, R.byLo.get(key) || 0] : [id(key), keep(p.r), rb(p.b)]); }
      return out; };
    const file = {v:1, g, windowYears:state.windowYears, asOf:fmtDate(state.asOf), print:matchListPrint(state.matches[g]), stamps, teams,
      pts:stamps.map((ts, i) => rows(maps[i], ts, maps[i].keys())), days:days.map((ts, j) => [ts, rows(maps[stamps.length + j], ts, played.get(ts))])};
    /* Read back as the page reads it, and compared point by point with the model's own. */
    const bad = [], say = s => { if (bad.length < 12) bad.push(s); }; let n = 0;
    const S = snapsFromFile(JSON.parse(JSON.stringify(file)), snapKey(), stamps), M = {key:snapKey(), stamps, maps:maps.slice(0, stamps.length)};
    if (!S) say('the page refused the file');
    else {
      const same = (a, b, w) => { n++;
        if (!a !== !b) return say(w + ': ' + JSON.stringify(a) + ' v ' + JSON.stringify(b));
        if (a && !(Math.abs(a.r - b.r) <= 0.0101 && fmtR(a.r) === fmtR(b.r) && Math.round(a.r) === Math.round(b.r) && Math.abs(a.b - b.b) <= 0.1001 && Math.round(a.b) === Math.round(b.b)))
          say(w + ': ' + a.r + ' ±' + a.b + ' v ' + b.r + ' ±' + b.b); };
      stamps.forEach((ts, k) => { for (const key of maps[k].keys()) same(snapPt(M, k, key), snapPt(S, k, key), fmtDate(ts) + ' ' + key);
        n++; if (S.rows[k].size !== [...maps[k].keys()].filter(key => statePt(maps[k], key, ts)).length) say(fmtDate(ts) + ': a different number of teams'); });
      const dayMap = new Map(days.map((ts, j) => [ts, maps[stamps.length + j]]));
      for (const [key, h] of c.history){
        const extra = [...new Set(h.filter(x => x.ts >= from && x.ts < state.asOf).map(x => x.ts))];
        const A = teamPoints(M, key, extra, extra.map(t => dayMap.get(t))), B = teamPoints(S, key, extra, extra.map(() => null));
        n++; if (A.length !== B.length){ say(key + ': ' + A.length + ' points v ' + B.length); continue; }
        A.forEach((a, i) => { const b = B[i], w = key + ' ' + fmtDate(a.ts);
          n++; if (a.ts !== b.ts || a.match !== b.match) say(w + ': the points differ');
          same(a.v, b.v, w);
          if (ranked){ const x = a.rk(), y = b.rk(); n++; if (x.r !== y.r || x.lo !== y.lo) say(w + ' ranks: ' + JSON.stringify(x) + ' v ' + JSON.stringify(y)); } });
      }
    }
    state.windowYears = DEFAULTS.windowYears; state.cache = {key:null};
    return {file, n, bad, days:days.length}; })()`);
}

/* Edition pages (a World Cup, a year of qualifying...): every edition of a game as [{id, name, print}], where name is
   the file's name and print the number the page checks a file against (the page's own edPrint). */
export function editionList(model, g, allTime){
  return model.run(`(() => { ${DEFAULT_STATE(g)}
    if (${allTime ? 'true' : 'false'}) state.windowYears = 0;
    const out = getEditions().list.map(e => ({id:e.id, name:edFileName(e.id), print:edPrint(e)}));
    state.windowYears = DEFAULTS.windowYears; return out; })()`);
}
/* One edition's figures as the page works them out (editionRun), written with the page's own edToFile, read back with
   its edFromFile and compared field by field. Returns {file, n, bad}; bad is empty when the two agree. */
export function editionFile(model, g, id, allTime){
  return model.run(`(() => { ${DEFAULT_STATE(g)}
    if (${allTime ? 'true' : 'false'}) state.windowYears = 0;
    const e = getEditions().byId.get(${JSON.stringify(id)}), bad = [], say = s => { if (bad.length < 12) bad.push(s); }; let n = 0;
    state.useTableFiles = false; state.edCache = null;
    const D = editionRun(e), file = edToFile(e, D), B = edFromFile(e, JSON.parse(JSON.stringify(file)));
    state.edCache = null;
    if (!B){ state.windowYears = DEFAULTS.windowYears; return {file, n, bad:['the page refused the file']}; }
    const eq = (a, b, w) => { n++; if (a !== b) say(w + ': ' + a + ' v ' + b); };
    const num = (a, b, w, tol) => { n++; if (a === null || a === undefined || b === null || b === undefined ? a !== b : !(Math.abs(a - b) <= (tol || 5.1e-7))) say(w + ': ' + a + ' v ' + b); };
    const pt = (a, b, w) => { if (!a || !b) return eq(a || null, b || null, w); num(a.r, b.r, w + ' rating'); num(a.rd, b.rd, w + ' rd'); };
    eq(D.counted, B.counted, 'counted'); eq(D.preTs, B.preTs, 'day before'); eq(D.rows.length, B.rows.length, 'matches'); eq(D.teams.length, B.teams.length, 'teams'); eq(D.preTop.length, B.preTop.length, 'ranked teams'); eq(D.worldTier.size, B.worldTier.size, 'tiers');
    D.rows.forEach((a, i) => { const b = B.rows[i], w = 'match ' + i; if (!b) return;
      eq(a.m, b.m, w + ' match'); eq(a.home, b.home, w + ' home'); eq(a.away, b.away, w + ' away'); eq(a.hn, b.hn, w + ' name'); eq(a.an, b.an, w + ' name');
      pt(a.hPre, b.hPre, w + ' home before'); pt(a.aPre, b.aPre, w + ' away before'); pt(a.hPost, b.hPost, w + ' home after'); pt(a.aPost, b.aPost, w + ' away after'); num(a.exp, b.exp, w + ' expected', 5.1e-7); });
    D.teams.forEach((a, i) => { const b = B.teams[i], w = a.key; if (!b) return;
      for (const f of ['key', 'team', 'preRank', 'postRank', 'confTier', 'conf', 'worldTier', 'p', 'w', 'd', 'l', 'gf', 'ga']) eq(a[f], b[f], w + ' ' + f);
      pt(a.pre, b.pre, w + ' before'); pt(a.post, b.post, w + ' after'); num(a.change, b.change, w + ' change', 1.01e-6); num(a.fromMatches, b.fromMatches, w + ' from matches', 1.01e-6);
      eq(a.steps.length, b.steps.length, w + ' steps'); a.steps.forEach((v, j) => num(v, b.steps[j], w + ' step ' + j)); });
    D.preTop.forEach((a, i) => { const b = B.preTop[i]; if (!b) return; eq(a.key, b.key, 'ranked ' + i); eq(a.rank, b.rank, 'rank ' + i); num(a.r, b.r, 'ranked ' + i + ' rating'); num(a.rd, b.rd, 'ranked ' + i + ' rd');
      eq(D.worldTier.get(a.key), B.worldTier.get(a.key), 'tier of ' + a.key); });
    /* The chances going in: what they are made from must be the page's own, and a short run of the tournament from the
       file (with the file's rounded ratings) must not need the engine. */
    { const LT = lmTable(D.preTs), G = goalsModel(state.gender, D.preTs), fc = B.fc;
      eq(!!fc, true, 'forecast figures'); if (fc){
        eq(!!fc.lm, !!LT, 'all-time table'); if (fc.lm && LT) for (const [k, v] of fc.lm) eq(v, LT.get(k), 'all-time rating of ' + k);
        eq(!!fc.gm, !!G, 'goals figures'); if (fc.gm && G){ eq(fc.gm.mu, G.mu, 'goals level'); for (const [k, v] of fc.gm.att){ eq(v, G.att.get(k), 'attack of ' + k); eq(fc.gm.def.get(k), G.def.get(k), 'defence of ' + k); } }
        for (const T of D.teams){ if (LT) eq(fc.lm.has(T.key), LT.has(T.key), 'all-time rating listed for ' + T.key); if (G) eq(fc.gm.att.has(T.key), G.att.has(T.key), 'goals figures listed for ' + T.key); }
        const fmt = editionFormat(e);
        if (fmt.ok){ let runs = 0; const rw = runWindow, gm = goalsModel; runWindow = function(){ runs++; return rw.apply(this, arguments); }; goalsModel = function(){ runs++; return gm.apply(this, arguments); };
          let R = null; try { R = simEdition(e, B, fmt, 40); } finally { runWindow = rw; goalsModel = gm; }
          eq(runs, 0, 'engine runs while simulating from the file'); eq(!!R && R.runs === 40, true, 'a short simulation from the file'); } } }
    state.windowYears = DEFAULTS.windowYears;
    return {file, n, bad}; })()`);
}

/* Records: the entries the page's lists can show (the page's own recordsToFile), read back with its recordsFromFile.
   The check draws the Records page both ways, from the replay and from the file, for all time with each spacing of
   the peaks and for every year, and compares what is drawn. Returns {file, n, bad}. */
export function recordsFile(model, g){
  return model.run(`(() => { ${DEFAULT_STATE(g)}
    const g = ${JSON.stringify(g)}, bad = [], say = s => { if (bad.length < 12) bad.push(s); }, key = g + '|' + state.historicalNames + '|' + HOME_VER;
    state.useTableFiles = false; state.recCache = {};
    const D = recordsData(g), file = recordsToFile(g, D), B = recordsFromFile(g, JSON.parse(JSON.stringify(file)));
    if (!B) return {file, n:0, bad:['the page refused the file']};
    const years = [...new Set(D.rows.map(x => new Date(x.ts).getUTCFullYear()))], views = [{}].concat(REC_YEARS_APART.map(sp => ({sp:String(sp)})), years.map(y => ({y:String(y)})));
    const savedP = state.params, draw = (X, params) => { state.recCache = {[key]:X}; state.params = params; viewRecords(); return document.getElementById('app').innerHTML; };
    let n = 0;
    for (const v of views){ const a = draw(D, v), b = draw(B, v); n++; if (a !== b){ let i = 0; while (a[i] === b[i]) i++; say(JSON.stringify(v) + ': ' + a.slice(Math.max(0, i - 60), i + 40).replace(/<[^>]+>/g, ' ') + ' v ' + b.slice(Math.max(0, i - 60), i + 40).replace(/<[^>]+>/g, ' ')); } }
    state.params = savedP; state.recCache = {};
    return {file, n, bad, rows:D.rows.length, kept:file.rows.length, series:D.series.length, keptSeries:file.series.length}; })()`);
}
/* Each team's all-time history figures (the page's histToFile), read back with its histFromFile and compared team by
   team: best ranks, peak, and everything the history lines are made from. Returns {file, n, bad}. */
export function histFile(model, g){
  return model.run(`(() => { ${DEFAULT_STATE(g)}
    const g = ${JSON.stringify(g)}, bad = [], say = s => { if (bad.length < 12) bad.push(s); }; let n = 0;
    state.useTableFiles = false; state.histAllCache = {};
    const H = histAll(g), file = histToFile(g, H), B = histFromFile(g, JSON.parse(JSON.stringify(file)));
    state.histAllCache = {};
    if (!B) return {file, n, bad:['the page refused the file']};
    const eq = (a, b, w) => { n++; if (a !== b) say(w + ': ' + a + ' v ' + b); }, num = (a, b, w) => { n++; if (a === undefined || b === undefined ? a !== b : !(Math.abs(a - b) <= 5.1e-7)) say(w + ': ' + a + ' v ' + b); };
    eq(H.items.size, B.items.size, 'teams'); eq(H.peak.size, B.peak.size, 'peaks'); eq(H.best.size, B.best.size, 'best ranks');
    for (const [k, items] of H.items){ const it = B.items.get(k) || [], S = histStats(items), T = histStats(it), x = H.best.get(k) || {}, y = B.best.get(k) || {}, p = H.peak.get(k), q = B.peak.get(k);
      for (const f of ['r', 'lo']){ eq(x[f] ? x[f].n : null, y[f] ? y[f].n : null, k + ' best ' + f); eq(x[f] ? x[f].ts : null, y[f] ? y[f].ts : null, k + ' best ' + f + ' date'); }
      eq(!!p, !!q, k + ' peak'); if (p && q){ num(p.r, q.r, k + ' peak rating'); num(p.band, q.band, k + ' peak band'); eq(p.ts, q.ts, k + ' peak date'); eq(p.nm, q.nm, k + ' peak name'); }
      eq(S.n, T.n, k + ' matches');
      for (const f of ['win', 'loss', 'upWin', 'upLoss']){ eq(S[f] ? S[f].m : null, T[f] ? T[f].m : null, k + ' ' + f);
        if (S[f] && T[f]){ eq(S[f].gf, T[f].gf, k + ' ' + f + ' score'); eq(S[f].opp, T[f].opp, k + ' ' + f + ' opponent'); eq(S[f].nm, T[f].nm, k + ' ' + f + ' name'); } }
      if (S.upWin && T.upWin) num(S.upWin.p, T.upWin.p, k + ' upset win chance'); if (S.upLoss && T.upLoss) num(S.upLoss.q, T.upLoss.q, k + ' upset loss chance');
      for (const f of ['wRun', 'uRun']){ eq(S[f] ? S[f].n : null, T[f] ? T[f].n : null, k + ' ' + f); if (S[f] && T[f]){ eq(S[f].from.m, T[f].from.m, k + ' ' + f + ' from'); eq(S[f].to.m, T[f].to.m, k + ' ' + f + ' to'); } }
      items.forEach((a, i) => { const b = it[i]; if (!b || a.m !== b.m || a.gf !== b.gf || a.ga !== b.ga || a.opp !== b.opp || a.nm !== b.nm || a.ts !== b.ts){ n++; say(k + ' match ' + i + ' differs'); } }); n += items.length; }
    return {file, n, bad}; })()`);
}

/* Stage 4: what today's forecasts are made from (the page's fcToFile): every team in the all-time table, the goals
   figures, and for each listed fixture what a result would do to both ratings. Read back the way the page reads it,
   then every listed fixture's forecast and stakes, the goals figures and a sample of other pairs are compared with
   what the page works out itself. fixtures: the game's list from data/fixtures.json. Returns {file, n, bad}. */
export function fcFile(model, g, fixtures){
  model.run(`__fxl = ${JSON.stringify(JSON.stringify(fixtures || []))}`);
  return model.run(`(() => { ${DEFAULT_STATE(g)}
    const g = ${JSON.stringify(g)}, fixtures = JSON.parse(__fxl), bad = [], say = s => { if (bad.length < 12) bad.push(s); }; let n = 0;
    const clear = () => { for (const k of Object.keys(lmCache)) delete lmCache[k]; for (const k of Object.keys(lmTabCache)) delete lmTabCache[k]; gmCache = {}; state.cache = {key:null}; };
    state.useTableFiles = false; state.fcFiles = {}; state.tableFiles = {}; clear();
    const c = getRatings(), file = fcToFile(g, fixtures), tf = JSON.parse(JSON.stringify(tableToFile(c)));
    const fp = fx => { const f = fixturePrediction(c0, fx); return f.p ? [f.p.home, f.p.draw, f.p.away, f.sl.xg[0], f.sl.xg[1], f.sl.pick[0], f.sl.pick[1], f.E] : null; };
    const pairs = []; { const T = c.table; for (let i = 0; i < T.length; i += 7) for (let j = 3; j < T.length; j += 31) if (i !== j) pairs.push({home:T[i].team, away:T[j].team, date:fmtDate(state.asOf), neutral:(i + j) % 2 === 0, country:(i + j) % 2 ? T[i].team : undefined, tournament:'Friendly'}); }
    let c0 = c; const A = fixtures.concat(pairs).map(fp), SA = fixtures.map(fx => { const q = stakeQuery(c, fx); return q ? ratingStakes(c, q.ka, q.kb, q.neutral, q.k) : null; });
    const GA = goalsStats(c, 'med'), lmA = lmTable();
    /* the published copy: today's table and the forecast file, no model */
    state.useTableFiles = true; state.tableFiles = {[g]:tf}; state.fcFiles = {[g]:JSON.parse(JSON.stringify(file))}; clear();
    let runs = 0; const rw = runWindow; runWindow = function(){ runs++; return rw.apply(this, arguments); };
    c0 = getRatings(); n++; if (!c0.fromFile) say('the table was not read from its file');
    const B = fixtures.concat(pairs).map(fp), SB = fixtures.map(fx => { const q = stakeQuery(c0, fx); return q ? ratingStakes(c0, q.ka, q.kb, q.neutral, q.k) : null; });
    const GB = goalsStats(c0, 'med'), lmB = lmTable(), G = goalsModel(g, state.asOf);
    runWindow = rw; n++; if (runs) say('the model ran ' + runs + ' times'); n++; if (!G || !G.fromFile) say('the goals figures were not read from the file');
    A.forEach((a, i) => { const b = B[i]; n++; if (!a !== !b) return say('forecast ' + i + ': one is missing'); if (!a) return;
      a.forEach((v, j) => { n++; if (!(Math.abs(v - b[j]) <= 1e-6)) say('forecast ' + i + ' value ' + j + ': ' + v + ' v ' + b[j]); }); });
    SA.forEach((a, i) => { const b = SB[i]; n++; if (!a !== !b) return say('stakes ' + i + ': one is missing'); if (!a) return;
      a.forEach((x, j) => { n += 2; if (!(Math.abs(x.da - b[j].da) <= 5.1e-7 && Math.abs(x.db - b[j].db) <= 5.1e-7) || x.hs !== b[j].hs || x.as !== b[j].as) say('stakes ' + i + ' result ' + j + ': ' + x.da + '/' + x.db + ' v ' + b[j].da + '/' + b[j].db); }); });
    n++; if (lmA.size !== lmB.size) say('all-time table: ' + lmA.size + ' teams v ' + lmB.size); for (const [k, v] of lmA){ n++; if (lmB.get(k) !== v) say('all-time rating of ' + k); }
    n++; if (GA.map.size !== GB.map.size) say('goals figures: ' + GA.map.size + ' teams v ' + GB.map.size);
    for (const [k, v] of GA.map){ n++; if (JSON.stringify(v) !== JSON.stringify(GB.map.get(k))) say('goals figures of ' + k + ': ' + JSON.stringify(v) + ' v ' + JSON.stringify(GB.map.get(k))); }
    state.useTableFiles = false; state.tableFiles = {}; state.fcFiles = {}; clear();
    return {file, n, bad, fixtures:fixtures.length, withStakes:Object.keys(file.stakes).length, pairs:pairs.length}; })()`);
}

/* The era comparer: every year's closing table (the page's yearEndsToFile), read back the way the page reads it and
   compared with the page's own tables: every team's figures as shown, its last five results, and the chances for a
   sample of pairings across eras. Returns {file, n, bad}. */
export function yearEndsFile(model, g){
  return model.run(`(() => { ${DEFAULT_STATE(g)}
    const g = ${JSON.stringify(g)}, bad = [], say = s => { if (bad.length < 12) bad.push(s); }; let n = 0;
    const first = new Date(state.bounds[g].min).getUTCFullYear(), last = new Date(state.bounds[g].max).getUTCFullYear(), years = []; for (let y = first; y <= last; y++) years.push(y);
    state.useTableFiles = false; state.yeFiles = {}; dreamCache.clear();
    const file = yearEndsToFile(g, years), A = new Map(years.map(y => [y, dreamTeams(y)]));
    state.useTableFiles = true; state.yeFiles = {[g]:JSON.parse(JSON.stringify(file))}; dreamCache.clear();
    let runs = 0; const rw = runWindow; runWindow = function(){ runs++; return rw.apply(this, arguments); };
    const B = new Map(years.map(y => [y, dreamTeams(y)])); runWindow = rw;
    n++; if (runs) say('the model ran ' + runs + ' times');
    const eq = (a, b, w) => { n++; if (a !== b) say(w + ': ' + a + ' v ' + b); };
    for (const y of years){ const a = A.get(y), b = B.get(y); eq(b.fromFile, true, y + ' from the file'); eq(a.ts, b.ts, y + ' date'); eq(a.rows.length, b.rows.length, y + ' teams');
      a.rows.forEach((r, i) => { const q = b.rows[i], w = y + ' ' + r.key; if (!q) return;
        eq(r.key, q.key, w + ' key'); eq(r.team, q.team, w + ' name'); eq(fmtR(r.rating), fmtR(q.rating), w + ' rating'); eq(Math.round(r.rating), Math.round(q.rating), w + ' rating, whole'); eq(Math.round(r.band), Math.round(q.band), w + ' band');
        n++; if (!(Math.abs(r.rating - q.rating) <= 0.0101 && Math.abs(r.band - q.band) <= 0.0101 && Math.abs(r.rd - q.rd) <= 0.006)) say(w + ' figures: ' + r.rating + ' ±' + r.band + ' v ' + q.rating + ' ±' + q.band);
        eq(r.rank || 0, q.rank || 0, w + ' rank'); eq(r.tier || 0, q.tier || 0, w + ' tier'); eq(r.pool, q.pool, w + ' pool'); eq(r.conf, q.conf, w + ' confederation'); eq(r.ts, q.ts, w + ' date');
        eq(JSON.stringify(r.form.map(x => [x.ts, x.gf, x.ga, x.oppName])), JSON.stringify(q.form.map(x => [x.ts, x.gf, x.ga, x.oppName])), w + ' last five'); }); }
    /* chances across eras: the best side of every fifth year against the best of every seventh */
    const best = D => D.rows.slice().sort((x, y) => y.rating - x.rating)[0];
    for (let i = 0; i < years.length; i += 5) for (let j = 2; j < years.length; j += 7){ const ya = years[i], yb = years[j], f = M => { const a = best(M.get(ya)), b = best(M.get(yb)); return a && b ? probsFromE(predictE({r:a.rating, rd:a.rd}, {r:b.rating, rd:b.rd}, 0)) : null; };
      const p = f(A), q = f(B); n++; if (!p !== !q || (p && !(Math.abs(p.home - q.home) <= 1e-4 && Math.abs(p.draw - q.draw) <= 1e-4))) say(ya + ' v ' + yb + ' chances: ' + JSON.stringify(p) + ' v ' + JSON.stringify(q)); }
    state.useTableFiles = false; state.yeFiles = {}; dreamCache.clear();
    return {file, n, bad, years:years.length, rows:file.years.reduce((t, x) => t + x[1].length, 0)}; })()`);
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
  const what = (process.env.PRECOMPUTE_WHAT || 'days,matches,ed').split(',').filter(Boolean);
  for (const g of ['men', 'women']){
    /* The month-end tables are superseded by the match-day files and take most of a minute, so they are only made when asked for (PRECOMPUTE_WHAT=months,...). */
    const R = precompute(model, g, what.includes('months') ? +(process.env.PRECOMPUTE_FROM || 0) : 9999);
    const files = {['latest-' + g + '.json']:{built, ...R.latest}};
    if (R.months.stamps.length) files['months-' + g + '.json'] = {built, ...R.months};
    /* Today's table in full, at the usual window and for all time, each checked against the page before it is written. */
    for (const [name, allTime] of [['table-' + g + '.json', false], ['table-all-' + g + '.json', true]]){
      const t0 = Date.now(), F = tableFile(model, g, allTime), chk = tableCheck(model, g, allTime, F);
      if (chk.bad.length) throw new Error(`${name} does not match the page: ${chk.bad.join('; ')}`);
      files[name] = {built, ...F};
      console.log(`${name}: ${F.rows.length} teams, ${F.window.length} matches, ${chk.n} values equal to the page's (${((Date.now() - t0) / 1000).toFixed(1)} s)`); }
    /* The Forecast record's year-by-year test. */
    { const t0 = Date.now(), Y = recordYears(model, g);
      files['record-' + g + '.json'] = {built, from:2019, print:model.run(`matchListPrint(state.matches[${JSON.stringify(g)}])`), years:Y};
      console.log(`record-${g}.json: ${Y.filter(Boolean).length} years, ${Y.reduce((a, y) => a + (y ? y.n : 0), 0)} matches (${((Date.now() - t0) / 1000).toFixed(1)} s)`); }
    for (const [name, obj] of Object.entries(files)){
      const s = JSON.stringify(obj); fs.writeFileSync(path.join(OUT, name), s + '\n');
      console.log(`${name}: ${kb(s.length)} (${kb(zlib.gzipSync(s).length)} gzipped)`); }
    console.log(`${g}: today's table of ${R.latest.rows.length} teams in ${R.msLatest} ms` + (R.months.stamps.length ? `; ${R.months.stamps.length} month-end tables (${R.months.from} to ${R.months.to}) in ${(R.msMonths / 1000).toFixed(1)} s` : ''));
  }
  /* Year by year: the table after every match day (the usual window, and all time) and every match as published.
     PRECOMPUTE_WHAT=days,all,matches,ed picks which (default days,matches,ed); PRECOMPUTE_YEARS=1990-2026 limits the years. */
  const mfile = path.join(OUT, 'manifest.json'), manifest = fs.existsSync(mfile) ? JSON.parse(fs.readFileSync(mfile, 'utf8')) : {};
  const mp = modelPrint(model), force = process.env.PRECOMPUTE_FORCE === '1' || manifest.model !== mp;
  if (force) for (const k of Object.keys(manifest)) delete manifest[k];
  manifest.model = mp;
  const [y0, y1] = (process.env.PRECOMPUTE_YEARS || '').split('-').map(Number);
  /* A change to a kind of file's layout: bump its mark here and every year of it is worked out again. */
  const FORMAT = {days:'v3b:', all:'v3b:', matches:'v2c:'};   // matches v2b: the expected result to six decimal places (four moved a shown chance by a point now and then)
  const jobs = {days:(g, y) => dayTables(model, g, y, false), all:(g, y) => dayTables(model, g, y, true), matches:(g, y) => matchLedger(model, g, y)};
  for (const g of ['men', 'women']){
    const first = new Date(model.run(`state.bounds[${JSON.stringify(g)}].min`)).getUTCFullYear(), last = new Date(model.run(`state.bounds[${JSON.stringify(g)}].max`)).getUTCFullYear();
    for (const kind of what){ if (!jobs[kind]) continue;
      const t0 = Date.now(); let done = 0, kept = 0, bytes = 0, gz = 0;
      for (let y = Math.max(first, y0 || first); y <= Math.min(last, y1 || last); y++){
        const name = `${kind}/${g}/${y}.json`, file = path.join(OUT, name), print = (FORMAT[kind] || '') + inputPrint(model, g, y, kind === 'all');
        if (manifest[name] === print && fs.existsSync(file)){ kept++; continue; }
        const s = JSON.stringify({built, ...jobs[kind](g, y)});
        fs.mkdirSync(path.dirname(file), {recursive:true}); fs.writeFileSync(file, s + '\n'); manifest[name] = print;
        done++; bytes += s.length; gz += zlib.gzipSync(s).length;
        fs.writeFileSync(mfile, JSON.stringify(manifest, null, 1) + '\n');
      }
      console.log(`${kind}/${g}: ${done} year${done === 1 ? '' : 's'} worked out in ${((Date.now() - t0) / 1000).toFixed(0)} s (${kb(bytes)}, ${kb(gz)} gzipped), ${kept} unchanged`);
    }
  }
  /* The Confederations page's history: every year end from 1960 (men) or 1991 (women) to last year. A year whose
     matches have not changed keeps its figures. */
  for (const g of ['men', 'women']){
    const t0 = Date.now(), name = `conf-${g}.json`, file = path.join(OUT, name), old = fs.existsSync(file) ? new Map((JSON.parse(fs.readFileSync(file, 'utf8')).years || []).map(p => [p.y, p.v])) : new Map();
    const last = new Date(model.run(`state.bounds[${JSON.stringify(g)}].max`)).getUTCFullYear(), years = [];
    let done = 0;
    for (let y = g === 'men' ? 1960 : 1991; y < last; y++){ const key = `conf/${g}/${y}`, print = 'v1:' + inputPrint(model, g, y, false);
      if (manifest[key] === print && old.has(y)) years.push({y, v:old.get(y)}); else { years.push({y, v:confYear(model, g, y)}); manifest[key] = print; done++; } }
    fs.writeFileSync(file, JSON.stringify({built, print:model.run(`matchListPrint(state.matches[${JSON.stringify(g)}])`), years}) + '\n');
    fs.writeFileSync(mfile, JSON.stringify(manifest, null, 1) + '\n');
    console.log(`${name}: ${years.length} year ends, ${done} worked out (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  }
  /* The charts' series, at the usual window and for all time. Kept while the archive and the model are unchanged. */
  for (const g of ['men', 'women']){
    const last = new Date(model.run(`state.bounds[${JSON.stringify(g)}].max`)).getUTCFullYear();
    for (const allTime of [false, true]){
      const name = `snap-${allTime ? 'all-' : ''}${g}.json`, file = path.join(OUT, name), print = 'v1:' + inputPrint(model, g, last, true);
      if (manifest[name] === print && fs.existsSync(file)){ console.log(`${name}: unchanged`); continue; }
      const t0 = Date.now(), R = snapSeries(model, g, allTime);
      if (R.bad.length) throw new Error(`${name} does not match the page: ${R.bad.join('; ')}`);
      const s = JSON.stringify({built, ...R.file}); fs.writeFileSync(file, s + '\n'); manifest[name] = print;
      fs.writeFileSync(mfile, JSON.stringify(manifest, null, 1) + '\n');
      console.log(`${name}: ${R.file.stamps.length} dates and ${R.days} match days, ${R.file.teams.length} teams, ${R.n} values equal to the page's, ${kb(s.length)} (${kb(zlib.gzipSync(s).length)} gzipped) (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    }
  }
  /* Edition pages: one small file an edition, kept while the matches that reach it are unchanged; files of editions
     that no longer exist (a new first match gives an edition a new name) are removed. */
  if (what.includes('ed')) for (const [kind, allTime] of [['ed', false], ['ed-all', true]]) for (const g of ['men', 'women']){
    const t0 = Date.now(), dir = path.join(OUT, kind, g), list = editionList(model, g, allTime), names = new Set(list.map(e => e.name + '.json'));
    if (names.size !== list.length) throw new Error(`${kind}/${g}: two editions share a file name`);
    fs.mkdirSync(dir, {recursive:true});
    let done = 0, kept = 0, gone = 0, bytes = 0, n = 0;
    for (const f of fs.readdirSync(dir)) if (!names.has(f)){ fs.unlinkSync(path.join(dir, f)); delete manifest[`${kind}/${g}/${f}`]; gone++; }
    for (const e of list){ const name = `${kind}/${g}/${e.name}.json`, file = path.join(OUT, name), print = 'v2:' + e.print;
      if (manifest[name] === print && fs.existsSync(file)){ kept++; continue; }
      const R = editionFile(model, g, e.id, allTime);
      if (R.bad.length) throw new Error(`${name} does not match the page: ${R.bad.join('; ')}`);
      const s = JSON.stringify(R.file); fs.writeFileSync(file, s + '\n'); manifest[name] = print; done++; bytes += s.length; n += R.n; }
    for (const k of Object.keys(manifest)) if (k.startsWith(`${kind}/${g}/`) && !names.has(k.slice(`${kind}/${g}/`.length))) delete manifest[k];
    fs.writeFileSync(mfile, JSON.stringify(manifest, null, 1) + '\n');
    console.log(`${kind}/${g}: ${done} edition${done === 1 ? '' : 's'} worked out in ${((Date.now() - t0) / 1000).toFixed(0)} s (${kb(bytes)}, ${n} values equal to the page's), ${kept} unchanged${gone ? ', ' + gone + ' removed' : ''}`);
  }
  /* Records and the teams' all-time history: kept while the archive and the model are unchanged. */
  for (const g of ['men', 'women']){
    const last = new Date(model.run(`state.bounds[${JSON.stringify(g)}].max`)).getUTCFullYear(), print = 'v1:' + inputPrint(model, g, last, true);
    for (const [name, make] of [[`records-${g}.json`, recordsFile], [`hist-${g}.json`, histFile], [`yearends-${g}.json`, yearEndsFile]]){
      const file = path.join(OUT, name);
      if (manifest[name] === print && fs.existsSync(file)){ console.log(`${name}: unchanged`); continue; }
      const t0 = Date.now(), R = make(model, g);
      if (R.bad.length) throw new Error(`${name} does not match the page: ${R.bad.join('; ')}`);
      const s = JSON.stringify({built, ...R.file}); fs.writeFileSync(file, s + '\n'); manifest[name] = print;
      fs.writeFileSync(mfile, JSON.stringify(manifest, null, 1) + '\n');
      console.log(`${name}: ${R.kept !== undefined ? R.kept + ' of ' + R.rows + ' matches and ' + R.keptSeries + ' of ' + R.series + ' entries kept, ' + R.n + ' views drawn the same' : (R.years ? R.years + ' years, ' + R.rows + ' team-years, ' : '') + R.n + ' values equal to the page\'s'}, ${kb(s.length)} (${kb(zlib.gzipSync(s).length)} gzipped) (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    }
  }
  /* What today's forecasts are made from. Worked out on every run: the listed fixtures change through the day. */
  { const fxFile = path.join(DATA, 'fixtures.json'), FX = fs.existsSync(fxFile) ? JSON.parse(fs.readFileSync(fxFile, 'utf8')) : {};
    for (const g of ['men', 'women']){
      const t0 = Date.now(), name = `fc-${g}.json`, R = fcFile(model, g, FX[g] || []);
      if (R.bad.length) throw new Error(`${name} does not match the page: ${R.bad.join('; ')}`);
      const s = JSON.stringify({built, ...R.file}); fs.writeFileSync(path.join(OUT, name), s + '\n');
      console.log(`${name}: ${R.file.lm.length} teams, ${R.withStakes} of ${R.fixtures} listed fixtures with their stakes, ${R.n} values equal to the page's (${R.pairs} other pairings tried), ${kb(s.length)} (${kb(zlib.gzipSync(s).length)} gzipped) (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    } }
  /* The index the pages will read first: for each game, the date of today's table and which years each kind of year
     file covers (a page asks only for the year being looked at). */
  const index = {v:1, built, games:{}};
  for (const g of ['men', 'women']){
    const span = kind => { const d = path.join(OUT, kind, g), ys = fs.existsSync(d) ? fs.readdirSync(d).map(f => +f.replace('.json', '')).filter(Boolean).sort((a, b) => a - b) : [];
      return ys.length ? {from:ys[0], to:ys[ys.length - 1], missing:ys.length === ys[ys.length - 1] - ys[0] + 1 ? undefined : Array.from({length:ys[ys.length - 1] - ys[0] + 1}, (_, i) => ys[0] + i).filter(y => !ys.includes(y))} : null; };
    index.games[g] = {asOf:model.run(`fmtDate(state.bounds[${JSON.stringify(g)}].max)`), table:`table-${g}.json`, tableAll:`table-all-${g}.json`, record:`record-${g}.json`, snap:`snap-${g}.json`, snapAll:`snap-all-${g}.json`,
      days:span('days'), all:span('all'), matches:span('matches')};
  }
  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index) + '\n');
  console.log('index.json: ' + JSON.stringify(index.games));
}
