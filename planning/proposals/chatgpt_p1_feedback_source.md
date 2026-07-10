# Claude feedback — P1 first pass critique

Overall: this is a strong first P1 slice. Starting with the append-only event spine, reducers, projection rebuild, and restart persistence was the right move. The test list is not cosmetic; it covers several real invariants early: mandatory `plain_language`, idempotency/cost-once behavior, seq-over-timestamp replay, rebuild equality, restart persistence, enum rejection, and server-computed actions. That is exactly the kind of foundation P1 needs.

That said, I would not call this “safe to coast” yet. The slice is good, but a few things should be tightened before the next layers start depending on it.

## Main critiques

### 1. Treat the git/sandbox corruption as a P1 blocker-class process risk

The progress note says five files were truncated and later restored, then a stale `.git/index.lock` / confused index appeared after a sandbox `git status`. That is not just “weirdness.” It is a serious workflow risk because P1 is supposed to establish the reliable spine of the repo, and corrupted handoffs could silently poison later sessions.

Recommendation:

- Add a short repo-local rule/protocol file, or amend the handoff, saying sandbox sessions must not run git commands at all.
- Host should do all `git status`, branch, commit, merge, and diff operations.
- Before any new coding pass, host should verify a clean/expected working tree.
- If a sandbox needs file context, pass explicit file contents or mounted copies, not the live repo as a git workspace.

The current note “Treat ALL git commands as host-only” is good, but I would make it operational and visible enough that Jackson/Claude/Will cannot miss it.

### 2. Define idempotency collision behavior now, before more writers exist

The test proves duplicate events do not double-append or double-count cost. Good. But P1 should also define what happens when the same idempotency key is reused with different payload fields.

Recommendation:

- Add a test: same idempotency key + different `plain_language`, `phase`, `cost_delta`, `task_id`, etc.
- Choose one explicit behavior:
  - reject as conflict, preferably; or
  - return the original event and ignore the new payload, but make that intentional.

I strongly prefer reject-as-conflict. Silent ignore is dangerous because UI retries, SSE reconnects, and future engine calls could hide bugs.

### 3. Budget hard-cap semantics need to be designed before cost-ledger work

Money as integer micro-USD is correct. But cost accumulation in projections is not enough for budget enforcement. A hard cap has to be checked before accepting a cost-bearing event, or else the system can record the violation only after it already happened.

Recommendation for next cost slice:

- Add a pre-append budget guard for cost-bearing events.
- Define what happens when an append would exceed the hard cap: reject append, append a zero-cost `blocked`/`budget` event, or both via a controlled path.
- Add restart/rebuild tests proving the cost ledger and projections reconcile exactly.
- Add a test for “near hard cap + event would cross hard cap.”

Do not leave this to UI actions. Budget enforcement belongs server-side.

### 4. `appendEvent` transaction shape is okay for now, but should not leak into future batch semantics

`BEGIN IMMEDIATE` and append+reduce in one transaction is the right instinct. The risk is that `appendEvent` is not nestable, and P1 still has upcoming objects that may want to create multiple linked records/events atomically.

Recommendation:

- Keep `appendEvent` as the public single-event write path.
- Add a private lower-level transaction helper or future `appendEventsBatch()` before cost-ledger / object-model code starts needing multi-write atomicity.
- Add a test that failed appends do not partially update projections.

This is not urgent enough to rewrite now, but it is worth preventing accidental copy-pasted transaction logic.

### 5. Reducer placeholder semantics are acceptable, but must stay isolated

The decision log is honest that task statuses/actions and BuildRun mapping are minimal placeholders. That is fine for the spine slice. The risk is that the SPA/SSE layer may start treating those placeholder mappings as durable product behavior.

Recommendation:

- Keep the mapping centralized in one reducer module.
- Add comments/tests marking the mappings as P1 placeholders.
- When building the HTTP/SSE surface, expose “server-computed actions” as data, but do not bake assumptions like “active always equals pause/cancel” into the client.
- At P1 exit, explicitly check the prediction that engine/SSE changed mappings without schema or append/rebuild changes.

### 6. Consider doing Builder object-model closure before SSE, not after

The progress note suggests either object-model tables + closure invariant or HTTP/SSE next. Both are valid, but I would slightly favor the object-model closure slice first.

Reason: SSE is easy to make look alive while streaming underspecified objects. Closure invariants force the event spine to support the actual Builder domain: FeatureRequest, BuildRun, AcceptanceCheck, EvidenceAsset, GitCommit, and MemoryUpdateProposal. Once that exists, SSE can stream meaningful domain state instead of a generic event toy.

Suggested next order:

1. Builder object-model tables + closure invariant.
2. Cost-ledger stub + hard-cap/restart reconciliation.
3. Minimal HTTP/SSE replay from `last_seq`.
4. NoopHarnessEngine + engine-swap test.
5. SPA/orb/reload detector once server semantics are less fake.

I would not block Jackson/Claude if they choose SSE first, but object-model-first is cleaner.

### 7. Add host-environment verification, especially Windows/PowerShell

The tests passed in a Linux sandbox on Node v22.22.3. Will’s host is Windows/PowerShell. Since this project intentionally uses Node 22 built-ins and zero dependencies, the host path needs to be verified early.

Recommendation:

- Run `cd app && npm test` on Will’s host.
- Record the exact host Node version.
- Add a note if `node:sqlite` / built-in TS stripping requires a specific Node minor version or module setting.
- Keep scripts Windows-safe; avoid shell-specific commands in `package.json`.

### 8. Tighten `plain_language` validation slightly

Mandatory `plain_language` is the right human-legibility invariant. But the current test description only says “plain_language rejection.” It should reject empty or whitespace-only strings, and probably impose a reasonable max length.

Recommendation:

- Add tests for missing, empty, and whitespace-only `plain_language`.
- Consider max length to prevent giant logs from being shoved into the event table.

## Suggested message to Claude for the next pass

Claude: P1 first slice looks good, but please harden before building too much UI/server behavior on top of it. Highest priority critiques:

1. Treat sandbox/git corruption as a serious process risk. Make host-only git operations explicit in the repo/handoff, not just buried in notes.
2. Add idempotency collision behavior: same key with different payload should probably reject as conflict.
3. When starting cost-ledger work, enforce hard budget server-side before accepting cost-bearing events; add near-cap crossing tests.
4. Keep reducer status/action mappings isolated as placeholders; do not let the SPA/SSE client bake them in as permanent semantics.
5. Prefer Builder object-model closure invariant before SSE if possible, so streamed state is meaningful rather than generic event plumbing.
6. Verify `npm test` on Will’s Windows host with exact Node version recorded.
7. Add `plain_language` edge-case tests: missing, empty, whitespace-only, and maybe max length.

Net: good foundation, especially the rebuild/restart/idempotency tests. The main danger is not the code so far; it is letting placeholder semantics and sandbox workflow weirdness harden into the project before P1 exits.
