// Offline tests for the nightly build: a small archive, and a fake API-Football that answers with responses in the
// documented v3 format. Run: node build/test.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {parseCSV} from './lib/csv.mjs';
import {makeTeamMatcher, makeTournamentMapper, normKey} from './lib/names.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
let passed = 0;
const ok = (cond, label) => { assert.ok(cond, label); passed++; console.log('  ok  ' + label); };

// --- unit: names
const teams = {men:new Set(['United States', 'South Korea', 'DR Congo', 'Ivory Coast', 'Curaçao', 'Republic of Ireland', 'Saint Kitts and Nevis', 'Spain']),
               women:new Set(['Spain', 'United States', 'Turks and Caicos Islands'])};
const mt = makeTeamMatcher(teams);
ok(mt('USA', 'Friendlies').name === 'United States', 'USA -> United States');
ok(mt('Korea Republic', 'Friendlies').name === 'South Korea', 'Korea Republic -> South Korea');
ok(mt('Congo DR', 'Friendlies').name === 'DR Congo', 'Congo DR -> DR Congo');
ok(mt('Curacao', 'Friendlies').name === 'Curaçao', 'accents ignored');
ok(mt('Ireland', 'Friendlies').name === 'Republic of Ireland', 'Ireland -> Republic of Ireland');
ok(mt('St. Kitts and Nevis', 'Friendlies').name === 'Saint Kitts and Nevis', 'St. -> Saint');
ok(mt('Spain W', 'Friendlies Women').gender === 'women', 'W suffix -> women');
ok(mt('Turks and Caicos W', 'Friendlies Women').name === 'Turks and Caicos Islands', 'women alias');
ok(mt('Spain U21', 'Euro U21 - Qualification').skip === 'youth', 'U21 skipped');
ok(mt('Atlantis', 'Friendlies').unmatched === 'Atlantis', 'unknown team reported, not guessed');
const tours = {men:new Set(['Friendly', 'FIFA World Cup qualification', 'Gold Cup qualification', 'ASEAN Championship', 'SAFF Cup']),
               women:new Set(['Friendly', 'CONCACAF Gold Cup qualification', 'SAFF Championship', 'Olympic Games'])};
const tm = makeTournamentMapper(tours);
ok(tm('Friendlies', 'men').name === 'Friendly', 'Friendlies -> Friendly');
ok(tm('World Cup - Qualification Europe', 'men').name === 'FIFA World Cup qualification', 'WC qualifying');
ok(tm('CONCACAF Gold Cup - Qualification', 'men').name === 'Gold Cup qualification', 'men Gold Cup qualifying name');
ok(tm('CONCACAF Gold Cup - Qualification', 'women').name === 'CONCACAF Gold Cup qualification', 'women Gold Cup qualifying name');
ok(tm('AFF Championship', 'men').name === 'ASEAN Championship', 'uses the name the archive uses now');
ok(tm('SAFF Championship', 'men').name === 'SAFF Cup' && tm('SAFF Championship', 'women').name === 'SAFF Championship', 'per-gender names');
ok(tm('Olympics Men', 'men').skip && tm('Olympics Women', 'women').name === 'Olympic Games', 'Olympics: men skipped, women kept');
ok(tm('African Nations Championship', 'men').skip, 'CHAN not counted');
ok(tm('Some New Cup', 'men').unmapped, 'unknown competitions flagged');
ok(normKey('São Tomé & Príncipe') === normKey('Sao Tome and Principe'), 'normKey');

// --- end to end with a fake API
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'formline-'));
fs.mkdirSync(path.join(root, 'build', 'store'), {recursive:true});
const fx = (id, date, league, home, away, status, gh, ga, venue, pen) => ({
  fixture:{id, date, status:{short:status}, venue:{id:venue, name:'Stadium ' + venue, city:'City ' + venue}},
  league:{id:1, name:league, country:'World', season:2026},
  teams:{home:{id:1, name:home}, away:{id:2, name:away}},
  goals:{home:gh, away:ga}, score:{penalty:pen || {home:null, away:null}}});
