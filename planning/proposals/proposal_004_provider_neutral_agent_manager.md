# PlanningProposal 004 — provider-neutral agent manager

- **proposal_id:** 004
- **source:** Will's direct instruction on 2026-08-18
- **proposer:** Will
- **status:** accepted
- **area:** execution engines, routing, model preference, verification
- **affected_decisions:** Replaces locked decision D4's Claude-default requirement while preserving the `ExecutionEngine` boundary.
- **requires_will_decision:** resolved by the direct instruction that created this proposal
- **conflicts_with_locked_decisions:** Explicitly supersedes only the provider-default portion of D4. GROVER continues to own authoritative state, cost, sign-off, evidence, memory, and UI.
- **resolution:** The AI backbone is provider-neutral. Codex and Claude are first-class local execution engines. Codex is the initial user preference, not a permanent hardcoded default. A GROVER-owned router selects an engine using intent, required capabilities, availability, cost/budget information, prior outcomes, and an optional user override. Build verification should use a different available engine as checker when practical.

## Binding implementation consequences

1. Every engine implements the same start/cancel contract and emits normalized GROVER events.
2. Engine registry, routing policy, routing decisions, reason, fallback, and outcome are stored outside provider adapters.
3. `auto` is the normal mode. The UI may temporarily force Codex or Claude for a request, but internal object/state names remain provider-neutral.
4. Initial policy: Codex is preferred for repository implementation, analysis, and written work because Will explicitly prefers it; Claude is the fallback and independent checker. Availability or repeated failed outcomes can change selection without schema changes.
5. The manager begins with deterministic, inspectable routing rules. Routing history is collected for evaluation. No model is allowed to silently rewrite the policy or "train itself" from unreviewed outcomes.
6. Adding another engine requires an adapter and capability record, not changes to the Builder object model or UI state model.
