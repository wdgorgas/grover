# P1 progress — spine skeleton

Phase opened 2026-07-03 (P0 approval). Budget: $25 soft / $50 hard. Exits: master prompt §13.

## Slice log

### 2026-07-05 — phase-p1-event-spine (Claude session, Will driving)

First code of v2: the append-only event log, reducers, projections, and the projection-rebuild exit test.

**What changed:**
- `DECISIONS.md` created at repo root (stack: Node 22 built-ins, zero deps; money as integer micro-USD; `app/` layout; narrow reducer placeholder semantics — each with rationale, two with predictions to check at P1 exit).
- `app/` created: `src/db.ts` (schema — `events` per §4.3 minimum fields, `task_state`, `build_state`), `src/events.ts` (sole write path: plain_language mandatory, idempotency dedup, append+reduce in one transaction), `src/reducers.ts` (sole projection writer; server-computed `actions`; `rebuildProjections()`), `test/event-spine.test.ts` (10 tests), `package.json`, `.gitignore`.
- Restored 5 files that were truncated in the working tree (GIT_SETUP.md, JACKSON_START_HERE.md, README.md, archive DECISIONS.md, master prompt DRAFT) back to HEAD content — mount corruption, confirmed with Will before restoring.

**What I verified:** `node --test "test/*.test.ts"` in `app/` — **10/10 pass** (Node v22.22.3, Linux sandbox). Covers: plain_language rejection; one-task-one-status; server-side actions (no verify-on-running possible); foreground/background from first actor; idempotency (no duplicate event, cost applied once); seq-beats-timestamp replay; micro-USD cost accumulation across task+build projections; **projection rebuild equality (P1 exit criterion)**; restart persistence on a file DB; schema-level enum rejection. Reproduce on host: `cd app && npm test`.

**What is still open (P1):** SPA shell, orb port, SSE streaming (resume from last seq), cost-ledger stub + restart test, kill switch, full Builder object-model tables (FeatureRequest/BuildRun/AcceptanceCheck/EvidenceAsset/GitCommit/MemoryUpdateProposal), DomainContract stubs + lane-realness tests, NoopHarnessEngine + engine-swap test, reload detector.

**What the next person should do:** either (a) Builder object-model tables + closure invariant on top of this spine, or (b) minimal HTTP server + SSE endpoint replaying events from a client-supplied last seq. Both build directly on `appendEvent`/`rebuildProjections`. Run `npm test` in `app/` first to confirm a green start.

### 2026-07-05 (later) — event-spine hardening per PlanningProposal 001

ChatGPT reviewed the first slice (source + itemized dispositions: `planning/proposals/`). All 8 items accepted; 3 implemented immediately.

**What changed:** `events.ts` — idempotency-key reuse with a different payload now throws a conflict (silent ignore forbidden); `plain_language` capped at 2000 chars (code + schema CHECK in `db.ts`); 3 new tests (collision, edge-case lengths, failed-append-leaves-projections-untouched). `DECISIONS.md` +2 entries. `GIT_SETUP.md` gotcha made operational (read-only git also forbidden in sandbox; host verification protocol). `package.json` test script simplified to a direct file path (Windows-safe, no glob quoting).

**What I verified:** 13/13 tests pass (Node v22.22.3). NOTE: run in a sandbox-local copy because the mount served stale/truncated views of freshly written files — host `npm test` is the authoritative verification (proposal item 7; record host Node version here when run).

**What is still open:** unchanged from above, plus: cost-ledger slice must implement pre-append hard-cap guard + near-cap crossing tests (proposal item 3); object-model slice should add the batch/transaction helper (item 4).

**What the next person should do:** revised slice order per proposal item 6: (1) Builder object-model tables + closure invariant → (2) cost-ledger stub + hard-cap/restart reconciliation → (3) HTTP/SSE replay from last seq → (4) NoopHarnessEngine + engine-swap test → (5) SPA/orb/reload detector.

**Risks or weirdness:**
- Git-in-sandbox corruption struck three times this session: (1) the 5 truncated files above; (2) a stale `.git/index.lock` + confused index from a `git status` run inside the sandbox; (3) the mount serving stale/truncated views of freshly written app files. Treat ALL git commands as host-only, and treat sandbox reads of just-written files as suspect — protocol now in `GIT_SETUP.md`.
- `appendEvent` uses `BEGIN IMMEDIATE` and is not nestable inside an outer transaction — fine now, worth revisiting when batch writes appear.
- Reducer status/action mappings are recorded placeholders (DECISIONS.md 2026-07-05); the engine slice will refine them without schema changes (that's a checked prediction).
