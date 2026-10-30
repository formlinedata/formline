// Nightly data build for Formline.
//
//   node build/update.mjs
//
// 1. Downloads the open archives (martj42 men's and women's results, shootouts, former names).
// 2. If APIFOOTBALL_KEY is set, fills the gap between the archive's last match and today, and collects the next
//    fortnight's fixtures, from API-Football. Results it has already collected are kept in build/store.
// 3. Writes data/men.json and data/women.json (archive plus gap-filler, compact), data/fixtures.json and
//    data/status.json. The site reads these when it is served from the same place; opened any other way it falls
//    back to the archive on GitHub.
//
// The plan is read from API-Football's /status first (it costs nothing). On the free plan a run makes at most
// API_BUDGET requests (default 80), 6.5 s apart. On a paid plan the run may use up to half of what is left of the
// day's quota (at most 1500, or 60 for a light run), paced at half the per-minute limit. The plan, its end date and
// the requests used go into status.json, with a notice when the paid plan is about to end or has ended.
//
// RUN_MODE=light (the runs through the day): does nothing, and spends nothing, unless a national-team match is on
// yesterday, today or tomorrow; then it asks only about those three days. The nightly run is RUN_MODE=full.
//
// Environment: APIFOOTBALL_KEY (optional), API_BUDGET (free-plan requests per run, default 80), RUN_MODE,
// ARCHIVE_DIR (read the archives from a local folder with men/ and women/ subfolders instead of downloading; used by
// the tests), TODAY (YYYY-MM-DD, for tests), API_GAP_MS (pause between requests; overrides the plan's pacing).
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseCSV, toCSV} from './lib/csv.mjs';
import {makeTeamMatcher, makeTournamentMapper, archiveCountry} from './lib/names.mjs';
import {wikiVenues} from './lib/wikivenues.mjs';
import {makeClient, mapFixture, planStatus, isFreePlan} from './lib/apifootball.mjs';
import {loadModel} from './lib/model.mjs';
import {updateRecord} from './lib/forecasts.mjs';

const ROOT = process.env.FORMLINE_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STORE = path.join(ROOT, 'build', 'store'), DATA = path.join(ROOT, 'data');
const RAW = {
  men: 'https://raw.githubusercontent.com/martj42/international_results/master/',
  women: 'https://raw.githubusercontent.com/martj42/womens-international-results/master/'
};
const DAY = 864e5;
const GAP_COLS = ['date','home_team','away_team','home_score','away_score','tournament','city','country','neutral',
  'kickoff','venue_id','api_id','league','shootout_winner','unmapped_tournament','updated'];

const iso = ts => new Date(ts).toISOString().slice(0, 10);
const dayNum = d => Math.round(Date.parse(d + 'T00:00:00Z') / DAY);
const readJSON = (f, dflt) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return dflt; } };
const writeJSON = (f, v, pretty) => { fs.mkdirSync(path.dirname(f), {recursive:true}); fs.writeFileSync(f, JSON.stringify(v, null, pretty ? 1 : 0) + '\n'); };

async function readArchive(g, file){
  if (process.env.ARCHIVE_DIR){
    const f = path.join(process.env.ARCHIVE_DIR, g, file);
    return fs.existsSync(f) ? parseCSV(fs.readFileSync(f, 'utf8')) : null;
  }
  const res = await fetch(RAW[g] + file);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('archive download failed: ' + file + ' (' + g + ') HTTP ' + res.status);
  return parseCSV(await res.text());
}

/* Archive pair key: the same two teams, either way round. */
const pairKey = (a, b) => [a, b].sort().join('|');

/* Gap-filler rows that the archive now covers are dropped: the same two teams within two days, or anything a
   week or more before the archive's last match (by then the archive is the record). */
export function prune(gap, archive){
  if (!archive.length) return gap;
  const end = dayNum(archive[archive.length - 1].date);
  const seen = new Map();
  for (const r of archive){ const d = dayNum(r.date); if (d < end - 60) continue;
    const k = pairKey(r.home_team, r.away_team); if (!seen.has(k)) seen.set(k, []); seen.get(k).push(d); }
  return gap.filter(r => {
    const d = dayNum(r.date);
    if (d <= end - 7) return false;
    const ds = seen.get(pairKey(r.home_team, r.away_team));
    return !(ds && ds.some(x => Math.abs(x - d) <= 2));
  });
}

