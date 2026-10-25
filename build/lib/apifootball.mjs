// API-Football client: one request at a time, paced under the per-minute limit, stopping at the daily budget or
// at the first error the API reports (a plan limit, a bad key). One error is not a stop: the free plan answers a date
// it does not cover with "try from <date> to <date>". The client then remembers that window, and dates outside it
// are skipped without spending a request. Docs: https://www.api-football.com/documentation-v3
const BASE = 'https://v3.football.api-sports.io';

/* The account's plan, from /status (which does not count against the daily quota). Never throws: on any problem
   it returns {error}, and the run carries on as if on the free plan. */
export async function planStatus({key, fetchImpl = fetch}){
  try {
    const res = await fetchImpl(BASE + '/status', {headers:{'x-apisports-key': key}});
    if (!res.ok) return {error:'HTTP ' + res.status};
    const body = await res.json();
    const errs = body && body.errors && (Array.isArray(body.errors) ? body.errors : Object.values(body.errors));
    if (errs && errs.length) return {error: errs.join('; ')};
    let r = body && body.response; if (Array.isArray(r)) r = r[0];
    if (!r || !r.subscription) return {error:'no plan in the reply'};
    const sub = r.subscription, req = r.requests || {};
    const hdr = n => res.headers && res.headers.get ? res.headers.get(n) : null;
    return {name: sub.plan || null, end: sub.end || null, active: sub.active !== false,
      limitDay: +req.limit_day || null, usedToday: +req.current || 0, perMinute: +hdr('x-ratelimit-limit') || null};
  } catch (e){ return {error: e.message}; }
}
export const isFreePlan = p => !p || !p.name || /free/i.test(p.name) || (p.limitDay != null && p.limitDay <= 100);

export function makeClient({key, budget = 80, gapMs = 6500, fetchImpl = fetch, log = () => {}}){
  let used = 0, last = 0, remaining = null, stopped = null, window = null, perMinute = null;
  const failed = [];   // requests the API answered with a server error twice: skipped, not a stop
  async function get(path, params, retry){
    if (stopped) return null;
    if (used >= budget){ stopped = 'request budget for this run used up'; return null; }
    const wait = last + gapMs - Date.now(); if (wait > 0) await new Promise(r => setTimeout(r, wait));
    last = Date.now(); used++;
    const url = BASE + path + '?' + new URLSearchParams(params);
    let res;
    try { res = await fetchImpl(url, {headers:{'x-apisports-key': key}}); }
    catch (e){ stopped = 'network error: ' + e.message; return null; }
    const rem = res.headers && res.headers.get && res.headers.get('x-ratelimit-requests-remaining');
    if (rem != null) remaining = +rem;
    const pm = res.headers && res.headers.get && res.headers.get('x-ratelimit-limit');
    if (pm != null && +pm) perMinute = +pm;
    if (res.status >= 500){   // a hiccup on API-Football's side: try once more, then skip just this request
      if (!retry){ await new Promise(r => setTimeout(r, Math.min(gapMs, 3000))); return get(path, params, true); }
      failed.push(path + ' ' + (params.date || params.id) + ': HTTP ' + res.status); log('skipped after two server errors: ' + failed[failed.length - 1]);
      return {failed:true};
    }
    if (!res.ok){ stopped = 'HTTP ' + res.status + ' from ' + path; return null; }
    const body = await res.json();
    const errs = body && body.errors && (Array.isArray(body.errors) ? body.errors : Object.values(body.errors));
    if (errs && errs.length){
      const msg = errs.join('; '), w = /try from (\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})/i.exec(msg);
      if (w && path === '/fixtures'){ window = {from:w[1], to:w[2]}; log('plan covers ' + w[1] + ' to ' + w[2] + ' only'); return {outside:true}; }
      stopped = 'API: ' + msg; log(stopped); return null;
    }
    if (remaining !== null && remaining <= 1) stopped = 'daily quota reached';
    return body.response || [];
  }
  return {
    fixturesOn: date => get('/fixtures', {date, timezone:'UTC'}),
    covers: date => !window || (date >= window.from && date <= window.to),
    venue: id => get('/venues', {id}),
    get stats(){ return {used, remaining, stopped, planWindow: window, failed, perMinute}; }
  };
}

const DONE = new Set(['FT', 'AET', 'PEN']);
const UPCOMING = new Set(['NS', 'TBD']);

/* One API fixture -> {kind:'result'|'fixture', gender, row} or {skip}. Row fields follow the archive's columns. */
export function mapFixture(f, matchTeam, mapTournament){
  const league = (f.league && f.league.name) || '';
  // National-team competitions are filed under 'World' by the API; anything else is a domestic club competition.
  if (f.league && f.league.country && f.league.country !== 'World') return {skip:'domestic'};
  if (mapTournament(league, 'men').skip && mapTournament(league, 'women').skip) return {skip:'not counted'};
  const h = matchTeam(f.teams && f.teams.home && f.teams.home.name, league);
  const a = matchTeam(f.teams && f.teams.away && f.teams.away.name, league);
  if (h.skip || a.skip) return {skip: h.skip || a.skip};
  if (h.unmatched && a.unmatched) return {skip:'clubs'};   // e.g. CAF or AFC club competitions, which the API also files under World
  if (h.unmatched || a.unmatched) return {skip:'unmatched', names:[h.unmatched, a.unmatched].filter(Boolean), gender:h.gender};
  if (h.gender !== a.gender) return {skip:'gender mismatch'};
  const gender = h.gender;
  const t = mapTournament(league, gender);
  if (t.skip) return {skip: t.skip};
  const st = f.fixture && f.fixture.status && f.fixture.status.short;
  const iso = f.fixture && f.fixture.date;
  const row = {
    date: String(iso || '').slice(0, 10), kickoff: iso || '', home_team: h.name, away_team: a.name,
    tournament: t.name, city: (f.fixture.venue && f.fixture.venue.city) || '', country: '', neutral: '',
    venue_id: (f.fixture.venue && f.fixture.venue.id) || '', api_id: f.fixture.id, league: league,
    unmapped_tournament: t.unmapped ? 1 : ''
  };
  if (DONE.has(st)){
    if (f.goals == null || f.goals.home == null || f.goals.away == null) return {skip:'no score'};
    row.home_score = f.goals.home; row.away_score = f.goals.away;
    const p = f.score && f.score.penalty;
    if (st === 'PEN' && p && p.home != null && p.away != null) row.shootout_winner = p.home > p.away ? h.name : a.name;
    return {kind:'result', gender, row};
  }
  if (UPCOMING.has(st)) return {kind:'fixture', gender, row};
  return {skip:'status ' + st};
}