const DAYS = {
  '2026-09-25': [
    fx(1, '2026-09-25T16:00:00+00:00', 'Africa Cup of Nations - Qualification', 'Gambia', 'Somalia', 'FT', 2, 1, 101),
    fx(2, '2026-09-25T18:00:00+00:00', 'Friendlies Women', 'Spain W', 'England W', 'FT', 3, 0, 102),
    fx(3, '2026-09-25T15:00:00+00:00', 'Euro U21 - Qualification', 'Spain U21', 'France U21', 'FT', 1, 0, 103),
    fx(4, '2026-09-25T19:00:00+00:00', 'Club Friendlies', 'Real Madrid', 'Liverpool', 'FT', 1, 1, 104),
    fx(5, '2026-09-25T14:00:00+00:00', 'COSAFA Cup', 'Zambia', 'Angola', 'PEN', 1, 1, 105, {home:4, away:3}),
    fx(6, '2026-09-25T20:00:00+00:00', 'Friendlies', 'Atlantis', 'Spain', 'FT', 0, 5, 106),
    {...fx(7, '2026-09-25T12:00:00+00:00', 'Premier League', 'Arsenal', 'Chelsea', 'FT', 1, 0, 107), league:{name:'Premier League', country:'England'}}
  ],
  '2026-09-19': [fx(8, '2026-09-19T19:45:00+00:00', 'UEFA Nations League - A', 'Germany', 'France', 'FT', 2, 2, 108)],
  '2026-10-09': [fx(9, '2026-10-09T23:30:00+00:00', 'World Cup - Qualification South America', 'Argentina', 'Brazil', 'NS', null, null, 109)]
};
const VENUES = {101:{country:'Gambia', city:'Banjul'}, 102:{country:'Spain', city:'Madrid'}, 105:{country:'South-Africa', city:'Durban'},
  108:{country:'France', city:'Paris'}, 109:{country:'Argentina', city:'Buenos Aires'}};
const calls = [];
globalThis.fetch = async url => {
  const u = new URL(url); calls.push(u.pathname + u.search);
  const body = u.pathname === '/fixtures' ? {errors:[], response: DAYS[u.searchParams.get('date')] || []}
    : u.pathname === '/venues' ? {errors:[], response: VENUES[u.searchParams.get('id')] ? [{id:+u.searchParams.get('id'), name:'V', ...VENUES[u.searchParams.get('id')]}] : []}
    : {errors:{endpoint:'unknown'}};
  return {ok:true, status:200, headers:{get: h => h === 'x-ratelimit-requests-remaining' ? '90' : null}, json: async () => body};
};
Object.assign(process.env, {SITE_HTML:path.join(HERE, '..', 'index.html'), FORMLINE_ROOT:root, ARCHIVE_DIR:path.join(HERE, 'test-data', 'archive'), TODAY:'2026-09-26',
  APIFOOTBALL_KEY:'test', API_GAP_MS:'0', API_BUDGET:'200'});
