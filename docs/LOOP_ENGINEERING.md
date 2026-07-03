# LOOP ENGINEERING

Grover's thesis: **a reliable loop beats a perfect prompt.** This file
defines the loop primitive (v2, PQ3) and how Grover uses loops to improve
itself. Builder is the control surface for all of it.

## The loop primitive (v2: `loops` + `loop_events`, server/loops.mjs)

```
loops
  id, ledger_id          ← every loop is born from a ledger item the human saw
  goal                   ← one sentence
  scope  (JSON array)    ← what's in / out (OUT: prefix)
  steps  (JSON array)    ← 3–7 concrete steps
  risk   (low|medium|high) + risk_notes
  effort_hours
  touches (JSON array)   ← files/systems likely touched
  verify_plan (JSON)     ← 2–4 checks that must hold before done      (PQ3)
  rollback               ← one sentence on how to undo                 (PQ3)
  cost_estimate          ← honest string, placeholder allowed          (PQ3)
  blocked_reason         ← set while blocked, cleared on unblock       (PQ3)
  source                 ← 'greenlight' | 'improvement'                (PQ3)
  autonomy_level         ← level the loop runs at (v1: always ≤1)
  status                 ← see lifecycle below
  summary                ← written when the loop closes
  created_at, updated_at

loop_events              ← per-loop auditable history                  (PQ3)
  loop_id, event, from_status, to_status, note, actor, created_at
```

## Lifecycle (enforced state machine — illegal transitions are rejected)

```
proposed → approved → ready → running → verifying → done
              ↘         ↘        ↘          ↘ (reopen → running)
               blocked (requires a reason) → ready | running
proposed → rejected            (the human said no; audited)
any open status → killed       (first-class ending, with a one-line summary)
```

Rules:
- A loop cannot exist without a proposal the human saw first.
- Every transition is validated against `LOOP_TRANSITIONS`, written to
  `loop_events` (who, from→to, note) AND the global audit table.
- `blocked` requires a reason; it is displayed in Builder until unblocked.
- `done` should carry a summary: what changed, what remains.
- At autonomy L1 a loop never executes anything — it is the tracked
  plan-of-record that a human (or a supervised agent session) works from.
- `killed` is a first-class ending. Loops that stop mattering get killed
  with a one-line summary, not abandoned.

## Two doors, one philosophy (PQ3)

Both doors produce the same proposal shape (goal, scope, steps, risk,
effort, touches, **verification, rollback, cost estimate**) via the same
planner seam, and land in the same approval path. Without an API key both
show an honest, clearly-labeled offline skeleton.

**1. Improvement Request** (Builder → ✦ Request improvement)
```
free text ("add an X to delete chats from the sidebar")
  → Grover drafts: work-item title/category/severity + full proposal
  → user EDITS any field, then: Approve & queue │ Save for later │ Reject
     approve → ledger item + loop created together (status approved)
     save    → pending_greenlight ledger item, proposal stored as its brief
     reject  → nothing persisted; the decision itself is audited
```

**2. Greenlight** (existing ledger item → ✓ Greenlight)
```
pending item → proposal modal → Approve & queue → loop (status approved)
```

## Builder as control center

Builder shows: system strip (autonomy, spend/cap, active loop, queue +
blocked counts, next actions), the active loop featured with its
verification checklist while verifying, queued improvements, blocked loops
with reasons, recently completed loops with closing summaries, per-loop
event timelines (History), the work-item backlog, and links to these docs
(/api/docs, read-only).

## Product Quality passes

Grover improves itself through closed passes, run as loops:
1. Audit against docs/QUALITY_RUBRIC.md (update docs/PRODUCT_AUDIT.md).
2. Pick the smallest high-impact vertical slice.
3. Implement. 4. `npm run verify`. 5. Self-critique against the rubric.
6. Log decisions (docs/DECISIONS.md) and leftovers (docs/TASKS.md).
A pass ends only when it is coherent, documented, and verifiable.

`npm run verify` boots against a throwaway data dir (GROVER_DATA) and
exercises the full lifecycle above — both doors, illegal transitions,
blocking, events — with zero risk to real data.

## Future (not built; do not overbuild)

- Loop runner that executes approved steps under scoped permissions
  (requires Agent Team Manager + autonomy ≥2 policies). The `ready`
  status and `verify_plan` are its intended pickup points.
- Loop budgets enforced by the Cost Governor per §11 of the master prompt
  (`cost_estimate` is the placeholder it will reconcile against).
- Verification hooks: a loop can register a check (script, test, metric)
  that must pass before `done` is allowed — today `verify_plan` is a
  human checklist, not a gate.
