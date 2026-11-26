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
  { /* A box with no kick-off time never moves a fixture's date, stadium or not (the Africa Cup qualifiers of 17 Nov 2026
       stood as 15 Nov on Wikipedia with the stadium filled in); one with a time does. Its venue counts either way. */
    const box = (st, time) => "{{Football box collapsible|date={{Start date|2026|11|11}}" + (time ? '|time={{UTZ|19:00|+9}}' : '') + "|team1={{fb-rt|JPN}}|score=|team2={{fb|BRA}}|stadium=" + st + "|location=TBD, [[Japan]]}}";
    const fxT = {date:'2026-11-13', home_team:'Japan', away_team:'Brazil'};
    const mT = W.findMatch(W.pageMatches(box('TBD')), fxT);
    ok(mT && mT.moved && mT.stadium === '' && mT.city === '' && mT.country === 'Japan' && !mT.kickoff, 'Wikipedia: a TBD box is still matched to the fixture, TBD read as nothing');
    const cacheOf = st => ({titlesV:2, titles:{'men|Japan':{title:'J', checked:'2026-11-01'}, 'men|Brazil':{title:'', checked:'2026-11-01'}},
      pages:{J:{fetched:'2026-11-01', matches:W.pageMatches(box(...st))}}, comps:{}});
    const run = async (...st) => (await W.wikiVenues([{api_id:3, gender:'men', ...fxT}], cacheOf(st), {fetchImpl:null, today:'2026-11-01', cities, cityKey:ck, toArchive:x => x})).found.get('3');
    const t3 = await run('TBD'), t4 = await run('[[Saitama Stadium 2002]]'), t5 = await run('[[Saitama Stadium 2002]]', true);
    ok(!t3 || !t3.date, 'Wikipedia: a box with no stadium and no time does not move the date');
    ok(t4 && !t4.date && t4.country === 'Japan', 'Wikipedia: a box with a stadium but no time gives the venue and leaves the date alone');
    ok(t5 && t5.date === '2026-11-11', 'Wikipedia: a box with a kick-off time moves the date');
    /* Two friendlies in a week, only the first on the page: its box is not taken for the second. */
    const two = [{api_id:3, gender:'men', date:'2026-11-11', home_team:'Japan', away_team:'Brazil'}, {api_id:4, gender:'men', date:'2026-11-14', home_team:'Japan', away_team:'Brazil'}];
    const F2 = (await W.wikiVenues(two, cacheOf(['[[Saitama Stadium 2002]]', true]), {fetchImpl:null, today:'2026-11-01', cities, cityKey:ck, toArchive:x => x})).found;
    ok(F2.get('3') && !F2.get('4'), 'Wikipedia: the first match\'s box is not used for the second match between the same teams');
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
  ok(W.boxKickoff('2026-11-16', '19:30 [[UTC−10:00|UTC−10]]') === '2026-11-17T05:30:00+00:00' && W.boxKickoff('2026-11-15', '20:00 [[Central European Time|CET]] ([[UTC+01:00|UTC+1]])') === '2026-11-15T19:00:00+00:00' &&
    W.boxKickoff('2026-11-15', '17:30 [[UTC+05:30|UTC+5:30]]') === '2026-11-15T12:00:00+00:00' && W.boxKickoff('2026-11-15', '16:00 [[Greenwich Mean Time|GMT]]') === '2026-11-15T16:00:00+00:00' &&
    W.boxKickoff('2026-11-15', '7:30 pm UTC-4') === '2026-11-15T23:30:00+00:00', 'Wikipedia: kick-off from a time written with its zone as text (19:30 UTC−10 on 16 Nov is 05:30 UTC on the 17th)');
  ok(W.boxKickoff('2026-11-15', '19:30 local (05:30 UTC)') === null && W.boxKickoff('2026-11-15', '20:00 [[UTC+2]] / 19:00 [[UTC+1]]') === null && W.boxKickoff('2026-11-15', '19:30 [[Tahiti Time|TAHT]]') === null,
    'Wikipedia: two times, two offsets or a zone by name only: no kick-off taken');
  { const tb = W.pageMatches("{{Football box collapsible |date={{Start date|2026|11|16}} |time=19:30 [[Tahiti Time|TAHT]] |team1={{fb-rt|TAH}} |team2={{fb|COK}} |stadium=[[Stade Louis Ganivet]] |location=[[Faʼaʼā]], Tahiti }}", '2026-11-01')[0];
    ok(tb && tb.timed === 1 && !tb.kickoff && tb.tm === '19:30 TAHT', 'Wikipedia: a time the reader cannot use is kept as the page words it'); }
  const odd = W.pageMatches("{{Football box |date={{Start date|2026|11|13}} |team1={{fb-rt|MSR}} |team2={{fb|NCA}} |stadium=[[Estadio Cibao FC]], [[Santiago de los Caballeros|Santiago]], Dominican Republic }}" +
    "{{Football box |date={{Start date|2026|11|17}} |team1={{fb-rt|BLZ}} |team2={{fb|SMA}} |stadium=[[Arnos Vale Stadium]], [[Kingstown]] (Saint Vincent and the Grenadines) }}" +
    "{{Football box |date={{Start date|2026|11|14}} |team1={{fb-rt|HAI}} |team2={{fb|USA}} |stadium=[[Nu Stadium]], [[Miami]], (United States){{refn|group=note|Haiti played at home in Miami}} }}");
  ok(odd[0].city === 'Santiago' && odd[0].country === 'Dominican Republic' && odd[1].city === 'Kingstown' && odd[1].country === 'Saint Vincent and the Grenadines'
    && odd[2].city === 'Miami' && odd[2].country === 'United States' && odd[2].stadium === 'Nu Stadium', 'Wikipedia: a country after the city, or in brackets, read from the stadium field');
  ok(W.boxTeam('Mexico {{#invoke:flag|deco|MEX}}') === 'MEX' && W.boxTeam('{{#invoke:flag|deco|JAM}}') === 'JAM', 'Wikipedia: teams written with flag modules');
  ok(W.boxTeam('{{fb|ESW}}') === 'SWZ' && W.boxTeam('{{fb-rt|SER}}') === 'SRB' && W.boxTeam('{{fb|FAR}}') === 'FRO' && W.boxTeam('{{fb|SXM}}') === 'SMA' && W.boxTeam('{{fb|BON}}') === 'BOE' && W.boxTeam('{{fb|SWZ}}') === 'SWZ',
    'Wikipedia: other codes its pages use for Eswatini, Serbia, the Faroe Islands, Sint Maarten and Bonaire');
  { const kept = {pages:{A:{matches:[{t1:'FAR', t2:'MDA'}]}}, resultPages:{B:{results:[{t1:'SER', t2:'GRE'}], upcoming:[{t1:'SUR', t2:'ESW'}]}}}; W.recode(kept);
    ok(kept.pages.A.matches[0].t1 === 'FRO' && kept.resultPages.B.results[0].t1 === 'SRB' && kept.resultPages.B.upcoming[0].t2 === 'SWZ' && kept.resultPages.B.upcoming[0].t1 === 'SUR',
      'Wikipedia: pages kept from an earlier read take a code learnt since'); }
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
  // the men's pages share the cache with the women's: each gender reads only its own, and fixtures still to come are handed back
  const pagesM = {'Lebanon national football team':box('2026-11-06', 'IRQ', '0–0', 'LBN', '', '', '[[Basra]], Iraq', '2026 Basra International Tournament') + box('2026-11-17', 'LBN', 'v', 'PLE', '', '', '[[Basra]], Iraq')};
  const fakeM = async url => { const q = new URL(url).searchParams; return {ok:true, json:async () => ({parse:{wikitext:pagesM[q.get('page')] || ''}})}; };
  const teamsM = new Set(['Lebanon', 'Iraq', 'Palestine', 'Gabon', 'Congo', 'Central African Republic']);
  for (const t of ['Lebanon', 'Iraq']) cache.titles['men|' + t] = {title:'', name:t, main:t + ' national football team', checked:'2026-11-08'};
  const knownM = [{date:'2026-10-01', home_team:'Lebanon', away_team:'Iraq'}];
  const m1 = await R.wikiResults({g:'men', known:knownM, teams:teamsM, cache, fetchImpl:fakeM, today:'2026-11-08', toArchive:x => x});
  const m2 = await R.wikiResults({g:'men', known:knownM, teams:teamsM, cache, fetchImpl:fakeM, today:'2026-11-10', toArchive:x => x});
  ok(m1.rows.length === 0 && m2.rows.length === 1 && m2.rows[0].home_team === 'Iraq' && m2.rows[0].away_team === 'Lebanon' && m2.rows[0].home_score === 0,
    'Wikipedia results, men: the women\'s pages in the same cache add nothing; a one-page result is added after two days (Iraq 0–0 Lebanon)');
  // a team's own two pages are one voice; and no second match for a team on a day it already has one
  const cache2 = {titles:{'men|Lebanon':{title:'Lebanon national football team results (2020–present)', name:'Lebanon', main:'Lebanon national football team', checked:'2026-11-08'}}};
  const both2 = pagesM['Lebanon national football team'];
  const fake2 = async url => ({ok:true, json:async () => ({parse:{wikitext:both2}})});
  const o1 = await R.wikiResults({g:'men', known:knownM, teams:teamsM, cache:cache2, fetchImpl:fake2, today:'2026-11-08', toArchive:x => x});
  const o2 = await R.wikiResults({g:'men', known:knownM.concat([{date:'2026-11-06', home_team:'Iraq', away_team:'Palestine'}]), teams:teamsM, cache:cache2, fetchImpl:fake2, today:'2026-11-10', toArchive:x => x});
  ok(o1.rows.length === 0 && o1.stats.unconfirmed === 1 && o2.rows.length === 0 && o2.stats.clash === 1,
    'Wikipedia results: a team\'s main and results pages do not confirm each other; a result is not added for a team that already has a match that day');
  ok(m1.upcoming.length === 1 && m1.upcoming[0].home_team === 'Lebanon' && m1.upcoming[0].away_team === 'Palestine' && m1.upcoming[0].date === '2026-11-17' && r1.upcoming.some(x => x.home_team === 'Gabon' && x.away_team === 'Chad'),
    'Wikipedia results: fixtures still to come on a team\'s page are handed back (Lebanon v Palestine)');
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
  { const {manualRows} = await import('./update.mjs');
    const have = [{date:'2020-01-03', home_team:'A', away_team:'B', home_score:'1', away_score:'1'}];
    const kept = manualRows([{date:'2020-01-01', home_team:'A', away_team:'B', home_score:'2', away_score:'0'},
      {date:'2020-01-01', home_team:'B', away_team:'A', home_score:'0', away_score:'2', separate:'TRUE'},
      {date:'2020-01-02', home_team:'B', away_team:'A', home_score:'1', away_score:'1', separate:'TRUE'}], have);
    ok(kept.length === 1 && kept[0].separate === 'TRUE' && kept[0].home_score === '0', 'a hand-added match marked separate stays beside another between the same teams two days on, unless the score is the same'); }
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
  /* Three matches only Wikipedia lists sit in the store: one today with no time, one dated yesterday whose kick-off is
     today by UTC (an evening match in the Pacific), one dated yesterday with no time, and one two days old. */
  { const sf = path.join(root, 'build/store/fixtures.json'), S = JSON.parse(fs.readFileSync(sf, 'utf8'));
    const wk = (date, kickoff, h, a) => ({date, kickoff, home_team:h, away_team:a, tournament:'Friendly', city:'', country:'', neutral:'', venue_id:'', api_id:'wiki:men|' + date + '|' + h + '|' + a,
      league:'Friendly', unmapped_tournament:'', tbd:'', tbc:kickoff ? '' : 1, gender:'men', wikiOnly:1, wikiSource:'X', pairDates:[date], wiki:{city:'', country:'', stadium:''}});
    for (const r of [wk('2026-10-08', '', 'Gambia', 'Zambia'), wk('2026-10-07', '2026-10-08T05:30:00+00:00', 'Zambia', 'Argentina'), wk('2026-10-07', '', 'Gambia', 'Argentina'), wk('2026-10-06', '', 'Argentina', 'Zambia')]) S[r.api_id] = r;
    fs.writeFileSync(sf, JSON.stringify(S)); }
  const sl2 = await run();
  ok(!sl2.idle && sl2.mode === 'light' && asked.filter(a => a === '/fixtures').length === 3 && sl2.api.budget === 60, 'light run on a match day asks about three days');
  { const F = JSON.parse(fs.readFileSync(path.join(root, 'data/fixtures.json'), 'utf8')).men.filter(x => x.src === 'wiki').map(x => x.date + ' ' + x.home + ' v ' + x.away + (x.tbc ? ' tbc' : '')).sort().join('; ');
    ok(F === '2026-10-07 Gambia v Argentina tbc; 2026-10-07 Zambia v Argentina; 2026-10-08 Gambia v Zambia tbc',
      'a match only Wikipedia lists survives the match-day runs: kept on its day, on the day its kick-off falls by UTC, and one day more with no time known (' + F + ')');
    const sf = path.join(root, 'build/store/fixtures.json'), S = JSON.parse(fs.readFileSync(sf, 'utf8'));
    for (const k of Object.keys(S)) if (S[k].wikiOnly) delete S[k];
    fs.writeFileSync(sf, JSON.stringify(S)); }
  /* A forecast lost to that fault is put back from build/store/forecast-restore.json once its kick-off has passed, and
     scored against a result held by hand (or from Wikipedia), which the record used not to look at. */
  { const mf = path.join(root, 'build/store/manual-men.csv'), had = fs.existsSync(mf) ? fs.readFileSync(mf, 'utf8') : null;
    fs.writeFileSync(mf, 'date,home_team,away_team,home_score,away_score,tournament,city,country,neutral,shootout_winner,source,separate\n2026-10-06,Argentina,Zambia,2,1,Friendly,Buenos Aires,Argentina,FALSE,,test,\n');
    const rf = path.join(root, 'build/store/forecast-restore.json');
    fs.writeFileSync(rf, JSON.stringify([{id:'men|2026-10-06|Argentina|Zambia', g:'men', date:'2026-10-06', kickoff:'2026-10-06T18:00:00+00:00', home:'Argentina', away:'Zambia', tournament:'Friendly',
      made:'2026-10-05T06:00:00Z', updated:'2026-10-05T06:00:00Z', p:[0.7, 0.2, 0.1], xg:[2, 0.5], likely:'2-0', side:1, ratings:[1, 2], bands:[1, 1], asOf:'2026-10-05', result:null, restored:'test'},
      {id:'men|2026-12-01|Argentina|Gambia', g:'men', date:'2026-12-01', kickoff:'2026-12-01T18:00:00+00:00', home:'Argentina', away:'Gambia', p:[0.5, 0.3, 0.2], result:null, restored:'not yet'}]));
    process.env.NOW = '2026-10-08T12:00:00Z'; await run(); delete process.env.NOW;
    const R = JSON.parse(fs.readFileSync(path.join(root, 'data/forecasts.json'), 'utf8')).entries, e = R.find(x => x.id === 'men|2026-10-06|Argentina|Zambia');
    ok(e && e.restored === 'test' && e.result && e.result.join() === '2,1' && e.outcome === 0 && !R.some(x => x.id === 'men|2026-12-01|Argentina|Gambia'),
      'a forecast lost to a fault is put back after kick-off and scored against a hand-added result; one not yet kicked off is left alone');
    fs.unlinkSync(rf); if (had === null) fs.unlinkSync(mf); else fs.writeFileSync(mf, had);
    const ff = path.join(root, 'data/forecasts.json'); fs.writeFileSync(ff, JSON.stringify({built:'x', entries:R.filter(x => !x.restored)})); }
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
  const r6 = placeRow({home_team:'Palestine', away_team:'Iran', tournament:'Friendly', city:'', home_score:'0', away_score:'2', wiki_country:'Iraq', date:'2026-11-14'}, {}, cc);
  ok(r6.neutral === 'TRUE' && r6.country === 'Iraq' && r6.venue_src === 'wiki', 'a held result keeps the country Wikipedia gave: Palestine v Iran in Iraq is neutral');
  const zc = cityCountries([{city:'Zanzibar City', country:'Zanzibar'}]);
  const r7 = placeRow({home_team:'Tanzania', away_team:'Nigeria', tournament:'African Cup of Nations qualification', city:'Zanzibar City', date:'2026-11-17'}, {}, zc);
  const r8 = placeRow({home_team:'Zanzibar', away_team:'Kenya', tournament:'Friendly', city:'Zanzibar City', date:'2026-11-17'}, {}, zc);
  const r9 = placeRow({home_team:'Sudan', away_team:'Uganda', tournament:'Friendly', city:'Zanzibar City', date:'2026-11-17'}, {}, zc);
  ok(r7.country === 'Tanzania' && r7.neutral === 'FALSE' && r8.country === 'Zanzibar' && r8.neutral === 'FALSE' && r9.country === 'Zanzibar' && r9.neutral === 'TRUE',
    'Tanzania playing in Zanzibar is at home; Zanzibar\'s own matches and other teams\' there are as before');
}
// --- unit: the cross-check against API-Football (lib/apiaudit.mjs)
{
  const AU = await import('./lib/apiaudit.mjs');
  const held = AU.heldIndex({men:[{date:'2024-07-07', home_team:'Angola', away_team:'Namibia', home_score:'5', away_score:'0'}, {date:'2024-07-05', home_team:'Namibia', away_team:'Mozambique', home_score:'1', away_score:'0'}], women:[]});
  const fakeMap = f => f.skip ? {skip:f.skip} : {kind:f.kind || 'result', gender:'men', row:{date:f.date, home_team:f.h, away_team:f.a, home_score:f.hs, away_score:f.as, tournament:'COSAFA Cup', league:'COSAFA Cup', api_id:f.id}};
  const day = [{id:1, date:'2024-07-07', h:'Angola', a:'Namibia', hs:5, as:0}, {id:2, date:'2024-07-06', h:'Mozambique', a:'Namibia', hs:0, as:0}, {id:3, date:'2024-07-07', h:'Lesotho', a:'Seychelles', hs:1, as:1}, {id:4, date:'2024-07-07', h:'X', a:'Y', hs:1, as:0, kind:'fixture'}, {skip:'youth'}];
  const C = AU.compareDay(day, held, {mapFixture:fakeMap});
  ok(C.results === 3 && C.missing.length === 1 && C.missing[0].home === 'Lesotho' && C.diffs.length === 1 && C.diffs[0].score === '0-0' && C.diffs[0].held === '0-1' && C.diffs[0].heldDate === '2024-07-05',
    'cross-check: a match the site lacks is listed as missing, one held with another score as a difference (the other way round and a day apart included), a held one is passed over');
  ok(AU.auditDays({}, {end:'2026-10-06', from:'2026-10-04', perRun:5}).join() === '2026-10-06,2026-10-05,2026-10-04' && AU.auditDays({cursor:'2026-09-30'}, {end:'2026-10-06', from:'2014-11-01', perRun:2}).join() === '2026-09-30,2026-09-29'
    && AU.auditDays({done:'2026-12-01', recent:'2026-06-10'}, {end:'2026-10-06', from:'2014-11-01', perRun:300, again:3}).join() === '2026-06-10,2026-06-09,2026-10-06',
    'cross-check: the sweep works back from the archive\'s last day, picks up where it stopped, and once done goes round the last 120 days');
  const asked = [], client = {covers:() => true, fixturesOn: async d => { asked.push(d); return d === '2024-07-07' ? day : asked.length > 3 ? null : []; }};
  const state = {}, report = {};
  const S1 = await AU.sweep({client, state, report, held, today:'2026-11-15', end:'2024-07-07', from:'2024-07-01', perRun:10, mapFixture:fakeMap});
  ok(S1.asked === 3 && S1.stopped === 'request budget used up' && state.cursor === '2024-07-04' && report.missing.length === 1 && report.diffs.length === 1 && report.days === 3, 'cross-check: a run stops at the request budget and remembers where');
  const held2 = AU.heldIndex({men:[{date:'2024-07-07', home_team:'Angola', away_team:'Namibia', home_score:'5', away_score:'0'}, {date:'2024-07-06', home_team:'Mozambique', away_team:'Namibia', home_score:'0', away_score:'0'}, {date:'2024-07-07', home_team:'Seychelles', away_team:'Lesotho', home_score:'2', away_score:'1'}], women:[]});
  const S2 = await AU.sweep({client:{covers:() => true, fixturesOn: async () => []}, state, report, held:held2, today:'2026-11-16', end:'2024-07-07', from:'2024-07-01', perRun:10, mapFixture:fakeMap});
  ok(report.missing.length === 0 && report.diffs.length === 1 && report.diffs[0].home === 'Lesotho' && report.diffs[0].held === '1-2' && state.done === '2026-11-16' && S2.open.diffs === 1,
    'cross-check: an entry the site now holds drops out, one it now holds with another score becomes a difference, and the sweep ends at its first day');
  // 15 Nov 2026: the held matches carry the site's corrections, and entries settled as the feed's mistake stay out
  const arch = [{date:'2026-06-04', home_team:'Guatemala', away_team:'Czech Republic', home_score:'1', away_score:'5'}, {date:'1960-11-03', home_team:'United States', away_team:'Mexico', home_score:'3', away_score:'3'},
    {date:'2026-03-31', home_team:'Czech Republic', away_team:'Denmark', home_score:'2', away_score:'2'}, {date:'2000-01-01', home_team:'A', away_team:'B', home_score:'1', away_score:'0'}];
  const fixes = {men:[{date:'2026-06-04', home:'Guatemala', away:'Czech Republic', score:'1-5', set:{hs:1, as:3}}, {date:'1960-11-03', home:'United States', away:'Mexico', score:'3-3', set:{ts:Date.parse('1960-11-06T00:00:00Z')}},
    {date:'2000-01-01', home:'A', away:'B', drop:1}, {date:'2026-03-31', home:'Czech Republic', away:'Denmark', score:'9-9', set:{hs:0, as:0}}]};
  const H = AU.heldIndex({men:arch, women:[]}, fixes), at = (a, b) => H.men.get([a, b].sort().join('|'));
  ok(at('Guatemala', 'Czech Republic')[0].as === 3 && Math.round(Date.parse('1960-11-06T00:00:00Z') / 864e5) === at('United States', 'Mexico')[0].d && !at('A', 'B') && at('Czech Republic', 'Denmark')[0].hs === 2,
    'cross-check: held matches take the site\'s corrected score or date, a dropped row is left out, and a correction for another score is not applied');
  const day2 = [{id:11, date:'2026-06-05', h:'Czech Republic', a:'Guatemala', hs:3, as:1}, {id:12, date:'2026-03-31', h:'Czech Republic', a:'Denmark', hs:1, as:1}, {id:13, date:'2026-06-05', h:'Barbados', a:'Elsewhere', hs:1, as:0}];
  const C2 = AU.compareDay(day2, H, {mapFixture:fakeMap}), C3 = AU.compareDay(day2, AU.heldIndex({men:arch, women:[]}), {mapFixture:fakeMap});
  ok(C3.diffs.length === 2 && C2.diffs.length === 1 && C2.diffs[0].api_id === 12 && C2.missing.length === 1, 'cross-check: a score the site has already corrected is no longer listed as a difference');
  const rep3 = {missing:C2.missing.slice(), diffs:C2.diffs.slice()}, S3 = await AU.sweep({client:{covers:() => true, fixturesOn: async () => []}, state:{done:'2026-11-15'}, report:rep3, held:H, today:'2026-11-16',
    end:'2026-10-06', from:'2014-11-01', perRun:1, mapFixture:fakeMap, settled:[{api_id:12, note:'the feed has the score after 90 minutes'}, {api_id:13, note:'the feed names the wrong team'}]});
  ok(rep3.missing.length === 0 && rep3.diffs.length === 0 && S3.settled === 2 && S3.open.missing === 0, 'cross-check: entries settled as the feed\'s mistake are left out and counted');
  // 15 Nov 2026: each entry is looked up on the two teams' Wikipedia pages as they stood some weeks after the match
  { const WC = await import('./lib/wikicheck.mjs');
    const box = (date, t1, sc, t2, extra = '') => `{{football box collapsible|date=${date}|team1={{fbw-rt|${t1}}}|score=${sc}|team2={{fbw|${t2}}}${extra}}}\n`;
    const pagesNow = {}, pagesThen = {
      "Czech Republic women's national football team": '==Results and fixtures==\n===2023===\n' + box('14 July', 'CZE', '3–0', 'SVK', '|location=[[Opava]], Czech Republic|round=Friendly') + box('18 July', 'CZE', '1–1', 'POL'),
      "Slovakia women's national football team": '===2023===\n' + box('14 July 2023', 'CZE', '3–0', 'SVK', '|stadium=Stadion|location=Opava, Czech Republic'),
      "Chile women's national football team": '===2023===\n' + box('5 February', 'CHI', '4–0', 'PAN', '|round=Unofficial Friendly|location=Santiago, Chile'),
      "Panama women's national football team": '===2023===\n' + box('5 February', 'CHI', '4–0', 'PAN', '|round=Unofficial Friendly') + box('16 February 2024', 'PAN', '2–0', 'PAR'),
      "Paraguay women's national football team": '',
      "Bangladesh women's national football team": '===2023===\n' + box('16 July', 'BAN', '0–0', 'NEP', '|penaltyscore=2–4|location=Dhaka, Bangladesh'),
      "Nepal women's national football team": '===2023===\n' + box('13 July', 'BAN', '1–1', 'NEP')};
    const asked = []; let fail = '';
    const fetchW = async url => { const u = new URL(url), t = u.searchParams.get('titles'), then = u.searchParams.get('rvstart'); asked.push(t + (then ? ' @' + then.slice(0, 10) : ' @now'));
      if (t === fail) return {ok:false, status:503, json: async () => ({})};
      const text = (then ? pagesThen : pagesNow)[t];
      return {ok:true, json: async () => ({query:{pages:[text === undefined ? {title:t, missing:true} : {title:t, revisions:[{slots:{main:{content:text}}}]}]}})}; };
    const E = (date, home, score, away, extra = {}) => ({g:'women', date, home, away, score, api_id:date + home, ...extra});
    const rep = {missing:[E('2023-07-14', 'Czech Republic', '3-0', 'Slovakia'), E('2023-02-05', 'Chile', '4-0', 'Panama'), E('2023-07-16', 'Bangladesh', '0-0', 'Nepal'), E('2023-07-05', 'Bangladesh', '2-0', 'Nepal'), E('2026-11-10', 'Chile', '1-0', 'Paraguay')],
      diffs:[E('2024-02-16', 'Paraguay', '0-2', 'Panama', {held:'2-0', heldDate:'2024-02-16'})]};
    const S = await WC.wikiCheck({report:rep, cache:{titles:{}}, fetchImpl:fetchW, today:'2026-11-15', pauseMs:0});
    const w = (i, list = rep.missing) => list[i].wiki || {};
    ok(S.checked === 6 && S.agree === 4 && S.none === 2 && w(0).found === 'agree' && w(0).pages === 'HA' && w(0).city === 'Opava' && w(0).country === 'Czech Republic' && w(0).date === '2023-07-14' && w(0).asOf === '2023-09-27',
      'Wikipedia check: a match on both teams\' pages of the time is marked as agreed, with its place');
    ok(w(1).found === 'agree' && /Unofficial/.test(w(1).lesser || '') && w(2).found === 'agree' && w(2).shootout === 'Nepal' && w(2).pages === 'H' && w(2).otherLists === 1 && w(0).otherLists === undefined && w(0, rep.diffs).otherLists === 0,
      'Wikipedia check: a label such as "unofficial" is carried, and the winner of a shoot-out');
    ok(w(3).found === 'none' && w(0, rep.diffs).found === 'agree' && w(0, rep.diffs).first === 'Panama' && w(0, rep.diffs).pages === 'A',
      'Wikipedia check: nothing within three days is "none"; a match the page lists the other way round still agrees');
    ok(asked.includes("Czech Republic women's national football team @2023-09-27") && asked.includes("Chile women's national football team @now") && asked.filter(t => t.startsWith('Bangladesh')).length === 1 && w(4).found === 'none' && !w(4).asOf,
      'Wikipedia check: an old match is read on the page as it stood then, a recent one on the page as it is, and a team and month only once');
    const rep2 = {missing:[E('2023-07-14', 'Czech Republic', '2-0', 'Slovakia'), E('2023-07-16', 'Bangladesh', '0-0', 'Nepal')], diffs:[]}; fail = "Nepal women's national football team";
    const S2 = await WC.wikiCheck({report:rep2, cache:{titles:{'women|Slovakia':{main:"Slovakia women's national football team"}}}, fetchImpl:fetchW, today:'2026-11-15', pauseMs:0});
    ok(rep2.missing[0].wiki.found === 'differ' && rep2.missing[0].wiki.others.join() === '2023-07-14 3-0' && !rep2.missing[1].wiki && S2.errors === 1 && S2.checked === 1,
      'Wikipedia check: another score on the pages is "differ", and an entry whose page could not be read is left for the next run');
    const rep3b = {missing:[E('2023-07-14', 'Czech Republic', '3-0', 'Slovakia'), E('2023-02-05', 'Chile', '4-0', 'Panama')], diffs:[]}; fail = '';
    const S3b = await WC.wikiCheck({report:rep3b, cache:{}, fetchImpl:fetchW, today:'2026-11-15', pauseMs:0, limit:2});
    ok(S3b.asked === 2 && S3b.checked === 1 && rep3b.missing[0].wiki && !rep3b.missing[1].wiki, 'Wikipedia check: it stops at its request limit and picks up next run'); }
}
// --- unit: Wikipedia's match boxes, November 2026: years from headings, sides not decided, group articles, venues from the teams' pages
{
  const W = await import('./lib/wikivenues.mjs'), R = await import('./lib/wikiresults.mjs');
  const page = "==Results==\n===2025===\n{{football box collapsible|date=14 November|team1={{fb-rt|IRQ}}|score=1–0|team2={{fb|IRN}}|location=[[Basra]], Iraq}}\n" +
    "=== [[2026 in Iraqi football|2026]] ===\n====November====\n{{football box\n|date= 17 November<ref>{{cite web|date=2026-11-01|title=x}}</ref>\n|time = 22:45\n|round=[[2026 Basra International Tournament|Basra Tournament]]\n|team1 = {{fb-rt|IRQ}}\n|score = –\n|team2 = {{fb|IRN}}\n|stadium    = [[]], [[Basra]]\n}}\n" +
    "{{#invoke:football box collapsible|main|date=November 20|team1={{fb-rt|IRQ}}|team2={{fb|BGD}}|location=[[Doha]], Qatar}}\n" +
    "{{football box|date=23 November|team1={{fb-rt|IRQ}}|team2={{fb|OMA}} or {{fb|TJK}}|location=[[Doha]], Qatar}}\n" +
    "==Head to head==\n{{football box|date=1 May|team1={{fb|IRQ}}|team2={{fb|SYR}}}}\n==Upcoming matches==\n{{football box|date=3 March|team1={{fb|IRQ}}|team2={{fb|SYR}}|location=[[Amman]], Jordan}}";
  const M = W.pageMatches(page, '2026-11-14');
  ok(M.length === 4 && M[0].date === '2025-11-14' && M[1].date === '2026-11-17' && M[2].date === '2026-11-20' && M[3].date === '2027-03-03',
    'Wikipedia: a date with no year takes the year of its section; outside a year section it is skipped, and under "Upcoming matches" it is the next such day');
  ok(M[1].city === 'Basra' && M[1].stadium === '' && M[1].timed === 1 && !M[1].kickoff && M[1].link === '2026 Basra International Tournament', 'Wikipedia: "[[]], [[Basra]]" still gives the city; a bare time counts as a time; the linked competition is kept');
  ok(M[2].t2 === 'BAN', 'Wikipedia: the #invoke form of a box is read, and ISO\'s code (BGD) is turned into FIFA\'s (BAN)');
  ok(!M.some(m => m.t2 === 'OMA') && W.boxTeam('{{fb|OMA}} or {{fb|TJK}}') === null && W.boxTeam('Winner SF1') === null && W.boxTeam('{{fb|CIV}}<ref>a or b</ref>') === 'CIV',
    'Wikipedia: a side still to be decided ("A or B", "Winner SF1") is no team');
  ok(W.boxDate('{{Start date|df=yes|2016|6|4}}') === '2016-06-04' && W.boxDate('{{Start date|2016|6|4|df=y}}') === '2016-06-04', 'Wikipedia: a start date is read with its setting before or after the numbers');
  ok(W.boxDate('15–17 November', 2026) === null && W.boxDate('31 February', 2026) === null && W.boxDate('TBD', 2026) === null && W.boxDate('14 November 2026', 2025) === '2026-11-14',
    'Wikipedia: a range of days, an impossible day and TBD give no date; a full date ignores the heading');
  const qual = "==Group stage==\n===Group A===\n{{main|2027 Africa Cup of Nations qualification Group A}}\n{{main|2027 Africa Cup of Nations qualification Group B}}\n{{#lst:2027 Africa Cup of Nations qualification preliminary round|Preliminary round}}\n{{main|2027 Africa Cup of Nations}}\n{{see also|2027 Africa Cup of Nations qualification squads}}";
  ok(W.compSubs(qual, 'African Cup of Nations qualification', 2026, false).join('|') === '2027 Africa Cup of Nations qualification Group A|2027 Africa Cup of Nations qualification Group B|2027 Africa Cup of Nations qualification preliminary round',
    'Wikipedia: a competition article hands on to its group articles, not to the finals or the squads');
  { /* the group articles are read and their boxes used */
    const pages = {'Q':qual.replace(/2027 Africa Cup of Nations qualification Group A/, 'GA'), 'GA':"{{football box|date={{Start date|2026|11|15|df=y}}|team1={{fb-rt|SDN}}|team2={{fb|SEN}}|stadium=[[Juba Stadium]], [[Juba]]}}"};
    const asked = [];
    const fake = async url => { const q = new URL(url).searchParams; asked.push(q.get('page')); return {ok:true, json: async () => ({parse:{wikitext:pages[q.get('page')] || ''}})}; };
    const cache = {titlesV:2, titles:{'men|Sudan':{title:'', main:'', checked:'2026-11-14'}, 'men|Senegal':{title:'', main:'', checked:'2026-11-14'}}, pages:{}, comps:{'men|African Cup of Nations qualification|2026':{titles:['Q'], checked:'2026-11-01'}}};
    const fxs = [{api_id:9, gender:'men', date:'2026-11-17', home_team:'Sudan', away_team:'Senegal', tournament:'African Cup of Nations qualification'}];
    const Rv = await W.wikiVenues(fxs, cache, {fetchImpl:fake, today:'2026-11-14', cities:new Map([['juba', 'South Sudan']]), cityKey:c => String(c).toLowerCase(), toArchive:x => x});
    ok(asked.includes('Q') && cache.comps['men|African Cup of Nations qualification|2026'].subs.includes('2027 Africa Cup of Nations qualification Group B'), 'Wikipedia: the articles a competition hands on to are remembered and read');
    cache.comps['men|African Cup of Nations qualification|2026'].subs = ['GA']; cache.pages = {};
    const Rv2 = await W.wikiVenues(fxs, cache, {fetchImpl:fake, today:'2026-11-14', cities:new Map([['juba', 'South Sudan']]), cityKey:c => String(c).toLowerCase(), toArchive:x => x});
    const h2 = Rv2.found.get('9');
    ok(h2 && h2.country === 'South Sudan' && h2.city === 'Juba' && !h2.date, 'Wikipedia: a group article\'s box gives the venue (Sudan v Senegal in Juba) and, having no time, leaves the feed\'s date alone');
  }
  { /* a competition's article: the year from its title, and one more after the New Year */
    const cup = "==Group A==\n{{football box|date=28 June|team1={{fb-rt|ANG}}|score=0–0|team2={{fb|NAM}}|location=[[Gqeberha]]}}\n{{football box|date=8 December|team1={{fb-rt|ZAN}}|score=1–1|team2={{fb|SUD}}}}\n{{football box|date=5 January|team1={{fb-rt|KEN}}|score=2–1|team2={{fb|TAN}}}}";
    const Rs = R.pageResults(cup, '2024-01-01', '2025-12-31', W.titleYear('2024 COSAFA Cup'));
    ok(W.titleYear('2024 COSAFA Cup') === 2024 && W.titleYear("Football at the 2023 Island Games – Men's tournament") === 2023 && W.titleYear('2026–27 UEFA Nations League A') === null && W.titleYear('2027 Africa Cup of Nations qualification Group A') === null,
      'Wikipedia: a competition article\'s year comes from its title; a two-year season or a qualifying competition gives none');
    ok(Rs.length === 3 && Rs[0].date === '2024-06-28' && Rs[1].date === '2024-12-08' && Rs[1].t2 === 'SDN' && Rs[2].date === '2025-01-05' && R.pageResults(cup, '2024-01-01', '2025-12-31').length === 0,
      'Wikipedia: boxes with no year on a competition article take the article\'s year, the next one after the New Year; SUD is read as Sudan');
  }
  ok(W.feedHas('2026-12-05', ['2026-12-05']) && W.feedHas('2026-12-05', ['2026-12-01'], ['2026-12-05']) && !W.feedHas('2026-12-05', ['2026-12-01'], ['2026-12-01', '2026-12-05']) && !W.feedHas('2026-12-05', [], ['2026-12-05']),
    'Wikipedia: a box near a feed fixture is that fixture, unless the same page lists the pair twice (two friendlies in a week)');
  { /* venues from the two teams' own pages, for a fixture and for a held result */
    const cache = {titles:{'men|Palestine':{title:'', main:'P'}, 'men|Iran':{title:'I', main:''}, 'men|Taiwan':{title:'T', main:''}},
      resultPages:{I:{fetched:'2026-11-14', results:[{date:'2026-11-14', t1:'IRN', t2:'PLE', hs:2, as:0, city:'Basra', country:'', stadium:''}], upcoming:[{date:'2026-11-17', t1:'IRQ', t2:'IRN', city:'Basra', country:'', stadium:''}]},
        T:{fetched:'2026-11-14', results:[{date:'2026-11-14', t1:'TPE', t2:'KGZ', hs:1, as:3, city:'Nam Dinh', country:'Vietnam', stadium:''}], upcoming:[]}}};
    const opt = {cities:new Map([['basra', 'Iraq']]), cityKey:c => String(c).toLowerCase(), toArchive:x => x, known:new Set(['Iraq', 'Vietnam'])};
    const v1 = R.teamPageVenue(cache, 'men', {date:'2026-11-14', home_team:'Palestine', away_team:'Iran', home_score:'0', away_score:'2'}, opt);
    const v2 = R.teamPageVenue(cache, 'men', {date:'2026-11-17', home_team:'Iraq', away_team:'Iran'}, opt);
    const v3 = R.teamPageVenue(cache, 'men', {date:'2026-11-14', home_team:'Taiwan', away_team:'Kyrgyzstan', home_score:'0', away_score:'3'}, opt);
    const v4 = R.teamPageVenue(cache, 'men', {date:'2026-11-14', home_team:'Palestine', away_team:'Iran'}, opt);
    ok(v1 && v1.country === 'Iraq' && v1.city === 'Basra' && v2 && v2.country === 'Iraq', 'Wikipedia: the teams\' own pages give the venue of a held result (Palestine v Iran in Basra) and of a fixture');
    ok(v3 === null && v4 === null, 'Wikipedia: a result box with a different score, or a result box for a match not played yet, gives no venue');
  }
  { /* the linked article names the competition */
    const N = await import('./lib/names.mjs');
    const tours = new Set(['African Cup of Nations qualification', 'UEFA Nations League', 'CONCACAF Nations League', 'Friendly']), map = N.makeTournamentMapper({men:tours, women:new Set()});
    ok(R.tournamentFor('2027 AFCON qualification', 'men', map, tours, '2027 Africa Cup of Nations qualification') === 'African Cup of Nations qualification'
      && R.tournamentFor('2026–27 Nations League', 'men', map, tours, '2026–27 CONCACAF Nations League A') === 'CONCACAF Nations League'
      && R.tournamentFor('2027 AFCON Q', 'men', map, tours) === 'African Cup of Nations qualification'
      && R.tournamentFor('2026 Basra International Tournament', 'men', map, tours, '2026 Basra International Tournament') === 'Basra International',
      'Wikipedia: the linked article names the competition where the text is short (AFCON, a bare "Nations League"); an unknown one stays as written');
  }
  { /* two pages name different opponents for a team on one day */
    const mk = (t1, t2, d = '2026-11-17') => ({date:d, t1, t2, kickoff:'', city:'Sisaket', country:'Thailand', stadium:'', comp:"2026 King's Cup"});
    const cache = {titles:{'men|Oman':{title:'O', main:'', checked:'2026-11-15'}, 'men|Thailand':{title:'T', main:'', checked:'2026-11-15'}, 'men|Tajikistan':{title:'J', main:'', checked:'2026-11-15'}, 'men|Brunei':{title:'B', main:'', checked:'2026-11-15'}},
      resultPages:{O:{fetched:'2026-11-15', results:[], upcoming:[mk('OMA', 'THA')]}, T:{fetched:'2026-11-15', results:[], upcoming:[mk('TJK', 'THA')]}, J:{fetched:'2026-11-15', results:[], upcoming:[mk('TJK', 'THA')]}, B:{fetched:'2026-11-15', results:[], upcoming:[mk('OMA', 'BRU'), mk('BRU', 'OMA', '2026-11-20'), mk('BRU', 'OMA', '2026-11-24')]}}};
    const known = [{date:'2026-01-01', home_team:'Oman', away_team:'Thailand'}, {date:'2026-01-02', home_team:'Tajikistan', away_team:'Brunei'}];
    const U = await R.wikiResults({g:'men', known, teams:new Set(['Oman', 'Thailand', 'Tajikistan', 'Brunei']), cache, today:'2026-11-15', everyDays:99, limit:0, fetchImpl:async () => { throw new Error('none'); }});
    const ids = U.upcoming.map(x => x.date.slice(8) + ' ' + x.home_team + ' v ' + x.away_team).join('; ');
    ok(ids === '17 Tajikistan v Thailand; 20 Brunei v Oman; 24 Brunei v Oman' && U.stats.disagree === 2, 'Wikipedia: a team given two opponents on one day keeps the match both teams\' pages list; with neither on both, both are set aside');
    ok(U.upcoming[1].pairDates.join() === '2026-11-17,2026-11-20,2026-11-24' && U.upcoming[0].pages === 2, 'Wikipedia: a fixture carries the days its own page gives the pair, and how many teams\' pages list it');
  }
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
  // a fixture moved by two days after its first kick-off time passed (Morocco v Niger, 11 → 13 November 2026): the old forecast goes
  { const mn = (d, made, res) => ({id:'men|' + d + '|Morocco|Niger', g:'men', date:d, kickoff:d + 'T12:00:00+00:00', home:'Morocco', away:'Niger', made, p:[0.8, 0.15, 0.05], result:res || null});
    const rowsMN = {men:[{date:'2026-11-13', home_team:'Morocco', away_team:'Niger', home_score:'5', away_score:'1'}], women:[]};
    const mv2 = updateRecord([mn('2026-11-11', '2026-11-10T07:00:00Z'), mn('2026-11-13', '2026-11-12T01:00:00Z')], {men:[], women:[]}, pred, rowsMN, Date.parse('2026-11-14T06:00:00Z'), 'r');
    /* two real matches three days apart, both listed before the first kicked off, the first with no result yet: both stay */
    const real2 = updateRecord([mn('2026-11-11', '2026-11-08T07:00:00Z'), mn('2026-11-13', '2026-11-08T07:00:00Z')], {men:[], women:[]}, pred, rowsMN, Date.parse('2026-11-14T06:00:00Z'), 'r');
    ok(mv2.list.length === 1 && mv2.list[0].date === '2026-11-13' && mv2.list[0].result.join() === '5,1' && mv2.dropped === 1 && real2.list.length === 2 && real2.dropped === 0,
      'a fixture moved two days after its kick-off time had passed: the old forecast goes, the new one is scored; two real matches three days apart both stay'); }
  // a fixture whose date moves after its first kick-off time has passed: one match, one scored forecast
  const tk = d => ({id:'men|' + d + '|Taiwan|Kyrgyzstan', g:'men', date:d, kickoff:d + 'T12:00:00+00:00', home:'Taiwan', away:'Kyrgyzstan', p:[0.08, 0.17, 0.75], result:null});
  const played = {men:[{date:'2026-11-14', home_team:'Taiwan', away_team:'Kyrgyzstan', home_score:'0', away_score:'2'}], women:[]};
  const two = updateRecord([tk('2026-11-13'), tk('2026-11-14')], {men:[], women:[]}, pred, played, Date.parse('2026-11-14T15:00:00Z'), 'r');
  const both = updateRecord([{...tk('2026-11-13'), result:[0, 2], outcome:2, hit:true}, {...tk('2026-11-14'), result:[0, 2], outcome:2, hit:true}], {men:[], women:[]}, pred, played, Date.parse('2026-11-15T06:00:00Z'), 'r');
  const apart = updateRecord([tk('2026-11-13'), tk('2026-11-14')], {men:[], women:[]}, pred,
    {men:[{date:'2026-11-13', home_team:'Taiwan', away_team:'Kyrgyzstan', home_score:'1', away_score:'1'}, ...played.men], women:[]}, Date.parse('2026-11-14T15:00:00Z'), 'r');
  ok(two.list.length === 1 && two.list[0].date === '2026-11-14' && two.scored === 1 && two.dropped === 1 && both.list.length === 1 && both.list[0].date === '2026-11-14' &&
    apart.list.length === 2 && apart.scored === 2 && apart.list[0].result.join('-') === '1-1' && apart.list[1].result.join('-') === '0-2',
    'a match moved a day after its first kick-off time: one forecast scored, the stale one dropped; two real matches a day apart both count');
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
// --- matches awarded without being played, and abandoned ones, on the plain pages and in Records' runs (14 Nov 2026)
{
  const {loadModel} = await import('./lib/model.mjs');
  const m = loadModel(path.join(HERE, '..', 'index.html'));
  const row = (date, home, hs, as, away, tournament = 'Friendly') => ({date, home_team:home, away_team:away, home_score:String(hs), away_score:String(as), tournament, city:'', country:home, neutral:'FALSE'});
  m.__rows = [
    row('2006-06-26', 'Switzerland', 0, 0, 'Ukraine', 'FIFA World Cup'), row('2019-06-05', 'Romania', 2, 1, 'Switzerland'), row('2020-09-03', 'Ukraine', 2, 1, 'Switzerland', 'UEFA Nations League'),
    row('2020-11-14', 'Switzerland', 1, 1, 'Spain', 'UEFA Nations League'), row('2020-11-17', 'Switzerland', 3, 0, 'Ukraine', 'UEFA Nations League'),
    row('2021-03-25', 'Bulgaria', 1, 3, 'Switzerland', 'FIFA World Cup qualification'), row('2021-03-28', 'Switzerland', 1, 0, 'Lithuania', 'FIFA World Cup qualification'),
    row('2021-03-31', 'Switzerland', 3, 2, 'Finland'), row('2021-05-30', 'Switzerland', 2, 1, 'United States'), row('2021-06-03', 'Switzerland', 7, 0, 'Liechtenstein'),
    row('2021-06-12', 'Wales', 1, 1, 'Switzerland', 'UEFA Euro'),
    row('2023-09-12', 'Romania', 2, 0, 'Kosovo', 'UEFA Euro qualification'), row('2024-11-15', 'Romania', 0, 0, 'Kosovo', 'UEFA Nations League')];
  const out = (() => { const ctxRows = JSON.stringify(m.__rows);
    m.run(`(() => { const g = 'men', ms = normalize(${ctxRows}, g);
      state.eras[g] = setWeights(ms, g); state.matches[g] = ms; state.bounds[g] = {min:ms[0].ts, max:ms[ms.length - 1].ts};
      state.dataInfo[g] = {source:'build', meta:{}}; state.upstreamNames[g] = 'unavailable'; state.former[g] = buildFormer([]); state.shootouts[g] = new Map(); })()`);
    m.table('men');
    const pairs = m.pairs('men', 1, []);
    const streaks = m.run(`(() => { state.useTableFiles = false; state.recCache = {}; return recordsData('men').streaks.map(s => s.kind + s.n + ' ' + s.nm + ' ' + fmtDate(s.from) + ' ' + fmtDate(s.to)); })()`);
    return {pairs, streaks, going:m.records('men', 5).winRuns}; })();
  const pair = (a, b) => out.pairs.find(P => [P.k1, P.k2].sort().join() === [m.keyOf(a), m.keyOf(b)].sort().join());
  const SU = pair('Switzerland', 'Ukraine'), sw = SU && (SU.k1 === m.keyOf('Switzerland') ? [SU.w1, SU.w2] : [SU.w2, SU.w1]);
  ok(SU && SU.n === 3 && SU.meets.length === 2 && SU.nWo === 1 && SU.nAb === 0 && sw.join() === '1,1' && SU.d === 1 && SU.g1 + SU.g2 === 3 && SU.comp === 3
    && SU.un.length === 1 && SU.un[0].wo && SU.un[0].award.to === 'Switzerland' && SU.un[0].award.score === '3–0',
    'plain head to head: a match awarded without being played is a meeting and a win, with no goals');
  const RK = pair('Romania', 'Kosovo');
  ok(RK && RK.n === 1 && RK.nWo === 0 && RK.nAb === 1 && RK.w1 + RK.w2 === 1 && RK.d === 0 && RK.g1 + RK.g2 === 2 && RK.un[0].ab && !RK.un[0].wo && RK.un[0].award.to === 'Romania',
    'plain head to head: an abandoned match is listed and not counted, even when it was awarded afterwards');
  ok(out.streaks.includes('w6 Switzerland 2020-11-17 2021-06-03') && !out.streaks.some(s => s.startsWith('w5 Switzerland')),
    'Records: a match awarded without being played extends a winning run, as on the team\'s History');
  ok(out.streaks.includes('u8 Switzerland 2020-11-14 2021-06-12'), 'Records: and an unbeaten run');
  { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'formline-aw-')), {buildPages} = await import('./pages.mjs');
    fs.copyFileSync(path.join(HERE, '..', 'index.html'), path.join(dir, 'index.html')); fs.mkdirSync(path.join(dir, 'data'));
    const S = [], si = v => { let i = S.indexOf(v); if (i < 0){ i = S.length; S.push(v); } return i; }; let prev = 0;
    const compact = {v:1, s:S, so:[], former:[], m:m.__rows.map(r => { const day = Date.parse(r.date + 'T00:00:00Z') / 864e5, d = day - prev; prev = day;
      return [d, si(r.home_team), si(r.away_team), +r.home_score, +r.away_score, si(r.tournament), 0, si(r.city), si(r.country), 0]; })};
    if (compact){ fs.writeFileSync(path.join(dir, 'data', 'men.json'), JSON.stringify(compact)); buildPages(dir, null);
      const read = f => fs.readFileSync(path.join(dir, 'h2h', 'men', f), 'utf8').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      const a = read('switzerland-vs-ukraine.html'), b = read('kosovo-vs-romania.html');
      ok(a.includes('have met 3 times since 2006') && a.includes('3 meetings · 1 awarded without being played') && a.includes('Switzerland v Ukraine UEFA Nations League')
        && a.includes('Not played; awarded 3–0 to Switzerland. Not rated') && a.includes('Switzerland awarded') && a.includes('The most recent was on Tuesday, 17 November 2020: Switzerland v Ukraine, not played and awarded to Switzerland'),
        'plain head-to-head page: the awarded match is in the totals and in the list, marked');
      ok(b.includes('have met once') && b.includes('1 meeting · 1 abandoned, not counted') && b.includes('Abandoned at this score; later awarded 3–0 to Romania. Not rated') && / Abandoned /.test(b),
        'plain head-to-head page: the abandoned match is listed, marked, and left out of the totals'); }
    else ok(false, 'plain head-to-head page: could not write test data');
    fs.rmSync(dir, {recursive:true, force:true}); }
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
  /* The last stage of keeping the method private: the published page without the rating engine. The marked parts are
     cut out, the notes left for that case become code or words, the switch reads false, the script's comments go, and
     a page that would still use a cut name is refused. */
  { const {stripEngine} = await import('./site.mjs');
    const page = ['<html><script>var theme = 1;</script>', '<p><!--ENGINE<-->old words<!--ENGINE>--><!--ENGINE-OFF:new words:ENGINE-OFF--></p>', '<script>', 'const RATINGS_FILES = false;', 'const ENGINE = true;',
      '/*ENGINE<*/', '/* how a rating moves */', 'function secretStep(a){ return a + 1; }', '/*>ENGINE*/', '/* a note about the method */', 'function table(){', '  /*ENGINE<*/ return secretStep(1); /*>ENGINE*/',
      '  return null;   // without the engine', '}', '/*ENGINE-OFF: const gone = true; :ENGINE-OFF*/', "const url = 'https://example.org/a';   // where it lives", '</script></html>'].join('\n');
    const S = stripEngine(page);
    ok(S.regions === 3 && S.left.length === 0 && S.names.join() === 'secretStep' && S.comments === 3 && !/secretStep|how a rating moves|a note about the method|old words|without the engine|where it lives/.test(S.html)
      && S.html.includes('const ENGINE = false;') && S.html.includes('const gone = true;') && S.html.includes('new words') && S.html.includes("const url = 'https://example.org/a';") && S.html.includes('var theme = 1;'),
      'engine off the page: the marked parts and the script\'s comments are cut out, the notes for that case are put in, and the rest is left as it was');
    const used = stripEngine(page.replace('return null;   // without the engine', 'return secretStep(2);'));
    const refuses = bad => { try { stripEngine(bad); return false; } catch(e){ return true; } };
    const orphan = stripEngine(page.replace('function table(){', 'const STEP_SIZE = 1;\nfunction table(){').replace('return a + 1;', 'return a + STEP_SIZE;'));
    ok(S.orphans.length === 0 && orphan.orphans.join() === 'STEP_SIZE' && orphan.left.length === 0 && orphan.html.includes('const STEP_SIZE = 1;'),
      'engine off the page: a setting left on the page that only the cut parts used is reported');
    ok(used.left.join() === 'secretStep' && refuses(page.replace('/*>ENGINE*/\n/* a note', '/* a note')) && refuses(page.replace('const ENGINE = true;', '')) && refuses(page.replace('function table(){', 'function table({')),
      'engine off the page: a page that still uses a cut name is reported, and one with a mark missing, no switch, or a script that no longer parses is refused');
    put('index.html', page);
    const R4 = buildSite(src, out, path.join(src, '_precompute'), undefined, true), html4 = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
    let threw4 = false; put('index.html', page.replace('return null;   // without the engine', 'return secretStep(2);')); try { buildSite(src, out, path.join(src, '_precompute'), undefined, true); } catch(e){ threw4 = /still refers/.test(e.message); }
    put('index.html', page);
    const R5 = buildSite(src, out, path.join(src, '_precompute'), undefined, false);
    ok(R4.stripped && R4.stripped.regions === 3 && html4.includes('const RATINGS_FILES = true;') && html4.includes('const ENGINE = false;') && !html4.includes('secretStep') && threw4 && R5.stripped === null && fs.readFileSync(path.join(out, 'index.html'), 'utf8').includes('function secretStep')
      && fs.readFileSync(path.join(src, 'index.html'), 'utf8') === page,
      'engine off the page: the site builder cuts it out when asked (and only then), refuses a page that would break, and never touches the project\'s own page');
    /* the real page: everything the cut removes is unused by what is left, and the engine's own names are gone */
    const real = fs.readFileSync(path.join(HERE, '..', 'index.html'), 'utf8'), SR = stripEngine(real);
    ok(!real.includes('<!-->') && real.split('<!--ENGINE<-->').length === real.split('<!--ENGINE>-->').length && refuses(page.replace('<!--ENGINE>-->', '<!-->ENGINE-->')),
      'engine off the page: the marks in the page\'s own HTML are whole comments, so none of them shows as text on the page');
    ok(SR.orphans.length === 0 && !/FRIENDLY_ERAS|PREMIER_WORLD|WOMEN_SENIOR_GAMES|WOMEN_GAMES_K|PREMIER_K/.test(SR.html),
      'engine off the page: nothing that only the engine used is left behind on the real page' + (SR.orphans.length ? ' (left behind: ' + SR.orphans.join(', ') + ')' : ''));
    ok(SR.regions > 60 && SR.left.length === 0 && SR.names.includes('applyMatch') && SR.names.includes('runWindow') && SR.names.includes('computeRatings') && SR.names.includes('setWeights')
      && !/applyMatch|runWindow|computeRatings|glickoUpdate|windowKernel|setWeights|friendlyK|viewWhatIf\b/.test(SR.html) && SR.html.includes('const ENGINE = false;') && real.includes('const ENGINE = true;') && SR.comments > 400,
      'engine off the page: cut from the real page, nothing left refers to the engine (' + SR.regions + ' parts, ' + SR.names.length + ' functions and settings, ' + SR.comments + ' comments)' + (SR.left.length ? ' (still used: ' + SR.left.join(', ') + ')' : ''));
  }
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
      ok(P.months.stamps[0] >= '2024-01' && P.months.stamps.length === P.months.tables.length && last.length === direct.length && direct.every(([k, r, rk]) => { const row = last.find(x => P.months.teams[x[0]] === k); return row && Math.round(row[1] * 10) / 10 === r && row[3] === rk; }),
        'precompute: a month-end table matches the site\'s table for that date');
      /* A table after every match day, and every match as published: both equal what the page itself shows. */
      const {dayTables, matchLedger, inputPrint, modelPrint} = await import('./precompute.mjs');
      const Y = +T.asOf.slice(0, 4), D = dayTables(model, 'women', Y, false), A = dayTables(model, 'women', Y, true), L = matchLedger(model, 'women', Y);
      const day = D.days[D.days.length - 1], want = model.run(`(() => { state.gender = 'women'; state.windowYears = DEFAULTS.windowYears; state.asOf = Date.parse(${JSON.stringify(day)} + 'T00:00:00Z'); state.cache = {key:null};
        const c = getRatings(), out = {t:c.all.filter(r => !r.island).map(r => [r.key, Math.round(r.rating * 10) / 10, r.rank || 0])};
        state.asOf = state.bounds.women.max; state.cache = {key:null};
        const k = getRatings().all[0].key, h = publishedHistory(k).filter(x => x.published); out.k = k; out.h = h.slice(-1).map(x => [fmtDate(x.ts), Math.round(x.pre * 10) / 10, Math.round(x.rating * 10) / 10])[0] || null; return out; })()`);
      const lastT = D.tables[D.tables.length - 1];
      ok(D.days.length > 0 && D.days.length === D.tables.length && want.t.every(([k, r, rk]) => { const row = lastT.find(x => D.teams[x[0]] === k); return row && Math.round(row[1] * 10) / 10 === r && row[3] === rk; }),
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
        ok(D2.v === 6 && D2.gaps.length === D2.days.length && D2.days.length >= 2 && dc.n > 50 && dc.bad.length === 0 && dc.tierDiffs === 0, 'past dates: a table rebuilt from the match-day file equals the page\'s own' + (dc.bad.length ? ' (' + dc.bad[0] + ')' : ''));
        const gap = D2.days.findIndex((d, k) => k < D2.days.length - 1 && Date.parse(D2.days[k + 1]) - Date.parse(d) > 2 * 86400000);
        const sh = gap >= 0 ? dayCheck(model, 'women', D2, gap, 1, prev) : null;
        const steps = D2.days.slice(1).map((d, k) => (Date.parse(d) - Date.parse(D2.days[k])) / 86400000);
        const between = D2.gaps.reduce((a, G) => a + G.length, 0), span = Math.round((Date.parse(D2.days[D2.days.length - 1]) - Date.parse(D2.days[0])) / 86400000) + 1;
        ok((!sh || sh.bad.length === 0) && steps.every(x => x >= 1 && x <= 7) && between > 0 && D2.days.length + between >= span && D2.gaps.every(G => G.every(x => x.length === 6)), 'past dates: the file has a full table at least every week and every day in between has its own figures (' + between + ' such days); a date between two full tables shows exactly the table worked out for that date, to the file\'s two decimal places' + (sh && sh.bad.length ? ' (' + sh.bad[0] + ')' : ''));
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
          for (const limit of [DEFAULTS.maxBand, 0]) for (const g of ['men', 'women']){ if (!state.matches[g]) continue; state.gender = g; state.asOf = state.bounds[g].max; state.maxBand = limit; state.cache = {key:null};   // also with every team ranked: the small test archive ranks no one inside the usual limit
            const c = getRatings(), R = rankRanges(c);
            c.table.forEach(r => { const K = clusterOf(c, r), m = R.get(r.key).mid; out.n++;
              if (!K || !K.rows.includes(r) || K.lo > r.rank || K.hi < r.rank || K.lo !== Math.min(m[0], r.rank) || K.hi !== Math.max(m[1], r.rank) || K.rows.length !== K.hi - K.lo + 1 || K.rows.some((x, i) => x.rank !== K.lo + i)) out.bad++; });
            c.provisional.forEach(r => { if (clusterOf(c, r) !== null) out.none = false; }); }
          state.gender = 'women'; state.asOf = state.bounds.women.max; state.maxBand = DEFAULTS.maxBand; state.cache = {key:null};
          return out; })()`);
        ok(cl.bad === 0 && cl.none && cl.n > 0, 'cluster: every ranked team\'s cluster is the run of ranks inside its likely rank, itself included (' + cl.n + ' teams); none for an unranked team'); }
      /* The confederation cluster (Seb, 13 Nov 2026): the same among a confederation's ranked teams, places counted
         there and each side redrawn from its own band; and the world's likely ranks are what they were before the
         working was shared. */
      { const cc = model.run(`(() => { const out = {n:0, bad:0, none:true, confs:0, same:true};
          for (const limit of [DEFAULTS.maxBand, 0]) for (const g of ['men', 'women']){ if (!state.matches[g]) continue; state.gender = g; state.asOf = state.bounds[g].max; state.maxBand = limit; state.cache = {key:null};   // the small test archive ranks no one inside the usual limit, so also with every team ranked
            const c = getRatings(), W = rankRanges(c), again = rangesOf(c.table, r => r.rd);
            c.table.forEach(r => { const a = W.get(r.key), b = again.get(r.key); if (a.mid.join() !== b.mid.join() || a.wide.join() !== b.wide.join()) out.same = false; });
            for (const conf of new Set(c.table.map(r => r.conf))){ const list = c.table.filter(r => r.conf === conf).sort((a, b) => a.rank - b.rank), R = confRanges(c, conf); out.confs++;
              list.forEach((r, i) => { const K = clusterOf(c, r, 'conf'), m = R.get(r.key).mid, me = i + 1; out.n++;
                if (!K || !K.conf || K.of !== list.length || !K.rows.includes(r) || K.lo !== Math.min(m[0], me) || K.hi !== Math.max(m[1], me) || K.rows.length !== K.hi - K.lo + 1
                  || K.rows.some((x, j) => x !== list[K.lo - 1 + j]) || K.rows.some(x => x.conf !== conf) || K.pos(r) !== me || m[0] < 1 || m[1] > list.length) out.bad++; }); }
            c.provisional.forEach(r => { if (clusterOf(c, r, 'conf') !== null) out.none = false; }); }
          state.gender = 'women'; state.asOf = state.bounds.women.max; state.maxBand = DEFAULTS.maxBand; state.cache = {key:null};
          return out; })()`);
        ok(cc.bad === 0 && cc.none && cc.same && cc.confs >= 2, 'cluster: a team\'s confederation cluster is the run of its confederation\'s places inside its likely place there (' + cc.n + ' teams, ' + cc.confs + ' confederation tables); none for an unranked team; the world\'s likely ranks are unchanged'); }
      /* The home page (Seb, 13 Nov 2026): each way in names a page of the menu in the menu's own words; the track
         record counts what the Forecast record counts, and shows a percentage only from ten matches with a winner. */
      { const html = fs.readFileSync(path.join(HERE, '..', 'index.html'), 'utf8');
        const hub = model.run(`JSON.stringify(HOME_HUB)`), H = JSON.parse(hub), dec = s => s.replace(/&rsquo;|\u2019/g, "'").replace(/&amp;/g, '&');
        const missing = H.filter(([r, name, line]) => !dec(html).includes('<a href="#/' + r + '" data-route="' + r + '">' + name + '<small>' + line + '</small></a>')).map(x => x[0]);
        const tr = model.run(`(() => { const saved = state.record, g = 'women', mk = (p, outcome, i) => ({g, date:'2026-11-' + (10 + (i % 9)), result:[1, 0], p, outcome});
          const few = [mk([0.6, 0.2, 0.2], 0, 0), mk([0.6, 0.2, 0.2], 2, 1), mk([0.38, 0.31, 0.31], 1, 2), {g, date:'2026-11-20', p:[0.5, 0.3, 0.2]}, {g:'men', date:'2026-11-01', result:[1, 0], p:[0.5, 0.3, 0.2], outcome:0}];
          state.gender = g; state.record = {entries:few}; const a = homeTrack(g);
          state.record = {entries:Array.from({length:12}, (x, i) => mk([0.6, 0.2, 0.2], i < 9 ? 0 : 2, i))}; const b = homeTrack(g);
          state.record = null; const c = homeTrack(g); state.record = saved;
          return {few:a.includes('>1 of 2<') && !/>\d+%</.test(a.split('since 2019')[0]) && a.includes('10 Nov 2026') && a.includes('Of the 3 checked so far'), many:b.includes('>75%<') && b.includes('<b>9 of 12</b>'),
            none:c.includes('nightly update') && c.includes('id="homeTrack"'), std:typeof filtersStd() === 'boolean' && filterWords().win.length > 0}; })()`);
        ok(H.length === 12 && missing.length === 0, 'home page: each of the ' + H.length + ' ways in is a page of the menu, in the menu\'s own words' + (missing.length ? ' (not found: ' + missing.join(', ') + ')' : ''));
        ok(tr.few && tr.many && tr.none && tr.std, 'home page: the track record counts the matches that had a winner and how many of those were called, as a count until there are ten and a percentage from then on ' + JSON.stringify(tr)); }
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
        /* Groups and runs (19 Nov 2026): the same figures whether the page works them out from the model's run or from
           the edition's file; groups come hardest first; no team has more opponents than matches. */
        { model.run(`__allEd = ${JSON.stringify(JSON.stringify(files))}`);
          const gr = model.run(`(() => { state.gender = 'women'; state.windowYears = DEFAULTS.windowYears; state.comps = new Set(COMP_ORDER); state.historicalNames = DEFAULTS.historicalNames; state.maxBand = DEFAULTS.maxBand; state.rankBy = DEFAULTS.rankBy;
            const files = JSON.parse(__allEd), bad = []; let n = 0, withG = 0, shown = 0; const near = (a, b) => (a === null || b === null) ? a === b : Math.abs(a - b) < 0.05;
            for (const id of Object.keys(files)){ const e = getEditions().byId.get(id); state.edCache = null; const A = editionRun(e), C = edFromFile(e, files[id]); state.edCache = null;
              if (!C){ bad.push(id + ': file not read'); continue; }
              const SA = edPathStats(e, A), SC = edPathStats(e, C); n++; if (SA.groups.length) withG++; if (editionPaths(e, C, t => '#')) shown++;
              if (SA.groups.length !== SC.groups.length || SA.paths.length !== SC.paths.length){ bad.push(id + ': sizes'); continue; }
              SA.groups.forEach((G, i) => { const H = SC.groups[i]; if (G.Ts.map(t => t.key).join() !== H.Ts.map(t => t.key).join() || !near(G.avgR, H.avgR) || !near(G.avgRank, H.avgRank)) bad.push(id + ': group ' + i);
                if (i && G.avgR > SA.groups[i - 1].avgR) bad.push(id + ': groups out of order'); });
              const byA = new Map(SA.paths.map(p => [p.T.key, p]));
              for (const q of SC.paths){ const p = byA.get(q.T.key); if (!p || p.n !== q.n || !near(p.avgR, q.avgR) || !near(p.avgRank, q.avgRank) || p.finish !== q.finish) bad.push(id + ': run of ' + q.T.key);
                if (p && p.n > p.T.p) bad.push(id + ': more opponents than matches'); } }
            return {n, withG, shown, bad}; })()`);
          ok(gr.n === EL.length && gr.n > 0 && gr.bad.length === 0,
            'edition pages: Groups and runs gives the same figures from the model and from each edition\'s file (' + gr.n + ' editions, ' + gr.withG + ' with groups, ' + gr.shown + ' shown)' + (gr.bad.length ? ' (' + gr.bad[0] + ')' : '')); }
        /* World Cup places on any date (20 Nov 2026): the latest date gives the same teams as "today"; a past date is
           labelled with its day; a side that no longer existed is left out; bans and Israel's zones follow their dates. */
        { const wc = model.run(`(() => { state.gender = 'women'; state.route = 'confederations'; state.windowYears = DEFAULTS.windowYears; state.comps = new Set(COMP_ORDER); state.historicalNames = DEFAULTS.historicalNames; state.maxBand = DEFAULTS.maxBand; state.rankBy = DEFAULTS.rankBy; state.asOf = state.bounds.women.max; state.cache = {key:null};
            const c = getRatings(), B = state.bounds.women, names = h => (h.match(/class="wct-t">.*?<[/]span><[/]span>/g) || []).map(x => x.replace(/<[^>]+>/g, '')).join('|');
            state.params = {wcp:'today'}; const today = confPlaces(c); state.params = {wcp:fmtDate(B.max)}; const last = confPlaces(c);
            const mid = B.min + Math.floor((B.max - B.min)*0.6/DAY)*DAY; state.params = {wcp:fmtDate(mid)}; const past = confPlaces(c); state.params = {};
            const D = s => Date.parse(s + 'T00:00:00Z'), out = {same:names(today) === names(last), n:(today.match(/class="wct-t"/g) || []).length,
              past:past.indexOf('If the World Cup were played on ' + fmtDay(mid)) >= 0 && /type="date"/.test(past) && past.indexOf('value="' + fmtDate(mid) + '"') >= 0, today:/If the World Cup were played today/.test(today) && !/type="date"/.test(today)};
            out.bans = [wcBarred('Serbia', D('1993-06-01')), wcBarred('Serbia', D('1994-10-05')), wcBarred('Russia', D('2022-02-27')), wcBarred('Russia', D('2022-02-28')), wcBarred('North Korea', D('2013-01-01')), wcBarred('Nigeria', D('2014-07-18'))].map(x => x ? 1 : 0).join('');
            state.gender = 'men'; out.bansMen = [wcBarred('North Korea', D('2013-01-01')), wcBarred('Mexico', D('1989-06-01')), wcBarred('Chile', D('1994-07-18')), wcBarred('Germany', D('1947-06-01'))].map(x => x ? 1 : 0).join(''); state.gender = 'women';
            out.israel = ['1973-06-01', '1977-03-01', '1981-06-01', '1989-06-01', '1993-06-01', '2020-01-01'].map(d => wcPool('Israel', D(d))).join();
            out.aus = wcPool('Australia', D('2005-06-01')) + ',' + wcPool('Australia', D('2007-06-01'));
            out.gone = [wcGone('German DR', D('1991-01-01')), wcGone('Germany', D('1991-01-01'))].join();
            /* The fill itself, on a made-up table: hosts first, the next best to the play-off, a barred side left out. */
            { state.gender = 'men'; const L = {UEFA:['Spain', 'Russia', 'France', 'England', 'Portugal', 'Belgium', 'Netherlands', 'Germany', 'Italy', 'Croatia', 'Denmark', 'Norway', 'Austria', 'Greece', 'Sweden', 'Poland', 'Hungary', 'Ukraine', 'Scotland'],
                CONMEBOL:['Argentina', 'Brazil', 'Colombia', 'Uruguay', 'Ecuador', 'Paraguay', 'Chile', 'Peru'], CONCACAF:['Panama', 'Costa Rica', 'Jamaica', 'Mexico', 'United States', 'Haiti', 'Canada', 'Honduras', 'Guatemala', 'Cuba'],
                CAF:['Morocco', 'Senegal', 'Algeria', 'Egypt', 'Nigeria', 'Mali', 'Cameroon', 'Tunisia', 'Ghana', 'South Africa', 'Gabon'], AFC:['Japan', 'Iran', 'Australia', 'South Korea', 'Uzbekistan', 'Saudi Arabia', 'Jordan', 'Qatar', 'Iraq', 'Oman'], OFC:['New Zealand', 'Fiji', 'Tahiti']};
              const rows = []; let more = true; for (let i = 0; more; i++){ more = false; for (const k of Object.keys(L)) if (L[k][i]){ more = true; rows.push({team:L[k][i], key:L[k][i], conf:k, status:'fifa', defunct:false}); } }
              rows.forEach((r, i) => { r.rank = i + 1; r.rating = 2000 - i; });
              const h = wcOn({table:rows}, '', null), txt = h.replace(/<[^>]+>/g, ' ').replace(/&middot;/g, '·').replace(/\\s+/g, ' '), row = k => { const a = txt.indexOf(' ' + k + ' '), nx = Object.keys(L).map(x => txt.indexOf(' ' + x + ' ', a + 3)).filter(x => x > a); return txt.slice(a, nx.length ? Math.min(...nx) : txt.indexOf('The 48 teams')); };
              out.fill = {n:/The 48 teams who would be there/.test(txt), hosts:/Mexico #\\d+ · host USA #\\d+ · host Canada #\\d+ · host/.test(row('CONCACAF')) || (row('CONCACAF').match(/· host/g) || []).length === 3,
                concacaf:(row('CONCACAF').match(/#\\d+/g) || []).length === 8 && !/Guatemala|Cuba/.test(row('CONCACAF')), uefa:(row('UEFA').match(/#\\d+/g) || []).length === 16 && !/Russia/.test(row('UEFA')) && /Hungary/.test(row('UEFA')) && !/Ukraine/.test(row('UEFA')),
                po:(txt.match(/through the play-off/g) || []).length === 2 && (txt.match(/out in the play-off/g) || []).length === 4, barred:/Russia \\(#\\d+\\) is left out: suspended by FIFA and UEFA/.test(txt)}; state.gender = 'women'; }
            return out; })()`);
          ok(wc.same && Object.values(wc.fill).every(Boolean) && wc.past && wc.today && wc.bans === '100110' && wc.bansMen === '0101' && wc.israel === 'AFC,AFC,UEFA,OFC,UEFA,UEFA' && wc.aus === 'OFC,AFC' && wc.gone === 'true,false',
            'confederations: the World Cup filled from any date\'s ratings: hosts first, the play-off, a barred side left out; the latest date equals today, a past date is labelled, bans and old confederations follow their dates ' + JSON.stringify({fill:wc.fill, bans:wc.bans, men:wc.bansMen, israel:wc.israel})); }
        /* Team pages, World Cups and continental finals edition by edition (20 Nov 2026): a row says "at the finals"
           exactly when the side played there, a finish is given only then, and the reasons on record follow their rules. */
        { const tm = model.run(`(() => { state.gender = 'women'; const bad = [], keys = new Set(); let n = 0, ins = 0, withRows = 0;
            for (const m of state.matches.women){ namesFor(m); keys.add(m._h); keys.add(m._a); }
            for (const k of keys){ const R = teamMajors(k), html = teamMajorsSection(k); if (R.length) withRows++;
              for (const r of R){ n++; if (!['in', 'why', 'q', 'noq', 'none'].includes(r.st)) bad.push(k + ': status'); if ((r.st === 'in') !== r.e._keys.has(k)) bad.push(k + ': field');
                if (r.st === 'in') ins++; else if (r.fin) bad.push(k + ': finish without playing'); if ((r.st === 'why') !== !!r.why) bad.push(k + ': reason'); }
              if (!!R.length !== (html.indexOf('World Cups and continental finals') >= 0)) bad.push(k + ': section'); }
            const E = (t, l) => ({tournament:t, label:l}), W = 'FIFA World Cup', has = (x, t) => x.indexOf(t) >= 0;
            const women = absentWhy(E(W, '1934'), 'Wales') === '' && has(absentWhy(E('CONCACAF Championship', '2014'), 'Canada'), 'hosts');
            state.gender = 'men';
            const men = [has(absentWhy(E(W, '1934'), 'Wales'), 'not a FIFA member'), has(absentWhy(E(W, '1930'), 'Northern Ireland'), 'not a FIFA member'), absentWhy(E(W, '1954'), 'Wales') === '',
              has(absentWhy(E(W, '1966'), 'Ghana'), 'African boycott'), has(absentWhy(E(W, '1966'), 'Egypt'), 'African boycott'), absentWhy(E(W, '1966'), 'Kenya') === '', has(absentWhy(E(W, '1966'), 'South Africa'), 'disqualified'),
              has(absentWhy(E('UEFA Euro', '1980'), 'Israel'), 'no confederation'), absentWhy(E('UEFA Euro', '1996'), 'Israel') === '', has(absentWhy(E(W, '1950'), 'Germany'), 'Second World War'),
              has(absentWhy(E(W, '1950'), 'Scotland'), 'withdrew'), has(absentWhy(E(W, '1994'), 'Chile'), 'banned'), has(absentWhy(E(W, '2018'), 'Zimbabwe'), 'expelled')].map(x => x ? 1 : 0).join('');
            state.gender = 'women';
            return {n, ins, withRows, teams:keys.size, bad, women, men}; })()`);
          ok(tm.bad.length === 0 && tm.women && tm.men === '1111111111111',
            'team pages: World Cups and continental finals, edition by edition: at the finals exactly when it played there, a finish only then, and the reasons on record by their rules (' + tm.n + ' rows for ' + tm.withRows + ' of ' + tm.teams + ' teams, ' + tm.ins + ' at the finals)' + (tm.bad.length ? ' (' + tm.bad[0] + ')' : '') + ' ' + tm.men); }
        /* Sides outside FIFA (21 Nov 2026): the joining-year table reads cleanly; a side is "not yet a member" only before
           both years on record, and never once it has played that World Cup's qualifying; the three lines with an earlier
           membership get no rule; a side that has never been a member is said so; South Africa's years out carry their
           reasons; and of the men's continental finals only CONCACAF's of 1973 to 1989 and Oceania's of 2004 to 2016 count
           as World Cup qualifying. */
        { const fj = model.run(`(() => { const E = (y, extra) => Object.assign({tournament:'FIFA World Cup', cat:'wc', label:String(y), start:Date.UTC(y, 5, 10)}, extra || {}), has = (x, t) => x.indexOf(t) >= 0;
            const parts = FIFA_JOINED_LIST.split(';'), okList = parts.length === 211 && parts.every(p => /^[A-Z]{3}=(19|20)[0-9]{2}([/](19|20)[0-9]{2})?$/.test(p)) && new Set(parts.map(p => p.slice(0, 3))).size === 211;
            const why = [fifaWhy(E(1958), 'Jamaica') === 'not yet a FIFA member (it joined in 1962)', fifaWhy(E(1962), 'Jamaica') === '', fifaWhy(E(1958), 'Jamaica', true) === '',
              fifaWhy(E(1958), 'Trinidad and Tobago') === 'not yet a FIFA member (it joined in 1963 or 1964)', fifaWhy(E(1994), 'New Caledonia') === 'not yet a FIFA member', fifaWhy(E(1998), 'New Caledonia') === '',
              fifaWhy(E(1950), 'South Africa') === '', fifaWhy(E(1950), 'Slovakia') === '', fifaWhy(E(1950), 'Indonesia') === '', has(fifaWhy(E(2022), 'Martinique'), 'not a FIFA member'), has(fifaWhy(E(2022), 'Martinique', true), 'not a FIFA member'),
              fifaWhy(E(1958, {tournament:'CONCACAF Championship'}), 'Jamaica') === '', fifaWhy(E(1930), 'England') === ''].map(x => x ? 1 : 0).join('');
            const M = (t, y, mo) => ({tournament:t, cat:t.indexOf('qualification') >= 0 ? 'contq' : 'cont', ts:Date.UTC(y, mo, 1)});
            const via = [wcViaCont(E(1974), M('CONCACAF Championship', 1973, 11), 'men'), wcViaCont(E(1974), M('CONCACAF Championship qualification', 1972, 11), 'men'), !wcViaCont(E(1966), M('CONCACAF Championship', 1965, 3), 'men'),
              !wcViaCont(E(1974), M('Oceania Nations Cup', 1973, 1), 'men'), wcViaCont(E(2006), M('Oceania Nations Cup', 2004, 5), 'men'), !wcViaCont(E(1938), M('Copa América', 1937, 0), 'men'),
              !wcViaCont(E(1970), M('African Cup of Nations', 1970, 1), 'men'), wcViaCont(E(2023), M('AFC Asian Cup', 2022, 0), 'women'), !wcViaCont(E(2023), M('AFC Asian Cup', 2019, 0), 'women')].map(x => x ? 1 : 0).join('');
            state.gender = 'men'; const A = 'African Cup of Nations';
            const sa = [has(absentWhy(E(1974), 'South Africa'), 'suspended'), has(absentWhy(E(1986), 'South Africa'), 'expelled by FIFA'), has(absentWhy({tournament:A, label:'1972'}, 'South Africa'), 'expelled from the African'),
              has(absentWhy({tournament:A, label:'1965'}, 'South Africa'), 'expelled from the African'), has(absentWhy({tournament:A, label:'1965'}, 'Egypt'), 'withdrew'), has(absentWhy({tournament:A, label:'1957'}, 'South Africa'), 'left out'), absentWhy({tournament:A, label:'1994'}, 'South Africa') === ''].map(x => x ? 1 : 0).join('');
            const wd = [has(absentWhy(E(1954), 'Poland'), 'withdrew'), absentWhy(E(1958), 'Poland') === '', has(absentWhy(E(1974), 'Croatia'), 'part of Yugoslavia'), has(absentWhy({tournament:'UEFA Euro', label:'1988', start:Date.UTC(1988, 5, 10)}, 'Latvia'), 'the Soviet Union'),
              partOfWhy(E(1938), 'Latvia') === '', partOfWhy(E(1994), 'Croatia') === '', has(absentWhy(E(1994), 'Ukraine'), '8 December 1991'), has(absentWhy(E(1994), 'Ukraine'), 'turned down'), !has(absentWhy(E(1994), 'Belarus'), 'turned down'), partOfWhy(E(1974), 'Serbia') === ''].map(x => x ? 1 : 0).join('');
            const C = (t, y) => ({cat:'cont', tournament:t, label:String(y)});
            const co = [contViaOther(C('Gold Cup', 2021), {tournament:'CONCACAF Nations League', cat:'nl'}), !contViaOther(C('Gold Cup', 2017), {tournament:'CONCACAF Nations League', cat:'nl'}), contViaOther(C('Oceania Nations Cup', 1996), {tournament:'Melanesia Cup', cat:'subreg'}),
              !contViaOther(C('Oceania Nations Cup', 2002), {tournament:'Melanesia Cup', cat:'subreg'}), contViaOther(C('Oceania Nations Cup', 2008), {tournament:'South Pacific Games', cat:'games'}), contViaOther(C('AFC Asian Cup', 2019), {tournament:'FIFA World Cup qualification', cat:'wcq'}),
              !contViaOther(C('AFC Asian Cup', 2015), {tournament:'FIFA World Cup qualification', cat:'wcq'}), contViaOther(C(A, 2006), {tournament:'FIFA World Cup qualification', cat:'wcq'}), !contViaOther(C(A, 2008), {tournament:'FIFA World Cup qualification', cat:'wcq'}),
              !contViaOther(Object.assign(C('FIFA World Cup', 2010), {cat:'wc'}), {tournament:'FIFA World Cup qualification', cat:'wcq'}), has(absentWhy(C(A, 1974), 'Gabon'), 'walkover'), has(absentWhy(C(A, 1962), 'Sudan'), 'withdrew from qualifying'), contWithdrew(C(A, 1962), 'Gabon') === '',
              QUAL_EARLY[A+'|2013'] === Date.UTC(2012, 0, 1), QUAL_EARLY['Africa Cup of Nations|2026'] === Date.UTC(2025, 0, 1),
              seriesAlone('women', {tournament:'CONCACAF Gold Cup', label:'2024'}), !seriesAlone('women', {tournament:'CONCACAF Gold Cup', label:'2010'}), !seriesAlone('men', {tournament:'Gold Cup', label:'2025'}),
              COMP_SERIES.men[0].join() === 'CONCACAF Championship,Gold Cup' && COMP_SERIES.women.length === 3].map(x => x ? 1 : 0).join('');
            const bar = [wcBarred('South Africa', Date.UTC(1962, 0, 1)), wcBarred('South Africa', Date.UTC(1964, 0, 1)), wcBarred('South Africa', Date.UTC(1964, 9, 8)), wcBarred('South Africa', Date.UTC(1992, 6, 2)), wcBarred('South Africa', Date.UTC(1992, 6, 3))].map(x => x ? 1 : 0).join('');
            const uk = [wcBarred('England', Date.UTC(1928, 1, 16)), wcBarred('England', Date.UTC(1928, 1, 17)), wcBarred('Scotland', Date.UTC(1938, 5, 1)), wcBarred('Wales', Date.UTC(1946, 0, 1)), wcBarred('Northern Ireland', Date.UTC(1922, 5, 1)), wcBarred('England', Date.UTC(1925, 5, 1)), wcBarred('Kuwait', Date.UTC(2015, 9, 16)), wcBarred('Kuwait', Date.UTC(2017, 11, 6))].map(x => x ? 1 : 0).join('');
            const ny = [wcNotYet('Jamaica', Date.UTC(1961, 11, 31)), wcNotYet('Jamaica', Date.UTC(1962, 0, 1)), wcNotYet('South Africa', Date.UTC(1950, 0, 1)), wcNotYet('England', Date.UTC(1900, 0, 1)), wcNotYet('England', Date.UTC(1904, 11, 31))].map(x => x ? 1 : 0).join('');
            state.gender = 'women'; return {okList, why, via, sa, bar, ny, uk, wd, co}; })()`);
          ok(fj.okList && fj.why === '1111111111111' && fj.via === '111111111' && fj.sa === '1111111' && fj.bar === '10110' && fj.ny === '10001' && fj.uk === '01101010' && fj.wd === '1111111111' && fj.co === '1111111111111111111',
            'sides outside FIFA: 211 joining years; "not yet a member" only before both years on record and only without qualifying, never-members said so, South Africa\'s years out, and only the real qualifying championships count for a men\'s World Cup ' + JSON.stringify(fj)); }
        /* More reasons for a missed tournament (21 Nov 2026, evening): the Central Asian republics before and just after the
           Soviet Union broke up, sides that changed confederation or joined late, bans and expulsions, the two African sides
           that cannot enter, and two qualifying routes that were not being counted (Africa's preliminary rounds of 2003 and
           2007, and the 2007 South Pacific Games for the 2010 World Cup). */
        { const mr = model.run(`(() => { state.gender = 'men'; const has = (x, w) => (x || '').indexOf(w) >= 0 ? 1 : 0, A = 'African Cup of Nations';
            const E = y => ({cat:'wc', tournament:'FIFA World Cup', label:String(y), start:Date.UTC(y, 5, 10)}), C = (t, y, mo) => ({cat:'cont', tournament:t, label:String(y), start:Date.UTC(y, mo || 0, 15)});
            const out = [has(absentWhy(C('AFC Asian Cup', 1988, 11), 'Kazakhstan'), 'part of the Soviet Union'), has(absentWhy(C('AFC Asian Cup', 1992, 9), 'Kazakhstan'), 'newly independent'), has(absentWhy(C('UEFA Euro', 2004, 5), 'Kazakhstan'), '25 April 2002'),
              has(absentWhy(C('AFC Asian Cup', 1992, 9), 'Uzbekistan'), 'newly independent'), absentWhy(C('AFC Asian Cup', 1996, 11), 'Uzbekistan') === '' ? 1 : 0, has(absentWhy(C('UEFA Euro', 1996, 5), 'Bosnia and Herzegovina'), 'UEFA in 1998'), has(absentWhy(C('UEFA Euro', 2008, 5), 'Montenegro'), '26 January 2007'),
              absentWhy(C(A, 1963, 10), 'Zanzibar') === '' ? 1 : 0, has(absentWhy(C(A, 1965, 10), 'Zanzibar'), 'cannot enter'), has(absentWhy(C(A, 2024), 'R\\u00e9union'), 'never been a full member'), absentWhy(C('AFC Asian Cup', 2024), 'Zanzibar') === '' ? 1 : 0,
              has(absentWhy(C(A, 2015), 'Morocco'), 'intended host'), has(absentWhy(C(A, 2015), 'Gambia'), 'over-age'), has(absentWhy(C(A, 2019, 5), 'Chad'), 'barred'), has(absentWhy(C(A, 2024), 'Kenya'), 'suspended by FIFA'), has(absentWhy(C(A, 2024), 'Zimbabwe'), 'suspended by FIFA'), absentWhy(C(A, 2022), 'Kenya') === '' ? 1 : 0,
              QUAL_EARLY[A+'|2006'] === Date.UTC(2003, 9, 1) ? 1 : 0, QUAL_EARLY[A+'|2010'] === Date.UTC(2007, 10, 1) ? 1 : 0,
              wcViaCont(E(2010), {tournament:'South Pacific Games', cat:'games', ts:Date.UTC(2007, 7, 27)}, 'men') ? 1 : 0, !wcViaCont(E(2014), {tournament:'South Pacific Games', cat:'games', ts:Date.UTC(2011, 7, 27)}, 'men') ? 1 : 0, !wcViaCont(E(2010), {tournament:'South Pacific Games', cat:'games', ts:Date.UTC(2007, 7, 27)}, 'women') ? 1 : 0,
              has(absentWhy(E(2022), 'Samoa'), 'withdrew before'), has(absentWhy(E(2022), 'Tonga'), 'tsunami'), has(absentWhy(E(2022), 'Vanuatu'), 'COVID-19')].join('');
            state.gender = 'women'; return out; })()`);
          ok(mr === '1'.repeat(25), 'more reasons for a missed tournament: Central Asia, late joiners, bans, the two African associate members, and the qualifying routes of 2003, 2007 and the South Pacific Games ' + mr); }
        /* The Women's World Cup hub (20 Nov 2026): a single match read from the data gives its winner, a level one waits
           for its shoot-out, and a match not yet played gives nothing. */
        { const mw = model.run(`(() => { state.gender = 'women'; const c = getRatings(), ms = state.matches.women, n0 = ms.length, T = [...new Set(ms.flatMap(m => [m.home, m.away]))].slice(0, 4);
            const mk = (d, home, away, hs, as) => ({ts:Date.parse(d + 'T00:00:00Z'), home, away, hs, as, tournament:'FIFA World Cup qualification', cat:'wcq'}), from = Date.UTC(2030, 11, 1), to = Date.UTC(2031, 1, 1);
            ms.push(mk('2031-01-01', T[0], T[1], 1, 2), mk('2031-01-02', T[2], T[3], 1, 1));
            if (!state.shootouts.women) state.shootouts.women = new Map();
            const a = matchWinner(c, T[0], T[1], from, to), b0 = matchWinner(c, T[2], T[3], from, to); state.shootouts.women.set('2031-01-02|' + T[2] + '|' + T[3], T[3]);
            const b1 = matchWinner(c, T[3], T[2], from, to), none = matchWinner(c, T[0], T[2], from, to);
            ms.length = n0; state.shootouts.women.delete('2031-01-02|' + T[2] + '|' + T[3]);
            return {teams:T.length, a:!!a && a.key === c.resolve(T[1]) && a.score.join() === '1,2', b0:!!b0 && b0.key === null, b1:!!b1 && b1.key === c.resolve(T[3]) && b1.pens === true && b1.score.join() === '1,1', none:none === null, back:ms.length === n0}; })()`);
          ok(mw.teams === 4 && mw.a && mw.b0 && mw.b1 && mw.none && mw.back, 'world cup hub: a single match from the data gives its winner, waits for a shoot-out when level, and gives nothing before it is played ' + JSON.stringify(mw)); }
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
      /* The rank after each match under "all time": a file a team, equal to the page's own under every band limit and
         rank order, and read back with no piece of the engine. */
      { const {rankAllFiles} = await import('./precompute.mjs');
        const RA = rankAllFiles(model, 'women'), tk = Object.keys(RA.teams);
        ok(RA.bad.length === 0 && RA.n > 20 && tk.length > 2 && tk.every(k => RA.teams[k].length > 0 && RA.teams[k].every(r => r.length === 49 && r.slice(1).every(v => v >= 1))),
          'all time: a team\'s rank after each of its matches, read from its own file, equals the page\'s under every band limit and rank order (' + RA.n + ' ranks)' + (RA.bad.length ? ' (' + RA.bad[0] + ')' : '')); }
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
  { /* Women's windows (20 Nov 2026): a day of one game says whose matches they are, a mixed day marks each row, competition
       names are short enough for a row, and with one post a day yesterday's results ride along as the last slide. */
    const {gameOf, slideComp} = await import('./social.mjs');
    const r = (g, i, comp) => ({g, home:'Home ' + i, away:'Away ' + i, hf:null, af:null, p:[60, 25, 15], call:0, kickoff:'2026-11-27T19:00:00+00:00', comp, top:i});
    const day = (gs, extra) => SB.today({type:'today', day:'2026-11-27', dayTxt:'Friday 27 November', n:5, list:gs.map((g, i) => r(g, i, i ? 'Friendly' : g === 'women' ? "FIFA Women's World Cup qualification" : 'FIFA World Cup qualification')), ...extra});
    const W = day(['women', 'women', 'women', 'women', 'women']), M = day(['men', 'men', 'men', 'men', 'men']), X = day(['women', 'men', 'women', 'men', 'men']);
    ok(gameOf([{g:'women'}, {g:'women'}]) === "Women's" && gameOf([{g:'men'}]) === "Men's" && gameOf([{g:'women'}, {g:'men'}]) === '' && gameOf([]) === ''
      && slideComp("FIFA Women's World Cup qualification", "Women's") === 'World Cup qualifying' && slideComp("FIFA Women's World Cup qualification", '') === "Women's World Cup qualifying"
      && slideComp("UEFA Women's Nations League", "Women's") === 'UEFA Nations League' && slideComp('FIFA World Cup qualification', "Men's") === 'World Cup qualifying' && slideComp('Friendly', '') === 'Friendly',
      'social posts: whose matches a day covers, and competition names short enough for a row');
    ok(/Women's matchday · Friday 27 November · 5 matches/.test(W.slides[0]) && /World Cup qualifying/.test(W.slides[0]) && !/FIFA/.test(W.slides[0]) && /^Women's international football today/.test(W.caption) && /biggest women's matches/.test(W.xText) && /^Women's international matches today/.test(W.alts[0])
      && /Men's matchday · Friday/.test(M.slides[0]) && /^Men's international football today/.test(M.caption) && !/women/i.test(M.caption.split('#')[0]),
      'social posts: a women\'s day says so on the slide, in the caption, in the X post and in the alt text; a men\'s day likewise');
    ok(/>Matchday · Friday 27 November/.test(X.slides[0]) && /Women · /.test(X.slides[0]) && /Men · /.test(X.slides[0]) && /Women's World Cup qualifying/.test(X.slides[0]) && /Home 0 v Away 0 \(women\)/.test(X.caption) && !/Home 1 v Away 1 \(women\)/.test(X.caption) && /^International football today/.test(X.caption),
      'social posts: a day with both games marks each row and each caption line instead');
    const res = (i, hit) => ({g:'women', home:'Home ' + i, away:'Away ' + i, hs:hit ? 2 : 0, as:hit ? 0 : 1, comp:'Friendly', hf:null, af:null, p:[60, 25, 15], call:0, o:hit ? 0 : 2, hit, v:hit ? 'right' : 'wrong', top:i});
    const yd = {type:'roundup', g:'women', day:'2026-11-26', dayTxt:'Thursday 26 November', n:5, hits:4, tally:{n:5, dec:5, won:4, draws:0, close:0}, list:[0, 1, 2, 3, 4].map(i => res(i, i < 4)), ups:[], big:null, win:{n:5, hits:4, dec:5, won:4, draws:0, close:0}, cmp:null};
    const WY = day(['women', 'women', 'women', 'women', 'women'], {yday:yd}), RY = SB.roundup(yd);
    ok(WY.slides.length === W.slides.length + 1 && WY.slides[WY.slides.length - 1] === RY.slides[0] && /Women's results · Thursday 26 November/.test(RY.slides[0]) && /^Women's international football results/.test(RY.caption)
      && /Yesterday, Thursday 26 November: Formline picked the winner in 4 of the 5 matches that had one; no draws\. The results are on the last slide\./.test(WY.caption) && WY.alts.length === W.alts.length + 1 && !/Yesterday/.test(W.caption),
      'social posts: with one post a day, yesterday\'s results are the last slide of today\'s matches and a line in the caption');
  }
  /* A window that is one game's asks the day's post for that game first (21 Nov 2026): the collectors that pick a match,
     a meeting, a tournament or the movers can be kept to one game, and the window says whose it is. */
  { const src = fs.readFileSync(path.join(HERE, 'social', 'collect.js'), 'utf8'), post = fs.readFileSync(path.join(HERE, 'social.mjs'), 'utf8');
    const gamesOf = new Function(src.match(/const gamesOf = [^\n]+/)[0] + ' return gamesOf;')();
    ok(gamesOf('women').join() === 'women' && gamesOf('men').join() === 'men' && gamesOf().join() === 'men,women' && gamesOf('x').join() === 'men,women'
      && ['match', 'spotlight', 'tieIn', 'rivalry', 'tournament', 'rankings'].every(t => new RegExp('S\\.' + t + ' = async \\(\\{[^}]*\\bonly\\b').test(src))
      && /by\.women >= 0\.8 \* n \? 'women'/.test(src) && /only:win\.g/.test(post) && /d1\.g === win\.g/.test(post),
      'social posts: in a window that is one game\'s, a thin day looks for a post about that game first'); }
  /* 22 Nov 2026, after the Copa América 1979 post said "in Chile" and "a 8% chance": the past-tournament post takes only
     editions settled by one final and names a host only where there was one; "an" before 8, 11, 18 and the eighties;
     two legs and a third match are "1st leg", "2nd leg", "play-off" on the page. */
  { const src = fs.readFileSync(path.join(HERE, 'social', 'collect.js'), 'utf8'), post = fs.readFileSync(path.join(HERE, 'social.mjs'), 'utf8'), pg = fs.readFileSync(path.join(HERE, '..', 'index.html'), 'utf8');
    const {aPct} = await import('./social.mjs');
    ok(aPct(8) === 'an 8%' && aPct(11) === 'an 11%' && aPct(18) === 'an 18%' && aPct(80) === 'an 80%' && aPct(85) === 'an 85%' && aPct(7) === 'a 7%' && aPct(12) === 'a 12%' && aPct(81) === 'an 81%' && aPct(28) === 'a 28%' && aPct(1) === 'a 1%'
      && !/had (just )?a \$\{/.test(post) && !/'given a '/.test(post), 'social posts: "an 8% chance", "a 12% chance"');
    ok(/fins\.length === 1 && st\.get\(fins\[0\]\) === 'Final' \? fins\[0\] : null; if \(!fin\) continue;/.test(src) && /k > 4 \|\| \(k > 1 && k\*2 > e\.teams\.size\) \? ''/.test(src) && /n < 0\.9\*all/.test(src)
      && /j === 0 \? ', 1st leg' : j === 1 \? ', 2nd leg' : ', play-off'/.test(pg) && /, play-off\$\/, ' \(play-off\)'/.test(post),
      'social posts: a past tournament is posted only if one final settled it, and it has a host only where there was one; a third match after two legs is the play-off'); }
  /* A coming match's day is the day in Toronto, where a kick-off time is known (22 Nov 2026): USA v El Salvador at 01:30
     UTC on Saturday 28 November is "Friday 27 November, 8:30 PM ET / 1:30 AM UK (Sat)", not "Saturday ..., 8:30 PM ET (Fri)". */
  { const src = fs.readFileSync(path.join(HERE, 'social', 'collect.js'), 'utf8'), post = fs.readFileSync(path.join(HERE, 'social.mjs'), 'utf8');
    const dayTxt = new Function(src.match(/const dayTxt = [^\n]+/)[0] + ' return dayTxt;')();
    const fxDayTxt = new Function('dayTxt', src.match(/const fxDayTxt = [^\n]+\n[^\n]+/)[0] + ' return fxDayTxt;')(dayTxt);
    const torDay = new Function(post.match(/const torDay = [^\n]+/)[0] + ' return torDay;')();
    ok(fxDayTxt({kickoff:'2026-11-28T01:30:00+00:00', date:'2026-11-28'}) === 'Friday 27 November' && fxDayTxt({kickoff:'', date:'2026-11-28'}) === 'Saturday 28 November'
      && fxDayTxt({kickoff:'2026-11-14T19:45:00+00:00', date:'2026-11-14'}) === 'Saturday 14 November' && torDay('2026-11-28T01:30:00+00:00') === '2026-11-27'
      && koText('2026-11-28T01:30:00+00:00', torDay('2026-11-28T01:30:00+00:00')) === '8:30 PM ET · 1:30 AM UK (Sat)'
      && (src.match(/day:fxDayTxt\(/g) || []).length === 4 && !/day:dayTxt\(Date\.parse\(/.test(src) && !/utcDay/.test(post),
      'social posts: a coming match is named by its day in Toronto, and the UK time says when it falls on the next day'); }
  /* The Victory Internationals of 1945–46 (22 Nov 2026): the nine the archive holds are left out, each with its reason, and
     Scotland's two with Belgium and Switzerland, full internationals for both sides, are not touched. */
  { const pg = fs.readFileSync(path.join(HERE, '..', 'index.html'), 'utf8');
    const rows = [...pg.matchAll(/\{date:'(194[56]-\d\d-\d\d)', home:'([^']+)', away:'([^']+)', score:'(\d+-\d+)', drop:'((?:[^'\\]|\\.)*)'\}/g)].map(m => m.slice(1));
    const key = rows.map(r => r.slice(0, 4).join('|')).sort().join(';');
    ok(rows.length === 9 && key === ['1945-05-26|England|France|2-2', '1945-07-21|Switzerland|England|3-1', '1945-09-15|Northern Ireland|England|0-1', '1945-10-20|England|Wales|0-1', '1946-01-19|England|Belgium|2-0',
        '1946-04-13|Scotland|England|1-0', '1946-04-24|England|Scotland|2-2', '1946-05-11|England|Switzerland|4-1', '1946-05-19|France|England|2-1'].sort().join(';')
      && rows.every(r => /Victory International|Bolton Disaster Fund/.test(r[4]) && /RSSSF/.test(r[4])) && !/date:'1946-01-23'|date:'1946-05-15'/.test(pg),
      'the Victory Internationals of 1945–46: nine left out with their reason; Scotland\'s two full internationals stay'); }
  /* The rival pairs checked against outside lists (22 Nov 2026): six archive rows that only one association counts are
     left out with their reason, the three La Manga rows of 2000 are gone from the hand-added list, and the thirteen
     matches found in two records are in it, each naming its records. */
  { const pg = fs.readFileSync(path.join(HERE, '..', 'index.html'), 'utf8'), mf = fs.readFileSync(path.join(HERE, 'store', 'manual-men.csv'), 'utf8').split('\n');
    const drop = (d, h, a, sc) => new RegExp("\\{date:'" + d + "', home:'" + h + "', away:'" + a + "', score:'" + sc + "', drop:'[^\\n]*RSSSF").test(pg);
    const set = (d, h, a, sc, what) => new RegExp("\\{date:'" + d + "', home:'" + h + "', away:'" + a + "', score:'" + sc + "', set:\\{" + what + "\\}, note:'[^\\n]*RSSSF").test(pg);
    const row = start => mf.filter(l => l.startsWith(start));
    const added = ['1970-09-13,Norway,Sweden,2,4,Nordic Championship,', '1983-05-19,Denmark,Norway,2,2,Olympic Games qualification,', '1983-08-17,Norway,Denmark,1,1,Olympic Games qualification,',
      '1971-08-20,Malaysia,Singapore,4,2,Merdeka Tournament,', "1978-05-05,Malaysia,Singapore,3,2,King's Cup,", '1965-02-27,Kenya,Uganda,3,0,African Cup of Nations qualification,',
      '1965-03-13,Uganda,Kenya,3,1,African Cup of Nations qualification,', '1972-10-08,Uganda,Kenya,2,0,Friendly,', '1981-07-25,Kenya,Uganda,0,0,Friendly,', '1986-12-12,Kenya,Uganda,3,0,Friendly,',
      '1991-06-27,Uganda,Kenya,0,0,Friendly,', '1996-05-05,Kenya,Uganda,2,1,Friendly,', '1996-05-07,Kenya,Uganda,1,0,Friendly,'];
    ok(drop('2018-01-11', 'Denmark', 'Sweden', '0-1') && drop('1981-02-28', 'Norway', 'Sweden', '2-4') && drop('1950-06-25', 'Denmark', 'Norway', '1-4') && drop('1957-07-12', 'Denmark', 'Norway', '1-3')
      && drop('1983-09-03', 'Malaysia', 'Singapore', '0-0') && drop('1983-09-10', 'Singapore', 'Malaysia', '0-1')
      && set('1971-08-23', 'Singapore', 'Malaysia', '2-4', 'hs:2, as:2') && set('1971-10-30', 'Malaysia', 'Singapore', '1-1', 'ts:Date\\.UTC\\(1971, 9, 31\\)')
      && set('1932-08-25', 'Uganda', 'Kenya', '13-1', 'ts:Date\\.UTC\\(1932, 11, 14\\)') && set('1935-05-11', 'Kenya', 'Uganda', '1-3', 'ts:Date\\.UTC\\(1936, 2, 28\\)')
      && set('1938-10-10', 'Kenya', 'Uganda', '1-3', 'ts:Date\\.UTC\\(1938, 2, 26\\)') && set('1939-11-28', 'Uganda', 'Kenya', '5-2', 'ts:Date\\.UTC\\(1939, 2, 25\\)')
      && set('1944-11-07', 'Kenya', 'Uganda', '2-1', 'ts:Date\\.UTC\\(1944, 2, 25\\)') && set('1966-11-30', 'Uganda', 'Kenya', '1-2', 'ts:Date\\.UTC\\(1966, 9, 8\\)')
      && !mf.some(l => /^2000-0[12]-\d\d,(Sweden|Norway|Finland),Denmark,/.test(l))
      && added.every(a => { const r = row(a); return r.length === 1 && /RSSSF/.test(r[0]) && /World Football Elo Ratings|Wikipedia/.test(r[0]); }),
      'rival pairs checked against outside lists: one-sided matches left out, wrong dates and a score put right, and thirteen missing matches added with two records each'); }
  /* The country-by-country check of older matches (begun 22 Nov 2026): Kenya and Uganda. Each added row names Elo and
     RSSSF's list for the country; the row two days after an archive match of the same two teams is marked separate;
     matches RSSSF marks as doubtful are not in the list. */
  { const mf = fs.readFileSync(path.join(HERE, 'store', 'manual-men.csv'), 'utf8').split('\n');
    const row = start => mf.filter(l => l.startsWith(start));
    const added = ['1963-11-10,Ethiopia,Kenya,7,1,Olympic Games qualification,', '1965-02-14,Kenya,Ethiopia,3,2,African Cup of Nations qualification,', '1965-04-04,Ethiopia,Kenya,2,1,', '1965-04-11,Sudan,Kenya,4,2,',
      '1965-04-25,Kenya,Sudan,1,1,', '1967-12-19,Kenya,Zambia,3,4,', '1974-10-26,Tanzania,Kenya,0,0,CECAFA Cup,', '1976-07-02,Kenya,Mauritius,4,3,', '1987-06-27,Egypt,Kenya,4,0,Olympic Games qualification,',
      '1987-11-15,Zambia,Uganda,5,0,Olympic Games qualification,', '1996-11-14,Uganda,Rwanda,3,2,', '1997-01-05,Kenya,Malawi,0,0,', '1999-04-04,Uganda,Kenya,0,0,', '2003-05-28,Uganda,Tanzania,3,1,'];
    ok(added.every(a => { const r = row(a); return r.length === 1 && /World Football Elo Ratings/.test(r[0]) && /RSSSF \((Kenya|Uganda) international matches\)/.test(r[0]); })
      && /,TRUE$/.test(row('1967-12-19,Kenya,Zambia,3,4,')[0] || '')
      && !['1965-04-12,Sudan,Kenya', '1973-12-15,Kenya,Lesotho', '1991-11-11,Tanzania,Kenya', '2008-07-06,Malawi,Kenya', '1972-10-29,Uganda,Libya'].some(a => row(a).length),
      'older matches, Kenya and Uganda: added rows name both records, the second Jamhuri match is marked separate, and doubtful matches stay out'); }
  /* The same check for Tanzania, Ethiopia, Zambia and Malawi: rows name Elo and an RSSSF list, annulled qualifiers say
     so, asterisked and Southern Rhodesian matches stay out, and two archive dates are moved. */
  { const pg = fs.readFileSync(path.join(HERE, '..', 'index.html'), 'utf8'), mf = fs.readFileSync(path.join(HERE, 'store', 'manual-men.csv'), 'utf8').split('\n');
    const row = start => mf.filter(l => l.startsWith(start));
    const added = ['1956-01-29,Ethiopia,Egypt,1,4,Olympic Games qualification,', '1973-07-07,Tanzania,Ethiopia,3,0,', '1974-10-30,Tanzania,Zambia,1,0,CECAFA Cup,', '1976-03-28,Zambia,Sudan,2,2,Olympic Games qualification,',
      '1983-10-02,Zimbabwe,Ethiopia,3,2,', '1988-01-31,Ghana,Zambia,1,0,', '1996-12-21,Zimbabwe,Zambia,2,2,', '2003-03-26,Ethiopia,Benin,3,0,', '2010-12-04,Tanzania,Burundi,2,0,CECAFA Cup,', '2013-07-06,Malawi,Mozambique,0,1,'];
    const annulled = ['1992-08-15,Tanzania,Ghana,2,2,', '1992-08-30,Liberia,Tanzania,1,1,', '1995-01-22,Lesotho,Malawi,0,2,', '2000-09-02,Uganda,Guinea,3,1,', '2008-05-31,Morocco,Ethiopia,3,0,', '2008-06-08,Ethiopia,Rwanda,1,2,', '2008-06-13,Mauritania,Ethiopia,0,1,', '2008-06-22,Ethiopia,Mauritania,6,1,'];
    ok(added.concat(annulled).every(a => { const r = row(a); return r.length === 1 && /World Football Elo Ratings/.test(r[0]) && /RSSSF \(/.test(r[0]); })
      && annulled.every(a => /annulled/.test(row(a)[0]))
      && !['1967-03-25,Malawi,Zimbabwe', '1969-05-04,Zimbabwe,Malawi', '1964-07-20,Zambia,Malawi', '1975-06-07,Tanzania,Congo', '1974-12-08,Ethiopia,China', '1976-03-02,Malawi,Lesotho'].some(a => row(a).length)
      && /\{date:'1976-02-08', home:'Malawi', away:'Lesotho', score:'4-1', set:\{ts:Date\.UTC\(1976, 1, 28\)\}/.test(pg) && /\{date:'1989-12-01', home:'Botswana', away:'Zambia', score:'2-1', set:\{ts:Date\.UTC\(1989, 9, 1\)\}/.test(pg),
      'older matches, Tanzania, Ethiopia, Zambia and Malawi: added rows name both records, annulled qualifiers say so, doubtful matches stay out, two dates moved'); }
  /* The same check for Mozambique, Eswatini, Lesotho and Congo: rows name Elo and an RSSSF list, annulled qualifiers
     say so, the CEMAC Cup and asterisked matches stay out, and two Congo matches move from 1964 to 1965. */
  { const pg = fs.readFileSync(path.join(HERE, '..', 'index.html'), 'utf8'), mf = fs.readFileSync(path.join(HERE, 'store', 'manual-men.csv'), 'utf8').split('\n');
    const row = start => mf.filter(l => l.startsWith(start));
    const added = ['1961-12-27,Congo,Niger,10,0,', '1976-07-11,Cameroon,Congo,3,2,Central African Games,', '1975-07-23,Cameroon,Congo,3,1,UDEAC Cup,', '1983-03-06,Mozambique,Lesotho,3,0,Olympic Games qualification,',
      '1985-07-07,Guinea-Bissau,Mozambique,3,3,', '1987-06-21,Zimbabwe,Eswatini,6,1,Olympic Games qualification,', '1988-07-31,Botswana,Eswatini,2,1,', '2001-01-06,Namibia,Lesotho,1,0,', '2012-02-22,Namibia,Mozambique,3,0,'];
    const annulled = ['1992-08-30,Congo,Chad,2,0,', '1994-09-04,Congo,Gambia,1,1,', '1995-04-09,Gambia,Congo,1,1,', '1994-09-04,Zimbabwe,Lesotho,5,0,', '1994-11-13,Lesotho,Cameroon,2,0,', '1995-01-08,DR Congo,Lesotho,3,0,',
      '1995-04-09,Lesotho,Zimbabwe,0,2,', '1995-06-04,Cameroon,Lesotho,4,1,', '1999-01-24,Ghana,Mozambique,1,0,'];
    ok(added.concat(annulled).every(a => { const r = row(a); return r.length === 1 && /World Football Elo Ratings/.test(r[0]) && /RSSSF \(/.test(r[0]); })
      && annulled.every(a => /annulled/.test(row(a)[0]))
      && !mf.some(l => /^200[3-7]-\d\d-\d\d,(Congo|Gabon|Chad|Equatorial Guinea),(Congo|Gabon|Chad|Equatorial Guinea|Central African Republic),\d+,\d+,(Friendly|CEMAC)/.test(l) && /RSSSF \(Congo/.test(l))
      && !['1981-04-19,Zimbabwe,Mozambique', '1977-12-30,Cameroon,Congo', '2013-03-13,Mozambique,Eswatini', '1988-09-30,Botswana,Zimbabwe'].some(a => row(a).length)
      && /\{date:'1964-02-14', home:'Congo', away:'Cameroon', score:'4-4', set:\{ts:Date\.UTC\(1965, 1, 14\)\}/.test(pg) && /\{date:'1964-03-28', home:'Congo', away:'Chad', score:'11-0', set:\{ts:Date\.UTC\(1965, 2, 28\)\}/.test(pg),
      'older matches, Mozambique, Eswatini, Lesotho and Congo: added rows name both records, annulled qualifiers say so, the CEMAC Cup and doubtful matches stay out, two dates moved'); }
  /* What's new is drawn as plain text, so an HTML entity typed into an item would show as typed ("1&ndash;1"). None may be there. */
  { const pg = fs.readFileSync(path.join(HERE, '..', 'index.html'), 'utf8'), a = pg.indexOf('const CHANGELOG'), b = pg.indexOf('\n];', a);
    ok(a > 0 && b > a && !/&[a-zA-Z]+;/.test(pg.slice(a, b)), "What's new: no HTML entities in the items, which are shown as plain text"); }
  /* The page for posting by hand (22 Nov 2026): on the site, kept out of search, and its caption never says "link in
     bio": every wording the post builder uses comes out with the site's address written once. */
  { const tp = path.join(HERE, '..', 'today', 'index.html'), th = fs.existsSync(tp) ? fs.readFileSync(tp, 'utf8') : '', post = fs.readFileSync(path.join(HERE, 'social.mjs'), 'utf8');
    const {isSiteFile} = await import('./site.mjs');
    const fn = (th.match(/function captionElsewhere\(c\)\{[\s\S]*?\n\}/) || [''])[0], captionElsewhere = fn ? new Function(fn + ' return captionElsewhere;')() : null;
    const lines = [...post.matchAll(/[^\n`]{0,80}\(link in bio\)[^\n`\\]{0,6}/g)].map(m => m[0].replace(/\$\{[^}]*\}/g, 'x'));
    const out = captionElsewhere ? lines.map(l => captionElsewhere(l)) : [];
    ok(th && /<meta name="robots" content="noindex, nofollow">/.test(th) && isSiteFile('today/index.html') && /social-queue\//.test(th) && !/\r/.test(th)
      && lines.length >= 10 && out.every(o => !/link in bio/.test(o) && (o.match(/formlinedata\.com/g) || []).length === 1 && !/\u{1F446}/u.test(o)),
      'today\'s post page: published, kept out of search, and every caption wording loses "link in bio" for the site\'s address (' + lines.length + ' wordings)'); }
  ok(koText('2026-11-12T19:45:00+00:00', '2026-11-12') === '2:45 PM ET · 7:45 PM UK', 'social posts: a kick-off is given in Toronto and UK time');
  ok(koText('2026-11-13T00:30:00+00:00', '2026-11-12') === '7:30 PM ET · 12:30 AM UK (Fri)', 'social posts: a zone where the match is on another day says which day');
  ok(koText('2026-06-11T19:00:00+00:00', '2026-06-11') === '3:00 PM ET · 8:00 PM UK' && koText('', '2026-06-11') === '', 'social posts: summer time in both zones, and no text without a kick-off');
}
console.log('\n' + passed + ' checks passed');
