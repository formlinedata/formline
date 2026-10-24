// Runs logopedia-export.js against a mocked Logopedia API.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const croatia = `Croatian Football Federation is the national football federation of Croatia.
==Hrvatski nogometni savez (first era)==
===1940s===
[[File:HNS 1940s logo 1.png|200px]]
{{BetterLogo}}
===1940s–1950s===
[[File:Hrvatski Nogometni Savez 1940s.png|200px]]
==Nogometni Savez Hrvatske==
===1950s–1970s===
[[File:Nogometni Savez Hrvatske 1960.png|200px]]
From the 1950s to the 1990s, the federation was known as [[Nogometni savez hrvatske]].
===1970s–1992===
[[File:Nogometni_Savez_Hrvatske_1970s-1990.png|200px]]
==Hrvatski nogometni savez (second era)==
===1992–2014===
[[File:Croatia football federation.png|200px]]
===2014–present===
[[File:HNS 2014.svg|200px]]
[[Category:Football]]`;

const englandTeam = `==1949–2009==
[[File:England 1949.svg|150px]]
==2009–present==
<gallery>
England 2009.svg|Primary
England 2009 one star.svg|1966 star
</gallery>`;

const englandOther = `==Anniversary==
===2013===
[[File:England 150.png|150px]]`;

const db = {
  'Category:National football teams': [
    { ns: 0, title: 'England national football team' },
    { ns: 14, title: 'Category:National football teams of Europe' },
  ],
  'Category:National football teams of Europe': [{ ns: 0, title: 'Arsenal FC' }],
  'Category:Soccer federations by country': [{ ns: 0, title: 'Croatian Football Federation' }],
};
const texts = {
  'Croatian Football Federation': croatia,
  'England national football team': englandTeam,
  'England national football team/Other': englandOther,
  UEFA: '==1954–1995==\n[[File:UEFA old.png]]',
};

const calls = [];
async function fetchMock(url) {
  const q = new URL(url, 'https://logos.fandom.com').searchParams;
  calls.push(Object.fromEntries(q));
  let body;
  if (q.get('list') === 'categorymembers') {
    const m = db[q.get('cmtitle')];
    body = m ? { query: { categorymembers: m } } : { error: { code: 'missing' } };
  } else if (q.get('prop') === 'revisions') {
    body = { query: { pages: q.get('titles').split('|').map((t) => texts[t]
      ? { title: t, revisions: [{ slots: { main: { content: texts[t] } } }] }
      : { title: t, missing: true }) } };
  } else if (q.get('prop') === 'categories') {
    const cats = { 'Croatian Football Federation': ['Category:Croatia', 'Category:Football in Croatia'] };
    body = { query: { pages: q.get('titles').split('|').map((t) => ({ title: t,
      categories: (cats[t] ?? []).map((title) => ({ title })) })) } };
  } else if (q.get('prop') === 'imageinfo') {
    body = { query: { pages: q.get('titles').split('|').map((t) => ({ title: t,
      imageinfo: [{ url: `https://static.example/${encodeURIComponent(t)}`, width: 200, height: 240, mime: 'image/png', size: 1000 }] })) } };
  }
  return { ok: true, json: async () => body };
}

const ctx = { fetch: fetchMock, console: { log() {} }, setTimeout: (f) => f(), URLSearchParams,
  location: { origin: 'https://logos.fandom.com' }, window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(new URL('../logopedia-export.js', import.meta.url), 'utf8'), ctx);
const summary = await ctx.formlineExport({ extraTitles: ['UEFA'] });
const r = JSON.parse(JSON.stringify(ctx.window.__formlineBadges));

assert.equal(summary.pages, 3, 'England team, Croatian FA and UEFA kept; Arsenal dropped');
assert.ok(!r.pages.includes('Arsenal FC'));
const cro = r.logos.filter((l) => l.page === 'Croatian Football Federation');
assert.equal(cro.length, 6);
assert.deepEqual(cro[2].headings, ['Nogometni Savez Hrvatske', '1950s–1970s']);
assert.equal(cro[2].kind, 'fa');
assert.match(cro[2].text, /^From the 1950s/);
assert.equal(cro[3].file, 'Nogometni Savez Hrvatske 1970s-1990.png', 'underscores become spaces');
assert.deepEqual(cro[5].headings, ['Hrvatski nogometni savez (second era)', '2014–present']);
const eng = r.logos.filter((l) => l.page === 'England national football team');
assert.equal(eng.length, 4, 'two eras, a gallery of two, and one /Other logo');
assert.equal(eng[0].kind, 'crest');
assert.equal(eng[2].caption, '1966 star');
assert.ok(eng[3].other && eng[3].headings[1] === '2013');
assert.equal(r.logos.find((l) => l.page === 'UEFA').kind, 'conf');
assert.equal(Object.keys(r.files).length, 11);
assert.ok(r.files['HNS 2014.svg'].url.startsWith('https://static.example/'));
assert.ok(calls.every((c) => c.format === 'json'));
console.log('export: all checks pass');
assert.deepEqual(r.categories['Croatian Football Federation'], ['Croatia', 'Football in Croatia']);
console.log('export: category checks pass');
fs.writeFileSync(new URL('./sample-export.json', import.meta.url), JSON.stringify(r, null, 1));
