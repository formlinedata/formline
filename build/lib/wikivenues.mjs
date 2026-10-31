// Venues from Wikipedia, the second source after API-Football. Each national team's "results" article lists its
// coming matches in match boxes ({{Football box collapsible}}) with the stadium and the city, usually well before
// API-Football has them. Read through Wikipedia's API (allowed); the content is CC BY-SA 4.0, credited in the site's
// footer. Only fixtures still without a known venue are looked up, each team's article at most every few days.
import {codeOf} from './fifacodes.mjs';
import {normKey} from './names.mjs';

const API = 'https://en.wikipedia.org/w/api.php';
const UA = 'Formline national-team ratings (nightly venue check; formline.info@gmail.com; https://formlinedata.github.io/formline/)';
const MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];

/* The template at each "{{Football box" in a page, braces balanced. */
export function footballBoxes(wikitext){
  const out = [], re = /\{\{\s*football\s?box[^|}]*\|/gi;
  let m;
  while ((m = re.exec(wikitext))){
    let depth = 0, i = m.index;
    for (; i < wikitext.length; i++){
      if (wikitext.startsWith('{{', i)){ depth++; i++; }
      else if (wikitext.startsWith('}}', i)){ depth--; i++; if (!depth) break; }
    }
    out.push(wikitext.slice(m.index + 2, i - 1));
    re.lastIndex = i;
  }
  return out;
}
/* A template's named parameters, split at the top level only. */
export function params(body){
  const parts = [], out = {}; let depth = 0, link = 0, cur = '';
  for (let i = 0; i < body.length; i++){
    const two = body.slice(i, i + 2);
    if (two === '{{'){ depth++; cur += two; i++; continue; }
    if (two === '}}'){ depth--; cur += two; i++; continue; }
    if (two === '[['){ link++; cur += two; i++; continue; }
    if (two === ']]'){ link--; cur += two; i++; continue; }
    if (body[i] === '|' && !depth && !link){ parts.push(cur); cur = ''; continue; }
    cur += body[i];
  }
  parts.push(cur);
  for (const p of parts.slice(1)){ const k = p.indexOf('='); if (k > 0) out[p.slice(0, k).trim().toLowerCase()] = p.slice(k + 1).trim(); }
  return out;
}
const pad = n => String(n).padStart(2, '0');
/* A match box's date as YYYY-MM-DD: {{Start date|2026|11|14}}, {{dts|...}}, "14 November 2026" or "November 14, 2026". */
export function boxDate(s){
  if (!s) return null;
  let m = s.match(/\{\{\s*(?:start date|dts|date)[^|}]*\|\s*(\d{4})\s*\|\s*(\d{1,2})\s*\|\s*(\d{1,2})/i);
  if (m) return m[1]+'-'+pad(m[2])+'-'+pad(m[3]);
  const t = s.replace(/<[^>]*>/g, ' ').replace(/\{\{[^}]*\}\}/g, ' ').toLowerCase();
  m = t.match(/(\d{1,2})\s+([a-z]+)\s+(\d{4})/); if (m && MONTHS.includes(m[2])) return m[3]+'-'+pad(MONTHS.indexOf(m[2]) + 1)+'-'+pad(m[1]);
  m = t.match(/([a-z]+)\s+(\d{1,2}),?\s+(\d{4})/); if (m && MONTHS.includes(m[1])) return m[3]+'-'+pad(MONTHS.indexOf(m[1]) + 1)+'-'+pad(m[2]);
  return null;
}
/* A team cell: its FIFA code from {{fb|JPN}}, {{fbw-rt|JPN}}, {{flagicon|JPN}} and the like; otherwise its name from a
   link, turned into a code. */
export function boxTeam(s){
  if (!s) return null;
  const m = s.match(/\{\{\s*(?:fb|fbw|fb-rt|fbw-rt|flagicon|flagcountry|fbu|fbu-rt)\s*\|\s*([A-Z]{3})\b/i)
    || s.match(/\{\{\s*#invoke:\s*(?:flag|fb)\w*\s*\|[^|}]*\|\s*([A-Z]{3})\s*[|}]/i);   // {{#invoke:flag|deco|MEX}}
  if (m) return m[1].toUpperCase();
  const l = s.match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);
  const name = l ? (l[2] || l[1]) : s.replace(/<[^>]*>|\{\{[^}]*\}\}|'''?/g, '').trim();
  return codeOf(name.replace(/ (women's )?national (football|soccer) team.*$/i, '').trim());
}
/* Kick-off in UTC when the box gives a time with its offset, {{UTZ|20:00|-5}}; otherwise null (a bare time's zone is
   unknown). */
export function boxKickoff(date, time){
  const m = String(time || '').match(/\{\{\s*UTZ\s*\|\s*(\d{1,2}):(\d{2})\s*\|\s*([+\-−]?\d{1,2})(?::?(\d{2}))?/i);
  if (!m || !date) return null;
  const sign = /^[\-−]/.test(m[3]) ? -1 : 1, off = sign * (Math.abs(parseInt(m[3].replace('−', '-'), 10)) * 60 + (m[4] ? +m[4] : 0));
  const t = Date.parse(date + 'T' + pad(m[1]) + ':' + m[2] + ':00Z') - off * 6e4;
  return isNaN(t) ? null : new Date(t).toISOString().replace('.000Z', '+00:00');
}
/* Wiki markup to plain text: links to their text, templates and references out. */
export const plain = s => String(s || '').replace(/<ref[^>]*\/>|<ref[^>]*>[\s\S]*?<\/ref>/gi, '').replace(/\{\{[^{}]*\}\}/g, '')
  .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1').replace(/<[^>]*>/g, '').replace(/'''?/g, '').replace(/\s+/g, ' ').trim();
/* The matches a results article lists: date, the two codes, stadium, city and country (the last part of the location,
   when it names one). */
export function pageMatches(wikitext){
  const out = [];
  for (const b of footballBoxes(wikitext)){
    const P = params(b), date = boxDate(P.date);
    const t1 = boxTeam(P.team1), t2 = boxTeam(P.team2);
    if (!date || !t1 || !t2) continue;
    let loc = plain(P.location).split(',').map(x => x.trim()).filter(Boolean), stadium = plain(P.stadium);
    /* Competition articles often give "[[Stadium]], [[City]]" with no location: the city is the stadium's last part. */
    if (!loc.length && stadium.includes(',')){ const sp = stadium.split(',').map(x => x.trim()).filter(Boolean); stadium = sp[0]; loc = sp.slice(1); }
    /* "Kingstown (Saint Vincent and the Grenadines)" or a bare "(United States)": the part in brackets is the country. */
    loc = loc.flatMap(x => { const b = x.match(/^(.*?)\s*\(([^()]+)\)$/); return b ? [b[1], b[2]].map(y => y.trim()).filter(Boolean) : [x]; });
    out.push({date, t1, t2, stadium, city:loc[0] || '', country:loc.length > 1 ? loc[loc.length - 1] : '', kickoff:boxKickoff(date, P.time)});
  }
  return out;
}
const dayDiff = (a, b) => Math.abs(Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z'))/864e5;
/* The match box for a fixture: the same two teams, within a day (time zones). Failing that, the same home and away
   sides within a week, nearest first: API-Football sometimes lists a placeholder date for a match whose real date is
   already announced (CONCACAF Nations League quarter-finals, Nov 2026: 9 Nov in the API, 12 and 14 Nov in fact).
   Home and away must match for a moved date, so the other leg of a two-legged tie is never taken for it. */
export function findMatch(list, fx){
  const h = codeOf(fx.home_team), a = codeOf(fx.away_team);
  if (!h || !a) return null;
  const near = list.find(m => dayDiff(m.date, fx.date) <= 1 && ((m.t1 === h && m.t2 === a) || (m.t1 === a && m.t2 === h)));
  if (near) return near;
  const moved = list.filter(m => m.t1 === h && m.t2 === a && dayDiff(m.date, fx.date) <= 7).sort((x, y) => dayDiff(x.date, fx.date) - dayDiff(y.date, fx.date));
  return moved.length ? {...moved[0], moved:true} : null;
}
/* The country a match box names, in the archive's spelling: its location's last part, or else the city looked up in
   the archive's own record of cities. */
/* Wikipedia's spellings of countries the archive names differently. */
const WIKI_COUNTRY = {'Democratic Republic of the Congo':'DR Congo', 'Republic of the Congo':'Congo', 'Timor-Leste':'East Timor',
  "People's Republic of China":'China', 'Republic of China':'Taiwan', 'State of Palestine':'Palestine', 'Federated States of Micronesia':'Micronesia'};
export function boxCountry(m, cities, cityKey, toArchive, known){
  /* The last part of the location only counts when it is a country the archive knows: "Harrison, New Jersey" names a
     state, not a country, and then the city is looked up instead. */
  if (m.country){ const c = toArchive(WIKI_COUNTRY[m.country] || m.country); if (!known || known.has(c)) return c; }
  if (m.city && cities) return cities.get(cityKey(m.city)) || '';
  return '';
}
/* Titles to try for a team's results article. */
export const titleRe = (team, women) => new RegExp('^' + team.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
  (women ? " women's" : "( men's)?") + ' national (football|soccer) team results', 'i');

/* The team's main article where Wikipedia's name differs from the archive's (as on the site; others go through
   Wikipedia's redirects, e.g. Turkey to Türkiye). */
const WIKI_TEAM = {
  men:{'United States':"United States men's national soccer team", 'Canada':"Canada men's national soccer team",
    'Australia':"Australia men's national soccer team", 'New Zealand':"New Zealand men's national football team",
    'Taiwan':'Chinese Taipei national football team', 'East Timor':'Timor-Leste national football team'},
  women:{'United States':"United States women's national soccer team", 'Canada':"Canada women's national soccer team",
    'Australia':"Australia women's national soccer team", 'Taiwan':"Chinese Taipei women's national football team",
    'East Timor':"Timor-Leste women's national football team"}};
/* Wikipedia's own name for a team: its main article, redirects followed (Taiwan -> Chinese Taipei), the "national
   football team" part taken off. Falls back to the archive's name. */
export const baseName = title => title.replace(/ (men's |women's )?national (football|soccer) team$/i, '').trim();
/* Which of these titles exist, after normalising and redirects: Map requested title -> the article's title. 50 titles
   per request, as Wikipedia allows. */
async function existing(fetchImpl, titles, stats){
  const out = new Map();
  for (let i = 0; i < titles.length; i += 50){
    const chunk = titles.slice(i, i + 50); stats.asked++;
    const j = await api(fetchImpl, {action:'query', titles:chunk.join('|'), redirects:'1'});
    const q = j.query || {}, norm = new Map((q.normalized || []).map(x => [x.from, x.to])), red = new Map((q.redirects || []).map(x => [x.from, x.to]));
    const ok = new Set((q.pages || []).filter(pg => pg && pg.title && !pg.missing && !pg.invalid).map(pg => pg.title));
    for (const t of chunk){ let f = norm.get(t) || t; f = red.get(f) || f; if (ok.has(f)) out.set(t, f); }
  }
  return out;
}
/* The results article for each team not looked up recently, without a search where possible: Wikipedia's name comes
   from the team's main article (redirects followed: Taiwan -> Chinese Taipei), then the usual results titles are
   tried in order, 2020–present first. A search is the fallback, for at most ten teams a run. */
async function resolveTitles(fetchImpl, keys, cache, today, stats, limit){
  const need = keys.filter(k => { const T = cache.titles[k]; return !T || dayDiff(T.checked, today) > (T.title ? 90 : 30); });
  if (!need.length) return;
  const mains = new Map(need.map(k => { const [g, team] = k.split('|'), w = g === 'women';
    return [k, [WIKI_TEAM[g][team], team + (w ? " women's" : '') + ' national football team', team + (w ? " women's" : " men's") + ' national soccer team'].filter(Boolean)]; }));
  const M = await existing(fetchImpl, [...new Set([...mains.values()].flat())], stats);
  const names = new Map(need.map(k => { const hit = mains.get(k).map(t => M.get(t)).find(Boolean); return [k, hit ? baseName(hit) : k.split('|')[1]]; }));
  const cands = new Map(need.map(k => { const w = k.startsWith('women|'), n = names.get(k);
    const stems = w ? [n + " women's national football team results", n + " women's national soccer team results"]
      : [n + ' national football team results', n + " men's national football team results", n + " men's national soccer team results", n + ' national soccer team results'];
    return [k, stems.map(x => x + ' (2020–present)').concat(stems)]; }));
  const R = await existing(fetchImpl, [...new Set([...cands.values()].flat())], stats);
  let searches = 0;
  for (const k of need){
    let title = cands.get(k).map(t => R.get(t)).find(Boolean) || '';
    if (!title && searches < 10 && stats.asked < limit){
      searches++; stats.asked++;
      const w = k.startsWith('women|'), n = names.get(k);
      const j = await api(fetchImpl, {action:'query', list:'search', srlimit:'10', srsearch:n + (w ? " women's" : '') + ' national team results'});
      const re = titleRe(n, w), hits = ((j.query && j.query.search) || []).map(x => x.title).filter(t => re.test(t));
      /* the one running to the present, else the undated one, else the one ending latest */
      const end = t => { const m = t.match(/(\d{4})\)$/) || t.match(/–(\d{2})\)$/); return m ? +m[1] : 0; };
      title = hits.find(t => /present/i.test(t)) || hits.find(t => !/\(/.test(t)) || hits.sort((a, b) => end(b) - end(a))[0] || '';
    }
    cache.titles[k] = {title, name:names.get(k), checked:today};
  }
}
/* The competition key for a fixture: gender, tournament, year. */
const compKey = fx => fx.gender + '|' + fx.tournament + '|' + String(fx.date).slice(0, 4);
/* Season articles for a competition from search results. A title must start with the season ("2026", "2026–27",
   "2025–26"; for qualifying, also next year's: "2027 Africa Cup of Nations qualification" is played in 2026) and contain
   every word of the competition's name, loosely (the first five letters: "African" finds "Africa"), with "women's"
   only for the women, and no youth, futsal or beach versions. Up to six articles (the main one, League A, B, C, D, the
   play-in round …). Friendlies have no season article. */
const COMP_STOP = new Set(['of', 'the', 'and', 'de', 'cup']);
export function compTitles(titles, tour, year, women){
  if (/^friendly$/i.test(tour)) return [];
  const qual = /qualification/i.test(tour);
  const seasons = [String(year), year + '–' + String(year + 1).slice(2), (year - 1) + '–' + String(year).slice(2),
    year + '-' + String(year + 1).slice(2), (year - 1) + '-' + String(year).slice(2)].concat(qual ? [String(year + 1)] : []);
  const words = tour.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z]+/).filter(w => w && !COMP_STOP.has(w));
  const has = t => { const tl = t.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, ''); return words.every(w => tl.includes(w.slice(0, 5))); };
  const YOUTH = /futsal|beach|\bU-?\d{2}\b|under-?\d{2}|youth|olympic/i;
  return titles.filter(t => seasons.some(s => t.startsWith(s + ' ')) && has(t) && /women/i.test(t) === !!women)
    .filter(t => (!/qualification/i.test(t) || qual) && (!YOUTH.test(t) || YOUTH.test(tour))).slice(0, 6);
}
async function api(fetchImpl, q){
  const res = await fetchImpl(API + '?' + new URLSearchParams({format:'json', formatversion:'2', ...q}), {headers:{'User-Agent':UA}});
  if (!res.ok) throw new Error('Wikipedia HTTP ' + res.status);
  return res.json();
}
/* Looks up venues for fixtures still without one. cache: {titles:{'men|Japan': {title, checked}}, pages:{title: {fetched, matches}}}.
   Returns Map fixture api_id -> {city, country, stadium}. Never throws: Wikipedia trouble only means fewer venues. */
export async function wikiVenues(fixtures, cache, {fetchImpl = globalThis.fetch, today, limit = 400, cities, cityKey, toArchive, log = () => {},
  all = fixtures, teams = null, horizonDays = 30} = {}){
  cache.titles = cache.titles || {}; cache.pages = cache.pages || {};
  const found = new Map(), stats = {asked:0, pages:0, matched:0, errors:0};
  const soon = fx => dayDiff(fx.date, today) <= 4;
  /* First the competition's own season articles ("2026–27 CONCACAF Nations League A"): they list every match with its
     date, time and stadium, and are often kept up better than smaller teams' results articles. */
  cache.comps = cache.comps || {};
  const compWant = new Map();   // 'gender|tournament|year' -> soonest fixture date: every competition with a fixture coming up
  for (const fx of all){ if (fx.tbd || dayDiff(fx.date, today) > horizonDays) continue; const k = compKey(fx); if (!compWant.has(k) || fx.date < compWant.get(k)) compWant.set(k, fx.date); }
  for (const k of [...compWant.keys()].sort((a, b) => compWant.get(a) < compWant.get(b) ? -1 : 1)){
    if (stats.asked >= limit) break;
    const [g, tour, year] = k.split('|');
    try {
      let C = cache.comps[k];
      if (/^friendly$/i.test(tour)) continue;
      if (!C || dayDiff(C.checked, today) > 30){
        stats.asked++;
        const j = await api(fetchImpl, {action:'query', list:'search', srlimit:'10', srsearch:year + ' ' + tour + (g === 'women' && !/women/i.test(tour) ? " women's" : '')});
        C = cache.comps[k] = {titles:compTitles(((j.query && j.query.search) || []).map(x => x.title), tour, +year, g === 'women'), checked:today};
      }
      for (const title of C.titles){
        if (stats.asked >= limit) break;
        const P = cache.pages[title], fresh = P && dayDiff(P.fetched, today) < (soon({date:compWant.get(k)}) ? 1 : 3);
        if (fresh) continue;
        stats.asked++;
        const j = await api(fetchImpl, {action:'parse', page:title, prop:'wikitext', redirects:'1'});
        const text = j.parse && (typeof j.parse.wikitext === 'string' ? j.parse.wikitext : j.parse.wikitext && j.parse.wikitext['*']);
        if (!text) continue;
        cache.pages[title] = {fetched:today, matches:pageMatches(text).filter(m => m.date >= today)};
        stats.pages++;
      }
    } catch(e){ stats.errors++; log('Wikipedia: ' + tour + ': ' + e.message); if (stats.errors >= 5) break; }
  }
  const want = new Map();   // 'gender|team' -> soonest fixture date
  for (const fx of fixtures) for (const t of [fx.home_team, fx.away_team]){ const k = fx.gender + '|' + t; if (!want.has(k) || fx.date < want.get(k)) want.set(k, fx.date); }
  const keys = [...want.keys()].sort((a, b) => want.get(a) < want.get(b) ? -1 : 1);
  /* Titles found before 31 Oct 2026 came from a search that sometimes picked an old decade's article (Ghana 1990–99,
     Mexico's undated one instead of 2020–present): look them all up again once. */
  if (cache.titlesV !== 2){ cache.titles = {}; cache.titlesV = 2; }
  try { await resolveTitles(fetchImpl, keys, cache, today, stats, limit); }
  catch(e){ stats.errors++; log('Wikipedia: titles: ' + e.message); }
  for (const k of keys){
    if (stats.asked >= limit) break;
    const [g, team] = k.split('|');
    try {
      const T = cache.titles[k];
      if (!T || !T.title) continue;
      const P = cache.pages[T.title], fresh = P && dayDiff(P.fetched, today) < (soon({date:want.get(k)}) ? 1 : 3);
      if (!fresh){
        stats.asked++;
        const j = await api(fetchImpl, {action:'parse', page:T.title, prop:'wikitext', redirects:'1'});
        const text = j.parse && (typeof j.parse.wikitext === 'string' ? j.parse.wikitext : j.parse.wikitext && j.parse.wikitext['*']);
        if (!text) continue;
        cache.pages[T.title] = {fetched:today, matches:pageMatches(text).filter(m => m.date >= today)};
        stats.pages++;
      }
    } catch(e){ stats.errors++; log('Wikipedia: ' + team + ': ' + e.message); if (stats.errors >= 5) break; }
  }
  /* Every fixture against every cached article of either team, then the competition's articles. A box with a venue
     is preferred to one without. */
  const known = new Set(cities ? [...cities.values()] : []); fixtures.forEach(fx => { known.add(fx.home_team); known.add(fx.away_team); });
  for (const fx of fixtures){
    const pages = [];
    for (const t of [fx.home_team, fx.away_team]){ const T = cache.titles[fx.gender + '|' + t]; if (T && T.title && cache.pages[T.title]) pages.push(cache.pages[T.title]); }
    const C = cache.comps[compKey(fx)]; if (C) for (const t of C.titles) if (cache.pages[t]) pages.push(cache.pages[t]);
    let best = null;
    for (const P of pages){
      const m = findMatch(P.matches, fx); if (!m) continue;
      const country = boxCountry(m, cities, cityKey, toArchive, known);
      if (!country && !m.moved) continue;
      const hit = {city:m.city, country, stadium:m.stadium, ...(m.moved ? {date:m.date} : {}), ...(m.kickoff ? {kickoff:m.kickoff} : {})};
      if (!best || (!best.country && country) || (!best.kickoff && hit.kickoff && !!best.country === !!country)) best = hit;
      if (best.country && best.kickoff) break;
    }
    if (!best) continue;
    found.set(String(fx.api_id), best); stats.matched++;
    if (best.date) stats.moved = (stats.moved || 0) + 1;
  }
  const extra = teams ? extraFixtures(cache, all, compWant, {today, horizonDays, teams, cities, cityKey, toArchive, known}) : [];
  stats.extra = extra.length;
  /* Old pages out of the cache. */
  for (const [t, P] of Object.entries(cache.pages)) if (dayDiff(P.fetched, today) > 30) delete cache.pages[t];
  return {found, stats, extra};
}

/* Matches a competition's Wikipedia season articles list that API-Football doesn't have at all (e.g. the CONCACAF
   Nations League play-in ties of Nov 2026): both teams known to the archive, in the next `horizonDays`, and no API
   fixture between the same two teams within a week either way round. teams: {men:Set, women:Set} of archive names. */
export function extraFixtures(cache, all, comps, {today, horizonDays = 30, teams, cities, cityKey, toArchive, known}){
  const byCode = {};
  for (const g of ['men', 'women']){ byCode[g] = new Map(); for (const t of teams[g] || []){ const c = codeOf(t); if (c && !byCode[g].has(c)) byCode[g].set(c, t); } }
  const out = [], seen = new Set();
  for (const k of comps.keys()){
    const [g, tour] = k.split('|'), C = cache.comps && cache.comps[k];
    if (!C) continue;
    for (const title of C.titles){
      const P = cache.pages[title]; if (!P) continue;
      for (const m of P.matches){
        if (m.date < today || dayDiff(m.date, today) > horizonDays) continue;
        const home = byCode[g].get(m.t1), away = byCode[g].get(m.t2);
        if (!home || !away || home === away) continue;
        const pair = (x, y) => (x === home && y === away) || (x === away && y === home);
        if (all.some(f => f.gender === g && pair(f.home_team, f.away_team) && dayDiff(f.date, m.date) <= 7)) continue;
        const id = g + '|' + m.date + '|' + home + '|' + away;
        if (seen.has(id)) continue; seen.add(id);
        out.push({id, gender:g, tournament:tour, date:m.date, kickoff:m.kickoff || null, home_team:home, away_team:away,
          city:m.city, stadium:m.stadium, country:boxCountry(m, cities, cityKey, toArchive, known), source:title});
      }
    }
  }
  return out.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
}
