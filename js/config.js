// ===== Afterglow config — edit these before publishing =====
window.AFTERGLOW_CONFIG = {
  // Your Cloudflare Worker URL, e.g. "https://afterglow-proxy.<sub>.workers.dev/chat".
  // Empty = auto: uses local dev server "/api/chat" on localhost, otherwise offline demo mode.
  API_URL: "https://afterglow-proxy.andremka030.workers.dev/chat",
  KOFI_URL: "https://buymeacoffee.com/citadelxcom",   // Buy Me a Coffee link
  FREE_MESSAGES_PER_DAY: 40,                       // real-life daily limit of AI messages
  TURNS_PER_DATE: 8,                               // player messages per date before it wraps up
  PREMIUM_PRICE: "$2.99",
  FORCE_DEMO: false,                               // true = never call the API
};
