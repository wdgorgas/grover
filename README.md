# GROVER — Project Workspace

GROVER (General of Resource Optimization and Varying Expertise Requests; named for Grover's quantum search algorithm) is a private AI command center for Will and Jackson — an operating layer, not a chatbot.

## Current status (updated 2026-07-03)

**Phase: v2 planning. No v2 code exists yet, by explicit decision.**

- **v1** — built 2026-07-01→03, retired. Real engineering, unusable product (no live feedback, dead controls, contradictory status, HUD-style visuals). Frozen under `archive/grover_v1/`.
- **v2** — spec-first rebuild, planned via a Claude ↔ ChatGPT adversarial loop (humans relay files). Progress: iterations 1–3 complete, **architecture converged, zero high-severity disagreements open**. Awaiting ChatGPT's iteration 4 (ruling on four modifications), then the master prompt gets drafted (iter 5), reviewed (iter 6), finalized (iter 7) → Will green-lights the build.
- **Team** — Will owns the main planning thread; Jackson runs parallel lanes (UI/UX spec, red-team). See `planning/PLANNING_BOARD.md` for live assignments and the locked-decision list.

## Layout — organized by version

| Path | Version | What it is |
|---|---|---|
| `planning/` | **v2 (current)** | Everything being worked on now: the spec (`grover_v2_scope_understanding.md`), cold-start briefing (`grover_v2_handoff.md`), planning board, and the Claude↔ChatGPT iteration thread (`chatgpt_handoffs/`) |
| `design/` | v2 (current) | Visual references: `ART INSPIRATION/` (orb + accent language) and the command-center UI mockups |
| `archive/` | **v1 (frozen)** | v1's full codebase (`grover_v1/`), its master prompt, and a standalone git-history bundle. Read-only reference — never modified, never resumed |
| root | — | This file + onboarding (`JACKSON_START_HERE.md`) + git workflow (`GIT_SETUP.md`) |

## Read in this order

1. `planning/grover_v2_handoff.md` — what happened, where things stand. **Always start here.**
2. `planning/grover_v2_scope_understanding.md` — the spec. Source of truth, including locked decisions (§12a).
3. `planning/chatgpt_handoffs/` — the iteration thread, in order.
4. `planning/PLANNING_BOARD.md` — who's doing what right now.

New contributor: `JACKSON_START_HERE.md`.

## Hard rules

- **Never commit secrets.** `archive/grover_v1/data/` (contains a real API key) and `archive/grover_v1/vault/` (personal memory) are gitignored. If `git status` ever shows them staged, stop.
- **`archive/` is read-only.** v1 is evidence, not a starting point.
- **No v2 application code until the master prompt is final** and Will green-lights the build.
- **Locked decisions don't get reopened** — list at the bottom of `planning/PLANNING_BOARD.md`.
