# GROVER v2 — Iteration 6 Adversarial Review (ChatGPT → Claude)

**Date:** 2026-07-03/04  
**Scope reviewed:** `grover_v2_master_prompt_DRAFT.md` plus Iteration 5 handoff.  
**Verdict:** **MODIFY, then final. Do not reject.** The architecture is converged. I found no reason to reverse the execution-engine adapter, hybrid event/projection spine, DomainContract approach, evidence policy, five-trigger governance, cost governor, or memory-core scope. The remaining issues are spec-tightening problems that matter because an AI builder will exploit ambiguity by accident.

## Executive defects to fix before Iteration 7

### B1 — The draft references §14, but there is no §14. HIGH severity.

The top matter says, "Where this document is silent, the builder follows §14," and Iteration 5 explicitly says §14 handles uncovered sub-decisions. The draft ends at §13. This is not cosmetic. A builder could treat missing §14 as permission to improvise, or ignore the process rule entirely.

**Fix:** add §14 exactly, or change every §14 reference to §11.8. I recommend adding §14 because this issue is important enough to deserve its own section.

**Add after §13:**

```md
## 14. Interpretation, gaps, and uncovered sub-decisions

This document is the binding spec. No requirement may depend on reading planning iterations, chat transcripts, or archived v1 prompts unless the requirement is restated here.

When implementation requires a decision not explicitly covered here:

1. **Ask Will** if the decision changes scope, locked decisions, sign-off behavior, security boundaries, cost policy, memory policy, Jackson/privacy boundaries, public exposure, visual identity, or phase exit criteria.
2. **Derive and record** if the decision is a low-level implementation detail inside an already-approved requirement. Use first principles, prefer the boring robust option, and write the rationale in `DECISIONS.md`.
3. **Import as `PlanningProposal`** if the decision originates from Jackson's track, a red-team file, or any parallel planning source (§12).
4. **Never import hidden requirements** from `archive/grover_v1/`, earlier planning iterations, or model memory. Those sources may inform rationale only; they are not binding unless represented in this document.
5. **Escalate uncertainty** if the builder cannot determine whether a decision is implementation detail or scope/policy change. The escalation must include the exact unresolved question, affected sections, and the smallest safe default.
```

Then update the intro sentence to:

```md
Where this document is silent, the builder follows §14. Where §14 says to ask Will, the builder asks rather than inventing scope.
```

---

### B2 — §4.4 violates the "complete binding spec" claim by referencing "iteration 2 §4." HIGH severity.

The draft says schemas are "as specified in iteration 2 §4." That makes the master prompt non-standalone. The first page says this file is the complete binding build specification; §4.4 currently contradicts that.

**Fix:** replace the sentence beginning "Schemas as specified..." with inline minimum schemas. Do not make the builder chase planning files.

**Replace this paragraph:**

```md
Schemas as specified in iteration 2 §4 (fields for origin `will_direct | grover_self_initiated | imported`, status, sign-off, cost estimate/actual, linked runs/commits/memories; `AcceptanceCheck.check_type ∈ {unit, integration, playwright, visual, manual, security, cost, memory}`; `EvidenceAsset.type ∈ {screenshot, playwright_trace, dom_assertion, console_log, test_output, git_diff, commit, user_confirmation}` with `origin` and `trusted` fields). SQLite is authoritative for all of it.
```

**With:**

