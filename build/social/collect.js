/* Runs inside the live site page (build/social.mjs loads it with Playwright), so every number in a post is worked out
   by the site's own code, exactly as the site shows it. Each collector returns plain data; social.mjs draws the slides.
   Collectors take {now, used} where used holds recently posted items to avoid repeats. */
(() => {
const S = {};
const pct = x => Math.round(x * 100);
/* The flag as an emoji, for post text. Always the flag of the country the side belongs to today (Iran in 1976 gets
   today's Iranian flag; Zaïre gets DR Congo's), since emoji only exist for today's flags. A country that no longer
   exists (the Soviet Union, Yugoslavia, East Germany…) gets a blank white flag. Names the site files as defunct but
   which are the same country under an older name, or the colony it grew from, keep the country's flag. */
const RENAMED = new Set(['West Germany', 'Zaïre', 'Zaire', 'Congo DR', 'Congo-Kinshasa', 'Congo-Léopoldville', 'Belgian Congo', 'Upper Volta',
  'Dahomey', 'Swaziland', 'Northern Rhodesia', 'Nyasaland', 'Tanganyika', 'Gold Coast', 'French Somaliland', 'Bechuanaland', 'Basutoland',
  'Portuguese Guinea', 'Burma', 'Ceylon', 'Malaya', 'Dutch East Indies', 'Formosa', 'Kampuchea', 'Brunei Darussalam', 'Western Samoa',
  'New Hebrides', 'British Honduras', 'Dutch Guiana', 'Dutch Guyana', 'British Guiana', 'Irish Free State', 'Éire', 'Eire']);
const BLANK_FLAG = '\u{1F3F3}\u{FE0F}';
const TAGFLAG = {'gb-eng':'gbeng', 'gb-sct':'gbsct', 'gb-wls':'gbwls'};
const flagEmoji = team => {
  try {
    const name = archiveName(team);
    if (!RENAMED.has(name) && !RENAMED.has(team) && (infoFor(name).defunct || infoFor(team).defunct)) return BLANK_FLAG;
    const key = keyOfName(name);
    if (key && key !== name && !RENAMED.has(name) && infoFor(key).defunct) return BLANK_FLAG;
    const f = flagOf(key ? dn(key) : team, Date.UTC(2100, 0, 1));
    const code = f && f.file ? String(f.file).toLowerCase() : '';
    if (/^[a-z]{2}$/.test(code) && code !== 'xk') return [...code.toUpperCase()].map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)).join('');
    if (TAGFLAG[code]) return '\u{1F3F4}' + [...TAGFLAG[code]].map(c => String.fromCodePoint(0xE0000 + c.charCodeAt(0))).join('') + '\u{E007F}';
  } catch(e){}
  return '';
};
const flagSrc = (team, ts) => {
  const h = flagTrue(team, ts == null ? null : ts) || '';
  const m = /src="([^"]+)"/.exec(h), ar = /--ar:([\d.]+)/.exec(h);
  return m ? {src:new URL(m[1].replace(/&amp;/g, '&'), location.href).href, ar:ar ? +ar[1] : 1.5, emo:flagEmoji(team)} : {src:null, emo:flagEmoji(team)};
};
const emo = team => flagEmoji(team);
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
  return {p:[pr.p.home, pr.p.draw, pr.p.away].map(pct), likely:(pr.sl.pick || pr.sl.top[0])[0] + '–' + (pr.sl.pick || pr.sl.top[0])[1]};
}
const fxSlugDate = x => x.date;

/* 1. Upcoming match: the biggest match kicking off between 8 and 56 hours from now. */
S.match = async ({now, used = []}) => {
  const out = [], done = new Set(used);   // a match already previewed (say, this morning) isn't picked again
  for (const g of ['men', 'women']){
    const c = await useG(g);
    for (const x of nextFixtures(g)){
      const ko = Date.parse(x.kickoff || (x.date + 'T12:00:00Z')), h = (ko - now) / 36e5;
      if (h < 8 || h > 56) continue;
      const kh = keyOfName(x.home), ka = keyOfName(x.away), A = teamInfo(c, kh, g), B = teamInfo(c, ka, g);
      if (!A || !B || !A.rank || !B.rank) continue;
      if (done.has('match|' + g + '|' + x.date + '|' + x.home + '|' + x.away)) continue;
      const pr = predictFx(c, x); if (!pr) continue;
      const score = (A.rank + B.rank) * (g === 'women' ? 1.6 : 1) * (x.tournament === 'Friendly' ? 1.5 : 1);
      out.push({score, g, fx:x, A, B, pr, kh, ka});
    }
  }
  if (!out.length) return null;
  out.sort((a, b) => a.score - b.score);
  const t = out[0]; await useG(t.g);
  const rec = pairRecord(t.g, t.kh, t.ka), c = getRatings();
  const form = key => (c.history.get(key) || []).slice(-5).reverse().map(x => ({date:fmtDate(x.ts), year:new Date(x.ts).getUTCFullYear(),
    opp:x.oppName, oppFlag:flagSrc(x.opp, x.ts), gf:x.gf, ga:x.ga, r:res(x.gf, x.ga), comp:compName(x.tournament)}));
  const yearAgo = state.asOf - 365 * 864e5, chg = key => { const h = c.history.get(key) || [], b = h.filter(x => x.ts <= yearAgo).pop(), r = c.byKey.get(key);
    return b && r ? Math.round(r.rating - b.rating) : null; };
  t.A.form = form(t.kh); t.B.form = form(t.ka); t.A.change = chg(t.kh); t.B.change = chg(t.ka);
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
  const next = nf ? {home:dn(nf.home), away:dn(nf.away), comp:compName(nf.tournament), day:dayTxt(Date.parse(nf.kickoff || nf.date + 'T12:00:00Z')), date:nf.date, kickoff:nf.kickoff || '', pr:predictFx(c, nf)} : null;
  /* Rating over time, one point a month (the last rating in each month), for the chart slide. It starts five years into
     the rating window: every team starts the window level, so the first years are still settling (the top twenty's
     average only steadies about five years in). */
  const from = Math.max(state.asOf - 10 * 365.25 * 864e5, windowStartTs() + 5 * 365.25 * 864e5), pts = [];
  let lastM = '';
  for (const x of hist){ if (x.ts < from) continue; const mk = fmtDate(x.ts).slice(0, 7);
    if (mk === lastM) pts[pts.length - 1] = {ts:x.ts, r:Math.round(x.rating)}; else { pts.push({ts:x.ts, r:Math.round(x.rating)}); lastM = mk; } }
  const peak = pts.length ? pts.reduce((a, b) => b.r > a.r ? b : a) : null, low = pts.length ? pts.reduce((a, b) => b.r < a.r ? b : a) : null;
  const chart = pts.length >= 6 ? {pts, from, to:state.asOf, peak:{...peak, date:fmtDate(peak.ts)}, low:{...low, date:fmtDate(low.ts)}} : null;
  return {type:'spotlight', g:pick.g, id:'spotlight|' + pick.g + '|' + pick.key, team:info, chart,
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
    h2h:{n:later.n, w:later.w, d:later.d, l:later.l}, ctx:pastContext(t.g, m)};
};

