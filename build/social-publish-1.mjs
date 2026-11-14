// Posts today's queued post to Bluesky and Instagram, unless Seb closed its review issue. The result goes back on the issue,
// which is labelled per channel (bluesky, posted = Instagram) so a re-run never posts twice.
//   Bluesky (AT Protocol, bsky.social): logs in with an app password, uploads up to 4 slides with alt text, and posts the
//     X-style text (300 characters at most) with its link made clickable.
//   Instagram: each slide becomes a media container made from its public image address, the slides become one carousel
//     (or a single image), and the container is published. Two kinds of token work, told apart by how they start:
//     an Instagram Login token (IG…, graph.instagram.com, 60 days, refreshable) or, for apps made since Meta's switch to
//     "API setup with Unified login", a system-user token (EAA…, graph.facebook.com, never expires, no refresh).
//
//   BSKY_HANDLE, BSKY_APP_PASSWORD   Bluesky handle (e.g. formline.bsky.social) and app password (GitHub secrets)
//   IG_USER_ID, IG_TOKEN      Instagram account id and long-lived access token (GitHub secrets)
//   GH_TOKEN, GITHUB_REPOSITORY   to read and comment on the review issue
//   node build/social-publish.mjs              post today's
//   TOKEN_OUT=file node build/social-publish.mjs --refresh   swap IG_TOKEN for a fresh 60-day token, written to file
import fs from 'node:fs';

