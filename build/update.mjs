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
// Environment: APIFOOTBALL_KEY (optional), API_BUDGET (requests per run, default 80), ARCHIVE_DIR (read the
// archives from a local folder with men/ and women/ subfolders instead of downloading; used by the tests),
// TODAY (YYYY-MM-DD, for tests), API_GAP_MS (pause between requests, default 6500).
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseCSV, toCSV} from './lib/csv.mjs';
import {makeTeamMatcher, makeTournamentMapper, archiveCountry} from './lib/names.mjs';
import {makeClient, mapFixture} from './lib/apifootball.mjs';
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
export function planDates(today, earliest, fetched){
  const t = dayNum(today), out = [t - 1, t, t + 1, t - 2, t - 3];
  for (let d = t + 2; d <= t + 14; d++) out.push(d);
  for (let d = t - 4; d >= dayNum(earliest); d--){
    const when = fetched[iso(d * DAY)];
    if (!when || dayNum(when) < d + 3) out.push(d);
  }
  return out.map(d => iso(d * DAY));
}

/* Neutral and country from the venue, once its country is known. */
function placeRow(r, venues){
  const v = r.venue_id && venues[r.venue_id];
  if (v && v.country){
    r.country = archiveCountry(v.country);
    r.neutral = r.country === r.home_team ? 'FALSE' : (r.country === r.away_team ? 'FALSE' : 'TRUE');
    if (!r.city && v.city) r.city = v.city;
  } else if (!r.neutral) r.neutral = 'FALSE';
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

export async function run(){
  const today = process.env.TODAY || iso(Date.now());
  const built = new Date().toISOString();
  const state = readJSON(path.join(STORE, 'state.json'), {fetched:{}});
  const venues = readJSON(path.join(STORE, 'venues.json'), {});
  const fixturesStore = readJSON(path.join(STORE, 'fixtures.json'), {});
  const status = {built, today, api:{keyPresent:!!process.env.APIFOOTBALL_KEY}, unmatched:{}, unmappedTournaments:{}, skipped:{}};

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

  // 2. Gap-filler
  if (process.env.APIFOOTBALL_KEY){
    const teams = {men:new Set(), women:new Set()}, tours = {men:new Set(), women:new Set()};
    for (const g of ['men', 'women']) for (const r of A[g]){ teams[g].add(r.home_team); teams[g].add(r.away_team); tours[g].add(r.tournament); }
    const matchTeam = makeTeamMatcher(teams), mapTournament = makeTournamentMapper(tours);
    const client = makeClient({key:process.env.APIFOOTBALL_KEY, budget:+(process.env.API_BUDGET || 80),
      gapMs:+(process.env.API_GAP_MS || 6500), log: m => console.log(m)});
    const earliest = iso(dayNum(ends.men < ends.women ? ends.men : ends.women) * DAY + DAY);
    const byId = {men:new Map(gap.men.map(r => [String(r.api_id), r])), women:new Map(gap.women.map(r => [String(r.api_id), r]))};
    for (const date of planDates(today, earliest, state.fetched)){
      if (!client.covers(date)) continue;          // outside what the plan allows: no request spent
      const list = await client.fixturesOn(date);
      if (list === null) break;
      if (list.outside) continue;
      for (const k of Object.keys(fixturesStore)) if (fixturesStore[k].date === date) delete fixturesStore[k];
      for (const f of list){
        const x = mapFixture(f, matchTeam, mapTournament);
        if (x.skip){
          if (x.skip === 'unmatched') x.names.forEach(n => status.unmatched[n] = (status.unmatched[n] || 0) + 1);
          else status.skipped[x.skip] = (status.skipped[x.skip] || 0) + 1;
          continue;
        }
        if (x.row.unmapped_tournament) status.unmappedTournaments[x.row.league] = (status.unmappedTournaments[x.row.league] || 0) + 1;
        if (x.kind === 'result'){ x.row.updated = built; byId[x.gender].set(String(x.row.api_id), x.row); }
        else fixturesStore[x.row.api_id] = {...x.row, gender:x.gender};
      }
      state.fetched[date] = today;
      console.log(date + ': ' + list.length + ' fixtures from the API');
    }
    // venues for rows and fixtures still missing a country
    const need = new Set();
    for (const g of ['men', 'women']) for (const r of byId[g].values()) if (r.venue_id && !venues[r.venue_id]) need.add(r.venue_id);
    for (const r of Object.values(fixturesStore)) if (r.venue_id && !venues[r.venue_id]) need.add(r.venue_id);
    for (const id of need){
      const v = await client.venue(id);
      if (v === null) break;
      venues[id] = v[0] ? {name:v[0].name || '', city:v[0].city || '', country:v[0].country || ''} : {name:'', city:'', country:''};
    }
    for (const g of ['men', 'women']) gap[g] = [...byId[g].values()];
    status.api = {keyPresent:true, ...client.stats};
  }

  // 3. Merge, write
  const fixtures = {built, men:[], women:[]};
  for (const r of Object.values(fixturesStore)){
    if (r.date < today){ delete fixturesStore[r.api_id]; continue; }
    placeRow(r, venues);
    fixtures[r.gender].push({date:r.date, kickoff:r.kickoff, home:r.home_team, away:r.away_team, tournament:r.tournament,
      city:r.city, country:r.country, neutral:r.neutral === 'TRUE'});
  }
  for (const g of ['men', 'women']){
    fixtures[g].sort((a, b) => a.kickoff < b.kickoff ? -1 : 1);
    gap[g] = prune(gap[g].map(r => placeRow(r, venues)), A[g]).sort((a, b) => a.date < b.date ? -1 : 1);
    fs.mkdirSync(STORE, {recursive:true});
    fs.writeFileSync(path.join(STORE, 'gapfill-' + g + '.csv'), toCSV(gap[g], GAP_COLS));
    const rows = A[g].map(r => ({...r, src:'archive'})).concat(gap[g].map(r => ({...r, src:'gapfill'})));
    const so = SO[g].concat(gap[g].filter(r => r.shootout_winner).map(r => ({date:r.date, home_team:r.home_team, away_team:r.away_team, winner:r.shootout_winner})));
    const meta = {built, archive:{end:ends[g], rows:A[g].length},
      gapfill:{rows:gap[g].length, from:gap[g].length ? gap[g][0].date : null, to:gap[g].length ? gap[g][gap[g].length - 1].date : null}};
    writeJSON(path.join(DATA, g + '.json'), compact(g, rows, so, former, meta));
    status[g] = {...meta, fixtures:fixtures[g].length};
  }
  writeJSON(path.join(DATA, 'fixtures.json'), fixtures);

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
    const u = updateRecord(record.entries, fixtures, (g, list) => model.forecast(g, list), merged, now, built);
    writeJSON(recFile, {built, entries:u.list});
    status.forecasts = {total:u.list.length, scored:u.list.filter(e => e.result).length, newThisRun:u.made, updatedThisRun:u.updated, scoredThisRun:u.scored};
  }
  writeJSON(path.join(DATA, 'status.json'), status, true);
  writeJSON(path.join(STORE, 'state.json'), state, true);
  writeJSON(path.join(STORE, 'venues.json'), venues, true);
  writeJSON(path.join(STORE, 'fixtures.json'), fixturesStore, true);
  console.log(JSON.stringify({men:status.men, women:status.women, api:status.api}, null, 1));
  return status;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run().catch(e => { console.error(e); process.exit(1); });
