// Results from Wikipedia, for women's matches that neither the open archive nor API-Football has. Small teams' matches
// often reach neither: four friendlies in Libreville in November 2026 (Gabon 3–6 Congo among them) were on the teams'
// Wikipedia pages within a day. Each night (full runs) a share of the active teams' pages is read through Wikipedia's
// API, and a finished match within the last 60 days is kept when both teams are known, it is not already in the data,
// and it is confirmed: listed on two different pages, or still listed two days after it was first seen. Wikipedia's
// content is CC BY-SA 4.0, credited on Sources & thanks; each row records the page it came from. Never throws.
import {codeOf} from './fifacodes.mjs';
import {footballBoxes, params, boxDate, boxTeam, plain, boxCountry, api, resolveTitles} from './wikivenues.mjs';

const DAY = 864e5;
const dayNum = d => Math.round(Date.parse(d + 'T00:00:00Z') / DAY);
const iso = n => new Date(n * DAY).toISOString().slice(0, 10);
const pairKey = (a, b) => [a, b].sort().join('|');

/* A match box's score as [home, away], or null for anything not played out: "w/o", awarded, annulled, cancelled,
   postponed, abandoned, or a fixture ("v"). Scores inside templates ({{score link|…|3–6}}) and links are read. */
export function boxScore(s){
  const raw = String(s || '');
  if (/w\/o|walk-?over|award|\bawd\b|annul|void|cancel|abandon|postpon|forfeit|suspend/i.test(raw)) return null;
  const t = plain(raw.replace(/\{\{[^{}]*?\|\s*(\d{1,2}\s*[–\-−]\s*\d{1,2})\s*\}\}/g, ' $1 '));
  const m = t.match(/^\s*(\d{1,2})\s*[–\-−]\s*(\d{1,2})(?!\d)/);
  return m ? [+m[1], +m[2]] : null;
}
/* The goal minutes (12', 45+2', {{goal|12|45+2}}) in a scorer list. Own goals and penalties count like any goal;
   missed penalties ({{pengoal|...|miss}} and the like) and cards don't. */
export function goalCount(list){
  const raw = String(list || '').replace(/<ref[^>]*\/>|<ref[^>]*>[\s\S]*?<\/ref>/gi, '');
  if (!/\d/.test(raw)) return 0;
  const kept = raw.replace(/\{\{\s*(?:sent off|yel|red|pengoal\|[^}]*miss|penmiss|missed)[^}]*\}\}/gi, '');
  const mins = kept.match(/(?:^|[^\d])(\d{1,3})(?:\+\d{1,2})?\s*(?:'|′|&prime;|\{\{'\}\})/g) || [];
  const tmpl = [...kept.matchAll(/\{\{\s*goal\s*\|([^}]*)\}\}/gi)].map(x => x[1]);
  const count = tmpl.length ? tmpl.reduce((t, x) => t + x.split('|').filter(v => /^\s*\d{1,3}(\+\d{1,2})?\s*$/.test(v)).length, 0) : mins.length;
  return count;
}
/* Whether a box's scorer lists fit its score: none listed, or as many goals listed in all as the score has. Both sides
   are counted together, since editors sometimes list one side's scorers under the other (Bangladesh 0–6 South Korea,
   Asian Games 2026, on one of Bangladesh's pages). */
export function goalsAgree(g1, g2, hs, as){
  const n = goalCount(g1) + goalCount(g2);
  return n === 0 || n === hs + as;
}
/* Finished matches on a page between `from` and `to` (YYYY-MM-DD): date, the two FIFA codes, score, shoot-out (which
   side won: 1 or 2), competition, stadium, city and country. */