/* 3b. Tie-in (international windows): a match coming up in the next three days, told through the most memorable earlier
   meeting of the same two sides: a big-tournament knockout, a shock, a rout. Drawn in the on-this-day style. */
S.tieIn = async ({now, used}) => {
  const recent = new Set(used), cands = [];
  for (const g of ['men', 'women']){
    const c = await useG(g); getEditions(g);
    for (const fx of nextFixtures(g)){
      const ko = Date.parse(fx.kickoff || (fx.date + 'T12:00:00Z')), hrs = (ko - now) / 36e5;
      if (hrs < 6 || hrs > 80) continue;
      const kh = keyOfName(fx.home), ka = keyOfName(fx.away), A = c.byKey.get(kh), B = c.byKey.get(ka);
      if (!A || !B || !A.rank || !B.rank) continue;
      const fame = Math.max(0, 70 - (A.rank + B.rank) / 2) * (g === 'women' ? 0.7 : 1);
      for (const m of state.matches[g]){
        if (!includeMatch(m)) continue; namesFor(m);
        if (!((m._h === kh && m._a === ka) || (m._h === ka && m._a === kh))) continue;
        const id = 'tiein|' + g + '|' + fmtDate(m.ts) + '|' + m.home + '|' + m.away; if (recent.has(id)) continue;
        const big = BIG.find(([t]) => m.tournament === t), ed = m._ed, stage = ed ? (matchStages(ed).get(m) || '') : '';
        const sw = {'Final':60, 'Third place':5, 'Semi-finals':35, 'Quarter-finals':20, 'Round of 16':8}[stage] || 0;
        let up = 0;
        if (m.hs !== m.as){ const x = pubDay(m.ts).get(m), p = x ? probsFromE(x.expHome) : null;
          if (p){ const wp = m.hs > m.as ? p.home : p.away; if (wp < 0.3) up = (0.3 - wp) * 200; } }
        const friendly = m.tournament === 'Friendly' ? -25 : 0, recency = Math.max(0, 15 - (now - m.ts) / (365.25 * 864e5) / 3);
        cands.push({g, m, fx, id, stage, score:(big ? big[1] : 15) + sw + fame + up + friendly + recency + Math.min(Math.abs(m.hs - m.as), 5) * 3});
      }
    }
  }
  cands.sort((a, b) => b.score - a.score);
  if (!cands.length || cands[0].score < 45) return null;
  const t = cands[0]; await useG(t.g);
  const m = t.m, x = pubDay(m.ts).get(m), p = x ? probsFromE(x.expHome) : null, pen = shootoutWinner(m);
  const kh = keyOfName(m.home), ka = keyOfName(m.away), later = pairRecord(t.g, kh, ka), yr = new Date(m.ts).getUTCFullYear(), ed = m._ed;
  const c = getRatings(), nf = t.fx;
  return {type:'onthisday', mode:'tiein', g:t.g, id:t.id, year:yr, yearsAgo:new Date(now).getUTCFullYear() - yr, date:fmtDate(m.ts),
    home:{name:m._hn, flag:flagSrc(m.home, m.ts), modern:dn(kh)}, away:{name:m._an, flag:flagSrc(m.away, m.ts), modern:dn(ka)},
    hs:m.hs, as:m.as, pen:pen ? dn(pen) : null, comp:compName(m.tournament), edition:ed ? ed.label : String(yr), stage:t.stage,
    city:m.city, country:m.country, p:p ? [p.home, p.draw, p.away].map(pct) : null,
    h2h:{n:later.n, w:later.w, d:later.d, l:later.l}, ctx:pastContext(t.g, m),
    next:{home:dn(nf.home), away:dn(nf.away), homeFlag:flagSrc(nf.home), awayFlag:flagSrc(nf.away), comp:compName(nf.tournament),
      day:dayTxt(Date.parse(nf.kickoff || nf.date + 'T12:00:00Z')), date:nf.date, kickoff:nf.kickoff || '', pr:predictFx(c, nf)}};
};

