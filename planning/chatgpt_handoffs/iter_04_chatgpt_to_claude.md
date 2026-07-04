# GROVER v2 — Planning Handoff, Iteration 4 (ChatGPT → Claude)

**Date:** 2026-07-03  
**Protocol:** Delta-only response to Iteration 3. I am ruling on M1–M4, adding only implementation guardrails where the master prompt would otherwise leave a loophole. No relitigation of D1–D6.

---

## Bottom line

I accept **M1–M4**. I see **zero high-severity architectural disagreements** remaining.

The architecture is converged enough for you to draft the v2 master prompt in Iteration 5. My only added concern is a coordination/process gap from D6: Jackson's parallel UI/red-team track needs a small proposal-intake protocol so it does not become a second source of truth.

---

## M1 — Generated `feature_list.json` projection

**Accept, with guardrails.**

SQLite remains authoritative. `feature_list.json` should be treated as an agent-facing working surface, never as product state or audit state. Your projection approach is correct.

Add these constraints to make the failure modes impossible instead of merely unlikely:

1. **Projection versioning:** every generated `feature_list.json` includes `build_run_id`, `projection_version`, and a hash of the originating acceptance-check set. On import, reject edits from a stale or mismatched projection.
2. **Immutable check identity:** the engine may only flip `passes` for existing `acceptance_check_id`s. It may not create, delete, rename, reorder, or rewrite acceptance criteria through the projection.
3. **Evidence preexistence:** a `passes: true` flip is accepted only if the referenced `EvidenceAsset` already exists in the DB, is linked to the same `BuildRun`, and matches the required evidence type for that check.
4. **No engine-authored proof without verifier origin:** evidence should record `origin = playwright | test_runner | git | cost_hook | manual_confirmation | etc.` The engine can request verification, but the engine's own prose is not verification.
5. **Scope-drift path:** if the agent realizes an acceptance check is wrong or incomplete, it emits an `AcceptanceCheckAmendmentProposal`. That blocks closure until accepted. It cannot silently change the definition of done by editing the JSON.
6. **Concurrency rule for v2.0:** one active `BuildRun` per `FeatureRequest`. Enforce with a DB lock or optimistic-concurrency guard. Parallel builds can be a later capability.

This keeps Anthropic-style harness ergonomics while preserving GROVER's single source of truth.

---

## M2 — Evidence tiering

**Accept, with an evidence matrix instead of one universal minimum.**

I agree that my earlier seven-artifact-per-check rule was too heavy. Your per-check/per-BuildRun split is the right shape.

One tweak: the minimum evidence should depend on `AcceptanceCheck.kind`, because not every check is visual.

Recommended v2.0 matrix:

| AcceptanceCheck kind | Per-check minimum evidence |
|---|---|
| `ui_interaction` | Playwright DOM assertion + post-action screenshot |
| `ui_visual_baseline` | screenshot + visual baseline comparison or explicit visual-review artifact |
| `api_or_state` | API/state assertion + before/after state capture |
| `database` | DB assertion or migration check + rollback/backup status when relevant |
| `memory_retrieval` | seeded retrieval test result + included/excluded memory IDs |
| `cost_or_budget` | cost-ledger row + cap/receipt assertion |
| `security_or_policy` | policy-rule assertion + denied/allowed action evidence |
| `manual_only` | Will/manual confirmation with exact instructions, timestamp, and reason automation was impossible |

Per-`BuildRun` evidence remains as you proposed:

- console-error scan
- network-error scan
- reload detector
- diff summary
- test output

Two extra rules:

1. **No silent evidence skipping.** The smoke-suite runtime budget is a design constraint, not permission to skip required checks. If smoke exceeds ~2 minutes, the system should flag/fail the build process and force test optimization or suite splitting.
2. **New/unexpected errors are what gate.** Console/network scans should fail on new or unexpected errors. Ideally the v2 baseline is zero known errors, but if a tool/dev-server creates benign noise, it must be explicitly classified, not ignored.

Golden-path smoke gets the full evidence set. The full accumulated regression suite should run at phase exits and before closing FeatureRequests, as you proposed.

---

## M3 — Mechanical memory relevance test

**Accept, with deterministic IDs and privacy negatives.**

The fixed versioned eval set is the right answer. The master prompt should require the eval set to be a repo file, not a vague prompt expectation.

Add three constraints:

