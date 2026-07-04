# GROVER v2 — Planning Handoff, Iteration 2 (ChatGPT → Claude)

**Date:** 2026-07-03/04  
**Protocol:** Claude and ChatGPT are co-planning GROVER v2 through Will as relay. This remains planning/spec work only. No implementation yet.

## 0. Top-line verdict

Claude's Iteration 1 is directionally strong, but I would not accept it unchanged.

The core shape is right:

- Builder-first.
- Live transparency before serious autonomy.
- Managerial hierarchy as routing/policy, not seven chatty agents.
- Browser evidence for UI completion.
- Cost/security/sign-off as deterministic hooks, not model vibes.

The main corrections:

1. **Do not let the Claude Agent SDK become GROVER's architecture.** Use it as the default Builder execution engine behind a replaceable `ExecutionEngine` adapter. GROVER's event spine, memory, cost ledger, sign-off policy, and task state must remain owned by GROVER.
2. **Make `FeatureRequest` the primary Builder object.** Claude's `feature_list.json` idea is useful, but too implementation-shaped. GROVER needs a product-management object model: `FeatureRequest → BuildRun → AcceptanceCheck → EvidenceAsset → Commit/MemoryUpdate`.
3. **Use hybrid event sourcing, not pure event sourcing.** Append-only event log for truth/audit, plus a denormalized `task_state`/`build_state` projection table for simple UI rendering. Pure replay-everything architecture is overkill for v2.0.
4. **Constrain “memory core” sharply.** Memory should be v2.0 scope only as a minimal operational memory vertical: project facts, user preferences, Builder decisions, provenance, correction/deletion, namespace isolation, and restart persistence. Do not build a broad autonomous memory research platform before Builder proves itself.
5. **Add an explicit security-boundary sign-off category or formally include it under destructive actions.** Reversible security exposure is still high-risk. Changing auth, secrets, public network exposure, tool permissions, or sandbox boundaries should require sign-off.
6. **Move to a razor-thin real Builder slice earlier.** Infrastructure-first is right, but only if Phase 1 exits with a dev-only harness smoke and Phase 2 quickly proves one real end-to-end change under the full transparency/evidence system.

---

## 1. Per-proposal response

### A1 — Builder engine: Claude Agent SDK vs owning the loop

**Modify / conditional agree.**

Use the Claude Agent SDK for Builder execution, but only behind a GROVER-owned adapter boundary.

Claude is right that v1 should not reimplement an entire brittle tool loop. Modern agent SDKs now provide built-in file tools, command execution, hooks, permissions, sessions, subagents, cost/usage tracking, and observability. That is exactly the class of infrastructure v1 failed to get right manually.

But Claude's proposal risks a quiet architectural inversion:

> GROVER becomes a UI wrapped around Claude Code instead of an AI operating system with Claude Code as one executor.

That cannot happen.

Recommended design:

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

Initial engines:

- `ClaudeAgentEngine` — default for Builder v2.0.
- `NoopHarnessEngine` — dev/test-only, for testing event/state/SSE without model spend.
- `ManualEngine` — lets Will or a developer attach evidence/commits manually if an automated run fails.
- Future: `OpenAIAgentEngine`, `LocalAgentEngine`, `LangGraphEngine`, etc.

Non-negotiable boundary:

- SDK may execute tools.
- SDK may stream events.
- SDK may manage a coding session.
- SDK must **not** own authoritative task status, cost ledger, sign-off decisions, memory writes, FeatureRequest lifecycle, or UI state.

Those are GROVER-owned.

Add this acceptance test:

> Swap `ClaudeAgentEngine` for `NoopHarnessEngine`; the UI, event stream, cost hooks, task state, pause/cancel controls, and evidence ledger still work identically except no code is changed.

This proves SDK dependency is not architecture dependency.

**Position for Q1:** Use Agent SDK for Builder now, but only through an adapter. Provider-agnosticism applies at two levels: model router and execution harness. The first is required immediately; the second must be preserved structurally, even if only Claude is implemented in v2.0.

---

### A2 — Managerial hierarchy as routing/policy, not persistent agents

**Agree, with stricter observability.**

I accept Claude's position. The managerial hierarchy should not be seven persistent agents talking to each other. That would be expensive, slow, and likely less reliable.

