# 🗄️ Database Configuration — DayPilot (Supabase)

DayPilot uses **Supabase** (hosted Postgres) as its primary data layer. This doc is
the single source of truth for *how the database is wired* — schema, secrets, and the
two ways the app talks to it.

> **MVP note:** the app ships working **without** Supabase. The frontend defaults to
> `localStorage`, so you can use DayPilot immediately and adopt Supabase only when you
> want the data to sync across devices. Everything below is the path to that.

---

## 1. Where the data model lives

| Artefact | Path | Purpose |
| :--- | :--- | :--- |
| Schema migration | [`supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql) | The 5 tables + RLS, runnable as-is |
| Local config | [`supabase/config.toml`](../supabase/config.toml) | `supabase` CLI project config |
| Spec data model | [`daypilot_mvp_spec.md` §3](./daypilot_mvp_spec.md) | The design intent behind the tables |

### The five tables (spec §3)

| Table | Holds | Key columns |
| :--- | :--- | :--- |
| `rules` | The living business rules | `category` (enum), `circle` (enum), `weekdays int[]`, `is_likely`, `emoji`, `active` |
| `daily_plans` | One generated schedule per day | `date` (unique), `schedule jsonb`, `context_used jsonb` |
| `daily_logs` | Per-rule completion check-ins | `date`, `rule_id` → `rules.id`, `completed` |
| `energy_snapshots` | Daily sleep/energy/circle readings | `date` (unique), `sleep_hours`, `energy 1..5`, `*_score 1..5` |
| `standing_context` | The rarely-edited goals block | `goals` (single row) |

`category` and `circle` are Postgres **enums** (`rule_category`, `rule_circle`) so the
fixed vocabularies from the spec are enforced at the DB layer, not just the UI.

---

## 2. Two access paths (who uses which key)

DayPilot is **single-user**, so RLS is intentionally simple: anyone with the anon key can
**read**; only the backend (service-role) can **write**.

```
Frontend (GitHub Pages)            Backend (Fly.io: daypilot-rifat)
  SUPABASE_ANON_KEY                  SUPABASE_SERVICE_ROLE_KEY
  → SELECT only (RLS enforced)       → full read/write, bypasses RLS
  reads rules / plans / logs         writes daily_plans after /generate-day
```

- **Anon key** is frontend-safe and may sit in `5_Symbols/app/config.js` (gitignored).
- **Service-role key** is backend-only — it lives as a Fly secret, **never** in the browser.

---

## 3. Secrets — Azure Key Vault `dp-kv-deliverypilot`

All credentials live in the vault and are pulled at deploy/run time — never committed.
The root `.env` (gitignored) is the local mirror, populated by the bootstrap step.

| App env var | Key Vault secret | Status | Notes |
| :--- | :--- | :--- | :--- |
| `SUPABASE_ANON_KEY` | `supabase-anon-key` | ✅ in vault | Client-safe, respects RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | `supabase-service-key` | ✅ in vault | Backend only — bypasses RLS |
| `SUPABASE_ACCESS_TOKEN` | `supabase-access-token` | ✅ in vault | `supabase` CLI personal token (migrations) |
| `SUPABASE_URL` | `supabase-url` | ⬜ add it | `https://<ref>.supabase.co` — from the dashboard |
| `DATABASE_URL` | `database-url` | ⬜ add it | Pooler string, port `6543` (for direct SQL) |

### Add the two missing secrets

Once the DayPilot Supabase project exists, store its URL + pooler string:

```bash
az keyvault secret set --vault-name dp-kv-deliverypilot --name "supabase-url" \
  --value "https://<project-ref>.supabase.co"

az keyvault secret set --vault-name dp-kv-deliverypilot --name "database-url" \
  --value "postgresql://postgres:<pw>@db.<project-ref>.supabase.co:6543/postgres"
```

---

## 4. Apply the schema

### Option A — `supabase` CLI (uses the access token)

```bash
export SUPABASE_ACCESS_TOKEN=$(az keyvault secret show \
  --vault-name dp-kv-deliverypilot --name supabase-access-token --query value -o tsv)
supabase link --project-ref <project-ref>     # one-time
supabase db push                              # applies supabase/migrations/*.sql
```

### Option B — paste into the SQL editor

Open the migration and run it in **Supabase Dashboard → SQL Editor**:
`supabase/migrations/0001_init.sql`.

### Option C — local stack (no cloud)

```bash
supabase start          # local Postgres on :54322, API on :54321
supabase db reset       # applies migrations to the local DB
```

---

## 5. Wiring the apps to Supabase

**Backend (Fly.io)** — enables `daily_plans` persistence after each generation:

```bash
cd 5_Symbols/backend
fly secrets set \
  SUPABASE_URL="$(az keyvault secret show --vault-name dp-kv-deliverypilot --name supabase-url --query value -o tsv)" \
  SUPABASE_SERVICE_ROLE_KEY="$(az keyvault secret show --vault-name dp-kv-deliverypilot --name supabase-service-key --query value -o tsv)" \
  --app daypilot-rifat
```

(See [`5_Symbols/backend/server.js`](../5_Symbols/backend/server.js) → `persistPlan()`.)

**Frontend** — in `5_Symbols/app/config.js` (gitignored):

```js
window.DAYPILOT_CONFIG = {
  backendUrl: "https://daypilot-rifat.fly.dev",
  supabaseUrl: "https://<project-ref>.supabase.co",
  supabaseAnonKey: "<anon-key>",
};
```

---

## 6. RLS & best practices

1. **RLS is on** for all five tables (`enable row level security`). The migration adds a
   permissive `*_anon_read` SELECT policy; writes require the service-role key.
2. **Tighten later:** if you add Supabase Auth, replace the read-all policy with an
   `auth.uid() = owner` rule and add a column for ownership.
3. **No secrets in code:** the anon key is the *only* key the browser ever sees. The
   service-role key and `DATABASE_URL` stay server-side (Fly secrets / Key Vault).
4. **Migrations are forward-only:** add `0002_*.sql`, `0003_*.sql`; never edit a shipped one.

See also: [`2_Environment/supabase.md`](../2_Environment/supabase.md) (what/why) ·
[`2_Environment/fly_io.md`](../2_Environment/fly_io.md) (backend host).
