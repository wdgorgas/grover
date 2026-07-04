# GROVER v2 — Handoff

**What this is:** a cold-start briefing, not the spec. If you're picking this project up without the conversation history, read this first — it tells you what happened, where things stand, and where to look for the actual content. The spec itself lives in `grover_v2_scope_understanding.md`, in this same `planning/` folder.

---

## 1. The story so far

v1 was built (via Fable/Cowork) from what is now `archive/grover_v1_master_prompt.md`, at what is now `archive/grover_v1/`. It cost ~$70 and was declared a failure — not because the underlying engineering was bad (a real loop engine, evidence-gating, an actual file-editing runner, audit logs all existed), but because none of it added up to something usable:

- The Builder tab was organized around loop-lifecycle jargon instead of being simple and transparent.
- Zero live visual feedback — you couldn't tell what was happening, where, or how far along.
- The autonomy dial (0–5) did nothing; it saved but never gated behavior.
- Status contradicted itself across the UI (a "running" task still showed a working Verify button; clicking things caused page reloads).
- The visuals read as generic/AI-generated/"Iron-Man-y"/early-2010s-futuristic — except the orb, which worked and should be kept as-is.

Direct code fixes were attempted mid-session and abandoned — Will's assessment was that the code changes made no visible difference, and the instruction was explicit: **stop coding, do spec work only.** v1's repo is frozen reference material for "what v1 actually did wrong," not something being iterated on.

Decision made: full v2 rebuild, spec-first. v1's repo and master prompt are historical reference only.

---

## 2. Where planning stands

**Current phase: Claude ↔ ChatGPT co-planning cycle** (humans relay files between the AIs). Status: **iterations 1–3 done; architecture converged; zero HIGH-severity disagreements open.**

- **Iteration 1 (Claude):** full architecture proposal — hierarchy as routing/policy not persistent agents, event spine + single task-state store, feature ledger + browser-evidence verification, three-tier memory, deterministic cost hooks, phased plan.
- **Iteration 2 (ChatGPT):** accepted the core shape; added the `ExecutionEngine` adapter boundary over the Claude Agent SDK, `DomainContract` for provably-real domain lanes, the `FeatureRequest → BuildRun → AcceptanceCheck → EvidenceAsset` object model, hybrid event sourcing, ten memory acceptance tests, recovery-card UX.
- **Iteration 3 (Claude):** locked Will's decisions as D1–D6 (see scope doc §12a: five sign-off triggers, $25/$50 phase budgets, minimal memory core with broad memory as v2.1 flagship, SDK + adapter); accepted most of iteration 2; sent modifications M1–M4 back for ruling (single source of truth for features, evidence tiering, mechanical relevance-gating eval, reversible-by-construction domains).

**Convergence path:** iter 4 = ChatGPT rules on M1–M4 (delta-only) → iter 5 = Claude drafts the full v2 master prompt → iter 6 = ChatGPT adversarial full review → iter 7 = final master prompt, Will green-lights the build.

**Team:** Jackson has joined planning with his own Claude+ChatGPT pair, coordinated through this git repo. His lanes (UI/UX spec track, red-team pass) and the locked-decision list live in `PLANNING_BOARD.md`. His GROVER login remains post-v2.0; he's a co-planner now, a user later.

---

## 3. Repo layout (organized by version)

- `planning/` — **v2, current work.** This file, the spec (`grover_v2_scope_understanding.md` — source of truth), `PLANNING_BOARD.md` (assignments + locked decisions + iteration ledger), and `chatgpt_handoffs/` (the iteration thread: `iter_NN_claude_to_chatgpt.md` outbound, `iter_NN_chatgpt_to_claude.md` inbound, `jackson_NN_*.md` for Jackson's lanes).
- `design/` — v2 visual references: `ART INSPIRATION/` (Arcane/Spider-Verse; orb + accent language per spec §5) and `GROVER command center UI design/` mockups.
- `archive/` — **v1, frozen.** `grover_v1/` (full build; its `data/` and `vault/` contain secrets/personal memory and are gitignored), `grover_v1_master_prompt.md` (do not carry forward without re-deriving), `grover_v1_git_history.bundle` (redundant history backup).
- Root — `README.md` (status board), `JACKSON_START_HERE.md` (onboarding), `GIT_SETUP.md` (git workflow), repo housekeeping files.

---

## 4. Immediate next step

Relay ChatGPT's iteration 4 reply into `planning/chatgpt_handoffs/` and give it to Claude. If it accepts M1–M4, Claude drafts the v2 master prompt (iteration 5) from the scope doc + locked decisions — not copied from v1's prompt, restructured around the managerial hierarchy as routing/policy architecture, with the §11 process rules written as enforceable harness structure rather than aspirations.
