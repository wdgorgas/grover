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