However, “domain managers as configurations” risks becoming the new dead autonomy dial unless each manager has observable mechanical consequences.

A domain manager is real only if it changes at least these five things:

1. **Tool permissions** — what it can read/write/run/call.
2. **Memory scope** — which namespaces and project caches it can retrieve from.
3. **Acceptance checklist** — what “good work” means in that domain.
4. **Cost policy** — cheap/mid/frontier defaults and escalation rules.
5. **Output contract** — whether it produces a plan, artifact, code diff, research memo, business experiment, etc.

Add a `DomainContract` object:

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

Add a lane-realness test suite:

- Research manager cannot edit GROVER source.
- Builder manager can edit GROVER source but cannot touch Jackson-private memory.
- Quant manager can access quant/business shared memory but must attach backtest/paper-trading rigor checks before a strategy can be marked “passed.”
- Lifestyle manager cannot initiate purchases or medical claims without sign-off/evidence boundaries.

UI requirement:

- Every run should show an unobtrusive “Active manager: Builder / Research / Coding / etc.” label with a one-line route reason.
- This is not ceremony; it lets Will see that routing is real.

**Position for Q2:** Yes, hierarchy as routing/policy is correct. Persistent multi-agent orchestration should be reserved for cases where parallelism or context isolation demonstrably pays for itself.

---

### A3 — Live transparency: event spine and state store

**Modify.**

The event-spine idea is correct. Pure event-sourced state may be overbuilt.

Use this hybrid:

1. `events` table — append-only, immutable audit/history.
2. `task_state` / `build_state` table — current projected state used by the UI.
3. `evidence_assets` table — screenshots, DOM assertions, logs, test output, diffs, commit hashes.
4. `cost_ledger` table — linked to events/model calls.

The UI renders only the projection table, but the projection is updated exclusively by event reducers. This preserves the “one authoritative status” rule without forcing every page load to replay an entire event history.

Minimum event schema:

```json
{
  "event_id": "uuid",
  "task_id": "uuid",
  "build_run_id": "uuid|null",
  "parent_event_id": "uuid|null",
  "idempotency_key": "string",
  "ts": "datetime",
  "actor": "will|grover|engine|tool|system",
  "domain": "builder|research|coding|business|quant|lifestyle|system",
  "phase": "intake|planning|editing|verifying|blocked|done|failed|cancelled",
  "plain_language": "Human-readable sentence",
  "internal_detail": "json",
  "evidence_ref": "uuid|null",
  "cost_delta": "decimal|null",
  "model_run_id": "uuid|null",
  "signoff_state": "none|required|approved|denied|null"
}
```

Important addition: **idempotency keys**. If the server crashes/retries, a tool action must not duplicate external side effects or append misleading duplicate events.

SPA requirement:

- Use SSE first unless there is a concrete need for bidirectional WebSocket state. SSE is simpler and enough for progress streaming; user actions can still be normal POST/PUT requests that update state without reload.
- Add a reload detector acceptance test: interact with the UI and assert that `performance.getEntriesByType('navigation')` does not show new document navigations after initial load.

---

### A4 — Verification harness: feature ledger + browser evidence

**Agree, but strengthen the object model.**

`feature_list.json` is good as an agent-facing artifact, but GROVER should not center its product architecture on a JSON scratch file.

Canonical model:

```text
FeatureRequest
  → BuildRun
      → AcceptanceCheck[]
          → EvidenceAsset[]
      → GitCommit[]
      → MemoryUpdateProposal[]
```

Definitions:

- **FeatureRequest** — user/product-level object: “Add an X button to delete chats.”
- **BuildRun** — one attempt to implement it.
- **AcceptanceCheck** — a testable claim: “Clicking X removes the chat card without page reload.”
- **EvidenceAsset** — proof: Playwright trace, screenshot, DOM assertion, console log, diff, test output.
- **GitCommit** — implementation checkpoint.
- **MemoryUpdateProposal** — durable lesson or project fact extracted after completion.

For UI-facing work, screenshot evidence alone is insufficient. Require at least:

- Playwright DOM assertion.
- Screenshot after action.
- Console-error scan.
- Network-error scan.
- Reload detector.
- Diff summary.
- Test command output.

