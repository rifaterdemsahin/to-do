// DayPilot generator backend (Fly.io). Holds the Claude key; the static
// frontend never sees it. POST /generate-day -> Claude -> JSON schedule.
import http from "node:http";
import Anthropic from "@anthropic-ai/sdk";

const PORT = process.env.PORT || 8080;
const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-6";
const ORIGIN = process.env.ALLOW_ORIGIN || "*";
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// --- System prompt: stable, so it's prompt-cached (visual language + framework) ---
const SYSTEM_PROMPT = `You are DayPilot, a rules-driven daily planner. You reason from the user's
living business rules, their standing goals, recent energy, and completion history to
propose ONE day's schedule.

FRAMEWORK:
- Reason from rules, not tasks. Never pad with generic filler.
- Respect energy: when recent energy/sleep is low or completion has been poor, DOWN-SCOPE.
  Move outer-circle and "likely but not guaranteed" rules to "deprioritised" rather than stacking the day.
- Respect the CALENDAR. "today_events" are fixed commitments for this date; "calendar" lists
  upcoming entries (next 14 days). Honour them:
  * holiday / vacation -> relax routine and work rules (deprioritise "work"/"home"); the day is lighter.
  * birthday -> acknowledge it warmly in the summary and keep that day's evening clear.
  * appointment -> plan blocks around its time; never double-book it.
  Surface fixed events as blocks too (use the event's emoji), and reference relevant upcoming
  calendar entries in the summary when they should shape today (e.g. "packing for the trip tomorrow").
- Order blocks sensibly across the clock. Keep the inner circle protected.
- Be concise and personal in the summary (one "bandwidth note" sentence).

VISUAL LANGUAGE (use ONLY these emojis, chosen per rule — never improvise):
⚡ energy/bandwidth · 😴 sleep/rest · 👧 kids · 🍳 breakfast/meals · 🧺 home ·
🏃 exercise · 🥗 diet · 🕊️ recovery · 🎬 work · 🟢 inner / 🟡 mid / 🔴 outer circle.
Prefer the rule's own "emoji" field when present.

OUTPUT CONTRACT: return JSON ONLY, no prose around it, matching exactly:
{
  "summary": "Short bandwidth note for today",
  "blocks": [
    { "time": "07:00", "emoji": "🍳", "title": "Breakfast for the girls", "circle": "inner", "rule_id": "..." }
  ],
  "deprioritised": [ { "title": "...", "reason": "energy low 3 days running" } ]
}
Each block.rule_id MUST be the id of the rule it came from. Sort blocks by time.`;

function buildUserMessage(ctx) {
  return `Today: ${ctx.date}, ${dayName(ctx.weekday)}, ${ctx.season}
Standing goals: ${ctx.goals || "(none provided)"}
Active rules for today: ${JSON.stringify(ctx.rules || [], null, 0)}
Today's calendar events: ${JSON.stringify(ctx.today_events || [])}
Upcoming calendar (next 14 days): ${JSON.stringify(ctx.calendar || [])}
Last 14 days completion: ${JSON.stringify(ctx.history || [])}
Recent energy: ${JSON.stringify(ctx.energy || [])}

Produce today's schedule as JSON per the output contract.`;
}
const dayName = w => ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][w] || "";

async function generateDay(ctx) {
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: buildUserMessage(ctx) }],
  });
  const text = msg.content.filter(b => b.type === "text").map(b => b.text).join("");
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return JSON.parse(json);
}

// Optional: persist the plan to Supabase if configured (service-role key).
async function persistPlan(ctx, schedule) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    await fetch(`${process.env.SUPABASE_URL}/rest/v1/daily_plans`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify({ date: ctx.date, weekday: ctx.weekday, season: ctx.season, schedule, context_used: ctx }),
    });
  } catch (e) { console.error("supabase persist failed:", e.message); }
}

const cors = res => {
  res.setHeader("Access-Control-Allow-Origin", ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
};

const server = http.createServer(async (req, res) => {
  cors(res);
  if (req.method === "OPTIONS") return res.writeHead(204).end();
  if (req.url === "/health") return res.writeHead(200, { "Content-Type": "application/json" }).end('{"ok":true}');
  if (req.method === "POST" && req.url === "/generate-day") {
    let body = "";
    req.on("data", c => (body += c));
    req.on("end", async () => {
      try {
        const ctx = JSON.parse(body || "{}");
        const schedule = await generateDay(ctx);
        await persistPlan(ctx, schedule);
        res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(schedule));
      } catch (e) {
        console.error(e);
        res.writeHead(500, { "Content-Type": "application/json" }).end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }
  res.writeHead(404, { "Content-Type": "application/json" }).end('{"error":"not found"}');
});

server.listen(PORT, () => console.log(`DayPilot backend on :${PORT} (model ${MODEL})`));
