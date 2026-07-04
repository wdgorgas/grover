# Planning board

One line per active workstream. Claim by adding your name and pushing. Update status when you push results.

| # | Workstream | Owner | Status | Output location |
|---|---|---|---|---|
| 1 | Main planning thread (Claude ↔ ChatGPT iterations → master prompt) | Will | **COMPLETE** — 7 iterations; final spec: `planning/grover_v2_master_prompt.md`. Thread closed; changes now go through §12 proposals only | `planning/chatgpt_handoffs/iter_NN_*.md` |
| 2 | **Red-team the FINAL master prompt** — cold read, hunt contradictions/loopholes/unwritten assumptions; findings as §12 proposals | Jackson | **Unclaimed — Jackson's #1 priority; fully runnable while Will is offline** | `planning/chatgpt_handoffs/jackson_01_redteam_master_prompt.md` |
| 3 | UI/UX spec track: visual direction, theme token system, layout of Command Center + Builder view, orb integration (orb itself carries verbatim) | Jackson | Unclaimed — target: ready before build Phase 1 starts | `planning/chatgpt_handoffs/jackson_02_uiux_spec.md` |
| 4 | Acceptance-test catalog: expand master prompt §5/§13 (evidence matrix, phase exits, P5 drills, 10 memory tests, no-migration test) into a numbered, runnable test list for v2.0 | open | Unblocked — source is the final master prompt | `planning/acceptance_test_catalog.md` |
| 5 | **P0 exit: Will formally approves the master prompt → build green light** | **Will (only)** | **Waiting on Will** — reviews Jackson's proposals first, then approves. Nothing gets built before this | — |

## Decisions locked by Will (do not reopen in any workstream)

- v2.0 done = Builder + minimal memory core, both personally confirmed by Will. Broad personal-life memory = flagship v2.1 feature, first item after v2.0 confirms.
- Multi-user/Jackson-login deferred past v2.0 (Jackson co-plans now; his GROVER access comes later).
- **Five** sign-off triggers: real money · irreversible/destructive · Jackson's private space · self-initiated Grover changes · security-boundary changes. Everything else: full autonomy.
- Claude Agent SDK is the default Builder engine behind a replaceable `ExecutionEngine` adapter; GROVER owns state/cost/sign-off/UI.
- Builder object model: `FeatureRequest → BuildRun → AcceptanceCheck → EvidenceAsset → GitCommit/MemoryUpdateProposal`, SQLite-authoritative.
- Dev budget guards: $25 soft / $50 hard per phase.
- Orb + v1 security model carry verbatim; everything else re-derived.

## Iteration ledger (main thread)

| Iter | Direction | Summary |
|---|---|---|
| 1 | Claude → ChatGPT | Full architecture proposal (A1–A7), self-identified weaknesses, 6 questions |
| 2 | ChatGPT → Claude | Accepted core shape; added adapter boundary, DomainContract, object model, 10 memory tests, phase resequence |
| 3 | Claude → ChatGPT | Locked Will's decisions (D1–D6); accepted most of iter 2; sent M1–M4 modifications for ruling; set 4-iteration convergence path |
| 4 | ChatGPT → Claude | Accepted M1–M4 with guardrails (all adopted); caught the missing proposal-intake protocol (now master prompt §12); zero high-severity disagreements |
| 5 | Claude → ChatGPT | **Master prompt DRAFT** (`planning/grover_v2_master_prompt_DRAFT.md`) + cover note with review instructions |
| 6 | ChatGPT → Claude | Full adversarial review: MODIFY-then-final; 7 executive defects (B1–B7, incl. missing §14, non-standalone schemas, direct-prompt/trigger conflict) + per-section tightenings; no architectural reversals |
| 7 | Claude | **FINAL master prompt** (`planning/grover_v2_master_prompt.md`) — all B1–B7 + per-section mods applied, zero rejections. **Planning cycle closed.** Awaiting Will's P0 approval |
