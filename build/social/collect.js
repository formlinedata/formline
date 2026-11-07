/* Runs inside the live site page (build/social.mjs loads it with Playwright), so every number in a post is worked out
   by the site's own code, exactly as the site shows it. Each collector returns plain data; social.mjs draws the slides.
   Collectors take {now, used} where used holds recently posted items to avoid repeats. */
(() => {
const S = {};
const pct = x => Math.round(x * 100);
const flagSrc = (team, ts) => {
  const h = flagTrue(team, ts == null ? null : ts) || '';
  const m = /src="([^"]+)"/.exec(h), ar = /--ar:([\d.]+)/.exec(h);
  return m ? {src:new URL(m[1].replace(/&amp;/g, '&'), location.href).href, ar:ar ? +ar[1] : 1.5} : null;
};
async function useG(g){
  state.gender = g; state.cache = {key:null};
  state.windowYears = DEFAULTS.windowYears; state.comps = new Set(COMP_ORDER); state.confs = new Set();
  state.fifaFilter = DEFAULTS.fifaFilter; state.historicalNames = DEFAULTS.historicalNames; state.maxBand = DEFAULTS.maxBand;
  state.rankBy = DEFAULTS.rankBy;
  await ensureData();
  state.asOf = state.bounds[g].max; state.cache = {key:null};
  return getRatings();
}
const res = (gf, ga) => gf > ga ? 'W' : gf < ga ? 'L' : 'D';
const confName = k => CONF[k] ? CONF[k].name : '';
const dayTxt = ts => new Date(ts).toLocaleDateString('en-GB', {weekday:'long', day:'numeric', month:'long', timeZone:'UTC'});

/* All-time record of two lineages, counted as the Head to head page counts it (shoot-outs as wins). */
function pairRecord(g, ka, kb){
  let w = 0, d = 0, l = 0, gf = 0, ga = 0; const meets = [];
  for (const m of state.matches[g]){
    if (!includeMatch(m)) continue; namesFor(m);
    const aH = m._h === ka && m._a === kb; if (!aH && !(m._h === kb && m._a === ka)) continue;
    const s1 = aH ? m.hs : m.as, s2 = aH ? m.as : m.hs, pen = shootoutWinner(m), pk = pen ? keyOfName(pen) : null;
    const r = s1 > s2 ? 1 : s1 < s2 ? -1 : pk ? (pk === ka ? 1 : -1) : 0;
    if (r > 0) w++; else if (r < 0) l++; else d++; gf += s1; ga += s2;
    meets.push({ts:m.ts, date:fmtDate(m.ts), year:new Date(m.ts).getUTCFullYear(), home:m._hn, away:m._an, hs:m.hs, as:m.as, r, pen:!!pk,
      s1, s2, comp:compName(m.tournament), city:m.city, country:m.country});
  }
  return {n:meets.length, w, d, l, gf, ga, meets};
}
function teamInfo(c, key, g){
  const r = c.byKey.get(key); if (!r) return null;
  return {team:r.team, key, rating:Math.round(r.rating), rank:r.rank || null, ranked:c.table.length, tier:r.tier || null,
    conf:confName(r.conf), flag:flagSrc(r.team), g};
}
function nextFixtures(g){
  const fx = (state.fixtures && state.fixtures[g]) || [];
  const now = Date.now();
  return fx.filter(x => Date.parse(x.kickoff || (x.date + 'T12:00:00Z')) > now);
}
function predictFx(c, fx){
  const pr = fixturePrediction(c, fx); if (!pr || !pr.p) return null;
  return {p:[pr.p.home, pr.p.draw, pr.p.away].map(pct), likely:pr.sl.top[0][0] + '–' + pr.sl.top[0][1]};
}
const fxSlugDate = x => x.date;

