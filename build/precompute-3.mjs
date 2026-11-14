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
//   hist-<g>.json      each team's all-time history figures: best ranks, peak, biggest upsets, each as the run of
//                      records in the order they were set, so the page can answer for any past date.
//   goals/<g>/<y>.json the goals figures (attack and defence) for any date of a year.
//   ranks/<g>/<y>.json old ranks under every band limit and both rank orders, a row a match beside matches/<g>/<y>.json.
//   best/<g>/<team>.json  a team's best rank (under every band limit, in each order) and peak rating over every day of
//                      the twelve years ending on any date, with the day each was first held (bestSeries below).
//   histw-<g>.json     the same records without the minimum number of ranked teams, for the "all time" window.
//   histr-<g>.json     beside hist-<g>.json: every team's all-time best ranks under every band limit.
//   snapr-<g>.json, snapr-all-<g>.json, seriesr/<g>/<decade>.json  beside the snap files and series/: the same dates' ranks under every band limit.
//   series/<g>/<decade>.json  the chart on a past date: every team's rating, band and ranks on the first day of each
//                      quarter (a team's match days come from matches/, the date itself from days/).
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
    /* And a band just over a whole number (150.04) is kept as 150.1, not 150.0: a band limit is a whole number, so the
       page then ranks the same teams as the model under any limit a visitor picks. */
    /* Two decimal places since 13 Nov 2026 (one before): what the page adds up from these (a trend, the gap between two
       tiers, the ends of "likely between") then lands on the site's own figure but for a rare rounding edge. */
    const rb = x => { let v = r2(x); if (Math.round(v) !== Math.round(x)) v = r2(v - 0.01); const k = Math.floor(x); return x > k && v <= k ? r2(k + 0.01) : v; };
    const keep = x => { const v = r2(x); return r1(v) === r1(x) && Math.round(v) === Math.round(x) ? v : r2(v + (v > x ? -0.01 : 0.01)); };
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
    if (y0 >= B.min) set.add(y0);   // 1 January always has a full table, so a date never reaches back into the year before
    for (const t of [...set].sort((a, b) => a - b)) if (t >= B.min && t <= y1) days.push(t);
    /* Every day of the year has its own figures (Seb, 13 Nov 2026: accurate to the day; a stored table shown for a later
       date was up to a week stale, and about one team in ten then showed a band one lower than the site's own). The
       days above get a full table. For each day in between, when no match is played and none leaves the window, the
       matches are the same and only the date moves: the table is made again from the same matches for that date
       (tableFromState; at the usual window the run itself is made again, since it starts a day later) and the file
       keeps what moved since the last full table: each team's rating and band in hundredths, the tiers and the
       cautious order where they changed, and the confederations' figures. A day on which the order of the teams or
       who is ranked changes (a band passing the limit, two close teams changing places) gets a full table instead. */
    const pools = [], tables = [], outDays = [], pw = [], gaps = [];
    const tableOn = ts => { state.asOf = ts; state.cache = {key:null}; return computeRatings(null); };
    const poolsOf = (c, ts) => [...new Set(c.table.map(r => r.pool))].filter(p => p && p !== 'UNKNOWN').map(p => { const o = poolAt(c.st, p, ts); return [p, r2(o.m), r2(o.w)]; });
    /* What a team's band is made of: the day's reference level of confederation doubt, then each confederation's own
       (every team's, ranked or not). With these the page splits a band back into the team's own doubt and its
       confederation's, as it needs to for a chance against another side. */
    const pwOf = (c, ts) => [r2(poolRef(c.st, ts))].concat([...new Set(c.all.map(r => r.pool))].map(p => { const o = poolAt(c.st, p, ts); return [p, r2(o.w), r2(o.m)]; }));
    /* A row also carries the team's place among all teams by the bottom of its band (the cautious order, exact: the
       rounded numbers here cannot give it), and a 1 at the end for a team cut off from the main body. With these
       the day's table can be ranked exactly under any band limit and either order. */
    const loOf = c => { const m = new Map(c.all.slice().sort((a, b) => b.lower - a.lower).map((r, i) => [r.key, i + 1])); return c.all.map(r => m.get(r.key)); };
    let base = null;   // the last full table: the rounded figures the days after it are counted from
    const put = (ts, c) => { outDays.push(ts); pools.push(poolsOf(c, ts)); pw.push(pwOf(c, ts)); gaps.push([]);
      const lo = loOf(c), R = c.all.map(r => keep(r.rating)), Bd = c.all.map(r => rb(r.band));
      tables.push(c.all.map((r, i) => { const row = [id(r.key), R[i], Bd[i], r.rank || 0, r.tier || 0, lo[i]]; if (r.island) row.push(1); return row; }));
      base = {c, R, Bd, lo, keys:c.all.map(r => r.key).join('|'), ranks:c.all.map(r => r.rank || 0).join()}; };
    const trim = a => { let k = a.length; while (k && !a[k - 1]) k--; return k ? a.slice(0, k) : 0; };
    /* The table for a day with the same matches as the last full one. */
    const again = ts => { state.asOf = ts; const ws = windowStartFor(ts);
      return tableFromState(state.windowYears > 0 ? runWindow(ws, ts) : base.c.st, base.c.history, ws, ts, null, null); };
    const between = (ts, x) => { const lo = loOf(x), t = [];
      x.all.forEach((r, i) => { const was = base.c.all[i].tier || 0; if ((r.tier || 0) !== was) t.push([i, r.tier || 0]); });
      gaps[gaps.length - 1].push([trim(x.all.map((r, i) => Math.round((keep(r.rating) - base.R[i]) * 100))), trim(x.all.map((r, i) => Math.round((rb(r.band) - base.Bd[i]) * 100))),
        t.length ? t : 0, lo.some((v, i) => v !== base.lo[i]) ? lo : 0, poolsOf(x, ts), pwOf(x, ts)]); };
    let gapN = 0, fullN = 0, tried = 0; const bad = [];
    days.forEach((ts, k) => { put(ts, tableOn(ts));
      const next = k + 1 < days.length ? days[k + 1] : Math.min(y1 + DAY, B.max + DAY);
      for (let t = ts + DAY; t < next; t += DAY){ const x = again(t);
        /* every thirtieth such day the short way is compared with the whole table worked out afresh for that date */
        if (gapN++ % 30 === 0){ tried++; const e = tableOn(t), by = new Map(x.all.map(r => [r.key, r]));
          if (e.all.length !== x.all.length) bad.push(fmtDate(t) + ': ' + x.all.length + ' teams v ' + e.all.length);
          else for (const r of e.all){ const q = by.get(r.key); if (!q || keep(q.rating) !== keep(r.rating) || rb(q.band) !== rb(r.band) || (q.rank || 0) !== (r.rank || 0) || (q.tier || 0) !== (r.tier || 0) || !!q.island !== !!r.island){ if (bad.length < 6) bad.push(fmtDate(t) + ' ' + r.key + ': ' + (q ? q.rating + ' ±' + q.band + ' #' + q.rank + ' T' + q.tier : 'missing') + ' v ' + r.rating + ' ±' + r.band + ' #' + r.rank + ' T' + r.tier); break; } } }
        if (x.all.map(r => r.key).join('|') !== base.keys || x.all.map(r => r.rank || 0).join() !== base.ranks){ put(t, tableOn(t)); fullN++; } else between(t, x); } });
    if (bad.length) throw new Error('a day between match days, made again from the same matches, differs from the table worked out afresh: ' + bad.join('; '));
    days.length = 0; outDays.forEach(t => days.push(t));
    state.windowYears = DEFAULTS.windowYears; state.asOf = B.max; state.cache = {key:null};
    return {v:6, year:Y, window:${allTime ? "'all'" : 'DEFAULTS.windowYears'}, matches:n, teams, days:days.map(fmtDate), tables, pools, pw, gaps, between:gapN, promoted:fullN, tried};
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
/* A year of "all time" tables (file.window === 'all') is checked the same way with the window set to all time; the page
   then also needs today's all-time table file (tableAll), which it reads each match's ratings from, and those are
   compared with the model's too. */
