# PlanningProposal 006 — continuous functional delivery

- **proposal_id:** 006
- **source:** Will's direct instruction on 2026-08-18
- **proposer:** Will
- **status:** accepted
- **area:** phase sequencing, human confirmation gates, visual sequencing
- **affected_decisions:** P1–P5 handoff pauses and visual/orb timing
- **requires_will_decision:** resolved by the direct instruction that created this proposal
- **resolution:** Continue through every approved development phase without routine human sign-off pauses. Preserve required human confirmation for the final v2.0 acceptance pass, but do not use it to block implementation and mechanical verification of later phases. Defer visual redesign, including the final orb integration, until the functional phases are complete.

## Binding implementation consequences

1. Deterministic phase exits remain mandatory and must be recorded with evidence.
2. A phase may advance when its mechanical exit is green even if the planned human UX confirmation is waiting for the final hands-on pass.
3. Security, privacy, real spending, irreversible actions, visual identity, and other decisions reserved by §14 still stop for Will.
4. Functional controls and status accessibility are built now. Visual polish and the verbatim v1 orb are held for Will's new design direction before final v2.0 acceptance; they are not silently deleted from scope.
5. Each phase still uses a bounded branch, commit, verification record, and handoff, but those checkpoints do not require Will to reply before the next phase begins.