/* 1. Upcoming match: the biggest match kicking off between 8 and 56 hours from now. */
S.match = async ({now}) => {
  const out = [];
  for (const g of ['men', 'women']){
    const c = await useG(g);
    for (const x of nextFixtures(g)){
      const ko = Date.parse(x.kickoff || (x.date + 'T12:00:00Z')), h = (ko - now) / 36e5;
      if (h < 8 || h > 56) continue;
      const kh = keyOfName(x.home), ka = keyOfName(x.away), A = teamInfo(c, kh, g), B = teamInfo(c, ka, g);
      if (!A || !B || !A.rank || !B.rank) continue;
      const pr = predictFx(c, x); if (!pr) continue;
      const score = (A.rank + B.rank) * (g === 'women' ? 1.6 : 1) * (x.tournament === 'Friendly' ? 1.5 : 1);
      out.push({score, g, fx:x, A, B, pr, kh, ka});
    }
  }
  if (!out.length) return null;
  out.sort((a, b) => a.score - b.score);
  const t = out[0]; await useG(t.g);
  const rec = pairRecord(t.g, t.kh, t.ka);
  return {type:'match', g:t.g, id:'match|' + t.g + '|' + t.fx.date + '|' + t.fx.home + '|' + t.fx.away,
    home:t.A, away:t.B, comp:compName(t.fx.tournament), date:t.fx.date, kickoff:t.fx.kickoff, city:t.fx.city, country:t.fx.country,
    neutral:t.fx.neutral, day:dayTxt(Date.parse(t.fx.kickoff || t.fx.date + 'T12:00:00Z')), pr:t.pr,
    h2h:{n:rec.n, w:rec.w, d:rec.d, l:rec.l, gf:rec.gf, ga:rec.ga, last:rec.meets.slice(-3).reverse()}};
};

/* 2. Team spotlight: a team with a match this week, else the next in a rotation down the table. */
S.spotlight = async ({now, used}) => {
  const recent = new Set(used.filter(u => u.startsWith('spotlight|')));
  const cands = [];
  for (const g of ['men', 'women']){
    const c = await useG(g);
    const soon = new Set(nextFixtures(g).filter(x => Date.parse(x.date + 'T12:00:00Z') - now < 7 * 864e5).flatMap(x => [keyOfName(x.home), keyOfName(x.away)]));
    c.table.forEach(r => { if (recent.has('spotlight|' + g + '|' + r.key)) return;
      cands.push({g, key:r.key, w:(soon.has(r.key) ? 0 : 1000) + r.rank * (g === 'women' ? 1.4 : 1)}); });
  }
  if (!cands.length) return null;
  /* A little variety: pick among the best few by a date-seeded draw. */
  cands.sort((a, b) => a.w - b.w);
  const seed = Math.floor(now / 864e5), pick = cands[seed % Math.min(6, cands.length)];
  const c = await useG(pick.g), info = teamInfo(c, pick.key, pick.g), hist = c.history.get(pick.key) || [];
  const yearAgo = state.asOf - 365 * 864e5, before = hist.filter(x => x.ts <= yearAgo).pop();
  const last5 = hist.slice(-5).reverse().map(x => ({date:fmtDate(x.ts), opp:x.oppName, gf:x.gf, ga:x.ga, r:res(x.gf, x.ga), comp:compName(x.tournament)}));
  /* most-played opponent, all time */
  const counts = new Map();
  for (const m of state.matches[pick.g]){ if (!includeMatch(m)) continue; namesFor(m);
    const o = m._h === pick.key ? m._a : m._a === pick.key ? m._h : null; if (o) counts.set(o, (counts.get(o) || 0) + 1); }
  const rivalKey = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const rival = rivalKey ? Object.assign({opp:dn(rivalKey[0]), oppFlag:flagSrc(rivalKey[0])}, (({n, w, d, l}) => ({n, w, d, l}))(pairRecord(pick.g, pick.key, rivalKey[0]))) : null;
  const nf = nextFixtures(pick.g).find(x => keyOfName(x.home) === pick.key || keyOfName(x.away) === pick.key);
  const next = nf ? {home:dn(nf.home), away:dn(nf.away), comp:compName(nf.tournament), day:dayTxt(Date.parse(nf.kickoff || nf.date + 'T12:00:00Z')), date:nf.date, pr:predictFx(c, nf)} : null;
  return {type:'spotlight', g:pick.g, id:'spotlight|' + pick.g + '|' + pick.key, team:info,
    change:before ? Math.round(info.rating - before.rating) : null, played:hist.filter(x => x.ts > yearAgo).length, last5, rival, next};
};

