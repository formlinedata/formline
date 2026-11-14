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
import vm from 'node:vm';

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
/* The published page without the rating engine. In index.html the engine sits between the marks ENGINE< and >ENGINE
   (written as comments), whole functions and the fallbacks inside functions that read the build's files; a note
   ENGINE-OFF: ... :ENGINE-OFF holds the code that takes a fallback's place. Here every marked part is cut out, every
   note becomes code, and the page's ENGINE switch is set to false. Then the check: no name that was declared inside a
   cut part may still be used by what is left (comments and text in quotes aside).
   Returns {html, regions, bytes, names, left}. */
export function stripEngine(html, keepComments){
  const B = '/*ENGINE<*/', X = '/*>ENGINE*/', on = 'const ENGINE = true;';
  if (html.split(on).length !== 2) throw new Error('STRIP_ENGINE: the page has no ENGINE switch');
  let out = '', at = 0, regions = 0, bytes = 0, comments = 0; const cut = [];
  for (;;){ const a = html.indexOf(B, at); if (a < 0) break; const b = html.indexOf(X, a);
    if (b < 0) throw new Error('STRIP_ENGINE: an ENGINE< mark without its >ENGINE');
    if (html.slice(a + B.length, b).includes(B)) throw new Error('STRIP_ENGINE: one marked part inside another');
    out += html.slice(at, a); cut.push(html.slice(a + B.length, b)); regions++; bytes += b + X.length - a; at = b + X.length; }
  out += html.slice(at);
  out = out.replace(/<!--ENGINE<-->[\s\S]*?<!-->ENGINE-->/g, () => { regions++; return ''; }).replace(/<!--ENGINE-OFF:([\s\S]*?):ENGINE-OFF-->/g, (m, text) => text);   // the same marks in the page's own HTML (a menu link)
  if (out.includes(X)) throw new Error('STRIP_ENGINE: a >ENGINE mark without its ENGINE<');
  out = out.replace(/\/\*ENGINE-OFF:([\s\S]*?):ENGINE-OFF\*\//g, (m, code) => code.trim()).replace(on, 'const ENGINE = false;');
  /* The comments of the page's own script go too: they explain the method in plain words. Only comments that cannot
     be mistaken for anything else are taken: a block that starts a line and ends one, and a remark after the end of a
     statement that holds no quote mark. (A remark elsewhere stays; none of those describes the method.) */
  if (!keepComments){ const s0 = out.lastIndexOf('<script>'), s1 = out.indexOf('</script>', s0); let js = out.slice(s0, s1), n = 0;
    js = js.replace(/^[ \t]*\/\*(?:(?!\*\/)[\s\S])*\*\/[ \t]*\n/gm, () => { n++; return ''; });
    js = js.replace(/([;{}])[ \t]{2,}\/\/[^\n'"`]*$/gm, (m, c) => { n++; return c; });
    out = out.slice(0, s0) + js + out.slice(s1); comments = n; }
  out = out.replace(/\n[ \t]*\n([ \t]*\n)+/g, '\n\n');   // the gaps the cut parts leave
  /* what the cut parts declared: functions and top-level settings (a line that starts with the declaration) */
  const names = [...new Set(cut.flatMap(s => [...s.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(|^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/gm)].map(m => m[1] || m[2])))];
  /* the script that is left, without comments and without text in quotes (names inside those are words, not uses) */
  const start = out.lastIndexOf('<script>'), code = out.slice(start).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1')
    .replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g, "''");
  const left = names.filter(n => new RegExp('(?<![\\w$.])' + n.replace(/\$/g, '\\$') + '(?![\\w$])').test(code));
  /* and it must still be a script the browser can read */
  try { new vm.Script(out.slice(out.lastIndexOf('<script>') + 8, out.indexOf('</script>', out.lastIndexOf('<script>')))); }
  catch(e){ throw new Error('STRIP_ENGINE: what is left of the page\'s script does not parse: ' + e.message); }
  return {html:out, regions, bytes, names, left, comments};
}
export function buildSite(root, out, ratings, files, strip = process.env.STRIP_ENGINE === '1'){
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
  /* The last stage of keeping the method private: with STRIP_ENGINE=1 the published page is written without the
     rating engine (stripEngine). Only a page that reads the files can do without it. */
  let stripped = null;
  if (strip){
    if (!reads) throw new Error('STRIP_ENGINE: the published page does not read the ratings files, so it cannot do without the engine');
    const file = path.join(out, 'index.html'), S = stripEngine(fs.readFileSync(file, 'utf8'));
    if (S.left.length) throw new Error('STRIP_ENGINE: the page still refers to parts of the engine that were cut out: ' + S.left.slice(0, 12).join(', '));
    fs.writeFileSync(file, S.html); stripped = {regions:S.regions, bytes:S.bytes, names:S.names.length, comments:S.comments};
  }
  return {files:list.length, bytes, ratings:rFiles, ratingsBytes:rBytes, reads, stripped, left:[...new Set((files || trackedFiles(root)).filter(f => !isSiteFile(f)).map(f => f.split('/')[0]))].sort()};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)){
  const out = process.env.SITE_OUT || path.join(ROOT, '_site'), ratings = process.env.PRECOMPUTE_OUT || path.join(ROOT, '_precompute');
  const R = buildSite(ROOT, out, ratings), mb = n => (n / 1048576).toFixed(1) + ' MB';
  console.log(`Site: ${R.files} files, ${mb(R.bytes)} in ${path.relative(ROOT, out) || out}`);
  console.log(R.ratings ? `Ratings files: ${R.ratings}, ${mb(R.ratingsBytes)} under ${RATINGS_DIR}/` : 'Ratings files: none found, so none published (run build/precompute.mjs first)');
  console.log(R.reads ? "The published page reads today's table from its file." : 'The published page works the table out itself (no table file, or no switch in the page).');
  console.log(R.stripped ? `The rating engine is not on the published page: ${R.stripped.regions} marked parts cut out (${(R.stripped.bytes / 1024).toFixed(0)} KB, ${R.stripped.names} functions and settings) with ${R.stripped.comments} comments, and nothing left refers to them.` : 'The rating engine is on the published page (STRIP_ENGINE=1 leaves it out).');
  console.log('Not published: ' + R.left.join(', '));
}