export function pageResults(wikitext, from, to){
  const out = [];
  for (const b of footballBoxes(wikitext)){
    const P = params(b), date = boxDate(P.date);
    if (!date || date < from || date > to) continue;
    const t1 = boxTeam(P.team1), t2 = boxTeam(P.team2), sc = boxScore(P.score);
    if (!t1 || !t2 || t1 === t2 || !sc) continue;
    /* Scorers listed that don't add up to the score: the score is a placeholder or stale (Wikipedia's 2022 WAFCON
       qualifiers show "Senegal 0–0 Liberia" over six Senegal goals). Skipped; with no scorers listed the score stands. */
    if (!goalsAgree(P.goals1, P.goals2, sc[0], sc[1])) continue;
    let so = 0; const pen = String(plain(P.penaltyscore || '')).match(/(\d{1,2})\s*[–\-−]\s*(\d{1,2})/);
    if (pen && sc[0] === sc[1] && +pen[1] !== +pen[2]) so = +pen[1] > +pen[2] ? 1 : 2;
    let loc = plain(P.location).split(',').map(x => x.trim()).filter(Boolean), stadium = plain(P.stadium);
    if (!loc.length && stadium.includes(',')){ const sp = stadium.split(',').map(x => x.trim()).filter(Boolean); stadium = sp[0]; loc = sp.slice(1); }
    loc = loc.flatMap(x => { const q = x.match(/^(.*?)\s*\(([^()]+)\)$/); return q ? [q[1], q[2]].map(y => y.trim()).filter(Boolean) : [x]; });
    out.push({date, t1, t2, hs:sc[0], as:sc[1], so, comp:plain(P.round || P.event || P.title || ''), stadium,
      city:loc[0] || '', country:loc.length > 1 ? loc[loc.length - 1] : ''});
  }
  return out;
}
/* The tournament name to file a match under: "Friendly" for friendlies, else the archive's name for the competition
   when it is one the gap-filler knows, else the competition as Wikipedia names it (unknown names count as an
   invitational, the cautious weight). A youth or otherwise uncounted competition is skipped (null). */
