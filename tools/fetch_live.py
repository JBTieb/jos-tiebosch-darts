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


def local_to_utc(date_iso, hhmm):
    """Dutch local date + time -> aware UTC datetime."""
    naive = dt.datetime.fromisoformat(f"{date_iso}T{hhmm}")
    guess = naive.replace(tzinfo=dt.timezone.utc) - dt.timedelta(hours=1)
    offset = to_amsterdam(guess).utcoffset()
    return (naive - offset).replace(tzinfo=dt.timezone.utc)


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
        self.in_a = False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "table":
            self.stack.append([])
        elif tag == "tr" and self.stack:
            self.stack[-1].append([])
        elif tag in ("td", "th") and self.stack:
            if not self.stack[-1]:  # some tables put <th> straight into <thead> without a <tr>
                self.stack[-1].append([])
            self.cell = {"text": "", "links": [], "linkTexts": [], "labels": [], "title": a.get("title", "")}
        elif tag == "a" and self.cell is not None:
            self.cell["links"].append(a.get("href", ""))
            self.cell["linkTexts"].append("")
            self.in_a = True
        elif tag == "b" and self.cell is not None:
            self.cell["labels"].append(a.get("class", ""))

    def handle_endtag(self, tag):
        if tag == "a":
            self.in_a = False
        if tag in ("td", "th") and self.cell is not None and self.stack and self.stack[-1]:
            self.cell["text"] = clean(self.cell["text"])
            self.cell["linkTexts"] = [clean(t) for t in self.cell["linkTexts"]]
            self.stack[-1][-1].append(self.cell)
            self.cell = None
        elif tag == "table" and self.stack:
            self.tables.append([r for r in self.stack.pop() if r])

    def handle_data(self, data):
        if self.cell is not None:
            self.cell["text"] += data
            if self.in_a and self.cell["linkTexts"]:
                self.cell["linkTexts"][-1] += data


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
        out[when.date().isoformat()] = {"time": when.strftime("%H:%M"), "location": loc, "utc": start}
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
            "utc": extra.get("utc", ""),
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

    history = []
    t = first_table(page, ["Seizoen", "Naam", "Pos."]) or first_table(page, ["Seizoen", "Naam", "Div."])
    for row in (t or [])[1:]:
        cells = [c["text"] for c in row]
        if len(cells) >= 4:
            history.append({"season": cells[0], "team": cells[1], "division": cells[2], "pos": cells[3]})

    cup = safe(lambda: fetch_cup(d, season), {"matches": [], "rounds": []}, "cup")
    agenda = safe(fetch_agenda, [], "agenda")

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
        "teamHistory": history,
        "cup": cup,
        "agenda": agenda,
        "icsUrl": CONFIG.get("site_url", "").rstrip("/") + "/data/wedstrijden.ics",
        "source": "Dartvereniging Kennemerland via Teambeheer",
    }


def safe(fn, default, label):
    try:
        return fn()
    except Exception as e:  # one failing extra must never break the schedule itself
        print(f"{label} failed:", e)
        return default


# ---------------------------------------------------------------- cup (bekercompetitie)

def fetch_cup(d, season):
    """All cup matches of the club's teams this season (pools and rounds discovered via dartvk.nl)."""
    club = set(CONFIG.get("club_team_ids", [])) | {CONFIG["team_id"]}
    start = html.unescape(get("https://www.dartvk.nl/bekercompetitie/topklasse-bekercompetitie/"))
    seeds = sorted(set(re.findall(r"bp=(b\d+)", start)))
    seen, todo, rounds, matches, pools = set(), [(bp, "b1") for bp in seeds], [], [], {}
    while todo:
        bp, br = todo.pop(0)
        if (bp, br) in seen:
            continue
        seen.add((bp, br))
        page = get(f"{BASE}/web/beker?d={d}&s={season}&bp={bp}&br={br}")
        pool = re.search(r"Bekerpoule:\s*([^<]+)<", page)
        pools[bp] = clean(pool.group(1)) if pool else bp
        for nbp, nbr in re.findall(r"bp=(b\d+)&(?:amp;)?br=(b\d+)", page):
            if (nbp, nbr) not in seen:
                todo.append((nbp, nbr))
        rounds.append({"pool": pools[bp], "round": br})
        t = first_table(page, ["Datum", "Thuisteam", "Uitteam", "Score"])
        for row in (t or [])[1:]:
            if len(row) < 5:
                continue
            ids = {id_from(c["links"][0], "t") for c in row[2:4] if c["links"]}
            if not club & ids:
                continue
            matches.append({
                "pool": pools[bp], "round": br, "date": nl_date(row[1]["text"]),
                "home": row[2]["text"], "away": row[3]["text"], "score": row[4]["text"],
                "ours": CONFIG["team_id"] in ids,
                "url": f"{BASE}/web/beker?d={d}&s={season}&bp={bp}&br={br}",
            })
    matches.sort(key=lambda m: (m["date"] or "", m["home"]))
    return {"matches": matches, "rounds": rounds}


