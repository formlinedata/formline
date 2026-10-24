// Points the link-preview tags in index.html at the site's real address, so shared links show the og.png card.
// The address comes from a CNAME file (custom domain) if there is one, otherwise from the GitHub repository name
// (https://<owner>.github.io/<repo>/). Run by the nightly workflow; does nothing when neither is known.
//   node build/site-url.mjs            (GITHUB_REPOSITORY=owner/repo is set automatically inside GitHub Actions)
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = process.env.FORMLINE_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function siteBase(root, repoEnv){
  const cname = path.join(root, 'CNAME');
  if (fs.existsSync(cname)){
    const host = fs.readFileSync(cname, 'utf8').trim().split(/\s+/)[0];
    if (host) return 'https://' + host.replace(/^https?:\/\//, '').replace(/\/+$/, '') + '/';
  }
  const m = /^([^/]+)\/([^/]+)$/.exec(repoEnv || '');
  if (!m) return null;
  const owner = m[1].toLowerCase(), repo = m[2];
  return repo.toLowerCase() === owner + '.github.io' ? `https://${owner}.github.io/` : `https://${owner}.github.io/${repo}/`;
}

export function applyBase(html, base){
  let out = html.replace(/(<meta property="og:image" content=")[^"]*(">)/, `$1${base}og.png$2`);
  if (/<meta property="og:url" /.test(out)) out = out.replace(/(<meta property="og:url" content=")[^"]*(">)/, `$1${base}$2`);
  else out = out.replace(/(<meta property="og:image" content="[^"]*">)/, `<meta property="og:url" content="${base}">\n$1`);
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)){
  const base = siteBase(ROOT, process.env.GITHUB_REPOSITORY);
  if (!base){ console.log('Site address unknown: link-preview tags left as they are.'); process.exit(0); }
  const f = path.join(ROOT, 'index.html'), html = fs.readFileSync(f, 'utf8'), out = applyBase(html, base);
  if (out !== html){ fs.writeFileSync(f, out); console.log('Link previews now point at ' + base); }
  else console.log('Link previews already point at ' + base);
}
