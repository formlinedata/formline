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
  const m = s.match(/\{\{\s*(?:fb|fbw|fb-rt|fbw-rt|flagicon|flagcountry|fbu|fbu-rt)\s*\|\s*([A-Z]{3})\b/i);
  if (m) return m[1].toUpperCase();
  const l = s.match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);
  const name = l ? (l[2] || l[1]) : s.replace(/<[^>]*>|\{\{[^}]*\}\}|'''?/g, '').trim();
  return codeOf(name.replace(/ (women's )?national (football|soccer) team.*$/i, '').trim());
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
    const loc = plain(P.location).split(',').map(x => x.trim()).filter(Boolean);
    out.push({date, t1, t2, stadium:plain(P.stadium), city:loc[0] || '', country:loc.length > 1 ? loc[loc.length - 1] : ''});
  }
  return out;
}
const dayDiff = (a, b) => Math.abs(Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z'))/864e5;
/* The match box for a fixture: the same two teams, within a day (time zones). */
export function findMatch(list, fx){
  const h = codeOf(fx.home_team), a = codeOf(fx.away_team);
  if (!h || !a) return null;
  return list.find(m => dayDiff(m.date, fx.date) <= 1 && ((m.t1 === h && m.t2 === a) || (m.t1 === a && m.t2 === h))) || null;
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
async function wikiName(fetchImpl, team, women){
  const tries = [WIKI_TEAM[women ? 'women' : 'men'][team], team + (women ? " women's" : '') + ' national football team', team + (women ? " women's" : " men's") + ' national soccer team'].filter(Boolean);
  for (const t of tries){
    const j = await api(fetchImpl, {action:'query', titles:t, redirects:'1'});
    const pg = j.query && j.query.pages && j.query.pages[0];
    if (pg && !pg.missing && pg.title) return baseName(pg.title);
  }
  return team;
}
async function api(fetchImpl, q){
  const res = await fetchImpl(API + '?' + new URLSearchParams({format:'json', formatversion:'2', ...q}), {headers:{'User-Agent':UA}});
  if (!res.ok) throw new Error('Wikipedia HTTP ' + res.status);
  return res.json();
}
/* Looks up venues for fixtures still without one. cache: {titles:{'men|Japan': {title, checked}}, pages:{title: {fetched, matches}}}.
   Returns Map fixture api_id -> {city, country, stadium}. Never throws: Wikipedia trouble only means fewer venues. */
export async function wikiVenues(fixtures, cache, {fetchImpl = globalThis.fetch, today, limit = 100, cities, cityKey, toArchive, log = () => {}} = {}){
  cache.titles = cache.titles || {}; cache.pages = cache.pages || {};
  const found = new Map(), stats = {asked:0, pages:0, matched:0, errors:0};
  const soon = fx => dayDiff(fx.date, today) <= 4;
  const want = new Map();   // 'gender|team' -> soonest fixture date
  for (const fx of fixtures) for (const t of [fx.home_team, fx.away_team]){ const k = fx.gender + '|' + t; if (!want.has(k) || fx.date < want.get(k)) want.set(k, fx.date); }
  const keys = [...want.keys()].sort((a, b) => want.get(a) < want.get(b) ? -1 : 1);
  for (const k of keys){
    if (stats.asked >= limit) break;
    const [g, team] = k.split('|');
    try {
      let T = cache.titles[k];
      if (!T || dayDiff(T.checked, today) > (T.title ? 90 : 30)){   // found: checked again every 90 days (a new 2030- article); not found: every 30
        stats.asked += 2;
        const name = await wikiName(fetchImpl, team, g === 'women');
        const j = await api(fetchImpl, {action:'query', list:'search', srlimit:'8', srsearch:name + (g === 'women' ? " women's" : '') + ' national team results'});
        /* Several articles can match (2010-2019, 2020-present): the one running to the present, else the undated one. */
        const re = titleRe(name, g === 'women'), hits = ((j.query && j.query.search) || []).map(x => x.title).filter(t => re.test(t));
        const hit = hits.find(t => /present/i.test(t)) || hits.find(t => !/\(/.test(t)) || hits[0];
        T = cache.titles[k] = {title:hit || '', name, checked:today};
      }
      if (!T.title) continue;
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
  /* Every fixture against every cached article of either team. */
  const known = new Set(cities ? [...cities.values()] : []); fixtures.forEach(fx => { known.add(fx.home_team); known.add(fx.away_team); });
  for (const fx of fixtures){
    for (const t of [fx.home_team, fx.away_team]){
      const T = cache.titles[fx.gender + '|' + t], P = T && T.title && cache.pages[T.title];
      const m = P && findMatch(P.matches, fx); if (!m) continue;
      const country = boxCountry(m, cities, cityKey, toArchive, known);
      if (!country) continue;
      found.set(String(fx.api_id), {city:m.city, country, stadium:m.stadium}); stats.matched++; break;
    }
  }
  /* Old pages out of the cache. */
  for (const [t, P] of Object.entries(cache.pages)) if (dayDiff(P.fetched, today) > 30) delete cache.pages[t];
  return {found, stats};
}
