# GROVER v2 — Master Prompt (DRAFT, iteration 5)

**Status: SUPERSEDED 2026-07-03 by `grover_v2_master_prompt.md` (the iteration-7 final). Kept for the planning record only — do not build from this file.**

**What this document is:** the complete, binding build specification for GROVER v2.0. It is written to be executed by an AI builder (Claude/Fable in Cowork or Claude Code). Every "must," "may not," and "rejects" in this document is a requirement, not a suggestion. Where this document is silent, the builder follows §14 (process rules) and asks Will rather than inventing scope.

**Reading order for a builder starting cold:** this file top to bottom, then `planning/PLANNING_BOARD.md` (locked decisions), then `archive/grover_v1_master_prompt.md` *only* as a museum of what not to do. v1's code in `archive/grover_v1/` may be consulted as reference for the orb port (§10.2) and security model (§9) — nothing else carries forward without appearing in this document.

---

## 1. Identity, scope, and non-scope

GROVER is a private, professional-grade AI command center for Will (single user in v2.0) — an operating layer, not a chatbot. Name from Grover's quantum search algorithm; acronym: General of Resource Optimization and Varying Expertise Requests.

**v2.0 scope — exactly two things, in this order:**

1. **Builder**: Will types a request → a real change happens to the app → he sees it happening live, in plain language, front and center → he sees the verified result. Builder modifies GROVER itself.
2. **Minimal memory core**: project facts, Will's preferences relevant to product decisions, build history, provenance, correction/deletion, namespace isolation, restart persistence. (Scope per §8; deliberately narrow.)

**v2.0 is done when** both of the above pass their Definition of Done (§13) **and Will has personally confirmed each**. Nothing else counts.

