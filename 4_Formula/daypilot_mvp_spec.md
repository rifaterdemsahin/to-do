# DayPilot — Studio App MVP Spec (v0.1)

> **Working title:** *DayPilot* (placeholder — change freely)
>
> A rules-driven daily planner. You define living business rules; AI reads them plus your context and energy history, then proposes the day. You confirm what you actually did. No integrations. Text in, schedule out.

This is the **primary product spec** for the `to-do` project. It lives in `4_Formula` because it is the thinking/planning artefact that gates `5_Symbols` (code).

---

## 1. Product principles

These are the non-negotiables that everything else serves. If a feature violates one, cut it.

1. **Rules-first, not task-first.** Unlike Microsoft To Do, the system never just lists tasks — it reasons from your rules.
2. **Rules are living.** You can add, edit, deactivate, or delete a rule any time, and tomorrow's plan adapts.
3. **Frictionless on mobile.** Responsive web page. A daily check-in should take under 60 seconds.
4. **Absence is signal.** Not logging or not planning is itself data, not a failure to hide.
5. **AI assists, you stay in control.** The visual language and rule structure are defined by you; AI applies them, it doesn't reinvent them each day.
6. **Stay lean.** This is an MVP to learn whether the loop changes how you operate — not a platform.

---

## 2. The three core components

### 2.1 Rules Engine
The editable library of your business rules.

A rule has:
- **title** — e.g. "Make breakfast for Arya & Mira"
- **category** — `kids | sleep | diet | exercise | recovery | work | home`
- **circle** — `inner | mid | outer` (your concentric model)
- **cadence** — which weekdays it applies (Mon–Sun, multi-select), plus optional "likely but not guaranteed" flag (for the bus-ride pattern)
- **emoji** — from a fixed map (see §5), not freely AI-generated
- **active** — toggle on/off without deleting
- **notes** — free text the AI can read for nuance

You can do full CRUD on rules. Deactivating keeps the history; deleting removes it.

### 2.2 Daily Generator
Takes your active rules + context + history → produces today's proposed schedule.

Inputs assembled at generation time:
- today's **date**, **weekday**, **season**
- the **active rules** that match today's weekday
- **completion history** (last 7–14 days): what you finished vs skipped
- **energy trend**: recent sleep and energy ratings
- your **goals/objectives** (a short standing-context block you maintain)

Output: a structured, ordered schedule with emojis and a short "bandwidth note" — e.g. if Thursdays consistently run low, it shouldn't stack Thursday. The generator is allowed to down-scope a heavy day rather than blindly listing every rule.

### 2.3 Daily Log
End-of-day (or rolling) check-in.

You record:
- per-rule **completed?** (tap)
- overall **energy level** (1–5)
- **sleep** last night (hours, or a band)
- a rating per **circle** (inner / mid / outer — covered or neglected today)
- optional **note**

This log is what feeds tomorrow's generator. The loop closes here.

---

## 3. Data model (Supabase / Postgres)

```sql
rules
  id            uuid pk
  title         text
  category      text          -- kids|sleep|diet|exercise|recovery|work|home
  circle        text          -- inner|mid|outer
  weekdays      int[]         -- 0=Sun … 6=Sat
  is_likely     bool          -- "happens but not guaranteed" (e.g. bus day)
  emoji         text
  notes         text
  active        bool default true
  created_at    timestamptz
  updated_at    timestamptz

daily_plans
  id            uuid pk
  date          date unique
  weekday       int
  season        text
  schedule      jsonb         -- the structured AI output
  context_used  jsonb         -- snapshot of what was fed in (for debugging the prompt)
  created_at    timestamptz

daily_logs
  id            uuid pk
  date          date
  rule_id       uuid fk -> rules.id   -- nullable for ad-hoc items
  completed     bool
  note          text
  created_at    timestamptz

energy_snapshots
  id            uuid pk
  date          date unique
  sleep_hours   numeric
  energy        int           -- 1..5
  inner_score   int           -- 1..5
  mid_score     int           -- 1..5
  outer_score   int           -- 1..5
  note          text
  created_at    timestamptz

standing_context
  id            uuid pk
  goals         text          -- your current objectives, edited rarely
  updated_at    timestamptz
```

