/* Jos Tiebosch darts site: hash-routed single page, works from file:// and any static host. */
(() => {
  "use strict";

  const SITE = window.SITE || {};
  const PRIZES = window.PRIZES || [];
  const MEDIA = window.MEDIA || { albums: [], certificates180: [], certificatesOther: [], clippings: [], portraits: {}, videos: [] };
  const SCHEDULE = window.SCHEDULE || null;
  const NEWS = window.NEWS || { pdc: [], nos: [], videos: [] };
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
        ${big ? `<a class="btn ghost" href="${esc(SCHEDULE.team.icalUrl)}">Zet in mijn agenda</a>` : `<a class="btn ghost" href="#/wedstrijden">Heel het programma</a>`}
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
        ${p ? `<div class="card">
          <div class="eyebrow">Jos dit seizoen</div>
          <div class="stats" style="margin:8px 0 12px">
            <div class="stat"><b>${esc(p.n180 || "0")}</b><span>keer 180</span></div>
            <div class="stat"><b>${esc(p.singlesWin || "0")}%</b><span>singles gewonnen</span></div>
            <div class="stat"><b>${esc(p.pairsWin || "0")}%</b><span>koppels gewonnen</span></div>
          </div>
          ${p.longestStreak ? `<p>Langste reeks gewonnen singles: <b>${esc(p.longestStreak)}</b></p>` : ""}
          <a href="${esc(p.url)}" target="_blank" rel="noopener">Alle partijen van Jos op Teambeheer →</a>
        </div>` : ""}
      </div>

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
      <div class="notice">De oude website had een gat tussen 2012 en 2015, en prijzen van na mei 2022 staan er nog niet in. Die vullen we later aan.</div>`;
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
    const startYear = 1989, endYear = Number(certs[certs.length - 1].season.slice(0, 4));
    const bySeason = Object.fromEntries(certs.map((c) => [c.season, c]));
    const seasons = [];
    for (let y = startYear; y <= endYear; y++) seasons.push(`${y}-${y + 1}`);
    const max = Math.max(...certs.map((c) => c.count));
    const best = certs.reduce((a, b) => (b.count > a.count ? b : a));
    return `
      <div class="page-head">
        <h1>Certificaten</h1>
        <p>Elk seizoen reikte de Dartvereniging Kennemerland een certificaat uit voor het aantal keer 180 in de competitie.
        Samen goed voor <b>${total180} keer 180</b>. Het topseizoen was ${esc(best.season)} met ${best.count} stuks.</p>
      </div>
      <div class="card">
        <h3>Aantal keer 180 per seizoen</h3>
        <div class="bars" style="--n:${seasons.length}">
          ${seasons.map((s) => bySeason[s]
            ? `<div class="bar" style="height:${(bySeason[s].count / max) * 100}%" title="${s}: ${bySeason[s].count}× 180"><span>${bySeason[s].count}</span></div>`
            : `<div class="bar gap" style="height:12%" title="${s}: geen certificaat bewaard"></div>`).join("")}
        </div>
        <div class="bar-labels" style="--n:${seasons.length}">${seasons.map((s) => `<div>'${s.slice(2, 4)}</div>`).join("")}</div>
        <p class="muted small" style="margin-top:10px">Gearceerd: van dat seizoen is (nog) geen certificaat bewaard.</p>
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
    shown.forEach((s, i) => {
      const target = box.querySelector(`[data-sec="${i}"]`);
      s.nodes.forEach((n) => target.appendChild(n));
    });
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
    wedstrijden: [pageMatches],
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
    document.querySelectorAll(".nav a").forEach((a) => {
      const target = a.getAttribute("href").replace(/^#\/?/, "");
      a.toggleAttribute("aria-current", target === section);
      if (target === section) a.setAttribute("aria-current", "page");
    });
    document.querySelector(".nav").classList.remove("open");
    document.querySelector(".menu-btn").setAttribute("aria-expanded", "false");
    const titles = { "": "Darts", wedstrijden: "Mijn wedstrijden", live: "Darts live", erelijst: "Erelijst", certificaten: "Certificaten", fotos: "Foto's", knipsels: "Knipsels", over: "Over mij" };
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
