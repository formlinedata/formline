#!/usr/bin/env python3
"""Turn a Logopedia export (logopedia-badges.json) into badge-eras.csv.

    python3 build_badge_eras.py logopedia-badges.json badge-list.csv \
        [--extras extra-bodies.csv] [--map page-map.csv] [--out .]

Writes, in --out:
  badge-eras.csv      team, game, kind, from, to, approx, file, source_file, url,
                      primary, blur, status, page, era, note
                      (from inclusive, to exclusive, like flag-eras.csv)
  page-map-auto.csv   which Logopedia page was matched to which team, and how
  badge-review.csv    everything that needs a look: unmatched pages, teams with
                      no page, undated logos, gaps and blur candidates

kind:   crest = the team's badge ("<X> national football team" pages)
        fa    = the association's own logo
        conf  = a confederation's logo
game:   men / women for crests; all for association and confederation logos.
A hand-made page-map.csv (columns page,team) overrides the automatic match;
use team "-" to drop a page.
"""
import argparse
import csv
import json
import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

# --- names ---------------------------------------------------------------

FIFA_ALIASES = {  # shown FIFA name -> archive / everyday names (from v15)
    "usa": ["united states", "united states of america"],
    "korea republic": ["south korea"],
    "korea dpr": ["north korea"],
    "ir iran": ["iran"],
    "china pr": ["china"],
    "cote d'ivoire": ["ivory coast"],
    "cabo verde": ["cape verde"],
    "congo dr": ["dr congo", "democratic republic of the congo", "zaire"],
    "czechia": ["czech republic"],
    "turkiye": ["turkey"],
    "kyrgyz republic": ["kyrgyzstan"],
    "brunei darussalam": ["brunei"],
    "chinese taipei": ["taiwan"],
    "hong kong, china": ["hong kong"],
    "us virgin islands": ["united states virgin islands", "u.s. virgin islands"],
    "turks and caicos islands": ["turks and caicos"],
    "republic of ireland": ["ireland"],
    "north macedonia": ["macedonia", "fyr macedonia"],
    "eswatini": ["swaziland"],
}