/* Dates to ask the API about this run: the recent and coming days every time, then older days not yet settled,
   newest first. A day is settled once it has been fetched three or more days after it. Yesterday, today and
   tomorrow come first: they are all the free plan covers, so they must not wait behind days it will refuse. */
export function planDates(today, earliest, fetched, mode, ahead = 14){
  const t = dayNum(today), out = [t - 1, t, t + 1];
  if (mode === 'light') return out.map(d => iso(d * DAY));
  out.push(t - 2, t - 3);
  for (let d = t + 2; d <= t + ahead; d++) out.push(d);
  for (let d = t - 4; d >= dayNum(earliest); d--){
    const when = fetched[iso(d * DAY)];
    if (!when || dayNum(when) < d + 3) out.push(d);
  }
  return out.map(d => iso(d * DAY));
}

/* Where a match is played, worked out from what is known, best first:
   1. the venue's country from API-Football (venue_src 'api');
   2. the city, looked up in the archive's own record of where each city is (venue_src 'city');
   2b. the match box in the team's Wikipedia results article (venue_src 'wiki'), for fixtures the API has no venue for yet;
   3. finals tournaments and other events played in one place are neutral, except for the hosts (venue_src 'event');
   4. otherwise the first-named team is taken to be at home (venue_src 'assumed').
   Home advantage only goes to a team playing in its own country, as everywhere else on the site. Recomputed every run,
   so a venue announced late replaces the guess. */
export const NEUTRAL_EVENTS = new Set(['FIFA World Cup', 'UEFA Euro', 'Copa América', 'African Cup of Nations', 'AFC Asian Cup', 'Gold Cup',
  'CONCACAF Gold Cup', 'Oceania Nations Cup', 'OFC Nations Cup', 'Olympic Games', 'Confederations Cup', 'Arab Cup', 'Gulf Cup', 'COSAFA Cup',
  'CECAFA Cup', 'AFF Championship', 'ASEAN Championship', 'SAFF Cup', 'EAFF Championship', 'WAFF Championship', 'CAFA Nations Cup',
  'FIFA Series', 'King\'s Cup', 'Intercontinental Cup', 'Kirin Cup', 'Kirin Challenge Cup', 'Pacific Games', 'Island Games',
  'CONMEBOL–UEFA Cup of Champions', 'Euro', 'AFC Championship', 'African Championship', 'CONCACAF Championship', 'OFC Championship',
  'Algarve Cup', 'SheBelieves Cup', 'Pinatar Cup', 'Cyprus Cup', 'Turkish Women\'s Cup']);
/* Hosts of the finals coming up (tournament|year). Add each edition when its hosts are decided. */
export const EVENT_HOSTS = {'FIFA World Cup|2026':['United States', 'Canada', 'Mexico'], 'AFC Asian Cup|2027':['Saudi Arabia'],
  'African Cup of Nations|2027':['Kenya', 'Uganda', 'Tanzania'], 'FIFA World Cup|2027':['Brazil'], 'Arab Cup|2025':['Qatar'],
  'Gold Cup|2027':['United States'], 'UEFA Euro|2028':['England', 'Republic of Ireland', 'Scotland', 'Wales'], 'SheBelieves Cup|2027':['United States'],
  'Algarve Cup|2027':['Portugal'], 'Kirin Cup|2026':['Japan'], 'Kirin Challenge Cup|2026':['Japan'], 'King\'s Cup|2026':['Thailand']};