Single-user, so RLS is simple (one owner). No auth complexity beyond a private Supabase key behind the backend.

---

## 4. AI prompt design (the actual hard part)

This is where the effort lives — not the schema. Two layers:

**System prompt (stable):**
- the visual language / emoji map (§5)
- the framework: "Reason from rules, respect energy, down-scope when history shows low completion, never pad with generic filler."
- output contract: return **JSON only**, no prose around it.

**User message (assembled per day):**

```
Today: {date}, {weekday}, {season}
Standing goals: {goals}
Active rules for today: [...]
Last 14 days completion: [{date, completed_count, skipped_count}]
Recent energy: [{date, sleep_hours, energy, circle_scores}]
```

**Output contract (parse into UI):**

```json
{
  "summary": "Short bandwidth note for today",
  "blocks": [
    { "time": "07:00", "emoji": "🍳", "title": "Breakfast for the girls", "circle": "inner", "rule_id": "..." }
  ],
  "deprioritised": [
    { "title": "...", "reason": "energy low 3 days running" }
  ]
}
```

Forcing JSON-only output and parsing it keeps the UI deterministic. Spend your iteration budget here: tune the system prompt until the schedule feels yours, not generic.

**Model:** `claude-sonnet-4-6` is the right cost/quality point for daily generation. Cache the system prompt (visual language + framework) since it's stable — that's where prompt caching pays off.

---

## 5. Visual language (defined by you, applied by AI)

Lock this map up front so the AI never improvises emojis:

| Meaning | Emoji |
|---|---|
| Energy / bandwidth | ⚡ |
| Sleep / rest | 😴 |
| Kids routine | 👧 |
| Breakfast / meals | 🍳 |
| Home (laundry, dishwasher, dryer) | 🧺 |
| Exercise | 🏃 |
| Diet | 🥗 |
| Recovery (SAA) | 🕊️ |
| Work / DeliveryPilot | 🎬 |
| Inner / mid / outer circle | 🟢 / 🟡 / 🔴 |

The AI selects from this fixed set per rule category. You stay in control; it stays consistent.

---

## 6. Tech stack

- **Frontend:** static SPA on **GitHub Pages**. Mobile-first responsive. Keep it boring — a few screens: Today, Rules, Log, Standing Context.
- **Backend:** small service on **Fly.io** that holds the Claude API key and proxies generation requests (never expose the key from a static page).
- **Data:** **Supabase** (Postgres + simple owner auth).
- **AI:** **Claude API** (sonnet), system prompt cached.

Flow: Frontend → Fly.io endpoint (`/generate-day`) → assembles context from Supabase → calls Claude → stores `daily_plans` → returns JSON to render.

---

## 7. Screens (4 only)

1. **Today** — generated schedule, tap to complete, a Generate/Regenerate button, the bandwidth summary.
2. **Rules** — list + add/edit/toggle/delete.
3. **Log** — energy, sleep, circle ratings, note.
4. **Context** — your standing goals (rarely edited).

That's the whole app.

---

## 8. Out of scope for v0.1 (protect this list)

- Any integrations (calendar, reminders, etc.)
- Push notifications
- Multi-user / sharing
- Analytics dashboards / charts
- Native app

These are the things that turn a weekend MVP into a maintenance burden. Add only after one full week of real use proves the loop works.

---

## 9. Build sequence (phased, spec-follows-learning)

1. **Schema + Rules CRUD** — get rules in and editable. (~2h)
2. **Log + energy capture** — close the data loop manually first. (~2h)
3. **Generator endpoint** — wire Claude, JSON contract, render Today. (~3h)
4. **Prompt iteration** — the real work; tune until it feels personalised. (ongoing)
5. **Use it for one week.** Then decide what, if anything, to expand.

Total to a working loop: roughly **8–12 focused hours**, splittable across sessions (incl. the Wed/Thu bus windows).

---

## 10. Success test

After one week of use, ask: Did this change how I actually ran my days, or was it just another thing to maintain?
- Changed how you operate → expand.
- Just a checkbox → you have your answer, and you've lost only a weekend.
