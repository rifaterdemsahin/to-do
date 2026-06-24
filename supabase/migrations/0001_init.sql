-- DayPilot — initial schema (spec §3)
-- Single-user app: one owner. RLS keeps the anon key honest; the backend
-- (Fly.io) uses the service-role key and bypasses RLS.

-- ---------------------------------------------------------------------------
-- Enums (mirror the fixed vocabularies from the spec)
-- ---------------------------------------------------------------------------
do $$ begin
  create type rule_category as enum
    ('kids','sleep','diet','exercise','recovery','work','home');
exception when duplicate_object then null; end $$;

do $$ begin
  create type rule_circle as enum ('inner','mid','outer');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- rules — the editable library of living business rules
-- ---------------------------------------------------------------------------
create table if not exists rules (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  category    rule_category not null,
  circle      rule_circle   not null,
  weekdays    int[] not null default '{0,1,2,3,4,5,6}', -- 0=Sun … 6=Sat
  is_likely   boolean not null default false,           -- "happens but not guaranteed"
  emoji       text not null,                            -- from the fixed map (frontend enforces)
  notes       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- daily_plans — one generated schedule per day
-- ---------------------------------------------------------------------------
create table if not exists daily_plans (
  id            uuid primary key default gen_random_uuid(),
  date          date not null unique,
  weekday       int not null,
  season        text,
  schedule      jsonb not null,   -- the structured AI output (summary/blocks/deprioritised)
  context_used  jsonb,            -- snapshot of what was fed in (prompt debugging)
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- daily_logs — per-rule completion check-ins
-- ---------------------------------------------------------------------------
create table if not exists daily_logs (
  id          uuid primary key default gen_random_uuid(),
  date        date not null,
  rule_id     uuid references rules(id) on delete set null, -- nullable for ad-hoc items
  completed   boolean not null default false,
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists daily_logs_date_idx on daily_logs(date);

-- ---------------------------------------------------------------------------
-- energy_snapshots — one sleep/energy/circle reading per day
-- ---------------------------------------------------------------------------
create table if not exists energy_snapshots (
  id           uuid primary key default gen_random_uuid(),
  date         date not null unique,
  sleep_hours  numeric,
  energy       int check (energy between 1 and 5),
  inner_score  int check (inner_score between 1 and 5),
  mid_score    int check (mid_score between 1 and 5),
  outer_score  int check (outer_score between 1 and 5),
  note         text,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- standing_context — the rarely-edited goals block (single row)
-- ---------------------------------------------------------------------------
create table if not exists standing_context (
  id          uuid primary key default gen_random_uuid(),
  goals       text,
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at touch trigger
-- ---------------------------------------------------------------------------
create or replace function touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists rules_touch on rules;
create trigger rules_touch before update on rules
  for each row execute function touch_updated_at();

drop trigger if exists standing_context_touch on standing_context;
create trigger standing_context_touch before update on standing_context
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — single owner. Anon key can read; only service_role writes.
-- (Tighten to authenticated-owner if you add Supabase Auth later.)
-- ---------------------------------------------------------------------------
alter table rules            enable row level security;
alter table daily_plans      enable row level security;
alter table daily_logs       enable row level security;
alter table energy_snapshots enable row level security;
alter table standing_context enable row level security;

do $$
declare t text;
begin
  foreach t in array array['rules','daily_plans','daily_logs','energy_snapshots','standing_context']
  loop
    execute format('drop policy if exists %I_anon_read on %I;', t, t);
    execute format('create policy %I_anon_read on %I for select to anon, authenticated using (true);', t, t);
  end loop;
end $$;
