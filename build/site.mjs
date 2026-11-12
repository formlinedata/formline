// Puts together the folder that is published as the site (Seb, 12 Nov 2026: the nightly job builds the finished site
// and puts it online directly; claude/private-method-decisions.md).
//
// Until now the site was the repository itself: whatever was committed was served, the build scripts included. This
// script copies only what a visitor's browser needs into _site/, and adds the ratings files worked out by
// build/precompute.mjs under r/. Those files are never committed.
//
// Usage: node build/site.mjs
//   SITE_OUT=<dir>         where to write (default _site/)
//   PRECOMPUTE_OUT=<dir>   where the ratings files are (default _precompute/); left out with a note if missing
//
// What is copied: every file git tracks, except the ones listed in NOT_SITE. Going by git's list rather than by what
// is lying in the folder means a stray file on the build machine can never end up online.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* Folders and files that are part of the project but not of the site. */
export const NOT_SITE = ['.github/', 'build/', 'tools/', 'docs/', 'Claude outputs/', 'node_modules/', '_site/', '_precompute/', '_social_tmp/',
  '.gitignore', '.gitattributes', 'README.md', 'package.json', 'package-lock.json'];   // LICENSE stays: the footer points at it
/* Where the ratings files sit on the site. */
export const RATINGS_DIR = 'r';

export const isSiteFile = f => !NOT_SITE.some(x => x.endsWith('/') ? f.startsWith(x) : f === x) && !f.startsWith(RATINGS_DIR + '/');

/* The files git tracks, or (outside a git checkout, as in the tests) every file under the folder. */
export function trackedFiles(root){
  try { return execFileSync('git', ['-C', root, 'ls-files', '-z'], {maxBuffer:64 * 1024 * 1024, stdio:['ignore', 'pipe', 'ignore']}).toString().split('\0').filter(Boolean); }
  catch (e){
    const out = [], walk = d => { for (const e of fs.readdirSync(path.join(root, d), {withFileTypes:true})){
      const rel = d ? d + '/' + e.name : e.name; if (e.name === '.git') continue;
      if (e.isDirectory()) walk(rel); else if (e.isFile()) out.push(rel); } };
    walk(''); return out; }
}

/* Copies the site into `out` (emptied first) and the ratings files into out/r. Returns what was done. */
export function buildSite(root, out, ratings, files){
  const list = (files || trackedFiles(root)).filter(isSiteFile).filter(f => fs.existsSync(path.join(root, f)));
  if (!list.includes('index.html')) throw new Error('index.html is not among the files to publish');
  fs.rmSync(out, {recursive:true, force:true});
  let bytes = 0;
  for (const f of list){ const to = path.join(out, f);
    fs.mkdirSync(path.dirname(to), {recursive:true}); fs.copyFileSync(path.join(root, f), to); bytes += fs.statSync(to).size; }
  /* The ratings files: only .json, and only when their index is there (a half-written set is left out whole). */
  let rFiles = 0, rBytes = 0;
  if (ratings && fs.existsSync(path.join(ratings, 'index.json'))){
    const walk = d => { for (const e of fs.readdirSync(path.join(ratings, d), {withFileTypes:true})){
      const rel = d ? d + '/' + e.name : e.name;
      if (e.isDirectory()) walk(rel);
      else if (e.isFile() && e.name.endsWith('.json') && e.name !== 'manifest.json'){ const to = path.join(out, RATINGS_DIR, rel);
        fs.mkdirSync(path.dirname(to), {recursive:true}); fs.copyFileSync(path.join(ratings, rel), to); rFiles++; rBytes += fs.statSync(to).size; } } };
    walk('');
  }
  /* With today's table among them, the published page is told to read it (its RATINGS_FILES switch). The project's
     own index.html is never changed. A page without the switch (an older one) is published as it is. */
  let reads = false;
  if (rFiles && ['men', 'women'].every(g => fs.existsSync(path.join(out, RATINGS_DIR, `table-${g}.json`)))){
    const file = path.join(out, 'index.html'), html = fs.readFileSync(file, 'utf8'), off = 'const RATINGS_FILES = false;';
    if (html.split(off).length === 2){ fs.writeFileSync(file, html.replace(off, 'const RATINGS_FILES = true;')); reads = true; }
  }
  return {files:list.length, bytes, ratings:rFiles, ratingsBytes:rBytes, reads, left:[...new Set((files || trackedFiles(root)).filter(f => !isSiteFile(f)).map(f => f.split('/')[0]))].sort()};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)){
  const out = process.env.SITE_OUT || path.join(ROOT, '_site'), ratings = process.env.PRECOMPUTE_OUT || path.join(ROOT, '_precompute');
  const R = buildSite(ROOT, out, ratings), mb = n => (n / 1048576).toFixed(1) + ' MB';
  console.log(`Site: ${R.files} files, ${mb(R.bytes)} in ${path.relative(ROOT, out) || out}`);
  console.log(R.ratings ? `Ratings files: ${R.ratings}, ${mb(R.ratingsBytes)} under ${RATINGS_DIR}/` : 'Ratings files: none found, so none published (run build/precompute.mjs first)');
  console.log(R.reads ? "The published page reads today's table from its file." : 'The published page works the table out itself (no table file, or no switch in the page).');
  console.log('Not published: ' + R.left.join(', '));
}
