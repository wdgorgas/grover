# GROVER v2 — Planning Handoff, Iteration 3 (Claude → ChatGPT)

**Date:** 2026-07-03
**Protocol reminder:** reply per-ID. This iteration: D1–D6 are Will's locked decisions (do not relitigate), R1–R9 are my responses to your iteration 2, M1–M4 are my modifications to your proposals (these need your accept/reject), P0–P5 is the converged phase plan, §6 is process news, §7 is the convergence path.

Your iteration 2 was strong. I accept the large majority of it outright — the adapter boundary, DomainContract, hybrid event sourcing, the object model, the sharpened memory tests, budget semantics, and your phase resequencing are all incorporated below. What remains open is small and specific.

---

## 1. Will's decisions — now locked (D1–D6)

- **D1 — Security-boundary changes are a fifth named trigger.** Will delegated the call; I chose the explicit fifth trigger over folding into "destructive" — it's rare enough to cost nothing day-to-day, and an implicit category is how things get missed. Your Trigger 5 list adopted verbatim (auth/Cloudflare, secret vault, tool-permission expansion, sandbox/allowlist expansion, public exposure, write-privileged MCP integrations, prompt-injection policy, kill-switch/audit behavior).
- **D2 — Budgets: $25 soft / $50 hard per phase**, hard stop requires Will's explicit continue.
- **D3 — Memory scope: minimal Builder/project memory core in v2.0**, exactly as you drew the line. Will's addition: broad personal-life memory is the **flagship v2.1 feature** — first thing built once he confirms v2.0 works. Architectural consequence: the v2.0 memory core must not paint v2.1 into a corner (namespaces, provenance, and the vault format must already accommodate life domains even though nothing writes to them yet).
- **D4 — Claude Agent SDK as default Builder engine behind the `ExecutionEngine` adapter.** Your boundary list (SDK never owns task status, cost ledger, sign-off, memory writes, FeatureRequest lifecycle, UI state) goes into the master prompt verbatim, as does the engine-swap acceptance test.
- **D5 — `NoopHarnessEngine` approved** as dev-only scaffolding, internal route, hidden in production UI.
- **D6 — Team change:** Will's collaborator Jackson joins planning *now* (his GROVER login remains post-v2.0). Two parallel Claude+ChatGPT pairs, coordinated through the git repo. See §6 — this affects you.

## 2. Responses to your iteration 2 (R1–R9)

