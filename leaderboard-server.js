const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 8787);
const DATA_FILE = path.join(__dirname, "leaderboard-data.json");
const PUBLIC_ROOT = __dirname;

const MAX_NAME_LEN = 14;
const MAX_SCORE = 10000000;
const MAX_SUBMISSIONS_PER_MINUTE = 20;

const rateMap = new Map();

function loadScores() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const rows = JSON.parse(raw);
    if (!Array.isArray(rows)) return [];
    return rows
      .map((r) => ({ name: String(r.name || "Pilot"), score: Number(r.score || 0) }))
      .filter((r) => Number.isInteger(r.score) && r.score >= 0 && r.score <= MAX_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, 100);
  } catch (_) {
    return [];
  }
}

let leaderboard = loadScores();

function saveScores() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(leaderboard, null, 2));
}

function sendJson(res, code, data) {
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(data));
}

function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket.remoteAddress || "unknown";
}

function isRateLimited(ip) {
  const now = Date.now();
  const oneMinuteAgo = now - 60000;
  const hits = rateMap.get(ip) || [];
  const recent = hits.filter((t) => t > oneMinuteAgo);
  recent.push(now);
  rateMap.set(ip, recent);
  return recent.length > MAX_SUBMISSIONS_PER_MINUTE;
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 5000) {
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function isValidName(name) {
  if (typeof name !== "string") return false;
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > MAX_NAME_LEN) return false;
  return /^[a-zA-Z0-9 _-]+$/.test(trimmed);
}

function isValidScore(score) {
  return Number.isInteger(score) && score >= 0 && score <= MAX_SCORE;
}

function sanitizePath(urlPath) {
  const cleaned = urlPath.split("?")[0];
  const decoded = decodeURIComponent(cleaned);
  const normalized = path.normalize(decoded).replace(/^\/+/, "");
  if (normalized.includes("..")) return null;
  return normalized || "index.html";
}

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  return "application/octet-stream";
}

const server = http.createServer(async (req, res) => {
  const method = req.method || "GET";
  const url = req.url || "/";

  if (url.startsWith("/leaderboard")) {
    if (method === "GET") {
      return sendJson(res, 200, leaderboard.slice(0, 20));
    }

    if (method === "POST") {
      const ip = clientIp(req);
      if (isRateLimited(ip)) {
        return sendJson(res, 429, { error: "Too many submissions" });
      }

      try {
        const body = await parseJsonBody(req);
        const name = typeof body.name === "string" ? body.name.trim() : "";
        const score = Number(body.score);

        if (!isValidName(name) || !isValidScore(score)) {
          return sendJson(res, 400, { error: "Invalid name or score" });
        }

        leaderboard.push({ name, score });
        leaderboard = leaderboard.sort((a, b) => b.score - a.score).slice(0, 100);
        saveScores();
        return sendJson(res, 201, { ok: true });
      } catch (_) {
        return sendJson(res, 400, { error: "Invalid JSON" });
      }
    }

    return sendJson(res, 405, { error: "Method not allowed" });
  }

  if (method !== "GET" && method !== "HEAD") {
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Method not allowed");
    return;
  }

  const relativePath = sanitizePath(url === "/" ? "/index.html" : url);
  if (!relativePath) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Bad request");
    return;
  }

  const filePath = path.join(PUBLIC_ROOT, relativePath);
  if (!filePath.startsWith(PUBLIC_ROOT)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    res.writeHead(200, { "Content-Type": contentType(filePath) });
    if (method === "HEAD") {
      res.end();
      return;
    }
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Jetpack Voice Hero server running on http://localhost:${PORT}`);
  console.log(`Leaderboard endpoint: http://localhost:${PORT}/leaderboard`);
});
