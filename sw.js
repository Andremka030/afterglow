// Afterglow service worker: caches the static app shell + art. Never touches the AI API (cross-origin) or POSTs.
const VERSION = "afterglow-v2.0.1";
const CORE = ["./", "index.html", "style.css", "js/config.js", "js/fallback.js", "js/game.js", "manifest.webmanifest",
  "assets/fonts/Inter-var.woff2", "assets/img/title_p.webp", "assets/img/p_elena.webp", "assets/img/bg_hotel_p.webp",
  "assets/img/elena_neutral.webp", "assets/img/elena_smile.webp", "assets/img/elena_card.webp", "assets/img/icon-192.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname.includes("/api/")) return; // API & cross-origin: network only
  if (req.mode === "navigate" || /\.(html|js|css|webmanifest)$/.test(url.pathname)) {
    // network-first for code so updates land; fall back to cache offline
    e.respondWith(fetch(req).then(r => { const c = r.clone(); caches.open(VERSION).then(x => x.put(req, c)); return r; }).catch(() => caches.match(req).then(r => r || caches.match("index.html"))));
    return;
  }
  // cache-first for art & fonts
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => { if (r.ok) { const c = r.clone(); caches.open(VERSION).then(x => x.put(req, c)); } return r; })));
});
