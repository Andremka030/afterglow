// ===== Afterglow config — edit these before publishing =====
window.AFTERGLOW_CONFIG = {
  // Your Cloudflare Worker URL, e.g. "https://afterglow-proxy.<sub>.workers.dev/chat".
  // Empty = auto: uses local dev server "/api/chat" on localhost, otherwise offline demo mode.
  API_URL: "https://afterglow-proxy.andremka030.workers.dev/chat",
  KOFI_URL: "https://buymeacoffee.com/citadelxcom",   // Buy Me a Coffee link
  FREE_MESSAGES_PER_DAY: 20,                       // real-life daily limit of AI messages (voice messages count too)
  TURNS_PER_DATE: 8,                               // player messages per date before it wraps up
  PREMIUM_PRICE: "$2.99",
  FORCE_DEMO: false,                               // true = never call the API
  // In-game gifts for Elena = tips on Buy Me a Coffee (honor system: BMC can't report back, so she thanks you when you return).
  // Each gift links to a fixed-price Buy Me a Coffee shop item (redirects back to the game after purchase).
  GIFTS: [
    { id: "champagne", emoji: "🥂", name: "Glass of champagne", price: 3, url: "https://buymeacoffee.com/citadelxcom/e/588804" },
    { id: "flowers",   emoji: "💐", name: "Flowers",            price: 5, url: "https://buymeacoffee.com/citadelxcom/e/588805" },
    { id: "dinner",    emoji: "🍽️", name: "Dinner for two",     price: 10, url: "https://buymeacoffee.com/citadelxcom/e/588806" },
  ],
  GIFT_AFFECTION: 5,                               // affection boost, at most once per date
};
