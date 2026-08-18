# Planning board → Build board

**P0 APPROVED by Will, 2026-07-03. Current implementation phase: P2/P3 Builder reliability. P1 mechanical exit passed 2026-08-18.**

Workflow is a relay (see `JACKSON_START_HERE.md` §3): pull → create a slice branch → build or verify a small slice → push → leave the five-line handoff. Update this board whenever phase status changes. Sessions are governed by the repo-root `AGENTS.md` plus any client-specific contract such as `CLAUDE.md`.

## Phase status

| Phase | What | Status |
|---|---|---|
| P0 | Decision lock + master prompt | **APPROVED (Will, 2026-07-03)** — spec: `planning/grover_v2_master_prompt.md` |
| P1 | Spine skeleton: Windows desktop shell, events+projections, desktop IPC, cost ledger, kill switch, object-model schema, DomainContract stubs | **MECHANICAL EXIT PASSED (2026-08-18)** — 32 deterministic tests, desktop no-reload smoke, packaged live Codex, Noop engine-swap/lane tests, restart and transition coverage; final orb deferred by Proposal 006 |
| P2 | Razor Builder slice (one real request end-to-end) | **AUTOMATED EXIT GREEN / HUMAN FINAL PASS PENDING** — live isolated Codex Builder branch/edit/test/evidence/commit/receipt flow passes; continued under Proposal 006 |
| P3 | Builder reliability set (5 diverse requests) | **MECHANICAL EXIT PASSED (2026-08-18)** — live UI/backend/settings/persistence builds, pre-engine private-space refusal, accumulated regression suite, and restart recovery green |
| P4 | Minimal memory core (10 tests + no-migration test) | **ACTIVE** |
| P5 | Hardening drills → v2.0 | Blocked on P4 exit |

## Open side-tracks

| Track | Owner | Status | Output |
|---|---|---|---|
| Acceptance-test catalog: expand master prompt §5/§13 into a numbered runnable checklist (this is also a strong P1 warm-up task) | open (relay) | Unclaimed | `planning/acceptance_test_catalog.md` |
| Visual direction / UI design | **Will** | New direction pending; visual polish deferred until the local desktop application is functional | `design/` |
| Build-technique intake (external lists → adopt/skip) | main thread | Standing rule + first pass done | `planning/build_techniques_assessment.md` |
| Daily-driver product contract | **Will** | PlanningProposal 002 accepted 2026-08-18; implement front-door intent and progressive disclosure in the functional shell | `planning/proposals/proposal_002_daily_driver_contract.md` |
| Local Windows delivery | **Codex** | PlanningProposal 003 accepted 2026-08-18; active implementation | `planning/proposals/proposal_003_local_windows_desktop.md` |
| Provider-neutral agent manager | **Codex** | PlanningProposal 004 accepted 2026-08-18; Codex preferred, Claude fallback/checker | `planning/proposals/proposal_004_provider_neutral_agent_manager.md` |
| Fluid context workspaces | **Codex** | PlanningProposal 005 accepted 2026-08-18; functional shell implemented and packaged | `planning/proposals/proposal_005_fluid_context_workspaces.md` |
| Continuous functional delivery | **Codex** | PlanningProposal 006 accepted 2026-08-18; no routine phase pauses, final visual/human pass retained | `planning/proposals/proposal_006_continuous_functional_delivery.md` |

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