def norm(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = s.lower().replace("&", " and ").replace("’", "'")
    s = re.sub(r"\bst\.?\s", "saint ", s)
    s = re.sub(r"^the\s+", "", s)
    s = re.sub(r"[^a-z0-9' ,.-]", " ", s)
    return re.sub(r"\s+", " ", s).strip(" ,.")


def read_csv(path):
    with open(path, newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def pick(row, *names):
    low = {k.lower().strip(): v for k, v in row.items() if k}
    for n in names:
        if low.get(n):
            return low[n].strip()
    for n in names:  # headers with a note after the name, e.g. "Team (as shown on the site)"
        for k, v in low.items():
            if v and (k.startswith(n + " ") or k.startswith(n + "(")):
                return v.strip()
    return ""


def load_teams(badge_list, extras):
    """slug -> set of normalised names; slug -> type."""
    names, types, titles = defaultdict(set), {}, {}
    for r in read_csv(badge_list):
        slug = pick(r, "slug", "key", "file", "expected_file", "expected file", "filename")
        slug = re.sub(r"\.[a-z]+$", "", slug)
        name = pick(r, "team", "name", "shown", "fifa name", "archive name")
        if not slug and name:
            slug = re.sub(r"[^a-z0-9]+", "-", norm(name)).strip("-")
        if not slug:
            continue
        slug = re.sub(r"-women$", "", slug)
        types.setdefault(slug, "team")
        for v in [name] + [pick(r, "archive name", "also known as", "aliases")]:
            for part in v.split(";"):   # only names: not confederation or "men and women" columns
                if part.strip():
                    names[slug].add(norm(part))
        names[slug].add(norm(slug.replace("-", " ")))
    for r in read_csv(extras) if extras else []:
        slug = r["slug"]
        types[slug] = r["type"]
        names[slug].add(norm(r["name"]))
        names[slug].add(norm(slug.replace("conf-", "").replace("-", " ")))
        for t in r.get("logopedia_titles", "").split(";"):
            if t.strip():
                titles[t.strip()] = slug
    for slug, ns in names.items():
        for fifa, others in FIFA_ALIASES.items():
            if fifa in ns or any(o in ns for o in others):
                ns.add(fifa)
                ns.update(others)
    return names, types, titles


# --- dates ---------------------------------------------------------------

MONTHS = {m: i for i, m in enumerate(
    "january february march april may june july august september october november december".split(), 1)}
DASH = r"\s*(?:–|—|-|to|until)\s*"
POINT = r"(?:c\.\s*|circa\s*|early\s+|mid\s+|late\s+|mid-)?(?:(?:\d{1,2}\s+)?[A-Za-z]+\s+)?\d{4}s?|\?|present|current|now|today"


def parse_point(s):
    """'1992' -> ('1992-01-01','year'); '1940s' -> decade; 'March 2014' -> month."""
    s = s.strip().lower()
    if s in ("present", "current", "now", "today"):
        return None, "present"
    if s == "?":
        return None, "unknown"
    approx = ""
    m = re.match(r"(c\.|circa|early|mid|late|mid-)\s*", s)
    if m:
        approx = "approx"
        s = s[m.end():]
    m = re.match(r"(?:(\d{1,2})\s+)?([a-z]+)\s+(\d{4})$", s)
    if m and m.group(2) in MONTHS:
        day = int(m.group(1) or 1)
        return f"{m.group(3)}-{MONTHS[m.group(2)]:02d}-{day:02d}", "day" if m.group(1) else "month"
    m = re.match(r"(\d{4})(s?)$", s)
    if m:
        return f"{m.group(1)}-01-01", ("decade" if m.group(2) else (approx or "year"))
    return None, "unparsed"


def parse_range(heading):
    """Return (from, to, approx) or None if the heading is not a date."""
    h = heading.replace(" ", " ").strip()
    m = re.fullmatch(rf"({POINT}){DASH}({POINT})", h, re.I)
    if m:
        f, fa = parse_point(m.group(1))
        t, ta = parse_point(m.group(2))
        if f is None and fa != "unknown":
            return None
        return f, t, ",".join(sorted({x for x in (fa, ta) if x not in ("year", "present", "day")}))
    m = re.fullmatch(rf"({POINT})", h, re.I)
    if m and not re.fullmatch(r"present|current|now|today|\?", h, re.I):
        f, fa = parse_point(m.group(1))
        if f:
            return f, "", "" if fa in ("year", "day") else fa
    return None


def year_end_exclusive(d, precision):
    """'1990-01-01' for a stated end year 1990 -> '1991-01-01'."""
    if not d:
        return ""
    y = int(d[:4])
    if "decade" in precision:
        return f"{y + 10}-01-01"
    if d.endswith("-01-01"):
        return f"{y + 1}-01-01"
    return d


# --- blurring (same regimes and dates as flag-decisions.md) --------------

BLUR = [  # team slug(s), from, to (exclusive), reason
    (("germany",), "1933-01-30", "1945-05-09", "Nazi Germany"),
    (("south-africa",), "1928-05-31", "1994-04-27", "apartheid South Africa"),
    (("spain",), "1939-04-01", "1981-12-06", "Franco's Spain"),
    (("croatia",), "1941-04-10", "1945-05-09", "Independent State of Croatia"),
    (("slovakia",), "1939-03-14", "1945-04-05", "wartime Slovak Republic"),
    (("cambodia",), "1975-04-17", "1979-01-08", "Khmer Rouge"),
    (("afghanistan",), "1996-09-27", "2001-11-14", "Taliban"),
    (("north-macedonia", "macedonia"), "1992-08-11", "1995-10-06", "Vergina Sun"),
    (("zimbabwe", "rhodesia", "southern-rhodesia"), "1924-01-01", "1980-04-18", "Southern Rhodesia / Rhodesia"),
]


def blur_for(team, frm, to):
    for slugs, b0, b1, why in BLUR:
        if team in slugs and frm and frm < b1 and (not to or to > b0):
            return f"candidate ({why})"
    return ""


# --- matching pages to teams ---------------------------------------------

CREST = re.compile(r"^(?P<c>.+?)\s+(?P<w>women'?s\s+)?(?:national\s+)?(?:football|soccer|association football)\s+team$", re.I)


def match_pages(export, names, types, titles, manual):
    by_name = defaultdict(set)
    for slug, ns in names.items():
        for n in ns:
            by_name[n].add(slug)
    out = {}
    for page in export["pages"]:
        if page in manual:
            out[page] = (manual[page], "manual")
            continue
        if page in titles:
            out[page] = (titles[page], "extras title")
            continue
        m = CREST.match(page)
        if m:
            hit = by_name.get(norm(m.group("c")), set())
            out[page] = (sorted(hit)[0], "crest name") if len(hit) == 1 else ("", f"crest name: {len(hit)} matches")
            continue
        # Association pages: try the page's categories ("Croatia", "Football in Croatia").
        hits = set()
        for c in export.get("categories", {}).get(page, []):
            c2 = re.sub(r"^(?:association\s+)?(?:football|soccer|sport|sports)\s+(?:in|of)\s+", "", c, flags=re.I)
            c2 = re.sub(r"\s+(?:football|soccer)$", "", c2, flags=re.I)
            hits |= by_name.get(norm(c2), set())
        hits = {h for h in hits if types.get(h) != "confederation"}
        out[page] = (sorted(hits)[0], "category") if len(hits) == 1 else ("", f"category: {len(hits)} matches")
    return out


# --- building the eras ---------------------------------------------------

def kind_of(row, team, types):
    if types.get(team) == "confederation":
        return "conf"
    return row["kind"] if row["kind"] in ("crest", "fa", "conf") else "fa"


def build(export, names, types, titles, manual):
    pmap = match_pages(export, names, types, titles, manual)
    files = export.get("files", {})
    groups = defaultdict(list)  # (team, game, kind) -> rows in page order
    review = []
    for i, r in enumerate(export["logos"]):
        team, how = pmap.get(r["page"], ("", "not exported"))
        if team == "-":
            continue
        if not team:
            continue
        kind = kind_of(r, team, types)
        women = bool(re.search(r"women'?s", r["page"], re.I))
        game = ("women" if women else "men") if kind == "crest" else "all"
        groups[(team, game, kind)].append((i, r))
    for page, (team, how) in pmap.items():
        if not team:
            review.append(("unmatched page", page, "", how))

    rows = []
    for (team, game, kind), items in groups.items():
        seen_heading = defaultdict(int)
        eras = []
        for i, r in items:
            dated = None
            era_name = []
            for h in reversed(r["headings"]):
                p = parse_range(h)
                if p and dated is None:
                    dated = (h, p)
                elif not p:
                    era_name.insert(0, h)
            key = tuple(r["headings"]) + (("Other",) if r.get("other") else ())
            n = seen_heading[key]
            seen_heading[key] += 1
            primary = (n == 0) and not r.get("other")
            frm, to, approx = (dated[1] if dated else ("", "", ""))
            eras.append(dict(i=i, r=r, frm=frm or "", stated_to=to, approx=approx,
                             primary=primary, era=" / ".join(era_name),
                             heading=dated[0] if dated else ""))
        prim = sorted([e for e in eras if e["primary"] and e["frm"]], key=lambda e: (e["frm"], e["i"]))
        for k, e in enumerate(prim):
            nxt = prim[k + 1]["frm"] if k + 1 < len(prim) else ""
            stated = e["stated_to"]
            notes = []
            if stated is None:          # "–present"
                e["to"] = nxt
                if nxt:
                    notes.append("Logopedia says present but a later logo follows")
            elif stated == "":          # a single date: runs to the next logo
                e["to"] = nxt
            else:
                end = year_end_exclusive(stated, e["approx"])
                if nxt and end and end != nxt:
                    if end > nxt and stated[:4] == nxt[:4]:
                        end = nxt   # "1992–2014" then "2014–": the change year belongs to the new logo
                    elif end < nxt:
                        notes.append(f"gap until {nxt[:4]}")
                    else:
                        notes.append(f"overlaps next logo ({nxt[:4]})")
                        end = nxt
                e["to"] = end
            if e["to"] and e["to"] <= e["frm"]:
                notes.append("starts with the next logo: order or dates to check")
            e["notes"] = notes
        for e in eras:
            e.setdefault("to", "")
            e.setdefault("notes", [])
            if not e["primary"]:
                # Variants (gallery extras, /Other) take their own dates if given.
                e["to"] = year_end_exclusive(e["stated_to"], e["approx"]) if e["stated_to"] else ""
        for e in eras:
            r = e["r"]
            src = r["file"]
            info = files.get(src) or {}
            ext = (Path(src).suffix or ".png").lower()
            stem = f"{team}{'-women' if game == 'women' else ''}-{kind}-{e['frm'][:4] or 'undated'}"
            status = "ok" if e["frm"] else "PENDING"
            if not info.get("url"):
                status = "PENDING" if status == "ok" else status
                e["notes"].append("no image URL")
            if e["approx"]:
                e["notes"].append(f"dates {e['approx']}")
            if r.get("caption"):
                e["notes"].append(r["caption"])
            rows.append(dict(team=team, game=game, kind=kind, **{"from": e["frm"]}, to=e["to"],
                             approx=e["approx"], file=stem, ext=ext, source_file=src,
                             url=info.get("url", ""), primary=1 if e["primary"] else 0,
                             blur=blur_for(team, e["frm"], e["to"]), status=status,
                             page=r["page"] + ("/Other" if r.get("other") else ""),
                             era=e["era"], heading=e["heading"],
                             note="; ".join(dict.fromkeys(n for n in e["notes"] if n))))
    # Unique file names: add -2, -3 for several logos starting the same year.
    count = defaultdict(int)
    rows.sort(key=lambda x: (x["team"], x["game"], x["kind"], -x["primary"], x["from"] or "9999", x["page"]))
    for x in rows:
        count[x["file"]] += 1
        if count[x["file"]] > 1:
            x["file"] += f"-{count[x['file']]}"
        x["file"] += x.pop("ext")
    for x in rows:
        if x["status"] != "ok":
            review.append(("undated logo" if not x["from"] else "no image", x["page"], x["team"], x["heading"] or x["era"]))
        if any(w in x["note"] for w in ("gap", "overlaps", "order or dates")):
            review.append(("dates to check", x["page"], x["team"], x["note"]))
        if x["blur"]:
            review.append(("blur candidate: check the image", x["page"], x["team"], f"{x['from'][:4]}-{x['to'][:4]} {x['blur']}"))
    covered = {(t, k) for (t, g, k) in groups}
    for slug, typ in sorted(types.items()):
        for k in (("conf",) if typ == "confederation" else ("crest", "fa")):
            if (slug, k) not in covered:
                review.append((f"no {'shirt crest' if k == 'crest' else 'confederation' if k == 'conf' else 'association logo'} page", "", slug, ""))
    return rows, pmap, review


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("export")
    ap.add_argument("badge_list")
    ap.add_argument("--extras")
    ap.add_argument("--map")
    ap.add_argument("--out", default=".")
    a = ap.parse_args(argv)
    export = json.loads(Path(a.export).read_text(encoding="utf-8"))
    names, types, titles = load_teams(a.badge_list, a.extras)
    manual = {r["page"]: r["team"] for r in read_csv(a.map)} if a.map else {}
    rows, pmap, review = build(export, names, types, titles, manual)
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    cols = ["team", "game", "kind", "from", "to", "approx", "file", "source_file", "url",
            "primary", "blur", "status", "page", "era", "heading", "note"]
    with open(out / "badge-eras.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, cols)
        w.writeheader()
        w.writerows(rows)
    with open(out / "page-map-auto.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["page", "team", "how"])
        for p, (t, how) in sorted(pmap.items()):
            w.writerow([p, t, how])
    with open(out / "badge-review.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["issue", "page", "team", "detail"])
        w.writerows(review)
    ok = sum(r["status"] == "ok" for r in rows)
    teams = len({r["team"] for r in rows})
    print(f"{len(rows)} logos for {teams} teams ({ok} dated with images); "
          f"{sum(1 for v in pmap.values() if not v[0])} pages unmatched; {len(review)} review rows")


if __name__ == "__main__":
    sys.exit(main())
