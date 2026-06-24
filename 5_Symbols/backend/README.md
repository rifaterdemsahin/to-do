# DayPilot Generator Backend (Fly.io)

Small Node service that holds the Claude API key and exposes the Daily Generator.
The static frontend never sees the key — it POSTs context here and gets JSON back.

## Endpoint

`POST /generate-day` → returns the schedule JSON (spec §4 output contract):

```json
{ "summary": "...", "blocks": [ { "time": "07:00", "emoji": "🍳", "title": "...", "circle": "inner", "rule_id": "..." } ], "deprioritised": [ { "title": "...", "reason": "..." } ] }
```

Request body: `{ date, weekday, season, goals, rules, history, energy }` (assembled by the frontend).
Also: `GET /health` → `{ "ok": true }`.

## How it works

- **System prompt** (visual language + framework) is stable and sent with `cache_control: ephemeral`, so prompt caching pays off across days (spec §4).
- **Model:** `claude-sonnet-4-6` (override with `CLAUDE_MODEL`).
- Output is parsed as **JSON only** to keep the UI deterministic.
- If `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are set, each plan is upserted into `daily_plans`.

## Run locally

```bash
cd 5_Symbols/backend
npm install
ANTHROPIC_API_KEY=sk-ant-... npm start      # listens on :8080
```

Then point the frontend at it: in `5_Symbols/app/config.js` set
`backendUrl: "http://localhost:8080"`.

## Deploy to Fly.io

```bash
fly launch --no-deploy            # first time, accept the bundled fly.toml
fly secrets set \
  ANTHROPIC_API_KEY="$(az keyvault secret show --vault-name dp-kv-deliverypilot --name ANTHROPIC-API-KEY --query value -o tsv)" \
  ALLOW_ORIGIN="https://rifaterdemsahin.github.io"
fly deploy
```

Secrets come from Azure Key Vault `dp-kv-deliverypilot` (`ANTHROPIC-API-KEY`, optionally
`supabase-service-key`). Never commit them — see root `.env` / `.env.example`.

## Env vars

| Var | Required | Purpose |
|-----|----------|---------|
| `ANTHROPIC_API_KEY` | yes | Claude API key (from Key Vault) |
| `CLAUDE_MODEL` | no | defaults to `claude-sonnet-4-6` |
| `ALLOW_ORIGIN` | no | CORS origin; defaults to `*` |
| `SUPABASE_URL` | no | enables `daily_plans` persistence |
| `SUPABASE_SERVICE_ROLE_KEY` | no | service-role key (backend only) |
| `PORT` | no | defaults to `8080` |
