# AGENT_POLICY

## The two paths (v0.7 — the policy split)

**Path 1 — Direct requests (typed by Will/Jackson).** Anything a human
types — Builder's ▶ Request & execute, an item's ▶ Execute button, or the
`/api/execute` endpoint — executes **immediately at effective L2**,
regardless of the global autonomy dial. The typing IS the approval: the
ledger item is created `approved` (detected_by the user, never
`pending_greenlight`), the loop runs (source `direct`), and the runner
works the repo. Completion is **evidence-gated** (files + diffs + verify
output, or a written human attestation) and **budget gates still apply**
before every model call.

**Path 2 — Grover-initiated improvements.** Work Grover surfaces
unprompted goes through propose → `pending_greenlight` → human approval →
queued loop. `pending_greenlight` is **exclusively** Path 2: it exists so
a human always sees and approves machine-initiated work before it queues.
Nothing on this path executes without an explicit human decision.

Money, destructive, and external-facing actions stay gated regardless of
path (see the rules below) — the runner's tools are repo-confined and
deny writes to `data/`, `vault/`, `.git/`, and secrets by construction.

## Autonomy levels (§6) — the global dial in Settings

```
L0  Advise only.
L1  Draft/prepare actions.            ← dial default
L2  Execute non-money actions.        ← effective level for Path 1
L3  Spend within tiny per-action limits.
L4  Operate within an experiment budget.
L5  Full autonomy inside a capped account/budget.
```

The dial does **not** gate Path 2 — Path 2 always requires explicit human
greenlight, at every level, by Will's standing instruction, not the dial's.
Path 1 runs at effective L2 (or the dial's value if set higher) because a
directly-typed request already carries the human decision the dial exists
to protect. Today the dial has no gating effect on either path — it exists
so future modules (money/spend autonomy, L3-5) inherit one shared setting
instead of inventing their own. It is saved and reported honestly
everywhere; it does not silently clamp to a lower level than what's set.

## Rules for future agents (Loop Engine / Agent Team Manager)

- Agents get **scoped tasks and narrow tool permissions** — allowlist, not
  denylist. A health agent never sees GitHub write. A builder agent never
  sees health data. (Runner v0's allowlist: read_file, write_file,
  list_dir, run_verify — repo-confined.)
- **Maker/checker split**: the reviewer is never the agent that made the
  work. Runner v0's checker is the human reviewing evidence at
  `verifying`; an agent checker comes with the Agent Team Manager.
- Inter-agent traffic is compact structured output (Output Class 2), logged.
- Every agent action passes the Cost Governor; every loop has a budget, a stop
  condition, and a written kill condition *before* it starts. (Runner v0:
  budget gate per model call, 20-iteration cap, ■ Stop endpoint.)
- High-risk actions (money, external posting, destructive ops) require human
  approval below L4, and hard caps + kill switch at any level.
- Grover never scams, exploits, or deceives. Legal and ethical checks are part
  of experiment templates, not afterthoughts.

## The ledger is the front door

Agents that notice work worth doing don't do it silently — they file a
`pending_greenlight` ledger entry (Path 2) with domain, severity, and
estimates, and wait. There is no auto-approval at any autonomy level —
Path 2 always waits for an explicit human greenlight, by design, per
Will's standing instruction: "the only time it should ask for
verification is if some background process decides it wants to improve
something on its own... that's it." Humans, by contrast, walk straight in
through Path 1.
