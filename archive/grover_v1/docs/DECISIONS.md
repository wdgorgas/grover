# DECISIONS (canonical — root copy is a pointer)

Significant decisions: context → decision → why. Newest first.

## 13. No PIN/passphrase for local profile switch — trust the machine (v0.7 follow-up)
Revisited explicitly: should `/api/user/select` (the Will/Jackson profile
buttons in Settings) require a PIN or passphrase before switching? Decision:
no — same call as #4, restated because the question came up on its own.
Locally the machine itself is the trust boundary (127.0.0.1 bind, no network
exposure); a PIN on top of that gates nothing a shared machine doesn't already
grant, and it's exactly the custom-password surface #4 already rejected in
favor of Cloudflare Access. The switch stays a plain `grover_user` cookie,
audited (`user_switch`) but not challenged. Once deployed, Access is the real
gate — it authenticates the human via email + MFA *before* Grover ever sees
the request, and `resolveUser()` (server/index.mjs) prefers
`Cf-Access-Authenticated-User-Email` over the cookie, so the local picker
becomes a fallback rather than the boundary. Migration path: if Grover is
ever used on a genuinely shared/untrusted machine (not the v1 target), add a
per-profile PIN check inside `/api/user/select` guarded by a settings flag —
additive, no schema change, doesn't touch the Access path.

## 12. Direct-execution split + evidence-gated done (PQ4, v0.7)
Two paths now exist (AGENT_POLICY.md). Path 1: anything a human types
executes immediately at effective L2 through the loop runner v0
(server/runner.mjs) — ledger item created approved, loop source 'direct',
no proposal step, because a typed request already IS the human decision
the approval flow exists to capture; forcing Will to approve his own
sentence was ceremony, not safety. Path 2 (propose → pending_greenlight →
approve) is reserved exclusively for work Grover surfaces unprompted —
that's where a human gate genuinely protects something. The real gates
moved to where they matter: budget checks before every runner model call,
repo-confined tools with data//vault//.git//secrets writes denied, a
20-iteration cap, a stop endpoint, and an evidence-gated 'done' — a loop
cannot close without runner evidence (files + diffs + verify output) or a
written human attestation (manual_evidence). Honest failure over simulated
success: no API key or a failing verify blocks the loop with the real
reason, never a fake completion. Ledger gains 'dismissed' (out of view,
never executed) so closing the view is never confused with doing the work.

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
</content>
</invoke>