# ---------------------------------------------------------------- DVK agenda (rankings, tournaments)

def fetch_agenda():
    """Upcoming events from the dartvk.nl agenda (schema.org Event data in the page)."""
    page = get("https://www.dartvk.nl/agenda/")
    events = []
    for block in re.findall(r'<script type="application/ld\+json">(.*?)</script>', page, re.S):
        if not re.search(r'"@type":\s*"Event"', block):
            continue
        name = re.search(r'"name":\s*"([^"]+)"', block)
        url = re.search(r'"url":\s*"([^"]+)"', block)
        start = re.search(r'"startDate":\s*"(\d{4})-(\d{1,2})-(\d{1,2})T(\d{1,2}):(\d{2})', block)
        place = re.search(r'"location":\s*\{.*?"name":\s*"([^"]*)"', block, re.S)
        if not (name and start):
            continue
        y, m, dd, hh, mm = start.groups()
        events.append({
            "title": clean(name.group(1)), "url": url.group(1) if url else "https://www.dartvk.nl/agenda/",
            "date": f"{y}-{int(m):02d}-{int(dd):02d}", "time": f"{int(hh):02d}:{mm}",
            "location": clean(place.group(1)) if place else "",
        })
    today = now_local().date().isoformat()
    uniq = {(e["date"], e["title"]): e for e in events if e["date"] >= today}
    return sorted(uniq.values(), key=lambda e: e["date"])[:20]


# ---------------------------------------------------------------- player history (statistics)

def parse_player_season(page, player_id):
    """Matches with every single/pair game from the player's 'Uitgebreide weergave' table."""
    t = first_table(page, ["Datum", "Thuisteam", "Uitteam", "Score", "180"])
    matches, cur = [], None
    for row in (t or [])[1:]:
        first = row[0]["text"]
        if (first.isdigit() or re.fullmatch(r"b\d+", first)) and len(row) >= 8:  # "b1".. = cup rounds
            cur = {"date": nl_date(row[1]["text"]), "home": row[2]["text"], "away": row[3]["text"],
                   "cup": first if first.startswith("b") else "",
                   "score": row[4]["text"].strip(),
                   "n180": int(row[7]["text"]) if row[7]["text"].isdigit() else 0,
                   "finish": row[8]["text"] if len(row) > 8 else "",
                   "sl": row[9]["text"] if len(row) > 9 else "",
                   "side": None, "games": []}
            matches.append(cur)
        elif cur is not None and first == "" and len(row) >= 5:
            result = ""
            for cls in row[1]["labels"]:
                result = ("W" if "label-color-green" in cls else "V" if "label-color-red" in cls
                          else "G" if "label-color-gray" in cls else result)
            homes = [(id_from(h, "l"), n) for h, n in zip(row[2]["links"], row[2]["linkTexts"])]
            aways = [(id_from(h, "l"), n) for h, n in zip(row[3]["links"], row[3]["linkTexts"])]
            mine_home = any(i == player_id for i, _ in homes)
            us, them = (homes, aways) if mine_home else (aways, homes)
            cur["side"] = "home" if mine_home else "away"
            legs = row[4]["text"]
            m = re.match(r"(\d+)-(\d+)", legs)
            if m:
                a, b = int(m.group(1)), int(m.group(2))
                legs = f"{a}-{b}" if mine_home else f"{b}-{a}"  # always "ours-theirs"
            cur["games"].append({
                "type": "single" if len(us) == 1 else "pair", "result": result, "legs": legs,
                "partners": [n for i, n in us if i != player_id], "opponents": [n for _, n in them],
            })
    for m in matches:
        m["side"] = m["side"] or "home"
        m["team"] = m["home"] if m["side"] == "home" else m["away"]
        m["opponent"] = m["away"] if m["side"] == "home" else m["home"]
        sm = re.match(r"(\d+)-(\d+)", m["score"])
        if sm:
            a, b = int(sm.group(1)), int(sm.group(2))
            ours, theirs = (a, b) if m["side"] == "home" else (b, a)
            m["teamScore"] = f"{ours}-{theirs}"
            m["teamResult"] = "W" if ours > theirs else "V" if ours < theirs else "G"
    return matches


