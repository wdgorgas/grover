# GROVER v2 — Handoff

**What this is:** a cold-start briefing, not the spec. If you're picking this project up without the conversation history, read this first — it tells you what happened, where things stand, and where to look for the actual content. The spec itself lives in `grover_v2_scope_understanding.md`, in the same folder.

---

## 1. The story so far

v1 was built (via Fable/Cowork) from what is now `archive/grover_v1_master_prompt.md`, at what is now `archive/grover_v1/`. It cost ~$70 and was declared a failure — not because the underlying engineering was bad (a real loop engine, evidence-gating, an actual file-editing runner, audit logs all existed), but because none of it added up to something usable:

- The Builder tab was organized around loop-lifecycle jargon instead of being simple and transparent.
- Zero live visual feedback — you couldn't tell what was happening, where, or how far along.
- The autonomy dial (0–5) did nothing; it saved but never gated behavior.
- Status contradicted itself across the UI (a "running" task still showed a working Verify button; clicking things caused page reloads).
- The visuals read as generic/AI-generated/"Iron-Man-y"/early-2010s-futuristic — except the orb, which worked and should be kept as-is.

Direct code fixes were attempted mid-session and abandoned — Will's assessment was that the code changes made no visible difference, and the instruction was explicit: **stop coding, do spec work only.** v1's repo is left as-is; it's reference material for "what v1 actually did wrong," not something being iterated on.

Decision made: full v2 rebuild, spec-first. v1's repo and master prompt are historical reference only.

---

## 2. What v2 planning has produced so far

`grover_v2_scope_understanding.md` — a section-by-section understanding of v2, built by proposing content and having Will correct it in place. As of now it covers:

1. What GROVER is, in one paragraph
2. What went wrong in v1 (why v2's priorities are what they are)
3. Non-negotiable v2 priorities (Builder works, visibly, end to end — first and only thing that matters until proven; everything else deferred)
4. Core philosophy — trimmed to "best app, no corners cut" plus four practical rules
5. UI/UX identity — visual direction overhauled (reject Iron-Man/HUD/generic-AI look; keep the orb exactly; aim for artistry/modern/smooth/human, benchmarked against products like Linear/Arc/Things)
6. Governance model — the 6-level autonomy dial is gone, replaced by a managerial-hierarchy pipeline (Context/App Manager → Research/Coding/Grover Builder/Lifestyle/Quant/Business → Memory Manager → Cache/Long-term Memory → Processing gated by a Cost Manager → Output), with a simple sign-off rule: default is full autonomy, four named triggers require Will's sign-off (real money, irreversible/destructive actions, anything touching Jackson's private space, self-initiated changes to Grover itself)
7. Users/memory/personalization — namespaced memory, layered memory system; Jackson's multi-user login is an open architecture fork (server+Cloudflare Access vs. same-machine profiles vs. unsynced local installs), current recommendation is to defer past v2.0
8. Module roadmap — Research Desk, Income Lab (with real quant rigor requirements), Inspiration Inbox, Health/Briefing/Media (future), Voice/Hardware (deferred, not routed through Siri)
9. Model/provider strategy — Claude default, not vendor-locked
10. Cost governor — capability tiers, output classes, real current pricing as reference
11. Development process rules — true SPA/no reloads ever, actions computed from real state (no premature Verify), background vs. foreground tasks get different controls, evidence-gating is automatic not manual busywork, user claims aren't evidence, architecture decisions get derived not copied from v1
12. Open questions — what's still genuinely unresolved (see below)
13. Reference appendix — a large external technique list (prompting patterns, loop engineering, memory vaults, subagent patterns) Will had Grok compile, logged as non-binding candidates mapped against what's already decided

---

## 3. What's actually still open

**All four §12 items were resolved with Will on 2026-07-03** (see scope doc §12): v2.0 done = Builder + memory core; multi-user deferred; the four sign-off triggers are final; orb and security model carry verbatim, memory schema re-derived.

**Current phase: Claude ↔ ChatGPT co-planning cycle** (Will relays files between them). Status: iterations 1–3 done. ChatGPT's iteration 2 accepted the core architecture with modifications; iteration 3 locked Will's decisions (see scope doc §12a: five sign-off triggers, $25/$50 phase budgets, minimal memory core with broad memory as v2.1 flagship, Agent SDK behind an `ExecutionEngine` adapter) and sent four modifications (M1–M4) back for ruling. Zero HIGH-severity disagreements open. Convergence path: iter 4 = ChatGPT rules on M1–M4 → iter 5 = Claude drafts the master prompt → iter 6 = ChatGPT full review → iter 7 = final. Jackson has joined planning with his own Claude+ChatGPT pair — coordination via the git repo (`README.md`, `PLANNING_BOARD.md`, `JACKSON_START_HERE.md`, `GIT_SETUP.md`).

---

## 4. File map

- `C:\Grover v2\grover_v2_scope_understanding.md` — the living spec-in-progress. Source of truth for actual content.
- `C:\Grover v2\grover_v2_handoff.md` — this file. Status/context, not content.
- `archive/grover_v1_master_prompt.md` — v1's master prompt. Historical reference only; do not carry forward without re-deriving (see §11 rule above).
- `archive/grover_v1/` — v1's actual build. Reference for "what v1 did," not being modified. Its `data/` and `vault/` contain secrets/personal memory and are gitignored.
- `README.md`, `PLANNING_BOARD.md`, `GIT_SETUP.md`, `JACKSON_START_HERE.md` — repo coordination for the two-person planning workflow (repo: github.com/wdgorgas/grover).
- `C:\Grover v2\ART INSPIRATION` — visual references (Arcane/Spider-Verse), still relevant to the orb/accent language per §5.
- `C:\Grover v2\chatgpt_handoffs\` — the Claude↔ChatGPT planning cycle. `iter_NN_claude_to_chatgpt.md` outbound, ChatGPT replies filed alongside.

---

## 5. Immediate next step

Run the Claude↔ChatGPT planning cycle to convergence on the iteration-1 proposals (architecture, verification harness, memory core, phasing), then draft the actual v2 master prompt (the document that goes to Fable) from `grover_v2_scope_understanding.md` + the converged decisions — not copied from v1's prompt, restructured around the managerial hierarchy as routing/policy architecture, with the process rules in §11 written as enforceable instructions rather than aspirations.
