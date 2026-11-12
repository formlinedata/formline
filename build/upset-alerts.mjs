// Upset alerts: after each update (the 15-minute match-day checks and the nightly run), posts a short note on Bluesky
// when a team Formline gave under 20% before kick-off wins. Uses only forecasts published before the match
// (data/forecasts.json). Remembers what it has posted in build/store/alerts.json, so each upset goes out once.
// Never fails the workflow: with no Bluesky secrets, or if Bluesky refuses, it just logs and stops.
//   BSKY_HANDLE=… BSKY_APP_PASSWORD=… node build/upset-alerts.mjs        (DRY_RUN=1 prints instead of posting)
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {bskyTags} from './social.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://formlinedata.com/';
const LIMIT = 0.20, MAX_PER_RUN = 3;
const STORE = path.join(ROOT, 'build', 'store', 'alerts.json');
const read = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch(e){ return d; } };

export function findUpsets(entries, alerted, now = Date.now()){
  const since = new Date(now - 2 * 864e5).toISOString().slice(0, 10), seen = new Set(alerted);
  return entries.filter(e => e.result && e.p && !e.void && e.date >= since && !seen.has(e.id)).map(e => {
    const o = e.result[0] > e.result[1] ? 0 : e.result[0] < e.result[1] ? 2 : 1;
    return {e, o, chance:e.p[o]};
  }).filter(x => x.o !== 1 && x.chance < LIMIT).sort((a, b) => a.chance - b.chance);
}
export function alertText(x){
  const {e, o} = x, win = o === 0 ? e.home : e.away, lose = o === 0 ? e.away : e.home, pc = Math.max(1, Math.round(x.chance * 100));
  const head = `😱 Upset: ${e.home} ${e.result[0]}–${e.result[1]} ${e.away}`;
  const body = `${e.tournament}${e.g === 'women' ? " (women's)" : ''}. Formline gave ${win} a ${pc}% chance before kick-off; ${lose} were ${Math.round(e.p[o === 0 ? 2 : 0] * 100)}% favourites.`;
  const link = `${BASE}#/matchday?g=${e.g}&ud=${e.date}`;
  return {text:`${head}\n\n${body}\n\nEvery call that day: ${link}`, link};
}
/* Bluesky needs byte offsets for links and hashtags. */
function facets(text, link, tags){
  const enc = new TextEncoder(), at = s => enc.encode(text.slice(0, text.indexOf(s))).length, len = s => enc.encode(s).length, out = [];
  if (link && text.includes(link)) out.push({index:{byteStart:at(link), byteEnd:at(link) + len(link)}, features:[{$type:'app.bsky.richtext.facet#link', uri:link}]});
  for (const t of tags){ const s = '#' + t; if (text.includes(s)) out.push({index:{byteStart:at(s), byteEnd:at(s) + len(s)}, features:[{$type:'app.bsky.richtext.facet#tag', tag:t}]}); }
  return out;
}
async function main(){
  const rec = read(path.join(ROOT, 'data', 'forecasts.json'), {entries:[]}), store = read(STORE, {ids:[]});
  const ups = findUpsets(rec.entries || [], store.ids).slice(0, MAX_PER_RUN);
  if (!ups.length){ console.log('No new upsets.'); return; }
  const handle = (process.env.BSKY_HANDLE || '').trim().replace(/^@/, ''), pass = (process.env.BSKY_APP_PASSWORD || '').trim();
  if (!process.env.DRY_RUN && (!handle || !pass)){ console.log('Bluesky is not connected; upsets not posted.'); return; }
  let session = null;
  const call = async (method, body, token) => {
    const r = await fetch('https://bsky.social/xrpc/' + method, {method:'POST', headers:{'Content-Type':'application/json', ...(token ? {Authorization:`Bearer ${token}`} : {})}, body:JSON.stringify(body)});
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.message || j.error || `HTTP ${r.status}`); return j; };
  for (const x of ups){
    const {text, link} = alertText(x), tags = bskyTags(x.e.g, [x.e.home, x.e.away], x.e.tournament);
    const full = text + '\n\n' + tags.map(t => '#' + t).join(' ');
    if (process.env.DRY_RUN){ console.log(full + '\n---'); continue; }
    try {
      session = session || await call('com.atproto.server.createSession', {identifier:handle, password:pass});
      await call('com.atproto.repo.createRecord', {repo:session.did, collection:'app.bsky.feed.post',
        record:{$type:'app.bsky.feed.post', text:full, facets:facets(full, link, tags), createdAt:new Date().toISOString(), langs:['en']}}, session.accessJwt);
      store.ids = [x.e.id, ...store.ids].slice(0, 500);
      console.log(`Posted upset: ${x.e.id}`);
    } catch(e){ console.log(`Bluesky refused the upset alert: ${e.message}`); break; }
  }
  if (!process.env.DRY_RUN) fs.writeFileSync(STORE, JSON.stringify(store, null, 1) + '\n');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => console.log('Upset alerts: ' + e.message));
