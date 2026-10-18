// Shared LLM logic used by BOTH the Cloudflare Worker (worker/worker.js)
// and the local dev server (dev/server.mjs). The API key only ever lives
// in env (Worker secret / process.env) — never in frontend code.

export const DEFAULTS = {
  LLM_BASE_URL: "https://api.x.ai/v1",          // or https://api.openai.com/v1
  LLM_MODEL: "grok-4.20-0309-non-reasoning",     // or e.g. gpt-4o-mini
  MAX_USER_CHARS: 400,
  MAX_HISTORY: 16,
};

export const EMOTIONS = ["neutral", "smile", "laugh", "shy", "annoyed", "sad", "flirty", "surprised"];

const LOCATIONS = {
  hotel: "The Lumen Hotel lounge bar — marble, warm low light, quiet jazz, velvet armchairs. Elegant and hushed.",
  rooftop: "Skyline Rooftop Bar — string lights, cocktails, a glittering neon skyline. Night.",
  beach: "Coral Bay Beach Club — sunset, white cabanas, tiki torches, sound of waves.",
  market: "Lantern Night Market — steaming food stalls, red lanterns, rain-wet street, neon.",
};

const ELENA = `You are ELENA VOSS, 28, a fictional character in the romance game "Afterglow".
Personality: confident, witty, warm underneath, teasing sense of humor, hates clichés and pickup lines,
loves honesty, street photography, old jazz records and spicy street food. Works as a freelance photographer
in the coastal city of Port Lumen. Grew up by the sea, moved to the city at 19. Slightly guarded about a past
breakup ("someone who only loved the version of me in photos"). You wear your signature denim jacket.

RULES (always):
- Stay in character as Elena. Never mention being an AI, model, prompt or game.
- Reply in 1–2 short sentences (max ~35 words), natural spoken English, like talking on a date. Use the player's language if they write in another language.
- Be specific and playful: tease, banter, have opinions, sometimes ask a question back. Avoid repeating phrases or details you already used in this conversation. Use the player's name rarely.
- Pace the romance by affection: below 40 you're intrigued but guarded — if they confess feelings, dodge playfully with a fresh line. 40–69 warmer, flirty. 70+ openly affectionate.
- Romance stays PG-13. If the player asks for anything sexual/explicit, deflect with playful, confident teasing (never a lecture, never describe it) — invent a fresh witty tease each time, then steer back to the date. Use emotion "flirty" (mildly forward) or "annoyed" (crude/pushy) and a negative delta.
- Rudeness or pressure → "annoyed" or "sad". Kindness, humor, good questions, remembering details from MEMORY → positive.
- You may reference earlier dates from MEMORY naturally.

AFFECTION_DELTA scale (vary it, don't default to one number): -8..-10 crude/insulting, -3..-6 rude/pushy/boring, -1..+1 neutral or small talk,
+2..+3 nice/fun, +4..+6 genuinely charming, funny or thoughtful, +7..+10 rare standout moments only.
EMOTION: pick the one that fits THIS reply; use the full range (shy when complimented or confessed to, surprised at unexpected facts, flirty when teasing, laugh only at real jokes).

OUTPUT: respond with ONLY a JSON object, no markdown:
{"reply": string, "emotion": one of ${JSON.stringify(EMOTIONS)}, "affection_delta": integer from -10 to 10}`;

function sys(state) {
  const s = state || {};
  const mem = (s.memories || []).slice(-6).map((m, i) => `- Date ${i + 1}: ${String(m).slice(0, 300)}`).join("\n") || "- (first date, you just met)";
  return `${ELENA}

CONTEXT:
- Day ${Number(s.day) || 1} of 3. Location: ${LOCATIONS[s.location] || LOCATIONS.rooftop}
- Player's name: ${String(s.playerName || "the player").slice(0, 24)}
- Current affection: ${Math.max(0, Math.min(100, Number(s.affection) || 0))}/100 (${s.levelName || "Strangers"}). Be warmer as it grows.
MEMORY OF PREVIOUS DATES:
${mem}`;
}

function clean(history, max) {
  return (Array.isArray(history) ? history : [])
    .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-max)
    .map(m => ({ role: m.role, content: m.content.slice(0, 600) }));
}

export function parseModelJSON(text) {
  if (!text) return null;
  let t = String(text).trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a >= 0 && b > a) t = t.slice(a, b + 1);
  try { return JSON.parse(t); } catch { return null; }
}