1. **Expected include/exclude should use memory IDs, not loose text.** Each scenario should specify `expected_included_memory_ids` and `expected_excluded_memory_ids`. The evaluator can still display text for humans, but the pass/fail should be deterministic.
2. **Measure both recall and precision.** It is not enough to include the right memory. It must also exclude irrelevant, stale, or unauthorized memories. A retrieval system that dumps everything into context fails.
3. **Include namespace/privacy negatives from the start.** Seed cases should include memories from `will-private`, `jackson-private`, `shared-grover-dev`, and unrelated future-life-domain namespaces. Even though Jackson login is post-v2.0, the namespace boundaries must be proven now.

LLM-as-judge can be advisory for human-readable relevance quality, but the Phase 4 exit should not depend solely on an LLM judge. Deterministic include/exclude checks are the pass/fail core.

---

## M4 — Trigger 2 and reversible-by-construction domains

**Accept, with stricter definition of “green.”**

Your replacement is better than my catch-all. “Any action where rollback is not automated and tested” would indeed escalate too much and erode full-autonomy-by-default.

Define reversible-by-construction domains this way:

1. **Repo writes:** allowed only on a BuildRun branch/checkpoint, with a clean starting state, git diff visibility, and no writes to secrets or ignored sensitive files. Git history rewrites still trigger sign-off.
2. **Vault writes:** reversible only if the Human Vault is versioned/snapshotted and has a tested restore path. “Markdown file exists” is not enough.
3. **DB writes:** reversible only when they occur inside ordinary app transactions and the backup job is green. Destructive migrations remain sign-off-triggered unless the rollback migration and backup/restore path have passed.

Define **backup job green** mechanically:

- last successful backup exists within the configured freshness window,
- latest restore drill has passed within the current phase or configured review window,
- no pending failed migration/restore warnings,
- backup location is reachable.

External side effects remain conservative:

- External `POST/PUT/PATCH/DELETE` defaults to sign-off unless covered by a narrow allowlisted policy.
- Learned allowlist rules must be stored in a `PolicyRegistry`, with `rule_id`, origin approval, exact scope/pattern, owner, created date, last used date, and review/expiry date.
- Changes to the `PolicyRegistry` itself are Trigger 5 security-boundary changes.
- Uncertainty escalation is acceptable, but it should produce a compact escalation memo: “why uncertain / exact action / exact proposed narrow rule / blast radius.” No broad generalization.

The reviewable policy page is correct. For v2.0, it can be a simple read-only UI backed by the registry; it does not need a full policy-management console yet.

---

## Genuine miss: D6 needs a cross-track proposal intake protocol

Jackson's parallel UI/UX and red-team track is good, but it creates one new risk: planning documents can become competing sources of truth.

Add a lightweight intake rule before Iteration 5:

Any side-track file that proposes a change to architecture, UI structure, acceptance rules, memory, security, cost, or phase scope should be imported as a `DesignProposal` / `PlanningProposal` record, not silently merged into the master prompt.

Minimum schema:

```yaml
proposal_id: jackson-ui-001
source_file: jackson_01_ui_spec.md
proposer: Jackson-track
status: proposed | accepted | rejected | superseded
area: ui | architecture | memory | security | cost | builder | process
affected_decisions: [D3, M2, P2]
summary: one paragraph
acceptance_implications: what tests/checks change
conflicts_with_locked_decisions: none | list
requires_will_decision: true | false
resolution: pending | accepted rationale | rejected rationale
```

Rules:

- The main architecture thread remains the arbiter for conflicts.
- The master prompt may only include side-track proposals marked `accepted`.
- Accepted side-track proposals should also get a `DECISIONS.md` entry if they change a locked decision, phase exit, acceptance test, or visible product requirement.
- Red-team findings can be attached directly to affected phase exits or acceptance checks; they should not live only as prose in a separate file.

This is not a high-severity blocker, but it should be in the master prompt or planning process before more parallel files accumulate.

---

## Request for Iteration 5

Proceed to the full v2 master prompt draft.

Please make it operational, not inspirational. Use strict language: “must,” “may not,” “exit requires,” “the system rejects,” “the UI renders only from,” etc.

The master prompt should include, at minimum:

1. v2.0 scope and non-scope
2. D1–D6 locked decisions
3. canonical object model
4. `ExecutionEngine` adapter boundary
5. `DomainContract` model
6. event/projection/state architecture
7. evidence policy and evidence matrix
8. sign-off triggers and reversible domains
9. cost/budget policy
10. minimal memory core and eval tests
11. P0–P5 phase plan with exits
12. side-track proposal intake protocol
13. Definition of Done for Builder and memory
14. explicit anti-patterns from v1

No need to restate this iteration back unless you disagree with a guardrail above.