export const cityKey = c => String(c || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '');
/* city -> country from the archive: the country each city appears with most often. */
export function cityCountries(rows){
  const n = new Map();
  for (const r of rows){ if (!r.city || !r.country) continue; const k = cityKey(r.city); const m = n.get(k) || new Map(); m.set(r.country, (m.get(r.country) || 0) + 1); n.set(k, m); }
  const out = new Map(); for (const [k, m] of n) out.set(k, [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]);
  return out;
}
export function placeRow(r, venues, cities){
  const v = r.venue_id && venues[r.venue_id];
  const set = (country, src) => { r.country = country; r.neutral = country === r.home_team || country === r.away_team ? 'FALSE' : 'TRUE'; r.venue_src = src; };
  if (v && v.country){ if (!r.city && v.city) r.city = v.city; set(archiveCountry(v.country), 'api'); return r; }
  const fromCity = r.city && cities ? cities.get(cityKey(r.city)) : null;
  if (fromCity){ set(fromCity, 'city'); return r; }
  if (r.wiki && r.wiki.country){ if (!r.city) r.city = r.wiki.city; set(r.wiki.country, 'wiki'); return r; }
  if (NEUTRAL_EVENTS.has(r.tournament)){
    const hosts = EVENT_HOSTS[r.tournament+'|'+String(r.date || '').slice(0, 4)] || [];
    const host = hosts.includes(r.home_team) ? r.home_team : hosts.includes(r.away_team) ? r.away_team : null;
    if (host) set(host, 'event'); else { r.country = ''; r.neutral = 'TRUE'; r.venue_src = 'event'; }
    return r;
  }
  set(r.home_team, 'assumed');
  return r;
}

/* Compact form the site loads: shared string tables and one short array per match. */
export function compact(g, rows, shootouts, former, meta){
  const strings = new Map(), S = [];
  const sid = s => { s = s || ''; let i = strings.get(s); if (i === undefined){ i = S.length; strings.set(s, i); S.push(s); } return i; };
  // Rows in date order; the first field is the gap in days from the previous match, which keeps the file small.
  rows = rows.slice().sort((x, y) => x.date < y.date ? -1 : x.date > y.date ? 1 : 0);
  let prev = 0;
  const m = rows.map(r => { const d = dayNum(r.date), gap = d - prev; prev = d; return [gap, sid(r.home_team), sid(r.away_team), +r.home_score, +r.away_score, sid(r.tournament),
    String(r.neutral).toUpperCase() === 'TRUE' ? 1 : 0, sid(r.city), sid(r.country), r.src === 'gapfill' ? 1 : 0]; });
  const so = shootouts.map(r => [dayNum(r.date), sid(r.home_team), sid(r.away_team), sid(r.winner)]);
  const fm = (former || []).map(r => [r.current, r.former, r.start_date, r.end_date]);
  return {v:1, gender:g, built:meta.built, archive:meta.archive, gapfill:meta.gapfill, s:S, m, so, former:fm};
}

/* Requests allowed this run and the pause between them, from the plan. */
export function pacing(plan, mode, env = process.env){
  const paid = !plan.error && !isFreePlan(plan);
  let budget, gapMs;
  if (paid){
    const left = plan.limitDay ? Math.floor(plan.limitDay / 2) - (plan.usedToday || 0) : 500;   // never more than half the day's quota
    budget = Math.max(0, Math.min(mode === 'light' ? 60 : 1500, left));
    gapMs = plan.perMinute ? Math.max(250, Math.ceil(120000 / plan.perMinute)) : 2500;          // half the per-minute limit
  } else {
    budget = +(env.API_BUDGET || 80);
    gapMs = 6500;
  }
  if (env.API_GAP_MS != null && env.API_GAP_MS !== '') gapMs = +env.API_GAP_MS;
  return {paid, budget, gapMs};
}

/* A line for status.json when the paid plan is ending or has ended. */
export function planNotice(plan, paid, before, today){
  if (paid && plan.end){
    const days = dayNum(String(plan.end).slice(0, 10)) - dayNum(today);
    if (days <= 7) return 'The paid API plan (' + plan.name + ') ends on ' + String(plan.end).slice(0, 10) + (days >= 0 ? ', in ' + days + ' day' + (days === 1 ? '' : 's') : '') + '.';
  }
  if (!paid && before && before.paid) return 'Back on the free API plan: the paid plan (' + before.name + ') ended' + (before.end ? ' on ' + String(before.end).slice(0, 10) : '') +
    '. Only yesterday to tomorrow can be fetched now.';
  return null;
}

