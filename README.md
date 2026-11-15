# Jos Tiebosch – darts site

Static website for Jos Tiebosch (darter from Beverwijk since 1983). Site text is Dutch.

- **Erelijst** – all prizes since 1984 (`data/prizes.js`, hand-editable, one prize per line)
- **Certificaten, Foto's, Knipsels** – images from the old site, de-duplicated and resized (`tools/build_media.py`)
- **Mijn wedstrijden** – schedule, results, standings and personal stats of his DVK team (DC Sport 2.0)
- **Darts live** – the darts tournament currently running, PDC rankings and news

No build step, no server code. Open `index.html` directly, or host the folder on any static host.

## Data sources

| What | Source | How |
|---|---|---|
| Team schedule, results, standings, player stats | `feeds.teambeheer.nl` (public pages of Dartvereniging Kennemerland, the same ones dartvk.nl embeds) | `tools/fetch_live.py`, run by GitHub Actions; writes `data/schedule.js` |
| PDC news, PDC videos, NOS darts news | `pdc.tv/rss.xml`, PDC YouTube channel feed, NOS sport feed | same script; writes `data/news.js` |
| Running tournament + world ranking | Wikipedia API (nl, en), CC BY-SA | fetched live in the browser (`assets/js/app.js`) |

Teambeheer and the RSS feeds do not allow browser requests from other sites (no CORS), which is why they are fetched by the scheduled
workflow instead. Wikipedia does allow it, so the tournament page is always live.
Dart-by-dart live scores are not available for free (Flashscore/Sofascore forbid reuse; Sportradar etc. are paid); the site links out to them.

## Settings

- `tools/config.json` – team and player (Teambeheer ids). Season follows the calendar automatically.
  Other Café Sport teams: Sport 1 = 6197, DC Sport 11 = 6278, Sport 10 = 8885.
- `data/site.js` – look (`theme`: `cafe`, `erelijst`, `toernooi`). Preview any look with `?stijl=erelijst` after the URL.

## Common tasks

```bash
python tools/fetch_live.py                 # refresh schedule + news locally
python tools/build_media.py "D:/Website Jos Tiebosch"   # rebuild images from the old site
python -m http.server 8094                 # preview at http://localhost:8094
```

Add a prize: append a line to `data/prizes.js`, e.g.
`{"nr": null, "date": "2026-12-28", "place": 1, "venue": "Café Sport", "event": "Oliebollentoernooi", "tags": []},`

## Putting it online (GitHub Pages, free)

1. Create a GitHub repository (public) and push this folder to the `main` branch.
2. Repository **Settings → Pages**: Source = *Deploy from a branch*, branch `main`, folder `/ (root)`.
3. Repository **Settings → Actions → General → Workflow permissions**: *Read and write permissions* (lets the workflow commit new data).
4. **Actions** tab → *Update schedule and news* → *Run workflow* once to test.
5. The site is at `https://<user>.github.io/<repo>/`. Optional: own domain (e.g. jostiebosch.nl, ~€10/year) via Settings → Pages → Custom domain.

The workflow runs every 3 hours and every 30 minutes on Thursday/Friday evenings. It only commits when something changed (and at
least every 12 hours), so GitHub never pauses the schedule for inactivity.