def fetch_history():
    """Every season of the player on Teambeheer. Finished seasons are cached in data/stats.js."""
    d, pid = CONFIG["district"], CONFIG["player_id"]
    current = CONFIG.get("season") or current_season()
    old = read_js(os.path.join(ROOT, "data", "stats.js")) or {}
    cached = {s["season"]: s for s in old.get("seasons", [])}
    first = get(f"{BASE}/web/speler?d={d}&l={pid}&s={current}")
    found = set(re.findall(r"/web/speler\?d=\d+&(?:amp;)?l=\d+&(?:amp;)?s=(\d{2}-\d{2})", first))
    found |= set(re.findall(r"[?&]s=(\d{2}-\d{2})", first))
    seasons = sorted(found | {current}, reverse=True)
    out = []
    for s in seasons:
        if s != current and s in cached and cached[s].get("matches"):
            out.append(cached[s])
            continue
        page = first if s == current else get(f"{BASE}/web/speler?d={d}&l={pid}&s={s}")
        matches = parse_player_season(page, pid)
        if matches:
            out.append({"season": s, "team": matches[-1]["team"], "matches": matches})
    return {"fetchedAt": now_local().isoformat(timespec="minutes"), "playerId": pid,
            "playerName": CONFIG.get("player_name", ""), "seasons": out}


# ---------------------------------------------------------------- division and DVK-wide rankings

def _int(text):
    m = re.search(r"\d+", text or "")
    return int(m.group()) if m else 0


def fetch_division(team_history):
    """Per season: the teams in Jos's division and the DVK-wide player rankings
    (singles, 180s, highest finishes, fastest legs). Finished seasons are cached in data/division.js."""
    d = CONFIG["district"]
    current = CONFIG.get("season") or current_season()
    old = read_js(os.path.join(ROOT, "data", "division.js")) or {}
    cached = old.get("seasons", {})
    out = {}
    for h in team_history:
        s, code = h["season"], h["division"]
        prev = cached.get(s)
        if prev and (s != current or (prev.get("at") and
                     (now_local() - dt.datetime.fromisoformat(prev["at"])).total_seconds() < 12 * 3600)):
            out[s] = prev
            continue
        stand = get(f"{BASE}/web/stand?d={d}&s={s}&div={code}")
        t = first_table(stand, ["Team", "Wed"])
        teams = sorted({row[1]["text"] for row in (t or [])[1:] if len(row) > 1 and row[0]["text"].isdigit()})
        pk = []
        t = first_table(get(f"{BASE}/web/scorelijst-pk/?d={d}&s={s}"), ["Speler", "Singles", "Voor", "Tegen"])
        for row in (t or [])[1:]:
            c = [x["text"] for x in row]
            if len(c) >= 7 and _int(c[3]) >= 3:
                win = re.search(r"[\d.]+", c[6])
                pk.append([c[1], c[2], _int(c[3]), _int(c[4]), _int(c[5]), float(win.group()) if win else 0.0])
        lists = {}
        for key, tt in (("s180", 1), ("fin", 2), ("fast", 3)):
            t = first_table(get(f"{BASE}/web/scorelijst-bijzres/?d={d}&s={s}&t={tt}"), ["Speler", "Team", "Hoeveel"])
            rows = []
            for row in (t or [])[1:]:
                c = [x["text"] for x in row]
                if len(c) >= 4:
                    rows.append([c[1], c[2], _int(c[-1])])
            lists[key] = rows
        if not pk and not lists["s180"]:
            continue  # e.g. 2020-21: no competition (corona)
        out[s] = {"at": now_local().isoformat(timespec="minutes"), "division": code, "teams": teams, "pk": pk, **lists}
    return {"fetchedAt": now_local().isoformat(timespec="minutes"), "player": CONFIG.get("player_name", ""),
            "seasons": out}