/* 3. On this day: the most notable match played on today's date in an earlier year. */
const BIG = [['FIFA World Cup', 100], ["FIFA Women's World Cup", 90], ['UEFA Euro', 70], ['Copa América', 65], ["UEFA Women's Euro", 55],
  ['African Cup of Nations', 55], ['AFC Asian Cup', 50], ['Gold Cup', 45], ['Olympic Games', 40], ['Confederations Cup', 35]];
S.onThisDay = async ({now, used}) => {
  const d = new Date(now), md = String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
  const recent = new Set(used), cands = [];
  for (const g of ['men', 'women']){
    const c = await useG(g); getEditions(g);
    for (const m of state.matches[g]){
      if (fmtDate(m.ts).slice(5) !== md || !includeMatch(m) || m.tournament === 'Friendly') continue;
      namesFor(m);
      const id = 'otd|' + g + '|' + fmtDate(m.ts) + '|' + m.home + '|' + m.away; if (recent.has(id)) continue;
      const big = BIG.find(([t]) => m.tournament === t), ed = m._ed, stage = ed ? (matchStages(ed).get(m) || '') : '';
      const sw = {'Final':60, 'Third place':5, 'Semi-finals':35, 'Quarter-finals':20, 'Round of 16':8}[stage] || 0;
      /* well-known sides today, and a big upset, both make a match more interesting */
      const rh = (c.byKey.get(m._h) || {}).rank || 200, ra = (c.byKey.get(m._a) || {}).rank || 200;
      const fame = Math.max(0, 60 - (rh + ra) / 2) * (g === 'women' ? 0.6 : 1);
      let up = 0;
      if (m.hs !== m.as){ const x = pubDay(m.ts).get(m), p = x ? probsFromE(x.expHome) : null;
        if (p){ const wp = m.hs > m.as ? p.home : p.away; if (wp < 0.25) up = (0.25 - wp) * 240; } }
      cands.push({g, m, id, stage, score:(big ? big[1] : 10) + sw + fame + up + Math.min(m.hs + m.as, 8) * 2});
    }
  }
  cands.sort((a, b) => b.score - a.score);
  if (!cands.length || cands[0].score < 55) return null;   // a quiet date: another kind of post instead
  const t = cands[0]; await useG(t.g);
  const m = t.m, x = pubDay(m.ts).get(m), p = x ? probsFromE(x.expHome) : null, pen = shootoutWinner(m);
  const kh = keyOfName(m.home), ka = keyOfName(m.away);
  const later = pairRecord(t.g, kh, ka);
  const yr = new Date(m.ts).getUTCFullYear(), ed = m._ed;
  return {type:'onthisday', g:t.g, id:t.id, year:yr, yearsAgo:new Date(now).getUTCFullYear() - yr, date:fmtDate(m.ts),
    home:{name:m._hn, flag:flagSrc(m.home, m.ts), modern:dn(kh)}, away:{name:m._an, flag:flagSrc(m.away, m.ts), modern:dn(ka)},
    hs:m.hs, as:m.as, pen:pen ? dn(pen) : null, comp:compName(m.tournament), edition:ed ? ed.label : String(yr), stage:t.stage,
    city:m.city, country:m.country, p:p ? [p.home, p.draw, p.away].map(pct) : null,
    h2h:{n:later.n, w:later.w, d:later.d, l:later.l}};
};

