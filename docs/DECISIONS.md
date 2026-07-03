# DECISIONS (canonical — root copy is a pointer)

Significant decisions: context → decision → why. Newest first.

## 11. Verify runs against a throwaway data dir and mutates freely (PQ3)
`GROVER_DATA` env override (config.mjs) lets scripts/verify.mjs boot on a
temp dir, so the battery exercises the full improvement→proposal→loop
lifecycle — approvals, illegal transitions, blocking, events — with zero
risk to the real database. Read-only smoke tests can't verify a workflow
product; this closes the PQ2/PQ3 "mutation mode" leftover. Still zero
dependencies.

## 10. Loops carry their own event history; transitions are a state machine (PQ3)
`loop_events` records every transition (actor, from→to, note) per loop;
`LOOP_TRANSITIONS` rejects illegal moves server-side instead of trusting
the UI. New statuses: `ready` (clear to start), `blocked` (requires a
reason, shown until unblocked), `rejected` (the human said no, on the
record). The global audit table stays as the cross-cutting trail; the
per-loop timeline is what makes a loop inspectable in place. Blocking
without a reason is an error by design — an unexplained blocker is a
lost blocker.

## 9. Improvement Requests are Greenlight's second door, not a new system (PQ3)
Builder's "✦ Request improvement" turns free text into a drafted work
item + build proposal (goal, scope, steps, risk, files touched,
verification plan, rollback, cost estimate) that the user can edit,
approve, save for later, or reject. Approval creates the ledger item and
the loop together through the exact same `approveLoop` path as Greenlight;
"save for later" stores the proposal as the item's brief so it stays
greenlightable; "reject" persists nothing but is audited. One proposal
shape, one approval path, one loop philosophy (docs/DECISIONS.md #8 still
holds: no loop without a ledger item).

## 8. Loops are born from the ledger, never free-floating (PQ1)
The `loops` table requires a `ledger_id`. Every unit of tracked work
traces to a human-visible item that was proposed and approved. This keeps
the audit chain intact (item → proposal → approval → loop → transitions)
and prevents a second, competing backlog from forming. `server/loops.mjs`
owns its own schema (module-local ensure) so adding a module doesn't mean
editing the core db file.

## 7. Greenlight = proposal-then-approval, execution stays human at L1 (PQ1)
Clicking Greenlight now generates a structured proposal (goal, scope,
steps, risk, effort) that the user must approve before anything changes
state. With no API key, a clearly-labeled offline skeleton is shown
instead of failing — the flow must teach even before Grover can think.
No loop executes anything at autonomy L1; the UI says so explicitly.
Rationale: honest functionality beats simulated autonomy, and this is the
foundation the future loop runner slots into without schema changes.

## 6. Verification is a project artifact, not a chat habit (PQ1)
`npm run verify` (scripts/verify.mjs) boots the server on a throwaway
data dir and exercises every endpoint; `npm run check` syntax-checks all
JS. Every prior pass verified by ad-hoc curl commands that lived nowhere;
that stops now. Zero new dependencies — the script is plain Node.

## 5. SSE-over-POST instead of WebSockets
One-directional flow is all a chat turn needs; works through Cloudflare
Tunnel unconfigured; zero dependencies. WebSockets return if the loop
runner needs true push.

## 4. Cloudflare Access as the auth layer; no custom password system in v1
Access gates by email + MFA and passes an identity header the server maps
to a profile. Less code, less attack surface. Locally: 127.0.0.1 bind +
profile cookie; the machine is the trust boundary until deployment.

## 3. FTS5 keyword retrieval in v1; vectors deferred
Evaluate new memory machinery only when retrieval quality is an observed
bottleneck (§8.3). `searchMemories()` is the single seam for hybrid/vector
retrieval later. LIKE fallback guards FTS absence.

## 2. Zero runtime dependencies
Every dependency is a supply-chain and native-compilation risk. Node 22
provides sqlite, fetch, http, crypto. We write ~200 lines of plumbing
ourselves; that code is boring and ours.

## 1. Single language (JS end-to-end), no build step, SQLite over Postgres
Minimizes context-switching for the coding agent (§4), nothing to compile
on Windows or Ubuntu, one process to deploy behind the tunnel. db layer
isolates SQL so Postgres remains a mechanical migration if ever justified.