export function dayCheck(model, g, file, i, shift, before, set, tableAll){
  model.run(`__df = ${JSON.stringify(JSON.stringify(file))}; __dp = ${JSON.stringify(JSON.stringify(before || []))}; __ta = ${JSON.stringify(JSON.stringify(tableAll || null))}`);
  return model.run(`(() => { ${DEFAULT_STATE(g)}
    const g = ${JSON.stringify(g)}, F = JSON.parse(__df), i = ${+i}, ts = Date.parse(F.days[i] + 'T00:00:00Z'), bad = [], say = s => { if (bad.length < 12) bad.push(s); };
    /* set: {maxBand, rankBy}. The day's table is then ranked again on the page from numbers kept to one decimal place:
       by rating the order is still exact (the file's rows are in that order); by the bottom of the band two teams
       within a rounding of each other can change places (rankOff counts them; more than one place is a failure), and a
       team exactly on the band limit can fall either side (edgeOff). Tiers are cut again, so they can differ (tierDiffs). */
    const SET = ${JSON.stringify(set || null)};
    if (SET){ state.maxBand = SET.maxBand; state.rankBy = SET.rankBy; }
    const ALL = F.window === 'all', dk = y => (ALL ? 'all|' : '') + g + '|' + y; if (ALL) state.windowYears = 0;
    const done = () => { state.maxBand = DEFAULTS.maxBand; state.rankBy = DEFAULTS.rankBy; state.windowYears = DEFAULTS.windowYears; state.tableFiles = {}; state.asOf = state.bounds[g].max; state.cache = {key:null}; };
    let n = 0, tierDiffs = 0, pN = 0, pOff = 0, rankOff = 0, edgeOff = 0; const OWN_TOL = 0.2, P_TOL = 0.004;
    const num = (a, b, tol, what) => { n++; if ((a == null) !== (b == null) || (a != null && !(Math.abs(a - b) <= tol))) say(what + ': ' + a + ' v ' + b); };
    const same = (a, b, what) => { n++; if (a !== b && !(a == null && b == null)) say(what + ': ' + a + ' v ' + b); };
    state.asOf = ts + ${+(shift || 0)} * DAY; state.cache = {key:null};
    const c = computeRatings(null), drift = F.gaps ? 0 : ${+(shift || 0)} * 0.06;   // layout 6: the date's own figures, nothing drifts
    state.useTableFiles = true; state.dayFiles = {[dk(F.year)]:F}; for (const P of JSON.parse(__dp)) state.dayFiles[dk(P.year)] = P;
    if (ALL) state.tableFiles = {['all-' + g]:JSON.parse(__ta)};
    state.dayCache = null; state.asOf = ts + ${+(shift || 0)} * DAY; state.cache = {key:null};
    let runs = 0; const rw = runWindow; runWindow = function(){ runs++; return rw.apply(this, arguments); };
    let h; try { h = tableAt(); } finally { runWindow = rw; }
    state.useTableFiles = false; state.dayFiles = {}; state.dayCache = null;
    if (!h.lite){ say('the page did not use the file'); done(); return {n, bad, tierDiffs, pN, pOff}; }
    n++; if (runs) say('the model ran ' + runs + ' times');
    const edge = SET ? c.all.filter(r => (h.byKey.get(r.key) || {}).provisional !== r.provisional) : [];
    if (SET){ n++; edgeOff = edge.length; for (const r of edge) if (r.island || !(state.maxBand > 0 && Math.abs(r.band - state.maxBand) <= 0.1001 + ${+(shift || 0)} * 0.06)) say(r.key + ' ranked on one side only, band ' + r.band); }
    same(h.day, F.gaps ? fmtDate(ts + ${+(shift || 0)} * DAY) : F.days[i], 'day'); same(c.all.length, h.all.length, 'teams');
    if (!SET){ same(c.table.map(r => r.key).join(), h.table.map(r => r.key).join(), 'ranked order');
      same(c.provisional.map(r => r.key).sort().join(), h.provisional.map(r => r.key).sort().join(), 'provisional'); }
    else if (SET.rankBy === 'rating' && !edge.length) same(c.table.map(r => r.key).join(), h.table.map(r => r.key).join(), 'ranked order'); if (!drift) same(c.windowStart, h.windowStart, 'window start');
    num(c.median, h.median, 0.051 + drift, 'median'); same(c.tiers.length > 0, h.tiers.length > 0, 'tiers exist');
    c.all.forEach(r => { const x = h.byKey.get(r.key), w = r.key; if (!x){ say('missing ' + w); return; }
      same(r.team, x.team, w + ' name'); same(r.pool, x.pool, w + ' pool');
      if (!SET) same(r.rank, x.rank, w + ' rank');
      else if (r.rank !== x.rank){ n++; if (r.rank && x.rank && Math.abs(r.rank - x.rank) <= 1 + edge.length) rankOff++; else if (!edge.some(e => e.key === w)) say(w + ' rank: ' + r.rank + ' v ' + x.rank); } same(r.mp, x.mp, w + ' played'); same(r.lastTs, x.lastTs, w + ' last match');
      same(r.status, x.status, w + ' status'); same(!!r.defunct, !!x.defunct, w + ' defunct'); same(r.island, x.island, w + ' island'); if (!SET) same(r.provisional, x.provisional, w + ' provisional');
      same((r.islandWith || []).slice().sort().join(), (x.islandWith || []).slice().sort().join(), w + ' island mates');
      num(r.rating, x.rating, (F.gaps ? 0.0101 : 0.0501) + drift, w + ' rating'); num(r.band, x.band, (F.gaps ? 0.0101 : 0.1001) + drift, w + ' band'); if (!drift) same(Math.round(r.band), Math.round(x.band), w + ' band as shown');
      if (F.gaps) same(fmtR(r.rating), fmtR(x.rating), w + ' rating as shown');
      /* The band split back into the team's own doubt and its confederation's, and the chances that rest on the split. */
      num(r.w, x.w, 0.0051 + ${+(shift || 0)} * POOL_CW, w + ' confederation doubt'); num(r.rdOwn, x.rdOwn, OWN_TOL + drift, w + ' own doubt');
      for (const f of ['pVsMedian', 'pVsBench']) if (r[f] || x[f]){ if (!r[f] || !x[f]) say(w + ' ' + f + ' missing'); else for (const s of ['home', 'draw', 'away']){ num(r[f][s], x[f][s], P_TOL + drift * 0.01, w + ' ' + f + ' ' + s); pN++; if (Math.round(r[f][s] * 100) !== Math.round(x[f][s] * 100)) pOff++; } }
      num(r.change, x.change, 0.3501 + 2 * drift, w + ' change on a year'); num(r.vsMedian, x.vsMedian, 0.11 + 2 * drift, w + ' v median');
      if ((r.tier || 0) !== (x.tier || 0)) tierDiffs++;
      const a = c.history.get(w) || [], b = h.history.get(w) || []; same(a.length, b.length, w + ' matches');
      a.forEach((e, j) => { const f = b[j]; if (!f) return; if (e.m !== f.m){ say(w + ' match ' + j + ' differs'); return; }
        same(e.opp, f.opp, w + ' opponent'); same(e.oppName, f.oppName, w + ' opponent name'); same(e.name, f.name, w + ' own name'); same(e.gf, f.gf, w + ' for'); same(e.ga, f.ga, w + ' against');
        same(e.home, f.home, w + ' home'); same(e.neutral, f.neutral, w + ' neutral'); same(e.cat, f.cat, w + ' kind');
        if (ALL) for (const q of ['rating', 'rd', 'pre', 'oppPre', 'oppPost', 'delta', 'exp']) num(e[q], f[q], 2.1e-6, w + ' match ' + j + ' ' + q); }); });
    same([...c.confStats.keys()].sort().join(), [...h.confStats.keys()].sort().join(), 'confederations');
    for (const [k, a] of c.confStats){ const b = h.confStats.get(k); if (!b) continue;
      same(a.n, b.n, k + ' teams'); same(a.best.key, b.best.key, k + ' best'); num(a.level, b.level, 0.02 + drift, k + ' level'); num(a.levelBand, b.levelBand, 0.1 + drift, k + ' level band');
      num(a.top10, b.top10, 0.0501 + drift, k + ' top ten'); num(a.median, b.median, 0.0501 + drift, k + ' median'); }
    done();
    return {n, bad, tierDiffs, pN, pOff, rankOff, edgeOff, ranked:c.table.length, tiers:[c.tiers.length, h.tiers.length]}; })()`);
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
    const rb = x => { const v = r1(x); return Math.round(v) === Math.round(x) ? v : r1(v - 0.1); };
    const ms = state.matches[g], teams = [], idx = new Map(), id = k => { if (!idx.has(k)){ idx.set(k, teams.length); teams.push(k); } return idx.get(k); }, rows = [], ranks = [];
    /* Old ranks under every band limit and both rank orders (Seb, 12 Nov 2026: old ranks follow the visitor's filter).
       The day's teams are read once, then each rank is a count over them, by the same rule as the page's rankAfter:
       the team itself always counts, the others only inside the band limit. */
    const dayTeams = (st, ts) => { const ref = poolRef(st, ts), out = [];
      for (const k of st.keys()){ const p = pub(st, k, ts); if (!p) continue; const band = BAND_Z * rankRd(p, ref); out.push({k, r:p.r, lo:p.r - band, band, conf:poolOf(k, ts)}); }
      return out; };
    const rankIn = (T, key, byConf, maxBand, lower) => { const me = T.find(x => x.k === key); if (!me) return [0, 0];
      const mine = lower ? me.lo : me.r; let above = 0, n = 0;
      for (const x of T){ if (x === me || (byConf && x.conf !== me.conf) || (maxBand > 0 && x.band > maxBand)) continue; n++; if ((lower ? x.lo : x.r) > mine) above++; }
      return [above + 1, n + 1]; };
    let last = null;
    for (let i = firstIndexAt(ms, Date.UTC(Y, 0, 1)); i < ms.length && ms[i].ts < Date.UTC(Y + 1, 0, 1); i++){
      const ts = ms[i].ts; if (ts === last) continue; last = ts;
      const d = pubDay(ts), memo = {}, rk = (k, conf) => { const r = rankAfter(memo, k, ts, conf); return r ? [r.rank, r.of] : [0, 0]; };
      /* Each side's closing figures for the day, as a chart draws them: rating, band, and the two ranks (by rating
         and by the bottom of the band). The chart on a past date reads a team's match days from here. */
      const R = ranksIn(d.st, ts), close = k => { const p = statePt(d.st, k, ts); return [keep(p.r), rb(p.b), R.byR.get(k) || 0, R.byLo.get(k) || 0]; };
      for (const [m, x] of d) rows.push([fmtDate(ts), id(x.home), id(x.away), m.hs, m.as, keep(x.A.r), keep(x.B.r), keep(x.nA.r), keep(x.nB.r),
        Math.round(BAND_Z * x.nA.rd), Math.round(BAND_Z * x.nB.rd), Math.round(x.expHome * 1e6) / 1e6,
        ...rk(x.home, false), ...rk(x.home, true), ...rk(x.away, false), ...rk(x.away, true), ...close(x.home), ...close(x.away)]);
      { const T = dayTeams(d.st, ts), saved = state.maxBand, RB = BAND_OPTIONS.map(b => { state.maxBand = b; d.st._refTs = null; return ranksIn(d.st, ts); }); state.maxBand = saved; d.st._refTs = null;
        for (const [m, x] of d){ const row = [];
          for (const b of BAND_OPTIONS) for (const lower of [false, true]) for (const k of [x.home, x.away]) for (const byConf of [false, true]) row.push(...rankIn(T, k, byConf, b, lower));
          RB.forEach(R => { for (const k of [x.home, x.away]) row.push(R.byR.get(k) || 0, R.byLo.get(k) || 0); });
          ranks.push(row); } }
      pubCache.day.delete(ts);
    }
    return {v:2, year:Y, teams, rows, ranks};
  })()`);
}

/* Reads a year of matches back with the page's own lookups (pubEntry and rankAfter with the file switched on) and
   compares every side of every match with what the page works out. Ratings may differ by the file's one decimal place
   (the change by 0.1, being the difference of the two ratings as shown); ranks must be equal. */
export function ledgerCheck(model, g, file, ranksFile, sample){
  model.run(`__lf = ${JSON.stringify(JSON.stringify(file))}; __rf2 = ${JSON.stringify(JSON.stringify(ranksFile || null))}`);
  return model.run(`(() => { ${DEFAULT_STATE(g)}
    const g = ${JSON.stringify(g)}, F = JSON.parse(__lf), Y = F.year, ms = state.matches[g], bad = [], say = s => { if (bad.length < 12) bad.push(s); };
    let n = 0, sides = 0, skipped = 0, closes = 0, dayTs = null, dayN = 0, dayMap = null, dayR = null;
    const num = (a, b, tol, what) => { n++; if (!(Math.abs(a - b) <= tol)) say(what + ': ' + a + ' v ' + b); };
    const RF = JSON.parse(__rf2), SAMPLE = ${sample ? 'true' : 'false'}; let rankN = 0, dayD = null, seenTs = null, seenN = 0;
    const use = on => { state.useTableFiles = on; state.ledgerFiles = on ? {[g + '|' + Y]:ledgerIndex(F)} : {}; state.rankFiles = on && RF ? {[g + '|' + Y]:RF} : {}; pubCache.key = null; };
    for (let i = firstIndexAt(ms, Date.UTC(Y, 0, 1)); i < ms.length && ms[i].ts < Date.UTC(Y + 1, 0, 1); i++){
      const m = namesFor(ms[i]); if (!includeMatch(m)) continue;
      /* sample: only every fifth match day is looked at (the build's own quick check on each run) */
      if (SAMPLE){ if (m.ts !== seenTs){ seenTs = m.ts; seenN++; } if (seenN % 5 !== 1) continue; }
      for (const key of [m._h, m._a]){ const base = {ts:m.ts, m}, w = fmtDate(m.ts) + ' ' + key;
        use(false); const a = pubEntry(base, key), ra = [rankAfter({}, key, m.ts, false), rankAfter({}, key, m.ts, true)];
        use(true); const hit = ledgerRow(key, m.ts, m), b = pubEntry(base, key), rb = [rankAfter({}, key, m.ts, false), rankAfter({}, key, m.ts, true)];
        if (!hit){ skipped++; continue; }
        sides++;
        if (!a.published || !b.published){ say(w + ': not published'); continue; }
        num(a.pre, b.pre, 0.0101, w + ' before'); num(a.rating, b.rating, 0.0101, w + ' after'); num(a.oppPre, b.oppPre, 0.0101, w + ' opponent before'); num(a.oppPost, b.oppPost, 0.0101, w + ' opponent after');
        for (const f of ['pre', 'rating', 'oppPre', 'oppPost']){ n++; if (Math.round(a[f]) !== Math.round(b[f]) || Math.round(a[f] * 10) !== Math.round(b[f] * 10)) say(w + ' ' + f + ' as shown: ' + a[f] + ' v ' + b[f]); }
        num(a.delta, b.delta, 0.1001, w + ' change'); num(a.exp, b.exp, 5.1e-7, w + ' expected'); num(BAND_Z * a.rd, BAND_Z * b.rd, 0.501, w + ' band');
        [0, 1].forEach(j => { n++; if ((ra[j] ? ra[j].rank + '/' + ra[j].of : '-') !== (rb[j] ? rb[j].rank + '/' + rb[j].of : '-')) say(w + (j ? ' confederation' : ' world') + ' rank: ' + JSON.stringify(ra[j]) + ' v ' + JSON.stringify(rb[j])); });
        /* The day's closing figures, against the chart's own way of getting them (a run of the window to that day);
           every fifth match day, each being one more run. */
        if (m.ts !== dayTs){ dayTs = m.ts; dayN++; dayMap = SAMPLE || dayN % 5 === 1 ? runWindow(windowStartFor(m.ts), m.ts) : null; dayR = dayMap ? ranksIn(dayMap, m.ts) : null;
          if (dayMap && RF){ use(false); dayD = pubDay(m.ts); use(true); } }
        if (dayMap){ const P = statePt(dayMap, key, m.ts), C = ledgerClose(key, m.ts); closes++;
          n++; if (!C || !P) say(w + ' closing figures missing');
          else { n++; if (!(Math.abs(C[1] - P.r) <= 0.0101 && fmtR(C[1]) === fmtR(P.r) && Math.round(C[1]) === Math.round(P.r) && Math.abs(C[2] - P.b) <= 0.1001 && Math.round(C[2]) === Math.round(P.b))) say(w + ' closing: ' + C[1] + ' ±' + C[2] + ' v ' + P.r + ' ±' + P.b);
            n++; if (C[3] !== (dayR.byR.get(key) || 0) || C[4] !== (dayR.byLo.get(key) || 0)) say(w + ' closing ranks: ' + C[3] + '/' + C[4] + ' v ' + dayR.byR.get(key) + '/' + dayR.byLo.get(key)); }
          /* The same day under every band limit and both rank orders: the ranks file against the page's own working
             (rankAfter with the files off, and the chart's ranks from the run of the window). */
          if (RF) for (const b of BAND_OPTIONS) for (const order of ['rating', 'lower']){ state.maxBand = b; state.rankBy = order; const tag = w + ' (±' + b + ', ' + order + ')';
            /* the day's own working is kept in hand, so each setting does not run the window again */
            state.useTableFiles = false; state.ledgerFiles = {}; state.rankFiles = {}; pubReset(); pubCache.day.set(m.ts, dayD);
            const ea = [rankAfter({}, key, m.ts, false), rankAfter({}, key, m.ts, true)];
            use(true); const fa = [rankAfter({}, key, m.ts, false), rankAfter({}, key, m.ts, true)];
            [0, 1].forEach(j => { n++; rankN++; if ((ea[j] ? ea[j].rank + '/' + ea[j].of : '-') !== (fa[j] ? fa[j].rank + '/' + fa[j].of : '-')) say(tag + (j ? ' confederation' : ' world') + ' rank: ' + JSON.stringify(ea[j]) + ' v ' + JSON.stringify(fa[j])); });
            if (order === 'rating'){ dayMap._refTs = null; const R2 = ranksIn(dayMap, m.ts), C2 = ledgerClose(key, m.ts); n++; rankN++;
              if (!C2 || C2[3] !== (R2.byR.get(key) || 0) || C2[4] !== (R2.byLo.get(key) || 0)) say(tag + ' closing ranks: ' + (C2 ? C2[3] + '/' + C2[4] : 'none') + ' v ' + R2.byR.get(key) + '/' + R2.byLo.get(key)); }
            state.maxBand = DEFAULTS.maxBand; state.rankBy = DEFAULTS.rankBy; } } }
      pubCache.day.delete(m.ts);
    }
    use(false); state.asOf = state.bounds[g].max; state.cache = {key:null};
    return {n, sides, skipped, closes, rankN, bad}; })()`);
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
/* set: {maxBand, rankBy}, another band limit or rank order. The page then ranks the file's table again (its
   rerankTable) and that is compared with the table the model works out under the same setting; no run of the model is
   allowed while it does. */
export function tableCheck(model, g, allTime, file, set){
  model.run(`__tf = ${JSON.stringify(JSON.stringify(file))}`);
  return model.run(`(() => { ${DEFAULT_STATE(g)}
    if (${allTime ? 'true' : 'false'}){ state.windowYears = 0; state.cache = {key:null}; }
    const SET = ${JSON.stringify(set || null)}, bad = [], say = s => { if (bad.length < 12) bad.push(s); };
    if (SET){ state.maxBand = SET.maxBand; state.rankBy = SET.rankBy; state.cache = {key:null}; }
    const c = getRatings(); let h = tableFromFile(JSON.parse(__tf));
    if (SET && h){ const F = JSON.parse(__tf), rw = runWindow, cr = computeRatings; let runs = 0; runWindow = function(){ runs++; return rw.apply(this, arguments); }; computeRatings = function(){ runs++; return cr.apply(this, arguments); };
      try { h = F.pools ? rerankTable(h, new Map(F.pools.map(([p, m, w]) => [p, {m, w}]))) : null; } finally { runWindow = rw; computeRatings = cr; }
      if (runs) say('the model ran ' + runs + ' times'); if (h && !(h.fromFile && h.reranked)) say('not marked as ranked again'); }
    const done = () => { state.windowYears = DEFAULTS.windowYears; state.maxBand = DEFAULTS.maxBand; state.rankBy = DEFAULTS.rankBy; state.cache = {key:null}; };
    let n = 0;
    const num = (a, b, tol, what) => { n++; if ((a == null) !== (b == null) || (a != null && !(Math.abs(a - b) <= tol))) say(what + ': ' + a + ' v ' + b); };
    const same = (a, b, what) => { n++; if (a !== b && !(a == null && b == null)) say(what + ': ' + a + ' v ' + b); };
    if (!h){ say('file refused'); done(); return {n, bad}; }
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
    done();
    return {n, entries, bad, ranked:c.table.length}; })()`);
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
    /* Ranks are read off the points under "all time" too (a team's History, whole-window view, shows its best rank). */
    const days = [...played.keys()].sort((a, b) => a - b), all = stamps.concat(days), ranked = true;
    const maps = state.windowYears > 0 ? all.map(t => runWindow(windowStartFor(t), t)) : allTimeMaps(all);
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
    /* The ranks file beside it (old ranks follow the visitor's filter): each team's two ranks on each date under every
       band limit, read back the way the page reads them and compared with the model's own under each limit. */
    let ranks = null;
    if (ranked){ const rteams = [], ridx = new Map(), rid = k => { if (!ridx.has(k)){ ridx.set(k, rteams.length); rteams.push(k); } return ridx.get(k); }, saved = state.maxBand;
      const rrows = (mp, ts, keys) => { const RB = BAND_OPTIONS.map(b => { state.maxBand = b; return ranksIn(mp, ts); }), out = [];
        for (const key of keys){ if (!statePt(mp, key, ts)) continue; const row = [rid(key)]; for (const R of RB) row.push(R.byR.get(key) || 0, R.byLo.get(key) || 0); out.push(row); }
        return out; };
      ranks = {v:1, g, windowYears:state.windowYears, asOf:file.asOf, print:file.print, bands:BAND_OPTIONS, stamps, teams:rteams,
        pts:stamps.map((ts, i) => rrows(maps[i], ts, [...maps[i].keys()])), days:days.map((ts, j) => [ts, rrows(maps[stamps.length + j], ts, played.get(ts))])};
      const F2 = JSON.parse(JSON.stringify(file)), R2 = JSON.parse(JSON.stringify(ranks));
      for (const b of BAND_OPTIONS){ state.maxBand = b; const S2 = snapsFromFile(F2, snapKey(), stamps, R2);
        if (!S2){ say('±' + b + ': the page refused the ranks file'); continue; }
        stamps.forEach((ts, k) => { const R = ranksIn(maps[k], ts);
          for (const key of maps[k].keys()){ if (!statePt(maps[k], key, ts)) continue; const x = S2.rows[k].get(key); n++;
            if (!x || x[3] !== (R.byR.get(key) || 0) || x[4] !== (R.byLo.get(key) || 0)) say('±' + b + ' ' + fmtDate(ts) + ' ' + key + ' ranks: ' + (x ? x[3] + '/' + x[4] : 'none') + ' v ' + R.byR.get(key) + '/' + R.byLo.get(key)); } });
        days.forEach((ts, j) => { const mp = maps[stamps.length + j], R = ranksIn(mp, ts);
          for (const key of played.get(ts)){ if (!statePt(mp, key, ts)) continue; const x = S2.recent.get(ts) && S2.recent.get(ts).get(key); n++;
            if (!x || x[3] !== (R.byR.get(key) || 0) || x[4] !== (R.byLo.get(key) || 0)) say('±' + b + ' match day ' + fmtDate(ts) + ' ' + key + ' ranks: ' + (x ? x[3] + '/' + x[4] : 'none') + ' v ' + R.byR.get(key) + '/' + R.byLo.get(key)); } }); }
      state.maxBand = saved; }
    state.windowYears = DEFAULTS.windowYears; state.cache = {key:null};
    return {file, ranks, n, bad, days:days.length}; })()`);
}

