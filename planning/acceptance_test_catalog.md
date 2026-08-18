# GROVER v2 acceptance test catalog

This is the runnable index for phase exits. The binding behavior remains `planning/grover_v2_master_prompt.md` plus accepted PlanningProposals.

## P1 — spine skeleton

| Requirement | Evidence | Result |
|---|---|---|
| Desktop shell and local IPC | `npm run test:desktop` | Pass |
| No reloads / renderer isolation | Electron smoke navigation and Node-access assertions | Pass |
| Noop engine streams normalized progress | `core.test.ts` Noop engine-swap test | Pass |
| One authoritative task status | event reducer and Noop tests | Pass |
| Pause, resume, cancel, and kill switch | `core.test.ts` transition tests | Pass |
| Provider swap preserves state/cost/conversation | Noop engine-swap test | Pass |
| Coding routes away from Builder | Noop test asserts `work` mode and no FeatureRequest | Pass |
| Builder cannot read `jackson-private` | DomainContract regression test | Pass |
| Cost ledger survives restart | file-backed cost restart test | Pass |
| Projection replay equality | event-spine rebuild test | Pass |
| Full Builder object schema and closure invariant | store schema/closure tests | Pass |
| Portable Windows runtime | `npm run test:portable` with bundled Codex | Pass |
| Final orb integration | Proposal 006 functional-first deferral | Deferred before final v2.0 acceptance |

## P2 — razor Builder

Run `npm run test:builder`. Required assertions: real engine, FeatureRequest and BuildRun, live events, dedicated branch, changed file, automated test evidence, commit, clean worktree, and receipt. Human-visible confirmation remains part of the final hands-on acceptance pass under Proposal 006.

## P3 — Builder reliability

`npm run test:builder-reliability` passes live Codex UI-only, backend/API, setting/control, and persistent project-state changes plus a pre-engine `jackson-private` refusal. The same fixture reruns accumulated regressions after every commit. `core.test.ts` separately simulates restart during an active build and asserts paused recovery state.

## P4 — minimal memory

`memory.test.ts` passes the ten §8.5 groups plus the §8.6 no-migration check. `test/fixtures/memory-retrieval-eval.json` contains 20 deterministic include/exclude scenarios. `npm run test:memory-live` verifies relevant memory use after a real database restart through Codex.

## P5 — hardening

`p5-hardening.test.ts` deliberately passes queued and in-progress kill-switch stops, pre-call hard-budget blocking, all and only five sign-off triggers, hostile external-memory injection exclusion, integrity-checked vault backup/restore, tamper warning, and a browser-verification failure. The failed build preserves its edit and stores a complete recovery card: changed files, revert state, evidence, cost, and next safe action. `core.test.ts` separately closes and reopens the database mid-build and asserts paused state plus a durable crash-recovery card. `npm run test:desktop` asserts all five read-only policy boundaries render without a document reload.
