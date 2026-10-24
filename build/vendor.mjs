// Keeps copies of the page's outside files beside it, so visitors' browsers only talk to this site: the chart and
// CSV libraries, and the Archivo font. Each night it downloads anything missing into vendor/, then points
// index.html at the local copies. The page as written still names the public CDNs, so a copy opened on its own
// keeps working. Run by the nightly workflow:   node build/vendor.mjs
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = process.env.FORMLINE_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const LIBS = [
  {url:'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js', file:'papaparse-5.4.1.min.js'},
  {url:'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js', file:'chart-4.4.0.umd.min.js'}
];
export const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&display=swap';
// Google serves woff2 to current browsers only; this asks as one.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/* Google's font CSS -> the same CSS with each font file renamed to a local one, plus the list to download. */
export function localiseFontCss(css){
  const files = [];
  const out = css.replace(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g, (m, u) => {
    const name = 'archivo-' + (files.length + 1) + path.extname(new URL(u).pathname);
    files.push({url:u, file:name});
    return 'url(fonts/' + name + ')';
  });
  return {css:out, files};
}

/* Point the page at whichever local copies exist. Nothing changes for a file that is not there. */
export function rewriteHtml(html, have){
  let out = html;
  for (const l of LIBS) if (have.has(l.file)) out = out.split('src="' + l.url + '"').join('src="vendor/' + l.file + '"');
  if (have.has('fonts.css')){
    out = out.split('<link href="' + FONT_CSS + '" rel="stylesheet">').join('<link href="vendor/fonts.css" rel="stylesheet">');
    out = out.replace(/<link rel="preconnect" href="https:\/\/fonts\.(googleapis|gstatic)\.com"( crossorigin)?>\n?/g, '');
  }
  return out;
}

async function get(url, binary){
  const res = await fetch(url, {headers:{'User-Agent':UA}});
  if (!res.ok) throw new Error(url + ': HTTP ' + res.status);
  return binary ? Buffer.from(await res.arrayBuffer()) : res.text();
}

export async function vendor(root, fetchImpl){
  if (fetchImpl) globalThis.fetch = fetchImpl;
  const dir = path.join(root, 'vendor'), fdir = path.join(dir, 'fonts');
  fs.mkdirSync(fdir, {recursive:true});
  const log = [];
  for (const l of LIBS){
    const p = path.join(dir, l.file);
    if (fs.existsSync(p) && fs.statSync(p).size > 1000) continue;
    try { fs.writeFileSync(p, await get(l.url, true)); log.push('got ' + l.file); } catch(e){ log.push('could not get ' + l.file + ': ' + e.message); }
  }
  if (!fs.existsSync(path.join(dir, 'fonts.css'))){
    try {
      const {css, files} = localiseFontCss(await get(FONT_CSS));
      for (const f of files) fs.writeFileSync(path.join(fdir, f.file), await get(f.url, true));
      fs.writeFileSync(path.join(dir, 'fonts.css'), css);
      log.push('got the font (' + files.length + ' files)');
    } catch(e){ log.push('could not get the font: ' + e.message); }
  }
  const have = new Set(fs.readdirSync(dir));
  const idx = path.join(root, 'index.html');
  const html = fs.readFileSync(idx, 'utf8'), next = rewriteHtml(html, have);
  if (next !== html){ fs.writeFileSync(idx, next); log.push('index.html now uses the local copies'); }
  return log;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)){
  const log = await vendor(ROOT);
  console.log(log.length ? log.join('\n') : 'Local copies already in place.');
}
