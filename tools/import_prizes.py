"""One-time import of the prize list from the old site into data/prizes.js.

After the import, data/prizes.js is the source of truth: add new prizes there
by hand (one line per prize). Re-running this script overwrites that file.

Usage:  python tools/import_prizes.py ["D:/Website Jos Tiebosch"]
"""
import json
import os
import re
import sys
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1] if len(sys.argv) > 1 else r"D:\Website Jos Tiebosch"


class TableParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows, self.row, self.cell, self.skip = [], None, None, 0

    def handle_starttag(self, tag, attrs):
        if tag in ("style", "script"):
            self.skip += 1
        elif tag == "tr":
            self.row = []
        elif tag in ("td", "th") and self.row is not None:
            self.cell = ""

    def handle_endtag(self, tag):
        if tag in ("style", "script"):
            self.skip -= 1
        elif tag in ("td", "th") and self.row is not None and self.cell is not None:
            self.row.append(re.sub(r"\s+", " ", self.cell.replace("\xa0", " ")).strip())
            self.cell = None
        elif tag == "tr" and self.row is not None:
            self.rows.append(self.row)
            self.row = None

    def handle_data(self, data):
        if self.cell is not None and not self.skip:
            self.cell += data


def iso_date(text):
    d, m, y = (int(x) for x in re.split(r"[-/.]", text))
    if y < 100:
        y += 1900 if y > 50 else 2000
    return f"{y:04d}-{m:02d}-{d:02d}"


# Tag rules on the remark ("opmerking") column; a prize may get several tags.
TAGS = [
    ("gk", r"gesloten kennemerland"),
    ("kpn", r"\bkpn\b"),
    ("beker", r"(?<!geen )beker(?! bij)"),
    ("kiwanis", r"kiwanis"),
    ("ranking", r"ranking|masters"),
    ("club", r"clubkampioen|dartskamp"),
    ("koppel", r"koppel|mixie"),
    ("buitenland", r"neuwied|mark\b"),
]

# Venues normalised to a readable name.
VENUES = {"Sport": "Café Sport", "Het Orkest (Sport)": "Café Sport (Het Orkest)", "Cafe Carillon": "Café Carillon",
          "Carillon": "Café Carillon", "Cafe de Hangjas": "Café de Hangjas"}


def main():
    files = [f for f in os.listdir(SRC) if f.startswith("prijzen") and f.endswith(".html")]
    files.sort(key=lambda f: int(re.findall(r"\d+", f)[0]))
    prizes = []
    for name in files:
        parser = TableParser()
        parser.feed(open(os.path.join(SRC, name), "rb").read().decode("cp1252"))
        for row in parser.rows:
            if len(row) >= 4 and re.fullmatch(r"\d+", row[0] or "") and row[2]:
                nr, venue, date, place = row[:4]
                remark = row[4] if len(row) > 4 else ""
                tags = [t for t, rx in TAGS if re.search(rx, remark, re.I)]
                prizes.append({
                    "nr": int(nr),
                    "date": iso_date(date),
                    "place": int(re.match(r"\d+", place).group()),
                    "venue": VENUES.get(venue, venue),
                    "event": remark,
                    "tags": tags,
                })

    # Gap in the old list (numbers 210-220 were left empty). The KPN pages of the
    # old site show a first prize at the KPN championship of 16 March 2013.
    prizes.append({"nr": None, "date": "2013-03-16", "place": 1, "venue": "", "event": "KPN kampioenschap",
                   "tags": ["kpn"], "note": "aangevuld van de KPN-pagina van de oude site"})
    prizes.sort(key=lambda p: p["date"])

    # Link prizes to photo albums of the same event.
    albums = {"1986-09-27": "neuwied-1986", "2006-05-28": "gk-2006", "2008-12-27": "oliebollen-2008",
              "2009-05-23": "bekerfinale-2009"}
    for p in prizes:
        year = p["date"][:4]
        if p["date"] in albums:
            p["album"] = albums[p["date"]]
        elif "kpn" in p["tags"] and year in ("2001", "2002", "2003", "2004", "2005", "2006", "2007", "2008",
                                              "2011", "2012", "2013"):
            p["album"] = "kpn-" + year
        elif p["date"] == "2011-05-21":
            p["album"] = "gk-2011" if "gk" in p["tags"] else "beker-2011"

    out = os.path.join(ROOT, "data", "prizes.js")
    with open(out, "w", encoding="utf-8") as f:
        f.write("// Erelijst van Jos Tiebosch. Een prijs per regel; nieuwe prijzen gewoon onderaan toevoegen.\n")
        f.write("// place: 1 = eerste prijs. tags: gk, kpn, beker, kiwanis, ranking, club, koppel, buitenland.\n")
        f.write("// album: id van een fotoalbum uit data/media.js (optioneel).\n")
        f.write("window.PRIZES = [\n")
        for p in prizes:
            f.write("  " + json.dumps(p, ensure_ascii=False) + ",\n")
        f.write("];\n")
    print(len(prizes), "prizes ->", out)


if __name__ == "__main__":
    main()
