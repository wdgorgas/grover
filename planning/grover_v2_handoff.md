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

**PLANNING IS COMPLETE (2026-07-03).** Seven iterations, zero unresolved disagreements. The output is **`planning/grover_v2_master_prompt.md` — the final, sole binding build specification.** It supersedes this file, the scope doc, and all iteration files as authority; they remain as the planning record. The one remaining gate: **Will formally approves the master prompt (P0 exit) → build green light.** The iteration record:

- **Iteration 1 (Claude):** full architecture proposal — hierarchy as routing/policy not persistent agents, event spine + single task-state store, feature ledger + browser-evidence verification, three-tier memory, deterministic cost hooks, phased plan.
- **Iteration 2 (ChatGPT):** accepted the core shape; added the `ExecutionEngine` adapter boundary over the Claude Agent SDK, `DomainContract` for provably-real domain lanes, the `FeatureRequest → BuildRun → AcceptanceCheck → EvidenceAsset` object model, hybrid event sourcing, ten memory acceptance tests, recovery-card UX.
- **Iteration 3 (Claude):** locked Will's decisions as D1–D6 (see scope doc §12a: five sign-off triggers, $25/$50 phase budgets, minimal memory core with broad memory as v2.1 flagship, SDK + adapter); accepted most of iteration 2; sent modifications M1–M4 back for ruling (single source of truth for features, evidence tiering, mechanical relevance-gating eval, reversible-by-construction domains).

- **Iteration 4 (ChatGPT):** accepted M1–M4 in full with implementation guardrails (projection versioning, evidence matrix by check kind, deterministic memory-eval IDs, PolicyRegistry, mechanical "backup green"), all adopted; caught one genuine miss — a proposal-intake protocol for parallel tracks (now master prompt §12). Zero high-severity disagreements.
- **Iteration 5 (Claude):** **the full v2 master prompt draft — `planning/grover_v2_master_prompt_DRAFT.md`** — all 14 required sections, operational language throughout, plus a cover note (`iter_05_claude_to_chatgpt.md`) with per-section review instructions.

- **Iteration 6 (ChatGPT):** full-document adversarial review — verdict MODIFY-then-final, no architectural reversals. Seven executive defects (B1–B7): missing §14, non-standalone §4.4 schemas, direct-prompt vs sign-off-trigger conflict, P3's premature memory request, event ordering/replay gaps, P0 exit wording, UI scope guard — plus per-section tightenings.
- **Iteration 7 (Claude):** **the FINAL master prompt** — all B1–B7 and per-section modifications applied, zero rejections, nothing broadened. Cycle closed (`iter_07_claude_final.md`).

**Team:** Jackson works solo-runnable lanes while Will is offline — red-team the final spec, UI/UX design track, acceptance-test catalog (`JACKSON_START_HERE.md` has his full playbook). All spec changes go through master prompt §12 proposals; Will arbitrates. Jackson's GROVER login remains post-v2.0; he's a co-planner now, a user later.

---

## 3. Repo layout (organized by version)

- `planning/` — **v2, current work.** `grover_v2_master_prompt.md` (**the binding spec**), this file, `PLANNING_BOARD.md` (assignments + locked decisions + iteration ledger), `chatgpt_handoffs/` (the closed iteration thread + `jackson_NN_*.md` lanes), and the planning record (`grover_v2_scope_understanding.md`, `grover_v2_master_prompt_DRAFT.md` — superseded, rationale only).
- `design/` — v2 visual references: `ART INSPIRATION/` (Arcane/Spider-Verse; orb + accent language per spec §5) and `GROVER command center UI design/` mockups.
- `archive/` — **v1, frozen.** `grover_v1/` (full build; its `data/` and `vault/` contain secrets/personal memory and are gitignored), `grover_v1_master_prompt.md` (do not carry forward without re-deriving), `grover_v1_git_history.bundle` (redundant history backup).
- Root — `README.md` (status board), `JACKSON_START_HERE.md` (onboarding), `GIT_SETUP.md` (git workflow), repo housekeeping files.

---

## 4. Immediate next steps

- **Jackson (runnable now, Will offline):** the three lanes in `JACKSON_START_HERE.md` — red-team the final master prompt, UI/UX spec, acceptance-test catalog. Findings as §12 proposals, pushed to the repo.
- **Will (when back):** review Jackson's proposals per §12, then formally approve `planning/grover_v2_master_prompt.md`. That approval is the P0 exit and the build green light — P1 (spine skeleton) starts from the master prompt alone.
- **Nobody:** writes v2 application code before Will's approval.
