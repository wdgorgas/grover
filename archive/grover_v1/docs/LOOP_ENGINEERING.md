# LOOP ENGINEERING

Grover's thesis: **a reliable loop beats a perfect prompt.** This file
defines the loop primitive (v2, PQ3) and the loop runner v0 (PQ4) — how
Grover uses loops to improve itself. Builder is the control surface for
all of it.

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
  source                 ← 'greenlight' | 'improvement' | 'direct'     (PQ4)
  execution_evidence     ← JSON: files+diffs+verify, or manual attest  (PQ4)
  autonomy_level         ← level the loop runs at (direct: 2)
  status                 ← see lifecycle below
  summary                ← written when the loop closes
  created_at, updated_at

loop_events              ← per-loop auditable history                  (PQ3)
  loop_id, event, from_status, to_status, note, actor, created_at
  event 'exec'           ← one row per runner tool action              (PQ4)
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
- A loop cannot exist without a ledger item; Path 2 loops additionally
  require a proposal the human saw first.
- Every transition is validated against `LOOP_TRANSITIONS`, written to
  `loop_events` (who, from→to, note) AND the global audit table.
- `blocked` requires a reason; it is displayed in Builder until unblocked.
- **`done` is evidence-gated (PQ4):** the transition is rejected unless the
  loop carries `execution_evidence` (a runner run) or the caller supplies
  `manual_evidence` — a written attestation of what a human actually did,
  stored as `{manual: true, text, attested_by}`. No evidence, no done.
- `killed` is a first-class ending. Loops that stop mattering get killed
  with a one-line summary, not abandoned.

## Loop runner v0 (server/runner.mjs, PQ4)

The first real execution surface: an agentic tool-use loop over the
Anthropic Messages API (non-streaming, `tools` param + `tool_result`
turns via `completeWithTools` in server/anthropic.mjs).

**Tools** exposed to the model:
- `read_file(path)` — repo-relative, truncated at 48k chars
- `write_file(path, content)` — complete-file writes only
- `list_dir(path)`
- `run_verify()` — spawns `node scripts/verify.mjs --server-only` at the
  repo root; returns exit code + output tail (~4k chars)

**Hard constraints:**
- All paths resolved and confined to the repo root; escapes rejected.
- Writes DENIED to `data/`, `vault/`, `.git/`, `node_modules/`, and any
  path matching /secret/i. Reads denied to `data/`, `.git/`, secrets.
- Max 20 model iterations per run.
- `smart` tier by default; the request body can escalate (`tier`).
- `checkBudget()` runs before EVERY model call — over budget stops the run
  as `blocked` (reason budget) unless `force` was passed at start.
- Every model call logged to `model_calls` (task_type `runner`); every
  tool action written to `loop_events` (event `exec`).
- No API key → the run immediately blocks with
  `no API key — runner needs one`. Nothing is simulated.
- Abort: an in-memory map of running loop ids;
  `POST /api/loops/:id/stop` flips a flag the runner checks before every
  model call and tool execution → `blocked`, reason `stopped by user`.

**Evidence capture:** every file written is recorded (path, byte delta,
a unified-ish line-comparison diff truncated to ~200 lines) plus the final
verify output, stored as JSON in `loops.execution_evidence`.

**Flow:** loop `running` → runner works → run_verify at the end (the
model's own final verify is reused if nothing was written after it) →
verify passes AND ≥1 file changed → `verifying` with evidence attached;
anything else → `blocked` with the honest reason (verify failed / no file
changes / iteration limit / budget / stopped / model error). A human then
reviews the evidence and marks the loop done.

## Two paths, one loop philosophy (PQ4 — see AGENT_POLICY.md)

**Path 1 — Direct request** (`POST /api/execute {request|itemId, tier?, force?}`,
SSE progress; Builder → ▶ Request & execute, or ▶ Execute on any item)
```
typed by a human → ledger item created 'approved' (detected_by the user,
NEVER pending_greenlight) + loop created 'running' (source 'direct',
effective L2) → handed straight to the runner, progress streamed live
```
No proposal, no approval step — the typing IS the approval. Budget gates
and the evidence-gated done still apply.

**Path 2 — Grover-initiated improvements** (the only users of
`pending_greenlight` and the propose/decide endpoints)
```
Grover surfaces work → drafted item + structured proposal
  → human EDITS any field, then: Approve & queue │ Save for later │ Reject
     approve → ledger item + loop created together (status approved)
     save    → pending_greenlight ledger item, proposal stored as its brief
     reject  → nothing persisted; the decision itself is audited
```

**Greenlight** (existing ledger item → ✓ Greenlight) remains the
proposal-then-approval door for queued items:
```
pending item → proposal modal → Approve & queue → loop (status approved)
  → ▶ Execute hands it to the runner whenever you're ready
```

## Builder as control center

Builder shows: system strip (autonomy, spend/cap, active loop, queue +
blocked counts, next actions), the active loop featured (■ Stop while the
runner is on it), queued improvements, blocked loops with reasons,
recently completed loops with summaries and evidence badges, per-loop
event timelines including runner `exec` rows (History), the work-item
backlog (expanded cards show evidence: files + diffs + verify tail, and
▶ Execute), and links to these docs (/api/docs, read-only). Ledger and
loop cards are draggable onto the Command Center log or any workshop pane
to make the item the subject of conversation.

## Product Quality passes

Grover improves itself through closed passes, run as loops:
1. Audit against docs/QUALITY_RUBRIC.md (update docs/PRODUCT_AUDIT.md).
2. Pick the smallest high-impact vertical slice.
3. Implement. 4. `npm run verify`. 5. Self-critique against the rubric.
6. Log decisions (docs/DECISIONS.md) and leftovers (docs/TASKS.md).
A pass ends only when it is coherent, documented, and verifiable.

`npm run verify` boots against a throwaway data dir (GROVER_DATA) and
exercises the full lifecycle above — both paths, illegal transitions,
blocking, the evidence-gated done, dismissed items, the stop endpoint,
events — with zero risk to real data.

## Future (not built; do not overbuild)

- Maker/checker split: a reviewer agent that is not the runner
  (Agent Team Manager, AGENT_POLICY.md rules).
- Loop budgets reconciled per-loop by the Cost Governor
  (`cost_estimate` vs actual runner `model_calls`).
- Runner tools beyond the repo (git commit/branch, scoped shell) —
  each addition is its own policy decision, not a default.
- Step-level progress: check off individual plan steps on a loop.
