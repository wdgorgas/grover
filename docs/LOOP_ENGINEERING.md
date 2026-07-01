# LOOP ENGINEERING

Grover's thesis: **a reliable loop beats a perfect prompt.** This file
defines the loop primitive introduced in PQ1 and how Grover uses loops to
improve itself.

## The loop primitive (v1: `loops` table, server/loops.mjs)

```
loops
  id, ledger_id          ← every loop is born from a greenlit ledger item
  goal                   ← one sentence
  scope  (JSON array)    ← what's in / out
  steps  (JSON array)    ← 3–7 concrete steps
  risk   (low|medium|high) + risk_notes
  effort_hours
  autonomy_level         ← level the loop runs at (v1: always ≤1)
  status: proposed → approved → running → verifying → done | killed
  summary                ← written when the loop closes
  created_at, updated_at
```

Rules:
- A loop cannot exist without a proposal the human saw first.
- Every status transition is written to the audit table.
- At autonomy L1 a loop never executes anything — it is the tracked
  plan-of-record that a human (or a supervised agent session) works from.
- `killed` is a first-class ending. Loops that stop mattering get killed
  with a one-line summary, not abandoned.

## The greenlight flow (implemented in PQ1)

```
pending ledger item
  → [Greenlight] → Grover generates a proposal (smart tier;
     offline skeleton labeled as such if no API key)
  → modal: goal, scope, steps, risk, effort, autonomy + approval notice
  → [Approve & queue] → loop created (status approved), item approved,
     both audited → visible in Builder's loop panel + system status
  → human works the loop: running → verifying → done/killed
```

## Product Quality passes

Grover improves itself through closed passes, run as loops:
1. Audit against docs/QUALITY_RUBRIC.md (update docs/PRODUCT_AUDIT.md).
2. Pick the smallest high-impact vertical slice.
3. Implement. 4. `npm run verify`. 5. Self-critique against the rubric.
6. Log decisions (docs/DECISIONS.md) and leftovers (docs/TASKS.md).
A pass ends only when it is coherent, documented, and verifiable.

## Future (not built; do not overbuild)

- Loop runner that executes approved steps under scoped permissions
  (requires Agent Team Manager + autonomy ≥2 policies).
- Loop budgets enforced by the Cost Governor per §11 of the master prompt.
- Verification hooks: a loop can register a check (script, test, metric)
  that must pass before `done` is allowed.
