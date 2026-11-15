"""Fetch the competition schedule and darts news, write data/schedule.js and data/news.js.

Runs with the Python standard library only (so GitHub Actions needs no installs).

  python tools/fetch_live.py            # fetch everything
  python tools/fetch_live.py --schedule # only the DVK schedule
  python tools/fetch_live.py --news     # only the news feeds

Settings (team, player) live in tools/config.json.
Sources:
  - feeds.teambeheer.nl: public competition pages of Dartvereniging Kennemerland
    (the same pages dartvk.nl embeds), plus the team's iCal export.
  - pdc.tv/rss.xml, the PDC YouTube channel feed and the NOS sport feed (filtered on darts).
"""
import datetime as dt
import html
import json
import os
import re
import sys
import urllib.request
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG = json.load(open(os.path.join(ROOT, "tools", "config.json"), encoding="utf-8"))


def _last_sunday(year, month):
    d = dt.date(year, month + 1, 1) - dt.timedelta(days=1) if month < 12 else dt.date(year, 12, 31)
    return d - dt.timedelta(days=(d.weekday() + 1) % 7)


def to_amsterdam(when_utc):
    """Convert an aware UTC datetime to Dutch local time (EU summer time rules; no tzdata needed on Windows)."""
    y = when_utc.year
    start = dt.datetime.combine(_last_sunday(y, 3), dt.time(1), dt.timezone.utc)
    end = dt.datetime.combine(_last_sunday(y, 10), dt.time(1), dt.timezone.utc)
    offset = 2 if start <= when_utc < end else 1
    return (when_utc + dt.timedelta(hours=offset)).replace(tzinfo=dt.timezone(dt.timedelta(hours=offset)))


def now_local():
    return to_amsterdam(dt.datetime.now(dt.timezone.utc))
UA = "Mozilla/5.0 (compatible; jos-tiebosch-darts-site/1.0; schedule for one team)"
BASE = "https://feeds.teambeheer.nl"


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        raw = r.read()
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return raw.decode("cp1252")


def clean(text):
    return re.sub(r"\s+", " ", html.unescape(text or "")).strip()


class Tables(HTMLParser):
    """Collect every <table> as rows of cells; each cell = (text, [hrefs], [classes of <b> labels])."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tables, self.stack = [], []
        self.cell = None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "table":
            self.stack.append([])
        elif tag == "tr" and self.stack:
            self.stack[-1].append([])
        elif tag in ("td", "th") and self.stack:
            if not self.stack[-1]:  # some tables put <th> straight into <thead> without a <tr>
                self.stack[-1].append([])
            self.cell = {"text": "", "links": [], "labels": [], "title": a.get("title", "")}
        elif tag == "a" and self.cell is not None:
            self.cell["links"].append(a.get("href", ""))
        elif tag == "b" and self.cell is not None:
            self.cell["labels"].append(a.get("class", ""))

    def handle_endtag(self, tag):
        if tag in ("td", "th") and self.cell is not None and self.stack and self.stack[-1]:
            self.cell["text"] = clean(self.cell["text"])
            self.stack[-1][-1].append(self.cell)
            self.cell = None
        elif tag == "table" and self.stack:
            self.tables.append([r for r in self.stack.pop() if r])

    def handle_data(self, data):
        if self.cell is not None:
            self.cell["text"] += data


def tables(page):
    p = Tables()
    p.feed(page)
    return p.tables


def header(table):
    return [c["text"] for c in table[0]] if table else []


def first_table(page, must_have):
    for t in tables(page):
        h = header(t)
        if all(x in h for x in must_have):
            return t
    return None


def id_from(href, key):
    m = re.search(rf"[?&]{key}=(\d+)", href or "")
    return int(m.group(1)) if m else None


def nl_date(text):
    m = re.match(r"(\d{2})-(\d{2})-(\d{4})", text)
    return f"{m.group(3)}-{m.group(2)}-{m.group(1)}" if m else None


def current_season(today=None):
    today = today or dt.date.today()
    start = today.year if today.month >= 8 else today.year - 1
    return f"{start % 100:02d}-{(start + 1) % 100:02d}"


# ---------------------------------------------------------------- schedule

def parse_ical(text):
    """Return {date: {"time": "HH:MM", "location": str}} from the team's iCal export."""
    out = {}
    for block in re.findall(r"BEGIN:VEVENT(.*?)END:VEVENT", text, re.S):
        fields = dict(re.findall(r"^([A-Z;=A-Z-]+?):(.*)$", block.replace("\r", ""), re.M))
        start = fields.get("DTSTART", "")
        summary = html.unescape(fields.get("SUMMARY", ""))
        if not start or summary.strip().startswith("-"):  # bye weeks show up as " - Team"
            continue
        when = dt.datetime.strptime(start, "%Y%m%dT%H%M%SZ").replace(tzinfo=dt.timezone.utc)
        when = to_amsterdam(when)
        loc = fields.get("LOCATION", "").replace("\\,", ",").strip(" ,")
        out[when.date().isoformat()] = {"time": when.strftime("%H:%M"), "location": loc}
    return out