**Explicit non-scope for v2.0** (the system must be designed so these slot in later, and must not build them now): Research Desk, Income Lab/Quant, Inspiration Inbox, Health, Morning Briefing, Media/Home, Voice/Hardware, multi-user/server deployment, broad personal-life memory (that is v2.1's flagship feature — §8.6), vector databases, memory frameworks (Mem0/Letta/Zep), a formal harness-improvement ledger.

## 2. Locked decisions (D1–D6) — not open for reinterpretation

- **D1** — Five sign-off triggers (§6). Security-boundary changes are a named fifth trigger.
- **D2** — Development budget guards: $25 soft / $50 hard per phase. Hard stop requires Will's explicit continue.
- **D3** — Memory core is minimal (§8). Its schema (namespaces, provenance, vault format) must already accommodate life domains so v2.1 is a scope change, not a rearchitecture.
- **D4** — The Claude Agent SDK is the default Builder engine, isolated behind the `ExecutionEngine` adapter (§4.1). GROVER owns all authoritative state.
- **D5** — `NoopHarnessEngine` exists for development testing only: internal route, hidden in production UI, never user-facing.
- **D6** — Jackson co-plans via the git repo now; his GROVER login is post-v2.0. His namespace exists and fails closed (§6, Trigger 3).

Also locked by Will: direct prompts from Will are instant approval, always; the orb carries over verbatim; the v1 security model carries forward (§9); no demo modes anywhere — real features with clean "not configured yet" states.

## 3. Anti-patterns — the v1 failures this system is built to make impossible

The builder must treat each of these as a named defect class. If a design choice would reproduce one, the choice is wrong.

1. **Jargon-first UI.** Internal process vocabulary (loops, lifecycle states, runs) may not appear in user-facing surfaces. The plain-language test: someone who has never seen the app understands what is happening at a glance.
2. **Invisible work.** No model call, build step, or background process may run without a live, human-readable trace in the UI (§4.3).
3. **Dead controls.** Every visible control must do exactly what it claims, verifiably. A control that saves but does not gate is a defect of the highest severity. If a setting exists, it works and is reported honestly everywhere — never silently clamped, never hardcoded around.
4. **Contradictory status.** One task, one authoritative status, one place it is computed (§4.3). Available actions are part of that state — a Verify button on a running task must be structurally impossible, not merely discouraged.
5. **Page reloads.** True SPA. Zero full-page navigations after initial load, ever, enforced by an automated reload detector (§5.3).
6. **Self-declared victory.** No agent, engine, or model prose counts as evidence of completion. Evidence comes from verifiers (§5). User-claimed completion is also not evidence.
7. **Sci-fi chrome.** No HUD reticles, scan-lines, glowing circuit textures, generic dark-SaaS AI dashboard styling. Taste anchors: Linear, Arc, Things, Raycast (§10).

## 4. Architecture

### 4.1 Runtime shape and the ExecutionEngine boundary

GROVER is its own application: its own server, UI, database, memory, and policies. Agent execution is a component it *uses*, never the thing it *is*.

```ts
interface ExecutionEngine {
  id: string
  capabilities: EngineCapability[]
  start(run: BuildRun): AsyncIterable<EngineEvent>
  pause(runId: string): Promise<void>
  cancel(runId: string): Promise<void>
  resume(runId: string): Promise<void>
}
```

Engines in v2.0: `ClaudeAgentEngine` (default; wraps the Claude Agent SDK), `NoopHarnessEngine` (dev-only, per D5), `ManualEngine` (recovery path: a human performs steps and attaches evidence recorded as `manual_confirmation`; not a demo mode).

**Boundary rules (must):** the engine may execute tools, stream events, and manage its own coding session. The engine may **not** own or directly mutate: authoritative task status, the cost ledger, sign-off decisions, memory writes, FeatureRequest lifecycle, or UI state. All of those belong to GROVER's server and change only through GROVER's reducers and policy hooks.

**Engine-swap acceptance test (P1 exit):** replacing `ClaudeAgentEngine` with `NoopHarnessEngine` leaves the UI, event stream, cost hooks, task state, pause/cancel controls, and evidence ledger working identically — only the code changes stop being real.

The model router is provider-agnostic: abstract tiers (cheap / mid / frontier) map to configurable provider+model entries. No vendor's model name may be hardcoded in application logic.

### 4.2 The managerial hierarchy — routing and policy, not persistent agents

Will's hierarchy (Context/App Manager → Research, Coding, Grover Builder, Lifestyle, Quant, Business → Memory Manager → caches → Processing ⇄ Cost Manager → Output) is implemented as runtime semantics at single-agent cost:

- **Context/App Manager** = a cheap-tier classification pass on every input: route → domain, budget class, sign-off pre-check. Milliseconds, Haiku-tier.
- **Domain managers** = `DomainContract` configurations, not running agents:

```ts
type DomainContract = {
  domain: 'builder' | 'coding' | 'research' | 'business' | 'quant' | 'lifestyle'
  allowedTools: ToolPermission[]
  readableNamespaces: Namespace[]
  writableNamespaces: Namespace[]
  defaultModelTier: ModelTier
  maxSpendWithoutPause: Money
  acceptanceChecks: AcceptanceCheckTemplate[]
  signoffSensitivity: SignoffRule[]
  outputSchemas: OutputSchema[]
}
```

  Only `builder` is fully implemented in v2.0; the other five exist as stub contracts (real schema rows, minimal permissions) so the lane mechanism is provably general. Builder's elevated authority is a **current-phase property** — nothing in the schema may hardcode "Builder is special forever."
- **Lane-realness tests (P1 exit):** two lanes with identical tools/namespaces/checks are one lane — the test suite must demonstrate at least: a non-builder stub lane cannot edit GROVER source; the builder lane cannot read `jackson-private`. A lane is proven by watching a cross-lane action get refused.
- **Subagents** spawn only for parallel independent subtasks or context-polluting side work. Never as ceremony.
- **Memory Manager** = the async consolidation process (§8.4). **Cost Manager** = deterministic hooks (§7). Neither is a chat participant.
- **UI:** every run shows an unobtrusive "Active manager: Builder" label with a one-line route reason.

### 4.3 Events, projections, and the single source of truth

Hybrid event sourcing:

- `events` — append-only, immutable. Minimum schema: `event_id, task_id, build_run_id?, parent_event_id?, idempotency_key, ts, actor(will|grover|engine|tool|system), domain, phase(intake|planning|editing|verifying|blocked|done|failed|cancelled), plain_language, internal_detail, evidence_ref?, cost_delta?, model_run_id?, signoff_state?`.
- `task_state` / `build_state` — denormalized projections, updated **exclusively** by event reducers. The UI renders **only** projections.
- `evidence_assets`, `cost_ledger` — as defined in §5 and §7.

**Rules (must):** `plain_language` is mandatory on every event and written for a human ("Editing the settings page to add the theme picker" — never "state transitioned to verifying"). Idempotency keys prevent duplicate side effects and duplicate events on crash/retry. Available actions (`actions: [...]`) are computed server-side into the projection; the client may not infer actions. Foreground (Will-initiated) vs background (Grover-initiated) is a field on every task, driving both visual treatment and a more restricted background action set.

**Transport:** SSE for server→client streaming; ordinary POST/PUT for user actions, updating in place. WebSockets only if a concrete bidirectional need is demonstrated.

### 4.4 Builder object model

```text
FeatureRequest → BuildRun → AcceptanceCheck[] → EvidenceAsset[]
                          → GitCommit[]
                          → MemoryUpdateProposal[]
```

Schemas as specified in iteration 2 §4 (fields for origin `will_direct | grover_self_initiated | imported`, status, sign-off, cost estimate/actual, linked runs/commits/memories; `AcceptanceCheck.check_type ∈ {unit, integration, playwright, visual, manual, security, cost, memory}`; `EvidenceAsset.type ∈ {screenshot, playwright_trace, dom_assertion, console_log, test_output, git_diff, commit, user_confirmation}` with `origin` and `trusted` fields). SQLite is authoritative for all of it.

**The agent-facing `feature_list.json` is a generated projection** (Anthropic-harness ergonomics without a second source of truth):

1. Generated per BuildRun from the DB; includes `build_run_id`, `projection_version`, and a hash of the originating acceptance-check set. Imports from a stale or mismatched projection are rejected.
2. The engine may only flip `passes` on existing `acceptance_check_id`s. Creating, deleting, renaming, reordering, or rewriting checks through the projection is rejected and logged.
3. A `passes: true` flip is accepted only if the referenced `EvidenceAsset` already exists in the DB, is linked to the same BuildRun, and matches the check's required evidence type.
4. Evidence records its verifier origin (`playwright | test_runner | git | cost_hook | manual_confirmation | ...`). Engine prose is never evidence.
5. If the engine believes a check is wrong or incomplete, it emits an `AcceptanceCheckAmendmentProposal`, which blocks closure until accepted. The definition of done cannot be edited silently.
6. **Concurrency:** one active BuildRun per FeatureRequest, enforced with a DB lock or optimistic-concurrency guard.

## 5. Evidence policy

### 5.1 Per-check minimum evidence, by kind

| AcceptanceCheck kind | Per-check minimum evidence |
|---|---|
| `ui_interaction` | Playwright DOM assertion + post-action screenshot |
| `ui_visual_baseline` | screenshot + baseline comparison (or explicit visual-review artifact) |
| `api_or_state` | API/state assertion + before/after state capture |
| `database` | DB assertion or migration check + rollback/backup status where relevant |
| `memory_retrieval` | seeded retrieval test result + included/excluded memory IDs |
| `cost_or_budget` | cost-ledger row + cap/receipt assertion |
| `security_or_policy` | policy-rule assertion + denied/allowed action evidence |
| `manual_only` | Will's confirmation with exact instructions given, timestamp, and the reason automation was impossible |

### 5.2 Per-BuildRun evidence (once per run, covering all its checks)

Console-error scan, network-error scan, reload detector, diff summary, test output. Scans gate on **new or unexpected** errors; the target baseline is zero known errors, and any benign tool noise must be explicitly classified in a checked-in allowlist, never silently ignored.

### 5.3 Verification mechanics

- UI-facing work is verified by driving the actual rendered app via Playwright. Server-side checks alone can never flip a UI check to `passes`.
- If browser verification is impossible for a check, it becomes `needs_manual_verification`: the system tells Will exactly what to click and what he should see, and stores his confirmation as the evidence.
- **Reload detector:** after any UI interaction test, `performance.getEntriesByType('navigation')` must show no new document navigations since initial load.
- **Regression preservation:** every passed acceptance check joins the regression suite or golden-path smoke suite unless explicitly marked one-off. Smoke runs on every BuildRun with a ~2-minute runtime budget — exceeding it fails the build process and forces suite optimization or splitting; it is never permission to skip checks. The full regression suite runs at phase exits and before any FeatureRequest closes.
- **Golden-path smoke** gets the full evidence set (per-check + per-run + visual baseline).
- **Visual regression floor:** a small screenshot baseline set for the orb and app shell; Builder work that degrades them fails.

## 6. Governance — five sign-off triggers, full autonomy otherwise

Default is full autonomy: Grover acts inside its lane without asking. A direct prompt from Will is instant approval — no confirmation dialogs, no pending states, ever. Exactly five triggers escalate to Will:

1. **Real money** — purchases, subscriptions, paid service setup, trading actions, creating/increasing any budget, exceeding a pre-approved budget. Normal model/API usage **inside** a pre-approved budget is not a sign-off event; creating or raising the budget is.
2. **Irreversible/destructive** — deletes outside git-tracked safe paths, unbacked-up data deletion, destructive migrations (unless rollback migration + restore path have passed), git history rewrite/force push, OS-destructive commands, external `POST/PUT/PATCH/DELETE` to non-allowlisted hosts.
3. **Jackson's private space** — any read/write/export of `jackson-private`, or inference of its contents into other contexts. **Fails closed entirely in v2.0.**
4. **Self-initiated Grover changes** — any Grover-generated FeatureRequest not directly requested by Will; any background proposal to modify app behavior, memory policy, security, cost policy, or prompts.
5. **Security-boundary changes** — auth/Cloudflare Access, secret vault, tool-permission expansion, sandbox/allowlist expansion, public network exposure, write-privileged integrations, prompt-injection policy, kill-switch or audit-log behavior, and **any change to the PolicyRegistry itself**.

**Reversible-by-construction domains** (inside these, actions are reversible by definition and never escalate under Trigger 2):

- **Repo writes:** on a BuildRun branch/checkpoint, from a clean starting state, with diff visibility, and no writes to secrets or ignored sensitive files.
- **Vault writes:** only while the Human Vault is versioned/snapshotted with a **tested** restore path.
- **DB writes:** inside ordinary transactions while the backup job is green.

**"Backup job green," mechanically:** last successful backup within the freshness window AND latest restore drill passed within the current phase/review window AND no pending failed migration/restore warnings AND backup location reachable. Not green → the affected domain loses its reversible status until fixed.

**Uncertainty escalation:** deterministic rules first; model judgment is only an uncertainty detector. An action that cannot be classified mechanically, where any trigger might apply, escalates with a compact memo: why uncertain / exact action / exact proposed narrow rule / blast radius. Approved rules enter the **PolicyRegistry** (`rule_id`, origin approval, exact scope/pattern, owner, created, last used, review/expiry date), visible on a read-only policy page in the UI. One approval never generalizes into a broad allowlist.

## 7. Cost governor

- **Hooks, not vibes:** a deterministic pre-call hook (estimated cost vs remaining budgets) and post-call hook (actual spend → `cost_ledger`, tied to task and event). Over-cap → block and surface. **No silent model downgrades** — if a downgrade is recommended, Will sees it.
- **Budget levels:** global monthly · per-phase ($25 soft / $50 hard, per D2) · per-FeatureRequest estimate · per-BuildRun actual. Soft cap warns/pauses and asks; hard cap blocks all model calls until Will raises it.
- **Receipts:** every completed BuildRun shows estimated vs actual cost, models/tools used, checks passed, commit hash.
- **Router:** abstract tiers mapped to swappable providers (§4.1). Output classes (silent / label-only / compact-JSON / brief / full / artifact) set per call; internal chatter defaults to compact-JSON.
- **Kill switch:** one control halting all model calls, background jobs, external mutating requests, and scheduled processes. It gets its own acceptance test and drill (P5), including blocking both a queued and an in-progress run.
- **Acceptance tests:** over-budget run blocks before the call; ledger survives restart; UI shows live cost without reload; no silent downgrade.

## 8. Memory core (v2.0 — minimal by design)

### 8.1 Tiers

1. **Active Context Pack** — per-request curated context, assembled by a context builder querying tiers 2–3 through the routed lane's namespace scope, under a hard context budget with rank-and-trim. Never "the whole vault."
2. **Project State Cache** — SQLite structured operational state: open tasks, recent decisions, FeatureRequest/BuildRun links, active-project world-model.
3. **Human Vault** — Obsidian-compatible Markdown, one fact/note per file, frontmatter: `owner, namespace, category, confidence, sensitivity, importance, source, created, superseded_by?`. Indexed by SQLite FTS5. Human-readable and human-editable outside GROVER; survives GROVER dying.

### 8.2 Scope (and only this)

Project facts for GROVER development; Will-approved profile facts relevant to Builder/product decisions; build history and decisions; FeatureRequest/BuildRun links; namespaced vault; retrieval with provenance; correction/deletion/supersession; backup/export.

### 8.3 Write policy

Direct "remember this" from Will = approved write. Incidental conversational facts = proposed write, committed only if domain policy permits. Sensitive facts (private/health/finance) = explicit confirmation required unless Will directly asked. Every memory has provenance and an edit/delete path.

### 8.4 Consolidation

An async, scheduled Memory Manager pass (never on the conversational hot path): promotes cache→vault, merges duplicates, marks conflicts for human resolution rather than hallucinating one, prunes stale entries, updates routing hints fed back to the Context Manager. In v2.0 this runs only over project/build memory (D3).

### 8.5 Acceptance tests (P4 exit — all ten, mechanical)

The ten tests from iteration 2 §A5 (persistence-across-restart, no-silent-memory, correction/supersession, deletion, namespace isolation with `jackson-private` failing closed, relevance gating, provenance explanation, human-readable vault, consolidation-on-seeded-mess, context-budget trimming), with iteration 4's mechanics: the relevance eval is a versioned repo file of ~20 seeded scenarios specifying `expected_included_memory_ids` / `expected_excluded_memory_ids`; pass/fail is deterministic on IDs, measuring both recall and precision; seeded cases include namespace/privacy negatives across `will-private`, `jackson-private`, `shared-grover-dev`, and unused future life-domain namespaces. LLM-as-judge is advisory only and gates nothing. Every retrieval bug found later becomes a new eval case.

### 8.6 v2.1 forward-compatibility (build nothing, block nothing)

Broad personal-life memory is v2.1's flagship. v2.0 must therefore: reserve life-domain namespaces in the schema, keep vault frontmatter domain-agnostic, and keep the consolidation pass domain-parameterized — so v2.1 is configuration plus new write sources, not surgery.

## 9. Security (carried from v1, binding)

Cloudflare Access as the eventual front gate (no custom login); secret vault outside the repo; external content is data, never authority — with an actual red-team acceptance test in P5, not just this sentence; narrow tool permissions by default; no public registration; no direct origin exposure; audit log on every consequential action; kill switch per §7. Threat model: a compromised Grover could expose API keys, repo access, files, browser sessions, automation privileges — design accordingly. Local-only binding until deployment is deliberately taken on (post-v2.0).

## 10. UI identity

### 10.1 Requirements

- **Live build transparency is the single most important UI requirement.** What is being built, where, how far along — plain language, live, unmissable, orb-adjacent, front and center in the Command Center (not buried in a tab).
- Minimalist base so the artistic elements pop; artistry/modern/smooth/human (Linear/Arc/Things/Raycast benchmark); reject list per §3.7.
- Theme = semantic CSS token system from day one: light, dark, multiple named palettes, swappable without touching component code.
- Draggable, expandable task widgets in the Command Center; a waiting task is a real object Will can pull into chat to workshop.
- Conversational responsiveness is first-class and separate from task latency: streaming replies, immediate visible acknowledgment when real work starts, no dead air.
- **Recovery card** on any failed build: what failed, what was changed, what was reverted, what evidence exists, next safe action.
- Foreground vs background tasks are visually and functionally distinct, with different action sets.

### 10.2 The orb

Ported verbatim from `archive/grover_v1/client/js/orb.js` and its states (idle/reasoning/creative/high-attention/success/error): colors, sizing, state-driven animation unchanged. Arcane/Spider-Verse energy is licensed for the orb and accent language only — never whole-UI comic styling. The rest of the app must earn the right to sit next to the orb.

## 11. Development process rules (binding on the builder)

1. **Definition of done for UI-facing work:** browser evidence per §5, or stop and tell Will exactly what to click and what he should see, and wait. A passing server-side check is never sufficient alone.
2. **Session bootstrap ritual:** read the progress file, read git log, start the app, run the golden-path smoke via browser — before touching anything new.
3. **Incremental work:** one feature at a time; git checkpoint with a descriptive message + progress-file update per increment; leave a clean state every session (mergeable-to-main quality).
4. **Scope discipline:** the current phase is the whole job. No cross-module wandering.
5. **Prediction discipline (cheap harness-improvement practice):** every change to prompts/tools/skills during development gets a DECISIONS.md entry with a one-line prediction, checked at the next phase exit. (The formal harness-improvement ledger is post-v2.0.)
6. **User-claimed completion is not evidence** — including claims from Will. Verify anyway; his sign-off is consent, not proof.
7. **No new dependencies without a DECISIONS.md entry** explaining why a built-in primitive was insufficient.
8. Architecture decisions in this document were derived, not inherited; where the builder must make a sub-decision this document doesn't cover, derive it from first principles, record it in DECISIONS.md with rationale, and prefer the boring robust option.

## 12. Side-track proposal intake (planning + build phases)

Any file from a parallel track (Jackson's UI/UX or red-team lanes, future contributors) that proposes changes to architecture, UI structure, acceptance rules, memory, security, cost, or phase scope is imported as a `PlanningProposal` record — never silently merged:

`proposal_id, source_file, proposer, status(proposed|accepted|rejected|superseded), area, affected_decisions[], summary, acceptance_implications, conflicts_with_locked_decisions, requires_will_decision, resolution`

Rules: the main thread arbitrates conflicts; the master prompt and build scope include only `accepted` proposals; accepted proposals that change a locked decision, phase exit, acceptance test, or visible requirement also get a DECISIONS.md entry; red-team findings attach to the specific phase exits or acceptance checks they affect, not prose-only files.

## 13. Phase plan and Definitions of Done

Each phase: $25 soft / $50 hard budget guard. Exits are gates — the next phase spends nothing until the current exit is green.

- **P0 — Decision lock + this master prompt finalized.** Exit: architecture frozen; open decisions listed for Will; Will approves the prompt.
- **P1 — Spine skeleton.** SPA shell, orb port, event log + projections, SSE, cost-ledger stub, kill switch, full object-model schema, `DomainContract` stubs. Exit: `NoopHarnessEngine` streams plain-language progress with zero reloads and one authoritative status; pause/cancel/kill-switch transitions work; engine-swap test passes; lane-realness tests pass; reload detector green; cost ledger survives restart.
- **P2 — Razor Builder slice.** One tiny real request end-to-end through `ClaudeAgentEngine`: FeatureRequest → BuildRun → live events → branch → Playwright evidence → commit → receipt → Will confirms the visible result. Exit: it worked, no contradictory status anywhere, no reloads.
- **P3 — Builder reliability set.** Five diverse requests: UI-only, backend/API, memory/vault, settings/control, and a negative case where Builder must refuse or require sign-off. Exit: all five pass with evidence; regression suite seeded from each; mid-build crash recovery demonstrated.
- **P4 — Minimal memory core.** §8 built. Exit: all ten acceptance tests pass mechanically.
- **P5 — Hardening → v2.0.** Drills: kill switch (queued + in-progress), budget-cap breach, all five sign-off triggers deliberately provoked, prompt-injection red-team from external content, browser-verification-failure path, app crash/restart recovery, vault backup **and restore**. Exit: all drills pass.

**Definition of Done — Builder:** P2 + P3 exits green, and Will has personally confirmed, in the running app, that he can type a request, watch it happen live in plain language, and see verified results — repeatedly, without a single contradictory status or reload.

**Definition of Done — memory core:** P4 exit green, and Will has personally confirmed a remembered fact surviving a restart and being used correctly, a correction superseding cleanly, and a deletion actually deleting.

**v2.0 = both Definitions of Done + P5 drills, confirmed by Will.**

---

*Lineage: derived from `planning/grover_v2_scope_understanding.md` (+§12/§12a resolutions) and planning iterations 1–4 (`planning/chatgpt_handoffs/`). Supersedes v1's master prompt entirely.*
