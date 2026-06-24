# 5️⃣ Symbols — The "Reality"

> **Stage 5 of 7:** The actual code — where vision becomes working software.

## Purpose

This folder contains the **core source code and implementation files**. Everything that runs, executes, or is deployed lives here. Code is rendered with PrismJS syntax highlighting for readable documentation.

## What belongs here

- **Source code** — All scripts, modules, and application code
- **Configuration files** — App config (non-secret)
- **Docker definitions** — `Dockerfile` and `docker-compose.yml`
- **GitHub Actions workflows** — CI/CD pipeline definitions
- **Static assets** — JS, CSS bundles used by the app

## DayPilot implementation

The DayPilot MVP ([spec](../4_Formula/daypilot_mvp_spec.md)) is built here:

| Path | Description |
|------|-------------|
| `app/index.html` | **The app** — static SPA, 5 screens (Today / Calendar / Rules / Log / Context), mobile-first |
| `app/app.js` | All logic: localStorage data layer, Rules CRUD, Calendar/events, Log/energy capture, the Daily Generator |
| `app/styles.css` | Dark/glass UI matching the template design tokens |
| `app/config.example.js` | Copy to `config.js` (gitignored) to wire Supabase + the Fly.io backend |
| `backend/server.js` | Fly.io generator proxy — holds the Claude key, `POST /generate-day` |
| `backend/Dockerfile`, `backend/fly.toml` | Container build + Fly deploy config |
| `../supabase/migrations/0001_init.sql` | Postgres schema (5 tables, single-owner RLS) |

**Run the app:** open `app/index.html` (or the **🎬 DayPilot App** link in the project
menu). It works fully offline via `localStorage` and an on-device generator; set
`backendUrl` in `config.js` to get real Claude-generated schedules. See `backend/README.md`
to run/deploy the generator.

**Calendar (beyond v0.1 spec):** the Calendar screen adds dated, one-off entries —
appointments, kids' holidays, vacations (multi-day ranges), and birthdays (annual
recurrence). These are **fed into the Daily Generator** (`today_events` + a 14-day
`calendar` window), so the schedule plans around fixed commitments: holidays/vacations
relax the work routine, birthdays keep the evening clear, appointments are never
double-booked. Calendar entries also appear inline on the Today timeline.

## Code Standards

- **Syntax highlighting:** PrismJS (included via CDN in all HTML pages)
- **Style:** Modern CSS — Flexbox/Grid, no legacy floats
- **Diagrams:** Mermaid for all architecture and flow diagrams
- **Backend:** Python on Fly.io
- **Frontend:** Static HTML/CSS/JS on GitHub Pages

## Secrets

- **Never** store secrets in this folder
- Use `.env.example` in root to document required variables
- Load secrets at runtime via Azure Key Vault

## Rules

- Keep `main.py` minimal — delegate to modules
- Every function that isn't self-evident gets a comment
- Move deprecated code to `_obsolete/` 🚮

## 🧪 Testing Checklist

[![CI/CD with GitHub Actions](https://img.youtube.com/vi/R8_veQiYur0/0.jpg)](https://www.youtube.com/watch?v=R8_veQiYur0)

- [ ] `main.py` runs without errors locally
- [ ] `Dockerfile` builds successfully
- [ ] `docker-compose.yml` starts all services
- [ ] GitHub Actions workflow passes on push to `main`
- [ ] No secrets committed to this folder
- [ ] PrismJS renders code blocks correctly on all HTML pages
