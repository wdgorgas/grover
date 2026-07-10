# Planning board → Build board

**P0 APPROVED by Will, 2026-07-03. The build is green-lit. Current phase: P1 — spine skeleton.**

Workflow is a relay (see `JACKSON_START_HERE.md` §3): pull → create a slice branch → build or verify a small slice → push → leave the five-line handoff. Update this board whenever phase status changes. Sessions are governed by the repo-root `AGENTS.md` plus any client-specific contract such as `CLAUDE.md`.

## Phase status

| Phase | What | Status |
|---|---|---|
| P0 | Decision lock + master prompt | **APPROVED (Will, 2026-07-03)** — spec: `planning/grover_v2_master_prompt.md` |
| P1 | Spine skeleton: SPA shell, orb port, events+projections, SSE, cost-ledger stub, kill switch, object-model schema, DomainContract stubs | **OPEN** — event spine implemented/hardened on `phase-p1-event-spine` (14 tests); remaining slices listed in `planning/p1_progress.md`; budget $25 soft / $50 hard |
| P2 | Razor Builder slice (one real request end-to-end) | Blocked on P1 exit |
| P3 | Builder reliability set (5 diverse requests) | Blocked on P2 exit |
| P4 | Minimal memory core (10 tests + no-migration test) | Blocked on P3 exit |
| P5 | Hardening drills → v2.0 | Blocked on P4 exit |

## Open side-tracks

| Track | Owner | Status | Output |
|---|---|---|---|
| Acceptance-test catalog: expand master prompt §5/§13 into a numbered runnable checklist (this is also a strong P1 warm-up task) | open (relay) | Unclaimed | `planning/acceptance_test_catalog.md` |
| Visual direction / UI design | **Will + Claude Design (Will's alone)** | Will owns this directly; Jackson routes ideas to Will, doesn't own the direction | `design/` |
| Build-technique intake (external lists → adopt/skip) | main thread | Standing rule + first pass done | `planning/build_techniques_assessment.md` |
| Daily-driver product contract | **Will** | PlanningProposal 002 pending; resolve front-door intent and progressive disclosure before SPA implementation | `planning/proposals/proposal_002_daily_driver_contract.md` |

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
