# DECISIONS.md — derive-and-record log (master prompt §14.2, §11.6, §11.8)

Low-level implementation decisions derived by builder sessions, with rationale and (where required) predictions checked at phase exits. Scope/policy changes do NOT belong here — those go through Will or §12 proposals.

---

## 2026-07-05 — P1 stack: Node 22 built-ins, zero external dependencies

**Decision:** App runs on Node ≥22.18 using built-in TypeScript type-stripping (erasable syntax only — no TS enums/namespaces), `node:sqlite` for the database, `node:test` for tests, `node:http` for the server (later slice). No npm dependencies.

**Why:** Master prompt §11.8 requires justifying any dependency against built-in primitives; all three primitives verified working in the build environment (Node v22.22.3). SQLite is mandated (§4.4). Zero deps = nothing to audit, nothing to break on Will's machine.

**Prediction (checked at P1 exit):** Node built-ins will cover every P1 exit criterion without adding a single npm package, except Playwright for browser evidence (already anticipated by §5 — will get its own entry when added).

## 2026-07-05 — Repo layout: application lives in `app/`

**Decision:** `app/src/` for code, `app/test/` for tests, `app/data/` (gitignored) for runtime SQLite files. Keeps planning/, design/, archive/ untouched.

## 2026-07-05 — Money stored as integer microdollars

**Decision:** All cost fields (`events.cost_delta`, projection `cost_total`, future cost_ledger) are INTEGER micro-USD (1_000_000 = $1). Field name `cost_delta` kept exactly as spec'd (§4.3).

**Why:** Model-call costs are fractions of a cent; floats drift; integers make budget-cap comparisons (§7) exact.

## 2026-07-05 — Event-spine slice: derived reducer semantics (placeholders, narrow)

**Decision:** For the first spine slice: (a) task `status` mirrors the latest lifecycle-phase event (intake/planning/editing/verifying/blocked/done/failed/cancelled); policy/budget/memory/system events update plain_language and cost only. (b) Task `origin` (foreground/background, §4.3) derives from the first event's actor: `will` → foreground, else background. (c) Server-computed `actions`: active statuses → [pause, cancel]; blocked → [cancel]; terminal → []. (d) BuildRun status mapping from event phase is a minimal placeholder; the full BuildRun state machine (queued/paused etc.) lands with the engine slice.

**Why:** §4.3 mandates the mechanism (projections reduced from events, actions computed server-side) but not these micro-mappings. Chosen minimal so later slices refine mappings without touching the reduction mechanics.

**Prediction (checked at P1 exit):** the engine/SSE slices will change these mappings but will NOT need to change the events schema or the append/rebuild mechanics.

## 2026-07-05 — Idempotency collision = hard conflict; plain_language capped at 2000 chars

**Decision (per accepted PlanningProposal 001, items 2 and 8):** reusing an idempotency key with a *different* payload (any field except `ts`) throws a conflict error — never silently returns the original. `plain_language` is rejected when missing, empty, whitespace-only, or over 2000 characters (enforced in code and schema CHECK).

**Why:** silent ignore would let UI retries, SSE reconnects, and engine bugs hide real double-writes; 2000 chars keeps the event log human-scannable — long detail belongs in `internal_detail` or evidence assets.

## 2026-07-05 — Sandbox treats the mounted repo as read-suspect

**Decision:** Claude sandbox sessions must not run ANY git command against the mount (a read-only `git status` corrupted the index on 2026-07-05), and must not trust the mount's view of recently written files (stale/truncated reads observed same day). Tests run on a sandbox-local copy; the authoritative verification is `npm test` on the host before committing. Recorded in `GIT_SETUP.md`.

## 2026-07-10 — Cross-client contract and bounded maker/checker workflow

**Decision:** `AGENTS.md` is the cross-client development contract; client-specific files such as `CLAUDE.md` remain compatible supplements. Every change uses a slice branch. The default development loop is one maker pass, deterministic verification, one fresh-context checker pass, and at most two repair cycles, with the stopping rules in `planning/DEVELOPMENT_PROCESS.md`.

**Why:** The repository previously gave different agents contradictory Git instructions and allowed documentation to bypass the binding branch discipline. A bounded evidence-driven loop preserves independent review without creating an open-ended agent conversation.

**Prediction (checked at P1 exit):** The unified contract will produce complete five-line handoffs and independently reviewable evidence without requiring more than two repair cycles for any remaining P1 slice.