```md
SQLite is authoritative for all Builder objects. Minimum schemas:

- `FeatureRequest`: `id, title, description, origin(will_direct|grover_self_initiated|imported), domain, status(intake|planned|running|blocked|verifying|passed|failed|cancelled), created_by, created_at, updated_at, signoff_state(not_required|required|approved|denied), signoff_reason?, importance?, estimated_effort?, estimated_cost?, actual_cost?, active_build_run_id?, linked_commit_ids[], linked_memory_update_ids[]`.
- `BuildRun`: `id, feature_request_id, engine_id, branch_name, status(queued|running|paused|blocked|verifying|passed|failed|cancelled), current_phase, started_at, ended_at?, cost_estimate, actual_cost, failure_summary?, recovery_state?, receipt_id?`.
- `AcceptanceCheck`: `id, feature_request_id, build_run_id?, title, description, check_type(unit|integration|playwright|visual|manual|security|cost|memory|api_or_state|database), required_evidence_types[], status(pending|running|passed|failed|needs_manual_verification|amendment_requested), passes boolean default false, evidence_asset_ids[], one_off boolean default false, created_by, amended_by?, amendment_reason?`.
- `EvidenceAsset`: `id, build_run_id, acceptance_check_id?, type(screenshot|playwright_trace|dom_assertion|console_log|network_log|test_output|git_diff|commit|cost_receipt|state_capture|backup_restore_log|user_confirmation), verifier_origin(playwright|test_runner|git|cost_hook|db_check|backup_job|manual_confirmation|security_policy|system), trusted boolean, uri_or_path, summary, created_at, hash?`.
- `GitCommit`: `id, build_run_id, hash, branch_name, message, diff_summary, created_at`.
- `MemoryUpdateProposal`: `id, source_event_id, proposed_operation(create|update|supersede|delete), namespace, target_memory_id?, status(proposed|approved|rejected|applied), provenance, sensitivity, rationale, created_at, applied_at?`.

Additional fields may be added, but removing or weakening these fields requires a `DECISIONS.md` entry and may require Will sign-off if it affects evidence, memory, cost, or governance.
```

---

### B3 — "Direct prompts are instant approval" conflicts with the five sign-off triggers. HIGH severity unless clarified.

§2 says direct prompts from Will are instant approval, always. §6 says exactly five triggers escalate to Will, including money/security/destructive actions. Both ideas are correct, but the current wording lets a builder read "Will asked for it" as bypassing every trigger.

**Fix:** direct prompt should mean "approved to begin the requested work," not "permission to cross every boundary implied by that work." A direct prompt can count as sign-off only when it explicitly names the boundary-crossing action.

**Replace the opening of §6 with:**

```md
Default is full autonomy: Grover acts inside its lane without asking.

A direct prompt from Will is instant approval to begin and complete the requested work inside the current reversible/safe domain. It is also sufficient sign-off for a boundary-crossing action **only when the prompt explicitly names that action with enough specificity to execute it safely** — for example, "spend up to $20 on X," "delete file Y," or "add host Z to the allowlist." If a sign-off trigger is merely an implementation implication of a broader request, Grover pauses at the boundary and asks once with a compact memo. No generic confirmation dialogs; only trigger-specific sign-off prompts.

Exactly five triggers escalate to Will when not already explicitly approved:
```

This preserves "no approval friction" while avoiding catastrophic over-broad interpretation.

---

### B4 — P3 asks for a "memory/vault" reliability request before P4 builds memory. MEDIUM/HIGH severity.

The phase plan says P3 Builder reliability includes five diverse requests: UI-only, backend/API, memory/vault, settings/control, and negative/sign-off. But §8 memory core is built in P4. That lets the builder either (a) implement memory early and violate phase discipline, or (b) fake a memory/vault test before the memory system exists.

**Fix:** P3 can touch persistence/project-state, not memory core. Move real memory/vault testing to P4.

**Replace P3 with:**

```md
- **P3 — Builder reliability set.** Five diverse requests: UI-only, backend/API, settings/control, persistence/project-state, and a negative case where Builder must refuse or require sign-off. No broad memory-core feature may be built in P3. Exit: all five pass with evidence; regression suite seeded from each; mid-build crash recovery demonstrated.
```

Then P4 remains the memory phase.

---

### B5 — Event schema is close, but missing ordering/replay and taskless system events. MEDIUM severity.

§4.3 requires append-only events and reducers, but the schema has no monotonic sequence number and makes `task_id` required. Kill switch changes, budget changes, policy-registry changes, and backup-job events may be global/system events not naturally tied to a task. Reducers and SSE replay need strict ordering.

**Fix:** revise event schema.

**Replace the event schema line with:**

```md
- `events` — append-only, immutable. Minimum schema: `seq BIGINT AUTOINCREMENT, event_id, scope_type(task|build_run|feature_request|system|policy|budget|memory), scope_id?, task_id?, build_run_id?, parent_event_id?, idempotency_key, ts, actor(will|grover|engine|tool|system), domain?, phase(intake|planning|editing|verifying|blocked|done|failed|cancelled|policy|budget|memory|system), plain_language, internal_detail, evidence_ref?, cost_delta?, model_run_id?, signoff_state?`.
```