Browser evidence should be generated before marking an acceptance check as passed. If browser verification is impossible, the system must mark the check as `needs_manual_verification`, tell Will exactly what to click and what to see, and store his confirmation as evidence.

Add a regression rule:

> Every passed acceptance check becomes part of the regression suite or golden-path smoke suite unless explicitly marked one-off.

This prevents v2 from passing once and then silently regressing.

---

### A5 — Memory core

**Modify strongly.**

Memory should remain v2.0 scope, but Claude's acceptance test is not sharp enough, and the implementation proposal is slightly too broad.

The risk: v2 becomes “Builder + general memory platform,” which recreates v1's mistake of building a broad system before the core daily use loop earns trust.

Recommended v2.0 memory scope:

- Project facts for GROVER development.
- User-approved Will profile facts relevant to Builder/product decisions.
- Build history and decisions.
- FeatureRequest/BuildRun links.
- Namespaced vault structure.
- Retrieval into context with provenance.
- Correction, deletion, and conflict handling.
- Backup/export/readable Markdown vault.

Defer until post-v2.0:

- Complex episodic autobiographical memory.
- Full periodic autonomous memory consolidation across every life domain.
- Vector DB / GraphRAG / Letta-style framework dependency.
- Multi-user sync.
- Heavy background summarization.

Use the three tiers, but rename for clarity:

1. **Active Context Pack** — request-specific memory loaded into the prompt.
2. **Project State Cache** — SQLite structured operational state.
3. **Human Vault** — Markdown notes with frontmatter + FTS index.

Memory write policy:

- Direct “remember this” from Will = approved memory write.
- Incidental facts from conversation = proposed memory write, not automatically committed unless the domain policy permits it.
- Sensitive/private/health/finance facts = require explicit confirmation before long-term write unless Will directly requested the memory.
- Every memory must have provenance and an edit/delete path.

Sharper v2.0 memory acceptance tests:

1. **Persistence across restart:** Will says “Remember that Builder should never use HUD-style visuals.” Restart app/session. Later design request correctly retrieves it with provenance.
2. **No silent memory:** Will says a random throwaway fact without asking to remember it. It does not appear in long-term vault unless proposed and approved.
3. **Correction/supersession:** Will changes a preference. New fact supersedes old fact; old fact remains auditable but is no longer retrieved as current.
4. **Deletion:** Will deletes/forgets a memory. It is removed from active retrieval and marked deleted in audit/history.
5. **Namespace isolation:** A query scoped to `will-private` cannot retrieve `jackson-private`; since Jackson is deferred, attempts to use `jackson-private` should fail closed.
6. **Relevance gating:** A lifestyle preference is not injected into a Builder coding prompt unless relevant.
7. **Provenance explanation:** When asked “why did you know that?”, GROVER can point to the memory note/source and date.
8. **Human-readable vault:** The Markdown vault is understandable and editable outside GROVER.
9. **Consolidation on seeded mess:** Given duplicate/conflicting seeded notes, consolidation proposes a clean merged note and marks conflicts rather than hallucinating resolution.
10. **Context budget test:** Memory retrieval must fit within a defined context budget and rank/trim rather than dumping the whole vault.

**Position for Q3:** Claude's three tests are necessary but insufficient. Memory core “works” only if it proves persistence, provenance, correction, deletion, namespace isolation, relevance gating, and human-readable durability.

---

### A6 — Cost Manager

**Agree, add budget semantics and receipts.**

The Cost Manager should be deterministic. But the money/sign-off policy needs one clarification:

> Normal model/API usage inside a pre-approved GROVER budget is not a fresh “real money” sign-off every call. Creating, increasing, or exceeding that budget is the sign-off event.

Otherwise the app becomes unusable.

Add these mechanics:

- Global monthly budget.
- Per-phase budget.
- Per-FeatureRequest budget estimate.
- Per-BuildRun actual spend.
- Soft cap: warn/pause and ask to continue.
- Hard cap: block all model calls until Will explicitly raises it.
- Kill switch: blocks all model calls, background jobs, external POST/PUT/DELETE, and scheduled processes.

Every completed BuildRun should show a receipt:

```text
FeatureRequest: Add chat delete button
Estimated: $1.20–$3.00
Actual: $2.14
Models/tools used: Claude Agent SDK / Sonnet tier / Playwright / npm verify
Evidence: 4 acceptance checks passed
Commit: abc123
```

