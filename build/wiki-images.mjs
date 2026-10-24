// Saves the Wikipedia images the site falls back on (a team article's crest, a confederation's logo, a major
// tournament's logo) into badges/wiki/, listed in badges/wiki.json as {article title: file}. The page then shows
// those copies instead of asking Wikipedia from each visitor's browser. An article with no image is remembered
// as "" and asked again after 60 days. A few hundred requests per night at most, so the first run takes a few
// nights to fill in. Run by the nightly workflow after the data build:   node build/wiki-images.mjs
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadModel} from './lib/model.mjs';

const ROOT = process.env.FORMLINE_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UA = 'Formline national-team ratings (nightly image cache; https://github.com)';
const RETRY_DAYS = 60;

export const fileFor = title => title.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90);

/* Every article title the page may ask Wikipedia for: each team's article (both games), the confederations, and
   the editions of the main tournaments (World Cup, continental finals, Olympics, intercontinental, Nations League). */
export function wantedTitles(model){
  return model.run(`(() => {
    const out = new Set();
    for (const g of ['men', 'women']){
      if (!state.matches[g]) continue;
      state.gender = g; state.cache = {key:null};
      const keys = new Set(); state.matches[g].forEach(m => { namesFor(m); keys.add(m._h); keys.add(m._a); });
      keys.forEach(k => { const t = badgeTitle(k, g); if (t) out.add(t); });
      const E = getEditions();
      E.list.filter(e => ['wc', 'cont', 'olympics', 'intercont', 'nl'].includes(e.cat)).forEach(e => editionWikiTitles(e).forEach(t => out.add(t)));
    }
    Object.values(CONF_WIKI).forEach(t => out.add(t));
    return [...out];
  })()`);
}

export async function fillWikiImages(root, model, {fetchImpl = globalThis.fetch, limit = 300, now = Date.now(), pause = 120} = {}){
  const dir = path.join(root, 'badges', 'wiki'), mapPath = path.join(root, 'badges', 'wiki.json');
  fs.mkdirSync(dir, {recursive:true});
  const map = fs.existsSync(mapPath) ? JSON.parse(fs.readFileSync(mapPath, 'utf8')) : {};
  const due = wantedTitles(model).filter(t => {
    const e = map[t];
    if (!e) return true;
    if (e.file && fs.existsSync(path.join(dir, e.file))) return false;
    return !e.file && now - Date.parse(e.checked || 0) > RETRY_DAYS*864e5;
  });
  let asked = 0, saved = 0, none = 0;
  for (const t of due.slice(0, limit)){
    asked++;
    try {
      const res = await fetchImpl('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(t.replace(/ /g, '_')), {headers:{'User-Agent':UA}});
      const j = res.ok ? await res.json() : null;
      const src = j && j.thumbnail && j.thumbnail.source;
      if (!src){ map[t] = {file:'', checked:new Date(now).toISOString().slice(0, 10)}; none++; continue; }
      const img = await fetchImpl(src, {headers:{'User-Agent':UA}});
      if (!img.ok) throw new Error('image HTTP ' + img.status);
      const ext = (path.extname(new URL(src).pathname) || '.png').toLowerCase().replace('.jpeg', '.jpg');
      const file = fileFor(t) + ext;
      fs.writeFileSync(path.join(dir, file), Buffer.from(await img.arrayBuffer()));
      map[t] = {file, checked:new Date(now).toISOString().slice(0, 10)};
      saved++;
    } catch(e){ /* a network hiccup: try again next night */ }
    if (pause) await new Promise(r => setTimeout(r, pause));
  }
  fs.writeFileSync(mapPath, JSON.stringify(map, null, 1) + '\n');
  return {wanted:due.length, asked, saved, none};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)){
  const model = loadModel(path.join(ROOT, 'index.html'));
  for (const g of ['men', 'women']){
    const p = path.join(ROOT, 'data', g + '.json');
    if (fs.existsSync(p)) model.load(g, JSON.parse(fs.readFileSync(p, 'utf8')));
  }
  const r = await fillWikiImages(ROOT, model);
  console.log('Wikipedia images: ' + r.saved + ' saved, ' + r.none + ' articles without one, ' + (r.wanted - r.asked) + ' left for later nights.');
}