/* The chart on a past date: every team's rating, band and two ranks on the first day of each quarter of a decade (the
   rows a chart point is read from, as in snapSeries), at the site's settings. The page reads the quarters inside the
   window before the date in view (its snapsPast). Returns {file, n, bad}: each date is read back the way the page
   reads it and compared with the run of the window it came from. */
export function seriesDecadeFile(model, g, decade, allTime){
  return model.run(`(() => { ${DEFAULT_STATE(g)}
    const ALL = ${allTime ? 'true' : 'false'}; if (ALL) state.windowYears = 0;
    const g = ${JSON.stringify(g)}, D = ${+decade}, B = state.bounds[g], r1 = x => Math.round(x * 10) / 10, r2 = x => Math.round(x * 100) / 100;
    const keep = x => { const v = r2(x); return r1(v) === r1(x) && Math.round(v) === Math.round(x) ? v : r2(v - 0.01); };
    const rb = x => { const v = r1(x); return Math.round(v) === Math.round(x) ? v : r1(v - 0.1); };
    const stamps = seriesStamps(Math.max(Date.UTC(D, 0, 1), B.min), Math.min(Date.UTC(D + 10, 0, 1), B.max + DAY));
    const teams = [], idx = new Map(), id = k => { if (!idx.has(k)){ idx.set(k, teams.length); teams.push(k); } return idx.get(k); }, pts = [], bad = [], say = s => { if (bad.length < 12) bad.push(s); };
    let n = 0;
    const rteams = [], ridx = new Map(), rid = k => { if (!ridx.has(k)){ ridx.set(k, rteams.length); rteams.push(k); } return ridx.get(k); }, rpts = [];
    const AM = ALL ? allTimeMaps(stamps) : null;   // all time: one pass through the archive, captured at each date
    stamps.forEach((ts, si) => { const mp = AM ? AM[si] : runWindow(windowStartFor(ts), ts), R = ranksIn(mp, ts), out = [];
      /* each team's two ranks under every band limit, for the decade's ranks file */
      { const saved = state.maxBand, RB = BAND_OPTIONS.map(b => { state.maxBand = b; return ranksIn(mp, ts); }), rout = []; state.maxBand = saved;
        for (const key of mp.keys()){ if (!statePt(mp, key, ts)) continue; const row = [rid(key)]; for (const Q of RB) row.push(Q.byR.get(key) || 0, Q.byLo.get(key) || 0); rout.push(row);
          n++; const bi = BAND_OPTIONS.indexOf(DEFAULTS.maxBand); if (row[1 + 2 * bi] !== (R.byR.get(key) || 0) || row[2 + 2 * bi] !== (R.byLo.get(key) || 0)) say(fmtDate(ts) + ' ' + key + ': the ranks file disagrees with the series at the usual band limit'); }
        rpts.push(rout); }
      for (const key of mp.keys()){ const p = statePt(mp, key, ts); if (!p) continue;
        const row = [id(key), keep(p.r), rb(p.b), R.byR.get(key) || 0, R.byLo.get(key) || 0]; out.push(row);
        n++; if (!(Math.abs(row[1] - p.r) <= 0.0101 && fmtR(row[1]) === fmtR(p.r) && Math.round(row[1]) === Math.round(p.r) && Math.abs(row[2] - p.b) <= 0.1001 && Math.round(row[2]) === Math.round(p.b))) say(fmtDate(ts) + ' ' + key + ': ' + row[1] + ' ±' + row[2] + ' v ' + p.r + ' ±' + p.b); }
      pts.push(out); });
    const file = {v:1, g, decade:D, print:stamps.length ? listPrintTo(state.matches[g], stamps[stamps.length - 1]) : 0, stamps, teams, pts};
    const ranks = {v:1, g, decade:D, print:file.print, bands:BAND_OPTIONS, stamps, teams:rteams, pts:rpts};
    if (ALL){ file.all = true; ranks.all = true; }
    if (stamps.length && !seriesOk(JSON.parse(JSON.stringify(file)), g)) say('the page refused the file');
    state.windowYears = DEFAULTS.windowYears;
    return {file, ranks, n, bad}; })()`);
}
/* How many quarter starts a decade's file holds (part of its mark: a quarter can turn with no match changed). */
export function seriesCount(model, g, decade){
  return model.run(`(() => { const B = state.bounds[${JSON.stringify(g)}], D = ${+decade}; return seriesStamps(Math.max(Date.UTC(D, 0, 1), B.min), Math.min(Date.UTC(D + 10, 0, 1), B.max + DAY)).length; })()`);
}
/* A past date's chart, read from the files the way the page reads it and compared with the model's own. dates: the
   dates to view; files: {decade: file}; ledgers: {year: file} for the years the dates' match days fall in; days:
   {year: file} of match-day tables (the date itself comes from its table). For every team with a rating on the date:
   the same dates' points, the same figures as shown, the same ranks (the date itself may differ a little: its table
   keeps one decimal place and can be a few days old, and ranks by the bottom of the band are counted from it). */
/* alt: {rfiles: {decade: ranks file}, rledgers: {year: ranks file}}. Then the same chart is read again under every other
   band limit and its ranks compared with the model's own under that limit: the quarter starts, each team's match days,
   and the date itself (where a rank can be one place out, as above). */
/* The same under "all time": the quarter starts from the all-time series (files, rfiles: {decade: file}), each team's
   match days of the last two years and the date itself from the all-time day tables (days: {year: file}), with today's
   all-time table file in hand (tableAll). Compared with one pass of the model through the archive, under the usual
   band limit and under every other. A match day or the date itself is read off a table kept to one decimal place, so
   there a rank by the bottom of the band may be one place out. */
