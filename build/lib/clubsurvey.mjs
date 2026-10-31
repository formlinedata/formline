// Club football groundwork: what API-Football covers, so the club section can be scoped from facts.
// One request to /leagues returns every league and cup with the seasons the API holds and what each season covers.
// The nightly full run asks once a week and keeps a compact summary in build/store/clubs/coverage.json.
// Nothing here is shown on the site.

/* Women's competitions, by name. API-Football has no gender field, so this is a best guess, checked by hand later. */
const WOMEN = /\bwomen|\bwomen's|femenin|f[ée]minin|frauen|damallsvenskan|\bliga f\b|\bnwsl\b|\bwsl\b|w-league|ladies|kvinn|vrouwen|toppserien|kvindeliga|naisten|\bdames\b|\bfemení|\bfem\b/i;
/* National-team competitions (internationals are already covered elsewhere), by name or by the "World" country with no club tie. */
const NATIONAL = /world cup|euro championship|nations league|copa am[ée]rica|africa cup of nations|asian cup|gold cup|friendlies(?! clubs)|olympics|qualification|caribbean cup|cosafa|cecafa|saff|aff championship|gulf cup|arab cup|confederations cup|baltic cup|pacific games|island games/i;

/* Season flags, packed: 1 match events, 2 line-ups, 4 standings, 8 match statistics, 16 odds. */
export function seasonFlags(cov){
  if (!cov) return 0;
  const fx = cov.fixtures || {};
  return (fx.events ? 1 : 0) | (fx.lineups ? 2 : 0) | (cov.standings ? 4 : 0) | (fx.statistics_fixtures ? 8 : 0) | (cov.odds ? 16 : 0);
}

/* The /leagues reply → {leagues:[...]} with one compact row per competition, clubs only, sorted by country then name. */
export function summarize(reply){
  const out = [];
  for (const x of reply || []){
    const L = x.league || {}, C = x.country || {};
    if (!L.id || !L.name) continue;
    if (NATIONAL.test(L.name) && !/club/i.test(L.name) && (!C.name || C.name === 'World')) continue;
    const seasons = (x.seasons || []).filter(s => s && s.year).sort((a, b) => a.year - b.year);
    if (!seasons.length) continue;
    const cur = seasons.find(s => s.current) || null;
    out.push({id:L.id, name:L.name, type:L.type === 'Cup' ? 'cup' : 'league', country:C.name || '', code:C.code || '',
      women:WOMEN.test(L.name), first:seasons[0].year, last:seasons[seasons.length - 1].year, current:cur ? cur.year : null,
      seasons:seasons.map(s => [s.year, seasonFlags(s.coverage)])});
  }
  out.sort((a, b) => (a.country === b.country ? 0 : a.country < b.country ? -1 : 1) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) || a.id - b.id);
  return {leagues:out};
}

/* A few headline numbers for status.json. */
export function headline(sum){
  const L = sum.leagues, by = f => L.filter(f).length;
  const seasons = L.reduce((n, l) => n + l.seasons.length, 0);
  return {competitions:L.length, leagues:by(l => l.type === 'league'), cups:by(l => l.type === 'cup'), women:by(l => l.women),
    countries:new Set(L.map(l => l.country)).size, seasons, earliest:L.length ? Math.min(...L.map(l => l.first)) : null,
    withEvents:by(l => l.seasons.some(s => s[1] & 1))};
}

/* Ask at most once every `everyDays` days (state.clubSurvey holds the last date). Returns the headline, or null if
   it didn't ask. Never throws. `get` is the client's /leagues call. */
export async function survey({get, state, today, everyDays = 7, write, log = () => {}}){
  try {
    const last = state.clubSurvey;
    if (last && (Date.parse(today) - Date.parse(last)) / 864e5 < everyDays) return null;
    const reply = await get();
    if (!Array.isArray(reply)){ log('club survey: no answer from /leagues'); return {error:'no answer'}; }
    const sum = summarize(reply);
    write(sum);
    state.clubSurvey = today;
    const h = headline(sum);
    log('club survey: ' + h.competitions + ' club competitions in ' + h.countries + ' countries, ' + h.seasons + ' seasons');
    return {checked:today, ...h};
  } catch (e){ log('club survey: ' + e.message); return {error:e.message}; }
}
