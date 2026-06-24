# to-do — DayPilot

To-do management with **living business rules** and a Supabase backend. A rules-driven daily planner: you define living business rules; AI reads them plus your context and energy history, then proposes the day. You confirm what you actually did. No integrations — text in, schedule out.

Scaffolded from [delivery-pilot-template](https://github.com/rifaterdemsahin/delivery-pilot-template) — a structured 7-stage framework that guides AI agents and humans from problem definition to validated deployment.

## The 7-stage framework

1. **[1_Real_Unknown](./1_Real_Unknown)** — Problem Discovery: unknowns, OKRs, core questions (*Active Ignorance*)
2. **[2_Environment](./2_Environment)** — Environment Setup: context, constraints, tooling (*Mental Sandbox*)
3. **[3_Simulation](./3_Simulation)** — Simulation: mockups and diagrams (*Mental Sandbox*)
4. **[4_Formula](./4_Formula)** — Formula: research, plan, document the approach (*Synthesis*)
5. **[5_Symbols](./5_Symbols)** — Symbols: write the actual code (*Execution*)
6. **[6_Semblance](./6_Semblance)** — Semblance: errors, workarounds, lessons learned (*Feedback Loop*)
7. **[7_Testing_Known](./7_Testing_Known)** — Testing: validate against the original unknowns (*Consolidation*)

## How to use

1. Read `agents.md` for agent coordination rules
2. Read `prompts.md` for the project management framework
3. Copy `.env.example` to `.env` and fill in secrets (pulled from Azure Key Vault `dp-kv-deliverypilot`)
4. Start with `1_Real_Unknown/` — define the problem
5. Let AI agents guide you through each stage

## Links

- **GitHub:** [rifaterdemsahin/to-do](https://github.com/rifaterdemsahin/to-do)
- **LinkedIn:** [rifaterdemsahin](https://www.linkedin.com/in/rifaterdemsahin/)
- **YouTube:** [@RifatErdemSahin](https://www.youtube.com/@RifatErdemSahin)
