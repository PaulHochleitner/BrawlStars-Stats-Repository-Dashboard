// Brawl Log – small local server without dependencies.
// Serves the website and stores all games in data/games.json.
// Start: node server.js   (then open http://localhost:5173)

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT) || 5173;
const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, "data");
const DATA_FILE = path.join(DATA_DIR, "games.json");
const BACKUP_FILE = path.join(DATA_DIR, "games.backup.json");
const MAX_BODY = 5 * 1024 * 1024;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};
const PUBLIC_FILES = new Set(["/index.html", "/styles.css", "/app.js"]);

function readGames() {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return Array.isArray(data) ? data : null;
  } catch (err) {
    if (err.code === "ENOENT") return null;
    console.error("games.json kaputt, lade Backup:", err.message);
    try { return JSON.parse(fs.readFileSync(BACKUP_FILE, "utf8")); } catch { return null; }
  }
}

function writeGames(games) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DATA_FILE)) fs.copyFileSync(DATA_FILE, BACKUP_FILE);
  // Write to a temp file first, then rename, so a crash never leaves a half-written file.
  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(games, null, 2), "utf8");
  fs.renameSync(tmp, DATA_FILE);
}

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(body);
}

function handleApi(req, res) {
  if (req.method === "GET") {
    const games = readGames();
    return send(res, 200, JSON.stringify({ exists: games !== null, games: games || [] }));
  }
  if (req.method === "PUT") {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) { send(res, 413, JSON.stringify({ error: "zu groß" })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      if (res.writableEnded) return;
      try {
        const games = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (!Array.isArray(games)) throw new Error("Array erwartet");
        writeGames(games);
        send(res, 200, JSON.stringify({ ok: true, count: games.length }));
      } catch (err) {
        send(res, 400, JSON.stringify({ error: err.message }));
      }
    });
    return;
  }
  send(res, 405, JSON.stringify({ error: "Methode nicht erlaubt" }));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/api/games") return handleApi(req, res);

  const file = url.pathname === "/" ? "/index.html" : url.pathname;
  if (req.method !== "GET" || !PUBLIC_FILES.has(file)) return send(res, 404, "Nicht gefunden", "text/plain; charset=utf-8");
  fs.readFile(path.join(ROOT, file), (err, buf) => {
    if (err) return send(res, 500, "Fehler beim Lesen", "text/plain; charset=utf-8");
    send(res, 200, buf, TYPES[path.extname(file)] || "application/octet-stream");
  });
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") console.error(`Port ${PORT} ist belegt. Anderen Port nehmen: PORT=5174 node server.js`);
  else console.error(err);
  process.exit(1);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Brawl Log läuft auf http://localhost:${PORT}`);
  console.log(`Spiele werden gespeichert in: ${DATA_FILE}`);
});
