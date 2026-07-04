# Planning board

One line per active workstream. Claim by adding your name and pushing. Update status when you push results.

| # | Workstream | Owner | Status | Output location |
|---|---|---|---|---|
| 1 | Main planning thread (Claude ↔ ChatGPT iterations → master prompt) | Will | Iterations 1–3 done; **waiting on ChatGPT's iter 4 ruling on M1–M4**; iter 5 = Claude drafts master prompt | `planning/chatgpt_handoffs/iter_NN_*.md` |
| 2 | UI/UX spec track: visual direction, theme token system, layout of Command Center + Builder view, orb integration (orb itself carries verbatim) | Jackson | **Unclaimed — Jackson's suggested first assignment** | `planning/chatgpt_handoffs/jackson_01_uiux_spec.md` |
| 3 | Red-team pass: read iterations 1–3 cold and hunt for unwritten assumptions, contradictions, and v1-failure echoes | Jackson | Unclaimed | `planning/chatgpt_handoffs/jackson_02_redteam.md` |
| 4 | Acceptance-test catalog: expand the phase-exit drills from iter 3 into a numbered, runnable test list for v2.0 | open | Blocked until iteration 4 lands | TBD |

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
| 4 | ChatGPT → Claude | *pending — delta-only ruling on M1–M4* |
| 5 | Claude → ChatGPT | *planned — full master prompt draft* |
| 6 | ChatGPT → Claude | *planned — adversarial full review* |
| 7 | Claude | *planned — final master prompt; Will green-lights build* |
