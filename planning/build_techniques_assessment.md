# Build-stage techniques assessment (Grok list → what we actually use)

**Context:** Will had Grok compile development techniques from practitioner threads on X (`claude build stuff.txt`, not in repo). Per Will's framing these are **build-process techniques only** — not runtime behaviors for GROVER itself, which are governed exclusively by the master prompt. This file records what was adopted, adapted, skipped, or rejected, and why — so the decision isn't relitigated and nothing leaks into the spec through the side door (master prompt §14.4).

**Where adopted items live:** the repo-root `CLAUDE.md` session contract. That's the whole implementation — deliberately files-in-repo, not tooling.

## Verdicts

**ADOPTED — CLAUDE.md session contract.** Grok's strongest item. A repo-root contract that every Claude session auto-loads is standard high-leverage practice: it encodes the bootstrap ritual, verification rules, boundaries, and handoff format once, instead of re-teaching them per session and hoping the model remembers. Written and live.

**ADOPTED — verification-first sessions.** Playwright/browser evidence for UI, tests for backend, evidence before claims. This was already binding in the master prompt (§5, §11); CLAUDE.md restates it at the session level so it applies to *human-driven dev sessions during the build*, not just GROVER's own runtime later.

**ADAPTED — maker/checker verifier.** Grok proposed a formal `agents/verifier` subagent folder. Adopted as a lighter rule: before committing a slice, a fresh-context review of the full diff against the current phase exit (subagent when available, explicit self-review step otherwise). A formal verifier agent definition is worth revisiting once P2+ produces real code volume; premature as folder scaffolding now.

**ADAPTED — the 4-layer framing (Prompt → Context → Harness → Loop).** Kept as a mental model for diagnosing build problems ("is this failing because of prompt, context, harness, or loop?"). Nothing to implement — it's a lens, not a component.

**SKIPPED for now (revisit when a real need appears):**

- **hooks/, skills/, .mcp.json scaffolding** — useful once there are recurring mechanical session tasks worth automating; empty scaffolding now would be ceremony. Revisit at P2/P3 when build sessions have repeating shapes.
- **git worktrees for parallel work** — Will and Jackson work mostly asynchronously (relay model); branches cover it. Adopt only if genuinely simultaneous slices become common.
- **Scheduled automations** — nothing recurring exists to schedule during the build yet.
- **A separate dev MEMORY.md** — the repo already has authoritative shared memory: the board, phase handoffs, DECISIONS.md, git history. A second memory surface would create a second source of truth, which is exactly the failure class v2 is designed against.

**REJECTED as written:**

- **"Implement loop primitives inside BuildRun" / inner-loop engineering** — as an app feature this contradicts D4: the Claude Agent SDK *is* the execution loop, behind the `ExecutionEngine` adapter. GROVER does not grow its own hand-rolled loop machinery; that was v1's mistake.
- **"Memory & context practices" as build tasks** — Grok restated master prompt §8 (vault, context pack, consolidation, namespaces) as if it were new technique. It's already spec; building it happens in P4, on the spec's terms, not as a session-technique import.
- **Grok's prompt template as a Builder session prompt** — it mixes dev-harness advice with app architecture directives and cites a nonexistent path. Any session prompt for building GROVER is: read `CLAUDE.md`, read the master prompt, state the phase, take a slice. Nothing more is needed.

## Standing rule

External technique lists (Grok, X threads, blog posts) are **candidate input for this file only**. Adoption = an entry here +, if session-level, a CLAUDE.md change (with the §11.6 prediction line in DECISIONS.md). They never modify the master prompt except through a §12 `PlanningProposal`.
