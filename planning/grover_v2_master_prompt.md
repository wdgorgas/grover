# GROVER v2 — Master Prompt (FINAL, iteration 7)

**Status: FINAL planning output, produced 2026-07-03 after seven planning iterations (Claude ↔ ChatGPT adversarial review). Building begins only when Will explicitly green-lights P0. Supersedes `grover_v2_master_prompt_DRAFT.md` and v1's master prompt entirely.**

**What this document is:** the complete, binding build specification for GROVER v2.0. It is written to be executed by an AI builder (Claude/Fable in Cowork or Claude Code). Every "must," "may not," and "rejects" in this document is a requirement, not a suggestion. Where this document is silent, the builder follows §14. Where §14 says to ask Will, the builder asks rather than inventing scope.

**Reading order for a builder starting cold:** this file top to bottom, then `planning/PLANNING_BOARD.md` (locked decisions), then `archive/grover_v1_master_prompt.md` *only* as a museum of what not to do. v1's code in `archive/grover_v1/` may be consulted as reference for the orb port (§10.2) and security model (§9) — nothing else carries forward without appearing in this document.

---

## 1. Identity, scope, and non-scope

GROVER is a private, professional-grade AI command center for Will (single user in v2.0) — an operating layer, not a chatbot. Name from Grover's quantum search algorithm; acronym: General of Resource Optimization and Varying Expertise Requests.

**v2.0 scope — exactly two things, in this order:**

1. **Builder**: Will types a request → a real change happens to the app → he sees it happening live, in plain language, front and center → he sees the verified result. Builder modifies GROVER itself.
2. **Minimal memory core**: project facts, Will's preferences relevant to product decisions, build history, provenance, correction/deletion, namespace isolation, restart persistence. (Scope per §8; deliberately narrow.)

**v2.0 is done when** both of the above pass their Definition of Done (§13) **and Will has personally confirmed each**. Nothing else counts.

