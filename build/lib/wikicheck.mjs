// A second record for the cross-check's list (build/store/api-audit.json, lib/apiaudit.mjs), from Wikipedia.
//
// The cross-check lists what API-Football has and the site lacks or holds with another score. Nothing goes in on one
// record's word, so every entry used to be looked up by hand. This does the looking: for each entry it reads both
// teams' Wikipedia pages and notes on the entry whether they carry the match (`wiki`), with the date, score, place
// and competition they give. It still adds nothing; it sorts the list into "also on Wikipedia", "Wikipedia has
// another score" and "the feed only", so what is left to judge is small.
//
// Which page: a team's main article lists only its last twelve months or so, and few teams (very few women's) have a
// results article. So the article is read as it stood some weeks after the match, when the match was still on it
// (15 November 2026: of 64 women's friendlies of 2023 that today's pages do not show, 44 were on the pages of the
// time, 39 of them on both teams'). A match played less than that long ago is looked up on the page as it is now.
//
// Pure apart from the fetch it is handed. One request a team and month; a pause between requests.
import {codeOf} from './fifacodes.mjs';
import {api} from './wikivenues.mjs';
import {pageResults} from './wikiresults.mjs';

const DAY = 864e5;
const dayNum = d => Math.round(Date.parse(d + 'T00:00:00Z') / DAY), iso = n => new Date(n * DAY).toISOString().slice(0, 10);
/* Words in a match's label that mean it is not a full international. */
const LESSER = /unofficial|\bB\b[' ]|'B'|training|behind closed|closed[- ]door|non[- ]fifa|u-?2[0-3]\b|olympic team/i;

/* The article to read for a team: the one the site already uses for it, else the usual title (redirects are followed). */
export const pageTitle = (g, team, cache) => {
  const T = cache && cache.titles && cache.titles[g + '|' + team];
  return (T && T.main) || team + (g === 'women' ? " women's national football team" : ' national football team');
};

/* An article's text as it stood on a day (YYYY-MM-DD), or as it is now when the day is null. '' when there is none. */
export async function pageAt(fetchImpl, title, asOf){
  const q = {action:'query', prop:'revisions', rvprop:'content', rvslots:'main', rvlimit:'1', redirects:'1', titles:title};
  if (asOf){ q.rvstart = asOf + 'T00:00:00Z'; q.rvdir = 'older'; }
  const j = await api(fetchImpl, q), p = j && j.query && j.query.pages && j.query.pages[0];
  const r = p && !p.missing && p.revisions && p.revisions[0];
  return (r && r.slots && r.slots.main && r.slots.main.content) || '';
}

/* What the two teams' pages say about one entry. lists: {H:[results], A:[results]} as pageResults gives them.
   found: 'agree' (a page has the match within a day at the feed's score), 'differ' (the pages have the pair within
   three days, at another score or more than a day away), 'none'. pages: whose page agrees ('HA', 'H' or 'A').
   otherLists (when only one page agrees): how many matches the other team's page lists within 60 days. */
export function secondRecord(x, lists){
  const h = codeOf(x.home), a = codeOf(x.away), d = dayNum(x.date), [fh, fa] = String(x.score).split('-').map(Number);
  if (!h || !a) return {found:'none', note:'no code for a team'};
  const hits = [];
  for (const side of ['H', 'A']) for (const m of lists[side] || []){
    const fwd = m.t1 === h && m.t2 === a; if (!fwd && !(m.t1 === a && m.t2 === h)) continue;
    const off = dayNum(m.date) - d; if (Math.abs(off) > 3) continue;
    const mh = fwd ? m.hs : m.as, ma = fwd ? m.as : m.hs;
    hits.push({side, date:m.date, off, score:mh + '-' + ma, same:mh === fh && ma === fa, first:fwd ? x.home : x.away,
      so:m.so ? ((m.so === 1) === fwd ? x.home : x.away) : '', city:m.city || '', country:m.country || '', comp:m.comp || ''});
  }
  const agree = hits.filter(t => t.same && Math.abs(t.off) <= 1).sort((p, q) => Math.abs(p.off) - Math.abs(q.off) || (p.side < q.side ? 1 : -1));
  const others = [...new Set(hits.filter(t => !agree.includes(t)).map(t => t.date + ' ' + t.score))];
  if (!agree.length) return hits.length ? {found:'differ', others} : {found:'none'};
  const b = agree[0], lesser = agree.map(t => t.comp).find(c => LESSER.test(c)), pages = ['H', 'A'].filter(s => agree.some(t => t.side === s)).join('');
  /* Only one page agrees: how many matches the other page lists within 60 days. None means that page does not cover
     the period, so its silence says nothing; several means the team's own record leaves this match out. */
  const other = pages === 'H' ? 'A' : 'H', silent = pages.length === 1 ? {otherLists:(lists[other] || []).filter(m => Math.abs(dayNum(m.date) - d) <= 60).length} : {};
  return {found:'agree', pages, ...silent, date:b.date, first:b.first,
    city:(agree.find(t => t.city) || b).city, country:(agree.find(t => t.country) || b).country, comp:(agree.find(t => t.comp) || b).comp,
    ...(agree.some(t => t.so) ? {shootout:agree.find(t => t.so).so} : {}), ...(lesser ? {lesser} : {}), ...(others.length ? {others} : {})};
}

/* Looks up the entries of the list that have not been looked up yet, newest first, and writes `wiki` on each:
   {checked, found, …}. An entry whose pages could not be read is left for the next run.
   limit: requests a run. after: how many days after the match the page is read as of. */
export async function wikiCheck({report, cache, fetchImpl = globalThis.fetch, today, limit = 200, pauseMs = 400, after = 75, log = () => {}} = {}){
  const st = {asked:0, checked:0, agree:0, differ:0, none:0, errors:0};
  if (!fetchImpl || !report) return st;
  const got = new Map(), t0 = dayNum(today);
  const todo = (report.missing || []).concat(report.diffs || []).filter(x => !x.wiki).sort((p, q) => p.date < q.date ? 1 : -1);
  for (const x of todo){
    const d = dayNum(x.date), asOf = d + after >= t0 ? null : iso(d + after), lists = {}; let failed = false;
    const need = [['H', x.home], ['A', x.away]].map(([side, team]) => { const title = pageTitle(x.g, team, cache); return {side, title, key:title + '|' + (asOf ? asOf.slice(0, 7) : 'now')}; });
    if (st.asked + need.filter(n => !got.has(n.key)).length > limit) break;
    for (const n of need){
      if (!got.has(n.key)){
        try {
          const text = await pageAt(fetchImpl, n.title, asOf); st.asked++;
          got.set(n.key, text ? pageResults(text, '1870-01-01', '2999-12-31', +x.date.slice(0, 4)) : []);
        } catch(e){ st.errors++; log('Wikipedia check: ' + n.title + ': ' + e.message); got.set(n.key, null); }
        if (pauseMs) await new Promise(r => setTimeout(r, pauseMs));
      }
      if (got.get(n.key) === null) failed = true; else lists[n.side] = got.get(n.key);
    }
    if (st.errors >= 5) break;
    if (failed) continue;
    const v = secondRecord(x, lists); x.wiki = {checked:today, ...(asOf ? {asOf} : {}), ...v};
    st.checked++; st[v.found]++;
  }
  return st;
}