const repo = process.env.GITHUB_REPOSITORY || 'formlinedata/formline';
const date = process.env.SOCIAL_DATE || new Date().toLocaleDateString('en-CA', {timeZone:'America/Toronto'});
const {GH_TOKEN} = process.env;
/* Forgiving about how the Instagram secrets were pasted too: spaces or a trailing newline. */
const IG_USER_ID = (process.env.IG_USER_ID || '').trim(), IG_TOKEN = (process.env.IG_TOKEN || '').trim();
/* A system-user token (EAA…) from Unified login talks to graph.facebook.com; an Instagram Login token to graph.instagram.com. */
export const igHost = token => /^EAA/.test(token || '') ? 'graph.facebook.com' : 'graph.instagram.com';
const API = `https://${igHost(IG_TOKEN)}/${process.env.IG_API_VERSION || 'v23.0'}`;
/* Forgiving about how the Bluesky secrets were pasted: "@handle", a profile link, spaces or a trailing newline. */
const BSKY_HANDLE = (process.env.BSKY_HANDLE || '').trim().replace(/^https?:\/\/bsky\.app\/profile\//, '').replace(/^@/, '').replace(/\/+$/, '');
const BSKY_APP_PASSWORD = (process.env.BSKY_APP_PASSWORD || '').trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const note = (m, kind = 'notice') => console.log(process.env.GITHUB_ACTIONS ? `::${kind} title=${/^Bluesky/.test(m) ? 'Bluesky' : /^Instagram/.test(m) ? 'Instagram' : 'Social post'}::${m}` : m);

/* Bluesky text: at most 300 characters, links made clickable with byte-offset facets, as the AT Protocol requires. */
export function bskyText(t, tags = []){
  /* Hashtags go on their own line before the link, as many as fit in 300 characters. */
  const urlAt = t.search(/https?:\/\/\S+$/);
  if (tags.length){
    const head = urlAt >= 0 ? t.slice(0, urlAt).trimEnd() : t.trimEnd(), url = urlAt >= 0 ? t.slice(urlAt) : '';
    let line = '';
    for (const tg of tags){ const next = (line ? line + ' ' : '') + '#' + tg;
      if ([...new Intl.Segmenter('en', {granularity:'grapheme'}).segment(head + '\n\n' + next + (url ? '\n\n' + url : ''))].length <= 300) line = next; }
    if (line) t = head + '\n\n' + line + (url ? '\n\n' + url : '');
  }
  const seg = [...new Intl.Segmenter('en', {granularity:'grapheme'}).segment(t)];
  if (seg.length > 300){
    const urlAt = t.search(/https?:\/\/\S+$/);
    const url = urlAt >= 0 ? t.slice(urlAt) : '', head = urlAt >= 0 ? t.slice(0, urlAt).trimEnd() : t;
    const keep = 300 - (url ? [...url].length + 3 : 1);
    t = [...new Intl.Segmenter('en', {granularity:'grapheme'}).segment(head)].slice(0, keep).map(x => x.segment).join('').trimEnd() + '…' + (url ? '\n\n' + url : '');
  }
  const enc = new TextEncoder(), facets = [];
  for (const m of t.matchAll(/(^|\s)#([A-Za-z][A-Za-z0-9_]*)/g)){
    const at = m.index + m[1].length, byteStart = enc.encode(t.slice(0, at)).length, byteEnd = byteStart + enc.encode('#' + m[2]).length;
    facets.push({index:{byteStart, byteEnd}, features:[{$type:'app.bsky.richtext.facet#tag', tag:m[2]}]});
  }
  for (const m of t.matchAll(/https?:\/\/[^\s]+/g)){
    const byteStart = enc.encode(t.slice(0, m.index)).length, byteEnd = byteStart + enc.encode(m[0]).length;
    facets.push({index:{byteStart, byteEnd}, features:[{$type:'app.bsky.richtext.facet#link', uri:m[0]}]});
  }
  return {text:t, facets};
}
/* Meta's error, with the details its support and the app dashboard ask for: code, subcode and trace id. Never the token. */
export function igError(e, status){
  if (!e) return `HTTP ${status}`;
  const msg = e.error_user_msg || e.message || `HTTP ${status}`;
  const bits = [e.type, e.code !== undefined && 'code ' + e.code, e.error_subcode !== undefined && 'subcode ' + e.error_subcode,
    e.fbtrace_id && 'trace ' + e.fbtrace_id].filter(Boolean);
  return msg + (e.error_user_title && e.error_user_title !== msg ? ' (' + e.error_user_title + ')' : '') + (bits.length ? ' [' + bits.join(', ') + ']' : '');
}
async function ig(pathq, params = {}, method = 'POST'){
  const u = new URL(API + pathq);
  const body = new URLSearchParams({...params, access_token:IG_TOKEN});
  const r = method === 'GET' ? await fetch(u + (u.search ? '&' : '?') + body) : await fetch(u, {method, body});
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(igError(j.error, r.status));
  return j;
}
async function gh(pathq, opts = {}){
  const r = await fetch(`https://api.github.com/repos/${repo}${pathq}`, {...opts,
    headers:{Authorization:`Bearer ${GH_TOKEN}`, Accept:'application/vnd.github+json', 'Content-Type':'application/json', ...(opts.headers || {})}});
  if (!r.ok) throw new Error(`GitHub ${pathq}: HTTP ${r.status}`);
  return r.status === 204 ? null : r.json();
}
const comment = (n, text) => gh(`/issues/${n}/comments`, {method:'POST', body:JSON.stringify({body:text})});

if (process.argv.includes('--refresh')){
  /* A system-user token never expires: hand the same token back, so the workflow's secret update is a no-op. */
  if (igHost(IG_TOKEN) === 'graph.facebook.com'){
    if (process.env.GITHUB_ACTIONS) console.log(`::add-mask::${IG_TOKEN}`);
    fs.writeFileSync(process.env.TOKEN_OUT, IG_TOKEN);
    note('Instagram token is a system-user token, which does not expire; nothing to refresh.');
    process.exit(0);
  }
  const r = await fetch(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(IG_TOKEN)}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token){ note('Could not refresh the Instagram token: ' + ((j.error && j.error.message) || r.status), 'warning'); process.exit(1); }
  if (process.env.GITHUB_ACTIONS) console.log(`::add-mask::${j.access_token}`);
  fs.writeFileSync(process.env.TOKEN_OUT, j.access_token);
  note(`Instagram token refreshed; good for ${Math.round(j.expires_in / 86400)} more days.`);
  process.exit(0);
}

/* The review issue for today. */
/* On international-window days: SOCIAL_SLOT=b, the 6 pm post; SOCIAL_SLOT=c, the 8 am results roundup. */
const slot = (process.env.SOCIAL_SLOT || '').trim(), key = date + (slot ? '-' + slot : ''), label = `Post for ${date}${slot === 'c' ? ' (results)' : slot ? ' (evening)' : ''}:`;
const issues = await gh(`/issues?labels=social-post&state=all&per_page=30&sort=created&direction=desc`);
const issue = issues.find(i => i.title.startsWith(label));
if (!issue){ note(slot ? `No ${slot === 'c' ? 'results roundup' : 'evening post'} for ${date} (only made in international windows).` : `No post was prepared for ${date}.`, slot ? 'notice' : 'warning'); process.exit(0); }
if (issue.state === 'closed' || issue.labels.some(l => l.name === 'skip')){
  note(`Skipped: the review issue for ${key} is closed.`); process.exit(0); }
const base = `https://raw.githubusercontent.com/${repo}/social-queue/${key}/`;
const meta = await (await fetch(base + 'post.json')).json();
const done = new Set(issue.labels.map(l => l.name)), lines = [];
let igMediaId = null;
let failed = false;

/* ---------- Bluesky (AT Protocol): up to 4 slides with alt text, the X-style text with its link made clickable ---------- */
if (BSKY_HANDLE && BSKY_APP_PASSWORD && !done.has('bluesky')){
  try {
    const link = await postBluesky(meta);
    lines.push(`Posted on Bluesky: ${link}`);
    done.add('bluesky');
    note(`Bluesky: posted "${meta.title}" ${link}`);
  } catch(e){ failed = true;
    const hint = /identifier or password/i.test(e.message) ? ` Check the two secrets: BSKY_HANDLE should be just \`${BSKY_HANDLE.includes('.') ? BSKY_HANDLE : 'formlinedata.bsky.social'}\`, and BSKY_APP_PASSWORD an app password from Bluesky's Settings → Privacy and security → App passwords (it looks like xxxx-xxxx-xxxx-xxxx), not the account's main password.` : '';
    lines.push(`Bluesky didn't accept this post: ${e.message}.${hint}`); note('Bluesky refused the post: ' + e.message, 'warning'); }
}

/* ---------- Instagram ---------- */
if (!IG_USER_ID || !IG_TOKEN){
  lines.push("Instagram isn't connected yet, so post it there by hand: save the images above and copy the caption.");
  note('Instagram is not connected (IG_USER_ID / IG_TOKEN secrets missing).', 'warning');
} else if (!done.has('posted')){
  try {
    const link = await postInstagram(meta);
    lines.push(`Posted on Instagram${link ? ': ' + link : '.'}`);
    done.add('posted');
    note(`Instagram: posted "${meta.title}"${link ? ' ' + link : ''}`);
  } catch(e){ failed = true; lines.push(`Instagram didn't accept this post: ${e.message}. Nothing was published there, so you can post it by hand.`); note('Instagram refused the post: ' + e.message, 'warning'); }
}
/* The opening comment: a question under the post to start the replies. With a token from Meta's Unified login
   (graph.facebook.com) Meta asks for instagram_basic, instagram_manage_comments and pages_read_engagement, and ads_read
   as well when the role comes through a business portfolio; without them it answers "(#10) Application does not have
   permission for this action". The note then carries the question itself, so it can be added by hand from a phone.
   Pinning it stays a job for the app: the API can't pin. Never fails the run. */
if (igMediaId && meta.question && !done.has('commented')){
  try { await ig(`/${igMediaId}/comments`, {message:meta.question}); done.add('commented'); lines.push(`Comment added: "${meta.question}" (pin it in the app if you like).`); }
  catch(e){ lines.push(`The question comment didn't go on: ${e.message}${/permission|scope|\(#10\)|\(#200\)/i.test(e.message) ? '. The token needs three permissions for comments: instagram_manage_comments, pages_read_engagement and ads_read.' : ''}\n\nTo add it by hand, comment on the post with: ${meta.question}`); note('Instagram comment failed: ' + e.message, 'warning'); }
}
/* Window days: today's matches as an Instagram Story, after the feed post. A failure here never fails the run. */
if (IG_USER_ID && IG_TOKEN && meta.story && done.has('posted') && !done.has('story')){
  try {
    const id = (await ig(`/${IG_USER_ID}/media`, {image_url:base + meta.story, media_type:'STORIES'})).id;
    for (let i = 0; i < 20; i++){ const st = await ig(`/${id}`, {fields:'status_code'}, 'GET'); if (st.status_code === 'FINISHED') break;
      if (st.status_code === 'ERROR') throw new Error('story container failed'); await new Promise(r => setTimeout(r, 3000)); }
    await ig(`/${IG_USER_ID}/media_publish`, {creation_id:id});
    done.add('story'); lines.push('Instagram Story posted (today\'s matches).'); note('Instagram: story posted');
  } catch(e){ lines.push(`The Instagram Story didn't go out: ${e.message}. The image is story.jpg in today's folder if you want to post it by hand.`); note('Instagram story failed: ' + e.message, 'warning'); }
}

if (lines.length){
  lines.push("The X version above is yours to post by hand.");
  await comment(issue.number, lines.join('\n\n'));
}
/* Close the issue once every connected channel has it; while Instagram isn't connected, it stays open as a to-do. */
const allDone = IG_USER_ID && done.has('posted') && (!BSKY_HANDLE || done.has('bluesky'));
await gh(`/issues/${issue.number}`, {method:'PATCH', body:JSON.stringify({labels:[...done], ...(allDone && !failed ? {state:'closed'} : {})})});
if (failed) process.exit(1);

async function postInstagram(meta){
  async function ready(id){
    for (let i = 0; i < 30; i++){
      const s = await ig(`/${id}`, {fields:'status_code'}, 'GET');
      if (s.status_code === 'FINISHED') return;
      if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new Error(`container ${id}: ${s.status_code}`);
      await sleep(4000);
    }
    throw new Error(`container ${id} never finished`);
  }
  /* Each image carries its own alt text. If this API version doesn't know alt_text, the post goes out without it. */
  let useAlt = true;
  const media = async (params, i) => {
    const alt = useAlt && meta.alts && meta.alts[i];
    try { return (await ig(`/${IG_USER_ID}/media`, alt ? {...params, alt_text:alt} : params)).id; }
    catch(e){ if (alt && /alt_text/i.test(e.message)){ useAlt = false; return (await ig(`/${IG_USER_ID}/media`, params)).id; } throw e; }
  };
  let creation;
  /* The closing slide (igSlides) goes to Instagram only. */
  const igFiles = meta.igSlides && meta.igSlides.length ? meta.igSlides.slice(0, 10) : meta.slides;
  if (igFiles.length === 1){
    creation = await media({image_url:base + igFiles[0], caption:meta.caption}, 0);
  } else {
    const kids = [];
    for (const [i, f] of igFiles.entries()) kids.push(await media({image_url:base + f, is_carousel_item:'true'}, i));
    for (const k of kids) await ready(k);
    creation = (await ig(`/${IG_USER_ID}/media`, {media_type:'CAROUSEL', children:kids.join(','), caption:meta.caption})).id;
  }
  await ready(creation);
  const pub = await ig(`/${IG_USER_ID}/media_publish`, {creation_id:creation});
  igMediaId = pub.id;
  try { return (await ig(`/${pub.id}`, {fields:'permalink'}, 'GET')).permalink || ''; } catch(e){ return ''; }
}

async function postBluesky(meta){
  const PDS = 'https://bsky.social/xrpc/';
  const call = async (method, body, token, type = 'application/json') => {
    const r = await fetch(PDS + method, {method:'POST', headers:{'Content-Type':type, ...(token ? {Authorization:`Bearer ${token}`} : {})},
      body:type === 'application/json' ? JSON.stringify(body) : body});
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.message || j.error || `HTTP ${r.status}`);
    return j;
  };
  const session = await call('com.atproto.server.createSession', {identifier:BSKY_HANDLE, password:BSKY_APP_PASSWORD});
  const alt = meta.caption.split('\n\n').slice(0, 2).join(' ').slice(0, 900);
  const images = [];
  for (const [i, f] of meta.slides.slice(0, 4).entries()){
    const bytes = Buffer.from(await (await fetch(base + f)).arrayBuffer());
    if (bytes.length > 976000) throw new Error(`${f} is larger than Bluesky's 976 KB image limit`);
    const up = await call('com.atproto.repo.uploadBlob', bytes, session.accessJwt, 'image/jpeg');
    images.push({image:up.blob, alt:((meta.alts && meta.alts[i]) || `${meta.title}. ${alt}`).slice(0, 1000), aspectRatio:{width:1080, height:1350}});
  }
  const {text, facets} = bskyText(meta.xText, meta.bskyTags || []);
  const rec = await call('com.atproto.repo.createRecord', {repo:session.did, collection:'app.bsky.feed.post',
    record:{$type:'app.bsky.feed.post', text, facets, createdAt:new Date().toISOString(), langs:['en'],
      embed:{$type:'app.bsky.embed.images', images}}}, session.accessJwt);
  return `https://bsky.app/profile/${BSKY_HANDLE}/post/${rec.uri.split('/').pop()}`;
}
