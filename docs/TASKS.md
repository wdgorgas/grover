# TASKS (canonical)

Live work belongs in Grover's own ledger/loops (Builder view). This file is
the coarse human-readable snapshot per product-quality pass.

## PQ1 — done (2026-07-01)

- [x] docs/: PRODUCT_AUDIT, QUALITY_RUBRIC, LOOP_ENGINEERING (+canonical
      moves of DECISIONS/TASKS/UI_STYLE_GUIDE)
- [x] Loop primitive: `loops` table + server/loops.mjs (proposed→approved→
      running→verifying→done/killed, all transitions audited)
- [x] Functional Greenlight Build Loop: proposal (scope/steps/risk/effort,
      honest offline skeleton without a key) → human approval → tracked loop.
      Verified end-to-end incl. idempotency and bad-status rejection.
- [x] System state: /api/status; Builder strip (autonomy, spend/cap, active
      loop, queue, next actions); Command Center "System" readout.
- [x] Desk starter prompts (beginner clarity); Builder explainer updated.
- [x] Orb micro-life: irregular rotation drift, heartbeat thump, surface glints.
- [x] `npm run verify` / `verify:server` — 32 checks, all passing.

## PQ1 self-critique (vs docs/QUALITY_RUBRIC.md)

Pass: §7 Greenlight loop (full), §6 Builder, §9 maintainability, §2 mostly.
Partial: §1 (Costs/Audit tables still plain; some empty states remain bare),
§3 (micro-life added; state *transitions* could ease more dramatically),
§8 (keyboard: Esc doesn't close modals yet; focus states default).
Not re-verified visually — sandbox cannot render the client; needs a human
pass or future screenshot tooling.

## PQ2 — done (2026-07-01)

- [x] Esc closes modals; :focus-visible rings; aria-modal; in-app promptModal
      replaces browser prompt() for loop summaries.
- [x] Costs/Audit/Memory tables in cards; designed empty states for Memory,
      Costs, Audit, and fresh Desks (purpose, status, starters, honest "later").
- [x] Loop → Workshop ↗ link expands the source item.
- [x] Orb ambient presence: idle carries the active loop's status
      (queued / running / verifying) via /api/status polling.
- [x] docs/VISUAL_QA.md — manual visual checklist (automated screenshots
      rejected on zero-dep grounds; rationale documented there).
- [x] Rubric regraded post-PQ2; audit addendum written.

## Design v2 — stage two (from GROVER Command Center v2.dc.html)

- [ ] Merge desks into the Command stage: sidebar desk switch swaps title/
      typed sub/meta/context in place; orb never remounts; desk-tinted halo.
- [ ] Context panel v2: ACTIVE TASK, QUEUE (approved loops, expandable
      steps, RUN NOW → loop running), MODEL / EST COST, TOOLS ALLOWED,
      MEMORY bar, NS/UPTIME row.
- [ ] Telemetry footer strip: tok in/out, latency, session cost, orb state
      preview chips (wired to real /api/costs + last turn, not simulated).
- [ ] Drag queue card onto the orb to start the loop (RELEASE TO START ring).
- [ ] Approval interrupt banner keyed to budget gates + future privileged
      actions (design's amber APPROVE/DENY bar).

## PQ3 — proposed

- [ ] Orb state-transition flourishes (brief scatter/refocus on change).
- [ ] First-run guided moment ("log → greenlight → loop" in 3 steps).
- [ ] Verify script mutation mode against throwaway data dir
      (needs GROVER_DATA env override in config.mjs).
- [ ] Full keyboard navigation of ledger cards + loop actions.
- [ ] messages retention decision (log in DECISIONS once made).
- [ ] Consider screenshot CI once the Ubuntu deployment exists.

## Standing (from v0.1/0.2)

- [ ] `git init` + first commit (must run on Will's machine)
- [ ] Add Jackson's email for Cloudflare Access mapping
- [ ] Deploy behind Cloudflare Tunnel + Access (SECURITY.md)
- [ ] Verify model IDs in Settings against docs.claude.com
