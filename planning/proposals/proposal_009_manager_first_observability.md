# PlanningProposal 009 — manager-first authority and troubleshooting loop

- **proposal_id:** 009
- **source:** Will's direct product instruction on 2026-08-25
- **proposer:** Will
- **status:** accepted
- **area:** manager authority, latency policy, diagnostics, corrections, replay, project memory
- **affected_decisions:** Supersedes Proposal 008's three-second promotion gate as a prerequisite for semantic authority; extends Proposals 004, 005, and 007.
- **requires_will_decision:** resolved by the direct instruction that created this proposal
- **conflicts_with_locked_decisions:** No. Deterministic policy remains authoritative for security, privacy, cost, permissions, ID validity, and the five sign-off triggers. The learned manager gains semantic planning authority only.
- **resolution:** Use the trained local manager to its full lifecycle capability as the baseline, accepting current latency in exchange for best-result behavior. Later fast paths are optimizations and may bypass a manager call only after replay evidence proves equivalent behavior for their narrow case.

## Binding implementation consequences

1. Every meaningful request is planned by the manager. The manager owns semantic choices: route, continuity, retrieval, clarification, execution/worker/model selection, briefing, supervision, response mode, and proposed memory operations.
2. Application code supplies bounded trusted candidates, validates structured output, enforces policy, and executes the decision. It must not silently substitute a conflicting semantic choice merely because a deterministic rule is faster.
3. Invalid, unavailable, unauthorized, or invented manager actions fail closed. Security, privacy, budget, destructive-action, and namespace decisions remain deterministic.
4. Current latency is an accepted baseline. Three seconds remains the optimization target and a release metric, not a reason to leave trained capabilities unused.
5. A future fast path must have an explicit eligibility predicate, replay parity against the manager, fallback on ambiguity, and ongoing shadow comparison. It is a reflex of the manager architecture, not a second semantic authority.
6. Every request creates an inspectable local flight record containing stage decisions, candidate/reference IDs, model and prompt versions, timings, worker/tool selection, result references, verification, and memory effects. Avoid duplicating raw vault/tool content when stable references and hashes suffice.
7. Users can flag a response, route, project, memory action, worker choice, clarification, latency issue, or failure. A flag records the correction as a reproducible incident and potential regression case.
8. Timeouts, malformed decisions, invented IDs, unavailable-provider selections, retries, verification failures, crashes, privacy refusals, memory conflicts, and high latency create automatic incidents.
9. Incidents support local read-only diagnosis, deterministic replay, duplicate grouping, fix linkage, and verified closure. A self-initiated code change still follows Trigger 4; an explicit “Fix this” request authorizes that incident's normal Builder flow.
10. Project memory integrates through this observable pipeline: project goals, decisions, state, artifacts, verified outcomes, and next actions are provenance-backed and replay-visible. Short-term raw material is bounded and pruned; durable records remain in the human-readable vault plus SQLite index.

## Acceptance scenarios

- A meaningful General request records manager route, continuity, retrieval, clarification/execution, and brief decisions before a worker starts.
- A deliberately conflicting deterministic heuristic does not override a valid manager semantic decision.
- An invented project, conversation, memory, worker, or tool ID is refused and creates an incident without changing authoritative state.
- A user can flag “wrong project,” choose the intended project, restart GROVER, and replay the immutable case against a later build.
- A malformed manager output, timeout, provider failure, failed verification, and high-latency request each produce a bounded automatic incident.
- Completing project work records artifact references, verified outcomes, and next actions; “what happened with this project?” is answerable after restart without scanning the full vault.
- A promoted fast path demonstrates replay parity on its complete eligibility corpus and falls back to the manager outside that corpus.