const {run, prune, planDates} = await import('./update.mjs');
const st = await run();
const gapM = parseCSV(fs.readFileSync(path.join(root, 'build/store/gapfill-men.csv'), 'utf8'));
const gapW = parseCSV(fs.readFileSync(path.join(root, 'build/store/gapfill-women.csv'), 'utf8'));
const gs = gapM.find(r => r.home_team === 'Gambia');
ok(gs && gs.home_score === '2' && gs.tournament === 'African Cup of Nations qualification', 'result mapped to archive names');
ok(gs.country === 'Gambia' && gs.neutral === 'FALSE', 'venue country from /venues: Gambia at home');
const za = gapM.find(r => r.home_team === 'Zambia');
ok(za && za.shootout_winner === 'Zambia' && za.country === 'South Africa' && za.neutral === 'TRUE', 'shootout winner and neutral venue');
ok(gapW.length === 1 && gapW[0].home_team === 'Spain' && gapW[0].neutral === 'FALSE', "women's result filed separately");
ok(!gapM.some(r => /U21|Real Madrid|Arsenal/.test(r.home_team)), 'youth, club and domestic matches left out');
ok(!gapM.some(r => r.home_team === 'Germany'), 'match already in the archive pruned');
ok(st.unmatched.Atlantis === 1 && !st.unmatched['Real Madrid'], 'unknown national team reported; clubs not');
const fixtures = JSON.parse(fs.readFileSync(path.join(root, 'data/fixtures.json'), 'utf8'));
ok(fixtures.men.length === 1 && fixtures.men[0].home === 'Argentina' && fixtures.men[0].country === 'Argentina' && !fixtures.men[0].neutral, 'fixture listed with venue');
const men = JSON.parse(fs.readFileSync(path.join(root, 'data/men.json'), 'utf8'));
ok(men.v === 1 && men.m.length === 6 + gapM.length && men.gapfill.rows === gapM.length, 'compact file holds archive plus gap-filler');
let day = 0; const dates = men.m.map(x => (day += x[0]));
ok(dates.every((d, i) => !i || d >= dates[i - 1]), 'compact rows in date order');
ok(men.m.filter(x => x[9] === 1).length === gapM.length, 'gap-filler rows flagged');
ok(men.so.some(x => men.s[x[3]] === 'Zambia'), 'shootout carried into the compact file');
ok(st.api.used === calls.filter(c => !c.startsWith('/status')).length && st.api.stopped == null, 'request count tracked (the free /status check not counted)');

// second run: settled backfill dates are not asked for again
const before = calls.length;
await run();
const fixtureCalls = calls.slice(before).filter(c => c.startsWith('/fixtures')).length;
const menMtime = fs.statSync(path.join(root, 'data/men.json')).mtimeMs;
ok(fixtureCalls === 18, 'second run asks only for the recent and coming days (' + fixtureCalls + ')');
ok(planDates('2026-09-26', '2026-09-20', {}).length === 18 + 3, 'plan: 18 window days plus unsettled older days');
ok(planDates('2026-09-26', '2026-09-20', {}, 'light').join() === '2026-09-25,2026-09-26,2026-09-27', 'light run: yesterday, today, tomorrow only');

// paid plan: read from /status, paced and budgeted from it, recorded in status.json
{
  const {pacing, planNotice} = await import('./update.mjs');
  const pro = {name:'Pro', end:'2027-01-24T00:00:00+00:00', active:true, limitDay:7500, usedToday:1000, perMinute:300};
  const p1 = pacing(pro, 'full', {}), p2 = pacing(pro, 'light', {}), p3 = pacing({name:'Free', limitDay:100}, 'full', {API_BUDGET:'80'});
  ok(p1.paid && p1.budget === 1500 && p1.gapMs === 400, 'paid plan: up to 1500 requests, at half the per-minute limit');
  ok(p2.budget === 60 && pacing({...pro, usedToday:3700}, 'full', {}).budget === 50, 'light runs capped at 60; never past half the daily quota');
  ok(!p3.paid && p3.budget === 80 && p3.gapMs === 6500, 'free plan keeps the old pacing');
  ok(/ends on 2027-01-24, in 3 days/.test(planNotice(pro, true, null, '2027-01-21')) && planNotice(pro, true, null, '2026-10-25') === null, 'notice a week before the paid plan ends');
  ok(/Back on the free API plan/.test(planNotice({name:'Free'}, false, {name:'Pro', paid:true, end:'2027-01-24'}, '2027-01-25')), 'notice when the plan has dropped back to free');
  const asked = [];
  globalThis.fetch = async url => { const u = new URL(url); asked.push(u.pathname);
    if (u.pathname === '/status') return {ok:true, status:200, headers:{get: h => h === 'x-ratelimit-limit' ? '300' : null},
      json: async () => ({errors:[], response:{subscription:{plan:'Pro', end:'2027-01-24T00:00:00+00:00', active:true}, requests:{current:10, limit_day:7500}}})};
    return {ok:true, status:200, headers:{get:() => null}, json: async () => ({errors:[], response: u.pathname === '/fixtures' ? (DAYS[u.searchParams.get('date')] || []) : []})}; };
  const sp = await run();
  ok(sp.api.paid && sp.api.plan.name === 'Pro' && sp.api.plan.limitDay === 7500 && sp.api.plan.perMinute === 300 && sp.api.budget === 1500, 'plan, limits and budget in status.json');
  ok(asked[0] === '/status', 'plan checked before any counted request');
  // light run with no match near: nothing asked, nothing written
  const sm = fs.statSync(path.join(root, 'data/status.json')).mtimeMs; asked.length = 0;
  process.env.RUN_MODE = 'light'; process.env.TODAY = '2026-11-20';
  const sl = await run();
  ok(sl.idle && asked.length === 0 && fs.statSync(path.join(root, 'data/status.json')).mtimeMs === sm, 'light run with no match near: no requests, no files');
  // light run with a fixture tomorrow: only three days asked
  process.env.TODAY = '2026-10-08';
  const sl2 = await run();
  ok(!sl2.idle && sl2.mode === 'light' && asked.filter(a => a === '/fixtures').length === 3 && sl2.api.budget === 60, 'light run on a match day asks about three days');
  delete process.env.RUN_MODE; process.env.TODAY = '2026-09-26';
}
ok(menMtime > 0, 'men.json written');
ok(prune([{date:'2026-09-01', home_team:'A', away_team:'B'}], [{date:'2026-09-20', home_team:'X', away_team:'Y'}]).length === 0, 'rows a week before the archive end are dropped');