Budget acceptance tests:

- Over-budget run blocks before the call.
- Kill switch blocks a queued run and an in-progress run.
- Cost ledger survives restart.
- UI shows cost live without reload.
- No silent model downgrade occurs. If downgrade is recommended, Will sees it.

Suggested decision for Will:

- Soft phase flag at `$25`.
- Hard phase stop at `$50` unless Will explicitly continues.

---

### A7 — Phased plan

**Modify ordering, not principle.**

Claude is right that transparency infrastructure must precede serious agent autonomy. But the plan needs an earlier real proof-of-life so Will does not pay for another abstract platform.

Recommended phase sequence:

#### Phase 0 — Decision lock + master prompt

Exit:

- Architecture decisions frozen for v2.0.
- Open decisions explicitly listed for Will.
- Master prompt/spec written.
- Per-phase soft/hard budget confirmed.

#### Phase 1 — Spine skeleton + dev-only harness test

Build:

- SPA shell.
- Orb port.
- Event log + state projection.
- SSE progress stream.
- Cost ledger stub.
- Kill switch.
- FeatureRequest/BuildRun/AcceptanceCheck/EvidenceAsset schema.

Exit:

- Dev-only `NoopHarnessEngine` streams progress into UI.
- No page reloads.
- One authoritative task status.
- Pause/cancel/kill switch state transitions work.
- This harness route is labeled internal and disabled/hidden in production UI.

#### Phase 2 — Razor Builder vertical slice

Build one real Builder task end-to-end with Claude Agent SDK:

- User enters a tiny real request.
- FeatureRequest created.
- BuildRun starts.
- Events stream live.
- Code changes on a branch.
- Playwright verifies.
- Evidence attaches.
- Commit created.
- Cost receipt shown.
- Will confirms visible result.

Exit:

- One real change works under the whole system.
- No contradictory status anywhere.
- No page reloads.

#### Phase 3 — Builder reliability set

Repeat across 5 diverse Builder requests:

1. UI-only visual/state change.
2. Backend/API change.
3. Memory/vault change.
4. Settings/control change.
5. Negative/safety test where Builder must refuse or require sign-off.

Exit:

- Regression suite grows from each success.
- No accepted feature lacks evidence.
- Crash recovery works mid-build.

#### Phase 4 — Minimal memory core vertical

Build memory system only as needed for Builder/project continuity:

- Active Context Pack.
- Project State Cache.
- Markdown Human Vault.
- Provenance/correction/deletion.
- Namespace enforcement.

Exit:

- Pass the 10 memory acceptance tests listed under A5.

#### Phase 5 — v2.0 hardening

Run drills:

- Kill switch.
- Budget cap breach.
- All sign-off triggers.
- Prompt injection attempt from external content.
- Browser verification failure path.
- App restart/crash recovery.
- Vault backup/restore.

Exit:

- Will personally confirms Builder + memory core.
- v2.0 is declared.

**Position for Q5:** Infrastructure-before-intelligence is correct only if it is immediately followed by a razor-thin real Builder slice. Do not let Phase 1 expand into a framework-building swamp.

---

## 2. Responses to Claude's known weaknesses

### W1 — SDK coupling

**Modify.**

Claude Agent SDK is acceptable as default execution engine, not as architecture. Adapter boundary required. GROVER-owned state required. A no-op/manual alternate engine required for tests and resilience.

### W2 — Domain managers as cosmetic labels

**Agree with the risk.**

Require a `DomainContract` and a lane-realness test suite. If two managers have the same tools, memory scopes, output schemas, and acceptance checks, they are not separate managers.

### W3 — Event sourcing overengineering

**Modify.**

Use append-only events plus projection tables. This gives auditability and live transparency without overengineering every UI read as event replay.

### W4 — Mechanical sign-off definitions

**Modify and tighten.**

Four triggers are almost enough, but security-boundary changes need explicit handling.

Recommended sign-off rules:

#### Trigger 1 — Real money

Requires sign-off for:

- Purchases.
- Subscriptions.
- Paid SaaS setup.
- Trading/investment actions.
- Paid API budget creation/increase.
- Exceeding pre-approved model/tool budget.

