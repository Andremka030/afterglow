// Cloudflare Worker proxy for Afterglow. Holds LLM_API_KEY as a secret.
// Deploy: see worker/README.md
import { handle, tts } from "../api/core.mjs";

const hits = new Map(); // best-effort per-isolate rate limit

function cors(origin, env) {
  const allowed = (env.ALLOWED_ORIGINS || "*").split(",").map(s => s.trim());
  const ok = allowed.includes("*") || allowed.includes(origin);
  return {
    "Access-Control-Allow-Origin": ok ? (allowed.includes("*") ? "*" : origin) : "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    const h = { ...cors(origin, env), "Content-Type": "application/json" };
    if (req.method === "OPTIONS") return new Response(null, { headers: h });
    const url = new URL(req.url);
    if (req.method === "GET" && url.pathname.endsWith("/health"))
      return new Response(JSON.stringify({ ok: true, hasKey: !!env.LLM_API_KEY }), { headers: h });
    if (req.method !== "POST") return new Response('{"error":"method"}', { status: 405, headers: h });
    if (h["Access-Control-Allow-Origin"] === "null") return new Response('{"error":"origin"}', { status: 403, headers: h });

    const rawIp = req.headers.get("CF-Connecting-IP") || "x";
    // IPv6 clients often rotate addresses inside their prefix: rate-limit per /48 instead of per address
    const ip = rawIp.includes(":") ? (() => { const [head] = rawIp.split("::"); const g = head.split(":"); return g.slice(0, 3).join(":") + "::/48"; })() : rawIp;
    const now = Date.now(), win = 60_000, lim = Number(env.RATE_PER_MIN) || 20;
    const arr = (hits.get(ip) || []).filter(t => now - t < win); arr.push(now); hits.set(ip, arr);
    let limited = arr.length > lim;
    // Exact global per-IP counter in a Durable Object (one tiny object per IP/prefix)
    if (!limited && env.LIMITER) {
      try { const r = await env.LIMITER.get(env.LIMITER.idFromName(ip)).fetch("https://rl/?lim=" + lim + "&day=" + (Number(env.RATE_PER_DAY) || 300)); limited = r.status === 429; } catch {}
    }
    if (!limited && env.RATE_LIMITER) { try { limited = !(await env.RATE_LIMITER.limit({ key: ip })).success; } catch {} }
    if (limited) return new Response('{"error":"rate_limited"}', { status: 429, headers: h });

    let body;
    try { body = await req.json(); } catch { return new Response('{"error":"bad_json"}', { status: 400, headers: h }); }
    if (JSON.stringify(body).length > 20000) return new Response('{"error":"too_large"}', { status: 413, headers: h });
    try {
      if (url.pathname.endsWith("/tts")) {
        const t = await tts(body, env, fetch);
        if (t.error) return new Response(JSON.stringify(t), { status: t.status, headers: h });
        return new Response(t.audio, { headers: { ...cors(origin, env), "Content-Type": t.type, "Cache-Control": "no-store" } });
      }
      const out = await handle(body, env, fetch);
      return new Response(JSON.stringify(out), { status: out.status || 200, headers: h });
    } catch (e) {
      return new Response(JSON.stringify({ error: "upstream", detail: String(e.message).slice(0, 200) }), { status: 502, headers: h });
    }
  },
};

// Durable Object: sliding 60 s window + daily cap per IP/prefix.
export class Limiter {
  constructor(state) { this.state = state; }
  async fetch(req) {
    const u = new URL(req.url), lim = Number(u.searchParams.get("lim")) || 20, dayCap = Number(u.searchParams.get("day")) || 300;
    const now = Date.now(), today = new Date().toISOString().slice(0, 10);
    let d = (await this.state.storage.get("d")) || { t: [], day: today, n: 0 };
    if (d.day !== today) d = { t: [], day: today, n: 0 };
    d.t = d.t.filter(x => now - x < 60_000);
    if (d.t.length >= lim || d.n >= dayCap) return new Response("limited", { status: 429 });
    d.t.push(now); d.n++;
    await this.state.storage.put("d", d);
    return new Response("ok");
  }
}
