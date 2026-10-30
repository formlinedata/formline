// Tells Bing (and the other IndexNow search engines: Yandex, Seznam, Naver, Yep) which pages changed in this run, so
// they recrawl them the same night instead of whenever they next get round to it.
//
// How it fits the workflow: the commit step writes the list of files it committed to $CHANGED_FILES; after the push,
// this script turns those files into page addresses (only addresses listed in sitemap.xml), waits until GitHub Pages
// is serving the new version, then sends the list to api.indexnow.org.
//
// The key is not a secret: IndexNow checks it by fetching <key>.txt from the site itself. The file sits in the repo
// root (a 32-character hex name, containing the same 32 characters). Because the site lives under /formline/, the
// request names the key file's address (keyLocation), which lets it cover every page under /formline/.
//
//   CHANGED_FILES=changed.txt node build/indexnow.mjs        (GITHUB_REPOSITORY=owner/repo is set inside Actions)
//   INDEXNOW=0 turns it off.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {siteBase} from './site-url.mjs';

const ROOT = process.env.FORMLINE_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ENDPOINT = 'https://api.indexnow.org/indexnow';
const BATCH = 10000;   // the most IndexNow takes in one request

/* The key file in the site root: <32 hex>.txt whose contents are the same 32 characters. */
export function findKey(root){
  for (const f of fs.readdirSync(root)){
    const m = /^([0-9a-f]{32})\.txt$/.exec(f);
    if (m && fs.readFileSync(path.join(root, f), 'utf8').trim() === m[1]) return m[1];
  }
  return null;
}

export function sitemapUrls(xml){
  return new Set([...String(xml).matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(m => m[1]));
}

/* Committed files → page addresses. A page's own .html file changing counts; so does the data the home page reads
   (data/*.json, data/*.csv), which changes what the home page shows without changing index.html itself. */
export function urlsFor(files, base, listed){
  const out = new Set();
  for (let f of files){
    f = String(f).trim().replace(/\\/g, '/').replace(/^\.\//, '');
    if (!f) continue;
    let u = null;
    if (f === 'index.html' || /^data\/[^/]+\.(json|csv)$/.test(f)) u = base;
    else if (/\.html$/.test(f)) u = base + f;
    if (u && listed.has(u)) out.add(u);
  }
  return [...out];
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* Wait until the live site serves the same bytes as the file just pushed. GitHub Pages usually deploys within a
   minute or two; the query string gets past its 10-minute cache. Gives up after `tries` and carries on. */
export async function waitLive(url, expected, {fetchImpl = fetch, tries = 14, pause = 30000} = {}){
  for (let i = 0; i < tries; i++){
    try {
      const r = await fetchImpl(url + (url.includes('?') ? '&' : '?') + 'v=' + Date.now(), {cache:'no-store'});
      if (r.ok && (await r.text()) === expected) return true;
    } catch (e) {}
    if (i < tries - 1) await sleep(pause);
  }
  return false;
}

export async function submit(urls, {base, key, fetchImpl = fetch} = {}){
  const host = new URL(base).host, keyLocation = base + key + '.txt', results = [];
  for (let i = 0; i < urls.length; i += BATCH){
    const urlList = urls.slice(i, i + BATCH);
    const r = await fetchImpl(ENDPOINT, {method:'POST', headers:{'Content-Type':'application/json; charset=utf-8'},
      body:JSON.stringify({host, key, keyLocation, urlList})});
    results.push({status:r.status, count:urlList.length});
  }
  return results;
}

const MEANING = {200:'accepted', 202:'accepted (key check pending)', 400:'bad request', 403:'key not valid (key file not found or wrong)',
  422:'some addresses are outside the key file\'s folder', 429:'too many requests'};

export async function run(root, {files, repo, fetchImpl = fetch, tries, pause, log = console.log} = {}){
  const base = siteBase(root, repo);
  if (!base){ log('IndexNow: site address unknown, nothing sent.'); return {sent:0}; }
  const key = findKey(root);
  if (!key){ log('IndexNow: no key file in the site root, nothing sent.'); return {sent:0}; }
  const smap = path.join(root, 'sitemap.xml');
  if (!fs.existsSync(smap)){ log('IndexNow: no sitemap.xml, nothing sent.'); return {sent:0}; }
  const urls = urlsFor(files, base, sitemapUrls(fs.readFileSync(smap, 'utf8')));
  if (!urls.length){ log('IndexNow: no pages changed, nothing sent.'); return {sent:0}; }
  // Wait for the key file and for one changed page (the deploy publishes everything at once).
  const probe = urls.find(u => u !== base) || base;
  const probeFile = probe === base ? 'index.html' : probe.slice(base.length);
  const live = await waitLive(base + key + '.txt', fs.readFileSync(path.join(root, key + '.txt'), 'utf8'), {fetchImpl, tries, pause})
    && await waitLive(probe, fs.readFileSync(path.join(root, probeFile), 'utf8'), {fetchImpl, tries, pause});
  if (!live) log('IndexNow: the new version is not showing on the site yet; sending anyway.');
  const res = await submit(urls, {base, key, fetchImpl});
  for (const r of res) log(`IndexNow: ${r.count} page(s) sent, answer ${r.status} ${MEANING[r.status] || ''}`.trim());
  return {sent:urls.length, results:res, live};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)){
  if (process.env.INDEXNOW === '0'){ console.log('IndexNow: turned off (INDEXNOW=0).'); process.exit(0); }
  const list = process.env.CHANGED_FILES && fs.existsSync(process.env.CHANGED_FILES) ? fs.readFileSync(process.env.CHANGED_FILES, 'utf8').split('\n') : [];
  try { await run(ROOT, {files:list, repo:process.env.GITHUB_REPOSITORY}); }
  catch (e) { console.log('IndexNow: ' + e.message + ' (nothing else affected).'); }
}
