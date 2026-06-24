# Supabase — Database & Backend Features

## What is it?

[Supabase](https://supabase.com/) is an open-source Firebase alternative built on **PostgreSQL**. It provides a managed Postgres database plus auth, auto-generated REST/GraphQL APIs, realtime subscriptions, storage, and edge functions. In this project it is the **primary database and data-layer backend**.

## Use Cases

| Use Case | Why Supabase |
|----------|--------------|
| **Relational database** | Fully managed Postgres with extensions (pgvector, PostGIS, etc.) |
| **Authentication** | Email/password, magic links, OAuth, and JWT issuance out of the box |
| **Auto REST/GraphQL API** | Instant CRUD APIs over your tables via PostgREST |
| **Realtime** | Subscribe to row changes over WebSockets for live UIs |
| **Storage** | S3-compatible file/object storage with access policies |
| **Vector search** | `pgvector` for embeddings — an alternative/complement to Qdrant |
| **Row Level Security** | Postgres RLS policies enforce per-user data access at the DB layer |

## When to Choose Supabase

- You need a **relational database** with a managed control plane (backups, pooling, dashboard)
- You want **auth + database + storage** from one provider with minimal glue code
- You want **realtime** features without running your own WebSocket infrastructure
- You prefer **open standards** (Postgres, SQL) over a proprietary NoSQL store

## When NOT to Choose Supabase

- You need **only a vector store** at scale — Qdrant may be a better fit
- You need **arbitrary long-running compute** — use Fly.io for that

## Integration with This Project

- **Backend (Fly.io):** Python services connect to Supabase Postgres via `DATABASE_URL` (connection pooler) or the `supabase-py` client.
- **Frontend (GitHub Pages):** Can call Supabase directly with the **anon public key** + Row Level Security, or proxy through Cloudflare Workers / Fly.io.
- **Secrets:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` live in **Azure Key Vault**. The service-role key is backend-only and never shipped to the browser.
- **Vector DB:** Use `pgvector` in Supabase for embeddings, or keep Qdrant for dedicated vector workloads.

## Setup

```bash
# 1. Create a project at https://supabase.com (pick a region close to Fly.io app)
# 2. Grab URL + keys from Project Settings → API
# 3. Store secrets in Azure Key Vault, then expose to Fly.io:
fly secrets set \
  SUPABASE_URL="https://xxxx.supabase.co" \
  SUPABASE_ANON_KEY="eyJhbGci..." \
  SUPABASE_SERVICE_ROLE_KEY="eyJhbGci..." \
  DATABASE_URL="postgresql://postgres:[pw]@db.xxxx.supabase.co:6543/postgres"
```

### Python (supabase-py example)

```python
import os
from supabase import create_client

supabase = create_client(
    os.environ["SUPABASE_URL"],
    os.environ["SUPABASE_SERVICE_ROLE_KEY"],
)

# Insert a row
supabase.table("events").insert({"name": "signup", "user_id": "abc123"}).execute()

# Query rows
rows = supabase.table("events").select("*").eq("user_id", "abc123").execute()
```

## DayPilot in this project

DayPilot stores its whole data model in Supabase (5 tables). It is **single-user**, so the
auth/RLS story is deliberately minimal.

| Table | Role |
|-------|------|
| `rules` | The living business rules (category, circle, weekday cadence, emoji, active) |
| `daily_plans` | One AI-generated schedule per day (`schedule jsonb`) |
| `daily_logs` | Per-rule completion check-ins |
| `energy_snapshots` | Daily sleep / energy / circle-score readings |
| `standing_context` | The rarely-edited goals block |

**Data flow:**

```
Frontend (GitHub Pages)  --anon key, SELECT only-->  Supabase
        |                                               ^
        | POST context                                  | service-role write
        v                                               |
Backend (Fly.io: daypilot-rifat)  --/generate-day-->  Claude  --plan-->  daily_plans
```

- The frontend reads with the **anon key** (RLS allows read); it never holds a write key.
- The **Fly.io backend** holds the **service-role key** and is the only writer — it upserts
  each generated plan into `daily_plans`.
- **MVP default:** the app runs on `localStorage` with no Supabase at all; adopt Supabase
  when you want cross-device sync.

**Schema & full wiring:** [`supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql)
and the deep-dive in [`4_Formula/database.md`](../4_Formula/database.md). Secrets live in
Azure Key Vault `dp-kv-deliverypilot` (`supabase-anon-key`, `supabase-service-key`,
`supabase-access-token`).

## Pricing

| Tier | Cost |
|------|------|
| Free | 500 MB database, 1 GB storage, 50K MAUs, 2 projects |
| Pro | ~$25/month — 8 GB database, daily backups, 100K MAUs |
| Team / Enterprise | SOC 2, SSO, custom limits |

## References

- [Supabase Docs](https://supabase.com/docs)
- [supabase-py](https://supabase.com/docs/reference/python/introduction)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
- [pgvector / AI](https://supabase.com/docs/guides/ai)