Add under rules:

```md
Reducers replay by `seq`, not timestamp. SSE clients resume from the last received `seq`. Any event that changes user-visible status, available actions, cost, policy, memory, or evidence must be reducible from the append-only log after restart.
```

---

### B6 — P0 says "architecture frozen" while "open decisions listed for Will." MEDIUM severity.

If open decisions remain, architecture is not frozen. If they are merely deferred, that should be explicit.

**Replace P0 exit with:**

```md
- **P0 — Decision lock + this master prompt finalized.** Exit: all decisions required for P1–P5 are resolved; any remaining open questions are explicitly marked post-v2.0 or assigned to a future `PlanningProposal`; Will approves the prompt.
```

---

### B7 — §10 UI requirements risk smuggling future UI scope into v2.0. MEDIUM severity.

"Draggable, expandable task widgets" and multiple theme palettes are valuable, but without a scope guard they can consume the Builder budget before the spine works. The UI requirements should bind architecture and minimum acceptance, not force full-polish feature work in P1.

**Fix:** add a v2.0 UI scope guard.

**Add at the end of §10.1:**

```md
For v2.0, these UI requirements apply only to the Command Center, Builder surfaces, task/build widgets, recovery cards, settings needed by visible controls, and the minimal memory surfaces required by §8. They may not be used to justify building future modules. Draggability and theme tokens must be architecturally supported from day one; full advanced customization may be deferred unless needed for the v2.0 acceptance tests.
```

---

## Per-section adversarial verdicts

## §1 — Identity, scope, and non-scope

**Verdict: MODIFY lightly.**

Good: v2.0 is constrained to Builder + minimal memory, with everything else explicitly non-scope.

Issue: "designed so these slot in later" can become scope creep. Add a sentence:

```md
"Designed so these slot in later" means schema and interface seams only; it does not authorize user-facing module work, placeholder dashboards, or fake "coming soon" experiences unless required by a v2.0 acceptance test.
```

Also keep "broad personal-life memory is v2.1" exactly as written. That line is important.

## §2 — Locked decisions

**Verdict: MODIFY because of direct-prompt/sign-off wording.**

Use B3's replacement logic. Do not weaken the five triggers. The "direct prompts from Will are instant approval" phrase must survive, but it needs the boundary-crossing clarification.

Also standardize evidence naming:

```md
ManualEngine evidence is stored as `EvidenceAsset.type = user_confirmation` with `verifier_origin = manual_confirmation`.
```

Right now §4.1 says evidence is recorded as `manual_confirmation`, while §4.4 lists `user_confirmation` as the evidence type. That inconsistency is small but exactly the kind of schema drift we are trying to prevent.

## §3 — Anti-patterns

**Verdict: MODIFY lightly.**

Claude asked whether the taxonomy is testable. Most of it is. Two lines need tightening:

1. **Jargon-first UI**: "Internal process vocabulary may not appear in user-facing surfaces" conflicts with "Active manager: Builder" and possible recovery/debug cards. Replace with:

```md
Primary user-facing surfaces may not lead with internal process vocabulary. Developer/debug surfaces and recovery cards may expose object names (`FeatureRequest`, `BuildRun`, etc.) only when paired with plain-language explanations.
```

2. **Invisible work**: "No model call ... may run without a live trace" is correct but needs a mechanical hook:

```md
Every model/tool call must create or update an event before the call starts and after it finishes. The trace may be compact for routing/classification, but it may not be absent.
```

This prevents the Context/App Manager classifier from becoming invisible.

## §4.1 — ExecutionEngine boundary

**Verdict: AGREE with one standardization.**

The adapter boundary is the right architecture. Keep it.

Change ManualEngine wording to avoid type/origin confusion:

```md
`ManualEngine` (recovery path: a human performs steps and attaches evidence recorded as `EvidenceAsset.type = user_confirmation`, `verifier_origin = manual_confirmation`; not a demo mode).
```

Also add:

```md
Engines may request state transitions, but only GROVER reducers may apply them.
```

This blocks "engine emitted done, projection accepted it" shortcuts.

## §4.2 — DomainContract / managerial hierarchy

**Verdict: MODIFY lightly.**

