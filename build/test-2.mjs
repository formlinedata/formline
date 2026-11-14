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
/* The workflow sets RUN_MODE for the whole job; the tests set it themselves where they need it. Without this, every
   hourly (light) run failed here before building anything. */
delete process.env.RUN_MODE; delete process.env.TODAY;
let passed = 0;
const ok = (cond, label) => { assert.ok(cond, label); passed++; console.log('  ok  ' + label); };

// --- unit: Wikipedia venues
{
  const W = await import('./lib/wikivenues.mjs');
  const text = "==2026==\n{{Football box collapsible\n|date={{Start date|2026|11|14}}\n|time=19:30 SGT\n|team1={{fb-rt|JPN}}\n|score=\n|team2={{fb|BRA}}\n" +
    "|stadium=[[National Stadium, Singapore|National Stadium]]\n|location=[[Kallang]], [[Singapore]]<ref>{{cite web|url=x}}</ref>\n|result=}}\n" +
    "{{footballbox collapsible|date=17 November 2026|team1=[[Japan national football team|Japan]] {{flagicon|JPN}}|team2={{fb|PAR}}|stadium=[[Toyota Stadium]]|location=[[Toyota, Aichi|Toyota]]}}";
  const M = W.pageMatches(text);
  ok(M.length === 2, 'Wikipedia: two match boxes read');
  ok(M[0].date === '2026-11-14' && M[0].t1 === 'JPN' && M[0].t2 === 'BRA', 'Wikipedia: date and codes from templates');
  ok(M[0].city === 'Kallang' && M[0].country === 'Singapore' && M[0].stadium === 'National Stadium', 'Wikipedia: stadium, city and country, references dropped');
  ok(M[1].date === '2026-11-17' && M[1].t1 === 'JPN' && M[1].country === '', 'Wikipedia: plain date, team from a link, no country');
  ok(W.findMatch(M, {date:'2026-11-13', home_team:'Brazil', away_team:'Japan'}) === M[0], 'Wikipedia: a fixture matched within a day, either way round');
  const mv = W.findMatch(M, {date:'2026-11-09', home_team:'Japan', away_team:'Brazil'});
  ok(mv && mv.moved && mv.date === '2026-11-14', 'Wikipedia: a placeholder date in the API found within a week, same home side');
  ok(W.findMatch(M, {date:'2026-11-09', home_team:'Brazil', away_team:'Japan'}) === null, 'Wikipedia: a moved date needs the same home side (never the other leg)');
  ok(W.findMatch(M, {date:'2026-11-22', home_team:'Japan', away_team:'Brazil'}) === null, 'Wikipedia: not more than a week out');
  const cities = new Map([['toyota', 'Japan'], ['kallang', 'Singapore']]), ck = c => String(c).toLowerCase();
  ok(W.boxCountry(M[1], cities, ck, x => x) === 'Japan', 'Wikipedia: a city alone is looked up in the archive');
  ok(W.titleRe('United States', false).test("United States men's national soccer team results (2020–present)"), 'Wikipedia: US article title');
  ok(W.titleRe('Japan', true).test("Japan women's national football team results") && !W.titleRe('Japan', false).test("Japan women's national football team results"), 'Wikipedia: men and women kept apart');
  // the lookup end to end, with a fake Wikipedia
  const calls = [];
  const fake = async url => { calls.push(url); const q = new URL(url).searchParams;
    const EXIST = new Set(['Japan national football team', 'Chinese Taipei national football team', 'Kyrgyzstan national football team', 'Brazil national football team',
      'Japan national football team results (2020–present)', 'Japan national football team results (2010–2019)', 'Chinese Taipei national football team results']);
    const asked = (q.get('titles') || '').split('|').filter(Boolean);
    const redirects = asked.filter(t => /^Taiwan/.test(t)).map(t => ({from:t, to:t.replace(/^Taiwan/, 'Chinese Taipei')}));
    const body = q.get('titles') ? {query:{redirects, pages:asked.map(t => t.replace(/^Taiwan/, 'Chinese Taipei')).map(t => EXIST.has(t) ? {title:t} : {title:t, missing:true})}}
      : q.get('list') === 'search' ? {query:{search:(q.get('srsearch').startsWith('Chinese Taipei') ? [{title:'Chinese Taipei national football team results'}] : [])
          .concat([{title:'Japan national football team results (2010–2019)'}, {title:'Japan national football team results (2020–present)'}])}}
      : {parse:{wikitext:text.replace('{{fb|BRA}}', '{{fb|BRA}}') + (q.get('page').startsWith('Chinese Taipei') ? "{{Football box collapsible|date={{Start date|2026|11|13}}|team1={{fb-rt|TPE}}|team2={{fb|KGZ}}|stadium=Taipei Stadium|location=[[Taipei]], [[Taiwan]]}}" : '')}};
    return {ok:true, json: async () => body}; };
  const fx = [{api_id:1, gender:'men', date:'2026-11-14', home_team:'Japan', away_team:'Brazil'}];
  const cache = {};
  const R = await W.wikiVenues(fx, cache, {fetchImpl:fake, today:'2026-11-01', cities, cityKey:ck, toArchive:x => x});
  ok(R.found.get('1') && R.found.get('1').country === 'Singapore', 'Wikipedia: Japan v Brazil found in Singapore');
  ok(cache.titles['men|Japan'].title === 'Japan national football team results (2020–present)', 'Wikipedia: the article running to the present is chosen');
  const n = calls.length; await W.wikiVenues(fx, cache, {fetchImpl:fake, today:'2026-11-01', cities, cityKey:ck, toArchive:x => x});
  ok(calls.length === n + 2 || calls.length === n, 'Wikipedia: cached titles not searched again');
  { /* A placeholder box (no stadium, no time) never moves a fixture's date; one with a stadium does. */
    const box = st => "{{Football box collapsible|date={{Start date|2026|11|11}}|team1={{fb-rt|JPN}}|score=|team2={{fb|BRA}}|stadium=" + st + "|location=TBD, [[Japan]]}}";
    const fxT = {date:'2026-11-13', home_team:'Japan', away_team:'Brazil'};
    const mT = W.findMatch(W.pageMatches(box('TBD')), fxT);
    ok(mT && mT.moved && mT.stadium === '' && mT.city === '' && mT.country === 'Japan' && !mT.kickoff, 'Wikipedia: a TBD box is still matched to the fixture, TBD read as nothing');
    const cacheOf = st => ({titlesV:2, titles:{'men|Japan':{title:'J', checked:'2026-11-01'}, 'men|Brazil':{title:'', checked:'2026-11-01'}},
      pages:{J:{fetched:'2026-11-01', matches:W.pageMatches(box(st))}}, comps:{}});
    const run = async st => (await W.wikiVenues([{api_id:3, gender:'men', ...fxT}], cacheOf(st), {fetchImpl:null, today:'2026-11-01', cities, cityKey:ck, toArchive:x => x})).found.get('3');
    const t3 = await run('TBD'), t4 = await run('[[Saitama Stadium 2002]]');
    ok(!t3 || !t3.date, 'Wikipedia: a box with no stadium and no time does not move the date');
    ok(t4 && t4.date === '2026-11-11', 'Wikipedia: a box with a stadium still moves the date');
  }
  { /* Two articles disagree about the day: the one on the API's day wins (Iceland v Luxembourg, November 2026). */
    const bx = (d, time) => ({date:d, t1:'JPN', t2:'BRA', stadium:'Saitama Stadium 2002', city:'Saitama', country:'Japan', kickoff:time ? d + 'T10:00:00+00:00' : null});
    const cacheOf = (j, b) => ({titlesV:2, titles:{'men|Japan':{title:'J', checked:'2026-11-01'}, 'men|Brazil':{title:b ? 'B' : '', checked:'2026-11-01'}},
      pages:{J:{fetched:'2026-11-01', matches:[j]}, ...(b ? {B:{fetched:'2026-11-01', matches:[b]}} : {})}, comps:{}});
    const run = async (j, b) => (await W.wikiVenues([{api_id:4, gender:'men', date:'2026-11-16', home_team:'Japan', away_team:'Brazil'}], cacheOf(j, b), {fetchImpl:null, today:'2026-11-01', cities, cityKey:ck, toArchive:x => x})).found.get('4');
    const two = await run(bx('2026-11-15', true), bx('2026-11-16', true)), one = await run(bx('2026-11-15', true), null), far = await run(bx('2026-11-12', true), bx('2026-11-16', false));
    ok(two && two.boxDate === '2026-11-16' && two.kickoff === '2026-11-16T10:00:00+00:00', 'Wikipedia: two articles a day apart, the one on the API\'s day is used');
    ok(one && one.boxDate === '2026-11-15', 'Wikipedia: a lone article a day off still corrects the kick-off');
    ok(far && !far.date && far.boxDate === '2026-11-16', 'Wikipedia: a moved date in one article gives way to a filled-in box on the API\'s day in another');
  }
  const fxm = [{api_id:2, gender:'men', date:'2026-11-09', home_team:'Japan', away_team:'Brazil'}];
  const Rm = await W.wikiVenues(fxm, cache, {fetchImpl:fake, today:'2026-11-01', cities, cityKey:ck, toArchive:x => x});
  ok(Rm.found.get('2') && Rm.found.get('2').date === '2026-11-14' && Rm.found.get('2').country === 'Singapore' && Rm.stats.moved === 1, 'Wikipedia: the real date passed on for a fixture the API lists on the wrong day');
  const R2 = await W.wikiVenues(fx, {}, {fetchImpl: async () => { throw new Error('offline'); }, today:'2026-11-01', cities, cityKey:ck, toArchive:x => x});
  ok(R2.found.size === 0 && R2.stats.errors > 0, 'Wikipedia: offline means no venues, not a failure');
  const fx3 = [{api_id:3, gender:'men', date:'2026-11-13', home_team:'Taiwan', away_team:'Kyrgyzstan'}], c3 = {};
  const R3 = await W.wikiVenues(fx3, c3, {fetchImpl:fake, today:'2026-11-01', cities, cityKey:ck, toArchive:x => x});
  ok(c3.titles['men|Taiwan'].title === 'Chinese Taipei national football team results' && R3.found.get('3') && R3.found.get('3').country === 'Taiwan',
    'Wikipedia: Taiwan found under its Wikipedia name, Chinese Taipei');
  // the competition's own season article: Curaçao v Panama, listed in the API on a placeholder date
  ok(W.boxKickoff('2026-11-14', '{{UTZ|20:00|-5}}') === '2026-11-15T01:00:00+00:00' && W.boxKickoff('2026-11-15', '18:00') === null, 'Wikipedia: kick-off from a time with its UTC offset only');
  const odd = W.pageMatches("{{Football box |date={{Start date|2026|11|13}} |team1={{fb-rt|MSR}} |team2={{fb|NCA}} |stadium=[[Estadio Cibao FC]], [[Santiago de los Caballeros|Santiago]], Dominican Republic }}" +
    "{{Football box |date={{Start date|2026|11|17}} |team1={{fb-rt|BLZ}} |team2={{fb|SMA}} |stadium=[[Arnos Vale Stadium]], [[Kingstown]] (Saint Vincent and the Grenadines) }}" +
    "{{Football box |date={{Start date|2026|11|14}} |team1={{fb-rt|HAI}} |team2={{fb|USA}} |stadium=[[Nu Stadium]], [[Miami]], (United States){{refn|group=note|Haiti played at home in Miami}} }}");
  ok(odd[0].city === 'Santiago' && odd[0].country === 'Dominican Republic' && odd[1].city === 'Kingstown' && odd[1].country === 'Saint Vincent and the Grenadines'
    && odd[2].city === 'Miami' && odd[2].country === 'United States' && odd[2].stadium === 'Nu Stadium', 'Wikipedia: a country after the city, or in brackets, read from the stadium field');
  ok(W.boxTeam('Mexico {{#invoke:flag|deco|MEX}}') === 'MEX' && W.boxTeam('{{#invoke:flag|deco|JAM}}') === 'JAM', 'Wikipedia: teams written with flag modules');
  ok(W.compTitles(['2026–27 CONCACAF Nations League A', '2026–27 CONCACAF Nations League B', "2026–27 CONCACAF W Championship", '2024–25 CONCACAF Nations League A', 'CONCACAF Nations League'],
    'CONCACAF Nations League', 2026, false).join() === '2026–27 CONCACAF Nations League A,2026–27 CONCACAF Nations League B', 'Wikipedia: season articles of the competition picked from a search');
  ok(W.compTitles(['2027 Africa Cup of Nations qualification', '2027 Africa Cup of Nations', '2026 Futsal Africa Cup of Nations qualification', '2026 U-17 Africa Cup of Nations qualification', '2025 Africa Cup of Nations qualification'], 'African Cup of Nations qualification', 2026, false).join() === '2027 Africa Cup of Nations qualification'
    && W.compTitles(['2026–27 CONCACAF Nations League', '2026–27 CONCACAF Nations League A', '2026–27 CONCACAF Nations League B', '2026–27 CONCACAF Nations League C', 'CONCACAF Nations League', '2026–27 CONCACAF Nations League Play-in'], 'CONCACAF Nations League', 2026, false).length === 5
    && W.compTitles(["2027 FIFA Women's World Cup qualification (UEFA)", '2026 FIFA World Cup qualification (UEFA)'], 'FIFA World Cup qualification', 2026, true).join() === "2027 FIFA Women's World Cup qualification (UEFA)"
    && W.compTitles(['2026 Friendly'], 'Friendly', 2026, false).length === 0, "Wikipedia: next year's qualifying, loose spellings (African/Africa), the play-in article, women's articles; no youth or futsal; none for friendlies");
  const compText = "===Quarter-finals===\n{{Football box collapsible |id=Curaçao v Panama |date={{Start date|2026|11|12|df=y}} |time=19:00 ({{UTZ|20:00|-4}}) |team1={{fb-rt|CUW}} |score=Match 69 |team2={{fb|PAN}} |stadium=[[Ergilio Hato Stadium]], [[Willemstad]] }}\n" +
    "{{Football box collapsible |id=Panama v Curaçao |date={{Start date|2026|11|15|df=y}} |time=18:00 |team1={{fb-rt|PAN}} |score=Match 86 |team2={{fb|CUW}} |stadium=[[Estadio Rommel Fernández]], [[Panama City]] }}\n" +
    "{{Football box collapsible |date={{Start date|2026|11|12|df=y}} |time=14:00 ({{UTZ|15:00|-4}}) |team1={{fb-rt|ARU}} |score=Match 99 |team2={{fb|MTQ}} |stadium=[[Trinidad Stadium]], [[Oranjestad]] }}\n" +
    "{{Football box collapsible |date={{Start date|2026|11|16|df=y}} |time=19:00 |team1={{fb-rt|MTQ}} |score=Match 100 |team2={{fb|ARU}} |stadium=[[Stade Pierre-Aliker]], [[Fort-de-France]] }}\n" +
    "{{Football box collapsible |date={{Start date|2026|11|13|df=y}} |time=19:00 |team1=Winner Match 70 |score= |team2={{fb|PAN}} |stadium=[[Somewhere]] }}";
  const fakeC = async url => { const q = new URL(url).searchParams;
    const body = q.get('titles') ? {query:{pages:[{missing:true}]}}
      : q.get('list') === 'search' ? {query:{search: /Nations League/.test(q.get('srsearch')) ? [{title:'2026–27 CONCACAF Nations League A'}, {title:'2024–25 CONCACAF Nations League A'}] : []}}
      : {parse:{wikitext: q.get('page') === '2026–27 CONCACAF Nations League A' ? compText : ''}};
    return {ok:true, json: async () => body}; };
  const fxc = [{api_id:7, gender:'men', date:'2026-11-09', home_team:'Curaçao', away_team:'Panama', tournament:'CONCACAF Nations League'},
               {api_id:8, gender:'men', date:'2026-11-17', home_team:'Panama', away_team:'Curaçao', tournament:'CONCACAF Nations League'}];
  const Rc = await W.wikiVenues(fxc, {}, {fetchImpl:fakeC, today:'2026-11-01', cities:new Map([['willemstad', 'Curaçao'], ['panama city', 'Panama'], ['oranjestad', 'Aruba'], ['fort-de-france', 'Martinique']]),
    cityKey:ck, toArchive:x => x, teams:{men:new Set(['Curaçao', 'Panama', 'Aruba', 'Martinique']), women:new Set()}});
  const c7 = Rc.found.get('7'), c8 = Rc.found.get('8');
  ok(c7 && c7.date === '2026-11-12' && c7.kickoff === '2026-11-13T00:00:00+00:00' && c7.country === 'Curaçao' && c7.stadium === 'Ergilio Hato Stadium', 'Wikipedia: first leg moved to its real date and kick-off from the competition article');
  ok(c8 && c8.date === '2026-11-15' && !c8.kickoff && c8.country === 'Panama', 'Wikipedia: second leg moved too, its time left unconfirmed');
  ok(c7.boxDate === '2026-11-12', 'Wikipedia: the box date passed on with every match found');
  const Rk = await W.wikiVenues([], {}, {fetchImpl:fakeC, today:'2026-11-01', cities:new Map([['willemstad', 'Curaçao']]), cityKey:ck, toArchive:x => x, all:[fxc[0]]});
  ok(Rk.found.get('7') && Rk.found.get('7').kickoff === '2026-11-13T00:00:00+00:00', 'Wikipedia: fixtures that already have a venue are still checked for date and kick-off');
  const ex = Rc.extra;
  ok(ex.length === 2 && ex[0].home_team === 'Aruba' && ex[0].away_team === 'Martinique' && ex[0].date === '2026-11-12' && ex[0].kickoff === '2026-11-12T19:00:00+00:00' && ex[0].country === 'Aruba'
    && ex[0].tournament === 'CONCACAF Nations League' && ex[1].home_team === 'Martinique' && ex[1].country === 'Martinique',
    'Wikipedia: matches the API lacks (both legs of Aruba v Martinique) added; ones the API has, and unknown teams, left out');
  ok(W.boxCountry({city:'Harrison', country:'New Jersey'}, new Map([['harrison', 'United States']]), ck, x => x, new Set(['United States'])) === 'United States', 'Wikipedia: a US state is not taken for a country');
  ok(W.boxCountry({city:'Kinshasa', country:'Democratic Republic of the Congo'}, new Map(), ck, x => x, new Set(['DR Congo'])) === 'DR Congo', 'Wikipedia: country spellings mapped to the archive');
  ok(W.baseName("United States men's national soccer team") === 'United States' && W.baseName("Japan women's national football team") === 'Japan', 'Wikipedia: team name from an article title');
}

