// The public forecast record. Every fixture gets a forecast from the site's model on each nightly run until it
// kicks off; from kick-off it is frozen, and once the result is known it is scored. The file is committed every
// night, so its git history shows each forecast existed before its match.
const DAY = 864e5;
const dayNum = d => Math.round(Date.parse(d + 'T00:00:00Z') / DAY);
export const fxId = (g, f) => g + '|' + f.date + '|' + f.home + '|' + f.away;

/* Score one forecast against a result: three-way log-loss and Brier, and whether the favourite won. */
export function scoreForecast(p, hs, as){
  const k = hs > as ? 0 : (hs === as ? 1 : 2);
  const ll = -Math.log(Math.max(p[k], 1e-9));
  const brier = p.reduce((s, q, i) => s + (q - (i === k ? 1 : 0)) ** 2, 0);
  const fav = p.indexOf(Math.max(...p));
  return {outcome:k, ll:+ll.toFixed(5), brier:+brier.toFixed(5), hit:fav === k};
}

/* Find a played match in the merged rows: the same two teams within a day, either way round, the nearest day first. */
function findRow(rows, e){
  const d = dayNum(e.date); let best = null, bd = 9;
  for (const r of rows){
    const dd = Math.abs(dayNum(r.date) - d); if (dd > 1 || dd >= bd) continue;
    if ((r.home_team === e.home && r.away_team === e.away) || (r.home_team === e.away && r.away_team === e.home)){ best = r; bd = dd; }
  }
  return best;
}
const resultOf = (r, e) => r.home_team === e.home ? [+r.home_score, +r.away_score] : [+r.away_score, +r.home_score];

/* entries: existing record (array). fixtures: {men:[...], women:[...]} from this run. predict(g, list) returns
   forecasts in the same order (or null for a fixture the model cannot rate). rows: merged results per gender. */
export function updateRecord(entries, fixtures, predict, rows, now, built){
  const byId = new Map(entries.map(e => [e.id, e]));
  let made = 0, updated = 0, scored = 0;
  for (const g of ['men', 'women']){
    const open = (fixtures[g] || []).filter(f => Date.parse(f.kickoff || (f.date + 'T23:59:00Z')) > now);
    const preds = open.length ? predict(g, open) : [];
    open.forEach((f, i) => {
      const p = preds[i]; if (!p) return;
      const id = fxId(g, f), e = byId.get(id);
      const fc = {p:p.p.map(x => +x.toFixed(4)), xg:p.xg.map(x => +x.toFixed(2)), likely:p.likely, side:p.side,
        ratings:p.ratings.map(Math.round), bands:p.bands.map(Math.round), asOf:p.asOf};
      if (!e){ byId.set(id, {id, g, date:f.date, kickoff:f.kickoff, home:f.home, away:f.away, tournament:f.tournament,
        made:built, updated:built, ...fc, result:null}); made++; }
      else if (!e.result && Date.parse(e.kickoff || (e.date + 'T23:59:00Z')) > now){
        Object.assign(e, fc, {kickoff:f.kickoff, updated:built}); updated++; }
    });
  }
  /* A forecast for a match that hasn't kicked off and is no longer in the fixture list was for a date that moved (or a
     fixture withdrawn): it was never frozen, so it goes, and the fixture's new date gets its own. Only when that
     gender's list is non-empty, so an empty list from a failed run can't wipe the record. */
  let dropped = 0;
  for (const g of ['men', 'women']){
    const list = fixtures[g] || []; if (!list.length) continue;
    const live = new Set(list.map(f => fxId(g, f)));
    for (const [id, e] of byId) if (e.g === g && !e.result && !e.void && Date.parse(e.kickoff || (e.date + 'T23:59:00Z')) > now && !live.has(id)){ byId.delete(id); dropped++; }
  }
  /* Results for forecasts whose match has been played. One played match answers one forecast. When a fixture's date
     moves after its first kick-off time has passed (API-Football had Chinese Taipei v Kyrgyzstan a day early in
     November 2026), two forecasts stand a day apart for one match: the one on the day it was played keeps the result
     and the other goes, also when an earlier run had already scored both. */
  const byRow = new Map();
  for (const e of byId.values()){
    if (e.void) continue;
    if (!e.result && Date.parse(e.kickoff || (e.date + 'T23:59:00Z')) > now) continue;
    const r = findRow(rows[e.g] || [], e);
    if (r){ if (!byRow.has(r)) byRow.set(r, []); byRow.get(r).push(e); }
    else if (!e.result && now - Date.parse(e.date + 'T00:00:00Z') > 21 * DAY) e.void = 'no result found within three weeks (postponed or not played)';
  }
  for (const [r, es] of byRow){
    const off = e => Math.abs(dayNum(e.date) - dayNum(r.date));
    es.sort((a, b) => off(a) - off(b) || (a.date < b.date ? 1 : -1));
    const e = es[0];
    if (!e.result){ e.result = resultOf(r, e); Object.assign(e, scoreForecast(e.p, e.result[0], e.result[1])); scored++; }
    for (const x of es.slice(1)){ byId.delete(x.id); dropped++; }
  }
  const list = [...byId.values()].sort((a, b) => (a.kickoff || a.date) < (b.kickoff || b.date) ? -1 : 1);
  return {list, made, updated, scored, dropped};
}