/* Is an international window on? Many national-team fixtures in the next few days, or results in the last two. */
S.windowOn = async ({now}) => {
  let n = 0;
  for (const g of ['men', 'women']){
    await useG(g);
    n += ((state.fixtures && state.fixtures[g]) || []).filter(x => { const t = Date.parse(x.kickoff || (x.date + 'T12:00:00Z')); return t > now - 2 * 864e5 && t < now + 4 * 864e5; }).length;
    n += state.matches[g].filter(m => m.ts > now - 2 * 864e5 && m.ts <= now).length;
  }
  return {on:n >= 25, n};
};


/* The same matches put to World Elo and the FIFA method, with their ratings as they stood on the morning of each match:
   how many winners each picked, over the matches with a winner where all three favoured a side. Formline's pick is the
   call it published. Used by the day's roundup and the window recap, which only show it when Formline did best. */
async function cmpOthers(all){
  const D = 864e5, cmp = {n:0, us:0, elo:0, fifa:0};
  for (const g of ['men', 'women']){
    const es = all.filter(e => e.g === g && e.result && e.result[0] !== e.result[1] && e.p[0] !== e.p[2]); if (!es.length) continue;
    const c = await useG(g), ms = state.matches[g], day = new Map();
    for (const e of es){
      try {
        const kh = c.resolve(e.home), ka = c.resolve(e.away), t = Date.parse(e.date + 'T12:00:00Z'), home = e.result[0] > e.result[1]; if (!kh || !ka) continue;
        if (!day.has(e.date)) day.set(e.date, {F:fifaMethod(g, Date.parse(e.date + 'T00:00:00Z') - 1), E:plainElo(g, Date.parse(e.date + 'T00:00:00Z') - 1)});
        const {F, E} = day.get(e.date), mm = ms.find(x => Math.abs(x.ts - t) <= 1.5 * D && (namesFor(x), x._h === kh && x._a === ka));
        const fh = F && F.byKey.get(kh), fa = F && F.byKey.get(ka);
        if (!mm || !fh || !fa || !fh.rank || !fa.rank || !E.has(kh) || !E.has(ka)) continue;
        const ee = eloE(E.get(kh) - E.get(ka) + venueSide(mm) * ELO_HOME), fx = fifaExpect(g, fh, fa, mm);
        if (ee === 0.5 || fx === 0.5) continue;
        cmp.n++; if ((e.p[0] > e.p[2]) === home) cmp.us++; if ((ee > 0.5) === home) cmp.elo++; if ((fx > 0.5) === home) cmp.fifa++;
      } catch(err){}
    }
  }
  return cmp.n ? cmp : null;
}

/* Results roundup: one day's results (a date, Toronto's) with Formline's published calls, the upsets, and the window so far.
   Only forecasts saved before kick-off count (data/forecasts.json). A day with fewer than five results gets no roundup of
   its own; its matches still count in the next roundup's "window so far". */
/* How a checked forecast reads, with the page's own callVerdict: 'right' (the picked result happened), 'close' (a draw
   in a match Formline had as a toss-up before kick-off) or 'wrong'. tally() sums a list up: matches that had a winner
   and how many of those Formline picked, draws and how many of those it had called close. */
