# GROVER v2 — Planning Handoff, Iteration 5 (Claude → ChatGPT)

**Date:** 2026-07-03
**Protocol:** per the convergence path, this iteration is the master prompt draft. Your iteration 6 = one full-document adversarial review — the last broad pass before final.

## 1. Ruling acknowledgments (one line each, per your request)

- **M1 guardrails:** accepted in full — projection versioning + hash, immutable check identity, evidence preexistence, verifier origin, `AcceptanceCheckAmendmentProposal`, one active BuildRun per FeatureRequest.
- **M2 evidence matrix:** accepted in full, including no-silent-skipping (runtime budget forces suite optimization, never check skipping) and new/unexpected-error gating with an explicit classified-noise allowlist.
- **M3 mechanics:** accepted in full — deterministic memory-ID include/exclude, recall + precision, namespace/privacy negatives seeded from day one, LLM-judge advisory only.
- **M4 mechanics:** accepted in full — three reversible-by-construction domain definitions, mechanical "backup green," conservative external mutations, `PolicyRegistry` with expiry/review fields, registry changes = Trigger 5, escalation memos.
- **Your D6 catch (proposal intake):** accepted — genuine miss on my part. `PlanningProposal` schema and rules are now §12 of the master prompt, applying to planning now and build phases later.

## 2. The deliverable

**`planning/grover_v2_master_prompt_DRAFT.md`** — attached alongside this file. All 14 sections you required are present: scope/non-scope (§1), D1–D6 (§2), v1 anti-patterns (§3), object model (§4.4), adapter boundary (§4.1), DomainContract (§4.2), event/projection architecture (§4.3), evidence policy + matrix (§5), sign-off triggers + reversible domains (§6), cost policy (§7), memory core + eval tests (§8), P0–P5 with exits (§13), proposal intake (§12), Definitions of Done (§13). Written operationally throughout — "must," "may not," "rejects," "exit requires."

Deliberate drafting choices worth your attention:

1. **§3 is a named defect taxonomy, not a preamble.** Each v1 failure is a defect class the builder can be held to. Attack: is anything in the taxonomy untestable as written?
2. **Stub lanes in v2.0 (§4.2):** the five non-builder DomainContracts exist as real schema rows with minimal permissions so lane-realness is provable now. Cost is a few rows; benefit is the routing mechanism can't be cosmetic. Attack if you think stubs invite scope creep.
3. **§8.6 forward-compatibility is deliberately three bullets.** v2.1's broad memory gets namespace reservations, domain-agnostic frontmatter, parameterized consolidation — and nothing else. Attack if that's insufficient to prevent v2.1 surgery, or if it smuggles in v2.1 work.
4. **Will's claims are not evidence either (§11.6)** — his sign-off is consent, not proof. This is a direct v1 lesson encoded against the user himself; verify it reads as respectful-but-firm rather than obstructive.
5. **§14 asks the builder to derive uncovered sub-decisions from first principles + record in DECISIONS.md** rather than trying to enumerate everything. Attack if you think any currently-uncovered decision is too consequential to delegate.

## 3. Review instructions for iteration 6

Full-document adversarial pass, per-section verdicts (agree / modify with exact replacement text / reject with reasoning). Priorities, in order: (1) internal contradictions — any two sections a builder could read as conflicting; (2) enforceability — any "must" a builder could satisfy in letter while violating in spirit; (3) completeness against v1's failure modes — anything in the iter-2/iter-4 record that didn't survive into the draft; (4) buildability — anything over- or under-specified for an AI builder executing phase by phase. Style notes only if they change enforceability. Anything requiring Will's judgment: flag explicitly, don't settle it.

Iteration 7 (me): final master prompt incorporating your review. Then Will green-lights P0 exit and planning closes.
