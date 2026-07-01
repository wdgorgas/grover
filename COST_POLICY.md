# COST_POLICY

Goal: **minimize cost per accepted useful outcome** — not raw tokens.

## Routing rules (enforced in `server/router.mjs`)

- Internal plumbing (memory extraction, titling, tagging, classification) is
  always **fast** tier. No exceptions — this is Output Class 1–2 work.
- User chat defaults to **smart**. Tasks earn their way up, never drift up.
- **frontier/fable** are opt-in from the composer only: architecture decisions,
  hard debugging, final review, high-stakes synthesis. The orb goes gold so
  the spend is visible, not hidden.
- Deterministic code beats any model call where it can do the job.

## Budgets

- Daily and monthly USD caps set in Settings, enforced *before* each call
  using estimated cost; a breach requires a click-through override, which is
  audited. Defaults: $5/day, $60/month — adjust to taste.
- Pricing per tier is editable in Settings because prices drift. Re-check
  docs.claude.com when the numbers matter.

## Output discipline

- Internal calls carry tight `max_tokens` (extraction 700, titles 24).
- The stable system prefix (constitution + skill + profile) is cache-marked;
  the dynamic tail (retrieved memories) is not. Don't reorder these.
- Conversation history window is capped (12 messages) — long context is a cost
  decision, not a default.

## Observability

Every call logs: task type, user, model, tier, tokens in/out, cache
read/write, cost, latency, error. The Costs view is the truth. When
optimizing, open it first and attack the actual top spender.

## Future (v2+, per §11.5)

Confidence-based escalation → semantic cache → learned router → failure
clustering + distillation. Not before the logs justify them.