export function seriesAllCheck(model, g, dates, files, rfiles, days, tableAll){
  model.run(`__sf = ${JSON.stringify(JSON.stringify({files, rfiles, days, tableAll}))}`);
  return model.run(`(() => { ${DEFAULT_STATE(g)}
    const g = ${JSON.stringify(g)}, X = JSON.parse(__sf), bad = [], say = s => { if (bad.length < 12) bad.push(s); };
    let n = 0, pts = 0, edge = 0, runs = 0, altPts = 0; const rw = runWindow, am = allTimeMaps, cr = computeRatings;
    const watch = () => { runWindow = function(){ runs++; return rw.apply(this, arguments); }; allTimeMaps = function(){ runs++; return am.apply(this, arguments); }; computeRatings = function(){ runs++; return cr.apply(this, arguments); }; };
    const free = () => { runWindow = rw; allTimeMaps = am; computeRatings = cr; };
    state.windowYears = 0;
    for (const d of ${JSON.stringify(dates)}){
      const ao = Date.parse(d + 'T00:00:00Z'); state.asOf = ao; state.cache = {key:null}; state.dayCache = null; state.maxBand = DEFAULTS.maxBand;
      state.useTableFiles = false; state.dayFiles = {}; state.seriesFiles = {}; state.seriesRankFiles = {}; state.tableFiles = {};
      const c = getRatings(), st = pastStamps(ao).concat([ao]), maps = allTimeMaps(st);
      const from = ao - TEAM_DETAIL_YEARS * 365 * DAY, extras = new Map(), days = new Set();
      for (const [key, h] of c.history){ const e = [...new Set(h.filter(x => x.ts >= from && x.ts < ao).map(x => x.ts))]; extras.set(key, e); for (const t of e) days.add(t); }
      const dl = [...days], dm = allTimeMaps(dl), dayMaps = new Map(dl.map((t, i) => [t, dm[i]]));
      state.useTableFiles = true; state.tableFiles = {['all-' + g]:X.tableAll};
      for (const [y, F] of Object.entries(X.days)) state.dayFiles['all|' + g + '|' + y] = F;
      for (const [k, F] of Object.entries(X.files)) state.seriesFiles['all|' + g + '|' + k] = F;
      for (const [k, F] of Object.entries(X.rfiles)) state.seriesRankFiles['all|' + g + '|' + k] = F;
      for (const b of [DEFAULTS.maxBand].concat(BAND_OPTIONS.filter(x => x !== DEFAULTS.maxBand))){
        const std = b === DEFAULTS.maxBand, tag = d + (std ? ' ' : ' ±' + b + ' ');
        state.maxBand = b; state.cache = {key:null}; state.dayCache = null;
        watch(); let S = null, err = null; try { S = snapsPast(snapKey()); } catch(e){ err = e; } finally { free(); }
        n++; if (!S){ say(tag + 'the page did not read the files' + (err ? ': ' + err.message : '')); continue; }
        n++; if (S.stamps.length !== st.length || S.stamps.some((t, i) => t !== st[i])){ say(tag + 'different dates'); continue; }
        const drift = Math.round((ao - Date.parse(tableAt().day + 'T00:00:00Z')) / DAY) * 0.06;
        const cmp = (w, own, x, p, er, el) => { n++; if (std) pts++; else altPts++;
          if (!p){ if (x) say(w + ': a point the model does not have'); return; } if (!x){ say(w + ': no point'); return; }
          /* A cut-off team's band on a day read off a table: the table's band carries the extra for being cut off,
             kept to one decimal place, and taking the extra back out stretches that rounding. */
          const tol = own ? 0.0501 + drift : 0.0101, cutB = BAND_Z * RD_MAX, tolB = 0.1001 * (own && x[5] ? Math.sqrt(p.b * p.b + cutB * cutB) / Math.max(1, p.b) : 1) + (own ? drift : 0);
          if (!(Math.abs(p.r - x[1]) <= tol && Math.abs(p.b - x[2]) <= tolB)) return say(w + ': ' + p.r + ' ±' + p.b + ' v ' + x[1] + ' ±' + x[2]);
          if (!own && !(fmtR(p.r) === fmtR(x[1]) && Math.round(p.r) === Math.round(x[1]) && Math.round(p.b) === Math.round(x[2]))) return say(w + ' as shown: ' + p.r + ' ±' + p.b + ' v ' + x[1] + ' ±' + x[2]);
          if (x[3] === er && x[4] === el) return;
          if (own && Math.abs((x[3] || er) - (er || x[3])) <= 1 && Math.abs((x[4] || el) - (el || x[4])) <= 1) edge++;
          else say(w + ' ranks: ' + x[3] + '/' + x[4] + ' v ' + er + '/' + el); };
        st.forEach((t, i) => { const R = ranksIn(maps[i], t);
          for (const key of maps[i].keys()) cmp(tag + fmtDate(t) + ' ' + key, t === ao, S.rows[i].get(key), statePt(maps[i], key, t), R.byR.get(key) || 0, R.byLo.get(key) || 0); });
        const RD = new Map();
        for (const [key, e] of extras) for (const t of e){ if (!RD.has(t)) RD.set(t, ranksIn(dayMaps.get(t), t)); const R = RD.get(t);
          cmp(tag + 'match day ' + fmtDate(t) + ' ' + key, true, S.recent.get(t).get(key), statePt(dayMaps.get(t), key, t), R.byR.get(key) || 0, R.byLo.get(key) || 0); }
      }
    }
    n++; if (runs) say('the model ran ' + runs + ' times');
    state.useTableFiles = false; state.dayFiles = {}; state.seriesFiles = {}; state.seriesRankFiles = {}; state.tableFiles = {}; state.dayCache = null;
    state.maxBand = DEFAULTS.maxBand; state.windowYears = DEFAULTS.windowYears; state.asOf = state.bounds[g].max; state.cache = {key:null};
    return {n, pts, altPts, edge, bad}; })()`);
}
export function seriesCheck(model, g, dates, files, ledgers, days, alt){
  model.run(`__sf = ${JSON.stringify(JSON.stringify({files, ledgers, days, alt:alt || null}))}`);
  return model.run(`(() => { ${DEFAULT_STATE(g)}
    const g = ${JSON.stringify(g)}, X = JSON.parse(__sf), bad = [], say = s => { if (bad.length < 12) bad.push(s); };
    let n = 0, pts = 0, edge = 0, runs = 0, altPts = 0; const rw = runWindow;
    for (const d of ${JSON.stringify(dates)}){
      const ao = Date.parse(d + 'T00:00:00Z'); state.asOf = ao; state.cache = {key:null}; state.dayCache = null; pubCache.key = null;
      state.useTableFiles = false; state.ledgerFiles = {}; state.dayFiles = {}; state.seriesFiles = {};
      const c = getRatings(), st = pastStamps(ao).concat([ao]), maps = st.map(t => runWindow(windowStartFor(t), t)), M = {key:snapKey(), stamps:st, maps};
      const from = ao - TEAM_DETAIL_YEARS * 365 * DAY, extras = new Map(), dayMaps = new Map();
      for (const [key, h] of c.history){ const e = [...new Set(h.filter(x => x.ts >= from && x.ts < ao).map(x => x.ts))]; extras.set(key, e); for (const t of e) if (!dayMaps.has(t)) dayMaps.set(t, runWindow(windowStartFor(t), t)); }
      const A = new Map([...c.history.keys()].map(key => [key, teamPoints(M, key, extras.get(key), extras.get(key).map(t => dayMaps.get(t)))]));
      state.useTableFiles = true;
      for (const [y, F] of Object.entries(X.ledgers)) state.ledgerFiles[g + '|' + y] = ledgerIndex(JSON.parse(JSON.stringify(F)));
      for (const [y, F] of Object.entries(X.days)) state.dayFiles[g + '|' + y] = F;
      for (const [k, F] of Object.entries(X.files)) state.seriesFiles[g + '|' + k] = F;
      state.cache = {key:null}; pubCache.key = null;
      runWindow = function(){ runs++; return rw.apply(this, arguments); };
      let S = null; try { S = snapsPast(snapKey()); } finally { runWindow = rw; }
      n++; if (!S){ say(d + ': the page did not read the files'); continue; }
      n++; if (S.stamps.length !== st.length || S.stamps.some((t, i) => t !== st[i])) say(d + ': different dates');
      /* The date itself is read off the table in view: the file's latest day on or before it, up to six days back
         (a table only drifts between the file's days), kept to one decimal place. */
      const drift = Math.round((ao - Date.parse(tableAt().day + 'T00:00:00Z')) / DAY) * 0.06;
      for (const [key, a] of A){
        runWindow = function(){ runs++; return rw.apply(this, arguments); };
        let b; try { const e = extras.get(key); b = teamPoints(S, key, e, e.map(() => null)); } catch(err){ say(d + ' ' + key + ': ' + err.message); continue; } finally { runWindow = rw; }
        n++; if (a.length !== b.length){ say(d + ' ' + key + ': ' + a.length + ' points v ' + b.length); continue; }
        a.forEach((p, i) => { const q = b[i], w = d + ' ' + key + ' ' + fmtDate(p.ts), own = p.ts === ao && !p.match; pts++;
          n++; if (p.ts !== q.ts || p.match !== q.match) say(w + ': the points differ');
          n++; if (!p.v !== !q.v){ say(w + ': ' + JSON.stringify(p.v) + ' v ' + JSON.stringify(q.v)); return; }
          if (p.v){ const tol = own ? 0.0501 + drift : 0.0101, same = fmtR(p.v.r) === fmtR(q.v.r) && Math.round(p.v.r) === Math.round(q.v.r) && Math.round(p.v.b) === Math.round(q.v.b);
            n++; if (!(Math.abs(p.v.r - q.v.r) <= tol && Math.abs(p.v.b - q.v.b) <= 0.1001 + (own ? drift : 0))) say(w + ': ' + p.v.r + ' ±' + p.v.b + ' v ' + q.v.r + ' ±' + q.v.b);
            else if (!same){ if (own) edge++; else say(w + ' as shown: ' + p.v.r + ' ±' + p.v.b + ' v ' + q.v.r + ' ±' + q.v.b); } }
          const x = p.rk(), y = q.rk();
          n++; if (x.r !== y.r){ if (own && drift && x.r && y.r && Math.abs(x.r - y.r) <= 1) edge++; else say(w + ' rank by rating: ' + x.r + ' v ' + y.r); }
          n++; if (x.lo !== y.lo){ if (own && x.lo && y.lo && Math.abs(x.lo - y.lo) <= 1) edge++; else say(w + ' rank by band: ' + x.lo + ' v ' + y.lo); } });
      }
      /* Under every other band limit: the ranks the page reads against the model's, date by date. */
      if (X.alt){
        for (const [k, F] of Object.entries(X.alt.rfiles)) state.seriesRankFiles[g + '|' + k] = F;
        for (const [y, F] of Object.entries(X.alt.rledgers)) state.rankFiles[g + '|' + y] = F;
        const played = new Map(); for (const [key, e] of extras) for (const t of e){ if (!played.has(t)) played.set(t, []); played.get(t).push(key); }
        for (const b of BAND_OPTIONS){ if (b === DEFAULTS.maxBand) continue;
          state.maxBand = b; state.cache = {key:null}; state.dayCache = null; const tag = d + ' ±' + b + ' ';
          runWindow = function(){ runs++; return rw.apply(this, arguments); };
          let S2 = null; try { S2 = snapsPast(snapKey()); } finally { runWindow = rw; }
          n++; if (!S2){ say(tag + 'the page did not read the files'); continue; }
          st.forEach((t, i) => { const R = ranksIn(maps[i], t), own = t === ao;
            for (const key of maps[i].keys()){ if (!statePt(maps[i], key, t)) continue; const x = S2.rows[i].get(key), er = R.byR.get(key) || 0, el = R.byLo.get(key) || 0; n++; altPts++;
              if (!x){ say(tag + fmtDate(t) + ' ' + key + ': no point'); continue; }
              if (x[3] === er && x[4] === el) continue;
              if (own && Math.abs((x[3] || er) - (er || x[3])) <= 1 && Math.abs((x[4] || el) - (el || x[4])) <= 1) edge++;
              else say(tag + fmtDate(t) + ' ' + key + ' ranks: ' + x[3] + '/' + x[4] + ' v ' + er + '/' + el); } });
          for (const [t, keys] of played){ const R = ranksIn(dayMaps.get(t), t);
            for (const key of keys){ const C = ledgerClose(key, t); n++; altPts++;
              if (!C || C[3] !== (R.byR.get(key) || 0) || C[4] !== (R.byLo.get(key) || 0)) say(tag + fmtDate(t) + ' ' + key + ' match-day ranks: ' + (C ? C[3] + '/' + C[4] : 'none') + ' v ' + R.byR.get(key) + '/' + R.byLo.get(key)); } }
        }
        state.maxBand = DEFAULTS.maxBand; state.cache = {key:null}; state.dayCache = null;
      }
    }
    n++; if (runs) say('the model ran ' + runs + ' times');
    state.useTableFiles = false; state.ledgerFiles = {}; state.dayFiles = {}; state.seriesFiles = {}; state.seriesRankFiles = {}; state.rankFiles = {}; state.dayCache = null;
    state.asOf = state.bounds[g].max; state.cache = {key:null}; pubCache.key = null;
    return {n, pts, altPts, edge, bad}; })()`);
}

/* Best rank and peak rating to the day (Seb, 13 Nov 2026). A team's History used to read these off sample days (every
   few months, and its recent match days). Here they are worked out over every day: for each team and each date D, the
   best rank it held on any day of the twelve years ending on D (under each band limit, in each order), the day that
   rank was first held, and the same for its highest rating. No rating engine is needed: the match-day tables hold
   every team's rating, band, exact places and cut-off mark for every day the table changes, and a rank on a day is
   the rank the Rankings page shows for that day.

   Each answer is a step function of D, written as the dates where it changes: for a rank [D, rank, since] and for the
   peak [D, rating, band, since], all as day numbers (days since 1 Jan 1970); 0 for "no rank". "since" is the first
   day of the unbroken spell in which the value was held; the page shows the later of it and the window's first day.

   days(y): that year's match-day file or null. opts: {first, last (years), lastDay (day number of the latest match),
   bands (the band limits), cut (the band a cut-off team carries on top of its own). Returns {teams: Map(key ->
   {r:[a list a setting: band limit number * 2 + (1 for the cautious order)], pk}), n, bad}: a ninth of the teams are
   checked against a plain scan of their own daily series on sixty dates each. */