const oOfE = e => e.result[0] > e.result[1] ? 0 : e.result[0] < e.result[1] ? 2 : 1;
const tally = es => { const C = callCounts(es.map(e => ({p:e.p, outcome:oOfE(e)}))); return {n:C.n, dec:C.decided, won:C.won, draws:C.draws, close:C.close}; };
S.roundup = async ({now, day}) => {
  day = day || new Date(now - 864e5).toLocaleDateString('en-CA', {timeZone:'America/Toronto'});
  const all = ((state.record && state.record.entries) || []).filter(e => e.p && e.result && !e.void);
  const local = e => e.kickoff ? new Date(e.kickoff).toLocaleDateString('en-CA', {timeZone:'America/Toronto'}) : e.date;
  const list = all.filter(e => local(e) === day);
  if (list.length < 5) return null;
  const out = [];
  for (const g of ['men', 'women']){
    const es = list.filter(e => e.g === g); if (!es.length) continue;
    const c = await useG(g);
    for (const e of es){
      const kh = c.resolve(e.home), ka = c.resolve(e.away), A = c.byKey.get(kh), B = c.byKey.get(ka), ts = Date.parse(e.date + 'T12:00:00Z');
      const o = e.result[0] > e.result[1] ? 0 : e.result[0] < e.result[1] ? 2 : 1, call = e.p.indexOf(Math.max(...e.p));
      out.push({g, home:dn(kh || e.home), away:dn(ka || e.away), hs:e.result[0], as:e.result[1], comp:compName(e.tournament),
        hf:flagSrc(dn(kh || e.home), ts), af:flagSrc(dn(ka || e.away), ts), p:e.p.map(pct), call, o, hit:call === o, v:callVerdict(e.p, o), kh, ka, ts,
        top:(A && A.rank ? A.rank : 999) + (B && B.rank ? B.rank : 999) + (g === 'women' ? 40 : 0)});
    }
  }
  out.sort((a, b) => a.top - b.top);
  /* The result of the day: the match between the highest-ranked sides, with what it did to both ratings (once the nightly
     run has rated it). */
  let big = null;
  if (out[0] && out[0].top < 1998){
    const b = out[0], c = await useG(b.g);
    const side = (key, opp) => { const r = c.byKey.get(key), h = (c.history.get(key) || []).filter(x => x.opp === opp && Math.abs(x.ts - b.ts) <= 1.5 * 864e5).pop();
      return {rank:r && r.rank ? r.rank : null, rating:h ? Math.round(h.rating) : (r ? Math.round(r.rating) : null), delta:h ? Math.round(h.rating) - Math.round(h.pre) : null}; };
    big = {g:b.g, home:b.home, away:b.away, hs:b.hs, as:b.as, comp:b.comp, hf:b.hf, af:b.af, p:b.p, call:b.call, o:b.o, hit:b.hit, v:b.v, H:side(b.kh, b.ka), A:side(b.ka, b.kh)};
  }
  const hits = out.filter(x => x.hit).length;
  const ups = out.filter(x => x.o !== 1 && x.p[x.o] < 35).sort((a, b) => a.p[a.o] - b.p[b.o]).slice(0, 4);
  /* The window so far: every scored forecast in the last ten days. */
  const since = new Date(Date.parse(day + 'T12:00:00Z') - 10 * 864e5).toISOString().slice(0, 10);
  const win = all.filter(e => local(e) <= day && local(e) >= since);
  const winHits = win.filter(e => e.p.indexOf(Math.max(...e.p)) === (e.result[0] > e.result[1] ? 0 : e.result[0] < e.result[1] ? 2 : 1)).length;
  let cmp = null; try { cmp = await cmpOthers(list); } catch(e){}
  return {type:'roundup', id:'roundup|' + day, g:out.some(x => x.g === 'men') ? 'men' : 'women', day, cmp,
    dayTxt:new Date(day + 'T12:00:00Z').toLocaleDateString('en-GB', {weekday:'long', day:'numeric', month:'long', timeZone:'UTC'}),
    n:out.length, hits, tally:tally(list), list:out, ups, big, win:{n:win.length, hits:winHits, ...tally(win)}};
};

/* Today's matches (Toronto's date) with Formline's published calls, biggest first, leaving out any that kicked off before
   the post goes out. Each row carries its kick-off; social.mjs writes it out in Toronto and UK time. */
async function todayList(now){
  const day = new Date(now).toLocaleDateString('en-CA', {timeZone:'America/Toronto'});
  const es = ((state.record && state.record.entries) || []).filter(e => e.p && !e.void && !e.result && !(e.kickoff && Date.parse(e.kickoff) <= now) &&
    (e.kickoff ? new Date(e.kickoff).toLocaleDateString('en-CA', {timeZone:'America/Toronto'}) : e.date) === day);
  const out = [];
  for (const g of ['men', 'women']){
    const mine = es.filter(e => e.g === g); if (!mine.length) continue;
    const c = await useG(g);
    for (const e of mine){
      const kh = c.resolve(e.home), ka = c.resolve(e.away), A = c.byKey.get(kh), B = c.byKey.get(ka), ts = Date.parse(e.date + 'T12:00:00Z');
      const call = e.p.indexOf(Math.max(...e.p));
      out.push({g, home:dn(kh || e.home), away:dn(ka || e.away), hf:flagSrc(dn(kh || e.home), ts), af:flagSrc(dn(ka || e.away), ts), p:e.p.map(pct), call,
        kickoff:e.kickoff || '', comp:compName(e.tournament),
        time:e.kickoff ? new Date(e.kickoff).toLocaleTimeString('en-US', {hour:'numeric', minute:'2-digit', timeZone:'America/Toronto'}) : '',
        top:(A && A.rank ? A.rank : 999) + (B && B.rank ? B.rank : 999) + (g === 'women' ? 40 : 0)});
    }
  }
  out.sort((a, b) => a.top - b.top);
  return {day, dayTxt:new Date(day + 'T12:00:00Z').toLocaleDateString('en-GB', {weekday:'long', day:'numeric', month:'long', timeZone:'UTC'}), n:out.length, list:out};
}
/* Instagram Story on window days: the nine biggest of today's matches. */
S.storyToday = async ({now}) => {
  const t = await todayList(now);
  return t.n < 3 ? null : {...t, list:t.list.slice(0, 9)};
};
/* The morning feed post on window days: today's matches, when at least five have a published forecast. */
S.today = async ({now}) => {
  const t = await todayList(now);
  if (t.n < 5) return null;
  return {type:'today', id:'today|' + t.day, g:t.list[0].g, ...t, list:t.list.slice(0, 33)};
};

/* Context for a past match (on-this-day and tie-in posts): how its tournament ended, both sides then v now, that
   tournament's biggest upset, and every meeting since. Call with the game already loaded (useG). */