def fetch_schedule():
    d = CONFIG["district"]
    season = CONFIG.get("season") or current_season()
    team_id = CONFIG["team_id"]
    team_url = f"{BASE}/web/team?d={d}&t={team_id}&s={season}"
    page = get(team_url)

    name = clean(re.search(r"<h1[^>]*>\s*Team:\s*(.*?)</h1>", page, re.S).group(1))
    division_m = re.search(r'href="/web/stand/\?d=\d+&div=([^&"]+)[^"]*">([^<]+)</a>', page)
    division_code, division = (division_m.group(1), clean(division_m.group(2))) if division_m else ("", "")
    venue_m = re.search(r"<h2[^>]*>Locatie</h2>\s*<p>(.*?)</p>", page, re.S)
    home_venue = ", ".join(clean(x) for x in re.split(r"<br\s*/?>", re.sub(r"</?a[^>]*>", "", venue_m.group(1)))) if venue_m else ""

    try:
        ical = parse_ical(get(team_url + "&exp=ical"))
    except Exception as e:  # the schedule itself is more important than times
        print("ical failed:", e)
        ical = {}

    matches = []
    t = first_table(page, ["Datum", "Thuisteam", "Uitteam", "Score"])
    for row in (t or [])[1:]:
        if len(row) < 5:
            continue
        nr, date_c, home_c, away_c, score_c = row[:5]
        date = nl_date(date_c["text"])
        home, away = home_c["text"], away_c["text"]
        if not date:  # "Vrije week"
            matches.append({"round": int(nr["text"] or 0), "bye": True})
            continue
        is_home = id_from(home_c["links"][0] if home_c["links"] else "", "t") == team_id
        result = ""
        for cls in score_c["labels"]:
            if "label-wld" in cls:
                result = {"label-color-green": "W", "label-color-red": "V", "label-color-gray": "G"}.get(
                    next((c for c in cls.split() if c.startswith("label-color-")), ""), "")
        score = re.sub(r"^[WVG]\s*", "", score_c["text"]).strip()
        extra = ical.get(date, {})
        matches.append({
            "round": int(nr["text"] or 0),
            "date": date,
            "time": extra.get("time", ""),
            "home": home,
            "away": away,
            "isHome": is_home,
            "opponent": away if is_home else home,
            "location": extra.get("location") or (home_venue if is_home else ""),
            "score": score,
            "result": result,
            "form": BASE + score_c["links"][0] if score_c["links"] else "",
        })

    players = []
    t = first_table(page, ["Naam", "Singles", "Winst"])
    for row in (t or [])[1:]:
        if len(row) >= 3:
            role = re.search(r"\b(RC|C)\s*$", row[0]["text"])
            players.append({
                "name": re.sub(r"\s+(RC|C)$", "", row[0]["text"]),
                "id": id_from(row[0]["links"][0] if row[0]["links"] else "", "l"),
                "role": role.group(1) if role else "",
                "singles": row[1]["text"],
                "win": row[2]["text"],
            })

    specials = []
    t = first_table(page, ["Naam", "180", "Finish"])
    for row in (t or [])[1:]:
        if len(row) >= 3:
            specials.append({"name": row[0]["text"], "n180": row[1]["text"], "finish": row[2]["text"]})

    # Standings of the division
    standings = []
    if division_code:
        stand = get(f"{BASE}/web/stand?d={d}&s={season}&div={division_code}")
        t = first_table(stand, ["Team", "Wed", "Winst", "Gelijk", "Verlies", "Totaal"])
        for row in (t or [])[1:]:
            cells = [c["text"] for c in row]
            if len(cells) >= 8 and cells[0].isdigit():
                standings.append({
                    "pos": int(cells[0]), "team": cells[1], "played": cells[2], "won": cells[3], "drawn": cells[4],
                    "lost": cells[5], "points": cells[6], "avg": cells[7],
                    "legs": cells[8] if len(cells) > 8 else "",
                    "isUs": any(id_from(h, "t") == team_id for h in row[1]["links"]),
                })

    player = fetch_player(d, season)

    return {
        "fetchedAt": now_local().isoformat(timespec="minutes"),
        "season": season,
        "team": {"id": team_id, "name": name, "division": division, "venue": home_venue, "url": team_url,
                 "icalUrl": team_url + "&exp=ical"},
        "matches": matches,
        "standings": standings,
        "players": players,
        "specials": specials,
        "player": player,
        "source": "Dartvereniging Kennemerland via Teambeheer",
    }


