// Local dev server: serves the game + /api/chat proxy. Key comes from env only.
//   LLM_API_KEY=... node dev/server.mjs     (optional: LLM_BASE_URL, LLM_MODEL, PORT)
// Without LLM_API_KEY the game automatically runs in offline demo mode.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handle, tts, stt } from "../api/core.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT) || 8080;
const env = { ...process.env };
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".webp": "image/webp", ".jpg": "image/jpeg", ".png": "image/png", ".json": "application/json", ".svg": "image/svg+xml", ".ico": "image/x-icon" };

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/api/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ ok: true, hasKey: !!env.LLM_API_KEY }));
  }
  if (url.pathname === "/api/tts" && req.method === "POST") {
    let raw = ""; for await (const c of req) { raw += c; if (raw.length > 20000) break; }
    try {
      const t = await tts(JSON.parse(raw || "{}"), env);
      if (t.error) { res.writeHead(t.status, { "Content-Type": "application/json" }); return res.end(JSON.stringify(t)); }
      res.writeHead(200, { "Content-Type": t.type }); return res.end(Buffer.from(t.audio));
    } catch (e) { res.writeHead(502, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ error: "upstream", detail: String(e.message).slice(0, 200) })); }
  }
  if (url.pathname === "/api/stt" && req.method === "POST") {
    const chunks = []; let n = 0; for await (const c of req) { chunks.push(c); n += c.length; if (n > 1_600_000) break; }
    try {
      const out = await stt(Buffer.concat(chunks), req.headers["content-type"], env);
      res.writeHead(out.status || 200, { "Content-Type": "application/json" }); return res.end(JSON.stringify(out));
    } catch (e) { res.writeHead(502, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ error: "upstream", detail: String(e.message).slice(0, 200) })); }
  }
  if (url.pathname === "/api/chat" && req.method === "POST") {
    let raw = ""; for await (const c of req) { raw += c; if (raw.length > 20000) break; }
    try {
      const out = await handle(JSON.parse(raw || "{}"), env);
      res.writeHead(out.status || 200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(out));
    } catch (e) {
      console.error("[llm]", e.message);
      res.writeHead(502, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "upstream", detail: String(e.message).slice(0, 200) }));
    }
  }
  let p = path.normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
  if (p === "" || p.endsWith("/")) p += "index.html";
  const f = path.join(root, p);
  if (!f.startsWith(root) || f.includes(`${path.sep}worker${path.sep}`) ) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); return res.end("not found"); }
    res.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" });
    res.end(data);
  });
}).listen(PORT, () => console.log(`Afterglow dev → http://localhost:${PORT}  (LLM: ${env.LLM_API_KEY ? "live " + (env.LLM_MODEL || "default model") : "offline demo"})`));