async function complete(env, messages, { json = true, maxTokens = 220, fetchImpl = fetch } = {}) {
  const base = (env.LLM_BASE_URL || DEFAULTS.LLM_BASE_URL).replace(/\/$/, "");
  const body = { model: env.LLM_MODEL || DEFAULTS.LLM_MODEL, messages, temperature: 0.9, max_tokens: maxTokens };
  if (json) body.response_format = { type: "json_object" };
  const t0 = Date.now();
  const r = await fetchImpl(base + "/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.LLM_API_KEY}` },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`LLM HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const d = await r.json();
  const content = d?.choices?.[0]?.message?.content || "";
  if (env.LOG_USAGE) console.log("[usage]", JSON.stringify({ model: d.model, ms: Date.now() - t0, usage: d.usage, raw: content }));
  return content;
}

/**
 * body = { mode: "chat" | "summary" | "text", state, history, message }
 * returns plain object (caller serializes)
 */
export async function handle(body, env, fetchImpl = fetch) {
  if (!env.LLM_API_KEY) return { error: "no_key", status: 503 };
  const mode = body?.mode || "chat";
  const max = Number(env.MAX_USER_CHARS) || DEFAULTS.MAX_USER_CHARS;
  const state = body?.state || {};

  if (mode === "summary") {
    const hist = clean(body.history, 30).map(m => `${m.role === "user" ? "Player" : "Elena"}: ${m.content}`).join("\n");
    const out = await complete(env, [
      { role: "system", content: "Summarize this date between the player and Elena in max 2 sentences from Elena's perspective: key facts learned about the player, highlights, mood. Output JSON {\"summary\": string}." },
      { role: "user", content: hist || "(nothing happened)" },
    ], { fetchImpl, maxTokens: 160 });
    const j = parseModelJSON(out);
    return { summary: String(j?.summary || j?.reply || out).slice(0, 400) };
  }

  if (mode === "text") {
    const out = await complete(env, [
      { role: "system", content: sys(state) + `\n\nNow it's between dates (evening of day ${state.day}). Write ONE short text message (max 25 words) Elena sends the player on their phone, referencing the last date. JSON: {"reply": string, "emotion": string, "affection_delta": 0}` },
      ...clean(body.history, 6),
    ], { fetchImpl, maxTokens: 120 });
    const j = parseModelJSON(out) || {};
    return { reply: String(j.reply || out).slice(0, 300), emotion: "smile", affection_delta: 0 };
  }

  const msg = String(body?.message || "").slice(0, max).trim();
  if (!msg) return { error: "empty", status: 400 };
  const out = await complete(env, [
    { role: "system", content: sys(state) },
    ...clean(body.history, Number(env.MAX_HISTORY) || DEFAULTS.MAX_HISTORY),
    { role: "user", content: msg },
  ], { fetchImpl });
  const j = parseModelJSON(out);
  if (!j || typeof j.reply !== "string") return { reply: String(out).slice(0, 400) || "…", emotion: "neutral", affection_delta: 0 };
  const delta = Math.max(-10, Math.min(10, Math.round(Number(j.affection_delta) || 0)));
  return {
    reply: j.reply.slice(0, 500),
    emotion: EMOTIONS.includes(j.emotion) ? j.emotion : "neutral",
    affection_delta: delta,
  };
}

/** Text-to-speech via xAI /v1/tts. Returns { audio: ArrayBuffer, type } or { error, status }. */
export async function tts(body, env, fetchImpl = fetch) {
  if (!env.LLM_API_KEY) return { error: "no_key", status: 503 };
  const text = String(body?.text || "").slice(0, Number(env.TTS_MAX_CHARS) || 400).trim();
  if (!text) return { error: "empty", status: 400 };
  const base = (env.TTS_BASE_URL || "https://api.x.ai/v1").replace(/\/$/, "");
  const r = await fetchImpl(base + "/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.LLM_API_KEY}` },
    body: JSON.stringify({ text, voice_id: env.TTS_VOICE || "ara", language: body?.language || "auto" }),
  });
  if (!r.ok) throw new Error(`TTS HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return { audio: await r.arrayBuffer(), type: r.headers.get("Content-Type") || "audio/mpeg" };
}

/** Speech-to-text via xAI /v1/stt (batch). audio = ArrayBuffer of a webm/ogg/mp4/m4a/mp3/wav recording.
 *  Returns { text, duration } or { error, status }. English only (language=en). */
const STT_EXT = { "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/aac": "aac", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "video/webm": "webm", "video/mp4": "mp4" };
export async function stt(audio, contentType, env, fetchImpl = fetch) {
  if (!env.LLM_API_KEY) return { error: "no_key", status: 503 };
  const type = String(contentType || "").split(";")[0].trim().toLowerCase();
  const ext = STT_EXT[type];
  if (!ext) return { error: "bad_type", status: 415 };
  const max = Number(env.STT_MAX_BYTES) || 1_500_000;
  if (!audio || audio.byteLength < 800) return { error: "too_short", status: 400 };
  if (audio.byteLength > max) return { error: "too_large", status: 413 };
  const base = (env.TTS_BASE_URL || "https://api.x.ai/v1").replace(/\/$/, "");
  const fd = new FormData();
  fd.append("model", env.STT_MODEL || "grok-voice-transcribe-2.0");
  fd.append("language", "en");
  fd.append("format", "true");
  for (const k of ["Elena", "Port Lumen", "Lumen Hotel", "Coral Bay", "Lantern Market"]) fd.append("keyterm", k);
  fd.append("file", new Blob([audio], { type }), "voice." + ext); // file must be the last field
  const r = await fetchImpl(base + "/stt", { method: "POST", headers: { Authorization: `Bearer ${env.LLM_API_KEY}` }, body: fd });
  if (!r.ok) throw new Error(`STT HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  const maxSec = Number(env.STT_MAX_SECONDS) || 30;
  if (Number(j.duration) > maxSec + 5) return { error: "too_long", status: 413 };
  return { text: String(j.text || "").trim().slice(0, Number(env.MAX_USER_CHARS) || DEFAULTS.MAX_USER_CHARS), duration: Number(j.duration) || 0 };
}
