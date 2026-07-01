# AGENT_POLICY

## Autonomy levels (§6) — the global dial in Settings

```
L0  Advise only.
L1  Draft/prepare actions.            ← v1 default
L2  Execute non-money actions.
L3  Spend within tiny per-action limits.
L4  Operate within an experiment budget.
L5  Full autonomy inside a capped account/budget.
```

The v1 kernel acts at ≤L2 regardless of the setting (there are no money tools
to gate yet). The dial exists now so every future module inherits it instead
of inventing its own.

## Rules for future agents (Loop Engine / Agent Team Manager)

- Agents get **scoped tasks and narrow tool permissions** — allowlist, not
  denylist. A health agent never sees GitHub write. A builder agent never
  sees health data.
- **Maker/checker split**: the reviewer is never the agent that made the work.
- Inter-agent traffic is compact structured output (Output Class 2), logged.
- Every agent action passes the Cost Governor; every loop has a budget, a stop
  condition, and a written kill condition *before* it starts.
- High-risk actions (money, external posting, destructive ops) require human
  approval below L4, and hard caps + kill switch at any level.
- Grover never scams, exploits, or deceives. Legal and ethical checks are part
  of experiment templates, not afterthoughts.

## The ledger is the front door

Agents that notice work worth doing don't do it silently — they file a
`pending_greenlight` ledger entry with domain, severity, and estimates, and
wait. Auto-approval only under an explicit per-domain policy at the configured
autonomy level, and the policy used is recorded on the entry.