// the free plan's date window: dates it refuses are skipped, not a stop, and later dates outside it cost nothing
{
  const asked = [];
  globalThis.fetch = async url => { const u = new URL(url), d = u.searchParams.get('date'); asked.push(u.pathname + (d ? ' ' + d : ''));
    const inside = !d || (d >= '2026-09-25' && d <= '2026-09-27');
    const body = !inside ? {errors:{plan:'Free plans do not have access to this date, try from 2026-09-25 to 2026-09-27.'}, response:[]}
      : u.pathname === '/fixtures' ? {errors:[], response: DAYS[d] || []} : {errors:[], response:[]};
    return {ok:true, status:200, headers:{get:() => null}, json: async () => body}; };
  const stw = await run();
  const fx = asked.filter(a => a.startsWith('/fixtures'));
  ok(fx.slice(0, 3).join() === '/fixtures 2026-09-25,/fixtures 2026-09-26,/fixtures 2026-09-27', 'yesterday, today and tomorrow asked first');
  ok(fx.length === 4 && stw.api.stopped == null && stw.api.planWindow && stw.api.planWindow.from === '2026-09-25', 'one refused date teaches the window; no stop, no wasted requests');
}
// a server error on one date is retried once, then skipped; the rest of the run carries on
{
  let n500 = 0; const asked = [];
  globalThis.fetch = async url => { const u = new URL(url), d = u.searchParams.get('date'); asked.push(d);
    if (d === '2026-09-27'){ n500++; return {ok:false, status:500, headers:{get:() => null}, json: async () => ({})}; }
    return {ok:true, status:200, headers:{get:() => null}, json: async () => ({errors:[], response: u.pathname === '/fixtures' ? (DAYS[d] || []) : []})}; };
  const st5 = await run();
  ok(n500 === 2 && st5.api.stopped == null && st5.api.failed.length === 1 && asked.filter(Boolean).length > 3, 'server error retried once, then that date skipped without stopping');
}
// API error stops the run cleanly and keeps the data written
globalThis.fetch = async () => ({ok:true, status:200, headers:{get:() => null}, json: async () => ({errors:{plan:'Free plans do not have access to this season'}, response:[]})});
const st3 = await run();
ok(/Free plans/.test(st3.api.stopped) && st3.men.archive.rows === 6, 'plan error reported in status; archive still written');

