import csv, json, subprocess, sys, tempfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from build_badge_eras import parse_range, year_end_exclusive, blur_for

# dates
assert parse_range("1992–2014") == ("1992-01-01", "2014-01-01", "")
assert parse_range("2014–present") == ("2014-01-01", None, "")
assert parse_range("1940s") == ("1940-01-01", "", "decade")
assert parse_range("1940s–1950s") == ("1940-01-01", "1950-01-01", "decade")
assert parse_range("1970s–1992") == ("1970-01-01", "1992-01-01", "decade")
assert parse_range("March 2014–present") == ("2014-03-01", None, "month")
assert parse_range("c. 1950–1966")[0] == "1950-01-01"
assert parse_range("Hrvatski nogometni savez (first era)") is None
assert parse_range("Anniversary") is None
assert parse_range("present") is None
assert year_end_exclusive("1990-01-01", "") == "1991-01-01"
assert blur_for("spain", "1945-01-01", "1981-01-01").startswith("candidate")
assert blur_for("spain", "1981-12-06", "") == ""
assert blur_for("croatia", "1940-01-01", "1950-01-01").startswith("candidate")

# end to end on the mock export
d = Path(__file__).parent
with tempfile.TemporaryDirectory() as t:
    t = Path(t)
    (t / "badge-list.csv").write_text("slug,team,file\ncroatia,Croatia,croatia.png\nengland,England,england.png\nwales,Wales,wales.png\n")
    out = subprocess.run([sys.executable, str(d.parent / "build_badge_eras.py"), str(d / "sample-export.json"),
        str(t / "badge-list.csv"), "--extras", str(d.parent / "extra-bodies.csv"), "--out", str(t)],
        capture_output=True, text=True)
    assert out.returncode == 0, out.stderr
    print(out.stdout.strip())
    rows = list(csv.DictReader(open(t / "badge-eras.csv")))
    cro = [r for r in rows if r["team"] == "croatia" and r["primary"] == "1"]
    assert [(r["from"][:4], r["to"][:4]) for r in cro] == [
        ("1940", "1940"), ("1940", "1950"), ("1950", "1970"), ("1970", "1992"), ("1992", "2014"), ("2014", "")], cro
    assert all(r["kind"] == "fa" and r["game"] == "all" for r in cro)
    assert cro[0]["file"] == "croatia-fa-1940.png" and cro[1]["file"] == "croatia-fa-1940-2.png"
    assert cro[1]["blur"].startswith("candidate"), "1940s HNS logo overlaps the NDH years"
    assert cro[-1]["file"] == "croatia-fa-2014.svg" and cro[-1]["url"].startswith("https://")
    eng = [r for r in rows if r["team"] == "england"]
    assert {(r["kind"], r["game"]) for r in eng} == {("crest", "men")}
    prim = [r for r in eng if r["primary"] == "1"]
    assert [(r["from"][:4], r["to"][:4]) for r in prim] == [("1949", "2009"), ("2009", "")]
    var = [r for r in eng if r["primary"] == "0"]
    assert len(var) == 2 and any(r["page"].endswith("/Other") for r in var)
    uefa = [r for r in rows if r["team"] == "conf-uefa"]
    assert uefa and uefa[0]["kind"] == "conf" and uefa[0]["to"] == "1996-01-01"
    review = list(csv.DictReader(open(t / "badge-review.csv")))
    issues = {(r["issue"], r["team"]) for r in review}
    assert ("no shirt crest page", "croatia") in issues
    assert ("no association logo page", "wales") in issues
    assert ("no confederation page", "conf-nafc") in issues
    pm = {r["page"]: r for r in csv.DictReader(open(t / "page-map-auto.csv"))}
    assert pm["Croatian Football Federation"]["how"] == "category"
print("build: all checks pass")
with tempfile.TemporaryDirectory() as t:
    t = Path(t)
    (t / "badge-list.csv").write_text("slug,team\ncroatia,Croatia\n")
    subprocess.run([sys.executable, str(d.parent / "build_badge_eras.py"), str(d / "sample-export.json"),
        str(t / "badge-list.csv"), "--out", str(t)], check=True, capture_output=True)
    review = list(csv.DictReader(open(t / "badge-review.csv")))
    assert any(r["issue"] == "dates to check" and r["team"] == "croatia" for r in review)
print("build: zero-length era flagged")