// --- unit: women's results from Wikipedia (lib/wikiresults.mjs)
{
  const R = await import('./lib/wikiresults.mjs');
  const box = (d, t1, sc, t2, g1 = '', g2 = '', loc = '[[Libreville]], Gabon', round = 'Friendly') =>
    '{{Football box collapsible|round=' + round + '|date={{Start date|' + d.replace(/-/g, '|') + '}}|team1={{fbw-rt|' + t1 + '}}|score=' + sc + '|team2={{fbw|' + t2 + '}}|goals1=' + g1 + '|goals2=' + g2 + '|location=' + loc + '}}';
  const gab = box('2026-11-07', 'GAB', '3–6', 'CGO', '{{goal|10|20|30}}', '{{goal|5|15|25|35|45|55}}') + box('2026-11-10', 'GAB', 'v', 'CHA');
  const cgo = box('2026-11-07', 'GAB', '3–6', 'CGO') + box('2026-11-04', 'CGO', '4–1', 'STP') + box('2026-10-26', 'CGO', '0–0', 'TUN', '', '{{goal|14}} [[A]]');
  const cta = box('2026-11-07', 'CTA', '9–0', 'STP');
  ok(R.pageResults(gab, '2026-09-01', '2026-11-08').length === 1 && R.pageResults(gab, '2026-09-01', '2026-11-08')[0].hs === 3, 'Wikipedia results: a played match read, a fixture ("v") left out');
  ok(R.pageResults(cgo, '2026-09-01', '2026-11-08').length === 2, 'Wikipedia results: a score its own scorer list contradicts (0–0 with a goal listed) left out');
  ok(R.boxScore('{{score link|Gabon v Congo|3–6}}').join() === '3,6' && R.boxScore('0–0 (awd.)') === null && R.boxScore('w/o') === null, 'Wikipedia results: scores in templates read; awarded matches and walkovers not');
  ok(R.goalsAgree('{{goal|14}} [[A]]<br>{{goal|16}} [[B]]', '', 2, 0) && !R.goalsAgree('', '{{goal|14}} [[A]]', 0, 0) && R.goalsAgree('', '', 3, 1)
    && R.goalsAgree('{{goal|16}}{{goal|42}}', '', 0, 2), 'Wikipedia results: scorer lists checked against the score (both sides together)');
  ok(R.tournamentFor('Football at the 2026 Asian Games Group F', 'women', null, new Set(['Asian Games'])) === 'Asian Games'
    && R.tournamentFor('2026 Friendly', 'women') === 'Friendly' && R.tournamentFor('2026 AFC U-20 Women\'s Asian Cup', 'women') === null,
    'Wikipedia results: competitions filed under the archive\'s names; youth ones skipped');
  const pages = {"Gabon women's national football team":gab, "Congo women's national football team":cgo, "Central African Republic women's national football team":cta};
  let asked = 0;
  const fake = async url => { asked++; const q = new URL(url).searchParams;
    return {ok:true, json:async () => ({parse:{wikitext:pages[q.get('page')] || ''}})}; };
  const teamsW = new Set(['Gabon', 'Congo', 'Central African Republic', 'São Tomé and Príncipe', 'Chad', 'Tunisia']);
  const cache = {titles:{}};
  for (const t of ['Gabon', 'Congo', 'Central African Republic']) cache.titles['women|' + t] = {title:'', name:t, main:t + " women's national football team", checked:'2026-11-08'};
  const known = [{date:'2025-06-01', home_team:'Gabon', away_team:'Congo'}, {date:'2025-06-01', home_team:'Central African Republic', away_team:'Chad'},
    {date:'2026-11-04', home_team:'Congo', away_team:'São Tomé and Príncipe'}];
  const r1 = await R.wikiResults({g:'women', known, teams:teamsW, cache, fetchImpl:fake, today:'2026-11-08', toArchive:x => x});
  ok(r1.rows.length === 1 && r1.rows[0].home_team === 'Gabon' && r1.rows[0].away_score === 6 && r1.rows[0].tournament === 'Friendly' && r1.rows[0].country === 'Gabon' && r1.rows[0].neutral === 'FALSE',
    'Wikipedia results: a match on two teams\' pages added (Gabon 3–6 Congo); one already held left out');
  ok(r1.stats.unconfirmed === 1, 'Wikipedia results: a match on one page only waits');
  const r2 = await R.wikiResults({g:'women', known:known.concat(r1.rows), teams:teamsW, cache, fetchImpl:fake, today:'2026-11-10', toArchive:x => x});
  ok(r2.rows.length === 1 && r2.rows[0].home_team === 'Central African Republic' && r2.rows[0].neutral === 'TRUE', 'Wikipedia results: a one-page match added once it has stayed up two days');
  const r3 = await R.wikiResults({g:'women', known, teams:teamsW, cache:{}, fetchImpl: async () => { throw new Error('offline'); }, today:'2026-11-08', toArchive:x => x});
  ok(r3.rows.length === 0 && r3.stats.errors > 0, 'Wikipedia results: offline means nothing added, not a failure');
}

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
ok(mt('Rep. Of Ireland', 'Friendlies').name === 'Republic of Ireland', 'aliases ignore letter case');
ok(mt('Spain W', 'Friendlies Women').name === 'Spain' && makeTeamMatcher({men:new Set(['San Marino']), women:new Set(['Spain'])})('San Marino W', 'Friendlies Women').name === 'San Marino',
   'a national team new to one archive is taken from the other');
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
const cov = (ev, st) => ({fixtures:{events:ev, lineups:ev, statistics_fixtures:false}, standings:st, odds:false});
const LEAGUES = [
  {league:{id:39, name:'Premier League', type:'League'}, country:{name:'England', code:'GB'},
    seasons:[{year:2011, current:false, coverage:cov(false, true)}, {year:2010, current:false, coverage:cov(true, true)}, {year:2026, current:true, coverage:cov(true, true)}]},
  {league:{id:44, name:"FA WSL", type:'League'}, country:{name:'England', code:'GB'}, seasons:[{year:2026, current:true, coverage:cov(true, true)}]},
  {league:{id:254, name:"NWSL Women", type:'League'}, country:{name:'USA', code:'US'}, seasons:[{year:2026, current:true, coverage:cov(false, true)}]},
  {league:{id:2, name:'UEFA Champions League', type:'Cup'}, country:{name:'World', code:null}, seasons:[{year:2026, current:true, coverage:cov(true, false)}]},
  {league:{id:15, name:'FIFA Club World Cup', type:'Cup'}, country:{name:'World', code:null}, seasons:[{year:2025, current:false, coverage:cov(true, false)}]},
  {league:{id:5, name:'UEFA Nations League', type:'Cup'}, country:{name:'World', code:null}, seasons:[{year:2026, current:true, coverage:cov(true, true)}]},
  {league:{id:10, name:'Friendlies', type:'Cup'}, country:{name:'World', code:null}, seasons:[{year:2026, current:true, coverage:cov(false, false)}]},
  {league:{id:667, name:'Friendlies Clubs', type:'Cup'}, country:{name:'World', code:null}, seasons:[{year:2026, current:true, coverage:cov(false, false)}]}
];
const calls = [];
globalThis.fetch = async url => {
  const u = new URL(url); calls.push(u.pathname + u.search);
  const body = u.pathname === '/fixtures' ? {errors:[], response: DAYS[u.searchParams.get('date')] || []}
    : u.pathname === '/venues' ? {errors:[], response: VENUES[u.searchParams.get('id')] ? [{id:+u.searchParams.get('id'), name:'V', ...VENUES[u.searchParams.get('id')]}] : []}
    : u.pathname === '/leagues' ? {errors:[], response: LEAGUES}
    : {errors:{endpoint:'unknown'}};
  return {ok:true, status:200, headers:{get: h => h === 'x-ratelimit-requests-remaining' ? '90' : null}, json: async () => body};
};
Object.assign(process.env, {SITE_HTML:path.join(HERE, '..', 'index.html'), FORMLINE_ROOT:root, ARCHIVE_DIR:path.join(HERE, 'test-data', 'archive'), TODAY:'2026-09-26',
  APIFOOTBALL_KEY:'test', API_GAP_MS:'0', API_BUDGET:'200'});
fs.writeFileSync(path.join(root, 'build', 'store', 'manual-women.csv'), 'date,home_team,away_team,home_score,away_score,tournament,city,country,neutral,shootout_winner,source\n'+
  '2024-03-06,Canada,United States,2,2,CONCACAF Gold Cup,San Diego,United States,FALSE,United States,wiki\n'+
  '2026-08-31,England,Spain,1,2,Friendly,Madrid,Spain,FALSE,,wiki\n');
fs.writeFileSync(path.join(root, 'build', 'store', 'wikifill-women.csv'), 'date,home_team,away_team,home_score,away_score,tournament,city,country,neutral,shootout_winner,source,found\n'+
  '2026-08-20,Spain,Portugal,4,0,Friendly,Madrid,Spain,FALSE,,https://en.wikipedia.org/wiki/x,2026-08-22\n'+
  '2026-08-29,England,Spain,2,1,Friendly,London,England,FALSE,,https://en.wikipedia.org/wiki/x,2026-08-31\n');
const {run, prune, planDates} = await import('./update.mjs');
const st = await run();
{
  const W = JSON.parse(fs.readFileSync(path.join(root, 'data/women.json'), 'utf8'));
  const man = W.m.filter(x => x[9] === 2);
  ok(man.length === 1 && W.s[man[0][1]] === 'Canada' && W.manual && W.manual.rows === 1, 'hand-added result in the compact file, flagged; one already in the archive skipped');
  ok(W.so.some(x => W.s[x[3]] === 'United States' && W.s[x[1]] === 'Canada'), 'hand-added shoot-out carried into the compact file');
  const wk = W.m.filter(x => x[9] === 3);
  ok(wk.length === 1 && W.s[wk[0][2]] === 'Portugal' && W.wiki && W.wiki.rows === 1, 'Wikipedia-found result in the compact file, flagged; one the archive now has dropped');
  const wf = parseCSV(fs.readFileSync(path.join(root, 'build/store/wikifill-women.csv'), 'utf8'));
  ok(wf.length === 1 && wf[0].away_team === 'Portugal' && wf[0].source, 'Wikipedia-found results kept in the store with their source');
}
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
ok(st.api.used === calls.filter(c => !c.startsWith('/status') && !c.startsWith('/w/api.php')).length && st.api.stopped == null, 'request count tracked (the free /status check not counted)');

