// Venues from Wikipedia, the second source after API-Football. Each national team's "results" article lists its
// coming matches in match boxes ({{Football box collapsible}}) with the stadium and the city, usually well before
// API-Football has them. Read through Wikipedia's API (allowed); the content is CC BY-SA 4.0, credited in the site's
// footer. Only fixtures still without a known venue are looked up, each team's article at most every few days.
import {codeOf, fifaCode} from './fifacodes.mjs';
import {normKey} from './names.mjs';

const API = 'https://en.wikipedia.org/w/api.php';
const UA = 'Formline national-team ratings (nightly venue check; hello@formlinedata.com; https://formlinedata.com/)';
const MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];

/* The template at each "{{Football box" in a page, braces balanced. Also the form some long pages use,
   "{{#invoke:football box collapsible|main|…}}". */
export function footballBoxes(wikitext){ return boxesIn(wikitext).map(b => b.body); }
/* The same, each with the year of the section it sits in. Most results articles give a box's date without the year
   ("22 June") under a heading that is the year ("=== 2026 ==="), so the heading supplies it. A year heading holds until
   the next heading at its own level or above; deeper headings (months, competitions) stay inside it. A box under
   "Fixtures", "Upcoming matches" and the like, outside any year, has year 'next': the coming occurrence of its date. */
