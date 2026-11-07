// Runs the site's own rating model in Node, so the forecasts the nightly job records are exactly the ones the site
// shows. The page's script is loaded into a sandbox with just enough of a browser around it to start.
import fs from 'node:fs';
import vm from 'node:vm';

function stubElement(){
  const el = {innerHTML:'', textContent:'', value:'', dataset:{}, style:{},
    classList:{toggle(){}, add(){}, remove(){}}, setAttribute(){}, removeAttribute(){}, getAttribute(){ return null; },
    addEventListener(){}, getContext(){ return {}; }, closest(){ return null; }, querySelector(){ return stubElement(); },
    querySelectorAll(){ return []; }, remove(){}, focus(){}, setSelectionRange(){}, appendChild(){}};
  return el;
}

export function loadModel(htmlPath){
  const html = fs.readFileSync(htmlPath, 'utf8');
  const js = html.split('<script>').pop().split('</script>')[0];
  const els = {};
  const ctx = vm.createContext({
    console, Math, Date, JSON, Map, Set, Array, Object, Number, String, Promise, URLSearchParams, Intl,
    Float64Array, Int32Array, Uint8Array, Uint16Array,
    setTimeout: () => 0, clearTimeout: () => {},
    window: {addEventListener(){}, scrollTo(){}}, location: {hash:'#/', href:'http://localhost/#/'}, navigator: {},
    getComputedStyle: () => ({getPropertyValue: () => ''}),
    localStorage: {getItem(){ return null; }, setItem(){}},
    fetch: () => Promise.resolve({ok:false, json: async () => null}),
    Papa: {parse(){}}, Chart: function(){ this.destroy = () => {}; },
    document: {getElementById: id => els[id] || (els[id] = stubElement()), querySelectorAll: () => [], querySelector: () => stubElement(),
      createElement: () => stubElement(), head: stubElement(), body: stubElement(), addEventListener(){},
      documentElement: {dataset:{}, style:{}}, title:''}
  });
  vm.runInContext(js, ctx, {filename:'index.html'});
  const run = code => vm.runInContext(code, ctx);
  return {
    run,
    /* Load one archive from the compact file the job writes. */
    load(g, compact){
      ctx.__compact = compact; ctx.__g = g;
      run(`(() => { const g = __g, src = decodeCompact(__compact);
        const m = normalize(src.rows, g);
        state.eras[g] = setWeights(m, g); state.matches[g] = m;
        state.bounds[g] = {min:m[0].ts, max:m[m.length-1].ts};
        state.dataInfo[g] = {source:'build', meta:src.meta};
        state.upstreamNames[g] = src.former && src.former.length ? 'ok' : 'unavailable';
        state.former[g] = buildFormer(src.former);
        state.shootouts[g] = new Map();
        (src.shootouts || []).forEach(r => { if (r.date && r.winner) state.shootouts[g].set(r.date+'|'+teamAlias(r.home_team, g)+'|'+teamAlias(r.away_team, g), teamAlias(r.winner, g)); });
      })()`);
    },
    /* The current table at default settings, for the static team pages: every rated team with its rank, tier, band,
       last five results and any tournament it is drawn in. */
    table(g){
      ctx.__g = g;
      return run(`(() => {
        state.gender = __g; state.windowYears = DEFAULTS.windowYears; state.comps = new Set(COMP_ORDER); state.confs = new Set();
        state.fifaFilter = DEFAULTS.fifaFilter; state.historicalNames = DEFAULTS.historicalNames; state.maxBand = DEFAULTS.maxBand;
        state.rankBy = DEFAULTS.rankBy; state.asOf = state.bounds[__g].max; state.cache = {key:null};
        const c = getRatings();
        const drawn = key => TOURNAMENTS.filter(T => T.gender === __g && T.status !== 'rewind' && (!T.end || Date.parse(T.end+'T23:59:59Z') >= state.asOf))
          .filter(T => Object.values(T.groups).some(ts => ts.some(t => keyOfName(t) === key))).map(T => T.name);
        return {asOf:fmtDate(state.asOf), teams:c.table.length, rows:c.all.filter(r => !r.island).map(r => ({team:r.team, key:r.key,
          rating:Math.round(r.rating), band:Math.round(r.band), rank:r.rank, tier:r.tier || null, conf:r.conf, mp:r.mp,
          confName:CONF[r.conf] ? CONF[r.conf].full : '', provisional:r.provisional,
          last:(c.history.get(r.key) || []).slice(-5).map(x => ({date:fmtDate(x.ts), opp:x.oppName, gf:x.gf, ga:x.ga, comp:x.tournament})),
          drawn:drawn(r.key)}))};
      })()`);
    },
    /* Every pair of teams that has met, all time, counted the way the site's Head to head page counts them: lineages
       (West Germany is Germany), penalty shoot-outs as wins, every competition. Call table(g) first. Pairs with fewer
       than min meetings are left out unless listed in keep (["keyA|keyB", ...], either order). */
    pairs(g, min, keep){
      ctx.__g = g; ctx.__min = min; ctx.__keep = keep || [];
      return run(`(() => {
        const keep = new Set(__keep), ms = state.matches[__g] || [], P = new Map();
        for (const m of ms){
          if (m.ts > state.asOf || !includeMatch(m)) continue;
          namesFor(m);
          const h = m._h, a = m._a; if (!h || !a || h === a) continue;
          const [k1, k2] = h < a ? [h, a] : [a, h], id = k1+'|'+k2;
          let p = P.get(id); if (!p){ p = {k1, k2, list:[]}; P.set(id, p); }
          p.list.push(m);
        }
        const out = [];
        for (const p of P.values()){
          if (p.list.length < __min && !keep.has(p.k1+'|'+p.k2) && !keep.has(p.k2+'|'+p.k1)) continue;
          let w1 = 0, w2 = 0, d = 0, g1 = 0, g2 = 0, comp = 0;
          const meets = p.list.map(m => {
            const oneHome = m._h === p.k1, s1 = oneHome ? m.hs : m.as, s2 = oneHome ? m.as : m.hs;
            const pen = shootoutWinner(m), pk = pen ? keyOfName(pen) : null;
            const r = s1 > s2 ? 1 : s1 < s2 ? -1 : pk ? (pk === p.k1 ? 1 : -1) : 0;
            if (r > 0) w1++; else if (r < 0) w2++; else d++;
            g1 += s1; g2 += s2; if (m.tournament !== 'Friendly') comp++;
            return {date:fmtDate(m.ts), home:m._hn, away:m._an, hs:m.hs, as:m.as, r, pen:!!pk, s1, s2,
              tournament:compName(m.tournament), city:m.city, country:m.country, neutral:venueSide(m) === 0};
          });
          out.push({k1:p.k1, k2:p.k2, n:meets.length, w1, w2, d, g1, g2, comp, meets});
        }
        return out;
      })()`);
    },
    /* Lineage key and display name of a team as the fixtures name it, and the site's name for a competition. Call
       table(g) first, so the right game is set. */
    keyOf(name){ ctx.__n = name; return run('keyOfName(__n)'); },
    compName(t){ ctx.__n = t; return run('compName(__n)'); },
    analytics(){ return run('SITE.analytics || ""'); },
    /* Forecasts for a list of fixtures with the site's default settings and the latest ratings. */
    forecast(g, fixtures){
      ctx.__g = g; ctx.__fx = fixtures;
      return run(`(() => {
        state.gender = __g; state.windowYears = DEFAULTS.windowYears; state.comps = new Set(COMP_ORDER); state.confs = new Set();
        state.fifaFilter = DEFAULTS.fifaFilter; state.historicalNames = DEFAULTS.historicalNames; state.maxBand = DEFAULTS.maxBand;
        state.rankBy = DEFAULTS.rankBy; state.asOf = state.bounds[__g].max; state.cache = {key:null};
        const c = getRatings();
        return __fx.map(fx => { const pr = fixturePrediction(c, fx);
          if (!pr.p) return null;
          return {p:[pr.p.home, pr.p.draw, pr.p.away], xg:pr.sl.xg, likely:pr.sl.top[0][0]+'-'+pr.sl.top[0][1], side:pr.side,
            ratings:[pr.rh.rating, pr.ra.rating], bands:[pr.rh.band, pr.ra.band], asOf:fmtDate(state.asOf)}; });
      })()`);
    }
  };
}