export function tournamentFor(comp, g, mapTournament, tournaments){
  let c = String(comp || '').replace(/\s+/g, ' ').trim();
  if (!c || /friendl/i.test(c)) return 'Friendly';
  if (/\bU-?\d{2}\b|under-?\d{2}|youth|futsal|beach/i.test(c)) return null;
  /* "Football at the 2026 Asian Games Group F", "2026 Women's Africa Cup of Nations qualification First round": the
     competition's own name, without the year, the stage or "women's". */
  const c1 = c.replace(/^football at the\s+/i, '').replace(/\b(19|20)\d\d(\s*[–-]\s*\d{2,4})?\b/g, ' ').replace(/\bwomen'?s\b/gi, ' ').replace(/\s+/g, ' ').trim();
  c = c1.replace(/\s*[–:-]?\s*\b(group|first round|second round|third round|preliminary round|round|matchday|final|semi-finals?|quarter-finals?|third place|play-?offs?|knockout stage|league [a-d]|path|leg|tournament)\b.*$/i, '')
    .replace(/\s*[–:-]\s*$/, '').replace(/\s+/g, ' ').trim();
  if (!c) return null;
  if (mapTournament) for (const x of [c1, c]){ const t = mapTournament(x, g); if (t && t.skip) return null; if (t && t.name && !t.unmapped) return t.name; }
  if (tournaments){
    if (tournaments.has(c)) return c;
    /* Multi-sport games by their archive name ("Asian Games"). */
    const games = c.match(/((?:[A-Z][a-z]+ )*(?:and )?(?:[A-Z][a-z]+ )*Games)\b/);
    if (games && tournaments.has(games[1])) return games[1];
  }
  return c;
}

/* g: 'women'. known: the rows already held (archive, gap-filler, hand-added, earlier Wikipedia rows), {date, home_team,
   away_team}. teams: Set of the archive's team names. cache: the shared Wikipedia cache (wiki-venues.json): titles,
   plus resultPages and resultSeen here. Returns {rows, stats}. */
export async function wikiResults({g = 'women', known, teams, cache, fetchImpl = globalThis.fetch, today, limit = 90, everyDays = 3, windowDays = 60,
  cities, cityKey, toArchive = x => x, mapTournament, tournaments, pauseMs = 0, log = () => {}}){
  const stats = {asked:0, pages:0, candidates:0, added:0, errors:0, unconfirmed:0};
  if (!fetchImpl) return {rows:[], stats};
  cache.titles = cache.titles || {}; cache.resultPages = cache.resultPages || {}; cache.resultSeen = cache.resultSeen || {};
  const t0 = dayNum(today), from = iso(t0 - windowDays), to = iso(t0 - 1);
  /* Teams that played in the last three years. */
  const recent = new Set(); for (const r of known) if (dayNum(r.date) >= t0 - 3*365){ recent.add(r.home_team); recent.add(r.away_team); }
  const keys = [...recent].filter(t => teams.has(t)).sort().map(t => g + '|' + t);
  try { await resolveTitles(fetchImpl, keys, cache, today, stats, limit); }
  catch(e){ stats.errors++; log('Wikipedia results: titles: ' + e.message); }
  /* Each team's results article where it has one, and its main article (smaller teams list results there). The pages
     read longest ago go first; each at most every `everyDays` days. */
  const pages = new Set(); for (const k of keys){ const T = cache.titles[k]; if (!T) continue; if (T.title) pages.add(T.title); if (T.main) pages.add(T.main); }
  const due = [...pages].filter(p => { const P = cache.resultPages[p]; return !P || t0 - dayNum(P.fetched) >= everyDays; })
    .sort((a, b) => ((cache.resultPages[a] || {}).fetched || '') < ((cache.resultPages[b] || {}).fetched || '') ? -1 : 1);
  for (const title of due){
    if (stats.asked >= limit) break;
    try {
      /* Gently: Wikipedia answers 429 to quick bursts. */
      if (pauseMs && stats.pages) await new Promise(r => setTimeout(r, pauseMs));
      stats.asked++;
      const j = await api(fetchImpl, {action:'parse', page:title, prop:'wikitext', redirects:'1'});
      const text = j.parse && (typeof j.parse.wikitext === 'string' ? j.parse.wikitext : j.parse.wikitext && j.parse.wikitext['*']);
      cache.resultPages[title] = {fetched:today, results:text ? pageResults(text, from, to) : []};
      stats.pages++;
    } catch(e){ stats.errors++; log('Wikipedia results: ' + title + ': ' + e.message); if (stats.errors >= 5) break; }
  }
  /* Every result on every cached page, grouped: the same date, teams and score, whichever way round. */
  const byCode = new Map(); for (const t of teams){ const c = codeOf(t); if (c && !byCode.has(c)) byCode.set(c, t); }
  const held = new Map(); for (const r of known){ const k = pairKey(r.home_team, r.away_team); if (!held.has(k)) held.set(k, []); held.get(k).push(dayNum(r.date)); }
  const groups = new Map();
  for (const [title, P] of Object.entries(cache.resultPages)){
    if (t0 - dayNum(P.fetched) > windowDays) { delete cache.resultPages[title]; continue; }
    for (const m of P.results || []){
      if (m.date < from || m.date > to) continue;
      const home = byCode.get(m.t1), away = byCode.get(m.t2);
      if (!home || !away) continue;
      const id = m.date + '|' + pairKey(home, away) + '|' + (home < away ? m.hs + '-' + m.as : m.as + '-' + m.hs);
      if (!groups.has(id)) groups.set(id, {m, home, away, pages:new Set()});
      groups.get(id).pages.add(title);
    }
  }
  const rows = [];
  for (const [id, G] of groups){
    stats.candidates++;
    const ds = held.get(pairKey(G.home, G.away)), d = dayNum(G.m.date);
    if (ds && ds.some(x => Math.abs(x - d) <= 2)) continue;
    if (!cache.resultSeen[id]) cache.resultSeen[id] = today;
    if (G.pages.size < 2 && t0 - dayNum(cache.resultSeen[id]) < 2){ stats.unconfirmed++; continue; }
    const tour = tournamentFor(G.m.comp, g, mapTournament, tournaments);
    if (!tour) continue;
    const country = boxCountry(G.m, cities, cityKey, toArchive, teams) || G.home;
    rows.push({date:G.m.date, home_team:G.home, away_team:G.away, home_score:G.m.hs, away_score:G.m.as, tournament:tour,
      city:G.m.city, country, neutral:country === G.home || country === G.away ? 'FALSE' : 'TRUE',
      shootout_winner:G.m.so === 1 ? G.home : G.m.so === 2 ? G.away : '',
      source:'https://en.wikipedia.org/wiki/' + encodeURIComponent([...G.pages][0].replace(/ /g, '_')).replace(/%2F/g, '/')});
  }
  for (const [id, d] of Object.entries(cache.resultSeen)) if (t0 - dayNum(d) > windowDays + 7) delete cache.resultSeen[id];
  stats.added = rows.length;
  return {rows:rows.sort((a, b) => a.date < b.date ? -1 : 1), stats};
}
