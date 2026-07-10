# PlanningProposal 002 — daily-driver product contract and bounded development loops

- **proposal_id:** 002
- **source_file:** `planning/PRODUCT_NORTH_STAR.md`, `planning/DEVELOPMENT_PROCESS.md`
- **proposer:** ChatGPT product/architecture review, requested by Will on 2026-07-10
- **status:** proposed
- **area:** product identity, v2.0 framing, front-door behavior, phase evidence, development process
- **affected_decisions:** v2.0 Definition of Done framing; P1/P2 user-experience acceptance; post-v2.0 sequencing; development harness
- **summary:** Preserve the current P0 trust architecture, but explicitly frame v2.0 as the trust kernel rather than the finished everyday AI hub. Add a daily-driver contract: one natural-language front door; explicit Ask/Work/Act/Build/Remember intent semantics; progressive disclosure of machine activity; safe moldability/undo; and real-use friction evidence. Adopt a bounded maker/verifier/checker loop independent of any particular model pairing.
- **acceptance_implications:** Proposed additions below.
- **conflicts_with_locked_decisions:** No required architectural reversal. A visible non-Builder front-door behavior in v2.0 may narrow or reinterpret the current UI/non-scope guard and therefore requires Will's explicit decision before changing the master prompt.
- **requires_will_decision:** yes
- **resolution:** pending

## Proposed decisions

### A. Keep P0/P1 architecture; do not restart

The event spine, projections, evidence policy, engine adapter, cost hooks, namespaces, and minimal memory plan remain correct foundations. P1 is early enough to adjust user-facing behavior without discarding the implemented spine.

### B. Name v2.0 honestly

Treat v2.0 as the **trust kernel** milestone. It proves safe self-modification and minimal continuity; it is not yet the complete research/coding/quant/lifestyle hub.

### C. Add a front-door intent contract before P1 UI freezes

The command composer accepts natural language but internally distinguishes:

- Ask
- Work
- Act
- Build GROVER
- Remember/Forget

Only Build creates a Builder FeatureRequest by default. Stub domains must return an honest, useful boundary/not-configured state rather than a dead module or false capability. The visible UI should not require selecting a manager first.

### D. Add progressive-disclosure acceptance

The primary activity surface shows a calm plain-language summary and next meaningful action. Detailed events, costs, evidence, and internal objects are expandable. Acceptance should reject both invisible work and an unfiltered event firehose.

### E. Add safe moldability acceptance to P2/P3

At least one real Builder slice must demonstrate a visible checkpoint/branch, verified preview or result, and understandable undo/recovery path—not only that a commit exists.

### F. Add real-use evidence without weakening technical evidence

After each user-visible vertical slice, Will uses the feature for a real task and records friction. Real-use evidence informs prioritization; it never substitutes for mechanical correctness.

### G. Adopt bounded maker/checker loops

Use independent models/agents for implementation and adversarial checking, communicating through repo artifacts. Default to at most two repair cycles, with budget/no-progress/evidence escalation rules. Do not create endless agent conversations or let models edit acceptance checks to pass themselves.

## Smallest safe default while pending

- Continue P1 event/object/cost work.
- Do not redesign the master prompt silently.
- Before implementing the SPA shell, resolve C and D with Will, because UI architecture will otherwise encode assumptions that are expensive to reverse.
- Use the bounded maker/checker process immediately; it refines the existing harness without changing product scope.
