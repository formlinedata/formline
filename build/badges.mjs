// Lists the badge files in badges/ so the site can find them: writes badges/index.json, mapping each file's name
// (without its extension) to the file. Name files after the team as the site shows it, in lower case with hyphens:
// spain.svg, korea-republic.png, cote-d-ivoire.svg; add "-women" for a women's-team crest that differs
// (england-women.png); confederations are conf-uefa, conf-caf, conf-afc, conf-concacaf, conf-conmebol, conf-ofc.
// Run by the nightly workflow:   node build/badges.mjs
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = process.env.FORMLINE_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'badges');
const OK = new Set(['.svg', '.png', '.webp', '.jpg', '.jpeg', '.gif']);

export function buildIndex(dir){
  if (!fs.existsSync(dir)) return {files:{}};
  const files = {};
  for (const f of fs.readdirSync(dir).sort()){
    const ext = path.extname(f).toLowerCase();
    if (!OK.has(ext)) continue;
    const slug = path.basename(f, path.extname(f)).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!files[slug] || ext === '.svg') files[slug] = f;   // prefer SVG when both exist
  }
  /* Saved Wikipedia images (build/wiki-images.mjs): article title -> file in badges/wiki, or "" for none. */
  const wp = path.join(dir, 'wiki.json'), wiki = {};
  if (fs.existsSync(wp)) for (const [t, e] of Object.entries(JSON.parse(fs.readFileSync(wp, 'utf8')))) wiki[t] = e && e.file ? e.file : '';
  return {files, eras: buildEras(path.join(dir, 'eras.csv')), wiki};
}

/* badges/eras.csv (team, game, kind, from, to, approx, file, blurred, page, era) -> {slug: {kind: [[from, to, file, label]]}},
   kind being crest, crest-women, fa or conf. The site picks the badge in use on the date a page shows. */
export function buildEras(file){
  if (!fs.existsSync(file)) return {};
  const lines = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/);
  const split = l => { const out = []; let cur = '', q = false;
    for (const ch of l){ if (ch === '"') q = !q; else if (ch === ',' && !q){ out.push(cur); cur = ''; } else cur += ch; }
    out.push(cur); return out; };
  const head = split(lines[0]), eras = {};
  for (const l of lines.slice(1)){
    const r = Object.fromEntries(split(l).map((v, i) => [head[i], v]));
    if (!r.file || (!r.from && r.approx !== 'undated')) continue;   // an undated current mark keeps an empty "from"
    const kind = r.kind === 'crest' && r.game === 'women' ? 'crest-women' : r.kind;
    const y = s => s.slice(0, 4), yrs = !r.from ? 'current, start date not known' : r.to ? y(r.from) + '–' + y(r.to) : 'since ' + y(r.from);
    const what = r.kind === 'crest' ? (r.page || r.team) + ' crest' : (r.page || r.team) + ' logo';
    const label = what + ', ' + (r.approx === 'decade' ? 'about ' : '') + yrs + (r.blurred === '1' ? ' (blurred on purpose, see Flags & names)' : '');
    ((eras[r.team] ??= {})[kind] ??= []).push([r.from, r.to, r.file, label]);
  }
  for (const k of Object.values(eras)) for (const l of Object.values(k)) l.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  return eras;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)){
  const idx = buildIndex(DIR);
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR);
  fs.writeFileSync(path.join(DIR, 'index.json'), JSON.stringify(idx) + '\n');
  // The same list as a script, for a copy of the site opened straight from a folder (file://), where fetch() is refused.
  fs.writeFileSync(path.join(DIR, 'index.js'), 'window.FORMLINE_BADGES=' + JSON.stringify(idx) + ';\n');
  console.log('Badges listed: ' + Object.keys(idx.files).length + ', teams with dated badges: ' + Object.keys(idx.eras).length + ', saved Wikipedia images: ' + Object.values(idx.wiki).filter(Boolean).length);
}
