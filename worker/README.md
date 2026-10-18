# Afterglow — Cloudflare Worker proxy

The browser never sees the API key. The game calls this Worker; the Worker adds the key and calls the LLM.

## Deploy (≈5 min, free tier is enough)
1. Create a free Cloudflare account → https://dash.cloudflare.com/sign-up
2. On your computer (Node 18+):
   ```bash
   cd worker
   npx wrangler login                 # opens browser, approve
   npx wrangler secret put LLM_API_KEY # paste key when prompted (xAI: console.x.ai, OpenAI: platform.openai.com)
   npx wrangler deploy
   ```
   You get a URL like `https://afterglow-proxy.<your-subdomain>.workers.dev`.
3. Put that URL in `js/config.js` → `API_URL: "https://afterglow-proxy.<sub>.workers.dev/chat"`.
4. Check: `curl https://afterglow-proxy.<sub>.workers.dev/health` → `{"ok":true,"hasKey":true}`.

## Switch provider
Edit `[vars]` in `wrangler.toml` (`LLM_BASE_URL`, `LLM_MODEL`) and re-deploy. Any OpenAI-compatible
`/chat/completions` endpoint works (xAI, OpenAI, OpenRouter, Groq, Together…).

## Live deployment
`https://afterglow-proxy.andremka030.workers.dev`. Routes:
- `GET /health` returns `{ok, hasKey}`.
- `POST /chat` handles chat, summary and phone texts.
- `POST /tts {text, language?}` returns an mp3 (xAI TTS, voice `TTS_VOICE`, default `ara`).

## Protection
- `ALLOWED_ORIGINS`: only these sites can call it. Other origins, or requests with no Origin header, get 403.
- Rate limit: a Durable Object counter (`Limiter`) enforces exactly `RATE_PER_MIN` (20) POSTs per minute and `RATE_PER_DAY` (300) per day. It counts per IPv4 address, or per IPv6 /48 because IPv6 clients rotate addresses. The Cloudflare `RATE_LIMITER` binding is a secondary check.
- Set a monthly spend cap in the xAI console as well.