def fetch_player(d, season):
    pid = CONFIG.get("player_id")
    if not pid:
        return None
    url = f"{BASE}/web/speler?d={d}&l={pid}&s={season}"
    page = get(url)
    text = clean(re.sub(r"<[^>]+>", " ", re.sub(r"<(script|style).*?</\1>", "", page, flags=re.S)))

    def grab(rx):
        m = re.search(rx, text)
        return m.group(1) if m else ""

    history = []
    t = first_table(page, ["Seizoen", "Team", "Wed"])
    for row in (t or [])[1:]:
        cells = [c["text"] for c in row]
        if len(cells) >= 3:
            history.append({"season": cells[0], "team": cells[1], "matches": cells[2]})
    return {
        "id": pid,
        "name": CONFIG.get("player_name", ""),
        "url": url,
        "singlesWin": grab(r"(\d+)%\s*Winst in singles"),
        "pairsWin": grab(r"(\d+)%\s*Winst in koppels"),
        "n180": grab(r"(\d+)\s*180ers"),
        "longestStreak": grab(r"Langste reeks singlewinst:\s*([^S]+?)\s+Speler:"),
        "history": history,
    }


# ---------------------------------------------------------------- news

def rss_items(xml, limit):
    items = []
    for block in re.findall(r"<(?:item|entry)\b(.*?)</(?:item|entry)>", xml, re.S):
        def tag(name):
            m = re.search(rf"<{name}[^>]*>(.*?)</{name}>", block, re.S)
            return clean(re.sub(r"<!\[CDATA\[(.*?)\]\]>", r"\1", m.group(1), flags=re.S)) if m else ""
        link = tag("link") or (re.search(r'<link[^>]+href="([^"]+)"', block) or [None, ""])[1]
        items.append({
            "title": tag("title"),
            "link": link,
            "date": tag("pubDate") or tag("published") or tag("updated"),
            "summary": re.sub(r"<[^>]+>", "", tag("description"))[:240],
            "videoId": tag("yt:videoId"),
        })
    return items[:limit]


def parse_date(text):
    for fmt in ("%a, %d %b %Y %H:%M:%S %Z", "%a, %d %b %Y %H:%M:%S %z"):
        try:
            return dt.datetime.strptime(text, fmt).replace(tzinfo=dt.timezone.utc).isoformat()
        except ValueError:
            pass
    try:
        return dt.datetime.fromisoformat(text).isoformat()
    except ValueError:
        return text


def fetch_news():
    out = {"fetchedAt": now_local().isoformat(timespec="minutes"), "pdc": [], "nos": [], "videos": []}
    try:
        out["pdc"] = rss_items(get("https://www.pdc.tv/rss.xml"), 12)
    except Exception as e:
        print("pdc rss failed:", e)
    try:
        nos = rss_items(get("https://feeds.nos.nl/nossportalgemeen"), 200)
        out["nos"] = [i for i in nos if re.search(r"dart", i["title"] + " " + i["summary"], re.I)][:10]
    except Exception as e:
        print("nos rss failed:", e)
    try:
        out["videos"] = rss_items(get("https://www.youtube.com/feeds/videos.xml?user=OfficialPDC"), 8)
    except Exception as e:
        print("youtube rss failed:", e)
    for group in ("pdc", "nos", "videos"):
        for item in out[group]:
            item["date"] = parse_date(item["date"])
    return out


def read_js(path):
    try:
        text = open(path, encoding="utf-8").read()
        return json.loads(text[text.index("=") + 1:].rstrip().rstrip(";"))
    except (OSError, ValueError):
        return None


def write_js(name, var, data, refresh_hours=12):
    """Write data/<name>; skip when only the timestamp would change and the file is fresh.

    This keeps the git history quiet (GitHub Actions commits only real changes),
    while still committing at least every `refresh_hours` so the site can show
    when it was last checked and the scheduled workflow never goes idle.
    """
    path = os.path.join(ROOT, "data", name)
    old = read_js(path)
    if old:
        same = {k: v for k, v in old.items() if k != "fetchedAt"} == {k: v for k, v in data.items() if k != "fetchedAt"}
        try:
            age_h = (now_local() - dt.datetime.fromisoformat(old["fetchedAt"])).total_seconds() / 3600
        except (KeyError, ValueError):
            age_h = 999
        if same and age_h < refresh_hours:
            print("unchanged", path)
            return
    with open(path, "w", encoding="utf-8") as f:
        f.write(f"// Generated by tools/fetch_live.py - do not edit by hand.\nwindow.{var} = ")
        json.dump(data, f, ensure_ascii=False, indent=1)
        f.write(";\n")
    print("wrote", path)


def main():
    args = set(sys.argv[1:])
    ok = True
    if not args or "--schedule" in args:
        try:
            write_js("schedule.js", "SCHEDULE", fetch_schedule())
        except Exception as e:
            ok = False
            print("schedule failed:", e)
    if not args or "--news" in args:
        write_js("news.js", "NEWS", fetch_news())
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
