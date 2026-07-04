# QUALITY RUBRIC

Pass/fail criteria for product-quality passes. A pass "passes" a criterion
only if every bullet holds. Grade honestly; the audit is worthless otherwise.

## 1. Professional UI polish
- [ ] No raw hex in components (tokens only); all 7 themes coherent.
- [ ] Motion communicates state; nothing blocks input; reduced-motion respected.
- [ ] Empty states are designed and instructive, never a bare grey line.
- [ ] Typography hierarchy: kicker → display title → subtitle everywhere.

## 2. Beginner clarity
- [ ] A first-time user can, without docs: send a message, log a ledger
      item, greenlight it, and find what Grover is working on.
- [ ] Every desk offers starter prompts or examples when empty.
- [ ] The greenlight flow states, in the UI, what will and will not happen.

## 3. Orb identity / statefulness
- [ ] Distinct, legible visual states (idle/listening/thinking/memory/
      frontier/approval/error/success) with named label.
- [ ] Idle shows micro-life (irregular pulses, glints, drift), not a loop.
- [ ] Cursor response is spring-damped; no snapping.

## 4. Theme integration
- [ ] Switching theme recolors the orb ramp, nav accents, and chrome live.
- [ ] Professional themes (edge-glow: 0) contain zero neon bleed.

## 5. Desk usefulness
- [ ] Each desk has expertise (prompt), accent, its own thread, and
      starter actions. No desk is an empty chat box.

## 6. Builder usefulness
- [ ] Builder shows system state: autonomy, spend vs cap, active loop,
      queue depth + blocked count, next actions.
- [ ] Items expand to brief + workshop; approved work is visibly queued.
- [ ] (PQ3) Builder shows active / queued / blocked (with reasons) /
      recently completed loops, and answers a beginner's four questions
      in the UI: what is Builder, what can I ask for, what happens after
      approval, what is safe at L1.
- [ ] (PQ3) A user can go from "I want X" (free text) to an approved,
      tracked loop without leaving Builder or pre-creating a ledger item.

## 7. Build Loop (both doors: Greenlight + Improvement Request)
- [ ] A proposal (goal/scope/steps/risk/effort/verification/rollback/
      cost estimate) exists before anything changes state.
- [ ] Proposal displays autonomy level and approval requirement.
- [ ] (PQ3) Improvement Request proposals are editable before the
      decision; the decision set is approve / save for later / reject,
      and every decision leaves a record.
- [ ] Approval creates a tracked loop with an explicit, server-enforced
      lifecycle (proposed→approved→ready→running→verifying→done, plus
      blocked-with-reason / killed / rejected), all transitions audited.
- [ ] (PQ3) Every loop has a per-loop event timeline (who, from→to, note)
      visible in the UI; completed loops carry a closing summary.
- [ ] Nothing executes autonomously at L1; the UI says so.
- [ ] Without an API key, both flows still work with an honest offline skeleton.

## 8. Responsiveness / accessibility
- [ ] Usable at 1000px width (panel collapses); keyboard: Enter sends,
      Esc closes modals; focus states visible; aria-live on chat log.

## 9. Maintainability
- [ ] `npm run verify` boots the app and exercises every endpoint; `npm run check`
      syntax-checks every JS file. Both pass.
- [ ] New features documented in docs/DECISIONS.md; leftovers in docs/TASKS.md.
- [ ] No dead buttons; placeholders are labeled as placeholders.

## Scoring — PQ1 target
Must flip §7 from total fail to full pass, §6 and §2 to pass, §9 to pass.
§1/§3/§5 improved measurably; residuals logged in TASKS.md for PQ2.

## Grades after PQ3 — Builder Workflow Pass (2026-07-03, honest)
§6 Builder: PASS at the new, stricter criteria — free text → editable
proposal → approve/save/reject → tracked loop, all inside Builder; active/
queued/blocked/completed visible; beginner Q&A present. §7 loop: PASS —
state machine enforced server-side, per-loop event timelines, verification
checklist surfaced while verifying, both doors share one path, 66-check
verify battery covers the lifecycle including illegal transitions.
Honest residuals: verification is a checklist not a gate; no step-level
progress; Greenlight-door proposals aren't editable; cost_estimate is a
labeled placeholder never reconciled; no loop runner — loops still track
work, they don't do it. §1–§5, §8: unchanged from PQ2 (visuals handled
externally this pass by design). §9: PASS — verify extended to 66 checks
incl. mutations on a throwaway data dir; docs updated.

## Grades after PQ2 (2026-07-01, honest)
§1 polish: PASS (tables carded, empty states designed; residual: no visual
regression tooling). §2 beginner clarity: PASS. §3 orb: PASS with note —
ambient loop states + micro-life land "presence"; transition flourishes
still wanted. §4 themes: PASS. §5 desks: PASS (purpose/status/starters/
honest "later"; still chat-only by design). §6 Builder: PASS. §7 loop:
PASS (unchanged from PQ1, regression-tested). §8 a11y: PASS at basics
(Esc, focus-visible, aria-modal, labels); full keyboard nav of cards not
done. §9 maintainability: PASS server-side; client machine-verification
depends on running `npm run verify` on the host machine.