I accept stub lanes. They do not invite scope creep if they are internal contract rows, not user-facing modules.

Add this sentence after the stub-contract paragraph:

```md
Stub lanes in v2.0 are internal contracts and tests only; they may not create user-facing Research/Business/Quant/Lifestyle/Coding modules or dashboards.
```

Add one more lane-realness test:

```md
The routing test must show that a Coding-domain request routes away from Builder unless it is explicitly about GROVER's own source.
```

This preserves the Builder/Coding distinction from the original scope.

## §4.3 — Events/projections

**Verdict: MODIFY.**

Use B5. Add `seq`, support system events, and define replay. Otherwise, the state-store design is strong.

Also add a reducer invariant:

```md
Projection tables are disposable: deleting and rebuilding them from `events` must produce the same user-visible state except for intentionally non-replayable ephemeral connection metadata.
```

This makes "events are authoritative" testable.

## §4.4 — Builder object model

**Verdict: MODIFY.**

Use B2. The master prompt must inline schemas.

Also add one invariant:

```md
A FeatureRequest may be closed only when all non-one-off required AcceptanceChecks are `passed`, every `passed` check has trusted evidence, the BuildRun has a receipt, and any required sign-off is approved.
```

This makes closure mechanical.

## §5 — Evidence policy

**Verdict: MODIFY lightly.**

The evidence matrix is good. Tighten two loopholes:

1. For visual baselines, "explicit visual-review artifact" is too vague.

Replace:

```md
screenshot + baseline comparison (or explicit visual-review artifact)
```

with:

```md
screenshot + baseline comparison; if automated comparison is impossible, screenshot + human visual-review confirmation + reason automation was impossible
```

2. Add evidence quality rules:

```md
Screenshots must be stored as files, not pasted model descriptions. DOM assertions must include selector/locator, expected condition, and pass/fail output. Console/network scans must include counts and new/unexpected items, not just "clean."
```

This blocks shallow evidence like "screenshot attached" without a real artifact.

## §6 — Governance

**Verdict: MODIFY.**

Use B3. Also define non-allowlisted hosts:

```md
A host is allowlisted only if it appears in `PolicyRegistry` with exact method/scope, owner, origin approval, and review/expiry date. Domain-wide allowlists require Trigger 5 sign-off.
```

Add "secrets" to Trigger 2 or 5 explicitly:

```md
Any read/export/write of secret material outside the secret vault's approved access path is both a security-boundary event and destructive-risk event until proven otherwise.
```

Rationale: compromised Grover threat model includes API keys; don't rely on "secret vault" being interpreted broadly.

## §7 — Cost governor

**Verdict: MODIFY lightly.**

Good. Add a cost-estimation humility clause:

```md
Pre-call estimates are conservative estimates, not promises. If actual spend exceeds estimate due to provider behavior or tool retries, the post-call hook records the variance and the receipt explains it. Repeated estimate misses require a DECISIONS.md correction.
```

Add one P2/P3 practical acceptance test:

```md
A run that is cancelled mid-model/tool sequence must stop further spend where technically possible and mark any unavoidable already-incurred cost honestly.
```

The kill switch covers this globally; cancellation should cover ordinary runs too.

## §8 — Memory core

**Verdict: MODIFY.**

The scope is now narrow enough. Three changes:

1. Add an explicit namespace registry. Insert after §8.1:

```md
Minimum v2.0 namespaces: `will-private`, `jackson-private`, `shared-grover-dev`, `shared-home-tech`, `shared-business`, and reserved future life-domain namespaces. `jackson-private` exists only to fail closed in v2.0.
```

2. Tighten incidental write policy:

```md
In v2.0, incidental conversational facts default to `MemoryUpdateProposal`, not committed memory. The only incidental writes that may auto-commit are operational build facts produced by GROVER itself (BuildRun summaries, accepted decisions, receipts, verified corrections), and those still require provenance.
```

3. Add a forward-compatibility test to §8.6/P4:

```md
P4 must include a no-migration test proving that a seeded future life-domain namespace can exist, remain unread by Builder unless permitted, and pass through backup/export without special-case schema changes.
```

This is the minimum proof that v2.1 broad memory will not require surgery.

## §9 — Security

**Verdict: MODIFY lightly.**

Good as a v2.0 local-first security model. Add one sentence:

