# GROVER v2 — Planning Workspace

GROVER (General of Resource Optimization and Varying Expertise Requests; named for Grover's quantum search algorithm) is a private AI command center for Will and Jackson. **v1 was built and retired; this repo is currently the v2 planning workspace.** No v2 code exists yet — planning first, by explicit decision.

## Read in this order

1. `grover_v2_handoff.md` — cold-start briefing: what happened, where things stand. **Always start here.**
2. `grover_v2_scope_understanding.md` — the living spec. Source of truth for what GROVER v2 is.
3. `chatgpt_handoffs/` — the Claude ↔ ChatGPT planning cycle, in iteration order.
4. `PLANNING_BOARD.md` — who is working on what right now.

New contributor? Read `JACKSON_START_HERE.md`.

## Layout

| Path | What it is |
|---|---|
| `grover_v2_handoff.md` | Cold-start status briefing (kept current every iteration) |
| `grover_v2_scope_understanding.md` | The v2 spec-in-progress |
| `chatgpt_handoffs/` | Planning cycle: `iter_NN_claude_to_chatgpt.md` (outbound) / `iter_NN_chatgpt_to_claude.md` (inbound) |
| `PLANNING_BOARD.md` | Active workstreams and owners |
| `JACKSON_START_HERE.md` | Onboarding for Jackson + his Claude instance |
| `GIT_SETUP.md` | One-time repo restructure commands (Will) + daily git workflow (everyone) |
| `archive/grover_v1/` | v1's full codebase — frozen reference, never modified |
| `archive/grover_v1_master_prompt.md` | v1's master prompt — historical only, do not carry forward |
| `archive/grover_v1_git_history.bundle` | v1's standalone git history (redundant backup) |
| `ART INSPIRATION/`, `GROVER command center UI design/` | Visual references (orb + accent language) |

## Hard rules

- **Never commit secrets.** `archive/grover_v1/data/` and `archive/grover_v1/vault/` are gitignored — they contain a real API key and personal memory. Check `git status` before every commit; if anything under `data/` or any `secrets.json` appears staged, stop.
- **`archive/` is read-only.** v1 is reference material for "what went wrong," not something to iterate on.
- **This is a planning repo right now.** Do not start writing v2 application code until the master prompt is finalized and Will green-lights the build.