function pastContext(g, m){
  namesFor(m);
  const kh = keyOfName(m.home), ka = keyOfName(m.away), ed = m._ed, out = {};
  const label = k => { const f = (fmtE && fmtE.ok) ? fmtE.finish.get(k) : null; return f ? finishOf(f)[1] : null; };
  let fmtE = null;
  if (ed && !ed.qualLike && ed.matches.length > 2){
    fmtE = editionFormat(ed);
    let champ = null;
    if (fmtE.ok){ for (const [k, f] of fmtE.finish) if (f === 'Winner' || f === '1st') champ = k; }
    const last = finalOf(ed);
    if (!champ && last) champ = winnerOf(last);
    if (champ && ed.end <= state.asOf){
      const fin = last || null; if (fin) namesFor(fin);
      const say = k => { const l = label(k); return l === 'Champions' ? 'won it' : l === 'Runners-up' ? 'reached the final'
        : l ? (/place$|Third|Fourth/.test(l) ? 'finished ' + l.toLowerCase() : 'went out in the ' + l.toLowerCase()) : null; };
      out.ended = {champ:dn(champ), champFlag:flagSrc(dn(champ), ed.end), edition:ed.label,
        final:fin ? {home:fin._hn, away:fin._an, hs:fin.hs, as:fin.as, pen:shootoutWinner(fin) ? dn(shootoutWinner(fin)) : null} : null,
        home:say(kh), away:say(ka)};
    }
    /* that tournament's biggest upset, other than this match */
    let best = null;
    for (const x of ed.matches){ if (x === m || x.hs === x.as) continue; namesFor(x);
      const d = pubDay(x.ts).get(x), p = d ? probsFromE(d.expHome) : null; if (!p) continue;
      const wp = x.hs > x.as ? p.home : p.away;
      if (wp < 0.3 && (!best || wp < best.wp)) best = {wp, home:x._hn, away:x._an, hs:x.hs, as:x.as, winner:x.hs > x.as ? x._hn : x._an,
        winFlag:flagSrc(x.hs > x.as ? x.home : x.away, x.ts), stage:matchStages(ed).get(x) || '', date:fmtDate(x.ts)}; }
    if (best) out.upset = Object.assign(best, {wp:pct(best.wp)});
  }
  /* then v now: the published table on the day of the match, against today's */
  const keep = state.asOf;
  state.asOf = m.ts; state.cache = {key:null};
  const cThen = getRatings(), then = k => { const r = cThen.byKey.get(k); return r ? {rating:Math.round(r.rating), rank:r.rank || null, of:cThen.table.length} : null; };
  out.then = {home:then(kh), away:then(ka)};
  state.asOf = keep; state.cache = {key:null};
  const cNow = getRatings(), now = k => { const r = cNow.byKey.get(k); return r ? {rating:Math.round(r.rating), rank:r.rank || null, of:cNow.table.length} : null; };
  out.now = {home:now(kh), away:now(ka), date:fmtDate(state.asOf)};
  /* every meeting since */
  const rec = pairRecord(g, kh, ka), since = rec.meets.filter(x => x.ts > m.ts);
  out.since = {n:since.length, w:since.filter(x => x.r > 0).length, d:since.filter(x => x.r === 0).length, l:since.filter(x => x.r < 0).length,
    last:since.slice(-3).reverse()};
  return out;
}

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
  /* Decade by decade, and their meetings at the big tournaments (finals only, not qualifiers). */
  const dec = new Map();
  r.meets.forEach(x => { const k = Math.floor(x.year / 10) * 10; if (!dec.has(k)) dec.set(k, {dec:k, n:0, w:0, d:0, l:0}); const D = dec.get(k);
    D.n++; if (x.r > 0) D.w++; else if (x.r < 0) D.l++; else D.d++; });
  getEditions(pick.g);
  const BIGT = MAJOR.concat(['Olympic Games', 'Confederations Cup']);
  const finals = [];
  for (const m of state.matches[pick.g]){ if (!includeMatch(m)) continue; namesFor(m);
    if (!((m._h === pick.kh && m._a === pick.ka) || (m._h === pick.ka && m._a === pick.kh)) || !BIGT.includes(m.tournament)) continue;
    const ed = m._ed, st = ed ? (matchStages(ed).get(m) || '') : '', pen = shootoutWinner(m);
    finals.push({year:new Date(m.ts).getUTCFullYear(), comp:compName(m.tournament), stage:st, home:m._hn, away:m._an, hs:m.hs, as:m.as, pen:pen ? dn(pen) : null}); }
  return {type:'rivalry', g:pick.g, id:pick.id, a:teamInfo(c, pick.kh, pick.g) || {team:dn(pick.kh), flag:flagSrc(pick.kh)},
    b:teamInfo(c, pick.ka, pick.g) || {team:dn(pick.ka), flag:flagSrc(pick.ka)},
    n:r.n, w:r.w, d:r.d, l:r.l, gf:r.gf, ga:r.ga, decades:[...dec.values()].sort((a, b) => a.dec - b.dec), finals, first:r.meets[0], last:r.meets[r.n - 1], bigA:big(1), bigB:big(-1),
    next:pick.fx ? {home:dn(pick.fx.home), away:dn(pick.fx.away), kickoff:pick.fx.kickoff || '', day:dayTxt(Date.parse(pick.fx.kickoff || pick.fx.date + 'T12:00:00Z')),
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
  /* The groups as they stand: the results already played, in the tournament's own order (points, then head to head or goal
     difference as its rules say; level sides by their chance of going through), with each side's chance of winning the
     group and of reaching the first knockout round. */
  const ix = new Map(R.names.map((t, i) => [t, i])), koOf = t => 100 * R.reach[ix.get(t)][0] / R.runs, firstOf = t => 100 * R.pos[ix.get(t)][0] / R.runs;
  const groups = Object.entries(T.groups || {}).map(([gn, teams]) => {
    const fx = P.fixtures.filter(f => f.g === gn), done = fx.filter(f => f.played);
    const tab = teams.map(t => ({t, pl:0, p:0, gd:0, gf:0})), by = new Map(tab.map(r => [r.t, r]));
    for (const f of done){ const [x, y] = f.played, A = by.get(f.home), B = by.get(f.away);
      A.pl++; B.pl++; A.gf += x; B.gf += y; A.gd += x - y; B.gd += y - x; if (x > y) A.p += 3; else if (x < y) B.p += 3; else { A.p++; B.p++; } }
    const h2h = (r, set) => { let p = 0, gd = 0, gf = 0;
      for (const m of done) if (set.has(m.home) && set.has(m.away)){ const [x, y] = m.played;
        if (m.home === r.t){ gf += x; gd += x - y; p += x > y ? 3 : (x === y ? 1 : 0); }
        if (m.away === r.t){ gf += y; gd += y - x; p += y > x ? 3 : (x === y ? 1 : 0); } }
      return [p, gd, gf]; };
    const last = (u, v) => koOf(v.t) - koOf(u.t) || firstOf(v.t) - firstOf(u.t) || dn(u.t).localeCompare(dn(v.t));
    if (T.tiebreak === 'h2h'){
      const byP = new Map(); tab.forEach(r => { if (!byP.has(r.p)) byP.set(r.p, new Set()); byP.get(r.p).add(r.t); });
      tab.forEach(r => { const st = byP.get(r.p); r.h = st.size > 1 ? h2h(r, st) : [0, 0, 0]; });
      tab.sort((u, v) => v.p - u.p || v.h[0] - u.h[0] || v.h[1] - u.h[1] || v.h[2] - u.h[2] || v.gd - u.gd || v.gf - u.gf || last(u, v));
    } else tab.sort((u, v) => v.p - u.p || v.gd - u.gd || v.gf - u.gf || last(u, v));
    return {name:gn, played:done.length, total:fx.length, rows:tab.map(r => ({team:dn(r.t), flag:flagSrc(r.t), pl:r.pl, pts:r.p, gd:r.gd, ko:koOf(r.t), first:firstOf(r.t)}))};
  });
  /* What is still to play in the groups: each unplayed group match that has a date in the fixture list, soonest first. */
  const sched = ((state.fixtures && state.fixtures[T.gender]) || []).filter(x => (!T.tournament || x.tournament === T.tournament) && Date.parse(x.kickoff || (x.date + 'T12:00:00Z')) > now);
  const taken = new Set(), left = [], open = P.fixtures.filter(f => !f.played);
  for (const f of open){
    const kh = c.resolve(f.home), ka = c.resolve(f.away);
    const x = sched.find(x => !taken.has(x) && ((keyOfName(x.home) === kh && keyOfName(x.away) === ka) || (T.rounds !== 2 && keyOfName(x.home) === ka && keyOfName(x.away) === kh)));
    if (!x) continue; taken.add(x);
    const pr = predictFx(c, x); if (!pr) continue;
    const xh = keyOfName(x.home), xa = keyOfName(x.away), ko = Date.parse(x.kickoff || (x.date + 'T12:00:00Z'));
    left.push({group:f.g, home:dn(xh || x.home), away:dn(xa || x.away), hf:flagSrc(dn(xh || x.home)), af:flagSrc(dn(xa || x.away)), kickoff:x.kickoff || '', date:x.date, ko,
      day:new Date(ko).toLocaleDateString('en-GB', {weekday:'short', day:'numeric', month:'short', timeZone:'UTC'}), p:pr.p, call:pr.p.indexOf(Math.max(...pr.p))});
  }
  left.sort((a, b) => a.ko - b.ko || a.home.localeCompare(b.home));
  return {type:'tournament', g:T.gender, id:'tournament|' + T.id, name:T.name, short:T.short, where:T.where, status:T.status, start:T.start, end:T.end,
    firstKo:T.knockout[0].name, koCol:T.knockout[0].col || T.knockout[0].name, teams:rows.length, rows:rows.slice(0, 8).map(r => Object.assign(r, {win:r.win * 100, ko:r.ko * 100})),
    groups, groupsPlayed:groups.reduce((n, g) => n + g.played, 0), toPlay:{n:open.length, dated:left.length, list:left.slice(0, 8)}};
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
  let w = 0, dd = 0, l = 0, gf = 0, ga = 0;
  const st = matchStages(e), road = [], ups = [];
  for (const m of e.matches){
    namesFor(m);
    const x = pubDay(m.ts).get(m), p = x ? probsFromE(x.expHome) : null, mpen = shootoutWinner(m);
    if (m._h === ckey || m._a === ckey){ const h = m._h === ckey, s1 = h ? m.hs : m.as, s2 = h ? m.as : m.hs;
      if (s1 > s2) w++; else if (s1 < s2) l++; else dd++; gf += s1; ga += s2;
      const opp = h ? m.away : m.home, wp = p ? (h ? p.home : p.away) : null;
      road.push({stage:st.get(m) || '', date:fmtDate(m.ts), opp:h ? m._an : m._hn, oppFlag:flagSrc(opp, m.ts), oppEmo:emo(opp, m.ts), gf:s1, ga:s2,
        r:s1 > s2 ? 'W' : s1 < s2 ? 'L' : mpen ? (keyOfName(mpen) === ckey ? 'W' : 'L') : 'D', pen:!!mpen, wp:wp == null ? null : pct(wp)}); }
    /* Upsets: a winner given under 35% before kick-off (a shoot-out doesn't count). */
    if (p && m.hs !== m.as){ const wp = m.hs > m.as ? p.home : p.away, win = m.hs > m.as ? m.home : m.away, lose = m.hs > m.as ? m.away : m.home;
      if (wp < 0.35) ups.push({wp, home:m._hn, away:m._an, hs:m.hs, as:m.as, winner:m.hs > m.as ? m._hn : m._an, loser:m.hs > m.as ? m._an : m._hn,
        winFlag:flagSrc(win, m.ts), loseFlag:flagSrc(lose, m.ts), winEmo:emo(win, m.ts), stage:st.get(m) || '', date:fmtDate(m.ts)}); }
  }
  ups.sort((a, b) => a.wp - b.wp);
  const upset = ups[0] || null;
  /* Who took part: the groups of the first group phase, in final order, else every team by confederation. */
  const fmt = editionFormat(e), nameAt = new Map();
  e.matches.forEach(m => { if (!nameAt.has(m._h)) nameAt.set(m._h, m.home); if (!nameAt.has(m._a)) nameAt.set(m._a, m.away); });
  const tm = k => ({name:dn(nameAt.get(k) || k), flag:flagSrc(nameAt.get(k) || k, e.start), champ:k === ckey});
  let groups = null;
  if (fmt.ok && fmt.phases && fmt.phases.length){
    const ph = fmt.phases[0];
    groups = ph.groups.map((gp, gi) => { const T = new Map(gp.map(k => [k, {k, p:0, gd:0, gf:0}]));
      for (const m of ph.matches[gi]){ const A = T.get(m._h), B = T.get(m._a); if (!A || !B) continue;
        A.gf += m.hs; B.gf += m.as; A.gd += m.hs - m.as; B.gd += m.as - m.hs;
        if (m.hs > m.as) A.p += 3; else if (m.hs < m.as) B.p += 3; else { A.p++; B.p++; } }
      return [...T.values()].sort((a, b) => b.p - a.p || b.gd - a.gd || b.gf - a.gf).map(r => tm(r.k)); });
    if (groups.some(gp => gp.length < 2)) groups = null;
  }
  /* Sides that skipped the group stage (holders or hosts given a bye) are listed apart. */
  const inGroups = new Set(groups ? groups.flat().map(t => t.name) : []);
  const byes = groups ? [...nameAt.keys()].map(tm).filter(t => !inGroups.has(t.name)) : [];
  let byConf = null;
  if (!groups){ const C = new Map();
    for (const k of new Set([...nameAt.keys()])){ const i0 = infoFor(k), cf = confName(i0.conf === 'UNKNOWN' ? '' : poolOf(k, e.start)) || 'Other'; if (!C.has(cf)) C.set(cf, []); C.get(cf).push(tm(k)); }
    byConf = [...C.entries()].sort((a, b) => b[1].length - a[1].length).map(([conf, teams]) => ({conf, teams:teams.sort((a, b) => a.name.localeCompare(b.name))})); }
  const hostCount = {}; e.matches.forEach(m => { if (m.country) hostCount[m.country] = (hostCount[m.country] || 0) + 1; });
  const host = Object.keys(hostCount).sort((a, b) => hostCount[b] - hostCount[a])[0] || '';
  return {type:'past', g:t.g, id:t.id, tournament:compName(e.tournament), label:e.label, host, teams:e.teams.size,
    champ:{name:dn(champ), flag:flagSrc(champ, fin.ts)}, final:{home:fin._hn, away:fin._an, hs:fin.hs, as:fin.as, pen:pen ? dn(pen) : null,
      city:fin.city, date:fmtDate(fin.ts), homeFlag:flagSrc(fin.home, fin.ts), awayFlag:flagSrc(fin.away, fin.ts)},
    champEmo:emo(champ, fin.ts), record:{w, d:dd, l, gf, ga}, upset:upset ? Object.assign({}, upset, {wp:pct(upset.wp)}) : null,
    upsets:ups.slice(0, 4).map(u => Object.assign({}, u, {wp:pct(u.wp)})), road, groups, byes, byConf};
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
    next:c.table.slice(10, 20).map(r => ({team:r.team, flag:flagSrc(r.team), rating:Math.round(r.rating), rank:r.rank})),
    up:moves.slice(0, 3), down:moves.slice(-3).reverse().filter(x => x.d < 0)};
};

