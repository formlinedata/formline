// Formline: export historical badges from Logopedia (logos.fandom.com).
// Run in a logos.fandom.com tab. It only reads the site's own API
// (same-origin, no sign-in) and returns one JSON object:
//   { pages: [...], logos: [...], files: {...}, missing: [...] }
// Each logo row: page, kind ("crest" for "<X> national football team" pages,
// "fa" for association pages, "conf" for confederations), headings (the
// section path above the image, e.g. ["Nogometni Savez Hrvatske", "1970s–1992"]),
// file, caption and the first line of text under it.
//
// Usage: await formlineExport({ extraTitles: [...], depth: 2 })
// The result is kept in window.__formlineBadges; formlineSave() downloads it.

async function formlineExport(opts = {}) {
  const API = '/api.php';
  const depth = opts.depth ?? 2;
  const roots = opts.roots ?? [
    'Category:National football teams',
    "Category:Women's national football teams",
    'Category:Soccer federations by country',
    'Category:Football federations',
    'Category:Football associations',
  ];
  const extraTitles = opts.extraTitles ?? [];
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = (...a) => console.log('[formline]', ...a);

  async function api(params) {
    const q = new URLSearchParams({ format: 'json', formatversion: '2', ...params });
    for (let attempt = 0; attempt < 4; attempt++) {
      const r = await fetch(`${API}?${q}`, { credentials: 'omit' });
      if (r.ok) return r.json();
      await pause(1500 * (attempt + 1));
    }
    throw new Error(`API failed: ${q}`);
  }

  // 1. Walk the categories (pages in namespace 0, subcategories to `depth`).
  const pages = new Set(extraTitles);
  const seenCats = new Set();
  let frontier = roots.map((c) => [c, 0]);
  while (frontier.length) {
    const next = [];
    for (const [cat, d] of frontier) {
      if (seenCats.has(cat)) continue;
      seenCats.add(cat);
      let cont = {};
      do {
        const j = await api({ action: 'query', list: 'categorymembers', cmtitle: cat,
          cmlimit: '500', cmtype: 'page|subcat', ...cont });
        if (j.error) { log('no category', cat); break; }
        for (const m of j.query.categorymembers) {
          if (m.ns === 14) { if (d + 1 <= depth) next.push([m.title, d + 1]); }
          else if (m.ns === 0) pages.add(m.title);
        }
        cont = j.continue ?? null;
        await pause(150);
      } while (cont);
    }
    frontier = next;
  }
  // Keep national-team and association-style titles; clubs, leagues and cups go.
  const keep = /national (football|soccer|futsal)? ?team|football (association|federation|union|confederation|league of)|soccer (association|federation)|federa[cç][aã]o|federaci[oó]n|f[ée]d[ée]ration|asociaci[oó]n|associa[cç][aã]o|associazione|federazione|fu[sß]+ball|nogomet|fudbal|futbol|labdar[uú]g|piłk|voetbal|fotboll|fodbold|fotball|jalkapallo|knattspyrnu|ποδοσφαίρου|futebol|football association|^(AFC|CAF|CONCACAF|CONMEBOL|OFC|UEFA|NAFC|CCCF|FIFA)\b|confederation|confédération|confederaci[oó]n/i;
  const titles = [...pages].filter((t) => keep.test(t) || extraTitles.includes(t));
  // Also ask for "<title>/Other" subpages, where Logopedia keeps alternate marks.
  const withOther = titles.flatMap((t) => [t, `${t}/Other`]);
  log(`categories ${seenCats.size}, pages kept ${titles.length} of ${pages.size}`);

  // 2. Read the wikitext, 50 titles at a time.
  const logos = [];
  const missing = [];
  const fileSet = new Set();
  const heading = /^(=+)\s*(.*?)\s*\1\s*$/;
  const fileRef = /\[\[(?:File|Image):([^|\]]+)([^\]]*)\]\]/gi;
  const strip = (s) => s
    .replace(/\[\[(?:File|Image):[^\]]*\]\]/gi, '')
    .replace(/\{\{[^}]*\}\}/g, '')
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/\[https?:\S+\s([^\]]*)\]/g, '$1')
    .replace(/'{2,}/g, '').replace(/<[^>]+>/g, '').trim();
  const kindOf = (t) => /^(AFC|CAF|CONCACAF|CONMEBOL|OFC|UEFA|NAFC|CCCF|FIFA)\b|confederation of|confédération africaine|confederación sudamericana|confederación norte|union of european/i.test(t)
    ? 'conf' : /national (football|soccer|futsal)? ?team/i.test(t) ? 'crest' : 'fa';

  function parse(page, text, other) {
    const lines = text.split('\n');
    const stack = [];
    let inGallery = false;
    const rowsThisPage = [];
    const push = (file, caption) => {
      file = file.trim().replace(/^(File|Image):/i, '').replace(/_/g, ' ');
      if (!file) return;
      fileSet.add(file);
      const row = { page, other, kind: kindOf(page), headings: stack.filter(Boolean).slice(), file,
        caption: strip(caption || ''), text: '' };
      logos.push(row); rowsThisPage.push(row);
    };
    for (const raw of lines) {
      const line = raw.trim();
      const h = line.match(heading);
      if (h) { stack.length = h[1].length - 2; stack[h[1].length - 2] = strip(h[2]); continue; }
      if (/^<gallery/i.test(line)) { inGallery = true; continue; }
      if (/^<\/gallery>/i.test(line)) { inGallery = false; continue; }
      if (inGallery) { const [f, ...cap] = line.split('|'); if (f) push(f, cap.join('|')); continue; }
      let m, any = false;
      fileRef.lastIndex = 0;
      while ((m = fileRef.exec(line))) { push(m[1], m[2].split('|').pop()); any = true; }
      if (!any && line && !line.startsWith('{{') && !line.startsWith('[[Category') && rowsThisPage.length) {
        const last = rowsThisPage[rowsThisPage.length - 1];
        if (!last.text) last.text = strip(line).slice(0, 240);
      }
    }
  }

  for (let i = 0; i < withOther.length; i += 50) {
    const batch = withOther.slice(i, i + 50);
    const j = await api({ action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main',
      redirects: '1', titles: batch.join('|') });
    for (const p of j.query.pages) {
      if (p.missing) { if (!p.title.endsWith('/Other')) missing.push(p.title); continue; }
      const text = p.revisions?.[0]?.slots?.main?.content ?? '';
      const base = p.title.replace(/\/Other$/, '');
      parse(base, text, p.title.endsWith('/Other'));
    }
    log(`read ${Math.min(i + 50, withOther.length)} / ${withOther.length}`);
    await pause(300);
  }

  // 2b. Categories of each page, used to match association pages to countries.
  const categories = {};
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    let cont = {};
    do {
      const j = await api({ action: 'query', prop: 'categories', cllimit: 'max', clshow: '!hidden',
        redirects: '1', titles: batch.join('|'), ...cont });
      for (const p of j.query.pages) {
        (categories[p.title] ??= []).push(...(p.categories ?? []).map((c) => c.title.replace(/^Category:/, '')));
      }
      cont = j.continue ?? null;
      await pause(150);
    } while (cont);
  }

  // 3. Image URLs and sizes.
  const files = {};
  const all = [...fileSet];
  for (let i = 0; i < all.length; i += 50) {
    const batch = all.slice(i, i + 50).map((f) => `File:${f}`);
    const j = await api({ action: 'query', prop: 'imageinfo', iiprop: 'url|size|mime',
      titles: batch.join('|') });
    for (const p of j.query.pages) {
      const ii = p.imageinfo?.[0];
      files[p.title.replace(/^File:/, '')] = ii
        ? { url: ii.url, width: ii.width, height: ii.height, mime: ii.mime, size: ii.size }
        : null;
    }
    log(`image info ${Math.min(i + 50, all.length)} / ${all.length}`);
    await pause(300);
  }

  const result = { exported: new Date().toISOString(), source: location.origin,
    pages: titles, missing, categories, logos, files };
  window.__formlineBadges = result;
  log(`done: ${titles.length} pages, ${logos.length} logos, ${all.length} files, ${missing.length} missing`);
  return { pages: titles.length, logos: logos.length, files: all.length, missing: missing.length };
}

// Downloads window.__formlineBadges as logopedia-badges.json.
function formlineSave(name = 'logopedia-badges.json') {
  const blob = new Blob([JSON.stringify(window.__formlineBadges, null, 1)], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
  document.body.appendChild(a); a.click(); a.remove();
  return name;
}
