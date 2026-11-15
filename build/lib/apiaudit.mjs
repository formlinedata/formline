// Cross-check against API-Football (November 2026, the data audit). The archives are the base of everything, and they
// have holes and wrong scores: whole tournaments (the COSAFA Cups of 2024 and 2025), single matches near their last
// date (US Virgin Islands 3–2 Bahamas, 4 October 2026), and, for the women, scores entered as 0–0. World Football Elo
// Ratings covers the men only. So on full runs, while the paid plan lasts, some older days are asked about again each
// night, working backwards from the archives' last date, and every finished national-team match the feed has is set
// beside what the site holds (archive, gap-filler, hand-added, Wikipedia fill):
//   - a match the site does not hold at all (same two teams within two days) goes to `missing`;
//   - a match it holds with another score goes to `diffs`.
// Nothing is added or changed by this: build/store/api-audit.json is a list to be checked against a second record
// (Wikipedia, RSSSF, a federation's report) before anything goes in. Pure JS apart from what it is handed.
//
// Two things keep the list to what still needs looking at (15 November 2026, after the first real run):
//   - the held matches carry the site's own corrections (CORRECTIONS in index.html), so a score the site has already put
//     right is not listed again as a difference from the archive's wrong one;
//   - an entry checked and found to be the feed's mistake is noted in build/store/api-audit-settled.json
//     ([{api_id, note}]) and left out from then on.
const DAY = 864e5;
const dayNum = d => Math.round(Date.parse(d + 'T00:00:00Z') / DAY);
const iso = n => new Date(n * DAY).toISOString().slice(0, 10);
const pairKey = (a, b) => [a, b].sort().join('|');

/* What the site holds, for looking up a pair of teams: {men: Map pair -> [{d, home, hs, as}], women: …}.
   fixes: the site's corrections by gender ({men:[{date, home, away, score?, set?, drop?}], …}, as in index.html). A row
   one applies to (the archive's own date and names, and its score where the correction names one) takes the corrected
   score or date, or is left out when the site drops it. */
export function heldIndex(rowsByGender, fixes){
  const out = {};
  for (const g of Object.keys(rowsByGender)){
    const m = out[g] = new Map(), fx = new Map();
    for (const c of (fixes && fixes[g]) || []){ const k = c.date + '|' + c.home + '|' + c.away; if (!fx.has(k)) fx.set(k, []); fx.get(k).push(c); }
    for (const r of rowsByGender[g]){
      let hs = +r.home_score, as = +r.away_score, d = dayNum(r.date);
      const c = (fx.get(r.date + '|' + r.home_team + '|' + r.away_team) || []).find(c => !c.score || c.score === hs + '-' + as);
      if (c){ if (c.drop) continue; const set = c.set || {};
        if (Number.isFinite(set.hs)) hs = set.hs; if (Number.isFinite(set.as)) as = set.as; if (Number.isFinite(set.ts)) d = Math.round(set.ts / DAY); }
      const k = pairKey(r.home_team, r.away_team);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push({d, home:r.home_team, hs, as});
    }
  }
  return out;
}

/* One day's fixtures from the feed beside the held matches. Returns {results, missing, diffs, unmatched}. */
export function compareDay(list, held, {mapFixture, matchTeam, mapTournament}){
  const out = {results:0, missing:[], diffs:[], unmatched:{}};
  for (const f of list || []){
    const x = mapFixture(f, matchTeam, mapTournament);
    if (x.skip === 'unmatched'){ for (const n of x.names || []) out.unmatched[n] = (out.unmatched[n] || 0) + 1; continue; }
    if (x.skip || x.kind !== 'result') continue;
    out.results++;
    const r = x.row, d = dayNum(r.date), near = ((held[x.gender] && held[x.gender].get(pairKey(r.home_team, r.away_team))) || []).filter(h => Math.abs(h.d - d) <= 2);
    const base = {g:x.gender, date:r.date, home:r.home_team, away:r.away_team, score:r.home_score + '-' + r.away_score, tournament:r.tournament, league:r.league,
      city:r.city || '', api_id:r.api_id, ...(r.shootout_winner ? {shootout:r.shootout_winner} : {})};
    if (!near.length){ out.missing.push(base); continue; }
    const same = near.some(h => h.home === r.home_team ? (h.hs === +r.home_score && h.as === +r.away_score) : (h.as === +r.home_score && h.hs === +r.away_score));
    if (!same){ const h = near.sort((a, b) => Math.abs(a.d - d) - Math.abs(b.d - d))[0];
      out.diffs.push({...base, held:(h.home === r.home_team ? h.hs + '-' + h.as : h.as + '-' + h.hs), heldDate:iso(h.d)}); }
  }
  return out;
}