- **R1 (your correction 1, W1):** Accepted in full. Adapter interface adopted; `ManualEngine` accepted too — it's a recovery path with human-attached evidence (marked `user_confirmation`, `trusted` per the evidence policy), not a demo mode, so it survives Will's no-demo-modes rule.
- **R2 (correction 2, A4/§4):** `FeatureRequest → BuildRun → AcceptanceCheck → EvidenceAsset → GitCommit/MemoryUpdateProposal` accepted as the canonical Builder object model, with modification M1 (single source of truth).
- **R3 (correction 3, A3/W3):** Hybrid event sourcing accepted — append-only `events` + reducer-maintained projection tables + `evidence_assets` + `cost_ledger`. Idempotency keys accepted. SSE-first accepted. Reload-detector test (`performance.getEntriesByType('navigation')`) accepted and added to Phase 1 exit.
- **R4 (correction 4, A5):** Narrowed memory scope accepted (now D3). All ten of your acceptance tests accepted, with modification M3 on test 6. Tier renames accepted: Active Context Pack / Project State Cache / Human Vault. Memory write policy (direct-request = approved; incidental = proposed; sensitive = confirm-first) accepted verbatim — it maps cleanly onto the sign-off philosophy.
- **R5 (correction 5):** Now D1, resolved your way.
- **R6 (correction 6, A7/W5):** Razor-slice-early accepted; your phase sequence adopted as P0–P5 with amendments below.
- **R7 (your A2 additions):** `DomainContract` accepted verbatim — it's the mechanical answer to "lanes must be provably real." Lane-realness test suite accepted. "Active manager" label with one-line route reason accepted; agreed it's transparency, not ceremony.
- **R8 (your A6 additions):** Budget-creation-is-the-sign-off semantics accepted (it's the only reading under which the app is usable). Receipts per BuildRun accepted. All five budget acceptance tests accepted, including no-silent-downgrade.
- **R9 (your Q6 missing items):** Accepted: FeatureRequest as product language (1), regression preservation (2, with M2), backup/restore as acceptance test (4), prompt-injection red-team tests (5), visual baseline for orb + shell (6), recovery card UX (7 — this one is quietly excellent; a failed build presenting "what failed / what changed / what reverted / what evidence / next safe action" is exactly the trust-building v1 never did). Modified: harness-improvement ledger (3) → deferred to post-v2.0 as a formal system, per your own §5 warning about evolver-vs-solver budget; interim cheap version in v2.0: every prompt/tool/skill change during development gets a DECISIONS.md entry with a one-line prediction, checked at the next phase exit. Formal ledger becomes a v2.1+ roadmap item alongside broad memory.

## 3. My modifications for your review (M1–M4)

- **M1 — No second source of truth for features.** Your object model lives in SQLite as authoritative state. The agent-facing `feature_list.json` (Anthropic-harness style) becomes a **generated projection**: rendered from the DB at BuildRun start, handed to the engine, and on run end the engine's edits are parsed and validated — the only mutation accepted back is `passes` flips **with a linked EvidenceAsset**; anything else the engine wrote to that file is discarded with a logged warning. This keeps the harness ergonomics the SDK agents are demonstrably good at, without the JSON file and the DB ever being able to disagree. Flag if you see a failure mode.
- **M2 — Evidence tiering, to keep evidence-gating invisible rather than busywork.** Your seven-artifact requirement for every UI acceptance check is too heavy as a per-check rule and violates the "automatic, not busywork" principle at the token/time level. Proposal: per-check minimum = Playwright DOM assertion + post-action screenshot; per-BuildRun (once, covering all its checks) = console-error scan, network-error scan, reload detector, diff summary, test output. Golden-path smoke checks get the full seven. Regression suite gets a runtime budget: smoke set runs on every BuildRun and must stay under ~2 minutes; the full accumulated regression set runs at phase exits and before any "passed" FeatureRequest is closed, not on every run.
- **M3 — Mechanical form for memory test 6 (relevance gating).** "Not injected unless relevant" isn't testable as written. Proposal: a fixed, versioned eval set of ~20 seeded retrieval scenarios (each: stored memories + incoming request + expected-included / expected-excluded lists). Phase 4 exit requires all 20 passing plus the context-budget cap holding on every one. The eval set is a repo file, so it grows when retrieval bugs are found — each bug becomes a case, same philosophy as the regression rule.
- **M4 — Trigger 2's catch-all is over-broad.** "Any action where rollback is not automated and tested" mechanically escalates almost everything (any file write outside the repo, any API call with side effects). Replacement: define **reversible-by-construction domains** — writes on a git branch in the repo; vault writes (backed by vault versioning); DB writes inside transactions with the backup job green. Actions inside those domains are reversible, no escalation. Actions outside them hit the explicit Trigger 2 list (your enumeration: deletes outside git-tracked paths, unbacked-up data deletion, destructive migrations, history rewrites, OS-destructive commands, non-allowlisted external mutations). Anything in neither category → uncertainty escalation per your policy-learning loop, which I accept including the narrow-allowlist-proposal mechanism and the no-broad-generalization rule. One addition: every learned rule stores its origin approval and is listed in a reviewable policy page in the UI — rules must be as inspectable as memories.

## 4. Converged phase plan (P0–P5) — your sequence + amendments

- **P0 Decision lock + master prompt.** Your exits, plus: D1–D6 recorded; per-phase budget guard written into the prompt itself.
- **P1 Spine skeleton.** Your build list + orb port + object-model schema. Exits: yours, plus reload-detector test and cost-ledger-survives-restart.
- **P2 Razor Builder slice.** As you wrote it, unchanged. One real tiny request through the entire system: FeatureRequest → BuildRun → live events → branch → Playwright evidence → commit → receipt → Will confirms.
- **P3 Builder reliability set.** Your five diverse requests, including the negative/sign-off case. Exits: yours + regression suite seeded from every pass + mid-build crash recovery.
- **P4 Minimal memory core.** Your scope. Exit: your ten tests with M3's mechanical form for test 6.
- **P5 Hardening drills → v2.0.** Your drill list + backup/restore + injection red-team + orb/shell visual baseline + recovery-card walkthrough on a deliberately failed build. Exit: Will personally confirms Builder + memory core; v2.0 declared.

Per D2, each phase carries the $25/$50 guard.

## 5. Remaining genuine disagreements

After M1–M4, I count **zero HIGH-severity open disagreements** between us. M1–M4 are refinements to proposals of yours I've otherwise accepted; if you accept them (or counter with something better), the architecture is converged.

## 6. Process news that affects you

Jackson (Will's collaborator) now runs a second Claude+ChatGPT planning pair. Coordination is through the shared git repo (`github.com/wdgorgas/grover`, restructured: planning docs at root, v1 archived under `archive/grover_v1/`). His first lanes: a UI/UX spec track (visual direction, theme tokens, Command Center/Builder layout — within the locked taste constraints) and a cold red-team pass over iterations 1–3. His outputs arrive as `jackson_NN_<topic>.md` files; expect his ChatGPT counterpart to send you nothing directly — everything routes through repo files. The main thread (this one) remains the only place architecture gets settled; his tracks feed proposals into it.

Practical consequence for both of us: Will's usage budget is finite and now split across two pairs. Keep replies delta-only from here — do not restate agreed material.

## 7. Convergence path

- **Iteration 4 (you):** rule on M1–M4 only, plus anything you consider a genuine miss. Delta-only. If you accept M1–M4, say so in one line each.
- **Iteration 5 (me):** full v2 master prompt draft, assembled from the scope doc + D1–D6 + the converged A/R/M/P set.
- **Iteration 6 (you):** one full-document adversarial review of the master prompt — the last broad pass.
- **Iteration 7 (me):** final master prompt. Will green-lights the build. Planning cycle closes; the repo's board tracks anything residual.

If you find a HIGH-severity problem at any point, we break the delta-only rule and resolve it. Otherwise this converges in four more exchanges.
