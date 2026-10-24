// Static team pages, so search engines can find "Korea Republic football rating" and the like. The site itself is one
// page whose views are drawn in the browser, which search engines index poorly. Each night this writes:
//   teams/index.html                  every team, men and women, linked
//   teams/<men|women>/<slug>.html     one plain page per team: rating, band, rank, tier, last five results
//   sitemap.xml and robots.txt        when the site's address is known
// Each page links to the full interactive team page.   node build/pages.mjs
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadModel} from './lib/model.mjs';
import {siteBase} from './site-url.mjs';

const ROOT = process.env.FORMLINE_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const slugify = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'}[c]));
const ord = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th','st','nd','rd'][n % 10] || 'th');
const GAME = {men:"men's", women:"women's"};
const STYLE = `<style>
:root{--bg:#0e2117;--panel:#14291d;--line:#2a4a37;--chalk:#f1f4ec;--body:#d9e2da;--dim:#a7bba9;--amber:#f6b638;--win:#5fcf8a;--loss:#f08a7a}
@media (prefers-color-scheme: light){:root{--bg:#eef3ec;--panel:#fff;--line:#d3ddd2;--chalk:#112619;--body:#26392c;--dim:#4c6253;--amber:#935c00;--win:#1f7a45;--loss:#b3402f}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--body);font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:760px;margin:0 auto;padding:32px 18px 60px}a{color:var(--amber)}h1{color:var(--chalk);font-size:34px;line-height:1.15;margin:6px 0 4px}
.brand{font-weight:800;color:var(--chalk);text-decoration:none}.big{font-size:44px;font-weight:800;color:var(--amber)}.pm{color:var(--dim);font-size:18px}
.box{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:16px 18px;margin:18px 0}
table{width:100%;border-collapse:collapse}td{padding:7px 4px;border-top:1px solid var(--line);font-size:15px}td.n{text-align:right;white-space:nowrap}
.W{color:var(--win);font-weight:700}.L{color:var(--loss);font-weight:700}.D{color:var(--dim);font-weight:700}.muted{color:var(--dim)}
.btn{display:inline-block;background:var(--amber);color:var(--bg);font-weight:700;padding:10px 16px;border-radius:6px;text-decoration:none}
ul.cols{columns:3 180px;padding-left:18px}</style>`;

function teamPage(g, r, meta, href){
  const rankTxt = r.rank ? `ranked ${ord(r.rank)} of ${meta.teams}` : 'not ranked yet (too few recent matches)';
  const desc = `${r.team} ${GAME[g]} national football team: rated ${r.rating} ±${r.band} and ${rankTxt} in the Formline ratings, as of ${meta.asOf}.`;
  const res = x => x.gf > x.ga ? 'W' : x.gf < x.ga ? 'L' : 'D';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(r.team)} ${GAME[g]} football rating – Formline</title>
<meta name="description" content="${esc(desc)}">
${meta.base ? `<link rel="canonical" href="${meta.base}teams/${g}/${slugify(r.team)}.html">` : ''}
<meta property="og:title" content="${esc(r.team)} – ${GAME[g]} rating ${r.rating}"><meta property="og:description" content="${esc(desc)}">
${meta.base ? `<meta property="og:image" content="${meta.base}og.png">` : ''}
${STYLE}</head><body><main>
<a class="brand" href="../../index.html">Formline</a>
<p class="muted" style="margin:18px 0 0">${GAME[g][0].toUpperCase() + GAME[g].slice(1)} national team${r.confName ? ' · ' + esc(r.confName) : ''}</p>
<h1>${esc(r.team)}</h1>
<div><span class="big">${r.rating}</span> <span class="pm">±${r.band}</span></div>
<p>${esc(r.team)} ${r.rank ? `are <b>${ord(r.rank)}</b> of ${meta.teams} ranked teams` : 'are not ranked yet: the model has seen too few recent matches'}${r.tier ? `, in tier ${r.tier}` : ''}.
The model is about 95% sure their true strength lies between ${r.rating - r.band} and ${r.rating + r.band}. Ratings use the last 12 years of results and were updated on ${meta.asOf}.</p>
${r.drawn.length ? `<p>Coming up: ${r.drawn.map(esc).join(', ')}.</p>` : ''}
${r.last.length ? `<div class="box"><b>Last ${r.last.length} results</b><table>${r.last.slice().reverse().map(x =>
  `<tr><td class="muted">${x.date}</td><td>v ${esc(x.opp)} <span class="muted">· ${esc(x.comp)}</span></td><td class="n">${x.gf}–${x.ga} <span class="${res(x)}">${res(x)}</span></td></tr>`).join('')}</table></div>` : ''}
<p><a class="btn" href="${href}">Open the full team page</a></p>
<p class="muted">Every rating, chart and prediction on <a href="../../index.html">Formline</a> is worked out from open match data. <a href="../index.html">All teams</a></p>
</main></body></html>
`;
}

export function buildPages(root, base){
  const model = loadModel(path.join(root, 'index.html'));
  const out = {men:[], women:[]};
  for (const g of ['men', 'women']){
    const f = path.join(root, 'data', g + '.json');
    if (!fs.existsSync(f)) continue;
    model.load(g, JSON.parse(fs.readFileSync(f, 'utf8')));
    const t = model.table(g), dir = path.join(root, 'teams', g);
    fs.rmSync(dir, {recursive:true, force:true}); fs.mkdirSync(dir, {recursive:true});
    const used = new Set();
    for (const r of t.rows){
      let slug = slugify(r.team); if (used.has(slug)) slug += '-' + slugify(r.key); used.add(slug);
      const href = `../../index.html#/team/${encodeURIComponent(r.team)}${g === 'women' ? '?g=women' : ''}`;
      fs.writeFileSync(path.join(dir, slug + '.html'), teamPage(g, r, {asOf:t.asOf, teams:t.teams, base}, href));
      out[g].push({team:r.team, slug, rank:r.rank});
    }
  }
  const list = g => out[g].slice().sort((a, b) => a.team.localeCompare(b.team))
    .map(x => `<li><a href="${g}/${x.slug}.html">${esc(x.team)}</a>${x.rank ? ` <span class="muted">#${x.rank}</span>` : ''}</li>`).join('');
  fs.writeFileSync(path.join(root, 'teams', 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>All national teams – Formline</title>
<meta name="description" content="Ratings for every men's and women's national football team.">${STYLE}</head><body><main>
<a class="brand" href="../index.html">Formline</a><h1>All national teams</h1>
<h2>Men</h2><ul class="cols">${list('men')}</ul><h2>Women</h2><ul class="cols">${list('women')}</ul></main></body></html>
`);
  if (base){
    const urls = [base, base + 'teams/index.html', ...['men', 'women'].flatMap(g => out[g].map(x => `${base}teams/${g}/${x.slug}.html`))];
    fs.writeFileSync(path.join(root, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      urls.map(u => `  <url><loc>${esc(u)}</loc></url>`).join('\n') + `\n</urlset>\n`);
    fs.writeFileSync(path.join(root, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${base}sitemap.xml\n`);
  }
  return {men:out.men.length, women:out.women.length};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)){
  const base = siteBase(ROOT, process.env.GITHUB_REPOSITORY);
  const n = buildPages(ROOT, base);
  console.log(`Static pages: ${n.men} men's and ${n.women} women's teams` + (base ? `, sitemap for ${base}` : ' (address unknown: no sitemap)'));
}