// --- forecast record
{
  const {scoreForecast, updateRecord} = await import('./lib/forecasts.mjs');
  const s1 = scoreForecast([0.5, 0.3, 0.2], 2, 1);
  ok(Math.abs(s1.ll - 0.69315) < 1e-4 && s1.hit && Math.abs(s1.brier - 0.38) < 1e-9, 'scoring: log-loss, Brier, favourite');
  const fx = {men:[{date:'2026-10-09', kickoff:'2026-10-09T19:00:00Z', home:'A', away:'B', tournament:'Friendly'}], women:[]};
  const pred = (g, list) => list.map(() => ({p:[0.6, 0.25, 0.15], xg:[1.8, 0.7], likely:'1-0', side:1, ratings:[1800, 1600], bands:[120, 140], asOf:'2026-10-01'}));
  let rec = updateRecord([], fx, pred, {men:[], women:[]}, Date.parse('2026-10-05T06:00:00Z'), 'run1');
  ok(rec.made === 1 && rec.list[0].made === 'run1' && !rec.list[0].result, 'forecast recorded before kick-off');
  const pred2 = (g, list) => list.map(() => ({p:[0.55, 0.27, 0.18], xg:[1.6, 0.8], likely:'1-0', side:1, ratings:[1790, 1610], bands:[120, 140], asOf:'2026-10-08'}));
  rec = updateRecord(rec.list, fx, pred2, {men:[], women:[]}, Date.parse('2026-10-09T06:00:00Z'), 'run2');
  ok(rec.updated === 1 && rec.list[0].p[0] === 0.55 && rec.list[0].made === 'run1', 'updated on later runs until kick-off');
  rec = updateRecord(rec.list, fx, () => [{p:[0.1, 0.1, 0.8], xg:[0, 3], likely:'0-3', side:1, ratings:[1, 2], bands:[1, 1], asOf:'x'}],
    {men:[{date:'2026-10-09', home_team:'B', away_team:'A', home_score:'0', away_score:'2'}], women:[]}, Date.parse('2026-10-10T06:00:00Z'), 'run3');
  ok(rec.list[0].p[0] === 0.55 && rec.scored === 1, 'frozen at kick-off, then scored');
  ok(rec.list[0].result.join('-') === '2-0' && rec.list[0].outcome === 0, 'result found with the teams the other way round');
  const lost = updateRecord([{id:'x', g:'men', date:'2026-09-01', kickoff:'2026-09-01T18:00:00Z', home:'C', away:'D', p:[0.4, 0.3, 0.3], result:null}],
    {men:[], women:[]}, pred, {men:[], women:[]}, Date.parse('2026-10-01T06:00:00Z'), 'r');
  ok(lost.list[0].void, 'forecast with no result after three weeks is marked void, not scored');
}
// end to end: the site's own model inside the job
{
  const root2 = fs.mkdtempSync(path.join(os.tmpdir(), 'formline-'));
  fs.mkdirSync(path.join(root2, 'build', 'store'), {recursive:true});
  fs.copyFileSync(path.join(HERE, '..', 'index.html'), path.join(root2, 'index.html'));
  globalThis.fetch = async url => { const u = new URL(url);
    const body = u.pathname === '/fixtures' ? {errors:[], response: DAYS[u.searchParams.get('date')] || []}
      : {errors:[], response: VENUES[u.searchParams.get('id')] ? [{id:1, name:'V', ...VENUES[u.searchParams.get('id')]}] : []};
    return {ok:true, status:200, headers:{get:() => '90'}, json: async () => body}; };
  Object.assign(process.env, {FORMLINE_ROOT:root2, NOW:'2026-09-26T07:00:00Z'});
  const {run: run2} = await import('./update.mjs?again');
  const s4 = await run2();
  const rec2 = JSON.parse(fs.readFileSync(path.join(root2, 'data/forecasts.json'), 'utf8'));
  const e = rec2.entries[0];
  ok(rec2.entries.length === 1 && e.home === 'Argentina' && e.p.length === 3 && Math.abs(e.p[0] + e.p[1] + e.p[2] - 1) < 1e-3, 'job records a forecast with the site model');
  ok(e.xg.length === 2 && /^\d+-\d+$/.test(e.likely) && s4.forecasts.newThisRun === 1, 'forecast carries expected goals and likeliest score');
}
// --- static team pages
{
  const {slugify, buildPages} = await import('./pages.mjs');
  ok(slugify("Côte d'Ivoire") === 'cote-d-ivoire' && slugify('Hong Kong, China') === 'hong-kong-china', 'page names made safe');
  fs.copyFileSync(path.join(HERE, '..', 'index.html'), path.join(root, 'index.html'));
  const n = buildPages(root, 'https://example.github.io/formline/');
  ok(n.men > 0 && fs.existsSync(path.join(root, 'teams', 'index.html')), 'team pages and index written');
  const any = fs.readdirSync(path.join(root, 'teams', 'men'))[0], html = fs.readFileSync(path.join(root, 'teams', 'men', any), 'utf8');
  ok(/<title>.+ men's football rating – Formline<\/title>/.test(html) && html.includes('Open the full team page'), 'team page has a title and a link to the site');
  ok(fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8').includes('https://example.github.io/formline/teams/men/'), 'sitemap lists the pages');
  ok(fs.readFileSync(path.join(root, 'robots.txt'), 'utf8').includes('Sitemap: https://example.github.io/formline/sitemap.xml'), 'robots.txt points to the sitemap');
}
// --- local copies of outside files, and saved Wikipedia images
{
  const {rewriteHtml, localiseFontCss, LIBS, FONT_CSS} = await import('./vendor.mjs');
  const page = '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link href="' + FONT_CSS + '" rel="stylesheet">\n<script src="' + LIBS[1].url + '"></script>';
  ok(rewriteHtml(page, new Set()) === page, 'page untouched while no local copies exist');
  const done = rewriteHtml(page, new Set([LIBS[1].file, 'fonts.css']));
  ok(done.includes('src="vendor/' + LIBS[1].file + '"') && done.includes('href="vendor/fonts.css"') && !done.includes('preconnect'), 'page points at local copies once they exist');
  const f = localiseFontCss('@font-face{src:url(https://fonts.gstatic.com/s/archivo/v1/a.woff2) format("woff2")}');
  ok(f.files.length === 1 && f.css.includes('url(fonts/archivo-1.woff2)'), 'font CSS rewritten to local files');
  const {fillWikiImages, fileFor} = await import('./wiki-images.mjs');
  const {loadModel} = await import('./lib/model.mjs');
  const model = loadModel(path.join(root, 'index.html'));
  for (const g of ['men', 'women']){ const p = path.join(root, 'data', g + '.json'); if (fs.existsSync(p)) model.load(g, JSON.parse(fs.readFileSync(p, 'utf8'))); }
  const asked = [];
  const fake = async (url) => { asked.push(url);
    if (url.includes('/page/summary/')) return {ok:true, json:async () => url.includes('Spain') ? {thumbnail:{source:'https://upload.wikimedia.org/x/Spain_crest.svg.png'}} : {}};
    return {ok:true, arrayBuffer:async () => new Uint8Array([137, 80, 78, 71]).buffer}; };
  const r1 = await fillWikiImages(root, model, {fetchImpl:fake, pause:0, limit:50});
  const map = JSON.parse(fs.readFileSync(path.join(root, 'badges', 'wiki.json'), 'utf8'));
  ok(r1.asked > 0 && map['Spain national football team'] && map['Spain national football team'].file === fileFor('Spain national football team') + '.png', 'Wikipedia image saved under the article title');
  ok(Object.values(map).some(e => e.file === ''), 'articles without an image remembered as empty');
  const n = asked.length; await fillWikiImages(root, model, {fetchImpl:fake, pause:0, limit:50});
  ok(asked.length - n <= Math.max(0, r1.wanted - r1.asked), 'saved and recently checked titles are not asked again');
  const {buildIndex} = await import('./badges.mjs');
  ok(buildIndex(path.join(root, 'badges')).wiki['Spain national football team'], 'badge index lists the saved Wikipedia images');
}
console.log('\n' + passed + ' checks passed');