export function bestSeries(days, opts){
  const {first, last, lastDay, bands, cut} = opts, DAY = 86400000, NS = bands.length * 2, bad = [], say = x => { if (bad.length < 12) bad.push(x); };
  const wsOf = D => { const d = new Date(D * DAY); d.setUTCFullYear(d.getUTCFullYear() - 12); return Math.round(d.getTime() / DAY); };
  const T = new Map();   // key -> {dq:[NS + 1 deques], open:[the series' open entry a deque], out:[NS + 1 lists], raw (sampled teams only)}
  const team = key => { let t = T.get(key); if (!t){ t = {dq:[], open:[], out:[], seen:0, raw:T.size % 9 === 0 ? [] : null}; for (let i = 0; i <= NS; i++){ t.dq.push([]); t.open.push(null); t.out.push([]); if (t.raw) t.raw.push([]); } T.set(key, t); } return t; };
  /* a new value for one series on day D: v (a rank, Infinity for none; or a rating, -Infinity for none), better(a, b) true when a beats b */
  const put = (t, i, D, v, extra, better) => { const o = t.open[i]; if (o && o.v === v && o.x === extra) return;
    if (o) o.e = D; const q = t.dq[i]; while (q.length && better(v, q[q.length - 1].v)) q.pop();
    const e = {v, x:extra, s:D, e:Infinity}; q.push(e); t.open[i] = e; if (t.raw) t.raw[i].push([D, v, extra]); };
  const lt = (a, b) => a < b, gt = (a, b) => a > b;
  const b1 = v => { let q = Math.round(v * 10) / 10; if (Math.round(q) !== Math.round(v)) q = Math.round((q - 0.1) * 10) / 10; return q; };
  let stdBad = 0, nDays = 0, D = null, n = 0;
  const step = (day) => {   // the answers for day `day`, after that day's table (if any) has been put in
    const ws = wsOf(day);
    for (const t of T.values()) for (let i = 0; i <= NS; i++){ const q = t.dq[i]; while (q.length && q[0].e <= ws) q.shift();
      const f = q[0], L = t.out[i], z = L[L.length - 1], none = !f || !isFinite(f.v);
      if (i < NS){ const v = none ? 0 : f.v, s0 = none ? 0 : f.s; if (!z ? !none : z[1] !== v || z[2] !== s0) L.push([day, v, s0]); }
      else { if (none){ if (z && z[1] !== null) L.push([day, null, 0, 0]); } else if (!z || z[1] !== f.v || z[3] !== f.s) L.push([day, f.v, f.x, f.s]); } } };
  for (let y = first; y <= last; y++){ const F = days(y); if (!F) continue;
    /* Every day of the file: the days with a full table, and after each the days in between, whose rows are that
       table's with the day's own ratings, bands, tiers and cautious places put in (as the page's dayRows does). */
    const feed = []; F.days.forEach((ds, k) => { const dn0 = Math.round(Date.parse(ds + 'T00:00:00Z') / DAY), base = F.tables[k]; feed.push([dn0, base]);
      (F.gaps ? F.gaps[k] : []).forEach((G, j) => { const dr = G[0] || [], db = G[1] || [], lo = G[3] || null;
        const rows = base.map((x, i) => { const y = x.slice(); if (dr[i]) y[1] = Math.round(x[1] * 100 + dr[i]) / 100; if (db[i]) y[2] = Math.round(x[2] * 100 + db[i]) / 100; if (lo) y[5] = lo[i]; return y; });
        feed.push([dn0 + j + 1, rows]); }); });
    feed.forEach(([dn, rows]) => { nDays++;
      if (D !== null) for (let d = D + 1; d < dn; d++) step(d);   // a day the files do not have (none, since every day has its figures): nothing new, but old spells leave the window
      const byLo = rows.slice().sort((a, b) => a[5] - b[5]), here = new Set();
      const rk = new Map(rows.map(r => [r[0], new Array(NS).fill(Infinity)]));
      bands.forEach((b, bi) => { let c = 0; for (const r of rows) if (!r[6] && (b === 0 || r[2] <= b)) rk.get(r[0])[bi * 2] = ++c;
        c = 0; for (const r of byLo) if (!r[6] && (b === 0 || r[2] <= b)) rk.get(r[0])[bi * 2 + 1] = ++c; });
      const std = bands.indexOf(250) * 2;
      for (const r of rows){ const key = F.teams[r[0]], t = team(key), R = rk.get(r[0]); here.add(key); t.seen = dn;
        if (std >= 0 && (isFinite(R[std]) ? R[std] : 0) !== r[3]) stdBad++;
        for (let i = 0; i < NS; i++) put(t, i, dn, R[i], 0, lt);
        /* the peak is followed as the table shows it, to one decimal place (the rows keep two, and a rating can drift
           by a hundredth a day); its band to one place too, never across the whole number the page shows */
        put(t, NS, dn, Math.round(r[1] * 10) / 10, b1(r[6] ? Math.sqrt(Math.max(0, r[2] * r[2] - cut * cut)) : r[2]), gt); }
      for (const [key, t] of T) if (!here.has(key) && t.open[NS] && isFinite(t.open[NS].v)){ for (let i = 0; i < NS; i++) put(t, i, dn, Infinity, 0, lt); put(t, NS, dn, -Infinity, 0, gt); }   // out of the table
      step(dn); D = dn; }); }
  if (D !== null) for (let d = D + 1; d <= lastDay; d++) step(d);
  if (stdBad) say(stdBad + ' ranks at the usual band limit differ from the tables\' own');
  /* The check: a plain scan of a team's own daily series over the window, against the lists. */
  const at = (L, day) => { let lo = 0, hi = L.length - 1, x = null; while (lo <= hi){ const m = (lo + hi) >> 1; if (L[m][0] <= day){ x = L[m]; lo = m + 1; } else hi = m - 1; } return x; };
  let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (const [key, t] of T){ if (!t.raw) continue; const d0 = t.raw[NS][0][0];
    for (let j = 0; j < 60; j++){ const day = j < 2 ? (j ? lastDay : d0) : d0 + Math.floor(rnd() * (lastDay - d0 + 1)), ws = wsOf(day);
      for (const i of [Math.floor(rnd() * NS), NS]){ const S = t.raw[i]; let best = null;
        for (let k = 0; k < S.length && S[k][0] <= day; k++){ const e = k + 1 < S.length ? S[k + 1][0] : Infinity; if (e <= ws) continue;
          const v = S[k][1]; if (!isFinite(v)) continue; if (!best || (i < NS ? v < best.v : v > best.v)) best = {v, s:S[k][0], x:S[k][2]}; }
        const x = at(t.out[i], day); n++;
        if (i < NS){ const gv = x ? x[1] : 0, gs = x && x[1] ? Math.max(x[2], ws) : 0, ev = best ? best.v : 0, es = best ? Math.max(best.s, ws) : 0; if (gv !== ev || gs !== es) say(key + ' setting ' + i + ' day ' + day + ': ' + gv + ' since ' + gs + ' v ' + ev + ' since ' + es); }
        else { const gv = x && x[1] !== null ? x[1] : null, ev = best ? best.v : null; if (gv !== ev || (best && (Math.max(x[3], ws) !== Math.max(best.s, ws) || x[2] !== best.x))) say(key + ' peak day ' + day + ': ' + JSON.stringify(x) + ' v ' + JSON.stringify(best)); } } } }
  const teams = new Map(); for (const [key, t] of T) teams.set(key, {r:t.out.slice(0, NS), pk:t.out[NS]});
  return {teams, n, nDays, bad};
}

/* A team's rank just after each of its matches with the window set to "all time", under every band limit and both rank
   orders (the page's rankAllRows): a file a team. Checked two ways: a sample of matches against the page's own
   rankAfter under every setting, and the same sample read back the way the page reads the file, with no model.
   Returns {teams: {key: rows}, n, bad}. */
export function rankAllFiles(model, g){
  return model.run(`(() => { ${DEFAULT_STATE(g)}
    const g = ${JSON.stringify(g)}, bad = [], say = s => { if (bad.length < 12) bad.push(s); }; let n = 0;
    state.useTableFiles = false; state.rankAllFiles = {};
    const M = rankAllRows(g), teams = {}; for (const [k, rows] of M) teams[k] = rows;
    state.windowYears = 0; state.asOf = state.bounds[g].max; state.cache = {key:null};
    const c = getRatings(), print = matchListPrint(state.matches[g]), keys = [...M.keys()], sample = [];
    keys.forEach((k, i) => { const h = c.history.get(k); if (i % 7 === 0) for (let j = i % 5; j < h.length; j += 1 + Math.floor(h.length / 4)) sample.push([k, h[j].ts]); });
    const ask = () => { const out = [];
      for (const b of BAND_OPTIONS) for (const order of ['rating', 'lower']){ state.maxBand = b; state.rankBy = order; c._rankAfter = null;
        for (const [k, ts] of sample) for (const byConf of [false, true]){ const r = rankAfter(c, k, ts, byConf); out.push(r ? r.rank + '/' + r.of : '-'); } }
      return out; };
    const A = ask();
    /* the file's own numbers, row by row */
    let q = 0;
    BAND_OPTIONS.forEach((b, bi) => ['rating', 'lower'].forEach((order, oi) => { for (const [k, ts] of sample){ const row = M.get(k).find(r => r[0] === Math.round(ts / DAY));
      for (const byConf of [false, true]){ const o = 1 + (bi * 2 + oi) * 4 + (byConf ? 2 : 0), got = row ? row[o] + '/' + row[o + 1] : 'no row'; n++;
        if (got !== A[q]) say(k + ' ' + fmtDate(ts) + ' ±' + b + ' ' + order + (byConf ? ' in its confederation' : '') + ': ' + got + ' v ' + A[q]); q++; } } }));
    /* and read back by the page, with no model */
    state.useTableFiles = true; for (const [k] of sample) state.rankAllFiles[g + '|' + k] = {v:1, g, key:k, print, rows:M.get(k)};
    let runs = 0; const inf = inflate; inflate = function(){ runs++; return inf.apply(this, arguments); };
    let Bk; try { Bk = ask(); } finally { inflate = inf; }
    n++; if (runs) say('the page worked ' + runs + ' ranks out itself');
    A.forEach((a, i) => { n++; if (a !== Bk[i]) say('read back, answer ' + i + ': ' + Bk[i] + ' v ' + a); });
    state.useTableFiles = false; state.rankAllFiles = {}; state.windowYears = DEFAULTS.windowYears; state.maxBand = DEFAULTS.maxBand; state.rankBy = DEFAULTS.rankBy; state.cache = {key:null};
    return {teams, n, bad, print, sample:sample.length}; })()`);
}

/* The best files against the page. dates: dates to view; best: {key: file} for some teams; days: {year: match-day
   file} for the dates' years and the years before. For each date and each of the twelve settings: the rank the page's
   own table shows a team that day can never beat the file's best rank for the window ending that day; when the file
   says the best rank has been held since that very day, the two must be equal; and the peak rating is at least the
   rating in the table. Also that the page reads a file at all, and refuses one for another match list. */
