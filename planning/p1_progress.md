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

### 2026-07-10 — event immutability + product/process review package

**What changed:** SQLite now rejects direct `UPDATE` and `DELETE` against `events`, with a regression test. Repository contracts now agree that every change uses a branch and that mounted Cowork sandboxes run no Git commands. Added the cross-client `AGENTS.md`, daily-driver north star, bounded maker/checker playbook, and pending PlanningProposal 002. README and build-board status now reflect the actual P1 slice.

**What I verified:** Baseline was 13/13 tests; after the repair, `npm test` passes 14/14. `git diff --check` passes. The binding master-prompt hash remains `9487324c232b6a1a2951bab86e7101ec7bac34e5`.

**What is still open:** PlanningProposal 002 requires Will's decision. P1 remains open for object model, cost ledger, HTTP/SSE, engine adapter, kill switch, DomainContract stubs, SPA/orb, and reload evidence.

**What the next person should do:** Will reviews Proposal 002 items C and D before SPA implementation. Meanwhile the next safe code slice remains Builder object-model tables + closure invariant, as previously sequenced.

**Risks or weirdness:** This checkout required a per-command Git safe-directory override because Windows reports different folder ownership. The supplied patch used abbreviated hunk markers, so its two intended changes were applied directly and verified rather than passed to `git apply`.

### 2026-08-18 — functional local Windows desktop application

**What changed:** Accepted PlanningProposals 002–004. GROVER is now a local Electron application rather than a browser-delivered SPA. Added the complete Builder object schema, cost ledger and hard-cap preflight, kill switch, paused/resumable task state, DomainContract lane records, local memory/vault writes, provider-neutral engine registry, outcome/feedback-based routing, Codex and Claude adapters, a sandboxed desktop renderer, and portable-Windows packaging configuration. Codex is the initial preference; Claude is fallback/checker, not a backbone dependency.

**What I verified:** 26/26 deterministic tests pass; zero npm audit vulnerabilities; Electron smoke drives the real desktop window, confirms renderer isolation, direct memory, blocked external action, kill switch, persistence across restart, zero document navigation, and captures `app/test-results/electron-smoke.png`. Live Codex Ask passes. A live isolated Builder fixture passes the full branch → edit → test → protected-path check → evidence → commit → receipt flow and leaves the fixture repo clean.

**What is still open:** Build and launch the portable Windows executable; verify packaged Codex discovery and persistence; finish final maker/checker diff review. Real user UX feedback and the new visual direction intentionally follow the functional package.

**What the next person should do:** Run `npm run dist`, launch the resulting portable `.exe`, rerun the desktop smoke after any packaging repair, and record the exact artifact path/hash.

**Risks or weirdness:** Claude CLI is installed but its current OAuth session is expired; GROVER detected the run failure and safely fell back to Codex. The local executable will be unsigned, so Windows SmartScreen may warn on first launch. Server deployment remains deliberately disconnected.

### 2026-08-18 — portable package verified

**What changed:** Fixed packaged Codex resolution so Windows launches the `app.asar.unpacked` executable rather than the archive-visible path. Added packaged live-engine coverage and user-facing run instructions in `app/README.md`.

**What I verified:** `release/GROVER-2.0.0-p1-portable.exe` built successfully (156,724,426 bytes; SHA-256 `A485778CC8A89AA8E403DE5457E3BDB8A65E44FC75413C43568A969B1A1584D2`). The packaged `win-unpacked/GROVER.exe` passes the Electron smoke, persists memory across restart, keeps Node unavailable in the renderer, causes zero document navigations, and completes a live Codex request through the embedded packaged engine.

**What is still open:** Will's real-use UX pass, new visual direction, refreshed Claude authentication if Claude participation is desired, and a formal checklist review of remaining P1/P4/P5 acceptance details. External actions and server deployment are still intentionally disconnected.

**What the next person should do:** Launch the portable executable, use Ask and Remember immediately, then try one small “Build GROVER” request from a clean project branch. Record friction before visual redesign.

**Risks or weirdness:** Portable size is 149.46 MiB because it embeds Electron and the Codex runtime. The build is not publisher code-signed and uses the default Electron icon by design until the new visual direction is ready.

### 2026-08-18 — fluid context workspaces and repaired portable agent runtime

**What changed:** Replaced the Command/Activity split and user-facing intent selector with Home plus persistent Coding, Research, Finance, Health, Business, GROVER, and General conversations. Home now classifies a request, creates a conversation, and opens it in the matching workspace. Enter sends; Shift+Enter inserts a line. Conversations can be moved when routing guesses wrong, and those corrections are stored as future router-training examples. Added explicit agent status, refresh, and sign-in controls. The portable package now ships Codex at a stable resource path rather than an ephemeral `app.asar.unpacked` path.

**What I verified:** 29/29 deterministic tests pass; Electron smoke covers Home intake, Enter/Shift+Enter, direct memory, conversation display and movement, kill switch, restart persistence, renderer isolation, and zero document navigation. A live Codex run passed for the exact greeting `hi, my name is Will`. The final single-file portable executable passed a live bundled-Codex test. Artifact: `app/release/GROVER-2.0.0-p1-portable.exe`, 156,735,180 bytes, SHA-256 `191F81DA56BC958162F7F7C860EC7153ED8D25EB32F3CC036B66C375827BA9F4`.

**What is still open:** Formal P1 exit checklist review, then the remaining P2–P5 development and drills. Visual redesign remains intentionally deferred.

**What the next person should do:** Close the formal P1 checklist, then continue directly into P2/P3 Builder reliability without waiting for routine approval.

**Risks or weirdness:** The single-file portable wrapper takes several seconds on a cold first launch because it extracts the bundled 299 MB Codex runtime. The unpacked application launches faster. Claude is installed but signed out; Settings now says that explicitly and provides a sign-in action. The build remains unsigned and uses the temporary Electron icon until Will's visual pass.
