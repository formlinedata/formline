#!/usr/bin/env python3
"""Download the images listed in badge-eras.csv.

    python3 download_badges.py badge-eras.csv [--to badges/eras] [--only-primary]

Saves each row's url as <to>/<file>. Files already there are skipped, so it
can be stopped and run again. Rows marked PENDING, or without a url, are
skipped. Waits a moment between files to be polite to Fandom's servers.
Prints a summary and writes download-log.csv beside the images.
"""
import argparse
import csv
import sys
import time
import urllib.request
from pathlib import Path

UA = "Formline badge fetch (personal project; contact via the site)"


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("csv")
    ap.add_argument("--to", default="badges/eras")
    ap.add_argument("--only-primary", action="store_true")
    ap.add_argument("--delay", type=float, default=0.5)
    a = ap.parse_args(argv)
    out = Path(a.to)
    out.mkdir(parents=True, exist_ok=True)
    rows = list(csv.DictReader(open(a.csv, newline="", encoding="utf-8")))
    log, got, skipped, failed = [], 0, 0, 0
    for r in rows:
        if not r.get("url") or r.get("status") == "PENDING" or (a.only_primary and r.get("primary") != "1"):
            continue
        dest = out / r["file"]
        if dest.exists() and dest.stat().st_size > 0:
            skipped += 1
            continue
        try:
            req = urllib.request.Request(r["url"], headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = resp.read()
            tmp = dest.with_suffix(dest.suffix + ".part")
            tmp.write_bytes(data)
            tmp.replace(dest)
            got += 1
            log.append((r["file"], r["url"], "ok", len(data)))
        except Exception as e:  # keep going; the log says what failed
            failed += 1
            log.append((r["file"], r["url"], f"failed: {e}", 0))
        time.sleep(a.delay)
    with open(out / "download-log.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["file", "url", "result", "bytes"])
        w.writerows(log)
    print(f"downloaded {got}, already there {skipped}, failed {failed} -> {out}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
