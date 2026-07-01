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

## PQ2 — planned

- [ ] Esc closes modals; visible focus rings; aria labels on icon buttons.
- [ ] Style Costs/Audit tables to match card language; design all remaining
      empty states (Memory, Costs, Audit).
- [ ] Loop → Workshop link: open the source item's workshop from a loop card.
- [ ] Verify script: mutation battery against a throwaway data dir
      (needs GROVER_DATA env override in config.mjs).
- [ ] Orb state-transition flourishes (brief particle scatter on state change).
- [ ] First-run guided moment in Command Center ("log → greenlight → loop" tour).
- [ ] messages retention decision (log in DECISIONS once made).

## Standing (from v0.1/0.2)

- [ ] `git init` + first commit (must run on Will's machine)
- [ ] Add Jackson's email for Cloudflare Access mapping
- [ ] Deploy behind Cloudflare Tunnel + Access (SECURITY.md)
- [ ] Verify model IDs in Settings against docs.claude.com
