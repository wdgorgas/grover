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

Required fixtures: UI-only, backend/API, setting/control, persistent project state, and refused/sign-off-required negative case. Every fixture must add a regression assertion. Crash recovery must be separately demonstrated.

## P4 — minimal memory

The eleven required checks are enumerated in master prompt §8.5–§8.6 and must be implemented as mechanical tests before P4 closes.

## P5 — hardening

Drills: queued and in-progress kill switch, budget breach, all five sign-off triggers, prompt injection, verification failure, app crash/restart, vault backup and restore, and complete failed-build recovery card.