// club football groundwork: what API-Football covers, summarised once a week
{
  const C = JSON.parse(fs.readFileSync(path.join(root, 'build/store/clubs/coverage.json'), 'utf8')).leagues;
  const names = C.map(l => l.name);
  ok(names.join() === 'FA WSL,Premier League,NWSL Women,FIFA Club World Cup,Friendlies Clubs,UEFA Champions League', 'club survey: club competitions kept, national-team ones left out (' + names.join(', ') + ')');
  const pl = C.find(l => l.id === 39);
  ok(pl.first === 2010 && pl.last === 2026 && pl.current === 2026 && pl.seasons[0][0] === 2010 && pl.seasons[0][1] === 7 && pl.seasons[1][1] === 4, 'club survey: seasons in order with what each covers');
  ok(C.filter(l => l.women).map(l => l.name).join() === 'FA WSL,NWSL Women', "club survey: women's competitions marked");
  ok(st.clubs && st.clubs.competitions === 6 && st.clubs.women === 2 && st.clubs.earliest === 2010 && st.clubs.checked === '2026-09-26', 'club survey: headline in status.json');
  ok(calls.filter(c => c.startsWith('/leagues')).length === 1, 'club survey: one request');
}

// second run: settled backfill dates are not asked for again
const before = calls.length;
await run();
ok(calls.slice(before).filter(c => c.startsWith('/leagues')).length === 0, 'club survey: not asked again within a week');
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
{
  const {placeRow, cityCountries} = await import('./update.mjs');
  const cc = cityCountries([{city:'Monterrey', country:'Mexico'}, {city:'Monterrey', country:'Mexico'}, {city:'Auckland', country:'New Zealand'}]);
  const r1 = placeRow({home_team:'Panama', away_team:'Jamaica', tournament:'Friendly', city:'Monterrey', date:'2026-11-12'}, {}, cc);
  ok(r1.country === 'Mexico' && r1.neutral === 'TRUE' && r1.venue_src === 'city', 'a known city gives the country: neutral when neither side is from there');
  const r2 = placeRow({home_team:'Mexico', away_team:'Spain', tournament:'FIFA World Cup', city:'', date:'2026-06-20'}, {}, cc);
  ok(r2.neutral === 'FALSE' && r2.country === 'Mexico' && r2.venue_src === 'event', 'a host at its own finals keeps home advantage');
  const r3 = placeRow({home_team:'Brazil', away_team:'Spain', tournament:'FIFA World Cup', city:'', date:'2026-06-20'}, {}, cc);
  ok(r3.neutral === 'TRUE' && r3.venue_src === 'event', 'other matches at a finals tournament are neutral');
  const r4 = placeRow({home_team:'Curaçao', away_team:'Panama', tournament:'CONCACAF Nations League', city:'', date:'2026-11-09'}, {}, cc);
  ok(r4.neutral === 'FALSE' && r4.country === 'Curaçao' && r4.venue_src === 'assumed', 'otherwise the first-named team is assumed at home, and marked so');
  const r5 = placeRow({home_team:'Curaçao', away_team:'Panama', tournament:'Friendly', city:'', venue_id:7, date:'2026-11-09'}, {7:{country:'Panama', city:'Panama City'}}, cc);
  ok(r5.neutral === 'FALSE' && r5.country === 'Panama' && r5.venue_src === 'api', 'the venue\'s own country wins when the API gives one');
}
{
  const {mapFixture} = await import('./lib/apifootball.mjs');
  const {TEAM_ALIASES} = await import('./lib/names.mjs');
  ok(TEAM_ALIASES['Bosnia-Herzegovina'] === 'Bosnia and Herzegovina' && TEAM_ALIASES['Central Africa'] === 'Central African Republic' && TEAM_ALIASES['French Guyana'] === 'French Guiana', 'API spellings seen on 25 Oct mapped');
  const mt = n => n === 'Liechtenstein' ? {name:n, gender:'men'} : {unmatched:n, gender:'men'};
  const club = mapFixture({league:{name:'Friendlies', country:'World'}, teams:{home:{name:'Liechtenstein'}, away:{name:'SC Freiburg'}}, fixture:{status:{short:'FT'}}, goals:{home:0, away:3}}, mt, () => ({name:'Friendly'}));
  ok(club.skip === 'clubs', 'a club in a national-team friendly is a club match, not an unknown team');
  const mt2 = n => n === 'Canada' ? {name:n, gender:'men'} : {unmatched:n, gender:'men'};
  const ph = mapFixture({league:{name:'Friendlies', country:'World'}, teams:{home:{name:'Canada'}, away:{name:'Winner Play-off 2'}},
    fixture:{id:77, date:'2026-12-01T00:00:00+00:00', status:{short:'TBD'}, venue:{}}, goals:{home:null, away:null}}, mt2, () => ({name:'Friendly'}));
  ok(ph.kind === 'fixture' && ph.row.away_team === 'To be decided' && ph.row.tbd === 1 && ph.row.tbc === 1, 'a fixture with its opponent and time still to come is kept, marked plainly');
  ok(planDates('2026-09-26', '2026-09-26', {}, 'full', 60).length === 3 + 2 + 59, 'paid plan looks 60 days ahead');
}
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
  // a fixture whose date moves before kick-off: the old forecast goes, the new date gets its own
  const fxA = {men:[{date:'2026-11-09', kickoff:'2026-11-09T21:00:00+00:00', home:'Jamaica', away:'Mexico', tournament:'CONCACAF Nations League'}], women:[]};
  let mvd = updateRecord([], fxA, pred, {men:[], women:[]}, Date.parse('2026-10-31T06:00:00Z'), 'r1');
  const fxB = {men:[{date:'2026-11-14', kickoff:'2026-11-14T12:00:00+00:00', home:'Jamaica', away:'Mexico', tournament:'CONCACAF Nations League'}], women:[]};
  mvd = updateRecord(mvd.list, fxB, pred, {men:[], women:[]}, Date.parse('2026-11-01T06:00:00Z'), 'r2');
  ok(mvd.dropped === 1 && mvd.made === 1 && mvd.list.length === 1 && mvd.list[0].date === '2026-11-14', 'moved fixture: stale forecast dropped, new date forecast');
  const kept = updateRecord(mvd.list, {men:[], women:[]}, pred, {men:[], women:[]}, Date.parse('2026-11-02T06:00:00Z'), 'r3');
  ok(kept.dropped === 0 && kept.list.length === 1, 'an empty fixture list never wipes open forecasts');
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
  ok(e.xg.length === 2 && /^\d+-\d+$/.test(e.likely) && s4.forecasts.newThisRun === 1, 'forecast carries expected goals and a predicted score');
}
// the predicted score agrees with the pick (12 Nov 2026: 1-1 used to sit beside a 44% favourite)
{
  const {loadModel} = await import('./lib/model.mjs');
  const m = loadModel(path.join(HERE, '..', 'index.html'));
  const r = m.run(`(() => { let n = 0, bad = 0, was = 0;
    for (const g of ['men', 'women']) for (let e = 0.04; e < 0.965; e += 0.005){
      const sl = scorelines(e, g), p = [sl.probs.home, sl.probs.draw, sl.probs.away], top = p.indexOf(Math.max(...p));
      const sign = x => x[0] > x[1] ? 0 : x[0] === x[1] ? 1 : 2;
      n++; if (sign(sl.pick) !== top) bad++; if (sign(sl.top[0]) !== top) was++; }
    return {n, bad, was, a:scoreWord([0.26, 0.30, 0.44], '1-1'), b:scoreWord([0.26, 0.30, 0.44], '0-1'), c:scoreWord([0.3, 0.4, 0.3], '1–1')}; })()`);
  ok(r.n > 300 && r.bad === 0 && r.was > 0, 'predicted score always agrees with the pick, where the single likeliest score often did not');
  ok(r.a === 'likeliest single score' && r.b === 'predicted score' && r.c === 'predicted score', 'an old stored score that disagrees with the pick is named for what it was');
}
// --- the published folder (build/site.mjs): only what a browser needs, plus the ratings files
{
  const {buildSite, isSiteFile} = await import('./site.mjs');
  const src = fs.mkdtempSync(path.join(os.tmpdir(), 'formline-src-')), out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'formline-site-')), '_site');
  const put = (f, t) => { fs.mkdirSync(path.dirname(path.join(src, f)), {recursive:true}); fs.writeFileSync(path.join(src, f), t); };
  ['index.html', 'CNAME', 'LICENSE', 'robots.txt', 'data/men.json', 'flags/a.svg', 'teams/men/x.html', 'r/old.json',
   'build/update.mjs', 'build/store/state.json', '.github/workflows/nightly.yml', 'tools/t.py', 'docs/d.md', 'Claude outputs/x.yml', 'README.md', '.gitignore',
   '_precompute/index.json', '_precompute/table-men.json', '_precompute/manifest.json', '_precompute/days/men/2026.json', '_precompute/notes.txt'].forEach(f => put(f, f));
  fs.mkdirSync(out, {recursive:true}); fs.writeFileSync(path.join(out, 'stale.html'), 'x');
  const R = buildSite(src, out, path.join(src, '_precompute'));
  const has = f => fs.existsSync(path.join(out, f));
  ok(['index.html', 'CNAME', 'LICENSE', 'robots.txt', 'data/men.json', 'flags/a.svg', 'teams/men/x.html'].every(has) && R.files === 7 && !has('stale.html'),
    'site folder: the pages, data and pictures are copied, and the folder is emptied first');
  ok(!['build/update.mjs', 'build/store/state.json', '.github/workflows/nightly.yml', 'tools/t.py', 'docs/d.md', 'Claude outputs/x.yml', 'README.md', '.gitignore', '_precompute/index.json', 'r/old.json'].some(has)
    && !isSiteFile('build/precompute.mjs') && isSiteFile('badges/index.json'), 'site folder: build scripts, workflows and working files are left out');
  ok(['r/index.json', 'r/table-men.json', 'r/days/men/2026.json'].every(has) && !has('r/manifest.json') && !has('r/notes.txt') && R.ratings === 3, 'site folder: the ratings files go under r/, without the build\'s own notes');
  /* The published page is switched to read the table file only when both games' files are there. */
  put('index.html', 'a\nconst RATINGS_FILES = false;\nb'); put('_precompute/table-women.json', '{}');
  const R3 = buildSite(src, out, path.join(src, '_precompute'));
  ok(R.reads === false && R3.reads === true && fs.readFileSync(path.join(out, 'index.html'), 'utf8').includes('const RATINGS_FILES = true;') && fs.readFileSync(path.join(src, 'index.html'), 'utf8').includes('const RATINGS_FILES = false;'),
    'site folder: the published page is told to read the table files when both are there; the project\'s own page is not touched');
  fs.rmSync(path.join(src, '_precompute', 'index.json'));
  const R2 = buildSite(src, out, path.join(src, '_precompute'));
  ok(R2.ratings === 0 && !has('r') && has('index.html'), 'site folder: a ratings set without its index is left out whole');
  let threw = false; try { buildSite(src, out, null, ['data/men.json']); } catch (e){ threw = true; }
  ok(threw, 'site folder: refuses to publish without index.html');
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
  ok(['matches/index.html', 'h2h/index.html', 'pages.css'].every(f => fs.existsSync(path.join(root, f))), 'match and head-to-head index pages and the shared stylesheet written');
  const h2hDir = path.join(root, 'h2h', 'men'), h2hs = fs.existsSync(h2hDir) ? fs.readdirSync(h2hDir) : [];
  ok(h2hs.every(f => /^[a-z0-9-]+-vs-[a-z0-9-]+\.html$/.test(f)) && h2hs.every(f => /head to head: (the only meeting|all \d+ results) \| Formline/.test(fs.readFileSync(path.join(h2hDir, f), 'utf8'))),
    'head-to-head pages are named a-vs-b and titled with the meeting count');
  { const tok = (/analytics: '([^']*)'/.exec(fs.readFileSync(path.join(root, 'index.html'), 'utf8')) || [])[1] || '';
    ok(tok ? html.includes(`"token":"${tok}"`) : !html.includes('cloudflareinsights'), 'static pages carry the visit counter exactly when SITE.analytics has a token'); }
  // link-preview pictures
  const {PREVIEW_SPECS} = await import('./pages.mjs');
  const specs = JSON.parse(fs.readFileSync(PREVIEW_SPECS, 'utf8')), teamSpec = specs.find(x => x.file === 'previews/teams/men/' + any.replace('.html', '.png'));
  ok(teamSpec && teamSpec.data.kind === 'team' && /^[0-9a-f]{10}$/.test(teamSpec.hash) && html.includes('content="https://example.github.io/formline/og.png"') && html.includes('summary_large_image'),
    'each team page asks for a preview picture and uses the site card until it is drawn');
  fs.mkdirSync(path.join(root, path.dirname(teamSpec.file)), {recursive:true}); fs.writeFileSync(path.join(root, teamSpec.file), 'png');
  fs.writeFileSync(path.join(root, 'previews', 'index.json'), JSON.stringify({[teamSpec.file]:teamSpec.hash}));
  buildPages(root, 'https://example.github.io/formline/');
  ok(fs.readFileSync(path.join(root, 'teams', 'men', any), 'utf8').includes(`content="https://example.github.io/formline/${teamSpec.file}?v=${teamSpec.hash}"`), 'a drawn picture becomes the page preview, with its hash in the address');
  const sims = fs.existsSync(path.join(root, 'sim')) ? fs.readdirSync(path.join(root, 'sim')) : [];
  ok(sims.length === n.sim && sims.every(f => { const h = fs.readFileSync(path.join(root, 'sim', f), 'utf8');
    return /<title>.+(predictions: chances of|who the model backed going in)/.test(h) && h.includes('open=1') && h.includes('#/simulate?t=' + f.replace('.html', '')); }),
    'each Simulator tournament has a page that hands shared scenarios on to the Simulator');
  ok(['men', 'women'].every(g => ['biggest-upsets', 'biggest-wins', 'longest-runs', 'best-ever-teams', 'fifa-ranking-vs-formline'].every(f => fs.existsSync(path.join(root, 'records', g, f + '.html'))))
    && fs.existsSync(path.join(root, 'records', 'index.html')), 'record pages written for men and women, with an index');
  { const {recapWindows} = await import('./pages.mjs');
    const e = (d, hit) => ({g:'men', date:d, home:'A', away:'B', tournament:'Friendly', p:[0.5, 0.3, 0.2], result:hit ? [1, 0] : [0, 1], outcome:hit ? 0 : 2, hit, brier:0.3});
    const list = [...['2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-18'].map((d, i) => e(d, i % 3 > 0)), e('2026-12-20', true)];
    const W = recapWindows(list, {men:[]}), W2 = recapWindows(list, {men:[{date:'2026-11-20'}]});
    ok(W.length === 1 && W[0].slug === 'november-2026' && W[0].list.length === 8 && !W[0].open && W2[0].open, 'window recaps group matches less than 10 days apart, need 8 scored, and say "so far" while the window is on'); }
  const {tierColours} = await import('./previews.mjs');
  ok(Object.keys(tierColours(fs.readFileSync(path.join(root, 'index.html'), 'utf8'))).length >= 15, 'preview pictures read the 15 tier colours from the site');
  fs.rmSync(path.join(root, 'previews'), {recursive:true, force:true});
}
// --- IndexNow: tell Bing which pages changed
{
  const X = await import('./indexnow.mjs');
  const base = 'https://example.github.io/formline/', K = '0123456789abcdef0123456789abcdef';
  ok(X.findKey(root) === null, 'IndexNow: no key file, no key');
  fs.writeFileSync(path.join(root, 'ffffffffffffffffffffffffffffffff.txt'), 'something else');
  fs.writeFileSync(path.join(root, K + '.txt'), K + '\n');
  ok(X.findKey(root) === K, 'IndexNow: key read from the file whose contents match its name');
  const listed = X.sitemapUrls(fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8'));
  const page = [...listed].find(u => u.includes('/teams/men/')), rel = page.slice(base.length);
  const urls = X.urlsFor([rel, 'data/men.json', 'build/store/state.json', 'teams/men/not-a-team.html', 'og.png', ''], base, listed);
  ok(urls.length === 2 && urls.includes(page) && urls.includes(base), 'IndexNow: changed team page and home page (from its data), nothing outside the sitemap');
  ok(X.urlsFor(['build/store/state.json'], base, listed).length === 0, 'IndexNow: data-only store changes send nothing');
  const sent = [], files = new Map([[base + K + '.txt', K + '\n'], [page, fs.readFileSync(path.join(root, rel), 'utf8')]]);
  let stale = 2;   // the site serves the old page twice before the deploy lands
  const fake = async (url, opt = {}) => {
    if (opt.method === 'POST'){ sent.push({url, body:JSON.parse(opt.body)}); return {status:200}; }
    const u = url.replace(/[?&]v=\d+$/, '');
    if (u === page && stale-- > 0) return {ok:true, text:async () => 'old'};
    return files.has(u) ? {ok:true, text:async () => files.get(u)} : {ok:false, text:async () => ''};
  };
  const quiet = () => {};
  const r = await X.run(root, {files:[rel, 'data/men.json'], repo:'example/formline', fetchImpl:fake, tries:5, pause:0, log:quiet});
  ok(r.sent === 2 && r.live === true && stale < 0, 'IndexNow: waits for the new page to be live, then sends');
  const b = sent[0] && sent[0].body;
  ok(sent.length === 1 && sent[0].url === X.ENDPOINT && b.host === 'example.github.io' && b.key === K && b.keyLocation === base + K + '.txt' && b.urlList.length === 2,
    'IndexNow: one request with host, key, key file address and the pages');
  const r2 = await X.run(root, {files:['build/store/state.json'], repo:'example/formline', fetchImpl:fake, tries:1, pause:0, log:quiet});
  ok(r2.sent === 0 && sent.length === 1, 'IndexNow: nothing changed, nothing sent');
  const r3 = await X.run(root, {files:[rel], repo:'example/formline', fetchImpl:async (u, o = {}) => o.method === 'POST' ? (sent.push(1), {status:202}) : {ok:false, text:async () => ''}, tries:2, pause:0, log:quiet});
  ok(r3.sent === 1 && r3.live === false && sent.length === 2, 'IndexNow: site not updated in time, still sends');
  fs.rmSync(path.join(root, K + '.txt')); fs.rmSync(path.join(root, 'ffffffffffffffffffffffffffffffff.txt'));
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
  { /* Stage 2 of keeping the method private: the build's own tables are the ones the page works out. */
    const {precompute} = await import('./precompute.mjs');
    if (fs.existsSync(path.join(root, 'data', 'women.json'))){
      const P = precompute(model, 'women', 2024), T = model.table('women'), byKey = new Map(P.latest.rows.map(r => [r.key, r]));
      ok(P.latest.asOf === T.asOf && T.rows.every(r => { const x = byKey.get(r.key); return x && Math.round(x.rating) === r.rating && (x.rank || null) === (r.rank || null); }),
        'precompute: today\'s table matches the one the site works out, team by team');
      const last = P.months.tables[P.months.tables.length - 1], stamp = P.months.stamps[P.months.stamps.length - 1];
      const direct = model.run(`(() => { const [y, m] = ${JSON.stringify(stamp)}.split('-').map(Number); state.asOf = Date.UTC(y, m, 0); state.cache = {key:null}; const c = getRatings();
        const out = c.all.filter(r => !r.island).map(r => [r.key, Math.round(r.rating * 10) / 10, r.rank || 0]); state.asOf = state.bounds.women.max; state.cache = {key:null}; return out; })()`);
      ok(P.months.stamps[0] >= '2024-01' && P.months.stamps.length === P.months.tables.length && last.length === direct.length && direct.every(([k, r, rk]) => { const row = last.find(x => P.months.teams[x[0]] === k); return row && row[1] === r && row[3] === rk; }),
        'precompute: a month-end table matches the site\'s table for that date');
      /* A table after every match day, and every match as published: both equal what the page itself shows. */
      const {dayTables, matchLedger, inputPrint, modelPrint} = await import('./precompute.mjs');
      const Y = +T.asOf.slice(0, 4), D = dayTables(model, 'women', Y, false), A = dayTables(model, 'women', Y, true), L = matchLedger(model, 'women', Y);
      const day = D.days[D.days.length - 1], want = model.run(`(() => { state.gender = 'women'; state.windowYears = DEFAULTS.windowYears; state.asOf = Date.parse(${JSON.stringify(day)} + 'T00:00:00Z'); state.cache = {key:null};
        const c = getRatings(), out = {t:c.all.filter(r => !r.island).map(r => [r.key, Math.round(r.rating * 10) / 10, r.rank || 0])};
        state.asOf = state.bounds.women.max; state.cache = {key:null};
        const k = getRatings().all[0].key, h = publishedHistory(k).filter(x => x.published); out.k = k; out.h = h.slice(-1).map(x => [fmtDate(x.ts), Math.round(x.pre * 10) / 10, Math.round(x.rating * 10) / 10])[0] || null; return out; })()`);
      const lastT = D.tables[D.tables.length - 1];
      ok(D.days.length > 0 && D.days.length === D.tables.length && want.t.every(([k, r, rk]) => { const row = lastT.find(x => D.teams[x[0]] === k); return row && row[1] === r && row[3] === rk; }),
        'precompute: the table after a match day matches the site\'s table for that day');
      ok(A.window === 'all' && A.days.length > 0 && L.rows.every(r => A.days.includes(r[0]) && D.days.includes(r[0])) && A.tables.length === A.days.length, 'precompute: the all-time tables and the usual ones both cover every match day');
      const mine = want.h ? L.rows.filter(r => r[0] === want.h[0] && (L.teams[r[1]] === want.k || L.teams[r[2]] === want.k))[0] : null;
      ok(!want.h || (mine && (L.teams[mine[1]] === want.k ? Math.round(mine[5] * 10) / 10 === want.h[1] && Math.round(mine[7] * 10) / 10 === want.h[2] : Math.round(mine[6] * 10) / 10 === want.h[1] && Math.round(mine[8] * 10) / 10 === want.h[2])),   // the file keeps two decimal places
        'precompute: a match\'s ratings before and after equal the ones the team page shows');
      ok(inputPrint(model, 'women', Y, false) === inputPrint(model, 'women', Y, false) && inputPrint(model, 'women', Y, true) !== '' && modelPrint(model) === modelPrint(model),
        'precompute: the same data and model give the same prints, so unchanged years are skipped');
      /* Stage 3, past dates: the table the page rebuilds from a match-day file equals the one it works out, to the
         file's one decimal place; a date between two match days gets the earlier day's table; today is never taken
         from a match-day file; a file that does not fit the match list is refused. */
      { const {dayCheck} = await import('./precompute.mjs');
        const D2 = JSON.parse(JSON.stringify(D)), mid = Math.max(0, D2.days.length - 2), prev = [Y - 1, Y - 2].map(y => JSON.parse(JSON.stringify(dayTables(model, 'women', y, false))));
        const dc = dayCheck(model, 'women', D2, mid, 0, prev);
        ok(D2.v === 5 && D2.days.length >= 2 && dc.n > 50 && dc.bad.length === 0 && dc.tierDiffs === 0, 'past dates: a table rebuilt from the match-day file equals the page\'s own' + (dc.bad.length ? ' (' + dc.bad[0] + ')' : ''));
        const gap = D2.days.findIndex((d, k) => k < D2.days.length - 1 && Date.parse(D2.days[k + 1]) - Date.parse(d) > 2 * 86400000);
        const sh = gap >= 0 ? dayCheck(model, 'women', D2, gap, 1, prev) : null;
        const steps = D2.days.slice(1).map((d, k) => (Date.parse(d) - Date.parse(D2.days[k])) / 86400000);
        ok((!sh || sh.bad.length === 0) && steps.every(x => x >= 1 && x <= 7), 'past dates: the file has a day at least every week, and a date between two of its days gets the earlier day\'s table, equal to the one worked out for that date' + (sh && sh.bad.length ? ' (' + sh.bad[0] + ')' : ''));
        const today = dayCheck(model, 'women', D2, D2.days.length - 1, 0, prev);
        const short = JSON.parse(JSON.stringify(D2)); short.tables[mid] = short.tables[mid].slice(1);
        ok(today.bad[0] === 'the page did not use the file' && dayCheck(model, 'women', short, mid, 0, prev).bad[0] === 'the page did not use the file' && dayCheck(model, 'women', D2, mid).bad[0] === 'the page did not use the file',
          'past dates: today\'s table never comes from a day file; a file that does not fit the match list is refused; without the year before\'s file the page works the table out');
      }
      /* Stage 3, a table on a past date for the pages that only read published numbers (seeding, Confederations, the
         early-years example): from the match-day file when asked for and in hand, worked out otherwise. */
      { const D3 = JSON.parse(JSON.stringify(D)), day = D3.days[Math.max(0, D3.days.length - 2)];
        model.run(`__d3 = ${JSON.stringify(JSON.stringify(D3))}`);
        const got = model.run(`(() => { state.gender = 'women'; const F = JSON.parse(__d3), ts = Date.parse(${JSON.stringify(day)} + 'T12:00:00Z'), out = {};
          const ask = lite => atDefaults(c => [!!c.lite, c.all.length, c.day || null], ts, lite);
          state.useTableFiles = true; state.dayFiles = {['women|' + F.year]:F}; out.file = ask(true); out.notAsked = ask(false);
          state.dayFiles = {}; out.noFile = ask(true); state.useTableFiles = false; state.dayFiles = {['women|' + F.year]:F}; out.off = ask(true);
          state.dayFiles = {}; state.asOf = state.bounds.women.max; state.cache = {key:null}; return out; })()`);
        ok(D3.days.length >= 2 && got.file[0] === true && got.file[2] === day && got.file[1] === got.notAsked[1] && !got.notAsked[0] && !got.noFile[0] && !got.off[0],
          'past dates: a page that reads only published numbers gets the match-day file\'s table; others, and a missing file, get the worked-out one ' + JSON.stringify(got));
        const {confYear} = await import('./precompute.mjs'), cy = confYear(model, 'women', Y - 1);
        ok(cy && typeof cy === 'object' && Object.values(cy).every(v => typeof v.level === 'number' && typeof v.top10 === 'number'), 'precompute: a year end\'s confederation figures are written for the history chart'); }
      /* Stage 3, team pages: each side of each match read from the year's file equals what the page works out (ratings to
         one decimal place, ranks exactly), and a changed number is caught. */
      { const {ledgerCheck} = await import('./precompute.mjs');
        const L2 = JSON.parse(JSON.stringify(L)), lc = ledgerCheck(model, 'women', L2);
        const bent = JSON.parse(JSON.stringify(L2)); if (bent.rows[0]) bent.rows[0][7] += 1;
        ok(L2.v === 2 && L2.rows.length > 0 && L2.rows[0].length === 28 && lc.sides > 0 && lc.bad.length === 0 && ledgerCheck(model, 'women', bent).bad.length > 0,
          'team pages: a match\'s published ratings and ranks read from the year file equal the page\'s own' + (lc.bad.length ? ' (' + lc.bad[0] + ')' : ''));
        /* Each side's closing figures for the day (what a chart on a past date draws for a match day) equal the ones
           from a run of the window to that day; a changed one is caught. */
        const bent2 = JSON.parse(JSON.stringify(L2)); for (const r of bent2.rows) r[20] += 3;
        ok(lc.closes > 0 && ledgerCheck(model, 'women', bent2).bad.some(x => x.includes('closing')),
          'team pages: a match day\'s closing rating, band and ranks in the year file equal the chart\'s own (' + lc.closes + ' sides tried)');
        /* Old ranks follow the visitor's filter (Seb, 12 Nov 2026): a year's ranks file holds each match's ranks under
           every band limit and both rank orders, equal to the page's own working; a changed one is caught; the page
           reads it only for a listed band limit and when the file is in hand. */
        const RK = JSON.parse(JSON.stringify({v:1, year:L2.year, rows:L.ranks})), lr = ledgerCheck(model, 'women', L2, RK);
        const bentR = JSON.parse(JSON.stringify(RK)); for (const r of bentR.rows) for (let k = 0; k < r.length; k++) if (r[k]) r[k] += 1;
        ok(RK.rows.length === L2.rows.length && RK.rows[0].length === 120 && lr.rankN > 0 && lr.bad.length === 0 && ledgerCheck(model, 'women', L2, bentR).bad.some(x => x.includes('rank')),
          'old ranks: each match\'s ranks under every band limit and both rank orders, read from the year\'s ranks file, equal the page\'s own (' + lr.rankN + ' ranks)' + (lr.bad.length ? ' (' + lr.bad[0] + ')' : ''));
        model.run(`__lk = ${JSON.stringify(JSON.stringify({L:L2, R:RK}))}`);
        const orr = model.run(`(() => { state.gender = 'women'; state.windowYears = DEFAULTS.windowYears; state.comps = new Set(COMP_ORDER); state.historicalNames = DEFAULTS.historicalNames;
          state.maxBand = DEFAULTS.maxBand; state.rankBy = DEFAULTS.rankBy; state.asOf = state.bounds.women.max; state.cache = {key:null};
          const X = JSON.parse(__lk), Y = X.L.year, F = ledgerIndex(X.L), r0 = X.L.rows[0], ts = Date.parse(r0[0] + 'T00:00:00Z'), key = X.L.teams[r0[1]], out = {};
          let runs = 0; const rw = runWindow; runWindow = function(){ runs++; return rw.apply(this, arguments); };
          try {
            state.useTableFiles = true; state.ledgerFiles = {['women|' + Y]:F}; state.rankFiles = {['women|' + Y]:X.R}; pubCache.key = null;
            state.maxBand = 0; state.rankBy = 'lower'; const a = rankAfter({}, key, ts, false), bi = BAND_OPTIONS.indexOf(0), o = (bi * 2 + 1) * 8;
            out.read = !!a && a.rank === X.R.rows[0][o] && a.of === X.R.rows[0][o + 1] && runs === 0;
            const c = ledgerClose(key, ts); out.close = !!c && c[1] === r0[20] && c[3] === X.R.rows[0][96 + bi * 4] && runs === 0;
            state.maxBand = 175; state.rankBy = 'rating'; runs = 0; rankAfter({}, key, ts, false); out.odd = runs > 0 && ledgerClose(key, ts) === null;
            state.maxBand = 400; state.rankFiles = {}; runs = 0; pubCache.key = null; rankAfter({}, key, ts, false); out.missing = runs > 0;
          } finally { runWindow = rw; }
          state.maxBand = DEFAULTS.maxBand; state.rankBy = DEFAULTS.rankBy; state.useTableFiles = false; state.ledgerFiles = {}; state.rankFiles = {}; state.cache = {key:null}; pubCache.key = null;
          return out; })()`);
        ok(orr.read && orr.close && orr.odd && orr.missing, 'old ranks: under another band limit or rank order the page reads a match\'s ranks from the ranks file without the model; an unlisted band limit or a missing file is worked out on the page ' + JSON.stringify(orr)); }
      /* A team's cluster: the teams ranked inside its own likely rank range, itself included; none for an unranked team. */
      { const cl = model.run(`(() => { const out = {n:0, bad:0, none:true};
          for (const g of ['men', 'women']){ if (!state.matches[g]) continue; state.gender = g; state.asOf = state.bounds[g].max; state.cache = {key:null};
            const c = getRatings(), R = rankRanges(c);
            c.table.forEach(r => { const K = clusterOf(c, r), m = R.get(r.key).mid; out.n++;
              if (!K || !K.rows.includes(r) || K.lo > r.rank || K.hi < r.rank || K.lo !== Math.min(m[0], r.rank) || K.hi !== Math.max(m[1], r.rank) || K.rows.length !== K.hi - K.lo + 1 || K.rows.some((x, i) => x.rank !== K.lo + i)) out.bad++; });
            c.provisional.forEach(r => { if (clusterOf(c, r) !== null) out.none = false; }); }
          state.gender = 'women'; state.asOf = state.bounds.women.max; state.cache = {key:null};
          return out; })()`);
        ok(cl.bad === 0 && cl.none, 'cluster: every ranked team\'s cluster is the run of ranks inside its likely rank, itself included (' + cl.n + ' teams); none for an unranked team'); }
      /* Today's table in full, read back from its file, equals the page's own table; a changed number is caught. */
      const {tableFile, tableCheck, recordYears, recordCheck} = await import('./precompute.mjs');
      for (const allTime of [false, true]){
        const F = JSON.parse(JSON.stringify(tableFile(model, 'women', allTime))), chk = tableCheck(model, 'women', allTime, F);
        ok(F.rows.length > 0 && F.window.length > 0 && chk.n > 100 && chk.entries === 2 * F.window.length && chk.bad.length === 0,
          'precompute: the ' + (allTime ? 'all-time' : 'usual') + ' table read back from its file equals the page\'s, field by field' + (chk.bad.length ? ' (' + chk.bad[0] + ')' : ''));
        if (!allTime){
          const bent = JSON.parse(JSON.stringify(F)); bent.rows[0].rating += 1; bent.window[0][4] += 1;
          const stale = JSON.parse(JSON.stringify(F)); stale.matches += 1;
          ok(tableCheck(model, 'women', false, bent).bad.length >= 2 && tableCheck(model, 'women', false, stale).bad[0] === 'file refused',
            'precompute: a changed number in a table file is caught, and a file from another match list is refused');
        }
      }
      /* Stage 3: with the switch on and a fitting file, getRatings() hands back the table from the file; a past date, a
         changed setting or a file from another match list falls back to working it out. */
      const sw = model.run(`(() => { state.gender = 'women'; state.windowYears = DEFAULTS.windowYears; state.comps = new Set(COMP_ORDER); state.historicalNames = DEFAULTS.historicalNames;
        state.maxBand = DEFAULTS.maxBand; state.rankBy = DEFAULTS.rankBy; state.asOf = state.bounds.women.max; state.cache = {key:null};
        const own = getRatings(), F = JSON.parse(JSON.stringify(tableToFile(own))), top = own.all[0].key, out = {off:!!own.fromFile};
        state.useTableFiles = true; state.tableFiles = {women:F}; state.cache = {key:null};
        const c = getRatings(); out.on = !!c.fromFile && c.all[0].key === top && c.all.length === own.all.length && getRatings() === c;
        const k = c.all.find(r => (c.history.get(r.key) || []).length).key, o = c.history.get(k)[0].opp; out.stakes = !!ratingStakes(c, k, o, true, 20) && state.cache === c;
        state.asOf = state.matches.women[state.matches.women.length - 2].ts - 86400000; state.cache = {key:null}; out.past = !getRatings().fromFile;
        state.asOf = state.bounds.women.max; state.comps = new Set(COMP_ORDER.slice(0, 2)); state.cache = {key:null}; out.comps = !getRatings().fromFile;
        state.comps = new Set(COMP_ORDER); state.windowYears = 0; state.cache = {key:null}; out.allTime = !getRatings().fromFile;
        state.windowYears = DEFAULTS.windowYears; state.tableFiles = {women:{...F, print:F.print + 1}}; state.cache = {key:null}; out.stale = !getRatings().fromFile && state.tableFiles.women === null;
        state.useTableFiles = false; state.tableFiles = {}; state.cache = {key:null};
        return out; })()`);
      ok(sw.off === false && sw.on && sw.stakes && sw.past && sw.comps && sw.allTime && sw.stale,
        'table file: read for today\'s table at the site\'s settings, and worked out on the page for anything else ' + JSON.stringify(sw));
      /* Another band limit or rank order: the page ranks the file's table again (the ranking rule is on the page, the
         rating engine is not needed), and the result equals the table the model works out under that setting, field
         by field; the same for a past date's table from a match-day file. A match's ratings still come from the year
         file; its ranks, which depend on the setting, do not. */
      { const {tableCheck: tc2, dayCheck: dc2} = await import('./precompute.mjs');
        const sets = [{maxBand:0, rankBy:'lower'}, {maxBand:150, rankBy:'rating'}, {maxBand:400, rankBy:'rating'}, {maxBand:250, rankBy:'lower'}];
        let n = 0; const bad = [];
        for (const allTime of [false, true]){ const F = JSON.parse(JSON.stringify(tableFile(model, 'women', allTime)));
          for (const set of sets){ const R = tc2(model, 'women', allTime, JSON.parse(JSON.stringify(F)), set); n += R.n; if (R.bad.length) bad.push(JSON.stringify(set) + (allTime ? ' all time: ' : ': ') + R.bad[0]); } }
        ok(n > 400 && bad.length === 0, 'ranking again: today\'s table from the file, ranked on the page under another band limit or the cautious order, equals the model\'s own (' + n + ' values)' + (bad.length ? ' (' + bad[0] + ')' : ''));
        const D4 = JSON.parse(JSON.stringify(D)), mid4 = Math.max(0, D4.days.length - 2), prev4 = [Y - 1, Y - 2].map(y => JSON.parse(JSON.stringify(dayTables(model, 'women', y, false))));
        let dn = 0, off = 0; const dbad = [];
        for (const set of sets){ const R = dc2(model, 'women', D4, mid4, 0, prev4, set); dn += R.n; off += (R.rankOff || 0) + (R.edgeOff || 0); if (R.bad.length) dbad.push(JSON.stringify(set) + ': ' + R.bad[0]); }
        ok(dn > 100 && dbad.length === 0, 'ranking again: a past date\'s table from the match-day file, ranked on the page under another setting, equals the model\'s own with no run of the model (' + dn + ' values, ' + off + ' on a rounding edge)' + (dbad.length ? ' (' + dbad[0] + ')' : ''));
        const rr = model.run(`(() => { state.gender = 'women'; state.windowYears = DEFAULTS.windowYears; state.comps = new Set(COMP_ORDER); state.historicalNames = DEFAULTS.historicalNames;
          state.maxBand = DEFAULTS.maxBand; state.rankBy = DEFAULTS.rankBy; state.asOf = state.bounds.women.max; state.cache = {key:null};
          const own = getRatings(), F = JSON.parse(JSON.stringify(tableToFile(own))), out = {pools:Array.isArray(F.pools) && F.pools.length > 0 && F.pools[0].length === 3};
          let runs = 0; const rw = runWindow; runWindow = function(){ runs++; return rw.apply(this, arguments); };
          try {
            state.useTableFiles = true; state.tableFiles = {women:F}; state.maxBand = 0; state.rankBy = 'lower'; state.cache = {key:null};
            const c = getRatings(); out.on = c.fromFile === true && c.reranked === true && c.provisional.every(r => r.island) && c.table.length + c.provisional.length === own.all.length && getRatings() === c && runs === 0;
            out.order = c.table.every((r, i) => r.rank === i + 1 && (!i || c.table[i - 1].lower >= r.lower));
            state.maxBand = DEFAULTS.maxBand; state.rankBy = DEFAULTS.rankBy; state.cache = {key:null};
            const d = getRatings(); out.back = d.fromFile === true && !d.reranked && d.table.length === own.table.length && runs === 0;
            const bare = {...F}; delete bare.pools; state.tableFiles = {women:bare}; state.maxBand = 0; state.rankBy = 'lower'; state.cache = {key:null};
            const e = getRatings(); out.bare = !e.fromFile && runs > 0;
          } finally { runWindow = rw; }
          out.split = rankStd() === false && baseSettings() === true && siteSettings() === false;
          state.maxBand = DEFAULTS.maxBand; state.rankBy = DEFAULTS.rankBy; state.useTableFiles = false; state.tableFiles = {}; state.cache = {key:null};
          return out; })()`);
        ok(rr.pools && rr.on && rr.order && rr.back && rr.bare && rr.split,
          'ranking again: in the published copy a changed band limit or rank order re-ranks the file\'s table without the model; a file without the confederations\' levels is worked out on the page ' + JSON.stringify(rr)); }
      const RY = JSON.parse(JSON.stringify(recordYears(model, 'women'))), rc = recordCheck(model, 'women', RY);
      ok(RY.length === Y - 2018 && rc.bad.length === 0, 'precompute: the Forecast record\'s yearly figures equal the page\'s' + (rc.bad.length ? ' (' + rc.bad[0] + ')' : ''));
      /* Stage 3, charts: the series file (every team's rating and band on each sampled date, and on its match days of the
         last two years) read back the way the page reads it equals what the page works out, at the usual window and
         for all time; and the page takes it only when it fits (same match list, same dates, same window). */
      { const {snapSeries} = await import('./precompute.mjs');
        for (const allTime of [false, true]){
          const R = snapSeries(model, 'women', allTime), F = JSON.parse(JSON.stringify(R.file));
          ok(F.v === 1 && F.stamps.length === (allTime ? 121 : 37) && F.pts.length === F.stamps.length && F.pts[F.pts.length - 1].length > 0 && F.pts[F.pts.length - 1][0].length === 5 && R.n > 100 && R.bad.length === 0,
            'charts: the ' + (allTime ? 'all-time' : 'usual') + ' series read back from its file equals the page\'s, point by point (' + R.n + ' values)' + (R.bad.length ? ' (' + R.bad[0] + ')' : ''));
          if (allTime) continue;
          model.run(`__sf = ${JSON.stringify(JSON.stringify(F))}`);
          const got = model.run(`(() => { state.gender = 'women'; state.windowYears = DEFAULTS.windowYears; state.comps = new Set(COMP_ORDER); state.historicalNames = DEFAULTS.historicalNames;
            state.maxBand = DEFAULTS.maxBand; state.rankBy = DEFAULTS.rankBy; state.asOf = state.bounds.women.max; state.cache = {key:null};
            const F = JSON.parse(__sf), stamps = snapshotStamps(), out = {off:snapFileOk()};
            state.useTableFiles = true; out.on = snapFileOk();
            const S = snapsFromFile(F, snapKey(), stamps), M = {key:snapKey(), stamps, maps:stamps.map(t => runWindow(windowStartFor(t), t))};
            out.read = !!S && S.fromFile === true && S.rows.length === stamps.length;
            const keys = getRatings().all.slice(0, 3).map(r => r.key), line = X => JSON.stringify(trackDatasets(keys, X, {bands:true}).datasets.filter(d => !d._band).map(d => [d.data, d._bands]));
            out.sameLine = !!S && line(S) === line(M); out.points = trackDatasets(keys, M, {}).datasets[0].data.filter(v => v !== null).length;
            out.print = snapsFromFile({...F, print:F.print + 1}, snapKey(), stamps) === null;
            out.dates = snapsFromFile({...F, stamps:F.stamps.map((t, i) => i ? t : t + 1)}, snapKey(), stamps) === null;
            state.windowYears = 0; out.window = snapsFromFile(F, snapKey(), snapshotStamps()) === null; out.allTimeOk = snapFileOk();
            state.windowYears = 8; out.other = !snapFileOk();
            state.windowYears = DEFAULTS.windowYears; state.maxBand = 300; out.band = !snapFileOk(); state.maxBand = DEFAULTS.maxBand;
            state.useTableFiles = false; state.cache = {key:null};
            return out; })()`);
          ok(got.off === false && got.on && got.read && got.sameLine && got.points > 0 && got.print && got.dates && got.window && got.allTimeOk && got.other && got.band,
            'charts: the series file is read at the site\'s settings and gives the same lines; another match list, other dates, or a changed setting are worked out on the page ' + JSON.stringify(got));
          /* Old ranks follow the visitor's filter: beside the usual window's series the build writes each date's ranks
             under every band limit (checked against the model inside snapSeries), and under another band limit the page
             puts that limit's ranks on the same lines; without the ranks file it works the series out itself. */
          { model.run(`__sr = ${JSON.stringify(JSON.stringify({F, R:R.ranks}))}`);
            const alt = model.run(`(() => { state.gender = 'women'; state.windowYears = ${allTime ? 0 : 'DEFAULTS.windowYears'}; state.comps = new Set(COMP_ORDER); state.historicalNames = DEFAULTS.historicalNames;
              state.maxBand = DEFAULTS.maxBand; state.rankBy = DEFAULTS.rankBy; state.asOf = state.bounds.women.max; state.cache = {key:null};
              const X = JSON.parse(__sr), stamps = snapshotStamps(), out = {shape:X.R.v === 1 && X.R.pts.length === X.F.pts.length && X.R.pts[X.R.pts.length - 1][0].length === 13 && X.R.bands.join() === BAND_OPTIONS.join()};
              state.useTableFiles = true; const std = snapsFromFile(X.F, snapKey(), stamps, null), k = stamps.length - 1;
              state.maxBand = 0; const bi = BAND_OPTIONS.indexOf(0), S = snapsFromFile(X.F, snapKey(), stamps, X.R);
              out.read = !!S && [...S.rows[k]].every(([key, x]) => { const y = X.R.pts[k].find(q => X.R.teams[q[0]] === key), z = std.rows[k].get(key); return y && x[3] === y[1 + 2 * bi] && x[4] === y[2 + 2 * bi] && x[1] === z[1] && x[2] === z[2]; });
              out.more = !!S && [...S.rows[k].values()].filter(x => x[3]).length >= [...std.rows[k].values()].filter(x => x[3]).length;
              out.none = snapsFromFile(X.F, snapKey(), stamps, null) === null; out.stale = snapsFromFile(X.F, snapKey(), stamps, {...X.R, print:X.R.print + 1}) === null;
              state.maxBand = 175; out.odd = !chartOk();
              state.maxBand = DEFAULTS.maxBand; state.rankBy = 'lower'; out.order = chartOk() && !chartAlt();   // the cautious order alone needs no ranks file: a point carries both ranks
              state.rankBy = DEFAULTS.rankBy; state.windowYears = DEFAULTS.windowYears; state.useTableFiles = false; state.cache = {key:null};
              return out; })()`);
            ok(alt.shape && alt.read && alt.more && alt.none && alt.stale && alt.odd && alt.order,
              'charts' + (allTime ? ' (all time)' : '') + ': under another band limit the page puts that limit\'s ranks, from the ranks file, on the same lines; without a fitting ranks file, or for an unlisted limit, the series is worked out on the page ' + JSON.stringify(alt)); }
        }
        /* A team with two matches on one day: each is found by its opponent and score; the ranks come off either row. */
        const two = model.run(`(() => { state.gender = 'women'; state.windowYears = DEFAULTS.windowYears; state.comps = new Set(COMP_ORDER); state.historicalNames = DEFAULTS.historicalNames;
          state.maxBand = DEFAULTS.maxBand; state.rankBy = DEFAULTS.rankBy; state.asOf = state.bounds.women.max;
          const row = (h, a, hs, as, post) => ['2020-03-01', h, a, hs, as, 1500, 1500, post, 1500, 60, 60, 0.5, 3, 9, 1, 4, 5, 9, 2, 4];
          const F = ledgerIndex({v:2, year:2020, teams:['A', 'B', 'C'], rows:[row(0, 1, 2, 0, 1510), row(0, 2, 1, 1, 1512), row(1, 2, 0, 0, 1500)]});
          const ts = Date.parse('2020-03-01T00:00:00Z'), m = (h, a, hs, as) => ({_h:h, _a:a, hs, as}), out = {};
          state.useTableFiles = true; state.ledgerFiles = {'women|2020':F};
          const g = (key, mm) => { const L = ledgerRow(key, ts, mm); return L ? L[0][7] + ':' + L[1] : null; };
          out.first = g('A', m('A', 'B', 2, 0)); out.second = g('A', m('A', 'C', 1, 1)); out.other = g('B', m('A', 'B', 2, 0)); out.wrong = g('A', m('A', 'B', 3, 0));
          out.ranks = g('A', null); out.single = g('C', null) === null ? null : ledgerRow('C', ts, null)[0][7];
          const R = rankAfter({}, 'A', ts, false); out.rank = R && R.rank + '/' + R.of;
          /* under another band limit the match's ratings are still the file's; nothing that is a rank is read from it */
          state.maxBand = 300; out.banded = g('A', m('A', 'B', 2, 0)) === '1510:0' && ledgerClose('A', ts) === null; state.maxBand = DEFAULTS.maxBand;
          state.useTableFiles = false; state.ledgerFiles = {}; state.cache = {key:null};
          return out; })()`);
        ok(two.first === '1510:0' && two.second === '1512:0' && two.other === '1510:1' && two.wrong === null && two.ranks === '1510:0' && two.rank === '3/9' && two.banded,
          'team pages: a team with two matches on one day gets each from the year file, told apart by opponent and score ' + JSON.stringify(two)); }
      /* Stage 3, edition pages: every edition's figures written to a file and read back equal the page's own; the page
         takes the file only at the site's settings and only when it fits the matches in hand. */
      { const {editionList, editionFile} = await import('./precompute.mjs');
        const EL = editionList(model, 'women'); let n = 0, deepN = 0; const bad = [], files = {};
        for (const e of EL){ const R = editionFile(model, 'women', e.id, false, true); n += R.n; deepN += R.deepN; if (R.bad.length) bad.push(e.id + ': ' + R.bad[0]); files[e.id] = JSON.parse(JSON.stringify(R.file)); }
        /* Old ranks follow the visitor's filter: under every other band limit the page ranks the edition again from its
           file, and the ranks going in and coming out and the tiers equal the model's own run under that limit; a
           changed figure is caught. */
        { const e0 = EL.map(e => e).sort((a, b) => files[b.id].top.length - files[a.id].top.length)[0], bentE = JSON.parse(JSON.stringify(files[e0.id]));
          for (const t of bentE.teams) t[9] = t[9].map(x => x ? x + 3 : x);
          model.run(`__ebf = ${JSON.stringify(JSON.stringify(bentE))}`);
          const eb = model.run(`(() => { state.gender = 'women'; state.windowYears = DEFAULTS.windowYears; state.comps = new Set(COMP_ORDER); state.historicalNames = DEFAULTS.historicalNames; state.rankBy = DEFAULTS.rankBy;
            const e = getEditions().byId.get(${JSON.stringify(e0.id)}), F = JSON.parse(__ebf), out = {};
            state.maxBand = 0; state.edCache = null; const A = editionRun(e), C = edFromFile(e, F); state.edCache = null;
            out.bent = !!C && A.teams.some((a, i) => a.postRank !== C.teams[i].postRank) && A.teams.every((a, i) => a.preRank === C.teams[i].preRank);
            state.maxBand = 175; out.odd = edFromFile(e, F) === null; state.maxBand = DEFAULTS.maxBand; out.v3 = F.v === 3 && Array.isArray(F.extra) && F.top.every(x => x.length === 5) && F.extra.every(x => x.length === 4) && F.teams.every(t => Array.isArray(t[9]) && t[9].length === BAND_OPTIONS.length);
            return out; })()`);
          ok(deepN > 0 && eb.bent && eb.odd && eb.v3, 'edition pages: under every other band limit an edition ranked again from its file has the model\'s ranks and tiers (' + deepN + ' values); a changed rank shows, and an unlisted limit is worked out on the page ' + JSON.stringify(eb)); }
        ok(EL.length > 0 && new Set(EL.map(e => e.name)).size === EL.length && EL.every(e => /^[A-Za-z0-9-]+$/.test(e.name)) && n > 50 && bad.length === 0,
          'edition pages: every edition read back from its file equals the page\'s, field by field (' + EL.length + ' editions, ' + n + ' values)' + (bad.length ? ' (' + bad[0] + ')' : ''));
        { const ELA = editionList(model, 'women', true); let nA = 0; const badA = [], filesA = {};
          for (const e of ELA){ const R = editionFile(model, 'women', e.id, true); nA += R.n; if (R.bad.length) badA.push(e.id + ': ' + R.bad[0]); filesA[e.id] = JSON.parse(JSON.stringify(R.file)); }
          const one = ELA.map(e => filesA[e.id]).sort((a, b) => b.rows.length - a.rows.length)[0];
          model.run(`__eaf = ${JSON.stringify(JSON.stringify(one))}`);
          const ea = model.run(`(() => { state.gender = 'women'; state.comps = new Set(COMP_ORDER); state.historicalNames = DEFAULTS.historicalNames; state.maxBand = DEFAULTS.maxBand; state.rankBy = DEFAULTS.rankBy;
            state.asOf = state.bounds.women.max; state.cache = {key:null};
            const F = JSON.parse(__eaf), e = getEditions().byId.get(F.id), run = () => { state.edCache = null; return editionRun(e); }, out = {wy:F.windowYears};
            state.useTableFiles = true; state.windowYears = 0; state.edFiles = {[edKey('women', e)]:F}; out.key = edKey('women', e).startsWith('all|'); out.on = run().fromFile === true;
            state.windowYears = DEFAULTS.windowYears; state.edFiles = {[edKey('women', e)]:F}; out.wrongWindow = !run().fromFile;
            state.useTableFiles = false; state.edFiles = {}; state.edCache = null; return out; })()`);
          ok(ELA.length === EL.length && nA > 50 && badA.length === 0 && ea.wy === 0 && ea.key && ea.on && ea.wrongWindow,
            'edition pages, all time: every edition read back from its all-time file equals the page\'s, and a file is only read under the setting it was made for (' + nA + ' values) ' + JSON.stringify(ea) + (badA.length ? ' (' + badA[0] + ')' : '')); }
        const big = EL.map(e => files[e.id]).sort((a, b) => b.rows.length - a.rows.length)[0];
        model.run(`__ef = ${JSON.stringify(JSON.stringify(big))}`);
        const eg = model.run(`(() => { state.gender = 'women'; state.windowYears = DEFAULTS.windowYears; state.comps = new Set(COMP_ORDER); state.historicalNames = DEFAULTS.historicalNames;
          state.maxBand = DEFAULTS.maxBand; state.rankBy = DEFAULTS.rankBy; state.asOf = state.bounds.women.max; state.cache = {key:null};
          const F = JSON.parse(__ef), e = getEditions().byId.get(F.id), out = {rows:F.rows.length}, run = () => { state.edCache = null; return editionRun(e); };
          state.edFiles = {['women|' + e.id]:F}; out.off = !run().fromFile;
          state.useTableFiles = true; const D = run(); out.on = D.fromFile === true && D.rows.length === e.matches.length && D.rows.every((r, i) => r.m === e.matches[i] || e.matches.includes(r.m));
          state.edFiles = {['women|' + e.id]:{...F, print:F.print + 1}}; out.stale = !run().fromFile;
          state.edFiles = {['women|' + e.id]:{...F, id:F.id + 'x'}}; out.other = !run().fromFile;
          state.edFiles = {['women|' + e.id]:F}; state.maxBand = 300; out.banded = run().fromFile === true; state.maxBand = 175; out.setting = !run().fromFile; state.maxBand = DEFAULTS.maxBand;   // a listed band limit reads the file; an unlisted one does not
          state.windowYears = 0; out.allTime = !run().fromFile; state.windowYears = DEFAULTS.windowYears;
          state.useTableFiles = false; state.edFiles = {}; state.edCache = null;
          return out; })()`);
        ok(eg.rows > 0 && eg.off && eg.on && eg.stale && eg.other && eg.setting && eg.banded && eg.allTime,
          'edition pages: the file is read at the site\'s settings and under any listed band limit when it fits; another run of matches, another edition or an unlisted band limit is worked out on the page ' + JSON.stringify(eg)); }
      /* Stage 3, Records and the all-time history on team pages: the lists drawn from the file equal the ones drawn from
         the replay, for all time, each spacing of the peaks and every year; a team's all-time figures read back equal. */
      { const {recordsFile, histFile} = await import('./precompute.mjs');
        const RF = recordsFile(model, 'women'), HF = histFile(model, 'women');
        ok(RF.n >= 6 && RF.bad.length === 0 && RF.file.rows.length > 0 && RF.file.rows.length <= RF.rows && RF.file.yearEnd.length > 0,
          'records: the page drawn from the file equals the page drawn from the replay (' + RF.n + ' views)' + (RF.bad.length ? ' (' + RF.bad[0] + ')' : ''));
        ok(HF.n > 20 && HF.bad.length === 0 && Object.keys(HF.file.teams).length > 0,
          'team history, all time: best ranks, peak, upsets and every match line read back from the file equal the page\'s (' + HF.n + ' values)' + (HF.bad.length ? ' (' + HF.bad[0] + ')' : ''));
        model.run(`__rf = ${JSON.stringify(JSON.stringify(RF.file))}; __hf = ${JSON.stringify(JSON.stringify(HF.file))}`);
        const rh = model.run(`(() => { state.gender = 'women'; state.windowYears = DEFAULTS.windowYears; state.comps = new Set(COMP_ORDER); state.historicalNames = DEFAULTS.historicalNames;
          state.maxBand = DEFAULTS.maxBand; state.rankBy = DEFAULTS.rankBy; state.asOf = state.bounds.women.max; state.cache = {key:null};
          const RF = JSON.parse(__rf), HF = JSON.parse(__hf), out = {};
          const rec = () => { state.recCache = {}; return recordsData('women'); }, his = () => { state.histAllCache = {}; return histAll('women'); };
          state.recFiles = {women:RF}; state.histFiles = {women:HF}; out.off = !rec().fromFile && !his().fromFile;
          state.useTableFiles = true; out.on = rec().fromFile === true && his().fromFile === true;
          state.recFiles = {women:{...RF, print:RF.print + 1}}; out.staleRec = !rec().fromFile && state.recFiles.women === null;
          state.histFiles = {women:{...HF, print:HF.print + 1}}; out.staleHist = !his().fromFile && state.histFiles.women === null;
          state.histFiles = {women:HF}; state.asOf = state.matches.women[state.matches.women.length - 2].ts - 86400000; out.past = his().fromFile === true;
          state.histFiles = {women:{...HF, asOf:state.asOf - 86400000}}; out.early = !his().fromFile; state.histFiles = {women:HF};   // a file that stops before the date in view
          state.asOf = state.bounds.women.max; state.maxBand = 300; out.band = !his().fromFile; state.maxBand = DEFAULTS.maxBand;
          const bent = JSON.parse(__rf); bent.peak[0][2] += 50; const key = 'women|' + state.historicalNames + '|' + HOME_VER, sp = state.params;
          const draw = X => { state.recCache = {[key]:X}; state.params = {}; viewRecords(); return document.getElementById('app').innerHTML; };
          out.bent = draw(recordsFromFile('women', RF)) !== draw(recordsFromFile('women', bent)); state.params = sp;
          state.useTableFiles = false; state.recFiles = {}; state.histFiles = {}; state.recCache = {}; state.histAllCache = {};
          return out; })()`);
        ok(rh.off && rh.on && rh.staleRec && rh.staleHist && rh.past && rh.early && rh.band && rh.bent,
          'records and all-time history: read from their files when these fit (the history for a past date too); another match list, a file that stops before the date, or a changed setting is worked out on the page, and a changed figure shows ' + JSON.stringify(rh)); }
      /* Stage 4: today's forecasts from the build's file. With today's table and the forecast file in hand, the page
         forecasts every listed fixture and other pairings, gives the stakes and the goals figures, and never runs the
         rating engine; a file from another match list, a past date or a changed setting is not used. */
      { const {fcFile} = await import('./precompute.mjs');
        const names = model.run(`(() => { state.gender = 'women'; state.windowYears = DEFAULTS.windowYears; state.comps = new Set(COMP_ORDER); state.historicalNames = DEFAULTS.historicalNames; state.maxBand = DEFAULTS.maxBand; state.rankBy = DEFAULTS.rankBy;
          state.asOf = state.bounds.women.max; state.cache = {key:null}; return {teams:getRatings().all.map(r => r.team), date:fmtDate(state.asOf + 86400000)}; })()`);
        const fxs = [{home:names.teams[0], away:names.teams[1], date:names.date, tournament:'Friendly', country:names.teams[0], neutral:false},
          {home:names.teams[1], away:names.teams[2] || names.teams[0], date:names.date, tournament:'FIFA World Cup qualification', neutral:true}];
        const FC = fcFile(model, 'women', fxs);
        ok(FC.n > 20 && FC.bad.length === 0 && FC.file.lm.length >= names.teams.length && FC.withStakes === 2 && Object.values(FC.file.stakes).every(s => s.length === 5),
          'forecasts: with the forecast file the page gives the same chances, scores, stakes and goals figures without running the rating engine (' + FC.n + ' values)' + (FC.bad.length ? ' (' + FC.bad[0] + ')' : ''));
        model.run(`__fcf = ${JSON.stringify(JSON.stringify(FC.file))}`);
        const fo = model.run(`(() => { state.gender = 'women'; state.windowYears = DEFAULTS.windowYears; state.comps = new Set(COMP_ORDER); state.historicalNames = DEFAULTS.historicalNames; state.maxBand = DEFAULTS.maxBand; state.rankBy = DEFAULTS.rankBy;
          state.asOf = state.bounds.women.max; const F = JSON.parse(__fcf), ts = state.asOf, out = {};
          out.off = fcFileFor('women', ts) === null;
          state.useTableFiles = true; state.fcFiles = {women:F}; out.on = fcFileFor('women', ts) === F;
          out.past = fcFileFor('women', ts - 86400000) === null;
          state.historicalNames = !DEFAULTS.historicalNames; out.names = fcFileFor('women', ts) === F; state.historicalNames = DEFAULTS.historicalNames;   // period names off still reads the file (13 Nov 2026)
          state.fcFiles = {women:{...F, _ok:undefined, print:F.print + 1}}; out.stale = fcFileFor('women', ts) === null;   // _ok: the page remembers a file's fit, so the copy starts afresh
          state.useTableFiles = false; state.fcFiles = {}; gmCache = {};
          return out; })()`);
        ok(fo.off && fo.on && fo.past && fo.names && fo.stale, 'forecasts: the forecast file is used for today only, with period names on or off, and only when it fits the match list ' + JSON.stringify(fo)); }
      /* Stage 4, the era comparer: every year's closing table from one file gives the same sides, last five results and
         chances across eras, without the rating engine; a file from another match list is not used. */
      { const {yearEndsFile} = await import('./precompute.mjs');
        const YE = yearEndsFile(model, 'women');
        ok(YE.years > 0 && YE.rows > 0 && YE.n > 20 && YE.bad.length === 0, 'era comparer: every year\'s closing table read from the file equals the page\'s, and no engine runs (' + YE.n + ' values)' + (YE.bad.length ? ' (' + YE.bad[0] + ')' : ''));
        model.run(`__yef = ${JSON.stringify(JSON.stringify(YE.file))}`);
        const ye = model.run(`(() => { state.gender = 'women'; state.asOf = state.bounds.women.max; const F = JSON.parse(__yef), y = F.years[F.years.length - 1][0], out = {};
          const get = () => { dreamCache.clear(); return dreamTeams(y); };
          state.yeFiles = {women:F}; out.off = !get().fromFile;
          state.useTableFiles = true; out.on = get().fromFile === true;
          state.yeFiles = {women:{...JSON.parse(__yef), print:F.print + 1}}; out.stale = !get().fromFile;
          state.useTableFiles = false; state.yeFiles = {}; dreamCache.clear(); return out; })()`);
        ok(ye.off && ye.on && ye.stale, 'era comparer: the file is read in the published copy only, and only when it fits the match list ' + JSON.stringify(ye)); }
      /* Stage 4, a team's page on a past date: the goals figures from that year's file, and the chart from the long
         series (the first day of each quarter), the matches' files (the team's match days) and the day's table (the
         date itself), all equal to the page's own and with no run of the rating engine. */
      /* Groundwork for taking the engine off the page (13 Nov 2026): with period names off the published copy still
         reads the files and shows today's names; the Predictor's "what this result would do" comes from its own file
         for listed fixtures; a past date under "all time" reads the all-time year files, today's all-time table file
         (each match's ratings) and the all-time series. */
      { const {dayCheck: dcA, tableFile: tfA, stakesFile, seriesDecadeFile: sdA, seriesAllCheck} = await import('./precompute.mjs');
        const clone = x => JSON.parse(JSON.stringify(x));
        const nm = model.run(`(() => { state.gender = 'women'; state.windowYears = DEFAULTS.windowYears; state.comps = new Set(COMP_ORDER); state.maxBand = DEFAULTS.maxBand; state.rankBy = DEFAULTS.rankBy;
          state.asOf = state.bounds.women.max; state.useTableFiles = false; state.tableFiles = {};
          const names = c => c.all.map(r => r.key + '=' + r.team).sort().join('|'), hist = c => [...c.history].map(([k, h]) => k + ':' + h.map(e => e.name + '>' + e.oppName).join(',')).sort().join('|');
          state.historicalNames = false; state.cache = {key:null}; const a = getRatings(), an = names(a), ah = hist(a);
          state.historicalNames = true; state.cache = {key:null}; const tf = JSON.parse(JSON.stringify(tableToFile(getRatings())));
          state.useTableFiles = true; state.tableFiles = {women:tf}; state.historicalNames = false; state.cache = {key:null};
          let runs = 0; const cr = computeRatings; computeRatings = function(){ runs++; return cr.apply(this, arguments); };
          let b; try { b = getRatings(); } finally { computeRatings = cr; }
          const out = {fromFile:!!b.fromFile, runs, same:names(b) === an, hist:hist(b) === ah, teams:b.all.length, first:fmtDate(state.bounds.women.min).slice(0, 4), top:b.all.slice(0, 3).map(r => r.team), next:fmtDate(state.asOf + 86400000)};
          state.useTableFiles = false; state.tableFiles = {}; state.historicalNames = true; state.cache = {key:null}; return out; })()`);
        ok(nm.fromFile && nm.runs === 0 && nm.same && nm.hist && nm.teams > 2, 'period names off: today\'s table is still read from its file, with the same names as the page works out and no engine run');
        const fxs = [{home:nm.top[0], away:nm.top[1], date:nm.next, tournament:'Friendly', country:nm.top[0], neutral:false}, {home:nm.top[1], away:nm.top[2], date:nm.next, tournament:'FIFA World Cup qualification', neutral:true}];
        const SF = stakesFile(model, 'women', fxs), ids = Object.keys(SF.file.win);
        ok(SF.bad.length === 0 && SF.entries >= 24 && ids.length === Object.keys(SF.file.all).length && Object.values(SF.file.win).every(s => s.length === 5 && s.every(x => x.length === 2))
          && ids.some(k => /\|1\|/.test(k)) && ids.some(k => /\|0\|/.test(k)),
          'predictor: what a result would do to both ratings is read from the stakes file for every listed pairing, in each venue and kind of match, under both windows, with no engine run (' + SF.n + ' values)' + (SF.bad.length ? ' (' + SF.bad[0] + ')' : ''));
        const TA = clone(tfA(model, 'women', true)), A2 = clone(A), prevA = [Y - 1, Y - 2].map(y => clone(dayTables(model, 'women', y, true))), midA = Math.max(0, A2.days.length - 2);
        const ac = dcA(model, 'women', A2, midA, 0, prevA, null, TA), ar = dcA(model, 'women', A2, midA, 0, prevA, {maxBand:150, rankBy:'lower'}, TA);
        ok(A2.window === 'all' && ac.n > 50 && ac.bad.length === 0 && ar.bad.length === 0 && dcA(model, 'women', A2, midA, 0, prevA, null, null).bad[0] === 'the page did not use the file',
          'all time on a past date: the table rebuilt from the all-time year file equals the page\'s own, each match\'s ratings included (from today\'s all-time table file), also when ranked again; without that file the page works it out (' + ac.n + ' values)' + (ac.bad.length ? ' (' + ac.bad[0] + ')' : ar.bad.length ? ' (' + ar.bad[0] + ')' : ''));
        const filesA = {}, rfilesA = {}; let sbadA = [];
        for (let dec = Math.floor(+nm.first / 10) * 10; dec <= Y - 1; dec += 10){ const R = sdA(model, 'women', dec, true); if (!R.file.stamps.length) continue; filesA[dec] = clone(R.file); rfilesA[dec] = clone(R.ranks); sbadA = sbadA.concat(R.bad); }
        const daysA = {[Y]:A2, [Y - 1]:prevA[0], [Y - 2]:prevA[1]}, dateA = (Y - 1) + '-09-20', sa = seriesAllCheck(model, 'women', [dateA], filesA, rfilesA, daysA, TA);
        const bentA = clone(filesA); for (const F of Object.values(bentA)) for (const P of F.pts) for (const row of P) row[1] += 3;
        ok(sbadA.length === 0 && Object.values(filesA).every(F => F.all === true) && sa.pts > 0 && sa.altPts > 0 && sa.bad.length === 0 && seriesAllCheck(model, 'women', [dateA], bentA, rfilesA, daysA, TA).bad.length > 0,
          'all time on a past date: the chart read from the all-time series and year files equals one pass of the model, under every band limit (' + sa.pts + ' points, ' + sa.altPts + ' under the other limits, ' + sa.edge + ' on a rounding edge); a changed figure shows' + (sbadA.length ? ' (' + sbadA[0] + ')' : sa.bad.length ? ' (' + sa.bad[0] + ')' : ''));
      }
      { const {goalsYears, goalsCheck, seriesDecadeFile, seriesCheck, seriesCount} = await import('./precompute.mjs');
        const GY = goalsYears(model, 'women'), gc = goalsCheck(model, 'women', GY, [Y - 2, Y - 1, Y].filter(y => GY[y]));
        ok(GY[Y] && GY[Y].v === 1 && GY[Y].year === Y && gc.n > 0 && gc.bad.length === 0,
          'past dates: the goals figures read from a year\'s file equal the page\'s own on dates across the year (' + gc.n + ' values)' + (gc.bad.length ? ' (' + gc.bad[0] + ')' : ''));
        const date = (Y - 1) + '-09-20', files = {}, ledgers = {[Y - 1]:matchLedger(model, 'women', Y - 1), [Y - 2]:matchLedger(model, 'women', Y - 2), [Y - 3]:matchLedger(model, 'women', Y - 3)};
        const days = {[Y]:D, [Y - 1]:dayTables(model, 'women', Y - 1, false), [Y - 2]:dayTables(model, 'women', Y - 2, false)};
        let made = 0, sbad = []; const rfiles = {};
        for (let dec = Math.floor((Y - 13) / 10) * 10; dec <= Y - 1; dec += 10){ const R = seriesDecadeFile(model, 'women', dec); if (!R.file.stamps.length) continue;   // a decade before the archive begins
          files[dec] = JSON.parse(JSON.stringify(R.file)); rfiles[dec] = JSON.parse(JSON.stringify(R.ranks)); made += R.n; sbad = sbad.concat(R.bad); }
        const last = Math.floor((Y - 1) / 10) * 10;
        ok(made > 0 && sbad.length === 0 && files[last].v === 1 && files[last].stamps.length === seriesCount(model, 'women', last) && files[last].pts.length === files[last].stamps.length && files[last].pts[0][0].length === 5
          && files[last].stamps.every(t => { const d = new Date(t); return d.getUTCDate() === 1 && d.getUTCMonth() % 3 === 0; }),
          'past charts: the long series holds every team on the first day of each quarter, equal to the page\'s own (' + made + ' values)' + (sbad.length ? ' (' + sbad[0] + ')' : ''));
        const rledgers = Object.fromEntries(Object.entries(ledgers).map(([y, L]) => [y, {v:1, year:+y, rows:L.ranks}]));
        const sc = seriesCheck(model, 'women', [date], files, ledgers, days, {rfiles, rledgers});
        const bentRF = JSON.parse(JSON.stringify(rfiles)); for (const F of Object.values(bentRF)) for (const P of F.pts) for (const row of P) for (let k = 1; k < row.length; k++) if (row[k]) row[k] += 2;
        ok(sc.altPts > 0 && sc.bad.length === 0 && seriesCheck(model, 'women', [date], files, ledgers, days, {rfiles:bentRF, rledgers}).bad.length > 0,
          'past charts: under every other band limit the ranks read from the ranks files equal the page\'s own (' + sc.altPts + ' ranks), and a changed one shows' + (sc.bad.length ? ' (' + sc.bad[0] + ')' : ''));
        ok(sc.pts > 0 && sc.bad.length === 0, 'past charts: every team\'s chart for a past date, read from the files, has the same points, figures and ranks as the page\'s own, with no run of the engine (' + sc.pts + ' points, ' + sc.edge + ' on a rounding edge)' + (sc.bad.length ? ' (' + sc.bad[0] + ')' : ''));
        const bentS = JSON.parse(JSON.stringify(files)); for (const row of bentS[last].pts[0]) row[1] += 3;
        const bentL = JSON.parse(JSON.stringify(ledgers)); for (const F of Object.values(bentL)) for (const r of F.rows){ r[20] += 3; r[24] += 3; }
        ok(seriesCheck(model, 'women', [date], bentS, ledgers, days).bad.length > 0 && seriesCheck(model, 'women', [date], files, bentL, days).bad.length > 0,
          'past charts: a changed figure in the long series or in a match day\'s closing figures shows');
        model.run(`__pc = ${JSON.stringify(JSON.stringify({files, ledgers, days, date}))}`);
        const pc = model.run(`(() => { state.gender = 'women'; state.windowYears = DEFAULTS.windowYears; state.comps = new Set(COMP_ORDER); state.confs = new Set(); state.historicalNames = DEFAULTS.historicalNames;
          state.maxBand = DEFAULTS.maxBand; state.rankBy = DEFAULTS.rankBy; const X = JSON.parse(__pc), ao = Date.parse(X.date + 'T00:00:00Z'), out = {}, route = state.route;
          const set = (S) => { state.seriesFiles = {}; for (const [k, F] of Object.entries(S)) state.seriesFiles['women|' + k] = JSON.parse(JSON.stringify(F)); };
          state.asOf = ao; state.cache = {key:null}; state.dayCache = null; pubCache.key = null; state.route = 'team';
          const engine = getRatings().all.filter(r => !r.island && r.band <= 250).length;
          for (const [y, F] of Object.entries(X.ledgers)) state.ledgerFiles['women|' + y] = ledgerIndex(F);
          for (const [y, F] of Object.entries(X.days)) state.dayFiles['women|' + y] = F;
          set(X.files); out.off = snapsPast(snapKey()) === null;
          state.useTableFiles = true; state.cache = {key:null};
          let runs = 0; const rw = runWindow; runWindow = function(){ runs++; return rw.apply(this, arguments); };
          try {
            const S = snapsPast(snapKey()); out.on = !!S && S.fromFile === true && S.past === true && S.stamps[S.stamps.length - 1] === ao && S.stamps.length === pastStamps(ao).length + 1 && S.stamps.length > 1;
            out.band = Math.abs(bandCount(250) - engine) <= 1 && bandCount(0) >= engine;   // the table keeps a band to one decimal place: a team exactly on the limit can fall either side
            out.noRun = runs === 0;
            const dec = Object.keys(X.files).sort().pop(), stale = JSON.parse(JSON.stringify(X.files)); stale[dec].print += 1; set(stale); out.stale = snapsPast(snapKey()) === null;
            const short = JSON.parse(JSON.stringify(X.files)); delete short[dec]; set(short); out.missing = snapsPast(snapKey()) === null;
            set(X.files); state.maxBand = 300; out.setting = !(snapFileOk() && siteSettings()); state.maxBand = DEFAULTS.maxBand;
          } finally { runWindow = rw; }
          state.useTableFiles = false; state.ledgerFiles = {}; state.dayFiles = {}; state.seriesFiles = {}; state.dayCache = null; state.route = route;
          state.asOf = state.bounds.women.max; state.cache = {key:null}; pubCache.key = null;
          return out; })()`);
        ok(pc.off && pc.on && pc.band && pc.noRun && pc.stale && pc.missing && pc.setting,
          'past charts: the files are read in the published copy only, need every decade the window reaches and the same match list, and the count of teams inside a band limit comes from the table in view ' + JSON.stringify(pc)); 
        /* Best rank and peak rating to the day (Seb, 13 Nov 2026): from the match-day tables alone, the best rank a
           team held on any day of the twelve years ending on any date, under every band limit and in each order, and
           its highest rating. The lists equal a plain scan of the team's own daily series; on a date in view the
           page's own table can never beat them; a worsened file is caught; the page reads a file only when it fits. */
        { const {bestSeries, bestCheck} = await import('./precompute.mjs');
          const BD = model.run('state.bounds.women'), y0 = new Date(BD.min).getUTCFullYear(), dfs = {};
          for (let y = y0; y <= Y; y++) dfs[y] = y === Y ? D : JSON.parse(JSON.stringify(dayTables(model, 'women', y, false)));
          const BS = bestSeries(y => dfs[y] || null, {first:y0, last:Y, lastDay:Math.round(BD.max / 86400000), bands:model.run('BAND_OPTIONS'), cut:model.run('BAND_Z*RD_MAX')});
          const print = model.run('matchListPrint(state.matches.women)'), bfiles = Object.fromEntries([...BS.teams].map(([key, v]) => [key, {v:1, g:'women', key, asOf:BD.max, print, bands:model.run('BAND_OPTIONS'), ...v}]));
          const today = new Date(BD.max).toISOString().slice(0, 10), bc = bestCheck(model, 'women', [today, date], bfiles, dfs);
          const worse = JSON.parse(JSON.stringify(bfiles)); for (const F of Object.values(worse)){ for (const L of F.r) for (const x of L) if (x[1]) x[1] += 7; for (const x of F.pk) if (x[1] !== null) x[1] -= 50; }
          const names = model.run(`${JSON.stringify(Object.keys(bfiles))}.map(bestFileName)`);
          ok(BS.teams.size > 0 && BS.n > 0 && BS.bad.length === 0 && bc.n > 0 && bc.bad.length === 0 && bestCheck(model, 'women', [today], worse, dfs).bad.length > 0
            && new Set(names).size === names.length && names.every(x => /^[A-Za-z0-9-]+$/.test(x)),
            'best to the day: a team\'s best rank and peak rating over every day of the window, from the match-day tables, equal a plain scan (' + BS.n + ' answers) and agree with the page\'s table for the day under all twelve settings (' + bc.n + ' compared, ' + bc.held + ' exactly); a worsened file is caught' + (BS.bad.length ? ' (' + BS.bad[0] + ')' : bc.bad.length ? ' (' + bc.bad[0] + ')' : '')); }
      }
    }
  }
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
// --- unit: upset alerts
{
  const {findUpsets, alertText} = await import('./upset-alerts.mjs');
  const now = Date.parse('2026-11-28T23:00:00Z');
  const es = [{id:'w|2026-11-28|Jamaica|Haiti', g:'women', date:'2026-11-28', home:'Jamaica', away:'Haiti', tournament:'Friendly', p:[0.62, 0.22, 0.16], result:[1, 2]},
    {id:'m|2026-11-28|Spain|Malta', g:'men', date:'2026-11-28', home:'Spain', away:'Malta', tournament:'Friendly', p:[0.9, 0.07, 0.03], result:[3, 0]},
    {id:'m|2026-11-28|C|D', g:'men', date:'2026-11-28', home:'C', away:'D', tournament:'Friendly', p:[0.85, 0.1, 0.05], result:[1, 1]},
    {id:'m|2026-11-20|A|B', g:'men', date:'2026-11-20', home:'A', away:'B', tournament:'Friendly', p:[0.9, 0.07, 0.03], result:[0, 1]}];
  const u = findUpsets(es, [], now);
  ok(u.length === 1 && u[0].e.home === 'Jamaica', 'upset alerts: only a recent win by a side under 20% (no draws, no old matches)');
  ok(findUpsets(es, ['w|2026-11-28|Jamaica|Haiti'], now).length === 0, 'upset alerts: an upset already posted is not posted again');
  ok(/Haiti a 16% chance/.test(alertText(u[0]).text), 'upset alerts: the text gives the winner\'s chance');
}
/* Kick-off times on social posts: Toronto and UK time, with the weekday where a zone is on another day. */
{
  const {koText, BUILD:SB} = await import('./social.mjs');
  { /* The accuracy post only claims a lead where there is one. */
    const base = {type:'record', g:'men', since:2019, to:2026, n:7322, dec:5638, years:8, live:null};
    const level = SB.record({...base, hit:[79.07, 78.99, 75.98], score:[23.2, 21.4, 17.2], ahead:[0, 8, 8], split:[null, {n:316, us:106, them:102, draw:108}, {n:965, us:442, them:268, draw:255}]});
    ok(/level with World Elo and ahead of the FIFA method/.test(level.caption) && level.slides.length === 3 && !/Formline and World Elo: 316/.test(level.alts.join(' ')) && /Formline and FIFA method: 965/.test(level.alts.join(' ')),
      'social posts: the accuracy post says "level" for a lead under a point and leaves out a split that is not a clear win');
    const behind = SB.record({...base, hit:[76.0, 79.0, 75.5], score:[19, 21, 17], ahead:[0, 2, 6], split:[null, {n:300, us:90, them:120, draw:90}, {n:60, us:20, them:22, draw:18}]});
    ok(/behind World Elo and level with the FIFA method/.test(behind.caption) && behind.slides.length === 2 && /2 of the 8 years/.test(behind.alts[1]), 'social posts: the accuracy post says so when Formline is behind, and shows no split slide');
  }
  { /* The window recap brings in World Elo and the FIFA method only when Formline picked at least as many winners as both. */
    const w = {type:'windowRecord', mode:'final', g:'men', from:'2026-11-12', to:'2026-11-17', n:158, hits:104, tally:{n:158, dec:120, won:104, draws:38, close:12},
      byG:{men:{n:121, hits:79, dec:92, won:79, draws:29, close:9}, women:{n:37, hits:25, dec:28, won:25, draws:9, close:3}}, strong:{n:41, hits:37}, ups:[]};
    const up = SB.windowRecord({...w, cmp:{n:118, us:96, elo:93, fifa:88}}), down = SB.windowRecord({...w, mode:'mid', cmp:{n:118, us:90, elo:93, fifa:88}}), few = SB.windowRecord({...w, cmp:{n:12, us:11, elo:9, fifa:8}});
    ok(up.slides.length === 2 && /Formline 96, World Elo 93, FIFA method 88/.test(up.caption) && /12–17 November: Formline picked the winner in 104 of the 120 matches that had one \(87%\); 38 draws, 12 of which it had as toss-ups\./.test(up.caption) && /Men's: 79 of 92 winners picked/.test(up.caption) && /Draws it had as a toss-up<\/span><span><b>12<\/b> of 38/.test(up.slides[0]),
      'social posts: the window recap gives the winners picked, the draws apart and, when Formline led, the comparison');
    ok(down.slides.length === 1 && !/World Elo/.test(down.caption + down.xText) && /so far/.test(down.caption) && few.slides.length === 1, 'social posts: the window recap leaves the comparison out when Formline trailed either, or on too few matches');
  }
  { /* The day's roundup adds its "good day" slide only on a good day when Formline picked at least as many winners as both. */
    const row = (i, hit) => ({g:'men', home:'Home ' + i, away:'Away ' + i, hs:hit ? 2 : 0, as:hit ? 0 : 1, comp:'Friendly', hf:null, af:null, p:[60, 25, 15], call:0, o:hit ? 0 : 2, hit, top:i});
    const day = (hits, n, cmp) => SB.roundup({type:'roundup', g:'men', day:'2026-11-12', dayTxt:'Thursday 12 November', n, hits, tally:{n, dec:n, won:hits, draws:0, close:0}, list:Array.from({length:n}, (_, i) => ({...row(i, i < hits), v:i < hits ? 'right' : 'wrong'})), ups:[], big:null, win:{n, hits, dec:n, won:hits, draws:0, close:0}, cmp});
    const best = day(10, 12, {n:12, us:10, elo:9, fifa:8}), poor = day(6, 12, {n:12, us:6, elo:5, fifa:4}), behind = day(10, 12, {n:12, us:10, elo:11, fifa:8}), none = day(10, 12, null);
    ok(best.slides.length === poor.slides.length + 1 && /Formline 10, World Elo 9, FIFA method 8/.test(best.caption) && /Formline picked <em>10 of 12<\/em> winners yesterday/.test(best.slides[0]), 'social posts: a good day that beat World Elo and the FIFA method says so');
    ok(!/World Elo/.test(poor.caption + behind.caption + none.caption) && behind.slides.length === poor.slides.length && none.slides.length === poor.slides.length, 'social posts: no comparison on a poor day, or when Formline trailed, or without the figures');
  }
  { /* Draws: the day is summed up by the winners picked; a draw in a toss-up is marked as called close, any other draw as wrong. */
    const mk = (i, p, hs, as, v) => ({g:'men', home:'Home ' + i, away:'Away ' + i, hs, as, comp:'Friendly', hf:null, af:null, p, call:p.indexOf(Math.max(...p)), o:hs > as ? 0 : hs < as ? 2 : 1, hit:v === 'right', v, top:i});
    const list = [mk(0, [60, 25, 15], 2, 0, 'right'), mk(1, [55, 26, 19], 1, 0, 'right'), mk(2, [70, 19, 11], 3, 1, 'right'), mk(3, [20, 27, 53], 0, 2, 'right'), mk(4, [48, 28, 24], 2, 1, 'right'),
      mk(5, [39, 31, 30], 1, 1, 'close'), mk(6, [59, 25, 16], 1, 1, 'wrong'), mk(7, [62, 22, 16], 0, 1, 'wrong')];
    const post = SB.roundup({type:'roundup', g:'men', day:'2026-11-12', dayTxt:'Thursday 12 November', n:8, hits:5, tally:{n:8, dec:6, won:5, draws:2, close:1}, list, ups:[], big:null, win:{n:8, hits:5, dec:6, won:5, draws:2, close:1}, cmp:null});
    ok(/Formline picked the winner in 5 of the 6 matches that had one; 2 draws, 1 of which it had as a toss-up\./.test(post.caption) && (post.caption.match(/🟡/g) || []).length === 1 && (post.caption.match(/❌/g) || []).length === 2
      && /Formline picked <em>5 of 6<\/em> winners/.test(post.slides[0]) && /&asymp;/.test(post.slides[0]) && /5 of 6 winners picked/.test(post.title),
      'social posts: a day with draws counts winners picked, and marks a toss-up draw as called close');
    const {callVerdict:cv, callCounts:cc, drawsLine:dl} = await import('./pages.mjs');
    const page = model => model.run(`[callVerdict([0.39, 0.31, 0.30], 1), callVerdict([0.45, 0.30, 0.25], 1), callVerdict([0.45, 0.30, 0.25], 0), callVerdict([0.34, 0.31, 0.35], 0), JSON.stringify(callCounts([{p:[0.39, 0.31, 0.30], outcome:1}, {p:[0.6, 0.25, 0.15], outcome:1}, {p:[0.6, 0.25, 0.15], outcome:0}, {p:[0.6, 0.25, 0.15], outcome:2}]))]`);
    const {loadModel:lm} = await import('./lib/model.mjs'), got = page(lm(path.join(HERE, '..', 'index.html')));
    ok(got.slice(0, 4).join() === 'close,wrong,right,wrong' && got[4] === JSON.stringify({n:4, decided:2, won:1, draws:2, close:1})
      && [cv([0.39, 0.31, 0.30], 1), cv([0.45, 0.30, 0.25], 1), cv([0.45, 0.30, 0.25], 0), cv([0.34, 0.31, 0.35], 0)].join() === 'close,wrong,right,wrong'
      && JSON.stringify(cc([{p:[0.39, 0.31, 0.30], outcome:1}, {p:[0.6, 0.25, 0.15], outcome:1}, {p:[0.6, 0.25, 0.15], outcome:0}, {p:[0.6, 0.25, 0.15], outcome:2}])) === got[4]
      && dl({draws:5, close:2}) === '5 draws, 2 of which Formline had as toss-ups' && dl({draws:1, close:1}) === '1 draw, which Formline had as a toss-up' && dl({draws:0, close:0}) === 'no draws',
      'draws: a drawn toss-up is called close, any other draw is wrong, and the site and the static pages agree');
  }
  ok(koText('2026-11-12T19:45:00+00:00', '2026-11-12') === '2:45 PM ET · 7:45 PM UK', 'social posts: a kick-off is given in Toronto and UK time');
  ok(koText('2026-11-13T00:30:00+00:00', '2026-11-12') === '7:30 PM ET · 12:30 AM UK (Fri)', 'social posts: a zone where the match is on another day says which day');
  ok(koText('2026-06-11T19:00:00+00:00', '2026-06-11') === '3:00 PM ET · 8:00 PM UK' && koText('', '2026-06-11') === '', 'social posts: summer time in both zones, and no text without a kick-off');
}
console.log('\n' + passed + ' checks passed');