/* Write a data file only when something other than its build time changed, so the runs through the day do not
   add a new copy of a 1.5 MB file to the history every hour. */
function writeIfChanged(f, v){
  const old = readJSON(f, null), strip = o => o && JSON.stringify({...o, built:null});
  if (old && strip(old) === strip(v)) return false;
  writeJSON(f, v); return true;
}

export async function run(){
  const today = process.env.TODAY || iso(Date.now());
  const built = new Date().toISOString();
  const mode = process.env.RUN_MODE === 'light' ? 'light' : 'full';
  const state = readJSON(path.join(STORE, 'state.json'), {fetched:{}});
  state.watch = state.watch || {};
  // v2: team names added on 25 Oct 2026 (Bosnia-Herzegovina, Central Africa, French Guyana). Ask again about the last
  // 30 days once, so matches dropped as unknown before are picked up.
  if ((state.v || 1) < 2){ const cut = dayNum(today) - 30; for (const d of Object.keys(state.fetched)) if (dayNum(d) >= cut) delete state.fetched[d]; state.v = 2; }
  const venues = readJSON(path.join(STORE, 'venues.json'), {});
  const fixturesStore = readJSON(path.join(STORE, 'fixtures.json'), {});

  // A light run only works when a national-team match is on yesterday, today or tomorrow (from the fixture list,
  // or a match that was still being played at the last look).
  if (mode === 'light'){
    const t = dayNum(today), near = d => d && dayNum(d) >= t - 1 && dayNum(d) <= t + 1;
    const on = Object.values(fixturesStore).some(r => near(r.date)) || Object.keys(state.watch).some(near);
    if (!on || !process.env.APIFOOTBALL_KEY){ console.log('Light run: no national-team match within a day, nothing to do.'); return {idle:true}; }
  }
  const status = {built, today, mode, api:{keyPresent:!!process.env.APIFOOTBALL_KEY}, unmatched:{}, unmappedTournaments:{}, skipped:{}};

  // 1. Archives
  const A = {}, SO = {}, gap = {};
  for (const g of ['men', 'women']){
    A[g] = (await readArchive(g, 'results.csv')) || [];
    if (!A[g].length) throw new Error('empty archive: ' + g);
    A[g].sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
    SO[g] = (await readArchive(g, 'shootouts.csv')) || [];
    const f = path.join(STORE, 'gapfill-' + g + '.csv');
    gap[g] = fs.existsSync(f) ? parseCSV(fs.readFileSync(f, 'utf8')) : [];
  }
  const former = await readArchive('men', 'former_names.csv');
  const ends = {men: A.men[A.men.length - 1].date, women: A.women[A.women.length - 1].date};
  const cities = cityCountries(A.men.concat(A.women));
  status.seen = {men:{results:0, latest:null}, women:{results:0, latest:null}};

  // 2. Gap-filler
  if (process.env.APIFOOTBALL_KEY){
    const teams = {men:new Set(), women:new Set()}, tours = {men:new Set(), women:new Set()};
    for (const g of ['men', 'women']) for (const r of A[g]){ teams[g].add(r.home_team); teams[g].add(r.away_team); tours[g].add(r.tournament); }
    const matchTeam = makeTeamMatcher(teams), mapTournament = makeTournamentMapper(tours);
    const plan = await planStatus({key:process.env.APIFOOTBALL_KEY});
    const pace = pacing(plan, mode);
    const notice = planNotice(plan, pace.paid, state.plan, today);
    if (!plan.error) state.plan = {name:plan.name, end:plan.end, paid:pace.paid, seen:today};
    const client = makeClient({key:process.env.APIFOOTBALL_KEY, budget:pace.budget, gapMs:pace.gapMs, log: m => console.log(m)});
    const earliest = iso(dayNum(ends.men < ends.women ? ends.men : ends.women) * DAY + DAY);
    const byId = {men:new Map(gap.men.map(r => [String(r.api_id), r])), women:new Map(gap.women.map(r => [String(r.api_id), r]))};
    // How far ahead to look for fixtures: 60 days on a paid plan (about 60 requests a night), two weeks on the free one.
    const ahead = pace.paid ? +(process.env.FIXTURE_DAYS || 60) : 14;
    for (const date of planDates(today, earliest, state.fetched, mode, ahead)){
      if (!client.covers(date)) continue;          // outside what the plan allows: no request spent
      const list = await client.fixturesOn(date);
      if (list === null) break;
      if (list.outside || list.failed) continue;
      for (const k of Object.keys(fixturesStore)) if (fixturesStore[k].date === date) delete fixturesStore[k];
      delete state.watch[date];
      let unknownHere = false;
      for (const f of list){
        const x = mapFixture(f, matchTeam, mapTournament);
        if (x.skip && /^status (1H|HT|2H|ET|BT|P|SUSP|INT|LIVE)$/.test(x.skip)) state.watch[date] = true;   // being played now: look again on the next run
        if (x.skip){
          if (x.skip === 'unmatched'){ unknownHere = true; x.names.forEach(n => status.unmatched[n] = (status.unmatched[n] || 0) + 1); }
          else status.skipped[x.skip] = (status.skipped[x.skip] || 0) + 1;
          continue;
        }
        if (x.row.unmapped_tournament) status.unmappedTournaments[x.row.league] = (status.unmappedTournaments[x.row.league] || 0) + 1;
        if (x.kind === 'result'){ x.row.updated = built; byId[x.gender].set(String(x.row.api_id), x.row);
          const S = status.seen[x.gender]; S.results++; if (!S.latest || x.row.date > S.latest) S.latest = x.row.date; }
        else fixturesStore[x.row.api_id] = {...x.row, gender:x.gender};
      }
      if (unknownHere) delete state.fetched[date];   // a team we could not name: ask about this day again next run
      else state.fetched[date] = today;
      console.log(date + ': ' + list.length + ' fixtures from the API');
    }
    // venues for rows and fixtures still missing a country
    const need = new Set();
    for (const g of ['men', 'women']) for (const r of byId[g].values()) if (r.venue_id && !venues[r.venue_id]) need.add(r.venue_id);
    for (const r of Object.values(fixturesStore)) if (r.venue_id && !venues[r.venue_id]) need.add(r.venue_id);
    for (const id of need){
      const v = await client.venue(id);
      if (v === null) break;
      if (v.failed) continue;
      venues[id] = v[0] ? {name:v[0].name || '', city:v[0].city || '', country:v[0].country || ''} : {name:'', city:'', country:''};
    }
    for (const g of ['men', 'women']) gap[g] = [...byId[g].values()];
    status.api = {keyPresent:true, ...client.stats,
      plan: plan.error ? {error:plan.error} : {name:plan.name, end:plan.end, active:plan.active, limitDay:plan.limitDay,
        usedTodayBeforeRun:plan.usedToday, perMinute:plan.perMinute || client.stats.perMinute || null},
      paid: pace.paid, budget: pace.budget, notice};
  }

  // 2b. Wikipedia, for fixtures in the next 30 days that still have no venue (full runs only; never fatal)
  if (mode === 'full' && process.env.WIKI_VENUES !== '0'){
    const horizon = iso(dayNum(today) * DAY + 30 * DAY);
    const open = Object.values(fixturesStore).filter(r => r.date >= today && r.date <= horizon && !r.tbd &&
      ['assumed', 'event', 'wiki'].includes(placeRow({...r, wiki:null}, venues, cities).venue_src));
    const wcache = readJSON(path.join(STORE, 'wiki-venues.json'), {});
    try {
      const W = await wikiVenues(open, wcache, {today, cities, cityKey, toArchive:archiveCountry, log: m => console.log(m),
        fetchImpl: process.env.WIKI_FETCH === 'off' ? null : globalThis.fetch, limit:+(process.env.WIKI_LIMIT || 100)});
      for (const r of Object.values(fixturesStore)) r.wiki = W.found.get(String(r.api_id)) || null;
      status.wiki = {open:open.length, ...W.stats};
    } catch(e){ status.wiki = {error:e.message}; }
    writeJSON(path.join(STORE, 'wiki-venues.json'), wcache, true);
  }

  // 3. Merge, write
  const fixtures = {built, men:[], women:[]};
  for (const r of Object.values(fixturesStore)){
    if (r.date < today){ delete fixturesStore[r.api_id]; continue; }
    placeRow(r, venues, cities);
    fixtures[r.gender].push({date:r.date, kickoff:r.kickoff, home:r.home_team, away:r.away_team, tournament:r.tournament,
      city:r.city, country:r.country, neutral:r.neutral === 'TRUE', venue:r.venue_src, ...(r.tbd ? {tbd:true} : {}), ...(r.tbc ? {tbc:true} : {})});
  }
  for (const g of ['men', 'women']){
    fixtures[g].sort((a, b) => a.kickoff < b.kickoff ? -1 : 1);
    gap[g] = prune(gap[g].map(r => placeRow(r, venues, cities)), A[g]).sort((a, b) => a.date < b.date ? -1 : 1);
    fs.mkdirSync(STORE, {recursive:true});
    fs.writeFileSync(path.join(STORE, 'gapfill-' + g + '.csv'), toCSV(gap[g], GAP_COLS));
    const rows = A[g].map(r => ({...r, src:'archive'})).concat(gap[g].map(r => ({...r, src:'gapfill'})));
    const so = SO[g].concat(gap[g].filter(r => r.shootout_winner).map(r => ({date:r.date, home_team:r.home_team, away_team:r.away_team, winner:r.shootout_winner})));
    const meta = {built, archive:{end:ends[g], rows:A[g].length},
      gapfill:{rows:gap[g].length, from:gap[g].length ? gap[g][0].date : null, to:gap[g].length ? gap[g][gap[g].length - 1].date : null}};
    writeIfChanged(path.join(DATA, g + '.json'), compact(g, rows, so, former, meta));
    status[g] = {...meta, fixtures:fixtures[g].length};
  }
  writeIfChanged(path.join(DATA, 'fixtures.json'), fixtures);
  /* How each fixture's venue was worked out, so missing venues show up. */
  status.venues = {};
  for (const g of ['men', 'women']) for (const f of fixtures[g]) status.venues[f.venue] = (status.venues[f.venue] || 0) + 1;

  // 4. Forecast record: forecasts from the site's own model, frozen at kick-off, scored once played
  const recFile = path.join(DATA, 'forecasts.json');
  const record = readJSON(recFile, {entries:[]});
  if (fixtures.men.length || fixtures.women.length || record.entries.some(e => !e.result && !e.void)){
    const model = loadModel(process.env.SITE_HTML || path.join(ROOT, 'index.html'));
    const now = process.env.NOW ? Date.parse(process.env.NOW) : Date.now(), merged = {};
    for (const g of ['men', 'women']){
      model.load(g, readJSON(path.join(DATA, g + '.json'), null));
      merged[g] = A[g].concat(gap[g]).filter(r => r.date >= iso(now - 60 * DAY));
    }
    const known = {men:fixtures.men.filter(f => !f.tbd), women:fixtures.women.filter(f => !f.tbd)};   // no forecast until both sides are known
    const u = updateRecord(record.entries, known, (g, list) => model.forecast(g, list), merged, now, built);
    writeJSON(recFile, {built, entries:u.list});
    status.forecasts = {total:u.list.length, scored:u.list.filter(e => e.result).length, newThisRun:u.made, updatedThisRun:u.updated, scoredThisRun:u.scored};
  }
  writeJSON(path.join(DATA, 'status.json'), status, true);
  for (const d of Object.keys(state.watch)) if (dayNum(d) < dayNum(today) - 2) delete state.watch[d];
  writeJSON(path.join(STORE, 'state.json'), state, true);
  writeJSON(path.join(STORE, 'venues.json'), venues, true);
  writeJSON(path.join(STORE, 'fixtures.json'), fixturesStore, true);
  console.log(JSON.stringify({men:status.men, women:status.women, api:status.api}, null, 1));
  return status;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run().catch(e => { console.error(e); process.exit(1); });
