// Formline: turn every image in a Logopedia export into a 128px-high WebP and save them as one zip.
// Run in the same logos.fandom.com tab after logopedia-export.js (it reads window.__formlineBadges).
// Usage: await formlineImages()   ->  downloads formline-badges.zip (NNNN.webp + index.json naming the source files)
async function formlineImages({H = 128, MAXW = 256, workers = 6} = {}) {
  const M = window.__formlineBadges, names = Object.keys(M.files).filter(k => M.files[k]).sort();
  const load = src => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('decode')); im.src = src; });
  const entries = [], fail = [];
  async function one(name) {
    const f = M.files[name], r = await fetch(f.url, {mode: 'cors', credentials: 'omit'});
    if (!r.ok) throw new Error('http ' + r.status);
    const url = URL.createObjectURL(await r.blob());
    try {
      const im = await load(url), w0 = im.naturalWidth || f.width || 256, h0 = im.naturalHeight || f.height || 256;
      let h = H, w = Math.round(w0 * H / h0); if (w > MAXW) { w = MAXW; h = Math.round(h0 * MAXW / w0); }
      const c = Object.assign(document.createElement('canvas'), {width: Math.max(1, w), height: Math.max(1, h)});
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      return new Uint8Array(await (await new Promise(res => c.toBlob(res, 'image/webp', 0.9))).arrayBuffer());
    } finally { URL.revokeObjectURL(url); }
  }
  let next = 0;
  await Promise.all(Array.from({length: workers}, async () => { while (next < names.length) { const i = next++;
    try { entries.push({path: String(i).padStart(4, '0') + '.webp', data: await one(names[i])}); } catch (e) { fail.push([names[i], String(e)]); } } }));
  const index = Object.fromEntries(names.map((n, i) => [String(i).padStart(4, '0') + '.webp', n]));
  const enc = new TextEncoder(), files = [...entries, {path: 'index.json', data: enc.encode(JSON.stringify({index, fail}))}];
  const T = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; T[n] = c >>> 0; }
  const crc = d => { let c = 0xFFFFFFFF; for (let i = 0; i < d.length; i++) c = T[(c ^ d[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const parts = [], central = []; let off = 0;
  for (const f of files) {   // a plain "stored" zip: WebP is already compressed
    const nm = enc.encode(f.path), c = crc(f.data), sz = f.data.length, h = new DataView(new ArrayBuffer(30)), ch = new DataView(new ArrayBuffer(46));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint32(14, c, true); h.setUint32(18, sz, true); h.setUint32(22, sz, true); h.setUint16(26, nm.length, true);
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint32(16, c, true); ch.setUint32(20, sz, true); ch.setUint32(24, sz, true); ch.setUint16(28, nm.length, true); ch.setUint32(42, off, true);
    parts.push(new Uint8Array(h.buffer), nm, f.data); central.push(new Uint8Array(ch.buffer), nm); off += 30 + nm.length + sz;
  }
  const e = new DataView(new ArrayBuffer(22)), cd = central.reduce((s, p) => s + p.length, 0);
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cd, true); e.setUint32(16, off, true);
  const a = Object.assign(document.createElement('a'), {href: URL.createObjectURL(new Blob([...parts, ...central, new Uint8Array(e.buffer)], {type: 'application/zip'})), download: 'formline-badges.zip'});
  document.body.appendChild(a); a.click(); a.remove();
  return {images: entries.length, failed: fail};
}