/* 4. Rivalry: a pair meeting soon, else the next of the most-played pairs. */
S.rivalry = async ({now, used}) => {
  const recent = new Set(used.filter(u => u.startsWith('rivalry|')));
  let pick = null;
  for (const g of ['men', 'women']){
    const c = await useG(g);
    for (const x of nextFixtures(g)){
      if (Date.parse(x.date + 'T12:00:00Z') - now > 10 * 864e5) continue;
      const kh = keyOfName(x.home), ka = keyOfName(x.away), id = 'rivalry|' + g + '|' + [kh, ka].sort().join('|');
      if (recent.has(id) || !c.byKey.get(kh) || !c.byKey.get(ka)) continue;
      const rec = pairRecord(g, kh, ka);
      if (rec.n >= (g === 'men' ? 25 : 12) && (!pick || rec.n > pick.rec.n)) pick = {g, kh, ka, rec, id, fx:x};
    }
  }
  if (!pick){
    const pool = [];
    for (const g of ['men', 'women']){
      await useG(g);
      const P = new Map();
      for (const m of state.matches[g]){ if (!includeMatch(m)) continue; namesFor(m); if (!m._h || !m._a || m._h === m._a) continue;
        const k = [m._h, m._a].sort().join('|'); P.set(k, (P.get(k) || 0) + 1); }
      [...P.entries()].filter(([, n]) => n >= (g === 'men' ? 40 : 18)).forEach(([k, n]) => {
        const id = 'rivalry|' + g + '|' + k; if (!recent.has(id)) pool.push({g, k, n, id}); });
    }
    if (!pool.length) return null;
    pool.sort((a, b) => b.n - a.n);
    const seed = Math.floor(now / 864e5), q = pool[seed % Math.min(10, pool.length)];
    const [kh, ka] = q.k.split('|'); await useG(q.g);
    pick = {g:q.g, kh, ka, rec:pairRecord(q.g, kh, ka), id:q.id};
  } else await useG(pick.g);
  const c = getRatings(), r = pick.rec;
  const big = side => { let b = null; r.meets.forEach(x => { const mg = side * (x.s1 - x.s2); if (mg > 0 && (!b || mg > b.mg)) b = Object.assign({mg}, x); }); return b; };
  return {type:'rivalry', g:pick.g, id:pick.id, a:teamInfo(c, pick.kh, pick.g) || {team:dn(pick.kh), flag:flagSrc(pick.kh)},
    b:teamInfo(c, pick.ka, pick.g) || {team:dn(pick.ka), flag:flagSrc(pick.ka)},
    n:r.n, w:r.w, d:r.d, l:r.l, gf:r.gf, ga:r.ga, first:r.meets[0], last:r.meets[r.n - 1], bigA:big(1), bigB:big(-1),
    next:pick.fx ? {home:dn(pick.fx.home), away:dn(pick.fx.away), day:dayTxt(Date.parse(pick.fx.kickoff || pick.fx.date + 'T12:00:00Z')),
      comp:compName(pick.fx.tournament), date:pick.fx.date, pr:predictFx(c, pick.fx)} : null};
};

/* 5. Tournament: chances from the Simulator for a tournament in progress or coming up (one with a knockout stage). */
S.tournament = async ({now, used}) => {
  const last = new Map(); used.forEach((u, i) => { if (u.startsWith('tournament|')) last.set(u.split('|')[1], i); });
  const list = TOURNAMENTS.filter(T => T.status !== 'rewind' && T.knockout && T.knockout.length && (!T.end || Date.parse(T.end + 'T23:59:59Z') > now))
    .sort((a, b) => (last.has(a.id) ? last.get(a.id) + 1 : 0) - (last.has(b.id) ? last.get(b.id) + 1 : 0) || (a.start || '').localeCompare(b.start || ''));
  if (!list.length) return null;
  const T = list[0]; const c = await useG(T.gender);
  const P = prepareTournament(T, c, {});
  const seed = T.id + '|' + JSON.stringify({}) + '|' + fmtDate(state.asOf) + '|' + state.windowYears + '|' + [...state.comps].sort().join(',');
  const R = await new Promise(done => simulate(P, 10000, seed, done));
  const N = R.nStage, rows = R.names.map((t, i) => ({team:dn(t), flag:flagSrc(t), win:R.reach[i][N - 1] / R.runs, ko:R.reach[i][0] / R.runs}))
    .sort((a, b) => b.win - a.win || b.ko - a.ko);
  return {type:'tournament', g:T.gender, id:'tournament|' + T.id, name:T.name, short:T.short, where:T.where, status:T.status, start:T.start, end:T.end,
    firstKo:T.knockout[0].name, teams:rows.length, rows:rows.slice(0, 8).map(r => Object.assign(r, {win:r.win * 100, ko:r.ko * 100}))};
};