**Explicit non-scope for v2.0** (the system must be designed so these slot in later, and must not build them now): Research Desk, Income Lab/Quant, Inspiration Inbox, Health, Morning Briefing, Media/Home, Voice/Hardware, multi-user/server deployment, broad personal-life memory (that is v2.1's flagship feature — §8.6), vector databases, memory frameworks (Mem0/Letta/Zep), a formal harness-improvement ledger.

"Designed so these slot in later" means schema and interface seams only; it does not authorize user-facing module work, placeholder dashboards, or fake "coming soon" experiences unless required by a v2.0 acceptance test.

## 2. Locked decisions (D1–D6) — not open for reinterpretation

- **D1** — Five sign-off triggers (§6). Security-boundary changes are a named fifth trigger.
- **D2** — Development budget guards: $25 soft / $50 hard per phase. Hard stop requires Will's explicit continue.
- **D3** — Memory core is minimal (§8). Its schema (namespaces, provenance, vault format) must already accommodate life domains so v2.1 is a scope change, not a rearchitecture.
- **D4** — The Claude Agent SDK is the default Builder engine, isolated behind the `ExecutionEngine` adapter (§4.1). GROVER owns all authoritative state.
- **D5** — `NoopHarnessEngine` exists for development testing only: internal route, hidden in production UI, never user-facing.
- **D6** — Jackson co-plans via the git repo now; his GROVER login is post-v2.0. His namespace exists and fails closed (§6, Trigger 3).

Also locked by Will: direct prompts from Will are instant approval per the boundary rule in §6 (approval to begin and complete the work; boundary-crossing actions need explicit naming); the orb carries over verbatim; the v1 security model carries forward (§9); no demo modes anywhere — real features with clean "not configured yet" states. `ManualEngine` evidence is stored as `EvidenceAsset.type = user_confirmation` with `verifier_origin = manual_confirmation`.

## 3. Anti-patterns — the v1 failures this system is built to make impossible

The builder must treat each of these as a named defect class. If a design choice would reproduce one, the choice is wrong.

1. **Jargon-first UI.** Primary user-facing surfaces may not lead with internal process vocabulary (loops, lifecycle states, runs). Developer/debug surfaces and recovery cards may expose object names (`FeatureRequest`, `BuildRun`, etc.) only when paired with plain-language explanations. The plain-language test: someone who has never seen the app understands what is happening at a glance.
2. **Invisible work.** Every model/tool call must create or update an event before the call starts and after it finishes (§4.3). The trace may be compact for routing/classification calls, but it may not be absent — the Context/App Manager classifier is not exempt.
3. **Dead controls.** Every visible control must do exactly what it claims, verifiably. A control that saves but does not gate is a defect of the highest severity. If a setting exists, it works and is reported honestly everywhere — never silently clamped, never hardcoded around.
4. **Contradictory status.** One task, one authoritative status, one place it is computed (§4.3). Available actions are part of that state — a Verify button on a running task must be structurally impossible, not merely discouraged.
5. **Page reloads.** True SPA. Zero full-page navigations after initial load, ever, enforced by an automated reload detector (§5.3).
6. **Self-declared victory.** No agent, engine, or model prose counts as evidence of completion. Evidence comes from verifiers (§5). User-claimed completion is also not evidence.
7. **Sci-fi chrome.** No HUD reticles, scan-lines, glowing circuit textures, generic dark-SaaS AI dashboard styling. Taste anchors: Linear, Arc, Things, Raycast (§10). Enforced via §10's screenshot evidence + human visual review; no forbidden motifs in design notes or components.

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

Engines in v2.0: `ClaudeAgentEngine` (default; wraps the Claude Agent SDK), `NoopHarnessEngine` (dev-only, per D5), `ManualEngine` (recovery path: a human performs steps and attaches evidence recorded as `EvidenceAsset.type = user_confirmation`, `verifier_origin = manual_confirmation`; not a demo mode).

**Boundary rules (must):** the engine may execute tools, stream events, and manage its own coding session. The engine may **not** own or directly mutate: authoritative task status, the cost ledger, sign-off decisions, memory writes, FeatureRequest lifecycle, or UI state. Engines may *request* state transitions, but only GROVER reducers may apply them. All authoritative state changes flow through GROVER's reducers and policy hooks.

**Engine-swap acceptance test (P1 exit):** replacing `ClaudeAgentEngine` with `NoopHarnessEngine` leaves the UI, event stream, cost hooks, task state, pause/cancel controls, and evidence ledger working identically — only the code changes stop being real.

The model router is provider-agnostic: abstract tiers (cheap / mid / frontier) map to configurable provider+model entries. No vendor's model name may be hardcoded in application logic.

### 4.2 The managerial hierarchy — routing and policy, not persistent agents

Will's hierarchy (Context/App Manager → Research, Coding, Grover Builder, Lifestyle, Quant, Business → Memory Manager → caches → Processing ⇄ Cost Manager → Output) is implemented as runtime semantics at single-agent cost:

- **Context/App Manager** = a cheap-tier classification pass on every input: route → domain, budget class, sign-off pre-check. Milliseconds, Haiku-tier, and event-traced per §3.2.
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

  Only `builder` is fully implemented in v2.0; the other five exist as stub contracts (real schema rows, minimal permissions) so the lane mechanism is provably general. Stub lanes in v2.0 are internal contracts and tests only; they may not create user-facing Research/Business/Quant/Lifestyle/Coding modules or dashboards. Builder's elevated authority is a **current-phase property** — nothing in the schema may hardcode "Builder is special forever."
- **Lane-realness tests (P1 exit):** two lanes with identical tools/namespaces/checks are one lane. The suite must demonstrate at least: a non-builder stub lane cannot edit GROVER source; the builder lane cannot read `jackson-private`; and a Coding-domain request routes away from Builder unless it is explicitly about GROVER's own source. A lane is proven by watching a cross-lane action get refused.
- **Subagents** spawn only for parallel independent subtasks or context-polluting side work. Never as ceremony.
- **Memory Manager** = the async consolidation process (§8.4). **Cost Manager** = deterministic hooks (§7). Neither is a chat participant.
- **UI:** every run shows an unobtrusive "Active manager: Builder" label with a one-line route reason.

### 4.3 Events, projections, and the single source of truth

Hybrid event sourcing:

- `events` — append-only, immutable. Minimum schema: `seq BIGINT AUTOINCREMENT, event_id, scope_type(task|build_run|feature_request|system|policy|budget|memory), scope_id?, task_id?, build_run_id?, parent_event_id?, idempotency_key, ts, actor(will|grover|engine|tool|system), domain?, phase(intake|planning|editing|verifying|blocked|done|failed|cancelled|policy|budget|memory|system), plain_language, internal_detail, evidence_ref?, cost_delta?, model_run_id?, signoff_state?`.
- `task_state` / `build_state` — denormalized projections, updated **exclusively** by event reducers. The UI renders **only** projections.
- `evidence_assets`, `cost_ledger` — as defined in §5 and §7.

**Rules (must):** `plain_language` is mandatory on every event and written for a human ("Editing the settings page to add the theme picker" — never "state transitioned to verifying"). Idempotency keys prevent duplicate side effects and duplicate events on crash/retry. Reducers replay by `seq`, not timestamp; SSE clients resume from the last received `seq`; any event that changes user-visible status, available actions, cost, policy, memory, or evidence must be reducible from the append-only log after restart. Projection tables are disposable: deleting and rebuilding them from `events` must produce the same user-visible state except for intentionally non-replayable ephemeral connection metadata. Available actions (`actions: [...]`) are computed server-side into the projection; the client may not infer actions. Foreground (Will-initiated) vs background (Grover-initiated) is a field on every task, driving both visual treatment and a more restricted background action set.

**Transport:** SSE for server→client streaming; ordinary POST/PUT for user actions, updating in place. WebSockets only if a concrete bidirectional need is demonstrated.

### 4.4 Builder object model

```text
FeatureRequest → BuildRun → AcceptanceCheck[] → EvidenceAsset[]
                          → GitCommit[]
                          → MemoryUpdateProposal[]
```

SQLite is authoritative for all Builder objects. Minimum schemas:

- `FeatureRequest`: `id, title, description, origin(will_direct|grover_self_initiated|imported), domain, status(intake|planned|running|blocked|verifying|passed|failed|cancelled), created_by, created_at, updated_at, signoff_state(not_required|required|approved|denied), signoff_reason?, importance?, estimated_effort?, estimated_cost?, actual_cost?, active_build_run_id?, linked_commit_ids[], linked_memory_update_ids[]`.
- `BuildRun`: `id, feature_request_id, engine_id, branch_name, status(queued|running|paused|blocked|verifying|passed|failed|cancelled), current_phase, started_at, ended_at?, cost_estimate, actual_cost, failure_summary?, recovery_state?, receipt_id?`.
- `AcceptanceCheck`: `id, feature_request_id, build_run_id?, title, description, check_type(unit|integration|playwright|visual|manual|security|cost|memory|api_or_state|database), required_evidence_types[], status(pending|running|passed|failed|needs_manual_verification|amendment_requested), passes boolean default false, evidence_asset_ids[], one_off boolean default false, created_by, amended_by?, amendment_reason?`.
- `EvidenceAsset`: `id, build_run_id, acceptance_check_id?, type(screenshot|playwright_trace|dom_assertion|console_log|network_log|test_output|git_diff|commit|cost_receipt|state_capture|backup_restore_log|user_confirmation), verifier_origin(playwright|test_runner|git|cost_hook|db_check|backup_job|manual_confirmation|security_policy|system), trusted boolean, uri_or_path, summary, created_at, hash?`.
- `GitCommit`: `id, build_run_id, hash, branch_name, message, diff_summary, created_at`.
- `MemoryUpdateProposal`: `id, source_event_id, proposed_operation(create|update|supersede|delete), namespace, target_memory_id?, status(proposed|approved|rejected|applied), provenance, sensitivity, rationale, created_at, applied_at?`.

Additional fields may be added, but removing or weakening these fields requires a `DECISIONS.md` entry and may require Will sign-off if it affects evidence, memory, cost, or governance.

**Closure invariant:** a FeatureRequest may be closed only when all non-one-off required AcceptanceChecks are `passed`, every `passed` check has trusted evidence, the BuildRun has a receipt, and any required sign-off is approved.

**The agent-facing `feature_list.json` is a generated projection** (Anthropic-harness ergonomics without a second source of truth):

1. Generated per BuildRun from the DB; includes `build_run_id`, `projection_version`, and a hash of the originating acceptance-check set. Imports from a stale or mismatched projection are rejected.
2. The engine may only flip `passes` on existing `acceptance_check_id`s. Creating, deleting, renaming, reordering, or rewriting checks through the projection is rejected and logged.
3. A `passes: true` flip is accepted only if the referenced `EvidenceAsset` already exists in the DB, is linked to the same BuildRun, and matches the check's required evidence type.
4. Evidence records its verifier origin. Engine prose is never evidence.
5. If the engine believes a check is wrong or incomplete, it emits an `AcceptanceCheckAmendmentProposal`, which blocks closure until accepted. The definition of done cannot be edited silently.
6. **Concurrency:** one active BuildRun per FeatureRequest, enforced with a DB lock or optimistic-concurrency guard.

## 5. Evidence policy

### 5.1 Per-check minimum evidence, by kind

| AcceptanceCheck kind | Per-check minimum evidence |
|---|---|
| `ui_interaction` | Playwright DOM assertion + post-action screenshot |
| `ui_visual_baseline` | screenshot + baseline comparison; if automated comparison is impossible, screenshot + human visual-review confirmation + reason automation was impossible |
| `api_or_state` | API/state assertion + before/after state capture |
| `database` | DB assertion or migration check + rollback/backup status where relevant |
| `memory_retrieval` | seeded retrieval test result + included/excluded memory IDs |
| `cost_or_budget` | cost-ledger row + cap/receipt assertion |
| `security_or_policy` | policy-rule assertion + denied/allowed action evidence |
| `manual_only` | Will's confirmation with exact instructions given, timestamp, and the reason automation was impossible |

**Evidence quality rules:** screenshots must be stored as files, not pasted model descriptions. DOM assertions must include selector/locator, expected condition, and pass/fail output. Console/network scans must include counts and new/unexpected items, not just "clean."

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

Default is full autonomy: Grover acts inside its lane without asking.

A direct prompt from Will is instant approval to begin and complete the requested work inside the current reversible/safe domain. It is also sufficient sign-off for a boundary-crossing action **only when the prompt explicitly names that action with enough specificity to execute it safely** — for example, "spend up to $20 on X," "delete file Y," or "add host Z to the allowlist." If a sign-off trigger is merely an implementation implication of a broader request, Grover pauses at the boundary and asks once with a compact memo. No generic confirmation dialogs; only trigger-specific sign-off prompts.

Exactly five triggers escalate to Will when not already explicitly approved:

1. **Real money** — purchases, subscriptions, paid service setup, trading actions, creating/increasing any budget, exceeding a pre-approved budget. Normal model/API usage **inside** a pre-approved budget is not a sign-off event; creating or raising the budget is.
2. **Irreversible/destructive** — deletes outside git-tracked safe paths, unbacked-up data deletion, destructive migrations (unless rollback migration + restore path have passed), git history rewrite/force push, OS-destructive commands, external `POST/PUT/PATCH/DELETE` to non-allowlisted hosts.
3. **Jackson's private space** — any read/write/export of `jackson-private`, or inference of its contents into other contexts. **Fails closed entirely in v2.0.**
4. **Self-initiated Grover changes** — any Grover-generated FeatureRequest not directly requested by Will; any background proposal to modify app behavior, memory policy, security, cost policy, or prompts.
5. **Security-boundary changes** — auth/Cloudflare Access, secret vault, tool-permission expansion, sandbox/allowlist expansion, public network exposure, write-privileged integrations, prompt-injection policy, kill-switch or audit-log behavior, and **any change to the PolicyRegistry itself**.

Any read/export/write of secret material outside the secret vault's approved access path is both a security-boundary event and a destructive-risk event until proven otherwise.

**Reversible-by-construction domains** (inside these, actions are reversible by definition and never escalate under Trigger 2):

- **Repo writes:** on a BuildRun branch/checkpoint, from a clean starting state, with diff visibility, and no writes to secrets or ignored sensitive files.
- **Vault writes:** only while the Human Vault is versioned/snapshotted with a **tested** restore path.
- **DB writes:** inside ordinary transactions while the backup job is green.

**"Backup job green," mechanically:** last successful backup within the freshness window AND latest restore drill passed within the current phase/review window AND no pending failed migration/restore warnings AND backup location reachable. Not green → the affected domain loses its reversible status until fixed.

**Allowlisted hosts:** a host is allowlisted only if it appears in the `PolicyRegistry` with exact method/scope, owner, origin approval, and review/expiry date. Domain-wide allowlists require Trigger 5 sign-off.

**Uncertainty escalation:** deterministic rules first; model judgment is only an uncertainty detector. An action that cannot be classified mechanically, where any trigger might apply, escalates with a compact memo: why uncertain / exact action / exact proposed narrow rule / blast radius. Approved rules enter the **PolicyRegistry** (`rule_id`, origin approval, exact scope/pattern, owner, created, last used, review/expiry date), visible on a read-only policy page in the UI. One approval never generalizes into a broad allowlist.

## 7. Cost governor

- **Hooks, not vibes:** a deterministic pre-call hook (estimated cost vs remaining budgets) and post-call hook (actual spend → `cost_ledger`, tied to task and event). Over-cap → block and surface. **No silent model downgrades** — if a downgrade is recommended, Will sees it.
- **Estimation humility:** pre-call estimates are conservative estimates, not promises. If actual spend exceeds estimate due to provider behavior or tool retries, the post-call hook records the variance and the receipt explains it. Repeated estimate misses require a DECISIONS.md correction.
- **Budget levels:** global monthly · per-phase ($25 soft / $50 hard, per D2) · per-FeatureRequest estimate · per-BuildRun actual. Soft cap warns/pauses and asks; hard cap blocks all model calls until Will raises it.
- **Receipts:** every completed BuildRun shows estimated vs actual cost (with variance explanation), models/tools used, checks passed, commit hash.
- **Router:** abstract tiers mapped to swappable providers (§4.1). Output classes (silent / label-only / compact-JSON / brief / full / artifact) set per call; internal chatter defaults to compact-JSON.
- **Kill switch:** one control halting all model calls, background jobs, external mutating requests, and scheduled processes. It gets its own acceptance test and drill (P5), including blocking both a queued and an in-progress run.
- **Cancellation:** a run cancelled mid-model/tool sequence must stop further spend where technically possible and mark any unavoidable already-incurred cost honestly.
- **Acceptance tests:** over-budget run blocks before the call; ledger survives restart; UI shows live cost without reload; no silent downgrade; cancellation stops spend.

## 8. Memory core (v2.0 — minimal by design)

### 8.1 Tiers

1. **Active Context Pack** — per-request curated context, assembled by a context builder querying tiers 2–3 through the routed lane's namespace scope, under a hard context budget with rank-and-trim. Never "the whole vault."
2. **Project State Cache** — SQLite structured operational state: open tasks, recent decisions, FeatureRequest/BuildRun links, active-project world-model.
3. **Human Vault** — Obsidian-compatible Markdown, one fact/note per file, frontmatter: `owner, namespace, category, confidence, sensitivity, importance, source, created, superseded_by?`. Indexed by SQLite FTS5. Human-readable and human-editable outside GROVER; survives GROVER dying.

**Namespace registry (minimum v2.0):** `will-private`, `jackson-private`, `shared-grover-dev`, `shared-home-tech`, `shared-business`, and reserved future life-domain namespaces. `jackson-private` exists only to fail closed in v2.0.

### 8.2 Scope (and only this)

Project facts for GROVER development; Will-approved profile facts relevant to Builder/product decisions; build history and decisions; FeatureRequest/BuildRun links; namespaced vault; retrieval with provenance; correction/deletion/supersession; backup/export.

### 8.3 Write policy

Direct "remember this" from Will = approved write. In v2.0, incidental conversational facts default to `MemoryUpdateProposal`, not committed memory. The only incidental writes that may auto-commit are operational build facts produced by GROVER itself (BuildRun summaries, accepted decisions, receipts, verified corrections), and those still require provenance. Sensitive facts (private/health/finance) = explicit confirmation required unless Will directly asked. Every memory has provenance and an edit/delete path.

### 8.4 Consolidation

An async, scheduled Memory Manager pass (never on the conversational hot path): promotes cache→vault, merges duplicates, marks conflicts for human resolution rather than hallucinating one, prunes stale entries, updates routing hints fed back to the Context Manager. In v2.0 this runs only over project/build memory (D3).

### 8.5 Acceptance tests (P4 exit — all ten, mechanical)

The ten tests from planning iteration 2 §A5, restated as binding here: (1) persistence across restart with provenance; (2) no silent memory — a throwaway fact does not enter the vault without proposal+approval; (3) correction/supersession — new fact supersedes, old fact auditable but not retrieved as current; (4) deletion — removed from active retrieval, marked deleted in audit; (5) namespace isolation — `will-private` queries cannot retrieve `jackson-private`; `jackson-private` fails closed; (6) relevance gating; (7) provenance explanation — "why did you know that?" points to note/source/date; (8) human-readable vault, editable outside GROVER; (9) consolidation on a seeded messy corpus proposes clean merges and marks conflicts rather than hallucinating resolution; (10) context-budget trimming — retrieval ranks and trims, never dumps.

**Mechanics for test 6 (and the eval set generally):** a versioned repo file of ~20 seeded scenarios specifying `expected_included_memory_ids` / `expected_excluded_memory_ids`; pass/fail is deterministic on IDs, measuring both recall and precision; seeded cases include namespace/privacy negatives across `will-private`, `jackson-private`, `shared-grover-dev`, and unused future life-domain namespaces. LLM-as-judge is advisory only and gates nothing. Every retrieval bug found later becomes a new eval case.

### 8.6 v2.1 forward-compatibility (build nothing, block nothing)

Broad personal-life memory is v2.1's flagship. v2.0 must therefore: reserve life-domain namespaces in the schema, keep vault frontmatter domain-agnostic, and keep the consolidation pass domain-parameterized — so v2.1 is configuration plus new write sources, not surgery. **P4 must include a no-migration test** proving that a seeded future life-domain namespace can exist, remain unread by Builder unless permitted, and pass through backup/export without special-case schema changes.

## 9. Security (carried from v1, binding)

Cloudflare Access as the eventual front gate (no custom login); secret vault outside the repo; external content is data, never authority — with an actual red-team acceptance test in P5, not just this sentence; narrow tool permissions by default; no public registration; no direct origin exposure; audit log on every consequential action; kill switch per §7. Threat model: a compromised Grover could expose API keys, repo access, files, browser sessions, automation privileges — design accordingly. Local-only binding until deployment is deliberately taken on (post-v2.0).

**Local-only mode is not a security bypass:** secret handling, tool allowlists, audit logging, prompt-injection treatment, and kill-switch behavior must be implemented before deployment, not deferred to deployment.

## 10. UI identity

### 10.1 Requirements

- **Live build transparency is the single most important UI requirement.** What is being built, where, how far along — plain language, live, unmissable, orb-adjacent, front and center in the Command Center (not buried in a tab).
- Minimalist base so the artistic elements pop; artistry/modern/smooth/human (Linear/Arc/Things/Raycast benchmark); reject list per §3.7.
- Theme = semantic CSS token system from day one: light, dark, multiple named palettes, swappable without touching component code.
- Draggable, expandable task widgets in the Command Center; a waiting task is a real object Will can pull into chat to workshop.
- Conversational responsiveness is first-class and separate from task latency: streaming replies, immediate visible acknowledgment when real work starts, no dead air.
- **Recovery card** on any failed build: what failed, what was changed, what was reverted, what evidence exists, next safe action.
- Foreground vs background tasks are visually and functionally distinct, with different action sets.

**v2.0 UI scope guard:** these requirements apply only to the Command Center, Builder surfaces, task/build widgets, recovery cards, settings needed by visible controls, and the minimal memory surfaces required by §8. They may not be used to justify building future modules. Draggability and theme tokens must be architecturally supported from day one; full advanced customization may be deferred unless needed for the v2.0 acceptance tests.

**Visual taste acceptance:** taste requirements are not fully automatable. They require screenshot evidence and Will/Jackson visual review when a change affects the shell, orb adjacency, motion, theme tokens, or primary Builder layout. Human aesthetic acceptance is acceptance for aesthetic requirements only — it is never evidence that functionality works.

### 10.2 The orb

Ported verbatim from `archive/grover_v1/client/js/orb.js` and its states (idle/reasoning/creative/high-attention/success/error): colors, sizing, state-driven animation unchanged. Arcane/Spider-Verse energy is licensed for the orb and accent language only — never whole-UI comic styling. The rest of the app must earn the right to sit next to the orb.

## 11. Development process rules (binding on the builder)

1. **Definition of done for UI-facing work:** browser evidence per §5, or stop and tell Will exactly what to click and what he should see, and wait. A passing server-side check is never sufficient alone. This manual-verification pause is allowed only when browser verification is impossible for a specific check, and the reason must be recorded.
2. **Session bootstrap ritual:** read the progress file, read git log, start the app, run the golden-path smoke via browser — before touching anything new.
3. **Incremental work:** one feature at a time; git checkpoint with a descriptive message + progress-file update per increment; leave a clean state every session (mergeable-to-main quality).
4. **Branch discipline:** every BuildRun happens on a dedicated branch or worktree. Direct commits to `master`/`main` are forbidden except final merges after verification.
5. **Scope discipline:** the current phase is the whole job. No cross-module wandering.
6. **Prediction discipline (cheap harness-improvement practice):** every change to prompts/tools/skills during development gets a DECISIONS.md entry with a one-line prediction, checked at the next phase exit. (The formal harness-improvement ledger is post-v2.0.)
7. **User-claimed completion is not evidence** — including claims from Will. Verify anyway; his sign-off is consent (and, for aesthetics, acceptance per §10.1), not proof of correct behavior.
8. **No new dependencies without a DECISIONS.md entry** explaining why a built-in primitive was insufficient.

## 12. Side-track proposal intake

Any file from a parallel track (Jackson's UI/UX or red-team lanes, future contributors) that proposes changes to architecture, UI structure, acceptance rules, memory, security, cost, or phase scope is imported as a `PlanningProposal` record — never silently merged:

`proposal_id, source_file, proposer, status(proposed|accepted|rejected|superseded), area, affected_decisions[], summary, acceptance_implications, conflicts_with_locked_decisions, requires_will_decision, resolution`

Rules: the main thread arbitrates conflicts; the master prompt and build scope include only `accepted` proposals; accepted proposals that change a locked decision, phase exit, acceptance test, or visible requirement also get a DECISIONS.md entry; **rejected proposals must include the locked decision, phase exit, or design principle they conflicted with**, so the same proposal does not reappear unresolved; red-team findings attach to the specific phase exits or acceptance checks they affect, not prose-only files.

## 13. Phase plan and Definitions of Done

Each phase: $25 soft / $50 hard budget guard. Exits are gates — the next phase spends nothing until the current exit is green.

- **P0 — Decision lock + this master prompt finalized.** Exit: all decisions required for P1–P5 are resolved; any remaining open questions are explicitly marked post-v2.0 or assigned to a future `PlanningProposal`; Will approves the prompt.
- **P1 — Spine skeleton.** SPA shell, orb port, event log + projections, SSE, cost-ledger stub, kill switch, full object-model schema, `DomainContract` stubs. Exit: `NoopHarnessEngine` streams plain-language progress with zero reloads and one authoritative status; pause/cancel/kill-switch transitions work; engine-swap test passes; lane-realness tests pass (including Coding-routes-away-from-Builder); reload detector green; cost ledger survives restart; **projection rebuild test passes** — deleting projections and replaying `events` recreates the same task/build state.
- **P2 — Razor Builder slice.** One tiny real request end-to-end through `ClaudeAgentEngine`: FeatureRequest → BuildRun → live events → branch → Playwright evidence → commit → receipt → Will confirms the visible result. The request must be chosen so it does not require security-boundary changes, external paid services, or memory-core functionality. Exit: it worked, no contradictory status anywhere, no reloads.
- **P3 — Builder reliability set.** Five diverse requests: UI-only, backend/API, settings/control, persistence/project-state, and a negative case where Builder must refuse or require sign-off. No broad memory-core feature may be built in P3. Exit: all five pass with evidence; regression suite seeded from each; mid-build crash recovery demonstrated.
- **P4 — Minimal memory core.** §8 built. Exit: all ten acceptance tests pass mechanically, plus the §8.6 no-migration forward-compatibility test.
- **P5 — Hardening → v2.0.** Drills: kill switch (queued + in-progress), budget-cap breach, all five sign-off triggers deliberately provoked, prompt-injection red-team from external content, browser-verification-failure path, app crash/restart recovery, vault backup **and restore**, and a **deliberately failed build producing a complete recovery card** (changed files, reverted/not-reverted state, evidence collected, cost spent, next safe action). Exit: all drills pass.

**Definition of Done — Builder:** P2 + P3 exits green, and Will has personally confirmed, in the running app, that he can type a request, watch it happen live in plain language, and see verified results — repeatedly, without a single contradictory status or reload.

**Definition of Done — memory core:** P4 exit green, and Will has personally confirmed a remembered fact surviving a restart and being used correctly, a correction superseding cleanly, and a deletion actually deleting.

**v2.0 = both Definitions of Done + P5 drills, confirmed by Will.**

## 14. Interpretation, gaps, and uncovered sub-decisions

This document is the binding spec. No requirement may depend on reading planning iterations, chat transcripts, or archived v1 prompts unless the requirement is restated here.

When implementation requires a decision not explicitly covered here:

1. **Ask Will** if the decision changes scope, locked decisions, sign-off behavior, security boundaries, cost policy, memory policy, Jackson/privacy boundaries, public exposure, visual identity, or phase exit criteria.
2. **Derive and record** if the decision is a low-level implementation detail inside an already-approved requirement. Use first principles, prefer the boring robust option, and write the rationale in `DECISIONS.md`.
3. **Import as `PlanningProposal`** if the decision originates from Jackson's track, a red-team file, or any parallel planning source (§12).
4. **Never import hidden requirements** from `archive/grover_v1/`, earlier planning iterations, or model memory. Those sources may inform rationale only; they are not binding unless represented in this document.
5. **Escalate uncertainty** if the builder cannot determine whether a decision is implementation detail or scope/policy change. The escalation must include the exact unresolved question, affected sections, and the smallest safe default.

---

*Lineage: derived from `planning/grover_v2_scope_understanding.md` and planning iterations 1–6 (`planning/chatgpt_handoffs/`), finalized in iteration 7. This document supersedes all of them as the sole binding build specification.*
