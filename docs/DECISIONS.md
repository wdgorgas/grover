# DECISIONS (canonical — root copy is a pointer)

Significant decisions: context → decision → why. Newest first.

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