/* 6. Tournament from the past: a major final whose anniversary is this week, else the next in rotation. */
const MAJOR = ['FIFA World Cup', "FIFA Women's World Cup", 'UEFA Euro', 'Copa América', 'African Cup of Nations', 'AFC Asian Cup', 'Gold Cup', "UEFA Women's Euro"];
S.pastTournament = async ({now, used}) => {
  const recent = new Set(used), cands = [];
  const d0 = new Date(now), doy = ts => { const d = new Date(ts); return Math.round((Date.UTC(2001, d.getUTCMonth(), d.getUTCDate()) - Date.UTC(2001, 0, 1)) / 864e5); };
  for (const g of ['men', 'women']){
    await useG(g); const E = getEditions(g);
    for (const e of E.list){
      if (!MAJOR.includes(e.tournament) || e.qualLike) continue;
      const id = 'past|' + e.id; if (recent.has(id)) continue;
      const st = matchStages(e), fin = e.matches.filter(m => st.get(m) === 'Final').pop(); if (!fin) continue;
      const ahead = (doy(fin.ts) - doy(now) + 365) % 365;
      cands.push({g, e, fin, id, w:ahead <= 6 ? ahead : 100 + ((e.start / 864e5 + Math.floor(now / 864e5) * 7919) % 997)});
    }
  }
  if (!cands.length) return null;
  cands.sort((a, b) => a.w - b.w);
  const t = cands[0]; await useG(t.g);
  const e = t.e, fin = t.fin; namesFor(fin);
  const pen = shootoutWinner(fin), champ = fin.hs > fin.as ? fin.home : fin.hs < fin.as ? fin.away : pen;
  const ckey = keyOfName(champ);
  let w = 0, dd = 0, l = 0, gf = 0, ga = 0, upset = null;
  for (const m of e.matches){
    namesFor(m);
    const x = pubDay(m.ts).get(m), p = x ? probsFromE(x.expHome) : null;
    if (m._h === ckey || m._a === ckey){ const h = m._h === ckey, s1 = h ? m.hs : m.as, s2 = h ? m.as : m.hs;
      if (s1 > s2) w++; else if (s1 < s2) l++; else dd++; gf += s1; ga += s2; }
    if (p && m.hs !== m.as){ const wp = m.hs > m.as ? p.home : p.away;
      if (!upset || wp < upset.wp) upset = {wp, home:m._hn, away:m._an, hs:m.hs, as:m.as, winner:m.hs > m.as ? m._hn : m._an, stage:matchStages(e).get(m) || ''}; }
  }
  const hostCount = {}; e.matches.forEach(m => { if (m.country) hostCount[m.country] = (hostCount[m.country] || 0) + 1; });
  const host = Object.keys(hostCount).sort((a, b) => hostCount[b] - hostCount[a])[0] || '';
  return {type:'past', g:t.g, id:t.id, tournament:compName(e.tournament), label:e.label, host, teams:e.teams.size,
    champ:{name:dn(champ), flag:flagSrc(champ, fin.ts)}, final:{home:fin._hn, away:fin._an, hs:fin.hs, as:fin.as, pen:pen ? dn(pen) : null,
      city:fin.city, date:fmtDate(fin.ts), homeFlag:flagSrc(fin.home, fin.ts), awayFlag:flagSrc(fin.away, fin.ts)},
    record:{w, d:dd, l, gf, ga}, upset:upset ? Object.assign(upset, {wp:pct(upset.wp)}) : null};
};

/* 7. Rankings: the top ten (men and women in alternate weeks) and the month's biggest movers in the top 60. */
S.rankings = async ({now}) => {
  const g = Math.floor(now / (7 * 864e5)) % 2 ? 'women' : 'men', c = await useG(g);
  const monthAgo = state.asOf - 30 * 864e5;
  const moves = c.table.slice(0, 60).map(r => { const h = c.history.get(r.key) || [], b = h.filter(x => x.ts <= monthAgo).pop();
    return {team:r.team, flag:flagSrc(r.team), d:b ? Math.round(r.rating - b.rating) : 0}; }).filter(x => x.d);
  moves.sort((a, b) => b.d - a.d);
  return {type:'rankings', g, id:'rankings|' + g + '|' + fmtDate(state.asOf), asOf:fmtDay(state.asOf),
    top:c.table.slice(0, 10).map(r => ({team:r.team, flag:flagSrc(r.team), rating:Math.round(r.rating), rank:r.rank})),
    up:moves.slice(0, 3), down:moves.slice(-3).reverse().filter(x => x.d < 0)};
};

window.FL_SOCIAL = S;
})();