# ---------------------------------------------------------------- calendar subscription (.ics)

def ics_escape(text):
    return str(text).replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def write_ics(schedule):
    """data/wedstrijden.ics: a calendar people can subscribe to; it follows date changes automatically."""
    team = schedule["team"]["name"]
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//jos-tiebosch-darts//NL", "CALSCALE:GREGORIAN",
             "METHOD:PUBLISH", f"X-WR-CALNAME:Darten {ics_escape(team)}", "X-WR-TIMEZONE:Europe/Amsterdam",
             "REFRESH-INTERVAL;VALUE=DURATION:PT6H", "X-PUBLISHED-TTL:PT6H"]

    def event(uid, date, hhmm, utc, summary, location, url):
        if utc:
            start = dt.datetime.strptime(utc, "%Y%m%dT%H%M%SZ").replace(tzinfo=dt.timezone.utc)
        else:
            start = local_to_utc(date, hhmm or "20:00")
        end = start + dt.timedelta(hours=3)
        lines.extend([
            "BEGIN:VEVENT", f"UID:{uid}@jos-tiebosch-darts", f"DTSTAMP:{stamp}",
            f"DTSTART:{start:%Y%m%dT%H%M%SZ}", f"DTEND:{end:%Y%m%dT%H%M%SZ}",
            f"SUMMARY:{ics_escape(summary)}", f"LOCATION:{ics_escape(location)}", f"URL:{url}",
            "DESCRIPTION:" + ics_escape("Controleer bij twijfel altijd Teambeheer of dartvk.nl."),
            "BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:-PT2H", "DESCRIPTION:Over 2 uur darten", "END:VALARM",
            "END:VEVENT"])

    for m in schedule["matches"]:
        if m.get("bye") or not m.get("date"):
            continue
        where = "thuis" if m["isHome"] else "uit"
        event(f"{schedule['season']}-competitie-{m['round']}", m["date"], m.get("time"), m.get("utc"),
              f"Darten: {m['home']} - {m['away']} ({where})", m.get("location", ""), schedule["team"]["url"])
    for m in schedule.get("cup", {}).get("matches", []):
        if m.get("ours") and m.get("date"):
            uid = re.sub(r"[^a-z0-9]+", "-", f"{schedule['season']}-beker-{m['round']}-{m['home']}".lower())
            event(uid, m["date"], "20:00", "", f"Beker: {m['home']} - {m['away']}", "", m["url"])
    lines.append("END:VCALENDAR")

    def fold(line):  # RFC 5545: lines longer than 75 octets continue on the next line after a space
        out, cur = [], ""
        for ch in line:
            if len((cur + ch).encode("utf-8")) > (75 if not out else 74):
                out.append(cur)
                cur = ""
            cur += ch
        return "\r\n ".join(out + [cur])

    body = "\r\n".join(fold(l) for l in lines) + "\r\n"
    path = os.path.join(ROOT, "data", "wedstrijden.ics")
    old = open(path, encoding="utf-8", newline="").read() if os.path.exists(path) else ""
    if re.sub(r"DTSTAMP:\S+", "", old) == re.sub(r"DTSTAMP:\S+", "", body):
        print("unchanged", path)
        return
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(body)
    print("wrote", path)


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
            schedule = fetch_schedule()
            write_js("schedule.js", "SCHEDULE", schedule)
            write_ics(schedule)
        except Exception as e:
            ok = False
            print("schedule failed:", e)
        stats = safe(fetch_history, None, "history")
        if stats and stats["seasons"]:
            write_js("stats.js", "STATS", stats, refresh_hours=24)
        history = (read_js(os.path.join(ROOT, "data", "schedule.js")) or {}).get("teamHistory", [])
        division = safe(lambda: fetch_division(history), None, "division")
        if division and division["seasons"]:
            write_js("division.js", "DIVISION", division, refresh_hours=24)
    if not args or "--news" in args:
        write_js("news.js", "NEWS", fetch_news())
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