/* The days to ask about this run. First the long sweep: from the archives' last date back to `from`, `perRun` days a
   night. Once that is done, the 120 days before the archives' last date are gone over again, `again` days a night, so a
   match the archive skips near its end is still caught. state: {cursor, from, done, recent}. */
export function auditDays(state, {end, from, perRun, again = 10}){
  const out = [];
  if (!state.done){
    let c = state.cursor && state.cursor <= end ? state.cursor : end;
    for (let i = 0; i < perRun && c >= from; i++){ out.push(c); c = iso(dayNum(c) - 1); }
    return out;
  }
  const lo = dayNum(end) - 120; let c = state.recent && dayNum(state.recent) <= dayNum(end) && dayNum(state.recent) > lo ? dayNum(state.recent) : dayNum(end);
  for (let i = 0; i < again; i++){ out.push(iso(c)); c = c - 1 <= lo ? dayNum(end) : c - 1; }
  return out;
}

/* Runs the night's share. client: the API client (fixturesOn, covers). report: the stored report, changed in place.
   Returns the status line. Stops quietly when the request budget runs out or the plan does not cover a day. */
export async function sweep({client, state, report, held, today, end, from = '2014-11-01', perRun = 200, mapFixture, matchTeam, mapTournament, settled = [], log = () => {}}){
  const st = {asked:0, results:0, missing:0, diffs:0}, done = new Set(settled.map(x => x.api_id));
  report.missing = report.missing || []; report.diffs = report.diffs || []; report.days = report.days || 0;
  const days = auditDays(state, {end, from, perRun});
  for (const date of days){
    if (!client.covers(date)){ st.stopped = 'the plan does not cover ' + date; break; }
    const list = await client.fixturesOn(date);
    if (list === null){ st.stopped = 'request budget used up'; break; }
    if (list.outside){ st.stopped = 'the plan does not cover ' + date; break; }
    if (list.failed) continue;                    // asked again on the rolling pass
    st.asked++; report.days++;
    const C = compareDay(list, held, {mapFixture, matchTeam, mapTournament});
    st.results += C.results;
    /* A day asked about again replaces what was noted for it (asked: the day the feed listed the match under). */
    for (const k of ['missing', 'diffs']){
      report[k] = report[k].filter(x => (x.asked || x.date) !== date).concat(C[k].map(x => x.date === date ? x : {...x, asked:date})); st[k] += C[k].length;
    }
    for (const [n, c] of Object.entries(C.unmatched)){ report.unmatched = report.unmatched || {}; report.unmatched[n] = (report.unmatched[n] || 0) + c; }
    const next = iso(dayNum(date) - 1);
    if (!state.done){ state.cursor = next; if (next < from){ state.done = today; log('API cross-check: the sweep back to ' + from + ' is complete'); } }
    else state.recent = dayNum(next) <= dayNum(end) - 120 ? end : next;
  }
  /* Every entry is looked at again: one the site has come to hold since (added by hand, or the archive caught up) drops
     out, and one it now holds with another score moves to `diffs`. */
  const all = report.missing.concat(report.diffs); report.missing = []; report.diffs = []; let nSettled = 0;
  for (const {held:was, heldDate:wasDate, ...x} of all){
    if (done.has(x.api_id)){ nSettled++; continue; }             // checked: the feed's mistake
    const d = dayNum(x.date), near = ((held[x.g] && held[x.g].get(pairKey(x.home, x.away))) || []).filter(h => Math.abs(h.d - d) <= 2);
    if (!near.length){ report.missing.push(x); continue; }
    const [hs, as] = x.score.split('-').map(Number);
    if (near.some(h => h.home === x.home ? (h.hs === hs && h.as === as) : (h.as === hs && h.hs === as))) continue;
    const h = near.sort((p, q) => Math.abs(p.d - d) - Math.abs(q.d - d))[0];
    report.diffs.push({...x, held:(h.home === x.home ? h.hs + '-' + h.as : h.as + '-' + h.hs), heldDate:iso(h.d)});
  }
  const byDate = (a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
  report.missing.sort(byDate); report.diffs.sort(byDate);
  report.updated = today; report.cursor = state.cursor || null; report.done = state.done || null; report.from = from;
  return {...st, cursor:state.cursor || null, done:state.done || null, open:{missing:report.missing.length, diffs:report.diffs.length}, ...(nSettled ? {settled:nSettled} : {})};
}
