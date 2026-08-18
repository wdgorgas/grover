# GROVER — Project Workspace

GROVER (General of Resource Optimization and Varying Expertise Requests; named for Grover's quantum search algorithm) is a private AI command center for Will and Jackson — an operating layer, not a chatbot.

## Current status (updated 2026-08-18)

**Phase: v2 functional candidate — P0 approved by Will 2026-07-03; P1–P5 mechanical exits passed 2026-08-18.**

- **v1** — built 2026-07-01→03, retired. Real engineering, unusable product (no live feedback, dead controls, contradictory status, HUD-style visuals). Frozen under `archive/grover_v1/`.
- **v2** — spec-first rebuild. The binding spec is **`planning/grover_v2_master_prompt.md`** (final, seven planning iterations). Build proceeds phase by phase (P1–P5) with evidence-gated exits and $25/$50 budgets per phase; status on `planning/PLANNING_BOARD.md`.
- **Functional desktop candidate** — GROVER runs as a local Windows application with fluid context conversations, a provider-neutral Codex/Claude manager, live Ask and Builder flows, reviewable local memory, backup/restore, policy and cost gates, kill switch, verification evidence, and failed-build recovery. The no-install candidate is `app/release/GROVER-2.0.0-rc.1-portable.exe` (156,744,204 bytes; SHA-256 `A658BB86BD06594B4F9A3F87909DE2F22048DCF21682EB934C030294052CF997`). The functional core has 51 deterministic checks plus rendered desktop, live-engine, memory-restart, Builder-reliability, and packaged-runtime evidence. Will's hands-on UX confirmation and new visual direction are next.
- **Team** — relay model: Will and Jackson are both build partners; whoever pulls next takes the next useful slice (`JACKSON_START_HERE.md`). Sessions follow `AGENTS.md` plus any client-specific contract such as `CLAUDE.md`. Visual direction comes from Will; implementation and agent routing remain provider-neutral. Spec changes go through §12 proposals only.

## Layout — organized by version

| Path | Version | What it is |
|---|---|---|
| `planning/` | **v2 (current)** | Everything being worked on now: the spec (`grover_v2_scope_understanding.md`), cold-start briefing (`grover_v2_handoff.md`), planning board, and the Claude↔ChatGPT iteration thread (`chatgpt_handoffs/`) |
| `design/` | v2 (current) | Visual references: `ART INSPIRATION/` (orb + accent language) and the command-center UI mockups |
| `archive/` | **v1 (frozen)** | v1's full codebase (`grover_v1/`), its master prompt, and a standalone git-history bundle. Read-only reference — never modified, never resumed |
| root | — | This file + agent contracts (`AGENTS.md`, `CLAUDE.md`) + onboarding (`JACKSON_START_HERE.md`) + git workflow (`GIT_SETUP.md`) |

## Read in this order

1. `AGENTS.md` — the cross-client session contract. Claude sessions also read `CLAUDE.md`.
2. `planning/grover_v2_master_prompt.md` — **the final, sole binding build spec.** Overrides everything below.
3. `planning/PLANNING_BOARD.md` — phase status, locked decisions, iteration ledger.
4. `planning/grover_v2_handoff.md` — how we got here.
5. `planning/chatgpt_handoffs/` and `planning/grover_v2_scope_understanding.md` — the planning record; rationale only, no longer authoritative.

New contributor: `JACKSON_START_HERE.md`.

## Hard rules

- **Never commit secrets.** `archive/grover_v1/data/` (contains a real API key) and `archive/grover_v1/vault/` (personal memory) are gitignored. If `git status` ever shows them staged, stop.
- **`archive/` is read-only.** v1 is evidence, not a starting point.
- **Build only inside the approved scope.** P0 and the accepted PlanningProposals govern the functional candidate. Proposed scope changes remain proposals until Will resolves them.
- **Locked decisions don't get reopened** — list at the bottom of `planning/PLANNING_BOARD.md`.
