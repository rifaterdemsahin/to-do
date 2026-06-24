// DayPilot frontend config.
//
// This file IS committed and is the production default loaded by index.html.
// A local config.js (gitignored) is loaded AFTER and overrides these values —
// use it for local dev or to add the Supabase anon key.
//
// NEVER put the Claude API key or the Supabase service-role key here; those
// live only in the Fly.io backend.
window.DAYPILOT_CONFIG = {
  // Live generator backend (Fly.io). Holds the Claude key server-side.
  // CORS on the backend is restricted to the GitHub Pages origin, so calls
  // from https://rifaterdemsahin.github.io succeed; other origins (e.g. a
  // local server) are rejected and the app falls back to the on-device generator.
  // Set to "" to force the fully-local generator everywhere.
  backendUrl: "https://daypilot-rifat.fly.dev",

  // Optional: Supabase (frontend-safe anon key only). Blank = localStorage.
  supabaseUrl: "",
  supabaseAnonKey: "",
};
