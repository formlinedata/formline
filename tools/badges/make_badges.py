import csv, json, os, re, shutil, sys
from PIL import Image, ImageFilter
SP, REPO = sys.argv[1], sys.argv[2]
idx = {v: k for k, v in json.load(open(SP+'/badgeimgs/index.json'))['index'].items()}
rows = list(csv.DictReader(open(SP+'/badgework/badge-eras.csv', encoding='utf-8')))
BLUR = {'germany-crest-1934.png', 'germany-crest-1936.svg', 'spain-crest-1938.png', 'spain-crest-1949.png', 'spain-crest-1977.png'}
SITE = {'east-germany': 'german-dr'}           # badge slug -> site slug, where they differ
ERAS_ONLY = {'soviet-union', 'yugoslavia', 'serbia-and-montenegro'}   # their lineage continues as Russia / Serbia
out = os.path.join(REPO, 'badges'); eras = os.path.join(out, 'eras')
shutil.rmtree(eras, ignore_errors=True); os.makedirs(eras)
for f in os.listdir(out):
    if f.endswith('.webp'): os.remove(os.path.join(out, f))
def clear_white(im):
    # Images with no transparency of their own (JPG/GIF uploads) often sit on a white box: make the white that
    # touches the edge transparent, so the badge sits on the page like the others.
    import numpy as np
    from scipy import ndimage
    a = np.array(im)
    if (a[..., 3] < 250).mean() > 0.02: return im
    white = (a[..., :3].min(axis=2) > 236)
    lab, n = ndimage.label(white)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    if not edge: return im
    m = np.isin(lab, list(edge))
    if m.mean() < 0.04: return im
    a[m, 3] = 0
    return Image.fromarray(a)
def img(r):
    f = idx.get(r['source_file'])
    if not f or not os.path.exists(SP+'/badgeimgs/'+f): return None
    im = Image.open(SP+'/badgeimgs/'+f).convert('RGBA')
    im = clear_white(im)
    if r['file'] in BLUR: im = im.filter(ImageFilter.GaussianBlur(max(im.size)/9))
    return im
kept = []
for r in rows:
    if r['status'] != 'ok' or r['primary'] != '1': continue
    im = img(r)
    if im is None: continue
    stem = os.path.splitext(r['file'])[0]
    im.save(os.path.join(eras, stem+'.webp'), 'WEBP', quality=88, method=4)
    kept.append(dict(team=SITE.get(r['team'], r['team']), game=r['game'], kind=r['kind'], **{'from': r['from'], 'to': r['to']},
                     approx=r['approx'], file=stem+'.webp', blurred='1' if r['file'] in BLUR else '', page=r['page'], era=r['era']))
# Undated logos: where a team has no dated logo still in use, the last undated one on its Logopedia page (pages run
# oldest to newest) is taken as its current mark, starting where its last dated logo ended ("from" left blank when
# nothing is dated; the site then uses it for today's view only).
from collections import defaultdict
has_open = {(k['team'], k['game'], k['kind']) for k in kept if not k['to'] and k['from']}
last_end = defaultdict(str)
for k in kept:
    if k['to']: last_end[(k['team'], k['game'], k['kind'])] = max(last_end[(k['team'], k['game'], k['kind'])], k['to'])
undated = {}
for r in rows:
    if r['status'] == 'PENDING' and r['primary'] == '1' and r['url']:
        key = (SITE.get(r['team'], r['team']), r['game'], r['kind'])
        ended = re.search(r'[–-]\s*\d{4}\s*(\(|$)', r['era'] or '') and 'present' not in (r['era'] or '').lower()
        if ended and key[0] not in ('german-dr', 'saarland'): continue          # dated end, so not the current mark
        if key not in has_open and key[0] not in ERAS_ONLY: undated[key] = r     # the last one wins
for key, r in undated.items():
    im = img(r)
    if im is None: continue
    stem = os.path.splitext(r['file'])[0]
    im.save(os.path.join(eras, stem+'.webp'), 'WEBP', quality=88, method=4)
    kept.append(dict(team=key[0], game=r['game'], kind=r['kind'], **{'from': last_end[key], 'to': ''}, approx='undated',
                     file=stem+'.webp', blurred='', page=r['page'], era=r['era'] or r['heading'] or ''))
with open(os.path.join(out, 'eras.csv'), 'w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=list(kept[0].keys())); w.writeheader(); w.writerows(kept)
# current badge per team: the association's logo first, then the shirt crest; women's crest where one exists
SKIP_CURRENT = {'bolivia-fa-2025.webp'}   # centenary mark, not the everyday logo
DEFUNCT = {'german-dr'}
latest = {}
for k in kept:
    if k['file'] in SKIP_CURRENT: continue
    if k['team'] == 'bolivia' and k['file'] == 'bolivia-fa-2010.webp': k = dict(k, to='')
    if k['to'] and k['team'] not in DEFUNCT: continue   # only a logo still in use counts as current
    if k['approx'] == 'undated': k = dict(k, **{'from': k['from'] or '0000'})
    key = (k['team'], k['game'], k['kind'])
    if key not in latest or (k['from'] or '') >= (latest[key]['from'] or ''): latest[key] = k
made = {}
teams = {k['team'] for k in kept}
for t in teams:
    if t in ERAS_ONLY: continue
    if t.startswith('conf-'):
        c = latest.get((t, 'all', 'conf'))
        if c: made[t] = c['file']
        continue
    m = latest.get((t, 'all', 'fa')) or latest.get((t, 'men', 'crest'))
    if m: made[t] = m['file']
    w = latest.get((t, 'women', 'crest'))
    if w: made[t+'-women'] = w['file']
for slug, f in made.items():
    shutil.copy(os.path.join(eras, f), os.path.join(out, slug+'.webp'))
print(len(kept), 'era images,', len(made), 'current badges')
