# PRODUCT AUDIT

## Post-PQ3 addendum (2026-07-03) — Builder Workflow Pass

PQ3 attacked the audit's oldest complaint: the loop primitive existed but
Builder was still a display surface. Now it is the control center the
thesis demands. The path "I want X" → structured proposal (goal, scope,
files touched, risk, verification plan, rollback, cost estimate) →
edit/approve/save/reject → tracked loop exists end-to-end, shares one code
path with Greenlight, and works honestly offline. Loops gained a
server-enforced state machine (ready/blocked/rejected added; blocking
requires a reason) and per-loop event timelines, so every loop's history
is inspectable where the loop lives. Verify grew mutation coverage on a
throwaway data dir (66 checks).

Honest residuals for PQ4: loops still *track* work rather than *do* it —
the loop runner (supervised pickup of a `ready` loop) is the next real
step toward self-development; verification is a human checklist, not a
gate on `done`; cost estimates are labeled placeholders; step-level
progress doesn't exist; the Greenlight door's proposal isn't editable.

---

## Post-PQ2 addendum (2026-07-01)

PQ2 closed the interaction-polish and honesty gaps: Esc/focus-ring/keyboard
basics now pass; browser `prompt()` is gone (in-app modals); Costs/Audit/
Memory/Desk empty states teach and offer actions; tables sit in cards; the
orb carries the active loop's status while idle (queued/running/verifying
ambients) so it reads as presence, not decoration; loops link back to their
item's workshop. Automated screenshots rejected on zero-dep grounds —
docs/VISUAL_QA.md is the standing manual checklist. Honest residuals for
PQ3: state-transition flourishes on the orb, a first-run guided moment,
mutation-mode verify script, messages retention decision, and a real visual
regression story if/when a CI host exists.

---

# Original audit — before Product Quality Pass 1 (2026-07-01)

Brutally honest snapshot of v0.2.0, written before changing anything.

## Feature honesty

- **Greenlight is a lie by implication.** The ✓ button flips a status column
  and shows a toast. No proposal, no scope, no risk assessment, no autonomy
  surface, nothing tracked afterward. The master prompt's core idea — "a
  reliable loop beats a perfect prompt" — has zero code behind it. This is
  the app's biggest gap between what it looks like and what it does.
- **No loop primitive exists.** There is no way for Grover to represent
  "work in progress with a goal, steps, and a stop condition." Without it,
  self-improvement passes like this one live only in chat history.
- **Briefs and workshops are good but disconnected** — a brief doesn't
  become a plan-of-record; a workshop conclusion doesn't update anything.

## Beginner clarity

- Desks open into an empty chat. A new user has no idea what a "Research
  Desk" wants from them. No starter prompts, no examples.
- Nothing explains the product's central loop (log → greenlight → build).
  The Builder callout added in v0.2 helps; it is not enough.
- System state is fragmented: autonomy/spend live in the Command Center
  side panel only; nothing anywhere shows "what is Grover working on now
  and what should happen next."

## Visual / identity

- v0.2's professional themes (Obsidian/Slate/Porcelain) and motion pass
  are real improvements; remaining issues are narrower:
  - Orb idle state is uniform — constant rotation, no micro-events. Alive
    things have irregularity (heartbeats, glints, drift). It reads as a
    screensaver after 30 seconds.
  - Empty views (no memories, no calls) are dead ends with one grey line,
    not instructive states.
  - Tables (Costs, Audit) are unstyled data dumps compared to the rest.

## Architecture / robustness

- **No automated verification.** No lint, no tests, no build check, no
  smoke script. Every change so far was verified by hand-run curl
  batteries that live nowhere.
- messages table grows unboundedly; no retention policy (acceptable at
  this scale, must be a logged decision, not an accident).
- Chat SSE has no client reconnect story (acceptable for local single
  user; log it).
- Error surfaces are decent (budget gates, no_key flow) — genuinely OK.

## Verdict

The kernel plumbing (router, governor, memory, namespaces, audit) is
solid and tested. The product sitting on top of it under-delivers on its
own thesis: it cannot yet run a loop, and it doesn't teach its user. PQ1
therefore targets the Greenlight Build Loop as the vertical slice, plus
the minimum clarity/liveliness fixes that make the app self-explanatory.