export function bestCheck(model, g, dates, best, days){
  model.run(`__bf = ${JSON.stringify(JSON.stringify({best, days}))}`);
  return model.run(`(() => { ${DEFAULT_STATE(g)}
    const g = ${JSON.stringify(g)}, X = JSON.parse(__bf), bad = [], say = s => { if (bad.length < 12) bad.push(s); }; let n = 0, held = 0, runs = 0;
    state.useTableFiles = true; for (const [y, F] of Object.entries(X.days)) state.dayFiles[g + '|' + y] = F;
    const rw = runWindow; runWindow = function(){ runs++; return rw.apply(this, arguments); };
    try {
      for (const d of ${JSON.stringify(dates)}){ const ao = Date.parse(d + 'T00:00:00Z'); state.asOf = ao;
        for (const b of BAND_OPTIONS) for (const order of ['rating', 'lower']){ state.maxBand = b; state.rankBy = order; state.cache = {key:null}; state.dayCache = null;
          /* the day's table from its file, ranked under the setting as the page ranks it (today's date included: the
             page itself reads today from the table file, which says the same) */
          const hit = dayFor(g, ao), w = d + ' ±' + b + ' ' + order + ' '; let c = hit ? tableFromDay(hit.F, hit.i, null, hit.k) : null;
          if (c && !rankStd()){ const PW = dayPw(hit.F, hit.i, hit.k).slice(1); c = rerankTable(c, new Map(PW.map(([p, w2, m]) => [p, {m, w:w2}]))); }
          if (!c){ say(w + 'no table from the files'); continue; }
          for (const [key, F] of Object.entries(X.best)){ const B = bestAt(F, key, ao), row = c.byKey.get(key); n++;
            if (!B){ say(w + key + ': the page refused the file'); continue; }
            const mine = B[order === 'lower' ? 'lo' : 'r'], now = row && row.rank ? row.rank : 0;
            if (now && (!mine || mine.n > now)) say(w + key + ': ranked ' + now + ' that day, best in the file ' + (mine ? mine.n : 'none'));
            if (mine && mine.ts === ao){ held++; if (mine.n !== now) say(w + key + ': best ' + mine.n + ' first held that day, ranked ' + now); }
            const shown = row ? Math.round(row.rating * 10) / 10 : null;   /* the peak is kept as the table shows it, to one decimal place */
            if (row && (!B.peak || B.peak.r < shown - 1e-9)) say(w + key + ': rated ' + row.rating + ' that day, peak in the file ' + (B.peak ? B.peak.r : 'none'));
            if (B.peak && B.peak.ts === ao && row && Math.abs(B.peak.r - shown) > 1e-9) say(w + key + ': peak ' + B.peak.r + ' set that day, rated ' + row.rating); } } }
      const k0 = Object.keys(X.best)[0]; state.maxBand = DEFAULTS.maxBand; state.rankBy = DEFAULTS.rankBy;
      n++; if (k0 && bestAt({...X.best[k0], print:X.best[k0].print + 1}, k0, state.asOf) !== null) say('a file for another match list was read');
      n++; if (k0){ state.maxBand = 175; if (bestAt(X.best[k0], k0, state.asOf) !== null) say('read under an unlisted band limit'); state.maxBand = DEFAULTS.maxBand; }
    } finally { runWindow = rw; }
    n++; if (runs) say('the model ran ' + runs + ' times');
    state.useTableFiles = false; state.dayFiles = {}; state.dayCache = null; state.maxBand = DEFAULTS.maxBand; state.rankBy = DEFAULTS.rankBy; state.asOf = state.bounds[g].max; state.cache = {key:null};
    return {n, held, bad}; })()`);
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
/* deep: also read the file under every other band limit and compare with the model's own run under that limit (five
   more runs of the edition, so the build does it for one edition in twenty). */
export function editionFile(model, g, id, allTime, deep){
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
    let deepN = 0;
    if (${deep ? 'true' : 'false'}){ const F2 = JSON.parse(JSON.stringify(file));
      for (const b of BAND_OPTIONS){ if (b === DEFAULTS.maxBand) continue; state.maxBand = b; state.edCache = null;
        const A = editionRun(e), C = edFromFile(e, F2), w0 = '±' + b + ' '; state.edCache = null;
        if (!C){ say(w0 + 'the page refused the file'); continue; }
        eq(A.preTop.length, C.preTop.length, w0 + 'ranked teams'); eq(A.worldTier.size, C.worldTier.size, w0 + 'tiers');
        A.preTop.forEach((a, i) => { const c = C.preTop[i]; deepN++; if (!c) return; eq(a.key, c.key, w0 + 'ranked ' + i); eq(a.rank, c.rank, w0 + 'rank ' + i); eq(A.worldTier.get(a.key), C.worldTier.get(a.key), w0 + 'tier of ' + a.key); });
        A.teams.forEach((a, i) => { const c = C.teams[i]; if (!c) return; for (const f of ['key', 'preRank', 'postRank', 'confTier', 'worldTier']){ deepN++; eq(a[f], c[f], w0 + a.key + ' ' + f); } }); }
      state.maxBand = DEFAULTS.maxBand; state.edCache = null; }
    state.windowYears = DEFAULTS.windowYears;
    return {file, n, deepN, bad}; })()`);
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
    /* The build looks at the ranks every day, under every band limit in the one pass (the page's own replay looks at
       month starts): best ranks and peaks to the day. */
    state.useTableFiles = false; state.histAllCache = {}; state.histDaily = true;
    const H = histAll(g), file = histToFile(g, H), B = histFromFile(g, JSON.parse(JSON.stringify(file)));
    const ranks = histRanksToFile(g), R3 = JSON.parse(JSON.stringify(ranks)); let rankN = 0;
    /* and without the minimum number of ranked teams, for a team's History when the window is set to "all time" */
    const ranksW = histRanksToFile(g, true), W3 = JSON.parse(JSON.stringify(ranksW));
    const wCheck = (A, tag) => { state.histFiles = {[g]:file}; state.histWFiles = {[g]:W3};
      for (const b of BAND_OPTIONS){ state.maxBand = b; const A0 = A.bestBy0.get(b);
        for (const k of A.items.keys()){ const x = A0.get(k) || {}, y = histWindowBest(g, k); if (!y){ say(tag + '±' + b + ' ' + k + ': the page did not read the all-time window file'); break; }
          for (const f of ['r', 'lo']){ n++; rankN++; const a = x[f], c = y[f]; if (!(a && c ? a.n === c.n && a.ts === c.ts : !a && !c)) say(tag + '±' + b + ' ' + k + ' best ' + f + ' (no minimum): ' + JSON.stringify(a) + ' v ' + JSON.stringify(c)); } } }
      state.maxBand = DEFAULTS.maxBand; state.histFiles = {}; state.histWFiles = {}; };
    wCheck(H, '');
    state.histAllCache = {};
    if (!B){ state.histDaily = false; return {file, n, bad:['the page refused the file']}; }
    /* today under every band limit: the ranks file read back against the pass */
    for (const b of BAND_OPTIONS){ state.maxBand = b; const C = histFromFile(g, JSON.parse(JSON.stringify(file)), b === DEFAULTS.maxBand ? null : R3), A = H.bestBy.get(b);
      if (!C){ say('±' + b + ': the page refused the ranks file'); continue; }
      for (const k of H.items.keys()){ const x = A.get(k) || {}, y = C.best.get(k) || {};
        for (const f of ['r', 'lo']){ n++; rankN++; const a = x[f], c = y[f]; if (!(a && c ? a.n === c.n && a.ts === c.ts : !a && !c)) say('±' + b + ' ' + k + ' best ' + f + ': ' + JSON.stringify(a) + ' v ' + JSON.stringify(c)); } } }
    state.maxBand = DEFAULTS.maxBand;
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
    /* Past dates: the file answers for any date up to its own. Peak, upsets and match lines must equal the page's. A
       best rank may differ only around the date itself: the page looks at the date in view and skips the month starts
       since the last match before it; the file has every month start and not the date. */
    { const B0 = state.bounds[g], dates = [0.6, 0.93].map(f => Math.round((B0.min + (B0.max - B0.min) * f) / DAY) * DAY), F2 = JSON.parse(JSON.stringify(file));
      for (const d of dates){ state.asOf = d; state.histAllCache = {}; const A = histAll(g), C = histFromFile(g, F2), w0 = fmtDate(d) + ' ', ms = state.matches[g], li = firstIndexAt(ms, d + 1) - 1, lm = li >= 0 ? ms[li].ts : -Infinity;
        if (!C){ say(w0 + 'the page refused the file'); continue; }
        eq(A.items.size, C.items.size, w0 + 'teams');
        for (const [k, items] of A.items){ const it = C.items.get(k) || [], S = histStats(items), T = histStats(it), x = A.best.get(k) || {}, y = C.best.get(k) || {}, p = A.peak.get(k), q = C.peak.get(k), w = w0 + k;
          for (const f of ['r', 'lo']){ n++; const a = x[f], b = y[f], same = a && b ? a.n === b.n && a.ts === b.ts : !a && !b; if (!same && !((a && a.ts === d) || (b && b.ts > lm))) say(w + ' best ' + f + ': ' + JSON.stringify(a) + ' v ' + JSON.stringify(b)); }
          eq(!!p, !!q, w + ' peak'); if (p && q){ num(p.r, q.r, w + ' peak rating'); eq(p.ts, q.ts, w + ' peak date'); eq(p.nm, q.nm, w + ' peak name'); }
          eq(S.n, T.n, w + ' matches');
          for (const f of ['win', 'loss', 'upWin', 'upLoss']) eq(S[f] ? S[f].m : null, T[f] ? T[f].m : null, w + ' ' + f);
          if (S.upWin && T.upWin) num(S.upWin.p, T.upWin.p, w + ' upset win chance'); if (S.upLoss && T.upLoss) num(S.upLoss.q, T.upLoss.q, w + ' upset loss chance'); }
        /* the same date under every band limit, from the same pass */
        for (const b of BAND_OPTIONS){ if (b === DEFAULTS.maxBand) continue; state.maxBand = b; const C2 = histFromFile(g, F2, R3), A2 = A.bestBy.get(b); state.maxBand = DEFAULTS.maxBand;
          if (!C2){ say(w0 + '±' + b + ': the page refused the ranks file'); continue; }
          for (const k of A.items.keys()){ const x = A2.get(k) || {}, y = C2.best.get(k) || {};
            for (const f of ['r', 'lo']){ n++; rankN++; const a = x[f], c = y[f], same = a && c ? a.n === c.n && a.ts === c.ts : !a && !c; if (!same) say(w0 + '±' + b + ' ' + k + ' best ' + f + ': ' + JSON.stringify(a) + ' v ' + JSON.stringify(c)); } } }
        wCheck(A, w0); }
      state.asOf = B0.max; state.histAllCache = {}; }
    state.histDaily = false; state.maxBand = DEFAULTS.maxBand; state.histAllCache = {};
    return {file, ranks, ranksW, rankN, n, bad}; })()`);
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
    let c0 = c; const A = fixtures.concat(pairs).map(fp), SA = fixtures.map(fx => { const q = stakeQuery(c, fx); return q ? ratingStakes(c, q.ka, q.kb, q.neutral, q.kind) : null; });
    const GA = goalsStats(c, 'med'), lmA = lmTable();
    /* the published copy: today's table and the forecast file, no model */
    state.useTableFiles = true; state.tableFiles = {[g]:tf}; state.fcFiles = {[g]:JSON.parse(JSON.stringify(file))}; clear();
    let runs = 0; const rw = runWindow; runWindow = function(){ runs++; return rw.apply(this, arguments); };
    c0 = getRatings(); n++; if (!c0.fromFile) say('the table was not read from its file');
    const B = fixtures.concat(pairs).map(fp), SB = fixtures.map(fx => { const q = stakeQuery(c0, fx); return q ? ratingStakes(c0, q.ka, q.kb, q.neutral, q.kind) : null; });
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

/* The Predictor's "what this result would do to both ratings" for listed fixtures (the page's stakesToFile): every
   pairing on the fixture list, and the pairing the Predictor opens on, in each venue and kind of match the Predictor
   offers, under the usual window and under all time. Read back the way the page reads it (today's two tables, the
   forecast file and this file, no model) and compared with what the page works out itself, the two ways round on
   neutral ground included. Returns {file, n, bad}. */
