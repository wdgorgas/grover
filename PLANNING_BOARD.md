# Planning board

One line per active workstream. Claim by adding your name and pushing. Update status when you push results.

| # | Workstream | Owner | Status | Output location |
|---|---|---|---|---|
| 1 | Main planning thread (Claude ↔ ChatGPT iterations → master prompt) | Will | Iteration 3 sent, awaiting ChatGPT reply | `chatgpt_handoffs/iter_NN_*.md` |
| 2 | UI/UX spec track: visual direction, theme token system, layout of Command Center + Builder view, orb integration (orb itself carries verbatim) | Jackson | **Unclaimed — Jackson's suggested first assignment** | `chatgpt_handoffs/jackson_01_uiux_spec.md` |
| 3 | Red-team pass: read iterations 1–3 cold and hunt for unwritten assumptions, contradictions, and v1-failure echoes | Jackson | Unclaimed | `chatgpt_handoffs/jackson_02_redteam.md` |
| 4 | Acceptance-test catalog: expand the drills in iter 3 §Phases into a numbered, runnable test list for v2.0 | open | Blocked until iteration 4 lands | TBD |

## Decisions locked by Will (do not reopen in any workstream)

- v2.0 done = Builder + minimal memory core, both personally confirmed by Will. Broad personal-life memory = v2.1, first item after v2.0 confirms.
- Multi-user/Jackson-login deferred past v2.0 (Jackson co-plans now; his GROVER access comes later).
- **Five** sign-off triggers: real money · irreversible/destructive · Jackson's private space · self-initiated Grover changes · security-boundary changes. Everything else: full autonomy.
- Claude Agent SDK is the default Builder engine behind a replaceable `ExecutionEngine` adapter; GROVER owns state/cost/sign-off/UI.
- Dev budget guards: $25 soft / $50 hard per phase.
- Orb + v1 security model carry verbatim; everything else re-derived.