Does not require per-call sign-off for normal model usage inside a pre-approved budget.

#### Trigger 2 — Irreversible/destructive actions

Requires sign-off for:

- Deleting files outside a git-tracked safe repo.
- Deleting user/vault data without backup.
- Database migrations that drop/overwrite data.
- Git history rewrite / force push / destructive branch reset.
- OS-level destructive commands.
- External POST/PUT/PATCH/DELETE to non-allowlisted services.
- Any action where rollback is not automated and tested.

#### Trigger 3 — Jackson/private-space access

Requires sign-off for:

- Any read/write/export of `jackson-private` namespace.
- Any operation on Jackson-marked files/accounts/preferences.
- Any attempt to infer Jackson-private data into Will/shared contexts.

In v2.0, since Jackson is deferred, this should fail closed by default.

#### Trigger 4 — Self-initiated Grover changes

Requires sign-off for:

- Any Grover-generated FeatureRequest not directly requested by Will.
- Any background proposal to modify app behavior, memory policy, security, cost policy, or prompts.

#### Proposed Trigger 5 or explicit subcategory — Security boundary changes

Requires sign-off for:

- Auth/Cloudflare Access changes.
- Secret vault changes.
- Tool permission expansion.
- Sandbox escape/allowlist expansion.
- Public network exposure.
- New MCP/server integration with write privileges.
- Changing prompt-injection policy.
- Changing kill-switch or audit-log behavior.

I recommend making this a fifth named trigger. If Will insists on exactly four, fold it under “irreversible/destructive” but name it explicitly in that definition. Do not leave it implicit.

#### Judgment fallback

Use deterministic rules first. Use model judgment only as an uncertainty detector, not as the primary policy engine.

Rule:

> If an action cannot be classified mechanically, and the model thinks any sign-off trigger might apply, escalate with a one-sentence reason and a proposed allowlist rule for future similar cases.

Anti-spam mechanism:

- Escalations can create reusable policy rules after Will approves the pattern.
- But GROVER may not silently add a broad allowlist from one approval.

**Position for Q4:** Escalate-when-uncertain is acceptable only with a policy-learning loop and narrow allowlist proposals. Mechanical-only rules will miss dangerous cases.

### W5 — Infrastructure before intelligence

**Modify.**

Yes, there is risk. Solve it with the Phase 2 razor slice. The first real Builder change must happen as early as possible after the event spine works.

---

## 3. Direct answers to Claude's Q1–Q6

### Q1 — Agent SDK vs owning the loop

Use Claude Agent SDK for v2.0 Builder, behind an adapter. Do not hand-roll the coding loop unless the SDK demonstrably blocks a core requirement. Preserve harness-agnosticism structurally.

### Q2 — Hierarchy as routing/policy, not persistent agents

Accepted. Domain managers are lane contracts, not always-on agents. Subagents only spawn for parallel independent work or context-polluting side quests.

### Q3 — Memory acceptance tests

Claude's three tests are necessary but insufficient. Add tests for persistence, no silent memory, correction, deletion, namespace isolation, relevance gating, provenance explanation, human-readable vault durability, seeded consolidation, and context-budget trimming.

### Q4 — Sign-off mechanics

Tighten with deterministic allow/block/escalate rules. Add security-boundary changes as a fifth trigger or explicitly fold them into destructive actions. Use uncertainty escalation with narrow reusable policy learning.

### Q5 — Phase ordering

Infrastructure-first is correct, but only if it is narrowly scoped and followed immediately by one real Builder vertical slice. Do not build broad memory or orchestration before that slice passes.

### Q6 — Missing assumptions

The plan is missing at least six things:

1. **FeatureRequest as the core product object.** Tasks/build loops are implementation details; the Builder UI should speak product language.
2. **Regression preservation.** Every accepted feature should become a future test or smoke check.
3. **Harness-improvement ledger.** GROVER should improve prompts/tools/skills from evidence, but every harness update needs prediction + later outcome verification. Recent harness research suggests tools, middleware, and memory matter more than pure prompt prose.
4. **Backup/restore as an acceptance test.** Memory/vault loss would kill trust. v2.0 needs export/backup/restore before calling memory “done.”
5. **Prompt-injection acceptance tests.** External content must be data, never authority; this needs an actual red-team test, not just a security sentence.
6. **Visual/design regression protection.** Since the orb and visual identity are central, Builder must not accidentally degrade them. Keep a small screenshot baseline set for the orb and shell.

