# Formline

National-team football ratings for men and women: a rolling window, an uncertainty band on every rating, historical teams, confederation offsets, and predictions for the fixtures coming up.

The whole site is `index.html`. Everything is computed in the visitor's browser. A nightly job keeps the data current and publishes it next to the page.

## What's here

| Path | What it is |
|---|---|
| `index.html` | The site. |
| `flags/` | Flags as WebP at four heights (`h16`, `h32`, `h48` for lists, `h240` for team pages). Current flags are from [Flagpedia.net](https://flagpedia.net), named by ISO code; past flags are from Wikimedia Commons, named by slug. `flag-eras.csv` says which flag each team flew when (the site embeds a copy), `blurred.txt` lists the deliberately blurred ones, and `credits.txt` / `historical-flags.csv` hold the sources and licences. The site's Flags & names page explains the rules. |
| `data/` | Written by the nightly job. Don't edit it by hand. It holds `men.json` and `women.json` (archive plus gap-filler, compact), `fixtures.json` (next 14 days), `forecasts.json` (the public forecast record) and `status.json` (what the last run did). |
| `build/update.mjs` | The nightly job. |
| `build/lib/` | API-Football client, name matching, CSV helpers, the forecast record, and `model.mjs`, which runs the site's own model in Node. |
| `build/store/` | What the job remembers between runs: results collected so far, venue countries, which days it has fetched. |
| `build/test.mjs` | Offline tests for the job. Run them with `node build/test.mjs`. |
| `build/site-url.mjs` | Points the link-preview tags in `index.html` at the site's real address. |
| `build/pages.mjs` | Writes a plain page for every team (`teams/`), plus `sitemap.xml` and `robots.txt`, so search engines can find each team. Each page links to the full interactive one. |
| `build/vendor.mjs` | Keeps copies of the chart library, the CSV parser and the Archivo font in `vendor/`, and points `index.html` at them, so visitors' browsers only talk to this site. |
| `build/wiki-images.mjs` | Saves the Wikipedia images the site falls back on (team crests, confederation and tournament logos) into `badges/wiki/`, a few hundred a night. |
| `build/og.mjs` | Draws `og.png`, the preview card shown when a link is shared, with today's top five, and `apple-touch-icon.png`. |
| `.github/workflows/nightly.yml` | Runs the job every night and commits the new data. |
| `.nojekyll` | Tells GitHub Pages to publish the files as they are. |

## Setting it up on GitHub Pages

1. **Create a repository** on GitHub, for example `formline`, and upload everything in this folder, including the hidden `.github` folder.
2. **Get an API-Football key.** Sign up at <https://dashboard.api-football.com/register>. The free plan gives 100 requests a day, and the job uses at most 80 per run.
3. **Add the key as a secret.** In the repository, go to Settings → Secrets and variables → Actions → New repository secret. Name it `APIFOOTBALL_KEY` and paste the key.
4. **Turn on Pages.** Go to Settings → Pages → Build and deployment, choose "Deploy from a branch", then the `main` branch and the `/ (root)` folder.
5. **Run the job once by hand.** Go to Actions → Nightly data update → Run workflow. When it finishes, the site is live at `https://<your-username>.github.io/formline/`.

After that the job runs every night at 06:17 UTC.

Link previews (the card shown when someone shares the address) are pointed at your site's address automatically by `build/site-url.mjs` on each run. If you add a custom domain, put it in a file named `CNAME` (GitHub does this for you when you enter it under Settings → Pages) and the next run switches the previews over.

The first run or two catch up on the backlog: every day since the older of the two archives ends, plus the venue of each new match. After that, each run asks about the last few days and the next fortnight.

## Checking a run

Open `data/status.json`, or look at the run log on the Actions tab. It shows:

- `api.stopped`: why the job stopped asking. Usually it's the run budget. If it's an API message instead, such as a plan that doesn't cover the current season, that's the thing to fix.
- `unmatched`: team names from the API that didn't match any team in the archive. If a real national team appears here, add its spelling to `TEAM_ALIASES` in `build/lib/names.mjs`.
- `unmappedTournaments`: competitions with no rule yet. Their matches still count, under API-Football's own name and a weight guessed from that name. Add a rule in `build/lib/names.mjs` to file them under the archive's name.
- `men` / `women`: the date the archive ends, and how many results the gap-filler has added since then.

## How the gap-filler works

- **Day by day.** For each day it fetches `/fixtures?date=…`. It keeps only senior national-team matches: no clubs, no youth sides, no domestic leagues. Team and competition names are converted to the ones the archive uses.
- **Venues.** The country of each new venue is looked up once with `/venues?id=…` and cached. The site uses it to decide who was at home.
- **Hand-over to the archive.** A gap-filler result is dropped as soon as the archive has the same match (same two teams within two days), or once it's a week or more older than the archive's last match. The archive is always the record.
- **Pacing.** Requests are spaced 6.5 seconds apart to stay under the free plan's per-minute limit. You can set a different per-run budget with a repository variable named `API_BUDGET`.

Without a key, the job still runs. It publishes the archive in the compact format, so the site loads faster, but there's no gap-filling and no fixtures.

## The forecast record

On every run the job loads `index.html` into Node and asks the site's own model for a forecast for each listed fixture. It writes these to `data/forecasts.json`.

- A forecast is revised each night until kick-off, then frozen.
- Once the result appears, either from the gap-filler or the archive, the forecast is scored.
- A forecast that has no result after three weeks is marked void, not deleted.

The file is committed every night, so its history on GitHub shows each forecast existed before its match. The Record page reads it.

## Keeping the simulator's tournaments current

The tournaments on the Simulator page are listed in `TOURNAMENTS` in `index.html`: groups, format, hosts and dates. The presets cover the 2027 Asian Cup, all four leagues of the 2026–27 UEFA Nations League, the CONCACAF Nations League 2026–27 (League A knockouts and League B), and two rewinds. The 2027 Women's World Cup draw is on 11 December 2026. When a new draw is made, for example for the 2027 Women's World Cup or Euro 2028 qualifying, add an entry modelled on the Asian Cup one. A league with no knockout stage (like Nations League B to D) uses `knockout:[]` and a `winnerCol` label.

For a competition that is already under way, give it the archive's tournament name and its dates. Results already played are then filled in from the data automatically.

The 2027 Women's World Cup is ready as `WWC_2027_TEMPLATE` (format, host, dates and a round-of-16 pattern copied from 2023).
After the draw on 11 December 2026, fill in its eight groups, check the bracket against FIFA's schedule, and add it to `TOURNAMENTS`.

## Before launch: site details

Near the top of the script in `index.html`, under "SITE DETAILS", fill in `SITE`:

- `contact`: the email address for corrections and questions, shown on the Support page.
- `donate`: donation links, for example `[{name:'Ko-fi', url:'https://ko-fi.com/yourname'}]`. They appear as buttons under "Chip in".
- `social`: links such as X and Instagram.

Anything left empty is simply left off the page. The Support page (`#/support`) also holds the embed builder, the privacy
note and the trademark notice. Before taking donations, read API-Football's terms for the plan you use, and remember the
badges are their owners' trademarks (see below).

## Sharing, downloads and embedding

- **Share images:** the Rankings page (top ten, and the year's movers) and every team page have a Share image button. It
  draws a picture in the browser, square for Instagram or wide for X, ready to download or share from a phone.
- **CSV:** the Rankings, team and tournament pages each have Download CSV, the table as shown with the current filters.
- **Embed:** `#/embed?g=men&n=10&theme=light` is a bare top-N table for other sites' iframes; the Support page builds the code.
- **What's new:** `#/changes`; add a dated line to `CHANGELOG` in `index.html` with each update.

## Association badges

`badges/` holds one current badge per team, named after the team as the site shows it, in lower case with hyphens
(`spain.webp`, `korea-republic.webp`, `conf-uefa.webp`; `-women` for a women's crest that differs), used in lists.
`badges/eras/` keeps every badge with its dates, from `badges/eras.csv` (from inclusive, to exclusive); `build/badges.mjs`
copies those dates into `badges/index.json`. Team pages use them: the shirt crest beside the team name, then the flag,
the association badge and the confederation logo, each the one in use on the page's date. Badges carrying
a regime emblem on the Flags & names blur list are stored blurred. The nightly job lists the top-level files in
`badges/index.json` (`node build/badges.mjs` does the same by hand); a team with no file falls back to Wikipedia's image.
Badges are their associations' trademarks, shown for identification.

The set comes from Logopedia (logos.fandom.com), which can't be fetched from a server, so it is rebuilt from a browser:
1. In a logos.fandom.com tab, paste `tools/badges/logopedia-export.js` into the console, run
   `await formlineExport({extraTitles: [...]})` (extra titles from `extra-bodies.csv` and `page-map.csv`), then `formlineSave()`.
2. Paste `tools/badges/logopedia-images.js` and run `await formlineImages()`: it saves `formline-badges.zip`.
3. `python3 tools/badges/build_badge_eras.py logopedia-badges.json tools/badges/badge-list.csv --extras tools/badges/extra-bodies.csv --map tools/badges/page-map.csv`
   writes `badge-eras.csv` and `badge-review.csv` (undated logos, gaps, teams with no page, blur candidates to check).
4. Unzip the images into `badgeimgs/`, put `badge-eras.csv` in `badgework/`, and run `python3 tools/badges/make_badges.py <that folder> .`

## The FIFA column on the comparison page

The "Formline, Elo and FIFA" page shows FIFA's ranking beside the other two once a copy is in `data/`:
`data/fifa-men.csv` and `data/fifa-women.csv`. One team per line as `rank,team,points` (tab-separated, as copied
from FIFA's site into a spreadsheet, works too). An optional first line `# 7 October 2026` gives the date shown.
Team names as FIFA writes them are matched automatically; any that are not are listed on the page. Replace the
files when FIFA publishes a new ranking. FIFA's site does not allow automated downloads, so this is done by hand.

## Team names

The site shows each team under its official FIFA name (IR Iran, Korea Republic, Türkiye, USA, Côte d'Ivoire and so on). The archives, API-Football and the nightly job all use everyday English names, and the site keeps using those underneath, so nothing else needs to change. The differences are listed in `FIFA_NAMES` in `index.html`, and on the About page. If FIFA renames an association, add a line there.

## Running the job on your own computer

You need Node 20 or later.

```sh
node build/test.mjs                              # offline tests
APIFOOTBALL_KEY=... node build/update.mjs        # real run
```

To preview the site with its data, serve the folder (for example `python3 -m http.server`) and open <http://localhost:8000>.

If you open `index.html` straight from disk, it ignores `data/` and reads the archive from GitHub instead.
