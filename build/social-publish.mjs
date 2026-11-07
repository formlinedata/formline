// Posts today's queued post to Instagram, unless Seb closed its review issue. Uses the Instagram API with Instagram
// Login (graph.instagram.com): each slide becomes a media container made from its public image address, the slides
// become one carousel (or a single image), and the container is published. The result goes back on the issue.
//
//   IG_USER_ID, IG_TOKEN      Instagram account id and long-lived access token (GitHub secrets)
//   GH_TOKEN, GITHUB_REPOSITORY   to read and comment on the review issue
//   node build/social-publish.mjs              post today's
//   TOKEN_OUT=file node build/social-publish.mjs --refresh   swap IG_TOKEN for a fresh 60-day token, written to file
import fs from 'node:fs';

const API = `https://graph.instagram.com/${process.env.IG_API_VERSION || 'v23.0'}`;
const repo = process.env.GITHUB_REPOSITORY || 'formlinedata/formline';
const date = process.env.SOCIAL_DATE || new Date().toLocaleDateString('en-CA', {timeZone:'America/Toronto'});
const {IG_USER_ID, IG_TOKEN, GH_TOKEN} = process.env;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const note = (m, kind = 'notice') => console.log(process.env.GITHUB_ACTIONS ? `::${kind} title=Instagram::${m}` : m);

async function ig(pathq, params = {}, method = 'POST'){
  const u = new URL(API + pathq);
  const body = new URLSearchParams({...params, access_token:IG_TOKEN});
  const r = method === 'GET' ? await fetch(u + (u.search ? '&' : '?') + body) : await fetch(u, {method, body});
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error((j.error && j.error.message) || `HTTP ${r.status}`);
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
  const r = await fetch(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(IG_TOKEN)}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token){ note('Could not refresh the Instagram token: ' + ((j.error && j.error.message) || r.status), 'warning'); process.exit(1); }
  if (process.env.GITHUB_ACTIONS) console.log(`::add-mask::${j.access_token}`);
  fs.writeFileSync(process.env.TOKEN_OUT, j.access_token);
  note(`Instagram token refreshed; good for ${Math.round(j.expires_in / 86400)} more days.`);
  process.exit(0);
}

/* The review issue for today. */
const issues = await gh(`/issues?labels=social-post&state=all&per_page=20&sort=created&direction=desc`);
const issue = issues.find(i => i.title.startsWith(`Post for ${date}`));
if (!issue){ note(`No post was prepared for ${date}.`, 'warning'); process.exit(0); }
if (issue.state === 'closed' || issue.labels.some(l => ['skip', 'posted'].includes(l.name))){
  note(`Skipped: the review issue for ${date} is closed.`); process.exit(0); }
if (!IG_USER_ID || !IG_TOKEN){
  await comment(issue.number, "Instagram isn't connected yet, so this wasn't posted automatically. You can still post it by hand: save the images above and copy the caption.");
  note('Instagram is not connected (IG_USER_ID / IG_TOKEN secrets missing).', 'warning'); process.exit(0);
}

const base = `https://raw.githubusercontent.com/${repo}/social-queue/${date}/`;
const meta = await (await fetch(base + 'post.json')).json();
async function ready(id){
  for (let i = 0; i < 30; i++){
    const s = await ig(`/${id}`, {fields:'status_code'}, 'GET');
    if (s.status_code === 'FINISHED') return;
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new Error(`container ${id}: ${s.status_code}`);
    await sleep(4000);
  }
  throw new Error(`container ${id} never finished`);
}
try {
  let creation;
  if (meta.slides.length === 1){
    creation = (await ig(`/${IG_USER_ID}/media`, {image_url:base + meta.slides[0], caption:meta.caption})).id;
  } else {
    const kids = [];
    for (const f of meta.slides) kids.push((await ig(`/${IG_USER_ID}/media`, {image_url:base + f, is_carousel_item:'true'})).id);
    for (const k of kids) await ready(k);
    creation = (await ig(`/${IG_USER_ID}/media`, {media_type:'CAROUSEL', children:kids.join(','), caption:meta.caption})).id;
  }
  await ready(creation);
  const media = await ig(`/${IG_USER_ID}/media_publish`, {creation_id:creation});
  let link = '';
  try { link = (await ig(`/${media.id}`, {fields:'permalink'}, 'GET')).permalink || ''; } catch(e){}
  await comment(issue.number, `Posted on Instagram${link ? ': ' + link : '.'} Don't forget the X version above if you want it there too.`);
  await gh(`/issues/${issue.number}`, {method:'PATCH', body:JSON.stringify({state:'closed', labels:['social-post', 'posted']})});
  note(`Posted "${meta.title}"${link ? ' ' + link : ''}`);
} catch(e){
  await comment(issue.number, `Instagram didn't accept this post: ${e.message}. Nothing was published, so you can post it by hand.`);
  note('Instagram refused the post: ' + e.message, 'warning');
  process.exit(1);
}
