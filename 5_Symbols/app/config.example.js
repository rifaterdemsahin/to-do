// DayPilot frontend config — copy to config.js and fill in.
// config.js is gitignored. NEVER put the Claude/service-role key here;
// those live only in the Fly.io backend.
window.DAYPILOT_CONFIG = {
  // Leave blank to run fully local (localStorage + on-device generator).
  // Set to your Fly.io app to get real Claude-generated schedules:
  //   backendUrl: "https://daypilot-api.fly.dev"
  backendUrl: "",

  // Optional: Supabase (frontend-safe anon key only). Blank = localStorage.
  supabaseUrl: "",
  supabaseAnonKey: "",
};
