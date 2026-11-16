/* Jos Tiebosch darts site: hash-routed single page, works from file:// and any static host. */
(() => {
  "use strict";

  const SITE = window.SITE || {};
  const PRIZES = window.PRIZES || [];
  const MEDIA = window.MEDIA || { albums: [], certificates180: [], certificatesOther: [], clippings: [], portraits: {}, videos: [] };
  const SCHEDULE = window.SCHEDULE || null;
  const NEWS = window.NEWS || { pdc: [], nos: [], videos: [] };
  const STATS = window.STATS || null;
  const TIMELINE = window.TIMELINE || { cafes: [], milestones: [] };
  const main = document.getElementById("main");

  // ------------------------------------------------------------ theme
  const params = new URLSearchParams(location.search);
  const theme = params.get("stijl") || SITE.theme || "cafe";
  document.documentElement.dataset.theme = theme;

  // ------------------------------------------------------------ helpers
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const DAYS = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
  const MONTHS = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
  const parseISO = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };
  const longDate = (iso, withDay = true) => {
    const d = parseISO(iso);
    return `${withDay ? DAYS[d.getDay()] + " " : ""}${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  };
  const shortDate = (iso) => { const d = parseISO(iso); return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`; };
  const today = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };
  const daysUntil = (iso) => Math.round((parseISO(iso) - today()) / 86400000);
  const thumb = (id) => `assets/img/thumb/${id}.jpg`;
  const full = (id) => `assets/img/full/${id}.jpg`;
  const mapsLink = (q) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  const timeAgo = (iso) => {
    const mins = Math.round((Date.now() - new Date(iso)) / 60000);
    if (mins < 60) return `${Math.max(mins, 1)} minuten geleden`;
    if (mins < 60 * 36) return `${Math.round(mins / 60)} uur geleden`;
    return `${Math.round(mins / 1440)} dagen geleden`;
  };
  const relDay = (n) => (n === 0 ? "vandaag!" : n === 1 ? "morgen" : `over ${n} dagen`);
  const placeLabel = (p) => `${p}e`;
  const albumById = (id) => MEDIA.albums.find((a) => a.id === id);
  const seasonLabel = (s) => `20${s.slice(0, 2)}-20${s.slice(3, 5)}`;
  const pct = (w, l) => (w + l ? Math.round((100 * w) / (w + l)) : 0);
  const finishes = (s) => (String(s || "").match(/\d{2,3}/g) || []).map(Number).filter((n) => n >= 60 && n <= 170);

  // ------------------------------------------------------------ Teambeheer statistics (data/stats.js)
  const allMatches = () => (STATS ? STATS.seasons.flatMap((se) => se.matches.map((m) => ({ ...m, season: se.season }))) : [])
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const legsOf = (g) => { const m = /^(\d+)-(\d+)$/.exec(g.legs || ""); return m ? [Number(m[1]), Number(m[2])] : [0, 0]; };

  function summarize(matches) {
    const s = { matches: matches.length, sW: 0, sV: 0, pW: 0, pV: 0, n180: 0, best: 0, lf: 0, la: 0, tW: 0, tG: 0, tV: 0 };
    matches.forEach((m) => {
      s.n180 += m.n180 || 0;
      s.best = Math.max(s.best, ...finishes(m.finish), 0);
      if (m.teamResult) s["t" + m.teamResult]++;
      m.games.forEach((g) => {
        if (g.type === "single") {
          if (g.result === "W") s.sW++; else if (g.result === "V") s.sV++;
          const [f, a] = legsOf(g); s.lf += f; s.la += a;
        } else if (g.result === "W") s.pW++; else if (g.result === "V") s.pV++;
      });
    });
    return s;
  }
  const currentSeasonStats = () => {
    if (!STATS || !SCHEDULE) return null;
    const se = STATS.seasons.find((x) => x.season === SCHEDULE.season);
    return se ? summarize(se.matches) : null;
  };

  // ------------------------------------------------------------ derived numbers
  const firsts = PRIZES.filter((p) => p.place === 1);
  const years = (list) => [...new Set(list.map((p) => p.date.slice(0, 4)))];
  const gkWins = years(PRIZES.filter((p) => p.tags.includes("gk") && p.place === 1));
  const kpnWins = years(PRIZES.filter((p) => p.tags.includes("kpn") && p.place === 1));
  const cupWins = years(PRIZES.filter((p) => /bekerwinnaar/i.test(p.event)));
  const total180 = MEDIA.certificates180.reduce((s, c) => s + c.count, 0);
  const firstYear = PRIZES.length ? PRIZES[0].date.slice(0, 4) : "1984";

  const TAGS = [
    ["all", "Alles"], ["p1", "1e prijzen"], ["gk", "Gesloten Kennemerland"], ["kpn", "KPN-kampioenschap"],
    ["beker", "Beker"], ["kiwanis", "Kiwanis"], ["club", "Kampioenschappen"], ["ranking", "Rankings"],
    ["koppel", "Koppels"], ["buitenland", "Buitenland"],
  ];

  // ------------------------------------------------------------ schedule helpers
  const realMatches = () => (SCHEDULE ? SCHEDULE.matches.filter((m) => !m.bye) : []);
  const nextMatch = () => realMatches().find((m) => !m.score && daysUntil(m.date) >= 0);
  const lastMatch = () => realMatches().filter((m) => m.score).slice(-1)[0];
  const scheduleStale = () => SCHEDULE && (Date.now() - new Date(SCHEDULE.fetchedAt)) / 3600000 > (SITE.scheduleStaleHours || 48);

  function matchCard(m, big = false) {
    if (!m) {
      return `<div class="card match-card"><div class="eyebrow">Volgende wedstrijd</div>
        <p>Er staat op dit moment geen wedstrijd meer gepland. Bekijk <a href="#/wedstrijden">het volledige programma</a>.</p></div>`;
    }
    const n = daysUntil(m.date);
    const us = SCHEDULE.team.name;
    return `<div class="card match-card">
      <div class="eyebrow">Volgende wedstrijd · ${esc(SCHEDULE.team.division)}</div>
      <div class="when">${esc(longDate(m.date))}${m.time ? ` · ${esc(m.time)} uur` : ""}</div>
      <span class="countdown">${relDay(n)}</span>
      <div class="versus">
        <div class="team ${m.home === us ? "us" : ""}">${esc(m.home)}</div>
        <div class="vs">tegen</div>
        <div class="team ${m.away === us ? "us" : ""}">${esc(m.away)}</div>
      </div>
      <div class="where">
        <span class="badge ${m.isHome ? "home" : "away"}">${m.isHome ? "Thuis" : "Uit"}</span>
        <span>${esc(m.location || "locatie nog onbekend")}</span>
      </div>
      ${big || m.location ? `<div class="btn-row" style="margin-top:16px">
        ${m.location ? `<a class="btn" href="${mapsLink(m.location)}" target="_blank" rel="noopener">Route plannen</a>` : ""}
        ${big ? `<a class="btn ghost" href="${esc(/^https:/.test(SCHEDULE.icsUrl || "") ? SCHEDULE.icsUrl.replace(/^https:/, "webcal:") : SCHEDULE.team.icalUrl)}">Zet in mijn agenda</a>` : `<a class="btn ghost" href="#/wedstrijden">Heel het programma</a>`}
      </div>` : ""}
    </div>`;
  }

  function staleNotice() {
    if (!SCHEDULE) {
      return `<div class="notice warn">Het speelschema kon niet worden geladen. Kijk op
        <a href="https://www.dartvk.nl/" target="_blank" rel="noopener">dartvk.nl</a>.</div>`;
    }
    const msg = `Bijgewerkt ${timeAgo(SCHEDULE.fetchedAt)} van de site van de dartvereniging.`;
    if (scheduleStale()) {
      return `<div class="notice warn">${msg} Dat is al even geleden: controleer de datum op
        <a href="${esc(SCHEDULE.team.url)}" target="_blank" rel="noopener">Teambeheer</a>.</div>`;
    }
    return `<p class="muted small">${msg} Controleer bij twijfel altijd <a href="${esc(SCHEDULE.team.url)}" target="_blank" rel="noopener">Teambeheer</a>.</p>`;
  }

  // ------------------------------------------------------------ pages
  function pageHome() {
    const hero = MEDIA.albums.find((a) => a.id === "bekerfinale-2009");
    const heroImg = hero ? full(hero.photos[0].id) : "";
    const last = lastMatch();
    const albums = [...MEDIA.albums].filter((a) => a.photos[0].w >= 300);
    const picks = albums.sort(() => Math.random() - 0.5).slice(0, 3);
    return `
      <section class="hero">
        ${heroImg ? `<img src="${heroImg}" alt="Jos Tiebosch met de beker, bekerwinnaar 2009">` : ""}
        <div class="hero-body">
          <div class="eyebrow">Darter uit Beverwijk sinds 1983</div>
          <h1>${esc(SITE.name || "Jos Tiebosch")}</h1>
          <div class="motto">${esc(SITE.motto || "")}</div>
          <p class="lead">Ruim veertig jaar darten in Kennemerland: van mijn eerste toernooi in 1984 tot de Eredivisie met DC Sport 2.0 in café Sport.</p>
          <div class="btn-row">
            <a class="btn" href="#/erelijst">Bekijk de erelijst</a>
            <a class="btn ghost" href="#/fotos">Foto's</a>
          </div>
        </div>
      </section>

      <div class="stats">
        <div class="stat"><b>${PRIZES.length}</b><span>prijzen sinds ${firstYear}</span></div>
        <div class="stat"><b>${firsts.length}×</b><span>eerste prijs</span></div>
        <div class="stat"><b>${kpnWins.length}×</b><span>KPN-kampioen</span></div>
        <div class="stat"><b>${gkWins.length}×</b><span>winnaar Gesloten Kennemerland</span></div>
        <div class="stat"><b>${total180}</b><span>keer 180 op ${MEDIA.certificates180.length} certificaten</span></div>
      </div>

      <section class="section grid grid-2">
        ${SCHEDULE ? matchCard(nextMatch()) : `<div class="card">${staleNotice()}</div>`}
        <div class="card">
          <div class="eyebrow">Darts live</div>
          <div id="home-live" class="loading">Even kijken welk toernooi er nu bezig is…</div>
          ${last ? `<hr style="border:0;border-top:1px solid var(--line);margin:18px 0">
            <div class="eyebrow">Laatste uitslag ${esc(SCHEDULE.team.name)}</div>
            <p style="font-size:1.15rem;margin:0"><span class="res ${esc(last.result)}">${esc(last.result)}</span>
              ${esc(last.home)} – ${esc(last.away)} <b>${esc(last.score)}</b></p>
            <p class="muted small">${esc(longDate(last.date))}</p>` : ""}
        </div>
      </section>

      <section class="section">
        <div class="section-head"><h2>Hoogtepunten</h2><a href="#/erelijst">Alle ${PRIZES.length} prijzen →</a></div>
        <div class="grid grid-3">
          <a class="card album-card" href="#/erelijst?filter=gk">
            <div class="eyebrow">Gesloten Kennemerland</div>
            <h3>Winnaar in ${gkWins.join(", ")}</h3>
            <p>Het open kampioenschap van de regio. Daarnaast nog ${PRIZES.filter((p) => p.tags.includes("gk") && p.place > 1).length} keer op het podium.</p>
          </a>
          <a class="card album-card" href="#/erelijst?filter=kpn">
            <div class="eyebrow">KPN-kampioenschap</div>
            <h3>${kpnWins.length}× kampioen</h3>
            <p>${kpnWins.join(", ")}. En genomineerd voor KPN-sporter van het jaar 2005.</p>
          </a>
          <a class="card album-card" href="#/erelijst?filter=beker">
            <div class="eyebrow">Bekercompetitie</div>
            <h3>Bekerwinnaar ${cupWins.join(" en ")}</h3>
            <p>Met het team van café Sport de beker gewonnen, en vaker finalist.</p>
          </a>
        </div>
      </section>

      <section class="section">
        <div class="section-head"><h2>Uit het archief</h2><a href="#/fotos">Alle albums →</a></div>
        <div class="grid grid-3">${picks.map(albumCard).join("")}</div>
      </section>`;
  }

  function afterHome() {
    currentTournaments().then((list) => {
      const box = document.getElementById("home-live");
      if (!box) return;
      if (!list.length) {
        box.classList.remove("loading");
        box.innerHTML = `<p>Er is op dit moment geen groot toernooi bezig.</p><a class="btn ghost" href="#/live">Naar Darts live</a>`;
        return;
      }
      box.classList.remove("loading");
      box.innerHTML = `<h3><span class="live-dot"></span>${esc(list[0].label)}</h3>
        <p class="muted">Nu bezig. Volg de uitslagen per ronde.</p>
        <a class="btn" href="#/live">Bekijk de uitslagen</a>`;
    }).catch(() => {
      const box = document.getElementById("home-live");
      if (box) box.innerHTML = `<a class="btn ghost" href="#/live">Naar Darts live</a>`;
    });
  }

  function agendaCard() {
    if (!SCHEDULE || !SCHEDULE.icsUrl || !/^https:/.test(SCHEDULE.icsUrl)) return "";
    const webcal = SCHEDULE.icsUrl.replace(/^https:/, "webcal:");
    return `<section class="section card">
      <div class="eyebrow">Agenda die zichzelf bijwerkt</div>
      <h2 style="margin-top:4px">Alle wedstrijden in je telefoon</h2>
      <p>Met een agenda-abonnement staan alle wedstrijden van ${esc(SCHEDULE.team.name)} in de agenda van je telefoon of computer.
        Wordt een wedstrijd verzet, dan verandert hij daar vanzelf mee. Twee uur van tevoren krijg je een herinnering.</p>
      <div class="grid grid-2">
        <div>
          <h3>iPhone, iPad of Mac</h3>
          <p>Tik op de knop en kies <b>Abonneer</b>.</p>
          <a class="btn" href="${esc(webcal)}">Abonneer op de wedstrijden</a>
        </div>
        <div>
          <h3>Android of Google Agenda</h3>
          <p>Kopieer de link. Ga op de computer naar <a href="https://calendar.google.com/calendar/u/0/r/settings/addbyurl" target="_blank" rel="noopener">Google Agenda → Agenda toevoegen → Via URL</a>, plak de link en klik op Toevoegen. Daarna verschijnt hij ook op je telefoon.</p>
          <button class="btn ghost" id="copy-ics" data-url="${esc(SCHEDULE.icsUrl)}">Kopieer de link</button>
        </div>
      </div>
    </section>`;
  }

  function cupSection() {
    const cup = SCHEDULE && SCHEDULE.cup;
    if (!cup || !cup.rounds || !cup.rounds.length) return "";
    const ours = cup.matches.some((m) => m.ours);
    const rows = cup.matches.map((m) => `<tr class="${m.ours ? "us" : ""}">
      <td>${esc(m.pool)} · ronde ${esc(m.round.replace("b", ""))}</td><td>${m.date ? esc(shortDate(m.date)) : ""}</td>
      <td>${esc(m.home)} – ${esc(m.away)}</td><td class="num"><b>${esc(m.score && m.score !== "-" ? m.score : "")}</b></td></tr>`).join("");
    return `<section class="section">
      <div class="section-head"><h2>Bekercompetitie</h2><a href="${esc(cup.matches[0]?.url || "https://www.dartvk.nl/bekercompetitie/")}" target="_blank" rel="noopener">Alle bekerwedstrijden →</a></div>
      <p>${ours ? `${esc(SCHEDULE.team.name)} doet mee aan de beker.` : `${esc(SCHEDULE.team.name)} doet dit seizoen niet mee aan de beker.`}
        Hieronder de bekerwedstrijden van de teams van café Sport.</p>
      ${rows ? `<div class="table-wrap"><table class="data"><thead><tr><th>Poule</th><th>Datum</th><th>Wedstrijd</th><th class="num">Uitslag</th></tr></thead><tbody>${rows}</tbody></table></div>`
        : `<p class="muted">Nog geen bekerwedstrijden van café Sport gevonden.</p>`}
    </section>`;
  }

  function afterMatches() {
    const b = document.getElementById("copy-ics");
    if (!b) return;
    b.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(b.dataset.url); b.textContent = "Gekopieerd!"; }
      catch { prompt("Kopieer deze link:", b.dataset.url); }
    });
  }

  function pageMatches() {
    if (!SCHEDULE) return `<div class="page-head"><h1>Mijn wedstrijden</h1></div>${staleNotice()}`;
    const t = SCHEDULE.team;
    const nm = nextMatch();
    const p = SCHEDULE.player;
    const rows = SCHEDULE.matches.map((m) => {
      if (m.bye) return `<tr class="past"><td class="num">${m.round}</td><td colspan="4">Vrije week</td></tr>`;
      const past = !!m.score;
      const cls = m === nm ? "next" : past ? "past" : "";
      return `<tr class="${cls}">
        <td class="num">${m.round}</td>
        <td>${esc(shortDate(m.date))}<br><span class="muted small">${esc(DAYS[parseISO(m.date).getDay()])}${m.time ? " " + esc(m.time) : ""}</span></td>
        <td class="strong">${m.home === t.name ? `<b>${esc(m.home)}</b>` : esc(m.home)} – ${m.away === t.name ? `<b>${esc(m.away)}</b>` : esc(m.away)}
          <br><span class="muted small">${m.isHome ? "thuis" : "uit"}${m.location && !m.isHome ? " · " + esc(m.location) : ""}</span></td>
        <td class="num strong">${m.score ? esc(m.score) : ""}</td>
        <td>${m.result ? `<span class="res ${esc(m.result)}" title="${{ W: "gewonnen", V: "verloren", G: "gelijk" }[m.result]}">${esc(m.result)}</span>` : ""}</td>
      </tr>`;
    }).join("");
    const stand = SCHEDULE.standings.map((s) => `<tr class="${s.isUs ? "us" : ""}">
        <td class="num">${s.pos}</td><td>${esc(s.team)}</td><td class="num">${esc(s.played)}</td>
        <td class="num">${esc(s.won)}</td><td class="num">${esc(s.drawn)}</td><td class="num">${esc(s.lost)}</td>
        <td class="num"><b>${esc(s.points)}</b></td><td class="num">${esc(s.legs)}</td></tr>`).join("");
    const special = SCHEDULE.specials.reduce((o, s) => ((o[s.name] = s), o), {});
    const players = SCHEDULE.players.map((pl) => `<tr class="${p && pl.id === p.id ? "us" : ""}">
        <td>${esc(pl.name)} ${pl.role ? `<span class="badge">${pl.role === "C" ? "captain" : "reserve-captain"}</span>` : ""}</td>
        <td class="num">${esc(pl.singles)}</td><td class="num">${esc(pl.win)}</td>
        <td class="num">${esc(special[pl.name]?.n180 || "")}</td><td class="num">${esc(special[pl.name]?.finish || "")}</td></tr>`).join("");
    return `
      <div class="page-head">
        <div class="eyebrow">Seizoen 20${esc(SCHEDULE.season.replace("-", "–20"))}</div>
        <h1>Mijn wedstrijden</h1>
        <p>${esc(t.name)} speelt in de ${esc(t.division)} van Dartvereniging Kennemerland. Thuis in ${esc(t.venue.split(",")[0])}.</p>
        ${staleNotice()}
      </div>
      <div class="grid grid-2">
        ${matchCard(nm, true)}
        ${p ? (() => {
          const cs = currentSeasonStats();
          return `<div class="card">
          <div class="eyebrow">Jos dit seizoen</div>
          <div class="stats" style="margin:8px 0 12px">
            <div class="stat"><b>${cs ? cs.n180 : esc(p.n180 || "0")}</b><span>keer 180</span></div>
            <div class="stat"><b>${cs ? `${cs.sW}-${cs.sV}` : esc(p.singlesWin || "0") + "%"}</b><span>singles gewonnen-verloren</span></div>
            <div class="stat"><b>${cs ? `${cs.pW}-${cs.pV}` : esc(p.pairsWin || "0") + "%"}</b><span>koppels gewonnen-verloren</span></div>
          </div>
          ${p.longestStreak ? `<p>Langste reeks gewonnen singles ooit: <b>${esc(p.longestStreak)}</b></p>` : ""}
          <div class="btn-row"><a class="btn ghost" href="#/statistieken">Alle statistieken</a>
            <a class="btn ghost" href="${esc(p.url)}" target="_blank" rel="noopener">Op Teambeheer</a></div>
        </div>`;
        })() : ""}
      </div>

      ${agendaCard()}

      <section class="section">
        <div class="section-head"><h2>Programma en uitslagen</h2></div>
        <div class="table-wrap"><table class="data">
          <thead><tr><th class="num">#</th><th>Datum</th><th>Wedstrijd</th><th class="num">Uitslag</th><th></th></tr></thead>
          <tbody>${rows}</tbody></table></div>
      </section>

      <section class="section grid grid-2">
        <div>
          <h2>Stand ${esc(t.division)}</h2>
          <div class="table-wrap"><table class="data">
            <thead><tr><th class="num">#</th><th>Team</th><th class="num">Ges.</th><th class="num">W</th><th class="num">G</th><th class="num">V</th><th class="num">Ptn</th><th class="num">Legs</th></tr></thead>
            <tbody>${stand}</tbody></table></div>
        </div>
        <div>
          <h2>Het team</h2>
          <div class="table-wrap"><table class="data">
            <thead><tr><th>Speler</th><th class="num">Singles</th><th class="num">Winst</th><th class="num">180</th><th class="num">Finish</th></tr></thead>
            <tbody>${players}</tbody></table></div>
          <p class="muted small">De cijfers in deze tabel komen rechtstreeks van Teambeheer en lopen soms wat achter.</p>
        </div>
      </section>

      ${cupSection()}

      <section class="section grid grid-2" style="align-items:start">
        <div>
          <h2>Agenda van de dartvereniging</h2>
          ${(SCHEDULE.agenda || []).length ? `<div class="table-wrap"><table class="data"><tbody>
            ${SCHEDULE.agenda.map((e) => `<tr><td>${esc(longDate(e.date))}<br><span class="muted small">${esc(e.time)} uur</span></td>
              <td><a href="${esc(e.url)}" target="_blank" rel="noopener" style="color:var(--text)"><b>${esc(e.title)}</b></a>${e.location ? `<br><span class="muted small">${esc(e.location)}</span>` : ""}</td></tr>`).join("")}
          </tbody></table></div>
          <p class="muted small">Rankings en toernooien van dartvk.nl.</p>` : `<p>Geen activiteiten gevonden. Kijk op <a href="https://www.dartvk.nl/agenda/" target="_blank" rel="noopener">dartvk.nl/agenda</a>.</p>`}
        </div>
        <div>
          <h2>${esc(t.name)} door de jaren heen</h2>
          ${(SCHEDULE.teamHistory || []).length ? `<div class="table-wrap"><table class="data">
            <thead><tr><th>Seizoen</th><th>Team</th><th>Divisie</th><th class="num">Eindstand</th></tr></thead><tbody>
            ${SCHEDULE.teamHistory.map((h) => `<tr><td>${esc(seasonLabel(h.season))}</td><td>${esc(h.team)}</td><td>${esc(h.division === "Ere" ? "Eredivisie" : h.division)}</td>
              <td class="num">${h.pos && h.pos !== "0" ? `<b>${esc(h.pos)}e</b>` : h.season === SCHEDULE.season ? "bezig" : "–"}</td></tr>`).join("")}
          </tbody></table></div>` : ""}
        </div>
      </section>

      <details class="wsec">
        <summary>Officiële pagina van Teambeheer</summary>
        <div style="padding:0 18px 18px">
          <p class="muted small">Dit is de pagina die de dartvereniging zelf ook laat zien.</p>
          <iframe src="${esc(t.url)}" title="Teambeheer ${esc(t.name)}" style="width:100%;height:900px;border:0;background:#fff;border-radius:8px" loading="lazy"></iframe>
        </div>
      </details>`;
  }

  // ------------------------------------------------------------ prizes
  function pagePrizes(query) {
    const filter = query.get("filter") || "all";
    const count = (key) => (key === "all" ? PRIZES.length : key === "p1" ? firsts.length : PRIZES.filter((p) => p.tags.includes(key)).length);
    return `
      <div class="page-head">
        <h1>Erelijst</h1>
        <p>Alle ${PRIZES.length} prijzen van Jos, van de 3e plaats in De Stapper in ${firstYear} tot nu. Kies een onderdeel of zoek op café of toernooi.</p>
      </div>
      <div class="chips" role="group" aria-label="Filter">
        ${TAGS.filter(([k]) => count(k)).map(([k, label]) => `<button class="chip" data-filter="${k}" aria-pressed="${k === filter}">${label}<span class="n">${count(k)}</span></button>`).join("")}
      </div>
      <input class="search" type="search" placeholder="Zoek, bijvoorbeeld Oliebollen of De Zien" aria-label="Zoeken in de erelijst">
      <p class="muted small" id="prize-count"></p>
      <div id="prize-list"></div>
      <div class="notice">Bijgewerkt tot en met ${esc(PRIZES.length ? MONTHS[parseISO(PRIZES[PRIZES.length - 1].date).getMonth()] + " " + PRIZES[PRIZES.length - 1].date.slice(0, 4) : "")}, met de prijzenlijst die Jos zelf bijhoudt. Nieuwe prijzen komen er gewoon bij.</div>`;
  }

  function afterPrizes(query) {
    let filter = query.get("filter") || "all";
    let term = "";
    const list = document.getElementById("prize-list");
    const countEl = document.getElementById("prize-count");
    const render = () => {
      const t = term.toLowerCase();
      const items = PRIZES.filter((p) => (filter === "all" || (filter === "p1" ? p.place === 1 : p.tags.includes(filter))))
        .filter((p) => !t || `${p.event} ${p.venue} ${p.date.slice(0, 4)}`.toLowerCase().includes(t));
      const byYear = {};
      items.forEach((p) => (byYear[p.date.slice(0, 4)] ||= []).push(p));
      countEl.textContent = `${items.length} ${items.length === 1 ? "prijs" : "prijzen"}, waarvan ${items.filter((p) => p.place === 1).length} keer de eerste.`;
      list.innerHTML = Object.keys(byYear).sort().reverse().map((y) => `
        <div class="year-block"><h3>${y}</h3><div>
          ${byYear[y].slice().reverse().map((p) => {
            const a = p.album && albumById(p.album);
            return `<div class="prize">
              <div class="medal p${p.place}" title="${placeLabel(p.place)} prijs">${placeLabel(p.place)}</div>
              <div class="date">${esc(shortDate(p.date))}</div>
              <div class="what"><b>${esc(p.event || "Toernooi")}</b><span>${esc([p.venue, p.note].filter(Boolean).join(" · "))}</span></div>
              ${a ? `<a class="cam" href="#/fotos/${esc(a.id)}">📷 Foto's</a>` : "<span></span>"}
            </div>`;
          }).join("")}
        </div></div>`).join("") || `<p>Niets gevonden.</p>`;
    };
    document.querySelectorAll(".chip").forEach((b) => b.addEventListener("click", () => {
      filter = b.dataset.filter;
      document.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", c === b));
      history.replaceState(null, "", `#/erelijst${filter === "all" ? "" : "?filter=" + filter}`);
      render();
    }));
    document.querySelector(".search").addEventListener("input", (e) => { term = e.target.value; render(); });
    render();
  }

  // ------------------------------------------------------------ certificates
  function pageCertificates() {
    const certs = MEDIA.certificates180;
    // Certificates up to 2011, Teambeheer counts from 2017-18 on.
    const counts = Object.fromEntries(certs.map((c) => [c.season, { n: c.count, src: "cert" }]));
    (STATS ? STATS.seasons : []).forEach((se) => {
      const label = seasonLabel(se.season);
      if (!counts[label]) counts[label] = { n: se.matches.reduce((s, m) => s + (m.n180 || 0), 0), src: "tb", live: SCHEDULE && se.season === SCHEDULE.season };
    });
    const startYear = 1989;
    const endYear = Math.max(...Object.keys(counts).map((s) => Number(s.slice(0, 4))));
    const seasons = [];
    for (let y = startYear; y <= endYear; y++) seasons.push(`${y}-${y + 1}`);
    const max = Math.max(...Object.values(counts).map((c) => c.n));
    const best = certs.reduce((a, b) => (b.count > a.count ? b : a));
    const tbTotal = Object.values(counts).filter((c) => c.src === "tb").reduce((s, c) => s + c.n, 0);
    const gapTitle = (s) => (s === "2020-2021" ? "corona: geen competitie" : "geen gegevens bewaard");
    return `
      <div class="page-head">
        <h1>Certificaten</h1>
        <p>Elk seizoen reikte de Dartvereniging Kennemerland een certificaat uit voor het aantal keer 180 in de competitie.
        Samen goed voor <b>${total180} keer 180</b>. Het topseizoen was ${esc(best.season)} met ${best.count} stuks.
        ${tbTotal ? `Sinds 2017-2018 houdt Teambeheer het bij: nog eens <b>${tbTotal} keer 180</b>.` : ""}</p>
      </div>
      <div class="card">
        <h3>Aantal keer 180 per seizoen</h3>
        <div class="bars" style="--n:${seasons.length}">
          ${seasons.map((s) => counts[s]
            ? `<div class="bar ${counts[s].src === "tb" ? "alt" : ""}" style="height:${Math.max((counts[s].n / max) * 100, 2)}%" title="${s}: ${counts[s].n}× 180${counts[s].live ? " (seizoen loopt nog)" : ""}"><span>${counts[s].n}${counts[s].live ? "…" : ""}</span></div>`
            : `<div class="bar gap" style="height:12%" title="${s}: ${gapTitle(s)}"></div>`).join("")}
        </div>
        <div class="bar-labels" style="--n:${seasons.length}">${seasons.map((s) => `<div>'${s.slice(2, 4)}</div>`).join("")}</div>
        <p class="muted small" style="margin-top:10px">
          <span class="legend-dot"></span> certificaat &nbsp; <span class="legend-dot alt"></span> Teambeheer &nbsp; gearceerd: geen gegevens (2020-2021: corona).
          ${counts[seasonLabel(SCHEDULE ? SCHEDULE.season : "00-01")]?.live ? "Het lopende seizoen is nog niet af." : ""}</p>
      </div>

      <section class="section">
        <h2>180-certificaten</h2>
        <div class="gallery" data-gallery="c180">
          ${certs.map((c, i) => `<button class="tile contain" data-i="${i}">
            <img src="${thumb(c.id)}" alt="180 certificaat ${esc(c.season)}" loading="lazy">
            <span class="cap"><b>${c.count}× 180</b> · ${esc(c.season)}</span></button>`).join("")}
        </div>
      </section>

      <section class="section">
        <h2>Oorkondes en andere certificaten</h2>
        <div class="gallery" data-gallery="cother">
          ${MEDIA.certificatesOther.map((c, i) => `<button class="tile contain" data-i="${i}">
            <img src="${thumb(c.id)}" alt="${esc(c.title)}" loading="lazy">
            <span class="cap"><b>${esc(c.title)}</b>${c.year ? " · " + esc(c.year) : ""}</span></button>`).join("")}
        </div>
      </section>`;
  }

  function afterCertificates() {
    bindGallery("c180", MEDIA.certificates180.map((c) => ({ id: c.id, caption: `${c.count}× 180 in het seizoen ${c.season}${c.date ? " (uitgereikt " + c.date + ")" : ""}` })));
    bindGallery("cother", MEDIA.certificatesOther.map((c) => ({ id: c.id, caption: `${c.title}. ${c.caption}` })));
  }

  // ------------------------------------------------------------ photos
  function albumCard(a) {
    return `<a class="album-card" href="#/fotos/${esc(a.id)}">
      <div class="cover"><img src="${thumb(a.photos[0].id)}" alt="" loading="lazy"></div>
      <h3>${esc(a.title)}</h3><p>${a.date ? esc(a.date) + " · " : ""}${a.photos.length} foto's</p></a>`;
  }

  function pagePhotos() {
    const kpn = MEDIA.albums.filter((a) => a.kpn);
    const rest = MEDIA.albums.filter((a) => !a.kpn);
    return `
      <div class="page-head"><h1>Foto's</h1>
        <p>Toernooien, uitwisselingen, prijsuitreikingen en de bekerkast. Klik op een album en daarna op een foto om hem groot te zien.</p></div>
      <section class="section"><h2>Toernooien en uitjes</h2><div class="grid grid-3">${rest.map(albumCard).join("")}</div></section>
      <section class="section"><h2>KPN-kampioenschappen</h2><div class="grid grid-3">${kpn.map(albumCard).join("")}</div></section>
      <section class="section"><h2>Filmpjes</h2><div class="grid grid-3">
        ${MEDIA.videos.map((v) => `<a class="video" href="https://www.youtube.com/watch?v=${esc(v.youtube)}" target="_blank" rel="noopener">
          <div class="thumb"><img src="https://i.ytimg.com/vi/${esc(v.youtube)}/hqdefault.jpg" alt="" loading="lazy"></div>
          <h3>${esc(v.title)}</h3></a>`).join("")}
      </div><p class="muted small">De filmpjes openen op YouTube.</p></section>`;
  }

  function pageAlbum(id) {
    const a = albumById(id);
    if (!a) return pageNotFound();
    const prizes = PRIZES.filter((p) => p.album === id);
    return `
      <p><a href="#/fotos">← Alle albums</a></p>
      <div class="page-head">${a.date ? `<div class="eyebrow">${esc(a.date)}</div>` : ""}<h1>${esc(a.title)}</h1><p>${esc(a.intro || "")}</p>
        ${prizes.map((p) => `<p><span class="medal p${p.place}" style="display:inline-grid;width:34px;height:34px;font-size:.8rem;vertical-align:middle">${placeLabel(p.place)}</span>
          ${esc(p.event)} · ${esc(longDate(p.date, false))}</p>`).join("")}
      </div>
      <div class="gallery" data-gallery="album">
        ${a.photos.map((ph, i) => `<button class="tile" data-i="${i}"><img src="${thumb(ph.id)}" alt="${esc(ph.caption)}" loading="lazy">
          ${ph.caption ? `<span class="cap">${esc(ph.caption)}</span>` : ""}</button>`).join("")}
      </div>
      ${a.photos.some((p) => p.w < 400) ? `<p class="muted small" style="margin-top:14px">Van een deel van deze foto's is alleen een kleine versie bewaard gebleven.</p>` : ""}`;
  }

  function afterAlbum(id) {
    const a = albumById(id);
    if (a) bindGallery("album", a.photos.map((p) => ({ id: p.id, caption: p.caption || a.title })));
  }

  // ------------------------------------------------------------ clippings
  function pageClippings() {
    return `
      <div class="page-head"><h1>Knipsels</h1>
        <p>Krantenartikelen en het interview in het KPN-blad. Klik om te lezen; klik in de grote weergave nog een keer om in te zoomen.</p></div>
      <div class="gallery" data-gallery="clip">
        ${MEDIA.clippings.map((c, i) => `<button class="tile contain tall" data-i="${i}"><img src="${thumb(c.id)}" alt="${esc(c.title)}" loading="lazy">
          <span class="cap">${esc(c.title)}</span></button>`).join("")}
      </div>`;
  }

  function afterClippings() {
    bindGallery("clip", MEDIA.clippings.map((c) => ({ id: c.id, caption: c.title, zoomable: true })));
  }

  // ------------------------------------------------------------ about
  function pageAbout() {
    const portrait = MEDIA.portraits["portret-2007"];
    const attic = MEDIA.portraits["zolder"];
    const team = SCHEDULE ? `${SCHEDULE.team.name} (${SCHEDULE.team.division})` : "DC Sport 2.0";
    return `
      <div class="page-head"><h1>Over mij</h1></div>
      <div class="grid grid-2" style="align-items:start">
        <div class="card">
          ${portrait ? `<img src="${full(portrait.id)}" alt="${esc(portrait.caption)}" style="border-radius:10px;margin-bottom:18px">` : ""}
          <dl class="facts">
            <dt>Naam</dt><dd>Jos Tiebosch</dd>
            <dt>Woonplaats</dt><dd>Beverwijk</dd>
            <dt>Dart sinds</dt><dd>1983</dd>
            <dt>Pijlen</dt><dd>21 gram</dd>
            <dt>Team</dt><dd>${esc(team)}</dd>
            <dt>Speelgelegenheid</dt><dd>Café Sport, Beverwijk</dd>
            <dt>Motto</dt><dd>Cool, Calm &amp; Collected</dd>
          </dl>
        </div>
        <div class="letter">
          <p>Beste lezer, ik heb deze website opgezet omdat het me leuk leek om iets over mijn dartcarrière (als je het tenminste een carrière mag noemen) te vertellen en wat nostalgische plaatjes te laten zien.</p>
          <p>Voor zover ik me kan herinneren, het is namelijk al heel lang geleden, ben ik ongeveer in 1983 begonnen met darten. Eerst heb ik enige tijd in café De Smidse (het huidige café Jan &amp; Syl) in de Brandsteeg gespeeld, waar ik aan mijn eerste toernooi heb deelgenomen. Daarna zijn we verhuisd naar café De Stapper in de Zeestraat, waar ik geruime tijd heb gespeeld. Hier werd ook al een beetje duidelijk dat ik het spelletje best goed beheerste.</p>
          <p>Helaas moest De Stapper op een gegeven moment sluiten, waardoor we op zoek moesten naar een andere speelgelegenheid. Na een blauwe maandag in de Scottish Piper Club in de Baanstraat zijn we uiteindelijk bij café Sport terechtgekomen. Vele goede jaren volgden, totdat ik na wat onenigheid besloot om met darten te stoppen. Gelukkig dachten ze daar bij De Schaker anders over en werd ik gevraagd om daar te komen spelen. Uiteraard was ik zeer vereerd en maakte ik de overstap.</p>
          <p>Na enkele jaren zijn we ook daar weer weggegaan om bij café Old Fashion in Wijk aan Zee te gaan spelen. Maar aan alles komt een eind, dus ook aan café Old Fashion. In onze zoektocht naar een nieuwe speelgelegenheid kwamen we uit bij café De Wijkermolen aan de Schans in Beverwijk. Na een paar jaar hadden we het ook hier wel weer gezien en zijn we wederom bij café Sport terechtgekomen, waar we nog steeds met veel plezier spelen.</p>
          <p><b>Groetjes, Jos</b></p>
          ${attic ? `<img src="${full(attic.id)}" alt="Jos aan het darten op zolder" style="border-radius:10px;max-width:320px;margin-top:10px">` : ""}
        </div>
      </div>`;
  }

  // ------------------------------------------------------------ live darts (Wikipedia + feeds)
  const WIKI_CACHE = {};
  async function wapi(host, params) {
    const url = `https://${host}/w/api.php?${params}&format=json&formatversion=2&origin=*`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status);
    return res.json();
  }

  async function currentTournaments() {
    if (WIKI_CACHE.current && Date.now() - WIKI_CACHE.current.at < 5 * 60000) return WIKI_CACHE.current.list;
    const d = await wapi("en.wikipedia.org", "action=query&list=categorymembers&cmtitle=Category:Current_sports_events&cmlimit=500");
    const titles = d.query.categorymembers.map((m) => m.title).filter((t) => /dart/i.test(t));
    let list = [];
    if (titles.length) {
      const ll = await wapi("en.wikipedia.org", `action=query&prop=langlinks&lllang=nl&titles=${encodeURIComponent(titles.join("|"))}`);
      list = ll.query.pages.map((p) => {
        const nl = p.langlinks && p.langlinks[0] && p.langlinks[0].title;
        return { en: p.title, nl, label: nl || p.title, host: nl ? "nl.wikipedia.org" : "en.wikipedia.org", title: nl || p.title };
      });
    }
    WIKI_CACHE.current = { at: Date.now(), list };
    return list;
  }

  function cleanWiki(html, host) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("script, style, link, meta, .mw-editsection, sup.reference, .reference, .reflist, .navbox, .metadata, .ambox, .hatnote, .noprint, .mw-references-wrap").forEach((n) => n.remove());
    doc.querySelectorAll("img").forEach((img) => {
      ["src", "srcset"].forEach((attr) => {
        const v = img.getAttribute(attr);
        if (v) img.setAttribute(attr, v.replace(/(^|\s|,)\/\//g, "$1https://"));
      });
    });
    doc.querySelectorAll("a").forEach((a) => {
      const href = a.getAttribute("href") || "";
      if (href.startsWith("/")) a.setAttribute("href", `https://${host}${href}`);
      else if (href.startsWith("#")) { a.removeAttribute("href"); return; }
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener");
    });
    return doc.querySelector(".mw-parser-output") || doc.body;
  }

  // Split parsed article at every h2/h3/h4 into sections [{title, parent, nodes}]
  function splitSections(root) {
    const sections = [{ title: "Overzicht", parent: "", level: 1, nodes: [] }];
    let parent = "";
    [...root.children].forEach((el) => {
      const h = /^H[2-4]$/.test(el.tagName) ? el : el.classList.contains("mw-heading") ? el.querySelector("h2,h3,h4") : null;
      if (h) {
        const level = Number(h.tagName[1]);
        if (level === 2) parent = h.textContent.trim();
        sections.push({ title: h.textContent.trim(), parent: level === 2 ? "" : parent, level, nodes: [] });
      } else sections[sections.length - 1].nodes.push(el);
    });
    return sections;
  }

  const RESULT_SECTIONS = /groep|knock|finale|schema|eindfase|ronde|uitslag|wedstrijden|loting|toernooioverzicht|draw|stage|final|result|bracket|round|group/i;
  const KNOCKOUT = /knock|eindfase|schema|finale|bracket|final/i;
  const MONTHS_SHORT = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
  const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  async function renderTournament(t, box) {
    const d = await wapi(t.host, `action=parse&page=${encodeURIComponent(t.title)}&prop=text|revid&redirects=1&disableeditsection=1`);
    const root = cleanWiki(d.parse.text, t.host);
    const sections = splitSections(root);
    const intro = sections[0].nodes.find((n) => n.tagName === "P" && n.textContent.trim().length > 40);
    const hasTable = (s) => s.nodes.some((n) => n.tagName === "TABLE" || n.querySelector?.("table"));
    const shown = sections.slice(1).filter((s) => (RESULT_SECTIONS.test(s.title) || RESULT_SECTIONS.test(s.parent)) && hasTable(s));
    // Open what is being played today (Wikipedia writes "15 nov." or "15 November"), else the knock-out stage.
    const n = new Date();
    const todayRx = new RegExp(`\\b${n.getDate()}\\s+(${MONTHS_SHORT[n.getMonth()]}|${MONTHS[n.getMonth()]}|${MONTHS_EN[n.getMonth()]})`, "i");
    const isToday = (s) => s.nodes.some((node) => todayRx.test(node.textContent));
    let openSet = new Set(shown.filter(isToday));
    if (!openSet.size) { const k = shown.find((s) => KNOCKOUT.test(s.title)); if (k) openSet.add(k); }
    if (!openSet.size && shown[0]) openSet.add(shown[0]);
    const pageUrl = `https://${t.host}/wiki/${encodeURIComponent(t.title.replace(/ /g, "_"))}`;
    box.innerHTML = `
      <div class="card" style="margin-bottom:12px">
        <h2 style="margin:0 0 6px"><span class="live-dot"></span>${esc(t.label)}</h2>
        ${intro ? `<p>${esc(intro.textContent.trim().slice(0, 420))}${intro.textContent.length > 420 ? "…" : ""}</p>` : ""}
        <p class="muted small">Bron: <a href="${pageUrl}" target="_blank" rel="noopener">Wikipedia</a> (CC BY-SA 4.0), opgehaald om ${new Date().toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}.
          Vrijwilligers werken de uitslagen meestal binnen enkele minuten na een partij bij.</p>
      </div>
      ${openSet.size && [...openSet].some(isToday) ? `<p class="muted">Open geklapt: wat er vandaag gespeeld wordt. Klik op een kopje om de rest te zien.</p>` : ""}
      ${shown.map((s, i) => `<details class="wsec" ${openSet.has(s) ? "open" : ""}><summary>${isToday(s) ? `<span class="live-dot"></span>` : ""}${esc(s.title)}</summary><div class="wiki" data-sec="${i}"></div></details>`).join("")
        || `<p>Nog geen uitslagen. <a href="${pageUrl}" target="_blank" rel="noopener">Bekijk de pagina op Wikipedia</a>.</p>`}`;
    const dutch = dutchBlock(root, todayRx);
    shown.forEach((s, i) => {
      const target = box.querySelector(`[data-sec="${i}"]`);
      s.nodes.forEach((n) => target.appendChild(n));
    });
    if (dutch) box.querySelector(".card").insertAdjacentHTML("afterend", dutch);
  }

  // Dutch players: find every flag of the Netherlands, then the table rows (matches) they appear in.
  const NL_FLAG = /Flag_of_the_Netherlands/i;
  function dutchBlock(root, todayRx) {
    const names = new Set();
    const isFlag = (n) => n.nodeType === 1 && (n.tagName === "IMG" || n.querySelector?.("img")) && /flag/i.test(n.innerHTML || n.getAttribute?.("src") || "");
    const nameLink = (n) => (n.nodeType === 1 ? (n.tagName === "A" && !n.querySelector("img") ? n : n.querySelector?.("a:not(:has(img))")) : null);
    root.querySelectorAll("img").forEach((img) => {
      if (!NL_FLAG.test(img.getAttribute("src") || "")) return;
      // The flag icon sits in a <span class="flagicon"> next to the player's link, either before or after it.
      // Look on the same "line" only: stop at a <br> or at another flag.
      const anchor = img.closest('[typeof="mw:File"], .flagicon') || img.closest("a") || img;
      const walk = (dir) => {
        for (let n = anchor[dir]; n; n = n[dir]) {
          if (n.nodeType === 1 && n.tagName === "BR") return null;
          if (isFlag(n)) return null;
          const a = nameLink(n);
          if (a) return a;
        }
        return null;
      };
      const link = walk("nextSibling") || walk("previousSibling");
      const name = link && link.textContent.trim();
      if (name && name.length > 3 && !/^\d/.test(name)) names.add(name);
    });
    if (!names.size) return "";
    const scoreRx = /\b\d{1,2}\s*[–-]\s*\d{1,2}\b/;
    const seen = new Set(), rows = [];
    root.querySelectorAll("tr").forEach((tr) => {
      if (![...tr.querySelectorAll("img")].some((i) => NL_FLAG.test(i.getAttribute("src") || ""))) return;
      const cells = [...tr.children].map((c) => c.textContent.replace(/\s+/g, " ").trim()).filter(Boolean);
      const text = cells.join("  ·  ");
      if (!scoreRx.test(text) || cells.length < 3 || seen.has(text)) return;
      seen.add(text);
      rows.push({ text, today: todayRx.test(text) });
    });
    const shownRows = [...rows.filter((r) => r.today), ...rows.filter((r) => !r.today)].slice(0, 24);
    return `<div class="card nl-block" style="margin-bottom:12px">
      <h3>🇳🇱 Nederlanders in dit toernooi</h3>
      <p>${[...names].map((n) => `<span class="badge" style="margin:2px">${esc(n)}</span>`).join(" ")}</p>
      ${shownRows.length ? `<ul class="news-list">${shownRows.map((r) => `<li>${r.today ? `<span class="live-dot"></span><b>vandaag</b> · ` : ""}${esc(r.text)}</li>`).join("")}</ul>
        <p class="muted small">Partijen met een Nederlander, uit de tabellen hieronder. Vandaag gespeelde partijen staan bovenaan.</p>` : ""}
    </div>`;
  }

  async function renderRankings(box) {
    const d = await wapi("nl.wikipedia.org", "action=parse&page=PDC_Order_of_Merit&prop=text&redirects=1&disableeditsection=1");
    const root = cleanWiki(d.parse.text, "nl.wikipedia.org");
    const table = root.querySelector("table.wikitable");
    if (!table) throw new Error("no table");
    const rows = [...table.querySelectorAll("tr")];
    rows.slice(33).forEach((r) => r.remove());
    box.innerHTML = "";
    box.appendChild(table);
    box.insertAdjacentHTML("beforeend", `<p class="muted small">Top 32. Bron: <a href="https://nl.wikipedia.org/wiki/PDC_Order_of_Merit" target="_blank" rel="noopener">Wikipedia</a> (CC BY-SA 4.0).</p>`);
  }

  const newsList = (items, empty) => items.length
    ? `<ul class="news-list">${items.map((i) => `<li><a href="${esc(i.link)}" target="_blank" rel="noopener">${esc(i.title)}</a>
        <time>${i.date && !isNaN(new Date(i.date)) ? esc(new Date(i.date).toLocaleString("nl-NL", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })) : ""}</time></li>`).join("")}</ul>`
    : `<p class="muted">${empty}</p>`;

  function pageLive() {
    return `
      <div class="page-head">
        <div class="eyebrow">Profdarts</div>
        <h1>Darts live</h1>
        <p>Wat er nu gebeurt in de dartswereld: het toernooi dat bezig is met alle uitslagen, de wereldranglijst en het laatste nieuws.</p>
        <div class="btn-row"><button class="btn" id="refresh">Nu verversen</button></div>
      </div>
      <section id="live-now" class="section"><p class="loading">Even kijken welk toernooi er nu bezig is…</p></section>

      <section class="section grid grid-2" style="align-items:start">
        <div class="card"><h2>Nieuws (NOS)</h2>${newsList(NEWS.nos || [], "Op dit moment geen dartsnieuws bij de NOS.")}</div>
        <div class="card"><h2>Nieuws van de PDC</h2>${newsList((NEWS.pdc || []).slice(0, 8), "Geen PDC-nieuws gevonden.")}</div>
      </section>

      ${(NEWS.videos || []).length ? `<section class="section"><h2>Nieuwste filmpjes van de PDC</h2><div class="grid grid-3">
        ${NEWS.videos.slice(0, 6).map((v) => `<a class="video" href="${esc(v.link)}" target="_blank" rel="noopener">
          <div class="thumb"><img src="https://i.ytimg.com/vi/${esc(v.videoId)}/hqdefault.jpg" alt="" loading="lazy"></div><h3>${esc(v.title)}</h3></a>`).join("")}
      </div></section>` : ""}

      <section class="section grid grid-2" style="align-items:start">
        <div>
          <h2>Wereldranglijst (PDC Order of Merit)</h2>
          <details class="wsec" open><summary>Top 32</summary><div class="wiki" id="rankings"><p class="loading">Ranglijst laden…</p></div></details>
        </div>
        <div>
          <h2>Pijl voor pijl meekijken</h2>
          <p>Echte live scores (elke worp, elke leg) mogen we niet gratis op een eigen website zetten. Daarvoor zijn deze apps en sites het handigst:</p>
          <div class="link-list">
            <a href="https://www.pdc.tv/" target="_blank" rel="noopener">PDC (officieel) <span>nieuws, uitslagen en de PDC-app</span></a>
            <a href="https://www.pdc.tv/calendar/" target="_blank" rel="noopener">PDC-kalender <span>alle toernooien van het jaar</span></a>
            <a href="https://www.flashscore.nl/darts/" target="_blank" rel="noopener">Flashscore darts <span>live scores per leg</span></a>
            <a href="https://nos.nl/sport/darts" target="_blank" rel="noopener">NOS darts <span>Nederlands nieuws</span></a>
            <a href="https://www.dartvk.nl/" target="_blank" rel="noopener">Dartvereniging Kennemerland <span>competitie en toernooien in de regio</span></a>
          </div>
          ${NEWS.fetchedAt ? `<p class="muted small" style="margin-top:12px">Nieuws bijgewerkt ${esc(timeAgo(NEWS.fetchedAt))}.</p>` : ""}
        </div>
      </section>`;
  }

  let liveTimer = null;
  function afterLive() {
    const load = async () => {
      const box = document.getElementById("live-now");
      if (!box) return;
      try {
        WIKI_CACHE.current = null;
        const list = await currentTournaments();
        if (!list.length) {
          box.innerHTML = `<div class="card"><h2>Er is nu geen groot toernooi bezig</h2>
            <p>Zodra er een toernooi begint (bijvoorbeeld het WK in december), verschijnen hier automatisch alle uitslagen.
            Kijk in de tussentijd op de <a href="https://www.pdc.tv/calendar/" target="_blank" rel="noopener">PDC-kalender</a>.</p></div>`;
          return;
        }
        box.innerHTML = list.map((_, i) => `<div data-t="${i}"><p class="loading">Uitslagen laden…</p></div>`).join("");
        await Promise.all(list.map((t, i) => renderTournament(t, box.querySelector(`[data-t="${i}"]`))));
      } catch (e) {
        box.innerHTML = `<div class="notice warn">De uitslagen konden niet worden geladen (geen internet?). Probeer het straks nog eens.</div>`;
      }
    };
    load();
    renderRankings(document.getElementById("rankings")).catch(() => {
      document.getElementById("rankings").innerHTML = `<p>De ranglijst kon niet worden geladen.</p>`;
    });
    document.getElementById("refresh").addEventListener("click", load);
    liveTimer = setInterval(load, 5 * 60000);
  }

  // ------------------------------------------------------------ statistics page
  const EVENT_GROUPS = [
    ["Oliebollentoernooi", /oliebollen/i], ["Aardbeientoernooi", /aardbei/i], ["Snerttoernooi", /snert/i],
    ["Oranjetoernooi", /oranje/i], ["Gesloten Kennemerland", /gesloten kennemerland/i], ["KPN-kampioenschap", /\bkpn\b/i],
    ["Kiwanis-toernooi", /kiwanis/i], ["Clubkampioenschap", /clubkampioen/i], ["Zomercompetitie", /zomercompetitie/i],
    ["HLM Ranking", /hlm ranking/i], ["DVK Ranking", /dvk (master )?ranking/i], ["Foster Parents Toernooi", /foster/i],
    ["Zomerranking", /zomerranking|midzomer/i], ["Bekercompetitie", /beker/i], ["Koppeltoernooi", /koppel/i], ["Tac-Tics", /tac-?tics/i],
  ];
  const venueName = (v) => (v || "").replace(/\s*\(.*\)$/, "") || "onbekend";

  function barChart(items, opts = {}) {
    const max = Math.max(...items.map((i) => i.value), 1);
    return `<div class="bars" style="--n:${items.length};height:${opts.height || 160}px">
      ${items.map((i) => `<div class="bar ${i.cls || ""}" style="height:${i.value ? Math.max((i.value / max) * 100, 2) : 0}%" title="${esc(i.title || i.label + ": " + i.value)}">${opts.values === false ? "" : `<span>${esc(i.show ?? i.value)}</span>`}</div>`).join("")}
    </div>
    <div class="bar-labels" style="--n:${items.length}">${items.map((i, n) => `<div>${opts.every && n % opts.every ? "" : esc(i.label)}</div>`).join("")}</div>`;
  }

  function pageStats() {
    const ms = allMatches();
    const tot = summarize(ms);
    const seasons = STATS ? [...STATS.seasons].sort((a, b) => a.season.localeCompare(b.season)) : [];
    const hist = Object.fromEntries((SCHEDULE?.teamHistory || []).map((h) => [h.season, h]));

    // per opponent team / player / partner
    const teams = {}, players = {}, partners = {};
    // Team names are typed by hand in Teambeheer: "2Enjoy 1" / "2 Enjoy 1", "0p het nippertje", "D.C." / "DC".
    const teamKey = (n) => n.toLowerCase().replace(/^0p\b/, "op").replace(/\bniet\b/g, "nie").replace(/[^a-z0-9]/g, "");
    ms.forEach((m) => {
      const t = (teams[teamKey(m.opponent)] ||= { name: m.opponent, n: 0, W: 0, G: 0, V: 0, sW: 0, sV: 0, last: "" });
      t.n++; if (m.teamResult) t[m.teamResult]++; t.last = m.date; t.name = m.opponent;  // latest spelling wins
      m.games.forEach((g) => {
        if (g.type === "single") {
          if (g.result === "W") t.sW++; else if (g.result === "V") t.sV++;
          const name = g.opponents[0] || "?";
          const p = (players[name.toLowerCase()] ||= { name, n: 0, W: 0, V: 0, lf: 0, la: 0, team: m.opponent, last: "" });
          const [f, a] = legsOf(g);
          p.n++; p.lf += f; p.la += a; p.team = m.opponent; p.last = m.date;
          if (g.result === "W") p.W++; else if (g.result === "V") p.V++;
        } else {
          g.partners.forEach((name) => {
            const p = (partners[name] ||= { name, n: 0, W: 0, V: 0 });
            p.n++; if (g.result === "W") p.W++; else if (g.result === "V") p.V++;
          });
        }
      });
    });
    const teamList = Object.values(teams).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
    const playerList = Object.values(players).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
    const partnerList = Object.values(partners).sort((a, b) => b.n - a.n).slice(0, 12);
    const fav = Object.values(players).filter((p) => p.n >= 2).sort((a, b) => b.W - a.W || pct(b.W, b.V) - pct(a.W, a.V)).slice(0, 5);
    const tough = Object.values(players).filter((p) => p.n >= 2 && p.V > 0).sort((a, b) => b.V - a.V || pct(a.W, a.V) - pct(b.W, b.V)).slice(0, 5);

    // records
    const finishList = ms.flatMap((m) => finishes(m.finish).map((f) => ({ f, m }))).sort((a, b) => b.f - a.f).slice(0, 10);
    const most180 = [...ms].sort((a, b) => (b.n180 || 0) - (a.n180 || 0))[0];
    let run = 0, bestRun = 0, bestRunEnd = null;
    ms.forEach((m) => m.games.filter((g) => g.type === "single").forEach((g) => {
      if (g.result === "W") { run++; if (run > bestRun) { bestRun = run; bestRunEnd = m.date; } } else run = 0;
    }));
    const whitewash = ms.flatMap((m) => m.games).filter((g) => g.type === "single" && g.result === "W" && legsOf(g)[1] === 0).length;
    const homeS = summarize(ms.filter((m) => m.side === "home")), awayS = summarize(ms.filter((m) => m.side === "away"));
    const bigWin = [...ms].filter((m) => m.teamScore).sort((a, b) => {
      const d = (x) => { const [u, t] = x.teamScore.split("-").map(Number); return u - t; };
      return d(b) - d(a);
    })[0];

    // prizes
    const years = {};
    PRIZES.forEach((p) => { const y = p.date.slice(0, 4); (years[y] ||= { n: 0, first: 0 }); years[y].n++; if (p.place === 1) years[y].first++; });
    const y0 = Number(PRIZES[0]?.date.slice(0, 4) || 1984), y1 = Number(PRIZES[PRIZES.length - 1]?.date.slice(0, 4) || 2022);
    const yearItems = [];
    for (let y = y0; y <= y1; y++) yearItems.push({ label: `'${String(y).slice(2)}`, value: years[y]?.n || 0, title: `${y}: ${years[y]?.n || 0} prijzen, ${years[y]?.first || 0}× eerste` });
    const decades = {};
    PRIZES.forEach((p) => { const d = `${p.date.slice(0, 3)}0`; (decades[d] ||= { n: 0, p1: 0, p2: 0, p3: 0 }); decades[d].n++; if (p.place <= 3) decades[d]["p" + p.place]++; });
    const venues = {};
    PRIZES.forEach((p) => { const v = venueName(p.venue); (venues[v] ||= { n: 0, first: 0 }); venues[v].n++; if (p.place === 1) venues[v].first++; });
    const venueList = Object.entries(venues).filter(([v]) => v !== "onbekend").sort((a, b) => b[1].n - a[1].n).slice(0, 10);
    const events = EVENT_GROUPS.map(([label, rx]) => {
      const list = PRIZES.filter((p) => rx.test(p.event));
      return { label, n: list.length, first: list.filter((p) => p.place === 1).length };
    }).filter((e) => e.n).sort((a, b) => b.first - a.first || b.n - a.n);
    const placeCount = (n) => PRIZES.filter((p) => p.place === n).length;

    const row = (cells) => `<tr>${cells.join("")}</tr>`;
    const tdn = (v) => `<td class="num">${v}</td>`;
    const opp = (m) => `${esc(m.opponent)}, ${esc(shortDate(m.date))}`;

    return `
      ${statTabs("overzicht")}
      <div class="page-head">
        <div class="eyebrow">Voor de liefhebber</div>
        <h1>Statistieken</h1>
        <p>Alles in cijfers. ${STATS ? `Competitie en beker: <b>${ms.length} wedstrijden</b> sinds ${esc(seasonLabel(seasons[0].season))}, partij voor partij uit Teambeheer.` : ""}
          Erelijst: <b>${PRIZES.length} prijzen</b> sinds ${y0}.</p>
      </div>

      ${STATS ? `
      <div class="stats">
        <div class="stat"><b>${tot.matches}</b><span>wedstrijden sinds ${esc(seasonLabel(seasons[0].season).slice(0, 4))}</span></div>
        <div class="stat"><b>${tot.sW}-${tot.sV}</b><span>singles gewonnen-verloren (${pct(tot.sW, tot.sV)}%)</span></div>
        <div class="stat"><b>${tot.pW}-${tot.pV}</b><span>koppels gewonnen-verloren (${pct(tot.pW, tot.pV)}%)</span></div>
        <div class="stat"><b>${tot.n180}</b><span>keer 180</span></div>
        <div class="stat"><b>${tot.best || "–"}</b><span>hoogste finish</span></div>
        <div class="stat"><b>${tot.lf}-${tot.la}</b><span>legs in singles</span></div>
      </div>

      <section class="section">
        <div class="section-head"><h2>Per seizoen</h2></div>
        <div class="table-wrap"><table class="data">
          <thead><tr><th>Seizoen</th><th>Team</th><th class="num">Eindstand</th><th class="num">Wed.</th><th class="num">Singles</th><th class="num">%</th><th class="num">Koppels</th><th class="num">180</th><th class="num">Hoogste finish</th></tr></thead>
          <tbody>${[...seasons].reverse().map((se) => {
            const s = summarize(se.matches); const h = hist[se.season];
            return row([`<td>${esc(seasonLabel(se.season))}${SCHEDULE && se.season === SCHEDULE.season ? ` <span class="badge">bezig</span>` : ""}</td>`, `<td>${esc(se.team)}</td>`,
              tdn(h && h.pos && h.pos !== "0" ? h.pos + "e" : "–"), tdn(s.matches), tdn(`${s.sW}-${s.sV}`), tdn(pct(s.sW, s.sV)), tdn(`${s.pW}-${s.pV}`), tdn(`<b>${s.n180}</b>`), tdn(s.best || "–")]);
          }).join("")}</tbody></table></div>
        <div class="grid grid-2" style="margin-top:18px">
          <div class="card"><h3>180's per seizoen</h3>${barChart(seasons.map((se) => ({ label: `'${se.season.slice(0, 2)}`, value: summarize(se.matches).n180 })))}</div>
          <div class="card"><h3>Singles gewonnen (%)</h3>${barChart(seasons.map((se) => { const s = summarize(se.matches); return { label: `'${se.season.slice(0, 2)}`, value: pct(s.sW, s.sV), show: pct(s.sW, s.sV), cls: "alt" }; }))}</div>
        </div>
      </section>

      <section class="section grid grid-2" style="align-items:start">
        <div class="card"><h3>Favoriete tegenstanders</h3><p class="muted small">Van wie Jos het vaakst won in de singles.</p>
          <table class="data"><tbody>${fav.map((p) => row([`<td>${esc(p.name)}<br><span class="muted small">${esc(p.team)}</span></td>`, tdn(`<b>${p.W}-${p.V}</b>`)])).join("")}</tbody></table></div>
        <div class="card"><h3>Lastigste tegenstanders</h3><p class="muted small">Tegen wie hij het vaakst verloor.</p>
          <table class="data"><tbody>${tough.map((p) => row([`<td>${esc(p.name)}<br><span class="muted small">${esc(p.team)}</span></td>`, tdn(`<b>${p.W}-${p.V}</b>`)])).join("") || "<tr><td>Niemand vaker dan één keer!</td></tr>"}</tbody></table></div>
      </section>

      <section class="section">
        <div class="section-head"><h2>Tegen elk team</h2><input class="search" id="team-search" type="search" placeholder="Zoek een team" aria-label="Zoek een team"></div>
        <div class="table-wrap" style="max-height:520px;overflow:auto"><table class="data" id="team-table">
          <thead><tr><th>Tegenstander</th><th class="num">Ontmoetingen</th><th class="num">Team W-G-V</th><th class="num">Jos singles</th><th class="num">%</th><th>Laatste keer</th></tr></thead>
          <tbody>${teamList.map((t) => `<tr data-q="${esc(t.name.toLowerCase())}">${[`<td><b>${esc(t.name)}</b></td>`, tdn(t.n), tdn(`${t.W}-${t.G}-${t.V}`), tdn(`${t.sW}-${t.sV}`), tdn(pct(t.sW, t.sV)), `<td>${esc(shortDate(t.last))}</td>`].join("")}</tr>`).join("")}</tbody></table></div>
      </section>

      <section class="section">
        <div class="section-head"><h2>Tegen elke speler (singles)</h2><input class="search" id="player-search" type="search" placeholder="Zoek een speler" aria-label="Zoek een speler"></div>
        <div class="table-wrap" style="max-height:520px;overflow:auto"><table class="data" id="player-table">
          <thead><tr><th>Speler</th><th>Team</th><th class="num">Partijen</th><th class="num">W-V</th><th class="num">Legs</th><th>Laatste keer</th></tr></thead>
          <tbody>${playerList.map((p) => `<tr data-q="${esc((p.name + " " + p.team).toLowerCase())}">${[`<td><b>${esc(p.name)}</b></td>`, `<td>${esc(p.team)}</td>`, tdn(p.n), tdn(`${p.W}-${p.V}`), tdn(`${p.lf}-${p.la}`), `<td>${esc(shortDate(p.last))}</td>`].join("")}</tr>`).join("")}</tbody></table></div>
        <p class="muted small">${playerList.length} verschillende tegenstanders in de singles.</p>
      </section>

      <section class="section grid grid-2" style="align-items:start">
        <div class="card"><h3>Koppelpartners</h3>
          <table class="data"><thead><tr><th>Partner</th><th class="num">Koppels</th><th class="num">W-V</th><th class="num">%</th></tr></thead>
          <tbody>${partnerList.map((p) => row([`<td>${esc(p.name)}</td>`, tdn(p.n), tdn(`${p.W}-${p.V}`), tdn(pct(p.W, p.V))])).join("")}</tbody></table></div>
        <div class="card"><h3>Records</h3>
          <dl class="facts">
            <dt>Langste reeks</dt><dd>${bestRun} singles op rij gewonnen${bestRunEnd ? ` (tot ${esc(shortDate(bestRunEnd))})` : ""}</dd>
            <dt>Meeste 180's</dt><dd>${most180 ? `${most180.n180} in één wedstrijd (${opp(most180)})` : "–"}</dd>
            <dt>Grootste zege</dt><dd>${bigWin ? `${esc(bigWin.teamScore)} tegen ${opp(bigWin)}` : "–"}</dd>
            <dt>Zonder leg tegen</dt><dd>${whitewash} singles gewonnen zonder één leg af te staan</dd>
            <dt>Thuis</dt><dd>${homeS.sW}-${homeS.sV} in singles (${pct(homeS.sW, homeS.sV)}%)</dd>
            <dt>Uit</dt><dd>${awayS.sW}-${awayS.sV} in singles (${pct(awayS.sW, awayS.sV)}%)</dd>
          </dl></div>
      </section>

      <section class="section">
        <h2>Hoogste finishes</h2>
        <div class="table-wrap"><table class="data"><thead><tr><th class="num">Finish</th><th>Datum</th><th>Wedstrijd</th></tr></thead>
          <tbody>${finishList.map(({ f, m }) => row([tdn(`<b>${f}</b>`), `<td>${esc(shortDate(m.date))}</td>`, `<td>${esc(m.home)} – ${esc(m.away)}</td>`])).join("")}</tbody></table></div>
        <p class="muted small">Teambeheer noteert finishes van 100 of hoger. De 170 uit 1993 staat bij de <a href="#/certificaten">certificaten</a>.</p>
      </section>` : `<div class="notice">De competitiestatistieken worden nog geladen bij de volgende update.</div>`}

      <section class="section">
        <div class="section-head"><h2>De erelijst in cijfers</h2><a href="#/erelijst">Naar de erelijst →</a></div>
        <div class="stats">
          <div class="stat"><b>${placeCount(1)}×</b><span>eerste prijs</span></div>
          <div class="stat"><b>${placeCount(2)}×</b><span>tweede prijs</span></div>
          <div class="stat"><b>${placeCount(3)}×</b><span>derde prijs</span></div>
          <div class="stat"><b>${Object.keys(venues).length}</b><span>verschillende plekken</span></div>
        </div>
        <div class="card"><h3>Prijzen per jaar</h3>${barChart(yearItems, { every: 4, values: false, height: 150 })}
          <p class="muted small">Beste jaar: ${(() => { const [y, v] = Object.entries(years).sort((a, b) => b[1].n - a[1].n)[0]; return `${y} met ${v.n} prijzen`; })()}.</p></div>
        <div class="grid grid-2" style="margin-top:18px;align-items:start">
          <div class="card"><h3>Meest gewonnen toernooien</h3>
            <table class="data"><thead><tr><th>Toernooi</th><th class="num">1e</th><th class="num">Prijzen</th></tr></thead>
            <tbody>${events.slice(0, 10).map((e) => row([`<td>${esc(e.label)}</td>`, tdn(`<b>${e.first}</b>`), tdn(e.n)])).join("")}</tbody></table></div>
          <div class="card"><h3>Waar de prijzen vielen</h3>
            <table class="data"><thead><tr><th>Plek</th><th class="num">1e</th><th class="num">Prijzen</th></tr></thead>
            <tbody>${venueList.map(([v, c]) => row([`<td>${esc(v)}</td>`, tdn(`<b>${c.first}</b>`), tdn(c.n)])).join("")}</tbody></table></div>
        </div>
        <div class="card" style="margin-top:18px"><h3>Per tien jaar</h3>
          <table class="data"><thead><tr><th>Periode</th><th class="num">Prijzen</th><th class="num">1e</th><th class="num">2e</th><th class="num">3e</th></tr></thead>
          <tbody>${Object.entries(decades).sort().map(([d, c]) => row([`<td>jaren '${d.slice(2)}</td>`, tdn(`<b>${c.n}</b>`), tdn(c.p1), tdn(c.p2), tdn(c.p3)])).join("")}</tbody></table></div>
      </section>`;
  }

  function afterStats() {
    [["team-search", "team-table"], ["player-search", "player-table"]].forEach(([input, table]) => {
      const i = document.getElementById(input);
      if (!i) return;
      i.addEventListener("input", () => {
        const q = i.value.toLowerCase();
        document.querySelectorAll(`#${table} tbody tr`).forEach((tr) => { tr.hidden = q && !tr.dataset.q.includes(q); });
      });
    });
  }

  // ------------------------------------------------------------ analysis page (interactive)
  // Chart colours: validated categorical slots (blue, orange, aqua) on the dark surface; single series use the accent.
  const C1 = "#3987e5", C2 = "#d95926", C3 = "#199e70", CA = "var(--accent)";
  const RAMP = ["#e3b450", "#b8862f", "#8a6424", "#5c4a33"];  // ordinal: 1st, 2nd, 3rd, other places
  let DIVISION = window.DIVISION || null;
  const loadDivision = () => (DIVISION ? Promise.resolve(DIVISION) : new Promise((res) => {
    const s = document.createElement("script");
    s.src = `data/division.js?v=${encodeURIComponent(STATS?.fetchedAt || "")}`;
    s.onload = () => { DIVISION = window.DIVISION || null; res(DIVISION); };
    s.onerror = () => res(null);
    document.head.appendChild(s);
  }));

  // Tooltip: any element with data-tip shows it on hover (mouse) or tap (touch).
  const tip = document.createElement("div");
  tip.className = "tip"; tip.hidden = true; document.body.appendChild(tip);
  const showTip = (text, x, y) => {
    tip.innerHTML = text; tip.hidden = false;
    const r = tip.getBoundingClientRect();
    tip.style.left = `${Math.min(Math.max(8, x - r.width / 2), innerWidth - r.width - 8)}px`;
    tip.style.top = `${Math.max(8, y - r.height - 14)}px`;
  };
  document.addEventListener("mouseover", (e) => { const t = e.target.closest("[data-tip]"); if (t) { const b = t.getBoundingClientRect(); showTip(t.dataset.tip, b.left + b.width / 2, b.top); } });
  document.addEventListener("mouseout", (e) => { if (e.target.closest("[data-tip]")) tip.hidden = true; });
  document.addEventListener("click", (e) => { const t = e.target.closest("[data-tip]"); if (t) { const b = t.getBoundingClientRect(); showTip(t.dataset.tip, b.left + b.width / 2, b.top); } else if (!e.target.closest(".line-chart")) tip.hidden = true; });
  addEventListener("scroll", () => { tip.hidden = true; }, { passive: true });

  // Vertical bar chart (HTML). items: {label, segs:[{v,color,tip}]} or {label, v, color, tip}
  function vbars(items, { height = 170, every = 1, max = null, show = true } = {}) {
    const total = (i) => (i.segs ? i.segs.reduce((s, x) => s + x.v, 0) : i.v);
    const top = max ?? Math.max(1, ...items.map(total));
    return `<div class="vbars" style="--n:${items.length};height:${height}px">${items.map((i) => {
      if (i.bars) {  // grouped: bars side by side within one column
        const groupTop = max ?? Math.max(1, ...items.flatMap((x) => (x.bars || []).map((b) => b.v)));
        return `<div class="vcol grp" data-tip="${esc(i.tip || "")}">${i.bars.map((b) => `<div class="vseg" style="height:${(b.v / groupTop) * 100}%;background:${b.color}"><span class="vval">${esc(b.show ?? b.v)}</span></div>`).join("")}</div>`;
      }
      const segs = i.segs || [{ v: i.v, color: i.color || CA, tip: i.tip }];
      return `<div class="vcol" data-tip="${esc(i.tip || segs.map((s) => s.tip).filter(Boolean).join("<br>") || `${i.label}: ${total(i)}`)}">
        ${show && total(i) ? `<span class="vval">${esc(i.show ?? total(i))}</span>` : ""}
        ${segs.filter((s) => s.v > 0).map((s) => `<div class="vseg" style="height:${(s.v / top) * 100}%;background:${s.color}"></div>`).join("")}
      </div>`;
    }).join("")}</div>
    <div class="vlabels" style="--n:${items.length}">${items.map((i, n) => `<div>${n % every ? "" : esc(i.label)}</div>`).join("")}</div>`;
  }

  // Horizontal bars, good for rankings: rows {label, v, tip, hi}
  const hbars = (rows, { max = null, fmt = (v) => v } = {}) => {
    const top = max ?? Math.max(1, ...rows.map((r) => r.v));
    return `<div class="hbars">${rows.map((r) => `<div class="hrow ${r.hi ? "hi" : ""}" data-tip="${esc(r.tip || `${r.label}: ${fmt(r.v)}`)}">
      <div class="hlab">${esc(r.label)}</div><div class="htrack"><div class="hbar" style="width:${(r.v / top) * 100}%;background:${r.color || (r.hi ? C1 : "color-mix(in srgb, var(--muted) 55%, transparent)")}"></div></div>
      <div class="hval">${esc(fmt(r.v))}</div></div>`).join("")}</div>`;
  };

  // Line chart (SVG) with crosshair tooltip. series: [{name, color, values:[number|null]}], tips: [html per x]
  const LINE_CHARTS = {};
  function lineChart(id, series, tips, { height = 200, yMax = null, yMin = 0, unit = "", xLabels = [] } = {}) {
    const n = Math.max(...series.map((s) => s.values.length));
    const hi = yMax ?? Math.max(1, ...series.flatMap((s) => s.values.filter((v) => v != null)));
    const W = 1000, H = 300, x = (i) => (n <= 1 ? W / 2 : (i / (n - 1)) * W), y = (v) => H - ((v - yMin) / (hi - yMin)) * H;
    LINE_CHARTS[id] = { n, tips, series, x, y, W, H };
    const paths = series.map((s) => {
      let d = "", pen = false;
      s.values.forEach((v, i) => { if (v == null) { pen = false; return; } d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`; pen = true; });
      return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>`;
    }).join("");
    const grid = [0.25, 0.5, 0.75, 1].map((f) => `<line x1="0" x2="${W}" y1="${y(yMin + (hi - yMin) * f)}" y2="${y(yMin + (hi - yMin) * f)}" stroke="var(--line)" stroke-width="1" vector-effect="non-scaling-stroke"/>`).join("");
    return `<div class="line-chart" data-chart="${id}">
      <div class="ly">${[1, 0.5, 0].map((f) => `<span>${Math.round(yMin + (hi - yMin) * f)}${unit}</span>`).join("")}</div>
      <div class="lplot" style="height:${height}px">
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${grid}${paths}<line class="cross" x1="0" x2="0" y1="0" y2="${H}" stroke="var(--muted)" stroke-width="1" vector-effect="non-scaling-stroke" visibility="hidden"/></svg>
        ${series.map((s, k) => `<i class="dot" data-k="${k}" style="background:${s.color}"></i>`).join("")}
      </div>
      ${xLabels.length ? `<div class="lx">${xLabels.map((t) => `<span style="left:${n <= 1 ? 50 : (t.i / (n - 1)) * 100}%">${esc(t.label)}</span>`).join("")}</div>` : ""}
      ${series.length > 1 ? `<div class="legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join("")}</div>` : ""}
    </div>`;
  }
  function bindLineCharts(root) {
    root.querySelectorAll(".line-chart").forEach((el) => {
      const c = LINE_CHARTS[el.dataset.chart];
      const plot = el.querySelector(".lplot"), cross = el.querySelector(".cross"), dots = el.querySelectorAll(".dot");
      if (!c) return;
      const move = (clientX) => {
        const r = plot.getBoundingClientRect();
        const i = Math.round(Math.min(Math.max(0, (clientX - r.left) / r.width), 1) * (c.n - 1));
        const px = (c.x(i) / c.W) * r.width;
        cross.setAttribute("x1", c.x(i)); cross.setAttribute("x2", c.x(i)); cross.setAttribute("visibility", "visible");
        dots.forEach((d) => {
          const v = c.series[d.dataset.k].values[i];
          d.style.display = v == null ? "none" : "block";
          if (v != null) { d.style.left = `${px}px`; d.style.top = `${(c.y(v) / c.H) * r.height}px`; }
        });
        showTip(c.tips[i] || "", r.left + px, r.top + 4);
      };
      plot.addEventListener("mousemove", (e) => move(e.clientX));
      plot.addEventListener("touchmove", (e) => { move(e.touches[0].clientX); }, { passive: true });
      plot.addEventListener("click", (e) => move(e.clientX));
      plot.addEventListener("mouseleave", () => { tip.hidden = true; cross.setAttribute("visibility", "hidden"); dots.forEach((d) => { d.style.display = "none"; }); });
    });
  }

  const statTabs = (active) => `<div class="tabs" role="tablist">
    <a href="#/statistieken" role="tab" aria-selected="${active === "overzicht"}">Overzicht</a>
    <a href="#/analyse" role="tab" aria-selected="${active === "analyse"}">Analyse</a></div>`;

  const AN = { season: "all", kind: "all", side: "all", tag: "all" };
  const MONTH_ORDER = [8, 9, 10, 11, 0, 1, 2, 3, 4];  // aug..mei (season order)

  function pageAnalyse() {
    if (!STATS) return `${statTabs("analyse")}<div class="notice">De gegevens voor de analyse worden bij de volgende update geladen.</div>`;
    const seasons = [...STATS.seasons].map((s) => s.season).sort().reverse();
    const sel = (name, opts) => `<label class="flt"><span>${name}</span><select data-f="${name === "Seizoen" ? "season" : name === "Soort" ? "kind" : "side"}">
      ${opts.map(([v, l]) => `<option value="${v}" ${AN[name === "Seizoen" ? "season" : name === "Soort" ? "kind" : "side"] === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`;
    return `${statTabs("analyse")}
      <div class="page-head">
        <div class="eyebrow">Duik in de cijfers</div>
        <h1>Analyse</h1>
        <p>Alle partijen sinds 2017-2018, de ranglijsten van de dartvereniging en de erelijst. Kies hieronder een seizoen of soort wedstrijd:
          alle grafieken passen zich aan. Beweeg over een grafiek (of tik erop) voor de details.</p>
      </div>
      <div class="filters">
        ${sel("Seizoen", [["all", "Alle seizoenen"], ...seasons.map((s) => [s, seasonLabel(s)])])}
        ${sel("Soort", [["all", "Competitie en beker"], ["league", "Alleen competitie"], ["cup", "Alleen beker"]])}
        ${sel("Waar", [["all", "Thuis en uit"], ["home", "Alleen thuis"], ["away", "Alleen uit"]])}
      </div>
      <div id="an-body"></div>
      <section class="section" id="an-division"><h2>Jos tegenover de rest</h2><p class="loading">Ranglijsten laden…</p></section>
      <section class="section" id="an-dartscores">${dartscoresSection()}</section>
      <section class="section" id="an-prizes"></section>`;
  }

  function filteredMatches() {
    return allMatches().filter((m) => (AN.season === "all" || m.season === AN.season)
      && (AN.kind === "all" || (AN.kind === "cup" ? !!m.cup : !m.cup))
      && (AN.side === "all" || m.side === AN.side));
  }

  function renderAnalyseBody() {
    const body = document.getElementById("an-body");
    if (!body) return;
    const ms = filteredMatches();
    if (!ms.length) { body.innerHTML = `<div class="notice">Geen wedstrijden met deze keuze.</div>`; return; }
    const s = summarize(ms);
    const singles = ms.flatMap((m) => m.games.filter((g) => g.type === "single").map((g) => ({ g, m })));
    const pairs = ms.flatMap((m) => m.games.filter((g) => g.type === "pair").map((g) => ({ g, m })));
    const finAll = ms.flatMap((m) => finishes(m.finish).map((f) => ({ f, m })));
    const sls = ms.filter((m) => /^\d+$/.test(m.sl || "")).map((m) => ({ d: Number(m.sl), m }));
    const fastest = sls.reduce((a, b) => (!a || b.d < a.d ? b : a), null);
    const decider = (g) => { const [f, a] = legsOf(g); return Math.abs(f - a) === 1 && Math.max(f, a) >= 3; };
    const decS = singles.filter(({ g }) => decider(g)), decP = pairs.filter(({ g }) => decider(g));
    const wl = (list) => [list.filter(({ g }) => g.result === "W").length, list.filter(({ g }) => g.result === "V").length];
    const [dsw, dsl] = wl(decS), [dpw, dpl] = wl(decP);
    const gamesWonPerMatch = (s.sW + s.pW) / ms.length;

    // form line: rolling % of the last 10 singles, and cumulative 180s
    const form = singles.map((_, i) => { const w = singles.slice(Math.max(0, i - 9), i + 1); return Math.round((100 * w.filter((x) => x.g.result === "W").length) / w.length); });
    const formTips = singles.map(({ g, m }, i) => `<b>${esc(shortDate(m.date))}</b> tegen ${esc(g.opponents[0] || "")}<br>${g.result === "W" ? "gewonnen" : "verloren"} ${esc(g.legs)}<br>vorm (laatste 10): <b>${form[i]}%</b>`);
    let cum = 0;
    const cum180 = ms.map((m) => (cum += m.n180 || 0));
    const cumTips = ms.map((m, i) => `<b>${esc(shortDate(m.date))}</b> ${esc(m.home)} – ${esc(m.away)}<br>${m.n180 || 0}× 180 in deze wedstrijd<br>totaal: <b>${cum180[i]}</b>`);
    // x-axis ticks at the first match of every season: [{i, label}]
    const seasonTicks = (list) => { const seen = new Set(); return list.flatMap(({ m }, i) => (seen.has(m.season) ? [] : (seen.add(m.season), [{ i, label: `'${m.season.slice(0, 2)}` }]))); };

    // leg score distribution (singles), best result first
    const dist = {};
    singles.forEach(({ g }) => { if (/^\d+-\d+$/.test(g.legs)) dist[g.legs] = (dist[g.legs] || 0) + 1; });
    const distKey = (k) => { const [f, a] = k.split("-").map(Number); return f > a ? [0, -f, a] : [1, a, -f]; };  // wins first (4-0..3-2), then losses (2-3..0-4)
    const distItems = Object.keys(dist).sort((x, y) => { const a = distKey(x), b = distKey(y); return a[0] - b[0] || a[1] - b[1] || a[2] - b[2]; })
      .map((k) => { const [f, a] = k.split("-").map(Number); return { label: k, v: dist[k], color: f > a ? C1 : C2, tip: `${k}: ${dist[k]}× (${f > a ? "gewonnen" : "verloren"})` }; });

    // by month of the season
    const byMonth = MONTH_ORDER.map((mo) => { const list = singles.filter(({ m }) => parseISO(m.date).getMonth() === mo); const [w, l] = wl(list); return { mo, w, l }; }).filter((x) => x.w + x.l);
    const monthItems = byMonth.map(({ mo, w, l }) => ({ label: MONTHS[mo].slice(0, 3), v: pct(w, l), show: `${pct(w, l)}%`, color: CA, tip: `${MONTHS[mo]}: ${w}-${l} in singles (${pct(w, l)}%)` }));

    // results strip (team result per match)
    const strip = ms.map((m) => `<i class="rs ${m.teamResult || ""}" data-tip="<b>${esc(shortDate(m.date))}</b> ${esc(m.home)} – ${esc(m.away)} <b>${esc(m.score)}</b>${m.cup ? " (beker)" : ""}<br>Jos: ${m.games.map((g) => (g.type === "single" ? "S" : "K") + (g.result || "?")).join(" ")}${m.n180 ? `, ${m.n180}× 180` : ""}"></i>`).join("");

    // partners and short legs
    const partners = {};
    pairs.forEach(({ g }) => g.partners.forEach((p) => { const x = (partners[p] ||= { w: 0, l: 0 }); if (g.result === "W") x.w++; else if (g.result === "V") x.l++; }));
    const partnerRows = Object.entries(partners).filter(([, x]) => x.w + x.l >= 3).sort((a, b) => b[1].w + b[1].l - (a[1].w + a[1].l)).slice(0, 8)
      .map(([n, x]) => ({ label: n, v: pct(x.w, x.l), tip: `met ${n}: ${x.w}-${x.l} (${pct(x.w, x.l)}%)`, color: C3 }));
    const slCount = {};
    sls.forEach(({ d }) => { slCount[d] = (slCount[d] || 0) + 1; });

    body.innerHTML = `
      <div class="stats kpis">
        <div class="stat"><b>${ms.length}</b><span>wedstrijden (${s.tW}-${s.tG}-${s.tV} voor het team)</span></div>
        <div class="stat"><b>${pct(s.sW, s.sV)}%</b><span>singles gewonnen (${s.sW}-${s.sV})</span></div>
        <div class="stat"><b>${pct(s.lf, s.la)}%</b><span>van de legs in singles (${s.lf}-${s.la})</span></div>
        <div class="stat"><b>${pct(s.pW, s.pV)}%</b><span>koppels gewonnen (${s.pW}-${s.pV})</span></div>
        <div class="stat"><b>${s.n180}</b><span>keer 180 (${(s.n180 / ms.length).toFixed(2).replace(".", ",")} per wedstrijd)</span></div>
        <div class="stat"><b>${finAll.length}</b><span>finishes van 100+ (hoogste ${s.best || "–"})</span></div>
        <div class="stat"><b>${fastest ? fastest.d : "–"}</b><span>darts: snelste leg${fastest ? ` (${esc(shortDate(fastest.m.date))})` : ""}</span></div>
        <div class="stat"><b>${gamesWonPerMatch.toFixed(1).replace(".", ",")}</b><span>punten per wedstrijd voor het team</span></div>
      </div>

      <div class="card"><h3>Alle wedstrijden op een rij</h3>
        <p class="muted small">Elk vakje is een wedstrijd van het team: <span class="rs-key W"></span> gewonnen, <span class="rs-key G"></span> gelijk, <span class="rs-key V"></span> verloren. Beweeg erover voor Jos' partijen (S = single, K = koppel).</p>
        <div class="strip">${strip}</div></div>

      <div class="grid grid-2" style="margin-top:18px">
        <div class="card"><h3>Vorm in de singles</h3><p class="muted small">Percentage gewonnen van de laatste 10 singles, partij na partij.</p>
          ${singles.length ? lineChart("form", [{ name: "Vorm", color: CA, values: form }], formTips, { yMax: 100, unit: "%", xLabels: seasonTicks(singles) }) : "<p>Geen singles.</p>"}</div>
        <div class="card"><h3>180's opgeteld</h3><p class="muted small">Het totaal groeit met elke wedstrijd.</p>
          ${lineChart("cum180", [{ name: "180's", color: C1, values: cum180 }], cumTips, { xLabels: seasonTicks(ms.map((m) => ({ m }))) })}</div>
      </div>

      <div class="grid grid-2" style="margin-top:18px;align-items:start">
        <div class="card"><h3>Uitslagen van zijn singles</h3><p class="muted small">Hoe vaak elke legstand voorkwam. <span class="key" style="--c:${C1}">gewonnen</span> <span class="key" style="--c:${C2}">verloren</span></p>
          ${vbars(distItems)}
          <p style="margin-top:12px"><b>In de beslissende leg:</b> singles ${dsw}-${dsl} (${pct(dsw, dsl)}%), koppels ${dpw}-${dpl} (${pct(dpw, dpl)}%).</p></div>
        <div class="card"><h3>Per maand</h3><p class="muted small">Percentage singles gewonnen per maand van het seizoen.</p>
          ${monthItems.length ? vbars(monthItems, { max: 100 }) : "<p>Te weinig gegevens.</p>"}
          ${monthItems.length ? `<p style="margin-top:12px">Sterkste maand (minstens 8 singles): <b>${(() => { const ok = byMonth.filter((x) => x.w + x.l >= 8); return ok.length ? esc(MONTHS[ok.reduce((a, b) => (pct(b.w, b.l) > pct(a.w, a.l) ? b : a)).mo]) : "nog niet te zeggen"; })()}</b>.</p>` : ""}</div>
      </div>

      <div class="grid grid-2" style="margin-top:18px;align-items:start">
        <div class="card"><h3>Koppels per partner</h3><p class="muted small">Percentage gewonnen, partners met minstens 3 koppels.</p>
          ${partnerRows.length ? hbars(partnerRows, { max: 100, fmt: (v) => `${v}%` }) : "<p>Te weinig koppels.</p>"}</div>
        <div class="card"><h3>Snelle legs en hoge finishes</h3>
          <p class="muted small">Legs van 15 darts of minder, en finishes van 100 of hoger.</p>
          ${Object.keys(slCount).length ? hbars(Object.keys(slCount).sort((a, b) => a - b).map((d) => ({ label: `${d} darts`, v: slCount[d], color: C1, tip: `${slCount[d]}× een leg in ${d} darts` }))) : "<p>Geen snelle legs genoteerd.</p>"}
          <div style="margin-top:14px">${hbars([[100, 119], [120, 139], [140, 159], [160, 170]].map(([a, b]) => ({ label: `${a}-${b}`, v: finAll.filter(({ f }) => f >= a && f <= b).length, color: C3, tip: `${finAll.filter(({ f }) => f >= a && f <= b).length}× een finish tussen ${a} en ${b}` })))}</div></div>
      </div>

      <section class="section card">
        <h3>Onderling: zoek een tegenstander</h3>
        <input class="search" id="h2h" list="h2h-list" placeholder="Typ een naam of team, bijvoorbeeld Carrou-Hell" aria-label="Zoek een tegenstander">
        <datalist id="h2h-list">${[...new Set(singles.flatMap(({ g }) => g.opponents).concat(ms.map((m) => m.opponent)))].sort().map((n) => `<option value="${esc(n)}">`).join("")}</datalist>
        <div id="h2h-out" style="margin-top:12px"><p class="muted">Alle partijen tegen die speler of dat team verschijnen hier.</p></div>
      </section>`;
    bindLineCharts(body);
    const input = document.getElementById("h2h");
    input.addEventListener("input", () => {
      const q = input.value.trim().toLowerCase();
      const out = document.getElementById("h2h-out");
      if (q.length < 3) { out.innerHTML = `<p class="muted">Typ minstens drie letters.</p>`; return; }
      const games = ms.flatMap((m) => m.games.filter((g) => m.opponent.toLowerCase().includes(q) || g.opponents.some((o) => o.toLowerCase().includes(q))).map((g) => ({ g, m })));
      const [w, l] = wl(games);
      out.innerHTML = games.length ? `<p><b>${games.length} partijen: ${w} gewonnen, ${l} verloren (${pct(w, l)}%).</b></p>
        <div class="table-wrap" style="max-height:420px;overflow:auto"><table class="data"><thead><tr><th>Datum</th><th>Soort</th><th>Tegen</th><th>Met</th><th class="num">Legs</th><th></th></tr></thead><tbody>
        ${games.reverse().map(({ g, m }) => `<tr><td>${esc(shortDate(m.date))}</td><td>${g.type === "single" ? "single" : "koppel"}</td><td>${esc(g.opponents.join(" & "))}<br><span class="muted small">${esc(m.opponent)}</span></td>
          <td>${esc(g.partners.join(", "))}</td><td class="num">${esc(g.legs)}</td><td>${g.result ? `<span class="res ${g.result}">${g.result}</span>` : ""}</td></tr>`).join("")}
        </tbody></table></div>` : `<p>Geen partijen gevonden.</p>`;
    });
  }

  function divisionRows(div) {
    const me = STATS?.playerName || SITE.name || "Jos Tiebosch";
    return Object.entries(div.seasons).sort().map(([season, v]) => {
      const peers = (rows) => rows.filter((r) => v.teams.includes(r[1]));
      const rankBy = (rows, val, asc = false) => {
        const mine = rows.find((r) => r[0] === me);
        if (!mine) return null;
        const better = rows.filter((r) => (asc ? val(r) < val(mine) : val(r) > val(mine))).length;
        return { rank: better + 1, of: rows.length, val: val(mine), pctl: rows.length > 1 ? Math.round((100 * (rows.length - better - 1)) / (rows.length - 1)) : 100, leader: [...rows].sort((a, b) => (asc ? val(a) - val(b) : val(b) - val(a)))[0] };
      };
      const minS = (rows) => { const mine = rows.find((r) => r[0] === me); return Math.max(5, Math.round((mine ? mine[2] : 10) / 2)); };
      // rows: [name, team, singles, legsFor, legsAgainst, win%]; rank on win%, ties broken by share of legs won
      const pkVal = (r) => (r[5] || 0) + r[3] / Math.max(1, r[3] + r[4]) / 100;
      const divPk = peers(v.pk).filter((r) => r[2] >= minS(v.pk));
      const dvkPk = v.pk.filter((r) => r[2] >= minS(v.pk));
      return {
        season, division: v.division,
        legsDiv: rankBy(divPk, pkVal), legsDvk: rankBy(dvkPk, pkVal),
        s180Div: rankBy(peers(v.s180), (r) => r[2]), s180Dvk: rankBy(v.s180, (r) => r[2]),
        finDiv: rankBy(peers(v.fin), (r) => r[2]), fastDiv: rankBy(peers(v.fast), (r) => r[2], true),
        raw: v,
      };
    });
  }

  function renderDivision() {
    const box = document.getElementById("an-division");
    if (!box) return;
    loadDivision().then((div) => {
      if (!document.getElementById("an-division")) return;
      if (!div) { box.innerHTML = `<h2>Jos tegenover de rest</h2><p>De ranglijsten konden niet worden geladen.</p>`; return; }
      let rows = divisionRows(div);
      if (AN.season !== "all") rows = rows.filter((r) => r.season === AN.season);
      if (!rows.length) { box.innerHTML = `<h2>Jos tegenover de rest</h2><p>Geen ranglijst voor dit seizoen.</p>`; return; }
      const divName = (c) => (c === "Ere" ? "Eredivisie" : c === "E1" ? "Eredivisie (1e helft)" : c);
      const cell = (r) => (r ? `<b>${r.rank}e</b> <span class="muted small">van ${r.of}</span>` : "–");
      const latest = rows[rows.length - 1];
      const me = STATS?.playerName || "Jos Tiebosch";
      const top = (list, asc = false) => list.filter((r) => latest.raw.teams.includes(r[1])).sort((a, b) => (asc ? a[2] - b[2] : b[2] - a[2])).slice(0, 10);
      const top180 = top(latest.raw.s180);
      if (!top180.some((r) => r[0] === me)) { const mine = latest.raw.s180.find((r) => r[0] === me); if (mine) top180.push(mine); }
      box.innerHTML = `
        <h2>Jos tegenover de rest</h2>
        <p>Uit de ranglijsten van de dartvereniging: hoe Jos het doet tegenover alle spelers in zijn divisie en in heel de DVK (alle divisies).
          Bij de singles tellen alleen spelers mee die minstens half zoveel singles speelden als Jos (minimaal 5).</p>
        <div class="table-wrap"><table class="data">
          <thead><tr><th>Seizoen</th><th>Divisie</th><th class="num">Singles gewonnen</th><th>Plek in divisie</th><th>Plek in DVK</th><th class="num">180's</th><th>Plek 180's divisie</th><th>Plek 180's DVK</th><th class="num">Snelste leg</th></tr></thead>
          <tbody>${[...rows].reverse().map((r) => `<tr><td>${esc(seasonLabel(r.season))}</td><td>${esc(divName(r.division))}</td>
            <td class="num">${r.legsDiv ? Math.floor(r.legsDiv.val) + "%" : "–"}</td><td>${cell(r.legsDiv)}</td><td>${cell(r.legsDvk)}</td>
            <td class="num">${r.s180Div ? r.s180Div.val : "–"}</td><td>${cell(r.s180Div)}</td><td>${cell(r.s180Dvk)}</td>
            <td class="num">${r.fastDiv ? r.fastDiv.val + " darts" : "–"}</td></tr>`).join("")}</tbody></table></div>

        ${rows.length > 1 ? `<div class="grid grid-2" style="margin-top:18px">
          <div class="card"><h3>Beter dan …% van de divisie (singles)</h3><p class="muted small">100% = de beste van de divisie.</p>
            ${vbars(rows.map((r) => ({ label: `'${r.season.slice(0, 2)}`, v: r.legsDiv ? r.legsDiv.pctl : 0, show: r.legsDiv ? `${r.legsDiv.pctl}%` : "", color: C1, tip: r.legsDiv ? `${seasonLabel(r.season)}: ${r.legsDiv.rank}e van ${r.legsDiv.of} spelers` : "geen gegevens" })), { max: 100 })}</div>
          <div class="card"><h3>Beter dan …% van de divisie (180's)</h3><p class="muted small">Vergeleken met alle spelers die een 180 gooiden.</p>
            ${vbars(rows.map((r) => ({ label: `'${r.season.slice(0, 2)}`, v: r.s180Div ? r.s180Div.pctl : 0, show: r.s180Div ? `${r.s180Div.pctl}%` : "", color: C3, tip: r.s180Div ? `${seasonLabel(r.season)}: ${r.s180Div.val}× 180, ${r.s180Div.rank}e van ${r.s180Div.of}` : "geen gegevens" })), { max: 100 })}</div>
        </div>` : ""}

        <div class="card" style="margin-top:18px"><h3>Meeste 180's in de ${esc(divName(latest.division))}, ${esc(seasonLabel(latest.season))}</h3>
          ${hbars(top180.map((r) => ({ label: `${r[0]} · ${r[1]}`, v: r[2], hi: r[0] === me, tip: `${r[0]} (${r[1]}): ${r[2]}× 180` })))}
          <p class="muted small">Jos staat in blauw.</p></div>`;
    });
  }

  // Tournaments scored on Dartscores (DVK rankings since 2026, Open Kennemerland): averages per event.
  function dartscoresSection() {
    const ds = window.DARTSCORES;
    const ev = ds && ds.events ? ds.events : [];
    if (!ev.length) return "";
    const withAvg = ev.filter((e) => e.avg);
    const best = withAvg.reduce((a, b) => (!a || b.avg > a.avg ? b : a), null);
    const mean = withAvg.length ? withAvg.reduce((s, e) => s + e.avg, 0) / withAvg.length : 0;
    const nl = (x) => (x == null ? "–" : String(x.toFixed ? x.toFixed(2) : x).replace(".", ","));
    const shortName = (n) => n.replace(/ - /g, " · ").replace(/'(\d\d)\/'(\d\d)/, "$1/$2");
    return `
      <h2>Gemiddelden op toernooien</h2>
      <p>Sinds 2026 worden de DVK-rankings en de Open Kennemerland gescoord met <a href="https://tournaments.dartscores.app/tournaments" target="_blank" rel="noopener">Dartscores</a>.
        Daar staat ook het gemiddelde per drie darts van elke speler in de groepsfase. Nieuwe toernooien komen er vanzelf bij.</p>
      <div class="stats">
        <div class="stat"><b>${ev.length}</b><span>toernooien op Dartscores</span></div>
        <div class="stat"><b>${nl(best?.avg)}</b><span>hoogste gemiddelde (${esc(best ? shortName(best.name) : "")})</span></div>
        <div class="stat"><b>${nl(mean)}</b><span>gemiddeld over alle toernooien</span></div>
        <div class="stat"><b>${withAvg.filter((e) => e.avg > e.fieldAvg).length}× van ${withAvg.length}</b><span>boven het gemiddelde van het veld</span></div>
      </div>
      <div class="card"><h3>Jos tegenover het veld</h3>
        <p class="muted small"><span class="key" style="--c:${C1}">Jos</span> <span class="key" style="--c:${C2}">gemiddelde van alle deelnemers</span></p>
        ${vbars(withAvg.map((e) => ({ label: `${e.date.slice(8, 10)}-${e.date.slice(5, 7)}`, bars: [
          { v: e.avg, color: C1, show: nl(e.avg).replace(/,\d+$/, "") }, { v: e.fieldAvg || 0, color: C2, show: nl(e.fieldAvg).replace(/,\d+$/, "") }],
          tip: `<b>${esc(shortName(e.name))}</b><br>Jos: ${nl(e.avg)} · veld: ${nl(e.fieldAvg)}<br>${e.avgRank}e van ${e.players} op gemiddelde` })), { height: 190 })}</div>
      <div class="table-wrap" style="margin-top:18px"><table class="data">
        <thead><tr><th>Datum</th><th>Toernooi</th><th>Groep</th><th class="num">Gemiddelde</th><th class="num">Veld</th><th>Plek op gemiddelde</th><th>Winnaar</th></tr></thead>
        <tbody>${[...ev].reverse().map((e) => `<tr>
          <td>${esc(shortDate(e.date))}</td>
          <td><a href="${esc(e.url)}" target="_blank" rel="noopener" style="color:var(--text)"><b>${esc(shortName(e.name))}</b></a>${e.partner ? `<br><span class="muted small">met ${esc(e.partner)}</span>` : ""}</td>
          <td>${e.groupRank ? `${e.groupRank}e van ${e.groupSize}` : "–"}${e.won != null ? `<br><span class="muted small">${e.won} van ${e.played} gewonnen</span>` : ""}</td>
          <td class="num"><b>${nl(e.avg)}</b></td><td class="num">${nl(e.fieldAvg)}</td>
          <td>${e.avgRank ? `<b>${e.avgRank}e</b> <span class="muted small">van ${e.players}</span>` : "–"}</td>
          <td class="small">${(e.finals || []).map((f) => `${esc(f.stage.replace(/ finals?/i, ""))}: ${esc(f.winner)}`).join("<br>")}</td></tr>`).join("")}
        </tbody></table></div>
      <p class="muted small">Gemiddelden uit de groepsfase, zoals Dartscores ze toont. Hoe ver hij daarna in de A- of B-finales kwam, staat op de pagina van het toernooi zelf.</p>`;
  }

  function renderPrizeAnalysis() {
    const box = document.getElementById("an-prizes");
    if (!box) return;
    const list = PRIZES.filter((p) => AN.tag === "all" || (AN.tag === "p1" ? p.place === 1 : p.tags.includes(AN.tag)));
    const y0 = Number(PRIZES[0].date.slice(0, 4)), y1 = Number(PRIZES[PRIZES.length - 1].date.slice(0, 4));
    const yearItems = [];
    for (let y = y0; y <= y1; y++) {
      const ys = list.filter((p) => Number(p.date.slice(0, 4)) === y);
      const c = [1, 2, 3].map((n) => ys.filter((p) => p.place === n).length); const other = ys.length - c[0] - c[1] - c[2];
      yearItems.push({ label: `'${String(y).slice(2)}`, segs: [
        { v: c[0], color: RAMP[0] }, { v: c[1], color: RAMP[1] }, { v: c[2], color: RAMP[2] }, { v: other, color: RAMP[3] }],
        tip: `<b>${y}</b>: ${ys.length} prijzen<br>1e: ${c[0]} · 2e: ${c[1]} · 3e: ${c[2]}${other ? ` · lager: ${other}` : ""}` });
    }
    const yearsAxis = [];
    for (let y = y0; y <= y1; y++) yearsAxis.push(y);
    let run = 0, runFirst = 0;
    const cumVals = [], cumFirst = [], cumTips = [];
    yearsAxis.forEach((y) => {
      const ys = list.filter((p) => Number(p.date.slice(0, 4)) === y);
      run += ys.length; runFirst += ys.filter((p) => p.place === 1).length;
      cumVals.push(run); cumFirst.push(runFirst);
      cumTips.push(`<b>${y}</b>: ${ys.length} prijzen dit jaar<br>totaal: <b>${run}</b> prijzen, waarvan ${runFirst}× eerste`);
    });
    const months = MONTHS.map((m, i) => { const n = list.filter((p) => parseISO(p.date).getMonth() === i); return { label: m.slice(0, 3), v: n.length, color: CA, tip: `${m}: ${n.length} prijzen, ${n.filter((p) => p.place === 1).length}× eerste` }; });
    const days = [1, 2, 3, 4, 5, 6, 0].map((d) => { const n = list.filter((p) => parseISO(p.date).getDay() === d); return { label: DAYS[d].slice(0, 2), v: n.length, color: C1, tip: `${DAYS[d]}: ${n.length} prijzen` }; });
    const tagCount = (k) => (k === "all" ? PRIZES.length : k === "p1" ? firsts.length : PRIZES.filter((p) => p.tags.includes(k)).length);
    box.innerHTML = `
      <h2>De erelijst geanalyseerd</h2>
      <div class="chips" role="group" aria-label="Filter op soort prijs">
        ${TAGS.filter(([k]) => tagCount(k)).map(([k, label]) => `<button class="chip" data-tag="${k}" aria-pressed="${AN.tag === k}">${label}<span class="n">${tagCount(k)}</span></button>`).join("")}
      </div>
      <div class="card"><h3>Prijzen per jaar</h3>
        <p class="muted small"><span class="key" style="--c:${RAMP[0]}">1e</span> <span class="key" style="--c:${RAMP[1]}">2e</span> <span class="key" style="--c:${RAMP[2]}">3e</span> <span class="key" style="--c:${RAMP[3]}">lager</span></p>
        ${vbars(yearItems, { every: 4, show: false })}</div>
      <div class="card" style="margin-top:18px"><h3>Prijzen opgeteld sinds ${y0}</h3>
        ${list.length ? lineChart("cumprize", [{ name: "Alle prijzen", color: C1, values: cumVals }, { name: "Eerste prijzen", color: C2, values: cumFirst }], cumTips, { xLabels: yearsAxis.map((y, i) => ({ i, label: String(y) })).filter((t) => Number(t.label) % 5 === 0) }) : "<p>Geen prijzen.</p>"}</div>
      <div class="grid grid-2" style="margin-top:18px">
        <div class="card"><h3>In welke maand</h3>${vbars(months)}</div>
        <div class="card"><h3>Op welke dag</h3>${vbars(days)}<p class="muted small">De meeste toernooien waren in het weekend.</p></div>
      </div>`;
    bindLineCharts(box);
    box.querySelectorAll("[data-tag]").forEach((b) => b.addEventListener("click", () => { AN.tag = b.dataset.tag; renderPrizeAnalysis(); }));
  }

  function afterAnalyse() {
    document.querySelectorAll(".filters select").forEach((s) => s.addEventListener("change", () => {
      AN[s.dataset.f] = s.value;
      renderAnalyseBody();
      renderDivision();
    }));
    renderAnalyseBody();
    renderDivision();
    renderPrizeAnalysis();
  }

  // ------------------------------------------------------------ timeline page
  function pageTimeline() {
    const items = [...TIMELINE.milestones].sort((a, b) => a.date.localeCompare(b.date));
    const years = new Date().getFullYear() - 1983;
    return `
      <div class="page-head">
        <div class="eyebrow">1983 – nu</div>
        <h1>${years} jaar darten</h1>
        <p>Van zijn eerste toernooi in café De Smidse tot de Eredivisie met DC Sport 2.0: de cafés waar Jos speelde en de mijlpalen onderweg.</p>
      </div>

      <section class="section">
        <h2>Zijn cafés</h2>
        <p class="muted">In de volgorde van zijn eigen verhaal. De pinnen op de kaart staan op straatniveau; alleen café Sport staat precies.</p>
        <div class="grid grid-2" style="align-items:start">
          <div id="cafe-map" class="map"></div>
          <ol class="cafes">
            ${TIMELINE.cafes.map((c, i) => `<li data-i="${i}" class="${c.home ? "home" : ""}">
              <b>${esc(c.name)}</b>${c.note ? ` <span class="muted">· ${esc(c.note)}</span>` : ""}<br>${esc(c.text)}</li>`).join("")}
          </ol>
        </div>
      </section>

      <section class="section">
        <h2>Mijlpalen</h2>
        <div class="timeline">
          ${items.map((m) => `<div class="tl-item">
            <div class="tl-date">${esc(m.label || longDate(m.date, false))}</div>
            <div class="tl-body card">
              ${m.image ? `<button class="tl-img" data-img="${esc(m.image)}" data-cap="${esc(m.title)}"><img src="${thumb(m.image)}" alt="" loading="lazy"></button>` : ""}
              <h3>${esc(m.title)}</h3><p>${esc(m.text)}</p>
              ${m.album ? `<a href="#/fotos/${esc(m.album)}">📷 Foto's</a>` : ""}
            </div></div>`).join("")}
          <div class="tl-item now"><div class="tl-date">Nu</div><div class="tl-body card">
            <h3>${SCHEDULE ? esc(SCHEDULE.team.name) + " in de " + esc(SCHEDULE.team.division) : "Nog steeds aan het darten"}</h3>
            <p>${SCHEDULE && nextMatch() ? `Volgende wedstrijd: ${esc(longDate(nextMatch().date))} tegen ${esc(nextMatch().opponent)}.` : "En nog lang niet klaar."}</p>
            <a href="#/wedstrijden">Naar mijn wedstrijden →</a></div></div>
        </div>
      </section>`;
  }

  function afterTimeline() {
    document.querySelectorAll(".tl-img").forEach((b) => b.addEventListener("click", () => lbOpen([{ id: b.dataset.img, caption: b.dataset.cap }], 0)));
    const el = document.getElementById("cafe-map");
    if (!el || !window.L) { if (el) el.innerHTML = `<p class="muted" style="padding:20px">De kaart kon niet worden geladen.</p>`; return; }
    const map = L.map(el, { scrollWheelZoom: false }).setView([52.486, 4.645], 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    const markers = [];
    const byPlace = {};  // cafe Sport appears twice in the story: one pin, two numbers
    TIMELINE.cafes.forEach((c, i) => { if (c.lat != null) (byPlace[`${c.lat},${c.lng}`] ||= []).push(i); });
    Object.values(byPlace).forEach((idx) => {
      const c = TIMELINE.cafes[idx[0]];
      const home = idx.some((i) => TIMELINE.cafes[i].home);
      const icon = L.divIcon({ className: "map-pin" + (home ? " home" : ""), html: `<span>${idx.map((i) => i + 1).join("·")}</span>`, iconSize: [idx.length > 1 ? 44 : 30, 30] });
      const marker = L.marker([c.lat, c.lng], { icon }).addTo(map).bindPopup(`<b>${esc(c.name.replace(" (weer)", ""))}</b><br>${esc(c.note)}`);
      idx.forEach((i) => { markers[i] = marker; });
    });
    const group = L.featureGroup(markers.filter(Boolean));
    if (markers.some(Boolean)) map.fitBounds(group.getBounds().pad(0.2));
    document.querySelectorAll(".cafes li").forEach((li) => li.addEventListener("click", () => {
      const m = markers[Number(li.dataset.i)];
      if (m) { map.setView(m.getLatLng(), 15); m.openPopup(); }
    }));
  }

  function pageNotFound() {
    return `<div class="page-head"><h1>Niet gevonden</h1><p>Deze pagina bestaat niet. <a href="#/">Terug naar home</a>.</p></div>`;
  }

  // ------------------------------------------------------------ lightbox
  const lb = document.querySelector(".lightbox");
  const lbImg = lb.querySelector("img");
  const lbCap = lb.querySelector("figcaption");
  const lbFig = lb.querySelector(".lb-figure");
  let lbList = [], lbIndex = 0, lbReturn = null;

  function lbShow(i) {
    lbIndex = (i + lbList.length) % lbList.length;
    const item = lbList[lbIndex];
    lbFig.classList.remove("zoom");
    lbImg.src = full(item.id);
    lbImg.alt = item.caption || "";
    lbCap.innerHTML = `${esc(item.caption || "")} <span style="opacity:.6">(${lbIndex + 1}/${lbList.length})</span>
      · <a href="${full(item.id)}" target="_blank" rel="noopener">open groot</a>`;
    lbImg.style.cursor = item.zoomable ? "zoom-in" : "default";
  }
  function lbOpen(list, i) {
    lbList = list; lbReturn = document.activeElement;
    lb.hidden = false; document.body.style.overflow = "hidden";
    lbShow(i);
    lb.querySelector(".lb-close").focus();
  }
  function lbClose() {
    lb.hidden = true; document.body.style.overflow = ""; lbImg.src = "";
    if (lbReturn) lbReturn.focus();
  }
  lb.querySelector(".lb-close").addEventListener("click", lbClose);
  lb.querySelector(".lb-prev").addEventListener("click", () => lbShow(lbIndex - 1));
  lb.querySelector(".lb-next").addEventListener("click", () => lbShow(lbIndex + 1));
  lb.addEventListener("click", (e) => { if (e.target === lb) lbClose(); });
  lbImg.addEventListener("click", () => { if (lbList[lbIndex]?.zoomable) lbFig.classList.toggle("zoom"); });
  document.addEventListener("keydown", (e) => {
    if (lb.hidden) return;
    if (e.key === "Escape") lbClose();
    if (e.key === "ArrowLeft") lbShow(lbIndex - 1);
    if (e.key === "ArrowRight") lbShow(lbIndex + 1);
  });
  let touchX = null;
  lb.addEventListener("touchstart", (e) => { touchX = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener("touchend", (e) => {
    if (touchX === null || lbFig.classList.contains("zoom")) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 50) lbShow(lbIndex + (dx < 0 ? 1 : -1));
    touchX = null;
  });

  function bindGallery(name, items) {
    const g = document.querySelector(`[data-gallery="${name}"]`);
    if (!g) return;
    g.querySelectorAll("[data-i]").forEach((b) => b.addEventListener("click", () => lbOpen(items, Number(b.dataset.i))));
  }

  // ------------------------------------------------------------ router
  const ROUTES = {
    "": [pageHome, afterHome],
    wedstrijden: [pageMatches, afterMatches],
    statistieken: [pageStats, afterStats],
    analyse: [pageAnalyse, afterAnalyse],
    tijdlijn: [pageTimeline, afterTimeline],
    live: [pageLive, afterLive],
    erelijst: [pagePrizes, afterPrizes],
    certificaten: [pageCertificates, afterCertificates],
    fotos: [pagePhotos],
    knipsels: [pageClippings, afterClippings],
    over: [pageAbout],
  };

  function route() {
    clearInterval(liveTimer);
    const hash = location.hash.replace(/^#\/?/, "");
    const [path, qs] = hash.split("?");
    const parts = path.split("/").filter(Boolean);
    const query = new URLSearchParams(qs || "");
    let html, after;
    if (parts[0] === "fotos" && parts[1]) {
      html = pageAlbum(parts[1]);
      after = () => afterAlbum(parts[1]);
    } else {
      const r = ROUTES[parts[0] || ""];
      html = r ? r[0](query) : pageNotFound();
      after = r && r[1] ? () => r[1](query) : null;
    }
    main.innerHTML = html;
    if (after) after();
    const section = parts[0] || "";
    const navSection = section === "analyse" ? "statistieken" : section;
    document.querySelectorAll(".nav a").forEach((a) => {
      const target = a.getAttribute("href").replace(/^#\/?/, "");
      a.toggleAttribute("aria-current", target === navSection);
      if (target === navSection) a.setAttribute("aria-current", "page");
    });
    document.querySelector(".nav").classList.remove("open");
    document.querySelector(".menu-btn").setAttribute("aria-expanded", "false");
    const titles = { "": "Darts", wedstrijden: "Mijn wedstrijden", live: "Darts live", statistieken: "Statistieken", analyse: "Analyse", tijdlijn: "Tijdlijn", erelijst: "Erelijst", certificaten: "Certificaten", fotos: "Foto's", knipsels: "Knipsels", over: "Over mij" };
    document.title = `Jos Tiebosch · ${titles[section] || "Darts"}`;
    window.scrollTo(0, 0);
  }

  document.querySelector(".menu-btn").addEventListener("click", (e) => {
    const nav = document.querySelector(".nav");
    nav.classList.toggle("open");
    e.currentTarget.setAttribute("aria-expanded", nav.classList.contains("open"));
  });
  window.addEventListener("hashchange", route);
  route();
})();