/* How often Formline is right: the site's standing test (every match since 2019, each predicted from the ratings of that
   year's 1 January, next to World Elo and the FIFA method run the same way) and the live record of forecasts published
   before kick-off. Men one fortnight, women the next. The numbers are the Forecast record page's own, worked out here
   the same way; the builder only claims a lead where there is one. */
S.record = async ({now, g, used = []}) => {
  g = g || (Math.floor(now / (14 * 864e5)) % 2 ? 'women' : 'men');
  if (used.includes('record|' + g + '|' + new Date(now).toISOString().slice(0, 7))) return null;
  await useG(g); try { await loadFixtures(); } catch(e){}
  kickVs(g); for (let i = 0; i < 1200 && !vsCache[g]; i++) await new Promise(r => setTimeout(r, 200));
  const T = vsTotals(g); if (!T || T.dec < 500) return null;
  const ys = T.ys, split = j => { const D = T.dis[j]; return D && D[0] ? {n:D[0], us:D[1], them:D[2], draw:D[3]} : null; };
  const rec = state.record, sc = rec && rec.entries ? rec.entries.filter(e => e.g === g && e.result) : [];
  return {type:'record', g, id:'record|' + g + '|' + new Date(now).toISOString().slice(0, 7), asOf:fmtDay(state.asOf), since:ys[0].y, to:ys[ys.length - 1].y, n:T.n, dec:T.dec,
    hit:[0, 1, 2].map(j => 100 * T.hit[j] / T.dec), score:[0, 1, 2].map(j => sharp(T.ll[j] / T.n)), years:ys.length,
    ahead:[0, ys.filter(a => a.ll[0] < a.ll[1]).length, ys.filter(a => a.ll[0] < a.ll[2]).length], split:[null, split(1), split(2)],
    live:sc.length >= 20 ? {n:sc.length, hit:sc.filter(e => e.hit).length} : null};
};