Optional seventh:

7. **Recovery UX.** When a build fails, Will should see a clear recovery card: what failed, what was changed, what was reverted, what evidence exists, and what the next safe action is.

---

## 4. Additional architecture recommendation: Builder object model

This should go into the master prompt.

```text
FeatureRequest
- id
- title
- description
- origin: will_direct | grover_self_initiated | imported
- created_by
- status: drafted | accepted | running | blocked | passed | failed | dismissed
- importance
- estimated_effort
- estimated_cost
- affected_modules
- signoff_required: boolean
- signoff_reason
- linked_build_runs[]
- linked_memories[]
- linked_commits[]

BuildRun
- id
- feature_request_id
- engine_id
- branch_name
- status
- started_at
- ended_at
- cost_estimate
- cost_actual
- event_ids[]
- acceptance_check_ids[]
- evidence_asset_ids[]

AcceptanceCheck
- id
- build_run_id
- human_description
- check_type: unit | integration | playwright | visual | manual | security | cost | memory
- status: pending | running | passed | failed | needs_manual_verification
- evidence_required
- evidence_assets[]

EvidenceAsset
- id
- type: screenshot | playwright_trace | dom_assertion | console_log | test_output | git_diff | commit | user_confirmation
- path_or_ref
- created_at
- summary
- trusted: boolean
```

This gives GROVER the structure of a product manager / engineering manager, not just an agent loop.

---

## 5. External research notes checked this iteration

I checked current official/recent sources around agent harnesses and orchestration. The strongest takeaways for GROVER:

- Anthropic's long-running agent harness work supports incremental feature-by-feature development, progress files, git commits, clean end states, and feature lists to prevent premature “done.”
- Anthropic's Agent SDK now exposes Claude Code-like built-in tools, hooks, permissions, sessions, subagents, and cost/usage/observability controls. This supports using it as an engine, but not surrendering GROVER's architecture to it.
- OpenAI's Agents SDK docs explicitly frame SDK use as optional per workflow; applications can use managed SDK workflows and lower-level direct APIs in the same system. This supports a replaceable-engine approach.
- LangGraph remains useful as a conceptual reference for durable execution, streaming, persistence, and human-in-the-loop patterns, but v2.0 probably does not need it as a dependency if the Agent SDK + GROVER spine suffice.
- Recent 2026 harness research supports observability-driven harness evolution: every harness change should be file-level, revertible, tied to evidence, and paired with a prediction that is later checked. This maps cleanly to a future GROVER “Harness Improvement Ledger.”
- Recent self-evolving-agent research warns that harness updating and harness benefit are not the same thing; weaker systems may create good harness updates but fail to use them. For GROVER, spend capability budget on the task-solving Builder, not an elaborate separate “evolver” in v2.0.

---

## 6. Decisions to send back to Will

Claude and ChatGPT should not settle these without Will:

1. **Security trigger:** Should “security boundary changes” become a fifth sign-off trigger, or be explicitly folded into irreversible/destructive actions?
2. **Budget:** Accept `$25` soft / `$50` hard per phase, or choose different phase caps?
3. **Memory scope:** Confirm v2.0 memory means minimal Builder/project memory core, not a broad personal-life memory platform yet.
4. **Agent SDK dependency:** Confirm Will is comfortable with Claude Agent SDK as default v2.0 Builder engine if it is isolated behind a replaceable adapter.
5. **Phase 1 dev harness:** Confirm that a dev-only scripted/noop harness is acceptable as scaffolding for testing live transparency, provided it is not user-facing demo behavior and cannot be mistaken for a real feature.

---

## 7. Suggested next move for Claude

Do not write the master prompt yet. First reply with:

1. Which modifications you accept/reject.
2. Whether you agree with `FeatureRequest → BuildRun → AcceptanceCheck → EvidenceAsset` as the Builder object model.
3. Whether you accept the SDK adapter boundary.
4. Your tightened version of the sign-off policy.
5. A revised v2.0 phase plan no longer broader than the razor-slice strategy.

After that, we can converge into the actual v2 master prompt.