export function boxesIn(wikitext){
  const heads = [], hre = /^(=+)([^=\n]+?)=+[ \t]*$/gm;
  let m, cur = null;
  while ((m = hre.exec(wikitext))){
    const txt = m[2].replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1').replace(/'''?/g, '').trim(), level = m[1].length;
    if (/^(19|20)\d\d$/.test(txt)) cur = {year:+txt, level};
    else if (/^(upcoming|forthcoming|future) (fixtures|matches)$|^fixtures$/i.test(txt) && (!cur || level <= cur.level)) cur = {year:'next', level};
    else if (cur && level <= cur.level) cur = null;
    heads.push({at:m.index, year:cur ? cur.year : null});
  }
  const out = [], re = /\{\{\s*(?:#invoke:\s*)?football\s?box[^|}]*\|/gi;
  let h = 0, year = null;
  while ((m = re.exec(wikitext))){
    while (h < heads.length && heads[h].at < m.index){ year = heads[h].year; h++; }
    let depth = 0, i = m.index;
    for (; i < wikitext.length; i++){
      if (wikitext.startsWith('{{', i)){ depth++; i++; }
      else if (wikitext.startsWith('}}', i)){ depth--; i++; if (!depth) break; }
    }
    out.push({body:wikitext.slice(m.index + 2, i - 1), year});
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
/* A match box's date as YYYY-MM-DD: {{Start date|2026|11|14}}, {{dts|...}}, "14 November 2026" or "November 14, 2026".
   A date with no year ("14 November", "November 14") takes `year`, the year of the section the box is in (see boxesIn);
   with year 'next' and `today` given, the first such day from a week before today on. */
export function boxDate(s, year, today){
  if (!s) return null;
  /* {{Start date|df=yes|2016|6|4}}: a named setting may come before the numbers. */
  let m = s.match(/\{\{\s*(?:start date|dts|date)[^|}]*\|(?:\s*[a-z]+\s*=[^|}]*\|)*\s*(\d{4})\s*\|\s*(\d{1,2})\s*\|\s*(\d{1,2})/i);
  if (m) return m[1]+'-'+pad(m[2])+'-'+pad(m[3]);
  const t = s.replace(/<ref[^>]*\/>|<ref[^>]*>[\s\S]*?<\/ref>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/\{\{[^}]*\}\}/g, ' ').toLowerCase();
  m = t.match(/(\d{1,2})\s+([a-z]+)\s+(\d{4})/); if (m && MONTHS.includes(m[2])) return m[3]+'-'+pad(MONTHS.indexOf(m[2]) + 1)+'-'+pad(m[1]);
  m = t.match(/([a-z]+)\s+(\d{1,2}),?\s+(\d{4})/); if (m && MONTHS.includes(m[1])) return m[3]+'-'+pad(MONTHS.indexOf(m[1]) + 1)+'-'+pad(m[2]);
  if (!year || /\d{4}/.test(t)) return null;
  let mo = -1, d = 0;
  m = t.match(/^[\s\[]*(\d{1,2})\s+([a-z]+)\b/); if (m && MONTHS.includes(m[2])){ mo = MONTHS.indexOf(m[2]); d = +m[1]; }
  else { m = t.match(/^[\s\[]*([a-z]+)\s+(\d{1,2})\b/); if (m && MONTHS.includes(m[1])){ mo = MONTHS.indexOf(m[1]); d = +m[2]; } }
  if (mo < 0 || d < 1 || d > 31) return null;
  if (year === 'next'){
    if (!today) return null;
    const from = Date.parse(today + 'T00:00:00Z') - 7 * 864e5, y0 = +today.slice(0, 4);
    for (const y of [y0 - 1, y0, y0 + 1]){ const ts = Date.UTC(y, mo, d); if (ts >= from && new Date(ts).getUTCDate() === d) return y+'-'+pad(mo + 1)+'-'+pad(d); }
    return null;
  }
  return new Date(Date.UTC(year, mo, d)).getUTCDate() === d ? year+'-'+pad(mo + 1)+'-'+pad(d) : null;
}
/* A team cell: its FIFA code from {{fb|JPN}}, {{fbw-rt|JPN}}, {{flagicon|JPN}} and the like; otherwise its name from a
   link, turned into a code. */
export function boxTeam(s){
  if (!s) return null;
  s = String(s).replace(/<!--[\s\S]*?-->/g, ' ').replace(/<ref[^>]*\/>|<ref[^>]*>[\s\S]*?<\/ref>/gi, ' ');
  /* A side not decided yet, "{{fb|OMA}} or {{fb|TJK}}" or "Winner of semi-final 1" (the King's Cup final on Thailand's and
     Oman's pages, November 2026): no team. */
  if ((s.match(/\{\{\s*(?:fb|fbw|fb-rt|fbw-rt|fbu|fbu-rt|flagicon|flagcountry)\s*\|/gi) || []).length > 1) return null;
  if (/\b(or|winners?|losers?|runners?-up|tbd|tba|tbc)\b|\//i.test(s.replace(/<[^>]*>/g, ' ').replace(/\{\{[^{}]*\}\}/g, ' ').replace(/\[\[[^\]]*\]\]/g, ' '))) return null;
  const m = s.match(/\{\{\s*(?:fb|fbw|fb-rt|fbw-rt|flagicon|flagcountry|fbu|fbu-rt)\s*\|\s*([A-Z]{3})\b/i)
    || s.match(/\{\{\s*#invoke:\s*(?:flag|fb)\w*\s*\|[^|}]*\|\s*([A-Z]{3})\s*[|}]/i);   // {{#invoke:flag|deco|MEX}}
  if (m) return fifaCode(m[1]);
  const l = s.match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);
  const name = l ? (l[2] || l[1]) : s.replace(/<[^>]*>|\{\{[^}]*\}\}|'''?/g, '').trim();
  return codeOf(name.replace(/ (women's )?national (football|soccer) team.*$/i, '').trim());
}
/* Kick-off in UTC when the box gives a time with its offset, {{UTZ|20:00|-5}}; otherwise null (a bare time's zone is
   unknown). */
export function boxKickoff(date, time){
  if (!date) return null;
  const at = (hh, mm, off) => { const t = Date.parse(date + 'T' + pad(hh) + ':' + mm + ':00Z') - off * 6e4; return isNaN(t) ? null : new Date(t).toISOString().replace('.000Z', '+00:00'); };
  const raw = String(time || '').replace(/<ref[^>]*\/>|<ref[^>]*>[\s\S]*?<\/ref>/gi, '');
  const m = raw.match(/\{\{\s*UTZ\s*\|\s*(\d{1,2}):(\d{2})\s*\|\s*([+\-−]?\d{1,2})(?::?(\d{2}))?/i);
  if (m){
    const sign = /^[\-−]/.test(m[3]) ? -1 : 1, off = sign * (Math.abs(parseInt(m[3].replace('−', '-'), 10)) * 60 + (m[4] ? +m[4] : 0));
    return at(m[1], m[2], off);
  }
  /* The other common way of writing it: "19:30 [[UTC−10:00|UTC−10]]", "20:00 CET (UTC+1)", "16:00 GMT". One time and
     one offset, or nothing: "19:30 local (05:30 UTC)" has two times and is left alone. */
  const offs = new Set(); let rest = raw.replace(/\b(?:UTC|GMT)\s*(?:([+\-−])\s*(\d{1,2})(?::?(\d{2}))?|±\s*0{1,2}(?::?00)?)?/g, (all, sg, h, mi) => {
    offs.add(sg ? (sg === '+' ? 1 : -1) * (+h * 60 + (mi ? +mi : 0)) : 0); return ' '; });
  if (offs.size !== 1) return null;
  const off = [...offs][0]; if (Math.abs(off) > 14 * 60) return null;
  const times = [...rest.matchAll(/(?<![\d:.])(\d{1,2})[:.](\d{2})(?![\d:])(?:\s*([ap])\.?m\b\.?)?/gi)];
  if (times.length !== 1) return null;
  let hh = +times[0][1]; const mm = times[0][2], ap = (times[0][3] || '').toLowerCase();
  if (ap){ if (hh < 1 || hh > 12) return null; hh = hh % 12 + (ap === 'p' ? 12 : 0); }
  if (hh > 23 || +mm > 59) return null;
  return at(hh, mm, off);
}
/* Wiki markup to plain text: links to their text, templates and references out. */
export const plain = s => String(s || '').replace(/<ref[^>]*\/>|<ref[^>]*>[\s\S]*?<\/ref>/gi, '').replace(/\{\{[^{}]*\}\}/g, '')
  .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1').replace(/<[^>]*>/g, '').replace(/'''?/g, '').replace(/\s+/g, ' ').trim();
/* The article a box's competition links to ("[[2027 Africa Cup of Nations qualification#Group D|2027 AFCON qualification]]"
   gives "2027 Africa Cup of Nations qualification"): the competition's full name, where the text shown is often short
   ("2026–27 Nations League", UEFA's or CONCACAF's). '' when there is no link or it is a general one (Exhibition game). */
export function compLink(P){
  const m = String(P.round || P.event || P.title || '').match(/\[\[\s*([^\]|#]+)/);
  const t = m ? m[1].replace(/_/g, ' ').trim() : '';
  return /^(exhibition game|friendly|association football|football)\b/i.test(t) ? '' : t;
}
/* A box's stadium, city and country (the last part of the location, when it names one). */
export function boxPlace(P){
  let loc = plain(P.location).split(',').map(x => x.trim()).filter(Boolean), stadium = plain(P.stadium);
  /* Competition articles often give "[[Stadium]], [[City]]" with no location: the city is the part after the stadium.
     The stadium may be blank ("[[]], [[Basra]]", Iran's article, November 2026): the city still counts. */
  if (!loc.length && stadium.includes(',')){ const sp = stadium.split(',').map(x => x.trim()); stadium = sp[0]; loc = sp.slice(1).filter(Boolean); }
  if (isTBD(stadium)) stadium = '';
  /* "Kingstown (Saint Vincent and the Grenadines)" or a bare "(United States)": the part in brackets is the country. */
  loc = loc.flatMap(x => { const b = x.match(/^(.*?)\s*\(([^()]+)\)$/); return b ? [b[1], b[2]].map(y => y.trim()).filter(Boolean) : [x]; });
  return {stadium, city:isTBD(loc[0]) ? '' : loc[0] || '', country:loc.length > 1 && !isTBD(loc[loc.length - 1]) ? loc[loc.length - 1] : ''};
}
/* The year a competition's article is about, from its title: "2024 COSAFA Cup", "Football at the 2023 Island Games –
   Men's tournament". Its boxes often give the day and month only ("28 June") with no year heading above them. A season
   over two years ("2026–27 UEFA Nations League") or a title naming two years gives none. */
export function titleYear(title){
  const ys = [...new Set(String(title || '').match(/\b(?:19|20)\d\d\b(?![–\-]\d)/g) || [])];
  /* Not for qualifying: "2027 Africa Cup of Nations qualification" is played in 2026 and 2027. */
  return ys.length === 1 && !/\b(?:19|20)\d\d[–\-]\d/.test(title) && !/qualif/i.test(title) ? +ys[0] : null;
}
/* Every box with its parameters and its date. A date with no year takes the year of its section; failing that, the
   article's own year (titleYear), and one more once the months start again (a tournament running over the New Year:
   December's matches, then January's). */
export function datedBoxes(wikitext, {today, year:ty} = {}){
  const out = []; let wrap = 0, prev = 0;
  for (const b of boxesIn(wikitext)){
    const P = params(b.body);
    let date = boxDate(P.date, b.year, today);
    if (!date && !b.year && ty){
      date = boxDate(P.date, ty + wrap);
      if (date){ const mo = +date.slice(5, 7); if (prev && mo < prev - 5){ wrap++; date = boxDate(P.date, ty + wrap); } prev = mo; }
    }
    out.push({P, date});
  }
  return out;
}
/* The matches a results article lists: date, the two codes, stadium, city and country. today: for boxes under a
   "Fixtures" heading with no year (see boxDate). year: a competition article's own year (see titleYear). */
export function pageMatches(wikitext, today, year){
  const out = [];
  for (const {P, date} of datedBoxes(wikitext, {today, year})){
    const t1 = boxTeam(P.team1), t2 = boxTeam(P.team2);
    if (!date || !t1 || !t2) continue;
    /* timed: a kick-off time is given, with or without its zone ("19:30 SGT"). A box with none has a provisional date. */
    const timed = /\d{1,2}[:.]\d{2}/.test(String(P.time || '').replace(/<ref[^>]*\/>|<ref[^>]*>[\s\S]*?<\/ref>/gi, ''));
    const link = compLink(P), kickoff = boxKickoff(date, P.time);
    /* tm: a time the reader could not turn into a kick-off, as the page words it ("19:30 TAHT"): kept to learn from. */
    out.push({date, t1, t2, ...boxPlace(P), kickoff, comp:plain(P.round || P.event || P.title || ''), ...(link ? {link} : {}), ...(timed ? {timed:1} : {}),
      ...(timed && !kickoff ? {tm:plain(P.time).slice(0, 40)} : {})});
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
/* "TBD" and the like, written where a stadium or city is not known yet: read as nothing. */
export const isTBD = x => /^(tbd|tba|tbc|to be (determined|announced|confirmed|decided))\.?$/i.test(String(x || '').trim());
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
export async function existing(fetchImpl, titles, stats){
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
export async function resolveTitles(fetchImpl, keys, cache, today, stats, limit){
  /* main: the team's main article, where smaller teams list their recent results (see wikiresults.mjs). Entries from
     before it was kept are looked up again once. */
  const need = keys.filter(k => { const T = cache.titles[k]; return !T || T.main === undefined || dayDiff(T.checked, today) > (T.title ? 90 : 30); });
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
    cache.titles[k] = {title, name:names.get(k), main:mains.get(k).map(t => M.get(t)).find(Boolean) || '', checked:today};
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
/* The articles a competition's article hands its matches to: "2027 Africa Cup of Nations qualification" has no match
   boxes of its own, only {{main|… Group A}} to {{main|… Group L}}; the women's World Cup qualifying goes two steps down
   (… (UEFA), then … – UEFA League A). Taken from {{main}}, {{see also}} and {{#lst:}}, and kept when the title passes the
   same test as a search result (the season, the competition's words, women or not, no youth). */
export function compSubs(wikitext, tour, year, women){
  const out = new Set();
  for (const m of String(wikitext || '').matchAll(/\{\{\s*(?:main|see also|further)\s*\|([^{}]*)\}\}|\{\{\s*#(?:lst|section|section-h)\w*:\s*([^|{}]*)/gi)){
    for (const part of (m[1] !== undefined ? m[1].split('|') : [m[2]])){
      const t = part.replace(/<!--[\s\S]*?-->/g, '').split('#')[0].replace(/_/g, ' ').trim();
      if (!t || /=/.test(t) || /\b(bids?|squads?|statistics|broadcasting|seeding|draw|disciplinary)\b/i.test(t)) continue;
      if (compTitles([t], tour, year, women).length) out.add(t);
    }
  }
  return [...out];
}
/* Every article held for a competition: the ones the search found and the ones they hand their matches to. */
export const compPages = C => C ? [...new Set((C.titles || []).concat(C.subs || []))] : [];
export async function api(fetchImpl, q){
  const res = await fetchImpl(API + '?' + new URLSearchParams({format:'json', formatversion:'2', ...q}), {headers:{'User-Agent':UA}});
  if (!res.ok) throw new Error('Wikipedia HTTP ' + res.status);
  return res.json();
}
/* Looks up venues for fixtures still without one. cache: {titles:{'men|Japan': {title, checked}}, pages:{title: {fetched, matches}}}.
   Returns Map fixture api_id -> {city, country, stadium}. Never throws: Wikipedia trouble only means fewer venues. */
/* Pages are kept as they were read, team codes included, for up to three days. A code learnt since (ESW for Eswatini,
   15 November 2026) must count for the pages already kept, so every stored code is put through fifaCode again before use. */
export function recode(cache){
  const fix = m => { if (m){ if (m.t1) m.t1 = fifaCode(m.t1); if (m.t2) m.t2 = fifaCode(m.t2); } };
  for (const P of Object.values((cache && cache.pages) || {})) (P.matches || []).forEach(fix);
  for (const P of Object.values((cache && cache.resultPages) || {})){ (P.results || []).forEach(fix); (P.upcoming || []).forEach(fix); }
  return cache;
}
export async function wikiVenues(fixtures, cache, {fetchImpl = globalThis.fetch, today, limit = 400, cities, cityKey, toArchive, log = () => {},
  all = fixtures, teams = null, horizonDays = 30} = {}){
  cache.titles = cache.titles || {}; cache.pages = cache.pages || {}; recode(cache);
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
      /* The list grows as articles name the ones below them (at most 40 for a competition). */
      const list = compPages(C);
      for (let n = 0; n < list.length; n++){
        const title = list[n];
        if (stats.asked >= limit) break;
        const P = cache.pages[title], fresh = P && dayDiff(P.fetched, today) < (soon({date:compWant.get(k)}) ? 1 : 3);
        if (fresh) continue;
        stats.asked++;
        const j = await api(fetchImpl, {action:'parse', page:title, prop:'wikitext', redirects:'1'});
        const text = j.parse && (typeof j.parse.wikitext === 'string' ? j.parse.wikitext : j.parse.wikitext && j.parse.wikitext['*']);
        if (!text) continue;
        cache.pages[title] = {fetched:today, matches:pageMatches(text, today, titleYear(title)).filter(m => m.date >= today)};
        stats.pages++;
        for (const sub of compSubs(text, tour, +year, g === 'women')){
          if (list.includes(sub) || list.length >= 40) continue;
          list.push(sub); C.subs = (C.subs || []).concat(sub);
        }
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
        cache.pages[T.title] = {fetched:today, matches:pageMatches(text, today).filter(m => m.date >= today)};
        stats.pages++;
      }
    } catch(e){ stats.errors++; log('Wikipedia: ' + team + ': ' + e.message); if (stats.errors >= 5) break; }
  }
  /* Every fixture against every cached article of either team, then the competition's articles. A box with a venue
     is preferred to one without. */
  /* Every fixture coming up is checked against the cached articles, not only the ones still without a venue: a box can
     also correct a fixture's date or kick-off (the API often has a placeholder time, e.g. 21:00 UTC). */
  const known = new Set(cities ? [...cities.values()] : []); all.forEach(fx => { known.add(fx.home_team); known.add(fx.away_team); });
  const coming = all.filter(fx => !fx.tbd && fx.date >= today && dayDiff(fx.date, today) <= horizonDays);
  for (const fx of coming){
    const pages = [];
    for (const t of [fx.home_team, fx.away_team]){ const T = cache.titles[fx.gender + '|' + t]; if (T && T.title && cache.pages[T.title]) pages.push(cache.pages[T.title]); }
    for (const t of compPages(cache.comps[compKey(fx)])) if (cache.pages[t]) pages.push(cache.pages[t]);
    let best = null; const hits = []; let agreed = false;
    const twins = all.filter(o => o !== fx && o.gender === fx.gender && ((o.home_team === fx.home_team && o.away_team === fx.away_team) || (o.home_team === fx.away_team && o.away_team === fx.home_team)));
    for (const P of pages){
      const m = findMatch(P.matches, fx); if (!m) continue;
      /* A box on another day that sits on the day of another fixture between the same two teams is that fixture's box
         (two friendlies in a week, the second not on the page yet): not this one's date, and not its venue either. */
      if (m.moved && twins.some(o => dayDiff(o.date, m.date) <= 1)) continue;
      /* A box with no kick-off time is a placeholder as far as its date goes: the date is often a guess, the first day
         of the window (Morocco v Niger, November 2026: Wikipedia had 11 Nov and no venue, the API the real 13 Nov; the
         Africa Cup qualifiers of 17 Nov 2026 stood as 15 Nov on the group articles, stadium filled in, the day after
         the same teams' first match). It never moves a fixture; its venue still counts. */
      const placeholder = !m.kickoff && !m.timed;
      /* Agreeing with the API's day needs less: a box on that day with a stadium or a time. */
      if (m.date === fx.date && (m.kickoff || (m.stadium && !isTBD(m.stadium)))) agreed = true;
      const country = boxCountry(m, cities, cityKey, toArchive, known);
      if (!country && !m.moved) continue;
      if (m.moved && placeholder && !country) continue;
      hits.push({city:m.city, country, stadium:m.stadium, boxDate:m.date, ...(m.moved && !placeholder ? {date:m.date} : {}), ...(m.kickoff ? {kickoff:m.kickoff} : {})});
    }
    /* Where Wikipedia's own articles give different days for a match, a filled-in box on the API's day settles it: the
       boxes on another day are set aside (Iceland v Luxembourg, November 2026: Iceland's article had 15 Nov, while
       Luxembourg's, the Nations League's and the API all had the real 16 Nov). */
    for (const hit of (agreed ? hits.filter(h => h.boxDate === fx.date) : hits)){
      if (!best || (!best.country && hit.country) || (!best.kickoff && hit.kickoff && !!best.country === !!hit.country)) best = hit;
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

/* Whether a Wikipedia box for two teams on `date` is a match the feed already has. feedDates: the days of the feed's
   fixtures between the two; boxDates: the days of every Wikipedia box for the pair. A feed fixture within a day is the
   same match. One within a week is too (the feed often has a placeholder day, and so does Wikipedia), unless that
   fixture has a box of its own on the same article: one article listing the pair twice means two matches (two
   friendlies in a week: Singapore v Bangladesh and Cyprus v Luxembourg, women, November and December 2026). boxDates
   must come from one article: two articles giving one match different days are not two matches. */
export function feedHas(date, feedDates, boxDates = []){
  if (feedDates.some(d => dayDiff(d, date) <= 1)) return true;
  return feedDates.filter(d => dayDiff(d, date) <= 7).some(d => !boxDates.some(b => b !== date && dayDiff(b, d) <= 1));
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

    for (const title of compPages(C)){
      const P = cache.pages[title]; if (!P) continue;
      for (const m of P.matches){
        if (m.date < today || dayDiff(m.date, today) > horizonDays) continue;
        const home = byCode[g].get(m.t1), away = byCode[g].get(m.t2);
        if (!home || !away || home === away) continue;
        const pair = (x, y) => (x === home && y === away) || (x === away && y === home);
        /* the days this same article gives the pair: two boxes on one article are two matches */
        const days = [...new Set(P.matches.filter(o => (o.t1 === m.t1 && o.t2 === m.t2) || (o.t1 === m.t2 && o.t2 === m.t1)).map(o => o.date))];
        if (feedHas(m.date, all.filter(f => f.gender === g && pair(f.home_team, f.away_team)).map(f => f.date), days)) continue;
        const id = g + '|' + m.date + '|' + home + '|' + away;
        if (seen.has(id)) continue; seen.add(id);
        out.push({id, gender:g, tournament:tour, date:m.date, pairDates:days, kickoff:m.kickoff || null, home_team:home, away_team:away,
          city:m.city, stadium:m.stadium, country:boxCountry(m, cities, cityKey, toArchive, known), source:title});
      }
    }
  }
  return out.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
}
