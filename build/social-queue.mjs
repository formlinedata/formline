// After build/social.mjs has made today's post in the queue folder: remembers what was posted (used.json, so the same
// team, rivalry or match isn't picked again soon), drops folders older than KEEP_DAYS, and writes the body of the
// review issue that Seb gets as a GitHub notification.
//   SOCIAL_OUT=<queue folder> SOCIAL_DATE=<date> node build/social-queue.mjs  → <queue>/issue.md
//   SOCIAL_SLOT=b for the evening post on international-window days            → <queue>/issue-b.md
import fs from 'node:fs';
import path from 'node:path';

const KEEP_DAYS = 14, KEEP_IDS = 400;
const Q = process.env.SOCIAL_OUT, repo = process.env.GITHUB_REPOSITORY || 'formlinedata/formline';
const date = process.env.SOCIAL_DATE || new Date().toLocaleDateString('en-CA', {timeZone:'America/Toronto'});
const slot = process.env.SOCIAL_SLOT || '', key = date + (slot ? '-' + slot : '');
const meta = JSON.parse(fs.readFileSync(path.join(Q, key, 'post.json'), 'utf8'));

let used = {ids:[], recentTypes:[]};
try { used = JSON.parse(fs.readFileSync(path.join(Q, 'used.json'), 'utf8')); } catch(e){}
/* extraIds (new format): the day's reel ('reel|<date>', so the next one waits three days) and a result follow-up made. */
const extra = (meta.extraIds || []).filter(x => x && x !== meta.id);
used.ids = [...extra, meta.id, ...(used.ids || []).filter(x => x !== meta.id && !extra.includes(x))].slice(0, KEEP_IDS);
used.recentTypes = [meta.type, ...(used.recentTypes || [])].slice(0, 7);
fs.writeFileSync(path.join(Q, 'used.json'), JSON.stringify(used, null, 1) + '\n');

const cutoff = new Date(Date.parse(date + 'T12:00:00Z') - KEEP_DAYS * 864e5).toISOString().slice(0, 10);
for (const d of fs.readdirSync(Q)) if (/^\d{4}-\d{2}-\d{2}(-[a-z])?$/.test(d) && d.slice(0, 10) < cutoff) fs.rmSync(path.join(Q, d), {recursive:true, force:true});

const raw = f => `https://raw.githubusercontent.com/${process.env.SOCIAL_QUEUE_REPO || repo}/social-queue/${key}/${f}`;   // SOCIAL_QUEUE_REPO: the public repository that holds the queue once this one is private
const owner = repo.split('/')[0];
const when = slot === 'c' ? "This morning's results roundup goes out on Bluesky and Instagram at about 8 am Toronto time (9 am in summer)" :
  slot ? "This evening's post goes out on Bluesky and Instagram at about 6 pm Toronto time (7 pm in summer)" :
  "Today's post goes out on Bluesky and Instagram at about 9 am Toronto time (10 am in summer)";
const H = meta.hand || {}, byHand = [H.story ? `a Story (poll: ${H.story.poll.join(' / ')}; link: ${H.story.link})` : '', H.reel ? `a reel (${H.reel.seconds} s)` : '', H.result ? `a result post (${H.result.title})` : ''].filter(Boolean);
const handNote = meta.format === 'new' ? `\n${meta.location ? `**Add the location by hand** once it's out: ${meta.location}.\n` : ''}${byHand.length ? `**To post by hand** from https://formlinedata.com/today/: ${byHand.join('; ')}.\n` : ''}` : '';
const body = `**${when}** (on each one that's connected). To stop it, close this issue. To change it, ask Claude.
${handNote}
${(meta.igSlides || meta.slides).map(f => `<img src="${raw(f)}" width="260">`).join(' ')}${meta.igSlides && meta.igSlides.length > meta.slides.length ? '\n\n<sub>The last slide goes to Instagram only.</sub>' : ''}${meta.story ? `\n\n**Instagram Story** (window days; goes out after the post):\n\n<img src="${raw(meta.story)}" width="200">` : ''}

${(meta.alts || []).length ? `<details><summary>Alt text for each image (added automatically on Bluesky and Instagram)</summary>\n\n${meta.alts.map((a, i) => `${i + 1}. ${a}`).join('\n\n')}\n</details>\n\n` : ''}**Instagram caption**
\`\`\`text
${meta.caption}
\`\`\`

---

**X version**, to post by hand: long-press the image to save it, then copy the text below.

<img src="${raw(meta.x)}" width="560">

\`\`\`text
${meta.xText}
\`\`\`

<sub>${meta.type} · ${meta.id} · @${owner}</sub>
`;
fs.writeFileSync(path.join(Q, slot ? `issue-${slot}.md` : 'issue.md'), body);
console.log(`Queue updated for ${key}; ${used.ids.length} posts remembered.`);