export function stakesFile(model, g, fixtures){
  model.run(`__fxl = ${JSON.stringify(JSON.stringify(fixtures || []))}`);
  return model.run(`(() => { ${DEFAULT_STATE(g)}
    const g = ${JSON.stringify(g)}, fixtures = JSON.parse(__fxl), bad = [], say = s => { if (bad.length < 12) bad.push(s); }; let n = 0;
    const clear = () => { for (const k of Object.keys(lmCache)) delete lmCache[k]; for (const k of Object.keys(lmTabCache)) delete lmTabCache[k]; gmCache = {}; state.cache = {key:null}; };
    state.useTableFiles = false; state.fcFiles = {}; state.tableFiles = {}; state.stakeFiles = {}; clear();
    const file = stakesToFile(g, fixtures), fc = fcToFile(g, fixtures), ks = predKs(), W = [DEFAULTS.windowYears, 0];
    const asks = c => { const top = c.table.length >= 2 ? c.table : c.all, out = [];
      const pairs = fixtures.map(fx => stakeQuery(c, fx)).filter(q => q).map(q => [q.ka, q.kb, q.kind]); if (top.length >= 2) pairs.push([top[0].key, top[1].key, null]);
      for (const [ka, kb, k0] of pairs) for (const [a, b, nt] of [[ka, kb, false], [kb, ka, false], [ka, kb, true], [kb, ka, true]])
        for (const k of new Set(k0 === null ? ks : ks.concat([k0]))) out.push([a, b, nt, k, ratingStakes(c, a, b, nt, k)]);
      return out; };
    const A = [], tfs = {};
    for (const w of W){ state.windowYears = w; clear(); const c = getRatings(); A.push(asks(c)); tfs[(w === 0 ? 'all-' : '') + g] = JSON.parse(JSON.stringify(tableToFile(c))); }
    /* the published copy: no model */
    state.useTableFiles = true; state.tableFiles = tfs; state.fcFiles = {[g]:JSON.parse(JSON.stringify(fc))}; state.stakeFiles = {[g]:JSON.parse(JSON.stringify(file))};
    let runs = 0; const rw = runWindow, cr = computeRatings; runWindow = function(){ runs++; return rw.apply(this, arguments); }; computeRatings = function(){ runs++; return cr.apply(this, arguments); };
    W.forEach((w, wi) => { state.windowYears = w; clear(); const c = getRatings(); n++; if (!c.fromFile) say('window ' + w + ': the table was not read from its file');
      const B = asks(c); n++; if (B.length !== A[wi].length) return say('window ' + w + ': ' + A[wi].length + ' questions v ' + B.length);
      A[wi].forEach((a, i) => { const b = B[i], id = 'window ' + w + ' ' + a.slice(0, 4).join('|'); n++; if (!a[4] || !b[4]) return say(id + ': missing');
        a[4].forEach((x, j) => { n += 2; const y = b[4][j]; if (!(Math.abs(x.da - y.da) <= 1.1e-6 && Math.abs(x.db - y.db) <= 1.1e-6) || x.hs !== y.hs || x.as !== y.as) say(id + ' result ' + j + ': ' + x.da + '/' + x.db + ' v ' + y.da + '/' + y.db); }); }); });
    runWindow = rw; computeRatings = cr; n++; if (runs) say('the model ran ' + runs + ' times');
    state.useTableFiles = false; state.tableFiles = {}; state.fcFiles = {}; state.stakeFiles = {}; state.windowYears = DEFAULTS.windowYears; clear();
    return {file, n, bad, entries:Object.keys(file.win).length + Object.keys(file.all).length}; })()`);
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

/* The goals figures for any past date: one file a year (the page's goalsYearFiles makes them all in one run through
   the archive). Each holds every team's attack and defence figures as the year began and, for each match of the year,
   the two teams' figures after it. Returns the files by year. */
export function goalsYears(model, g){
  return model.run(`(() => { ${DEFAULT_STATE(g)} state.useTableFiles = false; state.goalFiles = {}; gmCache = {}; return goalsYearFiles(${JSON.stringify(g)}); })()`);
}
/* Reads the goals figures back from the year files the way the page does, for a spread of dates in each of the given
   years, and compares every team's figures with the page's own. Returns {n, bad}. */
export function goalsCheck(model, g, files, years){
  model.run(`__gy = ${JSON.stringify(JSON.stringify(years.map(y => files[y])))}`);
  return model.run(`(() => { ${DEFAULT_STATE(g)}
    const g = ${JSON.stringify(g)}, Fs = JSON.parse(__gy), bad = [], say = s => { if (bad.length < 12) bad.push(s); }; let n = 0;
    for (const F of Fs){ const y = F.year, B = state.bounds[g], ups = F.ups;
      const dates = [Date.UTC(y, 0, 1), Date.UTC(y, 5, 30), Date.UTC(y, 11, 31)].concat(ups.length ? [ups[0][0], ups[ups.length >> 1][0], ups[ups.length - 1][0], ups[ups.length >> 1][0] - DAY] : []).filter(t => t >= B.min && t < B.max);
      for (const ts of dates){
        state.useTableFiles = false; state.goalFiles = {}; gmCache = {}; const A = goalsModel(g, ts);
        state.useTableFiles = true; state.goalFiles = {[g + '|' + y]:F}; gmCache = {}; const C = goalsModel(g, ts), w = fmtDate(ts) + ' ';
        n++; if (!C || !C.fromFile){ say(w + 'the page did not read the file'); continue; }
        n++; if (A.att.size !== C.att.size) say(w + A.att.size + ' teams v ' + C.att.size); n++; if (!(Math.abs(A.mu - C.mu) <= 1e-12)) say(w + 'level ' + A.mu + ' v ' + C.mu);
        for (const [k, v] of A.att){ n += 3; if (!(Math.abs(v - C.att.get(k)) <= 5.1e-7 && Math.abs(A.def.get(k) - C.def.get(k)) <= 5.1e-7) || A.nm.get(k) !== C.nm.get(k)) say(w + k + ': ' + v + '/' + A.def.get(k) + '/' + A.nm.get(k) + ' v ' + C.att.get(k) + '/' + C.def.get(k) + '/' + C.nm.get(k)); } } }
    state.useTableFiles = false; state.goalFiles = {}; gmCache = {};
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
  const what = (process.env.PRECOMPUTE_WHAT || 'days,all,matches,ed').split(',').filter(Boolean);
  for (const g of ['men', 'women']){
    /* The month-end tables are superseded by the match-day files and take most of a minute, so they are only made when asked for (PRECOMPUTE_WHAT=months,...). */
    const R = precompute(model, g, what.includes('months') ? +(process.env.PRECOMPUTE_FROM || 0) : 9999);
    const files = {['latest-' + g + '.json']:{built, ...R.latest}};
    if (R.months.stamps.length) files['months-' + g + '.json'] = {built, ...R.months};
    /* Today's table in full, at the usual window and for all time, each checked against the page before it is written. */
    for (const [name, allTime] of [['table-' + g + '.json', false], ['table-all-' + g + '.json', true]]){
      const t0 = Date.now(), F = tableFile(model, g, allTime), chk = tableCheck(model, g, allTime, F);
      if (chk.bad.length) throw new Error(`${name} does not match the page: ${chk.bad.join('; ')}`);
      /* Ranked again on the page under other band limits and the cautious order: equal to the model's own each time. */
      let again = 0; const sets = [{maxBand:0, rankBy:'lower'}, {maxBand:150, rankBy:'rating'}, {maxBand:350, rankBy:'rating'}, {maxBand:250, rankBy:'lower'}];
      for (const set of sets){ const c2 = tableCheck(model, g, allTime, JSON.parse(JSON.stringify(F)), set); again += c2.n;
        if (c2.bad.length) throw new Error(`${name} ranked again (±${set.maxBand}, by ${set.rankBy}) does not match the page: ${c2.bad.join('; ')}`); }
      files[name] = {built, ...F};
      console.log(`${name}: ${F.rows.length} teams, ${F.window.length} matches, ${chk.n} values equal to the page's, ${again} more under ${sets.length} other ranking settings (${((Date.now() - t0) / 1000).toFixed(1)} s)`); }
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
     PRECOMPUTE_WHAT=days,all,matches,ed picks which (the default is all four); PRECOMPUTE_YEARS=1990-2026 limits the years. */
  const mfile = path.join(OUT, 'manifest.json'), manifest = fs.existsSync(mfile) ? JSON.parse(fs.readFileSync(mfile, 'utf8')) : {};
  const mp = modelPrint(model), force = process.env.PRECOMPUTE_FORCE === '1' || manifest.model !== mp;
  if (force) for (const k of Object.keys(manifest)) delete manifest[k];
  manifest.model = mp;
  const [y0, y1] = (process.env.PRECOMPUTE_YEARS || '').split('-').map(Number);
  /* A change to a kind of file's layout: bump its mark here and every year of it is worked out again. */
  const FORMAT = {days:'v6:', all:'v6:', matches:'v2d:'};   // days v6: every day's own figures, two decimal places   // matches v2b: the expected result to six decimal places (four moved a shown chance by a point now and then)
  const jobs = {days:(g, y) => dayTables(model, g, y, false), all:(g, y) => dayTables(model, g, y, true), matches:(g, y) => matchLedger(model, g, y)};
  for (const g of ['men', 'women']){
    const first = new Date(model.run(`state.bounds[${JSON.stringify(g)}].min`)).getUTCFullYear(), last = new Date(model.run(`state.bounds[${JSON.stringify(g)}].max`)).getUTCFullYear();
    for (const kind of what){ if (!jobs[kind]) continue;
      const t0 = Date.now(); let done = 0, kept = 0, bytes = 0, gz = 0;
      let rBytes = 0, checked = 0, cN = 0;
      for (let y = Math.max(first, y0 || first); y <= Math.min(last, y1 || last); y++){
        const name = `${kind}/${g}/${y}.json`, file = path.join(OUT, name), print = (FORMAT[kind] || '') + inputPrint(model, g, y, kind === 'all');
        /* A year of matches comes with a year of old ranks under every band limit and rank order (ranks/), from the same run. */
        const rname = `ranks/${g}/${y}.json`, rfile = path.join(OUT, rname), rprint = 'v1:' + print;
        if (manifest[name] === print && fs.existsSync(file) && (kind !== 'matches' || (manifest[rname] === rprint && fs.existsSync(rfile)))){ kept++; continue; }
        const J = jobs[kind](g, y), ranks = J.ranks; delete J.ranks;
        const s = JSON.stringify({built, ...J});
        if (kind === 'matches'){
          const R = {v:1, year:y, bands:model.run('BAND_OPTIONS'), rows:ranks};
          /* every ninth year and the last three are read back the way the page reads them and compared with its own working */
          if (y % 9 === 0 || y >= last - 2){ const C = ledgerCheck(model, g, JSON.parse(s), R, true); checked++; cN += C.n;
            if (C.bad.length) throw new Error(`${name} or ${rname} does not match the page: ${C.bad.join('; ')}`); }
          const rs = JSON.stringify({built, ...R}); fs.mkdirSync(path.dirname(rfile), {recursive:true}); fs.writeFileSync(rfile, rs + '\n'); manifest[rname] = rprint; rBytes += rs.length; }
        fs.mkdirSync(path.dirname(file), {recursive:true}); fs.writeFileSync(file, s + '\n'); manifest[name] = print;
        done++; bytes += s.length; gz += zlib.gzipSync(s).length;
        fs.writeFileSync(mfile, JSON.stringify(manifest, null, 1) + '\n');
      }
      console.log(`${kind}/${g}: ${done} year${done === 1 ? '' : 's'} worked out in ${((Date.now() - t0) / 1000).toFixed(0)} s (${kb(bytes)}, ${kb(gz)} gzipped), ${kept} unchanged` + (kind === 'matches' && done ? `; old ranks ${kb(rBytes)}; ${checked} years read back, ${cN} values equal to the page's` : ''));
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
      const rname = `snapr-${allTime ? 'all-' : ''}${g}.json`, rfile = path.join(OUT, rname), fmark = 'v2:' + print.slice(3);   // the ranks under every band limit, beside each series
      if (manifest[name] === fmark && fs.existsSync(file) && manifest[rname] === fmark && fs.existsSync(rfile)){ console.log(`${name}: unchanged`); continue; }
      const t0 = Date.now(), R = snapSeries(model, g, allTime);
      if (R.bad.length) throw new Error(`${name} does not match the page: ${R.bad.join('; ')}`);
      if (R.ranks){ const rs = JSON.stringify({built, ...R.ranks}); fs.writeFileSync(rfile, rs + '\n'); manifest[rname] = fmark; console.log(`${rname}: ${kb(rs.length)} (${kb(zlib.gzipSync(rs).length)} gzipped)`); }
      const s = JSON.stringify({built, ...R.file}); fs.writeFileSync(file, s + '\n'); manifest[name] = fmark;
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
    let seen = 0, deepN = 0;
    for (const e of list){ const name = `${kind}/${g}/${e.name}.json`, file = path.join(OUT, name), print = 'v3:' + e.print; seen++;
      if (manifest[name] === print && fs.existsSync(file)){ kept++; continue; }
      const R = editionFile(model, g, e.id, allTime, seen % 20 === 1); deepN += R.deepN || 0;
      if (R.bad.length) throw new Error(`${name} does not match the page: ${R.bad.join('; ')}`);
      const s = JSON.stringify(R.file); fs.writeFileSync(file, s + '\n'); manifest[name] = print; done++; bytes += s.length; n += R.n; }
    for (const k of Object.keys(manifest)) if (k.startsWith(`${kind}/${g}/`) && !names.has(k.slice(`${kind}/${g}/`.length))) delete manifest[k];
    fs.writeFileSync(mfile, JSON.stringify(manifest, null, 1) + '\n');
    console.log(`${kind}/${g}: ${done} edition${done === 1 ? '' : 's'} worked out in ${((Date.now() - t0) / 1000).toFixed(0)} s (${kb(bytes)}, ${n} values equal to the page's${deepN ? '; under the other band limits, on one edition in twenty, ' + deepN + ' more' : ''}), ${kept} unchanged${gone ? ', ' + gone + ' removed' : ''}`);
  }
  /* Records and the teams' all-time history: kept while the archive and the model are unchanged. */
  for (const g of ['men', 'women']){
    const last = new Date(model.run(`state.bounds[${JSON.stringify(g)}].max`)).getUTCFullYear(), all = inputPrint(model, g, last, true);
    for (const [name, make, mark] of [[`records-${g}.json`, recordsFile, 'v1:'], [`hist-${g}.json`, histFile, 'v2d:'], [`yearends-${g}.json`, yearEndsFile, 'v1:']]){
      const file = path.join(OUT, name), print = mark + all;
      if (manifest[name] === print && fs.existsSync(file)){ console.log(`${name}: unchanged`); continue; }
      const t0 = Date.now(), R = make(model, g);
      if (R.bad.length) throw new Error(`${name} does not match the page: ${R.bad.join('; ')}`);
      if (R.ranksW){ const wn = `histw-${g}.json`, ws = JSON.stringify({built, ...R.ranksW}); fs.writeFileSync(path.join(OUT, wn), ws + '\n'); manifest[wn] = print; console.log(`${wn}: the same for the all-time window, ${kb(ws.length)} (${kb(zlib.gzipSync(ws).length)} gzipped)`); }
      if (R.ranks){ const rn = `histr-${g}.json`, rs = JSON.stringify({built, ...R.ranks}); fs.writeFileSync(path.join(OUT, rn), rs + '\n'); manifest[rn] = print;
        console.log(`${rn}: best ranks under every band limit, ${R.rankN} equal to the page's, ${kb(rs.length)} (${kb(zlib.gzipSync(rs).length)} gzipped)`); }
      const s = JSON.stringify({built, ...R.file}); fs.writeFileSync(file, s + '\n'); manifest[name] = print;
      fs.writeFileSync(mfile, JSON.stringify(manifest, null, 1) + '\n');
      console.log(`${name}: ${R.kept !== undefined ? R.kept + ' of ' + R.rows + ' matches and ' + R.keptSeries + ' of ' + R.series + ' entries kept, ' + R.n + ' views drawn the same' : (R.years ? R.years + ' years, ' + R.rows + ' team-years, ' : '') + R.n + ' values equal to the page\'s'}, ${kb(s.length)} (${kb(zlib.gzipSync(s).length)} gzipped) (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    }
  }
  /* Best rank and peak rating to the day: a file a team, from the match-day tables written above (no engine). Worked
     out again when any match changes. A ninth of the teams are checked against a plain scan of their own daily series,
     and a few teams on a few dates against the page's own table for that day under all twelve settings. */
  for (const g of ['men', 'women']){
    const t0 = Date.now(), dir = path.join(OUT, 'best', g), B = model.run(`state.bounds[${JSON.stringify(g)}]`), first = new Date(B.min).getUTCFullYear(), last = new Date(B.max).getUTCFullYear();
    const mark = 'v2:' + inputPrint(model, g, last, true), mname = `best/${g}`;   // v2: every day counted (day files layout 6), the peak as the table shows it
    if (manifest[mname] === mark && fs.existsSync(dir)){ console.log(`best/${g}: unchanged`); continue; }
    const read = y => { const f = path.join(OUT, 'days', g, y + '.json'); if (!fs.existsSync(f)) return null; const F = JSON.parse(fs.readFileSync(f, 'utf8')); return F.v === 6 ? F : null; };
    if (!read(last)){ console.log(`best/${g}: skipped (no match-day tables to read)`); continue; }
    const R = bestSeries(read, {first, last, lastDay:Math.round(B.max / 86400000), bands:model.run('BAND_OPTIONS'), cut:model.run('BAND_Z*RD_MAX')});
    if (R.bad.length) throw new Error(`best/${g} does not add up: ${R.bad.join('; ')}`);
    const keys = [...R.teams.keys()], names = model.run(`${JSON.stringify(keys)}.map(bestFileName)`), print = model.run(`matchListPrint(state.matches[${JSON.stringify(g)}])`), bands = model.run('BAND_OPTIONS');
    if (new Set(names).size !== names.length) throw new Error(`best/${g}: two teams share a file name`);
    const files = new Map(keys.map((key, i) => [key, {v:1, g, key, asOf:B.max, print, bands, ...R.teams.get(key)}]));
    /* against the page: today, and three past dates */
    const pick = keys.filter((k, i) => i % 23 === 0), sample = Object.fromEntries(pick.map(k => [k, files.get(k)])); let cn = 0, held = 0;
    for (const d of [new Date(B.max).toISOString().slice(0, 10), (last - 3) + '-06-20', (last - 20) + '-10-05', (first + 40) + '-03-14']){ const y = +d.slice(0, 4), days = {};
      for (const k of [y - 1, y]){ const F = read(k); if (F) days[k] = F; }
      if (!days[y]) continue;
      const C = bestCheck(model, g, [d], sample, days); cn += C.n; held += C.held;
      if (C.bad.length) throw new Error(`best/${g} does not match the page on ${d}: ${C.bad.join('; ')}`); }
    fs.mkdirSync(dir, {recursive:true}); let bytes = 0, gz = 0;
    keys.forEach((key, i) => { const s = JSON.stringify({built, ...files.get(key)}); fs.writeFileSync(path.join(dir, names[i] + '.json'), s + '\n'); bytes += s.length; gz += zlib.gzipSync(s).length; });
    manifest[mname] = mark; fs.writeFileSync(mfile, JSON.stringify(manifest, null, 1) + '\n');
    console.log(`best/${g}: ${keys.length} teams from ${R.nDays} days of tables (${kb(bytes)}, ${kb(gz)} gzipped; the largest ${kb(Math.max(...keys.map(k => JSON.stringify(files.get(k)).length)))}), ${R.n} answers equal to a plain scan, ${cn} compared with the page's table for the day (${held} exactly) (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  }
  /* A team's rank after each of its matches under "all time": a file a team, worked out again when any match changes. */
  for (const g of ['men', 'women']){
    const t0 = Date.now(), dir = path.join(OUT, 'ranka', g), B = model.run(`state.bounds[${JSON.stringify(g)}]`), last = new Date(B.max).getUTCFullYear();
    const mark = 'v1:' + inputPrint(model, g, last, true), mname = `ranka/${g}`;
    if (manifest[mname] === mark && fs.existsSync(dir)){ console.log(`ranka/${g}: unchanged`); continue; }
    const R = rankAllFiles(model, g);
    if (R.bad.length) throw new Error(`ranka/${g} does not match the page: ${R.bad.join('; ')}`);
    const keys = Object.keys(R.teams), names = model.run(`${JSON.stringify(keys)}.map(bestFileName)`), bands = model.run('BAND_OPTIONS');
    if (new Set(names).size !== names.length) throw new Error(`ranka/${g}: two teams share a file name`);
    fs.rmSync(dir, {recursive:true, force:true}); fs.mkdirSync(dir, {recursive:true}); let bytes = 0, gz = 0, big = 0, rows = 0;
    keys.forEach((key, i) => { const s = JSON.stringify({built, v:1, g, key, asOf:B.max, print:R.print, bands, rows:R.teams[key]}); fs.writeFileSync(path.join(dir, names[i] + '.json'), s + '\n');
      bytes += s.length; gz += zlib.gzipSync(s).length; big = Math.max(big, s.length); rows += R.teams[key].length; });
    manifest[mname] = mark; fs.writeFileSync(mfile, JSON.stringify(manifest, null, 1) + '\n');
    console.log(`ranka/${g}: ${keys.length} teams, ${rows} match days (${kb(bytes)}, ${kb(gz)} gzipped; the largest ${kb(big)}), ${R.n} ranks equal to the page's on ${R.sample} matches under every setting (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  }
  /* The goals figures for past dates: a file a year, all from one run through the archive; a year is written again
     only when a match up to its end has changed. Checked on a spread of dates in every sixth year and the last three. */
  for (const g of ['men', 'women']){
    const t0 = Date.now(), dir = path.join(OUT, 'goals', g), first = new Date(model.run(`state.bounds[${JSON.stringify(g)}].min`)).getUTCFullYear(), last = new Date(model.run(`state.bounds[${JSON.stringify(g)}].max`)).getUTCFullYear();
    const want = []; for (let y = first; y <= last; y++){ const name = `goals/${g}/${y}.json`; if (manifest[name] !== 'v1:' + inputPrint(model, g, y, true) || !fs.existsSync(path.join(OUT, name))) want.push(y); }
    if (!want.length){ console.log(`goals/${g}: ${last - first + 1} years unchanged`); continue; }
    const files = goalsYears(model, g), sample = want.filter(y => y % 6 === 0 || y >= last - 2), chk = goalsCheck(model, g, files, sample);
    if (chk.bad.length) throw new Error(`goals/${g} does not match the page: ${chk.bad.join('; ')}`);
    fs.mkdirSync(dir, {recursive:true}); let bytes = 0;
    for (const y of want){ const s = JSON.stringify(files[y]); fs.writeFileSync(path.join(OUT, `goals/${g}/${y}.json`), s + '\n'); manifest[`goals/${g}/${y}.json`] = 'v1:' + inputPrint(model, g, y, true); bytes += s.length; }
    fs.writeFileSync(mfile, JSON.stringify(manifest, null, 1) + '\n');
    console.log(`goals/${g}: ${want.length} years written (${kb(bytes)}), ${chk.n} values equal to the page's on dates in ${sample.length} of them (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  }
  /* The chart on a past date: every team on the first day of each quarter, ten years to a file. A decade is worked out
     again when a match in it or in the twelve years before it changes, or a new quarter starts. Then a few past dates
     are read back the way a team's page reads them (with the matches' and the match-day tables' files written above)
     and compared point by point with the model's own. */
  for (const g of ['men', 'women']){
    const t0 = Date.now(), dir = path.join(OUT, 'series', g), first = new Date(model.run(`state.bounds[${JSON.stringify(g)}].min`)).getUTCFullYear(), last = new Date(model.run(`state.bounds[${JSON.stringify(g)}].max`)).getUTCFullYear();
    let done = 0, kept = 0, bytes = 0, rbytes = 0, n = 0; const marks = {};   // a decade's mark is recorded once the charts below have been read back
    fs.mkdirSync(dir, {recursive:true});
    for (let D = Math.floor(first / 10) * 10; D <= last; D += 10){
      const name = `series/${g}/${D}.json`, file = path.join(OUT, name), print = 'v1:' + seriesCount(model, g, D) + ':' + inputPrint(model, g, D, false) + ':' + inputPrint(model, g, Math.min(D + 9, last), false);
      const rname = `seriesr/${g}/${D}.json`, rfile = path.join(OUT, rname);   // the same dates' ranks under every band limit
      if (manifest[name] === print && fs.existsSync(file) && manifest[rname] === print && fs.existsSync(rfile)){ kept++; continue; }
      const R = seriesDecadeFile(model, g, D);
      if (R.bad.length) throw new Error(`${name} does not match the page: ${R.bad.join('; ')}`);
      const s = JSON.stringify({built, ...R.file}); fs.writeFileSync(file, s + '\n'); delete manifest[name]; marks[name] = print; done++; bytes += s.length; n += R.n;
      const rs = JSON.stringify({built, ...R.ranks}); fs.mkdirSync(path.dirname(rfile), {recursive:true}); fs.writeFileSync(rfile, rs + '\n'); delete manifest[rname]; marks[rname] = print; rbytes += rs.length;
    }
    if (!done){ console.log(`series/${g}: ${kept} decades unchanged`); continue; }
    const read = (kind, y) => { const f = path.join(OUT, kind, g, y + '.json'); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null; };
    /* The first date falls inside the archive's first twelve years, where a chart starts at the first match. */
    const dates = [(first + 8) + '-03-13'].concat(g === 'men' ? ['1938-06-20', '1974-07-08', '2010-07-12'] : ['1999-07-11'], [(last - 1) + '-03-15']); let pts = 0, edge = 0, tried = 0, altPts = 0;
    for (const d of dates){ const y = +d.slice(0, 4), files = {}, ledgers = {}, days = {};
      for (let D = Math.floor((y - 12) / 10) * 10; D <= y; D += 10){ const F = read('series', D); if (F) files[D] = F; }
      for (let k = y - 12; k <= y; k++){ const F = read('matches', k); if (F) ledgers[k] = F; }
      for (let k = y - 3; k <= y; k++){ const F = read('days', k); if (F) days[k] = F; }
      if (!days[y] || !ledgers[y]) continue;   // a run that writes only some kinds of file
      /* the other band limits too: the decades' and the years' ranks files */
      const rfiles = {}, rledgers = {};
      for (const D of Object.keys(files)){ const F = read('seriesr', D); if (F) rfiles[D] = F; }
      for (const k of Object.keys(ledgers)){ const F = read('ranks', k); if (F) rledgers[k] = F; }
      const C = seriesCheck(model, g, [d], files, ledgers, days, {rfiles, rledgers}); tried++;
      if (C.bad.length) throw new Error(`series/${g} does not match the page on ${d}: ${C.bad.join('; ')}`);
      pts += C.pts; edge += C.edge; altPts += C.altPts; }
    Object.assign(manifest, marks); fs.writeFileSync(mfile, JSON.stringify(manifest, null, 1) + '\n');
    console.log(`series/${g}: ${done} decades written (${kb(bytes)}), ${kept} unchanged, ${n} values equal to the page's; ranks under every band limit ${kb(rbytes)}; ${tried} past charts read back, ${pts} points equal and ${altPts} ranks under the other band limits (${edge} on a rounding edge) (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  }
  /* A past date with the window set to "all time": the tables are the year files under all/ (written above), a match's
     ratings come from today's all-time table file, and the chart's older part from a series of its own (series-all/,
     with its ranks under every band limit in seriesr-all/). A few days' tables and a few past charts are read back the
     way the page reads them, on every run. */
  for (const g of ['men', 'women']){
    const t0 = Date.now(), dir = path.join(OUT, 'series-all', g), first = new Date(model.run(`state.bounds[${JSON.stringify(g)}].min`)).getUTCFullYear(), last = new Date(model.run(`state.bounds[${JSON.stringify(g)}].max`)).getUTCFullYear();
    const read = (kind, y) => { const f = path.join(OUT, kind, g, y + '.json'); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null; };
    if (!read('all', last)){ console.log(`all time on a past date (${g}): no year files (PRECOMPUTE_WHAT without "all"), nothing written`); continue; }
    let done = 0, kept = 0, bytes = 0, rbytes = 0, n = 0; const marks = {};
    fs.mkdirSync(dir, {recursive:true});
    for (let D = Math.floor(first / 10) * 10; D <= last; D += 10){
      const name = `series-all/${g}/${D}.json`, file = path.join(OUT, name), print = 'v1:' + seriesCount(model, g, D) + ':' + inputPrint(model, g, Math.min(D + 9, last), true);
      const rname = `seriesr-all/${g}/${D}.json`, rfile = path.join(OUT, rname);
      if (manifest[name] === print && fs.existsSync(file) && manifest[rname] === print && fs.existsSync(rfile)){ kept++; continue; }
      const R = seriesDecadeFile(model, g, D, true);
      if (R.bad.length) throw new Error(`${name} does not match the page: ${R.bad.join('; ')}`);
      const s = JSON.stringify({built, ...R.file}); fs.writeFileSync(file, s + '\n'); delete manifest[name]; marks[name] = print; done++; bytes += s.length; n += R.n;
      const rs = JSON.stringify({built, ...R.ranks}); fs.mkdirSync(path.dirname(rfile), {recursive:true}); fs.writeFileSync(rfile, rs + '\n'); delete manifest[rname]; marks[rname] = print; rbytes += rs.length;
    }
    const tableAll = JSON.parse(fs.readFileSync(path.join(OUT, `table-all-${g}.json`), 'utf8'));
    /* tables: a day in the middle of three years, as published and ranked again under another band limit in the cautious order */
    let tn = 0, tdays = 0;
    for (const y of [...new Set([first + 8, g === 'men' ? 1974 : 1999, last - 1])]){ const F = read('all', y), P = read('all', y - 1), i = F ? F.days.length >> 1 : -1; if (i < 0) continue;
      for (const set of [null, {maxBand:150, rankBy:'lower'}]){ const C = dayCheck(model, g, F, i, 0, P ? [P] : [], set, tableAll); tn += C.n; tdays++;
        if (C.bad.length) throw new Error(`all/${g}/${y}.json, ${F.days[i]}${set ? ' ranked again' : ''}, does not match the page: ${C.bad.join('; ')}`); } }
    /* charts */
    const dates = (g === 'men' ? ['1938-06-20', '1974-07-08'] : ['1999-07-11']).concat([(last - 1) + '-03-15']); let pts = 0, edge = 0, tried = 0, altPts = 0;
    for (const d of dates){ const y = +d.slice(0, 4), files = {}, rfiles = {}, days = {};
      for (let D = Math.floor(first / 10) * 10; D <= y; D += 10){ const F = read('series-all', D), RF = read('seriesr-all', D); if (F) files[D] = F; if (RF) rfiles[D] = RF; }
      for (let k = y - 3; k <= y; k++){ const F = read('all', k); if (F) days[k] = F; }
      const C = seriesAllCheck(model, g, [d], files, rfiles, days, tableAll); tried++;
      if (C.bad.length) throw new Error(`series-all/${g} does not match the page on ${d}: ${C.bad.join('; ')}`);
      pts += C.pts; edge += C.edge; altPts += C.altPts; }
    Object.assign(manifest, marks); fs.writeFileSync(mfile, JSON.stringify(manifest, null, 1) + '\n');
    console.log(`all time on a past date (${g}): series ${done} decades written (${kb(bytes)}, ranks ${kb(rbytes)}), ${kept} unchanged; ${tdays} tables read back, ${tn} values equal to the page's; ${tried} past charts read back, ${pts} points equal and ${altPts} under the other band limits (${edge} on a rounding edge) (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  }
  /* What today's forecasts are made from. Worked out on every run: the listed fixtures change through the day. */
  { const fxFile = path.join(DATA, 'fixtures.json'), FX = fs.existsSync(fxFile) ? JSON.parse(fs.readFileSync(fxFile, 'utf8')) : {};
    for (const g of ['men', 'women']){
      const t0 = Date.now(), name = `fc-${g}.json`, R = fcFile(model, g, FX[g] || []);
      if (R.bad.length) throw new Error(`${name} does not match the page: ${R.bad.join('; ')}`);
      const s = JSON.stringify({built, ...R.file}); fs.writeFileSync(path.join(OUT, name), s + '\n');
      console.log(`${name}: ${R.file.lm.length} teams, ${R.withStakes} of ${R.fixtures} listed fixtures with their stakes, ${R.n} values equal to the page's (${R.pairs} other pairings tried), ${kb(s.length)} (${kb(zlib.gzipSync(s).length)} gzipped) (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
      { const t1 = Date.now(), name2 = `stakes-${g}.json`, S = stakesFile(model, g, FX[g] || []);
        if (S.bad.length) throw new Error(`${name2} does not match the page: ${S.bad.join('; ')}`);
        const s2 = JSON.stringify({built, ...S.file}); fs.writeFileSync(path.join(OUT, name2), s2 + '\n');
        console.log(`${name2}: ${S.entries} match-ups (listed pairings, each venue and kind of match, both windows), ${S.n} values equal to the page's, ${kb(s2.length)} (${kb(zlib.gzipSync(s2).length)} gzipped) (${((Date.now() - t1) / 1000).toFixed(1)} s)`); }
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
