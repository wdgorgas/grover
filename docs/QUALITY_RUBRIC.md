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
      queue depth, next actions.
- [ ] Items expand to brief + workshop; approved work is visibly queued.

## 7. Greenlight Build Loop
- [ ] Greenlight produces a proposal (goal/scope/steps/risk/effort) before
      anything changes state.
- [ ] Proposal displays autonomy level and approval requirement.
- [ ] Approval creates a tracked loop with explicit lifecycle
      (proposed→approved→running→verifying→done/killed), all transitions audited.
- [ ] Nothing executes autonomously at L1; the UI says so.
- [ ] Without an API key, the flow still works with an honest offline skeleton.

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