/* How Formline's published calls did over an international window: a first count a couple of days in (mode 'mid') and the
   final one the morning after the last match day (mode 'final'). Only forecasts saved before kick-off count
   (data/forecasts.json). A window is a run of busy days (eight matches or more across both games) no more than two days
   apart. The same matches are also put to World Elo and the FIFA method, with their ratings as they stood on the
   morning of each match, for a comparison the builder only shows when Formline did at least as well as both.
   By hand: from (a date) and min (fewest results) recap any period. */
S.windowRecord = async ({now, used = [], mode, from, min = 20}) => {
  const D = 864e5, iso = t => new Date(t).toISOString().slice(0, 10), ts = d => Date.parse(d + 'T12:00:00Z'), today = iso(now);
  await useG('men'); try { await loadFixtures(); } catch(e){}
  const seen = new Set();
  for (const g of ['men', 'women']){ await useG(g);
    state.matches[g].filter(m => m.ts > now - 30 * D && m.ts <= now).forEach(m => seen.add(iso(m.ts) + '|' + g + '|' + m.home + '|' + m.away));
    ((state.fixtures && state.fixtures[g]) || []).forEach(x => seen.add(x.date + '|' + g + '|' + x.home + '|' + x.away)); }
  const per = new Map(); seen.forEach(k => { const d = k.slice(0, 10); per.set(d, (per.get(d) || 0) + 1); });
  const busy = [...per].filter(x => x[1] >= 8).map(x => x[0]).sort();
  let L = busy.filter(d => d < today).pop() || null, S0 = L;
  if (L) for (;;){ const p = busy.filter(d => d < S0 && ts(S0) - ts(d) <= 2 * D).shift(); if (!p) break; S0 = p; }
  const cont = !!L && busy.some(d => d >= today && ts(d) - ts(L) <= 2 * D);
  let m = from ? (mode || 'final') : !L ? null : !cont && ts(today) - ts(L) <= 2 * D ? 'final' : cont && ts(L) - ts(S0) >= 2 * D ? 'mid' : null;
  if (!m || (mode && m !== mode)) return null;
  const start = from || S0, end = from ? today : m === 'final' ? iso(ts(L) + D) : today, id = 'window|' + m + '|' + start;
  if (used.includes(id)) return null;
  const all = ((state.record && state.record.entries) || []).filter(e => e.p && e.result && !e.void && e.date >= start && e.date <= end);
  if (all.length < min) return null;
  const oOf = e => e.result[0] > e.result[1] ? 0 : e.result[0] < e.result[1] ? 2 : 1, callOf = e => e.p.indexOf(Math.max(...e.p));
  const byG = {}, rows = [];
  for (const g of ['men', 'women']){
    const es = all.filter(e => e.g === g); if (!es.length) continue;
    byG[g] = {n:es.length, hits:es.filter(e => callOf(e) === oOf(e)).length, ...tally(es)};
    const c = await useG(g);
    for (const e of es){
      const kh = c.resolve(e.home), ka = c.resolve(e.away), o = oOf(e), t = ts(e.date);
      rows.push({g, home:dn(kh || e.home), away:dn(ka || e.away), hs:e.result[0], as:e.result[1], comp:compName(e.tournament), hf:flagSrc(dn(kh || e.home), t), af:flagSrc(dn(ka || e.away), t),
        o, call:callOf(e), hit:callOf(e) === o, v:callVerdict(e.p, o), got:pct(e.p[o]), fav:pct(Math.max(...e.p))});
    }
  }
  let cmp = null; try { cmp = await cmpOthers(all); } catch(e){}
  const strong = rows.filter(r => r.fav >= 70);
  const last = rows.map(r => r).length ? all.map(e => e.date).sort().pop() : end;
  return {type:'windowRecord', mode:m, id, g:byG.men ? 'men' : 'women', from:start, to:m === 'final' && !from ? L : last, n:rows.length, hits:rows.filter(r => r.hit).length, tally:tally(all), byG,
    cmp, strong:{n:strong.length, hits:strong.filter(r => r.hit).length},
    ups:rows.filter(r => r.o !== 1 && r.got < 35).sort((a, b) => a.got - b.got).slice(0, 5)};
};

window.FL_SOCIAL = S;
})();
