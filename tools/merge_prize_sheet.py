"""Merge Jos's own prize spreadsheet ("Behaalde prijzen.xls") into data/prizes.js.

Usage:  python tools/merge_prize_sheet.py "C:/Users/.../Behaalde prijzen.xls"
Needs:  pip install xlrd   (reads the old .xls format)

Rules:
- The spreadsheet is leading for date, place, venue and remark of every number it contains.
- Numbers that only exist on the site (e.g. nr 232) are kept; nothing is ever deleted.
- Photo album links already on the site are kept.
- Tags are recalculated from the remark.
Prints what was added or changed, so the result can be checked before committing.
"""
import datetime as dt
import json
import os
import re
import sys

import xlrd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PRIZES = os.path.join(ROOT, "data", "prizes.js")

TAGS = [("gk", r"gesloten kennemerland"), ("kpn", r"\bkpn\b"), ("beker", r"(?<!geen )beker(?! bij)"),
        ("kiwanis", r"kiwanis"), ("ranking", r"ranking|masters"), ("club", r"clubkampioen|dartskamp"),
        ("koppel", r"koppel|mixie"), ("buitenland", r"neuwied|mark\b")]
VENUES = {"Sport": "Café Sport", "Het Orkest (Sport)": "Café Sport (Het Orkest)",
          "Het Orkest (Café Sport)": "Café Sport (Het Orkest)", "Cafe Carillon": "Café Carillon",
          "Carillon": "Café Carillon", "Cafe de Hangjas": "Café de Hangjas"}
HEADER = [
    "// Erelijst van Jos Tiebosch. Een prijs per regel; nieuwe prijzen gewoon onderaan toevoegen.",
    "// Bron: de oude website en zijn eigen lijst 'Behaalde prijzen.xls' (samengevoegd met tools/merge_prize_sheet.py).",
    "// place: 1 = eerste prijs. tags: gk, kpn, beker, kiwanis, ranking, club, koppel, buitenland.",
    "// album: id van een fotoalbum uit data/media.js (optioneel).",
]


def tags_for(event):
    tags = [k for k, rx in TAGS if re.search(rx, event, re.I)]
    # "... met <one partner>" is a pairs event (not "met Kees, John en Frank" or "met Café Sport1")
    m = re.search(r"\bmet ([^,]+)$", event)
    if m and " en " not in m.group(1) and not re.search(r"sport\s*\d", m.group(1), re.I) and "koppel" not in tags:
        tags.append("koppel")
    return tags


def read_sheet(path):
    sheet = xlrd.open_workbook(path).sheet_by_index(0)
    rows = {}
    for r in range(sheet.nrows):
        v = [sheet.cell(r, c).value for c in range(min(5, sheet.ncols))] + [""] * 5
        nr = v[0]
        if isinstance(nr, str):  # typo like "232 De Zien" in the number column
            m = re.match(r"\s*(\d+)\s*(.*)", nr)
            if not m:
                continue
            nr, v[1] = float(m.group(1)), v[1] or m.group(2)
        if not isinstance(nr, float) or not isinstance(v[2], float):
            continue
        place = re.match(r"\d+", str(v[3]))
        event = str(int(v[4])) if isinstance(v[4], float) else str(v[4]).strip()
        rows[int(nr)] = {
            "nr": int(nr), "date": (dt.date(1899, 12, 30) + dt.timedelta(days=int(v[2]))).isoformat(),
            "place": int(place.group()) if place else 0, "venue": VENUES.get(str(v[1]).strip(), str(v[1]).strip()),
            "event": event,
        }
    return rows


def main():
    sheet = read_sheet(sys.argv[1])
    text = open(PRIZES, encoding="utf-8").read()
    site = [json.loads(l.strip().rstrip(",")) for l in text.splitlines() if l.strip().startswith("{")]
    by_nr = {p["nr"]: p for p in site if p.get("nr")}
    extra = [p for p in site if not p.get("nr")]
    out = []
    for nr in sorted(set(by_nr) | set(sheet)):
        old, new = by_nr.get(nr), sheet.get(nr)
        p = dict(old) if old else {}
        if new:
            for k in ("date", "place", "venue", "event"):
                if k == "event" and old and (not new[k] or new[k] == "301") and old.get(k):
                    continue
                if old and old.get(k) != new[k]:
                    print(f"changed {nr} {k}: {old.get(k)!r} -> {new[k]!r}")
                p[k] = new[k]
            p["nr"] = nr
            if not old:
                print(f"added   {nr} {new['date']} {new['place']}e {new['event']} ({new['venue']})")
        p["tags"] = tags_for(p["event"])
        out.append({k: p[k] for k in ("nr", "date", "place", "venue", "event", "tags", "note", "album") if k in p})
    out += extra
    out.sort(key=lambda p: (p["date"], p.get("nr") or 0))
    with open(PRIZES, "w", encoding="utf-8") as f:
        f.write("\n".join(HEADER) + "\nwindow.PRIZES = [\n")
        for p in out:
            f.write("  " + json.dumps(p, ensure_ascii=False) + ",\n")
        f.write("];\n")
    print(f"{len(out)} prizes, {sum(p['place'] == 1 for p in out)} first places, latest {out[-1]['date']}")


if __name__ == "__main__":
    main()