```md
Local-only mode is not a security bypass: secret handling, tool allowlists, audit logging, prompt-injection treatment, and kill-switch behavior must be implemented before deployment, not deferred to deployment.
```

Otherwise a builder could say Cloudflare is post-v2.0 and leave the local app dangerously permissive.

## §10 — UI identity

**Verdict: MODIFY.**

Use B7. Also make "taste" acceptance explicit:

```md
Visual taste requirements are not fully automatable. They require screenshot evidence and Will/Jackson visual review when a change affects the shell, orb adjacency, motion, theme tokens, or primary Builder layout.
```

This respects the "Will's claims aren't evidence" rule while acknowledging visual taste needs human judgment. The human judgment is not evidence that functionality works; it is acceptance for aesthetic requirements.

## §11 — Development process rules

**Verdict: MODIFY.**

Good section. Two fixes:

1. The "ask Will and wait" line in §11.1 can conflict with "no confirmation dialogs." Clarify it is only for verification-impossible cases:

```md
This manual-verification pause is allowed only when browser verification is impossible for a specific check, and the reason must be recorded.
```

2. Add branch discipline:

```md
Every BuildRun happens on a dedicated branch or worktree. Direct commits to `master/main` are forbidden except final merges after verification.
```

This was implicit in prior iterations but should be binding.

## §12 — Side-track proposal intake

**Verdict: AGREE with one addition.**

Good. Add a required rejection path:

```md
Rejected proposals must include the locked decision, phase exit, or design principle they conflicted with, so the same proposal does not reappear unresolved.
```

This will matter once Jackson's red-team/UI track starts producing files.

## §13 — Phase plan and Definitions of Done

**Verdict: MODIFY.**

Use B4 and B6.

Add P1 exit:

```md
Projection rebuild test passes: deleting projections and replaying `events` recreates the same task/build state.
```

Add P2 exit:

```md
The tiny real request must be chosen so it does not require security-boundary changes, external paid services, or memory-core functionality.
```

Add P5 exit:

```md
P5 also requires a deliberately failed build to produce a recovery card with changed files, reverted/not-reverted state, evidence collected, cost spent, and next safe action.
```

This recovery-card requirement exists in §10 but should be drilled in P5 explicitly.

## §14 — Missing section

**Verdict: ADD.**

Use B1. This is the only structural document issue I consider mandatory before final.

---

## Answers to Claude's five deliberate drafting-choice questions

### 1. Is §3 taxonomy untestable?

Mostly testable. "Sci-fi chrome" and "someone understands at a glance" are not fully automatable, but they are still valid requirements if paired with screenshot evidence and human visual review. The testable core is: no forbidden visual motifs in the final design notes/components, screenshots reviewed by Will/Jackson, and no primary UI labels leading with loop/run lifecycle jargon.

### 2. Do stub lanes invite scope creep?

Not if they are internal schema rows and negative tests only. Add the sentence I proposed in §4.2: no user-facing modules/dashboards for stub lanes in v2.0.

### 3. Is §8.6 forward compatibility sufficient?

Almost. The three bullets are right, but add the no-migration seeded future-namespace test. Without a test, "domain-agnostic" is just a claim.

### 4. Is "Will's claims are not evidence" respectful?

Yes. It reads firm, not insulting. Keep it. But distinguish human aesthetic acceptance and phase sign-off from functional evidence: Will can approve that he likes/accepts something, but his approval is not proof that the system behaved correctly.

### 5. Is §14 delegation too broad?

Currently impossible to evaluate because §14 is missing. With the added §14 above, the delegation is safe: low-level implementation details can be derived; scope/policy/security/cost/privacy/visual-identity decisions go to Will.

---

## Final recommendation for Iteration 7

Do not broaden the architecture. Do not add new platforms, modules, model providers, memory frameworks, or UI features.

Iteration 7 should be a cleanup pass that:

1. Adds §14.
2. Inlines §4.4 schemas.
3. Reconciles direct-prompt approval with sign-off triggers.
4. Removes P3's premature memory/vault request.
5. Adds event `seq`/system-event/replay mechanics.
6. Adds UI scope guard.
7. Standardizes manual evidence naming.

After those changes, the master prompt is strong enough for Will to approve P0.
