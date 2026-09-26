(() => {
  "use strict";

  const KEY = "brawllog.v2";
  const OLD_KEY = "brawllog.v1";
  const SEEDED_KEY = "brawllog.seeded";
  const MAX_ROUNDS = 3;

  const MODES = ["Knockout", "Kopfgeldjagd", "Brawlball", "Juwelenjagd", "Tresorraub", "Zone sichern", "Showdown", "Duo-Showdown", "Wipeout"];
  const BRAWLERS = ["Shelly", "Colt", "Bull", "Brock", "Rico", "Spike", "Barley", "Jessie", "Nita", "Dynamike", "El Primo", "Mortis", "Crow", "Poco", "Bo", "Piper", "Pam", "Tara", "Darryl", "Penny", "Frank", "Gene", "Tick", "Leon", "Rosa", "Carl", "Bibi", "8-Bit", "Sandy", "Bea", "Emz", "Mr. P", "Max", "Jacky", "Gale", "Nani", "Sprout", "Surge", "Colette", "Amber", "Lou", "Byron", "Edgar", "Ruffs", "Stu", "Belle", "Squeak", "Grom", "Buzz", "Griff", "Ash", "Meg", "Lola", "Fang", "Eve", "Janet", "Bonnie", "Otis", "Sam", "Gus", "Buster", "Chester", "Gray", "Mandy", "R-T", "Willow", "Maisie", "Hank", "Cordelius", "Doug", "Pearl", "Chuck", "Charlie", "Mico", "Kit", "Larry & Lawrie", "Melodie", "Angelo", "Draco", "Lily", "Berry", "Clancy", "Moe", "Kenji", "Shade", "Juju"];

  const SEED_TEXT = `Knockout 1 Runde: 0 Mal gestorben!
Knockout 2 Runde: 0 Mal gestorben!
Knockout 3 Runde: 1 Mal gestorben!
Knockout 4 Runde: 0 Mal gestorben!
-----------------------------------------------
Brawler: Brock
Kopfgeldjagd 1 Runde: 0 Mal gestorben!
Kopfgeldjagd 2 Runde: 0 Mal gestorben!
Kills: 2
Schaden: ca. 45.000
-----------------------------------------------
Brawler: Cordelius
Brawlball 1 Runde: 5 Mal gestorben!
Brawlball 2 Runde: 1 Mal gestorben!
Kills: 5
Schaden: 62625
-----------------------------------------------
Brawler: Piper
Kopfgeldjagd 1 Runde: 3 Mal gestorben!
Kopfgeldjagd 1 Runde: 2 Mal gestorben!
Kills 2
-----------------------------------------------
Brawler: Edgar
Brawlball 1 Runde: 2 Mal gestorben!
Brawlball 2 Runde: X Mal gestorben!
Brawlball 3 Runde: X Mal gestorben!
Kills 13; Deafs: 12
Schaden: ca: 130.000`;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const nf = new Intl.NumberFormat("de-AT");
  const nf1 = new Intl.NumberFormat("de-AT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const dfLong = new Intl.DateTimeFormat("de-AT", { weekday: "long", day: "numeric", month: "long" });
  const dfShort = new Intl.DateTimeFormat("de-AT", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });

  /* ================= Helpers ================= */
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const pad = (n) => String(n).padStart(2, "0");
  const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => isoOf(new Date());
  const dateOf = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };
  const isIso = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "");

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function parseNumber(str) {
    if (str === null || str === undefined) return null;
    const s = String(str).trim();
    if (!s) return null;
    const digits = s.replace(/[.\s,']/g, "");
    if (!/^\d+$/.test(digits)) return NaN;
    return parseInt(digits, 10);
  }

  function dayLabel(iso) {
    const diff = Math.round((dateOf(today()) - dateOf(iso)) / 86400000);
    if (diff === 0) return "Heute";
    if (diff === 1) return "Gestern";
    if (diff === -1) return "Morgen";
    return diff > 0 ? `Vor ${diff} Tagen` : `In ${-diff} Tagen`;
  }

  function kd(kills, deaths) {
    if (!kills && !deaths) return "–";
    return nf1.format(deaths ? kills / deaths : kills);
  }

  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2400);
  }

  /* ================= Model ================= */
  // Game: { id, created, date, brawler, mode, rounds: [{ result: "W"|"L"|null, deaths: number|null }],
  //         result: "W"|"L"|null, kills, deathsTotal, damage, damageApprox, note }
  let games = [];

  function deriveResult(rounds) {
    const w = rounds.filter((r) => r.result === "W").length;
    const l = rounds.filter((r) => r.result === "L").length;
    if (w > l) return "W";
    if (l > w) return "L";
    return null;
  }

  const gameResult = (g) => g.result ?? null;

  function gameDeaths(g) {
    if (typeof g.deathsTotal === "number") return g.deathsTotal;
    return g.rounds.reduce((s, r) => s + (typeof r.deaths === "number" ? r.deaths : 0), 0);
  }
  const deathsPartial = (g) => typeof g.deathsTotal !== "number" && g.rounds.some((r) => r.deaths === null);

  function summarize(list) {
    const s = { games: list.length, w: 0, l: 0, open: 0, kills: 0, deaths: 0, damage: 0, rounds: 0 };
    for (const g of list) {
      const r = gameResult(g);
      if (r === "W") s.w++; else if (r === "L") s.l++; else s.open++;
      s.kills += g.kills || 0;
      s.deaths += gameDeaths(g);
      s.damage += g.damage || 0;
      s.rounds += g.rounds.length;
    }
    s.winrate = s.w + s.l ? s.w / (s.w + s.l) : null;
    return s;
  }

  const byTime = (a, b) => (a.date || "").localeCompare(b.date || "") || a.created - b.created;
  const gamesOn = (iso) => games.filter((g) => g.date === iso).sort(byTime);
  const playedDays = () => [...new Set(games.map((g) => g.date))].sort();

  /* ================= Storage ================= */
  function normalizeGame(g, i = 0) {
    const rounds = (Array.isArray(g.rounds) ? g.rounds : []).slice(0, MAX_ROUNDS).map((r) => ({
      result: r && (r.result === "W" || r.result === "L") ? r.result : null,
      deaths: r && typeof r.deaths === "number" && r.deaths >= 0 ? r.deaths : null,
    }));
    if (!rounds.length) rounds.push({ result: null, deaths: null });
    const result = g.result === "W" || g.result === "L" ? g.result : deriveResult(rounds);
    return {
      id: g.id || uid() + i,
      created: typeof g.created === "number" ? g.created : Date.now() + i,
      date: isIso(g.date) ? g.date : today(),
      brawler: (g.brawler || "").trim(),
      mode: (g.mode || "Unbekannt").trim(),
      rounds,
      result,
      kills: typeof g.kills === "number" ? g.kills : null,
      deathsTotal: typeof g.deathsTotal === "number" ? g.deathsTotal : null,
      damage: typeof g.damage === "number" ? g.damage : null,
      damageApprox: !!g.damageApprox,
      note: g.note || "",
    };
  }

  // v1 stored one block per entry, sometimes with more than 3 rounds. Split into games of max. 3 rounds.
  function migrateV1(old) {
    const out = [];
    old.forEach((e, i) => {
      const rounds = (e.rounds || []).map((r) => ({ result: null, deaths: typeof r.deaths === "number" ? r.deaths : null }));
      const chunks = [];
      for (let k = 0; k < Math.max(rounds.length, 1); k += MAX_ROUNDS) chunks.push(rounds.slice(k, k + MAX_ROUNDS));
      chunks.forEach((chunk, c) => {
        out.push(normalizeGame({
          ...e,
          id: c === 0 ? e.id : undefined,
          created: (e.created || Date.now()) + c,
          rounds: chunk,
          result: null,
          kills: c === 0 ? e.kills : null,
          deathsTotal: c === 0 ? e.deathsTotal : null,
          damage: c === 0 ? e.damage : null,
          damageApprox: c === 0 ? e.damageApprox : false,
        }, i * 10 + c));
      });
    });
    return out;
  }

  /*
   * Storage has two layers:
   *  1. server  – data/games.json on disk, via server.js (/api/games). Source of truth.
   *  2. browser – localStorage copy, used as cache and as fallback when no server runs.
   * storageMode: "server" | "browser" | "none"
   */
  let storageMode = "none";
  let localOk = true;

  function writeLocal() {
    try { localStorage.setItem(KEY, JSON.stringify(games)); localOk = true; }
    catch { localOk = false; }
  }

  function loadLocal() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const data = JSON.parse(raw);
        games = Array.isArray(data) ? data.map(normalizeGame) : [];
        return;
      }
      const old = localStorage.getItem(OLD_KEY);
      if (old) {
        const data = JSON.parse(old);
        games = Array.isArray(data) ? migrateV1(data) : [];
        writeLocal();
        return;
      }
      if (!localStorage.getItem(SEEDED_KEY)) {
        games = parsedToGames(parseText(SEED_TEXT), today());
        localStorage.setItem(SEEDED_KEY, "1");
        writeLocal();
      }
    } catch {
      localOk = false;
      games = [];
    }
  }

  async function fetchWithTimeout(url, opts = {}, ms = 4000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try { return await fetch(url, { ...opts, signal: ctrl.signal, cache: "no-store" }); }
    finally { clearTimeout(t); }
  }

  async function loadServer() {
    if (location.protocol === "file:") return false;
    try {
      const res = await fetchWithTimeout("api/games");
      if (!res.ok) return false;
      const data = await res.json();
      if (data.exists) {
        games = (data.games || []).map(normalizeGame);
        writeLocal();
      } else {
        // First start with the server: take over what the browser already has.
        await putServer();
      }
      return true;
    } catch {
      return false;
    }
  }

  async function putServer() {
    const res = await fetchWithTimeout("api/games", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(games),
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
  }

  // Writes are chained so an older snapshot never overwrites a newer one.
  let saveChain = Promise.resolve();
  function save() {
    writeLocal();
    if (storageMode !== "server") {
      if (!localOk) toast("Speichern fehlgeschlagen – Browser blockiert den Speicher");
      renderStorageStatus();
      return;
    }
    setStatus("saving");
    saveChain = saveChain
      .then(putServer)
      .then(() => setStatus("server"))
      .catch(() => {
        setStatus("error");
        toast("Server nicht erreichbar – Spiel nur im Browser gesichert");
      });
  }

  function setStatus(state) {
    const el = $("#save-status");
    if (!el) return;
    const text = {
      server: "In Datei gespeichert",
      saving: "Speichert …",
      error: "Nicht in Datei gespeichert",
      browser: localOk ? "Nur im Browser" : "Wird nicht gespeichert",
    }[state];
    el.dataset.state = state;
    el.textContent = text;
  }

  function renderStorageStatus() {
    const serverOk = storageMode === "server";
    setStatus(serverOk ? "server" : "browser");
    $("#storage-warning").hidden = serverOk;
    $("#storage-hint").textContent = serverOk ? "Gespeichert in data/games.json" : "Daten liegen nur in diesem Browser";
  }

  /* ================= Text parser ================= */
  function lineResult(line) {
    if (/\b(sieg|gewonnen|win|won)\b/i.test(line) || /\bW\b/.test(line)) return "W";
    if (/\b(niederlage|verloren|lose|lost|loss)\b/i.test(line) || /\bL\b/.test(line)) return "L";
    return null;
  }

  function parseText(text) {
    const blocks = text.split(/^\s*-{3,}\s*$/m);
    const out = [];
    for (const block of blocks) {
      const lines = block.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (!lines.length) continue;
      const b = { brawler: "", mode: "", rounds: [], kills: null, deathsTotal: null, damage: null, damageApprox: false, result: null, warnings: [] };
      for (const line of lines) {
        let m;
        if ((m = line.match(/^brawler\s*:?\s*(.+)$/i))) { b.brawler = m[1].trim(); continue; }
        if ((m = line.match(/^(.+?)\s+(\d+)\.?\s*runde\s*:?\s*(\d+|x|\?|-)\s*mal/i))) {
          if (!b.mode) b.mode = m[1].trim();
          b.rounds.push({ deaths: /^\d+$/.test(m[3]) ? parseInt(m[3], 10) : null, result: lineResult(line.slice(m[0].length)) });
          continue;
        }
        if ((m = line.match(/^(ergebnis|result)\s*:?\s*(.+)$/i))) { b.result = lineResult(m[2]); continue; }
        let hit = false;
        if ((m = line.match(/kills\s*:?\s*([\d.]+)/i))) { b.kills = parseNumber(m[1]); hit = true; }
        if ((m = line.match(/(?:deaths|deafs|tode)\s*:?\s*([\d.]+)/i))) { b.deathsTotal = parseNumber(m[1]); hit = true; }
        if ((m = line.match(/schaden\s*:?\s*(ca\.?\s*:?)?\s*([\d.,\s]+)/i))) { b.damage = parseNumber(m[2]); b.damageApprox = !!m[1]; hit = true; }
        if (!hit) b.warnings.push(`Nicht erkannt: „${line}“`);
      }
      if (!b.rounds.length && !b.brawler && b.kills === null) continue;
      if (!b.mode) b.mode = "Unbekannt";
      if (!b.rounds.length) { b.rounds.push({ deaths: null, result: null }); b.warnings.push("Keine Runden gefunden"); }

      // A game has max. 3 rounds. More rounds in one block = several games.
      for (let k = 0; k < b.rounds.length; k += MAX_ROUNDS) {
        const first = k === 0;
        const rounds = b.rounds.slice(k, k + MAX_ROUNDS);
        out.push({
          brawler: b.brawler, mode: b.mode, rounds,
          result: first && b.result ? b.result : deriveResult(rounds),
          kills: first ? b.kills : null,
          deathsTotal: first ? b.deathsTotal : null,
          damage: first ? b.damage : null,
          damageApprox: first ? b.damageApprox : false,
          warnings: first ? b.warnings : [],
          split: b.rounds.length > MAX_ROUNDS,
        });
      }
    }
    return out;
  }

  function parsedToGames(parsed, date) {
    const base = Date.now();
    return parsed.map((p, i) => normalizeGame({ ...p, id: uid() + i, created: base + i, date }, i));
  }

  /* ================= Visual building blocks ================= */
  const RESULT_TEXT = { W: "Sieg", L: "Niederlage" };
  const cls = (r) => (r === "W" ? "w" : r === "L" ? "l" : "o");
  const letter = (r) => r || "?";

  function ringSVG(winrate) {
    const r = 50, c = 2 * Math.PI * r;
    const has = winrate !== null;
    const off = has ? c * (1 - winrate) : c;
    return `
      <svg viewBox="0 0 120 120" role="img" aria-label="${has ? `Winrate ${Math.round(winrate * 100)} Prozent` : "Keine Ergebnisse"}">
        <circle class="track ${has ? "" : "none"}" cx="60" cy="60" r="${r}" fill="none" stroke-width="12"/>
        <circle class="arc" cx="60" cy="60" r="${r}" fill="none" stroke-width="12" stroke-linecap="butt"
          stroke-dasharray="${c}" stroke-dashoffset="${c}" data-off="${off}" transform="rotate(-90 60 60)"/>
        <text class="pct" x="60" y="62" text-anchor="middle" dominant-baseline="middle">${has ? Math.round(winrate * 100) + "%" : "–"}</text>
        <text class="pct-label" x="60" y="84" text-anchor="middle">Winrate</text>
      </svg>`;
  }

  function animateRing(root) {
    const arc = $(".arc", root);
    if (!arc) return;
    if (reduceMotion || document.hidden) { arc.style.strokeDashoffset = arc.dataset.off; return; }
    requestAnimationFrame(() => requestAnimationFrame(() => { arc.style.strokeDashoffset = arc.dataset.off; }));
  }

  function countUp(el) {
    const target = parseFloat(el.dataset.count);
    const dec = el.dataset.dec === "1";
    const fmt = dec ? nf1 : nf;
    if (reduceMotion || document.hidden || !target) { el.textContent = fmt.format(target || 0); return; }
    const start = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - start) / 800);
      const v = target * (1 - Math.pow(1 - p, 4));
      el.textContent = fmt.format(dec ? v : Math.round(v));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function statItems(s) {
    const items = [
      ["Spiele", s.games, 0, `${s.rounds} ${s.rounds === 1 ? "Runde" : "Runden"}`],
      ["Kills", s.kills, 0],
      ["Tode", s.deaths, 0],
      ["K/D", s.deaths ? s.kills / s.deaths : s.kills, 1],
      ["Schaden", s.damage, 0],
      ["Ø Schaden", s.games ? Math.round(s.damage / s.games) : 0, 0, "pro Spiel"],
    ];
    return items.map(([label, value, dec, sub]) => `
      <div class="stat"><dt>${label}</dt><dd><span data-count="${value}" data-dec="${dec}">0</span>${sub ? `<small>${sub}</small>` : ""}</dd></div>`).join("");
  }

  function renderRecord(prefix, s) {
    $(`#${prefix}-w`).dataset.count = s.w;
    $(`#${prefix}-l`).dataset.count = s.l;
    countUp($(`#${prefix}-w`));
    countUp($(`#${prefix}-l`));
    $(`#${prefix}-open`).textContent = s.open ? `+ ${s.open} ${s.open === 1 ? "Spiel" : "Spiele"} ohne Ergebnis` : "";
    const ring = $(`#${prefix}-ring`);
    ring.innerHTML = ringSVG(s.winrate);
    animateRing(ring);
    const stats = $(`#${prefix}-stats`);
    stats.innerHTML = statItems(s);
    $$("[data-count]", stats).forEach(countUp);
  }

  /* ================= View: Tag ================= */
  let currentDay = today();

  function gameCard(g, idx) {
    const r = gameResult(g);
    const deaths = gameDeaths(g);
    return `
      <li class="game is-${cls(r)}" style="animation-delay:${Math.min(idx, 8) * 50}ms">
        <div class="game-result" aria-label="${RESULT_TEXT[r] || "Ergebnis offen"}">
          <b aria-hidden="true">${letter(r)}</b>
          <small aria-hidden="true">${RESULT_TEXT[r] || "offen"}</small>
        </div>
        <div class="game-body">
          <div class="game-top">
            <h3>${esc(g.brawler || "Ohne Brawler")}</h3>
            <span class="chip">${esc(g.mode)}</span>
            <span class="game-no">Spiel ${idx + 1}</span>
          </div>
          <ol class="pips">
            ${g.rounds.map((rd, i) => `
              <li class="pip">
                <span class="badge ${cls(rd.result)}" aria-label="${RESULT_TEXT[rd.result] || "offen"}">${letter(rd.result)}</span>
                <span class="pip-text"><b>RUNDE ${i + 1}</b>${rd.deaths === null ? "? Tode" : `${rd.deaths} ${rd.deaths === 1 ? "Tod" : "Tode"}`}</span>
              </li>`).join("")}
          </ol>
          <dl class="game-stats">
            <div><dt>Kills</dt><dd>${g.kills === null ? "–" : nf.format(g.kills)}</dd></div>
            <div><dt>Tode</dt><dd>${nf.format(deaths)}${deathsPartial(g) ? "+" : ""}</dd></div>
            <div><dt>K/D</dt><dd>${g.kills === null ? "–" : kd(g.kills, deaths)}</dd></div>
            <div><dt>Schaden</dt><dd>${g.damage === null ? "–" : (g.damageApprox ? "ca. " : "") + nf.format(g.damage)}</dd></div>
          </dl>
          ${g.note ? `<p class="game-note">${esc(g.note)}</p>` : ""}
          <div class="game-actions">
            <button type="button" class="btn btn-sm" data-edit="${g.id}">Bearbeiten</button>
            <button type="button" class="btn btn-sm btn-ghost" data-delete="${g.id}">Löschen</button>
          </div>
        </div>
      </li>`;
  }

  function renderDay(dir = 0) {
    const day = currentDay;
    const list = gamesOn(day);
    const days = playedDays();

    const label = $(".day-label");
    $("#day-eyebrow").textContent = dayLabel(day);
    $("#day-title").textContent = dfLong.format(dateOf(day));
    $("#day-picker").value = day;
    if (dir && !reduceMotion) {
      label.classList.remove("slide");
      label.style.setProperty("--dir", dir > 0 ? "16px" : "-16px");
      void label.offsetWidth;
      label.classList.add("slide");
    }

    $("#day-prev").disabled = !days.some((d) => d < day);
    $("#day-next").disabled = !days.some((d) => d > day);
    $("#day-today").disabled = day === today();

    const empty = list.length === 0;
    $("#day-empty").hidden = !empty;
    $("#day-content").hidden = empty;
    if (empty) {
      const last = [...days].reverse().find((d) => d !== day);
      const btn = $("#day-empty-last");
      btn.hidden = !last;
      if (last) { btn.textContent = `Letzter Spieltag: ${dfShort.format(dateOf(last))}`; btn.dataset.day = last; }
      return;
    }

    renderRecord("day", summarize(list));

    $("#day-guide").innerHTML = list.map((g, i) => {
      const r = gameResult(g);
      return `<li class="tile" style="animation-delay:${i * 45}ms">
        <span class="badge ${cls(r)}" role="img" aria-label="Spiel ${i + 1}: ${RESULT_TEXT[r] || "offen"}, ${esc(g.brawler || "ohne Brawler")}">${letter(r)}</span>
        <small>${esc(g.brawler || g.mode)}</small>
      </li>`;
    }).join("");

    $("#day-games-count").textContent = `${list.length} ${list.length === 1 ? "Spiel" : "Spiele"}`;
    $("#day-games").innerHTML = list.map(gameCard).join("");
  }

  function goDay(iso, dir = 0) {
    currentDay = iso;
    const target = `#tag/${iso}`;
    if (location.hash !== target) { pendingDir = dir; location.hash = target; }
    else renderDay(dir);
  }
  let pendingDir = 0;

  /* ================= View: Gesamt ================= */
  function winrateCell(s) {
    if (s.winrate === null) return `<div class="wr"><span class="wr-bar none"></span><b>–</b></div>`;
    const pct = Math.round(s.winrate * 100);
    return `<div class="wr"><span class="wr-bar"><span data-w="${pct}"></span></span><b>${pct}%</b></div>`;
  }
  const recCell = (s) => `<span class="rec"><span class="w">${s.w}</span> : <span class="l">${s.l}</span></span>`;

  function groupBy(keyFn) {
    const map = new Map();
    for (const g of games) {
      const k = keyFn(g);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(g);
    }
    return map;
  }

  function renderAll() {
    const empty = games.length === 0;
    $("#all-empty").hidden = !empty;
    $("#all-content").hidden = empty;
    if (empty) return;

    renderRecord("all", summarize(games));

    const days = [...groupBy((g) => g.date).entries()].sort((a, b) => b[0].localeCompare(a[0]));
    $("#days-table").innerHTML = `
      <thead><tr><th>Tag</th><th>Spiele</th><th>S : N</th><th>Winrate</th><th class="num">Kills</th><th class="num">K/D</th><th class="num">Schaden</th></tr></thead>
      <tbody>${days.map(([d, list]) => {
        const s = summarize(list);
        const sorted = list.sort(byTime);
        return `<tr class="clickable" data-day="${d}">
          <td><button type="button" class="day-link" data-day="${d}">${esc(dfShort.format(dateOf(d)))}</button></td>
          <td><span class="mini" aria-hidden="true">${sorted.map((g) => `<i class="${cls(gameResult(g))}"></i>`).join("")}</span> ${s.games}</td>
          <td>${recCell(s)}</td>
          <td>${winrateCell(s)}</td>
          <td class="num">${nf.format(s.kills)}</td>
          <td class="num">${kd(s.kills, s.deaths)}</td>
          <td class="num">${nf.format(s.damage)}</td>
        </tr>`;
      }).join("")}</tbody>`;

    const brawlers = [...groupBy((g) => g.brawler || "Ohne Brawler").entries()]
      .map(([name, list]) => ({ name, s: summarize(list), none: name === "Ohne Brawler" }))
      .sort((a, b) => (a.none - b.none) || (b.s.games - a.s.games) || (b.s.kills - a.s.kills));
    $("#brawler-table").innerHTML = `
      <thead><tr><th>Brawler</th><th class="num">Spiele</th><th>S : N</th><th>Winrate</th><th class="num">Kills</th><th class="num">Tode</th><th class="num">K/D</th><th class="num">Schaden</th></tr></thead>
      <tbody>${brawlers.map(({ name, s }) => `<tr>
        <td class="name">${esc(name)}</td>
        <td class="num">${s.games}</td>
        <td>${recCell(s)}</td>
        <td>${winrateCell(s)}</td>
        <td class="num">${nf.format(s.kills)}</td>
        <td class="num">${nf.format(s.deaths)}</td>
        <td class="num">${kd(s.kills, s.deaths)}</td>
        <td class="num">${nf.format(s.damage)}</td>
      </tr>`).join("")}</tbody>`;

    const modes = [...groupBy((g) => g.mode).entries()]
      .map(([name, list]) => ({ name, s: summarize(list) }))
      .sort((a, b) => b.s.games - a.s.games);
    $("#mode-table").innerHTML = `
      <thead><tr><th>Modus</th><th class="num">Spiele</th><th>S : N</th><th>Winrate</th><th class="num">Ø Tode / Runde</th><th class="num">K/D</th></tr></thead>
      <tbody>${modes.map(({ name, s }) => `<tr>
        <td class="name">${esc(name)}</td>
        <td class="num">${s.games}</td>
        <td>${recCell(s)}</td>
        <td>${winrateCell(s)}</td>
        <td class="num">${s.rounds ? nf1.format(s.deaths / s.rounds) : "–"}</td>
        <td class="num">${kd(s.kills, s.deaths)}</td>
      </tr>`).join("")}</tbody>`;

    const fill = () => $$("#all-content [data-w]").forEach((el) => { el.style.width = el.dataset.w + "%"; });
    if (document.hidden) fill();
    else requestAnimationFrame(() => requestAnimationFrame(fill));
  }

  /* ================= View: Form ================= */
  let editingId = null;
  let formRounds = [];
  let formResult = null;

  function setSeg(root, attr, value) {
    $$(`button[${attr}]`, root).forEach((b) => b.setAttribute("aria-checked", String(b.getAttribute(attr) === String(value ?? ""))));
  }

  function renderRoundCards() {
    setSeg($("#round-count"), "data-count", formRounds.length);
    $("#rounds").innerHTML = formRounds.map((r, i) => `
      <div class="round-card" data-i="${i}">
        <h3>Runde ${i + 1}</h3>
        <div class="wl" role="group" aria-label="Ergebnis Runde ${i + 1}">
          <button type="button" data-v="W" aria-pressed="${r.result === "W"}">W</button>
          <button type="button" data-v="L" aria-pressed="${r.result === "L"}">L</button>
        </div>
        <span class="deaths-label" id="dl-${i}">Tode</span>
        <div class="stepper">
          <button type="button" data-step="-1" aria-label="Tode in Runde ${i + 1} verringern" ${r.deaths === null ? "disabled" : ""}>−</button>
          <input type="number" min="0" inputmode="numeric" aria-labelledby="dl-${i}" value="${r.deaths ?? ""}" ${r.deaths === null ? "disabled" : ""}>
          <button type="button" data-step="1" aria-label="Tode in Runde ${i + 1} erhöhen" ${r.deaths === null ? "disabled" : ""}>+</button>
        </div>
        <label class="unknown"><input type="checkbox" ${r.deaths === null ? "checked" : ""}> weiß ich nicht mehr</label>
      </div>`).join("");
  }

  // Result follows the rounds until the user picks one by hand.
  let resultManual = false;
  function syncResultFromRounds() {
    if (!resultManual) formResult = deriveResult(formRounds);
    setSeg($("#result-seg"), "data-result", formResult);
  }

  function resetForm(date) {
    editingId = null;
    $("#game-form").reset();
    $("#f-date").value = date || today();
    formRounds = [{ result: null, deaths: 0 }, { result: null, deaths: 0 }];
    formResult = null;
    resultManual = false;
    renderRoundCards();
    setSeg($("#result-seg"), "data-result", formResult);
    $("#form-eyebrow").textContent = "Neues Spiel";
    $("#h-neu").textContent = "Spiel eintragen";
    $("#submit-btn").textContent = "Spiel speichern";
    $("#cancel-edit").hidden = true;
    $(".more").open = false;
    clearErrors();
  }

  function startEdit(id) {
    const g = games.find((x) => x.id === id);
    if (!g) return;
    editingId = id;
    $("#f-brawler").value = g.brawler;
    $("#f-mode").value = g.mode;
    $("#f-date").value = g.date;
    formRounds = g.rounds.map((r) => ({ ...r }));
    formResult = g.result;
    resultManual = g.result !== deriveResult(g.rounds);
    renderRoundCards();
    setSeg($("#result-seg"), "data-result", formResult);
    $("#f-kills").value = g.kills ?? "";
    $("#f-damage").value = g.damage === null ? "" : nf.format(g.damage).replace(/\s/g, ".");
    $("#f-approx").checked = g.damageApprox;
    $("#f-deaths").value = g.deathsTotal ?? "";
    $("#f-note").value = g.note;
    $(".more").open = g.deathsTotal !== null || !!g.note;
    $("#form-eyebrow").textContent = `${g.brawler || "Ohne Brawler"} · ${g.mode}`;
    $("#h-neu").textContent = "Spiel bearbeiten";
    $("#submit-btn").textContent = "Änderungen speichern";
    $("#cancel-edit").hidden = false;
    clearErrors();
    formOpenedForEdit = true;
    location.hash = "#neu";
  }
  let formOpenedForEdit = false;

  function clearErrors() {
    $$(".err").forEach((e) => (e.textContent = ""));
    $$("[aria-invalid]").forEach((e) => e.removeAttribute("aria-invalid"));
  }
  function setError(id, msg) {
    const el = $("#" + id);
    el.setAttribute("aria-invalid", "true");
    $(`.err[data-for="${id}"]`).textContent = msg;
  }

  function readForm() {
    clearErrors();
    let ok = true;
    const mode = $("#f-mode").value.trim();
    if (!mode) { setError("f-mode", "Modus fehlt."); ok = false; }

    const intField = (id) => {
      const v = $("#" + id).value.trim();
      if (v === "") return null;
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0) { setError(id, "Ganze Zahl ab 0."); ok = false; return null; }
      return n;
    };
    const kills = intField("f-kills");
    const deathsTotal = intField("f-deaths");
    let damage = parseNumber($("#f-damage").value);
    if (Number.isNaN(damage)) { setError("f-damage", "Nur Zahlen, z. B. 45.000"); ok = false; damage = null; }

    if (!ok) {
      const first = $("[aria-invalid='true']");
      if (first) { if (first.closest("details")) first.closest("details").open = true; first.focus(); }
      return null;
    }
    return {
      brawler: $("#f-brawler").value.trim(),
      mode,
      date: $("#f-date").value || today(),
      rounds: formRounds.map((r) => ({ result: r.result, deaths: r.deaths })),
      result: formResult,
      kills, deathsTotal, damage,
      damageApprox: $("#f-approx").checked,
      note: $("#f-note").value.trim(),
    };
  }

  function onSubmit(ev) {
    ev.preventDefault();
    const data = readForm();
    if (!data) { toast("Bitte Eingaben prüfen"); return; }
    if (editingId) {
      const i = games.findIndex((g) => g.id === editingId);
      if (i >= 0) games[i] = normalizeGame({ ...games[i], ...data });
      toast("Spiel aktualisiert");
    } else {
      games.push(normalizeGame({ id: uid(), created: Date.now(), ...data }));
      toast(data.result === "W" ? "Sieg gespeichert" : data.result === "L" ? "Niederlage gespeichert" : "Spiel gespeichert");
    }
    save();
    const d = data.date;
    resetForm(d);
    goDay(d);
  }

  function bindForm() {
    $("#game-form").addEventListener("submit", onSubmit);

    $("#round-count").addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-count]");
      if (!b) return;
      const n = Number(b.dataset.count);
      while (formRounds.length < n) formRounds.push({ result: null, deaths: 0 });
      formRounds.length = n;
      renderRoundCards();
      syncResultFromRounds();
    });

    const rounds = $("#rounds");
    rounds.addEventListener("click", (ev) => {
      const card = ev.target.closest(".round-card");
      if (!card) return;
      const r = formRounds[Number(card.dataset.i)];
      const wl = ev.target.closest(".wl button");
      if (wl) {
        r.result = r.result === wl.dataset.v ? null : wl.dataset.v;
        $$(".wl button", card).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === r.result)));
        syncResultFromRounds();
        return;
      }
      const step = ev.target.closest("[data-step]");
      if (step && r.deaths !== null) {
        r.deaths = Math.max(0, (r.deaths || 0) + Number(step.dataset.step));
        $("input[type=number]", card).value = r.deaths;
      }
    });
    rounds.addEventListener("input", (ev) => {
      const card = ev.target.closest(".round-card");
      if (!card || ev.target.type !== "number") return;
      const n = parseInt(ev.target.value, 10);
      formRounds[Number(card.dataset.i)].deaths = Number.isFinite(n) && n >= 0 ? n : 0;
    });
    rounds.addEventListener("change", (ev) => {
      const card = ev.target.closest(".round-card");
      if (!card || ev.target.type !== "checkbox") return;
      const r = formRounds[Number(card.dataset.i)];
      r.deaths = ev.target.checked ? null : 0;
      renderRoundCards();
      $(`.round-card[data-i="${card.dataset.i}"] input[type=checkbox]`).focus();
    });

    $("#result-seg").addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-result]");
      if (!b) return;
      formResult = b.dataset.result || null;
      resultManual = true;
      setSeg($("#result-seg"), "data-result", formResult);
    });

    $("#cancel-edit").addEventListener("click", () => {
      const d = games.find((g) => g.id === editingId)?.date || currentDay;
      resetForm();
      goDay(d);
    });
  }

  /* ================= Import ================= */
  let pending = [];

  function onParse() {
    pending = parseText($("#import-text").value);
    const box = $("#import-preview");
    if (!pending.length) {
      box.innerHTML = `<p class="warn">Nichts erkannt. Format z. B.: „Brawlball 1 Runde: 2 Mal gestorben! W“</p>`;
      $("#import-btn").disabled = true;
      return;
    }
    const splitNote = pending.some((p) => p.split) ? `<p class="hint-inline">Blöcke mit mehr als 3 Runden wurden in mehrere Spiele aufgeteilt.</p>` : "";
    box.innerHTML = `<p><strong>${pending.length} ${pending.length === 1 ? "Spiel" : "Spiele"} erkannt:</strong></p>${splitNote}<ol>${pending.map((p) => `
      <li><strong>${letter(p.result)}</strong> · ${esc(p.brawler || "Ohne Brawler")} · ${esc(p.mode)} · ${p.rounds.length} ${p.rounds.length === 1 ? "Runde" : "Runden"}
        ${p.kills !== null ? ` · ${p.kills} Kills` : ""}${p.damage ? ` · ${nf.format(p.damage)} Schaden` : ""}
        ${p.warnings.map((w) => `<br><span class="warn">${esc(w)}</span>`).join("")}</li>`).join("")}</ol>`;
    $("#import-btn").disabled = false;
  }

  function onImport() {
    if (!pending.length) return;
    const date = $("#import-date").value || today();
    const added = parsedToGames(pending, date);
    games.push(...added);
    save();
    pending = [];
    $("#import-text").value = "";
    $("#import-preview").innerHTML = "";
    $("#import-btn").disabled = true;
    toast(`${added.length} Spiele übernommen`);
    goDay(date);
  }

  function onWipe() {
    if (!games.length) { toast("Schon leer"); return; }
    if (!confirm(`Wirklich alle ${games.length} Spiele löschen? Das geht nicht rückgängig.`)) return;
    games = [];
    save();
    toast("Alles gelöscht");
    goDay(today());
  }

  /* ================= Routing ================= */
  const TABS = ["tag", "gesamt", "neu", "import"];

  function route(scroll = true) {
    const [tabRaw, arg] = location.hash.slice(1).split("/");
    const tab = TABS.includes(tabRaw) ? tabRaw : "tag";
    for (const id of TABS) $("#view-" + id).hidden = id !== tab;
    $$(".tabs a").forEach((a) => a.dataset.tab === tab ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));

    if (tab === "tag") {
      if (isIso(arg)) currentDay = arg;
      renderDay(pendingDir);
      pendingDir = 0;
    }
    if (tab === "gesamt") renderAll();
    if (tab === "neu") {
      if (!formOpenedForEdit && editingId) resetForm();
      formOpenedForEdit = false;
    }
    if (tab === "import" && !$("#import-date").value) $("#import-date").value = today();
    if (scroll) window.scrollTo({ top: 0, behavior: "auto" });
  }

  /* ================= Init ================= */
  async function init() {
    loadLocal();
    storageMode = (await loadServer()) ? "server" : "browser";
    renderStorageStatus();

    // Reload from disk when the tab comes back, so two open tabs don't drift apart.
    document.addEventListener("visibilitychange", async () => {
      if (document.hidden || storageMode !== "server" || editingId) return;
      await saveChain;
      if (await loadServer()) { renderStorageStatus(); route(false); }
    });

    $("#brawler-list").innerHTML = BRAWLERS.map((b) => `<option value="${esc(b)}">`).join("");
    $("#mode-list").innerHTML = MODES.map((m) => `<option value="${esc(m)}">`).join("");

    // Start on today; if nothing played today, open the latest day with games.
    const days = playedDays();
    currentDay = days.includes(today()) || !days.length ? today() : days[days.length - 1];

    bindForm();
    resetForm();

    $("#day-prev").addEventListener("click", () => {
      const prev = playedDays().filter((d) => d < currentDay).pop();
      if (prev) goDay(prev, -1);
    });
    $("#day-next").addEventListener("click", () => {
      const next = playedDays().find((d) => d > currentDay);
      if (next) goDay(next, 1);
    });
    $("#day-today").addEventListener("click", () => goDay(today(), 1));
    $("#day-picker").addEventListener("change", (ev) => { if (isIso(ev.target.value)) goDay(ev.target.value); });
    $("#day-empty-last").addEventListener("click", (ev) => goDay(ev.currentTarget.dataset.day, -1));
    $("#day-empty-add").addEventListener("click", () => { resetForm(currentDay); });

    $("#day-games").addEventListener("click", (ev) => {
      const edit = ev.target.closest("[data-edit]");
      const del = ev.target.closest("[data-delete]");
      if (edit) startEdit(edit.dataset.edit);
      if (del) {
        const g = games.find((x) => x.id === del.dataset.delete);
        if (g && confirm(`Spiel „${g.brawler || "Ohne Brawler"} · ${g.mode}“ löschen?`)) {
          games = games.filter((x) => x.id !== g.id);
          save();
          renderDay();
          toast("Spiel gelöscht");
        }
      }
    });

    $("#days-table").addEventListener("click", (ev) => {
      const row = ev.target.closest("[data-day]");
      if (row) goDay(row.dataset.day);
    });

    $("#parse-btn").addEventListener("click", onParse);
    $("#import-btn").addEventListener("click", onImport);
    $("#wipe-btn").addEventListener("click", onWipe);

    window.addEventListener("hashchange", () => route());
    route();
  }

  init();
})();
